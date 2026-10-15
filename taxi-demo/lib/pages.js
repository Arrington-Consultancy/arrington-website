'use strict';

// Page bodies. Copy rules (taxi demo brief, 15/10/2026): plain English,
// short sentences, prices and facts stated straight; no "solutions",
// "seamless" or "cutting-edge", no exclamation marks. Plus the Arrington
// site's own: UK English and no dashes as punctuation.

const { FIRM, DEMO_NOTE, yearsRunning } = require('./firm');
const { html, raw, icon, esc } = require('./html');
const { VEHICLES, FIXED, money, describe, estimate } = require('./fares');
const { PAYMENT, maskPhone, firstName } = require('./booking');
const { PLACES } = require('./places');

const COVER = ['Exmouth', 'Lympstone', 'Budleigh Salterton', 'Woodbury', 'Exton', 'Topsham', 'Exeter', 'Sidmouth'];

function trustStrip() {
  const items = [
    ['shield', 'Licensed operator', 'Every car and driver licensed'],
    ['calendar', `Running since ${FIRM.founded}`, `${yearsRunning()} years in ${FIRM.town}`],
    ['clock', 'Open 24 hours', 'Every day of the year'],
    ['card', 'Card, cash or account', 'Pay how you like'],
    ['access', `${FIRM.wheelchairCars} wheelchair accessible cars`, 'Same price as a car']
  ];
  return html`<ul class="trust">${items.map(([i, t, s]) => html`<li>${icon(i)}<span><strong>${t}</strong><span>${s}</span></span></li>`)}</ul>`;
}

function quickQuote() {
  return html`<form class="quick card" action="/book" method="get" data-quote>
  <h2 class="quick-h">Get a price</h2>
  <div class="field">
    <label for="q-from">From</label>
    <input id="q-from" name="pickup" autocomplete="off" placeholder="Pickup address or place" data-places required>
  </div>
  <div class="field">
    <label for="q-to">To</label>
    <input id="q-to" name="destination" autocomplete="off" placeholder="Where you're going" data-places required>
  </div>
  <p class="quick-price" data-quote-out aria-live="polite">Fixed prices to the airports. Metered fares shown before you book.</p>
  <button class="btn btn-signal btn-block" type="submit">See price and book ${icon('arrow')}</button>
  <p class="quick-note">Booking for later? You choose the time on the next page.</p>
</form>`;
}

