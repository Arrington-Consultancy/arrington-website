// Where an attention row gets FIXED (16/09/2026)
//
// Tom, looking at the live Today page: "I want clickable links to fix
// each of these, ie clicks through to bnaking upload, links to fix these
// gaps depending what they are."
//
// THE RULE THAT MAKES THIS SAFE TO TRUST: a destination is DERIVED from
// a structured field the row already carries - a record's own
// `record_key` and `source_class`, or a gap's own `record_key` and id -
// and is never pattern-matched out of the prose. A gap's description is
// written by the model, so routing on its wording would mean a reworded
// sentence silently sending Tom to a different page, with nothing on the
// screen to show that it had. The record key is the same field the gaps
// register already prints as "record <key>", so what the link does and
// what the register says agree by construction.
//
// Where nothing is known, the link falls back to somewhere that really
// does show the thing (the record in the Company Brain, or the gap on
// its own register) rather than to a plausible-looking page with no
// control for it. A link that lands on the wrong button is worse than a
// link to the register, because pressing the wrong button looks like
// progress.
//
// Pure: no database, no clock, no request. Everything here is a function
// of the row.

// Keyed on the record key's NAMESPACE (the segment before the first
// dot), because the namespace is what names the system behind the
// record, and every one of these four keys is written by a control on
// the page it points at:
//
//   finance.summary      <- importing an ANNA statement CSV
//   receivables.summary  <- the "Update receivables" button
//   hours.log            <- the same button (one refresh writes both)
//   email.summary        <- "Update the Company Brain" on the Email page
//
// Deliberately NOT a list of every page in the workspace. A namespace
// belongs here only when the page it names carries the control that
// rewrites that record. The snapshot records (authority.*, strategy.*,
// worker_register.* and the rest) are corrected in Drive and re-ingested
// at boot, so there is no button to send anyone to, and they fall
// through to the Company Brain below instead of being given a
// destination that cannot help.
const NAMESPACE_FIXES = {
  finance: { href: '/workspace/finance#wsAnnaUpload', label: 'Upload a statement' },
  receivables: { href: '/workspace/finance#wsReceivables', label: 'Update receivables' },
  hours: { href: '/workspace/finance#wsReceivables', label: 'Update receivables' },
  // Every anchor is on a CARD rather than on the control inside it. That
  // is not a layout preference: a control is often rendered only when its
  // connector is configured and answering, so an anchor on the button
  // disappears in exactly the state someone following a "this is stale"
  // link is most likely to be in. Found on the email link by fetching it
  // over real HTTP with Gmail unconfigured, where the id was in the view
  // source and absent from the served page. The card always renders, and
  // it says why the control is missing. Pinned by test.
  email: { href: '/workspace/email#wsEmailBrain', label: 'Update the inbox snapshot' }
};

// Two source classes have a page of their own that lists them. The rest
// are only ever seen through the Company Brain.
const CLASS_PAGES = {
  opportunity: '/workspace/opportunities',
  project: '/workspace/projects'
};

function namespaceOf(recordKey) {
  const key = typeof recordKey === 'string' ? recordKey.trim() : '';
  const dot = key.indexOf('.');
  return dot > 0 ? key.slice(0, dot) : '';
}

function brainLink(recordKey) {
  // The Company Brain's own search box takes ?q=, so this lands on the
  // record itself rather than on a list to scroll.
  return { href: `/workspace/brain?q=${encodeURIComponent(recordKey)}`, label: 'See the record' };
}

// A stale or failed record. One action: the control that rewrites it.
function fixForRecord(record) {
  const key = record && typeof record.record_key === 'string' ? record.record_key.trim() : '';
  const byNamespace = NAMESPACE_FIXES[namespaceOf(key)];
  if (byNamespace) return [byNamespace];
  const page = CLASS_PAGES[record && record.source_class];
  if (page) return [{ href: page, label: 'See the record' }];
  return key ? [brainLink(key)] : [];
}

// A material gap. Up to two actions, and the second one is not
// decoration: a gap is only ever closed by a human on the register, with
// a written statement of what was done, so the row has to offer the
// place that fixes the evidence AND the place that records it having
// been fixed. Where no record is named, the register is the only honest
// destination and the label says so.
function fixForGap(gap) {
  const id = gap && Number.isInteger(gap.id) ? gap.id : null;
  const register = { href: id ? `/workspace/gaps#gap-${id}` : '/workspace/gaps', label: 'Close the gap' };
  const key = gap && typeof gap.record_key === 'string' ? gap.record_key.trim() : '';
  const byNamespace = NAMESPACE_FIXES[namespaceOf(key)];
  if (byNamespace) return [byNamespace, register];
  if (key) return [brainLink(key), register];
  return [{ href: register.href, label: 'Open the gap' }];
}

module.exports = {
  fixForRecord,
  fixForGap,
  // Exported for tests only: the suite asserts every anchor these
  // produce actually exists in the view it points at, which is the
  // defect this whole mapping is one careless edit away from.
  NAMESPACE_FIXES,
  CLASS_PAGES,
  namespaceOf
};
