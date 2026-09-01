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
const commercialGapsReview = require('./routes/commercialGapsReview');
const whereToStart = require('./routes/whereToStart');
const productGuide = require('./routes/productGuide');
const scott = require('./routes/scott');
const workspace = require('./routes/workspace');
const { publishedArticles, findBySlug: findUsefulThinkingArticle } = require('./lib/usefulThinkingArticles');
const { getSiteShellData } = require('./lib/navShell');
const { SITE_KEY: TURNSTILE_SITE_KEY } = require('./lib/turnstile');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';

// "Continue with Google" prefill on the public checks. Purely optional:
// unset means the button (and its CSP allowances below) do not exist and
// every form is typed-entry only. The value is a public OAuth client ID,
// not a secret; there is no client secret anywhere because this is an
// in-browser prefill, not a server login flow.
const googleSigninClientId = (process.env.GOOGLE_SIGNIN_CLIENT_ID || '').trim();
app.locals.googleSigninClientId = googleSigninClientId;

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
// Overridable so the app can be deployed to a non-production host and still
// be browsable. Until 28/08/2026 this was hardcoded, which meant any Railway
// environment other than production redirected every request to the live site
// and was therefore impossible to click through: the rule below is gated on
// isProd, and RAILWAY_ENVIRONMENT is set in every Railway environment, not
// just production.
//
// Production sets nothing and is byte-for-byte unchanged. A staging service
// sets CANONICAL_HOST to its own hostname, which keeps the whole rule intact
// (one canonical host, everything else 301s to it, HTTPS still forced) and
// simply points it at that environment's host instead of the live one.
const LIVE_PUBLIC_HOST = 'www.arringtonconsultancy.com';
const CANONICAL_HOST = (process.env.CANONICAL_HOST || LIVE_PUBLIC_HOST)
  .trim()
  .toLowerCase();

// A deploy that has overridden the canonical host is, by definition, not the
// public site. It must never be indexed: it serves a full copy of every page,
// which is the exact duplicate-content problem the redirect rule below exists
// to prevent. Deriving this from CANONICAL_HOST rather than adding a second
// variable means it cannot be forgotten when a staging service is created.
const IS_PUBLIC_SITE = CANONICAL_HOST === LIVE_PUBLIC_HOST;

// Extended 15/08/2026 from "rewrite the .com apex only" to "rewrite every
// non-canonical hostname". Five hostnames are bound to this service: the two
// .com forms, the two .co.uk forms and Railway's own service domain. Only the
// .com apex was being rewritten, so the other three each served a full 200
// copy of every page with a self-referencing canonical tag, making the whole
// site independently indexable under three extra hostnames.
//
// Deliberately a rule rather than a list of the three known hosts, so a domain
// added in Railway later cannot quietly reintroduce the same duplication. Two
// exemptions:
//
//   - Local and internal hosts (localhost, a bare IP, anything without a dot)
//     are left alone, so development and any in-container request behave
//     exactly as before. isProd already covers most of this; this is belt and
//     braces for a prod-like environment reached over a private hostname.
//   - /health is never host-rewritten, so an external uptime monitor pointed
//     at any of the five hostnames still gets a real 200/503 rather than a
//     301. It also means Railway's own domain stays usable to confirm the app
//     is alive if DNS for the custom domains ever breaks.
//
// req.url carries path and query together, so both survive the redirect, and
// the HTTPS check is folded into the same hop to avoid a redirect chain.
const isInternalHost = (host) =>
  !host ||
  !host.includes('.') ||
  /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ||
  /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host);

