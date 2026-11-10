'use strict';

// The Abacus office's iCabbi connection, written against iCabbi's published
// API before the firm's keys exist (Tom, 10 November 2026). A fake iCabbi
// answers in the envelope the spec documents. The last test needs
// ABACUS_OFFICE_TEST_DATABASE_URL and works in a schema of its own, so it
// never touches the tables the other office suites drop.

const test = require('node:test');
const assert = require('node:assert/strict');

const icabbi = require('../abacus-office/lib/icabbi');
const { createDispatch, describeDispatchStatus } = require('../abacus-office/lib/dispatch');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;
const BASE = 'https://api.example-icabbi.invalid/v2';
const ENV = { ABACUS_OFFICE_DISPATCH_DRIVER: 'icabbi', ABACUS_OFFICE_ICABBI_BASE_URL: BASE, ABACUS_OFFICE_ICABBI_API_KEY: 'app-key', ABACUS_OFFICE_ICABBI_SECRET: 'secret-key', ABACUS_OFFICE_ICABBI_VEHICLE_TYPES: 'Car (up to 4)=R4; 8 seater=MPV8' };
const LIVE = { ...ENV, ABACUS_OFFICE_ICABBI_LIVE_WRITES: 'true' };
const JOB = { date: '2026-12-02', time: '05:40', pickup: '12 Arwenack Street, Falmouth', destination: 'Newquay Airport', name: 'Jenna Pascoe', phone: '07700 900123', passengers: '2', vehicle: 'Car (up to 4)', notes: 'Two suitcases', flight: 'fr 1234' };

