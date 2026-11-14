// The World Student Advisors case study (Tom's figures and period, in chat on
// 14/11/2026). Pinned here:
//
//   1. The published figures are the ones Tom can claim today: around 30
//      cold enquiries a day and revenue up 159%. The 250% he expects is an
//      estimate and must not reach the page.
//   2. The migration adds one case study to Evidence after the existing ones,
//      continues the page's numbered series, edits nothing already there and
//      runs once.
//   3. The Commercial Review and Website Build pages quote the case study
//      only while it is on Evidence and visible, the result sentence is read
//      from Evidence (one home for the figures), and the figures stay off the
//      £999 cards.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { OFFERS } = require('../lib/whereToStartOffers');
const {
  MARKER, COPY, REVIEW_LINE, resultSentence, applyWsaCaseStudy, readWsaCaseStudy
} = require('../lib/wsaCaseStudy');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const emitted = (p) => read(p).replace(/<%#[\s\S]*?%>/g, '');
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&pound;/g, '£').replace(/\s+/g, ' ');

function fakeDb({ pages, content }) {
  const store = new Map(Object.entries(content));
  return {
    store, pages,
    async query(sql, params = []) {
      if (/^SELECT 1 FROM content WHERE section_key = \$1/.test(sql)) return { rows: store.has(params[0]) ? [{}] : [] };
      if (/^SELECT content FROM content WHERE section_key = \$1/.test(sql)) return { rows: store.has(params[0]) ? [{ content: store.get(params[0]) }] : [] };
      if (/^SELECT slug, section_order FROM pages$/.test(sql)) return { rows: pages.map((p) => ({ slug: p.slug, section_order: p.section_order })) };
      if (/^SELECT section_order, hidden_sections FROM pages WHERE slug = 'evidence'/.test(sql)) return { rows: pages.filter((p) => p.slug === 'evidence') };
      if (/^SELECT DISTINCT split_part/.test(sql)) return { rows: [...new Set([...store.keys()].map((k) => k.split('.')[0]))].map((instance_id) => ({ instance_id })) };
      if (/^INSERT INTO content/.test(sql)) { if (!store.has(params[0])) store.set(params[0], params[1]); return { rowCount: 1 }; }
      if (/^UPDATE pages SET section_order = \$1::jsonb WHERE slug = 'evidence' AND section_order = \$2::jsonb/.test(sql)) {
        const ev = pages.find((p) => p.slug === 'evidence');
        if (JSON.stringify(ev.section_order) !== params[1]) return { rowCount: 0 };
        ev.section_order = JSON.parse(params[0]);
        return { rowCount: 1 };
      }
      throw new Error(`unexpected query: ${sql}`);
    }
  };
}

// Production's Evidence page as the deploy logs describe it.
const livePages = () => [
  { slug: 'main', section_order: ['hero', 'casestudy__7', 'casestudy2__6', 'filter__2'], hidden_sections: [] },
  { slug: 'evidence', section_order: ['hero__2', 'biography__2', 'casestudy__4', 'casestudy2__2', 'casestudy2__5', 'documents', 'builtproof'], hidden_sections: [] },
  { slug: 'websites-and-ai', section_order: ['hero__5', 'casestudy2__4'], hidden_sections: [] }
];
const liveContent = () => ({
  'casestudy__4.label': '<strong>Evidence: 02</strong>',
  'casestudy__4.heading': 'The Insolvent Turnaround',
  'casestudy2__2.label': '<strong>EVIDENCE: 03</strong>',
  'casestudy2__2.heading': 'More Margin From the Work Already There',
  'casestudy2__5.label': '<strong>EVIDENCE: 04</strong>',
  'casestudy2__5.heading': 'The VAT Intervention',
  'casestudy2__3.heading': 'An orphaned instance whose rows are still in the table'
});

test('the figures are the ones Tom can claim today, and the estimate is not published', () => {
  const all = Object.values(COPY).join(' ') + ' ' + REVIEW_LINE;
  assert.match(COPY.heading, /around 30 a day/);
  assert.match(COPY.outcome, /from about one a month to around 30 a day/);
  assert.match(COPY.outcome, /revenue is up 159%/);
  assert.match(COPY.outcome, /Since June 2026/);
  assert.doesNotMatch(all, /250/, 'the 250% estimate reached the copy');
  assert.doesNotMatch(all, /30 to 40|40 a day/, 'the superseded enquiry figure is back');
  assert.doesNotMatch(all, /estimat|expect|forecast|on track|set to/i, 'an expected outcome is stated');
  // The only numbers on the page are the ones Tom gave.
  const numbers = text(all).match(/\d+%?/g) || [];
  assert.deepStrictEqual([...new Set(numbers)].sort(), ['159%', '2026', '30'].sort());
});

