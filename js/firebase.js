import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  arrayUnion,
  arrayRemove,
  Timestamp,
  serverTimestamp,
  collection,
  addDoc,
  getDocs,
  getCountFromServer,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { compareLists } from './utils.js';
import { viewerSeesOnlyPublic, planWorkMerge, dupeGroupsForSlug, sameBook, resolveBookLanguage } from './book-utils.js';

// ── Config ───────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyBExnP_07GT_hP8olJbHhlWKvNMIxG75r0",
  authDomain:        "reading-log-ba9a5.firebaseapp.com",
  projectId:         "reading-log-ba9a5",
  storageBucket:     "reading-log-ba9a5.firebasestorage.app",
  messagingSenderId: "31148199647",
  appId:             "1:31148199647:web:a96cfe745add1640d1a36a"
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = initializeFirestore(app, { experimentalForceLongPolling: true });

// Base URL of the app, works on any host (GitHub Pages, localhost, etc.)
export const ROOT = new URL('..', import.meta.url).href;

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function signUp(username, password, displayName, email) {
  if (!/^[a-z0-9_]{3,16}$/.test(username)) {
    throw new Error('Username must be 3–16 characters: lowercase letters, numbers, underscores.');
  }
  if (!displayName?.trim()) throw new Error('Please enter a display name.');
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('Please enter a valid email address.');
  }
  const taken = await getDoc(doc(db, 'usernames', username));
  if (taken.exists()) throw new Error('That username is already taken.');

  const authEmail = email.trim().toLowerCase();
  const cleanDisplayName = displayName.trim().toLowerCase();
  const cred = await createUserWithEmailAndPassword(auth, authEmail, password);
  const uid  = cred.user.uid;

  await Promise.all([
    setDoc(doc(db, 'users', uid),          { username, displayName: cleanDisplayName, createdAt: serverTimestamp(), following: [] }),
    setDoc(doc(db, 'usernames', username), { uid, authEmail }),
    updateProfile(cred.user, { displayName: cleanDisplayName }),
  ]);

  await sendEmailVerification(cred.user, { url: ROOT + 'login/' });
  return cred.user;
}

export async function signIn(usernameOrEmail, password) {
  let authEmail;
  if (usernameOrEmail.includes('@')) {
    authEmail = usernameOrEmail.trim().toLowerCase();
  } else {
    const snap = await getDoc(doc(db, 'usernames', usernameOrEmail.toLowerCase()));
    if (!snap.exists()) throw new Error('No account found with that username.');
    authEmail = snap.data().authEmail || `${usernameOrEmail}@readinglog.local`;
  }
  const cred = await signInWithEmailAndPassword(auth, authEmail, password);
  if (!cred.user.emailVerified && !authEmail.endsWith('@readinglog.local')) {
    await fbSignOut(auth);
    const err = new Error('Please verify your email before signing in.');
    err.code = 'auth/email-not-verified';
    throw err;
  }
  return cred;
}

export async function resetPassword(usernameOrEmail) {
  let authEmail;
  if (usernameOrEmail.includes('@')) {
    authEmail = usernameOrEmail.trim().toLowerCase();
  } else {
    const snap = await getDoc(doc(db, 'usernames', usernameOrEmail.toLowerCase()));
    if (!snap.exists()) throw new Error('No account found with that username.');
    authEmail = snap.data().authEmail || `${usernameOrEmail}@readinglog.local`;
  }
  if (authEmail.endsWith('@readinglog.local')) {
    throw new Error('This account has no email address. Add one in settings first.');
  }
  await sendPasswordResetEmail(auth, authEmail, { url: ROOT + 'login/' });
}

export async function resendVerificationEmail(usernameOrEmail, password) {
  let authEmail;
  if (usernameOrEmail.includes('@')) {
    authEmail = usernameOrEmail.trim().toLowerCase();
  } else {
    const snap = await getDoc(doc(db, 'usernames', usernameOrEmail.toLowerCase()));
    if (!snap.exists()) throw new Error('No account found with that username.');
    authEmail = snap.data().authEmail;
  }
  if (!authEmail || authEmail.endsWith('@readinglog.local')) throw new Error('This account does not require email verification.');
  const cred = await signInWithEmailAndPassword(auth, authEmail, password);
  await sendEmailVerification(cred.user, { url: ROOT + 'login/' });
  await fbSignOut(auth);
}

export async function changeUsername(uid, oldUsername, newUsername) {
  if (!/^[a-z0-9_]{3,16}$/.test(newUsername)) {
    throw new Error('Username must be 3–16 characters: lowercase letters, numbers, underscores.');
  }
  const taken = await getDoc(doc(db, 'usernames', newUsername));
  if (taken.exists()) throw new Error('That username is already taken.');

  // Carry the stored authEmail forward so sign-in keeps working.
  const oldSnap   = await getDoc(doc(db, 'usernames', oldUsername));
  const authEmail = oldSnap.data()?.authEmail || `${oldUsername}@readinglog.local`;

  await Promise.all([
    setDoc(doc(db, 'usernames', newUsername), { uid, authEmail }),
    deleteDoc(doc(db, 'usernames', oldUsername)),
    updateDoc(doc(db, 'users', uid), { username: newUsername }),
  ]);
}

export function logOut() {
  localStorage.removeItem('rl_profile');
  return fbSignOut(auth);
}

export async function addEmailToAccount(user, username, newEmail, password) {
  if (!newEmail?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
    throw new Error('Please enter a valid email address.');
  }
  const email = newEmail.trim().toLowerCase();
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
  await verifyBeforeUpdateEmail(user, email, { url: ROOT + 'login/' });
  await updateDoc(doc(db, 'usernames', username), { authEmail: email });
  localStorage.removeItem('rl_profile');
  await fbSignOut(auth);
}


export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function getProfileByUsername(username) {
  const snap = await getDoc(doc(db, 'usernames', username.toLowerCase()));
  if (!snap.exists()) return null;
  const uid      = snap.data().uid;
  const userSnap = await getDoc(doc(db, 'users', uid));
  return userSnap.exists() ? { uid, ...userSnap.data() } : null;
}

// Reconstructs missing Firestore profile data from the Firebase Auth email.
// Safe to run on healthy accounts — merge: true never overwrites existing fields.
export async function repairProfile(user) {
  const username = user.email.replace('@readinglog.local', '');
  const uid      = user.uid;
  await Promise.all([
    setDoc(doc(db, 'users',     uid),      { username }, { merge: true }),
    setDoc(doc(db, 'usernames', username), { uid },      { merge: true })
  ]);
  const snap = await getDoc(doc(db, 'users', uid));
  return { uid, ...snap.data() };
}

async function getProfilesByUids(uids) {
  if (!uids.length) return [];
  const snaps = await Promise.all(uids.map(id => getDoc(doc(db, 'users', id))));
  return snaps.filter(s => s.exists()).map(s => ({ uid: s.id, ...s.data() }));
}

export async function getFollowing(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return [];
  // fall back to old 'friends' field for accounts created before the migration
  const uids = snap.data().following || snap.data().friends || [];
  return getProfilesByUids(uids);
}

