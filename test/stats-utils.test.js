import { describe, it, expect } from 'vitest';
import {
  lgamma, betacf, betai, tPValue,
  linearRegression, niceTicks, niceLogTicks, calcStats,
  COUNTRY_ISO, ISO_CONTINENT,
} from '../js/stats-utils.js';

// ── COUNTRY_ISO / ISO_CONTINENT tables ────────────────────────────────────────

describe('COUNTRY_ISO', () => {
  it('maps united states to us', () => expect(COUNTRY_ISO['united states']).toBe('us'));
  it('maps united kingdom to gb', () => expect(COUNTRY_ISO['united kingdom']).toBe('gb'));
  it('maps france to fr', () => expect(COUNTRY_ISO['france']).toBe('fr'));
  it('maps brazil to br', () => expect(COUNTRY_ISO['brazil']).toBe('br'));
  it('maps australia to au', () => expect(COUNTRY_ISO['australia']).toBe('au'));
  it('maps japan to jp', () => expect(COUNTRY_ISO['japan']).toBe('jp'));
  it('alias england → gb', () => expect(COUNTRY_ISO['england']).toBe('gb'));
  it('alias uk → gb', () => expect(COUNTRY_ISO['uk']).toBe('gb'));
  it('alias usa → us', () => expect(COUNTRY_ISO['usa']).toBe('us'));
});

describe('ISO_CONTINENT', () => {
  it('us → NA', () => expect(ISO_CONTINENT['us']).toBe('NA'));
  it('gb → EU', () => expect(ISO_CONTINENT['gb']).toBe('EU'));
  it('jp → AS', () => expect(ISO_CONTINENT['jp']).toBe('AS'));
  it('br → SA', () => expect(ISO_CONTINENT['br']).toBe('SA'));
  it('au → OC', () => expect(ISO_CONTINENT['au']).toBe('OC'));
  it('ng → AF', () => expect(ISO_CONTINENT['ng']).toBe('AF'));
});

// ── lgamma ────────────────────────────────────────────────────────────────────

describe('lgamma', () => {
  it('lgamma(1) = 0 (0! = 1)', () => expect(lgamma(1)).toBeCloseTo(0, 6));
  it('lgamma(2) = 0 (1! = 1)', () => expect(lgamma(2)).toBeCloseTo(0, 6));
  it('lgamma(3) = ln(2)', () => expect(lgamma(3)).toBeCloseTo(Math.log(2), 6));
  it('lgamma(5) = ln(24)', () => expect(lgamma(5)).toBeCloseTo(Math.log(24), 5));
  it('lgamma(0.5) = 0.5 * ln(π)', () => expect(lgamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 6));
});

// ── betai / tPValue ───────────────────────────────────────────────────────────

describe('betai', () => {
  it('betai(x=0) = 0', () => expect(betai(1, 1, 0)).toBe(0));
  it('betai(x=1) = 1', () => expect(betai(1, 1, 1)).toBe(1));
  it('betai(1,1,0.5) = 0.5 (uniform distribution)', () =>
    expect(betai(1, 1, 0.5)).toBeCloseTo(0.5, 6));
  it('betai symmetric: I(a,b,x) = 1 - I(b,a,1-x)', () => {
    const a = 3, b = 5, x = 0.4;
    expect(betai(a, b, x)).toBeCloseTo(1 - betai(b, a, 1 - x), 6);
  });
});

describe('tPValue', () => {
  it('t=0 gives p=1 (no effect)', () => expect(tPValue(0, 10)).toBeCloseTo(1, 3));
  it('large t gives small p-value', () => expect(tPValue(10, 30)).toBeLessThan(0.001));
  it('t-distribution symmetric: p(t) = p(-t)', () => {
    expect(tPValue(2, 10)).toBeCloseTo(tPValue(-2, 10), 6);
  });
  it('known value: t=2.228, df=10 → p≈0.05', () =>
    expect(tPValue(2.228, 10)).toBeCloseTo(0.05, 2));
});

// ── linearRegression ─────────────────────────────────────────────────────────

