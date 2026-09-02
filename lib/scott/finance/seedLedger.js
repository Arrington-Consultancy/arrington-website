// Scott AI Demonstration - turning the controlled financial record into a
// working ledger.
//
// 07A SCOTT'S FINANCE & ACCOUNTS states the company's position as a set of
// summary figures: a bank balance, a debtor total with its ageing, a
// creditor total, and five months of management accounts. This file turns
// those summaries into the postings that would have produced them, so the
// workspace runs on a real ledger while every canon figure still comes out
// exactly as the controlled document states it.
//
// THE RULE THAT MATTERS: nothing here restates a canon figure. Every total
// is DERIVED from deepBusinessFacts.js and the arithmetic is arranged so
// the derived answer equals the stated one. If somebody edits 07A's debtor
// total, this file follows it. A seed that hardcodes 31400 beside a canon
// record saying 31400 is two facts pretending to be one, and they come
// apart the first time either moves. That is the failure Tom described as
// turning the page and finding the author forgot the previous chapter.
//
// Pure: takes the fact modules as arguments, returns journals, documents
// and bank lines. No database, no clock.

const { VAT_RATE, toPence } = require('./ledger');
const ledger = require('./ledger');

// Splits a total across weighted buckets so the parts sum EXACTLY to the
// total. Rounding each share independently loses or gains pennies, and a
// ledger that is a penny out is a ledger nobody trusts, so the last share
// takes the remainder.
function splitExact(totalPence, weights) {
  const keys = Object.keys(weights);
  const sumW = keys.reduce((s, k) => s + weights[k], 0);
  let allocated = 0;
  const out = {};
  keys.forEach((k, i) => {
    if (i === keys.length - 1) {
      out[k] = totalPence - allocated;
    } else {
      const share = Math.round((totalPence * weights[k]) / sumW);
      out[k] = share;
      allocated += share;
    }
  });
  return out;
}

// How the company's turnover and direct costs divide across the ledger.
// Proportions, not amounts: they shape the fiction without asserting a
// figure that could contradict 07A.
const TURNOVER_MIX = { 4000: 0.60, 4010: 0.13, 4020: 0.07, 4030: 0.20 };
const DIRECT_COST_MIX = { 5000: 0.55, 5010: 0.33, 5020: 0.12 };

// The overheads the company knows the value of, taken from canon where
// canon has them. Everything left over is wages, which is both true of a
// business this size and the arithmetic that guarantees the overhead total
// still equals what 07A states.
function overheadBreakdown(totalPence, finance) {
  const rent = toPence(finance.cash.workshopRentMonthlyGbp);
  const van = toPence(finance.cash.vanFixedCostMonthlyGbp);
  const insurance = Math.round(toPence(finance.cash.insuranceRenewalGbp) / 12);
  const named = {
    6100: rent,
    6300: van,
    6200: insurance,
    6400: toPence(380),
    6500: toPence(210),
    6600: toPence(260),
    6700: toPence(140),
    7000: toPence(95)
  };
  const namedTotal = Object.values(named).reduce((s, v) => s + v, 0);
  const remaining = totalPence - namedTotal;
  // Employer NIC and pension run at roughly a sixth of gross pay here.
  const employer = Math.round(remaining * 0.15);
  return { ...named, 6010: employer, 6000: remaining - employer };
}

function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

