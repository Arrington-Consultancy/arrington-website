'use strict';

// How a booking from an email gets into dispatch (Tom's email to Dan,
// 9 November 2026: "a booking from an email goes into dispatch only after
// a member of staff presses the button"; "Nothing goes to a customer and
// nothing gets booked without one of your staff pressing the button").
//
// Drivers, chosen by ABACUS_OFFICE_DISPATCH_DRIVER:
//   standin   the default. Books into this office's own dispatch_bookings
//             table and hands back a reference, so the whole flow (read,
//             check, sign off, book, confirm) can be used before the live
//             connection exists. Nothing leaves this service.
//   icabbi    the live connection, written against iCabbi's booking API
//             once Dan's account has API access (requested by Dan, for his
//             own office system). Until then it refuses every booking with
//             what it needs, and nothing on the office changes.
//
// Whatever the driver, book() is only ever called from the route behind the
// staff sign-off tick. No AI path reaches it.

const LABELS = { standin: 'Stand-in dispatch (this office only)', icabbi: 'iCabbi' };

class DispatchNotConnected extends Error {
  constructor(message) { super(message); this.code = 'REFUSED'; }
}

function driverName(env = process.env) {
  const n = String(env.ABACUS_OFFICE_DISPATCH_DRIVER || 'standin').trim().toLowerCase();
  return LABELS[n] ? n : 'standin';
}

// What a job must carry before it can be booked anywhere, and what a
// booking reply must ask the customer for when the email does not say
// (Tom, 10 November 2026: "when we reply AI to the customer we need to ask
// for phone number, how many people etc"). One list, used by the reading,
// the reply and the booking form, so the three cannot disagree. It is what
// iCabbi's booking API takes: date, time, pickup, destination, the
// passenger's name and phone, how many are travelling (which picks the
// car), and a flight number when the pickup is an airport.
const REQUIRED = [
  ['date', 'a date', 'the date'],
  ['time', 'a pickup time', 'the pickup time'],
  ['pickup', 'a pickup address', 'the full pickup address'],
  ['destination', 'a destination', 'where they are going'],
  ['name', 'the passenger\'s name', 'the passenger\'s name'],
  ['phone', 'a phone number', 'a mobile number for the driver'],
  ['passengers', 'how many passengers', 'how many people are travelling (and any large luggage), so the right size of car is sent']
];
const AIRPORT = /\b(airport|terminal)\b/i;

// What is still missing from a reading of a booking email, worked out in
// plain code from the fields the reading holds, so the reply always asks
// for it whatever the model wrote in its own list. Returns the customer
// facing wording.
function missingFromReading(reading) {
  const r = reading || {}; const j = r.journey || {};
  const have = { date: j.date, time: j.time, pickup: j.pickup, destination: j.destination, name: r.customer_name, phone: r.phone, passengers: j.passengers };
  const out = REQUIRED.filter(([k]) => !String(have[k] || '').trim()).map(([, , ask]) => ask);
  if (j.pickup && AIRPORT.test(j.pickup) && !String(j.flight || '').trim()) out.push('the flight number, so the driver can watch for a late arrival');
  return out;
}

function cleanJob(input) {
  const s = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const job = {
    date: s(input.date, 10), time: s(input.time, 5), pickup: s(input.pickup, 160), destination: s(input.destination, 160),
    name: s(input.name, 80), phone: s(input.phone, 30), passengers: s(input.passengers, 3), vehicle: s(input.vehicle, 60) || 'Car (up to 4)', notes: s(input.notes, 300), flight: s(input.flight, 12)
  };
  const missing = REQUIRED.filter(([k]) => !job[k]).map(([, label]) => label);
  if (job.date && !/^\d{4}-\d{2}-\d{2}$/.test(job.date)) missing.push('a date as YYYY-MM-DD');
  if (job.time && !/^\d{2}:\d{2}$/.test(job.time)) missing.push('a time as HH:MM');
  if (job.passengers && !/^\d{1,2}$/.test(job.passengers)) missing.push('passengers as a number');
  return { job, missing };
}

