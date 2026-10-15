'use strict';

// The fictional firm. Everything a page says about the business comes from
// here, so the name, number or town can be changed in one place and the
// name, address and phone (NAP) stay the same on every page and in the
// structured data.
//
// Ground rules (taxi demo brief, 15/10/2026, plus this build's own):
//   - Tidewell Cars is invented. Checked 15/10/2026: no UK taxi or private
//     hire operator trades under the name (Companies House and web search).
//     The only "Tidewell" companies are a property group in Tenby.
//   - The phone numbers are Ofcom's drama range (01632 960xxx and
//     07700 900xxx), which are never allocated to a real line, so nobody is
//     rung by mistake. There is no published email address and no street
//     address: a real house in Exmouth must not be named as a taxi office.
//   - No real council, hospital, school, hotel or company is named as a
//     licensing authority, client or partner.
//   - Every page says plainly that this is a demonstration and no car will
//     come (see DEMO_NOTE).

const FIRM = {
  name: 'Tidewell Cars',
  shortName: 'Tidewell',
  town: 'Exmouth',
  county: 'Devon',
  postcodeDistrict: 'EX8',
  phone: '01632 960418',
  phoneHref: 'tel:+441632960418',
  textNumber: '07700 900418',
  founded: 2004,
  // 48 cars from one control room: hackney carriage taxis (roof lights, on
  // the ranks, can be hailed) and private hire cars (booked in advance).
  // Tom's decision of 15/10/2026. The two add up to the fleet.
  fleet: 48,
  taxis: 30,
  privateHire: 18,
  wheelchairCars: 6,
  // Where we drop and collect most days. Used in copy and in areaServed.
  area: ['Exmouth', 'Lympstone', 'Budleigh Salterton', 'Woodbury', 'Topsham', 'Exeter'],
  geo: { lat: 50.6195, lng: -3.4140 },
  arringtonUrl: 'https://www.arringtonconsultancy.com/taxi-and-private-hire-operators/websites'
};

const DEMO_NOTE = 'This is a demonstration site built by Arrington Consultancy. Tidewell Cars is not a real firm, bookings go to a test system, and no car will come.';

function yearsRunning(now = new Date()) {
  return now.getFullYear() - FIRM.founded;
}

module.exports = { FIRM, DEMO_NOTE, yearsRunning };