// A fake iCabbi, in the envelope the spec documents: { version, code, body,
// warnings } on success and { error: true, code, message } on failure.
function fakeIcabbi({ checkError = null, board = [], addFails = null, statuses = {} } = {}) {
  const calls = [];
  async function fetch(url, init = {}) {
    const u = new URL(url);
    const path = u.pathname.replace('/v2', '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path, query: Object.fromEntries(u.searchParams), body, auth: init.headers.Authorization });
    const ok = (b) => ({ ok: true, status: 200, json: async () => ({ version: 242, code: 200, body: b, warnings: [] }) });
    const err = (status, message) => ({ ok: false, status, json: async () => ({ version: 242, error: true, code: status, message }) });
    if (init.headers.Authorization !== `Basic ${Buffer.from('app-key:secret-key').toString('base64')}`) return err(401, 'Invalid credentials');
    if (path === '/bookings/check') return checkError ? err(400, checkError) : ok({ booking: { id: 0, status: 'NEW' } });
    if (path === '/bookings/upcoming') return ok({ total: board.length, bookings: board });
    if (path === '/bookings/add/') {
      if (addFails === 'timeout') throw new Error('The operation was aborted due to timeout');
      if (addFails) return err(500, addFails);
      return ok({ booking: { id: 991, trip_id: '991A', perma_id: '991', status: 'NEW', date: body.date } });
    }
    const m = path.match(/^\/bookings\/(index|cancel)\/(.+)$/);
    if (m && m[1] === 'index') return ok({ booking: { trip_id: decodeURIComponent(m[2]), status: statuses[decodeURIComponent(m[2])] || 'NEW', driver: { name: 'Steve' }, vehicle: { ref: '14' } } });
    if (m && m[1] === 'cancel') return ok({ fee: [] });
    if (path === '/config/vehicletypes') return ok([{ key: 'R4', title: 'Saloon', seats: 4 }, { key: 'MPV8', title: '8 Seater', seats: 8 }]);
    return err(404, 'Not found');
  }
  return { fetch, calls, paths: () => calls.map((c) => `${c.method} ${c.path}`) };
}

function fakeStore() {
  const rows = [];
  return {
    rows,
    async dispatchBookingsForCase(id) { return rows.filter((r) => r.caseId === id); },
    async insertDispatchBooking(r) { rows.push(r); return r; },
    async setDispatchStatus() { return null; }
  };
}

test('a phone becomes E.164, a London time carries its own offset, and the vehicle map reads the firm\'s keys', () => {
  assert.equal(icabbi.toE164('07700 900123'), '+447700900123');
  assert.equal(icabbi.toE164('+44 7700 900123'), '+447700900123');
  assert.equal(icabbi.toE164('0044 1326 312345'), '+441326312345');
  assert.equal(icabbi.toE164('01326 312345'), '+441326312345');
  assert.equal(icabbi.toE164('+353 87 123 4567'), '+353871234567');
  assert.equal(icabbi.toE164('call me'), null);
  assert.equal(icabbi.toE164('0800 123'), null, 'too short is refused, not guessed');
  assert.equal(icabbi.londonIso('2026-07-01', '10:15'), '2026-07-01T10:15:00+01:00', 'summer is BST');
  assert.equal(icabbi.londonIso('2026-12-02', '05:40'), '2026-12-02T05:40:00+00:00', 'winter is GMT');
  assert.deepEqual(icabbi.parseVehicleMap('Car (up to 4)=R4; 8 seater=MPV8; junk; bad=has space'), { 'car (up to 4)': 'R4', '8 seater': 'MPV8' });
});

test('the booking sent to iCabbi is built from the checked job, and anything it cannot be sure of is refused, never guessed', () => {
  const s = icabbi.settings(ENV);
  const b = icabbi.toBooking(JOB, s, { ref: 'abacus-7-1', idempotencyKey: 'office-abacus-7-1', actorName: 'Sam' });
  assert.equal(b.date, '2026-12-02T05:40:00+00:00');
  assert.equal(b.phone, '+447700900123');
  assert.deepEqual(b.address, { formatted: '12 Arwenack Street, Falmouth' });
  assert.deepEqual(b.destination, { formatted: 'Newquay Airport' });
  assert.equal(b.flight_number, 'FR1234');
  assert.equal(b.vehicle_type, 'R4');
  assert.equal(b.idempotency_key, 'office-abacus-7-1', 'a retried request cannot book the job twice');
  assert.match(b.instructions, /^2 passengers\. Two suitcases\. Booked from the office by Sam\.$/);
  assert.deepEqual(Object.keys(icabbi.simple(b)).sort(), ['address', 'date', 'destination', 'name', 'phone'], '/bookings/check gets the basic shape');
  assert.throws(() => icabbi.toBooking({ ...JOB, phone: 'ring the office' }, s), /not one iCabbi will take\. Correct it and try again\. Nothing was booked/);
  assert.throws(() => icabbi.toBooking({ ...JOB, vehicle: 'Wheelchair accessible' }, s), /No iCabbi vehicle type is set for "Wheelchair accessible", so it could go out as an ordinary car/);
  assert.equal(icabbi.toBooking({ ...JOB, vehicle: '8 seater' }, s).vehicle_type, 'MPV8');
  assert.equal(icabbi.toBooking({ ...JOB, vehicle: 'Car (up to 4)' }, icabbi.settings({ ...ENV, ABACUS_OFFICE_ICABBI_VEHICLE_TYPES: '' })).vehicle_type, undefined, 'an ordinary car needs no mapping');
});

test('with live writes off, iCabbi checks the booking and the board, and nothing is written', async () => {
  const g = fakeIcabbi();
  const d = createDispatch({ store: fakeStore(), env: ENV, fetch: g.fetch });
  await assert.rejects(d.book({ job: JOB, kase: { id: 7 }, brand: 'abacus', actor: { username: 'sam' } }), (e) => e.checkedOnly && /accepted them, and nothing on the board clashes\. Live booking is switched off/.test(e.message));
  assert.deepEqual(g.paths(), ['POST /bookings/check', 'GET /bookings/upcoming']);
  assert.match(describeDispatchStatus(ENV), /check only: iCabbi checks each booking and nothing is written/);
});

test('with live writes on: check, then the board, then add, with the keys as Basic auth; the trip number comes back and is recorded', async () => {
  const g = fakeIcabbi();
  const store = fakeStore();
  const d = createDispatch({ store, env: LIVE, fetch: g.fetch });
  const r = await d.book({ job: JOB, kase: { id: 7 }, brand: 'abacus', actor: { username: 'sam', display_name: 'Sam' } });
  assert.deepEqual(g.paths(), ['POST /bookings/check', 'GET /bookings/upcoming', 'POST /bookings/add/']);
  assert.equal(r.ref, '991A');
  assert.equal(r.statusWords, 'in dispatch, no driver yet');
  assert.equal(g.calls[1].query.phone, '+447700900123');
  assert.equal(g.calls[1].query.from, '2026-12-02 00:00:00');
  assert.equal(g.calls[2].body.idempotency_key, 'office-abacus-7-1');
  assert.equal(store.rows[0].externalId, '991A');
  assert.match(describeDispatchStatus(LIVE), /LIVE: signed-off bookings go into iCabbi; 2 vehicle types mapped/);
  // A second booking from the same case gets its own key.
  await d.book({ job: { ...JOB, time: '18:00' }, kase: { id: 7 }, brand: 'abacus', actor: { username: 'sam' } });
  assert.equal(g.calls[5].body.idempotency_key, 'office-abacus-7-2');
});

test('the same job already on the board is refused before anything is added', async () => {
  const g = fakeIcabbi({ board: [{ trip_id: '880A', date: '2026-12-02T06:10:00+00:00', status: 'NEW', address: { formatted: '12 Arwenack St' } }, { trip_id: '870A', date: '2026-12-02T05:45:00+00:00', status: 'CUSTOMER_CANCELLED' }] });
  const d = createDispatch({ store: fakeStore(), env: LIVE, fetch: g.fetch });
  await assert.rejects(d.book({ job: JOB, kase: { id: 7 }, brand: 'abacus' }), /already has a booking for \+447700900123 at 06:10 \(trip 880A\) from 12 Arwenack St\. It looks like the same job, so nothing was booked/);
  assert.equal(g.paths().includes('POST /bookings/add/'), false);
  // Three hours apart is a different job, and a cancelled one never counts.
  const far = fakeIcabbi({ board: [{ trip_id: '880A', date: '2026-12-02T09:00:00+00:00', status: 'NEW' }] });
  await createDispatch({ store: fakeStore(), env: LIVE, fetch: far.fetch }).book({ job: JOB, kase: { id: 8 }, brand: 'abacus' });
  assert.equal(far.paths().at(-1), 'POST /bookings/add/');
});

test('iCabbi\'s own refusal reaches staff in its words; a timeout on the add says it may have gone in; bad keys say so', async () => {
  const refused = fakeIcabbi({ checkError: 'Pickup address could not be found' });
  await assert.rejects(createDispatch({ store: fakeStore(), env: LIVE, fetch: refused.fetch }).book({ job: JOB, kase: { id: 7 }, brand: 'a' }), /iCabbi said: Pickup address could not be found\. Nothing was booked\./);
  assert.deepEqual(refused.paths(), ['POST /bookings/check']);

  const slow = fakeIcabbi({ addFails: 'timeout' });
  await assert.rejects(createDispatch({ store: fakeStore(), env: LIVE, fetch: slow.fetch }).book({ job: JOB, kase: { id: 7 }, brand: 'a' }), (e) => e.uncertain && /may or may not have gone in\. Look at the board before trying again|may or may not have gone in\. Look on the board/.test(e.message));
  const broken = fakeIcabbi({ addFails: 'Internal error' });
  await assert.rejects(createDispatch({ store: fakeStore(), env: LIVE, fetch: broken.fetch }).book({ job: JOB, kase: { id: 7 }, brand: 'a' }), (e) => e.uncertain);

  const wrongKeys = fakeIcabbi();
  await assert.rejects(createDispatch({ store: fakeStore(), env: { ...LIVE, ABACUS_OFFICE_ICABBI_SECRET: 'old' }, fetch: wrongKeys.fetch }).book({ job: JOB, kase: { id: 7 }, brand: 'a' }), /iCabbi refused the office's keys/);

  await assert.rejects(createDispatch({ store: fakeStore(), env: { ABACUS_OFFICE_DISPATCH_DRIVER: 'icabbi' }, fetch: wrongKeys.fetch }).book({ job: JOB, kase: { id: 7 }, brand: 'a' }), /not connected yet.*ABACUS_OFFICE_ICABBI_BASE_URL, ABACUS_OFFICE_ICABBI_API_KEY, ABACUS_OFFICE_ICABBI_SECRET/);
  assert.match(describeDispatchStatus({ ...ENV, ABACUS_OFFICE_ICABBI_BASE_URL: 'http://plain.example' }), /ABACUS_OFFICE_ICABBI_BASE_URL as an https address/);
});

test('status and vehicle types are read, and the words staff see are plain', async () => {
  const g = fakeIcabbi({ statuses: { '991A': 'ENROUTE' } });
  const d = createDispatch({ store: fakeStore(), env: LIVE, fetch: g.fetch });
  assert.deepEqual(await d.status('991A'), { status: 'ENROUTE', words: 'driver on the way', final: false, driver: 'Steve', vehicle: '14' });
  assert.deepEqual((await d.client.vehicleTypes()).map((t) => t.key), ['R4', 'MPV8']);
  assert.equal(icabbi.statusWords('DISPATCH_CANCELLED'), 'cancelled by dispatch');
  assert.equal(icabbi.FINAL.has('COMPLETED'), true);
  // Nothing but the six documented endpoints is ever called.
  const used = new Set(g.paths().map((p) => p.replace(/\/[^/]*\d[^/]*$/, '/{id}')));
  for (const p of used) assert.ok(['GET /bookings/index/{id}', 'GET /config/vehicletypes'].includes(p), p);
});

test('through the office: the sign-off tick, the record on the case, the status sweep and a cancellation', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_icabbi_test';
  const admin = new Pool({ connectionString: DB });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);
  await admin.end();
  const pool = new Pool({ connectionString: DB, options: `-c search_path=${SCHEMA}` });
  t.after(async () => { await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end(); });
  const { Store } = require('../abacus-office/lib/store');
  const { Office } = require('../abacus-office/lib/cases');
  const store = new Store(pool);
  await store.ensureSchema();
  const sam = await store.createUser({ username: 'sam', displayName: 'Sam', password: 'sam-pass-123456', role: 'operator' });
  const user = await store.userById(sam.id || (await store.userByName('sam')).id);
  const g = fakeIcabbi();
  const dispatch = createDispatch({ store, env: LIVE, fetch: g.fetch });
  const mailbox = { demo: true, label: 'Made-up inbox', configured: () => true, listInbox: async () => [] };
  const office = new Office({ store, mailbox, firm: { name: 'Cornwall Taxis', mailboxBrand: 'abacus', brands: [] }, dispatch, aiOn: () => false, now: () => new Date() });
  const kase = await store.insertCase({ id: 'gm-1', from: 'jenna@example.invalid', subject: 'Airport run', body: 'Taxi please', receivedAt: '2026-11-10T09:00', threadId: 't', messageId: '<m1@example.invalid>' }, 'abacus');
  await store.updateCase(kase.id, { kind: 'bookings', reading: { intent: 'new_booking' } });
  let k = await store.caseById(kase.id);

  await assert.rejects(office.book(k, user, JOB, false), /Tick the sign-off box/);
  assert.equal(g.calls.length, 0, 'no tick, no call to iCabbi at all');
  const r = await office.book(k, user, JOB, true);
  assert.equal(r.ref, '991A');
  k = await store.caseById(kase.id);
  assert.equal(k.dispatch_ref, '991A');
  await assert.rejects(office.book(k, user, JOB, true), /already in dispatch as 991A/);

  // The sweep reads the status and notes the change on the case, once.
  g.calls.length = 0;
  const statusFake = fakeIcabbi({ statuses: { '991A': 'ASSIGN' } });
  const swept = new Office({ store, mailbox, firm: { name: 'x', brands: [] }, dispatch: createDispatch({ store, env: LIVE, fetch: statusFake.fetch }), aiOn: () => false });
  assert.deepEqual(await swept.refreshStatuses(), { checked: 1, changed: 1 });
  assert.deepEqual(await swept.refreshStatuses(), { checked: 1, changed: 0 }, 'an unchanged status is not noted twice');
  let events = (await store.eventsFor(kase.id)).map((e) => `${e.kind}: ${e.detail}`);
  assert.ok(events.some((e) => /^dispatch_status: iCabbi: 991A driver assigned \(driver Steve, car 14\)$/.test(e)), events.join('\n'));
  assert.ok(events.some((e) => /^booked: Booked into iCabbi as 991A: 2026-12-02 05:40, .* signed off by Sam \(in dispatch, no driver yet\)$/.test(e)), events.join('\n'));

  // Cancelling needs the tick and a reason, and is recorded.
  await assert.rejects(office.cancelBooking(k, user, false, 'Customer cancelled'), /Tick the box/);
  await assert.rejects(office.cancelBooking(k, user, true, '  '), /Say why/);
  await swept.cancelBooking(k, user, true, 'Customer emailed to cancel');
  assert.equal(statusFake.paths().at(-1), 'POST /bookings/cancel/991A');
  k = await store.caseById(kase.id);
  assert.equal(k.dispatch_ref, '');
  events = (await store.eventsFor(kase.id)).map((e) => `${e.kind}: ${e.detail}`);
  assert.ok(events.some((e) => /^dispatch_cancelled: 991A cancelled in iCabbi\. Reason: Customer emailed to cancel\. Signed off by Sam$/.test(e)), events.join('\n'));
  assert.deepEqual(await swept.refreshStatuses(), { checked: 0, changed: 0 }, 'a cancelled booking is no longer checked');

  // A refusal from iCabbi is written on the case too.
  const k2row = await store.insertCase({ id: 'gm-2', from: 'a@example.invalid', subject: 'x', body: 'y', receivedAt: '2026-11-10T09:00', threadId: 't2', messageId: '<m2@example.invalid>' }, 'abacus');
  await store.updateCase(k2row.id, { kind: 'bookings' });
  const refusing = new Office({ store, mailbox, firm: { name: 'x', brands: [] }, dispatch: createDispatch({ store, env: LIVE, fetch: fakeIcabbi({ checkError: 'Destination outside the service area' }).fetch }), aiOn: () => false });
  await assert.rejects(refusing.book(await store.caseById(k2row.id), user, JOB, true), /Destination outside the service area/);
  events = (await store.eventsFor(k2row.id)).map((e) => e.kind);
  assert.deepEqual(events.filter((e) => e.startsWith('dispatch_')), ['dispatch_refused']);
});
