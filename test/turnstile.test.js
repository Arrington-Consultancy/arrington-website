// Cloudflare Turnstile verification helper — pure-logic unit tests using a
// stubbed global.fetch. This sandbox has no outbound access to
// challenges.cloudflare.com (confirmed separately against the live proxy),
// so a real network round-trip cannot be exercised here or by manual
// end-to-end testing in this environment; this proves the request/response
// handling is correct against the documented Cloudflare siteverify contract
// instead. Run with `npm test` (node --test).

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('verifyTurnstileToken', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete require.cache[require.resolve('../lib/turnstile')];
  });

  test('missing token is rejected without calling fetch', async () => {
    let fetchCalled = false;
    global.fetch = async () => { fetchCalled = true; throw new Error('should not be called'); };
    const { verifyTurnstileToken } = require('../lib/turnstile');

    const result = await verifyTurnstileToken('', '1.2.3.4');
    assert.equal(result.success, false);
    assert.equal(result.reason, 'missing_token');
    assert.equal(fetchCalled, false);
  });

  test('a Cloudflare success response is treated as verified', async () => {
    global.fetch = async (url, opts) => {
      assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      assert.equal(opts.method, 'POST');
      const bodyStr = opts.body.toString();
      assert.match(bodyStr, /response=some-token/);
      return { ok: true, json: async () => ({ success: true }) };
    };
    const { verifyTurnstileToken } = require('../lib/turnstile');

    const result = await verifyTurnstileToken('some-token', '1.2.3.4');
    assert.equal(result.success, true);
  });

  test('a Cloudflare failure response is rejected with the error codes surfaced', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] })
    });
    const { verifyTurnstileToken } = require('../lib/turnstile');

    const result = await verifyTurnstileToken('bad-token', '1.2.3.4');
    assert.equal(result.success, false);
    assert.equal(result.reason, 'invalid-input-response');
  });

  test('a network failure fails closed rather than throwing', async () => {
    global.fetch = async () => { throw new Error('network down'); };
    const { verifyTurnstileToken } = require('../lib/turnstile');

    const result = await verifyTurnstileToken('some-token', '1.2.3.4');
    assert.equal(result.success, false);
  });

  test('a non-OK HTTP response fails closed', async () => {
    global.fetch = async () => ({ ok: false, status: 503 });
    const { verifyTurnstileToken } = require('../lib/turnstile');

    const result = await verifyTurnstileToken('some-token', '1.2.3.4');
    assert.equal(result.success, false);
    assert.equal(result.reason, 'siteverify_http_503');
  });

  test('a missing secret key fails closed with not_configured', async () => {
    const originalEnv = { ...process.env };
    process.env.RAILWAY_ENVIRONMENT = 'production';
    delete process.env.TURNSTILE_SECRET_KEY;
    delete require.cache[require.resolve('../lib/turnstile')];
    const { verifyTurnstileToken } = require('../lib/turnstile');

    const result = await verifyTurnstileToken('some-token', '1.2.3.4');
    assert.equal(result.success, false);
    assert.equal(result.reason, 'not_configured');

    process.env = originalEnv;
    delete require.cache[require.resolve('../lib/turnstile')];
  });
});
