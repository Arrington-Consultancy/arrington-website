'use strict';

// Fare estimates for the demo: a fixed-price table for airports and long
// runs, and a metered tariff for everything else. Invented figures for an
// invented firm, kept in the range a South West operator charges so an
// operator looking at the demo is not distracted by a silly number. A real
// build reads the operator's own tariff, or asks the dispatch system for the
// quote where its booking API offers one.

const { resolvePlace } = require('./places');
const { FIRM } = require('./firm');

const VEHICLES = [
  { id: 'saloon', label: 'Car', note: 'Up to 4 passengers', seats: 4, bags: 2, factor: 1 },
  { id: 'estate', label: 'Estate', note: 'Up to 4, room for more bags', seats: 4, bags: 4, factor: 1 },
  { id: 'mpv6', label: '6-seater', note: 'Up to 6 passengers', seats: 6, bags: 4, factor: 1.5 },
  { id: 'mpv8', label: '8-seater', note: 'Up to 8 passengers', seats: 8, bags: 6, factor: 1.6 },
  { id: 'executive', label: 'Executive', note: 'Up to 3, leather and air con', seats: 3, bags: 3, factor: 1.4 },
  // Same price as a car, always. Charging a wheelchair user more is not
  // something a licensed operator does, and the page says so.
  { id: 'wav', label: 'Wheelchair accessible', note: 'Ramp, up to 5 including a wheelchair user', seats: 5, bags: 3, factor: 1 }
];
const vehicleById = (id) => VEHICLES.find((v) => v.id === id) || null;

// One way, saloon, from anywhere in our local area. Same price day or night.
const FIXED = [
  { id: 'exeter-airport', name: 'Exeter Airport', price: 28, miles: 10 },
  { id: 'exeter-st-davids', name: 'Exeter St Davids station', price: 30, miles: 11 },
  { id: 'plymouth-station', name: 'Plymouth station', price: 95, miles: 52 },
  { id: 'bristol-temple-meads', name: 'Bristol Temple Meads', price: 140, miles: 82 },
  { id: 'bristol-airport', name: 'Bristol Airport', price: 150, miles: 85 },
  { id: 'southampton-cruise', name: 'Southampton cruise terminals', price: 260, miles: 120 },
  { id: 'heathrow', name: 'Heathrow Airport', price: 295, miles: 170 },
  { id: 'gatwick', name: 'Gatwick Airport', price: 340, miles: 200 }
];

const TARIFF = {
  firstMile: 3.8,
  perMile: 2.4,
  minimum: 6,
  // 22:00 to 06:00, all day Sunday, bank holidays.
  enhanced: 1.5,
  // Christmas Day, Boxing Day, New Year's Day.
  festive: 2,
  roadFactor: 1.3
};

// England and Wales bank holidays (gov.uk), as London dates.
const BANK_HOLIDAYS = new Set([
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28'
]);
const FESTIVE = /-(12-25|12-26|01-01)$/;

// Straight-line distance in km.
function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// The Exe has no road crossing below Exeter, so a run from Exmouth to
// Dawlish or Torquay goes round by the Countess Wear bridge. Without this
// the straight line across the water quotes half the real distance.
const BRIDGE = { lat: 50.7030, lng: -3.4970 };
const westOfExe = (p) => p.lat < 50.70 && p.lng < -3.445;
const eastOfExe = (p) => p.lat < 50.70 && p.lng >= -3.445;

function roadMiles(a, b) {
  const crosses = (westOfExe(a) && eastOfExe(b)) || (eastOfExe(a) && westOfExe(b));
  const km = crosses ? haversineKm(a, BRIDGE) + haversineKm(BRIDGE, b) : haversineKm(a, b);
  return (km / 1.609344) * TARIFF.roadFactor;
}

// Local means within six miles of the town centre as the crow flies.
const isLocal = (p) => haversineKm(p, FIRM.geo) / 1.609344 <= 6;

// London wall-clock parts for an instant.
function londonParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), weekday: parts.weekday };
}

// The instant a London wall-clock time ("2026-10-17T09:30") refers to.
function londonToInstant(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local || ''));
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (Number.isNaN(guess)) return null;
  const p = londonParts(new Date(guess));
  const asUtc = Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, +p.date.slice(8, 10), p.hour, p.minute);
  return new Date(guess - (asUtc - guess));
}

function rateFor(instant) {
  const p = londonParts(instant);
  if (FESTIVE.test(p.date)) return { factor: TARIFF.festive, label: 'Christmas and New Year rate (double)' };
  if (p.weekday === 'Sun' || BANK_HOLIDAYS.has(p.date) || p.hour >= 22 || p.hour < 6) {
    return { factor: TARIFF.enhanced, label: 'Night, Sunday and bank holiday rate (time and a half)' };
  }
  return { factor: 1, label: 'Daytime rate' };
}

const toPence = (pounds) => Math.round(pounds * 100);
const roundTo = (pence, step) => Math.round(pence / step) * step;

// The estimate shown before booking. Returns null fields rather than a guess
// when either end is not recognised.
function estimate({ pickup, destination, vehicle = 'saloon', when }) {
  const v = vehicleById(vehicle) || VEHICLES[0];
  const from = typeof pickup === 'object' && pickup ? pickup : resolvePlace(pickup);
  const to = typeof destination === 'object' && destination ? destination : resolvePlace(destination);
  const at = when instanceof Date ? when : new Date();
  if (!from || !to) {
    return { kind: 'unpriced', vehicle: v.id, message: 'We\'ll price this one when the controller confirms. Book and we\'ll text you the fare.' };
  }
  const fixedEnd = [from, to].find((p) => p.fixedId);
  const otherEnd = fixedEnd === from ? to : from;
  if (fixedEnd && isLocal(otherEnd)) {
    const f = FIXED.find((x) => x.id === fixedEnd.fixedId);
    const pence = roundTo(toPence(f.price * v.factor), 100);
    return { kind: 'fixed', vehicle: v.id, pence, label: `Fixed price, ${f.name}, day or night`, miles: f.miles };
  }
  const miles = roadMiles(from, to);
  const rate = rateFor(at);
  const metered = Math.max(TARIFF.minimum, TARIFF.firstMile + Math.max(0, miles - 1) * TARIFF.perMile);
  const low = roundTo(toPence(metered * rate.factor * v.factor), 50);
  const high = roundTo(Math.round(low * 1.12), 50);
  return { kind: 'metered', vehicle: v.id, lowPence: low, highPence: Math.max(high, low + 50), label: rate.label, miles: Math.round(miles * 10) / 10 };
}

const money = (pence) => '£' + (pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2));

function describe(est) {
  if (!est || est.kind === 'unpriced') return 'Price confirmed by text';
  if (est.kind === 'fixed') return money(est.pence);
  return `${money(est.lowPence)} to ${money(est.highPence)}`;
}

module.exports = { VEHICLES, vehicleById, FIXED, TARIFF, estimate, describe, money, roadMiles, haversineKm, londonParts, londonToInstant, rateFor, isLocal };
