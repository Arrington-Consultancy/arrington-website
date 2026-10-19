'use strict';

// Page bodies. Copy rules (taxi demo brief, 15/10/2026): plain English,
// short sentences, prices and facts stated straight; no "solutions",
// "seamless" or "cutting-edge", no exclamation marks. Plus the Arrington
// site's own: UK English and no dashes as punctuation. Every page opens with
// its own headline that says what the page is for.
//
// The firm runs both kinds of licensed car from one control room (Tom's
// decision, 15/10/2026): hackney carriage taxis, which carry roof lights,
// wait on the ranks and can be hailed, and private hire cars, which are
// booked in advance. The pictures show the taxis; no copy beside a
// pictured car calls it private hire, and no real council is named.

const { FIRM, DEMO_NOTE, yearsRunning } = require('./firm');
const { html, raw, icon, carIcon, picture, hasImage, typeField, esc } = require('./html');
const { VEHICLES, FIXED, money, describe, estimate } = require('./fares');
const { PAYMENT, maskPhone, firstName } = require('./booking');
const { PLACES } = require('./places');
const { exeMap } = require('./map');
const { link } = require('./base');
const images = require('./images');

const COVER = ['Exmouth', 'Lympstone', 'Budleigh Salterton', 'Woodbury', 'Exton', 'Topsham', 'Exeter', 'Sidmouth'];
// The four fixed prices on the home page board.
const BOARD = ['exeter-airport', 'exeter-st-davids', 'bristol-airport', 'heathrow'];

// What is actually in each picture. The pictures are AI-generated
// illustrations (the footer says so on every page); the alt text describes
// the scene and never claims a real car, driver or journey.
const ALT = {
  'hero-exmouth': 'A white saloon with a taxi roof light driving along the seafront road at Exmouth at sunset, the beach and the red cliffs of Orcombe Point beyond',
  'airport-night': 'A silver estate car with a taxi roof light at an airport drop-off at night, its boot open while a man lifts out a suitcase, the terminal lit behind',
  accounts: 'A grey saloon with a taxi roof light waiting with its rear door open outside a white seaside hotel, a woman with a wheeled suitcase walking towards it',
  wav: 'A white wheelchair accessible taxi with its rear ramp lowered to the pavement on a residential street, a wheelchair user at the foot of the ramp with a helper\'s hand on the chair, the sea beyond',
  'fleet-dawn': 'Four white and silver taxis with roof lights parked in a row along a promenade at sunrise, pastel beach huts and the sea behind',
  driver: 'Hands on the steering wheel of a right hand drive car on a coast road along the estuary at sunset, boats moored on the water',
  'estuary-sand': '',
  'huts-evening': 'A row of pastel beach huts along the promenade at Exmouth at dusk, the beach and the red cliffs beyond'
};

// ---- The fare -----------------------------------------------------------------
// One block, the same everywhere a price is shown: a small label, the figure
// in tabular numerals, one line of context. Server-rendered here, and app.js
// rebuilds it in the same shape as the addresses change.

function fareBlock({ est = null, hint = '', forForm = null } = {}) {
  const attrs = raw(`data-quote-out aria-live="polite"${forForm ? ` data-quote-for="${esc(forForm)}"` : ''}`);
  if (!est || est.kind === 'unpriced') return html`<div class="fare" ${attrs}><p class="fare-hint">${hint}</p></div>`;
  const label = est.kind === 'fixed' ? 'Fixed price' : 'Estimated fare';
  const sub = est.kind === 'fixed' ? est.label.replace(/^Fixed price, /, '') : `${est.label}. The meter decides the final fare.`;
  return html`<div class="fare is-priced" ${attrs}><span class="fare-label">${label}</span><strong class="fare-figure">${describe(est)}</strong><span class="fare-sub">${sub}</span></div>`;
}

// A page opening: the headline over the page's photograph when it exists,
// otherwise on sand or on the night field, with room for something beside it
// (the stats on the about page).
function pageTop({ eyebrow, title, lede, tone = 'sand', extra = '', className = '', image = null }) {
  const photo = image && hasImage(image);
  return html`
<section class="page-top ${photo ? 'page-top-photo' : `page-top-${tone}`} ${className}">
  ${photo ? html`${picture({ name: image, className: 'page-top-media', alt: ALT[image], sizes: '100vw', priority: true })}<div class="page-top-shade" aria-hidden="true"></div>` : ''}
  <div class="wrap page-top-inner">
    <div class="page-top-copy">
      ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}
      <h1>${title}</h1>
      ${lede ? html`<p class="lede">${lede}</p>` : ''}
    </div>
    ${extra}
  </div>
</section>`;
}

// A wide photograph under a page opening, only once the file exists.
function photoBand(name) {
  if (!hasImage(name)) return '';
  return html`<div class="photo-band">${picture({ name, alt: ALT[name], className: 'photo-band-pic', sizes: '100vw', priority: true })}</div>`;
}

// ---- Home ---------------------------------------------------------------------

function quickQuote() {
  return html`<form class="quote" action="${link('/book')}" method="get" data-quote aria-labelledby="quote-h">
  <h2 class="quote-h" id="quote-h">Where to?</h2>
  <div class="field">
    <label for="q-from">From</label>
    <input id="q-from" name="pickup" autocomplete="off" placeholder="Pickup address or place" data-places required>
  </div>
  <div class="field">
    <label for="q-to">To</label>
    <input id="q-to" name="destination" autocomplete="off" placeholder="Where you're going" data-places required>
  </div>
  ${fareBlock({ hint: 'Type both ends and the price appears here.' })}
  <button class="btn btn-primary btn-block btn-lg" type="submit"><span data-quote-cta>See the price</span>${icon('arrow')}</button>
  <p class="quote-note">Booking for later? Choose the time on the next page.</p>
</form>`;
}

