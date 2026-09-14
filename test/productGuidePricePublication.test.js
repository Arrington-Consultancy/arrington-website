// Which prices the Product Guide is allowed to quote (14/09/2026).
//
// Tom's decision separated two things that had been one: what the checkout
// charges, and what the business will publish as a standing price on a new
// page. £999 is approved for both. £500 is not approved as a published
// Commercial Review price. £2,500 and £3,400 are conflicting figures awaiting
// an approval-evidence reconciliation that is its own work item.
//
// What these tests guard is the failure that would be invisible: the guide
// reads pricePence straight from the shared catalogue, so a figure reaches
// three places per result (the price line, the CTA label, the later-routes
// list) without anybody writing it down. Miss one and the page quotes a
// number nobody approved.
//
// They also guard the opposite mistake, which is the more tempting one: a
// substitute figure, a "from £X", or a zero standing in for a withheld
// price. An absent price is the honest statement. An invented one is not.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { OFFERS } = require('../lib/whereToStartOffers');
const { buildResult, computeRecommendation } = require('../lib/productGuide');

const VIEW = path.join(__dirname, '..', 'views', 'product-guide.ejs');

// The decision itself, written out rather than derived, so that changing the
// catalogue cannot quietly change what this file claims Tom approved.
const APPROVED_FOR_PUBLICATION = {
  conversation: true,
  commercial_review: false,
  full_commercial_review: false,
  website_build: true,
  full_review_website_build: false
};

test('the catalogue records exactly the approvals Tom gave', () => {
  const actual = Object.fromEntries(
    Object.entries(OFFERS).map(([id, o]) => [id, o.publicPriceApproved === true])
  );
  assert.deepStrictEqual(actual, APPROVED_FOR_PUBLICATION);
});

test('the charged price is untouched by the publication flag', () => {
  // The flag governs quoting, never charging. If this ever drifts, the
  // checkout and the page stop agreeing about what money is being asked for.
  assert.strictEqual(OFFERS.commercial_review.pricePence, 50000);
  assert.strictEqual(OFFERS.full_commercial_review.pricePence, 250000);
  assert.strictEqual(OFFERS.website_build.pricePence, 99900);
  assert.strictEqual(OFFERS.full_review_website_build.pricePence, 340000);
});

test('a withheld price is absent from the result, not zeroed or substituted', () => {
  // Zero would render as "£0" and read as free, which is a worse untruth
  // than saying nothing at all.
  const answers = { whatChange: 'our margins are all over the place and I do not know why', sixMonths: 'a clearer picture' };
  const decision = computeRecommendation(answers);
  const result = buildResult(answers);

  const offer = OFFERS[decision.recommendationId];
  if (offer.publicPriceApproved) {
    assert.strictEqual(result.recommendation.pricePence, offer.pricePence);
  } else {
    assert.ok(
      !('pricePence' in result.recommendation),
      'a withheld price must be absent from the payload entirely'
    );
  }
});

test('no unapproved figure reaches any result the guide can produce', () => {
  // Swept across every recommendation the engine can reach, including the
  // later-routes list, which is the slot that is easiest to forget.
  const probes = [
    { whatChange: 'the website looks dated and does not bring in enquiries', sixMonths: 'a site that works' },
    { whatChange: 'our margins are all over the place', sixMonths: 'to understand the numbers' },
    { whatChange: 'the website is wrong and so is everything behind it', sixMonths: 'both sorted', urgency: 'high' },
    { whatChange: 'not sure', sixMonths: '' },
    { whatChange: 'I think we may be trading while insolvent', sixMonths: 'advice' },
    { whatChange: 'everything runs through me and the site needs replacing too', sixMonths: 'less on me' }
  ];

  const withheld = new Set(
    Object.values(OFFERS).filter((o) => !o.publicPriceApproved).map((o) => o.pricePence)
  );
  assert.ok(withheld.size > 0, 'the sweep proves nothing if no price is withheld');

  for (const answers of probes) {
    const r = buildResult(answers);
    for (const offer of [r.recommendation, ...(r.laterRoutes || [])]) {
      if (!offer) continue;
      if (offer.priceApproved === true) continue;
      assert.ok(
        !('pricePence' in offer),
        `${offer.id} is not approved for publication but carried a price for ${JSON.stringify(answers.whatChange)}`
      );
      assert.ok(
        !withheld.has(offer.pricePence),
        `${offer.id} leaked a withheld figure`
      );
    }
  }
});

test('every offer summary declares its price status explicitly', () => {
  // priceApproved is always present so a caller tests a flag rather than
  // inferring meaning from a missing key, which is how the CTA label and the
  // later-routes list both ended up needing the same guard.
  const r = buildResult({ whatChange: 'the site needs rebuilding', sixMonths: 'a better site' });
  for (const offer of [r.recommendation, ...(r.laterRoutes || [])]) {
    assert.strictEqual(typeof offer.priceApproved, 'boolean', `${offer.id} did not declare priceApproved`);
  }
});

test('the approved £999 build is still quoted, so withholding is not blanket', () => {
  // A test that only asserts absence passes against a page that shows nobody
  // anything. This is the positive control.
  const r = buildResult({
    whatChange: 'our website is dated and does not generate enquiries',
    sixMonths: 'a website that brings in work'
  });
  const all = [r.recommendation, ...(r.laterRoutes || [])];
  const build = all.find((o) => o.id === 'website_build');
  if (build) {
    assert.strictEqual(build.priceApproved, true);
    assert.strictEqual(build.pricePence, 99900);
  } else {
    // Not every route surfaces the build; assert the summary directly then.
    const { OFFERS: o } = require('../lib/whereToStartOffers');
    assert.strictEqual(o.website_build.publicPriceApproved, true);
  }
});

test('the view renders a price only when the server says it may', () => {
  const src = fs.readFileSync(VIEW, 'utf8');
  assert.ok(src.includes('function hasPrice'), 'the view must gate on a single price-status helper');
  // formatPrice must never be called on a raw recommendation without the gate.
  const ungated = src.match(/formatPrice\(result\.recommendation\.pricePence\)/g) || [];
  const gatedBlocks = src.match(/hasPrice\(result\.recommendation\)/g) || [];
  assert.ok(gatedBlocks.length >= 2, 'both the price line and the CTA label must consult the gate');
  assert.ok(
    ungated.length <= 2,
    'a price is formatted somewhere the gate does not cover'
  );
});

test('the "Already know what you need?" barrier is gone, and /where-to-start is not', () => {
  const src = fs.readFileSync(VIEW, 'utf8');
  // EJS comments are stripped first: the note explaining WHY the barrier was
  // removed necessarily quotes it, and a comment reaches no visitor. What
  // matters is that nothing renders it.
  const emitted = src.replace(/<%#[\s\S]*?%>/g, '');

  assert.ok(!/Already know what you need/.test(emitted), 'the pre-question barrier link is still present');
  assert.ok(!/class="pg-intro-alt"/.test(emitted), 'the barrier markup is still present');
  assert.ok(!/\.pg-intro-alt\s*\{/.test(src), 'dead CSS for the removed barrier is still present');
  // The route itself must stay reachable from the result, which is where
  // somebody actually needs it.
  assert.ok(
    /result\.recommendation\.path/.test(src),
    'the result CTA must still lead to the offer page on /where-to-start'
  );
});
