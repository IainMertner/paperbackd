import { describe, it, expect } from 'vitest';
import {
  tsOf, getReads, getDisplayRating, sortBooks,
  bookMissingFlags, computeDupeGroups, viewerSeesOnlyPublic,
  hardcoverWorkId, workKey, planWorkMerge, applyBookRemaps, resolveRemappedSlug, dupeGroupsForSlug,
} from '../js/book-utils.js';

// ── tsOf ──────────────────────────────────────────────────────────────────────

describe('tsOf', () => {
  it('returns 0 when field is missing', () =>
    expect(tsOf({}, 'finishedAt')).toBe(0));

  it('returns 0 when field is null', () =>
    expect(tsOf({ finishedAt: null }, 'finishedAt')).toBe(0));

  it('extracts .seconds from Firestore Timestamp shape', () =>
    expect(tsOf({ finishedAt: { seconds: 1700000000 } }, 'finishedAt')).toBe(1700000000));

  it('calls .toDate() when .seconds is absent', () => {
    const date = new Date('2024-01-01');
    const expected = date.getTime() / 1000;
    expect(tsOf({ finishedAt: { toDate: () => date } }, 'finishedAt')).toBeCloseTo(expected, 0);
  });

  it('prefers .seconds over .toDate()', () => {
    const ts = { seconds: 999, toDate: () => { throw new Error('should not call toDate'); } };
    expect(tsOf({ finishedAt: ts }, 'finishedAt')).toBe(999);
  });

  it('returns 0 for an object with neither .seconds nor .toDate', () =>
    expect(tsOf({ finishedAt: {} }, 'finishedAt')).toBe(0));
});

// ── getReads ──────────────────────────────────────────────────────────────────

describe('getReads', () => {
  it('returns modern reads array when present', () => {
    const reads = [{ finishedAt: { seconds: 1 }, rating: 4 }];
    expect(getReads({ reads })).toBe(reads);
  });

  it('wraps legacy finishedAt into a single-element reads array', () => {
    const book = {
      finishedAt: { seconds: 1700000000 },
      finishedAtPrecision: 'day',
      addedAt: { seconds: 1699000000 },
      language: 'English',
      format: 'Paperback',
      rating: 4,
      review: 'Great',
    };
    const reads = getReads(book);
    expect(reads).toHaveLength(1);
    expect(reads[0].finishedAt).toBe(book.finishedAt);
    expect(reads[0].rating).toBe(4);
    expect(reads[0].review).toBe('Great');
    expect(reads[0].language).toBe('English');
    expect(reads[0].format).toBe('Paperback');
  });

  it('returns empty array when no reads and no finishedAt', () =>
    expect(getReads({})).toEqual([]));

  it('prefers reads array even when finishedAt also exists', () => {
    const reads = [{ finishedAt: { seconds: 1 } }];
    expect(getReads({ reads, finishedAt: { seconds: 2 } })).toBe(reads);
  });

  it('returns empty array for empty reads array (falls through to legacy check)', () => {
    expect(getReads({ reads: [], finishedAt: null })).toEqual([]);
  });

  it('legacy read defaults nulls for missing fields', () => {
    const book = { finishedAt: { seconds: 1 } };
    const reads = getReads(book);
    expect(reads[0].startedAt).toBeNull();
    expect(reads[0].language).toBeNull();
    expect(reads[0].rating).toBeNull();
  });
});

// ── getDisplayRating ──────────────────────────────────────────────────────────

describe('getDisplayRating', () => {
  it('returns null for book with no reads and no rating', () =>
    expect(getDisplayRating({})).toBeNull());

  it('returns legacy book.rating when no reads array', () =>
    expect(getDisplayRating({ rating: 3.5 })).toBe(3.5));

  it('returns rating from the most recent read', () => {
    const book = {
      reads: [
        { finishedAt: { seconds: 100 }, rating: 3 },
        { finishedAt: { seconds: 200 }, rating: 5 },
      ],
    };
    expect(getDisplayRating(book)).toBe(5);
  });

  it('handles toDate-style timestamps when picking most recent', () => {
    const d1 = new Date('2023-01-01');
    const d2 = new Date('2024-01-01');
    const book = {
      reads: [
        { finishedAt: { toDate: () => d1 }, rating: 2 },
        { finishedAt: { toDate: () => d2 }, rating: 4 },
      ],
    };
    expect(getDisplayRating(book)).toBe(4);
  });

  it('returns null when most recent read has no rating', () => {
    const book = {
      reads: [
        { finishedAt: { seconds: 100 }, rating: null },
        { finishedAt: { seconds: 200 }, rating: null },
      ],
    };
    expect(getDisplayRating(book)).toBeNull();
  });

  it('returns null for rating 0 (falsy)', () => {
    expect(getDisplayRating({ rating: 0 })).toBeNull();
  });
});

