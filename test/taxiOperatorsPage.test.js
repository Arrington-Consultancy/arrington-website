// The taxi and private hire operators page, built 07/10/2026 from Tom's
// decisions of that day (Website & Hosting write-back "Taxi operator page:
// challenge round and Tom's decisions, 7 October 2026"). Unlike the start-up
// page this one is indexable and in the sitemap, but not in the navigation.
// What is pinned: the facts it may state, the independence disclosure, all
// five core offers at their approved prices read from the catalogue, and the
// brand rules.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const emitted = (p) => read(p).replace(/<%#[\s\S]*?%>/g, '');

const PATH = '/taxi-and-private-hire-operators';
const VIEW = 'views/taxi-operators.ejs';
const ROUTE = 'routes/taxiOperators.js';
const { taxiOffers, TAXI_OPERATORS_CONTACT } = require('../routes/taxiOperators');
const { OFFERS } = require('../lib/whereToStartOffers');

// Render only the page body, with the shared partials stubbed, so the test
// sees exactly what this view emits (including the offer loop).
function renderBody() {
  const src = emitted(VIEW)
    .replace(/<%-\s*include\([^)]*\)\s*%>/g, '');
  const html = ejs.render(src, {
    theme: { vars: {} }, nonce: 'n', csrfToken: 't', navPages: [], content: {},
    offers: taxiOffers(), pageContact: TAXI_OPERATORS_CONTACT
  });
  return html.slice(html.indexOf('<body>'));
}
const visibleText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('the route is registered ahead of the CMS catch-all, indexable, and in the sitemap', () => {
  const server = read('server.js');
  assert.ok(/taxiOperators\.mountPageRoute\(app, generateCsrfToken\)/.test(server), 'the page route is not mounted');
  assert.ok(server.indexOf('taxiOperators.mountPageRoute') < server.indexOf("app.get('/:slug'"), 'registered after the /:slug catch-all');
  assert.ok(read(ROUTE).includes(`'${PATH}'`), `the route no longer serves ${PATH}`);
  assert.ok(!/X-Robots-Tag/.test(read(ROUTE)), 'the route sends a robots header; this page is meant to be indexed');
  assert.ok(!/<meta name="robots"/.test(emitted(VIEW)), 'the view carries a robots meta tag; this page is meant to be indexed');
  const sitemapAt = server.indexOf("app.get('/sitemap.xml'");
  const sitemapSrc = server.slice(sitemapAt, server.indexOf('</urlset>', sitemapAt));
  assert.ok(sitemapSrc.includes("'taxi-and-private-hire-operators'"), 'the page is not in sitemap.xml');
  assert.ok(/'taxi-and-private-hire-operators': '\d{4}-\d{2}-\d{2}'/.test(sitemapSrc), 'the page has no lastmod');
  assert.ok(emitted(VIEW).includes(`<link rel="canonical" href="https://www.arringtonconsultancy.com${PATH}">`), 'the canonical tag is wrong or missing');
});

test('it is not in the main navigation', () => {
  for (const f of ['views/partials/site-header.ejs', 'lib/navShell.js']) {
    assert.ok(!read(f).includes(PATH), `${f} links to the taxi page`);
  }
});

test('the hero states the evidenced facts and the decision the searcher faces', () => {
  const text = visibleText(renderBody());
  assert.ok(text.includes('Choosing or changing a taxi dispatch system? Talk to an operator first.'), 'the headline changed');
  assert.ok(text.includes('over 20 years in the taxi trade'), 'the tenure fact Tom confirmed on 07/10/2026 is missing');
  assert.ok(text.includes('He started as a driver'), 'the driver fact is missing');
  assert.ok(text.includes('Abacus and Falmouth Taxis for nearly twenty years'), 'the ownership fact no longer matches the Evidence case study');
  assert.ok(text.includes('around eight of them on iCabbi'), 'the iCabbi fact is missing or overstated');
  assert.ok(text.includes('selling the business in 2025'), 'the sale fact is missing');
  // Claims the evidence does not support must not appear.
  assert.ok(!/\b(?:Autocab|Cordic|Sherlock|Cab Treasure|TaxiCaller|Taxi Butler)\b/i.test(text), 'a supplier is named as a system Tom used or knows; only iCabbi is evidenced');
  assert.ok(!/\bPCO\b|black cab|London/i.test(text), 'London shorthand is on the page');
  assert.ok(!/(?:built|build) (?:taxi )?websites for (?:taxi )?operators|integrat/i.test(text), 'an unevidenced integration or taxi website claim appeared');
});

test('independence is stated in the hero and the iCabbi listing disclosed beside "no supplier pays us"', () => {
  const body = renderBody();
  const hero = visibleText(body.slice(body.indexOf('<header class="tx-hero"'), body.indexOf('</header>')));
  assert.ok(hero.includes("We're independent of every dispatch supplier."), 'independence is no longer on the first screen');
  const text = visibleText(body);
  assert.ok(text.includes('no supplier pays us'), 'the independence statement is gone');
  assert.ok(text.includes('listed on the iCabbi Marketplace'), 'the iCabbi Marketplace listing is no longer disclosed');
});

