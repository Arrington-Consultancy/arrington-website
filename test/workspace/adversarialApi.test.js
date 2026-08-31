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
// Governance finding F1, Tom's decision of 31/08/2026: reaching a
// workspace page now needs the deployment passphrase as well as the
// login. Without it these checks can only prove the closed half.
const PASSPHRASE = process.env.WORKSPACE_TEST_PASSPHRASE;

const PAGES = [
  '/workspace', '/workspace/chat', '/workspace/brain', '/workspace/opportunities',
  '/workspace/projects', '/workspace/contacts', '/workspace/social',
  '/workspace/workforce', '/workspace/approvals', '/workspace/gaps', '/workspace/activity',
  // Added for G1: the unlock screen is a workspace path like any other
  // and was the one page this list did not probe.
  '/workspace/unlock'
];
const APIS = [
  ['/api/workspace/ask', { question: 'what is the current position' }],
  // Added for G2: these two were the only workspace endpoints never
  // probed, and they were the two answering in a different shape.
  ['/api/workspace/unlock', { passphrase: 'not-the-passphrase' }],
  ['/api/workspace/lock', {}],
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
// Presents the passphrase the way the unlock screen does. Returns the
// HTTP status so a caller can assert on a refusal as well as a success.
async function unlockWorkspace(client, passphrase) {
  const page = await client.go('/workspace/unlock');
  const html = await page.text();
  const token = (html.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
  return client.go('/api/workspace/unlock', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
    body: { passphrase }
  });
}

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

  // Governance finding G1 (31/08/2026), HIGH. The anonymous checks below
  // compared status and body and NOTHING ELSE, so they reported a pass
  // while X-Robots-Tag was being stamped on every workspace denial and
  // on no other 404. One header is as readable as one status code, and
  // it was present with the enable flag OFF, which is production's
  // configuration if this branch merges. Headers are now part of the
  // comparison. Hop-by-hop and per-response headers that legitimately
  // differ between any two requests are excluded by name; everything
  // else must match the control path exactly.
  const VOLATILE_HEADERS = new Set([
    'date', 'content-length', 'etag', 'last-modified', 'set-cookie',
    'keep-alive', 'connection', 'transfer-encoding', 'ratelimit',
    'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset',
    'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'
  ]);
  // Nonces are normalised inside header VALUES as well as in the body:
  // the CSP header carries the same per-request nonce, so comparing it
  // raw would fail on every pair of requests and tell us nothing. The
  // header is compared rather than excluded, because excluding it would
  // blind this check to a genuine CSP difference between a workspace
  // denial and a real 404.
  const stripNoncesInHeader = (v) => String(v).replace(/'nonce-[^']*'/g, "'nonce-X'");
  const headerFingerprint = (res) => [...res.headers.entries()]
    .filter(([k]) => !VOLATILE_HEADERS.has(k.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}: ${stripNoncesInHeader(v)}`)
    .sort()
    .join('\n');

  await t.test('an anonymous visitor gets an ordinary 404, not a login redirect', async () => {
    const anon = makeClient();
    const control = await anon.go('/definitely-not-a-real-page-9f3c');
    assert.equal(control.status, 404, 'the control path did not 404');
    const controlBody = stripNonces(await control.text());
    const controlHeaders = headerFingerprint(control);
    for (const path of PAGES) {
      const res = await anon.go(path);
      assert.equal(res.status, 404, `${path} returned ${res.status} to an anonymous visitor`);
      assert.equal(stripNonces(await res.text()), controlBody,
        `${path} produced a 404 distinguishable from a genuinely missing page`);
      assert.equal(headerFingerprint(res), controlHeaders,
        `${path} produced a 404 whose HEADERS differ from a genuinely missing page (finding G1)`);
    }
  });

  await t.test('an anonymous workspace API call looks like a call to a route that does not exist', async () => {
    const anon = makeClient();
    const control = await anon.go('/api/definitely-not-a-real-endpoint-9f3c', { method: 'POST', body: {} });
    const controlBody = await control.text();
    const controlHeaders = headerFingerprint(control);
    for (const [path, body] of APIS) {
      const res = await anon.go(path, { method: 'POST', body });
      assert.ok(res.status !== 200, `${path} answered an anonymous POST`);
      assert.equal(res.status, control.status,
        `${path} returned ${res.status} where a non-existent endpoint returns ${control.status}`);
      const text = await res.text();
      assert.equal(text, controlBody, `${path} denial differs from a non-existent endpoint's`);
      assert.equal(headerFingerprint(res), controlHeaders,
        `${path} denial has HEADERS a non-existent endpoint does not (finding G1)`);
      assert.doesNotMatch(text, /workspace/i, `${path} named the workspace in its denial`);
    }
  });

  await t.test('every method is refused the same way, not just GET and POST', async () => {
    // Governance finding Q1 (HIGH). Express answers OPTIONS from its own
    // route table BEFORE any route middleware runs, so every real
    // /api/workspace/* endpoint returned 200 with an Allow header while a
    // fabricated sibling returned 404 - anonymously, with the enable flag
    // OFF. A complete map of the area's shape, and it falsified the claim
    // that merging the workspace is inert.
    //
    // It survived nine reviews and this suite reporting 9/9 green on the
    // same server in the same minute, because every probe here sent GET
    // or POST. Testing the methods nobody uses is the whole point: they
    // are the ones no route handles, and therefore the ones the framework
    // answers on your behalf.
    const anon = makeClient();
    const REAL = APIS.map(([path]) => path).concat(['/workspace', '/workspace/today']);
    const FABRICATED = ['/api/workspace/records-9f3c', '/workspace/nowhere-9f3c'];

    for (const method of ['OPTIONS', 'PUT', 'DELETE', 'PATCH']) {
      const control = await anon.go('/definitely-not-a-real-path-9f3c', { method });
      const controlBody = await control.text();
      const controlHeaders = headerFingerprint(control);

      for (const path of REAL.concat(FABRICATED)) {
        const res = await anon.go(path, { method });
        assert.equal(res.status, control.status,
          `${method} ${path} returned ${res.status} where a non-existent path returns ${control.status}`);
        assert.equal(stripNonces(await res.text()), stripNonces(controlBody),
          `${method} ${path} body differs from a non-existent path's`);
        assert.equal(headerFingerprint(res), controlHeaders,
          `${method} ${path} headers differ from a non-existent path's, which is enough to enumerate the area`);
      }
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

  // ONE login as Tom for everything below.
  //
  // It used to be one per block, which meant five login attempts in a
  // run and tripped the site's own limiter (5 per 15 minutes) on the
  // fifth. Every later assertion then failed for a reason that had
  // nothing to do with the workspace, which is exactly the misreading
  // assertLoggedIn exists to catch. The blocks are ordered so the locked
  // checks and the wrong-passphrase check run BEFORE the successful
  // unlock, because after that the session is no longer locked and they
  // would be testing nothing.
  const tom = makeClient();

  await t.test('Tom can authenticate, so every check below means something', async () => {
    await tom.login('tom', TOM_PASSWORD);
    await assertLoggedIn(tom, 'tom');
  });

  // Governance finding F1, the claim being made to Governance, tested
  // over real HTTP against the running application rather than argued:
  // holding the cleared account is not holding the workspace.
  await t.test('a logged-in cleared session reaches nothing until it presents the passphrase', async () => {
    for (const path of PAGES) {
      const res = await tom.go(path);
      if (path === '/workspace/unlock') {
        // The one page a locked session may render: it is how you unlock.
        assert.equal(res.status, 200, 'the unlock screen was not reachable while locked');
        continue;
      }
      assert.equal(res.status, 302, `${path} returned ${res.status} to a locked session`);
      assert.equal(res.headers.get('location'), '/workspace/unlock',
        `${path} sent a locked session somewhere other than the unlock screen`);
    }
    // The APIs make no exception and give no hint: a script must learn
    // nothing it could act on, and the erasure endpoint is in this list.
    //
    // A valid CSRF token is sent deliberately. Without one the site's
    // global CSRF middleware answers 403 before the workspace guard is
    // ever reached, and the check would be testing CSRF rather than the
    // unlock gate. It caught exactly that on 31/08/2026.
    const csrf = ((await (await tom.go('/workspace/unlock')).text())
      .match(/name="csrf-token" content="([^"]+)"/) || [])[1];
    assert.ok(csrf, 'no CSRF token could be read, so the API checks below would only be testing CSRF');
    // The two unlock endpoints are deliberately reachable while locked:
    // they are the way out of being locked, and refusing them would make
    // the workspace unopenable. Everything else must be shut.
    const REACHABLE_WHILE_LOCKED = new Set(['/api/workspace/unlock', '/api/workspace/lock']);
    for (const [path, body] of APIS) {
      if (REACHABLE_WHILE_LOCKED.has(path)) continue;
      const res = await tom.go(path, { method: 'POST', body, headers: { 'x-csrf-token': csrf } });
      assert.equal(res.status, 404, `${path} answered ${res.status} to a locked session`);
      const text = await res.text();
      assert.doesNotMatch(text, /unlock|passphrase/i, `${path} told a locked caller how to get in`);
    }
  });

  await t.test('a wrong passphrase is refused, it is recorded, and the session stays locked', async () => {
    const res = await unlockWorkspace(tom, 'definitely-not-the-passphrase');
    assert.equal(res.status, 401, 'a wrong passphrase was not refused');
    const body = await res.json();
    // The refusal must not describe the real value: no length, no prefix.
    assert.doesNotMatch(JSON.stringify(body), /\d{2,}/, 'the refusal leaked a number that could describe the passphrase');
    const after = await tom.go('/workspace/contacts');
    assert.equal(after.status, 302, 'a refused attempt left the session unlocked');
  });

  await t.test('the right passphrase opens it, and every page is noindex', async (tt) => {
    if (!PASSPHRASE) return tt.skip('NOT EXECUTABLE: set WORKSPACE_TEST_PASSPHRASE; without it Tom cannot unlock');
    const unlocked = await unlockWorkspace(tom, PASSPHRASE);
    assert.equal(unlocked.status, 200, 'the passphrase was refused, so nothing below was exercised');
    for (const path of PAGES) {
      const res = await tom.go(path);
      // An already-unlocked session is sent on from the unlock screen
      // rather than shown a form it does not need.
      const expected = path === '/workspace/unlock' ? 302 : 200;
      assert.equal(res.status, expected, `${path} returned ${res.status} for Tom`);
      assert.match(res.headers.get('x-robots-tag') || '', /noindex/,
        `${path} is missing the noindex header`);
    }
  });

  // The reviewer noted on 30/08/2026 that this check used to `return`
  // when the environment held no contact, so it could report a pass
  // having asserted nothing. It skips loudly instead: a permanent
  // deletion control that is silently untested is exactly the thing that
  // should be visible in the output.
  await t.test('erasure refuses a mismatched confirmation even for Tom', async (tt) => {
    if (!PASSPHRASE) return tt.skip('NOT EXECUTABLE: set WORKSPACE_TEST_PASSPHRASE; without it Tom cannot unlock');
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
