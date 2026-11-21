// ui-check.mjs — the page in a real browser (Playwright's Chromium, or CHROME=/path): its looks,
// a game, the first run, the notice before the boards run out, offline and updates. It serves the
// repository itself, under /wortnetz/ as on GitHub Pages.
//
//	node tools/ui-check.mjs
//	SHOTS=/tmp/ui         screenshots there
//	ONLY=looks,play,...   some parts only (looks, play, intro, runout, storage, offline, dates)
//	BACKUP=/path.json     also import a real backup and compare; BACKUP_DAY=date
//
// Each check prints ok or FAIL; the exit code is the number of failures.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as rec from '../src/core/records.js';
import { dayMap, streak, addDays } from '../src/core/days.js';
import { VERSION } from '../src/build.js';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = process.env.SHOTS || '/tmp/ui';
mkdirSync(SHOTS, { recursive: true });
let fails = 0, n = 0;
const check = (ok, what, extra = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const part = name => !ONLY || ONLY.includes(name);

// ---------- a static server: /wortnetz/ from a folder that can change ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
let ROOT = REPO;
const server = createServer((req, res) => {
	const u = new URL(req.url, 'http://x');
	if (!u.pathname.startsWith('/wortnetz/')) { res.writeHead(404); res.end(); return; }
	let f = decodeURIComponent(u.pathname.slice('/wortnetz/'.length));
	if (f === '' || f.endsWith('/')) f += 'index.html';
	f = normalize(f);
	if (f.startsWith('..') || /(^|\/)\./.test(f) || /^(tests|tools|gen|node_modules)(\/|$)/.test(f)) { res.writeHead(404); res.end(); return; }
	const p = join(ROOT, f);
	if (!existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); res.end(); return; }
	res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
	res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/wortnetz/`;

// ---------- the batches, for states and checks ----------
const index = JSON.parse(readFileSync(join(REPO, 'puzzles/index.json'), 'utf8'));
const DAYS = dayMap(index.batches.map(b => JSON.parse(readFileSync(join(REPO, 'puzzles', b.file), 'utf8'))));
const LAST = [...DAYS.keys()].at(-1);
const TODAY = '2026-11-27';
const at = date => new Date(`${date}T10:00:00+01:00`);
const INTRO = '2026-11-20T08:00:00.000Z';
/** a stored state: the first run done, and solves of these days (found everything) */
function stateWith(dates = [], extra = {}) {
	const st = rec.emptyState();
	st.intro = INTRO;
	for (const d of dates) {
		const p = DAYS.get(d);
		const found = Object.keys(p.targets);
		rec.addSolve(st, { puzzle: p.id, date: d, at: `${d}T09:30:00.000Z`, ms: 200000, active: 210000, hints: 1, tries: 2, found, foundAt: Object.fromEntries(found.map((w, k) => [w, 10000 * (k + 1)])), bonus: p.bonus.slice(0, 2), ratio: 1.1, ratioActive: 1.15, factorBefore: { f: 1, n: 0 }, onTime: true });
	}
	Object.assign(st, extra);
	return JSON.stringify(st);
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';

/**
 * A fresh browser on the page.
 * @param {object} o ctx: context options; time; state: stored state (set once, not on reloads);
 *   root: the root font in px (iOS Dynamic Type: 17 L, 23 XXXL, 33 AX2); init: more init script
 */
async function open(o = {}) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, ...o.ctx });
	const page = await ctx.newPage();
	const errors = [], missing = [];
	page.on('response', r => { if (r.status() === 404) missing.push(r.url()); });
	page.on('console', m => {
		if (m.type() !== 'error') return;
		// the site's optional settings (local/config.json) are absent unless a site sets them
		if (/status of 404/.test(m.text()) && missing.length && missing.every(u => u.endsWith('/local/config.json'))) return;
		errors.push(m.text());
	});
	page.on('pageerror', e => errors.push(`pageerror ${e.message}`));
	if (process.env.LOGS) page.on('console', m => console.log('  console:', m.text()));
	await page.clock.install({ time: o.time || at(TODAY) });
	// a seeded state comes with this checkout's release, so no "Neue Version geladen." covers the shots
	if (o.state) await page.addInitScript(([s, v]) => { if (!localStorage.getItem('wortnetz.state')) { localStorage.setItem('wortnetz.state', s); localStorage.setItem('wortnetz.release', `${v} dev`); } }, [o.state, VERSION]);
	// a vibration log: what the haptics module sent (navigator.vibrate exists on Chromium)
	await page.addInitScript(() => { window.__vib = []; if (navigator.vibrate) navigator.vibrate = p => { window.__vib.push(p); return true; }; });
	// the root font as iOS would set it (before the page's script runs: readyState "interactive")
	if (o.root) await page.addInitScript(px => { document.addEventListener('readystatechange', () => { document.documentElement.style.fontSize = `${px}px`; }, { once: true }); }, o.root);
	if (o.init) await page.addInitScript(o.init);
	await page.goto(o.url || BASE);
	await ready(page);
	return { ctx, page, errors };
}
const ready = page => page.waitForFunction(() => window.__wortnetz && window.__wortnetz.view && (window.__wortnetz.game() || ['end', 'over', 'intro'].includes(window.__wortnetz.view())), null, { timeout: 8000 }).catch(() => {});
const W = page => page.evaluate(() => {
	const G = window.__wortnetz.game();
	return G && { puzzle: G.puzzle, date: G.date, found: G.found.slice(), bonus: G.bonus.slice(), targets: G.p.targets, bonusList: G.p.bonus, letters: G.p.letters, edges: G.p.edges, hints: G.hints, hintW: G.hintW, hintK: G.hintK, pausedBy: G.pausedBy, solved: G.solved, replay: G.replay, startedAt: G.startedAt, events: G.events };
});
const xy = (page, i, intro) => page.evaluate(([i, intro]) => (intro ? window.__wortnetz.intro() : window.__wortnetz).tileXY(i), [i, intro]);
async function drag(page, path, intro = false) {
	const [x0, y0] = await xy(page, path[0], intro);
	await page.mouse.move(x0, y0);
	await page.mouse.down();
	for (const i of path.slice(1)) { const [x, y] = await xy(page, i, intro); await page.mouse.move(x, y, { steps: 4 }); }
	await page.mouse.up();
	await page.waitForTimeout(520);	// the flash
}
async function tapPath(page, path, intro = false) {
	for (const i of [...path, path.at(-1)]) { const [x, y] = await xy(page, i, intro); await page.mouse.click(x, y); await page.waitForTimeout(30); }
	await page.waitForTimeout(520);
}
const vis = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('[hidden]') && r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }, sel);
const txt = (page, sel) => page.evaluate(s => (document.querySelector(s) || {}).textContent || '', sel);
const view = page => page.evaluate(() => window.__wortnetz.view());

/** a word along the board's lines that is no word (for "Nicht in der Wortliste") */
function nonsense(st) {
	const adj = Array.from({ length: 16 }, () => []);
	for (const [a, b] of st.edges) { adj[a].push(b); adj[b].push(a); }
	const words = new Set([...Object.keys(st.targets), ...st.bonusList]);
	for (let s = 0; s < 16; s++) for (const a of adj[s]) for (const b of adj[a]) if (b !== s) for (const c of adj[b]) {
		if (c === s || c === a) continue;
		const p = [s, a, b, c];
		const w = p.map(i => st.letters[i]).join('');
		const usable = Object.values(st.targets).some(t => t.paths.some(q => q.includes(s))) && [s, a, b, c].every((i, k, arr) => !k || Object.values(st.targets).some(t => t.paths.some(q => q.some((x, j) => j && ((q[j - 1] === arr[k - 1] && x === i) || (q[j - 1] === i && x === arr[k - 1]))))));
		if (!words.has(w) && usable) return p;
	}
	return null;
}
function bonusPath(st) {
	const adj = Array.from({ length: 16 }, () => []);
	for (const [a, b] of st.edges) { adj[a].push(b); adj[b].push(a); }
	const lines = new Set(Object.values(st.targets).flatMap(t => t.paths.flatMap(q => q.slice(1).map((x, j) => `${Math.min(x, q[j])}-${Math.max(x, q[j])}`))));
	for (const w of st.bonusList) {
		const dfs = (path) => {
			if (path.length === w.length) return path;
			for (const j of path.length ? adj[path.at(-1)] : [...Array(16).keys()]) {
				if (path.includes(j) || st.letters[j] !== w[path.length]) continue;
				if (path.length && !lines.has(`${Math.min(j, path.at(-1))}-${Math.max(j, path.at(-1))}`)) continue;
				const r = dfs([...path, j]); if (r) return r;
			}
			return null;
		};
		const p = dfs([]); if (p) return { w, p };
	}
	return null;
}
const overlap = (list) => { for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) { const p = list[a], q = list[b]; if (p.x < q.r - 0.5 && q.x < p.r - 0.5 && p.y < q.b - 0.5 && q.y < p.b - 0.5) return `${p.n} / ${q.n}`; } return ''; };
const boxes = (page, sel) => page.evaluate(s => [...document.querySelectorAll(s)].filter(e => !e.closest('[hidden]') && e.getClientRects().length).map(e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, n: e.id || (typeof e.className === 'string' ? e.className : '') || e.tagName }; }), sel);
const box = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e || e.closest('[hidden]')) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; }, sel);
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// ---------- looks (done means 10): three screens, light and dark, three text sizes ----------
const TOKENS = { light: { bg: 'rgb(244, 241, 234)', accent: '#8a5a2b' }, dark: { bg: 'rgb(24, 22, 19)', accent: '#d7a56e' } };
const SIZES = [[17, 'L'], [23, 'XXXL'], [33, 'AX2']];
if (part('looks')) for (const [w, h] of [[390, 844], [820, 1180], [1180, 820]]) for (const scheme of ['light', 'dark']) for (const [root, sz] of SIZES) {
	const phone = w < 500;
	const tag = `${w}x${h} ${scheme} ${sz}`;
	const ctxo = { viewport: { width: w, height: h }, colorScheme: scheme, isMobile: phone, hasTouch: true };
	const shoot = scheme === 'light' || root === 17;
	// the game
	{
		const { ctx, page, errors } = await open({ ctx: ctxo, root, state: stateWith() });
		const f = await page.evaluate(() => {
			const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
			const cs = getComputedStyle(document.documentElement);
			const t = document.querySelector('.tile text'), c = document.querySelector('.tile circle');
			return {
				board: r('svg.board'), hdr: r('.hdr'), gbar: r('.gbar'), word: r('.wordbar'), left: r('#left'), status: r('.status'),
				innerH: innerHeight, rootPx: parseFloat(cs.fontSize),
				bg: getComputedStyle(document.body).backgroundColor, accent: cs.getPropertyValue('--accent').trim(),
				fs: +t.getAttribute('font-size'), cr: +c.getAttribute('r'), lockMeta: !!document.querySelector('meta[name="darkreader-lock"]'),
			};
		});
		check(!errors.length, `${tag}: no errors in the console`, errors.join(' | '));
		check((await sideways(page)) <= 0, `${tag}: no sideways scrolling`);
		const hk = await boxes(page, '.hdr > .ib, .name > *'), gk = await boxes(page, '.gbar > *');
		const o1 = overlap(hk), o2 = overlap(gk);
		check(!o1 && !o2 && Math.max(...hk.map(b => b.r)) <= w + 0.5, `${tag}: the header fits, header and game bar: nothing overlaps`, o1 || o2);
		check(f.hdr.b <= f.gbar.y + 0.5 && f.gbar.b <= f.word.y + 0.5 && f.word.b <= f.board.y + 0.5 && f.board.b <= f.status.y + 0.5, `${tag}: header, game bar, word bar, board, status stacked without overlap`);
		if (root === 17) check(f.word.y >= 0 && f.board.b <= f.innerH && f.left.b <= f.innerH, `${tag}: word bar, board and "Noch … Wörter" without scrolling`, `board to ${Math.round(f.board.b)}, Noch to ${Math.round(f.left.b)} of ${f.innerH}`);
		check(f.board.w >= Math.min(300, w - 40), `${tag}: the board is big enough to play`, `${Math.round(f.board.w)} px`);
		const s = Math.max(1, root / 17);
		check(Math.abs(f.rootPx - root) < 0.5 && Math.abs(f.fs - 34 * Math.min(1.35, s)) < 0.1 && Math.abs(f.cr - 34 * Math.min(1.15, s)) < 0.1, `${tag}: letters grow to 1.35, circles to 1.15`, `font ${f.fs}, r ${f.cr}`);
		check(f.bg === TOKENS[scheme].bg && f.accent === TOKENS[scheme].accent && f.lockMeta, `${tag}: Bernstein's tokens, darkreader-lock`);
		if (shoot) await page.screenshot({ path: `${SHOTS}/play-${w}-${scheme}-${sz}.png` });
		for (const sh of ['settings', 'archive', 'help']) {
			await page.click(`.hdr [data-open="${sh}"], .gbar [data-open="${sh}"]`);
			await page.waitForTimeout(60);
			const b = await page.evaluate(() => { const e = document.querySelector('.sheet'); const r = e.getBoundingClientRect(); return { r: r.right, sw: e.scrollWidth, cw: e.clientWidth }; });
			const inner = overlap(await boxes(page, '.sheet .top > *, .sheet .two > *'));
			check(b.r <= w + 0.5 && b.sw <= b.cw && !inner, `${tag}: sheet ${sh} fits`, inner);
			if (shoot && root !== 23) await page.screenshot({ path: `${SHOTS}/sheet-${sh}-${w}-${scheme}-${sz}.png` });
			await page.click('[data-close]');
		}
		await ctx.close();
	}
	// the end screen, Details open
	{
		const { ctx, page, errors } = await open({ ctx: ctxo, root, state: stateWith([TODAY]) });
		check(await view(page) === 'end', `${tag}: a solved day opens on its end screen`);
		const tiles = overlap(await boxes(page, '#eTiles .st, #end > .btns .btn'));
		check(!tiles && (await sideways(page)) <= 0, `${tag}: end screen fits`, tiles);
		if (shoot) await page.screenshot({ path: `${SHOTS}/end-${w}-${scheme}-${sz}.png`, fullPage: true });
		await page.click('#bDetails');
		check(!(await page.evaluate(() => document.getElementById('eDet').hidden)) && (await sideways(page)) <= 0 && !overlap(await boxes(page, '#eStats .st')), `${tag}: Details open and fit`);
		if (shoot && root !== 23) await page.screenshot({ path: `${SHOTS}/end-details-${w}-${scheme}-${sz}.png`, fullPage: true });
		check(!errors.length, `${tag}: end screen without errors`, errors.join(' | '));
		await ctx.close();
	}
	// the first run (iPhone: the Home Screen step; else straight to the example)
	{
		const { ctx, page, errors } = await open({ ctx: { ...ctxo, userAgent: phone ? IPHONE : undefined }, root });
		check(await view(page) === 'intro' && (await sideways(page)) <= 0, `${tag}: first run fits`);
		if (shoot && root !== 23) await page.screenshot({ path: `${SHOTS}/intro1-${w}-${scheme}-${sz}.png`, fullPage: true });
		if (phone) await page.click('[data-intro="play"]');
		const g = await box(page, '.guide'), bd = await box(page, '#tBoard'), lf = await box(page, '#tLeft');
		check(g && bd && lf && g.b <= bd.y + 0.5 && bd.b <= lf.y + 0.5 && (root > 17 || lf.b <= h), `${tag}: example: guide, board, "Noch …" stacked${root === 17 ? ', on one screen' : ''}`);
		const hk = await boxes(page, '.hdr > button, .name > *');
		check(!overlap(hk) && Math.max(...hk.map(b => b.r)) <= w + 0.5, `${tag}: example: header with "Überspringen" fits`, overlap(hk));
		if (shoot && root !== 23) await page.screenshot({ path: `${SHOTS}/intro2-${w}-${scheme}-${sz}.png`, fullPage: true });
		check(!errors.length, `${tag}: first run without errors`, errors.join(' | '));
		await ctx.close();
	}
}

