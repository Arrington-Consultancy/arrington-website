'use strict';

// The demo's live address (Tom, 16/10/2026: a real mailbox, so Dan can
// email a booking in from his own phone and watch it arrive). The office
// keeps its made-up inbox; each visitor also gets their own copy of the
// demo mailbox's address and sees only what was sent to it. Nobody sees
// anybody else's email, an untagged email (spam included) is shown to
// nobody, a token for any other mailbox is never used, and nothing is sent.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ai = require('../lib/taxiOffice/ai');
const office = require('../lib/taxiOffice/office');
const mail = require('../lib/taxiOffice/mail');
const gmailConnect = require('../lib/taxiOffice/mail/gmailConnect');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ADDRESS = 'tidewell@arringtonconsultancy.com';

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

// A live mailbox for the office, with whatever is "in" it.
function liveBox({ account = ADDRESS, emails = [] } = {}) {
  const box = {
    name: 'gmail', label: 'Gmail', configured: () => true, missing: () => [],
    emails, lists: 0, drafts: [],
    account: async () => account,
    listInbox: async () => { box.lists += 1; return box.emails; },
    saveReplyDraft: async (email, text) => { box.drafts.push([email.id, text]); return { draftId: 'dr-' + email.id }; }
  };
  return box;
}

async function withLive(box, fn) {
  office.__setConnectionsForTests({ mail: mail.createMailbox('demo'), live: box, address: ADDRESS });
  office.__shared.delete('live');
  try {
    return await fn();
  } finally {
    office.__setConnectionsForTests({ mail: null, live: null, address: null });
    office.__shared.delete('live');
  }
}

const sent = (id, to, subject = 'Taxi please', at = '2026-10-16T09:00') => ({ id, from: 'Dan <dan@example.com>', to, subject, receivedAt: at, body: 'Can I book a car from Exmouth to Exeter Airport tomorrow at 6am? Dan, 07700 900123', threadId: 't-' + id, messageId: `<${id}@example.com>` });

test('the demo address must be a plain address, and each visitor gets their own tagged copy of it', () => {
  assert.equal(mail.demoAddress({ TAXI_OFFICE_DEMO_ADDRESS: ' Tidewell@ArringtonConsultancy.com ' }), ADDRESS);
  assert.equal(mail.demoAddress({ TAXI_OFFICE_DEMO_ADDRESS: 'tidewell+x@arringtonconsultancy.com' }), '', 'no plus part in the base address');
  assert.equal(mail.demoAddress({ TAXI_OFFICE_DEMO_ADDRESS: 'not an address' }), '');
  assert.equal(mail.demoAddress({}), '');
  assert.equal(mail.taggedAddress(ADDRESS, 'k7m2qa'), 'tidewell+k7m2qa@arringtonconsultancy.com');
  const a = office.stateFor('live-tag-a-' + Date.now());
  const b = office.stateFor('live-tag-b-' + Date.now());
  assert.match(a.tag, /^[a-hjkmnp-z2-9]{6}$/, 'six characters, none that read as another');
  assert.notEqual(a.tag, b.tag);
});

test('an email belongs to a visitor only if it was sent to their tag, or carries the tag in its subject', () => {
  const tag = 'k7m2qa';
  const yes = (e) => assert.equal(mail.belongsTo(e, ADDRESS, tag), true, JSON.stringify(e));
  const no = (e) => assert.equal(mail.belongsTo(e, ADDRESS, tag), false, JSON.stringify(e));
  yes({ to: ['Tidewell <tidewell+k7m2qa@arringtonconsultancy.com>'] });
  yes({ to: ['someone@example.com', 'TIDEWELL+K7M2QA@ARRINGTONCONSULTANCY.COM'] });
  yes({ to: [], subject: 'Booking k7m2qa' });
  no({ to: ['tidewell@arringtonconsultancy.com'], subject: 'Taxi please' });
  no({ to: ['tidewell+zzzzzz@arringtonconsultancy.com'] });
  no({ to: ['tidewell+k7m2qa@arringtonconsultancy.com.evil.example'] });
  no({ to: ['xtidewell+k7m2qa@arringtonconsultancy.com'] });
  no({ to: [], subject: 'ak7m2qab' });
  assert.equal(mail.belongsTo({ to: ['tidewell+k7m2qa@arringtonconsultancy.com'] }, '', tag), false, 'no address, no live email');
  assert.equal(mail.belongsTo({ to: [], subject: 'anything' }, ADDRESS, ''), false, 'no tag matches nothing');
});

