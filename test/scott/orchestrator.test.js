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
