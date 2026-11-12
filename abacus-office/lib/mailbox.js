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
    saveReplyDraft: async () => ({ draftId: null }),
    saveNewDraft: async () => ({ draftId: null })
  };
}

// No mailbox at all (Tom, 10 November 2026: "we need to disconnect the
// current emails to the a2b staff site"). Nothing is read, the made-up
// emails are cleared at boot, and a draft is kept in the office only.
function noneDriver() {
  return {
    name: 'none',
    label: 'No mailbox connected',
    demo: false,
    none: true,
    // Switched off on the server, as opposed to chosen but not connected yet.
    off: true,
    configured: () => false,
    missing: () => [],
    listInbox: async () => [],
    account: async () => null,
    saveReplyDraft: async () => ({ draftId: null }),
    saveNewDraft: async () => ({ draftId: null })
  };
}

// The settings rows that hold a mailbox connected from Settings: the sealed
// Gmail refresh token, which address it reads, and who connected it when.
const STORED = { token: 'mailbox_gmail_token', account: 'mailbox_gmail_account', by: 'mailbox_gmail_connected_by', at: 'mailbox_gmail_connected_at' };
// The Google client the firm creates, typed into Settings by the owner so
// its secret never travels by email or chat. The secret is sealed like the
// token; the client id is not a secret.
const CLIENT = { id: 'mailbox_gmail_client_id', secret: 'mailbox_gmail_client_secret' };

class MailboxRefused extends Error {
  constructor(message) { super(message); this.code = 'MAILBOX_REFUSED'; }
}

const expectedAddress = (env = process.env) => String(env.ABACUS_OFFICE_MAILBOX_ADDRESS || '').trim().toLowerCase();

// A real mailbox, wrapped so the office never reads or writes one it was
// not given. Before the first read it asks the provider which address the
// credentials open and refuses anything but ABACUS_OFFICE_MAILBOX_ADDRESS.
// For Gmail the refresh token comes from the variable if it is set,
// otherwise from the sealed copy saved when the firm connected it from
// Settings; reload() picks up a new connection without a restart.
function liveMailbox(name, env, { store, secretEnv = env, fetch } = {}) {
  const secretBox = require('./secretBox');
  let inner = null;
  let checkedFor = null;
  let stored = { token: '', account: '', by: '', at: '', clientId: '', clientSecret: '' };

  // The driver's variables: Railway's first, then what was saved from
  // Settings for anything Railway does not set.
  function effectiveEnv() {
    const e = driverEnv(env);
    const fill = (k, v) => { if (!String(e[k] || '').trim() && v) e[k] = v; };
    if (name === 'gmail') {
      fill('TAXI_OFFICE_GMAIL_CLIENT_ID', stored.clientId);
      fill('TAXI_OFFICE_GMAIL_CLIENT_SECRET', stored.clientSecret);
      fill('TAXI_OFFICE_GMAIL_REFRESH_TOKEN', stored.token);
    }
    return e;
  }

  function build() {
    const e = effectiveEnv();
    inner = mail.createMailbox(name, fetch ? { env: e, fetch } : { env: e });
    checkedFor = null;
  }

  async function reload() {
    if (store && name === 'gmail') {
      const sealed = await store.setting(STORED.token).catch(() => '');
      const sealedSecret = await store.setting(CLIENT.secret).catch(() => '');
      stored = {
        token: sealed ? (secretBox.open(sealed, secretEnv) || '') : '',
        sealedButUnreadable: (Boolean(sealed) && !secretBox.open(sealed, secretEnv)) || (Boolean(sealedSecret) && !secretBox.open(sealedSecret, secretEnv)),
        clientId: await store.setting(CLIENT.id).catch(() => ''),
        clientSecret: sealedSecret ? (secretBox.open(sealedSecret, secretEnv) || '') : '',
        account: await store.setting(STORED.account).catch(() => ''),
        by: await store.setting(STORED.by).catch(() => ''),
        at: await store.setting(STORED.at).catch(() => '')
      };
    }
    build();
    return box;
  }

  async function checked() {
    if (!inner) build();
    const refused = inner.refusal ? inner.refusal() : '';
    if (refused) throw new MailboxRefused(refused);
    if (!inner.configured()) throw new MailboxRefused(`${inner.label} is not connected yet`);
    const want = expectedAddress(env);
    if (!want) throw new MailboxRefused('ABACUS_OFFICE_MAILBOX_ADDRESS is not set, so the office does not know which mailbox it may read');
    if (checkedFor === want) return inner;
    const got = await inner.account();
    if (got && got !== want) throw new MailboxRefused(`the credentials open ${got}, not ${want}; nothing was read`);
    checkedFor = want;
    return inner;
  }

  const box = {
    name,
    get label() { return (inner || (build(), inner)).label; },
    demo: false,
    off: false,
    // A real mailbox that is chosen but not connected yet behaves like no
    // mailbox (Tom, 12 November 2026: "I want it blank with API options for
    // email sign in blank"): nothing arrives, the pages say so, and an
    // approved reply is copied out by hand. It stops being true the moment
    // the mailbox is connected from Settings. A refused setup is not this:
    // that stays an error, so a wrong account is never quietly ignored.
    get none() { if (!inner) build(); return !inner.configured() && !(inner.refusal && inner.refusal()); },
    configured: () => { if (!inner) build(); return inner.configured() && !(inner.refusal && inner.refusal()); },
    missing: () => { if (!inner) build(); return inner.missing(); },
    refusal: () => { if (!inner) build(); return inner.refusal ? inner.refusal() : ''; },
    stored: () => ({ account: stored.account, by: stored.by, at: stored.at, connected: Boolean(stored.token), unreadable: Boolean(stored.sealedButUnreadable), clientId: stored.clientId, clientFromSettings: Boolean(stored.clientId && stored.clientSecret) }),
    effectiveEnv,
    expected: () => expectedAddress(env),
    reload,
    async listInbox(opts) { return (await checked()).listInbox(opts); },
    async saveReplyDraft(email, text) { if (box.none) return { draftId: null }; return (await checked()).saveReplyDraft(email, text); },
    // A new email, not a reply: a draft in the mailbox addressed to "to".
    async saveNewDraft(to, subject, text) { if (box.none) return { draftId: null }; return (await checked()).saveReplyDraft({ from: to, subject, fresh: true, messageId: '', threadId: '' }, text); },
    async account() { if (!inner) build(); return inner.account(); },
    // Whether a saved draft was sent, for the drivers that can say.
    get canTrackSent() { if (!inner) build(); return typeof inner.draftState === 'function'; },
    async draftState(ref) { const d = await checked(); return typeof d.draftState === 'function' ? d.draftState(ref) : null; }
  };
  return box;
}

