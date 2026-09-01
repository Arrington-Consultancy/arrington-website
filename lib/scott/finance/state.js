// Scott AI Demonstration - the live financial state the AI reasons from.
//
// THIS IS THE POINT OF THE WHOLE AREA. Before this, the company's finances
// were a static snapshot in deepBusinessFacts.js: a visitor could raise an
// invoice on screen and Nigel Preece would carry on quoting the debtor
// total from before it existed. A demonstration whose books and whose
// accountant disagree the moment you touch anything is worse than one with
// no books at all.
//
// So the ledger is the authority. These records are derived from the
// posted journals on every read, cached in memory and refreshed on every
// write, and they join the SAME list of domain-tagged records the static
// brain uses. Nothing downstream needs to know they arrived by a different
// route: clearance.filterAndRedact reads the `domain` on each one exactly
// as it reads the domain on a static record, so this adds no second access
// model. Same pattern, and the same reasoning, as the approved-fact cache
// in lib/scott/data/contextBuilders.js.
//
// SUPERSESSION. 07A's own cash, debtor and creditor figures are the
// OPENING position these postings were built from. Once the ledger is
// seeded they are a superseded snapshot of three numbers that now move, so
// financeSummaryForBrain() hands the AI 07A with exactly those three
// sections removed and the live equivalents supplied here instead. The
// rest of 07A - the targets, the run rate, the management-account history,
// the budget watchpoints - is untouched, because none of it moves when an
// invoice is raised. One fact, one place.

const repo = require('./repository');
const reports = require('./reports');
const { formatGbp, toPence } = require('./ledger');
const { CASH_ACCOUNT_CODES } = require('./chartOfAccounts');

const ALL = () => true;

// Empty until load() runs, which is the safe direction: the worst case is
// a worker not yet seeing this month's postings, never a worker quoting a
// figure that was never posted.
let cache = { loaded: false, lines: [], documents: [], bank: [], asOf: null };

async function load() {
  const [lines, documents, bank] = await Promise.all([
    repo.getJournalLines(),
    repo.getDocuments({ limit: 500 }),
    repo.getBankTransactions({ limit: 500 })
  ]);
  const asOf = lines.length ? lines[lines.length - 1].date : null;
  cache = { loaded: true, lines, documents, bank, asOf };
  return cache;
}

function snapshot() {
  return cache;
}

function isLive() {
  return cache.loaded && cache.lines.length > 0;
}

// Called after every successful write. Awaited by the routes so the reply
// a user sees is computed from the state their own action produced, rather
// than from the state that existed before it.
async function refresh() {
  return load();
}

// The date the books are made up to. Reports default to it so "this month"
// means the ledger's latest month rather than whatever today happens to be
// on the machine running the demonstration.
function asOf() {
  return cache.asOf || new Date().toISOString().slice(0, 10);
}

function latestMonth() {
  return asOf().slice(0, 7);
}

function quarterContaining(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  // The company's VAT quarters end in March, June, September and December
  // (07A gives a quarter end of 30 September), so a quarter starts in
  // January, April, July or October.
  const startMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
  return { from: `${y}-${String(startMonth).padStart(2, '0')}-01`, to: `${y}-${String(endMonth).padStart(2, '0')}-${lastDay}` };
}

// The last quarter that has actually finished, which is the one a VAT
// return is prepared for. Showing a part-quarter as though it were a
// return would misstate the liability by a third.
function lastCompleteQuarter(dateStr) {
  const q = quarterContaining(dateStr);
  if (dateStr >= q.to) return q;
  const [y, m] = q.from.split('-').map(Number);
  const prevStart = m === 1 ? { y: y - 1, m: 10 } : { y, m: m - 3 };
  const endMonth = prevStart.m + 2;
  const lastDay = new Date(Date.UTC(prevStart.y, endMonth, 0)).getUTCDate();
  return {
    from: `${prevStart.y}-${String(prevStart.m).padStart(2, '0')}-01`,
    to: `${prevStart.y}-${String(endMonth).padStart(2, '0')}-${lastDay}`
  };
}

