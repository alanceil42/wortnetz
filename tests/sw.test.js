// The service worker (sw.js): it caches every file the page loads, so the game starts with
// no network; the list is checked here against index.html, the manifest and the module imports,
// since a file missing from it would only show offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(root, f), 'utf8');
const sw = read('sw.js');
const FILES = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));

/** every module the page imports, from src/ui/app.js down */
function imports(f, seen = new Set()) {
	if (seen.has(f)) return seen;
	seen.add(f);
	for (const m of read(f).matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)) imports(normalize(join(dirname(f), m[1])), seen);
	return seen;
}

test('the list names every module the page imports, and nothing that isn\'t there', () => {
	const mods = [...imports('src/ui/app.js')].sort();
	for (const m of mods) assert.ok(FILES.includes(m), `missing in sw.js: ${m}`);
	for (const f of FILES) if (f !== './') assert.ok(existsSync(join(root, f)), `not there: ${f}`);
	const js = FILES.filter(f => f.endsWith('.js'));
	assert.deepEqual(js.sort(), mods, 'no module listed that the page doesn\'t load');
});

test('the list names every file index.html and the manifest point at', () => {
	const html = read('index.html');
	const refs = [...html.matchAll(/\s(?:href|src)="([^"#][^"]*)"/g)].map(m => m[1]).filter(u => !/^[a-z]+:/.test(u));
	const man = JSON.parse(read('manifest.json')).icons.map(i => i.src);
	for (const r of [...refs, ...man, 'puzzles/index.json', 'config.json']) assert.ok(FILES.includes(r), `missing in sw.js: ${r}`);
});

test('one cache per release: the commit from git archive, our prefix only', () => {
	assert.match(sw, /const COMMIT = '\$Format:%h\$';/);
	assert.match(read('.gitattributes'), /^sw\.js export-subst$/m);
	assert.match(sw, /k\.startsWith\(PREFIX\) && k !== CACHE/, 'old releases go, other apps\' caches on the same site stay');
	assert.match(sw, /const PREFIX = 'wortnetz-';/);
	assert.doesNotMatch(sw.match(/addEventListener\('install'[^\n]*/)[0], /skipWaiting/, 'installing never takes over by itself');
	assert.match(sw, /if \(e\.data === 'skip'\) self\.skipWaiting\(\)/, 'only when the page says so');
});

test('the page registers it with the policy\'s blessing (worker-src falls back to script-src \'self\')', () => {
	assert.match(read('src/ui/update.js'), /register\('sw\.js'/);
	const csp = read('index.html').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
	assert.match(csp, /script-src 'self'/);
	assert.doesNotMatch(csp, /worker-src|child-src/);
});
