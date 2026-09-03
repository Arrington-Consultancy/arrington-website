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

// ---------------------------------------------------------------
// Failure taxonomy.
//
// "Sync failed" tells an operator nothing they can act on. "The token
// expired" tells them exactly what to do, and is a different action
// from "we are being throttled, wait". Each kind is classified from
// Meta's own error codes and carried through to what gets recorded.
// ---------------------------------------------------------------

function metaError(body, status = 400) { return { ok: false, status, body: { error: body } }; }

test('an expired token is classified as expiry, and is not retryable', async () => {
  stubFetch(() => metaError({ message: 'Error validating access token: Session has expired', code: 190, type: 'OAuthException' }));
  await assert.rejects(() => meta.fetchPageProfile({ pageId: PAGE_ID, token: TOKEN }), (err) => {
    assert.equal(err.kind, meta.ERROR_KINDS.EXPIRED);
    assert.equal(err.retryable, false, 'waiting will not fix an expired token');
    return true;
  });
});

test('a permission the app was not granted is classified as denial, not as a broken sync', async () => {
  stubFetch(() => metaError({ message: '(#200) Requires pages_read_engagement permission', code: 200, type: 'OAuthException' }));
  await assert.rejects(() => meta.fetchPagePosts({ pageId: PAGE_ID, token: TOKEN }), (err) => {
    assert.equal(err.kind, meta.ERROR_KINDS.DENIED);
    assert.equal(err.retryable, false);
    return true;
  });
});

test('throttling is classified as rate limiting, and IS retryable', async () => {
  // The one failure kind where doing nothing but waiting is the correct
  // response, which is why it is distinguished from the others.
  stubFetch(() => metaError({ message: '(#4) Application request limit reached', code: 4 }, 400));
  await assert.rejects(() => meta.fetchPageProfile({ pageId: PAGE_ID, token: TOKEN }), (err) => {
    assert.equal(err.kind, meta.ERROR_KINDS.RATE_LIMITED);
    assert.equal(err.retryable, true);
    return true;
  });
});

test('an HTTP 429 with no body code is still rate limiting', async () => {
  stubFetch(() => ({ ok: false, status: 429, body: {} }));
  await assert.rejects(() => meta.fetchPageProfile({ pageId: PAGE_ID, token: TOKEN }), (err) => {
    assert.equal(err.kind, meta.ERROR_KINDS.RATE_LIMITED);
    return true;
  });
});

test('a malformed reply is classified as malformed rather than guessed at', async () => {
  stubFetch(() => ({ ok: true, status: 200, body: 'not json at all' }));
  await assert.rejects(() => meta.fetchPageProfile({ pageId: PAGE_ID, token: TOKEN }), (err) => {
    assert.equal(err.kind, meta.ERROR_KINDS.MALFORMED);
    return true;
  });
});

test('an unreachable API is its own kind, and is retryable', async () => {
  meta.__setFetchForTests(async () => { throw new Error('fetch failed'); });
  await assert.rejects(() => meta.fetchPageProfile({ pageId: PAGE_ID, token: TOKEN }), (err) => {
    assert.equal(err.kind, meta.ERROR_KINDS.UNREACHABLE);
    assert.equal(err.retryable, true);
    return true;
  });
});

test('insights that come back missing are absent, not zero', async () => {
  // Meta omits a metric it will not serve rather than failing the call.
  // Recording the omission as 0 would be a fabricated measurement.
  stubFetch(() => ok({ data: [{ name: 'page_impressions', values: [{ value: 12 }] }] }));
  const insights = await meta.fetchPageInsights({ pageId: PAGE_ID, token: TOKEN });
  assert.equal(insights.page_impressions, 12);
  assert.equal(insights.page_fans, undefined, 'a metric Meta did not return was invented');
});

