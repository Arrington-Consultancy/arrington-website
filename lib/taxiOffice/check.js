'use strict';

// One-off live check of the office's AI workers, run inside the deployed
// container because this sandbox cannot reach the model. Armed by
// RUN_TAXI_OFFICE_AI_CHECK=<label> on the service for one deploy and
// removed afterwards: it reads every demo email through the real model,
// checks that plain code reaches the same verdict on the AI's reading as on
// the prepared one, drafts one licensing letter and one set of posts, and
// prints the lot to the deploy log. It also leaves the readings in the
// shared cache, so the first visitor after that deploy waits for nothing.

const ai = require('./ai');
const data = require('./data');
const match = require('./match');
const office = require('./office');

async function runAiCheck(label) {
  if (!ai.aiEnabled()) {
    console.log(`Taxi office AI check (${label}): skipped, the AI is off.`);
    return;
  }
  const today = data.todayLondon();
  const board = data.seedBoard(today);
  let agree = 0;
  const emails = data.seedInbox(today);
  const results = await Promise.all(emails.map(async (email) => {
    try {
      const reading = await ai.readBookingEmail(email, today);
      const got = match.compare(reading, board).status;
      const want = match.compare(email.prepared, board).status;
      if (got === want) agree += 1;
      office.__shared.set(`email|${today}|${email.id}`, { value: { data: reading, source: 'ai', model: ai.MODEL }, at: Date.now() });
      return `${email.id}: ${got === want ? 'agrees' : 'DIFFERS'} (AI ${got}, prepared ${want}); intent ${reading.intent}; ${reading.journeys.map((j) => `${j.date} ${j.time} ${j.vehicle}`).join(' + ') || 'no journeys'}; reply ${reading.reply.length} chars`;
    } catch (e) {
      return `${email.id}: FAILED ${e.status || e.code || ''} ${String(e.message || e).slice(0, 160)}`;
    }
  }));
  results.forEach((line) => console.log(`Taxi office AI check (${label}): ${line}`));
  console.log(`Taxi office AI check (${label}): ${agree} of ${emails.length} emails reach the same verdict as the prepared answers.`);
  try {
    const item = data.seedRegister(today)[0];
    const councilEmail = emails.find((e) => e.id === item.council) || null;
    const draft = await ai.draftLicensing({ item, urgencyLabel: data.urgency(today, item.due).label, councilEmail }, today);
    console.log(`Taxi office AI check (${label}): licensing draft "${draft.subject}", ${draft.body.length} chars, ${draft.checklist.length} checklist items.`);
  } catch (e) {
    console.log(`Taxi office AI check (${label}): licensing FAILED ${String(e.message || e).slice(0, 160)}`);
  }
  try {
    const posts = await ai.draftSocial({ facts: data.socialFacts(today), images: data.SOCIAL_IMAGES }, today);
    console.log(`Taxi office AI check (${label}): social, ${posts.length} posts (${posts.map((p) => `${p.platform} ${p.text.length} chars`).join(', ')}).`);
  } catch (e) {
    console.log(`Taxi office AI check (${label}): social FAILED ${String(e.message || e).slice(0, 160)}`);
  }
}

module.exports = { runAiCheck };
