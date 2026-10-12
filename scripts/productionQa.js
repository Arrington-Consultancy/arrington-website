'use strict';

// Production page inspection, run on a GitHub Actions runner (which can reach
// the public site; the Claude build sandbox cannot, by egress policy). For
// each path it opens the real production URL in Chromium, desktop (1440px)
// and iPhone 13, scrolls through so every reveal fires, and records:
//   - the HTTP status of the document request and the final URL,
//   - page errors and console errors (third-party tag failures included,
//     because on the real site they are real),
//   - horizontal overflow (document wider than the viewport),
//   - the <title>, the first h1 and the canonical href,
//   - a full-page screenshot per size, plus a first-screen (viewport)
//     capture, which is what a visitor sees first and shows the fixed nav
//     where it really sits.
// Output goes to OUT_DIR as report.json, report.md and PNGs. The workflow
// commits that directory to the production-qa branch so the sandbox can
// fetch it and the screenshots can be read there.
//
// This is an inspection aid, not a gate: it never changes anything on the
// site, and a human still reads the screenshots.

const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const BASE = process.env.QA_BASE_URL || 'https://www.arringtonconsultancy.com';
// The token "sitemap" expands to every path in the live sitemap.xml, so a
// whole-site read (the voice sweep, 07/10/2026) needs no hand-kept list.
const RAW_PATHS = (process.env.QA_PATHS || '/').split(',').map((p) => p.trim()).filter(Boolean);

// Whether each inspected path is listed in the live sitemap. Fetched once,
// so a hidden page (noindex, out of the sitemap) can be confirmed absent
// from the same run that confirms it is served. Added 06/10/2026.
async function sitemapText() {
  try {
    const res = await fetch(BASE + '/sitemap.xml');
    return res.ok ? await res.text() : '';
  } catch (e) {
    return '';
  }
}
// The page's head as the SERVER sends it, read with a plain fetch and no
// JavaScript (11/10/2026, SEO metadata brief: confirm the metadata does not
// depend on scripts, and that each tag appears once). Also counts the Google
// tag lines, so a metadata change can be shown not to have touched tracking.
async function rawHead(url) {
  const decode = (t) => t.replace(/&#34;|&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const html = await res.text();
    const head = html.slice(0, html.indexOf('</head>') + 7);
    const all = (re) => [...head.matchAll(re)].map((m) => decode(m[1].trim()));
    return {
      titles: all(/<title>([\s\S]*?)<\/title>/g),
      descriptions: all(/<meta name="description" content="([^"]*)"/g),
      canonicals: all(/<link rel="canonical" href="([^"]*)"/g),
      ogTitles: all(/<meta property="og:title" content="([^"]*)"/g),
      ldBlocks: (html.match(/<script type="application\/ld\+json"/g) || []).length,
      googleTagLoaders: (html.match(/googletagmanager\.com\/gtag\/js/g) || []).length,
      adsConfigs: (html.match(/gtag\('config', 'AW-/g) || []).length
    };
  } catch (e) {
    return { error: String(e).slice(0, 200) };
  }
}

const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'qa-out');
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  ['desktop', { viewport: { width: 1440, height: 1000 } }],
  ['mobile', { ...devices['iPhone 13'] }]
];

