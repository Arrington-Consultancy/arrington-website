// Arrington AI Workspace: route access.
//
// The workspace reuses the site's ONE auth system (express-session +
// bcrypt + Postgres): there is no separate workspace login, no token
// scheme, no second credential store. What it adds is two gates on top
// of authentication, both of which fail CLOSED:
//
//   1. ENABLE_ARRINGTON_AI_WORKSPACE must be exactly 'true'. Unset, the
//      whole area 404s for everyone including Tom. That is what lets the
//      code sit on main without existing on the public site: merging is
//      then inert, and turning it on is a deliberate, separate act.
//   2. The authenticated username must hold a workspace clearance
//      (lib/workspace/clearance.js) AND a real CMS role. Real access is
//      Tom only; the synthetic ws_restricted clearance has no login and
//      can never be reached from a request.
//
// A logged-in user without clearance gets 404, not 403, because the
// workspace's existence is itself operating information.
//
// The enable-flag gate and the belt-and-braces noindex header were
// adopted from the parallel Codex handoff branch
// (codex/arrington-ai-workspace-v0-1-handoff, commit a6617cb), which
// reached the same conclusion about failing closed independently.

const { clearanceForUser } = require('./clearance');

const WORKSPACE_ROLES = ['admin', 'content'];

function workspaceEnabled() {
  return process.env.ENABLE_ARRINGTON_AI_WORKSPACE === 'true';
}

function workspaceClearance(req) {
  if (!workspaceEnabled()) return null;
  if (!req.session || !req.session.user) return null;
  const user = req.session.user;
  // Both legs required: the clearance map decides WHO, the role check
  // means a downgraded or client-level account cannot carry a stale
  // clearance entry into the workspace.
  if (!WORKSPACE_ROLES.includes(user.role)) return null;
  return clearanceForUser(user);
}

// Governance finding F8 (30/08/2026): rendering the 404 with an empty
// nav and a hardcoded theme made a workspace path measurably different
// from a genuinely missing one (4,244 bytes against 4,282), so any
// logged-in user could tell them apart. It now defers to the site's own
// 404 renderer, so the two are the same response.
function notFoundPage(req, res) {
  return require('../render404').render404(req, res);
}

// Belt and braces alongside the noindex meta tag in every workspace
// view: a header cannot be missed by a crawler that never parses the
// page, and it also covers the JSON API responses.
function workspaceNoindex(req, res, next) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}

// An anonymous request is refused exactly like an unauthorised one: a
// 404, not a redirect to login.
//
// Governance finding F2 (30/08/2026): redirecting an anonymous visitor
// to /login?next=/workspace/contacts told a scanner that the area
// exists and let it enumerate the page names from the response code
// alone, while /workspace/nonsense 404'd. That contradicted this file's
// own claim that the area's existence is protected information. The
// login convenience was worth almost nothing to a single user who can
// navigate to /login himself, and it was the whole of the disclosure.
function requireWorkspacePageAccess(req, res, next) {
  if (!workspaceEnabled()) return notFoundPage(req, res);
  const clearance = workspaceClearance(req);
  if (!clearance) return notFoundPage(req, res);
  req.workspaceClearance = clearance;
  return next();
}

// Same reasoning for the APIs. A 401 "Not signed in" confirmed each
// endpoint existed, where a route that does not exist returns the site's
// own 404. Both now answer identically, and through the same renderer:
// hand-writing a JSON 404 here would still be distinguishable, because
// the site's handler decides HTML or JSON from the Accept header and a
// browser POST asks for HTML.
function requireWorkspaceApiAccess(req, res, next) {
  if (!workspaceEnabled()) return notFoundPage(req, res);
  const clearance = workspaceClearance(req);
  if (!clearance) return notFoundPage(req, res);
  req.workspaceClearance = clearance;
  return next();
}

// Pure form of the same decision, for tests and for any caller that has
// a user object rather than a request.
function hasWorkspaceAccess(user) {
  if (!workspaceEnabled()) return false;
  if (!user || !WORKSPACE_ROLES.includes(user.role)) return false;
  return !!clearanceForUser(user);
}

module.exports = {
  workspaceEnabled,
  workspaceClearance,
  hasWorkspaceAccess,
  workspaceNoindex,
  requireWorkspacePageAccess,
  requireWorkspaceApiAccess
};
