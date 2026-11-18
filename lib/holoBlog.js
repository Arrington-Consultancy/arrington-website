'use strict';

// The blog, fed from Holo (Tom, 18 November 2026: "holo", "go on then").
//
// Holo gives a script to paste into a page: it carries the published
// articles inside itself and draws them in the visitor's browser. It was
// checked on 18 November 2026 (probe run 20261118T162319Z-holo-embed-probe):
// no tracking, no cookies, no further requests, but it draws dark text for a
// white page, puts its articles on the page only after the page has loaded,
// and would need Holo's server allowed to run script on our pages.
//
// So the site does the fetching instead. This module reads the same script
// from Holo on the server, takes the articles out of it, cleans them, and the
// site shows them as its own pages at /blog and /blog/<slug>: in the page as
// served (so a search engine reads them), in the site's own look, with no
// outside script in a visitor's browser and nothing new allowed in the CSP.
//
// Tom's approval of an article is his pressing Publish in Holo: only
// published articles are in the script. What the site does to the words:
// nothing but the house rules a machine can apply safely. Dashes come out
// (Tom, 6 October 2026: no dashes on the site) and the HTML is cut down to
// plain article markup. Pictures are left out for now: none has been seen
// yet, and the site's image rules are stricter than a feed's.
//
// HOLO_BLOG_EMBED_ID (the id in the script's address, public, not a secret)
// switches it on. Unset, or with nothing published, there is no /blog, no
// footer link and no sitemap entry.

const sanitizeHtml = require('sanitize-html');
const { dashesOut } = require('./taxiOffice/humanise');

const HOST = 'https://prod-api-holo-ai.fly.dev';
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFRESH_MS = 15 * 60 * 1000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_ARTICLES = 200;

function embedId(env = process.env) {
  const v = String(env.HOLO_BLOG_EMBED_ID || '').trim().toLowerCase();
  return ID_RE.test(v) ? v : '';
}
function embedUrl(env = process.env) {
  const id = embedId(env);
  return id ? `${HOST}/public/seo/embed/${id}.js` : '';
}
function describeStatus(env = process.env) {
  const raw = String(env.HOLO_BLOG_EMBED_ID || '').trim();
  if (!raw) return 'Holo blog: off (HOLO_BLOG_EMBED_ID not set); no /blog page';
  if (!embedId(env)) return 'Holo blog: off (HOLO_BLOG_EMBED_ID is not a valid id); no /blog page';
  return 'Holo blog: on; /blog shows whatever is published in Holo, checked every 15 minutes';
}

// The articles sit in the script as one JSON array: var HOLO_ARTICLES = [...];
// Find the array and read it as JSON. Nothing from the script is ever run.
function parseEmbed(js) {
  const text = String(js || '');
  const at = text.indexOf('HOLO_ARTICLES');
  if (at < 0) throw new Error('no article list in the Holo script');
  const start = text.indexOf('[', at);
  if (start < 0) throw new Error('no article list in the Holo script');
  let depth = 0; let inStr = false; let esc = false; let end = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '[') depth += 1;
    else if (c === ']') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error('the article list in the Holo script does not end');
  const list = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(list)) throw new Error('the article list in the Holo script is not a list');
  return list;
}

const plain = (v, n) => dashesOut(sanitizeHtml(String(v || ''), { allowedTags: [], allowedAttributes: {} })
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim()).slice(0, n);

function cleanContent(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'blockquote', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    // The page already has its h1 (the title), so a heading inside the
    // article starts at h2. Bold and italic keep one spelling each.
    transformTags: {
      h1: 'h2',
      b: 'strong',
      i: 'em',
      a: (tagName, attribs) => {
        const href = String(attribs.href || '').trim();
        const own = href.startsWith('/') && !href.startsWith('//');
        const ours = /^https:\/\/(www\.)?arringtonconsultancy\.com(\/|$)/i.test(href);
        const out = { href };
        if (!own && !ours) { out.rel = 'noopener noreferrer nofollow'; out.target = '_blank'; }
        return { tagName: 'a', attribs: out };
      }
    },
    // script, style and the like go with everything inside them.
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'svg'],
    textFilter: (text) => dashesOut(text),
    exclusiveFilter: (frame) => ['p', 'li', 'h2', 'h3', 'h4', 'blockquote'].includes(frame.tag) && !frame.text.trim()
  }).trim();
}

function longDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

