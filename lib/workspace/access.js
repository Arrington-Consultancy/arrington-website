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
//      (lib/workspace/clearance.js) AND a real CMS role, AND the
//      deployment's own WORKSPACE_OWNER_USERNAME / WORKSPACE_OWNER_USER_ID
//      must name that exact account. Real access is Tom only; the
//      synthetic ws_restricted clearance has no login and can never be
//      reached from a request.
//   3. The session must have been unlocked with WORKSPACE_ACCESS_PASSPHRASE
//      (lib/workspace/unlock.js). Governance finding F1, Tom's decision
//      of 31/08/2026: gates 1 and 2 cannot tell the owner apart from an
//      admin who has reset the owner's password, because after that
//      reset the attacker holds the right username and the right user
//      id. This gate can, because the passphrase lives in Railway and
//      CMS admin does not reach it.
//
// A logged-in user without clearance gets 404, not 403, because the
// workspace's existence is itself operating information.
//
// The enable-flag gate and the belt-and-braces noindex header were
// adopted from the parallel Codex handoff branch
// (codex/arrington-ai-workspace-v0-1-handoff, commit a6617cb), which
// reached the same conclusion about failing closed independently.

const { clearanceForUser } = require('./clearance');
const unlock = require('./unlock');

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
//
// Governance finding G1 (31/08/2026), HIGH, and it was finding F2 all
// over again in a place nobody looked. This used to be a middleware
// registered BEFORE the access guard on every route, so it stamped the
// header on the DENIAL as well as on a served page. A path that does
// not exist gets no such header, so an anonymous scanner could still
// tell a real workspace route from a missing one and enumerate the
// whole page list, without a session and WITHOUT THE ENABLE FLAG SET.
// That last part falsified this file's own claim that merging is
// inert: on merge, the public site would have started announcing the
// area's existence.
//
// It is now a plain function called only on the success path, after the
// access decision has been made. It is deliberately NOT exported as a
// middleware any more, so it cannot be reintroduced ahead of a guard by
// someone copying an existing route registration.
function setNoindex(res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
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
  // A cleared but locked session is sent to the unlock screen rather
  // than 404'd. That is a deliberate, narrow exception to the
  // hide-existence rule, and the reasoning is worth stating because it
  // looks like a reversal of finding F2. F2 was about ANONYMOUS and
  // uncleared callers, who learn something real from a 302. Anyone who
  // reaches this line has already satisfied the username and user-id
  // binding, so they are either Tom or someone who has taken Tom's CMS
  // account; the latter is a GitHub org member who can read this file
  // anyway, so hiding the area from them buys nothing while costing Tom
  // a confusing 404 on his own bookmark. What matters against that
  // attacker is that they cannot get past the passphrase, and they
  // cannot.
  if (!unlock.isUnlocked(req)) {
    if (req.path === '/workspace/unlock') { setNoindex(res); return next(); }
    setNoindex(res);
    return res.redirect('/workspace/unlock');
  }
  setNoindex(res);
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
  // The APIs get no unlock screen and no hint of one: a locked session
  // is refused exactly like an uncleared one. There is nothing for a
  // script to do with the difference, and the erasure endpoint is behind
  // this line.
  if (!unlock.isUnlocked(req)) return notFoundPage(req, res);
  setNoindex(res);
  return next();
}

// Pure form of the same decision, for tests and for any caller that has
// a user object rather than a request.
// Pure form of the IDENTITY decision, for tests and for any caller that
// has a user object rather than a request. It deliberately does NOT
// include the unlock leg, because an unlock is a fact about a session
// and this function has no session. A caller wanting the whole answer
// must use the middleware.
function hasWorkspaceAccess(user) {
  if (!workspaceEnabled()) return false;
  if (!user || !WORKSPACE_ROLES.includes(user.role)) return false;
  return !!clearanceForUser(user);
}

// Every workspace path, for every method Express would answer on its
// own.
//
// Governance finding Q1 (31/08/2026), HIGH. Express replies to OPTIONS
// from its own route table BEFORE any route middleware runs, so every
// real /api/workspace/* endpoint answered 200 with an Allow header while
// a fabricated sibling answered 404 - to an ANONYMOUS request, on a
// server with no workspace variables set at all. That is a complete map
// of the area's shape and endpoint list, and it falsified this file's
// own claim that merging the workspace is inert: routes/workspace.js is
// not on main, so merging would have added the oracle to the live site.
//
// It survived nine reviews and a 9/9 green adversarial suite because
// every probe anyone wrote sent GET or POST. The guard below is
// deliberately about the METHOD rather than about OPTIONS specifically:
// anything Express might answer without consulting a route is refused
// the same way a missing page is.
const WORKSPACE_PATH = /^\/(workspace|api\/workspace)(\/|$)/;
const METHODS_THE_APP_ACTUALLY_SERVES = new Set(['GET', 'HEAD', 'POST']);

function refuseUnroutedMethods(req, res, next) {
  if (!WORKSPACE_PATH.test(req.path)) return next();
  if (METHODS_THE_APP_ACTUALLY_SERVES.has(req.method)) return next();
  // Same renderer as every other denial, so the response is byte for
  // byte what a genuinely missing path returns.
  return notFoundPage(req, res);
}

module.exports = {
  refuseUnroutedMethods,
  workspaceEnabled,
  workspaceClearance,
  hasWorkspaceAccess,
  setNoindex,
  requireWorkspacePageAccess,
  requireWorkspaceApiAccess,
  unlock
};
