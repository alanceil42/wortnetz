# Changelog

What changed from one release to the next, newest first. Versions are MAJOR.MINOR (0.2, 0.3,
1.0), with a third number only for a release that just fixes something (0.2.1). Changes on main
that are not released yet collect under "Unreleased".


## Unreleased


## 0.2.3 - 2026-11-24

- A new puzzle stays covered until you tap "Start"; the clock starts with that tap, so the
  letters can't be studied before it runs.
- The expected time counts a long compound (a word that goes on well past one you already
  found) as a new search, not as an easy follow-up: seeing where its parts join takes time.
- "Ried" counts as a bonus word.


## 0.2.2 - 2026-11-23

Word lists only.

- More words count as bonus words: short commands such as "lieg" or "bekomm", and sailing words
  such as Liek, Gaffel or Klampe.
- Words that felt odd as puzzle answers are now bonus words only, among them Soli, Kita, User
  and lies. 59 of the year's boards were remade without them.


## 0.2.1 - 2026-11-21

Fixes only.

- A started puzzle that can't be read back from the browser's storage no longer keeps that
  day's board shut: whatever still fits is kept, otherwise the board opens afresh
- When the browser refuses to save (its storage full or locked), a message says so once:
  "Nicht gespeichert: …", with the way to keep the solves in a backup file
- A new Impressum link on the site reaches installed copies from their next start, without a
  new release
- Times in storage and in backup files count only in the form wortnetz writes them, and the
  first solve of a puzzle is found by time: a file can no longer replace a real solve with a
  made-up time


## 0.2 - 2026-11-21

The first public release: a puzzle a day until 25 November 2027.

- A German word puzzle after Zanagrams by PZL games: 16 letters joined by lines, trace the hidden
  words, bonus words take 10 seconds off the clock, three hints per puzzle, an archive of the
  days reached
- Every board has a small hidden theme: two or three related words
- The first visit shows how it works with an example puzzle, and on iPhone and iPad how to put
  it on the Home Screen
- Plays offline after the first visit; a new version shows "Neue Version da." and loads with
  "Neu laden", or at the next start
- Larger text follows the system's text size; a wider layout on the iPad
- Settings: Backup (export and import), the backup file's name, hide the time, vibration (on
  Android), a debug report
- Thirty days before the last puzzle a note says new ones are coming
