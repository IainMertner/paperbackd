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

// ── Work identity ─────────────────────────────────────────────────────────────
//
// `gbid` holds a Hardcover *slug*, which identifies one edition-level record.
// Two records for the same work — a translation ("De ansatte" / "The Employees")
// or a split volume ("Dungeon Crawler Carl, Vol. 1") — have different slugs and
// so read as different books.
//
// `workId` sits above that. It is one of:
//   'local:<id>'  a merge you made by hand; always wins, never overwritten
//   'hc:<id>'     Hardcover's own grouping (canonical_id, else parent_book_id,
//                 else the book's own id)
// A book with no workId falls back to slug, then title+author — exactly the
// behaviour that existed before workId, so untouched libraries are unaffected.

export const HARDCOVER_WORK_PREFIX = 'hc:';

// Work id for a Hardcover book record, from canonical_id — the field that
// merges translations, reissues and alternate editions of one work.
//
// parent_book_id is deliberately NOT used. It links previews and sample
// chapters to the full book ("A Game Of Thrones preview" -> "A Game of
// Thrones"), and each volume of a split edition to the whole (four French
// volumes all point at "A Storm of Swords"). Grouping on it would let an
// automatic merge delete genuinely separate entries. Pairs Hardcover does not
// link are handled globally by an admin remap instead.
export function hardcoverWorkId(hc) {
  if (!hc) return null;
  const id = hc.canonical_id ?? hc.id;
  return id == null ? null : `${HARDCOVER_WORK_PREFIX}${id}`;
}

// Rewrites Hardcover search results through the admin remap table, so a search
// for a record that has been remapped surfaces the record it points at.
// Searching "De ansatte" returns "The Employees" instead.
//
// Substituted results are deduplicated: if a search returns both the remapped
// record and its target, only one entry survives, keeping its original rank.
// Chains are followed one hop only — a remap pointing at another remapped slug
// resolves to the second target, and a cycle stops rather than looping.
export function applyBookRemaps(docs, remaps) {
  if (!Array.isArray(docs) || !remaps) return Array.isArray(docs) ? docs : [];
  const out = [];
  const indexOfSlug = new Map();

  for (const doc of docs) {
    const { slug: finalSlug, target } = walkRemap(doc?.slug, remaps);
    const resolved = !finalSlug || finalSlug === doc?.slug ? doc : {
      ...doc,
      slug:          finalSlug,
      title:         target?.title       ?? doc.title,
      author_names:  target?.author      ? [target.author] : doc.author_names,
      // Search results carry `image`, the author page's query carries
      // `cached_image` — set both so a substitute keeps its cover either way.
      image:         target?.coverUrl    ? { url: target.coverUrl } : doc.image,
      cached_image:  target?.coverUrl    ? { url: target.coverUrl } : doc.cached_image,
      release_year:  target?.releaseYear ?? doc.release_year,
      _remappedFrom: doc.slug,
    };

    if (!resolved.slug) { out.push(resolved); continue; }
    const existing = indexOfSlug.get(resolved.slug);
    if (existing === undefined) {
      indexOfSlug.set(resolved.slug, out.length);
      out.push(resolved);
    } else if (out[existing]._remappedFrom && !resolved._remappedFrom) {
      // The genuine record beats a substituted stand-in, but keeps the rank
      // the substituted one had — its fields are authoritative (real cover,
      // real author list) where the stand-in only carries what the remap
      // table stored.
      out[existing] = resolved;
    }
  }
  return out;
}

// Walks a slug through the remap table, returning the final slug together with
// the table entry that produced it — metadata must come from the last hop, not
// the first, or a chained remap would show an intermediate title.
function walkRemap(slug, remaps) {
  if (!slug || !remaps) return { slug: slug || null, target: null };
  const visited = new Set();
  let current = slug;
  let target = null;
  while (remaps[current]?.slug && !visited.has(current)) {
    visited.add(current);
    const next = remaps[current].slug;
    if (visited.has(next)) break;
    target = remaps[current];
    current = next;
  }
  return { slug: current, target };
}

// Final slug for a possibly-remapped one. Returns it unchanged when nothing
// redirects it, and stops on a cycle rather than looping forever.
export function resolveRemappedSlug(slug, remaps) {
  return walkRemap(slug, remaps).slug;
}

// The key two books must share to be considered the same work.
export function workKey(book) {
  if (!book) return null;
  if (book.workId) return `w:${book.workId}`;
  if (book.gbid?.trim()) return `g:${book.gbid.trim()}`;
  if (book.title && book.author) {
    return `t:${book.title.toLowerCase().trim()}||${book.author.toLowerCase().trim()}`;
  }
  return null;
}