test('the page list never returns the per-page access tokens Meta includes', async () => {
  // /me/accounts hands back a live credential per page. Keeping it would
  // put a token somewhere nothing needs one.
  stubFetch(() => ok({ data: [{ id: PAGE_ID, name: 'Arrington', category: 'Consulting', access_token: TOKEN }] }));
  const pages = await meta.fetchPageList({ token: TOKEN });
  assert.equal(pages.length, 1);
  assert.ok(!('access_token' in pages[0]), 'a page access token was carried out of the client');
  assert.ok(!JSON.stringify(pages).includes(TOKEN));
});

// ---------------------------------------------------------------
// Mutations: capable, but not authorised.
// ---------------------------------------------------------------

const mutations = require('../../lib/workspace/social/mutations');

test('with the flag off, nothing can be changed on Meta at all', async () => {
  const calls = stubFetch(() => ok({ id: 'x' }));
  await assert.rejects(
    () => mutations.publishPagePost({ approvalId: 1, message: 'hello', env: { ...CONFIGURED } }),
    /not enabled/
  );
  assert.equal(calls.length, 0, 'a request reached Meta with mutations disabled');
});

test('the mutation gate refuses every unauthorised shape, and allows only the authorised one', () => {
  const on = { ENABLE_SOCIAL_MUTATIONS: 'true' };
  const refuse = [
    ['flag off', {}, { approvalId: 1, status: 'approved', approvedBy: 'tom' }],
    ['no approval at all', on, null],
    ['approval still open', on, { approvalId: 1, status: 'open', approvedBy: 'tom' }],
    ['approval declined', on, { approvalId: 1, status: 'declined', approvedBy: 'tom' }],
    ['nobody named as approver', on, { approvalId: 1, status: 'approved', approvedBy: '' }],
    ['approved by the AI itself', on, { approvalId: 1, status: 'approved', approvedBy: 'workspace_ai' }]
  ];
  for (const [name, env, approval] of refuse) {
    assert.throws(
      () => meta.assertMutationAuthorised('page_publish_post', approval, env),
      undefined,
      `the gate allowed: ${name}`
    );
  }
  assert.ok(meta.assertMutationAuthorised('page_publish_post', { approvalId: 1, status: 'approved', approvedBy: 'tom' }, on),
    'a genuine human approval was refused, so the gate blocks everything and proves nothing');
});

test('an endpoint that is not an approved mutation cannot be called even with a valid approval', () => {
  assert.throws(
    () => meta.assertMutationAuthorised('page_delete_post', { approvalId: 1, status: 'approved', approvedBy: 'tom' }, { ENABLE_SOCIAL_MUTATIONS: 'true' }),
    /not on the mutation allowlist/
  );
});

test('deletion is not on the mutation allowlist at any level', () => {
  // What is absent matters as much as what is present. Hiding a comment
  // is reversible and is offered; deleting one is not offered at all.
  for (const endpoint of meta.MUTATION_ALLOWLIST) {
    assert.doesNotMatch(endpoint, /delete|remove/i, `${endpoint} is a destructive capability`);
  }
});

test('autonomous callers are still refused by construction, unchanged', () => {
  // The mutation path is new; this rule is not, and must not have been
  // relaxed to make room for it.
  const actions = require('../../lib/workspace/social/actions');
  assert.throws(() => actions.assertAutonomousAllowed('facebook', 'publish'), actions.ConsequentialActionError);
  assert.throws(() => actions.assertAutonomousAllowed('facebook', 'reply_publicly'), /consequential external action/);
});

// ---------------------------------------------------------------
// Partial failure, and what the database ends up believing.
// ---------------------------------------------------------------

test('one platform failing does not stop the other, and each reports its own truth', needsDb, async () => {
  // The case that matters when two connectors share one Meta app: an
  // Instagram problem must not present as a Facebook problem.
  stubFetch((url) => {
    if (/\/insights/.test(url)) return ok({ data: [] });
    if (url.includes(IG_ID)) return metaError({ message: 'Instagram account not linked', code: 100 });
    if (/\/comments/.test(url)) return ok({ data: [] });
    if (/\/posts/.test(url)) return ok({ data: [] });
    return ok({ id: PAGE_ID, name: 'Arrington', followers_count: 11 });
  });
  const results = await sync.syncAll(CONFIGURED);
  const byPlatform = Object.fromEntries(results.map((r) => [r.platform, r.outcome]));
  assert.equal(byPlatform.facebook, 'ok', 'a healthy platform was dragged down by the failing one');
  assert.equal(byPlatform.instagram, 'failed');

  const fb = await stateOf('facebook');
  const ig = await stateOf('instagram');
  assert.equal(fb.freshness.state, 'fresh');
  assert.equal(ig.freshness.state, 'sync_failed');
});

