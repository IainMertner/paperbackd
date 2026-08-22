// Progress arithmetic for the home-page quick-update popover.
//
// The audiobook split is the trap here: percentage lives in progressPct, pages
// in currentPage, and writing the wrong one saves cleanly but shows the book as
// having made no progress at all. That has already happened once, via the sync
// endpoint, so both branches are pinned.

import { describe, it, expect } from 'vitest';
import { isAudiobook, libraryLink, orderReaders, progressPercent, progressText, progressUpdate } from '../js/book-utils.js';

const paper = (over = {}) => ({ id: 'b1', title: 'Piranesi', totalPages: 272, currentPage: 136, ...over });
const audio = (over = {}) => ({ id: 'b2', title: 'Piranesi', format: 'Audiobook', progressPct: 40, ...over });

describe('isAudiobook', () => {
  it('is true only for the Audiobook format', () => {
    expect(isAudiobook(audio())).toBe(true);
    expect(isAudiobook(paper())).toBe(false);
    expect(isAudiobook(paper({ format: 'Ebook' }))).toBe(false);
    expect(isAudiobook(null)).toBe(false);
  });
});

describe('progressPercent', () => {
  it('works out a percentage from pages', () => {
    expect(progressPercent(paper())).toBe(50);
  });

  it('reads an audiobook percentage straight off', () => {
    expect(progressPercent(audio())).toBe(40);
  });

  it('gives up when there is no page count to divide by', () => {
    expect(progressPercent(paper({ totalPages: 0 }))).toBe(null);
    expect(progressPercent(paper({ totalPages: undefined }))).toBe(null);
  });

  it('treats a missing audiobook percentage as nothing read, not unknown', () => {
    expect(progressPercent(audio({ progressPct: undefined }))).toBe(0);
  });

  it('rounds to whole percent', () => {
    expect(progressPercent(paper({ currentPage: 1, totalPages: 3 }))).toBe(33);
    expect(progressPercent(paper({ currentPage: 2, totalPages: 3 }))).toBe(67);
  });

  it('returns null for no book rather than throwing', () => {
    expect(progressPercent(null)).toBe(null);
  });
});

describe('progressUpdate — page books', () => {
  it('writes currentPage, never progressPct', () => {
    const { updates } = progressUpdate(paper(), '200');
    expect(updates).toEqual({ currentPage: 200 });
  });

  it('clamps a typo to the last page', () => {
    const { value, pct } = progressUpdate(paper(), '9000');
    expect(value).toBe(272);
    expect(pct).toBe(100);
  });

  it('clamps a negative to zero', () => {
    expect(progressUpdate(paper(), '-40').value).toBe(0);
  });

  it('treats junk as zero rather than writing NaN', () => {
    // NaN reaching Firestore fails the write; an empty input must not do that.
    expect(progressUpdate(paper(), '').value).toBe(0);
    expect(progressUpdate(paper(), 'abc').value).toBe(0);
  });

  it('floors a decimal to a whole page', () => {
    expect(progressUpdate(paper(), '136.9').value).toBe(136);
  });

  it('accepts any page when no total is recorded, and reports no percentage', () => {
    const { value, pct } = progressUpdate(paper({ totalPages: 0 }), '400');
    expect(value).toBe(400);
    expect(pct).toBe(null);
  });
});

describe('progressUpdate — audiobooks', () => {
  it('writes progressPct, never currentPage', () => {
    const { updates } = progressUpdate(audio(), '65');
    expect(updates).toEqual({ progressPct: 65 });
    expect(updates.currentPage).toBeUndefined();
  });

  it('caps at 100 percent', () => {
    expect(progressUpdate(audio(), '140').value).toBe(100);
  });

  it('reports the percentage it just wrote', () => {
    expect(progressUpdate(audio(), '65').pct).toBe(65);
  });

  it('ignores totalPages entirely', () => {
    // An audiobook carrying a stray page count must not be clamped by it.
    expect(progressUpdate(audio({ totalPages: 12 }), '80').value).toBe(80);
  });
});

describe('progressText — read-only display of someone else\'s book', () => {
  it('shows pages over the total', () => {
    expect(progressText(paper())).toBe('136 / 272');
  });

  it('shows a percentage for an audiobook, never a page number', () => {
    expect(progressText(audio())).toBe('40%');
    expect(progressText(audio({ currentPage: 99 }))).toBe('40%');
  });

  it('marks an unknown total rather than printing zero or undefined', () => {
    expect(progressText(paper({ totalPages: 0 }))).toBe('136 / ?');
    expect(progressText(paper({ totalPages: undefined }))).toBe('136 / ?');
  });

  it('treats a book not started as page zero', () => {
    expect(progressText(paper({ currentPage: undefined }))).toBe('0 / 272');
  });

  it('clamps a stray out-of-range audiobook percentage', () => {
    expect(progressText(audio({ progressPct: 140 }))).toBe('100%');
    expect(progressText(audio({ progressPct: -5 }))).toBe('0%');
  });
});

