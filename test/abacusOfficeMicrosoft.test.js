'use strict';

// Microsoft 365 mailboxes added in Settings (27 November 2026: the firm's
// email is Microsoft 365, read from its public DNS). The first tests run
// everywhere against a stand-in for Microsoft. The last one needs
// ABACUS_OFFICE_TEST_DATABASE_URL (it works in its own schema) and drives
// Settings over HTTP. Nothing here has been run against real Microsoft.

const test = require('node:test');
const assert = require('node:assert/strict');

const secretBox = require('../abacus-office/lib/secretBox');
const mailboxLib = require('../abacus-office/lib/mailbox');
const graphMailbox = require('../abacus-office/lib/graphMailbox');
const { createMailRoom } = require('../abacus-office/lib/mailroom');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;
const KEY = { ABACUS_OFFICE_TOKEN_KEY: 'k'.repeat(40) };
const TENANT = '11111111-2222-3333-4444-555555555555';
const CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CLIENT_SECRET = 'ms~Secret-Value.For_Tests-0123456789';
const ABACUS = 'bookings@abacus.example.invalid';
const COAST = 'info@coastline.example.invalid';
const DANA = 'dana@coastline.example.invalid';
const TOM = 'tom@elsewhere.example.invalid';

// A stand-in for Microsoft. A sign-in code names who signs in: "abacus"
// signs in as the Abacus mailbox itself; "dana" is a person with access to
// Coastline's shared mailbox; "tom" is somebody with access to neither.
// Refresh tokens rotate each time one is used, as Microsoft's do.
function fakeMicrosoft() {
  const people = { abacus: ABACUS, dana: DANA, tom: TOM };
  const access = { [ABACUS]: [ABACUS], [DANA]: [COAST], [TOM]: [] };
  const state = { requests: [], tokenCalls: [], inbox: { [ABACUS]: [], [COAST]: [] }, messages: {}, drafts: [], dead: new Set(), issued: 0, down: new Set(), fromCode: {}, bin: 'folder-deleted', draftsFolder: 'folder-drafts' };
  const json = (status, j) => ({ ok: status < 300, status, json: async () => j });
  const whoFor = (bearer) => { const m = /^Bearer at-([a-z]+)-/.exec(bearer || ''); return m ? people[m[1]] : ''; };
  async function fetch(url, init = {}) {
    const u = String(url);
    const headers = init.headers || {};
    if (u.startsWith('https://login.microsoftonline.com/')) {
      const body = new URLSearchParams(String(init.body));
      state.tokenCalls.push({ url: u, grant: body.get('grant_type'), scope: body.get('scope') });
      if (!u.startsWith(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`)) return json(400, { error: 'invalid_tenant' });
      if (body.get('client_id') !== CLIENT_ID || body.get('client_secret') !== CLIENT_SECRET) return json(401, { error: 'invalid_client' });
      state.issued += 1;
      if (body.get('grant_type') === 'authorization_code') {
        const who = body.get('code');
        if (!people[who]) return json(400, { error: 'invalid_grant' });
        state.fromCode[who] = `rt-${who}-${state.issued}`;
        return json(200, { access_token: `at-${who}-${state.issued}`, refresh_token: `rt-${who}-${state.issued}`, expires_in: 3600 });
      }
      const old = body.get('refresh_token') || '';
      const m = /^rt-([a-z]+)-/.exec(old);
      if (!m || state.dead.has(old)) return json(400, { error: 'invalid_grant' });
      return json(200, { access_token: `at-${m[1]}-${state.issued}`, refresh_token: `rt-${m[1]}-${state.issued}`, expires_in: 3600 });
    }
    if (!u.startsWith('https://graph.microsoft.com/v1.0')) return json(404, {});
    const path = u.slice('https://graph.microsoft.com/v1.0'.length);
    const who = whoFor(headers.Authorization);
    state.requests.push({ method: init.method || 'GET', path, who, prefer: headers.Prefer || '' });
    if (!who) return json(401, { error: { code: 'InvalidAuthenticationToken' } });
    if (path.startsWith('/me')) return json(200, { mail: who, userPrincipalName: who });
    const m = /^\/users\/([^/]+)(\/.*)$/.exec(path);
    if (!m) return json(404, { error: { code: 'BadRequest' } });
    const box = decodeURIComponent(m[1]);
    const rest = m[2];
    if (!(access[who] || []).includes(box)) return json(404, { error: { code: 'ErrorItemNotFound', message: 'The specified object was not found in the store.' } });
    if (rest.startsWith('/mailFolders/inbox?')) return json(200, { id: 'folder-inbox' });
    if (rest.startsWith('/mailFolders/deleteditems')) return json(200, { id: state.bin });
    if (rest.startsWith('/mailFolders/inbox/messages?')) {
      if (state.down.has(box)) return json(503, { error: { code: 'ServiceUnavailable', message: 'try later' } });
      return json(200, { value: state.inbox[box] });
    }
    const reply = /^\/messages\/([^/?]+)\/createReply$/.exec(rest);
    if (reply && init.method === 'POST') {
      const src = state.inbox[box].find((x) => x.id === decodeURIComponent(reply[1]));
      if (!src) return json(404, { error: { code: 'ErrorItemNotFound' } });
      const id = `draft-${state.drafts.length + 1}`;
      const text = JSON.parse(init.body).comment;
      const d = { id, mailbox: box, by: who, replyTo: src.id, conversationId: src.conversationId, text, isDraft: true, parentFolderId: state.draftsFolder, body: `${text}\r\n\r\nFrom: someone\r\nSent: earlier\r\n${src.body.content}` };
      state.drafts.push(d); state.messages[id] = d;
      return json(201, { id, conversationId: src.conversationId });
    }
    if (rest === '/messages' && init.method === 'POST') {
      const p = JSON.parse(init.body);
      const id = `draft-${state.drafts.length + 1}`;
      const d = { id, mailbox: box, by: who, fresh: true, subject: p.subject, to: p.toRecipients, text: p.body.content, isDraft: true, parentFolderId: state.draftsFolder, body: p.body.content, conversationId: `conv-${id}` };
      state.drafts.push(d); state.messages[id] = d;
      return json(201, { id, conversationId: d.conversationId });
    }
    const one = /^\/messages\/([^/?]+)\?/.exec(rest);
    if (one) {
      const d = state.messages[decodeURIComponent(one[1])];
      if (!d || d.mailbox !== box || d.gone) return json(404, { error: { code: 'ErrorItemNotFound' } });
      return json(200, { id: d.id, isDraft: d.isDraft, parentFolderId: d.parentFolderId, sentDateTime: d.sentDateTime || null, body: { contentType: 'text', content: d.body } });
    }
    return json(404, { error: { code: 'BadRequest' } });
  }
  const email = (id, at, from, to, subject, text) => ({ id, conversationId: `conv-${id}`, internetMessageId: `<${id}@mail.example.invalid>`, subject, from: { emailAddress: { name: from[0], address: from[1] } }, replyTo: [], toRecipients: [{ emailAddress: { address: to } }], ccRecipients: [], receivedDateTime: new Date(at).toISOString(), body: { contentType: 'text', content: text } });
  return { fetch, state, email };
}

const client = { tenant: TENANT, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET };

test('it never asks Microsoft for leave to send, and the sign-in goes to the firm\'s own tenant', () => {
  assert.deepEqual(graphMailbox.SCOPES.map((s) => s.replace('https://graph.microsoft.com/', '')), ['offline_access', 'User.Read', 'Mail.ReadWrite', 'Mail.ReadWrite.Shared']);
  assert.ok(!graphMailbox.SCOPES.some((s) => /send/i.test(s)), 'no Mail.Send');
  const u = new URL(graphMailbox.authorizeUrl({ ...client, redirectUri: 'https://office.test/settings/mailbox/callback', state: 's1', loginHint: ABACUS }));
  assert.equal(u.origin + u.pathname, `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
  assert.equal(u.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(u.searchParams.get('redirect_uri'), 'https://office.test/settings/mailbox/callback');
  assert.equal(u.searchParams.get('prompt'), 'select_account', 'the person chooses who signs in');
  assert.doesNotMatch(u.searchParams.get('scope'), /Send/i);
  assert.doesNotMatch(u.toString(), new RegExp(CLIENT_SECRET.replace(/[.~]/g, '\\$&')), 'the secret is never in an address');
  // What the Settings form accepts.
  assert.equal(graphMailbox.validTenant(TENANT), true);
  assert.equal(graphMailbox.validTenant('a2b.onmicrosoft.com'), true);
  assert.equal(graphMailbox.validTenant('common/../x'), false);
  assert.equal(graphMailbox.validClientId(CLIENT_ID), true);
  assert.equal(graphMailbox.validClientId('not-a-guid'), false);
  assert.equal(graphMailbox.validSecret('has a space in it'), false);
  assert.deepEqual(graphMailbox.missing({ tenant: TENANT }), ['the client ID', 'the client secret']);
});

test('signing in: a person who cannot open the mailbox is refused and nothing of theirs is kept', async () => {
  const ms = fakeMicrosoft();
  const go = (code, mailbox) => graphMailbox.finish({ ...client, code, redirectUri: 'https://office.test/settings/mailbox/callback', mailbox, fetch: ms.fetch });
  const own = await go('abacus', ABACUS);
  assert.equal(own.ok, true);
  assert.equal(own.signedInAs, ABACUS);
  assert.match(own.refreshToken, /^rt-abacus-\d+$/);
  // A shared mailbox: Dana signs in as herself and has access to it.
  const shared = await go('dana', COAST);
  assert.equal(shared.ok, true);
  assert.equal(shared.signedInAs, DANA);
  // Dana has no access to Abacus's mailbox, and Tom has access to nothing.
  for (const [code, mailbox, who] of [['dana', ABACUS, DANA], ['tom', COAST, TOM]]) {
    const r = await go(code, mailbox);
    assert.equal(r.ok, false);
    assert.equal(r.refreshToken, undefined, 'no sign-in is handed back to be saved');
    assert.match(r.message, new RegExp(`${who.replace(/\./g, '\\.')} cannot open the mailbox ${mailbox.replace(/\./g, '\\.')}`));
  }
  const wrongSecret = await graphMailbox.finish({ ...client, clientSecret: 'wrong-secret-value', code: 'abacus', redirectUri: 'x', mailbox: ABACUS, fetch: ms.fetch });
  assert.equal(wrongSecret.ok, false);
  assert.match(wrongSecret.message, /did not issue a token \(invalid_client\)/);
});

test('a connected mailbox reads only its own address, saves drafts only, and keeps Microsoft\'s newest sign-in', async () => {
  const ms = fakeMicrosoft();
  const now = Date.now();
  ms.state.inbox[COAST].push(ms.email('m1', now, ['Sam Rowe', 'sam@example.invalid'], 'bookings@coastline.co.uk.example.invalid', 'Coach for a wedding', 'Do you have a 16 seater on 12 June?\r\n'));
  const rotated = [];
  const box = graphMailbox.create({ address: `  ${COAST.toUpperCase()} `, ...client, refreshToken: 'rt-dana-0', onRotate: async (t) => { rotated.push(t); }, fetch: ms.fetch });
  assert.equal(box.address, COAST);
  assert.equal(box.configured(), true);
  assert.equal(typeof box.send, 'undefined', 'it has no send');

  const list = await box.listInbox({ max: 50, days: 14 });
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].id, list[0].providerId, list[0].threadId, list[0].messageId], ['ol-m1', 'm1', 'conv-m1', '<m1@mail.example.invalid>']);
  assert.equal(list[0].from, 'Sam Rowe <sam@example.invalid>');
  assert.deepEqual(list[0].to, ['bookings@coastline.co.uk.example.invalid'], 'staff can see which of the company\'s addresses it was sent to');
  assert.match(list[0].receivedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'a London time to the minute, as the office keeps it');
  assert.equal(list[0].body, 'Do you have a 16 seater on 12 June?');
  // Microsoft handed back a newer sign-in; it is kept and passed on to be saved.
  assert.equal(rotated.length, 1);
  assert.match(rotated[0], /^rt-dana-\d+$/);
  assert.equal(box.currentRefreshToken(), rotated[0]);

  // A reply is a draft on the customer's own conversation; a new email is a draft too.
  const saved = await box.saveReplyDraft({ id: 'ol-m1', providerId: 'm1', from: 'sam@example.invalid', subject: 'Coach for a wedding' }, 'Hello Sam,\nYes, we have one free that day.\nThanks,\nCoastline Travel');
  assert.deepEqual(saved, { draftId: 'draft-1', threadId: 'conv-m1' });
  assert.equal(ms.state.drafts[0].mailbox, COAST);
  assert.equal(ms.state.drafts[0].replyTo, 'm1');
  const fresh = await box.saveReplyDraft({ from: 'pat@example.invalid', subject: 'Airport prices from January', fresh: true }, 'Hello Pat,\nOur airport price changes in January.');
  assert.equal(fresh.draftId, 'draft-2');
  assert.deepEqual(ms.state.drafts[1].to, [{ emailAddress: { address: 'pat@example.invalid' } }]);
  await assert.rejects(box.saveReplyDraft({ from: 'a@b.c', subject: 's' }, 'x'), { code: 'MAILBOX_REFUSED' }, 'a reply with no email to reply to is refused, not guessed');

  // Whether the saved draft was sent.
  const text = 'Hello Sam,\nYes, we have one free that day.\nThanks,\nCoastline Travel';
  assert.deepEqual(await box.draftState({ draftId: 'draft-1', text }), { state: 'unsent' });
  ms.state.messages['draft-1'].parentFolderId = ms.state.bin;
  assert.deepEqual(await box.draftState({ draftId: 'draft-1', text }), { state: 'discarded' }, 'in Deleted Items: thrown away, not sent');
  Object.assign(ms.state.messages['draft-1'], { parentFolderId: 'folder-sent', isDraft: false, sentDateTime: '2026-11-27T10:15:00Z' });
  const sent = await box.draftState({ draftId: 'draft-1', text });
  assert.equal(sent.state, 'sent');
  assert.equal(sent.at.toISOString(), '2026-11-27T10:15:00.000Z');
  ms.state.messages['draft-1'].body = 'Hello Sam,\nSorry, we are fully booked.\nThanks';
  assert.equal((await box.draftState({ draftId: 'draft-1', text })).state, 'other', 'changed before sending is not called sent');
  ms.state.messages['draft-1'].gone = true;
  assert.equal(await box.draftState({ draftId: 'draft-1', text }), null, 'not found is left for a person, never called thrown away');
  assert.equal(await box.draftState({ draftId: '', text }), null);

  // Every request named this mailbox and nothing else, asked for lasting ids
  // and plain text, and none of them sent anything.
  const calls = ms.state.requests;
  assert.ok(calls.length >= 8);
  for (const c of calls) {
    assert.ok(c.path.startsWith(`/users/${encodeURIComponent(COAST)}/`), `only its own mailbox: ${c.path}`);
    assert.match(c.prefer, /IdType="ImmutableId"/);
    assert.match(c.prefer, /outlook\.body-content-type="text"/);
    assert.doesNotMatch(c.path, /send/i, 'nothing is sent');
  }
  assert.ok(ms.state.tokenCalls.every((c) => !/Send/i.test(c.scope || '')));

  // A sign-in Microsoft no longer accepts is said plainly, and nothing is read.
  ms.state.dead.add('rt-tom-9');
  const stale = graphMailbox.create({ address: ABACUS, ...client, refreshToken: 'rt-tom-9', fetch: ms.fetch });
  await assert.rejects(stale.listInbox({}), (e) => e.code === 'MAILBOX_REFUSED' && /needs connecting again in Settings/.test(e.message));
  // A person whose access to the mailbox has been taken away.
  const noAccess = graphMailbox.create({ address: ABACUS, ...client, refreshToken: 'rt-dana-0', fetch: ms.fetch });
  await assert.rejects(noAccess.listInbox({}), (e) => e.code === 'MAILBOX_REFUSED' && /would not open bookings@abacus/.test(e.message));
  // Not connected: nothing is asked of Microsoft at all.
  const before = ms.state.requests.length + ms.state.tokenCalls.length;
  const blank = graphMailbox.create({ address: ABACUS, ...client, refreshToken: '', fetch: ms.fetch });
  assert.equal(blank.configured(), false);
  await assert.rejects(blank.listInbox({}), { code: 'MAILBOX_REFUSED' });
  assert.equal(ms.state.requests.length + ms.state.tokenCalls.length, before);
});

test('in the mailroom: read only when the server is set to a real mailbox, and a rotated sign-in is saved sealed', async () => {
  const ms = fakeMicrosoft();
  const rows = [
    { id: 4, brand: 'abacus', provider: 'outlook', address: ABACUS, token: secretBox.seal('rt-abacus-0', KEY), start_at: new Date('2026-11-27T10:00:30Z'), connected_by: 'Dan', connected_at: new Date('2026-11-27T10:00:30Z'), signed_in_as: ABACUS },
    { id: 7, brand: 'coastline', provider: 'outlook', address: COAST, token: '', start_at: null }
  ];
  const settings = { mailbox_outlook_tenant_id: TENANT, mailbox_outlook_client_id: CLIENT_ID, mailbox_outlook_client_secret: secretBox.seal(CLIENT_SECRET, KEY) };
  const saved = [];
  const store = { setting: async (k) => settings[k] || '', mailboxes: async () => rows, rotateMailboxToken: async (id, sealed) => { saved.push([id, sealed]); } };
  const firm = { brands: [{ id: 'abacus' }, { id: 'coastline' }] };
  const none = { name: 'none', label: 'No mailbox connected', none: true, off: true, configured: () => false };

  const env = { ...KEY, ABACUS_OFFICE_MAIL_DRIVER: 'outlook' };
  const closed = await createMailRoom({ primary: none, firm, store, env: { ...KEY, ABACUS_OFFICE_MAIL_DRIVER: 'none' }, fetch: ms.fetch }).reload();
  assert.equal(closed.open, false, 'switched off on the server, nothing from Settings is read');
  assert.deepEqual(closed.reading(), []);

  // The server set to outlook with nothing of its own: only what Settings holds is read.
  const primary = mailboxLib.createMailbox(env, { fetch: ms.fetch });
  const room = await createMailRoom({ primary, firm, store, env, fetch: ms.fetch }).reload();
  assert.equal(room.open, true);
  assert.deepEqual(room.added().map((m) => [m.id, m.provider, m.providerName, m.connected]), [[4, 'outlook', 'Microsoft 365', true], [7, 'outlook', 'Microsoft 365', false]]);
  assert.deepEqual(room.reading().map((m) => m.address), [ABACUS]);
  assert.match(room.describe(), /bookings@abacus\.example\.invalid on Microsoft 365 for abacus \(connected\); info@coastline\.example\.invalid on Microsoft 365 for coastline \(not connected\)/);
  assert.doesNotMatch(room.describe(), /rt-abacus|ms~Secret/);
  assert.equal(room.entryForBrand('abacus').address, ABACUS);
  assert.equal(room.entryForBrand('coastline'), null, 'Coastline has no connected mailbox, so nothing of Coastline\'s goes into Abacus\'s');
  assert.equal(room.forCase({ mailbox_id: 4 }).label, `Outlook (${ABACUS})`);

  await room.reading()[0].box.listInbox({});
  assert.equal(saved.length, 1, 'Microsoft\'s newer sign-in was saved');
  assert.equal(saved[0][0], 4);
  assert.match(secretBox.open(saved[0][1], KEY), /^rt-abacus-\d+$/);
  assert.doesNotMatch(saved[0][1], /rt-abacus/, 'sealed, not in the clear');

  // The same mailbox is kept across reloads, so the newest sign-in is not lost.
  const first = room.reading()[0].box;
  await room.reload();
  assert.equal(room.reading()[0].box, first);
});

test('over HTTP: the owner saves the Microsoft app, connects a mailbox and a shared mailbox, and replies wait there as drafts', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const SCHEMA = 'office_microsoft_test';
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
  const ms = fakeMicrosoft();
  const mailEnv = { ...KEY, ABACUS_OFFICE_MAIL_DRIVER: 'outlook' };
  const mailbox = mailboxLib.createMailbox(mailEnv, { store, fetch: ms.fetch });
  await mailbox.reload();
  const firm = { name: 'Cornwall Taxis', short: 'Cornwall', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Cornwall Taxis', facts: [], demo: false, logo: '',
    brands: [{ id: 'abacus', name: 'Abacus & Falmouth Taxis' }, { id: 'coastline', name: 'Coastline Travel' }, { id: 'a2b', name: 'A2B Cornwall' }] };
  const { app, office } = createApp({ pool, mailbox, firm, sessionSecret: 'test-secret-for-the-abacus-office', production: false, aiOn: () => false, alertsEnv: {}, mailEnv, fetchImpl: ms.fetch, baseUrl: 'http://office.test' });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end(); });

  const seenPages = [];
  function browser() {
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
    // Follows Connect out to "Microsoft" and back as whoever signs in.
    const connect = async (id, code, hint) => {
      const out = await get(`/settings/mailboxes/${id}/connect`);
      assert.equal(out.status, 302);
      const url = new URL(out.location);
      assert.equal(url.origin + url.pathname, `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
      assert.equal(url.searchParams.get('redirect_uri'), 'http://office.test/settings/mailbox/callback', 'one redirect address however many mailboxes');
      assert.equal(url.searchParams.get('login_hint'), hint);
      assert.doesNotMatch(url.searchParams.get('scope'), /Send/i);
      return get(`/settings/mailbox/callback?state=${url.searchParams.get('state')}&code=${code}`);
    };
    return { get, post, signIn, connect };
  }
  const owner = browser();
  await owner.signIn('owner', 'owner-pass-12345');
  const meg = browser();
  await meg.signIn('meg', 'meg-pass-123456');

  // The page offers the Microsoft app form and Microsoft 365 as the kind of mailbox.
  let r = await owner.get('/settings');
  assert.match(r.text, /The firm's Microsoft 365 app/);
  assert.match(r.text, /<option value="outlook" selected>Microsoft 365<\/option>/);
  assert.match(r.text, /Do not add Mail\.Send/);
  assert.match(r.text, /http:\/\/office\.test\/settings\/mailbox\/callback/);
  assert.doesNotMatch(r.text, /The firm's Google client/, 'no Google form until a Google mailbox is in use');
  r = await meg.get('/settings');
  assert.doesNotMatch(r.text, /The firm's Microsoft 365 app/, 'a manager is not offered it');
  assert.equal((await meg.post('/settings/mailbox/microsoft', { tenant_id: TENANT, client_id: CLIENT_ID, client_secret: CLIENT_SECRET })).status, 404);

  // What the app form refuses.
  await owner.post('/settings/mailbox/microsoft', { tenant_id: 'x', client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
  assert.match((await owner.get('/settings')).text, /does not look like a tenant ID/);
  await owner.post('/settings/mailbox/microsoft', { tenant_id: TENANT, client_id: 'nope', client_secret: CLIENT_SECRET });
  assert.match((await owner.get('/settings')).text, /does not look like a client ID/);
  await owner.post('/settings/mailbox/microsoft', { tenant_id: TENANT, client_id: CLIENT_ID, client_secret: 'two words' });
  assert.match((await owner.get('/settings')).text, /does not look like a client secret/);
  assert.equal(await store.setting('mailbox_outlook_client_secret'), '');

  // Two mailboxes added; no Connect until the app details are saved.
  await owner.post('/settings/mailboxes', { address: ABACUS, brand: 'abacus' });
  await owner.post('/settings/mailboxes', { address: COAST, brand: 'coastline', provider: 'outlook' });
  const rows = await store.mailboxes();
  assert.deepEqual(rows.map((m) => [m.address, m.brand, m.provider]), [[ABACUS, 'abacus', 'outlook'], [COAST, 'coastline', 'outlook']], 'Microsoft 365 unless the owner says otherwise');
  const [abacusId, coastId] = rows.map((m) => m.id);
  r = await owner.get('/settings');
  assert.match(r.text, /bookings@abacus\.example\.invalid<\/strong> \(Microsoft 365\) for Abacus &amp; Falmouth Taxis:\s+not connected yet/);
  assert.doesNotMatch(r.text, new RegExp(`/settings/mailboxes/${abacusId}/connect`));
  assert.match(r.text, /the tenant ID of the firm&#39;s Microsoft app/);
  assert.equal((await owner.get(`/settings/mailboxes/${abacusId}/connect`)).location, '/settings#mailbox');
  r = await owner.post('/settings/mailbox/microsoft', { tenant_id: TENANT, client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
  assert.equal(r.location, '/settings#mailbox');
  const sealedSecret = await store.setting('mailbox_outlook_client_secret');
  assert.ok(sealedSecret && !sealedSecret.includes(CLIENT_SECRET), 'the secret is sealed');
  r = await owner.get('/settings');
  assert.match(r.text, /Microsoft app details saved \(client aaaaaaaa\.\.\.\)/);
  assert.match(r.text, new RegExp(`/settings/mailboxes/${abacusId}/connect`));

  // Emails already in both mailboxes before either is connected.
  const now = Date.now();
  ms.state.inbox[ABACUS].push(ms.email('old-a', now - 3 * 86400000, ['Old Customer', 'old@example.invalid'], ABACUS, 'Last week', 'An old email.'));
  ms.state.inbox[COAST].push(ms.email('old-c', now - 2 * 3600000, ['Earlier', 'earlier@example.invalid'], COAST, 'Two hours ago', 'An earlier email.'));

  // Somebody with no access to the mailbox: nothing is connected or kept.
  r = await owner.connect(abacusId, 'tom', ABACUS);
  assert.equal(r.location, '/settings#mailbox');
  assert.match((await owner.get('/settings')).text, /tom@elsewhere\.example\.invalid cannot open the mailbox bookings@abacus\.example\.invalid, so nothing was connected/);
  assert.equal((await store.mailboxById(abacusId)).token, '');
  assert.equal((await meg.get(`/settings/mailboxes/${abacusId}/connect`)).status, 404, 'a manager cannot connect one');
  // A reply from Microsoft with the wrong state is not acted on.
  r = await owner.get(`/settings/mailbox/callback?state=made-up&code=abacus`);
  assert.equal((await store.mailboxById(abacusId)).token, '');

  // The mailbox's own sign-in, then a shared mailbox through a person with access.
  await owner.connect(abacusId, 'abacus', ABACUS);
  await owner.connect(coastId, 'dana', COAST);
  r = await owner.get('/settings');
  assert.match(r.text, /bookings@abacus\.example\.invalid<\/strong> \(Microsoft 365\) for Abacus &amp; Falmouth Taxis:\s+connected by Dan/);
  assert.match(r.text, /info@coastline\.example\.invalid<\/strong> \(Microsoft 365\) for Coastline Travel:\s+connected by Dan on [^<]*, signed in as dana@coastline\.example\.invalid\./);
  assert.match(r.text, /It takes in emails received since/);
  let row = await store.mailboxById(coastId);
  assert.equal(row.signed_in_as, DANA);
  assert.ok(row.token && !/rt-dana/.test(row.token), 'the sign-in is sealed');
  assert.ok(row.start_at);

  // New emails arrive; the old ones are not brought in.
  ms.state.inbox[ABACUS].push(ms.email('new-a', Date.now(), ['Jenna Pascoe', 'jenna@example.invalid'], 'bookings@abacus-taxis.co.uk.example.invalid', 'Airport run Friday', 'Can you take four of us to Newquay airport on Friday at 6am?'));
  ms.state.inbox[COAST].push(ms.email('new-c', Date.now(), ['Sam Rowe', 'sam@example.invalid'], COAST, 'Coach for a wedding', 'Do you have a 16 seater on 12 June?'));
  const created = await office.sync();
  assert.deepEqual(created.map((c) => [c.subject, c.brand, c.mailbox_address]).sort(), [['Airport run Friday', 'abacus', ABACUS], ['Coach for a wedding', 'coastline', COAST]]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM cases')).rows[0].n, 2, 'nothing from before the mailboxes were connected');
  assert.deepEqual(await office.sync(), [], 'a second pull makes no second case');
  const abacusCase = created.find((c) => c.brand === 'abacus');
  const coastCase = created.find((c) => c.brand === 'coastline');
  assert.equal(abacusCase.sent_to, 'bookings@abacus-taxis.co.uk.example.invalid');
  // Microsoft handed out a newer sign-in the first time the mailbox was
  // read; that is the one saved now, still sealed, and the start is unmoved.
  const after = await store.mailboxById(coastId);
  assert.match(secretBox.open(after.token, KEY), /^rt-dana-\d+$/);
  assert.notEqual(secretBox.open(after.token, KEY), ms.state.fromCode.dana, 'the newer sign-in replaced the one from the day it was connected');
  assert.doesNotMatch(after.token, /rt-dana/);
  assert.equal(new Date(after.start_at).getTime(), new Date(row.start_at).getTime(), 'saving a newer sign-in does not move where the mailbox starts');

  // The reply waits as a draft in the mailbox its email came into, on the customer's conversation.
  r = await owner.get(`/case/${coastCase.id}`);
  assert.match(r.text, /saved as a draft in Outlook \(info@coastline\.example\.invalid\)/);
  const version = (r.text.match(/name="draft_version" value="(\d+)"/) || [])[1];
  const reply = 'Hello Sam,\nYes, we have one free that day.\nThanks,\nCoastline Travel';
  await owner.post(`/case/${coastCase.id}/approve`, { draft: reply, draft_version: version }, `/case/${coastCase.id}`);
  assert.equal(ms.state.drafts.length, 1);
  assert.deepEqual([ms.state.drafts[0].mailbox, ms.state.drafts[0].replyTo, ms.state.drafts[0].by], [COAST, 'new-c', DANA]);
  r = await owner.get(`/case/${coastCase.id}`);
  assert.match(r.text, /It is in Outlook \(info@coastline\.example\.invalid\) as a draft/);
  let kase = await store.caseById(coastCase.id);
  assert.equal(kase.sent_state, 'unsent');
  assert.equal(kase.sent_at, null, 'approving is not sending');

  // Still a draft: nothing changes. Sent from Outlook as written: the office sees it.
  assert.equal((await office.checkSent()).changed, 0);
  Object.assign(ms.state.messages['draft-1'], { isDraft: false, parentFolderId: 'folder-sent', sentDateTime: new Date().toISOString() });
  assert.equal((await office.checkSent()).changed, 1);
  kase = await store.caseById(coastCase.id);
  assert.equal(kase.sent_state, 'sent');
  assert.ok(kase.sent_at);
  assert.equal(kase.status, 'waiting');

  // A new email (Write) waits in its own company's mailbox; A2B has none.
  const write = async (brand) => {
    const made = await owner.post('/write', { kind: 'new', relationship: 'new', brand, to_address: 'pat@example.invalid', to_name: 'Pat', prompt: 'Tell them the airport price is going up in January.' }, '/write');
    return owner.post(`${made.location}/approve`, { subject: 'Airport prices from January', body: 'Hello Pat,\nOur airport price changes in January.\nThanks,\nDan' }, made.location);
  };
  await write('abacus');
  assert.equal(ms.state.drafts.length, 2);
  assert.deepEqual([ms.state.drafts[1].mailbox, ms.state.drafts[1].fresh, ms.state.drafts[1].subject], [ABACUS, true, 'Airport prices from January']);
  await write('a2b');
  assert.equal(ms.state.drafts.length, 2, 'nothing of A2B\'s goes into another company\'s mailbox');

  // One mailbox failing does not stop the other, and staff are told which.
  ms.state.down.add(COAST);
  ms.state.inbox[ABACUS].push(ms.email('new-a2', Date.now(), ['Lee Tonkin', 'lee@example.invalid'], ABACUS, 'Lost phone', 'I left my phone in one of your cars last night.'));
  await owner.post('/inbox/sync', {}, '/inbox');
  r = await owner.get('/inbox?show=all');
  assert.match(r.text, /Lost phone/);
  assert.match(r.text, /One mailbox was not read \(Outlook \(info@coastline\.example\.invalid\)/);
  ms.state.down.delete(COAST);

  // A Google mailbox can sit beside them; it asks for the Google client, not Microsoft's.
  await owner.post('/settings/mailboxes', { address: 'office@a2b.example.invalid', brand: 'a2b', provider: 'gmail' });
  r = await owner.get('/settings');
  assert.match(r.text, /office@a2b\.example\.invalid<\/strong> \(Google\) for A2B Cornwall:\s+not connected yet/);
  assert.match(r.text, /The firm's Google client/);
  assert.match(r.text, /the Google client ID \(in the form above\)/);
  const a2bId = (await store.mailboxes()).find((m) => m.provider === 'gmail').id;
  assert.equal((await owner.get(`/settings/mailboxes/${a2bId}/connect`)).location, '/settings#mailbox', 'no Google sign-in without the Google client');

  // Disconnecting deletes the saved sign-in and stops the reading; its emails stay.
  await owner.post(`/settings/mailboxes/${abacusId}/disconnect`, {});
  assert.match((await owner.get('/settings')).text, /bookings@abacus\.example\.invalid is disconnected and its saved sign-in deleted from the office/);
  assert.equal((await store.mailboxById(abacusId)).token, '');
  const listed = ms.state.requests.filter((c) => c.path.includes(encodeURIComponent(ABACUS))).length;
  await office.sync();
  assert.equal(ms.state.requests.filter((c) => c.path.includes(encodeURIComponent(ABACUS))).length, listed, 'a disconnected mailbox is not read');
  assert.equal((await owner.get(`/case/${abacusCase.id}`)).status, 200);

  // Nothing was ever sent, and no page showed a sign-in or the secret.
  assert.ok(ms.state.requests.every((c) => !/send/i.test(c.path)));
  assert.ok(ms.state.tokenCalls.every((c) => !/Send/i.test(c.scope || '')));
  const everything = seenPages.join('\n');
  assert.doesNotMatch(everything, /rt-abacus|rt-dana|rt-tom|at-abacus|at-dana|ms~Secret/);
});
