'use strict';

// The Abacus office (abacus-office/): a standalone staff workspace for a
// taxi firm's inbox, built from the Tidewell office on Tom's decision of
// 9 November 2026. The first half runs everywhere. The second half needs
// ABACUS_OFFICE_TEST_DATABASE_URL (a throwaway database; the suite drops
// and recreates its tables) and drives the real app over HTTP with the
// model and the mailbox stubbed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ai = require('../abacus-office/lib/ai');
const cases = require('../abacus-office/lib/cases');
const demo = require('../abacus-office/lib/demoInbox');
const mailbox = require('../abacus-office/lib/mailbox');
const alerts = require('../abacus-office/lib/alerts');
const { keepsTheRules, dashesOut } = require('../lib/taxiOffice/humanise');

test('every made-up email is invented, dated from today, and goes to the worker its prepared reading says', () => {
  const inbox = demo.seedInbox('2026-11-09');
  assert.equal(inbox.length, 11);
  const expected = { 'demo-pascoe': 'bookings', 'demo-hocking': 'bookings', 'demo-rowe': 'bookings', 'demo-trevithick': 'bookings', 'demo-umbrella': 'customer', 'demo-account': 'customer', 'demo-late': 'complaints', 'demo-fare': 'complaints', 'demo-phone': 'complaints', 'demo-council': 'licensing', 'demo-spam': 'other' };
  for (const e of inbox) {
    assert.match(e.from, /@(?:[a-z0-9-]+\.)*example\.invalid>?$/, `${e.id} is from an address that can never be real`);
    assert.equal(cases.kindFor(e.prepared.intent), expected[e.id], e.id);
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(e.receivedAt), `${e.id} receivedAt`);
    if (e.prepared.reply) {
      assert.equal(dashesOut(e.prepared.reply), e.prepared.reply, `${e.id} reply has no dashes`);
      assert.equal(keepsTheRules(e.prepared.reply), true, `${e.id} reply keeps the writing rules`);
    }
    if (e.prepared.intent === 'complaint') {
      assert.ok(e.preparedComplaint, `${e.id} has a prepared complaint reply`);
      assert.doesNotMatch(e.preparedComplaint.reply, /refund|compensat|discount|free journey/i, 'a prepared complaint reply never offers money');
    }
  }
  const pascoe = inbox.find((e) => e.id === 'demo-pascoe');
  assert.equal(pascoe.prepared.journey.date, '2026-11-10', 'tomorrow is tomorrow');
  const phone = inbox.find((e) => e.id === 'demo-phone');
  assert.equal(phone.prepared.seriousness, 'safety');
  assert.equal(phone.preparedComplaint.for_licensing, true);
});

test('the reading is cleaned: a complaint, a council email and anything else carry no customer reply, and bad enums fall back', () => {
  const base = { intent: 'complaint', customer_name: 'A', phone: '', reference: '', journey: {}, missing: [], seriousness: 'serious', summary: 'x', reply: 'Hi A,\n\nSorry.\n\nThanks,\nAbacus' };
  assert.equal(ai.cleanReading(base).reply, '');
  assert.equal(ai.cleanReading({ ...base, intent: 'council' }).reply, '');
  assert.equal(ai.cleanReading({ ...base, intent: 'other' }).reply, '');
  const booking = ai.cleanReading({ ...base, intent: 'new_booking', seriousness: 'safety', reply: 'Hi A,\n\nBooked - see you then.\n\nThanks,\nAbacus' });
  assert.equal(booking.seriousness, 'none', 'seriousness only means something for a complaint');
  assert.equal(booking.reply.includes(' - '), false, 'dashes come out of a reply');
  assert.equal(ai.cleanReading({ ...base, intent: 'made_up' }).intent, 'other');
  assert.equal(ai.cleanComplaint({ seriousness: 'nope', summary: 's', firm_at_fault: 'maybe', for_licensing: 'yes', staff_steps: ['a'], reply: 'r' }).seriousness, 'minor');
  assert.equal(ai.cleanComplaint({ seriousness: 'safety', summary: 's', firm_at_fault: 'maybe', for_licensing: 'yes', staff_steps: [], reply: 'r' }).for_licensing, false, 'only a real true counts');
});

