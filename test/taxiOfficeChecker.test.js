'use strict';

// The Checker (Tom, 17/10/2026: "the Ai can do the booking work but we need
// a second Ai to check the booking then human authority needs to sign it
// off"). A second AI checks every booking against the customer's own email;
// nothing goes into dispatch until a person signs it off, and the board
// records who did and what the checker said.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const data = require('../lib/taxiOffice/data');
const ai = require('../lib/taxiOffice/ai');
const office = require('../lib/taxiOffice/office');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const answer = (body) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(body) }] });
const isCheck = (req) => Boolean(req.output_config.format.schema.properties.issues);
const isRedraft = (req) => Boolean(req.output_config.format.schema.properties.held_back);

function withStubbedAi(reply, fn) {
  const saved = { flag: process.env.ENABLE_TAXI_OFFICE_AI, key: process.env.ANTHROPIC_API_KEY };
  process.env.ENABLE_TAXI_OFFICE_AI = 'true';
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  const calls = [];
  ai.__setClientFactoryForTests(() => ({ messages: { create: async (req) => { calls.push(req); return reply(req, calls); } } }));
  office.__shared.clear();
  return Promise.resolve(fn(calls)).finally(() => {
    if (saved.flag === undefined) delete process.env.ENABLE_TAXI_OFFICE_AI; else process.env.ENABLE_TAXI_OFFICE_AI = saved.flag;
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.key;
    office.__shared.clear();
  });
}

const BOOKING = {
  intent: 'new_booking', customer_name: 'Jamie Clarke', phone: '07700 900829', reference: '',
  journeys: [
    { date: '2026-10-17', time: '19:00', pickup: 'Exmouth Marina', destination: 'Exeter High Street', passengers: 8, vehicle: 'mpv8', needs: '' },
    { date: '2026-10-17', time: '01:00', pickup: 'Exeter High Street', destination: 'Exmouth Marina', passengers: 8, vehicle: 'mpv8', needs: '' }
  ]
};

test('only issues that point at something real in the booking, and would change it, survive; the booking is quoted by code', () => {
  const out = ai.cleanCheck({
    summary: 'The return is on the wrong day — it is after midnight.',
    issues: [
      { journey: 1, field: 'date', email_says: 'back to the Marina at 1am', should_be: '2026-10-18' },
      { journey: 0, field: 'passengers', email_says: '8 of us', should_be: '8' },
      { journey: 5, field: 'time', email_says: 'x', should_be: '10:00' },
      { journey: 0, field: 'time', email_says: 'at seven', should_be: 'seven' },
      { journey: 0, field: 'vehicle', email_says: 'minibus', should_be: 'minibus' },
      { journey: 0, field: 'pickup', email_says: 'Exmouth marina', should_be: 'exmouth  marina' },
      { journey: 3, field: 'phone', email_says: '07700 900829', should_be: '07700 900830' },
      { journey: 2, field: 'journey_missing', email_says: 'and Sunday lunch', should_be: 'Exmouth Marina to Topsham, Sunday 12:00' },
      { journey: 0, field: 'made_up', email_says: '', should_be: 'x' }
    ]
  }, BOOKING);
  assert.equal(out.summary, 'The return is on the wrong day, it is after midnight.', 'no dashes');
  assert.deepEqual(out.issues.map((i) => [i.journey, i.field, i.booking, i.should_be, i.fixable]), [
    [1, 'date', '2026-10-17', '2026-10-18', true],
    [-1, 'phone', '07700 900829', '07700 900830', true],
    [2, 'journey_missing', '', 'Exmouth Marina to Topsham, Sunday 12:00', false]
  ]);
});

