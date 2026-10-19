'use strict';

// Every completed job on the demo dispatch board was charged a fare inside
// its own fare table, whatever day it is. Found 19/10/2026: on a Monday
// "yesterday" is a Sunday (time and a half), and Ruth Daniels' 7.15 job still
// showed the weekday £8.10 against a £11.50 to £13 table, so the Complaints
// worker told staff the fare looked wrong.

const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('../lib/taxiOffice/data');
const match = require('../lib/taxiOffice/match');

const pence = (s) => Math.round(Number(String(s).replace(/[£,]/g, '')) * 100);

test('a completed job\'s fare sits inside its fare table on every day of a year', () => {
  for (let n = 0; n < 400; n += 1) {
    const today = data.addDays('2026-10-19', n);
    for (const job of data.seedBoard(today).filter((j) => j.status === 'completed')) {
      const f = match.fareCheck(job);
      if (!f) continue;
      const [low, high] = f.then.split(' to ').map(pence);
      // Gary Holt's email quotes his £46.20, so his fare is fixed; only the
      // Christmas and New Year double rate (25 and 26 December, 1 January)
      // lifts the table past it.
      if (job.ref === 'TW-41158' && /-(12-25|12-26|01-01)$/.test(job.date)) continue;
      const charged = pence(job.record.fare);
      assert.ok(charged >= low && charged <= (high || low), `${today} ${job.ref}: charged ${job.record.fare}, table ${f.then}`);
    }
  }
});

test('on a weekday the two daytime jobs keep the fares the demo has always shown', () => {
  const board = data.seedBoard('2026-10-17');
  assert.equal(board.find((j) => j.ref === 'TW-41152').record.fare, '£8.10');
  assert.equal(board.find((j) => j.ref === 'TW-41140').record.fare, '£6.20');
  assert.equal(board.find((j) => j.ref === 'TW-41160').record.fare, '£47.40');
});
