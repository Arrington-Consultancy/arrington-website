'use strict';

// Pickup and destination lookup for the demo.
//
// A real build uses an address service (Google Places, getAddress.io or the
// dispatch system's own address search) so every house in the area is found.
// The demo cannot call a paid service from a public test page, so it carries
// a short list of real places in and around Exmouth with approximate
// coordinates, and understands any address that names a town on the list or
// starts with a known postcode district. Anything else is still accepted as
// typed; it just gets no instant price (the controller prices it).

const PLACES = [
  // Exmouth
  { id: 'exmouth-station', name: 'Exmouth railway station', area: 'Exmouth', lat: 50.6213, lng: -3.4152 },
  { id: 'exmouth-strand', name: 'The Strand, Exmouth town centre', area: 'Exmouth', lat: 50.6195, lng: -3.4140 },
  { id: 'exmouth-seafront', name: 'Exmouth seafront (Queen\'s Drive)', area: 'Exmouth', lat: 50.6136, lng: -3.3985 },
  { id: 'exmouth-marina', name: 'Exmouth Marina', area: 'Exmouth', lat: 50.6140, lng: -3.4210 },
  { id: 'exmouth-hospital', name: 'Exmouth Community Hospital', area: 'Exmouth', lat: 50.6247, lng: -3.4006 },
  { id: 'exmouth-leisure', name: 'Exmouth leisure centre', area: 'Exmouth', lat: 50.6150, lng: -3.4080 },
  { id: 'withycombe', name: 'Withycombe Raleigh', area: 'Exmouth', lat: 50.6330, lng: -3.3930 },
  { id: 'littleham', name: 'Littleham', area: 'Exmouth', lat: 50.6180, lng: -3.3780 },
  { id: 'brixington', name: 'Brixington', area: 'Exmouth', lat: 50.6330, lng: -3.3800 },
  // Nearby
  { id: 'lympstone', name: 'Lympstone village', area: 'Lympstone', lat: 50.6480, lng: -3.4300 },
  { id: 'lympstone-commando', name: 'Lympstone Commando station', area: 'Lympstone', lat: 50.6620, lng: -3.4410 },
  { id: 'budleigh', name: 'Budleigh Salterton, Fore Street', area: 'Budleigh Salterton', lat: 50.6290, lng: -3.3200 },
  { id: 'woodbury', name: 'Woodbury village', area: 'Woodbury', lat: 50.6760, lng: -3.4010 },
  { id: 'topsham', name: 'Topsham, Fore Street', area: 'Topsham', lat: 50.6830, lng: -3.4650 },
  { id: 'sidmouth', name: 'Sidmouth Esplanade', area: 'Sidmouth', lat: 50.6790, lng: -3.2390 },
  { id: 'exton', name: 'Exton', area: 'Exton', lat: 50.6680, lng: -3.4440 },
  // Exeter
  { id: 'exeter-airport', name: 'Exeter Airport', area: 'Exeter', lat: 50.7344, lng: -3.4139, fixedId: 'exeter-airport' },
  { id: 'exeter-st-davids', name: 'Exeter St Davids station', area: 'Exeter', lat: 50.7292, lng: -3.5435, fixedId: 'exeter-st-davids' },
  { id: 'exeter-central', name: 'Exeter Central station', area: 'Exeter', lat: 50.7265, lng: -3.5330 },
  { id: 'exeter-high-st', name: 'Exeter city centre, High Street', area: 'Exeter', lat: 50.7236, lng: -3.5300 },
  { id: 'exeter-hospital', name: 'Royal Devon and Exeter Hospital, Wonford', area: 'Exeter', lat: 50.7170, lng: -3.5070 },
  { id: 'exeter-university', name: 'University of Exeter, Streatham campus', area: 'Exeter', lat: 50.7360, lng: -3.5340 },
  { id: 'sandy-park', name: 'Sandy Park, Exeter', area: 'Exeter', lat: 50.7110, lng: -3.4730 },
  { id: 'westpoint', name: 'Westpoint, Clyst St Mary', area: 'Exeter', lat: 50.7040, lng: -3.4500 },
  // Further afield (fixed prices)
  { id: 'bristol-airport', name: 'Bristol Airport', area: 'Bristol', lat: 51.3827, lng: -2.7191, fixedId: 'bristol-airport' },
  { id: 'heathrow', name: 'Heathrow Airport', area: 'London', lat: 51.4700, lng: -0.4543, fixedId: 'heathrow' },
  { id: 'gatwick', name: 'Gatwick Airport', area: 'London', lat: 51.1537, lng: -0.1821, fixedId: 'gatwick' },
  { id: 'bristol-temple-meads', name: 'Bristol Temple Meads station', area: 'Bristol', lat: 51.4491, lng: -2.5813, fixedId: 'bristol-temple-meads' },
  { id: 'plymouth-station', name: 'Plymouth station', area: 'Plymouth', lat: 50.3780, lng: -4.1430, fixedId: 'plymouth-station' },
  { id: 'southampton-cruise', name: 'Southampton cruise terminals', area: 'Southampton', lat: 50.8960, lng: -1.4000, fixedId: 'southampton-cruise' }
];

