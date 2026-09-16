// Arrington AI Workspace: the authorised Drive record connector
// (15/09/2026).
//
// Reads REGISTERED spreadsheets, read-only, as a service account that has
// been shared those files one at a time. It is inert until three things
// are true at once: the flag is on, a credential is present, and the file
// is in the register. Merging it changes nothing.
//
// WHY A SERVICE ACCOUNT RATHER THAN spreadsheets.readonly ON TOM'S OWN
// ACCOUNT, which is the whole point of Tom's instruction:
//
//   spreadsheets.readonly is a RESTRICTED scope granting read access to
//   EVERY spreadsheet the authorising user can open. Pinning an id in this
//   file restricts our code and not Google's grant, so a bug, a later edit
//   or anyone holding the refresh token could read any sheet Tom can see,
//   including the controlled Brain records and other clients' files.
//
//   A service account has no Drive of its own and starts with access to
//   nothing. It can read exactly the files that have been SHARED with its
//   address. So the boundary is an access control list held by Google and
//   visible to Tom in the Drive sharing dialog, not a constant in our
//   source. Effective authority is scope INTERSECT what is shared, and
//   what is shared is one sheet. Revoking is unsharing, and it is instant.
//
//   The cost, stated rather than buried: a service-account key is a
//   long-lived credential. It lives only in Railway, it is never logged,
//   and its blast radius is exactly the files shared with it, which is one
//   read-only sheet. DOMAIN-WIDE DELEGATION MUST NEVER BE ENABLED on this
//   account: that would let it impersonate any user in the Workspace and
//   would destroy the entire argument above.
//
// The alternative that is also genuinely per-file is drive.file plus the
// Google Picker (non-sensitive, per-file, and Picker.setFileIds can grant
// a known id directly). It is rejected here only because it needs an
// interactive browser grant bound to a user token, which is the wrong
// shape for a server reading one sheet; it is the right answer if this
// ever becomes "let Tom pick a file".

const crypto = require('crypto');
const { URLSearchParams } = require('url');
const register = require('./register');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// Read-only, and the narrowest of the read scopes. Note what makes this
// safe is the service account's empty ACL, not this string: see the header.
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

// WHICH FILES MAY BE READ IS NO LONGER A CONSTANT HERE. It is the
// authorised-record register (./register.js), a code-declared allowlist,
// and every read is checked against it. That replaced a single pinned id
// on 15/09/2026 so Ruth can use other authorised Arrington records later
// without loosening anything: the register generalises the guarantee
// rather than removing it, and the Google-side ACL is unchanged.
//
// There is deliberately NO files.list, NO files/search and no folder
// traversal in this module. It can read a file it is told about and
// cannot find one it is not.

