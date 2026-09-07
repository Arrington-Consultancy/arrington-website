// Arrington AI Workspace: Gmail API client for Tom's own mailbox.
//
// Tom's instruction (07/09/2026): "create a Gmail api we can use directly
// in Arrington Workspace". This is the connector. It reads the inbox of
// the Google Workspace account that authorised it (tom@) and, when the
// send flag is on, sends a message from it. Same credential model as the
// Zoho Invoice client and for the same reasons: the refresh token lives
// ONLY in the Railway variable GMAIL_REFRESH_TOKEN, set once by Tom after
// the one-time consent flow; access tokens (about an hour) are cached in
// memory and refreshed transparently; nothing is written to the database
// by this module.
//
// READS are always available once the three credentials are set. They
// use the gmail.readonly scope and nothing more: no modify, no labels, no
// settings, no delete. A token issued for reading cannot send.
//
// SENDING is gated on ENABLE_GMAIL_SEND being exactly 'true'. With the
// flag off, sendMessage throws before any network call and the consent
// flow asks for the read scope only, so a token issued in the default
// state cannot send even if the flag is turned on later without a
// reconnect. Sending is a HUMAN action from the Email page (a person
// writes it and presses the button, confirmed in the browser). No AI
// path reaches it, the same rule the Zoho writes follow.
//
// SETUP (one-time, Tom's action; the Email page repeats this):
//   1. In Google Cloud, a project whose OAuth consent screen is INTERNAL
//      (Workspace organisation). Internal matters twice over: the
//      gmail.readonly scope is "restricted" for external apps and would
//      need Google's security assessment, and an external app left in
//      Testing expires its refresh tokens after seven days. Internal
//      needs neither. Enable the Gmail API on the project.
//   2. Credentials: OAuth client ID, type Web application, authorised
//      redirect URI exactly CANONICAL_REDIRECT_URI below.
//   3. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in Railway; deploy.
//   4. Logged in as tom and unlocked, visit /workspace/email/gmail/connect,
//      approve in Google, and copy the refresh token the callback shows
//      ONCE into GMAIL_REFRESH_TOKEN in Railway. Railway redeploys.
//   To enable sending: set ENABLE_GMAIL_SEND=true, redeploy, reconnect so
//   the token carries the send scope.
//
// The existing Google OAuth client used by "Continue with Google" on the
// public checks is NOT reused: that one is External (it is for visitors),
// has no secret, and must stay that way. This is a separate client in a
// separate, Internal project.

const CANONICAL_REDIRECT_URI = 'https://www.arringtonconsultancy.com/workspace/email/gmail/callback';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

const READ_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const SEND_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];
const SEND_FLAG = 'ENABLE_GMAIL_SEND';
const ENV_KEYS = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];

// The headers a listing asks Google for. Nothing else about a message is
// requested by the read paths: format=metadata returns no body.
const METADATA_HEADERS = ['From', 'To', 'Subject', 'Date'];

function trimmed(env, key) { return String((env && env[key]) || '').trim(); }

function isConfigured(env = process.env) {
  return ENV_KEYS.every((k) => trimmed(env, k).length > 0);
}

function sendEnabled(env = process.env) {
  return env[SEND_FLAG] === 'true';
}

class GmailSendDisabledError extends Error {
  constructor() {
    super(`Sending email from the workspace is switched off: ${SEND_FLAG} is not 'true'. Nothing was sent.`);
    this.name = 'GmailSendDisabledError';
  }
}

function assertSendEnabled(env = process.env) {
  if (!sendEnabled(env)) throw new GmailSendDisabledError();
}

// The scopes the next consent will ask for. Read-only unless the send
// flag is on at the moment of consent.
function requestedScopes(env = process.env) {
  return sendEnabled(env) ? [...READ_SCOPES, ...SEND_SCOPES] : [...READ_SCOPES];
}

