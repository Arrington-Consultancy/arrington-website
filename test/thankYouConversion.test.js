// /thank-you and the Google Ads Contact conversion.
//
// The property: the Contact conversion fires once per stored enquiry, on
// /thank-you, and never from a refresh, a direct visit, a forged link or a
// failed submission. The browser half of that (redirect behaviour, refresh,
// back button, honeypot) was verified in a real browser; these tests pin the
// pieces a later edit could quietly undo.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { issueToken, verifyToken, TTL_MS } = require('../lib/contactConversion');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const LABEL = 'AW-18129914078/vCKKCKjSna0cEN6RgsVD';
const KEY = 'test-key';
const noComments = (s) => s.replace(/<%#[\s\S]*?%>/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('a token the server issued verifies, and yields the id used as transaction_id', () => {
  const t = issueToken({ now: 1_000_000_000_000, key: KEY });
  const v = verifyToken(t, { now: 1_000_000_000_000 + 1000, key: KEY });
  assert.ok(v);
  assert.strictEqual(v.id, t.split('.')[0]);
  assert.match(v.id, /^[A-Za-z0-9_-]+$/);
});

test('tampered, expired, forged, wrong-key and non-string tokens are all refused', () => {
  const now = 1_000_000_000_000;
  const t = issueToken({ now, key: KEY });
  const [id, exp, sig] = t.split('.');
  const flip = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
  assert.strictEqual(verifyToken(`${id}.${exp}.${flip}`, { now, key: KEY }), null);
  assert.strictEqual(verifyToken(`${id}.${Number(exp) + 1}.${sig}`, { now, key: KEY }), null);
  assert.strictEqual(verifyToken(t, { now: now + TTL_MS + 1, key: KEY }), null);
  assert.strictEqual(verifyToken(t, { now, key: 'another-key' }), null);
  assert.strictEqual(verifyToken('A'.repeat(16) + '.9999999999999.' + '0'.repeat(64), { now, key: KEY }), null);
  for (const bad of [undefined, null, '', 'abc', [t], { t }, 42, `${t}x`, `<script>.${exp}.${sig}`]) {
    assert.strictEqual(verifyToken(bad, { now, key: KEY }), null, String(bad));
  }
});

async function renderThankYou(conversion) {
  const file = path.join(root, 'views', 'thank-you.ejs');
  const themes = require('../db/themes');
  return ejs.renderFile(file, {
    nonce: 'n', csrfToken: 'c', ga4Id: '', theme: themes.dark, navPages: [], content: {},
    pageContact: { heading: 'h', body: 'b', label: '', headerCtaText: 'Start a conversation', submitText: 'Send', messagePlaceholder: 'm' },
    heardAboutOptions: [], conversion
  });
}

test('the page renders the conversion only for a verified token, with its transaction_id', async () => {
  const bare = await renderThankYou(null);
  assert.ok(!bare.includes(LABEL), 'a bare visit must carry no conversion snippet');
  const withId = await renderThankYou({ id: 'Abc_def-0123456789' });
  assert.strictEqual(withId.split(LABEL).length - 1, 1, 'exactly one conversion call');
  assert.match(withId, /'transaction_id': id/);
  assert.match(withId, /var id = 'Abc_def-0123456789'/);
  // The refresh guards: a spent list, and the token dropped from the address.
  assert.match(withId, /arrContactConversionsSent/);
  assert.match(withId, /history\.replaceState\(null, '', '\/thank-you'\)/);
});

test('the base Google tag is on the page once, not duplicated', async () => {
  const html = await renderThankYou({ id: 'Abc_def-0123456789' });
  assert.strictEqual(html.split('googletagmanager.com/gtag/js?id=AW-18129914078').length - 1, 1);
  assert.strictEqual(html.split("gtag('config', 'AW-18129914078')").length - 1, 1);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
});

test('neither copy of the site chrome script fires the Contact conversion on the form page any more', () => {
  for (const f of ['views/partials/site-chrome-script.ejs', 'views/index.ejs']) {
    const src = noComments(read(f));
    assert.ok(!src.includes('vCKKCKjSna0cEN6RgsVD'), `${f} still fires the Contact conversion itself`);
    // It redirects to the server's tokened URL, validated, with a bare fallback.
    assert.match(src, /\/\^\\\/thank-you\\\?c=\[A-Za-z0-9\._-\]\+\$\/\.test\(result\.thankYou\)/, f);
    assert.match(src, /location\.assign\(next\)/, f);
    // The click conversion is a different action and must be untouched.
    assert.ok(src.includes('AW-18129914078/h_2rCJeH8aYcEN6RgsVD'), `${f} lost the contact-click conversion`);
  }
});

test('the redirect happens only after a successful response', () => {
  for (const f of ['views/partials/site-chrome-script.ejs', 'views/index.ejs']) {
    const src = noComments(read(f));
    const start = src.indexOf("fetch('/api/leads'");
    const okCheck = src.indexOf("if (!res.ok) throw", start);
    const assign = src.indexOf('location.assign(next)', start);
    const catchAt = src.indexOf('} catch (err) {', start);
    assert.ok(start > 0 && okCheck > start && assign > okCheck && catchAt > assign, f);
    // The button is re-enabled only on failure, so a success cannot be sent twice.
    const tail = src.slice(catchAt, src.indexOf('});', catchAt));
    assert.match(tail, /btn\.disabled = false/, f);
    assert.ok(!/finally\s*\{\s*btn\.disabled = false/.test(src.slice(start, start + 4000)), f);
  }
});

test('the lead route issues a token only after storing the enquiry, and never on the honeypot', () => {
  const src = read('routes/leads.js');
  const route = src.slice(src.indexOf("router.post('/api/leads'"), src.indexOf("router.post('/api/documents/request'"));
  const honeypot = route.indexOf('plainText(body.website)');
  const insert = route.indexOf('INSERT INTO leads');
  const issue = route.indexOf('issueToken()');
  assert.ok(honeypot > 0 && insert > honeypot && issue > insert);
  assert.strictEqual(route.split('issueToken()').length - 1, 1);
  const honeypotBlock = route.slice(honeypot, route.indexOf('}', honeypot));
  assert.ok(!honeypotBlock.includes('thankYou'));
});

test('/thank-you is registered ahead of the CMS catch-all, reserved, and not cacheable or indexable', () => {
  const server = read('server.js');
  const mount = server.indexOf('thankYou.mountPageRoute(app');
  const catchAll = server.indexOf("app.get('/:slug'");
  assert.ok(mount > 0 && catchAll > mount);
  const routeSrc = read('routes/thankYou.js');
  assert.match(routeSrc, /res\.set\('Cache-Control', 'no-store'\)/);
  assert.match(routeSrc, /res\.set\('X-Robots-Tag', 'noindex, nofollow'\)/);
  assert.match(routeSrc, /conversion: verifyToken\(req\.query\.c\)/);
  assert.match(read('routes/admin.js'), /RESERVED_SLUGS = \[[^\]]*'thank-you'/);
});
