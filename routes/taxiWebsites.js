// Taxi and private hire websites: /taxi-and-private-hire-operators/websites.
//
// Built 13/10/2026 from the Google Ads worker's brief "New taxi websites page
// with dispatch integration", this worker's proposal of the same day, and the
// approval "Taxi websites page approved with changes" (Tom, in chat with the
// Google Ads worker). It is the landing page for the Taxi websites ad group,
// whose live headline "Booking Linked To Dispatch" it has to back.
//
// What Tom decided, and what the page may therefore say:
//   - £999 covers the website, web bookings that go straight into the
//     operator's dispatch system, and an email booking check. Nothing is
//     extra, and the price comes from lib/whereToStartOffers.js.
//   - The systems named are iCabbi, Autocab and Cordic, plus "other systems
//     with a booking API". Never "any system" on its own. Autocab and Cordic
//     publish no third-party access terms, so the link is promised only where
//     the operator can arrange API access with their provider.
//   - The email check is described only as the approval describes it: booking
//     requests that arrive by email are checked against the jobs in the
//     dispatch system, and one never keyed in, or keyed in wrong, is flagged.
//     No email systems, alert channels or automatic correction are named.
//   - Nothing about fare quotes, card payment, booking tracking, hosting or
//     upkeep. No operator is named as a client. The "30 minutes" Tom quoted
//     for his part of the link is deliberately not on the page.
//
// Indexable and in sitemap.xml, not in the main navigation, the same as the
// taxi operators page. The call to action is the existing footer enquiry form
// with a per-page copy override; no checkout, conversion, lead kind or table.
// test/taxiWebsitesPage.test.js pins all of it.
const { loadThemeAndShell, TAXI_WEBSITES_PATH } = require('./taxiOperators');
const { OFFERS } = require('../lib/whereToStartOffers');

const TAXI_WEBSITES_CONTACT = {
  heading: 'Tell us about your firm',
  body: 'Which dispatch system you\'re on and how customers book with you now. A few lines is plenty.<br /><br />We\'ll come back to you to arrange a conversation with Tom, and you\'ll get a straight answer on whether your system can take bookings from a website.',
  messagePlaceholder: 'Your dispatch system and how customers book with you now'
};

function mountPageRoute(app, generateCsrfToken) {
  app.get(TAXI_WEBSITES_PATH, async (req, res, next) => {
    try {
      const { theme, navPages, content, pageContact } = await loadThemeAndShell();
      res.render('taxi-websites', {
        theme,
        ga4Id: process.env.GA4_MEASUREMENT_ID || '',
        csrfToken: generateCsrfToken(req, res),
        navPages,
        content,
        websiteOffer: OFFERS.website_build,
        pageContact: { ...pageContact, ...TAXI_WEBSITES_CONTACT }
      });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { mountPageRoute, TAXI_WEBSITES_PATH, TAXI_WEBSITES_CONTACT };
