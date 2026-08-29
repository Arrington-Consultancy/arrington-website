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

module.exports = {
  NOTIFY_FROM,
  demoInbox,
  sendGapNotification,
  __setTransportForTests,
  __resetTransportForTests
};
