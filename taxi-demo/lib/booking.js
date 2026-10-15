'use strict';

// Booking validation and the shape handed to dispatch. Pure: no I/O, no
// clock unless one is passed in, so every rule is tested directly.

const { VEHICLES, vehicleById, estimate, londonToInstant } = require('./fares');
const { resolvePlace } = require('./places');

const PAYMENT = [
  { id: 'card', label: 'Card in the car' },
  { id: 'cash', label: 'Cash' },
  { id: 'account', label: 'Business account' }
];

const LIMITS = { address: 160, name: 80, email: 120, notes: 300, account: 80 };
const MIN_AHEAD_MS = 15 * 60 * 1000;
const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// UK numbers only, in any common spacing. Returns E.164 or null.
function ukPhone(raw) {
  const digits = String(raw || '').replace(/[\s().-]/g, '');
  const m = /^(?:\+44|0044|0)([1-9]\d{8,9})$/.exec(digits);
  return m ? '+44' + m[1] : null;
}
const isMobile = (e164) => /^\+447\d{9}$/.test(e164 || '');

function validEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

const article = (word) => (/^[aeiou]/i.test(word) ? 'An' : 'A');

function toInt(v, def) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

// Reads a submitted form (urlencoded fields or JSON body) into a booking, or
// a list of field errors in the order the form shows them.
function readBooking(input, now = new Date()) {
  const f = input || {};
  const errors = {};
  const b = {};

  b.pickup = clean(f.pickup, LIMITS.address);
  b.destination = clean(f.destination, LIMITS.address);
  if (b.pickup.length < 3) errors.pickup = 'Tell us where to pick you up.';
  if (b.destination.length < 3) errors.destination = 'Tell us where you\'re going.';
  if (!errors.pickup && !errors.destination && b.pickup.toLowerCase() === b.destination.toLowerCase()) {
    errors.destination = 'The destination is the same as the pickup.';
  }

  b.when = f.when === 'later' ? 'later' : 'now';
  if (b.when === 'later') {
    const date = clean(f.date, 10);
    const time = clean(f.time, 5);
    const at = londonToInstant(`${date}T${time}`);
    if (!at) errors.date = 'Choose a date and time.';
    else if (at.getTime() < now.getTime() + MIN_AHEAD_MS) errors.date = 'Pick a time at least 15 minutes from now, or choose "As soon as possible".';
    else if (at.getTime() > now.getTime() + MAX_AHEAD_MS) errors.date = 'We take bookings up to 90 days ahead.';
    else { b.pickupAt = at.toISOString(); b.date = date; b.time = time; }
  } else {
    b.pickupAt = now.toISOString();
  }

  b.passengers = toInt(f.passengers, 1);
  b.luggage = toInt(f.luggage, 0);
  if (b.passengers < 1 || b.passengers > 8) errors.passengers = 'Between 1 and 8 passengers.';
  if (b.luggage < 0 || b.luggage > 8) errors.luggage = 'Between 0 and 8 large bags.';
  const v = vehicleById(f.vehicle) || VEHICLES[0];
  b.vehicle = v.id;
  if (!errors.passengers && b.passengers > v.seats) {
    const fits = VEHICLES.find((x) => x.seats >= b.passengers && x.id !== 'executive');
    errors.vehicle = `${article(v.label)} ${v.label.toLowerCase()} takes up to ${v.seats}.${fits ? ` Choose ${article(fits.label).toLowerCase()} ${fits.label.toLowerCase()} for ${b.passengers}.` : ''}`;
  } else if (!errors.luggage && b.luggage > v.bags) {
    const fits = VEHICLES.find((x) => x.bags >= b.luggage && x.seats >= b.passengers && x.id !== 'executive');
    errors.vehicle = `That's more bags than ${article(v.label).toLowerCase()} ${v.label.toLowerCase()} takes.${fits ? ` Choose ${article(fits.label).toLowerCase()} ${fits.label.toLowerCase()}.` : ''}`;
  }

  b.name = clean(f.name, LIMITS.name);
  if (b.name.length < 2) errors.name = 'Your name, so the driver knows who to look for.';
  const phone = ukPhone(f.phone);
  if (!phone) errors.phone = 'A UK phone number, so the driver can reach you.';
  else b.phone = phone;
  b.email = clean(f.email, LIMITS.email);
  if (b.email && !validEmail(b.email)) errors.email = 'That email address doesn\'t look right. Leave it blank if you don\'t want a receipt.';

  b.payment = PAYMENT.some((p) => p.id === f.payment) ? f.payment : 'card';
  b.account = b.payment === 'account' ? clean(f.account, LIMITS.account) : '';
  if (b.payment === 'account' && b.account.length < 2) errors.account = 'The name on your account.';

  b.notes = clean(f.notes, LIMITS.notes);

  if (clean(f.website, 200)) errors.form = 'Something went wrong. Please call us.';

  if (Object.keys(errors).length) return { ok: false, errors, values: b };
  b.quote = estimate({ pickup: b.pickup, destination: b.destination, vehicle: b.vehicle, when: new Date(b.pickupAt) });
  return { ok: true, booking: b };
}

// What the dispatch driver receives. Addresses carry coordinates when the
// demo recognised the place; a real address service always supplies them.
function toDispatch(b) {
  const place = (text) => {
    const p = resolvePlace(text);
    return p ? { address: text, lat: p.lat, lng: p.lng } : { address: text };
  };
  return {
    source: 'website',
    pickup: place(b.pickup),
    destination: place(b.destination),
    asap: b.when === 'now',
    pickupAt: b.pickupAt,
    passengers: b.passengers,
    luggage: b.luggage,
    vehicle: b.vehicle,
    passenger: { name: b.name, phone: b.phone, email: b.email || null },
    payment: { method: b.payment, account: b.account || null },
    notes: b.notes || null,
    quote: b.quote
  };
}

// Masks for anything written to a log.
function maskPhone(e164) {
  const d = String(e164 || '').replace(/^\+44/, '0');
  return d.length > 4 ? d.slice(0, 2) + '*** ***' + d.slice(-3) : '***';
}
function maskEmail(email) {
  const m = /^(.)[^@]*@(.)[^.]*(\..+)$/.exec(String(email || ''));
  return m ? `${m[1]}***@${m[2]}***${m[3]}` : '';
}
const firstName = (name) => String(name || '').split(' ')[0];

module.exports = { readBooking, toDispatch, ukPhone, isMobile, maskPhone, maskEmail, firstName, PAYMENT, LIMITS, clean };
