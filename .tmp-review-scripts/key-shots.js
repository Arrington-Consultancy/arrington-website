const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.arringtonconsultancy.com';
const OUT = 'review-shots';
fs.mkdirSync(OUT, { recursive: true });

const targets = [
  ['/', 'home', 'desktop'],
  ['/', 'home', 'mobile'],
  ['/websites-and-ai', 'websites-and-ai', 'desktop'],
  ['/evidence', 'evidence', 'desktop'],
  ['/owner-check', 'owner-check', 'desktop'],
  ['/useful-thinking', 'useful-thinking', 'desktop'],
  ['/what-we-do', 'what-we-do', 'desktop'],
  ['/about-us', 'about-us', 'desktop'],
];

(async () => {
  const browser = await chromium.launch();
  for (const [p, name, vp] of targets) {
    const context = await browser.newContext(
      vp === 'mobile' ? { viewport: { width: 390, height: 844 }, isMobile: true } : { viewport: { width: 1400, height: 1000 } }
    );
    const page = await context.newPage();
    try {
      await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, `${vp}-${name}.jpg`), fullPage: true, type: 'jpeg', quality: 55, timeout: 15000 });
      console.log('ok', vp, p);
    } catch (e) {
      console.log('FAIL', vp, p, e.message);
    }
    await context.close().catch(() => {});
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
