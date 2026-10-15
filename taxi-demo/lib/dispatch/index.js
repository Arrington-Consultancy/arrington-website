'use strict';

// The dispatch adapter: the one place the website hands a booking to the
// operator's dispatch system. Everything above it (the form, the quote, the
// confirmation page) talks to this interface and never to a vendor API, so
// connecting a real operator means writing one driver file, not touching the
// site.
//
// A driver is an object with:
//   name                    short id, e.g. 'mock', 'icabbi'
//   label                   what the operator would call it
//   configured()            true when it has what it needs to run
//   createBooking(booking)  -> { ref, status, receivedAt }
//                           Hands one validated booking (see
//                           lib/booking.js toDispatch) to dispatch. Resolves
//                           only once dispatch has the job: the reference it
//                           returns is the dispatch system's own job id.
//   getBooking(ref)         -> { ref, status, driver?, etaMinutes?, updatedAt }
//                           status is one of STATUSES.
//   cancelBooking(ref)      -> { ref, status: 'cancelled' }
//
// The demo runs the mock driver (lib/dispatch/mock.js), a stand-in for a
// dispatch system that takes the job, has a controller confirm it and
// allocates a car a few seconds later. The iCabbi, Autocab and Cordic files
// are the slots where the real connections go; each refuses to run until it
// is configured and written, rather than pretending to book.

const STATUSES = ['received', 'confirmed', 'allocated', 'arrived', 'completed', 'cancelled'];

const DRIVERS = {
  mock: () => require('./mock'),
  icabbi: () => require('./icabbi'),
  autocab: () => require('./autocab'),
  cordic: () => require('./cordic')
};

class DispatchNotConfigured extends Error {
  constructor(label, needs) {
    super(`${label} is not connected yet. ${needs}`);
    this.name = 'DispatchNotConfigured';
    this.code = 'DISPATCH_NOT_CONFIGURED';
  }
}

function createDispatch(name = process.env.DISPATCH_DRIVER || 'mock', options = {}) {
  const make = DRIVERS[String(name).toLowerCase()];
  if (!make) throw new Error(`Unknown dispatch driver "${name}". Known: ${Object.keys(DRIVERS).join(', ')}`);
  const mod = make();
  return mod.create ? mod.create(options) : mod;
}

module.exports = { createDispatch, DispatchNotConfigured, STATUSES, DRIVERS };
