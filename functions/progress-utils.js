// Pure helpers for the progress sync endpoint — no Firebase, so they can be
// unit tested. Getting these wrong writes a wrong page number into someone's
// library, or silently updates the wrong book.

// Books are matched against the user's own library rather than looked up
// externally: progress only means something for a book they already have.
//
// Order: exact gbid, then exact title (disambiguated by author when several
// share one), then — if the caller named nothing — the single book in progress.
// Ambiguity always refuses rather than guesses.
function matchBook(books, { gbid, title, author } = {}) {
  if (!Array.isArray(books)) return null;

  if (gbid) {
    const hit = books.find(b => b.data.gbid === gbid);
    if (hit) return hit;
  }

  if (title) {
    const want = String(title).trim().toLowerCase();
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

  if (!gbid) {
    const reading = books.filter(b => b.data.status === 'reading');
    if (reading.length === 1) return reading[0];
  }
  return null;
}

// Everything becomes a page in the end: percent and audiobook seconds are
// converted against the book's own length. Returns null when there is nothing
// safe to write, so the caller can report why rather than store a wrong number.
function resolvePage(data = {}, { page, percent, seconds, totalSeconds } = {}) {
  const total = Number(data.totalPages) || 0;

  if (Number.isFinite(page)) return Math.max(0, Math.round(page));

  if (Number.isFinite(percent)) {
    if (!total) return null;
    const clamped = Math.min(100, Math.max(0, percent));
    return Math.round(clamped / 100 * total);
  }

  if (Number.isFinite(seconds) && Number.isFinite(totalSeconds) && totalSeconds > 0) {
    if (!total) return null;
    const fraction = Math.min(1, Math.max(0, seconds / totalSeconds));
    return Math.round(fraction * total);
  }

  return null;
}

module.exports = { matchBook, resolvePage };
