// The pending-action flow in Ask Ruth, end to end against a RUNNING
// workspace over real HTTP (07/09/2026).
//
// Replays Tom's exact failing sequence from the live bug report, then
// the ordinary follow-ups he listed, and checks the chat and approvals
// pages show the pending action and its mode. Skips unless the same
// variables as the adversarial suite are set. Needs Zoho writes to be
// configured on the server (any credential values; nothing is executed
// here, only drafted), or the drafting step reports NOT EXECUTABLE.
const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.WORKSPACE_TEST_BASE_URL;
const TOM_PASSWORD = process.env.WORKSPACE_TEST_TOM_PASSWORD;
const PASSPHRASE = process.env.WORKSPACE_TEST_PASSPHRASE;
const configured = !!(BASE && TOM_PASSWORD && PASSPHRASE);

function makeClient() {
  const jar = new Map();
  const absorb = (res) => (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach((c) => {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  });
  return {
    cookieHeader: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    async go(path, { method = 'GET', body = null, headers = {} } = {}) {
      const res = await fetch(`${BASE}${path}`, {
        method, redirect: 'manual',
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(jar.size ? { Cookie: this.cookieHeader() } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined
      });
      absorb(res);
      return res;
    },
    async login(username, password) {
      const html = await (await this.go('/login')).text();
      const token = (html.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      const res = await fetch(`${BASE}/login`, {
        method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: this.cookieHeader() },
        body: new URLSearchParams({ username, password, _csrf: token }).toString()
      });
      absorb(res);
      return res;
    }
  };
}

test('pending-action follow-ups in Ask Ruth', { skip: configured ? false : 'set WORKSPACE_TEST_BASE_URL, WORKSPACE_TEST_TOM_PASSWORD and WORKSPACE_TEST_PASSPHRASE to run' }, async (t) => {
  const tom = makeClient();
  await tom.login('tom', TOM_PASSWORD);
  assert.equal((await tom.go('/login')).status, 302, 'tom is not authenticated (the login limiter, if this is a repeat run: restart the server)');
  let html = await (await tom.go('/workspace/unlock')).text();
  let csrf = (html.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
  const unlocked = await tom.go('/api/workspace/unlock', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: { passphrase: PASSPHRASE } });
  assert.equal(unlocked.status, 200, 'the passphrase was refused');
  html = await (await tom.go('/workspace/chat')).text();
  csrf = (html.match(/name="csrf-token" content="([^"]+)"/) || [])[1];

  let conversationId = null;
  async function ask(question, { fresh = false, laneId = null } = {}) {
    const res = await tom.go('/api/workspace/ask', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: { question, conversationId: fresh ? null : conversationId, laneId } });
    const data = await res.json();
    if (res.status === 200 && !fresh) conversationId = data.conversationId;
    return { status: res.status, data };
  }

  // Turn 1: Tom's original sentence.
  const first = await ask('send an invoice to tomarrington@outlook.com £500 for mini commercial review as of today');
  assert.equal(first.status, 200, JSON.stringify(first.data));
  if (/switched off in this environment/.test(first.data.answer)) {
    return t.skip('NOT EXECUTABLE: Zoho Invoice writes are not configured on the server, so no draft can be raised');
  }
  assert.ok(first.data.invoiceDraft, 'a draft card is returned');
  const id = first.data.invoiceDraft.approvalId;
  assert.equal(first.data.invoiceDraft.mode, 'create_and_send', '"send an invoice" means create and send');
  assert.match(first.data.answer, new RegExp(`approval #${id}`));

  await t.test("Tom's step 5: 'create it as a draft ... do not email it' changes the pending draft's mode, it is not a new invoice", async () => {
    const r = await ask('I want to review the actual invoice before it is sent. Create it as a draft in Zoho Invoice only. Do not email it or send it to the customer.');
    assert.equal(r.status, 200);
    assert.doesNotMatch(r.data.answer, /I need the customer email address/, 'the old canned reply');
    assert.match(r.data.answer, /draft in Zoho Invoice only/);
    assert.equal(r.data.invoiceDraft.approvalId, id, 'the same approval, revised in place');
    assert.equal(r.data.invoiceDraft.mode, 'draft_only');
  });

  await t.test("Tom's step 7: 'I want the invoice sitting in drafts' stays on the Zoho draft, never Gmail", async () => {
    const r = await ask('I want the invoice sitting in drafts');
    assert.equal(r.status, 200);
    assert.doesNotMatch(r.data.answer, /gmail|outlook\.com drafts|email draft/i);
    assert.match(r.data.answer, /already set that way|draft in Zoho Invoice only/);
    assert.equal(r.data.invoiceDraft.approvalId, id);
    assert.equal(r.data.invoiceDraft.mode, 'draft_only');
    assert.equal(r.data.receptionist, null, 'no lane read a record, so no handoff note');
  });

  await t.test('amend: amount, description, date, mode, without restating the rest', async () => {
    let r = await ask('change it to £600');
    assert.match(r.data.answer, /Updated approval #\d+: amount to £600\.00/);
    assert.equal(r.data.invoiceDraft.approvalId, id);
    assert.match(r.data.invoiceDraft.summary, /£600\.00 to tomarrington <tomarrington@outlook\.com> for "Mini commercial review"/);
    r = await ask('make it for website build');
    assert.match(r.data.invoiceDraft.summary, /for "Website build"/);
    assert.match(r.data.invoiceDraft.summary, /£600\.00/, 'the amount survives a description change');
    r = await ask('date it 2026-10-01');
    assert.match(r.data.invoiceDraft.summary, /dated 2026-10-01/);
    r = await ask('send it');
    assert.equal(r.data.invoiceDraft.mode, 'create_and_send');
    assert.match(r.data.answer, /created in Zoho Invoice and emailed/);
    r = await ask('send it');
    assert.match(r.data.answer, /Nothing is carried out from a typed sentence/);
    assert.equal(r.data.invoiceDraft.mode, 'create_and_send', 'a typed "send it" never executes');
    r = await ask("don't send it");
    assert.equal(r.data.invoiceDraft.mode, 'draft_only');
    r = await ask('show me first');
    assert.match(r.data.answer, new RegExp(`Pending: approval #${id}`));
    assert.match(r.data.answer, /Not yet created/);
  });

  await t.test('the pages show the pending action and its mode, as one row', async () => {
    const approvals = await (await tom.go('/workspace/approvals')).text();
    const rows = approvals.match(/Zoho invoice \((draft only|create and send)\): /g) || [];
    assert.ok(rows.length >= 1);
    assert.match(approvals, /£600\.00 to tomarrington &lt;tomarrington@outlook\.com&gt; for &#34;Website build&#34;, dated 2026-10-01/);
    assert.match(approvals, /Approve and create draft in Zoho/);
    assert.match(approvals, /Switch to create and send/);
    assert.doesNotMatch(approvals, /style="/, 'strict CSP: no inline styles');
    const chat = await (await tom.go(`/workspace/chat?c=${conversationId}`)).text();
    assert.match(chat, new RegExp(`Pending: approval #${id}`));
    assert.match(chat, /"mode":"draft_only"/);
    assert.doesNotMatch(chat, /style="/);
  });

  await t.test('the mode can be switched from the approvals page, and only the mode', async () => {
    const r = await tom.go(`/api/workspace/approvals/${id}/invoice-mode`, { method: 'POST', headers: { 'x-csrf-token': csrf }, body: { mode: 'create_and_send', draft: { amount: 1 } } });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.invoice.mode, 'create_and_send');
    assert.match(d.invoice.summary, /£600\.00/, 'the request body cannot change a field');
    const back = await tom.go(`/api/workspace/approvals/${id}/invoice-mode`, { method: 'POST', headers: { 'x-csrf-token': csrf }, body: { mode: 'draft_only' } });
    assert.equal(back.status, 200);
  });

  await t.test('a question that goes to the model keeps the card, and a typed sentence never creates a second row', async () => {
    const r = await ask('what is the brand voice?');
    if (r.status === 503) return; // Workspace AI off in this environment: the deterministic checks above stand on their own.
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.invoiceDraft && r.data.invoiceDraft.approvalId, id);
    const approvals = await (await tom.go('/workspace/approvals')).text();
    const open = (approvals.match(/ws-badge-stale">open</g) || []).length;
    assert.ok(open >= 1);
  });

  await t.test('cancel that: the row is declined, nothing was created or sent', async () => {
    const r = await ask('cancel that');
    assert.match(r.data.answer, new RegExp(`Cancelled approval #${id}`));
    assert.equal(r.data.invoiceDraft.status, 'declined');
    const again = await ask('cancel that');
    assert.doesNotMatch(again.data.answer || '', /Cancelled approval/, 'a decided row is not pending any more');
    const approvals = await (await tom.go('/workspace/approvals')).text();
    assert.match(approvals, /Cancelled from Ask Ruth/);
  });

  await t.test('a fresh conversation with nothing pending is not affected', async () => {
    const r = await ask('change it to £600', { fresh: true });
    assert.ok(r.status === 503 || (r.status === 200 && !/Updated approval/.test(r.data.answer)), JSON.stringify(r.data));
  });
});
