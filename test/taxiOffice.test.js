'use strict';

// Tidewell Cars office (/taxi-demo/office, Tom 16/10/2026): the made-up
// records, the plain-code dispatch check, the AI workers' requests (with the
// model stubbed), the office state, and the rules the pages must keep.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const data = require('../lib/taxiOffice/data');
const match = require('../lib/taxiOffice/match');
const ai = require('../lib/taxiOffice/ai');
const office = require('../lib/taxiOffice/office');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const workers = require('../lib/taxiOffice/workers');
const { humanise } = require('../lib/taxiOffice/humanise');

const EXPECTED = {
  hollis: 'match', gregory: 'differs', turner: 'missing', patel: 'differs', rowe: 'needs_details',
  clarke: 'missing', fowler: 'to_cancel', umbrella: 'not_booking', fenwick: 'not_booking', 'council-14': 'council',
  daniels: 'complaint', holt: 'complaint', carr: 'complaint'
};
const WORKER = {
  hollis: 'bookings', gregory: 'bookings', turner: 'bookings', patel: 'bookings', rowe: 'bookings', clarke: 'bookings', fowler: 'bookings',
  umbrella: 'customer', fenwick: 'customer', 'council-14': 'licensing', daniels: 'complaints', holt: 'complaints', carr: 'complaints'
};
// The completed job each complaint is about, and the candidates for the
// umbrella left in a car "Exeter to Exmouth about 11pm last night".
const PAST = { daniels: ['TW-41152'], holt: ['TW-41158'], carr: ['TW-41140'], umbrella: ['TW-41160', 'TW-41158'] };

test('every demo email reaches the intended worker and verdict, whatever day of the week the office is opened', () => {
  for (let n = 0; n < 7; n++) {
    const today = data.addDays('2026-10-12', n);
    const board = data.seedBoard(today);
    const inbox = data.seedInbox(today);
    assert.deepEqual(inbox.map((e) => e.id).sort(), Object.keys(EXPECTED).sort());
    for (const email of inbox) {
      const day = `${email.id} on ${data.weekday(today)}`;
      assert.equal(match.compare(email.prepared, board).status, EXPECTED[email.id], day);
      assert.equal(workers.workerForIntent(email.prepared.intent), WORKER[email.id], day);
      if (PAST[email.id]) assert.deepEqual(match.findPastJobs(email.prepared, email.prepared.journeys[0], board).map((j) => j.ref), PAST[email.id], day);
    }
  }
});

test('the dates in the emails agree with the board: tomorrow is tomorrow, and Saturday jobs fall on a Saturday', () => {
  const today = '2026-10-16'; // a Friday
  const inbox = data.seedInbox(today);
  const hollis = inbox.find((e) => e.id === 'hollis');
  assert.match(hollis.body, /tomorrow, Saturday 17 October/);
  const clarke = inbox.find((e) => e.id === 'clarke');
  assert.equal(data.weekday(clarke.prepared.journeys[0].date), 'Saturday');
  assert.equal(clarke.prepared.journeys[1].date, data.addDays(clarke.prepared.journeys[0].date, 1), 'a 1am return is the next day');
  const job = data.seedBoard(today).find((j) => j.ref === 'TW-41212');
  assert.equal(data.weekday(job.date), 'Saturday');
});

test('the dispatch check names exactly what is wrong, and finds a quoted reference', () => {
  const today = '2026-10-16';
  const board = data.seedBoard(today);
  const inbox = data.seedInbox(today);
  const gregory = match.compare(inbox.find((e) => e.id === 'gregory').prepared, board);
  assert.deepEqual(gregory.legs[0].diffs.map((d) => [d.field, d.email, d.board]), [['time', '05:30', '05:50']]);
  const patel = match.compare(inbox.find((e) => e.id === 'patel').prepared, board);
  assert.equal(patel.legs[0].job.ref, 'TW-41207');
  const clarke = match.compare(inbox.find((e) => e.id === 'clarke').prepared, board);
  assert.deepEqual(clarke.legs.map((l) => l.status), ['match', 'missing'], 'the outward leg is in, the return is not');
  const rowe = match.compare(inbox.find((e) => e.id === 'rowe').prepared, board);
  assert.ok(rowe.legs[0].gaps.includes('pickup address') && rowe.legs[0].gaps.includes('phone number'));
  assert.ok(match.samePlace('Budleigh Salterton', 'Budleigh Salterton, Fore Street'));
  assert.ok(!match.samePlace('Exeter Airport', 'Exeter St Davids station'));
});