test('the copy keeps to the website rules: we voice, no dashes, no banned words, no client named beyond the business', () => {
  const all = Object.values(COPY).join(' ');
  assert.doesNotMatch(all, /[–—]/, 'a dash');
  assert.doesNotMatch(all, /\bI\b|\bmy\b/, 'first person');
  assert.doesNotMatch(all, /transform|journey|solution|leverage|empower|bespoke|tailored|holistic|world class|synergy|coach/i);
  assert.doesNotMatch(all, /\bTim\b|Hunt/, 'the client contact is named');
  assert.doesNotMatch(all, /£|999/, 'a price is in the case study');
  assert.match(COPY.body, /The work included a Commercial Review/);
  assert.strictEqual(COPY.button_href, 'https://www.worldstudentadvisors.com/');
  assert.match(COPY.outcome, /Published with the agreement of World Student Advisors\./);
});

test('the result sentence is the outcome up to its first line break, tags removed', () => {
  assert.strictEqual(
    resultSentence(COPY.outcome),
    'Since June 2026, cold enquiries have gone from about one a month to around 30 a day, and revenue is up 159%.'
  );
  assert.strictEqual(resultSentence(''), '');
  assert.strictEqual(resultSentence('<p>Up <strong>200%</strong>.</p><br>More'), 'Up 200%.');
});

test('the migration adds one case study after the last one, as the next in the series, and edits nothing else', async () => {
  const db = fakeDb({ pages: livePages(), content: liveContent() });
  const before = new Map(db.store);
  const note = await applyWsaCaseStudy(db);
  const ev = db.pages.find((p) => p.slug === 'evidence');
  // casestudy2__2, __3 (orphan rows), __4, __5 and __6 are taken.
  assert.deepStrictEqual(ev.section_order, ['hero__2', 'biography__2', 'casestudy__4', 'casestudy2__2', 'casestudy2__5', 'casestudy2__7', 'documents', 'builtproof']);
  assert.match(note, /casestudy2__7/);
  assert.strictEqual(db.store.get('casestudy2__7.label'), '<strong>EVIDENCE: 05</strong>');
  for (const field of Object.keys(COPY)) assert.strictEqual(db.store.get(`casestudy2__7.${field}`), COPY[field]);
  assert.strictEqual(db.store.get(MARKER), 'casestudy2__7', 'the marker does not hold the id');
  for (const [k, v] of before) assert.strictEqual(db.store.get(k), v, `${k} was changed`);
  for (const p of db.pages) if (p.slug !== 'evidence') assert.ok(!p.section_order.includes('casestudy2__7'));
});

test('it runs once: a second boot does nothing, and a section Tom removes stays removed', async () => {
  const db = fakeDb({ pages: livePages(), content: liveContent() });
  await applyWsaCaseStudy(db);
  const ev = db.pages.find((p) => p.slug === 'evidence');
  ev.section_order = ev.section_order.filter((s) => s !== 'casestudy2__7');
  assert.strictEqual(await applyWsaCaseStudy(db), null);
  assert.ok(!ev.section_order.includes('casestudy2__7'));
});

test('no Evidence page: it waits without stamping; an existing copy is adopted; a changed page is not overwritten', async () => {
  const fresh = fakeDb({ pages: [{ slug: 'main', section_order: ['hero'], hidden_sections: [] }], content: {} });
  assert.match(await applyWsaCaseStudy(fresh), /no evidence page/);
  assert.ok(!fresh.store.has(MARKER));

  const adopted = fakeDb({ pages: livePages(), content: { ...liveContent(), 'casestudy2__5.heading': COPY.heading } });
  assert.match(await applyWsaCaseStudy(adopted), /already carries/);
  assert.strictEqual(adopted.store.get(MARKER), 'casestudy2__5');
  assert.strictEqual(adopted.pages.find((p) => p.slug === 'evidence').section_order.length, 7);

  const raced = fakeDb({ pages: livePages(), content: liveContent() });
  const realQuery = raced.query.bind(raced);
  raced.query = async (sql, params) => {
    if (/^UPDATE pages SET section_order/.test(sql)) raced.pages.find((p) => p.slug === 'evidence').section_order.push('filter__9');
    return realQuery(sql, params);
  };
  assert.match(await applyWsaCaseStudy(raced), /changed while this ran/);
  assert.ok(!raced.store.has(MARKER), 'stamped although the section was not placed');
});

