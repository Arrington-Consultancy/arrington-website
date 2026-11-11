'use strict';

// The code fixes from the independent review of 11 November 2026 (Drive
// "A2B / Abacus workspace | Independent review | 11 November 2026"):
// approval claimed once (no duplicate drafts in Gmail), what became of a
// saved draft read back from Gmail (sent, still a draft, or deleted), a save
// from a stale page refused rather than written over someone else's,
// booking replies that never confirm before the job is in dispatch, and
// enquiries that ask for what a booking needs. The first half runs
// everywhere; the second needs ABACUS_OFFICE_TEST_DATABASE_URL.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;

test('the reading prompt never lets a booking reply confirm the job, and an enquiry asks for what a booking needs', () => {
  const src = fs.readFileSync(path.join(ROOT, 'abacus-office/lib/ai.js'), 'utf8');
  assert.doesNotMatch(src, /so the reply can confirm what the customer asked for/);
  assert.match(src, /Never confirm a booking\. The job is not in the dispatch system yet/);
  assert.match(src, /Never say a car, a driver, a time or a vehicle of a particular kind/);
  const ai = require('../abacus-office/lib/ai');
  const missing = (intent, journey) => ai.cleanReading({ intent, customer_name: 'Pat', phone: '', journey: { date: '', time: '', pickup: '', destination: '', passengers: '', flight: '', ...journey }, summary: 's', reply: 'r' }).missing;
  assert.ok(missing('enquiry', { pickup: 'Newquay Airport', destination: 'Truro' }).some((m) => /mobile number/.test(m)), 'a journey enquiry asks for a phone number');
  assert.ok(missing('enquiry', { pickup: 'Newquay Airport' }).some((m) => /flight number/.test(m)));
  assert.deepEqual(missing('enquiry', {}), [], 'a general question asks for nothing');
});

