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
  assert.ok(!/introductory|discount|half price|% off/i.test(text), 'a price is framed as a reduction');
});

test('the boxes replace the hero button on the home page only', () => {
  const index = emitted('views/index.ejs');
  assert.ok(/typeof homeOffers !== 'undefined' && homeOffers && _i === 0/.test(index), 'the boxes are not limited to the opening hero');
  const at = index.indexOf("include('partials/home-offers'");
  const cta = index.indexOf('<div class="hero-cta-row">');
  assert.ok(at > 0 && cta > at, 'the boxes do not take the place of the hero button');
  assert.ok(/homeOffers: currentPage\.slug === 'main' \?/.test(read('server.js')), 'the boxes reach a page other than the home page');
  const partial = emitted('views/partials/home-offers.ejs');
  assert.strictEqual((partial.match(/<a /g) || []).length, 1, 'a box carries more than one link');
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
