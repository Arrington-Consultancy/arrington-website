// Scott AI Demonstration - the accounting engine.
//
// Every case here runs without a database, because the engine is pure.
// The ones that matter most are not the arithmetic but the two properties
// the whole area rests on: the ledger balances, and the figures it derives
// reproduce the controlled 07A record exactly rather than approximately.

const test = require('node:test');
const assert = require('node:assert');

const facts = require('../../lib/scott/deepBusinessFacts');
const ledger = require('../../lib/scott/finance/ledger');
const reports = require('../../lib/scott/finance/reports');
const seedLedger = require('../../lib/scott/finance/seedLedger');
const chart = require('../../lib/scott/finance/chartOfAccounts');

const CANON = {
  finance: facts.FINANCE_SUMMARY,
  director: facts.DIRECTOR_POSITION,
  tax: facts.TAX_POSITION,
  borrowing: facts.BORROWING_SCHEDULE,
  equipment: facts.EQUIPMENT_REGISTER
};

function seededLines() {
  return seedLedger.buildLedgerSeed(CANON)
    .flatMap((j) => j.lines.map((l) => ({ ...l, date: j.date, source: j.source })));
}

// ------------------------------------------------------------
// Money
// ------------------------------------------------------------
test('money is handled in whole pence, so nothing drifts', () => {
  assert.strictEqual(ledger.toPence(0.1 + 0.2), 30);
  assert.strictEqual(ledger.toPence(1250.005), 125001);
  assert.strictEqual(ledger.formatGbp(125000), '£1,250.00');
  assert.strictEqual(ledger.formatGbp(-45), '-£0.45');
});

test('splitting a VAT-inclusive amount loses no penny', () => {
  for (const gross of [12000, 10001, 99999, 7, 186040]) {
    const { netPence, vatPence } = ledger.splitGross(gross);
    assert.strictEqual(netPence + vatPence, gross, `gross ${gross} did not split cleanly`);
  }
});

// ------------------------------------------------------------
// Validation refuses rather than corrects
// ------------------------------------------------------------
test('an unbalanced journal is refused, and the refusal names the difference', () => {
  const r = ledger.validateJournal({
    date: '2026-09-01', memo: 'test',
    lines: [ledger.line('6800', 10000, 0), ledger.line('1200', 0, 6000)]
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('£40.00')), `difference not named: ${r.errors.join(' ')}`);
});

test('an unknown account is refused, including one borrowed from the prototype chain', () => {
  for (const code of ['9999', 'constructor', 'toString', '__proto__']) {
    const r = ledger.validateJournal({
      date: '2026-09-01', memo: 'test',
      lines: [ledger.line(code, 100, 0), ledger.line('1200', 0, 100)]
    });
    assert.strictEqual(r.ok, false, `${code} was accepted as an account`);
  }
});

test('a journal with one line, no memo, no date or a negative amount is refused', () => {
  assert.strictEqual(ledger.validateJournal({ date: '2026-09-01', memo: 'x', lines: [ledger.line('1200', 100, 0)] }).ok, false);
  assert.strictEqual(ledger.validateJournal({ date: '2026-09-01', memo: '', lines: [ledger.line('1200', 100, 0), ledger.line('4000', 0, 100)] }).ok, false);
  assert.strictEqual(ledger.validateJournal({ date: 'soon', memo: 'x', lines: [ledger.line('1200', 100, 0), ledger.line('4000', 0, 100)] }).ok, false);
  assert.strictEqual(ledger.validateJournal({ date: '2026-09-01', memo: 'x', lines: [{ accountCode: '1200', debitPence: -100, creditPence: 0 }, ledger.line('4000', 0, 100)] }).ok, false);
});

test('merging lines for the same account changes presentation, never the totals', () => {
  const raw = [ledger.line('4000', 0, 5000), ledger.line('4000', 0, 3000), ledger.line('1100', 8000, 0)];
  const before = ledger.journalTotals(raw);
  const after = ledger.journalTotals(ledger.mergeSameAccount(raw));
  assert.deepStrictEqual(after, before);
});

// ------------------------------------------------------------
// The posting builders
// ------------------------------------------------------------
test('a sales invoice debits the customer the gross and splits net from VAT', () => {
  const j = ledger.salesInvoiceJournal({
    date: '2026-09-01', ref: 'INV-1', customer: 'A Customer',
    lines: [{ accountCode: '4000', netPence: 100000 }]
  });
  assert.ok(ledger.validateJournal(j).ok);
  assert.strictEqual(j.lines.find((l) => l.accountCode === '1100').debitPence, 120000);
  assert.strictEqual(j.lines.find((l) => l.accountCode === '4000').creditPence, 100000);
  assert.strictEqual(j.lines.find((l) => l.accountCode === '2200').creditPence, 20000);
});

