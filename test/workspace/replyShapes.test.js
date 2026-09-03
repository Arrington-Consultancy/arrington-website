// What the Workspace does with the shapes a model actually replies in.
//
// Measured on 03/09/2026, straight after the cut-off-reply defect, on the
// theory that if one reply-handling assumption was wrong the others were
// worth checking too. Four of these shapes failed, and the cause was one
// line: the reply object was pulled out with a greedy
// /\{[\s\S]*\}/, which takes everything from the FIRST brace in the reply
// to the LAST one, wherever those happen to be. That is not a JSON
// extractor. It works only while the model sends the object and nothing
// else, which is not a promise any model makes.
//
// Two of the four are likely on exactly the commercial questions this
// workspace exists for: an answer that mentions a brace in passing, and
// an answer with a word after the closing brace.

const { test } = require('node:test');
const assert = require('node:assert');

const orchestrator = require('../../lib/workspace/orchestrator');

const GOOD = '{"answer":"Fine.","gap":null,"escalation":null}';

// Runs one scripted reply through the real askWorkspace and reports both
// the outcome and how many model calls it cost. The call count matters:
// a reply that should have been readable first time and instead needs a
// corrective round trip is a real cost, paid on every such question.
async function ask(text, { stopReason = 'end_turn' } = {}) {
  let calls = 0;
  orchestrator.__setClientFactoryForTests(() => ({
    messages: {
      create: async () => {
        calls += 1;
        return { stop_reason: stopReason, content: text === null ? [] : [{ type: 'text', text }] };
      }
    }
  }));
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ENABLE_WORKSPACE_AI = 'true';
  try {
    const result = await orchestrator.askWorkspace({ clearanceId: 'owner', question: 'q' });
    return { result, calls };
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ENABLE_WORKSPACE_AI;
    orchestrator.__resetClientFactoryForTests();
  }
}

test('an answer that mentions a brace in passing is still read', async () => {
  // The greedy extract started at the brace in the prose and ran to the
  // end of the real object, producing a string that is not JSON.
  const { result, calls } = await ask(`Costs {such as hosting} matter. ${GOOD}`);
  assert.equal(result.ok, true, `expected an answer, got: ${JSON.stringify(result.errors)}`);
  assert.equal(result.answer, 'Fine.');
  assert.equal(calls, 1, 'this should be readable first time, not after a corrective retry');
});

test('a word after the closing brace does not lose the answer', async () => {
  const { result, calls } = await ask(`${GOOD} Hope that helps :}`);
  assert.equal(result.ok, true, `expected an answer, got: ${JSON.stringify(result.errors)}`);
  assert.equal(calls, 1);
});

test('the same object sent twice is read once rather than glued together', async () => {
  const { result, calls } = await ask(`${GOOD}\n${GOOD}`);
  assert.equal(result.ok, true, `expected an answer, got: ${JSON.stringify(result.errors)}`);
  assert.equal(calls, 1);
});

test('a markdown code fence around the object is stripped', async () => {
  const { result } = await ask('```json\n' + GOOD + '\n```');
  assert.equal(result.ok, true, `expected an answer, got: ${JSON.stringify(result.errors)}`);
});

test('braces and escaped quotes inside the answer text survive intact', async () => {
  // A regression guard on the brace matcher: it must not treat a brace
  // or a quote inside a JSON string as structure. An answer quoting
  // somebody is ordinary, not exotic.
  const quoted = JSON.stringify({ answer: 'He said "the {cost} is 40%" and left.', gap: null, escalation: null });
  const { result } = await ask(quoted);
  assert.equal(result.ok, true, `expected an answer, got: ${JSON.stringify(result.errors)}`);
  assert.equal(result.answer, 'He said "the {cost} is 40%" and left.');
});

test('an empty reply is retried plainly, not asked to correct a schema', async () => {
  // There is no reply to correct. Telling the model its JSON was wrong
  // when it sent nothing is the same mistake as the cut-off case: a
  // correction aimed at a fault that is not there.
  const { result, calls } = await ask('');
  assert.equal(result.ok, false);
  assert.ok(calls >= 2, 'an empty reply deserves another attempt');
  assert.match(result.errors.join(' '), /empty reply/i,
    `the operator should be told the model said nothing; got: ${result.errors.join(' ')}`);
  assert.doesNotMatch(result.errors.join(' '), /broke the contract/i,
    'a reply that never arrived did not break a contract');
});

test('a reply with no text block at all is treated the same as an empty one', async () => {
  const { result } = await ask(null);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /empty reply/i);
});

test('a genuinely malformed object is still reported as a contract failure', async () => {
  // The positive control. Broadening what counts as readable must not
  // quietly make everything readable.
  const { result } = await ask('{"answer": }');
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /broke the contract twice/);
});

test('prose with no object at all is still reported as a contract failure', async () => {
  const { result } = await ask('I cannot answer that.');
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /broke the contract twice/);
  assert.match(result.errors.join(' '), /no JSON object/);
});

test('an object wrapped in an array is read, like an object wrapped in a fence', async () => {
  // Written expecting a refusal, and the measurement said otherwise: the
  // extractor finds the object inside the array and reads it. Kept as
  // the real behaviour rather than forced to match the guess, because
  // this is the same leniency as stripping a code fence and costs a
  // round trip to refuse. It also showed that a null/array guard in
  // parseReply could never fire, and that dead guard has been removed.
  const { result } = await ask('[{"answer":"Fine.","gap":null,"escalation":null}]');
  assert.equal(result.ok, true, `expected the object to be found, got: ${JSON.stringify(result.errors)}`);
  assert.equal(result.answer, 'Fine.');
});

test('an object with no usable answer field is still refused', async () => {
  // The leniency above must stop at the contract itself: finding an
  // object is not the same as accepting one.
  const { result } = await ask('{"answer":"   ","gap":null}');
  assert.equal(result.ok, false, 'a blank answer is not an answer');
});
