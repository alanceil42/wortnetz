// Expected times: a word that opens a word family costs search
// time, a word of a family already found costs little; the whole times your factor, the
// geometric mean of your last 10 ratios of time to formula (first solves only).

import { sameFamily } from './game.js';

export const FACTOR_N = 10;

/** a word opening a family: 3 s + 0.8 s per letter + 5 s per Zipf point below 5 */
export const fresh = (w, z) => 3 + 0.8 * w.length + 5 * Math.max(0, 5 - z);
/** a word whose first letters a found target shares: 1.5 s + 0.3 s per letter */
export const follow = w => 1.5 + 0.3 * w.length;

/**
 * Expected times of a puzzle's targets: in the order the formula finds them, cumulative, in ms.
 * @param {{targets: Object<string, {z: number}>}} p
 * @param {number} [f] the factor (1: the plain formula)
 * @returns {{at: Object<string, number>, total: number}}
 */
export function expected(p, f = 1) {
	const ws = Object.keys(p.targets).sort((a, b) => fresh(a, p.targets[a].z) - fresh(b, p.targets[b].z) || (a < b ? -1 : 1));
	let t = 0;
	const at = {}, seen = [];
	for (const w of ws) {
		const fol = seen.some(u => sameFamily(w, u));
		t += (fol ? follow(w) : fresh(w, p.targets[w].z)) * f;
		at[w] = Math.round(t * 1000);
		seen.push(w);
	}
	return { at, total: Math.round(t * 1000) };
}

/**
 * The factor from ratios, oldest first: geometric mean of the last FACTOR_N.
 * @param {number[]} ratios
 * @returns {{f: number, n: number}}
 */
export function factorOf(ratios) {
	const r = (ratios || []).filter(x => Number.isFinite(x) && x > 0).slice(-FACTOR_N);
	if (!r.length) return { f: 1, n: 0 };
	return { f: Math.exp(r.reduce((a, x) => a + Math.log(x), 0) / r.length), n: r.length };
}

/** a solve's two ratios: time after bonus words / formula (the factor's, for now), active / formula */
export function ratios(p, final, active) {
	const raw = expected(p).total || 1;
	return { ratio: final / raw, ratioActive: active / raw };
}

/** m:ss */
export function fmt(ms) {
	const s = Math.max(0, Math.round(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
