// The game: one puzzle being played. Pure: the page passes the time (`now`, a
// monotonic clock in ms, performance.now() there) and the random choice, so tests replay a game.
//
// Taken from the first prototype: tracing and
// tapping, letters and lines vanishing once no open target needs them, bonus words -10 s, hints
// from a word family not started yet, pause, the events it records.

import { isTime } from './records.js';

/** a line's key, the same both ways */
export const ek = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export const HINTS = 3;
export const BONUS_MS = 10000;
export const MIN_LEN = 4;

/**
 * A new game of a puzzle (a day of a batch: letters, edges, targets {W: {z, fam, paths}}, bonus []).
 * @param {object} p the puzzle
 * @param {{id?: string, replay?: boolean}} [o]
 */
export function newGame(p, o = {}) {
	return {
		id: o.id || '',
		puzzle: p.id,
		date: p.date || null,
		p,
		bonusSet: new Set(p.bonus || []),
		startedAt: null,	// wall clock (ISO) of the first touch
		run: 0, since: null, bonusMs: 0,	// active time: run plus the time since `since`
		found: [], foundAt: {}, bonus: [], tries: 0,
		hints: HINTS, hintW: null, hintK: 0,
		pausedBy: null, solved: false, final: 0, active: 0,
		replay: !!o.replay,
		events: [],
	};
}

/** active time in ms: the clock while not paused */
export const activeMs = (G, now) => G.run + (G.since != null ? now - G.since : 0);
/** the clock shown: active time minus 10 s per bonus word */
export const clockMs = (G, now) => (G.solved ? G.final : Math.max(0, activeMs(G, now) - G.bonusMs));

function log(G, now, ev) {
	G.events.push({ t: Math.round(activeMs(G, now)), ...ev });
}

/** the start: the tap that uncovers a new board starts the clock */
export function start(G, now, wall = new Date().toISOString()) {
	if (G.startedAt) return false;
	G.startedAt = wall; G.since = now;
	log(G, now, { ty: 'start' });
	return true;
}

/** pause: the clock, the menu, a sheet, leaving the page ('clock', 'menu', 'hidden' ...) */
export function pause(G, why, now) {
	if (!G.startedAt || G.solved || G.since == null) return false;
	G.run += now - G.since; G.since = null; G.pausedBy = why;
	log(G, now, { ty: 'pause', why });
	return true;
}

export function resume(G, now) {
	if (!G.startedAt || G.solved || G.since != null) return false;
	G.since = now; G.pausedBy = null;
	log(G, now, { ty: 'resume' });
	return true;
}

/** what is still on the board: every letter and line an open target uses */
export function visible(G) {
	const edges = new Set(), nodes = new Set();
	for (const [w, t] of Object.entries(G.p.targets)) {
		if (G.found.includes(w)) continue;
		for (const path of t.paths) {
			path.forEach(i => nodes.add(i));
			for (let k = 1; k < path.length; k++) edges.add(ek(path[k - 1], path[k]));
		}
	}
	return { edges, nodes };
}

/**
 * A trace moving onto letter i: the path it makes. Back onto the one before takes the last
 * back; a letter not joined by a visible line, or already in the path, changes nothing.
 * @returns {{path: number[], back: boolean}}
 */
export function extend(vis, path, i) {
	if (i < 0 || !vis.nodes.has(i)) return { path, back: false };
	const last = path[path.length - 1];
	if (i === last) return { path, back: false };
	if (path.length >= 2 && i === path[path.length - 2]) return { path: path.slice(0, -1), back: true };
	if (path.includes(i) || !vis.edges.has(ek(last, i))) return { path, back: false };
	return { path: [...path, i], back: false };
}

/**
 * A tap while a word is being tapped: the last letter again sends; the one
 * before takes the last back; a joined letter continues; any other starts a new word there.
 * @returns {{act: 'send'|'back'|'add'|'restart'|'none', path: number[]}}
 */
export function tap(vis, path, i) {
	if (i < 0 || !vis.nodes.has(i)) return { act: 'none', path };
	const last = path[path.length - 1];
	if (i === last) return { act: 'send', path };
	if (path.length >= 2 && i === path[path.length - 2]) return { act: 'back', path: path.slice(0, -1) };
	if (!path.includes(i) && vis.edges.has(ek(last, i))) return { act: 'add', path: [...path, i] };
	return { act: 'restart', path: [i] };
}

export const word = (G, path) => path.map(i => G.p.letters[i]).join('');

/**
 * A traced word sent: checked and recorded. Solving with it ends the game.
 * @param {number[]} path
 * @param {number} now
 * @param {{down?: number, backs?: number, tap?: boolean}} [how] when the finger went down, take-backs, tapped
 * @returns {{res: 'short'|'dup'|'target'|'bonus'|'invalid', w: string, solved: boolean, left: number}}
 */
export function submit(G, path, now, how = {}) {
	const w = word(G, path);
	let res;
	if (path.length < MIN_LEN) res = 'short';
	else if (G.found.includes(w) || G.bonus.includes(w)) res = 'dup';
	else if (G.p.targets[w]) {
		res = 'target'; G.found.push(w); G.foundAt[w] = Math.round(clockMs(G, now));
	} else if (G.bonusSet.has(w)) {
		res = 'bonus'; G.bonus.push(w); G.bonusMs += BONUS_MS;
	} else { res = 'invalid'; G.tries++; }
	log(G, now, { ty: 'word', w, res, path: path.slice(), down: Math.round(how.down ?? activeMs(G, now)), backs: how.backs || 0, tap: !!how.tap });
	const left = Object.keys(G.p.targets).length - G.found.length;
	if (res === 'target' && left === 0) solve(G, now);
	return { res, w, solved: G.solved, left };
}

