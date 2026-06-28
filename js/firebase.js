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

// ── Books ─────────────────────────────────────────────────────────────────────

export async function getBooks(uid) {
  const q    = query(collection(db, 'users', uid, 'books'), orderBy('addedAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addFinishedBook(uid, { title, author, totalPages }) {
  const bookRef = await addDoc(collection(db, 'users', uid, 'books'), {
    title,
    author:      author || '',
    totalPages:  totalPages || 0,
    currentPage: totalPages || 0,
    status:      'finished',
    addedAt:     serverTimestamp(),
    finishedAt:  serverTimestamp()
  });
  return bookRef.id;
}

export async function addBook(uid, { title, author, totalPages }, username) {
  const [bookRef] = await Promise.all([
    addDoc(collection(db, 'users', uid, 'books'), {
      title,
      author:      author || '',
      totalPages:  totalPages || 0,
      currentPage: 0,
      status:      'reading',
      addedAt:     serverTimestamp()
    }),
    addDoc(collection(db, 'activity'), {
      uid,
      username,
      type:       'started',
      bookTitle:  title,
      bookAuthor: author || '',
      timestamp:  serverTimestamp()
    })
  ]);
  return bookRef.id;
}

export function updateBookProgress(uid, bookId, currentPage) {
  return updateDoc(doc(db, 'users', uid, 'books', bookId), { currentPage });
}

export function finishBook(uid, bookId, { title, author } = {}, username) {
  return Promise.all([
    updateDoc(doc(db, 'users', uid, 'books', bookId), {
      status:     'finished',
      finishedAt: serverTimestamp()
    }),
    addDoc(collection(db, 'activity'), {
      uid,
      username,
      type:       'finished',
      bookTitle:  title || '',
      bookAuthor: author || '',
      timestamp:  serverTimestamp()
    })
  ]);
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
