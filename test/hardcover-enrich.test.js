// Tests for the Hardcover network layer: hcQuery retry behaviour, the
// study-guide filter in searchHardcover, and the three-stage enrichBatch
// pipeline (Goodreads ID → ISBN-13 → title search, each cache-first).

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const getHcCache = vi.fn();
const setHcCache = vi.fn();

vi.mock('../js/firebase.js', () => ({
  getHcCache: (...a) => getHcCache(...a),
  setHcCache: (...a) => setHcCache(...a),
}));

import {
  hcQuery, searchHardcover, enrichBatch, enrichFromHardcover, HARDCOVER_PROXY,
} from '../js/hardcover.js';

// Builds a fetch Response stand-in.
const jsonRes = (body, { ok = true, status = 200 } = {}) => ({
  ok, status, json: async () => body,
});

// Wraps hits in the shape the Hardcover search endpoint returns.
const searchRes = docs => jsonRes({
  data: { search: { results: { hits: docs.map(document => ({ document })) } } },
});

beforeEach(() => {
  getHcCache.mockReset().mockResolvedValue(null);
  setHcCache.mockReset().mockResolvedValue(undefined);
  global.fetch = vi.fn();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ── hcQuery ───────────────────────────────────────────────────────────────────

describe('hcQuery', () => {
  it('posts to the proxy URL', async () => {
    global.fetch.mockResolvedValue(jsonRes({ data: {} }));
    await hcQuery('query{x}', {});
    expect(global.fetch).toHaveBeenCalledWith(HARDCOVER_PROXY, expect.any(Object));
  });

  it('uses POST', async () => {
    global.fetch.mockResolvedValue(jsonRes({ data: {} }));
    await hcQuery('query{x}', {});
    expect(global.fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('sends a JSON content-type header', async () => {
    global.fetch.mockResolvedValue(jsonRes({ data: {} }));
    await hcQuery('query{x}', {});
    expect(global.fetch.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
  });

  it('serialises query and variables into the body', async () => {
    global.fetch.mockResolvedValue(jsonRes({ data: {} }));
    await hcQuery('query($q:String!){x}', { q: 'dune' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual({ query: 'query($q:String!){x}', variables: { q: 'dune' } });
  });

  it('returns the parsed JSON body', async () => {
    global.fetch.mockResolvedValue(jsonRes({ data: { books: [1, 2] } }));
    await expect(hcQuery('q', {})).resolves.toEqual({ data: { books: [1, 2] } });
  });

  it('throws with the status code on a non-ok response', async () => {
    global.fetch.mockResolvedValue(jsonRes({}, { ok: false, status: 500 }));
    await expect(hcQuery('q', {})).rejects.toThrow('HTTP 500');
  });

  it('throws on 404', async () => {
    global.fetch.mockResolvedValue(jsonRes({}, { ok: false, status: 404 }));
    await expect(hcQuery('q', {})).rejects.toThrow('HTTP 404');
  });

  it('does not retry a non-429 failure', async () => {
    global.fetch.mockResolvedValue(jsonRes({}, { ok: false, status: 500 }));
    await expect(hcQuery('q', {})).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries after a 429 and returns the eventual success', async () => {
    vi.useFakeTimers();
    global.fetch
      .mockResolvedValueOnce(jsonRes({}, { ok: false, status: 429 }))
      .mockResolvedValueOnce(jsonRes({ data: { ok: true } }));
    const p = hcQuery('q', {});
    await vi.advanceTimersByTimeAsync(1500);
    await expect(p).resolves.toEqual({ data: { ok: true } });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('waits 1500ms between 429 retries', async () => {
    vi.useFakeTimers();
    global.fetch
      .mockResolvedValueOnce(jsonRes({}, { ok: false, status: 429 }))
      .mockResolvedValueOnce(jsonRes({ data: {} }));
    const p = hcQuery('q', {});
    await vi.advanceTimersByTimeAsync(1400);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    await p;
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry budget and throws HTTP 429', async () => {
    vi.useFakeTimers();
    global.fetch.mockResolvedValue(jsonRes({}, { ok: false, status: 429 }));
    const p = hcQuery('q', {});
    const assertion = expect(p).rejects.toThrow('HTTP 429');
    await vi.advanceTimersByTimeAsync(1500 * 5);
    await assertion;
  });

  it('makes exactly four attempts with the default retry budget', async () => {
    vi.useFakeTimers();
    global.fetch.mockResolvedValue(jsonRes({}, { ok: false, status: 429 }));
    const p = hcQuery('q', {});
    const assertion = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1500 * 5);
    await assertion;
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('honours an explicit retry count of 0', async () => {
    global.fetch.mockResolvedValue(jsonRes({}, { ok: false, status: 429 }));
    await expect(hcQuery('q', {}, 0)).rejects.toThrow('HTTP 429');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('honours an explicit retry count of 1', async () => {
    vi.useFakeTimers();
    global.fetch.mockResolvedValue(jsonRes({}, { ok: false, status: 429 }));
    const p = hcQuery('q', {}, 1);
    const assertion = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1500 * 3);
    await assertion;
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('propagates a network-level rejection', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    await expect(hcQuery('q', {})).rejects.toThrow('network down');
  });
});

// ── searchHardcover ───────────────────────────────────────────────────────────

describe('searchHardcover', () => {
  it('returns the first hit with a slug', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'dune', title: 'Dune' }]));
    await expect(searchHardcover('dune')).resolves.toMatchObject({ slug: 'dune' });
  });

  it('passes the query through as a GraphQL variable', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'dune' }]));
    await searchHardcover('dune frank herbert');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.variables.q).toBe('dune frank herbert');
  });

  it('returns null when there are no hits', async () => {
    global.fetch.mockResolvedValue(searchRes([]));
    await expect(searchHardcover('nothing')).resolves.toBeNull();
  });

  it('returns null when the response has no search key', async () => {
    global.fetch.mockResolvedValue(jsonRes({ data: {} }));
    await expect(searchHardcover('x')).resolves.toBeNull();
  });

  it('returns null when the response body is empty', async () => {
    global.fetch.mockResolvedValue(jsonRes({}));
    await expect(searchHardcover('x')).resolves.toBeNull();
  });

  it('skips hits with no slug and takes the next one', async () => {
    global.fetch.mockResolvedValue(searchRes([{ title: 'No Slug' }, { slug: 'real', title: 'Real' }]));
    await expect(searchHardcover('x')).resolves.toMatchObject({ slug: 'real' });
  });

  it('skips a null document', async () => {
    global.fetch.mockResolvedValue(jsonRes({
      data: { search: { results: { hits: [{ document: null }, { document: { slug: 'ok' } }] } } },
    }));
    await expect(searchHardcover('x')).resolves.toMatchObject({ slug: 'ok' });
  });

  it('handles author_names given as an array', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'd', title: 'Dune', author_names: ['Frank Herbert'] }]));
    await expect(searchHardcover('x')).resolves.toMatchObject({ slug: 'd' });
  });

  it('handles author_names given as a bare string', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'd', title: 'Dune', author_names: 'Frank Herbert' }]));
    await expect(searchHardcover('x')).resolves.toMatchObject({ slug: 'd' });
  });

  const STUDY_GUIDE_TITLES = [
    'SparkNotes: Dune', 'Sparknote on Hamlet', 'CliffsNotes on Macbeth',
    'Cliffsnote: The Odyssey', 'Shmoop Guide to Beowulf',
    'A Study Guide for Frankenstein', 'BookRags Summary: 1984',
    'NovelGuide to Ulysses', 'GradeSaver ClassicNotes', 'LitCharts: The Trial',
    'LitChart on Antigone', 'SuperSummary of Dracula', 'A-Level Notes on Chaucer',
  ];

  it.each(STUDY_GUIDE_TITLES)('filters out the study guide %s', async title => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'guide', title }, { slug: 'real', title: 'The Real Book' }]));
    await expect(searchHardcover('x')).resolves.toMatchObject({ slug: 'real' });
  });

  it.each(['SparkNotes', 'CliffsNotes', 'Shmoop', 'BookRags', 'GradeSaver', 'SuperSummary'])(
    'filters a hit whose author is %s', async author => {
      global.fetch.mockResolvedValue(searchRes([
        { slug: 'guide', title: 'Dune', author_names: [author] },
        { slug: 'real', title: 'Dune', author_names: ['Frank Herbert'] },
      ]));
      await expect(searchHardcover('x')).resolves.toMatchObject({ slug: 'real' });
    });

  it('returns null when every hit is a study guide', async () => {
    global.fetch.mockResolvedValue(searchRes([
      { slug: 'a', title: 'SparkNotes: Dune' },
      { slug: 'b', title: 'CliffsNotes on Dune' },
    ]));
    await expect(searchHardcover('x')).resolves.toBeNull();
  });

  it('matches the study-guide filter case-insensitively', async () => {
    global.fetch.mockResolvedValue(searchRes([
      { slug: 'a', title: 'sparknotes: dune' }, { slug: 'b', title: 'Dune' },
    ]));
    await expect(searchHardcover('x')).resolves.toMatchObject({ slug: 'b' });
  });

  it('does not filter a legitimate book containing a guide word as a substring', async () => {
    // "Shmoopy" is not "Shmoop" — the filter is word-bounded.
    global.fetch.mockResolvedValue(searchRes([{ slug: 'ok', title: 'The Shmoopy Adventure' }]));
    await expect(searchHardcover('x')).resolves.toMatchObject({ slug: 'ok' });
  });

  it('does not filter a book with an empty title', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'ok' }]));
    await expect(searchHardcover('x')).resolves.toMatchObject({ slug: 'ok' });
  });
});

