// The blog: /blog and /blog/<slug>, fed from Holo (lib/holoBlog.js).
//
// Tom, 18 November 2026: "we need a spot for it to publish blogs on". Holo
// drafts the articles; Tom pastes each draft to the Website & Hosting worker
// for a check of its facts and links, corrects it in Holo and presses
// Publish there. His Publish is the approval: only published articles reach
// this page, and nothing is published from this repository.
//
// The articles are the site's own pages: served in the page (so a search
// engine reads them), in the site's look, in sitemap.xml, each with its own
// title, description and canonical address. With HOLO_BLOG_EMBED_ID unset, or
// nothing published, /blog does not exist (the request falls through to the
// site's ordinary 404), and there is no footer link or sitemap entry.
//
// Holo's own widget shows an article at ?post=<slug> on the page it sits on.
// A link in that form is sent to the article's own address here.
const { loadThemeAndShell } = require('./taxiOperators');
const { SLUG_RE } = require('../lib/holoBlog');

const BLOG_PATH = '/blog';
const BLOG_TITLE = 'Blog';
// The site's own approved one-line description of the business (the home
// page's hero line), so the page says nothing new about Arrington.
const BLOG_DESCRIPTION = 'Articles from Arrington Consultancy, business consultant for established owner run businesses across Devon and Cornwall.';

function mountPageRoute(app, generateCsrfToken, blog) {
  const shell = async (req, res) => {
    const { theme, navPages, content, pageContact } = await loadThemeAndShell();
    return { theme, ga4Id: process.env.GA4_MEASUREMENT_ID || '', csrfToken: generateCsrfToken(req, res), navPages, content, pageContact, blogTitle: BLOG_TITLE, blogDescription: BLOG_DESCRIPTION };
  };

  app.get(BLOG_PATH, async (req, res, next) => {
    try {
      const articles = await blog.list();
      if (!articles.length) return next();
      const post = String(req.query.post || '').toLowerCase();
      if (post && SLUG_RE.test(post) && articles.some((a) => a.slug === post)) return res.redirect(301, `${BLOG_PATH}/${post}`);
      res.render('blog', { ...(await shell(req, res)), articles, article: null });
    } catch (err) {
      next(err);
    }
  });

  app.get(`${BLOG_PATH}/:slug`, async (req, res, next) => {
    try {
      const article = await blog.find(req.params.slug);
      if (!article) return next();
      const articles = await blog.list();
      const i = articles.findIndex((a) => a.slug === article.slug);
      res.render('blog', { ...(await shell(req, res)), articles, article, newer: i > 0 ? articles[i - 1] : null, older: i >= 0 && i < articles.length - 1 ? articles[i + 1] : null });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { mountPageRoute, BLOG_PATH, BLOG_TITLE, BLOG_DESCRIPTION };
