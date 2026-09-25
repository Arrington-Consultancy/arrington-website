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

// The same rule one level further in: `emitted` strips EJS comments, which are
// never served, but the page's <style> block carries CSS comments that ARE
// served and that necessarily quote the rules a decision forbids. A scan for a
// forbidden rule therefore matches the paragraph explaining why it was removed.
// That happened on 25/09/2026, to the hover test below, on the commit that
// removed the rule its own comment named. Any assertion about which CSS rules
// EXIST uses this; anything about what is served uses `emitted`.
const cssRules = (p) => emitted(p).replace(/\/\*[\s\S]*?\*\//g, '');

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

test('the two routes carry equal visual weight, neither preferred', () => {
  // REVERSED ON 25/09/2026, and the old version is described here rather than
  // deleted so the decision is readable. This test used to be called "the
  // primary route is the conversation and the secondary is the existing £500
  // review", and it PINNED the hierarchy: btn-primary on the conversation,
  // btn-outline on the review, and an assertion that the conversation had not
  // been "demoted" to an outline button.
  //
  // Tom inspected the live page and rejected that framing: these are two
  // equally valid routes chosen by the visitor's situation, not a primary and
  // a secondary. So the assertions are inverted. Both destinations are still
  // pinned exactly as before, because the DESTINATIONS were never the issue
  // and losing one while restyling would be easy and silent.
  const view = emitted(VIEW);

  assert.ok(
    /href="\/book-a-30-minute-conversation" class="btn btn-outline sr-route-link"/.test(view),
    'the conversation route is not the shared outline treatment'
  );
  // Still the EXISTING Commercial Review page, which carries its own
  // checkout. Not a second checkout here.
  assert.ok(
    /href="\/where-to-start\/commercial-review" class="btn btn-outline sr-route-link"/.test(view),
    'the £500 Commercial Review route is not the shared outline treatment'
  );

  // The property itself, rather than two separate spot checks: inside the
  // routes block every card button carries the SAME class list. Written this
  // way so adding a third route card cannot reintroduce a hierarchy by
  // escaping two hardcoded assertions.
  const body = bodyOf(VIEW);
  const routes = body.slice(body.indexOf('sr-routes'), body.indexOf('What a buyer will want'));
  const classes = [...routes.matchAll(/<a [^>]*class="([^"]*sr-route-link[^"]*)"/g)].map((m) => m[1].trim());
  assert.equal(classes.length, 2, `expected 2 route buttons, found ${classes.length}`);
  assert.equal(
    new Set(classes).size, 1,
    `the route buttons no longer share one treatment: ${JSON.stringify(classes)}`
  );
  assert.ok(
    !classes.some((c) => /\bbtn-primary\b/.test(c)),
    'a route button is a solid primary again, which is how this site marks a preferred action'
  );

  // Equal at rest at CARD level too: no per-card modifier class, since that is
  // what carried the accent edge on one of the two.
  assert.ok(!/sr-route--/.test(routes), 'a route card carries a modifier class again');
  assert.ok(!/\.sr-route--/.test(view), 'a route card modifier rule is back in the stylesheet');
});

test('hovering a route card indicates clickability without selecting it', () => {
  // The specific defect Tom saw: moving the pointer between the two cards
  // swapped which one looked chosen. Three rules caused it and all three are
  // asserted gone, because removing any two of them still leaves the effect.
  const view = cssRules(VIEW);
  const hover = view.match(/\.sr-route:hover\s*\{[^}]*\}/g) || [];
  assert.ok(hover.length, 'the card hover rule has gone entirely, so the card no longer reads as clickable');

  const hoverCss = hover.join(' ');

  // 1. No repainting of the button on card hover. This was the worst of the
  //    three: a filled gold button is how this site marks a primary action.
  assert.ok(
    !/\.sr-route:hover\s+\.btn/.test(view),
    'card hover repaints the button again, which reads as selecting that route'
  );
  // 2. No fill on the card itself.
  assert.ok(
    !/background/.test(hoverCss),
    'card hover fills the card again, which reads as selecting that route'
  );
  // 3. Border brightening only, and restrained: a mix, not the full accent,
  //    so hover cannot be mistaken for the focus state.
  assert.ok(/border-color/.test(hoverCss), 'card hover no longer brightens the border, so there is no affordance at all');
  assert.ok(
    /border-color:\s*color-mix\(/.test(hoverCss),
    'card hover uses a flat colour rather than a restrained mix'
  );
  assert.ok(
    !/border-color:\s*var\(--accent\)\s*;/.test(hoverCss),
    'card hover is back to the full accent border, which matches the focus state'
  );

  // 4. THE ONE THE OTHER THREE MISS, and the reason this test is not enough
  //    on its own. The stretched link's ::after covers the whole card, so a
  //    pointer anywhere on the card is over the ANCHOR and the site's own
  //    .btn-outline:hover fires from the far corner. Deleting
  //    .sr-route:hover .btn-outline satisfies assertion 1 and leaves the
  //    button filling solid gold, which is exactly the defect. Verified in a
  //    real browser on 25/09/2026 with a computed-style read: before this
  //    override the button painted rgb(196,122,58) on black text while
  //    every source assertion above was green.
  assert.ok(
    /\.sr-route-link:hover\s*\{[^}]*background:\s*transparent/.test(view),
    'the stretched link fills the button on card hover again; cancelling .sr-route:hover .btn is not enough'
  );
  // And the cancellation must not take the focus state with it.
  const fv = (view.match(/\.sr-route-link:focus-visible\s*\{[^}]*\}/) || [''])[0];
  assert.ok(fv, 'the route button has no :focus-visible state, so a keyboard user sees no button feedback');
  assert.ok(/background:\s*var\(--accent\)/.test(fv), 'the route button no longer fills on keyboard focus');
  // Declared AFTER :hover, or a focused-and-hovered button loses its focus
  // fill to the cancellation above.
  assert.ok(
    view.indexOf('.sr-route-link:focus-visible') > view.indexOf('.sr-route-link:hover'),
    'the :focus-visible rule is declared before :hover, so hover cancels the focus fill'
  );

  // Accessibility is NOT what was being restrained. The focus ring must stay
  // unmistakable, and it is drawn at card level because the card is what
  // activates.
  const focus = (view.match(/\.sr-route:focus-within\s*\{[^}]*\}/) || [''])[0];
  assert.ok(focus, 'keyboard focus is no longer shown at card level');
  assert.ok(/outline:/.test(focus), 'the focus ring outline has gone');
  assert.ok(/var\(--accent\)/.test(focus), 'the focus ring is no longer drawn in the accent colour');
  assert.ok(
    /prefers-reduced-motion/.test(view),
    'the reduced-motion guard on the card transition has gone'
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
  //
  // ONE EXCEPTION, and it is pinned to its exact sentence rather than
  // allowed in general. Tom's approved copy of 25/09/2026 in "We stay in
  // your corner" says nobody should spend £5,000 on something that can
  // competently be done for £500. That is an illustration of wasted
  // specialist cost, not an Arrington price. The sentence is removed before
  // the scan, so any £ figure anywhere else still fails exactly as before.
  const ILLUSTRATION = 'nobody should spend £5,000 on something that can competently be done for £500, simply because they are in the middle of a sale';
  assert.ok(view.includes(ILLUSTRATION), 'the approved £5,000 illustration has changed; re-check it is still not a price before widening this');
  const scanned = view.replace(ILLUSTRATION, '');
  const figures = [...scanned.matchAll(/£\s?[\d][\d,]*/g)].map((m) => m[0].replace(/\s/g, ''));
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

test('the professional boundary is stated on the page, not just in a contract', () => {
  // NARROWED ON TOM'S INSTRUCTION, 25/09/2026, and the change is recorded
  // rather than made quietly because it removes assertions.
  //
  // This used to require the page to say, in as many words, that Arrington is
  // not a broker, valuer or exit planner, and to exclude finding buyers,
  // negotiating, legal drafting and tax structuring. Tom replaced that
  // defensive list with positive copy and instructed that it must not be
  // re-added underneath. So those assertions are gone: keeping them would
  // fail the page for obeying him.
  //
  // What his brief DID require is that "the important professional boundary"
  // survives, and that is what this now pins: the page must still name the
  // specialists whose work is not ours and say we work alongside them. The
  // page falling completely silent on the limits of the engagement is still
  // a failure, and that is the property worth keeping.
  //
  // REWORDED ON 25/09/2026, and the assertion follows the wording rather than
  // the other way round. Tom's copy rebuild replaced "we will tell you plainly
  // and work alongside them" with "Where the job genuinely needs an
  // accountant, a solicitor, a valuer or another specialist, use one." The
  // property is unchanged: the page names the specialists whose work is not
  // ours and sends the owner to them. So the four names are still required,
  // and the sentence that names them must still direct the owner to use one.
  const view = emitted(VIEW);
  for (const specialist of ['solicitor', 'accountant', 'valuer', 'specialist']) {
    assert.ok(
      new RegExp(`\\b${specialist}`, 'i').test(view),
      `the boundary no longer names a ${specialist}`
    );
  }
  const boundary = view
    .replace(/<[^>]+>/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .find((s) => /\bvaluer\b/i.test(s));
  assert.ok(boundary, 'no sentence names a valuer');
  assert.ok(
    /\buse one\b/i.test(boundary),
    `the sentence naming the specialists no longer sends the owner to them: ${boundary && boundary.trim()}`
  );
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

test('"We stay in your corner" sits on the page, not in a card', () => {
  // REVERSED ON 25/09/2026, and recorded rather than deleted. This test used
  // to be "the cream treatment is kept", guarding the section's cream paper
  // card, which Tom had earlier singled out as working. After inspecting the
  // live section he removed it: against the navy page the large cream box was
  // too heavy and made the section read like a generic information card. The
  // guard now points the other way, because "put it back in a nice card" is
  // exactly the well-meant edit that would undo his decision.
  const body = bodyOf(VIEW);
  const start = body.indexOf('<h2>We stay in your corner</h2>');
  assert.ok(start > -1, 'the "We stay in your corner" section has gone');
  const section = body.slice(start, body.indexOf('<h2>If the business depends on you'));

  assert.ok(!/surface-paper/.test(section), 'the cream paper surface is back on "We stay in your corner"');
  assert.ok(!/class="[^"]*\bsr-card\b/.test(section), 'the "We stay in your corner" copy is back inside a card');
  assert.ok(/class="sr-corner-body"/.test(section), 'the corner copy no longer sits in its unboxed body');
  // The paper surface is gone from this page entirely, not moved elsewhere.
  assert.ok(!/surface-paper/.test(body), 'a cream paper surface has reappeared somewhere on the page');

  // What replaces the card, as Tom specified: a readable measure, spacing,
  // and at most a restrained gold detail. None of it may become a box.
  const css = cssRules(VIEW);
  const bodyRule = (css.match(/\.sr-corner-body\s*\{[^}]*\}/) || [''])[0];
  assert.ok(/max-width:\s*\d+(\.\d+)?ch/.test(bodyRule), 'the corner copy has lost its readable measure and can run the full column');
  for (const boxy of ['background', 'border', 'box-shadow', 'padding']) {
    assert.ok(!new RegExp(`${boxy}\\s*:`).test(bodyRule), `the corner copy has gained ${boxy}, which rebuilds the card`);
  }
  const accent = (css.match(/\.sr-section\.sr-corner\s*>\s*h2::after\s*\{[^}]*\}/) || [''])[0];
  assert.ok(accent, 'the short gold rule under the heading has gone');
  const width = accent.match(/width:\s*([\d.]+)rem/);
  assert.ok(width && Number(width[1]) <= 4, 'the gold rule is no longer short; it must stay a restrained detail, not a bar');
  assert.ok(/height:\s*[12]px/.test(accent), 'the gold rule is no longer a hairline-weight detail');
});

test('technology is not pitched on this page', () => {
  // REVERSED ON 25/09/2026. This used to require an AI line in the
  // implementation list, subordinated to the commercial problem. Tom removed
  // both the list and the AI paragraph: technology-as-a-means is an Arrington
  // principle generally, but it is unnecessary on this page. So the property
  // is now the stronger one: nothing on the page pitches AI, systems or a
  // shared workspace at all.
  const body = bodyOf(VIEW).replace(/<[^>]+>/g, ' ');
  const hit = body.match(/\bAI\b|artificial intelligence|shared workspace|\bsystems\b/i);
  assert.ok(!hit, `the page pitches technology again: "${hit && hit[0]}"`);
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

test('the footer enquiry copy is overridden for this page only', () => {
  // Tom, against the live page on 25/09/2026: the footer form should not talk
  // about pressure here. It is the GLOBAL contact block, so the fix has to be
  // a per-page override rather than a content edit, and both halves matter.
  const route = read('routes/saleReadiness.js');
  // Comments stripped for the wording check, and that is the point rather
  // than a convenience: the comment explaining this fix has to quote the
  // sentence it replaces, so a raw scan flags the explanation instead of the
  // copy. Same rule the price-framing scan uses. Structure is checked against
  // the raw source, wording against the code only.
  const code = route
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  // Half one: this page supplies its own heading, body and placeholder, and
  // they do not mention pressure.
  assert.ok(/SALE_READINESS_CONTACT/.test(route), 'the per-page contact override has gone');
  for (const field of ['heading', 'body', 'messagePlaceholder']) {
    assert.ok(
      new RegExp(`${field}:\\s*['"\`]`).test(route),
      `the override no longer sets ${field}`
    );
  }
  assert.ok(!/pressure/i.test(code), 'the sale-readiness footer copy mentions pressure again');
  assert.ok(
    /pageContact: \{ \.\.\.pageContact, \.\.\.SALE_READINESS_CONTACT \}/.test(route),
    'the override is no longer spread over the shared pageContact, so other fields may be lost'
  );

  // Half two, and the one that actually protects the rest of the site. Both
  // checks run against `code` rather than the raw file, for the same reason
  // the wording check does: the comment explaining this override has to name
  // the global rows it deliberately leaves alone, and a raw scan flags that
  // explanation. What matters is that no statement READS or WRITES them.
  // This
  // must never become an edit to the shared contact.* rows, which would
  // rewrite the footer on every page. The route may read content, but it must
  // not write it.
  assert.ok(
    !/UPDATE\s+content|INSERT\s+INTO\s+content/i.test(code),
    'the sale-readiness route now writes to the global content table'
  );
  assert.ok(
    !/contact\.heading|contact\.body/.test(code),
    'the route references the global contact rows directly; the override must be local to this page'
  );
});

test('each route card is clickable as a whole, with exactly one link in it', () => {
  // Tom, 25/09/2026: the whole card should go where its button goes, with the
  // button still visible. The accessibility property is the one under guard:
  // ONE link per card, so there is one tab stop, one announced destination
  // and no duplicate navigation. A wrapping anchor or a JS click handler
  // would each break that, which is why this checks the structure and not
  // just that clicking works.
  const body = bodyOf(VIEW);
  const routes = body.slice(body.indexOf('sr-routes'), body.indexOf('What a buyer will want'));

  // Split on the card opener only. A plain indexOf/split on "sr-route" also
  // matches the sr-route-actions wrapper INSIDE each card and reports four
  // cards, which is what the first draft of this test did. The lookahead
  // requires the class name to end there, so the -actions wrapper is excluded.
  const cards = routes.split(/<div class="sr-route(?=["\s])/).slice(1);
  assert.strictEqual(cards.length, 2, 'there are no longer exactly two route cards');
  for (const card of cards) {
    const anchors = card.match(/<a\s/g) || [];
    assert.strictEqual(anchors.length, 1, 'a route card has more than one link in it');
    assert.ok(/class="btn [^"]*sr-route-link"/.test(card), 'the card link is no longer the visible button');
  }

  // No wrapping anchor and no click handler: either would be a second way to
  // navigate that the single announced link does not account for.
  assert.ok(!/<a[^>]*>\s*<div class="sr-route/.test(body), 'a route card is wrapped in an anchor, nesting its button link');
  const view = read(VIEW);
  assert.ok(!/addEventListener\('click'/.test(view), 'a click handler has been added; the card must navigate through its own link');

  // The stretch itself, and the focus ring that makes it usable by keyboard.
  assert.ok(/\.sr-route-link::after/.test(view), 'the stretched-link overlay has gone, so only the button is clickable');
  assert.ok(/\.sr-route\s*\{[^}]*position:\s*relative/.test(view), 'the card is no longer positioned, so the overlay would escape it');
  assert.ok(/\.sr-route:focus-within/.test(view), 'keyboard focus is no longer shown at card level');
});

test('each route card still goes to its own destination', () => {
  // The whole-card change must not have crossed the two destinations over.
  const body = bodyOf(VIEW);
  const prep = body.indexOf('You are preparing ahead');
  const now = body.indexOf('You are already selling');
  const buyer = body.indexOf('What a buyer will want');
  assert.ok(prep > -1 && now > prep && buyer > now, 'the two route cards are no longer in the expected order');

  const prepCard = body.slice(prep, now);
  const nowCard = body.slice(now, buyer);
  assert.ok(prepCard.includes('/where-to-start/commercial-review'), 'preparing ahead no longer leads to the Commercial Review');
  assert.ok(!prepCard.includes('/book-a-30-minute-conversation'), 'preparing ahead now also offers the conversation');
  assert.ok(nowCard.includes('/book-a-30-minute-conversation'), 'already selling no longer leads to the conversation');
  assert.ok(!nowCard.includes('/where-to-start'), 'already selling points at a purchase page; that reader goes to a conversation first');
});

test('the buyer items carry gold rules and stay unboxed', () => {
  // Tom, 25/09/2026: gold rather than grey, but "do not turn them into six
  // cards". Both halves are asserted, because satisfying one by breaking the
  // other is exactly the likely mistake.
  const view = read(VIEW);
  const rule = view.match(/\.sr-item\s*\{[^}]*\}/);
  assert.ok(rule, 'the .sr-item rule has gone');
  assert.ok(/border-top:[^;]*var\(--accent\)/.test(rule[0]), 'the buyer items no longer carry a gold top rule');
  for (const boxed of ['border-radius', 'background']) {
    assert.ok(!new RegExp(boxed).test(rule[0]), `the buyer items have gained ${boxed}, which turns them into cards`);
  }
  assert.ok(!/border:\s/.test(rule[0]), 'the buyer items have gained a full border, which turns them into cards');
});

test('the owner-dependency section links to the real quiz, before the closing CTA', () => {
  // Tom, 25/09/2026: add this before the final conversion area and link it to
  // the EXISTING Owner Dependency / Owner Check route. "Do not invent a new
  // assessment or destination", so the destination is asserted against the
  // route actually registered in server.js rather than trusted from the view.
  const body = bodyOf(VIEW);
  const section = body.indexOf('If the business depends on you, start there');
  const final = body.indexOf('sr-final');
  assert.ok(section > -1, 'the owner-dependency section has gone');
  assert.ok(section < final, 'the owner-dependency section has moved below the closing CTA');

  const block = body.slice(section, final);
  assert.ok(block.includes('href="/owner-dependency-quiz"'), 'it no longer links to the Owner Dependency Quiz');

  const server = read('server.js');
  assert.ok(
    /app\.get\('\/owner-dependency-quiz'/.test(server),
    'the destination is not a registered route; no new assessment may be invented'
  );

  // The Brand Operating System fixes the quiz's public name and forbids
  // renaming it, so the page must call it what it is called.
  assert.ok(/Owner Dependency Quiz/.test(block), 'the quiz is no longer named by its exact public name');

  // It must not outrank the conversation, which is the page's primary CTA.
  assert.ok(!/btn btn-primary/.test(block), 'the owner-dependency CTA has become a primary button, outranking the conversation');
});

test('the illustrative image is used once, optimised, and never as evidence', () => {
  // Tom's instruction of 25/09/2026: the image is AI-generated for this page,
  // it is illustrative, and it "must not be presented or positioned as
  // evidence of a real client, real business or Arrington engagement". Every
  // assertion here exists to keep that true after somebody else edits the
  // page, because nothing about the file itself says it is an illustration.
  const body = bodyOf(VIEW);
  const view = read(VIEW);
  const fs = require('node:fs');

  // ONCE. Tom was explicit that neither the second generated image he sent
  // nor any other may be added.
  const imgs = body.match(/<img\s/g) || [];
  assert.strictEqual(imgs.length, 1, 'the page no longer carries exactly one image');
  const pictures = body.match(/<picture>/g) || [];
  assert.strictEqual(pictures.length, 1, 'the page no longer carries exactly one <picture>');

  // POSITION. It belongs to the owner-dependency section, which argues a case
  // and names no client, outcome or figure. It must not drift to the hero,
  // the credibility block or the Evidence link, where a reader would take it
  // as documentary.
  const section = body.indexOf('If the business depends on you, start there');
  const card = body.indexOf('<div class="sr-card">', section);
  const imgAt = body.indexOf('<picture>');
  assert.ok(section > -1 && imgAt > section && imgAt < card, 'the image is no longer between that H2 and its copy');
  assert.ok(body.indexOf('sr-cred') < section, 'the image has moved next to the credibility block');
  assert.ok(imgAt < body.indexOf('href="/evidence"'), 'sanity: the Evidence link should still follow, not precede, the image');

  // HONEST ALT TEXT. It must describe the scene and must not assert the scene
  // is real or belongs to anyone.
  const alt = (view.match(/alt="([^"]+)"/) || [])[1];
  assert.ok(alt, 'the image has no alt text');
  assert.match(alt, /^Illustration/, 'the alt text no longer declares itself an illustration');
  for (const forbidden of ['client', 'customer of', 'our work', 'case study', 'Arrington client']) {
    assert.ok(!new RegExp(forbidden, 'i').test(alt), `the alt text claims the scene is a real ${forbidden}`);
  }

  // OPTIMISED. The 1.78MB PNG source must never be shipped, and what is
  // shipped has to actually exist at a sensible weight.
  assert.ok(!/\.png/i.test(body), 'a PNG is being served; the source was not converted');
  assert.ok(/loading="lazy"/.test(view), 'the image is no longer lazy-loaded');
  assert.ok(/width="\d+" height="\d+"/.test(view), 'the image has no intrinsic size, so the copy will jump as it loads');
  assert.ok(/type="image\/webp"/.test(view), 'the WebP source has gone, leaving only the fallback');

  const files = [
    ['public/img/sale-readiness/owner-watching-700.webp', 120],
    ['public/img/sale-readiness/owner-watching-1400.webp', 200],
    ['public/img/sale-readiness/owner-watching-1400.jpg', 400]
  ];
  for (const [f, maxKb] of files) {
    assert.ok(fs.existsSync(f), `a referenced image file is missing: ${f}`);
    const kb = fs.statSync(f).size / 1024;
    assert.ok(kb < maxKb, `${f} is ${Math.round(kb)}KB, over the ${maxKb}KB budget for this page`);
    assert.ok(body.includes(f.replace('public', '')), `${f} exists but nothing references it`);
  }
});

test('the Product Guide deferral still holds', () => {
  // "Do not wire succession answers into Product Guide routing in this build.
  // That remains a separate commercial decision." Still deferred, and still
  // one small edit away, so it is still worth a test.
  //
  // THIS TEST USED TO GUARD TWO DEFERRALS. The second, that the Market Ready
  // Test result page gain no route on to the sale readiness page, was
  // REVERSED BY TOM ON 25/09/2026 in his own words: "i dont wnat to add more
  // to the main menu but this could be a great route to market. should this
  // be in a subsection on what we do page and then a link on the sales ready
  // quiz page?" The assertion that forbade it is replaced by the test below,
  // which asserts the link is there, rather than deleted, so the history of
  // the decision stays readable from the test file.
  const guide = read('lib/productGuide.js');
  const scoring = guide.slice(guide.indexOf('function computeRecommendation'));
  assert.ok(
    !/succession/.test(scoring),
    'succession has been wired into the Product Guide recommendation, which the brief deferred'
  );
});

test('the Market Ready Test result page routes on to this page', () => {
  // Tom's decision of 25/09/2026, reversing the build brief's deferral. The
  // reasoning worth keeping: the result page's own closing block already
  // argued this page's case ("what a buyer is likely to question and what is
  // worth strengthening before you approach the market") with nowhere to send
  // anybody, and a reader who has just been scored out of 100 on exactly that
  // question is the highest-intent visitor on the site.
  const mrtResult = read('views/market-ready-test-result.ejs');

  assert.ok(
    mrtResult.includes(`href="${PATH}"`),
    'the Market Ready Test result page no longer links to the sale readiness page'
  );

  // Inside the closing block, not orphaned somewhere above the score.
  const nextStep = mrtResult.slice(mrtResult.indexOf('class="mrt-next-step"'));
  assert.ok(
    nextStep.includes(PATH),
    'the sale readiness link is on the result page but outside the closing next-step block'
  );

  // Not a third button. Two CTAs are the actions on that page; a third would
  // compete with both while sending the reader away rather than into a
  // conversation, which is the opposite of what the block is for.
  assert.ok(
    !/<a[^>]+href="\/get-your-business-ready-to-sell"[^>]*class="[^"]*\bbtn\b/.test(mrtResult)
      && !/class="[^"]*\bbtn\b[^"]*"[^>]+href="\/get-your-business-ready-to-sell"/.test(mrtResult),
    'the sale readiness link on the result page has become a button, competing with the two real CTAs'
  );

  // Styled. An inline link left to the browser renders default blue, which is
  // a bug that has already reached production once on the sale readiness page
  // itself, so it is pinned rather than trusted.
  assert.ok(
    /\.mrt-more a\s*\{[^}]*color:\s*var\(--accent\)/.test(mrtResult),
    'the result page contextual link has no accent colour rule, so it will render default browser blue'
  );

  // The existing CTAs are untouched: the brief that deferred this said not to
  // CHANGE the commercial CTA, and adding a route beside it is not the same
  // thing as repointing it.
  assert.ok(
    mrtResult.includes('Ask Tom to review my result') && mrtResult.includes('href="/#conversation"'),
    'an existing Market Ready Test CTA was changed; this decision added a link beside them, it did not repoint them'
  );
});

test('What We Do gains a route in, appended and guarded', () => {
  // The other half of Tom's 25/09/2026 decision. The page stays out of the
  // main navigation; this is the organic route in.
  const seed = read('db/seed.js');
  const marker = 'what-we-do.sale_readiness_link_2026-09-25';

  assert.ok(seed.includes(marker), 'the What We Do sale readiness link migration is missing');

  const block = seed.slice(seed.indexOf(marker));
  // Bounded at the wording-correction migration that follows it (25/09/2026),
  // which DOES update a content row and is guarded in its own test below.
  // Without this bound, that block's UPDATE would be attributed to this one.
  const migration = block.slice(0, block.indexOf('SALE READINESS: What We Do wording correction'));
  assert.ok(migration.length < block.length, 'the wording-correction migration has moved or gone; this slice is no longer bounded');

  // The destination slug, pinned here so renaming the route breaks a test
  // rather than the link. The CMS button-link <select> cannot offer this
  // value (it lists `pages` rows only and this is a code route), so nothing
  // in the admin UI would reveal a broken slug.
  assert.ok(
    migration.includes("SR_SLUG = 'get-your-business-ready-to-sell'"),
    'the migration no longer points at the sale readiness route'
  );
  assert.ok(
    PATH === '/get-your-business-ready-to-sell',
    'the route path and the slug the migration writes have diverged'
  );

  // Appended, never inserted at a position: the live section_order is in the
  // production database and cannot be read from here, so any other position
  // would be a guess about a page nobody here can see.
  assert.ok(
    /order\.concat\(\[linkId\]\)/.test(migration),
    'the What We Do link is no longer appended to the existing section order'
  );

  // A new instance, so nothing already on that page is edited or replaced.
  assert.ok(
    /'intervention__' \+ n/.test(migration),
    'the migration no longer allocates a fresh intervention instance'
  );
  assert.ok(
    !/UPDATE content/.test(migration),
    'the migration updates existing content rows; it must only add a new instance'
  );

  // Idempotent on a redeploy, and not a second link beside a hand-built one.
  assert.ok(/ON CONFLICT \(section_key\) DO NOTHING/.test(migration), 'content rows are not conflict-guarded');

  // The duplicate-link guard, pinned to its MECHANISM rather than its name.
  // A first version of this assertion was just /alreadyLinked/, which matches
  // the identifier whether the guard does anything or not: planting
  // `const alreadyLinked = false && existingRows.some(...)` left it green.
  // That is the asserting-something-adjacent-to-the-property failure this
  // codebase has recorded repeatedly, so the exact assignment is pinned and
  // the query it reads from is pinned with it.
  //
  // STATED LIMIT: this is still a source check. The behaviour itself can only
  // be established against a real database, and was, by hand on 25/09/2026 on
  // a throwaway database: with the marker row deleted and the link left in
  // place, the real `node db/seed.js` logged "the page already links to it",
  // left section_order at 8 entries and left exactly one link to the page.
  assert.ok(
    /const alreadyLinked = existingRows\.some\(/.test(migration),
    'the duplicate-link guard is no longer read straight from the query result'
  );
  assert.ok(
    /button_link' AND content = \$1/.test(migration),
    'the guard no longer looks the destination up by its button_link value'
  );

  // No price, no timeframe, no valuation claim in the copy it writes: the
  // destination page carries the commercial detail, and 02 ARRINGTON
  // COMMERCIAL POSITION governs what may be said about it.
  // Comments stripped first: the note recording why the wording was corrected
  // on 25/09/2026 has to name the "valuation implication" it removed, and a
  // raw scan flags that explanation instead of the copy. Same rule as
  // emitted() and cssRules() above.
  const copy = migration
    .slice(migration.indexOf('const rows = ['), migration.indexOf('for (const [key, value]'))
    .replace(/\/\/[^\n]*/g, '');
  assert.ok(
    !/£|\bweeks?\b|\bmonths?\b|valuation|multiple|broker/i.test(copy),
    'the What We Do link copy has gained a price, timeframe or valuation claim'
  );
  // "we", not "I" — Tom's pronoun decision of 15/09/2026.
  assert.ok(!/\bI \b/.test(copy), 'the What We Do link copy uses first person singular');
});

// ---------------------------------------------------------------------------
// THE APPROVED COPY SET OF 25/09/2026.
//
// Tom reviewed the middle of this page line by line and found generic,
// invented consultancy copy written to fill a structure, plus a second
// description of the Commercial Review. He rebuilt it from his own
// commercial thinking and approved the result as one set. These tests pin
// the DECISIONS in that set (what must be there, what must be gone), not
// every word, so that an ordinary later CMS-style copy edit is not blocked
// but a decision cannot be quietly reversed.
// ---------------------------------------------------------------------------

const visibleText = () => bodyOf(VIEW).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the buyer section is exactly Tom\'s five points, with no sixth', () => {
  const body = bodyOf(VIEW);
  const start = body.indexOf('What a buyer will want to understand');
  const end = body.indexOf('</div>\n        </div>', start);
  assert.ok(start > -1 && end > start, 'the buyer section has gone');
  const section = body.slice(start, end);

  const leads = [...section.matchAll(/<span class="sr-item-lead">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepStrictEqual(
    leads,
    [
      'Owner dependency',
      'Whether the numbers tell the true story',
      'Revenue distribution and deal risk',
      'What is actually adding value',
      'Transferability'
    ],
    'the buyer points are no longer exactly Tom\'s five, in his order'
  );

  // Tom's own introductory principle, verbatim.
  assert.ok(
    section.includes('A potential buyer will almost always come in with the same underlying questions, even if they phrase them differently. Owners often answer some of them well, but frequently fail to frame the business in the way a buyer needs to understand it.'),
    'the buyer section intro is no longer Tom\'s principle'
  );
  // His wording correction at approval: loss-making, not loss leading.
  assert.ok(section.includes('Bloated or loss-making parts of a business'), 'Tom\'s "loss-making" correction has been lost');
  assert.ok(!/loss leading/i.test(section), '"loss leading" is back, which Tom corrected at approval');
  // The anchors of each principle, so a point cannot be hollowed out while
  // keeping its heading.
  for (const anchor of ['unplanned absence', '100 hours a week for free', 'one customer, one supplier or one relationship', 'commercially savage', 'explainable, and then transferable']) {
    assert.ok(section.includes(anchor), `a buyer point has lost its substance: "${anchor}"`);
  }
});

test('the odd fifth buyer point runs full width, and only on the grid', () => {
  // Tom: do not invent a sixth point; make the fifth full width if that is
  // the cleanest deliberate layout, and preserve responsive behaviour.
  const css = cssRules(VIEW);
  assert.ok(
    /\.sr-grid\s*>\s*\.sr-item:last-child:nth-child\(odd\)\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/.test(css),
    'the odd last buyer item no longer spans the grid'
  );
  // Mobile is untouched: the grid still collapses to one column.
  assert.ok(
    /@media[^{]*\{[\s\S]*?\.sr-grid\s*\{[^}]*grid-template-columns:\s*1fr/.test(css),
    'the buyer grid no longer collapses to one column on mobile'
  );
});

test('the Commercial Review is explained on its own page, not restated here', () => {
  // Tom: do not maintain two descriptions of one product. This section says
  // why the existing Review is relevant and links to the canonical page.
  const body = bodyOf(VIEW);
  const start = body.indexOf('<h2>Where the Commercial Review comes in</h2>');
  const end = body.indexOf('<h2>What happens after the Review</h2>');
  assert.ok(start > -1, 'the "Where the Commercial Review comes in" heading has gone');
  assert.ok(end > start, 'the "What happens after the Review" section has gone or moved above it');
  const section = body.slice(start, end);

  assert.ok(
    section.includes('The £500 Commercial Review is where we look at the business through the eyes of a potential buyer'),
    'the Review\'s relevance statement has gone'
  );
  assert.ok(section.includes('href="/where-to-start/commercial-review"'), 'the section no longer links to the canonical Commercial Review page');

  // The product mechanics must not come back anywhere on the page.
  const text = visibleText();
  for (const [rx, what] of [
    [/business days?/i, 'the delivery timeline'],
    [/credited|credit\b/i, 'the £500 credit'],
    [/six[- ]month/i, 'the six-month check-in'],
    [/written assessment|written report/i, 'the written-report mechanics'],
    [/What the Commercial Review establishes/, 'the old section heading']
  ]) {
    assert.ok(!rx.test(text), `the page restates ${what}, which lives on the Commercial Review page`);
  }
  assert.ok(!/class="sr-step"|class="sr-price"/.test(body), 'the numbered-step or price-block presentation is back');
});

test('after the Review: judged on value to the seller, with no shopping list', () => {
  const body = bodyOf(VIEW);
  const start = body.indexOf('<h2>What happens after the Review</h2>');
  const end = body.indexOf('<h2>We stay in your corner</h2>');
  assert.ok(start > -1 && end > start, 'the after-the-Review section has gone or moved');
  const section = body.slice(start, end);

  assert.ok(section.includes('The Review tells us where the problems are.'), 'the section no longer opens on Tom\'s principle');
  assert.ok(section.includes('We do not fix things simply because they could be improved.'), 'the "not simply because they could be improved" principle has gone');
  assert.ok(section.includes('Any further work is agreed separately'), 'further work is no longer said to be agreed separately');
  // No list of work types, and no defence of the absence of a package price.
  assert.ok(!/<ul|<li/.test(section), 'an implementation shopping list is back');
  assert.ok(!/retainer|package price/i.test(visibleText()), 'the page defends the absence of a retainer or package price again');
});

test('"We stay in your corner" carries Tom\'s proposition, with the Brand OS fixes', () => {
  const body = bodyOf(VIEW);
  const start = body.indexOf('<h2>We stay in your corner</h2>');
  // Bounded by the next section's heading. It used to end at the cream
  // panel's closing tag, and the panel was removed on 25/09/2026.
  const section = body.slice(start, body.indexOf('<h2>If the business depends on you', start));
  assert.ok(start > -1, 'the "We stay in your corner" section has gone');

  const pinned = [
    // "the whole way through" was tightened to our role, not the transaction.
    'fight for your commercial interests for as long as we are involved',
    // Tom's own framing: the experience is Arrington's value, not Tom as the product.
    'Tom has been through the process himself, and that experience is part of the value of having us in your corner.',
    // Fragment fixed into a sentence (Brand OS copy standard).
    'we want to do it first, finding the weaknesses that could cost you money',
    // Fire line translated (Brand OS BANNED LANGUAGE), Tom's approved wording.
    'There is no point fixing the roof if the foundations are giving way.',
    // Second fragment fixed.
    'We protect every point and every penny.',
    // The outcome, with the price disclaimer attached.
    'What a buyer finally pays is theirs to decide, not ours.'
  ];
  for (const phrase of pinned) {
    assert.ok(section.includes(phrase), `an approved line in "We stay in your corner" has changed: "${phrase}"`);
  }
  // The outcome line is the section's closing thought.
  const paras = [...section.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
  assert.ok(/theirs to decide, not ours\.$/.test(paras[paras.length - 1].trim()), 'the outcome line is no longer the closing thought of the section');

  // Removed wording must not return.
  const text = visibleText();
  for (const [rx, what] of [
    [/pretending to be something/i, '"You do not need us pretending to be something we\'re not", which is not Tom\'s voice'],
    [/the whole way through/i, '"the whole way through", tightened to our involvement'],
    [/part of what you are getting/i, 'the Tom-as-the-product framing'],
    [/\bon fire\b|\bfirefight|\bfires?\b|\bblaze\b|\bburn(ing)?\b/i, 'a fire-based metaphor, banned by the Brand Operating System']
  ]) {
    assert.ok(!rx.test(text), `the page carries ${what}`);
  }
});

test('the deleted sections and deleted lines stay deleted', () => {
  const text = visibleText();
  for (const [needle, what] of [
    ['What should be stronger afterwards', 'the "What should be stronger afterwards" section'],
    ['Before we start, we agree what needs to improve', 'the agree-what-to-improve framing Tom rejected'],
    ['The things you have not got to', 'the sixth buyer point, which was not Tom\'s thinking'],
    ['What the work can involve afterwards', 'the old implementation-list heading'],
    ['the better position to be in', 'the ranking of one route above the other'],
    ['before buying anything', 'the ambiguous "before buying anything"'],
    ['Thirty minutes, no charge.', 'the fragment opening the closing paragraph']
  ]) {
    assert.ok(!text.includes(needle), `${what} is back`);
  }
});

test('the route cards say time to act, and "before paying for a review"', () => {
  const text = visibleText();
  assert.ok(text.includes('Nothing is under way yet, which gives you time to act.'), 'the preparing-ahead card no longer frames the advantage as time to act');
  assert.ok(text.includes('Speak to us before paying for a review, because'), 'the already-selling card no longer says "before paying for a review"');
});

test('the closing paragraph does not repeat the footer prompt below it', () => {
  // The footer override directly below already says "Tell us where the
  // business is now and what you are thinking about doing next". Saying it
  // twice back to back is the defect the override was built to remove.
  const body = bodyOf(VIEW);
  const final = body.slice(body.indexOf('sr-final'));
  assert.ok(final.includes('The conversation takes thirty minutes and costs nothing. We will say plainly whether this is work worth doing yet'), 'the approved closing paragraph has changed');
  assert.ok(!/Tell us where the business is/i.test(final), 'the closing paragraph repeats the footer\'s prompt again');
  const route = read('routes/saleReadiness.js');
  assert.ok(/Tell us where the business is now/.test(route), 'sanity: the footer override no longer carries the prompt, so this check is measuring nothing');
});

test('the owner-dependency section is a short bridge, not the argument again', () => {
  const body = bodyOf(VIEW);
  const start = body.indexOf('If the business depends on you, start there');
  const block = body.slice(start, body.indexOf('sr-final'));
  const paras = [...block.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1].trim());
  assert.deepStrictEqual(
    paras,
    ['If the business owns you, it is going to be very difficult to sell it. And the business cannot sell you with it. It is worth knowing how much of it still comes back to you.'],
    'the owner-dependency section is no longer the approved single bridge paragraph'
  );
  // The explanation lives in the buyer section now; it must not be restated.
  for (const restated of ['only works because you are there every day', 'separate the business from the owner', 'every decision, customer problem']) {
    assert.ok(!block.includes(restated), `the owner-dependency section restates the argument again: "${restated}"`);
  }
});

test('the Owner Dependency Quiz is timed at five minutes wherever this work states it', () => {
  // The quiz's own page is the evidence: "Takes about 5 minutes". Two places
  // said two minutes; both were corrected on 25/09/2026. The positive control
  // guards the evidence itself, so this cannot pass by the quiz page changing.
  const quiz = read('views/owner-dependency-quiz.ejs');
  assert.ok(/Takes about <span>5 minutes<\/span>/.test(quiz), 'sanity: the quiz page no longer says 5 minutes; re-check the evidence before trusting this test');

  assert.ok(visibleText().includes('The Owner Dependency Quiz, about five minutes, no charge.'), 'the sale-readiness page no longer says about five minutes');
  assert.ok(!/two minutes/i.test(visibleText()), 'the sale-readiness page says two minutes again');

  const hub = read('views/owner-check.ejs');
  const card = hub.slice(hub.indexOf('<h2>Owner Dependency Quiz</h2>'), hub.indexOf('</div>', hub.indexOf('<h2>Owner Dependency Quiz</h2>')));
  assert.ok(/About 5 minutes/.test(card), 'the Owner Check hub no longer times the quiz at about 5 minutes');
  assert.ok(!/About 2 minutes/.test(card), 'the Owner Check hub says 2 minutes again');
});

test('the What We Do wording correction is guarded so a CMS edit wins', () => {
  const seed = read('db/seed.js');
  const start = seed.indexOf('SALE READINESS: What We Do wording correction');
  assert.ok(start > -1, 'the What We Do wording-correction migration has gone');
  const migration = seed.slice(start, seed.indexOf('Arrington AI Workspace: ingest', start));

  const OLD = 'A business that could run without you is worth more to a buyer and easier to own in the meantime.';
  const NEW = 'A business that could run without you is easier for somebody else to take over and better to own in the meantime.';
  assert.ok(migration.includes(OLD) && migration.includes(NEW), 'the migration no longer carries the old and approved wording');

  // Only the exact old value is rewritten, so a CMS edit is never overwritten.
  assert.ok(
    /UPDATE content SET content = \$1, updated_at = NOW\(\) WHERE section_key = \$2 AND content = \$3/.test(migration),
    'the update no longer requires the exact old value, so it could overwrite a CMS edit'
  );
  // Scoped by destination, never by a hardcoded instance id.
  assert.ok(/button_link' AND content = \$1/.test(migration), 'the migration no longer finds the section by its destination');
  assert.ok(!/intervention__\d+/.test(migration.replace(/\/\/[^\n]*/g, '')), 'the migration hardcodes an instance id');
  // Run once.
  assert.ok(/what-we-do\.sale_readiness_link_copy_2026-09-25/.test(migration), 'the run-once marker has gone');

  // A fresh database gets the approved wording from the original migration's
  // default, and the unevidenced valuation line is nowhere in its rows.
  const creator = seed.slice(seed.indexOf('what-we-do.sale_readiness_link_2026-09-25'), start);
  const rows = creator.slice(creator.indexOf('const rows = ['), creator.indexOf('for (const [key, value]'));
  assert.ok(rows.includes(NEW), 'a fresh database no longer gets the approved What We Do wording');
  assert.ok(!/worth more/i.test(rows), 'a fresh database gets the unevidenced "worth more" wording again');
});

test('running text keeps one readable measure, the Review pair sits together, the card is even', () => {
  // Tom's approved visual pass. Three layout rules, no copy.
  const css = cssRules(VIEW);
  const body = bodyOf(VIEW);

  // 1. The two Review sections and the full-width fifth buyer point share the
  //    corner section's measure, so no running text spans the full column.
  assert.ok(/\.sr-section\.sr-prose\s*>\s*p\s*\{[^}]*max-width:\s*62ch/.test(css), 'the Review sections lost their readable measure');
  assert.ok(/\.sr-grid\s*>\s*\.sr-item:last-child:nth-child\(odd\)\s+p\s*\{[^}]*max-width:\s*62ch/.test(css), 'the full-width fifth buyer point\'s text lost its readable measure');
  assert.ok(/\.sr-corner-body\s*\{[^}]*max-width:\s*62ch/.test(css), 'the corner section no longer shares the same measure');
  for (const heading of ['Where the Commercial Review comes in', 'What happens after the Review']) {
    const at = body.indexOf(`<h2>${heading}</h2>`);
    const opener = body.slice(body.lastIndexOf('<div class="sr-section', at), at);
    assert.ok(/\bsr-prose\b/.test(opener), `"${heading}" no longer carries the readable measure`);
  }

  // 2. The second Review section follows the first at half the usual gap,
  //    on both widths.
  const at = body.indexOf('<h2>What happens after the Review</h2>');
  assert.ok(/\bsr-pair-next\b/.test(body.slice(body.lastIndexOf('<div class="sr-section', at), at)), 'the Review sections are no longer paired');
  const base = Number((css.match(/\.sr-section\s*\{\s*margin-top:\s*([\d.]+)rem/) || [])[1]);
  const paired = Number((css.match(/\.sr-section\.sr-pair-next\s*\{\s*margin-top:\s*([\d.]+)rem/) || [])[1]);
  assert.ok(base && paired && Math.abs(paired - base / 2) < 0.01, `the paired gap is no longer half the section gap (${paired} vs ${base})`);
  assert.ok(/@media[^{]*\{\s*\.sr-section\.sr-pair-next\s*\{\s*margin-top:/.test(css), 'the paired gap has no mobile value');

  // 3. A card's last element adds no margin inside its padding.
  assert.ok(/\.sr-card\s*>\s*:last-child\s*\{[^}]*margin-bottom:\s*0/.test(css), 'the card padding is uneven again');
});