describe('linearRegression', () => {
  it('returns null for fewer than 3 points', () => {
    expect(linearRegression([])).toBeNull();
    expect(linearRegression([{x:1,y:1}])).toBeNull();
    expect(linearRegression([{x:1,y:1},{x:2,y:2}])).toBeNull();
  });

  it('returns null for collinear x values (zero denominator)', () => {
    expect(linearRegression([{x:1,y:1},{x:1,y:2},{x:1,y:3}])).toBeNull();
  });

  it('fits a perfect y=x line', () => {
    const pts = [{x:1,y:1},{x:2,y:2},{x:3,y:3},{x:4,y:4}];
    const r = linearRegression(pts);
    expect(r.m).toBeCloseTo(1, 5);
    expect(r.b).toBeCloseTo(0, 5);
    expect(r.pValue).toBeCloseTo(0, 3);
  });

  it('fits a perfect y=2x+1 line', () => {
    const pts = [{x:0,y:1},{x:1,y:3},{x:2,y:5},{x:3,y:7}];
    const r = linearRegression(pts);
    expect(r.m).toBeCloseTo(2, 5);
    expect(r.b).toBeCloseTo(1, 5);
    expect(r.pValue).toBeCloseTo(0, 3);
  });

  it('returns p=1 for a horizontal line (m=0)', () => {
    const pts = [{x:1,y:3},{x:2,y:3},{x:3,y:3},{x:4,y:3}];
    const r = linearRegression(pts);
    expect(r.m).toBeCloseTo(0, 5);
    expect(r.pValue).toBe(1);
  });

  it('returns large p-value for noisy data with no trend', () => {
    const pts = [{x:1,y:5},{x:2,y:1},{x:3,y:4},{x:4,y:2},{x:5,y:3}];
    const r = linearRegression(pts);
    expect(r).not.toBeNull();
    expect(r.pValue).toBeGreaterThan(0.3);
  });

  it('returns small p-value for clearly trending data', () => {
    const pts = Array.from({length: 20}, (_, i) => ({x: i, y: i * 0.8 + Math.random() * 0.1}));
    const r = linearRegression(pts);
    expect(r.pValue).toBeLessThan(0.001);
  });
});

// ── niceTicks ─────────────────────────────────────────────────────────────────

describe('niceTicks', () => {
  it('generates reasonable ticks for 0–100', () => {
    const t = niceTicks(0, 100, 5);
    expect(t.length).toBeGreaterThan(0);
    expect(t.every(v => v >= 0 && v <= 100)).toBe(true);
  });

  it('generates ticks for 0–10 with count=5', () => {
    const t = niceTicks(0, 10, 5);
    expect(t).toContain(0);
    expect(t.at(-1)).toBeLessThanOrEqual(10);
  });

  it('handles min === max (degenerate range)', () => {
    const t = niceTicks(5, 5, 5);
    expect(Array.isArray(t)).toBe(true);
  });

  it('ticks are evenly spaced', () => {
    const t = niceTicks(0, 100, 5);
    if (t.length >= 2) {
      const step = t[1] - t[0];
      for (let i = 1; i < t.length; i++) {
        expect(t[i] - t[i-1]).toBeCloseTo(step, 3);
      }
    }
  });

  it('generates ticks for small range 0–1', () => {
    const t = niceTicks(0, 1, 5);
    expect(t.length).toBeGreaterThan(0);
    expect(t.every(v => v >= 0 && v <= 1)).toBe(true);
  });

  it('generates ticks for large range 0–10000', () => {
    const t = niceTicks(0, 10000, 5);
    expect(t.length).toBeGreaterThan(0);
    expect(t.at(-1)).toBeLessThanOrEqual(10000);
  });
});

// ── niceLogTicks ──────────────────────────────────────────────────────────────

describe('niceLogTicks', () => {
  it('includes powers of 10', () => {
    const t = niceLogTicks(1, 1000);
    expect(t).toContain(1);
    expect(t).toContain(10);
    expect(t).toContain(100);
    expect(t).toContain(1000);
  });

  it('includes 1/2/5 multiples within range', () => {
    const t = niceLogTicks(1, 100);
    expect(t).toContain(2);
    expect(t).toContain(5);
    expect(t).toContain(20);
    expect(t).toContain(50);
  });

  it('excludes values outside [min, max]', () => {
    const t = niceLogTicks(10, 100);
    expect(t.every(v => v >= 10 && v <= 100)).toBe(true);
  });

  it('handles min > 1', () => {
    const t = niceLogTicks(50, 500);
    expect(t.every(v => v >= 50 && v <= 500)).toBe(true);
    expect(t.length).toBeGreaterThan(0);
  });

  it('returns empty for reversed range', () => {
    const t = niceLogTicks(1000, 1);
    expect(t).toHaveLength(0);
  });
});

// ── calcStats ─────────────────────────────────────────────────────────────────

