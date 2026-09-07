// Verification for the Gmail connector. Google's hosts are not reachable
// from the build sandbox and no credential belongs in a test, so `fetch`
// is stubbed and every contract the client makes with Google is asserted
// from what it SENDS: URL, method, headers, body, and what it does with
// the reply. The live check (a real token, a real inbox) is Tom's, after
// the Railway variables are set.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client = require('../../lib/workspace/email/gmailClient');
const summary = require('../../lib/workspace/email/summary');
const lanes = require('../../lib/workspace/lanes');
const orchestrator = require('../../lib/workspace/orchestrator');

const FAKE = { GMAIL_CLIENT_ID: 'test-client-id.apps', GMAIL_CLIENT_SECRET: 'test-client-secret', GMAIL_REFRESH_TOKEN: 'test-refresh-token' };

function stubFetch(replies) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const reply = replies.shift() || { status: 200, json: {} };
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, statusText: reply.statusText || '', json: async () => reply.json };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test.beforeEach(() => client.clearTokenCache());

test('fixed Google endpoints, canonical redirect URI, and a read-only scope by default', () => {
  assert.equal(client.CANONICAL_REDIRECT_URI, 'https://www.arringtonconsultancy.com/workspace/email/gmail/callback');
  assert.deepEqual(client.READ_SCOPES, ['https://www.googleapis.com/auth/gmail.readonly']);
  assert.deepEqual(client.SEND_SCOPES, ['https://www.googleapis.com/auth/gmail.send']);
  assert.deepEqual(client.requestedScopes({}), client.READ_SCOPES);
  assert.deepEqual(client.requestedScopes({ ENABLE_GMAIL_SEND: 'true' }), [...client.READ_SCOPES, ...client.SEND_SCOPES]);
  assert.deepEqual(client.requestedScopes({ ENABLE_GMAIL_SEND: 'TRUE' }), client.READ_SCOPES, 'only the exact string true arms sending');
  // Never a modify, delete, settings or full-mailbox scope.
  [...client.READ_SCOPES, ...client.SEND_SCOPES].forEach((s) => assert.doesNotMatch(s, /modify|mail\.google\.com|settings|labels|compose|insert/));
});

test('the authorise URL asks for offline access with forced consent, trims the client id, and carries the state', () => {
  const url = new URL(client.buildAuthorizeUrl('state-abc', { GMAIL_CLIENT_ID: '  id-with-space  \n' }));
  assert.equal(url.origin + url.pathname, client.AUTH_URL);
  assert.equal(url.searchParams.get('client_id'), 'id-with-space');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('redirect_uri'), client.CANONICAL_REDIRECT_URI);
  assert.equal(url.searchParams.get('scope'), client.READ_SCOPES.join(' '));
  assert.equal(url.searchParams.get('state'), 'state-abc');
});

test('isConfigured needs all three variables non-blank', () => {
  assert.equal(client.isConfigured(FAKE), true);
  assert.equal(client.isConfigured({ ...FAKE, GMAIL_REFRESH_TOKEN: '   ' }), false);
  assert.equal(client.isConfigured({}), false);
});

test('token refresh posts trimmed credentials as a form, caches the token, and its error carries no secret', async () => {
  const env = { ...FAKE, GMAIL_REFRESH_TOKEN: 'test-refresh-token\n' };
  const f = stubFetch([{ status: 200, json: { access_token: 'at-1', expires_in: 3600 } }]);
  try {
    const t1 = await client.getAccessToken(env);
    const t2 = await client.getAccessToken(env);
    assert.equal(t1, 'at-1'); assert.equal(t2, 'at-1');
    assert.equal(f.calls.length, 1, 'second call served from cache');
    assert.equal(f.calls[0].url, client.TOKEN_URL);
    const body = new URLSearchParams(f.calls[0].init.body);
    assert.equal(body.get('grant_type'), 'refresh_token');
    assert.equal(body.get('refresh_token'), 'test-refresh-token');
    assert.equal(body.get('client_secret'), 'test-client-secret');
  } finally { f.restore(); }
  client.clearTokenCache();
  const g = stubFetch([{ status: 400, json: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } }]);
  try {
    await assert.rejects(() => client.getAccessToken(env), (err) => {
      assert.match(err.message, /invalid_grant/);
      assert.doesNotMatch(err.message, /test-refresh-token|test-client-secret/);
      return true;
    });
  } finally { g.restore(); }
});

