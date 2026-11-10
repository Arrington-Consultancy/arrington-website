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
const { describeDispatchStatus } = require('./lib/dispatch');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3400);
const production = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);

async function ensureOwner(store) {
  const username = String(process.env.ABACUS_OFFICE_OWNER_USERNAME || 'owner').trim().toLowerCase();
  let password = String(process.env.ABACUS_OFFICE_OWNER_PASSWORD || '').trim();
  if (await store.userCount()) {
    // The owner already exists. A password set in the variables resets it,
    // so a lost one-time password is recovered from Railway alone: set the
    // variable, deploy, sign in, change the password when asked, remove it.
    if (!password) return;
    const owner = await store.userByName(username);
    if (!owner) { console.log(`Abacus office: ABACUS_OFFICE_OWNER_PASSWORD is set but no login "${username}" exists; nothing changed`); return; }
    if (password.length < 10) { console.log('Abacus office: ABACUS_OFFICE_OWNER_PASSWORD is shorter than 10 characters; nothing changed'); return; }
    await store.setPassword(owner.id, password, true);
    if (!owner.active) await store.setUserActive(owner.id, true);
    await store.addEvent(null, { actor: null, kind: 'password_reset', detail: `Password for "${username}" reset from the deployment variables` }).catch(() => {});
    console.log(`Abacus office: password for "${username}" reset from ABACUS_OFFICE_OWNER_PASSWORD (must be changed at next sign in); remove that variable now`);
    return;
  }
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
  console.log(ai.describeAiStatus());
  console.log(alerts.describeAlertStatus());
  console.log(describeDispatchStatus());
  console.log(`Abacus office brands: ${f.brands.map((b) => `${b.id} (${b.name})`).join(', ')}; the mailbox is ${f.mailboxBrand}; logo ${f.logo || 'none, lettered square'}`);
  const mailbox = createMailbox(process.env, { store });
  if (mailbox.reload) await mailbox.reload();
  console.log(describeMailStatus(process.env, mailbox));
  const { app, office } = createApp({ pool, mailbox, firm: f, sessionSecret: secret, production });
  app.listen(PORT, () => console.log(`Abacus office running on port ${PORT}`));

  if (ai.aiEnabled()) ai.probe().then((r) => console.log(`Abacus office AI probe: ${r.ok ? 'ok, ' : 'FAILED, '}${r.message}`)).catch(() => {});

  const baseUrl = String(process.env.ABACUS_OFFICE_PUBLIC_URL || '').replace(/\/$/, '');
  const guarded = (name, fn) => async () => { try { await fn(); } catch (e) { console.error(`Abacus office: ${name} failed`, e.message); } };
  // Pull the mailbox and read what is new (the app also does this on its
  // own two-minute timer and on page views; this first pull is so the
  // inbox is ready before anyone opens it), then look for anything overdue
  // and any complaint past the nudge time.
  const tick = guarded('mail poll', async () => { await app.locals.settle(); });
  const sweep = guarded('escalation sweep', async () => {
    const r = await office.sweep(alerts, baseUrl);
    if (r.escalated) console.log(`Abacus office: ${r.escalated} case(s) escalated${r.emailed ? ', manager emailed' : ', no email configured'}`);
    const n = await office.nudge(alerts, baseUrl);
    if (n.nudged) console.log(`Abacus office: ${n.nudged} complaint(s) passed up to a manager by the nudge${n.emailed ? ', manager emailed' : ', no email configured'}`);
  });
  setTimeout(() => { tick().then(sweep); }, 5000);
  setInterval(sweep, 5 * 60 * 1000).unref();
}

process.on('unhandledRejection', (e) => console.error('Abacus office: unhandled rejection', e));
main().catch((e) => { console.error('Abacus office: FATAL', e); process.exit(1); });