function buildAuthorizeUrl(state, env = process.env) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: trimmed(env, 'GMAIL_CLIENT_ID'),
    redirect_uri: CANONICAL_REDIRECT_URI,
    scope: requestedScopes(env).join(' '),
    // offline + consent: Google issues a refresh token only on a consent
    // it shows, and shows one only the first time unless asked. Without
    // prompt=consent a reconnect (rotation, or adding the send scope)
    // would come back with no refresh token at all.
    access_type: 'offline',
    prompt: 'consent',
    state
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function _tokenPost(body, env = process.env) {
  // Every credential read is trimmed: a Railway variable stored with a
  // trailing newline (a documented failure mode on this project) would
  // otherwise be sent verbatim and refused as invalid_client.
  const params = new URLSearchParams({
    client_id: trimmed(env, 'GMAIL_CLIENT_ID'),
    client_secret: trimmed(env, 'GMAIL_CLIENT_SECRET'),
    ...body
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    // Google's error text is short and carries no secret; the body of
    // the request (which does) is never echoed.
    throw new Error(`Google token request failed (${res.status}): ${json.error || res.statusText}${json.error_description ? `: ${json.error_description}` : ''}`);
  }
  return json;
}

// Exchange the one-time authorisation code for tokens. The callback route
// shows refresh_token once for Tom to copy into Railway.
async function exchangeCodeForTokens(code, env = process.env) {
  return _tokenPost({ grant_type: 'authorization_code', code, redirect_uri: CANONICAL_REDIRECT_URI }, env);
}

let _cachedAccessToken = null;
let _cachedAccessTokenExpiresAt = 0;
let _refreshPromise = null;

async function getAccessToken(env = process.env) {
  const now = Date.now();
  if (_cachedAccessToken && now < _cachedAccessTokenExpiresAt - 60000) return _cachedAccessToken;
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const refreshToken = trimmed(env, 'GMAIL_REFRESH_TOKEN');
    if (!refreshToken) throw new Error('GMAIL_REFRESH_TOKEN is not set');
    const json = await _tokenPost({ grant_type: 'refresh_token', refresh_token: refreshToken }, env);
    _cachedAccessToken = json.access_token;
    _cachedAccessTokenExpiresAt = Date.now() + (json.expires_in || 3600) * 1000;
    return _cachedAccessToken;
  })();
  try {
    return await _refreshPromise;
  } finally {
    _refreshPromise = null;
  }
}

function clearTokenCache() {
  _cachedAccessToken = null;
  _cachedAccessTokenExpiresAt = 0;
  _refreshPromise = null;
}

async function _readJson(res, path) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json.error || {};
    const detail = e.message || res.statusText || 'unknown error';
    const hint = res.status === 401
      ? ' (the stored token was refused: reconnect Gmail)'
      : (res.status === 403 && /insufficient|scope/i.test(detail) ? ' (the token lacks a scope it needs: reconnect Gmail)' : '');
    throw new Error(`Gmail API ${path} failed (${res.status}): ${detail}${hint}`);
  }
  return json;
}

