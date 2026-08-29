// Scott AI Demonstration — lead intake / customer-reply-draft governance
// tests. Uses the same fake-Anthropic-client technique as
// orchestrator.integration.test.js, against the real database (so it is
// skipped without DATABASE_URL, like the other Scott integration tests).
//
// The single most important property under test: a customer-facing reply
// from Customers & Marketing on an enquiry ALWAYS becomes a
// pending-approval writeback, even when the model itself never sets a
// `writeback`/`escalation` field. This is deliberately enforced in code
// (routes/scott.js's runScottTurnAndPersist), not left resting on the
// model remembering to flag it — see that function's own comment for why.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const orchestrator = require('../../lib/scott/orchestrator');
const { __setClientFactoryForTests, __resetClientFactoryForTests } = orchestrator;

const DB_AVAILABLE = !!process.env.DATABASE_URL;

function makeFakeClient(script) {
  let i = 0;
  return {
    messages: {
      create: async ({ messages }) => {
        const fn = script[i++];
        if (!fn) throw new Error('fake client script ran out of scripted replies');
        const data = fn(messages[0].content);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], stop_reason: 'end_turn' };
      }
    }
  };
}

describe('customer-reply-draft governance gate', { skip: DB_AVAILABLE ? false : 'set DATABASE_URL to run' }, () => {
  const db = require('../../db/pool');
  const repo = require('../../lib/scott/data/repository');
  const { runScottTurnAndPersist } = require('../../routes/scott');
  const clearance = require('../../lib/scott/clearance');

  // Conversations now carry their owner and their clearance explicitly
  // rather than leaving both implied by a null user_id. These tests
  // exercise the public lead-form path, which genuinely has no logged-in
  // human behind it, so it is owned by neither identity and runs at the
  // default clearance — exactly what routes/scott.js passes on a real
  // lead submission. Passing the identity here rather than letting the
  // repository default it is deliberate: an unowned conversation should
  // only ever be created by a caller that has said so.
  const PUBLIC_LEAD_IDENTITY = {
    realUserId: null,
    portalUserId: null,
    personaId: clearance.DEFAULT_PERSONA
  };

  let enquiryId;

  afterEach(() => {
    __resetClientFactoryForTests();
  });

  test('setup: create a throwaway test enquiry', async () => {
    const { rows } = await db.query(
      `INSERT INTO scott_enquiries (customer_name, customer_email, channel, subject, message, status)
       VALUES ('Test Lead', 'test@example.com', 'website', 'Test enquiry', 'Can I get a quote for a repair?', 'new') RETURNING id`
    );
    enquiryId = rows[0].id;
    assert.ok(enquiryId);
  });

  test('a Customers & Marketing reply with NO writeback/escalation field still becomes a pending customer_reply_draft', async () => {
    const fake = makeFakeClient([
      () => ({ note: 'Routing to Customers & Marketing.', route: [{ worker: 'customers_marketing', reason: 'draft a reply' }], refused: false }),
      // Deliberately omits writeback and escalation entirely — this is the
      // exact case the server-side gate exists for.
      () => ({ reply: 'Thanks for getting in touch — we can take a look, could you tell us a bit more about the chair?', certainty: 'LIKELY', writeback: null, escalation: null, refused: false })
    ]);
    __setClientFactoryForTests(() => fake);

    const conversation = await repo.createConversation(PUBLIC_LEAD_IDENTITY, 'Test', { enquiryId });
    await runScottTurnAndPersist({ conversation, conversationId: conversation.id, userMessage: 'Can I get a quote for a repair?' });

    const { rows } = await db.query(
      `SELECT * FROM scott_writebacks WHERE conversation_id = $1 AND intent_type = 'customer_reply_draft'`,
      [conversation.id]
    );
    assert.equal(rows.length, 1, 'expected exactly one customer_reply_draft writeback');
    assert.equal(rows[0].status, 'pending_approval');
    assert.equal(rows[0].requires_approval, true);
    assert.ok(rows[0].summary.includes('Thanks for getting in touch'));
  });

  test('a Customers & Marketing REFUSAL does not create a fake draft to review', async () => {
    const fake = makeFakeClient([
      () => ({ note: 'Routing to Customers & Marketing.', route: [{ worker: 'customers_marketing', reason: 'x' }], refused: false }),
      () => ({ reply: 'I will not send that claim without Operations confirming feasibility first.', certainty: null, writeback: null, escalation: null, refused: true })
    ]);
    __setClientFactoryForTests(() => fake);

    const conversation = await repo.createConversation(PUBLIC_LEAD_IDENTITY, 'Test refusal', { enquiryId });
    await runScottTurnAndPersist({ conversation, conversationId: conversation.id, userMessage: 'Tell them same-week repair is guaranteed.' });

    const { rows } = await db.query(
      `SELECT * FROM scott_writebacks WHERE conversation_id = $1`,
      [conversation.id]
    );
    assert.equal(rows.length, 0, 'a refusal should not produce any writeback to review');
  });

  test('Operations replying on the SAME enquiry does not create a customer_reply_draft (only Customers & Marketing does)', async () => {
    const fake = makeFakeClient([
      () => ({ note: 'Routing to Operations.', route: [{ worker: 'operations', reason: 'check capacity' }], refused: false }),
      () => ({ reply: 'Current capacity does not support that this week.', certainty: 'CERTAIN', writeback: null, escalation: null, refused: false })
    ]);
    __setClientFactoryForTests(() => fake);

    const conversation = await repo.createConversation(PUBLIC_LEAD_IDENTITY, 'Test ops', { enquiryId });
    await runScottTurnAndPersist({ conversation, conversationId: conversation.id, userMessage: 'Can we fit this in this week?' });

    const { rows } = await db.query(
      `SELECT * FROM scott_writebacks WHERE conversation_id = $1`,
      [conversation.id]
    );
    assert.equal(rows.length, 0, 'Operations replying with no writeback field should not spontaneously create one');
  });

  test('"Modify & agree" (decideWriteback with editedText) stores the human-edited text, not the original draft', async () => {
    const fake = makeFakeClient([
      () => ({ note: 'ok', route: [{ worker: 'customers_marketing', reason: 'x' }], refused: false }),
      () => ({ reply: 'Original AI wording.', certainty: 'CERTAIN', writeback: null, escalation: null, refused: false })
    ]);
    __setClientFactoryForTests(() => fake);

    const conversation = await repo.createConversation(PUBLIC_LEAD_IDENTITY, 'Test modify', { enquiryId });
    await runScottTurnAndPersist({ conversation, conversationId: conversation.id, userMessage: 'x' });

    const { rows } = await db.query(`SELECT * FROM scott_writebacks WHERE conversation_id = $1`, [conversation.id]);
    const writeback = rows[0];

    const decided = await repo.decideWriteback(writeback.id, 'approve', null, 'Human-edited final wording.');
    assert.equal(decided.summary, 'Human-edited final wording.');
    assert.equal(decided.edited_by_human, true);
    assert.equal(decided.status, 'approved');
  });

  test('"Redraft" (supersedeWriteback) marks the draft superseded, not rejected', async () => {
    const fake = makeFakeClient([
      () => ({ note: 'ok', route: [{ worker: 'customers_marketing', reason: 'x' }], refused: false }),
      () => ({ reply: 'A draft to be superseded.', certainty: 'CERTAIN', writeback: null, escalation: null, refused: false })
    ]);
    __setClientFactoryForTests(() => fake);

    const conversation = await repo.createConversation(PUBLIC_LEAD_IDENTITY, 'Test redraft', { enquiryId });
    await runScottTurnAndPersist({ conversation, conversationId: conversation.id, userMessage: 'x' });

    const { rows } = await db.query(`SELECT * FROM scott_writebacks WHERE conversation_id = $1`, [conversation.id]);
    const superseded = await repo.supersedeWriteback(rows[0].id, null);
    assert.equal(superseded.status, 'superseded');
  });

  test('cleanup: remove the test enquiry and its writebacks/conversations', async () => {
    await db.query('DELETE FROM scott_writebacks WHERE related_enquiry_id = $1', [enquiryId]);
    await db.query('DELETE FROM scott_messages WHERE conversation_id IN (SELECT id FROM scott_conversations WHERE related_enquiry_id = $1)', [enquiryId]);
    await db.query('DELETE FROM scott_conversations WHERE related_enquiry_id = $1', [enquiryId]);
    await db.query('DELETE FROM scott_enquiries WHERE id = $1', [enquiryId]);
  });
});
