// The Continue with Google prefill (views/partials/google-prefill.ejs).
//
// The whole feature is gated on GOOGLE_SIGNIN_CLIENT_ID: unset means the
// partial renders nothing and the CSP carries no Google Identity hosts.
// These tests render the partial directly with ejs, both ways.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const ejs = require('ejs');

const viewsDir = path.join(__dirname, '..', 'views');
const partial = path.join(viewsDir, 'partials', 'google-prefill.ejs');

function render(locals) {
  return ejs.render(fs.readFileSync(partial, 'utf8'), locals, { filename: partial });
}

test('renders nothing at all when the client ID is unset', () => {
  for (const value of ['', undefined]) {
    const html = render({ googleSigninClientId: value, nonce: 'abc', gpTargets: { email: '#e' } });
    assert.equal(html.trim(), '', 'unconfigured deploys must not carry the button or the Google script');
  }
});

test('renders the button, the Google script loader and the targets when configured', () => {
  const html = render({
    googleSigninClientId: 'test-client-id.apps.googleusercontent.com',
    nonce: 'abc123',
    gpTargets: { fullName: '#pg-name', email: '#pg-email' }
  });
  assert.match(html, /accounts\.google\.com\/gsi\/client/);
  assert.match(html, /g-prefill-btn/);
  assert.match(html, /test-client-id\.apps\.googleusercontent\.com/);
  assert.match(html, /#pg-name/);
  assert.match(html, /#pg-email/);
  assert.match(html, /nonce="abc123"/);
});

test('the four public checks include the partial with page-correct field targets', () => {
  const expectations = {
    'product-guide.ejs': ['#pg-name', '#pg-email'],
    'market-ready-test.ejs': ['#mrt-firstName', '#mrt-lastName', '#mrt-email'],
    'owner-dependency-quiz.ejs': ['#odr-email-input'],
    'commercial-gaps-review.ejs': ['#cgr-name', '#cgr-email']
  };
  for (const [file, targets] of Object.entries(expectations)) {
    const src = fs.readFileSync(path.join(viewsDir, file), 'utf8');
    const line = src.split('\n').find((l) => l.includes("include('partials/google-prefill'"));
    assert.ok(line, `${file} must include the google-prefill partial`);
    for (const t of targets) {
      assert.ok(line.includes(`'${t}'`), `${file}'s prefill targets must name ${t}`);
    }
  }
});

test('never fills a field the visitor already typed into', () => {
  // The partial's fill() bails when el.value is truthy. Assert the guard
  // is present in the source so a rewrite cannot silently drop it: a
  // one-tap that overwrites typed input would be worse than no button.
  const src = fs.readFileSync(partial, 'utf8');
  assert.match(src, /if \(!el \|\| el\.value\) return;/);
});
