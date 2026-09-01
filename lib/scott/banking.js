// Scott AI Demonstration — banking.
//
// WHAT THIS IS NOT, and the reason matters commercially as well as
// technically. Tom asked for "a generic banking login that can log into
// most banks". No such thing exists and none is built here.
//
//   - A form collecting somebody's real bank username and password is
//     indistinguishable from a phishing page, whatever the intent behind
//     it, and this system holds no bank credential of any kind.
//   - UK bank data access runs through Open Banking, which requires FCA
//     authorisation as an Account Information Service Provider or the use
//     of a licensed aggregator (TrueLayer, Yapily, Plaid, Tink). It is a
//     regulated arrangement with a consent journey that happens on the
//     BANK's own site, never on ours. There is no shared login across
//     banks to build against.
//   - Scott's Armchair & Knitting Service is fictional and banks with a
//     fictional bank. There is nothing to connect to.
//
// So what this demonstrates is the thing actually worth showing a
// prospective client: what governed banking access looks like. Who can see
// a balance, who can see only that suppliers can be paid, who sees nothing
// at all, and which actions the system refuses to perform no matter who
// asks. For a board deciding whether to trust an AI system near their
// money, segregation of duties is the whole question.
//
// Connection state is reported honestly for the same reason the social
// connectors report theirs: "not connected" and "connected but nothing
// retrieved" are different facts, and a credential is never presented as
// though it were a retrieval.

// ------------------------------------------------------------
// REFUSED BY CONSTRUCTION
// ------------------------------------------------------------
// Moving money is not gated on a permission that could be widened later.
// The guard THROWS rather than returning false, and no connector declares
// a payment scope, so there is no token in the system that could perform
// these even if a caller tried. Same structural approach as the social
// write refusals.
//
// The authorised route for any of these is the human approval queue, where
// such a request lands as a record that executes nothing.
const REFUSED_ACTIONS = [
  'make_payment',
  'transfer_between_accounts',
  'add_or_change_payee',
  'set_up_standing_order',
  'amend_direct_debit',
  'draw_on_overdraft',
  'change_bank_credentials',
  'export_full_statement_externally'
];

function assertBankingActionRefused(action) {
  if (REFUSED_ACTIONS.includes(action)) {
    throw new Error(
      `Banking action "${action}" is refused by construction in this demonstration. ` +
      'No worker, persona or route may move money, change a payee or alter a mandate. ' +
      'The authorised route is the human approval queue, which records the request and executes nothing.'
    );
  }
  return false;
}

// ------------------------------------------------------------
// CONNECTION STATE
// ------------------------------------------------------------
// Deliberately the same vocabulary the social area uses, because the
// honest distinction is the same one: a credential being present is not
// evidence that anything was read, and a failed attempt outranks the date
// of the last good one.
const CONNECTION_STATES = ['not_connected', 'connected_never_retrieved', 'sync_failed', 'stale', 'fresh'];

function bankConnectionState() {
  // Nothing is connected and nothing can be. Stated as a fact about this
  // demonstration rather than dressed up as a sync that has not run yet.
  return {
    state: 'not_connected',
    provider: null,
    explanation: 'No bank is connected. Real bank data would arrive through an FCA-authorised Open Banking provider, with the consent step happening on the bank\'s own website. This system holds no banking credential and has no way to accept one.',
    figuresBelowAre: 'the fictional company\'s own records, not a live bank feed'
  };
}

// ------------------------------------------------------------
// THE FICTIONAL BANK
// ------------------------------------------------------------
// Domains are the point of this page, so they are chosen carefully rather
// than all set to the same thing:
//
//   finance_full        balances, transactions, the borrowing position.
//                       Scott and Nigel.
//   finance_summary_ops "can we pay the suppliers this week", without the
//                       balance. This is what lets Tony run the workshop
//                       without seeing the company's cash position, and it
//                       is the single best thing on this page to show a
//                       board worried about segregation of duties.
//   director_position   the owner's own borrowing and personal exposure.
//                       Scott alone.
const BANK_ACCOUNTS = [
  {
    domain: 'finance_full',
    kind: 'current_account',
    name: 'Business current account',
    bank: 'South West Business Bank (fictional)',
    sortCodeMasked: '00-00-**',
    accountNumberMasked: '****4471',
    balanceGbp: 24680.5,
    availableGbp: 39680.5,
    includesOverdraftHeadroomGbp: 15000,
    asOf: '2026-08-31'
  },
  {
    domain: 'finance_full',
    kind: 'reserve_account',
    name: 'VAT and tax reserve',
    bank: 'South West Business Bank (fictional)',
    accountNumberMasked: '****8802',
    balanceGbp: 18240,
    purpose: 'VAT quarter and corporation tax set aside, not working capital',
    asOf: '2026-08-31'
  }
];

