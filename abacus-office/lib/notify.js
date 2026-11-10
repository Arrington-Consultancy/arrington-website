'use strict';

// Telling Tom when a watched person is in the office, and what they did
// (Tom, 10 November 2026: "I want to know when he is in and what he does").
// The office has no email account of its own, so it posts a short notice to
// the Arrington site (routes/officeNotice.js), which emails Tom through the
// transport it already uses for his guest alerts. The office never chooses
// the recipient. Watched usernames: ABACUS_OFFICE_WATCH_USERNAMES, default
// "dan"; an empty value watches nobody. Needs ABACUS_OFFICE_NOTICE_KEY
// (32+ characters, shared with the site by a Railway reference); without it
// nothing is sent and the boot line says so. Never awaited by a request,
// never able to break one.

const visits = require('./visits');

function config(env = process.env) {
  const key = String(env.ABACUS_OFFICE_NOTICE_KEY ?? '').trim();
  const url = String(env.ABACUS_OFFICE_NOTICE_URL || 'https://www.arringtonconsultancy.com/api/office-notice').trim();
  const raw = env.ABACUS_OFFICE_WATCH_USERNAMES;
  const watch = (raw === undefined ? 'dan' : String(raw)).split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return { key: key.length >= 32 ? key : '', keyLength: key.length, url, watch, office: String(env.ABACUS_OFFICE_PUBLIC_URL || 'https://www.a2bstaff.com').replace(/\/$/, '') };
}

function describeNoticeStatus(env = process.env) {
  const c = config(env);
  if (!c.watch.length) return 'Abacus office notices: watching nobody';
  if (!c.key) return `Abacus office notices: off for ${c.watch.join(', ')} (ABACUS_OFFICE_NOTICE_KEY ${c.keyLength ? `is ${c.keyLength} chars, needs 32 or more` : 'not set'})`;
  return `Abacus office notices: Tom is emailed when ${c.watch.join(', ')} signs in and when their visit ends (key ${c.keyLength} chars)`;
}

function watched(username, env = process.env) {
  return config(env).watch.includes(String(username || '').toLowerCase());
}

async function post(subject, text, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const c = config(env);
  if (!c.key) return { sent: false, reason: 'no notice key' };
  try {
    const res = await fetchImpl(c.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-office-notice-key': c.key }, body: JSON.stringify({ subject, text }), signal: AbortSignal.timeout(15000) });
    if (!res.ok) { console.error(`Abacus office: notice "${subject}" not sent (${res.status})`); return { sent: false, reason: `status ${res.status}` }; }
    console.log(`Abacus office: notice sent to Tom: ${subject}`);
    return { sent: true };
  } catch (e) {
    console.error(`Abacus office: notice "${subject}" not sent (${e.message})`);
    return { sent: false, reason: e.message };
  }
}

async function signedIn(user, opts = {}) {
  const env = opts.env || process.env;
  if (!user || !watched(user.username, env)) return { sent: false, reason: 'not watched' };
  const c = config(env);
  const text = [
    `${user.username} signed in to the office at ${visits.ukTime(new Date())} (UK).`,
    '',
    'You will get a second email with everything they did when they sign out, or after 20 minutes with nothing done.',
    '',
    `Activity, Who has been in: ${c.office}/activity`
  ].join('\n');
  return post(`${user.username} is in the office now`, text, opts);
}

function visitText(v, office) {
  const steps = Array.isArray(v.pages) ? v.pages : [];
  const how = v.ended_how === 'signed out' ? 'signed out' : v.ended_how === 'idle' ? 'left (20 minutes with nothing done)' : v.ended_how || 'ended';
  const lines = [
    `${v.user_name} was in the office from ${visits.ukTime(v.started_at)} for ${visits.minutes(v)} min and ${how}.`,
    '',
    'What they did:'
  ];
  for (const x of steps) lines.push(`${new Date(x.at).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}  ${x.what}`);
  lines.push('', `Activity, Who has been in: ${office}/activity`);
  return lines.join('\n');
}

async function visitEnded(v, opts = {}) {
  const env = opts.env || process.env;
  if (!v || !watched(v.user_name, env)) return { sent: false, reason: 'not watched' };
  return post(`what ${v.user_name} did (${visits.minutes(v)} min)`, visitText(v, config(env).office), opts);
}

// Every closed visit: one line in the log, and an email to Tom for a
// watched person.
function closed(rows, opts = {}) {
  for (const v of rows || []) {
    console.log(visits.summaryLine(v));
    visitEnded(v, opts).catch(() => {});
  }
}

module.exports = { config, describeNoticeStatus, watched, post, signedIn, visitEnded, visitText, closed };
