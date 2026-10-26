'use strict';

// Home page hero colour and contrast review (Tom, 26/10/2026). Review only:
// it loads the LIVE home page, never changes it. Every request to a host
// other than our own site and Google Fonts is aborted, so no analytics or ad
// hit leaves the runner.
//
// For each screen size and each variant (the live design, and candidate CSS
// changes injected into the page in this browser only), it:
//   1. takes the first-screen capture a visitor sees;
//   2. hides the hero text and captures again, so the pixels BEHIND each line
//      of text are known exactly (photo plus overlay as rendered);
//   3. for every line box of every hero text element, computes the WCAG
//      contrast ratio of the text colour against each background pixel and
//      reports the worst, the 5th percentile and the median.
// It also reports the mean brightness of the hero image area, as a rough
// measure of how dark the first screen reads.

const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { PNG } = require('pngjs');

const BASE = process.env.HERO_URL || (process.env.SCREEN_URLS || '').split(',')[0].trim() || 'https://www.arringtonconsultancy.com/';
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'screens-out');
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  ['iphone13', { ...devices['iPhone 13'] }],
  ['iphonese', { ...devices['iPhone SE'] }],
  ['pixel7', { ...devices['Pixel 7'] }],
  ['desktop', { viewport: { width: 1440, height: 900 } }]
];

const HERO = '.hero[data-section-id="hero"]';
const LIVE_GRADIENT = 'linear-gradient(0deg, rgba(0,10,25,0.94) 0%, rgba(0,10,25,0.55) 42%, rgba(0,10,25,0.6) 65%, rgba(0,10,25,0.7) 100%)';

// Candidate changes. Each is CSS added after the page's own styles.
const VARIANTS = {
  live: '',
  // ChatGPT's suggestion, as literally as it can be made concrete: the
  // supporting text closer to white, and the dark overlay eased throughout
  // while the headline stays readable.
  chatgpt: `
    ${HERO} .hero-text .sub { color: #e8edf4 !important; }
    ${HERO} .home-hero-cta + .home-offers-note { color: #e8edf4 !important; }
    ${HERO} .hero-proof-strip { color: #e8edf4 !important; }
    ${HERO}::after { background: linear-gradient(0deg, rgba(0,10,25,0.80) 0%, rgba(0,10,25,0.38) 42%, rgba(0,10,25,0.40) 65%, rgba(0,10,25,0.50) 100%) !important; }
  `,
  // The two halves of that suggestion on their own, so each one's effect
  // can be seen separately.
  chatgpt_text_only: `
    ${HERO} .hero-text .sub { color: #e8edf4 !important; }
    ${HERO} .home-hero-cta + .home-offers-note { color: #e8edf4 !important; }
    ${HERO} .hero-proof-strip { color: #e8edf4 !important; }
  `,
  chatgpt_overlay_only: `
    ${HERO}::after { background: linear-gradient(0deg, rgba(0,10,25,0.80) 0%, rgba(0,10,25,0.38) 42%, rgba(0,10,25,0.40) 65%, rgba(0,10,25,0.50) 100%) !important; }
  `,
  // The smallest change: only the one line set in the muted grey (the free
  // conversation line under the button) moves up to the body text colour
  // the supporting sentence already uses. Overlay untouched.
  note_to_text: `
    ${HERO} .home-hero-cta + .home-offers-note { color: var(--text) !important; }
  `
};

const TARGETS = [
  ['headline', `${HERO} .hero-heading`],
  ['supporting', `${HERO} .hero-text .sub`],
  ['button', `${HERO} .home-hero-cta .btn`],
  ['note', `${HERO} [data-home-offers-note]`],
  ['note_link', `${HERO} [data-home-offers-note] a`],
  ['proof_strip', `${HERO} .hero-proof-strip span`],
  ['label', `${HERO} .hero-label`],
  ['nav_link', 'nav a']
];

function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(r, g, b) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
function ratio(l1, l2) { const a = Math.max(l1, l2), b = Math.min(l1, l2); return (a + 0.05) / (b + 0.05); }
function parseRgb(s) { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
function pct(arr, p) { if (!arr.length) return null; const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
const r2 = (n) => (n === null ? null : Math.round(n * 100) / 100);

async function lineBoxes(page) {
  return page.evaluate((targets) => {
    const out = [];
    for (const [name, sel] of targets) {
      document.querySelectorAll(sel).forEach((el, i) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        // A link holding only an image (the logo) has no text to measure.
        if (!el.textContent.trim()) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter((r) => r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight);
        if (!rects.length) return;
        let bg = null;
        if (name === 'button') bg = cs.backgroundColor;
        if (name === 'nav_link') {
          // The nav bar's own background, if it paints one over the hero.
          const nav = el.closest('nav');
          bg = nav ? getComputedStyle(nav).backgroundColor : null;
        }
        out.push({
          name, index: i, text: el.textContent.trim().slice(0, 60),
          color: cs.color, fontSize: parseFloat(cs.fontSize), fontWeight: parseInt(cs.fontWeight, 10), bg,
          rects: rects.map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }))
        });
      });
    }
    return out;
  }, TARGETS);
}

