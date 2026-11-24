// wortnetz 0.2: the page. The game itself is src/core/game.js; this file draws it, takes the
// finger, keeps what lasts (src/core/records.js through ./store.js), and holds the sheets:
// archive, help, settings with Backup and the debug report, and 0.2's
// plain end screen, the first run, larger type, haptics,
// offline with updates, the notice before the boards run out.

import * as g from '../core/game.js';
import { expected, factorOf, ratios, fmt } from '../core/timing.js';
import { berlinDate, dayMap, reached, streak, shortDay, runOut, longDate } from '../core/days.js';
import * as rec from '../core/records.js';
import { backupFileName } from '../core/filename.js';
import { homeScreenStep, isIPad } from '../core/platform.js';
import { loadState, saveState, storageOk, errorStore } from './store.js';
import { haptic, KIND as HAPTICS } from './haptics.js';
import { startIntro } from './intro.js';
import * as upd from './update.js';
import { startErrorLog, environment, jsFeatures, layoutFacts, saveFile } from '../../vendor/xxl-scorer/src/ui/debug.js';
import { makeReport, reportFileName } from '../../vendor/xxl-scorer/src/core/debugreport.js';
import { imprintLink } from '../../vendor/xxl-scorer/src/core/imprint.js';
import { buildInfo } from '../build.js';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const now = () => performance.now();
const errorLog = startErrorLog(errorStore);
/** the game wortnetz is made after, named in "So geht's": a link the player may follow, no request of the page */
const ORIGINAL = 'https://pzlgames.com/games/zanagrams/';

// ---------- state ----------
let ST = loadState();
let DAYS = new Map();	// date -> puzzle
let TODAY = berlinDate();
let G = null;	// the game on the board
let day = null;	// its puzzle
let endG = null;	// what the end screen shows
let view = 'play';	// play | end | over | intro
let rot = 0, VIEW = g.rotation(0).view, CELL = g.rotation(0).cell;
let vis = { nodes: new Set(), edges: new Set() };
let path = [], tracing = false, tapping = false, down = 0, backs = 0, lastPt = null, flashP = null;
let sayT = null;
let CONFIG = {};
let intro = null;	// the first run while it shows
let updateReady = false;

/** a refused save is told once, and again only after a save worked in between */
let refusalTold = false;
function save() {
	if (saveState(ST)) { refusalTold = false; return; }
	errorLog.add('storage', 'localStorage refused the save');
	if (refusalTold) return;
	refusalTold = true;
	toast('Nicht gespeichert: Der Browser nimmt nichts mehr an. Einstellungen, Backup, Exportieren sichert deine Lösungen.', { warn: true });
}
/** the running game kept for a reload, and its record for the debug report */
function persist() {
	if (!G || !G.startedAt) return;
	if (G.solved) delete ST.current[G.puzzle];
	else ST.current[G.puzzle] = g.snapshot(G, now());
	save();
}
const gameRecord = G => ({ id: G.id, puzzle: G.puzzle, date: G.date, startedAt: G.startedAt, replay: G.replay, solved: G.solved, final: G.final, active: G.active, found: G.found.length, of: Object.keys(G.p.targets).length, bonus: G.bonus, hints: g.HINTS - G.hints, events: G.events });
const tick = what => haptic(what, ST.settings.vibration);

// ---------- puzzles, the site's config ----------
async function loadPuzzles() {
	const idx = await (await fetch('puzzles/index.json', { cache: 'no-cache' })).json();
	const batches = [];
	for (const b of idx.batches || []) {
		const r = await fetch(`puzzles/${encodeURIComponent(b.file)}`, { cache: 'no-cache' });
		if (r.ok) batches.push(await r.json());
	}
	DAYS = dayMap(batches);
}
const puzzleNo = date => [...DAYS.keys()].indexOf(date) + 1;
/** config.json, then the site's own local/config.json (the Impressum link): later wins */
async function loadConfig() {
	for (const url of ['config.json', 'local/config.json']) {
		try {
			const r = await fetch(url, { cache: 'no-cache' });
			if (r.ok) CONFIG = { ...CONFIG, ...(await r.json()) };
		} catch { /* no config: the defaults */ }
	}
}

/** "wortnetz 0.2 · commit · date · Impressum": in "So geht's" and at the page's foot (as xxl-scorer's) */
function verLine(id) {
	const b = buildInfo();
	const link = imprintLink(CONFIG);
	return `wortnetz ${esc(b.version)}${b.commit ? ` · ${esc(b.commit)}` : ''}${b.date ? ` · ${esc(b.date)}` : ''}${link ? ` · <a${id ? ` id="${id}"` : ''} href="${esc(link.href)}" target="_blank" rel="noopener nofollow">${esc(link.label)}</a>` : ''}`;
}

// ---------- larger type ----------
/** the text size against iOS's default (17 pt = 1): the root font follows Dynamic Type (app.css) */
const textScale = () => (parseFloat(getComputedStyle(document.documentElement).fontSize) || 17) / 17;
/** the tiles: letters grow up to 1.35 times, circles up to 1.15 (else the short lines between them vanish) */
function tileSizes() {
	const s = Math.max(1, textScale());
	return { r: Math.round(34 * Math.min(1.15, s) * 10) / 10, fs: Math.round(34 * Math.min(1.35, s) * 10) / 10 };
}
let drawnScale = 0;

// ---------- drawing the board ----------
const svg = $('board');
let lineEls = {}, tileEls = [], traceG = null;
const XY0 = c => [50 + 100 * (c % 4), 50 + 100 * Math.floor(c / 4)];
const XY = i => XY0(VIEW[i]);

