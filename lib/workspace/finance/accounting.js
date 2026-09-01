// Arrington AI Workspace: built-in accounting summary.
//
// Tom's instruction (1 September 2026): the banking area should have
// free accounting software built in as well. Checked against real
// evidence first, same discipline as the provider-route finding in
// registry.js: ANNA Money's own live integrations are Xero and Sage
// (both paid); FreeAgent and Clearbooks are on ANNA's public roadmap,
// not live. There is no free third-party accounting software ANNA
// actually feeds today, so connecting to one would mean building
// against something that does not exist.
//
// What IS real and free: the transactions already synced into
// workspace_finance_transactions via the Xero connector. This module
// turns them into a categorised income/expense summary, entirely from
// data already in the database, no new credential, no new external
// service, no new subscription.
//
// DELIBERATELY NOT accounting software in the regulatory sense. It does
// not do double-entry bookkeeping, VAT calculation, Making Tax Digital
// filing or a tax return, and it must never be presented as if it does
// - that is exactly the kind of overclaim this codebase treats as a
// real defect elsewhere (the Market Ready Test's deterministic rebuild,
// Scott's brain gaps). It is a read-only summary of what has already
// been synced, for a person to look at, nothing more. Xero (or an
// accountant) remains the system of record for anything that needs to
// be correct in that sense.
//
// Pure throughout: no database, no clock default that cannot be
// overridden, so it is fully testable and so the caller (routes/
// workspace.js) stays the only place that touches the database.

const PERIOD_PRESETS = ['this_month', 'last_month', 'last_3_months', 'last_12_months', 'all_time'];

function pad2(n) { return String(n).padStart(2, '0'); }

// Same normalisation problem monthlyTrend and recurring.js both have:
// a raw Postgres row's txn_date is a Date object, not a string, so
// String(t.txn_date) gives "Thu Mar 05 2026 ..." rather than an ISO
// date and silently matches no month bucket. Handles a Date, an ISO
// string, or the CSV parser's own 'YYYY-MM-DD' string alike.
function txnDateKey(t) {
  const raw = t.txn_date ?? t.date;
  return raw && raw.toISOString ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
}
function isoDate(d) { return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }
function startOfMonth(y, m) { return new Date(Date.UTC(y, m, 1)); }
function endOfMonth(y, m) { return new Date(Date.UTC(y, m + 1, 0)); }

// Resolves a preset (or 'custom') into { from, to, label }, each as an
// ISO date string or null (null on both ends means "all time", the only
// state with no WHERE clause for the caller to apply).
function periodRange(preset, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (preset) {
    case 'this_month':
      return { from: isoDate(startOfMonth(y, m)), to: isoDate(endOfMonth(y, m)), label: 'This month' };
    case 'last_month':
      return { from: isoDate(startOfMonth(y, m - 1)), to: isoDate(endOfMonth(y, m - 1)), label: 'Last month' };
    case 'last_3_months':
      return { from: isoDate(startOfMonth(y, m - 2)), to: isoDate(endOfMonth(y, m)), label: 'Last 3 months' };
    case 'last_12_months':
      return { from: isoDate(startOfMonth(y, m - 11)), to: isoDate(endOfMonth(y, m)), label: 'Last 12 months' };
    case 'all_time':
    default:
      return { from: null, to: null, label: 'All time' };
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Server-side validation for a custom range from query params. Anything
// malformed falls back to the safe default (this_month) rather than
// reaching the database with an unvalidated string.
function resolvePeriod({ preset, from, to } = {}, now = new Date()) {
  if (preset === 'custom' && ISO_DATE_RE.test(from || '') && ISO_DATE_RE.test(to || '') && from <= to) {
    return { preset: 'custom', from, to, label: `${from} to ${to}` };
  }
  const p = PERIOD_PRESETS.includes(preset) ? preset : 'this_month';
  return { preset: p, ...periodRange(p, now) };
}

// The summary itself. Amounts stay in pence throughout (matching the
// stored column), so the caller formats them exactly once, the same way
// every other figure on the Finance page already does.
function summarise(transactions) {
  let incomePence = 0;
  let expensesPence = 0;
  const byCategory = new Map();
  for (const t of transactions) {
    const amount = Number(t.amount_pence) || 0;
    const key = (t.category || '').trim() || '(uncategorised)';
    if (!byCategory.has(key)) byCategory.set(key, { category: key, incomePence: 0, expensesPence: 0, count: 0 });
    const c = byCategory.get(key);
    if (t.direction === 'in') { incomePence += amount; c.incomePence += amount; }
    else { expensesPence += amount; c.expensesPence += amount; }
    c.count += 1;
  }
  const categories = Array.from(byCategory.values())
    .map((c) => ({ ...c, netPence: c.incomePence - c.expensesPence }))
    .sort((a, b) => (b.incomePence + b.expensesPence) - (a.incomePence + a.expensesPence));
  return {
    incomePence,
    expensesPence,
    netPence: incomePence - expensesPence,
    count: transactions.length,
    categories
  };
}

// Cashflow / management reporting: income, expenses and net per
// calendar month for the last `months` months (default 12), oldest
// first, so the Finance page can show a simple trend without needing a
// charting library. Months with no transactions still appear, at zero,
// so a gap in the data reads as "nothing happened" rather than
// disappearing from the table.
function monthlyTrend(transactions, months = 12, now = new Date()) {
  const buckets = new Map();
  const order = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() - i;
    const key = isoDate(startOfMonth(y, m)).slice(0, 7);
    buckets.set(key, { month: key, incomePence: 0, expensesPence: 0, netPence: 0, count: 0 });
    order.push(key);
  }
  transactions.forEach((t) => {
    const key = txnDateKey(t).slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) return; // outside the requested window
    const amount = Number(t.amount_pence) || 0;
    if (t.direction === 'in') bucket.incomePence += amount; else bucket.expensesPence += amount;
    bucket.netPence = bucket.incomePence - bucket.expensesPence;
    bucket.count += 1;
  });
  return order.map((key) => buckets.get(key));
}

module.exports = { PERIOD_PRESETS, periodRange, resolvePeriod, summarise, monthlyTrend };
