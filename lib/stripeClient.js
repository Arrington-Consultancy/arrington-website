// Thin Stripe SDK wrapper. Returns null when STRIPE_SECRET_KEY isn't set so
// every call site fails safely (a clear "payments not configured" response)
// rather than crashing the process or throwing an unhandled error on a
// public route. Same "required in production, optional locally, fails
// closed rather than open" shape as lib/turnstile.js elsewhere in this repo.
//
// Live mode is deliberately gated. Test keys work by default; live keys only
// initialise when ENABLE_STRIPE_LIVE_MODE=true is set in the deployment
// environment after the sandbox flow has been proven end to end.
const Stripe = require('stripe');

const isProd = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
const liveModeEnabled = process.env.ENABLE_STRIPE_LIVE_MODE === 'true';
const STRIPE_API_VERSION = '2026-06-24.dahlia';

let client = null;
// Never expose the key itself. This status lets callers report whether Stripe
// is unset, deliberately live-blocked, malformed, or ready.
let keyStatus = 'unset';
if (process.env.STRIPE_SECRET_KEY) {
  const key = process.env.STRIPE_SECRET_KEY;
  const isStripeKey = /^(sk|rk)_(test|live)_/.test(key);
  const isLiveKey = /^(sk|rk)_live_/.test(key);

  if (!isStripeKey) {
    console.error('STRIPE_SECRET_KEY does not look like a valid Stripe secret or restricted key. Refusing to initialise Stripe.');
    keyStatus = 'invalid_key_prefix';
  } else if (isLiveKey && !liveModeEnabled) {
    console.error('STRIPE_SECRET_KEY is a live key but ENABLE_STRIPE_LIVE_MODE is not true. Refusing to initialise Stripe.');
    keyStatus = 'live_key_refused';
  } else {
    client = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
    keyStatus = 'ok';
  }
} else if (isProd) {
  console.warn('STRIPE_SECRET_KEY is not set — Where to Start checkout will report "payments not yet configured" until it is.');
}

function getStripeClient() {
  return client;
}

function getStripeKeyStatus() {
  return keyStatus;
}

module.exports = { getStripeClient, getStripeKeyStatus, STRIPE_API_VERSION };
