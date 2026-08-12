// Tests for the progress sync endpoint's matching and conversion.
// A wrong answer here writes a wrong page into someone's library, or silently
// updates a book they were not reading — so the bias throughout is to refuse.

import { describe, it, expect } from 'vitest';
import pkg from '../functions/progress-utils.js';
const { matchBook, resolvePage } = pkg;

const book = (data) => ({ id: data.id || data.title, ref: {}, data });

// ── matchBook ─────────────────────────────────────────────────────────────────

describe('matchBook — by gbid', () => {
  const lib = [
    book({ id: 'a', gbid: 'the-employees', title: 'The Employees' }),
    book({ id: 'b', gbid: 'dune',          title: 'Dune' }),
  ];

  it('matches an exact slug', () => {
    expect(matchBook(lib, { gbid: 'dune' }).id).toBe('b');
  });

  it('returns null for an unknown slug with no other hint', () => {
    expect(matchBook(lib, { gbid: 'nope' })).toBeNull();
  });

  it('falls back to title when the slug misses', () => {
    expect(matchBook(lib, { gbid: 'nope', title: 'Dune' }).id).toBe('b');
  });
});

describe('matchBook — by title', () => {
  const lib = [
    book({ id: 'a', title: 'The Employees', author: 'Olga Ravn', status: 'finished' }),
    book({ id: 'b', title: 'Dune',          author: 'Frank Herbert', status: 'reading' }),
  ];

  it('matches an exact title', () => {
    expect(matchBook(lib, { title: 'Dune' }).id).toBe('b');
  });

  it('ignores case and surrounding space', () => {
    expect(matchBook(lib, { title: '  dUnE ' }).id).toBe('b');
  });

  it('returns null for a title that is not there', () => {
    expect(matchBook(lib, { title: 'Ubik' })).toBeNull();
  });

  it('does not fall back to the reading book when a title was given but missed', () => {
    // Naming a book and getting a different one silently would be worse than
    // failing: the caller asked for something specific.
    expect(matchBook(lib, { title: 'Ubik' })).toBeNull();
  });

  it('does not substring match', () => {
    expect(matchBook(lib, { title: 'Dun' })).toBeNull();
  });
});

describe('matchBook — ambiguous titles', () => {
  const lib = [
    book({ id: 'a', title: 'Beloved', author: 'Toni Morrison' }),
    book({ id: 'b', title: 'Beloved', author: 'Someone Else' }),
  ];

  it('refuses when two books share a title and no author is given', () => {
    expect(matchBook(lib, { title: 'Beloved' })).toBeNull();
  });

  it('disambiguates with the author', () => {
    expect(matchBook(lib, { title: 'Beloved', author: 'Toni Morrison' }).id).toBe('a');
  });

  it('refuses when the author does not narrow it to one', () => {
    const three = [...lib, book({ id: 'c', title: 'Beloved', author: 'Toni Morrison' })];
    expect(matchBook(three, { title: 'Beloved', author: 'Toni Morrison' })).toBeNull();
  });

  it('refuses when the author matches nothing', () => {
    expect(matchBook(lib, { title: 'Beloved', author: 'Nobody' })).toBeNull();
  });
});

describe('matchBook — no currently-reading fallback', () => {
  // A library can have dozens of books in progress, so guessing from status
  // would land a push on an arbitrary one. Naming nothing is an error the
  // endpoint answers by adding the book instead.
  it('refuses when nothing is named, even with one book in progress', () => {
    const lib = [
      book({ id: 'a', title: 'Done',    status: 'finished' }),
      book({ id: 'b', title: 'Current', status: 'reading' }),
    ];
    expect(matchBook(lib, {})).toBeNull();
  });

  it('refuses when nothing is named and many are in progress', () => {
    const lib = Array.from({ length: 50 }, (_, i) =>
      book({ id: `b${i}`, title: `Book ${i}`, status: 'reading' }));
    expect(matchBook(lib, {})).toBeNull();
  });

  it('ignores status entirely when a title is given', () => {
    const lib = [
      book({ id: 'a', title: 'Wanted',  status: 'finished' }),
      book({ id: 'b', title: 'Current', status: 'reading' }),
    ];
    expect(matchBook(lib, { title: 'Wanted' }).id).toBe('a');
  });

  it('refuses an empty or whitespace title rather than matching anything', () => {
    const lib = [book({ id: 'a', title: 'Current', status: 'reading' })];
    expect(matchBook(lib, { title: '' })).toBeNull();
    expect(matchBook(lib, { title: '   ' })).toBeNull();
  });
});

