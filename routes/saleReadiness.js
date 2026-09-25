// Sale readiness — "Get your business ready to sell".
//
// A dedicated CAMPAIGN LANDING PAGE, built 25/09/2026 from the controlled
// brief in ARRINGTON WEBSITE & HOSTING - WORKER HANDOFF ("CURRENT SALE
// READINESS DECISION AND CLAUDE BUILD HANDOFF"), following the cross-AI
// commercial review recorded in the same document.
//
// WHAT THIS IS, AND THE PART THAT IS EASY TO UNDO BY ACCIDENT:
// it is reachable directly from social media and, if Tom separately
// configures one, a Google Ads campaign. It is deliberately NOT a new
// organic front door. Tom's decision, verbatim from the brief: "Sale
// readiness must not become a competing top-level Arrington proposition or
// duplicate the existing Commercial Review." So:
//
//   - it is NOT in the main navigation, and must not be added to it
//   - it is NOT promoted on the homepage
//   - the existing entry-point hierarchy (decision 7 of 14/09/2026) is
//     unchanged: Owner Dependency Quiz stays the main diagnostic route and
//     Book a Conversation the main human route
//   - no existing diagnostic, Product Guide or Useful Thinking route was
//     demoted or altered to make room for it
//
// WHAT IT DOES NOT CREATE. No new price, no new checkout, no new Stripe
// object, no new database table, no new lead kind and no new Google Ads
// conversion label. The entry offer remains the existing £500 Commercial
// Review at its existing public price, and this page links to that page's
// own existing purchase route rather than carrying a second one. Follow-on
// implementation is separately agreed work with no published package price,
// which is exactly what 02 ARRINGTON COMMERCIAL POSITION already permits
// ("Optional sale-readiness work requires a separate fixed fee or project
// agreement"), so no new commercial authority is claimed or needed.
//
// WHY A STANDALONE ROUTE RATHER THAN A CMS PAGE. Two reasons. A `pages` row
// appears in the nav unless show_in_nav is switched off, so the "not in the
// main navigation" decision would rest on a database flag somebody could
// flip in the admin panel without realising it was a decision; here it rests
// on the page simply not being in navPages at all. And the copy is
// list-shaped in three places, which the CMS templates handle badly: every
// slot in `fourcards`, `insights` and `assessment` renders unconditionally
// (there is no skip-if-empty logic anywhere in the codebase), so a six-item
// list in a four-slot template leaves visible empty boxes. The trade-off,
// stated rather than hidden: this page is NOT CMS-editable, so campaign copy
// changes are a code edit. That is the same trade-off every Where to Start
// offer page and every assessment tool already makes.
//
// Registration follows the established standalone-tool pattern: the GET page
// is registered via mountPageRoute ahead of the global CSRF middleware so its
// token is generated here. There is no router export because this page has no
// POST endpoints of its own: every action on it is a link to an existing
// route.
const db = require('../db/pool');
const themes = require('../db/themes');
const { getSiteShellData } = require('../lib/navShell');

// The campaign URL. Long, and deliberately an exact match for the page's own
// promise, which is what an ad or a social post needs; the site already uses
// long descriptive slugs (/book-a-30-minute-conversation,
// /business-consultant-devon). Registered through mountPageRoute, so it is
// matched before the generic /:slug CMS catch-all further down server.js.
const SALE_READINESS_PATH = '/get-your-business-ready-to-sell';

async function loadThemeAndShell() {
  const { rows: themeRows } = await db.query("SELECT content FROM content WHERE section_key = 'site.theme'");
  const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
  const theme = themes[activeTheme] || themes.dark;
  const shell = await getSiteShellData();
  return { theme, ...shell };
}

// PER-PAGE FOOTER CONTACT COPY.
//
// The footer enquiry form is global: one block, rendered from the contact.*
// content rows on every page of the site. On production those rows currently
// read "Tell us where the pressure is showing", which is right for a visitor
// who arrived with a problem and wrong for one reading about preparing a
// business for sale. Tom raised it against the live page on 25/09/2026.
//
// Two things made it worse than a mismatched sentence. The footer lands
// immediately after this page's own closing CTA, so the visitor met two
// different contact prompts back to back. And "pressure showing" quietly
// reframes the reader as someone in trouble, which is the opposite of this
// page's position that preparing ahead is the better place to be.
//
// The override is per-page and nothing else changes. views/partials/site-footer
// renders pageContact.heading / .body / .messagePlaceholder, so replacing
// those three for this one render leaves every other page exactly as it was.
// Deliberately NOT done by editing the contact.* content rows: those are the
// global copy and changing them would rewrite the footer on the homepage, the
// offer pages, the assessments and everything else. A test asserts this stays
// an override rather than becoming a CMS edit.
//
// The phone, name, email, day/time, message and "How did you hear about us"
// fields are untouched, as is the form's endpoint and behaviour.
const SALE_READINESS_CONTACT = {
  heading: 'Tell us what you are weighing up.',
  body: 'You do not need a decision made or a polished set of accounts. Tell us roughly where the business is, and we will come back to you.',
  messagePlaceholder: 'What you are considering, and where the business is now'
};

function mountPageRoute(app, generateCsrfToken) {
  app.get(SALE_READINESS_PATH, async (req, res, next) => {
    try {
      const { theme, navPages, content, pageContact } = await loadThemeAndShell();
      res.render('sale-readiness', {
        theme,
        ga4Id: process.env.GA4_MEASUREMENT_ID || '',
        csrfToken: generateCsrfToken(req, res),
        navPages,
        content,
        // Spread first so label, headerCtaText and submitText keep the site's
        // own values; only the three fields above are this page's.
        pageContact: { ...pageContact, ...SALE_READINESS_CONTACT }
      });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { mountPageRoute, SALE_READINESS_PATH };