test('insights failing alone is partial: the posts are still real, the metrics are not there', needsDb, async () => {
  // read_insights can be granted on the app and still refused for a
  // particular Page. Losing the metrics must not discard the content.
  const unique = `${PAGE_ID}_${Date.now()}9`;
  stubFetch((url) => {
    if (/\/insights/.test(url)) return metaError({ message: '(#200) Insights permission required', code: 200 });
    if (/\/comments/.test(url)) return ok({ data: [] });
    if (/\/posts/.test(url)) return ok({ data: [{ id: unique, message: 'still here', created_time: '2026-09-01T10:00:00+0000' }] });
    return ok({ id: PAGE_ID, name: 'Arrington', followers_count: 11 });
  });
  const result = await sync.syncPlatform('facebook', CONFIGURED);
  assert.equal(result.outcome, 'partial');
  assert.match(result.detail, /insights/);
  const posts = await repo.listPosts({ platform: 'facebook', limit: 200 });
  assert.ok(posts.some((p) => p.external_id === unique), 'the posts were lost because the metrics failed');
});

test('a rate-limited sync records the throttling rather than a vague failure', needsDb, async () => {
  stubFetch(() => metaError({ message: '(#4) Application request limit reached', code: 4 }));
  const result = await sync.syncPlatform('facebook', CONFIGURED);
  assert.equal(result.outcome, 'failed');
  const state = await stateOf('facebook');
  assert.match(state.lastError, /request limit reached/,
    'the operator cannot tell throttling from a broken connector');
});

test('an approval is verified against the database, not against what the caller claims', needsDb, async () => {
  // The property that makes the gate meaningful: a caller cannot assert
  // its own authorisation. It supplies an id, and the row decides.
  const workspaceRepo = require('../../lib/workspace/repo');
  const open = await workspaceRepo.createApproval({
    title: 'probe: publish a post', detail: 'probe', actionClass: 4,
    sensitivity: 'commercial', requestedBy: 'workspace_ai'
  });
  await assert.rejects(
    () => mutations.loadGrantedApproval(open.id),
    /is "open"/,
    'an undecided approval was treated as granted'
  );
  await assert.rejects(() => mutations.loadGrantedApproval(999999999), /does not exist/);
  await assert.rejects(() => mutations.loadGrantedApproval('not-a-number'), /valid approval id/);
});

test('an approval granted by the AI itself is refused at the database level too', needsDb, async () => {
  const workspaceRepo = require('../../lib/workspace/repo');
  const a = await workspaceRepo.createApproval({
    title: 'probe: self-approved', detail: 'probe', actionClass: 4,
    sensitivity: 'commercial', requestedBy: 'workspace_ai'
  });
  await workspaceRepo.decideApproval(a.id, { decision: 'approved', decidedBy: 'workspace_ai', note: 'probe' });
  await assert.rejects(() => mutations.loadGrantedApproval(a.id), /not granted by a person/);
});

test('a human-granted approval loads, so the refusals above are not refusing everything', needsDb, async () => {
  // The positive control. Every test above asserts an absence, and a
  // gate that refuses everything would pass all of them.
  const workspaceRepo = require('../../lib/workspace/repo');
  const a = await workspaceRepo.createApproval({
    title: 'probe: human approved', detail: 'probe', actionClass: 4,
    sensitivity: 'commercial', requestedBy: 'workspace_ai'
  });
  await workspaceRepo.decideApproval(a.id, { decision: 'approved', decidedBy: 'tom', note: 'probe' });
  const row = await mutations.loadGrantedApproval(a.id);
  assert.equal(row.status, 'approved');
  assert.equal(row.decided_by, 'tom');
});

