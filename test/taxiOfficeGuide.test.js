'use strict';

// Guiding a draft in the Tidewell office (Tom, 16/10/2026: "a section where
// we can guide it, so for example in bookings you can write we are fully
// booked and it will guide ai to the response, in complaints you can guide
// it and say our records show that it was Brian and he will be disciplined
// or we will investigate"). Staff say what the draft should say; the worker
// rewrites it, keeps every note, adds nothing nobody gave it, and never
// names a driver to a customer.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const data = require('../lib/taxiOffice/data');
const ai = require('../lib/taxiOffice/ai');
const office = require('../lib/taxiOffice/office');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

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

const answer = (body) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(body) }] });
const isRedraft = (req) => Boolean(req.output_config.format.schema.properties.held_back);

// Readings and complaint drafts come back as the prepared ones; a redraft
// comes back as whatever the test says.
function officeModel(redraftReply) {
  const today = data.todayLondon();
  return (req) => {
    const props = req.output_config.format.schema.properties;
    if (props.held_back) return answer(typeof redraftReply === 'function' ? redraftReply(req) : redraftReply);
    const email = data.seedInbox(today).find((e) => req.messages[0].content.includes(e.from));
    if (props.firm_at_fault) return answer(require('../lib/taxiOffice/prepared').complaintDraft(email.id));
    if (props.intent) return answer(email.prepared);
    if (props.checklist) return answer({ to: 'Licensing Team', subject: 'Hackney carriage licence 14: insurance', body: 'Dear Licensing Team,\n\nThe certificate follows.\n\nKind regards,\nOffice Manager, Tidewell Cars', checklist: ['Attach it'] });
    return answer({ posts: [] });
  };
}

test('with the AI off, a guide is refused in words and costs nothing', async () => {
  const saved = process.env.ENABLE_TAXI_OFFICE_AI;
  delete process.env.ENABLE_TAXI_OFFICE_AI;
  try {
    const s = office.stateFor('guide-off-' + Date.now());
    const email = office.inbox(s).find((e) => e.id === 'turner');
    await office.readEmail(s, email);
    const r = await office.guideReply(s, email, { guidance: "We're fully booked." });
    assert.equal(r.ok, false);
    assert.match(r.message, /switched off/);
    assert.equal(s.guided.turner, undefined);
    assert.equal(office.replyFor(s, email), email.prepared.reply, 'the first draft stands');
  } finally {
    if (saved !== undefined) process.env.ENABLE_TAXI_OFFICE_AI = saved;
  }
});

