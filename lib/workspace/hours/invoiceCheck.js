// Arrington AI Workspace: checking a proposed invoice against the hours
// log (15/09/2026).
//
// Tom's instruction, after an invoice went out at a figure that omitted a
// 55 minute row: read the billable rows, total them independently, apply
// the recorded rate, compare, and where the figures differ SAY WHICH ROW
// causes it. "The figures do not match" is not an acceptable answer when
// the difference can be attributed.
//
// What this module must never do, stated here because it is the whole
// point of the control and not a detail:
//
//   - It never alters an invoice. It returns a finding; the caller prints
//     it. No function here takes or returns a draft to be written back.
//   - It never sends anything. There is no transport in this file.
//   - It never silently prefers one figure over the other. Where they
//     differ, BOTH are stated, and the person decides.
//
// Pure: no network, no environment, no clock.

const hoursLog = require('./hoursLog');

// Matching an invoice customer to a client code in the log. The log says
// "WSA"; the invoice says "Tim Hunt at World Student Advisors" with an
// address at worldstudentadvisors.com.
//
// Deliberately strict, and deliberately refuses on ambiguity. Attaching
// the wrong client's hours to an invoice is worse than attaching none: a
// missing check is visible, a confident wrong one is not.
function normalise(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function acronym(text) {
  return normalise(text).split(' ').filter(Boolean).map((w) => w[0]).join('');
}

function clientMatches(clientCode, { customerName = '', customerEmail = '' } = {}) {
  const code = normalise(clientCode);
  if (!code) return false;
  const name = normalise(customerName);
  const domain = String(customerEmail || '').split('@')[1] || '';
  const domainFlat = normalise(domain).replace(/ /g, '');
  const nameFlat = name.replace(/ /g, '');
  const codeFlat = code.replace(/ /g, '');
  if (!codeFlat) return false;

  // The full name appears in the customer, either way round.
  if (name && (name === code || name.split(' ').includes(codeFlat))) return true;
  if (nameFlat && codeFlat.length >= 4 && nameFlat.includes(codeFlat)) return true;
  // The code is the customer's initials ("WSA" for World Student Advisors).
  if (name && codeFlat.length >= 2 && acronym(customerName).includes(codeFlat)) return true;
  // The email domain, TLD stripped. An exact match, or a containment only
  // once the code is long enough that containment means something: "abc"
  // inside "fabcorp.com" is a coincidence, and a coincidence here puts one
  // client's hours against another client's invoice.
  const label = String(domain || '').toLowerCase().replace(/\.(com|co\.uk|co|uk|org|net|io|ltd)$/i, '').replace(/[^a-z0-9]/g, '');
  if (label && (label === codeFlat || (codeFlat.length >= 4 && label.includes(codeFlat)))) return true;
  return false;
}

// Returns the single matching client code, or null when none or more than
// one match. Ambiguity resolves to null on purpose.
function resolveClient(parsed, customer) {
  const candidates = hoursLog.clientsIn(parsed).filter((c) => clientMatches(c, customer));
  return candidates.length === 1 ? candidates[0] : null;
}

// Which row, or pair of rows, accounts for a difference of `pence`.
// Single rows first, then pairs; beyond that the search is not attempted,
// because a "some combination of five entries" answer helps nobody and
// the honest report is that no small set explains it.
const PENNY_TOLERANCE = 2;

function attributeDifference(rows, pence, rate) {
  const target = Math.abs(pence);
  if (target === 0) return { kind: 'none', rows: [] };
  const valued = rows.map((r) => ({ row: r, pence: hoursLog.toPence(r.hours, rate) })).filter((r) => r.pence != null);

  // EVERY match is collected before one is named, and a difference that
  // several entries could equally explain is reported as ambiguous rather
  // than pinned on whichever the loop reached first. Found by test: in
  // the real log, £30.00 is both the 26 and 27 August pair AND the 21 and
  // 22 August pair, and naming one of them would have been a confident
  // wrong answer of exactly the kind this check exists to prevent.
  const singles = valued.filter((a) => Math.abs(a.pence - target) <= PENNY_TOLERANCE);
  if (singles.length === 1) return { kind: 'single', rows: [singles[0].row] };
  if (singles.length > 1) return { kind: 'ambiguous', rows: singles.map((s) => s.row) };

  const pairs = [];
  for (let i = 0; i < valued.length; i += 1) {
    for (let j = i + 1; j < valued.length; j += 1) {
      if (Math.abs(valued[i].pence + valued[j].pence - target) <= PENNY_TOLERANCE) {
        pairs.push([valued[i].row, valued[j].row]);
      }
    }
  }
  if (pairs.length === 1) return { kind: 'pair', rows: pairs[0] };
  if (pairs.length > 1) return { kind: 'ambiguous', rows: pairs.flat() };
  return { kind: 'unattributed', rows: [] };
}

function describeRow(row) {
  const when = row.date ? row.date : 'an undated entry';
  const mins = `${row.minutes} minute`;
  return `the ${when} ${mins} billable entry`;
}

// The check itself.
//
// `parsed`   - the output of hoursLog.parseHoursLog
// `customer` - { customerName, customerEmail } from the invoice draft
// `amount`   - the proposed invoice amount, in POUNDS (as the draft holds it)
//
// Returns { applicable, status, message, ... }. `applicable: false` means
// this invoice has no client in the log, which is the ordinary case for
// most invoices and is silent rather than a warning.
function checkInvoice({ parsed, customer = {}, amount = null }) {
  if (!parsed || !parsed.ok) {
    return { applicable: false, status: 'unreadable', message: '', reason: (parsed && parsed.reason) || 'the hours log could not be read' };
  }
  const client = resolveClient(parsed, customer);
  if (!client) return { applicable: false, status: 'no_client', message: '' };
  if (parsed.rate == null) {
    return {
      applicable: true,
      status: 'no_rate',
      client,
      message: `The hours log has entries for ${client}, but no hourly rate could be read from it, so no amount can be worked out. Nothing has been changed.`
    };
  }

  const total = hoursLog.totalFor(parsed, client);
  const cross = hoursLog.crossCheck(parsed, total);
  const base = `Hours log for ${client}: ${total.hoursText} at ${hoursLog.formatMoney(Math.round(parsed.rate * 100))}/hour = ${total.valueText} across ${total.count} billable entr${total.count === 1 ? 'y' : 'ies'}.`;

  const notes = [];
  if (cross.checked && cross.agrees === false) {
    notes.push(`The sheet's own summary does not agree with its rows: ${cross.note}. The figure above is the one worked out from the rows.`);
  }
  if (parsed.unreadable.length) {
    const which = parsed.unreadable.slice(0, 3).map((u) => `row ${u.rowNumber} (${u.reason})`).join(', ');
    notes.push(`${parsed.unreadable.length} row${parsed.unreadable.length === 1 ? '' : 's'} could not be read and ${parsed.unreadable.length === 1 ? 'is' : 'are'} NOT included: ${which}. No hours have been estimated for ${parsed.unreadable.length === 1 ? 'it' : 'them'}.`);
  }

  if (amount == null) {
    return { applicable: true, status: 'no_amount', client, total, notes, message: `${base}${notes.length ? ' ' + notes.join(' ') : ''}` };
  }

  const proposedPence = Math.round(Number(amount) * 100);
  if (!Number.isFinite(proposedPence)) {
    return { applicable: true, status: 'no_amount', client, total, notes, message: `${base}${notes.length ? ' ' + notes.join(' ') : ''}` };
  }
  const diff = total.pence - proposedPence;

  if (Math.abs(diff) <= PENNY_TOLERANCE) {
    return {
      applicable: true,
      status: 'match',
      client,
      total,
      proposedPence,
      differencePence: diff,
      notes,
      message: `${base} Your draft invoice is ${hoursLog.formatMoney(proposedPence)}, which matches.${notes.length ? ' ' + notes.join(' ') : ''}`
    };
  }

  const attribution = attributeDifference(total.rows, diff, parsed.rate);
  const direction = diff > 0 ? 'below' : 'above';
  let attributed;
  if (attribution.kind === 'single') {
    attributed = ` The difference corresponds to ${describeRow(attribution.rows[0])}.`;
  } else if (attribution.kind === 'pair') {
    attributed = ` The difference corresponds to ${describeRow(attribution.rows[0])} and ${describeRow(attribution.rows[1])} together.`;
  } else if (attribution.kind === 'ambiguous') {
    const dates = [...new Set(attribution.rows.map((r) => r.date).filter(Boolean))];
    attributed = ` More than one combination of entries accounts for the difference exactly (${dates.join(', ')}), so it cannot be pinned on one of them.`;
  } else {
    attributed = ' No single entry or pair of entries accounts for the difference, so it has not been attributed to a row.';
  }

  return {
    applicable: true,
    status: diff > 0 ? 'under' : 'over',
    client,
    total,
    proposedPence,
    differencePence: diff,
    attribution,
    notes,
    message: `${base} Your draft invoice is ${hoursLog.formatMoney(proposedPence)}, which is ${hoursLog.formatMoney(Math.abs(diff))} ${direction} the logged total. Difference: ${hoursLog.formatMoney(Math.abs(diff))}.${attributed} Nothing has been changed: the figures are both stated so you can decide which is right.${notes.length ? ' ' + notes.join(' ') : ''}`
  };
}

module.exports = { checkInvoice, resolveClient, clientMatches, attributeDifference, normalise, acronym, PENNY_TOLERANCE };
