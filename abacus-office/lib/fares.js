'use strict';

// The fare calculator (Tom's email to Dan, 9 November 2026: "a fare
// calculator follows the tariff"). A manager types the company's tariff into
// Settings; staff give the miles, any waiting, the date and time and the
// vehicle, and the office works the fare out from the tariff. It is a guide
// for staff answering a customer: the meter, or a fixed price, decides.
// Nothing here guesses a distance: staff give the miles.
//
// Pure: no database, no clock. Money is in whole pence throughout.

const VEHICLES = ['Car (up to 4)', 'Estate (up to 4, more luggage)', '6 seater', '8 seater', 'Wheelchair accessible'];
const LARGE = new Set(['6 seater', '8 seater']);

// Bank holidays in England and Wales, from GOV.UK, to the end of 2028.
// The Settings page says when the list runs out, so nobody relies on it
// past that date without knowing.
const BANK_HOLIDAYS = new Set([
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
  '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29', '2028-08-28', '2028-12-25', '2028-12-26'
]);
const HOLIDAYS_KNOWN_UNTIL = '2028-12-31';
// Christmas Day, Boxing Day and New Year's Day themselves, whatever day of
// the week they fall on, for a firm whose tariff has a festive rate.
const FESTIVE = (ymd) => /-(12-25|12-26|01-01)$/.test(ymd);

const DEFAULT_TARIFF = {
  flagPence: 0, perMilePence: 0, waitPerMinutePence: 0, minimumPence: 0,
  nightFrom: '23:00', nightTo: '06:00', nightRate: 1.5,
  sundayRate: 1, holidayRate: 1.5, festiveRate: 2, largeRate: 1.5
};

