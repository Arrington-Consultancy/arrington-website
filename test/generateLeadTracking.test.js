'use strict';

// Tom, 06/10/2026: the only thing that counts as a lead is a completed
// contact form. GA4's generate_lead is therefore sent from exactly one place
// in the site's code, the footer form's success path, after /api/leads has
// stored the enquiry, with page_location so leads can be split by page.
// Phone, email and WhatsApp taps send their own *_click events and never
// generate_lead. (The false generate_lead events of October 2026 came from
// four GA4 Admin "create event" rules, not from this code; see CLAUDE.md.)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAIR = ['views/partials/site-chrome-script.ejs', 'views/index.ejs'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ejs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

function formHandler(src) {
  const start = src.indexOf("fetch('/api/leads'");
  assert.ok(start !== -1, 'footer form handler not found');
  const end = src.indexOf('} catch (err) {', start);
  return { success: src.slice(start, end), after: src.slice(end, end + 1500) };
}

test('generate_lead is sent only from the footer form success path, in both copies', () => {
  for (const f of PAIR) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const all = src.match(/gtag\('event', 'generate_lead'/g) || [];
    assert.strictEqual(all.length, 1, `${f}: generate_lead must be sent from exactly one place`);
    const { success, after } = formHandler(src);
    const okCheck = success.indexOf('if (!res.ok) throw');
    const lead = success.indexOf("gtag('event', 'generate_lead'");
    assert.ok(okCheck !== -1 && lead > okCheck, `${f}: generate_lead must follow the stored-enquiry check`);
    assert.ok(!/generate_lead/.test(after), `${f}: generate_lead must not be sent on failure`);
    const call = success.slice(lead, success.indexOf(');', lead));
    assert.match(call, /page_location: location\.href/, `${f}: generate_lead must carry page_location`);
    assert.match(call, /event_callback: go/, `${f}: the redirect must wait for generate_lead`);
  }
});

test('nothing else in the site sends generate_lead', () => {
  const files = ['views', 'lib', 'routes', 'public/js'].flatMap((d) => walk(path.join(ROOT, d)))
    .concat([path.join(ROOT, 'server.js')]);
  for (const f of files) {
    if (PAIR.some((p) => f.endsWith(p))) continue;
    assert.ok(!/['"]generate_lead['"]/.test(fs.readFileSync(f, 'utf8')), `${path.relative(ROOT, f)} sends generate_lead`);
  }
});

test('phone, email and WhatsApp taps send *_click events, never generate_lead', () => {
  for (const f of PAIR) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const i = src.indexOf('a[href^="tel:"], a[href^="mailto:"]');
    assert.ok(i !== -1, `${f}: tap listener not found`);
    const block = src.slice(i, src.indexOf('querySelectorAll', i + 10));
    assert.match(block, /kind \+ '_click'/);
    assert.ok(!/generate_lead|'conversion'/.test(block), `${f}: a tap must not send a lead or a conversion`);
  }
});
