'use strict';

// The one-link route that mints the weekly database backup's Drive token
// (Tom, 19/10/2026), in place of the OAuth Playground.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');

const connect = require('../../lib/workspace/driveBackupConnect');
const gmailClient = require('../../lib/workspace/email/gmailClient');

const ENV = {
  ENABLE_ARRINGTON_AI_WORKSPACE: 'true',
  WORKSPACE_OWNER_USERNAME: 'tom',
  WORKSPACE_OWNER_USER_ID: '2',
  WORKSPACE_ACCESS_PASSPHRASE: 'drive-backup-test-passphrase',
  GMAIL_CLIENT_ID: 'client-id-test',
  GMAIL_CLIENT_SECRET: 'client-secret-test'
};

test('the link asks Google for Drive files only, through the Gmail client and its registered callback', () => {
  const url = new URL(connect.buildAuthorizeUrl('st-1', { GMAIL_CLIENT_ID: '  client-id-test \n' }));
  assert.equal(url.origin + url.pathname, gmailClient.AUTH_URL);
  assert.equal(url.searchParams.get('client_id'), 'client-id-test');
  assert.equal(url.searchParams.get('redirect_uri'), gmailClient.CANONICAL_REDIRECT_URI);
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('state'), 'st-1');
  assert.equal(url.searchParams.get('include_granted_scopes'), null, 'the token must not carry the Gmail access this client already holds');
});

test('a token is shown only when it carries Drive files and nothing more', () => {
  assert.equal(connect.assessGrant({ refresh_token: 'rt', scope: connect.SCOPE }).ok, true);
  assert.equal(connect.assessGrant({ scope: connect.SCOPE }).ok, false, 'no refresh token');
  assert.match(connect.assessGrant({ refresh_token: 'rt', scope: 'openid' }).message, /unticked/);
  const wide = connect.assessGrant({ refresh_token: 'rt-wide', scope: `${connect.SCOPE} https://www.googleapis.com/auth/gmail.readonly` });
  assert.equal(wide.ok, false, 'a token that can read mail does not go on the backup service');
  assert.doesNotMatch(wide.message, /rt-wide/);
});

test('nothing here revokes a token (one grant per person per client: it would cut off Gmail too)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'driveBackupConnect.js'), 'utf8')
    .replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /revoke/i);
});

async function withServer(fn) {
  const saved = {};
  for (const k of Object.keys(ENV)) { saved[k] = process.env[k]; process.env[k] = ENV[k]; }
  const unlock = require('../../lib/workspace/unlock');
  const repo = require('../../lib/workspace/repo');
  const activity = [];
  const savedAdd = repo.addActivity;
  repo.addActivity = async (row) => { activity.push(row); };
  const realFetch = globalThis.fetch;
  const tokenReplies = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url) === gmailClient.TOKEN_URL) {
      const reply = tokenReplies.shift();
      return { ok: true, status: 200, statusText: 'OK', json: async () => reply };
    }
    return realFetch(url, opts);
  };

  const sessions = {};
  const app = express();
  app.use((req, res, next) => {
    const id = req.get('x-test-session') || 'a';
    sessions[id] = sessions[id] || {
      user: { id: 2, username: 'tom', role: 'content' },
      workspaceUnlock: { userId: '2', fingerprint: unlock.passphraseFingerprint(), at: Date.now() }
    };
    req.session = sessions[id];
    res.locals.nonce = 'n';
    next();
  });
  require('../../routes/workspace').mountPageRoute(app, () => 'csrf');
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    await fn({ base, sessions, tokenReplies, activity });
  } finally {
    srv.close();
    globalThis.fetch = realFetch;
    repo.addActivity = savedAdd;
    for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

test('connect, approve, and the page shows the token once for the backup service, recording no token anywhere', async () => {
  await withServer(async ({ base, sessions, tokenReplies, activity }) => {
    const go = await fetch(base + '/workspace/backup/drive/connect', { redirect: 'manual' });
    assert.equal(go.status, 302);
    const auth = new URL(go.headers.get('location'));
    assert.equal(auth.searchParams.get('scope'), connect.SCOPE);
    assert.equal(sessions.a.gmailOAuthPurpose, 'drive_backup');

    tokenReplies.push({ refresh_token: 'rt-drive-123', scope: connect.SCOPE });
    const back = await fetch(`${base}/workspace/email/gmail/callback?state=${auth.searchParams.get('state')}&code=abc`);
    const html = await back.text();
    assert.equal(back.status, 200);
    assert.equal(back.headers.get('cache-control'), 'no-store');
    assert.match(html, /Drive backup connected/);
    assert.match(html, /GOOGLE_DRIVE_REFRESH_TOKEN/);
    assert.match(html, /db-backup-to-drive/);
    assert.match(html, /rt-drive-123/);
    assert.doesNotMatch(html, /GMAIL_REFRESH_TOKEN/, 'never labelled as the Gmail token');
    assert.equal(sessions.a.gmailOAuthPurpose, undefined, 'the purpose is spent');
    assert.equal(activity.length, 1);
    assert.doesNotMatch(JSON.stringify(activity), /rt-drive-123/);

    // A replayed callback is refused: the state was spent.
    const again = await (await fetch(`${base}/workspace/email/gmail/callback?state=${auth.searchParams.get('state')}&code=abc`, { redirect: 'manual' })).status;
    assert.equal(again, 302, 'goes to the Email page as an ordinary unverified Gmail attempt');
  });
});

test('an unticked Drive box shows no token and says why; a later Gmail connect is still a Gmail connect', async () => {
  await withServer(async ({ base, sessions, tokenReplies }) => {
    const go = await fetch(base + '/workspace/backup/drive/connect', { redirect: 'manual' });
    const state = new URL(go.headers.get('location')).searchParams.get('state');
    tokenReplies.push({ refresh_token: 'rt-useless', scope: 'openid' });
    const html = await (await fetch(`${base}/workspace/email/gmail/callback?state=${state}&code=abc`)).text();
    assert.match(html, /Drive backup not connected/);
    assert.match(html, /unticked/);
    assert.doesNotMatch(html, /rt-useless/);

    // Start the Drive link, then the Gmail one: the Gmail callback must not
    // be treated as the backup's.
    await fetch(base + '/workspace/backup/drive/connect', { redirect: 'manual' });
    const gm = await fetch(base + '/workspace/email/gmail/connect', { redirect: 'manual' });
    const gstate = new URL(gm.headers.get('location')).searchParams.get('state');
    assert.equal(sessions.a.gmailOAuthPurpose, undefined);
    tokenReplies.push({ refresh_token: 'rt-gmail', scope: 'https://www.googleapis.com/auth/gmail.readonly' });
    const gh = await (await fetch(`${base}/workspace/email/gmail/callback?state=${gstate}&code=abc`)).text();
    assert.match(gh, /GMAIL_REFRESH_TOKEN/);
    assert.doesNotMatch(gh, /GOOGLE_DRIVE_REFRESH_TOKEN/);
  });
});

test('without workspace access the link is the site 404, like every workspace page', async () => {
  await withServer(async ({ base, sessions }) => {
    sessions.b = { user: { id: 7, username: 'nat', role: 'admin' } };
    const r = await fetch(base + '/workspace/backup/drive/connect', { redirect: 'manual', headers: { 'x-test-session': 'b' } });
    assert.equal(r.status, 404);
  });
});
