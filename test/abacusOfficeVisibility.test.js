'use strict';

// Who sees what in the Abacus office (Tom, 10 November 2026: "three
// different companies that owners and managers can see, also managers and
// owners can see council worker"). The first half runs everywhere; the
// second needs ABACUS_OFFICE_TEST_DATABASE_URL and works in a schema of its
// own, so it never touches the tables the other office suites drop.

const test = require('node:test');
const assert = require('node:assert/strict');
const cases = require('../abacus-office/lib/cases');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;
const op = (brand = '') => ({ id: 1, role: 'operator', brand });
const mgr = (brand = '') => ({ id: 2, role: 'manager', brand });
const owner = { id: 3, role: 'owner', brand: '' };

test('managers and owners see every company and the council emails; an operator sees their company and never the council', () => {
  const abacus = { kind: 'bookings', brand: 'abacus' };
  const coastline = { kind: 'bookings', brand: 'coastline' };
  const council = { kind: 'licensing', brand: 'abacus' };
  assert.equal(cases.canSee(mgr(''), coastline), true, 'a manager set to every company sees them all');
  assert.equal(cases.canSee(mgr('abacus'), coastline), false, 'a manager set to one company sees that company only (Tom, 11 November 2026)');
  assert.equal(cases.canSee({ id: 3, role: 'owner', brand: 'abacus' }, coastline), true, 'the owner always sees every company, whatever is stored');
  assert.equal(cases.canSee(owner, coastline), true);
  assert.equal(cases.canSee(mgr('abacus'), council), true);
  assert.equal(cases.canSee(owner, council), true);
  assert.equal(cases.canSee(op('abacus'), abacus), true);
  assert.equal(cases.canSee(op('abacus'), coastline), false);
  assert.equal(cases.canSee(op(''), coastline), true, 'an operator with no company set sees every company');
  assert.equal(cases.canSee(op('abacus'), council), false, 'never a council email, even their own company\'s');
  assert.equal(cases.canSee(op(''), council), false);
  assert.deepEqual(cases.caseScope(mgr('')), { brand: undefined, hideCouncil: false });
  assert.deepEqual(cases.caseScope(mgr('abacus')), { brand: 'abacus', hideCouncil: false }, 'a manager set to one company sees its council emails too');
  assert.deepEqual(cases.caseScope(op('coastline')), { brand: 'coastline', hideCouncil: true });
  assert.deepEqual(cases.caseScope(op('')), { brand: undefined, hideCouncil: true });
});

