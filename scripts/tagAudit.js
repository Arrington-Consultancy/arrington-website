'use strict';

// Live tag audit, run on a GitHub Actions runner (the build sandbox cannot
// reach the public site or Google). Added 06/10/2026 to find where GA4's
// generate_lead events come from: the site's own code never sends that
// event, yet GA4 records about four per page view.
//
// For each step it loads the real production page in Chromium and records
// every hit the browser sends to GA4 (/g/collect, one or many events per
// request), plus every Google tag script it downloads, so the audit can say
// whether an event is sent BY THE BROWSER (site code or the Google tag's own
// configuration) or only appears inside GA4 (an Admin "create event" rule).
//
// debug_mode is set before any page script runs, so every hit also appears
// in GA4 DebugView for whoever has the property open.
//
// SUBMIT=1 also sends ONE footer enquiry from the start-up page, named
// "TEST TRACKING", and follows it to /thank-you. During that step every
// Google Ads and Meta request is aborted in the browser, so the test can
// never record an Ads or Meta conversion. It still stores a lead row and
// emails Tom, which is the point: it is a real submission, plainly marked.

const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const BASE = process.env.QA_BASE_URL || 'https://www.arringtonconsultancy.com';
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'qa-out');
const SUBMIT = process.env.SUBMIT === '1';
// ADS=1 lets the test enquiry's Google Ads requests through (Meta stays
// blocked), so the Contact conversion on /thank-you can be seen leaving the
// browser. It then records ONE real conversion in the Ads account: use it
// only when asked to prove that conversion.
const ADS = process.env.ADS === '1';
const CONTACT_LABEL = 'vCKKCKjSna0cEN6RgsVD';
const START_UP = '/start-up-idea-review?utm_source=google&utm_medium=cpc&utm_campaign=Start-Up-Search';

fs.mkdirSync(OUT, { recursive: true });

function parseHits(url, body) {
  const u = new URL(url);
  const shared = Object.fromEntries(u.searchParams.entries());
  const lines = (body || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const events = lines.length ? lines.map((l) => ({ ...shared, ...Object.fromEntries(new URLSearchParams(l).entries()) })) : [shared];
  return events.map((e) => ({
    en: e.en,
    tid: e.tid,
    dl: e.dl,
    debug: e._dbg === '1' || e['ep.debug_mode'] === 'true',
    params: Object.fromEntries(Object.entries(e).filter(([k]) => /^(ep|epn)\./.test(k)))
  }));
}

async function step(browser, name, fn, opts = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], ...(opts.ctx || {}) });
  await ctx.addInitScript(() => {
    window.dataLayer = window.dataLayer || [];
    (function () { window.dataLayer.push(arguments); })('set', 'debug_mode', true);
  });
  const hits = [];
  const blocked = [];
  const scripts = [];
  if (opts.blockAdsAndMeta || opts.blockMeta) {
    const pattern = opts.blockAdsAndMeta
      ? /googleadservices\.com|googleads\.g\.doubleclick\.net|google\.com\/(pagead|ccm)|facebook\.(com|net)/
      : /facebook\.(com|net)/;
    await ctx.route(pattern, (route) => {
      blocked.push(route.request().url().slice(0, 140));
      route.abort();
    });
  }
  const page = await ctx.newPage();
  const adsConversions = [];
  page.on('request', (req) => {
    const url = req.url();
    if (/googleadservices\.com\/pagead|google\.com\/pagead|googleads\.g\.doubleclick\.net\/pagead/.test(url) && url.includes(CONTACT_LABEL)) {
      adsConversions.push({ host: new URL(url).host, path: new URL(url).pathname, url: url.slice(0, 200) });
    }
    if (/google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/.test(url)) {
      for (const h of parseHits(url, req.postData())) hits.push(h);
    }
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (/googletagmanager\.com\/gtag\/(js|destination)/.test(url)) {
      try {
        const text = await res.text();
        const id = (new URL(url).searchParams.get('id')) || 'unknown';
        fs.writeFileSync(path.join(OUT, `gtag-${id}.js`), text);
        const idx = [];
        let i = text.indexOf('generate_lead');
        while (i !== -1 && idx.length < 20) { idx.push(text.slice(Math.max(0, i - 300), i + 300)); i = text.indexOf('generate_lead', i + 1); }
        scripts.push({ id, bytes: text.length, generateLeadMentions: idx.length, contexts: idx });
      } catch (e) { scripts.push({ url, error: String(e) }); }
    }
  });
  const extra = await fn(page);
  await page.waitForTimeout(6000);
  await ctx.close();
  const summary = {};
  for (const h of hits) summary[h.en] = (summary[h.en] || 0) + 1;
  return { name, eventCounts: summary, generate_lead: hits.filter((h) => h.en === 'generate_lead'), adsConversions, hits, scripts, blocked: blocked.length, ...(extra || {}) };
}

