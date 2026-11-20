// Days of the batches (src/core/days.js): the notice before the boards run out, on the real
// batches: 30 days before the last day a quiet line, after it the message, the archive still open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dayMap, runOut, addDays, reached, longDate, NOTICE_DAYS } from '../src/core/days.js';

const dir = new URL('../puzzles/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'));
const DAYS = dayMap(index.batches.map(b => JSON.parse(readFileSync(new URL(b.file, dir), 'utf8'))));
const last = [...DAYS.keys()].at(-1);

test('the last day is the last batch\'s last day', () => {
	const b = index.batches.at(-1);
	assert.equal(last, addDays(b.start, b.days - 1));
});

test('run-out: quiet until 30 days before the end, the notice from then, the message after it', () => {
	assert.equal(NOTICE_DAYS, 30);
	assert.deepEqual(runOut(DAYS, addDays(last, -31)), { state: 'ok', last, left: 31 });
	assert.deepEqual(runOut(DAYS, addDays(last, -30)), { state: 'soon', last, left: 30 });
	assert.equal(runOut(DAYS, last).state, 'soon');
	assert.deepEqual(runOut(DAYS, addDays(last, 1)), { state: 'over', last, left: -1 });
	assert.equal(runOut(DAYS, '2026-11-27').state, 'ok');
	assert.equal(runOut(new Map(), '2026-11-27').state, 'none');
});

test('after the last day the archive holds every day', () => {
	assert.equal(reached(DAYS, addDays(last, 5)).length, DAYS.size);
});

test('longDate', () => {
	assert.equal(longDate('2027-11-25'), '25.11.2027');
	assert.equal(longDate('2027-01-05'), '5.1.2027');
});
