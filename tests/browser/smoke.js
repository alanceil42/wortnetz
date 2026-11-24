// Smoke test of the page in a real browser, served under /wortnetz/ as on GitHub Pages, with a
// site's own settings in local/config.json: the first run, skipped; today's puzzle; a word traced
// and found; the foot with the version and the Impressum link; the service worker in control,
// and the page offline. Fails on any Content-Security-Policy violation, any error in the
// console or the page, and any request to somewhere other than the site itself.
//
// Not part of npm test: it needs playwright-core and Chrome. CI installs playwright-core
// without saving it (no browser download) and uses the runner's Chrome. Locally:
//
//   npm install --no-save --ignore-scripts playwright-core@<version in .github/workflows/ci.yml>
//   node --test tests/browser/smoke.js                                     # Google Chrome
//   WORTNETZ_CHROME=/path/to/chromium node --test tests/browser/smoke.js   # another Chromium
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMPRINT = 'https://example.org/impressum/';
const LOCAL = { '/local/config.json': JSON.stringify({ imprintUrl: IMPRINT }) };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

let server, base, browser;
// a release's worker, as git archive makes it, when set: the commit filled in (else "dev")
let stamp = null;

before(async () => {
	server = createServer(async (req, res) => {
		const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
		try {
			if (!url.startsWith('/wortnetz/')) throw new Error('outside');
			const path = url.slice('/wortnetz'.length);
			const file = normalize(join(root, path === '/' ? 'index.html' : path));
			if (!file.startsWith(root + sep) || path.split('/').some(p => p.startsWith('.'))) throw new Error('outside');
			if (path in LOCAL && LOCAL[path] === null) throw new Error('gone');
			let body = LOCAL[path] ?? await readFile(file);
			if (stamp && path === '/sw.js') body = body.toString().replace('$Format:%h$', stamp);
			res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
			res.end(body);
		} catch {
			res.writeHead(404).end();
		}
	});
	await new Promise(r => server.listen(0, '127.0.0.1', r));
	base = `http://127.0.0.1:${server.address().port}/wortnetz/`;
	browser = await chromium.launch(process.env.WORTNETZ_CHROME ? { executablePath: process.env.WORTNETZ_CHROME } : { channel: 'chrome' });
});

after(async () => {
	await browser?.close();
	server?.close();
});

