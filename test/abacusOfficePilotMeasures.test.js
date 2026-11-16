'use strict';

// Codex's judgement of 16 November 2026 (Drive "A2B / Abacus workspace |
// Codex judgement | 16 November 2026"), the two fixes Tom approved:
// the made-up inbox's prepared replies never say a job is booked, changed
// or cancelled before anyone has put it into dispatch; and a reply counts
// as sent only when the email that went out is the approved reply, with
// reports showing the time until the customer had it and whether staff
// changed the AI's draft first. The last test needs
// ABACUS_OFFICE_TEST_DATABASE_URL.

const test = require('node:test');
const assert = require('node:assert/strict');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;

test('prepared booking, change and cancel replies promise to confirm, never say it is done', () => {
  const { seedInbox } = require('../abacus-office/lib/demoInbox');
  const emails = seedInbox('2026-11-16');
  const done = /that's booked|i've moved|that's cancelled|is booked|has been booked|is cancelled|has been cancelled|have moved|have changed/i;
  const byIntent = (i) => emails.filter((e) => e.prepared && e.prepared.intent === i && e.prepared.reply);
  for (const intent of ['new_booking', 'change', 'cancel']) {
    const list = byIntent(intent);
    assert.ok(list.length, `the made-up inbox has a ${intent} email`);
    for (const e of list) {
      assert.doesNotMatch(e.prepared.reply, done, `${e.id}: says the job is done before dispatch`);
      if (!e.prepared.missing.length) assert.match(e.prepared.reply, /confirm/i, `${e.id}: says it will be confirmed`);
    }
  }
});

