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
// WHERE THE FIGURES WENT (01/09/2026)
// ------------------------------------------------------------
// This file used to carry a fictional bank balance, a scheduled payment
// list, recent transactions and the owner's exposure. They are gone, and
// the reason is worth keeping rather than quietly deleting.
//
// They were authored here on 01/09/2026 as illustrative detail, and they
// contradicted the controlled 07A record they sat beside: a bank balance
// of GBP 24,680.50 against 07A's GBP 41,800, a VAT reserve of GBP 18,240
// against 07A's GBP 9,400, and a VAT quarter that disagreed with the one
// in TAX_POSITION. Both sets were tagged into the company brain, so which
// figure a worker quoted depended on which record it happened to be
// handed. A fictional company that answers the same question two ways is
// the one failure this demonstration cannot survive in front of a
// prospect.
//
// The company's money is now a real double-entry ledger, seeded from 07A
// and derived rather than restated: lib/scott/finance/. The live position
// reaches the brain through lib/scott/finance/state.js, computed from the
// postings at the moment it is asked. What stays in this file is the part
// that was never a figure: what the system refuses to do, and what it says
// about being connected to nothing.

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
  BANKING_CONTROLS
};
