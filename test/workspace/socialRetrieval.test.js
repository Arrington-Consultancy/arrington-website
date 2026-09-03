// The social retrieval half, added 03/09/2026.
//
// Until then the social area had a registry, a schema, a page and a
// permission model, and no code that called an API at all: the token
// variable names appeared only in a list of what was required, and
// nothing read their values. A correctly pasted credential produced an
// empty page forever.
//
// This sandbox has no route to Meta, so the live call is unproven and
// stays that way until the first real sync. What IS proven here is
// every behaviour that does not need Meta: what gets requested, where
// the token is put, what happens to each kind of failure, and what
// reaches the database.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const meta = require('../../lib/workspace/social/metaClient');
const registry = require('../../lib/workspace/social/registry');

const TOKEN = 'EAAGtestTokenValueThatIsLongEnoughToLookReal123456';
const PAGE_ID = '123456789012345';
const IG_ID = '17841400000000000';

// Captures what the client asked for, and replies with whatever the
// test scripts. Nothing here reaches the network.
function stubFetch(handler) {
  const calls = [];
  meta.__setFetchForTests(async (url, opts) => {
    calls.push({ url, opts });
    const r = await handler(url, opts, calls.length);
    return {
      ok: r.ok !== false,
      status: r.status || 200,
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body || {}))
    };
  });
  return calls;
}

function ok(body) { return { ok: true, status: 200, body }; }

test.afterEach(() => meta.__resetFetchForTests());

// ---- the token must never reach a URL ------------------------------

test('the access token is sent as a header and never in the query string', async () => {
  const calls = stubFetch(() => ok({ id: PAGE_ID, name: 'Arrington', followers_count: 12 }));
  await meta.fetchPageProfile({ pageId: PAGE_ID, token: TOKEN });
  const { url, opts } = calls[0];
  assert.ok(!url.includes(TOKEN), 'the token was put in the URL, where it would be logged');
  assert.ok(!/access_token=/.test(url), 'an access_token query parameter was used');
  assert.equal(opts.headers.Authorization, `Bearer ${TOKEN}`);
});

test('a failing request never returns the token in its message', async () => {
  // Meta echoes plenty back on an auth failure. Anything token-shaped
  // must be stripped, because this message is stored in last_error and
  // rendered on the Social page.
  stubFetch(() => ({
    ok: false,
    status: 400,
    body: { error: { message: `Error validating access token: ${TOKEN} has expired`, code: 190, type: 'OAuthException' } }
  }));
  await assert.rejects(
    () => meta.fetchPageProfile({ pageId: PAGE_ID, token: TOKEN }),
    (err) => {
      assert.ok(!err.message.includes(TOKEN), `the token survived into the error: ${err.message}`);
      assert.match(err.message, /Error validating access token/, 'the useful part of the message was lost');
      assert.equal(err.code, 190);
      return true;
    }
  );
});

test('redactSecrets removes token shapes it was not told about', () => {
  const unknown = 'ZZZ' + 'q1w2e3r4t5y6u7i8o9p0'.repeat(3);
  const out = meta.redactSecrets(`failed for ${unknown}`);
  assert.ok(!out.includes(unknown), 'only known prefixes were redacted, so the next format leaks');
});

// ---- read only, structurally ---------------------------------------

test('only allowlisted read endpoints can be requested', async () => {
  stubFetch(() => ok({}));
  await assert.rejects(
    () => meta.graphGet('page_publish', `${PAGE_ID}/feed`, { token: TOKEN }),
    /not on the read allowlist/
  );
});

test('every request is a GET', async () => {
  const calls = stubFetch(() => ok({ id: PAGE_ID, name: 'A' }));
  await meta.fetchPageProfile({ pageId: PAGE_ID, token: TOKEN });
  await meta.fetchPagePosts({ pageId: PAGE_ID, token: TOKEN });
  for (const c of calls) assert.equal(c.opts.method, 'GET');
});

test('no declared read scope is a write scope in disguise', () => {
  // Mirrors the registry's own rule. instagram_manage_insights is Meta's
  // read-only metrics scope and is the single justified exception.
  const justified = new Set(['instagram_manage_insights']);
  for (const id of registry.PLATFORM_IDS) {
    for (const scope of registry.PLATFORMS[id].readScopes) {
      if (justified.has(scope)) continue;
      assert.doesNotMatch(scope, /manage|publish|delete|write|comment/i,
        `${id} declares a write-shaped scope: ${scope}`);
    }
  }
});

// ---- input handling -------------------------------------------------

test('a non-numeric account id is refused before it becomes a request', async () => {
  const calls = stubFetch(() => ok({}));
  // The paste error this actually catches: the @handle instead of the id.
  await assert.rejects(
    () => meta.fetchInstagramProfile({ accountId: '@arringtonconsultancy', token: TOKEN }),
    /numeric id/
  );
  assert.equal(calls.length, 0, 'a bad id still reached the network');
});

