'use strict';

// HTML helpers and the shared page frame: the demo ribbon, header, footer,
// mobile action bar and the head tags every page needs (title, description,
// canonical, robots, structured data). Pages are plain template strings with
// every dynamic value passed through esc().
//
// The design (redesign of 15/10/2026): colours from the place (red sandstone
// cliffs, the estuary, sand), Fraunces for headings, Instrument Sans for
// everything else, full-bleed photographs with painted fallbacks, and one
// signature drawing, the Exe estuary map in lib/map.js.

const { FIRM, DEMO_NOTE, yearsRunning } = require('./firm');
const images = require('./images');

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A raw-HTML marker so composed fragments are not escaped twice.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(s);
function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.s : esc(x))).join('');
    else if (v instanceof Raw) out += v.s;
    else if (v === false || v == null) out += '';
    else out += esc(v);
    out += strings[i + 1];
  });
  return raw(out);
}

// Small line icons, drawn for this site.
const ICONS = {
  phone: '<path d="M6.5 3.5h3l1.8 4.6-2.3 1.5a11.5 11.5 0 0 0 5.4 5.4l1.5-2.3 4.6 1.8v3a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.5 5.6a2 2 0 0 1 2-2.1z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
  shield: '<path d="M12 3.2 19 6v5.2c0 4.3-2.9 8-7 9.6-4.1-1.6-7-5.3-7-9.6V6z"/><path d="m9 12 2 2 4-4"/>',
  access: '<circle cx="11" cy="4.5" r="1.8"/><path d="M11 8v5.5h5.2l2.3 5"/><path d="M8.3 10.4a5.6 5.6 0 1 0 6.9 7.4"/>',
  plane: '<path d="M3 13.5 21 7l-2.4 4-12 3.2z"/><path d="m9 12.3 1.8 5.2 2.2-.6-.3-5.5"/>',
  building: '<path d="M5 20.5V5.5l7-2v17M12 8.5h7v12M8 8h1M8 11.5h1M8 15h1M15 12h1M15 15.5h1M3 20.5h18"/>',
  star: '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  message: '<path d="M4 5.5h16v10H9l-5 4z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  car: '<path d="M4.5 16.5v-4l2-5h11l2 5v4z"/><path d="M4.5 12.5h15M7 16.5v2M17 16.5v2"/><circle cx="8" cy="14.3" r=".6"/><circle cx="16" cy="14.3" r=".6"/>'
};
const icon = (name, cls = 'icon') => raw(`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`);

// Side-on car silhouettes for the vehicle picker, 48 x 24.
const CARS = {
  saloon: '<path d="M3 16l4-5.5 10-1 6-5h9l6 5 6 1 2 5.5z"/>',
  estate: '<path d="M3 16l4-5.5 9-1 6-5h17l3 6 3 .5 1 5z"/>',
  mpv6: '<path d="M3 16l3-7 6-4h27q5 0 5 5v6z"/><path d="M14 5v11M28 5v11"/>',
  mpv8: '<path d="M2 16l3-8 5-4h32q4 0 4 4v8z"/><path d="M12 4v12M23 4v12M34 4v12"/>',
  executive: '<path d="M2 16l5-5 11-1 7-5h10l8 5 4 1 1 5z"/>',
  wav: '<path d="M3 16l3-8 5-5h27q4 0 4 4v9z"/><path d="M42 12l5 7M14 3v13"/>'
};
const carIcon = (id) => raw(`<svg class="car-icon" viewBox="0 0 48 24" aria-hidden="true" focusable="false">${CARS[id] || CARS.saloon}<circle cx="13" cy="17" r="3.2"/><circle cx="36" cy="17" r="3.2"/></svg>`);

// The mark: the sun over the tide line, in sandstone red.
const MARK = raw('<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="16" class="mark-bg"/><path d="M4.5 19c3-3.2 5-3.2 8 0s5 3.2 8 0 5-3.2 8 0" class="mark-line"/><circle cx="16" cy="10.5" r="2.7" class="mark-sun"/></svg>');
const LOGO = html`${MARK}<span class="brand-name">${FIRM.shortName}<span class="brand-sub"> Cars</span></span>`;