function setAttrs(el, a) { for (const [k, v] of Object.entries(a)) el.setAttribute(k, v); return el; }
function draw() {
	svg.replaceChildren(); lineEls = {}; tileEls = [];
	if (!G) return;
	const { r, fs } = tileSizes();
	drawnScale = textScale();
	const gl = document.createElementNS(NS, 'g'); svg.append(gl);
	for (const [a, b] of G.p.edges) {
		const [x1, y1] = XY(a), [x2, y2] = XY(b);
		const l = setAttrs(document.createElementNS(NS, 'line'), { x1, y1, x2, y2, class: 'ln' });
		gl.append(l); lineEls[g.ek(a, b)] = l;
	}
	traceG = document.createElementNS(NS, 'g'); svg.append(traceG);
	G.p.letters.forEach((ch, i) => {
		const [x, y] = XY(i);
		const t = setAttrs(document.createElementNS(NS, 'g'), { class: 'tile' });
		t.append(setAttrs(document.createElementNS(NS, 'circle'), { cx: x, cy: y, r }));
		t.append(setAttrs(document.createElementNS(NS, 'circle'), { class: 'ring', cx: x, cy: y, r: r + 7 }));
		const tx = setAttrs(document.createElementNS(NS, 'text'), { x, y: y + 1, 'font-size': fs });
		tx.textContent = ch; t.append(tx);
		svg.append(t); tileEls.push(t);
	});
}

function render() {
	if (!G) return;
	for (const [k, l] of Object.entries(lineEls)) l.classList.toggle('gone', !vis.edges.has(k));
	tileEls.forEach((t, i) => { t.classList.toggle('gone', !vis.nodes.has(i)); t.classList.toggle('on', path.includes(i)); });
	traceG.replaceChildren();
	// while a word flashes, its line stays, in the flash colour
	const tp = path.length ? path : flashP ? flashP.p : [];
	const tc = path.length || !flashP ? 'tr' : `tr ${flashP.cls}`;
	for (let k = 1; k < tp.length; k++) {
		const [x1, y1] = XY(tp[k - 1]), [x2, y2] = XY(tp[k]);
		traceG.append(setAttrs(document.createElementNS(NS, 'line'), { x1, y1, x2, y2, class: tc }));
	}
	const ht = g.hintTiles(G);	// the ring only (a number looked out of place); the word bar shows the order
	tileEls.forEach((t, i) => t.classList.toggle('h', ht.includes(i)));
	const left = Object.keys(G.p.targets).length - G.found.length;
	$('left').textContent = left ? `Noch ${left} ${left === 1 ? 'Wort' : 'Wörter'}` : 'Gelöst!';
	$('hintN').textContent = G.hints;
	$('hintN').classList.toggle('zero', !G.hints);
	$('chips').replaceChildren(...G.found.map(w => chip(w, '')), ...G.bonus.map(w => chip(w, 'b')));
	// a new board stays covered until tapped: the clock starts when the letters show
	const covered = !G.solved && (!!G.pausedBy || !G.startedAt);
	$('app').classList.toggle('paused', covered);
	$('pausecard').querySelector('b').textContent = G.startedAt ? 'Pause' : 'Start';
	$('pausecard').querySelector('span').textContent = G.startedAt ? 'Tippen zum Weiterspielen' : 'Tippen zum Starten';
	showClock();
}
function chip(w, cls) { const s = document.createElement('span'); s.className = `chip ${cls}`; s.textContent = w; return s; }

function showClock() {
	const c = $('clock'), hide = ST.settings.hideTime;
	c.classList.toggle('notime', hide);
	c.classList.toggle('idle', !hide && (!G || !G.startedAt));
	$('ctime').hidden = hide;
	if (!hide && G) $('ctime').textContent = fmt(g.clockMs(G, now()));
	c.disabled = !G || !G.startedAt || G.solved;
	const label = G && G.pausedBy ? 'Weiter' : 'Pause';
	c.setAttribute('aria-label', label); c.title = label;
}
setInterval(() => { if (G && G.startedAt && !G.solved && !ST.settings.hideTime) $('ctime').textContent = fmt(g.clockMs(G, now())); }, 250);

// ---------- the word bar ----------
function say(word, msg, cls, keep) {
	clearTimeout(sayT);
	const w = $('word'), m = $('msg');
	w.textContent = word; w.className = `word${word ? ` ${cls}` : ''}`;
	m.textContent = msg; m.className = `msg ${cls || ''}`;
	if (!keep && cls) sayT = setTimeout(hintBar, 1400);
}
function hintBar() {
	if (!G) return;
	if (G.hintW && !G.found.includes(G.hintW) && !G.solved) {
		const w = G.hintW;
		say(w.slice(0, G.hintK) + '·'.repeat(w.length - G.hintK), `Tipp: ${w.length} Buchstaben`, 'hint', true);
	} else if (!G.events.some(e => e.ty === 'word')) say('', 'Zieh den Finger über die Buchstaben', '', true);
	else say('', '', '', true);
}

// ---------- views ----------
function showView(v) {
	view = v;
	for (const id of ['play', 'end', 'over', 'intro']) $(id).hidden = id !== v;
	$('gbar').hidden = v !== 'play';
	const inIntro = v === 'intro';
	document.querySelectorAll('.hdr > [data-open]').forEach(b => { b.hidden = inIntro; });
	if (!inIntro) $('bSkip').hidden = true;
	if (v !== 'end') endG = null;
	offerUpdate();
}
const dayLabel = date => (date === TODAY ? shortDay(date) : `${shortDay(date)} · Archiv`);