function priceBoard() {
  const rows = BOARD.map((id) => FIXED.find((f) => f.id === id));
  return html`<div class="board" aria-labelledby="board-h">
  <p class="board-h" id="board-h">Fixed prices<span>day or night</span></p>
  <ul class="board-rows">${rows.map((f) => html`<li><span class="board-to">${f.name}<small>About ${f.miles} miles</small></span><span class="board-price">${money(f.price * 100)}</span></li>`)}</ul>
  <p class="board-foot">One way from ${FIRM.town}, up to four passengers.<a href="${link('/airports')}">All fixed prices ${icon('arrow')}</a></p>
</div>`;
}

function home() {
  const facts = ['Licensed taxis and private hire', `${yearsRunning()} years in ${FIRM.town}`, 'Open every hour of the year', `${FIRM.wheelchairCars} wheelchair accessible cars`, 'Card, cash or account'];
  const heroPhoto = hasImage('hero-exmouth');
  return html`
<section class="hero${heroPhoto ? ' has-photo' : ''}">
  ${picture({ name: 'hero-exmouth', className: 'hero-media', alt: ALT['hero-exmouth'], sizes: '100vw', priority: true, fallback: raw(`<div class="on-night-map">${exeMap({ id: 'hero-map', decorative: true })}</div>`) })}
  <div class="hero-shade" aria-hidden="true"></div>
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">${FIRM.town}, ${FIRM.county}</p>
      <h1>Taxis in ${FIRM.town}, with the price before you book.</h1>
      <p class="lede">Taxis on the ranks and private hire cars to book, ${FIRM.fleet} in all, from one control room that never shuts. Book online, in the app, or call <a href="${FIRM.phoneHref}">${FIRM.phone}</a>.</p>
    </div>
    ${quickQuote()}
  </div>
</section>
<section class="board-strip">
  <div class="wrap">${priceBoard()}</div>
</section>
<section class="facts-band">
  <div class="wrap">
    <ul class="facts">${facts.map((f) => html`<li>${f}</li>`)}</ul>
  </div>
</section>
<section class="section">
  <div class="wrap split split-reverse">
    <div class="split-copy reveal">
      <p class="eyebrow">Airports and long distance</p>
      <h2>Fixed prices, day or night.</h2>
      <p>Exeter Airport ${money(2800)}, Bristol Airport ${money(15000)}, Heathrow ${money(29500)}, from anywhere in ${FIRM.town}, Lympstone, Budleigh Salterton, Woodbury or Exton. The same price at four in the morning as at four in the afternoon.</p>
      <p>Put your flight number in the notes. We check the landing time, and the first 45 minutes of waiting after landing are included.</p>
      <p><a class="link-arrow" href="${link('/airports')}">All fixed prices ${icon('arrow')}</a></p>
    </div>
    <div class="split-media reveal">${picture({ name: 'airport-night', className: 'pic-43', alt: ALT['airport-night'], sizes: '(min-width: 56rem) 50vw, 100vw', fallback: typeField({ big: money(2800), text: 'to Exeter Airport, the same price day or night', tone: 'night' }) })}</div>
  </div>
</section>
<section class="section band-night" id="ways">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="eyebrow">Three ways to book</p>
      <h2>Online, by phone, or in the app.</h2>
    </div>
    <div class="ways">
      <article class="way reveal">
        <span class="way-n" aria-hidden="true">01</span>
        <h3>Online</h3>
        <p>See the price first. Your booking goes straight to our controllers and we text you the driver's name, car and arrival time.</p>
        <a class="btn btn-primary" href="${link('/book')}">Book online</a>
      </article>
      <article class="way reveal">
        <span class="way-n" aria-hidden="true">02</span>
        <h3>By phone</h3>
        <p>Answered in ${FIRM.town}, 24 hours a day. Tell us where you are and where you're going.</p>
        <a class="btn btn-ghost" href="${FIRM.phoneHref}">${icon('phone')} ${FIRM.phone}</a>
      </article>
      <article class="way reveal" id="app">
        <span class="way-n" aria-hidden="true">03</span>
        <h3>In the app</h3>
        <p>Book in two taps, watch your car arrive on the map and pay by card in the app.</p>
        <div class="stores">
          <a class="store" href="${link('/about#app')}"><small>Download on the</small>App Store</a>
          <a class="store" href="${link('/about#app')}"><small>Get it on</small>Google Play</a>
        </div>
        <p class="stores-note">In this demo, these buttons show how the app works.</p>
      </article>
    </div>
  </div>
</section>
<section class="section band-paper">
  <div class="wrap split">
    <div class="split-copy reveal">
      <p class="eyebrow">Business accounts</p>
      <h2>One invoice a month.</h2>
      <p>Hotels, schools, NHS and care services and local businesses book on account. Your guests, pupils, patients and staff travel without paying the driver, and you get one statement with every journey on it.</p>
      <ul class="plain-list">
        <li>Hotels and guest houses</li>
        <li>Schools and colleges</li>
        <li>NHS and care</li>
        <li>Local businesses</li>
      </ul>
      <p><a class="btn btn-dark" href="${link('/accounts')}">Open an account</a></p>
    </div>
    <div class="split-media reveal">${picture({ name: 'accounts', className: 'pic-43', alt: ALT.accounts, sizes: '(min-width: 56rem) 50vw, 100vw', fallback: typeField({ big: '1', text: 'invoice a month, with every journey on it', tone: 'night' }) })}</div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="eyebrow">What customers say</p>
      <h2>The price it said, the car on time.</h2>
      <p class="demo-tag">Example reviews. A live site shows the firm's real Google reviews here.</p>
    </div>
    <div class="reviews">
      ${[
        ['Booked online at 5am for the airport. The price was what it said and the driver was outside early.', 'Example review'],
        ['We use them for every guest who arrives by train. One invoice at the end of the month, no chasing.', 'Example review'],
        ['The wheelchair car was booked for my mum\'s hospital appointment and the driver waited for her.', 'Example review']
      ].map(([q, who]) => html`<figure class="review reveal"><blockquote><p>${q}</p></blockquote><figcaption><span class="stars" role="img" aria-label="5 out of 5">${icon('star')}${icon('star')}${icon('star')}${icon('star')}${icon('star')}</span>${who}</figcaption></figure>`)}
    </div>
  </div>
</section>
<section class="where${hasImage('estuary-sand') ? ' has-band' : ''}">
  ${picture({ name: 'estuary-sand', className: 'where-band', alt: '', sizes: '100vw' })}
  <div class="wrap where-grid">
    <div class="where-copy reveal">
      <p class="eyebrow">Where we go</p>
      <h2>Most of our work is within a few miles of the Strand.</h2>
      <p>${FIRM.town}, the villages along the estuary, Budleigh and Sidmouth along the coast. We go further every day: Exeter, the airports, the stations and anywhere in the UK by arrangement.</p>
      <ul class="chips">${COVER.map((t) => html`<li>${t}</li>`)}</ul>
    </div>
    <div class="where-map reveal">${raw(exeMap({ id: 'where-map' }))}</div>
  </div>
</section>`;
}