test("a booking reply is redrafted with staff's guidance; a second note keeps the first; back to the first draft undoes both", async () => {
  office.__shared.clear();
  let n = 0;
  await withStubbedAi(officeModel(() => {
    n += 1;
    return { reply: n === 1 ? "Hi Sophie,\n\nI'm sorry, we're fully booked at 11.30pm on Saturday — we can take you at midnight.\n\n**Thanks,**\nTidewell Cars" : 'Hi Sophie,\n\nWe can take you at midnight. Ring if that suits.\n\nThanks,\nTidewell Cars', held_back: '' };
  }), async (calls) => {
    const s = office.stateFor('guide-booking-' + Date.now());
    const email = office.inbox(s).find((e) => e.id === 'turner');
    await office.readEmail(s, email);
    const first = office.replyFor(s, email);

    const r = await office.guideReply(s, email, { guidance: "  We're fully booked at 11.30. Offer midnight instead.  " });
    assert.equal(r.ok, true, r.message);
    const req = calls.filter(isRedraft)[0];
    assert.match(req.system, /FOLLOWING THE OFFICE/);
    assert.match(req.system, /What staff tell you is the office's decision\. Follow it/);
    assert.match(req.system, /Add nothing else/);
    assert.match(req.system, /HOW TO WRITE/);
    assert.match(req.messages[0].content, /^THE EMAIL\nFrom: Sophie Turner/);
    assert.ok(req.messages[0].content.includes(`YOUR DRAFT\n${first}`), 'the draft on screen is what gets rewritten');
    assert.match(req.messages[0].content, /WHAT STAFF WANT, EARLIEST FIRST\n1\. We're fully booked at 11\.30\. Offer midnight instead\.$/);
    const schema = req.output_config.format.schema;
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required.slice().sort(), ['held_back', 'reply']);
    assert.equal(office.replyFor(s, email), "Hi Sophie,\n\nI'm sorry, we're fully booked at 11.30pm on Saturday, we can take you at midnight.\n\nThanks,\nTidewell Cars", 'cleaned like every other draft');

    await office.guideReply(s, email, { guidance: 'Keep it shorter.', draft: office.replyFor(s, email) });
    const second = calls.filter(isRedraft)[1];
    assert.match(second.messages[0].content, /1\. We're fully booked at 11\.30\. Offer midnight instead\.\n2\. Keep it shorter\.$/, 'the first note still counts');
    assert.deepEqual(s.guided.turner.notes, ["We're fully booked at 11.30. Offer midnight instead.", 'Keep it shorter.']);

    office.unguideReply(s, email);
    assert.equal(office.replyFor(s, email), first, 'back to the first draft');
  });
});

test('a reply edited by hand is what gets redrafted, and an empty note is refused before any call', async () => {
  office.__shared.clear();
  await withStubbedAi(officeModel({ reply: 'Hi Ellen,\n\nDone.\n\nTidewell Cars', held_back: '' }), async (calls) => {
    const s = office.stateFor('guide-edit-' + Date.now());
    const email = office.inbox(s).find((e) => e.id === 'rowe');
    await office.readEmail(s, email);
    const before = calls.length;
    const empty = await office.guideReply(s, email, { guidance: '   ' });
    assert.equal(empty.ok, false);
    assert.match(empty.message, /Write what you want it to say first/);
    assert.equal(calls.length, before, 'no call for an empty note');
    await office.guideReply(s, email, { guidance: 'Mention the ramp.', draft: 'Hi Ellen,\r\n\r\nMy own words.\r\n' });
    assert.ok(calls.filter(isRedraft)[0].messages[0].content.includes('YOUR DRAFT\nHi Ellen,\n\nMy own words.\n'), 'the hand edit is kept');
  });
});

test('a complaint is redrafted from the dispatch record; the model is told never to name the driver to the customer, and says what it held back', async () => {
  office.__shared.clear();
  await withStubbedAi(officeModel({
    reply: 'Hi Ruth,\n\nWe know which driver it was and we are dealing with it. We will refund the £8.10.\n\nKind regards,\nTidewell Cars',
    held_back: "I haven't named Dave or said he'll be disciplined in the reply — that stays between you and him."
  }), async (calls) => {
    const s = office.stateFor('guide-complaint-' + Date.now());
    const email = office.inbox(s).find((e) => e.id === 'daniels');
    await office.readEmail(s, email);
    const r = await office.guideReply(s, email, { guidance: 'Our records show it was Dave and he will be disciplined. Refund the fare.' });
    assert.equal(r.ok, true, r.message);
    const req = calls.filter(isRedraft)[0];
    assert.match(req.system, /^You handle complaints at Tidewell Cars/);
    assert.match(req.system, /Never name a driver in a customer email or say what will happen to them, even if staff do/);
    assert.match(req.system, /a refund, a free journey, a different time/, 'staff may decide money, which the first draft never offers');
    assert.match(req.messages[0].content, /WHAT DISPATCH HOLDS FOR THIS JOURNEY\nBooking TW-41152/);
    assert.match(req.messages[0].content, /Controller's note: 07:06 Dave held at a road closure/);
    const g = s.guided.daniels;
    assert.equal(g.heldBack, "I haven't named Dave or said he'll be disciplined in the reply, that stays between you and him.");
    assert.match(office.replyFor(s, email), /We will refund the £8\.10/);
    const log = office.complaintsLog(s).find((c) => c.email.id === 'daniels');
    assert.equal(log.complaint.data.reply, require('../lib/taxiOffice/prepared').complaintDraft('daniels').reply, "the worker's first draft is kept underneath");
  });
});

test('a reply that has gone cannot be redrafted, and the hour has a limit of its own', async () => {
  office.__shared.clear();
  await withStubbedAi(officeModel({ reply: 'Hi,\n\nOk.\n\nTidewell Cars', held_back: '' }), async (calls) => {
    const s = office.stateFor('guide-limit-' + Date.now());
    const email = office.inbox(s).find((e) => e.id === 'hollis');
    await office.readEmail(s, email);
    for (let i = 0; i < office.LIMITS.guide; i++) assert.equal((await office.guideReply(s, email, { guidance: `note ${i}` })).ok, true);
    assert.equal(s.guided.hollis.notes.length, 6, 'only the last six notes are kept');
    const before = calls.length;
    const r = await office.guideReply(s, email, { guidance: 'one more' });
    assert.equal(r.ok, false);
    assert.match(r.message, /this hour's redrafts/);
    assert.equal(calls.length, before);
    await office.markSent(s, email, 'Sent.');
    assert.match((await office.guideReply(s, email, { guidance: 'x' })).message, /already gone/);
  });
});

test('a licensing letter is redrafted as a letter to the council; a driver may be named to the council', async () => {
  office.__shared.clear();
  await withStubbedAi(officeModel({ reply: 'Subject: Hackney carriage licence 14: insurance\n\nDear Licensing Team,\n\nThe new certificate is attached.\n\nKind regards,\nOffice Manager, Tidewell Cars', held_back: '' }), async (calls) => {
    const s = office.stateFor('guide-lic-' + Date.now());
    const item = office.register(s).find((i) => i.council);
    assert.equal((await office.guideLicensing(s, item.id, { guidance: 'Say it is attached.' })).ok, false, 'nothing to guide before a draft');
    await office.draftLicensing(s, item.id);
    const r = await office.guideLicensing(s, item.id, { guidance: 'The new certificate is attached.' });
    assert.equal(r.ok, true, r.message);
    const req = calls.filter(isRedraft)[0];
    assert.match(req.system, /an email to the council's licensing team/);
    assert.match(req.system, /The council may be told which driver or vehicle/);
    assert.doesNotMatch(req.system, /Never name a driver in a customer email/);
    assert.match(req.messages[0].content, /^THE REGISTER ITEM\n/);
    assert.match(req.messages[0].content, /THE COUNCIL'S EMAIL\nFrom: /);
    assert.equal(office.licensingBody(s, item.id), 'Dear Licensing Team,\n\nThe new certificate is attached.\n\nKind regards,\nOffice Manager, Tidewell Cars', 'the subject line is not repeated in the body');
    office.unguideLicensing(s, item.id);
    assert.match(office.licensingBody(s, item.id), /The certificate follows/);
  });
});

test("the social worker is told what the owner wants mentioned, as fact, and the page says what was asked", async () => {
  await withStubbedAi((req) => answer({ posts: [{ platform: 'Facebook', text: "We're taking on two drivers.", image: 'driver', why: 'Hiring.' }] }), async (calls) => {
    const s = office.stateFor('guide-social-' + Date.now());
    await office.draftSocial(s, { steer: "We're taking on two drivers." });
    assert.match(calls[0].messages[0].content, /What the owner wants mentioned this week:\nWe're taking on two drivers\./);
    assert.match(calls[0].system, /treat what the owner says as fact/);
    assert.equal(s.social.steer, "We're taking on two drivers.");
  });
  const s = office.stateFor('guide-social-off-' + Date.now());
  const saved = process.env.ENABLE_TAXI_OFFICE_AI;
  delete process.env.ENABLE_TAXI_OFFICE_AI;
  try {
    await office.draftSocial(s, { steer: 'Mention the new car.' });
    assert.match(s.social.note, /What you asked it to mention has not been used\./, 'a prepared set says the note was not used');
  } finally {
    if (saved !== undefined) process.env.ENABLE_TAXI_OFFICE_AI = saved;
  }
});

test('the guide box sits inside each draft form, posts with the draft, and the busy label follows the pressed button', () => {
  const partial = read('views/taxi-office/partials/guide.ejs');
  assert.match(partial, /name="guidance"/);
  assert.match(partial, /formaction="<%= action %>"/);
  assert.match(partial, /Back to the first draft/);
  assert.match(partial, /it won't make anything up/);
  for (const [view, action] of [['email', '/inbox/'], ['complaints', '/inbox/'], ['licensing', '/licensing/']]) {
    const src = read(`views/taxi-office/${view}.ejs`);
    const form = src.match(/<form method="post"[^>]*>[\s\S]*?include\('partials\/guide'[\s\S]*?<\/form>/);
    assert.ok(form, `${view}: the guide is inside a form`);
    assert.match(form[0], /name="_csrf"/);
    assert.ok(form[0].includes(`action: BASE + '${action}'`), `${view}: posts to its own guide route`);
  }
  assert.match(read('views/taxi-office/social.ejs'), /name="steer"/);
  const route = read('routes/taxiOffice.js');
  for (const p of ["post('/inbox/:id/guide'", "post('/inbox/:id/unguide'", "post('/licensing/:id/guide'", "post('/licensing/:id/unguide'"]) assert.ok(route.includes(p), p);
  assert.match(route, /draft: req\.body\.reply/, 'the draft as edited on screen goes with the guidance');
  assert.match(read('public/js/taxi-office.js'), /e\.submitter \|\|/);
});
