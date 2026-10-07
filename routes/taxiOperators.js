// Taxi and private hire operators: an indexable trade page.
//
// Built 07/10/2026 after a challenge round on a ChatGPT draft (Website &
// Hosting write-back "Taxi operator page: challenge round and Tom's decisions,
// 7 October 2026"). Tom's decisions of that day, which this page rests on:
//
//   - PRICES: all the core products at their approved names and prices, from
//     lib/whereToStartOffers.js. No taxi-specific price, never framed as a
//     reduction or a taxi rate.
//   - TENURE: "over 20 years in the taxi trade" is correct; Tom was a driver
//     before he owned the business. Consistent with the Evidence case study's
//     "nearly twenty years after Tom bought the business".
//   - INDEPENDENCE: no supplier pays Arrington. The page says so AND discloses
//     the iCabbi Marketplace listing, because an operator on another system
//     would find the listing and hold its absence against us.
//
// WHAT IT IS, AND WHAT IT IS NOT. Unlike the start-up page this one is NOT
// hidden: it is indexable, carries no noindex, and is listed in sitemap.xml,
// because the dispatch searches it is written for are organic as well as
// paid. It is NOT in the main navigation (it is a trade page, not a new front
// door for the whole business, which stays owner run businesses in Devon and
// Cornwall). test/taxiOperatorsPage.test.js pins all of this.
//
// WHAT IT DOES NOT CREATE. No new checkout, Stripe object, table, lead kind or
// Google Ads conversion. The call to action is the existing footer enquiry
// form; a taxi enquiry is told apart by its stored landing page (this path).
// The offer cards link to the existing offer pages, which carry their own
// checkout.
//
// WHY A STANDALONE ROUTE RATHER THAN A CMS PAGE: the same reasoning as
// routes/saleReadiness.js and routes/startUpReview.js. The copy is a code
// edit, not a CMS edit; that is the stated trade-off.
const db = require('../db/pool');
const themes = require('../db/themes');
const { getSiteShellData } = require('../lib/navShell');
const { OFFERS } = require('../lib/whereToStartOffers');

const TAXI_OPERATORS_PATH = '/taxi-and-private-hire-operators';

// The order the offers appear in on the page: the free conversation first,
// then the review, the review with implementation (the closest fit to a
// system change), the website, and the review with the website.
const TAXI_OFFER_ORDER = ['conversation', 'commercial_review', 'full_commercial_review', 'website_build', 'full_review_website_build'];

async function loadThemeAndShell() {
  const { rows: themeRows } = await db.query("SELECT content FROM content WHERE section_key = 'site.theme'");
  const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
  const theme = themes[activeTheme] || themes.dark;
  const shell = await getSiteShellData();
  return { theme, ...shell };
}

// PER-PAGE FOOTER CONTACT COPY, the same device the sale readiness and
// start-up pages use. Only the heading, body and message placeholder change,
// for this one render; the form, endpoint, attribution and Contact conversion
// are untouched and the global contact.* rows are never edited.
const TAXI_OPERATORS_CONTACT = {
  heading: 'Tell us what\'s going on',
  body: 'Which system you\'re on, roughly how many cars, and what\'s bothering you. A few lines is plenty.<br /><br />We\'ll come back to you to arrange a conversation with Tom, and you\'ll get a straight answer on whether we can help.',
  messagePlaceholder: 'Which system you\'re on, and what\'s not working'
};

function taxiOffers() {
  return TAXI_OFFER_ORDER.map((id) => OFFERS[id]).filter((o) => o && o.publicPriceApproved);
}

function mountPageRoute(app, generateCsrfToken) {
  app.get(TAXI_OPERATORS_PATH, async (req, res, next) => {
    try {
      const { theme, navPages, content, pageContact } = await loadThemeAndShell();
      res.render('taxi-operators', {
        theme,
        ga4Id: process.env.GA4_MEASUREMENT_ID || '',
        csrfToken: generateCsrfToken(req, res),
        navPages,
        content,
        offers: taxiOffers(),
        pageContact: { ...pageContact, ...TAXI_OPERATORS_CONTACT }
      });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { mountPageRoute, TAXI_OPERATORS_PATH, TAXI_OPERATORS_CONTACT, TAXI_OFFER_ORDER, taxiOffers };
