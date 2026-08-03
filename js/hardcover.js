import { getHcCache, setHcCache, getBookRemaps } from './firebase.js';
import { cleanTitle, cleanAuthor } from './utils.js';
import { hardcoverWorkId, applyBookRemaps } from './book-utils.js';

export const HARDCOVER_PROXY = 'https://frosty-paper-e53b.phixel66.workers.dev/';

export async function hcQuery(query, variables, retries = 3) {
  const res = await fetch(HARDCOVER_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  if (res.status === 429) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1500));
      return hcQuery(query, variables, retries - 1);
    }
    throw new Error('HTTP 429');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function applyHardcoverBook(book, hc) {
  if (!hc) return book;
  const result = {
    ...book,
    gbid:        hc.slug || book.gbid,
    coverUrl:    hc.image?.url || hc.coverUrl || book.coverUrl || '',
    totalPages:  hc.pages || book.totalPages,
    currentPage: book.status === 'finished' ? (hc.pages || book.totalPages) : book.currentPage,
    _hardcoverMatched: true,
  };
  if (hc.release_year) result.releaseYear = hc.release_year;
  // Work-level identity, so translations and split volumes of one book group
  const workId = hc.workId || hardcoverWorkId(hc) || book.workId;
  if (workId) result.workId = workId;
  return result;
}

export { cleanTitle, cleanAuthor };

const STUDY_GUIDE_RE = /\b(sparknotes?|cliffsnotes?|shmoop|study guide|bookrags|novelguide|gradesaver|litcharts?|supersummary|a-level notes?)\b/i;

// Runs a Hardcover book search and rewrites the results through the admin remap
// table, so a record an admin has redirected never surfaces again — searching
// "De ansatte" returns "The Employees". Every book search in the app goes
// through here so the redirect is consistent everywhere.
export async function searchBooks(q, perPage = 20) {
  const data = await hcQuery(
    `query($q:String!,$n:Int!){search(query:$q,query_type:"Book",per_page:$n){results}}`,
    { q, n: perPage }
  );
  const docs = (data?.data?.search?.results?.hits || []).map(h => h.document).filter(Boolean);
  return applyBookRemaps(docs, await getBookRemaps());
}

export async function searchHardcover(q) {
  const docs = await searchBooks(q, 5);
  for (const doc of docs) {
    if (!doc?.slug) continue;
    const titleStr  = doc.title || '';
    const authorStr = Array.isArray(doc.author_names) ? doc.author_names.join(' ') : (doc.author_names || '');
    if (STUDY_GUIDE_RE.test(titleStr) || STUDY_GUIDE_RE.test(authorStr)) continue;
    return doc;
  }
  return null;
}

// Converts a Hardcover API result to the flat format stored in hc_cache.
function toCacheEntry(hc, workId = null) {
  const entry = { slug: hc.slug, coverUrl: hc.image?.url || '', pages: hc.pages || 0, release_year: hc.release_year || null };
  if (workId) entry.workId = workId;
  return entry;
}

// Converts a cache entry back to the shape applyHardcoverBook expects.
function fromCacheEntry(c) {
  const hc = { slug: c.slug, pages: c.pages, release_year: c.release_year, image: { url: c.coverUrl || '' } };
  if (c.workId) hc.workId = c.workId;
  return hc;
}

// Cache key for a title+author search query.
function titleCacheKey(title, author) {
  return 'q__' + (title + '|' + (author || '')).toLowerCase().replace(/[^a-z0-9|]/g, '_').slice(0, 200);
}

