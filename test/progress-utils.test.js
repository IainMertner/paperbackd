// Tests for the progress sync endpoint's matching and conversion.
// A wrong answer here writes a wrong page into someone's library, or silently
// updates a book they were not reading — so the bias throughout is to refuse.

import { describe, it, expect } from 'vitest';
import pkg from '../functions/progress-utils.js';
const { matchBook, resolveProgress, pickBestHit, normaliseTitle } = pkg;

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

// ── matchBook — sync aliases ──────────────────────────────────────────────────

describe('matchBook — sync aliases', () => {
  // Hardcover's canonical title is often longer than what a device reports.
  // Without recording the pushed title, the second push wouldn't match and the
  // endpoint would add the book again — it did exactly that in testing.
  const lib = [book({
    id: 'a',
    title: 'Piranesi: A Novel',
    syncTitles: [normaliseTitle('Piranesi')],
  })];

  it('matches the title the device sends, not just the stored one', () => {
    expect(matchBook(lib, { title: 'Piranesi' }).id).toBe('a');
  });

  it('still matches the stored title', () => {
    expect(matchBook(lib, { title: 'Piranesi: A Novel' }).id).toBe('a');
  });

  it('normalises punctuation and case in the alias', () => {
    expect(matchBook(lib, { title: '  piranesi  ' }).id).toBe('a');
  });

  it('does not match an unrelated title', () => {
    expect(matchBook(lib, { title: 'Dune' })).toBeNull();
  });

  it('refuses when two books claim the same alias', () => {
    const two = [...lib, book({ id: 'b', title: 'Other', syncTitles: [normaliseTitle('Piranesi')] })];
    expect(matchBook(two, { title: 'Piranesi' })).toBeNull();
  });

  it('is unaffected by books with no aliases', () => {
    const mixed = [book({ id: 'x', title: 'Dune' }), ...lib];
    expect(matchBook(mixed, { title: 'Piranesi' }).id).toBe('a');
  });
});

// ── pickBestHit ───────────────────────────────────────────────────────────────