// Every credential read is trimmed. A Railway variable stored with a
// trailing newline has now cost this project two separate sessions (the
// Market Ready Test key, then the Zoho refresh token).
function env(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

function isEnabled() {
  return env('ENABLE_WORKSPACE_DRIVE_RECORDS') === 'true';
}

// An override exists so a registered record can MOVE (a file recreated,
// a copy replacing it) without a deploy, but it can only ever name a
// registered record's own id: an override pointing anywhere else is
// refused by assertRegistered below, exactly like any other caller.
function overrideFor(recordId) {
  return env(`DRIVE_RECORD_${String(recordId).toUpperCase()}_FILE_ID`);
}

// The credential, as either one JSON blob (the file Google hands you,
// optionally base64'd because a PEM in a dashboard field is fragile) or
// two separate variables. Returns null when absent; NEVER throws with the
// key in the message.
function credential() {
  const raw = env('DRIVE_RECORDS_SERVICE_ACCOUNT_JSON');
  if (raw) {
    let text = raw;
    if (!text.startsWith('{')) {
      try { text = Buffer.from(raw, 'base64').toString('utf8'); } catch (_) { return null; }
    }
    try {
      const parsed = JSON.parse(text);
      const email = String(parsed.client_email || '').trim();
      const key = String(parsed.private_key || '');
      if (!email || !key) return null;
      return { email, key: key.replace(/\\n/g, '\n') };
    } catch (_) { return null; }
  }
  const email = env('DRIVE_RECORDS_CLIENT_EMAIL');
  const key = env('DRIVE_RECORDS_PRIVATE_KEY');
  if (!email || !key) return null;
  return { email, key: key.replace(/\\n/g, '\n') };
}

function isConfigured() { return credential() != null; }

// Failure classes, so an operator is never left guessing whether waiting
// helps. Same reasoning as the Meta connector's taxonomy: throttling is
// fixed by waiting and an unshared file never is.
class HoursError extends Error {
  constructor(kind, message, { retryable = false } = {}) {
    super(message);
    this.name = 'HoursError';
    this.kind = kind;
    this.retryable = retryable;
  }
}

function classify(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body || {});
  if (status === 401) return new HoursError('auth_failed', 'the service account credential was refused by Google', { retryable: false });
  if (status === 403) {
    if (/quota|rate/i.test(text)) return new HoursError('rate_limited', 'Google is throttling requests to the Sheets API', { retryable: true });
    return new HoursError('permission_denied', 'the service account is not allowed to read that spreadsheet; check the sheet is shared with it', { retryable: false });
  }
  if (status === 404) return new HoursError('not_found', 'the spreadsheet was not found', { retryable: false });
  if (status === 429) return new HoursError('rate_limited', 'Google is throttling requests to the Sheets API', { retryable: true });
  if (status >= 500) return new HoursError('unreachable', `Google returned ${status}`, { retryable: true });
  return new HoursError('malformed_response', `Google returned ${status}`, { retryable: false });
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// A signed JWT assertion, exchanged for a short-lived access token. No
// refresh token exists in this flow, which is one fewer long-lived secret
// than the OAuth connectors carry.
function buildAssertion(cred, now) {
  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: cred.email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat,
    exp: iat + 3600
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  let signature;
  try {
    signature = signer.sign(cred.key);
  } catch (_) {
    // Deliberately says nothing about the key's contents.
    throw new HoursError('auth_failed', 'the service account private key could not be used to sign a request; check it was pasted complete', { retryable: false });
  }
  return `${header}.${claims}.${base64url(signature)}`;
}

// Injectable for tests. Nothing in this module reaches the network when
// the flag is off: the guard is before any fetch.
let fetchImpl = (...args) => fetch(...args);
function __setFetchForTests(fn) { fetchImpl = fn; }
function __resetFetchForTests() { fetchImpl = (...args) => fetch(...args); }

let tokenCache = null;
async function accessToken(now = Date.now()) {
  if (tokenCache && tokenCache.expires > now + 60000) return tokenCache.token;
  const cred = credential();
  if (!cred) throw new HoursError('not_configured', 'no service account credential is set', { retryable: false });
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: buildAssertion(cred, now)
  });
  let res;
  try {
    res = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  } catch (err) {
    throw new HoursError('unreachable', `Google could not be reached: ${err && err.message ? err.message : 'network error'}`, { retryable: true });
  }
  const text = await res.text();
  if (!res.ok) throw classify(res.status, text);
  let json;
  try { json = JSON.parse(text); } catch (_) { throw new HoursError('malformed_response', 'the token reply was not JSON', { retryable: false }); }
  if (!json.access_token) throw new HoursError('auth_failed', 'no access token was returned', { retryable: false });
  tokenCache = { token: json.access_token, expires: now + (Number(json.expires_in || 3600) * 1000) };
  return tokenCache.token;
}

function __clearTokenCacheForTests() { tokenCache = null; }

