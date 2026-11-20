// What lasts (src/core/records.js): first solves, replays, stats, the factor, and the backup file:
// export, then import into an empty browser gives the same archive, stats, factor and settings;
// a merge keeps the first solve; a file anyone could have edited brings nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as rec from '../src/core/records.js';
import * as g from '../src/core/game.js';
import { ratios } from '../src/core/timing.js';
import { backupFileName } from '../src/core/filename.js';

const DAY = JSON.parse(readFileSync(new URL('./fixtures/day-2026-11-26.json', import.meta.url), 'utf8'));

function solveOf(p, { at, ms = 60000, active = 70000, date = '2026-11-18', onTime = true, factorBefore = { f: 1, n: 0 } }) {
	const r = ratios(p, ms, active);
	return { puzzle: p.id, date, at, ms, active, hints: 1, tries: 2, found: Object.keys(p.targets), foundAt: Object.fromEntries(Object.keys(p.targets).map((w, k) => [w, 1000 * (k + 1)])), bonus: ['BEST'], ratio: r.ratio, ratioActive: r.ratioActive, factorBefore, onTime };
}
const P = (id, date) => ({ ...DAY, id, date });
/** a board id as the generator makes them: "b" and 10 hex digits */
const id = k => `b${String(k).padStart(10, '0')}`;

function playedState() {
	const st = rec.emptyState();
	st.settings = { hideTime: true, fileName: 'mein-netz-{date}', vibration: false, details: true };
	const days = ['2026-11-19', '2026-11-20', '2026-11-21'];
	days.forEach((d, k) => {
		st.started[id(k)] = `${d}T08:00:00.000Z`;
		rec.addSolve(st, solveOf(P(id(k), d), { at: `${d}T08:0${k + 1}:00.000Z`, ms: 50000 + 10000 * k, date: d }));
	});
	st.started[id(3)] = '2026-11-22T08:00:00.000Z';	// played, not solved
	return st;
}

test('a first solve counts; a replay never replaces it', () => {
	const st = rec.emptyState();
	assert.ok(rec.addSolve(st, solveOf(DAY, { at: '2026-11-26T07:17:51.505Z', ms: 87147, date: '2026-11-26' })));
	assert.equal(rec.addSolve(st, solveOf(DAY, { at: '2026-11-27T10:00:00.000Z', ms: 25000, date: '2026-11-26' })), false);
	assert.equal(st.solves['bc2f252513c'].ms, 87147);
	assert.equal(rec.factorNow(st).n, 1);
});

test('stats: played, solved, the on-time dates for the streak', () => {
	const s = rec.stats(playedState());
	assert.equal(s.played, 4);
	assert.equal(s.solved, 3);
	assert.deepEqual([...s.onTime].sort(), ['2026-11-19', '2026-11-20', '2026-11-21']);
});

test('backup: export, then import into an empty browser: same archive, stats, factor and settings', () => {
	const st = playedState();
	const file = JSON.stringify(rec.backupJson(st, new Date('2026-11-22T09:00:00Z')));
	const b = rec.readBackup(file);
	assert.ok(b.ok);
	const fresh = rec.emptyState();
	const r = rec.mergeBackup(fresh, b);
	assert.deepEqual(r, { added: 3, replaced: 0, kept: 0 });
	assert.deepEqual(fresh.solves, st.solves, 'archive (solves, with times and words)');
	assert.deepEqual({ ...rec.stats(fresh), onTime: [...rec.stats(fresh).onTime] }, { ...rec.stats(st), onTime: [...rec.stats(st).onTime] });
	assert.deepEqual(rec.factorNow(fresh), rec.factorNow(st));
	assert.deepEqual(fresh.settings, st.settings);
	assert.deepEqual(rec.unsaved(fresh), [], 'what came from a file is in a file: no dot');
});

