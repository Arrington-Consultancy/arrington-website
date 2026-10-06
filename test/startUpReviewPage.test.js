// The start-up idea review landing page, built 06/10/2026 from Tom's decision
// of the same day (Google Ads Worker Handoff Log, entries of 6 October 2026):
// a separate start-up offer tested through a dedicated Google Ads campaign,
// on a page that is HIDDEN from everything but those ads.
//
// Most of what is pinned here is an absence, because "hidden" is a set of
// decisions that each come undone by one well-meaning edit: a nav link added
// because the page is getting no traffic, a sitemap entry because the page
// "should be findable", a link from What We Do because it seems helpful.
// Every absence is paired with a positive assertion so a test cannot pass
// against a page that has lost the required thing too.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// EJS comments reach no visitor, and the comments explaining these decisions
// necessarily quote the things they forbid. Strip them first.
const emitted = (p) => read(p)
  .replace(/<%#[\s\S]*?%>/g, '')
  .replace(/<%\s*\/\*[\s\S]*?\*\/\s*%>/g, '');
const bodyOf = (p) => { const v = emitted(p); return v.slice(v.indexOf('<body>')); };

const PATH = '/start-up-idea-review';
const VIEW = 'views/start-up-review.ejs';
const ROUTE = 'routes/startUpReview.js';

test('the route is registered ahead of the CMS catch-all and sends noindex both ways', () => {
  const server = read('server.js');
  assert.ok(/require\('\.\/routes\/startUpReview'\)/.test(server), 'the route module is not required');
  assert.ok(/startUpReview\.mountPageRoute\(app, generateCsrfToken\)/.test(server), 'the page route is not mounted');
  const mountAt = server.indexOf('startUpReview.mountPageRoute');
  const catchAllAt = server.indexOf("app.get('/:slug'");
  assert.ok(catchAllAt > -1, 'the /:slug catch-all has moved or gone; this test needs updating');
  assert.ok(mountAt < catchAllAt, 'the route is registered after the /:slug catch-all, so the CMS pipeline would answer it first');

  const route = read(ROUTE);
  assert.ok(route.includes(`'${PATH}'`), `the route no longer serves ${PATH}`);
  assert.ok(/res\.set\('X-Robots-Tag',\s*'noindex'\)/.test(route), 'the X-Robots-Tag: noindex header is gone from the route');
  assert.ok(/<meta name="robots" content="noindex">/.test(emitted(VIEW)), 'the <meta name="robots" content="noindex"> tag is gone from the view');
});

test('it is hidden: not in the navigation, not in the footer, not in the sitemap, linked from nowhere', () => {
  const header = emitted('views/partials/site-header.ejs');
  const footer = emitted('views/partials/site-footer.ejs');
  const navShell = read('lib/navShell.js');
  const server = read('server.js');
  for (const [name, src] of [['site-header', header], ['site-footer', footer], ['navShell', navShell]]) {
    assert.ok(!src.includes(PATH) && !/start-up-idea|startUpReview|start-up-review/i.test(src), `${name} links to or names the start-up page`);
  }
  // The sitemap lists code routes by hand. Everything between the sitemap
  // handler and the end of its urlEntries must not mention this path.
  const sitemapAt = server.indexOf("app.get('/sitemap.xml'");
  const sitemapEnd = server.indexOf('</urlset>', sitemapAt);
  assert.ok(sitemapAt > -1 && sitemapEnd > sitemapAt, 'the sitemap handler has moved; this test needs updating');
  const sitemapSrc = server.slice(sitemapAt, sitemapEnd);
  assert.ok(!sitemapSrc.includes('start-up'), 'the start-up page is listed in sitemap.xml');
  // Not robots-disallowed either: a disallow would stop the Ads crawler and
  // would also stop any crawler ever seeing the noindex.
  const robotsAt = server.indexOf("app.get('/robots.txt'");
  const robotsSrc = server.slice(robotsAt, sitemapAt);
  assert.ok(!robotsSrc.includes('start-up'), 'the start-up page is robots-disallowed, which blocks the Ads crawler');

  // Linked from nowhere else: no view, partial, seed, lib or public script
  // outside this page and its route carries the path.
  const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel);
    return /\.(ejs|js|sql)$/.test(e.name) ? [rel] : [];
  });
  const offenders = ['views', 'lib', 'db', 'public/js', 'routes'].flatMap(walk)
    .filter((f) => f !== VIEW && f !== ROUTE)
    .filter((f) => read(f).includes(PATH));
  assert.deepStrictEqual(offenders, [], `the start-up page is linked or named from: ${offenders.join(', ')}`);

  // Positive control: the page itself is served and does carry the site's
  // own header and footer.
  const view = emitted(VIEW);
  assert.ok(view.includes("include('partials/site-header'"), 'the page lost the shared header');
  assert.ok(view.includes("include('partials/site-footer'"), 'the page lost the shared footer');
});

