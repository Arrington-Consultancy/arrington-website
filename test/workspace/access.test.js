// The two gates in front of the workspace, both of which must fail
// closed. Verified live against a running server as well (an admin who
// is not Tom gets 404, every page carries the noindex header), but
// pinned here so a later edit cannot quietly open either one.
const test = require('node:test');
const assert = require('node:assert/strict');

const access = require('../../lib/workspace/access');

// Governance finding F1, Tom's decision of 31/08/2026: access now needs
// three things, not two, and two of them are deployment variables. The
// tests set all three so that a failure means a real regression, and
// there are dedicated cases below for each one being absent.
const OWNER_ID = 7;
const TOM = { id: OWNER_ID, username: 'tom', role: 'content' };
const ENV_KEYS = [
  'ENABLE_ARRINGTON_AI_WORKSPACE',
  'WORKSPACE_OWNER_USERNAME',
  'WORKSPACE_OWNER_USER_ID',
  'WORKSPACE_ACCESS_PASSPHRASE'
];
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
test.beforeEach(() => {
  process.env.ENABLE_ARRINGTON_AI_WORKSPACE = 'true';
  process.env.WORKSPACE_OWNER_USERNAME = 'tom';
  process.env.WORKSPACE_OWNER_USER_ID = String(OWNER_ID);
  process.env.WORKSPACE_ACCESS_PASSPHRASE = 'a-long-enough-test-passphrase';
});
test.after(() => {
  ENV_KEYS.forEach((k) => {
    if (ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL[k];
  });
});

test('Tom is the only real human with access', () => {
  assert.equal(access.hasWorkspaceAccess(TOM), true);
  assert.equal(access.hasWorkspaceAccess({ ...TOM, role: 'admin' }), true);
  assert.equal(access.hasWorkspaceAccess({ id: 2, username: 'nat', role: 'admin' }), false,
    'a site admin who is not Tom is still not a workspace user');
  assert.equal(access.hasWorkspaceAccess({ id: 3, username: 'aclient', role: 'client' }), false);
  assert.equal(access.hasWorkspaceAccess(null), false);
});

test('a downgraded role loses access even while the clearance entry exists', () => {
  assert.equal(access.hasWorkspaceAccess({ ...TOM, role: 'client' }), false);
});

// F1, the user-id leg. The attack this closes is deleting the cleared
// account and creating a new one under the same name: the username would
// match while the person behind it had changed.
test('a different user id under the cleared username gets nothing', () => {
  assert.equal(access.hasWorkspaceAccess({ ...TOM, id: OWNER_ID + 1 }), false,
    'a recreated account reusing the cleared username inherited its clearance');
  assert.equal(access.hasWorkspaceAccess({ username: 'tom', role: 'admin' }), false,
    'a session carrying no user id was cleared anyway');
});

test('without the deployment binding nobody has access, including Tom', () => {
  delete process.env.WORKSPACE_OWNER_USERNAME;
  assert.equal(access.hasWorkspaceAccess(TOM), false, 'an unset owner username fell back to the old rule');
  process.env.WORKSPACE_OWNER_USERNAME = 'tom';
  delete process.env.WORKSPACE_OWNER_USER_ID;
  assert.equal(access.hasWorkspaceAccess(TOM), false, 'an unset owner id fell back to the old rule');
});

test('the binding must name a username the code actually clears', () => {
  process.env.WORKSPACE_OWNER_USERNAME = 'nat';
  process.env.WORKSPACE_OWNER_USER_ID = '2';
  assert.equal(access.hasWorkspaceAccess({ id: 2, username: 'nat', role: 'admin' }), false,
    'naming an uncleared username in Railway granted it clearance');
});

test('without the enable flag the workspace does not exist for anyone, including Tom', () => {
  delete process.env.ENABLE_ARRINGTON_AI_WORKSPACE;
  assert.equal(access.workspaceEnabled(), false);
  assert.equal(access.hasWorkspaceAccess({ username: 'tom', role: 'admin' }), false);
  process.env.ENABLE_ARRINGTON_AI_WORKSPACE = 'yes';
  assert.equal(access.workspaceEnabled(), false, "only the exact string 'true' enables it");
});

// A denial goes through the site's own 404 renderer (lib/render404), so
// these fakes answer the two things that renderer asks of a request: what
// it accepts, and where to render. Nothing here reaches a database,
// because a non-HTML request short-circuits to JSON before the queries.
function fakePageRes(sink) {
  return {
    status(c) { sink.status = c; return this; },
    render(v) { sink.rendered = v; return this; },
    json(b) { sink.json = b; return this; },
    redirect(url) { sink.redirected = url; return this; },
    // Finding G1 moved the noindex header out of a pre-guard middleware
    // and into the guards' success paths, so these fakes have to record
    // headers. That is deliberate: the header is now part of the access
    // decision and the tests should see it.
    setHeader(k, v) { (sink.headers = sink.headers || {})[k] = v; return this; }
  };
}
function fakeReq(session, originalUrl = '/workspace/brain') {
  return { session, originalUrl, path: originalUrl, accepts: () => false };
}

// A session that has both the identity and the unlock. Built through the
// real unlock recorder rather than by hand, so a change to the unlock's
// shape breaks these tests instead of silently passing them.
function unlockedReq(user, originalUrl = '/workspace/brain') {
  const req = fakeReq({ user }, originalUrl);
  access.unlock.recordUnlock(req);
  return req;
}

test('an unauthorised page request 404s rather than admitting the area exists', async () => {
  const sink = {};
  await access.requireWorkspacePageAccess(
    fakeReq({ user: { id: 2, username: 'nat', role: 'admin' } }), fakePageRes(sink), () => { sink.rendered = 'NEXT'; }
  );
  assert.equal(sink.status, 404);
  assert.equal(sink.rendered, undefined, 'the guard called next() on an unauthorised request');
  assert.equal(sink.redirected, undefined);
});

// Governance finding F2 (30/08/2026): this test used to REQUIRE the login
// redirect, which is what made the leak look like intended behaviour. A
// 302 to /login confirms to an unauthenticated scanner that
// /workspace/brain is a real route, and echoes the path back in the
// redirect target. The workspace's own rule is that its existence is
// operating information, so an anonymous request now gets the same 404 as
// a logged-in one who is not cleared.
test('an anonymous page request 404s too, and is never redirected to a login page', async () => {
  const sink = {};
  await access.requireWorkspacePageAccess(fakeReq({}), fakePageRes(sink), () => { sink.rendered = 'NEXT'; });
  assert.equal(sink.status, 404);
  assert.equal(sink.redirected, undefined, 'an anonymous visitor was told where to log in');
  assert.equal(sink.rendered, undefined);
});

test('the API answers 404 to both the anonymous and the uncleared caller, telling neither apart', async () => {
  const codes = [];
  const bodies = [];
  const mkRes = () => ({ status(c) { codes.push(c); return this; }, json(b) { bodies.push(b); return this; }, render(v) { bodies.push(v); return this; } });
  await access.requireWorkspaceApiAccess(fakeReq({}), mkRes(), () => codes.push('NEXT'));
  await access.requireWorkspaceApiAccess(fakeReq({ user: { id: 2, username: 'nat', role: 'admin' } }), mkRes(), () => codes.push('NEXT'));
  assert.deepEqual(codes, [404, 404]);
  // A 401 body saying "not signed in" would confirm the endpoint exists
  // just as loudly as the status code did.
  bodies.forEach((b) => assert.doesNotMatch(JSON.stringify(b), /sign|log ?in|auth/i));
  assert.deepEqual(bodies[0], bodies[1], 'the two denials are distinguishable by body');
});

test('a cleared and unlocked request carries its clearance forward for the route to filter with', () => {
  const req = unlockedReq({ ...TOM, role: 'admin' });
  let called = false;
  access.requireWorkspaceApiAccess(req, fakePageRes({}), () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.workspaceClearance, 'owner_admin');
});

// F1, the leg that actually closes the finding. After an admin resets
// Tom's password the attacker holds the right username AND the right
// user id, so the two bindings above see nothing wrong. The passphrase
// is the only thing that can tell them apart.
test('a cleared but locked session reaches no workspace API at all', async () => {
  const sink = {};
  await access.requireWorkspaceApiAccess(fakeReq({ user: TOM }), fakePageRes(sink), () => { sink.rendered = 'NEXT'; });
  assert.equal(sink.status, 404, 'a locked session reached an API');
  assert.equal(sink.rendered, undefined);
});

test('a cleared but locked page request is sent to the unlock screen and nowhere else', () => {
  const sink = {};
  access.requireWorkspacePageAccess(fakeReq({ user: TOM }), fakePageRes(sink), () => { sink.rendered = 'NEXT'; });
  assert.equal(sink.redirected, '/workspace/unlock');
  assert.equal(sink.rendered, undefined, 'a locked session was allowed through to a page');
});

test('the unlock screen itself is the one path a locked session may reach', () => {
  const sink = {};
  access.requireWorkspacePageAccess(fakeReq({ user: TOM }, '/workspace/unlock'), fakePageRes(sink), () => { sink.rendered = 'NEXT'; });
  assert.equal(sink.rendered, 'NEXT');
  assert.equal(sink.redirected, undefined, 'the unlock screen redirected to itself');
});

test('an uncleared user does not get the unlock screen, because that would admit the area exists', () => {
  const sink = {};
  access.requireWorkspacePageAccess(
    fakeReq({ user: { id: 2, username: 'nat', role: 'admin' } }, '/workspace/unlock'),
    fakePageRes(sink), () => { sink.rendered = 'NEXT'; }
  );
  assert.equal(sink.status, 404);
  assert.equal(sink.redirected, undefined);
  assert.equal(sink.rendered, undefined);
});

// Governance finding G1 (31/08/2026), HIGH. This used to call a
// middleware that ran BEFORE the access guard, so it stamped the header
// on denials too and let an anonymous scanner enumerate the workspace
// with the enable flag OFF. The header is now set only after access is
// granted, and these two cases pin both halves of that: it arrives for a
// served response, and it is ABSENT from every denial.
test('the noindex header is set on a response the workspace actually serves', () => {
  const sink = {};
  access.requireWorkspaceApiAccess(unlockedReq({ ...TOM, role: 'admin' }), fakePageRes(sink), () => {});
  assert.equal((sink.headers || {})['X-Robots-Tag'], 'noindex, nofollow');
});

test('no denial carries a workspace-specific header, whatever the reason for it', async () => {
  // An uncleared user, an anonymous visitor, and the flag being off.
  // None of them may produce a header a missing page would not have.
  const uncleared = {};
  await access.requireWorkspacePageAccess(
    fakeReq({ user: { id: 2, username: 'nat', role: 'admin' } }), fakePageRes(uncleared), () => {}
  );
  assert.equal(uncleared.headers, undefined, 'an uncleared denial carried a workspace header');

  const anon = {};
  await access.requireWorkspacePageAccess(fakeReq({}), fakePageRes(anon), () => {});
  assert.equal(anon.headers, undefined, 'an anonymous denial carried a workspace header');

  delete process.env.ENABLE_ARRINGTON_AI_WORKSPACE;
  const flagOff = {};
  await access.requireWorkspacePageAccess(fakeReq({ user: TOM }), fakePageRes(flagOff), () => {});
  assert.equal(flagOff.headers, undefined,
    'with the flag OFF a workspace path still carried a header a missing page does not: merging would not be inert');
});
