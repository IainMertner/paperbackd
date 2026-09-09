// "Who has read this?" — the marks on a book row that answer it.
//
// Your own status goes on the cover, in the same shapes the profile's activity
// shelf uses: a tick and a rating for a finished book, a progress bar for one in
// hand. Everyone you follow who has finished it appears as a row of avatars at
// the far end, you first.
//
// Shared by the author page and search, which show the same list of books to the
// same question.

import { esc } from './utils.js';
import { progressBarPercent } from './book-utils.js';
import { getBooks, getFollowing, getReadersForBooks } from './firebase.js';

// No fixed cap: how many faces fit depends on how wide the row is, which
// depends on the title beside it. They are all rendered and then trimmed to fit.

// The markup a row needs for any of this to have somewhere to go. Callers build
// their own rows, so they place these themselves.
export const coverSlot = inner => `<span class="author-book-cover">${inner}</span>`;
export const readersSlot = () => '<span class="author-book-readers"></span>';

function markOwnStatus(coverEl, book) {
  if (!coverEl || !book) return;
  if (book.status === 'finished') {
    const tick = document.createElement('div');
    tick.className = 'author-book-tick';
    tick.textContent = '✓';
    coverEl.appendChild(tick);
    if (book.rating != null) {
      const badge = document.createElement('div');
      badge.className = 'author-book-rating';
      badge.textContent = '★ ' + book.rating;
      coverEl.appendChild(badge);
    }
    return;
  }
  if (book.status !== 'reading') return;
  // Nothing at zero: an empty track makes an unopened book look like one in
  // progress. progressBarPercent is the rule the rest of the app already uses.
  const pct = progressBarPercent(book);
  if (!pct) return;
  const track = document.createElement('div');
  track.className = 'cover-progress-track';
  const bar = document.createElement('div');
  bar.className = 'cover-progress';
  bar.style.width = pct + '%';
  track.appendChild(bar);
  coverEl.appendChild(track);
}

// Not links: these rows are anchors already, and an anchor cannot hold another.
// The name goes on the title attribute instead.
function avatarFor(person) {
  const av = document.createElement('span');
  av.className = 'friend-avatar author-book-reader';
  av.title = person.username || '';
  if (person.avatarBorderColor) av.style.borderColor = person.avatarBorderColor;
  if (person.avatarUrl) av.innerHTML = `<img src="${esc(person.avatarUrl)}" alt="">`;
  else av.textContent = (person.username?.[0] || '?').toUpperCase();
  return av;
}

function renderReaders(wrap, people) {
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const person of people) wrap.appendChild(avatarFor(person));
  if (wrap.scrollWidth <= wrap.clientWidth) return;

  // Too many for the space. Drop them from the end and put the remainder in one
  // more circle — which takes a slot of its own, so it goes in before the
  // measuring starts rather than after.
  const more = document.createElement('span');
  more.className = 'friend-avatar author-book-reader author-book-more';
  more.textContent = `+1`;
  wrap.appendChild(more);

  let hidden = 0;
  // > 1 leaves the badge itself, so a row too narrow for even one face still
  // says how many there were rather than emptying out.
  while (wrap.children.length > 1 && wrap.scrollWidth > wrap.clientWidth) {
    wrap.children[wrap.children.length - 2].remove();
    hidden++;
    more.textContent = `+${hidden}`;
  }
  more.title = people.slice(people.length - hidden).map(p => p.username).join(', ');
}

// Your shelf and the people you follow, fetched once and reused. A search page
// re-renders on every keystroke and would otherwise refetch both each time.
let context = null;

async function loadContext(user, myProfile) {
  if (!context) {
    context = (async () => {
      const [mine, following] = await Promise.all([
        getBooks(user.uid).catch(() => []),
        getFollowing(user.uid).catch(() => []),
      ]);
      const myBooks = new Map();
      for (const b of mine) if (b.gbid) myBooks.set(b.gbid, b);
      return {
        myBooks,
        following,
        byUid: new Map(following.map(f => [f.uid, f])),
        me: { ...myProfile, uid: user.uid },
      };
    })();
  }
  return context;
}

// Fills in a Map of gbid → row element.
//
// Decoration on a list that is already complete, so every failure is swallowed:
// a page that cannot say who has read something should still show the books.
export async function annotateBookRows(rows, { user, myProfile, coverMarks = true } = {}) {
  if (!rows.size) return;
  try {
    const { myBooks, following, byUid, me } = await loadContext(user, myProfile);

    if (coverMarks) {
      for (const [gbid, row] of rows) {
        markOwnStatus(row.querySelector('.author-book-cover'), myBooks.get(gbid));
      }
    }

    const readers = await getReadersForBooks(following.map(f => f.uid), [...rows.keys()]);
    for (const [gbid, row] of rows) {
      const who = (readers.get(gbid) || []).map(r => byUid.get(r.uid)).filter(Boolean);
      // You first, and from your own shelf rather than the query above.
      if (myBooks.get(gbid)?.status === 'finished') who.unshift(me);
      if (who.length) renderReaders(row.querySelector('.author-book-readers'), who);
    }
  } catch (e) {
    console.warn('Could not load reading status', e);
  }
}
