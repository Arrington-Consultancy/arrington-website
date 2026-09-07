// Arrington AI Workspace: follow-ups to a pending action in Ask Ruth.
//
// Tom's report (07/09/2026): after Ruth drafted invoice approval #1, the
// follow-up "Create it as a draft in Zoho Invoice only. Do not email it"
// was read by the invoice parser as a brand new invoice with every field
// missing, and "I want the invoice sitting in drafts" fell through to the
// model, which had never been told an approval existed and answered
// about Gmail drafts. Both failures had the same root: nothing ever
// interpreted a sentence AGAINST the action already waiting.
//
// This module is that interpretation. It runs before the invoice parser
// and only when an open action exists. It is deterministic on purpose:
// the fields that matter (customer, amount, description, date) are read
// by the same extractors the original sentence was read with, in
// invoiceIntent.js, and never by a model. A sentence it does not
// recognise is passed on unchanged, so an ordinary question asked while
// an approval happens to be open is still an ordinary question.
//
// Pure: no I/O, no environment, no clock except the injected `today`.
// Nothing here changes anything; the caller applies the operation to the
// approval row and says what it did.

const intent = require('./invoiceIntent');

const CANCEL_RE = /\b(cancel|scrap|drop|discard|delete|bin|forget|abandon|withdraw)\b[^.?!]{0,30}\b(it|that|this|the (invoice|draft|approval)|approval\s*#?\d+)\b|\b(never mind|forget it|cancel that|scrap that|drop it|drop that|bin it|leave it out)\b|\bdon'?t (create|raise|make|need) (it|that|the invoice)\b/i;
const SHOW_RE = /\b(show|read|see|check|review|remind)\b[^.?!]{0,20}\b(me\b[^.?!]{0,10})?(it|that|this|the (draft|invoice|pending|approval))\b|\bwhat('?s| is| was)\b[^.?!]{0,30}\b(pending|waiting|the (draft|invoice|status|amount)|(that|this) (draft|invoice|approval))\b|\b(still )?(pending|waiting|open)\b|\b(let me (see|review|check)|show me)\b|\bbefore (it is|it'?s|its) sent\b|\bfirst\b/i;
const SEND_NOW_RE = /\b(send|email) (it|that|this|the (invoice|draft))\b|\bgo ahead\b|\b(approve|create) and (send|email)\b|\bsend (it )?(now|to them|to the customer)\b|\b(create|make) it and (send|email)\b/i;
// Words that tie a sentence to something already in play. An amendment
// needs one of these as well as a new value, so "send an invoice to
// other@example.com £50 for x" (a fresh, complete request) is not
// mistaken for a change to the pending one.
const REFERS_RE = /\b(it|that|this|the (invoice|draft|amount|description|customer|email|date|address|approval)|instead|rather than|actually|change|amend|update|make it|set it|correct)\b/i;
// A fresh, complete invoice sentence names a different customer from the
// pending one; the resolver stands aside for it.
function isFreshRequest(question, pending) {
  const parsed = intent.parse(question);
  if (!parsed.matched || !parsed.complete) return false;
  const email = String(parsed.draft.customerEmail || '').toLowerCase();
  const pendingEmail = String(pending.draft && pending.draft.customerEmail || '').toLowerCase();
  return !!email && email !== pendingEmail;
}

// Verbs that make a new value in a follow-up a CHANGE rather than a
// mention. "what is that invoice for again?" carries the word "for" and
// is a question, not an instruction to rename the job.
const CHANGE_VERB_RE = /\b(change|amend|update|set|make|correct|alter|instead|rather than|should be|should read|is for|it'?s for|to be|date it|dated|as of|due)\b/i;
const TRAILING_FILLER_RE = /\s*\b(instead|please|rather|now|then|thanks|ta)\b[\s.!]*$/i;

function invoiceChanges(question, pending, today) {
  if (/\?\s*$/.test(question)) return {};
  const f = intent.extractFields(question, { today });
  const draft = pending.draft || {};
  const changes = {};
  if (f.email && f.email.toLowerCase() !== String(draft.customerEmail || '').toLowerCase()) {
    changes.customerEmail = f.email;
    changes.customerName = f.customerName || f.email.split('@')[0];
  } else if (f.email && f.customerName && f.customerName !== f.email.split('@')[0] && f.customerName !== draft.customerName) {
    changes.customerName = f.customerName;
  }
  if (f.amount != null && f.amount !== draft.amount) changes.amount = f.amount;
  const description = f.description.replace(TRAILING_FILLER_RE, '').trim();
  // A full restatement ("send an invoice to ... for ...") replaces the
  // description outright; a shorter follow-up needs a change verb.
  if (description && (intent.INTENT_RE.test(question) || CHANGE_VERB_RE.test(question)) && description !== draft.description) changes.description = description;
  // Only an explicit date changes the date. extractFields reads "now" as
  // today, which is right for a fresh sentence and wrong for "send it
  // now" against a draft dated last week.
  const explicitDate = f.dateSource === 'iso' || f.dateSource === 'uk' || /\b(as of|dated|date it|due)\b/i.test(question);
  if (explicitDate && f.date !== draft.date) changes.date = f.date;
  return changes;
}

// Returns { matched: false } when the sentence is not about the pending
// action, else { matched: true, op, ... }:
//   cancel                      decline the pending row
//   set_mode { mode }           draft_only | create_and_send
//   amend { changes, mode? }    new field values (and a mode if both)
//   show                        restate what is pending
//   confirm                     the owner wants it carried out; the caller
//                               points at the approve control (a typed
//                               sentence never executes anything)
//
// `pending.viaConversation` says whether the row was raised from the
// conversation the sentence arrived in. A complete new invoice sentence
// for the SAME customer revises the row when it is this conversation's
// own draft, and starts a new one when the row was only found by falling
// back to the owner's most recent open draft from somewhere else.
function resolve(question, pending, { today = new Date() } = {}) {
  const text = String(question || '').replace(/\s+/g, ' ').trim();
  if (!text || !pending || pending.status !== 'open') return { matched: false };
  if (pending.viaConversation === false) {
    const fresh = intent.parse(text, { today });
    if (fresh.matched && fresh.complete) return { matched: false };
  }

  if (CANCEL_RE.test(text)) return { matched: true, op: 'cancel' };

  const isInvoice = pending.kind === 'zoho_invoice_draft';
  if (isInvoice) {
    if (isFreshRequest(text, pending)) return { matched: false };
    const changes = invoiceChanges(text, pending, today);
    const hasChanges = Object.keys(changes).length > 0;
    const draftOnly = intent.DRAFT_ONLY_RE.test(text);
    if (hasChanges && (REFERS_RE.test(text) || intent.INTENT_RE.test(text) || changes.date)) {
      const op = { matched: true, op: 'amend', changes };
      if (draftOnly) op.mode = 'draft_only';
      else if (SEND_NOW_RE.test(text) || intent.SEND_VERB_RE.test(text)) op.mode = 'create_and_send';
      return op;
    }
    // "Show me first" on a row that is already draft only asks to see it,
    // not to change it.
    if (draftOnly) return pending.mode === 'draft_only' ? { matched: true, op: 'show' } : { matched: true, op: 'set_mode', mode: 'draft_only' };
    if (SEND_NOW_RE.test(text)) {
      // "send it" on a draft-only action switches the mode; on an action
      // already set to send it is a request to carry it out, which only
      // the approve control can do.
      return pending.mode === 'create_and_send'
        ? { matched: true, op: 'confirm' }
        : { matched: true, op: 'set_mode', mode: 'create_and_send' };
    }
  }

  if (SHOW_RE.test(text) && (REFERS_RE.test(text) || /\b(pending|waiting|draft|invoice|approval)\b/i.test(text))) {
    return { matched: true, op: 'show' };
  }
  return { matched: false };
}

// One sentence describing what is pending, used in every chat reply
// while an action is open and as the open-action line handed to the
// model. Built from the stored row only.
function describePending(pending) {
  if (!pending) return '';
  if (pending.kind === 'zoho_invoice_draft') {
    const modeText = pending.mode === 'create_and_send'
      ? 'create in Zoho Invoice and email to the customer'
      : 'create as a draft in Zoho Invoice only, nothing emailed';
    return `Pending: approval #${pending.id}, invoice ${intent.describe(pending.draft)}. Mode: ${modeText}. Not yet created; a named person must approve it first.`;
  }
  return `Pending: approval #${pending.id}, ${pending.title || 'an action'} (awaiting a human decision).`;
}

module.exports = { resolve, describePending, CANCEL_RE, SHOW_RE, SEND_NOW_RE };
