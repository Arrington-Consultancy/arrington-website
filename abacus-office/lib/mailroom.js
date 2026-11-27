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
// Mailboxes from Settings are read only when the server's driver is gmail:
// "none" is the server's switch (nothing is read until the data processing
// agreement is signed), and the made-up inbox never sits beside real mail.
//
// A reply is saved as a draft in the mailbox its email came into. A new
// email (Write, a complaint typed in) is saved in the mailbox of the
// company it is written for; a company with no mailbox has it copied out
// by hand. No mailbox sends.

const secretBox = require('./secretBox');
const { rowMailbox, driverName, CLIENT } = require('./mailbox');

// An email whose mailbox has since been removed: nothing can be saved there.
function goneBox(address) {
  const where = address ? `${address} is no longer connected` : 'The mailbox this came into is no longer connected';
  return {
    name: 'gone', label: address ? `Gmail (${address})` : 'the mailbox', demo: false, off: false, none: true, noneWhy: where,
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
  const open = () => Boolean(store) && typeof store.mailboxes === 'function' && !primary.demo && !primary.off && driverName(env) === 'gmail';

  async function reload() {
    if (primary.reload) await primary.reload();
    const next = [];
    if (open()) {
      const sealedSecret = await store.setting(CLIENT.secret).catch(() => '');
      const client = { id: await store.setting(CLIENT.id).catch(() => ''), secret: sealedSecret ? (secretBox.open(sealedSecret, env) || '') : '' };
      const rows = await store.mailboxes().catch(() => []);
      for (const r of rows) {
        const token = r.token ? (secretBox.open(r.token, env) || '') : '';
        const key = [r.address, token, client.id, client.secret].join('\n');
        let b = built.get(r.id);
        if (!b || b.key !== key) { b = { key, box: rowMailbox({ address: r.address, token }, { env, client, fetch }) }; built.set(r.id, b); }
        next.push({ id: r.id, brand: r.brand || '', address: r.address, box: b.box, startAt: r.start_at || null, connected: Boolean(token), unreadable: Boolean(r.token) && !token, by: r.connected_by || '', at: r.connected_at || null });
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
      return `Abacus office mailboxes: ${entries.map((e) => `${e.address} for ${e.brand || 'every company'} (${e.connected ? 'connected' : e.unreadable ? 'a token is saved but ABACUS_OFFICE_TOKEN_KEY no longer opens it; connect again' : 'not connected'})`).join('; ')}`;
    }
  };
  return room;
}

module.exports = { createMailRoom, goneBox, minuteOf };
