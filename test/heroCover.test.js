'use strict';

// The full-bleed hero (image as background, text overlaid) is what makes a
// landing page read as part of the same site as the home page. Until
// 01/10/2026 the CSS named three instance ids directly, so the Business
// Consultant Cornwall page launched with the side-by-side hero and Tom's
// first reaction was that it was "not consonant with my home page". The
// treatment is now a class, hero-cover, added by the hero markup for the ids
// in HERO_COVER_IDS. These tests pin that the Cornwall hero is in the list,
// that the layout rules are keyed to the class and not to an id, and that
// the closing hero on About Us (not a page opener) is still left alone.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'index.ejs'), 'utf8');

function coverIds() {
  const m = /const HERO_COVER_IDS = \[([^\]]*)\]/.exec(view);
  assert.ok(m, 'HERO_COVER_IDS is declared in views/index.ejs');
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

test('the four page-opening heroes get the full-bleed treatment, Cornwall included', () => {
  assert.deepEqual(coverIds(), ['hero', 'hero__3', 'hero__4', 'hero__6']);
});

test('the About Us closing hero (hero__2) is not a cover hero', () => {
  assert.ok(!coverIds().includes('hero__2'));
});

test('the hero markup adds the class from the list', () => {
  assert.match(view, /const _heroCover = HERO_COVER_IDS\.includes\(_iid\);/);
  assert.match(view, /<section class="hero<%= _heroCover \? ' hero-cover' : '' %>/);
});

test('the layout rules are keyed to the class, not to instance ids', () => {
  for (const rule of ['.hero.hero-cover {', '.hero.hero-cover .hero-inner {', '.hero.hero-cover .hero-text {', '.hero.hero-cover .hero-photo {', '.hero.hero-cover { min-height: 92vh; }']) {
    assert.ok(view.includes(rule), `missing rule: ${rule}`);
  }
  // Only per-photo crops may still name hero__3 / hero__4 / hero__6.
  const idKeyed = view.split('\n').filter((l) => /data-section-id="hero__[0-9]+"\]/.test(l) && !/object-position/.test(l));
  assert.deepEqual(idKeyed, [], 'a layout rule is still keyed to a hero instance id');
});

test('every cover hero has a photo crop for desktop and phone', () => {
  for (const id of coverIds()) {
    const crops = view.match(new RegExp(`\\.hero\\[data-section-id="${id}"\\] \\.hero-photo img \\{ object-position:`, 'g')) || [];
    assert.equal(crops.length, 2, `${id} should have exactly two object-position rules`);
  }
});
