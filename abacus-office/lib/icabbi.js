'use strict';

// The iCabbi booking API, written against iCabbi's published specification
// (api.icabbi.com/docs, version 242, base path /v2) before the firm's keys
// exist, so it works the day Dan's account has API access (Tom, 10 November
// 2026). Requested by Dan for his own office system, on his own account.
//
// What it uses, and nothing else:
//   POST /bookings/check        validates a booking without saving it
//   GET  /bookings/upcoming     what is already on the board for a phone
//   POST /bookings/add/         adds the booking (permission BOOKINGS_CREATE)
//   GET  /bookings/index/{id}   one booking, for its status
//   POST /bookings/cancel/{id}  cancels an upcoming booking
//   GET  /config/vehicletypes   the firm's own vehicle type keys
// Basic auth with the account's app key and secret key, both held only on
// the server (ABACUS_OFFICE_ICABBI_API_KEY and _SECRET). Every response is
// iCabbi's envelope: { code, body, warnings } or { error: true, message }.

const TIMEOUT_MS = 15000;

class IcabbiError extends Error {
  constructor(message, { status = null, uncertain = false } = {}) {
    super(message);
    this.code = 'REFUSED';
    this.status = status;
    // True when the request may have reached iCabbi and done its work
    // (a timeout on an add): staff must look at the board before retrying.
    this.uncertain = uncertain;
  }
}

function settings(env = process.env) {
  const v = (k) => String(env[k] || '').trim();
  const base = v('ABACUS_OFFICE_ICABBI_BASE_URL').replace(/\/+$/, '');
  return {
    base,
    key: v('ABACUS_OFFICE_ICABBI_API_KEY'),
    secret: v('ABACUS_OFFICE_ICABBI_SECRET'),
    // Bookings are written only when this is exactly "true". Until then the
    // office runs iCabbi's own check and the board check, and stops there:
    // a first test against the firm's real account sends no car anywhere.
    writes: v('ABACUS_OFFICE_ICABBI_LIVE_WRITES') === 'true',
    vehicleTypes: parseVehicleMap(v('ABACUS_OFFICE_ICABBI_VEHICLE_TYPES')),
    siteId: /^\d+$/.test(v('ABACUS_OFFICE_ICABBI_SITE_ID')) ? Number(v('ABACUS_OFFICE_ICABBI_SITE_ID')) : null
  };
}

