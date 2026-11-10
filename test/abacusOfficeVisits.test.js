'use strict';

// Who has been in (Tom, 10 November 2026: "Let's find out what dan does
// when he logs on"). The first half runs everywhere; the second needs
// ABACUS_OFFICE_TEST_DATABASE_URL and works in a schema of its own.

const test = require('node:test');
const assert = require('node:assert/strict');
const visits = require('../abacus-office/lib/visits');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;

test('each request becomes a plain line, and background requests are not activity', () => {
  assert.equal(visits.describe('GET', '/'), 'opened Today');
  assert.equal(visits.describe('GET', '/council', { show: 'all' }), 'opened Council (all)');
  assert.equal(visits.describe('GET', '/case/12'), 'opened email 12');
  assert.equal(visits.describe('POST', '/case/12/approve'), 'email 12: approved the reply');
  assert.equal(visits.describe('POST', '/write/3/guide'), 'draft 3: guided the AI');
  assert.equal(visits.describe('POST', '/write'), 'asked the AI to draft an email');
  assert.equal(visits.isBackground({ path: '/live.json' }), true);
  assert.equal(visits.isBackground({ path: '/inbox' }), false);
  const line = visits.summaryLine({ user_name: 'dan', started_at: '2026-11-10T14:00:00Z', last_at: '2026-11-10T14:12:00Z', ended_at: '2026-11-10T14:12:00Z', ended_how: 'signed out', pages: [{ what: 'signed in' }, { what: 'opened Today' }, { what: 'signed out' }] });
  assert.match(line, /^Abacus office visit: dan, .*12 min, 3 step\(s\), ended signed out: opened Today; signed out$/);
});

test('over HTTP: a sign-in opens a visit, every page and button goes on it, the live refresh does not, and signing out closes it', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_visits_test';
  const admin = new Pool({ connectionString: DB });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);
  await admin.end();
  const pool = new Pool({ connectionString: DB, options: `-c search_path=${SCHEMA}` });
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const store = new Store(pool);
  await store.ensureSchema();
  await store.ensureSchema();
  await store.createUser({ username: 'dan', displayName: 'Dan', password: 'dan-pass-123456', role: 'owner' });
  await store.createUser({ username: 'sam', displayName: 'Sam', password: 'sam-pass-123456', role: 'operator' });

  const firm = { name: 'Cornwall Taxis', short: 'Cornwall', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Cornwall Taxis', facts: [], demo: false, logo: '', mailboxBrand: '', brands: [{ id: '', name: 'Cornwall Taxis' }] };
  const mailbox = { name: 'none', label: 'No mailbox', demo: false, none: true, configured: () => false, missing: () => [], listInbox: async () => [], account: async () => null };
  const { app } = createApp({ pool, mailbox, firm, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => false, alertsEnv: {} });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const logged = [];
  const log = console.log;
  console.log = (...a) => { logged.push(a.join(' ')); };
  t.after(async () => { console.log = log; server.close(); await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end(); });
  function client() {
    const jar = new Map();
    const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
    const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: cookie() }, redirect: 'manual' }); absorb(res); return { status: res.status, text: await res.text() }; };
    const post = async (p, fields, from = '/login') => {
      const page = await get(from);
      const token = (page.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      const res = await fetch(base + p, { method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: token, ...fields }), redirect: 'manual' });
      absorb(res);
      return { status: res.status, text: await res.text() };
    };
    return { get, post };
  }
  const settle = () => new Promise((r) => setTimeout(r, 150));

  const dan = client();
  await dan.post('/login', { username: 'dan', password: 'dan-pass-123456', next: '/' });
  await dan.get('/');
  await dan.get('/council');
  await dan.get('/live.json');
  await dan.post('/write', { kind: 'new', prompt: 'Thank the hotel for the booking.' }, '/write');
  await settle();
  let [v] = await store.recentVisits(5);
  assert.equal(v.user_name, 'dan');
  assert.equal(v.ended_at, null, 'still in');
  const steps = v.pages.map((x) => x.what);
  assert.equal(steps[0], 'signed in');
  for (const s of ['opened Today', 'opened Council', 'opened Write', 'asked the AI to draft an email']) assert.ok(steps.includes(s), s);
  assert.ok(!steps.some((s) => /live/.test(s)), 'the live refresh is not activity');
  assert.ok(logged.some((l) => l === 'Abacus office: dan signed in'));

  const r = await dan.get('/activity');
  assert.match(r.text, /Who has been in/);
  assert.match(r.text, /<strong>dan<\/strong>: \d+ min, \d+ steps, still in/);
  assert.match(r.text, /asked the AI to draft an email/);

  await dan.post('/logout', {}, '/');
  await settle();
  [v] = await store.recentVisits(5);
  assert.equal(v.ended_how, 'signed out');
  assert.equal(v.pages.at(-1).what, 'signed out');
  assert.ok(logged.some((l) => /^Abacus office visit: dan, .* ended signed out: .*asked the AI to draft an email/.test(l)), 'the visit is written to the log');
  assert.equal((await store.recentVisits(5)).filter((x) => x.user_name === 'dan').length, 1, 'one visit, not one per request');

  // A quiet visit is closed by the sweep and written to the log.
  const sam = client();
  await sam.post('/login', { username: 'sam', password: 'sam-pass-123456', next: '/' });
  await sam.get('/inbox');
  await settle();
  assert.equal((await sam.get('/activity')).status, 404, 'an operator does not see who has been in');
  await pool.query("UPDATE visits SET last_at = now() - interval '30 minutes' WHERE user_name = 'sam'");
  const closed = await store.closeVisits({ idleOnly: true, how: 'idle' });
  assert.equal(closed.length, 1);
  assert.equal(closed[0].ended_how, 'idle');
  // The next page after a quiet spell starts a new visit.
  await sam.get('/');
  await settle();
  assert.equal((await store.recentVisits(10)).filter((x) => x.user_name === 'sam').length, 2);
  // Racing requests share one visit.
  await Promise.all([1, 2, 3, 4, 5].map(() => sam.get('/inbox')));
  await settle();
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM visits WHERE user_name = 'sam' AND ended_at IS NULL")).rows[0].n, 1);
});
