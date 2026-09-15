// Arrington AI Workspace: the receivables capability (15/09/2026).
//
// This is where the Drive record, the Zoho reads and the Company Brain
// meet. It exists because the first build had a record BUILDER that
// nothing ever called: the source class existed, the parser existed, and
// no record was ever written, so Ruth could not answer a single one of
// Tom's questions. `refreshRecords()` below is the correction, and it
// goes through the SAME `repo.upsertRecord` every other workspace record
// uses. No second write path.
//
// The honesty rules live HERE, where the failure modes arrive:
//
//   - If a source cannot be read, say so, name which one, and produce no
//     figure for it. The other source still answers.
//   - Never invent or estimate hours.
//   - A figure from an earlier read is ALWAYS labelled as not current,
//     with its age and the reason the fresh read failed.
//   - Never claim a source was checked when it was not.
//   - Never silently fall back to another record. Zoho answers for money
//     and the hours log answers for work done; neither ever stands in for
//     the other, and a missing one is reported as missing.

const sheetsClient = require('../drive/sheetsClient');
const driveRegister = require('../drive/register');
const hoursLog = require('./hoursLog');
const invoiceCheck = require('./invoiceCheck');
const reconcile = require('./reconcile');
const repo = require('../repo');
const zohoClient = require('../finance/zohoInvoiceClient');
const financeRegistry = require('../finance/registry');

// The registered Drive record this capability reads.
const HOURS_RECORD = 'hours_log';

// The two Company Brain records it writes. Named constants because the
// tests assert the records EXIST by key after a refresh, and a key typed
// twice is a test that passes against a record nothing can find.
const HOURS_RECORD_KEY = 'hours.log';
const RECEIVABLES_RECORD_KEY = 'receivables.summary';