test('a wheelchair job on the board in a car is flagged; "a taxi" is not a request for a particular car', () => {
  const job = { date: '2026-10-20', time: '09:00', pickup: 'Exmouth Marina', destination: 'Exeter Airport', passengers: 1, vehicle: 'saloon' };
  assert.deepEqual(match.diffJourney({ ...job, vehicle: 'wav' }, job).map((d) => d.field), ['vehicle']);
  assert.deepEqual(match.diffJourney({ ...job, vehicle: 'estate' }, job), []);
});

test('putting dispatch right: book, correct and cancel through the dispatch connection, each only when the check calls for it', async () => {
  const s = office.stateFor('test-fix-' + Date.now());
  const inbox = office.inbox(s);
  const email = (id) => inbox.find((e) => e.id === id);
  for (const id of ['gregory', 'clarke', 'fowler', 'hollis']) s.readings[id] = { data: email(id).prepared, source: 'prepared' };
  assert.equal((await office.fixLeg(s, email('gregory'), 0)).ok, true);
  assert.equal(s.board.find((j) => j.ref === 'TW-41203').time, '05:30');
  assert.equal(office.readingStatus(s, email('gregory')).key, 'match');
  const added = await office.fixLeg(s, email('clarke'), 1);
  assert.match(added.message, /^Booked into dispatch as TW-4\d{4}\.$/);
  assert.equal(office.readingStatus(s, email('clarke')).key, 'match');
  assert.equal((await office.fixLeg(s, email('fowler'), 0)).ok, true);
  assert.equal(s.board.find((j) => j.ref === 'TW-41191').status, 'cancelled');
  assert.equal((await office.fixLeg(s, email('hollis'), 0)).ok, false, 'nothing to put right on a matching job');
  assert.equal((await office.markSent(s, email('hollis'), '   ')).ok, false);
  assert.equal((await office.markSent(s, email('hollis'), 'Dear Margaret')).ok, true);
});

test('with iCabbi as the dispatch connection, a booking goes to its slot, which refuses and says what it needs; the board does not change', async () => {
  const { createOfficeDispatch } = require('../lib/taxiOffice/dispatch');
  office.__setConnectionsForTests({ disp: createOfficeDispatch('icabbi') });
  try {
    const s = office.stateFor('test-icabbi-' + Date.now());
    const turner = office.inbox(s).find((e) => e.id === 'turner');
    s.readings.turner = { data: turner.prepared, source: 'prepared' };
    const before = s.board.length;
    const r = await office.fixLeg(s, turner, 0);
    assert.equal(r.ok, false);
    assert.match(r.message, /^iCabbi is not connected yet\. It needs access to the iCabbi booking API/);
    assert.equal(s.board.length, before);
    assert.equal(office.connections().dispatch, 'iCabbi');
  } finally {
    office.__setConnectionsForTests({ disp: null });
  }
});

test('with the AI off, the office shows the prepared answer and says so; a new email cannot be read', async () => {
  const before = process.env.ENABLE_TAXI_OFFICE_AI;
  delete process.env.ENABLE_TAXI_OFFICE_AI;
  try {
    const s = office.stateFor('test-off-' + Date.now());
    const r = await office.readEmail(s, office.inbox(s).find((e) => e.id === 'turner'));
    assert.equal(r.source, 'prepared');
    assert.match(r.note, /switched off/);
    const own = office.addCustomEmail(s, { from: '', subject: '', body: 'Taxi please' });
    const r2 = await office.readEmail(s, own);
    assert.equal(r2.data, null);
    assert.equal(r2.source, 'error');
  } finally {
    if (before !== undefined) process.env.ENABLE_TAXI_OFFICE_AI = before;
  }
});