// Towns and postcode districts, for typed addresses ("12 Rolle Road, EX8").
const TOWNS = [
  { name: 'Exmouth', lat: 50.6195, lng: -3.4140, postcodes: ['EX8'] },
  { name: 'Lympstone', lat: 50.6480, lng: -3.4300 },
  { name: 'Budleigh Salterton', lat: 50.6290, lng: -3.3200, postcodes: ['EX9'] },
  { name: 'Woodbury', lat: 50.6760, lng: -3.4010 },
  { name: 'Exton', lat: 50.6680, lng: -3.4440 },
  { name: 'Topsham', lat: 50.6830, lng: -3.4650 },
  { name: 'Exeter', lat: 50.7236, lng: -3.5300, postcodes: ['EX1', 'EX2', 'EX3', 'EX4', 'EX5', 'EX6'] },
  { name: 'Sidmouth', lat: 50.6790, lng: -3.2390, postcodes: ['EX10'] },
  { name: 'Ottery St Mary', lat: 50.7520, lng: -3.2810, postcodes: ['EX11'] },
  { name: 'Honiton', lat: 50.7990, lng: -3.1890, postcodes: ['EX14'] },
  { name: 'Cullompton', lat: 50.8560, lng: -3.3920, postcodes: ['EX15'] },
  { name: 'Tiverton', lat: 50.9020, lng: -3.4910, postcodes: ['EX16'] },
  { name: 'Crediton', lat: 50.7910, lng: -3.6560, postcodes: ['EX17'] },
  { name: 'Dawlish', lat: 50.5810, lng: -3.4660, postcodes: ['EX7'] },
  { name: 'Teignmouth', lat: 50.5470, lng: -3.4960, postcodes: ['TQ14'] },
  { name: 'Newton Abbot', lat: 50.5280, lng: -3.6080, postcodes: ['TQ12'] },
  { name: 'Torquay', lat: 50.4620, lng: -3.5250, postcodes: ['TQ1', 'TQ2'] },
  { name: 'Paignton', lat: 50.4350, lng: -3.5650, postcodes: ['TQ3', 'TQ4'] },
  { name: 'Plymouth', lat: 50.3755, lng: -4.1427, postcodes: ['PL1', 'PL2', 'PL3', 'PL4', 'PL5', 'PL6', 'PL7', 'PL9'] },
  { name: 'Taunton', lat: 51.0150, lng: -3.1020, postcodes: ['TA1', 'TA2'] }
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// The single place a typed string refers to, or null. Exact list entries win,
// then a town named in the text, then a postcode district at the end.
function resolvePlace(text) {
  const t = norm(text);
  if (!t) return null;
  const exact = PLACES.find((p) => norm(p.name) === t);
  if (exact) return { ...exact, match: 'place' };
  // The longest town name found wins, so "Budleigh Salterton" is not read as
  // a street in another town that merely contains "Salterton".
  const towns = TOWNS.filter((tw) => new RegExp(`(^| )${norm(tw.name)}( |$)`).test(t)).sort((a, b) => b.name.length - a.name.length);
  if (towns.length) return { id: 'town-' + norm(towns[0].name).replace(/ /g, '-'), name: String(text).trim(), area: towns[0].name, lat: towns[0].lat, lng: towns[0].lng, match: 'town' };
  const pc = String(text).toUpperCase().match(/\b([A-Z]{1,2}[0-9]{1,2})\s?[0-9][A-Z]{2}\b|\b([A-Z]{1,2}[0-9]{1,2})\s*$/);
  const district = pc ? (pc[1] || pc[2]) : null;
  if (district) {
    const tw = TOWNS.find((x) => (x.postcodes || []).includes(district));
    if (tw) return { id: 'postcode-' + district.toLowerCase(), name: String(text).trim(), area: tw.name, lat: tw.lat, lng: tw.lng, match: 'postcode' };
  }
  return null;
}

// Suggestions for the autocomplete: list places whose name or area contains
// every word typed, best first. Client-side code does the same over
// /places.json; this copy serves the tests and any non-JS fallback.
function suggest(text, limit = 6) {
  const words = norm(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  return PLACES
    .map((p) => ({ p, hay: norm(p.name + ' ' + p.area) }))
    .filter(({ hay }) => words.every((w) => hay.includes(w)))
    .sort((a, b) => a.hay.indexOf(words[0]) - b.hay.indexOf(words[0]))
    .slice(0, limit)
    .map(({ p }) => p);
}

module.exports = { PLACES, TOWNS, resolvePlace, suggest, norm };
