'use strict';

// The Tidewell Cars fleet, as the Licensing worker holds it (Tom, 19/10/2026:
// "we need to have dates of MOTs and plates for Tidewell Cars sitting in the
// background. The council worker needs to be reminding the workspace of
// what's coming up").
//
// In line with the public demo (taxi-demo/lib/firm.js): 48 cars, 30 hackney
// carriage taxis and 18 private hire, 6 of them wheelchair accessible, and
// every vehicle the booking form offers (car, estate, 6-seater, 8-seater,
// executive) on the road. test/taxiOfficeFleet.test.js holds the counts to
// the firm's own figures, so the site and the register cannot drift apart.
//
// The ten cars the demo's dispatch hands out (taxi-demo/lib/dispatch/mock.js)
// are here with the same registrations, and the cars named in the office's
// complaint records carry the same licence numbers. Registrations keep the
// demo's TWC/DMO letters, so they read as plates without being chosen to
// match any real car.
//
// Dates (Tom's rules, same message): each car's MOT falls a few days before
// its plate (vehicle licence) runs out, occasionally the same day, and every
// car has an interim test exactly six months on from its MOT. Everything is
// worked out from today, like the rest of the office, so the register never
// goes stale: a car's next MOT is `motIn` days away, its last MOT twelve
// months before that, its interim test six calendar months after the last
// MOT, and its plate runs out `gap` days after the next MOT.

