// Scott AI Demonstration — verifies the deterministic retrieval half of
// the RAG pattern (lib/scott/data/contextBuilders.js) directly against
// Tom's five named example questions for Company Brain & Records, and
// against the specific SAKS-1047 delayed-job scenario from his brief.
// This proves the CODE correctly finds and formats the right records —
// it does not and cannot prove what the model would say about them
// (that needs a real ANTHROPIC_API_KEY, not available in this sandbox).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const DB_AVAILABLE = !!process.env.DATABASE_URL;

describe('Company Brain context building (Tom\'s five example questions)', { skip: DB_AVAILABLE ? false : 'set DATABASE_URL to run' }, () => {
  const { extractEntities, buildContext } = require('../../lib/scott/data/contextBuilders');

  test('"What needs my attention today?" — general digest includes the live business snapshot', async () => {
    const message = 'What needs my attention today?';
    const entities = await extractEntities(message);
    const context = await buildContext('company_brain', { message, entities });
    assert.ok(context.includes('Business snapshot'));
    assert.ok(context.includes('open jobs'));
    assert.ok(context.includes('Most recent demonstration activity'));
  });

  test('"Which jobs are at risk this week?" — surfaces the actually-flagged at-risk jobs, not an invented list', async () => {
    const message = 'Which jobs are at risk this week?';
    const entities = await extractEntities(message);
    const context = await buildContext('company_brain', { message, entities });
    assert.ok(context.includes('Jobs currently flagged at risk'));
    assert.ok(context.includes('SAKS-1047'), 'SAKS-1047 is seeded at_risk=true and should appear');
  });

  test('"Summarise everything before I call Mrs Jenkins" — resolves the customer and pulls her real history', async () => {
    const message = 'Summarise everything before I call Mrs Jenkins';
    const entities = await extractEntities(message);
    assert.ok(entities.customer, 'should have matched a customer named Jenkins');
    assert.equal(entities.customer.customer.name, 'Mrs Jenkins');
    const context = await buildContext('company_brain', { message, entities });
    assert.ok(context.includes('Mrs Jenkins'));
    assert.ok(context.includes('scott_customers row'), 'should cite its source, not just assert facts');
  });

  test('"What happened with the Fletcher enquiry?" — resolves Karen Fletcher and surfaces her closed enquiry', async () => {
    const message = 'What happened with the Fletcher enquiry?';
    const entities = await extractEntities(message);
    assert.ok(entities.customer, 'should have matched a customer named Fletcher');
    assert.equal(entities.customer.customer.name, 'Karen Fletcher');
    const context = await buildContext('company_brain', { message, entities });
    assert.ok(context.includes('Footstool cover'), 'her seeded enquiry subject should appear in her history');
    assert.ok(context.includes('closed'));
  });

  test('"Draft a customer update for delayed job #SAKS-1047" — job ref resolves to the real seeded record with its risk note', async () => {
    const message = 'Draft a customer update for delayed job #SAKS-1047';
    const entities = await extractEntities(message);
    assert.equal(entities.jobRef, 'SAKS-1047');
    assert.ok(entities.job, 'job ref should resolve to a real row');
    assert.equal(entities.job.ref, 'SAKS-1047');

    // Operations would be routed first for this (confirm status/reason
    // before Customers & Marketing drafts anything) — its context slice
    // should include the job's own at-risk note, not a generic summary.
    const opsContext = await buildContext('operations', { message, entities });
    assert.ok(opsContext.includes('AT RISK'));
    assert.ok(opsContext.includes('frame damage'));
  });

  test('a message with no matching job ref or customer name does not fabricate an entity match', async () => {
    const entities = await extractEntities('What is the price of a standard throw?');
    assert.equal(entities.jobRef, null);
    assert.equal(entities.job, null);
    assert.equal(entities.customer, null);
  });

  test('governance context surfaces pending approvals, never invents one', async () => {
    const context = await buildContext('governance', { message: 'Any approvals waiting?', entities: {} });
    assert.ok(context.includes('scott_writebacks') || context.includes('No writebacks currently awaiting approval'));
  });

  test('every non-empty context block is explicitly labelled as isolated demonstration data, not the real Drive brain', async () => {
    const entities = await extractEntities('What needs my attention today?');
    const context = await buildContext('company_brain', { message: 'What needs my attention today?', entities });
    assert.ok(context.includes('isolated fictional data'));
    assert.ok(context.includes('not the real Scott Drive brain'));
  });
});