test('a missing token is refused before it becomes a request', async () => {
  const calls = stubFetch(() => ok({}));
  await assert.rejects(() => meta.fetchPageProfile({ pageId: PAGE_ID, token: '' }), /no access token/);
  assert.equal(calls.length, 0);
});

// ---- parsing --------------------------------------------------------

test('a page profile falls back to fan_count only when followers_count is absent', async () => {
  stubFetch(() => ok({ id: PAGE_ID, name: 'Arrington Consultancy', fan_count: 87 }));
  const p = await meta.fetchPageProfile({ pageId: PAGE_ID, token: TOKEN });
  assert.equal(p.followers, 87);
  assert.equal(p.displayName, 'Arrington Consultancy');
});

test('posts with no message or metrics still land, with unknown rather than zero', async () => {
  // A photo post has no message. Recording it as an empty string is
  // right; recording its missing metrics as 0 would be a fabrication.
  stubFetch(() => ok({ data: [{ id: '123_456', created_time: '2026-09-01T10:00:00+0000' }] }));
  const posts = await meta.fetchPagePosts({ pageId: PAGE_ID, token: TOKEN });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body, '');
  assert.equal(posts[0].impressions, null);
  assert.equal(posts[0].engagements, null);
});

test('an item with no id is dropped rather than written without a key', async () => {
  stubFetch(() => ok({ data: [{ message: 'orphan' }, { id: '1_2', message: 'real' }] }));
  const posts = await meta.fetchPagePosts({ pageId: PAGE_ID, token: TOKEN });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].externalId, '1_2');
});

test('an empty data array is a valid answer, not an error', async () => {
  // A brand new Page genuinely has no posts. That must read as zero
  // items retrieved, not as a failed sync.
  stubFetch(() => ok({ data: [] }));
  const posts = await meta.fetchPagePosts({ pageId: PAGE_ID, token: TOKEN });
  assert.deepEqual(posts, []);
});

test('a non-JSON reply is reported as such rather than throwing a parse error', async () => {
  stubFetch(() => ({ ok: false, status: 502, body: '<html>Bad Gateway</html>' }));
  await assert.rejects(() => meta.fetchPageProfile({ pageId: PAGE_ID, token: TOKEN }), /not JSON/);
});

test('instagram media maps likes to engagements and keeps comments separate', async () => {
  stubFetch(() => ok({ data: [{ id: 'ig1', caption: 'hello', like_count: 4, comments_count: 2, timestamp: '2026-09-01T10:00:00+0000' }] }));
  const media = await meta.fetchInstagramMedia({ accountId: IG_ID, token: TOKEN });
  assert.equal(media[0].engagements, 4);
  assert.equal(media[0].commentsCount, 2);
});

// ---------------------------------------------------------------
// The sync layer: what actually gets recorded.
//
// These need a database, because the property under test is what
// reaches workspace_social_accounts, not what a function returns.
// ---------------------------------------------------------------

const sync = require('../../lib/workspace/social/sync');
const repo = require('../../lib/workspace/social/repo');

const CONFIGURED = {
  FACEBOOK_PAGE_ID: PAGE_ID,
  FACEBOOK_PAGE_ACCESS_TOKEN: TOKEN,
  INSTAGRAM_BUSINESS_ACCOUNT_ID: IG_ID,
  INSTAGRAM_ACCESS_TOKEN: TOKEN
};

const dbAvailable = !!process.env.DATABASE_URL;
const needsDb = { skip: dbAvailable ? false : 'set DATABASE_URL to exercise the sync layer' };

async function stateOf(platform) {
  const states = await repo.accountStates(CONFIGURED);
  return states.find((s) => s.platform === platform);
}

test('an unconfigured platform is skipped, and no attempt is recorded', needsDb, async () => {
  // The distinction the whole area rests on: nothing was attempted, so
  // this is not a failed sync and must not be shown as one.
  const before = await repo.recentSyncRuns(1);
  const result = await sync.syncPlatform('facebook', {});
  assert.equal(result.outcome, 'skipped');
  const after = await repo.recentSyncRuns(1);
  assert.deepEqual(after.map((r) => r.id), before.map((r) => r.id),
    'a sync run was opened for a platform with no credentials');
});

test('a bad token is recorded as a failed attempt, with the reason and no secret', needsDb, async () => {
  stubFetch(() => ({
    ok: false, status: 400,
    body: { error: { message: `Error validating access token: ${TOKEN} is invalid`, code: 190, type: 'OAuthException' } }
  }));
  const result = await sync.syncPlatform('facebook', CONFIGURED);
  assert.equal(result.outcome, 'failed');
  const state = await stateOf('facebook');
  assert.equal(state.freshness.state, 'sync_failed');
  assert.match(state.lastError, /Error validating access token/);
  assert.ok(!state.lastError.includes(TOKEN), 'the token was written into the database');
});

