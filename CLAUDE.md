# Working on wortnetz (for Claude sessions)

Read the private decision log first (the maintainer's setup says where). docs/HOW-IT-WORKS.md has
the core (the game, expected times, what is kept, offline, the generator), written for someone who
codes.

- One task, one branch `claude/<topic>` from an up-to-date main, one pull request. Never push
  to main. `git fetch origin main` and rebase before starting and before pushing. The
  maintainer merges. Force-push (`--force-with-lease`) only the open pull request's own branch,
  when the maintainer asks to amend it.
- Commits: as Claude (repo-local `git config user.name Claude` and `user.email
  noreply@anthropic.com`, or `git -c` with both where .git/config is read-only); end each
  message with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`. No `Claude-Session:`
  line and no session links in commits; pull request texts may carry the session link.
- Before pushing: `npm test`, `bash tools/vendor.sh --check`, and `node tools/ui-check.mjs` for
  anything the page shows. The maintainer's own tests run outside this repository; say in the
  pull request when a change touches the game core, the backup file or the service worker.
- Decisions go into the private decision log, not into this repository. Code comments give the
  reason where it matters, without decision numbers or names. docs/HOW-IT-WORKS.md changes only
  when the core changes, and stays at about 100 lines.
- User-visible changes get a line under "## Unreleased" in CHANGELOG.md, in the same pull
  request. Releases: Claude prepares the release pull request (package.json, VERSION in
  src/build.js, CHANGELOG.md; tests/version.test.js keeps them in step); the maintainer merges
  it and publishes the release on GitHub, which creates the tag `v<version>` and publishes the
  site to GitHub Pages. `tools/release-notes.sh <version>` prints the notes.
- The game stays German: every text a player sees, one word for one thing everywhere. The docs
  are English. No alert(), confirm() or prompt(); an Undo in the toast instead of asking first.
- Puzzles: new batches are made on the maintainer's computer with the word data, which is not
  in this repository, and come in a pull request; never generate boards in CI. Players read
  this repository: don't quote the words of days not yet played in commits or pull request
  texts. A slip in a batch is fixed by a word list and `gen/gen.py --redo DAY,...`; a list
  change that only adds bonus words by `gen/gen.py --rebonus` (`gen/check.py --bonus` checks).
- The page loads nothing from other sites. Every GitHub Pages project of alanceil42 shares one
  origin (alanceil42.github.io) and with it the browser's storage: storage keys and caches stay
  under the prefix "wortnetz", the service worker's scope stays /wortnetz/, and the page refuses
  to run inside another site's frame. There is never a repository named alanceil42.github.io:
  its site would sit at / and its service worker could take over every project's pages.
- A change to what is kept or to the backup file must still read every older backup file.
- Docs: lines at most 101 columns, tables padded for reading in vi. Bash: indent with tabs.
- Plain JavaScript modules, no build step, no dependencies at run time.
