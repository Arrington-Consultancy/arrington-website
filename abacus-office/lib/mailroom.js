'use strict';

// Every mailbox the office reads (Tom, 27 November 2026: "each company
// might have multiple inboxes"; ".com .co.uk .net etc can all go into one
// company email box. We can create more down the line if we want them").
//
// The first is the one set on the server (lib/mailbox.js: the made-up
// inbox, none, or a real one from Railway's variables), which feeds the
// company named in ABACUS_OFFICE_MAILBOX_BRAND. The rest are added by the
// owner in Settings, each tied to one company and connected by signing in
// to Google as that address. A company's other addresses (.co.uk, .net)
// are forwarded or aliased into its mailbox by whoever runs its email, so
// one mailbox per company is enough, and a second can be added later.
//
// A mailbox is on Microsoft 365 (./graphMailbox.js, which is what the firm
// uses) or on Google (rowMailbox in ./mailbox.js); each row says which.
//
// Mailboxes from Settings are read only when the server's driver is outlook
// or gmail: "none" is the server's switch (nothing is read until the data
// processing agreement is signed), and the made-up inbox never sits beside
// real mail.
//
// A reply is saved as a draft in the mailbox its email came into. A new
// email (Write, a complaint typed in) is saved in the mailbox of the
// company it is written for; a company with no mailbox has it copied out
// by hand. No mailbox sends.

const secretBox = require('./secretBox');
const { rowMailbox, driverName, driverEnv, CLIENT } = require('./mailbox');
const graphMailbox = require('./graphMailbox');

// The settings rows that hold the firm's Microsoft app registration, typed
// in by the owner. The secret is sealed like a token.
const MS_CLIENT = { tenant: 'mailbox_outlook_tenant_id', id: 'mailbox_outlook_client_id', secret: 'mailbox_outlook_client_secret' };
const REAL = ['outlook', 'gmail'];
const PROVIDERS = { outlook: 'Microsoft 365', gmail: 'Google' };

// The Microsoft app's details: Railway's variables first, then what the
// owner saved in Settings.
async function microsoftClient(store, env) {
  const e = driverEnv(env);
  const get = (k) => (store && store.setting ? store.setting(k).catch(() => '') : Promise.resolve(''));
  const sealed = await get(MS_CLIENT.secret);
  const saved = { tenant: await get(MS_CLIENT.tenant), clientId: await get(MS_CLIENT.id), clientSecret: sealed ? (secretBox.open(sealed, env) || '') : '' };
  const pick = (k, v) => String(e[k] || '').trim() || v || '';
  return {
    tenant: pick('TAXI_OFFICE_OUTLOOK_TENANT_ID', saved.tenant), clientId: pick('TAXI_OFFICE_OUTLOOK_CLIENT_ID', saved.clientId), clientSecret: pick('TAXI_OFFICE_OUTLOOK_CLIENT_SECRET', saved.clientSecret),
    fromSettings: Boolean(saved.tenant && saved.clientId && saved.clientSecret), inRailway: Boolean(String(e.TAXI_OFFICE_OUTLOOK_CLIENT_SECRET || '').trim())
  };
}

// A Microsoft 365 mailbox, in the shape the office uses for any mailbox.
function graphRowMailbox(row, { client, token, onRotate, fetch }) {
  const inner = graphMailbox.create({ address: row.address, tenant: client.tenant, clientId: client.clientId, clientSecret: client.clientSecret, refreshToken: token, onRotate, fetch });
  const box = {
    name: 'outlook',
    label: `Outlook (${inner.address})`,
    address: inner.address,
    demo: false,
    off: false,
    get none() { return !inner.configured(); },
    noneWhy: `${inner.address} is not connected`,
    configured: () => inner.configured(),
    missing: () => inner.missing(),
    listInbox: (opts) => inner.listInbox(opts),
    async saveReplyDraft(email, text) { if (box.none) return { draftId: null }; return inner.saveReplyDraft(email, text); },
    async saveNewDraft(to, subject, text) { if (box.none) return { draftId: null }; return inner.saveReplyDraft({ from: to, subject, fresh: true }, text); },
    account: () => inner.account(),
    canTrackSent: true,
    draftState: (ref) => inner.draftState(ref)
  };
  return box;
}

// An email whose mailbox has since been removed: nothing can be saved there.
function goneBox(address) {
  const where = address ? `${address} is no longer connected` : 'The mailbox this came into is no longer connected';
  return {
    name: 'gone', label: address || 'the mailbox', demo: false, off: false, none: true, noneWhy: where,
    configured: () => false, missing: () => [], listInbox: async () => [], account: async () => null,
    saveReplyDraft: async () => ({ draftId: null }), saveNewDraft: async () => ({ draftId: null }), canTrackSent: false
  };
}

// The start of the minute: an email's time is kept to the minute, so one
// that arrives seconds after a mailbox is connected is still taken.
const minuteOf = (d) => { const t = new Date(d).getTime(); return Number.isFinite(t) ? t - (t % 60000) : 0; };

