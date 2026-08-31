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

// A failed login and a genuine denial both look like "no workspace" from
// the outside. Repeated runs against one server hit the site's own login
// limiter (5 per 15 minutes per IP) and every later assertion then fails
// for the wrong reason, which costs a release decision. So each block
// that logs in proves the session first, on a page that has nothing to
// do with the workspace.
async function assertLoggedIn(client, username) {
  const res = await client.go('/login');
  assert.equal(res.status, 302,
    `${username} is not authenticated: /login returned ${res.status} instead of redirecting an existing session. `
    + 'If this is a repeat run, the login rate limiter is the likely cause; restart the server and try again.');
}

const configured = !!(BASE && TOM_PASSWORD);
test('adversarial workspace checks', { skip: configured ? false : 'set WORKSPACE_TEST_BASE_URL and WORKSPACE_TEST_TOM_PASSWORD to run' }, async (t) => {
  // Governance finding F2 (30/08/2026): this assertion used to accept a
  // 302 to /login as well as a 404, which is exactly the leak it was
  // meant to catch. A redirect to a login page confirms that
  // /workspace/contacts is a real route worth logging in for, and the
  // workspace's own rule is that its existence is operating information.
  // Only a 404 passes now, and it must be the same 404 the site gives
  // for a path that was never there. Per-request nonces are normalised
  // out before comparing, since those differ on every response.
  const stripNonces = (html) => html.replace(/nonce="[^"]*"/g, 'nonce="X"');

  await t.test('an anonymous visitor gets an ordinary 404, not a login redirect', async () => {
    const anon = makeClient();
    const control = await anon.go('/definitely-not-a-real-page-9f3c');
    assert.equal(control.status, 404, 'the control path did not 404');
    const controlBody = stripNonces(await control.text());
    for (const path of PAGES) {
      const res = await anon.go(path);
      assert.equal(res.status, 404, `${path} returned ${res.status} to an anonymous visitor`);
      assert.equal(stripNonces(await res.text()), controlBody,
        `${path} produced a 404 distinguishable from a genuinely missing page`);
    }
  });

  await t.test('an anonymous workspace API call looks like a call to a route that does not exist', async () => {
    const anon = makeClient();
    const control = await anon.go('/api/definitely-not-a-real-endpoint-9f3c', { method: 'POST', body: {} });
    const controlBody = await control.text();
    for (const [path, body] of APIS) {
      const res = await anon.go(path, { method: 'POST', body });
      assert.ok(res.status !== 200, `${path} answered an anonymous POST`);
      assert.equal(res.status, control.status,
        `${path} returned ${res.status} where a non-existent endpoint returns ${control.status}`);
      const text = await res.text();
      assert.equal(text, controlBody, `${path} denial differs from a non-existent endpoint's`);
      assert.doesNotMatch(text, /workspace/i, `${path} named the workspace in its denial`);
    }
  });

  await t.test('a logged-in site admin who is not Tom sees nothing, and is told nothing', async (tt) => {
    if (!OTHER_PASSWORD) return tt.skip('set WORKSPACE_TEST_OTHER_PASSWORD');
    const other = makeClient();
    await other.login(OTHER_USER, OTHER_PASSWORD);
    // Confirm the session is genuinely authenticated, not merely able to
    // fetch a public page: an anonymous client gets 200 on '/' too, so
    // that check proved nothing about the login.
    await assertLoggedIn(other, OTHER_USER);
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
    await assertLoggedIn(tom, 'tom');
    for (const path of PAGES) {
      const res = await tom.go(path);
      assert.equal(res.status, 200, `${path} returned ${res.status} for Tom`);
      assert.match(res.headers.get('x-robots-tag') || '', /noindex/,
        `${path} is missing the noindex header`);
    }
  });

  // The reviewer noted on 30/08/2026 that this check used to `return`
  // when the environment held no contact, so it could report a pass
  // having asserted nothing. It now skips loudly instead: a permanent
  // deletion control that is silently untested is exactly the thing that
  // should be visible in the output.
  await t.test('erasure refuses a mismatched confirmation even for Tom', async (tt) => {
    const tom = makeClient();
    await tom.login('tom', TOM_PASSWORD);
    await assertLoggedIn(tom, 'tom');
    const page = await tom.go('/workspace/contacts');
    const html = await page.text();
    const token = (html.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
    const idMatch = html.match(/contacts\?id=(\d+)/);
    if (!idMatch) {
      return tt.skip('NOT EXECUTABLE: no contact exists in this environment, so the erasure refusal was not exercised');
    }
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