test('a supplier bill is the mirror image and reclaims the VAT', () => {
  const j = ledger.supplierBillJournal({
    date: '2026-09-01', ref: 'BILL-1', supplier: 'A Supplier',
    lines: [{ accountCode: '5000', netPence: 50000 }]
  });
  assert.ok(ledger.validateJournal(j).ok);
  assert.strictEqual(j.lines.find((l) => l.accountCode === '2100').creditPence, 60000);
  assert.strictEqual(j.lines.find((l) => l.accountCode === '2200').debitPence, 10000);
});

test('a receipt moves cash and clears the debtor without recognising income again', () => {
  const j = ledger.customerReceiptJournal({ date: '2026-09-01', customer: 'A', amountPence: 50000 });
  assert.ok(ledger.validateJournal(j).ok);
  assert.ok(!j.lines.some((l) => chart.account(l.accountCode).type === 'income'),
    'a receipt recognised income, which would double-count the sale');
});

test('categorising a bank line posts the right way round for money in and money out', () => {
  const out = ledger.categorisationJournal({ date: '2026-09-01', description: 'card payment', amountPence: -18640, accountCode: '5000' });
  assert.ok(ledger.validateJournal(out).ok);
  assert.strictEqual(out.lines.find((l) => l.accountCode === '1200').creditPence, 18640);
  const inn = ledger.categorisationJournal({ date: '2026-09-01', description: 'payment in', amountPence: 142000, accountCode: '4030' });
  assert.ok(ledger.validateJournal(inn).ok);
  assert.strictEqual(inn.lines.find((l) => l.accountCode === '1200').debitPence, 142000);
});

// ------------------------------------------------------------
// The properties the whole area rests on
// ------------------------------------------------------------
test('every seeded journal is valid and the whole ledger balances', () => {
  const journals = seedLedger.buildLedgerSeed(CANON);
  journals.forEach((j) => {
    const v = ledger.validateJournal(j);
    assert.ok(v.ok, `"${j.memo}" is invalid: ${v.errors.join(' ')}`);
  });
  const tb = reports.trialBalance(seededLines());
  assert.ok(tb.balances, `trial balance out by ${ledger.formatGbp(tb.debitPence - tb.creditPence)}`);
  assert.ok(tb.debitPence > 0, 'a trial balance of nothing balances trivially and proves nothing');
});

test('the derived monthly profit and loss reproduces 07A exactly, month by month', () => {
  const lines = seededLines();
  const canonMonths = facts.FINANCE_SUMMARY.monthlyManagementAccounts;
  const derived = reports.monthlyProfitAndLoss(lines, { months: canonMonths.map((m) => m.month) });
  canonMonths.forEach((m, i) => {
    const d = derived[i];
    assert.strictEqual(d.revenuePence, ledger.toPence(m.revenueGbp), `${m.month} revenue`);
    assert.strictEqual(d.directCostsPence, ledger.toPence(m.directCostsGbp), `${m.month} direct costs`);
    assert.strictEqual(d.grossProfitPence, ledger.toPence(m.grossProfitGbp), `${m.month} gross profit`);
    assert.strictEqual(d.overheadsPence, ledger.toPence(m.overheadsGbp), `${m.month} overheads`);
    assert.strictEqual(d.operatingProfitPence, ledger.toPence(m.operatingProfitGbp), `${m.month} operating profit`);
  });
});

test('every control account lands on the figure the controlled record states', () => {
  const lines = seededLines();
  const F = facts.FINANCE_SUMMARY;
  const term = facts.BORROWING_SCHEDULE.find((b) => b.kind === 'term_loan');
  const equip = facts.BORROWING_SCHEDULE.find((b) => b.kind === 'equipment_finance');
  const expected = [
    ['1200', F.cash.bankBalanceGbp, 'bank'],
    ['1210', F.cash.vatReserveGbp, 'VAT reserve'],
    ['1100', F.debtors.totalGbp, 'debtors'],
    ['2100', F.creditors.totalGbp, 'creditors'],
    ['2400', facts.DIRECTOR_POSITION.directorsLoanAccount.currentBalanceGbp, "director's loan"],
    ['2300', term.outstandingPrincipalGbp, 'term loan'],
    ['2310', equip.outstandingGbp, 'equipment finance']
  ];
  expected.forEach(([code, gbp, name]) => {
    assert.strictEqual(reports.accountBalance(lines, code), ledger.toPence(gbp), `${name} does not match canon`);
  });
});

test('the borrowing actually amortises rather than sitting frozen for the year', () => {
  const lines = seededLines();
  const opening = lines.filter((l) => l.source === 'opening_balance' && l.accountCode === '2300')
    .reduce((s, l) => s + l.creditPence - l.debitPence, 0);
  const closing = reports.accountBalance(lines, '2300');
  assert.ok(opening > closing, 'the term loan did not reduce over the year');
});

