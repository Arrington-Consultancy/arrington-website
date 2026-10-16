'use strict';

// The office's working state, one per signed-in visitor: their own copy of
// the dispatch board, what has been read, fixed, approved and "sent". Held in
// memory for four hours and never written to the database: the records are
// made up, and two prospects looking at the office at once must not see each
// other's changes.
//
// What the AI reads from the demo's own emails is shared across visitors
// for the day, so the second person to open an email does not pay for it to
// be read again. Their state still starts fresh.

const crypto = require('crypto');
const data = require('./data');
const match = require('./match');
const ai = require('./ai');
const prepared = require('./prepared');
const { londonParts } = require('../../taxi-demo/lib/fares');

const TTL = 4 * 60 * 60 * 1000;
const MAX_STATES = 500;
const HOUR = 60 * 60 * 1000;
const LIMITS = { custom: 10, social: 6, read: 40 };

const states = new Map();
const shared = new Map();

function fresh(today) {
  return {
    today,
    board: data.seedBoard(today),
    readings: {},
    sent: {},
    custom: [],
    licensing: {},
    social: null,
    approved: {},
    changes: [],
    used: { custom: [], social: [], read: [] },
    nextRef: 41300,
    touched: Date.now()
  };
}

function prune(now) {
  for (const [k, s] of states) if (now - s.touched > TTL) states.delete(k);
  while (states.size > MAX_STATES) states.delete(states.keys().next().value);
  for (const [k, v] of shared) if (now - v.at > 24 * HOUR) shared.delete(k);
}

// The visitor's state. A new day starts a new office, so the dates in the
// emails always agree with the board.
function stateFor(sessionId, now = new Date()) {
  prune(now.getTime());
  const today = data.todayLondon(now);
  let s = states.get(sessionId);
  if (!s || s.today !== today) {
    s = fresh(today);
    states.set(sessionId, s);
  }
  s.touched = now.getTime();
  return s;
}

function reset(sessionId) {
  states.delete(sessionId);
}

// Spend one of the visitor's AI calls for the hour, or say no.
function allow(s, kind, now = Date.now()) {
  s.used[kind] = s.used[kind].filter((t) => now - t < HOUR);
  if (s.used[kind].length >= LIMITS[kind]) return false;
  s.used[kind].push(now);
  return true;
}

function inbox(s) {
  const seeded = data.seedInbox(s.today);
  return [...s.custom.slice().reverse(), ...seeded];
}

function findEmail(s, id) {
  return inbox(s).find((e) => e.id === id) || null;
}

function readingStatus(s, email) {
  const r = s.readings[email.id];
  if (!r || !r.data) return { key: 'unread', ...match.STATUS.unread };
  const cmp = match.compare(r.data, s.board);
  const key = email.routeTo === 'licensing' ? 'council' : cmp.status;
  return { key, ...match.STATUS[key] };
}

// Read one email: the shared cache, then the AI, then (for the demo's own
// emails) the prepared answer, labelled as such.
async function readEmail(s, email, { force = false } = {}) {
  if (!force && s.readings[email.id] && s.readings[email.id].data) return s.readings[email.id];
  const cacheKey = `email|${s.today}|${email.id}`;
  if (!email.custom && !force && shared.has(cacheKey)) {
    s.readings[email.id] = { ...shared.get(cacheKey).value };
    return s.readings[email.id];
  }
  let result;
  if (ai.aiEnabled() && allow(s, email.custom ? 'custom' : 'read')) {
    try {
      const value = await ai.readBookingEmail(email, s.today);
      result = { data: value, source: 'ai', model: ai.MODEL };
      if (!email.custom) shared.set(cacheKey, { value: result, at: Date.now() });
    } catch (e) {
      console.warn(`Taxi office: the AI could not read email ${email.id}: ${e.status || e.code || ''} ${String(e.message || e).slice(0, 200)}`);
      result = email.prepared
        ? { data: email.prepared, source: 'prepared', note: 'The AI could not be reached just now, so this is the answer prepared for this demo email.' }
        : { data: null, source: 'error', note: 'The AI could not be reached just now. Try again in a moment.' };
    }
  } else if (ai.aiEnabled()) {
    result = email.prepared
      ? { data: email.prepared, source: 'prepared', note: 'You have used this hour\'s AI readings, so this is the answer prepared for this demo email.' }
      : { data: null, source: 'error', note: 'You have used this hour\'s AI readings. Try again later.' };
  } else {
    result = email.prepared
      ? { data: email.prepared, source: 'prepared', note: 'The AI is switched off on this server, so this is the answer prepared for this demo email.' }
      : { data: null, source: 'error', note: 'The AI is switched off on this server, so it cannot read a new email.' };
  }
  s.readings[email.id] = result;
  return result;
}

