// Arrington AI Workspace: Zoho Invoice API client (EU data centre).
//
// Integration for Arrington's Zoho Invoice account. Reads (invoices,
// customer payments, contacts) are always available once the three
// credentials are set. WRITES (create a customer, create an invoice,
// email an invoice to the customer) exist since 06/09/2026 on Tom's
// instruction and are gated on ENABLE_ZOHO_INVOICE_WRITES being exactly
// 'true'. With the flag unset every write function throws before any
// network call, the authorize URL requests read scopes only, and the
// token Zoho issues cannot write. Switching the flag on is a separate,
// deliberate act, and a token issued while it was off has to be
// reissued (reconnect) before a write can succeed.
//
// The writes are HUMAN actions: a person fills a form in the workspace
// and presses the button. No AI path reaches them (see
// routes/workspace.js), the same rule Scott's finance area follows for
// Chloe raising an invoice. Nothing here can DELETE or VOID anything,
// and the registry's MONEY_ACTION_CLASS_NEVER_BUILT still applies: an
// invoice asks a customer for money; it moves none.
//
// CREDENTIAL MODEL: unlike Xero (whose tokens are stored encrypted in
// the database), Zoho's refresh token lives in the Railway environment
// variable ZOHO_INVOICE_REFRESH_TOKEN, set once by Tom after the
// one-time OAuth dance. Access tokens (1-hour expiry) are cached in
// memory and refreshed transparently. Nothing is written to the database;
// the account row in workspace_finance_accounts is used for sync-status
// tracking only.
//
// SETUP (one-time, Tom's action):
//   1. Set ZOHO_INVOICE_CLIENT_ID and ZOHO_INVOICE_CLIENT_SECRET in
//      Railway.
//   2. Deploy this code.
//   3. Visit /workspace/finance/zoho/connect while logged in.
//   4. Authorise in Zoho, get redirected back to /zoho/callback.
//   5. Callback displays the refresh token ONCE. Copy it.
//   6. Set ZOHO_INVOICE_REFRESH_TOKEN in Railway.
//   7. Redeploy. The integration is live.
//   To enable writes: set ENABLE_ZOHO_INVOICE_WRITES=true, redeploy,
//   then reconnect (step 3 onwards) so the token carries CREATE scopes.
//
// REDIRECT URI: fixed to the canonical host. Never constructed from the
// request object in the callback (Zoho requires it to match exactly what
// is registered in the app).

const CANONICAL_REDIRECT_URI = 'https://www.arringtonconsultancy.com/workspace/finance/zoho/callback';
const AUTH_URL = 'https://accounts.zoho.eu/oauth/v2/auth';
const TOKEN_URL = 'https://accounts.zoho.eu/oauth/v2/token';
// Zoho's current API host is the data-centre-specific zohoapis domain,
// not the old invoice.zoho.eu/api host. The EU centre is
// www.zohoapis.eu, and the module path is /invoice/v3. The old host
// answered 200 with no `invoices` array, so a read looked like an empty
// account (0 invoices) when the account actually had invoices - the
// exact symptom seen on 06/09/2026. organization_id must travel as a
// QUERY parameter on every request (the X-com-zoho-invoice-... header
// alone is not honoured by this API), so it is added in _apiGet.
const API_BASE = 'https://www.zohoapis.eu/invoice/v3';
const ORG_ID = '20119226503';

// Scope names mirror Zoho's resource names: the customer payments
// endpoint is /customerpayments and its scope is
// ZohoInvoice.customerpayments.READ. 'ZohoInvoice.payments.READ' (the
// first version of this file) is not a Zoho scope, so a token issued
// with it reads invoices fine and gets 401 on /customerpayments, the
// exact symptom seen on the live page on 06/09/2026.
const READ_SCOPES = ['ZohoInvoice.invoices.READ', 'ZohoInvoice.customerpayments.READ', 'ZohoInvoice.contacts.READ'];

// CREATE only. Emailing an invoice sits under invoices.CREATE in Zoho's
// scope model. No UPDATE, no DELETE, no fullaccess: a test pins this.
const WRITE_SCOPES = ['ZohoInvoice.contacts.CREATE', 'ZohoInvoice.invoices.CREATE'];

const WRITES_FLAG = 'ENABLE_ZOHO_INVOICE_WRITES';

function writesEnabled(env = process.env) {
  return env[WRITES_FLAG] === 'true';
}