test('a reply is sent only when the email that went out is the approved reply', async () => {
  const gmail = require('../lib/taxiOffice/mail/gmail');
  const approved = 'Hi Pat,\n\nYes, we can do that.\n\nThanks,\nCornwall Taxis';
  assert.ok(gmail.sameReply(`${approved}\n\nOn Mon, Pat wrote:\n> hello`, approved), 'a quoted original underneath is still the reply');
  assert.ok(gmail.sameReply(approved.replace(/\n/g, '\r\n  '), approved), 'line breaks and spacing aside');
  assert.ok(!gmail.sameReply('Hi Pat, sorry, we are fully booked.', approved), 'a different email is not the reply');
  assert.ok(!gmail.sameReply('Hi Pat,\n\nYes', approved), 'a cut-down version is not the reply');
  assert.ok(!gmail.sameReply(approved, ''), 'nothing approved matches nothing');

  const env = { TAXI_OFFICE_GMAIL_CLIENT_ID: 'id', TAXI_OFFICE_GMAIL_CLIENT_SECRET: 's', TAXI_OFFICE_GMAIL_REFRESH_TOKEN: 't' };
  const since = '2026-11-16T10:00:00Z';
  const at = (iso) => String(Date.parse(iso));
  const make = (thread) => gmail.create({ env, fetch: async (url) => {
    if (/token/.test(url)) return { ok: true, status: 200, json: async () => ({ access_token: 'a', expires_in: 3600 }) };
    if (/\/drafts\//.test(url)) return { ok: false, status: 404, json: async () => ({}) };
    if (/\/threads\//.test(url)) return { ok: true, status: 200, json: async () => ({ messages: thread }) };
    if (/\/messages\//.test(url)) { const id = url.match(/messages\/([^?]+)/)[1]; const m = thread.find((x) => x.id === id); return { ok: true, status: 200, json: async () => ({ payload: { mimeType: 'text/plain', body: { data: Buffer.from(m.text).toString('base64url') } } }) }; }
    throw new Error(`unexpected ${url}`);
  } });
  const other = await make([{ id: 'x', labelIds: ['SENT'], internalDate: at('2026-11-16T10:05:00Z'), text: 'Hi Pat, sorry, we are fully booked.' }]).draftState({ draftId: 'd', threadId: 't', since, text: approved });
  assert.equal(other.state, 'other', 'a different email in the conversation is not marked as the approved reply');
  const both = await make([
    { id: 'x', labelIds: ['SENT'], internalDate: at('2026-11-16T10:05:00Z'), text: 'Quick note first.' },
    { id: 'y', labelIds: ['SENT'], internalDate: at('2026-11-16T10:09:00Z'), text: approved }
  ]).draftState({ draftId: 'd', threadId: 't', since, text: approved });
  assert.equal(both.state, 'sent');
  assert.equal(both.at.toISOString(), '2026-11-16T10:09:00.000Z', 'the time the approved reply itself went');
});

test('over HTTP: a different email is not counted as sent; reports show time to the customer and edits', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_pilot_measures_test';
  const admin = new Pool({ connectionString: DB });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);
  await admin.end();
  const pool = new Pool({ connectionString: DB, options: `-c search_path=${SCHEMA}` });
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const store = new Store(pool);
  await store.ensureSchema();
  await store.createUser({ username: 'boss', password: 'boss-pass-123456', role: 'manager' });
  const boss = await store.userByName('boss');
  const mk = async (id, draft, aiDraft) => {
    const row = await store.insertCase({ id, from: `${id}@example.invalid`, subject: id, body: 'x', receivedAt: new Date(Date.now() - 2 * 3600e3).toISOString(), threadId: `th-${id}`, messageId: `<${id}@example.invalid>` }, '');
    await store.updateCase(row.id, { kind: 'customer', reading: { intent: 'enquiry', summary: 'x' }, reading_source: 'ai', draft, ai_draft: aiDraft });
    return row.id;
  };
  const states = new Map();
  let n = 0;
  const mailbox = {
    name: 'gmail', label: 'Test Gmail', demo: false, none: false, canTrackSent: true, configured: () => true, missing: () => [], listInbox: async () => [], account: async () => null,
    saveReplyDraft: async () => { n += 1; return { draftId: `d${n}`, threadId: `t${n}` }; },
    draftState: async ({ draftId }) => states.get(draftId) || { state: 'unsent' }
  };
  const firm = { name: 'Cornwall Taxis', short: 'Cornwall', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Cornwall Taxis', facts: [], demo: false, logo: '', brands: [] };
  const { app, office } = createApp({ pool, mailbox, firm, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => false, alertsEnv: {} });
  t.after(async () => { await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end(); });
  void app;

  const asWritten = await mk('as-written', 'Hi, yes.', 'Hi, yes.');
  const edited = await mk('edited', 'Hi, yes, 7pm is fine.', 'Hi, yes.');
  const byStaff = await mk('by-staff', 'Hi, written by hand.', '');
  for (const id of [asWritten, edited, byStaff]) await office.approve(await store.caseById(id), boss, {});
  const c1 = await store.caseById(asWritten); const c2 = await store.caseById(edited); const c3 = await store.caseById(byStaff);
  assert.equal(c1.approved_edited, false);
  assert.equal(c2.approved_edited, true);
  assert.equal(c3.approved_edited, null);

  states.set(c1.saved_draft_id, { state: 'sent', at: new Date() });
  states.set(c2.saved_draft_id, { state: 'other', at: new Date() });
  await office.checkSent();
  const s1 = await store.caseById(asWritten); const s2 = await store.caseById(edited);
  assert.ok(s1.sent_at, 'the approved reply that went is marked sent');
  assert.equal(s1.status, 'waiting');
  assert.equal(s2.sent_at, null, 'a different email is not marked as the approved reply');
  assert.equal(s2.sent_state, 'other');
  assert.ok((await store.eventsFor(edited)).some((e) => e.kind === 'sent_other'));
  assert.equal((await store.casesAwaitingSend()).some((c) => c.id === edited), false, 'not checked over and over');
  await office.markSent(s2, boss);
  assert.ok((await store.caseById(edited)).sent_at, 'a person can still say it was sent');

  const rep = await store.report({}, 7);
  assert.equal(rep.totals.sent, 2);
  assert.ok(rep.totals.median_sent_hours >= 1.9, 'time from the email arriving to the customer having the reply');
  assert.equal(rep.totals.as_written, 1);
  assert.equal(rep.totals.edited, 1);
  assert.equal(rep.totals.by_staff, 1);
  const rows = await store.casesForExport({}, 7);
  assert.ok(rows.every((r) => 'approved_edited' in r && 'sent_at' in r));
});
