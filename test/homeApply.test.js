// The home page on the "apply to work with us" theme (Tom, 15/11/2026; see
// lib/homeApply.js for his words). One button, results first, who we work
// with, three steps, the offers as quiet links with no prices, one line of
// Tom's own, and the form headed "Apply to work with us". Home page only.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const {
  MARKER, HOME_APPLY, HOME_APPLY_CONTACT, WSA_FIGURE_PHRASE,
  HERO_SUB_FROM, HERO_SUB_TO, HERO_CTA_FROM, HERO_CTA_TO,
  homeApplyData, applyHomeApplyTheme
} = require('../lib/homeApply');
const { OFFER_LINKS } = require('../lib/mainNav');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const emitted = (p) => read(p).replace(/<%#[\s\S]*?%>/g, '');

const WSA = { href: '/evidence#casestudy2__7', result: 'Since June 2026, cold enquiries have gone from about one a month to around 30 a day, and revenue is up 159%.' };

// Every string a visitor reads, from the one place the wording lives.
function allCopy(data) {
  const out = [];
  const walk = (v, key) => {
    if (typeof v === 'string') { if (key !== 'href') out.push(v); return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x)); return; }
    if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k));
  };
  walk(data);
  return out;
}

test('the wording: Tom\'s points are in, and what he ruled out is not', () => {
  const data = homeApplyData({ wsa: WSA });
  const copy = [...allCopy(data), ...allCopy({ ...HOME_APPLY_CONTACT }), HERO_SUB_TO, HERO_CTA_TO];
  const text = copy.join(' \n ');
  // Tom, 15/11/2026: time is the limit, selective, won't take money from a
  // business past help, "made stronger" rather than "turned around".
  assert.ok(text.includes('The limit is our time.'));
  assert.ok(text.includes('We are selective about who we work with.'));
  assert.ok(text.includes('We will say so, and we won’t take your money.'));
  assert.ok(text.includes('Different businesses, made stronger in different ways.'));
  assert.ok(text.includes('We don’t charge for it'), 'the first conversation is no longer said to cost nothing');
  // "Free" reads cheap (Tom); "Tom does the work himself sounds small time".
  assert.ok(!/\bfree\b/i.test(text), '"free" is back on the home page');
  assert.ok(!/no obligation/i.test(text), 'the reassurance line is back');
  assert.ok(!/himself|herself/i.test(text), '"Tom ... himself" is back');
  assert.ok(!/turn(?:ed|s|ing)? (?:\w+ ){0,3}around|turnaround/i.test(text), '"turned around" is on the home page (Brand OS: not a rescue service)');
  assert.ok(!/rescu/i.test(text), 'the page talks about rescue');
  // No price on the home page: prices are on the offer pages.
  assert.ok(!/£\s?\d/.test(text), 'a price is on the home page');
  // Brand OS.
  assert.ok(!/[–—]/.test(text), 'a dash in the wording');
  assert.ok(!/\b(solutions|synergy|leverage|empower|journey|holistic|tailored|bespoke|transformational|world class|unlock)\b/i.test(text), 'a Brand OS avoided word');
  assert.ok(!/\bfire|firefight|burn/i.test(text), 'a fire metaphor');
  // "We" on the page; first person only inside Tom's quoted sentence.
  const notQuote = copy.filter((c) => c !== HOME_APPLY.quote.text).join(' ');
  assert.ok(!/\b(I|my|me)\b/.test(notQuote), 'first person outside the quotation');
  // Tom, 15/11/2026: "let's not over mention Tom, in the right place and for
  // good reason yes". Two places: the business he built himself, and the
  // name under his own sentence. Everything else is "we".
  const named = copy.filter((c) => /\bTom\b/.test(c));
  assert.deepStrictEqual(named, [HOME_APPLY.results.abacus.text, HOME_APPLY.quote.by], 'Tom is named somewhere new on the home page');
  // "Coaching" appears once, on purpose: it says what we are not.
  assert.strictEqual((text.match(/coach/gi) || []).length, 1);
  assert.ok(HOME_APPLY.fit.no.some((l) => /coaching, a programme or a monthly retainer/.test(l)));
});

test('the three offers are the menu\'s three, as links with no price', () => {
  assert.deepStrictEqual(HOME_APPLY.offers.items.map((o) => o.href), OFFER_LINKS.map((l) => `/${l.slug}`));
  for (const o of HOME_APPLY.offers.items) assert.ok(!/£|\d{3}/.test(o.name + o.line), `${o.name} carries a figure`);
});

