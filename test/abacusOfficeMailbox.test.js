'use strict';

// Connecting the Abacus office to the firm's real mailbox (Tom, 10 November
// 2026: "We need the email api as well"). The first half runs everywhere.
// The second half needs ABACUS_OFFICE_MAILBOX_TEST_DATABASE_URL, a throwaway
// database of its own (not the main suite's: both drop their tables), and
// drives the connect flow over HTTP against a fake Google.

const test = require('node:test');
const assert = require('node:assert/strict');

const secretBox = require('../abacus-office/lib/secretBox');
const mailboxLib = require('../abacus-office/lib/mailbox');

const DB = process.env.ABACUS_OFFICE_MAILBOX_TEST_DATABASE_URL;
const KEY = { ABACUS_OFFICE_TOKEN_KEY: 'k'.repeat(40) };
const MAILBOX = 'bookings@example.invalid';

// A fake Google: the token endpoint, the Gmail profile and list, revoke.
// The code "good" is the bookings mailbox, "wrong" is somebody else's.
function fakeGoogle() {
  const calls = { revoked: [], drafts: 0, lists: 0 };
  const accountFor = (bearer) => (/good/.test(bearer) ? MAILBOX : 'tom@example.invalid');
  async function fetch(url, init = {}) {
    const u = String(url);
    const body = init.body ? new URLSearchParams(String(init.body)) : null;
    const json = (status, j) => ({ ok: status < 300, status, json: async () => j });
    if (u === 'https://oauth2.googleapis.com/token') {
      if (body.get('grant_type') === 'authorization_code') {
        if (body.get('client_secret') !== 'GOCSPX-test-secret-abcdefghij') return json(401, { error: 'invalid_client' });
        return json(200, { access_token: `at-${body.get('code')}`, refresh_token: `rt-${body.get('code')}`, scope: 'gmail.readonly gmail.compose' });
      }
      return json(200, { access_token: `at-from-${body.get('refresh_token')}`, expires_in: 3600 });
    }
    if (u === 'https://oauth2.googleapis.com/revoke') { calls.revoked.push(body.get('token')); return json(200, {}); }
    const auth = (init.headers && init.headers.Authorization) || '';
    if (u.endsWith('/profile')) return json(200, { emailAddress: accountFor(auth) });
    if (u.includes('/messages?')) { calls.lists += 1; return json(200, { messages: [] }); }
    if (u.endsWith('/drafts')) { calls.drafts += 1; return json(200, { id: 'draft-1' }); }
    return json(404, {});
  }
  return { fetch, calls };
}

test('the token is sealed: it opens with the same key, not with another, and nothing is sealed without a key', () => {
  const sealed = secretBox.seal('rt-secret-value', KEY);
  assert.doesNotMatch(sealed, /rt-secret-value/);
  assert.equal(secretBox.open(sealed, KEY), 'rt-secret-value');
  assert.equal(secretBox.open(sealed, { ABACUS_OFFICE_TOKEN_KEY: 'x'.repeat(40) }), null, 'another key opens nothing');
  assert.equal(secretBox.open(sealed.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), KEY), null, 'a tampered seal opens nothing');
  assert.throws(() => secretBox.seal('x', {}), /ABACUS_OFFICE_TOKEN_KEY/);
  assert.equal(secretBox.available({ ABACUS_OFFICE_TOKEN_KEY: 'short' }), false);
});

test('the live mailbox reads only the address it was given: other credentials are refused before anything is read', async () => {
  const g = fakeGoogle();
  const env = { ABACUS_OFFICE_MAIL_DRIVER: 'gmail', ABACUS_OFFICE_MAILBOX_ADDRESS: MAILBOX, ABACUS_OFFICE_GMAIL_CLIENT_ID: '1-a.apps.googleusercontent.com', ABACUS_OFFICE_GMAIL_CLIENT_SECRET: 's', ABACUS_OFFICE_GMAIL_REFRESH_TOKEN: 'wrong' };
  const bad = mailboxLib.createMailbox(env, { fetch: g.fetch });
  await assert.rejects(bad.listInbox({}), (e) => e.code === 'MAILBOX_REFUSED' && /tom@example\.invalid, not bookings@/.test(e.message));
  await assert.rejects(bad.saveReplyDraft({ from: 'a@b.c', subject: 's' }, 'hi'), { code: 'MAILBOX_REFUSED' });
  assert.equal(g.calls.lists, 0, 'nothing was listed');
  assert.equal(g.calls.drafts, 0, 'no draft was saved');

  const good = mailboxLib.createMailbox({ ...env, ABACUS_OFFICE_GMAIL_REFRESH_TOKEN: 'good' }, { fetch: g.fetch });
  assert.deepEqual(await good.listInbox({}), []);
  assert.equal(g.calls.lists, 1);

  const noAddress = mailboxLib.createMailbox({ ...env, ABACUS_OFFICE_MAILBOX_ADDRESS: '', ABACUS_OFFICE_GMAIL_REFRESH_TOKEN: 'good' }, { fetch: g.fetch });
  await assert.rejects(noAddress.listInbox({}), /ABACUS_OFFICE_MAILBOX_ADDRESS is not set/);
  assert.equal(typeof good.send, 'undefined', 'the live mailbox has no send');
});

