// Read-only production verification for the sixth Useful Thinking
// article deploy (PR #71). No writes anywhere.
const { chromium } = require('playwright');

const BASE = 'https://www.arringtonconsultancy.com';
const NEW_ARTICLE = '/useful-thinking/every-rule-changes-behaviour';

(async () => {
  const browser = await chromium.launch();
  const results = {};

  {
    const page = await browser.newPage();
    const resp = await page.goto(BASE + NEW_ARTICLE, { waitUntil: 'networkidle', timeout: 20000 });
    const html = await page.content();
    results.article = {
      status: resp.status(),
      titleMatch: html.includes('Every Rule Changes Behaviour'),
      stickLineMatch: html.includes('stick disguised as a carrot'),
      closingLinesMatch: html.includes('Every rule changes behaviour.') && html.includes('Sometimes the behaviour it creates becomes the next problem the business has to solve.')
    };
    await page.close();
  }

  {
    const page = await browser.newPage();
    const resp = await page.goto(BASE + '/useful-thinking', { waitUntil: 'networkidle', timeout: 20000 });
    const html = await page.content();
    results.library = {
      status: resp.status(),
      hasNewArticleLink: html.includes(NEW_ARTICLE)
    };
    await page.close();
  }

  {
    const resp = await fetch(BASE + '/sitemap.xml');
    const xml = await resp.text();
    results.sitemap = { status: resp.status, includesNewArticle: xml.includes(NEW_ARTICLE) };
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
