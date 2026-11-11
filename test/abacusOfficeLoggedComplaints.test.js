'use strict';

// Complaints that come in another way (Tom, 10 November 2026: "Complaints
// should have a text box we can put a complaint into, some could come
// through other ways, through google reviews, Facebook, email or other. The
// AI needs to know what channel so maybe have a drop down menu"). The first
// half runs everywhere; the second needs ABACUS_OFFICE_TEST_DATABASE_URL and
// works in a schema of its own.

const test = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../abacus-office/lib/ai');
const { CHANNELS, isChannel, isLogged, channelRules } = require('../abacus-office/lib/channels');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;
const firm = { name: 'Cornwall Taxis', short: 'Cornwall', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Cornwall Taxis', facts: [], fixedPrices: [] };

test('the channel list: Google review, Facebook, messages, email, phone, in person, other; public ones are marked', () => {
  assert.deepEqual(Object.keys(CHANNELS), ['google_review', 'facebook_public', 'social_message', 'email', 'phone', 'in_person', 'other']);
  assert.equal(CHANNELS.google_review.public, true);
  assert.equal(CHANNELS.facebook_public.public, true);
  assert.equal(CHANNELS.social_message.public, false);
  assert.equal(isChannel('constructor'), false);
  assert.equal(isLogged({ message_id: '<logged-abc@office>' }), true);
  assert.equal(isLogged({ message_id: '<abc@mail.gmail.com>' }), false);
});

test('a public review gets the public-reply rules and no email sign-off; an email complaint keeps the email layout', () => {
  const pub = ai.complaintSystem('2026-11-10', firm, 'google_review');
  assert.ok(pub.includes(channelRules('google_review')));
  assert.match(pub, /The reply is public, so keep it short/);
  assert.match(pub, /Never put a booking reference/);
  assert.doesNotMatch(pub, /Sign off with "Thanks,"/, 'no email sign-off on a public reply');
  const mail = ai.complaintSystem('2026-11-10', firm, '');
  assert.match(mail, /Sign off with "Thanks,"/);
  assert.doesNotMatch(mail, /WHERE IT CAME IN/, 'a mailbox complaint is unchanged');
  const phone = ai.redraftSystem('2026-11-10', firm, 'phone');
  assert.match(phone, /a phone call to the office/);
  assert.match(ai.emailText({ from: 'Sarah P.', receivedAt: '2026-11-10T12:00', subject: 'x', body: 'y', channel: 'google_review', logged: true }), /Came in by: Google review/);
  assert.doesNotMatch(ai.emailText({ from: 'a@b.c', receivedAt: '2026-11-10T12:00', subject: 'x', body: 'y', channel: 'email', logged: false }), /Came in by/);
});

test('over HTTP: staff log a Google review, the AI drafts a public reply with the channel, approving says to post it, and nothing goes to the mailbox', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_logged_test';
  const admin = new Pool({ connectionString: DB });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);
  await admin.end();
  const pool = new Pool({ connectionString: DB, options: `-c search_path=${SCHEMA}` });
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const store = new Store(pool);
  await store.ensureSchema();
  await store.ensureSchema();
  await store.createUser({ username: 'sam', displayName: 'Sam', password: 'sam-pass-123456', role: 'operator', brand: 'coastline' });

  const calls = [];
  ai.__setClientFactoryForTests(() => ({ messages: { create: async ({ system, messages }) => {
    calls.push({ system, user: messages[0].content });
    const isComplaint = /COMPLAINT|one complaint/i.test(system) && /JUDGING IT/.test(system);
    const out = isComplaint
      ? { seriousness: 'minor', summary: 'Driver was late and rude.', firm_at_fault: 'unclear', for_licensing: false, pass_to_manager: false, pass_to_manager_why: '', staff_steps: ['Find the job'], reply: 'Hi Sarah,\n\nThank you for the feedback. We are sorry to read this and would like to look into it, so please send us a message.\n\nCoastline Travel' }
      : { intent: 'enquiry', customer_name: 'Sarah', phone: '', reference: '', journey: { date: '', time: '', pickup: '', destination: '', passengers: '', flight: '' }, missing: [], seriousness: 'none', summary: 'Unhappy with a late, rude driver.', reply: 'Hi Sarah' };
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }] };
  } } }));
  t.after(() => ai.__setClientFactoryForTests(null));

  const saved = [];
  const mailbox = { name: 'gmail', label: 'Gmail', demo: false, none: false, configured: () => true, missing: () => [], listInbox: async () => [], account: async () => null,
    saveReplyDraft: async () => { saved.push('reply'); return { draftId: 'x' }; }, saveNewDraft: async (to, subject, text) => { saved.push({ to, subject, text }); return { draftId: `d${saved.length}` }; } };
  const f = { ...firm, demo: false, logo: '', mailboxBrand: 'abacus', brands: [{ id: 'abacus', name: 'Abacus & Falmouth Taxis' }, { id: 'coastline', name: 'Coastline Travel' }] };
  const { app, office } = createApp({ pool, mailbox, firm: f, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => true, alertsEnv: {} });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end(); });
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
  const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: cookie() }, redirect: 'manual' }); absorb(res); return { status: res.status, text: await res.text(), location: res.headers.get('location') }; };
  const post = async (p, fields, from) => {
    const page = await get(from);
    const token = (page.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    const res = await fetch(base + p, { method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: token, ...fields }), redirect: 'manual' });
    absorb(res);
    return { status: res.status, text: await res.text(), location: res.headers.get('location') };
  };
  await post('/login', { username: 'sam', password: 'sam-pass-123456', next: '/' }, '/login');

  let r = await get('/complaints');
  assert.match(r.text, /Log a complaint/);
  assert.match(r.text, /<option value="google_review">Google review<\/option>/);
  r = await post('/complaints/log', { channel: '', text: 'The driver was late.' }, '/complaints');
  assert.equal(r.location, '/complaints#log-a-complaint', 'no channel, nothing logged');
  assert.equal((await store.listCases({})).length, 0);

  r = await post('/complaints/log', { channel: 'google_review', name: 'Sarah P.', date: '2026-11-09', text: 'One star. Driver turned up 20 minutes late and was rude when I asked why.', brand: 'abacus' }, '/complaints');
  const id = Number((r.location || '').split('/').pop());
  const kase = await store.caseById(id);
  assert.equal(kase.kind, 'complaints', 'a complaint even though the reading called it an enquiry');
  assert.equal(kase.channel, 'google_review');
  assert.equal(kase.brand, 'coastline', 'an operator logs for their own company');
  assert.match(kase.draft, /send us a message/);
  const complaintCall = calls.find((c) => /JUDGING IT/.test(c.system));
  assert.match(complaintCall.system, /The reply is public/);
  assert.match(complaintCall.user, /Came in by: Google review/);

  r = await get(`/case/${id}`);
  assert.match(r.text, /Came in by google review/);
  assert.match(r.text, /posted publicly under their google review/);
  assert.doesNotMatch(r.text, /Send the holding reply/, 'no mailbox holding reply for a review');
  assert.equal((await post(`/case/${id}/holding`, {}, `/case/${id}`)).status, 302);
  assert.equal((await store.caseById(id)).holding_sent_at, null);

  await post(`/case/${id}/approve`, {}, `/case/${id}`);
  const after = await store.caseById(id);
  assert.ok(after.approved_at);
  assert.equal(saved.length, 0, 'nothing goes to the mailbox for a Google review');
  r = await get(`/case/${id}`);
  assert.match(r.text, /post it as the reply under their review on Google/);
  assert.match(r.text, /Copy the reply/);
  assert.match((await get('/complaints')).text, /<span class="to-tag">Google review<\/span>/);

  // An email complaint for Coastline is not put in the Abacus mailbox (the
  // review of 11 November 2026): it is approved for copying out.
  r = await post('/complaints/log', { channel: 'email', name: 'Jo', contact: 'jo@example.invalid', text: 'You overcharged me on Saturday night.' }, '/complaints');
  const idCoast = Number((r.location || '').split('/').pop());
  await post(`/case/${idCoast}/approve`, {}, `/case/${idCoast}`);
  assert.equal(saved.length, 0, 'a Coastline complaint reply never waits in the Abacus mailbox');
  assert.ok((await store.caseById(idCoast)).approved_at);
  // For the mailbox's own company, an email complaint with an address goes
  // into the mailbox as a new draft.
  r = await post('/complaints/log', { channel: 'email', name: 'Jim', contact: 'jim@example.invalid', text: 'You overcharged me on Friday night.' }, '/complaints');
  const id2 = Number((r.location || '').split('/').pop());
  await store.updateCase(id2, { brand: 'abacus' });
  await office.approve(await store.caseById(id2), await store.userByName('sam'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].to, 'jim@example.invalid');
});
