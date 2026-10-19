'use strict';

// One link that mints the refresh token the weekly database backup needs
// (GOOGLE_DRIVE_REFRESH_TOKEN on the db-backup-to-drive service), in place of
// the OAuth Playground's copy and paste (Tom, 19/10/2026).
//
// It reuses the Gmail OAuth client and its registered callback because the
// backup service already authenticates with that client's id and secret
// (Railway references to GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET), and a
// refresh token only works with the client that issued it. Nothing is
// stored: the token is shown once, like the Gmail one.
//
// Never revoke a token from here. Google keeps one grant per person per
// client, so revoking this token could also cut off the Gmail connector,
// which holds a token from the same client for the same account.

const gmailClient = require('./email/gmailClient');

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const PURPOSE = 'drive_backup';
const TARGET = { service: 'db-backup-to-drive', variable: 'GOOGLE_DRIVE_REFRESH_TOKEN' };
const OWNER_HINT = 'tom@arringtonconsultancy.com';

const val = (env, k) => String((env && env[k]) || '').trim();

function missingCredentials(env = process.env) {
  return ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'].filter((k) => !val(env, k));
}

function buildAuthorizeUrl(state, env = process.env) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: val(env, 'GMAIL_CLIENT_ID'),
    redirect_uri: gmailClient.CANONICAL_REDIRECT_URI,
    // drive.file alone: the backup sees only the files it created. No
    // include_granted_scopes, so the token carries none of the Gmail access
    // this client already holds.
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    login_hint: OWNER_HINT,
    state
  });
  return `${gmailClient.AUTH_URL}?${params.toString()}`;
}

// Judged before anything is shown. Google's consent screen lets a person
// untick a box, and a token without Drive access would fail the backup a
// week later; a token carrying more than Drive files does not belong on the
// backup service at all.
function assessGrant(tokens) {
  const scopes = String((tokens && tokens.scope) || '').split(/\s+/).filter(Boolean);
  if (!tokens || !tokens.refresh_token) {
    return { ok: false, message: 'Google returned no refresh token. Open the link again and approve on the consent screen.' };
  }
  if (!scopes.includes(SCOPE)) {
    return { ok: false, message: 'Google did not grant access to Drive files (the box on the consent screen may have been unticked). Open the link again and tick it.' };
  }
  const extra = scopes.filter((s) => s !== SCOPE);
  if (extra.length) {
    return { ok: false, message: `Google returned a token that can do more than the backup needs (${extra.join(', ')}), so it is not shown. Nothing was changed.` };
  }
  return { ok: true, refreshToken: tokens.refresh_token, scope: SCOPE };
}

module.exports = { SCOPE, PURPOSE, TARGET, OWNER_HINT, missingCredentials, buildAuthorizeUrl, assessGrant };