test('reads use format=metadata with only the four headers, and a message summary is built from the reply', async () => {
  const f = stubFetch([
    { status: 200, json: { messages: [{ id: 'm1', threadId: 't1' }] } },
    { status: 200, json: { id: 'm1', threadId: 't1', labelIds: ['INBOX', 'UNREAD'], snippet: 'Hello there', internalDate: '1757200000000', payload: { headers: [{ name: 'From', value: 'Jane <jane@example.com>' }, { name: 'Subject', value: 'Quote' }, { name: 'Date', value: 'Mon, 7 Sep 2026 10:00:00 +0100' }] } } }
  ]);
  try {
    const r = await client.listInbox('at', { maxResults: 5, q: 'newer_than:7d' });
    const listUrl = new URL(f.calls[0].url);
    assert.equal(listUrl.origin + listUrl.pathname, `${client.API_BASE}/messages`);
    assert.equal(listUrl.searchParams.get('maxResults'), '5');
    assert.equal(listUrl.searchParams.get('q'), 'newer_than:7d');
    assert.equal(listUrl.searchParams.get('labelIds'), 'INBOX');
    assert.equal(f.calls[0].init.headers.Authorization, 'Bearer at');
    const msgUrl = new URL(f.calls[1].url);
    assert.equal(msgUrl.searchParams.get('format'), 'metadata');
    assert.deepEqual(msgUrl.searchParams.getAll('metadataHeaders'), client.METADATA_HEADERS);
    assert.equal(r.failed, 0);
    assert.equal(r.messages.length, 1);
    assert.equal(r.messages[0].from, 'Jane <jane@example.com>');
    assert.equal(r.messages[0].subject, 'Quote');
    assert.equal(r.messages[0].unread, true);
    assert.equal(r.messages[0].snippet, 'Hello there');
    assert.equal(r.messages[0].date.toISOString(), new Date(1757200000000).toISOString());
  } finally { f.restore(); }
});

test("Google's HTML-escaped snippet is decoded to plain text", () => {
  assert.equal(client.decodeEntities('we&#39;ll reply &lt;tom@example.com&gt; &amp; more &quot;soon&quot; &#x41;'), 'we\'ll reply <tom@example.com> & more "soon" A');
  assert.equal(client.decodeEntities('no entities here'), 'no entities here');
  assert.equal(client.decodeEntities('&unknown; stays'), '&unknown; stays');
  assert.equal(client.decodeEntities(undefined), '');
});

test('one failed message costs one row, not the listing', async () => {
  const f = stubFetch([
    { status: 200, json: { messages: [{ id: 'a' }, { id: 'b' }] } },
    { status: 200, json: { id: 'a', payload: { headers: [] }, internalDate: '2' } },
    { status: 500, json: { error: { message: 'Backend Error' } } }
  ]);
  try {
    const r = await client.listInbox('at');
    assert.equal(r.messages.length, 1);
    assert.equal(r.failed, 1);
  } finally { f.restore(); }
});

test('API errors name the status and Google message, hint at reconnecting on 401, and never echo the token', async () => {
  const f = stubFetch([{ status: 401, json: { error: { code: 401, message: 'Invalid Credentials', status: 'UNAUTHENTICATED' } } }]);
  try {
    await assert.rejects(() => client.getProfile('secret-access-token'), (err) => {
      assert.match(err.message, /Gmail API \/profile failed \(401\): Invalid Credentials \(the stored token was refused: reconnect Gmail\)/);
      assert.doesNotMatch(err.message, /secret-access-token/);
      return true;
    });
  } finally { f.restore(); }
});