test('over HTTP: lists, counts, the live stamp, Today and the case page all follow the rule, and a manager moves an email to another company', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_visibility_test';
  const admin = new Pool({ connectionString: DB });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);
  await admin.end();
  const pool = new Pool({ connectionString: DB, options: `-c search_path=${SCHEMA}` });
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const store = new Store(pool);
  await store.ensureSchema();
  await store.createUser({ username: 'owner', password: 'owner-pass-12345', role: 'owner' });
  await store.createUser({ username: 'meg', password: 'meg-pass-123456', role: 'manager', brand: '' });
  await store.createUser({ username: 'lou', password: 'lou-pass-123456', role: 'manager', brand: 'coastline' });
  await store.createUser({ username: 'sam', password: 'sam-pass-123456', role: 'operator', brand: 'abacus' });
  const mk = async (id, kind, brand, subject) => {
    const row = await store.insertCase({ id, from: `${id}@example.invalid`, subject, body: 'x', receivedAt: '2026-11-10T09:00', threadId: id, messageId: `<${id}@example.invalid>` }, brand);
    await store.updateCase(row.id, { kind });
    return row.id;
  };
  const aBooking = await mk('a1', 'bookings', 'abacus', 'Abacus airport run');
  const cBooking = await mk('c1', 'bookings', 'coastline', 'Coastline station run');
  const kBooking = await mk('k1', 'bookings', 'kernow', 'Kernow hospital run');
  const council = await mk('l1', 'licensing', 'abacus', 'Council: plate renewal for licence 14');
  await store.addEvent(council, { kind: 'arrived', detail: 'Council: plate renewal arrived' });
  await store.addEvent(cBooking, { kind: 'arrived', detail: 'Coastline email arrived' });

  const firm = { name: 'Cornwall Taxis', short: 'Cornwall', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Cornwall Taxis', facts: [], demo: true, logo: '', mailboxBrand: 'abacus',
    brands: [{ id: 'abacus', name: 'Abacus Taxis' }, { id: 'coastline', name: 'Coastline Taxis' }, { id: 'kernow', name: 'Kernow Cabs' }] };
  const mailbox = { name: 'test', label: 'Test', demo: true, configured: () => true, missing: () => [], listInbox: async () => [], account: async () => null, saveReplyDraft: async () => ({}) };
  const { app } = createApp({ pool, mailbox, firm, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => false, alertsEnv: {} });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end(); });

  function client() {
    const jar = new Map();
    const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
    const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: cookie() }, redirect: 'manual' }); absorb(res); return { status: res.status, location: res.headers.get('location'), text: await res.text() }; };
    const post = async (p, fields, from = '/login') => {
      const page = await get(from);
      const token = (page.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      const res = await fetch(base + p, { method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: token, ...fields }), redirect: 'manual' });
      absorb(res);
      return { status: res.status, location: res.headers.get('location'), text: await res.text() };
    };
    return { get, post };
  }

  const sam = client();
  await sam.post('/login', { username: 'sam', password: 'sam-pass-123456', next: '/' });
  let r = await sam.get('/inbox?show=all');
  assert.match(r.text, /Abacus airport run/);
  assert.doesNotMatch(r.text, /Coastline station run|Kernow hospital run/, 'an operator sees their own company only');
  assert.doesNotMatch(r.text, /plate renewal/, 'and no council email');
  assert.equal((await sam.get(`/case/${council}`)).status, 404, 'nor by its address');
  assert.equal((await sam.get(`/case/${cBooking}`)).status, 404);
  assert.match(JSON.parse((await sam.get('/live.json')).text).stamp, /^1:/, 'the live stamp counts only what he may see');
  r = await sam.get('/');
  assert.doesNotMatch(r.text, /plate renewal|Coastline email arrived/, 'Today\'s recent activity leaves out what he may not see');
  assert.equal((await sam.post(`/case/${aBooking}/company`, { brand: 'coastline' }, `/case/${aBooking}`)).status, 302);
  assert.equal((await store.caseById(aBooking)).brand, 'abacus', 'an operator cannot move an email between companies');

  const meg = client();
  await meg.post('/login', { username: 'meg', password: 'meg-pass-123456', next: '/' });
  r = await meg.get('/inbox?show=all');
  for (const s of ['Abacus airport run', 'Coastline station run', 'Kernow hospital run', 'Council: plate renewal']) assert.match(r.text, new RegExp(s), `the manager sees ${s}`);
  assert.equal((await meg.get(`/case/${council}`)).status, 200);
  assert.match(JSON.parse((await meg.get('/live.json')).text).stamp, /^4:/);
  r = await meg.get(`/case/${kBooking}`);
  assert.match(r.text, /Move to company/);
  await meg.post(`/case/${kBooking}/company`, { brand: 'abacus' }, `/case/${kBooking}`);
  assert.equal((await store.caseById(kBooking)).brand, 'abacus');
  assert.ok((await store.eventsFor(kBooking)).some((e) => e.kind === 'company' && /Moved to Abacus Taxis/.test(e.detail)));
  await meg.post(`/case/${kBooking}/company`, { brand: 'nowhere' }, `/case/${kBooking}`);
  assert.equal((await store.caseById(kBooking)).brand, 'abacus', 'an unknown company is refused');
  // Now it is Abacus's, the operator sees it.
  assert.match((await sam.get('/inbox?show=all')).text, /Kernow hospital run/);

  // A manager set to one company: that company and its council emails only,
  // no company menu, and cannot move an email out of it.
  const lou = client();
  await lou.post('/login', { username: 'lou', password: 'lou-pass-123456', next: '/' });
  r = await lou.get('/inbox?show=all');
  assert.match(r.text, /Coastline station run/);
  assert.doesNotMatch(r.text, /Abacus airport run|Kernow hospital run|plate renewal/, 'a manager set to Coastline sees Coastline only');
  assert.doesNotMatch(r.text, /portal-brand/, 'and has no company menu');
  assert.equal((await lou.get(`/case/${council}`)).status, 404, 'nor Abacus\'s council email');
  r = await lou.get(`/case/${cBooking}`);
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /Move to company/);
  await lou.post(`/case/${cBooking}/company`, { brand: 'abacus' }, `/case/${cBooking}`);
  assert.equal((await store.caseById(cBooking)).brand, 'coastline', 'a manager set to one company cannot move an email out of it');

  const own = client();
  await own.post('/login', { username: 'owner', password: 'owner-pass-12345', next: '/' });
  assert.equal((await own.get(`/case/${council}`)).status, 200);
  assert.equal((await own.get(`/case/${cBooking}`)).status, 200);
});
