// The Brain Gap register against a real database: the states a gap can be
// in, and the ones it must not be able to reach.
//
// Two of these went wrong first time and are the reason the file exists
// rather than a set of unit tests over the plan object. recordGapDelivery
// failed with Postgres 42P08 ("inconsistent types deduced for parameter")
// because the same parameter was both assigned to a varchar column and
// compared against a text literal, which no amount of reading the SQL
// made obvious. And a close is only correct if a SECOND close is refused,
// which cannot be checked without actually writing the first one.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const DB_AVAILABLE = !!process.env.DATABASE_URL;

describe('brain gap lifecycle', { skip: DB_AVAILABLE ? false : 'set DATABASE_URL to run' }, () => {
  const db = require('../../db/pool');
  const repo = require('../../lib/scott/data/repository');
  const bg = require('../../lib/scott/brainGaps');

  const created = [];
  const marker = `LIFECYCLE-${Date.now()}`;

  async function makeGap(overrides = {}) {
    const plan = bg.planGap({
      type: 'conflicting',
      missing: `${marker} the stock feed and the purchase order disagree`,
      whyItMatters: 'A customer is waiting on a date',
      domain: 'yarn_stock',
      workCanContinue: false,
      ...overrides
    }, { askerPersonaId: 'chloe_reed', raisedByWorkerId: 'operations' });
    const row = await repo.createBrainGap({ ...plan, conversationId: null });
    created.push(row.id);
    return { plan, row };
  }

  after(async () => {
    if (created.length) {
      await db.query('DELETE FROM scott_brain_gaps WHERE id = ANY($1::int[])', [created]);
    }
  });

  test('a raised gap starts open, owned, and unnotified', async () => {
    const { row } = await makeGap();
    assert.equal(row.status, 'open');
    assert.equal(row.responsible_persona_id, 'leah_morgan');
    assert.equal(row.email_status, 'pending');
    assert.equal(row.material, true);
    assert.equal(row.work_can_continue, false);
    // Nothing has been claimed about a notification yet.
    assert.doesNotMatch(bg.describeNotification(row), /has been emailed/);
  });

  test('a failed delivery leaves the gap OPEN and records the real error', async () => {
    // An open gap nobody has been told about is exactly the state that
    // needs to stay visible, so a failure must not quietly advance it.
    const { row } = await makeGap();
    const after = await repo.recordGapDelivery(row.id, {
      emailStatus: 'failed', emailTo: 'x@example.test', attempts: 2, error: '535 rejected'
    });
    assert.equal(after.status, 'open');
    assert.equal(after.email_status, 'failed');
    assert.equal(after.email_attempts, 2);
    assert.equal(after.emailed_at, null);
    assert.match(bg.describeNotification(after), /has NOT been emailed/);
    assert.match(bg.describeNotification(after), /535 rejected/);
  });

  test('a successful delivery is the only thing that stamps emailed_at', async () => {
    const { row } = await makeGap();
    const after = await repo.recordGapDelivery(row.id, {
      emailStatus: 'sent', emailTo: 'x@example.test', attempts: 1, error: ''
    });
    assert.equal(after.status, 'notified');
    assert.equal(after.email_status, 'sent');
    assert.ok(after.emailed_at instanceof Date);
    assert.equal(bg.describeNotification(after), 'Leah Morgan has been emailed.');
  });

  test('closing with the source corrected resolves it and records who and what', async () => {
    const { row } = await makeGap();
    const closed = await repo.resolveBrainGap(row.id, {
      sourceCorrected: true,
      note: 'Counted it. 0 on hand, 24 still due 2 September. 07I corrected.',
      resolver: { realUserId: null, portalUserId: null, displayName: 'Leah Morgan' }
    });
    assert.equal(closed.status, 'resolved');
    assert.equal(closed.source_corrected, true);
    assert.equal(closed.resolved_by_name, 'Leah Morgan');
    assert.match(closed.resolution_note, /07I corrected/);
    assert.ok(closed.resolved_at instanceof Date);
  });

  test('closing WITHOUT correcting the source is a dismissal, not a resolution', async () => {
    // "This turned out not to matter" and "the record is now right" are
    // different answers. Collapsing them into one closed flag is how a
    // queue gets cleared without anything being fixed.
    const { row } = await makeGap();
    const closed = await repo.resolveBrainGap(row.id, {
      sourceCorrected: false,
      note: 'Duplicate of an earlier gap on the same count.',
      resolver: { displayName: 'Tony Marsh' }
    });
    assert.equal(closed.status, 'dismissed');
    assert.equal(closed.source_corrected, false);
  });

  test('a closed gap cannot be closed again under a different name', async () => {
    const { row } = await makeGap();
    await repo.resolveBrainGap(row.id, {
      sourceCorrected: false, note: 'Not real.', resolver: { displayName: 'Tony Marsh' }
    });
    const second = await repo.resolveBrainGap(row.id, {
      sourceCorrected: true, note: 'Actually fixed it.', resolver: { displayName: 'Someone else' }
    });
    assert.equal(second, null, 'the route reports this as a conflict rather than a second success');
  });

  test('closed gaps drop out of the open list; open ones stay', async () => {
    const { row: openRow } = await makeGap();
    const { row: closedRow } = await makeGap();
    await repo.resolveBrainGap(closedRow.id, {
      sourceCorrected: true, note: 'Source confirmed correct as it stands.', resolver: { displayName: 'Leah Morgan' }
    });
    const open = await repo.getOpenBrainGaps({ limit: 200 });
    const ids = open.map((g) => g.id);
    assert.ok(ids.includes(openRow.id));
    assert.ok(!ids.includes(closedRow.id));
  });

  test('a non-material gap is kept but stays out of the material list', async () => {
    // Recorded, because a record rotting quietly is worth noticing. Not
    // routed, because the brief is explicit that email is not for
    // trivial gaps.
    const { row } = await makeGap({ workCanContinue: true });
    assert.equal(row.material, false);
    assert.equal(row.email_status, 'not_required');
    assert.equal(row.notify_decision, bg.NOTIFY_DECISIONS.NOT_MATERIAL);
    const material = await repo.getOpenBrainGaps({ materialOnly: true, limit: 200 });
    assert.ok(!material.map((g) => g.id).includes(row.id));
    const all = await repo.getBrainGaps({ limit: 200 });
    assert.ok(all.map((g) => g.id).includes(row.id), 'it is still on the register');
  });

  test('the open list is filtered by clearance like every other record', async () => {
    // A gap description quotes the evidence that is missing, so an
    // unfiltered list here would be a way round every other control.
    const clearance = require('../../lib/scott/clearance');
    await makeGap({ domain: 'finance_full', missing: `${marker} the August margin contradicts the ledger` });
    const rows = await repo.getOpenBrainGaps({ limit: 200 });
    const forJo = clearance.filterAndRedact('jo_bell', null, rows);
    assert.ok(!forJo.some((g) => g.domain === 'finance_full'),
      'a knitting operative must not read a finance gap');
    const forScott = clearance.filterAndRedact('scott_mercer', null, rows);
    assert.ok(forScott.some((g) => g.domain === 'finance_full'));
  });
});
