// The site's one Google tag (AW-18129914078).
//
// Google allows one Google tag per page. Before this test the tag was pasted
// separately into eighteen templates, which is how a second copy arrives
// unnoticed. It now lives in views/partials/google-tag.ejs, included as the
// first thing inside <head>, and this test holds all of that in place.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const views = path.join(__dirname, '..', 'views');
const read = (p) => fs.readFileSync(path.join(views, p), 'utf8');
const INCLUDE = "<%- include('partials/google-tag') %>";
const LOADER = 'googletagmanager.com/gtag/js?id=AW-18129914078';
const CONFIG = "gtag('config', 'AW-18129914078')";

const PUBLIC_VIEWS = fs.readdirSync(views).filter((f) => f.endsWith('.ejs'));
const PRIVATE_DIRS = ['scott', 'workspace'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

test('every public page includes the tag once, as the first thing inside <head>', () => {
  for (const f of PUBLIC_VIEWS) {
    const src = read(f);
    assert.strictEqual(src.split(INCLUDE).length - 1, 1, `${f}: include count`);
    assert.match(src, /<head>\n[ \t]*<%- include\('partials\/google-tag'\) %>\n/, `${f}: not immediately after <head>`);
  }
});

test('no template carries its own copy of the loader or the config call', () => {
  for (const file of walk(views)) {
    const rel = path.relative(views, file);
    if (rel === path.join('partials', 'google-tag.ejs')) continue;
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!src.includes(LOADER), `${rel} has its own gtag.js loader`);
    assert.ok(!src.includes(CONFIG), `${rel} has its own AW config call`);
  }
});

test('the Scott portal and the Workspace carry no Google tag', () => {
  for (const dir of PRIVATE_DIRS) {
    for (const file of walk(path.join(views, dir))) {
      assert.ok(!fs.readFileSync(file, 'utf8').includes('google-tag'), path.relative(views, file));
    }
  }
});

test("the partial is Google Ads' snippet verbatim, plus only the CSP nonce", () => {
  const google = [
    '<!-- Google tag (gtag.js) -->',
    '<script async src="https://www.googletagmanager.com/gtag/js?id=AW-18129914078"></script>',
    '<script>',
    '  window.dataLayer = window.dataLayer || [];',
    '  function gtag(){dataLayer.push(arguments);}',
    "  gtag('js', new Date());",
    '',
    "  gtag('config', 'AW-18129914078');",
    '</script>'
  ].join('\n');
  const partial = read('partials/google-tag.ejs');
  assert.ok(partial.startsWith(google.replace('<script>', '<script nonce="<%= nonce %>">')));
});

test('rendered, the tag appears exactly once and GA4 only when configured', () => {
  const file = path.join(views, 'partials', 'google-tag.ejs');
  const without = ejs.render(fs.readFileSync(file, 'utf8'), { nonce: 'n' }, { filename: file });
  assert.strictEqual(without.split(LOADER).length - 1, 1);
  assert.strictEqual(without.split(CONFIG).length - 1, 1);
  assert.ok(!/G-/.test(without));
  assert.ok(!without.includes('SITE\'S ONE GOOGLE TAG'), 'the EJS comment must not render');
  const withGa4 = ejs.render(fs.readFileSync(file, 'utf8'), { nonce: 'n', ga4Id: 'G-TEST123' }, { filename: file });
  assert.strictEqual(withGa4.split(LOADER).length - 1, 1);
  assert.match(withGa4, /gtag\('config', 'G-TEST123'\)/);
  for (const tag of withGa4.match(/<script(?![^>]*\bsrc=)[^>]*>/g)) {
    assert.match(tag, /nonce="n"/, 'every inline script carries the nonce');
  }
});