async function _apiGet(path, accessToken, query = {}) {
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((item) => qs.append(k, item)); else if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  });
  const url = `${API_BASE}${path}${qs.toString() ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  return _readJson(res, path);
}

// Every send goes through here and nowhere else, so the flag check
// cannot be forgotten by a new caller.
async function _apiPost(path, accessToken, body, env = process.env) {
  assertSendEnabled(env);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return _readJson(res, path);
}

// --- reads ------------------------------------------------------------

async function getProfile(accessToken) {
  const json = await _apiGet('/profile', accessToken);
  return { emailAddress: json.emailAddress || '', messagesTotal: json.messagesTotal ?? null, threadsTotal: json.threadsTotal ?? null };
}

async function getInboxCounts(accessToken) {
  const json = await _apiGet('/labels/INBOX', accessToken);
  return { unread: json.messagesUnread ?? null, total: json.messagesTotal ?? null };
}

// Message ids in the inbox, newest first, optionally narrowed by a Gmail
// search (the same syntax as the search box: "from:x", "newer_than:7d").
async function listMessageIds(accessToken, { maxResults = 25, q = '', labelIds = ['INBOX'] } = {}) {
  const json = await _apiGet('/messages', accessToken, { maxResults: Math.min(Math.max(1, maxResults), 100), q, labelIds });
  return (json.messages || []).map((m) => ({ id: m.id, threadId: m.threadId }));
}

function headerValue(headers, name) {
  const h = (headers || []).find((x) => String(x.name || '').toLowerCase() === name.toLowerCase());
  return h ? String(h.value || '') : '';
}

// Headers and Google's own short snippet; no body is requested.
async function getMessageSummary(accessToken, id) {
  const json = await _apiGet(`/messages/${encodeURIComponent(id)}`, accessToken, { format: 'metadata', metadataHeaders: METADATA_HEADERS });
  const headers = json.payload && json.payload.headers;
  const labels = Array.isArray(json.labelIds) ? json.labelIds : [];
  return {
    id: json.id,
    threadId: json.threadId,
    from: headerValue(headers, 'From'),
    to: headerValue(headers, 'To'),
    subject: headerValue(headers, 'Subject'),
    date: json.internalDate ? new Date(Number(json.internalDate)) : null,
    snippet: String(json.snippet || ''),
    unread: labels.includes('UNREAD'),
    labels
  };
}

// The inbox as the Email page shows it. Each message is fetched
// independently so one failure costs one row, not the listing.
async function listInbox(accessToken, { maxResults = 25, q = '' } = {}) {
  const ids = await listMessageIds(accessToken, { maxResults, q });
  const results = await Promise.allSettled(ids.map((m) => getMessageSummary(accessToken, m.id)));
  const messages = [];
  let failed = 0;
  results.forEach((r) => { if (r.status === 'fulfilled') messages.push(r.value); else failed += 1; });
  messages.sort((a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));
  return { messages, failed };
}

// --- send ---------------------------------------------------------------

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Header values are single-line by construction: a newline in a subject
// or an address would otherwise let a caller inject extra headers.
function headerSafe(s) { return String(s || '').replace(/[\r\n]+/g, ' ').trim(); }

function encodeSubject(subject) {
  const clean = headerSafe(subject);
  // Non-ASCII subjects go as RFC 2047 encoded words.
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

// The RFC 822 message Gmail expects, base64url encoded, as the API's
// `raw` field. Plain text only: the workspace sends notes, not newsletters.
function buildRawMessage({ from, to, subject, text, replyTo = '' }) {
  const toAddr = headerSafe(to);
  if (!EMAIL_RE.test(toAddr)) throw new Error('A valid recipient email address is required.');
  const fromAddr = headerSafe(from);
  if (!EMAIL_RE.test(fromAddr)) throw new Error('A valid sender address is required.');
  const subj = headerSafe(subject);
  if (!subj) throw new Error('A subject is required.');
  const body = String(text || '').replace(/\r?\n/g, '\r\n');
  if (!body.trim()) throw new Error('The message is empty.');
  const lines = [
    `From: ${fromAddr}`,
    `To: ${toAddr}`,
    replyTo && EMAIL_RE.test(headerSafe(replyTo)) ? `Reply-To: ${headerSafe(replyTo)}` : null,
    `Subject: ${encodeSubject(subj)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body
  ].filter((l) => l !== null);
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

async function sendMessage(accessToken, { from, to, subject, text, replyTo = '' }, env = process.env) {
  assertSendEnabled(env);
  const raw = buildRawMessage({ from, to, subject, text, replyTo });
  const json = await _apiPost('/messages/send', accessToken, { raw }, env);
  return { id: json.id || '', threadId: json.threadId || '' };
}

module.exports = {
  CANONICAL_REDIRECT_URI,
  AUTH_URL,
  TOKEN_URL,
  API_BASE,
  READ_SCOPES,
  SEND_SCOPES,
  SEND_FLAG,
  ENV_KEYS,
  METADATA_HEADERS,
  GmailSendDisabledError,
  isConfigured,
  sendEnabled,
  requestedScopes,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getAccessToken,
  clearTokenCache,
  getProfile,
  getInboxCounts,
  listMessageIds,
  getMessageSummary,
  listInbox,
  buildRawMessage,
  sendMessage
};
