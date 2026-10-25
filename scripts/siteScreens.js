'use strict';

// Inspection of ANY public URL, run on a GitHub Actions runner (the Claude
// build sandbox cannot reach outside sites, by egress policy). Added
// 15/10/2026 for two jobs that productionQa.js, which is tied to our own
// host, cannot do:
//   1. benchmarking other firms' websites (Tom: "lets look at award winning
//      taxi websites, this is our bench mark"), and
//   2. checking the taxi demo site, which runs on its own Railway URL.
//
// For each URL, at desktop (1440px) and iPhone 13, it records the status,
// title, description, first h1, whether a phone link and a booking button are
// visible on the first screen, whether the page itself carries a booking form
// or a third-party booking widget, structured data types, weight, load time,
// overflow and errors, and takes a first-screen and a full-page capture
// (the full page is cut at 9000px so a long page does not produce a
// 30MB image). With LIGHTHOUSE=1 it also runs Lighthouse's mobile audit
// (performance, accessibility, best practices, SEO) once per URL.
//
// It changes nothing anywhere: it only loads pages. Analytics and ad hits on
// other firms' pages are left alone, because what they send is part of what
// they are. On our own site they are dropped (25/10/2026), in the browser and
// in Lighthouse, the same list productionQa.js drops: a run opened with a
// ?gclid= would otherwise land in GA4 as a paid visit that never happened.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium, devices } = require('playwright');

const URLS = (process.env.SCREEN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'screens-out');
const RUN_LIGHTHOUSE = process.env.LIGHTHOUSE === '1' || process.env.LIGHTHOUSE === 'true';
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  ['desktop', { viewport: { width: 1440, height: 1000 } }],
  ['mobile', { ...devices['iPhone 13'] }]
];
const MAX_FULL_HEIGHT = 9000;

const OWN_SITE = /^https?:\/\/([a-z0-9-]+\.)*arringtonconsultancy\.(com|co\.uk)(\/|$)/i;
const OWN_VISIT_HITS = /google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect|stats\.g\.doubleclick\.net|googleads\.g\.doubleclick\.net|googleadservices\.com\/pagead|google\.com\/pagead|google\.co\.uk\/pagead|connect\.facebook\.net|facebook\.com\/tr/;
const OWN_VISIT_PATTERNS = ['*google-analytics.com/g/collect*', '*analytics.google.com/g/collect*', '*stats.g.doubleclick.net*',
  '*googleads.g.doubleclick.net*', '*googleadservices.com/pagead*', '*google.com/pagead*', '*google.co.uk/pagead*',
  '*connect.facebook.net*', '*facebook.com/tr*'];

function slug(u) {
  return u.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '').toLowerCase().slice(0, 60);
}