// ── sortBooks ─────────────────────────────────────────────────────────────────

const mkBook = (status, opts = {}) => ({ status, ...opts });
const secs = n => ({ seconds: n });

describe('sortBooks', () => {
  it('partitions books by status', () => {
    const books = [
      mkBook('reading'),
      mkBook('finished'),
      mkBook('dnf'),
    ];
    const { reading, finished, dnf } = sortBooks(books);
    expect(reading).toHaveLength(1);
    expect(finished).toHaveLength(1);
    expect(dnf).toHaveLength(1);
  });

  it('all three buckets when no books', () => {
    const { reading, finished, dnf } = sortBooks([]);
    expect(reading).toHaveLength(0);
    expect(finished).toHaveLength(0);
    expect(dnf).toHaveLength(0);
  });

  it('finished books sorted by finishedAt desc', () => {
    const books = [
      mkBook('finished', { finishedAt: secs(100), title: 'Old' }),
      mkBook('finished', { finishedAt: secs(300), title: 'New' }),
      mkBook('finished', { finishedAt: secs(200), title: 'Mid' }),
    ];
    const { finished } = sortBooks(books);
    expect(finished.map(b => b.title)).toEqual(['New', 'Mid', 'Old']);
  });

  it('reading books sorted by addedAt desc', () => {
    const books = [
      mkBook('reading', { addedAt: secs(50),  title: 'First' }),
      mkBook('reading', { addedAt: secs(150), title: 'Last' }),
    ];
    const { reading } = sortBooks(books);
    expect(reading[0].title).toBe('Last');
  });

  it('dnf books sorted by addedAt desc', () => {
    const books = [
      mkBook('dnf', { addedAt: secs(10), title: 'Early' }),
      mkBook('dnf', { addedAt: secs(20), title: 'Late' }),
    ];
    const { dnf } = sortBooks(books);
    expect(dnf[0].title).toBe('Late');
  });

  it('finished books fall back to addedAt when finishedAt missing', () => {
    const books = [
      mkBook('finished', { addedAt: secs(100), title: 'HasAdded' }),
      mkBook('finished', { finishedAt: secs(50), title: 'HasFinished' }),
    ];
    const { finished } = sortBooks(books);
    expect(finished[0].title).toBe('HasAdded');
  });

  it('ignores books with unknown status', () => {
    const books = [mkBook('unknown'), mkBook('reading')];
    const { reading } = sortBooks(books);
    expect(reading).toHaveLength(1);
  });
});

// ── bookMissingFlags ──────────────────────────────────────────────────────────

describe('bookMissingFlags', () => {
  const fullBook = {
    coverUrl: 'https://example.com/cover.jpg',
    country: 'United Kingdom',
    authorGender: 'Male',
    genres: ['Fiction'],
    releaseYear: 2001,
    totalPages: 300,
    language: 'English',
    format: 'Paperback',
  };

  it('returns no flags for a complete book', () =>
    expect(bookMissingFlags(fullBook)).toHaveLength(0));

  it('flags missing coverUrl', () =>
    expect(bookMissingFlags({ ...fullBook, coverUrl: undefined })).toContain('no-cover'));

  it('flags missing country', () =>
    expect(bookMissingFlags({ ...fullBook, country: '' })).toContain('no-country'));

  it('flags missing authorGender', () =>
    expect(bookMissingFlags({ ...fullBook, authorGender: null })).toContain('no-gender'));

  it('flags empty genres array', () =>
    expect(bookMissingFlags({ ...fullBook, genres: [] })).toContain('no-genre'));

  it('flags missing genres entirely', () =>
    expect(bookMissingFlags({ ...fullBook, genres: undefined })).toContain('no-genre'));

  it('flags releaseYear of null (not 0)', () =>
    expect(bookMissingFlags({ ...fullBook, releaseYear: null })).toContain('no-year'));

  it('does not flag releaseYear of 0', () =>
    expect(bookMissingFlags({ ...fullBook, releaseYear: 0 })).not.toContain('no-year'));

  it('flags missing totalPages', () =>
    expect(bookMissingFlags({ ...fullBook, totalPages: 0 })).toContain('no-pages'));

  it('flags missing language', () =>
    expect(bookMissingFlags({ ...fullBook, language: '' })).toContain('no-language'));

  it('flags missing format', () =>
    expect(bookMissingFlags({ ...fullBook, format: null })).toContain('no-format'));

  it('returns all flags for a completely empty book', () => {
    const flags = bookMissingFlags({});
    expect(flags).toContain('no-cover');
    expect(flags).toContain('no-country');
    expect(flags).toContain('no-gender');
    expect(flags).toContain('no-genre');
    expect(flags).toContain('no-year');
    expect(flags).toContain('no-pages');
    expect(flags).toContain('no-language');
    expect(flags).toContain('no-format');
    expect(flags).toHaveLength(8);
  });
});

