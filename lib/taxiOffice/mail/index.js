'use strict';

// The office's mailbox connector (Tom, 16/10/2026: "We need an email
// connector api built in"). The one place the office reads a firm's inbox
// and leaves a reply waiting in it. Everything above it talks to this
// interface and never to a mail provider, so connecting a real operator is
// a matter of setting their mailbox's variables, not changing the office.
//
// A driver is an object with:
//   name, label             short id and what the firm would call it
//   configured()            true when it has what it needs to run
//   missing()               the variable names it still needs, for the boot log
//   listInbox({ max })      -> [{ id, from, subject, receivedAt, body,
//                               threadId, messageId }]
//                           receivedAt is London time, 'YYYY-MM-DDTHH:MM'.
//   saveReplyDraft(email, text) -> { draftId }
//                           Leaves the reply as a DRAFT in the firm's own
//                           mailbox, threaded on the email it answers. A
//                           person opens their mail and presses send.
//
// No driver sends. There is no send function in this folder, on purpose:
// the AI drafts and a person decides, here as everywhere in the office.
//
// Drivers:
//   demo     the made-up Tidewell inbox (lib/taxiOffice/data.js). The default.
//   gmail    Google Workspace or Gmail, through the Gmail API.
//   outlook  Microsoft 365 or Outlook.com, through Microsoft Graph.
//
// Each real driver reads ONLY its own TAXI_OFFICE_* variables. It never
// falls back to GMAIL_CLIENT_ID and friends, which are the credentials for
// Tom's own inbox in the Arrington Workspace: a demo must never be able to
// read that mailbox, whatever is or is not set.

const DRIVERS = {
  demo: () => require('./demo'),
  gmail: () => require('./gmail'),
  outlook: () => require('./outlook')
};

class MailNotConfigured extends Error {
  constructor(label, missing) {
    super(`${label} is not connected yet. It needs ${missing.join(', ')}.`);
    this.name = 'MailNotConfigured';
    this.code = 'MAIL_NOT_CONFIGURED';
  }
}

class MailError extends Error {
  constructor(label, what, status, detail) {
    super(`${label} could not ${what}${status ? ` (${status})` : ''}${detail ? `: ${detail}` : ''}`);
    this.name = 'MailError';
    this.code = 'MAIL_ERROR';
    this.status = status || null;
  }
}

function driverName(env = process.env) {
  return String(env.TAXI_OFFICE_MAIL_DRIVER || 'demo').trim().toLowerCase() || 'demo';
}

function createMailbox(name = driverName(), options = {}) {
  const make = DRIVERS[String(name).toLowerCase()];
  if (!make) throw new Error(`Unknown mailbox driver "${name}". Known: ${Object.keys(DRIVERS).join(', ')}`);
  return make().create(options);
}

// One line for the boot log: which mailbox, and whether it can run. Names
// the missing variables, never a value.
function describeMailStatus(env = process.env) {
  const name = driverName(env);
  if (!DRIVERS[name]) return `Taxi office mailbox: unknown driver "${name}", the office falls back to the demo inbox`;
  const box = createMailbox(name, { env });
  if (name === 'demo') return 'Taxi office mailbox: demo (the made-up Tidewell inbox)';
  return `Taxi office mailbox: ${box.label}, ${box.configured() ? 'configured' : `NOT configured, missing ${box.missing().join(', ')}`}`;
}

// Header values come from outside: strip anything that could start a new
// header line before they go into a message.
const headerSafe = (v) => String(v || '').replace(/[\r\n]+/g, ' ').trim();

function replySubject(subject) {
  const s = headerSafe(subject);
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

module.exports = { createMailbox, describeMailStatus, driverName, MailNotConfigured, MailError, headerSafe, replySubject, DRIVERS };
