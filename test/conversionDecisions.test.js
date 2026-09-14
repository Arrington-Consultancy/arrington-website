// Tom's ten approved website conversion decisions, 14 September 2026.
//
// These are LOCKED decisions from the controlled Website & Hosting handoff
// ("WEBSITE CONVERSION REVIEW - TOM APPROVED DECISIONS"), not preferences.
// The point of pinning them here is that several are the kind of change a
// later well-meaning edit undoes without realising it was a decision: a nav
// entry gets added back, a primary button gets swapped, a quiz result gets
// wired to whichever article seems related.
//
// Each test names the decision it guards and, where the decision was NOT to
// do something, guards that too. A test that only checks the positive half
// passes against a site that has quietly done the forbidden thing as well.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
// EJS comments reach no visitor, and the comments explaining these decisions
// necessarily quote the thing each decision forbids. Strip them first, the
// same rule the price-framing scan uses.
const emitted = (p) => read(p).replace(/<%#[\s\S]*?%>/g, '').replace(/<%\s*\/\*[\s\S]*?\*\/\s*%>/g, '');

test('decision 1: Websites and AI is out of the main navigation, Product Guide stays', () => {
  const header = emitted('views/partials/site-header.ejs');

  // The page was never a normal nav row (show_in_nav is false); it appeared
  // only as two hardcoded child links, one per nav loop. Both must be gone.
  assert.ok(
    !/href="\/websites-and-ai"/.test(header),
    'a Websites and AI link is back in the nav'
  );
  assert.ok(
    !/page-menu-link-child|mobile-menu-sublink/.test(header),
    'the child-link markup is back'
  );

  // Product Guide is a synthetic nav entry built in two places that must stay
  // in step. Decision 1 says it is not renamed, demoted or removed.
  for (const f of ['server.js', 'lib/navShell.js']) {
    const src = read(f);
    assert.ok(/productGuideNavEntry/.test(src), `${f} no longer builds the Product Guide nav entry`);
    assert.ok(/title: 'Product Guide'/.test(src), `${f} renamed the Product Guide nav entry`);
  }
});

test('decision 1: the Websites and AI page itself is untouched and still reachable', () => {
  // Out of the nav is not the same as gone. Nothing in this work may delete
  // the page, hide it, or drop it from the sitemap.
  const server = read('server.js');
  assert.ok(/'websites-and-ai'/.test(server), 'the websites-and-ai route/entry vanished from server.js');
});

test('decisions 2 and 7: the quiz leads the post-hero slot and the Product Guide is still there', () => {
  const index = emitted('views/index.ejs');
  const teaser = index.slice(index.indexOf('class="pg-teaser'), index.indexOf('class="pg-teaser') + 1400);

  assert.ok(/href="\/owner-dependency-quiz"/.test(teaser), 'the quiz is not the route in the post-hero slot');
  assert.ok(/btn btn-primary/.test(teaser), 'the quiz CTA is not the primary button in that slot');

  // Decision 1 forbids demoting the Product Guide, so it must still be here,
  // and decision 7 says the entry points must not compete equally, so it must
  // NOT be a second primary button.
  assert.ok(/href="\/product-guide"/.test(teaser), 'the Product Guide lost its route out of this block');
  const primaries = teaser.match(/btn-primary/g) || [];
  assert.strictEqual(primaries.length, 1, 'the block has more than one primary CTA, so the entry points compete equally again');
});

test('decision 2: no claim is made about the quiz that the quiz page does not make', () => {
  // The quiz is 32 questions. An earlier draft of this block nearly said "ten
  // questions, two minutes", which was invented. Both claims that survive are
  // the quiz page's own controlled wording.
  const index = emitted('views/index.ejs');
  const teaser = index.slice(index.indexOf('class="pg-teaser'), index.indexOf('class="pg-teaser') + 1400);
  assert.ok(!/\b(ten|10|twelve|12|five|5)\s+questions\b/i.test(teaser), 'the teaser states a question count');
  assert.ok(/five minute/i.test(teaser), 'the teaser dropped the quiz page\'s own "five minute" framing');

  const quiz = read('views/owner-dependency-quiz.ejs');
  assert.ok(/5 minute quiz/i.test(quiz), 'the quiz page no longer says five minutes, so the homepage claim is now unsupported');
  assert.ok(/No email required/i.test(quiz), 'the quiz page no longer says no email required, so the homepage claim is now unsupported');
});

test('decision 5: the conversation leads the Commercial Review and direct purchase survives', () => {
  const cr = emitted('views/where-to-start-commercial-review.ejs');

  // The conversation is the stronger route for someone unsure.
  assert.ok(/href="\/book-a-30-minute-conversation" class="btn btn-primary/.test(cr),
    'booking a conversation is not the primary CTA');

  // Direct purchase is NOT removed, is still a real form, and is not gated.
  assert.ok(/id="wtsCheckoutForm" data-offer="commercial_review"/.test(cr), 'the checkout form was removed or rewired');
  assert.ok(/id="wtsCheckoutSubmit"/.test(cr), 'the checkout submit button was removed');
  assert.ok(/Pay £500 securely/.test(cr), 'the direct payment route lost its button');

  // And it is the secondary treatment, not a second gold button.
  const payBtn = cr.slice(cr.indexOf('id="wtsCheckoutSubmit"') - 200, cr.indexOf('id="wtsCheckoutSubmit"') + 60);
  assert.ok(/btn-outline/.test(payBtn), 'the pay button is not the secondary treatment');

  // No discount framing crept in with the rewrite.
  assert.ok(!/introductory|50% ?off|half price|discount/i.test(cr), 'discount language appeared on the Commercial Review page');
});

test('decision 6: Evidence PDFs stay gated and stay out of Ads contact conversions', () => {
  const index = emitted('views/index.ejs');

  // Gated: the button opens the email capture, it is not a bare href.
  assert.ok(/js-doc-request/.test(index), 'the PDF gate button is gone');
  assert.ok(!/href="\/pdfs\//.test(index), 'a PDF is linked directly, bypassing the capture');

  // The PDF path must never share the contact-click conversion label.
  const contactLabel = 'h_2rCJeH8aYcEN6RgsVD';
  const pdfBlockStart = index.indexOf('googleAdsPdfConversionLabel');
  assert.ok(pdfBlockStart > -1, 'the separate PDF conversion label gate is gone');
  const pdfBlock = index.slice(pdfBlockStart - 400, pdfBlockStart + 400);
  assert.ok(!pdfBlock.includes(contactLabel), 'the PDF download fires the contact-click conversion label again');

  // Attribution capture on the lead row survives.
  const leads = read('routes/leads.js');
  assert.ok(/pdf_download/.test(leads) && /attribution/.test(leads),
    'the PDF lead row no longer records the download with its attribution');
});

test('decision 9: quiz results only point at articles the controlled bank supports', () => {
  const quiz = read('views/owner-dependency-quiz.ejs');
  const block = quiz.slice(quiz.indexOf('var relatedCandidates'), quiz.indexOf('var relatedEl'));

  // The mappings that are bank-supported.
  const expected = [
    '/useful-thinking/the-turning-that-never-came',
    '/useful-thinking/serendipity-is-not-a-system',
    '/useful-thinking/some-people-are-worth-the-risk',
    '/useful-thinking/every-rule-changes-behaviour'
  ];
  for (const url of expected) {
    assert.ok(block.includes(url), `${url} is no longer offered as a quiz destination`);
  }

  // The one the controlled handoff explicitly forbids wiring in without a
  // separate editorial decision. This is the important half of decision 9.
  assert.ok(
    !/you-can-train-but-you-shouldnt-blame/.test(block),
    'You Can Train, But You Should not Blame was connected to a quiz result, which the controlled Website & Hosting handoff forbids without a separate editorial decision'
  );

  // The Reverse Economy of Scale is recorded as held unpublished, so it must
  // never be linked from a public result.
  assert.ok(!/reverse-economy/.test(block), 'an unpublished article was linked from a quiz result');

  // Still at most one article per result, and never on every result.
  assert.ok(/first match wins|matchedCandidate = relatedCandidates\[ci\]; break;/.test(quiz),
    'the one-article-per-result rule was removed');
});

test('decision 10: a section heading never skips a level in the documents template', () => {
  const index = read('views/index.ejs');
  const start = index.indexOf("_tpl === 'documents'");
  const block = index.slice(start, start + 5000);

  // The card title is derived from the section heading's level rather than
  // hardcoded, which is what stopped Evidence rendering h1 then h3.
  assert.ok(/_docTitleTag/.test(block), 'the document card title is hardcoded to one heading level again');
  assert.ok(!/<h3>/.test(block), 'a hardcoded level-3 card title is back in the documents template');

  // And the styling must not depend on which level it landed on.
  assert.ok(/\.document-card h2,\s*\n?\s*\.document-card h3 \{/.test(index),
    'the card heading style only matches one level again, so the title loses its styling on the other');
});

test('decision 10: no section heading outranks the page H1', () => {
  const index = read('views/index.ejs');
  const m = index.match(/\.builtproof-heading \{[\s\S]*?font-size:\s*([^;]+);/);
  assert.ok(m, '.builtproof-heading lost its font-size');
  assert.strictEqual(
    m[1].trim(),
    'clamp(1.7rem, 3vw, 2.2rem)',
    'the Built proof heading is off the site section-heading scale again and can outrank the page H1'
  );
});