test('an approved action executes once, and the same approval cannot be spent twice', needsDb, async () => {
  // The whole mutation path, end to end, with Meta stubbed: a person
  // approves, the action is carried out, and the approval is then used
  // up. Without the second half an approved row would be a standing
  // licence to repeat the action, which is not what approving it meant.
  const workspaceRepo = require('../../lib/workspace/repo');
  const a = await workspaceRepo.createApproval({
    title: 'probe: publish once', detail: 'probe', actionClass: 4,
    sensitivity: 'commercial', requestedBy: 'workspace_ai'
  });
  await workspaceRepo.decideApproval(a.id, { decision: 'approved', decidedBy: 'tom', note: 'go ahead' });

  const calls = stubFetch(() => ok({ id: `${PAGE_ID}_111` }));
  const env = { ...CONFIGURED, ENABLE_SOCIAL_MUTATIONS: 'true' };

  const first = await mutations.publishPagePost({ approvalId: a.id, message: 'A real post', env });
  assert.equal(first.ok, true);
  assert.equal(first.approvedBy, 'tom');
  assert.equal(calls.length, 1, 'the post was not actually sent');
  assert.equal(calls[0].opts.method, 'POST');
  assert.ok(!calls[0].url.includes(TOKEN), 'the token was put in the mutation URL');
  assert.equal(calls[0].opts.headers.Authorization, `Bearer ${TOKEN}`);

  await assert.rejects(
    () => mutations.publishPagePost({ approvalId: a.id, message: 'A real post', env }),
    /already been carried out/,
    'one approval authorised the same action twice'
  );
  assert.equal(calls.length, 1, 'a second request reached Meta on a spent approval');
});

test('an empty post or reply is refused before it reaches Meta', needsDb, async () => {
  const workspaceRepo = require('../../lib/workspace/repo');
  const a = await workspaceRepo.createApproval({
    title: 'probe: empty', detail: 'probe', actionClass: 4, sensitivity: 'commercial', requestedBy: 'workspace_ai'
  });
  await workspaceRepo.decideApproval(a.id, { decision: 'approved', decidedBy: 'tom', note: 'ok' });
  const calls = stubFetch(() => ok({}));
  const env = { ...CONFIGURED, ENABLE_SOCIAL_MUTATIONS: 'true' };
  await assert.rejects(() => mutations.publishPagePost({ approvalId: a.id, message: '   ', env }), /no message/);
  await assert.rejects(() => mutations.replyToComment({ approvalId: a.id, commentId: `${PAGE_ID}_1`, message: '', env }), /empty reply/);
  await assert.rejects(() => mutations.updatePageMetadata({ approvalId: a.id, fields: { nonsense: 'x' }, env }), /no changeable metadata/);
  assert.equal(calls.length, 0);
});

test('a failed mutation is recorded as failed and does not consume the approval', needsDb, async () => {
  // A network failure must not silently burn the person's decision.
  const workspaceRepo = require('../../lib/workspace/repo');
  const a = await workspaceRepo.createApproval({
    title: 'probe: fails then works', detail: 'probe', actionClass: 4, sensitivity: 'commercial', requestedBy: 'workspace_ai'
  });
  await workspaceRepo.decideApproval(a.id, { decision: 'approved', decidedBy: 'tom', note: 'ok' });
  const env = { ...CONFIGURED, ENABLE_SOCIAL_MUTATIONS: 'true' };

  stubFetch(() => metaError({ message: '(#4) Application request limit reached', code: 4 }));
  await assert.rejects(() => mutations.publishPagePost({ approvalId: a.id, message: 'retry me', env }), /request limit/);

  stubFetch(() => ok({ id: `${PAGE_ID}_222` }));
  const second = await mutations.publishPagePost({ approvalId: a.id, message: 'retry me', env });
  assert.equal(second.ok, true, 'a throttled attempt burned the approval, so the person must approve again');
});
