// The contact form conversion pass, approved by Tom on 11/10/2026 (Website &
// Hosting proposal "More Google Ads visitors to the contact form"). The brief
// came from the Google Ads worker: the enquiry form is the only result Tom
// pays Google Ads for, and 1.7% of paid clicks reached it.
//
// What this pins:
//   - the button says what happens ("Ask Tom to get in touch"), Tom's choice
//     of the two options offered,
//   - the approved "what happens next" line sits right by the button, on
//     every page that uses the shared footer,
//   - only name and email stay required, and the call, email and WhatsApp
//     details stay directly under the form,
//   - the Google Ads Contact conversion and the /thank-you route are not
//     touched by any of it,
//   - the city landing pages' plainer lines are applied by the same exact
//     value guard as the voice sweep, so a CMS edit is never overwritten,
//   - an emptied biography paragraph renders nothing.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const NEXT = "Tom reads every enquiry himself and replies personally, usually within one working day. The first conversation is free and there's no obligation.";

async function renderThankYou(submitText) {
  const themes = require('../db/themes');
  return ejs.renderFile(path.join(root, 'views', 'thank-you.ejs'), {
    nonce: 'n', csrfToken: 'tok', ga4Id: '', theme: themes.dark, navPages: [], content: {},
    pageContact: { heading: 'h', body: 'b', label: '', headerCtaText: 'Start a conversation', submitText, messagePlaceholder: 'm' },
    heardAboutOptions: [], conversion: null
  });
}

test('the default button says what happens, in both places the default is built', () => {
  for (const f of ['server.js', 'lib/navShell.js']) {
    assert.ok(/submitText: 'Ask Tom to get in touch'/.test(read(f)), `${f} does not default the button to "Ask Tom to get in touch"`);
    assert.ok(!/submitText: 'Send'/.test(read(f)), `${f} still defaults the button to "Send"`);
  }
});

