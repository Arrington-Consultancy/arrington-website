// Microsoft Advertising UET (12/10/2026): gated on MICROSOFT_UET_TAG_ID,
// loaded only for a visit from a Microsoft advert or a browser that said
// Allow, consent mode on (ad_storage denied until Allow), and the
// "Contact enquiry" goal event (contact_form_submit, category contact)
// sent only on /thank-you inside the once-per-token guard.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const views = path.join(root, 'views');
const tagFile = path.join(views, 'partials', 'google-tag.ejs');
const render = (locals) => ejs.render(fs.readFileSync(tagFile, 'utf8'), locals, { filename: tagFile });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

// The UET script from the rendered partial, run against a small fake
// browser. Returns the window so a test can read uetq, the bar and storage.
function uetScript() {
  const html = render({ nonce: 'n', microsoftUetTagId: '343278313' });
  const m = html.match(/<script nonce="n">\s*(\(function \(\) \{\s*var fromAd[\s\S]*?\}\)\(\);)\s*<\/script>/);
  assert.ok(m, 'the UET script renders');
  return m[1];
}

// Objects made inside the vm context have that context's prototypes, so
// they are compared as plain JSON.
const plain = (x) => JSON.parse(JSON.stringify(x));

function store(initial) {
  const data = Object.assign({}, initial);
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); }
  };
}

function runUet({ search = '', session = {}, local = {}, scrollY = 0 } = {}) {
  const inserted = [];
  const winListeners = {};
  const listeners = {};
  let bar = null;
  const makeEl = (tag) => {
    const el = {
      tag, attrs: {}, className: '', innerHTML: '', removed: false,
      setAttribute(k, v) { this.attrs[k] = v; },
      remove() { this.removed = true; }
    };
    if (tag === 'div') {
      el.buttons = {};
      el.querySelector = (sel) => {
        if (!el.buttons[sel]) el.buttons[sel] = { on: {}, addEventListener(ev, fn) { this.on[ev] = fn; } };
        return el.buttons[sel];
      };
    }
    return el;
  };
  const document = {
    readyState: 'complete',
    body: { appendChild(el) { bar = el; } },
    createElement: makeEl,
    getElementsByTagName: () => [{ parentNode: { insertBefore(n) { inserted.push(n); } } }],
    querySelector: () => (bar && !bar.removed ? bar : null),
    addEventListener(ev, fn) { listeners[ev] = fn; }
  };
  const win = {
    location: { search },
    sessionStorage: store(session),
    localStorage: store(local),
    document,
    URLSearchParams,
    scrollY,
    addEventListener(ev, fn) { winListeners[ev] = fn; },
    removeEventListener(ev, fn) { if (winListeners[ev] === fn) delete winListeners[ev]; }
  };
  win.window = win;
  vm.runInNewContext(uetScript(), win);
  const scroll = () => { win.scrollY = 300; if (winListeners.scroll) winListeners.scroll(); };
  return { win, inserted, bar: () => bar, scroll, listening: () => !!winListeners.scroll };
}

test('unset: nothing that names bat.bing or uetq renders', () => {
  const html = render({ nonce: 'n' });
  assert.ok(!/bat\.bing|uetq/.test(html));
});

