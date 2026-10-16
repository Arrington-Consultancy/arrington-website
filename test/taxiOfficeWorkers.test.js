'use strict';

// Tidewell office, second round (Tom, 16/10/2026): the mailbox connector
// (Gmail and Outlook, stubbed here), the Complaints and Customer emails
// workers, and the pass that keeps every draft sounding like a person.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const data = require('../lib/taxiOffice/data');
const ai = require('../lib/taxiOffice/ai');
const office = require('../lib/taxiOffice/office');
const mail = require('../lib/taxiOffice/mail');
const { humanise } = require('../lib/taxiOffice/humanise');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// A fetch that records every request and answers from a table of handlers.
function fakeFetch(handlers) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body || '' });
    for (const [re, reply] of handlers) {
      if (re.test(String(url))) {
        const body = typeof reply === 'function' ? reply(String(url), init) : reply;
        return { ok: body.__status ? body.__status < 400 : true, status: body.__status || 200, json: async () => body };
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no handler' } }) };
  };
  fn.calls = calls;
  return fn;
}

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

const GMAIL_ENV = { TAXI_OFFICE_GMAIL_CLIENT_ID: 'cid', TAXI_OFFICE_GMAIL_CLIENT_SECRET: 'secret', TAXI_OFFICE_GMAIL_REFRESH_TOKEN: 'refresh' };

test('the mailbox connector defaults to the demo inbox, and names what a real one is missing without printing a value', () => {
  assert.equal(mail.driverName({}), 'demo');
  assert.match(mail.describeMailStatus({}), /demo/);
  const line = mail.describeMailStatus({ TAXI_OFFICE_MAIL_DRIVER: 'gmail', TAXI_OFFICE_GMAIL_CLIENT_ID: 'cid-value' });
  assert.match(line, /Gmail, NOT configured, missing TAXI_OFFICE_GMAIL_CLIENT_SECRET, TAXI_OFFICE_GMAIL_REFRESH_TOKEN/);
  assert.doesNotMatch(line, /cid-value/);
  assert.match(mail.describeMailStatus({ TAXI_OFFICE_MAIL_DRIVER: 'outlook' }), /Outlook, NOT configured/);
});