const configured = (s) => Boolean(s.base && s.key && s.secret && /^https:\/\//.test(s.base));
function missing(s) {
  const out = [];
  if (!s.base) out.push('ABACUS_OFFICE_ICABBI_BASE_URL');
  else if (!/^https:\/\//.test(s.base)) out.push('ABACUS_OFFICE_ICABBI_BASE_URL as an https address');
  if (!s.key) out.push('ABACUS_OFFICE_ICABBI_API_KEY');
  if (!s.secret) out.push('ABACUS_OFFICE_ICABBI_SECRET');
  return out;
}

// "Car (up to 4)=R4; 8 seater=MPV8" -> { 'car (up to 4)': 'R4', ... }. The
// keys are the firm's own, read from GET /config/vehicletypes.
function parseVehicleMap(text) {
  const out = {};
  for (const part of String(text || '').split(/[;\n]/)) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const label = part.slice(0, i).trim().toLowerCase();
    const key = part.slice(i + 1).trim();
    if (label && /^[A-Za-z0-9_-]{1,20}$/.test(key)) out[label] = key;
  }
  return out;
}

// A UK number as E.164, which is what iCabbi asks for. Anything it cannot
// be sure of is refused rather than guessed.
function toE164(phone) {
  let p = String(phone || '').replace(/[\s()-]/g, '');
  if (/^00\d/.test(p)) p = `+${p.slice(2)}`;
  if (/^0[1-37]\d{8,9}$/.test(p)) p = `+44${p.slice(1)}`;
  if (/^\+44[1-37]\d{8,9}$/.test(p)) return p;
  if (/^\+[1-9]\d{7,14}$/.test(p) && !p.startsWith('+44')) return p;
  return null;
}

// "YYYY-MM-DD" and "HH:MM" in London time -> ISO 8601 with London's offset
// for that day (BST or GMT).
function londonIso(date, time) {
  const [y, m, d] = String(date).split('-').map(Number);
  const [hh, mm] = String(time).split(':').map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) return null;
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const offsetMin = Math.round((shown - guess) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const a = Math.abs(offsetMin);
  return `${date}T${time}:00${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

// The office's job as iCabbi's booking. Refuses (never guesses) a phone it
// cannot write as E.164 or a vehicle with no iCabbi type set.
function toBooking(job, s, { ref, idempotencyKey, actorName } = {}) {
  const phone = toE164(job.phone);
  if (!phone) throw new IcabbiError(`The phone number "${job.phone}" is not one iCabbi will take. Correct it and try again. Nothing was booked.`);
  const date = londonIso(job.date, job.time);
  if (!date) throw new IcabbiError('The date or time could not be read. Nothing was booked.');
  const vehicle = String(job.vehicle || '').trim();
  const vehicleKey = s.vehicleTypes[vehicle.toLowerCase()];
  if (!vehicleKey && vehicle && !/^car \(up to 4\)$/i.test(vehicle)) {
    throw new IcabbiError(`No iCabbi vehicle type is set for "${vehicle}", so it could go out as an ordinary car. Nothing was booked. Arrington sets the vehicle types once.`);
  }
  const n = Number(job.passengers);
  const instructions = [
    `${n} passenger${n === 1 ? '' : 's'}.`,
    job.notes ? String(job.notes).trim().replace(/([^.!?])$/, '$1.') : '',
    actorName ? `Booked from the office by ${actorName}.` : ''
  ].filter(Boolean).join(' ').slice(0, 250);
  const booking = {
    date,
    name: job.name,
    phone,
    address: { formatted: job.pickup },
    destination: { formatted: job.destination },
    instructions
  };
  if (job.flight) booking.flight_number = String(job.flight).replace(/\s+/g, '').toUpperCase();
  if (vehicleKey) booking.vehicle_type = vehicleKey;
  if (s.siteId) booking.site_id = s.siteId;
  if (ref) booking.external_booking_id = ref;
  if (idempotencyKey) booking.idempotency_key = idempotencyKey;
  return booking;
}

// The shape /bookings/check takes (BookingSimpleCreate).
const simple = (b) => ({ date: b.date, name: b.name, phone: b.phone, address: b.address, destination: b.destination });

// What staff are told each iCabbi status means.
const STATUS_WORDS = {
  NEW: 'in dispatch, no driver yet',
  ASSIGN: 'driver assigned',
  ENROUTE: 'driver on the way',
  ARRIVED: 'driver at the pickup',
  WAIT: 'driver waiting',
  MADECONTACT: 'passenger picked up',
  DROPPINGOFF: 'dropping off',
  FOLLOWON: 'driver finishing another job first',
  PAUSE: 'paused', PAUSED: 'paused',
  BACKTOBASE: 'sent back to dispatch',
  TRANSFERRED: 'transferred',
  NOSHOW: 'no show',
  COMPLETE: 'completed', COMPLETED: 'completed',
  CUSTOMER_CANCELLED: 'cancelled by the customer',
  DRIVER_CANCELLED: 'cancelled by the driver',
  DISPATCH_CANCELLED: 'cancelled by dispatch'
};
const FINAL = new Set(['NOSHOW', 'COMPLETE', 'COMPLETED', 'CUSTOMER_CANCELLED', 'DRIVER_CANCELLED', 'DISPATCH_CANCELLED']);
const statusWords = (st) => STATUS_WORDS[String(st || '').toUpperCase()] || (st ? `status ${String(st).slice(0, 30)}` : 'status not known');

function createClient(env = process.env, { fetch = globalThis.fetch } = {}) {
  const s = settings(env);
  const auth = `Basic ${Buffer.from(`${s.key}:${s.secret}`).toString('base64')}`;

  async function call(method, path, body, { mayHaveActed = false } = {}) {
    if (!configured(s)) throw new IcabbiError(`iCabbi is not connected yet (still needed: ${missing(s).join(', ')}). Nothing was booked.`);
    let res;
    try {
      res = await fetch(s.base + path, {
        method,
        headers: { Authorization: auth, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (e) {
      if (mayHaveActed) throw new IcabbiError('iCabbi did not answer in time, so the booking may or may not have gone in. Look on the board before trying again.', { uncertain: true });
      throw new IcabbiError('iCabbi could not be reached just now. Nothing was booked. Try again in a minute.');
    }
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) {
      const why = String(j.message || `HTTP ${res.status}`).replace(/\s+/g, ' ').slice(0, 200);
      if (res.status === 401 || res.status === 403) throw new IcabbiError(`iCabbi refused the office's keys (${why}). Nothing was booked.`, { status: res.status });
      if (res.status >= 500 && mayHaveActed) throw new IcabbiError(`iCabbi had a problem (${why}), so the booking may or may not have gone in. Look on the board before trying again.`, { status: res.status, uncertain: true });
      throw new IcabbiError(`iCabbi said: ${why}. Nothing was booked.`, { status: res.status });
    }
    return { body: j.body || {}, warnings: Array.isArray(j.warnings) ? j.warnings : [] };
  }

  return {
    settings: s,
    configured: () => configured(s),
    missing: () => missing(s),
    check: (booking) => call('POST', '/bookings/check', simple(booking)),
    // What is already on the board for this phone on that day.
    async upcomingFor(phone, date) {
      const q = new URLSearchParams({ phone, from: `${date} 00:00:00`, to: `${date} 23:59:59`, limit: '50' });
      const { body } = await call('GET', `/bookings/upcoming?${q}`);
      return Array.isArray(body.bookings) ? body.bookings : [];
    },
    add: (booking) => call('POST', '/bookings/add/', booking, { mayHaveActed: true }),
    get: (tripId) => call('GET', `/bookings/index/${encodeURIComponent(tripId)}`),
    cancel: (tripId) => call('POST', `/bookings/cancel/${encodeURIComponent(tripId)}`, {}, { mayHaveActed: true }),
    async vehicleTypes() {
      const { body } = await call('GET', '/config/vehicletypes');
      const list = Array.isArray(body) ? body : (body.vehicletypes || body.vehicle_types || body.types || []);
      return (Array.isArray(list) ? list : Object.values(list)).map((t) => ({ key: String(t.key || ''), title: String(t.title || ''), seats: Number(t.seats) || null, wheelchair: Boolean(t.wheelchair) })).filter((t) => t.key);
    }
  };
}

// A booking already on the board for the same phone within 45 minutes of
// this one: the same job taken twice, by phone and by email.
function twinOnBoard(existing, isoDate) {
  const want = Date.parse(isoDate);
  return (existing || []).find((b) => {
    const at = Date.parse(b.date || b.pickup_date || '');
    const st = String(b.status || '').toUpperCase();
    return Number.isFinite(at) && Math.abs(at - want) <= 45 * 60 * 1000 && !/CANCELLED$/.test(st);
  }) || null;
}

module.exports = { createClient, settings, configured, missing, toBooking, toE164, londonIso, parseVehicleMap, twinOnBoard, statusWords, FINAL, IcabbiError, simple };
