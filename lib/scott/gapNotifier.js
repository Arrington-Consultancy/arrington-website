// Scott AI Demonstration: sending a Brain Gap to the person who owns the
// record, and recording what actually happened.
//
// The rule this file exists to keep is a small one that is easy to break:
// the interface may only say "[name] has been emailed" AFTER a send has
// genuinely succeeded. That is not enforceable by being careful in the
// route, because the natural way to write the route is to send and then
// say it sent. So the send returns a delivery RESULT, the result is
// written to the gap row, and every sentence the user sees about
// notification is built from that row (see describeNotification in
// brainGaps.js). There is no code path that can claim a send that did not
// happen, because nothing else is allowed to author that sentence.
//
// Failure discipline: one retry, then stop and record the real error.
// Retrying forever hides a broken mailbox behind a queue, and reporting a
// failure as a success is the specific dishonesty being designed out.

const nodemailer = require('nodemailer');
const { buildGapEmail } = require('./brainGaps');

// The same authorised path the rest of the site sends on: Gmail SMTP
// under tom@arringtonconsultancy.com, gated on GMAIL_APP_PASSWORD. No new
// provider, no second credential.
const NOTIFY_FROM = 'tom@arringtonconsultancy.com';

// Fictional staff have no mailboxes. Every notification is delivered to a
// real demonstration inbox and names its fictional recipient in the body.
// Overridable so a live demonstration can point it at the visitor.
function demoInbox() {
  return process.env.SCOTT_DEMO_NOTIFY_EMAIL || NOTIFY_FROM;
}

let transporterOverride;
function __setTransportForTests(t) { transporterOverride = t; }
function __resetTransportForTests() { transporterOverride = undefined; }

let cached;
function getTransport() {
  if (transporterOverride !== undefined) return transporterOverride;
  if (cached !== undefined) return cached;
  cached = process.env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: NOTIFY_FROM, pass: process.env.GMAIL_APP_PASSWORD }
      })
    : null;
  return cached;
}

const RETRY_DELAY_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sends one gap notification. Returns a delivery result and never throws:
// a gap that could not be delivered is still a gap that must be recorded,
// so a mail failure must not take the record down with it.
//
// attempts is always the number genuinely made, so "2" in the register
// means the retry really ran.
async function sendGapNotification(plan, { portalUrl, recipientEmail, sleepFn = sleep } = {}) {
  const to = recipientEmail || demoInbox();
  const transport = getTransport();
  if (!transport) {
    // Not a failure to report as one: nothing was attempted, so nothing
    // can be claimed. The gap stays open and unnotified, and the register
    // says why in plain words rather than showing an empty error.
    return {
      emailStatus: 'failed',
      emailTo: to,
      attempts: 0,
      error: 'email is not configured in this environment (GMAIL_APP_PASSWORD is not set), so nothing was sent'
    };
  }

  const { subject, text } = buildGapEmail(plan, {
    portalUrl,
    recipientLabel: [
      '',
      '--',
      `Sent by the Scott's Armchair & Knitting Service demonstration portal on behalf of the ${plan.raisedByWorkerId || 'AI'} worker.`,
      `Addressed to ${plan.responsibleName}, a fictional member of staff in this demonstration. Delivered to ${to} because the demonstration has no real mailboxes.`
    ].join('\n')
  });

  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await transport.sendMail({
        from: NOTIFY_FROM,
        to,
        subject: `[Scott demo] ${subject}`,
        text
      });
      return { emailStatus: 'sent', emailTo: to, attempts: attempt, error: '' };
    } catch (err) {
      lastError = (err && err.message) || String(err);
      if (attempt === 1) await sleepFn(RETRY_DELAY_MS);
    }
  }

  return { emailStatus: 'failed', emailTo: to, attempts: 2, error: lastError };
}

