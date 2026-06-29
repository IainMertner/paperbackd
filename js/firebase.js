import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  collection,
  addDoc,
  getDocs,
  getCountFromServer,
  query,
  orderBy,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
export const db   = getFirestore(app);

// Base URL of the app, works on any host (GitHub Pages, localhost, etc.)
export const ROOT = new URL('..', import.meta.url).href;

// Firebase Auth requires an email address internally.
// We synthesise one from the username so the user never has to provide one.
function toEmail(username) {
  return `${username}@readinglog.local`;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function signUp(username, password) {
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new Error('Username must be 3–20 characters: lowercase letters, numbers, underscores.');
  }
  const taken = await getDoc(doc(db, 'usernames', username));
  if (taken.exists()) throw new Error('That username is already taken.');

  const cred = await createUserWithEmailAndPassword(auth, toEmail(username), password);
  const uid  = cred.user.uid;

  await Promise.all([
    setDoc(doc(db, 'users', uid),          { username, createdAt: serverTimestamp(), following: [] }),
    setDoc(doc(db, 'usernames', username), { uid })
  ]);

  return cred.user;
}

export function signIn(username, password) {
  return signInWithEmailAndPassword(auth, toEmail(username), password);
}

export function logOut() {
  localStorage.removeItem('rl_profile');
  return fbSignOut(auth);
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

export async function getFollowers(uid) {
  // Compute followers by querying who has this uid in their following array.
  // This avoids cross-user writes entirely — no special Firestore rules needed.
  const q    = query(collection(db, 'users'), where('following', 'array-contains', uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function followUser(currentUid, targetUsername) {
  const lower = targetUsername.toLowerCase();
  const usernameSnap = await getDoc(doc(db, 'usernames', lower));
  if (!usernameSnap.exists()) throw new Error('No user found with that username.');

  const targetUid = usernameSnap.data().uid;
  if (targetUid === currentUid) throw new Error('You cannot follow yourself.');

  const mySnap = await getDoc(doc(db, 'users', currentUid));
  const alreadyFollowing = (mySnap.data()?.following || mySnap.data()?.friends || []).includes(targetUid);
  if (alreadyFollowing) throw new Error('You already follow this person.');

  await updateDoc(doc(db, 'users', currentUid), { following: arrayUnion(targetUid) });

  const targetSnap = await getDoc(doc(db, 'users', targetUid));
  return { uid: targetUid, ...targetSnap.data() };
}

export async function unfollowUser(currentUid, targetUid) {
  await updateDoc(doc(db, 'users', currentUid), { following: arrayRemove(targetUid) });
}

export function updateAvatarUrl(uid, dataUrl) {
  return updateDoc(doc(db, 'users', uid), { avatarUrl: dataUrl });
}

export function muteUser(currentUid, targetUid) {
  return updateDoc(doc(db, 'users', currentUid), { muted: arrayUnion(targetUid) });
}

export function unmuteUser(currentUid, targetUid) {
  return updateDoc(doc(db, 'users', currentUid), { muted: arrayRemove(targetUid) });
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

export async function addFinishedBook(uid, { title, author, totalPages, gbid, coverUrl, rating, review, finishedAt, finishedAtPrecision, addedAt, addedAtPrecision }, username) {
  const data = {
    title,
    author:      author || '',
    totalPages:  totalPages || 0,
    currentPage: totalPages || 0,
    status:      'finished',
    gbid:        gbid || '',
    addedAt:     addedAt || serverTimestamp()
  };
  if (finishedAt)          data.finishedAt          = finishedAt;
  if (finishedAtPrecision) data.finishedAtPrecision = finishedAtPrecision;
  if (addedAt && addedAtPrecision) data.addedAtPrecision = addedAtPrecision;
  if (coverUrl)       data.coverUrl       = coverUrl;
  if (rating != null) data.rating         = rating;
  if (review)         data.review         = review;
  const bookRef = await addDoc(collection(db, 'users', uid, 'books'), data);
  if (finishedAt && finishedAtPrecision === 'day') {
    await addDoc(collection(db, 'activity'), {
      uid,
      username:   username || '',
      type:       'finished',
      bookTitle:  title,
      bookAuthor: author || '',
      gbid:       gbid || '',
      rating:     rating ?? null,
      hasReview:  !!(review && review.trim()),
      timestamp:  finishedAt
    });
  }
  return bookRef.id;
}

export async function addBook(uid, { title, author, totalPages, gbid, coverUrl }, username) {
  const bookData = {
    title,
    author:      author || '',
    totalPages:  totalPages || 0,
    currentPage: 0,
    status:      'reading',
    gbid:        gbid || '',
    addedAt:     serverTimestamp()
  };
  if (coverUrl) bookData.coverUrl = coverUrl;
  const [bookRef] = await Promise.all([
    addDoc(collection(db, 'users', uid, 'books'), bookData),
    addDoc(collection(db, 'activity'), {
      uid,
      username,
      type:       'started',
      bookTitle:  title,
      bookAuthor: author || '',
      gbid:       gbid || '',
      timestamp:  serverTimestamp()
    })
  ]);
  return bookRef.id;
}

export function updateBookProgress(uid, bookId, currentPage) {
  return updateDoc(doc(db, 'users', uid, 'books', bookId), { currentPage });
}

export function finishBook(uid, bookId, { title, author, gbid, rating, review } = {}, username) {
  const bookUpdate = { status: 'finished', finishedAt: serverTimestamp() };
  if (rating != null) bookUpdate.rating = rating;
  if (review)         bookUpdate.review = review;
  return Promise.all([
    updateDoc(doc(db, 'users', uid, 'books', bookId), bookUpdate),
    addDoc(collection(db, 'activity'), {
      uid,
      username,
      type:       'finished',
      bookTitle:  title || '',
      bookAuthor: author || '',
      gbid:       gbid || '',
      rating:     rating ?? null,
      hasReview:  !!(review && review.trim()),
      timestamp:  serverTimestamp()
    })
  ]);
}

async function upsertActivityTimestamp(uid, type, date, { title, author, gbid, rating, review, username }) {
  const snap = await getDocs(query(collection(db, 'activity'), where('uid', '==', uid)));
  const matching = snap.docs.filter(d => d.data().bookTitle === title && d.data().type === type);
  if (matching.length > 0) {
    await Promise.all(matching.map(d => updateDoc(d.ref, { timestamp: date })));
  } else {
    const entry = {
      uid, username: username || '', type,
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
    if (updates.addedAt instanceof Date) {
      if (updates.addedAtPrecision === 'day') await upsertActivityTimestamp(uid, 'started', updates.addedAt, bookInfo);
      else await deleteActivityForBook(uid, bookInfo.title, 'started');
    }
    if (updates.finishedAt instanceof Date) {
      if (updates.finishedAtPrecision === 'day') await upsertActivityTimestamp(uid, 'finished', updates.finishedAt, bookInfo);
      else await deleteActivityForBook(uid, bookInfo.title, 'finished');
    }
  }
}

export function clearBookDate(uid, bookId, field) {
  return updateDoc(doc(db, 'users', uid, 'books', bookId), {
    [field]: deleteField(),
    [`${field}Precision`]: deleteField()
  });
}

export function updateBookRating(uid, bookId, { rating, review }) {
  return updateDoc(doc(db, 'users', uid, 'books', bookId), {
    rating: rating != null ? rating : deleteField(),
    review: review       ? review : deleteField()
  });
}

export async function getBookByGbid(uid, gbid) {
  if (!gbid) return null;
  const q    = query(collection(db, 'users', uid, 'books'), where('gbid', '==', gbid));
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
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
        ? { uid, username: userSnap.data().username, avatarUrl: userSnap.data().avatarUrl || null, book: { id: snap.docs[0].id, ...snap.docs[0].data() } }
        : null;
    })
  );
  return results.filter(Boolean);
}

async function deleteActivityForBook(uid, bookTitle, type) {
  const snap = await getDocs(query(collection(db, 'activity'), where('uid', '==', uid)));
  await Promise.all(
    snap.docs
      .filter(d => d.data().bookTitle === bookTitle && (type == null || d.data().type === type))
      .map(d => deleteDoc(d.ref))
  );
}

export async function deleteBook(uid, bookId, { title }) {
  await Promise.all([
    deleteDoc(doc(db, 'users', uid, 'books', bookId)),
    deleteActivityForBook(uid, title, null)
  ]);
}

export async function unfinishBook(uid, bookId, { title }) {
  await Promise.all([
    updateDoc(doc(db, 'users', uid, 'books', bookId), { status: 'reading', finishedAt: deleteField() }),
    deleteActivityForBook(uid, title, 'finished')
  ]);
}

export async function getFeed(currentUid, followingUids) {
  const uids = [...new Set([currentUid, ...followingUids])];
  if (!uids.length) return [];
  // 'in' supports up to 30 values; slice just in case
  const q    = query(collection(db, 'activity'), where('uid', 'in', uids.slice(0, 30)));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
    .slice(0, 50);
}
