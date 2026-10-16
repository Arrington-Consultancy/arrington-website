'use strict';

// How the office's Bookings worker puts a job into dispatch (Tom,
// 16/10/2026: "we could then use the icabbi api to book jobs in").
//
// The office books through a connection, never by writing to a board
// directly, so on a live office the same button books into the firm's own
// iCabbi, Autocab or Cordic system. Those connections are the website's
// (taxi-demo/lib/dispatch): one connection per firm serves the booking
// website and the office alike, and the slots there refuse every call until
// they are written against the vendor's API with the operator's access.
//
// Drivers:
//   demo                       the visitor's own copy of the made-up board
//                              (lib/taxiOffice/data.js seedBoard). Default.
//   icabbi, autocab, cordic    the website's dispatch slots.
//
// Chosen by TAXI_OFFICE_DISPATCH_DRIVER. A refusal from a slot reaches the
// person as its own message ("iCabbi is not connected yet. It needs...")
// and nothing on the board changes.

const { createDispatch, DispatchNotConfigured } = require('../../taxi-demo/lib/dispatch');

const LABELS = { demo: 'Demo dispatch', icabbi: 'iCabbi', autocab: 'Autocab', cordic: 'Cordic' };

function driverName(env = process.env) {
  const n = String(env.TAXI_OFFICE_DISPATCH_DRIVER || 'demo').trim().toLowerCase();
  return LABELS[n] ? n : 'demo';
}

// The demo driver works on the visitor's own board in their office state.
function demoDriver() {
  let next = 41300;
  return {
    name: 'demo',
    label: LABELS.demo,
    async addJob(s, job) {
      s.nextRef = Math.max(s.nextRef || next, next) + 1;
      const added = { ...job, ref: `TW-${s.nextRef}`, status: 'booked', changed: 'added' };
      s.board.push(added);
      return added;
    },
    async updateJob(s, ref, changes) {
      const job = s.board.find((x) => x.ref === ref);
      if (!job) throw new Error(`${ref} is not on the board.`);
      Object.assign(job, changes, { changed: 'updated' });
      return job;
    },
    async cancelJob(s, ref) {
      const job = s.board.find((x) => x.ref === ref);
      if (!job) throw new Error(`${ref} is not on the board.`);
      job.status = 'cancelled';
      job.changed = 'cancelled';
      return job;
    }
  };
}

// A real system through the website's slot. The slot's contract is
// createBooking and cancelBooking; changing a booking is added to it when
// the first real driver is written, so until then it refuses here too.
function slotDriver(name) {
  const slot = createDispatch(name);
  const label = LABELS[name];
  return {
    name,
    label,
    async addJob(s, job) {
      const res = await slot.createBooking({ ...job, source: 'Office' });
      return { ...job, ref: res.ref, status: 'booked', changed: 'added' };
    },
    async updateJob() {
      if (!slot.configured()) return slot.getBooking(); // the slot's own refusal, with what it needs
      throw new DispatchNotConfigured(label, 'Changing a booking through this connection is not written yet.');
    },
    async cancelJob(s, ref) {
      await slot.cancelBooking(ref);
      return { ref, status: 'cancelled' };
    }
  };
}

function createOfficeDispatch(name = driverName()) {
  return name === 'demo' ? demoDriver() : slotDriver(name);
}

function describeDispatchStatus(env = process.env) {
  const name = driverName(env);
  return name === 'demo'
    ? 'Taxi office dispatch: demo (each visitor gets their own copy of the made-up board)'
    : `Taxi office dispatch: ${LABELS[name]} through the website's dispatch slot (refuses until written against the vendor's API)`;
}

module.exports = { createOfficeDispatch, describeDispatchStatus, driverName, LABELS, DispatchNotConfigured };
