// Scott AI Demonstration — orchestrator schema/prompt tests. Pure and
// deterministic (no Anthropic call, no database), so these always run as
// part of `npm test`. Covers the schema validators that gate every model
// reply before it is trusted or stored, and confirms the prompt builders
// keep each worker's own scope/personality distinct rather than merging
// into one shared block.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateWorkerReply,
  validateReceptionistReply,
  extractJson,
  buildWorkerSystemPrompt,
  buildReceptionistSystemPrompt,
  isScottAIEnabled
} = require('../../lib/scott/orchestrator');
const { WORKERS, ROUTABLE_WORKER_IDS } = require('../../lib/scott/workers');

describe('validateWorkerReply', () => {
  test('accepts a minimal valid reply', () => {
    const check = validateWorkerReply({ reply: 'Hello.', certainty: null, writeback: null, escalation: null, refused: false });
    assert.equal(check.valid, true);
  });

  test('rejects a missing reply', () => {
    const check = validateWorkerReply({ certainty: null });
    assert.equal(check.valid, false);
    assert.ok(check.errors.some((e) => e.includes('reply')));
  });

  test('rejects an invalid certainty value', () => {
    const check = validateWorkerReply({ reply: 'x', certainty: 'MAYBE' });
    assert.equal(check.valid, false);
  });

  test('requires writeback.record and writeback.summary when writeback is present', () => {
    const check = validateWorkerReply({ reply: 'x', writeback: { record: '' } });
    assert.equal(check.valid, false);
    assert.ok(check.errors.some((e) => e.includes('writeback')));
  });

  test('accepts a full writeback and escalation', () => {
    const check = validateWorkerReply({
      reply: 'x',
      certainty: 'CERTAIN',
      writeback: { record: 'job_note', summary: 'Noted the delay.' },
      escalation: { to: 'scott_mercer', reason: 'Above the 10% discount ceiling.' },
      refused: false
    });
    assert.equal(check.valid, true);
  });

  test('rejects an escalation.to outside the two allowed values', () => {
    const check = validateWorkerReply({ reply: 'x', escalation: { to: 'someone_else', reason: 'y' } });
    assert.equal(check.valid, false);
  });

  test('rejects a non-object root (e.g. the model returning a bare string)', () => {
    const check = validateWorkerReply('not an object');
    assert.equal(check.valid, false);
  });
});

describe('validateReceptionistReply', () => {
  test('accepts an empty route with just a note', () => {
    const check = validateReceptionistReply({ note: 'Hello!', route: [], refused: false });
    assert.equal(check.valid, true);
  });

  test('accepts a valid multi-worker route in dependency order', () => {
    const check = validateReceptionistReply({
      note: 'Checking with Operations then Commercial.',
      route: [
        { worker: 'operations', reason: 'Need feasibility first.' },
        { worker: 'commercial', reason: 'Then confirm price.' }
      ],
      refused: false
    });
    assert.equal(check.valid, true);
  });

  test('rejects a route entry naming an unroutable worker id', () => {
    const check = validateReceptionistReply({ note: 'x', route: [{ worker: 'receptionist', reason: 'y' }] });
    assert.equal(check.valid, false);
  });

  test('rejects a route entry with no reason', () => {
    const check = validateReceptionistReply({ note: 'x', route: [{ worker: 'commercial' }] });
    assert.equal(check.valid, false);
  });

  test('rejects a missing note', () => {
    const check = validateReceptionistReply({ route: [] });
    assert.equal(check.valid, false);
  });
});

describe('extractJson', () => {
  test('parses a bare JSON object', () => {
    assert.deepEqual(extractJson('{"a": 1}'), { a: 1 });
  });

  test('strips a markdown code fence', () => {
    assert.deepEqual(extractJson('```json\n{"a": 1}\n```'), { a: 1 });
  });

  test('strips surrounding whitespace', () => {
    assert.deepEqual(extractJson('   {"a": 1}   '), { a: 1 });
  });

  test('throws on genuinely invalid JSON rather than silently returning something', () => {
    assert.throws(() => extractJson('not json at all'));
  });
});

