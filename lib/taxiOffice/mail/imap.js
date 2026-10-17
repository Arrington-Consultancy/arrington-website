'use strict';

// Free Gmail driver (Tom, 17/10/2026: "lets just make a free one"): the
// demo's live address as an ordinary free Gmail account, read over IMAP
// with an app password. No Google Cloud project, no OAuth client, no
// licence: the account's owner turns on 2-Step Verification, makes an app
// password, and that password goes into Railway.
//
// Needs, set on the service (never in code):
//   TAXI_OFFICE_DEMO_ADDRESS     the free account's address; also the login
//   TAXI_OFFICE_IMAP_PASSWORD    its app password (spaces are ignored)
//   TAXI_OFFICE_IMAP_HOST        optional, default imap.gmail.com
//
// It reads the inbox and leaves replies as drafts in the account's Drafts
// folder. IMAP has no way to send, and this file opens no other kind of
// connection, so nothing here can send an email (a test pins it).
//
// It will not sign in to an Arrington mailbox. An app password works for a
// Workspace account too, so without this an app password for Tom's own
// inbox, set by mistake, would put his mail in front of the demo.
//
// Written without a library: the usual IMAP and MIME packages need Node 20
// and production runs Node 18. It speaks only the handful of commands the
// office needs: LOGIN, EXAMINE, UID SEARCH, UID FETCH, LIST, APPEND, LOGOUT.

const tls = require('tls');
const { londonParts } = require('../../../taxi-demo/lib/fares');
const { MailNotConfigured, MailError, headerSafe, replySubject, demoAddress } = require('./index');
const mime = require('./mime');

const ARRINGTON = /@arringtonconsultancy\.(?:com|co\.uk)$/i;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Only the start of each message is read: enough for the text, never a
// large attachment.
const MAX_BYTES = 100000;
const TIMEOUT = 20000;
// A connection is kept while the inbox page is polling and closed once it
// has sat unused this long, so a visitor watching for their email costs
// one sign-in, not one every fifteen seconds.
const IDLE = 60000;

const quote = (s) => `"${String(s).replace(/[\\"]/g, '\\$&')}"`;

