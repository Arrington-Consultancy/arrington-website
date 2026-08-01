// Read-only production verification for the Useful Thinking articles
// deploy: checks each article page, the library index, sitemap.xml, and
// collects console errors + broken internal links. No writes anywhere.
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'https://www.arringtonconsultancy.com';

const ARTICLES = [
  ['/useful-thinking/being-certain-isnt-the-same-as-being-right', "Being Certain Isn't the Same as Being Right", 'Sometimes even your own eyes give you the wrong answer'],
  ['/useful-thinking/the-customer-who-messaged-me-at-4am', 'The Customer Who Messaged Me at 4am', 'Marks and Spencer'],
  ['/useful-thinking/you-dont-get-to-decide-when-youve-made-things-right', "You Don't Get to Decide When You've Made Things Right", 'it hurts now, and rightly so'],
  ['/useful-thinking/the-tightrope-between-staff-loyalty-and-damage-control', 'The Tightrope Between Staff Loyalty and Damage Control', 'Trust me, I have tried']
];

const HELD_ARTICLE = '/useful-thinking/the-reverse-economy-of-scale';

(async () => {
  const browser = await chromium.launch();
  const results = { articles: [], library: null, held: null, sitemap: null, links: [] };

  for (const [path, title, mustContain] of ARTICLES) {
    const consoleErrors = [];
    const page = await browser.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
    page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 200)));
    try {
      const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 20000 });
      const html = await page.content();
      const titleMatch = html.includes(title);
      const bodyMatch = html.includes(mustContain);
      const canonical = await page.evaluate(() => document.querySelector('link[rel="canonical"]')?.href || null);
      results.articles.push({ path, status: resp.status(), titleMatch, bodyMatch, canonical, consoleErrors });
    } catch (e) {
      results.articles.push({ path, error: String(e).slice(0, 300), consoleErrors });
    }
    await page.close();
  }

  // Held article must NOT be reachable
  {
    const page = await browser.newPage();
    try {
      const resp = await page.goto(BASE + HELD_ARTICLE, { waitUntil: 'domcontentloaded', timeout: 20000 });
      results.held = { status: resp.status() };
    } catch (e) {
      results.held = { error: String(e).slice(0, 200) };
    }
    await page.close();
  }

  // Library index
  {
    const consoleErrors = [];
    const page = await browser.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
    page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 200)));
    const resp = await page.goto(BASE + '/useful-thinking', { waitUntil: 'networkidle', timeout: 20000 });
    const html = await page.content();
    const links = [...html.matchAll(/href="(\/useful-thinking\/[a-z0-9-]+)"/g)].map(m => m[1]);
    const cashFlowStillThere = html.includes('Cash Flow') && html.includes('Fixed Overheads');
    results.library = { status: resp.status(), links: [...new Set(links)], cashFlowStillThere, consoleErrors };
    await page.close();
  }

  // Sitemap
  {
    const resp = await fetch(BASE + '/sitemap.xml');
    const xml = await resp.text();
    const utUrls = [...xml.matchAll(/<loc>([^<]*useful-thinking[^<]*)<\/loc>/g)].map(m => m[1]);
    results.sitemap = { status: resp.status, utUrls };
  }

  // Check every internal link found actually resolves
  const allLinks = new Set([...ARTICLES.map(a => a[0]), '/useful-thinking', ...(results.library.links || [])]);
  for (const link of allLinks) {
    try {
      const resp = await fetch(BASE + link, { redirect: 'manual' });
      results.links.push({ link, status: resp.status });
    } catch (e) {
      results.links.push({ link, error: String(e).slice(0, 150) });
    }
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