test('the World Student Advisors result shows only while its case study still says it', () => {
  const withWsa = homeApplyData({ wsa: WSA }).results.tiles;
  assert.strictEqual(withWsa.length, 3);
  assert.deepStrictEqual(withWsa.map((t) => `${t.figure} ${t.unit}`), ['30 a day', '24 months', '18 years']);
  // The sentence is the case study's own, word for word, with its link.
  assert.strictEqual(withWsa[0].text, WSA.result);
  assert.strictEqual(withWsa[0].href, WSA.href);
  assert.ok(WSA.result.includes(WSA_FIGURE_PHRASE));
  // Hidden or missing on Evidence: no tile, and the other two stand.
  assert.strictEqual(homeApplyData({ wsa: null }).results.tiles.length, 2);
  assert.strictEqual(homeApplyData().results.tiles.length, 2);
  // A figure changed in the CMS takes the tile off rather than leaving 30.
  const changed = { ...WSA, result: 'Since June 2026, cold enquiries have gone from about one a month to around 45 a day.' };
  assert.strictEqual(homeApplyData({ wsa: changed }).results.tiles.length, 2);
  // An address that is not an Evidence anchor is never rendered.
  assert.strictEqual(homeApplyData({ wsa: { ...WSA, href: '//evil.example' } }).results.tiles.length, 2);
});

test('Tom\'s line is his own sentence from the article it links to', () => {
  // The article's paragraphs are in db/seed.js, where its migration wrote
  // them, with the apostrophes escaped for a JavaScript string.
  const norm = (s) => s.replace(/\\'/g, "'").replace(/[‘’]/g, "'");
  assert.ok(norm(read('db/seed.js')).includes(norm(HOME_APPLY.quote.text)), 'the quotation is not in the Useful Thinking article source');
  assert.ok(read('lib/usefulThinkingArticles.js').includes(HOME_APPLY.quote.href.split('/').pop()), 'the article it links to is not in the register');
});

test('the partial holds no wording of its own and renders every line', async () => {
  const src = emitted('views/partials/home-apply.ejs');
  // Anything a visitor reads comes through an EJS output tag.
  const literal = src.replace(/<%[\s\S]*?%>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ');
  assert.deepStrictEqual(literal.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)), ['from', 'on', 'Google'], 'wording is typed into the partial');
  const data = homeApplyData({ wsa: WSA });
  const html = await ejs.renderFile(path.join(root, 'views/partials/home-apply.ejs'), {
    homeApply: data, googleReviews: { rating: 5, userRatingCount: 5 }
  });
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&rsquo;|&#8217;|&#39;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  for (const line of allCopy(data)) {
    assert.ok(text.includes(line.replace(/\s+/g, ' ')), `not rendered: ${line}`);
  }
  assert.ok(text.includes('5.0 from 5 reviews on Google'));
  assert.strictEqual((html.match(/class="ha-result"/g) || []).length, 3);
  // No Google answer: no rating line, and nothing made up in its place.
  const none = await ejs.renderFile(path.join(root, 'views/partials/home-apply.ejs'), { homeApply: data, googleReviews: null });
  assert.ok(!/data-home-rating/.test(none) && !/reviews on Google/.test(none));
  // No button in these sections: the hero and the form carry the one ask.
  assert.ok(!/class="btn/.test(html), 'a button competes with "Apply to work with us"');
});