// ------------------------------------------------------------
// THE MONTHLY MANAGEMENT ACCOUNTS, AS POSTINGS
// ------------------------------------------------------------
// One journal per month, posting exactly the revenue, direct costs and
// overheads 07A records for it. Sales go to debtors and purchases to
// creditors; the settlement journals below then move the cash. That order
// matters: recognising a sale when the invoice is raised rather than when
// the money arrives is the distinction most owner-managed businesses get
// wrong, so the demonstration should get it right.
function monthlyJournals(finance) {
  return finance.monthlyManagementAccounts.map((m) => {
    const date = monthEnd(m.month);
    const revenue = toPence(m.revenueGbp);
    const direct = toPence(m.directCostsGbp);
    const overheads = toPence(m.overheadsGbp);
    const lines = [];

    const sales = splitExact(revenue, TURNOVER_MIX);
    let salesVat = 0;
    Object.keys(sales).forEach((code) => {
      lines.push(ledger.line(code, 0, sales[code]));
      salesVat += ledger.vatOnNet(sales[code]);
    });
    lines.push(ledger.line('1100', revenue + salesVat, 0));
    lines.push(ledger.line('2200', 0, salesVat));

    // Materials and transport carry recoverable VAT and are bought on
    // account. Direct labour is people, so it carries neither: it lands in
    // the payroll control accounts like the rest of the wage bill.
    const costs = splitExact(direct, DIRECT_COST_MIX);
    let purchaseVat = 0;
    let onAccount = 0;
    Object.keys(costs).forEach((code) => {
      lines.push(ledger.line(code, costs[code], 0));
      if (code !== '5010') {
        const vat = ledger.vatOnNet(costs[code]);
        purchaseVat += vat;
        onAccount += costs[code] + vat;
      }
    });

    const oh = overheadBreakdown(overheads, finance);
    let payroll = 0;
    Object.keys(oh).forEach((code) => {
      lines.push(ledger.line(code, oh[code], 0));
      if (code === '6000' || code === '6010') {
        payroll += oh[code];
      } else if (code !== '7000') {
        const vat = ledger.vatOnNet(oh[code]);
        purchaseVat += vat;
        onAccount += oh[code] + vat;
      } else {
        // Loan interest is not bought on account: it accrues into the
        // borrowing, which the direct debit in borrowingJournals then
        // pays down along with the principal.
        lines.push(ledger.line('2300', 0, oh[code]));
      }
    });

    lines.push(ledger.line('2200', purchaseVat, 0));
    lines.push(ledger.line('2100', 0, onAccount));
    // Labour: the direct-labour element plus the wage bill in overheads.
    // Net pay is settled through the bank in the settlement journals; the
    // deductions sit in the PAYE and pension control accounts, which is
    // where they belong until they are paid over.
    const labour = costs['5010'] + payroll;
    const paye = Math.round(labour * 0.18);
    const pension = Math.round(labour * 0.04);
    lines.push(ledger.line('2210', 0, paye));
    lines.push(ledger.line('2220', 0, pension));
    lines.push(ledger.line('1200', 0, labour - paye - pension));

    return {
      date,
      memo: `Management accounts, ${m.month}${m.forecast ? ' (forecast)' : ''}`,
      source: 'management_accounts',
      sourceRef: m.month,
      lines: ledger.mergeSameAccount(lines)
    };
  });
}

// ------------------------------------------------------------
// SETTLEMENT
// ------------------------------------------------------------
// Customers pay and suppliers get paid. The amounts are not chosen: they
// are whatever it takes to land the control accounts on the totals 07A
// states, computed from the postings above rather than typed in.
function settlementJournals(finance, journalsSoFar) {
  const balance = (code) => journalsSoFar
    .flatMap((j) => j.lines)
    .filter((l) => l.accountCode === code)
    .reduce((s, l) => s + (l.debitPence || 0) - (l.creditPence || 0), 0);

  const debtorsNow = balance('1100');
  const creditorsNow = -balance('2100');
  const receipts = debtorsNow - toPence(finance.debtors.totalGbp);
  const payments = creditorsNow - toPence(finance.creditors.totalGbp);
  const date = monthEnd(finance.monthlyManagementAccounts[finance.monthlyManagementAccounts.length - 1].month);

  const out = [];
  if (receipts > 0) {
    out.push({
      date,
      memo: 'Customer receipts banked, April to August',
      source: 'customer_receipt',
      sourceRef: null,
      lines: [ledger.line('1200', receipts, 0), ledger.line('1100', 0, receipts)]
    });
  }
  if (payments > 0) {
    out.push({
      date,
      memo: 'Supplier payments made, April to August',
      source: 'supplier_payment',
      sourceRef: null,
      lines: [ledger.line('2100', payments, 0), ledger.line('1200', 0, payments)]
    });
  }
  return out;
}

