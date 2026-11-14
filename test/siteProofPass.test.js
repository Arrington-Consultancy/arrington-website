// The proof pass of 14/11/2026 (Tom: "make the improvements you think are
// right and ask me questions", after an outside review found the site's weak
// point was proof). Three things are pinned here:
//
//   1. The Commercial Review page has something to tap on the first screen,
//      shows the live Google rating only when Google gave one, and shows one
//      real document: the assessment, never the 90-Day Action Plan, which
//      belongs to the implementation offer.
//   2. The thank-you page repeats the form's own promise instead of "shortly".
//   3. Section buttons that led to the separate 30 Minute Conversation page
//      open the form on their own page, and nothing else is rewritten.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { OFFERS } = require('../lib/whereToStartOffers');
const { COMMERCIAL_REVIEW_CONTACT } = require('../routes/whereToStart');
const { MARKER, BOOKING_SLUG, applyBookingButtonsToForm } = require('../lib/bookingButtonsToForm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const emitted = (p) => read(p).replace(/<%#[\s\S]*?%>/g, '');
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

function renderReview(extra) {
  const src = emitted('views/where-to-start-commercial-review.ejs').replace(/<%-\s*include\([\s\S]*?\)\s*%>/g, '');
  const html = ejs.render(src, {
    theme: { vars: {} }, nonce: 'n', csrfToken: 't', navPages: [], content: {}, pageContact: {},
    offer: OFFERS.commercial_review, ...extra
  });
  return html.slice(html.indexOf('<body>'));
}

test('the Commercial Review page has the conversation button before the description', () => {
  const body = renderReview({});
  const hero = body.match(/<p class="wts-hero-action" data-hero-enquiry>[\s\S]*?<\/p>/);
  assert.ok(hero, 'the button at the top is gone');
  assert.ok(/<a href="#conversation" class="btn btn-primary">Book a 30 minute conversation<\/a>/.test(hero[0]));
  assert.ok(body.indexOf('data-hero-enquiry') < body.indexOf('<h2>What happens</h2>'), 'the button sits below the description again');
  // The line under it is the form's own sentence, so the page never promises
  // what the form does not.
  const formLine = read('views/partials/site-footer.ejs');
  const note = "The first conversation is free and there's no obligation.";
  assert.ok(text(body).includes(note));
  assert.ok(formLine.includes(note), 'the form no longer says the first conversation is free');
  // The form it leads to is headed with the button's own words; the text
  // under that heading stays the site's own.
  assert.strictEqual(COMMERCIAL_REVIEW_CONTACT.heading, 'Book a 30 minute conversation');
  assert.deepStrictEqual(Object.keys(COMMERCIAL_REVIEW_CONTACT), ['heading']);
  // Paying is still there and still secondary.
  assert.strictEqual((body.match(/id="wtsCheckoutSubmit"/g) || []).length, 1);
});

test('the Google rating shows the live figure, and nothing when Google gave none', () => {
  const withRating = renderReview({ googleReviews: { rating: 5, userRatingCount: 5 } });
  const line = withRating.match(/<a href="\/evidence#googlereviews" class="wts-google-rating" data-google-rating>[\s\S]*?<\/a>/);
  assert.ok(line, 'no rating line with a rating');
  assert.ok(text(line[0]).includes('5.0 from 5 reviews on Google'));
  assert.ok(text(renderReview({ googleReviews: { rating: 4.8, userRatingCount: 1 } })).includes('4.8 from 1 review on Google'));
  for (const none of [{}, { googleReviews: null }, { googleReviews: {} }, { googleReviews: { rating: 5, userRatingCount: 0 } }, { googleReviews: { userRatingCount: 5 } }]) {
    assert.ok(!renderReview(none).includes('data-google-rating'), `a rating line rendered for ${JSON.stringify(none)}`);
  }
  // No figure is typed into the page.
  assert.ok(!/\d(\.\d)? from \d+ reviews?/.test(emitted('views/where-to-start-commercial-review.ejs')), 'a rating is written into the page');
});

test('one real document, the assessment, with the wording the implementation page already carries', () => {
  const body = renderReview({});
  const block = body.match(/<div class="wts-evidence-section" data-review-evidence>[\s\S]*?<\/a>\s*<\/div>/);
  assert.ok(block, 'the document block is gone');
  const t = text(block[0]);
  const other = text(emitted('views/where-to-start-full-commercial-review.ejs'));
  for (const line of ['See the standard', 'Real work, not a description of work.', 'Half-Time Team Talk', 'The commercial assessment that comes from following the evidence.']) {
    assert.ok(t.includes(line), `missing: ${line}`);
    assert.ok(other.includes(line), `not the implementation page's wording: ${line}`);
  }
  assert.ok(block[0].includes('href="/evidence#documents"'));
  assert.ok(fs.existsSync(path.join(root, 'public/img/docs/half-time-team-talk.jpg')));
  // The plan belongs to the £2,500 offer; showing it here would suggest the
  // £500 buys it.
  assert.ok(!/90-Day Action Plan/.test(body), 'the 90-Day Action Plan is shown on the £500 page');
  assert.ok(body.indexOf('data-review-evidence') > body.indexOf('<h2>Six months on</h2>'));
  assert.ok(body.indexOf('data-review-evidence') < body.indexOf('Not sure this is the right thing for you?'));
});

test('the thank-you page repeats the form\'s promise', () => {
  const ty = emitted('views/thank-you.ejs');
  const promise = 'Tom reads every enquiry himself and replies personally, usually within one working day.';
  assert.ok(ty.includes(`<p class="ty-lede">${promise}</p>`));
  assert.ok(read('views/partials/site-footer.ejs').includes(promise), 'the form no longer makes that promise');
  assert.ok(!/get back to you shortly/i.test(ty));
});

function fakeDb({ pages, content }) {
  const store = new Map(Object.entries(content));
  return {
    store,
    async query(sql, params = []) {
      if (/^SELECT 1 FROM content WHERE section_key = \$1/.test(sql)) return { rows: store.has(params[0]) ? [{}] : [] };
      if (/^SELECT slug, section_order FROM pages WHERE slug <> \$1/.test(sql)) return { rows: pages.filter((p) => p.slug !== params[0]) };
      if (/^UPDATE content SET content = \$1 WHERE section_key = \$2 AND btrim\(content\) = \$3/.test(sql)) {
        if (!store.has(params[1]) || String(store.get(params[1])).trim() !== params[2]) return { rowCount: 0 };
        store.set(params[1], params[0]);
        return { rowCount: 1 };
      }
      if (/^INSERT INTO content/.test(sql)) { if (!store.has(params[0])) store.set(params[0], params[1]); return { rowCount: 1 }; }
      throw new Error(`unexpected query: ${sql}`);
    }
  };
}

const pages = () => [
  { slug: 'main', section_order: ['hero', 'filter__2'] },
  { slug: 'evidence', section_order: ['casestudy__4', 'documents', 'intervention__6', 'filter__9'] },
  { slug: 'about-us', section_order: ['hero__2', 'intervention__12'] },
  { slug: BOOKING_SLUG, section_order: ['hero__3', 'filter__4'] }
];
const content = () => ({
  'filter__2.button_link': 'evidence',
  'intervention__6.button_link': BOOKING_SLUG,
  'intervention__6.button_text': 'Talk to us',
  'filter__9.button_link': ` ${BOOKING_SLUG} `,
  'intervention__12.button_link': 'where-to-start/commercial-review',
  // On the booking page itself, and an orphan on no page: both left alone.
  'filter__4.button_link': BOOKING_SLUG,
  'intervention__30.button_link': BOOKING_SLUG,
  // Not a button template.
  'hero__2.button_link': BOOKING_SLUG
});

test('booking buttons open the form on their own page; everything else is left alone', async () => {
  const db = fakeDb({ pages: pages(), content: content() });
  const note = await applyBookingButtonsToForm(db);
  assert.match(note, /^2 button\(s\)/);
  assert.ok(note.includes('evidence: intervention__6') && note.includes('evidence: filter__9'));
  assert.strictEqual(db.store.get('intervention__6.button_link'), '');
  assert.strictEqual(db.store.get('filter__9.button_link'), '');
  assert.strictEqual(db.store.get('intervention__6.button_text'), 'Talk to us', 'the button text was touched');
  assert.strictEqual(db.store.get('filter__2.button_link'), 'evidence');
  assert.strictEqual(db.store.get('intervention__12.button_link'), 'where-to-start/commercial-review');
  assert.strictEqual(db.store.get('filter__4.button_link'), BOOKING_SLUG, 'a button on the booking page was changed');
  assert.strictEqual(db.store.get('intervention__30.button_link'), BOOKING_SLUG, 'a section on no page was changed');
  assert.strictEqual(db.store.get('hero__2.button_link'), BOOKING_SLUG, 'a hero was changed');
  assert.ok(db.store.has(MARKER));

  // A second boot does nothing, even if a button is pointed back by hand.
  db.store.set('intervention__6.button_link', BOOKING_SLUG);
  assert.strictEqual(await applyBookingButtonsToForm(db), null);
  assert.strictEqual(db.store.get('intervention__6.button_link'), BOOKING_SLUG);
});

test('with nothing to move it says so and still runs once', async () => {
  const db = fakeDb({ pages: [{ slug: 'main', section_order: ['hero'] }], content: {} });
  assert.match(await applyBookingButtonsToForm(db), /nothing to do/);
  assert.strictEqual(await applyBookingButtonsToForm(db), null);
});

test('an empty link means the form, with the gold button, in both templates', () => {
  const index = read('views/index.ejs');
  assert.ok(index.includes("const _isPrimaryCta = _btnSlug === '' || _btnSlug === 'book-a-30-minute-conversation';"));
  assert.ok(index.includes("const _fIsPrimaryCta = _fBtnSlug === '' || _fBtnSlug === 'book-a-30-minute-conversation';"));
  assert.ok(index.includes("(_validSlug ? _resolvePageHref(_btnSlug) : '#conversation')"));
  assert.ok(index.includes("(_fValidSlug ? _resolvePageHref(_fBtnSlug) : '#conversation')"));
  assert.ok(read('db/seed.js').includes("require('../lib/bookingButtonsToForm').applyBookingButtonsToForm(db)"), 'the seed no longer runs it');
});
