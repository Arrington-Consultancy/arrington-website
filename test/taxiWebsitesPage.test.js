// The taxi and private hire websites page, /taxi-and-private-hire-operators/
// websites (13/10/2026). Built from the Google Ads worker's brief, this
// worker's proposal and Tom's approval with changes, all of 13 October 2026.
// What is pinned: what the £999 includes and the words that keep the promise
// true, the email booking check described no further than Tom described it,
// the main action being the enquiry form, indexable but out of the menu, and
// the brand rules.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const emitted = (p) => read(p).replace(/<%#[\s\S]*?%>/g, '');

const PATH = '/taxi-and-private-hire-operators/websites';
const VIEW = 'views/taxi-websites.ejs';
const ROUTE = 'routes/taxiWebsites.js';
const { TAXI_WEBSITES_CONTACT, TAXI_WEBSITES_PATH } = require('../routes/taxiWebsites');
const { OFFERS } = require('../lib/whereToStartOffers');

function renderBody() {
  const src = emitted(VIEW).replace(/<%-\s*include\([^)]*\)\s*%>/g, '');
  const html = ejs.render(src, {
    theme: { vars: {} }, nonce: 'n', csrfToken: 't', navPages: [], content: {},
    websiteOffer: OFFERS.website_build, pageContact: TAXI_WEBSITES_CONTACT
  });
  return html.slice(html.indexOf('<body>'));
}
const visibleText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const section = (body, attr) => {
  const start = body.indexOf(attr);
  assert.ok(start > 0, `${attr} is missing`);
  return visibleText(body.slice(start, body.indexOf('</div>', start)));
};

test('the route is mounted, indexable, in the sitemap and not in the navigation', () => {
  assert.strictEqual(TAXI_WEBSITES_PATH, PATH);
  const server = read('server.js');
  assert.ok(/taxiWebsites\.mountPageRoute\(app, generateCsrfToken\)/.test(server), 'the route is not mounted');
  assert.ok(server.indexOf('taxiWebsites.mountPageRoute') < server.indexOf("app.get('/:slug'"), 'mounted after the CMS catch-all');
  assert.ok(/'taxi-and-private-hire-operators\/websites': '\d{4}-\d{2}-\d{2}'/.test(server), 'no sitemap lastmod');
  assert.ok(/'taxi-and-private-hire-operators\/websites', 'get-your-business-ready-to-sell'\]/.test(server), 'not in the sitemap list');
  assert.ok(!/X-Robots-Tag/.test(read(ROUTE)) && !/<meta name="robots"/.test(emitted(VIEW)), 'a noindex was added');
  assert.ok(emitted(VIEW).includes(`<link rel="canonical" href="https://www.arringtonconsultancy.com${PATH}">`));
  for (const f of ['server.js', 'lib/navShell.js', 'views/partials/site-header.ejs']) {
    const src = read(f);
    assert.ok(!/navPages[\s\S]{0,400}taxi-and-private-hire-operators\/websites/.test(src), `${f} puts the page in the menu`);
  }
});

test('the hero leads with bookings into dispatch, names the email check, and the £999 includes both', () => {
  assert.strictEqual(OFFERS.website_build.pricePence, 99900);
  const body = renderBody();
  const hero = visibleText(body.slice(body.indexOf('<header class="tw-hero"'), body.indexOf('</header>')));
  assert.ok(hero.includes('A taxi website that sends bookings straight into your dispatch system'));
  assert.ok(hero.includes('so nobody in the office has to key it in'));
  assert.ok(hero.includes('We also set up a check on the bookings that still come in by email.'), 'the email check is not in the hero');
  assert.ok(hero.includes('£999, with both included.'));
  const covers = section(body, 'data-covers');
  assert.ok(covers.includes('£999') && covers.includes("That's the whole price."));
  assert.ok(covers.includes('The link to your dispatch system and the email booking check are part of it, not extras.'));
});

test('the systems promise is kept true: named systems, never "any system", access qualified', () => {
  const body = renderBody();
  const text = visibleText(body);
  assert.ok(text.includes('Works with iCabbi, Autocab, Cordic and other systems with a booking API.'));
  const q = section(body, 'data-qualifier');
  assert.ok(q.includes('We connect to iCabbi, Autocab and Cordic, and to other systems with a booking API.'));
  assert.ok(q.includes('where your system has a booking API and you can arrange API access with your provider'), 'the access qualifier is gone');
  assert.ok(q.includes('Any charge your provider makes for API access is between you and them.'));
  assert.ok(!/\bany (?:dispatch )?system\b/i.test(text), '"any system" appears on its own');
  assert.ok(!/30 minutes|thirty minutes/i.test(text), "Tom's own 30 minutes is on the page");
});

