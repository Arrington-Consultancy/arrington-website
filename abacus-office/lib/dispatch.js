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

// What a job must carry before it can be booked anywhere. The reading gives
// most of it; a member of staff fills or corrects the rest on the form.
const REQUIRED = [['date', 'a date'], ['time', 'a pickup time'], ['pickup', 'a pickup address'], ['destination', 'a destination'], ['name', 'the passenger\'s name'], ['phone', 'a phone number']];

function cleanJob(input) {
  const s = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const job = {
    date: s(input.date, 10), time: s(input.time, 5), pickup: s(input.pickup, 160), destination: s(input.destination, 160),
    name: s(input.name, 80), phone: s(input.phone, 30), passengers: s(input.passengers, 3) || '1', vehicle: s(input.vehicle, 60) || 'Car (up to 4)', notes: s(input.notes, 300)
  };
  const missing = REQUIRED.filter(([k]) => !job[k]).map(([, label]) => label);
  if (job.date && !/^\d{4}-\d{2}-\d{2}$/.test(job.date)) missing.push('a date as YYYY-MM-DD');
  if (job.time && !/^\d{2}:\d{2}$/.test(job.time)) missing.push('a time as HH:MM');
  return { job, missing };
}

function standinDriver(store, prefix) {
  return {
    name: 'standin',
    label: LABELS.standin,
    live: false,
    async book({ job, kase, brand, actor }) {
      const ref = await store.nextDispatchRef(prefix);
      await store.insertDispatchBooking({ ref, caseId: kase ? kase.id : null, brand, job, actor });
      return { ref };
    }
  };
}

function icabbiDriver(env = process.env) {
  const have = (k) => Boolean(String(env[k] || '').trim());
  const configured = have('ABACUS_OFFICE_ICABBI_API_KEY') && have('ABACUS_OFFICE_ICABBI_SECRET') && have('ABACUS_OFFICE_ICABBI_BASE_URL');
  return {
    name: 'icabbi',
    label: LABELS.icabbi,
    live: true,
    configured,
    async book() {
      if (!configured) throw new DispatchNotConnected('iCabbi is not connected yet. It needs API access on the firm\'s own iCabbi account (ABACUS_OFFICE_ICABBI_BASE_URL, _API_KEY and _SECRET on this service). Nothing was booked.');
      // Written against iCabbi's booking API once the first operator's
      // access is in hand; the request shape depends on their account.
      throw new DispatchNotConnected('The iCabbi booking call is not written yet. Nothing was booked.');
    }
  };
}

function createDispatch({ store, env = process.env, prefix = 'AB' } = {}) {
  const name = driverName(env);
  return name === 'icabbi' ? icabbiDriver(env) : standinDriver(store, prefix);
}

function describeDispatchStatus(env = process.env) {
  const name = driverName(env);
  if (name === 'standin') return 'Abacus office dispatch: stand-in (bookings are recorded in this office only; no live dispatch system is connected)';
  const d = icabbiDriver(env);
  return `Abacus office dispatch: iCabbi, ${d.configured ? 'credentials present, booking call not yet written' : 'NOT connected (needs ABACUS_OFFICE_ICABBI_BASE_URL, _API_KEY, _SECRET)'}`;
}

module.exports = { createDispatch, describeDispatchStatus, driverName, cleanJob, LABELS, DispatchNotConnected, REQUIRED };
