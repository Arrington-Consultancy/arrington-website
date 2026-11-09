'use strict';

// The one email this office sends on its own: a note to a manager when a
// reply has waited past the escalation time with nobody approving it
// (proposal of 9 November 2026: "goes red on Today and emails the manager,
// never auto-sends"). Nothing here can write to a customer: the recipient
// comes only from the service's variables, never from an email or a case.
//
// Needs, on the service: ABACUS_OFFICE_SMTP_HOST, _PORT (default 587),
// _USER, _PASSWORD, _FROM, and ABACUS_OFFICE_MANAGER_EMAIL. Unset, the
// escalation still shows on Today and the boot line says no email can go.

function smtpConfig(env = process.env) {
  const host = String(env.ABACUS_OFFICE_SMTP_HOST || '').trim();
  const user = String(env.ABACUS_OFFICE_SMTP_USER || '').trim();
  const pass = String(env.ABACUS_OFFICE_SMTP_PASSWORD || '').trim();
  const from = String(env.ABACUS_OFFICE_SMTP_FROM || user).trim();
  const to = String(env.ABACUS_OFFICE_MANAGER_EMAIL || '').trim();
  const port = Number(env.ABACUS_OFFICE_SMTP_PORT || 587);
  return { host, user, pass, from, to, port, ready: Boolean(host && user && pass && from && to) };
}

function describeAlertStatus(env = process.env) {
  const c = smtpConfig(env);
  if (c.ready) return `Abacus office alerts: escalation emails go to ${c.to} via ${c.host}`;
  const missing = ['ABACUS_OFFICE_SMTP_HOST', 'ABACUS_OFFICE_SMTP_USER', 'ABACUS_OFFICE_SMTP_PASSWORD', 'ABACUS_OFFICE_MANAGER_EMAIL'].filter((k) => !String(env[k] || '').trim());
  return `Abacus office alerts: escalation shows on Today only, no email can go (missing ${missing.join(', ')})`;
}

let transportFactory = (c) => {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass } });
};
function __setTransportFactoryForTests(fn) { transportFactory = fn; }

async function sendEscalation({ cases, hours, baseUrl, firmName }, env = process.env) {
  const c = smtpConfig(env);
  if (!c.ready) return { sent: false, reason: 'not configured' };
  const lines = cases.map((k) => `- ${k.subject || '(no subject)'} from ${k.from_address}, received ${new Date(k.received_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}${baseUrl ? ` ${baseUrl}/case/${k.id}` : ''}`);
  const text = [
    `${cases.length === 1 ? 'One reply has' : `${cases.length} replies have`} waited more than ${hours} hours in the ${firmName} office without anyone approving ${cases.length === 1 ? 'it' : 'them'}.`,
    '',
    ...lines,
    '',
    'Nothing has been sent to the customer. Someone needs to open the case, check the draft and approve it, or mark it done.'
  ].join('\n');
  const transport = transportFactory(c);
  const info = await transport.sendMail({ from: c.from, to: c.to, subject: `${firmName} office: ${cases.length} ${cases.length === 1 ? 'reply' : 'replies'} waiting more than ${hours} hours`, text });
  return { sent: true, messageId: info && info.messageId };
}

module.exports = { smtpConfig, describeAlertStatus, sendEscalation, __setTransportFactoryForTests };