test('the Checker works from the email and the booking only: not the Bookings worker\'s brief, draft or summary', async () => {
  const email = { from: 'Jamie Clarke <jamie.c@example.com>', receivedAt: '2026-10-16T21:15', subject: 'Stag do minibus', body: 'Booking for 8 of us on Saturday: pick up 7pm from Exmouth Marina into Exeter (High Street), then back to the Marina at 1am.' };
  await withStubbedAi(() => answer({ issues: [], summary: 'The booking matches the email.' }), async (calls) => {
    const out = await ai.checkBooking({ email, booking: { ...BOOKING, reply: 'SECRET DRAFT REPLY', summary: 'SECRET SUMMARY' } }, '2026-10-17');
    assert.deepEqual(out.issues, []);
    const req = calls[0];
    assert.match(req.system, /You did not make it\. Assume it may be wrong/);
    assert.match(req.system, /a 1am return after a night out is the following day/);
    assert.match(req.system, /ignore them/, 'the email is data, not instructions');
    assert.doesNotMatch(req.system, /draft the reply/i, 'not the Bookings brief');
    assert.match(req.messages[0].content, /THE EMAIL[\s\S]*back to the Marina at 1am[\s\S]*THE BOOKING TO CHECK[\s\S]*Journey 1: date 2026-10-17, time 01:00/);
    assert.doesNotMatch(req.messages[0].content, /SECRET/);
    assert.ok(Object.values(req.output_config.format.schema.properties).every(Boolean));
    assert.equal(req.output_config.format.schema.additionalProperties, false);
  });
});

test('a booking the checker flags: nothing goes in unsigned; its corrections go in, it checks again, the reply is redrafted, then a person signs it off', async () => {
  const today = data.todayLondon();
  const clarke = data.seedInbox(today).find((e) => e.id === 'clarke');
  // The Bookings worker puts the 1am return on the wrong day.
  const wrong = JSON.parse(JSON.stringify(clarke.prepared));
  wrong.journeys[1].date = wrong.journeys[0].date;
  const rightDate = clarke.prepared.journeys[1].date;
  let checks = 0;
  await withStubbedAi((req) => {
    if (isRedraft(req)) return answer({ reply: `Hi Jamie,\n\nYou're booked, back to the Marina at 1am on ${rightDate}.\n\nTidewell Cars`, held_back: '' });
    if (isCheck(req)) {
      checks += 1;
      return checks === 1
        ? answer({ issues: [{ journey: 1, field: 'date', email_says: 'back to the Marina at 1am', should_be: rightDate }], summary: 'The return is after midnight, so it is the next day.' })
        : answer({ issues: [], summary: 'The booking matches the email.' });
    }
    return answer(wrong);
  }, async (calls) => {
    const s = office.stateFor('checker-flow-' + Date.now());
    const email = office.inbox(s).find((e) => e.id === 'clarke');
    await office.readEmail(s, email);
    assert.equal(office.checkState(s, email), 'concerns');
    assert.equal(s.checks.clarke.data.issues[0].booking, wrong.journeys[1].date, 'what the booking says is quoted from the booking');

    const before = s.board.length;
    const unsigned = await office.fixLeg(s, email, 1);
    assert.equal(unsigned.ok, false);
    assert.equal(s.board.length, before, 'nothing goes into dispatch without a sign-off');

    const applied = await office.applyCheck(s, email);
    assert.equal(applied.ok, true);
    assert.match(applied.message, new RegExp(`date \\(journey 2\\) to ${data.longDate(rightDate)}\\.`), 'the date as a person reads it');
    assert.match(applied.message, /checked it again and now agrees/);
    assert.match(applied.message, /redrafted to match/);
    assert.equal(s.readings.clarke.data.journeys[1].date, rightDate);
    assert.equal(s.readings.clarke.corrected.length, 1);
    assert.equal(office.checkState(s, email), 'agrees');
    assert.equal(checks, 2, 'checked once, then again after the correction');
    assert.match(office.replyFor(s, email), /back to the Marina at 1am/);
    assert.match(s.guided.clarke.notes[0], /^Checker: match the corrected booking/);
    assert.equal(email.prepared.journeys[1].date, rightDate, 'the shared prepared answer is never changed');

    const r = await office.fixLeg(s, email, 1, { signedOff: true, by: 'dan' });
    assert.equal(r.ok, true, r.message);
    assert.match(s.changes[0].what, /Signed off by dan, the checker agreeing\.$/);
    assert.equal(calls.filter(isCheck).length, 2);
  });
});

