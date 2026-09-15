// Arrington AI Workspace: the one place the hours connector, the parser
// and the invoice check are joined (15/09/2026).
//
// Everything the caller needs is a single sentence to print, or nothing.
// The honesty rules from Tom's instruction live HERE, where the failure
// modes actually arrive, rather than being left to a prompt:
//
//   - If the sheet cannot be read, say so, in those words.
//   - Never invent hours.
//   - A figure from an earlier read is ALWAYS labelled as not current, and
//     is offered only alongside the reason the fresh read failed.
//   - Never claim the sheet was checked when it was not.
//   - Never infer a missing row.
//   - Never silently fall back to another record.
//
// The last of those is why this module reaches for nothing else: it has no
// access to the ledger, the Zoho reads or the Brain, so there is no other
// record it could fall back to even by accident.

const sheetsClient = require('./sheetsClient');
const hoursLog = require('./hoursLog');
const invoiceCheck = require('./invoiceCheck');

function ageText(readAt, now) {
  const then = Date.parse(readAt);
  if (!Number.isFinite(then)) return 'earlier';
  const mins = Math.max(0, Math.round((now - then) / 60000));
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// Reads the sheet and parses it, or explains why it could not. Returns
// { ok, parsed, stale, message }. `stale: true` means the figures came
// from an earlier read and every sentence built from them must say so.
async function loadHours({ now = Date.now() } = {}) {
  try {
    const sheet = await sheetsClient.readSheet({ now });
    const parsed = hoursLog.parseHoursLog(sheet.rows);
    if (!parsed.ok) {
      return { ok: false, stale: false, parsed: null, kind: 'unparseable', message: `The hours log was opened but could not be read: ${parsed.reason}. No hours have been worked out.` };
    }
    return { ok: true, stale: false, parsed, readAt: sheet.readAt, title: sheet.title, message: '' };
  } catch (err) {
    const kind = err && err.kind ? err.kind : 'unreachable';
    const why = err && err.message ? err.message : 'the read failed';
    const cached = sheetsClient.cachedRead();
    if (!cached) {
      return { ok: false, stale: false, parsed: null, kind, message: `The hours log could not be read (${why}), so I have not checked it and have no hours figure. Nothing has been estimated.` };
    }
    const parsed = hoursLog.parseHoursLog(cached.rows);
    if (!parsed.ok) {
      return { ok: false, stale: false, parsed: null, kind, message: `The hours log could not be read (${why}), and the last copy held in memory cannot be parsed either. No hours figure is available.` };
    }
    return {
      ok: true,
      stale: true,
      parsed,
      readAt: cached.readAt,
      kind,
      message: `NOT CURRENT: the hours log could not be read just now (${why}). The figures below come from the last successful read, ${ageText(cached.readAt, now)}, and may be out of date.`
    };
  }
}

// The finding to print beside an invoice draft, or null when there is
// nothing to say. Null happens in exactly two ordinary cases: the
// connector is switched off, and this invoice names a client the log does
// not cover. Neither is a warning.
async function invoiceFinding({ draft = {}, now = Date.now() } = {}) {
  if (!sheetsClient.isEnabled()) return null;
  const loaded = await loadHours({ now });
  if (!loaded.ok) {
    // A read failure IS reported: silence here would let an invoice go out
    // with nobody knowing the check did not run.
    return { status: 'unreadable', stale: false, message: loaded.message };
  }
  const customer = { customerName: draft.customerName || '', customerEmail: draft.customerEmail || '' };
  const result = invoiceCheck.checkInvoice({ parsed: loaded.parsed, customer, amount: draft.amount });
  if (!result.applicable) return null;
  const prefix = loaded.stale ? `${loaded.message} ` : '';
  return { status: result.status, stale: loaded.stale, client: result.client, differencePence: result.differencePence, message: `${prefix}${result.message}` };
}

// The Company Brain record: what has been done, for whom, and the totals.
// One record, source class 'hours', confidential. Built only from rows
// that were actually read.
function buildRecord(parsed, { readAt = null } = {}) {
  if (!parsed || !parsed.ok) return null;
  const clients = hoursLog.clientsIn(parsed);
  const perClient = clients.map((c) => {
    const t = hoursLog.totalFor(parsed, c);
    return `${c}: ${t.hoursText} billable across ${t.count} entr${t.count === 1 ? 'y' : 'ies'}${t.pence == null ? '' : ` = ${t.valueText}`}`;
  });
  const lines = parsed.entries.map((e) => `${e.date} | ${e.client} | ${e.hours} h (${e.minutes} min) | ${e.billable ? 'billable' : 'NOT billable'} | ${e.work}`);
  const body = [
    `Hourly rate on the record: ${parsed.rate == null ? 'not stated' : hoursLog.formatMoney(Math.round(parsed.rate * 100))}.`,
    perClient.length ? `Totals by client. ${perClient.join('. ')}.` : 'No billable entries were read.',
    parsed.unreadable.length ? `${parsed.unreadable.length} row(s) could not be read and are excluded; no hours have been estimated for them.` : 'Every row was read.',
    'Entries, most recent last:',
    ...lines
  ].join('\n');
  return {
    record_key: 'hours.log',
    source_class: 'hours',
    title: 'Hours log: work completed and billable time',
    body,
    sensitivity: 'confidential',
    source_ref: `Google Sheet ${sheetsClient.sheetId()}${readAt ? `, read ${readAt}` : ''}`
  };
}

module.exports = { loadHours, invoiceFinding, buildRecord, ageText };
