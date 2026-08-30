// The failure that reached visitors on the demonstration, 30/08/2026.
//
// Production logs for deployment b71cf69f showed repeated
// "Scott model call failed (attempt 1 of 3): Unexpected end of JSON
// input", and the visitor saw a "technical problem" card from the
// Company Brain worker, the one that writes the longest answers.
//
// The mechanism: worker replies were capped at 1024 tokens, a long reply
// was cut off mid-JSON, JSON.parse threw, that error was classified as
// "not transient", and the single corrective retry re-sent the same
// prompt with the SAME ceiling, so it truncated identically. Two forced
// failures, then the card.
//
// These tests pin the fix at the level that matters: a truncated or
// empty reply must be retried with MORE room, and the visitor must get a
// real answer rather than an apology.
const test = require('node:test');
const assert = require('node:assert/strict');

const orchestrator = require('../../lib/scott/orchestrator');

function fakeClient(script) {
  const calls = [];
  return {
    calls,
    client: {
      messages: {
        create: async (args) => {
          calls.push({ max_tokens: args.max_tokens, content: String(args.messages[0].content) });
          const step = script[Math.min(calls.length - 1, script.length - 1)];
          return step(args);
        }
      }
    }
  };
}

const goodReply = () => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify({ reply: 'Two chairs are waiting on yarn.', certainty: 'CERTAIN', writeback: null, escalation: null, gap: null }) }]
});
// What the API actually returns when the answer hits the ceiling: the
// text is real but stops mid-object, so JSON.parse cannot finish it.
const truncatedReply = () => ({
  stop_reason: 'max_tokens',
  content: [{ type: 'text', text: '{"reply": "Two chairs are waiting on yarn and the third' }]
});
const emptyReply = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] });

test.afterEach(() => orchestrator.__resetClientFactoryForTests());

test('a truncated reply is retried with a HIGHER ceiling, not the same one', async () => {
  const f = fakeClient([truncatedReply, goodReply]);
  orchestrator.__setClientFactoryForTests(() => f.client);
  const res = await orchestrator.callWorker('company_brain', {
    userMessage: 'What is outstanding?', history: [], persona: 'scott_mercer'
  });
  assert.equal(res.technicalFailure, false, 'the visitor must get an answer, not a technical problem card');
  assert.equal(f.calls.length, 2, 'exactly one retry was needed');
  assert.ok(f.calls[1].max_tokens > f.calls[0].max_tokens,
    `the retry must raise the ceiling (was ${f.calls[0].max_tokens}, retried at ${f.calls[1].max_tokens})`);
  assert.match(f.calls[1].content, /short and complete/, 'the retry also asks for a brief, complete reply');
});

test('the first attempt already has room for a long worker answer', async () => {
  const f = fakeClient([goodReply]);
  orchestrator.__setClientFactoryForTests(() => f.client);
  await orchestrator.callWorker('company_brain', { userMessage: 'x', history: [], persona: 'scott_mercer' });
  assert.ok(f.calls[0].max_tokens >= 2048,
    `1024 was the ceiling that caused the incident; got ${f.calls[0].max_tokens}`);
});

test('an empty reply is retried plainly rather than sent back for schema correction', async () => {
  const f = fakeClient([emptyReply, goodReply]);
  orchestrator.__setClientFactoryForTests(() => f.client);
  const res = await orchestrator.callWorker('company_brain', { userMessage: 'x', history: [], persona: 'scott_mercer' });
  assert.equal(res.technicalFailure, false);
  assert.doesNotMatch(f.calls[1].content, /did not match the required schema/,
    'there is no malformed reply to correct when nothing came back');
});

test('the ceiling is bounded, so a runaway reply cannot spend without limit', async () => {
  const f = fakeClient([truncatedReply]);
  orchestrator.__setClientFactoryForTests(() => f.client);
  const res = await orchestrator.callWorker('company_brain', { userMessage: 'x', history: [], persona: 'scott_mercer' });
  assert.equal(res.technicalFailure, true, 'three genuine failures still fail honestly');
  f.calls.forEach((c) => assert.ok(c.max_tokens <= 4096, `ceiling escaped its bound: ${c.max_tokens}`));
});

test('persistent truncation still tells the truth rather than inventing an answer', async () => {
  const f = fakeClient([truncatedReply]);
  orchestrator.__setClientFactoryForTests(() => f.client);
  const res = await orchestrator.callWorker('company_brain', { userMessage: 'x', history: [], persona: 'scott_mercer' });
  assert.equal(res.technicalFailure, true);
  assert.match(res.reply, /technical problem/i);
});
