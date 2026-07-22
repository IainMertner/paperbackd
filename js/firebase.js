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
  startAfter
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

export async function importBooks(uid, books, onProgress) {
  const col = collection(db, 'users', uid, 'books');
  for (let i = 0; i < books.length; i += 20) {
    await Promise.all(books.slice(i, i + 20).map(b => {
      const data = { ...b };
      if (!data.addedAt)  data.addedAt  = serverTimestamp();
      if (!data.language) data.language = 'English';
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

export async function addFinishedBook(uid, { title, author, totalPages, gbid, coverUrl, rating, review, releaseYear, country, finishedAt, finishedAtPrecision, addedAt, addedAtPrecision }, username) {
  const data = {
    title,
    author:      author || '',
    totalPages:  totalPages || 0,
    currentPage: totalPages || 0,
    status:      'finished',
    gbid:        gbid || '',
    addedAt:     addedAt || serverTimestamp(),
    language:    'English'
  };
  if (finishedAt)          data.finishedAt          = finishedAt;
  if (finishedAtPrecision) data.finishedAtPrecision = finishedAtPrecision;
  if (addedAt && addedAtPrecision) data.addedAtPrecision = addedAtPrecision;
  if (coverUrl)       data.coverUrl       = coverUrl;
  if (rating != null) data.rating         = rating;
  if (review)         data.review         = review;
  if (releaseYear)    data.releaseYear    = releaseYear;
  if (country)        data.country        = country;
  data.reads = [{
    startedAt:           addedAt instanceof Date ? Timestamp.fromDate(addedAt) : (addedAt?.toDate ? Timestamp.fromDate(addedAt.toDate()) : null),
    startedAtPrecision:  addedAt ? (addedAtPrecision || null) : null,
    finishedAt:          finishedAt instanceof Date ? Timestamp.fromDate(finishedAt) : Timestamp.fromDate(new Date()),
    finishedAtPrecision: finishedAt ? (finishedAtPrecision || null) : null,
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
  return bookRef.id;
}

export async function addBook(uid, { title, author, totalPages, gbid, coverUrl, releaseYear, country }, username) {
  const bookData = {
    title,
    author:           author || '',
    totalPages:       totalPages || 0,
    currentPage:      0,
    status:           'reading',
    gbid:             gbid || '',
    addedAt:          serverTimestamp(),
    addedAtPrecision: 'day',
    language:         'English'
  };
  if (coverUrl)    bookData.coverUrl    = coverUrl;
  if (releaseYear) bookData.releaseYear = releaseYear;
  if (country)     bookData.country     = country;
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
  if (rating != null) bookUpdate.rating = rating;
  if (review)         bookUpdate.review = review;

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
    await Promise.all(matching.map(d => updateDoc(d.ref, { timestamp: date })));
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
  if (hasProgress || hasCover) {
    const docs = await activityDocsForBook(uid, { bookId, gbid, title });
    await Promise.all(docs.map(d => {
      const isStarted = d.data().type === 'started';
      const update = {};
      if (hasCover) update.coverUrl = updates.coverUrl;
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
  return updateDoc(doc(db, 'users', uid, 'books', bookId), { reads: cleaned });
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

export async function ensureDnfList(uid) {
  const lists = await getLists(uid);
  const existing = lists.find(l => l.isDnf);
  if (existing) return existing.id;
  const ref = await addDoc(collection(db, 'users', uid, 'lists'), {
    name: 'Did not finish',
    isDnf: true,
    isDefault: false,
    createdAt: new Date().toISOString(),
    books: []
  });
  return ref.id;
}

export async function dnfBook(uid, bookId, book) {
  const dnfListId = await ensureDnfList(uid);
  await Promise.all([
    addBookToList(uid, dnfListId, book),
    deleteBook(uid, bookId, { title: book.title })
  ]);
}

export async function unfinishBook(uid, bookId, { title, author }) {
  await Promise.all([
    updateDoc(doc(db, 'users', uid, 'books', bookId), { status: 'reading', finishedAt: deleteField() }),
    deleteActivityForBook(uid, { bookId, title, author, type: 'finished' })
  ]);
}

// ── Lists ─────────────────────────────────────────────────────────────────────

export async function getListCount(uid) {
  const snap = await getCountFromServer(collection(db, 'users', uid, 'lists'));
  return snap.data().count;
}

export async function getLists(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'lists'));
  const lists = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      if (a.isDnf && !b.isDnf) return -1;
      if (!a.isDnf && b.isDnf) return 1;
      return 0;
    });
  const stale = lists.find(l => l.isDefault && (l.name === 'Want to Read' || l.name === 'Reading List'));
  if (stale) {
    await updateDoc(doc(db, 'users', uid, 'lists', stale.id), { name: 'Reading list' });
    stale.name = 'Reading list';
  }
  return lists;
}

export async function ensureDefaultList(uid) {
  const lists = await getLists(uid);
  const def = lists.find(l => l.isDefault);
  if (def) return def.id;
  const ref = await addDoc(collection(db, 'users', uid, 'lists'), {
    name: 'Reading list',
    isDefault: true,
    createdAt: new Date().toISOString(),
    books: []
  });
  return ref.id;
}

export async function createList(uid, name) {
  const ref = await addDoc(collection(db, 'users', uid, 'lists'), {
    name,
    isDefault: false,
    createdAt: new Date().toISOString(),
    books: []
  });
  return { id: ref.id, name, isDefault: false, books: [] };
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

export async function removeBookFromList(uid, listId, gbid) {
  const ref  = doc(db, 'users', uid, 'lists', listId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, { books: (snap.data().books || []).filter(b => b.gbid !== gbid) });
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
  const snap = await getDocs(query(
    collection(db, 'users'),
    where('username', '>=', lower),
    where('username', '<=', lower + ''),
    limit(pageSize)
  ));
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.uid !== currentUid);
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
    events: page.map(d => ({ id: d.id, ...d.data() })),
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

export async function setThemeColorForAllUsers(color) {
  const snap = await getDocs(collection(db, 'users'));
  await Promise.all(snap.docs.map(d => updateDoc(d.ref, { avatarBorderColor: color })));
  return snap.docs.length;
}

export async function toggleReaction(activityId, emoji, uid, add) {
  await updateDoc(doc(db, 'activity', activityId), {
    [`reactions.${emoji}`]: add ? arrayUnion(uid) : arrayRemove(uid)
  });
}

