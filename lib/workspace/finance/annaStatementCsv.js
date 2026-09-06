// Arrington AI Workspace: ANNA Money statement CSV import.
//
// The primary, real finance data route (see registry.js header for the
// full investigation). ANNA's own app lets the account holder export a
// statement as CSV for any period, including full history. This module
// turns that file into the same transaction shape the rest of
// lib/workspace/finance/* already works with - nothing downstream
// (accounting.js, recurring.js, the Finance page) needs to know or care
// that the source is a file rather than an API.
//
// Pure and dependency-free: no network, no database, a small hand-
// rolled RFC 4180 parser rather than a new npm dependency for one file
// format. Never throws on a malformed row; each row either parses or is
// collected as a warning, so one bad line does not lose an entire
// statement.
//
// HONEST LIMITATION, stated rather than guessed past: this was written
// against ANNA's PUBLICLY DOCUMENTED statement-export feature (CSV or
// PDF, any period), not against a real downloaded file - nothing in
// this sandbox can log into a real ANNA account. The header-matching
// below covers the column names commonly used across UK business bank
// CSV exports (this shape is common across providers, not ANNA-
// specific), but the exact column names and layout of a real ANNA
// export have not been confirmed. The first real upload is the proof;
// if ANNA's actual columns differ, `warnings` on that first import will
// say so rather than the parser silently guessing wrong.

const crypto = require('node:crypto');

