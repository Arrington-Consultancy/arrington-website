'use strict';

// The sweep before the office went live to staff (Tom, 26 November 2026,
// after a complaint he logged in the morning disappeared: "Let's do a sweep
// and make sure there are no thunder fuck ups like that. We're going live
// Monday"). Each test is a fault found in that sweep. The first half runs
// everywhere; the second needs ABACUS_OFFICE_TEST_DATABASE_URL and works in a
// schema of its own.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { londonInstant } = require('../abacus-office/lib/store');
const { cleanJob } = require('../abacus-office/lib/dispatch');
const { Office } = require('../abacus-office/lib/cases');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;
const firm = { name: 'Cornwall Taxis', short: 'Cornwall', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Cornwall Taxis', facts: [], fixedPrices: [] };

test('an email\'s time is London time: right in winter, and not an hour out all summer', () => {
  assert.equal(londonInstant('2026-11-26T11:50').toISOString(), '2026-11-26T11:50:00.000Z');
  assert.equal(londonInstant('2026-07-01T11:00').toISOString(), '2026-07-01T10:00:00.000Z', 'summer time is an hour ahead of the server');
  assert.equal(londonInstant('2026-07-01T00:30').toISOString(), '2026-06-30T23:30:00.000Z');
  assert.equal(londonInstant('2026-07-01T10:00:00Z').toISOString(), '2026-07-01T10:00:00.000Z', 'a time with a zone is left alone');
});

test('a job is not booked for a date that does not exist, a time that does not exist, or a pickup already gone', () => {
  const base = { pickup: 'The Moor', destination: 'Penryn', name: 'Claire Rowe', phone: '07700 900999', passengers: '2' };
  assert.match(cleanJob({ ...base, date: '2027-02-31', time: '09:00' }).missing.join(', '), /a date that exists/);
  assert.match(cleanJob({ ...base, date: '2027-02-10', time: '25:99' }).missing.join(', '), /a time as HH:MM/);
  assert.deepEqual(cleanJob({ ...base, date: '2027-02-10', time: '23:59' }).missing, []);

  const at = (iso) => new Office({ store: {}, mailbox: {}, firm, dispatch: {}, aiOn: () => false, now: () => new Date(iso) });
  const noon = at('2026-11-30T12:00:00Z');
  assert.match(noon.pickupGone({ date: '2026-11-29', time: '18:00' }), /has already gone/, 'yesterday');
  assert.match(noon.pickupGone({ date: '2026-11-30', time: '09:00' }), /today has already gone/, 'this morning');
  assert.equal(noon.pickupGone({ date: '2026-11-30', time: '11:50' }), '', 'a job taken down as it happens');
  assert.equal(noon.pickupGone({ date: '2026-11-30', time: '12:30' }), '');
  assert.equal(noon.pickupGone({ date: '2026-12-01', time: '00:10' }), '');
  // Five to midnight, a job for ten past: typed with today's date it is
  // nearly a day in the past.
  assert.match(at('2026-11-30T23:55:00Z').pickupGone({ date: '2026-11-30', time: '00:10' }), /If the job is for tomorrow, change the date/);
  // Summer: half past midnight in London is still yesterday on the server.
  const summer = at('2026-06-30T23:30:00Z');
  assert.equal(summer.pickupGone({ date: '2026-07-01', time: '06:00' }), '');
  assert.match(summer.pickupGone({ date: '2026-06-30', time: '22:00' }), /has already gone/);
});

test('the browser script never keeps a password or a tick box, and sends a form once', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'abacus-office', 'public', 'office.js'), 'utf8');
  assert.match(js, /\['hidden', 'password', 'file', 'submit', 'button', 'checkbox', 'radio'\]/, 'what is never kept');
  assert.match(js, /el\.name === '_csrf'/);
  assert.match(js, /SKIP = \/\^\\\/\(login\|logout\|portal\|account\)/, 'the sign-in and password forms are never kept');
  assert.match(js, /shown\(el\) !== f\.was/, 'a field someone else changed is left alone');
  assert.match(js, /getAttribute\('data-sent'\)\) \{ e\.preventDefault\(\)/, 'a form is sent once');
});