const { addDays, daysUntil, shortDate } = require('./data');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// "20 April": the last MOT is always within the past year, so no year needed.
const dayMonth = (ymd) => `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;

const TYPES = {
  saloon: 'Car',
  estate: 'Estate',
  mpv6: '6-seater',
  mpv8: '8-seater',
  executive: 'Executive',
  wav: 'Wheelchair accessible'
};

const SEATS = { saloon: 4, estate: 4, mpv6: 6, mpv8: 8, executive: 3, wav: 5 };

// licence number, vehicle type, car, registration, days to the next MOT,
// days from the MOT to the plate running out, and any note for the register.
// interimIn instead of motIn pins a car's interim test to a day (HC 21's
// test, not yet booked, is the register's example of one coming up).
const HC = (n, type, car, reg, timing, notes = {}) => ({ id: `hc${n}`, kind: 'hackney', licence: `Hackney carriage licence ${n}`, type, car, reg, ...timing, notes });
const PH = (n, type, car, reg, timing, notes = {}) => ({ id: `ph${n}`, kind: 'private_hire', licence: `Private hire licence ${n}`, type, car, reg, ...timing, notes });

const FLEET = [
  HC('01', 'saloon', 'Silver Toyota Corolla', 'WB22 TWC', { motIn: 57, gap: 3 }),
  HC('02', 'saloon', 'White Toyota Prius', 'WD71 DMO', { motIn: 133, gap: 4 }),
  HC('03', 'mpv8', 'Black Mercedes Vito', 'WC72 TWC', { motIn: 26, gap: 0 }),
  HC('04', 'wav', 'White Citroen Berlingo', 'WH23 DMO', { motIn: 92, gap: 2 }),
  HC('05', 'saloon', 'Grey Skoda Octavia', 'WE21 TWC', { motIn: 243, gap: 5 }),
  HC('06', 'mpv6', 'Black Toyota Proace Verso', 'WG23 TWC', { motIn: 162, gap: 3 }),
  HC('07', 'saloon', 'Blue Kia Niro', 'WA74 DMO', { motIn: 295, gap: 1 }),
  HC('08', 'saloon', 'White Kia Niro', 'WK24 DMO', { motIn: 71, gap: 4 }),
  HC('09', 'saloon', 'Silver Hyundai Ioniq', 'WJ71 TWC', { motIn: 8, gap: 4 }),
  HC('10', 'saloon', 'Black Toyota Corolla', 'WF73 DMO', { motIn: 214, gap: 2 }),
  HC('11', 'estate', 'Silver Toyota Corolla Touring', 'WL24 DMO', { motIn: 120, gap: 3 }),
  HC('12', 'wav', 'White Volkswagen Caddy Maxi', 'WB72 DMO', { motIn: 280, gap: 0 }),
  HC('13', 'saloon', 'Grey Toyota Camry', 'WD23 TWC', { motIn: 176, gap: 5 }),
  HC('14', 'saloon', 'Grey Skoda Octavia', 'WF22 TWC', { motIn: 229, gap: 3 }),
  HC('15', 'estate', 'Grey Skoda Octavia Estate', 'WC24 DMO', { motIn: 318, gap: 2 }),
  HC('16', 'saloon', 'Silver Toyota Prius', 'WE72 TWC', { motIn: 195, gap: 4 }),
  HC('17', 'mpv8', 'Silver Ford Tourneo Custom', 'WR22 DMO', { motIn: 105, gap: 1 }),
  HC('18', 'saloon', 'White Toyota Corolla', 'WH74 TWC', { motIn: 341, gap: 3 }),
  HC('19', 'wav', 'Silver Peugeot Rifter', 'WA23 DMO', { motIn: 141, gap: 5 }),
  HC('20', 'saloon', 'Black Kia Niro', 'WG74 TWC', { motIn: 44, gap: 2 }),
  HC('21', 'wav', 'Blue Ford Tourneo', 'WD22 DMO', { interimIn: 6, gap: 3 }, { interim: 'Test not yet booked.' }),
  HC('22', 'saloon', 'Grey Hyundai Ioniq', 'WJ73 TWC', { motIn: 258, gap: 4 }),
  HC('23', 'mpv6', 'Grey Ford Galaxy', 'WB21 DMO', { motIn: 3, gap: 2 }),
  HC('24', 'saloon', 'Silver Skoda Octavia', 'WE73 DMO', { motIn: 302, gap: 0 }),
  HC('25', 'wav', 'White Peugeot e-Rifter', 'WK73 DMO', { motIn: 84, gap: 4 }),
  HC('26', 'saloon', 'Black Toyota Prius', 'WF24 TWC', { motIn: 155, gap: 3 }),
  HC('27', 'estate', 'Silver Kia Ceed Sportswagon', 'WH72 TWC', { motIn: 236, gap: 5 }),
  HC('28', 'wav', 'Grey Volkswagen Caddy Maxi', 'WC21 DMO', { motIn: 352, gap: 1 }),
  HC('29', 'saloon', 'White Hyundai Ioniq', 'WA72 TWC', { motIn: 127, gap: 2 }),
  HC('30', 'saloon', 'Grey Toyota Corolla', 'WJ24 DMO', { motIn: 265, gap: 4 }),
  PH('01', 'saloon', 'Black Toyota Corolla', 'WG21 TWC', { motIn: 99, gap: 3 }),
  PH('02', 'executive', 'Black Mercedes E-Class', 'WE24 TWC', { motIn: 183, gap: 2 }),
  PH('03', 'saloon', 'Silver Kia Niro', 'WD74 DMO', { motIn: 36, gap: 5 }),
  PH('04', 'mpv6', 'Silver Seat Alhambra', 'WH21 DMO', { motIn: 250, gap: 2 }),
  PH('05', 'estate', 'Grey Skoda Octavia Estate', 'WP72 TWC', { motIn: 148, gap: 4 }),
  PH('06', 'saloon', 'White Toyota Prius', 'WC73 TWC', { motIn: 287, gap: 1 }),
  PH('07', 'saloon', 'Silver Toyota Corolla', 'WA73 TWC', { motIn: 15, gap: 3 }),
  PH('08', 'saloon', 'Grey Hyundai Ioniq', 'WJ22 DMO', { motIn: 208, gap: 0 }),
  PH('09', 'mpv8', 'Grey Volkswagen Caravelle', 'WF72 DMO', { motIn: 63, gap: 4 }),
  PH('10', 'estate', 'Black Toyota Corolla Touring', 'WB24 TWC', { motIn: 330, gap: 3 }),
  PH('11', 'executive', 'Black Skoda Superb', 'WG73 DMO', { motIn: 113, gap: 5 }),
  PH('12', 'saloon', 'Black Toyota Prius', 'WJ23 DMO', { motIn: 272, gap: 2 }),
  PH('13', 'saloon', 'Silver Toyota Camry', 'WK74 TWC', { motIn: 29, gap: 2 }),
  PH('14', 'mpv6', 'Black Ford Galaxy', 'WD24 TWC', { motIn: 170, gap: 4 }),
  PH('15', 'saloon', 'Grey Kia Niro', 'WE22 DMO', { motIn: 201, gap: 3 }),
  PH('16', 'estate', 'White Kia Ceed Sportswagon', 'WL73 TWC', { motIn: 221, gap: 1 }),
  PH('17', 'saloon', 'Silver Hyundai Ioniq', 'WH73 DMO', { motIn: 310, gap: 5 }),
  // New this week: the 8-seater the social worker announces (data.socialFacts).
  PH('18', 'mpv8', 'Black Mercedes Vito', 'WA76 TWC', { motIn: 360, gap: 2 }, { renewal: 'New to the fleet this week.' })
];

// 'YYYY-MM-DD' plus n calendar months. A day the month does not have becomes
// its last day (31 August plus six months is the end of February).
function addMonths(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const total = (m - 1) + n;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// One car's dates. Everything follows from its last MOT, so the interim
// test is always exactly six months after it and the next MOT exactly
// twelve.
function datesFor(car, today) {
  const lastMot = car.interimIn != null
    ? addMonths(addDays(today, car.interimIn), -6)
    : addMonths(addDays(today, car.motIn), -12);
  const interim = addMonths(lastMot, 6);
  const nextMot = addMonths(lastMot, 12);
  const plate = addDays(nextMot, car.gap);
  return { lastMot, interim, nextMot, plate };
}

function describeCar(car) {
  const what = car.type === 'wav' ? `${car.car} (wheelchair accessible)` : (car.type === 'mpv8' || car.type === 'mpv6') ? `${car.car} ${TYPES[car.type]}` : car.car;
  return `${car.licence}, ${what}`;
}

function fleetFor(today) {
  return FLEET.map((car) => ({
    ...car,
    typeLabel: TYPES[car.type],
    seats: SEATS[car.type],
    wheelchair: car.type === 'wav',
    describe: describeCar(car),
    ...datesFor(car, today)
  }));
}

// What the Licensing worker puts on the register: each car's MOT and plate
// renewal (one item, because the MOT is booked for the plate), and its
// interim test, when either falls within the next `windowDays`. The rest of
// the year is in the fleet table and the spreadsheet.
const WINDOW_DAYS = 30;

function registerItems(today, windowDays = WINDOW_DAYS) {
  const items = [];
  for (const car of fleetFor(today)) {
    const toMot = daysUntil(today, car.nextMot);
    if (toMot >= 0 && toMot <= windowDays) {
      const plateLine = car.gap === 0
        ? `MOT due ${shortDate(car.nextMot)}, the same day the plate runs out.`
        : `MOT due ${shortDate(car.nextMot)}. Plate runs out ${shortDate(car.plate)}, ${car.gap} day${car.gap === 1 ? '' : 's'} later.`;
      items.push({
        id: `${car.id}-renewal`, kind: 'vehicle', subject: car.describe, item: 'MOT and plate renewal', due: car.nextMot,
        note: [plateLine, car.notes.renewal].filter(Boolean).join(' '), plate: car.plate, fleet: car.id
      });
    }
    const toInterim = daysUntil(today, car.interim);
    if (toInterim >= 0 && toInterim <= windowDays) {
      items.push({
        id: `${car.id}-interim`, kind: 'vehicle', subject: car.describe, item: 'Interim test', due: car.interim,
        note: [`Six months on from its MOT on ${dayMonth(car.lastMot)}.`, car.notes.interim].filter(Boolean).join(' '), fleet: car.id
      });
    }
  }
  return items;
}

// Insurance (Tom, 19/10/2026: "Insurance will all be on the same date, it
// will be fleet cover"): one policy covers every car, so there is one
// renewal date for the whole fleet, not one per car. This year's cover began
// three days ago, the day the old certificates ran out (the council's email
// about licence 14, data.seedInbox, counts from the same day), and was
// arranged the day before.
function insurancePolicy(today) {
  const from = addDays(today, -3);
  return { arranged: addDays(today, -4), from, renews: addMonths(from, 12) };
}

function insuranceItem(today) {
  const p = insurancePolicy(today);
  return {
    id: 'fleet-insurance', kind: 'vehicle', subject: `Fleet insurance, all ${FLEET.length} cars`, item: 'Insurance renewal', due: p.renews,
    note: `One policy covers the whole fleet. This year's cover started on ${dayMonth(p.from)}.`
  };
}

