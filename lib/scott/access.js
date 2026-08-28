// Scott AI Demonstration — access control.
//
// Reuses the site's EXISTING page_access mechanism rather than building a
// second one: a single synthetic, hidden `pages` row (see SCOTT_PAGE_SLUG
// below, seeded in db/seed.js) acts purely as an access-grant anchor. It is
// never rendered by the generic CMS renderPage() in server.js — the Scott
// routes are registered directly (see routes/scott.js's mountPageRoute,
// same pattern as Market Ready Test etc.) ahead of the `/:slug` catch-all,
// so that row is only ever read here, for its id, never served as a page.
//
// This also means: no second admin screen. Granting or revoking an invited
// demo viewer's access is done with the EXISTING "Page access" panel in the
// admin menu, against this one synthetic page, exactly as Tom's agreed
// design specified.
//
// Same reasoning as every other page_access-restricted page on this site:
// a user without access gets a 404, not a 403 — this hides the existence of
// the demo from anyone not explicitly invited, rather than confirming there
// is something there they're merely not allowed to see.

const db = require('../../db/pool');

const SCOTT_PAGE_SLUG = 'scott-ai-demonstration';

let cachedPageId = null;

async function getScottPageId() {
  if (cachedPageId !== null) return cachedPageId;
  const { rows } = await db.query('SELECT id FROM pages WHERE slug = $1', [SCOTT_PAGE_SLUG]);
  cachedPageId = rows.length ? rows[0].id : null;
  return cachedPageId;
}

// admin/content always have access (no invitation needed — see the agreed
// design: "Tom's own existing admin account does not need to go through
// the same explicit per-user invitation gate as external demo viewers").
// client users need an explicit page_access row against the synthetic page.
async function hasScottAccess(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'content') return true;
  const pageId = await getScottPageId();
  if (!pageId) return false; // synthetic page not seeded yet — fail closed
  const { rows } = await db.query(
    'SELECT 1 FROM page_access WHERE page_id = $1 AND user_id = $2',
    [pageId, user.id]
  );
  return rows.length > 0;
}

// For GET page routes (dashboard, job/enquiry detail, etc). No session at
// all -> the demo has its own branded login, so send them there rather than
// 404ing (a genuine visitor with no invitation still can't get past that
// login without an account). Logged in but not granted -> 404, hiding
// existence like every other page_access-restricted page on this site.
function requireScottPageAccess(req, res, next) {
  if (!req.session.user) {
    const next_ = encodeURIComponent(req.originalUrl || '/scott');
    return res.redirect(`/scott/login?next=${next_}`);
  }
  hasScottAccess(req.session.user)
    .then((allowed) => {
      if (!allowed) return res.status(404).render('404', { pages: [], theme: require('../../db/themes').dark });
      next();
    })
    .catch(next);
}

// For POST/API routes. No session -> 401 json (nothing to redirect to on an
// API call). Logged in but not granted -> 404 json, same hide-existence
// reasoning as above.
function requireScottApiAccess(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  hasScottAccess(req.session.user)
    .then((allowed) => {
      if (!allowed) return res.status(404).json({ error: 'Not found' });
      next();
    })
    .catch(next);
}

module.exports = {
  SCOTT_PAGE_SLUG,
  getScottPageId,
  hasScottAccess,
  requireScottPageAccess,
  requireScottApiAccess
};
