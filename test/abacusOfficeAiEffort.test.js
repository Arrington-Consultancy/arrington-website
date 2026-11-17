'use strict';

// The office AI thinks at high effort with room to do it (Tom, 17 November
// 2026), and the AI check reads every made-up email without touching the
// database. Runs with a stand-in client, so nothing is spent.

const test = require('node:test');
const assert = require('node:assert');
const ai = require('../abacus-office/lib/ai');
const { runAiCheck, effortsFrom } = require('../abacus-office/lib/aiCheck');
const { seedInbox, todayLondon } = require('../abacus-office/lib/demoInbox');

function stubClient(sent, answer) {
  return () => ({ messages: { create: async (body) => { sent.push(body); return answer(body); } } });
}
const ok = (text) => ({ stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 20 }, content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }] });
const reading = JSON.stringify({ intent: 'new_booking', customer_name: 'A', phone: '', reference: '', journey: { date: '', time: '', pickup: '', destination: '', passengers: '', flight: '' }, missing: [], seriousness: 'none', summary: 'A booking.', reply: 'Hi,\n\nThanks.\n\nThanks,\nCornwall Taxis' });

test('every call asks for high effort and up to 16,000 tokens', async () => {
  const sent = [];
  ai.__setClientFactoryForTests(stubClient(sent, () => ok(reading)));
  const prev = process.env.ABACUS_OFFICE_AI_EFFORT;
  delete process.env.ABACUS_OFFICE_AI_EFFORT;
  try {
    await ai.readEmail(seedInbox(todayLondon())[0], todayLondon());
    assert.strictEqual(sent[0].output_config.effort, 'high');
    assert.strictEqual(sent[0].max_tokens, 16000);
    assert.ok(!('thinking' in sent[0]), 'thinking is left to the model, which always thinks on this model');
  } finally {
    if (prev === undefined) delete process.env.ABACUS_OFFICE_AI_EFFORT; else process.env.ABACUS_OFFICE_AI_EFFORT = prev;
  }
});

test('ABACUS_OFFICE_AI_EFFORT changes the effort, and nonsense means high', () => {
  assert.strictEqual(ai.effort({ ABACUS_OFFICE_AI_EFFORT: 'medium' }), 'medium');
  assert.strictEqual(ai.effort({ ABACUS_OFFICE_AI_EFFORT: ' LOW ' }), 'low');
  assert.strictEqual(ai.effort({ ABACUS_OFFICE_AI_EFFORT: 'turbo' }), 'high');
  assert.strictEqual(ai.effort({}), 'high');
  assert.match(ai.describeAiStatus({ ENABLE_ABACUS_OFFICE_AI: 'true', ANTHROPIC_API_KEY: 'k' }), /effort high, up to 16000 tokens/);
});

test('a cut-off reply is still refused, so it falls back rather than half a draft going out', async () => {
  ai.__setClientFactoryForTests(stubClient([], () => ({ stop_reason: 'max_tokens', usage: {}, content: [{ type: 'text', text: '{"intent":' }] })));
  await assert.rejects(() => ai.readEmail(seedInbox(todayLondon())[0], todayLondon()), (e) => e.code === 'TRUNCATED' && /16000/.test(e.message));
});

test('the AI check reads every made-up email at each effort and reports tokens and drafts', async () => {
  const sent = [];
  ai.__setClientFactoryForTests(stubClient(sent, () => ok(reading)));
  const lines = [];
  const env = { ENABLE_ABACUS_OFFICE_AI: 'true', ANTHROPIC_API_KEY: 'k' };
  await runAiCheck({ label: 't', efforts: ['low', 'high'], log: (l) => lines.push(l), env });
  const n = seedInbox(todayLondon()).length;
  assert.strictEqual(sent.length, n * 2);
  assert.deepStrictEqual([...new Set(sent.map((b) => b.output_config.effort))], ['low', 'high']);
  assert.ok(lines.some((l) => /TOTAL \[high\]: .* 0 failed/.test(l)));
  assert.ok(lines.some((l) => /\| Hi,/.test(l)), 'the draft is printed');
  assert.ok(!('ABACUS_OFFICE_AI_EFFORT' in process.env), 'the effort is put back afterwards');
});

test('the AI check does nothing with the AI off, and the effort list is cleaned', async () => {
  const lines = [];
  await runAiCheck({ label: 't', efforts: ['high'], log: (l) => lines.push(l), env: {} });
  assert.match(lines.join('\n'), /the AI is off/);
  assert.deepStrictEqual(effortsFrom('high, bogus,HIGH'), ['high']);
  assert.deepStrictEqual(effortsFrom(''), ['low', 'high']);
});
