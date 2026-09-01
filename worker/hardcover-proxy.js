// The paperbackd Cloudflare Worker. Two jobs:
//
//   POST /change-password  — admin-only password reset, via the Firebase Admin
//                            REST API and a service-account JWT.
//   POST anything else     — proxy to Hardcover's GraphQL API, with an edge
//                            cache in front of it.
//
// The cache is the reason this file is in the repo. Every book and author
// search in the app comes through here, and all users share one Hardcover rate
// limit — so search-as-you-type from a handful of people is enough to draw
// 429s. Nearly all of that traffic is repeats: the same popular titles, and the
// same prefixes typed on the way to them.
//
// Deployed by pasting into the Cloudflare dashboard.

const UPSTREAM = 'https://api.hardcover.app/v1/graphql';

const FIREBASE_API_KEY    = 'AIzaSyBExnP_07GT_hP8olJbHhlWKvNMIxG75r0';
const FIREBASE_PROJECT_ID = 'reading-log-ba9a5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MINUTE = 60;
const HOUR   = 60 * MINUTE;

// How long an answer counts as fresh, and how long it is kept beyond that
// purely as a fallback for when upstream is refusing. The second number is
// generous on purpose: a week-old list of search hits is a far better answer
// than an error, and the catalogue barely moves.
const FRESH_SEARCH = 6 * HOUR;
const FRESH_EMPTY  = 10 * MINUTE;
const FRESH_OTHER  = 1 * HOUR;
const STALE_WINDOW = 7 * 24 * HOUR;

// ── Cache key normalisation (unit-tested in test/worker-cache.test.js) ────────

// Object key order carries no meaning in JSON but does change the hash, so keys
// are sorted. Only `q` is case-folded and space-collapsed: it is the free-text
// search term. Everything else is an identifier — slugs, ISBNs, Goodreads ids —
// where touching the value could quietly change which book is being asked for.
function normaliseVars(v) {
  if (Array.isArray(v)) return v.map(normaliseVars);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map(k => [
      k,
      k === 'q' && typeof v[k] === 'string'
        ? v[k].replace(/\s+/g, ' ').trim().toLowerCase()
        : normaliseVars(v[k]),
    ]));
  }
  return v;
}

// GraphQL ignores whitespace around punctuation, so two spellings of one
// document should not take two cache entries. Only the stretches outside string
// literals are squeezed: inside a literal, spacing is content rather than
// formatting, and `query_type:"Historical Fiction"` must survive intact.
//
// split() on a capturing group puts the literals at the odd indices.
function canonicalQuery(query) {
  return query
    .split(/("(?:[^"\\]|\\.)*")/)
    .map((part, i) => (i % 2
      ? part
      : part.replace(/\s+/g, ' ').replace(/\s*([{}()[\]:,!$=@|&])\s*/g, '$1')))
    .join('')
    .trim();
}

// The canonical form of a request body, so requests differing only in
// whitespace, key order or capitalisation share one cache entry. Returns null
// for anything unparseable, which is the signal to proxy it without caching.
export function normaliseBody(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const query = canonicalQuery(String(parsed.query || ''));
  if (!query) return null;
  return JSON.stringify({ query, variables: normaliseVars(parsed.variables ?? null) });
}

export function isSearch(normalised) {
  return /\bsearch\s*\(/.test(normalised || '');
}

// How long this answer stays fresh, or 0 for "do not cache".
//
// GraphQL reports failures as HTTP 200 with an `errors` key, so the status code
// alone cannot tell a real answer from a broken one — and caching a failure
// would pin it for hours.
export function freshSeconds(normalised, json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return 0;
  if (json.errors) return 0;
  if (!json.data) return 0;
  if (!isSearch(normalised)) return FRESH_OTHER;
  const hits = json?.data?.search?.results?.hits;
  // "No results" is still an answer, and half-typed words are the most repeated
  // queries there are — but it is held briefly, because the book may simply not
  // have been in the catalogue yet.
  if (Array.isArray(hits) && hits.length === 0) return FRESH_EMPTY;
  return FRESH_SEARCH;
}

// ── Cache plumbing ───────────────────────────────────────────────────────────

// The Cache API keys on a Request, and a POST body is no part of that key, so
// the body's hash is folded into a synthetic GET URL instead. The host is never
// resolved — it exists only to make a well-formed key.
async function cacheKeyFor(normalised) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalised));
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return new Request(`https://hc-cache.invalid/q/${hex}`, { method: 'GET' });
}