// Helper to create a fake Firestore-like timestamp from a Date.
const ts = (date) => ({ toDate: () => new Date(date), seconds: Math.floor(new Date(date) / 1000) });

const NOW = new Date('2025-06-15');

describe('calcStats — empty / minimal', () => {
  it('handles empty book list', () => {
    const s = calcStats([], NOW);
    expect(s.total).toBe(0);
    expect(s.avgRating).toBeNull();
    expect(s.stdDev).toBeNull();
    expect(s.totalPages).toBe(0);
    expect(s.avgPages).toBeNull();
    expect(s.uniqueAuthors).toBe(0);
    expect(s.uniqueCountries).toBe(0);
    expect(s.uniqueLanguages).toBe(0);
    expect(s.thisYear).toBe(0);
    expect(s.thisMonth).toBe(0);
    expect(s.genderKnown).toBe(0);
    expect(s.genderRatio).toBe('–');
    expect(s.fiveStars).toBe(0);
    expect(s.halfStars).toBe(0);
  });

  it('single unrated book', () => {
    const s = calcStats([{ author: 'Author A', country: 'France', language: 'French' }], NOW);
    expect(s.total).toBe(1);
    expect(s.avgRating).toBeNull();
    expect(s.uniqueAuthors).toBe(1);
    expect(s.uniqueCountries).toBe(1);
    expect(s.uniqueLanguages).toBe(1);
  });
});

describe('calcStats — ratings', () => {
  const books = [
    { rating: 5 },
    { rating: 4 },
    { rating: 3 },
    { rating: 0.5 },
  ];

  it('computes average rating', () => {
    const s = calcStats(books, NOW);
    expect(s.avgRating).toBeCloseTo((5 + 4 + 3 + 0.5) / 4, 5);
  });

  it('computes stdDev', () => {
    const s = calcStats(books, NOW);
    expect(s.stdDev).toBeGreaterThan(0);
  });

  it('counts five-star books', () => {
    expect(calcStats(books, NOW).fiveStars).toBe(1);
  });

  it('counts half-star books', () => {
    expect(calcStats(books, NOW).halfStars).toBe(1);
  });

  it('excludes books with rating < 0.5', () => {
    const s = calcStats([{ rating: 0 }, { rating: 0.4 }, { rating: 5 }], NOW);
    expect(s.avgRating).toBe(5);
  });

  it('excludes null ratings', () => {
    const s = calcStats([{ rating: null }, { rating: 4 }], NOW);
    expect(s.avgRating).toBe(4);
  });

  it('stdDev is null for single rated book', () => {
    const s = calcStats([{ rating: 4 }], NOW);
    expect(s.stdDev).toBeNull();
  });
});

describe('calcStats — pages', () => {
  it('sums total pages', () => {
    const s = calcStats([{ totalPages: 300 }, { totalPages: 200 }], NOW);
    expect(s.totalPages).toBe(500);
  });

  it('computes average pages', () => {
    const s = calcStats([{ totalPages: 300 }, { totalPages: 200 }], NOW);
    expect(s.avgPages).toBe(250);
  });

  it('excludes books with 0 pages', () => {
    const s = calcStats([{ totalPages: 0 }, { totalPages: 400 }], NOW);
    expect(s.totalPages).toBe(400);
    expect(s.avgPages).toBe(400);
  });

  it('avgPages is null when no books have pages', () => {
    const s = calcStats([{}, {}], NOW);
    expect(s.avgPages).toBeNull();
  });
});

describe('calcStats — unique counts', () => {
  it('counts unique authors (deduped)', () => {
    const books = [
      { author: 'Author A' },
      { author: 'Author B' },
      { author: 'Author A' },
    ];
    expect(calcStats(books, NOW).uniqueAuthors).toBe(2);
  });

  it('ignores missing authors', () => {
    const books = [{ author: 'A' }, {}, { author: null }];
    expect(calcStats(books, NOW).uniqueAuthors).toBe(1);
  });

  it('counts unique countries', () => {
    const books = [
      { country: 'France' }, { country: 'Germany' }, { country: 'France' },
    ];
    expect(calcStats(books, NOW).uniqueCountries).toBe(2);
  });

  it('counts unique languages', () => {
    const books = [
      { language: 'English' }, { language: 'French' }, { language: 'English' },
    ];
    expect(calcStats(books, NOW).uniqueLanguages).toBe(2);
  });
});

