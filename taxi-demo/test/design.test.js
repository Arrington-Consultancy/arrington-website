'use strict';
// The design rules Tom set on 15/10/2026 after rejecting two versions, pinned
// so the next change cannot quietly undo them: no serif anywhere, one self
// hosted typeface, a headline of its own on every page, the pictures named
// for what they are, and nothing inline that the content security policy
// would refuse.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../server');
const { createDispatch } = require('../lib/dispatch');

const PUBLIC = path.join(__dirname, '..', 'public');
const css = fs.readFileSync(path.join(PUBLIC, 'site.css'), 'utf8');

test('no serif or slab serif face anywhere in the stylesheet', () => {
  const families = [...css.matchAll(/font-family\s*:\s*([^;}]+)/g)].map((m) => m[1]);
  assert.ok(families.length >= 2, 'expected to find font-family declarations');
  for (const f of families) {
    const named = f.replace(/\bsans-serif\b/g, '');
    assert.doesNotMatch(named, /serif|Georgia|Times|Fraunces|Playfair|Garamond|Merriweather|Lora|Cambria|Rockwell|Roboto Slab/i, `serif face in: ${f}`);
  }
  assert.doesNotMatch(css, /Fraunces|Instrument Sans/, 'the old faces are gone');
});

test('one typeface, self hosted with its licence, and the figures line up where prices are read', () => {
  const faces = [...css.matchAll(/@font-face\s*{[^}]*font-family:\s*'([^']+)'[^}]*url\(([^)]+)\)/g)];
  assert.equal(faces.length, 1);
  assert.equal(faces[0][1], 'Schibsted Grotesk');
  assert.ok(fs.existsSync(path.join(PUBLIC, faces[0][2].trim())), 'the woff2 file is in public/fonts');
  const dir = fs.readdirSync(path.join(PUBLIC, 'fonts'));
  assert.deepEqual(dir.filter((f) => f.endsWith('.woff2')), ['schibsted-grotesk.woff2']);
  assert.match(fs.readFileSync(path.join(PUBLIC, 'fonts', 'OFL.txt'), 'utf8'), /Schibsted Grotesk: Copyright/);
  for (const sel of ['.board-price', '.prices td', '.ref strong', '.reg', '.stats strong']) {
    const rule = new RegExp(sel.replace(/[.]/g, '\\.') + '[^{]*{[^}]*tabular-nums');
    assert.match(css, rule, `${sel} should use tabular figures`);
  }
});