test('the client details and token saved from Settings fill in what Railway does not set, and Railway wins', async () => {
  const g = fakeGoogle();
  const rows = new Map([
    [mailboxLib.CLIENT.id, '1-a.apps.googleusercontent.com'],
    [mailboxLib.CLIENT.secret, secretBox.seal('GOCSPX-test-secret-abcdefghij', KEY)],
    [mailboxLib.STORED.token, secretBox.seal('good', KEY)],
    [mailboxLib.STORED.account, MAILBOX]
  ]);
  const store = { setting: async (k) => rows.get(k) || '' };
  const env = { ...KEY, ABACUS_OFFICE_MAIL_DRIVER: 'gmail', ABACUS_OFFICE_MAILBOX_ADDRESS: MAILBOX };
  const box = mailboxLib.createMailbox(env, { store, fetch: g.fetch });
  assert.equal(box.configured(), false, 'nothing loaded until reload');
  await box.reload();
  assert.equal(box.configured(), true);
  assert.equal(box.stored().connected, true);
  assert.equal(box.stored().clientFromSettings, true);
  assert.match(mailboxLib.describeMailStatus(env, box), /Gmail for bookings@example\.invalid, configured, connected from Settings/);
  assert.deepEqual(await box.listInbox({}), []);
  // Railway's own value is used ahead of the saved one.
  const railway = mailboxLib.createMailbox({ ...env, ABACUS_OFFICE_GMAIL_REFRESH_TOKEN: 'wrong' }, { store, fetch: g.fetch });
  await railway.reload();
  await assert.rejects(railway.listInbox({}), { code: 'MAILBOX_REFUSED' });
  // A seal the key no longer opens is reported, not used.
  const rekeyed = mailboxLib.createMailbox({ ...env, ABACUS_OFFICE_TOKEN_KEY: 'y'.repeat(40) }, { store, fetch: g.fetch });
  await rekeyed.reload();
  assert.equal(rekeyed.configured(), false);
  assert.match(mailboxLib.describeMailStatus({ ...env, ABACUS_OFFICE_TOKEN_KEY: 'y'.repeat(40) }, rekeyed), /no longer opens it; connect again/);
});

