# Progress sync

paperbackd doesn't reach into Kindle, Kobo or Audible — none of them expose your
reading position to anyone. Instead it accepts progress pushed *to* it, so a
script on your side can send it from wherever you actually read.

Nothing here stores a password for another service. You generate a token in
paperbackd, and the script uses only that.

## Setup

1. paperbackd → **Settings → library → Progress sync → Generate token**
2. Copy the token. Treat it like a password: it can write to your library.
3. Set the endpoint URL — see below.
4. Run one of the scripts.

Both need Python 3 and `requests`:

```
pip install requests
```

### The endpoint URL

Both scripts already point at the deployed endpoint:

```
https://syncprogress-y6xs6qzssa-nw.a.run.app
```

If it's ever redeployed to a different region the URL changes — take the new one
from what `firebase deploy --only functions` prints, and update
`DEFAULT_ENDPOINT` at the top of each script, or pass `--endpoint`. Don't
reconstruct it: these are 2nd-gen functions served from Cloud Run, so they don't
use the older `https://<region>-<project>.cloudfunctions.net/<name>` pattern.

The function is deployed to `europe-west2` (London), set in
`functions/index.js`. Worth keeping that in step with wherever Firestore lives
rather than with where you are: one push is a single request from the script but
several Firestore round trips inside the function, so proximity to the database
matters more. Check under **Firebase console → Firestore → Location**.

## Kobo

Works because a Kobo mounts as ordinary USB storage and keeps its state in a
plain SQLite file. No Kobo account, no internet connection to Kobo, and nothing
is written back to the device.

```
python kobo-sync.py --token YOUR_TOKEN
```

Plug the Kobo in first. The device is found automatically on Linux, macOS and
Windows; if not, pass `--device /path/to/KOBOeReader`.

Try `--dry-run` first to see what it would send.

Kobo reports a percentage rather than a page, so page numbers are approximate —
they're converted using the page count paperbackd has for the book.

## Audiobookshelf

Has a real API, so this can run unattended.

```
python audiobookshelf-sync.py \
    --abs-url http://192.168.1.10:13378 \
    --abs-token ABS_API_TOKEN \
    --token PAPERBACKD_SYNC_TOKEN
```

The Audiobookshelf token is under **Settings → Users → your user → API Token**.

Keep it running, or use cron:

```
python audiobookshelf-sync.py --config ~/.abs-sync.json --watch 15
*/15 * * * * /usr/bin/python3 /path/audiobookshelf-sync.py --config ~/.abs-sync.json
```

`~/.abs-sync.json`:

```json
{
  "abs-url": "http://192.168.1.10:13378",
  "abs-token": "...",
  "token": "..."
}
```

Listening position is converted to a page using the audiobook's duration and the
book's page count, so it's a proportional estimate rather than a real page.

## Anything else

The endpoint is plain HTTP, so an iOS Shortcut, a Tasker task, or four lines of
any language will do:

```
POST <your syncProgress URL>
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{ "title": "The Employees", "percent": 62 }
```

Identify the book in whichever way suits:

| Field | Notes |
|---|---|
| `gbid` | Hardcover slug — exact, never ambiguous |
| `title`, `author` | `author` only needed if two books share a title |

A title is required. There's no "whatever you're reading" fallback, because a
library can have dozens of books in progress and a push would land on an
arbitrary one.

And give the position in whichever unit you have:

| Field | Notes |
|---|---|
| `page` | Used as-is |
| `percent` | 0–100, converted using the book's page count |
| `seconds` + `totalSeconds` | Marks the book as an audiobook, stored as a percentage |

Sending a duration is what makes something an audiobook. paperbackd stores
audiobooks as a percentage with no page count, so a listening position is never
turned into a page number — which also means it works for books that have no
page count at all.

A book that isn't in your library yet is looked up on Hardcover and added as
currently reading, with its cover and page count, exactly as if you'd added it
in the app. So starting a book on your Kobo is enough to see it here.

Updates are limited to one every few seconds.

Finishing a book stays something you do in the app — sync only ever moves
progress forward, never marks a book done.