class ZohoWritesDisabledError extends Error {
  constructor() {
    super(`Zoho Invoice writes are disabled: ${WRITES_FLAG} is not 'true'. Nothing was sent to Zoho.`);
    this.name = 'ZohoWritesDisabledError';
  }
}

function assertWritesEnabled() {
  if (!writesEnabled()) throw new ZohoWritesDisabledError();
}

// The scopes the next consent will ask for. Read-only unless the writes
// flag is on, so a token issued in the default state cannot write even
// if the flag is turned on later without a reconnect.
function requestedScopes(env = process.env) {
  return writesEnabled(env) ? [...READ_SCOPES, ...WRITE_SCOPES] : [...READ_SCOPES];
}

// In-memory access token cache. Invalidated when the token is within
// 60 seconds of expiry so a sync never starts with a stale token.
let _cachedAccessToken = null;
let _cachedAccessTokenExpiresAt = 0;

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: (process.env.ZOHO_INVOICE_CLIENT_ID || '').trim(),
    redirect_uri: CANONICAL_REDIRECT_URI,
    scope: requestedScopes().join(','),
    access_type: 'offline',
    // prompt=consent forces Zoho to issue a NEW refresh token on every
    // authorisation. Without it, Zoho returns a refresh token only on
    // the very first consent for this client+scope and nothing on any
    // reconnect, so a rotate or a retry would render no token at all.
    prompt: 'consent',
    state
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function _tokenPost(body) {
  // Trim every credential read: a Railway variable stored with a
  // trailing newline (a documented failure mode on this project) would
  // otherwise be sent verbatim and rejected by Zoho as invalid_code.
  const clientId = (process.env.ZOHO_INVOICE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.ZOHO_INVOICE_CLIENT_SECRET || '').trim();
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(`Zoho token request failed (${res.status}): ${json.error || res.statusText}`);
  }
  return json;
}

// Exchange the one-time authorization code for tokens. Returns the full
// token response including refresh_token, displayed once by the callback
// route for Tom to copy into Railway.
async function exchangeCodeForTokens(code) {
  return _tokenPost({
    grant_type: 'authorization_code',
    code,
    redirect_uri: CANONICAL_REDIRECT_URI
  });
}

// Refresh the access token using the refresh token from env. Caches the
// result; concurrent callers wait on the first refresh rather than each
// making their own request.
let _refreshPromise = null;
async function getAccessToken() {
  const now = Date.now();
  if (_cachedAccessToken && now < _cachedAccessTokenExpiresAt - 60000) {
    return _cachedAccessToken;
  }
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const refreshToken = (process.env.ZOHO_INVOICE_REFRESH_TOKEN || '').trim();
    if (!refreshToken) throw new Error('ZOHO_INVOICE_REFRESH_TOKEN is not set');
    const json = await _tokenPost({ grant_type: 'refresh_token', refresh_token: refreshToken });
    _cachedAccessToken = json.access_token;
    _cachedAccessTokenExpiresAt = Date.now() + (json.expires_in || 3600) * 1000;
    return _cachedAccessToken;
  })();
  try {
    const token = await _refreshPromise;
    return token;
  } finally {
    _refreshPromise = null;
  }
}

// Invalidate the in-memory token cache (called on disconnect).
function clearTokenCache() {
  _cachedAccessToken = null;
  _cachedAccessTokenExpiresAt = 0;
  _refreshPromise = null;
}

function _headers(accessToken, extra = {}) {
  return {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    'X-com-zoho-invoice-organizationid': ORG_ID,
    Accept: 'application/json',
    ...extra
  };
}

async function _readJson(res, path) {
  const json = await res.json().catch(() => ({}));
  // Zoho answers 200 with a non-zero `code` for some application-level
  // refusals, so both signals are treated as failure.
  if (!res.ok || (typeof json.code === 'number' && json.code !== 0)) {
    const msg = json.message || json.code || res.statusText;
    throw new Error(`Zoho Invoice API ${path} failed (${res.status}): ${msg}`);
  }
  return json;
}

async function _apiGet(path, accessToken, query = {}) {
  // organization_id is required as a query parameter on every request.
  // The header is kept as well because it is harmless and some Zoho
  // endpoints accept it, but the query parameter is the one this API
  // actually honours.
  const qs = new URLSearchParams({ organization_id: ORG_ID, ...query }).toString();
  const url = `${API_BASE}${path}?${qs}`;
  const res = await fetch(url, { headers: _headers(accessToken) });
  return _readJson(res, path);
}