// Friends-of-friends: people followed by people uid follows, excluding uid
// itself and anyone uid already follows. Ranked by how many of uid's
// followees follow them, most mutual connections first.
const SUGGESTED_FOLLOWS_LIMIT = 10;
const SUGGESTED_FOLLOWS_MIN_MUTUAL = 2;

export async function getSuggestedFollows(uid) {
  const following = await getFollowing(uid);
  const exclude = new Set(following.map(f => f.uid));
  exclude.add(uid);

  const theirFollowingLists = await Promise.all(following.map(f => getFollowing(f.uid)));
  const suggestions = new Map(); // uid -> { profile, mutualCount }
  for (const list of theirFollowingLists) {
    for (const profile of list) {
      if (exclude.has(profile.uid)) continue;
      const existing = suggestions.get(profile.uid);
      if (existing) existing.mutualCount++;
      else suggestions.set(profile.uid, { profile, mutualCount: 1 });
    }
  }

  return Array.from(suggestions.values())
    .filter(s => s.mutualCount >= SUGGESTED_FOLLOWS_MIN_MUTUAL)
    .sort((a, b) => b.mutualCount - a.mutualCount)
    .slice(0, SUGGESTED_FOLLOWS_LIMIT)
    .map(({ profile, mutualCount }) => ({ ...profile, mutualCount }));
}