test("the Gmail driver never falls back to the Workspace's own GMAIL_* variables, which are Tom's inbox", async () => {
  const fetch = fakeFetch([]);
  const box = mail.createMailbox('gmail', { env: { GMAIL_CLIENT_ID: 'x', GMAIL_CLIENT_SECRET: 'y', GMAIL_REFRESH_TOKEN: 'z' }, fetch });
  assert.equal(box.configured(), false);
  await assert.rejects(box.listInbox(), (e) => e.code === 'MAIL_NOT_CONFIGURED');
  assert.equal(fetch.calls.length, 0, 'no request is made at all');
  for (const f of ['gmail.js', 'outlook.js', 'index.js', 'demo.js']) {
    assert.doesNotMatch(read(`lib/taxiOffice/mail/${f}`).replace(/\/\/.*$/gm, ''), /env\[?'?GMAIL_|process\.env\.GMAIL_/, `${f} reads a Workspace Gmail variable`);
  }
});

test('the Gmail driver reads the inbox and saves a threaded reply as a draft; it never calls send', async () => {
  const msg = {
    id: 'm1', threadId: 't1', internalDate: String(Date.UTC(2026, 9, 16, 7, 30)),
    payload: { headers: [{ name: 'From', value: 'Sam Brown <sam@example.com>' }, { name: 'Subject', value: 'Taxi Friday' }, { name: 'Message-ID', value: '<abc@example.com>' }],
      parts: [{ mimeType: 'text/html', body: { data: b64url('<p>Hello</p>') } }, { mimeType: 'text/plain', body: { data: b64url('Can I book a car?\r\nSam') } }] }
  };
  const fetch = fakeFetch([
    [/oauth2\.googleapis\.com\/token/, { access_token: 'at', expires_in: 3600 }],
    [/\/messages\?q=/, { messages: [{ id: 'm1' }] }],
    [/\/messages\/m1\?format=full/, msg],
    [/\/drafts$/, { id: 'd1' }]
  ]);
  const box = mail.createMailbox('gmail', { env: GMAIL_ENV, fetch });
  const [email] = await box.listInbox();
  assert.equal(email.from, 'Sam Brown <sam@example.com>');
  assert.equal(email.body, 'Can I book a car?\nSam', 'the plain text part, not the HTML');
  assert.equal(email.receivedAt, '2026-10-16T08:30', 'London time');
  const token = fetch.calls[0];
  assert.match(token.body, /grant_type=refresh_token/);
  assert.match(token.body, /client_id=cid/);
  assert.match(fetch.calls[1].url, /q=in%3Ainbox%20newer_than%3A7d/);
  assert.equal(fetch.calls.filter((c) => /oauth2/.test(c.url)).length, 1, 'the token is reused');

  const { draftId } = await box.saveReplyDraft({ ...email, subject: 'Taxi Friday\r\nBcc: evil@example.com' }, 'Hi Sam,\n\nBooked.\n\nTidewell Cars');
  assert.equal(draftId, 'd1');
  const draft = fetch.calls.find((c) => /\/drafts$/.test(c.url));
  const body = JSON.parse(draft.body);
  assert.equal(body.message.threadId, 't1');
  const raw = unb64url(body.message.raw);
  assert.match(raw, /^To: Sam Brown <sam@example\.com>\r\n/);
  assert.match(raw, /\r\nSubject: Re: Taxi Friday Bcc: evil@example\.com\r\n/, 'a newline in a subject cannot start a new header');
  assert.doesNotMatch(raw, /\r\nBcc:/);
  assert.match(raw, /\r\nIn-Reply-To: <abc@example\.com>\r\nReferences: <abc@example\.com>\r\n/);
  assert.match(raw, /\r\n\r\nHi Sam,\r\n\r\nBooked\./);
  assert.ok(fetch.calls.every((c) => !/\/send\b/.test(c.url)), 'nothing is sent');
});

test('the Outlook driver asks for Mail.ReadWrite and never Mail.Send, keeps a rotated refresh token, and drafts with createReply', async () => {
  let n = 0;
  const fetch = fakeFetch([
    [/login\.microsoftonline\.com\/contoso\/oauth2\/v2\.0\/token/, () => ({ access_token: 'at' + (++n), expires_in: 1, refresh_token: 'rotated' })],
    [/\/mailFolders\/inbox\/messages/, { value: [{ id: 'o1', conversationId: 'c1', internetMessageId: '<x@y>', subject: 'Lost phone', from: { emailAddress: { name: 'Jo', address: 'jo@example.com' } }, receivedDateTime: '2026-10-16T09:05:00Z', body: { content: 'Left my phone in the car.' } }] }],
    [/\/messages\/o1\/createReply/, { id: 'draft-1' }]
  ]);
  const env = { TAXI_OFFICE_OUTLOOK_TENANT_ID: 'contoso', TAXI_OFFICE_OUTLOOK_CLIENT_ID: 'cid', TAXI_OFFICE_OUTLOOK_CLIENT_SECRET: 's', TAXI_OFFICE_OUTLOOK_REFRESH_TOKEN: 'first' };
  const box = mail.createMailbox('outlook', { env, fetch });
  const [email] = await box.listInbox();
  assert.equal(email.from, 'Jo <jo@example.com>');
  assert.equal(email.receivedAt, '2026-10-16T10:05');
  assert.equal(email.body, 'Left my phone in the car.');
  const first = fetch.calls[0];
  const scope = new URLSearchParams(first.body).get('scope');
  assert.equal(scope, 'offline_access https://graph.microsoft.com/Mail.ReadWrite');
  assert.doesNotMatch(scope, /Mail\.Send/);
  assert.match(fetch.calls[1].headers.Prefer, /body-content-type="text"/);
  const { draftId } = await box.saveReplyDraft(email, 'Hi Jo,\n\nWe have it.\n\nTidewell Cars');
  assert.equal(draftId, 'draft-1');
  const second = fetch.calls.filter((c) => /oauth2/.test(c.url))[1];
  assert.equal(new URLSearchParams(second.body).get('refresh_token'), 'rotated', 'the rotated token is used next time');
  const reply = fetch.calls.find((c) => /createReply/.test(c.url));
  assert.equal(JSON.parse(reply.body).comment, 'Hi Jo,\n\nWe have it.\n\nTidewell Cars');
  assert.ok(fetch.calls.every((c) => !/\/send\b/.test(c.url)), 'nothing is sent');
});

test('with a real mailbox connected, the office reads from it and a reply becomes a draft in that mailbox', async () => {
  const saved = [];
  const fakeBox = {
    name: 'gmail', label: 'Gmail', configured: () => true, missing: () => [],
    listInbox: async () => [{ id: 'gm-1', from: 'Ann <ann@example.com>', subject: 'Car Saturday', receivedAt: '2026-10-16T08:00', body: 'Taxi please' }],
    saveReplyDraft: async (email, text) => { saved.push([email.id, text]); return { draftId: 'dr1' }; }
  };
  office.__setConnectionsForTests({ mail: fakeBox });
  office.__shared.delete('mailbox');
  try {
    const s = office.stateFor('test-mailbox-' + Date.now());
    assert.equal((await office.refreshMailbox(s)).ok, true);
    const inbox = office.inbox(s);
    assert.deepEqual(inbox.map((e) => e.id), ['gm-1']);
    const r = await office.markSent(s, inbox[0], 'Hi Ann');
    assert.match(r.message, /^Saved as a draft in Gmail/);
    assert.deepEqual(saved, [['gm-1', 'Hi Ann']]);
    assert.equal(s.sent['gm-1'].where, 'Gmail');
  } finally {
    office.__setConnectionsForTests({ mail: null });
    office.__shared.delete('mailbox');
  }
});

test('the Complaints worker is given what dispatch holds, by plain code, including the fare table for a fare complaint', () => {
  const today = '2026-10-16';
  const board = data.seedBoard(today);
  const holt = office.recordFacts(board.find((j) => j.ref === 'TW-41158'));
  assert.match(holt[0], /^Booking TW-41158: Thursday 15 October at 23:20, Gary Holt/);
  assert.ok(holt.includes('Fare charged: £46.20, paid by card.'));
  assert.ok(holt.some((l) => /^Fare table for this journey: £43\.50 to £48\.50 at the time it ran \(night rate, 10pm to 6am\), £29 to £32\.50 by day\.$/.test(l)));
  const daniels = office.recordFacts(board.find((j) => j.ref === 'TW-41152'));
  assert.ok(daniels.some((l) => /07:31 Arrived, 16 minutes after the booked time/.test(l)));
  assert.ok(daniels.includes("Controller's note: 07:06 Dave held at a road closure on the A376 at Exton. Customer not rung."));
});

test('with the AI off, every complaint is logged against its job, the safety one reaches Licensing, and the replies are labelled prepared', async () => {
  const before = process.env.ENABLE_TAXI_OFFICE_AI;
  delete process.env.ENABLE_TAXI_OFFICE_AI;
  try {
    const s = office.stateFor('test-complaints-' + Date.now());
    await office.readAll(s);
    const log = office.complaintsLog(s);
    assert.deepEqual(log.map((c) => [c.email.id, c.complaint.jobRef]).sort(), [['carr', 'TW-41140'], ['daniels', 'TW-41152'], ['holt', 'TW-41158']]);
    for (const c of log) assert.equal(c.complaint.source, 'prepared');
    assert.deepEqual(office.passedToLicensing(s).map((c) => c.email.id), ['carr']);
    const sum = office.summary(s);
    assert.equal(sum.complaintsOpen, 3);
    await office.markSent(s, log[0].email, 'Hi');
    assert.equal(office.summary(s).complaintsOpen, 2);
    const umbrella = office.inbox(s).find((e) => e.id === 'umbrella');
    assert.equal(office.workerOf(s, umbrella), 'customer');
    assert.deepEqual(office.pastJobsFor(s, umbrella).map((j) => j.record.driver), ['Pete', 'Jen'], 'both of last night\'s drivers to ask');
  } finally {
    if (before !== undefined) process.env.ENABLE_TAXI_OFFICE_AI = before;
  }
});

function withStubbedAi(reply, fn) {
  const saved = { flag: process.env.ENABLE_TAXI_OFFICE_AI, key: process.env.ANTHROPIC_API_KEY };
  process.env.ENABLE_TAXI_OFFICE_AI = 'true';
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  const calls = [];
  ai.__setClientFactoryForTests(() => ({ messages: { create: async (req) => { calls.push(req); return typeof reply === 'function' ? reply(req) : reply; } } }));
  return Promise.resolve(fn(calls)).finally(() => {
    if (saved.flag === undefined) delete process.env.ENABLE_TAXI_OFFICE_AI; else process.env.ENABLE_TAXI_OFFICE_AI = saved.flag;
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.key;
  });
}

test('the Complaints worker asks the model to judge from the record, never to offer money, and its reply is cleaned up', async () => {
  const today = data.todayLondon();
  office.__shared.clear();
  await withStubbedAi((req) => {
    const schema = req.output_config.format.schema;
    const body = schema.properties.firm_at_fault
      ? { category: 'lateness', summary: 'Late car.', firm_at_fault: 'yes', for_licensing: false, licensing_note: '', staff_steps: ['Ring Ruth.'], reply: 'Dear Ruth,\n\nI hope this email finds you well. Your car was late — we should have rung you. We apologise for any inconvenience.\n\n**Thanks,**\nTidewell Cars' }
      : { ...data.seedInbox(today).find((e) => e.id === 'daniels').prepared };
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(body) }] };
  }, async (calls) => {
    const s = office.stateFor('test-cai-' + Date.now());
    await office.readEmail(s, office.inbox(s).find((e) => e.id === 'daniels'));
    const c = s.complaints.daniels;
    assert.equal(c.source, 'ai');
    assert.equal(c.jobRef, 'TW-41152');
    assert.equal(c.data.reply, 'Dear Ruth,\n\nYour car was late, we should have rung you.\n\nThanks,\nTidewell Cars');
    const req = calls.find((r) => r.output_config.format.schema.properties.firm_at_fault);
    assert.match(req.messages[0].content, /WHAT DISPATCH HOLDS FOR THIS JOURNEY\nBooking TW-41152/);
    assert.match(req.system, /Never offer a refund, a discount, a free journey or any compensation/);
    assert.match(req.system, /Never name the driver/);
    assert.match(req.system, /Go by the dispatch record/);
    assert.match(req.system, /No stock lines/);
    const schema = req.output_config.format.schema;
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required.slice().sort(), Object.keys(schema.properties).sort());
  });
});

