// Retired-URL redirects keep the query string, so a Google Ads click id or
// campaign tags survive a visitor landing on an old address (26/09/2026).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { legacyRedirect, withQuery } = require('../lib/legacyRedirect');

function run(target, originalUrl) {
  let sent = null;
  const res = { redirect: (status, loc) => { sent = { status, loc }; } };
  legacyRedirect(target)({ originalUrl }, res);
  return sent;
}

test('the query string survives, and goes before any #fragment', () => {
  assert.deepEqual(run('/evidence', '/what-we-have-done?gclid=abc&utm_source=google'),
    { status: 301, loc: '/evidence?gclid=abc&utm_source=google' });
  assert.deepEqual(run('/evidence#documents', '/what-the-work-looks-like?gclid=abc'),
    { status: 301, loc: '/evidence?gclid=abc#documents' });
  assert.deepEqual(run('/#conversation', '/contact?utm_campaign=x'),
    { status: 301, loc: '/?utm_campaign=x#conversation' });
});

test('with no query the target is unchanged', () => {
  assert.deepEqual(run('/about-us', '/about'), { status: 301, loc: '/about-us' });
  assert.equal(withQuery('/evidence#googlereviews', ''), '/evidence#googlereviews');
});

test('every fixed-target public redirect in server.js goes through the helper', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  for (const p of ['/owner-dependency-review', '/what-we-have-done', '/what-the-work-looks-like',
    '/what-business-owners-say', '/30-minute-conversation', '/about', '/contact']) {
    assert.match(src, new RegExp(`app\\.get\\('${p.replace(/\//g, '\\/')}', legacyRedirect\\(`), p);
  }
  // No redirect to a hard-coded page path is left that would drop the query,
  // other than the retired /v1.html page and the /staff login hop.
  const fixed = src.match(/res\.redirect\(301, '\/[^']*'\)/g) || [];
  assert.deepEqual(fixed, ["res.redirect(301, '/')"], JSON.stringify(fixed));
});