test('the pages only quote a case study a visitor can open', async () => {
  const db = fakeDb({ pages: livePages(), content: liveContent() });
  assert.strictEqual(await readWsaCaseStudy(db), null, 'quoted before it exists');
  await applyWsaCaseStudy(db);
  assert.deepStrictEqual(await readWsaCaseStudy(db), {
    href: '/evidence#casestudy2__7',
    result: 'Since June 2026, cold enquiries have gone from about one a month to around 30 a day, and revenue is up 159%.'
  });
  // A figure changed in the CMS is the figure quoted.
  db.store.set('casestudy2__7.outcome', 'Revenue is up <strong>180%</strong>.');
  assert.strictEqual((await readWsaCaseStudy(db)).result, 'Revenue is up 180%.');
  const ev = db.pages.find((p) => p.slug === 'evidence');
  ev.hidden_sections = ['casestudy2__7'];
  assert.strictEqual(await readWsaCaseStudy(db), null, 'quoted while hidden');
  ev.hidden_sections = [];
  ev.section_order = ev.section_order.filter((s) => s !== 'casestudy2__7');
  assert.strictEqual(await readWsaCaseStudy(db), null, 'quoted after it was removed');
  db.store.set(MARKER, '2026-11-14T00:00:00Z');
  assert.strictEqual(await readWsaCaseStudy(db), null, 'a marker that is not an id was trusted');
});

function renderPage(view, locals) {
  const src = emitted(view).replace(/<%-\s*include\([\s\S]*?\)\s*%>/g, '');
  const html = ejs.render(src, { theme: { vars: {} }, nonce: 'n', csrfToken: 't', navPages: [], content: {}, pageContact: {}, ...locals });
  return html.slice(html.indexOf('<body>'));
}
const CASE = { href: '/evidence#casestudy2__7', result: resultSentence(COPY.outcome) };

test('the Commercial Review page shows the client result under "See the standard", or nothing', () => {
  const without = renderPage('views/where-to-start-commercial-review.ejs', { offer: OFFERS.commercial_review });
  assert.doesNotMatch(without, /data-review-result/);
  assert.doesNotMatch(text(without), /World Student Advisors|159%/);

  const body = renderPage('views/where-to-start-commercial-review.ejs', { offer: OFFERS.commercial_review, wsaCaseStudy: CASE, wsaReviewLine: REVIEW_LINE });
  const block = body.match(/<a class="wts-evidence-card wts-evidence-result" data-review-result href="\/evidence#casestudy2__7">[\s\S]*?<\/a>/);
  assert.ok(block, 'the result block is missing');
  assert.strictEqual(
    text(block[0]).trim(),
    'World Student Advisors Since June 2026, cold enquiries have gone from about one a month to around 30 a day, and revenue is up 159%. The work included a Commercial Review. Read the case study'
  );
  assert.ok(body.indexOf('See the standard') < body.indexOf('data-review-result'));
  assert.ok(body.indexOf('data-review-result') < body.indexOf('Half-Time Team Talk'), 'the result should come before the document');
  // The figures are not typed into the view.
  assert.doesNotMatch(read('views/where-to-start-commercial-review.ejs'), /159|30 a day/);
});

test('the Website Build page links to the case study and keeps the figures off the £999 cards', () => {
  const locals = { offer: OFFERS.website_build, websiteBuildProofHref: '/websites-and-ai#casestudy2__4', builtProofHref: '/evidence#builtproof' };
  const without = renderPage('views/where-to-start-website-build.ejs', locals);
  assert.doesNotMatch(without, /data-built-case-study/);

  const body = renderPage('views/where-to-start-website-build.ejs', { ...locals, wsaCaseStudy: CASE });
  assert.match(body, /<p class="wts-built-more" data-built-case-study><a href="\/evidence#casestudy2__7">Read the World Student Advisors case study<\/a><\/p>/);
  assert.doesNotMatch(text(body), /159%|30 a day|cold enquir/, 'the result is on the £999 page');
  assert.doesNotMatch(read('views/where-to-start-website-build.ejs'), /159|30 a day/);
  const section = body.match(/<section class="wts-built"[\s\S]*?<\/section>/)[0];
  assert.ok(section.includes('data-built-case-study'), 'the link is outside the built work section');
  assert.strictEqual((section.match(/class="wts-built-card"/g) || []).length, 4);
});

test('the seed runs the migration, never fatally, and the routes survive a failed read', () => {
  const seed = read('db/seed.js');
  assert.match(seed, /require\('\.\.\/lib\/wsaCaseStudy'\)\.applyWsaCaseStudy\(db\)/);
  assert.match(seed, /World Student Advisors case study migration failed \(boot continues\)/);
  const routes = read('routes/whereToStart.js');
  assert.match(routes, /async function loadWsaCaseStudy\(\) \{\s*try \{[\s\S]*?\} catch \(err\) \{[\s\S]*?return null;/);
  assert.strictEqual((routes.match(/wsaCaseStudy: await loadWsaCaseStudy\(\)/g) || []).length, 2);
});