function withStubbedAi(reply, fn) {
  const saved = { flag: process.env.ENABLE_TAXI_OFFICE_AI, key: process.env.ANTHROPIC_API_KEY };
  process.env.ENABLE_TAXI_OFFICE_AI = 'true';
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  const calls = [];
  ai.__setClientFactoryForTests(() => ({ messages: { create: async (req) => { calls.push(req); return typeof reply === 'function' ? reply(req) : reply; } } }));
  return Promise.resolve(fn(calls)).finally(() => {
    if (saved.flag === undefined) delete process.env.ENABLE_TAXI_OFFICE_AI; else process.env.ENABLE_TAXI_OFFICE_AI = saved.flag;
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.key;
  });
}

function everyObjectIsClosed(schema, where = 'schema') {
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false, `${where} must not allow extra fields`);
    assert.deepEqual(schema.required.slice().sort(), Object.keys(schema.properties).sort(), `${where} must require every field`);
    for (const [k, v] of Object.entries(schema.properties)) everyObjectIsClosed(v, `${where}.${k}`);
  }
  if (schema.type === 'array') everyObjectIsClosed(schema.items, `${where}[]`);
}

test('the booking desk asks the model for JSON against a closed schema, and uses what comes back', async () => {
  const today = '2026-10-16';
  const turner = data.seedInbox(today).find((e) => e.id === 'turner');
  const answer = { ...turner.prepared, reply: 'Hi Sophie — booked.' };
  await withStubbedAi({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }] }, async (calls) => {
    const s = office.stateFor('test-ai-' + Date.now());
    const r = await office.readEmail(s, office.inbox(s).find((e) => e.id === 'turner'));
    assert.equal(r.source, 'ai');
    assert.equal(r.data.reply, 'Hi Sophie, booked.', 'no dashes reach the page');
    const req = calls[0];
    assert.equal(req.model, ai.MODEL);
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'lib', 'taxiOffice', 'ai.js'), 'utf8'), /\|\| 'claude-opus-5-5'\)\.trim\(\)/, 'the default model');
    assert.equal(req.output_config.format.type, 'json_schema');
    assert.equal(req.output_config.effort, 'low');
    everyObjectIsClosed(req.output_config.format.schema);
    assert.match(req.system, /ignore them/, 'the email is treated as data, not instructions');
    assert.match(req.system, /a town or area will do/, 'a destination town is enough to book, as in a real office (live check of 16/10/2026)');
    assert.match(req.system, /Never guess an address, a time or a phone number/);
    assert.match(req.messages[0].content, /Received: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    // A second visitor gets the shared reading, with no second call.
    const s2 = office.stateFor('test-ai2-' + Date.now());
    await office.readEmail(s2, office.inbox(s2).find((e) => e.id === 'turner'));
    assert.equal(calls.length, 1);
  });
});

test('a refusal or a failure falls back to the prepared answer, labelled, and never to a guess', async () => {
  await withStubbedAi({ stop_reason: 'refusal', content: [] }, async () => {
    office.__shared.clear();
    const s = office.stateFor('test-refuse-' + Date.now());
    const r = await office.readEmail(s, office.inbox(s).find((e) => e.id === 'patel'));
    assert.equal(r.source, 'prepared');
    assert.match(r.note, /could not be reached/);
  });
});