// Every write goes through here and nowhere else, so the flag check
// cannot be forgotten by a new caller. JSON body, as Zoho's v3 docs show.
async function _apiPost(path, accessToken, body) {
  assertWritesEnabled();
  const qs = new URLSearchParams({ organization_id: ORG_ID }).toString();
  const url = `${API_BASE}${path}?${qs}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: _headers(accessToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
  return _readJson(res, path);
}

// Returns invoices page. status: 'all' | 'overdue' | 'paid' | 'unpaid'.
async function getInvoices(accessToken, { page = 1, status = 'all' } = {}) {
  const query = { page, per_page: 200 };
  if (status !== 'all') query.status = status;
  const json = await _apiGet('/invoices', accessToken, query);
  return json.invoices || [];
}

// Returns customer payments page.
async function getPayments(accessToken, { page = 1 } = {}) {
  const json = await _apiGet('/customerpayments', accessToken, { page, per_page: 200 });
  return json.customerpayments || [];
}

// Returns contacts (customers).
async function getContacts(accessToken, { page = 1 } = {}) {
  const json = await _apiGet('/contacts', accessToken, { page, per_page: 200 });
  return json.contacts || [];
}

// ---- Writes (flag-gated, human-initiated) ----------------------------

// Create a customer. Zoho needs a contact_name; the email goes on a
// primary contact person so "email the invoice" has somewhere to send.
async function createContact(accessToken, { name, email }) {
  const contactName = String(name || '').trim();
  const emailAddr = String(email || '').trim();
  if (!contactName) throw new Error('A customer name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr)) throw new Error('A valid customer email address is required.');
  const json = await _apiPost('/contacts', accessToken, {
    contact_name: contactName,
    contact_type: 'customer',
    contact_persons: [{ email: emailAddr, is_primary_contact: true }]
  });
  return json.contact;
}

// Create a DRAFT invoice: one line for the job, at the amount given.
// amountPounds is a decimal string or number in GBP; Zoho takes major
// units. Draft only: nothing reaches the customer until emailInvoice.
async function createInvoice(accessToken, { customerId, description, amountPounds, dueDate = '', notes = '' }) {
  const id = String(customerId || '').trim();
  const desc = String(description || '').trim();
  const amount = Number(amountPounds);
  if (!id) throw new Error('A customer is required.');
  if (!desc) throw new Error('A description of the job is required.');
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) throw new Error('The amount must be a positive number of pounds.');
  const body = {
    customer_id: id,
    line_items: [{ name: desc.slice(0, 100), description: desc, rate: Math.round(amount * 100) / 100, quantity: 1 }]
  };
  if (String(dueDate || '').trim()) {
    const dd = String(dueDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dd)) throw new Error('The due date must be a date (YYYY-MM-DD).');
    // Zoho dates the invoice today and refuses a due date before it, with
    // a message that reads as a fault. Say it plainly, before any call.
    const today = new Date().toISOString().slice(0, 10);
    if (dd < today) throw new Error(`The due date must be today (${today}) or later.`);
    body.due_date = dd;
  }
  if (String(notes).trim()) body.notes = String(notes).trim().slice(0, 1000);
  const json = await _apiPost('/invoices', accessToken, body);
  return json.invoice;
}

// Email an existing invoice to the given addresses using Zoho's default
// invoice email template. This is the step that reaches the customer,
// which is why the route confirms it separately from creating a draft.
async function emailInvoice(accessToken, invoiceId, toEmails) {
  const id = String(invoiceId || '').trim();
  const to = (Array.isArray(toEmails) ? toEmails : [toEmails]).map((e) => String(e || '').trim()).filter(Boolean);
  if (!id) throw new Error('An invoice id is required.');
  if (!to.length || !to.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) throw new Error('A valid recipient email address is required.');
  const json = await _apiPost(`/invoices/${encodeURIComponent(id)}/email`, accessToken, { to_mail_ids: to, send_from_org_email_id: true });
  return { ok: true, message: json.message || 'sent' };
}

module.exports = {
  READ_SCOPES,
  WRITE_SCOPES,
  WRITES_FLAG,
  CANONICAL_REDIRECT_URI,
  ZohoWritesDisabledError,
  writesEnabled,
  requestedScopes,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getAccessToken,
  clearTokenCache,
  getInvoices,
  getPayments,
  getContacts,
  createContact,
  createInvoice,
  emailInvoice
};
