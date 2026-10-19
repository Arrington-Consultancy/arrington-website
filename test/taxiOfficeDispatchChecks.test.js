'use strict';

// Tidewell office (19/10/2026, Tom: "fix demo so it does all of those"): the
// checks against the job in dispatch now cover names, phone numbers, flight
// numbers and the same job booked twice, as well as times, places, people
// and vehicles. Plain code decides each one; a person signs off any change.

const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('../lib/taxiOffice/data');
const match = require('../lib/taxiOffice/match');
const ai = require('../lib/taxiOffice/ai');
const office = require('../lib/taxiOffice/office');

const TODAY = '2026-10-19';
const fields = (leg) => leg.diffs.map((d) => [d.field, d.email, d.board]);

function prepared(id, today = TODAY) {
  return data.seedInbox(today).find((e) => e.id === id).prepared;
}

test('a name keyed wrong, a phone number keyed wrong and a flight number keyed wrong are each named', () => {
  const board = data.seedBoard(TODAY);
  const patel = match.compare(prepared('patel'), board);
  assert.equal(patel.legs[0].job.ref, 'TW-41207');
  assert.deepEqual(fields(patel.legs[0]), [['time', '14:00', '13:00'], ['name', 'Dev Patel', 'Dev Patil']]);
  const ashworth = match.compare(prepared('ashworth'), board);
  assert.equal(ashworth.legs[0].job.ref, 'TW-41218', 'found by surname on the day when the phone number on the job is wrong');
  assert.deepEqual(fields(ashworth.legs[0]), [['flight', 'XR 2214', 'XR 2241'], ['phone', '07700 900615', '07700 900651']]);
  assert.equal(ashworth.status, 'differs');
});

test('the name check is the surname, and the phone check is the digits', () => {
  const job = { ref: 'TW-1', name: 'Margaret Hollis', phone: '07700 900211' };
  assert.deepEqual(match.diffCustomer({ customer_name: 'Mrs Hollis', phone: '+44 7700 900211' }, job), [], 'a title and +44 are not a difference');
  assert.deepEqual(match.diffCustomer({ customer_name: '', phone: '' }, job), [], 'nothing given is not a difference');
  assert.deepEqual(match.diffCustomer({ customer_name: 'Paul Gregory', phone: '07700 900348' }, { name: 'Estuary Joinery (account)', phone: '07700 900348' }), [], 'an account job is in the company name');
  assert.equal(match.diffCustomer({ customer_name: 'Margaret Hollins', phone: '' }, job)[0].field, 'name');
});

test('a flight number is compared on its letters and digits, and only when the email gives one', () => {
  const job = { date: '2026-10-22', time: '16:40', pickup: 'Exeter Airport', destination: 'Exmouth', passengers: 2, vehicle: 'saloon', flight: 'XR 2214' };
  assert.deepEqual(match.diffJourney({ ...job, flight: 'xr2214' }, job), []);
  assert.deepEqual(match.diffJourney({ ...job, flight: '' }, job), []);
  assert.deepEqual(match.diffJourney({ ...job, flight: 'XR 2214' }, { ...job, flight: '' }).map((d) => [d.field, d.board]), [['flight', 'Not on the job']]);
  assert.equal(ai.cleanFlight('xr2214'), 'XR 2214');
  assert.equal(ai.cleanFlight('U2 6721'), 'U2 6721');
  for (const bad of ['2214', 'the 7.10 flight', '', 'XR 22145', 'ABCD 12']) assert.equal(ai.cleanFlight(bad), '', bad);
});

test('the same job booked twice is found, on any day of the week, and the later booking is the extra one', () => {
  for (let n = 0; n < 7; n++) {
    const today = data.addDays('2026-10-12', n);
    const board = data.seedBoard(today);
    const reid = match.compare(prepared('reid', today), board);
    assert.equal(reid.status, 'duplicate', today);
    assert.equal(reid.legs[0].job.ref, 'TW-41194');
    assert.deepEqual(reid.legs[0].duplicates.map((d) => d.ref), ['TW-41196']);
    assert.deepEqual([...match.duplicateRefs(board)], [['TW-41196', 'TW-41194']], 'the only pair on the board');
  }
});

