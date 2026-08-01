// Read-only production verification for the fifth Useful Thinking article,
// copy refinements, and header/social image deploy (PR #68). No writes
// anywhere.
const { chromium } = require('playwright');

const BASE = 'https://www.arringtonconsultancy.com';

const ARTICLES = [
  ['/useful-thinking/being-certain-isnt-the-same-as-being-right', "Being Certain Isn't the Same as Being Right"],
  ['/useful-thinking/the-customer-who-messaged-me-at-4am', 'The Customer Who Messaged Me at 4am'],
  ['/useful-thinking/you-dont-get-to-decide-when-youve-made-things-right', "You Don't Get to Decide the Consequences"],
  ['/useful-thinking/the-tightrope-between-staff-loyalty-and-damage-control', 'The Tightrope Between Staff Loyalty and Damage Control'],
  ['/useful-thinking/a-profitable-job-is-not-necessarily-good-business', 'A Profitable Job Is Not Necessarily Good Business']
];

const NEW_ARTICLE = '/useful-thinking/a-profitable-job-is-not-necessarily-good-business';
const HELD_ARTICLE = '/useful-thinking/the-reverse-economy-of-scale';

(async () => {
  const browser = await chromium.launch();
  const results = { articles: [], newArticleDetail: null, held: null, library: null, sitemap: null, links: [] };

  for (const [path, mustContain] of ARTICLES) {
    const consoleErrors = [];
    const page = await browser.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
    page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 200)));
    try {
      const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 20000 });
      const html = await page.content();
      results.articles.push({ path, status: resp.status(), bodyMatch: html.includes(mustContain), consoleErrors });
    } catch (e) {
      results.articles.push({ path, error: String(e).slice(0, 300), consoleErrors });
    }
    await page.close();
  }

  // New article: header image + og:image specifics
  {
    const page = await browser.newPage();
    const resp = await page.goto(BASE + NEW_ARTICLE, { waitUntil: 'networkidle', timeout: 20000 });
    const html = await page.content();
    const heroImgPresent = html.includes('/img/useful-thinking/a-profitable-job-hero.jpg');
    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)">/);
    const ogImage = ogImageMatch ? ogImageMatch[1] : null;
    const heroImgResp = await fetch(BASE + '/img/useful-thinking/a-profitable-job-hero.jpg');
    const ogImgResp = ogImage ? await fetch(ogImage) : null;
    results.newArticleDetail = {
      status: resp.status(),
      heroImgPresentInHtml: heroImgPresent,
      heroImgHttpStatus: heroImgResp.status,
      ogImage,
      ogImageIsAbsolute: ogImage ? /^https:\/\//.test(ogImage) : false,
      ogImageHttpStatus: ogImgResp ? ogImgResp.status : null
    };
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
    const strongerIntroPresent = html.includes("They're the thinking behind how you work") || html.includes('They are the thinking behind how you work');
    results.library = { status: resp.status(), links: [...new Set(links)], strongerIntroPresent, consoleErrors };
    await page.close();
  }

  // Sitemap
  {
    const resp = await fetch(BASE + '/sitemap.xml');
    const xml = await resp.text();
    const utUrls = [...xml.matchAll(/<loc>([^<]*useful-thinking[^<]*)<\/loc>/g)].map(m => m[1]);
    results.sitemap = { status: resp.status, utUrls, includesNewArticle: utUrls.some((u) => u.includes('a-profitable-job-is-not-necessarily-good-business')) };
  }

  // Check every internal link found actually resolves
  const allLinks = new Set([...ARTICLES.map((a) => a[0]), '/useful-thinking', ...(results.library.links || [])]);
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
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