// ---- Booking form -----------------------------------------------------------

function fieldError(errors, name) {
  return errors && errors[name] ? html`<p class="error" id="${name}-error">${errors[name]}</p>` : '';
}
function invalid(errors, name) {
  return errors && errors[name] ? raw(` aria-invalid="true" aria-describedby="${name}-error"`) : '';
}

// The price for the mobile action bar on the booking page.
function bookBarPrice(values = {}) {
  const est = estimate({ pickup: values.pickup, destination: values.destination, vehicle: values.vehicle || 'saloon' });
  return est.kind === 'unpriced' ? '' : describe(est);
}

function bookPage({ values = {}, errors = null } = {}) {
  const v = { passengers: 1, luggage: 0, vehicle: 'saloon', payment: 'card', when: 'now', ...values };
  const est = estimate({ pickup: v.pickup, destination: v.destination, vehicle: v.vehicle });
  const hint = v.pickup && v.destination ? est.message : 'Enter both addresses and the price appears here.';
  const opts = (from, to, sel) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => html`<option value="${n}"${Number(sel) === n ? raw(' selected') : ''}>${n}</option>`);
  const errorList = errors ? Object.values(errors) : [];
  return html`
${pageTop({ eyebrow: 'Book online', title: 'Book a taxi.', lede: 'The price before you confirm. Your booking goes straight to our controllers, and we text you the driver\'s details.', className: 'page-top-book' })}
<section class="section section-tight">
  <div class="wrap book-grid">
    <div class="book-side">
      <div class="card fare-panel">
        <h2 class="fare-panel-h">Your fare</h2>
        ${fareBlock({ est, hint, forForm: 'book-form' })}
      </div>
      <div class="card aside-card" aria-label="How booking works">
        <h2>What happens next</h2>
        <ol class="track">
          <li><strong>Your booking reaches our dispatch system</strong> and you get a reference straight away.</li>
          <li><strong>A controller confirms it.</strong></li>
          <li><strong>We text you the driver's name, car and registration,</strong> and how many minutes away they are.</li>
        </ol>
        <p class="aside-phone">Rather talk to someone? <a href="${FIRM.phoneHref}">${FIRM.phone}</a>, 24 hours.</p>
      </div>
    </div>
    <form id="book-form" class="book-form" action="${link('/book')}" method="post" novalidate data-quote data-book>
      ${errorList.length ? html`<div class="error-summary" role="alert" tabindex="-1"><h2>Check ${errorList.length === 1 ? 'this' : 'these'} and try again</h2><ul>${errorList.map((e) => html`<li>${e}</li>`)}</ul></div>` : ''}
      <fieldset class="group">
        <legend><span class="group-n" aria-hidden="true">1</span>Where</legend>
        <div class="field">
          <label for="pickup">Pickup</label>
          <input id="pickup" name="pickup" value="${v.pickup || ''}" autocomplete="off" placeholder="Address, place or postcode" data-places required${invalid(errors, 'pickup')}>
          ${fieldError(errors, 'pickup')}
        </div>
        <div class="field">
          <label for="destination">Destination</label>
          <input id="destination" name="destination" value="${v.destination || ''}" autocomplete="off" placeholder="Address, place or postcode" data-places required${invalid(errors, 'destination')}>
          ${fieldError(errors, 'destination')}
        </div>
      </fieldset>

      <fieldset class="group when">
        <legend><span class="group-n" aria-hidden="true">2</span>When</legend>
        <div class="seg" role="radiogroup" aria-label="When">
          <input type="radio" id="when-now" name="when" value="now"${v.when !== 'later' ? raw(' checked') : ''}><label for="when-now">As soon as possible</label>
          <input type="radio" id="when-later" name="when" value="later"${v.when === 'later' ? raw(' checked') : ''}><label for="when-later">Later</label>
        </div>
        <div class="later-fields">
          <div class="field"><label for="date">Date</label><input type="date" id="date" name="date" value="${v.date || ''}"${invalid(errors, 'date')}></div>
          <div class="field"><label for="time">Time</label><input type="time" id="time" name="time" value="${v.time || ''}" step="300"></div>
        </div>
        ${fieldError(errors, 'date')}
      </fieldset>

      <fieldset class="group">
        <legend><span class="group-n" aria-hidden="true">3</span>Who's travelling</legend>
        <div class="row-2">
          <div class="field"><label for="passengers">Passengers</label><select id="passengers" name="passengers">${opts(1, 8, v.passengers)}</select>${fieldError(errors, 'passengers')}</div>
          <div class="field"><label for="luggage">Large bags</label><select id="luggage" name="luggage">${opts(0, 8, v.luggage)}</select>${fieldError(errors, 'luggage')}</div>
        </div>
        <div class="vehicles" role="radiogroup" aria-labelledby="vehicle-label"${invalid(errors, 'vehicle')}>
          <span class="label" id="vehicle-label">Car</span>
          ${VEHICLES.map((x) => html`<input type="radio" id="v-${x.id}" name="vehicle" value="${x.id}"${v.vehicle === x.id ? raw(' checked') : ''}><label for="v-${x.id}" class="vehicle">${carIcon(x.id)}<strong>${x.label}</strong><span>${x.note}</span></label>`)}
        </div>
        ${fieldError(errors, 'vehicle')}
      </fieldset>

      <fieldset class="group">
        <legend><span class="group-n" aria-hidden="true">4</span>Your details</legend>
        <div class="field"><label for="name">Name</label><input id="name" name="name" value="${v.name || ''}" autocomplete="name" required${invalid(errors, 'name')}>${fieldError(errors, 'name')}</div>
        <div class="field"><label for="phone">Mobile number</label><input id="phone" name="phone" type="tel" value="${v.phoneRaw || ''}" autocomplete="tel" inputmode="tel" required${invalid(errors, 'phone')}><p class="hint">We text your driver's details to this number.</p>${fieldError(errors, 'phone')}</div>
        <div class="field"><label for="email">Email <span class="optional">(optional, for a receipt)</span></label><input id="email" name="email" type="email" value="${v.email || ''}" autocomplete="email"${invalid(errors, 'email')}>${fieldError(errors, 'email')}</div>
      </fieldset>

      <fieldset class="group">
        <legend><span class="group-n" aria-hidden="true">5</span>Payment</legend>
        <div class="seg seg-3" role="radiogroup" aria-label="Payment">
          ${PAYMENT.map((p) => html`<input type="radio" id="pay-${p.id}" name="payment" value="${p.id}"${v.payment === p.id ? raw(' checked') : ''}><label for="pay-${p.id}">${p.label}</label>`)}
        </div>
        <div class="field account-field"><label for="account">Account name</label><input id="account" name="account" value="${v.account || ''}"${invalid(errors, 'account')}>${fieldError(errors, 'account')}</div>
      </fieldset>

      <div class="field field-notes"><label for="notes">Anything the driver should know <span class="optional">(optional)</span></label><textarea id="notes" name="notes" rows="3" maxlength="300" placeholder="Flight number, door code, child seat">${v.notes || ''}</textarea></div>

      <div class="hp" aria-hidden="true"><label for="website">Leave this empty</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>

      <div class="submit-row">
        <button class="btn btn-primary btn-block btn-lg" type="submit">Book this taxi</button>
        <p class="demo-note">${DEMO_NOTE}</p>
      </div>
    </form>
  </div>
</section>`;
}

