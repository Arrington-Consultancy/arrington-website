'use strict';

// HTML helpers and the shared page frame: the demo ribbon, header, footer,
// mobile action bar and the head tags every page needs (title, description,
// canonical, robots, structured data). Pages are plain template strings with
// every dynamic value passed through esc().
//
// The design (second redesign, 15/10/2026): one typeface, Schibsted Grotesk,
// with lining figures everywhere and tabular figures wherever a price, a
// time or a reference is read; the night field as a dispatch board; the Exe
// estuary map from lib/map.js as the one picture that could belong to no
// other firm. Photograph slots render the photograph when its files exist
// and otherwise a plain field, type, the map, or nothing at all. Never a
// painted scene.

const { FIRM, DEMO_NOTE, yearsRunning } = require('./firm');
const images = require('./images');
const { link, base: basePath } = require('./base');

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

// The mark: a rounded red tile, the tide line and the sun over it.
const MARK = raw('<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="8" class="mark-bg"/><path d="M4.5 20.5c3-3.4 5.3-3.4 8.3 0s5.3 3.4 8.3 0 5.3-3.4 8.3 0" class="mark-line"/><circle cx="16" cy="11" r="3.1" class="mark-sun"/></svg>');
const LOGO = html`${MARK}<span class="brand-name">${FIRM.shortName}<span class="brand-sub"> Cars</span></span>`;

const NAV = [
  ['/book', 'Book online'],
  ['/airports', 'Airports'],
  ['/accounts', 'Business accounts'],
  ['/about', 'About'],
  ['/contact', 'Contact']
];

// ---- Photograph slots ----------------------------------------------------------
// A slot renders a <picture> with WebP and JPEG at every width when the
// sized files exist (see VISUALS.md). When they do not, it renders whatever
// fallback the page supplies, which is a colour field, a line of type or the
// estuary map, and nothing at all when the layout stands up without the
// image. The real photograph replaces it by file name, with no code change.

const hasImage = (name) => images.available(name);

