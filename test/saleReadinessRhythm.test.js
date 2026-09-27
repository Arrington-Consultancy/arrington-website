// Sale Readiness mobile rhythm and one sentence (Tom, 27/09/2026).
//
// "We stay in your corner" read as one dense block on a phone: six equally
// spaced paragraphs. Presentation only, no wording change: the long money
// paragraph is split after "use one.", and the groups in the copy (stance and
// credibility, the approach, protecting the owner's money, the outcome) are
// shown by a larger gap where a group opens.
//
// And the "judged on one question" sentence in "What happens after the Review"
// is replaced by Tom's wording, because it placed the test after the decision
// it should drive, had no antecedent for "it", and introduced four
// alternatives as "one question".
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'sale-readiness.ejs'), 'utf8');
const between = (from, to) => {
  const start = view.indexOf(from);
  const end = view.indexOf(to, start);
  assert.ok(start > -1 && end > start, `could not find the section from "${from}"`);
  return view.slice(start, end);
};
const paragraphs = (html) => [...html.matchAll(/<p(?: class="([^"]*)")?>([\s\S]*?)<\/p>/g)].map((m) => ({ cls: m[1] || '', text: m[2].trim() }));

test('the after-the-Review test is Tom\'s wording, and the paragraph before it is unchanged', () => {
  const section = between('<h2>What happens after the Review</h2>', '<h2>We stay in your corner</h2>');
  const paras = paragraphs(section).map((p) => p.text);
  assert.deepStrictEqual(paras.slice(0, 2), [
    'The Review tells us where the problems are. Then we decide what is actually worth fixing before a buyer arrives.',
    'Every piece of work has to earn its place. Will it protect the value of the business, strengthen what a buyer is actually buying, or materially help the sale complete?'
  ]);
  assert.ok(!view.includes('judged on one question'), 'the replaced sentence is back');
});

// The approved copy as it stood before the split, joined into one string. The
// split must not change a single word.
const CORNER_TEXT = [
  'Selling a business can be brutal, both emotionally and commercially. We stay alongside you and fight for your commercial interests for as long as we are involved.',
  'Tom has been through the process himself, and that experience is part of the value of having us in your corner.',
  'Before a buyer gets the chance to pick the business apart, we want to do it first, finding the weaknesses that could cost you money and strengthening what the buyer is actually going to be paying for.',
  'In a sale, the business itself is the product. We want to make that product as strong as is commercially sensible, but every intervention has to earn its place. There is no point fixing the roof if the foundations are giving way.',
  'We protect every point and every penny. Where the job genuinely needs an accountant, a solicitor, a valuer or another specialist, use one. But nobody should spend £5,000 on something that can competently be done for £500, simply because they are in the middle of a sale. We question the costs and the decisions, and we protect your money as though it were our own.',
  'What we care about is that you come out of it knowing somebody fought your corner and protected every penny of value the business deserved. What a buyer finally pays is theirs to decide, not ours.'
].join(' ');

test('"We stay in your corner" keeps every word, with the money paragraph split after "use one."', () => {
  const body = between('<div class="sr-corner-body">', '<h2>If the business depends on you');
  const paras = paragraphs(body);
  assert.strictEqual(paras.map((p) => p.text).join(' '), CORNER_TEXT, 'the wording of the section has changed');
  assert.strictEqual(paras.length, 7);
  assert.ok(paras[4].text.endsWith('another specialist, use one.'), 'the split is not after "use one."');
  assert.ok(paras[5].text.startsWith('But nobody should spend £5,000'), 'the new paragraph does not begin at "But nobody should spend £5,000"');
});

test('the groups open with a larger gap: after paragraphs 2 and 4, and nowhere else', () => {
  const paras = paragraphs(between('<div class="sr-corner-body">', '<h2>If the business depends on you'));
  assert.deepStrictEqual(paras.map((p) => p.cls === 'sr-corner-group'), [false, false, true, false, true, false, false]);
  assert.match(view, /\.sr-corner-body \.sr-corner-group \{ margin-top: 2rem; \}/);
  // The closing paragraph's own spacing is untouched.
  assert.match(view, /\.sr-corner-body p:last-child \{ margin-top: 1\.9rem; margin-bottom: 0; \}/);
  assert.match(view, /\.sr-corner-body p:last-child \{ margin-top: 1\.5rem; \}/);
});
