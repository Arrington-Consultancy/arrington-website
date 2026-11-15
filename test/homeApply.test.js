// The home page on the "apply to work with us" theme (Tom, 15/11/2026; see
// lib/homeApply.js for his words and the outside judge's changes he
// approved). One button, results first with the client result leading, who
// we work with, three steps, the offers as quiet links with no prices, the
// page's live client quote block, and the form headed "Apply to work with
// us". Home page only.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const {
  MARKER, HOME_APPLY, HOME_APPLY_CONTACT, WSA_FIGURE_PHRASE, WSA_DID, WSA_QUOTE_SENTENCE,
  HERO_CTA_FROM, HERO_CTA_TO, homeApplyData, applyHomeApplyTheme
} = require('../lib/homeApply');
const { OFFER_LINKS } = require('../lib/mainNav');
const { COPY: WSA_COPY, QUOTE: WSA_QUOTE, readWsaHomeProof } = require('../lib/wsaCaseStudy');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const emitted = (p) => read(p).replace(/<%#[\s\S]*?%>/g, '');

// What readWsaHomeProof() returns while the case study is on Evidence as
// published: its own result sentence, body and the client's quote.
const WSA = {
  href: '/evidence#casestudy2__7',
  result: 'Since June 2026, cold enquiries have gone from about one a month to around 30 a day, and revenue is up 159%.',
  body: WSA_COPY.body,
  quote: WSA_QUOTE.quote,
  quoteName: WSA_QUOTE.quote_name
};

// Every string a visitor reads, from the one place the wording lives.
function allCopy(data) {
  const out = [];
  const walk = (v, key) => {
    if (typeof v === 'string') { if (key !== 'href' && v) out.push(v); return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x)); return; }
    if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k));
  };
  walk(data);
  return out;
}

test('the wording: Tom\'s points are in, and what he ruled out is not', () => {
  const data = homeApplyData({ wsa: WSA });
  const copy = [...allCopy(data), ...allCopy({ ...HOME_APPLY_CONTACT }), HERO_CTA_TO];
  // Ours, as distinct from the client's own sentence, which is speech.
  const ours = copy.filter((c) => c !== WSA_QUOTE_SENTENCE && c !== WSA.quoteName);
  const text = ours.join(' \n ');
  assert.ok(text.includes('The limit is our time, so we take on a few businesses at a time.'));
  assert.ok(text.includes('If the business is past the point where we can help, we will say so, and we won’t take your money.'));
  assert.ok(text.includes('Different businesses, made stronger in different ways.'));
  assert.ok(text.includes('We don’t charge for it'), 'the first conversation is no longer said to cost nothing');
  // Selectiveness is said once, not announced (the outside judge, approved
  // by Tom): firms in demand do not explain it.
  assert.ok(!/selective/i.test(text), '"selective" is said out loud');
  assert.strictEqual((text.match(/a few (?:businesses )?at a time/g) || []).length, 1, 'the limit is said more than once');
  // No list of who we are not for (Tom, 06/10/2026: "we don't tell them
  // what we won't do, that's the brand").
  assert.ok(!('no' in HOME_APPLY.fit) && !('noHeading' in HOME_APPLY.fit), 'the "not if" list is back');
  assert.ok(!/probably not|coach|retainer|agree with you/i.test(text), 'a line from the "not if" list is back');
  // "Free" reads cheap (Tom); "Tom does the work himself sounds small time".
  assert.ok(!/\bfree\b/i.test(text), '"free" is back on the home page');
  assert.ok(!/no obligation/i.test(text), 'the reassurance line is back');
  assert.ok(!/himself|herself/i.test(text), '"Tom ... himself" is back');
  assert.ok(!/turn(?:ed|s|ing)? (?:\w+ ){0,3}around|turnaround/i.test(text), '"turned around" is on the home page (Brand OS: not a rescue service)');
  assert.ok(!/rescu/i.test(text), 'the page talks about rescue');
  // No price on the home page: prices are on the offer pages.
  assert.ok(!/£\s?\d/.test(text), 'a price is on the home page');
  // Brand OS.
  assert.ok(!/[–—]/.test(copy.join(' ')), 'a dash in the wording');
  assert.ok(!/\b(solutions|synergy|leverage|empower|journey|holistic|tailored|bespoke|transformational|world class|unlock)\b/i.test(text), 'a Brand OS avoided word');
  assert.ok(!/\bfire|firefight|burn/i.test(text), 'a fire metaphor');
  assert.ok(!/\b(I|my|me)\b/.test(text), 'first person in our own wording');
  // Tom, 15/11/2026: "let's not over mention Tom, in the right place and for
  // good reason yes". In our wording he is named once: the business he
  // built himself. (The client's sentence names him too; that is speech.)
  assert.deepStrictEqual(ours.filter((c) => /\bTom\b/.test(c)), [HOME_APPLY.results.abacus.text], 'Tom is named somewhere new on the home page');
});