export async function getFollowers(uid) {
  // Compute followers by querying who has this uid in their following array.
  // This avoids cross-user writes entirely — no special Firestore rules needed.
  const q    = query(collection(db, 'users'), where('following', 'array-contains', uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// How many people follow this uid, without pulling their profiles back.
//
// Same query as getFollowers, but a server-side count: a page of search results
// asks for ten of these at once, and the follower documents are never used.
export async function getFollowerCount(uid) {
  const snap = await getCountFromServer(
    query(collection(db, 'users'), where('following', 'array-contains', uid))
  );
  return snap.data().count;
}

export async function followUser(currentUid, targetUsername) {
  const lower = targetUsername.toLowerCase();
  const usernameSnap = await getDoc(doc(db, 'usernames', lower));
  if (!usernameSnap.exists()) throw new Error('No user found with that username.');

  const targetUid = usernameSnap.data().uid;
  if (targetUid === currentUid) throw new Error('You cannot follow yourself.');

  const [mySnap, targetSnap] = await Promise.all([
    getDoc(doc(db, 'users', currentUid)),
    getDoc(doc(db, 'users', targetUid)),
  ]);
  const alreadyFollowing = (mySnap.data()?.following || mySnap.data()?.friends || []).includes(targetUid);
  if (alreadyFollowing) throw new Error('You already follow this person.');

  const targetData = targetSnap.data() || {};
  await Promise.all([
    updateDoc(doc(db, 'users', currentUid), { following: arrayUnion(targetUid) }),
    addDoc(collection(db, 'activity'), {
      uid:               currentUid,
      username:          mySnap.data()?.username || '',
      type:              'followed',
      targetUid,
      targetUsername:    targetData.username || lower,
      targetAvatarUrl:   targetData.avatarUrl || null,
      targetBorderColor: targetData.avatarBorderColor || null,
      timestamp:         serverTimestamp(),
    }),
  ]);
  return { uid: targetUid, ...targetSnap.data() };
}

export async function unfollowUser(currentUid, targetUid) {
  const actSnap = await getDocs(query(
    collection(db, 'activity'),
    where('uid', '==', currentUid),
    where('type', '==', 'followed'),
    where('targetUid', '==', targetUid)
  ));
  await Promise.all([
    updateDoc(doc(db, 'users', currentUid), { following: arrayRemove(targetUid) }),
    ...actSnap.docs.map(d => deleteDoc(d.ref)),
  ]);
}

export async function removeFollower(myUid, followerUid) {
  const actSnap = await getDocs(query(
    collection(db, 'activity'),
    where('uid', '==', followerUid),
    where('type', '==', 'followed'),
    where('targetUid', '==', myUid)
  ));
  await Promise.all([
    updateDoc(doc(db, 'users', followerUid), { following: arrayRemove(myUid) }),
    ...actSnap.docs.map(d => deleteDoc(d.ref)),
  ]);
}

export function updateAvatarUrl(uid, dataUrl) {
  return updateDoc(doc(db, 'users', uid), { avatarUrl: dataUrl });
}

export function updateShelf(uid, items) {
  return updateDoc(doc(db, 'users', uid), { shelf: items });
}

export function updateAvatarBorderColor(uid, color) {
  return updateDoc(doc(db, 'users', uid), { avatarBorderColor: color || deleteField() });
}

export function updateDisplayName(uid, name) {
  const clean = name ? name.trim().toLowerCase() : '';
  return updateDoc(doc(db, 'users', uid), { displayName: clean || deleteField() });
}

export function updateBio(uid, bio) {
  return updateDoc(doc(db, 'users', uid), { bio: bio || deleteField() });
}

// ── Author country overrides ─────────────────────────────────────────────────
const OVERRIDES_DOC = () => doc(db, 'config', 'authorCountryOverrides');

export async function getAuthorCountryOverrides() {
  const snap = await getDoc(OVERRIDES_DOC());
  return snap.exists() ? (snap.data().overrides || {}) : {};
}

export async function setAuthorCountryOverride(author, country) {
  const key = author.toLowerCase().trim();
  await setDoc(OVERRIDES_DOC(), { overrides: { [key]: country } }, { merge: true });
}

export async function deleteAuthorCountryOverride(author) {
  const key = author.toLowerCase().trim();
  await updateDoc(OVERRIDES_DOC(), { [`overrides.${key}`]: deleteField() });
}

// ── Progress sync token ───────────────────────────────────────────────────────
//
// The token is the id of a doc in `syncTokens`, which nobody can read — the
// syncProgress function looks it up with the admin SDK. A copy is kept under
// the user's own private subcollection so the app can show it again; the parent
// user doc is readable by every signed-in user and would leak it.

const SYNC_DOC = uid => doc(db, 'users', uid, 'private', 'sync');

export async function getSyncToken(uid) {
  const snap = await getDoc(SYNC_DOC(uid));
  return snap.exists() ? (snap.data().token || null) : null;
}

export async function createSyncToken(uid) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const existing = await getSyncToken(uid);
  await setDoc(doc(db, 'syncTokens', token), { uid, createdAt: serverTimestamp() });
  await setDoc(SYNC_DOC(uid), { token, createdAt: serverTimestamp() });
  // Retire the old one only once the new one is live, so a failure part-way
  // leaves the user with a working token rather than none.
  if (existing) await deleteDoc(doc(db, 'syncTokens', existing)).catch(() => {});
  return token;
}

export async function revokeSyncToken(uid) {
  const existing = await getSyncToken(uid);
  if (existing) await deleteDoc(doc(db, 'syncTokens', existing)).catch(() => {});
  await deleteDoc(SYNC_DOC(uid)).catch(() => {});
}

// ── Book remaps ───────────────────────────────────────────────────────────────
//
// A remap says "this Hardcover record should always be treated as that one":
// a study guide standing in for the real book, or an edition that duplicates a
// work already in the catalogue. Applying a remap fixes existing libraries;
// storing it here also makes search substitute the target from then on, so
// searching "De ansatte" surfaces "The Employees".

const REMAPS_DOC = () => doc(db, 'config', 'bookRemaps');

let remapCache = null;

export async function getBookRemaps({ force = false } = {}) {
  if (remapCache && !force) return remapCache;
  try {
    const snap = await getDoc(REMAPS_DOC());
    remapCache = snap.exists() ? (snap.data().remaps || {}) : {};
  } catch {
    remapCache = {};   // search must still work if the config read fails
  }
  return remapCache;
}

// `target` carries enough metadata for search to render the substitute without
// a second round trip: { slug, title, author, coverUrl, releaseYear }.
export async function setBookRemap(fromSlug, target) {
  const key = String(fromSlug).trim();
  if (!key || !target?.slug) throw new Error('A remap needs a source slug and a target.');
  await setDoc(REMAPS_DOC(), { remaps: { [key]: target } }, { merge: true });
  remapCache = null;
}

export async function deleteBookRemap(fromSlug) {
  await updateDoc(REMAPS_DOC(), { [`remaps.${String(fromSlug).trim()}`]: deleteField() });
  remapCache = null;
}

// Country name remaps, e.g. "Castile" -> "Spain". Historic and regional names
// that normalizeCountry's built-in table does not know, editable by an admin
// without a deploy.
//
// Applied where a country is written rather than where it is read, which is how
// normalizeCountry is already used — so a new remap takes effect on books added
// from then on, and on existing ones the next time Repair runs.

const COUNTRY_REMAPS_DOC = () => doc(db, 'config', 'countryRemaps');

let countryRemapCache = null;

export async function getCountryRemaps({ force = false } = {}) {
  if (countryRemapCache && !force) return countryRemapCache;
  try {
    const snap = await getDoc(COUNTRY_REMAPS_DOC());
    countryRemapCache = snap.exists() ? (snap.data().remaps || {}) : {};
  } catch {
    countryRemapCache = {};   // adding a book must not fail on a config read
  }
  return countryRemapCache;
}

export async function setCountryRemap(from, to) {
  const key    = String(from).trim().toLowerCase();
  const target = String(to).trim();
  if (!key || !target) throw new Error('A country remap needs both a name and a target.');
  // Nested data, not a field path, so a dot in the name is just a character.
  await setDoc(COUNTRY_REMAPS_DOC(), { remaps: { [key]: target } }, { merge: true });
  countryRemapCache = null;
}

export async function deleteCountryRemap(from) {
  const key    = String(from).trim().toLowerCase();
  const snap   = await getDoc(COUNTRY_REMAPS_DOC());
  const remaps = snap.exists() ? { ...(snap.data().remaps || {}) } : {};
  delete remaps[key];
  // Rewritten whole rather than with deleteField(): a country name can carry a
  // dot ("St. Kitts"), and a dotted key in a field path means something else.
  await setDoc(COUNTRY_REMAPS_DOC(), { remaps });
  countryRemapCache = null;
}

export async function updateBookCover(uid, bookId, coverUrl, { gbid, title } = {}) {
  await updateDoc(doc(db, 'users', uid, 'books', bookId), { coverUrl });
  const docs = await activityDocsForBook(uid, { bookId, gbid, title });
  if (docs.length) await Promise.all(docs.map(d => updateDoc(d.ref, { coverUrl })));
}

async function activityDocsForBook(uid, { bookId, gbid, title, author }) {
  if (bookId) {
    const snap = await getDocs(query(collection(db, 'activity'), where('uid', '==', uid), where('bookId', '==', bookId)));
    if (snap.docs.length) return snap.docs;
  }
  // Legacy fallback: activity docs written before bookId was tracked on them.
  const snap = await getDocs(query(collection(db, 'activity'), where('uid', '==', uid)));
  return snap.docs.filter(d => {
    const data = d.data();
    if (data.bookId) return false; // already covered by the indexed query above
    return (gbid && data.gbid === gbid) || (data.bookTitle === title && data.bookAuthor === author);
  });
}

// language: the importer's default, applied to rows that carry none of their
// own. Undefined falls back to English, matching every book added before the
// setting existed.
export async function importBooks(uid, books, onProgress, language) {
  const col = collection(db, 'users', uid, 'books');
  for (let i = 0; i < books.length; i += 20) {
    await Promise.all(books.slice(i, i + 20).map(b => {
      const data = { ...b };
      if (!data.addedAt)  data.addedAt  = serverTimestamp();
      if (!data.language) {
        const fallback = resolveBookLanguage(language);
        if (fallback) data.language = fallback;
      }
      return addDoc(col, data);
    }));
    if (onProgress) onProgress(Math.min(i + 20, books.length), books.length);
  }
}

// ── Books ─────────────────────────────────────────────────────────────────────

export async function getBookCount(uid) {
  const snap = await getCountFromServer(collection(db, 'users', uid, 'books'));
  return snap.data().count;
}

export async function getBooks(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'books'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getFinishedBooks(uid) {
  const snap = await getDocs(query(collection(db, 'users', uid, 'books'), where('status', '==', 'finished')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getReadingBooks(uid) {
  const snap = await getDocs(query(collection(db, 'users', uid, 'books'), where('status', '==', 'reading')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getRecentlyFinishedBooks(uid) {
  const snap = await getDocs(query(
    collection(db, 'users', uid, 'books'),
    where('status', '==', 'finished')
  ));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.finishedAt?.seconds ?? 0) - (a.finishedAt?.seconds ?? 0));
}

export async function addFinishedBook(uid, { title, author, totalPages, gbid, workId, isbn13, coverUrl, rating, review, releaseYear, country, authorGender, genres, language, format, finishedAt, finishedAtPrecision, addedAt, addedAtPrecision }, username) {
  const data = {
    title,
    author:      author || '',
    totalPages:  totalPages || 0,
    currentPage: totalPages || 0,
    status:      'finished',
    gbid:        gbid || '',
    addedAt:     addedAt || serverTimestamp(),
    // ?? not ||: the caller passing '' is someone who has chosen to have no
    // default language, which is different from not passing one at all.
    language:    resolveBookLanguage(language)
  };
  if (finishedAt)          data.finishedAt          = finishedAt;
  if (finishedAtPrecision) data.finishedAtPrecision = finishedAtPrecision;
  if (addedAt && addedAtPrecision) data.addedAtPrecision = addedAtPrecision;
  if (workId)         data.workId         = workId;
  if (isbn13)         data.isbn13         = isbn13;
  if (coverUrl)       data.coverUrl       = coverUrl;
  if (rating != null) data.rating         = rating;
  if (review)         data.review         = review;
  if (releaseYear)    data.releaseYear    = releaseYear;
  if (country)        data.country        = country;
  if (authorGender)   data.authorGender   = authorGender;
  if (genres?.length) data.genres         = genres;
  if (format)         data.format         = format;
  data.reads = [{
    startedAt:           addedAt instanceof Date ? Timestamp.fromDate(addedAt) : (addedAt?.toDate ? Timestamp.fromDate(addedAt.toDate()) : null),
    startedAtPrecision:  addedAt ? (addedAtPrecision || null) : null,
    finishedAt:          finishedAt instanceof Date ? Timestamp.fromDate(finishedAt) : Timestamp.fromDate(new Date()),
    finishedAtPrecision: finishedAt ? (finishedAtPrecision || null) : null,
    // updateBookReads rebuilds the book's language from its most recent read and
    // deletes the field when that read has none — so leaving it off here meant a
    // finished book lost its language the first time its dates were edited.
    language: resolveBookLanguage(language),
    format:   format || null,
    rating: rating ?? null,
    review: review || null,
  }];
  const bookRef = await addDoc(collection(db, 'users', uid, 'books'), data);
  if (finishedAt && finishedAtPrecision === 'day') {
    await addDoc(collection(db, 'activity'), {
      uid,
      username:   username || '',
      type:       'finished',
      bookId:     bookRef.id,
      bookTitle:  title,
      bookAuthor: author || '',
      gbid:       gbid || '',
      coverUrl:   coverUrl || '',
      rating:     rating ?? null,
      hasReview:  !!(review && review.trim()),
      timestamp:  finishedAt
    });
  }
  // Added as already read, so it is off the want-to-read list too.
  try { await removeFromDefaultList(uid, { gbid, title }); }
  catch (e) { console.error('want-to-read cleanup:', e); }
  return bookRef.id;
}

export async function addBook(uid, { title, author, totalPages, gbid, workId, isbn13, coverUrl, releaseYear, country, authorGender, genres, language }, username) {
  const bookData = {
    title,
    author:           author || '',
    totalPages:       totalPages || 0,
    currentPage:      0,
    status:           'reading',
    gbid:             gbid || '',
    addedAt:          serverTimestamp(),
    addedAtPrecision: 'day',
    language:         resolveBookLanguage(language)
  };
  if (workId)                bookData.workId       = workId;
  // The one identifier here that means anything outside Hardcover, so it is
  // worth a field of its own — see the ISBN notes in book-utils.js.
  if (isbn13)                bookData.isbn13       = isbn13;
  if (coverUrl)              bookData.coverUrl     = coverUrl;
  if (releaseYear)           bookData.releaseYear  = releaseYear;
  if (country)               bookData.country      = country;
  if (authorGender)          bookData.authorGender = authorGender;
  if (genres?.length)        bookData.genres       = genres;
  const bookRef = await addDoc(collection(db, 'users', uid, 'books'), bookData);
  await addDoc(collection(db, 'activity'), {
    uid,
    username,
    type:        'started',
    bookId:      bookRef.id,
    bookTitle:   title,
    bookAuthor:  author || '',
    gbid:        gbid || '',
    coverUrl:    coverUrl || '',
    currentPage: 0,
    totalPages:  totalPages || 0,
    timestamp:   serverTimestamp()
  });
  return bookRef.id;
}

export function updateBookProgress(uid, bookId, currentPage) {
  return updateDoc(doc(db, 'users', uid, 'books', bookId), { currentPage });
}

export async function finishBook(uid, bookId, { title, author, gbid, rating, review, language, format, coverUrl, startedAt, startedAtPrecision, finishedAt, finishedAtPrecision } = {}, username) {
  const toTS = d => d instanceof Date ? Timestamp.fromDate(d) : (d?.toDate ? Timestamp.fromDate(d.toDate()) : null);
  const newRead = {
    startedAt:           toTS(startedAt) || null,
    startedAtPrecision:  startedAt  ? (startedAtPrecision  || null) : null,
    finishedAt:          toTS(finishedAt) || Timestamp.fromDate(new Date()),
    finishedAtPrecision: finishedAt ? (finishedAtPrecision || null) : 'day',
    language: language || null,
    format:   format   || null,
    rating: rating ?? null,
    review: review || null,
  };
  const bookUpdate = { status: 'finished', finishedAt: serverTimestamp(), finishedAtPrecision: 'day', reads: arrayUnion(newRead) };
  if (rating != null) bookUpdate.rating   = rating;
  if (review)         bookUpdate.review   = review;
  if (format)         bookUpdate.format   = format;
  if (language)       bookUpdate.language = language;

  const startedSnap = await getDocs(query(
    collection(db, 'activity'),
    where('uid', '==', uid),
    where('bookId', '==', bookId),
    where('type', '==', 'started')
  ));
  let startedDocs = startedSnap.docs;
  if (!startedDocs.length) {
    // Legacy fallback: 'started' docs written before bookId was tracked on them.
    const legacySnap = await getDocs(query(collection(db, 'activity'), where('uid', '==', uid)));
    startedDocs = legacySnap.docs.filter(d => {
      const data = d.data();
      return data.type === 'started' && !data.bookId && ((gbid && data.gbid === gbid) || data.bookTitle === title);
    });
  }

  await Promise.all([
    updateDoc(doc(db, 'users', uid, 'books', bookId), bookUpdate),
    addDoc(collection(db, 'activity'), {
      uid,
      username,
      type:       'finished',
      bookId:     bookId || '',
      bookTitle:  title || '',
      bookAuthor: author || '',
      gbid:       gbid || '',
      coverUrl:   coverUrl || '',
      rating:     rating ?? null,
      hasReview:  !!(review && review.trim()),
      timestamp:  serverTimestamp()
    }),
    ...startedDocs.map(d => updateDoc(d.ref, { currentPage: 0 })),
  ]);

  // Started does not do this — only finished. Kept out of the write above so a
  // failure here cannot leave a finished book looking unfinished.
  try { await removeFromDefaultList(uid, { gbid, title }); }
  catch (e) { console.error('want-to-read cleanup:', e); }
}

async function upsertActivityTimestamp(uid, type, date, { bookId, title, author, gbid, rating, review, username }) {
  let matching = [];
  if (bookId) {
    const snap = await getDocs(query(
      collection(db, 'activity'),
      where('uid', '==', uid),
      where('bookId', '==', bookId),
      where('type', '==', type)
    ));
    matching = snap.docs;
  }
  if (!matching.length) {
    // Legacy fallback: activity docs written before bookId was tracked on them.
    const snap = await getDocs(query(collection(db, 'activity'), where('uid', '==', uid)));
    matching = snap.docs.filter(d => {
      const data = d.data();
      if (data.type !== type || data.bookId) return false;
      if (gbid && data.gbid && data.gbid === gbid) return true;
      return data.bookTitle === title && data.bookAuthor === author;
    });
  }
  if (matching.length > 0) {
    await Promise.all(matching.map(d => {
      const update = { timestamp: date, bookTitle: title || '', bookAuthor: author || '' };
      if (gbid) update.gbid = gbid;
      if (type === 'finished') {
        update.rating    = rating ?? null;
        update.hasReview = !!(review && review.trim());
      }
      return updateDoc(d.ref, update);
    }));
  } else {
    const entry = {
      uid, username: username || '', type,
      bookId: bookId || '',
      bookTitle: title || '', bookAuthor: author || '', gbid: gbid || '',
      timestamp: date
    };
    if (type === 'finished') {
      entry.rating    = rating ?? null;
      entry.hasReview = !!(review && review.trim());
    }
    await addDoc(collection(db, 'activity'), entry);
  }
}

export async function updateBookDates(uid, bookId, updates, bookInfo) {
  const firestoreUpdates = { ...updates };
  if (firestoreUpdates.addedAtPrecision    === null) firestoreUpdates.addedAtPrecision    = deleteField();
  if (firestoreUpdates.finishedAtPrecision === null) firestoreUpdates.finishedAtPrecision = deleteField();
  await updateDoc(doc(db, 'users', uid, 'books', bookId), firestoreUpdates);
  if (bookInfo) {
    const info = { ...bookInfo, bookId: bookInfo.bookId || bookId };
    try {
      if (updates.addedAt instanceof Date) {
        if (updates.addedAtPrecision === 'day') await upsertActivityTimestamp(uid, 'started', updates.addedAt, info);
        else await deleteActivityForBook(uid, { bookId: info.bookId, title: info.title, author: info.author, type: 'started' });
      }
      if (updates.finishedAt instanceof Date) {
        if (updates.finishedAtPrecision === 'day') await upsertActivityTimestamp(uid, 'finished', updates.finishedAt, info);
        else await deleteActivityForBook(uid, { bookId: info.bookId, title: info.title, author: info.author, type: 'finished' });
      }
    } catch (e) { console.error('Activity sync failed:', e); }
  }
}

export function clearBookDate(uid, bookId, field) {
  return updateDoc(doc(db, 'users', uid, 'books', bookId), {
    [field]: deleteField(),
    [`${field}Precision`]: deleteField()
  });
}

export async function updateBookMeta(uid, bookId, updates, { gbid, title } = {}) {
  await updateDoc(doc(db, 'users', uid, 'books', bookId), updates);
  const hasProgress = updates.currentPage !== undefined || updates.totalPages !== undefined;
  const hasCover    = updates.coverUrl !== undefined;
  const hasMeta     = updates.title !== undefined || updates.author !== undefined;
  if (hasProgress || hasCover || hasMeta) {
    const docs = await activityDocsForBook(uid, { bookId, gbid, title: title || updates.title });
    await Promise.all(docs.map(d => {
      const isStarted = d.data().type === 'started';
      const update = {};
      if (hasCover)                                  update.coverUrl   = updates.coverUrl;
      if (updates.title  !== undefined)              update.bookTitle  = updates.title  || '';
      if (updates.author !== undefined)              update.bookAuthor = updates.author || '';
      if (hasProgress && isStarted) {
        if (updates.currentPage !== undefined) update.currentPage = updates.currentPage;
        if (updates.totalPages  !== undefined) update.totalPages  = updates.totalPages;
      }
      return Object.keys(update).length ? updateDoc(d.ref, update) : Promise.resolve();
    }));
  }
}

export function updateBookReads(uid, bookId, reads) {
  const toTS = ts => {
    if (!ts) return null;
    if (ts instanceof Timestamp) return ts;
    if (ts?.toDate) return Timestamp.fromDate(ts.toDate());
    return null;
  };
  const cleaned = reads
    .map(r => ({
      startedAt:           toTS(r.startedAt),
      startedAtPrecision:  r.startedAtPrecision  || null,
      finishedAt:          toTS(r.finishedAt),
      finishedAtPrecision: r.finishedAtPrecision || null,
      language: r.language || null,
      format:   r.format   || null,
      rating: r.rating ?? null,
      review: r.review || null,
    }))
    .sort((a, b) => (a.finishedAt?.seconds ?? 0) - (b.finishedAt?.seconds ?? 0));
  const mostRecent = cleaned.reduce((best, r) =>
    (r.finishedAt?.seconds ?? 0) > (best?.finishedAt?.seconds ?? 0) ? r : best, cleaned[0] ?? null);
  return updateDoc(doc(db, 'users', uid, 'books', bookId), {
    reads:                cleaned,
    rating:               mostRecent?.rating             ?? deleteField(),
    review:               mostRecent?.review             || deleteField(),
    finishedAt:           mostRecent?.finishedAt         ?? deleteField(),
    finishedAtPrecision:  mostRecent?.finishedAtPrecision || deleteField(),
    language:             mostRecent?.language           || deleteField(),
    format:               mostRecent?.format             || deleteField(),
  });
}

export function updateBookRating(uid, bookId, { rating, review }) {
  return updateDoc(doc(db, 'users', uid, 'books', bookId), {
    rating: rating != null ? rating : deleteField(),
    review: review       ? review : deleteField()
  });
}

export async function setBookPrivate(uid, bookId, isPrivate) {
  const bookRef = doc(db, 'users', uid, 'books', bookId);
  const bookSnap = await getDoc(bookRef);
  await updateDoc(bookRef, { private: isPrivate });
  const bookData = bookSnap.data() || {};
  const docs = await activityDocsForBook(uid, { bookId, gbid: bookData.gbid, title: bookData.title, author: bookData.author });
  if (docs.length)
    await Promise.all(docs.map(d => updateDoc(d.ref, { private: isPrivate })));
}

export async function getBookByGbid(uid, gbid) {
  if (!gbid) return null;
  const q    = query(collection(db, 'users', uid, 'books'), where('gbid', '==', gbid));
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getFriendListStatus(following, gbid) {
  if (!gbid || !following.length) return [];
  const results = await Promise.all(
    following.map(async friend => {
      const snap = await getDocs(collection(db, 'users', friend.uid, 'lists'));
      const lists = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const matched = lists.filter(l => (l.books || []).some(b => b.gbid === gbid));
      if (!matched.length) return null;
      return { ...friend, listNames: matched.map(l => l.name) };
    })
  );
  return results.filter(Boolean);
}

export async function getFriendBookStatus(followingUids, gbid) {
  if (!gbid || !followingUids.length) return [];
  const results = await Promise.all(
    followingUids.map(async uid => {
      const q    = query(collection(db, 'users', uid, 'books'), where('gbid', '==', gbid));
      const snap = await getDocs(q);
      if (snap.empty) return null;
      const userSnap = await getDoc(doc(db, 'users', uid));
      return userSnap.exists()
        ? { uid, username: userSnap.data().username, avatarUrl: userSnap.data().avatarUrl || null, avatarBorderColor: userSnap.data().avatarBorderColor || null, book: { id: snap.docs[0].id, ...snap.docs[0].data() } }
        : null;
    })
  );
  return results.filter(Boolean);
}

export async function syncBookActivity(uid, type, date, precision, bookInfo) {
  if (date && precision === 'day') {
    await upsertActivityTimestamp(uid, type, date, bookInfo);
  } else {
    await deleteActivityForBook(uid, { bookId: bookInfo.bookId, title: bookInfo.title, author: bookInfo.author, type });
  }
}

async function deleteActivityForBook(uid, { bookId, title, author, type } = {}) {
  if (bookId) {
    const constraints = [where('uid', '==', uid), where('bookId', '==', bookId)];
    if (type != null) constraints.push(where('type', '==', type));
    const snap = await getDocs(query(collection(db, 'activity'), ...constraints));
    if (snap.docs.length) {
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      return;
    }
  }
  // Legacy fallback: activity docs written before bookId was tracked on them.
  const snap = await getDocs(query(collection(db, 'activity'), where('uid', '==', uid)));
  await Promise.all(
    snap.docs
      .filter(d => {
        const data = d.data();
        if (data.bookId) return false; // already covered by the indexed query above
        return data.bookTitle === title && data.bookAuthor === author && (type == null || data.type === type);
      })
      .map(d => deleteDoc(d.ref))
  );
}

export async function deleteAccountData(uid, username) {
  const [booksSnap, listsSnap, activitySnap] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'books')),
    getDocs(collection(db, 'users', uid, 'lists')),
    getDocs(query(collection(db, 'activity'), where('uid', '==', uid))),
  ]);
  await Promise.all([
    ...booksSnap.docs.map(d => deleteDoc(d.ref)),
    ...listsSnap.docs.map(d => deleteDoc(d.ref)),
    ...activitySnap.docs.map(d => deleteDoc(d.ref)),
    deleteDoc(doc(db, 'users', uid)),
    deleteDoc(doc(db, 'usernames', username)),
  ]);
}

export async function clearLibrary(uid) {
  const booksSnap = await getDocs(collection(db, 'users', uid, 'books'));
  const activitySnap = await getDocs(query(collection(db, 'activity'), where('uid', '==', uid)));
  await Promise.all([
    ...booksSnap.docs.map(d => deleteDoc(d.ref)),
    ...activitySnap.docs.map(d => deleteDoc(d.ref)),
  ]);
}

export function deleteBookDoc(uid, bookId) {
  return deleteDoc(doc(db, 'users', uid, 'books', bookId));
}

export async function deleteBook(uid, bookId, { title, author }) {
  await Promise.all([
    deleteDoc(doc(db, 'users', uid, 'books', bookId)),
    deleteActivityForBook(uid, { bookId, title, author })
  ]);
}

export async function dnfBook(uid, bookId) {
  await updateDoc(doc(db, 'users', uid, 'books', bookId), { status: 'dnf' });
}

export async function undnfBook(uid, bookId) {
  await updateDoc(doc(db, 'users', uid, 'books', bookId), { status: 'reading' });
}

export async function unfinishBook(uid, bookId, { title, author }) {
  await Promise.all([
    updateDoc(doc(db, 'users', uid, 'books', bookId), { status: 'reading', finishedAt: deleteField() }),
    deleteActivityForBook(uid, { bookId, title, author, type: 'finished' })
  ]);
}

// ── Lists ─────────────────────────────────────────────────────────────────────

export async function getListCount(uid, viewerUid) {
  const col = collection(db, 'users', uid, 'lists');
  const q = viewerSeesOnlyPublic(uid, viewerUid)
    ? query(col, where('private', '==', false))
    : col;
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

// Writes the display order for a user's lists, as sortIndex 0..n-1.
//
// Batched so the order can never land half-applied: a partial write would leave
// some lists indexed and some not, which compareLists reads as "the indexed ones
// come first" — a worse arrangement than either the old or the new one.
//
// Every list is written, not just the two that swapped, so one reorder makes the
// whole ordering explicit rather than a mix of arranged and unarranged.
export async function reorderLists(uid, orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, i) => batch.update(doc(db, 'users', uid, 'lists', id), { sortIndex: i }));
  await batch.commit();
}

// The reader's default book language. An empty string is meaningful — it says
// they want new books to carry no language — so it is stored rather than
// treated as "unset".
export async function setDefaultLanguage(uid, language) {
  await updateDoc(doc(db, 'users', uid), { defaultLanguage: language });
}

export async function setListPrivate(uid, listId, isPrivate) {
  return updateDoc(doc(db, 'users', uid, 'lists', listId), { private: isPrivate });
}

export const DEFAULT_LIST_NAME = 'Want to read';

// Both live in book-utils so they can be unit-tested: this module imports the
// Firebase SDK over https, which the Node test runner cannot resolve.
export { DEFAULT_BOOK_LANGUAGE, resolveBookLanguage } from './book-utils.js';

export async function getLists(uid, viewerUid) {
  const col = collection(db, 'users', uid, 'lists');
  // '==' false rather than '!=' true: a '!=' filter silently drops documents
  // that have no `private` field at all, which is every list created before
  // the feature existed. The owner path below backfills them.
  const q = viewerSeesOnlyPublic(uid, viewerUid)
    ? query(col, where('private', '==', false))
    : col;
  const snap = await getDocs(q);
  const lists = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort(compareLists);
  // Every name the default list has carried, corrected on read. Only the
  // owner can write here, so a visitor sees the stored name until the owner
  // next loads the page.
  const OLD_DEFAULT_NAMES = ['Want to Read', 'Reading List', 'Reading list'];
  const stale = lists.find(l => l.isDefault && OLD_DEFAULT_NAMES.includes(l.name));
  if (stale) {
    await updateDoc(doc(db, 'users', uid, 'lists', stale.id), { name: DEFAULT_LIST_NAME });
    stale.name = DEFAULT_LIST_NAME;
  }
  // Backfill lists predating the private flag. Only the owner can write here,
  // and only the owner's unfiltered read can see them, so this is the one place
  // the repair can happen. Without it they stay invisible to everyone else.
  if (!viewerSeesOnlyPublic(uid, viewerUid)) {
    const unflagged = lists.filter(l => l.private === undefined);
    if (unflagged.length) {
      try {
        await Promise.all(unflagged.map(l =>
          updateDoc(doc(db, 'users', uid, 'lists', l.id), { private: false })
        ));
        for (const l of unflagged) l.private = false;
      } catch {
        // A failed repair must not stop the lists themselves loading.
      }
    }
  }
  return lists;
}

export async function ensureDefaultList(uid) {
  const lists = await getLists(uid);
  const def = lists.find(l => l.isDefault);
  if (def) return def.id;
  const ref = await addDoc(collection(db, 'users', uid, 'lists'), {
    name: DEFAULT_LIST_NAME,
    isDefault: true,
    private: false,
    createdAt: new Date().toISOString(),
    books: []
  });
  return ref.id;
}

export async function createList(uid, name) {
  const ref = await addDoc(collection(db, 'users', uid, 'lists'), {
    name,
    isDefault: false,
    private: false,
    createdAt: new Date().toISOString(),
    books: []
  });
  return { id: ref.id, name, isDefault: false, private: false, books: [] };
}

export async function deleteList(uid, listId) {
  await deleteDoc(doc(db, 'users', uid, 'lists', listId));
}

export async function addBookToList(uid, listId, book) {
  const ref  = doc(db, 'users', uid, 'lists', listId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const books = snap.data().books || [];
  if (books.some(b => b.gbid === book.gbid)) return;
  await updateDoc(ref, { books: [...books, { gbid: book.gbid, title: book.title, author: book.author || '', coverUrl: book.coverUrl || '' }] });
}

// Replaces a list's books wholesale — used for both reordering and removal.
//
// Order is the array's own order, with no index field, so a reorder has to
// rewrite the array regardless. Removal goes through here too because
// removeBookFromList matches on gbid, and books added by hand have none: it
// would take every hand-added book in the list with it. The caller already has
// the array on screen and can drop the exact entry by identity.
export async function setListBooks(uid, listId, books) {
  await updateDoc(doc(db, 'users', uid, 'lists', listId), { books });
}

export async function removeBookFromList(uid, listId, gbid) {
  const ref  = doc(db, 'users', uid, 'lists', listId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, { books: (snap.data().books || []).filter(b => b.gbid !== gbid) });
}

// Finishing a book answers the question the want-to-read list was asking, so
// the book comes off it. The default list only: every other list is a curation
// the reader made, and not ours to edit.
//
// Reads the collection directly rather than through getLists, which repairs and
// writes as it goes — far too much to set off as a side effect of finishing.
export async function removeFromDefaultList(uid, { gbid, title } = {}) {
  if (!gbid && !title) return;
  const snap = await getDocs(collection(db, 'users', uid, 'lists'));
  const def  = snap.docs.find(d => d.data().isDefault);
  if (!def) return;
  const books = def.data().books || [];
  const kept  = books.filter(b => !sameBook(b, { gbid, title }));
  if (kept.length === books.length) return;
  await updateDoc(def.ref, { books: kept });
}

// ── Backup / restore ──────────────────────────────────────────────────────────

function serializeForExport(v) {
  if (v instanceof Timestamp) return { _ts: true, s: v.seconds, n: v.nanoseconds };
  if (Array.isArray(v)) return v.map(serializeForExport);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, serializeForExport(val)]));
  }
  return v;
}