function slug(p) {
  return p === '/' ? 'home' : p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

(async () => {
  const sitemap = await sitemapText();
  const fromSitemap = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(BASE, '') || '/');
  const PATHS = [...new Set(RAW_PATHS.flatMap((p) => (p === 'sitemap' ? fromSitemap : [p])))];
  const browser = await chromium.launch();
  const results = [];
  const raws = {};
  for (const p of PATHS) raws[p] = await rawHead(BASE + p);
  for (const p of PATHS) {
    for (const [size, opts] of SIZES) {
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
      page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
      // Requests to Clarity's collect endpoint, so the report shows the tag
      // actually sending recordings rather than merely loading. Added
      // 12/10/2026 when CLARITY_PROJECT_ID went live.
      const clarityCollect = [];
      page.on('response', (res) => { if (/\.clarity\.ms\/collect/.test(res.url())) clarityCollect.push(res.status()); });
      page.on('requestfailed', (req) => { if (/\.clarity\.ms\/collect/.test(req.url())) clarityCollect.push('failed'); });
      const url = BASE + p;
      const r = { path: p, size, url, status: null, finalUrl: null, title: null, h1: null, canonical: null, robotsMeta: null, xRobotsTag: null, selfLinks: null, inSitemap: sitemap.includes('<loc>' + BASE + p + '</loc>'), overflow: null, height: null, dashes: null, consoleErrors, pageErrors, clarityCollect, screenshot: null, topScreenshot: null, error: null };
      try {
        const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        r.status = resp ? resp.status() : null;
        r.xRobotsTag = resp ? (resp.headers()['x-robots-tag'] || null) : null;
        r.finalUrl = page.url();
        const h = await page.evaluate(() => document.body.scrollHeight);
        for (let y = 0; y < h; y += 350) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(90); }
        await page.waitForTimeout(600);
        await page.evaluate(() => window.scrollTo(0, 0));
        // The nav is position: fixed. A full-page capture resizes the
        // viewport to the page height and stitches, and Chromium can draw a
        // fixed element wherever the capture's internal scroll left it, so
        // the nav landed mid-image on the first run. The plain viewport
        // capture below is what a visitor actually sees first, nav included.
        await page.waitForTimeout(1200);
        const top = `${slug(p)}-${size}-top.png`;
        await page.screenshot({ path: path.join(OUT, top), fullPage: false });
        r.topScreenshot = top;
        Object.assign(r, await page.evaluate(() => ({
          title: document.title,
          h1: (document.querySelector('h1') || {}).textContent ? document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim() : null,
          canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
          robotsMeta: (document.querySelector('meta[name="robots"]') || {}).content || null,
          // Anchors on this page pointing at this same path: a hidden page
          // should have none in the shared header or footer.
          selfLinks: [...document.querySelectorAll('a[href]')].filter((a) => a.getAttribute('href') === location.pathname).length,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          height: document.body.scrollHeight,
          // Every em or en dash in the text a visitor reads, with a little
          // context, so CMS copy the sandbox cannot read is checked live
          // (Tom, 06/10/2026: no dashes on the site). Added 06/10/2026.
          dashes: (document.body.innerText.match(/.{0,40}[\u2013\u2014].{0,40}/g) || []).map((x) => x.replace(/\s+/g, ' ').trim()),
          // How far down the page the enquiry form starts, in pixels and in
          // screen heights, so "how many phone screens before the form" is
          // measured on the live page rather than estimated. Added 11/10/2026
          // for the Google Ads conversion brief.
          form: (() => {
            const f = document.querySelector('#leadForm');
            if (!f) return null;
            const top = f.getBoundingClientRect().top + window.scrollY;
            return { top: Math.round(top), screens: Math.round((top / window.innerHeight) * 10) / 10, viewport: window.innerHeight };
          })(),
          // The first primary button on the page and where it points.
          heroCta: (() => {
            const a = document.querySelector('main a.btn-primary, section a.btn-primary, a.btn-primary');
            return a ? { text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') } : null;
          })(),
          // Whether the gated-PDF email box is showing without a click.
          docModalOpen: (() => {
            const o = document.querySelector('#docModalOverlay');
            if (!o) return null;
            const cs = getComputedStyle(o);
            return cs.display !== 'none' && cs.visibility !== 'hidden' && !o.hasAttribute('hidden') && o.getBoundingClientRect().height > 0;
          })(),
          docRequestButtons: document.querySelectorAll('.js-doc-request').length,
          // Microsoft Clarity: the project id is part of the tag URL.
          clarity: (() => {
            const s = [...document.scripts].find((x) => /clarity\.ms\/tag\//.test(x.src || ''));
            return s ? s.src.split('/tag/')[1] : (typeof window.clarity === 'function' ? 'loaded (id not in a script src)' : null);
          })(),
          // Search engine facts about the page, for the SEO sweep of
          // 11/10/2026: what Google is shown (title, description, social
          // tags, structured data), the heading outline, images with no alt
          // text, the internal links the page gives, and how heavy it is.
          seo: (() => {
            const meta = (sel) => { const m = document.querySelector(sel); return m ? (m.getAttribute('content') || '') : null; };
            const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((x) => {
              try {
                const j = JSON.parse(x.textContent);
                const items = Array.isArray(j) ? j : (j['@graph'] || [j]);
                return items.map((i) => [].concat(i['@type'] || '?').join('/')).join(', ');
              } catch (e) { return 'INVALID JSON'; }
            });
            const imgs = [...document.images];
            const res = performance.getEntriesByType('resource');
            const nav = performance.getEntriesByType('navigation')[0];
            const kb = (n) => Math.round(n / 1024);
            const internal = [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
              .filter((h) => /^\/(?!\/)/.test(h)).map((h) => h.split('#')[0].split('?')[0] || '/'))];
            return {
              lang: document.documentElement.getAttribute('lang'),
              description: meta('meta[name="description"]'),
              ogTitle: meta('meta[property="og:title"]'),
              ogImage: meta('meta[property="og:image"]'),
              jsonLd: ld,
              h1s: [...document.querySelectorAll('h1')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
              h2s: [...document.querySelectorAll('h2')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()).slice(0, 25),
              words: (document.body.innerText.match(/[A-Za-z0-9\u00a3]+/g) || []).length,
              images: imgs.length,
              imagesNoAlt: imgs.filter((i) => !i.hasAttribute('alt')).map((i) => i.getAttribute('src')),
              imagesEmptyAlt: imgs.filter((i) => i.getAttribute('alt') === '').length,
              internal,
              pageKb: kb(res.reduce((t, r) => t + (r.transferSize || 0), 0) + (nav ? nav.transferSize || 0 : 0)),
              heaviest: res.filter((r) => r.transferSize > 60000).sort((x, y) => y.transferSize - x.transferSize).slice(0, 3).map((r) => r.name.replace(location.origin, '') + ' ' + kb(r.transferSize) + 'KB'),
              loadMs: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null
            };
          })()
        })));
        // The visible text of the page as a visitor reads it, desktop only,
        // so live CMS copy (which the sandbox cannot read from the database)
        // can be reviewed word for word. Added 07/10/2026 for the voice sweep.
        if (size === 'desktop') {
          fs.writeFileSync(path.join(OUT, `${slug(p)}.txt`), await page.evaluate(() => document.body.innerText));
        }
        const file = `${slug(p)}-${size}.png`;
        await page.screenshot({ path: path.join(OUT, file), fullPage: true });
        r.screenshot = file;
      } catch (e) {
        r.error = String(e).slice(0, 300);
      }
      r.raw = raws[p];
      results.push(r);
      await page.close();
      await ctx.close();
    }
  }
  await browser.close();

  const ranAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ranAt, base: BASE, results }, null, 2));
  const lines = [`# Production inspection, ${ranAt}`, '', `Base: ${BASE}`, ''];
  for (const r of results) {
    lines.push(`## ${r.path} (${r.size})`);
    lines.push(`- HTTP status: ${r.status === null ? 'no response' : r.status}${r.finalUrl && r.finalUrl !== r.url ? ` (landed on ${r.finalUrl})` : ''}`);
    lines.push(`- Title: ${r.title || '(none)'}`);
    lines.push(`- First h1: ${r.h1 || '(none)'}`);
    lines.push(`- Canonical: ${r.canonical || '(none)'}`);
    if (r.raw) {
      const w = r.raw;
      lines.push(w.error ? `- Server HTML (no JavaScript): ERROR ${w.error}` :
        `- Server HTML (no JavaScript): ${w.titles.length} title(s) ${JSON.stringify(w.titles)}; ${w.descriptions.length} description(s) ${JSON.stringify(w.descriptions)}; ${w.canonicals.length} canonical(s) ${JSON.stringify(w.canonicals)}; ${w.ogTitles.length} og:title; ${w.ldBlocks} structured data block(s); Google tag loader ${w.googleTagLoaders}, Ads config ${w.adsConfigs}`);
    }
    lines.push(`- Robots: meta ${r.robotsMeta || '(none)'}; X-Robots-Tag ${r.xRobotsTag || '(none)'}; in sitemap.xml: ${r.inSitemap ? 'yes' : 'no'}; links to itself on the page: ${r.selfLinks === null ? 'unknown' : r.selfLinks}`);
    lines.push(`- Em or en dashes in the visible text: ${r.dashes ? r.dashes.length : 'unknown'}${r.dashes && r.dashes.length ? ' (' + r.dashes.join(' | ') + ')' : ''}`);
    lines.push(`- Horizontal overflow: ${r.overflow === null ? 'unknown' : r.overflow ? 'YES' : 'no'}; page height ${r.height}px`);
    lines.push(`- Enquiry form starts: ${r.form ? `${r.form.top}px, ${r.form.screens} screen heights down (viewport ${r.form.viewport}px)` : 'no form found'}`);
    lines.push(`- First primary button: ${r.heroCta ? `"${r.heroCta.text}" -> ${r.heroCta.href}` : 'none'}`);
    lines.push(`- PDF email box open without a click: ${r.docModalOpen === null ? 'no box on the page' : r.docModalOpen ? 'YES' : 'no'}; PDF request buttons on the page: ${r.docRequestButtons}`);
    lines.push(`- Microsoft Clarity: ${r.clarity || 'not loaded'}; data sent to Clarity: ${r.clarityCollect.length} request(s)${r.clarityCollect.length ? ' (' + r.clarityCollect.join(', ') + ')' : ''}`);
    if (r.seo) {
      const sd = r.seo;
      lines.push(`- SEO: title ${r.title ? r.title.length : 0} chars; description ${sd.description === null ? 'MISSING' : sd.description.length + ' chars'}; h1 count ${sd.h1s.length}; words ${sd.words}; lang ${sd.lang || 'MISSING'}; og:image ${sd.ogImage ? 'yes' : 'no'}`);
      lines.push(`- Description: ${sd.description === null ? '(none)' : sd.description}`);
      lines.push(`- Structured data: ${sd.jsonLd.length ? sd.jsonLd.join(' | ') : 'none'}`);
      lines.push(`- Images: ${sd.images}, no alt attribute ${sd.imagesNoAlt.length}${sd.imagesNoAlt.length ? ' (' + sd.imagesNoAlt.join(', ') + ')' : ''}, empty alt ${sd.imagesEmptyAlt}`);
      lines.push(`- Weight: ${sd.pageKb}KB transferred, load ${sd.loadMs}ms${sd.heaviest.length ? '; heaviest ' + sd.heaviest.join(', ') : ''}`);
      lines.push(`- Internal links: ${sd.internal.length}; h2: ${sd.h2s.join(' | ')}`);
    }
    lines.push(`- Page errors: ${r.pageErrors.length}${r.pageErrors.length ? ' (' + r.pageErrors.join(' | ') + ')' : ''}`);
    lines.push(`- Console errors: ${r.consoleErrors.length}${r.consoleErrors.length ? ' (' + r.consoleErrors.join(' | ') + ')' : ''}`);
    lines.push(`- Screenshots: full page ${r.screenshot || 'none'}, first screen ${r.topScreenshot || 'none'}${r.error ? `; ERROR: ${r.error}` : ''}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'));
  console.log(lines.join('\n'));
  const failed = results.filter((r) => r.error || r.status !== 200);
  if (failed.length) {
    console.log(`\n${failed.length} page load(s) did not return 200 or threw.`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