test('the prompts speak for whatever firm is configured and never call it fictional or Tidewell', () => {
  const f = { name: 'Zed Cabs', short: 'Zed', town: 'Bude', county: 'Cornwall', phone: '01288 000000', signature: 'Zed Cabs', facts: ['Lost property is kept for 28 days.'], demo: true };
  for (const sys of [ai.readSystem('2026-11-09', f), ai.complaintSystem('2026-11-09', f), ai.redraftSystem('2026-11-09', f)]) {
    assert.match(sys, /Zed Cabs/);
    assert.match(sys, /Bude, Cornwall/);
    assert.doesNotMatch(sys, /Tidewell|fictional|demonstration/i);
    assert.match(sys, /Never mention AI/);
    assert.match(sys, /ignore them/);
  }
  assert.match(ai.readSystem('2026-11-09', f), /Lost property is kept for 28 days/);
  const bare = ai.readSystem('2026-11-09', { ...f, phone: '', facts: [] });
  assert.match(bare, /Do not state any/);
  assert.match(ai.complaintSystem('2026-11-09', f), /Never offer a refund/);
  assert.match(ai.redraftSystem('2026-11-09', f), /Never name a driver/);
});

test('the mailbox mapping passes only ABACUS_OFFICE_* variables to a driver, never the Arrington inbox credentials', () => {
  const env = { ABACUS_OFFICE_MAIL_DRIVER: 'gmail', ABACUS_OFFICE_GMAIL_CLIENT_ID: 'a', ABACUS_OFFICE_MAILBOX_ADDRESS: 'office@example.invalid', GMAIL_CLIENT_ID: 'tom', GMAIL_REFRESH_TOKEN: 'tom', TAXI_OFFICE_GMAIL_CLIENT_SECRET: 'tidewell', ANTHROPIC_API_KEY: 'k' };
  const mapped = mailbox.driverEnv(env);
  assert.deepEqual(Object.keys(mapped).sort(), ['TAXI_OFFICE_DEMO_ADDRESS', 'TAXI_OFFICE_GMAIL_CLIENT_ID', 'TAXI_OFFICE_MAIL_DRIVER']);
  assert.equal(JSON.stringify(mapped).includes('tom'), false);
  assert.equal(JSON.stringify(mapped).includes('tidewell'), false);
  assert.match(mailbox.describeMailStatus(env), /NOT configured, missing ABACUS_OFFICE_GMAIL_CLIENT_SECRET, ABACUS_OFFICE_GMAIL_REFRESH_TOKEN/);
  assert.match(mailbox.describeMailStatus({}), /made-up inbox/);
  const box = mailbox.createMailbox({});
  assert.equal(box.demo, true);
  assert.equal(typeof box.send, 'undefined', 'no mailbox has a send');
});

