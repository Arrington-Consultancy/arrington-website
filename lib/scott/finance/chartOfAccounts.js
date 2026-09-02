// Scott AI Demonstration - the fictional company's chart of accounts.
//
// This is the spine of the Banking & Accounting area. Every figure the
// workspace shows, and every figure Nigel Preece reasons from, is derived
// from postings against these accounts rather than stored as a separate
// number somewhere. That is the whole point: a P&L, a balance sheet, a VAT
// return and an aged debtor list that are computed from one ledger cannot
// disagree with each other. Twelve tables of pre-computed answers can, and
// eventually do.
//
// CLEARANCE. Every account carries a `domain`, the same tag every record in
// deepBusinessFacts.js carries, read by the same clearance filter. Nothing
// here invents a second access model:
//
//   finance_full      the company's money. Scott and Nigel.
//   director_position the owner's own exposure: the director's loan
//                     account and the borrowing he has guaranteed. Scott
//                     alone, deliberately narrower than the company's
//                     finances, because Nigel runs the accounts and
//                     Scott's personal position is Scott's.
//   invoice_status    what a customer has been invoiced and whether they
//                     have paid. Chloe's daily work. She sees the sales
//                     ledger without ever seeing the bank.
//
// The split on the sales side is the single best thing in this area to
// show a board worried about segregation of duties: the person who raises
// the invoices cannot see the balance it will be paid into.

// UK standard rate. The company is VAT registered (07A carries a quarter
// end and a filing deadline), so every sale and most purchases carry it.
const VAT_RATE = 0.2;

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

// `normal` is the side that increases the account, which is what makes a
// balance sheet come out with the right signs without a special case per
// account. Assets and expenses are debit-normal; everything else credit.
function normalSide(type) {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit';
}

