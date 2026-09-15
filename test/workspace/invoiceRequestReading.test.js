// Reading a real invoice request typed into Ask Ruth (15/09/2026).
//
// Tom typed an invoice request naming Tim Hunt at World Student Advisors
// and £533, with no email address in it. Nothing was raised: the sentence
// used "invoice" as a verb with no "to" or "for" beside it, so the
// deterministic parser did not match, and it fell through to the model,
// which offered to "have the invoice prepared for your approval" and then
// described an invoicing queue acting on his instruction. Neither had
// happened. No draft, no approval card, and two replies that claimed
// otherwise.
//
// The defect was never in the model. The parser is the only thing that
// raises a draft, so a request it does not read is a request nothing
// acts on. These cases pin the reading, and the two prompt cases pin the
// promise the model must stop making.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const intent = require('../../lib/workspace/finance/invoiceIntent');
const pa = require('../../lib/workspace/finance/pendingAction');

const TODAY = new Date('2026-09-15T09:00:00Z');
const parse = (s) => intent.parse(s, { today: TODAY });

test('the sentence Tom typed raises a draft, incomplete, keeping the customer he named', () => {
  const r = parse('invoice Tim Hunt at World Student Advisors £533');
  assert.equal(r.matched, true, 'this is the sentence that reached the model instead');
  assert.equal(r.complete, false);
  assert.equal(r.draft.customerName, 'Tim Hunt at World Student Advisors');
  assert.equal(r.draft.customerEmail, '');
  assert.equal(r.draft.amount, 533);
  // Draft only, never create-and-send: he did not say send, and creating
  // a Zoho draft is reversible where emailing a real client is not.
  assert.equal(r.mode, 'draft_only');
  assert.ok(r.missing.some((m) => /email/.test(m)), JSON.stringify(r.missing));
  assert.ok(r.missing.some((m) => /what it is for/.test(m)), JSON.stringify(r.missing));
});

test('the other ways an owner names the same request', () => {
  for (const s of [
    'invoice WSA £533',
    'please invoice Tim Hunt £533 for the website work',
    'can you invoice World Student Advisors £533?',
    'bill Tim Hunt £533 for the retainer',
    'charge World Student Advisors £533 for the September retainer',
    'raise an invoice for Tim Hunt at World Student Advisors for £533'
  ]) {
    const r = parse(s);
    assert.equal(r.matched, true, s);
    assert.equal(r.draft.amount, 533, s);
    assert.ok(r.draft.customerName, `a customer was read from: ${s}`);
  }
});

test('asking about invoices never raises one, and a request with a question mark still does', () => {
  for (const q of [
    'how much did we invoice Orca, £533?',
    'did we invoice them £533?',
    'what invoices are overdue?',
    'which customers owe us more than £500?',
    'is the £533 invoice still outstanding?',
    'where are we losing money?'
  ]) {
    assert.equal(parse(q).matched, false, q);
  }
  // A sentence opening with a request word is an instruction however it
  // ends. Losing these to the question guard would be the same defect
  // again, one class along.
  for (const q of [
    'can you invoice Tim Hunt £533?',
    'could you raise an invoice for £533 to a@b.co for a review?',
    'please invoice WSA £533 for the retainer'
  ]) {
    assert.equal(parse(q).matched, true, q);
  }
});

test('the customer is never used as the job description', () => {
  // "for Tim Hunt ... for £533" names the customer after the first "for"
  // and the amount after the second, which used to leave the customer,
  // with a preposition hanging off it, as the thing being invoiced for.
  const r = parse('raise an invoice for Tim Hunt at World Student Advisors for £533');
  assert.equal(r.draft.description, '', JSON.stringify(r.draft));
  assert.ok(r.missing.some((m) => /what it is for/.test(m)));
  assert.doesNotMatch(intent.describe(r.draft), /for "[^"]*\bfor"/);
});

test('nothing in the draft is invented: every field came from the typed words', () => {
  const typed = 'invoice Tim Hunt at World Student Advisors £533 for the September retainer';
  const r = parse(typed);
  const lower = typed.toLowerCase();
  assert.ok(lower.includes(r.draft.customerName.toLowerCase()), r.draft.customerName);
  assert.ok(lower.includes(r.draft.description.toLowerCase()), r.draft.description);
  assert.ok(lower.includes(String(r.draft.amount)), String(r.draft.amount));
});

test('the address typed on its own completes the draft and keeps the customer Tom named', () => {
  const draft = parse('invoice Tim Hunt at World Student Advisors £533 for the September retainer').draft;
  const pending = { id: 7, kind: 'zoho_invoice_draft', status: 'open', mode: 'draft_only', draft, incomplete: true, viaConversation: true };
  const follow = pa.resolve('tim.hunt@worldstudentadvisors.com', pending, { today: TODAY });
  assert.equal(follow.matched, true);
  assert.equal(follow.op, 'amend');
  assert.equal(follow.changes.customerEmail, 'tim.hunt@worldstudentadvisors.com');
  // The local part of the address must not overwrite the customer the
  // owner typed. "tim.hunt" is what the parser falls back to when a bare
  // address arrives, and it is worse than what is already on the row.
  assert.equal(follow.changes.customerName, undefined, JSON.stringify(follow.changes));
  const completed = { ...draft, ...follow.changes };
  assert.equal(completed.customerName, 'Tim Hunt at World Student Advisors');
  assert.deepEqual(intent.missingFor(completed), []);
});

test('swapping one address for another does take the new name across', () => {
  // The guard above must not reach this: a different address is a
  // different customer, and the old name following it would put the
  // wrong person on a real invoice.
  const pending = {
    id: 8,
    kind: 'zoho_invoice_draft',
    status: 'open',
    mode: 'draft_only',
    viaConversation: true,
    draft: { customerEmail: 'tomarrington@outlook.com', customerName: 'Tim Hunt at World Student Advisors', amount: 533, description: 'Retainer', date: '2026-09-15' }
  };
  const follow = pa.resolve('change the email to bob@example.com', pending, { today: TODAY });
  assert.deepEqual(follow, { matched: true, op: 'amend', changes: { customerEmail: 'bob@example.com', customerName: 'bob' } });
});

test('the model is told never to offer what only the workspace can do, and the stale rule still stands', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'orchestrator.js'), 'utf8');
  const rules = src.slice(src.indexOf('const GOVERNANCE_RULES'), src.indexOf('// --- Model client'));
  // What it said: "I can then have the invoice prepared for your
  // approval", and "that action sits with the invoicing queue based on
  // your instruction".
  assert.match(rules, /Never offer to prepare, raise, arrange or queue anything/);
  assert.match(rules, /never describe another part of the system acting on the owner's instruction/);
  assert.match(rules, /Nothing is waiting unless the line above says so/);
  // Say it once, and do not re-raise what the owner has overruled.
  assert.match(rules, /Say a caveat ONCE/);
  assert.match(rules, /Do not narrate your own limits/);
  // Asserted in the SAME test as the rules above, because the easiest way
  // to satisfy "stop hedging" is to stop being honest, and this pair is
  // where that would happen.
  assert.match(rules, /Records marked stale, unverified or sync_failed must be described that way, never presented as current fact/);
  assert.match(rules, /You perform no actions\. Never claim anything has been sent/);
  assert.match(rules, /narrows when a caveat is repeated and never whether it is given/);
});

test('the reading stays pure and shares nothing with Scott', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'finance', 'invoiceIntent.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /require\(/);
  assert.doesNotMatch(src, /process\.env|fetch\(/);
  assert.doesNotMatch(src, /scott/i);
});