// ---- Confirmation -----------------------------------------------------------

function statusSteps(view) {
  const s = view ? view.status : 'received';
  const order = ['received', 'confirmed', 'allocated'];
  const reached = s === 'cancelled' ? -1 : Math.max(0, order.indexOf(s));
  const time = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  const steps = [
    ['Received by our dispatch system', html`Reference <span class="ref-inline">${view ? view.ref : ''}</span>`],
    ['Confirmed by a controller', 'Your booking is with our controllers.'],
    view && view.status === 'allocated'
      ? ['Driver on the way', html`<span class="driver-card"><span class="driver-who"><strong>${view.driver.name}</strong>${view.driver.car}</span><span class="reg">${view.driver.reg}</span><span class="driver-eta"><strong class="driver-mins">${view.etaMinutes}</strong> minutes away, arriving around <span class="driver-time">${time(view.etaAt)}</span>.</span></span>`]
      : ['Driver on the way', view && view.status === 'confirmed' && view.asap === false ? 'We\'ll text you the driver\'s details before pickup.' : 'Allocating a car near you.']
  ];
  return html`<ol class="timeline" data-timeline>${steps.map(([t, d], i) => html`<li class="${i <= reached ? 'done' : i === reached + 1 ? 'next' : ''}"><span class="dot" aria-hidden="true"></span><div><strong>${t}</strong><p>${d}</p></div></li>`)}</ol>`;
}

// The way back to Arrington on the one page where the visitor has just seen
// the booking work (Tom's approval, 15/10/2026). Arrington's frame, in the
// ribbon's colours, with no logo and no phone number. "Dispatch allocated the
// car" is only said of a booking for now: a booking for later is confirmed
// and never allocated by the demo, and a cancelled one may not have been, so
// those say what is always true, that dispatch sent back the reference.
function arringtonPanel(allocates) {
  return html`<div class="arrington-panel" data-arrington>
        <p class="arrington-label">Built by Arrington Consultancy</p>
        <h2>Want this for your firm?</h2>
        <p>That booking went from this website straight into a dispatch system, and ${allocates ? 'dispatch allocated the car' : 'dispatch sent back its reference'}. We build websites that do the same for taxi and private hire firms for £999. Bookings go into your own dispatch system where it has a booking API, so nobody in the office has to key them in.</p>
        <a class="btn btn-primary" href="${FIRM.arringtonEnquiryUrl}">Tell us about your firm</a>
      </div>`;
}

