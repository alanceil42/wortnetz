// The game core (src/core/game.js): the worked example first, a recorded solve replayed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as g from '../src/core/game.js';

const fx = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
// the board of 2026-11-26 and a solve of it played through the page in Chromium:
// a target, a bonus word, a word not on the list, a pause, a hint, then the rest
const DAY = fx('day-2026-11-26.json');
const PLAY = fx('play-2026-11-26.json');

/** replays a recorded game's events through the core, at their recorded active times */
function replay(p, events) {
	const G = g.newGame(p, { id: 'replay' });
	for (const ev of events) {
		if (ev.ty === 'start') g.start(G, ev.t, PLAY.startedAt);
		else if (ev.ty === 'pause') g.pause(G, ev.why, ev.t);
		else if (ev.ty === 'resume') g.resume(G, ev.t);
		else if (ev.ty === 'hint') {
			// the page's random pick, replayed: the hinted word must be one the core could pick
			const open = Object.keys(p.targets).filter(w => !G.found.includes(w));
			const fresh = open.filter(w => !G.found.some(u => g.sameFamily(w, u)));
			const pool = fresh.length ? fresh : open;
			const k = G.hintW && !G.found.includes(G.hintW) ? -1 : pool.indexOf(ev.w);
			assert.ok(G.hintW === ev.w || k >= 0, `${ev.w}: a target the hint could pick`);
			assert.deepEqual(g.hint(G, ev.t, () => (k + 0.5) / pool.length), { w: ev.w, k: ev.k });
		} else if (ev.ty === 'word') {
			const r = g.submit(G, ev.path, ev.t, { down: ev.down, backs: ev.backs });
			assert.equal(r.res, ev.res, `${ev.w} at ${ev.t}`);
			assert.equal(r.w, ev.w);
		}
	}
	return G;
}

test('worked example: the recorded solve gives 14 targets, 2 bonus words, 1:27 (87,147 ms)', () => {
	const G = replay(DAY, PLAY.events);
	assert.equal(Object.keys(DAY.targets).length, 14);
	assert.equal(G.found.length, 14);
	assert.deepEqual(G.bonus, ['WERKT', 'RAKETEN']);
	assert.equal(G.tries, 1, 'TAKE: not on the list');
	assert.equal(G.hints, g.HINTS - 1, 'one hint taken');
	assert.ok(G.solved);
	assert.equal(G.final, 87147);
	assert.equal(G.final, PLAY.final);
	assert.equal(G.active, PLAY.active);
	assert.equal(G.active - G.final, 2 * g.BONUS_MS, 'two bonus words, 10 s each');
	const solve = G.events.at(-1);
	assert.equal(solve.ty, 'solve');
	assert.equal(solve.ms, 87147);
	assert.equal(solve.t, 107147);
});

test('worked example: every word is traceable along the lines still visible when it was sent', () => {
	const G = g.newGame(DAY);
	g.start(G, 0);
	for (const ev of PLAY.events.filter(e => e.ty === 'word')) {
		const vis = g.visible(G);
		let path = [ev.path[0]];
		for (const i of ev.path.slice(1)) path = g.extend(vis, path, i).path;
		assert.deepEqual(path, ev.path, ev.w);
		g.submit(G, path, ev.t);
	}
	assert.ok(G.solved);
});

test('letters and lines vanish once no open target uses them; a letter stays while one does', () => {
	// the board: G S T E / O A K H / N R E N / T T E W (index 0-15, row by row)
	const G = g.newGame(DAY);
	g.start(G, 0);
	assert.equal(g.visible(G).nodes.size, 16);
	g.submit(G, [15, 10, 9, 6, 2, 5, 0, 1], 1000);	// WERKTAGS: G (0) is needed by no one now
	let v = g.visible(G);
	assert.ok(!v.nodes.has(0), 'G gone');
	assert.ok(!v.edges.has(g.ek(0, 1)) && !v.edges.has(g.ek(0, 5)));
	assert.ok(v.nodes.has(1), 'S stays for SKAT');
	assert.ok(v.nodes.has(15), 'W stays: WERK and WERT are still open');
	g.submit(G, [15, 10, 9, 6], 2000);	// WERK
	assert.ok(g.visible(G).nodes.has(15), 'W stays for WERT');
	g.submit(G, [15, 10, 9, 12], 3000);	// WERT: now W and its line go
	v = g.visible(G);
	assert.ok(!v.nodes.has(15) && !v.edges.has(g.ek(10, 15)));
});

test('a bonus word takes 10 s off the clock, a repeat says dup, a short or unknown word fails', () => {
	const G = g.newGame(DAY);
	g.start(G, 0);
	assert.equal(g.submit(G, [15, 10, 9, 6, 2], 5000).res, 'bonus');	// WERKT
	assert.equal(g.clockMs(G, 15000), 5000);
	assert.equal(g.submit(G, [15, 10, 9, 6, 2], 16000).res, 'dup');
	assert.equal(g.submit(G, [15, 10, 9], 17000).res, 'short');	// WER
	assert.equal(g.submit(G, [2, 5, 6, 10], 18000).res, 'invalid');	// TAKE
	assert.equal(G.tries, 1);
	assert.equal(g.submit(G, [15, 10, 9, 6], 19000).res, 'target');	// WERK
	assert.equal(g.submit(G, [15, 10, 9, 6], 19500).res, 'dup');
	assert.equal(G.foundAt.WERK, 9000);
});

