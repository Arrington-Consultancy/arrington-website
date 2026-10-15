'use strict';

// HTML helpers and the shared page frame: the demo ribbon, header, footer,
// mobile action bar and the head tags every page needs (title, description,
// canonical, robots, structured data). Pages are plain template strings with
// every dynamic value passed through esc().

const { FIRM, DEMO_NOTE, yearsRunning } = require('./firm');

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
  message: '<path d="M4 5.5h16v10H9l-5 4z"/>',
  car: '<path d="M4.5 16.5v-4l2-5h11l2 5v4z"/><path d="M4.5 12.5h15M7 16.5v2M17 16.5v2"/><circle cx="8" cy="14.3" r=".6"/><circle cx="16" cy="14.3" r=".6"/>'
};
const icon = (name, cls = 'icon') => raw(`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`);

// The wordmark: a taxi roof sign with the name on it.
const LOGO = raw(`<svg class="logo-mark" viewBox="0 0 168 40" role="img" aria-label="${FIRM.name}">
<rect x="1" y="6" width="104" height="28" rx="6" fill="#FFB81C"/>
<rect x="1" y="30" width="104" height="5" rx="1.5" fill="#E09A00"/>
<text x="53" y="27" text-anchor="middle" font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="700" font-size="22" letter-spacing="1.5" fill="#0D2B36">TIDEWELL</text>
<text x="114" y="28" font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="600" font-size="23" letter-spacing=".5" fill="currentColor">CARS</text>
</svg>`);

const NAV = [
  ['/book', 'Book online'],
  ['/airports', 'Airports'],
  ['/accounts', 'Business accounts'],
  ['/about', 'About'],
  ['/contact', 'Contact']
];

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

function layout({ path, title, description, body, base, assets, bookPage = false, extraScripts = [] }) {
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
<meta name="theme-color" content="#0D2B36">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${base + path}">
<link rel="icon" href="${assets('favicon.svg')}" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/barlow-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/barlow-condensed-700.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets('site.css')}">
${structuredData(base)}
</head>
<body class="${bookPage ? 'is-book' : ''}">
<a class="skip" href="#main">Skip to content</a>
<div class="ribbon" role="note">
  <p><strong>Demonstration site.</strong> <span class="ribbon-long">${FIRM.name} is not a real firm, bookings go to a test system and no car will come.</span><span class="ribbon-short">Not a real firm. No car will come.</span> <a href="${FIRM.arringtonUrl}">Built by Arrington Consultancy</a></p>
</div>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="${FIRM.name}, home">${LOGO}</a>
    <nav class="nav" aria-label="Main">
      <ul>${navItems}</ul>
    </nav>
    <a class="header-phone" href="${FIRM.phoneHref}" aria-label="Call ${FIRM.phone}, 24 hours">${icon('phone')}<span><span class="header-phone-label">24 hours</span> ${FIRM.phone}</span></a>
    <details class="menu">
      <summary aria-label="Menu">${icon('menu')}</summary>
      <div class="menu-panel">
        <ul>${navItems}</ul>
        <a class="btn btn-signal btn-block" href="${FIRM.phoneHref}">${icon('phone')} Call ${FIRM.phone}</a>
      </div>
    </details>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <p class="footer-brand">${LOGO}</p>
      <p>${FIRM.name}, ${FIRM.town}, ${FIRM.county} ${FIRM.postcodeDistrict}<br>
      <a href="${FIRM.phoneHref}">${FIRM.phone}</a>, 24 hours<br>
      Text <a href="sms:+447700900418">${FIRM.textNumber}</a></p>
      <p class="footer-small">Licensed private hire and hackney carriage operator. Running since ${FIRM.founded}.</p>
    </div>
    <div>
      <h2 class="footer-h">Book</h2>
      <ul class="footer-links">
        <li><a href="/book">Book online</a></li>
        <li><a href="/airports">Airport and long distance prices</a></li>
        <li><a href="/accounts">Business accounts</a></li>
        <li><a href="/about#app">Our app</a></li>
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
  </div>
  <div class="wrap footer-demo">
    <p>${DEMO_NOTE} Anything typed into this site is kept in memory for two hours and then deleted. No tracking, no cookies. <a href="${FIRM.arringtonUrl}">Built by Arrington Consultancy</a>.</p>
  </div>
</footer>
<div class="action-bar">
  <a class="btn btn-ghost" href="${FIRM.phoneHref}">${icon('phone')} Call</a>
  ${bookPage ? raw('') : html`<a class="btn btn-signal" href="/book">Book online</a>`}
</div>
${scripts}
</body>
</html>`.s;
}

module.exports = { esc, html, raw, icon, layout, LOGO, NAV, yearsRunning };