function solve(G, now) {
	G.active = Math.round(activeMs(G, now));
	G.run = G.active; G.since = null; G.solved = true;
	G.final = Math.max(0, G.active - G.bonusMs);
	log(G, now, { ty: 'solve', ms: G.final, active: G.active, replay: G.replay });
}

/** words share a family when one starts with the other's first letters */
export const fam = w => w.slice(0, Math.min(5, w.length - 1));
export const sameFamily = (a, b) => a.startsWith(fam(b)) || b.startsWith(fam(a));

/**
 * A hint: the next letter of the hinted target; a new target once it is found or spelt
 * out, from a word family not started yet, else any open target.
 * @param {() => number} rand a number in [0, 1)
 * @returns {{w: string, k: number} | null} null when no hint is left
 */
export function hint(G, now, rand = Math.random) {
	if (G.solved || G.hints <= 0) return null;
	if (!G.hintW || G.found.includes(G.hintW) || G.hintK >= G.hintW.length) {
		const open = Object.keys(G.p.targets).filter(w => !G.found.includes(w));
		if (!open.length) return null;
		const untouched = open.filter(w => !G.found.some(u => sameFamily(w, u)));
		const pool = untouched.length ? untouched : open;
		G.hintW = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
		G.hintK = 0;
	}
	G.hintK++; G.hints--;
	log(G, now, { ty: 'hint', w: G.hintW, k: G.hintK });
	return { w: G.hintW, k: G.hintK };
}

/** the hinted target while it is open: its path's first k letters */
export function hintTiles(G) {
	if (!G.hintW || G.found.includes(G.hintW)) return [];
	return G.p.targets[G.hintW].paths[0].slice(0, G.hintK);
}

/** the board turned a quarter: logged only */
export function rotated(G, rot, now) { if (G.startedAt) log(G, now, { ty: 'rotate', rot }); }
/** leaving an unsolved game for another puzzle */
export function leave(G, now) { if (G.startedAt && !G.solved) log(G, now, { ty: 'leave' }); }

/**
 * Rotation (the original's button): tile i is shown at cell view[i]; letters stay upright.
 * @param {number} rot quarter turns
 */
export function rotation(rot) {
	const view = [], cell = [];
	for (let i = 0; i < 16; i++) {
		let r = Math.floor(i / 4), c = i % 4;
		for (let k = 0; k < (rot % 4 + 4) % 4; k++) [r, c] = [c, 3 - r];
		view[i] = r * 4 + c; cell[view[i]] = i;
	}
	return { view, cell };
}

/** the game as stored (no Set, no puzzle): enough to resume it after a reload */
export function snapshot(G, now) {
	const { p, bonusSet, since, ...rest } = G;
	return { ...rest, run: Math.round(activeMs(G, now)), since: null };
}

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v, hi) => (Number.isInteger(v) && v >= 0 && v <= hi ? v : undefined);
const ms = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e10 ? v : undefined);
const EVENTS_MAX = 5000;

/**
 * A stored game back, paused (a reload is a pause by leaving the page). Only this page writes
 * the snapshots, but a bug or another release's format could leave anything in storage, and a
 * game that throws would keep the day's board shut on every visit. So only known fields of the
 * right type are taken, words only from this board.
 * @returns {object|null} null when it is no game that can go on (never started, already
 *   solved: a solve is kept apart, or nothing left to find)
 */
export function restore(snap, p) {
	if (!isObj(snap) || !isTime(snap.startedAt) || snap.solved === true) return null;
	const targets = Object.keys(p.targets), bonusSet = new Set(p.bonus || []);
	const words = (v, ok) => [...new Set(Array.isArray(v) ? v.filter(w => typeof w === 'string' && ok(w)) : [])];
	const found = words(snap.found, w => Object.hasOwn(p.targets, w));
	if (found.length >= targets.length) return null;
	const foundAt = {};
	if (isObj(snap.foundAt)) for (const w of found) { const t = ms(snap.foundAt[w]); if (t !== undefined) foundAt[w] = t; }
	const bonus = words(snap.bonus, w => bonusSet.has(w));
	const G = newGame(p, { id: typeof snap.id === 'string' && snap.id.length <= 60 ? snap.id : '', replay: snap.replay === true });
	Object.assign(G, {
		startedAt: snap.startedAt,
		run: ms(snap.run) ?? 0,
		bonusMs: bonus.length * BONUS_MS,
		found, foundAt, bonus,
		tries: count(snap.tries, 1e6) ?? 0,
		hints: count(snap.hints, HINTS) ?? 0,
		pausedBy: typeof snap.pausedBy === 'string' && snap.pausedBy.length <= 20 ? snap.pausedBy : null,
		events: Array.isArray(snap.events) ? snap.events.filter(isObj).slice(0, EVENTS_MAX) : [],
	});
	if (typeof snap.hintW === 'string' && Object.hasOwn(p.targets, snap.hintW)) {
		G.hintW = snap.hintW;
		G.hintK = count(snap.hintK, snap.hintW.length) ?? 0;
	}
	if (!G.pausedBy) {
		G.pausedBy = 'reload';
		G.events.push({ t: G.run, ty: 'pause', why: 'reload' });
	}
	return G;
}
