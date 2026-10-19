'use strict';

// The Tidewell fleet the Licensing worker holds (Tom, 19/10/2026): the cars
// the public demo says the firm runs, each MOT a few days before its plate
// runs out (occasionally the same day), and an interim test exactly six
// months after every MOT, all worked out from today.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const fleet = require('../lib/taxiOffice/fleet');
const data = require('../lib/taxiOffice/data');
const { FIRM } = require('../taxi-demo/lib/firm');
const { VEHICLES } = require('../taxi-demo/lib/fares');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('the fleet is the one the website describes', () => {
  const mix = fleet.composition();
  assert.equal(mix.total, FIRM.fleet);
  assert.equal(mix.hackney, FIRM.taxis);
  assert.equal(mix.privateHire, FIRM.privateHire);
  assert.equal(mix.byType.wav, FIRM.wheelchairCars);
  // Every vehicle the booking form offers is on the road, 8-seaters included.
  for (const v of VEHICLES) assert.ok(mix.byType[v.id] > 0, `no ${v.id} in the fleet, but the site offers one`);
  assert.equal(Object.values(mix.byType).reduce((a, b) => a + b, 0), FIRM.fleet);
  // The social worker's "new 8-seater this week" is a car on the register.
  assert.ok(data.socialFacts('2026-10-19').some((f) => /new 8-seater/.test(f)));
  const newest = fleet.fleetFor('2026-10-19').find((c) => /New to the fleet this week/.test(c.notes.renewal || ''));
  assert.equal(newest.type, 'mpv8');
  assert.ok(data.daysUntil('2026-10-19', addYears(newest.plate, -1)) >= -7, 'its first plate was issued this week');
});

function addYears(ymd, n) {
  return fleet.addMonths(ymd, 12 * n);
}

