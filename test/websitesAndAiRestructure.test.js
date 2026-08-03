// Websites and AI page restructure — pure-logic unit tests.
// No database, no network, no server required: run with `npm test`.
//
// Tests the seed migration helpers in lib/websitesAndAiRestructure.js and
// verifies that the lorem placeholder schema is present for the new
// websitecase template.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  newHeroContent,
  wsaContent,
  buildNewPageOrder,
} = require('../lib/websitesAndAiRestructure');

const lorem = require('../db/lorem');

describe('websitesAndAiRestructure', () => {
  describe('newHeroContent', () => {
    test('returns the correct £999 headline', () => {
      const content = newHeroContent('hero__6');
      const headingRow = content.find(([k]) => k === 'hero__6.heading');
      assert.ok(headingRow, 'heading row exists');
      assert.equal(headingRow[1], 'A genuinely bespoke website for £999.');
    });

    test('CTA text is the required button label', () => {
      const content = newHeroContent('hero__6');
      const ctaRow = content.find(([k]) => k === 'hero__6.cta');
      assert.ok(ctaRow, 'cta row exists');
      assert.equal(ctaRow[1], "Tell us what you're looking to build");
    });

    test('whatsapp key is present and empty by default', () => {
      const content = newHeroContent('hero__6');
      const waRow = content.find(([k]) => k === 'hero__6.whatsapp');
      assert.ok(waRow, 'whatsapp row exists');
      assert.equal(waRow[1], '');
    });

    test('all keys are prefixed with the supplied iid', () => {
      const iid = 'hero__7';
      const content = newHeroContent(iid);
      assert.ok(content.every(([k]) => k.startsWith(iid + '.')), 'all keys prefixed');
    });
  });

  describe('wsaContent', () => {
    test('heading is exactly "Built for World Student Advisors."', () => {
      const content = wsaContent('websitecase');
      const headingRow = content.find(([k]) => k === 'websitecase.heading');
      assert.ok(headingRow, 'heading row exists');
      assert.equal(headingRow[1], 'Built for World Student Advisors.');
    });

    test('label identifies it as a £999 case study', () => {
      const content = wsaContent('websitecase');
      const labelRow = content.find(([k]) => k === 'websitecase.label');
      assert.ok(labelRow, 'label row exists');
      assert.match(labelRow[1], /£999/);
    });

    test('features list contains all 11 required items', () => {
      const content = wsaContent('websitecase');
      const featuresRow = content.find(([k]) => k === 'websitecase.features');
      assert.ok(featuresRow, 'features row exists');
      const lines = featuresRow[1].split('\n').map(l => l.trim()).filter(Boolean);
      assert.equal(lines.length, 11, 'exactly 11 features');
    });

    test('feature list includes required CRM and AI items', () => {
      const content = wsaContent('websitecase');
      const featuresRow = content.find(([k]) => k === 'websitecase.features');
      const features = featuresRow[1];
      assert.match(features, /Pipedrive CRM integration/);
      assert.match(features, /AI interview practice/);
      assert.match(features, /AI visa interview simulator/);
      assert.match(features, /Google Reviews integration/);
    });

    test('all keys are prefixed with the supplied iid', () => {
      const iid = 'websitecase__3';
      const content = wsaContent(iid);
      assert.ok(content.every(([k]) => k.startsWith(iid + '.')), 'all keys prefixed');
    });
  });

  describe('buildNewPageOrder', () => {
    const CURRENT_ORDER = ['biography', 'hero', 'biography__2', 'filter', 'biography__3', 'fourcards', 'filter__2', 'intervention'];

    test('new hero is prepended before the existing hero', () => {
      const result = buildNewPageOrder(CURRENT_ORDER, 'hero__6', 'websitecase', ['biography']);
      const heroIdx = result.indexOf('hero');
      const newHeroIdx = result.indexOf('hero__6');
      assert.ok(newHeroIdx < heroIdx, 'new hero comes before existing hero');
      assert.equal(newHeroIdx, heroIdx - 1, 'new hero is immediately before existing hero');
    });

    test('websitecase is inserted immediately after the existing hero', () => {
      const result = buildNewPageOrder(CURRENT_ORDER, 'hero__6', 'websitecase', ['biography']);
      const heroIdx = result.indexOf('hero');
      const wsaIdx = result.indexOf('websitecase');
      assert.equal(wsaIdx, heroIdx + 1, 'websitecase is immediately after existing hero');
    });

    test('old offer biography is removed from the result', () => {
      const result = buildNewPageOrder(CURRENT_ORDER, 'hero__6', 'websitecase', ['biography']);
      assert.ok(!result.includes('biography'), 'offer biography removed');
    });

    test('all other sections retain their relative order', () => {
      const result = buildNewPageOrder(CURRENT_ORDER, 'hero__6', 'websitecase', ['biography']);
      const remaining = result.filter(id => !['hero', 'hero__6', 'websitecase', 'biography'].includes(id));
      assert.deepEqual(
        remaining,
        ['biography__2', 'filter', 'biography__3', 'fourcards', 'filter__2', 'intervention']
      );
    });

    test('handles page with no existing hero gracefully', () => {
      const orderWithNoHero = ['biography', 'filter', 'intervention'];
      const result = buildNewPageOrder(orderWithNoHero, 'hero__6', 'websitecase', ['biography']);
      assert.equal(result[0], 'hero__6', 'new hero is first');
      assert.equal(result[1], 'websitecase', 'websitecase is second');
      assert.deepEqual(result.slice(2), ['filter', 'intervention']);
    });

    test('handles multiple offer ids', () => {
      const orderWithTwo = ['biography', 'biography__4', 'hero', 'filter'];
      const result = buildNewPageOrder(orderWithTwo, 'hero__6', 'websitecase', ['biography', 'biography__4']);
      assert.ok(!result.includes('biography'), 'first offer removed');
      assert.ok(!result.includes('biography__4'), 'second offer removed');
    });

    test('idempotency guard: new hero heading differs from old offer heading', () => {
      // The guard in seed.js checks for the NEW heading, not the old one.
      // This test just verifies the string constants are distinct.
      const newHeading = 'A genuinely bespoke website for £999.';
      const oldHeading = 'A genuinely bespoke website \u2014 from \u00a3999';
      assert.notEqual(newHeading, oldHeading, 'new and old hero headings are distinct strings');
    });
  });

  describe('lorem placeholder for websitecase', () => {
    test('db/lorem.js has a websitecase entry', () => {
      assert.ok(lorem.websitecase, 'websitecase entry exists');
    });

    test('websitecase lorem has the four required keys', () => {
      const keys = Object.keys(lorem.websitecase);
      assert.ok(keys.includes('label'), 'has label');
      assert.ok(keys.includes('heading'), 'has heading');
      assert.ok(keys.includes('intro'), 'has intro');
      assert.ok(keys.includes('features'), 'has features');
    });
  });
});