describe('isScottAIEnabled', () => {
  test('false when neither env var is set', () => {
    const prevKey = process.env.ANTHROPIC_API_KEY;
    const prevFlag = process.env.ENABLE_SCOTT_AI;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ENABLE_SCOTT_AI;
    assert.equal(isScottAIEnabled(), false);
    if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    if (prevFlag !== undefined) process.env.ENABLE_SCOTT_AI = prevFlag;
  });

  test('false when only the API key is set (own flag required, not shared with ENABLE_LIVE_AI)', () => {
    const prevKey = process.env.ANTHROPIC_API_KEY;
    const prevFlag = process.env.ENABLE_SCOTT_AI;
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    delete process.env.ENABLE_SCOTT_AI;
    assert.equal(isScottAIEnabled(), false);
    if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey; else delete process.env.ANTHROPIC_API_KEY;
    if (prevFlag !== undefined) process.env.ENABLE_SCOTT_AI = prevFlag;
  });

  test('true only when both are set', () => {
    const prevKey = process.env.ANTHROPIC_API_KEY;
    const prevFlag = process.env.ENABLE_SCOTT_AI;
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.ENABLE_SCOTT_AI = 'true';
    assert.equal(isScottAIEnabled(), true);
    if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey; else delete process.env.ANTHROPIC_API_KEY;
    if (prevFlag !== undefined) process.env.ENABLE_SCOTT_AI = prevFlag; else delete process.env.ENABLE_SCOTT_AI;
  });
});

describe('prompt isolation', () => {
  test('each worker system prompt names only that worker\'s own canonical identity, not another worker\'s', () => {
    for (const id of Object.keys(WORKERS)) {
      const prompt = buildWorkerSystemPrompt(WORKERS[id]);
      assert.ok(prompt.includes(WORKERS[id].canonicalName), `${id} prompt should include its own canonical name`);
      for (const otherId of Object.keys(WORKERS)) {
        if (otherId === id) continue;
        assert.ok(
          !prompt.includes(WORKERS[otherId].personality),
          `${id}'s prompt must not include ${otherId}'s personality text`
        );
      }
    }
  });

  test('the receptionist prompt lists every routable worker but includes no worker\'s personality text', () => {
    const prompt = buildReceptionistSystemPrompt();
    for (const id of ROUTABLE_WORKER_IDS) {
      assert.ok(prompt.includes(`"${id}"`), `receptionist prompt should list "${id}" as a routing target`);
      assert.ok(!prompt.includes(WORKERS[id].personality), `receptionist prompt must not include ${id}'s personality text`);
    }
  });

  test('every worker prompt requires the fixed JSON output shape', () => {
    for (const id of Object.keys(WORKERS)) {
      const prompt = buildWorkerSystemPrompt(WORKERS[id]);
      assert.ok(prompt.includes('"reply"'));
      assert.ok(prompt.includes('"writeback"'));
      assert.ok(prompt.includes('"escalation"'));
    }
  });
});

