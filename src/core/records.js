// What lasts on this device: first solves, games for the debug report, settings, what
// went into a backup file. Pure functions on one plain object; the page keeps it in
// localStorage (src/ui/store.js).
//
// A solve is the first solve of a puzzle: a replay ("Von vorn") never replaces it and
// counts for neither the stats nor the factor of the expected times. Its two ratios (time / formula, and active
// time / formula) are kept with it, so the factor follows from the solves
// and a backup needs nothing else to bring it back.

import { factorOf } from './timing.js';

export const STATE_VERSION = 1;
export const GAMES_MAX = 120;	// games kept for the debug report, the newest last
export const DEFAULT_FILE_NAME = 'wortnetz-{date}';
// Limits for what a backup file (or storage) may bring: far above real play (a solve takes about
// 1 KB in the file, a year of daily play about 0.4 MB), far below the browser's storage, which
// every page of this site shares.
export const BACKUP_MAX_BYTES = 4 * 1024 * 1024;
export const ENTRIES_MAX = 5000;	// solves, starts, unfinished games, each

/**
 * A map from puzzle id to something, without a prototype: no key, however it is spelled, can
 * reach Object.prototype or change the map's own prototype.
 */
const idMap = () => Object.create(null);

export function emptyState() {
	return {
		v: STATE_VERSION,
		solves: idMap(),	// puzzle id -> solve
		started: idMap(),	// puzzle id -> first start (ISO): "Gespielt"
		games: [],	// every game's record, for the debug report
		current: idMap(),	// puzzle id -> unsolved game snapshot (resumes after a reload)
		settings: { hideTime: false, fileName: '', vibration: true, details: false },
		intro: null,	// ISO: when the first run (welcome, example puzzle) was done or skipped
		inFile: idMap(),	// puzzle id -> true: its solve is in a backup file (exported or imported)
		lastExport: null,	// ISO
	};
}

const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : undefined);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const WORD = /^[A-ZÄÖÜ]{1,16}$/;
// a board's id as the generator makes it ("b" and 10 hex digits), or the first run's example
const ID = /^(?:b[0-9a-f]{10}|example)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** a moment as stored: an ISO time of at most 40 characters that Date.parse reads */
const when = v => (typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : undefined);
/** the first ENTRIES_MAX [key, value] pairs of a plain object whose key is a puzzle id */
const idEntries = o => Object.entries(o).filter(([k]) => ID.test(k)).slice(0, ENTRIES_MAX);

/**
 * settings as stored or read from a file: known fields of the right type only. vibration: the
 * haptics, on unless switched off; details: the end screen's Details open.
 */
export function cleanSettings(s) {
	const out = { hideTime: false, fileName: '', vibration: true, details: false };
	if (isObj(s)) {
		for (const k of ['hideTime', 'vibration', 'details']) if (typeof s[k] === 'boolean') out[k] = s[k];
		const f = str(s.fileName, 100);
		if (f !== undefined) out.fileName = f;
	}
	return out;
}

/**
 * One solve, cleaned; null when it isn't one. A backup is a file anyone could have edited, so
 * only known fields of the expected types are taken.
 */
export function cleanSolve(x) {
	if (!isObj(x)) return null;
	const id = str(x.puzzle, 40), at = when(x.at), ms = num(x.ms, 0, 864e5);
	if (!id || !ID.test(id) || !at || ms === undefined) return null;
	const out = { puzzle: id, at, ms };
	const date = str(x.date, 10);
	if (date && DATE.test(date)) out.date = date;
	for (const k of ['active', 'hints', 'tries']) { const v = num(x[k], 0, 864e5); if (v !== undefined) out[k] = v; }
	for (const k of ['ratio', 'ratioActive']) { const v = num(x[k], 0, 1000); if (v !== undefined) out[k] = v; }
	out.found = Array.isArray(x.found) ? x.found.filter(w => typeof w === 'string' && WORD.test(w)).slice(0, 40) : [];
	out.bonus = Array.isArray(x.bonus) ? x.bonus.filter(w => typeof w === 'string' && WORD.test(w)).slice(0, 80) : [];
	out.foundAt = Object.create(null);	// keyed by found words only, which WORD keeps to capitals
	if (isObj(x.foundAt)) for (const w of out.found) { const v = num(x.foundAt[w], 0, 864e5); if (v !== undefined) out.foundAt[w] = v; }
	if (isObj(x.factorBefore)) {
		const f = num(x.factorBefore.f, 0, 1000), n = num(x.factorBefore.n, 0, 1000);
		if (f !== undefined && n !== undefined) out.factorBefore = { f, n };
	}
	if (typeof x.onTime === 'boolean') out.onTime = x.onTime;
	return out;
}

/** a state read back from storage, whatever it holds */
export function cleanState(s) {
	const st = emptyState();
	if (!isObj(s)) return st;
	if (isObj(s.solves)) for (const [k, v] of idEntries(s.solves)) { const c = cleanSolve(v); if (c && c.puzzle === k) st.solves[k] = c; }
	if (isObj(s.started)) for (const [k, v] of idEntries(s.started)) if (when(v)) st.started[k] = v;
	if (Array.isArray(s.games)) st.games = s.games.filter(isObj).slice(-GAMES_MAX);
	if (isObj(s.current)) for (const [k, v] of idEntries(s.current)) if (isObj(v)) st.current[k] = v;
	st.settings = cleanSettings(s.settings);
	if (isObj(s.inFile)) for (const [k, v] of idEntries(s.inFile)) if (v === true) st.inFile[k] = true;
	if (when(s.lastExport)) st.lastExport = s.lastExport;
	if (when(s.intro)) st.intro = s.intro;
	return st;
}

