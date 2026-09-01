// Release years, and specifically BCE ones.
//
// Reported: the age-vs-rating scatter showed nothing dated BCE. Two separate
// causes — the chart filtered on `releaseYear > 0`, and the library refused to
// store any year below 1000 in the first place, so books added from search never
// had one to plot. Both are pinned here.

import { describe, it, expect } from 'vitest';
import { parseReleaseYear } from '../js/book-utils.js';
import { bookAgeYears } from '../js/stats-utils.js';

describe('parseReleaseYear', () => {
  it('keeps an ordinary year', () => {
    expect(parseReleaseYear(1965)).toBe(1965);
    expect(parseReleaseYear('2020')).toBe(2020);
  });

  it('keeps a BCE year, which is stored negative', () => {
    // The old guard was `y >= 1000`, so the Odyssey was silently stored with no
    // year at all — and then could not appear on any chart.
    expect(parseReleaseYear(-800)).toBe(-800);
    expect(parseReleaseYear('-2100')).toBe(-2100);
  });

  it('keeps early CE years, which the old guard also threw away', () => {
    expect(parseReleaseYear(400)).toBe(400);
    expect(parseReleaseYear(1)).toBe(1);
  });

  it('rejects year zero, which does not exist in this reckoning', () => {
    expect(parseReleaseYear(0)).toBe(null);
    expect(parseReleaseYear('0')).toBe(null);
  });

  it('rejects anything unparseable rather than storing NaN', () => {
    // NaN reaching Firestore fails the write outright.
    expect(parseReleaseYear('')).toBe(null);
    expect(parseReleaseYear('abc')).toBe(null);
    expect(parseReleaseYear(null)).toBe(null);
    expect(parseReleaseYear(undefined)).toBe(null);
  });

  it('rejects years outside anything a reader could plausibly log', () => {
    // Still tight enough to catch a page count typed into the year box.
    expect(parseReleaseYear(-9000)).toBe(null);
    expect(parseReleaseYear(3000)).toBe(null);
    expect(parseReleaseYear(9780571350865)).toBe(null);
  });

  it('takes the leading integer of a messy value, as parseInt always did', () => {
    expect(parseReleaseYear('1965-08-01')).toBe(1965);
    expect(parseReleaseYear(1965.7)).toBe(1965);
  });
});

describe('bookAgeYears', () => {
  const NOW = 2026;

  it('measures an ordinary book', () => {
    expect(bookAgeYears(1965, NOW)).toBe(61);
  });

  it('measures a BCE book instead of discarding it', () => {
    // 800 BCE to 2026 CE is 2825 years, not 2826: there is no year zero between
    // -1 and 1, so a plain subtraction runs a year long across the boundary.
    expect(bookAgeYears(-800, NOW)).toBe(2825);
    expect(bookAgeYears(-1, NOW)).toBe(2026);
    expect(bookAgeYears(1, NOW)).toBe(2025);
  });

  it('is continuous across the boundary, with no gap or repeat', () => {
    // 1 BCE and 1 CE are consecutive years, so their ages must differ by one.
    expect(bookAgeYears(-1, NOW) - bookAgeYears(1, NOW)).toBe(1);
  });

  it('gives this year and the future an age of 1, not 0 or negative', () => {
    // The scatter is drawn on a log scale, where neither has a position.
    expect(bookAgeYears(NOW, NOW)).toBe(1);
    expect(bookAgeYears(NOW + 5, NOW)).toBe(1);
  });

  it('returns null when there is no year to work from', () => {
    expect(bookAgeYears(null, NOW)).toBe(null);
    expect(bookAgeYears(undefined, NOW)).toBe(null);
    expect(bookAgeYears(0, NOW)).toBe(null);
  });

  it('never returns null for a year the library would have stored', () => {
    // The two functions have to agree, or a book is saveable but unplottable.
    for (const y of [-4000, -800, -1, 1, 400, 1965, 2026, 2100]) {
      expect(parseReleaseYear(y)).toBe(y);
      expect(bookAgeYears(y, NOW)).toBeGreaterThan(0);
    }
  });
});