// ── hardcoverWorkId ───────────────────────────────────────────────────────────

describe('hardcoverWorkId', () => {
  it('uses canonical_id when present', () => {
    // Hardcover points translations at one canonical record: the Italian
    // "Memorie dal sottosuolo" carries canonical_id 42, "Notes from Underground".
    expect(hardcoverWorkId({ id: 1488398, canonical_id: 42, parent_book_id: null })).toBe('hc:42');
  });

  it('ignores parent_book_id and keeps a split volume separate', () => {
    // parent_book_id links previews and split volumes to the full book, so
    // grouping on it would let an automatic merge delete separate entries.
    expect(hardcoverWorkId({ id: 1119334, canonical_id: null, parent_book_id: 236 })).toBe('hc:1119334');
  });

  it('ignores parent_book_id even when canonical_id is also set', () => {
    expect(hardcoverWorkId({ id: 9, canonical_id: 1, parent_book_id: 2 })).toBe('hc:1');
  });

  it('keeps a preview separate from the book it previews', () => {
    // "A Game Of Thrones preview" carries parent_book_id but no canonical_id.
    const preview = hardcoverWorkId({ id: 555, canonical_id: null, parent_book_id: 100 });
    const full    = hardcoverWorkId({ id: 100, canonical_id: null, parent_book_id: null });
    expect(preview).not.toBe(full);
  });

  it('falls back to the book id when neither is set', () => {
    expect(hardcoverWorkId({ id: 443866, canonical_id: null, parent_book_id: null })).toBe('hc:443866');
  });

  it('falls back to the book id when the fields are absent entirely', () => {
    expect(hardcoverWorkId({ id: 42 })).toBe('hc:42');
  });

  it('returns null without an id', () => {
    expect(hardcoverWorkId({ canonical_id: null })).toBeNull();
    expect(hardcoverWorkId({})).toBeNull();
    expect(hardcoverWorkId(null)).toBeNull();
    expect(hardcoverWorkId(undefined)).toBeNull();
  });

  it('treats id 0 as a real id', () => {
    expect(hardcoverWorkId({ id: 0 })).toBe('hc:0');
  });

  it('gives both Dostoevsky translations the same work id', () => {
    const italian = hardcoverWorkId({ id: 1488398, canonical_id: 42 });
    const finnish = hardcoverWorkId({ id: 1933229, canonical_id: 42 });
    const english = hardcoverWorkId({ id: 42, canonical_id: null });
    expect(italian).toBe(finnish);
    expect(italian).toBe(english);
  });
});

// ── dupeGroupsForSlug ─────────────────────────────────────────────────────────

describe('dupeGroupsForSlug', () => {
  const fin = o => ({ status: 'finished', ...o });

  it('returns the group created by a remap', () => {
    // Both books were repointed at the-employees, so they are now duplicates.
    const books = [
      fin({ id: 'a', gbid: 'the-employees', workId: 'hc:443866' }),
      fin({ id: 'b', gbid: 'the-employees', workId: 'hc:443866' }),
    ];
    const groups = dupeGroupsForSlug(books, 'the-employees');
    expect(groups).toHaveLength(1);
    expect(groups[0].map(b => b.id).sort()).toEqual(['a', 'b']);
  });

  it('leaves unrelated duplicates alone', () => {
    // A remap must not quietly restructure books it was never asked about.
    const books = [
      fin({ id: 'a', gbid: 'the-employees' }),
      fin({ id: 'b', gbid: 'the-employees' }),
      fin({ id: 'c', gbid: 'dune' }),
      fin({ id: 'd', gbid: 'dune' }),
    ];
    const groups = dupeGroupsForSlug(books, 'the-employees');
    expect(groups).toHaveLength(1);
    expect(groups[0].every(b => b.gbid === 'the-employees')).toBe(true);
  });

  it('returns nothing when the slug has no duplicates', () => {
    const books = [
      fin({ id: 'a', gbid: 'the-employees' }),
      fin({ id: 'b', gbid: 'dune' }),
      fin({ id: 'c', gbid: 'dune' }),
    ];
    expect(dupeGroupsForSlug(books, 'the-employees')).toEqual([]);
  });

  it('returns nothing for an empty library', () => {
    expect(dupeGroupsForSlug([], 'the-employees')).toEqual([]);
  });

  it('returns nothing without a slug', () => {
    const books = [fin({ id: 'a', gbid: 'x' }), fin({ id: 'b', gbid: 'x' })];
    expect(dupeGroupsForSlug(books, null)).toEqual([]);
    expect(dupeGroupsForSlug(books, '')).toEqual([]);
  });

  it('ignores unfinished copies', () => {
    const books = [
      fin({ id: 'a', gbid: 'the-employees' }),
      { id: 'b', status: 'reading', gbid: 'the-employees' },
    ];
    expect(dupeGroupsForSlug(books, 'the-employees')).toEqual([]);
  });

  it('catches a group reached via workId where only one carries the slug', () => {
    // The remapped book shares a work id with a book on a different slug.
    const books = [
      fin({ id: 'a', gbid: 'the-employees', workId: 'hc:443866' }),
      fin({ id: 'b', gbid: 'the-employees-audio', workId: 'hc:443866' }),
    ];
    expect(dupeGroupsForSlug(books, 'the-employees')).toHaveLength(1);
  });
});