async function readAll(s) {
  const unread = data.seedInbox(s.today).filter((e) => !(s.readings[e.id] && s.readings[e.id].data));
  await Promise.all(unread.map((e) => readEmail(s, e)));
  return unread.length;
}

function addCustomEmail(s, { from, subject, body }, now = new Date()) {
  const p = londonParts(now);
  const clean = (v, n) => String(v || '').replace(/\r/g, '').trim().slice(0, n);
  const email = {
    id: 'own-' + crypto.randomBytes(5).toString('hex'),
    custom: true,
    from: clean(from, 120) || 'A customer <customer@example.com>',
    subject: clean(subject, 160) || '(no subject)',
    body: clean(body, 3000),
    receivedAt: `${p.date}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  };
  if (!email.body) return null;
  s.custom.push(email);
  if (s.custom.length > 10) s.custom.shift();
  return email;
}

function newRef(s) {
  s.nextRef += 1;
  return `TW-${s.nextRef}`;
}

// Put dispatch right for one leg of one email: add the job, correct it, or
// cancel it. Only what the comparison says is needed; anything else is a no.
function fixLeg(s, email, legIndex) {
  const r = s.readings[email.id];
  if (!r || !r.data) return { ok: false, message: 'Read the email first.' };
  const cmp = match.compare(r.data, s.board);
  const leg = cmp.legs.find((l) => l.index === legIndex);
  if (!leg) return { ok: false, message: 'That journey is not in this email.' };
  const ext = r.data;
  if (leg.status === 'missing') {
    const j = leg.journey;
    const job = {
      ref: newRef(s), date: j.date, time: j.time, name: ext.customer_name || 'Customer', phone: ext.phone,
      pickup: j.pickup, destination: j.destination, passengers: j.passengers || 1, vehicle: j.vehicle || 'saloon',
      source: 'Email', notes: j.needs || '', status: 'booked', changed: 'added'
    };
    s.board.push(job);
    s.changes.unshift({ ref: job.ref, what: `Added from ${ext.customer_name || 'an email'}'s email`, emailId: email.id });
    return { ok: true, message: `Added to dispatch as ${job.ref}.` };
  }
  if (leg.status === 'differs') {
    const job = s.board.find((x) => x.ref === leg.job.ref);
    const VEH = Object.fromEntries(Object.entries(match.VEHICLE_LABELS).map(([k, v]) => [v, k]));
    for (const d of leg.diffs) {
      if (d.field === 'passengers') job.passengers = Number(d.email);
      else if (d.field === 'vehicle') job.vehicle = VEH[d.email] || job.vehicle;
      else job[d.field] = d.email;
    }
    job.changed = 'updated';
    s.changes.unshift({ ref: job.ref, what: `Corrected ${leg.diffs.map((d) => d.label.toLowerCase()).join(', ')}`, emailId: email.id });
    return { ok: true, message: `${job.ref} corrected.` };
  }
  if (leg.status === 'to_cancel') {
    const job = s.board.find((x) => x.ref === leg.job.ref);
    job.status = 'cancelled';
    job.changed = 'cancelled';
    s.changes.unshift({ ref: job.ref, what: 'Cancelled at the customer\'s request', emailId: email.id });
    return { ok: true, message: `${job.ref} cancelled.` };
  }
  return { ok: false, message: 'Nothing to put right for that journey.' };
}