test('a second visitor reuses the readings and the complaint drafts, and still sees every complaint drafted', async () => {
  office.__shared.clear();
  const today = data.todayLondon();
  await withStubbedAi((req) => {
    const schema = req.output_config.format.schema;
    const email = data.seedInbox(today).find((e) => req.messages[0].content.includes(e.from));
    const body = schema.properties.firm_at_fault
      ? { category: 'lateness', summary: 'Late car.', firm_at_fault: 'partly', for_licensing: false, licensing_note: '', staff_steps: ['Ring Ruth.'], reply: 'Dear Ruth,\n\nSorry.\n\nTidewell Cars' }
      : { ...email.prepared };
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(body) }] };
  }, async (calls) => {
    const first = office.stateFor('test-first-' + Date.now());
    await office.readAll(first);
    const used = calls.length;
    const second = office.stateFor('test-second-' + Date.now());
    await office.readAll(second);
    assert.equal(calls.length, used, 'the second visitor costs no model calls');
    const log = office.complaintsLog(second);
    assert.equal(log.length, 3);
    for (const c of log) assert.ok(c.complaint && c.complaint.data, `${c.email.id} has its draft`);
    assert.equal(second.complaints.daniels.source, 'ai');
    assert.equal(second.complaints.daniels.jobRef, 'TW-41152');
    assert.equal(office.summary(second).complaintsOpen, 3);
  });
  office.__shared.clear();
});

