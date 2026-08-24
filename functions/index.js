const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { matchBook, resolveProgress, pickBestHit, normaliseTitle } = require('./progress-utils');

admin.initializeApp();

exports.adminChangePassword = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const callerDoc = await admin.firestore()
    .collection('users').doc(request.auth.uid).get();
  if (!callerDoc.data()?.isAdmin) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }

  const { uid, password } = request.data;
  if (!uid || !password) {
    throw new HttpsError('invalid-argument', 'uid and password are required.');
  }
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  }

  await admin.auth().updateUser(uid, { password });
  return { success: true };
});

// ── Progress sync ─────────────────────────────────────────────────────────────
//
// An inbox for reading progress pushed from wherever the user actually reads.
// Nothing here reaches out to Kindle, Kobo or anyone else — a script on the
// user's side does the reading and posts here, so no third-party credentials
// are ever stored.
//
//   POST /syncProgress
//   Authorization: Bearer <sync token>
//   { "title": "The Employees", "percent": 62 }
//
// Identify the book by gbid (exact) or title (+ author when two share a title).
// A title that isn't in the library yet is looked up on Hardcover and added as
// currently reading, so starting a book on a device is enough to see it here.

const MIN_SECONDS_BETWEEN_PUSHES = 5;
const HARDCOVER_PROXY = 'https://frosty-paper-e53b.phixel66.workers.dev/';