// One IMAP connection: writes a command, reads the replies, including
// literals ({n} followed by n bytes), byte for byte.
class Connection {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.cur = { lines: [], literals: [] };
    this.queue = [];
    this.waiters = [];
    this.n = 0;
    this.busy = false;
    this.closed = false;
    this.error = null;
    socket.on('data', (d) => this.onData(d));
    socket.on('error', (e) => this.fail(e));
    socket.on('close', () => this.fail(new Error('the connection closed')));
    if (socket.setTimeout) {
      socket.setTimeout(IDLE, () => {
        if (this.busy) this.fail(new Error('the mail server stopped answering'));
        else this.logout();
      });
    }
  }

  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const idx = this.buf.indexOf('\r\n');
      if (idx < 0) return;
      const line = this.buf.slice(0, idx).toString('latin1');
      const lit = /\{(\d+)\+?\}$/.exec(line);
      if (lit) {
        const size = Number(lit[1]);
        if (size > MAX_BYTES * 2) { this.fail(new Error('the mail server sent more than was asked for')); this.socket.destroy(); return; }
        const end = idx + 2 + size;
        if (this.buf.length < end) return;
        this.cur.lines.push(line);
        this.cur.literals.push(this.buf.slice(idx + 2, end));
        this.buf = this.buf.slice(end);
        continue;
      }
      this.cur.lines.push(line);
      this.buf = this.buf.slice(idx + 2);
      const resp = this.cur;
      this.cur = { lines: [], literals: [] };
      resp.text = resp.lines.join(' ');
      if (this.waiters.length) this.waiters.shift().resolve(resp);
      else this.queue.push(resp);
    }
  }

  fail(e) {
    if (this.closed) return;
    this.closed = true;
    this.error = e;
    for (const w of this.waiters.splice(0)) w.reject(e);
  }

  next() {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    if (this.error) return Promise.reject(this.error);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('the mail server did not answer in time')); this.destroy(); }, TIMEOUT);
      this.waiters.push({
        resolve: (r) => { clearTimeout(timer); resolve(r); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });
    });
  }

  // Runs one command. A literal (APPEND's message) is sent once the server
  // says go ahead. Throws on anything but OK, with the server's own words,
  // which never include what was sent.
  async command(text, literal) {
    const tag = `A${++this.n}`;
    const untagged = [];
    const done = (r) => r.text.startsWith(`${tag} `);
    const check = (r) => {
      const rest = r.text.slice(tag.length + 1);
      if (!/^OK\b/i.test(rest)) { const e = new Error(rest.slice(0, 200)); e.imap = true; throw e; }
      return { untagged, done: r };
    };
    this.busy = true;
    // A kept connection must not hold the process open while it waits.
    if (this.socket.ref) this.socket.ref();
    try {
      if (literal) {
        this.socket.write(`${tag} ${text} {${literal.length}}\r\n`);
        for (;;) {
          const r = await this.next();
          if (r.text.startsWith('+')) break;
          if (done(r)) return check(r);
          untagged.push(r);
        }
        this.socket.write(Buffer.concat([literal, Buffer.from('\r\n')]));
      } else {
        this.socket.write(`${tag} ${text}\r\n`);
      }
      for (;;) {
        const r = await this.next();
        if (done(r)) return check(r);
        untagged.push(r);
      }
    } finally {
      this.busy = false;
      if (this.socket.unref) this.socket.unref();
    }
  }

  logout() {
    if (this.closed) return;
    try { this.socket.write(`Z LOGOUT\r\n`); this.socket.end(); } catch (e) { /* closing anyway */ }
    this.fail(new Error('signed out'));
  }

  destroy() {
    this.fail(new Error('the connection was dropped'));
    try { this.socket.destroy(); } catch (e) { /* already gone */ }
  }
}

function imapDate(ms) {
  const d = new Date(ms);
  return `${d.getUTCDate()}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

// INTERNALDATE, "17-Oct-2026 09:05:12 +0100", as milliseconds.
function parseInternalDate(s) {
  const m = /(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d\d):(\d\d):(\d\d) ([+-])(\d\d)(\d\d)/.exec(String(s || ''));
  if (!m) return NaN;
  const mon = MON.indexOf(m[2][0].toUpperCase() + m[2].slice(1).toLowerCase());
  if (mon < 0) return NaN;
  const offset = (Number(m[8]) * 60 + Number(m[9])) * 60000 * (m[7] === '+' ? 1 : -1);
  return Date.UTC(Number(m[3]), mon, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6])) - offset;
}

function londonStamp(ms) {
  const p = londonParts(new Date(ms));
  return `${p.date}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

const bareAddress = (s) => { const m = /<([^>]+)>/.exec(String(s || '')); return (m ? m[1] : String(s || '')).trim(); };

// A header value that is not plain ASCII goes as UTF-8 encoded words.
function encodeHeader(s) {
  const text = headerSafe(s);
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const chars = Array.from(text);
  const words = [];
  for (let i = 0; i < chars.length; i += 20) words.push(`=?UTF-8?B?${Buffer.from(chars.slice(i, i + 20).join(''), 'utf8').toString('base64')}?=`);
  return words.join('\r\n ');
}

// The reply as a whole message, ready to leave in Drafts. The text goes as
// base64 so a long paragraph cannot break a line limit.
function composeReply({ from, email, text, date = new Date() }) {
  const refs = [email.references, email.messageId].map(headerSafe).filter(Boolean).join(' ');
  const body = Buffer.from(String(text || '').replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  return [
    `From: ${headerSafe(from)}`,
    `To: ${headerSafe(bareAddress(email.from))}`,
    `Subject: ${encodeHeader(replySubject(email.subject))}`,
    `Date: ${date.toUTCString()}`,
    email.messageId ? `In-Reply-To: ${headerSafe(email.messageId)}` : '',
    refs ? `References: ${refs}` : '',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body
  ].filter((l, i, a) => l !== '' || i === a.length - 2).join('\r\n');
}

// The Drafts folder by its special-use flag, then by the usual names
// ("[Google Mail]" is the prefix on older UK accounts).
function draftsFrom(listResponses) {
  const boxes = [];
  for (const r of listResponses) {
    const m = /^\* LIST \(([^)]*)\) (?:"(?:[^"\\]|\\.)*"|NIL) (.+)$/i.exec(r.text);
    if (!m) continue;
    let name = m[2].trim();
    if (name.startsWith('"')) name = name.slice(1, -1).replace(/\\(.)/g, '$1');
    boxes.push({ name, attrs: m[1].toLowerCase().split(/\s+/) });
  }
  const flagged = boxes.find((b) => b.attrs.includes('\\drafts'));
  if (flagged) return flagged.name;
  const named = ['[Gmail]/Drafts', '[Google Mail]/Drafts', 'Drafts'].find((n) => boxes.some((b) => b.name === n));
  return named || null;
}