test('no file in the office can send to a customer: the only transport goes to the manager address from the variables', () => {
  const dir = path.join(ROOT, 'abacus-office');
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|ejs)$/.test(e.name)) files.push(p); } })(dir);
  const senders = files.filter((f) => /sendMail|createTransport|nodemailer/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(senders.map((f) => path.relative(ROOT, f)), ['abacus-office/lib/alerts.js']);
  const src = read('abacus-office/lib/alerts.js');
  assert.match(src, /env\.ABACUS_OFFICE_MANAGER_EMAIL/);
  assert.match(src, /to: c\.to,/, 'the recipient is the configured manager address');
  assert.doesNotMatch(src, /to: [^,]*from_address/, 'the recipient never comes from a case');
  // A read of the Arrington inbox's own variables, in any spelling: env.GMAIL_X, env['GMAIL_X'].
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /env(?:\.|\[['"])GMAIL_/, `${path.relative(ROOT, f)} never reads the Arrington inbox variables`);
});

test('three levels: an operator approves ordinary replies, only a manager approves a complaint, only a manager reassigns someone else\'s case', () => {
  const op = { id: 1, role: 'operator' }; const mgr = { id: 2, role: 'manager' }; const owner = { id: 3, role: 'owner' };
  const booking = { kind: 'bookings', owner_id: 9 }; const complaint = { kind: 'complaints', owner_id: 9 };
  assert.equal(cases.canApprove(op, booking), true);
  assert.equal(cases.canApprove(op, complaint), false);
  assert.equal(cases.canApprove(mgr, complaint), true);
  assert.equal(cases.canApprove(owner, complaint), true);
  assert.equal(cases.canApprove(null, booking), false);
  assert.equal(cases.canReassign(op, booking), false);
  assert.equal(cases.canReassign(op, { kind: 'bookings', owner_id: 1 }), true);
  assert.equal(cases.canReassign(op, { kind: 'bookings', owner_id: null }), true);
  assert.equal(cases.canReassign(mgr, booking), true);
});

test('an escalation email names the manager address from the variables only, and is skipped when nothing is configured', async () => {
  let sent = null;
  alerts.__setTransportFactoryForTests(() => ({ sendMail: async (m) => { sent = m; return { messageId: 'x' }; } }));
  const env = { ABACUS_OFFICE_SMTP_HOST: 'smtp.example.invalid', ABACUS_OFFICE_SMTP_USER: 'u', ABACUS_OFFICE_SMTP_PASSWORD: 'p', ABACUS_OFFICE_MANAGER_EMAIL: 'manager@example.invalid' };
  const r = await alerts.sendEscalation({ cases: [{ id: 4, subject: 'Late car', from_address: 'customer@example.invalid', received_at: new Date() }], hours: 24, baseUrl: 'https://office.example.invalid', firmName: 'Abacus Taxis' }, env);
  assert.equal(r.sent, true);
  assert.equal(sent.to, 'manager@example.invalid');
  assert.match(sent.text, /Nothing has been sent to the customer/);
  assert.match(sent.text, /case\/4/);
  assert.deepEqual(await alerts.sendEscalation({ cases: [], hours: 24, firmName: 'x' }, {}), { sent: false, reason: 'not configured' });
});

// ---- Over real HTTP, against a throwaway database -------------------------------

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;

test('the office over HTTP: login, forced password change, one case per email, roles, guidance, approval and escalation', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB });
  await pool.query('DROP TABLE IF EXISTS case_events, cases, settings, users, session CASCADE');
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const store = new Store(pool);
  await store.ensureSchema();
  await store.createUser({ username: 'owner', password: 'owner-pass-12345', role: 'owner', mustChange: true });
  await store.createUser({ username: 'sam', password: 'sam-pass-123456', role: 'operator' });
  await store.createUser({ username: 'meg', password: 'meg-pass-123456', role: 'manager' });

  // The model: answers the read schema with a fixed reading, and a redraft
  // that proves the staff note reached it.
  let aiCalls = 0;
  let aiOn = false;
  ai.__setClientFactoryForTests(() => ({ messages: { create: async ({ system, messages }) => {
    aiCalls += 1;
    const user = messages[0].content;
    let out;
    if (/YOUR DRAFT/.test(system) || /WHAT STAFF WANT/.test(user)) out = { reply: `Hi Jenna,\n\nWe are full at 6.40, so I have put you down for 6.30 instead.\n\nThanks,\nAbacus Taxis`, held_back: '' };
    else if (/handle complaints|WHAT THE OFFICE KNOWS/.test(user + system)) out = { seriousness: 'serious', summary: 'Late car', firm_at_fault: 'unclear', for_licensing: false, staff_steps: ['Find the job'], reply: 'Hi Dave,\n\nSorry.\n\nThanks,\nAbacus Taxis' };
    else out = { intent: 'new_booking', customer_name: 'Stub', phone: '', reference: '', journey: { date: '', time: '', pickup: '', destination: '', passengers: '' }, missing: [], seriousness: 'none', summary: 'From the stub model.', reply: 'Hi Stub,\n\nBooked.\n\nThanks,\nAbacus Taxis' };
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }] };
  } } }));

  let drafts = [];
  const box = { name: 'test', label: 'Test mailbox', demo: false, configured: () => true, missing: () => [], account: async () => null,
    listInbox: async ({ today }) => demo.seedInbox(today), saveReplyDraft: async (email, text) => { drafts.push({ to: email.from, text }); return { draftId: `d${drafts.length}` }; } };
  const firm = { name: 'Abacus Taxis', short: 'Abacus', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Abacus Taxis', facts: [], demo: false };
  const { app, office } = createApp({ pool, mailbox: box, firm, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => aiOn });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await pool.end(); });

  // A tiny browser: a cookie jar per person, the CSRF token read off each page.
  function client() {
    const jar = new Map();
    const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const absorb = (res) => { for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
    const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: cookieHeader() }, redirect: 'manual' }); absorb(res); return { status: res.status, location: res.headers.get('location'), text: await res.text() }; };
    const post = async (p, fields, from = '/login') => {
      const page = await get(from);
      const token = (page.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      const body = new URLSearchParams({ _csrf: token, ...fields });
      const res = await fetch(base + p, { method: 'POST', headers: { cookie: cookieHeader(), 'content-type': 'application/x-www-form-urlencoded', referer: base + from }, body, redirect: 'manual' });
      absorb(res);
      return { status: res.status, location: res.headers.get('location'), text: await res.text() };
    };
    return { get, post };
  }

  // Anonymous: everything but the sign-in page and /health sends you to sign in.
  const anon = client();
  assert.equal((await anon.get('/')).location, '/login?next=%2F');
  assert.equal((await anon.get('/case/1')).status, 302);
  assert.equal((await anon.get('/health')).status, 200);

  // The owner signs in, is made to choose a password, then sees Today.
  const owner = client();
  let r = await owner.post('/login', { username: 'owner', password: 'wrong-password-x', next: '/' });
  assert.equal(r.status, 401);
  r = await owner.post('/login', { username: 'owner', password: 'owner-pass-12345', next: '/' });
  assert.equal(r.location, '/account', 'a first login goes to the password change');
  assert.equal((await owner.get('/inbox')).location, '/account', 'nothing else until the password is changed');
  r = await owner.post('/account/password', { current: 'owner-pass-12345', password: 'owner-pass-67890', again: 'owner-pass-67890' }, '/account');
  assert.equal(r.location, '/');
  r = await owner.get('/');
  assert.equal(r.status, 200);
  assert.match(r.text, /Here's what needs doing today/);

  // One case per email, however many times the mailbox is read.
  const inbox = demo.seedInbox(demo.todayLondon());
  assert.equal(Number((await pool.query('SELECT count(*)::int AS n FROM cases')).rows[0].n), inbox.length, 'the first page view pulled the mailbox');
  await owner.post('/inbox/sync', {}, '/inbox');
  assert.equal(Number((await pool.query('SELECT count(*)::int AS n FROM cases')).rows[0].n), inbox.length, 'a second read makes no second case');
  const byId = async (mid) => (await pool.query('SELECT * FROM cases WHERE message_id = $1', [mid])).rows[0];
  const pascoe = await byId('<demo-pascoe@example.invalid>');
  assert.equal(pascoe.kind, 'bookings');
  assert.equal(pascoe.reading_source, 'prepared', 'with the AI off a made-up email shows its prepared answer');
  assert.match(pascoe.draft, /Hi Jenna/);
  const phone = await byId('<demo-phone@example.invalid>');
  assert.equal(phone.kind, 'complaints');
  assert.equal(phone.seriousness, 'safety');
  const spam = await byId('<demo-spam@example.invalid>');
  assert.equal(spam.status, 'done', 'a sales pitch is marked done with no reply');
  assert.equal(spam.draft, '');

  // The operator can approve a booking reply, which is saved as a DRAFT in
  // the mailbox, and cannot approve a complaint or reach Users.
  const sam = client();
  await sam.post('/login', { username: 'sam', password: 'sam-pass-123456', next: '/' });
  assert.equal((await sam.get('/users')).status, 404, 'an operator is shown nothing about Users');
  assert.equal((await sam.get('/activity')).status, 404);
  r = await sam.post(`/case/${pascoe.id}/approve`, { draft: pascoe.draft }, `/case/${pascoe.id}`);
  assert.equal(r.location, `/case/${pascoe.id}`);
  assert.equal(drafts.length, 1, 'approving saved exactly one draft in the mailbox');
  assert.equal(drafts[0].to, pascoe.from_address);
  const afterApprove = await byId('<demo-pascoe@example.invalid>');
  assert.ok(afterApprove.approved_at);
  assert.equal(afterApprove.status, 'waiting');
  r = await sam.post(`/case/${phone.id}/approve`, { draft: phone.draft }, `/case/${phone.id}`);
  assert.equal(drafts.length, 1, 'an operator cannot approve a complaint reply');
  r = await sam.get(`/case/${phone.id}`);
  assert.match(r.text, /needs a manager to approve it/);
  assert.doesNotMatch(r.text, /formaction="\/case\/\d+\/approve"/, 'and sees no approve button');

  // A manager can, and the action is recorded under their name.
  const meg = client();
  await meg.post('/login', { username: 'meg', password: 'meg-pass-123456', next: '/' });
  r = await meg.post(`/case/${phone.id}/approve`, { draft: phone.draft }, `/case/${phone.id}`);
  assert.equal(drafts.length, 2);
  const events = (await pool.query('SELECT actor_name, kind FROM case_events WHERE case_id = $1 ORDER BY at', [phone.id])).rows;
  assert.deepEqual(events.filter((e) => e.kind === 'approved').map((e) => e.actor_name), ['meg']);
  assert.equal((await meg.get('/activity')).status, 200);
  assert.equal((await meg.get('/users')).status, 404, 'a manager does not manage users');

  // Guidance with the AI off is recorded and the draft kept; with the AI on
  // the draft is rewritten to the note.
  r = await sam.post(`/case/${pascoe.id}/guide`, { draft: pascoe.draft, guidance: 'We are full at 6.40, offer 6.30.' }, `/case/${pascoe.id}`);
  let g = await byId('<demo-pascoe@example.invalid>');
  assert.deepEqual(g.guidance, ['We are full at 6.40, offer 6.30.']);
  assert.match(g.draft, /6\.40am tomorrow/, 'the AI is off, so the draft stands');
  aiOn = true;
  r = await sam.post(`/case/${pascoe.id}/guide`, { draft: g.draft, guidance: 'Be brief.' }, `/case/${pascoe.id}`);
  g = await byId('<demo-pascoe@example.invalid>');
  assert.match(g.draft, /6\.30 instead/, 'the draft was rewritten through the model');
  assert.equal(g.approved_at, null, 'a rewritten draft needs approving again');
  assert.equal(g.guidance.length, 2);
  // A fresh read with the AI on goes to the model and is labelled as such.
  await sam.post(`/case/${pascoe.id}/read`, {}, `/case/${pascoe.id}`);
  g = await byId('<demo-pascoe@example.invalid>');
  assert.equal(g.reading_source, 'ai');
  assert.equal(g.reading.summary, 'From the stub model.');
  // A model failure falls back to the prepared answer and says so.
  ai.__setClientFactoryForTests(() => ({ messages: { create: async () => { const e = new Error('down'); e.status = 529; throw e; } } }));
  await sam.post(`/case/${pascoe.id}/read`, {}, `/case/${pascoe.id}`);
  g = await byId('<demo-pascoe@example.invalid>');
  assert.equal(g.reading_source, 'prepared');
  assert.match(g.reading_note, /could not read this email/);
  aiOn = false;

  // Escalation: the old unapproved cases go overdue once, the manager is
  // emailed once, and a second sweep sends nothing more. Approved and
  // "other" cases never escalate.
  let mails = 0;
  alerts.__setTransportFactoryForTests(() => ({ sendMail: async () => { mails += 1; return { messageId: 'm' }; } }));
  const env = { ABACUS_OFFICE_SMTP_HOST: 'h', ABACUS_OFFICE_SMTP_USER: 'u', ABACUS_OFFICE_SMTP_PASSWORD: 'p', ABACUS_OFFICE_MANAGER_EMAIL: 'manager@example.invalid' };
  const alertsWithEnv = { sendEscalation: (args) => alerts.sendEscalation(args, env) };
  const first = await office.sweep(alertsWithEnv, base);
  assert.ok(first.escalated >= 3, `the cases older than 24 hours escalate (${first.escalated})`);
  assert.equal(first.emailed, true);
  assert.equal(mails, 1);
  const second = await office.sweep(alertsWithEnv, base);
  assert.deepEqual(second, { escalated: 0, emailed: false });
  const escalated = (await pool.query("SELECT message_id, kind, approved_at FROM cases WHERE escalated_at IS NOT NULL")).rows;
  assert.ok(escalated.every((c) => c.kind !== 'other'), 'a sales pitch never escalates');
  assert.ok(!escalated.some((c) => c.message_id === '<demo-phone@example.invalid>'), 'an approved reply does not escalate');
  r = await owner.get('/');
  assert.match(r.text, /Overdue/);

  // Users: the owner adds an operator who must choose a password; nobody can
  // deactivate themselves.
  r = await owner.post('/users', { username: 'new.op', display_name: 'New Op', password: 'temporary-pass-1', role: 'operator' }, '/users');
  assert.equal(r.location, '/users');
  const newOp = await store.userByName('new.op');
  assert.equal(newOp.must_change_password, true);
  const me = await store.userByName('owner');
  await owner.post(`/users/${me.id}`, { action: 'deactivate' }, '/users');
  assert.equal((await store.userByName('owner')).active, true);
  // Sign out works and the session is gone.
  r = await owner.post('/logout', {}, '/');
  assert.equal(r.location, '/login');
  assert.equal((await owner.get('/')).status, 302);
});