const NAV = [
  ['/book', 'Book online'],
  ['/airports', 'Airports'],
  ['/accounts', 'Business accounts'],
  ['/about', 'About'],
  ['/contact', 'Contact']
];

// ---- Painted fallbacks for the photograph slots -------------------------------
// Simple shapes in the site's colours: sky, sea, the red cliffs and sand.
// Each is a few hundred bytes and reads as a designed placeholder, not a
// missing image. The real photographs replace them by file name.

const SCENES = {
  day: `<defs><linearGradient id="sc-sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#B4CBD8"/><stop offset="1" stop-color="#EADFCB"/></linearGradient><linearGradient id="sc-sea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5E97AA"/><stop offset="1" stop-color="#28657D"/></linearGradient></defs>
<rect width="1200" height="800" fill="url(#sc-sky)"/><circle cx="300" cy="300" r="54" fill="#F8E9C8" opacity=".9"/>
<path d="M600 470 760 376q100-48 200-10l100-14 140 20v98z" fill="#B8452A"/><path d="M690 470l110-58q80-30 160-8l240 36v30z" fill="#9A3620"/>
<rect y="470" width="1200" height="180" fill="url(#sc-sea)"/>
<path d="M0 640q300-40 600-10t600-10v180H0z" fill="#E5D6BA"/><path d="M0 614q300-30 600-4t600-10" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="4"/><path d="M0 520q200-10 400 0t400 0 400 0" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>`,
  night: `<defs><linearGradient id="sc-night" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0D1826"/><stop offset="1" stop-color="#25405A"/></linearGradient></defs>
<rect width="1200" height="800" fill="url(#sc-night)"/><ellipse cx="620" cy="470" rx="760" ry="110" fill="#E8A469" opacity=".2"/><circle cx="980" cy="250" r="22" fill="#F3E9D2" opacity=".85"/>
<rect y="470" width="1200" height="330" fill="#0B1420"/><path d="M0 620 1200 560v240H0z" fill="#171C23"/>
<g fill="#F6D08A" opacity=".9"><circle cx="140" cy="462" r="5"/><circle cx="260" cy="462" r="5"/><circle cx="380" cy="462" r="5"/><circle cx="500" cy="462" r="5"/><circle cx="620" cy="462" r="5"/><circle cx="740" cy="462" r="5"/><circle cx="860" cy="462" r="5"/><circle cx="980" cy="462" r="5"/><circle cx="1100" cy="462" r="5"/></g>
<path d="M0 700 1200 640" fill="none" stroke="#F6D08A" stroke-opacity=".35" stroke-width="4" stroke-dasharray="40 30"/>`,
  sand: `<defs><pattern id="sc-ribs" width="240" height="80" patternUnits="userSpaceOnUse"><path d="M0 40q60-22 120 0t120 0" fill="none" stroke="#CDB994" stroke-width="10" stroke-linecap="round"/><path d="M0 72q60-16 120 0t120 0" fill="none" stroke="#D8C7A6" stroke-width="6"/></pattern></defs>
<rect width="1200" height="800" fill="#E3D4B7"/><rect width="1200" height="800" fill="url(#sc-ribs)"/>
<path d="M-50 300q350-100 650 30t650-50" fill="none" stroke="#8FB9C6" stroke-width="46" stroke-linecap="round" opacity=".85"/><path d="M-50 620q450-100 850 20t450-80" fill="none" stroke="#9CC3CF" stroke-width="30" stroke-linecap="round" opacity=".8"/>`,
  road: `<defs><linearGradient id="sc-dusk" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#22364A"/><stop offset=".55" stop-color="#6E8497"/><stop offset="1" stop-color="#DCAB7A"/></linearGradient></defs>
<rect width="1200" height="800" fill="url(#sc-dusk)"/><rect y="430" width="1200" height="40" fill="#4F8295"/><rect y="470" width="1200" height="330" fill="#2B2F35"/>
<path d="M520 470h160l420 330H100z" fill="#3A3F46"/><path d="M600 490v310" stroke="#D8CFC0" stroke-width="8" stroke-dasharray="40 50" opacity=".6"/>`
};
SCENES.huts = SCENES.day + '<g>' + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
  const x = 40 + i * 150;
  const c = ['#BF3F23', '#F2E6D0', '#2C6A82', '#E7B35A', '#7FB3C4', '#F2E6D0', '#BF3F23', '#2C6A82'][i];
  return `<path d="M${x} 600l55-40 55 40z" fill="#3B2A22" opacity=".85"/><rect x="${x}" y="600" width="110" height="72" fill="${c}"/>`;
}).join('') + '</g>';

