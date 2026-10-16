'use strict';

// Outlook driver: a firm's Microsoft 365 or Outlook.com inbox, through
// Microsoft Graph. Reads the inbox and leaves replies as drafts on the
// thread (Graph's createReply, which puts the draft in the Drafts folder
// and does not send it).
//
// Needs, set on the service (never in code):
//   TAXI_OFFICE_OUTLOOK_TENANT_ID       the firm's Entra tenant, or
//                                       "consumers" for Outlook.com
//   TAXI_OFFICE_OUTLOOK_CLIENT_ID       app registration in that tenant
//   TAXI_OFFICE_OUTLOOK_CLIENT_SECRET
//   TAXI_OFFICE_OUTLOOK_REFRESH_TOKEN   issued with offline_access and
//                                       Mail.ReadWrite
//
// Microsoft rotates refresh tokens: each token response may carry a new
// one, which this keeps in memory for as long as the process runs. After a
// restart the variable's token is used again, which stays valid unless it
// has gone unused for 90 days.
//
// Mail.ReadWrite is what drafts need; it does not include sending (that is
// Mail.Send, which is never requested), and this file never calls /send.

const { londonParts } = require('../../../taxi-demo/lib/fares');
const { MailNotConfigured, MailError } = require('./index');

const GRAPH = 'https://graph.microsoft.com/v1.0/me';
const SCOPE = 'offline_access https://graph.microsoft.com/Mail.ReadWrite';
const VARS = ['TAXI_OFFICE_OUTLOOK_TENANT_ID', 'TAXI_OFFICE_OUTLOOK_CLIENT_ID', 'TAXI_OFFICE_OUTLOOK_CLIENT_SECRET', 'TAXI_OFFICE_OUTLOOK_REFRESH_TOKEN'];
const LABEL = 'Outlook';

function londonStamp(iso) {
  const p = londonParts(new Date(iso));
  return `${p.date}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function address(from) {
  const e = (from && from.emailAddress) || {};
  return e.name && e.address ? `${e.name} <${e.address}>` : (e.address || '');
}

function create({ env = process.env, fetch = globalThis.fetch } = {}) {
  const val = (k) => String(env[k] || '').trim();
  const missing = () => VARS.filter((k) => !val(k));
  let token = null;
  let refresh = null;

  async function accessToken() {
    if (missing().length) throw new MailNotConfigured(LABEL, missing());
    if (token && token.expires > Date.now() + 60 * 1000) return token.value;
    const tenant = encodeURIComponent(val('TAXI_OFFICE_OUTLOOK_TENANT_ID'));
    const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: val('TAXI_OFFICE_OUTLOOK_CLIENT_ID'),
        client_secret: val('TAXI_OFFICE_OUTLOOK_CLIENT_SECRET'),
        refresh_token: refresh || val('TAXI_OFFICE_OUTLOOK_REFRESH_TOKEN'),
        grant_type: 'refresh_token',
        scope: SCOPE
      }).toString()
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) throw new MailError(LABEL, 'sign in', res.status, j.error || '');
    if (j.refresh_token) refresh = j.refresh_token;
    token = { value: j.access_token, expires: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
    return token.value;
  }

  async function graph(path, init = {}) {
    const res = await fetch(GRAPH + path, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken()}`, Prefer: 'outlook.body-content-type="text"', ...(init.headers || {}) }
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new MailError(LABEL, init.method === 'POST' ? 'save the draft' : 'read the inbox', res.status, (j.error && j.error.message) || '');
    return j;
  }

  async function listInbox({ max = 20, days = 0 } = {}) {
    const top = Math.min(Math.max(1, max), 50);
    const since = Number(days) > 0 ? `&$filter=${encodeURIComponent(`receivedDateTime ge ${new Date(Date.now() - Math.min(Number(days), 30) * 86400000).toISOString()}`)}` : '';
    const q = `$top=${top}${since}&$orderby=${encodeURIComponent('receivedDateTime desc')}&$select=${encodeURIComponent('id,conversationId,internetMessageId,subject,from,replyTo,toRecipients,ccRecipients,receivedDateTime,body')}`;
    const j = await graph(`/mailFolders/inbox/messages?${q}`);
    return (j.value || []).map((m) => ({
      id: `ol-${m.id}`,
      providerId: m.id,
      threadId: m.conversationId || '',
      messageId: m.internetMessageId || '',
      from: (m.replyTo && m.replyTo.length ? address(m.replyTo[0]) : '') || address(m.from),
      to: [...(m.toRecipients || []), ...(m.ccRecipients || [])].map((r) => (r.emailAddress && r.emailAddress.address) || '').filter(Boolean),
      subject: m.subject || '(no subject)',
      receivedAt: londonStamp(m.receivedDateTime),
      body: String((m.body && m.body.content) || '').replace(/\r/g, '').trim().slice(0, 6000)
    }));
  }

  // The mailbox's own address, if Graph will say with the scope it has.
  // Mail.ReadWrite alone does not always cover /me, so this answers null
  // rather than failing when it will not.
  async function account() {
    try {
      const j = await graph('?$select=mail,userPrincipalName');
      const a = j.mail || j.userPrincipalName;
      return a ? String(a).toLowerCase() : null;
    } catch (e) {
      return null;
    }
  }

  // createReply makes the draft on the right thread, addressed to the
  // sender, with the text above the quoted original. It is not sent.
  async function saveReplyDraft(email, text) {
    const j = await graph(`/messages/${encodeURIComponent(email.providerId)}/createReply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: String(text || '') })
    });
    return { draftId: j.id || null };
  }

  return { name: 'outlook', label: LABEL, configured: () => missing().length === 0, missing, listInbox, saveReplyDraft, account };
}

module.exports = { create, VARS };