// What an operations lead may see: enough to plan work, nothing about the
// company's cash position.
const PAYMENT_CAPACITY_SUMMARY = {
  domain: 'finance_summary_ops',
  supplierPaymentsThisWeek: 'clear to release on normal terms',
  wagesRunCovered: true,
  anyPaymentOnHold: false,
  note: 'A yes/no on whether committed payments can go out. Deliberately carries no balance, no headroom and no borrowing position.'
};

const SCHEDULED_PAYMENTS = [
  { domain: 'finance_full', payee: 'South West Business Bank (fictional)', reference: 'term loan', amountGbp: 826, dueDate: '2026-09-01', method: 'direct debit', status: 'scheduled' },
  { domain: 'finance_full', payee: 'fictional equipment finance provider', reference: 'foam saw / compressor', amountGbp: 435, dueDate: '2026-09-12', method: 'direct debit', status: 'scheduled' },
  { domain: 'finance_full', payee: 'South Devon Foam & Webbing Ltd', reference: 'August account', amountGbp: 2140.8, dueDate: '2026-09-15', method: 'bank transfer', status: 'awaiting release' },
  { domain: 'finance_full', payee: 'HMRC', reference: 'VAT quarter to 31 Aug', amountGbp: 9310, dueDate: '2026-10-07', method: 'direct debit', status: 'scheduled' },
  { domain: 'finance_full', payee: 'staff payroll', reference: 'September wages', amountGbp: 16900, dueDate: '2026-09-28', method: 'bank transfer', status: 'scheduled' }
];

const RECENT_TRANSACTIONS = [
  { domain: 'finance_full', date: '2026-08-29', description: 'Customer payment, Abbotsbury Interiors', amountGbp: 3480, direction: 'in', balanceAfterGbp: 24680.5 },
  { domain: 'finance_full', date: '2026-08-28', description: 'South Devon Foam & Webbing Ltd, July account', amountGbp: -1965.4, direction: 'out', balanceAfterGbp: 21200.5 },
  { domain: 'finance_full', date: '2026-08-28', description: 'Wages, August', amountGbp: -16750, direction: 'out', balanceAfterGbp: 23165.9 },
  { domain: 'finance_full', date: '2026-08-15', description: 'Director repayment to Scott Mercer', amountGbp: -4000, direction: 'out', balanceAfterGbp: 39915.9 },
  { domain: 'finance_full', date: '2026-08-12', description: 'Equipment finance, foam saw', amountGbp: -435, direction: 'out', balanceAfterGbp: 43915.9 },
  { domain: 'finance_full', date: '2026-08-08', description: 'Card takings, retail repairs', amountGbp: 2265, direction: 'in', balanceAfterGbp: 44350.9 }
];

// The owner's own position. Narrower than the company's finances on
// purpose: Nigel runs the accounts, Scott's personal exposure is Scott's.
const OWNER_BANKING_EXPOSURE = {
  domain: 'director_position',
  personalGuaranteeGiven: true,
  guaranteeAgainst: 'term loan with South West Business Bank (fictional)',
  guaranteeLimitGbp: 35000,
  directorsLoanAccountGbp: 9850,
  note: 'Scott has personally guaranteed the term loan. This is the owner-dependency the demonstration exists to illustrate: the company\'s borrowing rests on one person\'s signature.'
};

// Controls a board would actually ask about, stated as the demonstration's
// own rules rather than as claims about a real bank.
const BANKING_CONTROLS = [
  { domain: 'finance_summary_ops', control: 'Dual authorisation', rule: 'Any payment over GBP 2,000 needs a second human approval before release. No AI worker can be either approver.' },
  { domain: 'finance_summary_ops', control: 'No autonomous payment', rule: 'No worker can move money, add a payee or change a mandate. The system refuses these by construction, not by permission.' },
  { domain: 'finance_full', control: 'Segregation of duties', rule: 'The person who raises a purchase order is never the person who releases its payment.' },
  { domain: 'finance_full', control: 'Reserve discipline', rule: 'The VAT and tax reserve is not treated as working capital and does not appear in available funds for operational decisions.' }
];

module.exports = {
  REFUSED_ACTIONS,
  CONNECTION_STATES,
  assertBankingActionRefused,
  bankConnectionState,
  BANK_ACCOUNTS,
  PAYMENT_CAPACITY_SUMMARY,
  SCHEDULED_PAYMENTS,
  RECENT_TRANSACTIONS,
  OWNER_BANKING_EXPOSURE,
  BANKING_CONTROLS
};