function deserializeFromExport(v) {
  if (v && typeof v === 'object' && v._ts === true) return new Timestamp(v.s, v.n || 0);
  if (Array.isArray(v)) return v.map(deserializeFromExport);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, deserializeFromExport(val)]));
  }
  return v;
}

export async function exportLibraryData(uid) {
  const [booksSnap, listsSnap] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'books')),
    getDocs(collection(db, 'users', uid, 'lists')),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    books: booksSnap.docs.map(d => serializeForExport({ id: d.id, ...d.data() })),
    lists: listsSnap.docs.map(d => serializeForExport({ id: d.id, ...d.data() })),
  };
}

export async function mergeListsByName(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'lists'));
  const lists = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const byName = {};
  for (const list of lists) {
    const key = (list.name || '').toLowerCase().trim();
    if (!byName[key]) byName[key] = [];
    byName[key].push(list);
  }

  for (const group of Object.values(byName)) {
    if (group.length <= 1) continue;
    // Prefer the default list as keeper; otherwise keep the first
    const keeper = group.find(l => l.isDefault) || group[0];
    const dupes  = group.filter(l => l !== keeper);

    const merged = [...(keeper.books || [])];
    const seen   = new Set(merged.map(b => b.gbid).filter(Boolean));
    for (const dupe of dupes) {
      for (const book of (dupe.books || [])) {
        if (book.gbid && seen.has(book.gbid)) continue;
        if (book.gbid) seen.add(book.gbid);
        merged.push(book);
      }
    }

    await Promise.all([
      updateDoc(doc(db, 'users', uid, 'lists', keeper.id), { books: merged }),
      ...dupes.map(d => deleteDoc(doc(db, 'users', uid, 'lists', d.id))),
    ]);
  }
}