// ── resolveRemappedSlug ───────────────────────────────────────────────────────

describe('resolveRemappedSlug', () => {
  const RAVN = { 'de-ansatte': { slug: 'the-employees' } };

  it('redirects a remapped slug', () => {
    expect(resolveRemappedSlug('de-ansatte', RAVN)).toBe('the-employees');
  });

  it('leaves an unmapped slug alone', () => {
    expect(resolveRemappedSlug('dune', RAVN)).toBe('dune');
  });

  it('follows a chain to the end', () => {
    expect(resolveRemappedSlug('a', { a: { slug: 'b' }, b: { slug: 'c' } })).toBe('c');
  });

  it('stops on a direct cycle', () => {
    const out = resolveRemappedSlug('a', { a: { slug: 'b' }, b: { slug: 'a' } });
    expect(['a', 'b']).toContain(out);
  });

  it('stops on a self-reference', () => {
    expect(resolveRemappedSlug('a', { a: { slug: 'a' } })).toBe('a');
  });

  it('handles missing input', () => {
    expect(resolveRemappedSlug(null, RAVN)).toBeNull();
    expect(resolveRemappedSlug('', RAVN)).toBeNull();
    expect(resolveRemappedSlug('dune', null)).toBe('dune');
  });

  it('ignores a malformed table entry', () => {
    expect(resolveRemappedSlug('a', { a: {} })).toBe('a');
    expect(resolveRemappedSlug('a', { a: null })).toBe('a');
  });
});

// ── applyBookRemaps ───────────────────────────────────────────────────────────

