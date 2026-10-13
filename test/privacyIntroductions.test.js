'use strict';

// The privacy page's "If we contacted you first" section (13/10/2026).
// Tom's decisions behind it: Hunter is an approved source (already in the
// Opportunity Builder brief), details of people who do not reply are deleted
// 12 months after the last contact, and anyone who asks not to be contacted
// goes on a do-not-contact list. These tests pin those facts so the page
// cannot drift away from them, and pin that it states no other period.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const page = fs.readFileSync(path.join(__dirname, '..', 'views', 'privacy.ejs'), 'utf8');
const start = page.indexOf('id="introductions"');
const section = page.slice(start, page.indexOf('<h2>What we do not do</h2>'));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the section exists and has an anchor outreach can link to', () => {
  assert.ok(start > 0, 'no id="introductions" section');
  assert.match(text(section), /If we contacted you first/);
});

test('it names the sources, Hunter included, and rules out guessed addresses', () => {
  const t = text(section);
  for (const source of ["business's own website", 'Companies House', 'Hunter']) {
    assert.ok(t.includes(source), `source missing: ${source}`);
  }
  assert.match(t, /never guess an email address or build one from a pattern/);
  assert.match(t, /if you ask, we will tell you exactly where we found yours/);
});

test('it explains UK GDPR for work details and the PECR difference', () => {
  const t = text(section);
  assert.match(t, /UK GDPR\) still applies to work contact details/);
  assert.match(t, /legitimate interests/);
  assert.match(t, /limited company or a limited liability partnership/);
  assert.match(t, /sole trader or an ordinary partnership is treated like a private individual/);
});

test('retention is 12 months and no other period appears anywhere on the page', () => {
  assert.match(text(section), /delete your details 12 months after we last contacted you/);
  const periods = text(page).match(/\b\d+\s+(?:days?|weeks?|months?|years?)\b/gi) || [];
  assert.deepStrictEqual(periods, ['12 months']);
});

test('objection is honoured and the do-not-contact list keeps only the address', () => {
  const t = text(section);
  assert.match(t, /tell us to stop at any time/);
  assert.match(t, /keep only your email address, on a short list of people who have asked not to be contacted/);
  assert.match(section, /mailto:tom@arringtonconsultancy\.com/);
});

test('the page makes no compliance claim and carries no dashes', () => {
  assert.doesNotMatch(text(page), /\bcomplian(t|ce)\b|\bcomply\b|\bfully lawful\b/i);
  assert.ok(!/[–—]/.test(page), 'em or en dash on the privacy page');
  assert.ok(!/-/.test(text(section).replace(/name@company\.co\.uk/, '')), 'hyphenated word in the new section');
});

test('it points complaints to the ICO', () => {
  assert.match(page, /Information Commissioner's Office at <a href="https:\/\/ico\.org\.uk">ico\.org\.uk<\/a>/);
});
