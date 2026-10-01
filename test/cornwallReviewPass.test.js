'use strict';

// Cornwall landing page review pass (01/10/2026). Tom reviewed the live page
// and raised findings to investigate against the controlled evidence. Two
// held up and are applied by a guarded migration in db/seed.js:
//   1. the proof block stops being a founder story and takes the compact,
//      business-centred case study copy Tom approved for the home page;
//   2. step 2 of "What happens next" names the Commercial Review and its
//      £500 price, in wording already live on What We Do, with a text link.
// These tests pin the migration's shape from source and the optional step
// link's render guard, so a careless edit cannot reintroduce the three
// things the review objected to or let an unsafe href reach an attribute.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const seed = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.js'), 'utf8');
const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'index.ejs'), 'utf8');

function migration() {
  const start = seed.indexOf("const REVIEW_MARKER = 'site.cornwall_review_pass_2026-10-01'");
  assert.ok(start > 0, 'the review-pass migration exists');
  const end = seed.indexOf('// Migration: tighten SEO snippets flagged in the 17/08/2026 audit', start);
  return seed.slice(start, end);
}

test('the migration is guarded by its marker and matches rows on their exact current value', () => {
  const m = migration();
  assert.match(m, /SELECT 1 FROM content WHERE section_key = \$1', \[REVIEW_MARKER\]/);
  assert.match(m, /UPDATE content SET content = \$1 WHERE section_key = \$2 AND content = \$3/);
  // No write targets the home page or the Devon page: every UPDATE goes
  // through updateExact on a Cornwall instance id, and the only reads of
  // the home page are getContent calls.
  assert.doesNotMatch(m, /business-consultant-devon/);
  assert.ok(!/updateExact\(`\$\{mainCase\}/.test(m), 'the home page is only ever read');
});

test('the proof block takes the home page copy only when that copy is the approved compact form', () => {
  const m = migration();
  assert.match(m, /includes\('Twenty four months, start to sale'\)/);
});

test('the three things the review objected to are matched as OLD values, never written as new ones', () => {
  const m = migration();
  const writes = m.split('\n').filter((l) => /updateExact\(|insertIfAbsent\(/.test(l) && !/const /.test(l)).join('\n');
  for (const phrase of ['seven-figure', 'to help rescue it', 'Tom rebuilt']) {
    assert.ok(m.includes(phrase), `${phrase} is still matched as an old value`);
    assert.ok(!writes.includes(phrase), `${phrase} must not be written`);
  }
});

test('step 2 names the Commercial Review and the settled public price, and links to the review page', () => {
  const m = migration();
  assert.match(m, /<strong>Commercial Review, £500\.<\/strong>/);
  assert.match(m, /'<strong>Commercial Review<\/strong>'/);
  assert.match(m, /\/where-to-start\/commercial-review/);
  // The price is stated, never framed as a reduction (see
  // test/productGuidePricePublication.test.js for the site-wide rule).
  assert.doesNotMatch(m, /discount|introductory|50%|was £/i);
});

test('the step 2 wording is the wording already live on What We Do', () => {
  const sentence = 'We listen, go through the business and the evidence, and write it up: what we found, what we would do about it, and what to do first.';
  assert.ok(seed.indexOf(sentence) !== seed.lastIndexOf(sentence), 'the sentence appears in the What We Do seed as well as this migration');
});

function approachLink() {
  // Lift the guard straight out of the view so the test exercises the
  // deployed expression rather than a copy of it.
  const m = /const _approachLink = \(k, n\) => \{([\s\S]*?)\n  \};/.exec(view);
  assert.ok(m, '_approachLink is declared in the approach block');
  // eslint-disable-next-line no-new-func
  return new Function('content', 'return (k, n) => {' + m[1] + '\n};');
}

test('an approach step link resolves only for a root-relative href with no traversal', () => {
  const link = approachLink();
  const ok = link({ 'a.step_2_link_text': 'What the review covers', 'a.step_2_link_href': '/where-to-start/commercial-review' })('a', 2);
  assert.deepEqual(ok, { text: 'What the review covers', href: '/where-to-start/commercial-review' });
  assert.deepEqual(link({ 'a.step_1_link_text': 'x', 'a.step_1_link_href': '/evidence#casestudy__4' })('a', 1), { text: 'x', href: '/evidence#casestudy__4' });
  for (const bad of ['https://evil.example/', 'javascript:alert(1)', '/a/../b', '//evil.example', 'where-to-start', '']) {
    assert.equal(link({ 'a.step_2_link_text': 'x', 'a.step_2_link_href': bad })('a', 2), null, `no link for href ${JSON.stringify(bad)}`);
  }
  assert.equal(link({ 'a.step_2_link_href': '/where-to-start/commercial-review' })('a', 2), null, 'no link without text');
  assert.equal(link({ 'a.step_2_link_text': '<b></b>', 'a.step_2_link_href': '/x' })('a', 2), null, 'tags-only text is no text');
});

test('the approach markup renders the link for all three steps through that guard', () => {
  for (const n of [1, 2, 3]) {
    assert.ok(view.includes(`const _stepLink${n} = _approachLink(_k, ${n});`), `step ${n} calls the guard`);
    assert.ok(view.includes(`<% if (_stepLink${n}) { %><p class="step-link"><a href="<%= _stepLink${n}.href %>">`), `step ${n} renders through the guard`);
  }
});

test('every internal link guard in the view refuses a protocol-relative href', () => {
  // Found by this file's own guard test on 01/10/2026: //evil.example passed
  // the root-relative check, and the same expression guards both case study
  // link templates. All three carry the same lookahead now.
  const guards = view.match(/\/\^\\\/(\(\?!\\\/\))?\[A-Za-z0-9\._\\-\\\/\]\*\(\?:#/g) || [];
  assert.equal(guards.length, 3, 'three internal link guards in the view');
  for (const g of guards) assert.ok(g.includes('(?!\\/)'), `guard without the lookahead: ${g}`);
});

test('the follow-up matches the old step 2 body with line endings normalised, behind its own marker', () => {
  // Production logged "body left alone" on the first pass: the row had been
  // through the CMS textarea and carried CRLF, and an exact LF match cannot
  // find it. The follow-up normalises before comparing and is a one-shot.
  const start = seed.indexOf("const REVIEW_MARKER_B = 'site.cornwall_review_pass_2026-10-01b'");
  assert.ok(start > 0, 'the follow-up exists');
  const block = seed.slice(start, seed.indexOf('// Migration: tighten SEO snippets flagged in the 17/08/2026 audit', start));
  assert.match(block, /replace\(content, E'\\\\r\\\\n', E'\\\\n'\) = \$3/);
  assert.match(block, /Commercial Review, £500\./);
  assert.ok(!/updateExact|business-consultant-devon|mainCase/.test(block), 'the follow-up touches one Cornwall row only');
});

test('the second follow-up matches only a body that still opens with the sentence from the finding', () => {
  const start = seed.indexOf("const REVIEW_MARKER_C = 'site.cornwall_review_pass_2026-10-01c'");
  assert.ok(start > 0, 'the second follow-up exists');
  const block = seed.slice(start, seed.indexOf('// Migration: tighten SEO snippets flagged in the 17/08/2026 audit', start));
  assert.match(block, /LIKE 'If we both think it is worth exploring further, we carry out a %commercial review%'/);
  assert.match(block, /Commercial Review, £500\./);
  assert.ok(!/business-consultant-devon|mainCase/.test(block), 'one Cornwall row only');
  assert.match(block, /JSON\.stringify\(current\)/, 'it logs the value it found');
});
