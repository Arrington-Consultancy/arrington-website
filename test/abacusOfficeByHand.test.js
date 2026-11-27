'use strict';

// Keying a booking into iCabbi by hand (Tom, 27 November 2026: until iCabbi
// is plugged in, "we need to find the easiest way for staff to transport the
// information manually... each bit can be copied to a clipboard and pasted
// into icabbi"). The first half runs everywhere. The second half needs
// ABACUS_OFFICE_TEST_DATABASE_URL and works in its own schema.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const dispatch = require('../abacus-office/lib/dispatch');
const ai = require('../abacus-office/lib/ai');
const { firm: firmFrom } = require('../abacus-office/lib/firm');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;
const VIEWS = path.join(__dirname, '..', 'abacus-office', 'views');

test('with no dispatch system connected the office is by hand: it records what staff keyed in and books nothing itself', async () => {
  const rows = [];
  const store = {
    nextDispatchRef: async (prefix, attempt) => `${prefix}-${10001 + attempt}`,
    insertDispatchBooking: async (b) => { if (rows.some((r) => r.ref === b.ref)) { const e = new Error('duplicate'); e.code = '23505'; throw e; } rows.push(b); return b; }
  };
  const d = dispatch.createDispatch({ store, env: {}, prefix: 'AB' });
  assert.equal(d.manual, true);
  assert.equal(d.live, false);
  assert.equal(d.system, 'iCabbi');
  assert.match(d.label, /^iCabbi \(keyed in by hand\)$/);
  assert.match(dispatch.describeDispatchStatus({}), /by hand .*the office books nothing in iCabbi/);

  const job = { date: '2031-06-12', time: '06:00', pickup: 'A', destination: 'B', name: 'J', phone: '1', passengers: '2' };
  // iCabbi's own job number becomes the reference.
  let r = await d.book({ job, kase: { id: 1 }, brand: 'abacus', actor: { id: 1, username: 'sam' }, manualRef: '  483920 ' });
  assert.deepEqual([r.ref, r.manual, r.numbered], ['483920', true, true]);
  assert.equal(rows[0].externalId, '483920');
  // The same number on another email is a slip, not a second record.
  await assert.rejects(d.book({ job, kase: { id: 2 }, brand: 'abacus', actor: null, manualRef: '483920' }), (e) => e.code === 'REFUSED' && /already recorded in this office against another email/.test(e.message));
  assert.equal(rows.length, 1);
  // No number given: the office keeps its own reference and says so.
  r = await d.book({ job, kase: { id: 3 }, brand: 'abacus', actor: null, manualRef: '' });
  assert.deepEqual([r.ref, r.numbered], ['AB-10001', false]);
  assert.match(r.statusWords, /no iCabbi job number given/);
  // A number is letters, digits and a few marks: nothing else is kept.
  assert.equal(dispatch.cleanRef('<b>12 / A-7</b>"; drop'), 'b12 / A-7/b drop');
  assert.equal(dispatch.cleanRef('x'.repeat(80)).length, 40);
  // Another system's name, if the firm's is not iCabbi.
  assert.equal(dispatch.createDispatch({ store, env: { ABACUS_OFFICE_DISPATCH_NAME: 'Autocab' } }).system, 'Autocab');
  // With iCabbi connected nothing is by hand.
  assert.equal(Boolean(dispatch.createDispatch({ store, env: { ABACUS_OFFICE_DISPATCH_DRIVER: 'icabbi' } }).manual), false);
});

