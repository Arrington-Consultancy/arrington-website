const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  CANONICAL_ORIGIN,
  buildCanonicalPageUrl,
  buildRobotsTxt,
  getCanonicalRedirectLocation,
  isAllowedCanonicalOverride,
  resolveCanonicalForPage
} = require('../lib/canonicalHost');

describe('canonical host redirects', () => {
  test('redirects .com apex to canonical host with 301 target URL', () => {
    const location = getCanonicalRedirectLocation({
      hostHeader: 'arringtonconsultancy.com',
      forwardedProto: 'https',
      url: '/about-us',
      isProd: true
    });
    assert.equal(location, 'https://www.arringtonconsultancy.com/about-us');
  });

  test('redirects .co.uk apex and www to canonical host, preserving query string', () => {
    const apexLocation = getCanonicalRedirectLocation({
      hostHeader: 'arringtonconsultancy.co.uk',
      forwardedProto: 'https',
      url: '/owner-check?utm_source=google&x=1',
      isProd: true
    });
    assert.equal(apexLocation, 'https://www.arringtonconsultancy.com/owner-check?utm_source=google&x=1');

    const wwwLocation = getCanonicalRedirectLocation({
      hostHeader: 'www.arringtonconsultancy.co.uk',
      forwardedProto: 'https',
      url: '/evidence?ref=fb',
      isProd: true
    });
    assert.equal(wwwLocation, 'https://www.arringtonconsultancy.com/evidence?ref=fb');
  });

  test('does not redirect Railway preview hosts or localhost', () => {
    const preview = getCanonicalRedirectLocation({
      hostHeader: 'arrington-prototype-production.up.railway.app',
      forwardedProto: 'http',
      url: '/x',
      isProd: true
    });
    assert.equal(preview, null);

    const localhost = getCanonicalRedirectLocation({
      hostHeader: 'localhost:3000',
      forwardedProto: 'http',
      url: '/x',
      isProd: true
    });
    assert.equal(localhost, null);
  });
});

describe('canonical URL generation', () => {
  test('builds canonical page URLs on the canonical origin for flat and nested routes', () => {
    assert.equal(buildCanonicalPageUrl({ slug: 'main' }), `${CANONICAL_ORIGIN}/`);
    assert.equal(buildCanonicalPageUrl({ slug: 'about-us' }), `${CANONICAL_ORIGIN}/about-us`);
    assert.equal(
      buildCanonicalPageUrl({ slug: 'a-profitable-job', isUsefulThinkingArticle: true }),
      `${CANONICAL_ORIGIN}/useful-thinking/a-profitable-job`
    );
  });

  test('fallback canonical uses canonical origin, and root-relative overrides resolve on canonical origin', () => {
    assert.equal(
      resolveCanonicalForPage({ pageCanonical: '', slug: 'what-we-do' }),
      `${CANONICAL_ORIGIN}/what-we-do`
    );
    assert.equal(
      resolveCanonicalForPage({ pageCanonical: '/custom-path', slug: 'what-we-do' }),
      `${CANONICAL_ORIGIN}/custom-path`
    );
  });
});

describe('robots and canonical override validation', () => {
  test('robots.txt always references canonical sitemap', () => {
    const robots = buildRobotsTxt();
    assert.match(robots, new RegExp(`Sitemap: ${CANONICAL_ORIGIN.replace('.', '\\.')}/sitemap\\.xml`));
  });

  test('canonical override validation only accepts root-relative or canonical-origin absolute URLs', () => {
    assert.equal(isAllowedCanonicalOverride(''), true);
    assert.equal(isAllowedCanonicalOverride('/evidence'), true);
    assert.equal(isAllowedCanonicalOverride('https://www.arringtonconsultancy.com/evidence'), true);
    assert.equal(isAllowedCanonicalOverride('http://www.arringtonconsultancy.com/evidence'), false);
    assert.equal(isAllowedCanonicalOverride('https://arringtonconsultancy.com/evidence'), false);
    assert.equal(isAllowedCanonicalOverride('https://example.com/x'), false);
  });
});
