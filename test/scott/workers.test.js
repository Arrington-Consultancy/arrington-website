// Proves the three proposed v0.2 workers (Nigel/Sheila/Nina) are dormant
// in the way that actually matters: unreachable by routing, not just
// visually labelled "proposed" in a template that could drift out of sync
// with the code. Doc 24's independent governance review has status
// "NO VERDICT RECORDED" as of the transcription in workers.js — until a
// later session finds an actual PASS and Tom's activation record in
// Drive, none of these three may become reachable, and this test is what
// would catch it if a future edit accidentally made one so.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const workers = require('../../lib/scott/workers');

describe('proposed v0.2 workers are structurally dormant', () => {
  test('all three proposed workers exist, fully specified, with active: false', () => {
    for (const id of ['finance_accounts', 'people_hr', 'quality_control']) {
      const w = workers.WORKERS[id];
      assert.ok(w, `${id} must exist in WORKERS`);
      assert.equal(w.active, false, `${id} must be explicitly active: false`);
      for (const field of ['canonicalName', 'characterName', 'displayRole', 'purpose', 'scope', 'boundaries', 'permissionsSummary', 'approvalGates', 'personality']) {
        assert.ok(w[field] && (Array.isArray(w[field]) ? w[field].length : w[field].length > 0), `${id}.${field} must be filled in, not a stub`);
      }
    }
  });

  test('PROPOSED_WORKER_IDS contains exactly the three proposed workers', () => {
    assert.deepEqual(workers.PROPOSED_WORKER_IDS.sort(), ['finance_accounts', 'people_hr', 'quality_control']);
  });

  test('none of the three appear in ROUTABLE_WORKER_IDS — Ruth cannot route to them', () => {
    for (const id of workers.PROPOSED_WORKER_IDS) {
      assert.ok(!workers.ROUTABLE_WORKER_IDS.includes(id), `${id} must not be routable`);
    }
  });

  test('none of the three appear in ACTIVE_WORKER_IDS', () => {
    for (const id of workers.PROPOSED_WORKER_IDS) {
      assert.ok(!workers.ACTIVE_WORKER_IDS.includes(id), `${id} must not be active`);
    }
  });

  test('isActiveWorker() agrees with ACTIVE_WORKER_IDS for every worker, both ways', () => {
    for (const id of workers.WORKER_IDS) {
      assert.equal(workers.isActiveWorker(id), workers.ACTIVE_WORKER_IDS.includes(id), `mismatch for ${id}`);
    }
  });

  test('the six original v0.1 workers remain active and routable (Ruth excluded from routable, as before)', () => {
    const sixOriginal = ['receptionist', 'commercial', 'operations', 'customers_marketing', 'company_brain', 'governance'];
    for (const id of sixOriginal) {
      assert.ok(workers.ACTIVE_WORKER_IDS.includes(id), `${id} must remain active`);
    }
    for (const id of sixOriginal.filter((id) => id !== 'receptionist')) {
      assert.ok(workers.ROUTABLE_WORKER_IDS.includes(id), `${id} must remain routable`);
    }
    assert.ok(!workers.ROUTABLE_WORKER_IDS.includes('receptionist'), 'Ruth herself stays a non-destination, as before');
  });

  test('the orchestrator\'s own routing validator would reject a route to a proposed worker', () => {
    // orchestrator.js's validateReceptionistReply checks route[i].worker
    // against ROUTABLE_WORKER_IDS directly, so this is really the same
    // check as above, but exercised the way the actual code path uses it:
    // a receptionist reply naming "finance_accounts" as a route target is
    // invalid input, which the orchestrator would reject before ever
    // calling buildWorkerSystemPrompt() for it.
    assert.ok(!workers.ROUTABLE_WORKER_IDS.includes('finance_accounts'));
  });
});
