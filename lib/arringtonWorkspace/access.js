const LIVE_PUBLIC_HOST = 'www.arringtonconsultancy.com';

function workspaceEnabled() {
  return process.env.ENABLE_ARRINGTON_AI_WORKSPACE === 'true';
}

function isPublicSite() {
  return (process.env.CANONICAL_HOST || LIVE_PUBLIC_HOST).trim().toLowerCase() === LIVE_PUBLIC_HOST;
}

function noindexHeader(req, res, next) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}

function hasWorkspaceAccess(user) {
  if (!workspaceEnabled()) return false;
  if (!user) return false;
  return user.username === 'tom' && ['admin', 'content'].includes(user.role);
}

function requireWorkspacePageAccess(req, res, next) {
  if (!workspaceEnabled()) {
    return res.status(404).render('404', { pages: [], theme: require('../../db/themes').dark });
  }
  if (!req.session.user) {
    const nextPath = encodeURIComponent(req.originalUrl || '/arrington-workspace');
    return res.redirect(`/login?next=${nextPath}`);
  }
  if (!hasWorkspaceAccess(req.session.user)) {
    return res.status(404).render('404', { pages: [], theme: require('../../db/themes').dark });
  }
  next();
}

function requireWorkspaceApiAccess(req, res, next) {
  if (!workspaceEnabled()) return res.status(404).json({ error: 'Not found' });
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!hasWorkspaceAccess(req.session.user)) return res.status(404).json({ error: 'Not found' });
  next();
}

module.exports = {
  hasWorkspaceAccess,
  isPublicSite,
  noindexHeader,
  requireWorkspacePageAccess,
  requireWorkspaceApiAccess,
  workspaceEnabled
};
