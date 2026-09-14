// Where an enquiry came from (lib/leadAttribution.js), plus a scan that the
// forms actually send it and that the PDF request no longer shares the
// contact-click Google Ads label.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseAttribution, attributionSummary, describeAttribution, KEYS } = require('../lib/leadAttribution');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('anything that is not a plain object parses to {}', () => {
  for (const raw of [undefined, null, '', 'utm_source=google', 42, [], ['a'], true]) {
    assert.deepEqual(parseAttribution(raw), {});
  }
});

test('only allowlisted keys survive, values are plain text and capped', () => {
  const out = parseAttribution({
    utm_source: '<b>google</b>',
    utm_medium: 'cpc\r\ninjected',
    utm_campaign: 'x'.repeat(500),
    surprise: 'dropped',
    __proto__: { polluted: 'no' },
    constructor: 'no'
  });
  assert.deepEqual(Object.keys(out).sort(), ['utm_campaign', 'utm_medium', 'utm_source']);
  assert.equal(out.utm_source, 'google');
  assert.equal(out.utm_medium, 'cpc injected');
  assert.equal(out.utm_campaign.length, 200);
  for (const key of Object.keys(out)) assert.ok(KEYS.includes(key));
});

test('landing page must be a root-relative path on this site', () => {
  assert.equal(parseAttribution({ landing_page: '/business-consultant-devon?x=1' }).landing_page, '/business-consultant-devon?x=1');
  for (const bad of ['https://evil.example/', '//evil.example', 'javascript:alert(1)', 'business-consultant-devon', '']) {
    assert.equal(parseAttribution({ landing_page: bad }).landing_page, undefined, bad);
  }
});

test('referrer must be an http(s) URL', () => {
  assert.equal(parseAttribution({ referrer: 'https://www.google.com/' }).referrer, 'https://www.google.com/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'google.com', 'ftp://x.example/', 'https://a b']) {
    assert.equal(parseAttribution({ referrer: bad }).referrer, undefined, bad);
  }
});

test('captured_at must parse as a date', () => {
  assert.equal(parseAttribution({ captured_at: '2026-09-11T05:00:00.000Z' }).captured_at, '2026-09-11T05:00:00.000Z');
  assert.equal(parseAttribution({ captured_at: 'yesterday-ish' }).captured_at, undefined);
});

test('summary prefers campaign tags, then the click id, then the referrer, then direct', () => {
  assert.equal(attributionSummary({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'Leads-Search-1', gclid: 'abc', referrer: 'https://www.google.com/' }), 'google / cpc / Leads-Search-1');
  assert.equal(attributionSummary({ utm_source: 'google' }), 'google / unknown medium');
  assert.equal(attributionSummary({ gclid: 'abc', referrer: 'https://www.google.com/' }), 'Google Ads click');
  assert.equal(attributionSummary({ referrer: 'https://www.bing.com/search?q=x', landing_page: '/' }), 'referrer: bing.com');
  assert.equal(attributionSummary({ landing_page: '/' }), 'direct');
  assert.equal(attributionSummary({}), '');
  assert.equal(attributionSummary(null), '');
});

test('email lines say nothing when nothing was captured', () => {
  assert.deepEqual(describeAttribution({}), []);
  const lines = describeAttribution({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'Leads-Search-1', landing_page: '/business-consultant-devon', gclid: 'Cj0KCQ' });
  assert.deepEqual(lines, [
    'Source: google / cpc / Leads-Search-1',
    'Landing page: /business-consultant-devon',
    'Google Ads click id: Cj0KCQ'
  ]);
});

test('every lead-writing form sends attribution and both chrome scripts capture it', () => {
  for (const view of ['views/index.ejs', 'views/partials/site-chrome-script.ejs']) {
    const src = read(view);
    assert.match(src, /window\.__leadAttribution = \(function/, `${view} must capture attribution once per session`);
    assert.match(src, /data\.attribution = window\.__leadAttribution[\s\S]{0,600}fetch\('\/api\/leads'/, `${view} footer form must send attribution`);
  }
  assert.match(read('views/index.ejs'), /data\.doc = currentDoc;\s*data\.attribution = window\.__leadAttribution[\s\S]{0,600}fetch\('\/api\/documents\/request'/, 'PDF request must send attribution');
  for (const view of ['views/product-guide.ejs', 'views/market-ready-test.ejs', 'views/owner-dependency-quiz.ejs', 'views/commercial-gaps-review.ejs']) {
    assert.match(read(view), /attribution: window\.__leadAttribution/, `${view} must send attribution`);
  }
});

test('the PDF request no longer fires the contact-click Google Ads label', () => {
  const src = read('views/index.ejs');
  const start = src.indexOf("fetch('/api/documents/request'");
  const end = src.indexOf('document_request_submit', start);
  assert.ok(start > 0 && end > start);
  const block = src.slice(start, end);
  assert.ok(!block.includes('h_2rCJeH8aYcEN6RgsVD'), 'a PDF download must not count as a phone/email/WhatsApp contact conversion');
  assert.ok(block.includes('googleAdsPdfConversionLabel'), 'a PDF conversion fires only when its own label is configured');
});

test('the contact-click label is still fired by the contact links themselves', () => {
  for (const view of ['views/index.ejs', 'views/partials/site-chrome-script.ejs']) {
    const src = read(view);
    assert.match(src, /a\[href\^="tel:"\][\s\S]{0,900}h_2rCJeH8aYcEN6RgsVD/, `${view} contact links still use the click label`);
  }
});
