// Arrington AI Workspace: reconciling work done against work invoiced
// (15/09/2026).
//
// Tom's corrected requirement: Ruth should be able to reconcile what
// Arrington has DONE with what Zoho says has been INVOICED, PAID and
// remains OUTSTANDING, and answer with source and freshness evidence.
//
// WHICH SIDE IS AUTHORITATIVE FOR WHAT, because the first build had this
// backwards and it is the whole architecture:
//
//   ZOHO is the system of record for money. What is owed, what has been
//   paid, what an invoice was for, how overdue it is. Nothing here
//   recomputes any of that from the hours log, and nothing here treats a
//   logged figure as money owed.
//
//   THE HOURS LOG is the record of work DONE. It is the only source for
//   what has been delivered but not yet billed. It is never a statement
//   about what a customer owes.
//
//   THE DIFFERENCE between them is the finding, and it is offered as a
//   comparison for a person to judge, never as an instruction.
//
// Pure: no network, no environment, no clock except the injected `now`.
// It is handed already-fetched Zoho rows and an already-parsed hours log.

const hoursLog = require('./hoursLog');
const invoiceCheck = require('./invoiceCheck');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function pence(v) { return Math.round(num(v) * 100); }

// Zoho statuses that mean the invoice is a live claim on the customer.
// 'draft' is deliberately NOT owed: a draft has not been sent, so nobody
// owes anything on it, and counting it would overstate the book.
const OPEN_STATUSES = new Set(['sent', 'overdue', 'partially_paid', 'unpaid']);
const VOID_STATUSES = new Set(['void', 'voided', 'cancelled', 'canceled']);

// --- The Zoho side ------------------------------------------------------

// One customer's position, from Zoho rows only.
function summariseInvoices(invoices, { now = Date.now() } = {}) {
  const rows = (Array.isArray(invoices) ? invoices : []).filter((i) => i && !VOID_STATUSES.has(String(i.status || '').toLowerCase()));
  const byCustomer = new Map();

  for (const inv of rows) {
    const name = String(inv.customer_name || '').trim() || '(no customer name)';
    const key = name.toLowerCase();
    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        customer: name,
        invoices: [],
        invoicedPence: 0,
        outstandingPence: 0,
        paidPence: 0,
        openCount: 0,
        oldestDueDate: '',
        oldestDaysOverdue: 0
      });
    }
    const c = byCustomer.get(key);
    const status = String(inv.status || '').toLowerCase();
    const total = pence(inv.total);
    // Zoho reports the residue itself. Trust it rather than deriving it:
    // it accounts for credit notes and part payments that this module
    // never sees, and a locally-derived balance would silently disagree
    // with what the customer's own statement says.
    const balance = pence(inv.balance);
    const isDraft = status === 'draft';

    c.invoices.push({
      number: String(inv.invoice_number || '').trim(),
      date: String(inv.date || '').trim(),
      dueDate: String(inv.due_date || '').trim(),
      status,
      reference: String(inv.reference_number || '').trim(),
      totalPence: total,
      balancePence: balance
    });

    if (!isDraft) {
      c.invoicedPence += total;
      c.paidPence += Math.max(0, total - balance);
    }
    if (OPEN_STATUSES.has(status) && balance > 0) {
      c.outstandingPence += balance;
      c.openCount += 1;
      const due = Date.parse(inv.due_date);
      if (Number.isFinite(due)) {
        const days = Math.floor((now - due) / 86400000);
        if (days > c.oldestDaysOverdue) {
          c.oldestDaysOverdue = days;
          c.oldestDueDate = String(inv.due_date || '').trim();
        }
      }
    }
  }

  const customers = [...byCustomer.values()].sort((a, b) => b.outstandingPence - a.outstandingPence);
  return {
    customers,
    totalOutstandingPence: customers.reduce((s, c) => s + c.outstandingPence, 0),
    totalInvoicedPence: customers.reduce((s, c) => s + c.invoicedPence, 0),
    openCount: customers.reduce((s, c) => s + c.openCount, 0)
  };
}

// --- Joining the two sides ---------------------------------------------

// A log client code ("WSA") against a Zoho customer name ("World Student
// Advisors"). Reuses the invoice check's matcher rather than inventing a
// second one, so one client cannot match differently in two places.
function matchCustomer(clientCode, customers) {
  const hits = customers.filter((c) => invoiceCheck.clientMatches(clientCode, { customerName: c.customer, customerEmail: '' }));
  return hits.length === 1 ? hits[0] : null;
}

