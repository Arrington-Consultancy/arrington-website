// Scott AI Demonstration - the accounting engine.
//
// Pure. No database, no clock beyond what it is handed, no network. Every
// figure the Banking & Accounting workspace displays and every figure the
// AI reasons from is produced by a function in this file from a list of
// journal lines, which means all of it can be tested without a running
// system, and none of it can drift apart from the rest.
//
// WHY DOUBLE ENTRY IN A DEMONSTRATION. It would have been quicker to store
// a balance, a debtor total and a profit figure as three numbers and update
// them when something happens. That is also exactly how a fictional company
// starts contradicting itself: the invoice is raised, the debtor total goes
// up, and the sales figure quietly does not. A prospect notices that in
// about ninety seconds. Here, raising an invoice posts one balanced journal
// and every report recomputes from it, so the sales figure, the debtor
// total, the VAT liability and the balance sheet cannot disagree. The
// arithmetic enforces the consistency the story needs.
//
// MONEY IS IN PENCE, as integers, everywhere inside this module. Floating
// point pounds drift, and a ledger that does not balance to the penny is
// worse than no ledger at all: it makes every other number suspect.
// Conversion happens at the edges, in toPence/formatGbp.

const { account, normalSide, VAT_RATE } = require('./chartOfAccounts');

// ------------------------------------------------------------
// MONEY
// ------------------------------------------------------------
function toPence(gbp) {
  const n = Number(gbp);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function fromPence(pence) {
  return Math.round(Number(pence) || 0) / 100;
}

function formatGbp(pence) {
  const v = fromPence(pence);
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? '-' : ''}£${s}`;
}

// VAT on a NET amount, rounded to the penny. Kept as its own function so
// every posting path rounds identically: two paths rounding differently is
// how a VAT control account ends up a penny out and nobody can find it.
function vatOnNet(netPence, rate = VAT_RATE) {
  return Math.round(Number(netPence) * Number(rate));
}

// Splitting a VAT-inclusive amount, which is what a bank line gives you.
function splitGross(grossPence, rate = VAT_RATE) {
  const net = Math.round(Number(grossPence) / (1 + Number(rate)));
  return { netPence: net, vatPence: Number(grossPence) - net };
}

// ------------------------------------------------------------
// JOURNALS
// ------------------------------------------------------------
// A journal is a date, a memo, a source, and lines that balance. Nothing
// reaches the database without passing validateJournal, and validate
// refuses rather than correcting: silently balancing somebody's journal by
// posting the difference to a suspense account is how a real ledger
// acquires a number nobody can explain.
function line(code, debitPence = 0, creditPence = 0) {
  return {
    accountCode: String(code),
    debitPence: Math.round(debitPence) || 0,
    creditPence: Math.round(creditPence) || 0
  };
}

function journalTotals(lines = []) {
  return lines.reduce(
    (acc, l) => ({
      debitPence: acc.debitPence + (Math.round(l.debitPence) || 0),
      creditPence: acc.creditPence + (Math.round(l.creditPence) || 0)
    }),
    { debitPence: 0, creditPence: 0 }
  );
}

function validateJournal(journal) {
  const errors = [];
  const lines = Array.isArray(journal && journal.lines) ? journal.lines : [];
  if (!journal || !journal.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(journal.date))) {
    errors.push('A journal needs a date in YYYY-MM-DD form.');
  }
  if (!journal || !String(journal.memo || '').trim()) {
    errors.push('A journal needs a memo saying what it is for.');
  }
  if (lines.length < 2) {
    errors.push('A journal needs at least two lines.');
  }
  lines.forEach((l, i) => {
    if (!account(l.accountCode)) {
      errors.push(`Line ${i + 1}: "${l.accountCode}" is not an account in the chart of accounts.`);
      return;
    }
    const d = Math.round(l.debitPence) || 0;
    const c = Math.round(l.creditPence) || 0;
    if (d < 0 || c < 0) errors.push(`Line ${i + 1}: an amount cannot be negative. Post it to the other side instead.`);
    if (d > 0 && c > 0) errors.push(`Line ${i + 1}: a line is either a debit or a credit, not both.`);
    if (d === 0 && c === 0) errors.push(`Line ${i + 1}: has no amount.`);
  });
  const totals = journalTotals(lines);
  if (lines.length >= 2 && totals.debitPence !== totals.creditPence) {
    errors.push(
      `The journal does not balance: debits ${formatGbp(totals.debitPence)}, credits ${formatGbp(totals.creditPence)}, ` +
      `a difference of ${formatGbp(Math.abs(totals.debitPence - totals.creditPence))}.`
    );
  }
  return { ok: errors.length === 0, errors, totals };
}

// ------------------------------------------------------------
// POSTING BUILDERS
// ------------------------------------------------------------
// One builder per ordinary bookkeeping act. Each returns a journal, and
// nothing else: deciding what to post and writing it to the database are
// separate steps so the deciding half is testable on its own.

// Raising a sales invoice. Debtors go up by the gross, income by the net,
// and the VAT the company will owe HMRC by the difference.
function salesInvoiceJournal({ date, ref, customer, lines = [], vatRate = VAT_RATE }) {
  const out = [];
  let grossPence = 0;
  lines.forEach((l) => {
    const net = Math.round(l.netPence) || 0;
    const vat = l.vatable === false ? 0 : vatOnNet(net, vatRate);
    out.push(line(l.accountCode, 0, net));
    grossPence += net + vat;
    if (vat) out.push(line('2200', 0, vat));
  });
  out.unshift(line('1100', grossPence, 0));
  return {
    date,
    memo: `Invoice ${ref} to ${customer}`,
    source: 'sales_invoice',
    sourceRef: ref,
    lines: mergeSameAccount(out)
  };
}

// Recording a supplier bill. The mirror image: the cost and its recoverable
// VAT go up, and so does what the company owes.
function supplierBillJournal({ date, ref, supplier, lines = [], vatRate = VAT_RATE }) {
  const out = [];
  let grossPence = 0;
  lines.forEach((l) => {
    const net = Math.round(l.netPence) || 0;
    const vat = l.vatable === false ? 0 : vatOnNet(net, vatRate);
    out.push(line(l.accountCode, net, 0));
    grossPence += net + vat;
    if (vat) out.push(line('2200', vat, 0));
  });
  out.push(line('2100', 0, grossPence));
  return {
    date,
    memo: `Bill ${ref} from ${supplier}`,
    source: 'supplier_bill',
    sourceRef: ref,
    lines: mergeSameAccount(out)
  };
}

// A customer pays. Money in, debtor down. No income here: the sale was
// recognised when the invoice was raised, which is the distinction most
// owner-managed businesses get wrong and the one worth demonstrating.
function customerReceiptJournal({ date, ref, customer, amountPence, bankCode = '1200' }) {
  return {
    date,
    memo: `Receipt from ${customer}${ref ? ` for ${ref}` : ''}`,
    source: 'customer_receipt',
    sourceRef: ref || null,
    lines: [line(bankCode, amountPence, 0), line('1100', 0, amountPence)]
  };
}

function supplierPaymentJournal({ date, ref, supplier, amountPence, bankCode = '1200' }) {
  return {
    date,
    memo: `Payment to ${supplier}${ref ? ` for ${ref}` : ''}`,
    source: 'supplier_payment',
    sourceRef: ref || null,
    lines: [line('2100', amountPence, 0), line(bankCode, 0, amountPence)]
  };
}

// Categorising a bank line that is not settling an invoice or a bill: a
// direct debit, a card payment, a bank charge, a one-off receipt. The
// amount is signed the way a bank statement signs it, negative for money
// leaving, so the caller does not have to know which way round to post it.
function categorisationJournal({ date, description, amountPence, accountCode, bankCode = '1200', vatable = true, vatRate = VAT_RATE }) {
  const acct = account(accountCode);
  const amount = Math.round(amountPence) || 0;
  const gross = Math.abs(amount);
  const reclaimable = vatable && acct && acct.vatBox;
  const { netPence, vatPence } = reclaimable ? splitGross(gross, vatRate) : { netPence: gross, vatPence: 0 };
  const lines = amount < 0
    ? [line(accountCode, netPence, 0), ...(vatPence ? [line('2200', vatPence, 0)] : []), line(bankCode, 0, gross)]
    : [line(bankCode, gross, 0), line(accountCode, 0, netPence), ...(vatPence ? [line('2200', 0, vatPence)] : [])];
  return {
    date,
    memo: `Categorised: ${description}`,
    source: 'bank_categorisation',
    sourceRef: null,
    lines: mergeSameAccount(lines)
  };
}

// Two lines against the same account on the same side would balance
// perfectly well and read as a mess. Merging them is presentation, not
// arithmetic: the totals are identical either way, which a test asserts.
function mergeSameAccount(lines) {
  const seen = new Map();
  lines.forEach((l) => {
    const cur = seen.get(l.accountCode) || { accountCode: l.accountCode, debitPence: 0, creditPence: 0 };
    cur.debitPence += l.debitPence;
    cur.creditPence += l.creditPence;
    seen.set(l.accountCode, cur);
  });
  // Net a line that ended up with both sides, so a merge never produces
  // the "either a debit or a credit, not both" error validate refuses.
  return [...seen.values()].map((l) => {
    if (l.debitPence && l.creditPence) {
      const net = l.debitPence - l.creditPence;
      return { accountCode: l.accountCode, debitPence: net > 0 ? net : 0, creditPence: net < 0 ? -net : 0 };
    }
    return l;
  }).filter((l) => l.debitPence || l.creditPence);
}

module.exports = {
  VAT_RATE,
  toPence,
  fromPence,
  formatGbp,
  vatOnNet,
  splitGross,
  line,
  journalTotals,
  validateJournal,
  mergeSameAccount,
  salesInvoiceJournal,
  supplierBillJournal,
  customerReceiptJournal,
  supplierPaymentJournal,
  categorisationJournal
};