test('the three offers are the menu\'s three, as links with no price', () => {
  assert.deepStrictEqual(HOME_APPLY.offers.items.map((o) => o.href), OFFER_LINKS.map((l) => `/${l.slug}`));
  for (const o of HOME_APPLY.offers.items) assert.ok(!/£|\d{3}/.test(o.name + o.line), `${o.name} carries a figure`);
});

test('World Student Advisors leads the results, and every part of it is read from the case study on Evidence', () => {
  const r = homeApplyData({ wsa: WSA }).results;
  // The client result leads; the two from Tom's own career follow.
  assert.ok(r.lead, 'the client result is missing');
  assert.deepStrictEqual(r.tiles.map((t) => `${t.figure} ${t.unit}`), ['24 months', '18 years']);
  // The sentence is the case study's own, word for word (the same source the
  // Commercial Review page reads), with its link.
  assert.strictEqual(r.lead.text, WSA.result);
  assert.strictEqual(r.lead.href, WSA.href);
  // Tim's consent says "around 30 a day": the large figure says "around" too.
  assert.strictEqual(`${r.lead.pre} ${r.lead.figure} ${r.lead.unit}`, WSA_FIGURE_PHRASE);
  assert.ok(WSA.result.includes(WSA_FIGURE_PHRASE));
  // What we did is a sentence of the published case study.
  assert.strictEqual(r.lead.did, 'We rebuilt the website around the enquiry and connected it to the CRM.');
  assert.ok(WSA_COPY.body.includes(WSA_DID.replace(/\.$/, '')), 'the "what we did" sentence is not in the published case study');
  // One whole sentence of the client's quote, unedited, with his name line.
  assert.strictEqual(r.lead.quote, 'I brought Tom in to tackle owner dependency, but he blew me away with his use of technology, revolutionising the website and integrating the CRM and AI.');
  assert.ok(WSA_QUOTE.quote.includes(`. ${WSA_QUOTE_SENTENCE} `), 'the sentence is not a whole sentence of the published quote');
  assert.strictEqual(r.lead.quoteName, 'Tim Hunt, World Student Advisors');

  // Hidden or missing on Evidence: no client result, the other two stand.
  for (const gone of [null, undefined]) {
    const none = homeApplyData({ wsa: gone }).results;
    assert.strictEqual(none.lead, null);
    assert.strictEqual(none.tiles.length, 2);
  }
  // A figure changed in the CMS takes the result off rather than leaving 30.
  assert.strictEqual(homeApplyData({ wsa: { ...WSA, result: 'Cold enquiries have gone to around 45 a day.' } }).results.lead, null);
  // An address that is not an Evidence anchor is never rendered.
  assert.strictEqual(homeApplyData({ wsa: { ...WSA, href: '//evil.example' } }).results.lead, null);
  // A quote edited or withdrawn on Evidence leaves the home page too; the
  // result itself stays.
  for (const quote of ['', 'He was fine.', WSA.quote.replace('blew me away', 'impressed me')]) {
    const lead = homeApplyData({ wsa: { ...WSA, quote } }).results.lead;
    assert.ok(lead && lead.quote === '' && lead.quoteName === '', 'a quote Evidence no longer carries is on the home page');
  }
  assert.strictEqual(homeApplyData({ wsa: { ...WSA, quoteName: '' } }).results.lead.quote, '', 'a quote with no name is shown');
  // The same for what we did.
  assert.strictEqual(homeApplyData({ wsa: { ...WSA, body: 'We did other things.' } }).results.lead.did, '');
});

