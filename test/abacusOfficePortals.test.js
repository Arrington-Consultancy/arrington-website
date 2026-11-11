'use strict';

// One portal per company (Tom, 11 November 2026: "the two other companies
// portals to be there, owner having drop down access"). Anyone who sees
// every company picks a company from the bar and the office becomes that
// company's: its name and logo, its emails, counts and drafts only. An
// operator of one company has no menu and cannot leave their portal. The
// first half runs everywhere; the second needs ABACUS_OFFICE_TEST_DATABASE_URL
// and works in a schema of its own.

const test = require('node:test');
const assert = require('node:assert/strict');
const cases = require('../abacus-office/lib/cases');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;
const BRANDS = [{ id: 'abacus', name: 'Abacus & Falmouth Taxis' }, { id: 'coastline', name: 'Coastline Travel' }, { id: 'a2b', name: 'A2B Cornwall' }];

test('who may switch portal, and a chosen portal narrows a list but never widens an operator', () => {
  const owner = { role: 'owner', brand: '' };
  const meg = { role: 'manager', brand: 'abacus' };
  const sam = { role: 'operator', brand: 'abacus' };
  const floater = { role: 'operator', brand: '' };
  assert.equal(cases.canSwitchPortal(owner), true);
  assert.equal(cases.canSwitchPortal(meg), true, 'a manager sees every company, so has the menu');
  assert.equal(cases.canSwitchPortal(floater), true);
  assert.equal(cases.canSwitchPortal(sam), false);
  assert.equal(cases.portalFor(owner, 'coastline', BRANDS), 'coastline');
  assert.equal(cases.portalFor(owner, 'nowhere', BRANDS), '', 'an unknown company is all companies');
  assert.equal(cases.portalFor(owner, 'constructor', BRANDS), '');
  assert.equal(cases.portalFor(sam, 'coastline', BRANDS), 'abacus', 'an operator stays in their own company');
  assert.deepEqual(cases.caseScope(owner, 'coastline'), { brand: 'coastline', hideCouncil: false });
  assert.deepEqual(cases.caseScope(owner, ''), { brand: undefined, hideCouncil: false });
  assert.deepEqual(cases.caseScope(sam, 'coastline'), { brand: 'abacus', hideCouncil: true });
  assert.deepEqual(cases.caseScope(floater, 'a2b'), { brand: 'a2b', hideCouncil: true });
});

test('over HTTP: the owner opens each company\'s portal from the bar, and an operator has no menu', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_portals_test';
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
  const mk = async (id, kind, brand, subject) => {
    const row = await store.insertCase({ id, from: `${id}@example.invalid`, subject, body: 'x', receivedAt: '2026-11-10T09:00', threadId: id, messageId: `<${id}@example.invalid>` }, brand);
    await store.updateCase(row.id, { kind });
    return row.id;
  };
  await mk('a1', 'bookings', 'abacus', 'Abacus airport run');
  const cBooking = await mk('c1', 'bookings', 'coastline', 'Coastline station run');
  await mk('b1', 'bookings', 'a2b', 'A2B hospital run');
  await mk('l1', 'licensing', 'coastline', 'Council: Coastline plate renewal');

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


  const own = client();
  await own.post('/login', { username: 'owner', password: 'owner-pass-12345', next: '/' });
  let r = await own.get('/inbox?show=all');
  assert.match(r.text, /<select id="portal-brand" name="brand"/, 'the owner has the company menu');
  assert.match(r.text, /<option value="" selected>All companies<\/option>/);
  for (const s of ['Abacus airport run', 'Coastline station run', 'A2B hospital run']) assert.match(r.text, new RegExp(s));

  r = await own.post('/portal', { brand: 'coastline', back: '/inbox?show=all' }, '/inbox?show=all');
  assert.equal(r.location, '/inbox?show=all', 'back to the page they were on');
  r = await own.get('/inbox?show=all');
  assert.match(r.text, /<strong>Coastline Travel<\/strong>/, 'the bar is Coastline\'s');
  assert.match(r.text, /<title>Inbox \| Coastline Travel office<\/title>/);
  assert.match(r.text, /<option value="coastline" selected>Coastline Travel<\/option>/);
  assert.match(r.text, /Coastline station run/);
  assert.match(r.text, /Council: Coastline plate renewal/, 'the owner still sees the council emails, for that company');
  assert.doesNotMatch(r.text, /Abacus airport run|A2B hospital run/, 'only Coastline\'s emails');
  assert.match(JSON.parse((await own.get('/live.json')).text).stamp, /^2:/, 'the live stamp follows the portal');
  assert.match((await own.get('/complaints')).text, /<option value="coastline" selected>Coastline Travel<\/option>/, 'a logged complaint defaults to the portal\'s company');

  await own.post('/portal', { brand: 'a2b', back: '//evil.example/' }, '/');
  r = await own.get('/');
  assert.match(r.text, /<strong>A2B Cornwall<\/strong>/);
  r = await own.post('/portal', { brand: 'a2b', back: '//evil.example/' }, '/');
  assert.equal(r.location, '/', 'never sent off the office');
  assert.match((await own.get('/inbox?show=all')).text, /A2B hospital run/);
  assert.equal((await own.get(`/case/${cBooking}`)).status, 200, 'another company\'s email still opens by its address for the owner');

  await own.post('/portal', { brand: '' }, '/');
  r = await own.get('/inbox?show=all');
  assert.match(r.text, /<strong>Cornwall Taxis<\/strong>/, 'all companies is the group again');
  assert.match(r.text, /Abacus airport run/);
  assert.match(r.text, /Coastline station run/);

  const sam = client();
  await sam.post('/login', { username: 'sam', password: 'sam-pass-123456', next: '/' });
  r = await sam.get('/inbox?show=all');
  assert.doesNotMatch(r.text, /portal-brand/, 'an operator of one company has no menu');
  assert.match(r.text, /<strong>Abacus &amp; Falmouth Taxis<\/strong>/, 'and is always in their own company\'s portal');
  await sam.post('/portal', { brand: 'coastline' }, '/inbox');
  r = await sam.get('/inbox?show=all');
  assert.match(r.text, /Abacus airport run/);
  assert.doesNotMatch(r.text, /Coastline station run/, 'posting the menu by hand changes nothing for him');
});
