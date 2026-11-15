// MOCK-UP ONLY, never merged to main (Tom, 15/11/2026: "the theme is, apply
// to work with us"). A draft of the home page for Tom to look at, served at
// /mock/home-apply and only when MOCK_HOME_APPLY=1 is set, which it never is
// on production. noindex. Nothing here is live copy until Tom approves the
// exact wording.
const db = require('../db/pool');
const themes = require('../db/themes');
const { getSiteShellData } = require('../lib/navShell');

const MOCK_CONTACT = {
  label: '',
  heading: 'Apply to work with us',
  body: 'Tell us about the business and what you want to change. You do not need a polished brief or perfect set of accounts.',
  messagePlaceholder: 'The business, what is working, and what you want to change',
  submitText: 'Send your application',
  headerCtaText: 'Apply to work with us',
  nextText: 'Tom reads every application himself and replies personally, usually within one working day.',
  hideNavWhatsapp: true
};

function mountPageRoute(app, generateCsrfToken) {
  if (process.env.MOCK_HOME_APPLY !== '1') return;
  app.get('/mock/home-apply', async (req, res, next) => {
    try {
      const { rows } = await db.query("SELECT content FROM content WHERE section_key = 'site.theme'");
      const theme = themes[(rows[0] && rows[0].content) || 'dark'] || themes.dark;
      const shell = await getSiteShellData();
      res.set('X-Robots-Tag', 'noindex');
      res.render('mock-home-apply', {
        theme,
        ga4Id: '',
        csrfToken: generateCsrfToken(req, res),
        navPages: shell.navPages,
        content: shell.content,
        pageContact: { ...shell.pageContact, ...MOCK_CONTACT }
      });
    } catch (err) { next(err); }
  });
}

module.exports = { mountPageRoute };
