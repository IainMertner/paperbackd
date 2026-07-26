import { searchUsers } from './firebase.js';

const HARDCOVER_PROXY = 'https://frosty-paper-e53b.phixel66.workers.dev/';

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const RECENTS_KEY = 'rl_recents';
const RECENTS_MAX = 8;

function getRecents() {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch { return []; }
}
function saveRecent(item) {
  const list = getRecents().filter(r => r.href !== item.href);
  list.unshift(item);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, RECENTS_MAX)));
}

function sectionHeader(label) {
  const el = document.createElement('div');
  el.style.cssText = 'font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:.5rem .75rem .2rem';
  el.textContent = label;
  return el;
}

function makeBookRow(doc) {
  const slug   = doc.slug || String(doc.id);
  const title  = doc.title || '';
  const author = Array.isArray(doc.author_names) ? doc.author_names[0] : (doc.author_names || '');
  const cover  = doc.image?.url || '';
  const year   = doc.release_year || '';
  const a = document.createElement('a');
  a.href = `../book/?gbid=${encodeURIComponent(slug)}`;
  a.className = 'search-result-row';
  a.innerHTML = cover
    ? `<img class="search-result-cover" src="${esc(cover)}" alt="">`
    : `<div class="search-result-cover search-result-cover-placeholder"></div>`;
  a.innerHTML += `<div class="search-result-info">
    <div class="search-result-title">${esc(title)}</div>
    <div class="search-result-meta">${author ? esc(author) : ''}${author && year ? ' \xb7 ' : ''}${year ? esc(String(year)) : ''}</div>
  </div>`;
  a.addEventListener('click', () => saveRecent({
    type: 'book', label: title,
    sublabel: [author, year ? String(year) : ''].filter(Boolean).join(' \xb7 '),
    coverUrl: cover, href: a.href, initial: (title[0] || '?').toUpperCase(), isRound: false, borderColor: '',
  }));
  return a;
}

function makeAuthorRow(doc) {
  const slug       = doc.slug || String(doc.id);
  const name       = doc.name || '';
  const image      = doc.image?.url || '';
  const booksCount = doc.books_count ?? doc.default_books_count ?? null;
  const a = document.createElement('a');
  a.href = `../author/?slug=${encodeURIComponent(slug)}&name=${encodeURIComponent(name)}`;
  a.className = 'search-result-row';
  a.innerHTML = image
    ? `<img class="search-result-cover" src="${esc(image)}" alt="" style="border-radius:50%;object-fit:cover">`
    : `<div class="search-result-cover search-result-cover-placeholder" style="border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.1rem">${esc((name[0] || '?').toUpperCase())}</div>`;
  a.innerHTML += `<div class="search-result-info"><div class="search-result-title">${esc(name)}</div>${booksCount != null ? `<div class="search-result-meta">${booksCount} book${booksCount === 1 ? '' : 's'}</div>` : ''}</div>`;
  a.addEventListener('click', () => saveRecent({
    type: 'author', label: name, sublabel: booksCount != null ? `${booksCount} book${booksCount === 1 ? '' : 's'}` : '', coverUrl: image,
    href: a.href, initial: (name[0] || '?').toUpperCase(), isRound: true, borderColor: '',
  }));
  return a;
}