function standinDriver(store, prefix) {
  return {
    name: 'standin',
    label: LABELS.standin,
    live: false,
    async book({ job, kase, brand, actor }) {
      // Two jobs booked in the same instant would be given the same next
      // reference; the second simply takes the one after.
      for (let attempt = 0; ; attempt += 1) {
        const ref = await store.nextDispatchRef(prefix, attempt);
        try {
          await store.insertDispatchBooking({ ref, caseId: kase ? kase.id : null, brand, job, actor });
          return { ref, status: 'booked', statusWords: 'recorded in this office' };
        } catch (e) {
          if (e.code !== '23505' || attempt >= 8) throw e;
        }
      }
    },
    async cancel({ ref }) {
      await store.setDispatchStatus(ref, { status: 'cancelled', dispatchStatus: 'CANCELLED' });
      return { statusWords: 'cancelled' };
    },
    async update({ ref, job }) {
      await store.updateDispatchJob(ref, job);
      return { statusWords: 'changed in this office' };
    },
    async status() { return null; }
  };
}

// The live iCabbi connection (./icabbi.js). A booking goes in only after a
// member of staff has ticked the sign-off and pressed the button, and only
// once iCabbi's own check has passed and the board shows no booking for the
// same phone within 45 minutes. With ABACUS_OFFICE_ICABBI_LIVE_WRITES not
// "true" it stops after those two checks and writes nothing.
function icabbiDriver(env = process.env, { store, fetch } = {}) {
  const icabbi = require('./icabbi');
  const client = icabbi.createClient(env, fetch ? { fetch } : {});
  const s = client.settings;
  return {
    name: 'icabbi',
    label: LABELS.icabbi,
    live: true,
    get configured() { return client.configured(); },
    writes: s.writes,
    client,
    async book({ job, kase, brand, actor }) {
      if (!client.configured()) throw new DispatchNotConnected(`iCabbi is not connected yet. It needs API access on the firm's own iCabbi account (${client.missing().join(', ')} on this service). Nothing was booked.`);
      const prior = store && kase ? await store.dispatchBookingsForCase(kase.id) : [];
      const ref = `${String(brand || 'office').slice(0, 12)}-${kase ? kase.id : 'x'}-${prior.length + 1}`;
      const actorName = actor ? (actor.display_name || actor.username) : '';
      const booking = icabbi.toBooking(job, s, { ref, idempotencyKey: `office-${ref}`, actorName });
      await client.check(booking);
      const twin = icabbi.twinOnBoard(await client.upcomingFor(booking.phone, job.date), booking.date);
      if (twin) {
        const at = String(twin.date || twin.pickup_date || '').slice(11, 16);
        throw new DispatchNotConnected(`iCabbi already has a booking for ${booking.phone}${at ? ` at ${at}` : ''}${twin.trip_id ? ` (trip ${twin.trip_id})` : ''}${twin.address && twin.address.formatted ? ` from ${twin.address.formatted}` : ''}. It looks like the same job, so nothing was booked. Check the board.`);
      }
      if (!s.writes) {
        const e = new DispatchNotConnected('iCabbi checked these details and accepted them, and nothing on the board clashes. Live booking is switched off on this office, so nothing went into iCabbi.');
        e.checkedOnly = true;
        throw e;
      }
      const { body } = await client.add(booking);
      const b = body.booking || {};
      const tripId = String(b.trip_id || b.perma_id || b.id || '').slice(0, 40);
      if (!tripId) throw new DispatchNotConnected('iCabbi took the booking but did not say its trip number. Look it up on the board before doing anything else.');
      if (store) await store.insertDispatchBooking({ ref: tripId, caseId: kase ? kase.id : null, brand, job, actor, externalId: tripId, dispatchStatus: String(b.status || 'NEW') });
      return { ref: tripId, status: String(b.status || 'NEW'), statusWords: icabbi.statusWords(b.status || 'NEW') };
    },
    async cancel({ ref }) {
      if (!client.configured()) throw new DispatchNotConnected(`iCabbi is not connected yet. It needs API access on the firm's own iCabbi account (${client.missing().join(', ')} on this service). Nothing was cancelled.`);
      if (!s.writes) {
        const e = new DispatchNotConnected('Live booking is switched off on this office, so nothing was cancelled in iCabbi. Cancel it on the board.');
        e.checkedOnly = true;
        throw e;
      }
      const { body } = await client.cancel(ref);
      if (store) await store.setDispatchStatus(ref, { status: 'cancelled', dispatchStatus: 'DISPATCH_CANCELLED' });
      const fee = Array.isArray(body.fee) && body.fee.length ? ' iCabbi recorded a cancellation fee on it.' : '';
      return { statusWords: `cancelled in iCabbi.${fee}` };
    },
    // A change to a booking already in iCabbi: iCabbi's own check first,
    // then the update, only with live writes switched on.
    async update({ ref, job, actor }) {
      if (!client.configured()) throw new DispatchNotConnected(`iCabbi is not connected yet (${client.missing().join(', ')}). Nothing was changed.`);
      const actorName = actor ? (actor.display_name || actor.username) : '';
      const booking = icabbi.toBooking(job, s, { actorName });
      await client.check(booking);
      if (!s.writes) {
        const e = new DispatchNotConnected('iCabbi checked the changed details and accepted them. Live booking is switched off on this office, so nothing was changed in iCabbi.');
        e.checkedOnly = true;
        throw e;
      }
      await client.update(ref, booking);
      if (store) await store.updateDispatchJob(ref, job);
      return { statusWords: 'changed in iCabbi' };
    },
    // -> { status, words, final, driver } for one trip, read live.
    async status(ref) {
      const { body } = await client.get(ref);
      const b = body.booking || {};
      const st = String(b.status || '').toUpperCase();
      const driver = b.driver && (b.driver.name || b.driver.ref) ? String(b.driver.name || b.driver.ref).slice(0, 60) : '';
      const vehicle = b.vehicle && (b.vehicle.ref || b.vehicle.reg) ? String(b.vehicle.ref || b.vehicle.reg).slice(0, 20) : '';
      return { status: st, words: icabbi.statusWords(st), final: icabbi.FINAL.has(st), driver, vehicle };
    }
  };
}

