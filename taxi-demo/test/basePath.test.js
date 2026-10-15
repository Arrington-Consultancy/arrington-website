'use strict';
// The demo served under a path, as Arrington's main site serves it at
// www.arringtonconsultancy.com/taxi-demo (15/10/2026). Every address a page
// writes must stay inside that path: a bare "/book" would send a visitor to
// the main site's own pages, which have nothing to do with the demo. Run in
// its own file because the base path is set once per process.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createApp } = require('../server');
const { createDispatch } = require('../lib/dispatch');
const { normalise } = require('../lib/base');

const BASE = '/taxi-demo';
const PAGES = ['/', '/book', '/airports', '/accounts', '/about', '/contact'];
const good = { pickup: 'Exmouth railway station', destination: 'Exeter Airport', when: 'now', passengers: '1', luggage: '0', vehicle: 'saloon', name: 'Tom Test', phone: '07700 900123', payment: 'card' };

let app;
let mounted;
let origin;
test.before(async () => {
  app = createApp({ basePath: BASE, dispatch: createDispatch('mock', { confirmAfterMs: 40, allocateAfterMs: 120 }) });
  // The way Express mounts it: the prefix is taken off req.url before the
  // demo sees the request, and anything outside the prefix is not the demo's.
  mounted = http.createServer((req, res) => {
    if (req.url === BASE || req.url.startsWith(BASE + '/') || req.url.startsWith(BASE + '?')) {
      req.url = req.url.slice(BASE.length) || '/';
      return app.handle(req, res);
    }
    res.writeHead(404); res.end('main site');
  });
  await new Promise((r) => mounted.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${mounted.address().port}`;
});
test.after(() => new Promise((r) => mounted.close(r)));

// Every address in a page: attributes, srcsets and the preload list.
function addresses(html) {
  const out = [];
  for (const m of html.matchAll(/\s(?:href|src|action)="([^"]*)"/g)) out.push(m[1]);
  for (const m of html.matchAll(/\s(?:srcset|imagesrcset)="([^"]*)"/g)) for (const part of m[1].split(',')) out.push(part.trim().split(/\s+/)[0]);
  return out;
}

test('every address on every page stays inside the path', async () => {
  for (const p of PAGES) {
    const res = await fetch(origin + BASE + p);
    const html = await res.text();
    assert.equal(res.status, 200, p);
    assert.match(html, /<html lang="en-GB" data-base="\/taxi-demo">/, p);
    for (const a of addresses(html)) {
      if (/^(#|tel:|sms:|mailto:)/.test(a)) continue;
      const u = new URL(a, origin);
      if (u.origin !== origin) continue; // the link back to Arrington's sales page
      assert.ok(u.pathname.startsWith(BASE + '/'), `${p} writes ${a}`);
    }
    assert.match(html, new RegExp(`<link rel="canonical" href="http://127\\.0\\.0\\.1:\\d+/taxi-demo${p === '/' ? '/' : p}">`), p);
  }
});

test('assets, the live price and the place list answer under the path', async () => {
  const html = await (await fetch(origin + BASE + '/')).text();
  const css = /href="(\/taxi-demo\/assets\/site\.css\?v=[a-f0-9]+)"/.exec(html);
  assert.ok(css, 'stylesheet');
  assert.equal((await fetch(origin + css[1])).status, 200);
  assert.equal((await fetch(origin + BASE + '/assets/places.json')).status, 200);
  const quote = await fetch(origin + BASE + '/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pickup: 'Exmouth railway station', destination: 'Exeter Airport', vehicle: 'saloon' }) });
  assert.equal(quote.status, 200);
  assert.match((await quote.json()).text, /£\d+/);
});

test('a booking goes through and every redirect stays inside the path', async () => {
  const res = await fetch(origin + BASE + '/book', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(good).toString() });
  assert.equal(res.status, 303);
  const to = res.headers.get('location');
  assert.match(to, /^\/taxi-demo\/booking\/[a-f0-9]{32}$/);
  const page = await fetch(origin + to);
  assert.equal(page.status, 200);
  const token = to.split('/').pop();
  await new Promise((r) => setTimeout(r, 250));
  const status = await (await fetch(origin + BASE + '/api/bookings/' + token, { headers: { Accept: 'application/json' } })).json();
  assert.equal(status.status, 'allocated');
  const cancel = await fetch(origin + to + '/cancel', { method: 'POST', redirect: 'manual' });
  assert.equal(cancel.headers.get('location'), to);
  const json = await fetch(origin + BASE + '/book', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(good) });
  assert.match((await json.json()).url, /^\/taxi-demo\/booking\//);
  const enquiry = await fetch(origin + BASE + '/contact', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ website: 'bot' }).toString() });
  assert.equal(enquiry.headers.get('location'), '/taxi-demo/contact?sent=1');
});

test('run on its own with a base path, the bare path gains its slash and the rest is served', async () => {
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  const own = `http://127.0.0.1:${app.address().port}`;
  try {
    const bare = await fetch(own + BASE + '?x=1', { redirect: 'manual' });
    assert.equal(bare.status, 301);
    assert.equal(bare.headers.get('location'), '/taxi-demo/?x=1');
    assert.equal((await fetch(own + BASE + '/airports')).status, 200);
  } finally {
    await new Promise((r) => app.close(r));
  }
});

test('a base path that is not a plain path is refused', () => {
  assert.equal(normalise(''), '');
  assert.equal(normalise('/taxi-demo/'), '/taxi-demo');
  for (const bad of ['taxi-demo', '//evil.example', '/taxi demo', '/"x', 'https://x']) assert.throws(() => normalise(bad), bad);
});

test('the old address forwards every visitor, keeping the path, and still answers its healthcheck', async () => {
  process.env.REDIRECT_TO = 'https://www.arringtonconsultancy.com/taxi-demo/';
  const old = createApp({ basePath: '', dispatch: createDispatch('mock', {}) });
  delete process.env.REDIRECT_TO;
  await new Promise((r) => old.listen(0, '127.0.0.1', r));
  const at = `http://127.0.0.1:${old.address().port}`;
  try {
    const home = await fetch(at + '/', { redirect: 'manual' });
    assert.equal(home.status, 301);
    assert.equal(home.headers.get('location'), 'https://www.arringtonconsultancy.com/taxi-demo/');
    const deep = await fetch(at + '/book?pickup=Exmouth', { redirect: 'manual' });
    assert.equal(deep.headers.get('location'), 'https://www.arringtonconsultancy.com/taxi-demo/book?pickup=Exmouth');
    assert.equal((await fetch(at + '/health')).status, 200);
  } finally {
    await new Promise((r) => old.close(r));
  }
});