test('pause stops the clock; resume goes on; no pause before the start or after the solve', () => {
	const G = g.newGame(DAY);
	assert.equal(g.pause(G, 'clock', 0), false);
	g.start(G, 100);
	assert.equal(g.activeMs(G, 1100), 1000);
	assert.ok(g.pause(G, 'menu', 1100));
	assert.equal(g.activeMs(G, 99999), 1000);
	assert.equal(G.pausedBy, 'menu');
	assert.ok(g.resume(G, 5000));
	assert.equal(g.activeMs(G, 6000), 2000);
	assert.deepEqual(G.events.map(e => e.ty), ['start', 'pause', 'resume']);
});

test('tracing: back onto the letter before takes the last back; unjoined or used letters do nothing', () => {
	const G = g.newGame(DAY);
	const vis = g.visible(G);
	let r = g.extend(vis, [5], 9);	// A-R joined
	assert.deepEqual(r.path, [5, 9]);
	r = g.extend(vis, r.path, 5);	// back to A
	assert.deepEqual(r.path, [5]);
	assert.ok(r.back);
	assert.deepEqual(g.extend(vis, [5], 15).path, [5], 'A-W not joined');
	assert.deepEqual(g.extend(vis, [5, 9, 10], 9).path, [5, 9], 'back');
	assert.deepEqual(g.extend(vis, [9, 5, 6, 10], 5).path, [9, 5, 6, 10], 'used, not the one before');
});

test('tapping: last letter again sends, the one before takes back, unjoined restarts there', () => {
	const vis = g.visible(g.newGame(DAY));
	assert.deepEqual(g.tap(vis, [5], 9), { act: 'add', path: [5, 9] });
	assert.deepEqual(g.tap(vis, [5, 9], 5), { act: 'back', path: [5] });
	assert.deepEqual(g.tap(vis, [6, 5, 9, 4], 4), { act: 'send', path: [6, 5, 9, 4] });
	assert.deepEqual(g.tap(vis, [5, 9], 15), { act: 'restart', path: [15] });
	// K, A, R, O, then O again: KARO, green
	const G = g.newGame(DAY);
	g.start(G, 0);
	let path = [6];
	for (const i of [5, 9, 4]) path = g.tap(g.visible(G), path, i).path;
	const t = g.tap(g.visible(G), path, 4);
	assert.equal(t.act, 'send');
	assert.equal(g.submit(G, t.path, 1000, { tap: true }).res, 'target');
	assert.equal(G.events.at(-1).tap, true);
});

test('hints: next letter of one target, then a target from a family not started yet', () => {
	const G = g.newGame(DAY);
	g.start(G, 0);
	g.submit(G, [15, 10, 9, 6], 1000);	// WERK found
	let seq = [0.0, 0.5, 0.99];
	const rand = () => seq.shift() ?? 0;
	const h1 = g.hint(G, 2000, rand);
	assert.equal(h1.k, 1);
	assert.ok(!g.sameFamily(h1.w, 'WERK'));
	const h2 = g.hint(G, 3000, rand);
	assert.equal(h2.w, h1.w);
	assert.equal(h2.k, 2);
	assert.deepEqual(g.hintTiles(G), DAY.targets[h1.w].paths[0].slice(0, 2));
	// found: the next hint starts another target
	g.submit(G, DAY.targets[h1.w].paths[0], 4000);
	assert.deepEqual(g.hintTiles(G), []);
	const h3 = g.hint(G, 5000, rand);
	assert.notEqual(h3.w, h1.w);
	assert.equal(h3.k, 1);
	assert.equal(G.hints, 0);
	assert.equal(g.hint(G, 6000, rand), null, 'no hint left');
});

test('hints: every family started, any open target', () => {
	const G = g.newGame(DAY);
	g.start(G, 0);
	const open = ['SKAT'];
	for (const [w, t] of Object.entries(DAY.targets)) if (!open.includes(w)) g.submit(G, t.paths[0], 1000);
	assert.ok(!G.solved);
	assert.equal(g.hint(G, 2000, () => 0.7).w, 'SKAT');
});

test('rotation: four quarter turns are the identity; letters move as the original', () => {
	assert.deepEqual(g.rotation(4).view, g.rotation(0).view);
	const r = g.rotation(1);
	assert.equal(r.view[0], 3);	// top left goes to top right
	for (let i = 0; i < 16; i++) assert.equal(r.cell[r.view[i]], i);
});

test('snapshot and restore: a game resumes paused after a reload, with its words and time', () => {
	const G = g.newGame(DAY, { id: 'x' });
	g.start(G, 0);
	g.submit(G, [15, 10, 9, 6], 4000);
	const snap = JSON.parse(JSON.stringify(g.snapshot(G, 7000)));
	const H = g.restore(snap, DAY);
	assert.equal(H.run, 7000);
	assert.equal(H.pausedBy, 'reload');
	assert.deepEqual(H.found, ['WERK']);
	assert.ok(H.bonusSet.has('WERKT'));
	assert.ok(g.resume(H, 100));
	assert.equal(g.activeMs(H, 1100), 8000);
});