describe('pickBestHit', () => {
  const doc = (o) => ({ document: { slug: o.title.toLowerCase().replace(/\W+/g, '-'), pages: 200, users_count: 100, ...o } });

  it('prefers the real book over a summary that outranks it', () => {
    // Exactly what Hardcover returned: the 13-page companion came first.
    const hits = [
      doc({ title: 'Piranesi by Susanna Clarke', pages: 13, users_count: 12 }),
      doc({ title: 'Piranesi', pages: 245, users_count: 7759 }),
    ];
    expect(pickBestHit(hits, 'Piranesi').pages).toBe(245);
  });

  it('returns nothing for a query no title agrees with', () => {
    // Search always returns something; a typo must not create a book.
    const hits = [
      doc({ title: 'Once Upon a Zzzz' }),
      doc({ title: "Disney's - Winnie the Pooh's A to Zzzz" }),
    ];
    expect(pickBestHit(hits, 'zzzz not a real book zzzz')).toBeNull();
  });

  it('accepts a longer canonical title', () => {
    const hits = [doc({ title: 'Piranesi: A Novel' })];
    expect(pickBestHit(hits, 'Piranesi').title).toBe('Piranesi: A Novel');
  });

  it('prefers an exact title over a more popular longer one', () => {
    const hits = [
      doc({ title: 'Dune Messiah', users_count: 9000 }),
      doc({ title: 'Dune', users_count: 100 }),
    ];
    expect(pickBestHit(hits, 'Dune').title).toBe('Dune');
  });

  it('rejects the "<Title> by <Author>" companion naming', () => {
    // How the auto-generated companions are titled; a real edition never is.
    const hits = [
      doc({ title: 'The Left Hand of Darkness by Ursula K. Le Guin', pages: 20, users_count: 1 }),
      doc({ title: 'The Left Hand of Darkness', pages: 304, users_count: 4053 }),
    ];
    expect(pickBestHit(hits, 'The Left Hand of Darkness').pages).toBe(304);
  });

  it('uses the author to choose between books sharing a title', () => {
    const hits = [
      doc({ title: 'Beloved', author_names: ['Someone Else'], users_count: 9000 }),
      doc({ title: 'Beloved', author_names: ['Toni Morrison'], users_count: 10 }),
    ];
    expect(pickBestHit(hits, 'Beloved', 'Toni Morrison').author_names).toEqual(['Toni Morrison']);
  });

  it('falls back to readership when no author is given', () => {
    const hits = [
      doc({ title: 'Beloved', author_names: ['Someone Else'], users_count: 9000 }),
      doc({ title: 'Beloved', author_names: ['Toni Morrison'], users_count: 10 }),
    ];
    expect(pickBestHit(hits, 'Beloved').users_count).toBe(9000);
  });

  it('breaks ties on readership', () => {
    const hits = [
      doc({ title: 'Dune', users_count: 10, slug: 'dune-obscure' }),
      doc({ title: 'Dune', users_count: 90000, slug: 'dune' }),
    ];
    expect(pickBestHit(hits, 'Dune').slug).toBe('dune');
  });

  it('rejects entries with no page count', () => {
    // Without pages a percentage can't become a page, so it is useless anyway.
    expect(pickBestHit([doc({ title: 'Piranesi', pages: 0 })], 'Piranesi')).toBeNull();
  });

  it('rejects study guides and companions', () => {
    for (const title of [
      'SparkNotes: Piranesi', 'Piranesi: A Summary', 'Piranesi Analysis',
      'Piranesi — Conversation Starters', 'Piranesi Workbook',
    ]) {
      expect(pickBestHit([doc({ title })], 'Piranesi')).toBeNull();
    }
  });

  it('rejects a hit whose author is a study-guide publisher', () => {
    const hits = [doc({ title: 'Piranesi', author_names: ['SuperSummary'] })];
    expect(pickBestHit(hits, 'Piranesi')).toBeNull();
  });

  it('handles empty and missing input', () => {
    expect(pickBestHit([], 'Piranesi')).toBeNull();
    expect(pickBestHit(null, 'Piranesi')).toBeNull();
    expect(pickBestHit([doc({ title: 'Piranesi' })], '')).toBeNull();
  });

  it('accepts documents passed without the search wrapper', () => {
    const bare = [{ slug: 'piranesi', title: 'Piranesi', pages: 245, users_count: 100 }];
    expect(pickBestHit(bare, 'Piranesi').slug).toBe('piranesi');
  });
});

// ── resolveProgress ───────────────────────────────────────────────────────────
//
// The app stores audiobooks as format 'Audiobook' with a progressPct, and
// everything else as currentPage against totalPages. Writing a page number onto
// an audiobook would show up as nothing at all in the library.

describe('resolveProgress — print and ebook', () => {
  it('takes an explicit page', () => {
    expect(resolveProgress({ totalPages: 300 }, { page: 84 })).toEqual({ currentPage: 84 });
  });

  it('rounds a fractional page', () => {
    expect(resolveProgress({ totalPages: 300 }, { page: 84.6 })).toEqual({ currentPage: 85 });
  });

  it('clamps a negative page to zero', () => {
    expect(resolveProgress({ totalPages: 300 }, { page: -5 })).toEqual({ currentPage: 0 });
  });

  it('accepts a page without a page count', () => {
    expect(resolveProgress({}, { page: 42 })).toEqual({ currentPage: 42 });
  });

  it('converts a percentage against the page count', () => {
    expect(resolveProgress({ totalPages: 300 }, { percent: 50 })).toEqual({ currentPage: 150 });
    expect(resolveProgress({ totalPages: 368 }, { percent: 62 })).toEqual({ currentPage: 228 });
  });

  it('clamps out-of-range percentages', () => {
    expect(resolveProgress({ totalPages: 300 }, { percent: 140 })).toEqual({ currentPage: 300 });
    expect(resolveProgress({ totalPages: 300 }, { percent: -20 })).toEqual({ currentPage: 0 });
  });

  it('refuses a percentage with no page count rather than writing zero', () => {
    expect(resolveProgress({ totalPages: 0 }, { percent: 50 })).toBeNull();
    expect(resolveProgress({}, { percent: 50 })).toBeNull();
  });

  it('never sets a format for a page-based push', () => {
    expect(resolveProgress({ totalPages: 300 }, { page: 10 }).format).toBeUndefined();
    expect(resolveProgress({ totalPages: 300 }, { percent: 10 }).format).toBeUndefined();
  });
});

