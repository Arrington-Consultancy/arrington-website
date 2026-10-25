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
// "TEST TRACKING", arriving as utm_source=test (never as an ad visit), and
// follows it to /thank-you. During that step every
// Google Ads and Meta request is aborted in the browser, so the test can
// never record an Ads or Meta conversion. It still stores a lead row and
// emails Tom, which is the point: it is a real submission, plainly marked.
// It then opens that enquiry's own /thank-you?c= link again in a fresh
// browser, which must carry no conversion (fix brief of 12/10/2026, item 5).
//
// Three further steps check the site's own scripts with EVERY third-party
// request blocked, so nothing fake reaches Google, Microsoft or Meta:
// attribution replaced by a later tagged arrival (item 3), the Clarity
// google_ads label cleared by a Microsoft arrival, and no Clarity on the
// login page (item 4).

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
const START_UP = '/start-up-idea-review';
// SUBMIT_PATH chooses the page the one test enquiry is sent from (default the
// start-up page), so the Contact conversion can be proved from any page that
// carries the footer form. A root-relative path only.
//
// The test enquiry ALWAYS arrives as utm_source=test / utm_medium=test, with
// any ad click id or utm taken off the path given (Google Ads worker's brief
// of 25/10/2026, item 3). Until then it carried utm_source=google and
// utm_medium=cpc, so GA4 counted the 19 October test as a lead from a Google
// advert. A test must never show up as an ad result.
const TEST_SOURCE = { utm_source: 'test', utm_medium: 'test', utm_campaign: 'tag-audit-test-enquiry' };
function asTestArrival(p) {
  const u = new URL(p, 'https://x.invalid');
  for (const k of [...u.searchParams.keys()]) {
    if (/^utm_|^(gclid|gbraid|wbraid|msclkid|fbclid)$/i.test(k)) u.searchParams.delete(k);
  }
  for (const [k, v] of Object.entries(TEST_SOURCE)) u.searchParams.set(k, v);
  return u.pathname + u.search + u.hash;
}
const SUBMIT_PATH = asTestArrival(/^\/(?!\/)/.test(process.env.SUBMIT_PATH || '') ? process.env.SUBMIT_PATH : START_UP);

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
  if (opts.blockThirdParty) {
    await ctx.route((url) => url.hostname !== new URL(BASE).hostname, (route) => {
      blocked.push(route.request().url().slice(0, 140));
      route.abort();
    });
  } else if (opts.blockAdsAndMeta || opts.blockMeta) {
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

// What the page itself asked for, whatever the network then did: Google Ads
// Contact conversions in dataLayer, Microsoft goal events in uetq.
async function inPageConversions(page) {
  return page.evaluate((label) => {
    const ads = (window.dataLayer || []).filter((e) => e && e[0] === 'event' && e[1] === 'conversion' && e[2] && String(e[2].send_to || '').includes(label)).length;
    const ms = Array.isArray(window.uetq) ? window.uetq.filter((x) => x === 'contact_form_submit').length : 0;
    return 'Google Ads ' + ads + ', Microsoft ' + ms;
  }, CONTACT_LABEL);
}

let tokenUrl = '';

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

  // Until 25/10/2026 this step arrived as utm_source=google&utm_medium=cpc,
  // so every tag audit run put a paid Google session into GA4. It arrives as
  // a test visit now; whether a page-load rule fires does not depend on it.
  results.push(await step(browser, 'start-up page (test utm) load and scroll', async (page) => {
    await page.goto(BASE + asTestArrival(START_UP), { waitUntil: 'networkidle' });
    await scrollThrough(page);
  }));

  // Any further pages to load (comma-separated paths), e.g. two ordinary
  // site pages, so a page-load rule shows up beyond the two named above.
  for (const extra of (process.env.EXTRA_PATHS || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    results.push(await step(browser, extra + ' load and scroll', async (page) => {
      await page.goto(BASE + extra, { waitUntil: 'networkidle' });
      await scrollThrough(page);
    }));
  }

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

  // Item 3: an untagged first page, then a tagged arrival later in the visit.
  results.push(await step(browser, 'attribution: untagged first page, tagged arrival later (third parties blocked)', async (page) => {
    const attr = async () => {
      await page.waitForFunction(() => typeof window.__leadAttribution === 'function', null, { timeout: 15000 });
      return page.evaluate(() => window.__leadAttribution());
    };
    await page.goto(BASE + '/', { waitUntil: 'load' });
    const first = await attr();
    await page.goto(BASE + '/product-guide?utm_source=tag_audit&utm_medium=test&utm_campaign=not-a-real-visit', { waitUntil: 'load' });
    const later = await attr();
    await page.goto(BASE + '/', { waitUntil: 'load' });
    const after = await attr();
    return { checks: [
      'first page stored: ' + first.landing_page + ' (utm_source ' + (first.utm_source || 'none') + ')',
      'after the tagged arrival: ' + later.landing_page + ' (utm_source ' + (later.utm_source || 'none') + ')',
      'next untagged page keeps: ' + after.landing_page
    ] };
  }, { blockThirdParty: true }));

  // Item 4: the Clarity google_ads label, then a Microsoft arrival clears it.
  results.push(await step(browser, 'Clarity label: Google ad arrival, then a Microsoft ad arrival (third parties blocked)', async (page) => {
    const read = () => page.evaluate(() => ({
      flag: sessionStorage.getItem('arrPaidGoogle'),
      label: ((window.clarity && window.clarity.q) || []).some((a) => a[0] === 'set' && a[1] === 'traffic' && a[2] === 'google_ads')
    }));
    await page.goto(BASE + '/?utm_source=google&utm_medium=cpc&utm_campaign=tag-audit-not-a-real-visit', { waitUntil: 'domcontentloaded' });
    const g = await read();
    await page.goto(BASE + '/product-guide?utm_source=bing&utm_medium=cpc&utm_campaign=tag-audit-not-a-real-visit', { waitUntil: 'domcontentloaded' });
    const m = await read();
    await page.goto(BASE + '/privacy', { waitUntil: 'domcontentloaded' });
    const n = await read();
    return { checks: [
      'after the Google ad arrival: flag ' + g.flag + ', google_ads label sent ' + g.label,
      'after the Microsoft ad arrival: flag ' + m.flag + ', google_ads label sent ' + m.label,
      'next page: flag ' + n.flag + ', google_ads label sent ' + n.label
    ] };
  }, { blockThirdParty: true }));

  // Item 4: the staff login page carries no Clarity.
  results.push(await step(browser, 'login page: no Clarity (third parties blocked)', async (page) => {
    const res = await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    const html = await res.text();
    const privacy = await (await page.goto(BASE + '/privacy', { waitUntil: 'domcontentloaded' })).text();
    return { checks: [
      '/login status ' + res.status() + ', Clarity tag in HTML: ' + html.includes('clarity.ms/tag') + ', Google tag in HTML: ' + html.includes("gtag('config', 'AW-18129914078')"),
      '/privacy Clarity tag in HTML (control): ' + privacy.includes('clarity.ms/tag')
    ] };
  }, { blockThirdParty: true }));

  if (SUBMIT) {
    results.push(await step(browser, 'ONE test enquiry from ' + SUBMIT_PATH + ' (TEST TRACKING), ' + (ADS ? 'Google Ads allowed, Meta blocked' : 'Ads and Meta requests blocked'), async (page) => {
      await page.goto(BASE + SUBMIT_PATH, { waitUntil: 'networkidle' });
      await page.waitForTimeout(4000);
      await page.fill('#leadForm [name="name"]', 'TEST TRACKING');
      await page.fill('#leadForm [name="email"]', 'test-tracking@example.invalid');
      await page.fill('#leadForm [name="message"]', 'TEST TRACKING: automated check that one enquiry fires exactly one generate_lead. Please ignore.');
      // Give Turnstile a moment to issue its token if it is going to.
      await page.waitForTimeout(6000);
      let finalUrl = '';
      try {
        const [resp] = await Promise.all([
          page.waitForResponse((r) => /\/thank-you\?c=/.test(r.url()), { timeout: 20000 }),
          page.click('#leadForm button[type="submit"]')
        ]);
        tokenUrl = resp.url();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        finalUrl = tokenUrl.replace(/c=[^&]+/, 'c=<token>');
      } catch (e) {
        finalUrl = 'did not reach /thank-you: ' + (await page.textContent('#leadFormStatus').catch(() => '?'));
      }
      return { finalUrl, checks: tokenUrl ? ['conversion events pushed by the page on the first render: ' + await inPageConversions(page)] : [] };
    }, ADS ? { blockMeta: true } : { blockAdsAndMeta: true }));

    // Item 5: the same link again, in a fresh browser (a new session).
    if (tokenUrl) {
      results.push(await step(browser, 'replay of that /thank-you?c=<token> link in a new browser (Ads and Meta requests blocked)', async (page) => {
        const res = await page.goto(tokenUrl, { waitUntil: 'domcontentloaded' });
        const html = await res.text();
        await page.waitForTimeout(3000);
        return { checks: [
          'status ' + res.status() + ', conversion snippet in HTML: ' + html.includes(CONTACT_LABEL),
          'conversion events pushed by the page: ' + await inPageConversions(page)
        ] };
      }, { blockAdsAndMeta: true }));
    }
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
    for (const c of r.checks || []) md.push('- ' + c);
    for (const s of r.scripts) md.push('- Google tag script ' + s.id + ': ' + s.bytes + ' bytes, mentions of generate_lead: ' + s.generateLeadMentions);
    md.push('');
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), md.join('\n'));
  console.log(md.join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