function home() {
  const fixedPreview = FIXED.filter((f) => ['exeter-airport', 'exeter-st-davids', 'bristol-airport', 'heathrow'].includes(f.id));
  return html`
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">${FIRM.town} taxis since ${FIRM.founded}</p>
      <h1>Taxis in ${FIRM.town}, day and night</h1>
      <p class="lede">Book online and see the price before you confirm. Or call and speak to someone in ${FIRM.town}.</p>
      <a class="hero-phone" href="${FIRM.phoneHref}">${icon('phone')}<span>${FIRM.phone}</span></a>
    </div>
    ${quickQuote()}
  </div>
</section>
<section class="band-light">
  <div class="wrap">${trustStrip()}</div>
</section>
<section class="section">
  <div class="wrap split">
    <div>
      <p class="eyebrow eyebrow-dark">Airports and long distance</p>
      <h2>Fixed prices, day or night</h2>
      <p>From anywhere in ${FIRM.town}, Lympstone, Budleigh Salterton, Woodbury or Exton. One way, up to four passengers, the same price at 4am as at 4pm.</p>
      <p><a class="link-arrow" href="/airports">All fixed prices ${icon('arrow')}</a></p>
    </div>
    <ul class="price-list">${fixedPreview.map((f) => html`<li><span>${f.name}</span><strong>${money(f.price * 100)}</strong></li>`)}</ul>
  </div>
</section>
<section class="section band-sea">
  <div class="wrap">
    <h2 class="center">Book the way that suits you</h2>
    <div class="ways">
      <article class="way">
        ${icon('car', 'icon icon-lg')}
        <h3>Online</h3>
        <p>See the price first. Your booking goes straight to our controllers and we text you the driver's name, car and arrival time.</p>
        <a class="btn btn-signal" href="/book">Book online</a>
      </article>
      <article class="way">
        ${icon('phone', 'icon icon-lg')}
        <h3>Phone</h3>
        <p>Answered in ${FIRM.town}, 24 hours a day. Tell us where you are and where you're going.</p>
        <a class="btn btn-ghost" href="${FIRM.phoneHref}">${FIRM.phone}</a>
      </article>
      <article class="way" id="app">
        ${icon('message', 'icon icon-lg')}
        <h3>App</h3>
        <p>Book in two taps, watch your car arrive on the map and pay by card in the app.</p>
        <div class="stores">
          <a class="store" href="/about#app"><small>Download on the</small>App Store</a>
          <a class="store" href="/about#app"><small>Get it on</small>Google Play</a>
        </div>
      </article>
    </div>
  </div>
</section>
<section class="section">
  <div class="wrap split split-reverse">
    <div>
      <p class="eyebrow eyebrow-dark">Business accounts</p>
      <h2>One invoice a month</h2>
      <p>Hotels, schools, NHS and care services, and local businesses book on account. Your guests, pupils, patients and staff travel without paying the driver, and you get one statement with every journey on it.</p>
      <p><a class="btn btn-dark" href="/accounts">Open an account</a></p>
    </div>
    <ul class="sector-list">
      <li>${icon('building')} Hotels and guest houses</li>
      <li>${icon('calendar')} Schools and colleges</li>
      <li>${icon('access')} NHS and care</li>
      <li>${icon('card')} Local businesses</li>
    </ul>
  </div>
</section>
<section class="section band-light">
  <div class="wrap">
    <h2 class="center">What customers say</h2>
    <p class="center demo-tag">Example reviews. A live site shows the firm's real Google reviews here.</p>
    <div class="reviews">
      ${[
        ['Booked online at 5am for the airport. Price was what it said and the driver was outside early.', 'Example review'],
        ['We use them for every guest who arrives by train. One invoice at the end of the month, no chasing.', 'Example review'],
        ['The wheelchair car was booked for my mum\'s hospital appointment and the driver waited for her.', 'Example review']
      ].map(([q, who]) => html`<figure class="review"><p class="stars" role="img" aria-label="5 out of 5">${icon('star')}${icon('star')}${icon('star')}${icon('star')}${icon('star')}</p><blockquote>${q}</blockquote><figcaption>${who}</figcaption></figure>`)}
    </div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <h2>Where we go</h2>
    <p>Most of our work is in and around ${FIRM.town}. We go further every day: Exeter, the airports, the stations and anywhere in the UK by arrangement.</p>
    <ul class="chips">${COVER.map((t) => html`<li>${t}</li>`)}</ul>
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

function bookPage({ values = {}, errors = null } = {}) {
  const v = { passengers: 1, luggage: 0, vehicle: 'saloon', payment: 'card', when: 'now', ...values };
  const est = estimate({ pickup: v.pickup, destination: v.destination, vehicle: v.vehicle });
  const opts = (from, to, sel) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => html`<option value="${n}"${Number(sel) === n ? raw(' selected') : ''}>${n}</option>`);
  const errorList = errors ? Object.values(errors) : [];
  return html`
<section class="page-head">
  <div class="wrap">
    <h1>Book a taxi</h1>
    <p class="lede">Your booking goes straight to our controllers. You see the price before you confirm, and we text you the driver's details.</p>
  </div>
</section>
<section class="section section-tight">
  <div class="wrap book-grid">
    <form class="book-form" action="/book" method="post" novalidate data-quote data-book>
      ${errorList.length ? html`<div class="error-summary" role="alert" tabindex="-1"><h2>Check ${errorList.length === 1 ? 'this' : 'these'} and try again</h2><ul>${errorList.map((e) => html`<li>${e}</li>`)}</ul></div>` : ''}
      <fieldset class="group">
        <legend>Your journey</legend>
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
        <div class="field when">
          <span class="label">When</span>
          <div class="seg" role="radiogroup" aria-label="When">
            <input type="radio" id="when-now" name="when" value="now"${v.when !== 'later' ? raw(' checked') : ''}><label for="when-now">As soon as possible</label>
            <input type="radio" id="when-later" name="when" value="later"${v.when === 'later' ? raw(' checked') : ''}><label for="when-later">Later</label>
          </div>
          <div class="later-fields">
            <div class="field"><label for="date">Date</label><input type="date" id="date" name="date" value="${v.date || ''}"${invalid(errors, 'date')}></div>
            <div class="field"><label for="time">Time</label><input type="time" id="time" name="time" value="${v.time || ''}" step="300"></div>
          </div>
          ${fieldError(errors, 'date')}
        </div>
      </fieldset>

      <fieldset class="group">
        <legend>Passengers and car</legend>
        <div class="row-2">
          <div class="field"><label for="passengers">Passengers</label><select id="passengers" name="passengers">${opts(1, 8, v.passengers)}</select>${fieldError(errors, 'passengers')}</div>
          <div class="field"><label for="luggage">Large bags</label><select id="luggage" name="luggage">${opts(0, 8, v.luggage)}</select>${fieldError(errors, 'luggage')}</div>
        </div>
        <div class="vehicles" role="radiogroup" aria-labelledby="vehicle-label"${invalid(errors, 'vehicle')}>
          <span class="label" id="vehicle-label">Car</span>
          ${VEHICLES.map((x) => html`<input type="radio" id="v-${x.id}" name="vehicle" value="${x.id}"${v.vehicle === x.id ? raw(' checked') : ''}><label for="v-${x.id}" class="vehicle"><strong>${x.label}</strong><span>${x.note}</span></label>`)}
        </div>
        ${fieldError(errors, 'vehicle')}
      </fieldset>

      <fieldset class="group">
        <legend>Your details</legend>
        <div class="field"><label for="name">Name</label><input id="name" name="name" value="${v.name || ''}" autocomplete="name" required${invalid(errors, 'name')}>${fieldError(errors, 'name')}</div>
        <div class="field"><label for="phone">Mobile number</label><input id="phone" name="phone" type="tel" value="${v.phoneRaw || ''}" autocomplete="tel" inputmode="tel" required${invalid(errors, 'phone')}><p class="hint">We text your driver's details to this number.</p>${fieldError(errors, 'phone')}</div>
        <div class="field"><label for="email">Email <span class="optional">(optional, for a receipt)</span></label><input id="email" name="email" type="email" value="${v.email || ''}" autocomplete="email"${invalid(errors, 'email')}>${fieldError(errors, 'email')}</div>
      </fieldset>

      <fieldset class="group">
        <legend>Payment</legend>
        <div class="seg seg-3" role="radiogroup" aria-label="Payment">
          ${PAYMENT.map((p) => html`<input type="radio" id="pay-${p.id}" name="payment" value="${p.id}"${v.payment === p.id ? raw(' checked') : ''}><label for="pay-${p.id}">${p.label}</label>`)}
        </div>
        <div class="field account-field"><label for="account">Account name</label><input id="account" name="account" value="${v.account || ''}"${invalid(errors, 'account')}>${fieldError(errors, 'account')}</div>
        <div class="field"><label for="notes">Anything the driver should know <span class="optional">(optional)</span></label><textarea id="notes" name="notes" rows="3" maxlength="300" placeholder="Flight number, door code, child seat">${v.notes || ''}</textarea></div>
      </fieldset>

      <div class="hp" aria-hidden="true"><label for="website">Leave this empty</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>

      <div class="submit-row">
        <p class="price-inline" data-quote-out aria-live="polite">${est.kind === 'unpriced' ? 'Enter both addresses to see the price.' : html`Price: <strong>${describe(est)}</strong>`}</p>
        <button class="btn btn-signal btn-block btn-lg" type="submit">Book this taxi</button>
        <p class="demo-note">${DEMO_NOTE}</p>
      </div>
    </form>
    <aside class="book-aside" aria-label="How booking works">
      <div class="card aside-card">
        <h2>What happens next</h2>
        <ol class="steps">
          <li><strong>Your booking reaches our dispatch system</strong> and you get a reference straight away.</li>
          <li><strong>A controller confirms it.</strong></li>
          <li><strong>We text you the driver's name, car and registration</strong>, and how many minutes away they are.</li>
        </ol>
        <p class="aside-phone">Rather talk to someone? <a href="${FIRM.phoneHref}">${FIRM.phone}</a>, 24 hours.</p>
      </div>
    </aside>
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
    ['Received by our dispatch system', `Reference ${view ? view.ref : ''}`],
    ['Confirmed by a controller', 'Your booking is with our controllers.'],
    view && view.status === 'allocated'
      ? ['Driver on the way', html`<strong>${view.driver.name}</strong>, ${view.driver.car}, <span class="reg">${view.driver.reg}</span>. About ${view.etaMinutes} minutes away, arriving around ${time(view.etaAt)}.`]
      : ['Driver on the way', view && view.status === 'confirmed' && view.asap === false ? 'We\'ll text you the driver\'s details before pickup.' : 'Allocating a car near you.']
  ];
  return html`<ol class="timeline" data-timeline>${steps.map(([t, d], i) => html`<li class="${i <= reached ? 'done' : i === reached + 1 ? 'next' : ''}"><span class="dot" aria-hidden="true"></span><div><strong>${t}</strong><p>${d}</p></div></li>`)}</ol>`;
}

