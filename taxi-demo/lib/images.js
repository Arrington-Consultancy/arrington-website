'use strict';

// Photograph slots. The pages ask for an image by name ("hero-exmouth") and
// get a <picture> when its sized files are in public/img, or a painted
// fallback when they are not, so the site looks finished before Tom's
// photographs exist and they drop in by file name with no code change (see
// VISUALS.md and scripts/optimise-images.py).
//
// The server registers its asset map here at start, which is also what
// gives every image a content-hashed address and a year-long cache.

const WIDTHS = [480, 768, 1200, 1600, 2400];

let has = () => false;
let url = (rel) => '/assets/' + rel;
let manifest = {};

function register(assets, assetUrl) {
  has = (rel) => assets.has(rel);
  url = assetUrl;
  const m = assets.get('img/manifest.json');
  try { manifest = m ? JSON.parse(m.body.toString('utf8')) : {}; } catch (e) { manifest = {}; }
}

// An image counts as present once the 1200 wide WebP exists, which the
// script always writes (an original narrower than 1200 is served as is).
const available = (name) => has(`img/${name}-1200.webp`) || has(`img/${name}-768.webp`);

function sources(name, ext) {
  return WIDTHS.filter((w) => has(`img/${name}-${w}.${ext}`)).map((w) => ({ w, url: url(`img/${name}-${w}.${ext}`) }));
}

// The original's size, from the manifest the script writes, so width and
// height attributes keep the page from shifting as the photograph loads.
const size = (name) => manifest[name] || { width: 1536, height: 1024 };

module.exports = { register, available, sources, size, WIDTHS };