test('the balance sheet balances, and says so honestly when it is only a slice', () => {
  const lines = seededLines();
  const full = reports.balanceSheet(lines, { asOf: '2026-08-31' });
  assert.ok(full.balances, `out by ${ledger.formatGbp(full.differencePence)}`);
  assert.strictEqual(full.partial, false);
  const slice = reports.balanceSheet(lines, { asOf: '2026-08-31', canSeeDomain: (d) => d === 'invoice_status' });
  assert.strictEqual(slice.partial, true, 'a filtered balance sheet must declare itself partial');
});

test('the sub-ledgers agree with their control accounts to the penny', () => {
  const lines = seededLines();
  const asOf = '2026-08-31';
  const sales = seedLedger.buildSalesDocuments(facts.FINANCE_SUMMARY, asOf);
  const purchase = seedLedger.buildPurchaseDocuments(facts.FINANCE_SUMMARY, asOf);
  assert.strictEqual(sales.reduce((s, d) => s + d.grossPence, 0), reports.accountBalance(lines, '1100'));
  assert.strictEqual(purchase.reduce((s, d) => s + d.grossPence, 0), reports.accountBalance(lines, '2100'));
});

test('a named debtor is invoiced at the amount the job record quotes', () => {
  // Guards a real defect: the first version generated four-figure invoices
  // for named individuals whose jobs are quoted at a few hundred pounds in
  // 07V, two screens away.
  const sales = seedLedger.buildSalesDocuments(facts.FINANCE_SUMMARY, '2026-08-31');
  const byParty = Object.fromEntries(sales.map((d) => [d.party, d.grossPence]));
  facts.CURRENT_JOBS.forEach((job) => {
    if (byParty[job.customer] === undefined) return;
    assert.strictEqual(byParty[job.customer], ledger.toPence(job.quoteGbp),
      `${job.customer} is invoiced at a figure the job record contradicts`);
  });
});

test('the two debtors 07A names by amount appear at exactly those amounts', () => {
  const sales = seedLedger.buildSalesDocuments(facts.FINANCE_SUMMARY, '2026-08-31');
  [facts.FINANCE_SUMMARY.debtors.largest, facts.FINANCE_SUMMARY.debtors.secondLargest].forEach((d) => {
    const found = sales.find((s) => s.party === d.customer);
    assert.ok(found, `${d.customer} is missing from the sales ledger`);
    assert.strictEqual(found.grossPence, ledger.toPence(d.amountGbp));
  });
});

test('reconciliation opens with real work on it', () => {
  const journals = seedLedger.buildLedgerSeed(CANON);
  const rec = reports.reconciliationSummary(seedLedger.buildBankStatement(journals));
  assert.ok(rec.unmatchedCount > 0, 'a reconciliation screen with nothing to do demonstrates nothing');
  assert.strictEqual(rec.fullyReconciled, false);
});

// ------------------------------------------------------------
// Clearance is applied before arithmetic
// ------------------------------------------------------------
test('a report filtered for clearance totals only what the reader may see', () => {
  const lines = seededLines();
  const salesOnly = (d) => d === 'invoice_status';
  const pl = reports.profitAndLoss(lines, { from: '2026-04-01', to: '2026-08-31', canSeeDomain: salesOnly });
  assert.strictEqual(pl.turnover.totalPence, 0, 'turnover reached a reader with no clearance for it');
  assert.strictEqual(pl.overheads.totalPence, 0);
  const full = reports.profitAndLoss(lines, { from: '2026-04-01', to: '2026-08-31' });
  assert.ok(full.turnover.totalPence > 0, 'the unfiltered control produced nothing, so the test proves nothing');
});

test('the VAT return, cashflow and reconciliation refuse a reader without full finance clearance', () => {
  const lines = seededLines();
  const no = () => false;
  assert.strictEqual(reports.vatReturn(lines, { canSeeDomain: no }).cleared, false);
  assert.strictEqual(reports.cashflowByMonth(lines, { canSeeDomain: no }).cleared, false);
  assert.strictEqual(reports.reconciliationSummary([], { canSeeDomain: no }).cleared, false);
});

test('settling VAT with HMRC is not mistaken for reclaiming it', () => {
  const lines = seededLines().concat([
    { accountCode: '2200', debitPence: 500000, creditPence: 0, date: '2026-05-07', source: 'vat_payment' },
    { accountCode: '1200', debitPence: 0, creditPence: 500000, date: '2026-05-07', source: 'vat_payment' }
  ]);
  const r = reports.vatReturn(lines, { from: '2026-04-01', to: '2026-06-30' });
  const without = reports.vatReturn(seededLines(), { from: '2026-04-01', to: '2026-06-30' });
  assert.strictEqual(r.box4VatReclaimedPence, without.box4VatReclaimedPence,
    'paying VAT over increased the amount reclaimed');
});
