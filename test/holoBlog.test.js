'use strict';

// The blog, fed from Holo (Tom, 18 November 2026: "we need a spot for it to
// publish blogs on"). What is pinned: the articles are read out of Holo's
// script without running it; what reaches a page is plain article markup
// with no script, no outside picture and no dashes; a link to "#contact"
// goes to the enquiry form; nothing shows until something is published; a
// fault on Holo's side never empties the blog; and the page, the footer link
// and the sitemap all hang off the same list.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const holo = require('../lib/holoBlog');
const { BLOG_TITLE, BLOG_DESCRIPTION } = require('../routes/blog');

const PUBLISHED = read('test/fixtures/holo-embed-published.js.txt');
const EMPTY = read('test/fixtures/holo-embed-empty.js.txt');
const ID = '0c3beae0-51b3-4aab-84ca-36dbf0ceaff5';
const answer = (text, status = 200) => async () => new Response(text, { status });

test('the articles are read out of Holo\'s script as data', () => {
  assert.deepStrictEqual(holo.parseEmbed(EMPTY), []);
  const raw = holo.parseEmbed(PUBLISHED);
  assert.strictEqual(raw.length, 5);
  assert.strictEqual(raw[0].slug, 'the-busiest-person-in-the-building');
  assert.throws(() => holo.parseEmbed('var x = 1;'), /no article list/);
  assert.throws(() => holo.parseEmbed('var HOLO_ARTICLES = [{"a":1}'), /does not end/);
  // A bracket inside an article's words does not end the list early.
  assert.strictEqual(holo.parseEmbed('var HOLO_ARTICLES = [{"content":"a ] b \\" ] c"}]; var z = [1];').length, 1);
});

test('only articles that can be shown are kept, newest first, one per address', () => {
  const list = holo.cleanArticles(holo.parseEmbed(PUBLISHED));
  assert.deepStrictEqual(list.map((a) => a.slug), ['the-busiest-person-in-the-building', 'rules-that-backfire']);
  assert.strictEqual(list[1].title, 'Rules That Backfire', 'the first article at an address wins');
  assert.strictEqual(list[0].date, '18 November 2026');
  assert.ok(list[1].excerpt.length > 50 && list[1].excerpt.endsWith('...'), 'an article with no summary gets the start of its own words');
});

