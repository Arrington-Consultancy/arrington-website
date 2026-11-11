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
  assert.match(mailbox.describeMailStatus(env), /NOT connected, missing ABACUS_OFFICE_GMAIL_CLIENT_SECRET \(or enter it in Settings\), ABACUS_OFFICE_GMAIL_REFRESH_TOKEN \(or connect it from Settings\)/);
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
  assert.match(src, /sendMail\(\{ from: c\.from, to, subject, text \}\)/, 'the recipient is a configured manager address');
  assert.match(src, /function recipientFor\(c, brand\) \{ return c\.perBrand\[[^\]]+\] \|\| c\.to; \}/, 'which comes from the variables only');
  assert.doesNotMatch(src, /to: [^,]*from_address/, 'the recipient never comes from a case');
  // A read of the Arrington inbox's own variables, in any spelling: env.GMAIL_X, env['GMAIL_X'].
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /env(?:\.|\[['"])GMAIL_/, `${path.relative(ROOT, f)} never reads the Arrington inbox variables`);
});

test('three levels: an operator approves replies, complaints included, but a complaint passed up or a safety matter needs a manager; only a manager reassigns someone else\'s case', () => {
  const op = { id: 1, role: 'operator' }; const mgr = { id: 2, role: 'manager' }; const owner = { id: 3, role: 'owner' };
  const booking = { kind: 'bookings', owner_id: 9 }; const complaint = { kind: 'complaints', owner_id: 9, seriousness: 'minor' };
  const passedUp = { ...complaint, passed_up_at: new Date() }; const safety = { ...complaint, seriousness: 'safety' };
  assert.equal(cases.canApprove(op, booking), true);
  assert.equal(cases.canApprove(op, complaint), true, 'operators handle complaints (Tom\'s email to Dan, 9 November 2026)');
  assert.equal(cases.canApprove(op, passedUp), false, 'once passed up, a manager approves');
  assert.equal(cases.canApprove(op, safety), false, 'a safety matter always goes to a manager');
  assert.equal(cases.canApprove(mgr, passedUp), true);
  assert.equal(cases.canApprove(mgr, safety), true);
  assert.equal(cases.canApprove(owner, complaint), true);
  assert.equal(cases.canApprove(null, booking), false);
  // Visibility by brand: a brand's staff see their brand, the office sees all.
  assert.equal(cases.canSee({ brand: 'abacus' }, { brand: 'abacus' }), true);
  assert.equal(cases.canSee({ brand: 'abacus' }, { brand: 'coastline' }), false);
  assert.equal(cases.canSee({ brand: '' }, { brand: 'coastline' }), true);
  assert.equal(cases.scopeFor({ brand: '' }), undefined);
  assert.equal(cases.scopeFor({ brand: 'coastline' }), 'coastline');
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
  assert.deepEqual(await alerts.sendEscalation({ cases: [], hours: 24, firmName: 'x' }, {}), { sent: false, reason: 'not configured', sentIds: [] });
  // Each company's manager hears about its own (the review of 11 November
  // 2026); a company without its own address uses the general one.
  const out = [];
  alerts.__setTransportFactoryForTests(() => ({ sendMail: async (m) => { out.push(m); return { messageId: 'y' }; } }));
  const r2 = await alerts.sendEscalation({ cases: [{ id: 5, brand: 'coastline', subject: 'a', from_address: 'x', received_at: new Date() }, { id: 6, brand: 'abacus', subject: 'b', from_address: 'y', received_at: new Date() }], hours: 24, firmName: 'Cornwall Taxis' }, { ...env, ABACUS_OFFICE_MANAGER_EMAIL_COASTLINE: 'coast.manager@example.invalid' });
  assert.deepEqual(out.map((m) => m.to).sort(), ['coast.manager@example.invalid', 'manager@example.invalid']);
  assert.deepEqual(r2.sentIds.sort(), [5, 6]);
});

test('the office writes in the Tidewell voice: Tom\'s writing rules, word for word, in every prompt, and the same cleanup on every reply', () => {
  // Tom, 9 November 2026: "make sure its using the tone of voice used in
  // tidewell cars". The rules are one block (lib/taxiOffice/ai.js WRITING,
  // copied from 01A TOM VOICE on 19/10/2026) and this office imports it
  // rather than keeping a copy, so the two offices cannot drift apart.
  const { WRITING } = require('../lib/taxiOffice/ai');
  assert.match(WRITING, /HOW TO WRITE/);
  const f = { name: 'Abacus Taxis', short: 'Abacus', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Abacus Taxis', facts: [], demo: false };
  for (const sys of [ai.readSystem('2026-11-09', f), ai.complaintSystem('2026-11-09', f), ai.redraftSystem('2026-11-09', f)]) {
    assert.ok(sys.includes(WRITING), 'the whole writing block is in the prompt');
    assert.match(sys, /Sign off with "Thanks," for most customers or "Cheers," for a regular/);
  }
  const src = read('abacus-office/lib/ai.js');
  assert.match(src, /require\('\.\.\/\.\.\/lib\/taxiOffice\/ai'\)/, 'imported, not copied');
  assert.doesNotMatch(src, /HOW TO WRITE/, 'no second copy of the rules in this office');
  // Every reply the model writes goes through the same cleanup.
  const r = ai.cleanReading({ intent: 'new_booking', customer_name: 'A', phone: '', reference: '', journey: {}, missing: [], seriousness: 'none', summary: 's', reply: 'Hi A,\n\nThank you for reaching out. Booked - see you then.\n\nThanks,\nAbacus Taxis' });
  assert.equal(r.reply, 'Hi A,\n\nBooked, see you then.\n\nThanks,\nAbacus Taxis');
  // And the holding reply, which is the firm's own words, keeps them too.
  const office = new cases.Office({ store: {}, mailbox: {}, firm: f });
  const holding = office.holdingText({ reading: { customer_name: 'Dave Carne' } });
  assert.match(holding, /^Hi Dave,\n\n/);
  assert.match(holding, /Thank you for your patience/);
  assert.equal(keepsTheRules(holding), true);
  assert.equal(dashesOut(holding), holding);
});

test('the AI recommends passing a complaint up, a safety matter always goes up, and the sign-off tick gates every booking', () => {
  const c = ai.cleanComplaint({ seriousness: 'minor', summary: 's', firm_at_fault: 'no', for_licensing: false, pass_to_manager: true, pass_to_manager_why: 'They want a refund', staff_steps: [], reply: 'r' });
  assert.equal(c.pass_to_manager, true);
  assert.equal(c.pass_to_manager_why, 'They want a refund');
  const quiet = ai.cleanComplaint({ seriousness: 'minor', summary: 's', firm_at_fault: 'no', for_licensing: false, pass_to_manager: 'yes', pass_to_manager_why: '', staff_steps: [], reply: 'r' });
  assert.equal(quiet.pass_to_manager, false, 'only a real true counts');
  const safety = ai.cleanComplaint({ seriousness: 'safety', summary: 's', firm_at_fault: 'unclear', for_licensing: true, pass_to_manager: false, pass_to_manager_why: '', staff_steps: [], reply: 'r' });
  assert.equal(safety.pass_to_manager, true, 'a safety matter goes up whatever the model said');
  assert.match(safety.pass_to_manager_why, /safety matter/);
  assert.match(ai.complaintSystem('2026-11-09', { name: 'X', town: 'T', county: 'C', phone: '', signature: 'X', facts: [] }), /pass_to_manager: whether this one should be passed up/);

  const dispatch = require('../abacus-office/lib/dispatch');
  const full = { date: '2026-11-13', time: '19:30', pickup: 'The Moor', destination: 'Penryn', name: 'Claire Rowe', phone: '07700 900999', passengers: '2' };
  assert.deepEqual(dispatch.cleanJob(full).missing, []);
  assert.deepEqual(dispatch.cleanJob({ ...full, phone: '' }).missing, ['a phone number']);
  assert.deepEqual(dispatch.cleanJob({ ...full, time: '7.30pm' }).missing, ['a time as HH:MM']);
  assert.deepEqual(dispatch.cleanJob({ ...full, passengers: '' }).missing, ['how many passengers'], 'a job is never booked with the passengers guessed');
  // What the reply asks the customer for is decided by code from the fields
  // (Tom, 10/11/2026: "we need to ask for phone number, how many people etc"),
  // so a model that writes an empty missing list still gets every question asked.
  const reading = (over) => ai.cleanReading({ intent: 'new_booking', customer_name: 'Mark', phone: '', reference: '', journey: { date: '2026-11-14', time: '', pickup: 'Newquay Airport', destination: 'Falmouth', passengers: 'we', flight: '' }, missing: [], seriousness: 'none', summary: 's', reply: 'r', ...over });
  const asked = reading({}).missing;
  assert.ok(asked.some((x) => /mobile number/.test(x)), 'asks for a phone number');
  assert.ok(asked.some((x) => /how many people/.test(x)), 'asks how many are travelling; "we" is not a number');
  assert.ok(asked.some((x) => /pickup time/.test(x)));
  assert.ok(asked.some((x) => /flight number/.test(x)), 'an airport pickup asks for the flight number');
  assert.deepEqual(reading({ phone: '07700 900999', journey: { date: '2026-11-14', time: '09:00', pickup: '3 Fore Street', destination: 'Falmouth', passengers: '3', flight: '' } }).missing, [], 'nothing asked for when the email gives it all');
  const sys = ai.readSystem('2026-11-10', { name: 'X', town: 'T', county: 'C', phone: '', signature: 'X', facts: [] });
  for (const [, label] of dispatch.REQUIRED) assert.ok(sys.includes(label), `the reading prompt names ${label}`);
  assert.match(sys, /ask for every missing item in the one reply/);
  // The live connection refuses until it has the firm's own API access, and
  // the refusal reaches the person as its own message, not a crash.
  const icabbi = dispatch.createDispatch({ store: {}, env: { ABACUS_OFFICE_DISPATCH_DRIVER: 'icabbi' } });
  assert.equal(icabbi.live, true);
  return icabbi.book({ job: full, kase: null, brand: 'abacus', actor: null }).then(() => assert.fail('should refuse'), (e) => {
    assert.equal(e.code, 'REFUSED');
    assert.match(e.message, /iCabbi is not connected yet/);
    assert.match(e.message, /Nothing was booked/);
    assert.match(dispatch.describeDispatchStatus({ ABACUS_OFFICE_DISPATCH_DRIVER: 'icabbi' }), /NOT connected/);
    assert.match(dispatch.describeDispatchStatus({}), /stand-in/);
    // No AI path reaches a booking: the only caller of office.book is the route behind the tick.
    const appSrc = read('abacus-office/app.js');
    assert.match(appSrc, /office\.book\(req\.kase, req\.user, req\.body, req\.body\.signed_off === 'yes'\)/);
    for (const f of ['abacus-office/lib/ai.js', 'abacus-office/lib/cases.js']) assert.doesNotMatch(read(f).replace(/\n  async book\([\s\S]*?\n  }\n/, ''), /dispatch\.book\(|\.book\(/, `${f} has no other path into dispatch`);
  });
});

// ---- Over real HTTP, against a throwaway database -------------------------------

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;

test('the owner password can be recovered from the deployment variables alone, and the one-time password is only ever printed once', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'abacus-office', 'server.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function ensureOwner'), src.indexOf('async function main'));
  // An existing owner is reset from ABACUS_OFFICE_OWNER_PASSWORD, must change it at the next sign in, and the log says to remove the variable.
  assert.match(fn, /if \(await store\.userCount\(\)\) \{[\s\S]*store\.setPassword\(owner\.id, password, true\)/);
  assert.match(fn, /remove that variable now/);
  // A short or absent value changes nothing on an existing database.
  assert.match(fn, /if \(!password\) return;/);
  assert.match(fn, /shorter than 10 characters; nothing changed/);
  // A reset is a recorded event, never a silent change.
  assert.match(fn, /kind: 'password_reset'/);
  // The generated password is printed only on the first boot, inside the create branch, never on a reset.
  const resetBranch = fn.slice(0, fn.indexOf('let generated'));
  assert.doesNotMatch(resetBranch, /One-time password/);
});

test('the office over HTTP: login, forced password change, one case per email, roles, guidance, approval and escalation', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB });
  await pool.query('DROP TABLE IF EXISTS case_events, dispatch_bookings, fixed_prices, cases, settings, users, session CASCADE');
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
  const firm = { name: 'Abacus Taxis', short: 'Abacus', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Abacus Taxis', facts: [], demo: false, brands: [{ id: 'abacus', name: 'Abacus Taxis' }, { id: 'coastline', name: 'Coastline Taxis' }], mailboxBrand: 'abacus', logo: '' };
  // The manager address the escalation, pass-up and nudge emails go to.
  const env = { ABACUS_OFFICE_SMTP_HOST: 'h', ABACUS_OFFICE_SMTP_USER: 'u', ABACUS_OFFICE_SMTP_PASSWORD: 'p', ABACUS_OFFICE_MANAGER_EMAIL: 'manager@example.invalid' };
  const { app, office } = createApp({ pool, mailbox: box, firm, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => aiOn, alertsEnv: env, baseUrl: 'http://office.test' });
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
  assert.equal(drafts.length, 1, 'an operator cannot approve a SAFETY complaint reply');
  r = await sam.get(`/case/${phone.id}`);
  assert.match(r.text, /A safety matter needs a manager to approve the reply/);
  assert.doesNotMatch(r.text, /formaction="\/case\/\d+\/approve"/, 'and sees no approve button');

  // Release two (Tom's email to Dan, 9 November 2026). An operator DOES
  // handle an ordinary complaint: the fare query is approved by sam and
  // saved as a draft like any other reply.
  const fare = await byId('<demo-fare@example.invalid>');
  assert.equal(fare.kind, 'complaints');
  r = await sam.get(`/case/${fare.id}`);
  assert.match(r.text, /formaction="\/case\/\d+\/approve"/, 'an operator sees the approve button on an ordinary complaint');
  assert.match(r.text, /Pass up to a manager/, 'and the button to pass it up');
  assert.match(r.text, /Send the holding reply/, 'and the one-click holding reply');
  r = await sam.post(`/case/${fare.id}/approve`, { draft: fare.draft }, `/case/${fare.id}`);
  assert.equal(drafts.length, 2, 'the operator approved the fare complaint reply');

  // The late-car complaint is passed up by the operator: the manager is
  // emailed once, only a manager may approve it now, and the holding reply
  // goes as a draft in the mailbox on the operator's click.
  let passUpMails = [];
  alerts.__setTransportFactoryForTests(() => ({ sendMail: async (m) => { passUpMails.push(m); return { messageId: 'p' }; } }));
  const late = await byId('<demo-late@example.invalid>');
  r = await sam.post(`/case/${late.id}/pass-up`, { reason: 'He is asking for a refund.' }, `/case/${late.id}`);
  assert.equal(r.location, `/case/${late.id}`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  let lateNow = await byId('<demo-late@example.invalid>');
  assert.ok(lateNow.passed_up_at, 'passed up');
  assert.equal(lateNow.passed_up_reason, 'He is asking for a refund.');
  assert.equal(passUpMails.length, 1, 'the manager was emailed once about the pass-up');
  assert.equal(passUpMails[0].to, 'manager@example.invalid');
  assert.match(passUpMails[0].text, /sam has passed a complaint up/);
  r = await sam.post(`/case/${late.id}/approve`, { draft: late.draft }, `/case/${late.id}`);
  assert.equal(drafts.length, 2, 'once passed up, the operator can no longer approve it');
  r = await sam.post(`/case/${late.id}/holding`, {}, `/case/${late.id}`);
  assert.equal(drafts.length, 3, 'the holding reply is saved as a draft in the mailbox');
  assert.equal(drafts[2].to, late.from_address);
  assert.match(drafts[2].text, /^Hi Dave,\n\nI'm sorry you've had cause to write to us\. I've passed this to a manager/);
  assert.match(drafts[2].text, /Thank you for your patience/);
  assert.equal(keepsTheRules(drafts[2].text), true, 'the holding reply keeps the writing rules');
  r = await sam.post(`/case/${late.id}/holding`, {}, `/case/${late.id}`);
  assert.equal(drafts.length, 3, 'the holding reply goes once');
  lateNow = await byId('<demo-late@example.invalid>');
  assert.ok(lateNow.holding_sent_at);
  r = await sam.post(`/case/${late.id}/pass-up`, {}, `/case/${late.id}`);
  assert.ok(lateNow.passed_up_at, 'a second pass-up changes nothing');

  // Booking into dispatch: refused without the sign-off tick, refused with a
  // detail missing, booked with both, and never twice.
  const rowe = await byId('<demo-rowe@example.invalid>');
  const bookingFields = { date: '2026-11-13', time: '19:30', pickup: 'The Moor', destination: 'Penryn', name: 'Claire Rowe', phone: '07700 900999', passengers: '2', vehicle: 'Car (up to 4)', notes: '' };
  r = await sam.post(`/case/${rowe.id}/book`, bookingFields, `/case/${rowe.id}`);
  assert.equal((await byId('<demo-rowe@example.invalid>')).dispatch_ref, '', 'no tick, nothing booked');
  r = await sam.post(`/case/${rowe.id}/book`, { ...bookingFields, phone: '', signed_off: 'yes' }, `/case/${rowe.id}`);
  assert.equal((await byId('<demo-rowe@example.invalid>')).dispatch_ref, '', 'a missing phone number, nothing booked');
  r = await sam.post(`/case/${rowe.id}/book`, { ...bookingFields, signed_off: 'yes' }, `/case/${rowe.id}`);
  let roweNow = await byId('<demo-rowe@example.invalid>');
  assert.match(roweNow.dispatch_ref, /^[A-Z]{2,3}-\d{5}$/, `booked into the stand-in dispatch with a reference (got "${roweNow.dispatch_ref}")`);
  const bookings = (await pool.query('SELECT * FROM dispatch_bookings')).rows;
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].job.pickup, 'The Moor');
  assert.equal(bookings[0].booked_by_name, 'sam');
  r = await sam.post(`/case/${rowe.id}/book`, { ...bookingFields, signed_off: 'yes' }, `/case/${rowe.id}`);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM dispatch_bookings')).rows[0].n, 1, 'never booked twice');
  const bookedEvent = (await pool.query("SELECT detail FROM case_events WHERE case_id = $1 AND kind = 'booked'", [rowe.id])).rows;
  assert.equal(bookedEvent.length, 1);
  assert.match(bookedEvent[0].detail, /signed off by sam/);

  // The list pages carry the live stamp and live.json changes with the data.
  r = await sam.get('/live.json');
  assert.equal(r.status, 200);
  const stampA = JSON.parse(r.text).stamp;
  assert.match(stampA, /^\d+:/);
  r = await sam.get('/inbox');
  assert.match(r.text, /data-live-url="\/live\.json"/);
  assert.match(r.text, new RegExp(`data-live-stamp="${stampA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), 'the page carries the stamp it was rendered with');
  await sam.post(`/case/${rowe.id}/note`, { note: 'Rang Claire to confirm.' }, `/case/${rowe.id}`);
  await pool.query('UPDATE cases SET updated_at = now() + interval \'1 second\' WHERE id = $1', [rowe.id]);
  r = await sam.get('/live.json');
  assert.notEqual(JSON.parse(r.text).stamp, stampA, 'a change moves the stamp');

  // Fixed prices: a manager adds one, the AI is told about it, an operator
  // sees it in the prompt the model gets and cannot add one.

  // A manager can, and the action is recorded under their name.
  const meg = client();
  await meg.post('/login', { username: 'meg', password: 'meg-pass-123456', next: '/' });
  r = await meg.post(`/case/${phone.id}/approve`, { draft: phone.draft }, `/case/${phone.id}`);
  assert.equal(drafts.length, 4);
  r = await meg.post('/settings/prices', { from_place: 'Falmouth', to_place: 'Newquay Airport', vehicle: 'Car (up to 4)', price: '65', notes: 'Daytime' }, '/settings');
  assert.equal(r.location, '/settings');
  const prices = await store.fixedPrices();
  assert.equal(prices.length, 1);
  assert.equal(prices[0].price_pence, 6500);
  assert.equal(prices[0].brand, 'abacus', 'a price belongs to the mailbox brand by default');
  r = await meg.post('/settings/prices', { from_place: 'Falmouth', to_place: 'Truro', price: 'about forty' }, '/settings');
  assert.equal((await store.fixedPrices()).length, 1, 'a price that is not a number is refused');
  assert.equal((await sam.post('/settings/prices', { from_place: 'A', to_place: 'B', price: '1' }, '/')).status, 404, 'an operator cannot reach Settings');
  const promptedFirm = await office.firmFor(rowe);
  assert.match(ai.readSystem('2026-11-09', promptedFirm), /Falmouth to Newquay Airport, Car \(up to 4\): £65 \(Daytime\)/, 'the AI is told the fixed price');
  assert.match(ai.readSystem('2026-11-09', { ...firm, fixedPrices: [] }), /No fixed prices have been set, so give no price/);
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
  const alertsWithEnv = { sendEscalation: (args) => alerts.sendEscalation(args, env) };
  // The made-up emails are dated from today, so which of them are more than
  // 24 hours old depends on the time of day the test runs. Age three of
  // the unapproved ones here so the sweep has a fixed set to find.
  await pool.query("UPDATE cases SET received_at = now() - interval '30 hours' WHERE message_id IN ('<demo-account@example.invalid>', '<demo-umbrella@example.invalid>', '<demo-hocking@example.invalid>')");
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

  // The complaint nudge: a complaint with no approved reply past the nudge
  // time is passed up by the office and the manager emailed once; the one
  // already passed up by sam, and the approved ones, are left alone.
  await store.setSetting('complaint_nudge_hours', '12');
  await pool.query("INSERT INTO cases (message_id, from_address, subject, body, received_at, kind, seriousness, brand, status, draft) VALUES ('<nudge-me@example.invalid>', 'Old Complaint <old@example.invalid>', 'Still waiting', 'Nobody has answered me.', now() - interval '13 hours', 'complaints', 'minor', 'abacus', 'in_progress', 'Hi,\n\nSorry.\n\nThanks,\nAbacus Taxis')");
  passUpMails = [];
  alerts.__setTransportFactoryForTests(() => ({ sendMail: async (m) => { passUpMails.push(m); return { messageId: 'n' }; } }));
  const nudgeAlerts = { sendNudge: (args) => alerts.sendNudge(args, env) };
  const n1 = await office.nudge(nudgeAlerts, base);
  assert.deepEqual(n1, { nudged: 1, emailed: true });
  assert.equal(passUpMails.length, 1);
  assert.match(passUpMails[0].text, /sat more than 12 hours/);
  const nudged = await byId('<nudge-me@example.invalid>');
  assert.ok(nudged.passed_up_at);
  assert.equal(nudged.passed_up_reason, 'No approved reply within 12 hours');
  assert.equal(nudged.passed_up_by, null, 'passed up by the office, not a person');
  assert.deepEqual(await office.nudge(nudgeAlerts, base), { nudged: 0, emailed: false }, 'a second sweep nudges nothing more');
  r = await meg.get('/');
  assert.match(r.text, /For a manager/, 'Today shows a manager what was passed up');
  r = await sam.get('/');
  assert.doesNotMatch(r.text, /<h2>For a manager<\/h2>/, 'an operator is not shown the manager list');

  // Visibility by brand: a Coastline operator sees none of the Abacus
  // mailbox's cases, gets 404 on one by its address, and the office user
  // (no brand) sees them all with the brand named on each.
  await store.createUser({ username: 'cora', password: 'cora-pass-123456', role: 'operator', brand: 'coastline' });
  const cora = client();
  await cora.post('/login', { username: 'cora', password: 'cora-pass-123456', next: '/' });
  r = await cora.get('/inbox?show=all');
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /Taxi to the station tomorrow morning/, 'an Abacus email is not in the Coastline inbox');
  assert.match(r.text, /Nothing here/);
  assert.equal((await cora.get(`/case/${pascoe.id}`)).status, 404, 'nor reachable by its address');
  assert.equal((await cora.get('/live.json')).status, 200);
  assert.match(JSON.parse((await cora.get('/live.json')).text).stamp, /^0:/, 'the live stamp counts only what she may see');
  r = await owner.get('/inbox?show=all');
  assert.match(r.text, /Taxi to the station tomorrow morning/);
  assert.match(r.text, /class="to-tag">Abacus Taxis</, 'the office view names the brand on each case');
  assert.match(r.text, /<option value="" selected>All companies<\/option>/, 'and the owner\'s company menu says all companies');

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
