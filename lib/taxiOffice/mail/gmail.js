'use strict';

// Gmail driver: a firm's Google Workspace or Gmail inbox, through the Gmail
// API. Reads the inbox and leaves replies as drafts in the same thread.
//
// Needs, set on the service (never in code):
//   TAXI_OFFICE_GMAIL_CLIENT_ID       OAuth client from the firm's Google
//   TAXI_OFFICE_GMAIL_CLIENT_SECRET   Cloud project (Web application)
//   TAXI_OFFICE_GMAIL_REFRESH_TOKEN   issued with the two scopes below
//   TAXI_OFFICE_GMAIL_QUERY           optional, default "in:inbox newer_than:7d"
//
// Scopes: gmail.readonly to read, gmail.compose to save drafts. Google's
// gmail.compose also allows sending; this file never calls the send
// endpoint, and a test pins that no request here goes to /send.
//
// Only TAXI_OFFICE_GMAIL_* is read. The Workspace's own GMAIL_* variables
// are Tom's inbox and are never a fallback (see ./index.js).

const { londonParts } = require('../../../taxi-demo/lib/fares');
const { MailNotConfigured, MailError, headerSafe, replySubject } = require('./index');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const VARS = ['TAXI_OFFICE_GMAIL_CLIENT_ID', 'TAXI_OFFICE_GMAIL_CLIENT_SECRET', 'TAXI_OFFICE_GMAIL_REFRESH_TOKEN'];
const LABEL = 'Gmail';

const b64urlDecode = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const b64urlEncode = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function stripHtml(h) {
  return String(h || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The readable text of a message: its text/plain part if it has one,
// otherwise its HTML with the tags taken out. Attachments are never fetched.
function extractText(payload) {
  const parts = [];
  const walk = (p) => {
    if (!p) return;
    if (p.parts) p.parts.forEach(walk);
    else if (p.body && p.body.data && /^text\/(plain|html)/.test(p.mimeType || '')) parts.push(p);
  };
  walk(payload);
  const plain = parts.find((p) => p.mimeType.startsWith('text/plain'));
  if (plain) return b64urlDecode(plain.body.data).replace(/\r/g, '').trim();
  const html = parts.find((p) => p.mimeType.startsWith('text/html'));
  return html ? stripHtml(b64urlDecode(html.body.data)) : '';
}

const header = (msg, name) => {
  const h = ((msg.payload && msg.payload.headers) || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
};
// Every value of a header that can appear more than once (Delivered-To).
const headerAll = (msg, name) => ((msg.payload && msg.payload.headers) || []).filter((x) => x.name.toLowerCase() === name.toLowerCase()).map((x) => x.value);

function londonStamp(ms) {
  const p = londonParts(new Date(Number(ms)));
  return `${p.date}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function create({ env = process.env, fetch = globalThis.fetch } = {}) {
  const val = (k) => String(env[k] || '').trim();
  const missing = () => VARS.filter((k) => !val(k));
  let token = null;

  async function accessToken() {
    if (missing().length) throw new MailNotConfigured(LABEL, missing());
    if (token && token.expires > Date.now() + 60 * 1000) return token.value;
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: val('TAXI_OFFICE_GMAIL_CLIENT_ID'),
        client_secret: val('TAXI_OFFICE_GMAIL_CLIENT_SECRET'),
        refresh_token: val('TAXI_OFFICE_GMAIL_REFRESH_TOKEN'),
        grant_type: 'refresh_token'
      }).toString()
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) throw new MailError(LABEL, 'sign in', res.status, j.error || '');
    token = { value: j.access_token, expires: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
    return token.value;
  }

  async function api(path, init = {}) {
    const res = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.headers || {}) } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new MailError(LABEL, init.method === 'POST' ? 'save the draft' : 'read the inbox', res.status, (j.error && j.error.message) || '');
    return j;
  }

  // A message's text never changes, so one already read is not fetched
  // again: a refresh costs one list call plus one call per new email.
  const seen = new Map();
  const remember = (id, email) => {
    seen.set(id, email);
    while (seen.size > 200) seen.delete(seen.keys().next().value);
  };

  async function listInbox({ max = 20, days = 7 } = {}) {
    const q = val('TAXI_OFFICE_GMAIL_QUERY') || `in:inbox newer_than:${Math.min(Math.max(1, Number(days) || 7), 30)}d`;
    const list = await api(`/messages?q=${encodeURIComponent(q)}&maxResults=${Math.min(Math.max(1, max), 50)}`);
    const ids = (list.messages || []).map((m) => m.id);
    const out = [];
    for (const id of ids) {
      if (seen.has(id)) { out.push(seen.get(id)); continue; }
      const msg = await api(`/messages/${encodeURIComponent(id)}?format=full`);
      const email = {
        id: `gm-${msg.id}`,
        providerId: msg.id,
        threadId: msg.threadId || '',
        messageId: header(msg, 'Message-ID'),
        from: header(msg, 'Reply-To') || header(msg, 'From'),
        to: ['To', 'Cc', 'Delivered-To', 'X-Original-To'].flatMap((h) => headerAll(msg, h)).flatMap((v) => v.split(',')).map((a) => a.trim()).filter(Boolean),
        subject: header(msg, 'Subject') || '(no subject)',
        receivedAt: londonStamp(msg.internalDate || Date.now()),
        body: extractText(msg.payload).slice(0, 6000)
      };
      remember(id, email);
      out.push(email);
    }
    return out;
  }

  // The address this token reads. The live address will not read a mailbox
  // that is not the one it was given (see ../office.js).
  async function account() {
    const j = await api('/profile');
    return j.emailAddress ? String(j.emailAddress).toLowerCase() : null;
  }

  // An RFC 2822 reply, threaded by In-Reply-To and References, saved as a
  // draft in the same Gmail thread. Not sent.
  async function saveReplyDraft(email, text) {
    const lines = [
      `To: ${headerSafe(email.from)}`,
      `Subject: ${replySubject(email.subject)}`,
      email.messageId ? `In-Reply-To: ${headerSafe(email.messageId)}` : '',
      email.messageId ? `References: ${headerSafe(email.messageId)}` : '',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      String(text || '').replace(/\r?\n/g, '\r\n')
    ].filter((l, i, a) => l !== '' || i === a.length - 2);
    const raw = b64urlEncode(lines.join('\r\n'));
    const j = await api('/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw, threadId: email.threadId || undefined } })
    });
    return { draftId: j.id || null };
  }

  return { name: 'gmail', label: LABEL, configured: () => missing().length === 0, missing, listInbox, saveReplyDraft, account };
}

module.exports = { create, extractText, stripHtml, VARS };