describe('calcStats — this year / this month', () => {
  const NOW_TEST = new Date('2025-06-15');

  it('counts books finished this year', () => {
    const books = [
      { finishedAt: ts('2025-01-01') },
      { finishedAt: ts('2025-06-10') },
      { finishedAt: ts('2024-12-31') },
    ];
    expect(calcStats(books, NOW_TEST).thisYear).toBe(2);
  });

  it('counts books finished this month', () => {
    const books = [
      { finishedAt: ts('2025-06-01') },
      { finishedAt: ts('2025-06-14') },
      { finishedAt: ts('2025-05-31') },
      { finishedAt: ts('2024-06-01') },
    ];
    expect(calcStats(books, NOW_TEST).thisMonth).toBe(2);
  });

  it('books without finishedAt are not counted', () => {
    const books = [{}, { finishedAt: ts('2025-06-01') }];
    expect(calcStats(books, NOW_TEST).thisYear).toBe(1);
  });
});

describe('calcStats — continent counts', () => {
  it('correctly buckets countries into continents', () => {
    const books = [
      { country: 'France' },          // EU
      { country: 'United States' },   // NA
      { country: 'Brazil' },          // SA
      { country: 'Japan' },           // AS
      { country: 'Australia' },       // OC
      { country: 'Nigeria' },         // AF
    ];
    const { continentCounts } = calcStats(books, NOW);
    expect(continentCounts.EU).toBe(1);
    expect(continentCounts.NA).toBe(1);
    expect(continentCounts.SA).toBe(1);
    expect(continentCounts.AS).toBe(1);
    expect(continentCounts.OC).toBe(1);
    expect(continentCounts.AF).toBe(1);
  });

  it('ignores unknown countries', () => {
    const books = [{ country: 'Narnia' }];
    const { continentCounts } = calcStats(books, NOW);
    expect(Object.values(continentCounts).every(n => n === 0)).toBe(true);
  });

  it('is case-insensitive for country lookup', () => {
    const books = [{ country: 'FRANCE' }, { country: 'france' }];
    const { continentCounts } = calcStats(books, NOW);
    expect(continentCounts.EU).toBe(2);
  });
});

describe('calcStats — gender counts', () => {
  it('counts male and female authors', () => {
    const books = [
      { author: 'Author A', authorGender: 'Male' },
      { author: 'Author B', authorGender: 'Female' },
    ];
    const { genderCounts, genderKnown } = calcStats(books, NOW);
    expect(genderCounts.Male).toBe(1);
    expect(genderCounts.Female).toBe(1);
    expect(genderKnown).toBe(2);
  });

  it('counts every book by the same author, not the author once', () => {
    const books = [
      { author: 'Author A', authorGender: 'Male' },
      { author: 'Author A', authorGender: 'Male' },
    ];
    expect(calcStats(books, NOW).genderCounts.Male).toBe(2);
  });

  it('counts a book whose author name is missing but gender is known', () => {
    expect(calcStats([{ authorGender: 'Female' }], NOW).genderCounts.Female).toBe(1);
  });

  it('weights the ratio by books rather than authors', () => {
    // One prolific male author, three separate female authors: by author this
    // would be 25/75, by book it is 57/43.
    const books = [
      { author: 'A', authorGender: 'Male' }, { author: 'A', authorGender: 'Male' },
      { author: 'A', authorGender: 'Male' }, { author: 'A', authorGender: 'Male' },
      { author: 'B', authorGender: 'Female' },
      { author: 'C', authorGender: 'Female' },
      { author: 'D', authorGender: 'Female' },
    ];
    const { genderCounts, genderKnown, genderRatio } = calcStats(books, NOW);
    expect(genderCounts.Male).toBe(4);
    expect(genderCounts.Female).toBe(3);
    expect(genderKnown).toBe(7);
    expect(genderRatio).toBe('57/43/0');
  });

  it('counts non-binary authors per book', () => {
    const books = [
      { author: 'A', authorGender: 'Non-binary' },
      { author: 'A', authorGender: 'Non-binary' },
    ];
    expect(calcStats(books, NOW).genderCounts['Non-binary']).toBe(2);
  });

  it('counts other-gender authors per book', () => {
    const books = [
      { author: 'A', authorGender: 'Other' },
      { author: 'A', authorGender: 'Other' },
    ];
    expect(calcStats(books, NOW).genderCounts.Other).toBe(2);
  });

  it('ignores a gender value outside the four known buckets', () => {
    const books = [
      { author: 'A', authorGender: 'Male' },
      { author: 'B', authorGender: 'Transgender female' },
    ];
    const { genderCounts, genderKnown } = calcStats(books, NOW);
    expect(genderKnown).toBe(1);
    expect(genderCounts.Male).toBe(1);
  });

  it('keeps genderKnown equal to the number of counted books', () => {
    const books = [
      { author: 'A', authorGender: 'Male' },
      { author: 'A', authorGender: 'Male' },
      { author: 'B', authorGender: 'Female' },
      { author: 'C' },
    ];
    const { genderCounts, genderKnown } = calcStats(books, NOW);
    const summed = genderCounts.Male + genderCounts.Female
      + genderCounts['Non-binary'] + genderCounts.Other;
    expect(genderKnown).toBe(3);
    expect(summed).toBe(genderKnown);
  });

  it('does not let uniqueAuthors and genderKnown drift together', () => {
    // uniqueAuthors stays author-based; only the gender counts became per-book.
    const books = [
      { author: 'A', authorGender: 'Male' },
      { author: 'A', authorGender: 'Male' },
    ];
    const { uniqueAuthors, genderKnown } = calcStats(books, NOW);
    expect(uniqueAuthors).toBe(1);
    expect(genderKnown).toBe(2);
  });

  it('computes gender ratio', () => {
    const books = [
      { author: 'A', authorGender: 'Male' },
      { author: 'B', authorGender: 'Female' },
      { author: 'C', authorGender: 'Female' },
    ];
    const { genderRatio } = calcStats(books, NOW);
    // 33% / 67% / 0%
    expect(genderRatio).toBe('33/67/0');
  });

  it('gender ratio is "–" when no gender data', () => {
    const books = [{ author: 'A' }, { author: 'B' }];
    expect(calcStats(books, NOW).genderRatio).toBe('–');
  });

  it('ignores books without authorGender', () => {
    const books = [
      { author: 'A', authorGender: 'Male' },
      { author: 'B' },
    ];
    expect(calcStats(books, NOW).genderKnown).toBe(1);
  });
});

