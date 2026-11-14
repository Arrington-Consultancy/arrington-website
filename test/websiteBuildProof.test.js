// The Website Build page's examples (Tom, 19/10/2026, ahead of paid local
// search for website design; four picture cards since 14/11/2026). A demo
// must read as a demo we built, never as a client, and the staff office is
// shown through its public page only, never the login behind it.
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
    offer: OFFERS.website_build, websiteBuildProofHref: '/websites-and-ai#casestudy2__4', builtProofHref: '/evidence#builtproof'
  });
  return html.slice(html.indexOf('<body>'));
}
const visibleText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1');

test('what we have built: four picture cards, each labelled for what it is', () => {
  // 14/11/2026 (Tom: "we have plenty of website builds WSA, Scott's armchairs,
  // tidewell cars and staff portals to show"). The cards replace the two text
  // links that sat under the button.
  const body = renderBody();
  const cards = body.match(/<a class="wts-built-card"[\s\S]*?<\/a>/g) || [];
  assert.deepStrictEqual(cards.map((c) => c.match(/data-built="([a-z]+)"/)[1]), ['wsa', 'tidewell', 'office', 'scott']);
  const [wsa, demo, office, scott] = cards;
  const caption = (c) => visibleText(c.match(/<p class="wts-built-caption">[\s\S]*?<\/p>/)[0]).trim();
  const kind = (c) => visibleText(c.match(/<p class="wts-built-kind">[\s\S]*?<\/p>/)[0]).trim();

  // World Student Advisors, named, to the case study on Websites and AI.
  assert.ok(wsa.includes('href="/websites-and-ai#casestudy2__4"'), 'the first example moved or changed');
  assert.ok(visibleText(wsa).includes('World Student Advisors'));
  assert.strictEqual(caption(wsa), 'A site built around the enquiry rather than around the brochure. Built for £999.');

  // Tidewell Cars: Tom's line of 19/10/2026, word for word, the public demo.
  assert.ok(demo.includes('data-taxi-demo-proof'));
  assert.strictEqual(kind(demo), 'Demo website');
  assert.strictEqual(caption(demo), 'A taxi firm website we built as a demo, where bookings go straight into dispatch. The firm is made up.');
  assert.ok(demo.includes(`href="${TAXI_DEMO_URL}"`), 'not the public demo address');

  // The staff office: the public page about it, said to be a demo for a made
  // up firm and not part of the £999.
  assert.ok(office.includes('href="/taxi-demo/staff-portal"'));
  assert.strictEqual(kind(office), 'Demo staff portal');
  assert.ok(/made up firm/.test(caption(office)) && /Not part of the £999 website\./.test(caption(office)));
  assert.ok(/signs off before anything goes/.test(caption(office)), 'the staff sign-off left the caption');

  // Scott: a demonstration, never a client.
  assert.strictEqual(kind(scott), 'Demonstration');
  assert.ok(/fictional company/.test(caption(scott)) && /It is not a real client\./.test(caption(scott)));
  assert.ok(scott.includes('href="/evidence#builtproof"'), 'Scott does not go to the built section on Evidence');

  // Nothing that is a demo reads as a client, and every picture exists.
  for (const c of [demo, office, scott]) assert.ok(!/customer of ours|worked with|our client/i.test(visibleText(c)), 'a demo reads as a client');
  for (const c of cards) {
    for (const src of c.match(/\/img\/built\/[a-z]+\.(?:jpg|webp)/g)) {
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', src)), `${src} is missing`);
    }
    assert.ok(/<img [^>]*alt="[^"]{10,}"/.test(c), 'a picture has no description');
    // House rule on new lines: no dashes or hyphens.
    assert.ok(!/[–—-]/.test(caption(c)), `a dash or hyphen in: ${caption(c)}`);
  }
});

test('an enquiry button at the top goes to the form; the pay section stays as it was', () => {
  // Tom, 19/10/2026: "Release both together", for the website design ads.
  const body = renderBody();
  const hero = body.match(/<p class="wts-hero-action" data-hero-enquiry>[\s\S]*?<\/p>/);
  assert.ok(hero, 'the enquiry button at the top is gone');
  assert.ok(/<a href="#conversation" class="btn btn-primary">Tell us what you want to build<\/a>/.test(hero[0]));
  assert.ok(body.indexOf('data-hero-enquiry') < body.indexOf('data-built-work'), 'the button is no longer at the top');
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