test('set: one nonced script for exactly that tag id, loader on bat.bing.net, no inline style attribute', () => {
  const html = render({ nonce: 'n', microsoftUetTagId: '343278313' });
  assert.strictEqual(html.split('ti: "343278313"').length - 1, 1);
  assert.match(html, /"https:\/\/bat\.bing\.net\/bat\.js\?ti="/);
  for (const tag of html.match(/<(script|style)(?![^>]*\bsrc=)[^>]*>/g)) {
    assert.match(tag, /nonce="n"/, 'every inline script and style block carries the nonce');
  }
  assert.ok(!/style="/.test(html), 'the strict CSP refuses inline style attributes');
  assert.ok(!html.includes('enableAutoSpaTracking'), '/thank-you rewrites its own address; SPA tracking would count it twice');
  assert.ok(!html.includes('Microsoft Advertising UET tag (12/10/2026'), 'the EJS comment must not render');
});

test('a visit not from a Microsoft advert, with no stored Allow, sends Microsoft nothing', () => {
  const { win, inserted, bar } = runUet({ search: '?gclid=abc&utm_source=google' });
  assert.strictEqual(win.uetq, undefined);
  assert.strictEqual(inserted.length, 0);
  assert.strictEqual(bar(), null);
});

test('a Microsoft ad click: consent starts denied, the tag loads, the choice is asked once', () => {
  const { win, inserted, bar, scroll } = runUet({ search: '?msclkid=xyz' });
  assert.deepStrictEqual(plain([win.uetq[0], win.uetq[1], win.uetq[2]]), ['consent', 'default', { ad_storage: 'denied' }]);
  assert.strictEqual(inserted.length, 1);
  assert.strictEqual(inserted[0].src, 'https://bat.bing.net/bat.js?ti=343278313');
  assert.strictEqual(bar(), null, 'nothing covers the first screen');
  scroll();
  assert.ok(bar(), 'the Allow / Decline choice is shown once the visitor scrolls');
  assert.match(bar().innerHTML, /Microsoft advert/);
  assert.strictEqual(win.sessionStorage.data.arrFromMicrosoftAd, '1', 'remembered for the rest of the visit');
});

test('utm_source=bing also counts as a Microsoft ad visit, and the visit flag carries to /thank-you', () => {
  assert.strictEqual(runUet({ search: '?utm_source=bing&utm_medium=cpc' }).inserted.length, 1);
  const later = runUet({ search: '', session: { arrFromMicrosoftAd: '1' } });
  assert.strictEqual(later.inserted.length, 1, 'a later page in the same visit still loads the tag');
});

test('Allow updates consent to granted and is remembered; Decline stays cookieless', () => {
  const allow = runUet({ search: '?msclkid=1' });
  allow.scroll();
  allow.bar().buttons['.ms-allow'].on.click();
  assert.strictEqual(allow.win.localStorage.data.arrMicrosoftConsent, 'granted');
  assert.deepStrictEqual(plain(allow.win.uetq.slice(-3)), ['consent', 'update', { ad_storage: 'granted' }]);
  assert.ok(allow.bar().removed);

  const decline = runUet({ search: '?msclkid=1' });
  decline.scroll();
  const before = decline.win.uetq.length;
  decline.bar().buttons['.ms-decline'].on.click();
  assert.strictEqual(decline.win.localStorage.data.arrMicrosoftConsent, 'denied');
  assert.strictEqual(decline.win.uetq.length, before, 'no consent update pushed');
  assert.ok(decline.bar().removed);
});

test('the choice waits for a scroll, appears once, and shows at once on a page already scrolled', () => {
  const fresh = runUet({ search: '?msclkid=1' });
  assert.ok(fresh.listening(), 'waiting for the first scroll');
  fresh.scroll();
  assert.ok(fresh.bar());
  assert.ok(!fresh.listening(), 'the scroll listener removes itself');
  const midPage = runUet({ search: '?msclkid=1', scrollY: 500 });
  assert.ok(midPage.bar(), 'a page opened part way down (a reload, or #conversation) asks straight away');
});

test('on a phone the choice is a slim strip on the bottom edge, not a floating card', () => {
  const html = render({ nonce: 'n', microsoftUetTagId: '343278313' });
  const phone = html.match(/@media \(max-width: 600px\) \{([\s\S]*?)\n  \}/);
  assert.ok(phone, 'a phone rule exists');
  for (const rule of ['left: 0', 'right: 0', 'bottom: 0', 'transform: none', 'border-radius: 0', 'max-width: none']) {
    assert.ok(phone[1].includes(rule), rule);
  }
});

test('a stored choice is never asked again; a stored Allow starts granted', () => {
  const granted = runUet({ search: '', local: { arrMicrosoftConsent: 'granted' } });
  assert.deepStrictEqual(plain(granted.win.uetq.slice(0, 3)), ['consent', 'default', { ad_storage: 'granted' }]);
  assert.strictEqual(granted.bar(), null);
  const denied = runUet({ search: '?msclkid=1', local: { arrMicrosoftConsent: 'denied' } });
  assert.deepStrictEqual(plain(denied.win.uetq.slice(0, 3)), ['consent', 'default', { ad_storage: 'denied' }]);
  assert.strictEqual(denied.bar(), null);
});

test('server.js validates the id to digits and gates every bat.bing CSP host on it', () => {
  const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(src, /app\.locals\.microsoftUetTagId = \/\^\[0-9\]\{5,12\}\$\/\.test\(microsoftUetTagId\)/);
  const lines = src.split('\n').filter((l) => /https:\/\/bat\.bing\./.test(l) && !l.trim().startsWith('//'));
  assert.strictEqual(lines.length, 3, 'script, img and connect lists each carry the bat.bing hosts');
  for (const l of lines) {
    assert.match(l, /app\.locals\.microsoftUetTagId \?/, `ungated bat.bing host: ${l.trim()}`);
    assert.match(l, /bat\.bing\.net/);
  }
  assert.ok(src.match(/scriptSrc: \[[\s\S]*?bat\.bing\.net[\s\S]*?\n      \]/));
});

test('the id reaches the view through app.locals, and no view passes it by hand', () => {
  for (const f of [...walk(path.join(root, 'routes')), ...walk(views)]) {
    if (f.endsWith('microsoft-uet.ejs')) continue;
    assert.ok(!fs.readFileSync(f, 'utf8').includes('microsoftUetTagId'), `${path.relative(root, f)} should not thread microsoftUetTagId`);
  }
});

test('Scott and the Workspace never include the UET partial', () => {
  for (const dir of ['scott', 'workspace']) {
    for (const f of walk(path.join(views, dir))) {
      assert.ok(!fs.readFileSync(f, 'utf8').includes('microsoft-uet'), path.relative(views, f));
    }
  }
});

// The thank-you script, run as the browser would: once, then again as a
// refresh in the same tab.
function thankYouScript(id) {
  const s = fs.readFileSync(path.join(views, 'thank-you.ejs'), 'utf8');
  const start = s.indexOf('<% if (conversion) { %>');
  const branch = s.slice(start, s.indexOf('<% } %>', start));
  const body = branch.match(/<script nonce="<%= nonce %>">([\s\S]*?)<\/script>/)[1];
  return body.replace('<%= conversion.id %>', id);
}

function runThankYou({ id, session, uetq }) {
  const calls = { gtag: 0 };
  const win = {
    sessionStorage: session,
    gtag: () => { calls.gtag += 1; },
    history: { replaceState() {} },
    uetq
  };
  win.window = win;
  vm.runInNewContext(thankYouScript(id), win);
  return calls;
}

test('the goal event is sent once per stored enquiry; a refresh sends nothing', () => {
  const session = store({});
  const uetq = [];
  runThankYou({ id: 'abc123', session, uetq });
  runThankYou({ id: 'abc123', session, uetq });
  const events = uetq.filter((x) => x === 'event');
  assert.strictEqual(events.length, 1);
  const i = uetq.indexOf('event');
  assert.deepStrictEqual(plain(uetq.slice(i, i + 3)), ['event', 'contact_form_submit', { event_category: 'contact' }]);
  runThankYou({ id: 'def456', session, uetq });
  assert.strictEqual(uetq.filter((x) => x === 'event').length, 2, 'a second, separate enquiry counts');
});

test('no uetq (not a Microsoft visit, or UET off): the thank-you page still fires Google and does not throw', () => {
  const calls = runThankYou({ id: 'abc123', session: store({}), uetq: undefined });
  assert.strictEqual(calls.gtag, 1);
});

test('the goal event lives only on the thank-you page, inside the stored-enquiry branch', () => {
  const hits = walk(views).filter((f) => /contact_form_submit/.test(fs.readFileSync(f, 'utf8')) && /uetq/.test(fs.readFileSync(f, 'utf8')));
  assert.deepStrictEqual(hits.map((f) => path.relative(views, f)).sort(), ['partials/microsoft-uet.ejs', 'thank-you.ejs']);
  const partial = fs.readFileSync(path.join(views, 'partials', 'microsoft-uet.ejs'), 'utf8');
  const code = partial.slice(0, partial.indexOf('<%#'));
  assert.ok(!/contact_form_submit/.test(code), 'the partial itself never sends the goal event');
  const s = fs.readFileSync(path.join(views, 'thank-you.ejs'), 'utf8');
  const start = s.indexOf('<% if (conversion) { %>');
  const branch = s.slice(start, s.indexOf('<% } %>', start));
  assert.match(branch, /window\.uetq\.push\('event', 'contact_form_submit', \{ event_category: 'contact' \}\)/);
});

test('the Privacy page describes the Microsoft tag and the choice', () => {
  const s = fs.readFileSync(path.join(views, 'privacy.ejs'), 'utf8');
  assert.match(s, /Microsoft \(Bing\) advert/);
  assert.match(s, /does not receive your name, email/);
  assert.match(s, /If you choose Allow it may, and if you choose Decline it does not/);
});
