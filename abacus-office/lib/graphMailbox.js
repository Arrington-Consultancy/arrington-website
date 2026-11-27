'use strict';

// A Microsoft 365 mailbox added in Settings (Tom, 27 November 2026: the
// firm's email is Microsoft 365, found in its public DNS). Read through
// Microsoft Graph, v1.0. It reads the inbox and leaves replies as DRAFTS in
// that mailbox for a person to send. Nothing here sends: Mail.Send is never
// asked for, and no request goes to a /send address (a test pins it).
//
// The mailbox is named in every request (/users/{address}/...), so a token
// can only ever read the mailbox it was connected for; Graph refuses if the
// person who signed in has no access to it. That covers both shapes a
// company's main address takes in Microsoft 365:
//   - a person's own mailbox: they sign in as that address;
//   - a shared mailbox (common for bookings@ and info@): nobody can sign in
//     as it, so someone with access to it signs in as themselves. That
//     needs Mail.ReadWrite.Shared as well as Mail.ReadWrite.
// A company's other addresses (.co.uk, .net) are aliases of the mailbox in
// Microsoft 365, so their mail is already in it.
//
// Every request asks for immutable ids (Prefer: IdType="ImmutableId"), so a
// draft keeps its id when it is sent and moves to Sent Items. That is how
// the office sees a reply has gone (Microsoft's own documented use,
// learn.microsoft.com/graph/outlook-immutable-id, read 27 November 2026).
//
// Microsoft rotates refresh tokens: a token response may carry a new one.
// It is kept, and handed to onRotate so the office saves it sealed; the old
// one stays valid meanwhile, so a missed save loses nothing.

const { londonParts } = require('../../taxi-demo/lib/fares');
const { MailError } = require('../../lib/taxiOffice/mail');
const { sameReply } = require('../../lib/taxiOffice/mail/gmail');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const LOGIN = 'https://login.microsoftonline.com';
// offline_access: a refresh token. User.Read: who signed in. Mail.ReadWrite:
// read the inbox and create drafts in their own mailbox. .Shared: the same
// in a mailbox they have been given access to. No Mail.Send.
const SCOPES = ['offline_access', 'https://graph.microsoft.com/User.Read', 'https://graph.microsoft.com/Mail.ReadWrite', 'https://graph.microsoft.com/Mail.ReadWrite.Shared'];
const SCOPE = SCOPES.join(' ');
const LABEL = 'Outlook';
const PREFER = 'IdType="ImmutableId", outlook.body-content-type="text"';

class GraphRefused extends Error {
  constructor(message) { super(message); this.code = 'MAILBOX_REFUSED'; }
}

const clean = (v) => String(v || '').trim();
// A tenant is its id (a GUID) or one of its domain names.
const validTenant = (v) => /^[A-Za-z0-9][A-Za-z0-9.-]{2,99}$/.test(clean(v));
const validClientId = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean(v));
const validSecret = (v) => /^[^\s]{8,200}$/.test(clean(v));
const missing = (c = {}) => [!clean(c.tenant) && 'the tenant ID', !clean(c.clientId) && 'the client ID', !clean(c.clientSecret) && 'the client secret'].filter(Boolean);

const tokenUrl = (tenant) => `${LOGIN}/${encodeURIComponent(clean(tenant))}/oauth2/v2.0/token`;
const userPath = (address) => `/users/${encodeURIComponent(clean(address).toLowerCase())}`;

function authorizeUrl({ tenant, clientId, redirectUri, state, loginHint }) {
  const q = new URLSearchParams({
    client_id: clean(clientId),
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPE,
    // The account list every time, so the person chooses who signs in.
    prompt: 'select_account',
    state
  });
  if (loginHint) q.set('login_hint', loginHint);
  return `${LOGIN}/${encodeURIComponent(clean(tenant))}/oauth2/v2.0/authorize?${q.toString()}`;
}