// ---------- play (done means 6, 12): a whole game by finger, 390 px, touch ----------
let backupFile = null, reportFile = null;
// (Chromium forgets the emulated touch points after a reload: they're set here for the haptics)
const TOUCH = () => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
if (part('play')) {
	const { ctx, page, errors } = await open({ ctx: { colorScheme: 'light', isMobile: true, hasTouch: true }, state: stateWith(), init: TOUCH });
	let st = await W(page);
	check(st && st.date === TODAY, 'play: today\'s puzzle by the Berlin date', st && st.date);
	check((await txt(page, '#ctime')) === '0:00' && !st.startedAt, 'play: the clock waits for the first touch');
	check(!(await page.evaluate(() => !!document.querySelector('#bBackup, #dot, #pop'))), 'play: no Backup in the header');
	const words = Object.entries(st.targets).sort((a, b) => a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1));
	const nn = nonsense(st), nnWord = nn && nn.map(i => st.letters[i]).join('');
	if (nn) {
		await drag(page, nn);
		check((await txt(page, '#msg')).includes('Nicht in der Wortliste'), 'play: a word not in the list says so');
		check(!(await page.evaluate(() => !!document.querySelector('.claim'))) && !(await page.evaluate(() => document.body.textContent.includes('Ist doch ein Wort'))), 'play: no "Ist doch ein Wort"');
		check(JSON.stringify((await page.evaluate(() => window.__vib)).at(-1)) === JSON.stringify([12, 58, 12, 58, 12]), 'play: a miss: three quick ticks');
	} else check(false, 'play: found a nonsense path to try');
	const [w1, t1] = words[0];
	const vib0 = (await page.evaluate(() => window.__vib)).length;
	await drag(page, t1.paths[0]);
	st = await W(page);
	check(st.found.includes(w1), `play: sliding ${w1} finds it`);
	const vib = (await page.evaluate(() => window.__vib)).slice(vib0);
	check(vib.filter(v => v === 8).length === w1.length && JSON.stringify(vib.at(-1)) === '[14,76,14]', 'play: a tick per letter, two quick ticks for a target', JSON.stringify(vib));
	check((await txt(page, '#left')).includes(`Noch ${words.length - 1}`), 'play: "Noch n Wörter" counts down');
	const [w2, t2] = words.find(([w]) => !st.found.includes(w));
	await tapPath(page, t2.paths[0]);
	st = await W(page);
	check(st.found.includes(w2) && st.events.some(e => e.ty === 'word' && e.w === w2 && e.tap), `play: tapping ${w2} letter by letter, the last again, finds it`);
	const bp = bonusPath(st);
	if (bp) {
		await drag(page, bp.p);
		st = await W(page);
		check(st.bonus.includes(bp.w) && (await txt(page, '#msg')).includes('−10 s'), `play: bonus word ${bp.w}, −10 s`);
		check(JSON.stringify((await page.evaluate(() => window.__vib)).at(-1)) === '[14,206,14]', 'play: an Extrawort: two slower ticks');
	} else check(false, 'play: a bonus word to trace');
	await page.click('#bHint');
	st = await W(page);
	check(st.hintW && (await page.evaluate(() => document.querySelectorAll('.tile.h').length)) === 1 && (await txt(page, '#word')).startsWith(st.hintW[0]), `play: the hint shows ${st.hintW}'s first letter`);
	await page.click('#bRotate');
	await page.waitForTimeout(400);
	const [w3, t3] = words.find(([w]) => !st.found.includes(w));
	await drag(page, t3.paths[0]);
	st = await W(page);
	check(st.found.includes(w3) && st.events.some(e => e.ty === 'rotate'), `play: after a quarter turn ${w3} still traces`);
	await page.click('#clock');
	check(await vis(page, '#pausecard'), 'play: tapping the clock pauses and covers the board');
	const t0 = await txt(page, '#ctime');
	await page.clock.runFor(5000);
	check((await txt(page, '#ctime')) === t0, 'play: the clock stands while paused');
	await page.click('#pausecard');
	await page.click('.gbar [data-open="archive"]');
	check((await W(page)).pausedBy === 'menu', 'play: opening a sheet pauses');
	const days = await page.$$eval('.day', b => b.map(x => x.dataset.day));
	check(days[0] === TODAY && days.at(-1) === '2026-11-19' && days.length === 9, 'play: the archive holds the days reached only', days.join(','));
	await page.click('[data-close]');
	check(!(await W(page)).pausedBy, 'play: back from the sheet the game goes on by itself');
	await page.reload();
	await ready(page);
	st = await W(page);
	check(st.found.includes(w1) && st.found.includes(w3) && !!st.pausedBy && await view(page) === 'play', 'play: after a reload the game is there, paused, no first run', st.pausedBy);
	await page.click('#pausecard');
	for (const [w, t] of words) if (!(await W(page)).found.includes(w) && !(await W(page)).solved) await drag(page, t.paths[0]);
	await page.waitForTimeout(1100);
	check(await vis(page, '#end'), 'play: solved, the end screen shows');
	const tiles = await page.$$eval('#eTiles .st', t => t.map(x => `${x.querySelector('.v').textContent} ${x.querySelector('.k').textContent}`));
	check(JSON.stringify(tiles) === JSON.stringify([`${words.length} Wörter`, '1 Tipp', '1 Tag Serie']), 'end: Wörter, Tipp, Tage Serie (variant A)', tiles.join(' | '));
	const chips = await page.$$eval('#eFound .chip', c => c.length);
	check(chips === words.length + 1, 'end: the words found as chips, the Extrawort too', String(chips));
	check((await txt(page, '#eTitle')) === 'Gelöst in' && /^\d+:\d\d$/.test(await txt(page, '#eTime')), 'end: "Gelöst in" and the time');
	check(await page.evaluate(() => document.getElementById('eDet').hidden) && await vis(page, '#bNext') && await vis(page, '#end [data-open="archive"]'), 'end: Details shut; Archiv and Nächstes');
	await page.click('#bDetails');
	const rows = await page.$$eval('#eWords tr', r => r.length - 1);
	check(rows === words.length && (await txt(page, '#eCmp')).startsWith('erwartet') && await vis(page, '#bAgain'), `end: Details: expected time, the table of all ${words.length} words, "Von vorn"`);
	const stats = await page.$$eval('#eStats .v', v => v.map(x => x.textContent));
	check(JSON.stringify(stats) === '["1","1","1"]', 'end: Details: Gespielt 1, Gelöst 1, Fehlversuche 1', stats.join(','));
	await page.click('#eView [data-v="time"]');
	check(await page.evaluate(() => document.querySelectorAll('.tlrow').length) === words.length, 'end: the timeline toggle');
	check(!(await page.evaluate(() => !!document.querySelector('tr[data-w], tr.flag'))) && !(await page.evaluate(() => document.body.textContent.includes('kein Ziel'))), 'end: no "kein Ziel"');
	await page.screenshot({ path: `${SHOTS}/end-played-390.png`, fullPage: true });
	await page.click('#eView [data-v="table"]');
	await page.reload();
	await ready(page);
	check(await view(page) === 'end' && !(await page.evaluate(() => document.getElementById('eDet').hidden)), 'end: reloaded, the end screen remembers Details open');
	const solvedMs = await page.evaluate(() => Object.values(window.__wortnetz.state().solves)[0].ms);
	await page.click('#bAgain');
	st = await W(page);
	check(st && st.replay && !st.solved && st.found.length === 0, 'end: "Von vorn" starts it afresh, as a replay');
	for (const [, t] of words) await drag(page, t.paths[0]);
	await page.waitForTimeout(1100);
	check((await txt(page, '#eTitle')).startsWith('Wiederholung'), 'end: the replay ends as "Wiederholung"');
	const after = await page.evaluate(() => { const s = window.__wortnetz.state(); return { n: Object.keys(s.solves).length, ms: Object.values(s.solves)[0].ms }; });
	check(after.n === 1 && after.ms === solvedMs, 'end: the replay counts for neither stats nor the factor');
	await page.click('#end [data-open="archive"]');
	await page.click('[data-day="2026-11-26"]');
	st = await W(page);
	check(st.date === '2026-11-26' && (await txt(page, '#day')).includes('Archiv'), 'play: an archive day opens');
	// help: the version, the inspiration
	await page.click('.hdr [data-open="help"]');
	check((await txt(page, '.ver')).startsWith(`wortnetz ${VERSION}`) && await vis(page, '[data-act="example"]'), 'help: the version, "Probierrätsel noch einmal"');
	const credit = await page.evaluate(() => { const a = document.querySelector('.sheet a[href^="https://pzlgames.com/"]'); return a && { t: a.closest('p').textContent, rel: a.rel }; });
	check(credit && credit.t.includes('Zanagrams') && credit.rel.includes('noreferrer'), 'help: names Zanagrams by PZL games, linked without a referrer', credit && credit.t);
	await page.click('[data-close]');
	// settings: hide time, vibration, backup
	await page.click('.hdr [data-open="settings"]');
	check(await vis(page, '#sVib') && await vis(page, '.sheet [data-act="export"]') && await vis(page, '.sheet [data-act="import"]'), 'settings: Vibration, Backup Exportieren and Importieren');
	check((await txt(page, '#sLast')).startsWith('Noch nicht gesichert.'), 'settings: "Noch nicht gesichert." before the first export');
	await page.click('#sHide');
	await page.click('#sVib');
	await page.fill('#sFile', 'mein-netz-{date}');
	check((await txt(page, '#sFileOut')) === 'mein-netz-2026-11-27.json', 'settings: the backup file name from the setting');
	await page.click('[data-close]');
	check(!(await vis(page, '#ctime')), 'settings: "Zeit ausblenden": a pause button instead of the clock');
	const vib1 = (await page.evaluate(() => window.__vib)).length;
	const [, t4] = Object.entries(st.targets)[0];
	await drag(page, t4.paths[0]);
	check((await page.evaluate(() => window.__vib)).length === vib1, 'settings: "Vibration" off: no ticks');
	for (const [, t] of Object.entries(st.targets)) if (!(await W(page)).solved) await drag(page, t.paths[0]);
	await page.waitForTimeout(1100);
	check(await vis(page, '#end') && (await txt(page, '#eTime')) === 'Gelöst!' && (await txt(page, '#eTitle')) === '', 'settings: hidden time: "Gelöst!" instead of the time');
	check((await page.$$eval('#eWords th', t => t.length)) === 2 && !(await vis(page, '#eCmp')), 'settings: hidden time: Details without times');
	await page.screenshot({ path: `${SHOTS}/end-hidden-390.png`, fullPage: true });
	await page.click('.hdr [data-open="settings"]');
	const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.sheet [data-act="export"]')]);
	check(dl.suggestedFilename() === 'mein-netz-2026-11-27.json', 'backup: export from Settings with the set file name', dl.suggestedFilename());
	backupFile = `${SHOTS}/${dl.suggestedFilename()}`;
	await dl.saveAs(backupFile);
	check((await txt(page, '#sLast')).startsWith('Zuletzt gesichert: 27.11.,'), 'backup: Settings says when it was last saved', await txt(page, '#sLast'));
	const [dr] = await Promise.all([page.waitForEvent('download'), page.click('.sheet [data-act="debug"]')]);
	reportFile = `${SHOTS}/${dr.suggestedFilename()}`;
	await dr.saveAs(reportFile);
	const rep = JSON.parse(readFileSync(reportFile, 'utf8'));
	check(rep.app === 'wortnetz' && rep.kind === 'debug-report' && dr.suggestedFilename() === 'wortnetz-debug-2026-11-27.json', 'report: saved as wortnetz-debug-<date>.json');
	check(rep.games.length >= 3 && rep.rejected.length === 1 && rep.rejected[0].w === nnWord && !('claims' in rep) && !('strikes' in rep), 'report: the rejected word, no claims or strikes', JSON.stringify(rep.rejected));
	check(rep.settings.hideTime === true && rep.settings.vibration === false && rep.settings.details === true && rep.build.version === VERSION && rep.env.haptics === 'vibrate' && rep.intro === INTRO, 'report: settings, version, haptics, first run');
	check(rep.errors.length === 0, 'report: no errors logged', JSON.stringify(rep.errors));
	await page.click('[data-close]');
	check(!errors.length, 'play: no errors in the console', errors.join(' | '));
	await ctx.close();
}

