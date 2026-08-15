// A small "how far are you?" popover, for updating progress without a trip to
// the library.
//
// Deliberately not the library's reading card: that one also does covers,
// repair, list membership, dates, formats and finishing, and it is wired into
// the library grid behind it. This is the one field people actually reach for.

import { esc, toAuthorSlug } from './utils.js';
import { updateBookMeta } from './firebase.js';
// The arithmetic lives in book-utils so it can be tested without pulling in
// firebase.js, which imports the SDK over https and cannot be loaded in Node.
import { isAudiobook, libraryLink, progressPercent, progressText, progressUpdate } from './book-utils.js';

const coverInner = book => book.coverUrl
  ? `<img class="quick-progress-cover" src="${esc(book.coverUrl)}" alt="">`
  : `<div class="quick-progress-cover quick-progress-cover-empty">📖</div>`;

// The book page is keyed by gbid, so without one there is nowhere to send
// anybody — render the cover and title as plain elements rather than as links
// that go somewhere wrong.
const coverHtml = (book, href) => href
  ? `<a href="${href}" class="quick-progress-cover-link">${coverInner(book)}</a>`
  : coverInner(book);

const titleHtml = (book, href) => {
  const text = esc(book.title || 'Untitled');
  return href
    ? `<a class="quick-progress-title" href="${href}">${text}</a>`
    : `<div class="quick-progress-title">${text}</div>`;
};

const authorHtml = book => {
  if (!book.author) return '';
  const href = `../author/?slug=${toAuthorSlug(book.author)}&name=${encodeURIComponent(book.author)}`;
  return `<a class="quick-progress-author" href="${href}">${esc(book.author)}</a>`;
};

// Opens the popover. onSaved is called with the mutated book after each
// successful write, so the caller can repaint whatever it drew.
//
// readOnly renders somebody else's book: their progress as plain text, and no
// way to edit it. Pass reader — { username } — so the library link points at
// their shelf rather than yours.
export function openQuickProgress(book, { uid, onSaved, readOnly = false, reader = null } = {}) {
  const audio = isAudiobook(book);
  // Somebody else's library needs ?u=; the deep-link works there too, since
  // their books render with the same data-gbid the handler looks for.
  const libraryHref = libraryLink({
    username: readOnly ? reader?.username : null,
    gbid: book.gbid,
  });
  // Without a username there is no shelf to point at, so show no link at all
  // rather than one that quietly opens your own library instead of theirs.
  const showLibraryLink = !readOnly || !!reader?.username;
  const libraryLabel = readOnly
    ? `Open in ${esc(reader?.username || '')}&rsquo;s library`
    : 'Open in library';
  const bookHref = book.gbid ? `../book/?gbid=${encodeURIComponent(book.gbid)}` : null;

  const overlay = document.createElement('div');
  overlay.className = 'book-modal-overlay';
  const inner = document.createElement('div');
  inner.className = 'book-modal-inner';
  const card = document.createElement('div');
  card.className = 'card quick-progress-card';

  card.innerHTML = `
    <button class="quick-progress-close" aria-label="Close">&times;</button>
    <div class="quick-progress-head">
      ${coverHtml(book, bookHref)}
      <div class="quick-progress-meta">
        ${titleHtml(book, bookHref)}
        ${authorHtml(book)}
        <div class="quick-progress-controls">
          ${readOnly
            ? `<span class="quick-progress-static">${esc(progressText(book))}</span>`
            : `<input class="quick-progress-input" type="text" inputmode="numeric"
                      aria-label="${audio ? 'Progress %' : 'Current page'}"
                      value="${audio ? (book.progressPct || 0) : (book.currentPage || 0)}">
               <span class="quick-progress-sep">${audio ? '%' : `/ ${book.totalPages || '?'}`}</span>`}
        </div>
      </div>
    </div>
    <div class="quick-progress-bar"><div class="quick-progress-fill"></div></div>
    <div class="quick-progress-foot">
      <span class="quick-progress-status"></span>
      ${showLibraryLink ? `<a class="quick-progress-link" href="${libraryHref}">${libraryLabel} &rarr;</a>` : ''}
    </div>`;

  inner.appendChild(card);
  overlay.appendChild(inner);

  const input = card.querySelector('.quick-progress-input');
  const fill = card.querySelector('.quick-progress-fill');
  const bar = card.querySelector('.quick-progress-bar');
  const status = card.querySelector('.quick-progress-status');

  function paint(pct) {
    bar.style.visibility = pct == null ? 'hidden' : '';
    fill.style.width = `${pct ?? 0}%`;
    status.textContent = pct == null ? 'No page count recorded' : `${pct}%`;
  }
  paint(progressPercent(book));

  let timer;
  let saving = false;
  async function save() {
    clearTimeout(timer);
    if (readOnly) return;
    const { updates, value, pct } = progressUpdate(book, input.value);
    if (document.activeElement !== input) input.value = value;
    // Nothing to write — avoids a Firestore round trip on every stray blur.
    const key = Object.keys(updates)[0];
    if (book[key] === value) return;
    saving = true;
    try {
      await updateBookMeta(uid, book.id, updates, { gbid: book.gbid, title: book.title });
      Object.assign(book, updates);
      paint(pct);
      onSaved?.(book);
    } catch {
      status.textContent = 'Could not save';
    } finally {
      saving = false;
    }
  }

  input?.addEventListener('input', () => {
    const { pct } = progressUpdate(book, input.value);
    paint(pct);
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  });
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });

  function dismiss() {
    clearTimeout(timer);
    // Fire-and-forget: an unsaved edit still lands even though the card is gone.
    if (!saving) save();
    overlay.remove();
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) { if (e.key === 'Escape') dismiss(); }

  card.querySelector('.quick-progress-close').addEventListener('click', dismiss);
  overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
  document.addEventListener('keydown', onEsc);

  // Typing a page and immediately tapping any of these links would navigate
  // inside the debounce window and lose the edit, so finish the write first.
  // Delegated rather than per-link: every way out of this card has to flush,
  // and a handler bound to one of them is a trap for whichever gets added next.
  if (!readOnly) card.addEventListener('click', async e => {
    const link = e.target.closest?.('a[href]');
    if (!link || !card.contains(link)) return;
    // Let modified clicks open a new tab as normal; this card stays put, and
    // its own dismiss path will save.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    clearTimeout(timer);
    await save();
    location.href = link.href;
  });

  document.body.appendChild(overlay);
  input?.focus();
  input?.select();
  return overlay;
}
