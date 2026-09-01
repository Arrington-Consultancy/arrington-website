// Arrington AI Workspace: Xero API client (the ANNA Money bank-feed
// route). Real HTTP calls against Xero's actual OAuth 2.0 and
// Accounting API endpoints, per developer.xero.com. This module is
// exercised end to end only once Tom has:
//
//   1. Registered a Xero developer app (developer.xero.com/app/manage)
//      with redirect URI {site}/api/workspace/finance/xero/callback,
//      and set XERO_CLIENT_ID / XERO_CLIENT_SECRET on the deployment;
//   2. Set up the ANNA -> Xero bank feed inside ANNA itself (ANNA's
//      "Xero integration" setting), so a Xero organisation actually
//      has ANNA's transactions flowing into it;
//   3. Completed the Xero OAuth consent screen himself, connecting that
//      organisation to this app (see routes/workspace.js
//      /workspace/finance/xero/connect).
//
// Nothing here can run without step 1 (registry.isConfigured gates the
// whole connect flow on it), and nothing meaningful happens without
// steps 2 and 3. This is deliberate: the code is ready, the connection
// is Tom's to make.
//
// KNOWN LIMITATION, stated rather than papered over: Xero's Accounting
// API does not expose a "this bank transaction is a recurring payment"
// flag on raw bank-feed lines (that concept exists for invoices, as
// Repeating Invoices, a different object this client does not read).
// getBankTransactions() therefore never sets is_recurring / a recurring
// group from anything other than a genuine Xero signal, which today
// means it leaves them false/empty rather than guessing from payee/
// amount patterns. Guessing would be inventing a fact the source did
// not provide, which this codebase treats as a real defect elsewhere
// (Scott's brain gaps, the Market Ready Test rebuild). "Recurring/
// regular payments where available" in the decision doc is honoured by
// leaving the field genuinely empty when Xero does not say so, not by
// approximating it.

const AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const CONNECTIONS_URL = 'https://api.xero.com/connections';
const API_BASE = 'https://api.xero.com/api.xro/2.0';

const { PROVIDERS } = require('./registry');

function scopeString() {
  return PROVIDERS.xero.readScopes.join(' ');
}

function buildAuthorizeUrl({ redirectUri, state }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.XERO_CLIENT_ID || '',
    redirect_uri: redirectUri,
    scope: scopeString(),
    state
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function tokenRequest(bodyParams) {
  const clientId = process.env.XERO_CLIENT_ID || '';
  const clientSecret = process.env.XERO_CLIENT_SECRET || '';
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`
    },
    body: new URLSearchParams(bodyParams).toString()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Xero token request failed (${res.status}): ${json.error_description || json.error || res.statusText}`);
  }
  return json; // { access_token, refresh_token, expires_in, token_type, scope }
}

function exchangeCodeForTokens(code, redirectUri) {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

function refreshTokens(refreshToken) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

async function xeroApiGet(path, { accessToken, tenantId, query = {} }) {
  const qs = new URLSearchParams(query).toString();
  const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept: 'application/json'
    }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Xero API ${path} failed (${res.status}): ${json.Message || json.Detail || res.statusText}`);
  }
  return json;
}

// The organisation(s) this token is authorised for. Returned tenantId is
// what every subsequent Accounting API call must carry.
async function getConnections(accessToken) {
  const res = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
  });
  const json = await res.json().catch(() => []);
  if (!res.ok) throw new Error(`Xero connections request failed (${res.status})`);
  return json; // [{ id, tenantId, tenantType, tenantName, ... }]
}

// One bank account: the first BANK-type account, or the one matching
// XERO_BANK_ACCOUNT_ID if Tom has set it (useful once more than one bank
// feed exists in the organisation and ANNA's is not the only one).
async function getBankAccount({ accessToken, tenantId }) {
  const json = await xeroApiGet('/Accounts', { accessToken, tenantId, query: { where: 'Type=="BANK"' } });
  const accounts = json.Accounts || [];
  const preferred = process.env.XERO_BANK_ACCOUNT_ID
    ? accounts.find((a) => a.AccountID === process.env.XERO_BANK_ACCOUNT_ID)
    : null;
  return preferred || accounts[0] || null;
}

// The current balance for a named bank account, via Xero's Bank Summary
// report (the Accounting API's Accounts object does not carry a live
// balance field; Bank Summary is Xero's own documented way to get it).
async function getBankBalance({ accessToken, tenantId, bankAccountName, date }) {
  const json = await xeroApiGet('/Reports/BankSummary', {
    accessToken, tenantId, query: date ? { date } : {}
  });
  const report = (json.Reports || [])[0];
  if (!report) return null;
  const rows = (report.Rows || []).flatMap((r) => (r.RowType === 'Section' ? r.Rows || [] : [r]));
  const row = rows.find((r) => (r.Cells || [])[0] && r.Cells[0].Value === bankAccountName);
  if (!row) return null;
  const cells = row.Cells || [];
  const closing = cells[cells.length - 1];
  const value = closing ? parseFloat(String(closing.Value).replace(/,/g, '')) : null;
  return Number.isFinite(value) ? Math.round(value * 100) : null; // pence
}

// Recent bank transactions for the account, newest first, paged. Maps
// Xero's shape onto this repo's { externalId, date, amountPence,
// direction, payee, reference, category } shape. See the module header
// for why is_recurring is never set here.
async function getBankTransactions({ accessToken, tenantId, bankAccountId, modifiedSince, page = 1 }) {
  const headers = modifiedSince ? { 'If-Modified-Since': modifiedSince } : {};
  const url = `${API_BASE}/BankTransactions?where=${encodeURIComponent(`BankAccount.AccountID=Guid("${bankAccountId}")`)}&order=Date DESC&page=${page}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept: 'application/json',
      ...headers
    }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Xero BankTransactions request failed (${res.status}): ${json.Message || res.statusText}`);
  const txns = json.BankTransactions || [];
  return txns.map((t) => ({
    externalId: t.BankTransactionID,
    date: (t.DateString || t.Date || '').slice(0, 10),
    amountPence: Math.round((t.Total || 0) * 100),
    direction: t.Type === 'RECEIVE' ? 'in' : 'out',
    payee: (t.Contact && t.Contact.Name) || '',
    reference: t.Reference || '',
    category: ((t.LineItems || [])[0] && (t.LineItems[0].AccountCode || t.LineItems[0].Description)) || '',
    isRecurring: false,
    recurringGroup: ''
  }));
}

module.exports = {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshTokens,
  getConnections,
  getBankAccount,
  getBankBalance,
  getBankTransactions
};