test('readWsaHomeProof reads the body and quote from the case study, or nothing', async () => {
  const rows = {
    'evidence.wsa_case_study_2026-11-14': 'casestudy2__7',
    'casestudy2__7.outcome': `${WSA.result}<br><br>Published with the agreement of World Student Advisors.`,
    'casestudy2__7.body': `<p>${WSA_COPY.body}</p>`,
    'casestudy2__7.quote': WSA_QUOTE.quote,
    'casestudy2__7.quote_name': WSA_QUOTE.quote_name
  };
  const page = { section_order: ['casestudy2__7'], hidden_sections: [] };
  const db = {
    async query(sql, params = []) {
      if (/FROM pages WHERE slug = 'evidence'/.test(sql)) return { rows: [page] };
      if (/^SELECT content FROM content WHERE section_key = \$1/.test(sql)) return { rows: params[0] in rows ? [{ content: rows[params[0]] }] : [] };
      throw new Error(`unexpected query: ${sql}`);
    }
  };
  const got = await readWsaHomeProof(db);
  assert.deepStrictEqual(got, WSA);
  assert.ok(homeApplyData({ wsa: got }).results.lead.quote, 'the published case study does not produce the home page result');
  page.hidden_sections = ['casestudy2__7'];
  assert.strictEqual(await readWsaHomeProof(db), null, 'read while hidden on Evidence');
});