async function hcQuery(query, variables) {
  const res = await fetch(HARDCOVER_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Hardcover HTTP ${res.status}`);
  return res.json();
}

// Metadata for a book about to be added. Without this the entry would carry no
// cover and no page count — and with no page count a percentage cannot be
// turned into a page at all, so the first push would add a book and then fail.
async function lookupBook({ title, author }) {
  // Title only, deliberately. Appending the author sinks the real book:
  // companion editions are literally titled "<Title> by <Author>", so the
  // author's name boosts them above the novel. The author is used to rank the
  // results instead. 20 rather than 5 because the real edition can sit well
  // down the list behind essays and study aids.
  const search = await hcQuery(
    `query($q:String!){search(query:$q,query_type:"Book",per_page:20){results}}`,
    { q: String(title).trim() }
  );
  const doc = pickBestHit(search?.data?.search?.results?.hits, title, author);
  if (!doc) return null;

  // Second call for canonical_id: the search index does not expose it, and it
  // is what groups translations and reissues into one work.
  let workId = null;
  try {
    const works = await hcQuery(
      `query($slug:String!){books(where:{slug:{_eq:$slug}},limit:1){id canonical_id}}`,
      { slug: doc.slug }
    );
    const hc = works?.data?.books?.[0];
    const id = hc?.canonical_id ?? hc?.id;
    if (id != null) workId = `hc:${id}`;
  } catch (err) {
    logger.warn('Work id lookup failed', err);
  }

  return {
    title:       doc.title || title,
    author:      Array.isArray(doc.author_names) ? (doc.author_names[0] || '') : (doc.author_names || author || ''),
    gbid:        doc.slug,
    coverUrl:    doc.image?.url || '',
    totalPages:  doc.pages || 0,
    releaseYear: doc.release_year || null,
    workId,
  };
}

// Mirrors addBook() in js/firebase.js, including the 'started' activity event,
// so a book that arrives by sync is indistinguishable from one added in the app.
async function addReadingBook(db, uid, username, meta, pushedTitle, defaultLanguage) {
  const bookData = {
    title:            meta.title,
    author:           meta.author || '',
    totalPages:       meta.totalPages || 0,
    currentPage:      0,
    status:           'reading',
    gbid:             meta.gbid || '',
    addedAt:          admin.firestore.FieldValue.serverTimestamp(),
    addedAtPrecision: 'day',
    // ?? not ||: an empty string is a reader who has chosen to have no default
    // language, which is different from having never set one.
    language:         defaultLanguage ?? 'English',
    // What the device calls it. Hardcover's title is often longer, so without
    // this the next push would fail to match and add the book all over again.
    syncTitles:       [normaliseTitle(pushedTitle)],
  };
  if (meta.workId)      bookData.workId      = meta.workId;
  if (meta.coverUrl)    bookData.coverUrl    = meta.coverUrl;
  if (meta.releaseYear) bookData.releaseYear = meta.releaseYear;

  const bookRef = await db.collection('users').doc(uid).collection('books').add(bookData);
  await db.collection('activity').add({
    uid,
    username:    username || '',
    type:        'started',
    bookId:      bookRef.id,
    bookTitle:   bookData.title,
    bookAuthor:  bookData.author,
    gbid:        bookData.gbid,
    coverUrl:    meta.coverUrl || '',
    currentPage: 0,
    totalPages:  bookData.totalPages,
    timestamp:   admin.firestore.FieldValue.serverTimestamp(),
  });
  return { id: bookRef.id, ref: bookRef, data: bookData };
}

// London. Worth keeping in step with the Firestore location rather than with
// where users are: one push is a single request from the script, but four
// Firestore round trips from here, so proximity to the database dominates.
const REGION = 'europe-west2';

exports.syncProgress = onRequest({ cors: false, region: REGION }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const auth  = req.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Missing bearer token.' });

  const db  = admin.firestore();
  const ref = db.collection('syncTokens').doc(token);
  const snap = await ref.get();
  if (!snap.exists) return res.status(401).json({ error: 'Unknown token.' });
  const { uid, lastUsedAt } = snap.data();
  if (!uid) return res.status(401).json({ error: 'Malformed token.' });

  const sinceLast = lastUsedAt ? (Date.now() - lastUsedAt.toMillis()) / 1000 : Infinity;
  if (sinceLast < MIN_SECONDS_BETWEEN_PUSHES) {
    return res.status(429).json({ error: 'Too many updates. Wait a few seconds.' });
  }

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const booksSnap = await db.collection('users').doc(uid).collection('books').get();
  const books = booksSnap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() }));

  let book = matchBook(books, body);
  let added = false;

  // Not in the library yet: add it as currently reading rather than rejecting.
  // Starting a book on a Kobo and having it appear here is the point.
  if (!book) {
    if (!body.title) {
      return res.status(400).json({
        error: 'Send a title (or a gbid that is already in your library).',
      });
    }
    let meta;
    try {
      meta = await lookupBook(body);
    } catch (err) {
      logger.error('Hardcover lookup failed', err);
      return res.status(502).json({ error: 'Could not reach Hardcover to look the book up.' });
    }
    if (!meta) {
      return res.status(404).json({ error: `No book found on Hardcover for "${body.title}".` });
    }
    // Check the position is usable *before* creating anything, or a push with
    // no usable position leaves a stray book behind and then reports failure.
    if (resolveProgress(meta, body) === null) {
      return res.status(400).json({
        error: 'Could not work out a position, so nothing was added. Send page, or percent, or seconds with totalSeconds.',
      });
    }
    const userSnap = await db.collection('users').doc(uid).get();
    book = await addReadingBook(db, uid, userSnap.data()?.username, meta, body.title, userSnap.data()?.defaultLanguage);
    added = true;
  }

  const progress = resolveProgress(book.data, body);
  if (progress === null) {
    return res.status(400).json({
      error: 'Could not work out a position. Send page, or percent, or seconds with totalSeconds — and a percentage needs the book to have a page count.',
    });
  }

  // Progress only, never status: finishing a book writes activity and reads,
  // which should stay a deliberate action in the app.
  await book.ref.update(progress);
  await ref.update({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() });

  return res.json({
    ok: true,
    book: book.data.title || '(untitled)',
    added,
    ...progress,
    totalPages: progress.progressPct === undefined ? (book.data.totalPages || null) : undefined,
  });
});
