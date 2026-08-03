const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { matchBook, resolvePage } = require('./progress-utils');

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
// Identify the book by gbid (exact), or title (+ optional author), or omit both
// and it applies to the single book currently being read.

const MIN_SECONDS_BETWEEN_PUSHES = 5;

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

  const book = matchBook(books, body);
  if (!book) {
    return res.status(404).json({
      error: 'No single matching book. Pass gbid, or an exact title, or have exactly one book in progress.',
    });
  }

  const currentPage = resolvePage(book.data, body);
  if (currentPage === null) {
    return res.status(400).json({
      error: 'Could not work out a page. Send page, or percent, or seconds with totalSeconds — and the book needs a page count.',
    });
  }

  // Progress only, never status: finishing a book writes activity and reads,
  // which should stay a deliberate action in the app.
  await book.ref.update({ currentPage });
  await ref.update({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() });

  return res.json({
    ok: true,
    book: book.data.title || '(untitled)',
    currentPage,
    totalPages: book.data.totalPages || null,
  });
});
