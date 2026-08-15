// ISBN capture — the join key out of Hardcover's namespace.
//
// Every other identifier on a book (the slug in `gbid`, `workId`) is meaningful
// only inside Hardcover. ISBN is the one that survives moving to another
// catalogue, so getting it wrong is not a display bug — it silently costs a
// future migration its ability to match, and the damage is only visible much
// later.

import { describe, it, expect } from 'vitest';
import { normaliseIsbn13, pickIsbn13, collectIsbn13s } from '../js/book-utils.js';

describe('normaliseIsbn13', () => {
  it('accepts a plain 13-digit ISBN', () => {
    expect(normaliseIsbn13('9780811231350')).toBe('9780811231350');
  });

  it('strips the hyphens exports usually carry', () => {
    expect(normaliseIsbn13('978-0-8112-3135-0')).toBe('9780811231350');
    expect(normaliseIsbn13('978 0 8112 3135 0')).toBe('9780811231350');
  });

  it('rejects an ISBN-10, rather than storing it in an ISBN-13 field', () => {
    // Goodreads exports carry both columns and the 10 is not a truncated 13 —
    // silently keeping one would poison the join later.
    expect(normaliseIsbn13('0811231356')).toBe('');
    expect(normaliseIsbn13('080410526X')).toBe('');
  });

  it('rejects anything that is not exactly thirteen digits', () => {
    expect(normaliseIsbn13('97808112313501')).toBe('');
    expect(normaliseIsbn13('978081123135')).toBe('');
    expect(normaliseIsbn13('not an isbn')).toBe('');
  });

  it('returns empty for nothing at all rather than throwing', () => {
    expect(normaliseIsbn13(null)).toBe('');
    expect(normaliseIsbn13(undefined)).toBe('');
    expect(normaliseIsbn13('')).toBe('');
  });
});

// Shaped like the API response: two edition lists, English first.
const ed = isbn => ({ isbn_13: isbn });

describe('pickIsbn13', () => {
  it('prefers an English edition over any other', () => {
    // Verified against the live API: asking for editions unfiltered returns the
    // German and Russian printings of Piranesi ahead of any English one.
    const en = [ed('9781635575637')];
    const any = [ed('9783453321984'), ed('9785389179738')];
    expect(pickIsbn13(en, any)).toBe('9781635575637');
  });

  it('falls back to any edition when there is no English one', () => {
    expect(pickIsbn13([], [ed('9783453321984')])).toBe('9783453321984');
  });

  it('skips entries whose ISBN does not survive validation', () => {
    expect(pickIsbn13([ed(null), ed('bad'), ed('9780811231350')])).toBe('9780811231350');
  });

  it('accepts bare strings as well as edition objects', () => {
    expect(pickIsbn13(['9780811231350'])).toBe('9780811231350');
  });

  it('returns empty for a book with no ISBN anywhere', () => {
    // Plenty of books genuinely have none; that is a fact to record, not a
    // failure to retry.
    expect(pickIsbn13([], [])).toBe('');
    expect(pickIsbn13()).toBe('');
  });
});

describe('collectIsbn13s', () => {
  it('keeps English editions ahead of the rest', () => {
    const out = collectIsbn13s([ed('9780811231350')], [ed('9789146240921')]);
    expect(out[0]).toBe('9780811231350');
  });

  it('deduplicates across the two lists', () => {
    // The same ISBN routinely appears in both, since an English edition is
    // also just an edition.
    const out = collectIsbn13s([ed('9780811231350')], [ed('9780811231350'), ed('9789146240921')]);
    expect(out).toEqual(['9780811231350', '9789146240921']);
  });

  it('caps how many it keeps', () => {
    const many = Array.from({ length: 20 }, (_, i) => ed(`978081123${String(i).padStart(4, '0')}`));
    expect(collectIsbn13s(many, [], 6)).toHaveLength(6);
  });

  it('returns an empty array, not undefined, when there are none', () => {
    // The empty array is load-bearing: it is what distinguishes "looked up,
    // has none" from "never looked up", and the absent key is what triggers a
    // re-query. Returning undefined here would re-query such books forever.
    expect(collectIsbn13s([], [])).toEqual([]);
  });
});