function confirmationPage({ record, view }) {
  const b = record.booking;
  const cancelled = view && view.status === 'cancelled';
  const when = b.when === 'now' ? 'As soon as possible' : new Date(b.pickupAt).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const vehicle = VEHICLES.find((x) => x.id === b.vehicle);
  const pay = PAYMENT.find((p) => p.id === b.payment);
  return html`
<section class="page-top page-top-night page-top-confirm">
  <div class="wrap page-top-inner">
    <div class="page-top-copy">
      <p class="eyebrow">${cancelled ? 'Cancelled' : 'Booked'}</p>
      <h1>${cancelled ? 'Booking cancelled.' : `Thanks, ${firstName(b.name)}. Your taxi is booked.`}</h1>
    </div>
    <p class="ref"><span class="ref-label">Booking reference</span><strong data-ref>${record.ref}</strong></p>
  </div>
</section>
<section class="section section-tight">
  <div class="wrap confirm-grid">
    <div>
      <div class="card status-card" data-status data-token="${record.token}" data-state="${view ? view.status : 'received'}">
        <h2>Your booking</h2>
        <div aria-live="polite" data-status-body>${cancelled ? html`<p>This booking is cancelled. Nobody will come.</p>` : statusSteps({ ...view, asap: b.when === 'now' })}</div>
        <p class="noscript-hint" data-refresh-hint>Refresh this page to see the latest.</p>
      </div>
      ${record.sms ? html`<p class="sms-note">${icon('message')} We've texted your reference to ${maskPhone(b.phone)}.</p>` : ''}
      ${arringtonPanel(b.when === 'now' && !cancelled)}
      <div class="card demo-card">
        <h2>About this demo</h2>
        <p>This booking went from the form to a test dispatch system. On a live site it goes into the firm's own iCabbi, Autocab or Cordic system, once that is connected with API access from their provider. The reference came back from dispatch, and the driver details above are dispatch telling the site a car was allocated.</p>
        <p>The texts and emails are written to a test log instead of being sent. No car will come, and the booking is deleted after two hours.</p>
      </div>
    </div>
    <aside>
      <div class="card">
        <h2>Journey</h2>
        <dl class="summary">
          <dt>From</dt><dd>${b.pickup}</dd>
          <dt>To</dt><dd>${b.destination}</dd>
          <dt>When</dt><dd>${when}</dd>
          <dt>Car</dt><dd>${vehicle ? vehicle.label : b.vehicle}, ${b.passengers} ${b.passengers === 1 ? 'passenger' : 'passengers'}${b.luggage ? `, ${b.luggage} ${b.luggage === 1 ? 'bag' : 'bags'}` : ''}</dd>
          <dt>Price</dt><dd class="summary-price">${describe(b.quote)}</dd>
          <dt>Payment</dt><dd>${pay ? pay.label : b.payment}${b.account ? ` (${b.account})` : ''}</dd>
          ${b.notes ? html`<dt>Notes</dt><dd>${b.notes}</dd>` : ''}
        </dl>
        ${cancelled ? '' : html`<form action="${link(`/booking/${record.token}/cancel`)}" method="post" class="cancel-form"><button class="btn btn-outline btn-block" type="submit">Cancel this booking</button></form>`}
        <p class="center"><a href="${link('/book')}">Book another taxi</a></p>
      </div>
    </aside>
  </div>
</section>`;
}

// ---- Airports ---------------------------------------------------------------

function airportsPage() {
  const factor = (id) => VEHICLES.find((v) => v.id === id).factor;
  const round = (p) => Math.round(p);
  return html`
${pageTop({ eyebrow: 'Fixed prices', title: 'Fixed prices to the airports and the stations.', lede: `One way from ${FIRM.town}, Lympstone, Budleigh Salterton, Woodbury or Exton. The same price at four in the morning as at four in the afternoon.`, tone: 'night', image: 'airport-night' })}
<section class="section section-tight">
  <div class="wrap">
    <div class="table-wrap">
      <table class="prices">
        <caption>Up to four passengers in a car, with a 6-seater or 8-seater for more. Put your flight number in the notes when you book.</caption>
        <thead><tr><th scope="col">To</th><th scope="col">Car</th><th scope="col">6-seater</th><th scope="col">8-seater</th></tr></thead>
        <tbody>${FIXED.map((f) => html`<tr><th scope="row">${f.name}<span>About ${f.miles} miles</span></th><td>${money(f.price * 100)}</td><td>${money(round(f.price * factor('mpv6')) * 100)}</td><td>${money(round(f.price * factor('mpv8')) * 100)}</td></tr>`)}</tbody>
      </table>
    </div>
    <div class="notes-grid">
      <div class="reveal"><h2>Flights</h2><p>Put your flight number in the notes. We check the landing time, and the first 45 minutes of waiting after landing are included.</p></div>
      <div class="reveal"><h2>Returns</h2><p>Book each way as its own journey. The fixed price applies in both directions.</p></div>
      <div class="reveal"><h2>Wheelchair users</h2><p>Our wheelchair accessible cars cost the same as a car, on every journey.</p></div>
    </div>
    <p class="cta-row"><a class="btn btn-primary btn-lg" href="${link('/book')}">Book online</a> <a class="btn btn-dark btn-lg" href="${FIRM.phoneHref}">${icon('phone')} ${FIRM.phone}</a></p>
  </div>
</section>`;
}

// ---- Enquiry forms (accounts, drivers, contact) ------------------------------

function enquiryForm({ action, kind, fields, submit, sent, errors, values = {} }) {
  if (sent) {
    return html`<div class="card sent" role="status"><h2>Thanks, we've got that.</h2><p>Someone from the office will be in touch within one working day.</p><p class="demo-note">Demo: the message was written to a test log. Nobody will be in touch.</p></div>`;
  }
  return html`<form class="card enquiry" action="${link(action)}" method="post" novalidate>
    <input type="hidden" name="kind" value="${kind}">
    ${errors ? html`<div class="error-summary" role="alert"><h2>Check the form and try again</h2></div>` : ''}
    ${fields.map((f) => html`<div class="field"><label for="${f.name}">${f.label}${f.optional ? html` <span class="optional">(optional)</span>` : ''}</label>${
      f.type === 'select'
        ? html`<select id="${f.name}" name="${f.name}">${f.options.map((o) => html`<option${values[f.name] === o ? raw(' selected') : ''}>${o}</option>`)}</select>`
        : f.type === 'textarea'
          ? html`<textarea id="${f.name}" name="${f.name}" rows="4" maxlength="600">${values[f.name] || ''}</textarea>`
          : html`<input id="${f.name}" name="${f.name}" type="${f.type || 'text'}" value="${values[f.name] || ''}"${f.autocomplete ? raw(` autocomplete="${esc(f.autocomplete)}"`) : ''}${invalid(errors, f.name)}>`
    }${fieldError(errors, f.name)}</div>`)}
    <div class="hp" aria-hidden="true"><label for="website-${kind}">Leave this empty</label><input id="website-${kind}" name="website" tabindex="-1" autocomplete="off"></div>
    <button class="btn btn-primary btn-block" type="submit">${submit}</button>
  </form>`;
}