export async function importLibraryData(uid, data) {
  const books = (data.books || []);
  const lists  = (data.lists  || []);
  const col = collection(db, 'users', uid, 'books');
  for (let i = 0; i < books.length; i += 20) {
    await Promise.all(books.slice(i, i + 20).map(({ id: _id, ...rest }) => addDoc(col, deserializeFromExport(rest))));
  }
  const lCol = collection(db, 'users', uid, 'lists');
  for (let i = 0; i < lists.length; i += 20) {
    await Promise.all(lists.slice(i, i + 20).map(({ id: _id, ...rest }) => addDoc(lCol, deserializeFromExport(rest))));
  }
  await mergeListsByName(uid);
  return { books: books.length, lists: lists.length };
}

export async function renameList(uid, listId, name) {
  await updateDoc(doc(db, 'users', uid, 'lists', listId), { name });
}

export async function removeActivityEvent(uid, activityId, gbid, dateField, bookTitle, bookId) {
  await deleteDoc(doc(db, 'activity', activityId));
  if (dateField) {
    let book = null;
    if (bookId) {
      const snap = await getDoc(doc(db, 'users', uid, 'books', bookId));
      if (snap.exists()) book = { id: snap.id, ...snap.data() };
    }
    if (!book && gbid) book = await getBookByGbid(uid, gbid);
    if (!book && bookTitle) {
      const q = query(collection(db, 'users', uid, 'books'), where('title', '==', bookTitle));
      const snap = await getDocs(q);
      if (!snap.empty) book = { id: snap.docs[0].id, ...snap.docs[0].data() };
    }
    if (book?.id) {
      const updateData = {
        [dateField]: deleteField(),
        [`${dateField}Precision`]: deleteField()
      };
      if (book.reads && book.reads.length > 0) {
        // For finished books, dates are shown from the reads array — clear from there too.
        // Map dateField ('addedAt' → 'startedAt', 'finishedAt' → 'finishedAt') for the reads entry.
        const readsField = dateField === 'addedAt' ? 'startedAt' : 'finishedAt';
        const readsPrecField = readsField + 'Precision';
        updateData.reads = book.reads.map((r, i, arr) => {
          if (i !== arr.length - 1) return r;
          const updated = {};
          for (const [k, v] of Object.entries(r)) if (v !== undefined) updated[k] = v;
          updated[readsField] = null;
          updated[readsPrecField] = null;
          return updated;
        });
      }
      await updateDoc(doc(db, 'users', uid, 'books', book.id), updateData);
    }
  }
}

