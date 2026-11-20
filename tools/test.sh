#!/usr/bin/env bash
# test.sh — the node tests, one file per core at a time; with the word data beside the repository
# (../wortnetz-private/gen, or WORTNETZ_DATA) and python3, also the generator's tests and the
# batches against the lexicon (gen/test_gen.py, gen/check.py); and the maintainer's own tests
# when ../wortnetz-private/tests is there.
#
# Usage: tools/test.sh [node --test arguments, e.g. tests/game.test.js]

set -euo pipefail

cd "$(dirname "$0")/.."
cores="$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)"
if (($# == 0)); then
	set -- tests/*.test.js
	data="${WORTNETZ_DATA:-../wortnetz-private/gen}"
	if [[ -f "$data/lexicon.tsv" ]] && command -v python3 >/dev/null; then
		python3 gen/test_gen.py 2>&1 | tail -3
		python3 gen/check.py | tail -2
	fi
	if [[ -d ../wortnetz-private/tests ]]; then
		set -- "$@" ../wortnetz-private/tests/*.test.js
	fi
fi
exec node --test --test-concurrency="$cores" --test-reporter=dot "$@"