test('three taxi-framed offers from the catalogue, no £3,400, a route to the Product Guide', () => {
  // Tom, 07/10/2026 after the second review: "lets ditch the 3400 then".
  const offers = taxiOffers();
  assert.deepStrictEqual(offers.map((o) => o.id), ['commercial_review', 'full_commercial_review', 'website_build']);
  const body = renderBody();
  const text = visibleText(body);
  for (const o of offers) {
    const price = '£' + (o.pricePence / 100).toLocaleString('en-GB');
    assert.ok(text.includes(o.name) && text.includes(price), `${o.name} at ${price} is missing`);
    assert.ok(body.includes(`href="${o.path}"`), `${o.name} no longer links to its own page`);
  }
  // Tom's brief of 8 October 2026: each price answers the operator's situation.
  for (const lead of ['We find out where the money, the drivers and the work are actually going.', 'We stay and do it with you.', 'A website that gets the booking.']) {
    assert.ok(text.includes(lead), `the taxi lead-in "${lead}" is missing`);
  }
  assert.ok(text.includes("The first conversation is free. Tell us what's happening and we'll tell you where we'd look first."), 'the free conversation line is missing');
  assert.strictEqual(OFFERS.commercial_review.pricePence, 50000);
  assert.ok(!text.includes('£3,400') && !text.includes('Commercial Review and Website Build'), 'the £3,400 offer is back');
  assert.ok(body.includes('href="/product-guide"'), 'the Product Guide route for everything else is gone');
  assert.ok(/class="tx-offers-actions">\s*<a href="#conversation"/.test(body), 'the conversation button after the offers is gone');
  assert.ok(!/£(?!(?:500|999|2,500)\b)[0-9][0-9,]*/.test(text), 'an unapproved price appeared');
  assert.ok(!/save £|was £|discount|introductory|50%|half price|launch (?:price|offer)|limited time|taxi rate|special offer/i.test(text), 'a price is framed as a reduction');
  assert.ok(!/\/api\/checkout|data-offer=|AW-18129914078/.test(body + read(ROUTE)), 'a checkout or conversion appeared on the taxi page');
});

test("the operator's week sits straight under the headline, bridges into the software section, and stays respectful", () => {
  // Tom's brief of 8 October 2026 (relayed by the Google Ads worker):
  // operators do not search for help when things go wrong, so the page's job
  // is recognition in the first screen after the headline.
  const body = renderBody();
  const at = (s) => body.indexOf(s);
  assert.ok(at('</header>') < at('What it usually looks like'), 'the new section is not after the hero');
  assert.ok(at('What it usually looks like') < at("Most of the time it isn't the software"), 'the new section is not before the software section');
  assert.ok(at("Most of the time it isn't the software") < at('data-independence>'), 'the independence strip moved above the operator\'s week');
  assert.ok(at('data-independence>') < at('Choosing or changing a dispatch system</h2>'), 'the independence strip no longer leads into choosing a system');
  const section = visibleText(body.slice(at('data-situation'), at("Most of the time it isn't the software")));
  for (const line of [
    'Drivers drift to Uber because the app pays them every week and you pay them when the invoices clear.',
    "Three people's jobs run through one person in the office, usually you, and the phones go quiet the minute you step out.",
    'Account work that used to be the backbone of your firm quietly goes somewhere else.',
    "Tom had every one of those problems in his own taxi firms, and none of them was the software.",
    'If any of that is your week, our Commercial Review starts with the business, not the screen.'
  ]) {
    assert.ok(section.includes(line), `missing: ${line}`);
  }
  // Tom's story stays in the third person: Arrington did not run taxi firms.
  assert.ok(!/\bwe (?:ran|had)\b/i.test(section), 'the section says "we" ran the taxi firms');
  // The brief's do-nots, checked across everything the page emits.
  const served = visibleText(body) + ' ' + TAXI_OPERATORS_CONTACT.body + ' ' + TAXI_OPERATORS_CONTACT.messagePlaceholder;
  assert.ok(!/\bfailing\b|\bfix your business\b|\bturn(?:ing)? (?:it )?around\b|\bturnaround\b/i.test(served), 'failing, fix your business or turn around is on the page');
  assert.ok(!/\bstruggling\b/i.test(served), '"struggling" is on the page');
  assert.ok(!/<img(?![^>]*tom-at-desk)/.test(body), 'an image other than the photo of Tom was added');
  assert.strictEqual(TAXI_OPERATORS_CONTACT.messagePlaceholder, "Drivers, work, money, the office, the system, all of it, whatever's going on");
});

