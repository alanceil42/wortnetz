# How wortnetz works

For someone who codes and wants to understand the project: the game, the puzzles, what is kept
and how the page stays offline. The files named are the place to read on.

## A puzzle

A puzzle (one day of a batch in puzzles/) is 16 letters on a 4 x 4 grid, numbered 0-15 row by
row, and the lines (edges) between neighbouring letters, diagonals included. It lists:

    targets    the hidden words: each with every path it can be traced along, its frequency
               (z, the Zipf value from wordfreq) and its family (the first letters it shares
               with related words)
    bonus      every other word the lines allow (a real word, but not hidden)
    theme      a small group of related words placed first (shown nowhere, found by playing)
    headline   the longest target; on an easy day a long compound whose two parts are targets
    id         a hash of the letters and lines, so a board is the same board wherever it shows

Every line is used by some target: the generator drops the others.

## The game (src/core/game.js)

Pure functions on one object; the page passes the time and the random numbers, so a recorded
game replays exactly (tests/game.test.js replays one).

- **Tracing**: a path grows along visible lines; back onto the letter before takes the last one
  back. Tapping works the same, and tapping the last letter again sends the word.
- **Sending**: shorter than four letters, a repeat, a target, a bonus word, or nothing. A bonus
  word takes 10 s off the clock.
- **Vanishing**: what is visible is the union of every path of every target not yet found.
  When a target is found, its letters and lines go unless an open target still needs them.
- **Hints**: three per puzzle. A hint picks a target from a family nobody has started (else any
  open target) and shows its next letter; the next hint goes on with the same word.
- **Time**: active time runs while the page is in front and not paused. The clock shown is
  active time minus the bonus words. Every event is logged with its active time.

## Expected time (src/core/timing.js)

A formula gives each target a cost: opening a family costs 3 s + 0.8 s per letter + 5 s per
Zipf point below 5; a word whose family is already found costs 1.5 s + 0.3 s per letter. The
expected time is the sum, times your factor: the geometric mean of time / formula over your last
ten first solves. So it learns your pace without a server.

## Days (src/core/days.js)

The day turns at midnight in Berlin. The batches in puzzles/index.json follow each other; a
later batch replaces an earlier one's days from its start. The archive holds the days reached.
Thirty days before the last day of the last batch, a quiet line says new puzzles are coming;
after it, the page says so instead of a board, and the archive still plays.

## What is kept (src/core/records.js, src/ui/store.js)

One object in localStorage, under keys that start with "wortnetz.":

    solves     the first solve of each puzzle (a replay never replaces it): time, active time,
               words, hints, the two ratios for the factor
    started    when each puzzle was first touched ("Gespielt")
    current    a snapshot of each unsolved game, so a reload resumes it (paused)
    games      the last 120 games' event logs, for the debug report
    settings   hide the time, vibration, the backup file's name, the end screen's details

The **backup file** holds solves, starts and settings; stats and the factor follow from them.
Reading one treats it as a file anyone could have edited: only known fields of the right type,
words of A-Z and ÄÖÜ, ids and dates of the expected shape, at most 4 MB and 5000 solves (a
year of daily play is about 0.4 MB). The maps keyed by puzzle id have no prototype. An import
merges: per puzzle the earlier solve wins, starts keep the earlier, the file's settings replace
these. Undo in the toast puts the state from before back; if the browser's storage refuses the
merged state, the import is undone at once.

The **debug report** (vendored from xxl-scorer) is a file the player saves: the page's state,
the recent games, the device's facts and the error log. Nothing is ever sent.

## Offline and updates (sw.js, src/ui/update.js)

The service worker's scope is the site's folder. `git archive` writes the commit into sw.js, so
every release is a new worker with its own cache, wortnetz-<commit>. Installing fetches every
file and every batch into it, all or none; the page is then served from that cache. A new
release waits. Once no game is running, the page offers it once ("Neue Version da." with "Neu
laden"); left alone, it takes over at the next start. Then the old caches go, and the page says
"Neue Version geladen." A checkout that wasn't archived is "dev": network first.

The page loads nothing from anywhere else (Content-Security-Policy in index.html, checked by
tests/static.test.js). The one link out, to the original game in "So geht's", is a plain link.

## The generator (gen/)

The lexicon (gen/lexicon.py) is wordfreq's German list checked against the igerman98 Hunspell
dictionary: each word with its frequency, its stem and whether it is a base form, an inflection,
a compound or a name. A word may be a **target** when it is common enough, not English more than
German, and a base form: no verb forms, imperatives, participles, zu-infinitives or plurals
(Wiktionary's nouns tell a plural from a singular that looks like one). names.txt and the
private never-list keep words out entirely; bonusonly.txt keeps a word a bonus word only.

A board starts from a theme group and a seed word, then places more words where they reuse
letters, until all 16 cells are full. Then every word the lines allow is traced; targets and
bonus words are what the lexicon says. The best of a fixed number of tries wins (about 14
targets, several families, a long headline, a few bonus words). A seed always gives the same
board. No headline and no pair of theme words comes twice across all batches. check.py proves
a batch against the lists as they are today; words.py lists every word of a batch for reading.
