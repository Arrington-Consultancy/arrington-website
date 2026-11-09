'use strict';

// Which mailbox this office reads. The real drivers are the Tidewell
// office's (lib/taxiOffice/mail): Gmail API, Microsoft Graph, or a free
// Gmail account over IMAP. They are written to read only TAXI_OFFICE_*
// variables, and this service keeps its own ABACUS_OFFICE_* names so a
// variable can never be mistaken for the Arrington site's, so the two are
// mapped here, name for name, and nothing else from this process's
// environment is passed through. GMAIL_* (Tom's own inbox) is never read.
//
// No driver sends. An approved reply is saved as a DRAFT in the firm's own
// mailbox for a person to send; the demo driver saves it nowhere and the
// office says so.

const mail = require('../../lib/taxiOffice/mail');
const demoInbox = require('./demoInbox');

const MAPPED = [
  'MAIL_DRIVER', 'DEMO_ADDRESS',
  'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_QUERY',
  'OUTLOOK_TENANT_ID', 'OUTLOOK_CLIENT_ID', 'OUTLOOK_CLIENT_SECRET', 'OUTLOOK_REFRESH_TOKEN',
  'IMAP_PASSWORD', 'IMAP_HOST'
];

function driverEnv(env = process.env) {
  const out = {};
  // The firm's own mailbox address, which the IMAP driver signs in with.
  // The Tidewell driver calls it the demo address; here it is the firm's.
  if (env.ABACUS_OFFICE_MAILBOX_ADDRESS !== undefined) out.TAXI_OFFICE_DEMO_ADDRESS = env.ABACUS_OFFICE_MAILBOX_ADDRESS;
  for (const k of MAPPED) {
    const v = env[`ABACUS_OFFICE_${k}`];
    if (v !== undefined) out[`TAXI_OFFICE_${k}`] = v;
  }
  return out;
}

function driverName(env = process.env) {
  return String(env.ABACUS_OFFICE_MAIL_DRIVER || 'demo').trim().toLowerCase() || 'demo';
}

function demoDriver() {
  return {
    name: 'demo',
    label: 'Made-up inbox',
    demo: true,
    configured: () => true,
    missing: () => [],
    listInbox: async ({ today = demoInbox.todayLondon() } = {}) => demoInbox.seedInbox(today),
    account: async () => null,
    saveReplyDraft: async () => ({ draftId: null })
  };
}

function createMailbox(env = process.env) {
  const name = driverName(env);
  if (name === 'demo') return demoDriver();
  if (!mail.DRIVERS[name]) throw new Error(`Unknown mailbox driver "${name}". Known: demo, ${Object.keys(mail.DRIVERS).filter((d) => d !== 'demo').join(', ')}`);
  const box = mail.createMailbox(name, { env: driverEnv(env) });
  box.demo = false;
  return box;
}

function describeMailStatus(env = process.env) {
  const name = driverName(env);
  if (name === 'demo') return 'Abacus office mailbox: made-up inbox (no real mailbox is connected; nothing is read from or saved to a live account)';
  if (!mail.DRIVERS[name]) return `Abacus office mailbox: unknown driver "${name}"; the office will not start`;
  const box = createMailbox(env);
  const refused = box.refusal ? box.refusal() : '';
  const state = refused ? `REFUSED: ${refused}` : box.configured() ? 'configured' : `NOT configured, missing ${box.missing().map((v) => v === 'TAXI_OFFICE_DEMO_ADDRESS' ? 'ABACUS_OFFICE_MAILBOX_ADDRESS' : v.replace(/^TAXI_OFFICE_/, 'ABACUS_OFFICE_')).join(', ')}`;
  return `Abacus office mailbox: ${box.label}, ${state}`;
}

module.exports = { createMailbox, describeMailStatus, driverName, driverEnv, MAPPED };
