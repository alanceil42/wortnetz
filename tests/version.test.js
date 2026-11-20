// The version lives in three places: package.json, VERSION in src/build.js (the page's foot and
// the debug report) and the newest released section of CHANGELOG.md. They must agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION, buildInfo } from '../src/build.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');

test('package.json, src/build.js and CHANGELOG name the same version', () => {
	const version = JSON.parse(read('package.json')).version;
	assert.match(version, /^\d+\.\d+(\.\d+)?$/, 'package.json: MAJOR.MINOR, or MAJOR.MINOR.PATCH for a fix');
	assert.equal(VERSION, version, 'src/build.js: VERSION');

	const log = read('CHANGELOG.md');
	assert.match(log, /^## Unreleased$/m, 'CHANGELOG.md: "## Unreleased" section missing');
	const released = log.match(/^## (\d+\.\d+(?:\.\d+)?) - (\d{4}-\d{2}-\d{2})$/m);
	assert.ok(released, 'CHANGELOG.md: no "## X.Y - YYYY-MM-DD" section');
	assert.equal(released[1], version, 'CHANGELOG.md: newest released section');
});

test('a plain checkout names the version only; git archive fills in commit and date', () => {
	assert.deepEqual(buildInfo(), { app: 'wortnetz', version: VERSION, commit: null, date: null });
	assert.match(read('src/build.js'), /commit: '\$Format:%h\$', date: '\$Format:%cs\$'/);
	assert.match(read('.gitattributes'), /^src\/build\.js export-subst$/m);
	assert.match(read('.gitattributes'), /^sw\.js export-subst$/m);
});

test('tools/release-notes.sh prints the section with joined lines', () => {
	const version = JSON.parse(read('package.json')).version;
	const notes = execFileSync('bash', [join(root, 'tools/release-notes.sh'), version], { encoding: 'utf8' });
	const lines = notes.trimEnd().split('\n');
	assert.ok(lines.length > 2 && lines[0] !== '', 'starts with text');
	assert.ok(!lines.some(l => /^## /.test(l)), 'no version heading');
	assert.ok(!lines.some(l => /^ /.test(l)), 'continuation lines joined');
	assert.equal(notes, notes.trimEnd() + '\n', 'no trailing blank lines');
});