function parseCsvLines(text) {
  // RFC 4180: fields may be quoted, a quoted field may contain commas
  // and newlines, and "" inside a quoted field is a literal quote.
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const push = () => { row.push(field); field = ''; };
  const pushRow = () => { push(); rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { inQuotes = true; i += 1; continue; }
    if (c === ',') { push(); i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { pushRow(); i += 1; continue; }
    field += c; i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

// Header synonyms, lower-cased, first match wins. This shape (Date,
// a description/payee column, either one signed Amount or separate
// Money In/Money Out columns, optional Reference/Category/Balance) is
// common across UK business bank statement exports generally, which is
// why it is the reasonable default rather than a guess specific to one
// provider's undocumented format.
const HEADER_SYNONYMS = {
  date: ['date', 'transaction date', 'value date', 'posted date'],
  amount: ['amount', 'value', 'transaction amount'],
  moneyIn: ['money in', 'credit', 'paid in', 'incoming'],
  moneyOut: ['money out', 'debit', 'paid out', 'outgoing'],
  payee: ['description', 'counterparty', 'merchant', 'payee', 'name', 'details'],
  reference: ['reference', 'notes', 'memo'],
  category: ['category', 'type'],
  balance: ['balance', 'running balance', 'closing balance']
};

function findColumn(headerRow, synonyms) {
  const lower = headerRow.map((h) => h.trim().toLowerCase());
  for (const name of synonyms) {
    const idx = lower.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

const DATE_FORMATS = [
  // YYYY-MM-DD
  { re: /^(\d{4})-(\d{2})-(\d{2})$/, order: [1, 2, 3] },
  // DD/MM/YYYY (UK convention, ANNA is a UK product)
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: [3, 2, 1] }
];

function parseDate(raw) {
  const s = String(raw || '').trim();
  for (const fmt of DATE_FORMATS) {
    const m = s.match(fmt.re);
    if (m) {
      const [yi, mi, di] = fmt.order;
      const y = m[yi]; const mo = String(m[mi]).padStart(2, '0'); const d = String(m[di]).padStart(2, '0');
      return `${y}-${mo}-${d}`;
    }
  }
  return null;
}

function parseAmountToPence(raw) {
  const cleaned = String(raw || '').replace(/[£,\s]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

// A stable id for dedup on re-upload. ANNA's statement export carries
// no persistent transaction id, so this is a content hash of the row's
// meaningful fields - the practical, honest alternative, documented
// rather than presented as a real bank-assigned id.
function contentHash(date, amountPence, direction, payee, reference) {
  const h = crypto.createHash('sha256');
  h.update([date, amountPence, direction, payee, reference].join('|'));
  return `csv-${h.digest('hex').slice(0, 24)}`;
}

// Returns { transactions, warnings, columnsFound }. transactions are in
// the same shape lib/workspace/finance/repo.js's upsertTransactions
// expects. Never throws: a file with no recognisable header returns an
// empty transaction list and a warning explaining why, so the route can
// show the person exactly what went wrong rather than a stack trace.
function parseStatementCsv(csvText) {
  const warnings = [];
  const rows = parseCsvLines(String(csvText || ''));
  if (rows.length === 0) {
    return { transactions: [], warnings: ['The file is empty.'], columnsFound: {} };
  }
  const header = rows[0];
  const col = {
    date: findColumn(header, HEADER_SYNONYMS.date),
    amount: findColumn(header, HEADER_SYNONYMS.amount),
    moneyIn: findColumn(header, HEADER_SYNONYMS.moneyIn),
    moneyOut: findColumn(header, HEADER_SYNONYMS.moneyOut),
    payee: findColumn(header, HEADER_SYNONYMS.payee),
    reference: findColumn(header, HEADER_SYNONYMS.reference),
    category: findColumn(header, HEADER_SYNONYMS.category),
    balance: findColumn(header, HEADER_SYNONYMS.balance)
  };
  if (col.date === -1) {
    return { transactions: [], warnings: ['No date column was recognised in the header. Expected one of: Date, Transaction Date, Value Date.'], columnsFound: col };
  }
  const hasSignedAmount = col.amount !== -1;
  const hasSplitAmount = col.moneyIn !== -1 || col.moneyOut !== -1;
  if (!hasSignedAmount && !hasSplitAmount) {
    return { transactions: [], warnings: ['No amount column was recognised in the header. Expected either "Amount" or "Money in"/"Money out".'], columnsFound: col };
  }

  const transactions = [];
  // Every row that parsed, in FILE order, with its balance (if the file
  // carries one) and signed amount: the closing-balance rule below needs
  // the file's own ordering, which the sorted transactions list loses.
  const fileOrder = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    if (r.every((cell) => cell.trim() === '')) continue;
    const date = parseDate(r[col.date]);
    if (!date) { warnings.push(`Row ${i + 1}: could not parse a date ("${r[col.date] || ''}"), skipped.`); continue; }

    let amountPence = null;
    let direction = null;
    if (hasSignedAmount) {
      amountPence = parseAmountToPence(r[col.amount]);
      if (amountPence !== null) { direction = amountPence < 0 ? 'out' : 'in'; amountPence = Math.abs(amountPence); }
    } else {
      const inPence = col.moneyIn !== -1 ? parseAmountToPence(r[col.moneyIn]) : null;
      const outPence = col.moneyOut !== -1 ? parseAmountToPence(r[col.moneyOut]) : null;
      if (inPence) { amountPence = inPence; direction = 'in'; }
      else if (outPence) { amountPence = outPence; direction = 'out'; }
    }
    if (amountPence === null || !direction) { warnings.push(`Row ${i + 1}: could not parse an amount, skipped.`); continue; }

    const payee = col.payee !== -1 ? String(r[col.payee] || '').trim() : '';
    const reference = col.reference !== -1 ? String(r[col.reference] || '').trim() : '';
    const category = col.category !== -1 ? String(r[col.category] || '').trim() : '';
    const externalId = contentHash(date, amountPence, direction, payee, reference);

    transactions.push({ externalId, date, amountPence, direction, payee, reference, category });
    fileOrder.push({
      date,
      signedPence: direction === 'out' ? -amountPence : amountPence,
      balancePence: col.balance !== -1 ? parseAmountToPence(r[col.balance]) : null
    });
  }

  transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const closing = col.balance !== -1 ? closingBalance(fileOrder) : { balancePence: null, date: null };

  return {
    transactions,
    warnings,
    columnsFound: col,
    closingBalancePence: closing.balancePence,
    closingBalanceDate: col.balance !== -1 ? (transactions.length ? transactions[transactions.length - 1].date : null) : null
  };
}

// The statement's closing balance is the balance on the LATEST
// transaction row. The latest DATE is unambiguous whatever order the file
// is printed in; the latest ROW on that date is not, because a date
// carries no time. ANNA exports newest first, so the last row printed for
// the latest day is the EARLIEST transaction of that day, and taking it
// (which this function used to do) reported a balance one or more
// transactions out of date. Found on 06/09/2026 against the controlled
// 13 April to 5 September statement: two rows on 5 September, and the
// wrong one was being picked.
//
// The file's own direction decides the tie: if the first parsed date is
// later than the last, the file is newest first and the FIRST row printed
// for the latest day is the closing one; if earlier, the last. A file
// whose rows all share one date has no date direction, so the running
// balances arbitrate: in a newest-first file each row's balance equals
// the row below it plus this row's amount. If neither reading fits, the
// last row printed is kept, which is the previous behaviour and the
// oldest-first convention of most bank exports.
function closingBalance(fileOrder) {
  const dated = fileOrder.filter((row) => row.date);
  if (dated.length === 0) return { balancePence: null, date: null };
  const latestDate = dated.reduce((max, row) => (row.date > max ? row.date : max), dated[0].date);
  const latestRows = dated.filter((row) => row.date === latestDate && row.balancePence !== null);
  if (latestRows.length === 0) return { balancePence: null, date: latestDate };

  let newestFirst = null;
  const first = dated[0].date;
  const last = dated[dated.length - 1].date;
  if (first > last) newestFirst = true;
  else if (first < last) newestFirst = false;
  else if (latestRows.length > 1) {
    const fitsNewestFirst = latestRows.slice(0, -1).every((row, i) => latestRows[i + 1].balancePence + row.signedPence === row.balancePence);
    const fitsOldestFirst = latestRows.slice(1).every((row, i) => latestRows[i].balancePence + row.signedPence === row.balancePence);
    if (fitsNewestFirst && !fitsOldestFirst) newestFirst = true;
    else if (fitsOldestFirst && !fitsNewestFirst) newestFirst = false;
  }
  const chosen = newestFirst === true ? latestRows[0] : latestRows[latestRows.length - 1];
  return { balancePence: chosen.balancePence, date: latestDate };
}

module.exports = { parseStatementCsv, parseCsvLines, parseDate, parseAmountToPence, contentHash, closingBalance };