describe('resolveProgress — audiobook duration', () => {
  it('marks the book as an audiobook and stores a percentage', () => {
    expect(resolveProgress({ totalPages: 400 }, { seconds: 18000, totalSeconds: 36000 }))
      .toEqual({ format: 'Audiobook', progressPct: 50 });
  });

  it('never writes a page for a duration push', () => {
    expect(resolveProgress({ totalPages: 400 }, { seconds: 100, totalSeconds: 200 }).currentPage)
      .toBeUndefined();
  });

  it('works for a book with no page count at all', () => {
    // The whole point: audiobooks have no pages, so this must not need them.
    expect(resolveProgress({}, { seconds: 900, totalSeconds: 3600 }))
      .toEqual({ format: 'Audiobook', progressPct: 25 });
  });

  it('handles the start and the end', () => {
    expect(resolveProgress({}, { seconds: 0, totalSeconds: 3600 }).progressPct).toBe(0);
    expect(resolveProgress({}, { seconds: 3600, totalSeconds: 3600 }).progressPct).toBe(100);
  });

  it('clamps a position past the end', () => {
    expect(resolveProgress({}, { seconds: 99999, totalSeconds: 3600 }).progressPct).toBe(100);
  });

  it('refuses a zero or missing duration rather than dividing by zero', () => {
    expect(resolveProgress({ totalPages: 400 }, { seconds: 100, totalSeconds: 0 })).toBeNull();
    expect(resolveProgress({ totalPages: 400 }, { seconds: 100 })).toBeNull();
  });

  it('a duration wins over a page or percent in the same push', () => {
    const out = resolveProgress({ totalPages: 400 }, { page: 10, percent: 90, seconds: 100, totalSeconds: 200 });
    expect(out).toEqual({ format: 'Audiobook', progressPct: 50 });
  });
});

describe('resolveProgress — a book already marked Audiobook', () => {
  const audio = { format: 'Audiobook', totalPages: 0 };

  it('stores a percentage rather than a page', () => {
    expect(resolveProgress(audio, { percent: 62 })).toEqual({ progressPct: 62 });
  });

  it('does not re-write the format it already has', () => {
    expect(resolveProgress(audio, { percent: 62 }).format).toBeUndefined();
  });

  it('converts a page push when the entry still has a page count', () => {
    expect(resolveProgress({ format: 'Audiobook', totalPages: 200 }, { page: 50 }))
      .toEqual({ progressPct: 25 });
  });

  it('refuses a page push when there is no page count to convert against', () => {
    expect(resolveProgress(audio, { page: 50 })).toBeNull();
  });

  it('clamps percentages', () => {
    expect(resolveProgress(audio, { percent: 150 })).toEqual({ progressPct: 100 });
    expect(resolveProgress(audio, { percent: -5 })).toEqual({ progressPct: 0 });
  });
});

describe('resolveProgress — nothing usable', () => {
  it('returns null for an empty body', () => {
    expect(resolveProgress({ totalPages: 300 }, {})).toBeNull();
    expect(resolveProgress({ totalPages: 300 })).toBeNull();
  });

  it('ignores non-numeric values rather than coercing them', () => {
    expect(resolveProgress({ totalPages: 300 }, { page: '84' })).toBeNull();
    expect(resolveProgress({ totalPages: 300 }, { percent: 'half' })).toBeNull();
    expect(resolveProgress({ totalPages: 300 }, { page: NaN })).toBeNull();
  });

  it('never returns a page beyond the book, or a percent beyond 100', () => {
    for (const percent of [0, 25, 50, 99.9, 100, 250]) {
      expect(resolveProgress({ totalPages: 368 }, { percent }).currentPage).toBeLessThanOrEqual(368);
      expect(resolveProgress({ format: 'Audiobook' }, { percent }).progressPct).toBeLessThanOrEqual(100);
    }
  });
});