describe('orderReaders — one order for home and /reading/', () => {
  const at = seconds => ({ addedAt: { seconds } });
  const row = (uid, ...books) => ({ reader: { uid }, books });
  const uids = rows => rows.map(r => r.reader.uid);

  it('puts you first however recently anyone else picked up a book', () => {
    const rows = [row('alice', at(900)), row('me', at(1)), row('bob', at(800))];
    expect(uids(orderReaders(rows, 'me'))[0]).toBe('me');
  });

  it('orders everyone else by their most recent book', () => {
    const rows = [row('alice', at(100)), row('bob', at(300)), row('carol', at(200))];
    expect(uids(orderReaders(rows, 'me'))).toEqual(['bob', 'carol', 'alice']);
  });

  it('judges a reader by their newest book, not their oldest', () => {
    const rows = [row('alice', at(10), at(500)), row('bob', at(400), at(300))];
    expect(uids(orderReaders(rows, 'me'))).toEqual(['alice', 'bob']);
  });

  it('works when you are not in the list at all', () => {
    const rows = [row('alice', at(100)), row('bob', at(300))];
    expect(uids(orderReaders(rows, 'me'))).toEqual(['bob', 'alice']);
  });

  it('leaves the caller\'s array untouched', () => {
    const rows = [row('alice', at(100)), row('me', at(1))];
    const before = uids(rows);
    orderReaders(rows, 'me');
    expect(uids(rows)).toEqual(before);
  });

  it('treats a book with no addedAt as the oldest rather than throwing', () => {
    const rows = [row('alice', {}), row('bob', at(50))];
    expect(uids(orderReaders(rows, 'me'))).toEqual(['bob', 'alice']);
  });

  it('survives a reader with no books', () => {
    const rows = [row('alice'), row('bob', at(50))];
    expect(uids(orderReaders(rows, 'me'))).toEqual(['bob', 'alice']);
  });
});

describe('libraryLink', () => {
  it('opens your own library on a book', () => {
    expect(libraryLink({ gbid: 'abc' })).toBe('../library/?book=abc');
  });

  it('opens somebody else\'s library on a book', () => {
    expect(libraryLink({ username: 'alice', gbid: 'abc' })).toBe('../library/?u=alice&book=abc');
  });

  it('opens a library with nothing selected when there is no gbid', () => {
    // ?book= alone would build [data-gbid=""], which matches the first book
    // that also lacks a gbid and opens the wrong one.
    expect(libraryLink({ username: 'alice' })).toBe('../library/?u=alice');
    expect(libraryLink({ username: 'alice', gbid: '' })).toBe('../library/?u=alice');
    expect(libraryLink({})).toBe('../library/');
    expect(libraryLink()).toBe('../library/');
  });

  it('encodes a username that needs it', () => {
    expect(libraryLink({ username: 'a b&c' })).toBe('../library/?u=a%20b%26c');
  });

  it('encodes a gbid that needs it', () => {
    expect(libraryLink({ gbid: 'a/b?c' })).toBe('../library/?book=a%2Fb%3Fc');
  });
});

describe('progressPercent — the undefined% bug', () => {
  // Reported: an audiobook was just added and the library showed "undefined%".
  //
  // The old call sites guarded on `totalPages || (isAudiobook && progressPct > 0)`
  // and then read progressPct for audiobooks. A freshly added audiobook has a
  // page count from the catalogue but no progressPct yet, so the guard passed on
  // totalPages and the read produced undefined.
  const freshAudiobook = { format: 'Audiobook', totalPages: 320, currentPage: 0 };

  it('is 0 for a new audiobook that carries a page count', () => {
    expect(progressPercent(freshAudiobook)).toBe(0);
  });

  it('never returns undefined for an audiobook, whatever it is missing', () => {
    for (const book of [
      { format: 'Audiobook' },
      { format: 'Audiobook', totalPages: 320 },
      { format: 'Audiobook', progressPct: undefined },
      { format: 'Audiobook', progressPct: null, totalPages: 100, currentPage: 50 },
    ]) {
      expect(progressPercent(book)).toBe(0);
    }
  });

  it('ignores currentPage on an audiobook even when a page count is present', () => {
    // Left over from before the format was set, or from the sync endpoint bug.
    expect(progressPercent({ format: 'Audiobook', totalPages: 320, currentPage: 160 })).toBe(0);
  });

  it('still returns null for a page book with no page count, so nothing renders', () => {
    expect(progressPercent({ currentPage: 40 })).toBe(null);
  });
});
