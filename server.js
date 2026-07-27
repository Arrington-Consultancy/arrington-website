const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
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
const { getGoogleReviews } = require('./lib/googleReviews');
const { loadPermissions, hasCapability, getCapabilitiesForRole } = require('./middleware/permissions');
const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const adminRoutes = require('./routes/admin');
const leadRoutes = require('./routes/leads');
const marketReadyTest = require('./routes/marketReadyTest');

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

// Canonical host + HTTPS enforcement in production, combined into a single
// 301 so a plain-HTTP request to the bare apex domain redirects straight to
// https://www...<path> in one hop rather than two separate redirects. Only
// the bare apex is rewritten to www — any other host (e.g. Railway's own
// default domain) is left alone, it just gets the HTTPS check.
const CANONICAL_HOST = 'www.arringtonconsultancy.com';
const APEX_HOST = 'arringtonconsultancy.com';
app.use((req, res, next) => {
  if (!isProd) return next();
  const host = (req.header('host') || '').toLowerCase();
  const targetHost = host === APEX_HOST ? CANONICAL_HOST : host;
  const isHttps = req.header('x-forwarded-proto') === 'https';
  if (targetHost !== host || !isHttps) {
    return res.redirect(301, `https://${targetHost}${req.url}`);
  }
  next();
});

// Request logging
app.use(morgan(isProd ? 'combined' : 'dev', {
  skip: (req) => req.url.startsWith('/img/')
}));

// Gzip compression for text responses (HTML, CSS, JS, JSON, SVG). Images
// served from /img/:key are already binary (JPEG/WebP), so compression
// provides no benefit there and the middleware skips them automatically.
app.use(compression());

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
        'https://googleads.g.doubleclick.net',
        'https://lh3.googleusercontent.com'
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

// Static files. These only change on redeploy, so a 1-day browser cache is
// safe; ETag (on by default) still forces revalidation before serving
// anything actually stale past that window.
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d'
}));

// Serve images from database. Instance-scoped keys (e.g. `headshot__hero__2`)
// fall back to the base key (`headshot`) when the per-instance image has not
// yet been uploaded — that way a freshly-duplicated hero shows the default
// photo until Tom uploads a different one. A `.webp` suffix looks up the
// `<key>__webp` row instead (same fallback rule applied to the webp variant),
// so <picture><source> requests resolve without ever 404ing — a failed
// <source> fetch has no defined fallback in the picture-element spec, so the
// webp row must always exist wherever a <picture> element references one.
app.get('/img/:key', async (req, res, next) => {
  try {
    let requested = req.params.key;
    let wantsWebp = false;
    if (requested.endsWith('.webp')) {
      wantsWebp = true;
      requested = requested.slice(0, -5);
    }
    const toLookupKey = (k) => wantsWebp ? `${k}__webp` : k;
    const candidates = [toLookupKey(requested)];
    const sep = requested.indexOf('__');
    if (sep > 0) candidates.push(toLookupKey(requested.slice(0, sep)));
    for (const key of candidates) {
      const { rows } = await db.query(
        'SELECT data, mime_type FROM images WHERE image_key = $1',
        [key]
      );
      if (rows.length > 0) {
        res.set('Content-Type', rows[0].mime_type);
        // Images rarely change and are content-addressed by key, but an
        // admin can re-upload one under the same key - a moderate max-age
        // with the automatic ETag Express sends keeps repeat visits fast
        // without risking long-lived staleness after a real replacement.
        res.set('Cache-Control', 'public, max-age=86400, must-revalidate');
        return res.send(rows[0].data);
      }
    }
    res.status(404).send('Image not found');
  } catch (err) {
    next(err);
  }
});