function londonStamp(iso) {
  const p = londonParts(new Date(iso));
  return `${p.date}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
function named(from) {
  const e = (from && from.emailAddress) || {};
  return e.name && e.address && e.name !== e.address ? `${e.name} <${e.address}>` : (e.address || '');
}

// Finishing the sign-in: the code is exchanged for tokens, Microsoft says
// who signed in, and the mailbox itself is opened once. If that person
// cannot open it, nothing is kept.
// -> { ok: true, refreshToken, signedInAs } | { ok: false, signedInAs?, message }
async function finish({ tenant, clientId, clientSecret, code, redirectUri, mailbox, fetch = globalThis.fetch }) {
  const want = clean(mailbox).toLowerCase();
  const res = await fetch(tokenUrl(tenant), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clean(clientId), client_secret: clean(clientSecret), code, redirect_uri: redirectUri, grant_type: 'authorization_code', scope: SCOPE }).toString()
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok || !t.access_token) return { ok: false, message: `Microsoft did not issue a token (${t.error || res.status}).` };
  const auth = { Authorization: `Bearer ${t.access_token}` };
  const me = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, { headers: auth }).then((r) => r.json()).catch(() => ({}));
  const signedInAs = clean(me.mail || me.userPrincipalName).toLowerCase();
  const probe = await fetch(`${GRAPH}${userPath(want)}/mailFolders/inbox?$select=id`, { headers: auth });
  if (!probe.ok) {
    return {
      ok: false,
      signedInAs,
      message: `${signedInAs || 'That account'} cannot open the mailbox ${want}, so nothing was connected and its sign-in is not kept. Sign in as ${want}, or as someone who has been given access to it. If it is a shared mailbox, use its main address, not one that forwards.`
    };
  }
  if (!t.refresh_token) return { ok: false, signedInAs, message: 'Microsoft did not issue a lasting sign-in. Start again and accept what it asks for.' };
  return { ok: true, refreshToken: t.refresh_token, signedInAs };
}

function create({ address, tenant, clientId, clientSecret, refreshToken, onRotate = null, fetch = globalThis.fetch } = {}) {
  const want = clean(address).toLowerCase();
  const base = GRAPH + userPath(want);
  let token = null;
  let refresh = clean(refreshToken);
  const configured = () => Boolean(want && refresh && !missing({ tenant, clientId, clientSecret }).length);

  async function accessToken() {
    if (!configured()) throw new GraphRefused(`${want || 'this mailbox'} is not connected yet`);
    if (token && token.expires > Date.now() + 60 * 1000) return token.value;
    const res = await fetch(tokenUrl(tenant), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clean(clientId), client_secret: clean(clientSecret), refresh_token: refresh, grant_type: 'refresh_token', scope: SCOPE }).toString()
    });
    const j = await res.json().catch(() => ({}));
    // Microsoft no longer accepts the saved sign-in (revoked, a changed
    // password, ninety days unused): said plainly, so someone reconnects it.
    if (j.error === 'invalid_grant' || j.error === 'interaction_required') throw new GraphRefused(`${want} needs connecting again in Settings (Microsoft no longer accepts its saved sign-in)`);
    if (!res.ok || !j.access_token) throw new MailError(LABEL, 'sign in', res.status, j.error || '');
    if (j.refresh_token && j.refresh_token !== refresh) {
      refresh = j.refresh_token;
      if (onRotate) { try { await onRotate(refresh); } catch (e) { /* the old one still works; saved next time */ } }
    }
    token = { value: j.access_token, expires: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
    return token.value;
  }

  // -> { status, body }. Throws on anything but ok, unless the status is in
  // `allow` (a 404 the caller wants to read as an answer).
  // `wholeMailbox`: the request is for the inbox itself, which every mailbox
  // has, so "not found" can only mean the account may no longer open it.
  async function graph(path, init = {}, { what = 'read the inbox', allow = [], wholeMailbox = false } = {}) {
    const res = await fetch(base + path, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, Prefer: PREFER, ...(init.headers || {}) } });
    const j = await res.json().catch(() => ({}));
    if (res.ok || allow.includes(res.status)) return { status: res.status, body: j };
    const detail = (j.error && (j.error.message || j.error.code)) || '';
    if (res.status === 403 || (res.status === 404 && (wholeMailbox || /mailbox|user/i.test(String((j.error && j.error.code) || ''))))) throw new GraphRefused(`Microsoft would not open ${want} for the account it is connected with${detail ? ` (${String(detail).slice(0, 120)})` : ''}`);
    throw new MailError(LABEL, what, res.status, detail);
  }

  async function listInbox({ max = 20, days = 7 } = {}) {
    const top = Math.min(Math.max(1, max), 50);
    const since = new Date(Date.now() - Math.min(Math.max(1, Number(days) || 7), 30) * 86400000).toISOString();
    const q = [
      `$top=${top}`,
      `$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}`,
      `$orderby=${encodeURIComponent('receivedDateTime desc')}`,
      `$select=${encodeURIComponent('id,conversationId,internetMessageId,subject,from,replyTo,toRecipients,ccRecipients,receivedDateTime,body')}`
    ].join('&');
    const { body } = await graph(`/mailFolders/inbox/messages?${q}`, {}, { wholeMailbox: true });
    return (body.value || []).map((m) => ({
      id: `ol-${m.id}`,
      providerId: m.id,
      threadId: m.conversationId || '',
      messageId: m.internetMessageId || '',
      from: (m.replyTo && m.replyTo.length ? named(m.replyTo[0]) : '') || named(m.from),
      to: [...(m.toRecipients || []), ...(m.ccRecipients || [])].map((r) => (r.emailAddress && r.emailAddress.address) || '').filter(Boolean),
      subject: m.subject || '(no subject)',
      receivedAt: londonStamp(m.receivedDateTime),
      body: String((m.body && m.body.content) || '').replace(/\r/g, '').trim().slice(0, 6000)
    }));
  }

  // createReply puts a draft on the right conversation, addressed to the
  // sender, with the text above the quoted original. It is not sent. A new
  // email (fresh) is a draft in its own right.
  async function saveReplyDraft(email, text) {
    const post = (path, payload) => graph(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, { what: 'save the draft' });
    if (email.fresh) {
      const { body } = await post('/messages', { subject: String(email.subject || ''), body: { contentType: 'Text', content: String(text || '') }, toRecipients: email.from ? [{ emailAddress: { address: String(email.from) } }] : [] });
      return { draftId: body.id || null, threadId: body.conversationId || null };
    }
    const id = clean(email.providerId) || clean(email.id).replace(/^ol-/, '');
    if (!id) throw new GraphRefused('this email has no Microsoft id to reply to');
    const { body } = await post(`/messages/${encodeURIComponent(id)}/createReply`, { comment: String(text || '') });
    return { draftId: body.id || null, threadId: body.conversationId || null };
  }

  // What became of a draft this office saved. The same id is asked for
  // again: still a draft in the mailbox is 'unsent'; no longer a draft is
  // the sent copy, 'sent' when it is the approved reply as written and
  // 'other' when it was changed first; in Deleted Items is 'discarded'.
  // Not found answers null, never 'discarded': a reply sent from a shared
  // mailbox can be filed in the sender's own Sent Items, where this mailbox
  // cannot see it, so the office leaves it for a person to mark as sent.
  let binId = null;
  async function draftState({ draftId, text }) {
    if (!draftId) return null;
    const { status, body } = await graph(`/messages/${encodeURIComponent(draftId)}?$select=${encodeURIComponent('id,isDraft,parentFolderId,sentDateTime,body')}`, {}, { what: 'check a draft', allow: [404] });
    if (status === 404) return null;
    if (body.isDraft) {
      if (binId === null) {
        const bin = await graph('/mailFolders/deleteditems?$select=id', {}, { what: 'check a draft', allow: [404] });
        binId = (bin.body && bin.body.id) || '';
      }
      return binId && body.parentFolderId === binId ? { state: 'discarded' } : { state: 'unsent' };
    }
    const at = body.sentDateTime ? new Date(body.sentDateTime) : new Date();
    return { state: sameReply((body.body && body.body.content) || '', text) ? 'sent' : 'other', at };
  }

  return { name: 'outlook', label: LABEL, address: want, configured, missing: () => missing({ tenant, clientId, clientSecret }), listInbox, saveReplyDraft, draftState, account: async () => want, currentRefreshToken: () => refresh };
}

module.exports = { create, finish, authorizeUrl, missing, validTenant, validClientId, validSecret, SCOPES, GraphRefused };
