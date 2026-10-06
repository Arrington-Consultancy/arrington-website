// Start-up idea review: a hidden Google Ads landing page.
//
// Built 06/10/2026 from Tom's decision of the same day (recorded in the
// Arrington Google Ads Worker Handoff Log, entries of 6 October 2026, and in
// the Website & Hosting Handoff Log): a separate start-up offer, tested
// through a dedicated Google Ads campaign. The main site and the existing ads
// stay aimed at established owner run businesses, and start-up searches have
// already been excluded from those ads at campaign level, so this page is the
// ONLY place start-up traffic is sent.
//
// WHAT "HIDDEN" MEANS HERE, because every one of these is a decision and each
// is easy to undo by a well-meaning edit:
//
//   - not in the main navigation (it is not in navPages and must not be added)
//   - not in the footer links
//   - not in sitemap.xml (code routes are listed by hand in server.js; this
//     one is deliberately absent)
//   - noindex, both as a <meta name="robots"> tag on the page and as an
//     X-Robots-Tag header from this route, so a crawler that never parses the
//     HTML still sees it
//   - not linked from anywhere else on the site
//   - reached only from the start-up ads
//
// It is deliberately NOT robots-disallowed: Google's Ads crawler has to be
// able to fetch a landing page to approve the ad, and a robots block would
// also stop a crawler ever seeing the noindex. test/startUpReviewPage.test.js
// pins all of the above.
//
// WHAT IT DOES NOT CREATE. No new checkout, no new Stripe object, no new
// database table, no new lead kind and no new Google Ads conversion action.
// The call to action is the existing footer enquiry form, which stores the
// enquiry in `leads` with the visit's attribution (landing page, referrer,
// utm_* and gclid) exactly as every other page does, and the Contact
// conversion fires on /thank-you unchanged. A start-up enquiry is told apart
// by its stored landing page (this path), shown in the owner email as
// "Landing page:" and in the admin Leads panel as "(landed on ...)".
//
// WHY A STANDALONE ROUTE RATHER THAN A CMS PAGE: the same reasoning as
// routes/saleReadiness.js. "Hidden" here rests on the page not being in
// navPages or the sitemap at all, rather than on database flags somebody
// could flip in the admin panel without realising they were decisions. The
// trade-off, stated: the copy is a code edit, not a CMS edit.
//
// THE PRICE. £500 is the figure Tom set on 6 October 2026 for this offer. It
// is a new price point for a new audience and is recorded in 02 ARRINGTON
// COMMERCIAL POSITION and 01 ARRINGTON CURRENT OPERATING POSITION by their own
// owners, not by this worker. It must never be framed as a discount, an
// introductory price or a reduction from anything (the same rule the
// Commercial Review's £500 carries in lib/whereToStartOffers.js).
const db = require('../db/pool');
const themes = require('../db/themes');
const { getSiteShellData } = require('../lib/navShell');

// The campaign URL. Descriptive, like the site's other landing-page slugs
// (/business-consultant-devon, /get-your-business-ready-to-sell). Registered
// through mountPageRoute, so it is matched before the generic /:slug CMS
// catch-all further down server.js.
const START_UP_REVIEW_PATH = '/start-up-idea-review';

async function loadThemeAndShell() {
  const { rows: themeRows } = await db.query("SELECT content FROM content WHERE section_key = 'site.theme'");
  const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
  const theme = themes[activeTheme] || themes.dark;
  const shell = await getSiteShellData();
  return { theme, ...shell };
}

// PER-PAGE FOOTER CONTACT COPY, the same device routes/saleReadiness.js uses
// and for the same reason. The global footer reads "Tell us where the
// pressure is showing", which is written for an established owner with a
// problem and is wrong for someone who has not started yet. Only the heading,
// the body and the message placeholder are replaced, for this one render.
// The form's fields, endpoint, attribution capture and the Contact conversion
// are untouched, and the contact.* content rows (the global copy) are never
// edited. The <br /><br /> is how the global contact.body already carries a
// paragraph break, since the footer renders this field unescaped.
const START_UP_REVIEW_CONTACT = {
  heading: 'Tell us about the idea',
  body: 'What the business would do, who you think will pay for it and how far you\'ve got. A few lines is plenty.<br /><br />We\'ll come back to you to arrange a conversation, and you\'ll get a straight view of where the idea stands.',
  messagePlaceholder: 'What the business would do, and where you are with it'
};

function mountPageRoute(app, generateCsrfToken) {
  app.get(START_UP_REVIEW_PATH, async (req, res, next) => {
    try {
      const { theme, navPages, content, pageContact } = await loadThemeAndShell();
      // Belt and braces with the <meta name="robots"> tag in the view.
      res.set('X-Robots-Tag', 'noindex');
      res.render('start-up-review', {
        theme,
        ga4Id: process.env.GA4_MEASUREMENT_ID || '',
        csrfToken: generateCsrfToken(req, res),
        navPages,
        content,
        pageContact: { ...pageContact, ...START_UP_REVIEW_CONTACT }
      });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { mountPageRoute, START_UP_REVIEW_PATH, START_UP_REVIEW_CONTACT };