async function run() {
  const browser = await chromium.launch();
  const ownHost = new URL(BASE).hostname;
  const report = { url: BASE, at: new Date().toISOString(), sizes: {} };
  const md = [`# Home page hero contrast, ${report.at}`, '', `URL: ${BASE}`, ''];
  for (const [sizeName, opts] of SIZES) {
    report.sizes[sizeName] = {};
    for (const [variant, css] of Object.entries(VARIANTS)) {
      const ctx = await browser.newContext({ ...opts, bypassCSP: true });
      await ctx.route('**/*', (route) => {
        const h = new URL(route.request().url()).hostname;
        if (h === ownHost || h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com') return route.continue();
        return route.abort();
      });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      // Only the hero photo matters here; lazy images further down never load
      // and would hang a wait on every image.
      await page.waitForFunction((s) => { const i = document.querySelector(s + ' .hero-photo img'); return !i || (i.complete && i.naturalWidth > 0); }, HERO, { timeout: 15000 }).catch(() => {});
      if (css) await page.addStyleTag({ content: css });
      // Settle any reveal animation.
      await page.waitForTimeout(1500);
      const dpr = opts.deviceScaleFactor || 1;
      const shot = await page.screenshot();
      fs.writeFileSync(path.join(OUT, `${sizeName}-${variant}.png`), shot);
      const boxes = await lineBoxes(page);
      // Hide hero and nav text (keep backgrounds) and capture again.
      await page.addStyleTag({ content: `${HERO} .hero-text, ${HERO} .hero-text *, nav, nav * { color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; -webkit-text-fill-color: transparent !important; } ${HERO} .hero-scroll-cue { visibility: hidden !important; }` });
      await page.waitForTimeout(300);
      const bare = PNG.sync.read(await page.screenshot());
      const heroBox = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: Math.min(r.height, innerHeight - r.top) }; }, HERO);
      // Mean brightness of the hero area (0 black to 1 white, relative luminance).
      let sumL = 0, n = 0, sumR = 0, sumB = 0;
      for (let y = Math.max(0, Math.round(heroBox.y * dpr)); y < Math.min(bare.height, Math.round((heroBox.y + heroBox.h) * dpr)); y += 3) {
        for (let x = 0; x < bare.width; x += 3) {
          const i = (y * bare.width + x) * 4;
          sumL += lum(bare.data[i], bare.data[i + 1], bare.data[i + 2]); sumR += bare.data[i]; sumB += bare.data[i + 2]; n++;
        }
      }
      const res = { heroMeanLuminance: r2(sumL / n * 100) / 100, heroMeanRedMinusBlue: Math.round((sumR - sumB) / n), elements: [] };
      for (const b of boxes) {
        const fg = parseRgb(b.color);
        if (!fg) continue;
        const fgL = lum(fg.r, fg.g, fg.b);
        const ratios = [];
        const solid = b.bg && parseRgb(b.bg) && parseRgb(b.bg).a === 1 ? parseRgb(b.bg) : null;
        for (const r of b.rects) {
          if (solid) { ratios.push(ratio(fgL, lum(solid.r, solid.g, solid.b))); continue; }
          const x0 = Math.max(0, Math.floor(r.x * dpr)), x1 = Math.min(bare.width, Math.ceil((r.x + r.w) * dpr));
          const y0 = Math.max(0, Math.floor(r.y * dpr)), y1 = Math.min(bare.height, Math.ceil((r.y + r.h) * dpr));
          for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
            const i = (y * bare.width + x) * 4;
            ratios.push(ratio(fgL, lum(bare.data[i], bare.data[i + 1], bare.data[i + 2])));
          }
        }
        const large = b.fontSize >= 24 || (b.fontSize >= 18.66 && b.fontWeight >= 700);
        res.elements.push({
          name: b.name, index: b.index, text: b.text, color: b.color, fontSize: b.fontSize, fontWeight: b.fontWeight,
          needs: large ? 3 : 4.5, worst: r2(Math.min(...ratios)), p5: r2(pct(ratios, 0.05)), median: r2(pct(ratios, 0.5)), lines: b.rects.length
        });
      }
      report.sizes[sizeName][variant] = res;
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'contrast.json'), JSON.stringify(report, null, 2));
  for (const [sizeName, variants] of Object.entries(report.sizes)) {
    md.push(`## ${sizeName}`, '');
    for (const [variant, res] of Object.entries(variants)) {
      md.push(`### ${variant}  (hero mean luminance ${res.heroMeanLuminance}, red minus blue ${res.heroMeanRedMinusBlue})`, '');
      md.push('| element | colour | px | needs | worst | 5th pct | median |', '|---|---|---|---|---|---|---|');
      for (const e of res.elements) md.push(`| ${e.name}${e.index ? ' ' + e.index : ''} | ${e.color} | ${e.fontSize} ${e.fontWeight} | ${e.needs} | ${e.worst} | ${e.p5} | ${e.median} |`);
      md.push('');
    }
  }
  md.push(`Live gradient for reference: ${LIVE_GRADIENT}`);
  fs.writeFileSync(path.join(OUT, 'report.md'), md.join('\n'));
  console.log(md.join('\n'));
}

run().catch((e) => { console.error(e); process.exit(1); });
