// Arrington AI Workspace: estimated recurring costs.
//
// Tom's requirement list for the Banking & Accounting area includes
// recurring costs. Neither real data source here provides a genuine
// "this is a recurring payment" flag: ANNA's statement export is a
// plain transaction list, and (per lib/workspace/finance/xeroClient.js's
// own header) Xero's Accounting API has no such flag on raw bank-feed
// lines either. So this is a heuristic, not a fact read from a source,
// and it must ALWAYS be presented as an estimate - never as something
// the bank confirmed. Every transaction this module marks carries
// recurring_estimated = true for exactly that reason (see
// db/schema.sql), and the Finance page's copy says "estimated" rather
// than implying it is a bank-provided flag.
//
// Pure: no database, no clock default that cannot be overridden. Only
// considers outgoing transactions (recurring INCOME is a different,
// less common question and is out of scope here) grouped by a
// normalised payee.

function normalisePayee(payee) {
  return String(payee || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Cadence bands, in days between consecutive occurrences. A gap outside
// all of these is treated as irregular (not recurring), not forced into
// the nearest band.
const CADENCES = [
  { id: 'weekly', min: 6, max: 8, addDays: 7 },
  { id: 'monthly', min: 26, max: 33, addDays: 30 },
  { id: 'quarterly', min: 85, max: 97, addDays: 91 },
  { id: 'annual', min: 355, max: 375, addDays: 365 }
];

function detectCadence(gapDays) {
  return CADENCES.find((c) => gapDays >= c.min && gapDays <= c.max) || null;
}

// Amounts must be consistent enough to read as "the same bill", not
// merely the same payee: 20% relative tolerance with a small absolute
// floor so a handful of pence of variation on a low-value subscription
// does not fail the check on rounding alone.
function amountsConsistent(amounts) {
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const tolerance = Math.max(avg * 0.2, 100); // pence
  return amounts.every((a) => Math.abs(a - avg) <= tolerance);
}

// Two shapes reach this module: the CSV parser's camelCase output
// (date, amountPence, externalId) before a first import, and raw
// Postgres rows (txn_date, amount_pence, external_id) once read back
// for the Finance page. Both are normalised here rather than trusting
// every caller to pass one consistent shape - a mismatch here previously
// meant the recurring-costs summary card silently found nothing while
// the per-transaction flag (computed at import time, from the parser's
// own shape) was correct, which is a worse bug than a crash because
// nothing on the page said anything was wrong.
function txnDate(t) {
  const raw = t.date ?? t.txn_date;
  return raw && raw.toISOString ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
}

// Returns an array of estimated recurring groups:
// { payee, cadence, occurrences, averageAmountPence, lastDate,
//   estimatedNextDate, externalIds }
// Requires at least 3 occurrences before calling something recurring:
// two payments to the same payee is not yet a pattern, and the
// consequence of a false positive here (telling Tom a one-off looks
// like a subscription) is worse than the consequence of waiting for a
// third instance.
function detectRecurringGroups(transactions) {
  const outgoing = transactions.filter((t) => t.direction === 'out' && normalisePayee(t.payee));
  const byPayee = new Map();
  outgoing.forEach((t) => {
    const key = normalisePayee(t.payee);
    if (!byPayee.has(key)) byPayee.set(key, []);
    byPayee.get(key).push(t);
  });

  const groups = [];
  for (const [payee, txns] of byPayee) {
    if (txns.length < 3) continue;
    const sorted = [...txns].sort((a, b) => (txnDate(a) < txnDate(b) ? -1 : txnDate(a) > txnDate(b) ? 1 : 0));
    const gaps = [];
    for (let i = 1; i < sorted.length; i += 1) gaps.push(daysBetween(txnDate(sorted[i - 1]), txnDate(sorted[i])));
    const cadence = detectCadence(median(gaps));
    if (!cadence) continue;
    const amounts = sorted.map((t) => Number(t.amount_pence ?? t.amountPence));
    if (!amountsConsistent(amounts)) continue;

    const lastDate = txnDate(sorted[sorted.length - 1]);
    groups.push({
      payee,
      cadence: cadence.id,
      occurrences: sorted.length,
      averageAmountPence: Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length),
      lastDate,
      estimatedNextDate: isoDatePlusDays(lastDate, cadence.addDays),
      externalIds: sorted.map((t) => t.external_id ?? t.externalId)
    });
  }
  return groups.sort((a, b) => b.averageAmountPence - a.averageAmountPence);
}

function isoDatePlusDays(dateStr, days) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Annotates a COPY of the transaction list with is_recurring /
// recurring_group / recurring_estimated, for storage. Never mutates the
// input array or its objects.
function annotateRecurring(transactions) {
  const groups = detectRecurringGroups(transactions);
  const idToGroup = new Map();
  groups.forEach((g) => g.externalIds.forEach((id) => idToGroup.set(id, g.payee)));
  return transactions.map((t) => {
    const id = t.externalId ?? t.external_id;
    const groupPayee = idToGroup.get(id);
    return {
      ...t,
      isRecurring: !!groupPayee,
      recurringGroup: groupPayee || '',
      recurringEstimated: !!groupPayee
    };
  });
}

module.exports = { detectRecurringGroups, annotateRecurring, normalisePayee };
