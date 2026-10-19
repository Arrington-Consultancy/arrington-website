'use strict';

// One-off live check of the office's AI workers, run inside the deployed
// container because this sandbox cannot reach the model. Armed by
// RUN_TAXI_OFFICE_AI_CHECK=<label> on the service for one deploy and
// removed (set empty) afterwards.
//
// It runs the office's own code path, as a visitor would: every demo email
// is read, passed to its worker and, for a complaint, looked up in dispatch
// and answered. For each it prints whether plain code reaches the same
// worker and the same verdict on the AI's reading as on the prepared one,
// and which fields the reading left blank. Then one licensing letter and one
// set of posts, then Tom's guide examples (a draft redrafted with staff's
// guidance). Last, the full text of what the AI wrote, one JSON line per
// item ("Taxi office AI dump"), so a reply can be read in the log and the
// screenshots on the demo's staff portal page can show the model's own
// words. Everything in it is about the made-up firm.
//
// It also leaves the readings in the shared cache, so the first visitor
// after that deploy waits for nothing.

const ai = require('./ai');
const match = require('./match');
const office = require('./office');
const workers = require('./workers');

async function runAiCheck(label) {
  const tag = `Taxi office AI check (${label})`;
  if (!ai.aiEnabled()) {
    console.log(`${tag}: skipped, the AI is off.`);
    return;
  }
  const s = office.stateFor(`ai-check-${label}`);
  const emails = office.inbox(s);
  await Promise.all(emails.map((e) => office.readEmail(s, e).catch(() => null)));
  let agree = 0;
  for (const email of emails) {
    const r = s.readings[email.id];
    if (!r || !r.data) {
      console.log(`${tag}: ${email.id}: FAILED, ${r && r.note ? r.note : 'no reading'}`);
      continue;
    }
    const cmp = match.compare(r.data, s.board);
    const got = cmp.status;
    const want = email.prepared ? match.compare(email.prepared, s.board).status : '(none)';
    const gotWorker = workers.workerForIntent(r.data.intent);
    const wantWorker = email.prepared ? workers.workerForIntent(email.prepared.intent) : '(none)';
    const same = got === want && gotWorker === wantWorker;
    if (same) agree += 1;
    const gaps = [...new Set(cmp.legs.flatMap((l) => l.gaps || []))];
    let extra = '';
    if (gotWorker === 'complaints') {
      const c = s.complaints[email.id];
      extra = c && c.data
        ? `; complaint ${c.source}, job ${c.jobRef || 'not found'}, ${c.data.category}, at fault ${c.data.firm_at_fault}${c.data.for_licensing ? ', passed to Licensing' : ''}`
        : '; complaint NOT DRAFTED';
    }
    console.log(`${tag}: ${email.id}: ${same ? 'agrees' : 'DIFFERS'} (${r.source} ${gotWorker}/${got}, prepared ${wantWorker}/${want}); ${r.data.journeys.map((j) => `${j.date} ${j.time}`).join(' + ') || 'no journeys'}${gaps.length ? `; blank: ${gaps.join(', ')}` : ''}${r.data.missing.length ? `; AI says missing: ${r.data.missing.join(', ')}` : ''}${extra}`);
  }
  console.log(`${tag}: ${agree} of ${emails.length} emails reach the same worker and verdict as the prepared answers.`);
  // The Checker (17/10/2026): what it said about each booking the readings
  // made, then a booking with a mistake planted in it, which it must catch.
  let checked = 0;
  let flagged = 0;
  for (const email of emails) {
    const st = office.checkState(s, email);
    if (!st) continue;
    checked += 1;
    const c = s.checks[email.id];
    if (st === 'concerns') flagged += 1;
    console.log(`${tag}: checker ${email.id}: ${st}${c && c.data && c.data.issues.length ? `, ${c.data.issues.map((i) => `${i.field} j${i.journey} ${i.booking} -> ${i.should_be}`).join('; ')}` : ''}${c && c.note ? `, ${c.note}` : ''}`);
  }
  console.log(`${tag}: checker: ${checked} bookings checked, ${flagged} flagged.`);
  const clarke = emails.find((e) => e.id === 'clarke');
  if (clarke && clarke.prepared) {
    const planted = JSON.parse(JSON.stringify(clarke.prepared));
    planted.journeys[1].date = planted.journeys[0].date;
    try {
      const out = await ai.checkBooking({ email: clarke, booking: planted }, s.today);
      const caught = out.issues.some((i) => i.field === 'date' && i.journey === 1 && i.should_be === clarke.prepared.journeys[1].date);
      console.log(`${tag}: checker planted mistake (1am return on the wrong day): ${caught ? 'CAUGHT' : 'MISSED'}; ${out.issues.length} issue(s); "${out.summary}"`);
    } catch (e) {
      console.log(`${tag}: checker planted mistake FAILED ${String(e.message || e).slice(0, 160)}`);
    }
  }
  try {
    const lic = await office.draftLicensing(s, 'veh-14');
    console.log(`${tag}: licensing draft (${lic.source}) "${lic.data.subject}", ${lic.data.body.length} chars, ${lic.data.checklist.length} checklist items.`);
  } catch (e) {
    console.log(`${tag}: licensing FAILED ${String(e.message || e).slice(0, 160)}`);
  }
  try {
    const soc = await office.draftSocial(s);
    console.log(`${tag}: social (${soc.source}), ${soc.posts.length} posts (${soc.posts.map((p) => `${p.platform} ${p.text.length} chars`).join(', ')}).`);
  } catch (e) {
    console.log(`${tag}: social FAILED ${String(e.message || e).slice(0, 160)}`);
  }
  // Staff guiding a draft, with Tom's own examples (16/10/2026): fully
  // booked, and a complaint where the office says who the driver was and
  // that he will be disciplined. The reply must follow the steer, must not
  // name the driver or the discipline to the customer, and must say so to
  // staff.
  const GUIDES = [
    ['turner', "We're fully booked at 11.30pm on Saturday. Offer them a car at midnight instead."],
    ['umbrella', 'A navy umbrella was handed in this morning. They can collect it from the office.'],
    ['daniels', 'Our records show it was Dave and he will be disciplined. Refund her fare.']
  ];
  for (const [id, note] of GUIDES) {
    const email = emails.find((e) => e.id === id);
    if (!email) continue;
    const r = await office.guideReply(s, email, { guidance: note });
    const g = s.guided[id];
    if (!r.ok || !g) {
      console.log(`${tag}: guide ${id}: FAILED, ${r.message}`);
      continue;
    }
    let verdict = '';
    if (id === 'daniels') {
      const named = /\bDave\b/.test(g.reply);
      const disciplined = /disciplin/i.test(g.reply);
      const refund = /refund/i.test(g.reply);
      verdict = `; driver ${named ? 'NAMED' : 'not named'}, discipline ${disciplined ? 'MENTIONED' : 'not mentioned'}, refund ${refund ? 'offered' : 'NOT OFFERED'}, held back ${g.heldBack ? 'explained' : 'NOT EXPLAINED'}`;
    }
    console.log(`${tag}: guide ${id}: redrafted, ${g.reply.length} chars${verdict}.`);
  }
  try {
    const lr = await office.guideLicensing(s, 'veh-14', { guidance: 'The new certificate is attached. Ask them to confirm the file is up to date.' });
    console.log(`${tag}: guide licensing veh-14: ${lr && lr.ok ? 'redrafted' : `FAILED, ${lr ? lr.message : 'no item'}`}.`);
  } catch (e) {
    console.log(`${tag}: guide licensing FAILED ${String(e.message || e).slice(0, 160)}`);
  }
  const dump = (kind, id, value) => console.log(`Taxi office AI dump (${label}) ${kind} ${id}: ${JSON.stringify(value)}`);
  for (const [id, g] of Object.entries(s.guided)) dump('guided', id, g);
  if (s.licGuided['veh-14']) dump('guided-licensing', 'veh-14', s.licGuided['veh-14']);
  for (const email of emails) {
    const r = s.readings[email.id];
    if (r && r.source === 'ai') dump('reading', email.id, r.data);
    const c = s.complaints[email.id];
    if (c && c.source === 'ai') dump('complaint', email.id, c.data);
  }
  if (s.licensing['veh-14'] && s.licensing['veh-14'].source === 'ai') dump('licensing', 'veh-14', s.licensing['veh-14'].data);
  if (s.social && s.social.source === 'ai') dump('social', 'week', s.social.posts);
  office.reset(`ai-check-${label}`);
}

module.exports = { runAiCheck };
