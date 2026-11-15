// The shared enquiry form's fields have no visible labels, only
// placeholders. A placeholder is not a dependable accessible name (it is not
// announced consistently and it disappears once the field holds text), so
// each field carries an aria-label with the same words (15/11/2026). Nothing
// a sighted visitor sees, and nothing the form sends, changes.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { OPTIONS } = require('../lib/heardAbout');

const root = path.join(__dirname, '..');
const footer = (pageContact) => ejs.renderFile(path.join(root, 'views/partials/site-footer.ejs'), {
  canEdit: false,
  pageContact: { label: '', heading: 'H', body: 'B', messagePlaceholder: 'Tell us where the pressure is showing', submitText: 'Ask Tom to get in touch', ...pageContact },
  content: { 'contact.email': 'tom@example.invalid', 'contact.phone': '01752 477026' },
  heardAboutOptions: OPTIONS,
  currentPage: { slug: 'x' }
});
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };
const field = (html, name) => {
  const m = html.match(new RegExp(`<(?:input|textarea|select)[^>]*\\sname="${name}"[^>]*>`));
  assert.ok(m, `the ${name} field is missing`);
  return m[0];
};

test('every field a visitor fills in has an accessible name, the same words as its placeholder', async () => {
  const html = await footer({});
  for (const name of ['name', 'email', 'phone', 'preferred_time', 'message', 'heard_about_other']) {
    const tag = field(html, name);
    const label = attr(tag, 'aria-label');
    assert.ok(label, `${name} has no accessible name`);
    assert.strictEqual(label, attr(tag, 'placeholder'), `${name} is announced as something other than what is shown`);
  }
  assert.strictEqual(attr(field(html, 'name'), 'aria-label'), 'Your name');
  assert.strictEqual(attr(field(html, 'email'), 'aria-label'), 'Your email');
  assert.strictEqual(attr(field(html, 'phone'), 'aria-label'), 'Phone (optional)');
  assert.strictEqual(attr(field(html, 'preferred_time'), 'aria-label'), 'Best day/time for a 30 min call (optional)');
  assert.strictEqual(attr(field(html, 'heard_about_other'), 'aria-label'), 'Where did you hear about us?');
  // The dropdown already had its name, matching its visible prompt.
  assert.strictEqual(attr(field(html, 'heard_about'), 'aria-label'), 'How did you hear about us?');
});

test('a page that words the form its own way gets the same words announced', async () => {
  const html = await footer({ messagePlaceholder: 'The business, what is working, and what you want to change', timePlaceholder: 'Best day/time for a walk through (optional)' });
  assert.strictEqual(attr(field(html, 'message'), 'aria-label'), 'The business, what is working, and what you want to change');
  assert.strictEqual(attr(field(html, 'preferred_time'), 'aria-label'), 'Best day/time for a walk through (optional)');
  assert.strictEqual(attr(field(html, 'preferred_time'), 'placeholder'), 'Best day/time for a walk through (optional)');
});

test('nothing else about the form changed: what is required, the spam trap, the privacy line and how it is sent', async () => {
  const html = await footer({});
  const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));
  // Only name and email are required, as before.
  const required = [...form.matchAll(/<(?:input|textarea|select)[^>]*\srequired[^>]*>/g)].map((m) => attr(m[0], 'name'));
  assert.deepStrictEqual(required, ['name', 'email']);
  // The honeypot keeps its own label, stays out of the tab order and is not
  // given a name a screen reader would offer as a field to fill in.
  const trap = field(form, 'website');
  assert.strictEqual(attr(trap, 'tabindex'), '-1');
  assert.strictEqual(attr(trap, 'aria-label'), null);
  assert.ok(/class="lead-hp" aria-hidden="true"/.test(form), 'the spam trap is exposed to assistive technology');
  // Still no method or action: only the script can submit an enquiry.
  const open = form.slice(0, form.indexOf('>') + 1);
  assert.ok(!/\smethod=|\saction=/.test(open), 'the form can be posted without the script');
  assert.ok(form.includes('We use your details to respond to your enquiry. Read our <a href="/privacy">Privacy</a> page.'));
  // Field names the server and the attribution capture read are unchanged.
  const names = [...form.matchAll(/<(?:input|textarea|select)[^>]*\sname="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(names, ['website', 'name', 'email', 'phone', 'preferred_time', 'message', 'heard_about', 'heard_about_other']);
  // Limits unchanged.
  assert.strictEqual(attr(field(form, 'name'), 'maxlength'), '200');
  assert.strictEqual(attr(field(form, 'email'), 'maxlength'), '255');
  assert.strictEqual(attr(field(form, 'message'), 'maxlength'), '2000');
});
