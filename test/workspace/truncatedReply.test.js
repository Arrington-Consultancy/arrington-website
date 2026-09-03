// The Workspace orchestrator was adapted from the Scott demonstration's
// orchestrator SHAPE, and this is one thing it did not inherit: Scott
// learned on 01/09/2026 that a reply cut off at the token ceiling is not
// a badly written reply, and retrying it as though it were is useless.
// The Workspace kept the naive version until 03/09/2026, when Tom asked
// Ruth a broad question on production and got "Model reply broke the
// contract twice: no JSON object in reply".
//
// The logic here is written independently rather than imported from
// lib/scott/, because the firewall between the two systems is asserted
// by test, and a shared module would be a real edge between them. Only
// the lesson is reused.

const { test } = require('node:test');
const assert = require('node:assert');

const orchestrator = require('../../lib/workspace/orchestrator');

const GOOD = '{"answer":"Three places, briefly.","gap":null,"escalation":null}';
// An answer that stops mid-string: an opening brace, no closing one.
const CUT_OFF = '{"answer": "There are three places the business is leaving money';

function block(text, stopReason) {
  return { stop_reason: stopReason, content: [{ type: 'text', text }] };
}

// Drives askWorkspace against a scripted model, recording the token
// ceiling each call asked for. The ceilings are the point: the defect was
// not that the reply failed, it was that the retry asked for exactly the
// same room and so failed identically.
async function ask(replies, question = 'where can we make some money and where are the gaps?') {
  const ceilings = [];
  let i = 0;
  orchestrator.__setClientFactoryForTests(() => ({
    messages: {
      create: async (args) => {
        ceilings.push(args.max_tokens);
        const r = replies[Math.min(i, replies.length - 1)];
        i += 1;
        return r;
      }
    }
  }));
  const prevKey = process.env.ANTHROPIC_API_KEY;
  const prevFlag = process.env.ENABLE_WORKSPACE_AI;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ENABLE_WORKSPACE_AI = 'true';
  try {
    const result = await orchestrator.askWorkspace({ clearanceId: 'owner', question });
    return { result, ceilings };
  } finally {
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevKey;
    if (prevFlag === undefined) delete process.env.ENABLE_WORKSPACE_AI; else process.env.ENABLE_WORKSPACE_AI = prevFlag;
    orchestrator.__resetClientFactoryForTests();
  }
}

test('a reply cut off at the ceiling is retried with more room, not asked to fix its schema', async () => {
  const { result, ceilings } = await ask([block(CUT_OFF, 'max_tokens'), block(GOOD, 'end_turn')]);
  assert.equal(result.ok, true, `expected an answer, got: ${JSON.stringify(result.errors)}`);
  assert.equal(result.answer, 'Three places, briefly.');
  assert.ok(ceilings.length >= 2, 'the model should have been called again');
  assert.ok(ceilings[1] > ceilings[0],
    `the retry must ask for more room than the attempt that ran out; got ${JSON.stringify(ceilings)}`);
});

test('the retry is told to be brief as well as given more room', async () => {
  let secondPrompt = null;
  let i = 0;
  orchestrator.__setClientFactoryForTests(() => ({
    messages: {
      create: async (args) => {
        i += 1;
        if (i === 2) secondPrompt = args.messages[0].content;
        return i === 1 ? block(CUT_OFF, 'max_tokens') : block(GOOD, 'end_turn');
      }
    }
  }));
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ENABLE_WORKSPACE_AI = 'true';
  try {
    await orchestrator.askWorkspace({ clearanceId: 'owner', question: 'where are the gaps?' });
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ENABLE_WORKSPACE_AI;
    orchestrator.__resetClientFactoryForTests();
  }
  assert.ok(secondPrompt, 'there should have been a second call');
  assert.match(secondPrompt, /short and complete/i,
    'more room without a brevity instruction just invites a longer answer');
});

test('a cut-off reply the model did not mark is still recognised, by its shape', async () => {
  // stop_reason says the model finished. The text says otherwise: one
  // opening brace, no closing one. Scott found this exact case live.
  const { result, ceilings } = await ask([block(CUT_OFF, 'end_turn'), block(GOOD, 'end_turn')]);
  assert.equal(result.ok, true, `expected an answer, got: ${JSON.stringify(result.errors)}`);
  assert.ok(ceilings[1] > ceilings[0],
    `an unmarked cut-off must also earn more room; got ${JSON.stringify(ceilings)}`);
});

test('a reply that will not fit at any ceiling fails naming the real cause', async () => {
  const { result, ceilings } = await ask([block(CUT_OFF, 'max_tokens')]);
  assert.equal(result.ok, false);
  const message = result.errors.join(' ');
  assert.match(message, /cut off/i,
    `the operator must be told the reply did not fit, not that the model broke a contract; got: ${message}`);
  assert.ok(ceilings.length >= 2 && ceilings[ceilings.length - 1] > ceilings[0],
    'it should have tried a larger ceiling before giving up');
});

test('the ceiling is bounded, so a runaway answer cannot spend without limit', async () => {
  const { ceilings } = await ask([block(CUT_OFF, 'max_tokens')]);
  for (const c of ceilings) {
    assert.ok(c <= 4096, `a single question asked for ${c} tokens, above the declared ceiling`);
  }
  // And it genuinely rises rather than sitting at the start value, which
  // is the defect this file exists for.
  assert.ok(new Set(ceilings).size > 1, 'every attempt used the same ceiling');
});

test('a genuine schema failure is still corrected the old way, not handed more room', async () => {
  // Prose, properly finished. Nothing is unterminated, so this is a real
  // contract failure and the corrective retry is the right response. The
  // truncation path must not swallow it.
  const prose = block('I am sorry, I cannot answer that.', 'end_turn');
  const { result, ceilings } = await ask([prose]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /broke the contract twice/,
    'a genuinely malformed reply should still report a contract failure');
  assert.equal(new Set(ceilings).size, 1,
    'a well-formed but wrong reply does not need more room, and should not be given any');
});

test('an answer that arrives correctly first time costs exactly one call', async () => {
  const { result, ceilings } = await ask([block(GOOD, 'end_turn')]);
  assert.equal(result.ok, true);
  assert.equal(ceilings.length, 1, 'the happy path must not have gained a retry');
  assert.equal(ceilings[0], 1500, 'the starting budget should be unchanged');
});
