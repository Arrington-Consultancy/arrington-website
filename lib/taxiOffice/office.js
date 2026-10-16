'use strict';

// The office's working state, one per signed-in visitor: their own copy of
// the dispatch board, what has been read, put right, drafted, approved and
// "sent". Held in memory for four hours and never written to the database:
// the records are made up, and two prospects looking at the office at once
// must not see each other's changes.
//
// What the AI reads and drafts from the demo's own emails is shared across
// visitors for the day, so the second person to open an email does not pay
// for it again. Their state still starts fresh.
//
// The office talks to two connections and never round them:
//   the mailbox  (./mail)      where emails come from and replies wait
//   dispatch     (./dispatch)  where the Bookings worker books, corrects
//                              and cancels jobs
// On this site both are the demo ones; a live office sets their variables.

const crypto = require('crypto');
const data = require('./data');
const match = require('./match');
const ai = require('./ai');
const prepared = require('./prepared');
const workers = require('./workers');
const { createMailbox, driverName: mailDriverName } = require('./mail');
const { createOfficeDispatch, DispatchNotConfigured } = require('./dispatch');
const { londonParts } = require('../../taxi-demo/lib/fares');

const TTL = 4 * 60 * 60 * 1000;
const MAX_STATES = 500;
const HOUR = 60 * 60 * 1000;
const MAILBOX_REFRESH = 2 * 60 * 1000;
const LIMITS = { custom: 10, social: 6, read: 60 };

const states = new Map();
const shared = new Map();

let mailbox = null;
let dispatch = null;
function getMailbox() {
  if (!mailbox) {
    try { mailbox = createMailbox(); } catch (e) {
      console.warn(`Taxi office: ${e.message}; using the demo inbox.`);
      mailbox = createMailbox('demo');
    }
  }
  return mailbox;
}
function getDispatch() {
  if (!dispatch) dispatch = createOfficeDispatch();
  return dispatch;
}
// Tests swap the connections; nothing else should.
function __setConnectionsForTests({ mail, disp } = {}) {
  if (mail !== undefined) mailbox = mail;
  if (disp !== undefined) dispatch = disp;
}

