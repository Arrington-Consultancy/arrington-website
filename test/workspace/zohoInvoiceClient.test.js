// Verification for the Zoho Invoice (EU) client. Zoho's hosts are not
// reachable from the build sandbox and no credential belongs in a test,
// so `fetch` is stubbed and every contract the client makes with Zoho is
// asserted from what it SENDS: URL, method, headers, body, and what it
// does with the reply. The live check (a real token, a real invoice
// list) is Tom's, after the Railway variables are set.

const test = require('node:test');
const assert = require('node:assert/strict');

const client = require('../../lib/workspace/finance/zohoInvoiceClient');
const registry = require('../../lib/workspace/finance/registry');

const ENV_KEYS = ['ZOHO_INVOICE_CLIENT_ID', 'ZOHO_INVOICE_CLIENT_SECRET', 'ZOHO_INVOICE_REFRESH_TOKEN'];
const FAKE = {
  ZOHO_INVOICE_CLIENT_ID: 'test-client-id-1000.ABC',
  ZOHO_INVOICE_CLIENT_SECRET: 'test-client-secret-xyz',
  ZOHO_INVOICE_REFRESH_TOKEN: 'test-refresh-token-rrr'
};

function withEnv(values, fn) {
  const saved = {};
  ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  Object.assign(process.env, values);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      ENV_KEYS.forEach((k) => {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
      });
    });
}

// Records every call and answers from a queue of {status, json} replies.
function stubFetch(replies) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const reply = replies.shift() || { status: 200, json: {} };
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      statusText: reply.statusText || '',
      json: async () => reply.json
    };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test.beforeEach(() => client.clearTokenCache());

test('fixed EU endpoints, fixed canonical redirect URI, read-only scopes only', () => {
  assert.equal(client.CANONICAL_REDIRECT_URI, 'https://www.arringtonconsultancy.com/workspace/finance/zoho/callback');
  assert.deepEqual(client.READ_SCOPES, ['ZohoInvoice.invoices.READ', 'ZohoInvoice.customerpayments.READ', 'ZohoInvoice.contacts.READ']);
  client.READ_SCOPES.forEach((s) => assert.match(s, /\.READ$/));
  assert.deepEqual(registry.PROVIDERS.zoho_invoice.readScopes, client.READ_SCOPES,
    'the registry must declare exactly the scopes the client requests');
});

test('authorize URL goes to accounts.zoho.eu with offline access, the exact redirect URI and the state', async () => {
  await withEnv(FAKE, () => {
    const url = new URL(client.buildAuthorizeUrl('state-123'));
    assert.equal(url.origin + url.pathname, 'https://accounts.zoho.eu/oauth/v2/auth');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('client_id'), FAKE.ZOHO_INVOICE_CLIENT_ID);
    assert.equal(url.searchParams.get('redirect_uri'), client.CANONICAL_REDIRECT_URI);
    assert.equal(url.searchParams.get('scope'), client.READ_SCOPES.join(','));
    assert.equal(url.searchParams.get('access_type'), 'offline', 'offline is what makes Zoho issue a refresh token');
    assert.equal(url.searchParams.get('state'), 'state-123');
    assert.equal(url.searchParams.has('client_secret'), false, 'the secret never travels in a browser URL');
  });
});

test('code exchange is a form POST to accounts.zoho.eu carrying client_id and client_secret in the body, not Basic auth', async () => {
  const f = stubFetch([{ status: 200, json: { access_token: 'acc', refresh_token: 'ref', expires_in: 3600 } }]);
  try {
    await withEnv(FAKE, async () => {
      const tokens = await client.exchangeCodeForTokens('the-code');
      assert.equal(tokens.refresh_token, 'ref');
      assert.equal(f.calls.length, 1);
      const { url, init } = f.calls[0];
      assert.equal(url, 'https://accounts.zoho.eu/oauth/v2/token');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.equal(init.headers.Authorization, undefined, 'Zoho is not Xero: no Basic header');
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.equal(body.get('code'), 'the-code');
      assert.equal(body.get('client_id'), FAKE.ZOHO_INVOICE_CLIENT_ID);
      assert.equal(body.get('client_secret'), FAKE.ZOHO_INVOICE_CLIENT_SECRET);
      assert.equal(body.get('redirect_uri'), client.CANONICAL_REDIRECT_URI);
    });
  } finally { f.restore(); }
});