// ------------------------------------------------------------
// Evidence gaps in the worker contract
// ------------------------------------------------------------
// A gap and an approval escalation are different fields on purpose. If
// the schema accepted a loose gap object, a worker could file a blocking
// evidence problem as a shapeless note and the routing engine would have
// nothing to act on.
test('worker reply schema: evidence gaps', async (t) => {
  const { validateWorkerReply } = require('../../lib/scott/orchestrator');
  const base = { reply: 'ok', certainty: 'UNPROVEN', writeback: null, escalation: null, refused: false };
  const goodGap = {
    type: 'conflicting',
    missing: 'the stock feed and the purchase order disagree',
    whyItMatters: 'a customer is waiting on a date',
    domain: 'yarn_stock',
    workCanContinue: false
  };

  await t.test('a well-formed gap is accepted, and null is accepted', () => {
    assert.equal(validateWorkerReply({ ...base, gap: goodGap }).valid, true);
    assert.equal(validateWorkerReply({ ...base, gap: null }).valid, true);
    assert.equal(validateWorkerReply(base).valid, true, 'omitting it entirely is still valid');
  });

  await t.test('a gap must name a type the register can act on', () => {
    const r = validateWorkerReply({ ...base, gap: { ...goodGap, type: 'unclear' } });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /gap\.type/.test(e)));
  });

  await t.test('a gap must say what is missing AND why it matters', () => {
    // Either one alone is unactionable: "something is wrong somewhere" or
    // "this is important" with no subject.
    assert.equal(validateWorkerReply({ ...base, gap: { ...goodGap, missing: '' } }).valid, false);
    assert.equal(validateWorkerReply({ ...base, gap: { ...goodGap, whyItMatters: '' } }).valid, false);
  });

  await t.test('a gap must name the record area, because that is what decides who is told', () => {
    const r = validateWorkerReply({ ...base, gap: { ...goodGap, domain: '' } });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /gap\.domain/.test(e)));
  });

  await t.test('workCanContinue must be stated, not left to be inferred', () => {
    const r = validateWorkerReply({ ...base, gap: { ...goodGap, workCanContinue: undefined } });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /workCanContinue/.test(e)));
  });

  await t.test('the governance preamble tells workers the two are different things', () => {
    const { GOVERNANCE_PREAMBLE } = require('../../lib/scott/governance');
    assert.match(GOVERNANCE_PREAMBLE, /NEEDS HUMAN INPUT/);
    assert.match(GOVERNANCE_PREAMBLE, /Never fill a gap by inference/);
    // The specific dishonesty being designed out: a worker announcing a
    // notification it has no way of knowing happened.
    assert.match(GOVERNANCE_PREAMBLE, /never say that anyone has been contacted/);
    assert.match(GOVERNANCE_PREAMBLE, /always a human/);
  });
});

describe('transient API failure handling', () => {
  const { isTransientApiError, callWorker, __setClientFactoryForTests, __resetClientFactoryForTests } = require('../../lib/scott/orchestrator');

  test('classifies rate limits, overloads and network drops as transient; parse failures as not', () => {
    assert.equal(isTransientApiError({ status: 429, message: 'rate limited' }), true);
    assert.equal(isTransientApiError({ status: 529, message: 'overloaded_error' }), true);
    assert.equal(isTransientApiError({ message: 'fetch failed' }), true);
    assert.equal(isTransientApiError({ message: 'Connection error: ETIMEDOUT' }), true);
    assert.equal(isTransientApiError({ message: 'Unexpected token < in JSON at position 0' }), false);
    assert.equal(isTransientApiError({ status: 400, message: 'invalid_request_error' }), false);
  });

  test('one transient blip does not become a customer-visible failure', async () => {
    // First call dies like a rate limit; the retry succeeds with a valid
    // reply. The visitor must see the answer, not the technical bubble.
    let calls = 0;
    __setClientFactoryForTests(() => ({
      messages: {
        create: async () => {
          calls += 1;
          if (calls === 1) {
            const err = new Error('overloaded_error');
            err.status = 529;
            throw err;
          }
          return { content: [{ type: 'text', text: JSON.stringify({ reply: 'All fine here.', certainty: 'CERTAIN', writeback: null, escalation: null, gap: null, refused: false }) }] };
        }
      }
    }));
    try {
      const result = await callWorker('operations', { userMessage: 'How is the schedule?', history: [], personaId: 'scott_mercer' });
      assert.equal(result.technicalFailure, false, 'a single transient blip must be absorbed');
      assert.equal(result.reply, 'All fine here.');
      assert.equal(calls, 2, 'exactly one retry');
    } finally {
      __resetClientFactoryForTests();
    }
  });
});