// Batch-resolve Goodreads IDs and ISBNs in a single query each, then do
// individual title searches only for the remainder. Cache hits skip Hardcover entirely.
export async function enrichBatch(books, onProgress) {
  const results = books.map(b => ({ ...b }));
  const byIdx   = new Map(results.map((b, i) => [i, b]));

  // ── Step 1: Goodreads ID lookup ─────────────────────────────────────────────
  const grIdEntries = results.map((b, i) => [i, parseInt(b._grId)]).filter(([, id]) => !isNaN(id));
  if (grIdEntries.length) {
    const cached = await Promise.all(grIdEntries.map(([, id]) => getHcCache(`gr__${id}`)));
    const misses = [];
    grIdEntries.forEach(([i, id], idx) => {
      if (cached[idx]?.slug) Object.assign(byIdx.get(i), applyHardcoverBook(byIdx.get(i), fromCacheEntry(cached[idx])));
      else misses.push([i, id]);
    });

    const CHUNK = 100;
    for (let c = 0; c < misses.length; c += CHUNK) {
      const chunk = misses.slice(c, c + CHUNK);
      try {
        const data = await hcQuery(
          `query($ids:[Int!]!){books(where:{goodreads_id:{_in:$ids}},limit:100){goodreads_id slug pages release_year image{url}}}`,
          { ids: chunk.map(([, id]) => id) }
        );
        const byGrId = new Map((data?.data?.books || []).map(b => [b.goodreads_id, b]));
        const writes = [];
        chunk.forEach(([i, id]) => {
          const hc = byGrId.get(id);
          if (hc?.slug) {
            Object.assign(byIdx.get(i), applyHardcoverBook(byIdx.get(i), hc));
            const entry = toCacheEntry(hc);
            writes.push(setHcCache(`gr__${id}`, entry), setHcCache(hc.slug, entry));
          }
        });
        await Promise.all(writes);
      } catch (e) { console.warn('GR ID batch failed', e); }
    }
  }

  // ── Step 2: ISBN-13 lookup ───────────────────────────────────────────────────
  const isbnEntries = results.map((b, i) => [i, b._isbn13]).filter(([i, isbn]) => isbn && !results[i]._hardcoverMatched);
  if (isbnEntries.length) {
    const cached = await Promise.all(isbnEntries.map(([, isbn]) => getHcCache(`isbn__${isbn}`)));
    const misses = [];
    isbnEntries.forEach(([i, isbn], idx) => {
      if (cached[idx]?.slug) Object.assign(byIdx.get(i), applyHardcoverBook(byIdx.get(i), fromCacheEntry(cached[idx])));
      else misses.push([i, isbn]);
    });

    const CHUNK = 100;
    for (let c = 0; c < misses.length; c += CHUNK) {
      const chunk = misses.slice(c, c + CHUNK);
      try {
        const data = await hcQuery(
          `query($isbns:[String!]!){editions(where:{isbn_13:{_in:$isbns}},limit:100){isbn_13 book{slug pages release_year image{url}}}}`,
          { isbns: chunk.map(([, isbn]) => isbn) }
        );
        const byIsbn = new Map((data?.data?.editions || []).map(e => [e.isbn_13, e.book]));
        const writes = [];
        chunk.forEach(([i, isbn]) => {
          const hc = byIsbn.get(isbn);
          if (hc?.slug) {
            Object.assign(byIdx.get(i), applyHardcoverBook(byIdx.get(i), hc));
            const entry = toCacheEntry(hc);
            writes.push(setHcCache(`isbn__${isbn}`, entry), setHcCache(hc.slug, entry));
          }
        });
        await Promise.all(writes);
      } catch (e) { console.warn('ISBN batch failed', e); }
    }
  }

  // ── Step 3: title search for remaining unmatched ─────────────────────────────
  const unmatched = results.map((b, i) => [i, b]).filter(([, b]) => !b._hardcoverMatched);
  for (let u = 0; u < unmatched.length; u++) {
    const [i, book] = unmatched[u];
    if (onProgress) onProgress(u, unmatched.length, book.title);
    try {
      const title  = cleanTitle(book.title);
      const author = cleanAuthor(book.author);
      const qKey   = titleCacheKey(title, author);

      const qHit = await getHcCache(qKey);
      if (qHit?.slug) {
        Object.assign(byIdx.get(i), applyHardcoverBook(byIdx.get(i), fromCacheEntry(qHit)));
        continue;
      }

      let doc = await searchHardcover(`${title} ${author}`.trim());
      if (!doc && author) doc = await searchHardcover(title);
      if (doc) {
        Object.assign(byIdx.get(i), applyHardcoverBook(book, { slug: doc.slug, pages: doc.pages, release_year: doc.release_year, image: doc.image }));
        const entry = toCacheEntry(doc);
        await Promise.all([setHcCache(doc.slug, entry), setHcCache(qKey, entry)]);
      }
    } catch (e) { console.warn('Title search failed for', book.title, e); }
  }

  // ── Step 4: resolve work ids ─────────────────────────────────────────────────
  await resolveWorkIds(results);

  return results;
}

// Fills in `workId` for every matched book that still lacks one.
//
// The search endpoint does not expose canonical_id, and neither do the batch
// queries above, so work identity is resolved here in one pass keyed by slug.
// Doing it as a separate step also repairs books that matched from a cache
// entry written before work ids existed.
export async function resolveWorkIds(books) {
  const pending = books
    .map((b, i) => [i, b])
    .filter(([, b]) => b.gbid && !b.workId);
  if (!pending.length) return books;

  // Cache first — a slug's work id never changes unless Hardcover re-merges it.
  const cached = await Promise.all(pending.map(([, b]) => getHcCache(b.gbid).catch(() => null)));
  const misses = [];
  pending.forEach(([i, b], n) => {
    const hit = cached[n];
    if (hit?.workId) books[i].workId = hit.workId;
    else misses.push([i, b.gbid]);
  });
  if (!misses.length) return books;

  const CHUNK = 100;
  for (let c = 0; c < misses.length; c += CHUNK) {
    const chunk = misses.slice(c, c + CHUNK);
    try {
      const data = await hcQuery(
        `query($slugs:[String!]!){books(where:{slug:{_in:$slugs}},limit:100){id slug canonical_id parent_book_id pages release_year image{url}}}`,
        { slugs: chunk.map(([, slug]) => slug) }
      );
      const bySlug = new Map((data?.data?.books || []).map(b => [b.slug, b]));
      const writes = [];
      for (const [i, slug] of chunk) {
        const hc = bySlug.get(slug);
        const workId = hardcoverWorkId(hc);
        if (!workId) continue;
        books[i].workId = workId;
        writes.push(setHcCache(slug, toCacheEntry(hc, workId)));
      }
      await Promise.all(writes);
    } catch (e) { console.warn('Work id batch failed', e); }
  }
  return books;
}

// Work id for a single Hardcover slug, for the add-a-book paths.
// Cache-first, so this is usually one Firestore read and no Hardcover call.
// Never throws: a book must still be addable if the lookup fails.
export async function workIdForSlug(slug) {
  if (!slug) return null;
  try {
    const [out] = await resolveWorkIds([{ gbid: slug }]);
    return out?.workId || null;
  } catch (e) {
    console.warn('Work id lookup failed for', slug, e);
    return null;
  }
}

export async function enrichFromHardcover(book) {
  const [result] = await enrichBatch([book]);
  return result;
}
