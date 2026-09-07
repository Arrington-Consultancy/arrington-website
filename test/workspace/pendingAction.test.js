// Follow-ups to a pending action in Ask Ruth (07/09/2026).
//
// Tom's live report: after Ruth drafted invoice approval #1, "Create it
// as a draft in Zoho Invoice only. Do not email it" was read as a brand
// new invoice with every field missing, and "I want the invoice sitting
// in drafts" reached the model with no idea an approval existed, so it
// answered about Gmail drafts. This file pins the reading of those
// sentences and the ones Tom listed as ordinary follow-ups, and pins
// that the model is now told the recent turns and the pending action.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const pa = require('../../lib/workspace/finance/pendingAction');
const intent = require('../../lib/workspace/finance/invoiceIntent');
const orchestrator = require('../../lib/workspace/orchestrator');

const TODAY = new Date('2026-09-07T09:00:00Z');
function pending(over = {}) {
  return {
    id: 1, kind: 'zoho_invoice_draft', status: 'open', mode: 'create_and_send',
    title: 'Zoho invoice (create and send): ...',
    draft: { customerEmail: 'tomarrington@outlook.com', customerName: 'tomarrington', amount: 500, description: 'Mini commercial review', date: '2026-09-06' },
    ...over
  };
}
const r = (q, p = pending()) => pa.resolve(q, p, { today: TODAY });

test("Tom's failing sequence: both follow-ups are read against the pending draft, and draft means Zoho", () => {
  const five = 'I want to review the actual invoice before it is sent. Create it as a draft in Zoho Invoice only. Do not email it or send it to the customer.';
  assert.deepEqual(r(five), { matched: true, op: 'set_mode', mode: 'draft_only' });
  assert.deepEqual(r('I want the invoice sitting in drafts'), { matched: true, op: 'set_mode', mode: 'draft_only' });
  // The parser on its own still mis-reads sentence five as a new,
  // incomplete invoice, which is why the resolver must run first.
  const parsed = intent.parse(five, { today: TODAY });
  assert.equal(parsed.matched, true);
  assert.equal(parsed.complete, false);
});

test('the ordinary follow-ups Tom listed', () => {
  assert.deepEqual(r('change it to £600'), { matched: true, op: 'amend', changes: { amount: 600 } });
  assert.deepEqual(r("don't send it"), { matched: true, op: 'set_mode', mode: 'draft_only' });
  assert.deepEqual(r('cancel that'), { matched: true, op: 'cancel' });
  assert.deepEqual(r('show me first'), { matched: true, op: 'set_mode', mode: 'draft_only' });
  assert.deepEqual(r('show me first', pending({ mode: 'draft_only' })), { matched: true, op: 'show' }, 'already a draft: restate it');
  assert.deepEqual(r('leave it in drafts'), { matched: true, op: 'set_mode', mode: 'draft_only' });
  assert.deepEqual(r('send it', pending({ mode: 'draft_only' })), { matched: true, op: 'set_mode', mode: 'create_and_send' });
  // Already set to send: "send it" is a request to carry it out, which a
  // typed sentence never does.
  assert.deepEqual(r('send it'), { matched: true, op: 'confirm' });
});

test('amendments read the other fields with the same extractors, and only when the sentence changes them', () => {
  assert.deepEqual(r('make it for website build instead'), { matched: true, op: 'amend', changes: { description: 'Website build' } });
  assert.deepEqual(r('change the email to bob@example.com'), { matched: true, op: 'amend', changes: { customerEmail: 'bob@example.com', customerName: 'bob' } });
  assert.deepEqual(r('date it 2026-10-01'), { matched: true, op: 'amend', changes: { date: '2026-10-01' } });
  assert.deepEqual(r('change it to £600 and leave it in drafts'), { matched: true, op: 'amend', changes: { amount: 600 }, mode: 'draft_only' });
  assert.deepEqual(r('the amount should be £750'), { matched: true, op: 'amend', changes: { amount: 750 } });
  // A full restatement for the same customer revises the row rather than
  // raising a second one, and its verb sets the mode.
  assert.deepEqual(r('send an invoice to tomarrington@outlook.com £900 for a full review', pending({ mode: 'draft_only' })), { matched: true, op: 'amend', changes: { amount: 900, description: 'A full review' }, mode: 'create_and_send' });
  assert.deepEqual(r('raise an invoice to tomarrington@outlook.com £900 for a full review'), { matched: true, op: 'amend', changes: { amount: 900, description: 'A full review' } }, 'no explicit verb: the mode is kept');
  // ...unless the row was only found by falling back to another
  // conversation's draft, when a complete new sentence is a new invoice.
  assert.deepEqual(r('send an invoice to tomarrington@outlook.com £900 for a full review', pending({ viaConversation: false })), { matched: false });
  assert.deepEqual(r('change it to £600', pending({ viaConversation: false })), { matched: true, op: 'amend', changes: { amount: 600 } }, 'a bare follow-up still reaches the fallback row');
  // "now" is not a date change, and a question is not an amendment.
  assert.deepEqual(r('send it to them now'), { matched: true, op: 'confirm' });
  assert.deepEqual(r('what is that invoice for again?'), { matched: true, op: 'show' });
  assert.deepEqual(r('is that invoice still pending?'), { matched: true, op: 'show' });
  // Nothing is guessed: no amount, no address and no job is ever invented.
  const same = r('change it');
  assert.equal(same.matched, false);
});