export async function searchUsers(q, currentUid, pageSize = 10) {
  const lower = q.toLowerCase();
  const end = lower + '';
  const col = collection(db, 'users');
  const [byUsername, byDisplayName] = await Promise.all([
    getDocs(query(col, where('username',    '>=', lower), where('username',    '<=', end), limit(pageSize))),
    getDocs(query(col, where('displayName', '>=', lower), where('displayName', '<=', end), limit(pageSize))),
  ]);
  const seen = new Map();
  for (const snap of [byUsername, byDisplayName])
    for (const d of snap.docs)
      if (!seen.has(d.id)) seen.set(d.id, { uid: d.id, ...d.data() });
  return [...seen.values()];
}

export async function getFeed(currentUid, followingUids, cursor = null, pageSize = 20) {
  const uids = [...new Set([currentUid, ...followingUids])];

  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));

  const queries = [
    // Activity from you and people you follow
    ...chunks.map(chunk => {
      const constraints = [where('uid', 'in', chunk), orderBy('timestamp', 'desc'), limit(pageSize)];
      if (cursor) constraints.push(startAfter(cursor));
      return getDocs(query(collection(db, 'activity'), ...constraints));
    }),
    // Anyone following you
    getDocs(query(
      collection(db, 'activity'),
      where('type', '==', 'followed'),
      where('targetUid', '==', currentUid),
      orderBy('timestamp', 'desc'),
      limit(pageSize)
    )),
  ];

  const snaps = await Promise.all(queries);
  const seen = new Set();
  const allDocs = snaps.flatMap(s => s.docs).filter(d => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
  allDocs.sort((a, b) => (b.data().timestamp?.seconds ?? 0) - (a.data().timestamp?.seconds ?? 0));
  const page = allDocs.slice(0, pageSize);

  return {
    events: page.map(d => ({ id: d.id, ...d.data() })).filter(ev => !ev.private),
    lastDoc: page.length === pageSize ? page[page.length - 1] : null,
  };
}

