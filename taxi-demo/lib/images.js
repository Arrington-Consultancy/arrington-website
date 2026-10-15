'use strict';

// Photograph slots. The pages ask for an image by name ("hero-exmouth") and
// get a <picture> when its sized files are in public/img, or whatever
// fallback the page supplies when they are not, so a slot is never a broken
// image and a new photograph drops in by file name with no code change (see
// VISUALS.md and scripts/optimise-images.py).
//
// The server registers its asset map here at start, which is also what
// gives every image a content-hashed address and a year-long cache. The
// widths on offer are read from the files that exist, not from a fixed
// list, so an original cut at its own width (1536 here) is served too.

const WIDTHS = [480, 768, 1200, 1600, 2400];

let url = (rel) => '/assets/' + rel;
let manifest = {};
let found = {};

function register(assets, assetUrl) {
  url = assetUrl;
  found = {};
  for (const rel of assets.keys()) {
    const m = /^img\/(.+)-(\d+)\.(webp|jpg)$/.exec(rel);
    if (!m) continue;
    const name = m[1];
    found[name] = found[name] || { webp: [], jpg: [] };
    found[name][m[3]].push(Number(m[2]));
  }
  for (const name of Object.keys(found)) {
    found[name].webp.sort((a, b) => a - b);
    found[name].jpg.sort((a, b) => a - b);
  }
  const m = assets.get('img/manifest.json');
  try { manifest = m ? JSON.parse(m.body.toString('utf8')) : {}; } catch (e) { manifest = {}; }
}

// An image counts as present once a WebP of it exists at any width.
const available = (name) => Boolean(found[name] && found[name].webp.length);

function sources(name, ext) {
  return ((found[name] || {})[ext] || []).map((w) => ({ w, url: url(`img/${name}-${w}.${ext}`) }));
}

// The original's size, from the manifest the script writes, so width and
// height attributes keep the page from shifting as the photograph loads.
const size = (name) => manifest[name] || { width: 1536, height: 1024 };

module.exports = { register, available, sources, size, WIDTHS };