// The unbilled side for one client.
//
// TWO MODES, and the difference between them is stated in every answer:
//
//   ROW LEVEL, when the sheet carries an Invoice ref column. Exactly the
//   rows with no reference are unbilled, and they can be named.
//
//   TOTALS, when it does not. All that can be said is logged-value minus
//   invoiced-value, which is an arithmetic comparison and not a list of
//   rows. It cannot distinguish "not invoiced yet" from "invoiced at a
//   different figure", and it says so.
function unbilledFor(parsed, clientCode, zohoCustomer) {
  const total = hoursLog.totalFor(parsed, clientCode);
  const out = {
    client: clientCode,
    mode: parsed.hasInvoiceRefColumn ? 'row_level' : 'totals',
    loggedPence: total.pence,
    loggedHours: total.hours,
    loggedHoursText: total.hoursText,
    entryCount: total.count,
    rate: parsed.rate,
    invoicedPence: zohoCustomer ? zohoCustomer.invoicedPence : null,
    matchedCustomer: zohoCustomer ? zohoCustomer.customer : null,
    unbilledPence: null,
    unbilledRows: [],
    writtenOffRows: [],
    caveat: ''
  };

  if (parsed.hasInvoiceRefColumn) {
    const rows = total.rows.filter((r) => !r.invoiceRef && !r.writtenOff);
    out.unbilledRows = rows;
    out.writtenOffRows = total.rows.filter((r) => r.writtenOff);
    const hrs = rows.reduce((s, r) => s + r.hours, 0);
    out.unbilledPence = hoursLog.toPence(Math.round(hrs * 1e6) / 1e6, parsed.rate);
    out.unbilledHours = Math.round(hrs * 1e6) / 1e6;
    return out;
  }

  out.caveat = 'The hours log has no invoice reference column, so this is a comparison of totals and not a list of rows: it cannot tell work that was never invoiced apart from work invoiced at a different figure.';
  if (zohoCustomer) out.unbilledPence = total.pence - zohoCustomer.invoicedPence;
  return out;
}

// The whole picture. `parsed` may be null when the hours log could not be
// read: the Zoho side still answers, and the unbilled side says plainly
// that it is unavailable rather than reporting zero.
function reconcile({ parsed = null, invoices = [], now = Date.now() } = {}) {
  const zoho = summariseInvoices(invoices, { now });
  const clients = parsed && parsed.ok ? hoursLog.clientsIn(parsed) : [];

  const perClient = clients.map((code) => {
    const customer = matchCustomer(code, zoho.customers);
    return { ...unbilledFor(parsed, code, customer), outstandingPence: customer ? customer.outstandingPence : null };
  });

  // A Zoho customer with money outstanding and no client code in the
  // hours log is not an error: plenty of work is invoiced without being
  // time-logged. Listed separately rather than silently dropped.
  const matched = new Set(perClient.map((p) => p.matchedCustomer).filter(Boolean));
  const unmatchedCustomers = zoho.customers.filter((c) => c.outstandingPence > 0 && !matched.has(c.customer));

  return {
    zoho,
    perClient,
    unmatchedCustomers,
    hoursAvailable: !!(parsed && parsed.ok),
    rowLevel: !!(parsed && parsed.ok && parsed.hasInvoiceRefColumn)
  };
}

// --- Rendering, for the Company Brain record ---------------------------

const money = hoursLog.formatMoney;

