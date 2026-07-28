import { getHcCache, setHcCache } from './firebase.js';

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
  return result;
}

// Goodreads exports titles like "The Name of the Wind (The Kingkiller Chronicle, #1)"
// and authors like "Sanderson, Brandon" - clean both before searching.
export function cleanTitle(t)  { return (t || '').replace(/\s*\([^)]*#\s*\d+[^)]*\)/g, '').trim(); }
export function cleanAuthor(a) { return (a || '').replace(/^([^,]+),\s*(.+)$/, '$2 $1').trim(); }

const STUDY_GUIDE_RE = /\b(sparknotes?|cliffsnotes?|shmoop|study guide|bookrags|novelguide|gradesaver|litcharts?|supersummary|a-level notes?)\b/i;

export async function searchHardcover(q) {
  const data = await hcQuery(
    `query($q:String!){search(query:$q,query_type:"Book",per_page:5){results}}`, { q }
  );
  const hits = data?.data?.search?.results?.hits || [];
  for (const hit of hits) {
    const doc = hit?.document;
    if (!doc?.slug) continue;
    const titleStr  = doc.title || '';
    const authorStr = Array.isArray(doc.author_names) ? doc.author_names.join(' ') : (doc.author_names || '');
    if (STUDY_GUIDE_RE.test(titleStr) || STUDY_GUIDE_RE.test(authorStr)) continue;
    return doc;
  }
  return null;
}

// Converts a Hardcover API result to the flat format stored in hc_cache.
function toCacheEntry(hc) {
  return { slug: hc.slug, coverUrl: hc.image?.url || '', pages: hc.pages || 0, release_year: hc.release_year || null };
}

// Converts a cache entry back to the shape applyHardcoverBook expects.
function fromCacheEntry(c) {
  return { slug: c.slug, pages: c.pages, release_year: c.release_year, image: { url: c.coverUrl || '' } };
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

  return results;
}

export async function enrichFromHardcover(book) {
  const [result] = await enrichBatch([book]);
  return result;
}
