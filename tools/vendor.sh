#!/usr/bin/env bash
# vendor.sh — copy the few files of xxl-scorer that wortnetz uses.
#
# xxl-scorer stays untouched; its files come from the public repository at the commit pinned in
# vendor/xxl-scorer/PIN, are checked against vendor/xxl-scorer/SHA256SUMS, and are never edited
# here. A fix goes to xxl-scorer first, then the pin moves.
#
# Usage:
#   tools/vendor.sh              fetch the pinned files into vendor/xxl-scorer/
#   tools/vendor.sh --check      verify vendor/xxl-scorer/ against SHA256SUMS (and no others)
#   tools/vendor.sh --pin REF    move the pin to REF (a tag or commit), fetch, rewrite SHA256SUMS;
#                                then run the tests and try the page
#
# Needs: bash, curl, git (for --pin), sha256sum or shasum.

set -euo pipefail

cd "$(dirname "$0")/.."
DIR="vendor/xxl-scorer"
REPO="https://github.com/alanceil42/xxl-scorer"
RAW="https://raw.githubusercontent.com/alanceil42/xxl-scorer"
# the debug report's two modules and the backup file name (backupFileName), which
# lives in backup.js; backup.js imports read.js, which imports text.js; the Impressum link
# from the site config (imprint.js)
FILES=(
	LICENSE
	src/core/debugreport.js src/ui/debug.js
	src/core/backup.js src/core/read.js src/core/text.js
	src/core/imprint.js
)

curl() { command curl --proto '=https' --proto-redir '=https' --max-filesize 20971520 --max-time 120 -fsSL "$@"; }
sha256() {
	if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

check() {
	local bad=0 odd extra
	# --strict: a line that isn't a checksum fails instead of being skipped with a warning
	(cd "$DIR" && sha256 -c --quiet --strict SHA256SUMS) || bad=1
	# regular files and directories only, in all of vendor/: the site's upload replaces a
	# symbolic link by what it points to, which could be any file of the machine, and the
	# listing below doesn't see links
	odd="$(find vendor ! -type f ! -type d)"
	if [[ -n "$odd" ]]; then
		printf 'Not a regular file (links and the like are not allowed in vendor/):\n%s\n' "$odd"
		bad=1
	fi
	# and nothing else: the site publishes all of vendor/, so a file nobody listed would go out
	# unchecked
	extra="$(comm -13 <(awk '{ print "'"$DIR"'/" $2 }' "$DIR/SHA256SUMS" | LC_ALL=C sort) \
		<(find vendor -type f ! -path "$DIR/PIN" ! -path "$DIR/SHA256SUMS" | LC_ALL=C sort))"
	if [[ -n "$extra" ]]; then
		printf 'Not in %s/SHA256SUMS:\n%s\n' "$DIR" "$extra"
		bad=1
	fi
	if ((bad)); then echo "vendor check FAILED"; exit 1; fi
	echo "vendor check OK: $(wc -l <"$DIR/SHA256SUMS") files at $(awk '{ print $2 }' "$DIR/PIN")"
}

fetch() {
	local commit="$1" f tmp
	tmp="$(mktemp -d "${TMPDIR:-/tmp}/vendor.XXXXXX")"
	trap 'rm -rf "$tmp"' RETURN
	for f in "${FILES[@]}"; do
		mkdir -p "$tmp/$(dirname "$f")"
		curl -o "$tmp/$f" "$RAW/$commit/$f"
	done
	rm -rf "$DIR.new"
	mkdir -p "$DIR.new"
	cp -a "$tmp/." "$DIR.new/"
	[[ -f "$DIR/PIN" ]] && cp "$DIR/PIN" "$DIR.new/PIN"
	[[ -f "$DIR/SHA256SUMS" ]] && cp "$DIR/SHA256SUMS" "$DIR.new/SHA256SUMS"
	rm -rf "$DIR"
	mv "$DIR.new" "$DIR"
}

case "${1:-}" in
	--check)
		check
		;;
	--pin)
		ref="${2:?usage: tools/vendor.sh --pin REF}"
		commit="$(git ls-remote "$REPO" "refs/tags/$ref^{}" "refs/tags/$ref" "$ref" | awk 'NR == 1 { print $1 }')"
		[[ -n "$commit" ]] || { [[ "$ref" =~ ^[0-9a-f]{40}$ ]] && commit="$ref"; }
		[[ -n "$commit" ]] || { echo "unknown ref: $ref"; exit 1; }
		fetch "$commit"
		printf '%s %s\n' "$commit" "$ref" >"$DIR/PIN"
		(cd "$DIR" && sha256 "${FILES[@]}") >"$DIR/SHA256SUMS"
		check
		;;
	"")
		commit="$(awk '{ print $1 }' "$DIR/PIN")"
		fetch "$commit"
		check
		;;
	*)
		sed -n '2,15p' "$0"
		exit 1
		;;
esac
