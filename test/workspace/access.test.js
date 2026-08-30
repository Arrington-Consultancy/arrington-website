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

test('an unauthorised page request 404s rather than admitting the area exists', () => {
  let status = null; let rendered = null;
  const res = { status(c) { status = c; return this; }, render(v) { rendered = v; }, redirect() { rendered = 'redirect'; } };
  access.requireWorkspacePageAccess({ session: { user: { username: 'nat', role: 'admin' } } }, res, () => { rendered = 'NEXT'; });
  assert.equal(status, 404);
  assert.equal(rendered, '404');
});

test('an anonymous page request is sent to login carrying where it was going', () => {
  let redirected = null;
  const res = { redirect(url) { redirected = url; } };
  access.requireWorkspacePageAccess({ session: {}, originalUrl: '/workspace/brain' }, res, () => {});
  assert.equal(redirected, '/login?next=%2Fworkspace%2Fbrain');
});

test('the API distinguishes not signed in from not permitted, and never 403s with detail', () => {
  const codes = [];
  const mkRes = () => ({ status(c) { codes.push(c); return this; }, json() {} });
  access.requireWorkspaceApiAccess({ session: {} }, mkRes(), () => codes.push('NEXT'));
  access.requireWorkspaceApiAccess({ session: { user: { username: 'nat', role: 'admin' } } }, mkRes(), () => codes.push('NEXT'));
  assert.deepEqual(codes, [401, 404]);
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