/**
 * The first run shows on fresh storage only: never done, and nothing played here yet (a
 * browser that played 0.1 has solves but no intro mark, and doesn't need it).
 */
export function needsIntro(st) {
	return !st.intro && !Object.keys(st.solves).length && !Object.keys(st.started).length && !Object.keys(st.current).length;
}

/** solves, oldest first */
export const solvesInOrder = st => Object.values(st.solves).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

/** the factor of the expected times now: from the first solves' ratios, the newest 10 */
export const factorNow = st => factorOf(solvesInOrder(st).map(s => s.ratio));

/**
 * A finished first solve recorded (a replay is not: returns false).
 * @param {object} st
 * @param {object} solve {puzzle, date, at, ms, active, hints, tries, found, foundAt, bonus, ratio, ratioActive, factorBefore, onTime}
 */
export function addSolve(st, solve) {
	if (st.solves[solve.puzzle]) return false;
	const c = cleanSolve(solve);
	if (!c) return false;
	st.solves[c.puzzle] = c;
	delete st.current[c.puzzle];
	return true;
}

/** a game's record for the debug report (kept, the newest GAMES_MAX) */
export function keepGame(st, rec) {
	const i = st.games.findIndex(g => g.id === rec.id);
	if (i >= 0) st.games[i] = rec; else st.games.push(rec);
	if (st.games.length > GAMES_MAX) st.games = st.games.slice(-GAMES_MAX);
}

/** "Gespielt", "Gelöst", the streak's dates */
export function stats(st) {
	const onTime = new Set(Object.values(st.solves).filter(s => s.onTime && s.date).map(s => s.date));
	return { played: new Set([...Object.keys(st.started), ...Object.keys(st.solves)]).size, solved: Object.keys(st.solves).length, onTime };
}

/** solves not in any backup file yet (the debug report; 0.1 showed a dot on Backup, 0.2 doesn't) */
export const unsaved = st => Object.keys(st.solves).filter(k => !st.inFile[k]);

// ---------- the backup file ----------

export const BACKUP_KIND = 'wortnetz-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_TOO_BIG = 'Datei zu groß für eine wortnetz-Sicherung.';

/** the file's content: solves, starts, settings; stats and the factor follow from them */
export function backupJson(st, now = new Date()) {
	return {
		app: 'wortnetz', kind: BACKUP_KIND, v: BACKUP_VERSION, made: now.toISOString(),
		solves: solvesInOrder(st),
		started: st.started,
		settings: cleanSettings(st.settings),
	};
}

/** after an export: everything in the file is in a file */
export function markExported(st, now = new Date()) {
	for (const k of Object.keys(st.solves)) st.inFile[k] = true;
	st.lastExport = now.toISOString();
}

/**
 * A backup file's text read: {solves, started, settings} or an error in German for the toast.
 * @returns {{ok: true, solves: object[], started: object, settings: object} | {ok: false, error: string}}
 */
export function readBackup(text) {
	if (typeof text !== 'string' || text.length > BACKUP_MAX_BYTES) return { ok: false, error: BACKUP_TOO_BIG };
	let j;
	try { j = JSON.parse(text); } catch { return { ok: false, error: 'Keine JSON-Datei.' }; }
	if (!isObj(j) || j.kind !== BACKUP_KIND) return { ok: false, error: 'Keine wortnetz-Sicherung.' };
	if (j.v > BACKUP_VERSION) return { ok: false, error: 'Sicherung einer neueren Version.' };
	if ((Array.isArray(j.solves) && j.solves.length > ENTRIES_MAX) || (isObj(j.started) && Object.keys(j.started).length > ENTRIES_MAX)) return { ok: false, error: BACKUP_TOO_BIG };
	const solves = (Array.isArray(j.solves) ? j.solves : []).map(cleanSolve).filter(Boolean);
	const started = idMap();
	if (isObj(j.started)) for (const [k, v] of idEntries(j.started)) if (when(v)) started[k] = v;
	return { ok: true, solves, started, settings: cleanSettings(j.settings) };
}

/**
 * An import merged in: per puzzle the first solve wins (the earlier `at`); starts keep the
 * earlier; the file's settings replace these (it is a restore). Returns counts for the toast.
 */
export function mergeBackup(st, b) {
	let added = 0, replaced = 0, kept = 0;
	for (const s of b.solves) {
		const have = st.solves[s.puzzle];
		if (!have) { st.solves[s.puzzle] = s; added++; delete st.current[s.puzzle]; }
		else if (s.at < have.at) { st.solves[s.puzzle] = s; replaced++; }
		else kept++;
		st.inFile[s.puzzle] = true;
	}
	for (const [k, v] of Object.entries(b.started)) if (!st.started[k] || v < st.started[k]) st.started[k] = v;
	st.settings = cleanSettings(b.settings);
	return { added, replaced, kept };
}