test('Gmail says what became of a saved draft: still a draft, sent, or deleted', async () => {
  const gmail = require('../lib/taxiOffice/mail/gmail');
  const env = { TAXI_OFFICE_GMAIL_CLIENT_ID: 'id', TAXI_OFFICE_GMAIL_CLIENT_SECRET: 's', TAXI_OFFICE_GMAIL_REFRESH_TOKEN: 't' };
  const since = '2026-11-11T10:00:00Z';
  const make = (draftThere, threadMessages) => gmail.create({ env, fetch: async (url) => {
    if (/token/.test(url)) return { ok: true, status: 200, json: async () => ({ access_token: 'a', expires_in: 3600 }) };
    if (/\/drafts\//.test(url)) return draftThere ? { ok: true, status: 200, json: async () => ({ id: 'd1' }) } : { ok: false, status: 404, json: async () => ({}) };
    if (/\/threads\//.test(url)) return { ok: true, status: 200, json: async () => ({ messages: threadMessages }) };
    throw new Error(`unexpected ${url}`);
  } });
  assert.equal((await make(true, []).draftState({ draftId: 'd1', threadId: 't1', since })).state, 'unsent');
  const sent = await make(false, [{ labelIds: ['INBOX'], internalDate: String(Date.parse('2026-11-11T08:00:00Z')) }, { labelIds: ['SENT'], internalDate: String(Date.parse('2026-11-11T10:20:00Z')) }]).draftState({ draftId: 'd1', threadId: 't1', since });
  assert.equal(sent.state, 'sent');
  assert.equal(sent.at.toISOString(), '2026-11-11T10:20:00.000Z');
  assert.equal((await make(false, [{ labelIds: ['SENT'], internalDate: String(Date.parse('2026-11-10T09:00:00Z')) }]).draftState({ draftId: 'd1', threadId: 't1', since })).state, 'discarded', 'an older sent message in the thread is not this reply');
  assert.equal((await make(false, []).draftState({ draftId: 'd1', threadId: 't1', since })).state, 'discarded');
});

test('over HTTP: one approval, one draft; a stale page cannot save over a newer reply; sent and deleted drafts are read back', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_review_fixes_test';
  const admin = new Pool({ connectionString: DB });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);
  await admin.end();
  const pool = new Pool({ connectionString: DB, options: `-c search_path=${SCHEMA}` });
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const store = new Store(pool);
  await store.ensureSchema();
  for (const u of ['opa', 'opb']) await store.createUser({ username: u, password: `${u}-pass-123456`, role: 'operator', brand: 'abacus' });
  const mk = async (id, { kind = 'customer', draft = 'Hi, yes we can. Thanks, Cornwall Taxis', reading = { intent: 'enquiry', summary: 'x' }, hoursAgo = 1 } = {}) => {
    const row = await store.insertCase({ id, from: `${id}@example.invalid`, subject: id, body: 'x', receivedAt: new Date(Date.now() - hoursAgo * 3600e3).toISOString(), threadId: `th-${id}`, messageId: `<${id}@example.invalid>` }, 'abacus');
    await store.updateCase(row.id, { kind, reading, reading_source: 'prepared', draft });
    return row.id;
  };
  let saves = 0;
  const states = new Map();
  const mailbox = {
    name: 'gmail', label: 'Test Gmail', demo: false, none: false, canTrackSent: true, configured: () => true, missing: () => [], listInbox: async () => [], account: async () => null,
    saveReplyDraft: async () => { await new Promise((r) => setTimeout(r, 120)); saves += 1; return { draftId: `d${saves}`, threadId: 'thread-x' }; },
    saveNewDraft: async () => { saves += 1; return { draftId: `n${saves}` }; },
    draftState: async ({ draftId }) => states.get(draftId) || { state: 'unsent' }
  };
  const BRANDS = [{ id: 'abacus', name: 'Abacus & Falmouth Taxis', logo: '' }, { id: 'coastline', name: 'Coastline Travel', logo: '' }];
  const firm = { name: 'Cornwall Taxis', short: 'Cornwall', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Cornwall Taxis', facts: [], demo: false, logo: '', mailboxBrand: 'abacus', brands: BRANDS };
  const { app, office } = createApp({ pool, mailbox, firm, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => false, alertsEnv: {} });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end(); });
  function client() {
    const jar = new Map();
    const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
    const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: cookie() }, redirect: 'manual' }); absorb(res); return { status: res.status, text: await res.text() }; };
    const token = async (from) => ((await get(from)).text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    const post = async (p, fields, from, tok) => { const tk = tok || await token(from); const res = await fetch(base + p, { method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: tk, ...fields }), redirect: 'manual' }); absorb(res); return { status: res.status }; };
    return { get, post, token };
  }
  const login = async (u) => { const c = client(); await c.post('/login', { username: u, password: `${u}-pass-123456`, next: '/' }, '/login'); return c; };
  const a = await login('opa');
  const b = await login('opb');

  // Two people press Approve at the same moment: one draft, one approval.
  const one = await mk('one');
  const [ta, tb] = [await a.token(`/case/${one}`), await b.token(`/case/${one}`)];
  await Promise.all([a.post(`/case/${one}/approve`, {}, '', ta), b.post(`/case/${one}/approve`, {}, '', tb)]);
  assert.equal(saves, 1, 'two Approves at once make one draft in the mailbox');
  assert.equal((await store.eventsFor(one)).filter((e) => e.kind === 'approved').length, 1);
  await a.post(`/case/${one}/approve`, {}, `/case/${one}`);
  assert.equal(saves, 1, 'and pressing it again later makes none');
  let c = await store.caseById(one);
  assert.equal(c.sent_state, 'unsent');
  assert.equal(c.saved_thread_id, 'thread-x');
  assert.match((await a.get(`/case/${one}`)).text, /not sent yet/);

  // The same, without HTTP in the way, so the two really overlap: both
  // start from the same unapproved case, and only the database's claim
  // stands between them and two drafts.
  const race = await mk('race');
  const loaded = await store.caseById(race);
  const opa = await store.userByName('opa');
  const opb = await store.userByName('opb');
  const before0 = saves;
  const results = await Promise.allSettled([office.approve(loaded, opa, { version: loaded.draft_version }), office.approve(loaded, opb, { version: loaded.draft_version })]);
  assert.equal(saves - before0, 1, 'one draft when two approvals race');
  assert.equal(results.filter((x) => x.status === 'rejected').length, 1);
  assert.match(results.find((x) => x.status === 'rejected').reason.message, /just approved this reply/);

  // A mailbox that refuses lets the claim go, so it can be tried again.
  const two = await mk('two');
  const keep = mailbox.saveReplyDraft;
  mailbox.saveReplyDraft = async () => { throw Object.assign(new Error('Gmail could not save the draft (503)'), { code: 'MAIL_ERROR' }); };
  await a.post(`/case/${two}/approve`, {}, `/case/${two}`);
  assert.equal((await store.caseById(two)).approved_at, null, 'not left approved when nothing reached the mailbox');
  mailbox.saveReplyDraft = keep;
  await a.post(`/case/${two}/approve`, {}, `/case/${two}`);
  assert.ok((await store.caseById(two)).approved_at);

  // A stale page: B opened the reply, A changed it, B's save is refused and
  // B's text is kept on the page for them.
  const three = await mk('three', { draft: 'Original reply' });
  const bPage = await b.get(`/case/${three}`);
  const bVersion = bPage.text.match(/name="draft_version" value="(\d+)"/)[1];
  const tB = bPage.text.match(/name="_csrf" value="([^"]+)"/)[1];
  await a.post(`/case/${three}/draft`, { draft: 'A changed it', draft_version: (await a.get(`/case/${three}`)).text.match(/name="draft_version" value="(\d+)"/)[1] }, `/case/${three}`);
  await b.post(`/case/${three}/draft`, { draft: 'B wrote this', draft_version: bVersion }, '', tB);
  assert.equal((await store.caseById(three)).draft, 'A changed it', 'B did not save over A');
  const shown = (await b.get(`/case/${three}`)).text;
  assert.match(shown, /Your version, not saved/);
  assert.match(shown, /B wrote this/);
  // B also cannot approve their stale text over A's.
  await b.post(`/case/${three}/approve`, { draft: 'B wrote this', draft_version: bVersion }, '', tB);
  assert.equal((await store.caseById(three)).approved_at, null);

  // What became of approved replies: one sent, one deleted, one still a draft.
  states.set('d1', { state: 'sent', at: new Date() });
  const sentBefore = await store.caseById(one);
  const r = await office.checkSent();
  assert.equal(r.checked, 3);
  c = await store.caseById(one);
  assert.equal(c.sent_state, 'sent');
  assert.ok(c.sent_at && sentBefore.approved_at);
  assert.match((await a.get(`/case/${one}`)).text, /The customer has it/);
  const twoRow = await store.caseById(two);
  states.set(twoRow.saved_draft_id, { state: 'discarded' });
  await office.checkSent();
  const gone = await store.caseById(two);
  assert.equal(gone.sent_state, 'discarded');
  assert.equal(gone.approved_at, null, 'a draft deleted without being sent takes the approval off');
  assert.equal(gone.status, 'in_progress');
  assert.match((await store.eventsFor(two)).map((e) => e.detail).join('\n'), /deleted in Test Gmail without being sent/);

  // Today lists replies approved over an hour ago and still not sent.
  const four = await mk('four');
  await a.post(`/case/${four}/approve`, {}, `/case/${four}`);
  await pool.query("UPDATE cases SET approved_at = now() - interval '2 hours' WHERE id = $1", [four]);
  const today = (await a.get('/')).text;
  assert.match(today, /Approved but not sent/);
  assert.match(today, /Approved, not sent/);

  // The holding reply, pressed twice at once, makes one draft.
  const five = await mk('five', { kind: 'complaints', reading: { intent: 'complaint', summary: 'x', customer_name: 'Pat' } });
  const before = saves;
  const [h1, h2] = [await a.token(`/case/${five}`), await b.token(`/case/${five}`)];
  await Promise.all([a.post(`/case/${five}/holding`, {}, '', h1), b.post(`/case/${five}/holding`, {}, '', h2)]);
  assert.equal(saves - before, 1);
});