function describeReceivables(result, { zohoReadAt = '', zohoAvailable = true, zohoError = '', hoursReadAt = '', hoursTitle = '', hoursFileId = '', hoursError = '' } = {}) {
  const L = [];

  // THE SAME RULE AS THE HOURS SIDE, and it was missing here until it was
  // caught by running the thing rather than reading it. With Zoho
  // unreadable, `summariseInvoices([])` honestly returns zero, and
  // printing that as "OUTSTANDING: £0.00 across 0 open invoice(s)" states
  // that nothing is owed. Nothing is KNOWN. A caveat above the figure does
  // not undo a figure, so the figure is not printed at all.
  if (!zohoAvailable) {
    L.push(`OUTSTANDING: unavailable. Zoho Invoice, which is the system of record for money owed, could not be read${zohoError ? ` (${zohoError})` : ''}. Nothing is known about what is outstanding and no figure has been worked out.`);
    L.push('');
  } else {
    L.push(`OUTSTANDING, from Zoho Invoice (the system of record for money owed): ${money(result.zoho.totalOutstandingPence)} across ${result.zoho.openCount} open invoice(s).`);
    L.push(`Read from Zoho at ${zohoReadAt || 'an unrecorded time'}.`);
    L.push('');
  }

  if (!zohoAvailable) {
    // Nothing to list: the customer table is empty because the read
    // failed, not because there are no customers.
  } else if (!result.zoho.customers.length) {
    L.push('No invoices were returned by Zoho.');
  } else {
    L.push('By customer:');
    // A customer with nothing invoiced and nothing outstanding has
    // nothing to report. Listing them at £0.00 reads as a statement
    // about a customer who owes nothing, which is noise at best and
    // misleading at worst (a draft-only customer would appear here).
    const active = result.zoho.customers.filter((c) => c.invoicedPence > 0 || c.outstandingPence > 0);
    if (!active.length) L.push('- no customer has an invoiced or outstanding balance.');
    for (const c of active) {
      const overdue = c.oldestDaysOverdue > 0 ? `, oldest ${c.oldestDaysOverdue} day(s) past its due date of ${c.oldestDueDate}` : '';
      L.push(`- ${c.customer}: ${money(c.outstandingPence)} outstanding across ${c.openCount} invoice(s)${overdue}. Invoiced to date ${money(c.invoicedPence)}, paid ${money(c.paidPence)}.`);
      for (const inv of c.invoices.filter((i) => i.balancePence > 0 && OPEN_STATUSES.has(i.status))) {
        L.push(`    ${inv.number || '(no number)'} dated ${inv.date || '(no date)'}, due ${inv.dueDate || '(no due date)'}, ${inv.status}: ${money(inv.balancePence)} of ${money(inv.totalPence)} outstanding.`);
      }
    }
  }

  L.push('');
  if (!result.hoursAvailable) {
    L.push(`WORK DONE BUT NOT INVOICED: unavailable. The hours log could not be read${hoursError ? ` (${hoursError})` : ''}, so nothing is known about unbilled work. No figure has been estimated.`);
    return L.join('\n');
  }

  L.push(`WORK DONE BUT NOT INVOICED, from ${hoursTitle || 'the hours log'}${hoursFileId ? ` (Google Sheet ${hoursFileId})` : ''}, read at ${hoursReadAt || 'an unrecorded time'}:`);
  if (!result.rowLevel) {
    L.push('This is a COMPARISON OF TOTALS, not a list of rows. The hours log has no invoice reference column, so work never invoiced cannot be told apart from work invoiced at a different figure.');
  }
  for (const c of result.perClient) {
    const inv = c.invoicedPence == null ? 'no matching Zoho customer' : `invoiced ${money(c.invoicedPence)}`;
    // The sign matters and must not be read out as though it did not.
    // A NEGATIVE difference is not "negative unbilled work": it means
    // more has been invoiced than the log accounts for, which usually
    // means work was billed without being logged. Saying "-£646.67
    // logged and not invoiced" would be a sentence with no meaning.
    let gap;
    if (c.unbilledPence == null) gap = 'the difference cannot be worked out';
    else if (c.unbilledPence > 0) gap = `${money(c.unbilledPence)} logged and not invoiced`;
    else if (c.unbilledPence < 0) gap = `${money(-c.unbilledPence)} MORE invoiced than the log accounts for, which usually means work was invoiced without being logged`;
    else gap = 'the logged and invoiced figures agree';
    L.push(`- ${c.client}: ${c.loggedHoursText} logged across ${c.entryCount} billable entr${c.entryCount === 1 ? 'y' : 'ies'} = ${money(c.loggedPence)}; ${inv}; ${gap}.`);
    if (c.mode === 'row_level' && c.unbilledRows.length) {
      for (const r of c.unbilledRows) L.push(`    not invoiced: ${r.date}, ${r.minutes} minutes, ${r.work}`);
    }
    if (c.writtenOffRows.length) L.push(`    ${c.writtenOffRows.length} row(s) marked as deliberately not chargeable and excluded.`);
  }
  if (result.unmatchedCustomers.length) {
    L.push('');
    L.push('Owing money but not present in the hours log (invoiced without time being logged, which is ordinary):');
    for (const c of result.unmatchedCustomers) L.push(`- ${c.customer}: ${money(c.outstandingPence)}`);
  }
  return L.join('\n');
}

module.exports = { reconcile, summariseInvoices, unbilledFor, matchCustomer, describeReceivables, OPEN_STATUSES, VOID_STATUSES };