const ACCOUNT_FIELDS = [
  { name: 'organisation', label: 'Organisation', autocomplete: 'organization' },
  { name: 'name', label: 'Your name', autocomplete: 'name' },
  { name: 'phone', label: 'Phone', type: 'tel', autocomplete: 'tel' },
  { name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
  { name: 'volume', label: 'Journeys a month, roughly', type: 'select', options: ['Fewer than 10', '10 to 50', 'More than 50', 'Not sure yet'] },
  { name: 'message', label: 'Anything else', type: 'textarea', optional: true }
];
const DRIVER_FIELDS = [
  { name: 'name', label: 'Your name', autocomplete: 'name' },
  { name: 'phone', label: 'Phone', type: 'tel', autocomplete: 'tel' },
  { name: 'licence', label: 'Do you hold a private hire or taxi licence?', type: 'select', options: ['Yes', 'I\'ve applied', 'Not yet'] }
];
const CONTACT_FIELDS = [
  { name: 'name', label: 'Your name', autocomplete: 'name' },
  { name: 'phone', label: 'Phone or email', autocomplete: 'tel' },
  { name: 'message', label: 'Message', type: 'textarea' }
];

function accountsPage(state = {}) {
  const sectors = [
    ['Hotels and guest houses', 'Guests met at the station or the airport and charged to your account, not their card. Reception books by phone, online or email.'],
    ['Schools and colleges', 'Home to school runs, trips and fixtures. The same drivers each term where we can, all with enhanced DBS checks.'],
    ['NHS and care', 'Appointments, discharges and staff travel. Wheelchair accessible cars on account, at the same price as a car.'],
    ['Local businesses', 'Staff, visitors and the late finish. Every journey on one monthly statement with the passenger and the reference.']
  ];
  return html`
${pageTop({ eyebrow: 'Business accounts', title: 'Book on account, pay once a month.', lede: 'Your people travel without paying the driver. You get one statement a month with every journey on it.', image: 'accounts' })}
<section class="section section-tight">
  <div class="wrap">
    <div class="sectors">${sectors.map(([t, d], i) => html`<article class="sector reveal"><span class="sector-n" aria-hidden="true">0${i + 1}</span><h2>${t}</h2><p>${d}</p></article>`)}</div>
  </div>
</section>
<section class="section band-paper">
  <div class="wrap split split-top">
    <div class="reveal">
      <p class="eyebrow">How it works</p>
      <h2>Set up in a week.</h2>
      <ol class="track">
        <li>Tell us roughly how many journeys you'll need. We set the account up the same week.</li>
        <li>Book by phone, online or by email. Every job gets a reference.</li>
        <li>At the end of the month you get one invoice with every journey listed.</li>
      </ol>
    </div>
    <div id="open-account" class="reveal">
      <h2>Open an account</h2>
      ${enquiryForm({ action: '/accounts', kind: 'account', fields: ACCOUNT_FIELDS, submit: 'Ask for an account', ...state })}
    </div>
  </div>
</section>`;
}

function aboutPage(state = {}) {
  const stats = html`<ul class="stats" aria-label="The firm in numbers">
    <li><strong>${FIRM.fleet}</strong><span>cars</span></li>
    <li><strong>${FIRM.wheelchairCars}</strong><span>wheelchair accessible</span></li>
    <li><strong>${FIRM.founded}</strong><span>running since</span></li>
    <li><strong>24</strong><span>hours a day</span></li>
  </ul>`;
  const driverPhoto = hasImage('driver');
  return html`
${pageTop({ eyebrow: 'About us', title: 'The firm, the drivers, the cars.', lede: `Taxis and private hire in ${FIRM.town} since ${FIRM.founded}, from one control room that is open every hour of the year.`, extra: stats, className: 'page-top-about' })}
${photoBand('fleet-dawn')}
<section class="section section-tight">
  <div class="wrap cols-3">
    <div class="reveal"><h2>Local</h2><p>Our controllers are in ${FIRM.town}. They know the roads, the estates and which door the hospital wants you at.</p></div>
    <div class="reveal"><h2>Our drivers</h2><p>Every driver holds a private hire or hackney carriage licence, an enhanced DBS check and a medical. Most have driven for us for years.</p></div>
    <div class="reveal"><h2>Our cars</h2><p>${FIRM.fleet} cars from one control room: ${FIRM.taxis} hackney carriage taxis, with roof lights, on the ranks and hailed in the street, and ${FIRM.privateHire} private hire cars, booked in advance. All licensed by the council, inspected and cleaned every shift, with a card machine in every one.</p></div>
  </div>
</section>
<section class="section band-paper">
  <div class="wrap split">
    <div class="split-media reveal">${picture({ name: 'wav', className: 'pic-43', alt: ALT.wav, sizes: '(min-width: 56rem) 50vw, 100vw', fallback: typeField({ big: String(FIRM.wheelchairCars), text: 'cars with a ramp, at the price of a car', tone: 'red' }) })}</div>
    <div class="split-copy reveal">
      <p class="eyebrow">Wheelchair accessible</p>
      <h2>Six cars with a ramp, at the price of a car.</h2>
      <p>Ramp access, room for a wheelchair user and up to four others, and drivers trained to help. Book one online, by phone or on account. It costs the same as a car on every journey, because that is how a licensed operator should run.</p>
      <p><a class="link-arrow" href="${link('/book')}">Book a wheelchair accessible car ${icon('arrow')}</a></p>
    </div>
  </div>
</section>
<section class="section band-night" id="app">
  <div class="wrap split">
    <div class="reveal">
      <p class="eyebrow">The app</p>
      <h2>The ${FIRM.shortName} app.</h2>
      <p>Book in two taps, watch your car arrive on the map, and pay by card in the app. Your bookings from the website and the app sit in the same account.</p>
      <div class="stores">
        <span class="store" aria-disabled="true"><small>Download on the</small>App Store</span>
        <span class="store" aria-disabled="true"><small>Get it on</small>Google Play</span>
      </div>
    </div>
    <div class="card demo-card reveal">
      <h2>About this demo</h2>
      <p>On a live site these buttons go to the firm's app in the App Store and Google Play. The app usually comes from the firm's dispatch provider, and bookings made in it and on the website land in the same dispatch system.</p>
    </div>
  </div>
</section>
<section class="section" id="drive">
  <div class="wrap drive-grid${driverPhoto ? ' has-media' : ''}">
    ${driverPhoto ? html`<div class="drive-media reveal">${picture({ name: 'driver', className: 'pic-23', alt: ALT.driver, sizes: '(min-width: 56rem) 33vw, 100vw' })}</div>` : ''}
    <div class="reveal">
      <p class="eyebrow">Drive with us</p>
      <h2>Your own hours, paid weekly.</h2>
      <p>We're looking for drivers who hold a private hire or taxi licence, or who are applying for one.</p>
      <ul class="ticks">
        <li>Choose your own hours</li>
        <li>Weekly settlement</li>
        <li>Account and airport work as well as local jobs</li>
        <li>Help with your licence application</li>
      </ul>
      <p>Or text JOIN to <a href="sms:+447700900418">${FIRM.textNumber}</a>.</p>
    </div>
    <div class="reveal">
      ${enquiryForm({ action: '/about', kind: 'driver', fields: DRIVER_FIELDS, submit: 'Send', ...state })}
    </div>
  </div>
</section>`;
}

function contactPage(state = {}) {
  return html`
${pageTop({ eyebrow: 'Contact', title: 'Call us, any time.', lede: `The quickest way to a taxi is ${FIRM.phone}. Someone answers 24 hours a day.`, image: 'huts-evening' })}
<section class="section section-tight">
  <div class="wrap split split-top">
    <div class="reveal">
      <dl class="contact-list">
        <dt>${icon('phone')} Bookings, 24 hours</dt><dd><a href="${FIRM.phoneHref}">${FIRM.phone}</a></dd>
        <dt>${icon('message')} Text</dt><dd><a href="sms:+447700900418">${FIRM.textNumber}</a></dd>
        <dt>${icon('pin')} Where we are</dt><dd>${FIRM.name}, ${FIRM.town}, ${FIRM.county} ${FIRM.postcodeDistrict}</dd>
        <dt>${icon('card')} Lost property</dt><dd>Call with the time and route of your journey. We keep everything for 28 days.</dd>
      </dl>
      <div class="map">
        <iframe title="Map of ${FIRM.town}" src="https://www.google.com/maps?q=${encodeURIComponent(FIRM.town + ', ' + FIRM.county)}&amp;z=13&amp;output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>
    </div>
    <div class="reveal">
      <h2>Send us a message</h2>
      <p>For accounts, complaints, compliments and anything that isn't a booking.</p>
      ${enquiryForm({ action: '/contact', kind: 'contact', fields: CONTACT_FIELDS, submit: 'Send message', ...state })}
    </div>
  </div>
</section>`;
}

// ---- Staff portal ----------------------------------------------------------
// The office behind the website (Tom, 16/10/2026: "a see our Staff portal and
// AI workers page, it's a fixed screenshot of what it looks like with login
// access obvious, contact Arrington Consultancy to gain access to our AI
// workspace example"). The office itself is served by Arrington's main site
// at /taxi-demo/office and needs an invited login; this page shows it in
// screenshots and puts the login button where nobody can miss it.
//
// The screenshots were taken from the demonstration office on 16 October
// 2026 with the replies as the AI drafted them on production that morning.
// The six workers are named, and their icons drawn, as the office does it
// (lib/taxiOffice/workers.js in the main site; a test there keeps the two
// lists the same).

const OFFICE_WORKERS = [
  ['Bookings', 'Reads booking emails and checks each one against the job in dispatch: times, names, phone numbers, flight numbers, and anything booked twice. Gets the change ready for dispatch and drafts the reply.', 'bookings'],
  ['Checker', 'A second AI that checks every booking against the customer\'s own email and shows anything that doesn\'t match. Nothing goes into dispatch until someone in the office signs it off.', 'checker'],
  ['Customer emails', 'Answers everything else customers send, from lost property to account questions, and looks up the journey when the answer is in dispatch.', 'customer'],
  ['Complaints', 'Logs every complaint and pulls the job from dispatch, so the reply rests on what happened. Passes anything about safety to Licensing.', 'complaints'],
  ['Licensing', 'Keeps every badge, plate, MOT and insurance date in one register, flags what is due and drafts the letter to the council.', 'licensing'],
  ['Social media', 'Writes the week\'s posts from what is going on at the firm. Nothing is posted until the owner approves it.', 'social']
];

// A screenshot: the desktop crop, and on a phone a crop taken at phone width
// so the words stay readable. Nothing at all when the files are not there.
function shot({ name, alt, caption }) {
  if (!images.available(name)) return '';
  const set = (n, ext) => images.sources(n, ext).map((x) => `${x.url} ${x.w}w`).join(', ');
  const dim = images.size(name);
  const jpg = images.sources(name, 'jpg');
  const main = jpg.find((x) => x.w === 1200) || jpg[jpg.length - 1];
  const sizes = '(min-width: 72rem) 68rem, calc(100vw - 3rem)';
  const phone = `${name}-phone`;
  const pd = images.size(phone);
  const phoneSources = images.available(phone)
    ? html`<source media="(max-width: 40rem)" type="image/webp" srcset="${set(phone, 'webp')}" sizes="calc(100vw - 2rem)" width="${pd.width}" height="${pd.height}"><source media="(max-width: 40rem)" srcset="${set(phone, 'jpg')}" sizes="calc(100vw - 2rem)" width="${pd.width}" height="${pd.height}">`
    : '';
  return html`<figure class="shot reveal"><picture class="shot-pic">${phoneSources}<source type="image/webp" srcset="${set(name, 'webp')}" sizes="${sizes}"><img src="${main.url}" srcset="${set(name, 'jpg')}" sizes="${sizes}" width="${main.w}" height="${Math.round(dim.height * main.w / dim.width)}" alt="${alt}" loading="lazy" decoding="async"></picture><figcaption>${caption}</figcaption></figure>`;
}

function staffPortalPage() {
  const login = html`<div class="login-card">
    <p class="login-label">Staff</p>
    <a class="btn btn-primary btn-lg btn-block" href="${link('/office/')}">Staff login</a>
    <p class="login-note">Logins are by invitation. To look round the office yourself, <a href="${FIRM.arringtonEnquiryUrl}">ask Arrington Consultancy for one</a>.</p>
  </div>`;
  return html`
${pageTop({ eyebrow: 'Staff portal', title: 'The office behind the website.', lede: 'Booking emails, complaints and letters from the council all land in one office. Six AI workers read them, check them against dispatch and draft the replies. A second AI checks every booking, and a person in the office signs it off before anything goes out.', tone: 'night', extra: login, className: 'page-top-portal' })}
<section class="section section-tight">
  <div class="wrap">
    <div class="portal-intro">
      <h2>Today, on one screen.</h2>
      <p>The emails waiting, the complaints still open, the licensing dates coming up and the day's board. Press Read the inbox and each email goes to the worker it belongs to.</p>
    </div>
    ${shot({ name: 'office-today', alt: 'Screenshot of the office Today page: four counts across the top, then a card for each AI worker listing the emails it has, each marked as matching dispatch, keyed in wrong, not in dispatch or needing details.', caption: 'The Today page after the morning\'s 13 emails were read.' })}
  </div>
</section>
<section class="section band-paper">
  <div class="wrap">
    <div class="portal-intro">
      <p class="eyebrow">AI workers</p>
      <h2>Six workers, one office.</h2>
      <p>Each one does a single job. None of them sends, books or posts anything on its own.</p>
    </div>
    <ul class="office-workers">${OFFICE_WORKERS.map(([n, d, id]) => html`<li><h3><span class="office-worker-icon">${icon(id)}</span>${n}</h3><p>${d}</p></li>`)}</ul>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="portal-intro">
      <p class="eyebrow">Bookings</p>
      <h2>A booking checked against dispatch.</h2>
      <p>Paul asked for a 5.30am pickup to the airport. Dispatch had 5.50. The AI reads the email, then plain code compares it with the job, field by field, and shows the difference. One click puts it right in dispatch, and the reply is drafted ready for someone to check.</p>
    </div>
    ${shot({ name: 'office-booking', alt: 'Screenshot of a booking email beside the AI\'s reading of it. Under "Does dispatch have it right?" the email says 05:30 and dispatch has 05:50, with a button to correct it in dispatch and a draft reply below.', caption: 'A booking email beside what dispatch holds. The reply is as the AI drafted it.' })}
  </div>
</section>
<section class="section band-paper">
  <div class="wrap">
    <div class="portal-intro">
      <p class="eyebrow">Complaints</p>
      <h2>A complaint answered from the record.</h2>
      <p>Ruth's car was 16 minutes late and she missed her train. The worker pulled the job from dispatch: a road closure at Exton, and a controller's note that nobody rang her. So the draft says what happened, owns the part that was the firm's fault, and leaves any refund to the office.</p>
    </div>
    ${shot({ name: 'office-complaint', alt: 'Screenshot of a complaint: what the customer says, the dispatch record for the journey including the controller\'s note, the steps for the office, and the draft reply.', caption: 'The complaint, the dispatch record behind it, and the reply as the AI drafted it.' })}
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="arrington-panel portal-panel">
      <p class="arrington-label">Built by Arrington Consultancy</p>
      <h2>Want to look round the office?</h2>
      <p>This office is a working example we built for taxi and private hire firms. The AI workers run on a made-up inbox and a test dispatch board, so nothing real is sent, booked or posted. Contact Arrington Consultancy to gain access to our AI workspace example.</p>
      <p class="portal-actions"><a class="btn btn-primary" href="${FIRM.arringtonEnquiryUrl}">Ask Arrington for a login</a> <a class="btn btn-ghost" href="${link('/office/')}">Staff login</a></p>
    </div>
    <p class="shot-note">Screenshots taken on 16 October 2026 from the demonstration office. The replies shown are as the AI drafted them; a person checks every one before it goes anywhere.</p>
  </div>
</section>`;
}

function notFoundPage() {
  return html`
<section class="not-found">
  <div class="not-found-map on-night-map">${raw(exeMap({ id: 'lost-map', decorative: true }))}</div>
  <div class="wrap not-found-inner">
    <p class="eyebrow">Page not found</p>
    <h1>That road doesn't go anywhere.</h1>
    <p class="lede">Try the <a href="${link('/')}">home page</a>, <a href="${link('/book')}">book online</a>, or call <a href="${FIRM.phoneHref}">${FIRM.phone}</a>.</p>
  </div>
</section>`;
}

function placesJson() {
  return JSON.stringify(PLACES.map((p) => ({ n: p.name, a: p.area })));
}

module.exports = {
  home, bookPage, bookBarPrice, confirmationPage, statusSteps, airportsPage, accountsPage, aboutPage, contactPage, staffPortalPage, notFoundPage, placesJson, fareBlock, ALT, OFFICE_WORKERS,
  ACCOUNT_FIELDS, DRIVER_FIELDS, CONTACT_FIELDS
};
