'use strict';
// One-off probe of a third-party embed (Holo blog widget) before it is
// considered for the site. Runs on a GitHub runner: saves the script's
// source, loads it on a stand-in page served under our own address (the
// live site is never touched or requested), and records every request it
// makes, what it puts on the page, and what a strict CSP would refuse.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const EMBED = process.env.EMBED_URL;
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'screens-out');
const PAGE_URL = 'https://www.arringtonconsultancy.com/holo-probe';
const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Probe</title></head><body><h1>Probe</h1><div id="holo-blog"></div><script src="${EMBED}" defer></script></body></html>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const src = await fetch(EMBED);
  const text = await src.text();
  fs.writeFileSync(path.join(OUT, 'embed.js.txt'), text);
  const report = { embed: EMBED, status: src.status, contentType: src.headers.get('content-type'), bytes: text.length, runs: [] };

  const browser = await chromium.launch();
  for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', devices['iPhone 13']]]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const requests = []; const consoleLines = []; const bodies = {};
    page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text().slice(0, 300)}`));
    page.on('pageerror', (e) => consoleLines.push(`pageerror: ${String(e.message).slice(0, 300)}`));
    await page.route('**/*', async (route) => {
      const u = route.request().url();
      if (u === PAGE_URL) return route.fulfill({ status: 200, contentType: 'text/html', body: HTML });
      if (new URL(u).hostname.endsWith('arringtonconsultancy.com')) return route.abort();
      return route.continue();
    });
    page.on('response', async (res) => {
      const req = res.request();
      const entry = { url: res.url().slice(0, 300), method: req.method(), type: req.resourceType(), status: res.status(), contentType: res.headers()['content-type'] || '' };
      requests.push(entry);
      if (/json/.test(entry.contentType) && name === 'desktop') {
        try { bodies[res.url()] = (await res.text()).slice(0, 200000); } catch (e) { /* gone */ }
      }
    });
    await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => consoleLines.push(`goto: ${e.message}`));
    await page.waitForTimeout(4000);
    const dom = await page.evaluate(() => {
      const el = document.getElementById('holo-blog');
      return {
        html: el ? el.innerHTML : null,
        text: el ? el.innerText.slice(0, 20000) : null,
        links: el ? [...el.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), text: a.innerText.slice(0, 120), target: a.target, rel: a.rel })).slice(0, 200) : [],
        images: el ? [...el.querySelectorAll('img')].map((i) => i.src).slice(0, 100) : [],
        inlineStyleAttrs: el ? el.querySelectorAll('[style]').length : 0,
        styleTagsAdded: [...document.querySelectorAll('style')].map((s) => s.textContent.length),
        scriptsOnPage: [...document.scripts].map((s) => s.src || `inline(${s.textContent.length})`),
        iframes: [...document.querySelectorAll('iframe')].map((f) => f.src),
        headAdded: [...document.head.children].map((c) => c.outerHTML.slice(0, 300)),
        cookies: document.cookie,
        storage: Object.keys(localStorage),
        url: location.href
      };
    });
    if (name === 'desktop') {
      fs.writeFileSync(path.join(OUT, 'rendered.html'), dom.html || '');
      fs.writeFileSync(path.join(OUT, 'api-bodies.json'), JSON.stringify(bodies, null, 1));
    }
    await page.screenshot({ path: path.join(OUT, `${name}-list.png`), fullPage: true });
    // Open the first article, if the widget has one, to see how it shows.
    let article = null;
    try {
      const first = page.locator('#holo-blog a, #holo-blog [role="button"], #holo-blog article').first();
      if (await first.count()) {
        await first.click({ timeout: 5000 });
        await page.waitForTimeout(3000);
        article = await page.evaluate(() => ({ url: location.href, title: document.title, text: (document.getElementById('holo-blog') || document.body).innerText.slice(0, 6000) }));
        await page.screenshot({ path: path.join(OUT, `${name}-article.png`), fullPage: true });
      }
    } catch (e) { article = { error: String(e.message).slice(0, 200) }; }
    report.runs.push({ name, requests, console: consoleLines, dom: { ...dom, html: undefined, text: (dom.text || '').slice(0, 3000) }, article });
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ status: report.status, bytes: report.bytes, hosts: [...new Set(report.runs.flatMap((r) => r.requests.map((q) => new URL(q.url).host)))] }));
})().catch((e) => { console.error(e); process.exit(1); });