test('licence numbers run 01 up, registrations are unique and read as plates', () => {
  const hc = fleet.FLEET.filter((c) => c.kind === 'hackney').map((c) => c.licence);
  const ph = fleet.FLEET.filter((c) => c.kind === 'private_hire').map((c) => c.licence);
  assert.deepEqual(hc, Array.from({ length: FIRM.taxis }, (_, i) => `Hackney carriage licence ${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(ph, Array.from({ length: FIRM.privateHire }, (_, i) => `Private hire licence ${String(i + 1).padStart(2, '0')}`));
  const regs = fleet.FLEET.map((c) => c.reg);
  assert.equal(new Set(regs).size, regs.length);
  for (const r of regs) assert.match(r, /^W[A-Z](1[89]|2[0-6]|69|7[0-6]) (TWC|DMO)$/, r);
});

test('the cars dispatch hands out and the complaint records name are on the register as the same cars', () => {
  const src = read('taxi-demo/lib/dispatch/mock.js');
  const byReg = new Map(fleet.FLEET.map((c) => [c.reg, c]));
  const allocated = [...src.matchAll(/car: '([^']+)', reg: '([^']+)'/g)];
  assert.ok(allocated.length >= 10);
  for (const [, car, reg] of allocated) {
    const c = byReg.get(reg);
    assert.ok(c, `${reg} (${car}) is not on the register`);
    assert.ok(car.startsWith(c.car), `${reg}: dispatch says ${car}, the register says ${c.car}`);
  }
  for (const [, car, reg, licence] of read('lib/taxiOffice/data.js').matchAll(/car: '([^']+)', reg: '([^']+)', licence: '([^']+)'/g)) {
    const c = byReg.get(reg);
    assert.ok(c, `${reg} is not on the register`);
    assert.equal(c.licence, licence, `${reg}: the complaint record says ${licence}`);
    assert.equal(c.car, car);
  }
});

test("Tom's rules hold on every day of a year: MOT a few days before the plate, interim six months after the MOT", () => {
  let sameDay = 0;
  for (let n = 0; n < 400; n += 1) {
    const today = data.addDays('2026-10-19', n);
    for (const c of fleet.fleetFor(today)) {
      const gap = data.daysUntil(c.nextMot, c.plate);
      assert.ok(gap >= 0 && gap <= 5, `${today} ${c.id}: plate ${gap} days after the MOT`);
      if (n === 0 && gap === 0) sameDay += 1;
      assert.equal(c.interim, fleet.addMonths(c.lastMot, 6), `${today} ${c.id}: interim not six months after the MOT`);
      assert.equal(c.nextMot, fleet.addMonths(c.lastMot, 12), `${today} ${c.id}: MOTs not a year apart`);
      assert.ok(c.lastMot < today && c.nextMot >= today, `${today} ${c.id}: the next MOT is not ahead`);
    }
  }
  assert.ok(sameDay >= 1 && sameDay <= 6, 'occasionally the same day, not usually');
});

test('calendar months, not 182 days: the end of a month stays the end of a month', () => {
  assert.equal(fleet.addMonths('2026-08-31', 6), '2027-02-28');
  assert.equal(fleet.addMonths('2027-08-31', 6), '2028-02-29');
  assert.equal(fleet.addMonths('2026-04-20', 6), '2026-10-20');
  assert.equal(fleet.addMonths('2027-03-15', -12), '2026-03-15');
});

test('the register carries the next month and nothing else from the fleet, soonest first', () => {
  const office = require('../lib/taxiOffice/office');
  const sid = `fleet-test-${Date.now()}`;
  const s = office.stateFor(sid);
  const today = s.today;
  const reg = office.register(s);
  const fromFleet = reg.filter((i) => i.fleet);
  assert.ok(fromFleet.length > 0, 'something is coming up this month');
  for (const i of fromFleet) {
    const n = data.daysUntil(today, i.due);
    assert.ok(n >= 0 && n <= fleet.WINDOW_DAYS, `${i.id} is ${n} days away`);
    assert.match(i.item, /^(MOT and plate renewal|Interim test)$/);
  }
  const dues = reg.map((i) => i.due);
  assert.deepEqual(dues, dues.slice().sort());
  const cu = fleet.comingUp(today);
  assert.equal(cu.renewals + cu.interims, fromFleet.length);
  // "MOT" keeps its capitals in a sentence; everything else is lower case.
  for (const i of reg) assert.equal(i.itemLower, /^MOT/.test(i.item) ? i.item : i.item.charAt(0).toLowerCase() + i.item.slice(1));
  // HC 21's interim test is always the example coming up, not yet booked.
  assert.ok(reg.some((i) => i.id === 'hc21-interim' && /not yet booked/.test(i.note)));
  office.reset(sid);
});

test('the spreadsheet has every car, dates a spreadsheet can sort, and what is due next', () => {
  const today = '2026-10-19';
  const lines = fleet.fleetCsv(today).trim().split('\r\n');
  assert.equal(lines.length, FIRM.fleet + 1);
  assert.match(lines[0], /^Licence,Licence type,Vehicle,Type,Seats,Wheelchair accessible,Registration,Last MOT,Interim test,Next MOT,Plate runs out/);
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    assert.equal(cells.length, 14, line);
    for (const d of [cells[7], cells[8], cells[9], cells[10], cells[13]]) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(cells[13] >= today, `${cells[0]}: the next thing due is in the past`);
  }
  assert.equal(lines.filter((l) => /,Wheelchair accessible,5,Yes,/.test(l)).length, FIRM.wheelchairCars);
});

test('the Licensing page shows the fleet with a spreadsheet download, behind the office login', () => {
  const route = read('routes/taxiOffice.js');
  assert.match(route, /app\.get\(BASE \+ '\/licensing\/fleet\.csv', noindex, requireOfficeAccess,/);
  assert.match(route, /Content-Disposition', `attachment; filename="tidewell-cars-fleet-\$\{today\}\.csv"`/);
  const view = read('views/taxi-office/licensing.ejs');
  assert.match(view, /id="fleet"/);
  assert.match(view, /href="<%= BASE %>\/licensing\/fleet\.csv" download>Download as a spreadsheet<\/a>/);
  assert.doesNotMatch(view, /\sstyle="/);
  const today = read('views/taxi-office/today.ejs');
  assert.match(today, /data-fleet-coming-up/);
});