test('an ordinary question, or a fresh invoice for someone else, is passed on untouched', () => {
  for (const q of ['where are we losing money?', 'what invoices are overdue?', 'show me the cashflow for last month', 'how many unread emails do I have?', 'what is the current position?']) {
    assert.deepEqual(r(q), { matched: false }, q);
  }
  assert.deepEqual(r('send an invoice to other@example.com £50 for x'), { matched: false });
  assert.deepEqual(r('cancel that', pending({ status: 'declined' })), { matched: false }, 'a decided row is not pending');
  assert.deepEqual(r('cancel that', null), { matched: false });
});

test('a pending action of another kind can be shown or cancelled, never amended', () => {
  const social = { id: 7, kind: 'social_action', status: 'open', mode: null, draft: null, title: 'publish on linkedin: hello' };
  assert.deepEqual(r('cancel that', social), { matched: true, op: 'cancel' });
  assert.deepEqual(r('what is pending?', social), { matched: true, op: 'show' });
  assert.deepEqual(r('change it to £600', social), { matched: false });
  assert.match(pa.describePending(social), /approval #7/);
});

test('describePending states the id, the fields, the mode and that nothing has been created', () => {
  const line = pa.describePending(pending());
  assert.match(line, /approval #1/);
  assert.match(line, /£500\.00 to tomarrington <tomarrington@outlook\.com> for "Mini commercial review"/);
  assert.match(line, /email to the customer/);
  assert.match(line, /Not yet created/);
  const draftLine = pa.describePending(pending({ mode: 'draft_only' }));
  assert.match(draftLine, /draft in Zoho Invoice only, nothing emailed/);
});

test('the mode of a fresh sentence: send or email means create and send, anything else is a Zoho draft', () => {
  assert.equal(intent.parse('send an invoice to a@b.co £5 for x').mode, 'create_and_send');
  assert.equal(intent.parse('email an invoice to a@b.co £5 for x').mode, 'create_and_send');
  assert.equal(intent.parse('raise an invoice to a@b.co £5 for x').mode, 'draft_only');
  assert.equal(intent.parse('create an invoice to a@b.co £5 for x').mode, 'draft_only');
  assert.equal(intent.parse('send an invoice to a@b.co £5 for x but leave it in drafts').mode, 'draft_only');
});

test('the resolver is pure and shares nothing with Scott', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'finance', 'pendingAction.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /require\((?!'\.\/invoiceIntent')/);
  assert.doesNotMatch(src, /process\.env|fetch\(/);
  assert.doesNotMatch(src, /scott/i);
});

// --- What the model is told ------------------------------------------

async function captureUserContent(args) {
  const prev = { key: process.env.ANTHROPIC_API_KEY, flag: process.env.ENABLE_WORKSPACE_AI };
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  process.env.ENABLE_WORKSPACE_AI = 'true';
  let captured = null;
  orchestrator.__setClientFactoryForTests(() => ({
    messages: {
      create: async (req) => {
        captured = req;
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ answer: 'ok', gap: null, escalation: null }) }] };
      }
    }
  }));
  try {
    const result = await orchestrator.askWorkspace(args);
    return { result, captured };
  } finally {
    if (prev.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prev.key;
    if (prev.flag === undefined) delete process.env.ENABLE_WORKSPACE_AI; else process.env.ENABLE_WORKSPACE_AI = prev.flag;
    orchestrator.__resetClientFactoryForTests();
  }
}