const scene = (kind) => `<svg class="scene" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${SCENES[kind] || SCENES.day}</svg>`;

// A photograph slot: <picture> with WebP and JPEG at every width when the
// files exist, the painted scene when they do not.
function picture({ name, alt = '', kind = 'day', className = '', sizes = '100vw', priority = false }) {
  if (!images.available(name)) return raw(`<div class="pic pic-fallback pic-${esc(kind)} ${esc(className)}" aria-hidden="true">${scene(kind)}</div>`);
  const webp = images.sources(name, 'webp');
  const jpg = images.sources(name, 'jpg');
  const dim = images.size(name);
  const list = jpg.length ? jpg : webp;
  const main = list.find((s) => s.w === 1200) || list[list.length - 1];
  const srcset = (l) => l.map((s) => `${s.url} ${s.w}w`).join(', ');
  const h = Math.round(dim.height * main.w / dim.width);
  return html`<picture class="pic ${raw(esc(className))}">${webp.length ? html`<source type="image/webp" srcset="${srcset(webp)}" sizes="${sizes}">` : ''}<img src="${main.url}" srcset="${srcset(list)}" sizes="${sizes}" width="${main.w}" height="${h}" alt="${alt}" decoding="async"${priority ? raw(' fetchpriority="high"') : raw(' loading="lazy"')}></picture>`;
}

// Preload for the one photograph above the fold.
function preloadImage(name, sizes = '100vw') {
  if (!images.available(name)) return '';
  const webp = images.sources(name, 'webp');
  if (!webp.length) return '';
  return html`<link rel="preload" as="image" imagesrcset="${webp.map((s) => `${s.url} ${s.w}w`).join(', ')}" imagesizes="${sizes}">`;
}

function structuredData(base) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'TaxiService',
    name: FIRM.name,
    provider: {
      '@type': 'LocalBusiness',
      name: FIRM.name,
      telephone: FIRM.phone,
      url: base + '/',
      address: { '@type': 'PostalAddress', addressLocality: FIRM.town, addressRegion: FIRM.county, postalCode: FIRM.postcodeDistrict, addressCountry: 'GB' },
      geo: { '@type': 'GeoCoordinates', latitude: FIRM.geo.lat, longitude: FIRM.geo.lng },
      openingHours: 'Mo-Su 00:00-23:59',
      foundingDate: String(FIRM.founded),
      paymentAccepted: 'Cash, Credit Card, Debit Card, Invoice',
      priceRange: '££'
    },
    areaServed: FIRM.area.map((a) => ({ '@type': 'City', name: a })),
    url: base + '/'
  };
  // A data block, not a script: escaped so no field can close the tag.
  return raw(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
}

