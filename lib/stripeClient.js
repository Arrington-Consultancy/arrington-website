// Thin Stripe SDK wrapper. Returns null when STRIPE_SECRET_KEY isn't set so
// every call site fails safely (a clear "payments not configured" response)
// rather than crashing the process or throwing an unhandled error on a
// public route. Same "required in production, optional locally, fails
// closed rather than open" shape as lib/turnstile.js elsewhere in this repo.
//
// TEST MODE ONLY: nothing in this codebase should ever be pointed at a live
// secret key (sk_live_...). STRIPE_SECRET_KEY is expected to be a test key
// (sk_test_...) for the whole lifetime of this branch.
const Stripe = require('stripe');

const isProd = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';

let client = null;
if (process.env.STRIPE_SECRET_KEY) {
  if (process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
    // Refuse to instantiate against a live key from this branch under any
    // circumstance — this build has not been through a real Stripe
    // test-mode round trip (see routes/whereToStart.js), so a live key
    // here would be the first time this code has ever touched real money.
    console.error('STRIPE_SECRET_KEY looks like a live key (sk_live_...). Refusing to initialise Stripe on this branch — test keys only.');
  } else {
    client = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }
} else if (isProd) {
  console.warn('STRIPE_SECRET_KEY is not set — Where to Start checkout will report "payments not yet configured" until it is.');
}

function getStripeClient() {
  return client;
}

module.exports = { getStripeClient };
