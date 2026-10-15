'use strict';

// The mock dispatch system the demo books into. It behaves the way a real
// one does from the customer's side: it takes the job and returns its own
// reference, a controller confirms it a moment later, and for a "now" job a
// car is allocated a few seconds after that with a driver, a car and an
// arrival time. A booking for later stays confirmed; on the day the driver's
// details go by text.
//
// Status is worked out from timestamps when asked, not by timers, so it is
// the same answer however often the page polls and the tests can wind the
// clock. The only timer is the one that writes the "driver on the way" text
// to the log at the moment it would be sent.
//
// Jobs are held in memory and dropped after two hours. Nothing is written to
// disk and nothing leaves the process.

const crypto = require('crypto');

// Invented drivers and cars. The registrations use the DMO/TWC letters so
// they read as plates without being chosen to match any real car.
const FLEET = {
  saloon: [
    { name: 'Dave', car: 'Silver Toyota Corolla', reg: 'WA73 TWC' },
    { name: 'Sarah', car: 'White Kia Niro', reg: 'WK24 DMO' },
    { name: 'Marek', car: 'Grey Skoda Octavia', reg: 'WF22 TWC' },
    { name: 'Jen', car: 'Black Toyota Prius', reg: 'WJ23 DMO' }
  ],
  estate: [
    { name: 'Pete', car: 'Grey Skoda Octavia Estate', reg: 'WP72 TWC' },
    { name: 'Lisa', car: 'Silver Toyota Corolla Touring', reg: 'WL24 DMO' }
  ],
  mpv6: [{ name: 'Gary', car: 'Black Toyota Proace Verso, 6 seats', reg: 'WG23 TWC' }],
  mpv8: [{ name: 'Rob', car: 'Silver Ford Tourneo Custom, 8 seats', reg: 'WR22 DMO' }],
  executive: [{ name: 'Andrew', car: 'Black Mercedes E-Class', reg: 'WE24 TWC' }],
  wav: [{ name: 'Kim', car: 'White Peugeot e-Rifter, wheelchair accessible', reg: 'WK73 DMO' }]
};

const TWO_HOURS = 2 * 60 * 60 * 1000;
const NOW_WINDOW = 45 * 60 * 1000; // a job due within 45 minutes is dispatched now

function create(options = {}) {
  const now = options.now || (() => Date.now());
  const confirmAfterMs = options.confirmAfterMs ?? Number(process.env.MOCK_CONFIRM_MS || 2500);
  const allocateAfterMs = options.allocateAfterMs ?? Number(process.env.MOCK_ALLOCATE_MS || 7000);
  const onEvent = options.onEvent || (() => {});
  const random = options.random || Math.random;
  const jobs = new Map();

  function prune() {
    const cutoff = now() - TWO_HOURS;
    for (const [ref, job] of jobs) if (job.receivedAt < cutoff) jobs.delete(ref);
  }

  function newRef() {
    for (let i = 0; i < 20; i++) {
      const ref = 'TW-' + String(crypto.randomInt(10000, 100000));
      if (!jobs.has(ref)) return ref;
    }
    return 'TW-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  // `at` lets the allocation timer ask for the view at the moment it was set
  // for: a timer can fire a millisecond before the wall clock agrees, and the
  // view would then say "confirmed" with no driver.
  function view(job, at) {
    const t = Math.max(now(), at || 0);
    const base = { ref: job.ref, pickupAt: new Date(job.pickupAt).toISOString(), updatedAt: new Date(t).toISOString() };
    if (job.cancelledAt) return { ...base, status: 'cancelled' };
    if (t < job.receivedAt + confirmAfterMs) return { ...base, status: 'received' };
    if (!job.asap || t < job.receivedAt + allocateAfterMs) return { ...base, status: 'confirmed' };
    const allocatedAt = job.receivedAt + allocateAfterMs;
    return {
      ...base,
      status: 'allocated',
      driver: job.driver,
      allocatedAt: new Date(allocatedAt).toISOString(),
      etaMinutes: job.etaMinutes,
      etaAt: new Date(allocatedAt + job.etaMinutes * 60000).toISOString()
    };
  }

  return {
    name: 'mock',
    label: 'Demo dispatch (no real cars)',
    configured: () => true,

    async createBooking(booking) {
      prune();
      if (jobs.size > 5000) throw new Error('Demo dispatch is full; try again shortly');
      const receivedAt = now();
      const pickupAt = booking.pickupAt ? new Date(booking.pickupAt).getTime() : receivedAt;
      const pool = FLEET[booking.vehicle] || FLEET.saloon;
      const job = {
        ref: newRef(),
        receivedAt,
        pickupAt,
        asap: pickupAt - receivedAt <= NOW_WINDOW,
        driver: pool[Math.floor(random() * pool.length)],
        etaMinutes: 4 + Math.floor(random() * 8)
      };
      jobs.set(job.ref, job);
      if (job.asap) {
        const t = setTimeout(() => { if (!job.cancelledAt) onEvent('allocated', view(job, receivedAt + allocateAfterMs)); }, allocateAfterMs);
        if (t.unref) t.unref();
      }
      return { ref: job.ref, status: 'received', receivedAt: new Date(receivedAt).toISOString() };
    },

    async getBooking(ref) {
      const job = jobs.get(ref);
      return job ? view(job) : null;
    },

    async cancelBooking(ref) {
      const job = jobs.get(ref);
      if (!job) return null;
      if (!job.cancelledAt) job.cancelledAt = now();
      return view(job);
    },

    // For tests: how many jobs are held.
    size: () => jobs.size
  };
}

module.exports = { create, FLEET };