async function scrollThrough(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 600) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(150); }
}

(async () => {
  const browser = await chromium.launch();
  const results = [];

  results.push(await step(browser, 'homepage load and scroll', async (page) => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await scrollThrough(page);
  }));

  results.push(await step(browser, 'start-up page (with Start-Up-Search utm) load and scroll', async (page) => {
    await page.goto(BASE + START_UP, { waitUntil: 'networkidle' });
    await scrollThrough(page);
  }));

  results.push(await step(browser, 'phone tap on the homepage', async (page) => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    // Stop the tel: navigation itself; the site's own click listener still runs.
    await page.evaluate(() => document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="tel:"]');
      if (a) e.preventDefault();
    }, true));
    const tel = await page.$('a[href^="tel:"]');
    if (!tel) return { note: 'no tel: link found' };
    await tel.scrollIntoViewIfNeeded();
    await tel.click();
    return { tapped: await tel.getAttribute('href') ? 'tel link' : 'none' };
  }));

  if (SUBMIT) {
    results.push(await step(browser, 'ONE test enquiry from the start-up page (TEST TRACKING), ' + (ADS ? 'Google Ads allowed, Meta blocked' : 'Ads and Meta requests blocked'), async (page) => {
      await page.goto(BASE + START_UP, { waitUntil: 'networkidle' });
      await page.waitForTimeout(4000);
      await page.fill('#leadForm [name="name"]', 'TEST TRACKING');
      await page.fill('#leadForm [name="email"]', 'test-tracking@example.invalid');
      await page.fill('#leadForm [name="message"]', 'TEST TRACKING: automated check that one enquiry fires exactly one generate_lead. Please ignore.');
      // Give Turnstile a moment to issue its token if it is going to.
      await page.waitForTimeout(6000);
      let finalUrl = '';
      try {
        await Promise.all([page.waitForURL(/thank-you/, { timeout: 20000 }), page.click('#leadForm button[type="submit"]')]);
        finalUrl = page.url().replace(/c=[^&]+/, 'c=<token>');
      } catch (e) {
        finalUrl = 'did not reach /thank-you: ' + (await page.textContent('#leadFormStatus').catch(() => '?'));
      }
      return { finalUrl };
    }, ADS ? { blockMeta: true } : { blockAdsAndMeta: true }));
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  const md = ['# Live tag audit, ' + new Date().toISOString(), '', 'Base: ' + BASE, ''];
  for (const r of results) {
    md.push('## ' + r.name);
    md.push('- GA4 events sent by the browser: ' + JSON.stringify(r.eventCounts));
    md.push('- generate_lead sent by the browser: ' + r.generate_lead.length);
    for (const g of r.generate_lead) md.push('  - page_location ' + g.dl + ' params ' + JSON.stringify(g.params));
    const camp = r.hits.find((h) => h.en === 'page_view');
    if (camp) md.push('- page_view page_location: ' + camp.dl);
    md.push('- Google Ads Contact conversion requests (label ' + CONTACT_LABEL + '): ' + r.adsConversions.length);
    for (const a of r.adsConversions) md.push('  - ' + a.host + a.path);
    if (r.finalUrl) md.push('- after submit: ' + r.finalUrl);
    if (r.blocked) md.push('- Ads/Meta requests blocked: ' + r.blocked);
    if (r.note) md.push('- note: ' + r.note);
    for (const s of r.scripts) md.push('- Google tag script ' + s.id + ': ' + s.bytes + ' bytes, mentions of generate_lead: ' + s.generateLeadMentions);
    md.push('');
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), md.join('\n'));
  console.log(md.join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