test('each visitor sees the made-up inbox plus only their own live emails; spam and other visitors\' emails are shown to nobody', async () => {
  const a = office.stateFor('live-mix-a-' + Date.now());
  const b = office.stateFor('live-mix-b-' + Date.now());
  const box = liveBox({ emails: [
    sent('gm-a1', [mail.taggedAddress(ADDRESS, a.tag)]),
    sent('gm-b1', [mail.taggedAddress(ADDRESS, b.tag)], 'Lost phone'),
    sent('gm-spam', [ADDRESS], 'You have won')
  ] });
  await withLive(box, async () => {
    assert.deepEqual(await office.refreshLive(), { ok: true, live: true });
    const ids = (s) => office.inbox(s).map((e) => e.id);
    assert.equal(ids(a)[0], 'gm-a1', "the visitor's own email is at the top");
    assert.ok(ids(a).includes('turner'), 'the made-up inbox is still there');
    assert.ok(!ids(a).includes('gm-b1') && !ids(a).includes('gm-spam'));
    assert.ok(ids(b).includes('gm-b1') && !ids(b).includes('gm-a1') && !ids(b).includes('gm-spam'));
    assert.equal(office.findEmail(a, 'gm-b1'), null, 'not reachable by its address either');
    assert.equal(office.liveFor(a).address, mail.taggedAddress(ADDRESS, a.tag));
    // Read at most every fifteen seconds, whoever asks.
    await office.refreshLive();
    await office.refreshLive();
    assert.equal(box.lists, 1);
  });
});

test('a token for any other mailbox is never used: nothing is read, and visitors are not told whose it was', async () => {
  const s = office.stateFor('live-wrong-' + Date.now());
  const box = liveBox({ account: 'tom@arringtonconsultancy.com', emails: [sent('gm-x', [mail.taggedAddress(ADDRESS, s.tag)])] });
  await withLive(box, async () => {
    const r = await office.refreshLive();
    assert.equal(r.ok, false);
    assert.doesNotMatch(r.message, /tom@/);
    assert.equal(box.lists, 0, 'the inbox was never listed');
    assert.deepEqual(office.liveEmails(s), []);
  });
});

test('a live email arrives already read, once, on the visitor\'s own allowance and never into the shared cache', async () => {
  const s = office.stateFor('live-read-' + Date.now());
  const email = sent('gm-r1', [mail.taggedAddress(ADDRESS, s.tag)]);
  const reading = { intent: 'new_booking', summary: 'A car to the airport.', customer_name: 'Dan', phone: '07700 900123', reference: '', missing: [], journeys: [{ date: s.today, time: '06:00', pickup: 'Exmouth', destination: 'Exeter Airport', passengers: 1, vehicle: 'saloon', needs: '' }], reply: 'Hi Dan,\n\nThat is booked.\n\nTidewell Cars' };
  const saved = { flag: process.env.ENABLE_TAXI_OFFICE_AI, key: process.env.ANTHROPIC_API_KEY };
  process.env.ENABLE_TAXI_OFFICE_AI = 'true';
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  let calls = 0;
  ai.__setClientFactoryForTests(() => ({ messages: { create: async () => { calls += 1; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reading) }] }; } } }));
  try {
    await withLive(liveBox({ emails: [email] }), async () => {
      await office.refreshLive();
      assert.equal(await office.readNewLive(s), 1);
      assert.equal(s.readings['gm-r1'].source, 'ai');
      assert.equal(s.used.custom.length, 1, 'from the visitor\'s own allowance');
      assert.equal(s.used.read.length, 0);
      assert.ok(![...office.__shared.keys()].some((k) => k.includes('gm-r1')), 'a real email is never shared with another visitor');
      assert.equal(await office.readNewLive(s), 0, 'tried once');
      assert.equal(calls, 2, 'the reading, and the Checker on the booking');
      assert.equal(s.used.check.length, 1, 'the check too comes from the visitor\'s own allowance');
    });
  } finally {
    if (saved.flag === undefined) delete process.env.ENABLE_TAXI_OFFICE_AI; else process.env.ENABLE_TAXI_OFFICE_AI = saved.flag;
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.key;
  }
});

test('a reply to a live email is saved as a draft in the demo mailbox; a reply to a made-up one goes nowhere', async () => {
  const s = office.stateFor('live-reply-' + Date.now());
  const box = liveBox({ emails: [sent('gm-d1', [mail.taggedAddress(ADDRESS, s.tag)])] });
  await withLive(box, async () => {
    await office.refreshLive();
    const live = office.findEmail(s, 'gm-d1');
    const r = await office.markSent(s, live, 'Hi Dan, booked.');
    assert.match(r.message, /^Saved as a draft in Gmail/);
    assert.deepEqual(box.drafts, [['gm-d1', 'Hi Dan, booked.']]);
    const madeUp = office.findEmail(s, 'turner');
    await office.markSent(s, madeUp, 'Hi, booked.');
    assert.equal(box.drafts.length, 1, 'the made-up email does not touch the real mailbox');
    assert.equal(office.connections().liveLabel, 'Gmail');
  });
});