// ---------- backup into an empty browser (done means 6); Undo ----------
async function importInto(page, file) {
	await page.click('.hdr [data-open="settings"]');
	const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.sheet [data-act="import"]')]);
	await chooser.setFiles(file);
	await page.waitForTimeout(300);
}
if (backupFile) {
	const { ctx, page, errors } = await open({ ctx: { colorScheme: 'dark' }, state: stateWith() });
	const fileJson = JSON.parse(readFileSync(backupFile, 'utf8'));
	await importInto(page, backupFile);
	check(await vis(page, '#toast [data-act="toast"]') && (await txt(page, '#toast')).includes('Rückgängig'), 'backup: the toast offers Undo');
	await page.click('#toast [data-act="toast"]');
	const st0 = await page.evaluate(() => window.__wortnetz.state());
	check(Object.keys(st0.solves).length === 0 && st0.settings.hideTime === false, 'backup: Undo takes the import back');
	await page.waitForTimeout(3100);
	await importInto(page, backupFile);
	const st = await page.evaluate(() => window.__wortnetz.state());
	const solves = Object.values(st.solves).sort((a, b) => (a.at < b.at ? -1 : 1));
	check(JSON.stringify(solves) === JSON.stringify(fileJson.solves), 'backup: import into an empty browser: the same solves');
	check(st.settings.hideTime === true && st.settings.fileName === 'mein-netz-{date}' && st.settings.vibration === false, 'backup: … and the same settings');
	check(await view(page) === 'end', 'backup: the imported solve of today shows its end screen');
	const tiles = await page.$$eval('#eTiles .v', v => v.map(x => x.textContent));
	check(tiles[2] === '1', 'backup: … with the same streak', tiles.join(','));
	check(!errors.length, 'backup: no errors in the console', errors.join(' | '));
	await ctx.close();
	// storage full: the import is undone at once and says so, so no later save fails unseen
	{
		const { ctx, page } = await open({ ctx: { colorScheme: 'light' }, state: stateWith() });
		const before = await page.evaluate(() => localStorage.getItem('wortnetz.state'));
		const filled = await page.evaluate(() => {
			// as much filler as the browser takes, to the last character
			let lo = 0, hi = 16 << 20;
			while (lo < hi) {
				const mid = (lo + hi + 1) >> 1;
				try { localStorage.setItem('ui-check.filler', 'x'.repeat(mid)); lo = mid; } catch { hi = mid - 1; }
			}
			localStorage.setItem('ui-check.filler', 'x'.repeat(lo));
			return lo;
		});
		await importInto(page, backupFile);
		const toastText = await txt(page, '#toast');
		const st = await page.evaluate(() => window.__wortnetz.state());
		check(toastText.includes('Zu groß für den Speicher dieses Browsers, nicht importiert.'), 'backup: storage full: the import says so', `${filled} filler; ${toastText}`);
		check(Object.keys(st.solves).length === 0 && (await page.evaluate(() => localStorage.getItem('wortnetz.state'))) === before, 'backup: storage full: nothing of the file stays, in the page or in storage');
		await ctx.close();
	}
}
// a real backup (BACKUP=): the same solves, streak and factor after the import as in the file
if (process.env.BACKUP) {
	const text = readFileSync(process.env.BACKUP, 'utf8');
	const b = rec.readBackup(text);
	const want = rec.emptyState(); rec.mergeBackup(want, b);
	const newest = b.solves.map(s => s.date).filter(Boolean).sort().at(-1);
	const day = process.env.BACKUP_DAY || newest;
	const s = rec.stats(want);
	const { ctx, page, errors } = await open({ ctx: { colorScheme: 'light', isMobile: true, hasTouch: true }, state: stateWith(), time: at(day) });
	await importInto(page, process.env.BACKUP);
	const got = await page.evaluate(() => window.__wortnetz.state());
	check(JSON.stringify(Object.keys(got.solves).sort()) === JSON.stringify(Object.keys(want.solves).sort()), `real backup: the same ${Object.keys(want.solves).length} solves`);
	check(JSON.stringify(rec.factorNow(got)) === JSON.stringify(rec.factorNow(want)), 'real backup: the same factor', JSON.stringify(rec.factorNow(want)));
	await page.click('[data-open="archive"]:visible');
	const solvedDays = await page.$$eval('.day', d => d.filter(x => x.querySelector('.ok')).length);
	check(solvedDays === Object.values(want.solves).filter(x => x.date && x.date <= day && DAYS.has(x.date) && DAYS.get(x.date).id === x.puzzle).length, 'real backup: the archive shows them solved', String(solvedDays));
	await page.click('[data-close]');
	if (await view(page) === 'end') {
		const tiles = await page.$$eval('#eTiles .v', v => v.map(x => x.textContent));
		check(tiles[2] === String(streak(s.onTime, day)), `real backup: streak ${streak(s.onTime, day)} on ${day}`, tiles.join(','));
		await page.screenshot({ path: `${SHOTS}/real-backup-end.png`, fullPage: true });
	} else {
		// a whole real game on a new board, on top of the imported solves: drag, tap, hint,
		// rotate, pause, an Extrawort; the streak goes on; the debug report without errors
		let st = await W(page);
		const words = Object.entries(st.targets);
		const bp = bonusPath(st);
		if (bp) await drag(page, bp.p);
		await page.click('#bHint');
		await tapPath(page, words[0][1].paths[0]);
		await page.click('#bRotate');
		await page.waitForTimeout(400);
		await page.click('#clock');
		await page.click('#pausecard');
		for (const [, t] of words.slice(1)) if (!(await W(page)).solved) await drag(page, t.paths[0]);
		await page.waitForTimeout(1100);
		st = await W(page);
		const tiles = await page.$$eval('#eTiles .v', v => v.map(x => x.textContent));
		const streakNow = streak(new Set([...s.onTime, day]), day);
		check(await view(page) === 'end' && st.solved && (!bp || st.bonus.includes(bp.w)) && tiles[2] === String(streakNow), `real backup: a whole game on ${day} played through, streak ${streakNow}`, tiles.join(','));
		const f = rec.factorNow(await page.evaluate(() => window.__wortnetz.state()));
		check(f.n === Math.min(10, rec.factorNow(want).n + 1), 'real backup: the factor takes the new solve', JSON.stringify(f));
		await page.screenshot({ path: `${SHOTS}/real-game-end.png`, fullPage: true });
		await page.click('.hdr [data-open="settings"]');
		const [dr] = await Promise.all([page.waitForEvent('download'), page.click('.sheet [data-act="debug"]')]);
		const rf = `${SHOTS}/real-${dr.suggestedFilename()}`;
		await dr.saveAs(rf);
		const rep = JSON.parse(readFileSync(rf, 'utf8'));
		check(rep.errors.length === 0 && rep.solves.length === Object.keys(want.solves).length + 1, 'real backup: the debug report: no errors, every solve', `${rep.errors.length} errors, ${rep.solves.length} solves`);
	}
	check(!errors.length, 'real backup: no errors', errors.join(' | '));
	await ctx.close();
}