function makeUserRow(u) {
  const a = document.createElement('a');
  a.href = `../profile/?u=${encodeURIComponent(u.username)}`;
  a.className = 'search-result-row';
  a.style.textDecoration = 'none';
  const initial = (u.username?.[0] || '?').toUpperCase();
  const borderStyle = u.avatarBorderColor ? `border-color:${esc(u.avatarBorderColor)}` : '';
  const avatarInner = u.avatarUrl
    ? `<img src="${esc(u.avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : esc(initial);
  const showName = u.displayName && u.displayName.toLowerCase() !== u.username.toLowerCase();
  a.innerHTML = `<div class="friend-avatar" style="flex-shrink:0;${borderStyle}">${avatarInner}</div>
    <div class="search-result-info"><div class="search-result-title" style="font-size:.9rem">${esc(u.username)}${showName ? ` <span class="network-row-handle">${esc(u.displayName)}</span>` : ''}</div></div>`;
  a.addEventListener('click', () => saveRecent({
    type: 'user', label: u.username, sublabel: '', coverUrl: u.avatarUrl || '',
    href: a.href, initial, isRound: true, borderColor: u.avatarBorderColor || '',
  }));
  return a;
}

export function initSearchWidget(container, { defaultTab = 'all', user } = {}) {
  let activeTab = defaultTab;
  let timer;

  const tabDefs = [
    { id: 'all',     label: 'All',     placeholder: 'Search everything…' },
    { id: 'users',   label: 'Users',   placeholder: 'Search for a user…' },
    { id: 'books',   label: 'Books',   placeholder: 'Search for a book…' },
    { id: 'authors', label: 'Authors', placeholder: 'Search for an author…' },
  ];

  const tabRow = document.createElement('div');
  tabRow.style.cssText = 'display:flex;gap:.5rem;margin-bottom:.65rem';
  const tabBtns = {};
  tabDefs.forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-tab-btn' + (id === defaultTab ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => setTab(id));
    tabBtns[id] = btn;
    tabRow.appendChild(btn);
  });

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'join-club-input';
  input.placeholder = tabDefs.find(t => t.id === defaultTab)?.placeholder || 'Search…';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.style.cssText = 'width:100%;box-sizing:border-box;font-size:1rem;padding:.6rem .75rem';

  const dropdown = document.createElement('div');
  dropdown.style.cssText = 'display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);box-shadow:0 4px 16px rgba(0,0,0,.18);z-index:200;max-height:420px;overflow-y:auto';

  wrap.append(input, dropdown);
  container.append(tabRow, wrap);

  const show = () => { dropdown.style.display = ''; };
  const hide = () => { dropdown.style.display = 'none'; };

  function setTab(tab) {
    activeTab = tab;
    tabDefs.forEach(t => {
      tabBtns[t.id].classList.toggle('active', t.id === tab);
      if (t.id === tab) input.placeholder = t.placeholder;
    });
    const q = input.value.trim();
    if (q) runSearch(q); else hide();
  }

  input.addEventListener('focus', () => { if (input.value.trim()) show(); });
  document.addEventListener('click', e => { if (!container.contains(e.target)) hide(); }, true);
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { hide(); return; }
    timer = setTimeout(() => { runSearch(q); show(); }, 280);
  });

  function runSearch(q) {
    if (activeTab === 'all')         fetchAll(q);
    else if (activeTab === 'books')  fetchBooks(q);
    else if (activeTab === 'authors') fetchAuthors(q);
    else                             fetchUsers(q);
  }

  function setLoading() {
    dropdown.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:.5rem .75rem">Searching…</p>';
    show();
  }
  function setError() {
    dropdown.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:.5rem .75rem">Search failed. Please try again.</p>';
  }
  function setEmpty() {
    dropdown.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:.5rem .75rem">No results found.</p>';
  }

  async function fetchBooksData(q) {
    const res = await fetch(HARDCOVER_PROXY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `query($q:String!){search(query:$q,query_type:"Book",per_page:20){results}}`, variables: { q } })
    });
    return ((await res.json())?.data?.search?.results?.hits || []).map(h => h.document);
  }

  async function fetchAuthorsData(q) {
    const res = await fetch(HARDCOVER_PROXY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `query($q:String!){search(query:$q,query_type:"Author",per_page:20){results}}`, variables: { q } })
    });
    return ((await res.json())?.data?.search?.results?.hits || []).map(h => h.document);
  }

  async function fetchBooks(q) {
    setLoading();
    try {
      const docs = await fetchBooksData(q);
      if (!docs.length) { setEmpty(); return; }
      dropdown.innerHTML = '';
      docs.forEach(doc => dropdown.appendChild(makeBookRow(doc)));
    } catch { setError(); }
  }

  async function fetchAuthors(q) {
    setLoading();
    try {
      const docs = await fetchAuthorsData(q);
      if (!docs.length) { setEmpty(); return; }
      dropdown.innerHTML = '';
      docs.forEach(doc => dropdown.appendChild(makeAuthorRow(doc)));
    } catch { setError(); }
  }

  async function fetchUsers(q) {
    setLoading();
    try {
      const users = await searchUsers(q, user?.uid);
      if (!users.length) { dropdown.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:.5rem .75rem">No users found.</p>'; return; }
      dropdown.innerHTML = '';
      users.forEach(u => dropdown.appendChild(makeUserRow(u)));
    } catch { setError(); }
  }

  async function fetchAll(q) {
    setLoading();
    const [br, ar, ur] = await Promise.allSettled([
      fetchBooksData(q),
      fetchAuthorsData(q),
      searchUsers(q, user?.uid),
    ]);
    const books   = br.status === 'fulfilled' ? br.value : [];
    const authors = ar.status === 'fulfilled' ? ar.value : [];
    const users   = ur.status === 'fulfilled' ? ur.value : [];
    if (!books.length && !authors.length && !users.length) { setEmpty(); return; }
    dropdown.innerHTML = '';
    if (users.length) {
      dropdown.appendChild(sectionHeader('Users'));
      users.slice(0, 3).forEach(u => dropdown.appendChild(makeUserRow(u)));
    }
    if (books.length) {
      dropdown.appendChild(sectionHeader('Books'));
      books.slice(0, 5).forEach(doc => dropdown.appendChild(makeBookRow(doc)));
    }
    if (authors.length) {
      dropdown.appendChild(sectionHeader('Authors'));
      authors.slice(0, 5).forEach(doc => dropdown.appendChild(makeAuthorRow(doc)));
    }
  }
}
