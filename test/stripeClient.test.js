const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const MODULE_PATH = '../lib/stripeClient';

function loadStripeClientWithEnv(env) {
  const oldEnv = { ...process.env };
  for (const key of ['STRIPE_SECRET_KEY', 'ENABLE_STRIPE_LIVE_MODE', 'RAILWAY_ENVIRONMENT', 'NODE_ENV']) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  delete require.cache[require.resolve(MODULE_PATH)];
  const loaded = require(MODULE_PATH);
  process.env = oldEnv;
  delete require.cache[require.resolve(MODULE_PATH)];
  return loaded;
}

describe('Stripe client initialisation gate', () => {
  test('initialises with a test secret key by default', () => {
    const stripe = loadStripeClientWithEnv({ STRIPE_SECRET_KEY: 'sk_test_123' });
    assert.equal(stripe.getStripeKeyStatus(), 'ok');
    assert.ok(stripe.getStripeClient());
  });

  test('initialises with a test restricted key by default', () => {
    const stripe = loadStripeClientWithEnv({ STRIPE_SECRET_KEY: 'rk_test_123' });
    assert.equal(stripe.getStripeKeyStatus(), 'ok');
    assert.ok(stripe.getStripeClient());
  });

  test('refuses a live key unless live mode is explicitly enabled', () => {
    const stripe = loadStripeClientWithEnv({ STRIPE_SECRET_KEY: 'sk_live_123' });
    assert.equal(stripe.getStripeKeyStatus(), 'live_key_refused');
    assert.equal(stripe.getStripeClient(), null);
  });

  test('initialises with a live restricted key when live mode is explicitly enabled', () => {
    const stripe = loadStripeClientWithEnv({
      STRIPE_SECRET_KEY: 'rk_live_123',
      ENABLE_STRIPE_LIVE_MODE: 'true'
    });
    assert.equal(stripe.getStripeKeyStatus(), 'ok');
    assert.ok(stripe.getStripeClient());
  });

  test('refuses malformed keys', () => {
    const stripe = loadStripeClientWithEnv({ STRIPE_SECRET_KEY: 'not_a_stripe_key' });
    assert.equal(stripe.getStripeKeyStatus(), 'invalid_key_prefix');
    assert.equal(stripe.getStripeClient(), null);
  });
});