test('what reaches the page is plain article markup, with no script, picture, style or dash', () => {
  const [a] = holo.cleanArticles(holo.parseEmbed(PUBLISHED));
  assert.doesNotMatch(a.content, /<script|<iframe|<img|onerror|onclick|style=|javascript:|alert\(/i);
  assert.doesNotMatch(a.title + a.excerpt + a.content, /[–—]/);
  assert.strictEqual(a.title, 'The Busiest Person in the Building, and Why It Costs You');
  assert.match(a.content, /^<h2>Why it happens<\/h2>/, 'the page has its own h1, so an article heading starts at h2');
  assert.match(a.content, /<strong>Review it<\/strong>/);
  assert.match(a.content, /<ol><li>/);
  assert.doesNotMatch(a.content, /<p>\s*<\/p>/);
  assert.strictEqual(holo.cleanContent('<p>Fine</p><table><tr><td>x</td></tr></table>'), '<p>Fine</p><table><tr><td>x</td></tr></table>');
});

test('links: the form link works, our own pages open here, anyone else\'s opens apart', () => {
  const [a] = holo.cleanArticles(holo.parseEmbed(PUBLISHED));
  assert.match(a.content, /<a href="#conversation">book a 30 minute conversation<\/a>/, 'Holo\'s "#contact" is the enquiry form, which is #conversation');
  assert.match(a.content, /<a href="https:\/\/www\.arringtonconsultancy\.com\/owner-dependency-quiz">/);
  assert.match(a.content, /<a href="https:\/\/example\.org\/report" rel="noopener noreferrer nofollow" target="_blank">/);
  assert.doesNotMatch(holo.cleanContent('<p><a href="//evil.example/x">x</a></p>'), /evil/);
});

test('the id switches it on, and only a real id', () => {
  assert.strictEqual(holo.embedUrl({}), '');
  assert.strictEqual(holo.embedUrl({ HOLO_BLOG_EMBED_ID: 'https://evil.example/x.js' }), '');
  assert.strictEqual(holo.embedUrl({ HOLO_BLOG_EMBED_ID: ` ${ID.toUpperCase()}\n` }), `https://prod-api-holo-ai.fly.dev/public/seo/embed/${ID}.js`);
  assert.match(holo.describeStatus({}), /off/);
  assert.match(holo.describeStatus({ HOLO_BLOG_EMBED_ID: 'nope' }), /not a valid id/);
  assert.match(holo.describeStatus({ HOLO_BLOG_EMBED_ID: ID }), /on;/);
});

test('off, or nothing published, means no articles and no request when off', async () => {
  let calls = 0;
  const off = holo.createBlog({ env: {}, fetchFn: async () => { calls += 1; return new Response(PUBLISHED); }, log: () => {} });
  assert.deepStrictEqual(await off.list(), []);
  assert.strictEqual(calls, 0);
  assert.strictEqual(off.held().length, 0);
  const none = holo.createBlog({ env: { HOLO_BLOG_EMBED_ID: ID }, fetchFn: answer(EMPTY), log: () => {} });
  assert.deepStrictEqual(await none.list(), []);
});

test('a fault on Holo\'s side keeps the articles already held', async () => {
  let mode = 'ok'; let t = 1000;
  const lines = [];
  const blog = holo.createBlog({
    env: { HOLO_BLOG_EMBED_ID: ID }, now: () => t, log: (l) => lines.push(l),
    fetchFn: async () => {
      if (mode === 'down') throw new Error('connect ECONNREFUSED');
      if (mode === '500') return new Response('oops', { status: 500 });
      if (mode === 'garbage') return new Response('<html>maintenance</html>');
      return new Response(PUBLISHED);
    }
  });
  assert.strictEqual((await blog.list()).length, 2);
  for (const m of ['down', '500', 'garbage']) {
    mode = m;
    const r = await blog.refresh();
    assert.strictEqual(r.ok, false, m);
    assert.strictEqual(blog.held().length, 2, `${m} must not empty the blog`);
  }
  assert.ok(lines.some((l) => /keeping the 2 article/.test(l)));
  assert.strictEqual((await blog.find('rules-that-backfire')).title, 'Rules That Backfire');
  assert.strictEqual(await blog.find('../etc/passwd'), null);
  // Unpublishing in Holo does take an article down: an empty list from a
  // healthy answer is believed.
  mode = 'ok';
  const emptied = holo.createBlog({ env: { HOLO_BLOG_EMBED_ID: ID }, fetchFn: answer(EMPTY), log: () => {} });
  assert.strictEqual((await emptied.list()).length, 0);
});

test('a page is served from the copy held, and Holo is asked again only after 15 minutes', async () => {
  let calls = 0; let t = 1000;
  const blog = holo.createBlog({ env: { HOLO_BLOG_EMBED_ID: ID }, now: () => t, log: () => {}, fetchFn: async () => { calls += 1; return new Response(PUBLISHED); } });
  await blog.list(); await blog.list(); await blog.find('rules-that-backfire');
  assert.strictEqual(calls, 1);
  t += 16 * 60 * 1000;
  await blog.list();
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(calls, 2);
});

test('the saved copy is used at boot and cleaned again on the way out', async () => {
  const saved = [{ slug: 'kept', title: 'Kept', excerpt: 'e', isoDate: '2026-11-10T00:00:00Z', content: '<p>ok</p><script>x()</script>' }];
  const queries = [];
  const db = { query: async (sql, params) => { queries.push(sql); return /SELECT/.test(sql) ? { rows: [{ articles: saved, fetched_at: new Date().toISOString() }] } : { rows: [] }; } };
  const blog = holo.createBlog({ db, env: { HOLO_BLOG_EMBED_ID: ID }, log: () => {}, fetchFn: async () => { throw new Error('down'); } });
  const list = await blog.list();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].content, '<p>ok</p>');
});