function picture({ name, alt = '', className = '', sizes = '100vw', priority = false, fallback = null }) {
  if (!images.available(name)) {
    if (fallback == null) return raw('');
    const inner = fallback instanceof Raw ? fallback.s : esc(fallback);
    return raw(`<div class="pic pic-fallback ${esc(className)}" aria-hidden="true">${inner}</div>`);
  }
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

// A flat field with a few words set large: what a slot shows when the
// photograph is not there yet and the layout wants something in that space.
function typeField({ big, text, tone = 'red' }) {
  return raw(`<div class="type-field type-field-${esc(tone)}"><span class="type-field-big">${esc(big)}</span><span class="type-field-text">${esc(text)}</span></div>`);
}

function structuredData(base) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'TaxiService',
    name: FIRM.name,
    description: `Hackney carriage taxis and private hire cars in ${FIRM.town}, ${FIRM.county}, run from one control room 24 hours a day. ${FIRM.fleet} cars, ${FIRM.wheelchairCars} of them wheelchair accessible.`,
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

function layout({ path, title, description, body, base, assets, bookPage = false, homePage = false, barPrice = '', extraScripts = [], hero = null, bodyClass = '' }) {
  const navItems = NAV.map(([href, label]) => html`<li><a href="${link(href)}"${path === href ? raw(' aria-current="page"') : ''}>${label}</a></li>`);
  const scripts = ['app.js', ...extraScripts].map((s) => html`<script src="${assets(s)}" defer></script>`);
  const classes = [bookPage ? 'is-book' : '', homePage ? 'is-home' : '', bodyClass].filter(Boolean).join(' ');
  return '<!doctype html>' + html`
<html lang="en-GB" data-base="${basePath()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${base + path}">
<meta name="theme-color" content="#0B1623">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${base + path}">
<link rel="icon" href="${assets('favicon.svg')}" type="image/svg+xml">
<link rel="preload" href="${link('/assets/fonts/schibsted-grotesk.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets('site.css')}">
${hero ? preloadImage(hero) : ''}
${structuredData(base)}
</head>
<body class="${classes}">
<a class="skip" href="#main">Skip to content</a>
<div class="ribbon" role="note">
  <p><span class="ribbon-text"><span class="ribbon-dot" aria-hidden="true"></span><strong><span class="ribbon-long">Demonstration site.</span><span class="ribbon-short">Demo site.</span></strong> <span class="ribbon-long">${FIRM.name} is not a real firm, bookings go to a test system and no car will come.</span><span class="ribbon-short">No car will come.</span></span> <a class="ribbon-cta" href="${FIRM.arringtonEnquiryUrl}"><span class="ribbon-long">Want a site like this? Talk to Arrington</span><span class="ribbon-short">Want one? Talk to Arrington</span></a></p>
</div>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${link('/')}" aria-label="${FIRM.name}, home">${LOGO}</a>
    <nav class="nav" aria-label="Main">
      <ul>${navItems}</ul>
    </nav>
    <div class="header-actions">
      <a class="header-phone" href="${FIRM.phoneHref}" aria-label="Call ${FIRM.phone}, 24 hours">${icon('phone')}<span class="header-phone-text"><small>24 hours</small>${FIRM.phone}</span></a>
      <a class="btn btn-primary header-book" href="${link('/book')}">Book online</a>
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
        <p class="footer-brand"><a class="brand" href="${link('/')}" aria-label="${FIRM.name}, home">${LOGO}</a></p>
        <p class="footer-tag">Taxis and private hire in ${FIRM.town} since ${FIRM.founded}. ${FIRM.fleet} cars, ${FIRM.wheelchairCars} of them wheelchair accessible, and a control room that never shuts.</p>
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
          <li><a href="${link('/book')}">Book online</a></li>
          <li><a href="${link('/airports')}">Airport and long distance prices</a></li>
          <li><a href="${link('/accounts')}">Business accounts</a></li>
          <li><a href="${link('/about#app')}">The ${FIRM.shortName} app</a></li>
        </ul>
      </div>
      <div>
        <h2 class="footer-h">${FIRM.name}</h2>
        <ul class="footer-links">
          <li><a href="${link('/about')}">About us</a></li>
          <li><a href="${link('/about#drive')}">Drive with us</a></li>
          <li><a href="${link('/contact')}">Contact and lost property</a></li>
        </ul>
      </div>
      <div>
        <h2 class="footer-h">Where we go</h2>
        <p class="footer-areas">${FIRM.area.join(', ')} and anywhere in the UK by arrangement.</p>
        <p class="footer-small">${FIRM.name}, ${FIRM.town}, ${FIRM.county} ${FIRM.postcodeDistrict}. Licensed private hire and hackney carriage operator.</p>
      </div>
    </div>
    <div class="footer-demo">
      <p>${DEMO_NOTE} Pictures on this site are AI-generated illustrations, not photographs of a real fleet. Anything typed into this site is kept in memory for two hours and then deleted. No tracking, no cookies. <a href="${FIRM.arringtonUrl}">Built by Arrington Consultancy</a>.</p>
    </div>
  </div>
</footer>
<div class="action-bar" data-action-bar${homePage ? raw(' data-hide-near="form.quote"') : ''}>
  <a class="btn btn-ghost" href="${FIRM.phoneHref}">${icon('phone')} Call</a>
  ${bookPage
    ? html`<button class="btn btn-primary" type="submit" form="book-form">Book this taxi <span class="bar-price" data-quote-mirror>${barPrice}</span></button>`
    : html`<a class="btn btn-primary" href="${link('/book')}">Book online</a>`}
</div>
${scripts}
</body>
</html>`.s;
}

module.exports = { esc, html, raw, icon, carIcon, picture, hasImage, typeField, layout, LOGO, MARK, NAV, yearsRunning };
