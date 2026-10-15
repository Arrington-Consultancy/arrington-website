'use strict';
// Fares and place lookup for the taxi demo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { estimate, describe, rateFor, londonToInstant, roadMiles, VEHICLES } = require('../lib/fares');
const { resolvePlace, suggest } = require('../lib/places');

const noonWeekday = new Date('2026-10-15T11:00:00Z'); // Thursday, 12:00 London

test('airport runs from the local area are fixed, the same day or night', () => {
  const day = estimate({ pickup: 'Exmouth railway station', destination: 'Exeter Airport', when: noonWeekday });
  const night = estimate({ pickup: 'Exmouth railway station', destination: 'Exeter Airport', when: new Date('2026-10-16T01:30:00Z') });
  assert.equal(day.kind, 'fixed');
  assert.equal(day.pence, 2800);
  assert.equal(night.pence, 2800);
  assert.equal(describe(day), '£28');
  // Either direction.
  assert.equal(estimate({ pickup: 'Heathrow Airport', destination: '4 Rolle Road, EX8 2AB' }).pence, 29500);
});

test('fixed prices only apply from the local area; elsewhere the meter runs', () => {
  const e = estimate({ pickup: 'Sidmouth Esplanade', destination: 'Exeter Airport', when: noonWeekday });
  assert.equal(e.kind, 'metered');
});

test('metered fares give a range and rise at night, on Sundays and bank holidays', () => {
  const day = estimate({ pickup: 'The Strand, Exmouth town centre', destination: 'Topsham, Fore Street', when: noonWeekday });
  const sunday = estimate({ pickup: 'The Strand, Exmouth town centre', destination: 'Topsham, Fore Street', when: new Date('2026-10-18T11:00:00Z') });
  const bankHoliday = estimate({ pickup: 'The Strand, Exmouth town centre', destination: 'Topsham, Fore Street', when: new Date('2026-12-28T11:00:00Z') });
  const christmas = estimate({ pickup: 'The Strand, Exmouth town centre', destination: 'Topsham, Fore Street', when: new Date('2026-12-25T11:00:00Z') });
  assert.equal(day.kind, 'metered');
  assert.ok(day.highPence > day.lowPence);
  assert.ok(Math.abs(sunday.lowPence - day.lowPence * 1.5) <= 50);
  assert.equal(bankHoliday.lowPence, sunday.lowPence);
  assert.ok(Math.abs(christmas.lowPence - day.lowPence * 2) <= 50);
  assert.match(rateFor(new Date('2026-10-15T21:30:00Z')).label, /Night/); // 22:30 BST
  assert.equal(rateFor(new Date('2026-10-15T20:30:00Z')).label, 'Daytime rate'); // 21:30 BST
});

test('a wheelchair accessible car costs the same as a car', () => {
  const car = estimate({ pickup: 'Exmouth', destination: 'Exeter St Davids station', vehicle: 'saloon' });
  const wav = estimate({ pickup: 'Exmouth', destination: 'Exeter St Davids station', vehicle: 'wav' });
  assert.equal(wav.pence, car.pence);
  assert.equal(VEHICLES.find((v) => v.id === 'wav').factor, 1);
});

test('larger cars cost more', () => {
  const car = estimate({ pickup: 'Exmouth', destination: 'Exeter Airport' });
  const eight = estimate({ pickup: 'Exmouth', destination: 'Exeter Airport', vehicle: 'mpv8' });
  assert.ok(eight.pence > car.pence);
});

test('a run across the Exe goes round by the bridge, not over the water', () => {
  const exmouth = resolvePlace('Exmouth');
  const dawlish = resolvePlace('Dawlish');
  assert.ok(roadMiles(exmouth, dawlish) > 15, 'Exmouth to Dawlish by road is about 20 miles');
});

test('an address nobody can place gets no price rather than a guess', () => {
  const e = estimate({ pickup: 'Somewhere unknown', destination: 'Exeter Airport' });
  assert.equal(e.kind, 'unpriced');
  assert.equal(describe(e), 'Price confirmed by text');
});

test('typed addresses resolve by town name or postcode district', () => {
  assert.equal(resolvePlace('12 Rolle Road, EX8 2AB').area, 'Exmouth');
  assert.equal(resolvePlace('3 Fore Street, Budleigh Salterton').area, 'Budleigh Salterton');
  assert.equal(resolvePlace('Flat 2, TQ14 8AA').area, 'Teignmouth');
  assert.equal(resolvePlace('nowhere at all'), null);
  assert.equal(suggest('exe air')[0].name, 'Exeter Airport');
});

test('London wall-clock times convert across the clock change', () => {
  assert.equal(londonToInstant('2026-07-01T09:00').toISOString(), '2026-07-01T08:00:00.000Z');
  assert.equal(londonToInstant('2026-12-01T09:00').toISOString(), '2026-12-01T09:00:00.000Z');
  assert.equal(londonToInstant('nonsense'), null);
});
