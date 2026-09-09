// "Choose an edition cover" — the grid of alternative covers for a book.
//
// Lifted out of the library so the list page can offer it too. The picker only
// finds and shows covers; what happens to the chosen one is the caller's, passed
// as onPick. That split is the point: the library writes to a book document, a
// list writes a cover override, and neither concern belongs in here.

import { esc } from './utils.js';
import { hcQuery } from './hardcover.js';

// Public by design and restricted to this domain in the Google Cloud console.
const GB_KEY = 'AIzaSyCHP8T9d3zm7IDhmRchE_wk2-9vR4xs_3I';

// OpenLibrary serves S/M/L variants off one path; ask for the large one.
function bestCoverUrl(url) {
  return url ? url.replace(/-(S|M)\.jpg(\?|$)/, '-L.jpg$2') : url;
}

// Every edition cover Hardcover knows for this book, deduplicated and with the
// thumbnails too small for a shelf dropped.
async function hardcoverCovers(book) {
  const searchData = await hcQuery(
    `query($q:String!){search(query:$q,query_type:"Book",per_page:8){results}}`,
    { q: book.title }
  );
  const hits = searchData?.data?.search?.results?.hits || [];
  const bookIds = [...new Set(
    hits.map(h => h.document?.id).filter(Boolean).map(id => parseInt(id, 10)).filter(n => !Number.isNaN(n))
  )];

  // A stored gbid is usually a slug, which the search above may not have turned
  // up — resolve it to an id so the book's own editions are always included.
  const slug = /^\d+$/.test(book.gbid || '') ? '' : (book.gbid || '');
  if (slug) {
    const d = await hcQuery(`query($s:String!){books(where:{slug:{_eq:$s}},limit:1){id}}`, { s: slug });
    const id = d?.data?.books?.[0]?.id;
    if (id && !bookIds.includes(id)) bookIds.push(id);
  }
  if (!bookIds.length) return [];

  const d = await hcQuery(
    `query($ids:[Int!]!){editions(where:{book_id:{_in:$ids}},limit:100){id image{url width height} publisher{name} release_year}}`,
    { ids: bookIds }
  );
  const seen = new Set();
  return (d?.data?.editions || []).filter(e => {
    if (!e.image?.url) return false;
    if (e.image.width && e.image.width < 180) return false;
    const url = bestCoverUrl(e.image.url);
    if (seen.has(url)) return false;
    seen.add(url);
    e.image.url = url;
    return true;
  });
}

// Shrunk and re-encoded before it goes anywhere: this is stored as a data URL on
// the document itself, so a full-size photograph would be megabytes of Firestore.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX_W = 400, MAX_H = 600;
      const scale = Math.min(MAX_W / img.width, MAX_H / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

// Opens the picker. onPick(url) is awaited; the picker closes once it resolves.
export async function openCoverPicker(book, { onPick } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'cover-picker-overlay';
  const modal = document.createElement('div');
  modal.className = 'cover-picker-modal';
  modal.innerHTML = `<div style="font-weight:600;margin-bottom:.2rem">${esc(book.title)}</div>
    <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:.875rem">Choose an edition cover</div>
    <div class="cover-picker-grid" id="cpg"><span style="font-size:.85rem;color:var(--text-muted)">Loading…</span></div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const grid = modal.querySelector('#cpg');

  async function choose(url) {
    if (url === book.coverUrl) { overlay.remove(); return; }
    await onPick?.(url);
    overlay.remove();
  }

  function coverItem(url, { title, selected = false, onClick } = {}) {
    const item = document.createElement('div');
    item.className = `cover-picker-item${selected ? ' selected' : ''}`;
    if (title) item.title = title;
    item.innerHTML = `<img src="${esc(url)}" alt="" loading="lazy">`;
    item.addEventListener('click', onClick || (() => { item.style.opacity = '0.5'; choose(url); }));
    return item;
  }

  try {
    // Started before the Hardcover round trips, not after: it is an independent
    // source and there is no reason to wait for one to begin the other.
    const gbQuery = encodeURIComponent(`${book.title}${book.author ? ' ' + book.author : ''}`);
    const gbFetch = fetch(`https://www.googleapis.com/books/v1/volumes?q=${gbQuery}&maxResults=20&printType=books&key=${GB_KEY}`)
      .then(r => r.json()).catch(() => null);

    const editions = await hardcoverCovers(book).catch(() => []);
    grid.innerHTML = '';

    const currentUrl = book.coverUrl || null;
    const others = editions.filter(e => e.image.url !== currentUrl);

    if (currentUrl) {
      grid.appendChild(coverItem(currentUrl, {
        title: 'Current cover', selected: true, onClick: () => overlay.remove(),
      }));
    }

    // Upload
    const uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.accept = 'image/*';
    uploadInput.style.display = 'none';
    modal.appendChild(uploadInput);

    const uploadItem = document.createElement('div');
    uploadItem.className = 'cover-picker-item cover-picker-upload';
    uploadItem.title = 'Upload custom cover';
    uploadItem.innerHTML = `<div class="cover-picker-upload-inner">+</div>`;
    uploadItem.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', async () => {
      const file = uploadInput.files[0];
      if (!file) return;
      uploadInput.value = '';
      uploadItem.style.opacity = '0.5';
      try {
        await choose(await fileToDataUrl(file));
      } catch (e) {
        console.error(e);
        uploadItem.style.opacity = '';
        alert('Could not load that image.');
      }
    });
    grid.appendChild(uploadItem);

    if (!others.length) {
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:.85rem;color:var(--text-muted);width:100%;padding-top:.25rem';
      msg.textContent = currentUrl ? 'No other edition covers found.' : 'No edition covers found.';
      grid.appendChild(msg);
    }

    for (const ed of others) {
      grid.appendChild(coverItem(ed.image.url, {
        title: [ed.publisher?.name, ed.release_year].filter(Boolean).join(' · ') || undefined,
      }));
    }

    // Google Books, last and under their own heading — a wider net, but lower
    // quality and not edition-accurate.
    const seenUrls = new Set([currentUrl, ...others.map(e => e.image.url)].filter(Boolean));
    const gbCovers = [];
    for (const item of (await gbFetch)?.items || []) {
      const links = item.volumeInfo?.imageLinks;
      let url = links?.thumbnail || links?.smallThumbnail;
      if (!url) continue;
      url = url.replace(/^http:/, 'https:').replace(/&edge=curl/, '').replace(/zoom=\d/, 'zoom=0');
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      gbCovers.push(url);
    }
    if (gbCovers.length) {
      const sep = document.createElement('div');
      sep.style.cssText = 'width:100%;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);padding:.5rem 0 .2rem';
      sep.textContent = 'Google Books';
      grid.appendChild(sep);
      for (const url of gbCovers) grid.appendChild(coverItem(url));
    }
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<span style="font-size:.85rem;color:var(--text-muted)">Failed to load covers.</span>';
  }

  return overlay;
}
