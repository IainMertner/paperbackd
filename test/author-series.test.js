// Most-read authors, counted by series rather than by book.
//
// Reading all three Lord of the Rings books should say "one Tolkien" and not
// "three", or the chart quietly becomes a ranking of who writes the longest
// series. A book with no series is still its own unit, so an author of five
// unrelated novels outranks one trilogy — which is the point.

import { describe, it, expect } from 'vitest';
import { authorReadCounts, topAuthors } from '../js/stats-utils.js';
import { pickSeries } from '../js/book-utils.js';

const book = (author, seriesId) => ({ author, ...(seriesId ? { seriesId } : {}) });

describe('pickSeries', () => {
  it('takes the featured series when a book is in several', () => {
    // The Fellowship of the Ring is in both "The Lord of the Rings" and the
    // wider "Middle Earth"; collapsing on the latter would merge books nobody
    // thinks of as one series. Verified against the live API.
    expect(pickSeries([
      { featured: true,  position: 1, series: { id: 1130,   name: 'The Lord of the Rings' } },
      { featured: false, position: 2, series: { id: 127396, name: 'Middle Earth' } },
    ])).toEqual({ seriesId: '1130', seriesName: 'The Lord of the Rings' });
  });

  it('falls back to the first when none is featured', () => {
    expect(pickSeries([{ series: { id: 7, name: 'Discworld' } }]))
      .toEqual({ seriesId: '7', seriesName: 'Discworld' });
  });

  it('returns null for a standalone', () => {
    // Hardcover sends an empty array, which is how a standalone looks.
    expect(pickSeries([])).toBe(null);
    expect(pickSeries(null)).toBe(null);
    expect(pickSeries(undefined)).toBe(null);
  });

  it('ignores malformed entries rather than throwing', () => {
    expect(pickSeries([{}, { series: null }, { series: {} }])).toBe(null);
    expect(pickSeries([{ series: {} }, { series: { id: 3, name: 'Real' } }]))
      .toEqual({ seriesId: '3', seriesName: 'Real' });
  });

  it('stores the id as a string, so it compares consistently', () => {
    // Hardcover sends a number; a repaired book and a freshly added one must
    // produce the same key.
    expect(pickSeries([{ series: { id: 42, name: 'S' } }]).seriesId).toBe('42');
  });

  it('copes with a series that has no name', () => {
    expect(pickSeries([{ series: { id: 9 } }])).toEqual({ seriesId: '9', seriesName: '' });
  });
});

describe('authorReadCounts', () => {
  it('counts a whole series as one', () => {
    const lotr = [book('Tolkien', '1130'), book('Tolkien', '1130'), book('Tolkien', '1130')];
    expect(authorReadCounts(lotr).get('Tolkien')).toBe(1);
  });

  it('counts standalones individually', () => {
    expect(authorReadCounts([book('Clarke'), book('Clarke')]).get('Clarke')).toBe(2);
  });

  it('adds a series and a standalone by the same author', () => {
    const books = [book('Tolkien', '1130'), book('Tolkien', '1130'), book('Tolkien')];
    expect(authorReadCounts(books).get('Tolkien')).toBe(2);
  });

  it('counts two different series by one author separately', () => {
    const books = [book('Pratchett', '7'), book('Pratchett', '7'), book('Pratchett', '8')];
    expect(authorReadCounts(books).get('Pratchett')).toBe(2);
  });

  it('counts a shared series once for each of its authors', () => {
    // A shared-world series read across two authors is one thing read from each
    // of them, not one thing overall.
    const counts = authorReadCounts([book('A', '5'), book('A', '5'), book('B', '5')]);
    expect(counts.get('A')).toBe(1);
    expect(counts.get('B')).toBe(1);
  });

  it('cannot collide an author and series pair with a different one', () => {
    // Joined on a NUL, so "A B" + "C" stays distinct from "A" + "B C".
    const counts = authorReadCounts([book('A B', 'C'), book('A B', 'C'), book('A', 'B C')]);
    expect(counts.get('A B')).toBe(1);
    expect(counts.get('A')).toBe(1);
  });

  it('skips books with no author', () => {
    expect([...authorReadCounts([book(''), book(null), { seriesId: '1' }]).keys()]).toEqual([]);
  });

  it('treats an empty seriesId as no series', () => {
    // A stored '' would otherwise collapse every such book into one.
    const counts = authorReadCounts([{ author: 'X', seriesId: '' }, { author: 'X', seriesId: '' }]);
    expect(counts.get('X')).toBe(2);
  });

  it('survives an author named after an Object.prototype member', () => {
    // A plain object would find the inherited one and count NaN. This has bitten
    // formatCounts, genderCounts and normalizeCountry already.
    const counts = authorReadCounts([book('constructor'), book('constructor'), book('toString')]);
    expect(counts.get('constructor')).toBe(2);
    expect(counts.get('toString')).toBe(1);
  });

  it('handles an empty or missing list', () => {
    expect(authorReadCounts([]).size).toBe(0);
    expect(authorReadCounts(null).size).toBe(0);
  });
});

