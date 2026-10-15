'use strict';
// Booking validation and what is handed to dispatch.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readBooking, toDispatch, ukPhone, maskPhone, maskEmail } = require('../lib/booking');

const NOW = new Date('2026-10-15T11:00:00Z');
const good = { pickup: 'Exmouth railway station', destination: 'Exeter Airport', name: 'Tom Test', phone: '07700 900123', passengers: '2', vehicle: 'saloon', payment: 'card' };

test('a complete booking passes and carries its price', () => {
  const r = readBooking(good, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.booking.phone, '+447700900123');
  assert.equal(r.booking.quote.kind, 'fixed');
  assert.equal(r.booking.when, 'now');
});

test('missing essentials are named in plain words', () => {
  const r = readBooking({}, NOW);
  assert.equal(r.ok, false);
  for (const k of ['pickup', 'destination', 'name', 'phone']) assert.ok(r.errors[k], k);
});

test('a booking for later must be at least 15 minutes ahead and within 90 days', () => {
  const soon = readBooking({ ...good, when: 'later', date: '2026-10-15', time: '12:05' }, NOW); // 11:05Z
  assert.equal(soon.ok, false);
  assert.match(soon.errors.date, /15 minutes/);
  const ok = readBooking({ ...good, when: 'later', date: '2026-10-16', time: '09:30' }, NOW);
  assert.equal(ok.ok, true);
  assert.equal(ok.booking.pickupAt, '2026-10-16T08:30:00.000Z');
  const far = readBooking({ ...good, when: 'later', date: '2027-03-01', time: '09:30' }, NOW);
  assert.match(far.errors.date, /90 days/);
});

test('too many passengers or bags for the car says which car fits', () => {
  assert.match(readBooking({ ...good, passengers: '6' }, NOW).errors.vehicle, /6-seater/);
  assert.match(readBooking({ ...good, luggage: '4' }, NOW).errors.vehicle, /estate/);
});

test('account payment needs the account name', () => {
  assert.ok(readBooking({ ...good, payment: 'account' }, NOW).errors.account);
  assert.equal(readBooking({ ...good, payment: 'account', account: 'Seaview Hotel' }, NOW).ok, true);
});

test('only UK numbers are accepted, in any common spacing', () => {
  assert.equal(ukPhone('+44 7700 900123'), '+447700900123');
  assert.equal(ukPhone('(01632) 960 418'), '+441632960418');
  assert.equal(ukPhone('12345'), null);
  assert.equal(ukPhone('+1 415 555 0100'), null);
});

test('markup in any field is neutralised before it goes anywhere', () => {
  const r = readBooking({ ...good, name: '<script>alert(1)</script>Tom', notes: 'gate code <b>12</b>' }, NOW);
  assert.equal(r.ok, true);
  assert.doesNotMatch(r.booking.name + r.booking.notes, /[<>]/);
});

test('the honeypot stops a bot', () => {
  assert.equal(readBooking({ ...good, website: 'http://spam' }, NOW).ok, false);
});

test('dispatch receives the journey, the passenger and the payment, nothing else', () => {
  const d = toDispatch(readBooking(good, NOW).booking);
  assert.deepEqual(Object.keys(d).sort(), ['asap', 'destination', 'luggage', 'notes', 'passenger', 'passengers', 'payment', 'pickup', 'pickupAt', 'quote', 'source', 'vehicle']);
  assert.equal(d.source, 'website');
  assert.equal(typeof d.pickup.lat, 'number');
});

test('logs only ever see masked contact details', () => {
  assert.equal(maskPhone('+447700900123'), '07*** ***123');
  assert.equal(maskEmail('tom@example.com'), 't***@e***.com');
});