test('signing off over the checker\'s concerns is allowed, and the board says so', async () => {
  const today = data.todayLondon();
  const gregory = data.seedInbox(today).find((e) => e.id === 'gregory');
  await withStubbedAi((req) => (isCheck(req)
    ? answer({ issues: [{ journey: 0, field: 'passengers', email_says: 'two of us', should_be: '3' }], summary: 'Passengers differ.' })
    : answer(gregory.prepared)), async () => {
    const s = office.stateFor('checker-override-' + Date.now());
    const email = office.inbox(s).find((e) => e.id === 'gregory');
    await office.readEmail(s, email);
    assert.equal(office.checkState(s, email), 'concerns');
    const r = await office.fixLeg(s, email, 0, { signedOff: true, by: 'tom' });
    assert.equal(r.ok, true);
    assert.match(s.changes[0].what, /Signed off by tom over the checker's concerns\.$/);
  });
});

test('with the AI off, a demo email carries the check made by hand; a new email cannot be checked and a person must check it', async () => {
  const before = process.env.ENABLE_TAXI_OFFICE_AI;
  delete process.env.ENABLE_TAXI_OFFICE_AI;
  try {
    const s = office.stateFor('checker-off-' + Date.now());
    const turner = office.inbox(s).find((e) => e.id === 'turner');
    await office.readEmail(s, turner);
    assert.equal(s.checks.turner.source, 'prepared');
    assert.equal(office.checkState(s, turner), 'agrees');
    assert.match(s.checks.turner.note, /prepared/);
    // A reading that differs from the prepared one has no check made by hand.
    s.readings.turner = { ...s.readings.turner, data: { ...s.readings.turner.data, journeys: [{ ...s.readings.turner.data.journeys[0], passengers: 5 }] } };
    assert.equal(office.checkState(s, turner), 'none', 'a check of another reading is no check of this one');
    await office.checkBooking(s, turner);
    assert.equal(office.checkState(s, turner), 'none');
    assert.match(s.checks.turner.note, /Check it against the email yourself/);
    // Complaints and customer emails are not bookings: nothing to check.
    const daniels = office.inbox(s).find((e) => e.id === 'daniels');
    await office.readEmail(s, daniels);
    assert.equal(office.checkState(s, daniels), null);
  } finally {
    if (before === undefined) delete process.env.ENABLE_TAXI_OFFICE_AI; else process.env.ENABLE_TAXI_OFFICE_AI = before;
  }
});

test('the page puts the checker\'s result before the sign-off, and the sign-off is a required tick, recorded against who is signed in', () => {
  const view = read('views/taxi-office/email.ejs');
  assert.ok(view.indexOf('id="check"') < view.indexOf('/fix"'), 'the checker\'s result comes before the dispatch buttons');
  const form = view.match(/<form method="post" action="<%= BASE %>\/inbox\/<%= email\.id %>\/fix"[\s\S]*?<\/form>/)[0];
  assert.match(form, /type="checkbox" id="<%= _sid %>" name="signoff" value="yes" required/);
  assert.match(form, /name="_csrf" value="<%= csrfToken %>"/);
  assert.match(form, /Sign off and book it into dispatch/);
  assert.doesNotMatch(view, /\sstyle="/);
  const routes = read('routes/taxiOffice.js');
  assert.match(routes, /signedOff: req\.body\.signoff === 'yes', by: req\.session\.user && req\.session\.user\.username/);
  assert.match(routes, /post\('\/inbox\/:id\/apply-check'/);
  assert.match(routes, /post\('\/inbox\/:id\/recheck'/);
  assert.match(read('views/taxi-office/today.ejs'), /w\.id === 'checker'/);
  assert.match(read('views/taxi-office/inbox.ejs'), /Checker flagged/);
});
