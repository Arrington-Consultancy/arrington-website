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
const FULL_REVIEW_PURCHASE_MODE = 'conversation_gated'; // 'conversation_gated' | 'direct_purchase'

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
function buildCheckoutSessionParams({ offer, email, successUrl, cancelUrl, discountCouponId }) {
  if (!offer || !offer.purchasable) {
    throw new Error('Offer is not purchasable');
  }
  if (!email || typeof email !== 'string') {
    throw new Error('A customer email is required');
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
          unit_amount: offer.pricePence
        },
        quantity: 1
      }
    ],
    customer_email: email,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { offer_id: offer.id }
  };

  // Dynamic payment methods: payment_method_types is deliberately left
  // unset. Stripe Checkout automatically offers whatever payment methods
  // are enabled and eligible in the connected account's Dashboard settings
  // (card, and Pay by Bank where the account/currency/customer qualify),
  // rather than this codebase guessing at or hardcoding what's available.

  if (discountCouponId) {
    params.discounts = [{ coupon: discountCouponId }];
  }

  return params;
}

module.exports = { OFFERS, FULL_REVIEW_PURCHASE_MODE, getOffer, buildCheckoutSessionParams };
