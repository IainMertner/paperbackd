// Bump on any release that changes what a JS module exports — activate() drops
// every older cache, which is what clears a stale module out of existing clients.
const CACHE = 'paperbackd-v44';

// Firebase API hosts — never intercept these
const PASS_THROUGH = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebase.googleapis.com',
];

// HTML shells to pre-cache on install
const PRECACHE = [
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
  '/js/quick-progress.js',
  '/js/hardcover.js',
  '/js/search-widget.js',
  '/js/stats-utils.js',
  '/js/utils.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
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

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Let Firebase API traffic through untouched
  if (PASS_THROUGH.some(h => url.hostname.includes(h))) return;

  // Firebase/Google CDN scripts — cache first (URLs are versioned, safe to cache)
  if (url.hostname === 'www.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
          return response;
        })
      )
    );
    return;
  }

  if (url.origin === self.location.origin) {
    if (event.request.mode === 'navigate') {
      // HTML page navigations — network-first so updates are always visible immediately.
      // Falls back to cache only when offline.
      event.respondWith(
        fetch(event.request).then(response => {
          caches.open(CACHE).then(c => c.put(event.request, response.clone()));
          return response;
        }).catch(() => caches.match(event.request))
      );
    } else if (url.pathname.endsWith('.js')) {
      // JS modules — network-first, like navigations.
      //
      // Stale-while-revalidate cannot be used here: pages are network-first, so
      // a fresh page would import a stale module and fail on any export added
      // since it was cached ("does not provide an export named ..."). The
      // modules are small and this keeps page and script versions in step.
      // Falls back to cache when offline.
      event.respondWith(
        fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
          return response;
        }).catch(() => caches.match(event.request))
      );
    } else {
      // CSS/assets — stale-while-revalidate (instant from cache, updates in background)
      event.respondWith(
        caches.open(CACHE).then(cache =>
          cache.match(event.request).then(cached => {
            const fresh = fetch(event.request).then(response => {
              cache.put(event.request, response.clone());
              return response;
            }).catch(() => cached);
            return cached || fresh;
          })
        )
      );
    }
  }
});