// ---------- opening a day ----------
function openDay(date, { fresh = false } = {}) {
	const p = DAYS.get(date);
	if (!p) return;
	if (G && G.puzzle !== p.id) leaveGame();
	day = p;
	$('day').textContent = dayLabel(date);
	const snap = ST.current[p.id];
	const solve = ST.solves[p.id];
	if (!fresh && snap) {
		// an unfinished game that can't go on is dropped: the day's board opens either way
		let back = null;
		try { back = g.restore(snap, p); if (back) showGame(back); } catch (err) { back = null; errorLog.add('restore', err && err.message); }
		if (back) return;
		errorLog.add('restore', `unfinished game of ${p.id} dropped`);
		delete ST.current[p.id];
		save();
	}
	if (!fresh && solve) { G = null; showStored(p, solve); return; }
	showGame(g.newGame(p, { id: gameId(), replay: !!solve }));
}
function showGame(game) {
	G = game;
	rot = 0; ({ view: VIEW, cell: CELL } = g.rotation(0));
	vis = g.visible(G); path = []; tracing = tapping = false; flashP = null;
	showView('play'); draw(); render(); hintBar();
	if (G.pausedBy) say('', '', '', true);
}
const gameId = () => `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;

/** today's puzzle; after the last day of the boards a message instead, the archive still open */
function openToday() {
	if (DAYS.has(TODAY)) { openDay(TODAY); return; }
	if (runOut(DAYS, TODAY).state === 'over') {
		if (G) leaveGame();
		G = null; day = null;
		$('day').textContent = shortDay(TODAY);
		showView('over');
		return;
	}
	const first = [...DAYS.keys()][0];
	showView('play');
	say('', first ? `Das erste Rätsel kommt am ${+first.slice(8, 10)}.${+first.slice(5, 7)}.` : 'Keine Rätsel gefunden.', '', true);
}

function leaveGame() {
	if (!G) return;
	if (G.startedAt && !G.solved) {
		g.pause(G, 'leave', now());
		g.leave(G, now());
		ST.current[G.puzzle] = g.snapshot(G, now());
		save();
	}
}

// ---------- the clock, pause ----------
function startClock() {
	if (!G || G.startedAt) return;
	g.start(G, now());
	if (!G.replay && !ST.started[G.puzzle]) ST.started[G.puzzle] = G.startedAt;
	persist(); showClock();
}
function pause(why) {
	if (!G) return false;
	if (tracing || tapping) { tracing = tapping = false; path = []; }
	const did = g.pause(G, why, now());
	if (did) { persist(); render(); }
	return did;
}
function resume() {
	if (!G || !G.pausedBy || G.pausedBy === 'solved') return;
	if (g.resume(G, now())) { persist(); render(); hintBar(); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause('hidden'); persist(); } });
addEventListener('pagehide', () => persist());
$('clock').addEventListener('click', () => { if (!G || !G.startedAt || G.solved) return; if (G.pausedBy) resume(); else pause('clock'); });
$('pausecard').addEventListener('click', () => {
	if (G && !G.startedAt && !G.solved) { startClock(); render(); hintBar(); return; }
	resume();
});

// ---------- tracing and tapping ----------
function pt(e) {
	const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
	const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y];
}
function tileAt(x, y) {
	const c = Math.round((x - 50) / 100), r = Math.round((y - 50) / 100);
	if (c < 0 || c > 3 || r < 0 || r > 3) return -1;
	const [cx, cy] = XY0(r * 4 + c);
	return Math.hypot(x - cx, y - cy) <= 40 ? CELL[r * 4 + c] : -1;
}
const traced = () => say(g.word(G, path), '', 'trace', true);
svg.addEventListener('pointerdown', e => {
	if (!G || G.solved || G.pausedBy) return;
	const [x, y] = pt(e); const i = tileAt(x, y);
	if (i < 0 || !vis.nodes.has(i)) return;
	if (!G.startedAt) return;	// covered until the start card is tapped
	if (tapping) {
		const t = g.tap(vis, path, i);
		if (t.act === 'send') { tracing = true; finish(); return; }
		if (t.act === 'back') { path = t.path; backs++; traced(); render(); return; }
		if (t.act === 'add') { path = t.path; tick('letter'); traced(); render(); return; }
		tapping = false;	// a letter that doesn't continue: a new word starts there
	}
	svg.setPointerCapture(e.pointerId);
	tracing = true; path = [i]; backs = 0; down = g.activeMs(G, now()); lastPt = [x, y];
	tick('letter'); traced(); render();
});
svg.addEventListener('pointermove', e => {
	if (!tracing) return;
	const [x, y] = pt(e); const [x0, y0] = lastPt;
	const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / 8));
	const before = path.join(), len = path.length;
	for (let k = 1; k <= n; k++) {
		const r = g.extend(vis, path, tileAt(x0 + (x - x0) * k / n, y0 + (y - y0) * k / n));
		if (r.back) backs++;
		path = r.path;
	}
	lastPt = [x, y];
	if (path.length > len) tick('letter');
	if (path.join() !== before) { traced(); render(); }
});
svg.addEventListener('pointerup', () => finish());
svg.addEventListener('pointercancel', () => finish());

const PRAISE = ['Schönes Wort!', 'Prima!', 'Stark!', 'Weiter so!', 'Sehr gut!'];
function finish() {
	if (!tracing) return;
	tracing = false;
	if (path.length === 1 && !tapping) { tapping = true; return; }	// a tap: the word goes on with taps
	const p = path.slice(); path = [];
	const tap = tapping; tapping = false;
	if (p.length === 1) { render(); hintBar(); return; }
	const r = g.submit(G, p, now(), { down, backs, tap });
	if (r.res === 'short') { say(r.w, 'Mindestens 4 Buchstaben', 'bad'); flash(p, 'no'); }
	else if (r.res === 'dup') say(r.w, 'Schon gefunden', 'dup');
	else if (r.res === 'target') {
		say(r.w, G.found.length === 1 ? 'Guter Anfang!' : r.left === 0 ? 'Gelöst!' : r.w.length >= 8 ? 'Großartig!' : PRAISE[Math.floor(Math.random() * PRAISE.length)], 'good');
		flash(p, 'ok', () => { vis = g.visible(G); render(); });
	} else if (r.res === 'bonus') {
		say(r.w, 'Extrawort (−10 s)', 'bonus'); flash(p, 'bo');
		if (!ST.settings.hideTime) {
			const f = document.createElement('span'); f.className = 'flash'; f.textContent = '−10 s';
			$('clock').append(f); setTimeout(() => f.remove(), 1400);
		}
	} else { say(r.w, 'Nicht in der Wortliste', 'bad'); flash(p, 'no'); }
	tick(r.res === 'target' ? 'found' : r.res === 'bonus' ? 'bonus' : 'wrong');
	persist();
	render();
	if (r.solved) solved();
}
function flash(p, cls, then) {
	p.forEach(i => tileEls[i].classList.add(cls));
	const me = flashP = { p, cls }; render();
	setTimeout(() => {
		p.forEach(i => tileEls[i] && tileEls[i].classList.remove(cls));
		if (flashP === me) flashP = null;
		if (then) then(); else render();
	}, 450);
}

// ---------- hint, rotate ----------
$('bHint').addEventListener('click', () => {
	if (!G || G.solved || G.pausedBy || !G.startedAt) return;
	if (!G.hints) { say('', 'Keine Tipps mehr', 'bad'); return; }
	g.hint(G, now());
	persist(); render(); hintBar();
});
$('bRotate').addEventListener('click', () => {
	if (!G || G.solved || tracing || G.pausedBy || !G.startedAt) return;
	rot = (rot + 1) % 4; ({ view: VIEW, cell: CELL } = g.rotation(rot));
	draw(); render();
	svg.classList.remove('turn'); void svg.getBoundingClientRect(); svg.classList.add('turn');
	g.rotated(G, rot, now()); persist();
});

// ---------- solved: the end screen (0.2: variant A with Details) ----------
function solved() {
	const done = G;
	const pre = rec.factorNow(ST);
	if (!done.replay && !ST.solves[done.puzzle]) {
		const at = new Date();
		const { ratio, ratioActive } = ratios(done.p, done.final, done.active);
		rec.addSolve(ST, {
			puzzle: done.puzzle, date: done.date, at: at.toISOString(), ms: done.final, active: done.active,
			hints: g.HINTS - done.hints, tries: done.tries, found: done.found, foundAt: done.foundAt, bonus: done.bonus,
			ratio, ratioActive, factorBefore: pre, onTime: done.date === berlinDate(at),
		});
	}
	delete ST.current[done.puzzle];
	rec.keepGame(ST, gameRecord(done));
	save();
	setTimeout(() => { if (G === done) showEnd({ ...solveView(done), factorBefore: pre }); }, 900);
}
const solveView = G => ({ p: G.p, date: G.date, found: G.found, foundAt: G.foundAt, bonus: G.bonus, hints: g.HINTS - G.hints, tries: G.tries, final: G.final, replay: G.replay });
function showStored(p, s) {
	showEnd({ p, date: p.date, found: s.found, foundAt: s.foundAt, bonus: s.bonus || [], hints: s.hints || 0, tries: s.tries || 0, final: s.ms, stored: true, at: s.at, factorBefore: s.factorBefore || { f: 1, n: 0 } });
}

let endView = 'table';
const plural = (n, one, many) => (n === 1 ? one : many);
function showEnd(e) {
	showView('end');
	endG = e;
	$('day').textContent = dayLabel(e.date);
	const hide = ST.settings.hideTime;
	const on = e.stored && e.at ? (() => { const d = berlinDate(new Date(e.at)); return `am ${+d.slice(8, 10)}.${+d.slice(5, 7)}.`; })() : '';
	if (hide) {
		$('eTitle').textContent = e.replay ? 'Wiederholung' : on ? `Gelöst ${on}` : '';
		$('eTime').textContent = 'Gelöst!';
	} else {
		$('eTitle').textContent = e.replay ? 'Wiederholung · gelöst in' : `Gelöst${on ? ` ${on}` : ''} in`;
		$('eTime').textContent = fmt(e.final);
	}
	const s = rec.stats(ST), days = streak(s.onTime, TODAY);
	$('eTiles').innerHTML = [[e.found.length, plural(e.found.length, 'Wort', 'Wörter')], [e.hints, plural(e.hints, 'Tipp', 'Tipps')], [days, plural(days, 'Tag Serie', 'Tage Serie')]].map(tileHtml).join('');
	$('eFound').innerHTML = e.found.map(w => `<span class="chip">${esc(w)}</span>`).join('') + e.bonus.map(w => `<span class="chip b">${esc(w)}</span>`).join('');
	const next = nextOpen(e.date);
	$('bNext').hidden = !next;
	$('bNext').dataset.date = next || '';
	const ro = runOut(DAYS, TODAY);
	$('eSoon').hidden = ro.state !== 'soon';
	$('eSoon').textContent = ro.state === 'soon' ? soonText(ro) : '';
	details();
	scrollTo(0, 0);
}
const soonText = ro => `Neue Rätsel kommen bald. Die jetzigen reichen bis zum ${longDate(ro.last)}.`;
/** behind "Details", remembered open or shut: expected times, the table or timeline, Extrawörter, the counts, "Von vorn" */
function details() {
	const e = endG; if (!e) return;
	const open = ST.settings.details, hide = ST.settings.hideTime;
	$('bDetails').setAttribute('aria-expanded', String(open));
	$('bDetails').classList.toggle('open', open);
	$('eDet').hidden = !open;
	if (!open) return;
	const fb = e.factorBefore || { f: 1, n: 0 };
	const ex = expected(e.p, fb.f);
	const diff = e.final - ex.total;
	$('eCmp').innerHTML = hide ? '' : `erwartet ${fmt(ex.total)}${fb.n ? ` <small>(Formel × ${fb.f.toFixed(2).replace('.', ',')}, aus ${fb.n} ${fb.n === 1 ? 'Spiel' : 'Spielen'})</small>` : ''} · `
		+ (Math.abs(diff) < 1000 ? 'genau im Plan' : diff < 0 ? `<b class="f">${fmt(-diff)} schneller</b>` : `<b class="l">${fmt(diff)} langsamer</b>`);
	$('eCmp').hidden = hide;
	$('eWordsH').textContent = hide ? 'Deine Wörter' : 'Deine Wörter und Zeiten';
	$('eView').hidden = hide;
	endWords();
	const unfound = e.p.bonus.filter(w => !e.bonus.includes(w));
	$('eBonus').innerHTML = `<h3>Extrawörter</h3>` + ((e.bonus.length || unfound.length)
		? `<div class="wl">${e.bonus.map(w => `<span class="b">${esc(w)}</span>`).join('')}${unfound.map(w => `<span>${esc(w)}</span>`).join('')}</div><p class="note">Orange: von dir gefunden. Grau: hätte es noch gegeben.</p>`
		: '<p class="note">Dieses Brett hat keine Extrawörter.</p>');
	const s = rec.stats(ST);
	$('eStats').innerHTML = [[s.played, 'Gespielt'], [s.solved, 'Gelöst'], [e.tries, 'Fehlversuche']].map(tileHtml).join('');
	$('eNote').textContent = e.stored ? 'Deine erste Lösung dieses Rätsels. „Von vorn“ spielt es noch einmal.' : e.replay ? 'Wiederholung: zählt nicht für Statistik und Faktor.' : '';
}
$('bDetails').addEventListener('click', () => { ST.settings.details = !ST.settings.details; save(); details(); });
const tileHtml = ([v, k]) => `<div class="st"><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div></div>`;
/** the next day to play: today if open, else the newest open day of the archive */
function nextOpen(cur) {
	for (const d of reached(DAYS, TODAY)) if (d !== cur && !ST.solves[DAYS.get(d).id]) return d;
	return null;
}

function endWords() {
	const e = endG; if (!e) return;
	const hide = ST.settings.hideTime;
	const ex = expected(e.p, (e.factorBefore || { f: 1 }).f);
	const ws = e.found.slice().sort((a, b) => (e.foundAt[a] ?? 0) - (e.foundAt[b] ?? 0));
	document.querySelectorAll('#eView button').forEach(b => b.classList.toggle('sel', b.dataset.v === endView));
	const box = $('eWords');
	if (hide || endView === 'table') {
		const head = hide ? '<tr><th>#</th><th>Wort</th></tr>' : '<tr><th>#</th><th>Wort</th><th>erwartet</th><th>du</th><th>±</th></tr>';
		box.innerHTML = `<table>${head}${ws.map((w, k) => {
			const d = (e.foundAt[w] ?? 0) - ex.at[w];
			const times = hide ? '' : `<td>${fmt(ex.at[w])}</td><td>${fmt(e.foundAt[w] ?? 0)}</td><td class="${d <= 0 ? 'fast' : 'slow'}">${d <= 0 ? '−' : '+'}${fmt(Math.abs(d))}</td>`;
			return `<tr><td class="n">${k + 1}</td><td class="w">${esc(w)}</td>${times}</tr>`;
		}).join('')}</table>`;
		return;
	}
	// the timeline: positions set through the style object (the policy allows no style attributes)
	const max = Math.max(e.final, ex.total, 1);
	const pc = ms => `${(100 * ms / max).toFixed(1)}%`;
	const div = (cls, txt) => { const d = document.createElement('div'); if (cls) d.className = cls; if (txt != null) d.textContent = txt; return d; };
	const legend = div('legend'); legend.innerHTML = '<span><i></i>du</span><span><i class="e"></i>erwartet</span>';
	const tl = div('tl');
	for (const w of ws) {
		const a = e.foundAt[w] ?? 0, b = ex.at[w];
		const row = div('tlrow');
		const track = div('track');
		const bar = div('bar'); bar.style.left = pc(Math.min(a, b)); bar.style.width = pc(Math.abs(a - b));
		const em = div('e'); em.style.left = pc(b);
		const y = div(`y${a > b ? ' slow' : ''}`); y.style.left = pc(a);
		track.append(bar, em, y);
		row.append(div('w', w), track);
		tl.append(row);
	}
	const axis = div('axis'); axis.append(div(), div());
	axis.lastChild.append(...[0, max / 2, max].map(t => { const s = document.createElement('span'); s.textContent = fmt(t); return s; }));
	box.replaceChildren(legend, tl, axis);
}
$('eView').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; endView = b.dataset.v; endWords(); });
$('bAgain').addEventListener('click', () => { if (endG) openDay(endG.date, { fresh: true }); });
$('bNext').addEventListener('click', () => { const d = $('bNext').dataset.date; if (d) openDay(d); });

// ---------- the first run ----------
/**
 * The welcome (Home Screen step in Safari on iPhone and iPad), the example puzzle, the tips.
 * @param {(() => void) | null} back where "So geht's" came from; null on the first run
 */
function showIntro(back = null) {
	const env = { ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints || 0, standalone: navigator.standalone === true || matchMedia('(display-mode: standalone)').matches };
	const home = !back && homeScreenStep(env);
	showView('intro');
	const finish = () => {
		intro = null;
		$('intro').replaceChildren();
		if (!ST.intro) { ST.intro = new Date().toISOString(); save(); }
		if (back) back(); else openToday();
	};
	$('bSkip').onclick = finish;
	intro = startIntro({
		root: $('intro'), home, ipad: isIPad(env),
		header: (text, skip) => { $('day').textContent = text; $('bSkip').hidden = !skip; },
		done: finish,
		haptic: tick,
		sizes: tileSizes,
	});
}

// ---------- sheets: archive, help, settings ----------
let sheetPaused = false;
function openSheet(kind) {
	sheetPaused = pause('menu');
	let h = '';
	const close = '<button class="ib" type="button" data-close aria-label="Schließen"><svg class="i" aria-hidden="true"><use href="#i-x"/></svg></button>';
	const ro = runOut(DAYS, TODAY);
	if (kind === 'settings') {
		const last = ST.lastExport ? new Date(ST.lastExport) : null;
		const lastTxt = last ? `Zuletzt gesichert: ${last.getDate()}.${last.getMonth() + 1}., ${last.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}.` : 'Noch nicht gesichert.';
		h = `<div class="top"><h2 id="sheetTitle">Einstellungen</h2>${close}</div>
		<div class="group"><h3>Spiel</h3>
			<label class="sw" for="sHide">Zeit ausblenden<input type="checkbox" id="sHide" ${ST.settings.hideTime ? 'checked' : ''}></label>
			<p class="note">Keine laufende Uhr beim Spielen, am Ende keine Zeiten. Gemessen wird trotzdem, damit „erwartet“ weiter lernt.</p>
			${HAPTICS ? `<label class="sw" for="sVib">Vibration<input type="checkbox" id="sVib" ${ST.settings.vibration ? 'checked' : ''}></label>
			<p class="note">Ein leichtes Tippen bei jedem Buchstaben und bei jedem Wort.</p>` : ''}
		</div>
		<div class="group"><h3>Backup</h3>
			<div class="two"><button class="btn" type="button" data-act="export"><svg class="i" aria-hidden="true"><use href="#i-down"/></svg>Exportieren</button><button class="btn" type="button" data-act="import"><svg class="i" aria-hidden="true"><use href="#i-up"/></svg>Importieren …</button></div>
			<p class="note" id="sLast">${esc(lastTxt)} Sichert deine Lösungen als Datei, zum Aufheben oder für ein anderes Gerät.</p>
			<label class="f" for="sFile">Dateiname<input type="text" id="sFile" placeholder="${rec.DEFAULT_FILE_NAME}" value="${esc(ST.settings.fileName)}" autocomplete="off" spellcheck="false" maxlength="100"></label>
			<p class="note">{date} wird zum Datum. Ohne {date} jedes Mal derselbe Name, die alte Datei wird ersetzt. Nächste Datei: <b id="sFileOut"></b></p>
		</div>
		<div class="group"><h3>Fehler melden</h3>
			<button class="btn" type="button" data-act="debug"><svg class="i" aria-hidden="true"><use href="#i-file"/></svg>Debug-Bericht sichern</button>
			<p class="note">Eine Datei mit deinen Spielen (Wörter, Zeiten, Tipps), Einstellungen, Gerät und den letzten Fehlern. Kein Name, keine Bilder.</p>
		</div>`;
	} else if (kind === 'archive') {
		const days = reached(DAYS, TODAY);
		const first = [...DAYS.keys()][0];
		h = `<div class="top"><h2 id="sheetTitle">Archiv</h2>${close}</div>
		<p class="note">Ein Rätsel pro Tag${first ? `, seit dem Start am ${+first.slice(8, 10)}.${+first.slice(5, 7)}.` : ''} Künftige Tage bleiben zu.</p>
		${ro.state === 'soon' ? `<p class="note">${esc(soonText(ro))}</p>` : ro.state === 'over' ? '<p class="note">Alle Rätsel gespielt. Neue kommen mit dem nächsten Update.</p>' : ''}
		<div class="days">${days.map(d => {
			const p = DAYS.get(d), s = ST.solves[p.id], c = ST.current[p.id];
			const st = s ? (ST.settings.hideTime ? 'gelöst' : `gelöst ${fmt(s.ms)}`) : c && c.startedAt ? 'läuft' : 'offen';
			const cur = day && day.id === p.id ? ' cur' : '';
			return `<button class="day${cur}" type="button" data-day="${d}"><span><b>${shortDay(d)}</b> <small>· Rätsel ${puzzleNo(d)}${p.easy ? ' · leicht' : ''}</small></span><small class="${s ? 'ok' : ''}">${st}</small></button>`;
		}).join('') || '<p class="note">Noch kein Tag erreicht.</p>'}</div>`;
	} else {
		h = `<div class="top"><h2 id="sheetTitle">So geht's</h2>${close}</div>
		<div class="group"><p class="text">Zieh den Finger über verbundene Buchstaben, mindestens 4. Oder tippe sie nacheinander an und den letzten noch einmal zum Abschicken. Jedes gefundene Wort macht Buchstaben und Linien frei, die kein anderes Wort mehr braucht.</p></div>
		<div class="group"><p class="text">Ein echtes Wort, das nicht gesucht ist, zählt als Extrawort und nimmt 10 Sekunden von der Uhr. Jeden Tag ein Rätsel; verpasste Tage im Archiv (Kalender). Auf die Uhr tippen hält sie an.</p></div>
		<button class="btn" type="button" data-act="example">Probierrätsel noch einmal</button>
		<div class="group"><p class="text">Gespeichert wird nur auf diesem Gerät. Einstellungen, Backup sichert deine Lösungen als Datei.</p></div>
		<div class="group"><p class="text">wortnetz ist eine deutsche Version von <a href="${ORIGINAL}" target="_blank" rel="noopener noreferrer nofollow">Zanagrams</a>, einem englischen Worträtsel von PZL games. Danke für die Idee! wortnetz ist ein Hobbyprojekt und nicht mit PZL games verbunden.</p></div>
		<p class="ver">${verLine('imprint')}</p>`;
	}
	$('sheet').innerHTML = h;
	$('scrim').hidden = false;
	if (kind === 'settings') wireSettings();
}
function closeSheet() {
	$('scrim').hidden = true;
	if (sheetPaused && G && G.pausedBy === 'menu') resume();
	sheetPaused = false;
}
function wireSettings() {
	const out = () => { $('sFileOut').textContent = backupFileName(ST.settings.fileName); };
	out();
	$('sHide').addEventListener('change', e => {
		ST.settings.hideTime = e.target.checked; save(); showClock();
		if (endG) showEnd(endG);
	});
	if ($('sVib')) $('sVib').addEventListener('change', e => { ST.settings.vibration = e.target.checked; save(); tick('letter'); });
	$('sFile').addEventListener('input', e => { ST.settings.fileName = e.target.value; save(); out(); });
}
$('scrim').addEventListener('click', e => { if (e.target === $('scrim')) closeSheet(); });

// ---------- Backup (in Settings since 0.2, without a dot) ----------
async function doExport() {
	const name = backupFileName(ST.settings.fileName);
	const file = new File([JSON.stringify(rec.backupJson(ST), null, '\t')], name, { type: 'application/json' });
	const ok = await saveFile(file);
	if (!ok) return;
	rec.markExported(ST); save();
	if ($('sLast')) { const d = new Date(ST.lastExport); $('sLast').textContent = `Zuletzt gesichert: ${d.getDate()}.${d.getMonth() + 1}., ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}. Sichert deine Lösungen als Datei, zum Aufheben oder für ein anderes Gerät.`; }
	toast(`Gesichert: ${name}`);
}
$('fImport').addEventListener('change', async e => {
	const f = e.target.files && e.target.files[0];
	e.target.value = '';
	if (!f) return;
	if (f.size > rec.BACKUP_MAX_BYTES) { toast(rec.BACKUP_TOO_BIG, { warn: true }); return; }
	let text;
	try { text = await f.text(); } catch (err) { toast('Datei nicht lesbar.', { warn: true }); return; }
	const b = rec.readBackup(text);
	if (!b.ok) { toast(b.error, { warn: true }); return; }
	importBackup(b);
});
/** an import acts at once; Undo in the toast takes it back (no dialog) */
function importBackup(b) {
	const before = JSON.stringify(ST);
	const r = rec.mergeBackup(ST, b);
	if (!ST.intro) ST.intro = new Date().toISOString();
	if (!saveState(ST)) {
		// the browser's storage is full (or refuses): nothing of the file stays, so no later save fails unseen
		errorLog.add('storage', 'import refused by localStorage, undone');
		ST = rec.cleanState(JSON.parse(before));
		save();
		toast('Zu groß für den Speicher dieses Browsers, nicht importiert.', { warn: true });
		return;
	}
	closeSheet();
	reopen();
	toast(`Importiert: ${r.added} neu${r.replaced ? `, ${r.replaced} ersetzt` : ''}${r.kept ? `, ${r.kept} schon da` : ''}.`, {
		action: { label: 'Rückgängig', run: () => { ST = rec.cleanState(JSON.parse(before)); save(); reopen(); toast('Import zurückgenommen.'); } },
	});
}
function reopen() {
	showClock();
	// a game in progress stays as it is; a fresh board or an end screen shows the day anew
	if (day && (!G || !G.startedAt || G.solved || endG)) openDay(day.date);
}

// ---------- the debug report ----------
const LAYOUT = ['.hdr', '.gbar', '.wordbar', 'svg.board', '.status', '.chips', '#end', '#intro', '.sheet', '.toast'];
async function debugReport() {
	const games = [...ST.games, ...Object.values(ST.current).map(s => ({ ...s, current: true }))];
	const pick = ty => games.flatMap(x => (x.events || []).filter(e => e.ty === ty).map(e => ({ game: x.id, puzzle: x.puzzle, ...e })));
	const solves = rec.solvesInOrder(ST);
	const report = makeReport({
		app: 'wortnetz',
		build: buildInfo(),
		env: { ...(await environment()), localStorageOk: storageOk(), standalone: navigator.standalone === true || matchMedia('(display-mode: standalone)').matches, haptics: HAPTICS, textScale: Math.round(textScale() * 100) / 100, sw: upd.swState() },
		layout: { ...layoutFacts({ elements: LAYOUT, css: ['color: color-mix(in srgb, red 50%, blue)', 'height: 1dvh', 'text-wrap: balance', 'font: -apple-system-body'] }), js: jsFeatures() },
		errors: errorLog.entries(),
		sections: {
			today: TODAY,
			showing: { date: day ? day.date : null, puzzle: day ? day.id : null, view, rotation: rot, paused: G ? G.pausedBy : null },
			settings: ST.settings,
			intro: ST.intro,
			batch: { days: DAYS.size, first: [...DAYS.keys()][0] || null, last: [...DAYS.keys()].at(-1) || null, runOut: runOut(DAYS, TODAY).state },
			stats: { ...rec.stats(ST), onTime: [...rec.stats(ST).onTime] },
			factor: { now: rec.factorNow(ST), fromActive: factorOf(solves.map(s => s.ratioActive)), ratios: solves.map(s => ({ puzzle: s.puzzle, ratio: s.ratio, ratioActive: s.ratioActive })) },
			solves,
			// every word the list didn't know: what 0.1's claim button sent
			rejected: pick('word').filter(e => e.res === 'invalid').map(({ game, puzzle, w, t }) => ({ game, puzzle, w, t })),
			backup: { lastExport: ST.lastExport, unsaved: rec.unsaved(ST) },
			games,
		},
	});
	const file = new File([JSON.stringify(report, null, '\t')], reportFileName('wortnetz'), { type: 'application/json' });
	if (await saveFile(file)) toast(`Gesichert: ${file.name}`);
}

// ---------- toast with an action: Undo, "Neu laden" ----------
let toastT = null, actionFn = null;
/**
 * @param {string} msg
 * @param {{warn?: boolean, action?: {label: string, run: () => void}}} [o] an action's toast
 *   stays about 8 s, or until the next tap elsewhere
 */
function toast(msg, { warn = false, action = null } = {}) {
	if (warn) errorLog.add('toast', msg);
	clearTimeout(toastT);
	actionFn = action && action.run;
	const t = $('toast');
	t.replaceChildren();
	const m = document.createElement('div'); m.textContent = msg; t.append(m);
	if (action) { const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.dataset.act = 'toast'; b.textContent = action.label; t.append(b); }
	t.classList.toggle('warn', warn);
	t.hidden = false;
	toastT = setTimeout(() => { t.hidden = true; actionFn = null; }, action ? 8000 : warn ? 6000 : 3000);
}
// an offered action ends with the next tap elsewhere
document.addEventListener('pointerdown', e => {
	const t = $('toast');
	if (actionFn && !t.hidden && !t.contains(e.target)) { t.hidden = true; actionFn = null; }
}, true);

// ---------- a new release ----------
/** a game runs: started, not solved, on the board. The toast waits for its end */
const gameRuns = () => view === 'play' && G && G.startedAt && !G.solved;
function offerUpdate() {
	if (!updateReady || gameRuns() || view === 'intro' || !$('scrim').hidden) return;
	updateReady = false;	// once; ignored, the release takes over at the next start
	toast('Neue Version da.', { action: { label: 'Neu laden', run: () => { persist(); upd.takeNow(); } } });
}

/** the release changed since the last start (a toast, as any other): "Neue Version geladen."
 * Storage from before this key counts as an older release when something was played on it. */
const RELEASE = 'wortnetz.release';
function announceRelease() {
	const b = buildInfo();
	const cur = `${b.version} ${b.commit || 'dev'}`;
	let prev;
	try { prev = localStorage.getItem(RELEASE); localStorage.setItem(RELEASE, cur); } catch { return; }
	if (prev !== cur && (prev || !rec.needsIntro(ST)) && view !== 'intro') toast('Neue Version geladen.');
}

// ---------- one click handler for the buttons ----------
document.addEventListener('click', e => {
	const b = e.target.closest('button');
	if (!b) return;
	if (b.dataset.open) { openSheet(b.dataset.open); return; }
	if (b.hasAttribute('data-close')) { closeSheet(); offerUpdate(); return; }
	if (b.dataset.day) { $('scrim').hidden = true; sheetPaused = false; openDay(b.dataset.day); return; }
	const act = b.dataset.act;
	if (act === 'export') { doExport().catch(err => toast(`Export fehlgeschlagen: ${err.message}`, { warn: true })); }
	else if (act === 'import') { $('fImport').click(); }
	else if (act === 'debug') { debugReport().catch(err => toast(`Bericht fehlgeschlagen: ${err.message}`, { warn: true })); }
	else if (act === 'toast') { const u = actionFn; actionFn = null; $('toast').hidden = true; if (u) u(); }
	else if (act === 'example') {
		// the example puzzle again; the game stays paused by the menu and goes on afterwards
		$('scrim').hidden = true;
		const was = view, paused = sheetPaused; sheetPaused = false;
		showIntro(() => {
			if (was === 'end' && endG) showView('end');
			else if (was === 'over') showView('over');
			else { showView('play'); draw(); render(); hintBar(); }
			if (day) $('day').textContent = dayLabel(day.date); else $('day').textContent = shortDay(TODAY);
			if (paused && G && G.pausedBy === 'menu') resume();
		});
	}
});

// the text size changed (iOS: Settings, Display, Text Size): the tiles follow
function sizeChanged() {
	if (Math.abs(textScale() - drawnScale) < 0.01) return;
	if (G && view === 'play') { draw(); render(); }
	if (intro) intro.redraw();
}
addEventListener('resize', sizeChanged);

// ---------- start ----------
async function main() {
	if (await upd.takeWaiting()) return;	// a release that waited takes over now
	upd.startUpdates({ ready: () => { updateReady = true; offerUpdate(); }, busy: () => !!gameRuns(), log: m => errorLog.add('update', m) });
	showClock();
	const config = loadConfig();
	try {
		await loadPuzzles();
	} catch (err) {
		errorLog.add('puzzles', err && err.message);
		$('word').textContent = '';
		say('', 'Rätsel nicht geladen. Neu laden?', 'bad', true);
		return;
	}
	config.then(() => { $('foot').innerHTML = verLine(); });
	TODAY = berlinDate();
	if (rec.needsIntro(ST)) showIntro();
	else openToday();
	announceRelease();
	// a new day while the page stays open: the next visit opens it
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) return;
		sizeChanged();
		const t = berlinDate();
		if (t !== TODAY) { TODAY = t; if (view !== 'intro' && (!G || G.solved || !G.startedAt || G.pausedBy)) openToday(); }
	});
}

/**
 * Inside another site's frame the page doesn't start: that site could lay its own buttons over
 * the board or pass itself off as wortnetz. A link opens the page on its own.
 */
function framed() {
	const a = document.createElement('a');
	a.href = location.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Direkt öffnen';
	const p = document.createElement('p');
	p.className = 'framed';
	p.append('wortnetz läuft nur als eigene Seite. ', a, '.');
	document.body.replaceChildren(p);
}

if (window.top === window.self) main();
else framed();

// for tools/ui-check.mjs: the page's own functions, read-only use
window.__wortnetz = {
	state: () => ST, game: () => G, today: () => TODAY, view: () => view, intro: () => intro,
	/** a tile's centre in page coordinates, as drawn now (rotation included) */
	tileXY(i) { const [x, y] = XY(i); const p = svg.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; },
};
