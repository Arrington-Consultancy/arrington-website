'use strict';
// The staff portal page (Tom, 16/10/2026): the office behind the website in
// screenshots, the login where nobody can miss it, and the way to Arrington
// for anyone who wants to look round it.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../server');
const { createDispatch } = require('../lib/dispatch');
const { FIRM } = require('../lib/firm');
const { setBase } = require('../lib/base');

let server;
let base;
test.before(async () => {
  server = createApp({ basePath: '/taxi-demo', dispatch: createDispatch('mock', { confirmAfterMs: 40, allocateAfterMs: 120 }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/taxi-demo`;
});
test.after(() => new Promise((r) => server.close(() => { setBase(''); r(); })));

const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('the login is the first thing beside the headline, and goes to the office on the main site', async () => {
  const html = await (await fetch(base + '/staff-portal')).text();
  const top = /<section class="page-top[^"]*page-top-portal[\s\S]*?<\/section>/.exec(html);
  assert.ok(top, 'the page opens with its own top section');
  assert.match(top[0], /<a class="btn btn-primary btn-lg btn-block" href="\/taxi-demo\/office\/">Staff login<\/a>/);
  assert.match(top[0], /Logins are by invitation/);
  assert.ok(top[0].includes(`href="${FIRM.arringtonEnquiryUrl}"`), 'the login card says where to ask for one');
});

test('it says plainly how to get in: contact Arrington Consultancy', async () => {
  const html = await (await fetch(base + '/staff-portal')).text();
  const text = visible(html);
  assert.match(text, /Contact Arrington Consultancy to gain access to our AI workspace example\./);
  assert.match(html, /<a class="btn btn-primary" href="https:\/\/www\.arringtonconsultancy\.com\/taxi-and-private-hire-operators\/websites#conversation">Ask Arrington for a login<\/a>/);
  assert.match(text, /nothing real is sent, booked or posted/);
  assert.match(text, /A second AI checks every booking, and a person in the office signs it off before anything goes out/);
});

test('every page links to it from the menu and the footer', async () => {
  for (const p of ['/', '/about', '/staff-portal']) {
    const html = await (await fetch(base + p)).text();
    assert.match(html, /<li><a href="\/taxi-demo\/staff-portal" class="nav-staff"( aria-current="page")?>Staff portal<\/a><\/li>/, `${p} menu`);
    assert.match(html, /<a href="\/taxi-demo\/staff-portal">Staff portal and AI workers<\/a>/, `${p} footer`);
  }
});

test('the screenshots are real files, readable on a phone, sized, lazy and described', async () => {
  const html = await (await fetch(base + '/staff-portal')).text();
  const figures = [...html.matchAll(/<figure class="shot[^"]*">([\s\S]*?)<\/figure>/g)].map((m) => m[1]);
  assert.equal(figures.length, 3);
  for (const name of ['office-today', 'office-booking', 'office-complaint']) {
    const f = figures.find((x) => x.includes(`img/${name}-1200.jpg`));
    assert.ok(f, `${name} is shown`);
    assert.match(f, new RegExp(`<source media="\\(max-width: 40rem\\)" type="image/webp" srcset="[^"]*img/${name}-phone-1170\\.webp`), `${name} has its phone crop`);
    assert.match(f, /<img [^>]*width="1200" height="\d+" alt="Screenshot of [^"]{40,}" loading="lazy"/);
    assert.match(f, /<figcaption>[^<]{20,}<\/figcaption>/);
    for (const suffix of ['', '-phone']) {
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'img', `${name}${suffix}-768.webp`)), `${name}${suffix} files are committed`);
    }
  }
  assert.match(visible(html), /Screenshots taken in October 2026 from the demonstration office\. The replies shown are as the AI drafted them/);
});

test('the five workers are named, and none of them is said to act on its own', async () => {
  const text = visible(await (await fetch(base + '/staff-portal')).text());
  for (const w of ['Bookings', 'Customer emails', 'Complaints', 'Licensing', 'Social media']) assert.match(text, new RegExp(`${w} [A-Z]`), w);
  assert.match(text, /None of them sends, books or posts anything on its own/);
});

test('the desktop menu outlines it, the phone menu is left as it was (Tom, 19/10/2026)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'site.css'), 'utf8');
  const desktop = /@media \(min-width: 64rem\) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(desktop, 'the desktop block is there');
  assert.match(desktop[1], /\.nav a\.nav-staff \{ box-shadow: inset 0 0 0 1\.5px var\(--teal\);/);
  const outside = css.replace(desktop[0], '');
  assert.ok(!outside.includes('nav-staff'), 'an outline rule outside the desktop block reaches the phone menu');
});

test('the home page says what the app buttons are for in a demo', async () => {
  const html = await (await fetch(base + '/')).text();
  const card = /<article class="way reveal" id="app">[\s\S]*?<\/article>/.exec(html);
  assert.ok(card, 'the app card is there');
  assert.match(card[0], /<\/div>\s*<p class="stores-note">In this demo, these buttons show how the app works\.<\/p>/);
});
