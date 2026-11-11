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
// Each company can have its own manager address (the review of 11 November
// 2026): ABACUS_OFFICE_MANAGER_EMAIL_<COMPANY>, for example
// ABACUS_OFFICE_MANAGER_EMAIL_COASTLINE; a company without one uses the
// general address.

function smtpConfig(env = process.env) {
  const host = String(env.ABACUS_OFFICE_SMTP_HOST || '').trim();
  const user = String(env.ABACUS_OFFICE_SMTP_USER || '').trim();
  const pass = String(env.ABACUS_OFFICE_SMTP_PASSWORD || '').trim();
  const from = String(env.ABACUS_OFFICE_SMTP_FROM || user).trim();
  const to = String(env.ABACUS_OFFICE_MANAGER_EMAIL || '').trim();
  const port = Number(env.ABACUS_OFFICE_SMTP_PORT || 587);
  const perBrand = {};
  for (const [k, v] of Object.entries(env)) {
    const m = /^ABACUS_OFFICE_MANAGER_EMAIL_([A-Z0-9_]+)$/.exec(k);
    if (m && String(v || '').trim()) perBrand[m[1].toLowerCase()] = String(v).trim();
  }
  const smtp = Boolean(host && user && pass && from);
  return { host, user, pass, from, to, port, perBrand, ready: smtp && Boolean(to || Object.keys(perBrand).length) };
}
// Who hears about a case: its company's manager address, or the general one.
function recipientFor(c, brand) { return c.perBrand[String(brand || '').toLowerCase()] || c.to; }
// Cases grouped by who should hear about them; cases with nobody to tell
// are left out (they still show on Today).
function groups(c, cases) {
  const by = new Map();
  for (const k of cases) {
    const to = recipientFor(c, k.brand);
    if (!to) continue;
    if (!by.has(to)) by.set(to, []);
    by.get(to).push(k);
  }
  return by;
}

function describeAlertStatus(env = process.env) {
  const c = smtpConfig(env);
  if (c.ready) {
    const extra = Object.entries(c.perBrand).map(([b, a]) => `${b}: ${a}`).join(', ');
    return `Abacus office alerts: escalation emails go to ${c.to || 'no general address'}${extra ? ` (by company: ${extra})` : ''} via ${c.host}`;
  }
  const missing = ['ABACUS_OFFICE_SMTP_HOST', 'ABACUS_OFFICE_SMTP_USER', 'ABACUS_OFFICE_SMTP_PASSWORD', 'ABACUS_OFFICE_MANAGER_EMAIL'].filter((k) => !String(env[k] || '').trim());
  return `Abacus office alerts: escalation shows on Today only, no email can go (missing ${missing.join(', ')})`;
}

let transportFactory = (c) => {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass } });
};
function __setTransportFactoryForTests(fn) { transportFactory = fn; }

const lineFor = (k, baseUrl) => `- ${k.subject || '(no subject)'} from ${k.from_address}, received ${new Date(k.received_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}${baseUrl ? ` ${baseUrl}/case/${k.id}` : ''}`;

// Each group goes to its own manager address. Returns the ids of the cases
// someone was actually told about.
async function sendGrouped(c, cases, build) {
  const transport = transportFactory(c);
  const sentIds = [];
  for (const [to, group] of groups(c, cases)) {
    const { subject, text } = build(group);
    await transport.sendMail({ from: c.from, to, subject, text });
    sentIds.push(...group.map((k) => k.id));
  }
  return { sent: sentIds.length > 0, sentIds };
}

async function sendEscalation({ cases, hours, baseUrl, firmName }, env = process.env) {
  const c = smtpConfig(env);
  if (!c.ready) return { sent: false, reason: 'not configured', sentIds: [] };
  return sendGrouped(c, cases, (group) => ({
    subject: `${firmName} office: ${group.length} ${group.length === 1 ? 'reply' : 'replies'} waiting more than ${hours} hours`,
    text: [
      `${group.length === 1 ? 'One reply has' : `${group.length} replies have`} waited more than ${hours} hours in the ${firmName} office without anyone approving ${group.length === 1 ? 'it' : 'them'}.`,
      '',
      ...group.map((k) => lineFor(k, baseUrl)),
      '',
      'Nothing has been sent to the customer. Someone needs to open the case, check the draft and approve it, or mark it done.'
    ].join('\n')
  }));
}

// A complaint past the nudge time, or one an operator has passed up, told
// to that company's manager address. Same transport.
async function sendNudge({ cases, hours, baseUrl, firmName, by = '' }, env = process.env) {
  const c = smtpConfig(env);
  if (!c.ready) return { sent: false, reason: 'not configured', sentIds: [] };
  return sendGrouped(c, cases, (group) => {
    const opening = by
      ? `${by} has passed ${group.length === 1 ? 'a complaint' : `${group.length} complaints`} up to a manager in the ${firmName} office.`
      : `${group.length === 1 ? 'One complaint has' : `${group.length} complaints have`} sat more than ${hours} hours in the ${firmName} office with no approved reply, so ${group.length === 1 ? 'it has' : 'they have'} been passed up to a manager.`;
    return {
      subject: `${firmName} office: ${group.length} ${group.length === 1 ? 'complaint' : 'complaints'} for a manager`,
      text: [opening, '', ...group.map((k) => lineFor(k, baseUrl)), '', 'Nothing has been sent to the customer beyond any holding reply the operator chose to send. A manager needs to open the case, check the draft and approve it.'].join('\n')
    };
  });
}

module.exports = { smtpConfig, recipientFor, describeAlertStatus, sendEscalation, sendNudge, __setTransportFactoryForTests };