// One article as the site will show it, or null when it cannot be shown
// (no usable address, title or words).
function cleanArticle(a) {
  if (!a || typeof a !== 'object') return null;
  const slug = String(a.slug || '').trim().toLowerCase();
  if (!SLUG_RE.test(slug) || slug.length > 140) return null;
  const title = plain(a.title, 200);
  const content = cleanContent(a.content);
  if (!title || !content) return null;
  const d = new Date(a.isoDate);
  const isoDate = Number.isNaN(d.getTime()) ? '' : d.toISOString();
  const words = plain(content, 100000);
  const excerpt = plain(a.excerpt, 300) || (words.length > 200 ? `${words.slice(0, 200).replace(/\s+\S*$/, '')}...` : words);
  return { slug, title, excerpt, isoDate, date: isoDate ? longDate(isoDate) : '', content };
}

function cleanArticles(list) {
  const seen = new Set();
  const out = [];
  for (const raw of (Array.isArray(list) ? list : []).slice(0, MAX_ARTICLES)) {
    const a = cleanArticle(raw);
    if (!a || seen.has(a.slug)) continue;
    seen.add(a.slug);
    out.push(a);
  }
  // Newest first; an article with no date goes last, in Holo's own order.
  return out.sort((x, y) => (y.isoDate || '').localeCompare(x.isoDate || ''));
}

async function fetchEmbed(url, fetchFn = fetch) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetchFn(url, { signal: ctl.signal, redirect: 'error', headers: { accept: 'application/javascript, text/javascript, */*' } });
    if (!res.ok) throw new Error(`Holo answered ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('the Holo script is larger than expected');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// The blog as the site holds it: the last good copy in memory and in the
// database, so a deploy while Holo is unreachable still serves the articles,
// and a bad or empty answer from Holo's side of a fault never wipes them.
function createBlog({ db = null, env = process.env, fetchFn = fetch, now = () => Date.now(), log = console.log } = {}) {
  let articles = [];
  let fetchedAt = 0;
  let checkedAt = 0;
  let refreshing = null;
  let loaded = false;

  const enabled = () => Boolean(embedUrl(env));

  async function loadSaved() {
    if (loaded || !db) { loaded = true; return; }
    loaded = true;
    try {
      const { rows } = await db.query('SELECT articles, fetched_at FROM holo_blog_cache WHERE id = 1');
      if (rows[0] && Array.isArray(rows[0].articles)) {
        // Cleaned again on the way out: the stored copy is never trusted
        // more than a fresh one.
        articles = cleanArticles(rows[0].articles.map((a) => ({ ...a })));
        fetchedAt = new Date(rows[0].fetched_at).getTime() || 0;
      }
    } catch (e) {
      log(`Holo blog: saved copy not read (${String(e.message || e).slice(0, 120)})`);
    }
  }

  async function refresh() {
    if (!enabled()) return { ok: false, reason: 'off' };
    if (refreshing) return refreshing;
    refreshing = (async () => {
      checkedAt = now();
      try {
        const next = cleanArticles(parseEmbed(await fetchEmbed(embedUrl(env), fetchFn)));
        const changed = JSON.stringify(next) !== JSON.stringify(articles);
        articles = next;
        fetchedAt = now();
        if (db) {
          await db.query(
            `INSERT INTO holo_blog_cache (id, articles, fetched_at) VALUES (1, $1::jsonb, NOW())
             ON CONFLICT (id) DO UPDATE SET articles = EXCLUDED.articles, fetched_at = EXCLUDED.fetched_at`,
            [JSON.stringify(next)]
          ).catch((e) => log(`Holo blog: copy not saved (${String(e.message || e).slice(0, 120)})`));
        }
        if (changed) log(`Holo blog: ${next.length} published article(s) read from Holo`);
        return { ok: true, count: next.length };
      } catch (e) {
        log(`Holo blog: not refreshed, keeping the ${articles.length} article(s) already held (${String(e.message || e).slice(0, 160)})`);
        return { ok: false, reason: String(e.message || e) };
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  // What a page asks for. The first ever request waits (briefly) for Holo;
  // after that a page is served from the copy held and a refresh runs behind
  // it when the copy is more than 15 minutes old.
  async function list() {
    if (!enabled()) return [];
    await loadSaved();
    if (!fetchedAt && !checkedAt) {
      await Promise.race([refresh(), new Promise((r) => setTimeout(r, 4000))]);
    } else if (now() - Math.max(fetchedAt, checkedAt) > REFRESH_MS) {
      refresh().catch(() => {});
    }
    return articles;
  }
  async function find(slug) {
    const s = String(slug || '').toLowerCase();
    if (!SLUG_RE.test(s)) return null;
    return (await list()).find((a) => a.slug === s) || null;
  }
  // For the footer and the sitemap: what is held now, without waiting.
  const held = () => (enabled() ? articles : []);

  return { enabled, list, find, held, refresh, loadSaved };
}

module.exports = { createBlog, parseEmbed, cleanArticle, cleanArticles, cleanContent, embedId, embedUrl, describeStatus, SLUG_RE };
