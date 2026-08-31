// The want-to-read list is the one list with a rule: it holds books you have
// not started. Adding is refused for a book you are reading or have read, and
// finishing a book takes it off.
//
// Both halves lean on sameBook, which is the only book-identity check in the app
// that has to work on entries added by hand — those carry no gbid at all, so the
// usual join key is not available and a title is all there is.

import { describe, it, expect } from 'vitest';
import { sameBook, wantToReadBlock } from '../js/book-utils.js';

describe('sameBook', () => {
  it('matches two catalogue books on gbid', () => {
    expect(sameBook({ gbid: 'piranesi' }, { gbid: 'piranesi' })).toBe(true);
    expect(sameBook({ gbid: 'piranesi' }, { gbid: 'jonathan-strange' })).toBe(false);
  });

  it('keeps two editions of one title apart when both have a gbid', () => {
    // Different Hardcover records are different books here; the gbid is the
    // identity we actually have, and guessing past it would merge them.
    const a = { gbid: 'dune-1965', title: 'Dune' };
    const b = { gbid: 'dune-2021', title: 'Dune' };
    expect(sameBook(a, b)).toBe(false);
  });

  it('falls back to the title when either side was added by hand', () => {
    expect(sameBook({ gbid: '', title: 'Piranesi' }, { gbid: 'piranesi', title: 'Piranesi' })).toBe(true);
    expect(sameBook({ title: 'Piranesi' }, { title: 'Piranesi' })).toBe(true);
    expect(sameBook({ title: 'Piranesi' }, { title: 'Babel' })).toBe(false);
  });

  it('ignores case and surrounding space in a title match', () => {
    expect(sameBook({ title: '  piranesi ' }, { title: 'Piranesi' })).toBe(true);
  });

  it('will not match two books that have no title between them', () => {
    // Otherwise every untitled entry would be the same book as every other.
    expect(sameBook({ gbid: '', title: '' }, { gbid: '', title: '' })).toBe(false);
    expect(sameBook({}, {})).toBe(false);
    expect(sameBook({ title: '   ' }, { title: '' })).toBe(false);
  });

  it('returns false for a missing book rather than throwing', () => {
    expect(sameBook(null, { gbid: 'x' })).toBe(false);
    expect(sameBook({ gbid: 'x' }, undefined)).toBe(false);
  });
});

describe('wantToReadBlock', () => {
  it('lets through a book the reader has no copy of', () => {
    expect(wantToReadBlock(null)).toBe(null);
    expect(wantToReadBlock(undefined)).toBe(null);
  });

  it('refuses a book already read', () => {
    expect(wantToReadBlock({ status: 'finished' })).toBe('Already read');
  });

  it('refuses a book being read', () => {
    expect(wantToReadBlock({ status: 'reading' })).toBe('Reading now');
  });

  it('allows a book set aside unfinished', () => {
    // Abandoning a book is exactly when planning another run at it makes sense,
    // so 'dnf' is deliberately not treated as having read it.
    expect(wantToReadBlock({ status: 'dnf' })).toBe(null);
  });

  it('allows a book whose status is missing or unrecognised', () => {
    // A shelf record with no status is not evidence of having read anything,
    // and the list should not be shut on a guess.
    expect(wantToReadBlock({})).toBe(null);
    expect(wantToReadBlock({ status: 'planning' })).toBe(null);
  });

  it('gives back text fit to show the reader, not a code', () => {
    // The dropdown prints this straight into the row.
    for (const status of ['finished', 'reading']) {
      expect(wantToReadBlock({ status })).toMatch(/^[A-Z][a-z ]+$/);
    }
  });
});

describe('the two rules together', () => {
  const shelf = [
    { gbid: 'piranesi', title: 'Piranesi', status: 'finished' },
    { gbid: 'babel', title: 'Babel', status: 'reading' },
    { gbid: 'dune', title: 'Dune', status: 'dnf' },
  ];
  const blockFor = candidate => wantToReadBlock(shelf.find(b => sameBook(b, candidate)));

  it('blocks what is read or being read, and passes the rest', () => {
    expect(blockFor({ gbid: 'piranesi', title: 'Piranesi' })).toBe('Already read');
    expect(blockFor({ gbid: 'babel', title: 'Babel' })).toBe('Reading now');
    expect(blockFor({ gbid: 'dune', title: 'Dune' })).toBe(null);
    expect(blockFor({ gbid: 'the-employees', title: 'The Employees' })).toBe(null);
  });

  it('blocks a hand-typed title that is already on the shelf', () => {
    expect(blockFor({ title: 'piranesi' })).toBe('Already read');
  });

  it('drops the finished book from a list, and only that one', () => {
    const list = [
      { gbid: 'piranesi', title: 'Piranesi' },
      { gbid: 'babel', title: 'Babel' },
      { gbid: '', title: 'Piranesi' },
    ];
    const kept = list.filter(b => !sameBook(b, { gbid: 'piranesi', title: 'Piranesi' }));
    // Both the catalogue entry and the hand-typed one go: they are the book the
    // reader just finished, however they got onto the list.
    expect(kept).toEqual([{ gbid: 'babel', title: 'Babel' }]);
  });

  it('leaves a list alone when the finished book was never on it', () => {
    const list = [{ gbid: 'babel', title: 'Babel' }];
    const kept = list.filter(b => !sameBook(b, { gbid: 'dune', title: 'Dune' }));
    expect(kept).toHaveLength(1);
  });
});
