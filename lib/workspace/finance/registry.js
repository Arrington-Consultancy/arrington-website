// Arrington AI Workspace: business banking connector registry.
//
// REWORKED 1 September 2026 on Tom's explicit instruction: he does not
// currently use Xero, and this area must never require it or ask him to
// subscribe to it purely for the Workspace. The architecture is now
// ANNA-first, with Xero available only as an optional future
// accounting-system integration.
//
// INVESTIGATION (1 September 2026, this rework). Before building
// anything, checked what ANNA itself actually offers, in order:
//
//   1. A public ANNA developer API for third parties. Checked ANNA's own
//      GitHub organisation (github.com/anna-money): its public
//      repositories are internal engineering tooling (CI helpers,
//      Python test plugins, a UK sort-code validator) with no public
//      API client, SDK or Open Banking integration library. No public
//      developer portal analogous to Xero's exists.
//   2. Direct Open Banking retrieval via TrueLayer or another regulated
//      aggregator. Unchanged from the earlier finding: ANNA is
//      TrueLayer's CLIENT (reading other banks INTO ANNA), not a
//      provider TrueLayer or any other aggregator exposes for reading
//      OUT of ANNA. No public evidence to the contrary.
//   3. "ANNA for Accountants", ANNA's own real product: a practice
//      dashboard giving an invited accountant real-time transaction
//      access, once the account holder shares a connection. This is a
//      genuine authorised route but it is built around a human
//      accountant relationship (KYC checks, a VAT-filing bridge, client
//      invitations) rather than a machine-readable feed for a third
//      party application, and inventing an "accountant" relationship for
//      Arrington's own Workspace to use it would be a stretch of what it
//      is for.
//   4. ANNA's own account-holder statement export. This is the real,
//      simplest, fully authorised answer: inside the ANNA app, typing
//      "Get an account statement" lets the account holder choose a
//      period (any month, or full history since the account opened) and
//      download it as CSV or PDF. No accountant relationship, no third
//      party, no subscription, no OAuth. This is what
//      lib/workspace/finance/annaStatementCsv.js reads.
//
// CONCLUSION: the primary provider is 'anna_statement_csv' - Tom
// downloads a CSV from ANNA himself and uploads it here. 'xero' stays
// available for later, exactly as built previously, but is now
// explicitly optional and never required, defaulted, or referenced as
// if it were the real source. Only the account holder can do the ANNA
// export; nothing here can automate obtaining ANNA credentials, and
// nothing here scrapes or invents an ANNA API.
//
// The three structural rules below are unchanged from the original
// design and from lib/workspace/social/registry.js, and apply to BOTH
// providers:
//
// 1. LEAST PRIVILEGE. A statement upload is inherently read-only (it is
//    a file, not a credential); the Xero OAuth scope requested is
//    read-only accounting data. Nothing here requests or implies a
//    scope that could create, update or pay anything.
// 2. CONSEQUENTIAL ACTIONS ARE HUMAN, AND HERE THEY DO NOT EXIST AT ALL.
//    No payment, transfer, beneficiary or card-control capability,
//    route, approval-queue path or database column exists anywhere in
//    this area, for either provider.
// 3. A CREDENTIAL IS NOT A RETRIEVAL. For Xero, connector state carries
//    the last successful sync separately from whether a credential
//    exists. For the CSV route there is no credential at all - "an
//    upload happened" and "an upload was parsed successfully" are still
//    kept as separate facts (a malformed file is a failed import, not a
//    silently empty one).
//
// Nothing here reaches the Scott demonstration, and nothing in Scott
// reaches this: Scott's fictional finance material (07-series) has no
// credential path and no code path into real Arrington banking data.

const READ = 'read';
const ANALYSE = 'analyse';
const AUTONOMOUS_CAPABILITIES = [READ, ANALYSE];

