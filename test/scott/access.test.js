// Scott AI Demonstration — access control integration tests. These hit a
// real Postgres database (via db/pool.js, same DATABASE_URL the app itself
// uses), so they only run when DATABASE_URL is set — same guard shape as
// the rest of this repo's `npm test` run, which already requires a
// database for most of its suites. If DATABASE_URL is unset, this whole
// file is skipped rather than failing.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const DB_AVAILABLE = !!process.env.DATABASE_URL;

describe('Scott access control (page_access reuse)', { skip: DB_AVAILABLE ? false : 'set DATABASE_URL to run' }, () => {
  const db = require('../../db/pool');
  const { hasScottAccess, getScottPageId, SCOTT_PAGE_SLUG } = require('../../lib/scott/access');

  let testUserId;

  test('the synthetic Scott page row exists (seeded by db/seed.js)', async () => {
    const pageId = await getScottPageId();
    assert.ok(pageId, `expected a pages row with slug '${SCOTT_PAGE_SLUG}' — run db/seed.js first`);
  });

  test('admin role always has access, with no page_access row required', async () => {
    const allowed = await hasScottAccess({ id: -1, role: 'admin' });
    assert.equal(allowed, true);
  });

  test('content role always has access, with no page_access row required', async () => {
    const allowed = await hasScottAccess({ id: -1, role: 'content' });
    assert.equal(allowed, true);
  });

  test('no user (null) never has access', async () => {
    const allowed = await hasScottAccess(null);
    assert.equal(allowed, false);
  });

  test('a client user with no page_access row is denied', async () => {
    const { rows } = await db.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, 'x', 'client') ON CONFLICT (username) DO UPDATE SET role = 'client' RETURNING id",
      ['scott_test_client_ungranted']
    );
    testUserId = rows[0].id;
    const allowed = await hasScottAccess({ id: testUserId, role: 'client' });
    assert.equal(allowed, false);
  });

  test('a client user granted via page_access (the existing admin Page Access mechanism) is allowed', async () => {
    const pageId = await getScottPageId();
    await db.query('INSERT INTO page_access (page_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [pageId, testUserId]);
    const allowed = await hasScottAccess({ id: testUserId, role: 'client' });
    assert.equal(allowed, true);
  });

  test('cleanup: remove the test client user', async () => {
    await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });
});
