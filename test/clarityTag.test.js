// Microsoft Clarity (01/10/2026): gated on CLARITY_PROJECT_ID, nonced,
// rides on the Google tag partial so it reaches every public page and no
// login-only area, with the CSP hosts gated on the same variable.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const views = path.join(root, 'views');
const tagFile = path.join(views, 'partials', 'google-tag.ejs');
const render = (locals) => ejs.render(fs.readFileSync(tagFile, 'utf8'), locals, { filename: tagFile });

test('unset: no Clarity script, nothing that names clarity.ms in the page', () => {
  const html = render({ nonce: 'n' });
  assert.ok(!/clarity/i.test(html), 'no clarity text renders when unconfigured');
});

test('set: one nonced inline script loading the tag for exactly that id', () => {
  const html = render({ nonce: 'n', clarityProjectId: 'abc123xyz9' });
  assert.strictEqual(html.split('www.clarity.ms/tag/').length - 1, 1);
  assert.match(html, /"clarity", "script", "abc123xyz9"/);
  for (const tag of html.match(/<script(?![^>]*\bsrc=)[^>]*>/g)) {
    assert.match(tag, /nonce="n"/, 'every inline script carries the nonce');
  }
  assert.ok(!html.includes('Microsoft Clarity (session recordings'), 'the EJS comment must not render');
});

test('server.js validates the id and gates every Clarity CSP host on it', () => {
  const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(src, /app\.locals\.clarityProjectId = \/\^\[a-z0-9\]\{4,32\}\$\/\.test\(clarityProjectId\)/);
  const lines = src.split('\n').filter((l) => l.includes('clarity.ms') && !l.trim().startsWith('//'));
  assert.ok(lines.length >= 3, 'script, img and connect lists carry Clarity hosts');
  for (const l of lines) assert.match(l, /app\.locals\.clarityProjectId \?/, `ungated Clarity host: ${l.trim()}`);
  assert.ok(src.match(/scriptSrc: \[[\s\S]*?scripts\.clarity\.ms[\s\S]*?\n      \]/));
  assert.ok(src.match(/connectSrc: \[[\s\S]*?\*\.clarity\.ms[\s\S]*?\n      \]/));
  assert.ok(src.match(/imgSrc: \[[\s\S]*?\*\.clarity\.ms[\s\S]*?\n      \]/));
});

test('the id reaches the view through app.locals, and no view passes it by hand', () => {
  const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(src, /app\.locals\.clarityProjectId =/);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of [...walk(path.join(root, 'routes')), ...walk(views)]) {
    const s = fs.readFileSync(f, 'utf8');
    if (f.endsWith('clarity-tag.ejs') || f.endsWith('google-tag.ejs')) continue;
    assert.ok(!s.includes('clarityProjectId'), `${path.relative(root, f)} should not thread clarityProjectId`);
  }
});

test('Scott and the Workspace never include the Clarity partial', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const dir of ['scott', 'workspace']) {
    for (const f of walk(path.join(views, dir))) {
      assert.ok(!fs.readFileSync(f, 'utf8').includes('clarity-tag'), path.relative(views, f));
    }
  }
});

test('the Privacy page describes Clarity and the input masking', () => {
  const s = fs.readFileSync(path.join(views, 'privacy.ejs'), 'utf8');
  assert.match(s, /Microsoft Clarity/);
  assert.match(s, /masked/);
});

// Paid Google Ads visits are tagged in Clarity (12/10/2026). Runs the
// rendered script against a stub page, so the behaviour is tested, not the text.
const vm = require('node:vm');
function runTag(search, store = {}) {
  const html = render({ nonce: 'n', clarityProjectId: 'abc123xyz9' });
  const code = [...html.matchAll(/<script nonce="n">([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('clarity.ms/tag'));
  const calls = [];
  const el = { parentNode: { insertBefore() {} } };
  const win = {
    location: { search },
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    URLSearchParams,
    document: { createElement: () => ({}), getElementsByTagName: () => [el] },
  };
  win.window = win;
  vm.runInNewContext(code, win);
  for (const a of (win.clarity && win.clarity.q) || []) calls.push([...a]);
  return { calls, store };
}

test('a Google Ads click is tagged google_ads, and the click id itself is never sent', () => {
  const { calls, store } = runTag('?gclid=SECRETCLICK123');
  assert.deepStrictEqual(calls, [['set', 'traffic', 'google_ads']]);
  assert.ok(!JSON.stringify(calls).includes('SECRETCLICK123'));
  assert.strictEqual(store.arrPaidGoogle, '1');
});

test('later pages of the same visit stay tagged; other traffic is never tagged', () => {
  assert.deepStrictEqual(runTag('', { arrPaidGoogle: '1' }).calls, [['set', 'traffic', 'google_ads']]);
  assert.deepStrictEqual(runTag('?utm_source=google&utm_medium=cpc&utm_campaign=Taxi-Search').calls, [['set', 'traffic', 'google_ads']]);
  assert.deepStrictEqual(runTag('?wbraid=x').calls, [['set', 'traffic', 'google_ads']]);
  assert.deepStrictEqual(runTag('').calls, []);
  assert.deepStrictEqual(runTag('?utm_source=bing&utm_medium=cpc').calls, []);
  assert.deepStrictEqual(runTag('?utm_source=google&utm_medium=organic').calls, []);
});