test('with the send flag off, sendMessage throws before any network call', async () => {
  const f = stubFetch([]);
  try {
    await assert.rejects(() => client.sendMessage('at', { from: 'tom@example.com', to: 'a@b.co', subject: 'x', text: 'y' }, {}), (err) => err.name === 'GmailSendDisabledError');
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});

test('with the send flag on, sendMessage posts a base64url RFC 822 message with sanitised headers', async () => {
  const f = stubFetch([{ status: 200, json: { id: 'sent-1', threadId: 'th-1' } }]);
  try {
    const r = await client.sendMessage('at', { from: 'tom@example.com', to: 'jane@example.com', subject: 'Hello\r\nBcc: evil@example.com', text: 'Line one\nLine two' }, { ENABLE_GMAIL_SEND: 'true' });
    assert.deepEqual(r, { id: 'sent-1', threadId: 'th-1' });
    assert.equal(f.calls[0].url, `${client.API_BASE}/messages/send`);
    assert.equal(f.calls[0].init.method, 'POST');
    const raw = JSON.parse(f.calls[0].init.body).raw;
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    assert.match(decoded, /^From: tom@example\.com\r\nTo: jane@example\.com\r\nSubject: Hello Bcc: evil@example\.com\r\n/);
    assert.doesNotMatch(decoded, /\r\nBcc:/, 'a newline in the subject cannot inject a header');
    assert.match(decoded, /\r\n\r\nLine one\r\nLine two$/);
  } finally { f.restore(); }
});

test('buildRawMessage refuses a bad recipient, an empty subject or an empty body', () => {
  assert.throws(() => client.buildRawMessage({ from: 'tom@example.com', to: 'not-an-address', subject: 'x', text: 'y' }), /valid recipient/);
  assert.throws(() => client.buildRawMessage({ from: 'tom@example.com', to: 'a@b.co', subject: '  ', text: 'y' }), /subject/);
  assert.throws(() => client.buildRawMessage({ from: 'tom@example.com', to: 'a@b.co', subject: 'x', text: '  ' }), /empty/);
  const raw = client.buildRawMessage({ from: 'tom@example.com', to: 'a@b.co', subject: 'Café order', text: 'y' });
  assert.match(Buffer.from(raw, 'base64url').toString('utf8'), /Subject: =\?UTF-8\?B\?/, 'non-ASCII subjects are encoded');
});

test('the Brain record is bounded, confidential, headers-only, and in the email source class', () => {
  const now = new Date('2026-09-07T09:00:00Z');
  const messages = Array.from({ length: 30 }, (_, i) => ({ from: `p${i}@example.com`, subject: `Subject ${i}`, date: new Date(now.getTime() - i * 60000), snippet: `preview ${i}`, unread: i === 0 }));
  const r = summary.buildEmailSummaryRecord({ profile: { emailAddress: 'tom@example.com' }, counts: { unread: 3, total: 120 }, messages, now });
  assert.equal(r.record_key, summary.EMAIL_SUMMARY_RECORD_KEY);
  assert.equal(r.source_class, 'email');
  assert.equal(r.sensitivity, 'confidential');
  assert.equal(r.stale_after_days, 1);
  assert.equal(r.meta.messages, summary.SUMMARY_MESSAGE_COUNT);
  assert.equal(r.meta.unread, 3);
  assert.match(r.body, /Inbox: 3 unread of 120 messages\./);
  assert.match(r.body, /headers and one-line previews only, not message bodies/);
  assert.match(r.body, /\[unread\] from p0@example\.com: Subject 0 \| preview 0/);
  assert.doesNotMatch(r.body, /Subject 29/, 'bounded to the most recent messages');
  assert.ok(lanes.SOURCE_CLASSES.email, 'email must be a declared source class');
  assert.ok(orchestrator.GENERAL_SOURCE_CLASSES.includes('email'));
  assert.deepEqual(lanes.LANES.filter((l) => l.id !== 'governance_assurance' && l.sourceClasses.includes('email')), [], 'no worker lane reads email');
});

test('the routes: send only in its own route, no AI path, both API routes behind the confidential check', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'workspace.js'), 'utf8');
  const sendCalls = routes.match(/gmailClient\.sendMessage\(/g) || [];
  assert.equal(sendCalls.length, 2, 'exactly two callers of sendMessage: the send route and the reply route');
  const sendRouteIdx = routes.indexOf("router.post('/api/workspace/email/gmail/send'");
  const replyRouteIdx = routes.indexOf("router.post('/api/workspace/email/gmail/reply'");
  assert.ok(replyRouteIdx > 0);
  const replyBody = routes.slice(replyRouteIdx, routes.indexOf('function zohoWriteError'));
  assert.match(replyBody, /gmailClient\.getMessageFull\(token, messageId\)/, 'the reply re-reads the original by id');
  assert.match(replyBody, /to: original\.replyAddress/, 'the recipient comes from the original, not the request');
  assert.match(replyBody, /threadId: original\.threadId/);
  assert.doesNotMatch(replyBody, /req\.body\.to|req\.body\.subject/, 'the request body cannot choose the recipient or subject');
  const askIdx = routes.indexOf("router.post('/api/workspace/ask'");
  assert.ok(sendRouteIdx > 0 && askIdx > 0);
  const askBody = routes.slice(askIdx, routes.indexOf('router.post(', askIdx + 10));
  assert.doesNotMatch(askBody, /gmailClient|sendMessage/, 'Ask Ruth reaches no email send path');
  for (const route of ["router.post('/api/workspace/email/gmail/sync'", "router.post('/api/workspace/email/gmail/send'", "router.post('/api/workspace/email/gmail/reply'"]) {
    const idx = routes.indexOf(route);
    assert.ok(idx > 0, route);
    assert.match(routes.slice(idx, idx + 400), /clearanceCanSeeSensitivity\(req\.workspaceClearance, 'confidential'\)/);
  }
  assert.match(routes.slice(sendRouteIdx, sendRouteIdx + 800), /gmailClient\.sendEnabled\(\)/);
});