describe('applyBookRemaps', () => {
  const RAVN = {
    'de-ansatte': { slug: 'the-employees', title: 'The Employees', author: 'Olga Ravn', coverUrl: 'emp.jpg', releaseYear: 2018 },
  };
  const hit = (slug, extra = {}) => ({ slug, title: slug, author_names: ['Someone'], ...extra });

  it('substitutes the target for a remapped result', () => {
    const [out] = applyBookRemaps([hit('de-ansatte', { title: 'De ansatte' })], RAVN);
    expect(out.slug).toBe('the-employees');
    expect(out.title).toBe('The Employees');
  });

  it('carries the target author and cover through', () => {
    const [out] = applyBookRemaps([hit('de-ansatte')], RAVN);
    expect(out.author_names).toEqual(['Olga Ravn']);
    expect(out.image).toEqual({ url: 'emp.jpg' });
    expect(out.release_year).toBe(2018);
  });

  it('sets the cover on both shapes the app queries', () => {
    // Search returns `image`; the author page's query returns `cached_image`.
    const [out] = applyBookRemaps([hit('de-ansatte', { cached_image: { url: 'old.jpg' } })], RAVN);
    expect(out.image).toEqual({ url: 'emp.jpg' });
    expect(out.cached_image).toEqual({ url: 'emp.jpg' });
  });

  it('removes a redirected book from an author list, collapsing onto the target', () => {
    // Both records sit under the same author, so the list must not show two.
    const authorBooks = [
      { slug: 'the-employees', title: 'The Employees', cached_image: { url: 'emp.jpg' } },
      { slug: 'de-ansatte',    title: 'De ansatte',    cached_image: { url: 'da.jpg' } },
      { slug: 'my-work',       title: 'My Work' },
    ];
    const out = applyBookRemaps(authorBooks, RAVN);
    expect(out.map(b => b.slug)).toEqual(['the-employees', 'my-work']);
  });

  it('records where the substitution came from', () => {
    const [out] = applyBookRemaps([hit('de-ansatte')], RAVN);
    expect(out._remappedFrom).toBe('de-ansatte');
  });

  it('leaves unrelated results untouched', () => {
    const input = [hit('dune'), hit('ubik')];
    expect(applyBookRemaps(input, RAVN).map(d => d.slug)).toEqual(['dune', 'ubik']);
  });

  it('does not mutate the input documents', () => {
    const input = [hit('de-ansatte', { title: 'De ansatte' })];
    applyBookRemaps(input, RAVN);
    expect(input[0].slug).toBe('de-ansatte');
    expect(input[0].title).toBe('De ansatte');
  });

  it('collapses a remapped result and its target into one entry', () => {
    // Searching "employees" can return both records; only one should show.
    const out = applyBookRemaps([hit('de-ansatte'), hit('the-employees')], RAVN);
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe('the-employees');
  });

  it('keeps the earlier rank when collapsing', () => {
    const out = applyBookRemaps([hit('the-employees'), hit('de-ansatte')], RAVN);
    expect(out).toHaveLength(1);
    expect(out[0]._remappedFrom).toBeUndefined();
  });

  it('prefers the genuine record over a substituted stand-in', () => {
    // The stand-in only carries what the remap table stored; the real record
    // has the true cover and full author list.
    const out = applyBookRemaps([hit('de-ansatte'), hit('the-employees', { title: 'Real' })], RAVN);
    expect(out).toHaveLength(1);
    expect(out[0]._remappedFrom).toBeUndefined();
    expect(out[0].title).toBe('Real');
  });

  it('keeps the rank of whichever appeared first when preferring the genuine record', () => {
    const out = applyBookRemaps([hit('dune'), hit('de-ansatte'), hit('the-employees')], RAVN);
    expect(out.map(d => d.slug)).toEqual(['dune', 'the-employees']);
  });

  it('follows a two-step chain to the final target', () => {
    const chain = {
      a: { slug: 'b', title: 'B' },
      b: { slug: 'c', title: 'C' },
    };
    const [out] = applyBookRemaps([hit('a')], chain);
    expect(out.slug).toBe('c');
    expect(out.title).toBe('C');
  });

  it('stops rather than looping on a cycle', () => {
    const cycle = { a: { slug: 'b' }, b: { slug: 'a' } };
    const out = applyBookRemaps([hit('a')], cycle);
    expect(out).toHaveLength(1);
    expect(['a', 'b']).toContain(out[0].slug);
  });

  it('handles an empty remap table', () => {
    const input = [hit('dune')];
    expect(applyBookRemaps(input, {})).toHaveLength(1);
  });

  it('handles missing arguments safely', () => {
    expect(applyBookRemaps([], {})).toEqual([]);
    expect(applyBookRemaps(null, {})).toEqual([]);
    expect(applyBookRemaps([hit('dune')], null)).toHaveLength(1);
  });

  it('tolerates a result with no slug', () => {
    const out = applyBookRemaps([{ title: 'No slug' }], RAVN);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('No slug');
  });

  it('falls back to the original field when the target omits it', () => {
    const sparse = { 'de-ansatte': { slug: 'the-employees' } };
    const [out] = applyBookRemaps([hit('de-ansatte', { title: 'De ansatte', release_year: 2018 })], sparse);
    expect(out.slug).toBe('the-employees');
    expect(out.title).toBe('De ansatte');
    expect(out.release_year).toBe(2018);
  });

  it('preserves order for a mixed result set', () => {
    const out = applyBookRemaps([hit('dune'), hit('de-ansatte'), hit('ubik')], RAVN);
    expect(out.map(d => d.slug)).toEqual(['dune', 'the-employees', 'ubik']);
  });
});

// ── workKey ───────────────────────────────────────────────────────────────────

describe('workKey', () => {
  it('prefers workId over everything else', () => {
    expect(workKey({ workId: 'hc:42', gbid: 'slug', title: 'T', author: 'A' })).toBe('w:hc:42');
  });

  it('falls back to the slug when there is no workId', () => {
    expect(workKey({ gbid: 'the-employees', title: 'T', author: 'A' })).toBe('g:the-employees');
  });

  it('falls back to title+author when there is no slug', () => {
    expect(workKey({ title: 'Dune', author: 'Frank Herbert' })).toBe('t:dune||frank herbert');
  });

  it('lowercases and trims the title+author fallback', () => {
    expect(workKey({ title: '  DUNE ', author: ' Frank Herbert  ' })).toBe('t:dune||frank herbert');
  });

  it('ignores a whitespace-only slug', () => {
    expect(workKey({ gbid: '   ', title: 'Dune', author: 'Frank Herbert' })).toBe('t:dune||frank herbert');
  });

  it('returns null with nothing to key on', () => {
    expect(workKey({})).toBeNull();
    expect(workKey({ title: 'Dune' })).toBeNull();
    expect(workKey({ author: 'Frank Herbert' })).toBeNull();
    expect(workKey(null)).toBeNull();
  });

  it('matches two editions of one work that share a workId', () => {
    const danish  = { workId: 'hc:443866', gbid: 'de-ansatte',   title: 'De ansatte',    author: 'Olga Ravn' };
    const english = { workId: 'hc:443866', gbid: 'the-employees', title: 'The Employees', author: 'Olga Ravn' };
    expect(workKey(danish)).toBe(workKey(english));
  });

  it('keeps different works apart even with the same author', () => {
    const a = { workId: 'hc:1', title: 'Book One', author: 'Same Author' };
    const b = { workId: 'hc:2', title: 'Book Two', author: 'Same Author' };
    expect(workKey(a)).not.toBe(workKey(b));
  });

  it('does not collide a workId with a slug of the same text', () => {
    expect(workKey({ workId: 'x' })).not.toBe(workKey({ gbid: 'x' }));
  });
});

