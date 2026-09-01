// Scott AI Demonstration - every accounting report, derived.
//
// Nothing here is stored. A trial balance, a profit and loss, a balance
// sheet, a VAT return, a cashflow and an aged debtor list are all just
// different questions asked of the same list of journal lines. That is why
// they cannot contradict each other, and it is why an invoice raised in the
// workspace changes all of them at once without any code saying so.
//
// CLEARANCE IS APPLIED BEFORE ARITHMETIC, NEVER AFTER. Every function takes
// an optional `canSeeDomain` predicate and drops the lines this reader is
// not cleared for BEFORE totalling. Filtering a total after computing it
// leaks the figure just as surely as printing it: an operating profit that
// silently includes the director's loan interest tells you the interest
// exists and roughly what it is. The same reasoning as computing search
// result counts after filtering, in routes/scott.js.
//
// Pure: no database, no clock except what is passed in.

const { account, normalSide, ACCOUNTS } = require('./chartOfAccounts');
const { formatGbp } = require('./ledger');

const ALL = () => true;

function inPeriod(date, from, to) {
  const d = String(date).slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// One place where a line is dropped for clearance, so a report cannot
// accidentally use a different rule from its neighbour.
function visibleLines(lines = [], canSeeDomain = ALL) {
  return lines.filter((l) => {
    const a = account(l.accountCode);
    return a ? canSeeDomain(a.domain) : false;
  });
}

// Signed balance in the account's own natural direction, so an asset with
// money in it is positive and so is a liability that is owed.
function accountBalance(lines, code) {
  const a = account(code);
  if (!a) return 0;
  const totals = lines
    .filter((l) => l.accountCode === code)
    .reduce((acc, l) => ({ d: acc.d + (l.debitPence || 0), c: acc.c + (l.creditPence || 0) }), { d: 0, c: 0 });
  return normalSide(a.type) === 'debit' ? totals.d - totals.c : totals.c - totals.d;
}

// ------------------------------------------------------------
// TRIAL BALANCE
// ------------------------------------------------------------
function trialBalance(lines = [], { asOf = null, canSeeDomain = ALL } = {}) {
  const scoped = visibleLines(lines, canSeeDomain).filter((l) => inPeriod(l.date, null, asOf));
  const rows = [];
  let debitPence = 0;
  let creditPence = 0;
  ACCOUNTS.forEach((a) => {
    if (!canSeeDomain(a.domain)) return;
    const bal = accountBalance(scoped, a.code);
    if (bal === 0) return;
    const isDebit = normalSide(a.type) === 'debit' ? bal > 0 : bal < 0;
    const amount = Math.abs(bal);
    rows.push({ code: a.code, name: a.name, type: a.type, debitPence: isDebit ? amount : 0, creditPence: isDebit ? 0 : amount });
    if (isDebit) debitPence += amount; else creditPence += amount;
  });
  return {
    rows,
    debitPence,
    creditPence,
    // Only meaningful on an unfiltered view: a reader who cannot see every
    // account is looking at a slice, and a slice of a balanced ledger does
    // not balance. Said explicitly rather than shown as a failure.
    balances: debitPence === creditPence,
    partial: canSeeDomain !== ALL
  };
}

// ------------------------------------------------------------
// PROFIT AND LOSS
// ------------------------------------------------------------
function profitAndLoss(lines = [], { from = null, to = null, canSeeDomain = ALL } = {}) {
  const scoped = visibleLines(lines, canSeeDomain).filter((l) => inPeriod(l.date, from, to));
  const section = (group) => {
    const rows = ACCOUNTS
      .filter((a) => a.group === group && canSeeDomain(a.domain))
      .map((a) => ({ code: a.code, name: a.name, amountPence: accountBalance(scoped, a.code) }))
      .filter((r) => r.amountPence !== 0);
    return { rows, totalPence: rows.reduce((s, r) => s + r.amountPence, 0) };
  };
  const turnover = section('turnover');
  const directCosts = section('direct_costs');
  const overheads = section('overheads');
  const grossProfitPence = turnover.totalPence - directCosts.totalPence;
  const operatingProfitPence = grossProfitPence - overheads.totalPence;
  const pct = (n) => (turnover.totalPence > 0 ? Math.round((n / turnover.totalPence) * 1000) / 10 : null);
  return {
    from,
    to,
    turnover,
    directCosts,
    overheads,
    grossProfitPence,
    operatingProfitPence,
    grossMarginPct: pct(grossProfitPence),
    operatingMarginPct: pct(operatingProfitPence)
  };
}

// Month-by-month, which is how the company actually reads it (07A keeps
// monthly management accounts, not a single year-to-date figure).
function monthlyProfitAndLoss(lines = [], { months = [], canSeeDomain = ALL } = {}) {
  return months.map((m) => {
    const from = `${m}-01`;
    const to = `${m}-31`;
    const pl = profitAndLoss(lines, { from, to, canSeeDomain });
    return {
      month: m,
      revenuePence: pl.turnover.totalPence,
      directCostsPence: pl.directCosts.totalPence,
      grossProfitPence: pl.grossProfitPence,
      overheadsPence: pl.overheads.totalPence,
      operatingProfitPence: pl.operatingProfitPence
    };
  });
}

// ------------------------------------------------------------
// BALANCE SHEET
// ------------------------------------------------------------
function balanceSheet(lines = [], { asOf = null, canSeeDomain = ALL } = {}) {
  const scoped = visibleLines(lines, canSeeDomain).filter((l) => inPeriod(l.date, null, asOf));
  const group = (name) => {
    const rows = ACCOUNTS
      .filter((a) => a.group === name && canSeeDomain(a.domain))
      .map((a) => ({ code: a.code, name: a.name, amountPence: accountBalance(scoped, a.code) }))
      .filter((r) => r.amountPence !== 0);
    return { rows, totalPence: rows.reduce((s, r) => s + r.amountPence, 0) };
  };
  const fixedAssets = group('fixed_assets');
  const currentAssets = group('current_assets');
  const currentLiabilities = group('current_liabilities');
  const longTermLiabilities = group('long_term_liabilities');
  const equity = group('equity');

  // Profit for the period is not an account: it is the income statement's
  // answer, and it belongs on the balance sheet or nothing balances.
  const pl = profitAndLoss(scoped, { to: asOf, canSeeDomain });
  const netCurrentAssetsPence = currentAssets.totalPence - currentLiabilities.totalPence;
  const netAssetsPence = fixedAssets.totalPence + netCurrentAssetsPence - longTermLiabilities.totalPence;
  const capitalPence = equity.totalPence + pl.operatingProfitPence;

  return {
    asOf,
    fixedAssets,
    currentAssets,
    currentLiabilities,
    longTermLiabilities,
    equity,
    retainedProfitForPeriodPence: pl.operatingProfitPence,
    netCurrentAssetsPence,
    netAssetsPence,
    capitalAndReservesPence: capitalPence,
    balances: netAssetsPence === capitalPence,
    partial: canSeeDomain !== ALL,
    differencePence: netAssetsPence - capitalPence
  };
}

// ------------------------------------------------------------
// VAT RETURN
// ------------------------------------------------------------
// Box numbers as HMRC uses them, computed from movements on the VAT
// control account and the accounts that feed it. A payment of VAT to HMRC
// is a debit to the same control account, so it is excluded by source:
// without that, settling the last quarter would look like reclaiming it.
const VAT_SETTLEMENT_SOURCES = ['vat_payment', 'vat_refund'];

function vatReturn(lines = [], { from = null, to = null, canSeeDomain = ALL } = {}) {
  const cleared = canSeeDomain('finance_full');
  if (!cleared) return { cleared: false, from, to };
  const scoped = lines
    .filter((l) => inPeriod(l.date, from, to))
    .filter((l) => !VAT_SETTLEMENT_SOURCES.includes(l.source));

  const vatLines = scoped.filter((l) => l.accountCode === '2200');
  const box1 = vatLines.reduce((s, l) => s + (l.creditPence || 0), 0);
  const box4 = vatLines.reduce((s, l) => s + (l.debitPence || 0), 0);

  const netOn = (predicate) => ACCOUNTS.filter(predicate).reduce((s, a) => s + accountBalance(scoped, a.code), 0);
  const box6 = netOn((a) => a.group === 'turnover');
  const box7 = netOn((a) => a.type === 'expense' && a.vatBox === 'inputs');

  return {
    cleared: true,
    from,
    to,
    box1VatDueOnSalesPence: box1,
    box2VatDueOnAcquisitionsPence: 0,
    box3TotalVatDuePence: box1,
    box4VatReclaimedPence: box4,
    box5NetVatDuePence: box1 - box4,
    box6TotalSalesExVatPence: box6,
    box7TotalPurchasesExVatPence: box7,
    // Stated rather than implied. This is a working figure produced from a
    // fictional ledger, not a return anybody has filed or checked.
    status: 'working figure from the ledger, not a filed return'
  };
}

// ------------------------------------------------------------
// CASHFLOW
// ------------------------------------------------------------
function cashflowByMonth(lines = [], { bankCodes = ['1200', '1210'], canSeeDomain = ALL } = {}) {
  if (!canSeeDomain('finance_full')) return { cleared: false, months: [] };
  const byMonth = new Map();
  lines
    .filter((l) => bankCodes.includes(l.accountCode))
    .forEach((l) => {
      const m = String(l.date).slice(0, 7);
      const cur = byMonth.get(m) || { month: m, inPence: 0, outPence: 0 };
      cur.inPence += l.debitPence || 0;
      cur.outPence += l.creditPence || 0;
      byMonth.set(m, cur);
    });
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  let running = 0;
  months.forEach((m) => {
    m.netPence = m.inPence - m.outPence;
    running += m.netPence;
    m.closingBalancePence = running;
  });
  return { cleared: true, months };
}

// ------------------------------------------------------------
// AGED DEBTORS AND CREDITORS
// ------------------------------------------------------------
function daysBetween(a, b) {
  return Math.floor((Date.parse(a) - Date.parse(b)) / 86400000);
}

function agedAnalysis(documents = [], { asOf, kind = 'sales' } = {}) {
  const buckets = { currentPence: 0, days1to30Pence: 0, days31to60Pence: 0, over60Pence: 0 };
  const rows = [];
  documents
    .filter((d) => d.kind === kind)
    .forEach((d) => {
      const outstanding = (d.grossPence || 0) - (d.paidPence || 0);
      if (outstanding <= 0) return;
      const overdue = d.dueDate ? daysBetween(asOf, d.dueDate) : 0;
      let bucket = 'currentPence';
      if (overdue > 60) bucket = 'over60Pence';
      else if (overdue > 30) bucket = 'days31to60Pence';
      else if (overdue > 0) bucket = 'days1to30Pence';
      buckets[bucket] += outstanding;
      rows.push({ ...d, outstandingPence: outstanding, daysOverdue: Math.max(0, overdue), bucket });
    });
  rows.sort((a, b) => b.daysOverdue - a.daysOverdue || b.outstandingPence - a.outstandingPence);
  return {
    ...buckets,
    totalPence: buckets.currentPence + buckets.days1to30Pence + buckets.days31to60Pence + buckets.over60Pence,
    rows
  };
}

// ------------------------------------------------------------
// RECONCILIATION
// ------------------------------------------------------------
// The honest version of "is the bank reconciled". A bank line that has been
// matched to a journal is explained; one that has not is not, and the count
// of unexplained lines is the number that matters to an owner.
function reconciliationSummary(bankTransactions = [], { canSeeDomain = ALL } = {}) {
  if (!canSeeDomain('finance_full')) return { cleared: false };
  const matched = bankTransactions.filter((t) => t.matchedJournalId);
  const unmatched = bankTransactions.filter((t) => !t.matchedJournalId);
  return {
    cleared: true,
    totalCount: bankTransactions.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    unmatchedValuePence: unmatched.reduce((s, t) => s + Math.abs(t.amountPence || 0), 0),
    oldestUnmatchedDate: unmatched.length
      ? unmatched.map((t) => String(t.date).slice(0, 10)).sort()[0]
      : null,
    fullyReconciled: unmatched.length === 0
  };
}

module.exports = {
  visibleLines,
  accountBalance,
  trialBalance,
  profitAndLoss,
  monthlyProfitAndLoss,
  balanceSheet,
  vatReturn,
  cashflowByMonth,
  agedAnalysis,
  reconciliationSummary,
  formatGbp
};
