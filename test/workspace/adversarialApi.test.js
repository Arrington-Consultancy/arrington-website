// Adversarial checks against a RUNNING workspace, over real HTTP.
//
// The unit tests prove the permission functions. This proves the
// SURFACE: that every route actually routes through them, that a
// logged-in user who is not Tom cannot reach anything, and that a
// denial does not leak the existence or size of what it withheld.
//
// Skips unless WORKSPACE_TEST_BASE_URL is set, so a bare `npm test`
// does not need a server. Start the app with the workspace enabled and
// pass the URL to run it for real.
const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.WORKSPACE_TEST_BASE_URL;
const TOM_PASSWORD = process.env.WORKSPACE_TEST_TOM_PASSWORD;
const OTHER_USER = process.env.WORKSPACE_TEST_OTHER_USER || 'nat';
const OTHER_PASSWORD = process.env.WORKSPACE_TEST_OTHER_PASSWORD;

const PAGES = [
  '/workspace', '/workspace/chat', '/workspace/brain', '/workspace/opportunities',
  '/workspace/projects', '/workspace/contacts', '/workspace/social',
  '/workspace/workforce', '/workspace/approvals', '/workspace/gaps', '/workspace/activity'
];
const APIS = [
  ['/api/workspace/ask', { question: 'what is the current position' }],
  ['/api/workspace/contacts/sync', {}],
  ['/api/workspace/contacts/1/erase', { confirmEmail: 'x@y.test', reason: 'probe' }],
  ['/api/workspace/gaps/1/resolve', { note: 'probe', sourceCorrected: true }],
  ['/api/workspace/approvals/1/decide', { decision: 'approved' }],
  ['/api/workspace/social/request-action', { platform: 'linkedin', action: 'publish', summary: 'probe' }]
];

// A tiny cookie-jar fetch, so a session can be carried between calls.
function makeClient() {
  const jar = new Map();
  return {
    cookieHeader: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    async go(path, { method = 'GET', body = null, headers = {} } = {}) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(jar.size ? { Cookie: this.cookieHeader() } : {}),
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      });
      (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach((c) => {
        const [pair] = c.split(';');
        const idx = pair.indexOf('=');
        jar.set(pair.slice(0, idx), pair.slice(idx + 1));
      });
      return res;
    },
    async login(username, password) {
      const page = await this.go('/login');
      const html = await page.text();
      const token = (html.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      const res = await fetch(`${BASE}/login`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: this.cookieHeader() },
        body: new URLSearchParams({ username, password, _csrf: token }).toString()
      });
      (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach((c) => {
        const [pair] = c.split(';');
        const idx = pair.indexOf('=');
        jar.set(pair.slice(0, idx), pair.slice(idx + 1));
      });
      return res;
    }
  };
}

const configured = !!(BASE && TOM_PASSWORD);
test('adversarial workspace checks', { skip: configured ? false : 'set WORKSPACE_TEST_BASE_URL and WORKSPACE_TEST_TOM_PASSWORD to run' }, async (t) => {
  await t.test('an anonymous visitor reaches no workspace page', async () => {
    const anon = makeClient();
    for (const path of PAGES) {
      const res = await anon.go(path);
      assert.ok([302, 404].includes(res.status), `${path} returned ${res.status} to an anonymous visitor`);
      if (res.status === 302) {
        assert.match(res.headers.get('location') || '', /^\/login/, `${path} redirected somewhere other than login`);
      }
    }
  });

  await t.test('an anonymous visitor reaches no workspace API', async () => {
    const anon = makeClient();
    for (const [path, body] of APIS) {
      const res = await anon.go(path, { method: 'POST', body });
      assert.ok(res.status >= 400, `${path} returned ${res.status} to an anonymous POST`);
      assert.ok(res.status !== 200, `${path} answered an anonymous POST`);
    }
  });

  await t.test('a logged-in site admin who is not Tom sees nothing, and is told nothing', async (tt) => {
    if (!OTHER_PASSWORD) return tt.skip('set WORKSPACE_TEST_OTHER_PASSWORD');
    const other = makeClient();
    await other.login(OTHER_USER, OTHER_PASSWORD);
    // Confirm the session is genuinely authenticated on the main site.
    const home = await other.go('/');
    assert.equal(home.status, 200);
    for (const path of PAGES) {
      const res = await other.go(path);
      assert.equal(res.status, 404, `${path} did not 404 for a non-workspace user`);
      const body = await res.text();
      // A denial must not describe what it is denying.
      assert.doesNotMatch(body, /Company Brain|Opportunities|contact record|Arrington AI Workspace/i,
        `${path} leaked workspace content in its 404`);
    }
    for (const [path, payload] of APIS) {
      const res = await other.go(path, { method: 'POST', body: payload });
      assert.ok([403, 404].includes(res.status), `${path} returned ${res.status} to a non-workspace user`);
      const text = await res.text();
      assert.doesNotMatch(text, /\d+ (contact|record)/i, `${path} leaked a count in its denial`);
    }
  });

  await t.test('Tom reaches every page, and every one is noindex', async () => {
    const tom = makeClient();
    await tom.login('tom', TOM_PASSWORD);
    for (const path of PAGES) {
      const res = await tom.go(path);
      assert.equal(res.status, 200, `${path} returned ${res.status} for Tom`);
      assert.match(res.headers.get('x-robots-tag') || '', /noindex/,
        `${path} is missing the noindex header`);
    }
  });

  await t.test('erasure refuses a mismatched confirmation even for Tom', async () => {
    const tom = makeClient();
    await tom.login('tom', TOM_PASSWORD);
    const page = await tom.go('/workspace/contacts');
    const html = await page.text();
    const token = (html.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
    const idMatch = html.match(/contacts\?id=(\d+)/);
    if (!idMatch) return; // nothing to erase in this environment
    const res = await tom.go(`/api/workspace/contacts/${idMatch[1]}/erase`, {
      method: 'POST',
      headers: { 'x-csrf-token': token },
      body: { confirmEmail: 'definitely-not-this-person@example.test', reason: 'adversarial probe' }
    });
    assert.equal(res.status, 400, 'a mismatched confirmation must be refused');
    const data = await res.json();
    assert.match(data.error, /does not match/);
  });
});
