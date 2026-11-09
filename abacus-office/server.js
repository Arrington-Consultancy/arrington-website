'use strict';

// Production entry point for the Abacus office. Boots the schema, makes
// sure an owner login exists, starts the web app, and runs the two timers:
// pulling the mailbox and the escalation sweep. Every line it prints about
// a secret gives presence and length only.

const { createPool } = require('./lib/db');
const { Store } = require('./lib/store');
const { createApp } = require('./app');
const { createMailbox, describeMailStatus } = require('./lib/mailbox');
const { firm } = require('./lib/firm');
const ai = require('./lib/ai');
const alerts = require('./lib/alerts');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3400);
const production = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);

async function ensureOwner(store) {
  if (await store.userCount()) return;
  const username = String(process.env.ABACUS_OFFICE_OWNER_USERNAME || 'owner').trim().toLowerCase();
  let password = String(process.env.ABACUS_OFFICE_OWNER_PASSWORD || '').trim();
  let generated = false;
  if (password.length < 10) { password = crypto.randomBytes(9).toString('base64url'); generated = true; }
  await store.createUser({ username, displayName: 'Owner', password, role: 'owner', mustChange: true });
  console.log(`Abacus office: first boot, owner login "${username}" created${generated ? `. One-time password (change it at first sign in): ${password}` : ' from ABACUS_OFFICE_OWNER_PASSWORD; remove that variable now'}`);
}

async function main() {
  const pool = createPool();
  const store = new Store(pool);
  await store.ensureSchema();
  await ensureOwner(store);
  const secret = String(process.env.SESSION_SECRET || '').trim();
  console.log(`Abacus office: session secret ${secret ? `set (${secret.length} chars)` : 'MISSING'}`);
  const f = firm();
  console.log(`Abacus office: firm "${f.name}", ${f.town}; ${f.demo ? 'MADE-UP DATA ONLY' : 'real mailbox configured'}`);
  console.log(describeMailStatus());
  console.log(ai.describeAiStatus());
  console.log(alerts.describeAlertStatus());
  const mailbox = createMailbox();
  const { app, office } = createApp({ pool, mailbox, firm: f, sessionSecret: secret, production });
  app.listen(PORT, () => console.log(`Abacus office running on port ${PORT}`));

  if (ai.aiEnabled()) ai.probe().then((r) => console.log(`Abacus office AI probe: ${r.ok ? 'ok, ' : 'FAILED, '}${r.message}`)).catch(() => {});

  const baseUrl = String(process.env.ABACUS_OFFICE_PUBLIC_URL || '').replace(/\/$/, '');
  const guarded = (name, fn) => async () => { try { await fn(); } catch (e) { console.error(`Abacus office: ${name} failed`, e.message); } };
  // Pull the mailbox and read what is new; then look for anything overdue.
  const tick = guarded('mail poll', async () => { await office.sync(); await office.readAllUnread(); });
  const sweep = guarded('escalation sweep', async () => {
    const r = await office.sweep(alerts, baseUrl);
    if (r.escalated) console.log(`Abacus office: ${r.escalated} case(s) escalated${r.emailed ? ', manager emailed' : ', no email configured'}`);
  });
  setTimeout(() => { tick().then(sweep); }, 5000);
  setInterval(tick, (mailbox.demo ? 30 : 2) * 60 * 1000).unref();
  setInterval(sweep, 5 * 60 * 1000).unref();
}

process.on('unhandledRejection', (e) => console.error('Abacus office: unhandled rejection', e));
main().catch((e) => { console.error('Abacus office: FATAL', e); process.exit(1); });
