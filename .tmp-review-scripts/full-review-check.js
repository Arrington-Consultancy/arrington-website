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

async function inspectPage(context, urlPath, name, viewport) {
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

  let mainResponse = null;
  page.on('response', resp => {
    if (resp.url() === BASE + urlPath || resp.url() === BASE + urlPath + '/') {
      if (!mainResponse) mainResponse = resp;
    }
  });

  const record = { path: urlPath, viewport: viewport.name };
  try {
    const resp = await page.goto(BASE + urlPath, { waitUntil: 'domcontentloaded', timeout: 25000 });
    record.status = resp ? resp.status() : null;
    await page.waitForTimeout(1200);

    record.title = await page.title();
    record.metaDescription = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);
    record.canonical = await page.locator('link[rel="canonical"]').getAttribute('href').catch(() => null);
    record.ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content').catch(() => null);
    record.ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content').catch(() => null);
    record.ogImage = await page.locator('meta[property="og:image"]').getAttribute('content').catch(() => null);
    record.robotsMeta = await page.locator('meta[name="robots"]').getAttribute('content').catch(() => null);
    record.jsonLdCount = await page.locator('script[type="application/ld+json"]').count();
    record.jsonLd = [];
    const jsonLdCount = await page.locator('script[type="application/ld+json"]').count();
    for (let i = 0; i < jsonLdCount; i++) {
      record.jsonLd.push(await page.locator('script[type="application/ld+json"]').nth(i).innerText().catch(() => ''));
    }
    record.h1s = await page.locator('h1').allInnerTexts();
    record.h1Count = record.h1s.length;

    if (viewport.name === 'desktop') {
      const hrefs = await page.locator('a[href]').evaluateAll(els => els.map(e => e.getAttribute('href')));
      for (const h of hrefs) {
        if (!h) continue;
        if (h.startsWith('/') && !h.startsWith('//')) allInternalLinks.add(h);
        else if (h.startsWith(BASE)) allInternalLinks.add(h.slice(BASE.length) || '/');
      }
      record.internalLinkCount = hrefs.filter(h => h && (h.startsWith('/') || h.startsWith(BASE))).length;

      // Full page text for content review
      record.bodyText = await page.locator('body').innerText().catch(() => '');
    }

    record.consoleIssues = consoleMsgs;
    record.pageErrors = pageErrors;

    const shotPath = path.join(OUT, viewport.name, `${name}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
  } catch (e) {
    record.error = String(e).slice(0, 500);
  }
  await page.close();
  return record;
}

(async () => {
  const browser = await chromium.launch();

  const desktopCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  for (const [p, name] of pages) {
    console.log('desktop:', p);
    results[`desktop:${p}`] = await inspectPage(desktopCtx, p, name, { name: 'desktop' });
  }
  await desktopCtx.close();

  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  for (const [p, name] of pages) {
    console.log('mobile:', p);
    results[`mobile:${p}`] = await inspectPage(mobileCtx, p, name, { name: 'mobile' });
  }
  await mobileCtx.close();

  // Mobile hamburger menu screenshot
  const mpage = await mobileCtx.newPage().catch(() => null);

  await browser.close();

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT, 'internal-links.json'), JSON.stringify([...allInternalLinks].sort(), null, 2));
  console.log('DONE. Internal links found:', allInternalLinks.size);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
