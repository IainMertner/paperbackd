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
