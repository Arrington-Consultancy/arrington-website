const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ejs = require('ejs');
const root = path.join(__dirname, '..');
const file = path.join(root, 'views/partials/Microsoft tracking.ejs');
const template = fs.readFileSync(file, 'utf8');
const ID = 'Abc_def-0123456789';
const render = (values = {}) => ejs.render(template, { nonce: 'test', microsoftUetTagId: '123456789', microsoftUetPublicPage: true, ...values });

function browser(storage = new Map(), options = {}) {
  const nodes = [], handlers = {}, hits = [];
  const document = {
    head: { appendChild(node) { nodes.push(node); } },
    body: { appendChild(node) { nodes.push(node); } },
    querySelector() { return null; },
    createElement(tag) { return { tag, hidden: false, setAttribute() {}, addEventListener(name, fn) { this[name] = fn; } }; },
    addEventListener(name, fn) { handlers[name] = fn; }
  };
  const context = {
    document, location: { pathname: options.pathname || '/' },
    history: { replaceState(...args) { context.address = args[2]; } },
    localStorage: { getItem(k) { if (options.storageFails) throw Error(); return storage.get(k); }, setItem(k, v) { if (options.storageFails) throw Error(); storage.set(k, v); } },
    UET: function (opts) { hits.push(...opts.q); this.push = (...args) => hits.push(args); }
  };
  context.window = context;
  vm.runInNewContext(render().match(/<script[^>]*>([\s\S]*?)<\/script>/)[1], context);
  handlers.DOMContentLoaded();
  return { context, nodes, hits, load() { nodes.find(n => n.tag === 'script').onload(); }, choose(choice) { nodes.find(n => n.tag === 'aside').click({ target: { getAttribute() { return choice; } } }); } };
}

test('unconfigured and private pages have no UET or consent UI', () => {
  assert.equal(render({ microsoftUetTagId: '' }).trim(), '');
  assert.equal(render({ microsoftUetPublicPage: false }).trim(), '');
});
test('no Microsoft request before consent; decline leaves form tracking inactive', () => {
  const b = browser();
  assert.equal(b.nodes.filter(n => n.tag === 'script').length, 0);
  b.context.arrMicrosoftContact(ID);
  b.choose('denied');
  assert.equal(b.nodes.filter(n => n.tag === 'script').length, 0);
  assert.equal(b.hits.length, 0);
});
test('accept loads once and sends only a genuine pending enquiry after SDK readiness', () => {
  const b = browser();
  b.context.arrMicrosoftContact(ID);
  b.choose('granted');
  assert.equal(b.hits.length, 0);
  assert.equal(b.nodes.find(n => n.tag === 'script').src, 'https://bat.bing.net/bat.js?ti=123456789');
  b.load();
  assert.equal(b.hits.filter(h => h[0] === 'event').length, 1);
  b.context.arrMicrosoftContact(ID);
  b.choose('granted');
  assert.equal(b.hits.filter(h => h[0] === 'event').length, 1);
  assert.equal(b.nodes.filter(n => n.tag === 'script').length, 1);
  assert.ok(b.hits.findIndex(h => h[0] === 'pageLoad') < b.hits.findIndex(h => h[0] === 'event'));
  assert.ok(!JSON.stringify(b.hits).includes(ID), 'signed enquiry identifier is not sent to Microsoft');
});
test('ordinary page load and bare thank-you do not count as enquiries', () => {
  for (const pathname of ['/', '/thank-you']) {
    const b = browser(new Map([['arrMicrosoftAdsConsent', 'granted']]), { pathname });
    b.load();
    assert.equal(b.hits.filter(h => h[0] === 'event').length, 0);
    if (pathname === '/thank-you') assert.equal(b.context.address, '/thank-you');
  }
});
test('refresh or replay in another tab shares the spent enquiry guard', () => {
  const storage = new Map([['arrMicrosoftAdsConsent', 'granted']]);
  const first = browser(storage);
  first.context.arrMicrosoftContact(ID); first.load();
  const second = browser(storage);
  second.context.arrMicrosoftContact(ID); second.load();
  assert.equal(second.hits.filter(h => h[0] === 'event').length, 0);
});
test('withdrawal stops new enquiries and settings can reopen the choice', () => {
  const b = browser(new Map([['arrMicrosoftAdsConsent', 'granted']])); b.load();
  b.nodes.find(n => n.tag === 'button').click();
  assert.equal(b.nodes.find(n => n.tag === 'aside').hidden, false);
  b.choose('denied'); b.context.arrMicrosoftContact(ID);
  assert.equal(b.hits.filter(h => h[0] === 'event').length, 0);
});
test('blocked browser storage does not break the form or count rejected tracking', () => {
  const b = browser(new Map(), { storageFails: true });
  b.context.arrMicrosoftContact(ID); b.choose('denied');
  assert.equal(b.hits.length, 0);
});
test('the enquiry call is inside the verified-token conditional', () => {
  const source = fs.readFileSync(path.join(root, 'views/thank-you.ejs'), 'utf8');
  assert.ok(source.indexOf('window.arrMicrosoftContact(id)') > source.indexOf('<% if (conversion) { %>'));
  assert.ok(source.indexOf('window.arrMicrosoftContact(id)') < source.indexOf('<% } %>'));
});
