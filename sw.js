const CACHE = 'paperbackd-v4';

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
  '/feed/',
  '/feed/index.html',
  '/login/',
  '/login/index.html',
  '/settings/',
  '/settings/index.html',
  '/profile/',
  '/profile/index.html',
  '/friends/',
  '/friends/index.html',
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

  // Same-origin — stale-while-revalidate (instant from cache, updates in background)
  if (url.origin === self.location.origin) {
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
});
