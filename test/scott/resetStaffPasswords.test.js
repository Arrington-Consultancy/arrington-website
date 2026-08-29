// RESET_SCOTT_STAFF_PASSWORDS: the escape hatch for a real staging
// failure, not a hypothetical one.
//
// The eight fictional staff rows are seeded once, on the first deploy that
// finds the table short. On staging that happened during an earlier
// deploy, with a randomly generated password printed once to a deploy log
// that was subsequently rotated away. Setting SCOTT_DEMO_STAFF_PASSWORD
// afterwards changed nothing at all, because the insert path only runs
// when rows are missing, and it logged the reassuring line "fictional
// staff logins already present, skipping" while nobody could actually sign
// in as any of them.
//
// Same UPDATE-in-place shape as RESET_USER_PASSWORDS, and for the same
// reason: a DELETE-and-reseed would change row ids, and rows referenced
// elsewhere must not be recreated to change a password.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const bcrypt = require('bcrypt');

const DB_AVAILABLE = !!process.env.DATABASE_URL;
const SEED_SCRIPT = path.join(__dirname, '..', '..', 'db', 'seed.js');

function runSeed(extraEnv) {
  return execFileSync('node', [SEED_SCRIPT], { env: { ...process.env, ...extraEnv }, encoding: 'utf8' });
}

describe('RESET_SCOTT_STAFF_PASSWORDS (db/seed.js)', { skip: DB_AVAILABLE ? false : 'set DATABASE_URL to run' }, () => {
  const db = require('../../db/pool');

  // These tests deliberately rewrite every staff password hash, and they
  // run against whatever DATABASE_URL points at, which in local
  // development is the same database used for manual testing. Without
  // this, running the suite silently locked every fictional login out of
  // the local portal, which is a confusing thing to hit ten minutes later
  // while testing something unrelated.
  let originalHashes = [];

  before(async () => {
    const { rows } = await db.query('SELECT id, password_hash FROM scott_portal_users ORDER BY id');
    originalHashes = rows;
  });

  after(async () => {
    for (const row of originalHashes) {
      await db.query('UPDATE scott_portal_users SET password_hash = $1 WHERE id = $2', [row.password_hash, row.id]);
    }
  });

  test('reproduces the staging condition: rows present, so a new password is ignored', () => {
    const out = runSeed({ SCOTT_DEMO_STAFF_PASSWORD: 'ignored-because-rows-exist' });
    assert.match(out, /fictional staff logins already present, skipping/);
  });

  test('the reset actually changes the stored hash, and ids are preserved', async () => {
    const before = await db.query('SELECT id, username, password_hash FROM scott_portal_users ORDER BY username');
    assert.equal(before.rows.length, 8, 'expected all eight fictional staff to exist');

    const out = runSeed({ RESET_SCOTT_STAFF_PASSWORDS: 'true', SCOTT_DEMO_STAFF_PASSWORD: 'a-known-test-password' });
    assert.match(out, /RESET_SCOTT_STAFF_PASSWORDS=true: 8 fictional staff password\(s\) reset/);

    const after = await db.query('SELECT id, username, password_hash FROM scott_portal_users ORDER BY username');
    assert.deepEqual(after.rows.map((r) => r.id), before.rows.map((r) => r.id),
      'row ids must be preserved: this is an UPDATE, not a delete and reseed');

    // Every account must authenticate with the new password, and none with
    // the old hash. Checked with bcrypt against the stored hash rather
    // than by trusting the log line.
    for (const row of after.rows) {
      assert.equal(await bcrypt.compare('a-known-test-password', row.password_hash), true,
        `${row.username} must authenticate with the reset password`);
    }
  });

  test('refuses loudly when the flag is set but no password is supplied', () => {
    // The refusal is a console.warn, so it lands on stderr, not stdout.
    // Reading stdout alone made this test fail while the code was correct,
    // which is worth keeping in mind: a version of this test that only
    // asserted "no reset happened" would have passed on a silent no-op
    // too, and a silent no-op is the failure mode being guarded against.
    const r = spawnSync('node', [SEED_SCRIPT], {
      env: { ...process.env, RESET_SCOTT_STAFF_PASSWORDS: 'true', SCOTT_DEMO_STAFF_PASSWORD: '' },
      encoding: 'utf8'
    });
    const out = `${r.stdout}${r.stderr}`;
    // Must not silently no-op, and must not reset to an empty password.
    assert.match(out, /nothing to reset the passwords to|No change made/);
    assert.doesNotMatch(out, /password\(s\) reset/);
  });

  test('an absent or non-exact flag is a complete no-op', async () => {
    const before = await db.query('SELECT password_hash FROM scott_portal_users ORDER BY username');
    // 'TRUE' is not 'true'. A stray or copied variable must not fire this.
    const out = runSeed({ RESET_SCOTT_STAFF_PASSWORDS: 'TRUE', SCOTT_DEMO_STAFF_PASSWORD: 'should-not-be-applied' });
    assert.doesNotMatch(out, /password\(s\) reset/);
    const after = await db.query('SELECT password_hash FROM scott_portal_users ORDER BY username');
    assert.deepEqual(after.rows, before.rows, 'hashes must be untouched');
  });
});
