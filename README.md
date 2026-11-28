# wortnetz

A German word puzzle for every day: 16 letters joined by lines. Trace the hidden words along the
lines; every word you find takes away the letters and lines no other hidden word needs. A real
word that isn't one of the hidden ones (a bonus word) takes 10 seconds off your time.

**Play:** <https://alanceil42.github.io/wortnetz/>. The game is in German.

wortnetz is a German version of [Zanagrams](https://pzlgames.com/games/zanagrams/), an English
word game by PZL games. Thanks for the idea! wortnetz is a hobby project and not connected to
PZL games.

## How to play

- A new puzzle every day at midnight (German time); earlier days stay open in the archive.
- Draw a word with your finger, letter to letter along the lines, or tap the letters and tap the
  last one again to send it. Words have at least four letters.
- Ä, Ö and Ü are letters of their own; ß is written SS.
- The hidden words are common German words in their base form. Other words the board holds
  count as bonus words.
- Stuck? The light bulb shows the next letter of a hidden word, three times per puzzle.
- The clock stops when you pause, open a menu or leave the page. At the end you see your time
  against an expected time that learns from your own games.

## What it does with your data

Nothing leaves your device. wortnetz is a set of static files: it keeps your games and settings in
your browser's storage, and a copy of its own files so it plays offline after the first visit.
No account, no cookies, no tracking, nothing loaded from anywhere else.

- **Backup** (in Settings) saves your solved puzzles as a file and reads one back, to move to
  another device or browser. Safari deletes a website's storage after seven days of use without
  a visit; added to the Home Screen, wortnetz keeps it.
- **Debug report** (in Settings) saves a file with your recent games and what the page saw, for
  you to send to someone who helps you; the page never sends it.

## The code

Plain HTML, CSS and JavaScript modules: no build step, no dependencies at run time. The puzzles
are made in advance by a Python generator and shipped as JSON, a year at a time.

    index.html, app.css, icon.svg   the page
    manifest.json, icons/           the Home Screen (tools/icons.mjs makes the PNGs from icon.svg)
    sw.js                           the service worker: offline, one cache per release
    config.json                     the site's settings (Impressum link, empty here); a site
                                    adds its own in local/config.json
    src/core/                       the game, expected times, days, what is kept, the backup
                                    file, the example puzzle, the device; pure, tested with node
    src/ui/                         the page: app.js, storage, first run, haptics, updates
    src/build.js                    the version; commit and date filled in by git archive
    vendor/xxl-scorer/              a few files of xxl-scorer (debug report, file names, the
                                    Impressum link), pinned by tools/vendor.sh
    puzzles/                        index.json and one batch-<start>.json per batch
    gen/                            the generator (Python) and its word lists
    tests/, tools/                  the tests and the tools below
    docs/HOW-IT-WORKS.md            how the game, the puzzles and the storage work

### Tests

    npm test                       the node tests (tools/test.sh)
    node tools/ui-check.mjs        the page in Chromium (Playwright): looks at three widths and
                                   text sizes, a game, the first run, offline and updates
    bash tools/vendor.sh --check   the vendored files match their pinned commit

To look at it locally: `npm run serve`, then <http://localhost:8002/>.

To play a fresh board before it is in a batch (needs the word data, below):
`python3 gen/preview.py [--days N] [--easy]` makes new boards, the last one today's, puts them
with a copy of the page into the system's temp folder and serves it in the background on
<http://127.0.0.1:8003/wortnetz/>; a second run swaps in new boards, `--stop` ends the server.
It only reads puzzles/: no real day's headline shows early, nothing there changes. As its one
batch ends today, the page says new puzzles are coming.

### A new batch of puzzles

The generator needs word data that isn't in this repository: a lexicon built by gen/lexicon.py
from the word list of enz/german-wordlist (its file `words`), wordfreq and the igerman98
dictionary, Wiktionary's nouns (gen/nouns.py), and a list of words that are never allowed (slurs
and vulgar words), kept out on purpose. It reads them from the folder given by `--data` or
`WORTNETZ_DATA`.

    pip install wordfreq spylls
    python3 gen/nouns.py
    python3 gen/lexicon.py <data>/package/index <data>/words <data>/lexicon.tsv
    python3 gen/gen.py --days 365 --start <the day after the last one>
    python3 gen/words.py puzzles/batch-<start>.json     # read every word before it ships
    python3 gen/check.py                                # every batch against today's lists

Word lists in gen/: names.txt (no word at all), bonusonly.txt (a word, never a hidden one),
allow.txt (bonus words the lexicon lacks), themes.txt (a small group of related words on every
board). After a fix to a list, `gen.py --redo DAY,...` makes new boards for those days only.

## Licence

GNU General Public License, version 3 only (LICENSE). The word data the puzzles are made from
comes with its own terms, listed in NOTICE: the German word list of enz/german-wordlist (CC0),
wordfreq (CC BY-SA 4.0), the igerman98 dictionary (GPL 2 or 3), Wiktionary (CC BY-SA 4.0).
Icons: Lucide (ISC). The files in vendor/xxl-scorer/: MIT.

Copyright 2026 alanceil42 and contributors.
