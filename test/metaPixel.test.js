// Meta pixel (03/10/2026): gated on META_PIXEL_ID, nonced, rides on the
// Google tag partial so it reaches every public page and no login-only
// area, with the Facebook CSP hosts gated on the same variable, and the
// Lead event confined to the thank-you page's stored-enquiry branch.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const views = path.join(root, 'views');
const tagFile = path.join(views, 'partials', 'google-tag.ejs');
const render = (locals) => ejs.render(fs.readFileSync(tagFile, 'utf8'), locals, { filename: tagFile });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

test('unset: nothing that names facebook or fbq renders', () => {
  const html = render({ nonce: 'n' });
  assert.ok(!/facebook|fbq/i.test(html));
});

test('set: one nonced init for exactly that id, a PageView, no inline style attribute', () => {
  const html = render({ nonce: 'n', metaPixelId: '4580412922274063' });
  assert.strictEqual(html.split("fbq('init', '4580412922274063')").length - 1, 1);
  assert.strictEqual(html.split("fbq('track', 'PageView')").length - 1, 1);
  assert.match(html, /facebook\.com\/tr\?id=4580412922274063&ev=PageView&noscript=1/);
  for (const tag of html.match(/<script(?![^>]*\bsrc=)[^>]*>/g)) {
    assert.match(tag, /nonce="n"/, 'every inline script carries the nonce');
  }
  assert.ok(!/style="/.test(html), 'the strict CSP refuses inline style attributes');
  assert.ok(!html.includes('Meta pixel (03/10/2026'), 'the EJS comment must not render');
});

test('server.js validates the id to digits and gates every Facebook CSP host on it', () => {
  const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(src, /app\.locals\.metaPixelId = \/\^\[0-9\]\{10,20\}\$\/\.test\(metaPixelId\)/);
  const lines = src.split('\n').filter((l) => /facebook\.(net|com)/.test(l) && !l.trim().startsWith('//'));
  assert.strictEqual(lines.length, 3, 'script, img and connect lists carry one Facebook host each');
  for (const l of lines) assert.match(l, /app\.locals\.metaPixelId \?/, `ungated Facebook host: ${l.trim()}`);
  assert.ok(src.match(/scriptSrc: \[[\s\S]*?connect\.facebook\.net[\s\S]*?\n      \]/));
  assert.ok(src.match(/imgSrc: \[[\s\S]*?www\.facebook\.com[\s\S]*?\n      \]/));
  assert.ok(src.match(/connectSrc: \[[\s\S]*?www\.facebook\.com[\s\S]*?\n      \]/));
});

test('the id reaches the view through app.locals, and no view passes it by hand', () => {
  for (const f of [...walk(path.join(root, 'routes')), ...walk(views)]) {
    if (f.endsWith('meta-pixel.ejs') || f.endsWith('google-tag.ejs')) continue;
    assert.ok(!fs.readFileSync(f, 'utf8').includes('metaPixelId'), `${path.relative(root, f)} should not thread metaPixelId`);
  }
});

test('Scott and the Workspace never include the pixel partial', () => {
  for (const dir of ['scott', 'workspace']) {
    for (const f of walk(path.join(views, dir))) {
      assert.ok(!fs.readFileSync(f, 'utf8').includes('meta-pixel'), path.relative(views, f));
    }
  }
});

test('the Lead event lives only on the thank-you page, inside the stored-enquiry branch, guarded on fbq', () => {
  const hits = walk(views).filter((f) => /fbq\('track', 'Lead'/.test(fs.readFileSync(f, 'utf8')));
  assert.deepStrictEqual(hits.map((f) => path.relative(views, f)), ['thank-you.ejs']);
  const s = fs.readFileSync(path.join(views, 'thank-you.ejs'), 'utf8');
  const start = s.indexOf('<% if (conversion) { %>');
  const end = s.indexOf('<% } %>', start);
  const branch = s.slice(start, end);
  assert.match(branch, /typeof fbq === 'function'/);
  assert.match(branch, /fbq\('track', 'Lead', \{\}, \{ eventID: id \}\)/);
  assert.ok(s.indexOf("fbq('track', 'Lead'") > s.indexOf("gtag('event', 'conversion'"), 'inside the same once-per-token guard as the Google conversion');
});

test('the Privacy page describes the pixel and says no such adverts run at present', () => {
  const s = fs.readFileSync(path.join(views, 'privacy.ejs'), 'utf8');
  assert.match(s, /Meta \(Facebook\) pixel/);
  assert.match(s, /does not receive your name, email/);
  assert.match(s, /do not run such adverts at present/);
});