function lighthouse(url) {
  const file = path.join(OUT, `${slug(url)}-lighthouse.json`);
  try {
    const blocked = OWN_SITE.test(url) ? OWN_VISIT_PATTERNS.map((p) => `--blocked-url-patterns=${p}`) : [];
    execFileSync('npx', ['--no-install', 'lighthouse', url, '--quiet', '--output=json', `--output-path=${file}`,
      '--only-categories=performance,accessibility,best-practices,seo', ...blocked,
      '--chrome-flags=--headless=new --no-sandbox'], { env: { ...process.env, CHROME_PATH: chromium.executablePath() }, timeout: 180000, stdio: 'ignore' });
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const score = (k) => (j.categories[k] && j.categories[k].score !== null ? Math.round(j.categories[k].score * 100) : null);
    const num = (k) => (j.audits[k] ? j.audits[k].displayValue || null : null);
    // Keep only the summary: the full report is several MB per URL.
    fs.unlinkSync(file);
    // Which elements moved, so a layout shift can be traced to its cause
    // rather than guessed at (added 16/10/2026).
    const shiftItems = (j.audits['layout-shifts'] && j.audits['layout-shifts'].details && j.audits['layout-shifts'].details.items) || [];
    const shifts = shiftItems.slice(0, 5).map((i) => ({ score: i.score, node: i.node ? (i.node.selector || i.node.snippet || i.node.nodeLabel) : null, snippet: i.node ? String(i.node.snippet || '').slice(0, 160) : null }));
    // Which element was the largest paint, so a slow LCP names its cause
    // (added 25/10/2026 for the taxi websites page check).
    let lcpElement = null;
    try {
      const d = j.audits['largest-contentful-paint-element'].details;
      const node = d.items && d.items[0] && (d.items[0].node || (d.items[0].items && d.items[0].items[0] && d.items[0].items[0].node));
      if (node) lcpElement = String(node.snippet || node.selector || node.nodeLabel || '').slice(0, 160);
    } catch (e) { /* audit absent */ }
    // Why the first paint waits (25/10/2026): the server's response time,
    // what blocks rendering, and how the largest paint's time splits up.
    const ttfb = num('server-response-time');
    const blocking = (((j.audits['render-blocking-resources'] || {}).details || {}).items || [])
      .slice(0, 6).map((i) => `${String(i.url || '').replace(/^https?:\/\//, '').slice(0, 90)} (${Math.round(i.wastedMs || 0)}ms)`);
    let lcpPhases = null;
    try {
      const d = j.audits['largest-contentful-paint-element'].details;
      const tbl = (d.items || []).find((t) => t.type === 'table' && t.items && t.items.some((r) => r.phase));
      if (tbl) lcpPhases = tbl.items.map((r) => `${r.phase} ${Math.round(r.timing)}ms`).join(', ');
    } catch (e) { /* audit absent */ }
    return {
      ttfb, blocking, lcpPhases,
      performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo'),
      lcp: num('largest-contentful-paint'), cls: num('cumulative-layout-shift'), tbt: num('total-blocking-time'), fcp: num('first-contentful-paint'),
      speedIndex: num('speed-index'), lcpElement,
      shifts
    };
  } catch (e) {
    return { error: String(e.message || e).slice(0, 200) };
  }
}

