// Canonical-host redirect: the rule, and its env override.
//
// The redirect middleware in server.js forces a single canonical hostname in
// production: every other host 301s to it, path and query preserved, with the
// HTTPS upgrade folded into the same hop so no chain forms.
//
// Until 28/08/2026 the canonical host was hardcoded to the live domain. That
// made any non-production deploy unbrowsable: the rule is gated on isProd, and
// RAILWAY_ENVIRONMENT is set in EVERY Railway environment, so a staging
// service redirected all of its own traffic to the live site. Found while
// standing up the Scott staging service, which was unreachable for exactly
// this reason.
//
// These tests pin both halves: production's behaviour is unchanged when the
// override is absent, and a staging host serves its own pages when it is set.
//
// The middleware is replicated here rather than imported because server.js
// binds a port and opens a DB pool on require. It is a small, stable rule and
// the duplication is called out in both places; if the real one changes, this
// must change with it.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SERVER_SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const isInternalHost = (host) =>
  !host ||
  !host.includes('.') ||
  /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ||
  /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host);

// Mirrors the middleware. Returns the redirect target, or null to pass through.
function resolve({ canonicalHost, host, urlPath, query = '', https = true }) {
  const h = (host || '').toLowerCase();
  const mayRewriteHost = !isInternalHost(h) && urlPath !== '/health';
  const targetHost = mayRewriteHost && h !== canonicalHost ? canonicalHost : h;
  if (targetHost !== h || !https) {
    return `https://${targetHost}${urlPath}${query}`;
  }
  return null;
}

const LIVE = 'www.arringtonconsultancy.com';

