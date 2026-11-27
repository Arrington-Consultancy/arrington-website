'use strict';

// A mailbox per company, and more later (Tom, 27 November 2026: "each
// company might have multiple inboxes"; ".com .co.uk .net etc can all go
// into one company email box. We can create more down the line if we want
// them"). The first half runs everywhere. The second half needs
// ABACUS_OFFICE_TEST_DATABASE_URL (it works in its own schema) and drives
// Settings over HTTP against a fake Google with two mailboxes in it.

const test = require('node:test');
const assert = require('node:assert/strict');

const secretBox = require('../abacus-office/lib/secretBox');
const mailboxLib = require('../abacus-office/lib/mailbox');
const { createMailRoom, minuteOf } = require('../abacus-office/lib/mailroom');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;
const KEY = { ABACUS_OFFICE_TOKEN_KEY: 'k'.repeat(40) };
const ABACUS = 'bookings@abacus.example.invalid';
const COAST = 'info@coastline.example.invalid';
const CLIENT_ID = '1-a.apps.googleusercontent.com';
const CLIENT_SECRET = 'GOCSPX-test-secret-abcdefghij';

// A fake Google with two mailboxes. A sign-in code names the account it
// signs in as ("abacus", "coastline"; anything else is somebody's own
// inbox). Each mailbox has its own emails and its own drafts.
function fakeGoogle() {
  const accounts = { abacus: ABACUS, coastline: COAST };
  const state = { revoked: [], drafts: [], lists: [], inbox: { [ABACUS]: [], [COAST]: [] }, down: new Set(), issued: 0 };
  const accountFor = (bearer) => { const m = /(?:at-from-rt-|at-)([a-z]+)/.exec(bearer || ''); return (m && accounts[m[1]]) || 'tom@example.invalid'; };
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function fetch(url, init = {}) {
    const u = String(url);
    const body = init.body && !String(init.body).startsWith('{') ? new URLSearchParams(String(init.body)) : null;
    const json = (status, j) => ({ ok: status < 300, status, json: async () => j });
    if (u === 'https://oauth2.googleapis.com/token') {
      if (body.get('grant_type') === 'authorization_code') {
        if (body.get('client_secret') !== CLIENT_SECRET) return json(401, { error: 'invalid_client' });
        state.issued += 1;
        return json(200, { access_token: `at-${body.get('code')}`, refresh_token: `rt-${body.get('code')}-${state.issued}`, scope: 'gmail.readonly gmail.compose' });
      }
      if (state.revoked.includes(body.get('refresh_token'))) return json(400, { error: 'invalid_grant' });
      return json(200, { access_token: `at-from-${body.get('refresh_token')}`, expires_in: 3600 });
    }
    if (u === 'https://oauth2.googleapis.com/revoke') { state.revoked.push(body.get('token')); return json(200, {}); }
    const who = accountFor((init.headers && init.headers.Authorization) || '');
    if (u.endsWith('/profile')) return json(200, { emailAddress: who });
    if (u.includes('/messages?')) {
      state.lists.push(who);
      if (state.down.has(who)) return json(500, { error: { message: 'backend error' } });
      return json(200, { messages: (state.inbox[who] || []).map((m) => ({ id: m.id })) });
    }
    const one = /\/messages\/([^?]+)\?format=full/.exec(u);
    if (one) {
      const m = (state.inbox[who] || []).find((x) => x.id === decodeURIComponent(one[1]));
      if (!m) return json(404, {});
      return json(200, { id: m.id, threadId: `t-${m.id}`, internalDate: String(m.at), payload: { headers: [{ name: 'Message-ID', value: `<${m.id}@mail.example.invalid>` }, { name: 'From', value: m.from }, { name: 'To', value: m.to }, { name: 'Subject', value: m.subject }], mimeType: 'text/plain', body: { data: b64(m.body) } } });
    }
    if (u.endsWith('/drafts') && init.method === 'POST') {
      const raw = Buffer.from(JSON.parse(init.body).message.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      state.drafts.push({ account: who, raw });
      return json(200, { id: `draft-${state.drafts.length}`, message: { threadId: 't-x' } });
    }
    return json(404, {});
  }
  return { fetch, state };
}

const gmailEnv = { ...KEY, ABACUS_OFFICE_MAIL_DRIVER: 'gmail', ABACUS_OFFICE_GMAIL_CLIENT_ID: CLIENT_ID, ABACUS_OFFICE_GMAIL_CLIENT_SECRET: CLIENT_SECRET };

test('an added mailbox reads only its own address, and never with the token set on the server', async () => {
  const g = fakeGoogle();
  // The server's own token is in the environment; it must not reach an added mailbox.
  const env = { ...gmailEnv, ABACUS_OFFICE_GMAIL_REFRESH_TOKEN: 'rt-coastline' };
  const unconnected = mailboxLib.rowMailbox({ address: ABACUS, token: '' }, { env, fetch: g.fetch });
  assert.equal(unconnected.configured(), false, 'no token of its own, so not connected, whatever the server holds');
  assert.equal(unconnected.none, true);
  assert.deepEqual(await unconnected.saveReplyDraft({ from: 'a@b.c', subject: 's' }, 'hi'), { draftId: null });
  await assert.rejects(unconnected.listInbox({}), { code: 'MAILBOX_REFUSED' });
  assert.equal(g.state.lists.length, 0);

  const wrong = mailboxLib.rowMailbox({ address: ABACUS, token: 'rt-coastline' }, { env, fetch: g.fetch });
  await assert.rejects(wrong.listInbox({}), (e) => e.code === 'MAILBOX_REFUSED' && /info@coastline\.example\.invalid, not bookings@abacus/.test(e.message));
  await assert.rejects(wrong.saveReplyDraft({ from: 'a@b.c', subject: 's' }, 'hi'), { code: 'MAILBOX_REFUSED' });
  assert.equal(g.state.lists.length, 0, 'nothing was listed from the wrong mailbox');
  assert.equal(g.state.drafts.length, 0, 'no draft was saved in the wrong mailbox');

  const right = mailboxLib.rowMailbox({ address: ABACUS, token: 'rt-abacus' }, { env, fetch: g.fetch });
  assert.deepEqual(await right.listInbox({}), []);
  assert.deepEqual(g.state.lists, [ABACUS]);
  assert.equal(right.label, `Gmail (${ABACUS})`);
  assert.equal(typeof right.send, 'undefined', 'an added mailbox has no send');
});

test('the mailboxes from Settings are read only when the server is set to gmail, and each email goes back to its own mailbox', async () => {
  const g = fakeGoogle();
  const rows = [
    { id: 4, brand: 'abacus', address: ABACUS, token: secretBox.seal('rt-abacus', KEY), start_at: new Date('2026-11-27T10:00:30Z'), connected_by: 'Dan', connected_at: new Date('2026-11-27T10:00:30Z') },
    { id: 7, brand: 'coastline', address: COAST, token: '', start_at: null }
  ];
  const store = { setting: async () => '', mailboxes: async () => rows };
  const firm = { mailboxBrand: 'abacus', brands: [{ id: 'abacus' }, { id: 'coastline' }, { id: 'a2b' }] };
  const none = { name: 'none', label: 'No mailbox connected', none: true, off: true, configured: () => false };
  const demo = { name: 'demo', label: 'Made-up inbox', demo: true, configured: () => true };

  // The server's switch is off, or the made-up inbox is on: nothing from Settings is read.
  for (const [primary, env] of [[none, { ...gmailEnv, ABACUS_OFFICE_MAIL_DRIVER: 'none' }], [demo, { ...gmailEnv, ABACUS_OFFICE_MAIL_DRIVER: 'demo' }], [none, gmailEnv]]) {
    const closed = await createMailRoom({ primary, firm, store, env, fetch: g.fetch }).reload();
    assert.equal(closed.open, false);
    assert.deepEqual(closed.added(), []);
    assert.equal(closed.reading().filter((m) => !m.primary).length, 0);
  }

  const primary = mailboxLib.createMailbox(gmailEnv, { fetch: g.fetch });
  const room = await createMailRoom({ primary, firm, store, env: gmailEnv, fetch: g.fetch }).reload();
  assert.equal(room.open, true);
  assert.deepEqual(room.added().map((m) => [m.id, m.brand, m.connected]), [[4, 'abacus', true], [7, 'coastline', false]]);
  assert.deepEqual(room.reading().map((m) => m.address), [ABACUS], 'only the connected one is read');
  assert.equal(room.none, false);
  assert.match(room.describe(), /bookings@abacus\.example\.invalid on Google for abacus \(connected\); info@coastline\.example\.invalid on Google for coastline \(not connected\)/);
  assert.doesNotMatch(room.describe(), /rt-abacus/);

  // An email's reply goes to the mailbox it came into; one whose mailbox has gone is copied out.
  assert.equal(room.forCase({ mailbox_id: 4 }).address, ABACUS);
  assert.equal(room.forCase({ mailbox_id: null }), primary);
  const gone = room.forCase({ mailbox_id: 99, mailbox_address: 'old@example.invalid' });
  assert.equal(gone.none, true);
  assert.match(gone.noneWhy, /old@example\.invalid is no longer connected/);
  assert.deepEqual(await gone.saveReplyDraft({}, 'x'), { draftId: null });

  // A new email waits only in a mailbox of its own company.
  assert.equal(room.entryForBrand('abacus').address, ABACUS);
  assert.equal(room.entryForBrand('coastline'), null, 'Coastline has no connected mailbox, so nothing of Coastline\'s goes into Abacus\'s');
  assert.equal(room.entryForBrand('a2b'), null);

  // Nothing from before the mailbox joined; the minute it joined counts.
  const entry = room.reading()[0];
  assert.equal(minuteOf('2026-11-27T10:00:30Z'), new Date('2026-11-27T10:00:00Z').getTime());
  assert.equal(room.beforeStart(entry, new Date('2026-11-27T09:59:00Z')), true);
  assert.equal(room.beforeStart(entry, new Date('2026-11-27T10:00:00Z')), false, 'an email stamped in the minute of connection is taken');
  assert.equal(room.beforeStart(entry, new Date('2026-11-27T10:05:00Z')), false);

  // A seal the key no longer opens is reported, not used.
  const rekeyed = await createMailRoom({ primary, firm, store, env: { ...gmailEnv, ABACUS_OFFICE_TOKEN_KEY: 'y'.repeat(40) }, fetch: g.fetch }).reload();
  assert.equal(rekeyed.added()[0].connected, false);
  assert.equal(rekeyed.added()[0].unreadable, true);
  assert.deepEqual(rekeyed.reading(), []);
});

test('over HTTP: the owner adds a mailbox per company, each starts from its connection, emails and drafts stay with their own company', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_mailboxes_test';
  const admin = new Pool({ connectionString: DB });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);
  await admin.end();
  const pool = new Pool({ connectionString: DB, options: `-c search_path=${SCHEMA}` });
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const store = new Store(pool);
  await store.ensureSchema();
  await store.createUser({ username: 'owner', displayName: 'Dan', password: 'owner-pass-12345', role: 'owner' });
  await store.createUser({ username: 'meg', displayName: 'Meg', password: 'meg-pass-123456', role: 'manager' });
  await store.createUser({ username: 'cora', displayName: 'Cora', password: 'cora-pass-123456', role: 'operator', brand: 'coastline' });
  const g = fakeGoogle();
  // Set to gmail on the server, with the key; no mailbox named there.
  const mailEnv = { ...KEY, ABACUS_OFFICE_MAIL_DRIVER: 'gmail' };
  const mailbox = mailboxLib.createMailbox(mailEnv, { store, fetch: g.fetch });
  await mailbox.reload();
  const firm = { name: 'Cornwall Taxis', short: 'Cornwall', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Cornwall Taxis', facts: [], demo: false, logo: '', mailboxBrand: 'abacus',
    brands: [{ id: 'abacus', name: 'Abacus & Falmouth Taxis' }, { id: 'coastline', name: 'Coastline Travel' }, { id: 'a2b', name: 'A2B Cornwall' }] };
  const { app, office } = createApp({ pool, mailbox, firm, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => false, alertsEnv: {}, mailEnv, fetchImpl: g.fetch, baseUrl: 'http://office.test' });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end(); });

  const seenPages = [];
  function client() {
    const jar = new Map();
    const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
    const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: cookie() }, redirect: 'manual' }); absorb(res); const text = await res.text(); seenPages.push(text); return { status: res.status, location: res.headers.get('location'), text }; };
    const post = async (p, fields, from = '/settings') => {
      const page = await get(from);
      const token = (page.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      const res = await fetch(base + p, { method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: token, ...fields }), redirect: 'manual' });
      absorb(res);
      const text = await res.text(); seenPages.push(text);
      return { status: res.status, location: res.headers.get('location'), text };
    };
    const signIn = async (username, password) => { const r = await post('/login', { username, password, next: '/' }, '/login'); assert.equal(r.status, 302, `${username} signs in`); };
    // Follows Connect out to "Google" and back with the code for an account.
    const connect = async (id, code) => {
      const out = await get(`/settings/mailboxes/${id}/connect`);
      assert.equal(out.status, 302);
      const url = new URL(out.location);
      assert.equal(url.host, 'accounts.google.com');
      assert.equal(url.searchParams.get('redirect_uri'), 'http://office.test/settings/mailbox/callback', 'one redirect address however many mailboxes');
      assert.equal(url.searchParams.get('login_hint'), id === 1 ? ABACUS : COAST);
      return get(`/settings/mailbox/callback?state=${url.searchParams.get('state')}&code=${code}`);
    };
    return { get, post, signIn, connect };
  }
  const owner = client();
  await owner.signIn('owner', 'owner-pass-12345');
  const meg = client();
  await meg.signIn('meg', 'meg-pass-123456');
  const cora = client();
  await cora.signIn('cora', 'cora-pass-123456');

  // Nothing added yet: the page says so and offers the form to the owner only.
  let r = await owner.get('/settings');
  assert.match(r.text, /<h2>Mailboxes<\/h2>/);
  assert.match(r.text, /No mailbox has been added yet/);
  assert.match(r.text, /Add a mailbox/);
  assert.doesNotMatch(r.text, /ABACUS_OFFICE_MAILBOX_ADDRESS/, 'the owner is not asked for a server variable');
  r = await meg.get('/settings');
  assert.doesNotMatch(r.text, /Add a mailbox/, 'a manager cannot add one');
  r = await meg.post('/settings/mailboxes', { address: ABACUS, brand: 'abacus' });
  assert.equal(r.status, 404);
  assert.equal((await store.mailboxes()).length, 0);

  // What is refused: a bad address, no company, and the same address twice.
  r = await owner.post('/settings/mailboxes', { address: 'not an address', brand: 'abacus' });
  assert.match((await owner.get('/settings')).text, /does not look right/);
  r = await owner.post('/settings/mailboxes', { address: ABACUS, brand: '' });
  assert.match((await owner.get('/settings')).text, /Choose which company/);
  assert.equal((await store.mailboxes()).length, 0);
  r = await owner.post('/settings/mailboxes', { address: `  ${ABACUS.toUpperCase()} `, brand: 'abacus' });
  assert.equal(r.location, '/settings#mailbox');
  r = await owner.post('/settings/mailboxes', { address: ABACUS, brand: 'coastline' });
  assert.match((await owner.get('/settings')).text, /already in the list/);
  await owner.post('/settings/mailboxes', { address: COAST, brand: 'coastline' });
  const rows = await store.mailboxes();
  assert.deepEqual(rows.map((m) => [m.id, m.address, m.brand, m.token]), [[1, ABACUS, 'abacus', ''], [3, COAST, 'coastline', '']].map((x, i) => [rows[i].id, x[1], x[2], x[3]]));
  const [abacusId, coastId] = rows.map((m) => m.id);

  // No Connect until the Google client is saved; then it is there.
  r = await owner.get('/settings');
  assert.match(r.text, /bookings@abacus\.example\.invalid<\/strong> \(Google\) for Abacus &amp; Falmouth Taxis:\s+not connected yet/);
  assert.doesNotMatch(r.text, new RegExp(`/settings/mailboxes/${abacusId}/connect`), 'no Connect before the client is saved');
  r = await owner.get(`/settings/mailboxes/${abacusId}/connect`);
  assert.equal(r.location, '/settings#mailbox');
  await owner.post('/settings/mailbox/client', { client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
  r = await owner.get('/settings');
  assert.match(r.text, new RegExp(`/settings/mailboxes/${abacusId}/connect`));

  // Emails already sitting in the two mailboxes before either is connected.
  const now = Date.now();
  g.state.inbox[ABACUS].push({ id: 'old-a', at: now - 3 * 24 * 3600 * 1000, from: 'Old Customer <old@example.invalid>', to: ABACUS, subject: 'Last week', body: 'An old email.' });
  g.state.inbox[COAST].push({ id: 'old-c', at: now - 2 * 3600 * 1000, from: 'Earlier <earlier@example.invalid>', to: COAST, subject: 'Two hours ago', body: 'An earlier email.' });

  // Signing in to Google as the wrong account connects nothing and cancels that token.
  r = await owner.connect(abacusId, 'coastline');
  assert.equal(r.location, '/settings#mailbox');
  r = await owner.get('/settings');
  assert.match(r.text, /info@coastline\.example\.invalid, not the mailbox bookings@abacus\.example\.invalid/);
  assert.deepEqual(g.state.revoked, ['rt-coastline-1']);
  assert.equal((await store.mailboxById(abacusId)).token, '');
  // A manager cannot connect one.
  assert.equal((await meg.get(`/settings/mailboxes/${abacusId}/connect`)).status, 404);

  // The right account: connected, sealed, and it starts from now.
  r = await owner.connect(abacusId, 'abacus');
  r = await owner.get('/settings');
  assert.match(r.text, /bookings@abacus\.example\.invalid is connected\. Emails that arrive from now on/);
  assert.match(r.text, /connected by Dan/);
  assert.match(r.text, /It takes in emails received since/);
  let row = await store.mailboxById(abacusId);
  assert.ok(row.token && !/rt-abacus/.test(row.token), 'the token is sealed');
  const abacusToken = secretBox.open(row.token, KEY);
  assert.match(secretBox.open(row.token, KEY), /^rt-abacus-\d+$/);
  assert.ok(row.start_at);
  r = await owner.connect(coastId, 'coastline');
  assert.match((await owner.get('/settings')).text, /info@coastline\.example\.invalid is connected/);

  // New emails arrive: one to the Abacus .co.uk address (forwarded into its
  // mailbox), one to Coastline. The old ones are not brought in.
  g.state.inbox[ABACUS].push({ id: 'new-a', at: Date.now(), from: 'Jenna Pascoe <jenna@example.invalid>', to: 'bookings@abacus-taxis.co.uk.example.invalid', subject: 'Airport run Friday', body: 'Can you take four of us to Newquay airport on Friday at 6am?' });
  g.state.inbox[COAST].push({ id: 'new-c', at: Date.now(), from: 'Sam Rowe <sam@example.invalid>', to: COAST, subject: 'Coach for a wedding', body: 'Do you have a 16 seater on 12 June?' });
  const created = await office.sync();
  assert.deepEqual(created.map((c) => [c.subject, c.brand, c.mailbox_address]).sort(), [['Airport run Friday', 'abacus', ABACUS], ['Coach for a wedding', 'coastline', COAST]]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM cases')).rows[0].n, 2, 'nothing from before the mailboxes were connected');
  const abacusCase = created.find((c) => c.brand === 'abacus');
  const coastCase = created.find((c) => c.brand === 'coastline');
  assert.equal(abacusCase.sent_to, 'bookings@abacus-taxis.co.uk.example.invalid', 'staff can see which of the company\'s addresses it was sent to');
  assert.deepEqual(await office.sync(), [], 'a second pull makes no second case');

  // Coastline's operator sees Coastline's email and not Abacus's.
  r = await cora.get('/inbox?show=all');
  assert.match(r.text, /Coach for a wedding/);
  assert.doesNotMatch(r.text, /Airport run Friday/);
  assert.equal((await cora.get(`/case/${abacusCase.id}`)).status, 404);

  // The case says where it came in, and its reply waits in that mailbox only.
  r = await owner.get(`/case/${abacusCase.id}`);
  assert.match(r.text, new RegExp(`in ${ABACUS.replace(/\./g, '\\.')}`));
  assert.match(r.text, /Sent to bookings@abacus-taxis\.co\.uk\.example\.invalid/);
  assert.match(r.text, /saved as a draft in Gmail \(bookings@abacus\.example\.invalid\)/);
  const version = (r.text.match(/name="draft_version" value="(\d+)"/) || [])[1];
  r = await owner.post(`/case/${abacusCase.id}/approve`, { draft: 'Hello Jenna,\nYes, we can do that.\nThanks,\nCornwall Taxis', draft_version: version }, `/case/${abacusCase.id}`);
  assert.equal(g.state.drafts.length, 1);
  assert.equal(g.state.drafts[0].account, ABACUS, 'the reply is a draft in the mailbox the email came into');
  assert.match(g.state.drafts[0].raw, /To: Jenna Pascoe <jenna@example\.invalid>/);
  r = await owner.get(`/case/${abacusCase.id}`);
  assert.match(r.text, /It is in Gmail \(bookings@abacus\.example\.invalid\) as a draft/);
  r = await cora.get(`/case/${coastCase.id}`);
  const cVersion = (r.text.match(/name="draft_version" value="(\d+)"/) || [])[1];
  await cora.post(`/case/${coastCase.id}/approve`, { draft: 'Hello Sam,\nYes, we have one free that day.\nThanks,\nCoastline Travel', draft_version: cVersion }, `/case/${coastCase.id}`);
  assert.deepEqual(g.state.drafts.map((d) => d.account), [ABACUS, COAST], 'Coastline\'s reply went into Coastline\'s mailbox');

  // A new email (Write) waits in its own company's mailbox; A2B has none, so it is copied out.
  const write = async (brand, to) => {
    const made = await owner.post('/write', { kind: 'new', relationship: 'new', brand, to_address: to, to_name: 'Pat', prompt: 'Tell them the airport price is going up in January.' }, '/write');
    assert.match(made.location, /^\/write\/\d+$/);
    return owner.post(`${made.location}/approve`, { subject: 'Airport prices from January', body: 'Hello Pat,\nOur airport price changes in January.\nThanks,\nDan' }, made.location);
  };
  await write('coastline', 'pat@example.invalid');
  assert.equal(g.state.drafts.length, 3);
  assert.equal(g.state.drafts[2].account, COAST);
  assert.match(g.state.drafts[2].raw, /Subject: Airport prices from January/);
  r = await write('a2b', 'pat@example.invalid');
  assert.equal(g.state.drafts.length, 3, 'nothing of A2B\'s goes into another company\'s mailbox');
  r = await owner.get('/write');
  assert.match(r.text, /A2B Cornwall does not have its own mailbox connected yet/);

  // One mailbox failing does not stop the other, and staff are told.
  g.state.down.add(COAST);
  g.state.inbox[ABACUS].push({ id: 'new-a2', at: Date.now(), from: 'Lee Tonkin <lee@example.invalid>', to: ABACUS, subject: 'Lost phone', body: 'I left my phone in one of your cars last night.' });
  r = await owner.post('/inbox/sync', {}, '/inbox');
  r = await owner.get('/inbox?show=all');
  assert.match(r.text, /Lost phone/, 'Abacus\'s email arrived although Coastline\'s mailbox was down');
  assert.match(r.text, /One mailbox was not read \(Gmail \(info@coastline\.example\.invalid\)/);
  g.state.down.delete(COAST);
  await office.sync();

  // Moving a mailbox to another company changes where its next emails go.
  await owner.post(`/settings/mailboxes/${coastId}/company`, { brand: 'a2b' });
  g.state.inbox[COAST].push({ id: 'new-c2', at: Date.now(), from: 'Kim <kim@example.invalid>', to: COAST, subject: 'After the move', body: 'Hello.' });
  const moved = await office.sync();
  assert.deepEqual(moved.map((c) => [c.subject, c.brand]), [['After the move', 'a2b']]);
  assert.equal((await store.caseById(coastCase.id)).brand, 'coastline', 'emails already in the office stay where they are');
  await owner.post(`/settings/mailboxes/${coastId}/company`, { brand: 'coastline' });

  // Disconnecting cancels the token and stops the reading; its emails stay,
  // and a reply to one is copied out by hand.
  await owner.post(`/settings/mailboxes/${abacusId}/disconnect`, {});
  assert.ok(g.state.revoked.includes(abacusToken));
  assert.equal((await store.mailboxById(abacusId)).token, '');
  const listsBefore = g.state.lists.filter((a) => a === ABACUS).length;
  await office.sync();
  assert.equal(g.state.lists.filter((a) => a === ABACUS).length, listsBefore, 'a disconnected mailbox is not read');
  const lost = (await pool.query("SELECT id FROM cases WHERE subject = 'Lost phone'")).rows[0];
  r = await owner.get(`/case/${lost.id}`);
  const lVersion = (r.text.match(/name="draft_version" value="(\d+)"/) || [])[1];
  await owner.post(`/case/${lost.id}/approve`, { draft: 'Hello Lee,\nWe have your phone in the office.\nThanks,\nCornwall Taxis', draft_version: lVersion }, `/case/${lost.id}`);
  assert.equal(g.state.drafts.length, 3, 'nothing was saved anywhere');
  r = await owner.get(`/case/${lost.id}`);
  assert.match(r.text, /bookings@abacus\.example\.invalid is not connected, so it was not saved anywhere/);

  // Connected again, it carries on from where it first joined, not from now.
  const startBefore = (await store.mailboxById(abacusId)).start_at;
  await owner.connect(abacusId, 'abacus');
  assert.equal(new Date((await store.mailboxById(abacusId)).start_at).getTime(), new Date(startBefore).getTime());

  // Removing one keeps its emails; the case says the mailbox has gone.
  await owner.post(`/settings/mailboxes/${coastId}/remove`, {});
  assert.equal(await store.mailboxById(coastId), null);
  assert.ok(g.state.revoked.some((x) => /^rt-coastline-[2-9]/.test(x)));
  r = await cora.get(`/case/${coastCase.id}`);
  assert.equal(r.status, 200, 'the email is still in the office');
  assert.equal((await owner.get(`/settings/mailboxes/${coastId}/connect`)).status, 404);

  // No page ever showed a token or the client secret.
  const everything = seenPages.join('\n');
  assert.doesNotMatch(everything, /rt-abacus|rt-coastline|GOCSPX-test-secret/);
});