// ---------- the first run (done means 7) ----------
if (part('intro')) {
	{
		// iPhone, Safari: the Home Screen step, then the example by drag and by tap
		const { ctx, page, errors } = await open({ ctx: { userAgent: IPHONE, isMobile: true, hasTouch: true } });
		check(await view(page) === 'intro' && (await page.evaluate(() => document.getElementById('intro').textContent.includes('Zuerst auf den Home-Bildschirm'))), 'first run: iPhone Safari: the Home Screen step first');
		check((await txt(page, '#intro ol')).includes('⋯') && (await txt(page, '#intro ol')).includes('unten'), 'first run: iPhone: "⋯" and Teilen, at the bottom');
		check(!(await vis(page, '.hdr [data-open="settings"]')) && !(await vis(page, '#gbar')), 'first run: no gear, no game bar');
		await page.click('[data-intro="play"]');
		check(await vis(page, '#bSkip') && (await txt(page, '.guide')).startsWith('Zieh den Finger von W bis T.'), 'first run: the example: the guide, "Überspringen"');
		const E = { WORT: [0, 1, 2, 3], NETZ: [7, 6, 5, 4], ORTE: [1, 2, 3, 6], ORTEN: [1, 2, 3, 6, 7], WORTNETZ: [0, 1, 2, 3, 7, 6, 5, 4] };
		await drag(page, E.WORT, true);
		check((await page.evaluate(() => window.__wortnetz.intro().game().found)).includes('WORT') && (await txt(page, '.guide')).includes('Das W bleibt'), 'first run: WORT by drag');
		await tapPath(page, E.NETZ, true);
		check((await page.evaluate(() => window.__wortnetz.intro().game().found)).includes('NETZ'), 'first run: NETZ by tap, the Z again to send');
		await drag(page, E.ORTE, true);
		check((await page.evaluate(() => window.__wortnetz.intro().game().bonus)).includes('ORTE') && (await txt(page, '.guide')).includes('Extrawort'), 'first run: ORTE: an Extrawort');
		await drag(page, E.ORTEN, true);
		check((await txt(page, '.guide')).includes('schräge Linie ist weg'), 'first run: ORTEN: the slanted line goes');
		await page.screenshot({ path: `${SHOTS}/intro-playing-390.png` });
		await drag(page, E.WORTNETZ, true);
		await page.waitForTimeout(1400);
		check((await txt(page, '#intro')).includes('Geschafft!') && await vis(page, '[data-intro="done"]'), 'first run: solved: "Geschafft!" and the tips');
		await page.screenshot({ path: `${SHOTS}/intro-done-390.png`, fullPage: true });
		await page.click('[data-intro="done"]');
		check(await view(page) === 'play' && (await W(page)).date === TODAY && (await vis(page, '.hdr [data-open="settings"]')), 'first run: "Zum heutigen Rätsel" opens today\'s puzzle');
		check(!!(await page.evaluate(() => window.__wortnetz.state().intro)), 'first run: done, remembered');
		await page.reload();
		await ready(page);
		check(await view(page) === 'play', 'first run: once per fresh storage: not again after a reload');
		// "So geht's" plays it again; the running game waits, paused, and goes on afterwards
		const words = Object.entries((await W(page)).targets);
		await drag(page, words[0][1].paths[0]);
		await page.click('.hdr [data-open="help"]');
		await page.click('[data-act="example"]');
		check(await view(page) === 'intro' && (await W(page)).pausedBy === 'menu' && (await txt(page, '.guide')).startsWith('Zieh'), '"So geht\'s": the example again, the game paused');
		await page.click('#bSkip');
		check(await view(page) === 'play' && !(await W(page)).pausedBy && (await W(page)).found.length === 1, '"So geht\'s": back, the game goes on where it was');
		check(!errors.length, 'first run: no errors in the console', errors.join(' | '));
		await ctx.close();
	}
	{
		// from the Home Screen: no step, straight to the example
		const { ctx, page } = await open({ ctx: { userAgent: IPHONE, isMobile: true, hasTouch: true }, init: () => Object.defineProperty(navigator, 'standalone', { get: () => true }) });
		check(await view(page) === 'intro' && await vis(page, '.guide') && !(await txt(page, '#intro')).includes('Home-Bildschirm'), 'first run: from the Home Screen: no step, the example');
		await ctx.close();
	}
	{
		// an iPad (iPadOS: a Mac's user agent with a touch screen): the step, Share at the top
		const { ctx, page } = await open({ ctx: { userAgent: IPAD, viewport: { width: 820, height: 1180 }, hasTouch: true }, init: () => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }) });
		check(await view(page) === 'intro' && (await txt(page, '#intro ol')).includes('oben'), 'first run: iPad: the step, Teilen at the top');
		await ctx.close();
	}
	{
		// a desktop: no step; "Überspringen" goes to today's puzzle and counts as done
		const { ctx, page } = await open({ ctx: { viewport: { width: 1280, height: 800 } } });
		check(await view(page) === 'intro' && await vis(page, '.guide'), 'first run: a desktop: no step, the example');
		await page.click('#bSkip');
		check(await view(page) === 'play' && !!(await page.evaluate(() => window.__wortnetz.state().intro)), 'first run: "Überspringen": today\'s puzzle, done');
		await ctx.close();
	}
	{
		// a browser that played 0.1 (solves, no first-run mark): no first run
		const st = JSON.parse(stateWith(['2026-11-19'])); st.intro = null;
		const { ctx, page } = await open({ state: JSON.stringify(st) });
		check(await view(page) === 'play' && (await W(page)).date === TODAY, 'first run: not for a browser that played before');
		await ctx.close();
	}
}