test('the home hero: one gold button to the form, nothing under it but the credential line', () => {
  const index = emitted('views/index.ejs');
  const heroStart = index.indexOf('<!-- HERO -->');
  const heroEnd = index.indexOf('</section>', heroStart);
  const hero = index.slice(heroStart, heroEnd);
  const cta = hero.indexOf('<div class="hero-cta-row home-hero-cta"');
  assert.ok(cta > 0, 'the home hero button is missing');
  const button = hero.slice(cta, hero.indexOf('</div>', cta));
  assert.strictEqual((button.match(/<a /g) || []).length, 1);
  assert.ok(button.includes('href="#conversation"') && button.includes('btn-primary'));
  assert.ok(button.includes("content[_k + '.cta'] || 'Apply to work with us'"), 'the hero button is not the hero CMS text with the approved fallback');
  assert.ok(!/first conversation is free|no obligation|home-offers/.test(index), 'the old line or the boxes are still in the page');
  // The new sections follow the home page's opening hero, once.
  assert.strictEqual((index.match(/include\('partials\/home-apply'/g) || []).length, 1);
  assert.ok(index.indexOf("include('partials/home-apply'") > heroEnd);
  assert.ok(/typeof homeApply !== 'undefined' && homeApply && _i === 0/.test(index), 'not limited to the opening hero');
  assert.ok(!fs.existsSync(path.join(root, 'views/partials/home-offers.ejs')), 'the boxes partial is still in the repo');
  assert.ok(/\.ha-section\s*\{/.test(read('views/index.ejs')) && /\.ha-offer\s*\{/.test(read('views/index.ejs')), 'the sections have no style');
});

test('the apply wording is the home page\'s alone; every other page keeps the shared form and top bar', async () => {
  const server = read('server.js');
  const block = server.slice(server.indexOf('let homeApply = null;'), server.indexOf("res.render('index'"));
  assert.ok(/if \(currentPage\.slug === 'main'\) \{[\s\S]*Object\.assign\(pageContact, HOME_APPLY_CONTACT\)/.test(block), 'the override is not limited to the home page');
  assert.strictEqual((server.match(/HOME_APPLY_CONTACT/g) || []).length, 2, 'the override is applied somewhere else too');
  assert.ok(!/homeApply|HOME_APPLY/.test(read('lib/navShell.js')), 'the standalone pages picked up the home page wording');
  assert.strictEqual(HOME_APPLY_CONTACT.heading, 'Apply to work with us');
  assert.strictEqual(HOME_APPLY_CONTACT.headerCtaText, 'Apply to work with us');
  assert.strictEqual(HOME_APPLY_CONTACT.submitText, 'Send your application');

  const base = { label: '', heading: 'H', body: 'B', messagePlaceholder: 'M', submitText: 'Ask Tom to get in touch', headerCtaText: 'Start a conversation' };
  const content = { 'contact.email': 'tom@example.invalid', 'contact.phone': '01752 477026', 'contact.whatsapp': 'https://wa.me/441752477026' };
  const footer = (pc) => ejs.renderFile(path.join(root, 'views/partials/site-footer.ejs'), { canEdit: false, pageContact: pc, content, heardAboutOptions: [], currentPage: { slug: 'x' } });
  const shared = await footer(base);
  assert.ok(shared.includes('Tom reads every enquiry himself and replies personally, usually within one working day. The first conversation is free and there&#39;s no obligation.'), 'the shared form line changed for every page');
  const home = await footer({ ...base, ...HOME_APPLY_CONTACT });
  assert.ok(home.includes(HOME_APPLY_CONTACT.nextText) && !/no obligation/.test(home));
  assert.ok(home.includes('>Send your application</button>'));
  // Phone, email and WhatsApp stay under the form (Brand OS: they matter).
  assert.ok(/class="btn btn-whatsapp"/.test(home) && /js-phone-link/.test(home) && /js-email-link/.test(home));

  const header = (pc) => ejs.renderFile(path.join(root, 'views/partials/site-header.ejs'), { currentPage: { slug: 'main' }, navPages: [], canEdit: false, content, pageContact: pc });
  const sharedBar = await header(base);
  assert.strictEqual((sharedBar.match(/WhatsApp us/g) || []).length, 2, 'the shared top bar lost its WhatsApp buttons');
  const homeBar = await header({ ...base, ...HOME_APPLY_CONTACT });
  assert.ok(!/WhatsApp us/.test(homeBar), 'WhatsApp is still in the home page top bar or phone menu');
  assert.strictEqual((homeBar.match(/>Apply to work with us<\/a>/g) || []).length, 2, 'the top bar and the phone menu do not both say Apply');
});

function fakeDb({ order, hidden, content }) {
  const store = new Map(Object.entries(content));
  const page = { section_order: order, hidden_sections: hidden };
  return {
    store, page,
    async query(sql, params = []) {
      if (/^SELECT 1 FROM content WHERE section_key = \$1/.test(sql)) return { rows: store.has(params[0]) ? [{}] : [] };
      if (/^SELECT section_order, hidden_sections FROM pages WHERE slug = 'main'/.test(sql)) return { rows: [{ ...page }] };
      if (/^SELECT content FROM content WHERE section_key = \$1/.test(sql)) return { rows: store.has(params[0]) ? [{ content: store.get(params[0]) }] : [] };
      if (/^UPDATE content SET content = \$1 WHERE section_key = \$2 AND content = \$3/.test(sql)) {
        if (store.get(params[1]) !== params[2]) return { rowCount: 0 };
        store.set(params[1], params[0]);
        return { rowCount: 1 };
      }
      if (/^UPDATE pages SET hidden_sections = \$1::jsonb WHERE slug = 'main' AND hidden_sections = \$2::jsonb/.test(sql)) {
        if (JSON.stringify(page.hidden_sections) !== params[1]) return { rowCount: 0 };
        page.hidden_sections = JSON.parse(params[0]);
        return { rowCount: 1 };
      }
      if (/^INSERT INTO content/.test(sql)) { if (!store.has(params[0])) store.set(params[0], params[1]); return { rowCount: 1 }; }
      throw new Error(`unexpected query: ${sql}`);
    }
  };
}

const live = () => ({
  order: ['hero', 'filter', 'casestudy__7', 'casestudy2__9', 'casestudy2', 'filter__2', 'intervention__5'],
  hidden: ['filter', 'casestudy2'],
  content: { 'hero.subtext': HERO_SUB_FROM, 'hero.cta': HERO_CTA_FROM, 'hero.heading': 'You&rsquo;ve built something you&rsquo;re proud of.' }
});

test('the migration: hero line and button move, the other sections are hidden not deleted, once', async () => {
  const db = fakeDb(live());
  const note = await applyHomeApplyTheme(db);
  assert.strictEqual(db.store.get('hero.subtext'), HERO_SUB_TO);
  assert.strictEqual(db.store.get('hero.cta'), HERO_CTA_TO);
  assert.strictEqual(db.store.get('hero.heading'), 'You&rsquo;ve built something you&rsquo;re proud of.', 'the headline was touched');
  assert.deepStrictEqual(db.page.section_order, live().order, 'a section was removed from the page');
  assert.deepStrictEqual(db.page.hidden_sections, ['filter', 'casestudy2', 'casestudy__7', 'casestudy2__9', 'filter__2', 'intervention__5']);
  assert.match(note, /hidden, not deleted: casestudy__7, casestudy2__9, filter__2, intervention__5/);
  // The marker records what this hid, so it can be put back from the record.
  assert.deepStrictEqual(JSON.parse(db.store.get(MARKER)), { hidden: ['casestudy__7', 'casestudy2__9', 'filter__2', 'intervention__5'] });
  // Run once: a section Tom brings back with its eye button stays back.
  db.page.hidden_sections = ['filter', 'casestudy2'];
  assert.strictEqual(await applyHomeApplyTheme(db), null);
  assert.deepStrictEqual(db.page.hidden_sections, ['filter', 'casestudy2']);
});

test('the migration: a line edited in the CMS wins and is reported', async () => {
  const seed = live();
  seed.content['hero.subtext'] = 'Something Tom wrote in the CMS.';
  seed.content['hero.cta'] = '<strong>Tell us what is going on</strong>';
  const db = fakeDb(seed);
  const note = await applyHomeApplyTheme(db);
  assert.strictEqual(db.store.get('hero.subtext'), 'Something Tom wrote in the CMS.');
  assert.match(note, /hero\.subtext left alone \(live value: "Something Tom wrote in the CMS\."\)/);
  // The same words inside markup are still the old button.
  assert.strictEqual(db.store.get('hero.cta'), HERO_CTA_TO);
});

test('the migration: no hero first means nothing changes and no marker', async () => {
  const seed = live();
  seed.order = ['filter', 'hero'];
  const db = fakeDb(seed);
  assert.match(await applyHomeApplyTheme(db), /does not open with a hero/);
  assert.ok(!db.store.has(MARKER));
  assert.deepStrictEqual(db.page.hidden_sections, ['filter', 'casestudy2']);
  assert.strictEqual(db.store.get('hero.cta'), HERO_CTA_FROM);
});

test('the seed runs the migration, and the home page still has one h1', () => {
  assert.ok(/require\('\.\.\/lib\/homeApply'\)\.applyHomeApplyTheme\(db\)/.test(read('db/seed.js')));
  const partial = emitted('views/partials/home-apply.ejs');
  assert.ok(!/<h1/.test(partial), 'a second h1 on the home page');
});
