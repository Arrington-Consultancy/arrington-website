// Ruth's routing prompt after the 30/08/2026 v0.2 activation.
//
// Before activation this file asserted that Ruth explained the three
// dormant specialists honestly (named, never routable, real reason
// given). All three are now active on Tom's explicit instruction, so the
// honest prompt is the opposite one: they are ordinary routing targets,
// and no text is left describing anyone as held back. The
// dormant-explanation machinery stays in the code, derived from
// PROPOSED_WORKER_IDS, so deactivating a worker restores the honest
// explanation in the same one-line edit; the last test pins that.
const test = require('node:test');
const assert = require('node:assert');

const orchestrator = require('../../lib/scott/orchestrator');
const { WORKERS, PROPOSED_WORKER_IDS, ROUTABLE_WORKER_IDS } = require('../../lib/scott/workers');

test("Ruth's routing prompt", async (t) => {
  const prompt = orchestrator.buildReceptionistSystemPrompt();

  await t.test('offers every active worker, the three v0.2 workers included, as routing targets', () => {
    assert.equal(PROPOSED_WORKER_IDS.length, 0, 'nothing should be left proposed after the activation');
    for (const id of ['finance_accounts', 'people_hr', 'quality_control']) {
      assert.ok(ROUTABLE_WORKER_IDS.includes(id), `${id} must be routable`);
    }
    ROUTABLE_WORKER_IDS.forEach((id) => {
      assert.ok(prompt.includes(`"${id}"`), `${id} must appear as a routable id`);
      assert.ok(prompt.includes(WORKERS[id].characterName), `${WORKERS[id].characterName} must be named`);
    });
  });

  await t.test('carries no leftover dormant-specialist section', () => {
    assert.ok(!prompt.includes('SPECIALISTS THAT EXIST BUT ARE NOT ACTIVE'),
      'the dormant section must drop out when nothing is proposed');
    assert.ok(!/not switched on yet/i.test(prompt), 'no specialist is described as switched off any more');
  });

  await t.test('the dormant explanation stays derived, so a deactivation restores it in the same edit', () => {
    const src = require('fs').readFileSync(require.resolve('../../lib/scott/orchestrator'), 'utf8');
    assert.ok(/proposedBlock = PROPOSED_WORKER_IDS\.map/.test(src),
      'the dormant list must remain derived from PROPOSED_WORKER_IDS, not typed out');
    assert.ok(/PROPOSED_WORKER_IDS\.length === 0 \? ''/.test(src),
      'the section must be conditional on the list being non-empty');
  });
});