export async function repairStartedActivityForFinishedBooks(uid) {
  const [booksSnap, activitySnap] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'books'), where('status', '==', 'finished'))),
    getDocs(query(collection(db, 'activity'), where('uid', '==', uid)))
  ]);
  const finishedGbids  = new Set(booksSnap.docs.map(d => d.data().gbid).filter(Boolean));
  const finishedTitles = new Set(booksSnap.docs.map(d => d.data().title).filter(Boolean));
  const toFix = activitySnap.docs.filter(d => {
    const data = d.data();
    if (data.type !== 'started') return false;
    return (data.gbid && finishedGbids.has(data.gbid)) || finishedTitles.has(data.bookTitle);
  });
  await Promise.all(toFix.map(d => updateDoc(d.ref, { currentPage: 0 })));
  return toFix.length;
}

export async function repairActivityDocs(uid) {
  const [booksSnap, activitySnap] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'books')),
    getDocs(query(collection(db, 'activity'), where('uid', '==', uid)))
  ]);
  const books = booksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const findBook = (gbid, title) =>
    books.find(b => (gbid && b.gbid === gbid) || b.title === title);
  const writes = [];
  for (const actDoc of activitySnap.docs) {
    const ev   = actDoc.data();
    const book = findBook(ev.gbid, ev.bookTitle);
    if (!book) continue;
    const update = {};
    if (!ev.bookId) update.bookId = book.id;
    if (book.coverUrl && book.coverUrl !== ev.coverUrl) update.coverUrl = book.coverUrl;
    if (ev.type === 'started') {
      if (book.currentPage !== undefined && book.currentPage !== ev.currentPage) update.currentPage = book.currentPage;
      if (book.totalPages  !== undefined && book.totalPages  !== ev.totalPages)  update.totalPages  = book.totalPages;
    }
    if (Object.keys(update).length) writes.push(updateDoc(actDoc.ref, update));
  }
  await Promise.all(writes);
  return writes.length;
}