// `cash: true` marks the accounts a cashflow statement actually moves
// through, so the cashflow projection does not have to keep its own list.
// `pnl` groups the income statement; `vatBox` maps a posting into the
// right box of the VAT return.
const ACCOUNTS = [
  // ---- Assets ----
  { code: '0050', name: 'Plant and equipment (net book value)', type: 'asset', domain: 'finance_full', group: 'fixed_assets' },
  { code: '1001', name: 'Stock and work in progress', type: 'asset', domain: 'finance_full', group: 'current_assets' },
  { code: '1100', name: 'Trade debtors', type: 'asset', domain: 'invoice_status', group: 'current_assets', subledger: 'sales' },
  { code: '1200', name: 'Business current account', type: 'asset', domain: 'finance_full', group: 'current_assets', cash: true, bank: true },
  { code: '1210', name: 'VAT and tax reserve account', type: 'asset', domain: 'finance_full', group: 'current_assets', cash: true, bank: true, note: 'Set aside for the VAT quarter and corporation tax. Deliberately not treated as working capital.' },

  // ---- Liabilities ----
  { code: '2100', name: 'Trade creditors', type: 'liability', domain: 'finance_full', group: 'current_liabilities', subledger: 'purchase' },
  { code: '2200', name: 'VAT control', type: 'liability', domain: 'finance_full', group: 'current_liabilities' },
  { code: '2210', name: 'PAYE and NIC control', type: 'liability', domain: 'finance_full', group: 'current_liabilities' },
  { code: '2220', name: 'Pension control', type: 'liability', domain: 'finance_full', group: 'current_liabilities' },
  { code: '2300', name: 'Term loan', type: 'liability', domain: 'director_position', group: 'long_term_liabilities' },
  { code: '2310', name: 'Equipment finance', type: 'liability', domain: 'director_position', group: 'long_term_liabilities' },
  { code: '2400', name: "Director's loan account", type: 'liability', domain: 'director_position', group: 'current_liabilities', note: 'Credit balance means the company owes Scott Mercer.' },

  // ---- Equity ----
  { code: '3000', name: 'Share capital', type: 'equity', domain: 'director_position', group: 'equity' },
  { code: '3100', name: 'Retained earnings brought forward', type: 'equity', domain: 'director_position', group: 'equity' },
  { code: '3200', name: 'Dividends', type: 'equity', domain: 'director_position', group: 'equity' },

  // ---- Income ----
  { code: '4000', name: 'Sales - repairs and refresh', type: 'income', domain: 'finance_full', group: 'turnover', pnl: 'turnover', vatBox: 'outputs' },
  { code: '4010', name: 'Sales - knitted goods', type: 'income', domain: 'finance_full', group: 'turnover', pnl: 'turnover', vatBox: 'outputs' },
  { code: '4020', name: 'Sales - collection and return', type: 'income', domain: 'finance_full', group: 'turnover', pnl: 'turnover', vatBox: 'outputs' },
  { code: '4030', name: 'Sales - trade accounts', type: 'income', domain: 'finance_full', group: 'turnover', pnl: 'turnover', vatBox: 'outputs' },

  // ---- Direct costs ----
  { code: '5000', name: 'Materials and consumables', type: 'expense', domain: 'finance_full', group: 'direct_costs', pnl: 'direct_costs', vatBox: 'inputs' },
  { code: '5010', name: 'Direct labour', type: 'expense', domain: 'finance_full', group: 'direct_costs', pnl: 'direct_costs' },
  { code: '5020', name: 'Collection and delivery costs', type: 'expense', domain: 'finance_full', group: 'direct_costs', pnl: 'direct_costs', vatBox: 'inputs' },

  // ---- Overheads ----
  { code: '6000', name: 'Wages and salaries', type: 'expense', domain: 'finance_full', group: 'overheads', pnl: 'overheads' },
  { code: '6010', name: 'Employer NIC and pension', type: 'expense', domain: 'finance_full', group: 'overheads', pnl: 'overheads' },
  { code: '6100', name: 'Workshop rent and service charge', type: 'expense', domain: 'finance_full', group: 'overheads', pnl: 'overheads', vatBox: 'inputs' },
  { code: '6200', name: 'Insurance', type: 'expense', domain: 'finance_full', group: 'overheads', pnl: 'overheads' },
  { code: '6300', name: 'Van and motor costs', type: 'expense', domain: 'finance_full', group: 'overheads', pnl: 'overheads', vatBox: 'inputs' },
  { code: '6400', name: 'Utilities', type: 'expense', domain: 'finance_full', group: 'overheads', pnl: 'overheads', vatBox: 'inputs' },
  { code: '6500', name: 'Accountancy and professional fees', type: 'expense', domain: 'finance_full', group: 'overheads', pnl: 'overheads', vatBox: 'inputs' },
  { code: '6600', name: 'Marketing and advertising', type: 'expense', domain: 'finance_full', group: 'overheads', pnl: 'overheads', vatBox: 'inputs' },
  { code: '6700', name: 'Software and subscriptions', type: 'expense', domain: 'finance_full', group: 'overheads', pnl: 'overheads', vatBox: 'inputs' },
  { code: '6800', name: 'Other overheads', type: 'expense', domain: 'finance_full', group: 'overheads', pnl: 'overheads', vatBox: 'inputs' },
  { code: '7000', name: 'Loan and finance interest', type: 'expense', domain: 'finance_full', group: 'overheads', pnl: 'overheads' }
];

// Null-prototype, so a code like "constructor" or "toString" resolves to
// nothing rather than to a function. The same prototype-pollution shape
// governance finding T3 caught in the workspace lane router, avoided here
// rather than found here later: account codes arrive from request bodies.
const BY_CODE = Object.assign(Object.create(null), ...ACCOUNTS.map((a) => ({ [a.code]: a })));

function account(code) {
  return BY_CODE[String(code)] || null;
}

function isAccount(code) {
  return Boolean(account(code));
}

// The accounts a given persona may see at all. Used by the workspace to
// decide which sections of a report exist for this reader, and by the
// ledger projections so a total is computed AFTER filtering rather than
// filtered after being computed: a total that includes a figure you may
// not see leaks it just as surely as printing it.
function accountsVisibleTo(canSeeDomain) {
  return ACCOUNTS.filter((a) => canSeeDomain(a.domain));
}

const BANK_ACCOUNT_CODES = ACCOUNTS.filter((a) => a.bank).map((a) => a.code);
const CASH_ACCOUNT_CODES = ACCOUNTS.filter((a) => a.cash).map((a) => a.code);

module.exports = {
  VAT_RATE,
  ACCOUNT_TYPES,
  ACCOUNTS,
  BANK_ACCOUNT_CODES,
  CASH_ACCOUNT_CODES,
  account,
  isAccount,
  normalSide,
  accountsVisibleTo
};