test('backup: a merge keeps the first solve of each puzzle', () => {
	const here = rec.emptyState();
	rec.addSolve(here, solveOf(P(id(0), '2026-11-19'), { at: '2026-11-19T12:00:00.000Z', ms: 99000 }));	// later than the file's
	rec.addSolve(here, solveOf(P(id(9), '2026-11-25'), { at: '2026-11-25T12:00:00.000Z', ms: 42000 }));	// only here
	const b = rec.readBackup(JSON.stringify(rec.backupJson(playedState())));
	const r = rec.mergeBackup(here, b);
	assert.deepEqual(r, { added: 2, replaced: 1, kept: 0 });
	assert.equal(here.solves[id(0)].ms, 50000, 'the earlier solve won');
	assert.equal(here.solves[id(9)].ms, 42000, 'a solve only here stays');
	// and the other way round: the browser's earlier solve stays
	const early = rec.emptyState();
	rec.addSolve(early, solveOf(P(id(0), '2026-11-19'), { at: '2026-11-19T07:00:00.000Z', ms: 11000 }));
	assert.equal(rec.mergeBackup(early, b).kept, 1);
	assert.equal(early.solves[id(0)].ms, 11000);
});

test('backup: the dot shows solves in no file; an export clears it', () => {
	const st = playedState();
	assert.equal(rec.unsaved(st).length, 3);
	rec.markExported(st, new Date('2026-11-22T10:00:00Z'));
	assert.deepEqual(rec.unsaved(st), []);
	assert.equal(st.lastExport, '2026-11-22T10:00:00.000Z');
	rec.addSolve(st, solveOf(P(id(7), '2026-11-23'), { at: '2026-11-23T08:00:00.000Z' }));
	assert.deepEqual(rec.unsaved(st), [id(7)]);
});

test('backup: a file anyone could have edited: wrong kind, junk fields and bad words are dropped', () => {
	assert.equal(rec.readBackup('nope').ok, false);
	assert.equal(rec.readBackup('{"kind":"xxl-backup"}').ok, false);
	assert.equal(rec.readBackup('{"kind":"wortnetz-backup","v":99}').ok, false);
	const b = rec.readBackup(JSON.stringify({ kind: 'wortnetz-backup', v: 1, solves: [
		{ puzzle: id(1), at: '2026-11-19T08:00:00Z', ms: 1000, found: ['HASE', '<img>', 'x'.repeat(30)], foundAt: { HASE: 5, '<img>': 3 }, evil: 'drop me', ratio: 1e9 },
		{ puzzle: '../../etc', at: '2026-11-19T08:00:00Z', ms: 1 },
		{ puzzle: 'nodate', at: 'yesterday', ms: 1 },
		'junk',
	], settings: { hideTime: 'yes', fileName: 'x'.repeat(500), other: 1 } }));
	assert.ok(b.ok);
	assert.equal(b.solves.length, 1);
	assert.deepEqual(b.solves[0].found, ['HASE']);
	assert.deepEqual({ ...b.solves[0].foundAt }, { HASE: 5 });
	assert.equal(b.solves[0].evil, undefined);
	assert.equal(b.solves[0].ratio, undefined);
	assert.deepEqual(b.settings, { hideTime: false, fileName: '', vibration: true, details: false });
});

test('state read back from storage survives junk', () => {
	assert.deepEqual(JSON.stringify(rec.cleanState('garbage')), JSON.stringify(rec.emptyState()));
	const st = rec.cleanState({ solves: { [id(1)]: { puzzle: id(2), at: '2026-11-19T08:00:00Z', ms: 1 } }, games: [1, {}, null], settings: null });
	assert.deepEqual({ ...st.solves }, {}, 'a solve filed under another id is dropped');
	assert.equal(st.games.length, 1);
});

test('the debug games: kept newest last, at most GAMES_MAX', () => {
	const st = rec.emptyState();
	for (let k = 0; k < rec.GAMES_MAX + 5; k++) rec.keepGame(st, { id: `g${k}`, events: [] });
	assert.equal(st.games.length, rec.GAMES_MAX);
	assert.equal(st.games.at(-1).id, `g${rec.GAMES_MAX + 4}`);
	rec.keepGame(st, { id: `g${rec.GAMES_MAX + 4}`, events: [1] });
	assert.equal(st.games.length, rec.GAMES_MAX, 'the same game replaces itself');
});

