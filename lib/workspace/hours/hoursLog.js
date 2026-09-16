// Arrington AI Workspace: reading the hours log (15/09/2026).
//
// Tom's instruction after an invoice went out at a stale figure: the
// workspace should be able to read the hours record, total it itself, and
// check a proposed invoice against it.
//
// This module is the READING and the ARITHMETIC. It is pure: no network,
// no environment, no clock. It is handed the raw cell grid the Sheets API
// returns and produces entries, totals and the rate. Nothing here decides
// anything about an invoice (see invoiceCheck.js) and nothing here fetches
// (see sheetsClient.js).
//
// Two rules shape the whole file, both from the instruction:
//
// 1. TOTAL IT OURSELVES. The sheet states its own totals, and we read them
//    too, but only to CROSS-CHECK our own arithmetic. A stated total that
//    disagrees with the rows is a finding, not an answer.
// 2. NEVER INFER A MISSING VALUE. A row without an hours figure is skipped
//    and counted as unreadable; it is never estimated from the start and
//    finish times, never averaged, never carried over from a neighbour.
//    An unreadable row is reported so a person can look at it.

// The log's own column headings, matched case-insensitively and loosely so
// a renamed heading ("Hours worked") still lands. Order is not assumed:
// the header row is located by content and the indexes read off it.
const COLUMNS = {
  date: [/^date$/i],
  client: [/client/i, /project/i],
  work: [/work\s*completed/i, /description/i, /^work$/i],
  start: [/^start/i],
  finish: [/^finish/i, /^end/i],
  hours: [/^hours?$/i, /hours\s*worked/i, /decimal\s*hours/i],
  billable: [/billable/i],
  rate: [/rate/i],
  value: [/^value/i, /^amount/i],
  // THE INVOICE REFERENCE (designed 15/09/2026, NOT YET ON THE SHEET).
  //
  // Without it, "have I invoiced everything?" can only be answered by
  // comparing TOTALS per client. With it, the answer names the exact
  // unbilled rows. The parser reads it when present and behaves exactly
  // as before when absent, so the column can be added to the live sheet
  // at any time with no deploy and nothing to migrate.
  //
  // Tom has not been asked to change the live sheet yet; see the
  // governance submission for the exact column and its behaviour.
  invoiceRef: [/invoice\s*ref/i, /invoice\s*(number|no\.?|#)/i, /^invoiced$/i],
  notes: [/notes/i, /evidence/i]
};

// A row is the header row when it names a date column, an hours column and
// a client column. Three is deliberate: "Date" alone appears in plenty of
// summary blocks, and matching one of those as the header would silently
// produce an empty log rather than an error.
const REQUIRED_HEADERS = ['date', 'hours', 'client'];

function cell(row, i) {
  if (!Array.isArray(row) || i == null || i < 0) return '';
  const v = row[i];
  return v == null ? '' : String(v).trim();
}

function matchColumn(heading) {
  const h = String(heading || '').trim();
  if (!h) return null;
  for (const [key, patterns] of Object.entries(COLUMNS)) {
    if (patterns.some((p) => p.test(h))) return key;
  }
  return null;
}

// Numbers as they actually appear in this sheet: "£20.00", "27.57",
// "1,234.50", "£551.33". Returns null rather than NaN or 0, because a
// zero that came from an unparseable cell is a fabricated figure.
function parseNumber(text) {
  const t = String(text == null ? '' : text).replace(/[£$,\s]/g, '').trim();
  if (!t) return null;
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// "Yes"/"No"/"Y"/"TRUE"/"1". Anything unrecognised is NOT billable, which
// is the safe direction: a row we cannot classify must not inflate an
// invoice. It is reported as unreadable so the ambiguity is visible.
function parseBillable(text) {
  const t = String(text == null ? '' : text).trim().toLowerCase();
  if (!t) return null;
  if (/^(y|yes|true|1|billable)$/.test(t)) return true;
  if (/^(n|no|false|0|non-billable|not billable)$/.test(t)) return false;
  return null;
}

function findHeaderRow(rows) {
  for (let r = 0; r < rows.length; r += 1) {
    const row = Array.isArray(rows[r]) ? rows[r] : [];
    const index = {};
    row.forEach((h, i) => {
      const key = matchColumn(h);
      // First match wins, so a later "Rate (£/hr)" cannot displace an
      // earlier "Hours" if both somehow matched the same key.
      if (key && index[key] === undefined) index[key] = i;
    });
    if (REQUIRED_HEADERS.every((k) => index[k] !== undefined)) return { row: r, index };
  }
  return null;
}

// The hourly rate, taken from the sheet's own summary block: a cell that
// says "Hourly rate" with the figure in a neighbouring cell. Read from the
// sheet rather than configured in code, so changing the rate is an edit to
// the record and never a deploy.
function findRate(rows) {
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (let i = 0; i < row.length; i += 1) {
      if (!/hourly\s*rate|rate\s*\(£?\/?hr\)|rate per hour/i.test(String(row[i] || ''))) continue;
      for (let j = i + 1; j < row.length; j += 1) {
        const n = parseNumber(row[j]);
        if (n != null && n > 0) return n;
      }
    }
  }
  return null;
}

// The sheet's own stated totals. Used ONLY to cross-check our arithmetic.
function findStatedTotals(rows) {
  let hours = null;
  let value = null;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (let i = 0; i < row.length; i += 1) {
      const label = String(row[i] || '');
      const next = () => {
        for (let j = i + 1; j < row.length; j += 1) {
          const n = parseNumber(row[j]);
          if (n != null) return n;
        }
        return null;
      };
      if (hours == null && /total\s*hours\s*\(decimal\)/i.test(label)) hours = next();
      if (value == null && /total\s*value/i.test(label)) value = next();
    }
  }
  return { hours, value };
}

// Money in integer pence throughout, rounded once at the point a decimal
// number of hours becomes money. £20.00 x 0.9166666667h is 1833.33 pence,
// which is £18.33; carrying the fraction further and rounding later is how
// a check reports a penny difference that does not exist.
function toPence(hours, rate) {
  if (hours == null || rate == null) return null;
  return Math.round(hours * rate * 100);
}

function formatHours(decimal) {
  if (decimal == null) return '';
  const totalMinutes = Math.round(decimal * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatMoney(pence) {
  if (pence == null) return '';
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  return `${sign}£${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// rows: the raw cell grid (array of arrays of strings) from one or more
// tabs, concatenated. Returns a structure that is honest about what it
// could not read rather than quietly dropping it.
function parseHoursLog(rows) {
  const grid = Array.isArray(rows) ? rows.filter(Array.isArray) : [];
  const rate = findRate(grid);
  const stated = findStatedTotals(grid);
  const header = findHeaderRow(grid);
  if (!header) {
    return {
      ok: false,
      reason: 'no header row was found, so the log could not be read',
      entries: [],
      unreadable: [],
      rate,
      stated
    };
  }

  const entries = [];
  const unreadable = [];
  for (let r = header.row + 1; r < grid.length; r += 1) {
    const row = grid[r];
    const date = cell(row, header.index.date);
    const client = cell(row, header.index.client);
    const work = cell(row, header.index.work);
    const hoursText = cell(row, header.index.hours);
    const billableText = cell(row, header.index.billable);
    // A wholly blank line is the end of the table or a spacer, not a
    // defect. Only a line with SOMETHING in it can be unreadable.
    if (!date && !client && !work && !hoursText) continue;

    const hours = parseNumber(hoursText);
    const billable = parseBillable(billableText);
    if (hours == null || hours <= 0) {
      unreadable.push({ rowNumber: r + 1, date, client, work, reason: 'no usable hours figure' });
      continue;
    }
    if (billable == null) {
      unreadable.push({ rowNumber: r + 1, date, client, work, reason: 'the billable column could not be read' });
      continue;
    }
    // An invoice reference is present, absent, or one of two words that
    // mean "deliberately not going to be invoiced". Anything else is
    // treated as a reference, because a value nobody recognises is more
    // likely a real invoice number than a mistake, and reading it as
    // unbilled would UNDERSTATE what has been invoiced.
    const refText = cell(row, header.index.invoiceRef);
    const ref = refText.trim();
    const writtenOff = /^(n\/?a|not billable|no charge|written off|goodwill)$/i.test(ref);

    entries.push({
      rowNumber: r + 1,
      date,
      client,
      work,
      hours,
      billable,
      minutes: Math.round(hours * 60),
      // '' means genuinely not yet invoiced. The column being ABSENT from
      // the sheet is a different thing entirely and is reported by
      // hasInvoiceRefColumn below, because "no reference" and "we cannot
      // tell" must never read the same.
      invoiceRef: writtenOff ? '' : ref,
      writtenOff,
      notes: cell(row, header.index.notes)
    });
  }

  return {
    ok: true,
    reason: '',
    entries,
    unreadable,
    rate,
    stated,
    // Whether row-level reconciliation is even possible on this sheet.
    // False means every answer about what is invoiced can only be a
    // comparison of totals, and must say so.
    hasInvoiceRefColumn: header.index.invoiceRef !== undefined
  };
}

// Totals for one client (or all clients when client is null). Billable
// rows only: a non-billable row is work done and never money owed.
function totalFor(parsed, client = null) {
  const wanted = client == null ? null : String(client).trim().toLowerCase();
  const rows = parsed.entries.filter((e) => e.billable && (wanted == null || String(e.client).trim().toLowerCase() === wanted));
  const hours = rows.reduce((sum, e) => sum + e.hours, 0);
  // Rounded to the precision a spreadsheet would show, so a float artefact
  // (27.566666666666666 + epsilon) cannot make two equal totals differ.
  const hoursRounded = Math.round(hours * 1e6) / 1e6;
  return {
    client: client == null ? null : String(client).trim(),
    rows,
    count: rows.length,
    hours: hoursRounded,
    hoursText: formatHours(hoursRounded),
    rate: parsed.rate,
    pence: toPence(hoursRounded, parsed.rate),
    valueText: formatMoney(toPence(hoursRounded, parsed.rate))
  };
}

// Does our own arithmetic agree with the figure the sheet states about
// itself? Reported, never used to replace the computed figure.
function crossCheck(parsed, total) {
  const out = { checked: false, agrees: null, note: '' };
  if (parsed.stated.value == null && parsed.stated.hours == null) return out;
  out.checked = true;
  const statedPence = parsed.stated.value == null ? null : Math.round(parsed.stated.value * 100);
  const hoursAgree = parsed.stated.hours == null || Math.abs(parsed.stated.hours - total.hours) < 0.02;
  const valueAgree = statedPence == null || Math.abs(statedPence - total.pence) <= 2;
  out.agrees = hoursAgree && valueAgree;
  if (!out.agrees) {
    out.note = `the sheet states ${parsed.stated.hours == null ? '' : `${parsed.stated.hours} hours`}`
      + `${parsed.stated.hours != null && statedPence != null ? ' and ' : ''}`
      + `${statedPence == null ? '' : formatMoney(statedPence)}`
      + `, and the rows add up to ${total.hours} hours and ${total.valueText}`;
  }
  return out;
}

// The clients the log knows about, in first-seen order.
function clientsIn(parsed) {
  const seen = [];
  for (const e of parsed.entries) {
    const c = String(e.client || '').trim();
    if (c && !seen.some((s) => s.toLowerCase() === c.toLowerCase())) seen.push(c);
  }
  return seen;
}

module.exports = {
  parseHoursLog,
  totalFor,
  crossCheck,
  clientsIn,
  parseNumber,
  parseBillable,
  INVOICE_REF_WRITTEN_OFF: ['n/a', 'not billable', 'no charge', 'written off', 'goodwill'],
  findHeaderRow,
  findRate,
  findStatedTotals,
  toPence,
  formatHours,
  formatMoney,
  COLUMNS,
  REQUIRED_HEADERS
};