async function apiGet(path, now) {
  const token = await accessToken(now);
  let res;
  try {
    res = await fetchImpl(`${SHEETS_API}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    throw new HoursError('unreachable', `Google could not be reached: ${err && err.message ? err.message : 'network error'}`, { retryable: true });
  }
  const text = await res.text();
  if (!res.ok) throw classify(res.status, text);
  try { return JSON.parse(text); } catch (_) { throw new HoursError('malformed_response', 'the Sheets reply was not JSON', { retryable: false }); }
}

// The last good read, held in memory only so it dies with the process.
// It exists for ONE purpose: when a read fails, an answer built from it
// must say out loud that it is not current. It is never returned as though
// it were fresh, and it is never written to the database.
const lastGood = new Map();
function __clearCacheForTests() { lastGood.clear(); }
function cachedRead(recordId) { return lastGood.get(String(recordId)) || null; }

// Reads every tab of ONE REGISTERED record. Two calls: the tab list, then
// the values. The tab list is read rather than assumed because the hours
// log's own summary says it is fed by a separate "Hours Log" tab, and a
// hard-coded range that silently returns nothing is indistinguishable
// from an empty record.
async function readRecord(recordId, { now = Date.now() } = {}) {
  const entry = register.byId(recordId);
  if (!entry) throw new HoursError('not_registered', `"${recordId}" is not an authorised Drive record`, { retryable: false });
  if (entry.kind !== 'sheet') throw new HoursError('not_registered', `"${recordId}" is not a spreadsheet, and this connector reads only spreadsheets`, { retryable: false });
  if (!isEnabled()) throw new HoursError('disabled', 'the Drive record connector is switched off (ENABLE_WORKSPACE_DRIVE_RECORDS is not "true")', { retryable: false });
  if (!isConfigured()) throw new HoursError('not_configured', 'no service account credential is set for the Drive records', { retryable: false });

  // The register is the authority on which file this is, including when
  // an override names it. assertRegistered throws on anything else, so a
  // mis-set variable cannot widen what is readable by one character.
  const id = overrideFor(recordId) || entry.fileId;
  register.assertRegistered(id);

  const meta = await apiGet(`${encodeURIComponent(id)}?fields=properties.title,sheets.properties.title`, now);
  const titles = (meta.sheets || []).map((s) => s && s.properties && s.properties.title).filter(Boolean);
  if (!titles.length) throw new HoursError('malformed_response', 'the spreadsheet reported no tabs', { retryable: false });

  const ranges = titles.map((t) => `ranges=${encodeURIComponent(t)}`).join('&');
  const values = await apiGet(`${encodeURIComponent(id)}/values:batchGet?${ranges}&majorDimension=ROWS`, now);
  const rows = [];
  for (const range of values.valueRanges || []) {
    for (const row of range.values || []) rows.push(row);
  }

  const result = {
    recordId: entry.id,
    spreadsheetId: id,
    registeredTitle: entry.title,
    title: (meta.properties && meta.properties.title) || '',
    tabs: titles,
    rows,
    readAt: new Date(now).toISOString()
  };
  lastGood.set(entry.id, result);
  return result;
}

// One line for the boot log. Reports each gate separately and the
// credential by presence and length only, never any part of its contents.
function describeStatus() {
  const bits = [];
  bits.push(isEnabled() ? "flag on (ENABLE_WORKSPACE_DRIVE_RECORDS='true')" : 'flag OFF (ENABLE_WORKSPACE_DRIVE_RECORDS is not "true"): the connector is inert and reads nothing');
  const cred = credential();
  if (!cred) {
    bits.push('no service account credential set (DRIVE_RECORDS_SERVICE_ACCOUNT_JSON, or DRIVE_RECORDS_CLIENT_EMAIL plus DRIVE_RECORDS_PRIVATE_KEY)');
  } else {
    bits.push(`service account ${cred.email} (private key present, ${cred.key.length} chars)`);
  }
  bits.push(`${register.list().length} authorised record(s): ${register.list().map((r) => r.id).join(', ')}`);
  bits.push(`scopes required by the register: ${register.requiredScopes().join(', ')}`);
  bits.push(isEnabled() && !!cred ? 'RESULT: the authorised records can be read' : 'RESULT: no Drive record will be read');
  return `Workspace Drive records: ${bits.join(' | ')}`;
}

module.exports = {
  readRecord,
  cachedRead,
  isEnabled,
  isConfigured,
  describeStatus,
  register,
  HoursError,
  classify,
  buildAssertion,
  credential,
  SCOPE,
  __setFetchForTests,
  __resetFetchForTests,
  __clearCacheForTests,
  __clearTokenCacheForTests
};