test('a full message yields plain text from text/plain first, then stripped html, at any nesting depth', () => {
  const b = (t) => Buffer.from(t).toString('base64url');
  const nested = { mimeType: 'multipart/mixed', parts: [{ mimeType: 'multipart/alternative', parts: [
    { mimeType: 'text/plain', body: { data: b('Hi Tom,\r\nplain here') } },
    { mimeType: 'text/html', body: { data: b('<p>Hi <b>Tom</b></p>') } }
  ] }, { mimeType: 'application/pdf', body: { attachmentId: 'x' } }] };
  assert.deepEqual(client.extractBody(nested), { text: 'Hi Tom,\nplain here', source: 'text/plain' });
  const htmlOnly = { mimeType: 'text/html', body: { data: b('<html><style>p{color:red}</style><body><p>Hello&nbsp;there</p><br><div>Line two</div><script>x()</script></body></html>') } };
  assert.deepEqual(client.extractBody(htmlOnly), { text: 'Hello there\n\nLine two', source: 'text/html' });
  assert.deepEqual(client.extractBody({ mimeType: 'image/png', body: { attachmentId: 'y' } }), { text: '', source: 'none' });
  assert.deepEqual(client.extractBody(undefined), { text: '', source: 'none' });
});

test('getMessageFull asks for format=full and reads the reply address from Reply-To before From', async () => {
  const b = (t) => Buffer.from(t).toString('base64url');
  const f = stubFetch([{ status: 200, json: { id: 'm9', threadId: 't9', labelIds: ['INBOX'], internalDate: '1757200000000', payload: {
    mimeType: 'text/plain', body: { data: b('Body text') },
    headers: [{ name: 'From', value: 'Jane <jane@example.com>' }, { name: 'Reply-To', value: 'replies@example.com' }, { name: 'Subject', value: 'Quote' }, { name: 'Message-ID', value: '<abc@mail.example.com>' }, { name: 'References', value: '<prev@mail.example.com>' }]
  } } }]);
  try {
    const m = await client.getMessageFull('at', 'm9');
    assert.equal(new URL(f.calls[0].url).searchParams.get('format'), 'full');
    assert.equal(m.bodyText, 'Body text');
    assert.equal(m.replyAddress, 'replies@example.com');
    assert.equal(m.messageId, '<abc@mail.example.com>');
    assert.equal(m.references, '<prev@mail.example.com>');
    assert.equal(m.threadId, 't9');
  } finally { f.restore(); }
});

test('a reply carries In-Reply-To and References and the Gmail threadId, so it files in the conversation', async () => {
  const f = stubFetch([{ status: 200, json: { id: 'r1', threadId: 't9' } }]);
  try {
    await client.sendMessage('at', { from: 'tom@example.com', to: 'jane@example.com', subject: 'Re: Quote', text: 'Thanks', inReplyTo: '<abc@mail.example.com>', references: '<prev@mail.example.com>', threadId: 't9' }, { ENABLE_GMAIL_SEND: 'true' });
    const body = JSON.parse(f.calls[0].init.body);
    assert.equal(body.threadId, 't9');
    const decoded = Buffer.from(body.raw, 'base64url').toString('utf8');
    assert.match(decoded, /\r\nIn-Reply-To: <abc@mail\.example\.com>\r\n/);
    assert.match(decoded, /\r\nReferences: <prev@mail\.example\.com> <abc@mail\.example\.com>\r\n/);
  } finally { f.restore(); }
  // A fresh send carries neither header and no threadId.
  const g = stubFetch([{ status: 200, json: { id: 's1' } }]);
  try {
    await client.sendMessage('at', { from: 'tom@example.com', to: 'jane@example.com', subject: 'New', text: 'Hello' }, { ENABLE_GMAIL_SEND: 'true' });
    const body = JSON.parse(g.calls[0].init.body);
    assert.equal(body.threadId, undefined);
    assert.doesNotMatch(Buffer.from(body.raw, 'base64url').toString('utf8'), /In-Reply-To|References/);
  } finally { g.restore(); }
});

test('the client and the Brain record share nothing with Scott', () => {
  for (const file of ['gmailClient.js', 'summary.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'email', file), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /scott/i, file);
  }
});
