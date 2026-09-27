// Three changes of 27/09/2026 aimed at turning the few visitors the site gets
// into enquiries:
//
// 1. Every Useful Thinking article ends with a next step (the quiz or a
//    conversation). Before, a reader who finished an article was offered
//    nothing.
// 2. The Owner Dependency Quiz offers the conversation beside the score for
//    any result above Low dependency, straight to the enquiry form on that
//    page, instead of only at the very end of the results.
// 3. The footer enquiry form still works when its script never runs. It had
//    no method, so the browser sent the enquiry to the page address as a GET:
//    nothing was stored, and the visitor's details sat in the server logs.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ejs = require('ejs');
const express = require('express');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// ---- 1. article next step -------------------------------------------------

function articleTemplate() {
  const src = read('views/index.ejs');
  const start = src.indexOf("<% if (_tpl === 'article') { %>");
  const end = src.indexOf("<% if (_tpl === 'utlibrary') { %>");
  assert.ok(start > 0 && end > start, 'the article template is where it was');
  return src.slice(start, end);
}

test('every article ends with the approved Useful Thinking bridge and both next steps', () => {
  const tpl = articleTemplate();
  const block = tpl.slice(tpl.indexOf('<div class="article-next">'));
  assert.ok(tpl.includes('<div class="article-next">'), 'the closing block is in the article template');
  // Unconditional: it must not depend on any per-article content field.
  const beforeBlock = tpl.slice(0, tpl.indexOf('<div class="article-next">'));
  const opens = (beforeBlock.match(/<% if \(/g) || []).length;
  const closes = (beforeBlock.match(/<% } %>/g) || []).length;
  assert.strictEqual(opens - closes, 1, 'the block sits directly inside the article branch, not behind another condition');
  assert.match(block, /href="\/owner-dependency-quiz"[^>]*>Take the Owner Dependency Quiz<\/a>/);
  assert.match(block, /href="\/book-a-30-minute-conversation"[^>]*>Book a 30 minute conversation<\/a>/);
  assert.match(block, /data-article-next="quiz"/);
  assert.match(block, /data-article-next="conversation"/);
});

test('the article wording is the approved bridge copy, word for word, not new copy', () => {
  const seed = read('db/seed.js');
  const tpl = articleTemplate();
  for (const approved of [
    'If any of this sounds familiar',
    'One straightforward question is usually enough to work out whether a commercial review would help.',
    'Take the Owner Dependency Quiz'
  ]) {
    assert.ok(seed.includes(`'${approved}'`), `"${approved}" is still the approved bridge copy in the seed`);
    assert.ok(tpl.includes(approved), `"${approved}" is what the article shows`);
  }
});

