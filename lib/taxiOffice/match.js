'use strict';

// Plain code, no AI: does what the email asks for match what the booking
// software holds? The AI reads the email into booking details; this decides,
// field by field, whether dispatch already has it right. Kept separate so
// the judgement that matters ("is this job keyed in wrong?") is exact and
// testable, and never a model's opinion.

const { resolvePlace, norm } = require('../../taxi-demo/lib/places');
const fares = require('../../taxi-demo/lib/fares');

const VEHICLE_LABELS = {
  saloon: 'Car', estate: 'Estate', mpv6: '6-seater', mpv8: '8-seater', executive: 'Executive', wav: 'Wheelchair accessible'
};

const digits = (s) => String(s || '').replace(/\D+/g, '').replace(/^44/, '0');

function surname(name) {
  const parts = norm(name).split(' ').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

// Two addresses refer to the same place when they resolve to the same
// listed place, when either is only a town and both are in that town, or
// when one simply contains the other ("Budleigh Salterton" and
// "Budleigh Salterton, Fore Street").
function samePlace(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return true;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const pa = resolvePlace(a);
  const pb = resolvePlace(b);
  if (pa && pb) {
    if (pa.id === pb.id) return true;
    if ((pa.match === 'town' || pb.match === 'town') && pa.area === pb.area) return true;
  }
  return false;
}

// Only the vehicles a customer has to get are compared; "a taxi" is not a
// request for a saloon over an estate.
const SPECIAL_VEHICLES = new Set(['wav', 'mpv6', 'mpv8', 'executive']);

function diffJourney(journey, job) {
  const diffs = [];
  const add = (field, label, email, board) => diffs.push({ field, label, email, board });
  if (journey.date && journey.date !== job.date) add('date', 'Date', journey.date, job.date);
  if (journey.time && journey.time !== job.time) add('time', 'Pickup time', journey.time, job.time);
  if (journey.pickup && !samePlace(journey.pickup, job.pickup)) add('pickup', 'Pickup', journey.pickup, job.pickup);
  if (journey.destination && !samePlace(journey.destination, job.destination)) add('destination', 'Destination', journey.destination, job.destination);
  if (journey.passengers > 0 && Number(journey.passengers) !== Number(job.passengers)) add('passengers', 'Passengers', String(journey.passengers), String(job.passengers));
  if (SPECIAL_VEHICLES.has(journey.vehicle) && journey.vehicle !== job.vehicle) {
    add('vehicle', 'Vehicle', VEHICLE_LABELS[journey.vehicle], VEHICLE_LABELS[job.vehicle] || job.vehicle);
  }
  return diffs;
}

const minutes = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// The job on the board this journey is about, or null. A quoted reference
// wins; then the same phone number on the same day; for a change, the same
// phone number on any day; then the same surname on the same day. Jobs
// already matched to another leg of the same email are not reused.
function findJob(extraction, journey, board, used) {
  const free = board.filter((j) => !used.has(j.ref));
  const ref = String(extraction.reference || '').toUpperCase().trim();
  if (ref) {
    const byRef = free.find((j) => j.ref === ref);
    if (byRef) return byRef;
  }
  const phone = digits(extraction.phone);
  const closest = (jobs) => {
    if (jobs.length <= 1) return jobs[0] || null;
    const t = minutes(journey.time);
    if (t === null) return jobs[0];
    return jobs.slice().sort((a, b) => Math.abs(minutes(a.time) - t) - Math.abs(minutes(b.time) - t))[0];
  };
  if (phone) {
    const samePhone = free.filter((j) => digits(j.phone) === phone);
    const sameDay = samePhone.filter((j) => !journey.date || j.date === journey.date);
    if (sameDay.length) return closest(sameDay);
    if (extraction.intent === 'change' && samePhone.length) return closest(samePhone);
  }
  const sn = surname(extraction.customer_name);
  if (sn && journey.date) {
    const bySurname = free.filter((j) => j.date === journey.date && surname(j.name) === sn);
    if (bySurname.length) return closest(bySurname);
  }
  return null;
}

function fareFor(journey) {
  if (!journey.pickup || !journey.destination) return null;
  const when = journey.date && journey.time ? fares.londonToInstant(`${journey.date}T${journey.time}`) : null;
  const est = fares.estimate({ pickup: journey.pickup, destination: journey.destination, vehicle: journey.vehicle || 'saloon', when: when || undefined });
  return est.kind === 'unpriced' ? null : fares.describe(est);
}

// A leg the customer has not given enough to book: no date, no time, no
// pickup, or no way to reach them.
function legGaps(extraction, journey) {
  const gaps = [];
  if (!journey.date) gaps.push('date');
  if (!journey.time) gaps.push('pickup time');
  if (!journey.pickup) gaps.push('pickup address');
  if (!journey.destination) gaps.push('destination');
  if (!digits(extraction.phone)) gaps.push('phone number');
  return gaps;
}

// The completed jobs an email about a past journey could be about, for the
// Complaints and Customer emails workers. A quoted reference wins; then the
// same phone number (on the day, if a day is given); then the same surname
// on the day; otherwise every completed job that day within 90 minutes of
// the time given whose pickup and destination fit. More than one is normal
// for lost property ("about 11pm from Exeter"), and the office shows them
// all rather than guessing which.
function findPastJobs(extraction, journey, board) {
  const done = board.filter((j) => j.status === 'completed');
  const ref = String(extraction.reference || '').toUpperCase().trim();
  if (ref) {
    const byRef = done.filter((j) => j.ref === ref);
    if (byRef.length) return byRef;
  }
  const j0 = journey || {};
  const onDay = (j) => !j0.date || j.date === j0.date;
  const phone = digits(extraction.phone);
  if (phone) {
    const samePhone = done.filter((j) => digits(j.phone) === phone && onDay(j));
    if (samePhone.length) return samePhone;
  }
  const sn = surname(extraction.customer_name);
  if (sn && j0.date) {
    const bySurname = done.filter((j) => j.date === j0.date && surname(j.name) === sn);
    if (bySurname.length) return bySurname;
  }
  if (!j0.date) return [];
  const t = minutes(j0.time);
  return done.filter((j) => j.date === j0.date
    && (t === null || Math.abs(minutes(j.time) - t) <= 90)
    && samePlace(j0.pickup, j.pickup) && samePlace(j0.destination, j.destination))
    .sort((a, b) => a.time.localeCompare(b.time));
}

// What the fare table says for a completed job, at the time it ran and by
// day, so a fare complaint is answered from the tariff and not from memory.
function fareCheck(job) {
  const at = (hhmm) => fares.estimate({ pickup: job.pickup, destination: job.destination, vehicle: job.vehicle || 'saloon', when: fares.londonToInstant(`${job.date}T${hhmm}`) });
  const then = at(job.time);
  const day = at('14:00');
  if (then.kind === 'unpriced' || day.kind === 'unpriced') return null;
  return { then: fares.describe(then), day: fares.describe(day), differs: fares.describe(then) !== fares.describe(day) };
}

// The comparison for one email: one result per leg, and the email's overall
// status (the most serious of its legs).
function compare(extraction, board) {
  if (!extraction) return null;
  const intent = extraction.intent;
  if (intent === 'council') return { status: 'council', legs: [] };
  if (intent === 'complaint') return { status: 'complaint', legs: [] };
  if (intent === 'not_booking' || intent === 'enquiry' || !(extraction.journeys || []).length) {
    return { status: 'not_booking', legs: [] };
  }
  const used = new Set();
  const legs = extraction.journeys.map((journey, index) => {
    const job = findJob(extraction, journey, board, used);
    if (job) used.add(job.ref);
    const fare = fareFor(journey);
    if (intent === 'cancel') {
      if (!job) return { index, journey, job: null, status: 'nothing_to_cancel', diffs: [], fare };
      if (job.status === 'cancelled') return { index, journey, job, status: 'cancelled', diffs: [], fare };
      return { index, journey, job, status: 'to_cancel', diffs: [], fare };
    }
    // For a change the customer only gives what is changing: compare the
    // fields they stated against the job they named.
    const gaps = intent === 'change' && job ? [] : legGaps(extraction, journey);
    if (!job) {
      return { index, journey, job: null, status: gaps.length ? 'needs_details' : 'missing', gaps, diffs: [], fare };
    }
    if (job.status === 'cancelled') return { index, journey, job, status: 'missing', gaps, diffs: [], fare };
    const diffs = diffJourney(journey, job);
    return { index, journey, job, status: diffs.length ? 'differs' : 'match', gaps, diffs, fare };
  });
  const order = ['needs_details', 'missing', 'differs', 'to_cancel', 'nothing_to_cancel', 'cancelled', 'match'];
  const worst = legs.map((l) => l.status).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  const status = (extraction.missing || []).length && worst !== 'to_cancel' ? 'needs_details' : worst;
  return { status, legs };
}

const STATUS = {
  match: { label: 'Matches dispatch', tone: 'ok' },
  differs: { label: 'Keyed in wrong', tone: 'warn' },
  missing: { label: 'Not in dispatch', tone: 'bad' },
  needs_details: { label: 'Needs details', tone: 'warn' },
  to_cancel: { label: 'To cancel', tone: 'warn' },
  nothing_to_cancel: { label: 'No booking to cancel', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'ok' },
  not_booking: { label: 'Customer email', tone: 'neutral' },
  complaint: { label: 'Complaint', tone: 'bad' },
  council: { label: 'For Licensing', tone: 'neutral' },
  unread: { label: 'Not read yet', tone: 'neutral' }
};

module.exports = { compare, diffJourney, findJob, findPastJobs, fareCheck, samePlace, fareFor, STATUS, VEHICLE_LABELS, digits };
