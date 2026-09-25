// /thank-you — where the footer contact form lands after a successful
// enquiry, and the ONLY place the Google Ads "Contact" conversion
// (AW-18129914078/vCKKCKjSna0cEN6RgsVD) fires.
//
// The conversion snippet is rendered only when ?c= carries a token that
// lib/contactConversion.js verifies, and that token exists only once POST
// /api/leads has stored the enquiry. So:
//   - a refresh counts nothing: the page's own script swaps the address for
//     the bare /thank-you before anyone can refresh it, and remembers the
//     token as spent for the rest of the browser session;
//   - a direct visit, a bookmark or a back-button return counts nothing;
//   - a copied URL reopened inside the token's 30 minutes can render the
//     snippet again, but carries the same transaction_id, which Google Ads
//     de-duplicates on its own side.
//
// Not in the navigation, not in sitemap.xml (which lists pages rows only),
// noindex, and never cached, because the tokened response is per-visitor.
// Registered ahead of the global CSRF middleware like the other standalone
// pages, since the footer carries the enquiry form and needs a token.
const db = require('../db/pool');
const themes = require('../db/themes');
const { getSiteShellData } = require('../lib/navShell');
const { verifyToken, THANK_YOU_PATH } = require('../lib/contactConversion');

function mountPageRoute(app, generateCsrfToken) {
  app.get(THANK_YOU_PATH, async (req, res, next) => {
    try {
      const { rows: themeRows } = await db.query("SELECT content FROM content WHERE section_key = 'site.theme'");
      const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
      const theme = themes[activeTheme] || themes.dark;
      const { navPages, content, pageContact } = await getSiteShellData();
      res.set('Cache-Control', 'no-store');
      res.set('X-Robots-Tag', 'noindex, nofollow');
      res.render('thank-you', {
        theme,
        ga4Id: process.env.GA4_MEASUREMENT_ID || '',
        csrfToken: generateCsrfToken(req, res),
        navPages,
        content,
        pageContact,
        conversion: verifyToken(req.query.c)
      });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { mountPageRoute };
