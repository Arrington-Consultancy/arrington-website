// Fix brief of 12/10/2026, item 3: a later paid or tagged arrival in the
// same visit (an ad click id or a utm_source) replaces attribution captured
// from an earlier untagged page, so an enquiry is credited to the advert that
// brought the visitor back. Runs the REAL capture snippet from both copies of
// the site chrome script (index.ejs and the shared partial) in a fake browser
// whose sessionStorage persists across "pages", the way a real visit does.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseAttribution, attributionSummary, describeAttribution } = require('../lib/leadAttribution');

const root = path.join(__dirname, '..');
const COPIES = ['views/partials/site-chrome-script.ejs', 'views/index.ejs'];

function snippet(file) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const start = src.indexOf('window.__leadAttribution = (function () {');
  assert.ok(start > 0, `${file}: capture snippet not found`);
  const end = src.indexOf('})();', start);
  return src.slice(start, end + '})();'.length);
}

function visit() {
  const store = new Map();
  const sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  return {
    stored: () => JSON.parse(store.get('arrLeadAttribution') || 'null'),
    page(code, pathAndQuery, referrer = '') {
      const u = new URL('https://www.arringtonconsultancy.com' + pathAndQuery);
      const window = {};
      const ctx = {
        window, sessionStorage, URLSearchParams,
        location: { pathname: u.pathname, search: u.search },
        document: { referrer }
      };
      vm.runInNewContext(code, ctx);
      return JSON.parse(JSON.stringify(window.__leadAttribution()));
    }
  };
}

for (const file of COPIES) {
  const code = snippet(file);

  test(`${file}: a later Google ad click replaces an organic first page`, () => {
    const v = visit();
    const first = v.page(code, '/', 'https://www.google.com/');
    assert.strictEqual(first.gclid, undefined);
    const later = v.page(code, '/business-consultant-plymouth?gclid=Cj0abc&utm_source=google&utm_medium=cpc');
    assert.strictEqual(later.gclid, 'Cj0abc');
    assert.strictEqual(later.landing_page, '/business-consultant-plymouth?gclid=Cj0abc&utm_source=google&utm_medium=cpc');
    assert.deepStrictEqual(v.stored(), later, 'the replacement is stored for the rest of the visit');
    // Ordinary pages afterwards keep the paid record.
    assert.strictEqual(v.page(code, '/evidence').gclid, 'Cj0abc');
  });

  test(`${file}: gbraid, wbraid, msclkid and a bare utm_source each count`, () => {
    for (const q of ['gbraid=g1', 'wbraid=w1', 'msclkid=m1', 'utm_source=bing']) {
      const v = visit();
      v.page(code, '/what-we-do');
      const later = v.page(code, '/?' + q);
      const [k, val] = q.split('=');
      assert.strictEqual(later[k], val, q);
    }
  });

  test(`${file}: paid is never replaced, by unpaid or by a second advert`, () => {
    const v = visit();
    const first = v.page(code, '/?gclid=first');
    assert.strictEqual(v.page(code, '/evidence', 'https://www.google.com/').gclid, 'first');
    const again = v.page(code, '/?msclkid=second');
    assert.strictEqual(again.gclid, 'first');
    assert.strictEqual(again.msclkid, undefined);
    assert.deepStrictEqual(v.stored(), first);
  });

  test(`${file}: an untagged later page never replaces an untagged first page`, () => {
    const v = visit();
    const first = v.page(code, '/useful-thinking', 'https://www.linkedin.com/');
    v.page(code, '/evidence', 'https://www.bing.com/');
    assert.deepStrictEqual(v.stored(), first);
  });
}

test('the server keeps gbraid, wbraid and msclkid and names them', () => {
  const out = parseAttribution({ gbraid: 'g<b>1', wbraid: 'w1', msclkid: 'm1', landing_page: '/?msclkid=m1' });
  assert.strictEqual(out.gbraid, 'g1');
  assert.strictEqual(out.wbraid, 'w1');
  assert.strictEqual(out.msclkid, 'm1');
  assert.strictEqual(attributionSummary({ gbraid: 'g1' }), 'Google Ads click');
  assert.strictEqual(attributionSummary({ wbraid: 'w1' }), 'Google Ads click');
  assert.strictEqual(attributionSummary({ msclkid: 'm1' }), 'Microsoft Ads click');
  const lines = describeAttribution({ gbraid: 'g1', msclkid: 'm1' }).join('\n');
  assert.match(lines, /Google Ads click id \(gbraid\): g1/);
  assert.match(lines, /Microsoft Ads click id: m1/);
});
