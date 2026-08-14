// Pure helpers for the progress sync endpoint — no Firebase, so they can be
// unit tested. Getting these wrong writes a wrong page number into someone's
// library, or silently updates the wrong book.

// Same list the app uses in js/hardcover.js — keep the two in step.
const STUDY_GUIDE_RE = /\b(sparknotes?|cliffsnotes?|shmoop|study guide|bookrags|novelguide|gradesaver|litcharts?|supersummary|a-level notes?)\b/i;

const normaliseTitle = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Companion volumes and summaries that share a title with the book they discuss.
// The study-guide filter catches branded ones; these are the generic phrasings.
const NOT_THE_BOOK_RE = /\b(summary|analysis|companion|study aid|discussion guide|quiz|trivia|workbook|conversation starters|key takeaways)\b/i;

// Picks which Hardcover search result a title actually refers to.
//
// Search ranks by text relevance, which is not what we want: a 13-page
// "Piranesi by Susanna Clarke" summary outranks the real 245-page Piranesi that
// 7,759 people have read. And a nonsense query still returns hits, so taking
// the top result would add a junk book for any typo.
//
// So: reject anything whose title doesn't actually agree with what was asked
// for, reject page-less and companion entries, then prefer an exact title match
// and, within that, the edition most people have.
function pickBestHit(hits, wantedTitle, wantedAuthor) {
  const want = normaliseTitle(wantedTitle);
  if (!want) return null;
  const wantAuthor = normaliseTitle(wantedAuthor);

  const authorsOf = d =>
    normaliseTitle(Array.isArray(d.author_names) ? d.author_names.join(' ') : (d.author_names || ''));

  const scored = (hits || [])
    .map(h => h?.document || h)
    .filter(Boolean)
    .filter(d => {
      if (!d.slug || !(d.pages > 0)) return false;
      const title = String(d.title || '');
      if (STUDY_GUIDE_RE.test(title) || STUDY_GUIDE_RE.test(authorsOf(d))) return false;
      if (NOT_THE_BOOK_RE.test(title)) return false;
      const got = normaliseTitle(title);
      // "<Title> by <Author>" is how the auto-generated companions are named.
      // A real edition is never titled that way.
      if (got.startsWith(`${want} by `)) return false;
      // One must be a prefix of the other: "Piranesi" may legitimately be
      // stored as "Piranesi: A Novel", but never as "Once Upon a Zzzz".
      return got === want || got.startsWith(want) || want.startsWith(got);
    })
    .map(d => ({
      doc: d,
      exact: normaliseTitle(d.title) === want ? 1 : 0,
      byAuthor: wantAuthor && authorsOf(d).includes(wantAuthor) ? 1 : 0,
      users: Number(d.users_count) || 0,
    }));

  if (!scored.length) return null;
  // Exact title first, then the right author, then whichever edition most
  // people have actually read — readership is the best proxy for "the real one".
  scored.sort((a, b) => (b.exact - a.exact) || (b.byAuthor - a.byAuthor) || (b.users - a.users));
  return scored[0].doc;
}

// Finds the book a push refers to in the user's own library.
//
// Order: exact gbid, then exact title, disambiguated by author when several
// share one. Ambiguity refuses rather than guesses.
//
// There is deliberately no "the one book you're reading" fallback: a library
// can have dozens in progress, so a push that named nothing would land on an
// arbitrary book. A caller that names a book not in the library gets it added
// instead — see the endpoint.
function matchBook(books, { gbid, title, author } = {}) {
  if (!Array.isArray(books)) return null;

  if (gbid) {
    const hit = books.find(b => b.data.gbid === gbid);
    if (hit) return hit;
  }

  if (!title) return null;

  // What the pushing device calls the book, recorded when sync added it.
  // Hardcover's canonical title is often longer ("Piranesi: A Novel"), and
  // without this every later push would fail to match and add a duplicate.
  const wantNorm = normaliseTitle(title);
  const byAlias = books.filter(b => (b.data.syncTitles || []).includes(wantNorm));
  if (byAlias.length === 1) return byAlias[0];

  const want = String(title).trim().toLowerCase();
  if (!want) return null;
  const byTitle = books.filter(b => (b.data.title || '').trim().toLowerCase() === want);
  if (byTitle.length === 1) return byTitle[0];
  if (byTitle.length > 1) {
    if (!author) return null;
    const wantAuthor = String(author).trim().toLowerCase();
    const exact = byTitle.filter(b => (b.data.author || '').trim().toLowerCase() === wantAuthor);
    return exact.length === 1 ? exact[0] : null;
  }
  return null;
}

const clampPct = n => Math.min(100, Math.max(0, n));

// Works out what to write for a push, in whatever unit the book actually uses.
//
// The app stores audiobooks as `format: 'Audiobook'` with a `progressPct`, and
// everything else as `currentPage` against `totalPages` — audiobooks have no
// page count at all. So a position in seconds must not be turned into a page:
// it marks the book as an audiobook and stores a percentage, which also means
// an audiobook push works for a book with no page count.
//
// Returns null when there is nothing safe to write, so the caller can say why
// rather than store a wrong number.
function resolveProgress(data = {}, { page, percent, seconds, totalSeconds } = {}) {
  const total = Number(data.totalPages) || 0;
  const hasDuration = Number.isFinite(seconds) && Number.isFinite(totalSeconds) && totalSeconds > 0;

  // A duration is proof of an audiobook, whatever the book was before.
  if (hasDuration) {
    return {
      format: 'Audiobook',
      progressPct: Math.round(clampPct((seconds / totalSeconds) * 100)),
    };
  }

  if (data.format === 'Audiobook') {
    if (Number.isFinite(percent)) return { progressPct: Math.round(clampPct(percent)) };
    // A page number against an audiobook only means something if the entry
    // still carries a page count from before it was reclassified.
    if (Number.isFinite(page) && total > 0) {
      return { progressPct: Math.round(clampPct((page / total) * 100)) };
    }
    return null;
  }

  if (Number.isFinite(page)) return { currentPage: Math.max(0, Math.round(page)) };

  if (Number.isFinite(percent)) {
    if (!total) return null;
    return { currentPage: Math.round(clampPct(percent) / 100 * total) };
  }

  return null;
}

module.exports = { matchBook, resolveProgress, pickBestHit, normaliseTitle };