function create({ env = process.env, connect = null } = {}) {
  const user = demoAddress(env);
  const password = () => String(env.TAXI_OFFICE_IMAP_PASSWORD || '').replace(/\s+/g, '');
  const host = String(env.TAXI_OFFICE_IMAP_HOST || 'imap.gmail.com').trim().toLowerCase();
  const label = /(^|\.)gmail\.com$/.test(host) ? 'Gmail' : 'email';
  const open = connect || (() => tls.connect({ host, port: 993, servername: host }));
  const missing = () => [!user && 'TAXI_OFFICE_DEMO_ADDRESS', !password() && 'TAXI_OFFICE_IMAP_PASSWORD'].filter(Boolean);
  const refusal = () => (ARRINGTON.test(user) ? `${user} is an Arrington mailbox, and the demo reads only a mailbox kept for the demo` : '');

  // Server words with the password taken out, in case a server ever
  // repeats a command back.
  const clean = (msg) => {
    let m = String(msg || '');
    if (password()) m = m.split(password()).join('[hidden]');
    return m.slice(0, 200);
  };
  const wrap = (e, what) => (e instanceof MailError || e instanceof MailNotConfigured ? e : new MailError(label, what, null, clean(e.message)));

  let conn = null;
  let draftsBox = null;
  let chain = Promise.resolve();
  // One command at a time on the one connection.
  const exclusive = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.then(() => {}, () => {});
    return run;
  };

  async function signIn() {
    if (missing().length) throw new MailNotConfigured(label, missing());
    if (refusal()) throw new MailError(label, 'sign in', null, refusal());
    const c = new Connection(open());
    try {
      const hello = await c.next();
      if (!/^\* (OK|PREAUTH)\b/i.test(hello.text)) throw new Error(hello.text.slice(0, 120));
      await c.command(`LOGIN ${quote(user)} ${quote(password())}`);
    } catch (e) {
      c.destroy();
      throw wrap(e, 'sign in');
    }
    return c;
  }

  // Runs fn on a signed-in connection. If a kept connection turns out to
  // have died, it signs in again once and tries again.
  function withConnection(what, fn) {
    return exclusive(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const reused = Boolean(conn && !conn.closed);
        if (!reused) conn = await signIn();
        const c = conn;
        try {
          return await fn(c);
        } catch (e) {
          if (!e.imap) { c.destroy(); if (conn === c) conn = null; }
          if (reused && !e.imap && attempt === 0) continue;
          throw wrap(e, what);
        }
      }
      throw new MailError(label, what);
    });
  }

  // A message's text never changes, so one already read is not fetched again.
  const seen = new Map();
  const remember = (key, email) => {
    seen.set(key, email);
    while (seen.size > 200) seen.delete(seen.keys().next().value);
  };

  function toEmail(validity, uid, internalDate, raw) {
    const msg = mime.parseMessage(raw);
    const ms = parseInternalDate(internalDate);
    const fallback = Date.parse(msg.header('date'));
    return {
      id: `im-${validity}-${uid}`,
      providerId: String(uid),
      threadId: '',
      messageId: msg.header('message-id'),
      references: msg.header('references'),
      from: msg.header('reply-to') || msg.header('from'),
      to: ['to', 'cc', 'delivered-to', 'x-original-to'].flatMap((h) => msg.headerAll(h)).flatMap((v) => v.split(',')).map((a) => a.trim()).filter(Boolean),
      subject: msg.header('subject') || '(no subject)',
      receivedAt: londonStamp(Number.isFinite(ms) ? ms : Number.isFinite(fallback) ? fallback : Date.now()),
      body: msg.text.slice(0, 6000)
    };
  }

  async function listInbox({ max = 20, days = 7 } = {}) {
    return withConnection('read the inbox', async (c) => {
      const ex = await c.command('EXAMINE INBOX');
      const validity = (/\[UIDVALIDITY (\d+)\]/i.exec(ex.untagged.map((r) => r.text).join('\n')) || [])[1] || '0';
      const since = imapDate(Date.now() - Math.min(Math.max(1, Number(days) || 7), 30) * 86400000);
      const found = await c.command(`UID SEARCH SINCE ${since}`);
      const uids = found.untagged
        .filter((r) => /^\* SEARCH\b/i.test(r.text))
        .flatMap((r) => r.text.replace(/^\* SEARCH/i, '').trim().split(/\s+/))
        .filter((x) => /^\d+$/.test(x)).map(Number)
        .sort((a, b) => b - a)
        .slice(0, Math.min(Math.max(1, max), 50));
      const fresh = uids.filter((u) => !seen.has(`${validity}:${u}`));
      if (fresh.length) {
        const f = await c.command(`UID FETCH ${fresh.join(',')} (UID INTERNALDATE BODY.PEEK[]<0.${MAX_BYTES}>)`);
        for (const r of f.untagged) {
          if (!/^\* \d+ FETCH\b/i.test(r.text) || !r.literals.length) continue;
          const uid = Number((/\bUID (\d+)/i.exec(r.text) || [])[1]);
          if (!uid) continue;
          const date = (/INTERNALDATE "([^"]+)"/i.exec(r.text) || [])[1];
          remember(`${validity}:${uid}`, toEmail(validity, uid, date, r.literals[r.literals.length - 1]));
        }
      }
      return uids.map((u) => seen.get(`${validity}:${u}`)).filter(Boolean);
    });
  }

  // Signing in as this address is what proves the mailbox, so it is the
  // address itself.
  async function account() {
    return user || null;
  }

  async function saveReplyDraft(email, text) {
    return withConnection('save the draft', async (c) => {
      if (!draftsBox) {
        const list = await c.command('LIST "" "*"');
        draftsBox = draftsFrom(list.untagged);
        if (!draftsBox) throw new MailError(label, 'find the Drafts folder');
      }
      const message = Buffer.from(composeReply({ from: user, email, text }), 'utf8');
      const r = await c.command(`APPEND ${quote(draftsBox)} (\\Draft \\Seen)`, message);
      const uid = (/APPENDUID \d+ (\d+)/i.exec(r.done.text) || [])[1];
      return { draftId: uid ? `draft-${uid}` : null };
    });
  }

  // Signs out now rather than when the connection next sits idle.
  function close() {
    return exclusive(async () => { if (conn) { conn.logout(); conn = null; } });
  }

  return { name: 'imap', label, configured: () => missing().length === 0 && !refusal(), missing, refusal, listInbox, saveReplyDraft, account, close };
}

module.exports = { create, composeReply, parseInternalDate, draftsFrom };