export async function addAnnouncement({ title, body }) {
  return addDoc(collection(db, 'announcements'), { title, body, createdAt: serverTimestamp() });
}

export async function updateAnnouncement(id, { title, body }) {
  return updateDoc(doc(db, 'announcements', id), { title, body });
}

export async function deleteAnnouncement(id) {
  return deleteDoc(doc(db, 'announcements', id));
}

export async function getAnnouncements(n = 5) {
  const snap = await getDocs(query(
    collection(db, 'announcements'),
    orderBy('createdAt', 'desc'),
    limit(n)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Work identity ─────────────────────────────────────────────────────────────

// Folds a group of same-work books into the single best entry: merged reads on
// the survivor, missing metadata backfilled from the others, the others deleted.
export async function applyWorkMerge(uid, group) {
  const plan = planWorkMerge(group);
  if (!plan) return null;
  const { primary, secondaries, mergedReads, metaUpdates } = plan;
  await updateBookReads(uid, primary.id, mergedReads);
  if (Object.keys(metaUpdates).length) await updateBookMeta(uid, primary.id, metaUpdates);
  for (const s of secondaries) await deleteBookDoc(uid, s.id);
  return { keptId: primary.id, removed: secondaries.length };
}

// Feed cards render from fields stored on the activity doc itself, not from the
// book, so remapping the books alone leaves the old title and cover on every
// past event. Rewrites those in place, across all users, keyed by the old slug.
export async function remapActivityForSlug(fromSlug, target) {
  const snap = await getDocs(query(collection(db, 'activity'), where('gbid', '==', fromSlug)));
  const updates = { gbid: target.slug };
  if (target.title)    updates.bookTitle  = target.title;
  if (target.author)   updates.bookAuthor = target.author;
  if (target.coverUrl) updates.coverUrl   = target.coverUrl;
  let done = 0;
  for (const d of snap.docs) {
    try { await updateDoc(d.ref, updates); done++; }
    catch (err) { console.warn('Activity remap failed for', d.id, err); }
  }
  return done;
}

// After a remap points several of a user's books at the same record, they hold
// duplicates. Merges only the groups involving `slug`, leaving any unrelated
// duplicates in that library alone — a remap should not quietly restructure
// books it was never asked about.
export async function mergeDuplicatesForSlug(uid, slug) {
  const books = await getBooks(uid);
  const groups = dupeGroupsForSlug(books, slug);
  let removed = 0;
  for (const group of groups) {
    const result = await applyWorkMerge(uid, group);
    removed += result?.removed || 0;
  }
  return removed;
}

// Backfills `workId` on a library's existing books by resolving their Hardcover
// slugs. Returns counts so the caller can report what happened. `resolve` is
// injected to keep this module free of the Hardcover import cycle.
export async function backfillWorkIds(uid, resolve, onProgress) {
  const books = await getBooks(uid);
  const pending = books.filter(b => b.gbid && !b.workId);
  if (!pending.length) return { scanned: books.length, resolved: 0, written: 0 };

  const CHUNK = 100;
  let written = 0, resolved = 0;
  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);
    if (onProgress) onProgress(i, pending.length);
    const withIds = await resolve(chunk.map(b => ({ ...b })));
    const writes = [];
    withIds.forEach((b, n) => {
      if (!b.workId) return;
      resolved++;
      writes.push(updateDoc(doc(db, 'users', uid, 'books', chunk[n].id), { workId: b.workId }));
    });
    await Promise.all(writes);
    written += writes.length;
  }
  return { scanned: books.length, pending: pending.length, resolved, written };
}

// One-off migration across every library. Books added from now on get their
// work id at add time, so this only needs running once to catch up existing
// data. Slugs are shared between users and cached, so later users mostly hit
// the cache rather than Hardcover.
export async function backfillWorkIdsForAllUsers(resolve, onProgress) {
  const users = await getDocs(collection(db, 'users'));
  let scanned = 0, written = 0, failed = 0;
  for (let i = 0; i < users.docs.length; i++) {
    if (onProgress) onProgress(i, users.docs.length);
    try {
      const r = await backfillWorkIds(users.docs[i].id, resolve);
      scanned += r.scanned;
      written += r.written;
    } catch (err) {
      failed++;
      console.warn('Work id backfill failed for', users.docs[i].id, err);
    }
  }
  return { users: users.docs.length, scanned, written, failed };
}

export async function toggleReaction(activityId, emoji, uid, add) {
  await updateDoc(doc(db, 'activity', activityId), {
    [`reactions.${emoji}`]: add ? arrayUnion(uid) : arrayRemove(uid)
  });
}

// ── Hardcover metadata cache ──────────────────────────────────────────────────
const HC_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export async function getHcCache(key) {
  const snap = await getDoc(doc(db, 'hc_cache', key));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (Date.now() - (data.cachedAt?.toMillis?.() || 0) > HC_CACHE_TTL_MS) return null;
  return data;
}

export function setHcCache(key, data) {
  return setDoc(doc(db, 'hc_cache', key), { ...data, cachedAt: serverTimestamp() });
}

export async function toggleAnnouncementReaction(announcementId, emoji, uid, add) {
  await updateDoc(doc(db, 'announcements', announcementId), {
    [`reactions.${emoji}`]: add ? arrayUnion(uid) : arrayRemove(uid)
  });
}