test('the article next step is tracked and styled without inline styles', () => {
  const src = read('views/index.ejs');
  assert.match(src, /querySelectorAll\('a\[data-article-next\]'\)/);
  assert.match(src, /gtag\('event', 'article_next_click'/);
  assert.match(src, /\.article-next \{/);
  assert.ok(!articleTemplate().includes('style="'), 'the strict CSP blocks inline styles');
});

// ---- 2. quiz: conversation beside the score ------------------------------

test('the quiz offers the conversation right under the score, straight to the form on the page', () => {
  const src = read('views/owner-dependency-quiz.ejs');
  const score = src.indexOf('<div class="odr-score-block">');
  const early = src.indexOf('<div class="odr-cta-early" id="odr-cta-early" hidden>');
  const share = src.indexOf('<div class="odr-share">');
  assert.ok(score > 0 && early > score && share > early, 'score, then the offer, then sharing');
  const block = src.slice(early, share);
  assert.match(block, /href="#conversation"[^>]*>Book a 30 minute conversation<\/a>/);
  // The same sentence the closing block already uses, so no new copy.
  const sentence = 'A straightforward 30 minute conversation is usually enough to work out whether a commercial review would actually help, with no pressure either way.';
  assert.strictEqual(src.split(sentence).length - 1, 2, 'the sentence appears in the early offer and the closing block');
  assert.ok(src.includes('id="conversation"') || read('views/partials/site-footer.ejs').includes('id="conversation"'), 'the anchor it jumps to exists');
});

test('the early offer is hidden for Low dependency and shown for every other band', () => {
  const src = read('views/owner-dependency-quiz.ejs');
  assert.match(src, /document\.getElementById\('odr-cta-early'\)\.hidden = band === BANDS\[0\];/);
  assert.match(src, /\{ max: 3, label: 'Low dependency'/, 'the first band is still Low dependency');
  assert.match(src, /\.odr-cta-early\[hidden\] \{ display: none; \}/, 'the hidden attribute is not overridden by CSS');
  assert.match(src, /cta_position: 'score'/);
  assert.match(src, /cta_position: 'end'/);
});

// ---- 3. footer form works without its script -----------------------------

test('the footer form posts itself to /api/leads, with its CSRF token, when the script never runs', async () => {
  const themes = require('../db/themes');
  const html = await ejs.renderFile(path.join(root, 'views', 'thank-you.ejs'), {
    nonce: 'n', csrfToken: 'tok-123', ga4Id: '', theme: themes.dark, navPages: [], content: {},
    pageContact: { heading: 'h', body: 'b', label: '', headerCtaText: 'Start a conversation', submitText: 'Send', messagePlaceholder: 'm' },
    heardAboutOptions: [], conversion: null
  });
  assert.match(html, /<form class="lead-form" id="leadForm" method="post" action="\/api\/leads">/);
  assert.match(html, /<input type="hidden" name="_csrf" value="tok-123">/);
});

function loadLeadsRouter(inserts) {
  const poolPath = require.resolve('../db/pool');
  const leadsPath = require.resolve('../routes/leads');
  const savedPool = require.cache[poolPath];
  const savedLeads = require.cache[leadsPath];
  require.cache[poolPath] = {
    id: poolPath, filename: poolPath, loaded: true,
    exports: { query: async (sql, params) => { if (/INSERT INTO leads/.test(sql)) inserts.push(params); return { rows: [] }; } }
  };
  delete require.cache[leadsPath];
  const router = require('../routes/leads');
  if (savedPool) require.cache[poolPath] = savedPool; else delete require.cache[poolPath];
  if (savedLeads) require.cache[leadsPath] = savedLeads; else delete require.cache[leadsPath];
  return router;
}

function post(port, body, type) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, path: '/api/leads', method: 'POST', headers: { 'Content-Type': type } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('the lead route answers a plain form post with pages, and a script post with JSON as before', async () => {
  const saved = process.env.GMAIL_APP_PASSWORD;
  delete process.env.GMAIL_APP_PASSWORD;
  const inserts = [];
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(loadLeadsRouter(inserts));
  const server = app.listen(0);
  const { port } = server.address();
  const form = 'application/x-www-form-urlencoded';
  try {
    const ok = await post(port, 'name=Ann+Owner&email=ann%40example.invalid&message=Hello', form);
    assert.strictEqual(ok.status, 303, 'a stored enquiry redirects');
    assert.match(ok.headers.location, /^\/thank-you\?c=[A-Za-z0-9._-]+$/, 'to /thank-you with the token, like the script path');
    assert.strictEqual(inserts.length, 1, 'and the enquiry was stored');
    assert.strictEqual(inserts[0][0], 'Ann Owner');

    const trap = await post(port, 'website=spam&name=Bot&email=bot%40example.invalid', form);
    assert.strictEqual(trap.status, 303);
    assert.strictEqual(trap.headers.location, '/thank-you', 'the honeypot gets the bare page, no token');
    assert.strictEqual(inserts.length, 1, 'and nothing is stored');

    const bad = await post(port, 'name=Ann&email=', form);
    assert.strictEqual(bad.status, 400);
    assert.match(bad.headers['content-type'], /^text\/plain/);
    assert.match(bad.body, /Name and email are required\. Please go back and try again\./);

    const json = await post(port, JSON.stringify({ name: 'Ann', email: 'ann@example.invalid' }), 'application/json');
    assert.strictEqual(json.status, 200, 'the script path is unchanged');
    const parsed = JSON.parse(json.body);
    assert.strictEqual(parsed.ok, true);
    assert.match(parsed.thankYou, /^\/thank-you\?c=/);

    const jsonBad = await post(port, JSON.stringify({ name: 'Ann' }), 'application/json');
    assert.strictEqual(jsonBad.status, 400);
    assert.deepStrictEqual(JSON.parse(jsonBad.body), { error: 'Name and email are required.' });
  } finally {
    server.close();
    if (saved !== undefined) process.env.GMAIL_APP_PASSWORD = saved;
  }
});