test('licensing and social drafts ask for closed schemas, and social only offers the demo pictures', async () => {
  const today = '2026-10-16';
  await withStubbedAi((req) => {
    const schema = req.output_config.format.schema;
    const body = schema.properties.posts
      ? { posts: [{ platform: 'Facebook', text: 'New 8-seater – in the fleet.', image: 'not-a-picture', why: 'News.' }] }
      : { to: 'Licensing Team', subject: 'Licence 14', body: 'Dear Licensing Team', checklist: ['Attach the certificate.'] };
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(body) }] };
  }, async (calls) => {
    const item = data.seedRegister(today)[0];
    const lic = await ai.draftLicensing({ item, urgencyLabel: 'Overdue', councilEmail: data.seedInbox(today).find((e) => e.id === 'council-14') }, today);
    assert.equal(lic.subject, 'Licence 14');
    assert.match(calls[0].system, /Never invent a fee, a rule, a form number, a deadline/);
    assert.match(calls[0].user || calls[0].messages[0].content, /The council has written/);
    const posts = await ai.draftSocial({ facts: data.socialFacts(today), images: data.SOCIAL_IMAGES }, today);
    assert.equal(posts[0].image, data.SOCIAL_IMAGES[0].id, 'an unknown picture falls back to a demo picture');
    assert.ok(!/[–—]/.test(posts[0].text));
    assert.deepEqual(calls[1].output_config.format.schema.properties.posts.items.properties.image.enum, data.SOCIAL_IMAGES.map((i) => i.id));
    for (const c of calls) everyObjectIsClosed(c.output_config.format.schema);
    assert.match(calls[1].system, /Never invent an offer, a discount, an event, a review/);
  });
});

test('the office is gated like Scott, kept out of search and Clarity, and passed through the public demo to this app', () => {
  const route = read('routes/taxiOffice.js');
  assert.match(route, /hasScottAccess\(user\)/);
  assert.match(route, /render404\(req, res\)/);
  assert.match(route, /X-Robots-Tag', 'noindex, nofollow'/);
  assert.match(route, /res\.locals\.noClarity = true/);
  const server = read('server.js');
  assert.match(server, /if \(\/\^\\\/taxi-demo\\\/office\(\\\/\|\\\?\|\$\)\/\.test\(req\.originalUrl\)\) return next\(\);/);
  assert.match(server, /require\('\.\/routes\/taxiOffice'\)\.mountPageRoute\(app\)/);
  assert.ok(server.indexOf("require('./routes/taxiOffice')") > server.indexOf('doubleCsrfProtection(req, res, next)'), 'mounted after the CSRF check');
});

test('the office pages carry no inline styles, no tracking tags, no dashes, and every form posts with a CSRF token', () => {
  const dir = path.join(ROOT, 'views/taxi-office');
  const files = [...fs.readdirSync(dir).filter((f) => f.endsWith('.ejs')).map((f) => path.join(dir, f)), ...fs.readdirSync(path.join(dir, 'partials')).map((f) => path.join(dir, 'partials', f))];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const name = path.relative(ROOT, f);
    assert.doesNotMatch(src, /\sstyle="/, `${name} has a style attribute`);
    assert.doesNotMatch(src, /google-tag|gtag\(|clarity|fbq\(/i, `${name} carries a tracking tag`);
    assert.doesNotMatch(src, /[–—]|&mdash;|&ndash;/, `${name} has a dash`);
    const forms = src.match(/<form method="post"[\s\S]*?<\/form>/g) || [];
    for (const form of forms) assert.match(form, /name="_csrf" value="<%= csrfToken %>"/, `${name}: a form without a CSRF token`);
  }
});

test('the made-up records stay made up: drama-range numbers, example.com addresses, no real council named', () => {
  const src = read('lib/taxiOffice/data.js') + read('lib/taxiOffice/prepared.js');
  for (const n of src.match(/\b0\d{4} \d{6}\b/g) || []) assert.match(n, /^(07700 900\d{3}|01632 960\d{3})$/, `${n} is not in Ofcom's drama range`);
  for (const a of src.match(/[\w.]+@[\w.-]+/g) || []) assert.match(a, /\.example(\.com|\.gov\.uk)?$|@example\.com$/, `${a} is not a reserved example address`);
  assert.doesNotMatch(src, /East Devon|Exeter City Council|Devon County Council|Teignbridge/);
  assert.doesNotMatch(src, /[–—]/);
});