test('no repeated biography section, the extra proof sits in the operator paragraph, no migration claim', () => {
  const text = visibleText(renderBody());
  assert.ok(!text.includes("Who you'd be talking to"), 'the separate biography section is back');
  assert.ok(text.includes('bought the business at 22, very nearly lost it and rebuilt it') && text.includes('National Taxi Association'), 'the extra operator proof is missing');
  // Tom, 07/10/2026: Abacus moved onto iCabbi from another system while he
  // ran it, so the switchover claim is his own. The earlier system is not
  // named (only iCabbi use is evidenced by name), and no claim of moving
  // operators between other systems is made.
  assert.ok(text.includes('Tom has been through a switchover himself, moving Abacus onto iCabbi from another system, and he knows the other main UK systems.'), 'the systems line changed');
  assert.ok(!/caught out moving between/i.test(text), 'the unevidenced migration claim is back');
});

test('brand rules: we, no dashes, no banned words, AI not the hook', () => {
  const body = renderBody();
  const own = visibleText(body)
    // Approved catalogue descriptions are shared copy, checked where they live.
    .replace(new RegExp(Object.values(OFFERS).map((o) => o.description).filter(Boolean).map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g'), ' ');
  const served = own + ' ' + TAXI_OPERATORS_CONTACT.heading + ' ' + TAXI_OPERATORS_CONTACT.body.replace(/<[^>]+>/g, ' ') + ' ' + TAXI_OPERATORS_CONTACT.messagePlaceholder;
  assert.ok(!/[—–]/.test(served), 'an em or en dash is on the page');
  const hyphenated = served.match(/[A-Za-z]+-[A-Za-z]+/g) || [];
  assert.deepStrictEqual(hyphenated, [], `hyphenated words on the page: ${hyphenated.join(', ')}`);
  // The customers' calls ("where's my car ... can I book for Friday") are quoted speech, not our voice.
  assert.ok(!/\b(I|I'm|I've|my|me)\b/.test(served.replace("where's my car, what's the fare, can I book for Friday", '')), 'first person singular is on the page');
  for (const banned of ['solutions', 'synergy', 'leverage', 'empower', 'journey', 'holistic', 'tailored', 'bespoke', 'coach', 'transformational', 'world class']) {
    assert.ok(!new RegExp(`\\b${banned}\\b`, 'i').test(served), `banned language on the page: ${banned}`);
  }
  assert.ok(!/\bfire|firefight|burning|flames?\b/i.test(served), 'a fire metaphor is on the page');
  // AI is never the hook: it must not appear in the hero or before the
  // dispatch and business sections.
  const hero = visibleText(body.slice(body.indexOf('<header class="tx-hero"'), body.indexOf('</header>')));
  assert.ok(!/\bAI\b/.test(hero), 'AI appears in the hero');
  assert.ok(body.indexOf('The phones and the office') > body.indexOf('The business behind the system'), 'the AI section moved above the business section');
  assert.ok(body.includes('href="/evidence#biography__2"'), 'the Abacus case study link is gone');
});

test('headings match the rest of the site: Poppins at 600, body DM Sans', () => {
  // The home and landing pages render headings at the browser's bold, which
  // draws from the Poppins 600 file. At 400 this page's headline rendered
  // from the 500 file and looked weaker beside them (seen live, 07/10/2026).
  const view = read(VIEW);
  assert.ok(/h1, h2, h3 \{ font-family: 'Poppins', 'DM Sans', sans-serif; font-weight: 600;/.test(view), 'the heading weight no longer matches the site');
  assert.ok(/family=DM\+Sans[^"]*&family=Poppins:wght@500;600/.test(view), 'the Poppins 600 file is no longer loaded');
  assert.ok(/body \{[^}]*font-family: 'DM Sans'/.test(view), 'the body is no longer DM Sans');
});

test('two contextual links in: What We Do (appended) and Evidence (after the Abacus case study)', () => {
  // Tom, 07/10/2026: "ok" to links from What We Do and the Abacus case study.
  const seed = read('db/seed.js');
  const at = seed.indexOf('TAXI OPERATORS PAGE: two contextual links in');
  assert.ok(at > 0, 'the link migration is gone');
  const block = seed.slice(at, seed.indexOf('// Arrington AI Workspace: ingest', at));
  assert.ok(block.includes("const TAXI_SLUG = 'taxi-and-private-hire-operators'"), 'the links no longer point at the taxi page');
  assert.ok(PATH === '/' + 'taxi-and-private-hire-operators', 'the route was renamed without the links');
  assert.ok(block.includes("page: 'what-we-do'") && block.includes("page: 'evidence'"), 'a link page is missing');
  assert.ok(block.includes("after: 'biography__2'"), 'the Evidence link no longer follows the Abacus case study');
  assert.ok(/'what-we-do\.taxi_operators_link_2026-10-07'/.test(block) && /'evidence\.taxi_operators_link_2026-10-07'/.test(block), 'a run-once marker is missing');
  const copy = (block.match(/(?:heading|subtext|button_text): '([^']*)'/g) || []).join(' ');
  assert.ok(!/[—–]|[A-Za-z]-[A-Za-z]/.test(copy), 'a dash or hyphenated word in the link copy');
  assert.ok(!/£|\b(I|my|me)\b/.test(copy), 'a price or first person in the link copy');
});
