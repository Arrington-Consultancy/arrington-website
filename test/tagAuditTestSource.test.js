'use strict';
// The tag audit's own visits must never look like an ad visit in GA4
// (Google Ads worker's brief of 25/10/2026, item 3). The 19 October test
// enquiry arrived as utm_source=google&utm_medium=cpc and GA4 counted it as a
// lead from a Google advert; the start-up page step did the same on every
// run. Both now go through asTestArrival.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'tagAudit.js'), 'utf8');

function helper() {
  const block = src.match(/const TEST_SOURCE[\s\S]*?\n}\n/);
  assert.ok(block, 'asTestArrival is defined');
  // eslint-disable-next-line no-new-func
  return new Function(`${block[0]}; return asTestArrival;`)();
}

test('a test arrival carries utm_source=test and no ad click id or ad utm', () => {
  const asTestArrival = helper();
  const out = asTestArrival('/where-to-start/website-build?utm_source=google&utm_medium=cpc&utm_campaign=X&gclid=a&gbraid=b&wbraid=c&msclkid=d&fbclid=e&keep=1#conversation');
  const u = new URL(out, 'https://x.invalid');
  assert.equal(u.pathname, '/where-to-start/website-build');
  assert.equal(u.hash, '#conversation');
  assert.equal(u.searchParams.get('utm_source'), 'test');
  assert.equal(u.searchParams.get('utm_medium'), 'test');
  assert.equal(u.searchParams.get('keep'), '1', 'other parameters survive');
  for (const k of ['gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid']) assert.equal(u.searchParams.get(k), null, k);
});

test('the steps that let GA4 through never arrive as a paid visit', () => {
  assert.doesNotMatch(src, /const START_UP = '[^']*utm_/, 'the start-up path carries no utm of its own');
  assert.match(src, /const SUBMIT_PATH = asTestArrival\(/, 'the test enquiry goes through asTestArrival');
  assert.match(src, /page\.goto\(BASE \+ asTestArrival\(START_UP\)/, 'the start-up step goes through asTestArrival');
  // A google/cpc or bing/cpc arrival is allowed only inside a step that blocks
  // every third party, so nothing reaches Google or Microsoft.
  const steps = src.split(/results\.push\(await step\(/).slice(1);
  for (const s of steps) {
    const body = s.split(/\n {2}\}\)\);|\n {2}\}, \{/)[0];
    if (/utm_medium=cpc|gclid=|msclkid=/.test(body)) {
      assert.match(s, /blockThirdParty: true/, 'a paid-looking arrival must sit in a step with third parties blocked: ' + s.slice(0, 80));
    }
  }
});
