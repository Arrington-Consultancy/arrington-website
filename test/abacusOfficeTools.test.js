'use strict';

// The office tools of 11 November 2026, built on the branch while Dan sees
// nothing new: search, standard replies, the tariff and fare calculator,
// changing or cancelling a booking by its reference, reports and the
// spreadsheet download. The first half runs everywhere; the second needs
// ABACUS_OFFICE_TEST_DATABASE_URL and works in a schema of its own.

const test = require('node:test');
const assert = require('node:assert/strict');
const fares = require('../abacus-office/lib/fares');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;
const BRANDS = [{ id: 'abacus', name: 'Abacus & Falmouth Taxis' }, { id: 'coastline', name: 'Coastline Travel' }];

test('the fare calculator works from the tariff and never guesses', () => {
  const { tariff } = fares.readTariff({ flag: '3.60', per_mile: '2.20', wait_per_minute: '0.40', minimum: '6', night_from: '23:00', night_to: '06:00', night_rate: '1.5', sunday_rate: '', holiday_rate: '1.5', festive_rate: '2', large_rate: '1.5' });
  assert.ok(tariff);
  // Tuesday 10 November 2026, 14:00: day rate. 3.60 + 10 x 2.20 + 5 x 0.40 = 27.60
  let f = fares.fare(tariff, { miles: '10', wait: '5', date: '2026-11-10', time: '14:00', vehicle: 'Car (up to 4)' });
  assert.equal(f.pence, 2760);
  assert.equal(f.rateName, 'day rate');
  // Night, across midnight both ways.
  assert.equal(fares.fare(tariff, { miles: '10', date: '2026-11-10', time: '23:30' }).pence, 3840, '25.60 x 1.5');
  assert.equal(fares.fare(tariff, { miles: '10', date: '2026-11-10', time: '05:59' }).rateName, 'night rate');
  assert.equal(fares.fare(tariff, { miles: '10', date: '2026-11-10', time: '06:00' }).rateName, 'day rate');
  // A Sunday with no Sunday rate is the day rate; a bank holiday is not.
  assert.equal(fares.fare(tariff, { miles: '10', date: '2026-11-08', time: '12:00' }).rateName, 'day rate');
  assert.equal(fares.fare(tariff, { miles: '10', date: '2026-12-28', time: '12:00' }).rateName, 'bank holiday rate', 'the Boxing Day substitute in 2026');
  // Christmas Day: the festive rate beats the night rate and the bank holiday.
  f = fares.fare(tariff, { miles: '10', date: '2026-12-25', time: '23:30' });
  assert.equal(f.rateName, 'Christmas and New Year rate');
  assert.equal(f.pence, 5120);
  // An 8 seater on top of the night rate.
  assert.equal(fares.fare(tariff, { miles: '10', date: '2026-11-10', time: '23:30', vehicle: '8 seater' }).pence, 5760);
  // The minimum fare, and rounding to 10p.
  assert.equal(fares.fare(tariff, { miles: '0.5', date: '2026-11-10', time: '12:00' }).pence, 600);
  assert.equal(fares.fare(tariff, { miles: '1.33', date: '2026-11-10', time: '12:00' }).pence, 650, '3.60 + 2.93 is 6.53, shown to the nearest 10p');
  // Nothing is guessed.
  assert.match(fares.fare(tariff, { miles: '', date: '2026-11-10', time: '12:00' }).error, /miles/);
  assert.match(fares.fare(null, { miles: '3', date: '2026-11-10', time: '12:00' }).error, /No tariff/);
  assert.match(fares.readTariff({ per_mile: 'two pounds' }).error, /pounds and pence/);
  assert.match(fares.readTariff({ per_mile: '2', night_rate: '9' }).error, /between 1 and 4/);
  assert.match(fares.readTariff({ per_mile: '2', night_from: '25:00' }).error, /24-hour/);
  // A fixed price wins, in either direction, only for the right vehicle.
  const prices = [{ from_place: 'Falmouth', to_place: 'Newquay Airport', vehicle: 'Car (up to 4)', price_pence: 6500 }];
  assert.equal(fares.fixedFor(prices, 'newquay airport', 'Falmouth town centre', 'Car (up to 4)').price_pence, 6500);
  assert.equal(fares.fixedFor(prices, 'Falmouth', 'Newquay Airport', '8 seater'), null);
  assert.equal(fares.fixedFor(prices, 'Truro', 'Newquay Airport', 'Car (up to 4)'), null);
});