test('the approved next step sits right by the button, and the form still needs only name and email', async () => {
  const footer = read('views/partials/site-footer.ejs');
  const btn = footer.indexOf('<button type="submit"');
  const next = footer.indexOf(NEXT);
  assert.ok(btn > 0 && next > btn, 'the next-step line is not after the button');
  assert.ok(next < footer.indexOf('id="leadFormStatus"'), 'the next-step line is not directly under the button');
  assert.ok(next < footer.indexOf('</form>'), 'the next-step line left the form');

  const html = await renderThankYou('Ask Tom to get in touch');
  assert.ok(html.includes('>Ask Tom to get in touch</button>'), 'the button text did not render');
  assert.ok(html.replace(/&#39;/g, "'").includes(NEXT), 'the next-step line did not render');

  const form = html.slice(html.indexOf('id="leadForm"'), html.indexOf('</form>'));
  const required = (form.match(/<(?:input|textarea|select)[^>]*\brequired\b[^>]*>/g) || []).map((t) => (t.match(/name="([^"]+)"/) || [])[1]);
  assert.deepStrictEqual(required.sort(), ['email', 'name'], `required fields are ${required.join(', ')}`);

  // Call, email and WhatsApp stay directly under the form.
  const after = html.slice(html.indexOf('</form>'));
  assert.ok(after.indexOf('Prefer to call, email or WhatsApp instead?') >= 0 && after.indexOf('class="contact-details"') > 0, 'the contact details moved away from the form');

  // Both copies of the styles carry the rule, or half the site renders it unstyled.
  for (const f of ['views/index.ejs', 'views/partials/site-chrome-styles.ejs']) {
    assert.ok(/\.lead-form-next \{/.test(read(f)), `${f} has no .lead-form-next rule`);
  }
});

test('the quiz block renders under the form on the homepage only', async () => {
  const base = { canEdit: false, content: {}, heardAboutOptions: [], turnstileSiteKey: '',
    pageContact: { heading: 'h', body: 'b', label: '', submitText: 'Ask Tom to get in touch', messagePlaceholder: 'm' } };
  const file = path.join(root, 'views', 'partials', 'site-footer.ejs');
  const home = await ejs.renderFile(file, { ...base, currentPage: { slug: 'main' } });
  const devon = await ejs.renderFile(file, { ...base, currentPage: { slug: 'business-consultant-devon' } });
  const standalone = await ejs.renderFile(file, { ...base });
  assert.ok(home.includes('Owner Dependency Quiz') && home.indexOf('class="contact-details"') < home.indexOf('class="pg-teaser'), 'the homepage quiz block is missing or above the contact details');
  assert.ok(!devon.includes('class="pg-teaser'), 'the quiz block appeared on a landing page');
  assert.ok(!standalone.includes('class="pg-teaser'), 'the quiz block appeared on a page with no CMS page');
});

test('the Contact conversion and /thank-you are untouched by this pass', () => {
  // The only Google Ads conversion the site fires is the Contact label on
  // /thank-you, behind a server-issued token. Nothing in this pass may add a
  // second firing point or change the label.
  const label = 'vCKKCKjSna0cEN6RgsVD';
  for (const f of ['views/partials/site-footer.ejs', 'views/partials/home-quiz-teaser.ejs', 'views/taxi-operators.ejs', 'lib/landingPlainCopy.js']) {
    assert.ok(!read(f).includes(label), `${f} carries the Contact conversion label`);
    assert.ok(!/gtag\(\s*'event'\s*,\s*'conversion'/.test(read(f)), `${f} fires a conversion`);
  }
  assert.ok(read('views/thank-you.ejs').includes(label), 'the Contact conversion left /thank-you');
});

test('city landing pages: the plainer lines, applied only over the values production holds', () => {
  const { GROUPS, OLD_STEP_3, NEW_STEP_3 } = require('../lib/landingPlainCopy');
  const { planGroup } = require('../lib/voiceSweepCopy');
  assert.strictEqual(GROUPS.length, 4, 'not all four city pages are covered');
  const pages = GROUPS.map((g) => g.page).sort();
  assert.deepStrictEqual(pages, ['business-consultant-cornwall', 'business-consultant-devon', 'business-consultant-exeter', 'business-consultant-plymouth']);

  const BR = '<br /><br />\n\n';
  for (const g of GROUPS) {
    const step3 = g.rows.find((r) => r.key.endsWith('.step_3_body'));
    assert.strictEqual(step3.from, `${OLD_STEP_3}${BR}No obligation.`);
    assert.strictEqual(step3.to, `${NEW_STEP_3}${BR}No obligation.`);
    // Production as left by the voice sweep: every row at its `from`.
    const live = Object.fromEntries(g.rows.map((r) => [r.key, r.from]));
    assert.strictEqual(planGroup(g, live).action, 'write');
    // A rerun after writing: nothing to do.
    const done = Object.fromEntries(g.rows.map((r) => [r.key, r.to]));
    assert.strictEqual(planGroup(g, done).action, 'done');
    // A row edited in the CMS since: the whole page stands down.
    const edited = { ...live, [g.rows[2].key]: 'Tom rewrote this in the CMS.' };
    const plan = planGroup(g, edited);
    assert.strictEqual(plan.action, 'stand_down');
    assert.strictEqual(plan.writes.length, 0);
  }

  // The approved wording, checked against the brand rules.
  const words = GROUPS[0].rows.map((r) => r.to).join(' ');
  assert.ok(!/[—–]/.test(words), 'a dash in the new lines');
  assert.ok(words.includes("You'll know what matters most and whether it makes sense to work together."));
  assert.ok(words.includes('We can meet in person or work by video call. Either way, we understand the business before we suggest any changes.'));
  assert.ok(words.includes('The aim is better decisions and a business that needs less from you.'));
  assert.ok(!words.includes('Most relationships begin'), 'the repeated line is still being written');
});

test('an emptied biography paragraph renders nothing', () => {
  const src = read('views/index.ejs');
  const tpl = src.slice(src.indexOf('<div class="problem-grid">'), src.indexOf('<div class="problem-grid">') + 900);
  for (const f of ['col_1_p1', 'col_1_p2', 'col_2_p1', 'col_2_p2']) assert.ok(tpl.includes(`'${f}'`), `${f} is not rendered by the guarded loop`);
  assert.ok(/if \(\(content\[_k \+ '\.' \+ _f\] \|\| ''\)\.trim\(\)\)/.test(tpl), 'empty biography paragraphs are emitted again');
  assert.ok(!/<p><%- content\[_k \+ '\.col_[12]_p[12]'\] %><\/p>/.test(tpl), 'an unguarded biography paragraph is back');
});