// ── format breakdown ────────────────────────────────────────────────────────
//
// The library offers exactly Physical, Digital and Audiobook. Anything else —
// an empty string, a value from before the field existed, a typo written
// straight to Firestore — must not be counted as one of them or invented as a
// new bucket, because the summary reads the three keys by name.

describe('calcStats — formats', () => {
  const of = (...formats) => calcStats(formats.map(format => ({ format })));

  it('counts each of the three formats', () => {
    const s = of('Physical', 'Physical', 'Digital', 'Audiobook');
    expect(s.formatCounts).toEqual({ Physical: 2, Digital: 1, Audiobook: 1 });
    expect(s.formatKnown).toBe(4);
  });

  it('ignores books with no format rather than counting them anywhere', () => {
    const s = of('Physical', undefined, '', null);
    expect(s.formatCounts).toEqual({ Physical: 1, Digital: 0, Audiobook: 0 });
    expect(s.formatKnown).toBe(1);
  });

  it('does not invent a bucket for an unrecognised value', () => {
    // `b.format in formatCounts` is the guard; a plain assignment would add a
    // key the summary never reads and the total would stop adding up.
    const s = of('Physical', 'Paperback', 'ebook', 'AUDIOBOOK');
    expect(Object.keys(s.formatCounts)).toEqual(['Physical', 'Digital', 'Audiobook']);
    expect(s.formatKnown).toBe(1);
  });

  it('is not confused by inherited property names', () => {
    // `in` walks the prototype chain, so 'constructor' would otherwise pass the
    // guard and then fail the increment.
    const s = of('constructor', 'toString');
    expect(s.formatCounts).toEqual({ Physical: 0, Digital: 0, Audiobook: 0 });
    expect(s.formatKnown).toBe(0);
  });

  it('reports nothing known for an empty library', () => {
    expect(calcStats([]).formatKnown).toBe(0);
  });
});

describe('calcStats — gender guard', () => {
  // Same prototype-chain trap as the format counts, in code that predates them.
  it('does not count an inherited property name as a gender', () => {
    const s = calcStats([{ authorGender: 'constructor' }, { authorGender: 'toString' }]);
    expect(s.genderCounts).toEqual({ Male: 0, Female: 0, 'Non-binary': 0, Other: 0 });
    expect(s.genderKnown).toBe(0);
  });

  it('still counts the real ones', () => {
    const s = calcStats([{ authorGender: 'Female' }, { authorGender: 'Non-binary' }, { authorGender: 'Female' }]);
    expect(s.genderCounts).toMatchObject({ Female: 2, 'Non-binary': 1 });
    expect(s.genderKnown).toBe(3);
  });
});
