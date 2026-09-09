// The period filter on the graphs tab.
//
// Every chart there reads finished books, so the window is on finish dates. The
// awkward parts are the ones a date picker makes easy to get wrong: a range
// entered backwards, an end date that silently excludes its own last day, and a
// book whose finish date cannot be read at all.

import { describe, it, expect } from 'vitest';
import { finishedDate, booksInRange, presetRange, customRange, toDateInputValue } from '../js/stats-utils.js';

// Firestore hands back a Timestamp, not a Date.
const ts = iso => ({ toDate: () => new Date(iso) });
const book = (iso, extra = {}) => ({ finishedAt: iso ? ts(iso) : null, ...extra });

describe('finishedDate', () => {
  it('reads a Firestore timestamp', () => {
    expect(finishedDate(book('2026-03-04T10:00:00Z')).toISOString()).toBe('2026-03-04T10:00:00.000Z');
  });

  it('reads a plain Date and an ISO string', () => {
    const d = new Date('2026-03-04T10:00:00Z');
    expect(finishedDate({ finishedAt: d })).toEqual(d);
    expect(finishedDate({ finishedAt: '2026-03-04T10:00:00Z' })).toEqual(d);
  });

  it('falls back to the reads array when there is no top-level date', () => {
    // Reported as "not enough data" for every period but all time. A book logged
    // as already read, with no date given, gets no top-level finishedAt at all —
    // addFinishedBook guards it — but its reads entry is always written. Reading
    // only the top-level field dropped every such book out of every window.
    expect(finishedDate({ reads: [{ finishedAt: ts('2026-05-02T09:00:00Z') }] }).toISOString())
      .toBe('2026-05-02T09:00:00.000Z');
  });

  it('prefers the top-level date, which updateBookReads keeps current', () => {
    const b = { finishedAt: ts('2026-05-01'), reads: [{ finishedAt: ts('2020-01-01') }] };
    expect(finishedDate(b).getFullYear()).toBe(2026);
  });

  it('takes the latest of several reads', () => {
    // A book read twice was most recently finished on the later date.
    const b = { reads: [{ finishedAt: ts('2020-01-01') }, { finishedAt: ts('2026-05-03') }] };
    expect(finishedDate(b).getFullYear()).toBe(2026);
  });

  it('ignores reads with no date of their own', () => {
    expect(finishedDate({ reads: [{ finishedAt: null }, {}] })).toBe(null);
    expect(finishedDate({ reads: [] })).toBe(null);
  });

  it('gives null rather than an Invalid Date', () => {
    // An Invalid Date compares false against every bound, so the book would be
    // dropped without anything looking wrong.
    expect(finishedDate({ finishedAt: 'not a date' })).toBe(null);
    expect(finishedDate({ finishedAt: null })).toBe(null);
    expect(finishedDate({})).toBe(null);
    expect(finishedDate(null)).toBe(null);
  });
});

describe('booksInRange', () => {
  const shelf = [
    book('2024-06-01T12:00:00'),
    book('2026-01-15T12:00:00'),
    book('2026-09-01T12:00:00'),
    book(null),
  ];

  it('returns everything for an unbounded range', () => {
    expect(booksInRange(shelf, {})).toHaveLength(4);
    expect(booksInRange(shelf, { from: null, to: null })).toHaveLength(4);
  });

  it('returns the same array for all time, rather than a filtered copy', () => {
    // All time is the default view; there is no reason to walk the whole shelf.
    expect(booksInRange(shelf, {})).toBe(shelf);
  });

  it('filters on both bounds', () => {
    const out = booksInRange(shelf, { from: new Date('2025-01-01'), to: new Date('2026-06-01') });
    expect(out).toHaveLength(1);
    expect(finishedDate(out[0]).getFullYear()).toBe(2026);
  });

  it('accepts an open-ended range at either end', () => {
    expect(booksInRange(shelf, { from: new Date('2026-01-01') })).toHaveLength(2);
    expect(booksInRange(shelf, { to: new Date('2025-01-01') })).toHaveLength(1);
  });

  it('drops books whose finish date cannot be read, once bounded', () => {
    // They cannot be placed, and guessing would put them in a period they may
    // not belong to. They are still counted in the all-time view.
    expect(booksInRange(shelf, { from: new Date('1900-01-01') })).toHaveLength(3);
  });

  it('handles an empty or missing shelf', () => {
    expect(booksInRange([], { from: new Date() })).toEqual([]);
    expect(booksInRange(null, {})).toEqual([]);
    expect(booksInRange(undefined, { from: new Date() })).toEqual([]);
  });
});