test('getAccessToken refuses to run without ZOHO_INVOICE_REFRESH_TOKEN and makes no network call', async () => {
  const f = stubFetch([]);
  try {
    await withEnv({ ZOHO_INVOICE_CLIENT_ID: 'a', ZOHO_INVOICE_CLIENT_SECRET: 'b' }, async () => {
      await assert.rejects(() => client.getAccessToken(), /ZOHO_INVOICE_REFRESH_TOKEN is not set/);
      assert.equal(f.calls.length, 0);
    });
  } finally { f.restore(); }
});

test('getAccessToken refreshes once, caches, and deduplicates concurrent callers', async () => {
  const f = stubFetch([{ status: 200, json: { access_token: 'acc-1', expires_in: 3600 } }]);
  try {
    await withEnv(FAKE, async () => {
      const [a, b, c] = await Promise.all([client.getAccessToken(), client.getAccessToken(), client.getAccessToken()]);
      assert.deepEqual([a, b, c], ['acc-1', 'acc-1', 'acc-1']);
      assert.equal(f.calls.length, 1, 'three concurrent callers share one refresh');
      const body = new URLSearchParams(f.calls[0].init.body);
      assert.equal(body.get('grant_type'), 'refresh_token');
      assert.equal(body.get('refresh_token'), FAKE.ZOHO_INVOICE_REFRESH_TOKEN);
      assert.equal(await client.getAccessToken(), 'acc-1');
      assert.equal(f.calls.length, 1, 'a later call inside the expiry window hits the cache');
    });
  } finally { f.restore(); }
});

test('a token within 60 seconds of expiry is refreshed rather than reused', async () => {
  const f = stubFetch([
    { status: 200, json: { access_token: 'short', expires_in: 30 } },
    { status: 200, json: { access_token: 'fresh', expires_in: 3600 } }
  ]);
  try {
    await withEnv(FAKE, async () => {
      assert.equal(await client.getAccessToken(), 'short');
      assert.equal(await client.getAccessToken(), 'fresh', 'a 30-second token is already inside the early-refresh buffer');
      assert.equal(f.calls.length, 2);
    });
  } finally { f.restore(); }
});

test('clearTokenCache forces the next call to refresh', async () => {
  const f = stubFetch([
    { status: 200, json: { access_token: 'one', expires_in: 3600 } },
    { status: 200, json: { access_token: 'two', expires_in: 3600 } }
  ]);
  try {
    await withEnv(FAKE, async () => {
      assert.equal(await client.getAccessToken(), 'one');
      client.clearTokenCache();
      assert.equal(await client.getAccessToken(), 'two');
    });
  } finally { f.restore(); }
});

test('a failed refresh does not poison the cache: the next caller tries again', async () => {
  const f = stubFetch([
    { status: 400, json: { error: 'invalid_code' } },
    { status: 200, json: { access_token: 'ok', expires_in: 3600 } }
  ]);
  try {
    await withEnv(FAKE, async () => {
      await assert.rejects(() => client.getAccessToken(), /Zoho token request failed \(400\): invalid_code/);
      assert.equal(await client.getAccessToken(), 'ok');
    });
  } finally { f.restore(); }
});

test('token errors never carry the client secret or refresh token', async () => {
  const f = stubFetch([{ status: 401, json: { error: 'invalid_client' } }]);
  try {
    await withEnv(FAKE, async () => {
      let message = '';
      try { await client.getAccessToken(); } catch (e) { message = e.message; }
      assert.ok(message.length > 0);
      assert.doesNotMatch(message, new RegExp(FAKE.ZOHO_INVOICE_CLIENT_SECRET));
      assert.doesNotMatch(message, new RegExp(FAKE.ZOHO_INVOICE_REFRESH_TOKEN));
    });
  } finally { f.restore(); }
});