function layout({ path, title, description, body, base, assets, bookPage = false, barPrice = '', extraScripts = [], hero = null }) {
  const navItems = NAV.map(([href, label]) => html`<li><a href="${href}"${path === href ? raw(' aria-current="page"') : ''}>${label}</a></li>`);
  const scripts = ['app.js', ...extraScripts].map((s) => html`<script src="${assets(s)}" defer></script>`);
  return '<!doctype html>' + html`
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${base + path}">
<meta name="theme-color" content="#F3EDE3">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${base + path}">
<link rel="icon" href="${assets('favicon.svg')}" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/instrument-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets('site.css')}">
${hero ? preloadImage(hero) : ''}
${structuredData(base)}
</head>
<body class="${bookPage ? 'is-book' : ''}">
<a class="skip" href="#main">Skip to content</a>
<div class="ribbon" role="note">
  <p><span class="ribbon-dot" aria-hidden="true"></span><strong>Demonstration site.</strong> <span class="ribbon-long">${FIRM.name} is not a real firm, bookings go to a test system and no car will come.</span><span class="ribbon-short">Not a real firm. No car will come.</span> <a href="${FIRM.arringtonUrl}">Built by Arrington Consultancy</a></p>
</div>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="${FIRM.name}, home">${LOGO}</a>
    <nav class="nav" aria-label="Main">
      <ul>${navItems}</ul>
    </nav>
    <div class="header-actions">
      <a class="header-phone" href="${FIRM.phoneHref}" aria-label="Call ${FIRM.phone}, 24 hours">${icon('phone')}<span class="header-phone-text"><small>24 hours</small>${FIRM.phone}</span></a>
      <a class="btn btn-primary header-book" href="/book">Book online</a>
      <details class="menu">
        <summary aria-label="Menu"><span class="menu-open">${icon('menu')}</span><span class="menu-close">${icon('close')}</span></summary>
        <div class="menu-panel">
          <ul>${navItems}</ul>
          <a class="btn btn-primary btn-block" href="${FIRM.phoneHref}">${icon('phone')} Call ${FIRM.phone}</a>
        </div>
      </details>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-top">
      <div>
        <p class="footer-brand"><a class="brand" href="/" aria-label="${FIRM.name}, home">${LOGO}</a></p>
        <p class="footer-tag">${FIRM.town}'s taxi firm since ${FIRM.founded}. ${FIRM.fleet} cars, ${FIRM.wheelchairCars} of them wheelchair accessible, and a control room that never shuts.</p>
      </div>
      <div class="footer-call">
        <a class="footer-phone" href="${FIRM.phoneHref}">${icon('phone')} ${FIRM.phone}</a>
        <p>Any hour, any day. Text <a href="sms:+447700900418">${FIRM.textNumber}</a>.</p>
      </div>
    </div>
    <div class="footer-grid">
      <div>
        <h2 class="footer-h">Book</h2>
        <ul class="footer-links">
          <li><a href="/book">Book online</a></li>
          <li><a href="/airports">Airport and long distance prices</a></li>
          <li><a href="/accounts">Business accounts</a></li>
          <li><a href="/about#app">The ${FIRM.shortName} app</a></li>
        </ul>
      </div>
      <div>
        <h2 class="footer-h">${FIRM.name}</h2>
        <ul class="footer-links">
          <li><a href="/about">About us</a></li>
          <li><a href="/about#drive">Drive with us</a></li>
          <li><a href="/contact">Contact and lost property</a></li>
        </ul>
      </div>
      <div>
        <h2 class="footer-h">Where we go</h2>
        <p class="footer-areas">${FIRM.area.join(', ')} and anywhere in the UK by arrangement.</p>
        <p class="footer-small">${FIRM.name}, ${FIRM.town}, ${FIRM.county} ${FIRM.postcodeDistrict}. Licensed private hire and hackney carriage operator.</p>
      </div>
    </div>
    <div class="footer-demo">
      <p>${DEMO_NOTE} Anything typed into this site is kept in memory for two hours and then deleted. No tracking, no cookies. <a href="${FIRM.arringtonUrl}">Built by Arrington Consultancy</a>.</p>
    </div>
  </div>
</footer>
<div class="action-bar">
  <a class="btn btn-ghost" href="${FIRM.phoneHref}">${icon('phone')} Call</a>
  ${bookPage
    ? html`<button class="btn btn-primary" type="submit" form="book-form">Book this taxi <span class="bar-price" data-quote-mirror>${barPrice}</span></button>`
    : html`<a class="btn btn-primary" href="/book">Book online</a>`}
</div>
${scripts}
</body>
</html>`.s;
}

module.exports = { esc, html, raw, icon, carIcon, picture, scene, layout, LOGO, MARK, NAV, yearsRunning };