function confirmationPage({ record, view }) {
  const b = record.booking;
  const cancelled = view && view.status === 'cancelled';
  const when = b.when === 'now' ? 'As soon as possible' : new Date(b.pickupAt).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const vehicle = VEHICLES.find((x) => x.id === b.vehicle);
  const pay = PAYMENT.find((p) => p.id === b.payment);
  return html`
<section class="page-head page-head-confirm">
  <div class="wrap">
    <p class="eyebrow">${cancelled ? 'Cancelled' : 'Booked'}</p>
    <h1>${cancelled ? 'Booking cancelled' : `Thanks, ${firstName(b.name)}. Your taxi is booked.`}</h1>
    <p class="ref">Booking reference <strong data-ref>${record.ref}</strong></p>
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
      <div class="card demo-card">
        <h2>About this demo</h2>
        <p>This booking went from the form to a test dispatch system through the same connection a live site uses for iCabbi, Autocab or Cordic. The reference came back from dispatch, and the driver details above are dispatch telling the site a car was allocated.</p>
        <p>The texts and emails are written to a test log instead of being sent. No car will come, and the booking is deleted after two hours.</p>
        <p><a href="${FIRM.arringtonUrl}">Get a site like this for your firm</a></p>
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
          <dt>Price</dt><dd>${describe(b.quote)}</dd>
          <dt>Payment</dt><dd>${pay ? pay.label : b.payment}${b.account ? ` (${b.account})` : ''}</dd>
          ${b.notes ? html`<dt>Notes</dt><dd>${b.notes}</dd>` : ''}
        </dl>
        ${cancelled ? '' : html`<form action="/booking/${record.token}/cancel" method="post" class="cancel-form"><button class="btn btn-outline btn-block" type="submit">Cancel this booking</button></form>`}
        <p class="center"><a href="/book">Book another taxi</a></p>
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
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow">Fixed prices</p>
    <h1>Airport and long distance taxis</h1>
    <p class="lede">Fixed prices from ${FIRM.town} and the villages around it. The price is the same day or night.</p>
  </div>
</section>
<section class="section section-tight">
  <div class="wrap">
    <div class="table-wrap">
      <table class="prices">
        <caption>One way prices from ${FIRM.town}, Lympstone, Budleigh Salterton, Woodbury and Exton</caption>
        <thead><tr><th scope="col">To</th><th scope="col">Car <span>(up to 4)</span></th><th scope="col">6-seater</th><th scope="col">8-seater</th></tr></thead>
        <tbody>${FIXED.map((f) => html`<tr><th scope="row">${f.name}<span>About ${f.miles} miles</span></th><td>${money(f.price * 100)}</td><td>${money(round(f.price * factor('mpv6')) * 100)}</td><td>${money(round(f.price * factor('mpv8')) * 100)}</td></tr>`)}</tbody>
      </table>
    </div>
    <div class="cols-3 notes-grid">
      <div><h2>Flights</h2><p>Put your flight number in the notes. We check the landing time and the first 45 minutes of waiting after landing are included.</p></div>
      <div><h2>Returns</h2><p>Book each way as its own journey. The fixed price applies in both directions.</p></div>
      <div><h2>Wheelchair users</h2><p>Our wheelchair accessible cars cost the same as a car, on every journey.</p></div>
    </div>
    <p class="center cta-row"><a class="btn btn-signal btn-lg" href="/book">Book online</a> <a class="btn btn-dark btn-lg" href="${FIRM.phoneHref}">${icon('phone')} ${FIRM.phone}</a></p>
  </div>
</section>`;
}