test('connecting the mailbox over HTTP: owner only, the wrong account refused and cancelled, the token sealed and never shown, disconnect cancels it', { skip: DB ? false : 'set ABACUS_OFFICE_MAILBOX_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB });
  await pool.query('DROP TABLE IF EXISTS case_events, dispatch_bookings, fixed_prices, cases, settings, users, session CASCADE');
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const store = new Store(pool);
  await store.ensureSchema();
  await store.createUser({ username: 'owner', password: 'owner-pass-12345', role: 'owner' });
  await store.createUser({ username: 'meg', password: 'meg-pass-123456', role: 'manager' });
  const g = fakeGoogle();
  const mailEnv = { ...KEY, ABACUS_OFFICE_MAIL_DRIVER: 'gmail', ABACUS_OFFICE_MAILBOX_ADDRESS: MAILBOX };
  const mailbox = mailboxLib.createMailbox(mailEnv, { store, fetch: g.fetch });
  await mailbox.reload();
  const firm = { name: 'Cornwall Taxis', short: 'Cornwall', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Cornwall Taxis', facts: [], demo: false, brands: [{ id: 'abacus', name: 'Abacus' }], mailboxBrand: 'abacus', logo: '' };
  const { app } = createApp({ pool, mailbox, firm, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => false, alertsEnv: {}, mailEnv, fetchImpl: g.fetch, baseUrl: 'http://office.test' });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await pool.end(); });

  function client() {
    const jar = new Map();
    const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
    const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: cookieHeader() }, redirect: 'manual' }); absorb(res); return { status: res.status, location: res.headers.get('location'), text: await res.text() }; };
    const post = async (p, fields, from = '/login') => {
      const page = await get(from);
      const token = (page.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      const res = await fetch(base + p, { method: 'POST', headers: { cookie: cookieHeader(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: token, ...fields }), redirect: 'manual' });
      absorb(res);
      return { status: res.status, location: res.headers.get('location'), text: await res.text() };
    };
    return { get, post };
  }
  const owner = client();
  await owner.post('/login', { username: 'owner', password: 'owner-pass-12345', next: '/' });
  let r = await owner.get('/settings');
  assert.match(r.text, /Not connected yet/);
  assert.match(r.text, /the Google client ID \(in the form above\)/, 'says what is missing');
  assert.match(r.text, /http:\/\/office\.test\/settings\/mailbox\/callback/, 'gives Google the exact redirect address');
  assert.doesNotMatch(r.text, /Connect the mailbox</, 'no Connect button until the client is saved');

  // A manager sees the panel but cannot change the connection.
  const meg = client();
  await meg.post('/login', { username: 'meg', password: 'meg-pass-123456', next: '/' });
  assert.doesNotMatch((await meg.get('/settings')).text, /Save the client details/);
  assert.equal((await meg.get('/settings/mailbox/connect')).status, 404);
  assert.equal((await meg.post('/settings/mailbox/client', { client_id: '1-a.apps.googleusercontent.com', client_secret: 'GOCSPX-test-secret-abcdefghij' }, '/settings')).status, 404);

  // The owner saves the client; a bad ID is refused; the secret is sealed.
  r = await owner.post('/settings/mailbox/client', { client_id: 'not-a-client', client_secret: 'GOCSPX-test-secret-abcdefghij' }, '/settings');
  assert.match((await owner.get('/settings')).text, /does not look like a Google client ID/);
  await owner.post('/settings/mailbox/client', { client_id: '123-abc.apps.googleusercontent.com', client_secret: 'GOCSPX-test-secret-abcdefghij' }, '/settings');
  const sealedSecret = await store.setting(mailboxLib.CLIENT.secret);
  assert.doesNotMatch(sealedSecret, /GOCSPX/, 'the secret is not stored in the clear');
  r = await owner.get('/settings');
  assert.match(r.text, /Connect the mailbox</);
  assert.doesNotMatch(r.text, /GOCSPX-test-secret/, 'the secret is never shown again');

  // Connect: off to Google with the bookings address as the hint.
  r = await owner.get('/settings/mailbox/connect');
  assert.equal(r.status, 302);
  const auth = new URL(r.location);
  assert.equal(auth.origin + auth.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(auth.searchParams.get('login_hint'), MAILBOX);
  assert.equal(auth.searchParams.get('redirect_uri'), 'http://office.test/settings/mailbox/callback');
  assert.equal(auth.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose', 'read and draft only');
  const state = auth.searchParams.get('state');

  // A forged callback (no matching state) does nothing.
  r = await owner.get('/settings/mailbox/callback?code=good&state=forged');
  assert.match((await owner.get('/settings')).text, /could not be checked as the connection you started/);
  assert.equal(await store.setting(mailboxLib.STORED.token), '');

  // The wrong Google account: refused, and its token cancelled at Google.
  await owner.get('/settings/mailbox/connect');
  r = await owner.get('/settings/mailbox/connect');
  const state2 = new URL(r.location).searchParams.get('state');
  r = await owner.get(`/settings/mailbox/callback?code=wrong&state=${state2}`);
  assert.equal(r.location, '/settings#mailbox');
  r = await owner.get('/settings');
  assert.match(r.text, /That was tom@example\.invalid, not the bookings mailbox bookings@example\.invalid/);
  assert.deepEqual(g.calls.revoked, ['rt-wrong']);
  assert.equal(await store.setting(mailboxLib.STORED.token), '');
  assert.notEqual(state, state2);

  // The right account: sealed, recorded, never shown; the inbox reads it.
  r = await owner.get('/settings/mailbox/connect');
  const state3 = new URL(r.location).searchParams.get('state');
  r = await owner.get(`/settings/mailbox/callback?code=good&state=${state3}`);
  assert.equal(r.location, '/settings#mailbox');
  const sealedToken = await store.setting(mailboxLib.STORED.token);
  assert.doesNotMatch(sealedToken, /rt-good/);
  assert.equal(secretBox.open(sealedToken, KEY), 'rt-good');
  r = await owner.get('/settings');
  assert.match(r.text, /bookings@example\.invalid<\/strong> is connected/);
  assert.doesNotMatch(r.text, /rt-good/, 'the token never reaches a page');
  const events = (await pool.query("SELECT kind FROM case_events WHERE kind LIKE 'mailbox_%' ORDER BY id")).rows.map((x) => x.kind);
  assert.deepEqual(events, ['mailbox_client_saved', 'mailbox_refused', 'mailbox_connected']);
  const before = g.calls.lists;
  await owner.post('/inbox/sync', {}, '/inbox');
  assert.equal(g.calls.lists, before + 1, 'the office now reads the connected mailbox');

  // Disconnect: the token is cancelled at Google and the office stops.
  await owner.post('/settings/mailbox/disconnect', {}, '/settings');
  assert.deepEqual(g.calls.revoked, ['rt-wrong', 'rt-good']);
  assert.equal(await store.setting(mailboxLib.STORED.token), '');
  assert.equal(mailbox.configured(), false);
});
