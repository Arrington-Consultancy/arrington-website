const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.arringtonconsultancy.com';
const OUT = 'review-output';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'desktop'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'mobile'), { recursive: true });

const pages = [
  ['/', 'home'],
  ['/what-we-do', 'what-we-do'],
  ['/websites-and-ai', 'websites-and-ai'],
  ['/evidence', 'evidence'],
  ['/about-us', 'about-us'],
  ['/book-a-30-minute-conversation', 'book-a-30-min'],
  ['/owner-check', 'owner-check'],
  ['/owner-dependency-quiz', 'owner-dependency-quiz'],
  ['/market-ready-test', 'market-ready-test'],
  ['/commercial-gaps-review', 'commercial-gaps-review'],
  ['/useful-thinking', 'useful-thinking'],
  ['/business-consultant-devon', 'business-consultant-devon'],
];

const results = {};
const allInternalLinks = new Set();

// A hard cap around each page's entire inspection so one bad page can never
// stall the whole run - if it doesn't finish in time, record the timeout and
// move on to the next page.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`hard timeout after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function inspectPage(context, urlPath, name, viewportName) {
  const page = await context.newPage();
  const consoleMsgs = [];
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('Content Security Policy') || t.includes('Refused to') || msg.type() === 'error') {
      consoleMsgs.push({ type: msg.type(), text: t.slice(0, 300) });
    }
  });
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err).slice(0, 300)));

  const record = { path: urlPath, viewport: viewportName };
  try {
    const resp = await page.goto(BASE + urlPath, { waitUntil: 'domcontentloaded', timeout: 20000 });
    record.status = resp ? resp.status() : null;
    await page.waitForTimeout(1000);

    // Single in-page evaluate call for everything DOM-related - no Playwright
    // actionability/visibility waits at all, so nothing here can hang on a
    // missing or non-visible element.
    const domData = await page.evaluate(() => {
      const attr = (sel, name) => { const el = document.querySelector(sel); return el ? el.getAttribute(name) : null; };
      const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(el => el.textContent);
      const h1s = Array.from(document.querySelectorAll('h1')).map(el => el.innerText);
      const hrefs = Array.from(document.querySelectorAll('a[href]')).map(el => el.getAttribute('href'));
      return {
        title: document.title,
        metaDescription: attr('meta[name="description"]', 'content'),
        canonical: attr('link[rel="canonical"]', 'href'),
        ogTitle: attr('meta[property="og:title"]', 'content'),
        ogDescription: attr('meta[property="og:description"]', 'content'),
        ogImage: attr('meta[property="og:image"]', 'content'),
        robotsMeta: attr('meta[name="robots"]', 'content'),
        jsonLd,
        h1s,
        hrefs,
        bodyText: document.body ? document.body.innerText : ''
      };
    });

    Object.assign(record, domData);
    record.jsonLdCount = domData.jsonLd.length;
    record.h1Count = domData.h1s.length;

    if (viewportName === 'desktop') {
      for (const h of domData.hrefs) {
        if (!h) continue;
        if (h.startsWith('/') && !h.startsWith('//')) allInternalLinks.add(h);
        else if (h.startsWith(BASE)) allInternalLinks.add(h.slice(BASE.length) || '/');
      }
      record.internalLinkCount = domData.hrefs.filter(h => h && (h.startsWith('/') || h.startsWith(BASE))).length;
    }
    delete record.hrefs; // keep the JSON small; allInternalLinks already captured them

    record.consoleIssues = consoleMsgs;
    record.pageErrors = pageErrors;

    const shotPath = path.join(OUT, viewportName, `${name}.png`);
    await page.screenshot({ path: shotPath, fullPage: true, timeout: 15000 });
  } catch (e) {
    record.error = String(e).slice(0, 500);
  }
  await page.close().catch(() => {});
  return record;
}

(async () => {
  const browser = await chromium.launch();

  const desktopCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  for (const [p, name] of pages) {
    console.log('desktop:', p);
    try {
      results[`desktop:${p}`] = await withTimeout(inspectPage(desktopCtx, p, name, 'desktop'), 40000, p);
    } catch (e) {
      console.log('  TIMED OUT:', p, e.message);
      results[`desktop:${p}`] = { path: p, viewport: 'desktop', error: e.message };
    }
  }
  await desktopCtx.close().catch(() => {});

  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  for (const [p, name] of pages) {
    console.log('mobile:', p);
    try {
      results[`mobile:${p}`] = await withTimeout(inspectPage(mobileCtx, p, name, 'mobile'), 40000, p);
    } catch (e) {
      console.log('  TIMED OUT:', p, e.message);
      results[`mobile:${p}`] = { path: p, viewport: 'mobile', error: e.message };
    }
  }
  await mobileCtx.close().catch(() => {});

  await browser.close();

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT, 'internal-links.json'), JSON.stringify([...allInternalLinks].sort(), null, 2));
  console.log('DONE. Internal links found:', allInternalLinks.size);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
