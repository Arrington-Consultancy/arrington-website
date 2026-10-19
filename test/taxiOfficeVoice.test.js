'use strict';

// Tom, 19/10/2026: "I want Toms tone of voice and paragraph and dashes rules
// to apply to the Ai workers". The rules are in 01A TOM VOICE - WORKER SPEC
// in Drive (read 19/10/2026, last reviewed 14/10/2026). The prompts carry
// them and humanise() holds the two that code can: paragraphs follow on the
// next line with no blank line between them (in an email: greeting, one
// blank line, the body on consecutive lines, one blank line, sign-off), and
// no dashes between words or clauses.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { humanise, dashesOut, keepsTheRules } = require('../lib/taxiOffice/humanise');
const ai = require('../lib/taxiOffice/ai');
const data = require('../lib/taxiOffice/data');
const prepared = require('../lib/taxiOffice/prepared');
const office = require('../lib/taxiOffice/office');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('an email keeps Tom\'s layout: greeting, blank line, body on consecutive lines, blank line, sign-off', () => {
  assert.equal(
    humanise('Hi Sophie,\n\nThat\'s booked for 11.30pm.\n\nThe night rate applies after 10pm.\n\nEnjoy your night.\n\nThanks,\nTidewell Cars'),
    'Hi Sophie,\n\nThat\'s booked for 11.30pm.\nThe night rate applies after 10pm.\nEnjoy your night.\n\nThanks,\nTidewell Cars');
  // The name alone is a sign-off too, and a sign-off a paragraph above its name joins it.
  assert.equal(humanise('Morning Paul,\n\nAll booked.\n\nHave a good trip.\n\nTidewell Cars'), 'Morning Paul,\n\nAll booked.\nHave a good trip.\n\nTidewell Cars');
  assert.equal(humanise('Dear Ellen,\n\nBooked.\n\nSee you then.\n\nKind regards,\n\nTidewell Cars'), 'Dear Ellen,\n\nBooked.\nSee you then.\n\nKind regards,\nTidewell Cars');
  // No blank line after the greeting, or none before the sign-off: both are put back.
  assert.equal(humanise('Hi Gary,\nWe looked it up.\nThanks,\nTidewell Cars'), 'Hi Gary,\n\nWe looked it up.\n\nThanks,\nTidewell Cars');
  assert.equal(humanise('Hi Gary,\n\nWe looked it up.\nTidewell Cars'), 'Hi Gary,\n\nWe looked it up.\n\nTidewell Cars');
  // A letter to the council, signed by the office manager, the same way.
  assert.equal(
    humanise('Subject: Licence 14\n\nDear Licensing Team,\n\nThe certificate is attached.\n\nPlease tell us if you need anything else.\n\nKind regards,\nOffice Manager, Tidewell Cars'),
    'Dear Licensing Team,\n\nThe certificate is attached.\nPlease tell us if you need anything else.\n\nKind regards,\nOffice Manager, Tidewell Cars');
  // Line breaks Tom would keep inside the body stay where they are.
  assert.equal(humanise('Hi Jo,\n\nOne.\nTwo.\n\nCheers,\nTidewell Cars'), 'Hi Jo,\n\nOne.\nTwo.\n\nCheers,\nTidewell Cars');
});

test('a social post has no blank lines at all, and its hashtags stay', () => {
  assert.equal(humanise('A new 8-seater this week.\n\nBook online.\n\n#Exmouth'), 'A new 8-seater this week.\nBook online.\n#Exmouth');
});

test('no dashes between words or clauses; a range between figures reads "to"; hyphenated words stay', () => {
  assert.equal(dashesOut('Late — we should have rung'), 'Late, we should have rung');
  assert.equal(dashesOut('Late – we should have rung'), 'Late, we should have rung');
  assert.equal(dashesOut('Late -- we should have rung'), 'Late, we should have rung');
  assert.equal(dashesOut('Late - we should have rung'), 'Late, we should have rung');
  assert.equal(dashesOut('around £29–£32.50 in the day'), 'around £29 to £32.50 in the day');
  assert.equal(dashesOut('from 7.15 - 7.31'), 'from 7.15 to 7.31');
  assert.equal(dashesOut('an 8-seater for a made-up firm on 2026-10-19'), 'an 8-seater for a made-up firm on 2026-10-19');
  assert.equal(dashesOut('booked — .'), 'booked.');
  assert.doesNotMatch(humanise('Hi Ruth,\n\nYour car was late — we should have rung you.\n\nTidewell Cars'), /[–—]|--| - /);
});

test('every draft the office has ready when the AI is off already keeps the rules', () => {
  const today = data.todayLondon ? data.todayLondon() : '2026-10-19';
  for (const e of data.seedInbox(today)) {
    const r = e.prepared && e.prepared.reply;
    if (r) assert.ok(keepsTheRules(r), `${e.id}: ${JSON.stringify(r)}`);
  }
  for (const id of ['daniels', 'holt', 'carr']) assert.ok(keepsTheRules(prepared.complaintDraft(id).reply), id);
  for (const p of prepared.socialDraft()) assert.ok(keepsTheRules(p.text), p.platform);
  const s = office.stateFor(`voice-${Date.now()}`);
  const council = data.seedInbox(s.today).find((e) => e.id === 'council-14');
  for (const item of office.register(s)) {
    assert.ok(keepsTheRules(prepared.licensingDraft(item, null).body), item.id);
    assert.ok(keepsTheRules(prepared.licensingDraft(item, council).body), `${item.id} with the council's email`);
  }
  // A customer gets "Thanks" or "Cheers", or the firm's name alone: Tom has
  // not said who gets "Kind regards", so only the council letter carries it.
  for (const e of data.seedInbox(today)) assert.doesNotMatch((e.prepared && e.prepared.reply) || '', /Kind regards/, e.id);
});

test('every worker\'s brief carries Tom\'s rules', () => {
  const t = '2026-10-19';
  const briefs = {
    bookings: ai.bookingSystem(t),
    complaints: ai.complaintSystem(t),
    redraftCustomer: ai.redraftSystem('customer', t),
    redraftLicensing: ai.redraftSystem('licensing', t)
  };
  for (const [name, b] of Object.entries(briefs)) {
    assert.match(b, /Direct, honest, practical and conversational/, name);
    assert.match(b, /every body paragraph on consecutive lines with no blank line between any of them/, name);
    assert.match(b, /No dashes between words or clauses/, name);
    assert.match(b, /No groups of three for effect/, name);
    assert.match(b, /Mirror the tone of the email you are answering/, name);
    assert.match(b, /Never call anyone "mate"/, name);
  }
  const src = read('lib/taxiOffice/ai.js');
  // The licensing letter and the social posts carry them too.
  assert.match(src.slice(src.indexOf('function licensingSystem'), src.indexOf('function cleanLicensing')), /\n\s+WRITING,/);
  const social = src.slice(src.indexOf('function socialSystem'), src.indexOf('function cleanSocial'));
  assert.match(social, /one flowing block in full spoken sentences: no stacked one-line paragraphs, no blank lines/);
  assert.match(social, /No dashes between words or clauses/);
  // Where they came from, so the next person knows to re-read 01A.
  assert.match(src, /01A TOM VOICE -\n\/\/ WORKER SPEC in Drive/);
  // Everything the AI writes for a reader goes through the clean-up.
  for (const field of ['reply: humanise(String(data.reply', 'body: humanise(String(data.body', 'text: humanise(String(p.text']) assert.ok(src.includes(field), field);
});