const pence = (pounds) => {
  const t = String(pounds ?? '').replace(/[£,\s]/g, '');
  if (t === '') return 0;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : NaN;
};
const rate = (v, d) => {
  const t = String(v ?? '').trim();
  if (t === '') return d;
  const n = Number(t);
  return Number.isFinite(n) && n >= 1 && n <= 4 ? Math.round(n * 100) / 100 : NaN;
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// What a manager typed -> a tariff, or { error } in plain words.
function readTariff(input) {
  const t = {
    flagPence: pence(input.flag), perMilePence: pence(input.per_mile), waitPerMinutePence: pence(input.wait_per_minute), minimumPence: pence(input.minimum),
    nightFrom: String(input.night_from || DEFAULT_TARIFF.nightFrom), nightTo: String(input.night_to || DEFAULT_TARIFF.nightTo),
    nightRate: rate(input.night_rate, DEFAULT_TARIFF.nightRate), sundayRate: rate(input.sunday_rate, DEFAULT_TARIFF.sundayRate),
    holidayRate: rate(input.holiday_rate, DEFAULT_TARIFF.holidayRate), festiveRate: rate(input.festive_rate, DEFAULT_TARIFF.festiveRate),
    largeRate: rate(input.large_rate, DEFAULT_TARIFF.largeRate)
  };
  for (const k of ['flagPence', 'perMilePence', 'waitPerMinutePence', 'minimumPence']) {
    if (!Number.isInteger(t[k]) || t[k] < 0 || t[k] > 100000) return { error: 'Each charge is pounds and pence, for example 3.60 or 2.20.' };
  }
  if (!t.perMilePence) return { error: 'The tariff needs a charge per mile.' };
  for (const k of ['nightRate', 'sundayRate', 'holidayRate', 'festiveRate', 'largeRate']) {
    if (Number.isNaN(t[k])) return { error: 'Each rate is a number between 1 and 4, for example 1.5 for time and a half.' };
  }
  if (!HHMM.test(t.nightFrom) || !HHMM.test(t.nightTo)) return { error: 'Night hours are 24-hour times, for example 23:00 and 06:00.' };
  return { tariff: t };
}

const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
function isNight(time, t) {
  const at = minutes(time); const from = minutes(t.nightFrom); const to = minutes(t.nightTo);
  if (from === to) return false;
  return from < to ? at >= from && at < to : at >= from || at < to;
}
function weekday(ymd) { return new Date(`${ymd}T12:00:00Z`).getUTCDay(); }

// Which rate a time on a date carries. The highest one that applies wins:
// a firm's festive rate is never undercut by its night rate.
function timeRate(ymd, time, t) {
  const options = [{ name: 'day rate', rate: 1 }];
  if (isNight(time, t)) options.push({ name: 'night rate', rate: t.nightRate });
  if (weekday(ymd) === 0 && t.sundayRate > 1) options.push({ name: 'Sunday rate', rate: t.sundayRate });
  if (BANK_HOLIDAYS.has(ymd)) options.push({ name: 'bank holiday rate', rate: t.holidayRate });
  if (FESTIVE(ymd)) options.push({ name: 'Christmas and New Year rate', rate: t.festiveRate });
  return options.reduce((a, b) => (b.rate > a.rate ? b : a));
}

// Work out a fare. -> { pence, lines: [[label, pence]], rateName, notes } or
// { error }.
function fare(tariff, input) {
  const t = { ...DEFAULT_TARIFF, ...(tariff || {}) };
  if (!t.perMilePence) return { error: 'No tariff has been set for this company yet. A manager adds it in Settings.' };
  const miles = Number(String(input.miles ?? '').trim());
  if (!Number.isFinite(miles) || miles <= 0 || miles > 1000) return { error: 'Give the miles, for example 12.5.' };
  const waitText = String(input.wait ?? '').trim();
  const wait = waitText === '' ? 0 : Number(waitText);
  if (!Number.isFinite(wait) || wait < 0 || wait > 600) return { error: 'Waiting is in minutes, for example 10, or leave it blank.' };
  const date = String(input.date || '');
  const time = String(input.time || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !HHMM.test(time)) return { error: 'Give the date and the pickup time.' };
  const vehicle = VEHICLES.includes(input.vehicle) ? input.vehicle : VEHICLES[0];

  const lines = [];
  if (t.flagPence) lines.push(['Hire charge', t.flagPence]);
  lines.push([`${trim(miles)} mile${miles === 1 ? '' : 's'} at £${money(t.perMilePence)} a mile`, Math.round(miles * t.perMilePence)]);
  if (wait && t.waitPerMinutePence) lines.push([`${trim(wait)} minute${wait === 1 ? '' : 's'} waiting at £${money(t.waitPerMinutePence)} a minute`, Math.round(wait * t.waitPerMinutePence)]);
  let total = lines.reduce((s, [, p]) => s + p, 0);
  const notes = [];
  if (wait && !t.waitPerMinutePence) notes.push('The tariff has no waiting charge, so the waiting is not counted.');
  const tr = timeRate(date, time, t);
  if (tr.rate > 1) { const up = Math.round(total * (tr.rate - 1)); lines.push([`${capital(tr.name)}, ${tr.rate} times`, up]); total += up; }
  if (LARGE.has(vehicle) && t.largeRate > 1) { const up = Math.round(total * (t.largeRate - 1)); lines.push([`${vehicle}, ${t.largeRate} times`, up]); total += up; }
  if (t.minimumPence && total < t.minimumPence) { lines.push(['Up to the minimum fare', t.minimumPence - total]); total = t.minimumPence; }
  // To the nearest 10p, the way a meter shows it.
  const rounded = Math.round(total / 10) * 10;
  if (rounded !== total) { lines.push(['Rounded to the nearest 10p', rounded - total]); total = rounded; }
  if (date > HOLIDAYS_KNOWN_UNTIL) notes.push(`The office knows bank holidays only to the end of ${HOLIDAYS_KNOWN_UNTIL.slice(0, 4)}, so a bank holiday rate after that is not counted.`);
  return { pence: total, lines, rateName: tr.name, vehicle, notes };
}

// A fixed price for the journey, in either direction, with a vehicle that
// fits. Fixed prices win over the tariff.
function fixedFor(prices, from, to, vehicle) {
  const n = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const f = n(from); const t = n(to);
  if (!f || !t) return null;
  const hit = (a, b) => a && b && (a.includes(b) || b.includes(a));
  const v = String(vehicle || VEHICLES[0]).toLowerCase();
  return (prices || []).find((p) => String(p.vehicle).toLowerCase() === v && ((hit(n(p.from_place), f) && hit(n(p.to_place), t)) || (hit(n(p.from_place), t) && hit(n(p.to_place), f)))) || null;
}

function money(p) { return (p / 100).toFixed(2); }
function trim(n) { return String(Math.round(n * 100) / 100); }
function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

module.exports = { fare, readTariff, fixedFor, timeRate, isNight, money, VEHICLES, BANK_HOLIDAYS, HOLIDAYS_KNOWN_UNTIL, DEFAULT_TARIFF };