test('over HTTP: search, standard replies, fares, changing a booking, reports and the spreadsheet', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_tools_test';
  const admin = new Pool({ connectionString: DB });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);
  await admin.end();
  const pool = new Pool({ connectionString: DB, options: `-c search_path=${SCHEMA}` });
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const store = new Store(pool);
  await store.ensureSchema();
  await store.createUser({ username: 'owner', password: 'owner-pass-12345', role: 'owner' });
  await store.createUser({ username: 'sam', password: 'sam-pass-123456', role: 'operator', brand: 'abacus' });
  await store.createUser({ username: 'cora', password: 'cora-pass-123456', role: 'manager', brand: 'coastline' });
  const mk = async (id, { kind = 'bookings', brand = 'abacus', subject = id, body = 'x', reading = null } = {}) => {
    const row = await store.insertCase({ id, from: `${id}@example.invalid`, subject, body, receivedAt: new Date(Date.now() - 3600 * 1000).toISOString(), threadId: id, messageId: `<${id}@example.invalid>` }, brand);
    await store.updateCase(row.id, { kind, reading, reading_source: reading ? 'prepared' : 'none', reading_note: 'test' });
    return row.id;
  };
  const journey = { date: '2026-12-01', time: '09:30', pickup: '1 Arwenack Street, Falmouth', destination: 'Newquay Airport', passengers: '2', flight: 'FR 1234' };
  const newBooking = await mk('nb1', { subject: 'Airport run for the Penroses', body: 'Please book 2 of us to Newquay Airport, mobile 07700 900123', reading: { intent: 'new_booking', summary: 'A booking', customer_name: 'Ann Penrose', phone: '07700 900123', journey, missing: [] } });
  const changeEmail = await mk('ch1', { subject: 'Change of time', reading: { intent: 'change', summary: 'Move the airport run', customer_name: 'Ann Penrose', phone: '07700 900123', journey: { ...journey, time: '10:15' }, missing: [] } });
  const cancelEmail = await mk('cx1', { subject: 'Please cancel', reading: { intent: 'cancel', summary: 'Cancel it', customer_name: 'Ann Penrose', phone: '07700 900123', journey, missing: [] } });
  await mk('co2', { brand: 'coastline', subject: '=2+2 urgent', reading: { intent: 'enquiry', summary: 'x' } });
  const coast = await mk('co1', { brand: 'coastline', subject: 'Coastline: =HYPERLINK("http://evil.example") booking', body: 'Penrose family, station run', reading: { intent: 'new_booking', summary: 'x', customer_name: 'Bob Penrose', phone: '07700 900999', journey, missing: [] } });

  const firm = { name: 'Cornwall Taxis', short: 'Cornwall', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Cornwall Taxis', facts: [], demo: true, logo: '', mailboxBrand: 'abacus', brands: BRANDS.map((b) => ({ ...b, logo: '' })) };
  const mailbox = { name: 'test', label: 'Test', demo: true, configured: () => true, missing: () => [], listInbox: async () => [], account: async () => null, saveReplyDraft: async () => ({}) };
  const { app } = createApp({ pool, mailbox, firm, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => false, alertsEnv: {} });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end(); });

  function client() {
    const jar = new Map();
    const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
    const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: cookie() }, redirect: 'manual' }); absorb(res); return { status: res.status, location: res.headers.get('location'), headers: res.headers, text: await res.text() }; };
    const post = async (p, fields, from = '/login') => {
      const page = await get(from);
      const token = (page.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      const res = await fetch(base + p, { method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: token, ...fields }), redirect: 'manual' });
      absorb(res);
      return { status: res.status, location: res.headers.get('location'), text: await res.text() };
    };
    const flashAfter = async (p) => { const r = await get(p); return (r.text.match(/class="to-flash[^"]*" role="status">([^<]*)</) || [])[1] || ''; };
    return { get, post, flashAfter };
  }
  const own = client();
  await own.post('/login', { username: 'owner', password: 'owner-pass-12345', next: '/' });
  const sam = client();
  await sam.post('/login', { username: 'sam', password: 'sam-pass-123456', next: '/' });
  const cora = client();
  await cora.post('/login', { username: 'cora', password: 'cora-pass-123456', next: '/' });

  // ---- Search: every status, and only what the person may see.
  let r = await own.get('/inbox?q=Penrose');
  assert.match(r.text, /Airport run for the Penroses/);
  assert.match(r.text, /Coastline: =HYPERLINK/, 'the owner finds every company');
  r = await sam.get('/inbox?q=penrose');
  assert.match(r.text, /Airport run for the Penroses/);
  assert.doesNotMatch(r.text, /Coastline: =HYPERLINK/, 'an Abacus operator never finds a Coastline email');
  r = await sam.get('/inbox?q=900999');
  assert.match(r.text, /Nothing matches/, 'not even by the phone number the AI read');
  assert.match((await own.get(`/inbox?q=%23${newBooking}`)).text, /Airport run for the Penroses/, 'a case number finds the case');
  assert.match((await own.get('/inbox?q=100%25')).text, /Nothing matches/, 'a % is a character, not a wildcard');

  // ---- Standard replies.
  r = await cora.post('/settings/replies', { title: 'Lost property', body: 'Anything left in a Coastline car is handed in to the office the same day.', brand: 'abacus' }, '/settings');
  const rows = await store.standardReplies();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].brand, 'coastline', 'a manager set to Coastline adds Coastline\'s, whatever the form says');
  await own.post('/settings/replies', { title: 'Paying', body: 'We take cash and cards in every car.', brand: '*' }, '/settings');
  await own.post('/settings/replies', { title: 'Accounts', body: 'Abacus opens a business account within a day.', brand: 'abacus' }, '/settings');
  r = await sam.get(`/case/${newBooking}`);
  assert.match(r.text, /<option value="We take cash and cards in every car.">Paying<\/option>/, 'a reply for every company is offered');
  assert.match(r.text, />Accounts<\/option>/);
  assert.doesNotMatch(r.text, /Lost property/, 'a Coastline reply is not offered on an Abacus email');
  const abacusReply = (await store.standardReplies('abacus'))[0];
  await cora.post(`/settings/replies/${abacusReply.id}/delete`, {}, '/settings');
  assert.ok(await store.standardReplyById(abacusReply.id), 'a Coastline manager cannot remove an Abacus reply');
  assert.equal((await sam.post('/settings/replies', { title: 'x', body: 'operators cannot add these' }, '/')).status, 404);
  const { Office } = require('../abacus-office/lib/cases');
  const f = await new Office({ store, mailbox, firm }).firmFor({ brand: 'abacus' });
  assert.deepEqual(f.standardReplies.map((x) => x.title).sort(), ['Accounts', 'Paying'], 'the AI is given the company\'s replies and the shared ones');

  // ---- Tariff and fares.
  r = await sam.get('/fares');
  assert.match(r.text, /No tariff has been set/);
  assert.equal((await sam.post('/settings/tariff', { per_mile: '2' }, '/')).status, 404, 'an operator cannot set the tariff');
  await own.post('/settings/tariff', { brand: 'abacus', flag: '3.60', per_mile: '2.20', wait_per_minute: '0.40', minimum: '6', night_from: '23:00', night_to: '06:00', night_rate: '1.5', sunday_rate: '1', holiday_rate: '1.5', festive_rate: '2', large_rate: '1.5' }, '/settings');
  r = await sam.get('/fares?miles=10&wait=5&date=2026-11-10&time=14:00&vehicle=Car+(up+to+4)');
  assert.match(r.text, /£27\.60/);
  await own.post('/settings/prices', { from_place: 'Falmouth', to_place: 'Newquay Airport', vehicle: 'Car (up to 4)', price: '65', brand: 'abacus' }, '/settings');
  r = await sam.get('/fares?from=Newquay+Airport&to=Falmouth&miles=26&date=2026-11-10&time=14:00&vehicle=Car+(up+to+4)');
  assert.match(r.text, /Fixed price<\/p>\s*<p class="to-fare">£65\.00/, 'a fixed price comes first');
  assert.match((await sam.get('/fares?brand=coastline&miles=10&date=2026-11-10&time=14:00')).text, /£25\.60/, 'an Abacus operator asking for Coastline\'s tariff gets Abacus\'s');
  assert.match((await own.get('/fares?brand=coastline&miles=10&date=2026-11-10&time=14:00')).text, /No tariff has been set for this company/, 'Coastline has none of its own');

  // ---- Booking, then changing and cancelling it by reference.
  await sam.post(`/case/${newBooking}/book`, { ...journey, name: 'Ann Penrose', phone: '07700 900123', vehicle: 'Car (up to 4)', signed_off: 'yes' }, `/case/${newBooking}`);
  const booked = await store.caseById(newBooking);
  assert.match(booked.dispatch_ref, /^[A-Z]+-\d{5}$/);
  const ref = booked.dispatch_ref;
  r = await sam.get(`/case/${changeEmail}`);
  assert.match(r.text, /Dispatch reference of the booking/);
  // Without the tick, nothing changes.
  await sam.post(`/case/${changeEmail}/change-booking`, { ref, ...journey, time: '10:15', name: 'Ann Penrose', phone: '07700 900123', passengers: '2' }, `/case/${changeEmail}`);
  assert.equal((await store.dispatchBookingByRef(ref)).job.time, '09:30');
  // An unknown reference, and another company's booking, are refused alike.
  await sam.post(`/case/${changeEmail}/change-booking`, { ref: 'AB-99999', ...journey, time: '10:15', name: 'Ann Penrose', phone: '07700 900123', signed_off: 'yes' }, `/case/${changeEmail}`);
  assert.equal((await store.caseById(changeEmail)).dispatch_ref, '');
  await own.post(`/case/${coast}/book`, { ...journey, name: 'Bob Penrose', phone: '07700 900999', signed_off: 'yes' }, `/case/${coast}`);
  const coastRef = (await store.caseById(coast)).dispatch_ref;
  await sam.post(`/case/${changeEmail}/change-booking`, { ref: coastRef, ...journey, time: '07:00', name: 'Bob Penrose', phone: '07700 900999', signed_off: 'yes' }, `/case/${changeEmail}`);
  assert.equal((await store.dispatchBookingByRef(coastRef)).job.time, '09:30', 'an Abacus operator cannot change a Coastline booking by typing its reference');
  // The real change.
  await sam.post(`/case/${changeEmail}/change-booking`, { ref, ...journey, time: '10:15', name: 'Ann Penrose', phone: '07700 900123', signed_off: 'yes' }, `/case/${changeEmail}`);
  assert.equal((await store.dispatchBookingByRef(ref)).job.time, '10:15');
  assert.equal((await store.caseById(changeEmail)).dispatch_ref, ref, 'the change email is linked to the booking');
  const evOrig = (await store.eventsFor(newBooking)).map((e) => e.detail).join('\n');
  assert.match(evOrig, new RegExp(`${ref} changed in .*time from 09:30 to 10:15.*Signed off by sam, from email ${changeEmail}`), 'the original email\'s history says what changed and where from');
  // Changing it to what it already is changes nothing.
  r = await sam.post(`/case/${changeEmail}/change-booking`, { ...journey, time: '10:15', name: 'Ann Penrose', phone: '07700 900123', signed_off: 'yes' }, `/case/${changeEmail}`);
  assert.match(await sam.flashAfter(`/case/${changeEmail}`), /Nothing in the job is different/);
  // Cancelled by reference from a cancel email.
  await sam.post(`/case/${cancelEmail}/cancel-booking`, { ref, reason: 'Flight cancelled', signed_off: 'yes' }, `/case/${cancelEmail}`);
  assert.equal((await store.dispatchBookingByRef(ref)).status, 'cancelled');
  assert.equal((await store.caseById(newBooking)).dispatch_ref, '', 'the email that booked it no longer shows it in dispatch');
  await sam.post(`/case/${changeEmail}/change-booking`, { ref, ...journey, time: '11:00', name: 'Ann Penrose', phone: '07700 900123', signed_off: 'yes' }, `/case/${changeEmail}`);
  assert.equal((await store.dispatchBookingByRef(ref)).job.time, '10:15', 'a cancelled booking cannot be changed');

  // ---- Reports and the spreadsheet.
  assert.equal((await sam.get('/reports')).status, 404, 'reports are for managers and the owner');
  r = await own.get('/reports?days=7');
  assert.equal(r.status, 200);
  assert.match(r.text, /emails and complaints in/);
  r = await own.get('/reports/cases.csv?days=7');
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.text, /"'=HYPERLINK|'Coastline: =HYPERLINK|"Coastline: =HYPERLINK/, 'the email\'s subject is in the file');
  assert.doesNotMatch(r.text, /(^|,)=/m, 'a cell never starts with a formula');
  assert.match(r.text, /,'=2\+2 urgent,/, 'one that would is made plain text');
  r = await cora.get('/reports/cases.csv?days=30');
  assert.match(r.text, /Coastline/);
  assert.doesNotMatch(r.text, /Airport run for the Penroses/, 'a Coastline manager downloads Coastline\'s emails only');

  // ---- Activity for a manager set to one company.
  r = await cora.get('/activity');
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /Airport run for the Penroses|signed off by sam/i, 'a Coastline manager does not see Abacus\'s activity');
});