(async () => {
  if (!URLS.length) throw new Error('SCREEN_URLS is empty');
  const browser = await chromium.launch();
  const results = [];
  for (const url of URLS) {
    for (const [size, opts] of SIZES) {
      const ctx = await browser.newContext(opts);
      if (OWN_SITE.test(url)) await ctx.route(OWN_VISIT_HITS, (route) => route.abort());
      const page = await ctx.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
      const r = { url, size, status: null, finalUrl: null, error: null, pageErrors, top: null, full: null };
      try {
        const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        r.status = resp ? resp.status() : null;
        r.finalUrl = page.url();
        await page.waitForTimeout(2500);
        const top = `${slug(url)}-${size}-top.png`;
        await page.screenshot({ path: path.join(OUT, top), fullPage: false });
        r.top = top;
        Object.assign(r, await page.evaluate(() => {
          const vis = (el) => {
            const b = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return b.width > 0 && b.height > 0 && b.top < window.innerHeight && b.bottom > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
          };
          const text = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
          const telLinks = [...document.querySelectorAll('a[href^="tel:"]')];
          const bookish = [...document.querySelectorAll('a, button')].filter((el) => /\bbook\b|get a quote|get a price|book now|book online/i.test(text(el)));
          const forms = [...document.querySelectorAll('form')].map((f) => ({
            fields: f.querySelectorAll('input:not([type=hidden]):not([type=submit]), select, textarea').length,
            text: text(f).slice(0, 80)
          })).filter((f) => f.fields >= 3);
          const iframes = [...document.querySelectorAll('iframe')].map((i) => i.src).filter(Boolean).map((s) => { try { return new URL(s).hostname; } catch (e) { return s.slice(0, 60); } });
          const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((x) => {
            try {
              const j = JSON.parse(x.textContent);
              const items = Array.isArray(j) ? j : (j['@graph'] || [j]);
              return items.map((i) => [].concat(i['@type'] || '?').join('/')).join(', ');
            } catch (e) { return 'INVALID JSON'; }
          });
          const res = performance.getEntriesByType('resource');
          const nav = performance.getEntriesByType('navigation')[0];
          const fonts = [...new Set([...document.querySelectorAll('h1, h2, p, a, button')].slice(0, 80).map((el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim()))].slice(0, 6);
          return {
            title: document.title,
            description: (document.querySelector('meta[name="description"]') || {}).content || null,
            h1: document.querySelector('h1') ? text(document.querySelector('h1')).slice(0, 160) : null,
            phoneLinks: telLinks.length,
            phoneFirstScreen: telLinks.some(vis),
            phoneText: telLinks.length ? text(telLinks[0]).slice(0, 40) : null,
            bookButtons: bookish.length,
            bookFirstScreen: bookish.filter(vis).map((el) => text(el).slice(0, 40)).slice(0, 4),
            forms,
            iframes: [...new Set(iframes)],
            jsonLd: ld,
            fonts,
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            height: document.body.scrollHeight,
            words: (document.body.innerText.match(/[A-Za-z0-9£]+/g) || []).length,
            pageKb: Math.round((res.reduce((t, x) => t + (x.transferSize || 0), 0) + (nav ? nav.transferSize || 0 : 0)) / 1024),
            requests: res.length + 1,
            loadMs: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
            h2s: [...document.querySelectorAll('h2')].map(text).filter(Boolean).slice(0, 14)
          };
        }));
        const full = `${slug(url)}-${size}.png`;
        const height = Math.min(r.height || 0, MAX_FULL_HEIGHT);
        await page.screenshot({ path: path.join(OUT, full), fullPage: true, clip: { x: 0, y: 0, width: page.viewportSize().width, height: Math.max(height, page.viewportSize().height) } });
        r.full = full;
        if (size === 'desktop') fs.writeFileSync(path.join(OUT, `${slug(url)}.txt`), await page.evaluate(() => document.body.innerText));
      } catch (e) {
        r.error = String(e).slice(0, 300);
      }
      results.push(r);
      await ctx.close();
    }
  }
  // A real test booking on the taxi demo (DEMO_BOOKING=<demo base URL>): fill
  // the form on a phone, send it, and record what dispatch sends back. The
  // demo's mock dispatch is the only thing that receives it.
  let booking = null;
  if (process.env.DEMO_BOOKING) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    booking = { pageErrors: [] };
    page.on('pageerror', (e) => booking.pageErrors.push(String(e).slice(0, 160)));
    try {
      const base = process.env.DEMO_BOOKING.replace(/\/$/, '');
      await page.goto(base + '/book', { waitUntil: 'load', timeout: 60000 });
      await page.fill('#pickup', 'Exmouth railway station');
      await page.fill('#destination', 'Exeter Airport');
      await page.fill('#name', 'Site Screens Check');
      await page.fill('#phone', '07700 900999');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1200);
      booking.priceShown = (await page.textContent('[data-quote-out]')).replace(/\s+/g, ' ').trim();
      await Promise.all([page.waitForURL(/\/booking\//, { timeout: 30000 }), page.click('button[type=submit]')]);
      booking.confirmationUrl = page.url();
      booking.ref = (await page.textContent('[data-ref]')).trim();
      await page.screenshot({ path: path.join(OUT, 'demo-booking-received.png') });
      // Polled from here rather than with waitForFunction: the demo's CSP
      // refuses string evaluation, which older Playwright uses to poll.
      for (let i = 0; i < 30 && (await page.getAttribute('[data-status]', 'data-state')) !== 'allocated'; i++) await page.waitForTimeout(1000);
      booking.state = await page.getAttribute('[data-status]', 'data-state');
      booking.driverText = (await page.textContent('[data-timeline] li:last-child')).replace(/\s+/g, ' ').trim();
      await page.evaluate(() => window.scrollTo(0, 188));
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, 'demo-booking-allocated.png') });
    } catch (e) {
      booking.error = String(e).slice(0, 300);
    }
    await ctx.close();
  }
  await browser.close();

  const lh = {};
  if (RUN_LIGHTHOUSE) for (const u of URLS) lh[u] = lighthouse(u);

  const ranAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ranAt, results, lighthouse: lh, booking }, null, 2));
  const lines = [`# Site inspection, ${ranAt}`, ''];
  if (booking) {
    lines.push('## Demo test booking');
    lines.push(booking.error ? `- ERROR: ${booking.error}` : `- Price shown before booking: ${booking.priceShown}\n- Reference from dispatch: ${booking.ref}\n- Status reached: ${booking.state}\n- Driver step: ${booking.driverText}\n- Confirmation page: ${booking.confirmationUrl}`);
    lines.push(`- Page errors: ${booking.pageErrors.length}${booking.pageErrors.length ? ' (' + booking.pageErrors.join(' | ') + ')' : ''}`);
    lines.push('- Screens: demo-booking-received.png, demo-booking-allocated.png', '');
  }
  for (const u of URLS) {
    lines.push(`## ${u}`);
    const l = lh[u];
    if (l) lines.push(l.error ? `- Lighthouse (mobile): ERROR ${l.error}` : `- Lighthouse (mobile): performance ${l.performance}, accessibility ${l.accessibility}, best practices ${l.bestPractices}, SEO ${l.seo}; LCP ${l.lcp}, CLS ${l.cls}, TBT ${l.tbt}, FCP ${l.fcp}, speed index ${l.speedIndex}`);
    if (l && l.lcpElement) lines.push(`  - Largest paint: ${l.lcpElement}`);
    if (l && !l.error) lines.push(`  - Server response ${l.ttfb}; render-blocking: ${l.blocking && l.blocking.length ? l.blocking.join(' | ') : 'none'}${l.lcpPhases ? `; largest paint split: ${l.lcpPhases}` : ''}`);
    if (l && l.shifts && l.shifts.length) for (const s of l.shifts) lines.push(`  - Layout shift ${s.score}: ${s.node} ${s.snippet || ''}`);
    for (const r of results.filter((x) => x.url === u)) {
      if (r.error) { lines.push(`- ${r.size}: ERROR ${r.error}`); continue; }
      lines.push(`- ${r.size}: HTTP ${r.status}${r.finalUrl !== u ? ` (landed on ${r.finalUrl})` : ''}; ${r.pageKb}KB in ${r.requests} requests, load ${r.loadMs}ms; height ${r.height}px; words ${r.words}; overflow ${r.overflow ? 'YES' : 'no'}; page errors ${r.pageErrors.length}`);
      lines.push(`  - Phone: ${r.phoneLinks} tel link(s)${r.phoneText ? ` ("${r.phoneText}")` : ''}, on first screen: ${r.phoneFirstScreen ? 'yes' : 'no'}; booking buttons ${r.bookButtons}, on first screen: ${r.bookFirstScreen.length ? r.bookFirstScreen.map((t) => `"${t}"`).join(', ') : 'none'}`);
      lines.push(`  - Booking form on the page: ${r.forms.length ? r.forms.map((f) => `${f.fields} fields`).join('; ') : 'none'}; iframes: ${r.iframes.length ? r.iframes.join(', ') : 'none'}`);
      if (r.size === 'desktop') {
        lines.push(`  - Title: ${r.title}`);
        lines.push(`  - Description: ${r.description || '(none)'}`);
        lines.push(`  - h1: ${r.h1 || '(none)'}; h2: ${r.h2s.join(' | ')}`);
        lines.push(`  - Structured data: ${r.jsonLd.length ? r.jsonLd.join(' | ') : 'none'}; fonts: ${r.fonts.join(', ')}`);
      }
      lines.push(`  - Screens: ${r.top}, ${r.full}`);
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'));
  console.log(lines.join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
