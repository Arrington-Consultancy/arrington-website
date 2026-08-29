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

// Temporary demo-only login bypass. Added 29/08/2026 because the staging
// deploy this demo runs on got stuck mid-way through a password reset
// (Railway's build queue stalled, not this codebase), and the link is not
// on the public site — nothing indexes it, nothing links to it, nobody can
// find it who isn't handed the URL directly — so Tom asked to drop the
// login requirement "for a moment" rather than wait on the deploy queue.
//
// Mirrors server.js's IS_PUBLIC_SITE derivation rather than importing it,
// to avoid a circular require (server.js -> routes/scott.js -> this file).
// Same convention already used elsewhere in this codebase (VALID_TEMPLATES
// etc.) — small, commented duplication instead of new plumbing. Keep this
// in sync with server.js if the live domain or the env var name ever
// changes.
//
// Deliberately does NOT invent a fake session user: req.session.user.id is
// a real foreign key (scott_conversations, scott_writebacks, audit_log all
// reference it), and a synthetic id would repeat tonight's exact mistake —
// a write that looks fine until something downstream references it. This
// logs in as the actual 'tom' account instead, so every write, activity
// line and approval decision is attributed to a real user exactly as if
// they had typed the password.
//
// SCOTT_DEMO_SKIP_LOGIN=true is required, and is additionally refused
// outright when this deploy IS the public site (CANONICAL_HOST unset or
// equal to the live domain) — so setting this by accident on production,
// or copying staging's variables into production, cannot switch it on
// there. There is no code path that checks this flag without also
// checking IS_PUBLIC_SITE.
//
// To turn this back off: remove SCOTT_DEMO_SKIP_LOGIN from the service's
// Railway variables (or set it to anything other than 'true') and redeploy.
// The normal login page keeps working throughout, this only changes what
// happens when there is no session yet.
const LIVE_PUBLIC_HOST = 'www.arringtonconsultancy.com';
const IS_PUBLIC_SITE = (process.env.CANONICAL_HOST || LIVE_PUBLIC_HOST).trim().toLowerCase() === LIVE_PUBLIC_HOST;
const SKIP_LOGIN_ENV = 'SCOTT_DEMO_SKIP_LOGIN';
const skipLoginRequested = process.env[SKIP_LOGIN_ENV] === 'true';
const skipLoginActive = skipLoginRequested && !IS_PUBLIC_SITE;

if (skipLoginRequested && IS_PUBLIC_SITE) {
  console.warn(`${SKIP_LOGIN_ENV}=true was set but this deploy IS the public site — refusing to bypass the Scott demo login. This flag only ever works on a non-public deploy.`);
} else if (skipLoginActive) {
  console.warn(`${SKIP_LOGIN_ENV}=true: the Scott demo login is bypassed on this deploy, auto-signing in as 'tom'. TEMPORARY — remove this variable and redeploy once the real login works again.`);
}

let cachedDemoUser = null;

async function getAutoLoginUser() {
  if (cachedDemoUser) return cachedDemoUser;
  const { rows } = await db.query(`SELECT id, username, role FROM users WHERE username = 'tom' LIMIT 1`);
  cachedDemoUser = rows.length ? rows[0] : null;
  return cachedDemoUser;
}

// Populates req.session.user from a real account when the bypass is active
// and no one is signed in yet. Returns true if it did. A no-op the moment
// SCOTT_DEMO_SKIP_LOGIN is unset — every other code path is unaffected.
async function maybeAutoLoginForDemo(req) {
  if (req.session.user || !skipLoginActive) return false;
  const user = await getAutoLoginUser();
  if (!user) return false;
  req.session.user = { id: user.id, username: user.username, role: user.role };
  return true;
}

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
  if (!pageId) return false; // synthetic page not seeded yet, so fail closed
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
  maybeAutoLoginForDemo(req)
    .then(() => {
      if (!req.session.user) {
        const next_ = encodeURIComponent(req.originalUrl || '/scott');
        return res.redirect(`/scott/login?next=${next_}`);
      }
      return hasScottAccess(req.session.user).then((allowed) => {
        if (!allowed) return res.status(404).render('404', { pages: [], theme: require('../../db/themes').dark });
        next();
      });
    })
    .catch(next);
}

// For POST/API routes. No session -> 401 json (nothing to redirect to on an
// API call). Logged in but not granted -> 404 json, same hide-existence
// reasoning as above.
function requireScottApiAccess(req, res, next) {
  maybeAutoLoginForDemo(req)
    .then(() => {
      if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      return hasScottAccess(req.session.user).then((allowed) => {
        if (!allowed) return res.status(404).json({ error: 'Not found' });
        next();
      });
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
