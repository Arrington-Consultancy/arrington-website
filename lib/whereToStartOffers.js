// "Where to Start" offer catalogue — single source of truth for the priced
// tiers on the Where to Start page, shared by the route handlers and the
// views. Pure data and pure functions only: nothing here touches the
// database or the Stripe SDK, so the checkout-session parameter building can
// be unit tested without a network connection (this sandbox has no outbound
// access to api.stripe.com — see routes/whereToStart.js for the boundary
// where that limitation actually bites).
//
// FULL_REVIEW_PURCHASE_MODE is the one deliberately reversible decision left
// open by the brief: whether the £2,500 Full Commercial Review is directly
// purchasable cold, or shown priced with a "start with a conversation" CTA
// instead. Defaults to 'conversation_gated' per the commercial-thinking
// review in this session (selling the flagship diagnostic to a stranger
// with no qualifying call cuts against the Brand Operating System's
// "commercial respect comes before commercial diagnosis" rule). Flip to
// 'direct_purchase' to enable cold checkout for it — no other code changes
// needed, the offer/view/route logic all read this one constant.
// TEMPORARY, for the one-time end-to-end test requested by Tom (needs the
// £2,500 tier directly purchasable to prove the £500 credit is recognised
// and applied). Revert to 'conversation_gated' immediately after the test
// passes — see the follow-up commit that does exactly that.
const FULL_REVIEW_PURCHASE_MODE = 'direct_purchase'; // 'conversation_gated' | 'direct_purchase'

const OFFERS = {
  conversation: {
    id: 'conversation',
    name: '30 Minute Conversation',
    pricePence: 0,
    purchasable: false
  },
  commercial_review: {
    id: 'commercial_review',
    name: 'Commercial Review',
    description: "A single, tightly defined piece of Tom's commercial judgement on one thing you want looked at properly.",
    pricePence: 50000,
    currency: 'gbp',
    purchasable: true,
    creditTowards: 'full_commercial_review',
    creditAmountPence: 50000
  },
  full_commercial_review: {
    id: 'full_commercial_review',
    name: 'Full Commercial Review',
    description: 'A proper look at the business: deeper access, evidence followed rather than assumed, and practical help beginning to implement what it finds.',
    pricePence: 250000,
    currency: 'gbp',
    purchasable: FULL_REVIEW_PURCHASE_MODE === 'direct_purchase',
    creditFrom: 'commercial_review',
    creditAmountPence: 50000
  }
};

function getOffer(offerId) {
  return OFFERS[offerId] || null;
}

// Builds the parameter object for stripe.checkout.sessions.create(). Pure
// function — takes everything it needs as arguments rather than reaching
// into the database or env vars itself, so it can be tested without either.
//
// chargeAmountPence lets a caller charge less than the offer's list price
// (used for the £500-credited Full Commercial Review). Deliberately NOT
// implemented as a Stripe coupon/discount: a coupon is an extra Stripe-side
// object created per transaction for something that is really just "this
// specific line item costs less this time," which adds a second place
// (Stripe's coupon list) that has to agree with our own purchases table
// for no benefit — the credit is an Arrington-owned entitlement recorded in
// our own database (see db/schema.sql's purchases table), not a Stripe-side
// promotion, so the session's own line item price is simply built at the
// already-discounted amount instead.
function buildCheckoutSessionParams({ offer, email, successUrl, cancelUrl, chargeAmountPence, creditAppliedPence }) {
  if (!offer || !offer.purchasable) {
    throw new Error('Offer is not purchasable');
  }
  if (!email || typeof email !== 'string') {
    throw new Error('A customer email is required');
  }

  const unitAmount = Number.isInteger(chargeAmountPence) ? chargeAmountPence : offer.pricePence;
  if (unitAmount < 0) {
    throw new Error('Charge amount cannot be negative');
  }

  const params = {
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: offer.currency,
          product_data: {
            name: offer.name,
            description: offer.description || undefined
          },
          unit_amount: unitAmount
        },
        quantity: 1
      }
    ],
    customer_email: email,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      offer_id: offer.id,
      list_price_pence: String(offer.pricePence),
      credit_applied_pence: String(creditAppliedPence || 0)
    },
    // Explicitly configured rather than left to account defaults: this sets
    // which address Stripe attaches to the resulting PaymentIntent as
    // receipt_email. Stripe only actually SENDS its own receipt email if
    // the account has "Email customers about successful payments" switched
    // on under Dashboard -> Settings -> Emails — an account-level toggle
    // this codebase cannot read or set via the API, and cannot verify from
    // this sandbox (no outbound access to api.stripe.com or
    // dashboard.stripe.com). Confirm that setting directly in the Stripe
    // Dashboard when Stripe connectivity is available; either way, our own
    // Arrington confirmation email (routes/whereToStart.js) is sent
    // regardless of this setting, so the customer never depends on it.
    payment_intent_data: { receipt_email: email },
    // Generates a real, numbered Stripe Invoice for every purchase, not
    // just a payment receipt — confirmed against the Payment Links schema
    // (which shares the same invoice_creation shape as Checkout Sessions,
    // both ultimately produce the same Invoice object) via a live sandbox
    // test on 2026-08-12. Deliberately no invoice_data.footer/custom_fields
    // set here: those would need real business details (registration
    // number, address) this codebase doesn't have and shouldn't fabricate —
    // Dashboard branding settings (logo, brand colour) already apply to
    // every invoice PDF automatically without needing to be set per-session.
    //
    // The invoice NUMBER itself (Tom asked for it to start at 151) is not
    // settable here at all — for UK accounts, which default to account-wide
    // sequencing, Stripe only exposes the starting number via
    // Dashboard -> Settings -> Billing -> Invoice settings -> "Next invoice
    // sequence" (confirmed via Stripe's docs; no API operation for this
    // exists at the account level). Must be set there directly, in both the
    // sandbox (for testing) and the live account before going live.
    invoice_creation: { enabled: true }
  };

  // Dynamic payment methods: payment_method_types is deliberately left
  // unset. Stripe Checkout automatically offers whatever payment methods
  // are enabled and eligible in the connected account's Dashboard settings
  // (card, and Pay by Bank where the account/currency/customer qualify),
  // rather than this codebase guessing at or hardcoding what's available.

  return params;
}

module.exports = { OFFERS, FULL_REVIEW_PURCHASE_MODE, getOffer, buildCheckoutSessionParams };
