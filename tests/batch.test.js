// The batch the page serves (puzzles/), checked board by board without the generator, against
// what the generator promises. Base forms against the lexicon: gen/check.py (needs the word data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { addDays } from '../src/core/days.js';

const dir = new URL('../puzzles/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'));
const batches = index.batches.map(b => ({ ...b, data: JSON.parse(readFileSync(new URL(b.file, dir), 'utf8')) }));
const ek = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const NEVER = ['BRICHT', 'TRAF', 'GALT', 'EICH', 'ALTMARK'];
const BONUS = ['BRIE', 'DART', 'LEIN'];

/** every path along the board's lines that spells w */
function tracePaths(d, w) {
	const adj = Array.from({ length: 16 }, () => []);
	for (const [a, b] of d.edges) { adj[a].push(b); adj[b].push(a); }
	const out = [];
	const dfs = (path, k) => {
		if (k === w.length) { out.push(path.slice()); return; }
		for (const j of path.length ? adj[path.at(-1)] : [...Array(16).keys()]) {
			if (path.includes(j) || d.letters[j] !== w[k]) continue;
			path.push(j); dfs(path, k + 1); path.pop();
		}
	};
	dfs([], 0);
	return out;
}

test('index.json lists every batch file', () => {
	const files = readdirSync(dir).filter(f => /^batch-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
	assert.deepEqual(index.batches.map(b => b.file).sort(), files);
	assert.ok(batches.length >= 1);
});

for (const b of batches) {
	const days = b.data.days;
	// 0.1's batch ran 60 days; 0.2 cuts it where the next batch starts, the year runs 365
	test(`${b.file}: its days in a row from its start, as index.json says, ids unique`, () => {
		assert.ok(days.length > 0);
		assert.equal(b.days, days.length);
		days.forEach((d, k) => assert.equal(d.date, addDays(b.data.start, k)));
		assert.equal(new Set(days.map(d => d.id)).size, days.length);
	});

	test(`${b.file}: each id names its board (a hash of letters and lines)`, () => {
		for (const d of days) {
			const s = `${d.letters.join('')};${d.edges.map(([a, c]) => `${a}-${c}`).sort().join(',')}`;
			// the generator sorts the lines as pairs, so sort the same way
			const pairs = d.edges.map(e => e.slice()).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
			const s2 = `${d.letters.join('')};${pairs.map(([a, c]) => `${a}-${c}`).join(',')}`;
			const h = 'b' + createHash('sha1').update(s2, 'utf8').digest('hex').slice(0, 10);
			assert.equal(d.id, h, `${d.date} ${s}`);
		}
	});

	test(`${b.file}: 12-16 targets, all 16 letters used, every path real, every line used`, () => {
		for (const d of days) {
			const ws = Object.keys(d.targets);
			assert.ok(ws.length >= 12 && ws.length <= 16, `${d.date}: ${ws.length} targets`);
			const lines = new Set(d.edges.map(([a, c]) => ek(a, c)));
			const used = new Set(), nodes = new Set();
			for (const [w, t] of Object.entries(d.targets)) {
				assert.ok(w.length >= 4 && /^[A-ZÄÖÜ]+$/.test(w), w);
				assert.equal(typeof t.z, 'number');
				assert.equal(typeof t.fam, 'string');
				assert.ok(t.paths.length >= 1);
				for (const p of t.paths) {
					assert.equal(p.map(i => d.letters[i]).join(''), w, `${d.date} ${w}`);
					assert.equal(new Set(p).size, p.length);
					for (let k = 1; k < p.length; k++) { assert.ok(lines.has(ek(p[k - 1], p[k])), `${d.date} ${w} line`); used.add(ek(p[k - 1], p[k])); }
					p.forEach(i => nodes.add(i));
				}
				// the paths listed are all the ways to trace it
				assert.equal(tracePaths(d, w).length, t.paths.length, `${d.date} ${w}: every path listed`);
			}
			assert.equal(nodes.size, 16, `${d.date}: all letters used`);
			assert.equal(used.size, lines.size, `${d.date}: no line without a target`);
			assert.ok(Math.max(...ws.map(w => w.length)) >= 7, `${d.date}: a long word`);
			for (const w of d.bonus) assert.ok(!d.targets[w], `${d.date}: ${w} both`);
		}
	});

	test(`${b.file}: BRICHT, TRAF, GALT, EICH, ALTMARK no target anywhere; BRIE, DART, LEIN bonus where traced`, () => {
		for (const d of days) {
			for (const w of NEVER) assert.ok(!d.targets[w], `${d.date}: ${w} is a target`);
			for (const w of BONUS) if (tracePaths(d, w).length) assert.ok(d.bonus.includes(w), `${d.date}: ${w} traceable but no bonus word`);
		}
	});

	test(`${b.file}: about two easy boards a week, never on two days in a row, headline 12+ letters`, () => {
		const easy = days.map((d, k) => (d.easy ? k : -1)).filter(k => k >= 0);
		const perWeek = easy.length / (days.length / 7);
		assert.ok(perWeek >= 1.5 && perWeek <= 2.5, `${easy.length} easy boards in ${days.length} days`);
		for (let k = 1; k < easy.length; k++) assert.ok(easy[k] - easy[k - 1] >= 2, `easy boards on ${days[easy[k - 1]].date} and ${days[easy[k]].date}`);
		for (const k of easy) {
			const d = days[k];
			assert.ok(d.headline.length >= 12, d.headline);
			assert.ok(d.targets[d.headline], `${d.date}: headline is a target`);
			// its two parts are targets too
			const parts = Object.keys(d.targets).filter(w => w !== d.headline && w.length >= 4 && (d.headline.startsWith(w) || d.headline.endsWith(w)));
			assert.ok(parts.some(w => d.headline.startsWith(w)) && parts.some(w => d.headline.endsWith(w)), `${d.date}: ${d.headline} parts ${parts}`);
		}
		const heads = days.map(d => d.headline);
		assert.equal(new Set(heads).size, heads.length, 'no headline twice');
	});
}