test("backup file name: xxl-scorer's rules with wortnetz's default", () => {
	const d = new Date(2026, 10, 18, 22, 0);
	assert.equal(backupFileName('', d), 'wortnetz-2026-11-18.json');
	assert.equal(backupFileName('   ', d), 'wortnetz-2026-11-18.json');
	assert.equal(backupFileName('...', d), 'wortnetz-2026-11-18.json');
	assert.equal(backupFileName('.json', d), 'wortnetz-2026-11-18.json');
	assert.equal(backupFileName('netz {date}', d), 'netz 2026-11-18.json');
	assert.equal(backupFileName('a/b:c', d), 'a-b-c.json');
	assert.equal(backupFileName('immer-gleich.json', d), 'immer-gleich.json');
	assert.equal(backupFileName(undefined, d), 'wortnetz-2026-11-18.json');
});

test('a played game snapshot carries no Set and restores', () => {
	const G = g.newGame(DAY, { id: 'x' });
	g.start(G, 0);
	const snap = g.snapshot(G, 10);
	assert.equal(snap.bonusSet, undefined);
	assert.equal(snap.p, undefined);
	const st = rec.cleanState({ current: { 'bc2f252513c': JSON.parse(JSON.stringify(snap)) } });
	assert.ok(st.current['bc2f252513c']);
});

test('the first run shows on fresh storage only', () => {
	const st = rec.emptyState();
	assert.equal(rec.needsIntro(st), true);
	st.intro = '2026-11-26T08:00:00.000Z';
	assert.equal(rec.needsIntro(st), false);
	assert.equal(rec.cleanState(JSON.parse(JSON.stringify(st))).intro, st.intro, 'kept across a reload');
	const played = playedState();
	assert.equal(played.intro, null);
	assert.equal(rec.needsIntro(played), false, '0.1 played here: no first run');
	const started = rec.emptyState(); started.started[id(1)] = '2026-11-19T07:00:00Z';
	assert.equal(rec.needsIntro(started), false);
	assert.equal(rec.backupJson(st).intro, undefined, 'not part of a backup');
});

test('settings: vibration on and details shut unless stored otherwise', () => {
	assert.deepEqual(rec.cleanSettings(undefined), { hideTime: false, fileName: '', vibration: true, details: false });
	assert.deepEqual(rec.cleanSettings({ vibration: false, details: true, hideTime: 1 }), { hideTime: false, fileName: '', vibration: false, details: true });
});

// keys a crafted file or storage might bring: own names of Object.prototype, and __proto__
const PROTO = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'];

test('ids: only board ids and the example; prototype names never become keys', () => {
	const at = '2026-11-19T08:00:00Z';
	const solves = Object.fromEntries([...PROTO, '../../etc', 'a1-500', 'B0000000001', id(1)].map(k => [k, { puzzle: k, at, ms: 1 }]));
	// JSON.parse makes "__proto__" an own key, as a file or storage would bring it
	const text = `{"solves":${JSON.stringify(solves).replace('{', '{"__proto__":{"puzzle":"__proto__","at":"x","ms":1},')},`
		+ `"started":{"__proto__":"${at}","constructor":"${at}","example":"${at}","${id(2)}":"${at}"},`
		+ `"current":{"__proto__":{"a":1},"toString":{},"${id(3)}":{}},"inFile":{"__proto__":true,"valueOf":true,"${id(1)}":true}}`;
	const st = rec.cleanState(JSON.parse(text));
	assert.deepEqual(Object.keys(st.solves), [id(1)]);
	assert.deepEqual(Object.keys(st.started).sort(), [id(2), 'example'].sort());
	assert.deepEqual(Object.keys(st.current), [id(3)]);
	assert.deepEqual(Object.keys(st.inFile), [id(1)]);
	for (const m of [st.solves, st.started, st.current, st.inFile]) {
		assert.equal(Object.getPrototypeOf(m), null);
		for (const k of PROTO) assert.equal(m[k], undefined, k);
	}
	assert.equal(Object.getPrototypeOf(st.solves[id(1)].foundAt), null);
	// the same keys in a backup file
	const b = rec.readBackup(`{"kind":"wortnetz-backup","v":1,"solves":${JSON.stringify(Object.values(solves))},`
		+ `"started":{"__proto__":"${at}","toString":"${at}","${id(4)}":"${at}"}}`);
	assert.ok(b.ok);
	assert.deepEqual(b.solves.map(s => s.puzzle), [id(1)]);
	assert.deepEqual(Object.keys(b.started), [id(4)]);
	const into = rec.emptyState();
	rec.mergeBackup(into, b);
	assert.equal(Object.getPrototypeOf(into.solves), null);
	assert.equal(rec.stats(into).solved, 1);
	assert.equal(rec.stats(into).played, 2);
	// a stored state survives JSON both ways with its maps prototype-free
	const back = rec.cleanState(JSON.parse(JSON.stringify(into)));
	assert.deepEqual(Object.keys(back.solves), [id(1)]);
});

