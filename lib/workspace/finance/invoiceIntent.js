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

// The deterministic field readers, shared by parse() below and by the
// pending-action resolver (pendingAction.js) so that an amendment such
// as "change it to £600" is read by exactly the same code as the
// original sentence. Nothing here is inferred: a field that is not in
// the text comes back empty or null.
function extractFields(message, { today = new Date() } = {}) {
  // "£1,250" is twelve hundred and fifty, not one pound twenty-five: drop
  // thousands separators before the amount is read.
  const text = String(message || '').replace(/\s+/g, ' ').replace(/(\d),(\d{3})\b/g, '$1$2').trim();

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
    tail = tail.replace(AMOUNT_RE, '').replace(EMAIL_RE, '');
    // "... for £2455 and send to x@y.com": once the amount and address
    // are gone, the trailing instruction is not the job.
    tail = tail.replace(/\b(and|then)?\s*(send|email)\s*(it|this|that)?\s*(to|over to)?\s*$/i, '').replace(/\bto\b\s*$/i, '');
    description = tidyDescription(tail);
  }

  // No "for ...": the words between the verb and "invoice"/"email"
  // name the job ("create a TEST invoice", "send the WEBSITE BUILD
  // invoice"). Still the owner's own words, only read from a different
  // place in the sentence.
  if (!description) {
    const m = text.match(/\b(?:send|raise|create|issue|make|email)\s+(?:(?:me|us)\s+)?(?:(?:a|an|the)\s+)?([A-Za-z][A-Za-z0-9' -]{0,40}?)\s+(?:invoice|email|bill)\b/i);
    const phrase = m && m[1] ? m[1].trim() : '';
    // A job name is a short noun phrase ("test", "website build"), not
    // an article on its own and not a clause ("it as a draft in Zoho").
    const clause = /^(a|an|the|it|this|that|me|us|new|another|quick)$/i.test(phrase) || /\b(it|that|this|as|in|to|for|of|and|with|from)\b/i.test(phrase) || phrase.split(/\s+/).length > 4;
    if (phrase && !clause) description = tidyDescription(phrase);
  }

  // "as of today" / "dated 2026-09-06" / "on 06/09/2026"; today if absent.
  const datePhrase = (text.match(/\b(?:as of|dated|on)\b\s+(.+)$/i) || [])[1] || text;
  const { date, source: dateSource } = parseDate(datePhrase, today);

  return {
    text,
    email,
    customerName,
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null,
    description,
    date,
    dateSource,
    // True only when the sentence itself carried a date; the resolver
    // must not overwrite a pending draft's date with "today" just
    // because an amendment did not mention one.
    hasDatePhrase: dateSource !== 'default_today'
  };
}

// Whether the sentence asks for the invoice to go out, or only to exist.
// "send" and "email" ask for it to go out. Anything else ("create",
// "raise", "make", "issue") is read as draft only, because creating a
// Zoho draft is reversible and emailing a customer is not; the owner
// can say "send it" afterwards. Explicit draft wording wins over a
// send verb, so "send an invoice ... but leave it in drafts" is a draft.
const DRAFT_ONLY_RE = /\b(draft(s)? only|as a draft|in (the )?drafts?|leave it (in|as)|keep it (in|as)|do not (send|email)|don'?t (send|email)|not (to )?(send|email)|without (sending|emailing)|hold (off|it|that)|show me (it |that |the invoice )?first|review (it|that|the invoice) (first|before)|before (it is|it'?s|its) sent|not yet)\b/i;
const SEND_VERB_RE = /^\s*(please\s+)?(send|email)\b|\b(send|email)\b[^.?!]{0,40}\binvoice\b|\binvoice\b[^.?!]{0,30}\b(and|then) (send|email)\b|\b(send|email) (it|this|that)\b|\b(and|then) (send|email)\b|\bsend (it |this |that )?(to|over to)\b/i;
// A sentence that never says "invoice" but carries an amount, an email
// address and a create/send verb ("create a test email for £2455 and
// send to x@y.com", 07/09/2026) is read as an invoice request too. It
// is still deterministic and still lands behind the approval card, so
// a wrong reading costs one "discard".
const LOOSE_VERB_RE = /\b(send|raise|create|issue|make|bill|charge|email)\b/i;
function modeFromSentence(message) {
  const text = String(message || '');
  if (DRAFT_ONLY_RE.test(text)) return 'draft_only';
  if (SEND_VERB_RE.test(text)) return 'create_and_send';
  return 'draft_only';
}

// Returns { matched: false } when the sentence is not an invoice request.
// Otherwise { matched: true, complete, missing: [...], mode, draft: {...} }.
function parse(message, { today = new Date() } = {}) {
  const f = extractFields(message, { today });
  if (!f.text) return { matched: false };
  const loose = !!f.email && f.amount != null && LOOSE_VERB_RE.test(f.text);
  if (!INTENT_RE.test(f.text) && !loose) return { matched: false };

  const missing = missingFor(f);

  return {
    matched: true,
    complete: missing.length === 0,
    missing,
    mode: modeFromSentence(f.text),
    draft: {
      customerEmail: f.email,
      customerName: f.customerName,
      amount: f.amount,
      description: f.description,
      date: f.date,
      dateSource: f.dateSource
    }
  };
}

// What a draft still needs before it can be approved. Takes either the
// extractFields shape or a stored draft.
function missingFor(d) {
  const email = d.customerEmail !== undefined ? d.customerEmail : d.email;
  const missing = [];
  if (!email) missing.push('the customer email address');
  if (d.amount == null || !(d.amount > 0)) missing.push('the amount (for example £500)');
  if (!d.description) missing.push('what it is for (for example "for commercial review")');
  return missing;
}

function describe(draft) {
  const amt = draft.amount == null ? '(no amount)' : `£${draft.amount.toFixed(2)}`;
  return `${amt} to ${draft.customerName || draft.customerEmail || '(no customer)'}${draft.customerEmail ? ` <${draft.customerEmail}>` : ''} for "${draft.description || '(no description)'}", dated ${draft.date}`;
}

module.exports = { parse, describe, extractFields, missingFor, modeFromSentence, EMAIL_RE, INTENT_RE, DRAFT_ONLY_RE, SEND_VERB_RE };