// ------------------------------------------------------------
// Invited-viewer login alert
// ------------------------------------------------------------
// Tells Tom when a named invited viewer signs in to the demonstration, so
// he can be at his phone while they are actually in it. That matters
// because the proposal queue (lib/scott/brainCandidates.js) needs a human
// to approve a fact before any worker can use it: the brain appears to
// adapt during a visit only if somebody is approving during the visit.
//
// Named accounts only, from SCOTT_LOGIN_ALERT_USERNAMES (default 'will'),
// so Tom's own logins and the fictional staff logins do not send anything.
// Set it to an empty string to turn the alert off without a code change.
//
// Recipient is the demonstration inbox or SCOTT_DEMO_NOTIFY_EMAIL, never
// the contact.email CMS row. That row is editable by anyone holding
// edit_content, and a notification that tells you who is in your
// demonstration should not be redirectable from inside the CMS. Same
// reasoning as workspace governance finding H1.
function loginAlertUsernames() {
  const raw = process.env.SCOTT_LOGIN_ALERT_USERNAMES;
  const list = raw === undefined ? 'will' : raw;
  return list.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function shouldAlertOnLogin(username) {
  return loginAlertUsernames().includes(String(username || '').trim().toLowerCase());
}

// Never throws and is not awaited by the login route: a mail problem must
// not slow down or break somebody signing in to the demonstration. The
// return value says what actually happened rather than assuming, so a
// caller (or a test) can tell a send from a skip.
async function sendLoginNotification({ username, pendingFacts = null, when = new Date() } = {}) {
  if (!shouldAlertOnLogin(username)) return { sent: false, reason: 'not a watched account' };
  const transport = getTransport();
  const to = demoInbox();
  if (!transport) {
    return { sent: false, to, reason: 'email is not configured in this environment (GMAIL_APP_PASSWORD is not set), so nothing was sent' };
  }
  const stamp = when.toLocaleString('en-GB', { timeZone: 'Europe/London' });
  const waiting = Number.isInteger(pendingFacts)
    ? (pendingFacts === 0
      ? 'Nothing is waiting for you to approve at the moment.'
      : `${pendingFacts} proposed fact${pendingFacts === 1 ? ' is' : 's are'} waiting for you to approve at ${SITE}/scott/gaps. A worker cannot use any of them until you do.`)
    : 'The proposal queue could not be counted just now.';
  try {
    await transport.sendMail({
      from: NOTIFY_FROM,
      to,
      subject: `${username} has just logged in to the Scott demonstration`,
      text: [
        `${username} signed in to the Scott AI Demonstration at ${stamp} (UK time).`,
        '',
        waiting,
        '',
        'This is a notification only. Nothing has been sent to them and nothing has changed in the demonstration.'
      ].join('\n')
    });
    return { sent: true, to };
  } catch (err) {
    // Reported, not swallowed and not dressed up as a send.
    console.error('Scott login notification failed:', err.message);
    return { sent: false, to, reason: err.message };
  }
}

const SITE = process.env.SCOTT_PORTAL_ORIGIN || 'https://www.arringtonconsultancy.com';

// ------------------------------------------------------------
// Evolution briefing
// ------------------------------------------------------------
// Autofill lets the fictional company answer questions it holds no record
// for and keep the answer, unattended. Without this, facts enter Scott's
// company that nobody reads, and the first anybody knows of an off-tone or
// badly-sized one is meeting it in front of a prospect.
//
// Interval is SCOTT_DIGEST_HOURS (default 24, minimum 1). The clock is the
// database, not this process: the last send is read from scott_activity,
// so a deploy cannot reset the schedule and produce a second copy of a
// briefing already delivered. This app restarts on every push, which today
// was several times an hour.
//
// Sends nothing when nothing has changed. A briefing that arrives daily
// saying "no change" is one that stops being read.
function digestIntervalHours() {
  const raw = Number(process.env.SCOTT_DIGEST_HOURS);
  if (!Number.isFinite(raw) || raw < 1) return 24;
  return Math.min(raw, 24 * 14);
}

function digestIsDue(lastSentAt, now = new Date(), hours = digestIntervalHours()) {
  if (!lastSentAt) return true;
  return (now.getTime() - new Date(lastSentAt).getTime()) >= hours * 3600 * 1000;
}

// Returns what it actually did, never a claim it did not perform: sent,
// or not sent with the reason. The caller records the send only on a
// genuine success, so a failed briefing does not consume the window and
// silence the next one, which is the mistake governance finding H2 found
// in the unlock alert.
async function sendEvolutionDigest(digest) {
  const transport = getTransport();
  const to = demoInbox();
  if (!transport) {
    return { sent: false, to, reason: 'email is not configured in this environment (GMAIL_APP_PASSWORD is not set), so nothing was sent' };
  }
  try {
    await transport.sendMail({ from: NOTIFY_FROM, to, subject: digest.subject, text: digest.text });
    return { sent: true, to };
  } catch (err) {
    console.error('Scott evolution briefing failed:', err.message);
    return { sent: false, to, reason: err.message };
  }
}

module.exports = {
  NOTIFY_FROM,
  demoInbox,
  sendGapNotification,
  shouldAlertOnLogin,
  loginAlertUsernames,
  sendLoginNotification,
  digestIntervalHours,
  digestIsDue,
  sendEvolutionDigest,
  __setTransportForTests,
  __resetTransportForTests
};