test('the email check says what Tom described and nothing more; the widget line sits beside it', () => {
  const body = renderBody();
  const e = section(body, 'data-email-check');
  assert.ok(e.includes('Account customers, hotels and schools still book by email.'));
  assert.ok(e.includes('a booking that was never keyed in, or was keyed in wrong, gets flagged before the customer is left waiting'));
  assert.ok(e.includes("If your provider's own booking widget already does what you need, we'll say so."));
  const text = visibleText(body);
  // No email systems, alert channels or automatic correction (approval, change 1).
  assert.ok(!/\b(?:Outlook|Gmail|Microsoft 365|Office 365|Google Workspace|SMS|text message|WhatsApp|Slack|Teams|push notification)\b/i.test(text), 'an email system or alert channel is named');
  assert.ok(!/automatically (?:correct|fix|book|enter)|corrects? it(?:self)?|fixes it/i.test(text), 'automatic correction is claimed');
  // Nothing about fares, card payment, tracking, hosting or upkeep (questions 2 and 4).
  assert.ok(!/fare quote|quote the fare|card payment|pay by card|track(?:ing)? (?:your|the) (?:car|booking)|hosting|maintenance|upkeep/i.test(text), 'an unapproved feature is promised');
});

test('a website, not dispatch software; one firm named as Tom\'s own, no client named', () => {
  const body = renderBody();
  const ind = section(body, 'data-independence');
  assert.ok(ind.includes('We build the website and leave your dispatch system exactly as it is.'));
  assert.ok(ind.includes("We're listed on the iCabbi Marketplace, but we don't sell software and no supplier pays us."), 'the approved independence line changed');
  const op = section(body, 'data-operator');
  assert.ok(op.includes('nearly twenty years, the last eight or so on iCabbi'), 'the confirmed tenure line changed');
  assert.ok(body.includes('href="/evidence#biography__2"'), 'the Abacus story link is gone');
  assert.ok(!/<img(?![^>]*tom-at-desk)/.test(body), 'an image other than the photo of Tom was added');
});

test('the enquiry form is the main action: no checkout, no conversion, no payment page', () => {
  const body = renderBody();
  const actions = body.match(/<a href="#conversation" class="btn btn-primary">[^<]*<\/a>/g) || [];
  assert.strictEqual(actions.length, 2, 'the two "Tell us about your firm" buttons');
  assert.ok(!/\/api\/checkout|data-offer=|AW-18129914078|Pay £|where-to-start\/website-build/.test(body + read(ROUTE)), 'a payment route or conversion appeared');
  assert.ok(body.includes('href="/taxi-and-private-hire-operators"'), 'the way back to dispatch advice is gone');
  assert.strictEqual(TAXI_WEBSITES_CONTACT.heading, 'Tell us about your firm');
  assert.ok(!/£(?!999\b)[0-9][0-9,]*/.test(visibleText(body)), 'a price other than £999 is on the page');
  assert.ok(!/save £|was £|discount|introductory|50%|half price|launch (?:price|offer)|limited time|special offer/i.test(visibleText(body)), 'a price is framed as a reduction');
});

test('the taxi page links in from its websites section', () => {
  const view = read('views/taxi-operators.ejs');
  const start = view.indexOf('<h2>Websites for operators</h2>');
  const block = view.slice(start, view.indexOf('</div>', start));
  assert.ok(block.includes(`href="${PATH}"`), 'the taxi page no longer links to the websites page');
});

test('brand rules: we, no dashes, no hyphenated words, no banned words, never failing', () => {
  const body = renderBody();
  const served = visibleText(body) + ' ' + TAXI_WEBSITES_CONTACT.heading + ' ' + TAXI_WEBSITES_CONTACT.body + ' ' + TAXI_WEBSITES_CONTACT.messagePlaceholder;
  assert.ok(!/[—–]/.test(served), 'an em or en dash is on the page');
  const hyphenated = served.match(/\b[A-Za-z]+-[A-Za-z]+\b/g) || [];
  assert.deepStrictEqual(hyphenated, [], `hyphenated words: ${hyphenated.join(', ')}`);
  assert.ok(!/\b(I|I'm|I've|my|me)\b/.test(served), 'first person singular is on the page');
  for (const banned of ['solutions?', 'synergy', 'leverage', 'empower', 'journey', 'holistic', 'tailored', 'bespoke', 'coach', 'transformational', 'world class', 'seamless']) {
    assert.ok(!new RegExp(`\\b${banned}\\b`, 'i').test(served), `banned language: ${banned}`);
  }
  assert.ok(!/\bfire|firefight|burning|flames?\b/i.test(served), 'a fire metaphor');
  assert.ok(!/\bfailing\b|\bstruggling\b|\bfix your business\b/i.test(served), 'the page implies the operator is failing');
  assert.ok(!/\bAI\b/.test(served), 'AI appears on the page');
});

test('the page schema names the taxi page as its parent', () => {
  const html = ejs.render(read('views/partials/page-schema.ejs'), {
    nonce: 'n', schemaName: 'Taxi and private hire websites', schemaPath: PATH,
    schemaParent: { name: 'Taxi and private hire operators', path: '/taxi-and-private-hire-operators' }
  });
  const data = JSON.parse(html.replace(/^[\s\S]*?<script[^>]*>/, '').replace(/<\/script>[\s\S]*$/, ''));
  const crumbs = data['@graph'][0].itemListElement.map((c) => c.name);
  assert.deepStrictEqual(crumbs, ['Home', 'Taxi and private hire operators', 'Taxi and private hire websites']);
});
