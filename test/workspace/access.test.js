// The two gates in front of the workspace, both of which must fail
// closed. Verified live against a running server as well (an admin who
// is not Tom gets 404, every page carries the noindex header), but
// pinned here so a later edit cannot quietly open either one.
const test = require('node:test');
const assert = require('node:assert/strict');

const access = require('../../lib/workspace/access');

const ORIGINAL = process.env.ENABLE_ARRINGTON_AI_WORKSPACE;
test.beforeEach(() => { process.env.ENABLE_ARRINGTON_AI_WORKSPACE = 'true'; });
test.after(() => {
  if (ORIGINAL === undefined) delete process.env.ENABLE_ARRINGTON_AI_WORKSPACE;
  else process.env.ENABLE_ARRINGTON_AI_WORKSPACE = ORIGINAL;
});

test('Tom is the only real human with access', () => {
  assert.equal(access.hasWorkspaceAccess({ username: 'tom', role: 'content' }), true);
  assert.equal(access.hasWorkspaceAccess({ username: 'tom', role: 'admin' }), true);
  assert.equal(access.hasWorkspaceAccess({ username: 'nat', role: 'admin' }), false,
    'a site admin who is not Tom is still not a workspace user');
  assert.equal(access.hasWorkspaceAccess({ username: 'aclient', role: 'client' }), false);
  assert.equal(access.hasWorkspaceAccess(null), false);
});

test('a downgraded role loses access even while the clearance entry exists', () => {
  assert.equal(access.hasWorkspaceAccess({ username: 'tom', role: 'client' }), false);
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
    redirect(url) { sink.redirected = url; return this; }
  };
}
function fakeReq(session, originalUrl = '/workspace/brain') {
  return { session, originalUrl, accepts: () => false };
}

test('an unauthorised page request 404s rather than admitting the area exists', async () => {
  const sink = {};
  await access.requireWorkspacePageAccess(
    fakeReq({ user: { username: 'nat', role: 'admin' } }), fakePageRes(sink), () => { sink.rendered = 'NEXT'; }
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
  await access.requireWorkspaceApiAccess(fakeReq({ user: { username: 'nat', role: 'admin' } }), mkRes(), () => codes.push('NEXT'));
  assert.deepEqual(codes, [404, 404]);
  // A 401 body saying "not signed in" would confirm the endpoint exists
  // just as loudly as the status code did.
  bodies.forEach((b) => assert.doesNotMatch(JSON.stringify(b), /sign|log ?in|auth/i));
  assert.deepEqual(bodies[0], bodies[1], 'the two denials are distinguishable by body');
});

test('a cleared request carries its clearance forward for the route to filter with', () => {
  const req = { session: { user: { username: 'tom', role: 'admin' } } };
  let called = false;
  access.requireWorkspaceApiAccess(req, { status() { return this; }, json() {} }, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.workspaceClearance, 'owner_admin');
});

test('the noindex header is set for every workspace response', () => {
  const headers = {};
  let nexted = false;
  access.workspaceNoindex({}, { setHeader: (k, v) => { headers[k] = v; } }, () => { nexted = true; });
  assert.equal(headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(nexted, true);
});
