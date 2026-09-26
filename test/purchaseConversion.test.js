// The Google Ads "Paid offer purchase" conversion and the attribution that
// feeds it (26/09/2026).
//
// The property: a purchase is counted only once the Stripe webhook has marked
// it paid, only when the label is configured, with what was actually charged
// and our own row id as the transaction id; and a checkout keeps where the
// buyer came from through the round trip to Stripe. The browser half was
// checked in a real browser against a local server; these tests pin the
// pieces a later edit could quietly undo.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { purchaseConversionFor } = require('../lib/purchaseConversion');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const LABEL = 'XRZmCOv0joYdEN6RgsVD';
const paid = { id: 7, offer_id: 'commercial_review', status: 'paid', amount_pence: 50000, currency: 'gbp' };

test('a paid purchase with a label yields the conversion, valued at what was charged', () => {
  assert.deepStrictEqual(purchaseConversionFor(paid, LABEL), {
    sendTo: 'AW-18129914078/' + LABEL, transactionId: 'wts-7', value: 500, currency: 'GBP'
  });
  // The £2,500 review bought with the £500 credit reports the £2,000 charged.
  assert.strictEqual(purchaseConversionFor({ ...paid, amount_pence: 200000 }, LABEL).value, 2000);
  assert.strictEqual(purchaseConversionFor({ ...paid, amount_pence: 99950 }, LABEL).value, 999.5);
});

test('nothing is sent without a label, or for anything the webhook has not marked paid', () => {
  for (const label of ['', undefined, null, "x'); alert(1); ('", 'AW-1/abc', 'a b']) {
    assert.strictEqual(purchaseConversionFor(paid, label), null, String(label));
  }
  for (const status of ['pending', 'failed', 'expired', 'PAID', '', undefined]) {
    assert.strictEqual(purchaseConversionFor({ ...paid, status }, LABEL), null, String(status));
  }
  assert.strictEqual(purchaseConversionFor(null, LABEL), null);
  assert.strictEqual(purchaseConversionFor({ ...paid, amount_pence: -1 }, LABEL), null);
  assert.strictEqual(purchaseConversionFor({ ...paid, amount_pence: 'x' }, LABEL), null);
  assert.strictEqual(purchaseConversionFor({ ...paid, id: 'wts-7' }, LABEL), null);
  assert.strictEqual(purchaseConversionFor({ ...paid, currency: "gb'p" }, LABEL), null);
});

async function renderConfirmation(purchase, purchaseConversion) {
  const themes = require('../db/themes');
  return ejs.renderFile(path.join(root, 'views', 'where-to-start-confirmation.ejs'), {
    nonce: 'n', ga4Id: '', theme: themes.dark, navPages: [], content: {},
    pageContact: { heading: 'h', body: 'b', label: '', headerCtaText: 'Start a conversation', submitText: 'Send', messagePlaceholder: 'm' },
    heardAboutOptions: [], purchase, offer: null, purchaseConversion
  });
}

test('the confirmation page carries the snippet only when the route hands it one', async () => {
  const conv = purchaseConversionFor(paid, LABEL);
  const withIt = await renderConfirmation(paid, conv);
  assert.strictEqual(withIt.split('AW-18129914078/' + LABEL).length - 1, 1, 'exactly one conversion call');
  assert.match(withIt, /var id = 'wts-7'/);
  assert.match(withIt, /'value': 500,/);
  assert.match(withIt, /'currency': 'GBP'/);
  assert.match(withIt, /'transaction_id': id/);
  assert.match(withIt, /<script nonce="n">\s*\(function \(\) \{\s*var id = 'wts-7'/);
  assert.match(withIt, /arrPurchaseConversionsSent/);

  for (const [purchase, c] of [[paid, null], [{ ...paid, status: 'pending' }, null], [null, null]]) {
    const html = await renderConfirmation(purchase, c);
    assert.ok(!html.includes(LABEL), 'no label without a conversion');
    // The site-wide contact-click listener also calls gtag('event',
    // 'conversion') on this page, so check for this snippet specifically.
    assert.ok(!html.includes('arrPurchaseConversionsSent'), 'no purchase snippet at all');
  }
});

test('the route decides from the stored row, never from the address', () => {
  const src = read('routes/whereToStart.js');
  assert.match(src, /purchaseConversion: purchaseConversionFor\(purchase, req\.app\.locals\.googleAdsPurchaseConversionLabel\)/);
  assert.match(src, /SELECT id, offer_id, status, amount_pence, currency FROM purchases WHERE stripe_session_id = \$1/);
  // The label comes from the environment, validated to the label alphabet.
  const server = read('server.js');
  assert.match(server, /process\.env\.GOOGLE_ADS_PURCHASE_CONVERSION_LABEL/);
  assert.match(server, /app\.locals\.googleAdsPurchaseConversionLabel = \/\^\[A-Za-z0-9_-\]\+\$\/\.test/);
});

test('every paid-offer checkout sends attribution, and the route stores and reports it', () => {
  for (const f of ['where-to-start-commercial-review', 'where-to-start-full-commercial-review',
    'where-to-start-website-build', 'where-to-start-full-review-website-build']) {
    assert.match(read(`views/${f}.ejs`),
      /attribution: window\.__leadAttribution \? window\.__leadAttribution\(\) : \{\}/, f);
  }
  const src = read('routes/whereToStart.js');
  assert.match(src, /const attribution = parseAttribution\(body\.attribution\);/);
  assert.match(src, /stripe_session_id, credited_toward_id, attribution\)/);
  assert.match(src, /JSON\.stringify\(attribution\)\]/);
  assert.match(src, /if \(attribution\.gclid\) params\.metadata\.gclid = attribution\.gclid;/);
  assert.match(src, /RETURNING id, offer_id, email, list_price_pence, amount_pence, credit_applied_pence, currency, attribution`/);
  assert.match(src, /\.\.\.describeAttribution\(purchase\.attribution\)/);
  assert.match(read('db/schema.sql'),
    /ALTER TABLE purchases ADD COLUMN IF NOT EXISTS attribution JSONB NOT NULL DEFAULT '\{\}'::jsonb;/);
});