// Named so a reviewer can grep for it, and so a test can assert none of
// these is ever a capability of either connector. There is no
// approval-queue route for any of these, unlike social's
// ACTION_CLASS_HUMAN list: a payment prepared "for a human to carry out"
// is still a system that knows how to construct a payment instruction,
// which read-only banking access must never be able to do.
const MONEY_ACTION_CLASS_NEVER_BUILT = [
  'payment_initiation',
  'transfer',
  'beneficiary_creation',
  'card_control',
  'change_account_settings'
];

const PROVIDERS = {
  anna_statement_csv: {
    id: 'anna_statement_csv',
    name: 'ANNA Money (statement upload)',
    primary: true,
    api: 'None - a CSV/PDF statement the account holder exports from the ANNA app ("Get an account statement"), then uploads here',
    authRoute: 'No OAuth, no credential, no account of any kind. Tom downloads the statement himself from the ANNA app and uploads the CSV.',
    credentialEnv: [],
    readScopes: [],
    capabilities: AUTONOMOUS_CAPABILITIES,
    supports: {
      balance: true, // as of the statement, not live - the Workspace must label it that way
      transactions: true,
      categories: true,
      recurring: true, // estimated by lib/workspace/finance/recurring.js, never source-confirmed
      payees: true,
      invoices: false, // not exposed by ANNA's statement export; no evidenced route found
      receipts: false // likewise
    },
    setupNote: 'In the ANNA app, type "Get an account statement", choose a period (a month, or your full history), and choose CSV. Upload that file here. Re-uploading an overlapping period is safe; matching transactions are not duplicated.'
  },
  xero: {
    id: 'xero',
    name: 'Xero (optional, future)',
    primary: false,
    api: 'Xero Accounting API (Bank Transactions / Accounts, read-only)',
    authRoute: 'Xero OAuth 2.0 authorization code flow, one organisation (tenant)',
    credentialEnv: ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET'],
    readScopes: ['offline_access', 'accounting.transactions.read', 'accounting.settings.read'],
    capabilities: AUTONOMOUS_CAPABILITIES,
    supports: {
      balance: true,
      transactions: true,
      categories: true,
      recurring: true, // still estimated, not source-confirmed - see lib/workspace/finance/xeroClient.js header
      payees: true,
      invoices: false,
      receipts: false
    },
    setupNote: 'Entirely optional. Tom does not currently use Xero and nothing in the Workspace requires it. Only relevant if Arrington adopts Xero for its own accounting later, independent of this Workspace: requires a Xero developer app (developer.xero.com), Tom setting up ANNA\'s own Xero bank-feed integration, and Tom completing the OAuth consent screen himself.'
  }
};

const PROVIDER_IDS = Object.keys(PROVIDERS);
const PRIMARY_PROVIDER_ID = 'anna_statement_csv';

function getProvider(id) {
  return PROVIDERS[id] || null;
}

// Absence is the normal state for Xero (an unconfigured connector reads
// "not connected" and returns no data). The CSV route has no
// credential at all, so it is always "configured": the capability is
// always available, and "has anything been imported yet" is a separate
// question answered by the account row, not by this function.
function isConfigured(providerId, env = process.env) {
  const p = PROVIDERS[providerId];
  if (!p) return false;
  if (p.credentialEnv.length === 0) return true;
  return p.credentialEnv.every((k) => !!(env[k] && String(env[k]).trim()));
}

// The permission question, answered in one place, exactly like
// lib/workspace/social/registry.js's connectorMayDo. Every entry in
// MONEY_ACTION_CLASS_NEVER_BUILT returns false here by construction,
// not by a list someone has to remember to update.
function connectorMayDo(providerId, capability) {
  const p = PROVIDERS[providerId];
  if (!p) return false;
  if (MONEY_ACTION_CLASS_NEVER_BUILT.includes(capability)) return false;
  return p.capabilities.includes(capability);
}

module.exports = {
  PROVIDERS,
  PROVIDER_IDS,
  PRIMARY_PROVIDER_ID,
  AUTONOMOUS_CAPABILITIES,
  MONEY_ACTION_CLASS_NEVER_BUILT,
  READ,
  ANALYSE,
  getProvider,
  isConfigured,
  connectorMayDo
};
