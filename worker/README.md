# The paperbackd worker

`hardcover-proxy.js` is the source for the Worker at
`frosty-paper-e53b.phixel66.workers.dev`. Deployed by pasting into the
Cloudflare dashboard; this copy exists so the source is not only ever in a
textarea.

Two endpoints:

- `POST /change-password` — admin-only password reset.
- `POST` anything else — Hardcover GraphQL proxy, cached.

## Secrets

Worker → Settings → Variables and Secrets. All three are secrets, never inline:

| Name                        | Used by                                     |
|-----------------------------|---------------------------------------------|
| `HARDCOVER_TOKEN`           | the proxy. With or without `Bearer ` — both work |
| `FIREBASE_SERVICE_ACCOUNT`  | `/change-password`, as the raw JSON key file |
| `ADMIN_UID`                 | `/change-password`, the only uid allowed to call it |

The Firebase **API key** and project id are still inline, which is correct —
those are public identifiers, not credentials.

## The cache

Responses are cached on a normalised request body, so the repeats that dominate
search-as-you-type cost nothing. On top of that:

- **Stale on failure.** Entries are kept a week past their freshness. If
  upstream 429s, the last good answer is served instead of an error.
- **Failures are never cached.** GraphQL returns errors as HTTP 200, so the body
  is parsed before anything is stored — otherwise a rate-limit error would be
  pinned for hours after upstream recovered.
- **Request coalescing.** Concurrent identical queries share one upstream call.

`/change-password` is routed before any of this and is never cached.

## Checking it works

Every proxy response carries an `x-cache` header:

| Value    | Meaning                                            |
|----------|----------------------------------------------------|
| `HIT`    | served from cache, no upstream call                 |
| `MISS`   | fetched from upstream, and stored if worth storing  |
| `STALE`  | upstream failed, an expired copy was served         |
| `BYPASS` | not cacheable — body could not be parsed            |

Search the same title twice; the second should be `HIT`. The cache is per
Cloudflare location, so someone elsewhere warms their own.

## Known soft spot

`Access-Control-Allow-Origin` is `*`, so any website can call the proxy and
spend our Hardcover rate limit. An origin allowlist would raise the bar but not
close it — CORS is enforced by browsers, and `curl` ignores it entirely. Closing
it properly means a shared secret between the app and the Worker, which is
awkward for a static site with no build step. Cached responses make the exposure
cheaper, but they do not remove it.