let server;
let base;
test.before(async () => {
  server = createApp({ dispatch: createDispatch('mock', { confirmAfterMs: 40, allocateAfterMs: 120 }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));

const PAGES = ['/', '/book', '/airports', '/accounts', '/about', '/contact', '/no-such-road'];

test('every page has exactly one h1, and no two pages share one', async () => {
  const seen = new Map();
  for (const p of PAGES) {
    const html = await (await fetch(base + p)).text();
    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
    assert.equal(h1s.length, 1, `${p} has ${h1s.length} h1 elements`);
    assert.ok(!seen.has(h1s[0]), `${p} repeats the headline of ${seen.get(h1s[0])}: "${h1s[0]}"`);
    seen.set(h1s[0], p);
  }
});

test('nothing inline that the content security policy refuses, on any page', async () => {
  for (const p of PAGES) {
    const html = await (await fetch(base + p)).text();
    assert.doesNotMatch(html, /\sstyle="/, `${p} carries a style attribute`);
    assert.doesNotMatch(html, /<script(?![^>]*(src=|type="application\/ld\+json"))/, `${p} carries an inline script`);
    assert.doesNotMatch(html, /<link[^>]+rel="(stylesheet|preload)"[^>]+href="https?:\/\//, `${p} loads a stylesheet or font from elsewhere`);
  }
});

test('the pictures: the hero eager and preloaded, the rest lazy, all sized, all honestly described', async () => {
  const home = await (await fetch(base + '/')).text();
  const imgs = [...home.matchAll(/<img [^>]+>/g)].map((m) => m[0]);
  assert.ok(imgs.length >= 3, 'the home page carries the photographs');
  assert.equal(imgs.filter((i) => /fetchpriority="high"/.test(i)).length, 1, 'exactly one eager picture on the home page');
  assert.ok(imgs.filter((i) => /loading="lazy"/.test(i)).length === imgs.length - 1, 'everything else is lazy');
  assert.match(home, /<link rel="preload" as="image" imagesrcset="[^"]*hero-exmouth[^"]*"/);
  for (const i of imgs) {
    assert.match(i, / width="\d+" height="\d+"/, `sized so nothing shifts: ${i}`);
    assert.match(i, / alt="/, `has an alt attribute: ${i}`);
    assert.doesNotMatch(i, /alt="[^"]*\b(our|Tidewell)\b/i, `the alt text must not claim a real car, driver or fleet: ${i}`);
  }
  for (const p of PAGES) {
    const html = await (await fetch(base + p)).text();
    assert.match(html, /AI-generated illustrations, not photographs of a real fleet/, `${p} says what the pictures are`);
  }
});

test('the demo ribbon is one line on a phone and the full sentence on a wider screen', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /<span class="ribbon-short">Demo site\.<\/span>/);
  assert.match(html, /<span class="ribbon-short">No car will come\.<\/span>/);
  assert.match(html, /<span class="ribbon-long">Demonstration site\.<\/span>/);
  assert.match(css, /\.ribbon p {[^}]*min-height: 40px/);
});

test('the ribbon carries a button back to Arrington, after the honesty line and never in place of it', async () => {
  const { FIRM } = require('../lib/firm');
  assert.equal(FIRM.arringtonEnquiryUrl, FIRM.arringtonUrl + '#conversation');
  for (const p of ['/', '/book', '/airports', '/accounts', '/about', '/contact']) {
    const html = await (await fetch(base + p)).text();
    const ribbon = /<div class="ribbon" role="note">([\s\S]*?)<\/div>/.exec(html)[1];
    const button = '<a class="ribbon-cta" href="https://www.arringtonconsultancy.com/taxi-and-private-hire-operators/websites#conversation"><span class="ribbon-long">Want a site like this? Talk to Arrington</span><span class="ribbon-short">Want one? Talk to Arrington</span></a>';
    assert.ok(ribbon.includes(button), `${p} ribbon button`);
    assert.ok(ribbon.indexOf('No car will come.') < ribbon.indexOf('ribbon-cta'), `${p} honesty line comes first`);
    assert.match(ribbon, /no car will come\.<\/span>/, `${p} keeps the full honesty line`);
    assert.match(html, /<footer[\s\S]*Built by Arrington Consultancy<\/a>/, `${p} footer keeps its credit`);
  }
  assert.match(css, /\.ribbon-cta {[^}]*background: var\(--red\)/);
});

test('a booking confirmation offers the way back to Arrington under the status card, with no phone number', async () => {
  const { FIRM } = require('../lib/firm');
  const post = (body) => fetch(base + '/book', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
  const good = { pickup: 'Exmouth railway station', destination: 'Exeter Airport', when: 'now', passengers: '1', luggage: '0', vehicle: 'saloon', name: 'Tom Test', phone: '07700 900123', payment: 'card' };
  const page = await (await fetch(base + (await post(good)).headers.get('location'))).text();
  const status = page.indexOf('data-status ');
  const panelAt = page.indexOf('data-arrington');
  assert.ok(status > -1 && panelAt > status, 'panel sits after the status card');
  assert.ok(panelAt < page.indexOf('About this demo'), 'and before the demo note');
  const panel = /<div class="arrington-panel" data-arrington>([\s\S]*?)<\/div>/.exec(page)[1];
  assert.match(panel, /<p class="arrington-label">Built by Arrington Consultancy<\/p>/);
  assert.match(panel, /<h2>Want this for your firm\?<\/h2>/);
  assert.match(panel, /That booking went from this website straight into a dispatch system, and dispatch allocated the car\. We build websites that do the same for taxi and private hire firms for £999\. Bookings go into your own dispatch system where it has a booking API, so nobody in the office has to key them in\./);
  assert.ok(panel.includes(`<a class="btn btn-primary" href="${FIRM.arringtonEnquiryUrl}">Tell us about your firm</a>`));
  assert.doesNotMatch(panel, /<img|<svg|\btel:|\d{4} ?\d{6}/, 'no logo, no phone number');
  const demoCard = /<div class="card demo-card">([\s\S]*?)<\/div>/.exec(page)[1];
  assert.doesNotMatch(demoCard, /<a /, 'the demo note no longer carries its own link');
  // A booking for later is confirmed, never allocated, so the panel must not
  // say a car was allocated.
  const later = new Date(Date.now() + 3 * 864e5);
  const ymd = later.toISOString().slice(0, 10);
  const res = await post({ ...good, when: 'later', date: ymd, time: '10:30' });
  if (res.status === 303) {
    const laterPage = await (await fetch(base + res.headers.get('location'))).text();
    assert.match(laterPage, /straight into a dispatch system, and dispatch sent back its reference\./);
    assert.doesNotMatch(laterPage, /dispatch allocated the car/);
  } else {
    assert.fail(`a booking for later was refused (${res.status}); check the field names the form uses`);
  }
  assert.match(css, /\.arrington-panel {[^}]*background: var\(--night\)/);
});

test('the firm runs both kinds of car, and the totals add up', async () => {
  const { FIRM } = require('../lib/firm');
  assert.equal(FIRM.taxis + FIRM.privateHire, FIRM.fleet);
  const home = await (await fetch(base + '/')).text();
  assert.match(home, /Taxis on the ranks and private hire cars to book/);
  const about = await (await fetch(base + '/about')).text();
  assert.match(about, /30 hackney carriage taxis, with roof lights/);
  assert.match(about, /18 private hire cars, booked in advance/);
  assert.match(about, /licensed by the council/);
  assert.doesNotMatch(about, /East Devon District Council|Exeter City Council/, 'no real council is named');
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(home)[1]);
  assert.equal(ld['@type'], 'TaxiService');
  assert.match(ld.description, /Hackney carriage taxis and private hire cars/);
});
