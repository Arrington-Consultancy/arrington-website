// RESET_USER_PASSWORDS: a narrow escape hatch in db/seed.js for resetting
// nat/tom's login on a non-production database whose password this session
// has no record of (typically a staging database seeded long before, or
// shared by several deploys).
//
// This exists because of a real incident, not a hypothetical: a first
// attempt reset the login by DELETing the row and letting the normal
// first-run seeding branch recreate it. That failed in production shape
// (not just in theory) with a Postgres foreign key violation, because
// audit_log.user_id references users.id and any account with real login
// history cannot be deleted without deleting that history too. Caught only
// because it was tried against a local database before ever touching
// Railway. The fix was to UPDATE password_hash in place instead, which has
// no such constraint and preserves the account's id and audit trail.
//
// These tests pin the fix, not just the happy path: an UPDATE-shaped reset
// must survive an account with real audit history, and it must not be
// reachable by anything short of the exact flag plus both passwords.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const bcrypt = require('bcrypt');

const DB_AVAILABLE = !!process.env.DATABASE_URL;
const SEED_SCRIPT = path.join(__dirname, '..', 'db', 'seed.js');

function runSeed(extraEnv) {
  return execFileSync('node', [SEED_SCRIPT], {
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8'
  });
}

describe('RESET_USER_PASSWORDS (db/seed.js)', { skip: DB_AVAILABLE ? false : 'set DATABASE_URL to run' }, () => {
  const db = require('../db/pool');

  test('setup: seed normally first, so nat/tom exist with a known baseline', () => {
    const out = runSeed({ NAT_PASSWORD: 'baseline-nat-pw', TOM_PASSWORD: 'baseline-tom-pw' });
    assert.match(out, /Seed complete\./);
  });

  test('an UPDATE-shaped reset works even when the account has real audit history', async () => {
    // Reproduce the exact condition that broke the DELETE-based first
    // attempt: give tom's account a row in audit_log before resetting.
    const { rows } = await db.query(`SELECT id FROM users WHERE username = 'tom'`);
    const tomId = rows[0].id;
    await db.query(
      `INSERT INTO audit_log (user_id, action, detail, created_at) VALUES ($1, 'login', 'test fixture', NOW())`,
      [tomId]
    );

    // This must not throw. The DELETE-based version threw exactly here,
    // with Postgres error 23503 (foreign key violation).
    const out = runSeed({ RESET_USER_PASSWORDS: 'true', NAT_PASSWORD: 'fresh-nat-pw', TOM_PASSWORD: 'fresh-tom-pw' });
    assert.match(out, /RESET_USER_PASSWORDS=true: nat password reset\./);
    assert.match(out, /RESET_USER_PASSWORDS=true: tom password reset\./);

    // The account itself, and its audit history, must be untouched: same
    // id, and the login row inserted above must still exist.
    const { rows: after } = await db.query(`SELECT id FROM users WHERE username = 'tom'`);
    assert.equal(after[0].id, tomId, 'resetting the password must not change the account id');

    const { rows: auditRows } = await db.query(`SELECT id FROM audit_log WHERE user_id = $1`, [tomId]);
    assert.ok(auditRows.length >= 1, 'existing audit history must survive the reset');
  });

  test('the new password actually authenticates against the stored hash', async () => {
    const { rows } = await db.query(`SELECT password_hash FROM users WHERE username = 'tom'`);
    const matches = await bcrypt.compare('fresh-tom-pw', rows[0].password_hash);
    assert.equal(matches, true);

    const oldStillWorks = await bcrypt.compare('baseline-tom-pw', rows[0].password_hash);
    assert.equal(oldStillWorks, false, 'the old password must no longer work after a reset');
  });

  test('the flag alone, without both passwords, refuses rather than silently skipping', () => {
    assert.throws(
      () => runSeed({ RESET_USER_PASSWORDS: 'true', NAT_PASSWORD: 'only-one-set' }),
      /NAT_PASSWORD and TOM_PASSWORD to also be set/,
      'a half-configured reset must fail loudly, not run with an undefined password'
    );
  });

  test('an unset or non-"true" flag is a complete no-op on the existing passwords', async () => {
    const { rows: before } = await db.query(`SELECT password_hash FROM users WHERE username = 'tom'`);

    // Neither of these should touch anything: the flag is absent, and then
    // present but not the exact string 'true'.
    runSeed({});
    runSeed({ RESET_USER_PASSWORDS: 'false' });

    const { rows: after } = await db.query(`SELECT password_hash FROM users WHERE username = 'tom'`);
    assert.equal(after[0].password_hash, before[0].password_hash);
  });

  test('cleanup: restore a clean baseline password so this test is repeatable', () => {
    runSeed({ RESET_USER_PASSWORDS: 'true', NAT_PASSWORD: 'baseline-nat-pw', TOM_PASSWORD: 'baseline-tom-pw' });
  });
});
