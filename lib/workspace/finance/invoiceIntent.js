// Arrington AI Workspace: deterministic "send an invoice" intent.
//
// Tom's instruction (06/09/2026): type into Ask Ruth
//   "send an invoice to tomarrington@outlook.com £500 for mini commercial
//    review as of today"
// and have the workspace do it. This module is the reading of that
// sentence. It is deterministic on purpose: a draft that will become a
// real invoice in Zoho, emailed to a real address, must be built from
// what the person typed and nothing else. No model is asked to infer an
// amount, an address or a description; if any of the three is missing
// the draft is incomplete and the caller says which is missing.
//
// Pure: no I/O, no environment, no clock except the injected `today`.
// Nothing here sends anything; the caller puts the draft into the human
// approval queue and a separate, approved, spent-once step executes it.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const INTENT_RE = /\b(send|raise|create|issue|make)\b[^.?!]{0,40}\binvoice\b|\binvoice\b[^.?!]{0,20}\b(to|for)\b/i;
const AMOUNT_RE = /(?:£|GBP\s?|\bgbp\s?)\s?(\d{1,7}(?:[.,]\d{1,2})?)|(\d{1,7}(?:[.,]\d{1,2})?)\s?(?:pounds?|quid|gbp)\b/i;
const DATE_ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DATE_UK_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;

function isoDate(d) { return d.toISOString().slice(0, 10); }

function parseDate(text, today) {
  const t = String(text || '').toLowerCase();
  if (/\btoday\b|\bnow\b/.test(t)) return { date: isoDate(today), source: 'today' };
  if (/\btomorrow\b/.test(t)) { const d = new Date(today); d.setUTCDate(d.getUTCDate() + 1); return { date: isoDate(d), source: 'tomorrow' }; }
  const iso = t.match(DATE_ISO_RE);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, source: 'iso' };
  const uk = t.match(DATE_UK_RE);
  if (uk) return { date: `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`, source: 'uk' };
  return { date: isoDate(today), source: 'default_today' };
}

function tidyDescription(s) {
  // Removing an amount or an address from the middle of a phrase can leave
  // ", ," or a trailing separator behind; collapse those before capitalising.
  const t = String(s || '').replace(/\s+/g, ' ').replace(/(\s*,\s*){2,}/g, ', ').trim().replace(/[\s.,;:]+$/, '').replace(/^[\s.,;:]+/, '');
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Returns { matched: false } when the sentence is not an invoice request.
// Otherwise { matched: true, complete, missing: [...], draft: {...} }.
function parse(message, { today = new Date() } = {}) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (!text || !INTENT_RE.test(text)) return { matched: false };

  const emailMatch = text.match(EMAIL_RE);
  const email = emailMatch ? emailMatch[0] : '';

  const amountMatch = text.match(AMOUNT_RE);
  const amountStr = amountMatch ? (amountMatch[1] || amountMatch[2]) : '';
  const amount = amountStr ? Number(amountStr.replace(',', '.')) : NaN;

  // Customer name: the words between "to" and the email address, if any
  // ("to Acme Ltd acme@example.com", "to Jane at jane@..."). Otherwise
  // the part of the address before the @, which Zoho needs as a name.
  let customerName = '';
  if (email) {
    const before = text.slice(0, text.indexOf(email));
    const m = before.match(/\bto\s+(.+?)\s*(?:,|\(|<|\bat\b|$)/i);
    if (m && m[1] && !/^(the|an?|my|our)$/i.test(m[1].trim())) customerName = m[1].trim().replace(/["'<>()]/g, '');
    if (!customerName) customerName = email.split('@')[0];
  }

  // Description: after " for ", stopping at a date phrase, an amount, or
  // the email if either of those comes after it.
  let description = '';
  const forIdx = text.search(/\bfor\b/i);
  if (forIdx >= 0) {
    let tail = text.slice(forIdx + 3);
    tail = tail.split(/\b(?:as of|dated|due|on)\b/i)[0];
    tail = tail.replace(AMOUNT_RE, '').replace(EMAIL_RE, '').replace(/\bto\b\s*$/i, '');
    description = tidyDescription(tail);
  }

  // "as of today" / "dated 2026-09-06" / "on 06/09/2026"; today if absent.
  const datePhrase = (text.match(/\b(?:as of|dated|on)\b\s+(.+)$/i) || [])[1] || text;
  const { date, source: dateSource } = parseDate(datePhrase, today);

  const missing = [];
  if (!email) missing.push('the customer email address');
  if (!Number.isFinite(amount) || amount <= 0) missing.push('the amount (for example £500)');
  if (!description) missing.push('what it is for (for example "for commercial review")');

  return {
    matched: true,
    complete: missing.length === 0,
    missing,
    draft: {
      customerEmail: email,
      customerName,
      amount: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null,
      description,
      date,
      dateSource
    }
  };
}

function describe(draft) {
  const amt = draft.amount == null ? '(no amount)' : `£${draft.amount.toFixed(2)}`;
  return `${amt} to ${draft.customerName || draft.customerEmail || '(no customer)'}${draft.customerEmail ? ` <${draft.customerEmail}>` : ''} for "${draft.description || '(no description)'}", dated ${draft.date}`;
}

module.exports = { parse, describe, EMAIL_RE };
