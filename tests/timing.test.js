// Expected times and the factor (src/core/timing.js), and the days (src/core/days.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expected, factorOf, fresh, follow, follows, JOIN, ratios, fmt } from '../src/core/timing.js';
import { berlinDate, addDays, dayMap, reached, streak, shortDay } from '../src/core/days.js';

const DAY = JSON.parse(readFileSync(new URL('./fixtures/day-2026-11-26.json', import.meta.url), 'utf8'));

test('a word opening a family costs search time, a follower little', () => {
	assert.ok(Math.abs(fresh('ARZT', 4.86) - 6.9) < 1e-9);
	assert.ok(Math.abs(follow('OBERARZT') - 3.9) < 1e-9);
	const ex = expected(DAY);
	assert.equal(Object.keys(ex.at).length, 14);
	assert.equal(ex.total, Math.max(...Object.values(ex.at)));
	const step = w => ex.at[w] - Math.max(0, ...Object.values(ex.at).filter(t => t < ex.at[w]));
	// WERK follows WERT (same first letters, no longer): cheap
	assert.equal(step('WERK'), Math.round(follow('WERK') * 1000));
	// WERKTAGS goes 4 letters past WERK: a compound, priced as a word opening a family
	assert.equal(step('WERKTAGS'), Math.round(fresh('WERKTAGS', DAY.targets.WERKTAGS.z) * 1000));
	assert.ok(step('TRAKT') > 10000);
	assert.equal(expected(DAY, 2).total, 2 * ex.total, 'the factor scales the whole');
});

test('a follower adds at most JOIN letters to a word of its family', () => {
	assert.equal(JOIN, 3);
	assert.ok(follows('STEIGEN', 'STEIG'), '+2: an inflection');
	assert.ok(follows('STEIG', 'STEIGEN'), 'shorter than the found one');
	assert.ok(!follows('WALDFRIEDHOF', 'WALD'), '+8: a compound');
	assert.ok(!follows('BANKGESCHÄFT', 'BANK'));
	assert.ok(!follows('TRANK', 'WALD'), 'another family');
});

test('the factor: geometric mean of the newest 10 ratios; none gives 1', () => {
	assert.deepEqual(factorOf([]), { f: 1, n: 0 });
	const f = factorOf([0.5, 2]);
	assert.ok(Math.abs(f.f - 1) < 1e-12);
	assert.equal(f.n, 2);
	const many = [100, ...Array(10).fill(0.5)];
	assert.ok(Math.abs(factorOf(many).f - 0.5) < 1e-12, 'only the newest 10');
	assert.deepEqual(factorOf([NaN, -1, 0]), { f: 1, n: 0 });
});

test('ratios: time after bonus words and active time, each over the plain formula', () => {
	const raw = expected(DAY).total;
	const r = ratios(DAY, 87147, 107147);
	assert.ok(Math.abs(r.ratio - 87147 / raw) < 1e-12);
	assert.ok(Math.abs(r.ratioActive - 107147 / raw) < 1e-12);
	assert.equal(fmt(87147), '1:27');
	assert.equal(fmt(0), '0:00');
});

test('Berlin date: the day turns at midnight in Berlin, not UTC', () => {
	assert.equal(berlinDate(new Date('2026-11-18T22:59:00Z')), '2026-11-18');
	assert.equal(berlinDate(new Date('2026-11-18T23:00:00Z')), '2026-11-19');
	assert.equal(berlinDate(new Date('2027-06-30T21:59:00Z')), '2027-06-30', 'summer time');
	assert.equal(berlinDate(new Date('2027-06-30T22:00:00Z')), '2027-07-01');
	assert.equal(addDays('2026-12-31', 1), '2027-01-01');
	assert.equal(addDays('2027-03-28', -1), '2027-03-27');
	assert.equal(shortDay('2026-11-18'), 'Mi 18.11.');
});

test('archive: the days reached only, newest first; the streak counts from yesterday until today is solved', () => {
	const days = dayMap([{ start: '2026-11-19', days: ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].map(date => ({ date, id: date })) }]);
	assert.deepEqual(reached(days, '2026-11-21'), ['2026-11-21', '2026-11-20', '2026-11-19']);
	assert.deepEqual(reached(days, '2026-11-18'), []);
	assert.equal(streak(new Set(['2026-11-19', '2026-11-20']), '2026-11-21'), 2);
	assert.equal(streak(new Set(['2026-11-19', '2026-11-20', '2026-11-21']), '2026-11-21'), 3);
	assert.equal(streak(new Set(['2026-11-19']), '2026-11-21'), 0);
});