function createMailbox(env = process.env, { store, fetch } = {}) {
  const name = driverName(env);
  if (name === 'demo') return demoDriver();
  if (name === 'none') return noneDriver();
  if (!mail.DRIVERS[name]) throw new Error(`Unknown mailbox driver "${name}". Known: demo, none, ${Object.keys(mail.DRIVERS).filter((d) => d !== 'demo').join(', ')}`);
  return liveMailbox(name, env, { store, fetch });
}

function describeMailStatus(env = process.env, box = null) {
  const name = driverName(env);
  if (name === 'demo') return 'Abacus office mailbox: made-up inbox (no real mailbox is connected; nothing is read from or saved to a live account)';
  if (name === 'none') return 'Abacus office mailbox: none connected (nothing is read; the made-up emails are cleared; drafts are kept in the office only)';
  if (!mail.DRIVERS[name]) return `Abacus office mailbox: unknown driver "${name}"; the office will not start`;
  if (!box) box = createMailbox(env);
  const refused = box.refusal ? box.refusal() : '';
  const s = box.stored ? box.stored() : {};
  const via = s.connected ? `, connected from Settings${s.by ? ` by ${s.by}` : ''}${s.at ? ` on ${s.at.slice(0, 10)}` : ''}` : '';
  const unreadable = s.unreadable ? ' (a token was saved from Settings but ABACUS_OFFICE_TOKEN_KEY no longer opens it; connect again)' : '';
  const want = expectedAddress(env);
  const state = refused ? `REFUSED: ${refused}`
    : box.configured() ? `configured${via}`
    : `NOT connected, missing ${box.missing().map((v) => v === 'TAXI_OFFICE_DEMO_ADDRESS' ? 'ABACUS_OFFICE_MAILBOX_ADDRESS' : v === 'TAXI_OFFICE_GMAIL_REFRESH_TOKEN' ? 'ABACUS_OFFICE_GMAIL_REFRESH_TOKEN (or connect it from Settings)' : /GMAIL_CLIENT/.test(v) ? `${v.replace(/^TAXI_OFFICE_/, 'ABACUS_OFFICE_')} (or enter it in Settings)` : v.replace(/^TAXI_OFFICE_/, 'ABACUS_OFFICE_')).join(', ')}${unreadable}`;
  return `Abacus office mailbox: ${box.label}${want ? ` for ${want}` : ''}, ${state}`;
}

module.exports = { createMailbox, describeMailStatus, driverName, driverEnv, expectedAddress, MailboxRefused, STORED, CLIENT, MAPPED };
