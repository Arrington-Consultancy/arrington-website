'use strict';

// The Exe estuary, drawn from the same coordinates the fare engine uses, as
// an inline SVG. It is the one picture on the site that could belong to no
// other taxi firm: the river, the sandbar at Dawlish Warren, and the red
// cliffs running east from Orcombe Point, which is where the Jurassic Coast
// starts. It is the home page's opening image until the photograph exists,
// the "Where we go" map, and the picture on the page not found.
//
// Approximate shorelines, good enough for a map at this size; the fare
// engine's road routing is separate and not drawn from this. Colours come
// from the stylesheet (classes on every shape and on the gradient stops), so
// the same drawing works on the sand and on the night field.

const { FIRM } = require('./firm');

// Equirectangular projection onto a 254 x 200 box; longitude is squeezed
// by cos(50.66 degrees) so distances read true.
const MIN_LNG = -3.6;
const MAX_LAT = 50.76;
const X = (lng) => +((lng - MIN_LNG) * 634).toFixed(1);
const Y = (lat) => +((MAX_LAT - lat) * 1000).toFixed(1);
const pt = ([lng, lat]) => `${X(lng)} ${Y(lat)}`;

// Sea and estuary as one shape: along the coast from the bottom left, up
// the west bank of the Exe to Countess Wear, down the east bank to Exmouth,
// then east along the beaches to Sidmouth and off the right edge.
const WATER = [
  [-3.62, 50.56], [-3.49, 50.565], [-3.466, 50.581], [-3.447, 50.594], [-3.437, 50.6], [-3.431, 50.607], [-3.44, 50.612],
  [-3.452, 50.628], [-3.462, 50.645], [-3.471, 50.66], [-3.478, 50.67], [-3.49, 50.69], [-3.5, 50.703],
  [-3.48, 50.698], [-3.468, 50.686], [-3.455, 50.675], [-3.443, 50.667], [-3.434, 50.656], [-3.428, 50.648], [-3.425, 50.634],
  [-3.422, 50.618], [-3.414, 50.606], [-3.4, 50.607], [-3.385, 50.609], [-3.365, 50.614], [-3.34, 50.62], [-3.32, 50.626],
  [-3.3, 50.638], [-3.28, 50.655], [-3.26, 50.668], [-3.24, 50.677], [-3.22, 50.683], [-3.2, 50.69], [-3.18, 50.69], [-3.18, 50.56]
];
// The red cliffs from Orcombe Point east: the stretch drawn in sandstone.
const CLIFFS = [[-3.385, 50.609], [-3.365, 50.614], [-3.34, 50.62], [-3.32, 50.626], [-3.3, 50.638], [-3.28, 50.655], [-3.26, 50.668], [-3.24, 50.677], [-3.22, 50.683], [-3.2, 50.69]];
// The river above the estuary, up to Exeter.
const RIVER = [[-3.5, 50.703], [-3.505, 50.712], [-3.515, 50.718], [-3.525, 50.722]];

// Label offsets are set so no label touches another label, a dot, the shore
// or the red cliff line (checked in a browser at desktop and phone widths,
// 19/10/2026). Exmouth's name sits above its own dot, clear of the cliffs.
// Budleigh Salterton's goes in the sea in white, like Lyme Bay, because the
// cliff line climbs through anything to its right on the land side.
const TOWNS = [
  { name: 'Exmouth', lng: -3.405, lat: 50.6195, home: true, dx: -5, dy: -10 },
  { name: 'Lympstone', lng: -3.424, lat: 50.648, dx: 4, dy: 3 },
  { name: 'Exton', lng: -3.438, lat: 50.668, dx: 4, dy: 3 },
  { name: 'Topsham', lng: -3.465, lat: 50.688, dx: 4, dy: -3 },
  { name: 'Woodbury', lng: -3.401, lat: 50.676, dx: 4, dy: 3 },
  { name: 'Budleigh Salterton', lng: -3.32, lat: 50.632, dx: 4, dy: 12, sea: true },
  { name: 'Sidmouth', lng: -3.239, lat: 50.682, dx: -4, dy: -4, anchor: 'end' },
  { name: 'Exeter', lng: -3.53, lat: 50.7236, dx: -4, dy: 3, anchor: 'end' },
  { name: 'Exeter Airport', lng: -3.414, lat: 50.734, dx: 4, dy: 3 },
  { name: 'Dawlish', lng: -3.466, lat: 50.581, dx: -5, dy: 0, anchor: 'end', faint: true }
];

// id keeps the gradient reference unique when two maps share a page;
// decorative drops the labels' meaning for a screen reader when the map is
// a background rather than a figure.
function exeMap({ id = 'exe', decorative = false } = {}) {
  const towns = TOWNS.map((t) => {
    const x = X(t.lng);
    const y = Y(t.lat);
    const cls = t.home ? 'map-home' : t.faint ? 'map-faint' : 'map-town';
    const dot = t.home
      ? `<circle cx="${x}" cy="${y}" r="6" class="map-home-ring"/><circle cx="${x}" cy="${y}" r="3" class="map-home-dot"/>`
      : `<circle cx="${x}" cy="${y}" r="2.2" class="${cls}-dot"/>`;
    const textCls = t.sea ? `${cls} map-coast` : cls;
    return `${dot}<text x="${+(x + t.dx).toFixed(1)}" y="${+(y + t.dy).toFixed(1)}" class="${textCls}"${t.anchor ? ` text-anchor="${t.anchor}"` : ''}>${t.name}</text>`;
  }).join('');
  const names = TOWNS.filter((t) => !t.faint).map((t) => t.name).join(', ');
  const a11y = decorative ? 'aria-hidden="true" focusable="false"' : `role="img" aria-label="Map of the Exe estuary and the East Devon coast marking ${names}"`;
  return `<svg class="exe-map" viewBox="0 14 254 186" ${a11y}>
<defs><linearGradient id="${id}-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="map-water-a"/><stop offset="1" class="map-water-b"/></linearGradient></defs>
<rect x="0" y="14" width="254" height="186" class="map-land"/>
<path d="M${WATER.map(pt).join(' L')} Z" fill="url(#${id}-water)" class="map-water"/>
<path d="M${WATER.slice(1, 34).map(pt).join(' L')}" class="map-shore"/>
<path d="M${CLIFFS.map(pt).join(' L')}" class="map-cliffs"/>
<path d="M${RIVER.map(pt).join(' L')}" class="map-river"/>
${towns}
<text x="150" y="190" class="map-sea">Lyme Bay</text>
<text x="95" y="108" class="map-sea map-sea-sm" text-anchor="middle" transform="rotate(68 95 108)">River Exe</text>
</svg>`;
}

module.exports = { exeMap, X, Y, FIRM };
