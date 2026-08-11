#!/usr/bin/env python3
"""Push reading progress from a Kobo eReader to paperbackd.

A Kobo mounts as ordinary USB storage and keeps its state in a plain SQLite
file, so nothing here needs your Kobo account, a password, or an internet
connection to Kobo. It reads the device, works out how far through each book you
are, and posts that to your paperbackd sync endpoint.

    pip install requests
    python kobo-sync.py --token YOUR_TOKEN

The device is usually found automatically. If not, point at it:

    python kobo-sync.py --token YOUR_TOKEN --device /media/me/KOBOeReader

Standard library plus `requests`. Nothing is written to the Kobo.
"""

import argparse
import os
import sqlite3
import sys
import tempfile
import shutil
from glob import glob

try:
    import requests
except ImportError:
    sys.exit("This needs `requests`:  pip install requests")


DEFAULT_ENDPOINT = "https://syncprogress-y6xs6qzssa-nw.a.run.app"

# Where a Kobo typically mounts, by platform.
MOUNT_GLOBS = [
    "/media/*/KOBOeReader",      # Linux
    "/run/media/*/KOBOeReader",  # Linux (Fedora, Arch)
    "/Volumes/KOBOeReader",      # macOS
    "D:/", "E:/", "F:/", "G:/",  # Windows drive letters, checked for .kobo
]


def find_device(explicit=None):
    if explicit:
        if os.path.isfile(os.path.join(explicit, ".kobo", "KoboReader.sqlite")):
            return explicit
        sys.exit(f"No KoboReader.sqlite under {explicit}")
    for pattern in MOUNT_GLOBS:
        for path in glob(pattern):
            if os.path.isfile(os.path.join(path, ".kobo", "KoboReader.sqlite")):
                return path
    sys.exit("Could not find a connected Kobo. Plug it in, or pass --device.")


def read_progress(device, include_finished=False):
    """Books the Kobo considers started, with how far through they are.

    ReadStatus: 0 unread, 1 reading, 2 finished. Rows without a percentage are
    skipped — they are shelves, previews and sideloaded files the reader has
    never opened.
    """
    src = os.path.join(device, ".kobo", "KoboReader.sqlite")

    # Copy first: the database may be mid-write if the Kobo is still settling,
    # and opening it read-only avoids any chance of touching the original.
    tmp = os.path.join(tempfile.mkdtemp(), "KoboReader.sqlite")
    shutil.copy2(src, tmp)

    statuses = "(1, 2)" if include_finished else "(1)"
    con = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True)
    try:
        rows = con.execute(f"""
            SELECT Title, Attribution, ISBN, ___PercentRead, ReadStatus, DateLastRead
            FROM content
            WHERE ContentType = 6
              AND ReadStatus IN {statuses}
              AND ___PercentRead IS NOT NULL
              AND ___PercentRead > 0
              AND Title IS NOT NULL
            ORDER BY DateLastRead DESC
        """).fetchall()
    finally:
        con.close()
        shutil.rmtree(os.path.dirname(tmp), ignore_errors=True)

    # One row per book: Kobo keeps a row per chapter for some formats, and the
    # book-level row is the one carrying a percentage.
    seen, books = set(), []
    for title, author, isbn, percent, status, last_read in rows:
        key = (title or "").strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        books.append({
            "title": (title or "").strip(),
            "author": (author or "").strip(),
            "isbn": (isbn or "").strip(),
            "percent": int(percent),
            "finished": status == 2,
            "last_read": last_read,
        })
    return books


def push(endpoint, token, book, timeout=20):
    payload = {"title": book["title"], "percent": book["percent"]}
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


def main():
    ap = argparse.ArgumentParser(description="Sync Kobo reading progress to paperbackd.")
    ap.add_argument("--token", required=True, help="Sync token from paperbackd settings")
    ap.add_argument("--device", help="Path to the mounted Kobo")
    ap.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    ap.add_argument("--include-finished", action="store_true",
                    help="Also push books Kobo marks finished (paperbackd still won't change status)")
    ap.add_argument("--dry-run", action="store_true", help="Show what would be sent, send nothing")
    args = ap.parse_args()

    device = find_device(args.device)
    print(f"Kobo: {device}")

    books = read_progress(device, args.include_finished)
    if not books:
        print("Nothing in progress on the device.")
        return

    print(f"{len(books)} book(s) in progress\n")
    sent = skipped = failed = 0
    for b in books:
        label = f"{b['title'][:44]:<44} {b['percent']:>3}%"
        if args.dry_run:
            print(f"  would send  {label}")
            continue

        status, body = push(args.endpoint, args.token, b)
        if status == 200:
            print(f"  ok          {label}  -> page {body.get('currentPage')}")
            sent += 1
        elif status == 404:
            print(f"  not in lib  {label}")
            skipped += 1
        elif status == 429:
            print(f"  rate limit  {label}  (retry later)")
            failed += 1
        else:
            print(f"  failed      {label}  [{status}] {body.get('error', '')}")
            failed += 1

    if not args.dry_run:
        print(f"\nsent {sent}, not in library {skipped}, failed {failed}")
        if skipped:
            print("Books not in your library are ignored — add them in paperbackd first.")


if __name__ == "__main__":
    main()
