'use strict';
// Photograph slots: a <picture> when the sized files exist, a painted scene
// when they do not, so a page is never left with a broken image.
const test = require('node:test');
const assert = require('node:assert/strict');
const images = require('../lib/images');
const { picture, scene } = require('../lib/html');

function fakeAssets(files) {
  const map = new Map(files.map((f) => [f, { body: Buffer.from(f.endsWith('.json') ? JSON.stringify({ 'hero-exmouth': { width: 2400, height: 1600 } }) : '') }]));
  return map;
}

test('a slot with no files renders the painted scene, with no text in it', () => {
  images.register(fakeAssets([]), (rel) => '/assets/' + rel);
  const out = String(picture({ name: 'hero-exmouth', kind: 'day', className: 'hero-media', alt: 'A car' }));
  assert.match(out, /class="pic pic-fallback pic-day hero-media"/);
  assert.match(out, /<svg class="scene"/);
  assert.doesNotMatch(out, /<img/);
  assert.doesNotMatch(out, /<text/, 'the fallback carries no lettering');
  for (const kind of ['day', 'night', 'sand', 'road', 'huts']) assert.match(scene(kind), /^<svg class="scene" viewBox="0 0 1200 800"/);
});

test('a slot with files renders WebP and JPEG at every width, sized, lazy below the fold and eager above it', () => {
  const files = [];
  for (const w of images.WIDTHS) files.push(`img/hero-exmouth-${w}.webp`, `img/hero-exmouth-${w}.jpg`);
  files.push('img/manifest.json');
  images.register(fakeAssets(files), (rel) => `/assets/${rel}?v=abc`);
  const lazy = String(picture({ name: 'hero-exmouth', alt: 'A car on the seafront', sizes: '50vw' }));
  assert.match(lazy, /<source type="image\/webp" srcset="\/assets\/img\/hero-exmouth-480\.webp\?v=abc 480w, [^"]*2400w" sizes="50vw">/);
  assert.match(lazy, /<img src="\/assets\/img\/hero-exmouth-1200\.jpg\?v=abc" srcset="[^"]*\.jpg[^"]*" sizes="50vw" width="1200" height="800" alt="A car on the seafront" decoding="async" loading="lazy">/);
  const eager = String(picture({ name: 'hero-exmouth', alt: '', priority: true }));
  assert.match(eager, /fetchpriority="high"/);
  assert.doesNotMatch(eager, /loading="lazy"/);
  assert.ok(images.available('hero-exmouth'));
  assert.ok(!images.available('airport-night'));
  images.register(fakeAssets([]), (rel) => '/assets/' + rel);
});

test('the alt text is escaped', () => {
  const files = images.WIDTHS.map((w) => `img/wav-${w}.webp`);
  images.register(fakeAssets(files), (rel) => '/assets/' + rel);
  const out = String(picture({ name: 'wav', alt: 'A "ramp" & <b>' }));
  assert.match(out, /alt="A &quot;ramp&quot; &amp; &lt;b&gt;"/);
  images.register(fakeAssets([]), (rel) => '/assets/' + rel);
});
