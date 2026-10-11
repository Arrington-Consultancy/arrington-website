// The SEO sweep of 11/10/2026 (Tom: "we need a massive seo sweep and
// improvement"). This file pins the technical half, the part that needs no
// copy approval:
//   - the business is described once, site-wide, in structured data that
//     parses, with the profiles the Google Business Profile lists and the
//     profile's own Maps link (the old link carried coordinates in Bavaria),
//   - the standalone pages carry a breadcrumb, and a Service where they sell
//     one, pointing at the business by @id,
//   - the four local pages are linked from every page's footer,
//   - the Owner Check hero photo no longer weighs most of a megabyte.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

const BRAND_OS_SHORT_DESCRIPTION = 'We use 20 years of business experience to help owner run businesses grow and become less reliant on the owner.';

test('the business is described once, site-wide, from the Google tag partial', async () => {
  const html = await ejs.renderFile(path.join(root, 'views', 'partials', 'google-tag.ejs'), { nonce: 'n', ga4Id: '' });
  const blocks = ldBlocks(html);
  assert.strictEqual(blocks.length, 1, 'expected one structured data block from the shared head');
  const graph = blocks[0]['@graph'];
  const org = graph.find((x) => [].concat(x['@type']).includes('Organization'));
  const site = graph.find((x) => x['@type'] === 'WebSite');
  assert.ok(org && site, 'Organization and WebSite are both described');
  assert.strictEqual(org['@id'], 'https://www.arringtonconsultancy.com/#organization');
  assert.strictEqual(org.description, BRAND_OS_SHORT_DESCRIPTION, 'the description is not the Brand OS approved short description');
  assert.ok(org.sameAs.includes('https://maps.google.com/maps?cid=2187858803206378826'), 'the Google profile link is missing');
  assert.ok(org.sameAs.some((u) => u.startsWith('https://www.linkedin.com/company/')), 'the LinkedIn company page is missing');
  assert.ok(!JSON.stringify(org).includes('47.73855'), 'the Maps link with Bavarian coordinates is back');
  assert.ok(!org.aggregateRating && !org.review, 'self-served review markup is not allowed by Google');
  assert.match(html, /<script type="application\/ld\+json" nonce="n">/);

  // index.ejs must not describe the business a second time.
  const index = read('views/index.ejs');
  assert.ok(!/"@type":\s*\["Organization", "ProfessionalService"\]/.test(index), 'views/index.ejs carries its own Organization block again');
  assert.ok(!/"@type":\s*"WebSite"/.test(index), 'views/index.ejs carries its own WebSite block again');
});

test('each standalone page carries a breadcrumb that matches its canonical', async () => {
  const pages = {
    'sale-readiness': ['/get-your-business-ready-to-sell', true],
    'taxi-operators': ['/taxi-and-private-hire-operators', true],
    'owner-check': ['/owner-check', false],
    'owner-dependency-quiz': ['/owner-dependency-quiz', false],
    'market-ready-test': ['/market-ready-test', false],
    'commercial-gaps-review': ['/commercial-gaps-review', false],
    'product-guide': ['/product-guide', false]
  };
  for (const [view, [p, service]] of Object.entries(pages)) {
    const src = read(`views/${view}.ejs`);
    const inc = src.match(/include\('partials\/page-schema', \{ schemaName: '([^']+)', schemaPath: '([^']+)'(?:, schemaService: '([^']+)')? \}\)/);
    assert.ok(inc, `${view} has no page structured data`);
    assert.strictEqual(inc[2], p, `${view}: the structured data path does not match the page`);
    assert.ok(src.includes(`<link rel="canonical" href="https://www.arringtonconsultancy.com${p}">`), `${view}: canonical changed`);
    assert.strictEqual(Boolean(inc[3]), service, `${view}: Service markup ${service ? 'missing' : 'unexpected'}`);
    const html = await ejs.renderFile(path.join(root, 'views', 'partials', 'page-schema.ejs'), { nonce: 'n', schemaName: inc[1], schemaPath: inc[2], schemaService: inc[3] });
    const graph = ldBlocks(html)[0]['@graph'];
    assert.strictEqual(graph[0].itemListElement[1].item, `https://www.arringtonconsultancy.com${p}`);
    if (service) assert.strictEqual(graph[1].provider['@id'], 'https://www.arringtonconsultancy.com/#organization');
  }
});

test('every page links to the four local pages from the footer', () => {
  const footer = read('views/partials/site-footer.ejs');
  for (const area of ['devon', 'cornwall', 'plymouth', 'exeter']) {
    assert.ok(footer.includes(`<a href="/business-consultant-${area}">`), `the footer no longer links to ${area}`);
  }
  for (const f of ['views/index.ejs', 'views/partials/site-chrome-styles.ejs']) {
    assert.ok(/\.footer-areas \{/.test(read(f)), `${f} has no .footer-areas rule`);
  }
});

test('the Owner Check hero photo stays light', () => {
  const kb = fs.statSync(path.join(root, 'public', 'img', 'owner-check', 'hero.jpg')).size / 1024;
  assert.ok(kb < 300, `public/img/owner-check/hero.jpg is ${Math.round(kb)}KB`);
});