test('every line of the job has its own Copy button, and the script copies the line as it stands, a date the UK way', async () => {
  const html = await ejs.renderFile(path.join(VIEWS, 'partials', 'job-fields.ejs'), { j: { date: '2031-06-12', time: '06:00', pickup: '12 Arwenack Street', destination: 'Newquay Airport', name: "Jenna O'Neil", phone: '07700 900123', passengers: '4', flight: 'FR 1234' }, p: 'bk', copy: true });
  for (const id of ['date', 'time', 'pickup', 'destination', 'name', 'phone', 'passengers', 'vehicle', 'notes', 'flight']) {
    assert.match(html, new RegExp(`id="bk-${id}"`), `${id} has a field`);
    assert.match(html, new RegExp(`data-copy-from="bk-${id}"`), `${id} has a Copy button`);
  }
  assert.match(html, /data-copy-from="bk-date" data-copy-as="ukdate"/);
  assert.match(html, /value="Jenna O&#39;Neil"/, 'what the AI read is escaped');
  assert.doesNotMatch(html, /style="/, 'no inline style: the office runs under a strict CSP');
  // Without copy (iCabbi connected) the same fields carry no Copy buttons.
  const plain = await ejs.renderFile(path.join(VIEWS, 'partials', 'job-fields.ejs'), { j: {}, p: 'bk' });
  assert.doesNotMatch(plain, /data-copy-from/);
  assert.match(plain, /name="phone"/);

  // The script, run against a stand-in page.
  const js = fs.readFileSync(path.join(__dirname, '..', 'abacus-office', 'public', 'office.js'), 'utf8');
  const block = js.slice(js.lastIndexOf('(function () {\n// Keying a job into the dispatch system by hand'));
  assert.ok(block.length > 200, 'the copy block is in office.js');
  const copied = [];
  const fields = { 'bk-date': { tagName: 'INPUT', value: '2031-06-12' }, 'bk-phone': { tagName: 'INPUT', value: ' 07700 900123 ' }, 'bk-name': { tagName: 'INPUT', value: 'Jenna' }, 'bk-time': { tagName: 'INPUT', value: '06:00' }, 'bk-flight': { tagName: 'INPUT', value: '' },
    'bk-vehicle': { tagName: 'SELECT', selectedIndex: 0, options: [{ text: '8 seater' }] } };
  let onClick = null;
  const sandbox = {
    document: { addEventListener: (type, fn) => { if (type === 'click') onClick = fn; }, getElementById: (id) => fields[id] || null },
    navigator: { clipboard: { writeText: (t) => { copied.push(t); return Promise.resolve(); } } },
    setTimeout: () => 0
  };
  // eslint-disable-next-line no-new-func
  new Function('document', 'navigator', 'setTimeout', block)(sandbox.document, sandbox.navigator, sandbox.setTimeout);
  const button = (attrs) => { const b = { textContent: 'Copy', attrs: { ...attrs }, getAttribute: (k) => (k in b.attrs ? b.attrs[k] : null), setAttribute: (k, v) => { b.attrs[k] = v; }, hasAttribute: (k) => k in b.attrs }; b.closest = () => b; return b; };
  onClick({ target: button({ 'data-copy-from': 'bk-date', 'data-copy-as': 'ukdate' }) });
  onClick({ target: button({ 'data-copy-from': 'bk-phone' }) });
  const empty = button({ 'data-copy-from': 'bk-flight' });
  onClick({ target: empty });
  onClick({ target: button({ 'data-copy-job': 'bk' }) });
  assert.equal(copied[0], '12/06/2031', 'a date is copied day, month, year');
  assert.equal(copied[1], '07700 900123', 'spaces round it are left off');
  assert.equal(empty.textContent, 'Empty', 'an empty line says so and copies nothing');
  assert.equal(copied[2], 'Passenger: Jenna\nPhone: 07700 900123\nDate: 12/06/2031\nPickup time: 06:00\nVehicle: 8 seater', 'the whole job, only the lines that have something in them');
  assert.equal(copied.length, 3);
});

test('over HTTP: a booking email is set out to copy, staff record the iCabbi job number, the reply then confirms it, and nothing is recorded twice', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_byhand_test';
  const admin = new Pool({ connectionString: DB });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);
  await admin.end();
  const pool = new Pool({ connectionString: DB, options: `-c search_path=${SCHEMA}` });
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const store = new Store(pool);
  await store.ensureSchema();
  await store.createUser({ username: 'sam', displayName: 'Sam', password: 'sam-pass-123456', role: 'operator', brand: '' });

  const guided = [];
  ai.__setClientFactoryForTests(() => ({ messages: { create: async ({ messages }) => {
    guided.push(messages[0].content);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply: 'Hello Jenna,\nYour taxi is booked for 6am on 12 June from 12 Arwenack Street to Newquay Airport.\nThanks,\nCornwall Taxis', held_back: '' }) }] };
  } } }));
  t.after(() => ai.__setClientFactoryForTests(null));

  const mailbox = { name: 'none', label: 'No mailbox connected', demo: false, none: true, off: true, configured: () => false, missing: () => [], listInbox: async () => [], account: async () => null, saveReplyDraft: async () => ({ draftId: null }), saveNewDraft: async () => ({ draftId: null }) };
  const f = { ...firmFrom({}), demo: false, logo: '', mailboxBrand: '', brands: [] };
  const { app } = createApp({ pool, mailbox, firm: f, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => true, alertsEnv: {}, dispatchEnv: {} });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end(); });

  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
  const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: cookie() }, redirect: 'manual' }); absorb(res); return { status: res.status, location: res.headers.get('location'), text: await res.text() }; };
  const post = async (p, fields, from) => {
    const page = await get(from);
    const token = (page.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    const res = await fetch(base + p, { method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: token, ...fields }), redirect: 'manual' });
    absorb(res);
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  };
  let r = await post('/login', { username: 'sam', password: 'sam-pass-123456', next: '/' }, '/login');
  assert.equal(r.status, 302);

  const seed = async (key, reading) => {
    const row = await store.insertCase({ id: key, messageId: `<${key}@test>`, from: 'Jenna Pascoe <jenna@example.invalid>', subject: `Taxi to the airport ${key}`, body: 'Hi, can I book a taxi to Newquay airport on 12 June at 6am from 12 Arwenack Street? There are 4 of us. Jenna 07700 900123', receivedAt: new Date().toISOString() }, '');
    await store.updateCase(row.id, { kind: 'bookings', status: 'new', reading_source: 'ai', draft: 'Hello Jenna,\nThanks for getting in touch. We will confirm once it is in the system.\nThanks,\nCornwall Taxis', ai_draft: 'x',
      reading: { intent: 'new_booking', customer_name: 'Jenna Pascoe', phone: '07700 900123', reference: '', journey: { date: '2031-06-12', time: '06:00', pickup: '12 Arwenack Street, Falmouth', destination: 'Newquay Airport', passengers: '4', flight: '' }, missing: reading || [], seriousness: 'none', summary: 'Wants a taxi to the airport.', reply: '' } });
    return row.id;
  };
  const one = await seed('one', ['a flight number']);

  // The page sets the job out to copy and says the office books nothing itself.
  r = await get(`/case/${one}`);
  assert.match(r.text, /Into iCabbi, by hand/);
  assert.match(r.text, /Copy puts that one line on your clipboard, ready to paste into iCabbi/);
  assert.match(r.text, /The office books nothing in iCabbi itself/);
  assert.match(r.text, /The email does not give: a flight number/);
  for (const id of ['date', 'time', 'pickup', 'destination', 'name', 'phone', 'passengers']) assert.match(r.text, new RegExp(`data-copy-from="bk-${id}"`));
  assert.match(r.text, /id="bk-phone" name="phone" type="tel" value="07700 900123"/);
  assert.match(r.text, /data-copy-job="bk"/);
  assert.match(r.text, /name="manual_ref"/);
  assert.match(r.text, /Record it as booked in iCabbi/);
  assert.doesNotMatch(r.text, /stand-in|Book it in/i);

  const job = { date: '2031-06-12', time: '06:00', pickup: '12 Arwenack Street, Falmouth', destination: 'Newquay Airport', name: 'Jenna Pascoe', phone: '07700 900123', passengers: '4', vehicle: 'Car (up to 4)', notes: '', flight: '' };
  // Not without the tick, and not with a detail missing.
  await post(`/case/${one}/book`, { ...job, manual_ref: '483920' }, `/case/${one}`);
  assert.equal((await store.caseById(one)).dispatch_ref, '');
  r = await get(`/case/${one}`);
  assert.match(r.text, /Tick the box to say you have keyed this job into iCabbi/);
  await post(`/case/${one}/book`, { ...job, phone: '', manual_ref: '483920', signed_off: 'yes' }, `/case/${one}`);
  assert.equal((await store.caseById(one)).dispatch_ref, '');
  assert.equal(guided.length, 0);

  // With both: recorded under iCabbi's own number, by name, and the AI rewrites the reply to confirm it.
  await post(`/case/${one}/book`, { ...job, manual_ref: '483920', signed_off: 'yes' }, `/case/${one}`);
  let kase = await store.caseById(one);
  assert.equal(kase.dispatch_ref, '483920');
  const row = await store.dispatchBookingByRef('483920');
  assert.equal(row.external_id, '483920');
  assert.equal(row.booked_by_name, 'Sam');
  assert.equal(row.job.passengers, '4');
  assert.equal(guided.length, 1, 'the reply was redrafted once');
  assert.match(guided[0], /This job is now booked in iCabbi as job 483920: 2031-06-12 06:00, 12 Arwenack Street, Falmouth to Newquay Airport, 4 passengers/);
  assert.match(kase.draft, /Your taxi is booked/);
  assert.equal(kase.approved_at, null, 'the confirming reply is still a draft for staff to approve');
  const events = (await store.eventsFor(one)).map((e) => e.detail).join('\n');
  assert.match(events, /Keyed into iCabbi by hand as job 483920: .*Recorded by Sam/);
  r = await get(`/case/${one}`);
  assert.match(r.text, /Keyed into iCabbi by hand as job 483920/);
  assert.match(r.text, /The customer has cancelled this job/);

  // Pressed again: nothing recorded twice.
  await post(`/case/${one}/book`, { ...job, manual_ref: '483921', signed_off: 'yes' }, `/case/${one}`);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM dispatch_bookings')).rows[0].n, 1);

  // The same iCabbi number against a second email is refused in words.
  const two = await seed('two');
  await post(`/case/${two}/book`, { ...job, manual_ref: '483920', signed_off: 'yes' }, `/case/${two}`);
  assert.equal((await store.caseById(two)).dispatch_ref, '');
  r = await get(`/case/${two}`);
  assert.match(r.text, /iCabbi job 483920 is already recorded in this office against another email/);
  // With no number the office keeps its own reference and says so.
  await post(`/case/${two}/book`, { ...job, signed_off: 'yes' }, `/case/${two}`);
  kase = await store.caseById(two);
  assert.match(kase.dispatch_ref, /^[A-Z]{2,3}-\d{5}$/);
  r = await get(`/case/${two}`);
  assert.match(r.text, /No iCabbi job number was given, so the office calls it/);
  assert.match(guided[guided.length - 1], /This job is now booked: 2031-06-12 06:00/, 'the office\'s own reference is not given to the customer');

  // A change made in iCabbi by hand is recorded against the job, in words.
  r = await post(`/case/${one}/change-booking`, { ...job, time: '06:30', signed_off: 'yes' }, `/case/${one}`);
  assert.equal((await store.dispatchBookingByRef('483920')).job.time, '06:30');
  assert.match((await store.eventsFor(one)).map((e) => e.detail).join('\n'), /483920: change recorded, made in iCabbi by hand: time from 06:00 to 06:30\. Recorded by Sam/);
  // And a cancellation.
  await post(`/case/${one}/cancel-booking`, { reason: 'Customer emailed to cancel', signed_off: 'yes' }, `/case/${one}`);
  assert.equal((await store.dispatchBookingByRef('483920')).status, 'cancelled');
  assert.match((await store.eventsFor(one)).map((e) => e.detail).join('\n'), /483920 recorded as cancelled \(cancelled in iCabbi by hand\)\. Reason: Customer emailed to cancel/);
});
