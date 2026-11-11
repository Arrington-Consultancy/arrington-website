'use strict';

// Faults on the version serving www.a2bstaff.com (cf9aea2), fixed on main
// for the demo to Dan (Tom, 11 November 2026: "Use the version currently
// deployed at a2bstaff.com as the baseline ... Start with the misleading
// mailbox and alert messages ... Then reproduce and fix the issues from the
// Codex sweep that affect this version, especially the desktop case
// layout, drafts incorrectly showing as sent, duplicate drafts on retry,
// and simulated bookings producing customer confirmations").
//
// The first half runs everywhere; the HTTP half needs
// ABACUS_OFFICE_TEST_DATABASE_URL and works in a schema of its own.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ai = require('../abacus-office/lib/ai');
const { createDispatch } = require('../abacus-office/lib/dispatch');
const { createMailbox } = require('../abacus-office/lib/mailbox');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;
const firm = { name: 'Cornwall Taxis', short: 'Cornwall', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Cornwall Taxis', facts: [], fixedPrices: [] };

test('the desktop case page keeps its two columns: no one-column rule outside a phone media query', () => {
  const css = fs.readFileSync(path.join(__dirname, '../abacus-office/public/office.css'), 'utf8');
  // Strip every @media block, then no rule left may put the case page in one column.
  const outside = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  assert.doesNotMatch(outside, /\.to-email-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;?\s*\}/);
  assert.match(css, /@media \(min-width: 60rem\) \{ \.to-email-grid \{ grid-template-columns: minmax\(0, 5fr\) minmax\(0, 6fr\); \}/);
});

test('a first booking reply never tells the customer the job is booked', () => {
  const sys = ai.readSystem('2026-11-11', firm);
  assert.doesNotMatch(sys, /the reply can confirm what the customer asked for/);
  assert.match(sys, /not in dispatch yet/);
  assert.match(sys, /Never tell the customer the job is booked or confirmed/);
  assert.match(sys, /never say a car, a vehicle type or a time is available/i);
});

test('iCabbi check-only covers cancelling too: with live writes off nothing is cancelled', async () => {
  const calls = [];
  const fetch = async (url, init = {}) => { calls.push(new URL(url).pathname); return { ok: true, status: 200, json: async () => ({ version: 242, code: 200, body: {} }) }; };
  const env = { ABACUS_OFFICE_DISPATCH_DRIVER: 'icabbi', ABACUS_OFFICE_ICABBI_BASE_URL: 'https://api.example-icabbi.invalid/v2', ABACUS_OFFICE_ICABBI_API_KEY: 'k', ABACUS_OFFICE_ICABBI_SECRET: 's' };
  const d = createDispatch({ store: null, env, fetch });
  await assert.rejects(d.cancel({ ref: '991A' }), (e) => e.checkedOnly && /nothing was cancelled/i.test(e.message));
  assert.equal(calls.filter((p) => /cancel/.test(p)).length, 0, 'no cancel call reaches iCabbi');
});

test('over HTTP: no mailbox, no alerts, the screens say so, approval is not sent, retries make one draft, a stand-in booking is not a confirmation', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_live_faults';
  const admin = new Pool({ connectionString: DB });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);
  await admin.end();
  const pool = new Pool({ connectionString: DB, options: `-c search_path=${SCHEMA}` });
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const store = new Store(pool);
  await store.ensureSchema();
  await store.ensureSchema();
  await store.createUser({ username: 'owner', displayName: 'Olive', password: 'owner-pass-123456', role: 'owner' });
  await store.createUser({ username: 'sam', displayName: 'Sam', password: 'sam-pass-1234567', role: 'operator' });
  ai.__setClientFactoryForTests(() => ({ messages: { create: async () => { throw new Error('no model in this test'); } } }));
  t.after(() => ai.__setClientFactoryForTests(null));

  const f = { ...firm, demo: false, logo: '', mailboxBrand: 'abacus', brands: [{ id: 'abacus', name: 'Abacus & Falmouth Taxis' }] };
  const start = async (mailbox) => {
    const { app } = createApp({ pool, mailbox, firm: f, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => false, alertsEnv: {}, mailEnv: { ABACUS_OFFICE_MAIL_DRIVER: mailbox.name } });
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const jar = new Map();
    const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
    const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: cookie() }, redirect: 'manual' }); absorb(res); return { status: res.status, text: await res.text(), location: res.headers.get('location') }; };
    const token = async (from) => ((await get(from)).text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    const send = async (p, fields, tok) => { const res = await fetch(base + p, { method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: tok, ...fields }), redirect: 'manual' }); absorb(res); return { status: res.status, location: res.headers.get('location') }; };
    const post = async (p, fields, from) => send(p, fields, await token(from));
    return { server, get, post, send, token };
  };
  const seed = async (subject, fields) => {
    const row = await store.insertCase({ id: `m-${subject}`, messageId: `<${subject}@mail.example.invalid>`, from: 'Jenna <jenna@example.invalid>', subject, body: 'Can I have a taxi on Friday at 6am from 12 Arwenack Street to Newquay Airport, two of us. 07700 900123.', receivedAt: new Date() });
    await store.updateCase(row.id, { kind: 'bookings', status: 'new', draft: 'Hi Jenna,\n\nThanks for getting in touch. We will confirm Friday at 6am shortly.\n\nThanks,\nCornwall Taxis', reading: { intent: 'new_booking', customer_name: 'Jenna', phone: '07700 900123', journey: { date: '2026-11-13', time: '06:00', pickup: '12 Arwenack Street, Falmouth', destination: 'Newquay Airport', passengers: '2', flight: '' }, missing: [], summary: 'A taxi to the airport.' }, ...fields });
    return row.id;
  };

  // 1. No mailbox and no alert email: what the screens say.
  const none = await start(createMailbox({ ABACUS_OFFICE_MAIL_DRIVER: 'none' }));
  t.after(async () => { none.server.close(); });
  await none.post('/login', { username: 'owner', password: 'owner-pass-123456', next: '/' }, '/login');
  const id = await seed('booking-one', {});
  await store.updateCase(await seed('overdue-one', {}), { escalated_at: new Date() });

  let r = await none.get(`/case/${id}`);
  assert.doesNotMatch(r.text, /No mailbox connected for someone to send|draft in No mailbox connected/i);
  assert.doesNotMatch(r.text, /Approving saves it as a draft in the firm/);
  assert.match(r.text, /No mailbox is connected/);
  await none.post(`/case/${id}/approve`, {}, `/case/${id}`);
  let kase = await store.caseById(id);
  assert.ok(kase.approved_at, 'approved');
  assert.notEqual(kase.status, 'waiting', 'approving is not sending: the case is not marked waiting on the customer');
  r = await none.get(`/case/${id}`);
  assert.doesNotMatch(r.text, /Saved as a draft in No mailbox connected/i);
  assert.match(r.text, /nothing has been sent/i);
  assert.match(r.text, /Copy the reply/);
  assert.match(r.text, /data-copy="Hi Jenna/, 'a Copy the reply button with the reply in it');
  assert.match(r.text, /I have sent it/);
  const events = (await store.eventsFor(id)).map((e) => e.detail).join('\n');
  assert.doesNotMatch(events, /draft in No mailbox connected/i);
  r = await none.get('/');
  assert.doesNotMatch(r.text, /comes into no mailbox connected/i);
  assert.doesNotMatch(r.text, /checks the mailbox itself/);
  assert.doesNotMatch(r.text, /The manager has been told|A manager was emailed/);
  assert.match(r.text, /Alert emails are not set up/);
  assert.match(r.text, /Approved, not sent yet/);
  r = await none.get('/inbox');
  assert.doesNotMatch(r.text, /Check the mailbox now/);
  assert.doesNotMatch(r.text, /checks the mailbox itself/);
  assert.match(r.text, /Approved, not sent/);
  r = await none.get('/settings');
  assert.doesNotMatch(r.text, /a manager is emailed once/);
  assert.doesNotMatch(r.text, /Connect the mailbox/);
  assert.doesNotMatch(r.text, /name="client_secret"/);

  // A second press does not approve again.
  await none.post(`/case/${id}/approve`, {}, `/case/${id}`);
  assert.equal((await store.eventsFor(id)).filter((e) => e.kind === 'approved').length, 1, 'one approval');

  // Marking it sent is a person's act, recorded with their name.
  await none.post(`/case/${id}/sent`, {}, `/case/${id}`);
  kase = await store.caseById(id);
  assert.equal(kase.status, 'waiting');
  assert.ok(kase.sent_at);
  assert.match((await store.eventsFor(id)).map((e) => e.detail).join('\n'), /Marked as sent by Olive/);

  // A stand-in booking says plainly it is practice and drafts no confirmation.
  const bid = await seed('booking-two', {});
  const before = (await store.caseById(bid)).draft;
  r = await none.post(`/case/${bid}/book`, { date: '2026-11-13', time: '06:00', pickup: '12 Arwenack Street, Falmouth', destination: 'Newquay Airport', name: 'Jenna', phone: '07700 900123', passengers: '2', vehicle: 'Car (up to 4)', signed_off: 'yes' }, `/case/${bid}`);
  kase = await store.caseById(bid);
  assert.ok(kase.dispatch_ref, 'recorded on the stand-in');
  assert.equal(kase.draft, before, 'no confirmation drafted from a stand-in booking');
  r = await none.get(`/case/${bid}`);
  assert.match(r.text, /not a live dispatch system/);
  assert.match(r.text, /do not tell the customer it is booked/i);

  // 2. A real mailbox (stubbed): retries and two presses make one draft.
  const saved = [];
  let mailboxFails = null;
  const mailbox = { name: 'gmail', label: 'Gmail', demo: false, none: false, configured: () => true, missing: () => [], listInbox: async () => [], account: async () => null,
    saveReplyDraft: async (email, text) => { if (mailboxFails === 'before') throw new Error('socket hang up'); saved.push(text); return { draftId: `d${saved.length}` }; },
    saveNewDraft: async () => { saved.push('new'); return { draftId: `n${saved.length}` }; } };
  const live = await start(mailbox);
  t.after(async () => { live.server.close(); await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end(); });
  await live.post('/login', { username: 'sam', password: 'sam-pass-1234567', next: '/' }, '/login');

  const twice = await seed('booking-twice', {});
  const tok = await live.token(`/case/${twice}`);
  await Promise.all([live.send(`/case/${twice}/approve`, {}, tok), live.send(`/case/${twice}/approve`, {}, tok), live.send(`/case/${twice}/approve`, {}, tok)]);
  assert.equal(saved.length, 1, 'three presses at once, one draft in the mailbox');
  await live.post(`/case/${twice}/approve`, {}, `/case/${twice}`);
  assert.equal(saved.length, 1, 'pressing again later makes no second draft');
  r = await live.get(`/case/${twice}`);
  assert.match(r.text, /in Gmail as a draft/);
  assert.match(r.text, /nothing has been sent/i);
  assert.doesNotMatch(r.text, /Approve again/);

  // The draft was saved, then the database write failed: a retry must not save another.
  const retry = await seed('booking-retry', {});
  const realUpdate = store.updateCase.bind(store);
  store.updateCase = async (cid, fields) => { if (cid === retry && 'saved_draft_id' in fields) { store.updateCase = realUpdate; throw new Error('connection terminated'); } return realUpdate(cid, fields); };
  await live.post(`/case/${retry}/approve`, {}, `/case/${retry}`);
  const afterFail = saved.length;
  assert.equal(afterFail, 2, 'the first attempt did save a draft');
  await live.post(`/case/${retry}/approve`, {}, `/case/${retry}`);
  assert.equal(saved.length, afterFail, 'the retry saves no second draft');
  r = await live.get(`/case/${retry}`);
  assert.match(r.text, /It is in Gmail as a draft/, 'the case knows the draft is there');

  // The mailbox failed on the way: staff check the mailbox, tick, and try again; one more draft only.
  const unsure = await seed('booking-unsure', {});
  mailboxFails = 'before';
  await live.post(`/case/${unsure}/approve`, {}, `/case/${unsure}`);
  mailboxFails = null;
  r = await live.get(`/case/${unsure}`);
  assert.match(r.text, /may already be in Gmail/);
  assert.match(r.text, /name="mailbox_checked"/);
  const n = saved.length;
  await live.post(`/case/${unsure}/approve`, {}, `/case/${unsure}`);
  assert.equal(saved.length, n, 'no retry without the tick');
  await live.post(`/case/${unsure}/approve`, { mailbox_checked: 'yes' }, `/case/${unsure}`);
  assert.equal(saved.length, n + 1, 'with the tick, one draft');
  await live.post(`/case/${unsure}/approve`, { mailbox_checked: 'yes' }, `/case/${unsure}`);
  assert.equal(saved.length, n + 1, 'and never another');

  // The holding reply: two presses, one draft.
  const cpl = await seed('complaint-one', { kind: 'complaints', reading: { intent: 'complaint', customer_name: 'Jenna' }, draft: 'Hi Jenna' });
  await live.post(`/case/${cpl}/holding`, {}, `/case/${cpl}`);
  assert.equal(saved.length, n + 1, 'no holding reply before the complaint is passed up');
  await live.post(`/case/${cpl}/pass-up`, { reason: 'refund' }, `/case/${cpl}`);
  const ht = await live.token(`/case/${cpl}`);
  const m = saved.length;
  await Promise.all([live.send(`/case/${cpl}/holding`, {}, ht), live.send(`/case/${cpl}/holding`, {}, ht)]);
  assert.equal(saved.length, m + 1, 'one holding reply in the mailbox');
});