test('the recent turns and the pending action reach the model, bounded, and the system prompt keeps its shape', async () => {
  const history = [];
  for (let i = 0; i < 20; i += 1) history.push({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i} ` + 'x'.repeat(2000) });
  const line = pa.describePending(pending());
  const { result, captured } = await captureUserContent({ clearanceId: 'owner_admin', question: 'what was that invoice for again?', history, pendingAction: line });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const user = captured.messages[0].content;
  assert.ok(user.includes(line), 'the pending line is in the user content');
  assert.ok(user.includes('Question from the workspace owner:\nwhat was that invoice for again?'));
  // Bounded: only the last MAX_HISTORY_TURNS turns, each cut to MAX_HISTORY_CHARS.
  assert.ok(!user.includes('turn 13 '), 'older turns are dropped');
  assert.ok(user.includes('turn 19 '), 'the latest turn is kept');
  const shown = user.match(/turn \d+ x+/g);
  assert.equal(shown.length, orchestrator.MAX_HISTORY_TURNS);
  for (const s of shown) assert.ok(s.length <= orchestrator.MAX_HISTORY_CHARS, 'each turn is cut short');
  // The routing guard elsewhere relies on the system prompt being three
  // sections; the context went into the user content, not the system.
  assert.equal(captured.system.split('\n\n').length, 3);
  assert.doesNotMatch(captured.system, /approval #1/);
  // The model is told it never supplies invoice fields.
  assert.match(captured.system, /never supply or guess a customer, an amount or a description/);
});

test('with no history and no pending action the prompt is exactly what it was before', async () => {
  const { captured } = await captureUserContent({ clearanceId: 'owner_admin', question: 'What is the brand voice?' });
  const user = captured.messages[0].content;
  assert.ok(user.startsWith('Question from the workspace owner:\nWhat is the brand voice?'));
  assert.doesNotMatch(user, /Recent turns|Action awaiting/);
});

// --- The route ---------------------------------------------------------

test('the ask route resolves a pending action BEFORE the invoice parser, and the execute route reads the mode from the row', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'workspace.js'), 'utf8');
  const askIdx = routes.indexOf("router.post('/api/workspace/ask'");
  assert.ok(askIdx > 0);
  const askBody = routes.slice(askIdx, routes.indexOf('router.post(', askIdx + 10));
  const resolveIdx = askBody.indexOf('pendingAction.resolve(question, pending)');
  const parseIdx = askBody.indexOf('invoiceIntent.parse(question)');
  assert.ok(resolveIdx > 0 && parseIdx > 0);
  assert.ok(resolveIdx < parseIdx, 'the resolver runs first, or "create it as a draft" is a new invoice again');
  // The model receives history and the pending line on every model turn.
  assert.match(askBody, /askWorkspace\(\{ clearanceId, question, laneId: forcedLaneId, history, pendingAction: pendingLine \}\)/);
  // A revised row is updated in place; the ask route never creates a
  // second approval for the same draft.
  assert.equal((askBody.match(/repo\.createApproval\(/g) || []).length, 1);
  assert.match(askBody, /repo\.updateOpenApproval\(/);
  // The model never touches an approval: every write in the ask route is
  // inside the deterministic branches, which return before askWorkspace.
  const modelIdx = askBody.indexOf('await askWorkspace(');
  assert.doesNotMatch(askBody.slice(modelIdx), /createApproval|updateOpenApproval|decideApproval/);

  const execIdx = routes.indexOf("router.post('/api/workspace/finance/zoho/invoice/execute'");
  const execBody = routes.slice(execIdx, routes.indexOf('router.post(', execIdx + 10));
  assert.doesNotMatch(execBody, /send: true/, 'the execute route no longer hard-codes sending');
  assert.match(execBody, /send: mode === 'create_and_send'/);
  assert.match(execBody, /payload\.mode === 'create_and_send'/, 'the mode comes from the stored row, not the request');
  assert.doesNotMatch(execBody, /req\.body\.mode/);

  // Nothing here touches Gmail, and no autonomous send exists.
  assert.doesNotMatch(askBody, /gmailClient|sendMessage/);
  const modeIdx = routes.indexOf("router.post('/api/workspace/approvals/:id/invoice-mode'");
  const modeBody = routes.slice(modeIdx, routes.indexOf('router.post(', modeIdx + 10));
  assert.doesNotMatch(modeBody, /req\.body\.(draft|customerEmail|customerName|amount|description|date)/, 'the mode route edits the mode only');
  assert.match(modeBody, /repo\.updateOpenApproval\(/);
});