// ---------- the boards run out (done means 8) ----------
if (part('runout')) {
	const soon = addDays(LAST, -30), quiet = addDays(LAST, -31), after = addDays(LAST, 1);
	let o = await open({ time: at(quiet), state: stateWith([quiet]) });
	check(await view(o.page) === 'end' && !(await vis(o.page, '#eSoon')), `run-out: ${quiet}, 31 days before the end: no notice`);
	await o.ctx.close();
	o = await open({ time: at(soon), state: stateWith([soon]) });
	check(await vis(o.page, '#eSoon') && (await txt(o.page, '#eSoon')) === `Neue Rätsel kommen bald. Die jetzigen reichen bis zum ${+LAST.slice(8)}.${+LAST.slice(5, 7)}.${LAST.slice(0, 4)}.`, `run-out: ${soon}, 30 days before: the quiet line on the end screen`, await txt(o.page, '#eSoon'));
	await o.page.click('#end [data-open="archive"]');
	check((await txt(o.page, '.sheet')).includes('Neue Rätsel kommen bald'), 'run-out: … and in the archive');
	await o.page.screenshot({ path: `${SHOTS}/runout-soon-390.png`, fullPage: true });
	await o.ctx.close();
	o = await open({ time: at(after), state: stateWith() });
	check(await view(o.page) === 'over' && (await txt(o.page, '#over')).includes('Alle Rätsel gespielt'), `run-out: ${after}, after the last day: the message instead of the board`);
	await o.page.screenshot({ path: `${SHOTS}/runout-over-390.png` });
	await o.page.click('#over [data-open="archive"]');
	const days = await o.page.$$eval('.day', b => b.map(x => x.dataset.day));
	check(days[0] === LAST && days.length === DAYS.size, 'run-out: the archive still opens, every day in it', `${days.length}`);
	await o.page.click(`[data-day="${LAST}"]`);
	check(await view(o.page) === 'play' && (await W(o.page)).date === LAST, 'run-out: an archive day plays');
	check(!o.errors.length, 'run-out: no errors', o.errors.join(' | '));
	await o.ctx.close();
}

