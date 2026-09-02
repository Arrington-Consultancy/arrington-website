// Scott AI Demonstration - who may see and do what in Banking & Accounting.
//
// The area holds the most sensitive records in the fictional company, so
// these cases attack the boundary from every direction the brief names:
// pages, the records handed to the AI, the actions each persona may
// perform, and the accounts each may post to. Every case carries a
// POSITIVE CONTROL, because a test that only asserts absence passes just as
// happily against a system that shows nobody anything.

const test = require('node:test');
const assert = require('node:assert');

const clearance = require('../../lib/scott/clearance');
const viewModel = require('../../lib/scott/finance/viewModel');
const chart = require('../../lib/scott/finance/chartOfAccounts');
const banking = require('../../lib/scott/banking');
const facts = require('../../lib/scott/deepBusinessFacts');

const canSeeFor = (p) => (d) => clearance.personaCanSeeDomain(p, d);
const EVERYONE = Object.keys(clearance.PERSONAS);

// ------------------------------------------------------------
// Tabs
// ------------------------------------------------------------
test('the owner sees the whole area and the workshop floor sees none of it', () => {
  assert.strictEqual(viewModel.visibleTabs(canSeeFor('scott_mercer')).length, viewModel.TABS.length);
  ['jo_bell', 'ellie_park', 'ravi_singh', 'mike_evans', 'leah_morgan'].forEach((p) => {
    assert.deepStrictEqual(viewModel.visibleTabs(canSeeFor(p)), [],
      `${p} was offered a Banking & Accounting tab`);
  });
});

test('the sales clerk gets the sales ledger and not the bank, the accounts or the purchase ledger', () => {
  const tabs = viewModel.visibleTabs(canSeeFor('chloe_reed')).map((t) => t.id);
  assert.ok(tabs.includes('sales'), 'the person who raises the invoices cannot see the sales ledger');
  ['bank-accounts', 'transactions', 'reconciliation', 'cashflow', 'profit-and-loss', 'vat', 'reports', 'bills']
    .forEach((t) => assert.ok(!tabs.includes(t), `the sales clerk was offered ${t}`));
});

test('the operations lead gets payment capacity and nothing with a balance on it', () => {
  const tabs = viewModel.visibleTabs(canSeeFor('tony_marsh')).map((t) => t.id);
  assert.ok(tabs.includes('overview'));
  ['bank-accounts', 'transactions', 'reconciliation', 'cashflow', 'profit-and-loss', 'balance-sheet', 'vat', 'reports', 'sales', 'bills']
    .forEach((t) => assert.ok(!tabs.includes(t), `the operations lead was offered ${t}`));
});

test('a tab is never routable to somebody it is not listed for', () => {
  EVERYONE.forEach((p) => {
    const canSee = canSeeFor(p);
    const listed = viewModel.visibleTabs(canSee).map((t) => t.id);
    viewModel.TABS.forEach((t) => {
      assert.strictEqual(viewModel.isVisibleTab(t.id, canSee), listed.includes(t.id),
        `${p}: ${t.id} is listed and routable differently, which is how a hidden page gets reached by typing its URL`);
    });
  });
});

// ------------------------------------------------------------
// Action authority
// ------------------------------------------------------------
const FINANCE_ACTIONS = ['invoice_create', 'bill_record', 'bank_categorise', 'receipt_allocate', 'journal_post', 'payment_request'];

test('only the owner may touch the bank, the journals or the purchase ledger', () => {
  ['bill_record', 'bank_categorise', 'receipt_allocate', 'journal_post', 'payment_request'].forEach((action) => {
    EVERYONE.forEach((p) => {
      const expected = p === 'scott_mercer';
      assert.strictEqual(clearance.personaCanAct(p, action), expected,
        `${p} ${expected ? 'cannot' : 'can'} ${action}`);
    });
  });
});

test('raising a sales invoice is the one write the sales clerk holds', () => {
  assert.ok(clearance.personaCanAct('chloe_reed', 'invoice_create'));
  ['tony_marsh', 'leah_morgan', 'jo_bell', 'ellie_park', 'ravi_singh', 'mike_evans'].forEach((p) => {
    assert.ok(!clearance.personaCanAct(p, 'invoice_create'), `${p} can raise invoices`);
  });
});

test('an unknown or prototype-borne action name is refused rather than resolving', () => {
  ['not_an_action', 'constructor', 'toString', '__proto__', ''].forEach((a) => {
    EVERYONE.forEach((p) => assert.strictEqual(clearance.personaCanAct(p, a), false, `${p} could perform "${a}"`));
  });
});

