// Arrington AI Workspace: business banking connector registry.
//
// Tom's ANNA MONEY BANKING INTEGRATION DECISION (1 September 2026):
// bring Arrington's ANNA Money business account into the Workspace as a
// controlled READ-ONLY finance source. The decision required determining
// the real route rather than assuming one:
//
//   1. Verify whether ANNA can be connected directly as a provider
//      through a regulated Open Banking data provider (TrueLayer named
//      specifically, "or another appropriate" left open).
//   2. If not, use the accounting-feed route: ANNA -> Xero -> Workspace.
//   3. Never screen-scrape, store ANNA credentials, or simulate data.
//
// FINDING (1 September 2026, from TrueLayer's own public partnership
// material and independent coverage, cross-checked against ANNA's own
// regulatory status): ANNA is the CLIENT of TrueLayer's Data API, not a
// provider exposed BY it. ANNA adopted TrueLayer so its own customers
// could connect THEIR OTHER banks into ANNA (for expense aggregation and
// VAT calculation) - that is the opposite direction from what this
// decision needs, which is reading OUT of ANNA into a third party. No
// public evidence (TrueLayer's own coverage list, Yapily, or any other
// UK Open Banking aggregator) shows ANNA itself listed as a connectable
// provider. This sandbox could not reach TrueLayer's live provider
// console or ANNA's own developer documentation directly (both hosts
// are blocked by the network egress proxy here), so this is public-
// evidence research, not a login attempt against TrueLayer's real
// console - the decision doc's instruction to "determine from a real
// provider flow" is completed as far as this can go without creating a
// TrueLayer developer account (a new account decision reserved to Tom,
// see the connect flow below) or Tom's own ANNA Open Banking consent.
// The one thing this finding does NOT rest on is the fallacy the
// decision doc warned against: it is not inferred from "ANNA uses
// TrueLayer", it rests on the documented DIRECTION of that use.
//
// CONCLUSION: build the accounting-feed route. ANNA publicly supports
// automatic Xero bank-feed sync (transactions, categories, attachments),
// which is the real, evidenced, working data path. One provider only.
//
// The three structural rules below are the same three that govern
// lib/workspace/social/registry.js, and for the same reasons:
//
// 1. LEAST PRIVILEGE. The Xero OAuth scope requested is read-only
//    accounting data. Nothing here requests a scope that could create,
//    update or pay anything.
// 2. CONSEQUENTIAL ACTIONS ARE HUMAN, AND HERE THEY DO NOT EXIST AT ALL.
//    Unlike social (which prepares drafts a person then publishes), this
//    connector has no legitimate reason to ever prepare a payment,
//    transfer, beneficiary or card action, so no such capability, route,
//    approval-queue path or database column exists anywhere in this
//    area. Refusal here is not a permission declined; it is a capability
//    that was never built.
// 3. A CREDENTIAL IS NOT A RETRIEVAL. Connector state carries the last
//    successful sync separately from whether a credential exists.
//
// Nothing here reaches the Scott demonstration, and nothing in Scott
// reaches this: Scott's fictional finance material (07-series) has no
// credential path and no code path into real Arrington banking data.

const READ = 'read';
const ANALYSE = 'analyse';
const AUTONOMOUS_CAPABILITIES = [READ, ANALYSE];

// Named so a reviewer can grep for it, and so a test can assert none of
// these is ever a capability of the connector below. There is no
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
  xero: {
    id: 'xero',
    name: 'Xero (ANNA Money bank feed)',
    api: 'Xero Accounting API (Bank Transactions / Accounts, read-only)',
    authRoute: 'Xero OAuth 2.0 authorization code flow, one organisation (tenant)',
    credentialEnv: ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET'],
    // Read-only accounting scopes plus offline_access for the refresh
    // token. No accounting.transactions WRITE scope, no payments scope,
    // no bank-feeds write scope.
    readScopes: ['offline_access', 'accounting.transactions.read', 'accounting.settings.read'],
    capabilities: AUTONOMOUS_CAPABILITIES,
    supports: {
      balance: true,
      transactions: true,
      categories: true,
      recurring: true,
      payees: true
    },
    setupNote: 'Requires a Xero developer app (developer.xero.com), a connected Xero organisation with the ANNA Money bank feed already flowing in (set up once inside ANNA: Xero integration), and Tom completing the OAuth consent screen himself. If Arrington has no Xero account, one is required before this can be connected; that is a new-account decision reserved to Tom, not made by this connector.'
  }
};

const PROVIDER_IDS = Object.keys(PROVIDERS);

function getProvider(id) {
  return PROVIDERS[id] || null;
}

// Absence is the normal state: an unconfigured connector renders as "not
// connected" and returns no data, the same posture as the social layer.
function isConfigured(providerId, env = process.env) {
  const p = PROVIDERS[providerId];
  if (!p) return false;
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
  AUTONOMOUS_CAPABILITIES,
  MONEY_ACTION_CLASS_NEVER_BUILT,
  READ,
  ANALYSE,
  getProvider,
  isConfigured,
  connectorMayDo
};
