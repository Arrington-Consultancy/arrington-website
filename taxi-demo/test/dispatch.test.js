'use strict';
// The dispatch adapter contract. A real iCabbi, Autocab or Cordic driver is
// tested against the same interface before it replaces the mock.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDispatch, DRIVERS, STATUSES } = require('../lib/dispatch');

const booking = { pickup: { address: 'Exmouth railway station' }, destination: { address: 'Exeter Airport' }, asap: true, pickupAt: null, vehicle: 'saloon', passengers: 1 };

test('every driver implements the same interface', () => {
  for (const name of Object.keys(DRIVERS)) {
    const d = createDispatch(name);
    for (const fn of ['configured', 'createBooking', 'getBooking', 'cancelBooking']) assert.equal(typeof d[fn], 'function', `${name}.${fn}`);
    assert.equal(d.name, name);
    assert.ok(d.label);
  }
});

test('the vendor slots refuse to book until they are written, and say what they need', async () => {
  for (const name of ['icabbi', 'autocab', 'cordic']) {
    const d = createDispatch(name);
    assert.equal(d.configured(), false);
    await assert.rejects(d.createBooking(booking), (e) => e.code === 'DISPATCH_NOT_CONFIGURED' && /needs/.test(e.message));
  }
});

test('an unknown driver is an error, not a silent fallback', () => {
  assert.throws(() => createDispatch('nonsense'), /Unknown dispatch driver/);
});

test('the mock takes the job, a controller confirms it, then a car is allocated', async () => {
  let t = 1_000_000;
  const events = [];
  const d = createDispatch('mock', { now: () => t, confirmAfterMs: 1000, allocateAfterMs: 5000, random: () => 0, onEvent: (e) => events.push(e) });
  const job = await d.createBooking({ ...booking, pickupAt: new Date(t).toISOString() });
  assert.match(job.ref, /^TW-\d{5}$/);
  assert.equal((await d.getBooking(job.ref)).status, 'received');
  t += 1500;
  assert.equal((await d.getBooking(job.ref)).status, 'confirmed');
  t += 4000;
  const v = await d.getBooking(job.ref);
  assert.equal(v.status, 'allocated');
  assert.ok(v.driver.name && v.driver.car && v.driver.reg);
  assert.ok(v.etaMinutes >= 4 && v.etaMinutes <= 11);
  assert.ok(STATUSES.includes(v.status));
});

test('a booking for tomorrow is confirmed and waits for its day', async () => {
  let t = 1_000_000;
  const d = createDispatch('mock', { now: () => t, confirmAfterMs: 1000, allocateAfterMs: 5000 });
  const job = await d.createBooking({ ...booking, asap: false, pickupAt: new Date(t + 24 * 3600e3).toISOString() });
  t += 60_000;
  const v = await d.getBooking(job.ref);
  assert.equal(v.status, 'confirmed');
  assert.equal(v.driver, undefined);
});

test('a cancelled booking stays cancelled', async () => {
  let t = 1_000_000;
  const d = createDispatch('mock', { now: () => t, confirmAfterMs: 1000, allocateAfterMs: 5000 });
  const job = await d.createBooking({ ...booking, pickupAt: new Date(t).toISOString() });
  await d.cancelBooking(job.ref);
  t += 60_000;
  assert.equal((await d.getBooking(job.ref)).status, 'cancelled');
  assert.equal(await d.getBooking('TW-00000'), null);
});

test('the allocation event carries a driver even when the timer fires before the clock agrees', async () => {
  // Found 15/10/2026: a timer can fire a millisecond before Date.now() reaches
  // the allocation time, and the view then said "confirmed" with no driver.
  // Mounted in the main site, the notification that read it crashed the
  // whole process. The clock here is held back to reproduce that exactly.
  let t = 2_000_000;
  const events = [];
  const d = createDispatch('mock', { now: () => t, confirmAfterMs: 1, allocateAfterMs: 20, onEvent: (type, view) => events.push({ type, view }) });
  await d.createBooking({ ...booking, pickupAt: new Date(t).toISOString() });
  t += 19; // the wall clock is one millisecond short when the timer fires
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(events.length, 1);
  assert.equal(events[0].view.status, 'allocated');
  assert.ok(events[0].view.driver && events[0].view.driver.name);
});

test('a dispatch event that cannot be read is dropped, never thrown', () => {
  const notify = require('../lib/notify');
  const record = { name: 'Tom Test', phone: '07700 900123' };
  assert.doesNotThrow(() => notify.driverAllocated(record, { ref: 'TW-12345', status: 'confirmed' }));
  assert.doesNotThrow(() => notify.driverAllocated(record, undefined));
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /onEvent: \(type, view\) => {\s*try {[\s\S]*?} catch \(err\) {/, 'the dispatch event handler must catch its own errors');
});
