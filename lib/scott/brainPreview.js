// Scott AI Demonstration: the one-line preview under each record area on
// the Company Brain.
//
// Pulled out of routes/scott.js on 14/09/2026 so it can be tested directly
// rather than through a rendered page, because what it was doing was only
// ever going to be found by looking at the screen as a stranger would.
//
// What it used to do: `Object.values(rec)[1]`, whichever field happened to
// be second in the object, then a hard `.slice(0, 90)`. Real areas
// previewed as "8", "3750", "SAKS22V" and "Customers", and longer ones
// ended mid-word with no ellipsis ("public marketin", "before a failure
// oc"). Every one of those is true, drawn from a record the reader is
// cleared to see, and useless to them.
//
// What it does now: prefer the fields that exist to describe a record,
// then the longest sentence-shaped string in it, and otherwise return
// nothing at all. A titled, counted card with no preview line is honest. A
// stray field dressed as a summary is not.
//
// SECURITY NOTE, unchanged and load-bearing: this module never chooses
// WHICH record to preview. The caller passes a record already filtered
// through clearance, which is what stops the preview line becoming a way
// around the permission model. Nothing here reads the full record set.
//
// Pure: no database, no clock, no I/O.

// Fields that exist in this dataset specifically to describe their record.
// 'ref' is deliberately NOT in this list: a reference like "I-260702-01" is
// how a record is identified, not what it says, and on its own it is the
// same useless single token as the "8" and "SAKS22V" this replaces. It is
// used as a PREFIX to a real description instead, below.
const DESCRIPTIVE_KEYS = ['name', 'title', 'summary', 'description', 'detail', 'rule'];

// A short identifier worth carrying in front of a description, so an
// incident or enquiry preview reads "I-260702-01 · minor staple-gun finger
// puncture" rather than either half alone.
const REFERENCE_KEYS = ['ref'];
const MAX_REFERENCE = 24;

// Keys that identify or classify the record rather than describing it, so
// they never make a useful preview on their own.
const SKIP_KEYS = ['domain', 'source'];

const MAX_PREVIEW = 110;

// The longest string in the record that reads as prose. A string with no
// space in it is an id, a code or a name; on its own it tells the reader
// nothing, which is the defect this replaces.
function longestSentence(record) {
  let longest = '';
  Object.entries(record).forEach(([key, value]) => {
    if (SKIP_KEYS.includes(key) || typeof value !== 'string') return;
    const text = value.trim();
    if (!/\s/.test(text)) return;
    if (text.length > longest.length) longest = text;
  });
  return longest;
}

function referenceOf(record) {
  for (const key of REFERENCE_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() && value.trim().length <= MAX_REFERENCE) {
      return value.trim();
    }
  }
  return '';
}

function describe(record) {
  for (const key of DESCRIPTIVE_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 3) return value.trim();
  }
  return longestSentence(record);
}

function previewOf(record) {
  if (!record || typeof record !== 'object') return '';
  const description = describe(record);
  const reference = referenceOf(record);
  if (description && reference) return `${reference} · ${description}`;
  // A reference with nothing to say about it is still better than a blank
  // line under an area the reader can see, but only because it is at least
  // the real identifier of a real record.
  return description || reference;
}

// Cut on a word boundary, and say that it was cut. The 40 floor stops a
// single very long word collapsing the preview to almost nothing: past
// that point an ugly mid-word cut reads better than three characters and
// an ellipsis.
function truncate(text, max = MAX_PREVIEW) {
  const value = String(text || '');
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const kept = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${kept.replace(/[,;:.\s]+$/, '')}…`;
}

function previewFor(record) {
  return truncate(previewOf(record));
}

module.exports = { DESCRIPTIVE_KEYS, MAX_PREVIEW, previewOf, truncate, previewFor };
