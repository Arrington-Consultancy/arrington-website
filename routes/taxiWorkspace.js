// The taxi office AI workspace: /taxi-and-private-hire-operators/office-workspace.
//
// Built 19/10/2026 from the Google Ads worker's brief "BRIEF - Taxi Office AI
// Workspace landing page and iCabbi copy" (Drive, approved for build by Tom
// on 19 October), this worker's pushback the same day, and Tom's answers to
// it. Built hidden, as the brief asked, and RELEASED the same day on Tom's
// "approve" after he had seen it live: indexable, in sitemap.xml, linked from
// the taxi websites page's workspace section. Still not in the navigation,
// like the other taxi pages.
//
// What Tom decided, and what the page may therefore say:
//   - Two products, bought separately or together: the website £999 (from the
//     offer catalogue) and the workspace £999 (WORKSPACE_PRICE_PENCE, shared
//     with the websites page); £1,998 for both. Support after setup is
//     optional and priced on the call; no monthly figure is published.
//   - Five workers (Bookings, Customer emails, Complaints, Licensing, Social
//     media) and the booking checker as its own part. Tom: "include it's a
//     good thing to have" (licensing and complaints) and "show max of what it
//     can do, don't be over cautious". The checker's list is what the
//     Tidewell demo does (lib/taxiOffice/match.js), and nothing it does not:
//     no PO numbers, no phone history, no flight tracking, no capacity, never
//     "checks every detail", and no savings figures or error rates.
//   - "Cuts office errors" is Tom's (the brief's H1, and "it will cut errors,
//     there's no way around it"). No measured figure goes beside it.
//   - iCabbi, Autocab and Cordic are named (Tom: "we connect icabbi autocab
//     cordic and all major dispatch systems"), with access arranged with the
//     operator's provider, as on the websites page.
//   - Tom's story in the third person (Brand OS), with the approved facts:
//     Abacus and Falmouth Taxis, nearly twenty years, the last eight or so on
//     iCabbi, around 3,500 jobs a week at peak (Tom, 19/10/2026). The brief's
//     "more than 50 drivers and staff" is not used: no record backs it.
//   - The demo office stays behind a login; the page shows screenshots, each
//     captioned as the demo. A screen recording slot appears only once the
//     file exists (VIDEO_FILE).
//   - The call to action is the existing footer enquiry form with page
//     wording (Tom: "ok agree"), so the Contact conversion fires on /thank-you
//     as on every other page. A login request comes through the same form.
const fs = require('fs');
const path = require('path');
const { loadThemeAndShell, TAXI_WEBSITES_PATH, TAXI_WORKSPACE_PATH } = require('./taxiOperators');
const { WORKSPACE_PRICE_PENCE } = require('./taxiWebsites');
const { OFFERS } = require('../lib/whereToStartOffers');

// Tom's 60 second screen recording of the booking check (brief, open item 4).
// Drop it here and the page shows it; until then the page shows nothing in
// its place.
const VIDEO_FILE = path.join(__dirname, '..', 'public', 'video', 'taxi-office', 'booking-check.mp4');
const VIDEO_URL = '/video/taxi-office/booking-check.mp4';

const TAXI_WORKSPACE_CONTACT = {
  heading: 'Book a 15 minute walk through',
  body: 'Tell us which dispatch system you use and how many controllers you have. If you would rather look round the demo office on your own, ask for a login and Tom will set one up.<br /><br />Tom will be in touch to book your walk through.',
  messagePlaceholder: 'Your dispatch system and how many controllers you have, or ask for a login',
  timePlaceholder: 'Best day/time for the walk through (optional)'
};

function mountPageRoute(app, generateCsrfToken) {
  app.get(TAXI_WORKSPACE_PATH, async (req, res, next) => {
    try {
      const { theme, navPages, content, pageContact } = await loadThemeAndShell();
      res.render('taxi-workspace', {
        theme,
        ga4Id: process.env.GA4_MEASUREMENT_ID || '',
        csrfToken: generateCsrfToken(req, res),
        navPages,
        content,
        websiteOffer: OFFERS.website_build,
        workspacePricePence: WORKSPACE_PRICE_PENCE,
        websitesPath: TAXI_WEBSITES_PATH,
        videoUrl: fs.existsSync(VIDEO_FILE) ? VIDEO_URL : '',
        pageContact: { ...pageContact, ...TAXI_WORKSPACE_CONTACT }
      });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { mountPageRoute, TAXI_WORKSPACE_PATH, TAXI_WORKSPACE_CONTACT, VIDEO_FILE, VIDEO_URL };