// Blanket noindex on any non-public deploy. Belt and braces alongside the
// robots.txt below, because a header cannot be missed by a crawler that never
// requests robots.txt, and because robots.txt only discourages crawling while
// X-Robots-Tag actually forbids indexing.
app.use((req, res, next) => {
  if (!IS_PUBLIC_SITE) res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

app.use((req, res, next) => {
  if (!isProd) return next();
  const host = (req.header('host') || '').toLowerCase();
  const isHttps = req.header('x-forwarded-proto') === 'https';
  const mayRewriteHost = !isInternalHost(host) && req.path !== '/health';
  const targetHost = mayRewriteHost && host !== CANONICAL_HOST ? CANONICAL_HOST : host;
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
        'https://fonts.googleapis.com',
        // Google Identity Services (the Continue with Google prefill).
        // All four gsi allowances are gated on the same env var as the
        // button itself, so an unconfigured deploy carries no extra CSP.
        ...(googleSigninClientId ? ['https://accounts.google.com/gsi/style'] : [])
      ],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.nonce}'`,
        'https://www.googletagmanager.com',
        'https://www.googleadservices.com',
        'https://challenges.cloudflare.com',
        ...(googleSigninClientId ? ['https://accounts.google.com/gsi/client'] : [])
      ],
      // Google Ads conversion and remarketing endpoints are sent as pixels or
      // beacons, so they need img-src/connect-src and nothing else. These hosts
      // were verified from live gtag traffic for AW-18129914078 during the
      // August tracking and SEO sweeps. They are deliberately not added to
      // script-src or frame-src.
      imgSrc: [
        "'self'",
        'data:',
        'https://www.googletagmanager.com',
        'https://www.google-analytics.com',
        'https://www.googleadservices.com',
        'https://googleads.g.doubleclick.net',
        'https://www.google.com',
        'https://ad.doubleclick.net',
        'https://www.google.co.uk',
        'https://lh3.googleusercontent.com'
      ],
      connectSrc: [
        "'self'",
        'https://www.googletagmanager.com',
        'https://www.google-analytics.com',
        'https://www.googleadservices.com',
        'https://googleads.g.doubleclick.net',
        'https://www.google.com',
        'https://ad.doubleclick.net',
        ...(googleSigninClientId ? ['https://accounts.google.com/gsi/'] : [])
      ],
      frameSrc: [
        "'self'",
        'https://td.doubleclick.net',
        'https://challenges.cloudflare.com',
        ...(googleSigninClientId ? ['https://accounts.google.com/gsi/'] : [])
      ],
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

// Cross-Origin-Opener-Policy, relaxed on the four pages that carry the
// "Continue with Google" prefill button, and ONLY those.
//
// helmet's default is COOP: same-origin, which severs window.opener
// between the page and any popup it opens. Google's Identity Services
// popup returns the visitor's chosen account to the page through that
// link, so under the strict default the popup completes, lands on
// accounts.google.com/gsi/transform, goes white and can never hand the
// result back: the fields stay empty and the window hangs open. Google
// documents same-origin-allow-popups as the requirement for this flow.
//
// Deliberately scoped to these four paths rather than set globally.
// same-origin-allow-popups keeps the protection that matters (another
// origin still cannot get a handle on our window) while letting a popup
// WE opened talk back to us, and everywhere else on the site keeps the
// stricter default. Gated on the client ID as well, so with the prefill
// switched off the site is byte-for-byte as it was.
const GOOGLE_PREFILL_PATHS = new Set([
  '/product-guide',
  '/market-ready-test',
  '/owner-dependency-quiz',
  '/commercial-gaps-review'
]);
app.use((req, res, next) => {
  if (googleSigninClientId && GOOGLE_PREFILL_PATHS.has(req.path)) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  }
  next();
});


// Permissions-Policy: disable browser features this site never uses. The
// only feature actually used anywhere (the Market Ready Test and Owner
// Dependency Quiz result pages' "copy link" buttons) is navigator.clipboard,
// so clipboard-write stays allowed for same-origin rather than being
// switched off along with everything else.
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), autoplay=(), camera=(), display-capture=(), ' +
    'encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), ' +
    'magnetometer=(), microphone=(), midi=(), payment=(), ' +
    'picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), ' +
    'usb=(), web-share=(), clipboard-write=(self)'
  );
  next();
});

// Cookie parsing (required by csrf-csrf)
app.use(cookieParser());