test('a good profile with failing posts is partial, never ok', needsDb, async () => {
  // The case that would otherwise date-stamp data nobody refreshed.
  stubFetch((url) => {
    if (/\/posts/.test(url)) return { ok: false, status: 500, body: { error: { message: 'temporary failure' } } };
    return ok({ id: PAGE_ID, name: 'Arrington', followers_count: 20 });
  });
  const result = await sync.syncPlatform('facebook', CONFIGURED);
  assert.equal(result.outcome, 'partial');
  const state = await stateOf('facebook');
  assert.equal(state.freshness.state, 'partial');
  assert.match(state.lastError, /temporary failure/);
});

test('a clean run is ok, records the profile, and writes the posts', needsDb, async () => {
  const unique = `${PAGE_ID}_${Date.now()}`;
  stubFetch((url) => {
    if (/\/comments/.test(url)) return ok({ data: [] });
    if (/\/posts/.test(url)) return ok({ data: [{ id: unique, message: 'a post', created_time: '2026-09-01T10:00:00+0000' }] });
    return ok({ id: PAGE_ID, name: 'Arrington Consultancy', followers_count: 42 });
  });
  const result = await sync.syncPlatform('facebook', CONFIGURED);
  assert.equal(result.outcome, 'ok', result.detail);
  const state = await stateOf('facebook');
  assert.equal(state.freshness.state, 'fresh');
  assert.equal(state.followers, 42);
  assert.equal(state.lastError, '');
  const posts = await repo.listPosts({ platform: 'facebook', limit: 100 });
  assert.ok(posts.some((p) => p.external_id === unique), 'the retrieved post was not stored');
});

test('syncing twice updates rather than duplicating', needsDb, async () => {
  // "Sync now" is a button a person will press twice.
  const unique = `${PAGE_ID}_9${Date.now()}`;
  stubFetch((url) => {
    if (/\/comments/.test(url)) return ok({ data: [] });
    if (/\/posts/.test(url)) return ok({ data: [{ id: unique, message: 'v2', created_time: '2026-09-01T10:00:00+0000' }] });
    return ok({ id: PAGE_ID, name: 'Arrington', followers_count: 42 });
  });
  await sync.syncPlatform('facebook', CONFIGURED);
  await sync.syncPlatform('facebook', CONFIGURED);
  const posts = await repo.listPosts({ platform: 'facebook', limit: 200 });
  assert.equal(posts.filter((p) => p.external_id === unique).length, 1, 'the second sync duplicated the post');
});

test('instagram comments are never requested, because we hold no scope for them', needsDb, async () => {
  // Governance finding F5: the only Meta scope exposing Instagram
  // comments also confers moderation. Not requesting it is only half
  // the guarantee; not calling the endpoint is the other half.
  const calls = stubFetch((url) => {
    if (/\/media/.test(url)) return ok({ data: [{ id: 'ig_x', caption: 'c', timestamp: '2026-09-01T10:00:00+0000' }] });
    return ok({ id: IG_ID, username: 'arrington', followers_count: 5 });
  });
  await sync.syncPlatform('instagram', CONFIGURED);
  for (const c of calls) {
    assert.doesNotMatch(c.url, /\/comments/, `a comments endpoint was called for Instagram: ${c.url}`);
  }
});

test('syncAll reports every platform, including the ones it skipped', needsDb, async () => {
  stubFetch(() => ({ ok: false, status: 400, body: { error: { message: 'nope' } } }));
  const results = await sync.syncAll({ FACEBOOK_PAGE_ID: PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN: TOKEN });
  const byPlatform = Object.fromEntries(results.map((r) => [r.platform, r.outcome]));
  assert.equal(byPlatform.facebook, 'failed');
  assert.equal(byPlatform.instagram, 'skipped',
    'an unconfigured platform was omitted rather than reported');
});

test('a post id is checked before it is built into a request path', async () => {
  // Found by this suite's own first run: the check rejected an
  // unrealistic id in a fixture. Real Page post ids are
  // {page-id}_{post-id}, both numeric, so the check is right and the
  // fixture was wrong. Pinned in both directions now, because a
  // validator nothing exercises is a validator nobody notices breaking.
  const calls = stubFetch(() => ok({ data: [] }));
  await meta.fetchPostComments({ postId: `${PAGE_ID}_987654321`, token: TOKEN });
  assert.equal(calls.length, 1, 'a genuine post id was rejected');

  for (const bad of ['../../me/accounts', '123/../../me', 'abc_123', '', '1']) {
    await assert.rejects(
      () => meta.fetchPostComments({ postId: bad, token: TOKEN }),
      /not in the expected form/,
      `accepted a post id it should refuse: ${JSON.stringify(bad)}`
    );
  }
  assert.equal(calls.length, 1, 'a refused id still reached the network');
});
