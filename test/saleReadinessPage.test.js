// The sale-readiness campaign landing page, built 25/09/2026 from the
// controlled brief in ARRINGTON WEBSITE & HOSTING - WORKER HANDOFF.
//
// Most of what is pinned here is a NEGATIVE: the commercial decision behind
// this page is as much about what it must not become as what it says. Tom's
// words from the brief: "Sale readiness must not become a competing
// top-level Arrington proposition or duplicate the existing Commercial
// Review." A page like that drifts by small, well-meaning edits - a nav entry
// added because it seems useful, a homepage block because the page is getting
// no traffic, a package price because a visitor asked what it costs. Each of
// those individually looks like an improvement and each one breaks the
// decision, so each one fails a test here.
//
// Every test that guards an absence is paired with a positive assertion in
// the same test where one exists. A test that only checks the forbidden thing
// is missing passes just as happily against a page that has lost the required
// thing too.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// EJS comments reach no visitor, and the comments explaining these decisions
// necessarily quote the things the decisions forbid. Strip them first, the
// same rule test/conversionDecisions.test.js and the price-framing scan use.
const emitted = (p) => read(p)
  .replace(/<%#[\s\S]*?%>/g, '')
  .replace(/<%\s*\/\*[\s\S]*?\*\/\s*%>/g, '');

// Everything from <main> onwards, i.e. what a visitor is actually served,
// with the page's own <style> block excluded. Needed for any assertion about
// POSITION or COUNT: `.sr-cred` and `.surface-paper` are both declared in the
// stylesheet above the H1, so a naive indexOf/match over the whole file finds
// the CSS rule rather than the markup. Both of the tests below were written
// that way first and both failed against a correct page, which is the useful
// reminder that a passing grep is not the same as a correct one.
const bodyOf = (p) => { const v = emitted(p); return v.slice(v.indexOf('<main>')); };

const PATH = '/get-your-business-ready-to-sell';
const VIEW = 'views/sale-readiness.ejs';

test('the route is registered ahead of the CMS catch-all', () => {
  const server = read('server.js');

  assert.ok(/require\('\.\/routes\/saleReadiness'\)/.test(server), 'the route module is not required');
  assert.ok(/saleReadiness\.mountPageRoute\(app, generateCsrfToken\)/.test(server), 'the page route is not mounted');

  // /:slug renders CMS pages and would swallow this path if it were
  // registered first. Position, not just presence, is the property.
  const mountAt = server.indexOf('saleReadiness.mountPageRoute');
  const catchAllAt = server.indexOf("app.get('/:slug'");
  assert.ok(catchAllAt > -1, 'the /:slug catch-all has moved or gone; this test needs updating');
  assert.ok(
    mountAt < catchAllAt,
    'the sale-readiness route is registered after the /:slug catch-all, so the CMS pipeline would answer it first'
  );

  const route = read('routes/saleReadiness.js');
  assert.ok(route.includes(PATH), `the route no longer serves ${PATH}`);
});

test('it is not in the main navigation, and no synthetic nav entry was added', () => {
  // Both nav loops live in one partial. A link in either one puts this page
  // in the main navigation on desktop or mobile.
  const header = emitted('views/partials/site-header.ejs');
  assert.ok(!header.includes(PATH), 'a sale-readiness link is in the main navigation');
  assert.ok(!/ready-to-sell|sale-readiness/i.test(header), 'a sale-readiness nav link is in the header partial');

  // Owner Check and Product Guide are synthetic nav entries built in two
  // places that must stay in step. Neither may gain a third for this page.
  for (const f of ['server.js', 'lib/navShell.js']) {
    const src = read(f);
    assert.ok(
      !/saleReadinessNavEntry|readyToSellNavEntry/.test(src),
      `${f} builds a synthetic nav entry for the sale-readiness page`
    );
  }

  // The positive half: the two nav entries that ARE meant to exist still do,
  // so this test cannot pass by the nav having been emptied.
  for (const f of ['server.js', 'lib/navShell.js']) {
    const src = read(f);
    assert.ok(/ownerCheckNavEntry/.test(src), `${f} lost the Owner Check nav entry`);
    assert.ok(/productGuideNavEntry/.test(src), `${f} lost the Product Guide nav entry`);
  }
});

test('it is not promoted on the homepage and no existing route was demoted for it', () => {
  const index = emitted('views/index.ejs');
  assert.ok(!index.includes(PATH), 'the sale-readiness page is linked from the homepage template');

  // Decision 7 of 14/09/2026 stands: the quiz keeps the post-hero slot. If
  // this page had been slipped in there, the quiz link would have gone with
  // it, so assert the quiz is still the one in that slot.
  assert.ok(
    /href="\/owner-dependency-quiz"/.test(index),
    'the Owner Dependency Quiz is no longer linked from the homepage'
  );
});

test('the primary route is the conversation and the secondary is the existing £500 review', () => {
  const view = emitted(VIEW);

  // Primary CTA: btn-primary, pointing at the existing conversation page.
  assert.ok(
    /href="\/book-a-30-minute-conversation" class="btn btn-primary/.test(view),
    'Book a 30 minute conversation is not the primary button'
  );
  // Secondary: the EXISTING Commercial Review page, which carries its own
  // checkout. Not a second checkout here.
  assert.ok(
    /href="\/where-to-start\/commercial-review" class="btn btn-outline/.test(view),
    'the £500 Commercial Review is not offered as the secondary route'
  );
  assert.ok(
    !/href="\/book-a-30-minute-conversation" class="btn btn-outline/.test(view),
    'the conversation has been demoted to the secondary button'
  );
});

test('an owner already selling is sent to a conversation, never to checkout', () => {
  // This is the sharpest commercial rule on the page and the easiest to lose:
  // the brief says "Someone already selling should be directed first to a
  // conversation rather than straight to checkout." Take the block between
  // that heading and the end of its card item, and assert what is in it.
  const view = emitted(VIEW);
  const start = view.indexOf('You are already selling');
  assert.ok(start > -1, 'the "already selling" route has gone from the page');
  const block = view.slice(start, view.indexOf('</div>', view.indexOf('sr-route-actions', start)));

  assert.ok(
    block.includes('/book-a-30-minute-conversation'),
    'the "already selling" route does not offer a conversation'
  );
  assert.ok(
    !block.includes('/where-to-start'),
    'the "already selling" route points at a purchase page; the brief sends that reader to a conversation first'
  );

  // And the paired positive: the preparing-ahead reader IS allowed into the
  // review, so this test cannot pass by both routes having been flattened.
  const prep = view.indexOf('You are preparing ahead');
  assert.ok(prep > -1, 'the "preparing ahead" route has gone from the page');
  const prepBlock = view.slice(prep, start);
  assert.ok(
    prepBlock.includes('/where-to-start/commercial-review'),
    'the "preparing ahead" route no longer leads into the Commercial Review'
  );
});

test('no new price, no new checkout and no new conversion label', () => {
  const view = emitted(VIEW);

  // £500 is the existing public price of the existing entry offer. Any OTHER
  // figure on this page would be a new published price, which the brief
  // forbids: "Do not create a new public sale-readiness package price."
  const figures = [...view.matchAll(/£\s?[\d][\d,]*/g)].map((m) => m[0].replace(/\s/g, ''));
  assert.ok(figures.length > 0, 'the £500 entry price has gone from the page');
  assert.deepStrictEqual(
    [...new Set(figures)],
    ['£500'],
    'a figure other than the existing £500 Commercial Review price is published on this page'
  );

  // No second purchase surface. The secondary route is a link to the page
  // that already sells the review.
  assert.ok(!/data-offer=/.test(view), 'a checkout form has been added to this page');
  assert.ok(!/\/api\/checkout/.test(view), 'this page calls the checkout endpoint directly');
  assert.ok(!/<form/i.test(view.slice(0, view.indexOf('site-footer'))), 'a form has been added to the page body');

  // The route module must not have grown a POST surface or a table.
  const route = read('routes/saleReadiness.js');
  assert.ok(!/router\.post|app\.post/.test(route), 'the sale-readiness route has gained a POST endpoint');
  assert.ok(!/INSERT INTO|CREATE TABLE/i.test(route), 'the sale-readiness route writes to the database');

  // Ads: the page may carry the site-wide base tag every other page carries,
  // but must introduce no new conversion label of its own. The two existing
  // site-wide labels live in site-chrome-script, not here.
  const labels = [...read(VIEW).matchAll(/AW-18129914078\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  assert.deepStrictEqual(labels, [], 'a Google Ads conversion label has been added to this page');
});

test('the commercial boundary is stated on the page, not just in a contract', () => {
  const view = emitted(VIEW);
  // Each of the three roles Arrington is not, named explicitly. A visitor who
  // reads this page and still asks us to find them a buyer is the expensive
  // failure mode, so the words have to be on the page.
  for (const word of ['broker', 'valuer', 'exit planner']) {
    assert.ok(
      new RegExp(`\\b${word}`, 'i').test(view),
      `the page does not say we are not a ${word}`
    );
  }
  for (const excluded of ['find buyers', 'negotiate', 'legal drafting', 'tax structuring']) {
    assert.ok(view.toLowerCase().includes(excluded), `the page does not exclude ${excluded}`);
  }
});

test('nothing is promised that the brief forbids promising', () => {
  const view = emitted(VIEW);

  // Two different rules, because the property is "never PROMISED", not "never
  // mentioned", and conflating them is a real trap: the first draft of this
  // test banned the word "retainer" outright and so failed on the page's own
  // sentence saying the work is not a retainer. Naming what we do not do is
  // the point of half this page, so a flat word ban would push the copy into
  // being vaguer, which is the opposite of what the brief asked for.
  //
  // ABSOLUTE: phrases with no honest use on this page at all. There is no
  // way to write "worth more" as a disclaimer.
  const absolute = [
    [/worth more|increase the value|add value to your business|higher price|sale price/i, 'a valuation or price gain'],
    [/\bwe will sell\b/i, 'that we will sell the business'],
    [/introductory|discount/i, 'a price reduction']
  ];
  for (const [rx, label] of absolute) {
    const hit = view.match(rx);
    assert.ok(!hit, `the page promises ${label}: "${hit && hit[0]}"`);
  }

  // CONDITIONAL: words that may appear only inside a sentence that denies
  // them. Each occurrence is checked in its own sentence.
  const conditional = ['retainer', 'success fee', 'guarantee', 'valuation', 'sell for'];
  const sentences = view
    .replace(/<[^>]+>/g, ' ')
    .split(/(?<=[.!?])\s+/);
  for (const word of conditional) {
    for (const sentence of sentences) {
      if (!new RegExp(word, 'i').test(sentence)) continue;
      assert.ok(
        /\bnot\b|\bno\b|\bnever\b|do not/i.test(sentence),
        `"${word}" appears in a sentence that does not deny it: ${sentence.trim().slice(0, 140)}`
      );
    }
  }
});

test('no existing case is reframed as a sale-readiness case study', () => {
  // The brief: "Do not reframe an existing case as a sale-readiness case
  // study unless the controlled evidence specifically supports that
  // description." No such controlled evidence was inspected, so the page
  // links to Evidence and describes nothing.
  const view = emitted(VIEW);
  for (const claim of ['Orca', 'Tristan', 'Insolvent Turnaround', 'VAT Intervention', 'case study']) {
    assert.ok(
      !new RegExp(claim, 'i').test(view),
      `the page names "${claim}", which would be reframing controlled evidence as sale-readiness proof`
    );
  }
  // The positive half: proof is still pointed at rather than simply omitted.
  assert.ok(/href="\/evidence"/.test(view), 'the page no longer links to the Evidence page');
});

test('operator credibility is controlled copy, and sits above the two routes', () => {
  // Tom's reshape instruction of 25/09/2026: bring legitimate operator
  // credibility much higher up, using "only controlled evidence about Tom
  // having built, operated and sold a real business, with the approved
  // wording available in the current controlled sources". Both halves are
  // guarded, because either alone fails: the right sentences placed at the
  // bottom is the defect he reported, and the right position filled with
  // invented wording is the defect the brief exists to prevent.
  const view = emitted(VIEW);

  // The claim sentence, asserted by its exact wording, which is what stops a
  // later edit "improving" it into something nobody approved. It is the live
  // row on the Business Consultant Devon page (casestudy.phase_3_body, set
  // third-person by the 01/08/2026 seed migration in db/seed.js).
  //
  // This list held a second sentence until 25/09/2026, verbatim from
  // views/market-ready-test-result.ejs: "Tom Arrington has bought, built and
  // sold owner run businesses himself". Tom removed it from the page in a
  // copy correction, so it is removed here. That is the test recording his
  // decision, not the guard being weakened: the remaining sentence is still
  // pinned word for word, and the "no invented claim" test below still runs
  // over the whole page.
  const approved = 'Tom Arrington built, grew and sold his own business in a seven-figure exit';
  assert.ok(view.includes(approved), `the approved credibility wording is gone: "${approved}"`);

  // The removed sentence must not creep back without a decision, since it
  // reads as approved copy and would look like a harmless restoration.
  assert.ok(
    !view.includes('bought, built and sold owner run businesses'),
    'the credibility sentence Tom removed on 25/09/2026 is back on the page'
  );

  // Position: credibility must come before the visitor has to choose a route.
  const body = bodyOf(VIEW);
  const cred = body.indexOf('sr-cred');
  const routes = body.indexOf('sr-routes');
  const h1 = body.indexOf('<h1');
  assert.ok(cred > -1, 'the credibility block has gone');
  assert.ok(h1 > -1 && cred > h1, 'the credibility block sits above the H1');
  assert.ok(
    cred < routes,
    'credibility now sits below the two routes; the brief moved it up because being late was the reported defect'
  );
});

test('the cream treatment on "What we do not do" is kept', () => {
  // Tom singled this out in the reshape review: "Keep the cream 'What we do
  // not do' treatment. It works and gives the page an important visual and
  // commercial break." Nothing guarded it, and a planted removal passed all
  // fourteen other tests, which is exactly why this exists.
  const body = bodyOf(VIEW);
  const heading = body.indexOf('What we do not do');
  assert.ok(heading > -1, 'the "What we do not do" section has gone');
  const section = body.slice(heading, heading + 1200);
  assert.ok(
    /class="sr-card surface-paper"/.test(section),
    'the warm paper surface has been removed from the "What we do not do" card'
  );

  // And it stays the ONLY paper surface on the page. It works as a break
  // because it is the single one; boxing the rest to match would remove the
  // very contrast Tom kept it for.
  const paperCount = (body.match(/surface-paper/g) || []).length;
  assert.strictEqual(paperCount, 1, 'the warm paper surface is now used more than once, so it no longer breaks the page');
});

test('technology is a means, and the commercial problem is named first', () => {
  const view = emitted(VIEW);
  const techLine = view.split('\n').find((l) => /\bAI\b/.test(l) && /<li>/.test(l));
  assert.ok(techLine, 'the technology line has gone from the implementation list');
  assert.ok(
    /commercial problem comes first/i.test(techLine),
    'the technology line no longer subordinates technology to the commercial problem'
  );
  // Business problem first also means technology is not the page's opening
  // pitch. Nothing about AI or systems may appear above the H1.
  const aboveH1 = view.slice(0, view.indexOf('<h1'));
  assert.ok(!/\bAI\b|shared workspace/i.test(aboveH1), 'technology appears before the page headline');
});

test('it renders in the site shell, with no inline styles', () => {
  const view = read(VIEW);
  // The Build Protocol's assessment/tool rule: an internal customer-facing
  // route must preserve the main logo, header, navigation, typography, footer,
  // privacy access and contact routes. These four includes are how every other
  // standalone page does that.
  for (const partial of ['partials/site-header', 'partials/site-footer', 'partials/site-chrome-styles', 'partials/site-chrome-script']) {
    assert.ok(view.includes(partial), `the page does not include ${partial}`);
  }
  // Strict CSP blocks inline style attributes; nonces cover <style> elements
  // only. This has bitten the workspace Finance view twice, per CLAUDE.md.
  assert.ok(!/\sstyle="/.test(view), 'the page carries an inline style attribute, which the CSP blocks');
  assert.ok(/<style nonce="<%= nonce %>">/.test(view), 'the style block lost its nonce');
  assert.ok(/<script nonce="<%= nonce %>">/.test(view), 'the script block lost its nonce');
});

test('headings descend without skipping, and nothing outranks the H1', () => {
  const view = emitted(VIEW);
  const levels = [...view.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  assert.ok(levels.length > 1, 'the page has no heading structure');
  assert.strictEqual(levels[0], 1, 'the first heading on the page is not the H1');
  assert.strictEqual(levels.filter((l) => l === 1).length, 1, 'the page has more than one H1');
  let previous = levels[0];
  for (const level of levels.slice(1)) {
    assert.ok(level - previous <= 1, `a heading jumps from h${previous} to h${level}`);
    previous = level;
  }
});

test('canonical and indexing behaviour are deliberate', () => {
  // TOM'S APPROVED DECISION, 25/09/2026, verbatim: "keep the page indexable,
  // but do not add it to sitemap.xml". This was built as a judgement call and
  // then put to him; it is now settled, so this test guards a decision rather
  // than a default. The two halves pull in opposite directions and both
  // matter: indexable means a social or ad visitor is never served a page
  // asking search engines to ignore it, and out of the sitemap means it stays
  // a campaign destination rather than becoming another organic front door,
  // which the build brief explicitly ruled out.
  const view = read(VIEW);
  assert.ok(
    view.includes(`<link rel="canonical" href="https://www.arringtonconsultancy.com${PATH}">`),
    'the canonical tag is missing or points somewhere else'
  );
  assert.ok(!/noindex/i.test(view), 'the page has been set to noindex, against the approved decision of 25/09/2026');

  const server = read('server.js');
  const sitemapBlock = server.slice(server.indexOf('ASSESSMENT_ROUTE_LASTMOD'), server.indexOf('res.type(\'application/xml\')'));
  assert.ok(
    !sitemapBlock.includes('get-your-business-ready-to-sell'),
    'the campaign page has been added to sitemap.xml, against the approved decision of 25/09/2026'
  );
});

test('the two changes the brief deferred were not made', () => {
  // "Do not wire succession answers into Product Guide routing or change the
  // Market Ready Test commercial CTA in this build. Those remain separate
  // commercial decisions." Guarding a deferral is worth a test because both
  // are one small edit away and both were recommended in the review that
  // preceded this build.
  const guide = read('lib/productGuide.js');
  const scoring = guide.slice(guide.indexOf('function computeRecommendation'));
  assert.ok(
    !/succession/.test(scoring),
    'succession has been wired into the Product Guide recommendation, which the brief deferred'
  );

  const mrtResult = read('views/market-ready-test-result.ejs');
  assert.ok(
    !mrtResult.includes(PATH) && !/where-to-start/.test(mrtResult),
    'the Market Ready Test result page has gained a commercial CTA, which the brief deferred'
  );
});