// ------------------------------------------------------------
// THE RECORDS THE AI READS
// ------------------------------------------------------------
// Money is rendered as formatted strings rather than pence, because these
// go into a prompt and a model handed 4180000 will eventually write
// "£4,180,000". Every record carries a domain and says, in its own words,
// that it comes from the live ledger, so a worker quoting one can say
// where it came from.
function financeBrainRecords() {
  if (!isLive()) return [];
  const { lines, documents, bank } = cache;
  const on = asOf();
  const month = latestMonth();
  const out = [];

  const bankBalance = reports.accountBalance(lines, '1200');
  const reserve = reports.accountBalance(lines, '1210');
  out.push({
    domain: 'finance_full',
    source: 'live ledger',
    label: 'Cash position, from the posted ledger',
    asOf: on,
    businessCurrentAccount: formatGbp(bankBalance),
    vatAndTaxReserve: formatGbp(reserve),
    totalCash: formatGbp(bankBalance + reserve),
    note: 'Computed from every posting in the books, not from a stored balance. The reserve is set aside for VAT and tax and is not working capital.'
  });

  const pl = reports.profitAndLoss(lines, { from: `${month}-01`, to: `${month}-31` });
  out.push({
    domain: 'finance_full',
    source: 'live ledger',
    label: `Profit and loss for ${month}, from the posted ledger`,
    turnover: formatGbp(pl.turnover.totalPence),
    directCosts: formatGbp(pl.directCosts.totalPence),
    grossProfit: formatGbp(pl.grossProfitPence),
    grossMarginPct: pl.grossMarginPct,
    overheads: formatGbp(pl.overheads.totalPence),
    operatingProfit: formatGbp(pl.operatingProfitPence),
    operatingMarginPct: pl.operatingMarginPct
  });

  const agedSales = reports.agedAnalysis(documents, { asOf: on, kind: 'sales' });
  out.push({
    domain: 'invoice_status',
    source: 'live ledger',
    label: 'Sales ledger and aged debtors, from the posted ledger',
    asOf: on,
    totalOwedByCustomers: formatGbp(agedSales.totalPence),
    notYetDue: formatGbp(agedSales.currentPence),
    overdue1to30Days: formatGbp(agedSales.days1to30Pence),
    overdue31to60Days: formatGbp(agedSales.days31to60Pence),
    overdueOver60Days: formatGbp(agedSales.over60Pence),
    openInvoices: agedSales.rows.length,
    oldestOverdue: agedSales.rows.length
      ? `${agedSales.rows[0].party}, ${formatGbp(agedSales.rows[0].outstandingPence)}, ${agedSales.rows[0].daysOverdue} days overdue`
      : 'nothing overdue'
  });

  const agedPurchase = reports.agedAnalysis(documents, { asOf: on, kind: 'purchase' });
  out.push({
    domain: 'finance_full',
    source: 'live ledger',
    label: 'Purchase ledger and creditors, from the posted ledger',
    asOf: on,
    totalOwedToSuppliers: formatGbp(agedPurchase.totalPence),
    openBills: agedPurchase.rows.length,
    dueWithin7Days: formatGbp(
      documents
        .filter((d) => d.kind === 'purchase' && d.status !== 'paid' && d.dueDate <= addDays(on, 7))
        .reduce((s, d) => s + (d.grossPence - d.paidPence), 0)
    )
  });

  const q = lastCompleteQuarter(on);
  const vat = reports.vatReturn(lines, { from: q.from, to: q.to });
  out.push({
    domain: 'finance_full',
    source: 'live ledger',
    label: `VAT position for the quarter ${q.from} to ${q.to}, from the posted ledger`,
    vatDueOnSales: formatGbp(vat.box1VatDueOnSalesPence),
    vatReclaimedOnPurchases: formatGbp(vat.box4VatReclaimedPence),
    netVatDue: formatGbp(vat.box5NetVatDuePence),
    heldInReserve: formatGbp(reserve),
    status: 'a working figure computed from the ledger, not a filed return',
    note: reserve < vat.box5NetVatDuePence
      ? `The reserve is ${formatGbp(vat.box5NetVatDuePence - reserve)} short of the computed liability for this quarter.`
      : 'The reserve covers the computed liability for this quarter.'
  });

  const rec = reports.reconciliationSummary(bank);
  out.push({
    domain: 'finance_full',
    source: 'live ledger',
    label: 'Bank reconciliation status',
    bankLinesOnStatement: rec.totalCount,
    explained: rec.matchedCount,
    unexplained: rec.unmatchedCount,
    valueUnexplained: formatGbp(rec.unmatchedValuePence),
    oldestUnexplained: rec.oldestUnmatchedDate || 'none',
    note: rec.fullyReconciled
      ? 'Every bank line is accounted for.'
      : 'Until these are categorised the ledger balance and the bank statement will not agree, and that difference is exactly the unexplained total.'
  });

  // What an operations lead may know about money: whether the committed
  // payments can go out. Deliberately carries no balance, no headroom and
  // no borrowing position, which is what lets Tony run the workshop
  // without seeing the company's cash position.
  const dueNext7 = documents
    .filter((d) => d.kind === 'purchase' && d.status !== 'paid' && d.dueDate <= addDays(on, 7))
    .reduce((s, d) => s + (d.grossPence - d.paidPence), 0);
  const payrollDue = toPence(2000000);
  out.push({
    domain: 'finance_summary_ops',
    source: 'live ledger',
    label: 'Payment capacity for operational planning',
    asOf: on,
    supplierPaymentsDueThisWeek: bankBalance >= dueNext7 ? 'clear to release on normal terms' : 'needs review before release',
    wagesRunCovered: bankBalance >= payrollDue,
    anyPaymentOnHold: false,
    note: 'A yes or no on whether committed payments can go out. Deliberately carries no balance, no headroom and no borrowing position.'
  });

  out.push({
    domain: 'director_position',
    source: 'live ledger',
    label: "Director and borrowing position, from the posted ledger",
    asOf: on,
    directorsLoanAccountOwedToScott: formatGbp(reports.accountBalance(lines, '2400')),
    termLoanOutstanding: formatGbp(reports.accountBalance(lines, '2300')),
    equipmentFinanceOutstanding: formatGbp(reports.accountBalance(lines, '2310')),
    dividendsPaidThisYear: formatGbp(Math.abs(reports.accountBalance(lines, '3200'))),
    note: 'The company\'s borrowing rests on a personal guarantee from Scott Mercer. This is the owner dependency the demonstration exists to illustrate.'
  });

  return out;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 07A with the three sections the ledger now owns removed. Returned as a
// new object so the module's own export is never mutated: a static record
// that quietly loses fields depending on load order is a bug that only
// shows up in production.
function financeSummaryForBrain(financeSummary) {
  if (!isLive() || !financeSummary) return financeSummary;
  const { cash, debtors, creditors, ...rest } = financeSummary;
  return {
    ...rest,
    supersededNote: 'The cash, debtor and creditor figures that used to sit here are now computed from the posted ledger and appear as separate live records. The figures above are targets and history, which do not move when a transaction is posted.'
  };
}

module.exports = {
  load,
  refresh,
  snapshot,
  isLive,
  asOf,
  latestMonth,
  quarterContaining,
  lastCompleteQuarter,
  financeBrainRecords,
  financeSummaryForBrain
};
