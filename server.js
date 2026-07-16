const crypto = require('crypto');
const express = require('express');
const path = require('path');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
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
        (req, res) => `'nonce-${res.locals.nonce}'`,
        'https://www.googletagmanager.com',
        'https://www.googleadservices.com'
      ],
      imgSrc: [
        "'self'",
        'data:',
        'https://www.googletagmanager.com',
        'https://www.google-analytics.com',
        'https://www.googleadservices.com',
        'https://googleads.g.doubleclick.net'
      ],
      connectSrc: [
        "'self'",
        'https://www.googletagmanager.com',
        'https://www.google-analytics.com',
        'https://www.googleadservices.com',
        'https://googleads.g.doubleclick.net'
      ],
      frameSrc: ["'self'", 'https://td.doubleclick.net'],
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

// Body parsing. Only the image upload route carries a large base64 payload, so
// it gets a 5mb limit; every other JSON endpoint gets a small default, which
// keeps the request surface tight. express.json won't double-parse, so the
// path-scoped parser wins for the image route and the global one covers the rest.
app.use('/api/content/image', express.json({ limit: '5mb' }));
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false }));

// Health check endpoint for Railway / uptime monitors. This queries the database
// on purpose: every page worth serving needs Postgres, so a check that skips it
// reports healthy while the site is unusable (it did exactly that for 7 hours on
// 15/07/2026). Returns 503 so a monitor can alert on status alone; the body keeps
// the `"ok":true` string for keyword-based checks.
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    console.error('Health check failed:', err.message);
    res.status(503).json({ ok: false, error: 'database unavailable' });
  }
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve images from database. Instance-scoped keys (e.g. `headshot__hero__2`)
// fall back to the base key (`headshot`) when the per-instance image has not
// yet been uploaded — that way a freshly-duplicated hero shows the default
// photo until Tom uploads a different one.
app.get('/img/:key', async (req, res, next) => {
  try {
    const requested = req.params.key;
    const candidates = [requested];
    const sep = requested.indexOf('__');
    if (sep > 0) candidates.push(requested.slice(0, sep));
    for (const key of candidates) {
      const { rows } = await db.query(
        'SELECT data, mime_type FROM images WHERE image_key = $1',
        [key]
      );
      if (rows.length > 0) {
        res.set('Content-Type', rows[0].mime_type);
        res.set('Cache-Control', 'no-cache');
        return res.send(rows[0].data);
      }
    }
    res.status(404).send('Image not found');
  } catch (err) {
    next(err);
  }
});

// robots.txt — allow crawling, point at the sitemap, keep the login page out
// of the index. Built from the request host so it works on every domain.
app.get('/robots.txt', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /login\n\nSitemap: ${base}/sitemap.xml\n`
  );
});

// sitemap.xml — lists only publicly indexable pages: not hidden, not noindex,
// and not restricted via page_access.
const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const base = `${req.protocol}://${req.get('host')}`;
    const { rows: restricted } = await db.query('SELECT DISTINCT page_id FROM page_access');
    const restrictedIds = new Set(restricted.map(r => r.page_id));
    const { rows } = await db.query(
      'SELECT id, slug, hidden, noindex, updated_at FROM pages ORDER BY sort_order, created_at'
    );
    const pubPages = rows.filter(p => !p.hidden && !p.noindex && !restrictedIds.has(p.id));
    const urls = pubPages.map(p => {
      const loc = p.slug === 'main' ? `${base}/` : `${base}/${p.slug}`;
      let lastmod = '';
      if (p.updated_at) {
        try { lastmod = `<lastmod>${new Date(p.updated_at).toISOString().slice(0, 10)}</lastmod>`; } catch (e) { /* skip */ }
      }
      return `  <url><loc>${escapeXml(loc)}</loc>${lastmod}</url>`;
    }).join('\n');
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
    );
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
const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => sessionSecret,
  // Use session ID when available (logged-in users), otherwise fall back to a
  // fixed value. The double-submit cookie itself provides request binding; the
  // session identifier adds an extra layer but must be stable across the
  // GET (form render) → POST (form submit) pair. With saveUninitialized:false,
  // anonymous visitors have no persisted session, so we use a constant.
  getSessionIdentifier: (req) => req.session?.user ? req.session.id : 'anonymous',
  cookieName: '_csrf',
  cookieOptions: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax'
  },
  getCsrfTokenFromRequest: (req) => {
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
  res.locals.csrfToken = generateCsrfToken(req, res);
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
  keyGenerator: (req) => req.session?.user?.id ? `u:${req.session.user.id}` : `ip:${ipKeyGenerator(req)}`,
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
const VALID_TEMPLATES = ['hero','credentials','biography','intervention','approach','insights','fourcards','casestudy','casestudy2','assessment','filter','proofstrip','contact'];
// Default auto-merge order — excludes 'contact' (now rendered globally in
// the footer), 'fourcards' and 'proofstrip' (picker-only). Users pick those
// explicitly.
const defaultOrder = ['hero','credentials','biography','intervention','approach','insights','casestudy','casestudy2','assessment','filter'];

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

    // Build section order from the page's stored order. An explicit empty
    // array means "this page has no sections" — render it empty rather than
    // falling through to the full default order.
    let sectionOrder = [];
    const stored = currentPage.section_order;
    if (Array.isArray(stored)) {
      const merged = stored.filter(s => {
        if (!isValid(s)) return false;
        const base = baseOf(s);
        if (s === base && deletedSections.includes(base)) return false;
        return true;
      });
      // Auto-merge only for the main page (new pages get explicit orders)
      if (pageSlug === 'main' && merged.length > 0) {
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
    } else {
      // No stored order at all (shouldn't happen — seed sets it). Fall back
      // to defaults only in that edge case.
      sectionOrder = defaultOrder.filter(s => !deletedSections.includes(s));
    }

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

    // Resolve SEO metadata. Per-page columns (on the pages row) override the
    // site-wide defaults held in the seo.* content keys; a blank per-page
    // field falls back to the default. Canonical/OG URL default to the
    // current request URL unless the page sets an explicit canonical.
    const siteName = (content['seo.site_name'] || 'Arrington Business Consultancy').trim();
    const defaultDesc = (content['seo.default_description'] || '').trim();
    const defaultOgImage = (content['seo.default_og_image'] || '').trim();
    const twitterHandle = (content['seo.twitter_handle'] || '').trim();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pagePath = currentPage.slug === 'main' ? '/' : `/${currentPage.slug}`;
    const computedTitle = currentPage.slug !== 'main'
      ? `${currentPage.title} | Arrington Consultancy`
      : 'Arrington Consultancy';

    const metaTitle = (currentPage.meta_title || '').trim() || computedTitle;
    const metaDescription = (currentPage.meta_description || '').trim() || defaultDesc;
    const canonical = (currentPage.canonical_url || '').trim() || `${baseUrl}${pagePath}`;
    const ogImage = (currentPage.og_image || '').trim() || defaultOgImage;
    const seo = {
      title: metaTitle,
      description: metaDescription,
      keywords: (currentPage.meta_keywords || '').trim(),
      canonical,
      ogTitle: (currentPage.og_title || '').trim() || metaTitle,
      ogDescription: (currentPage.og_description || '').trim() || metaDescription,
      ogImage,
      ogUrl: canonical,
      siteName,
      twitterHandle,
      noindex: currentPage.noindex === true
    };

    res.render('index', {
      content, theme, activeTheme, themes,
      sectionOrder: renderOrder, hiddenSections, instanceTemplates,
      currentPage, allPages, seo,
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
