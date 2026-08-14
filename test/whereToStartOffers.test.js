// Pure-logic tests for the Where to Start offer catalogue and Checkout
// Session parameter building. This sandbox has no outbound access to
// api.stripe.com (confirmed separately against the live proxy — see
// routes/whereToStart.js), so a real Stripe API round trip cannot be
// exercised here; these tests prove the request shape is correct against
// the documented Checkout Sessions contract instead. Run with `npm test`
// (node --test).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { OFFERS, getOffer, buildCheckoutSessionParams } = require('../lib/whereToStartOffers');

describe('Where to Start offer catalogue', () => {
  test('the free conversation is never purchasable', () => {
    assert.equal(OFFERS.conversation.purchasable, false);
  });

  test('the Commercial Review is £500 and purchasable', () => {
    assert.equal(OFFERS.commercial_review.pricePence, 50000);
    assert.equal(OFFERS.commercial_review.purchasable, true);
    assert.equal(OFFERS.commercial_review.creditTowards, 'full_commercial_review');
  });

  test('the Commercial Review and Implementation route is £2,500 and credits from the Commercial Review', () => {
    assert.equal(OFFERS.full_commercial_review.pricePence, 250000);
    assert.equal(OFFERS.full_commercial_review.creditFrom, 'commercial_review');
    assert.equal(OFFERS.full_commercial_review.creditAmountPence, 50000);
  });

  test('the Website Build is £999, purchasable, and carries no credit mechanism', () => {
    assert.equal(OFFERS.website_build.pricePence, 99900);
    assert.equal(OFFERS.website_build.purchasable, true);
    assert.equal(OFFERS.website_build.path, '/where-to-start/website-build');
    assert.equal(OFFERS.website_build.creditFrom, undefined);
    assert.equal(OFFERS.website_build.creditTowards, undefined);
  });

  test('the Commercial Review and Website Build package is £3,400 and credits from the Commercial Review', () => {
    assert.equal(OFFERS.full_review_website_build.pricePence, 340000);
    assert.equal(OFFERS.full_review_website_build.purchasable, true);
    assert.equal(OFFERS.full_review_website_build.path, '/where-to-start/full-review-website-build');
    assert.equal(OFFERS.full_review_website_build.creditFrom, 'commercial_review');
    assert.equal(OFFERS.full_review_website_build.creditAmountPence, 50000);
  });

  test('getOffer returns null for an unknown id', () => {
    assert.equal(getOffer('not_a_real_offer'), null);
  });
});

describe('buildCheckoutSessionParams', () => {
  test('builds a single-line-item payment-mode session for a purchasable offer', () => {
    const params = buildCheckoutSessionParams({
      offer: OFFERS.commercial_review,
      email: 'owner@example.com',
      successUrl: 'https://example.com/where-to-start/confirmation?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://example.com/where-to-start/commercial-review'
    });

    assert.equal(params.mode, 'payment');
    assert.equal(params.customer_email, 'owner@example.com');
    assert.equal(params.line_items.length, 1);
    assert.equal(params.line_items[0].price_data.unit_amount, 50000);
    assert.equal(params.line_items[0].price_data.currency, 'gbp');
    assert.equal(params.line_items[0].price_data.product_data.name, 'Commercial Review');
    assert.equal(params.metadata.offer_id, 'commercial_review');
    assert.equal(params.metadata.list_price_pence, '50000');
    assert.equal(params.metadata.credit_applied_pence, '0');
  });

  test('enables invoice_creation so every purchase generates a real Stripe Invoice', () => {
    const params = buildCheckoutSessionParams({
      offer: OFFERS.commercial_review,
      email: 'owner@example.com',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel'
    });
    assert.equal(params.invoice_creation.enabled, true);
  });

  test('builds a £999 session for the Website Build offer with no credit applied', () => {
    const params = buildCheckoutSessionParams({
      offer: OFFERS.website_build,
      email: 'owner@example.com',
      successUrl: 'https://example.com/where-to-start/confirmation?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://example.com/where-to-start/website-build'
    });

    assert.equal(params.line_items[0].price_data.unit_amount, 99900);
    assert.equal(params.line_items[0].price_data.product_data.name, 'Website Build');
    assert.equal(params.metadata.offer_id, 'website_build');
    assert.equal(params.metadata.credit_applied_pence, '0');
  });

  test('builds a £3,400 session for the Commercial Review and Website Build package', () => {
    const params = buildCheckoutSessionParams({
      offer: OFFERS.full_review_website_build,
      email: 'owner@example.com',
      successUrl: 'https://example.com/where-to-start/confirmation?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://example.com/where-to-start/full-review-website-build'
    });

    assert.equal(params.line_items[0].price_data.unit_amount, 340000);
    assert.equal(params.line_items[0].price_data.product_data.name, 'Commercial Review and Website Build');
    assert.equal(params.metadata.offer_id, 'full_review_website_build');
    assert.equal(params.metadata.list_price_pence, '340000');
  });

  test('never hardcodes payment_method_types, so Stripe decides dynamically per the account/Dashboard', () => {
    const params = buildCheckoutSessionParams({
      offer: OFFERS.commercial_review,
      email: 'owner@example.com',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel'
    });
    assert.equal('payment_method_types' in params, false);
  });

  test('tags Checkout Sessions with an Arrington integration identifier', () => {
    const params = buildCheckoutSessionParams({
      offer: OFFERS.commercial_review,
      email: 'owner@example.com',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel'
    });
    assert.match(params.integration_identifier, /^arrington_wts_[a-z]{8}$/);
  });

  test('explicitly sets receipt_email on the PaymentIntent rather than relying on account defaults', () => {
    const params = buildCheckoutSessionParams({
      offer: OFFERS.commercial_review,
      email: 'owner@example.com',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel'
    });
    assert.equal(params.payment_intent_data.receipt_email, 'owner@example.com');
  });

  test('charges the discounted amount directly when a credit is applied (the £500 credit path) — no Stripe coupon involved', () => {
    // Deliberately builds a local fixture rather than depending on
    // OFFERS.full_commercial_review.purchasable, which follows the
    // reversible FULL_REVIEW_PURCHASE_MODE toggle and may be false today —
    // this test is about the charge-amount logic, not about whether that
    // offer happens to be directly purchasable right now.
    const purchasableFullReview = { ...OFFERS.full_commercial_review, purchasable: true };
    const params = buildCheckoutSessionParams({
      offer: purchasableFullReview,
      email: 'owner@example.com',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      chargeAmountPence: 200000,
      creditAppliedPence: 50000
    });
    assert.equal(params.line_items[0].price_data.unit_amount, 200000);
    assert.equal('discounts' in params, false);
    assert.equal(params.metadata.list_price_pence, '250000');
    assert.equal(params.metadata.credit_applied_pence, '50000');
  });

  test('refuses to build params with a negative charge amount', () => {
    const purchasableFullReview = { ...OFFERS.full_commercial_review, purchasable: true };
    assert.throws(() => buildCheckoutSessionParams({
      offer: purchasableFullReview,
      email: 'owner@example.com',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      chargeAmountPence: -100
    }), /negative/);
  });

  test('refuses to build params for an offer that is not purchasable', () => {
    assert.throws(() => buildCheckoutSessionParams({
      offer: OFFERS.conversation,
      email: 'owner@example.com',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel'
    }), /not purchasable/);
  });

  test('refuses to build params without an email', () => {
    assert.throws(() => buildCheckoutSessionParams({
      offer: OFFERS.commercial_review,
      email: '',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel'
    }), /email/);
  });
});