// ---- Enquiry forms (accounts, drivers, contact) ------------------------------

function enquiryForm({ action, kind, fields, submit, sent, errors, values = {} }) {
  if (sent) {
    return html`<div class="card sent" role="status"><h2>Thanks, we've got that.</h2><p>Someone from the office will be in touch within one working day.</p><p class="demo-note">Demo: the message was written to a test log. Nobody will be in touch.</p></div>`;
  }
  return html`<form class="card enquiry" action="${action}" method="post" novalidate>
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
    <button class="btn btn-signal btn-block" type="submit">${submit}</button>
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
    ['building', 'Hotels and guest houses', 'Guests met at the station or the airport and charged to your account, not their card. Reception books by phone, online or email.'],
    ['calendar', 'Schools and colleges', 'Home to school runs, trips and fixtures. The same drivers each term where we can, all with enhanced DBS checks.'],
    ['access', 'NHS and care', 'Appointments, discharges and staff travel. Wheelchair accessible cars on account, at the same price as a car.'],
    ['card', 'Local businesses', 'Staff, visitors and the late finish. Every journey on one monthly statement with the passenger and the reference.']
  ];
  return html`
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow">Business accounts</p>
    <h1>Book on account, pay once a month</h1>
    <p class="lede">Your people travel without paying the driver. You get one statement a month with every journey on it.</p>
  </div>
</section>
<section class="section section-tight">
  <div class="wrap">
    <div class="sectors">${sectors.map(([i, t, d]) => html`<article class="sector">${icon(i, 'icon icon-lg')}<h2>${t}</h2><p>${d}</p></article>`)}</div>
  </div>
</section>
<section class="section band-light">
  <div class="wrap split">
    <div>
      <h2>How it works</h2>
      <ol class="steps">
        <li>Tell us roughly how many journeys you'll need. We set the account up the same week.</li>
        <li>Book by phone, online or by email. Every job gets a reference.</li>
        <li>At the end of the month you get one invoice with every journey listed.</li>
      </ol>
    </div>
    <div id="open-account">
      <h2>Open an account</h2>
      ${enquiryForm({ action: '/accounts', kind: 'account', fields: ACCOUNT_FIELDS, submit: 'Ask for an account', ...state })}
    </div>
  </div>
</section>`;
}

function aboutPage(state = {}) {
  return html`
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow">About us</p>
    <h1>${FIRM.town}'s taxi firm since ${FIRM.founded}</h1>
    <p class="lede">${FIRM.fleet} cars, ${FIRM.wheelchairCars} of them wheelchair accessible, and a control room that is open every hour of the year.</p>
  </div>
</section>
<section class="section section-tight">
  <div class="wrap cols-3">
    <div><h2>Local</h2><p>Our controllers are in ${FIRM.town}. They know the roads, the estates and which door the hospital wants you at.</p></div>
    <div><h2>Our drivers</h2><p>Every driver holds a private hire or hackney carriage licence, an enhanced DBS check and a medical. Most have driven for us for years.</p></div>
    <div><h2>Our cars</h2><p>Licensed and inspected by the council, cleaned every shift. Card machines in every car.</p></div>
  </div>
</section>
<section class="section band-sea" id="app">
  <div class="wrap split">
    <div>
      <h2>The ${FIRM.shortName} app</h2>
      <p>Book in two taps, watch your car arrive on the map, and pay by card in the app. Your bookings from the website and the app sit in the same account.</p>
      <div class="stores">
        <span class="store" aria-disabled="true"><small>Download on the</small>App Store</span>
        <span class="store" aria-disabled="true"><small>Get it on</small>Google Play</span>
      </div>
    </div>
    <div class="card demo-card">
      <h2>About this demo</h2>
      <p>On a live site these buttons go to the firm's app in the App Store and Google Play. The app usually comes from the firm's dispatch provider, and bookings made in it and on the website land in the same dispatch system.</p>
    </div>
  </div>
</section>
<section class="section" id="drive">
  <div class="wrap split">
    <div>
      <h2>Drive with us</h2>
      <p>We're looking for drivers who hold a private hire or taxi licence, or who are applying for one.</p>
      <ul class="ticks">
        <li>Choose your own hours</li>
        <li>Weekly settlement</li>
        <li>Account and airport work as well as local jobs</li>
        <li>Help with your licence application</li>
      </ul>
      <p>Or text JOIN to <a href="sms:+447700900418">${FIRM.textNumber}</a>.</p>
    </div>
    <div>
      ${enquiryForm({ action: '/about', kind: 'driver', fields: DRIVER_FIELDS, submit: 'Send', ...state })}
    </div>
  </div>
</section>`;
}

function contactPage(state = {}) {
  return html`
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow">Contact</p>
    <h1>Call us, any time</h1>
    <p class="lede">The quickest way to a taxi is <a href="${FIRM.phoneHref}">${FIRM.phone}</a>. Someone answers 24 hours a day.</p>
  </div>
</section>
<section class="section section-tight">
  <div class="wrap split">
    <div>
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
    <div>
      <h2>Send us a message</h2>
      <p>For accounts, complaints, compliments and anything that isn't a booking.</p>
      ${enquiryForm({ action: '/contact', kind: 'contact', fields: CONTACT_FIELDS, submit: 'Send message', ...state })}
    </div>
  </div>
</section>`;
}

function notFoundPage() {
  return html`
<section class="page-head">
  <div class="wrap">
    <h1>That page isn't here</h1>
    <p class="lede">Try the <a href="/">home page</a>, <a href="/book">book online</a>, or call <a href="${FIRM.phoneHref}">${FIRM.phone}</a>.</p>
  </div>
</section>`;
}

function placesJson() {
  return JSON.stringify(PLACES.map((p) => ({ n: p.name, a: p.area })));
}

module.exports = {
  home, bookPage, confirmationPage, statusSteps, airportsPage, accountsPage, aboutPage, contactPage, notFoundPage, placesJson,
  ACCOUNT_FIELDS, DRIVER_FIELDS, CONTACT_FIELDS
};