describe('matchBook — bad input', () => {
  it('handles an empty library', () => {
    expect(matchBook([], { title: 'Dune' })).toBeNull();
    expect(matchBook([], {})).toBeNull();
  });

  it('handles a missing library', () => {
    expect(matchBook(null, { title: 'Dune' })).toBeNull();
  });

  it('refuses a missing body rather than picking something', () => {
    expect(matchBook([book({ id: 'a', status: 'reading' })])).toBeNull();
  });

  it('tolerates books with no title', () => {
    expect(matchBook([book({ id: 'a' })], { title: 'Dune' })).toBeNull();
  });
});

// ── resolvePage ───────────────────────────────────────────────────────────────

describe('resolvePage — explicit page', () => {
  it('takes a page directly', () => {
    expect(resolvePage({ totalPages: 300 }, { page: 84 })).toBe(84);
  });

  it('rounds a fractional page', () => {
    expect(resolvePage({ totalPages: 300 }, { page: 84.6 })).toBe(85);
  });

  it('clamps a negative page to zero', () => {
    expect(resolvePage({ totalPages: 300 }, { page: -5 })).toBe(0);
  });

  it('works without a page count', () => {
    // An explicit page needs no conversion, so a missing total is fine.
    expect(resolvePage({}, { page: 42 })).toBe(42);
  });

  it('wins over percent and seconds', () => {
    expect(resolvePage({ totalPages: 300 }, { page: 10, percent: 90, seconds: 100, totalSeconds: 200 })).toBe(10);
  });
});

describe('resolvePage — percent', () => {
  it('converts against the page count', () => {
    expect(resolvePage({ totalPages: 300 }, { percent: 50 })).toBe(150);
  });

  it('rounds to the nearest page', () => {
    expect(resolvePage({ totalPages: 368 }, { percent: 62 })).toBe(228);
  });

  it('handles 0 and 100', () => {
    expect(resolvePage({ totalPages: 300 }, { percent: 0 })).toBe(0);
    expect(resolvePage({ totalPages: 300 }, { percent: 100 })).toBe(300);
  });

  it('clamps out-of-range percentages', () => {
    expect(resolvePage({ totalPages: 300 }, { percent: 140 })).toBe(300);
    expect(resolvePage({ totalPages: 300 }, { percent: -20 })).toBe(0);
  });

  it('refuses without a page count rather than writing zero', () => {
    expect(resolvePage({ totalPages: 0 }, { percent: 50 })).toBeNull();
    expect(resolvePage({}, { percent: 50 })).toBeNull();
  });
});

describe('resolvePage — audiobook seconds', () => {
  it('converts listening position to a page', () => {
    // Half way through a 10-hour audiobook of a 400-page book.
    expect(resolvePage({ totalPages: 400 }, { seconds: 18000, totalSeconds: 36000 })).toBe(200);
  });

  it('handles the start and the end', () => {
    expect(resolvePage({ totalPages: 400 }, { seconds: 0, totalSeconds: 36000 })).toBe(0);
    expect(resolvePage({ totalPages: 400 }, { seconds: 36000, totalSeconds: 36000 })).toBe(400);
  });

  it('clamps a position past the end', () => {
    expect(resolvePage({ totalPages: 400 }, { seconds: 99999, totalSeconds: 36000 })).toBe(400);
  });

  it('refuses a zero or missing duration rather than dividing by zero', () => {
    expect(resolvePage({ totalPages: 400 }, { seconds: 100, totalSeconds: 0 })).toBeNull();
    expect(resolvePage({ totalPages: 400 }, { seconds: 100 })).toBeNull();
  });

  it('refuses without a page count', () => {
    expect(resolvePage({}, { seconds: 100, totalSeconds: 200 })).toBeNull();
  });
});

describe('resolvePage — nothing usable', () => {
  it('returns null for an empty body', () => {
    expect(resolvePage({ totalPages: 300 }, {})).toBeNull();
    expect(resolvePage({ totalPages: 300 })).toBeNull();
  });

  it('ignores non-numeric values rather than coercing them', () => {
    expect(resolvePage({ totalPages: 300 }, { page: '84' })).toBeNull();
    expect(resolvePage({ totalPages: 300 }, { percent: 'half' })).toBeNull();
    expect(resolvePage({ totalPages: 300 }, { page: NaN })).toBeNull();
  });

  it('never returns a page beyond the book', () => {
    for (const percent of [0, 25, 50, 99.9, 100, 250]) {
      const page = resolvePage({ totalPages: 368 }, { percent });
      expect(page).toBeGreaterThanOrEqual(0);
      expect(page).toBeLessThanOrEqual(368);
    }
  });
});
