import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock firebase.js before importing hardcover.js (which imports from it)
vi.mock('../js/firebase.js', () => ({
  getHcCache: vi.fn().mockResolvedValue(null),
  setHcCache: vi.fn().mockResolvedValue(undefined),
}));

import { applyHardcoverBook, cleanTitle, cleanAuthor } from '../js/hardcover.js';

// ── cleanTitle ────────────────────────────────────────────────────────────────

describe('cleanTitle (hardcover export)', () => {
  it('strips series notation', () =>
    expect(cleanTitle('Dune (Dune Chronicles, #1)')).toBe('Dune'));
  it('strips multi-word series', () =>
    expect(cleanTitle('The Way of Kings (The Stormlight Archive, #1)')).toBe('The Way of Kings'));
  it('leaves plain titles unchanged', () =>
    expect(cleanTitle('The Great Gatsby')).toBe('The Great Gatsby'));
  it('handles null', () => expect(cleanTitle(null)).toBe(''));
  it('handles empty string', () => expect(cleanTitle('')).toBe(''));
});

// ── cleanAuthor ───────────────────────────────────────────────────────────────

describe('cleanAuthor (hardcover export)', () => {
  it('converts Last, First to First Last', () =>
    expect(cleanAuthor('Herbert, Frank')).toBe('Frank Herbert'));
  it('leaves First Last unchanged', () =>
    expect(cleanAuthor('Frank Herbert')).toBe('Frank Herbert'));
  it('handles null', () => expect(cleanAuthor(null)).toBe(''));
  it('handles empty string', () => expect(cleanAuthor('')).toBe(''));
});

// ── applyHardcoverBook ────────────────────────────────────────────────────────

describe('applyHardcoverBook', () => {
  const baseBook = {
    title: 'Dune',
    author: 'Frank Herbert',
    status: 'finished',
    totalPages: 0,
    currentPage: 0,
    coverUrl: '',
    gbid: '',
  };

  it('returns the original book when hc is null', () => {
    expect(applyHardcoverBook(baseBook, null)).toBe(baseBook);
  });

  it('returns the original book when hc is undefined', () => {
    expect(applyHardcoverBook(baseBook, undefined)).toBe(baseBook);
  });

  it('sets gbid from hc.slug', () => {
    const result = applyHardcoverBook(baseBook, { slug: 'dune-frank-herbert', pages: 412 });
    expect(result.gbid).toBe('dune-frank-herbert');
  });

  it('sets coverUrl from hc.image.url', () => {
    const hc = { slug: 'dune', image: { url: 'https://img.example.com/dune.jpg' }, pages: 412 };
    expect(applyHardcoverBook(baseBook, hc).coverUrl).toBe('https://img.example.com/dune.jpg');
  });

  it('falls back to hc.coverUrl when image.url missing', () => {
    const hc = { slug: 'dune', coverUrl: 'https://fallback.jpg', pages: 412 };
    expect(applyHardcoverBook(baseBook, hc).coverUrl).toBe('https://fallback.jpg');
  });

  it('falls back to existing coverUrl when hc has no cover', () => {
    const book = { ...baseBook, coverUrl: 'https://existing.jpg' };
    const hc = { slug: 'dune', pages: 412 };
    expect(applyHardcoverBook(book, hc).coverUrl).toBe('https://existing.jpg');
  });

  it('sets totalPages from hc.pages', () => {
    const result = applyHardcoverBook(baseBook, { slug: 'dune', pages: 412 });
    expect(result.totalPages).toBe(412);
  });

  it('keeps existing totalPages when hc.pages is 0/falsy', () => {
    const book = { ...baseBook, totalPages: 500 };
    const hc = { slug: 'dune', pages: 0 };
    expect(applyHardcoverBook(book, hc).totalPages).toBe(500);
  });

  it('sets currentPage to totalPages for finished books', () => {
    const hc = { slug: 'dune', pages: 412 };
    const result = applyHardcoverBook({ ...baseBook, status: 'finished' }, hc);
    expect(result.currentPage).toBe(412);
  });

  it('does not update currentPage for reading books', () => {
    const book = { ...baseBook, status: 'reading', currentPage: 150 };
    const hc = { slug: 'dune', pages: 412 };
    expect(applyHardcoverBook(book, hc).currentPage).toBe(150);
  });

  it('sets releaseYear from hc.release_year', () => {
    const hc = { slug: 'dune', release_year: 1965 };
    expect(applyHardcoverBook(baseBook, hc).releaseYear).toBe(1965);
  });

  it('does not set releaseYear when hc.release_year is absent', () => {
    const book = { ...baseBook, releaseYear: 2000 };
    const hc = { slug: 'dune', pages: 412 };
    expect(applyHardcoverBook(book, hc).releaseYear).toBe(2000);
  });

  it('marks _hardcoverMatched: true', () => {
    const hc = { slug: 'dune', pages: 412 };
    expect(applyHardcoverBook(baseBook, hc)._hardcoverMatched).toBe(true);
  });

  it('does not mutate the original book', () => {
    const book = { ...baseBook };
    const hc = { slug: 'new-slug', pages: 999 };
    applyHardcoverBook(book, hc);
    expect(book.gbid).toBe('');
    expect(book.totalPages).toBe(0);
  });

  it('preserves all original book fields', () => {
    const book = { ...baseBook, title: 'Dune', author: 'Frank Herbert', language: 'English' };
    const hc = { slug: 'dune', pages: 412 };
    const result = applyHardcoverBook(book, hc);
    expect(result.title).toBe('Dune');
    expect(result.author).toBe('Frank Herbert');
    expect(result.language).toBe('English');
  });

  it('prefers existing gbid when hc.slug is absent', () => {
    const book = { ...baseBook, gbid: 'existing-slug' };
    const hc = { pages: 412 };
    expect(applyHardcoverBook(book, hc).gbid).toBe('existing-slug');
  });
});
