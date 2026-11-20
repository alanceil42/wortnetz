// The page's rules that need no browser: the Content-Security-Policy in index.html;
// no dialogs; the vendored files are the pinned ones; no third-party code at run time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(root, f), 'utf8');
const walk = d => readdirSync(join(root, d)).flatMap(f => (statSync(join(root, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test('CSP: the meta policy in index.html allows only the site itself', () => {
	const meta = read('index.html').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
	assert.equal(meta, "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
	assert.match(meta, /script-src 'self';/);
	assert.doesNotMatch(meta, /unsafe/);
});

test('no inline script or style attribute in index.html (the policy would block them)', () => {
	const html = read('index.html');
	assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
	assert.doesNotMatch(html, /\sstyle="/);
	assert.doesNotMatch(html, /\son[a-z]+="/);
});

test('no alert(), confirm() or prompt() anywhere in the page', () => {
	for (const f of walk('src')) assert.doesNotMatch(read(f), /\b(alert|confirm|prompt)\s*\(/, f);
});

test('no style attribute written into markup strings (the policy blocks them)', () => {
	for (const f of walk('src')) assert.doesNotMatch(read(f), /style="/, f);
});

test('no request leaves the site: no http(s) URL in the page code', () => {
	for (const f of [...walk('src'), 'index.html']) {
		// the one exception: the original game, credited in "So geht's" as a link (a navigation the
		// player chooses, without a referrer), never fetched by the page
		const urls = (read(f).match(/https?:\/\/[^\s'"`)]+/g) || []).filter(u => !u.startsWith('http://www.w3.org/') && u !== 'https://pzlgames.com/games/zanagrams/');
		assert.deepEqual(urls, [], f);
	}
});

test('vendored xxl-scorer files match SHA256SUMS at the pinned commit', () => {
	const dir = 'vendor/xxl-scorer';
	const sums = read(`${dir}/SHA256SUMS`).trim().split('\n').map(l => l.split(/\s+/));
	assert.ok(sums.length >= 6);
	for (const [h, f] of sums) assert.equal(createHash('sha256').update(readFileSync(join(root, dir, f))).digest('hex'), h, f);
	assert.match(read(`${dir}/PIN`), /^[0-9a-f]{40} /);
});

test('0.2: no "Ist doch ein Wort", no "kein Ziel", no Backup button or dot', () => {
	for (const f of [...walk('src'), 'index.html', 'app.css']) {
		const t = read(f);
		assert.doesNotMatch(t, /Ist doch ein Wort|kein Ziel|offerClaim|\bclaims?:|strikes/, f);
		assert.doesNotMatch(t, /id="(bBackup|dot|pop)"|#dot\b|\.dot\b/, f);
	}
	const hdr = read('index.html').match(/<header class="hdr">([\s\S]*?)<\/header>/)[1];
	assert.doesNotMatch(hdr, /Backup|export|import/i, 'the header: mark, name, day, ?, gear');
});

test('the Home Screen: a manifest, PNG icons of the sizes it names, the apple-touch-icon at 180 px', () => {
	const m = JSON.parse(read('manifest.json'));
	assert.equal(m.display, 'standalone');
	assert.equal(m.start_url, './');
	for (const i of m.icons) assert.ok(statSync(join(root, i.src)).size > 0, i.src);
	const png = f => { const b = readFileSync(join(root, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
	for (const n of [180, 192, 512]) assert.deepEqual(png(`icons/icon-${n}.png`), [n, n]);
	assert.match(read('index.html'), /<link rel="apple-touch-icon" href="icons\/icon-180\.png">/);
	assert.match(read('index.html'), /<link rel="manifest" href="manifest\.json">/);
});

test('the shipped config.json shows no Impressum link (the site sets one)', () => {
	const c = JSON.parse(read('config.json'));
	assert.equal(c.imprintUrl, '');
	assert.equal(c.imprintLabel, 'Impressum');
});

test('the original game is credited, and only linked: no fetch of it, no referrer', () => {
	const app = read('src/ui/app.js');
	assert.match(app, /const ORIGINAL = 'https:\/\/pzlgames\.com\/games\/zanagrams\/';/);
	assert.match(app, /<a href="\$\{ORIGINAL\}" target="_blank" rel="noopener noreferrer nofollow">Zanagrams<\/a>, einem englischen Worträtsel von PZL games/);
	assert.equal((app.match(/ORIGINAL/g) || []).length, 2, 'used for the link only');
});