function ageText(readAt, now) {
  const then = Date.parse(readAt);
  if (!Number.isFinite(then)) return 'earlier';
  const mins = Math.max(0, Math.round((now - then) / 60000));
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// --- Reading the hours log ---------------------------------------------

async function loadHours({ now = Date.now() } = {}) {
  try {
    const sheet = await sheetsClient.readRecord(HOURS_RECORD, { now });
    const parsed = hoursLog.parseHoursLog(sheet.rows);
    if (!parsed.ok) {
      return { ok: false, stale: false, parsed: null, kind: 'unparseable', why: parsed.reason, message: `The hours log was opened but could not be read: ${parsed.reason}. No hours have been worked out.` };
    }
    return { ok: true, stale: false, parsed, readAt: sheet.readAt, title: sheet.title || sheet.registeredTitle, fileId: sheet.spreadsheetId, message: '' };
  } catch (err) {
    const kind = err && err.kind ? err.kind : 'unreachable';
    const why = err && err.message ? err.message : 'the read failed';
    const cached = sheetsClient.cachedRead(HOURS_RECORD);
    if (!cached) {
      return { ok: false, stale: false, parsed: null, kind, why, message: `The hours log could not be read (${why}), so I have not checked it and have no hours figure. Nothing has been estimated.` };
    }
    const parsed = hoursLog.parseHoursLog(cached.rows);
    if (!parsed.ok) {
      return { ok: false, stale: false, parsed: null, kind, why, message: `The hours log could not be read (${why}), and the last copy held in memory cannot be parsed either. No hours figure is available.` };
    }
    return {
      ok: true,
      stale: true,
      parsed,
      readAt: cached.readAt,
      title: cached.title || cached.registeredTitle,
      fileId: cached.spreadsheetId,
      kind,
      message: `NOT CURRENT: the hours log could not be read just now (${why}). The figures below come from the last successful read, ${ageText(cached.readAt, now)}, and may be out of date.`
    };
  }
}

// --- Reading Zoho -------------------------------------------------------

// Read-only, using the connector's existing read scopes. Nothing here
// creates, emails or alters an invoice, and no write function is reached.
async function loadInvoices({ now = Date.now() } = {}) {
  if (!financeRegistry.isConfigured('zoho_invoice')) {
    return { ok: false, invoices: [], why: 'Zoho Invoice is not configured in this environment', message: 'Zoho Invoice is not configured in this environment, so nothing is known about what has been invoiced or is outstanding.' };
  }
  try {
    const token = await zohoClient.getAccessToken();
    const invoices = await zohoClient.getInvoices(token, { status: 'all' });
    return { ok: true, invoices, readAt: new Date(now).toISOString(), message: '' };
  } catch (err) {
    const why = err && err.message ? err.message : 'the read failed';
    return { ok: false, invoices: [], why, message: `Zoho Invoice could not be read (${why}), so the outstanding position is not available. Nothing has been estimated.` };
  }
}

// --- The two Company Brain records -------------------------------------

// What work has been done. Built only from rows actually read.
function buildHoursRecord(parsed, { readAt = null, title = '', fileId = '' } = {}) {
  if (!parsed || !parsed.ok) return null;
  const clients = hoursLog.clientsIn(parsed);
  const perClient = clients.map((c) => {
    const t = hoursLog.totalFor(parsed, c);
    return `${c}: ${t.hoursText} billable across ${t.count} entr${t.count === 1 ? 'y' : 'ies'}${t.pence == null ? '' : ` = ${hoursLog.formatMoney(t.pence)}`}`;
  });
  const lines = parsed.entries.map((e) => {
    const ref = parsed.hasInvoiceRefColumn ? ` | ${e.writtenOff ? 'not chargeable' : (e.invoiceRef ? `invoice ${e.invoiceRef}` : 'NOT INVOICED')}` : '';
    return `${e.date} | ${e.client} | ${e.hours} h (${e.minutes} min) | ${e.billable ? 'billable' : 'NOT billable'}${ref} | ${e.work}`;
  });
  const body = [
    `Source: ${title || 'the hours log'}${fileId ? ` (Google Sheet ${fileId})` : ''}, read at ${readAt || 'an unrecorded time'}.`,
    `Hourly rate on the record: ${parsed.rate == null ? 'not stated' : hoursLog.formatMoney(Math.round(parsed.rate * 100))}.`,
    parsed.hasInvoiceRefColumn
      ? 'This log carries an invoice reference per row, so what has and has not been invoiced can be named row by row.'
      : 'This log has NO invoice reference column, so it records what work was done and NOT whether it has been invoiced. Any statement about what is unbilled can only be a comparison of totals against Zoho.',
    perClient.length ? `Totals by client. ${perClient.join('. ')}.` : 'No billable entries were read.',
    parsed.unreadable.length ? `${parsed.unreadable.length} row(s) could not be read and are excluded; no hours have been estimated for them.` : 'Every row was read.',
    'Entries, most recent last:',
    ...lines
  ].join('\n');
  const when = readAt ? new Date(readAt) : new Date();
  return {
    record_key: HOURS_RECORD_KEY,
    source_class: 'hours',
    // Evidence, not authority: it is a transcription of what was done,
    // and it does not decide anything. Same class as email.summary.
    authority_class: 'evidence',
    doc_status: 'current',
    title: 'Hours log: work completed and billable time',
    body,
    sensitivity: 'confidential',
    source_ref: `${title || 'hours log'}${fileId ? `, Google Sheet ${fileId}` : ''}${readAt ? `, read ${readAt}` : ''}`,
    as_of: Number.isNaN(when.getTime()) ? new Date() : when,
    synced_at: Number.isNaN(when.getTime()) ? new Date() : when,
    // A day, like the inbox snapshot. A log of billable work goes out of
    // date the moment more work is done, and a week-old figure presented
    // as current is exactly the failure this whole change exists to stop.
    stale_after_days: 1,
    sync_outcome: 'ok',
    meta: {
      fileId: fileId || '',
      entries: parsed.entries.length,
      unreadable: parsed.unreadable.length,
      clients,
      hasInvoiceRefColumn: !!parsed.hasInvoiceRefColumn
    }
  };
}

// The receivables record is source_class `finance`, NOT `hours`, and that
// is deliberate: what a customer owes is a finance fact whoever asks, and
// filing it under `hours` would have made Zoho's own figures inherit a
// source class invented for a spreadsheet. The unbilled half it carries
// comes from the hours log, so the record is `confidential` either way and
// the body names both sources with their read times.
function buildReceivablesRecord(result, provenance, { now = Date.now() } = {}) {
  const at = new Date(now);
  return {
    record_key: RECEIVABLES_RECORD_KEY,
    source_class: 'finance',
    authority_class: 'evidence',
    doc_status: 'current',
    title: 'Receivables: what is owed, what it relates to, and what is done but not invoiced',
    body: reconcile.describeReceivables(result, provenance),
    sensitivity: 'confidential',
    source_ref: `Zoho Invoice${provenance.zohoReadAt ? ` read ${provenance.zohoReadAt}` : ''}${provenance.hoursFileId ? `; Google Sheet ${provenance.hoursFileId}` : ''}${provenance.hoursReadAt ? ` read ${provenance.hoursReadAt}` : ''}`,
    as_of: at,
    synced_at: at,
    stale_after_days: 1,
    // Honest about its own completeness: a record built with one source
    // missing is 'partial', so the freshness machinery every other record
    // uses can say so without reading the body.
    sync_outcome: result.hoursAvailable && provenance.zohoReadAt ? 'ok' : 'partial',
    meta: {
      outstandingPence: result.zoho.totalOutstandingPence,
      openInvoices: result.zoho.openCount,
      customers: result.zoho.customers.length,
      hoursAvailable: !!result.hoursAvailable,
      rowLevel: !!result.rowLevel
    }
  };
}

// THE THING THAT WAS MISSING. Reads both sources, writes both records
// through the controlled path, and reports honestly what it managed.
// Never throws on a source failure: a missing source produces a record
// that says the source is missing, which is the answer Ruth must give.
async function refreshRecords({ now = Date.now() } = {}) {
  const [hours, invoices] = await Promise.all([loadHours({ now }), loadInvoices({ now })]);

  const written = [];
  const problems = [];
  if (!hours.ok) problems.push(hours.message);
  if (!invoices.ok) problems.push(invoices.message);

  if (hours.ok) {
    const rec = buildHoursRecord(hours.parsed, { readAt: hours.readAt, title: hours.title, fileId: hours.fileId });
    await repo.upsertRecord(rec);
    written.push(rec.record_key);
  }

  // The receivables record is written even when a source is missing,
  // because "Zoho says X and the hours log could not be read" is a real
  // and useful answer, and writing nothing would leave a stale record in
  // place claiming otherwise.
  const result = reconcile.reconcile({ parsed: hours.ok ? hours.parsed : null, invoices: invoices.invoices, now });
  const provenance = {
    zohoAvailable: invoices.ok,
    zohoReadAt: invoices.ok ? invoices.readAt : '',
    zohoError: invoices.ok ? '' : (invoices.why || ''),
    hoursReadAt: hours.ok ? hours.readAt : '',
    hoursTitle: hours.title || '',
    hoursFileId: hours.fileId || '',
    // The bare REASON, not the whole sentence. Passing the sentence gave
    // "could not be read (The hours log could not be read (...))", which
    // reads as carelessness in the one place the system is asking to be
    // believed. Found by reading real output, not by reading the code.
    hoursError: hours.ok ? '' : (hours.why || '')
  };
  const base = buildReceivablesRecord(result, provenance, { now });
  let body = base.body;
  // A STALE read is the one warning the body cannot carry itself, because
  // the figures below it are real and the caveat is about their age. It
  // goes FIRST: a caveat printed under a number is read after the number
  // has already been believed.
  //
  // A FAILED Zoho read is deliberately NOT prepended here. It used to be,
  // and the body then said the same thing twice, once as a warning and
  // once as the OUTSTANDING line. `describeReceivables` withholds the
  // figure itself now, which is the stronger form.
  if (hours.stale) body = `${hours.message}\n\n${body}`;
  const receivables = { ...base, body };
  await repo.upsertRecord(receivables);
  written.push(receivables.record_key);

  return {
    ok: hours.ok && invoices.ok,
    written,
    stale: !!hours.stale,
    problems,
    outstandingPence: result.zoho.totalOutstandingPence,
    openInvoices: result.zoho.openCount,
    hoursAvailable: result.hoursAvailable,
    rowLevel: result.rowLevel
  };
}

// --- The invoice check, preserved ---------------------------------------

// Unchanged in behaviour: the finding printed beside an invoice draft.
// It ADVISES and cannot alter or send an invoice.
async function invoiceFinding({ draft = {}, now = Date.now() } = {}) {
  if (!sheetsClient.isEnabled()) return null;
  const loaded = await loadHours({ now });
  if (!loaded.ok) return { status: 'unreadable', stale: false, message: loaded.message };
  const customer = { customerName: draft.customerName || '', customerEmail: draft.customerEmail || '' };
  const result = invoiceCheck.checkInvoice({ parsed: loaded.parsed, customer, amount: draft.amount });
  if (!result.applicable) return null;
  const prefix = loaded.stale ? `${loaded.message} ` : '';
  return { status: result.status, stale: loaded.stale, client: result.client, differencePence: result.differencePence, message: `${prefix}${result.message}` };
}

module.exports = {
  loadHours,
  loadInvoices,
  refreshRecords,
  invoiceFinding,
  buildHoursRecord,
  buildReceivablesRecord,
  ageText,
  HOURS_RECORD,
  HOURS_RECORD_KEY,
  RECEIVABLES_RECORD_KEY,
  driveRegister
};