// Stripe webhook — registered before any JSON body parsing (it needs the
// RAW request body to verify Stripe's signature) and before the CSRF
// middleware further down (Stripe's servers don't send our CSRF token, so
// this route must be exempt, same as any third-party webhook). See
// routes/whereToStart.js for the handler itself.
whereToStart.mountWebhook(app);

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
// <source> fetch has no defined fallback in the picture-element spec (see
// "Per-instance hero images" in CLAUDE.md).
//
// Candidate order for a `.webp` request is deliberately NOT just "this
// instance's webp, then the base webp": the CMS's image upload route
// (`PUT /api/content/image/:key`) only ever writes the exact key clicked —
// uploading a per-instance photo (e.g. `headshot__hero__2`) never creates a
// matching `headshot__hero__2__webp` row (that pairing is only ever created
// by a one-off seed migration, as documented for `headshot__hero__5`). If
// the webp candidates jumped straight from the instance's own webp to the
// *base* webp, a WebP-capable browser would silently render a different
// photo (the generic default) than a non-WebP browser rendering the same
// instance's real upload via the plain `<img>` fallback — loads without
// erroring, but the wrong picture. So this instance's own original-format
// upload is tried before ever falling through to the generic base image,
// in either format.
app.get('/img/:key', async (req, res, next) => {
  try {
    let requested = req.params.key;
    let wantsWebp = false;
    if (requested.endsWith('.webp')) {
      wantsWebp = true;
      requested = requested.slice(0, -5);
    }
    const toLookupKey = (k) => wantsWebp ? `${k}__webp` : k;
    const sep = requested.indexOf('__');
    const base = sep > 0 ? requested.slice(0, sep) : null;
    const candidates = wantsWebp
      ? [toLookupKey(requested), requested, ...(base ? [toLookupKey(base), base] : [])]
      : [requested, ...(base ? [base] : [])];
    for (const key of candidates) {
      const { rows } = await db.query(
        'SELECT data, mime_type FROM images WHERE image_key = $1',
        [key]
      );
      if (rows.length > 0) {
        res.set('Content-Type', rows[0].mime_type);
        // CMS images can be replaced under the same key, so browsers should
        // revalidate rather than keep a stale logo or hero image locally.
        res.set('Cache-Control', 'no-cache');
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

    const { navPages, content, pageContact } = await getSiteShellData();

    res.render('owner-dependency-quiz', {
      theme,
      ga4Id: process.env.GA4_MEASUREMENT_ID || '',
      csrfToken: generateCsrfToken(req, res),
      shareResult,
      requestUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      navPages,
      content,
      pageContact,
      turnstileSiteKey: TURNSTILE_SITE_KEY
    });
  } catch (err) {
    next(err);
  }
});

app.get('/owner-dependency-review', (req, res) => {
  res.redirect(301, '/owner-dependency-quiz');
});

// What We Have Done, What the Work Looks Like and What Business Owners Say
// were merged into a single Evidence page (30/07/2026, Tom's brief — see
// db/seed.js for the merge migration). These three routes replace the pages
// that used to render at these slugs; registered ahead of the generic
// /:slug catch-all so a request never falls through to the (now deleted)
// page row. Anchors send returning visitors straight to the right part of
// Evidence rather than just its top.
app.get('/what-we-have-done', (req, res) => {
  res.redirect(301, '/evidence');
});
app.get('/what-the-work-looks-like', (req, res) => {
  res.redirect(301, '/evidence#documents');
});
app.get('/what-business-owners-say', (req, res) => {
  res.redirect(301, '/evidence#googlereviews');
});
app.get('/30-minute-conversation', (req, res) => {
  res.redirect(301, '/book-a-30-minute-conversation');
});
app.get('/about', (req, res) => {
  res.redirect(301, '/about-us');
});
app.get('/contact', (req, res) => {
  res.redirect(301, '/#conversation');
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

    const { navPages, content, pageContact } = await getSiteShellData();

    res.render('owner-check', {
      theme,
      ga4Id: process.env.GA4_MEASUREMENT_ID || '',
      csrfToken: generateCsrfToken(req, res),
      navPages,
      content,
      pageContact
    });
  } catch (err) {
    next(err);
  }
});

// robots.txt — allow crawling, point at the sitemap, keep the login page out
// of the index. Built from the request host so it works on every domain.
app.get('/robots.txt', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  // A staging or preview deploy serves a complete copy of the site. Refuse
  // all crawling outright rather than publishing a sitemap that would invite
  // it to be indexed alongside the real thing.
  if (!IS_PUBLIC_SITE) {
    return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  }
  res.type('text/plain').send(
    // /market-ready-test is still unpublished — see routes/marketReadyTest.js
    // — disallowed here as belt-and-braces on top of its own noindex/nofollow
    // meta tag, until Tom approves launch. Commercial Gaps Review (routes/
    // commercialGapsReview.js) was approved for launch 30/07/2026 and is
    // deliberately no longer listed here; its own per-visitor result pages
    // stay noindex/nofollow regardless, since those carry one visitor's
    // private answers rather than being the public tool page.
    `User-agent: *\nAllow: /\nDisallow: /login\nDisallow: /market-ready-test/result/\nDisallow: /commercial-gaps-review/result/\n\nSitemap: ${base}/sitemap.xml\n`
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
    const SEO_AUDIT_ROUTE_LASTMOD = {
      main: '2026-08-17',
      'what-we-do': '2026-08-17',
      'websites-and-ai': '2026-08-17',
      'business-consultant-devon': '2026-08-17',
      'you-dont-get-to-decide-when-youve-made-things-right': '2026-08-17',
      'the-tightrope-between-staff-loyalty-and-damage-control': '2026-08-17',
      'you-build-a-business-one-problem-at-a-time': '2026-08-17'
    };
    const urlEntries = await Promise.all(pubPages.map(async (p) => {
      const loc = p.slug === 'main'
        ? `${base}/`
        : findUsefulThinkingArticle(p.slug)
          ? `${base}/useful-thinking/${p.slug}`
          : `${base}/${p.slug}`;
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
      if (SEO_AUDIT_ROUTE_LASTMOD[p.slug]) {
        lastmod = `<lastmod>${SEO_AUDIT_ROUTE_LASTMOD[p.slug]}</lastmod>`;
      }
      return `  <url><loc>${escapeXml(loc)}</loc>${lastmod}</url>`;
    }));
    // Owner Check, the three assessment tools and Privacy aren't rows in
    // `pages` (Owner Check is a synthetic nav entry, the rest are standalone
    // routes, not CMS content), so each needs its own explicit entry. Market
    // Ready Test joined this list on 16/08/2026 when Tom signed off publishing
    // it into the Owner Check hub. Only the assessment pages themselves are
    // listed: every tool's per-visitor result page stays out, noindex and
    // robots-disallowed.
    //
    // Their copy lives in static EJS templates, not the database, so there's
    // no updated_at to read a real lastmod from. ASSESSMENT_ROUTE_LASTMOD
    // records the date each route's on-page copy last meaningfully changed
    // (01/08/2026: the SEO metadata added to all three counts as such a
    // change) rather than leaving lastmod off entirely. Bump the relevant
    // date here the next time one of these standalone views' visible copy
    // changes — it is not tied to unrelated deploys, so it won't drift on
    // its own.
    const ASSESSMENT_ROUTE_LASTMOD = {
      'owner-check': '2026-08-01',
      'owner-dependency-quiz': '2026-08-01',
      'commercial-gaps-review': '2026-08-01',
      'market-ready-test': '2026-08-16',
      'where-to-start': '2026-08-17',
      'where-to-start/commercial-review': '2026-08-17',
      'where-to-start/full-commercial-review': '2026-08-17',
      'where-to-start/website-build': '2026-08-17',
      'where-to-start/full-review-website-build': '2026-08-17',
      'product-guide': '2026-08-22'
    };
    // where-to-start/confirmation is deliberately excluded — private,
    // per-visitor payment status, noindex/nofollow on the page itself,
    // same treatment as the quiz/review result pages.
    for (const slug of ['owner-check', 'owner-dependency-quiz', 'commercial-gaps-review', 'market-ready-test', 'where-to-start', 'where-to-start/commercial-review', 'where-to-start/full-commercial-review', 'where-to-start/website-build', 'where-to-start/full-review-website-build', 'product-guide']) {
      urlEntries.push(`  <url><loc>${escapeXml(`${base}/${slug}`)}</loc><lastmod>${ASSESSMENT_ROUTE_LASTMOD[slug]}</lastmod></url>`);
    }
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

// Market Ready Test — standalone tool, published 16/08/2026 (see routes/marketReadyTest.js
// for the full brief). Page routes registered directly (same pattern as the
// Owner Dependency Quiz above) so the submit form's CSRF token is generated
// here rather than relying on the global res.locals middleware; the POST
// endpoint carries its own dedicated rate limiter.
marketReadyTest.mountPageRoute(app, generateCsrfToken);
app.use(marketReadyTest.router);

// Commercial Gaps Review (AI) — unpublished, standalone tool (see
// routes/commercialGapsReview.js for the full brief). Same registration
// pattern as the two tools above, for the same reason (its intake form's
// CSRF token needs generating here, ahead of the global res.locals set).
commercialGapsReview.mountPageRoute(app, generateCsrfToken);
app.use(commercialGapsReview.router);

// Where to Start — priced offers with Stripe-hosted checkout (see
// routes/whereToStart.js). Same registration pattern as the tools above:
// GET pages registered directly so each page's CSRF token is generated
// here, the checkout-creation POST route mounted via the router so it sits
// behind the global CSRF middleware like every other public form on the
// site (the webhook, which must NOT go through CSRF, is registered
// separately, much earlier — see mountWebhook above).
whereToStart.mountPageRoute(app, generateCsrfToken);
app.use(whereToStart.router);

// Arrington Product Guide — guided recommendation experience (see
// routes/productGuide.js). Same registration pattern as the tools above:
// the GET page route is registered directly so its form's CSRF token is
// generated here, and the POST endpoints go through the router so they sit
// behind the global CSRF middleware like every other public form.
productGuide.mountPageRoute(app, generateCsrfToken);
app.use(productGuide.router);

// Scott AI Demonstration — private, invited-access-only fictional-company
// demo (see routes/scott.js, lib/scott/**). Same registration pattern as
// the tools above: GET page routes registered directly, ahead of the
// generic /:slug catch-all further down, so this area is never reachable
// through the CMS page-render pipeline; POST/API routes go through the
// router, behind the global CSRF middleware like every other authenticated
// write on the site. Every route (bar the login page itself) is gated by
// requireScottPageAccess/requireScottApiAccess, reusing the existing
// page_access table against one synthetic hidden page row — no second
// permission system, no second admin screen.
scott.mountPageRoute(app, generateCsrfToken);
app.use(scott.router);

// Arrington AI Workspace — the real internal workspace (see
// routes/workspace.js, lib/workspace/**). Same registration pattern as
// the areas above. Entirely separate from the Scott demonstration: no
// Scott table, identity, prompt or fictional fact is reachable from it,
// and vice versa. Access is the site's own session auth plus the
// workspace clearance map (real access is Tom only); anyone else gets a
// 404 that does not admit the area exists.
workspace.mountPageRoute(app, generateCsrfToken);
app.use(workspace.router);

// /v1.html — retired from public serving (15/08/2026). The original V1
// single-page site was kept served as a reference copy, with a relaxed
// per-route CSP because its inline <style>/<script> blocks predate the nonce
// setup. The problem was that it is a complete alternative version of the
// site's own content, in the old warm palette and the old "We" voice: publicly
// reachable, crawlable, carrying no noindex and listed in no sitemap. That
// made a superseded statement of the company's positioning indexable
// alongside the live one.
//
// It now redirects permanently to the homepage, which is the page whose
// content it duplicates. The v1.html file itself stays in the repository as
// the historical record, exactly as CLAUDE.md describes it, and the relaxed
// CSP override goes with the route that needed it.
app.get('/v1.html', (req, res) => res.redirect(301, '/'));

// Valid section templates (shared with routes/content.js)
const VALID_TEMPLATES = ['hero','credentials','biography','intervention','approach','insights','fourcards','documents','casestudy','casestudy2','assessment','filter','proofstrip','offerpair','heromontage','contact','googlereviews','article','utlibrary'];
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
const { render404 } = require('./lib/render404');

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

    // Owner Check is a standalone route (not a `pages` row), so it can't
    // just sit in `allPages` — that array also feeds the intervention/filter
    // button link picker (<meta name="all-pages">), which should keep
    // listing only genuine CMS pages. Nav position: third, right after What
    // We Do, per the approved nav (Home | What We Do | Owner Check |
    // Evidence | About Us | 30 Minute Conversation). Built as a separate
    // array used only by the two nav loops in index.ejs; falls back to
    // appending at the end if 'what-we-do' is ever renamed or removed.
    const ownerCheckNavEntry = { slug: 'owner-check', title: 'Owner Check', nav_label: '', hidden: false, show_in_nav: true };
    const whatWeDoIndex = allPages.findIndex(p => p.slug === 'what-we-do');
    const navPagesWithOwnerCheck = whatWeDoIndex === -1
      ? [...allPages, ownerCheckNavEntry]
      : [...allPages.slice(0, whatWeDoIndex + 1), ownerCheckNavEntry, ...allPages.slice(whatWeDoIndex + 1)];

    // Product Guide (22/08/2026) — this nav slot used to be "Where to
    // Start" (linking to /where-to-start), renamed per the site refinement
    // brief now that the Product Guide is live. It links to /product-guide
    // directly rather than to the /where-to-start hub, since that is the
    // page the nav label actually names. /where-to-start is NOT deleted —
    // it still exists, is still in the sitemap, and is still linked
    // directly from the Product Guide's own "already know what you need"
    // link and from elsewhere on the site — it is just no longer the nav's
    // own top-level destination. Same synthetic-nav-entry reasoning as
    // Owner Check above (no CMS template exists for this route). Position
    // unchanged: after Evidence, so proof is seen before the guide/prices.
    // Falls back to appending at the end if 'evidence' is ever renamed or
    // removed.
    const productGuideNavEntry = { slug: 'product-guide', title: 'Product Guide', nav_label: '', hidden: false, show_in_nav: true };
    const evidenceIndex = navPagesWithOwnerCheck.findIndex(p => p.slug === 'evidence');
    const navPages = evidenceIndex === -1
      ? [...navPagesWithOwnerCheck, productGuideNavEntry]
      : [...navPagesWithOwnerCheck.slice(0, evidenceIndex + 1), productGuideNavEntry, ...navPagesWithOwnerCheck.slice(evidenceIndex + 1)];

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
    // template and Evidence's own `proofstrip` template) jump to the case
    // studies on the Evidence page, in page order. Computed once per
    // request from that page's own section order — not the current page's
    // — since the homepage strip has no local case-study sections of its
    // own to scroll to. Evidence merges What We Have Done, What the Work
    // Looks Like and What Business Owners Say (30/07/2026, Tom's brief);
    // this used to point at What We Have Done directly before that merge.
    const EVIDENCE_TEMPLATES = ['biography', 'casestudy', 'casestudy2'];
    let caseStudyAnchors = [];
    if (pageSlug === 'evidence') {
      caseStudyAnchors = sectionOrder
        .filter(iid => EVIDENCE_TEMPLATES.includes(instanceTemplates[iid]))
        .map(iid => `/evidence#${iid}`);
    } else {
      const { rows: evidenceRows } = await db.query(
        "SELECT section_order FROM pages WHERE slug = 'evidence'"
      );
      const evidenceOrder = Array.isArray(evidenceRows[0]?.section_order) ? evidenceRows[0].section_order : [];
      caseStudyAnchors = evidenceOrder
        .filter(iid => EVIDENCE_TEMPLATES.includes(baseOf(iid)))
        .map(iid => `/evidence#${iid}`);
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

    const screenshotKeys = new Set();
    if (sectionOrder.some(iid => instanceTemplates[iid] === 'casestudy2')) {
      const { rows: screenshotRows } = await db.query(
        "SELECT image_key FROM images WHERE image_key LIKE 'screenshot__%'"
      );
      screenshotRows.forEach(row => screenshotKeys.add(row.image_key));
    }

    // Resolve SEO metadata. Per-page columns (on the pages row) override the
    // site-wide defaults held in the seo.* content keys; a blank per-page
    // field falls back to the default. Canonical/OG URL default to the
    // current request URL unless the page sets an explicit canonical.
    const siteName = (content['seo.site_name'] || 'Arrington Business Consultancy').trim();
    const defaultDesc = (content['seo.default_description'] || '').trim();
    const defaultOgImage = (content['seo.default_og_image'] || '').trim();
    const twitterHandle = (content['seo.twitter_handle'] || '').trim();

    // Useful Thinking articles are real pages (so SEO, hide/delete, the
    // button-link picker etc. all just work) but render at a nested
    // /useful-thinking/{slug} URL rather than the flat /{slug} every other
    // page uses, per the handover's recommended URL shape. renderPage()
    // itself doesn't care what path the request came in on — only the
    // canonical/OG URL computation below needs to know to prefix it.
    const isUsefulThinkingArticle = !!findUsefulThinkingArticle(currentPage.slug);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pagePath = currentPage.slug === 'main'
      ? '/'
      : isUsefulThinkingArticle
        ? `/useful-thinking/${currentPage.slug}`
        : `/${currentPage.slug}`;
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

    // Page-specific contact overrides. For websites-and-ai the footer shows
    // different heading/body copy while keeping the shared email, phone and
    // WhatsApp details unchanged. All other pages get the global values.
    const plainText = (v) => String(v || '').replace(/<[^>]+>/g, '').trim();
    const pageContact = {
      headerCtaText: plainText(content['contact.label']) || 'Start a conversation',
      label: content['contact.label'],
      heading: content['contact.heading'],
      body: content['contact.body'],
      messagePlaceholder: 'Tell us where the pressure is showing',
      submitText: 'Send'
    };
    if (pageSlug === 'websites-and-ai') {
      pageContact.headerCtaText = plainText(content['wai.header_cta_text']) || pageContact.headerCtaText;
      // Label resolves on "is the override present" rather than "is it
      // truthy" (15/08/2026). This page deliberately has no eyebrow label -
      // it previously repeated its own heading word for word - and a plain
      // `||` would treat that empty override as "unset" and fall back to the
      // site-wide contact label, putting unrelated consultancy copy above
      // the website enquiry form. An absent key still falls back as before.
      pageContact.label = content['wai.contact_label'] === undefined
        ? pageContact.label
        : content['wai.contact_label'];
      pageContact.heading = content['wai.contact_heading'] || pageContact.heading;
      pageContact.body    = content['wai.contact_body']    || pageContact.body;
      pageContact.messagePlaceholder = plainText(content['wai.contact_message_placeholder']) || pageContact.messagePlaceholder;
      pageContact.submitText = plainText(content['wai.contact_submit_text']) || pageContact.submitText;
    }

    res.render('index', {
      content, theme, activeTheme, themes,
      sectionOrder: renderOrder, hiddenSections, instanceTemplates,
      currentPage, allPages, navPages, seo, caseStudyAnchors, googleReviews,
      isUsefulThinkingArticle,
      canEdit, capabilities, showAdminPanel,
      pageContact,
      screenshotKeys,
      // Only the useful-thinking page's `utlibrary` template reads this,
      // but the list is cheap (no DB query, just the manifest) so it's
      // simplest to always pass it rather than special-case the query.
      usefulThinkingArticles: publishedArticles(),
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

app.get('/privacy', async (req, res, next) => {
  try {
    const { rows: themeRows } = await db.query(
      "SELECT content FROM content WHERE section_key = 'site.theme'"
    );
    const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
    const theme = themes[activeTheme] || themes.dark;
    res.render('privacy', {
      theme,
      activeTheme,
      nonce: res.locals.nonce,
      ga4Id: process.env.GA4_MEASUREMENT_ID || ''
    });
  } catch (err) {
    next(err);
  }
});

// Useful Thinking articles — nested URL, registered ahead of the generic
// /:slug catch-all so it never falls through. The article is still just a
// normal `pages` row underneath (see lib/usefulThinkingArticles.js); this
// route only changes which URL path resolves to it.
app.get('/useful-thinking/:articleSlug', (req, res, next) => {
  const slug = req.params.articleSlug;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return render404(req, res);
  if (!findUsefulThinkingArticle(slug)) return render404(req, res);
  return renderPage(req, res, next, slug);
});

// Additional pages — placed after all fixed routes, before 404 handler
app.get('/:slug', (req, res, next) => {
  const slug = req.params.slug;
  // Don't catch routes that belong to other handlers
  if (/\.\w+$/.test(slug)) return next(); // file extensions (v1.html etc.)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return next(); // only lowercase-hyphenated slugs
  // A Useful Thinking article is a normal `pages` row underneath, so this
  // catch-all rendered every article at the flat /{slug} as well as at its own
  // /useful-thinking/{slug} route. Both returned 200 with identical content and
  // only the canonical tag told them apart, which relies on the crawler
  // honouring it. The flat URL now redirects permanently to the article's real
  // route, leaving one indexable URL per article. Scoped to known article slugs
  // only, so every ordinary CMS page at the root is untouched, and the nested
  // route above is unaffected because it never reaches this handler.
  if (findUsefulThinkingArticle(slug)) {
    const queryString = req.originalUrl.slice(req.path.length);
    return res.redirect(301, `/useful-thinking/${slug}${queryString}`);
  }
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

// Commercial Gaps Review retention sweep — deliberately independent of
// deployments. This is NOT part of db/seed.js (which only runs once per
// deploy, so a site that isn't redeployed for weeks would never clean up).
// Instead it runs on the server process's own clock via setInterval, so
// stale rows are removed on schedule regardless of deploy activity.
// Retention: failed reviews (result generation genuinely broke) are kept
// 90 days — long enough for the internal recovery email to be actioned.
// Abandoned reviews (started, never completed) are kept 30 days — there's
// less reason to hold an incomplete session for long. Completed reviews
// are never touched by this sweep.
const CGR_FAILED_RETENTION_DAYS = 90;
const CGR_ABANDONED_RETENTION_DAYS = 30;
const CGR_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function pruneStaleCommercialGapsReviews() {
  try {
    const { rowCount: failedPruned } = await db.query(
      `DELETE FROM commercial_gaps_reviews
       WHERE status = 'failed' AND created_at < NOW() - ($1 || ' days')::interval`,
      [CGR_FAILED_RETENTION_DAYS]
    );
    const { rowCount: abandonedPruned } = await db.query(
      `DELETE FROM commercial_gaps_reviews
       WHERE status IN ('in_progress', 'processing') AND created_at < NOW() - ($1 || ' days')::interval`,
      [CGR_ABANDONED_RETENTION_DAYS]
    );
    if (failedPruned || abandonedPruned) {
      const detail = `Removed ${failedPruned} failed (older than ${CGR_FAILED_RETENTION_DAYS}d) and ${abandonedPruned} abandoned (older than ${CGR_ABANDONED_RETENTION_DAYS}d) Commercial Gaps Review submission(s).`;
      console.log(`Commercial Gaps Review retention sweep: ${detail}`);
      await db.query(
        `INSERT INTO audit_log (user_id, action, section_key, detail) VALUES (NULL, 'cgr_retention_sweep', 'commercial_gaps_reviews', $1)`,
        [detail]
      );
    }
  } catch (err) {
    console.error('Commercial Gaps Review retention sweep failed:', err.message);
  }
}
// Run shortly after boot (not instantly, so it isn't competing with the
// seed script's own DB work), then on a fixed 24h cycle for as long as the
// process stays up — that cycle is what makes this independent of deploys.
setTimeout(() => {
  pruneStaleCommercialGapsReviews();
  setInterval(pruneStaleCommercialGapsReviews, CGR_SWEEP_INTERVAL_MS);
}, 60 * 1000);

// Reports the three workspace gates one by one. Kept here rather than in
// the workspace modules because it is a deployment diagnostic, and it
// deliberately reports the passphrase's presence and length only.
async function describeWorkspaceAccessConfig() {
  const enabled = process.env.ENABLE_ARRINGTON_AI_WORKSPACE === 'true';
  if (!enabled) return "ENABLE_ARRINGTON_AI_WORKSPACE is not 'true', so the workspace does not exist in this environment";
  const binding = require('./lib/workspace/clearance').describeOwnerBinding();
  const pass = require('./lib/workspace/unlock').describeUnlockConfig();
  const parts = [
    'flag on',
    binding.ok
      ? `owner binding ok (username '${binding.username}', expects user id ${binding.userId})`
      : `owner binding NOT SET: ${binding.problems.join('; ')}`,
    pass.ok ? pass.detail : `passphrase NOT SET: ${pass.detail}`
  ];
  // Finding H3 (31/08/2026): the workspace gained a fourth deployment
  // dependency - whether its security alarm can actually ring - and this
  // line said nothing about it. An operator could set the gates up
  // correctly, read a line saying everything was fine, and be running
  // with an alert that can never fire. Reported on the same honest
  // pattern as the rest: what it is, and where it would go.
  const alertCfg = require('./lib/workspace/unlockAlert').describeAlertConfig();
  parts.push(alertCfg.detail);
  const shut = !binding.ok || !pass.ok;
  // The id an operator actually needs. Without this line, setting
  // WORKSPACE_OWNER_USER_ID correctly means having database access,
  // which the person doing the deploy may not have. A user id is not a
  // secret; the passphrase is, and is never printed.
  try {
    const names = Object.keys(require('./lib/workspace/clearance').HUMAN_CLEARANCE);
    const { rows } = await db.query('SELECT id, username FROM users WHERE username = ANY($1)', [names]);
    parts.push(rows.length
      ? 'actual ids in this database: ' + rows.map((r) => `${r.username}=${r.id}`).join(', ')
      : `no account exists here for the cleared username(s) ${names.join(', ')}`);
  } catch (err) {
    parts.push(`could not read the users table to report the actual id (${err.message})`);
  }
  return parts.join(' | ') + (shut ? ' | RESULT: nobody can reach the workspace until these are set' : ' | RESULT: the cleared owner can unlock');
}

loadPermissions().then(() => {
  app.listen(PORT, () => {
    console.log(`[${isProd ? 'PROD' : 'DEV'}] Arrington CMS running on port ${PORT}`);
    console.log(require('./lib/scott/orchestrator').describeScottAIStatus());
    console.log('Workspace AI: ' + require('./lib/workspace/orchestrator').describeWorkspaceAIStatus());
    // Governance finding F1 (Tom's decision, 31/08/2026): the workspace
    // now has three gates, and two of them are Railway variables that
    // are easy to get subtly wrong. This line reports each separately,
    // so an operator can tell an unset variable from a wrong one without
    // guessing. It prints the expected user id, which is not a secret
    // and is the thing you need to see in order to set it, and it never
    // prints any part of the passphrase.
    describeWorkspaceAccessConfig()
      .then((line) => console.log('Workspace access: ' + line))
      .catch((err) => console.error('Workspace access: could not be described:', err.message));
    // Writes a paid-run authorisation row when ARM_WORKSPACE_LIVE_PRESSURE
    // is set, and launches nothing. This is route (b) in that script:
    // the arming half, for an operator whose shell cannot reach the
    // database. It refuses to run alongside RUN_WORKSPACE_LIVE_PRESSURE.
    require('./scripts/armWorkspaceLivePressure').armAtBoot(require('./db/pool'));
    // One-shot, marker-guarded, env-gated runner for the paid live-AI
    // pressure suite. A no-op unless RUN_SCOTT_LIVE_PRESSURE=true; see
    // the script header for the spend controls.
    require('./scripts/scottLivePressureRunner').maybeRunLivePressureSuite(require('./db/pool'));
    // The workspace's own paid suite, same shape, its own flag and its
    // own marker so one can never spend on behalf of the other.
    require('./scripts/workspaceLivePressureRunner').maybeRunWorkspacePressureSuite(require('./db/pool'));
    // Evolving fictional business memory: same two-step arm/run shape,
    // its own flags and its own marker, so a run authorised for this
    // feature can never spend on either of the two suites above.
    require('./scripts/armScottMemoryLiveTest').armAtBoot(require('./db/pool'));
    require('./scripts/scottMemoryLiveTestRunner').maybeRunMemoryLiveTest(require('./db/pool'));
  });
}).catch(err => {
  console.error('Failed to load permissions:', err);
  // Start anyway — hasCapability falls back to hardcoded defaults
  app.listen(PORT, () => {
    console.log(`[${isProd ? 'PROD' : 'DEV'}] Arrington CMS running on port ${PORT} (permissions fallback)`);
  });
});