test('API reads go to invoice.zoho.eu/api/v3 with the Zoho-oauthtoken header and the EU organisation id', async () => {
  const f = stubFetch([
    { status: 200, json: { invoices: [{ invoice_number: 'INV-1' }] } },
    { status: 200, json: { customerpayments: [{ payment_id: 'P1' }] } },
    { status: 200, json: { contacts: [{ contact_id: 'C1' }] } }
  ]);
  try {
    const invoices = await client.getInvoices('tok', { status: 'unpaid' });
    const payments = await client.getPayments('tok', { page: 2 });
    const contacts = await client.getContacts('tok');
    assert.deepEqual(invoices, [{ invoice_number: 'INV-1' }]);
    assert.deepEqual(payments, [{ payment_id: 'P1' }]);
    assert.deepEqual(contacts, [{ contact_id: 'C1' }]);

    const [inv, pay, con] = f.calls.map((c) => new URL(c.url));
    assert.equal(inv.origin + inv.pathname, 'https://www.zohoapis.eu/invoice/v3/invoices');
    assert.equal(inv.searchParams.get('status'), 'unpaid');
    assert.equal(inv.searchParams.get('per_page'), '200');
    assert.equal(pay.origin + pay.pathname, 'https://www.zohoapis.eu/invoice/v3/customerpayments');
    assert.equal(pay.searchParams.get('page'), '2');
    assert.equal(con.origin + con.pathname, 'https://www.zohoapis.eu/invoice/v3/contacts');

    f.calls.forEach(({ init, url }) => {
      // organization_id is required on every request as a query parameter.
      assert.equal(new URL(url).searchParams.get('organization_id'), '20119226503');
      assert.equal(init.method, undefined, 'every call is a GET: this client can only read');
      assert.equal(init.headers.Authorization, 'Zoho-oauthtoken tok');
      assert.equal(init.headers['X-com-zoho-invoice-organizationid'], '20119226503');
      assert.equal(init.body, undefined);
    });
  } finally { f.restore(); }
});

test('status "all" sends no status filter, and a missing collection in the reply is an empty list, not a crash', async () => {
  const f = stubFetch([{ status: 200, json: { code: 0, message: 'success' } }]);
  try {
    const invoices = await client.getInvoices('tok');
    assert.deepEqual(invoices, []);
    assert.equal(new URL(f.calls[0].url).searchParams.has('status'), false);
  } finally { f.restore(); }
});

test('an API error surfaces Zoho\'s message and status, and never the access token', async () => {
  const f = stubFetch([{ status: 401, json: { code: 57, message: 'You are not authorized to perform this operation' } }]);
  try {
    await assert.rejects(() => client.getInvoices('secret-access-token'), (err) => {
      assert.match(err.message, /\/invoices failed \(401\): You are not authorized/);
      assert.doesNotMatch(err.message, /secret-access-token/);
      return true;
    });
  } finally { f.restore(); }
});

test('the client exposes no write, create, update, delete or send function', () => {
  const surface = Object.keys(client);
  const writing = surface.filter((k) => /^(create|update|delete|send|pay|record|mark|void|write|email)/i.test(k));
  assert.deepEqual(writing, [], `these look like they could change Zoho data: ${writing.join(', ')}`);
});

test('the registry\'s Zoho credentialEnv is exactly the three variables the client reads', () => {
  assert.deepEqual(registry.PROVIDERS.zoho_invoice.credentialEnv, ENV_KEYS);
  const src = require('fs').readFileSync(require.resolve('../../lib/workspace/finance/zohoInvoiceClient'), 'utf8');
  const read = [...src.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(read)].sort(), [...ENV_KEYS].sort(), 'the client reads no environment variable the registry does not declare');
});
