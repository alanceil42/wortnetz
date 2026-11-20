// The first run's example puzzle (src/core/example.js), played with the real game core: solvable
// by drag and by tap, ORTE an Extrawort, letters and lines vanish as in a real game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/core/game.js';
import { EXAMPLE, STEPS, nextStep, feedback } from '../src/core/example.js';

/** a drag along the path, as the page moves the finger: g.extend letter by letter */
function drag(G, path) {
	const vis = g.visible(G);
	let p = [path[0]];
	for (const i of path.slice(1)) p = g.extend(vis, p, i).path;
	assert.deepEqual(p, path, 'the drag follows visible lines');
	return g.submit(G, p, 1000);
}
/** taps: letter by letter, the last again to send */
function taps(G, path) {
	const vis = g.visible(G);
	let p = [path[0]];
	for (const i of path.slice(1)) {
		const t = g.tap(vis, p, i);
		assert.equal(t.act, 'add');
		p = t.path;
	}
	assert.equal(g.tap(vis, p, path.at(-1)).act, 'send');
	return g.submit(G, p, 1000, { tap: true });
}

test('every target lies along the lines, and each step names one', () => {
	const lines = new Set(EXAMPLE.edges.map(([a, b]) => g.ek(a, b)));
	for (const [w, t] of Object.entries(EXAMPLE.targets)) {
		assert.equal(t.paths[0].map(i => EXAMPLE.letters[i]).join(''), w);
		for (let k = 1; k < t.paths[0].length; k++) assert.ok(lines.has(g.ek(t.paths[0][k - 1], t.paths[0][k])), `${w} ${k}`);
	}
	assert.deepEqual(STEPS.map(s => s.w).sort(), Object.keys(EXAMPLE.targets).sort());
});

test('solvable by drag and by tap, in the guide\'s order', () => {
	const G = g.newGame(EXAMPLE, { id: 'example' });
	g.start(G, 0);
	assert.equal(nextStep(G.found).w, 'WORT');
	assert.equal(drag(G, [0, 1, 2, 3]).res, 'target');
	assert.ok(g.visible(G).nodes.has(0), 'the W stays: WORTNETZ needs it');
	assert.equal(feedback('target', 'WORT'), 'Das W bleibt: WORTNETZ braucht es noch.');
	assert.equal(nextStep(G.found).w, 'NETZ');
	assert.equal(taps(G, [7, 6, 5, 4]).res, 'target');
	assert.equal(drag(G, [1, 2, 3, 6]).res, 'bonus', 'ORTE is an Extrawort');
	assert.deepEqual(G.bonus, ['ORTE']);
	assert.equal(drag(G, [1, 2, 3, 6, 7]).res, 'target');
	assert.ok(!g.visible(G).edges.has(g.ek(3, 6)), 'the slanted line goes with ORTEN');
	const r = drag(G, [0, 1, 2, 3, 7, 6, 5, 4]);
	assert.equal(r.res, 'target');
	assert.ok(r.solved && G.solved);
	assert.equal(nextStep(G.found), null);
	assert.equal(g.visible(G).nodes.size, 0, 'the net is empty');
});

test('in any order, all by tap', () => {
	const G = g.newGame(EXAMPLE, { id: 'example' });
	g.start(G, 0);
	for (const w of ['WORTNETZ', 'ORTEN', 'NETZ', 'WORT']) assert.equal(taps(G, EXAMPLE.targets[w].paths[0]).res, 'target', w);
	assert.ok(G.solved);
});

test('what the guide says to a miss', () => {
	const G = g.newGame(EXAMPLE, { id: 'example' });
	g.start(G, 0);
	const r = drag(G, [3, 2, 1]);
	assert.equal(r.res, 'short');
	assert.equal(feedback(r.res, r.w), 'Ein Wort hat mindestens 4 Buchstaben.');
	assert.equal(feedback(drag(G, [6, 3, 2, 1]).res), 'Das ist keins der gesuchten Wörter.');
});
