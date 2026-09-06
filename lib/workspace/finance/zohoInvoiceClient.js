// Arrington AI Workspace: Zoho Invoice API client (EU data centre).
//
// Read-only integration for Arrington's Zoho Invoice account.
// Three scopes, all read-only: invoices, payments, contacts. No write
// scope is requested and none would be granted by the registry's
// MONEY_ACTION_CLASS_NEVER_BUILT guard.
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

const READ_SCOPES = ['ZohoInvoice.invoices.READ', 'ZohoInvoice.payments.READ', 'ZohoInvoice.contacts.READ'];

// In-memory access token cache. Invalidated when the token is within
// 60 seconds of expiry so a sync never starts with a stale token.
let _cachedAccessToken = null;
let _cachedAccessTokenExpiresAt = 0;

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: (process.env.ZOHO_INVOICE_CLIENT_ID || '').trim(),
    redirect_uri: CANONICAL_REDIRECT_URI,
    scope: READ_SCOPES.join(','),
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

async function _apiGet(path, accessToken, query = {}) {
  // organization_id is required as a query parameter on every request.
  // The header is kept as well because it is harmless and some Zoho
  // endpoints accept it, but the query parameter is the one this API
  // actually honours.
  const qs = new URLSearchParams({ organization_id: ORG_ID, ...query }).toString();
  const url = `${API_BASE}${path}?${qs}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'X-com-zoho-invoice-organizationid': ORG_ID,
      Accept: 'application/json'
    }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.message || json.code || res.statusText;
    throw new Error(`Zoho Invoice API ${path} failed (${res.status}): ${msg}`);
  }
  return json;
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

module.exports = {
  READ_SCOPES,
  CANONICAL_REDIRECT_URI,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getAccessToken,
  clearTokenCache,
  getInvoices,
  getPayments,
  getContacts
};