test('without the demo address, or without a Gmail or Outlook driver, there is no live address', async () => {
  const s = office.stateFor('live-off-' + Date.now());
  office.__setConnectionsForTests({ address: '' });
  try {
    assert.equal(office.liveFor(s), null);
    assert.deepEqual(await office.refreshLive(), { ok: true, live: false });
    assert.equal(office.connections().liveLabel, null);
  } finally {
    office.__setConnectionsForTests({ address: null });
  }
  assert.match(mail.describeMailStatus({ TAXI_OFFICE_DEMO_ADDRESS: ADDRESS }), /no Gmail or Outlook driver is, so there is no live address/);
  const line = mail.describeMailStatus({ TAXI_OFFICE_DEMO_ADDRESS: ADDRESS, TAXI_OFFICE_MAIL_DRIVER: 'gmail' });
  assert.match(line, /demo inbox plus a live address, tidewell@arringtonconsultancy\.com through Gmail, NOT configured, missing TAXI_OFFICE_GMAIL_CLIENT_ID/);
});

test('the Gmail driver lists every recipient, reads each message once, and says which mailbox it reads', async () => {
  const b64url = (t) => Buffer.from(t, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const msg = {
    id: 'm1', threadId: 't1', internalDate: String(Date.UTC(2026, 9, 16, 7, 30)),
    payload: { headers: [
      { name: 'From', value: 'Dan <dan@example.com>' }, { name: 'To', value: 'Tidewell <tidewell+k7m2qa@arringtonconsultancy.com>, other@example.com' },
      { name: 'Delivered-To', value: 'tidewell@arringtonconsultancy.com' }, { name: 'Delivered-To', value: 'tidewell+k7m2qa@arringtonconsultancy.com' },
      { name: 'Subject', value: 'Taxi' }], mimeType: 'text/plain', body: { data: b64url('Car please') } }
  };
  const fetch = fakeFetch([
    [/oauth2\.googleapis\.com\/token/, { access_token: 'at', expires_in: 3600 }],
    [/\/messages\?q=/, { messages: [{ id: 'm1' }] }],
    [/\/messages\/m1\?format=full/, msg],
    [/\/profile$/, { emailAddress: 'Tidewell@arringtonconsultancy.com' }]
  ]);
  const env = { TAXI_OFFICE_GMAIL_CLIENT_ID: 'cid', TAXI_OFFICE_GMAIL_CLIENT_SECRET: 'secret', TAXI_OFFICE_GMAIL_REFRESH_TOKEN: 'refresh' };
  const box = mail.createMailbox('gmail', { env, fetch });
  const [email] = await box.listInbox({ days: 2 });
  assert.deepEqual(email.to, ['Tidewell <tidewell+k7m2qa@arringtonconsultancy.com>', 'other@example.com', 'tidewell@arringtonconsultancy.com', 'tidewell+k7m2qa@arringtonconsultancy.com']);
  assert.equal(mail.belongsTo(email, ADDRESS, 'k7m2qa'), true);
  assert.match(fetch.calls.find((c) => /\/messages\?q=/.test(c.url)).url, /newer_than%3A2d/);
  await box.listInbox({ days: 2 });
  assert.equal(fetch.calls.filter((c) => /format=full/.test(c.url)).length, 1, 'a message already read is not fetched again');
  assert.equal(await box.account(), ADDRESS);
  assert.ok(fetch.calls.every((c) => !/\/send\b/.test(c.url)));
});

test('the Outlook driver lists recipients and can be asked for recent mail only', async () => {
  const fetch = fakeFetch([
    [/oauth2\/v2\.0\/token/, { access_token: 'at', expires_in: 3600 }],
    [/\/mailFolders\/inbox\/messages/, { value: [{ id: 'o1', subject: 'Taxi', from: { emailAddress: { address: 'dan@example.com' } }, toRecipients: [{ emailAddress: { address: 'tidewell+k7m2qa@outlook.com' } }], ccRecipients: [], receivedDateTime: '2026-10-16T09:05:00Z', body: { content: 'Car please' } }] }]
  ]);
  const env = { TAXI_OFFICE_OUTLOOK_TENANT_ID: 'consumers', TAXI_OFFICE_OUTLOOK_CLIENT_ID: 'cid', TAXI_OFFICE_OUTLOOK_CLIENT_SECRET: 's', TAXI_OFFICE_OUTLOOK_REFRESH_TOKEN: 'r' };
  const box = mail.createMailbox('outlook', { env, fetch });
  const [email] = await box.listInbox({ days: 2 });
  assert.deepEqual(email.to, ['tidewell+k7m2qa@outlook.com']);
  assert.match(decodeURIComponent(fetch.calls[1].url), /\$filter=receivedDateTime ge 20\d\d-/);
});

test('connecting: only the two read-and-draft scopes, the demo address as the hint, and only its own TAXI_OFFICE_ variables', () => {
  const env = { TAXI_OFFICE_GMAIL_CLIENT_ID: 'office-cid', TAXI_OFFICE_GMAIL_CLIENT_SECRET: 'office-secret', GMAIL_CLIENT_ID: 'toms-inbox-cid' };
  const url = new URL(gmailConnect.authorizeUrl({ env, redirectUri: 'https://www.arringtonconsultancy.com/taxi-demo/office/connect/gmail/callback', state: 'st', loginHint: ADDRESS }));
  const q = url.searchParams;
  assert.equal(q.get('client_id'), 'office-cid');
  assert.deepEqual(q.get('scope').split(' '), ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose']);
  assert.equal(q.get('login_hint'), ADDRESS);
  assert.equal(q.get('access_type'), 'offline');
  assert.match(q.get('prompt'), /consent/);
  assert.deepEqual(gmailConnect.missing({ GMAIL_CLIENT_ID: 'x', GMAIL_CLIENT_SECRET: 'y' }), ['TAXI_OFFICE_GMAIL_CLIENT_ID', 'TAXI_OFFICE_GMAIL_CLIENT_SECRET'], "Tom's inbox credentials are never a fallback");
  assert.doesNotMatch(read('lib/taxiOffice/mail/gmailConnect.js').replace(/\/\/.*$/gm, ''), /env\[?'?GMAIL_|process\.env\.GMAIL_|mail\.google\.com|gmail\.send/);
});

test('connecting: a token for the wrong account is cancelled and never shown; the right one is shown once', async () => {
  const env = { TAXI_OFFICE_GMAIL_CLIENT_ID: 'cid', TAXI_OFFICE_GMAIL_CLIENT_SECRET: 'secret' };
  const run = (who, token = { access_token: 'at', refresh_token: 'rt-secret', scope: 'gmail.readonly gmail.compose' }) => {
    const fetch = fakeFetch([
      [/oauth2\.googleapis\.com\/token/, token],
      [/\/profile$/, { emailAddress: who }],
      [/\/revoke$/, {}]
    ]);
    return gmailConnect.finish({ env, code: 'c', redirectUri: 'https://x/cb', expected: ADDRESS, fetch }).then((r) => ({ r, fetch }));
  };
  const wrong = await run('tom@arringtonconsultancy.com');
  assert.equal(wrong.r.ok, false);
  assert.equal(wrong.r.refreshToken, undefined);
  assert.doesNotMatch(JSON.stringify(wrong.r), /rt-secret/);
  const revoke = wrong.fetch.calls.find((c) => /\/revoke$/.test(c.url));
  assert.ok(revoke, 'the wrong token is cancelled');
  assert.equal(new URLSearchParams(revoke.body).get('token'), 'rt-secret');
  const right = await run(ADDRESS);
  assert.equal(right.r.ok, true);
  assert.equal(right.r.refreshToken, 'rt-secret');
  assert.ok(!right.fetch.calls.some((c) => /\/revoke$/.test(c.url)));
  const none = await run(ADDRESS, { access_token: 'at' });
  assert.equal(none.r.ok, false, 'no refresh token, nothing to copy');
});

test('the routes: the live check sits before an email\'s own page, connecting is Tom\'s alone, and the inbox shows the address and waits for it', () => {
  const routes = read('routes/taxiOffice.js');
  assert.ok(routes.indexOf("'/inbox/live.json'") < routes.indexOf("page('/inbox/:id'"), 'live.json is not swallowed by /inbox/:id');
  assert.match(routes, /const canConnect = \(req\) => \['admin', 'content'\]\.includes/);
  assert.match(routes, /page\('\/connect\/gmail', \(req, res\) => \{\n\s+if \(!canConnect\(req\)\) return render404/);
  assert.match(routes, /page\('\/connect\/gmail\/callback', async \(req, res\) => \{\n\s+if \(!canConnect\(req\)\) return render404/);
  assert.match(routes, /req\.query\.state !== expected/);
  const inbox = read('views/taxi-office/inbox.ejs');
  assert.match(inbox, /data-live-url="<%= BASE %>\/inbox\/live\.json"/);
  assert.match(inbox, /Only you see what you send to this address/);
  assert.match(read('public/js/taxi-office.js'), /window\.location\.reload\(\)/);
  for (const v of ['inbox', 'connect', 'email', 'complaints']) {
    const src = read(`views/taxi-office/${v}.ejs`);
    assert.doesNotMatch(src, /style="/, `${v}: no inline styles`);
    assert.doesNotMatch(src, /[–—]/, `${v}: no dashes`);
  }
});