function fresh(today) {
  return {
    today,
    board: data.seedBoard(today),
    readings: {},
    complaints: {},
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

// ---- The mailbox -------------------------------------------------------------

// A real mailbox is read at most every two minutes and shared by everyone in
// the office; the demo one is the made-up inbox for today.
async function refreshMailbox(s, { force = false } = {}) {
  const box = getMailbox();
  if (box.name === 'demo') return { ok: true };
  const cached = shared.get('mailbox');
  if (!force && cached && Date.now() - cached.at < MAILBOX_REFRESH) return { ok: true };
  try {
    const emails = await box.listInbox({ max: 25 });
    shared.set('mailbox', { value: emails, at: Date.now() });
    return { ok: true };
  } catch (e) {
    console.warn(`Taxi office: the mailbox could not be read: ${e.message}`);
    return { ok: false, message: e.message };
  }
}

function mailboxEmails(s) {
  const box = getMailbox();
  if (box.name === 'demo') return data.seedInbox(s.today);
  const cached = shared.get('mailbox');
  return cached ? cached.value : [];
}

// Newest first, the visitor's own test emails at the top.
function inbox(s) {
  const own = s.custom.slice().reverse();
  const box = mailboxEmails(s).slice().sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return [...own, ...box];
}

function findEmail(s, id) {
  return inbox(s).find((e) => e.id === id) || null;
}

// Which worker an email belongs to: plain code on the AI's reading of it.
function workerOf(s, email) {
  const r = s.readings[email.id];
  return r && r.data ? workers.workerForIntent(r.data.intent) : null;
}

function readingStatus(s, email) {
  const r = s.readings[email.id];
  if (!r || !r.data) return { key: 'unread', ...match.STATUS.unread };
  const cmp = match.compare(r.data, s.board);
  return { key: cmp.status, ...match.STATUS[cmp.status] };
}

function fallbackNote(kind) {
  if (!ai.aiEnabled()) return `The AI is switched off on this server, so this is the ${kind} prepared for this demo email.`;
  return `The AI could not be reached just now, or this hour's AI readings are used up, so this is the ${kind} prepared for this demo email.`;
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
  let result = null;
  if (ai.aiEnabled() && allow(s, email.custom ? 'custom' : 'read')) {
    try {
      const value = await ai.readBookingEmail(email, s.today);
      result = { data: value, source: 'ai', model: ai.MODEL };
      if (!email.custom) shared.set(cacheKey, { value: result, at: Date.now() });
    } catch (e) {
      console.warn(`Taxi office: the AI could not read email ${email.id}: ${e.status || e.code || ''} ${String(e.message || e).slice(0, 200)}`);
    }
  }
  if (!result) {
    result = email.prepared
      ? { data: email.prepared, source: 'prepared', note: fallbackNote('answer') }
      : { data: null, source: 'error', note: ai.aiEnabled() ? 'The AI could not read this one just now. Try again in a moment.' : 'The AI is switched off on this server, so it cannot read a new email.' };
  }
  s.readings[email.id] = result;
  if (result.data && result.data.intent === 'complaint') await handleComplaint(s, email);
  return result;
}

async function readAll(s) {
  const unread = inbox(s).filter((e) => !e.custom && !(s.readings[e.id] && s.readings[e.id].data));
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

// ---- Bookings: putting dispatch right -----------------------------------------

// Put dispatch right for one leg of one email: add the job, correct it, or
// cancel it, through the dispatch connection. Only what the comparison says
// is needed; anything else is a no. A connection that refuses (a slot not yet
// written) says so, and the board does not change.
async function fixLeg(s, email, legIndex) {
  const r = s.readings[email.id];
  if (!r || !r.data) return { ok: false, message: 'Read the email first.' };
  const cmp = match.compare(r.data, s.board);
  const leg = cmp.legs.find((l) => l.index === legIndex);
  if (!leg) return { ok: false, message: 'That journey is not in this email.' };
  const ext = r.data;
  const disp = getDispatch();
  const where = disp.name === 'demo' ? 'dispatch' : disp.label;
  try {
    if (leg.status === 'missing') {
      const j = leg.journey;
      const job = await disp.addJob(s, {
        date: j.date, time: j.time, name: ext.customer_name || 'Customer', phone: ext.phone,
        pickup: j.pickup, destination: j.destination, passengers: j.passengers || 1, vehicle: j.vehicle || 'saloon',
        source: 'Email', notes: j.needs || ''
      });
      s.changes.unshift({ ref: job.ref, what: `Booked from ${ext.customer_name || 'an email'}'s email`, emailId: email.id });
      return { ok: true, message: `Booked into ${where} as ${job.ref}.` };
    }
    if (leg.status === 'differs') {
      const VEH = Object.fromEntries(Object.entries(match.VEHICLE_LABELS).map(([k, v]) => [v, k]));
      const changes = {};
      for (const d of leg.diffs) {
        if (d.field === 'passengers') changes.passengers = Number(d.email);
        else if (d.field === 'vehicle') changes.vehicle = VEH[d.email] || leg.job.vehicle;
        else changes[d.field] = d.email;
      }
      const job = await disp.updateJob(s, leg.job.ref, changes);
      s.changes.unshift({ ref: job.ref, what: `Corrected ${leg.diffs.map((d) => d.label.toLowerCase()).join(', ')}`, emailId: email.id });
      return { ok: true, message: `${job.ref} corrected in ${where}.` };
    }
    if (leg.status === 'to_cancel') {
      await disp.cancelJob(s, leg.job.ref);
      s.changes.unshift({ ref: leg.job.ref, what: 'Cancelled at the customer\'s request', emailId: email.id });
      return { ok: true, message: `${leg.job.ref} cancelled in ${where}.` };
    }
  } catch (e) {
    if (e instanceof DispatchNotConfigured || e.code === 'DISPATCH_NOT_CONFIGURED') return { ok: false, message: e.message };
    console.warn(`Taxi office: dispatch refused a change for ${email.id}: ${e.message}`);
    return { ok: false, message: `Dispatch did not take that change: ${e.message}` };
  }
  return { ok: false, message: 'Nothing to put right for that journey.' };
}

// ---- Customer emails and complaints: what dispatch holds -----------------------

function longTimeline(job) {
  return (job.record && job.record.timeline || []).map(([t, what]) => `${t} ${what}`).join('; ');
}

// The facts the Complaints worker is given about a job: what dispatch holds,
// in plain lines, worked out by code. A reply may rest on these and nothing
// else about the journey.
function recordFacts(job) {
  const r = job.record || {};
  const lines = [
    `Booking ${job.ref}: ${data.longDate(job.date)} at ${job.time}, ${job.name}, from ${job.pickup} to ${job.destination}, ${job.passengers} passenger${job.passengers === 1 ? '' : 's'}, booked by ${String(job.source || '').toLowerCase()}.${job.notes ? ` Notes: ${job.notes}.` : ''}`
  ];
  if (r.driver) lines.push(`Driver: ${r.driver}. Car: ${r.car}, ${r.reg}, ${r.licence}.`);
  if (r.timeline && r.timeline.length) lines.push(`What happened: ${longTimeline(job)}.`);
  if (r.controller) lines.push(`Controller's note: ${r.controller}`);
  if (r.fare) lines.push(`Fare charged: ${r.fare}, paid by ${String(r.paid || '').toLowerCase()}.`);
  const f = match.fareCheck(job);
  if (f) lines.push(f.differs ? `Fare table for this journey: ${f.then} at the time it ran (night rate, 10pm to 6am), ${f.day} by day.` : `Fare table for this journey: ${f.then}.`);
  return lines;
}

// The completed jobs a customer email or complaint is about.
function pastJobsFor(s, email) {
  const r = s.readings[email.id];
  if (!r || !r.data) return [];
  return match.findPastJobs(r.data, (r.data.journeys || [])[0] || null, s.board);
}

async function handleComplaint(s, email, { force = false } = {}) {
  const r = s.readings[email.id];
  if (!r || !r.data) return null;
  if (!force && s.complaints[email.id]) return s.complaints[email.id];
  const jobs = pastJobsFor(s, email);
  const job = jobs.length === 1 ? jobs[0] : null;
  const lines = job ? recordFacts(job) : [];
  const cacheKey = `cmp|${s.today}|${email.id}`;
  let result = null;
  if (!email.custom && !force && shared.has(cacheKey)) {
    result = { ...shared.get(cacheKey).value };
  } else if (ai.aiEnabled() && allow(s, email.custom ? 'custom' : 'read')) {
    try {
      const value = await ai.draftComplaint({ email, recordLines: lines }, s.today);
      result = { data: value, source: 'ai', model: ai.MODEL };
      if (!email.custom) shared.set(cacheKey, { value: result, at: Date.now() });
    } catch (e) {
      console.warn(`Taxi office: the AI could not draft the complaint reply for ${email.id}: ${e.status || e.code || ''} ${String(e.message || e).slice(0, 200)}`);
    }
  }
  if (!result) {
    const p = prepared.complaintDraft(email.id);
    result = p
      ? { data: p, source: 'prepared', note: fallbackNote('reply') }
      : { data: null, source: 'error', note: ai.aiEnabled() ? 'The AI could not draft this one just now. Try again in a moment.' : 'The AI is switched off on this server, so it cannot answer a new complaint.' };
  }
  s.complaints[email.id] = { ...result, jobRef: job ? job.ref : null, candidates: jobs.map((j) => j.ref), lines, loggedAt: email.receivedAt };
  return s.complaints[email.id];
}

// The complaints log: every email read as a complaint, newest first.
function complaintsLog(s) {
  return inbox(s)
    .filter((e) => s.readings[e.id] && s.readings[e.id].data && s.readings[e.id].data.intent === 'complaint')
    .map((e) => ({ email: e, reading: s.readings[e.id], complaint: s.complaints[e.id] || null, sent: s.sent[e.id] || null, job: s.board.find((j) => j.ref === (s.complaints[e.id] || {}).jobRef) || null }));
}

// What Complaints has passed to Licensing this session.
function passedToLicensing(s) {
  return complaintsLog(s).filter((c) => c.complaint && c.complaint.data && c.complaint.data.for_licensing);
}

// ---- Replies -----------------------------------------------------------------

// A reply: in the demo, recorded on the page and sent nowhere. With a real
// mailbox connected, saved as a draft in the firm's own mailbox, threaded on
// the email it answers, for a person to send from there.
async function markSent(s, email, text) {
  const reply = String(text || '').replace(/\r/g, '').trim().slice(0, 3000);
  if (!reply) return { ok: false, message: 'The reply is empty.' };
  const box = getMailbox();
  if (box.name !== 'demo' && !email.custom) {
    try {
      const { draftId } = await box.saveReplyDraft(email, reply);
      s.sent[email.id] = { text: reply, at: Date.now(), draftId, where: box.label };
      return { ok: true, message: `Saved as a draft in ${box.label}, on the same thread. Send it from there.` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }
  s.sent[email.id] = { text: reply, at: Date.now() };
  return { ok: true, message: 'Reply marked as sent. In this demo nothing leaves the office.' };
}

// ---- Licensing and social ----------------------------------------------------

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

// ---- The day at a glance -------------------------------------------------------

function summary(s) {
  const emails = inbox(s);
  const statuses = emails.map((e) => readingStatus(s, e).key);
  const reg = register(s);
  const complaints = complaintsLog(s);
  return {
    jobsToday: s.board.filter((j) => j.date === s.today && j.status !== 'cancelled').length,
    jobsAhead: s.board.filter((j) => j.date > s.today && j.status !== 'cancelled').length,
    emails: emails.length,
    unread: statuses.filter((k) => k === 'unread').length,
    needAction: statuses.filter((k) => ['differs', 'missing', 'needs_details', 'to_cancel'].includes(k)).length,
    complaintsOpen: complaints.filter((c) => !c.sent).length,
    licensingDue: reg.filter((i) => i.urgency.level === 'overdue' || i.urgency.level === 'urgent').length + passedToLicensing(s).length,
    licensingSoon: reg.filter((i) => i.urgency.level === 'soon').length,
    socialWaiting: s.social ? s.social.posts.filter((p, i) => !s.approved[i]).length : 0
  };
}

// For the pages: which connections the office is on.
function connections() {
  const box = getMailbox();
  const disp = getDispatch();
  return { mailbox: box.label, mailboxDemo: box.name === 'demo', dispatch: disp.label, dispatchDemo: disp.name === 'demo', mailDriver: mailDriverName() };
}

module.exports = {
  stateFor, reset, inbox, findEmail, workerOf, readingStatus, readEmail, readAll, addCustomEmail, refreshMailbox,
  fixLeg, markSent, register, draftLicensing, draftSocial, summary, connections,
  recordFacts, pastJobsFor, handleComplaint, complaintsLog, passedToLicensing, LIMITS,
  __states: states, __shared: shared, __setConnectionsForTests
};
