import { describe, it, expect } from 'vitest';
import {
  tsOf, getReads, getDisplayRating, sortBooks,
  bookMissingFlags, computeDupeGroups,
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

// ── computeDupeGroups ─────────────────────────────────────────────────────────

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