// ── planWorkMerge ─────────────────────────────────────────────────────────────

describe('planWorkMerge', () => {
  const ts = s => ({ seconds: s });
  const rich = { id: 'rich', title: 'The Employees', coverUrl: 'c.jpg', totalPages: 136, author: 'Olga Ravn', releaseYear: 2018, country: 'Denmark' };
  const bare = { id: 'bare', title: 'De ansatte', addedAt: ts(50) };

  it('returns null for a group that is not a group', () => {
    expect(planWorkMerge([])).toBeNull();
    expect(planWorkMerge([rich])).toBeNull();
    expect(planWorkMerge(null)).toBeNull();
  });

  it('keeps the entry with the most metadata', () => {
    expect(planWorkMerge([bare, rich]).primary.id).toBe('rich');
  });

  it('lists the others as secondaries', () => {
    expect(planWorkMerge([bare, rich]).secondaries.map(b => b.id)).toEqual(['bare']);
  });

  it('breaks a metadata tie by whichever was added first', () => {
    const older = { id: 'older', addedAt: ts(10) };
    const newer = { id: 'newer', addedAt: ts(99) };
    expect(planWorkMerge([newer, older]).primary.id).toBe('older');
  });

  it('combines reads from every entry', () => {
    const a = { id: 'a', coverUrl: 'x', reads: [{ finishedAt: ts(100) }] };
    const b = { id: 'b', reads: [{ finishedAt: ts(200) }] };
    expect(planWorkMerge([a, b]).mergedReads).toHaveLength(2);
  });

  it('synthesises a read for a legacy single-read entry', () => {
    const a = { id: 'a', coverUrl: 'x', finishedAt: ts(100), rating: 4 };
    const b = { id: 'b', finishedAt: ts(200), rating: 5 };
    const { mergedReads } = planWorkMerge([a, b]);
    expect(mergedReads).toHaveLength(2);
    expect(mergedReads.map(r => r.rating).sort()).toEqual([4, 5]);
  });

  it('deduplicates reads that finished at the same moment', () => {
    // Re-running a merge must not inflate the read count.
    const a = { id: 'a', coverUrl: 'x', reads: [{ finishedAt: ts(100) }] };
    const b = { id: 'b', reads: [{ finishedAt: ts(100) }] };
    expect(planWorkMerge([a, b]).mergedReads).toHaveLength(1);
  });

  it('keeps reads with no finish date rather than collapsing them', () => {
    const a = { id: 'a', coverUrl: 'x', reads: [{ finishedAt: null }] };
    const b = { id: 'b', reads: [{ finishedAt: null }] };
    expect(planWorkMerge([a, b]).mergedReads).toHaveLength(2);
  });

  it('backfills metadata the survivor is missing', () => {
    const thin = { id: 'thin', coverUrl: 'c.jpg', totalPages: 100, author: 'A', releaseYear: 2000 };
    const other = { id: 'other', country: 'Denmark', gbid: 'de-ansatte' };
    const { metaUpdates } = planWorkMerge([thin, other]);
    expect(metaUpdates.country).toBe('Denmark');
    expect(metaUpdates.gbid).toBe('de-ansatte');
  });

  it('does not overwrite metadata the survivor already has', () => {
    const a = { id: 'a', coverUrl: 'keep.jpg', totalPages: 100, author: 'Keep', country: 'Denmark' };
    const b = { id: 'b', coverUrl: 'other.jpg', author: 'Other', country: 'Norway' };
    const { metaUpdates } = planWorkMerge([a, b]);
    expect(metaUpdates.coverUrl).toBeUndefined();
    expect(metaUpdates.author).toBeUndefined();
    expect(metaUpdates.country).toBeUndefined();
  });

  it('promotes the most recent read to the top-level rating', () => {
    const a = { id: 'a', coverUrl: 'x', reads: [{ finishedAt: ts(100), rating: 3, review: 'old' }] };
    const b = { id: 'b', reads: [{ finishedAt: ts(200), rating: 5, review: 'new' }] };
    const { metaUpdates } = planWorkMerge([a, b]);
    expect(metaUpdates.rating).toBe(5);
    expect(metaUpdates.review).toBe('new');
    expect(metaUpdates.finishedAt).toEqual(ts(200));
  });

  it('merges a translation pair into one entry keeping both reads', () => {
    const danish  = { id: 'da', workId: 'local:x', title: 'De ansatte',    reads: [{ finishedAt: ts(100), rating: 4 }] };
    const english = { id: 'en', workId: 'local:x', title: 'The Employees', coverUrl: 'c.jpg', totalPages: 136, author: 'Olga Ravn', releaseYear: 2018, reads: [{ finishedAt: ts(200), rating: 5 }] };
    const plan = planWorkMerge([danish, english]);
    expect(plan.primary.id).toBe('en');
    expect(plan.secondaries.map(b => b.id)).toEqual(['da']);
    expect(plan.mergedReads).toHaveLength(2);
    expect(plan.metaUpdates.rating).toBe(5);
  });

  it('does not mutate the input group', () => {
    const group = [{ ...bare }, { ...rich }];
    const snapshot = JSON.stringify(group);
    planWorkMerge(group);
    expect(JSON.stringify(group)).toBe(snapshot);
  });

  it('handles a three-way merge', () => {
    const g = [
      { id: 'a', coverUrl: 'x', totalPages: 10, reads: [{ finishedAt: ts(1) }] },
      { id: 'b', reads: [{ finishedAt: ts(2) }] },
      { id: 'c', reads: [{ finishedAt: ts(3) }] },
    ];
    const plan = planWorkMerge(g);
    expect(plan.primary.id).toBe('a');
    expect(plan.secondaries).toHaveLength(2);
    expect(plan.mergedReads).toHaveLength(3);
  });
});

