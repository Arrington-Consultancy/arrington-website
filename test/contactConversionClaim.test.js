// Fix brief of 12/10/2026, item 5: the Contact conversion token is single
// use. The first render of /thank-you?c=<token> claims the token's id in
// contact_conversion_claims and only that render carries the conversion
// snippet (Google Ads, Meta Lead and Microsoft contact_form_submit all sit
// inside it). A replay in any browser or session counts nothing, and a
// database failure counts nothing rather than counting twice.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { issueToken, verifyToken, claimToken } = require('../lib/contactConversion');

const root = path.join(__dirname, '..');

// A database double that behaves like the primary key does.
function fakeDb({ fail = false } = {}) {
  const claimed = new Set();
  const calls = [];
  return {
    calls,
    async query(text, params) {
      calls.push(text.replace(/\s+/g, ' ').trim());
      if (fail) throw new Error('database unavailable');
      if (/^INSERT INTO contact_conversion_claims/.test(text)) {
        if (claimed.has(params[0])) return { rows: [] };
        claimed.add(params[0]);
        return { rows: [{ token_id: params[0] }] };
      }
      return { rows: [] };
    }
  };
}

test('the first claim of an id wins, every later one loses', async () => {
  const db = fakeDb();
  const { id } = verifyToken(issueToken());
  assert.strictEqual(await claimToken(id, db), true);
  assert.strictEqual(await claimToken(id, db), false);
  assert.strictEqual(await claimToken(id, db), false);
});

test('a database failure claims nothing, so nothing fires', async () => {
  const { id } = verifyToken(issueToken());
  assert.strictEqual(await claimToken(id, fakeDb({ fail: true })), false);
});

test('an invalid id never reaches the database', async () => {
  const db = fakeDb();
  for (const bad of [undefined, null, '', 'short', 'x'.repeat(40), "a'; DROP TABLE leads;--", 42]) {
    assert.strictEqual(await claimToken(bad, db), false, String(bad));
  }
  assert.strictEqual(db.calls.length, 0);
});

// The route, with its database and site-shell helpers replaced so it runs
// without Postgres, and res.render reporting what the view would get.
async function withThankYouRoute(db, fn) {
  const stub = (rel, exports) => {
    require.cache[require.resolve(rel)] = { id: rel, filename: rel, loaded: true, exports };
  };
  stub('../db/pool', db);
  stub('../lib/navShell', { getSiteShellData: async () => ({ navPages: [], content: {}, pageContact: {} }) });
  delete require.cache[require.resolve('../routes/thankYou')];
  const express = require('express');
  const app = express();
  app.use((req, res, next) => {
    res.render = (view, locals) => res.json({ view, conversion: locals.conversion });
    next();
  });
  require('../routes/thankYou').mountPageRoute(app, () => 'csrf');
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test('/thank-you: the first showing of a token fires, a replay does not', async () => {
  await withThankYouRoute(fakeDb(), async (base) => {
    const token = issueToken();
    const { id } = verifyToken(token);
    const first = await (await fetch(`${base}/thank-you?c=${token}`)).json();
    assert.deepStrictEqual(first.conversion, { id });
    // The same link again: another tab, another browser, a new session.
    const replay = await (await fetch(`${base}/thank-you?c=${token}`)).json();
    assert.strictEqual(replay.conversion, null);
    const bare = await (await fetch(`${base}/thank-you`)).json();
    assert.strictEqual(bare.conversion, null);
  });
});

test('/thank-you: a HEAD request never uses a token up', async () => {
  await withThankYouRoute(fakeDb(), async (base) => {
    const token = issueToken();
    const head = await fetch(`${base}/thank-you?c=${token}`, { method: 'HEAD' });
    assert.strictEqual(head.status, 200);
    const first = await (await fetch(`${base}/thank-you?c=${token}`)).json();
    assert.ok(first.conversion, 'the real visit after a HEAD still counts once');
  });
});

test('/thank-you: if the claim cannot be made, the page shows and nothing fires', async () => {
  const db = fakeDb();
  const failing = {
    query: (text, params) => (/contact_conversion_claims/.test(text)
      ? Promise.reject(new Error('database unavailable'))
      : db.query(text, params))
  };
  await withThankYouRoute(failing, async (base) => {
    const res = await fetch(`${base}/thank-you?c=${issueToken()}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).conversion, null);
  });
});

test('the claim table is created by the schema, keyed on the token id', () => {
  const schema = fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS contact_conversion_claims \(\s*token_id VARCHAR\(32\) PRIMARY KEY/);
});

// Against real Postgres: twenty renders racing on one token land exactly one
// claim, which is the property the primary key is there to give.
test('twenty concurrent claims of one token: exactly one wins', { skip: !process.env.DATABASE_URL && 'set DATABASE_URL to run against Postgres' }, async () => {
  delete require.cache[require.resolve('../db/pool')];
  const db = require('../db/pool');
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS contact_conversion_claims (
      token_id VARCHAR(32) PRIMARY KEY, claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const { id } = verifyToken(issueToken());
    const results = await Promise.all(Array.from({ length: 20 }, () => claimToken(id, db)));
    assert.strictEqual(results.filter(Boolean).length, 1);
    await db.query('DELETE FROM contact_conversion_claims WHERE token_id = $1', [id]);
  } finally {
    await db.pool.end();
  }
});