describe('topAuthors', () => {
  const shelf = [
    book('Tolkien', '1130'), book('Tolkien', '1130'), book('Tolkien', '1130'),
    book('Clarke'), book('Clarke'),
    book('Le Guin'), book('Le Guin'), book('Le Guin'),
    book('Solo'),
  ];

  it('ranks by works read, not by books read', () => {
    // Tolkien's three books are one series, so he drops below both of them —
    // exactly the flooding this exists to stop.
    expect(topAuthors(shelf)).toEqual([
      { label: 'Le Guin', value: 3 },
      { label: 'Clarke', value: 2 },
      { label: 'Tolkien', value: 1 },
      { label: 'Solo', value: 1 },
    ]);
  });

  it('honours the minimum, dropping one-work authors', () => {
    expect(topAuthors(shelf, { min: 2 }).map(a => a.label)).toEqual(['Le Guin', 'Clarke']);
  });

  it('honours the limit', () => {
    expect(topAuthors(shelf, { limit: 2 }).map(a => a.label)).toEqual(['Le Guin', 'Clarke']);
  });

  it('breaks ties in the order the books arrived', () => {
    // Stable, so the chart does not reshuffle between renders.
    expect(topAuthors(shelf).slice(2).map(a => a.label)).toEqual(['Tolkien', 'Solo']);
  });

  it('gives back an empty list rather than throwing', () => {
    expect(topAuthors([])).toEqual([]);
    expect(topAuthors(null)).toEqual([]);
  });
});

describe('counting books instead of works', () => {
  // The chart offers both, and books is the default — Works is the alternative
  // for when one long series is drowning out authors of separate novels.
  const shelf = [
    book('Tolkien', '1130'), book('Tolkien', '1130'), book('Tolkien', '1130'),
    book('Clarke'), book('Clarke'),
  ];

  it('counts every volume when collapseSeries is off', () => {
    expect(authorReadCounts(shelf, { collapseSeries: false }).get('Tolkien')).toBe(3);
  });

  it('collapses by default, so the option has to be asked for', () => {
    expect(authorReadCounts(shelf).get('Tolkien')).toBe(1);
  });

  it('reorders the chart between the two views', () => {
    // The whole point: Tolkien leads on books and trails on works.
    expect(topAuthors(shelf, { collapseSeries: false })[0].label).toBe('Tolkien');
    expect(topAuthors(shelf, { collapseSeries: true })[0].label).toBe('Clarke');
  });

  it('ignores series data entirely in the books view', () => {
    // A shelf with no series data at all must give the same answer either way,
    // which is what someone sees before Repair has run.
    const bare = [book('A'), book('A'), book('B')];
    expect(topAuthors(bare, { collapseSeries: false })).toEqual(topAuthors(bare, { collapseSeries: true }));
  });
});