// ── viewerSeesOnlyPublic ──────────────────────────────────────────────────────

describe('viewerSeesOnlyPublic', () => {
  it('is false when the owner views their own data', () => {
    expect(viewerSeesOnlyPublic('u1', 'u1')).toBe(false);
  });

  it('is true for a different signed-in viewer', () => {
    expect(viewerSeesOnlyPublic('u1', 'u2')).toBe(true);
  });

  it('treats an omitted viewer as the owner, not a stranger', () => {
    // getListCount(uid) is called with no viewer on your own profile. Reading
    // undefined as "someone else" filtered owners out of their own count and
    // showed 0 lists on every profile.
    expect(viewerSeesOnlyPublic('u1', undefined)).toBe(false);
  });

  it('treats a null viewer as the owner', () => {
    expect(viewerSeesOnlyPublic('u1', null)).toBe(false);
  });

  it('does not confuse an empty-string viewer with the owner', () => {
    expect(viewerSeesOnlyPublic('u1', '')).toBe(true);
  });

  it('is false when both are undefined', () => {
    expect(viewerSeesOnlyPublic(undefined, undefined)).toBe(false);
  });

  it('compares by exact identity, not prefix', () => {
    expect(viewerSeesOnlyPublic('u1', 'u10')).toBe(true);
  });

  it('is case sensitive', () => {
    expect(viewerSeesOnlyPublic('User1', 'user1')).toBe(true);
  });

  it.each([
    ['owner viewing own', 'abc', 'abc', false],
    ['friend viewing',    'abc', 'xyz', true],
    ['no viewer passed',  'abc', undefined, false],
    ['null viewer',       'abc', null, false],
  ])('%s → %s', (_label, owner, viewer, expected) => {
    expect(viewerSeesOnlyPublic(owner, viewer)).toBe(expected);
  });
});

// ── computeDupeGroups ─────────────────────────────────────────────────────────

