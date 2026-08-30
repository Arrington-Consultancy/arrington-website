// The project firewall between Scott's social demonstration and
// Arrington's real accounts.
//
// Tom's instruction of 30/08/2026: "Scott must remain isolated from
// Arrington. Never connect Scott to Arrington's real Facebook,
// Instagram, LinkedIn or X accounts, tokens or data."
//
// A comment saying so is not a control. These tests are the control:
// they read the Scott social module's own source and assert that no
// path to a real account exists, so a later edit that adds one fails
// here rather than in production.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOCIAL_DIR = path.join(__dirname, '..', '..', 'lib', 'scott', 'social');
const sourceFiles = fs.readdirSync(SOCIAL_DIR).filter((f) => f.endsWith('.js'));
const sources = sourceFiles.map((f) => ({ file: f, text: fs.readFileSync(path.join(SOCIAL_DIR, f), 'utf8') }));

const social = require('../../lib/scott/social/fictionalSocial');
const registry = require('../../lib/workspace/social/registry');

test('Scott social code reads no credential of any kind', () => {
  // Every credential name the real Arrington connectors use, plus the
  // generic shapes. None may appear anywhere in Scott's social code.
  const forbidden = [
    ...registry.PLATFORM_IDS.flatMap((p) => registry.PLATFORMS[p].credentialEnv),
    'ACCESS_TOKEN', 'BEARER_TOKEN', 'CLIENT_SECRET', 'API_KEY', 'process.env'
  ];
  sources.forEach(({ file, text }) => {
    forbidden.forEach((token) => {
      assert.ok(!text.includes(token), `${file} references ${token}: Scott must have no credential path at all`);
    });
  });
});

test('Scott social code has no network path, so no token could reach a real account even if one existed', () => {
  const networkShapes = [/\bfetch\s*\(/, /require\(['"]https?['"]\)/, /axios/, /XMLHttpRequest/, /graph\.facebook/, /api\.linkedin/, /api\.x\.com|api\.twitter/, /api\.instagram/];
  sources.forEach(({ file, text }) => {
    networkShapes.forEach((re) => {
      assert.ok(!re.test(text), `${file} contains a network path (${re}): the demonstration must be data only`);
    });
  });
});

test('Scott social code never imports the Arrington workspace', () => {
  sources.forEach(({ file, text }) => {
    assert.ok(!/require\([^)]*workspace/i.test(text), `${file} imports from the Arrington workspace`);
  });
});

test('the Arrington social connectors never import anything from Scott', () => {
  const wsDir = path.join(__dirname, '..', '..', 'lib', 'workspace', 'social');
  fs.readdirSync(wsDir).filter((f) => f.endsWith('.js')).forEach((f) => {
    const text = fs.readFileSync(path.join(wsDir, f), 'utf8');
    assert.ok(!/require\([^)]*scott/i.test(text), `${f} imports from the Scott demonstration`);
  });
});

test('every fictional social record is domain tagged, so clearance filtering applies to all of it', () => {
  const all = Object.values(social).flat();
  const untagged = all.filter((r) => !r.domain);
  assert.deepEqual(untagged, [], 'an untagged record would bypass every clearance control');
  assert.ok(all.length >= 15, 'the demonstration needs enough data to be worth showing');
});

test('social reuses existing 07E domains rather than inventing a new one', () => {
  const used = [...new Set(Object.values(social).flat().map((r) => r.domain))].sort();
  assert.deepEqual(used, ['marketing_consent', 'marketing_performance', 'review_status']);
});

test('the same social page shows Chloe the comments and not the paid performance', () => {
  const clearance = require('../../lib/scott/clearance');
  // Chloe (customer care) holds review_status but not marketing_performance:
  // this is the demonstration, not a side effect.
  assert.equal(clearance.personaCanSeeDomain('chloe_reed', 'review_status'), true);
  assert.equal(clearance.personaCanSeeDomain('chloe_reed', 'marketing_performance'), false);
  // Bob's persona owner and Scott do see performance.
  assert.equal(clearance.personaCanSeeDomain('scott_mercer', 'marketing_performance'), true);
  // The narrowest persona in the company sees neither.
  assert.equal(clearance.personaCanSeeDomain('mike_evans', 'review_status'), false);
  assert.equal(clearance.personaCanSeeDomain('mike_evans', 'marketing_performance'), false);
});

test('no fictional handle collides with a real Arrington account name', () => {
  const handles = social.SOCIAL_ACCOUNTS.map((a) => String(a.handle).toLowerCase());
  handles.forEach((h) => {
    assert.ok(!h.includes('arrington'), `fictional handle ${h} names Arrington`);
  });
});