describe('canonical host redirect', () => {
  describe('production behaviour, with no override set (must not change)', () => {
    test('the canonical host itself is served, not redirected', () => {
      assert.equal(resolve({ canonicalHost: LIVE, host: LIVE, urlPath: '/where-to-start' }), null);
    });

    test('the .com apex 301s to the canonical host, keeping path and query', () => {
      assert.equal(
        resolve({ canonicalHost: LIVE, host: 'arringtonconsultancy.com', urlPath: '/about-us', query: '?utm=x' }),
        'https://www.arringtonconsultancy.com/about-us?utm=x'
      );
    });

    test('both .co.uk forms and the Railway domain 301s to the canonical host', () => {
      for (const host of [
        'arringtonconsultancy.co.uk',
        'www.arringtonconsultancy.co.uk',
        'arrington-prototype-production.up.railway.app'
      ]) {
        assert.equal(
          resolve({ canonicalHost: LIVE, host, urlPath: '/' }),
          'https://www.arringtonconsultancy.com/',
          `${host} should redirect to the canonical host`
        );
      }
    });

    test('/health is never host-rewritten, so uptime monitors get a real status', () => {
      assert.equal(
        resolve({ canonicalHost: LIVE, host: 'arrington-prototype-production.up.railway.app', urlPath: '/health' }),
        null
      );
    });

    test('plain HTTP on the canonical host upgrades in a single hop, no chain', () => {
      assert.equal(
        resolve({ canonicalHost: LIVE, host: LIVE, urlPath: '/', https: false }),
        'https://www.arringtonconsultancy.com/'
      );
    });

    test('localhost and bare IPs are left alone so local dev is unaffected', () => {
      assert.equal(resolve({ canonicalHost: LIVE, host: 'localhost:3000', urlPath: '/' }), null);
      assert.equal(resolve({ canonicalHost: LIVE, host: '10.0.0.4', urlPath: '/' }), null);
    });
  });

  describe('with CANONICAL_HOST pointed at a staging host', () => {
    const STAGING = 'scott-demo-staging.up.railway.app';

    test('the staging host serves its own pages instead of bouncing to the live site', () => {
      // The bug this override exists to fix: without it, this returned a 301
      // to the live domain and the staging deploy could not be viewed at all.
      assert.equal(resolve({ canonicalHost: STAGING, host: STAGING, urlPath: '/scott' }), null);
    });

    test('the live domain is not redirected to staging, because it never reaches this service', () => {
      // Sanity check on the shape of the rule: whatever host is canonical, any
      // OTHER host still 301s to it. Staging simply is not bound to the live
      // domain, so this branch never fires in practice.
      assert.equal(
        resolve({ canonicalHost: STAGING, host: LIVE, urlPath: '/' }),
        `https://${STAGING}/`
      );
    });

    test('the rule still holds: a second staging hostname 301s to the canonical one', () => {
      assert.equal(
        resolve({ canonicalHost: STAGING, host: 'arrington-prototype-staging.up.railway.app', urlPath: '/scott/lead' }),
        `https://${STAGING}/scott/lead`
      );
    });
  });

  describe('non-public deploys must never be indexable', () => {
    // Pointing CANONICAL_HOST at a staging host stops that host redirecting
    // to the live site, which is the point. The cost is that it then serves a
    // complete, crawlable copy of every page: exactly the duplicate-indexing
    // problem the redirect rule was built to prevent. Tom spotted the staging
    // service serving the full Arrington homepage and asked, reasonably,
    // whether the live site had been changed. It had not, but the copy was
    // real and was one crawl away from being indexed.
    const isPublicSite = (canonicalHost) => canonicalHost === LIVE;

    test('overriding the canonical host marks the deploy as not the public site', () => {
      assert.equal(isPublicSite('scott-demo-staging.up.railway.app'), false);
      assert.equal(isPublicSite('some-preview.up.railway.app'), false);
    });

    test('production, with no override, is still the public site', () => {
      assert.equal(isPublicSite(LIVE), true);
    });

    test('server.js derives the flag from CANONICAL_HOST rather than a second variable', () => {
      // A separate opt-in variable would be forgotten exactly once, on the
      // deploy that mattered. Deriving it means overriding the host cannot
      // silently leave indexing on.
      assert.match(
        SERVER_SRC,
        /const IS_PUBLIC_SITE = CANONICAL_HOST === LIVE_PUBLIC_HOST;/,
        'IS_PUBLIC_SITE must be derived from CANONICAL_HOST'
      );
    });

    test('a non-public deploy sends X-Robots-Tag: noindex, nofollow', () => {
      assert.match(
        SERVER_SRC,
        /if \(!IS_PUBLIC_SITE\) res\.set\('X-Robots-Tag', 'noindex, nofollow'\);/,
        'every response on a non-public deploy must carry a noindex header'
      );
    });

    test('a non-public deploy serves a blanket Disallow and no sitemap', () => {
      const robots = SERVER_SRC.slice(
        SERVER_SRC.indexOf("app.get('/robots.txt'"),
        SERVER_SRC.indexOf("app.get('/sitemap.xml'")
      );
      assert.ok(
        robots.includes('if (!IS_PUBLIC_SITE)'),
        'robots.txt must branch on whether this is the public site'
      );
      assert.match(
        robots,
        /User-agent: \*\\nDisallow: \/\\n/,
        'a non-public deploy must disallow all crawling'
      );
      // The blanket-disallow branch must return before the sitemap line.
      const guardAt = robots.indexOf('if (!IS_PUBLIC_SITE)');
      const sitemapAt = robots.indexOf('Sitemap:');
      assert.ok(guardAt !== -1 && sitemapAt !== -1 && guardAt < sitemapAt,
        'the disallow-all branch must return before advertising a sitemap');
    });
  });

  describe('the real server.js wiring', () => {
    test('CANONICAL_HOST reads from the environment and defaults to the live domain', () => {
      assert.match(
        SERVER_SRC,
        /const LIVE_PUBLIC_HOST = 'www\.arringtonconsultancy\.com';/,
        'the live domain must stay pinned as a literal'
      );
      assert.match(
        SERVER_SRC,
        /const CANONICAL_HOST = \(process\.env\.CANONICAL_HOST \|\| LIVE_PUBLIC_HOST\)/,
        'server.js must fall back to the live domain when the env var is unset'
      );
    });

    test('the value is normalised, so a stray space or capital does not break matching', () => {
      // req.header('host') is lowercased before comparison, so the configured
      // value has to be too or the service redirects to itself forever.
      const decl = SERVER_SRC.slice(SERVER_SRC.indexOf('const CANONICAL_HOST'), SERVER_SRC.indexOf('const isInternalHost'));
      assert.ok(decl.includes('.trim()'), 'CANONICAL_HOST should be trimmed');
      assert.ok(decl.includes('.toLowerCase()'), 'CANONICAL_HOST should be lowercased');
    });
  });
});