test('nobody at all holds a finance write action they were not given deliberately', () => {
  // Guards the widening that a later edit makes by accident: a new persona,
  // or a domain added to an existing one, silently granting the books.
  const holders = {};
  FINANCE_ACTIONS.forEach((a) => { holders[a] = EVERYONE.filter((p) => clearance.personaCanAct(p, a)); });
  assert.deepStrictEqual(holders, {
    invoice_create: ['scott_mercer', 'chloe_reed'],
    bill_record: ['scott_mercer'],
    bank_categorise: ['scott_mercer'],
    receipt_allocate: ['scott_mercer'],
    journal_post: ['scott_mercer'],
    payment_request: ['scott_mercer']
  });
});

// ------------------------------------------------------------
// Accounts
// ------------------------------------------------------------
test('the sales clerk may code an invoice to a service line without seeing its balance', () => {
  const canSee = canSeeFor('chloe_reed');
  const codeable = viewModel.postableAccounts(canSee, ['turnover'], { requireVisible: false });
  assert.ok(codeable.length > 0, 'she has nothing to code an invoice to, so she cannot raise one');
  codeable.forEach((a) => assert.strictEqual(canSee(a.domain), false,
    'this case is meant to prove coding and reading are separate, and this account is readable'));
});

test('no form ever offers an account outside the group it is for', () => {
  const canSee = canSeeFor('scott_mercer');
  viewModel.postableAccounts(canSee, ['turnover'], { requireVisible: false })
    .forEach((a) => assert.strictEqual(a.group, 'turnover'));
  viewModel.postableAccounts(canSee, ['direct_costs', 'overheads'])
    .forEach((a) => assert.ok(['direct_costs', 'overheads'].includes(a.group)));
  // The point of the group restriction: an invoice can never be coded to
  // the director's loan account or a bank account.
  const sales = viewModel.postableAccounts(canSee, ['turnover'], { requireVisible: false }).map((a) => a.code);
  ['2400', '1200', '1210', '2300'].forEach((c) => assert.ok(!sales.includes(c), `${c} is offered as a sales account`));
});

test("the owner's personal position is narrower than the company's accounts", () => {
  const dla = chart.account('2400');
  assert.strictEqual(dla.domain, 'director_position');
  assert.ok(!clearance.personaCanSeeDomain('tony_marsh', 'director_position'));
  assert.ok(clearance.personaCanSeeDomain('scott_mercer', 'director_position'), 'positive control failed');
});

test('every account in the chart carries a domain some persona actually holds', () => {
  chart.ACCOUNTS.forEach((a) => {
    assert.ok(a.domain, `${a.code} has no domain, so no clearance rule applies to it`);
    assert.ok(EVERYONE.some((p) => clearance.personaCanSeeDomain(p, a.domain)),
      `${a.code} is tagged ${a.domain}, which nobody holds, so it is invisible to everybody`);
  });
});

// ------------------------------------------------------------
// Refused by construction
// ------------------------------------------------------------
test('moving money throws rather than returning false, for every refused action', () => {
  assert.ok(banking.REFUSED_ACTIONS.length >= 8);
  banking.REFUSED_ACTIONS.forEach((a) => {
    assert.throws(() => banking.assertBankingActionRefused(a), /refused by construction/,
      `${a} did not throw`);
  });
  assert.strictEqual(banking.assertBankingActionRefused('read_a_balance'), false,
    'the guard refuses things it was never meant to police');
});

test('no bank is connected and the state says so rather than implying a stale sync', () => {
  const s = banking.bankConnectionState();
  assert.strictEqual(s.state, 'not_connected');
  assert.strictEqual(s.provider, null);
  assert.ok(/no banking credential/i.test(s.explanation));
});

// ------------------------------------------------------------
// The contradiction that caused this work
// ------------------------------------------------------------
test('the banking figures that contradicted 07A are gone from the brain', () => {
  ['BANK_ACCOUNTS', 'SCHEDULED_PAYMENTS', 'RECENT_TRANSACTIONS', 'OWNER_BANKING_EXPOSURE', 'PAYMENT_CAPACITY_SUMMARY']
    .forEach((k) => assert.strictEqual(facts[k], undefined,
      `${k} is back in the company brain, where it will contradict the ledger`));
  assert.ok(Array.isArray(facts.BANKING_CONTROLS), 'the controls, which are rules rather than figures, should stay');
});

test('the live ledger records supersede 07A rather than sitting beside it', () => {
  const state = require('../../lib/scott/finance/state');
  // With no ledger loaded the static record must be untouched: the safe
  // direction is a worker seeing the opening position, never a worker
  // handed a live figure that was never posted.
  assert.ok(facts.FINANCE_SUMMARY.cash, 'the static record was mutated, which it must never be');
  const passthrough = state.financeSummaryForBrain(facts.FINANCE_SUMMARY);
  assert.strictEqual(passthrough, facts.FINANCE_SUMMARY);
});
