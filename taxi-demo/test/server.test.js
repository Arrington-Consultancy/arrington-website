'use strict';
// The demo over real HTTP: every page, the booking from form to driver, and
// the things that must always be true of a fictional firm's site.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { createDispatch } = require('../lib/dispatch');
const { FIRM } = require('../lib/firm');

let server;
let base;
test.before(async () => {
  server = createApp({ dispatch: createDispatch('mock', { confirmAfterMs: 40, allocateAfterMs: 120 }), bookingLimit: 6 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));

const PAGES = ['/', '/book', '/airports', '/accounts', '/about', '/contact'];
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const form = (o) => new URLSearchParams(o).toString();
const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body });
const good = { pickup: 'Exmouth railway station', destination: 'Exeter Airport', when: 'now', passengers: '1', luggage: '0', vehicle: 'saloon', name: 'Tom Test', phone: '07700 900123', payment: 'card' };

test('every page answers, says it is a demonstration, and is kept out of search', async () => {
  for (const p of PAGES) {
    const res = await fetch(base + p);
    const html = await res.text();
    assert.equal(res.status, 200, p);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow', p);
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/, p);
    assert.match(html, /Demonstration site\./, p);
    assert.match(html, /no car will come/i, p);
    assert.ok(html.includes(`href="${FIRM.arringtonUrl}"`), `${p} links back to the sales page`);
    assert.ok(html.includes(`href="${FIRM.phoneHref}"`), `${p} has a tap-to-call link`);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  }
});

test('each page has its own title and description, and the firm details agree', async () => {
  const titles = new Set();
  for (const p of PAGES) {
    const html = await (await fetch(base + p)).text();
    const title = /<title>([^<]+)<\/title>/.exec(html)[1];
    assert.ok(!titles.has(title), `duplicate title on ${p}`);
    titles.add(title);
    assert.match(html, /<meta name="description" content="[^"]{40,}">/, p);
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
    assert.equal(ld['@type'], 'TaxiService');
    assert.equal(ld.provider.telephone, FIRM.phone);
    assert.equal(ld.provider.address.addressLocality, FIRM.town);
  }
});

test('the copy keeps to the brief: no sales words, no exclamation marks, no dashes', async () => {
  for (const p of PAGES) {
    const text = visible(await (await fetch(base + p)).text());
    assert.doesNotMatch(text, /\b(solutions?|seamless(ly)?|cutting[- ]edge|world[- ]class|leverage)\b/i, p);
    assert.doesNotMatch(text, /!/, p);
    assert.doesNotMatch(text, /[\u2013\u2014]/, p);
  }
});

test('the phone numbers are Ofcom drama numbers that can never ring a real line', () => {
  assert.match(FIRM.phone.replace(/\s/g, ''), /^01632960\d{3}$/);
  assert.match(FIRM.textNumber.replace(/\s/g, ''), /^07700900\d{3}$/);
});

test('a booking goes into dispatch and the confirmation shows the reference, then the driver', async () => {
  const res = await post('/book', form(good));
  assert.equal(res.status, 303);
  const loc = res.headers.get('location');
  assert.match(loc, /^\/booking\/[a-f0-9]{32}$/);
  const page = await (await fetch(base + loc)).text();
  const ref = /data-ref>(TW-\d{5})</.exec(page)[1];
  assert.match(page, /Received by our dispatch system/);
  assert.match(page, /Your taxi is booked/);
  assert.match(page, /£28/);
  await new Promise((r) => setTimeout(r, 200));
  const status = await (await fetch(base + '/api/bookings/' + loc.split('/').pop())).json();
  assert.equal(status.ref, ref);
  assert.equal(status.status, 'allocated');
  assert.ok(status.driver.name && status.driver.reg);
  assert.match(status.html, /Driver on the way/);
  assert.doesNotMatch(JSON.stringify(status), /07700|900123|Tom Test/, 'the status API carries no contact details');
});

test('the same booking works as JSON for a script', async () => {
  const res = await fetch(base + '/book', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(good) });
  assert.equal(res.status, 201);
  const j = await res.json();
  assert.match(j.ref, /^TW-\d{5}$/);
  assert.match(j.url, /^\/booking\//);
});

test('a booking with problems comes back with the answers kept and the problems named', async () => {
  const res = await post('/book', form({ ...good, name: '<script>x</script>', phone: 'nope', pickup: 'The <b>Strand</b>' }));
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.match(html, /error-summary/);
  assert.match(html, /A UK phone number/);
  assert.doesNotMatch(html, /<script>x<\/script>|<b>Strand<\/b>/);
});

test('a cancelled booking says so', async () => {
  const loc = (await post('/book', form(good))).headers.get('location');
  const res = await post(loc + '/cancel', '');
  assert.equal(res.status, 303);
  const html = await (await fetch(base + loc)).text();
  assert.match(html, /Booking cancelled/);
  assert.doesNotMatch(html, /Cancel this booking/);
});

test('bookings cannot be read by guessing, or posted from another site', async () => {
  assert.equal((await fetch(base + '/booking/' + '0'.repeat(32))).status, 404);
  assert.equal((await fetch(base + '/api/bookings/' + 'a'.repeat(32))).status, 404);
  assert.equal((await post('/book', form(good), { Origin: 'https://evil.example' })).status, 403);
});

test('the live price answers for the form', async () => {
  const q = await (await fetch(base + '/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pickup: 'Exmouth', destination: 'Heathrow Airport', vehicle: 'saloon' }) })).json();
  assert.equal(q.kind, 'fixed');
  assert.equal(q.text, '£295');
});

test('the enquiry forms thank the sender, and check what they were given', async () => {
  const ok = await post('/accounts', form({ organisation: 'Seaview Hotel', name: 'Ann', phone: '01632 960001', email: 'ann@example.com', volume: '10 to 50' }));
  assert.equal(ok.status, 303);
  assert.match(ok.headers.get('location'), /sent=1/);
  assert.match(await (await fetch(base + '/accounts?sent=1')).text(), /we've got that/);
  const bad = await post('/contact', form({ name: '', phone: '', message: '' }));
  assert.equal(bad.status, 422);
});

test('a quote mark in a prefilled address cannot break out of the field', async () => {
  const html = await (await fetch(base + '/book?pickup=' + encodeURIComponent('x" autofocus onfocus="alert(1)') + '&destination=Exeter%20Airport')).text();
  assert.doesNotMatch(html, /onfocus="alert/);
  assert.match(html, /value="x&quot; autofocus onfocus=&quot;alert\(1\)"/);
});

test('the booking page prefills from the quick price on the home page', async () => {
  const html = await (await fetch(base + '/book?pickup=Exmouth%20railway%20station&destination=Exeter%20Airport')).text();
  assert.match(html, /value="Exmouth railway station"/);
  assert.match(html, /Price: <strong>£28<\/strong>/);
});

test('too many bookings from one address are turned away', async () => {
  let last;
  for (let i = 0; i < 8; i++) last = await post('/book', form(good));
  assert.equal(last.status, 429);
});

test('health answers for the deploy check', async () => {
  const j = await (await fetch(base + '/health')).json();
  assert.equal(j.ok, true);
  assert.equal(j.dispatch, 'mock');
});