// Reads for a book in the modern multi-read shape, synthesising one entry for
// a legacy single-read record. Unlike getReads this always yields an entry, so
// a merge never silently drops a book that has no finishedAt.
function readsForMerge(book) {
  if (book.reads?.length) return book.reads;
  return [{
    startedAt: book.addedAt || null, startedAtPrecision: book.addedAtPrecision || null,
    finishedAt: book.finishedAt || null, finishedAtPrecision: book.finishedAtPrecision || null,
    rating: book.rating ?? null, review: book.review || null,
    language: book.language || null, format: book.format || null,
  }];
}

// Decides how to fold a group of same-work books into a single entry.
// Pure: returns the plan, writes nothing.
//
// The survivor is whichever record carries the most metadata, ties broken by
// whichever was added first. Its reads absorb everyone else's, deduplicated by
// finish date so re-running a merge cannot inflate the read count.
export function planWorkMerge(group) {
  if (!group || group.length < 2) return null;
  const tsVal = ts => ts?.seconds ?? (ts?.toDate ? ts.toDate().getTime() / 1000 : 0);
  const score = b =>
    (b.coverUrl ? 3 : 0) + (b.totalPages > 0 ? 2 : 0) +
    (b.author ? 1 : 0) + (b.releaseYear ? 1 : 0) + (b.country ? 1 : 0);

  const sorted = [...group].sort((a, b) => {
    const ds = score(b) - score(a);
    return ds !== 0 ? ds : tsVal(a.addedAt) - tsVal(b.addedAt);
  });
  const primary = sorted[0];
  const secondaries = sorted.slice(1);

  const allReads = readsForMerge(primary).concat(...secondaries.map(readsForMerge));
  const seen = new Set();
  const mergedReads = allReads.filter(r => {
    const key = r.finishedAt?.seconds ?? r.finishedAt?.toDate?.()?.getTime?.();
    if (key == null) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const metaUpdates = {};
  for (const s of secondaries) {
    if (!primary.coverUrl    && s.coverUrl)    metaUpdates.coverUrl    = s.coverUrl;
    if (!primary.totalPages  && s.totalPages)  metaUpdates.totalPages  = s.totalPages;
    if (!primary.author      && s.author)      metaUpdates.author      = s.author;
    if (!primary.releaseYear && s.releaseYear) metaUpdates.releaseYear = s.releaseYear;
    if (!primary.country     && s.country)     metaUpdates.country     = s.country;
    if (!primary.gbid        && s.gbid)        metaUpdates.gbid        = s.gbid;
  }

  const mostRecent = [...mergedReads].sort((a, b) => tsVal(b.finishedAt) - tsVal(a.finishedAt))[0];
  if (mostRecent?.rating != null) metaUpdates.rating     = mostRecent.rating;
  if (mostRecent?.review)         metaUpdates.review     = mostRecent.review;
  if (mostRecent?.finishedAt)     metaUpdates.finishedAt = mostRecent.finishedAt;

  return { primary, secondaries, mergedReads, metaUpdates };
}

// Duplicate groups that involve a given slug.
//
// Used after a remap, which creates duplicates only for the record it points
// at. Restricting to that slug keeps the remap from quietly restructuring
// unrelated duplicates that happen to be sitting in the same library.
export function dupeGroupsForSlug(bookList, slug) {
  if (!slug) return [];
  return computeDupeGroups(bookList).filter(g => g.some(b => b.gbid === slug));
}

// Groups finished books into duplicate clusters by work.
// Returns only groups with more than one entry.
export function computeDupeGroups(bookList) {
  const groups = new Map();
  for (const book of bookList.filter(b => b.status === 'finished')) {
    const key = workKey(book);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(book);
  }
  return [...groups.values()].filter(g => g.length > 1);
}

// ── Reading progress ────────────────────────────────────────────────────────
//
// Audiobooks record a percentage in progressPct; everything else records a page
// number in currentPage. Every read and write has to pick a side — writing
// currentPage for an audiobook saves cleanly and then shows no progress at all.

export const isAudiobook = book => book?.format === 'Audiobook';

// Whole-percent progress, or null when there is nothing to go on (no page count
// recorded, so a page number means nothing on its own).
export function progressPercent(book) {
  if (!book) return null;
  if (isAudiobook(book)) return Math.max(0, Math.min(100, Math.round(book.progressPct || 0)));
  const total = Number(book.totalPages) || 0;
  if (!total) return null;
  return Math.max(0, Math.min(100, Math.round(((Number(book.currentPage) || 0) / total) * 100)));
}

// What to write for a typed value, and what that leaves the book at: the
// Firestore patch, the clamped value to put back in the input, and the
// resulting percentage (null when it cannot be worked out).
export function progressUpdate(book, raw) {
  const typed = Math.max(0, Math.floor(Number(raw) || 0));
  if (isAudiobook(book)) {
    const pct = Math.min(100, typed);
    return { updates: { progressPct: pct }, value: pct, pct };
  }
  const total = Number(book.totalPages) || 0;
  const page = total ? Math.min(typed, total) : typed;
  return {
    updates: { currentPage: page },
    value: page,
    pct: total ? Math.round((page / total) * 100) : null,
  };
}

// How far along someone is, as text: "141 / 272", or "40%" for an audiobook.
// Used where progress is shown but not edited — somebody else's book.
export function progressText(book) {
  if (isAudiobook(book)) return `${Math.max(0, Math.min(100, Math.round(book.progressPct || 0)))}%`;
  return `${book.currentPage || 0} / ${book.totalPages || '?'}`;
}

// Orders the currently-reading rows shown on home and on /reading/: you first,
// then everyone else by whoever picked up a book most recently.
//
// Shared because the two pages have to agree. Rows are { reader, books }, and a
// reader is identified by uid.
export function orderReaders(rows, selfUid) {
  const latest = books => (books || []).reduce((max, bk) => Math.max(max, bk.addedAt?.seconds ?? 0), 0);
  return [...rows].sort((a, b) => {
    const aSelf = a.reader?.uid === selfUid;
    const bSelf = b.reader?.uid === selfUid;
    if (aSelf !== bSelf) return aSelf ? -1 : 1;
    return latest(b.books) - latest(a.books);
  });
}

// Link into a library, optionally somebody else's and optionally opening a
// particular book. The library reads ?u= to pick whose shelf to show and ?book=
// to click the matching cell open.
//
// An empty gbid is left out entirely rather than sent as ?book=: the page turns
// it into a [data-gbid=""] selector, which matches the first book that also
// lacks a gbid and confidently opens the wrong one.
export function libraryLink({ username, gbid } = {}) {
  const parts = [];
  if (username) parts.push(`u=${encodeURIComponent(username)}`);
  if (gbid) parts.push(`book=${encodeURIComponent(gbid)}`);
  return `../library/${parts.length ? `?${parts.join('&')}` : ''}`;
}

// ── ISBN ────────────────────────────────────────────────────────────────────
//
// The only book identifier that means anything outside the API it came from.
// Everything else on a book here — the slug in `gbid`, `workId` — is a key into
// Hardcover's namespace, so a second source, or none, leaves nothing to join
// on. Captured on add because it is free at that moment and expensive later:
// backfilling means re-querying the API for the whole back catalogue.

// A valid ISBN-13 is 13 digits. Hyphens and spaces are common in exported data.
export function normaliseIsbn13(raw) {
  const digits = String(raw ?? '').replace(/[\s-]/g, '');
  return /^\d{13}$/.test(digits) ? digits : '';
}

// Picks the ISBN to keep from the editions an API returned.
//
// English first, deliberately: a book's editions come back in no useful order,
// so an unfiltered list hands you the German or Russian printing as often as
// not. Which edition a reader actually owns is unknowable from a work-level
// record, so this is a join hint rather than a fact about their copy — but a
// hint that resolves to the right work is the whole point.
export function pickIsbn13(preferred = [], fallback = []) {
  for (const list of [preferred, fallback]) {
    for (const entry of list || []) {
      const isbn = normaliseIsbn13(typeof entry === 'string' ? entry : entry?.isbn_13);
      if (isbn) return isbn;
    }
  }
  return '';
}

// The set worth caching per book: enough to survive one of them being wrong or
// unknown to whatever catalogue is being matched against, without storing every
// printing ever made.
export function collectIsbn13s(preferred = [], fallback = [], limit = 6) {
  const seen = new Set();
  for (const list of [preferred, fallback]) {
    for (const entry of list || []) {
      const isbn = normaliseIsbn13(typeof entry === 'string' ? entry : entry?.isbn_13);
      if (isbn) seen.add(isbn);
      if (seen.size >= limit) return [...seen];
    }
  }
  return [...seen];
}

// Languages offered wherever a book language is chosen — the per-book editors
// in the library and the default in settings. Shared so the two never drift.
export const BOOK_LANGUAGES = ['Afrikaans','Albanian','Arabic','Armenian','Azerbaijani','Basque','Belarusian','Bengali','Bosnian','Bulgarian','Catalan','Chinese (Simplified)','Chinese (Traditional)','Croatian','Czech','Danish','Dutch','English','Estonian','Finnish','French','Galician','Georgian','German','Greek','Gujarati','Hebrew','Hindi','Hungarian','Icelandic','Indonesian','Irish','Italian','Japanese','Kannada','Kazakh','Korean','Latvian','Lithuanian','Macedonian','Malay','Malayalam','Maltese','Marathi','Mongolian','Norwegian','Persian','Polish','Portuguese','Punjabi','Romanian','Russian','Serbian','Slovak','Slovenian','Spanish','Swahili','Swedish','Tamil','Telugu','Thai','Turkish','Ukrainian','Urdu','Uzbek','Vietnamese','Welsh'];