test('not booked twice: a different pickup, more than 30 minutes apart, a different customer, or a cancelled job', () => {
  const a = { ref: 'TW-1', status: 'booked', date: '2026-10-20', time: '12:30', name: 'Owen Reid', phone: '07700 900253', pickup: 'Fore Street, Budleigh Salterton', destination: 'Exmouth', passengers: 1, vehicle: 'saloon' };
  const twin = { ...a, ref: 'TW-2' };
  assert.deepEqual(match.duplicatesOf(a, [a, twin]).map((d) => d.ref), ['TW-2']);
  assert.deepEqual(match.duplicatesOf(a, [a, { ...twin, pickup: 'Exeter Airport' }]), []);
  assert.deepEqual(match.duplicatesOf(a, [a, { ...twin, time: '13:05' }]), []);
  assert.deepEqual(match.duplicatesOf(a, [a, { ...twin, phone: '07700 900111', name: 'Ann Reid' }]), []);
  assert.deepEqual(match.duplicatesOf(a, [a, { ...twin, status: 'cancelled' }]), []);
  // Two legs of one email are not each other's duplicate (an outward and a
  // return at the same time from the same place would be odd, but it is the
  // email's own business).
  const cmp = match.compare({ intent: 'new_booking', customer_name: 'Owen Reid', phone: '07700 900253', journeys: [
    { date: a.date, time: a.time, pickup: a.pickup, destination: 'Exmouth', passengers: 1, vehicle: 'saloon' },
    { date: a.date, time: a.time, pickup: a.pickup, destination: 'Exmouth', passengers: 1, vehicle: 'saloon' }
  ], missing: [] }, [a, twin]);
  assert.deepEqual(cmp.legs.map((l) => l.status), ['match', 'match']);
});

test('signing off the duplicate cancels the extra booking and keeps the first; corrections put the name, phone and flight right', async () => {
  const s = office.stateFor('test-dup-' + Date.now());
  const email = (id) => office.inbox(s).find((e) => e.id === id);
  for (const id of ['reid', 'patel', 'ashworth']) s.readings[id] = { data: email(id).prepared, source: 'prepared' };
  assert.ok(office.emailsToDealWith(s).some((e) => e.id === 'reid'), 'a duplicate is something to deal with');
  const unsigned = await office.fixLeg(s, email('reid'), 0);
  assert.equal(unsigned.ok, false);
  assert.equal(s.board.find((j) => j.ref === 'TW-41196').status, 'booked', 'nothing changes without a sign-off');
  const SIGN = { signedOff: true, by: 'tom' };
  const done = await office.fixLeg(s, email('reid'), 0, SIGN);
  assert.equal(done.ok, true);
  assert.match(done.message, /TW-41196 cancelled in dispatch: it was the same job as TW-41194, which stays\./);
  assert.equal(s.board.find((j) => j.ref === 'TW-41196').status, 'cancelled');
  assert.equal(s.board.find((j) => j.ref === 'TW-41194').status, 'booked');
  assert.match(s.changes[0].what, /^Cancelled as a duplicate of TW-41194\. Signed off by tom/);
  assert.equal(office.readingStatus(s, email('reid')).key, 'match');
  assert.equal(match.duplicateRefs(s.board).size, 0);

  assert.equal((await office.fixLeg(s, email('patel'), 0, SIGN)).ok, true);
  const patel = s.board.find((j) => j.ref === 'TW-41207');
  assert.deepEqual([patel.name, patel.time], ['Dev Patel', '14:00']);
  assert.equal((await office.fixLeg(s, email('ashworth'), 0, SIGN)).ok, true);
  const ash = s.board.find((j) => j.ref === 'TW-41218');
  assert.deepEqual([ash.phone, ash.flight], ['07700 900615', 'XR 2214']);
  assert.equal(office.readingStatus(s, email('ashworth')).key, 'match');
});

test('a booking made from an email carries its flight number into dispatch', async () => {
  const s = office.stateFor('test-flight-' + Date.now());
  const email = office.inbox(s).find((e) => e.id === 'ashworth');
  const reading = JSON.parse(JSON.stringify(email.prepared));
  s.board = s.board.filter((j) => j.ref !== 'TW-41218');
  s.readings.ashworth = { data: reading, source: 'prepared' };
  const res = await office.fixLeg(s, email, 0, { signedOff: true, by: 'tom' });
  assert.equal(res.ok, true);
  assert.equal(s.board[s.board.length - 1].flight, 'XR 2214');
});

test('the Bookings worker reads a flight number, and the Checker checks it', () => {
  assert.ok(ai.BOOKING_SCHEMA.properties.journeys.items.required.includes('flight'));
  assert.match(ai.bookingSystem(TODAY), /- flight: the flight number/);
  assert.match(ai.checkSystem(TODAY), /the flight number if the email gives one/);
  assert.ok(ai.CHECK_SCHEMA.properties.issues.items.properties.field.enum.includes('flight'));
  const booking = { ...prepared('ashworth'), journeys: [{ ...prepared('ashworth').journeys[0], flight: 'XR 2241' }] };
  const out = ai.cleanCheck({ issues: [{ journey: 0, field: 'flight', email_says: 'flight XR 2214', should_be: 'xr 2214' }], summary: 'The flight number is wrong.' }, booking);
  assert.deepEqual(out.issues.map((i) => [i.field, i.booking, i.should_be, i.fixable]), [['flight', 'XR 2241', 'XR 2214', true]]);
});
