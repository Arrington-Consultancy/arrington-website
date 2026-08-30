// Arrington AI Workspace: route access.
//
// The workspace reuses the site's ONE auth system (express-session +
// bcrypt + Postgres): there is no separate workspace login, no token
// scheme, no second credential store. What it adds is the clearance
// check from lib/workspace/clearance.js on top of authentication:
// a logged-in user whose username is not in HUMAN_CLEARANCE gets a 404,
// not a 403, because the workspace's existence is itself operating
// information. Real access is Tom only; the synthetic ws_restricted
// clearance has no login and can never be reached from a request.

const { clearanceForUser } = require('./clearance');

function workspaceClearance(req) {
  if (!req.session || !req.session.user) return null;
  return clearanceForUser(req.session.user);
}

function requireWorkspacePageAccess(req, res, next) {
  if (!req.session || !req.session.user) {
    const next_ = encodeURIComponent(req.originalUrl || '/workspace');
    return res.redirect(`/login?next=${next_}`);
  }
  const clearance = workspaceClearance(req);
  if (!clearance) {
    return res.status(404).render('404', { pages: [], theme: require('../../db/themes').dark });
  }
  req.workspaceClearance = clearance;
  return next();
}

function requireWorkspaceApiAccess(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  const clearance = workspaceClearance(req);
  if (!clearance) {
    return res.status(404).json({ error: 'Not found' });
  }
  req.workspaceClearance = clearance;
  return next();
}

module.exports = { workspaceClearance, requireWorkspacePageAccess, requireWorkspaceApiAccess };
