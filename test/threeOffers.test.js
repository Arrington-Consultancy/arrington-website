'use strict';

// Tom's three offer decision of 21/10/2026 ("DECISION AND PLAN - Simplify to
// three offers"): the menu is the three offers plus About and Contact, the
// home page opens with one headline and three boxes, the parked pages leave
// the menu and the home page but stay live, and each offer page's one main
// action is the enquiry form.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { OFFER_LINKS, CONTACT_LINK, buildNavPages, homeOffers } = require('../lib/mainNav');
const { MARKER, applyThreeOffersSite } = require('../lib/threeOffersSite');
const { OFFERS } = require('../lib/whereToStartOffers');
const { WORKSPACE_PRICE_PENCE } = require('../routes/taxiWebsites');
const { WEBSITE_BUILD_CONTACT } = require('../routes/whereToStart');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const emitted = (p) => read(p).replace(/<%#[\s\S]*?%>/g, '');

const PARKED = ['owner-check', 'get-your-business-ready-to-sell', 'product-guide', 'start-up-idea-review',
  'owner-dependency-quiz', 'market-ready-test', 'commercial-gaps-review',
  'where-to-start/full-commercial-review', 'where-to-start/full-review-website-build'];

test('the menu is the three offers, the CMS pages allowed through, then Contact', () => {
  const about = { slug: 'about-us', title: 'About Us', nav_label: '', hidden: false, show_in_nav: true };
  const nav = buildNavPages([{ slug: 'main', title: 'Home' }, about]);
  assert.deepStrictEqual(nav.map((p) => p.slug), [
    'where-to-start/commercial-review', 'where-to-start/website-build',
    'taxi-and-private-hire-operators/office-workspace', 'main', 'about-us', '#contact'
  ]);
  const contact = nav[nav.length - 1];
  assert.strictEqual(contact.href, '#conversation', 'Contact must go to the enquiry form');
  assert.strictEqual(contact.title, 'Contact');
  for (const p of PARKED) assert.ok(!nav.some((e) => e.slug === p), `${p} is in the menu`);
  // Both builders use the one list, so they cannot drift apart.
  for (const f of ['server.js', 'lib/navShell.js']) {
    const src = read(f);
    assert.ok(/buildNavPages\(/.test(src), `${f} does not build the menu from lib/mainNav.js`);
    for (const p of ['ownerCheckNavEntry', 'readyToSellNavEntry', 'productGuideNavEntry']) {
      assert.ok(!src.includes(p), `${f} still builds ${p}`);
    }
  }
});

test('the header renders the menu with Contact going to the form, in both loops', async () => {
  const nav = buildNavPages([{ slug: 'main', title: 'Home', show_in_nav: true },
    { slug: 'about-us', title: 'About Us', nav_label: '', hidden: false, show_in_nav: true }]);
  const html = await ejs.renderFile(path.join(root, 'views/partials/site-header.ejs'), {
    currentPage: { slug: 'where-to-start/website-build' }, navPages: nav, canEdit: false,
    content: {}, pageContact: { headerCtaText: 'Start a conversation' }
  });
  const mobile = html.slice(html.indexOf('id="mobileMenu"'), html.indexOf('id="pageMenu"'));
  const desktop = html.slice(html.indexOf('id="pageMenu"'));
  for (const part of [mobile, desktop]) {
    const hrefs = [...part.matchAll(/<a href="([^"]+)"\s+class="(?:page-menu-link)?/g)].map((m) => m[1]);
    assert.deepStrictEqual(hrefs.slice(0, 5), ['/where-to-start/commercial-review', '/where-to-start/website-build',
      '/taxi-and-private-hire-operators/office-workspace', '/about-us', '#conversation']);
    assert.ok(!/href="\/main"|href="\/#contact"/.test(part), 'a slug was used as an address');
  }
  assert.ok(/href="\/where-to-start\/website-build"\s+class="page-menu-link active/.test(desktop), 'the page you are on is not marked');
});

test('the home page boxes: three offers, prices from the catalogue, every line already approved where it leads', () => {
  const boxes = homeOffers(WORKSPACE_PRICE_PENCE);
  assert.deepStrictEqual(boxes.map((b) => b.href), OFFER_LINKS.map((l) => `/${l.slug}`), 'the boxes and the menu disagree on the offers or their order');
  assert.deepStrictEqual(boxes.map((b) => b.price), ['£500', '£999', '£999']);
  assert.strictEqual(OFFERS.commercial_review.pricePence, 50000);
  assert.strictEqual(OFFERS.website_build.pricePence, 99900);
  // Each line is copied from the page or catalogue it came from, word for word.
  assert.ok(OFFERS.commercial_review.description.endsWith(boxes[0].line), 'the Commercial Review line is not its catalogue wording');
  assert.ok(read('views/where-to-start-website-build.ejs').includes(boxes[1].line), 'the website line is not the Website Build page lede');
  assert.ok(read('views/taxi-workspace.ejs').includes(boxes[2].line), 'the workspace line is not its page lede');
  const text = boxes.map((b) => [b.audience, b.name, b.price, b.line, b.button].join(' ')).join(' ');
  assert.ok(!/[–—]/.test(text), 'a dash in the boxes');
  assert.ok(!/\bAI\b/.test(text), 'AI is the hook in a home page box (Brand OS)');
  // Tom, 22/10/2026: the website box is for owner run businesses, like its page.
  assert.strictEqual(boxes[1].audience, 'For owner run businesses');
  assert.ok(!/for any business/i.test(text), '"for any business" is back on a box');
  assert.ok(!/introductory|discount|half price|% off/i.test(text), 'a price is framed as a reduction');
});

test('the hero has one gold button to the form in its own CMS text, and the boxes are the first section under the hero (Tom, 22/10/2026, layout A)', () => {
  const index = emitted('views/index.ejs');
  assert.ok(/typeof homeOffers !== 'undefined' && homeOffers && _i === 0/.test(index), 'the boxes are not limited to the opening hero');
  const heroStart = index.indexOf('<!-- HERO -->');
  const heroEnd = index.indexOf('</section>', heroStart);
  const hero = index.slice(heroStart, heroEnd);
  const cta = hero.indexOf('<div class="hero-cta-row home-hero-cta"');
  const note = hero.indexOf('<p class="home-offers-note"');
  assert.ok(cta > 0 && note > cta, 'the home hero button is missing or the free conversation line is not under it');
  const button = hero.slice(cta, hero.indexOf('</div>', cta));
  assert.strictEqual((button.match(/<a /g) || []).length, 1, 'the home hero carries more than one button');
  assert.ok(button.includes('href="#conversation"') && button.includes('btn-primary'), 'the hero button is not a gold button to the form');
  // The button text is the hero's own CMS field, so no new words are typed
  // here; the fallback is the live value.
  assert.ok(button.includes("content[_k + '.cta'] || 'Tell us what is going on'"), 'the hero button text is not the hero CMS button text');
  // The boxes inside the hero made it about four and a half phone screens
  // tall and the photo a blurred slice (homepage review, point 6). They sit
  // in their own section directly after the hero now, and nowhere else.
  assert.ok(!hero.includes("include('partials/home-offers'"), 'the boxes are inside the hero again');
  const section = index.indexOf('<section class="home-offers-section"', heroEnd);
  const include = index.indexOf("include('partials/home-offers'", heroEnd);
  const nextSection = index.indexOf('<section', heroEnd);
  assert.ok(section > heroEnd && include > section, 'the boxes are not in a section after the hero');
  assert.strictEqual(nextSection, section, 'something else renders between the hero and the boxes');
  assert.strictEqual((index.match(/include\('partials\/home-offers'/g) || []).length, 1, 'the boxes render more than once');
  assert.ok(/\.home-offers-section\s*\{/.test(read('views/index.ejs')), 'the boxes section has no style');
  assert.ok(/homeOffers: currentPage\.slug === 'main' \?/.test(read('server.js')), 'the boxes reach a page other than the home page');
  assert.ok(!/HOME_LAYOUT_PREVIEW|homeEvidenceFirst/.test(read('server.js') + read('views/index.ejs')), 'the layout preview switch is still in the code');
  const partial = emitted('views/partials/home-offers.ejs');
  const box = partial.slice(partial.indexOf('<div class="home-offer '), partial.indexOf('<% }); %>'));
  assert.strictEqual((box.match(/<a /g) || []).length, 1, 'a box carries more than one link');
  // One gold button: the first box leads, the other two carry outline
  // buttons, so the three no longer compete equally for attention.
  assert.ok(box.includes("n === 0 ? 'home-offer--lead' : 'home-offer--side'"), 'the first box does not lead');
  assert.ok(box.includes("n === 0 ? 'btn-primary' : 'btn-outline'"), 'the side boxes do not carry outline buttons');
  const css = read('views/index.ejs');
  assert.ok(/\.home-offer--lead\s*\{/.test(css) && /\.home-offer--side\s*\{/.test(css), 'the lead and side boxes have no style');
  assert.ok(/\.page-main \.case-timeline\s*\{\s*display: grid;/.test(css), 'the turnaround phases do not run across the page on desktop');
});

test('the line that the first conversation is free sits in the hero under the button, above the credential line (Tom, 21/10 and 22/10/2026)', () => {
  const index = emitted('views/index.ejs');
  const heroStart = index.indexOf('<!-- HERO -->');
  const heroEnd = index.indexOf('</section>', heroStart);
  const start = index.indexOf('<p class="home-offers-note"');
  assert.ok(start > heroStart && start < heroEnd, 'the line is not in the hero');
  assert.ok(start < index.indexOf('class="hero-proof-strip"', heroStart), 'the line is not above the credential line');
  assert.strictEqual((index.match(/<p class="home-offers-note"/g) || []).length, 1, 'the line renders more than once');
  assert.ok(!emitted('views/partials/home-offers.ejs').includes('home-offers-note'), 'the line is still in the boxes partial');
  const note = index.slice(start, index.indexOf('</p>', start) + 4);
  assert.ok(note.includes(">The first conversation is free and there's no obligation.</p>"), 'the wording changed');
  assert.ok(!/<a /.test(note), 'the line carries a link; the button above it is the way to the form');
  // The sentence is the one the form itself says, so the hero never
  // promises something the form does not.
  const footer = emitted('views/partials/site-footer.ejs');
  assert.ok(footer.includes("The first conversation is free and there's no obligation."), 'the footer no longer says the sentence the hero repeats');
  assert.ok(!/[\u2013\u2014]/.test(note), 'a dash in the line');
  assert.ok(/\.home-offers-note\s*\{/.test(read('views/index.ejs')), 'the line has no style');
  // Contrast review (Tom, 26/10/2026): the hero note takes --text, not
  // --text-muted, which fell just under 4.5:1 over the photo on a phone.
  const rule = read('views/index.ejs').match(/\.home-hero-cta \+ \.home-offers-note\s*\{([^}]*)\}/);
  assert.ok(rule, 'the hero note has no rule of its own');
  assert.ok(/color:\s*var\(--text\);/.test(rule[1]), 'the hero note is not set in --text');
});

test('the parked pages are off the home page and out of the shared chrome, but still live', () => {
  // index.ejs renders every CMS page. The one parked link it carries is a
  // Useful Thinking article's next step (data-article-next), which is content,
  // the route the decision leaves open for parked ideas; nothing else may.
  const index = emitted('views/index.ejs').split('\n').filter((l) => !l.includes('data-article-next')).join('\n');
  const home = index + emitted('views/partials/home-offers.ejs') + emitted('views/partials/site-footer.ejs') + emitted('views/partials/site-header.ejs');
  for (const p of PARKED) assert.ok(!home.includes(`href="/${p}"`), `/${p} is linked from the home page or the shared chrome`);
  const server = read('server.js');
  for (const route of ['saleReadiness.mountPageRoute', 'productGuide.mountPageRoute', "app.get('/owner-dependency-quiz'", 'marketReadyTest.mountPageRoute', 'startUpReview']) {
    assert.ok(server.includes(route), `${route} is no longer mounted`);
  }
});

test('each offer page has the enquiry form as its one main action', () => {
  const cr = emitted('views/where-to-start-commercial-review.ejs');
  const wb = emitted('views/where-to-start-website-build.ejs');
  const ws = emitted('views/taxi-workspace.ejs');
  for (const [name, html] of [['Commercial Review', cr], ['Website Build', wb], ['workspace', ws]]) {
    const primaries = [...html.matchAll(/<(?:a|button)[^>]*class="btn btn-primary[^"]*"[^>]*>/g)].map((m) => m[0]);
    assert.ok(primaries.length >= 1, `${name} has no primary button`);
    for (const b of primaries) assert.ok(/href="#conversation"/.test(b), `${name}: a primary button goes somewhere other than the form: ${b}`);
    assert.ok(!/href="\/where-to-start"/.test(html), `${name} links back to the Where to Start hub, which lists the parked bundles`);
    for (const p of PARKED) assert.ok(!html.includes(`href="/${p}"`), `${name} links to the parked /${p}`);
  }
  assert.ok(!/<h2>The credit<\/h2>/.test(cr) && !/Commercial Review and Implementation or/.test(cr), 'the Commercial Review page still advertises the parked bundles');
  // The sharing description (Tom, 27/10/2026) is the page's own search
  // description; it used to promise a credit against the parked bundles.
  const crDesc = cr.match(/<meta name="description" content="([^"]*)"/)[1];
  const crOg = cr.match(/<meta property="og:description" content="([^"]*)"/)[1];
  assert.strictEqual(crOg, crDesc, 'the Commercial Review sharing description differs from its search description');
  assert.ok(!/credited/i.test(cr), 'the Commercial Review page still mentions the credit');
  assert.ok(/id="wtsCheckoutSubmit"/.test(cr) && /id="wtsCheckoutSubmit"/.test(wb), 'paying was removed; it stays as the secondary route');
  assert.strictEqual(WEBSITE_BUILD_CONTACT.heading, 'Tell us what you want to build');
  assert.ok(!/commercial review/i.test(WEBSITE_BUILD_CONTACT.body), 'the website enquiry form talks about a commercial review');
});

function fakeDb({ pages, content }) {
  const store = new Map(Object.entries(content));
  return {
    store, pages,
    async query(sql, params = []) {
      if (/^SELECT 1 FROM content WHERE section_key = \$1/.test(sql)) return { rows: store.has(params[0]) ? [{}] : [] };
      if (/^UPDATE pages SET show_in_nav = false/.test(sql)) {
        const moved = pages.filter((p) => p.show_in_nav && !params[0].includes(p.slug));
        moved.forEach((p) => { p.show_in_nav = false; });
        return { rows: moved.map((p) => ({ slug: p.slug })) };
      }
      if (/^SELECT section_order, hidden_sections FROM pages WHERE slug = 'main'/.test(sql)) return { rows: pages.filter((p) => p.slug === 'main') };
      if (/^SELECT content FROM content WHERE section_key = \$1/.test(sql)) return { rows: store.has(params[0]) ? [{ content: store.get(params[0]) }] : [] };
      if (/^UPDATE pages SET hidden_sections = \$1::jsonb WHERE slug = 'main' AND hidden_sections = \$2::jsonb/.test(sql)) {
        const main = pages.find((p) => p.slug === 'main');
        if (JSON.stringify(main.hidden_sections) !== params[1]) return { rowCount: 0 };
        main.hidden_sections = JSON.parse(params[0]);
        return { rowCount: 1 };
      }
      if (/^INSERT INTO content/.test(sql)) { if (!store.has(params[0])) store.set(params[0], params[1]); return { rowCount: 1 }; }
      throw new Error(`unexpected query: ${sql}`);
    }
  };
}

const livePages = () => [
  { slug: 'main', show_in_nav: true, section_order: ['hero', 'filter', 'casestudy__7', 'casestudy2', 'filter__2'], hidden_sections: [] },
  { slug: 'what-we-do', show_in_nav: true },
  { slug: 'evidence', show_in_nav: true },
  { slug: 'about-us', show_in_nav: true },
  { slug: 'book-a-30-minute-conversation', show_in_nav: true },
  { slug: 'useful-thinking', show_in_nav: false }
];

test('the migration takes every CMS page but About Us out of the menu and hides What we do, once', async () => {
  const db = fakeDb({ pages: livePages(), content: { 'filter.label': 'What we do' } });
  const note = await applyThreeOffersSite(db);
  assert.match(note, /out of the menu: book-a-30-minute-conversation, evidence, what-we-do/);
  assert.match(note, /What we do section hidden/);
  assert.deepStrictEqual(db.pages.filter((p) => p.show_in_nav).map((p) => p.slug), ['main', 'about-us']);
  assert.deepStrictEqual(db.pages[0].hidden_sections, ['filter']);
  assert.deepStrictEqual(db.pages[0].section_order, ['hero', 'filter', 'casestudy__7', 'casestudy2', 'filter__2'], 'the section was deleted, not hidden');
  assert.ok(db.store.has(MARKER));
  // Run once: a page Tom puts back in the menu stays there.
  db.pages[1].show_in_nav = true;
  assert.strictEqual(await applyThreeOffersSite(db), null);
  assert.strictEqual(db.pages[1].show_in_nav, true);
});

test('the migration leaves a home page filter alone unless it is the What we do section', async () => {
  const db = fakeDb({ pages: livePages(), content: { 'filter.label': 'Something Tom wrote' } });
  const note = await applyThreeOffersSite(db);
  assert.match(note, /not What we do; left alone/);
  assert.deepStrictEqual(db.pages[0].hidden_sections, []);
});
