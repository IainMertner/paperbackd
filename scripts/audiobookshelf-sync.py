#!/usr/bin/env python3
"""Push listening progress from Audiobookshelf to paperbackd.

Audiobookshelf has a proper API, so this can run unattended — on a cron every
fifteen minutes, or as a loop with --watch. It reads your listening position and
converts it to a page number using the book's length in paperbackd.

    pip install requests
    python audiobookshelf-sync.py \
        --abs-url http://192.168.1.10:13378 \
        --abs-token ABS_API_TOKEN \
        --token PAPERBACKD_SYNC_TOKEN

The Audiobookshelf token is under Settings -> Users -> your user -> API Token.

Run it every 15 minutes:

    */15 * * * * /usr/bin/python3 /path/audiobookshelf-sync.py --config ~/.abs-sync.json
"""

import argparse
import json
import os
import sys
import time

try:
    import requests
except ImportError:
    sys.exit("This needs `requests`:  pip install requests")


DEFAULT_ENDPOINT = "https://syncprogress-y6xs6qzssa-nw.a.run.app"

# Below this, a "session" is usually an accidental tap rather than listening.
MIN_PROGRESS = 0.005


def abs_get(base, token, path, timeout=20):
    res = requests.get(
        f"{base.rstrip('/')}{path}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=timeout,
    )
    res.raise_for_status()
    return res.json()


def fetch_progress(base, token):
    """In-progress items, with their position and total duration in seconds."""
    me = abs_get(base, token, "/api/me")
    out = []

    for item in me.get("mediaProgress", []):
        if item.get("isFinished"):
            continue
        progress = float(item.get("progress") or 0)
        current = float(item.get("currentTime") or 0)
        duration = float(item.get("duration") or 0)
        if progress < MIN_PROGRESS or duration <= 0:
            continue

        # /api/me carries ids only; the item itself has the metadata.
        try:
            detail = abs_get(base, token, f"/api/items/{item['libraryItemId']}")
        except requests.HTTPError:
            continue

        meta = (detail.get("media") or {}).get("metadata") or {}
        title = (meta.get("title") or "").strip()
        if not title:
            continue

        out.append({
            "title": title,
            "author": (meta.get("authorName") or "").strip(),
            "isbn": (meta.get("isbn") or "").strip(),
            "seconds": current,
            "total_seconds": duration,
            "percent": round(progress * 100, 1),
        })
    return out


def push(endpoint, token, book, timeout=20):
    payload = {
        "title": book["title"],
        "seconds": book["seconds"],
        "totalSeconds": book["total_seconds"],
    }
    if book["author"]:
        payload["author"] = book["author"]
    res = requests.post(
        endpoint,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=timeout,
    )
    try:
        body = res.json()
    except ValueError:
        body = {"error": res.text[:120]}
    return res.status_code, body


def run_once(args):
    books = fetch_progress(args.abs_url, args.abs_token)
    if not books:
        print("Nothing in progress in Audiobookshelf.")
        return

    print(f"{len(books)} item(s) in progress")
    sent = skipped = failed = 0
    for b in books:
        hrs = int(b["seconds"] // 3600)
        mins = int((b["seconds"] % 3600) // 60)
        label = f"{b['title'][:40]:<40} {b['percent']:>5}%  {hrs}h{mins:02d}m"
        if args.dry_run:
            print(f"  would send  {label}")
            continue

        status, body = push(args.endpoint, args.token, b)
        if status == 200:
            tag = "added" if body.get("added") else "ok"
            print(f"  {tag:<11} {label}  -> page {body.get('currentPage')}")
            sent += 1
        elif status == 404:
            print(f"  no match    {label}  (not found on Hardcover)")
            skipped += 1
        elif status == 429:
            print(f"  rate limit  {label}")
            failed += 1
        else:
            print(f"  failed      {label}  [{status}] {body.get('error', '')}")
            failed += 1
        # The endpoint rejects bursts; space them out rather than get 429s.
        time.sleep(6)

    if not args.dry_run:
        print(f"sent {sent}, no match {skipped}, failed {failed}")


def main():
    ap = argparse.ArgumentParser(description="Sync Audiobookshelf progress to paperbackd.")
    ap.add_argument("--config", help="JSON file holding any of these options")
    ap.add_argument("--abs-url", help="e.g. http://192.168.1.10:13378")
    ap.add_argument("--abs-token", help="Audiobookshelf API token")
    ap.add_argument("--token", help="paperbackd sync token")
    ap.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    ap.add_argument("--watch", type=int, metavar="MINUTES",
                    help="Keep running, syncing every N minutes")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.config:
        with open(os.path.expanduser(args.config)) as fh:
            for key, value in json.load(fh).items():
                key = key.replace("-", "_")
                if getattr(args, key, None) in (None, False):
                    setattr(args, key, value)

    missing = [n for n in ("abs_url", "abs_token", "token") if not getattr(args, n, None)]
    if missing:
        sys.exit("Missing: " + ", ".join("--" + m.replace("_", "-") for m in missing))

    if not args.watch:
        run_once(args)
        return

    print(f"Watching, every {args.watch} min. Ctrl-C to stop.")
    while True:
        try:
            run_once(args)
        except requests.RequestException as err:
            print(f"  network error: {err}")
        time.sleep(args.watch * 60)


if __name__ == "__main__":
    main()
