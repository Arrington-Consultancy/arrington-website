'use strict';

// The four counts on the office's Today page open the list they count (Tom,
// 17/10/2026: "those 4 black boxes at the top should be clickable to go
// through to and filter what it says"). These tests open Today over HTTP,
// follow each box, and check the page it opens shows exactly that many
// things, before and after the inbox is read.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');

process.env.ENABLE_TAXI_OFFICE_AI = '';
const office = require('../lib/taxiOffice/office');
const { mountPageRoute, BASE } = require('../routes/taxiOffice');

const SESSION = { id: 'today-links-test', user: { id: 1, username: 'tom', role: 'admin' } };

function start() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => { req.session = SESSION; res.locals.csrfToken = 'test'; next(); });
  mountPageRoute(app);
  return new Promise((resolve) => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
}

const count = (html, re) => (html.match(re) || []).length;

// What each filtered page lists, counted from its own markup.
const LISTED = {
  dispatch: (h) => count(h, /class="to-time"/g),
  inbox: (h) => count(h, /class="to-inbox-row"/g),
  complaints: (h) => count(h, /class="to-complaint to-panel"/g),
  licensing: (h) => count(h, /class="to-reg-item"/g) + count((h.match(/id="from-complaints"[\s\S]*?<\/section>/) || [''])[0], /<li>/g)
};

async function boxes(base) {
  const html = await (await fetch(base + BASE + '/')).text();
  const list = (html.match(/<ul class="to-stats"[\s\S]*?<\/ul>/) || [''])[0];
  return [...list.matchAll(/<a class="to-stat" href="([^"]+)"><span class="to-stat-n">(\d+)<\/span><span class="to-stat-l">([^<]+)<\/span>/g)]
    .map(([, href, n, label]) => ({ href: href.replace(/&amp;/g, '&'), n: Number(n), label }));
}

async function checkEachBox(base) {
  const found = await boxes(base);
  assert.equal(found.length, 4, 'four boxes, each a link');
  for (const b of found) {
    const m = b.href.match(new RegExp(`^${BASE}/(dispatch|inbox|complaints|licensing)\\?show=(today|todo|open|due)#filtered$`));
    assert.ok(m, `${b.label}: opens a filtered page (${b.href})`);
    const html = await (await fetch(base + b.href)).text();
    assert.equal(LISTED[m[1]](html), b.n, `${b.label}: the page it opens lists ${b.n}`);
    const note = (html.match(/<p class="to-filter"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '';
    assert.ok(note, `${b.label}: the page says it is filtered`);
    if (b.n) assert.match(note, new RegExp(`Showing ${b.n} `), b.label);
    else assert.match(note, /There are no /, b.label);
    assert.match(note, new RegExp(`href="${BASE}/${m[1]}">Show all</a>`), `${b.label}: and links back to everything`);
  }
  return found;
}

test('each count on Today opens a page listing exactly that many, before and after the inbox is read', async () => {
  office.reset(SESSION.id);
  const srv = await start();
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const before = await checkEachBox(base);
    assert.ok(before.find((b) => b.href.includes('/inbox?')).n > 0, 'emails to deal with before reading');

    const r = await fetch(base + BASE + '/inbox/check-all', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ _csrf: 'test' }) });
    assert.ok(r.status === 303 || r.status === 302, 'the inbox was read');

    const after = await checkEachBox(base);
    const complaints = after.find((b) => b.href.includes('/complaints?'));
    assert.ok(complaints.n > 0, 'complaints are waiting once the inbox is read');

    // Unfiltered, the pages still show everything, and say nothing about a filter.
    const all = await (await fetch(base + BASE + '/inbox')).text();
    assert.ok(LISTED.inbox(all) > after.find((b) => b.href.includes('/inbox?')).n, 'the whole inbox has more than the ones to deal with');
    assert.doesNotMatch(all, /class="to-filter"/);
    const odd = await (await fetch(base + BASE + '/inbox?show=constructor')).text();
    assert.equal(LISTED.inbox(odd), LISTED.inbox(all), 'an unknown filter shows everything');
    assert.doesNotMatch(odd, /class="to-filter"/);
  } finally {
    srv.close();
    office.reset(SESSION.id);
  }
});

test('the office stylesheet and script addresses change when their contents do, and icons have a size of their own', async () => {
  const srv = await start();
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const html = await (await fetch(base + BASE + '/')).text();
    assert.match(html, /href="\/css\/taxi-office\.css\?v=[0-9a-f]{10}"/);
    assert.match(html, /src="\/js\/taxi-office\.js\?v=[0-9a-f]{10}"/);
    // Without its stylesheet an inline SVG fills its box; the size on the
    // icon itself stops a stale or missing stylesheet drawing it huge.
    for (const svg of html.match(/<svg [^>]*>/g) || []) assert.match(svg, /width="\d+" height="\d+"/, svg);
  } finally {
    srv.close();
    office.reset(SESSION.id);
  }
});
