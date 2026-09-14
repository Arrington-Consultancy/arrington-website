// Scott AI Demonstration — ask the same factual question twice.
//
// Tom's requirement (13/09/2026): "If someone asks the same factual question
// tomorrow, the answer should be the same unless the underlying fictional
// company record has genuinely changed... repeated questions should produce
// the same substantive answer; wording can vary, facts cannot."
//
// This runs the real turn path against a real database with a scripted
// model, and the script is deliberately hostile: on the second question the
// model answers with a DIFFERENT figure for the same thing. That is the
// failure the requirement names, and everything asserted here is about what
// the server does with it rather than about the model behaving.
//
// Three properties, and the second is the one that could not be established
// by a unit test:
//
//   1. What the company learns is kept and is in the brain afterwards.
//   2. The visitor's answer to the repeated question carries the HELD
//      figure, appended from the record.
//   3. The second, contradicting proposal is refused, and the earlier fact
//      is still the one the company holds.

const { test, describe, before, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');

const orchestrator = require('../../lib/scott/orchestrator');
const { __setClientFactoryForTests, __resetClientFactoryForTests } = orchestrator;

const DB_AVAILABLE = !!process.env.DATABASE_URL;

// One client per turn, held across its calls. The factory is invoked on
// every model call, so building the client inside it would hand each call a
// fresh script starting at the first reply, and every worker would receive
// the receptionist's routing object instead of its own. That mistake costs
// an hour and reads exactly like the gap loop being broken.
function makeFakeClient(script) {
  let i = 0;
  return {
    messages: {
      create: async () => {
        const fn = script[i++];
        if (!fn) throw new Error('fake client script ran out of scripted replies');
        return { content: [{ type: 'text', text: JSON.stringify(fn()) }], stop_reason: 'end_turn' };
      }
    }
  };
}

describe('a repeated question gets the same fact', { skip: DB_AVAILABLE ? false : 'set DATABASE_URL to run' }, () => {
  const db = require('../../db/pool');
  const repo = require('../../lib/scott/data/repository');
  const clearance = require('../../lib/scott/clearance');
  const contextBuilders = require('../../lib/scott/data/contextBuilders');
  const gapNotifier = require('../../lib/scott/gapNotifier');
  const { runScottTurnAndPersist } = require('../../routes/scott');

  // Leah runs knitting and the Operations worker serves her, so both can
  // read yarn_stock. Asserted below rather than assumed: if the clearance
  // map ever changes, this test must fail loudly rather than quietly prove
  // nothing, since a reconciliation that finds no visible record would look
  // exactly like a reconciliation that chose not to correct anything.
  const PERSONA = 'leah_morgan';
  const WORKER = 'operations';
  const DOMAIN = 'yarn_stock';

  const stamp = Date.now();
  const FACT_KEY = `repeatability_probe_${stamp}`;
  const HELD_VALUE = `Cream yarn reorder quantity is ${stamp % 50 + 20} balls.`;
  const SECOND_VALUE = `Cream yarn reorder quantity is ${stamp % 50 + 400} balls.`;

  const conversations = [];
  let autofillWas;
  let autofillHad;

  const route = () => ({ note: 'Operations owns the stock position.', route: [{ worker: WORKER, reason: 'stock' }], refused: false });

  const answer = (reply, factValue) => () => ({
    reply,
    certainty: 'LIKELY',
    writeback: null,
    escalation: null,
    gap: {
      type: 'missing',
      missing: `no reorder quantity is recorded for cream yarn (probe ${stamp})`,
      whyItMatters: 'A customer is waiting on a knitting date',
      domain: DOMAIN,
      workCanContinue: false
    },
    factProposal: {
      domain: DOMAIN,
      factKey: FACT_KEY,
      factValue,
      sourceLabel: '07I Stock & Supply',
      estimated: true,
      basis: 'the usage on the last four cream orders'
    },
    refused: false
  });

  async function newConversation() {
    const c = await repo.createConversation(
      { realUserId: null, portalUserId: null, personaId: PERSONA }, 'Repeatability probe', {});
    conversations.push(c.id);
    return c;
  }

  const workerMessages = async (conversationId) => {
    const { rows } = await db.query(
      "SELECT * FROM scott_messages WHERE conversation_id = $1 AND sender = 'worker' ORDER BY id", [conversationId]);
    return rows;
  };

  before(async () => {
    autofillHad = Object.prototype.hasOwnProperty.call(process.env, 'SCOTT_BRAIN_AUTOFILL');
    autofillWas = process.env.SCOTT_BRAIN_AUTOFILL;
    process.env.SCOTT_BRAIN_AUTOFILL = 'true';
    // Nothing is sent anywhere by this test.
    gapNotifier.__setTransportForTests({ sendMail: async () => ({ messageId: 'probe' }) });
    await contextBuilders.loadApprovedFacts();
  });

  afterEach(() => {
    __resetClientFactoryForTests();
  });

  after(async () => {
    if (autofillHad) process.env.SCOTT_BRAIN_AUTOFILL = autofillWas;
    else delete process.env.SCOTT_BRAIN_AUTOFILL;
    gapNotifier.__resetTransportForTests();
    await db.query('DELETE FROM scott_brain_candidates WHERE fact_key = $1', [FACT_KEY]);
    if (conversations.length) {
      await db.query('DELETE FROM scott_brain_gaps WHERE conversation_id = ANY($1::int[])', [conversations]);
      await db.query('DELETE FROM scott_writebacks WHERE conversation_id = ANY($1::int[])', [conversations]);
      await db.query('DELETE FROM scott_messages WHERE conversation_id = ANY($1::int[])', [conversations]);
      await db.query('DELETE FROM scott_conversations WHERE id = ANY($1::int[])', [conversations]);
    }
    await contextBuilders.loadApprovedFacts();
  });

  test('the pair this test relies on really can read the domain', () => {
    assert.ok(clearance.personaCanSeeDomain(PERSONA, DOMAIN));
    assert.ok(clearance.workerCanReadDomain(WORKER, DOMAIN));
  });

  test('what the company works out once, it keeps', async () => {
    const fake = makeFakeClient([route, answer('About that many, I would say.', HELD_VALUE)]);
    __setClientFactoryForTests(() => fake);
    const conversation = await newConversation();
    const turn = await runScottTurnAndPersist({
      conversation, conversationId: conversation.id, userMessage: 'How many balls do we reorder cream in?', personaId: PERSONA
    });

    assert.equal(turn.candidateRecords.length, 1);
    assert.equal(turn.candidateRecords[0].status, 'approved', 'a clean estimate is admitted, not queued');

    const held = contextBuilders.allDeepFactRecords()
      .filter((r) => r && r.factKey === FACT_KEY);
    assert.equal(held.length, 1, 'the company brain holds it, once');
    assert.equal(held[0].factValue, HELD_VALUE);
    assert.equal(held[0].estimated, true, 'and still knows it is an estimate');
  });

  test('the gap it filled closes itself, naming the fact that filled it', async () => {
    const { rows } = await db.query(
      'SELECT * FROM scott_brain_gaps WHERE conversation_id = $1', [conversations[0]]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'resolved');
    assert.equal(rows[0].resolved_by_name, 'automatic');
    assert.equal(rows[0].source_corrected, false, 'no code may claim a person corrected a record');
    assert.match(rows[0].resolution_note, new RegExp(FACT_KEY));
  });

  test('asked again, the answer carries the held figure even though the model gave a different one', async () => {
    const fake = makeFakeClient([route, answer('I would put it at the higher number.', SECOND_VALUE)]);
    __setClientFactoryForTests(() => fake);
    const conversation = await newConversation();
    await runScottTurnAndPersist({
      conversation, conversationId: conversation.id, userMessage: 'Remind me, how many balls do we reorder cream in?', personaId: PERSONA
    });

    const messages = await workerMessages(conversation.id);
    const reply = messages[messages.length - 1].content;
    assert.ok(reply.includes(HELD_VALUE), `the reply must state the held figure. Got: ${reply}`);
    assert.match(reply, /already holds an estimate/i, 'and must say where that figure comes from');
    // The model's own second figure is still in its wording. That is the
    // point of "wording can vary, facts cannot": the reply is not censored,
    // it is completed with what the company actually holds.
    assert.ok(reply.includes('the higher number'), 'the model\'s own words are kept');
  });

  test('the contradicting figure is refused and the earlier fact still stands', async () => {
    const { rows } = await db.query(
      'SELECT * FROM scott_brain_candidates WHERE fact_key = $1 ORDER BY id', [FACT_KEY]);
    assert.equal(rows.length, 2, 'both proposals are on the register');
    assert.equal(rows[0].status, 'approved');
    assert.equal(rows[1].status, 'rejected');
    assert.match(rows[1].decision_note, /already holds/i);

    const held = contextBuilders.allDeepFactRecords().filter((r) => r && r.factKey === FACT_KEY);
    assert.equal(held.length, 1);
    assert.equal(held[0].factValue, HELD_VALUE, 'the company did not change its mind');
  });

  test('the second gap closes as one that was never a gap', async () => {
    const { rows } = await db.query(
      'SELECT * FROM scott_brain_gaps WHERE conversation_id = $1', [conversations[1]]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'dismissed');
    assert.match(rows[0].resolution_note, /already holds/i);
  });

  test('a person can change it, and both versions stay readable', async () => {
    const { rows } = await db.query(
      "SELECT * FROM scott_brain_candidates WHERE fact_key = $1 AND status = 'approved'", [FACT_KEY]);
    const result = await repo.supersedeBrainFact(rows[0].id, {
      factValue: SECOND_VALUE,
      note: 'the reorder quantity went up with the new pattern',
      decider: { realUserId: null, personaId: PERSONA, displayName: 'Tom Arrington' }
    });
    assert.ok(result, 'the correction must be recorded');
    assert.equal(result.previous.status, 'superseded');
    assert.equal(result.previous.superseded_by_id, result.current.id);
    assert.equal(result.current.supersedes_id, result.previous.id);
    assert.equal(result.current.fact_value, SECOND_VALUE);
    assert.match(result.current.decision_note, /Corrected by Tom Arrington/);

    await contextBuilders.loadApprovedFacts();
    const held = contextBuilders.allDeepFactRecords().filter((r) => r && r.factKey === FACT_KEY);
    assert.equal(held.length, 1, 'the brain holds exactly one version, never both');
    assert.equal(held[0].factValue, SECOND_VALUE, 'and it is the new one');
  });

  test('a second correction of the same row is refused, because it is no longer held', async () => {
    const { rows } = await db.query(
      "SELECT * FROM scott_brain_candidates WHERE fact_key = $1 AND status = 'superseded' ORDER BY id", [FACT_KEY]);
    const again = await repo.supersedeBrainFact(rows[0].id, {
      factValue: 'Something else.',
      note: 'a second attempt on the same old row',
      decider: { realUserId: null, personaId: PERSONA, displayName: 'Tom Arrington' }
    });
    assert.equal(again, null, 'only a fact the company currently holds can be corrected');
  });
});
