'use strict';

// Connecting the demo's live address (Tom, 16/10/2026): the one-off step
// that gives the office a Gmail refresh token for the demo mailbox. Tom
// signs in from the office as himself, Google asks which account to allow,
// and the callback shows the token once for him to copy into Railway as
// TAXI_OFFICE_GMAIL_REFRESH_TOKEN. Nothing is stored here.
//
// The callback checks the account Google returned is the demo address
// itself. Any other account (Tom's own inbox, chosen by mistake in Google's
// account picker) is refused: its token is revoked on the spot and never
// shown, so it cannot end up in Railway.
//
// Reads only TAXI_OFFICE_GMAIL_CLIENT_ID and _SECRET, like the driver.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
// Read the inbox, and save replies as drafts. Nothing that sends on its own
// (gmail.compose can, and the driver never calls send; a test pins it).
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose'];
const VARS = ['TAXI_OFFICE_GMAIL_CLIENT_ID', 'TAXI_OFFICE_GMAIL_CLIENT_SECRET'];

const val = (env, k) => String(env[k] || '').trim();
const missing = (env = process.env) => VARS.filter((k) => !val(env, k));

function authorizeUrl({ env = process.env, redirectUri, state, loginHint }) {
  const q = new URLSearchParams({
    client_id: val(env, 'TAXI_OFFICE_GMAIL_CLIENT_ID'),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    // A fresh consent every time, so Google always issues a refresh token.
    prompt: 'consent select_account',
    state
  });
  if (loginHint) q.set('login_hint', loginHint);
  return `${AUTH_URL}?${q.toString()}`;
}

async function revoke(token, fetch) {
  try {
    await fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() });
  } catch (e) {
    // Best effort; the token is not shown either way.
  }
}

// -> { ok: true, refreshToken, account, scope }
//  | { ok: false, account?, message }
async function finish({ env = process.env, code, redirectUri, expected, fetch = globalThis.fetch }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: val(env, 'TAXI_OFFICE_GMAIL_CLIENT_ID'),
      client_secret: val(env, 'TAXI_OFFICE_GMAIL_CLIENT_SECRET'),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString()
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok || !t.access_token) return { ok: false, message: `Google did not issue a token (${t.error || res.status}).` };
  const p = await fetch(PROFILE_URL, { headers: { Authorization: `Bearer ${t.access_token}` } });
  const profile = await p.json().catch(() => ({}));
  const account = profile.emailAddress ? String(profile.emailAddress).toLowerCase() : '';
  if (!account || account !== expected) {
    await revoke(t.refresh_token || t.access_token, fetch);
    return {
      ok: false,
      account,
      message: account
        ? `That was ${account}, not the demo mailbox ${expected}. Its token has been cancelled and is not shown. Start again and choose ${expected} in Google's account list.`
        : 'Google did not say which mailbox that was, so its token has been cancelled and is not shown. Start again.'
    };
  }
  if (!t.refresh_token) return { ok: false, account, message: 'Google did not issue a refresh token. Start again and press Allow on the consent screen.' };
  return { ok: true, refreshToken: t.refresh_token, account, scope: t.scope || '' };
}

module.exports = { authorizeUrl, finish, missing, SCOPES, VARS };