test('after a restart Holo is asked straight away, however fresh the saved copy', async () => {
  // Found on the first local run: a copy saved a minute before a restart
  // (an empty one, from before anything was published) was trusted for 15
  // minutes, so a newly published article did not appear.
  let calls = 0;
  const db = { query: async (sql) => (/SELECT/.test(sql) ? { rows: [{ articles: [], fetched_at: new Date().toISOString() }] } : { rows: [] }) };
  const blog = holo.createBlog({ db, env: { HOLO_BLOG_EMBED_ID: ID }, log: () => {}, fetchFn: async () => { calls += 1; return new Response(PUBLISHED); } });
  assert.strictEqual((await blog.list()).length, 2);
  assert.strictEqual(calls, 1);
});

function render(locals) {
  const src = read('views/blog.ejs').replace(/<%#[\s\S]*?%>/g, '').replace(/<%-\s*include\([^)]*\)\s*%>/g, '');
  return ejs.render(src, { theme: { vars: {} }, nonce: 'n', csrfToken: 't', navPages: [], content: {}, pageContact: {}, blogTitle: BLOG_TITLE, blogDescription: BLOG_DESCRIPTION, newer: null, older: null, ...locals });
}

test('the list and an article are the site\'s own pages, each with its own title, description and address', () => {
  const articles = holo.cleanArticles(holo.parseEmbed(PUBLISHED));
  const list = render({ articles, article: null });
  assert.match(list, /<title>Blog \| Arrington Consultancy<\/title>/);
  assert.match(list, /<link rel="canonical" href="https:\/\/www\.arringtonconsultancy\.com\/blog">/);
  assert.match(list, /<a href="\/blog\/rules-that-backfire">Rules That Backfire<\/a>/);
  assert.strictEqual((list.match(/<h1/g) || []).length, 1);
  const page = render({ articles, article: articles[0], older: articles[1] });
  assert.match(page, /<title>The Busiest Person in the Building, and Why It Costs You \| Arrington Consultancy<\/title>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/www\.arringtonconsultancy\.com\/blog\/the-busiest-person-in-the-building">/);
  assert.match(page, /"@type":"BlogPosting"/);
  assert.match(page, /<h2>Why it happens<\/h2>/);
  assert.match(page, /<a href="\/blog\/rules-that-backfire"><span>Earlier<\/span>Rules That Backfire<\/a>/);
  assert.strictEqual((page.match(/<h1/g) || []).length, 1);
  assert.doesNotMatch(page, /noindex/);
  // A title is text, never markup.
  const odd = render({ articles, article: { ...articles[0], title: 'A <b>bold</b> "claim"' } });
  assert.doesNotMatch(odd, /<h1>A <b>/);
});

test('no outside script and nothing new in the CSP: the site fetches, the visitor\'s browser does not', () => {
  const view = read('views/blog.ejs');
  assert.doesNotMatch(view, /holo-ai\.fly\.dev|<script[^>]+src=/i);
  const server = read('server.js');
  assert.doesNotMatch(server.replace(/\/\/.*$/gm, ''), /holo-ai\.fly\.dev/, 'Holo\'s server is not added to the CSP');
  assert.doesNotMatch(read('views/blog.ejs'), /style="/, 'the strict CSP refuses inline style attributes');
});

test('the page, the footer link and the sitemap all follow the same list', () => {
  const server = read('server.js');
  assert.match(server, /app\.locals\.blogHasArticles = \(\) => blog\.held\(\)\.length > 0/);
  assert.match(server, /blogRoutes\.mountPageRoute\(app, generateCsrfToken, blog\)/);
  assert.match(server, /const blogArticles = await blog\.list\(\);\s*if \(blogArticles\.length\)/);
  assert.ok(server.indexOf('blogRoutes.mountPageRoute(') < server.indexOf("app.get('/:slug'"), 'ahead of the CMS catch-all');
  const footer = read('views/partials/site-footer.ejs');
  assert.match(footer, /if \(typeof blogHasArticles === 'function' && blogHasArticles\(\)\) \{ %><a href="\/blog">Blog<\/a>/);
  const route = read('routes/blog.js');
  assert.match(route, /if \(!articles\.length\) return next\(\);/, 'no articles, no page');
  assert.match(route, /if \(!article\) return next\(\);/);
  assert.match(read('db/schema.sql'), /CREATE TABLE IF NOT EXISTS holo_blog_cache/);
});
