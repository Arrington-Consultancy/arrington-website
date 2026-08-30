// Worker roster state.
//
// Until 30/08/2026 this file asserted that the three v0.2 workers
// (finance_accounts, people_hr, quality_control) were structurally
// dormant. Tom Arrington activated all three on 30/08/2026, after the
// doc 24 governance review and the F2 recheck (see the provenance
// comment in lib/scott/workers.js), so it now asserts the opposite:
// full roster active, nothing left proposed, and the derivations agree.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const workers = require('../../lib/scott/workers');

describe('v0.2 worker roster is fully active', () => {
  test('the three v0.2 workers exist, fully specified, with active: true', () => {
    for (const id of ['finance_accounts', 'people_hr', 'quality_control']) {
      const w = workers.WORKERS[id];
      assert.ok(w, `${id} must exist in WORKERS`);
      assert.equal(w.active, true, `${id} must be active after the 30/08/2026 activation`);
      for (const field of ['canonicalName', 'characterName', 'displayRole', 'purpose', 'scope', 'boundaries', 'permissionsSummary', 'approvalGates', 'personality']) {
        assert.ok(w[field] && (Array.isArray(w[field]) ? w[field].length : w[field].length > 0), `${id}.${field} must be filled in, not a stub`);
      }
      assert.ok(!/proposed|dormant|once activated|if activated/i.test(w.tagline + ' ' + w.personality + ' ' + w.purpose),
        `${id}'s visitor-facing text must no longer describe it as proposed or dormant`);
    }
  });

  test('PROPOSED_WORKER_IDS is empty: nothing on the roster is dormant', () => {
    assert.deepEqual(workers.PROPOSED_WORKER_IDS, []);
  });

  test('all three v0.2 workers are active and routable', () => {
    for (const id of ['finance_accounts', 'people_hr', 'quality_control']) {
      assert.ok(workers.ACTIVE_WORKER_IDS.includes(id), `${id} must be active`);
      assert.ok(workers.ROUTABLE_WORKER_IDS.includes(id), `${id} must be routable`);
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

  test("the orchestrator's routing validator now accepts a route to each v0.2 worker", () => {
    // validateReceptionistReply checks route[i].worker against
    // ROUTABLE_WORKER_IDS directly, so this exercises the real code path's
    // source of truth: a receptionist reply naming "finance_accounts" is
    // valid input since the activation.
    for (const id of ['finance_accounts', 'people_hr', 'quality_control']) {
      assert.ok(workers.ROUTABLE_WORKER_IDS.includes(id));
    }
  });
});