// ── enrichBatch: Goodreads ID stage ───────────────────────────────────────────

describe('enrichBatch — Goodreads ID stage', () => {
  it('returns a result per input book', async () => {
    const out = await enrichBatch([{ title: 'A' }, { title: 'B' }]);
    expect(out).toHaveLength(2);
  });

  it('does not mutate the input array', async () => {
    const input = [{ title: 'Dune', _grId: '234225', gbid: '' }];
    getHcCache.mockResolvedValue({ slug: 'dune', pages: 412, coverUrl: '', release_year: 1965 });
    await enrichBatch(input);
    expect(input[0].gbid).toBe('');
    expect(input[0]._hardcoverMatched).toBeUndefined();
  });

  it('uses a cached Goodreads ID without hitting the network', async () => {
    getHcCache.mockResolvedValue({ slug: 'dune', pages: 412, coverUrl: 'c.jpg', release_year: 1965 });
    const [book] = await enrichBatch([{ title: 'Dune', _grId: '234225' }]);
    expect(book.gbid).toBe('dune');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('applies cached page count', async () => {
    getHcCache.mockResolvedValue({ slug: 'dune', pages: 412, coverUrl: '', release_year: null });
    const [book] = await enrichBatch([{ title: 'Dune', _grId: '1' }]);
    expect(book.totalPages).toBe(412);
  });

  it('applies cached release year', async () => {
    getHcCache.mockResolvedValue({ slug: 'dune', pages: 0, coverUrl: '', release_year: 1965 });
    const [book] = await enrichBatch([{ title: 'Dune', _grId: '1' }]);
    expect(book.releaseYear).toBe(1965);
  });

  it('looks the cache up under a gr__ prefixed key', async () => {
    getHcCache.mockResolvedValue({ slug: 'dune', pages: 1, coverUrl: '', release_year: null });
    await enrichBatch([{ title: 'Dune', _grId: '234225' }]);
    expect(getHcCache).toHaveBeenCalledWith('gr__234225');
  });

  it('queries Hardcover on a cache miss', async () => {
    global.fetch.mockResolvedValue(jsonRes({
      data: { books: [{ goodreads_id: 234225, slug: 'dune', pages: 412, release_year: 1965, image: { url: 'c.jpg' } }] },
    }));
    const [book] = await enrichBatch([{ title: 'Dune', _grId: '234225' }]);
    expect(book.gbid).toBe('dune');
    expect(book._hardcoverMatched).toBe(true);
  });

  it('sends the numeric ids as query variables', async () => {
    global.fetch.mockResolvedValue(jsonRes({ data: { books: [] } }));
    await enrichBatch([{ title: 'A', _grId: '11' }, { title: 'B', _grId: '22' }]);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.variables.ids).toEqual([11, 22]);
  });

  it('ignores books whose _grId is not numeric', async () => {
    await enrichBatch([{ title: 'A', _grId: 'not-a-number' }]);
    expect(getHcCache).not.toHaveBeenCalledWith(expect.stringContaining('gr__'));
  });

  it('ignores books with no _grId', async () => {
    await enrichBatch([{ title: 'A' }]);
    expect(global.fetch).not.toHaveBeenCalledWith(
      HARDCOVER_PROXY, expect.objectContaining({ body: expect.stringContaining('goodreads_id') }));
  });

  it('writes both the gr__ key and the slug key back to the cache', async () => {
    global.fetch.mockResolvedValue(jsonRes({
      data: { books: [{ goodreads_id: 5, slug: 'dune', pages: 412, release_year: 1965, image: { url: 'c.jpg' } }] },
    }));
    await enrichBatch([{ title: 'Dune', _grId: '5' }]);
    const keys = setHcCache.mock.calls.map(c => c[0]);
    expect(keys).toContain('gr__5');
    expect(keys).toContain('dune');
  });

  it('caches the flattened entry shape', async () => {
    global.fetch.mockResolvedValue(jsonRes({
      data: { books: [{ goodreads_id: 5, slug: 'dune', pages: 412, release_year: 1965, image: { url: 'c.jpg' } }] },
    }));
    await enrichBatch([{ title: 'Dune', _grId: '5' }]);
    expect(setHcCache.mock.calls[0][1]).toEqual({
      slug: 'dune', coverUrl: 'c.jpg', pages: 412, release_year: 1965,
    });
  });

  it('leaves a book unmatched when the id is not found', async () => {
    global.fetch.mockResolvedValue(jsonRes({ data: { books: [] } }));
    const [book] = await enrichBatch([{ title: 'Dune', _grId: '5' }]);
    expect(book._hardcoverMatched).toBeUndefined();
  });

  it('chunks more than 100 ids into separate requests', async () => {
    global.fetch.mockResolvedValue(jsonRes({ data: { books: [] } }));
    const books = Array.from({ length: 250 }, (_, i) => ({ title: `B${i}`, _grId: String(i + 1) }));
    await enrichBatch(books);
    const grCalls = global.fetch.mock.calls.filter(c => c[1].body.includes('goodreads_id'));
    expect(grCalls).toHaveLength(3);
  });

  it('sends at most 100 ids per chunk', async () => {
    global.fetch.mockResolvedValue(jsonRes({ data: { books: [] } }));
    const books = Array.from({ length: 150 }, (_, i) => ({ title: `B${i}`, _grId: String(i + 1) }));
    await enrichBatch(books);
    for (const call of global.fetch.mock.calls.filter(c => c[1].body.includes('goodreads_id'))) {
      expect(JSON.parse(call[1].body).variables.ids.length).toBeLessThanOrEqual(100);
    }
  });

  it('survives a failed Goodreads batch without throwing', async () => {
    global.fetch.mockRejectedValue(new Error('boom'));
    await expect(enrichBatch([{ title: 'Dune', _grId: '5' }])).resolves.toHaveLength(1);
  });

  it('still returns the untouched book when the batch fails', async () => {
    global.fetch.mockRejectedValue(new Error('boom'));
    const [book] = await enrichBatch([{ title: 'Dune', _grId: '5' }]);
    expect(book.title).toBe('Dune');
    expect(book._hardcoverMatched).toBeUndefined();
  });
});

// ── enrichBatch: ISBN stage ───────────────────────────────────────────────────

describe('enrichBatch — ISBN stage', () => {
  it('looks up an ISBN when there is no Goodreads id', async () => {
    getHcCache.mockResolvedValue({ slug: 'dune', pages: 412, coverUrl: '', release_year: null });
    const [book] = await enrichBatch([{ title: 'Dune', _isbn13: '9780441013593' }]);
    expect(book.gbid).toBe('dune');
  });

  it('uses an isbn__ prefixed cache key', async () => {
    getHcCache.mockResolvedValue({ slug: 'dune', pages: 1, coverUrl: '', release_year: null });
    await enrichBatch([{ title: 'Dune', _isbn13: '9780441013593' }]);
    expect(getHcCache).toHaveBeenCalledWith('isbn__9780441013593');
  });

  it('skips the ISBN lookup when the Goodreads stage already matched', async () => {
    getHcCache.mockImplementation(async key =>
      key.startsWith('gr__') ? { slug: 'dune', pages: 412, coverUrl: '', release_year: null } : null);
    await enrichBatch([{ title: 'Dune', _grId: '5', _isbn13: '9780441013593' }]);
    expect(getHcCache).not.toHaveBeenCalledWith('isbn__9780441013593');
  });

  it('unwraps the edition → book nesting from the ISBN query', async () => {
    global.fetch.mockResolvedValue(jsonRes({
      data: { editions: [{ isbn_13: '978', book: { slug: 'dune', pages: 412, release_year: 1965, image: { url: 'c.jpg' } } }] },
    }));
    const [book] = await enrichBatch([{ title: 'Dune', _isbn13: '978' }]);
    expect(book.gbid).toBe('dune');
    expect(book.totalPages).toBe(412);
  });

  it('sends the isbns as query variables', async () => {
    global.fetch.mockResolvedValue(jsonRes({ data: { editions: [] } }));
    await enrichBatch([{ title: 'A', _isbn13: '111' }, { title: 'B', _isbn13: '222' }]);
    const call = global.fetch.mock.calls.find(c => c[1].body.includes('isbn_13'));
    expect(JSON.parse(call[1].body).variables.isbns).toEqual(['111', '222']);
  });

  it('chunks more than 100 isbns', async () => {
    global.fetch.mockResolvedValue(jsonRes({ data: { editions: [] } }));
    const books = Array.from({ length: 201 }, (_, i) => ({ title: `B${i}`, _isbn13: String(i) }));
    await enrichBatch(books);
    const isbnCalls = global.fetch.mock.calls.filter(c => c[1].body.includes('isbn_13'));
    expect(isbnCalls).toHaveLength(3);
  });

  it('writes both the isbn__ key and the slug key', async () => {
    global.fetch.mockResolvedValue(jsonRes({
      data: { editions: [{ isbn_13: '978', book: { slug: 'dune', pages: 1, release_year: null, image: { url: '' } } }] },
    }));
    await enrichBatch([{ title: 'Dune', _isbn13: '978' }]);
    const keys = setHcCache.mock.calls.map(c => c[0]);
    expect(keys).toContain('isbn__978');
    expect(keys).toContain('dune');
  });

  it('survives a failed ISBN batch', async () => {
    global.fetch.mockRejectedValue(new Error('boom'));
    await expect(enrichBatch([{ title: 'Dune', _isbn13: '978' }])).resolves.toHaveLength(1);
  });

  it('ignores books with a falsy _isbn13', async () => {
    await enrichBatch([{ title: 'A', _isbn13: '' }]);
    expect(getHcCache).not.toHaveBeenCalledWith(expect.stringContaining('isbn__'));
  });
});

// ── enrichBatch: title-search stage ───────────────────────────────────────────

describe('enrichBatch — title search stage', () => {
  it('falls back to a title search for unmatched books', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'dune', title: 'Dune', pages: 412 }]));
    const [book] = await enrichBatch([{ title: 'Dune', author: 'Frank Herbert' }]);
    expect(book.gbid).toBe('dune');
  });

  it('searches with title and author combined', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'dune' }]));
    await enrichBatch([{ title: 'Dune', author: 'Frank Herbert' }]);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).variables.q).toBe('Dune Frank Herbert');
  });

  it('strips series notation from the title before searching', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'dune' }]));
    await enrichBatch([{ title: 'Dune (Dune Chronicles, #1)', author: 'Frank Herbert' }]);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).variables.q).toBe('Dune Frank Herbert');
  });

  it('flips a "Last, First" author before searching', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'dune' }]));
    await enrichBatch([{ title: 'Dune', author: 'Herbert, Frank' }]);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).variables.q).toBe('Dune Frank Herbert');
  });

  it('retries with the title alone when the combined search misses', async () => {
    global.fetch
      .mockResolvedValueOnce(searchRes([]))
      .mockResolvedValueOnce(searchRes([{ slug: 'dune' }]));
    const [book] = await enrichBatch([{ title: 'Dune', author: 'Frank Herbert' }]);
    expect(book.gbid).toBe('dune');
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).variables.q).toBe('Dune');
  });

  it('does not retry title-only when there was no author', async () => {
    global.fetch.mockResolvedValue(searchRes([]));
    await enrichBatch([{ title: 'Dune' }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses a cached title query without searching', async () => {
    getHcCache.mockResolvedValue({ slug: 'dune', pages: 412, coverUrl: '', release_year: 1965 });
    const [book] = await enrichBatch([{ title: 'Dune', author: 'Frank Herbert' }]);
    expect(book.gbid).toBe('dune');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('builds a q__ prefixed, slugified cache key', async () => {
    global.fetch.mockResolvedValue(searchRes([]));
    await enrichBatch([{ title: 'Dune', author: 'Frank Herbert' }]);
    expect(getHcCache).toHaveBeenCalledWith('q__dune|frank_herbert');
  });

  it('lowercases the title cache key', async () => {
    global.fetch.mockResolvedValue(searchRes([]));
    await enrichBatch([{ title: 'DUNE', author: 'HERBERT' }]);
    expect(getHcCache).toHaveBeenCalledWith('q__dune|herbert');
  });

  it('replaces punctuation in the cache key with underscores', async () => {
    global.fetch.mockResolvedValue(searchRes([]));
    await enrichBatch([{ title: "Child's Play!", author: 'X' }]);
    const key = getHcCache.mock.calls.at(-1)[0];
    expect(key).toMatch(/^q__[a-z0-9_|]+$/);
  });

  it('caps the cache key length', async () => {
    global.fetch.mockResolvedValue(searchRes([]));
    await enrichBatch([{ title: 'A'.repeat(500), author: 'B'.repeat(500) }]);
    const key = getHcCache.mock.calls.at(-1)[0];
    expect(key.length).toBeLessThanOrEqual(203);
  });

  it('handles a missing author when building the cache key', async () => {
    global.fetch.mockResolvedValue(searchRes([]));
    await enrichBatch([{ title: 'Dune' }]);
    expect(getHcCache).toHaveBeenCalledWith('q__dune|');
  });

  it('caches both the slug and the query key after a successful search', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'dune', pages: 412, release_year: 1965, image: { url: 'c.jpg' } }]));
    await enrichBatch([{ title: 'Dune', author: 'Frank Herbert' }]);
    const keys = setHcCache.mock.calls.map(c => c[0]);
    expect(keys).toContain('dune');
    expect(keys).toContain('q__dune|frank_herbert');
  });

  it('does not write to the cache when nothing is found', async () => {
    global.fetch.mockResolvedValue(searchRes([]));
    await enrichBatch([{ title: 'Nothing', author: 'Nobody' }]);
    expect(setHcCache).not.toHaveBeenCalled();
  });

  it('reports progress for each unmatched book', async () => {
    global.fetch.mockResolvedValue(searchRes([]));
    const onProgress = vi.fn();
    await enrichBatch([{ title: 'A' }, { title: 'B' }], onProgress);
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('passes index, total and title to onProgress', async () => {
    global.fetch.mockResolvedValue(searchRes([]));
    const onProgress = vi.fn();
    await enrichBatch([{ title: 'A' }, { title: 'B' }], onProgress);
    expect(onProgress).toHaveBeenNthCalledWith(1, 0, 2, 'A');
    expect(onProgress).toHaveBeenNthCalledWith(2, 1, 2, 'B');
  });

  it('excludes already-matched books from the progress total', async () => {
    getHcCache.mockImplementation(async key =>
      key === 'gr__1' ? { slug: 'matched', pages: 1, coverUrl: '', release_year: null } : null);
    global.fetch.mockResolvedValue(searchRes([]));
    const onProgress = vi.fn();
    await enrichBatch([{ title: 'A', _grId: '1' }, { title: 'B' }], onProgress);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(0, 1, 'B');
  });

  it('works without an onProgress callback', async () => {
    global.fetch.mockResolvedValue(searchRes([]));
    await expect(enrichBatch([{ title: 'A' }])).resolves.toHaveLength(1);
  });

  it('continues past a failing title search', async () => {
    global.fetch
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(searchRes([{ slug: 'second' }]));
    const out = await enrichBatch([{ title: 'A' }, { title: 'B' }]);
    expect(out).toHaveLength(2);
    expect(out[1].gbid).toBe('second');
  });

  it('skips the title stage entirely when everything already matched', async () => {
    getHcCache.mockResolvedValue({ slug: 'x', pages: 1, coverUrl: '', release_year: null });
    await enrichBatch([{ title: 'A', _grId: '1' }]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── enrichBatch: whole-pipeline behaviour ─────────────────────────────────────

describe('enrichBatch — pipeline', () => {
  it('handles an empty input array', async () => {
    await expect(enrichBatch([])).resolves.toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('preserves input order across mixed match routes', async () => {
    getHcCache.mockImplementation(async key =>
      key === 'gr__1' ? { slug: 'by-gr', pages: 1, coverUrl: '', release_year: null } : null);
    global.fetch.mockResolvedValue(searchRes([{ slug: 'by-title' }]));
    const out = await enrichBatch([
      { title: 'First', _grId: '1' },
      { title: 'Second' },
    ]);
    expect(out[0].title).toBe('First');
    expect(out[0].gbid).toBe('by-gr');
    expect(out[1].title).toBe('Second');
    expect(out[1].gbid).toBe('by-title');
  });

  it('preserves unrelated fields on each book', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'dune' }]));
    const [book] = await enrichBatch([{ title: 'Dune', status: 'reading', currentPage: 40, rating: 4 }]);
    expect(book.status).toBe('reading');
    expect(book.rating).toBe(4);
  });

  it('does not overwrite currentPage for a reading book', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'dune', pages: 412 }]));
    const [book] = await enrichBatch([{ title: 'Dune', status: 'reading', currentPage: 40 }]);
    expect(book.currentPage).toBe(40);
  });

  it('sets currentPage to the page count for a finished book', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'dune', pages: 412 }]));
    const [book] = await enrichBatch([{ title: 'Dune', status: 'finished', currentPage: 0 }]);
    expect(book.currentPage).toBe(412);
  });
});

// ── enrichFromHardcover ───────────────────────────────────────────────────────

describe('enrichFromHardcover', () => {
  it('returns a single enriched book', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'dune', pages: 412 }]));
    const book = await enrichFromHardcover({ title: 'Dune' });
    expect(book.gbid).toBe('dune');
  });

  it('returns the book unchanged when nothing matches', async () => {
    global.fetch.mockResolvedValue(searchRes([]));
    const book = await enrichFromHardcover({ title: 'Nothing', author: 'Nobody' });
    expect(book.title).toBe('Nothing');
    expect(book._hardcoverMatched).toBeUndefined();
  });

  it('does not mutate its argument', async () => {
    global.fetch.mockResolvedValue(searchRes([{ slug: 'dune', pages: 412 }]));
    const input = { title: 'Dune', gbid: '' };
    await enrichFromHardcover(input);
    expect(input.gbid).toBe('');
  });
});