const FRESH_UNTIL = 'x-fresh-until';

function isFresh(res) {
  return Number(res.headers.get(FRESH_UNTIL) || 0) > Date.now();
}

// One upstream call per distinct query at a time. Several people land on the
// same popular search within a second of each other, and without this each one
// spends a separate slice of the rate limit fetching the same answer.
//
// Resolves to plain data rather than a Response: a Response body can only be
// read once, and handing the same one to several waiters would empty it for all
// but the first.
const inflight = new Map();

function coalesce(key, fn) {
  const running = inflight.get(key);
  if (running) return running;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function proxyRes(body, status, cacheState) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', 'x-cache': cacheState, ...CORS },
  });
}

async function callUpstream(raw, env) {
  // Accepts the secret with or without the "Bearer " prefix, so setting it
  // either way in the dashboard works rather than failing at request time.
  const token = String(env.HARDCOVER_TOKEN || '');
  const res = await fetch(UPSTREAM, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'User-Agent': 'reading-log/1.0',
    },
    body: raw,
  });
  return { status: res.status, body: await res.text() };
}

async function handleHardcover(request, env, ctx) {
  const raw        = await request.text();
  const normalised = normaliseBody(raw);

  // Nothing recognisable to key on. Proxy it, but do not remember it.
  if (normalised === null) {
    const { status, body } = await callUpstream(raw, env);
    return proxyRes(body, status, 'BYPASS');
  }

  const cache = caches.default;
  const key   = await cacheKeyFor(normalised);
  const hit   = await cache.match(key);
  if (hit && isFresh(hit)) return proxyRes(await hit.text(), 200, 'HIT');

  // Held back in case upstream refuses: stale beats an error every time.
  const stale = hit ? await hit.text() : null;

  const { status, body } = await coalesce(normalised, () => callUpstream(raw, env));

  if (status === 200) {
    let json = null;
    try { json = JSON.parse(body); } catch { /* stored only if it parses */ }
    const fresh = freshSeconds(normalised, json);
    if (fresh > 0) {
      // Kept for the whole stale window; freshness is decided by the header
      // above rather than by the cache's own expiry, so an entry can outlive
      // its use as an answer while still being useful as a fallback.
      const stored = new Response(body, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${STALE_WINDOW}`,
          [FRESH_UNTIL]: String(Date.now() + fresh * 1000),
        },
      });
      ctx.waitUntil(cache.put(key, stored));
    }
    return proxyRes(body, 200, 'MISS');
  }

  if (stale !== null) return proxyRes(stale, 200, 'STALE');
  return proxyRes(body, status, 'MISS');
}

// ── Admin password reset ─────────────────────────────────────────────────────

function b64url(data) {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new TextEncoder().encode(data);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function importPrivateKey(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8', bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

async function signJWT(payload, privatePem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const input  = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key    = await importPrivateKey(privatePem);
  const sig    = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJWT({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform',
  }, sa.private_key);

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token exchange failed: ' + JSON.stringify(data));
  return data.access_token;
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

async function handleChangePassword(request, env) {
  try {
    const { idToken, uid, password } = await request.json();
    if (!idToken || !uid || !password) return jsonRes({ error: 'Missing fields' }, 400);
    if (password.length < 6)          return jsonRes({ error: 'Password must be at least 6 characters' }, 400);

    const sa          = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const accessToken = await getAccessToken(sa);

    // Verify caller's ID token
    const lookupRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const lookup = await lookupRes.json();
    if (!lookup.users?.[0]) return jsonRes({ error: 'Invalid auth token' }, 401);
    const callerUid = lookup.users[0].localId;

    // Check caller is the admin
    if (callerUid !== env.ADMIN_UID) return jsonRes({ error: 'Not authorized' }, 403);

    // Update password
    const updateRes  = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ localId: uid, password }),
    });
    const updateData = await updateRes.json();
    if (updateData.error) return jsonRes({ error: updateData.error.message }, 500);

    return jsonRes({ success: true });
  } catch (e) {
    return jsonRes({ error: e.message }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST')    return new Response('Method not allowed', { status: 405 });

    if (new URL(request.url).pathname === '/change-password') {
      return handleChangePassword(request, env);
    }

    return handleHardcover(request, env, ctx);
  },
};
