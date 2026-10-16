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
// set of posts. Last, the full text of what the AI wrote, one JSON line per
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
  const dump = (kind, id, value) => console.log(`Taxi office AI dump (${label}) ${kind} ${id}: ${JSON.stringify(value)}`);
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
