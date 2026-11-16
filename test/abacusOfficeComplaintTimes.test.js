// Complaint escalation times (Tom, 16 November 2026): a manager is told
// about a safety matter straight away, a serious complaint after 2 hours and
// any other after 12, each with no approved reply. Telling a manager never
// takes the complaint off the operators (Tom: "i dont want complaints to
// bypass operators, they need to go there as well"). Gated on
// ABACUS_OFFICE_TEST_DATABASE_URL; works in its own schema.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;

test('complaint escalation times tell a manager and leave the operators in charge', { skip: !DB && 'set ABACUS_OFFICE_TEST_DATABASE_URL' }, async () => {
  const { Pool } = require('pg');
  const schema = `cpl_times_${process.pid}`;
  const admin = new Pool({ connectionString: DB });
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: DB, options: `-c search_path=${schema}` });
  try {
    const { Store } = require('../abacus-office/lib/store');
    const { Office, canApprove } = require('../abacus-office/lib/cases');
    const { firm } = require('../abacus-office/lib/firm');
    const store = new Store(pool);
    await store.ensureSchema();
    assert.equal(await store.complaintSeriousHours(), 2);
    assert.equal(await store.complaintNudgeHours(), 12);
    const office = new Office({ store, firm: firm(), mailbox: { name: 'none', none: true, off: true, demo: false } });
    const add = async (id, seriousness, hoursAgo) => {
      await pool.query(`INSERT INTO cases (message_id, from_address, subject, body, received_at, kind, seriousness, status, draft)
        VALUES ($1, 'x@example.invalid', $1, 'x', now() - ($2 || ' hours')::interval, 'complaints', $3, 'new', 'Hi,\n\nSorry.\n\nThanks,\nAbacus')`, [id, String(hoursAgo), seriousness]);
      return id;
    };
    await add('safety-now', 'safety', 0);
    await add('serious-1h', 'serious', 1);
    await add('serious-3h', 'serious', 3);
    await add('minor-11h', 'minor', 11);
    await add('minor-13h', 'minor', 13);
    const mails = [];
    const n = await office.nudge({ sendNudge: async (a) => { mails.push(a); return { sent: true, sentIds: a.cases.map((c) => c.id) }; } }, 'https://office.example');
    assert.equal(n.nudged, 3);
    const row = async (id) => (await pool.query('SELECT * FROM cases WHERE message_id = $1', [id])).rows[0];
    const told = async (id) => Boolean((await row(id)).manager_alerted_at);
    assert.equal(await told('safety-now'), true, 'a safety matter: straight away');
    assert.equal(await told('serious-1h'), false, 'serious under 2 hours: not yet');
    assert.equal(await told('serious-3h'), true, 'serious over 2 hours');
    assert.equal(await told('minor-11h'), false, 'minor under 12 hours: not yet');
    assert.equal(await told('minor-13h'), true, 'minor over 12 hours');
    assert.equal((await row('serious-3h')).manager_alert_reason, 'a serious complaint with no approved reply within 2 hours');
    assert.equal((await row('safety-now')).manager_alert_reason, 'a safety matter');
    assert.equal(mails.length, 1);
    await store.createUser({ username: 'op', displayName: 'Op', password: 'op-password-123', role: 'operator' });
    const op = await store.userByName('op');
    for (const id of ['serious-3h', 'minor-13h']) {
      const c = await row(id);
      assert.equal(c.passed_up_at, null, `${id} is not taken off the operators`);
      assert.equal(canApprove(op, c), true, `${id}: an operator can still approve it`);
    }
    // A safety reply is still approved by a manager, as before; the operator
    // still sees it and works on it.
    assert.equal(canApprove(op, await row('safety-now')), false);
    // The manager list on Today carries them; a second sweep tells nobody again.
    const list = await store.listCases({ passedUp: true });
    assert.deepEqual(list.map((c) => c.message_id).sort(), ['minor-13h', 'safety-now', 'serious-3h']);
    assert.deepEqual(await office.nudge({ sendNudge: async () => ({ sent: true }) }, ''), { nudged: 0, emailed: false });

    // An old automatic pass-up (before 16 November) goes back to the
    // operators at boot; a person's pass-up, or one with a holding reply,
    // stays passed up.
    await pool.query(`INSERT INTO cases (message_id, from_address, subject, body, received_at, kind, seriousness, status, passed_up_at, passed_up_reason)
      VALUES ('old-auto', 'x', 'x', 'x', now() - interval '20 hours', 'complaints', 'minor', 'new', now(), 'No approved reply within 12 hours')`);
    await pool.query(`INSERT INTO cases (message_id, from_address, subject, body, received_at, kind, seriousness, status, passed_up_at, passed_up_reason, passed_up_by)
      VALUES ('by-person', 'x', 'x', 'x', now(), 'complaints', 'minor', 'new', now(), 'They want a refund', $1)`, [op.id]);
    await pool.query(`INSERT INTO cases (message_id, from_address, subject, body, received_at, kind, seriousness, status, passed_up_at, passed_up_reason, holding_sent_at)
      VALUES ('auto-held', 'x', 'x', 'x', now() - interval '20 hours', 'complaints', 'minor', 'new', now(), 'No approved reply within 12 hours', now())`);
    await store.ensureSchema();
    const oldAuto = await row('old-auto');
    assert.equal(oldAuto.passed_up_at, null);
    assert.ok(oldAuto.manager_alerted_at);
    assert.equal(oldAuto.manager_alert_reason, 'No approved reply within 12 hours');
    assert.ok((await row('by-person')).passed_up_at, 'a person\'s pass-up stays');
    assert.ok((await row('auto-held')).passed_up_at, 'a holding reply told the customer a manager has it, so it stays');
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