test('over HTTP: a whole office signs in from one address, a double sign-in lands in the office, an old page says so kindly, and no page waits on a slow mailbox', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_golive_test';
  const admin = new Pool({ connectionString: DB });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);
  await admin.end();
  const pool = new Pool({ connectionString: DB, options: `-c search_path=${SCHEMA}` });
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const store = new Store(pool);
  await store.ensureSchema();
  const staff = [];
  for (let i = 1; i <= 12; i += 1) {
    staff.push(`staff${i}`);
    await store.createUser({ username: `staff${i}`, displayName: `Staff ${i}`, password: `staff-pass-${i}-123456`, role: 'operator', brand: '' });
  }

  // A mailbox that takes six seconds to answer, like a real one on a bad day.
  let pulls = 0;
  const mailbox = { name: 'gmail', label: 'Gmail', demo: false, none: false, configured: () => true, missing: () => [], account: async () => null,
    listInbox: () => { pulls += 1; return new Promise((resolve) => { const h = setTimeout(() => resolve([]), 6000); if (h.unref) h.unref(); }); },
    saveReplyDraft: async () => ({ draftId: 'x' }), saveNewDraft: async () => ({ draftId: 'y' }) };
  const { app } = createApp({ pool, mailbox, firm: { ...firm, demo: false, logo: '', mailboxBrand: '', brands: [] }, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => false, alertsEnv: {} });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end(); });

  const browser = () => {
    const jar = new Map();
    const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
    const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: cookie() }, redirect: 'manual' }); absorb(res); return { status: res.status, text: await res.text(), location: res.headers.get('location'), setCookie: res.headers.getSetCookie() }; };
    const tokenOf = (html) => (html.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    const send = async (p, fields, token) => { const res = await fetch(base + p, { method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: token, ...fields }), redirect: 'manual' }); absorb(res); return { status: res.status, text: await res.text(), location: res.headers.get('location') }; };
    return { get, send, tokenOf, jar };
  };

  // A phone asks for its icons before anyone has signed in: not a sign-in redirect.
  let r = await browser().get('/favicon.ico');
  assert.equal(r.status, 404);
  assert.equal((await browser().get('/apple-touch-icon.png')).status, 404);

  // The first page of the day does not wait six seconds for the mailbox.
  const first = browser();
  let started = Date.now();
  r = await first.get('/login');
  assert.equal(r.status, 200);

  // Twelve members of staff sign in from the same address, one after another.
  const signedIn = [];
  for (const name of staff) {
    const b = browser();
    const page = await b.get('/login');
    r = await b.send('/login', { username: name, password: `staff-pass-${name.slice(5)}-123456`, next: '/' }, b.tokenOf(page.text));
    assert.equal(r.status, 302, `${name} signs in (got ${r.status}: the office must not lock out its own staff)`);
    signedIn.push(b);
  }

  // The same form sent a second time (a phone's password filler and a tap):
  // not the expired page, but on into the office.
  const twice = browser();
  let page = await twice.get('/login');
  const loginToken = twice.tokenOf(page.text);
  r = await twice.send('/login', { username: 'staff1', password: 'staff-pass-1-123456', next: '/' }, loginToken);
  assert.equal(r.status, 302);
  r = await twice.send('/login', { username: 'staff1', password: 'staff-pass-1-123456', next: '/' }, loginToken);
  assert.equal(r.status, 302, 'the second copy is not an error page');
  assert.equal(r.location, '/');
  r = await twice.get('/');
  assert.equal(r.status, 200, 'signed in, and on Today');

  // A page that does wait: under four seconds with a six second mailbox.
  started = Date.now();
  r = await signedIn[0].get('/account');
  assert.equal(r.status, 200);
  assert.ok(Date.now() - started < 4500, `the page came back in ${Date.now() - started} ms`);
  assert.ok(pulls >= 1, 'the mailbox was being pulled behind it');
  // A working shift stays signed in: the cookie is renewed on every page.
  assert.ok(r.setCookie.some((c) => /^abacus\.sid=/.test(c)), 'the sign-in cookie is renewed');

  // Wrong passwords for one username: that username waits, with words, and
  // everyone else in the office still signs in.
  const guess = browser();
  page = await guess.get('/login');
  let last;
  for (let i = 0; i < 11; i += 1) {
    page = await guess.get('/login');
    last = await guess.send('/login', { username: 'Staff2', password: 'not-it' }, guess.tokenOf(page.text));
  }
  assert.equal(last.status, 429);
  assert.match(last.text, /Too many wrong tries for that username\. Wait 15 minutes, or ask the owner to reset the password\./);
  const other = browser();
  page = await other.get('/login');
  r = await other.send('/login', { username: 'staff3', password: 'staff-pass-3-123456', next: '/' }, other.tokenOf(page.text));
  assert.equal(r.status, 302, 'another member of staff at the same address is not locked out');

  // A refused action goes back to its own page, not to Today. The office
  // sends no referrer, so the page comes from the address of the form.
  const row = await store.insertCase({ id: 'b1', messageId: '<b1@golive>', from: 'Jenna <jenna@example.invalid>', subject: 'Taxi to the airport', body: 'Can I book a taxi?', receivedAt: new Date().toISOString() }, '');
  await store.updateCase(row.id, { kind: 'bookings', status: 'new', reading_source: 'ai', draft: 'Hi Jenna', reading: { intent: 'new_booking', customer_name: 'Jenna', phone: '', reference: '', journey: {}, missing: [], seriousness: 'none', summary: 'x', reply: '' } });
  page = await signedIn[2].get(`/case/${row.id}`);
  r = await signedIn[2].send(`/case/${row.id}/book`, { date: '2031-01-10', time: '06:00', pickup: 'A', destination: 'B', name: 'Jenna', phone: '07700 900123', passengers: '2' }, signedIn[2].tokenOf(page.text));
  assert.equal(r.location, `/case/${row.id}`, 'a booking refused for want of the sign-off goes back to the email');
  r = await signedIn[2].send(`/case/${row.id}/status`, { status: 'waiting' }, signedIn[2].tokenOf(page.text));
  assert.equal(r.location, `/case/${row.id}`);
  assert.match((await signedIn[2].get(`/case/${row.id}`)).text, /A case waits on the customer once its reply has gone/);

  // A page left open too long: said kindly, marked so what was typed is put back.
  r = await signedIn[1].send('/complaints/log', { channel: 'phone', text: 'The driver was twenty minutes late.' }, 'a-token-from-yesterday');
  assert.equal(r.status, 403);
  assert.match(r.text, /This page had been open too long/);
  assert.match(r.text, /Anything you typed there is put back for you\./);
  assert.match(r.text, /data-keep-typed="1"/);
});
