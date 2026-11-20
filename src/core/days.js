// Days: one puzzle per day of a batch, by the date in Europe/Berlin: today's puzzle by the Berlin
// date, and an archive of the days reached so far, none ahead.

const BERLIN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD in Berlin at this moment */
export function berlinDate(d = new Date()) {
	const p = Object.fromEntries(BERLIN.formatToParts(d).map(x => [x.type, x.value]));
	return `${p.year}-${p.month}-${p.day}`;
}

/** a date string moved by n days (calendar arithmetic in UTC, no time zone involved) */
export function addDays(date, n) {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/**
 * All days of the batches, by date (a later batch wins a date both have).
 * @param {Array<{start: string, days: Array<{date: string}>}>} batches
 * @returns {Map<string, object>}
 */
export function dayMap(batches) {
	const m = new Map();
	for (const b of batches) for (const d of b.days || []) if (d && typeof d.date === 'string') m.set(d.date, d);
	return new Map([...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/** the days up to and including today, newest first: the archive */
export function reached(days, today) {
	return [...days.keys()].filter(d => d <= today).sort().reverse();
}

/**
 * The daily streak: days in a row, back from today, whose own puzzle was solved on that day.
 * Today not solved yet doesn't break it: it counts from yesterday then.
 * @param {Set<string>} onTime dates whose puzzle was first solved that same day
 */
export function streak(onTime, today) {
	let d = onTime.has(today) ? today : addDays(today, -1), n = 0;
	while (onTime.has(d)) { n++; d = addDays(d, -1); }
	return n;
}

export const NOTICE_DAYS = 30;

/**
 * How long the boards last: 'soon' from 30 days before the last day of the last batch
 * (a quiet line), 'over' after it (a message instead of the board, the archive still open).
 * @param {Map<string, object>} days the day map, sorted
 * @returns {{state: 'ok'|'soon'|'over'|'none', last: string|null, left: number}} left: days after today
 */
export function runOut(days, today) {
	const last = [...days.keys()].at(-1) || null;
	if (!last) return { state: 'none', last, left: 0 };
	const left = Math.round((Date.parse(`${last}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5);
	return { state: left < 0 ? 'over' : left <= NOTICE_DAYS ? 'soon' : 'ok', last, left };
}

/** "25.11.2027" */
export const longDate = date => `${+date.slice(8, 10)}.${+date.slice(5, 7)}.${date.slice(0, 4)}`;

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
/** "Mi 18.11." */
export function shortDay(date) {
	const d = new Date(`${date}T12:00:00Z`);
	return `${WD[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}
