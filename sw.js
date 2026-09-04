// Bump on any release that changes what a JS module exports — activate() drops
// every older cache, which is what clears a stale module out of existing clients.
const CACHE = 'paperbackd-v110';

// Firebase API hosts — never intercept these
const PASS_THROUGH = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebase.googleapis.com',
];

// HTML shells to pre-cache on install
const PRECACHE = [
  // Requested by every page; without these the first load of each is a network
  // round trip, and offline they were the requests that used to crash the worker.
  '/favicon.svg',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/library/',
  '/library/index.html',
  '/',
  '/index.html',
  '/home/',
  '/home/index.html',
  '/reading/',
  '/reading/index.html',
  '/announcements/',
  '/announcements/index.html',
  '/feed/',
  '/feed/index.html',
  '/login/',
  '/login/index.html',
  '/settings/',
  '/settings/index.html',
  '/profile/',
  '/profile/index.html',
  '/network/',
  '/network/index.html',
  '/search/',
  '/search/index.html',
  '/clubs/',
  '/clubs/index.html',
  '/lists/',
  '/lists/index.html',
  '/activity/',
  '/activity/index.html',
  '/book/',
  '/book/index.html',
  '/edit-profile/',
  '/edit-profile/index.html',
  '/stats/',
  '/stats/index.html',
  '/js/firebase.js',
  '/js/auth.js',
  '/js/main.js',
  '/js/book-utils.js',
  '/js/dropdown.js',
  '/js/enrich.js',
  '/js/quick-progress.js',
  '/js/hardcover.js',
  '/js/search-widget.js',
  '/js/stats-utils.js',
  '/js/utils.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    // cache: 'reload' so each file comes from the server rather than the
    // browser's own HTTP cache. Without it a new worker can precache a stale
    // copy of a module it just bumped the version for — the page loads fresh,
    // imports a firebase.js from before the export it needs, and dies with
    // "does not provide an export named ...". Pages are served with a max-age,
    // so this is not hypothetical.
    caches.open(CACHE).then(cache => cache.addAll(
      PRECACHE.map(url => new Request(url, { cache: 'reload' }))
    ))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// respondWith demands a Response. A fetch that rejects with nothing in the
// cache would otherwise leave the handler resolving to undefined, which the
// browser reports as "Failed to convert value to 'Response'" — the request then
// fails with no status and no explanation. Ending every path in a real response
// turns a crash into an ordinary error the page can handle.
function offlineResponse(request) {
  if (request.mode === 'navigate') {
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>'
      + '<body style="font-family:system-ui;padding:2rem;color:#33302B">'
      + '<p>You appear to be offline.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
  return new Response('', { status: 504, statusText: 'Offline' });
}

// Only successful responses are worth keeping. Caching a 404 or a 500 would
// serve it back indefinitely — and for a JS module, an error page cached under
// a module URL breaks the import with a syntax error rather than a 404.
function cachePut(request, response) {
  if (!response || !response.ok) return;
  caches.open(CACHE).then(c => c.put(request, response.clone())).catch(() => {});
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Let Firebase API traffic through untouched
  if (PASS_THROUGH.some(h => url.hostname.includes(h))) return;

  // Cache.put rejects for anything that is not a GET.
  if (event.request.method !== 'GET') return;

  // Firebase/Google CDN scripts — cache first (URLs are versioned, safe to cache)
  if (url.hostname === 'www.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          cachePut(event.request, response);
          return response;
        }).catch(() => offlineResponse(event.request))
      )
    );
    return;
  }

  if (url.origin === self.location.origin) {
    // HTML navigations and JS modules are both network-first, so an update is
    // visible immediately. Stale-while-revalidate cannot be used for modules:
    // a fresh page importing a stale one fails on any export added since it was
    // cached ("does not provide an export named ..."), and keeping the two in
    // step matters more than the milliseconds.
    const networkFirst = event.request.mode === 'navigate' || url.pathname.endsWith('.js');

    if (networkFirst) {
      event.respondWith(
        fetch(event.request).then(response => {
          cachePut(event.request, response);
          return response;
        }).catch(() =>
          caches.match(event.request).then(cached => cached || offlineResponse(event.request))
        )
      );
    } else {
      // CSS and assets — stale-while-revalidate: instant from cache, refreshed
      // in the background.
      event.respondWith(
        caches.match(event.request).then(cached => {
          const fresh = fetch(event.request).then(response => {
            cachePut(event.request, response);
            return response;
          }).catch(() => cached || offlineResponse(event.request));
          return cached || fresh;
        })
      );
    }
  }
});
