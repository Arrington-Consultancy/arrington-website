const crypto = require('crypto');
const express = require('express');
const path = require('path');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { doubleCsrf } = require('csrf-csrf');
const db = require('./db/pool');
const themes = require('./db/themes');
const { loadPermissions, hasCapability, getCapabilitiesForRole } = require('./middleware/permissions');
const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';

// Fail fast if SESSION_SECRET is missing in production — we never want to
// fall back to a hardcoded dev secret on the real domain.
if (isProd && !process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET must be set in production.');
  process.exit(1);
}
const sessionSecret = process.env.SESSION_SECRET || 'dev-only-secret-change-me';

// Trust Railway's proxy (required for rate limiting, secure cookies, and
// x-forwarded-proto detection behind the reverse proxy).
app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// HTTPS enforcement in production (belt and braces — Railway already terminates
// TLS, but this guarantees any plain HTTP request is redirected).
app.use((req, res, next) => {
  if (isProd && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.header('host')}${req.url}`);
  }
  next();
});

// Request logging
app.use(morgan(isProd ? 'combined' : 'dev', {
  skip: (req) => req.url.startsWith('/img/')
}));

// Per-request CSP nonce for inline <style> / <script> blocks in the
// rendered views. A fresh nonce per request means an attacker cannot
// inject a <script> that the browser will execute.
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Security headers — strict CSP for the app, HSTS on in prod.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.nonce}'`,
        'https://fonts.googleapis.com'
      ],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.nonce}'`
      ],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"]
    }
  },
  hsts: isProd ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false
}));

// Cookie parsing (required by csrf-csrf)
app.use(cookieParser());

// Body parsing (5mb limit for image uploads)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

// Health check endpoint for Railway / uptime monitors
app.get('/health', (req, res) => res.json({ ok: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve images from database (with fallback to disk for first deploy)
app.get('/img/:key', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT data, mime_type FROM images WHERE image_key = $1',
      [req.params.key]
    );
    if (rows.length > 0) {
      res.set('Content-Type', rows[0].mime_type);
      res.set('Cache-Control', 'no-cache');
      return res.send(rows[0].data);
    }
    res.status(404).send('Image not found');
  } catch (err) {
    next(err);
  }
});

// Sessions
app.use(session({
  store: new PgSession({
    pool: db.pool,
    tableName: 'session',
    createTableIfMissing: false
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax'
  }
}));

// CSRF protection
const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => sessionSecret,
  cookieName: '_csrf',
  cookieOptions: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax'
  },
  getTokenFromRequest: (req) => {
    return req.headers['x-csrf-token'] || req.body._csrf;
  }
});

// Apply CSRF to all non-GET routes
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return next();
  }
  doubleCsrfProtection(req, res, next);
});

// Make CSRF token available to all views
app.use((req, res, next) => {
  res.locals.csrfToken = generateToken(req, res);
  res.locals.user = req.session.user || null;
  next();
});

// Per-session (or per-IP, when logged out) rate limiter for authenticated
// content/admin endpoints. Prevents a compromised session or chatty client
// from hammering the DB, filling images, or DoS'ing image processing.
const authedWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.session?.user?.id ? `u:${req.session.user.id}` : `ip:${req.ip}`,
  message: { error: 'Too many requests. Slow down.' }
});

// Routes
app.use(authRoutes);
app.use('/api/content', authedWriteLimiter, contentRoutes);
app.use('/api/admin', authedWriteLimiter, adminRoutes);

// Serve v1.html as static with a relaxed CSP (legacy static page has
// inline <style>/<script> blocks that predate the nonce setup).
app.get('/v1.html', (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; object-src 'none'; base-uri 'self'"
  );
  res.sendFile(path.join(__dirname, 'v1.html'));
});

// Valid section templates (shared with routes/content.js)
const VALID_TEMPLATES = ['hero','credentials','biography','intervention','approach','insights','casestudy','casestudy2','assessment','filter','contact'];
const defaultOrder = VALID_TEMPLATES.slice();

const baseOf = (id) => {
  const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
  return m && VALID_TEMPLATES.includes(m[1]) ? m[1] : null;
};
const isValid = (id) => baseOf(id) !== null;