// ---------- offline and updates (done means 9): releases as git archive makes them ----------
const BUILDS = '/tmp/wortnetz-builds';
function build(commit) {
	const dir = join(BUILDS, commit);
	for (const f of ['index.html', 'app.css', 'icon.svg', 'manifest.json', 'config.json', 'sw.js', 'icons', 'src', 'vendor', 'puzzles']) cpSync(join(REPO, f), join(dir, f), { recursive: true });
	for (const f of ['sw.js', 'src/build.js']) writeFileSync(join(dir, f), readFileSync(join(dir, f), 'utf8').replace('$Format:%h$', commit).replace('$Format:%cs$', '2026-11-20'));
	writeFileSync(join(dir, 'app.css'), `${readFileSync(join(dir, 'app.css'), 'utf8')}\n/* build ${commit} */\n`);
	return dir;
}
const swReady = page => page.waitForFunction(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.state === 'activated', null, { timeout: 15000 }).then(() => true, () => false);
const css = page => page.evaluate(() => fetch('app.css').then(r => r.text()).then(t => (t.match(/build (\w+)/) || [])[1]));
const cacheNames = page => page.evaluate(() => caches.keys());
const versionLine = async page => { await page.click('.hdr [data-open="help"]'); const v = await txt(page, '.ver'); await page.click('[data-close]'); return v; };
const waiting = page => page.waitForFunction(() => navigator.serviceWorker.getRegistration().then(r => !!(r && r.waiting)), null, { timeout: 15000, polling: 200 }).then(() => true, () => false);
const askUpdate = page => page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
// ---------- what storage holds or refuses: a stored game that can't go on, a save refused ----------
if (part('storage')) {
	const day = DAYS.get(TODAY);
	const started = '2026-11-27T08:00:00.000Z';
	const t = Object.keys(day.targets);
	const plant = snap => stateWith([], { current: { [day.id]: snap } });
	const kept = page => page.evaluate(id => (JSON.parse(localStorage.getItem('wortnetz.state')).current || {})[id] || null, day.id);
	const logged = page => page.evaluate(() => localStorage.getItem('wortnetz.errors') || '');
	{
		// junk in the fields: the game resumes with what holds, the rest dropped
		const { ctx, page, errors } = await open({ state: plant({ startedAt: started, run: 30000, found: [t[0], 'NICHTDA'], foundAt: { [t[0]]: 5000 }, bonus: [], hints: 9, events: 5, pausedBy: null }) });
		const st = await W(page);
		check(await view(page) === 'play' && st && st.startedAt === started && JSON.stringify(st.found) === JSON.stringify([t[0]]) && st.hints === 0 && Array.isArray(st.events) && st.pausedBy === 'reload', 'storage: a stored game with junk resumes, paused, with only what holds', st && JSON.stringify({ found: st.found, hints: st.hints }));
		check(!errors.length, 'storage: … without errors', errors.join(' | '));
		await ctx.close();
	}
	for (const [what, snap] of [['solved', { startedAt: started, solved: true }], ['nothing left to find', { startedAt: started, found: t }], ['no start time', { startedAt: '1', events: 5 }]]) {
		const { ctx, page, errors } = await open({ state: plant(snap) });
		const st = await W(page);
		check(await view(page) === 'play' && st && !st.startedAt && st.found.length === 0 && !(await kept(page)) && (await logged(page)).includes('restore'), `storage: a stored game that can't go on (${what}): dropped, logged, the board opens fresh`);
		check(!errors.length, `storage: … (${what}) without errors`, errors.join(' | '));
		await ctx.close();
	}
	{
		// a save the browser refuses: told once, again only after a save worked in between
		const SAY = 'Nicht gespeichert: Der Browser nimmt nichts mehr an. Einstellungen, Backup, Exportieren sichert deine Lösungen.';
		const { ctx, page } = await open({ ctx: { isMobile: true, hasTouch: true }, state: stateWith() });
		const fill = () => page.evaluate(() => {
			let lo = 0, hi = 16 << 20;
			localStorage.removeItem('ui-check.filler');
			while (lo < hi) {
				const mid = (lo + hi + 1) >> 1;
				try { localStorage.setItem('ui-check.filler', 'x'.repeat(mid)); lo = mid; } catch { hi = mid - 1; }
			}
			localStorage.setItem('ui-check.filler', 'x'.repeat(lo));
		});
		const shown = async () => { const v = await vis(page, '#toast'), x = await txt(page, '#toast'); await page.evaluate(() => { document.getElementById('toast').hidden = true; }); return v ? x : ''; };
		const words = Object.values(day.targets);
		await page.evaluate(() => { document.getElementById('toast').hidden = true; });
		await fill();
		await drag(page, words[0].paths[0]);
		const first = await shown();
		check(first === SAY && await page.evaluate(() => document.getElementById('toast').classList.contains('warn')), 'storage: a refused save shows the warning', first);
		await drag(page, words[1].paths[0]);
		check(await shown() === '', 'storage: the next refused save shows nothing');
		await page.evaluate(() => localStorage.removeItem('ui-check.filler'));
		await drag(page, words[2].paths[0]);
		check(await shown() === '' && (await kept(page)), 'storage: room again: the save works, no warning');
		await fill();
		await drag(page, words[3].paths[0]);
		check(await shown() === SAY, 'storage: full again: the warning once more');
		await ctx.close();
	}
}

