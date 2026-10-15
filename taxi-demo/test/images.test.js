'use strict';
// Photograph slots: a <picture> at every width that exists when the files
// are there, and otherwise whatever the page supplies (a field, type, the
// map) or nothing at all. Never a broken image, never a painted scene.
const test = require('node:test');
const assert = require('node:assert/strict');
const images = require('../lib/images');
const { picture, typeField, raw } = require('../lib/html');

function fakeAssets(files) {
  return new Map(files.map((f) => [f, { body: Buffer.from(f.endsWith('.json') ? JSON.stringify({ 'hero-exmouth': { width: 2400, height: 1600 }, wav: { width: 1536, height: 1024 } }) : '') }]));
}

test('a slot with no files renders the fallback the page gives it, or nothing at all', () => {
  images.register(fakeAssets([]), (rel) => '/assets/' + rel);
  assert.equal(String(picture({ name: 'hero-exmouth', alt: 'A car' })), '', 'with no fallback the layout stands on its own');
  const out = String(picture({ name: 'hero-exmouth', className: 'hero-media', alt: 'A car', fallback: raw('<svg class="exe-map"></svg>') }));
  assert.equal(out, '<div class="pic pic-fallback hero-media" aria-hidden="true"><svg class="exe-map"></svg></div>');
  assert.doesNotMatch(out, /<img/);
  assert.match(String(picture({ name: 'wav', fallback: '<b>plain</b>' })), /&lt;b&gt;plain&lt;\/b&gt;/, 'a string fallback is escaped');
  const field = String(typeField({ big: '6', text: 'cars with a <ramp>', tone: 'red' }));
  assert.match(field, /^<div class="type-field type-field-red"><span class="type-field-big">6<\/span><span class="type-field-text">cars with a &lt;ramp&gt;<\/span><\/div>$/);
  assert.ok(!images.available('hero-exmouth'));
});

test('a slot with files renders WebP and JPEG at every width that exists, sized, lazy below the fold and eager above it', () => {
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

test('an original cut at its own width is offered too, so a 1536 wide picture stays sharp on a wide screen', () => {
  const files = ['img/manifest.json'];
  for (const w of [480, 768, 1200, 1536]) files.push(`img/wav-${w}.webp`, `img/wav-${w}.jpg`);
  images.register(fakeAssets(files), (rel) => '/assets/' + rel);
  assert.deepEqual(images.sources('wav', 'webp').map((s) => s.w), [480, 768, 1200, 1536]);
  const out = String(picture({ name: 'wav', alt: 'A ramp' }));
  assert.match(out, /1536\.webp 1536w"/);
  assert.match(out, /width="1200" height="800"/, 'width and height come from the manifest so the page does not shift');
  images.register(fakeAssets([]), (rel) => '/assets/' + rel);
});

test('the alt text is escaped', () => {
  const files = images.WIDTHS.map((w) => `img/wav-${w}.webp`);
  images.register(fakeAssets(files), (rel) => '/assets/' + rel);
  const out = String(picture({ name: 'wav', alt: 'A "ramp" & <b>' }));
  assert.match(out, /alt="A &quot;ramp&quot; &amp; &lt;b&gt;"/);
  images.register(fakeAssets([]), (rel) => '/assets/' + rel);
});