// ------------------------------------------------------------
// OPENING BALANCES
// ------------------------------------------------------------
// Posted at the last day of the previous financial year, so the year that
// follows is entirely made of the transactions above.
//
// Two figures here are solved for rather than stated. The opening BANK
// balance is whatever makes the closing balance equal 07A's, given the
// year's cash movements. Opening RETAINED EARNINGS is whatever makes the
// opening balance sheet balance, which is what retained earnings actually
// is. Everything else comes from canon.
function openingJournal({ finance, director, tax, borrowing, equipment }, yearJournals) {
  const cashMovement = yearJournals
    .flatMap((j) => j.lines)
    .filter((l) => l.accountCode === '1200')
    .reduce((s, l) => s + (l.debitPence || 0) - (l.creditPence || 0), 0);

  const openingBank = toPence(finance.cash.bankBalanceGbp) - cashMovement;
  const fixedAssets = equipment.reduce((s, e) => s + toPence(e.bookValueGbp || 0), 0);

  // Solved backwards, the same way the opening bank balance is. Canon
  // states each balance as it stands at the END of the period, so the
  // opening figure is that balance less whatever the year's postings did
  // to it. Stating the closing figure as the opening one would leave both
  // loans exactly where they started for five months while their direct
  // debits are named in the same document.
  const movementOn = (code) => yearJournals
    .flatMap((j) => j.lines)
    .filter((l) => l.accountCode === code)
    .reduce((s, l) => s + (l.creditPence || 0) - (l.debitPence || 0), 0);

  const termLoan = toPence((borrowing.find((b) => b.kind === 'term_loan') || {}).outstandingPrincipalGbp || 0) - movementOn('2300');
  const equipFinance = toPence((borrowing.find((b) => b.kind === 'equipment_finance') || {}).outstandingGbp || 0) - movementOn('2310');
  const dla = toPence(director.directorsLoanAccount.currentBalanceGbp) - movementOn('2400');

  const debits = [
    ['0050', fixedAssets],
    ['1001', toPence(18400)],
    ['1200', openingBank],
    ['1210', toPence(finance.cash.vatReserveGbp)]
  ];
  const credits = [
    ['2300', termLoan],
    ['2310', equipFinance],
    ['2400', dla],
    ['3000', toPence(100)]
  ];

  const debitTotal = debits.reduce((s, [, v]) => s + v, 0);
  const creditTotal = credits.reduce((s, [, v]) => s + v, 0);
  const retained = debitTotal - creditTotal;

  const lines = [
    ...debits.map(([c, v]) => ledger.line(c, v, 0)),
    ...credits.map(([c, v]) => ledger.line(c, 0, v))
  ];
  // Retained earnings can legitimately be either sign. A company that has
  // lost money since incorporation carries a debit balance here, and
  // refusing to represent that would be a bookkeeping system that only
  // works for businesses doing well.
  lines.push(retained >= 0 ? ledger.line('3100', 0, retained) : ledger.line('3100', -retained, 0));

  return {
    date: '2026-03-31',
    memo: 'Opening balances brought forward at 31 March 2026',
    source: 'opening_balance',
    sourceRef: null,
    lines: ledger.mergeSameAccount(lines)
  };
}

// Dividends and the director's repayment actually happened in the year and
// are in canon, so they are posted rather than folded into an opening
// figure. They are also the clearest illustration of why the director's
// position is a narrower clearance than the company's accounts.
// The loan and the equipment finance actually get paid every month, and
// until this was written they did not: the opening balance was posted and
// nothing ever reduced it, so the borrowing sat frozen for five months
// while the direct debits named in canon never left the bank. Found by a
// canary sweep noticing a figure that should have moved and had not.
//
// The interest accrues into the loan and the direct debit pays it down, so
// the difference is the principal repaid. The OPENING principal is solved
// backwards from the outstanding balance canon states, so the closing
// figure still comes out exactly as 07's borrowing schedule says it does.
function borrowingJournals(finance, borrowing) {
  const out = [];
  const months = finance.monthlyManagementAccounts;
  const term = borrowing.find((b) => b.kind === 'term_loan');
  const equip = borrowing.find((b) => b.kind === 'equipment_finance');
  months.forEach((m) => {
    const date = monthEnd(m.month);
    if (term) {
      out.push({
        date,
        memo: `Term loan repayment, ${m.month}`,
        source: 'loan_repayment',
        sourceRef: null,
        lines: [ledger.line('2300', toPence(term.monthlyPaymentGbp), 0), ledger.line('1200', 0, toPence(term.monthlyPaymentGbp))]
      });
    }
    if (equip) {
      out.push({
        date,
        memo: `Equipment finance payment, ${m.month}`,
        source: 'loan_repayment',
        sourceRef: null,
        lines: [ledger.line('2310', toPence(equip.monthlyPaymentGbp), 0), ledger.line('1200', 0, toPence(equip.monthlyPaymentGbp))]
      });
    }
  });
  return out;
}

