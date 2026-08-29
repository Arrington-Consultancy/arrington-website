// Ruth must explain the dormant specialists honestly.
//
// The brief asks for this specifically, because the two failure modes are
// both dishonest and neither looks like a bug: a finance question either
// gets quietly absorbed by a worker who does not own finance, or gets
// answered as though the company keeps no financial records at all. Ruth
// had no idea the three proposed workers existed, so she could not have
// said the true thing even if asked directly.
const test = require('node:test');
const assert = require('node:assert');

const orchestrator = require('../../lib/scott/orchestrator');
const { WORKERS, PROPOSED_WORKER_IDS, ROUTABLE_WORKER_IDS } = require('../../lib/scott/workers');

test("Ruth's routing prompt", async (t) => {
  const prompt = orchestrator.buildReceptionistSystemPrompt();

  await t.test('names all three dormant specialists', () => {
    assert.ok(PROPOSED_WORKER_IDS.length === 3, 'expected exactly three proposed workers');
    PROPOSED_WORKER_IDS.forEach((id) => {
      assert.ok(prompt.includes(WORKERS[id].characterName),
        `${WORKERS[id].characterName} must be named so Ruth can explain their status`);
    });
  });

  await t.test('does not offer them as routing targets', () => {
    // The routing map lists ids in quotes. A dormant worker's id must
    // never appear in that form, or the model may emit it as a route and
    // the turn will reference a worker that cannot answer.
    PROPOSED_WORKER_IDS.forEach((id) => {
      assert.ok(!prompt.includes(`"${id}"`),
        `${id} must not appear as a routable id`);
    });
  });

  await t.test('every active worker IS offered as a routing target', () => {
    ROUTABLE_WORKER_IDS.forEach((id) => {
      assert.ok(prompt.includes(`"${id}"`), `${id} must be routable`);
    });
  });

  await t.test('gives the real reason rather than a vague one', () => {
    // Doc 24's status is "FORMALLY PREPARED FOR INDEPENDENT REVIEW - NO
    // VERDICT RECORDED". That is why they are off, and it is a better
    // answer than "not available".
    assert.ok(/governance/i.test(prompt), 'the governance review must be named as the reason');
    assert.ok(/no verdict|not activated|has not activated/i.test(prompt),
      'the prompt must state that no verdict exists / they are not activated');
  });

  await t.test('forbids implying a dormant worker has done anything', () => {
    assert.ok(/[Nn]ever state or imply that one of the three has reviewed, checked or approved/.test(prompt),
      'Ruth must be told not to credit a dormant worker with work');
  });

  await t.test('forbids pretending the area is unowned', () => {
    assert.ok(/do not pretend the area is unowned/i.test(prompt));
    assert.ok(/do not imply the company holds no such records/i.test(prompt));
  });

  await t.test('the block is derived, so activating a worker removes it', () => {
    // If this were hand-written prose, setting active: true in workers.js
    // would add the worker to the routing map while leaving text here
    // still describing them as dormant, and both would be in the same
    // prompt at once.
    const src = require('fs').readFileSync(require.resolve('../../lib/scott/orchestrator'), 'utf8');
    assert.ok(/proposedBlock = PROPOSED_WORKER_IDS\.map/.test(src),
      'the dormant list must be derived from PROPOSED_WORKER_IDS, not typed out');
  });
});