// Shared page renderer — serves both GET / and GET /:slug
async function renderPage(req, res, next, pageSlug) {
  try {
    // Load the requested page
    const { rows: pageRows } = await db.query(
      'SELECT * FROM pages WHERE slug = $1', [pageSlug]
    );
    if (pageRows.length === 0) {
      return res.status(404).send('Not found');
    }
    const currentPage = pageRows[0];

    // Work out which pages are restricted (have any page_access entries)
    const { rows: allAccessRows } = await db.query('SELECT DISTINCT page_id FROM page_access');
    const restrictedPageIds = new Set(allAccessRows.map(r => r.page_id));
    const isRestricted = restrictedPageIds.has(currentPage.id);

    // Restricted or hidden pages: 404 for public visitors
    if ((currentPage.hidden || isRestricted) && !res.locals.user) {
      return res.status(404).send('Not found');
    }
    // Clients only see restricted/hidden pages they have explicit access to
    if ((currentPage.hidden || isRestricted) && res.locals.user?.role === 'client') {
      const { rows: access } = await db.query(
        'SELECT 1 FROM page_access WHERE page_id = $1 AND user_id = $2',
        [currentPage.id, res.locals.user.id]
      );
      if (access.length === 0) {
        return res.status(404).send('Not found');
      }
    }

    // Load all pages for the page menu
    const { rows: allPagesRows } = await db.query(
      'SELECT id, slug, title, hidden, sort_order FROM pages ORDER BY sort_order, created_at'
    );

    // Filter pages by role: admin/content see all, client sees unrestricted + granted, public sees unrestricted non-hidden
    let allPages;
    if (!res.locals.user) {
      allPages = allPagesRows.filter(p => !p.hidden && !restrictedPageIds.has(p.id));
    } else if (res.locals.user.role === 'client') {
      const { rows: accessRows } = await db.query(
        'SELECT page_id FROM page_access WHERE user_id = $1',
        [res.locals.user.id]
      );
      const accessibleIds = new Set(accessRows.map(r => r.page_id));
      allPages = allPagesRows.filter(p =>
        accessibleIds.has(p.id) || (!p.hidden && !restrictedPageIds.has(p.id))
      );
    } else {
      allPages = allPagesRows;
    }

    // Load content
    const { rows } = await db.query('SELECT section_key, content FROM content');
    const content = {};
    rows.forEach(r => { content[r.section_key] = r.content; });
    const activeTheme = content['site.theme'] || 'dark';
    const theme = themes[activeTheme] || themes.dark;

    // Read section state from the page row (not from site.* content keys)
    let deletedSections = [];
    try {
      const parsed = currentPage.deleted_sections || [];
      if (Array.isArray(parsed)) deletedSections = parsed.filter(s => VALID_TEMPLATES.includes(s));
    } catch (e) { /* ignore */ }
    let hiddenSections = [];
    try {
      const parsed = currentPage.hidden_sections || [];
      if (Array.isArray(parsed)) hiddenSections = parsed.filter(isValid);
    } catch (e) { /* ignore */ }

    // Build section order from the page's stored order
    let sectionOrder = defaultOrder.filter(s => !deletedSections.includes(s));
    try {
      const stored = currentPage.section_order || [];
      if (Array.isArray(stored) && stored.length > 0) {
        const merged = stored.filter(s => {
          if (!isValid(s)) return false;
          const base = baseOf(s);
          if (s === base && deletedSections.includes(base)) return false;
          return true;
        });
        // Auto-merge only for the main page (new pages get explicit orders)
        if (pageSlug === 'main') {
          const presentTemplates = new Set(merged.map(baseOf));
          const missing = defaultOrder.filter(t => !presentTemplates.has(t) && !deletedSections.includes(t));
          for (const t of missing) {
            const idx = defaultOrder.indexOf(t);
            let insertAt = merged.length;
            for (let i = idx - 1; i >= 0; i--) {
              const prev = defaultOrder[i];
              const prevPos = merged.indexOf(prev);
              if (prevPos !== -1) { insertAt = prevPos + 1; break; }
            }
            merged.splice(insertAt, 0, t);
          }
        }
        sectionOrder = merged;
      }
    } catch (e) { /* use default */ }

    const instanceTemplates = {};
    for (const iid of sectionOrder) instanceTemplates[iid] = baseOf(iid);

    // Clients with no editing capabilities see the same as public
    const userRole = res.locals.user?.role;
    const canEdit = res.locals.user ? hasCapability(userRole, 'edit_content') : false;
    const capabilities = res.locals.user ? getCapabilitiesForRole(userRole) : {};
    const showAdminPanel = res.locals.user && Object.values(capabilities).some(v => v);

    const renderOrder = (res.locals.user && canEdit)
      ? sectionOrder
      : sectionOrder.filter(s => !hiddenSections.includes(s));

    // Check if current page has a contact section (for nav CTA visibility)
    const hasContact = renderOrder.some(s => baseOf(s) === 'contact');

    res.render('index', {
      content, theme, activeTheme, themes,
      sectionOrder: renderOrder, hiddenSections, instanceTemplates,
      currentPage, allPages, hasContact,
      canEdit, capabilities, showAdminPanel
    });
  } catch (err) {
    next(err);
  }
}

// Main page
app.get('/', (req, res, next) => renderPage(req, res, next, 'main'));

// Additional pages — placed after all fixed routes, before 404 handler
app.get('/:slug', (req, res, next) => {
  const slug = req.params.slug;
  // Don't catch routes that belong to other handlers
  if (/\.\w+$/.test(slug)) return next(); // file extensions (v1.html etc.)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return next(); // only lowercase-hyphenated slugs
  renderPage(req, res, next, slug);
});

// 404 handler — must come after all routes
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).send('Not found');
  }
  res.status(404).json({ error: 'Not found' });
});

// Central error handler — must be the last middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  const body = { error: isProd ? 'Internal server error' : err.message };
  if (req.accepts('json') && !req.accepts('html')) {
    return res.status(status).json(body);
  }
  res.status(status).send(body.error);
});

// Process-level safety nets
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

loadPermissions().then(() => {
  app.listen(PORT, () => {
    console.log(`[${isProd ? 'PROD' : 'DEV'}] Arrington CMS running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to load permissions:', err);
  // Start anyway — hasCapability falls back to hardcoded defaults
  app.listen(PORT, () => {
    console.log(`[${isProd ? 'PROD' : 'DEV'}] Arrington CMS running on port ${PORT} (permissions fallback)`);
  });
});
