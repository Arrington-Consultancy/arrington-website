// Evolving fictional business memory through the real orchestrator
// plumbing, using a fake Anthropic client (see orchestrator.integration.
// test.js for why this proves the PLUMBING, not what the real model will
// actually do — that needs the separately-gated paid live-AI suite).
//
// Covers, from the doc's required test list: specialist isolation is
// preserved through Ruth routing (a worker cannot establish a fact in a
// domain it does not itself hold, even if it tries to), and gives a
// second, end-to-end proof (on top of factLedger.test.js's direct calls)
// that a worker's memoryFact proposal is actually persisted and reused.
const { test, describe, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const orchestrator = require('../../../lib/scott/orchestrator');
const { callWorker, __setClientFactoryForTests, __resetClientFactoryForTests } = orchestrator;

const DB_AVAILABLE = !!process.env.DATABASE_URL;

function makeFakeClient(script) {
  const calls = [];
  let i = 0;
  return {
    calls,
    client: {
      messages: {
        create: async ({ system, messages }) => {
          const userContent = messages[0].content;
          calls.push({ system, userContent });
          const fn = script[i++];
          if (!fn) throw new Error('fake client script ran out of scripted replies');
          const data = fn(system, userContent, calls.length);
          return { content: [{ type: 'text', text: JSON.stringify(data) }], stop_reason: 'end_turn' };
        }
      }
    }
  };
}

describe('evolving fictional memory through callWorker (fake client)', { skip: DB_AVAILABLE ? false : 'set DATABASE_URL to run' }, () => {
  const db = require('../../../db/pool');
  const created = [];

  afterEach(() => __resetClientFactoryForTests());
  after(async () => {
    if (created.length) await db.query('DELETE FROM scott_memory_facts WHERE id = ANY($1::int[])', [created]);
  });

  function unique(label) {
    return `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  test('a worker\'s memoryFact proposal is persisted and the reply is marked established', async () => {
    const question = unique('what is our usual supplier for chair castors');
    const fake = makeFakeClient([
      () => ({
        reply: 'Our usual castor supplier is Newton Abbot Fixings.',
        certainty: 'CERTAIN', writeback: null, escalation: null, gap: null,
        memoryFact: { domain: 'suppliers_ops', canonicalQuestion: question, answer: 'Newton Abbot Fixings, our usual castor supplier.' },
        refused: false
      })
    ]);
    __setClientFactoryForTests(() => fake.client);

    const result = await callWorker('operations', { userMessage: question, history: [], priorWorkerNotes: [], routeReason: 'supplier question', entities: {}, personaId: 'tony_marsh' });
    assert.equal(result.memoryFact.established, true);
    assert.equal(result.memoryFact.wasNewlyCreated, true);
    created.push(result.memoryFact.factId);

    const stored = await db.query('SELECT * FROM scott_memory_facts WHERE id = $1', [result.memoryFact.factId]);
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].domain, 'suppliers_ops');
  });

  test('specialist isolation through Ruth routing: a worker cannot establish a fact in a domain it does not itself hold', async () => {
    const question = unique('what is our usual boosted-post monthly budget');
    // "operations" does not hold marketing_performance in WORKER_DOMAINS
    // (that belongs to customers_marketing and commercial), so even
    // though the domain is on the eligible list in principle, the
    // proposal must be refused in code, and the reply corrected rather
    // than silently keeping the model's invented figure.
    const fake = makeFakeClient([
      () => ({
        reply: 'Our usual boosted-post budget is £150 a month.',
        certainty: 'CERTAIN', writeback: null, escalation: null, gap: null,
        memoryFact: { domain: 'marketing_performance', canonicalQuestion: question, answer: '£150 a month.' },
        refused: false
      })
    ]);
    __setClientFactoryForTests(() => fake.client);

    const result = await callWorker('operations', { userMessage: question, history: [], priorWorkerNotes: [], routeReason: 'budget question', entities: {}, personaId: 'scott_mercer' });
    assert.equal(result.memoryFact.established, false);
    assert.equal(result.memoryFact.refusedReason, 'worker_not_authorised_for_domain');
    // Defence in depth: the reply itself must not be left stating the
    // unpersisted, invented figure as fact.
    assert.doesNotMatch(result.reply, /£150/);

    const rows = await db.query(
      `SELECT * FROM scott_memory_facts WHERE domain = $1 AND canonical_key = $2`,
      ['marketing_performance', require('../../../lib/scott/memory/factLedger').canonicalizeQuestion(question)]
    );
    assert.equal(rows.rows.length, 0, 'nothing must be persisted for a refused proposal');
  });

  test('a worker with no memoryFact in its reply behaves exactly as before this feature existed', async () => {
    const fake = makeFakeClient([
      () => ({ reply: 'Ordinary answer, nothing new to establish.', certainty: 'CERTAIN', writeback: null, escalation: null, gap: null, refused: false })
    ]);
    __setClientFactoryForTests(() => fake.client);
    const result = await callWorker('operations', { userMessage: 'ordinary question', history: [], priorWorkerNotes: [], routeReason: '', entities: {}, personaId: 'tony_marsh' });
    assert.equal(result.memoryFact, undefined);
    assert.equal(result.technicalFailure, false);
  });

  test('Ruth (the receptionist) has no memoryFact field in her own schema or prompt, so she cannot propose one — the specialist owns the judgement, not the router', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../../../lib/scott/orchestrator.js'), 'utf8');
    const receptionistValidatorSource = source.slice(source.indexOf('function validateReceptionistReply'), source.indexOf('function validateReceptionistReply') + source.slice(source.indexOf('function validateReceptionistReply')).indexOf('\n}'));
    assert.doesNotMatch(receptionistValidatorSource, /memoryFact/, 'the receptionist\'s own reply schema must never validate a memoryFact field');
    assert.doesNotMatch(source.slice(source.indexOf('OUTPUT_FORMAT_RECEPTIONIST'), source.indexOf('buildReceptionistSystemPrompt')), /memoryFact/, 'the receptionist\'s prompt must never mention memoryFact');
  });
});