function directorJournals(director) {
  const out = [];
  (director.dividends.fy2627Payments || []).forEach((p) => {
    out.push({
      date: p.date,
      memo: `Dividend paid to Scott Mercer`,
      source: 'dividend',
      sourceRef: null,
      lines: [ledger.line('3200', toPence(p.amountGbp), 0), ledger.line('1200', 0, toPence(p.amountGbp))]
    });
  });
  (director.directorsLoanAccount.ledger || [])
    .filter((e) => String(e.date) >= '2026-04-01')
    .forEach((e) => {
      const amt = toPence(Math.abs(e.movementGbp));
      if (!amt) return;
      out.push({
        date: e.date,
        memo: `Director's loan account: ${e.event}`,
        source: 'director_loan',
        sourceRef: null,
        lines: e.movementGbp < 0
          ? [ledger.line('2400', amt, 0), ledger.line('1200', 0, amt)]
          : [ledger.line('1200', amt, 0), ledger.line('2400', 0, amt)]
      });
    });
  return out;
}

// ------------------------------------------------------------
// THE WHOLE SEED
// ------------------------------------------------------------
function buildLedgerSeed(canon) {
  const { finance, director } = canon;
  const activity = [
    ...monthlyJournals(finance),
    ...borrowingJournals(finance, canon.borrowing),
    ...directorJournals(director)
  ];
  const settled = [...activity, ...settlementJournals(finance, activity)];
  const opening = openingJournal(canon, settled);
  return [opening, ...settled].sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = {
  splitExact,
  borrowingJournals,
  TURNOVER_MIX,
  DIRECT_COST_MIX,
  overheadBreakdown,
  monthlyJournals,
  settlementJournals,
  openingJournal,
  directorJournals,
  buildLedgerSeed
};

// ------------------------------------------------------------
// THE SUB-LEDGERS
// ------------------------------------------------------------
// The control accounts are already correct: 1100 lands on 07A's debtor
// total and 2100 on its creditor total, because the settlement journals
// above were solved for exactly that. These are the individual invoices
// and bills BEHIND those totals, and they are generated to sum to the same
// figure rather than to a number typed here. A sub-ledger that does not
// agree with its control account is the single most common defect in a
// small company's books, so a test asserts the two agree.
//
// The named parties come from canon: 07A names the two largest debtors,
// 07V names the live jobs and their customers, 07I names the suppliers.

// Aged debtors are built BUCKET FIRST, because the buckets are the
// constraint 07A actually states and because one of them is not free.
// 07A names its two largest debtors with their amounts and their days
// overdue (Moorland Holiday Lets GBP 3,600 at 43 days, Devon Hearth Cafe
// Group GBP 1,950 at 36 days). Both fall in the 31 to 60 day bucket and
// together they come to GBP 5,550, which is GBP 450 more than the GBP
// 5,100 the same document gives as that bucket's total. The two
// statements cannot both be true.
//
// Rather than quietly adjust a named debtor to make the sum work, the
// named invoices are honoured exactly, the other three buckets are set
// exactly as 07A states them, and the GBP 450 comes out of the current
// bucket, which 07A does not itemise. The residual difference against
// 07A's stated ageing is raised as a Brain Gap for a human, not absorbed
// silently: a system that adjusts the controlled record to fit its own
// arithmetic is exactly what this demonstration must never do.
const SALES_BUCKETS = [
  {
    bucket: 'over60',
    totalFrom: 'overdueOver60Gbp',
    invoices: [{ daysOverdue: 68, party: 'Westhill Care Home Ltd', ref: 'trade account, disputed carriage line', accountCode: '4030', balancing: true }]
  },
  {
    bucket: 'days31to60',
    invoices: [
      { daysOverdue: 43, fromCanon: 'largest', ref: 'holiday let seating refurbishment batch', accountCode: '4030' },
      { daysOverdue: 36, fromCanon: 'secondLargest', ref: 'seating refresh, two sites', accountCode: '4030' }
    ]
  },
  {
    bucket: 'days1to30',
    totalFrom: 'overdue1to30Gbp',
    invoices: [
      // 07V quotes this job at GBP 760, so that is what it is invoiced at.
      { daysOverdue: 21, jobQuote: 760, party: 'Harbour View Guest House Ltd', ref: 'two-chair refresh batch, SAKS-1052', accountCode: '4030' },
      { daysOverdue: 14, party: 'Tavistock Lodge Hotel Ltd', ref: 'trade account, August', accountCode: '4030', balancing: true }
    ]
  },
  {
    bucket: 'current',
    invoices: [
      // Named customers are invoiced at the amount 07V actually quotes for
      // their job. Inventing a four-figure invoice for a GBP 300 repair
      // would contradict the job record two screens away, which is the
      // kind of thing a prospect spots immediately.
      { daysOverdue: -6, jobQuote: 385, party: 'Elaine Rogers', ref: 'structural frame repair, SAKS-1045', accountCode: '4000' },
      { daysOverdue: -9, jobQuote: 430, party: 'Jane Fletcher', ref: 'structural repair and re-cover, SAKS-1047', accountCode: '4000' },
      { daysOverdue: -13, jobQuote: 300, party: 'Priya Patel', ref: 'standard repair, SAKS-1041', accountCode: '4000' },
      { daysOverdue: -17, jobQuote: 245, party: 'Hannah Brooks', ref: 'standard seat refresh, SAKS-1050', accountCode: '4000' },
      { daysOverdue: -19, jobQuote: 245, party: 'Paul Turner', ref: 'standard repair, SAKS-1048', accountCode: '4000' },
      { daysOverdue: -22, jobQuote: 265, party: 'Olivia Grant', ref: 'standard refresh, SAKS-1049', accountCode: '4000' },
      { daysOverdue: -24, jobQuote: 375, party: 'George Salter', ref: 'structural arm reinforcement, SAKS-1051', accountCode: '4000' },
      // Trade accounts carry the balance. A company billing GBP 47,000 a
      // month holds most of its debtor book in accounts, not in single
      // consumer repairs, so this is where the weight belongs.
      { daysOverdue: -3, weight: 0.46, party: 'Dartmoor Inns Group Ltd', ref: 'trade account, August', accountCode: '4030', balancing: true },
      { daysOverdue: -11, weight: 0.33, party: 'Plymouth Care Partnership Ltd', ref: 'trade account, August', accountCode: '4030', balancing: true },
      { daysOverdue: -27, weight: 0.21, party: 'Salcombe Coastal Lettings Ltd', ref: 'trade account, August', accountCode: '4030', balancing: true }
    ]
  }
];

const PURCHASE_PLAN = [
  { daysToDue: 4, weight: 0.26, party: 'South Devon Foam & Webbing Ltd', ref: 'August account', accountCode: '5000' },
  { daysToDue: 6, weight: 0.11, party: 'Tamar Yarn Supplies', ref: 'yarn, August', accountCode: '5000' },
  { daysToDue: 17, weight: 0.24, party: 'Heritage Fabrics South West', ref: 'special order fabric PO-260819-039', accountCode: '5000' },
  { daysToDue: 22, weight: 0.16, party: 'Westbridge & Cole Chartered Accountants Ltd', ref: 'quarterly accountancy', accountCode: '6500' },
  { daysToDue: 25, weight: 0.13, party: 'Plymouth Industrial Estates Ltd', ref: 'workshop rent, September', accountCode: '6100' },
  { daysToDue: 28, weight: 0.10, party: 'Devon Trade Adhesives Ltd', ref: 'adhesives and finishing', accountCode: '5000' }
];

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Gross totals are the constraint. The weighted entries share whatever is
// left after the canon-named ones are honoured, and the final entry takes
// the remainder so the sub-ledger sums to the control account to the penny.
function buildSalesDocuments(finance, asOf) {
  const totalPence = toPence(finance.debtors.totalGbp);
  const planned = [];

  // Every bucket except `current` has a total it must hit: either the
  // figure 07A states, or the sum of the canon-named invoices in it.
  // Within a bucket, invoices with a job quote are fixed at that quote and
  // the ones marked `balancing` share whatever is left, so the bucket
  // total, the named invoices and the job records all stay true at once.
  function fill(invoices, bucketTotalPence) {
    const fixedPence = invoices
      .filter((i) => !i.balancing)
      .reduce((s, i) => s + (i.fromCanon ? toPence(finance.debtors[i.fromCanon].amountGbp) : toPence(i.jobQuote)), 0);
    const balancing = invoices.filter((i) => i.balancing);
    const shares = balancing.length
      ? splitExact(bucketTotalPence - fixedPence, Object.fromEntries(balancing.map((i, idx) => [idx, i.weight || 1])))
      : {};
    return invoices.map((i) => ({
      ...i,
      party: i.fromCanon ? finance.debtors[i.fromCanon].customer : i.party,
      gross: i.balancing
        ? shares[balancing.indexOf(i)]
        : (i.fromCanon ? toPence(finance.debtors[i.fromCanon].amountGbp) : toPence(i.jobQuote))
    }));
  }

  let fixedBucketTotal = 0;
  SALES_BUCKETS.filter((b) => b.bucket !== 'current').forEach((b) => {
    const bucketTotal = b.totalFrom
      ? toPence(finance.debtors[b.totalFrom])
      : b.invoices.reduce((s, i) => s + toPence(finance.debtors[i.fromCanon].amountGbp), 0);
    fixedBucketTotal += bucketTotal;
    planned.push(...fill(b.invoices, bucketTotal));
  });
  const current = SALES_BUCKETS.find((b) => b.bucket === 'current');
  planned.push(...fill(current.invoices, totalPence - fixedBucketTotal));

  return planned.map((p, idx) => {
    const dueDate = addDays(asOf, -p.daysOverdue);
    const split = ledger.splitGross(p.gross);
    return {
      kind: 'sales',
      ref: `INV-26${String(1001 + idx)}`,
      party: p.party,
      description: p.ref,
      documentDate: addDays(dueDate, -30),
      dueDate,
      grossPence: p.gross,
      netPence: split.netPence,
      vatPence: split.vatPence,
      paidPence: 0,
      accountCode: p.accountCode,
      status: 'open'
    };
  });
}

function buildPurchaseDocuments(finance, asOf) {
  const totalPence = toPence(finance.creditors.totalGbp);
  const shares = splitExact(totalPence, Object.fromEntries(PURCHASE_PLAN.map((p, i) => [i, p.weight])));
  return PURCHASE_PLAN.map((p, i) => {
    const gross = shares[i];
    return {
      kind: 'purchase',
      ref: `BILL-26${String(2000 + i + 1)}`,
      party: p.party,
      description: p.ref,
      documentDate: addDays(asOf, p.daysToDue - 30),
      dueDate: addDays(asOf, p.daysToDue),
      grossPence: gross,
      netPence: ledger.splitGross(gross).netPence,
      vatPence: ledger.splitGross(gross).vatPence,
      paidPence: 0,
      accountCode: p.accountCode,
      status: 'open'
    };
  });
}

// ------------------------------------------------------------
// THE BANK STATEMENT
// ------------------------------------------------------------
// Deliberately NOT a copy of the ledger. Four lines arrive unexplained, so
// the Reconciliation screen has genuine work on it and the statement
// balance differs from the ledger balance by exactly the unexplained
// total. A reconciliation screen showing "0 items" proves nothing and
// demonstrates nothing; this one can actually be worked through in front
// of somebody.
const UNRECONCILED = [
  { date: '2026-08-27', description: 'CARD PAYMENT TOOLSTATION PLYMOUTH', amountGbp: -186.4, hint: 'workshop consumables, looks like materials' },
  { date: '2026-08-26', description: 'FASTER PAYMENT IN, REF WESTHILL CARE', amountGbp: 1420, hint: 'part payment against the disputed trade account' },
  { date: '2026-08-24', description: 'DD SOUTHWEST WATER', amountGbp: -74.2, hint: 'utilities, not yet categorised' },
  { date: '2026-08-21', description: 'CARD PAYMENT META PLATFORMS IRELAND', amountGbp: -240, hint: 'advertising spend, no invoice yet received' }
];

function buildBankStatement(journals) {
  const explained = journals
    .filter((j) => j.date >= '2026-08-01')
    .map((j) => {
      const bank = j.lines.find((l) => l.accountCode === '1200');
      if (!bank) return null;
      const amount = (bank.debitPence || 0) - (bank.creditPence || 0);
      if (!amount) return null;
      return { date: j.date, description: j.memo, amountPence: amount, matched: true, sourceRef: j.sourceRef || null };
    })
    .filter(Boolean);
  const unexplained = UNRECONCILED.map((t) => ({
    date: t.date,
    description: t.description,
    amountPence: toPence(t.amountGbp),
    matched: false,
    hint: t.hint
  }));
  return [...explained, ...unexplained].sort((a, b) => b.date.localeCompare(a.date));
}

module.exports.buildSalesDocuments = buildSalesDocuments;
module.exports.buildPurchaseDocuments = buildPurchaseDocuments;
module.exports.buildBankStatement = buildBankStatement;
module.exports.UNRECONCILED = UNRECONCILED;