// "Send" a reply: recorded on the page, never sent anywhere.
function markSent(s, email, text) {
  const reply = String(text || '').replace(/\r/g, '').trim().slice(0, 3000);
  if (!reply) return { ok: false, message: 'The reply is empty.' };
  s.sent[email.id] = { text: reply, at: Date.now() };
  return { ok: true, message: 'Reply marked as sent. In this demo nothing leaves the office.' };
}

function register(s) {
  return data.seedRegister(s.today).map((item) => ({ ...item, urgency: data.urgency(s.today, item.due) }));
}

async function draftLicensing(s, itemId, { force = false } = {}) {
  const item = register(s).find((i) => i.id === itemId);
  if (!item) return null;
  const councilEmail = item.council ? data.seedInbox(s.today).find((e) => e.id === item.council) : null;
  const cacheKey = `lic|${s.today}|${itemId}`;
  if (!force && s.licensing[itemId]) return s.licensing[itemId];
  if (!force && shared.has(cacheKey)) {
    s.licensing[itemId] = { ...shared.get(cacheKey).value };
    return s.licensing[itemId];
  }
  let result;
  if (ai.aiEnabled() && allow(s, 'read')) {
    try {
      const value = await ai.draftLicensing({ item, urgencyLabel: item.urgency.label, councilEmail }, s.today);
      result = { data: value, source: 'ai', model: ai.MODEL };
      shared.set(cacheKey, { value: result, at: Date.now() });
    } catch (e) {
      console.warn(`Taxi office: the AI could not draft for ${itemId}: ${e.status || e.code || ''} ${String(e.message || e).slice(0, 200)}`);
      result = { data: prepared.licensingDraft(item, councilEmail), source: 'prepared', note: 'The AI could not be reached just now, so this is a draft prepared for the demo.' };
    }
  } else {
    result = { data: prepared.licensingDraft(item, councilEmail), source: 'prepared', note: ai.aiEnabled() ? 'You have used this hour\'s AI drafts, so this is a draft prepared for the demo.' : 'The AI is switched off on this server, so this is a draft prepared for the demo.' };
  }
  s.licensing[itemId] = result;
  return result;
}

async function draftSocial(s) {
  const facts = data.socialFacts(s.today);
  let result;
  if (ai.aiEnabled() && allow(s, 'social')) {
    try {
      const posts = await ai.draftSocial({ facts, images: data.SOCIAL_IMAGES }, s.today);
      result = { posts, source: 'ai', model: ai.MODEL };
    } catch (e) {
      console.warn(`Taxi office: the AI could not draft social posts: ${e.status || e.code || ''} ${String(e.message || e).slice(0, 200)}`);
      result = { posts: prepared.socialDraft(), source: 'prepared', note: 'The AI could not be reached just now, so these are posts prepared for the demo.' };
    }
  } else {
    result = { posts: prepared.socialDraft(), source: 'prepared', note: ai.aiEnabled() ? 'You have used this hour\'s AI drafts, so these are posts prepared for the demo.' : 'The AI is switched off on this server, so these are posts prepared for the demo.' };
  }
  s.social = result;
  s.approved = {};
  return result;
}

function summary(s) {
  const emails = inbox(s);
  const statuses = emails.map((e) => readingStatus(s, e).key);
  const reg = register(s);
  const jobsToday = s.board.filter((j) => j.date === s.today && j.status !== 'cancelled').length;
  return {
    jobsToday,
    jobsAhead: s.board.filter((j) => j.date > s.today && j.status !== 'cancelled').length,
    emails: emails.length,
    unread: statuses.filter((k) => k === 'unread').length,
    needAction: statuses.filter((k) => ['differs', 'missing', 'needs_details', 'to_cancel'].includes(k)).length,
    licensingDue: reg.filter((i) => i.urgency.level === 'overdue' || i.urgency.level === 'urgent').length,
    licensingSoon: reg.filter((i) => i.urgency.level === 'soon').length,
    socialWaiting: s.social ? s.social.posts.filter((p, i) => !s.approved[i]).length : 0
  };
}

module.exports = {
  stateFor, reset, inbox, findEmail, readingStatus, readEmail, readAll, addCustomEmail,
  fixLeg, markSent, register, draftLicensing, draftSocial, summary, LIMITS,
  __states: states, __shared: shared
};