test('the call to action is the existing enquiry form, with no checkout and no new conversion', () => {
  const body = bodyOf(VIEW);
  // The route's own comments necessarily name the things it must not
  // contain, so the scans below run over its code only.
  const route = read(ROUTE).replace(/^\s*\/\/.*$/gm, '');
  // The hero button goes to the footer form. No second closing section (Tom,
  // 06/10/2026): "Who you'd be talking to" runs straight into the form.
  assert.ok(/class="su-hero-actions">\s*<a href="#conversation"/.test(body), 'the hero call to action no longer goes to the footer form');
  assert.ok(!/class="su-final"/.test(body), 'the duplicate closing call to action section is back');
  assert.ok(!/\/api\/checkout|stripe|checkout\.session|data-offer=/i.test(body + route), 'a checkout appeared on the start-up page');
  assert.ok(!/AW-18129914078|gtag\(\s*'event'\s*,\s*'conversion'/.test(body + route), 'a Google Ads conversion call appeared on the start-up page');
  // The footer copy override replaces only the three per-page fields, so the
  // form's endpoint, attribution capture and Contact conversion are untouched.
  assert.ok(/START_UP_REVIEW_CONTACT\s*=\s*\{[\s\S]*heading:[\s\S]*body:[\s\S]*messagePlaceholder:[\s\S]*\}/.test(route), 'the per-page footer copy override is gone');
  assert.ok(!/UPDATE content|INSERT INTO content/i.test(route), 'the footer override has become a CMS edit of the global contact rows');
  assert.ok(!read('views/partials/site-footer.ejs').includes('start-up'), 'the shared footer has been special-cased for this page');
});

test('the prices are the two approved fixed figures and never framed as a reduction', () => {
  const body = bodyOf(VIEW);
  assert.ok(body.includes('£500'), 'the £500 price is missing');
  assert.ok(!/£[0-9,]+\s*(?:<\/?[a-z]+>\s*)*(?:separately|normally|usually|rrp)|save £|was £|discount|introductory|50%|half price|launch (?:price|offer)|limited time/i.test(body), 'the price is framed as a reduction or a time-limited offer');
  // Tom, 06/10/2026: the £999 Website Build sits below the £500 review.
  // Those two approved public prices, and no other figure.
  assert.ok(!/£(?!(?:500|999)\b)[0-9][0-9,]*/.test(body), 'an unapproved price appeared on the page');
});

test('the five deliverables are exactly the ones Tom named, and the placeholder is gone', () => {
  // Tom, 06/10/2026: "£500 set-up review. Brand guidance, company structure
  // advice, banking advice, accountancy advice". Four items, his order,
  // nothing added for his trailing "etc". The placeholder that held this
  // space on the preview must not survive into the published page.
  const body = bodyOf(VIEW);
  assert.ok(!/data-placeholder|To be confirmed by Tom|must not be published/.test(body), 'the deliverables placeholder is still on the page');
  const list = body.match(/<ul class="su-dots su-includes" data-deliverables="5">([\s\S]*?)<\/ul>/);
  assert.ok(list, 'the deliverables list is missing');
  const leads = [...list[1].matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
  assert.deepStrictEqual(leads, ['Brand guidance.', 'Company structure advice.', 'What to sort out with a bank.', 'What to sort out with an accountant.', 'Marketing advice.']);
  assert.strictEqual((list[1].match(/<li>/g) || []).length, 5, 'a deliverable was added or removed');
  // The offer is named consistently: the set-up review, never a programme,
  // package, course or workshop.
  assert.ok(/£500 setup review/.test(body), 'the offer is no longer called the £500 setup review');
  assert.ok(!/\b(programme|package|workshop|bootcamp|masterclass)\b/i.test(body.replace(/<[^>]+>/g, ' ')), 'the offer is framed as a programme or package');
});

test('brand rules: UK English, we, no em dashes, no fire metaphors, no coaching language, no overpromising', () => {
  const body = bodyOf(VIEW);
  const route = read(ROUTE);
  const served = body + ' ' + route.match(/START_UP_REVIEW_CONTACT\s*=\s*\{[\s\S]*?\};/)[0];
  assert.ok(!served.includes('—'), 'an em dash is on the page');
  // Tom, 06/10/2026: "there shouldnt be really any dashs on the site unless
  // theres no other way". No en dash, and no hyphenated word in what a
  // visitor reads (startup, setup, seven figure). The URL keeps its hyphens.
  const visible = served.replace(/<[^>]+>/g, ' ');
  assert.ok(!visible.includes('–'), 'an en dash is on the page');
  const hyphenated = visible.match(/[A-Za-z]+-[A-Za-z]+/g) || [];
  assert.deepStrictEqual(hyphenated, [], `hyphenated words on the page: ${hyphenated.join(', ')}`);
  assert.ok(!/\bfire|firefight|burning|flames?\b/i.test(served), 'a fire metaphor is on the page');
  // First person is reserved for Useful Thinking; a start-up page is "we".
  const text = served.replace(/<[^>]+>/g, ' ');
  assert.ok(!/\b(I|I'm|I've|my|me)\b/.test(text.replace(/Tom Arrington built, grew and sold his own business/g, '')), 'first person singular is on the page');
  for (const banned of ['solutions', 'synergy', 'leverage', 'empower', 'journey', 'holistic', 'tailored', 'bespoke', 'transformational', 'world class', 'unlock your potential', 'mentor', 'coach you', 'coaching programme', 'accountability']) {
    assert.ok(!new RegExp(`\\b${banned.replace(/ /g, '\\s+')}\\b`, 'i').test(text), `banned or coaching language on the page: ${banned}`);
  }
  assert.ok(!/coaching/i.test(text), 'coaching language on the page');
  // Tom, 06/10/2026: "we embrace what people need, we don't tell them what we
  // won't do". No list of what the review is not.
  assert.ok(!/what you will not|\bit is not (a|coaching|advice)/i.test(text), 'the page lists what the review is not');
  assert.ok(!/do not think a paid review|lost nothing|do not need a business plan/i.test(text + read(ROUTE)), 'a negative line has come back');
  assert.ok(/We treat your money as if it's our own\./.test(text), "Tom's line in What you get is missing");
  for (const promise of [/guarantee/i, /will succeed/i, /double your/i, /proven (?:formula|system|method)/i, /get funded/i, /investor ready/i]) {
    assert.ok(!promise.test(text), `an overpromise is on the page: ${promise}`);
  }
  // Proof claims are the approved ones only.
  assert.ok(text.includes('Tom Arrington built, grew and sold his own business in a seven figure exit'), 'the approved operator proof is missing');
  assert.ok(text.includes('more than 20 years inside real businesses across Devon and Cornwall'), 'the approved Brand OS proof is missing');
  // The final pass of 06/10/2026, agreed with Tom after the ChatGPT sounding board.
  assert.ok(text.includes("looked at with fresh eyes and 20 years' experience"), 'the headline lost its "and"');
  assert.ok(text.includes('what to check with an accountant before you register'), 'the company structure line no longer routes tax to the accountant');
  assert.ok(text.includes('You come away with answers on all five that apply to your idea, and a clear next step.'), 'the what you get line changed');
  assert.ok(!/\breally\b/i.test(text), '"really" is back on the page');
  assert.ok(!/\b(?:MBA|PhD|award|award-winning|chartered|certified|accredited)\b/i.test(text), 'an unapproved credential is on the page');
});

test('the £999 website build sits in its own section below the £500 review', () => {
  // Tom, 06/10/2026: "slip the website build into that page, it needs to sit
  // below the £500 review, we can build you new website for £999". Its own
  // section, directly after the review, with no button so the enquiry form
  // stays the one call to action, and links OUT to both website pages.
  const body = bodyOf(VIEW);
  const site = body.match(/<div class="su-section su-website">([\s\S]*?)\n        <\/div>/);
  assert.ok(site, 'the website section is missing');
  assert.ok(site[1].includes('£999'), 'the website section does not state £999');
  assert.ok(!site[1].includes('£500'), 'the website section repeats the review price');
  assert.ok(/an HTML site built from scratch, not from a template, and completely customisable/.test(site[1]), "Tom's line is missing");
  assert.ok(!/take advantage|special offer|limited/i.test(site[1]), 'the £999 reads as a promotion');
  assert.ok(site[1].includes('href="/where-to-start/website-build"'), 'the Website Build link is missing');
  assert.ok(site[1].includes('href="/websites-and-ai"'), 'the Websites and AI link is missing');
  assert.ok(!/class="btn/.test(site[1]), 'the website section carries a button competing with the enquiry form');
  const review = body.indexOf('What the £500 setup review covers');
  const website = body.indexOf('su-website');
  const next = body.indexOf("Who you'd be talking to");
  assert.ok(review < body.indexOf('su-includes') && body.indexOf('su-includes') < website, 'the website section is not below the review');
  assert.ok(website < next, 'the website section is not directly below the review');
});

