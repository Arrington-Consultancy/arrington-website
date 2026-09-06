// Scott's Armchair & Knitting Service: deterministic "send an invoice"
// intent for the chat.
//
// Tom's instruction (06/09/2026): the chatbot should be able to send an
// invoice. In this fictional company nothing can leave the system (no
// customer has a real address), so "send" means: draft the invoice from
// what the person typed, put it in Approvals, and let a human holding
// invoice_create issue it into the ledger. Nigel, the Finance & Accounts
// worker, does not gain any authority: this module reads the sentence,
// the approval queue holds the draft, and the ledger posts it only when
// a person says so.
//
// Deterministic on purpose. A figure that will enter the books is taken
// from the sentence, never inferred. If the customer, the job or the
// amount is missing, the parser says so and the AI turn proceeds as it
// always did (Nigel asks). Written independently of the workspace's own
// parser: the two systems share no module, by test.
//
// Pure: no I/O, no environment, no clock except the injected `today`.

const INTENT_RE = /\b(send|raise|create|issue|make)\b[^.?!]{0,40}\binvoice\b/i;
const AMOUNT_RE = /(?:£|GBP\s?)\s?(\d{1,7}(?:[.,]\d{1,2})?)|(\d{1,7}(?:[.,]\d{1,2})?)\s?(?:pounds?|quid)\b/i;
const DATE_ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;

function isoDate(d) { return d.toISOString().slice(0, 10); }

function tidy(s) {
  const t = String(s || '').replace(/\s+/g, ' ').replace(/(\s*,\s*){2,}/g, ', ').trim().replace(/[\s.,;:]+$/, '').replace(/^[\s.,;:]+/, '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

function parse(message, { today = new Date() } = {}) {
  // "£1,250" is twelve hundred and fifty, not one pound twenty-five.
  const text = String(message || '').replace(/\s+/g, ' ').replace(/(\d),(\d{3})\b/g, '$1$2').trim();
  if (!text || !INTENT_RE.test(text)) return { matched: false };

  const amountMatch = text.match(AMOUNT_RE);
  const amountStr = amountMatch ? (amountMatch[1] || amountMatch[2]) : '';
  const amount = amountStr ? Number(amountStr.replace(',', '.')) : NaN;

  // Customer: the words after "to" up to the amount, "for", a comma or
  // the end. "for me" is not a customer.
  let customer = '';
  const toMatch = text.match(/\bto\s+(.+?)(?=\s*(?:£|GBP|\bfor\b|,|\bas of\b|\bdated\b|$))/i);
  if (toMatch && toMatch[1]) {
    const c = toMatch[1].trim().replace(/["'<>()]/g, '');
    if (!/^(me|us|them|him|her|the customer|a customer)$/i.test(c)) customer = tidy(c);
  }

  let description = '';
  const forIdx = text.search(/\bfor\b/i);
  if (forIdx >= 0) {
    let tail = text.slice(forIdx + 3);
    tail = tail.split(/\b(?:as of|dated|due|on)\b/i)[0];
    tail = tail.replace(AMOUNT_RE, '').replace(/^\s*(me|us)\b/i, '');
    description = tidy(tail);
  }

  let date = isoDate(today);
  const iso = text.match(DATE_ISO_RE);
  if (iso) date = `${iso[1]}-${iso[2]}-${iso[3]}`;

  const missing = [];
  if (!customer) missing.push('the customer');
  if (!Number.isFinite(amount) || amount <= 0) missing.push('the amount before VAT');
  if (!description) missing.push('what the invoice is for');

  return {
    matched: true,
    complete: missing.length === 0,
    missing,
    draft: {
      customer,
      description,
      netPounds: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null,
      date
    }
  };
}

// The approval row stores a human summary plus one machine-readable line
// the issuing step re-parses, so what gets posted is exactly what a
// person read and approved, never something re-derived from chat text.
const MARKER = 'INVOICE-DRAFT';

function encode(draft, { sourceRef = '' } = {}) {
  const net = draft.netPounds.toFixed(2);
  const human = `Raise sales invoice to ${draft.customer} for £${net} before VAT (VAT at 20% added), "${draft.description}", dated ${draft.date}. Drafted by Nigel Preece from the chat; nothing is posted until a person issues it here.`;
  const machine = `${MARKER}|customer=${enc(draft.customer)}|net=${net}|description=${enc(draft.description)}|date=${draft.date}${sourceRef ? `|source=${enc(sourceRef)}` : ''}`;
  return `${human}\n${machine}`;
}

function enc(s) { return encodeURIComponent(String(s || '')); }

function decode(summary) {
  const line = String(summary || '').split('\n').find((l) => l.startsWith(`${MARKER}|`));
  if (!line) return null;
  const fields = Object.create(null);
  line.split('|').slice(1).forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > 0) fields[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  });
  const net = Number(fields.net);
  if (!fields.customer || !fields.description || !Number.isFinite(net) || net <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fields.date || '')) return null;
  return { customer: fields.customer, description: fields.description, netPounds: net, date: fields.date, sourceRef: fields.source || '' };
}

module.exports = { parse, encode, decode, MARKER };