function createDispatch({ store, env = process.env, prefix = 'AB', fetch } = {}) {
  const name = driverName(env);
  return name === 'icabbi' ? icabbiDriver(env, { store, fetch }) : standinDriver(store, prefix);
}

function describeDispatchStatus(env = process.env) {
  const name = driverName(env);
  if (name === 'standin') return 'Abacus office dispatch: stand-in (bookings are recorded in this office only; no live dispatch system is connected)';
  const icabbi = require('./icabbi');
  const s = icabbi.settings(env);
  if (!icabbi.configured(s)) return `Abacus office dispatch: iCabbi, NOT connected (needs ${icabbi.missing(s).join(', ')})`;
  const types = Object.keys(s.vehicleTypes).length;
  return `Abacus office dispatch: iCabbi at ${s.base}, keys present; ${s.writes ? 'LIVE: signed-off bookings go into iCabbi' : 'check only: iCabbi checks each booking and nothing is written (ABACUS_OFFICE_ICABBI_LIVE_WRITES is not true)'}; ${types ? `${types} vehicle type${types === 1 ? '' : 's'} mapped` : 'no vehicle types mapped, so only ordinary cars can be booked'}`;
}

module.exports = { createDispatch, describeDispatchStatus, driverName, cleanJob, missingFromReading, LABELS, DispatchNotConnected, REQUIRED };
