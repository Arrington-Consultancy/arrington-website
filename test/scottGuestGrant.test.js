'use strict';
// lib/scott/guestGrant.js: the run-until-granted page_access grant for a guest
// viewer (Terrel, 04/11/2026). Needs DATABASE_URL pointing at a seeded
// throwaway database; skipped otherwise and declared in gatedSuites.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const DB_URL = process.env.DATABASE_URL;
const skip = DB_URL ? false : 'set DATABASE_URL to a throwaway database';

test('waits for the account, grants once, audits as Tom, and never grants twice', { skip }, async () => {
  const db = require('../db/pool');
  const { grantScottGuestAccess } = require('../lib/scott/guestGrant');
  const { SCOTT_PAGE_SLUG } = require('../lib/scott/access');
  const user = 'grant-probe-' + Date.now().toString(36);
  const marker = 'scott.test_grant_' + user;
  try {
    // No account yet: nothing written, marker NOT stamped, so a later deploy picks it up.
    let r = await grantScottGuestAccess(db, { username: user, marker, requestedOn: 'test' });
    assert.equal(r.outcome, 'waiting');
    assert.match(r.message, /no such user yet/);
    assert.equal((await db.query('SELECT 1 FROM content WHERE section_key = $1', [marker])).rowCount, 0);

    await db.query("INSERT INTO users (username, password_hash, role) VALUES ($1, 'x', 'client')", [user]);
    const { rows: [{ id: userId }] } = await db.query('SELECT id FROM users WHERE username = $1', [user]);
    const { rows: [{ id: pageId }] } = await db.query('SELECT id FROM pages WHERE slug = $1', [SCOTT_PAGE_SLUG]);

    r = await grantScottGuestAccess(db, { username: user.toUpperCase(), marker, requestedOn: 'test' });
    assert.equal(r.outcome, 'granted', 'the username is lowercased like the login route does');
    assert.equal((await db.query('SELECT 1 FROM page_access WHERE page_id = $1 AND user_id = $2', [pageId, userId])).rowCount, 1);
    const { rows: audit } = await db.query("SELECT u.username FROM audit_log a JOIN users u ON u.id = a.user_id WHERE a.action = 'page_access_update' AND a.detail LIKE $1", [`%'${user}'%`]);
    assert.deepEqual(audit.map((a) => a.username), ['tom'], 'audited as Tom, not as the guest');
    assert.equal((await db.query('SELECT 1 FROM content WHERE section_key = $1', [marker])).rowCount, 1);

    // Tom removes the access later: a redeploy must not put it back.
    await db.query('DELETE FROM page_access WHERE page_id = $1 AND user_id = $2', [pageId, userId]);
    r = await grantScottGuestAccess(db, { username: user, marker, requestedOn: 'test' });
    assert.equal(r.outcome, 'done_before');
    assert.equal((await db.query('SELECT 1 FROM page_access WHERE page_id = $1 AND user_id = $2', [pageId, userId])).rowCount, 0, 'a removed grant stays removed');
  } finally {
    await db.query('DELETE FROM content WHERE section_key = $1', [marker]);
    await db.query('DELETE FROM audit_log WHERE detail LIKE $1', [`%'${user}'%`]);
    await db.query('DELETE FROM users WHERE username = $1', [user]);
    await db.pool.end();
  }
});