test('the demo site names the office workers exactly as the office does', () => {
  const { OFFICE_WORKERS } = require('../taxi-demo/lib/pages');
  const { WORKERS } = require('../lib/taxiOffice/workers');
  assert.deepEqual(OFFICE_WORKERS.map(([n]) => n), WORKERS.map((w) => w.name));
});

test('every worker that writes is told how to write like a person, and the booking desk knows only what the firm states', () => {
  const booking = ai.bookingSystem('2026-10-16');
  const complaint = ai.complaintSystem('2026-10-16');
  for (const p of [booking, complaint]) {
    assert.match(p, /HOW TO WRITE/);
    assert.match(p, /Do not split ordinary thoughts into one-line paragraphs/);
    assert.match(p, /Say sorry once, and only when the firm got something wrong/);
    assert.match(p, /Lost property is kept at the office for 28 days/);
  }
  assert.match(booking, /complaint \(a customer unhappy/);
  assert.match(read('lib/taxiOffice/ai.js'), /humanise\(String\(data\.reply/);
});

test('humanise takes out the habits of machine writing and changes nothing else', () => {
  assert.equal(humanise('Hi Sophie,\n\nThank you for reaching out. You\'re booked for 11.30pm — £28, TW-41301.\n\n\nPlease don\'t hesitate to contact us.\n\nThanks!\nTidewell Cars'),
    'Hi Sophie,\n\nYou\'re booked for 11.30pm, £28, TW-41301.\n\nThanks!\nTidewell Cars');
  assert.equal(humanise('## Update\n- Car at 7.15\n- Fare £8.10'), 'Update\nCar at 7.15\nFare £8.10');
  assert.equal(humanise('Fifteen years this month. #Exmouth #TidewellCars'), 'Fifteen years this month. #Exmouth #TidewellCars', 'hashtags stay');
  assert.equal(humanise('Rest assured, the car will be there at 9.'), '', 'a stock sentence on its own is dropped');
  assert.equal(humanise('Dear Ellen,\n\nBooked.\n\nKind regards,\n\nTidewell Cars'), 'Dear Ellen,\n\nBooked.\n\nKind regards,\nTidewell Cars', 'the sign-off sits above the name');
  assert.equal(ai.cleanBooking({ intent: 'council', reference: 'Hackney carriage licence 14', journeys: [], missing: [] }).reference, '', 'a licence name is not a booking reference');
});

test('the Complaints page and the workers carry the same rules as every office page', () => {
  const src = read('views/taxi-office/complaints.ejs');
  assert.doesNotMatch(src, /\sstyle="/);
  for (const form of src.match(/<form method="post"[\s\S]*?<\/form>/g) || []) assert.match(form, /name="_csrf" value="<%= csrfToken %>"/);
  const workers = require('../lib/taxiOffice/workers');
  assert.deepEqual(workers.WORKERS.map((w) => w.name), ['Bookings', 'Customer emails', 'Complaints', 'Licensing', 'Social media']);
  assert.equal(workers.workerForIntent('complaint'), 'complaints');
  assert.equal(workers.workerForIntent('not_booking'), 'customer');
  assert.equal(workers.workerForIntent('something new'), 'customer', 'anything unknown goes to a person on Customer emails');
});
