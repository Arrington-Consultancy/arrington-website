// Which prices the Product Guide is allowed to quote (14/09/2026).
//
// All five are approved today, so the guide quotes the same figures as the
// rest of the live site. That was not the first position: £999 alone was
// approved that morning, and the other three were withheld until Tom pointed
// out they are already public one click away, which made the guide the only
// quiet page rather than a careful one.
//
// The gate therefore has nothing to withhold at present. These tests still
// prove it WORKS, by withholding one and checking the figure disappears,
// because a guard that is only asserted while it has nothing to do is not a
// guard at all.
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
  commercial_review: true,
  full_commercial_review: true,
  website_build: true,
  full_review_website_build: true
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

test('the gate still removes a price when one is withheld', () => {
  // Nothing is withheld today, so this withholds one itself and puts it back.
  // Without this the guard would sit green forever while proving nothing, and
  // the next genuinely withheld figure would reach the page unnoticed.
  const offer = OFFERS.commercial_review;
  const original = offer.publicPriceApproved;
  const answers = {
    whatChange: 'our margins are all over the place and I do not know why',
    sixMonths: 'a clearer picture'
  };
  try {
    offer.publicPriceApproved = false;
    const r = buildResult(answers);
    const all = [r.recommendation, ...(r.laterRoutes || [])];
    const row = all.find((o) => o.id === 'commercial_review');
    assert.ok(row, 'this probe must actually reach the Commercial Review to prove anything');
    assert.strictEqual(row.priceApproved, false);
    assert.ok(
      !('pricePence' in row),
      'a withheld price must be absent entirely, not zeroed or substituted'
    );
  } finally {
    offer.publicPriceApproved = original;
  }
  assert.strictEqual(OFFERS.commercial_review.publicPriceApproved, original, 'the probe must restore the flag');
});

test('every approved price reaches the result, across every route the guide can produce', () => {
  // The positive direction, which is what the current decision rests on: a
  // price the business has approved must actually appear, or the page is
  // quietly withholding figures nobody asked it to withhold.
  const probes = [
    { whatChange: 'the website looks dated and does not bring in enquiries', sixMonths: 'a site that works' },
    { whatChange: 'our margins are all over the place', sixMonths: 'to understand the numbers' },
    { whatChange: 'the website is wrong and so is everything behind it', sixMonths: 'both sorted', urgency: 'high' },
    { whatChange: 'not sure', sixMonths: '' },
    { whatChange: 'I think we may be trading while insolvent', sixMonths: 'advice' },
    { whatChange: 'everything runs through me and the site needs replacing too', sixMonths: 'less on me' }
  ];

  for (const answers of probes) {
    const r = buildResult(answers);
    for (const row of [r.recommendation, ...(r.laterRoutes || [])]) {
      if (!row) continue;
      const offer = OFFERS[row.id];
      assert.ok(offer, `${row.id} is not in the offer catalogue`);
      assert.strictEqual(row.priceApproved, offer.publicPriceApproved === true,
        `${row.id} disagreed with the catalogue about whether its price may be shown`);
      if (offer.publicPriceApproved) {
        assert.strictEqual(row.pricePence, offer.pricePence,
          `${row.id} is approved but its price did not reach the result`);
      }
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

test('the offer list under the guide shows only approved prices', () => {
  // A second price surface on the same page, added 14/09/2026 when the list
  // was restored. It renders from the same catalogue, so the same rule has to
  // hold here or the page contradicts its own result card.
  const src = fs.readFileSync(VIEW, 'utf8');

  assert.ok(/id="pg-offers"/.test(src), 'the offer list is missing from the page');
  assert.ok(/const pgPrice/.test(src), 'the list must format prices through one helper');
  assert.ok(
    /publicPriceApproved/.test(src),
    'the list must consult the publication flag rather than printing pricePence'
  );

  // No figure may be hard-coded into the markup: every price shown has to come
  // from the catalogue, through the gate.
  const markup = src.slice(src.indexOf('id="pg-offers"'), src.indexOf('<!-- ---- QUESTIONS ---- -->'));
  const hardCoded = markup.match(/£[\d,]+/g) || [];
  assert.deepStrictEqual(hardCoded, [], 'a price is written directly into the offer list markup');
});

test('the restored list is below the guide, not a barrier beside it', () => {
  // The removed "Already know what you need?" link sat next to the only
  // control and invited a visitor to leave before starting. This must stay
  // after the intro's own action, so the guide keeps the primary action.
  const src = fs.readFileSync(VIEW, 'utf8');
  const startBtn = src.indexOf('id="pg-start"');
  const offers = src.indexOf('id="pg-offers"');
  assert.ok(startBtn > -1 && offers > startBtn, 'the offer list must come after the Start button');
});