describe('computeDupeGroups — work-level grouping', () => {
  const fin = (overrides) => ({ status: 'finished', ...overrides });

  it('groups a translation with its original when they share a workId', () => {
    // The reported case: two Hardcover records, two slugs, one work.
    const books = [
      fin({ id: 'a', workId: 'hc:443866', gbid: 'de-ansatte',    title: 'De ansatte',    author: 'Olga Ravn' }),
      fin({ id: 'b', workId: 'hc:443866', gbid: 'the-employees', title: 'The Employees', author: 'Olga Ravn' }),
    ];
    const groups = computeDupeGroups(books);
    expect(groups).toHaveLength(1);
    expect(groups[0].map(b => b.id).sort()).toEqual(['a', 'b']);
  });

  it('groups a split volume with the whole book', () => {
    const books = [
      fin({ id: 'a', workId: 'hc:446681', gbid: 'dungeon-crawler-carl',        title: 'Dungeon Crawler Carl' }),
      fin({ id: 'b', workId: 'hc:446681', gbid: 'dungeon-crawler-carl-vol-1',  title: 'Dungeon Crawler Carl, Vol. 1' }),
    ];
    expect(computeDupeGroups(books)).toHaveLength(1);
  });

  it('groups three records of one work together', () => {
    const books = ['a', 'b', 'c'].map(id => fin({ id, workId: 'hc:42', gbid: `slug-${id}` }));
    const groups = computeDupeGroups(books);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it('respects a manual merge between books Hardcover keeps apart', () => {
    const books = [
      fin({ id: 'a', workId: 'local:xyz', gbid: 'de-ansatte' }),
      fin({ id: 'b', workId: 'local:xyz', gbid: 'the-employees' }),
    ];
    expect(computeDupeGroups(books)).toHaveLength(1);
  });

  it('does not group different works by the same author', () => {
    const books = [
      fin({ id: 'a', workId: 'hc:1', title: 'Book One', author: 'Olga Ravn' }),
      fin({ id: 'b', workId: 'hc:2', title: 'Book Two', author: 'Olga Ravn' }),
    ];
    expect(computeDupeGroups(books)).toEqual([]);
  });

  it('does not group when only one of the pair has been backfilled', () => {
    // Half-migrated data must not merge on a guess.
    const books = [
      fin({ id: 'a', workId: 'hc:443866', gbid: 'de-ansatte' }),
      fin({ id: 'b', gbid: 'the-employees' }),
    ];
    expect(computeDupeGroups(books)).toEqual([]);
  });

  it('still groups by slug for books with no workId', () => {
    // Pre-migration behaviour must survive untouched.
    const books = [
      fin({ id: 'a', gbid: 'dune' }),
      fin({ id: 'b', gbid: 'dune' }),
    ];
    expect(computeDupeGroups(books)).toHaveLength(1);
  });

  it('ignores unfinished books even when they share a work', () => {
    const books = [
      fin({ id: 'a', workId: 'hc:42' }),
      { id: 'b', status: 'reading', workId: 'hc:42' },
    ];
    expect(computeDupeGroups(books)).toEqual([]);
  });
});

describe('computeDupeGroups', () => {
  const fin = (overrides) => ({ status: 'finished', ...overrides });

  it('returns empty array when no duplicates', () => {
    const books = [
      fin({ gbid: 'abc', title: 'Book A', author: 'Author X' }),
      fin({ gbid: 'def', title: 'Book B', author: 'Author Y' }),
    ];
    expect(computeDupeGroups(books)).toHaveLength(0);
  });

  it('detects duplicates by gbid', () => {
    const books = [
      fin({ gbid: 'abc', title: 'Book A', author: 'Author X' }),
      fin({ gbid: 'abc', title: 'Book A', author: 'Author X' }),
    ];
    const groups = computeDupeGroups(books);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it('detects duplicates by title+author when gbid missing', () => {
    const books = [
      fin({ title: 'Dune', author: 'Frank Herbert' }),
      fin({ title: 'Dune', author: 'Frank Herbert' }),
    ];
    const groups = computeDupeGroups(books);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it('title+author matching is case-insensitive', () => {
    const books = [
      fin({ title: 'dune', author: 'frank herbert' }),
      fin({ title: 'Dune', author: 'Frank Herbert' }),
    ];
    expect(computeDupeGroups(books)).toHaveLength(1);
  });

  it('does not group books without title or author', () => {
    const books = [fin({}), fin({})];
    expect(computeDupeGroups(books)).toHaveLength(0);
  });

  it('excludes non-finished books from duplicate detection', () => {
    const books = [
      { status: 'reading', gbid: 'abc', title: 'Book A', author: 'Author X' },
      { status: 'dnf',     gbid: 'abc', title: 'Book A', author: 'Author X' },
      fin({ gbid: 'abc',   title: 'Book A', author: 'Author X' }),
    ];
    // Only one finished book — not a duplicate
    expect(computeDupeGroups(books)).toHaveLength(0);
  });

  it('groups all instances, not just pairs', () => {
    const books = [
      fin({ gbid: 'abc' }),
      fin({ gbid: 'abc' }),
      fin({ gbid: 'abc' }),
    ];
    const groups = computeDupeGroups(books);
    expect(groups[0]).toHaveLength(3);
  });

  it('handles multiple separate duplicate groups', () => {
    const books = [
      fin({ gbid: 'aaa' }),
      fin({ gbid: 'aaa' }),
      fin({ gbid: 'bbb' }),
      fin({ gbid: 'bbb' }),
    ];
    expect(computeDupeGroups(books)).toHaveLength(2);
  });

  it('gbid takes priority over title+author', () => {
    // same gbid, different titles — still grouped by gbid
    const books = [
      fin({ gbid: 'abc', title: 'Book A', author: 'Author X' }),
      fin({ gbid: 'abc', title: 'Different Title', author: 'Author X' }),
    ];
    expect(computeDupeGroups(books)).toHaveLength(1);
  });

  it('trims whitespace from gbid', () => {
    const books = [
      fin({ gbid: ' abc ', title: 'Book A', author: 'Author X' }),
      fin({ gbid: 'abc',   title: 'Book A', author: 'Author X' }),
    ];
    expect(computeDupeGroups(books)).toHaveLength(1);
  });
});
