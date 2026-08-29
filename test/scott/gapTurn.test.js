// The gap loop through a real AI turn, with a scripted fake model, against
// the real database. Same technique as leadWorkflow.test.js.
//
// What this is really testing is that the WORKER does not get to decide
// any of it. The model can say whatever it likes in its reply text; who
// is told, whether anyone is told, and what the interface says about it
// are all decided and recorded by the server.
const { test, describe, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const orchestrator = require('../../lib/scott/orchestrator');
const { __setClientFactoryForTests, __resetClientFactoryForTests } = orchestrator;

const DB_AVAILABLE = !!process.env.DATABASE_URL;

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

describe('brain gaps through a real turn', { skip: DB_AVAILABLE ? false : 'set DATABASE_URL to run' }, () => {
  const db = require('../../db/pool');
  const repo = require('../../lib/scott/data/repository');
  const clearance = require('../../lib/scott/clearance');
  const gapNotifier = require('../../lib/scott/gapNotifier');
  const { runScottTurnAndPersist } = require('../../routes/scott');

  const conversations = [];
  const marker = `TURNGAP-${Date.now()}`;

  const route = () => ({ note: 'Operations owns the stock position.', route: [{ worker: 'operations', reason: 'stock' }], refused: false });

  async function newConversation() {
    const c = await repo.createConversation(
      { realUserId: null, portalUserId: null, personaId: clearance.DEFAULT_PERSONA },
      'Gap test', {});
    conversations.push(c.id);
    return c;
  }

  async function gapsFor(conversationId) {
    const { rows } = await db.query('SELECT * FROM scott_brain_gaps WHERE conversation_id = $1 ORDER BY id', [conversationId]);
    return rows;
  }

  afterEach(() => {
    __resetClientFactoryForTests();
    gapNotifier.__resetTransportForTests();
  });

  after(async () => {
    if (!conversations.length) return;
    await db.query('DELETE FROM scott_brain_gaps WHERE conversation_id = ANY($1::int[])', [conversations]);
    await db.query('DELETE FROM scott_writebacks WHERE conversation_id = ANY($1::int[])', [conversations]);
    await db.query('DELETE FROM scott_messages WHERE conversation_id = ANY($1::int[])', [conversations]);
    await db.query('DELETE FROM scott_conversations WHERE id = ANY($1::int[])', [conversations]);
  });

  test('a worker raising a blocking evidence gap creates a routed record and a real send', async () => {
    let sent = 0;
    gapNotifier.__setTransportForTests({ sendMail: async () => { sent += 1; return { messageId: 'x' }; } });
    const fake = makeFakeClient([route, () => ({
      reply: 'I cannot give you a date from that figure.',
      certainty: 'UNPROVEN',
      writeback: null,
      escalation: null,
      gap: {
        type: 'conflicting',
        missing: `${marker} the cream yarn count and the purchase order disagree`,
        whyItMatters: 'A customer is waiting on a knitting date',
        domain: 'yarn_stock',
        workCanContinue: false
      },
      refused: false
    })]);
    __setClientFactoryForTests(() => fake);

    const conversation = await newConversation();
    const turn = await runScottTurnAndPersist({
      conversation, conversationId: conversation.id, userMessage: 'When can we knit the cream throw?', personaId: 'chloe_reed'
    });

    const rows = await gapsFor(conversation.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].responsible_persona_id, 'leah_morgan');
    assert.equal(rows[0].email_status, 'sent');
    assert.equal(rows[0].status, 'notified');
    assert.equal(sent, 1, 'a genuine send was attempted, once');
    assert.equal(turn.gapRecords.length, 1);
  });

  test('the interface sentence comes from the delivery result, not from the worker', async () => {
    // The model is scripted to claim, in its own reply text, that Leah
    // has been emailed. The send is then made to fail. The sentence the
    // interface is allowed to print must contradict the model.
    gapNotifier.__setTransportForTests({ sendMail: async () => { throw new Error('535 rejected by server'); } });
    const fake = makeFakeClient([route, () => ({
      reply: 'I have emailed Leah Morgan about this and she will confirm shortly.',
      certainty: 'UNPROVEN',
      writeback: null,
      escalation: null,
      gap: {
        type: 'missing',
        missing: `${marker} no current cream yarn count exists`,
        whyItMatters: 'A customer is waiting on a knitting date',
        domain: 'yarn_stock',
        workCanContinue: false
      },
      refused: false
    })]);
    __setClientFactoryForTests(() => fake);

    const conversation = await newConversation();
    await runScottTurnAndPersist({
      conversation, conversationId: conversation.id, userMessage: 'Cream throw date?', personaId: 'chloe_reed'
    });

    const rows = await gapsFor(conversation.id);
    assert.equal(rows[0].email_status, 'failed');
    assert.equal(rows[0].status, 'open', 'a failed send must leave the gap open and visible');
    assert.equal(rows[0].email_attempts, 2, 'retried once');

    const brainGaps = require('../../lib/scott/brainGaps');
    const said = brainGaps.describeNotification(rows[0]);
    assert.match(said, /has NOT been emailed/);
    assert.match(said, /535 rejected by server/);
  });

  test('an approval escalation on the same reply keeps the gap out of the email path', async () => {
    let sent = 0;
    gapNotifier.__setTransportForTests({ sendMail: async () => { sent += 1; return { messageId: 'x' }; } });
    const fake = makeFakeClient([route, () => ({
      reply: 'This needs Scott.',
      certainty: 'LIKELY',
      writeback: null,
      escalation: { to: 'scott_mercer', reason: 'discount above my limit' },
      gap: {
        type: 'missing',
        missing: `${marker} the agreed discount is not recorded anywhere`,
        whyItMatters: 'We cannot quote without it',
        domain: 'yarn_stock',
        workCanContinue: false
      },
      refused: false
    })]);
    __setClientFactoryForTests(() => fake);

    const conversation = await newConversation();
    await runScottTurnAndPersist({
      conversation, conversationId: conversation.id, userMessage: 'Discount?', personaId: 'chloe_reed'
    });

    const rows = await gapsFor(conversation.id);
    assert.equal(rows.length, 1, 'still recorded');
    assert.equal(rows[0].notify_decision, 'approval_workflow');
    assert.equal(rows[0].email_status, 'not_required');
    assert.equal(sent, 0, 'nobody is emailed about something the approvals queue already owns');
  });

  test('a non-blocking gap on an unscoped conversation is recorded and nobody is emailed', async () => {
    let sent = 0;
    gapNotifier.__setTransportForTests({ sendMail: async () => { sent += 1; return { messageId: 'x' }; } });
    const fake = makeFakeClient([route, () => ({
      reply: 'Worth someone tidying up at some point.',
      certainty: 'LIKELY',
      writeback: null,
      escalation: null,
      gap: {
        type: 'stale',
        missing: `${marker} the supplier lead time note is from March`,
        whyItMatters: 'It will mislead somebody eventually',
        domain: 'yarn_stock',
        workCanContinue: true
      },
      refused: false
    })]);
    __setClientFactoryForTests(() => fake);

    const conversation = await newConversation();
    await runScottTurnAndPersist({
      conversation, conversationId: conversation.id, userMessage: 'Anything stale in stock?', personaId: 'chloe_reed'
    });

    const rows = await gapsFor(conversation.id);
    assert.equal(rows[0].material, false);
    assert.equal(rows[0].notify_decision, 'not_material');
    assert.equal(sent, 0);
  });

  test('a raised gap appears in the activity trail under the worker that raised it', async () => {
    gapNotifier.__setTransportForTests({ sendMail: async () => ({ messageId: 'x' }) });
    const fake = makeFakeClient([route, () => ({
      reply: 'Cannot answer that.',
      certainty: 'UNPROVEN',
      writeback: null,
      escalation: null,
      gap: {
        type: 'conflicting',
        missing: `${marker} activity trail check`,
        whyItMatters: 'A customer is waiting',
        domain: 'yarn_stock',
        workCanContinue: false
      },
      refused: false
    })]);
    __setClientFactoryForTests(() => fake);

    const conversation = await newConversation();
    await runScottTurnAndPersist({
      conversation, conversationId: conversation.id, userMessage: 'x', personaId: 'chloe_reed'
    });

    const { rows } = await db.query(
      `SELECT * FROM scott_activity WHERE conversation_id = $1 AND event_type = 'brain_gap_raised'`,
      [conversation.id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actor, 'operations');
    assert.match(rows[0].summary, new RegExp(marker));
  });
});