function createMailRoom({ primary, firm = {}, store = null, env = process.env, fetch } = {}) {
  let entries = [];
  let loaded = false;
  const built = new Map();

  // Whether mailboxes from Settings are in use at all.
  const open = () => Boolean(store) && typeof store.mailboxes === 'function' && !primary.demo && !primary.off && REAL.includes(driverName(env));

  async function reload() {
    if (primary.reload) await primary.reload();
    const next = [];
    if (open()) {
      const sealedSecret = await store.setting(CLIENT.secret).catch(() => '');
      const client = { id: await store.setting(CLIENT.id).catch(() => ''), secret: sealedSecret ? (secretBox.open(sealedSecret, env) || '') : '' };
      const ms = await microsoftClient(store, env);
      const rows = await store.mailboxes().catch(() => []);
      for (const r of rows) {
        const token = r.token ? (secretBox.open(r.token, env) || '') : '';
        const provider = r.provider === 'outlook' ? 'outlook' : 'gmail';
        let b = built.get(r.id);
        if (provider === 'outlook') {
          // The token is left out of the key: Microsoft changes it as it is
          // used, and the mailbox carries the newest one itself.
          const key = ['outlook', r.address, ms.tenant, ms.clientId, ms.clientSecret, Boolean(token)].join('\n');
          if (!b || b.key !== key) {
            const id = r.id;
            const onRotate = async (fresh) => { if (typeof store.rotateMailboxToken === 'function') await store.rotateMailboxToken(id, secretBox.seal(fresh, env)); };
            b = { key, box: graphRowMailbox(r, { client: ms, token, onRotate, fetch }) };
            built.set(r.id, b);
          }
        } else {
          const key = ['gmail', r.address, token, client.id, client.secret].join('\n');
          if (!b || b.key !== key) { b = { key, box: rowMailbox({ address: r.address, token }, { env, client, fetch }) }; built.set(r.id, b); }
        }
        next.push({ id: r.id, brand: r.brand || '', address: r.address, provider, providerName: PROVIDERS[provider], box: b.box, startAt: r.start_at || null, connected: Boolean(token), unreadable: Boolean(r.token) && !token, by: r.connected_by || '', at: r.connected_at || null, signedInAs: r.signed_in_as || '' });
      }
      for (const id of [...built.keys()]) if (!rows.some((r) => r.id === id)) built.delete(id);
    }
    entries = next;
    loaded = true;
    return room;
  }
  async function ready() { if (!loaded) await reload(); return room; }

  // The server's mailbox as an entry. Connected from Settings, it starts
  // from that moment too; set by a token on the server, it has no such
  // moment and takes what its driver lists.
  function primaryEntry() {
    const s = primary.stored ? primary.stored() : null;
    return { id: 0, brand: firm.mailboxBrand || '', address: primary.expected ? primary.expected() : '', box: primary, startAt: s && s.connected && s.at ? s.at : null, primary: true };
  }
  const primaryReads = () => Boolean(primary.demo) || (!primary.none && !primary.off && (!primary.configured || primary.configured()));

  const room = {
    primary,
    reload,
    ready,
    get open() { return open(); },
    // A mailbox connected again is built afresh, with its new sign-in.
    forget(id) { built.delete(id); },
    // Mailboxes added in Settings, connected or not.
    added: () => entries.slice(),
    // Every mailbox that can be read now.
    reading() { return [...(primaryReads() ? [primaryEntry()] : []), ...entries.filter((e) => e.box.configured())]; },
    get demo() { return Boolean(primary.demo); },
    get off() { return Boolean(primary.off); },
    // Nothing is connected anywhere.
    get none() { return !primary.demo && room.reading().length === 0; },
    // For a sentence about the mailboxes as a whole. An address is long and
    // belongs on the email it came into, not in every page's opening line.
    get label() {
      const r = room.reading();
      if (!r.some((m) => !m.primary)) return primary.label;
      return r.length === 1 ? 'the company mailbox' : 'the company mailboxes';
    },
    // The mailbox an email came into.
    forCase(kase) {
      const id = Number(kase && kase.mailbox_id) || 0;
      if (!id) return primary;
      const e = entries.find((x) => x.id === id);
      return e ? e.box : goneBox(kase.mailbox_address || '');
    },
    // Where a new email for this company waits as a draft, or null when
    // that company has no mailbox connected. The server's mailbox serves
    // its own company (or every company when none is named); after that,
    // the first connected mailbox added for the company.
    entryForBrand(brand) {
      const p = primary;
      const pOk = !p.demo && !p.none && typeof p.saveNewDraft === 'function' && (!p.configured || p.configured());
      if (pOk && (!brand || !firm.mailboxBrand || brand === firm.mailboxBrand)) return primaryEntry();
      return entries.find((e) => e.box.configured() && (!brand || e.brand === brand)) || null;
    },
    // Whether an email was received before its mailbox joined the office.
    beforeStart(entry, instant) {
      if (!entry.startAt || !instant) return false;
      const t = new Date(instant).getTime();
      return Number.isFinite(t) && t < minuteOf(entry.startAt);
    },
    describe() {
      if (!open()) return '';
      if (!entries.length) return 'Abacus office mailboxes: none added in Settings yet';
      return `Abacus office mailboxes: ${entries.map((e) => `${e.address} on ${e.providerName} for ${e.brand || 'every company'} (${e.connected ? 'connected' : e.unreadable ? 'a token is saved but ABACUS_OFFICE_TOKEN_KEY no longer opens it; connect again' : 'not connected'})`).join('; ')}`;
    }
  };
  return room;
}

module.exports = { createMailRoom, goneBox, minuteOf, microsoftClient, MS_CLIENT, PROVIDERS, REAL };
