// The social copy gate.
//
// Two properties, and the second is the one that decides whether anybody
// keeps using this: it must catch generated copy, and it must not fire
// on the company's own writing. A gate that cries wolf on real Arrington
// copy gets switched off within a week, at which point it protects
// nothing.
//
// The clean corpus below is taken from live Arrington and Scott copy, so
// the false-positive check is against the real voice rather than against
// sentences invented to pass.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkCopy } = require('../lib/social/copyGate');

const blockRules = (r) => r.findings.filter((f) => f.severity === 'block').map((f) => f.rule);

test('every form of a banned dash is blocked, including the HTML entities', () => {
  // The entity forms exist because a grep for the literal character once
  // reported three rendered em dashes as clean.
  for (const dash of ['—', '&mdash;', '&#8212;', '&#x2014;', '–', '&ndash;', '&#8211;']) {
    const r = checkCopy(`We looked at the numbers ${dash} they did not add up.`);
    assert.equal(r.ok, false, `${dash} was allowed through`);
    assert.ok(blockRules(r).includes('dash'));
  }
});

test('a hyphen doing a dash job is blocked, but a hyphenated word is not', () => {
  assert.equal(checkCopy('We looked at the books - they did not add up.').ok, false, 'a spaced hyphen was allowed');
  assert.equal(checkCopy('We looked at the books -- they did not add up.').ok, false, 'a double hyphen was allowed');

  // The rule is about punctuation, not the character. Blocking every
  // hyphen would make the gate unusable on ordinary British business
  // writing, which is full of compounds.
  const fine = checkCopy('A well-run, family-owned business with day-to-day cash flow problems.');
  assert.ok(!blockRules(fine).includes('dash'), `a hyphenated word was blocked: ${JSON.stringify(fine.findings)}`);
});

test('the Brand OS banned words are blocked', () => {
  for (const word of ['solutions', 'synergy', 'leverage', 'holistic', 'transformational']) {
    const r = checkCopy(`We build ${word} for owner-managed businesses.`);
    assert.equal(r.ok, false, `"${word}" was allowed through`);
  }
});

test('fire metaphors are blocked, because that is the line the brand actually removed', () => {
  const r = checkCopy('Stop the constant firefighting in your business.');
  assert.equal(r.ok, false);
  assert.ok(blockRules(r).includes('fire metaphor'));
});

test('the machine tells are warnings, not blocks', () => {
  // These are judgement, not a decided rule. A person may keep them.
  const r = checkCopy('It is not just a website, it is a commercial decision.');
  assert.equal(r.ok, true, 'a style tell blocked the post instead of warning about it');
  assert.ok(r.warnings > 0, 'the strongest machine tell on the site produced no warning at all');
  assert.ok(r.findings.some((f) => f.rule === 'not X, it is Y'));
});

test('evenly-measured paragraphs are flagged as over-polished', () => {
  const even = 'We looked at the pricing across the range. The margin was thinner than expected. '
    + 'The owner had not raised prices in years. The change took about a month to land.';
  const r = checkCopy(even);
  assert.ok(r.findings.some((f) => f.rule === 'over-polished rhythm'),
    'four sentences of near-identical length did not read as over-polished');
});

// THE ONE THAT MATTERS MOST.
test('real Arrington and Scott copy passes cleanly', () => {
  const corpus = [
    'We work with owner-managed businesses in Devon and Cornwall. Twenty years of running them, buying them and selling them.',
    'Before and after: a 1960s wing chair brought back for a customer in Ivybridge.',
    'Why care homes replace chairs three times more often than they need to.',
    'Half term workshop: how a frame is re-glued and clamped. Places are limited, so book ahead.',
    'Yarn delivery day. Three new colours in the knitting range.',
    'A potential saving is not an actual saving. Nothing here has been approved or measured yet.',
    'If everything runs through you, the business is worth less than you think. We can look at that in thirty minutes.',
    'We built World Student Advisors a fully bespoke HTML website for £999.'
  ];
  for (const copy of corpus) {
    const r = checkCopy(copy);
    assert.equal(r.ok, true,
      `real copy was BLOCKED, which is how a gate gets switched off: ${JSON.stringify(r.findings.filter((f) => f.severity === 'block'))}\n  copy: ${copy}`);
  }
});

test('an empty or missing draft is not an error', () => {
  for (const v of ['', null, undefined]) {
    const r = checkCopy(v);
    assert.equal(r.ok, true);
    assert.equal(r.findings.length, 0);
  }
});

test('the result names what to do, not only what is wrong', () => {
  const r = checkCopy('Our solutions unlock growth — every time.');
  assert.ok(r.findings.every((f) => f.why && f.fix && f.excerpt),
    'a finding arrived without a reason, a fix or the text it refers to');
});