// For the Today page: what is coming up in the next month, in a sentence's
// worth of numbers.
function comingUp(today, windowDays = WINDOW_DAYS) {
  const items = registerItems(today, windowDays);
  return {
    windowDays,
    renewals: items.filter((i) => i.item === 'MOT and plate renewal').length,
    interims: items.filter((i) => i.item === 'Interim test').length
  };
}

// The whole fleet as a spreadsheet (CSV, which Excel and Numbers open).
// Dates as YYYY-MM-DD so a spreadsheet reads them as dates and sorts them.
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fleetCsv(today) {
  const head = ['Licence', 'Licence type', 'Vehicle', 'Type', 'Seats', 'Wheelchair accessible', 'Registration', 'Last MOT', 'Interim test', 'Next MOT', 'Plate runs out', 'Days from MOT to plate', 'Next thing due', 'Next due date', 'Fleet insurance renews'];
  const renews = insurancePolicy(today).renews;
  const rows = fleetFor(today).map((car) => {
    const next = [['Interim test', car.interim], ['MOT', car.nextMot], ['Plate renewal', car.plate]].find(([, d]) => d >= today);
    return [car.licence, car.kind === 'hackney' ? 'Hackney carriage' : 'Private hire', car.car, car.typeLabel, car.seats, car.wheelchair ? 'Yes' : 'No', car.reg,
      car.lastMot, car.interim, car.nextMot, car.plate, car.gap, next[0], next[1], renews];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function composition() {
  const count = (fn) => FLEET.filter(fn).length;
  return {
    total: FLEET.length,
    hackney: count((c) => c.kind === 'hackney'),
    privateHire: count((c) => c.kind === 'private_hire'),
    byType: Object.fromEntries(Object.keys(TYPES).map((t) => [t, count((c) => c.type === t)]))
  };
}

module.exports = { FLEET, TYPES, SEATS, WINDOW_DAYS, addMonths, datesFor, fleetFor, registerItems, insurancePolicy, insuranceItem, comingUp, fleetCsv, composition };