// Owner Dependency Quiz — standalone interactive tool, not a CMS page.
// Client-side quiz/results with an optional server round-trip only for the
// voluntary "email me my result" capture (POST /api/quiz/email-results in
// routes/leads.js) — the result itself never requires one. Registered ahead
// of the global CSRF-token-setting middleware further down, so the token
// needed by that form has to be generated here rather than relied on from
// res.locals.
//
// "Owner Dependency Quiz" is the governed public name (Brand Operating
// System + Current Operating Position master governance rules) — the old
// /owner-dependency-review URL previously used "Review" throughout before
// that rule was checked, and now 301-redirects here permanently.
// Score bands mirrored from the client-side quiz logic (views/owner-dependency-quiz.ejs)
// so a shared link's score can be turned into the same band label server-side,
// without trusting a client-supplied band string.
const QUIZ_BANDS = [
  { max: 3, label: 'Low dependency' },
  { max: 7, label: 'Emerging dependency' },
  { max: 11, label: 'Significant dependency' },
  { max: 16, label: 'High dependency' }
];

app.get('/owner-dependency-quiz', async (req, res, next) => {
  try {
    const { rows: themeRows } = await db.query(
      "SELECT content FROM content WHERE section_key = 'site.theme'"
    );
    const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
    const theme = themes[activeTheme] || themes.dark;

    // A shared result link (?score=N) gets a personalised share preview —
    // title/description showing that score and band — so a LinkedIn/Facebook
    // share actually carries the result through instead of always showing the
    // same generic card. Anything outside 0-16 is treated as no score.
    const scoreParam = parseInt(req.query.score, 10);
    let shareResult = null;
    if (Number.isInteger(scoreParam) && scoreParam >= 0 && scoreParam <= 16) {
      const band = QUIZ_BANDS.find(b => scoreParam <= b.max) || QUIZ_BANDS[QUIZ_BANDS.length - 1];
      shareResult = { score: scoreParam, bandLabel: band.label };
    }

    res.render('owner-dependency-quiz', {
      theme,
      ga4Id: process.env.GA4_MEASUREMENT_ID || '',
      csrfToken: generateCsrfToken(req, res),
      shareResult,
      requestUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`
    });
  } catch (err) {
    next(err);
  }
});

app.get('/owner-dependency-review', (req, res) => {
  res.redirect(301, '/owner-dependency-quiz');
});

// Owner Check — library/hub page for short self-assessment tools (currently
// Owner Dependency Quiz, with a second check to follow). Not a CMS page:
// a standalone template like the quiz itself, so it needs no content rows.
app.get('/owner-check', async (req, res, next) => {
  try {
    const { rows: themeRows } = await db.query(
      "SELECT content FROM content WHERE section_key = 'site.theme'"
    );
    const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
    const theme = themes[activeTheme] || themes.dark;

    res.render('owner-check', {
      theme,
      ga4Id: process.env.GA4_MEASUREMENT_ID || ''
    });
  } catch (err) {
    next(err);
  }
});

// robots.txt — allow crawling, point at the sitemap, keep the login page out
// of the index. Built from the request host so it works on every domain.
app.get('/robots.txt', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(
    // /market-ready-test is unpublished — see routes/marketReadyTest.js —
    // disallowed here as belt-and-braces on top of the page's own
    // noindex/nofollow meta tag, until Tom approves launch.
    `User-agent: *\nAllow: /\nDisallow: /login\nDisallow: /market-ready-test\n\nSitemap: ${base}/sitemap.xml\n`
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
      'SELECT id, slug, hidden, noindex, section_order FROM pages ORDER BY sort_order, created_at'
    );
    const pubPages = rows.filter(p => !p.hidden && !p.noindex && !restrictedIds.has(p.id));
    const urlEntries = await Promise.all(pubPages.map(async (p) => {
      const loc = p.slug === 'main' ? `${base}/` : `${base}/${p.slug}`;
      let lastmod = '';
      // pages.updated_at also gets bumped by structural admin actions (section
      // reorder, hide/show, nav sort) that aren't real content edits, so it
      // can't be trusted as a "genuine change" signal. content.updated_at only
      // changes when a section's actual text is edited, so the latest one
      // across this page's own sections is the accurate lastmod value.
      const order = Array.isArray(p.section_order) ? p.section_order : [];
      if (order.length > 0) {
        const { rows: contentRows } = await db.query(
          'SELECT MAX(updated_at) AS max_updated FROM content WHERE section_key LIKE ANY($1)',
          [order.map(iid => `${iid}.%`)]
        );
        const maxUpdated = contentRows[0] && contentRows[0].max_updated;
        if (maxUpdated) {
          try { lastmod = `<lastmod>${new Date(maxUpdated).toISOString().slice(0, 10)}</lastmod>`; } catch (e) { /* skip */ }
        }
      }
      return `  <url><loc>${escapeXml(loc)}</loc>${lastmod}</url>`;
    }));
    // Owner Dependency Quiz isn't a row in `pages` (it's a standalone
    // interactive tool, not CMS content), so it needs its own explicit entry.
    urlEntries.push(`  <url><loc>${escapeXml(`${base}/owner-dependency-quiz`)}</loc></url>`);
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join('\n')}\n</urlset>\n`
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
// Public lead capture (contact/booking form + gated PDF downloads) — no
// session required, so it carries its own rate limiters (see routes/leads.js).
app.use(leadRoutes);

// Market Ready Test — unpublished, standalone tool (see routes/marketReadyTest.js
// for the full brief). Page routes registered directly (same pattern as the
// Owner Dependency Quiz above) so the submit form's CSRF token is generated
// here rather than relying on the global res.locals middleware; the POST
// endpoint carries its own dedicated rate limiter.
marketReadyTest.mountPageRoute(app, generateCsrfToken);
app.use(marketReadyTest.router);

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
const VALID_TEMPLATES = ['hero','credentials','biography','intervention','approach','insights','fourcards','documents','casestudy','casestudy2','assessment','filter','proofstrip','contact','googlereviews'];
// Default auto-merge order — excludes 'contact' (now rendered globally in
// the footer), 'fourcards', 'documents' and 'proofstrip' (picker-only). Users
// pick those explicitly.
const defaultOrder = ['hero','credentials','biography','intervention','approach','insights','casestudy','casestudy2','assessment','filter'];

const baseOf = (id) => {
  const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
  return m && VALID_TEMPLATES.includes(m[1]) ? m[1] : null;
};
const isValid = (id) => baseOf(id) !== null;

// Shared page renderer — serves both GET / and GET /:slug
// Shared branded 404 renderer — used both by the catch-all route at the
// bottom of the file and by renderPage()'s own not-found/restricted-access
// branches, so every kind of missing page gets the same on-brand result
// instead of the bare "Not found" text a naive early-return would send.
async function render404(req, res) {
  if (!req.accepts('html')) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const { rows: allAccessRows } = await db.query('SELECT DISTINCT page_id FROM page_access');
    const restrictedPageIds = new Set(allAccessRows.map(r => r.page_id));
    const { rows: pageRows } = await db.query(
      'SELECT id, slug, title, nav_label, hidden, show_in_nav FROM pages ORDER BY sort_order, created_at'
    );
    const pages = pageRows.filter(p => !p.hidden && !restrictedPageIds.has(p.id) && p.show_in_nav);
    const { rows: themeRows } = await db.query(
      "SELECT content FROM content WHERE section_key = 'site.theme'"
    );
    const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
    const theme = themes[activeTheme] || themes.dark;
    res.status(404).render('404', { pages, theme });
  } catch (err) {
    console.error('404 handler failed:', err.message);
    res.status(404).send('Not found');
  }
}

async function renderPage(req, res, next, pageSlug) {
  try {
    // Load the requested page
    const { rows: pageRows } = await db.query(
      'SELECT * FROM pages WHERE slug = $1', [pageSlug]
    );
    if (pageRows.length === 0) {
      return render404(req, res);
    }
    const currentPage = pageRows[0];

    // Work out which pages are restricted (have any page_access entries)
    const { rows: allAccessRows } = await db.query('SELECT DISTINCT page_id FROM page_access');
    const restrictedPageIds = new Set(allAccessRows.map(r => r.page_id));
    const isRestricted = restrictedPageIds.has(currentPage.id);

    // Restricted pages: 404 for public visitors. A merely-hidden page (no
    // page_access rows) stays reachable by direct URL — "Hide" only takes a
    // page out of the nav menu and sitemap, it doesn't take it offline. This
    // matters for pages like a Google Ads landing page: deliberately kept
    // out of the nav, but must still work when someone clicks the ad.
    if (isRestricted && !res.locals.user) {
      return render404(req, res);
    }
    // Clients only see restricted pages they have explicit access to.
    // Hidden-but-unrestricted pages are visible to clients the same as the
    // public, for the same reason as above.
    if (isRestricted && res.locals.user?.role === 'client') {
      const { rows: access } = await db.query(
        'SELECT 1 FROM page_access WHERE page_id = $1 AND user_id = $2',
        [currentPage.id, res.locals.user.id]
      );
      if (access.length === 0) {
        return render404(req, res);
      }
    }

    // Load all pages for the page menu
    const { rows: allPagesRows } = await db.query(
      'SELECT id, slug, title, hidden, sort_order, show_in_nav, nav_label FROM pages ORDER BY sort_order, created_at'
    );

    // Filter pages by role: admin/content see all (for editing/management —
    // dimmed in the view for hidden/nav-excluded pages), client sees
    // unrestricted+nav-visible plus anything explicitly granted to them,
    // public sees unrestricted and nav-visible only. show_in_nav is a pure
    // display toggle for the nav/mobile menu — it has no effect on whether a
    // page is reachable by direct URL, indexable, or in the sitemap; those
    // are controlled by `hidden`/`noindex` exactly as before.
    let allPages;
    if (!res.locals.user) {
      allPages = allPagesRows.filter(p => !p.hidden && !restrictedPageIds.has(p.id) && p.show_in_nav);
    } else if (res.locals.user.role === 'client') {
      const { rows: accessRows } = await db.query(
        'SELECT page_id FROM page_access WHERE user_id = $1',
        [res.locals.user.id]
      );
      const accessibleIds = new Set(accessRows.map(r => r.page_id));
      allPages = allPagesRows.filter(p =>
        accessibleIds.has(p.id) || (!p.hidden && !restrictedPageIds.has(p.id) && p.show_in_nav)
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

    // Selected-examples proof-strip rows (on both the homepage's `filter`
    // template and What We Have Done's own `proofstrip` template) jump to
    // the 3 case studies on What We Have Done, in page order. Computed once
    // per request from that page's own section order — not the current
    // page's — since the homepage strip has no local case-study sections of
    // its own to scroll to.
    const EVIDENCE_TEMPLATES = ['biography', 'casestudy', 'casestudy2'];
    let caseStudyAnchors = [];
    if (pageSlug === 'what-we-have-done') {
      caseStudyAnchors = sectionOrder
        .filter(iid => EVIDENCE_TEMPLATES.includes(instanceTemplates[iid]))
        .map(iid => `/what-we-have-done#${iid}`);
    } else {
      const { rows: wwhdRows } = await db.query(
        "SELECT section_order FROM pages WHERE slug = 'what-we-have-done'"
      );
      const wwhdOrder = Array.isArray(wwhdRows[0]?.section_order) ? wwhdRows[0].section_order : [];
      caseStudyAnchors = wwhdOrder
        .filter(iid => EVIDENCE_TEMPLATES.includes(baseOf(iid)))
        .map(iid => `/what-we-have-done#${iid}`);
    }

    // Only fetch/serve Google reviews on pages that actually have a
    // googlereviews section, plus the homepage (which shows a small real
    // rating line next to its testimonial quote) — most other pages never
    // touch this, so the (cached) Places API call stays off their render
    // path entirely.
    let googleReviews = null;
    if (sectionOrder.some(iid => instanceTemplates[iid] === 'googlereviews') || currentPage.slug === 'main') {
      googleReviews = await getGoogleReviews();
    }

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
      currentPage, allPages, seo, caseStudyAnchors, googleReviews,
      canEdit, capabilities, showAdminPanel,
      // Unset until the GA4 property exists — see deployment report for the
      // one external step needed before setting this on Railway.
      ga4Id: process.env.GA4_MEASUREMENT_ID || ''
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
app.use((req, res) => render404(req, res));

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
