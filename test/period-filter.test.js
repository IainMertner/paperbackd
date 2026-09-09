// Carrying a date window from a chart click-through into the library.
//
// The stats page and the library now share one period control, and a link out of
// a chart has to encode the window it was drawn from so the library can land on
// the same one. This pins the round trip through the URL.

import { describe, it, expect } from 'vitest';
import { periodQuery, periodFromParams, describeRange, PERIOD_OPTIONS } from '../js/period-filter.js';

const params = qs => new URLSearchParams(qs);

describe('PERIOD_OPTIONS', () => {
  it('leads with all time, which is the default everywhere', () => {
    expect(PERIOD_OPTIONS[0][0]).toBe('all');
  });

  it('offers the calendar periods and the durations under distinct names', () => {
    // "1 month" rather than "last month", which beside "This month" would be
    // read as the previous calendar month.
    expect(Object.fromEntries(PERIOD_OPTIONS)).toMatchObject({
      'this-month': 'This month',
      'this-year': 'This year',
      month: '1 month',
      year: '1 year',
    });
  });
});

describe('periodQuery', () => {
  it('adds nothing for all time, so ordinary links stay clean', () => {
    expect(periodQuery('all')).toBe('');
    expect(periodQuery(undefined)).toBe('');
  });

  it('sends a preset by name, so the library shows the same option selected', () => {
    expect(periodQuery('this-year')).toBe('&period=this-year');
    expect(periodQuery('month')).toBe('&period=month');
  });

  it('sends a custom range as its two dates', () => {
    const range = { from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) };
    expect(periodQuery('custom', range)).toBe('&period=custom&from=2026-01-01&to=2026-01-31');
  });

  it('sends whichever end of a custom range exists', () => {
    expect(periodQuery('custom', { from: new Date(2026, 0, 1), to: null }))
      .toBe('&period=custom&from=2026-01-01');
    expect(periodQuery('custom', { from: null, to: new Date(2026, 0, 31) }))
      .toBe('&period=custom&to=2026-01-31');
  });

  it('adds nothing for a custom range with no dates at all', () => {
    // Which is all time by another name, and should not put ?period=custom on
    // every link.
    expect(periodQuery('custom', { from: null, to: null })).toBe('');
    expect(periodQuery('custom')).toBe('');
  });
});

describe('periodFromParams', () => {
  it('defaults to all time', () => {
    expect(periodFromParams(params(''))).toEqual({ preset: 'all', from: '', to: '' });
  });

  it('reads a preset back', () => {
    expect(periodFromParams(params('period=this-month')).preset).toBe('this-month');
  });

  it('reads a custom range back', () => {
    expect(periodFromParams(params('period=custom&from=2026-01-01&to=2026-01-31')))
      .toEqual({ preset: 'custom', from: '2026-01-01', to: '2026-01-31' });
  });

  it('falls back to all time for a period it does not know', () => {
    // A hand-edited or stale URL should show everything, not nothing.
    expect(periodFromParams(params('period=last-decade')).preset).toBe('all');
    expect(periodFromParams(params('period=')).preset).toBe('all');
  });

  it('ignores stray dates when the preset is not custom', () => {
    const out = periodFromParams(params('period=year&from=2026-01-01'));
    expect(out.preset).toBe('year');
  });
});

describe('the round trip', () => {
  it('survives a preset', () => {
    for (const [preset] of PERIOD_OPTIONS) {
      if (preset === 'all' || preset === 'custom') continue;
      const qs = periodQuery(preset).replace(/^&/, '');
      expect(periodFromParams(params(qs)).preset).toBe(preset);
    }
  });

  it('survives a custom range', () => {
    const range = { from: new Date(2025, 5, 10), to: new Date(2026, 2, 3) };
    const back = periodFromParams(params(periodQuery('custom', range).replace(/^&/, '')));
    expect(back).toEqual({ preset: 'custom', from: '2025-06-10', to: '2026-03-03' });
  });
});

describe('describeRange', () => {
  it('gives just the total for all time', () => {
    expect(describeRange({ from: null, to: null }, 12, 340)).toBe('340 books');
    expect(describeRange(null, 12, 340)).toBe('340 books');
  });

  it('puts the count and the span on separate lines', () => {
    // The count is the answer and the dates are the question; one long line ran
    // them together and wrapped wherever it felt like.
    const range = { from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) };
    expect(describeRange(range, 12, 340)).toBe('12 of 340 books\n1 Jan 2026 – 31 Jan 2026');
  });

  it('words a one-ended range', () => {
    expect(describeRange({ from: new Date(2026, 0, 1), to: null }, 5, 20))
      .toBe('5 of 20 books\nsince 1 Jan 2026');
    expect(describeRange({ from: null, to: new Date(2026, 0, 31) }, 5, 20))
      .toBe('5 of 20 books\nup to 31 Jan 2026');
  });

  it('stays on one line for all time, where there is no span to show', () => {
    expect(describeRange(null, 5, 20)).not.toContain('\n');
  });

  it('says the total even when nothing matched', () => {
    // An empty view is otherwise indistinguishable from a broken one.
    expect(describeRange({ from: new Date(2026, 0, 1), to: null }, 0, 340)).toContain('0 of 340');
  });

  it('handles one book without saying "1 books"', () => {
    expect(describeRange(null, 1, 1)).toBe('1 book');
  });
});
