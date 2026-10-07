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
  for (const p of PATHS) {
    for (const [size, opts] of SIZES) {
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
      page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
      const url = BASE + p;
      const r = { path: p, size, url, status: null, finalUrl: null, title: null, h1: null, canonical: null, robotsMeta: null, xRobotsTag: null, selfLinks: null, inSitemap: sitemap.includes('<loc>' + BASE + p + '</loc>'), overflow: null, height: null, dashes: null, consoleErrors, pageErrors, screenshot: null, topScreenshot: null, error: null };
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
          dashes: (document.body.innerText.match(/.{0,40}[\u2013\u2014].{0,40}/g) || []).map((x) => x.replace(/\s+/g, ' ').trim())
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
    lines.push(`- Robots: meta ${r.robotsMeta || '(none)'}; X-Robots-Tag ${r.xRobotsTag || '(none)'}; in sitemap.xml: ${r.inSitemap ? 'yes' : 'no'}; links to itself on the page: ${r.selfLinks === null ? 'unknown' : r.selfLinks}`);
    lines.push(`- Em or en dashes in the visible text: ${r.dashes ? r.dashes.length : 'unknown'}${r.dashes && r.dashes.length ? ' (' + r.dashes.join(' | ') + ')' : ''}`);
    lines.push(`- Horizontal overflow: ${r.overflow === null ? 'unknown' : r.overflow ? 'YES' : 'no'}; page height ${r.height}px`);
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
