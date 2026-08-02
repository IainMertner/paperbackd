// Pure book-domain functions — no Firebase, no DOM.

// Extracts a numeric timestamp (seconds) from a book field.
// Handles Firestore Timestamp objects ({seconds}), objects with .toDate(), or returns 0.
export function tsOf(book, field) {
  const ts = book[field];
  if (!ts) return 0;
  if (ts.seconds != null) return ts.seconds;
  if (ts.toDate) return ts.toDate().getTime() / 1000;
  return 0;
}

// Reconstructs a reads array from either the modern multi-read format or a legacy single-read book.
export function getReads(book) {
  if (book.reads && book.reads.length > 0) return book.reads;
  if (book.finishedAt) return [{
    startedAt: book.addedAt || null,
    startedAtPrecision: book.addedAtPrecision || null,
    finishedAt: book.finishedAt,
    finishedAtPrecision: book.finishedAtPrecision || null,
    language: book.language || null,
    format: book.format || null,
    rating: book.rating || null,
    review: book.review || null,
  }];
  return [];
}

// Returns the rating from the most-recently-finished read, or null.
export function getDisplayRating(book) {
  if (book.reads && book.reads.length > 0) {
    const tsVal = ts => ts?.seconds ?? (ts?.toDate ? ts.toDate().getTime() / 1000 : 0);
    return book.reads.reduce((best, r) =>
      tsVal(r.finishedAt) > tsVal(best.finishedAt) ? r : best, book.reads[0]
    ).rating || null;
  }
  return book.rating || null;
}

// Partitions and sorts a books array into { reading, finished, dnf }.
export function sortBooks(books) {
  const reading = books
    .filter(b => b.status === 'reading')
    .sort((a, b) => tsOf(b, 'addedAt') - tsOf(a, 'addedAt'));
  const finished = books
    .filter(b => b.status === 'finished')
    .sort((a, b) => {
      const bTs = tsOf(b, 'finishedAt') || tsOf(b, 'addedAt');
      const aTs = tsOf(a, 'finishedAt') || tsOf(a, 'addedAt');
      return bTs - aTs;
    });
  const dnf = books
    .filter(b => b.status === 'dnf')
    .sort((a, b) => tsOf(b, 'addedAt') - tsOf(a, 'addedAt'));
  return { reading, finished, dnf };
}

// Returns an array of string flags for fields missing from a book record.
export function bookMissingFlags(book) {
  const flags = [];
  if (!book.coverUrl)           flags.push('no-cover');
  if (!book.country)            flags.push('no-country');
  if (!book.authorGender)       flags.push('no-gender');
  if (!book.genres?.length)     flags.push('no-genre');
  if (book.releaseYear == null) flags.push('no-year');
  if (!book.totalPages)         flags.push('no-pages');
  if (!book.language)           flags.push('no-language');
  if (!book.format)             flags.push('no-format');
  return flags;
}

// True when a viewer should only see the owner's public lists.
//
// An omitted viewerUid means the owner is loading their own data, not that an
// anonymous stranger is: treating undefined as "someone else" filtered owners
// out of their own list count and reported 0 lists on every profile.
export function viewerSeesOnlyPublic(ownerUid, viewerUid) {
  return viewerUid !== undefined && viewerUid !== null && viewerUid !== ownerUid;
}

// Groups finished books into duplicate clusters by gbid or title+author key.
// Returns only groups with more than one entry.
export function computeDupeGroups(bookList) {
  const groups = new Map();
  for (const book of bookList.filter(b => b.status === 'finished')) {
    const key = book.gbid?.trim()
      ? `g:${book.gbid.trim()}`
      : (book.title && book.author)
        ? `t:${book.title.toLowerCase().trim()}||${book.author.toLowerCase().trim()}`
        : null;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(book);
  }
  return [...groups.values()].filter(g => g.length > 1);
}