test('the partial holds no wording of its own and renders every line', async () => {
  const src = emitted('views/partials/home-apply.ejs');
  // Anything a visitor reads comes through an EJS output tag.
  const literal = src.replace(/<%[\s\S]*?%>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ');
  assert.deepStrictEqual(literal.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)), [], 'wording is typed into the partial');
  const data = homeApplyData({ wsa: WSA });
  const html = await ejs.renderFile(path.join(root, 'views/partials/home-apply.ejs'), { homeApply: data });
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&rsquo;|&#8217;|&#39;/g, '’').replace(/&ldquo;|&rdquo;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  for (const line of allCopy(data)) {
    assert.ok(text.includes(line.replace(/\s+/g, ' ')), `not rendered: ${line}`);
  }
  // The client result comes before the other two.
  assert.ok(html.indexOf('data-home-lead') > 0 && html.indexOf('data-home-lead') < html.indexOf('class="ha-results"'));
  assert.strictEqual((html.match(/class="ha-result"/g) || []).length, 3);
  // The promise stands alone: it is not an item in a list.
  const promise = html.slice(html.indexOf('data-home-promise'));
  assert.ok(/^data-home-promise>If the business is past the point/.test(promise) && !/<li>[^<]*past the point/.test(html));
  assert.strictEqual((html.match(/<ul>/g) || []).length, 1, 'a second list is on the page');
  // With no client result, the section still renders its two results.
  const none = await ejs.renderFile(path.join(root, 'views/partials/home-apply.ejs'), { homeApply: homeApplyData({ wsa: null }) });
  assert.ok(!/data-home-lead/.test(none) && (none.match(/class="ha-result"/g) || []).length === 2);
  // No button in these sections: the hero and the form carry the one ask.
  assert.ok(!/class="btn/.test(html), 'a button competes with "Apply to work with us"');
  assert.ok(!/<h1/.test(html), 'a second h1 on the home page');
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
  assert.ok(/\.ha-section\s*\{/.test(read('views/index.ejs')) && /\.ha-offer\s*\{/.test(read('views/index.ejs')) && /\.ha-lead\s*\{/.test(read('views/index.ejs')), 'the sections have no style');
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

const HERO_LINE = 'Business consultant for established owner run businesses across Devon and Cornwall.';
const live = () => ({
  order: ['hero', 'filter', 'casestudy__7', 'casestudy2__9', 'casestudy2', 'filter__2', 'intervention__5', 'intervention__6'],
  hidden: ['filter', 'casestudy2'],
  content: {
    'hero.subtext': HERO_LINE,
    'hero.cta': HERO_CTA_FROM,
    'hero.heading': 'You&rsquo;ve built something you&rsquo;re proud of.',
    'intervention__5.subtext': '"Tom has been through it himself and you can tell."',
    'intervention__5.quote_attribution': 'Dan, Spaniel Taxis',
    // An ordinary section with a button, no quote: not a client quote block.
    'intervention__6.subtext': 'Something else.',
    'intervention__6.quote_attribution': ''
  }
});

test('the migration: the button moves, the hero line stays, the client quote stays, the rest is hidden not deleted, once', async () => {
  const db = fakeDb(live());
  const note = await applyHomeApplyTheme(db);
  assert.strictEqual(db.store.get('hero.cta'), HERO_CTA_TO);
  // The hero line carries the search words and is not touched.
  assert.strictEqual(db.store.get('hero.subtext'), HERO_LINE, 'the hero line was changed');
  assert.strictEqual(db.store.get('hero.heading'), 'You&rsquo;ve built something you&rsquo;re proud of.', 'the headline was touched');
  assert.deepStrictEqual(db.page.section_order, live().order, 'a section was removed from the page');
  assert.deepStrictEqual(db.page.hidden_sections, ['filter', 'casestudy2', 'casestudy__7', 'casestudy2__9', 'filter__2', 'intervention__6']);
  assert.ok(!db.page.hidden_sections.includes('intervention__5'), 'the client quote block was hidden');
  assert.match(note, /hidden, not deleted: casestudy__7, casestudy2__9, filter__2, intervention__6; client quote block kept: intervention__5/);
  // The marker records what this hid, so it can be put back from the record.
  assert.deepStrictEqual(JSON.parse(db.store.get(MARKER)), { hidden: ['casestudy__7', 'casestudy2__9', 'filter__2', 'intervention__6'], kept: ['intervention__5'] });
  // Run once: a section Tom brings back with its eye button stays back.
  db.page.hidden_sections = ['filter', 'casestudy2'];
  assert.strictEqual(await applyHomeApplyTheme(db), null);
  assert.deepStrictEqual(db.page.hidden_sections, ['filter', 'casestudy2']);
});

test('the migration: a button edited in the CMS wins and is reported', async () => {
  const seed = live();
  seed.content['hero.cta'] = 'Something Tom wrote in the CMS';
  const db = fakeDb(seed);
  const note = await applyHomeApplyTheme(db);
  assert.strictEqual(db.store.get('hero.cta'), 'Something Tom wrote in the CMS');
  assert.match(note, /hero\.cta left alone \(live value: "Something Tom wrote in the CMS"\)/);
  // The same words inside markup are still the old button.
  const marked = live();
  marked.content['hero.cta'] = '<strong>Tell us what is going on</strong>';
  const db2 = fakeDb(marked);
  await applyHomeApplyTheme(db2);
  assert.strictEqual(db2.store.get('hero.cta'), HERO_CTA_TO);
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

test('the seed runs the migration', () => {
  assert.ok(/require\('\.\.\/lib\/homeApply'\)\.applyHomeApplyTheme\(db\)/.test(read('db/seed.js')));
});