test('backup limits: file size, entries, the length of a date', () => {
	const head = '{"kind":"wortnetz-backup","v":1,';
	assert.deepEqual(rec.readBackup(' '.repeat(rec.BACKUP_MAX_BYTES + 1)), { ok: false, error: rec.BACKUP_TOO_BIG });
	assert.equal(rec.readBackup(null).ok, false);
	const many = n => Array.from({ length: n }, (_, k) => ({ puzzle: id(k), at: '2026-11-19T08:00:00Z', ms: 1 }));
	assert.deepEqual(rec.readBackup(`${head}"solves":${JSON.stringify(many(rec.ENTRIES_MAX + 1))}}`), { ok: false, error: rec.BACKUP_TOO_BIG });
	const starts = n => Object.fromEntries(Array.from({ length: n }, (_, k) => [id(k), '2026-11-19T08:00:00Z']));
	assert.equal(rec.readBackup(`${head}"started":${JSON.stringify(starts(rec.ENTRIES_MAX + 1))}}`).ok, false);
	const full = rec.readBackup(`${head}"solves":${JSON.stringify(many(rec.ENTRIES_MAX))},"started":${JSON.stringify(starts(rec.ENTRIES_MAX))}}`);
	assert.ok(full.ok);
	assert.equal(full.solves.length, rec.ENTRIES_MAX);
	// V8 reads "2026-11-19 (and then two megabytes)" as a date: a date is 40 characters at most
	const long = `2026-11-19 (${'x'.repeat(100)})`;
	assert.ok(!Number.isNaN(Date.parse(long)));
	const b = rec.readBackup(`${head}"solves":[{"puzzle":"${id(1)}","at":"${long}","ms":1}],"started":{"${id(2)}":"${long}","${id(3)}":"2026-11-19T08:00:00Z"}}`);
	assert.deepEqual(b.solves, []);
	assert.deepEqual(Object.keys(b.started), [id(3)]);
	// storage read back: the same limits
	const st = rec.cleanState({ started: { ...starts(rec.ENTRIES_MAX + 10), [id(99999)]: long }, lastExport: long, intro: long });
	assert.equal(Object.keys(st.started).length, rec.ENTRIES_MAX);
	assert.equal(st.lastExport, null);
	assert.equal(st.intro, null);
	// a real year of daily play stays far below the file limit
	const year = JSON.stringify(rec.backupJson((() => {
		const y = rec.emptyState();
		for (let k = 0; k < 365; k++) rec.addSolve(y, solveOf(P(id(k), '2026-11-26'), { at: '2026-11-26T08:00:00.000Z' }));
		return y;
	})()), null, '\t');
	assert.ok(year.length * 8 < rec.BACKUP_MAX_BYTES, `a year: ${year.length} bytes`);
});
