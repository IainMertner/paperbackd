// Snapshotting how each finished month and year went.
//
// The awkward part is deciding which periods still need recording. Get it wrong
// in one direction and the current, unfinished period gets written down as a
// result; get it wrong in the other and a month is silently skipped for good,
// because nothing ever revisits it.

import { describe, it, expect } from 'vitest';
import { periodKey, inPeriod, periodsToSnapshot, summariseSnapshot } from '../js/stats-utils.js';

describe('periodKey', () => {
  it('names a month with a padded number so keys sort as strings', () => {
    // Without padding, "2026-9" sorts after "2026-10" and the history reverses.
    expect(periodKey(new Date(2026, 8, 15), 'monthly')).toBe('2026-09');
    expect(periodKey(new Date(2026, 9, 1), 'monthly')).toBe('2026-10');
    expect(['2026-09', '2026-10'].sort()).toEqual(['2026-09', '2026-10']);
  });

  it('names a year', () => {
    expect(periodKey(new Date(2026, 6, 4), 'yearly')).toBe('2026');
  });
});

describe('inPeriod', () => {
  it('matches a date inside its month', () => {
    expect(inPeriod(new Date(2026, 6, 1), '2026-07')).toBe(true);
    expect(inPeriod(new Date(2026, 6, 31), '2026-07')).toBe(true);
  });

  it('rejects the neighbouring months', () => {
    expect(inPeriod(new Date(2026, 5, 30), '2026-07')).toBe(false);
    expect(inPeriod(new Date(2026, 7, 1), '2026-07')).toBe(false);
  });

  it('matches any date inside a year', () => {
    expect(inPeriod(new Date(2026, 0, 1), '2026')).toBe(true);
    expect(inPeriod(new Date(2026, 11, 31), '2026')).toBe(true);
    expect(inPeriod(new Date(2027, 0, 1), '2026')).toBe(false);
  });

  it('survives a missing or unparseable date rather than counting it', () => {
    expect(inPeriod(null, '2026-07')).toBe(false);
    expect(inPeriod(new Date('nonsense'), '2026-07')).toBe(false);
  });
});

describe('periodsToSnapshot', () => {
  const now = new Date(2026, 7, 17); // 17 August 2026

  it('never includes the period in progress', () => {
    // August has not finished, so there is nothing to record about it.
    expect(periodsToSnapshot('monthly', '2026-05', now)).not.toContain('2026-08');
  });

  it('lists the finished months since the starting point, oldest first', () => {
    expect(periodsToSnapshot('monthly', '2026-05', now)).toEqual(['2026-06', '2026-07']);
  });

  it('returns nothing when the starting point is the current period', () => {
    expect(periodsToSnapshot('monthly', '2026-08', now)).toEqual([]);
  });

  it('rolls over a year boundary', () => {
    expect(periodsToSnapshot('monthly', '2025-11', new Date(2026, 1, 3)))
      .toEqual(['2025-12', '2026-01']);
  });

  it('skips periods already recorded, but still catches a gap', () => {
    // A month missed because of a failed write must not be lost for good.
    expect(periodsToSnapshot('monthly', '2026-04', now, ['2026-05', '2026-07']))
      .toEqual(['2026-06']);
  });

  it('handles years the same way', () => {
    expect(periodsToSnapshot('yearly', '2023', now)).toEqual(['2024', '2025']);
    expect(periodsToSnapshot('yearly', '2026', now)).toEqual([]);
  });

  it('is bounded, and keeps the most recent periods when it bites', () => {
    // A very old starting point must not fill the quota with 1900s months and
    // leave the ones that matter unrecorded — each key is offered only once.
    const out = periodsToSnapshot('monthly', '1900-01', now, [], 12);
    expect(out).toHaveLength(12);
    expect(out[out.length - 1]).toBe('2026-07');
    expect(out[0]).toBe('2025-08');
  });
});

describe('summariseSnapshot', () => {
  const entry = {
    targets: { books: 4, pages: 1200 },
    results: { books: 5, pages: 900 },
  };

  it('reports each target against what was achieved', () => {
    const { rows } = summariseSnapshot(entry);
    expect(rows).toEqual([
      { type: 'books', target: 4, result: 5, met: true },
      { type: 'pages', target: 1200, result: 900, met: false },
    ]);
  });

  it('counts how many were met', () => {
    expect(summariseSnapshot(entry)).toMatchObject({ met: 1, total: 2 });
  });

  it('counts exactly hitting the target as met', () => {
    expect(summariseSnapshot({ targets: { books: 4 }, results: { books: 4 } }).rows[0].met).toBe(true);
  });

  it('treats a missing result as zero, not as met', () => {
    // A target set for something never recorded that period.
    const { rows } = summariseSnapshot({ targets: { countries: 3 }, results: {} });
    expect(rows[0]).toMatchObject({ result: 0, met: false });
  });

  it('copes with an empty or absent entry', () => {
    expect(summariseSnapshot({})).toEqual({ rows: [], met: 0, total: 0 });
    expect(summariseSnapshot(undefined)).toEqual({ rows: [], met: 0, total: 0 });
  });
});