describe('presetRange', () => {
  const now = new Date(2026, 8, 9, 14, 30);   // 9 September 2026
  const day = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it('gives an unbounded range for all time', () => {
    expect(presetRange('all', now)).toEqual({ from: null, to: null });
    expect(presetRange(undefined, now)).toEqual({ from: null, to: null });
  });

  it('runs this month from the 1st', () => {
    expect(day(presetRange('this-month', now).from)).toBe('2026-09-01');
  });

  it('runs this year from January', () => {
    expect(day(presetRange('this-year', now).from)).toBe('2026-01-01');
  });

  it('starts the calendar periods at midnight, so their first day is included', () => {
    expect(presetRange('this-month', now).from.getHours()).toBe(0);
    expect(presetRange('this-year', now).from.getHours()).toBe(0);
  });

  it('treats 1 month and 1 year as durations, not calendar periods', () => {
    // The reason the labels are "1 month" and "1 year" rather than "last month":
    // beside "This month", "last month" would be read as August.
    expect(day(presetRange('month', now).from)).toBe('2026-08-09');
    expect(day(presetRange('year', now).from)).toBe('2025-09-09');
  });

  it('rolls a duration back across a year boundary', () => {
    expect(day(presetRange('month', new Date(2026, 0, 15)).from)).toBe('2025-12-15');
  });

  it('ends every period at now, so nothing dated in the future creeps in', () => {
    for (const p of ['this-month', 'this-year', 'month', 'year']) {
      expect(presetRange(p, now).to).toEqual(now);
    }
  });

  it('does not mutate the date it was given', () => {
    const before = now.getTime();
    for (const p of ['this-month', 'this-year', 'month', 'year']) presetRange(p, now);
    expect(now.getTime()).toBe(before);
  });

  it('separates this month from the past month', () => {
    // Both are offered, and they are genuinely different windows.
    expect(presetRange('this-month', now).from).not.toEqual(presetRange('month', now).from);
  });
});
describe('customRange', () => {
  it('covers the whole of the end date', () => {
    // A book finished at 19:40 on the last day is inside the range someone drew.
    // Comparing against midnight would drop that day's reading.
    const { to } = customRange('2026-01-01', '2026-01-31');
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(booksInRange([book('2026-01-31T19:40:00')], customRange('2026-01-01', '2026-01-31'))).toHaveLength(1);
  });

  it('starts at the beginning of the start date', () => {
    expect(booksInRange([book('2026-01-01T00:30:00')], customRange('2026-01-01', '2026-01-31'))).toHaveLength(1);
  });

  it('swaps a range entered backwards', () => {
    // And swaps the values, not the finished boundaries — swapping afterwards
    // would leave the start at end-of-day and the end at midnight, clipping a
    // day off each end.
    const back = customRange('2026-01-31', '2026-01-01');
    const fwd  = customRange('2026-01-01', '2026-01-31');
    expect(back).toEqual(fwd);
    expect(booksInRange([book('2026-01-31T19:40:00'), book('2026-01-01T00:30:00')], back)).toHaveLength(2);
  });

  it('accepts one end only', () => {
    expect(customRange('2026-01-01', '').to).toBe(null);
    expect(customRange('', '2026-01-31').from).toBe(null);
  });

  it('is unbounded when neither is given, which is all time again', () => {
    expect(customRange('', '')).toEqual({ from: null, to: null });
    expect(customRange(null, undefined)).toEqual({ from: null, to: null });
  });

  it('ignores an unparseable value rather than filtering everything out', () => {
    expect(customRange('rubbish', '').from).toBe(null);
  });
});

describe('toDateInputValue', () => {
  it('formats a date the way an <input type="date"> wants it', () => {
    expect(toDateInputValue(new Date(2026, 8, 9))).toBe('2026-09-09');
  });

  it('pads month and day', () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('uses local time, not UTC', () => {
    // toISOString() would convert first, landing on the previous day all evening
    // for anyone west of UTC — the prefilled range would be a day out.
    const lateEvening = new Date(2026, 8, 9, 23, 30);
    expect(toDateInputValue(lateEvening)).toBe('2026-09-09');
    const earlyMorning = new Date(2026, 8, 9, 0, 30);
    expect(toDateInputValue(earlyMorning)).toBe('2026-09-09');
  });

  it('gives an empty string for anything unusable, leaving the field blank', () => {
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue(undefined)).toBe('');
    expect(toDateInputValue(new Date('nonsense'))).toBe('');
    expect(toDateInputValue('2026-09-09')).toBe('');
  });

  it('round-trips through customRange to the same day', () => {
    // What the prefill actually relies on: the value written into the input has
    // to parse back to the day it came from.
    const { from } = presetRange('year', new Date(2026, 8, 9, 14, 0));
    const range = customRange(toDateInputValue(from), toDateInputValue(new Date(2026, 8, 9)));
    expect(toDateInputValue(range.from)).toBe('2025-09-09');
    expect(toDateInputValue(range.to)).toBe('2026-09-09');
  });
});