test('first run, a word found, the foot, offline: no errors, no CSP violation, nothing off-site', async () => {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
	const page = await ctx.newPage();
	const problems = [];
	page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
	page.on('pageerror', e => problems.push(`page: ${e.message}`));
	ctx.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) problems.push(`request: ${r.url()}`); });
	await page.addInitScript(() => {
		document.addEventListener('securitypolicyviolation', e => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`));
	});
	await page.clock.install({ time: new Date('2026-11-26T10:00:00+01:00') });
	await page.goto(base);
	const view = () => page.evaluate(() => window.__wortnetz && window.__wortnetz.view());
	await page.waitForFunction(() => window.__wortnetz && window.__wortnetz.view() === 'intro', null, { timeout: 10000 });

	await page.click('#bSkip');
	await page.waitForFunction(() => window.__wortnetz.view() === 'play' && window.__wortnetz.game(), null, { timeout: 10000 });
	const g = await page.evaluate(() => { const G = window.__wortnetz.game(); return { date: G.date, targets: G.p.targets, letters: G.p.letters }; });
	assert.equal(g.date, '2026-11-26');
	assert.equal(g.letters.length, 16);
	assert.equal(await page.locator('#board .tile').count(), 16, 'the board shows 16 letters');
	// a new board waits under "Start"; the tap uncovers it and starts the clock
	assert.ok(await page.locator('#pausecard').isVisible(), 'a new board starts covered');
	await page.click('#pausecard');
	assert.ok(await page.evaluate(() => !!window.__wortnetz.game().startedAt), '"Start" starts the clock');

	const [w, t] = Object.entries(g.targets).sort((a, b) => b[0].length - a[0].length)[0];
	const xy = i => page.evaluate(i => window.__wortnetz.tileXY(i), i);
	const [x0, y0] = await xy(t.paths[0][0]);
	await page.mouse.move(x0, y0);
	await page.mouse.down();
	for (const i of t.paths[0].slice(1)) { const [x, y] = await xy(i); await page.mouse.move(x, y, { steps: 4 }); }
	await page.mouse.up();
	await page.clock.runFor(1000);
	assert.deepEqual(await page.evaluate(() => window.__wortnetz.game().found), [w], `${w} traced and found`);

	const foot = page.locator('#foot');
	assert.match(await foot.textContent(), /^wortnetz \d+\.\d+/);
	assert.equal(await foot.locator('a').getAttribute('href'), IMPRINT, 'the Impressum link from local/config.json');

	await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
	await ctx.setOffline(true);
	await page.reload();
	await page.waitForFunction(() => window.__wortnetz && window.__wortnetz.game(), null, { timeout: 10000 });
	assert.equal(await view(), 'play', 'offline: the page and today\'s puzzle from the cache');

	assert.deepEqual(problems, []);
	await ctx.close();
});

test("inside another site's frame: no game, no worker, a link to open it on its own", async () => {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const page = await ctx.newPage();
	const problems = [];
	page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
	page.on('pageerror', e => problems.push(`page: ${e.message}`));
	const requests = [];
	ctx.on('request', r => requests.push(r.url()));
	await page.setContent(`<iframe src="${base}" width="390" height="600"></iframe>`);
	const frame = await (await page.waitForSelector('iframe')).contentFrame();
	await frame.waitForSelector('p.framed', { timeout: 10000 });
	assert.match(await frame.textContent('body'), /^wortnetz läuft nur als eigene Seite\. Direkt öffnen\.$/);
	const a = frame.locator('p.framed a');
	assert.equal(await a.getAttribute('href'), base);
	assert.equal(await a.getAttribute('target'), '_blank');
	assert.equal(await frame.evaluate(() => document.getElementById('board')), null, 'no board');
	assert.equal(await frame.evaluate(async () => (navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0)), 0, 'no worker');
	assert.deepEqual(requests.filter(u => /puzzles|config\.json|sw\.js/.test(u)), [], 'nothing loaded for a game');
	assert.deepEqual(problems, []);
	await ctx.close();
});

test("a release's worker: the Impressum link changed on the site reaches an installed page from the next start; offline the cached one", async () => {
	stamp = 'abc1234';
	const link = url => JSON.stringify({ imprintUrl: url });
	const A = 'https://example.org/a/', B = 'https://example.org/b/';
	LOCAL['/local/config.json'] = link(A);
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const page = await ctx.newPage();
	const problems = [];
	page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
	page.on('pageerror', e => problems.push(`page: ${e.message}`));
	await page.clock.install({ time: new Date('2026-11-26T10:00:00+01:00') });
	const href = () => page.locator('#foot a').getAttribute('href', { timeout: 2000 }).catch(() => null);
	/** a start: the page reloaded, the foot drawn */
	const start = async () => {
		await page.reload();
		await page.waitForFunction(() => window.__wortnetz && window.__wortnetz.view() && document.getElementById('foot').textContent, null, { timeout: 10000 });
	};
	/** what the worker's cache holds for the site's settings, once its refresh is done */
	const cached = want => page.waitForFunction(async want => {
		const k = (await caches.keys()).find(n => n === 'wortnetz-abc1234');
		const r = k && await (await caches.open(k)).match('local/config.json');
		return (r ? (await r.json()).imprintUrl : null) === want;
	}, want, { timeout: 10000 });

	await page.goto(base);
	await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
	await cached(A);
	await start();
	assert.equal(await href(), A, 'installed: the link as the site had it');

	LOCAL['/local/config.json'] = link(B);
	await start();
	assert.equal(await href(), A, 'the first start after the change: from the cache, no waiting');
	await cached(B);
	await start();
	assert.equal(await href(), B, 'the next start: the new link');

	await ctx.setOffline(true);
	await start();
	assert.equal(await href(), B, 'offline: the cached link');
	await ctx.setOffline(false);

	assert.deepEqual(problems, []);
	LOCAL['/local/config.json'] = null;
	await start();
	await cached(null);
	await start();
	assert.equal(await href(), null, 'removed on the site: gone from the next start');
	// the page's request for the settings now ends in a 404, as on a site without them
	assert.deepEqual(problems.filter(m => !/status of 404/.test(m)), []);
	await ctx.close();
	stamp = null;
	LOCAL['/local/config.json'] = JSON.stringify({ imprintUrl: IMPRINT });
});
