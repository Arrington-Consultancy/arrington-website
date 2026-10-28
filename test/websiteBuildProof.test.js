// The Website Build page's examples (Tom, 19/10/2026, ahead of paid local
// search for website design). The Tidewell Cars taxi demo is a second
// example beside the existing one. It must read as a demo we built, never as
// a client, and it links to the public demo only, never the staff office.
// The price, the scope, the £300 a day rate and the Stripe flow are not
// touched by this change and are pinned here so they stay that way.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { OFFERS } = require('../lib/whereToStartOffers');
const { TAXI_DEMO_URL } = require('../routes/taxiWebsites');

const VIEW = path.join(__dirname, '..', 'views', 'where-to-start-website-build.ejs');
const emitted = () => fs.readFileSync(VIEW, 'utf8').replace(/<%#[\s\S]*?%>/g, '');

function renderBody() {
  const src = emitted().replace(/<%-\s*include\([^)]*\)\s*%>/g, '');
  const html = ejs.render(src, {
    theme: { vars: {} }, nonce: 'n', csrfToken: 't', navPages: [], content: {}, pageContact: {},
    offer: OFFERS.website_build, websiteBuildProofHref: '/websites-and-ai#casestudy2__4'
  });
  return html.slice(html.indexOf('<body>'));
}
const visibleText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1');

test('the taxi demo is a second example, said to be a demo we built for a made up firm', () => {
  const body = renderBody();
  const proofs = body.match(/<p class="wts-direct-proof"[\s\S]*?<\/p>/g) || [];
  assert.strictEqual(proofs.length, 2, 'there should be two examples');
  assert.ok(proofs[0].includes('href="/websites-and-ai#casestudy2__4"'), 'the first example moved or changed');
  const demo = proofs[1];
  assert.ok(demo.includes('data-taxi-demo-proof'));
  assert.strictEqual(visibleText(demo).trim(), 'Or see Tidewell Cars, a taxi firm website we built as a demo, where bookings go straight into dispatch. The firm is made up.');
  assert.ok(demo.includes(`href="${TAXI_DEMO_URL}"`), 'not the public demo address');
  assert.ok(!/client|customer of ours|worked with/i.test(visibleText(demo)), 'the demo reads as a client');
});

test('an enquiry button at the top goes to the form; the pay section stays as it was', () => {
  // Tom, 19/10/2026: "Release both together", for the website design ads.
  const body = renderBody();
  const hero = body.match(/<p class="wts-hero-action" data-hero-enquiry>[\s\S]*?<\/p>/);
  assert.ok(hero, 'the enquiry button at the top is gone');
  assert.ok(/<a href="#conversation" class="btn btn-primary">Tell us what you want to build<\/a>/.test(hero[0]));
  assert.ok(body.indexOf('data-hero-enquiry') < body.indexOf('wts-direct-proof'), 'the button is no longer at the top');
  assert.ok(body.indexOf('data-hero-enquiry') < body.indexOf('id="wtsCheckoutSubmit"'));
  assert.strictEqual((body.match(/id="wtsCheckoutSubmit"/g) || []).length, 1, 'a second pay button appeared');
});

test('never the staff office, and nothing else on the page moved', () => {
  const src = emitted();
  assert.ok(!src.includes('/taxi-demo/office'), 'the page links to the staff office');
  const body = renderBody();
  const text = visibleText(body);
  assert.strictEqual(OFFERS.website_build.pricePence, 99900);
  assert.ok(text.includes('Further changes after the agreed build and included revision are charged at £300 per day, based on approximately six working hours.'));
  // The secondary treatment since 21/10/2026: the enquiry form is the page's
  // one main action (Tom's three offer decision). Paying works as before.
  assert.ok(body.includes('<button type="submit" class="btn btn-outline" id="wtsCheckoutSubmit">Pay £999 securely</button>'), 'the payment button changed');
  assert.ok(body.includes("fetch('/api/checkout/' + form.dataset.offer"), 'the Stripe checkout call changed');
  assert.ok(body.includes('Not ready to pay? Tell us what you want to build instead'), 'the enquiry route changed');
  // House rules on the new line: no dashes or hyphens.
  const demo = visibleText(body.match(/<p class="wts-direct-proof" data-taxi-demo-proof>[\s\S]*?<\/p>/)[0]);
  assert.ok(!/[–—-]/.test(demo), 'a dash or hyphen in the new line');
});

test('payment comes after we agree to take the project on (Tom, 26/10/2026)', () => {
  // The £999 spec's payment terms (17/08/2026): paid "once Arrington
  // Consultancy has agreed to take the website project on", "not as an
  // unrestricted public purchase". The page used to say "After payment".
  const text = visibleText(renderBody());
  assert.ok(text.includes('Once we have agreed to take the project on, you pay the £999 and Tom books the recorded planning conversation.'), 'the payment order sentence changed');
  assert.ok(!/After payment/i.test(text), 'the page says payment comes first again');
  // 28/10/2026 (Tom's "Yes fix all of the above"): the "Pay upfront" label
  // above the title contradicted both the enquiry button and this sentence.
  assert.ok(!/pay upfront/i.test(text), 'the "Pay upfront" label is back');
});