if (part('offline')) {
	rmSync(BUILDS, { recursive: true, force: true });
	const A = build('aaaaaaa'), B = build('bbbbbbb'), C = build('ccccccc');
	ROOT = A;
	const { ctx, page, errors } = await open({ ctx: { isMobile: true, hasTouch: true }, state: stateWith() });
	check(await swReady(page), 'offline: the worker controls the page after one load');
	const keys = await page.evaluate(() => caches.open('wortnetz-aaaaaaa').then(c => c.keys()).then(k => k.map(r => new URL(r.url).pathname)));
	const want = index.batches.map(b => `/wortnetz/puzzles/${b.file}`);
	check(want.every(k => keys.includes(k)) && keys.includes('/wortnetz/src/ui/app.js') && keys.includes('/wortnetz/index.html'), `offline: every batch and file in the release's cache (${keys.length})`);
	await ctx.setOffline(true);
	await page.reload();
	await ready(page);
	check(await view(page) === 'play' && (await W(page)).date === TODAY, 'offline: with the network off the page opens today\'s puzzle');
	await page.click('.gbar [data-open="archive"]');
	await page.click('[data-day="2026-11-19"]');
	check((await W(page)).date === '2026-11-19', 'offline: … and a day of the first batch from the archive');
	await page.click('.gbar [data-open="archive"]');
	await page.click(`[data-day="${TODAY}"]`);
	await ctx.setOffline(false);
	// a game runs; a new release comes
	const words = Object.entries((await W(page)).targets);
	await drag(page, words[0][1].paths[0]);
	ROOT = B;
	await askUpdate(page);
	check(await waiting(page), 'update: the new release installs and waits');
	await page.waitForTimeout(300);
	check(!(await vis(page, '#toast')), 'update: no toast while a game runs');
	check(await css(page) === 'aaaaaaa', 'update: meanwhile every file still comes from the running release');
	for (const [, t] of words.slice(1)) if (!(await W(page)).solved) await drag(page, t.paths[0]);
	await page.waitForTimeout(1200);
	check(await view(page) === 'end' && await vis(page, '#toast [data-act="toast"]') && (await txt(page, '#toast')).includes('Neue Version da.') && (await txt(page, '#toast')).includes('Neu laden'), 'update: the game solved, the toast "Neue Version da." with "Neu laden"');
	await page.screenshot({ path: `${SHOTS}/update-toast-390.png` });
	await Promise.all([page.waitForEvent('load'), page.click('#toast [data-act="toast"]')]);
	await ready(page);
	check((await txt(page, '#toast')).includes('Neue Version geladen.'), '"Neu laden": then the toast "Neue Version geladen."', await txt(page, '#toast'));
	check((await txt(page, '#foot')).includes(`wortnetz ${VERSION} · bbbbbbb · 2026-11-20`), 'the foot of the page: version, commit, date (as xxl-scorer)', await txt(page, '#foot'));
	check(await css(page) === 'bbbbbbb' && (await versionLine(page)).includes('bbbbbbb'), '"Neu laden": the new release, page and files');
	check(JSON.stringify(await cacheNames(page)) === '["wortnetz-bbbbbbb"]', '"Neu laden": the old release\'s cache is gone', JSON.stringify(await cacheNames(page)));
	check(Object.keys(await page.evaluate(() => window.__wortnetz.state().solves)).length === 1, 'update: the solve is kept');
	// ignored: the next start takes it. A start is the app opened again after it was closed (the
	// page gone); a mere reload may take it too (src/ui/update.js), Chromium doesn't always let it
	ROOT = C;
	await askUpdate(page);
	check(await waiting(page), 'update: another release waits');
	await page.close();
	await new Promise(r => setTimeout(r, 2000));	// closed for a moment, as an app between two days
	const page2 = await ctx.newPage();
	page2.on('pageerror', e => errors.push(`pageerror ${e.message}`));
	await page2.goto(BASE);
	await ready(page2);
	const next = { css: await css(page2), ver: await versionLine(page2), caches: await cacheNames(page2) };
	check(next.css === 'ccccccc' && next.ver.includes('ccccccc') && JSON.stringify(next.caches) === '["wortnetz-ccccccc"]', 'update: ignored, the next start takes it, all of it', JSON.stringify(next));
	check(Object.keys(await page2.evaluate(() => window.__wortnetz.state().solves)).length === 1 && await view(page2) === 'end', 'update: … with the solve, on its end screen');
	check((await txt(page2, '#toast')).includes('Neue Version geladen.'), 'update: … and says "Neue Version geladen."');
	// a release found while the page is still starting (a reload on an iPhone):
	// it takes over without flashing "Neue Version da." first
	await page2.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
		const t = document.getElementById('toast');
		new MutationObserver(() => { if (!t.hidden) sessionStorage.setItem('toasts', `${sessionStorage.getItem('toasts') || ''}|${t.textContent}`); }).observe(t, { attributes: true, childList: true, subtree: true });
	}));
	await page2.waitForTimeout(3500);
	ROOT = build('ddddddd');
	await page2.reload();
	await page2.waitForTimeout(6000);
	await ready(page2);
	const toasts = await page2.evaluate(() => sessionStorage.getItem('toasts') || '');
	check(!toasts.includes('Neue Version da.'), 'update: found at the start, no "Neue Version da." flash', toasts);
	const took = await css(page2);
	check(took === 'ddddddd' ? toasts.includes('Neue Version geladen.') : took === 'ccccccc', `update: found at the start, ${took === 'ddddddd' ? 'it took over and said so' : 'held back by Chromium, the old release whole'}`, `${took} ${toasts}`);
	check(!errors.length, 'offline and updates: no errors in the console', errors.join(' | '));
	await ctx.close();
	ROOT = REPO;
}

// ---------- the Berlin date at midnight; before the first day ----------
if (part('dates')) {
	const { ctx, page } = await open({ time: new Date('2026-11-26T23:30:00Z'), state: stateWith() });	// 00:30 in Berlin
	check((await W(page)).date === '2026-11-27', 'play: 00:30 in Berlin is already the next puzzle (UTC still says the 26th)');
	await ctx.close();
	const b = await open({ time: new Date('2026-11-18T12:00:00Z'), state: stateWith() });
	check((await txt(b.page, '#msg')).includes('Das erste Rätsel kommt am 19.11.'), 'play: before the first day the page says when it starts');
	await b.ctx.close();
}

await browser.close();
server.close();
writeFileSync(`${SHOTS}/result.txt`, `${n - fails} of ${n}\n`);
console.log(`\nui-check: ${n - fails} of ${n} ok`);
process.exit(fails);
