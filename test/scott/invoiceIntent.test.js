// Scott's deterministic "send an invoice" reading, and the approval
// round trip that keeps Nigel from posting anything himself.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const intent = require('../../lib/scott/finance/invoiceIntent');
const TODAY = new Date('2026-08-31T09:00:00Z');

test('a complete sentence yields a draft: customer, net amount, job, date', () => {
  const r = intent.parse('Send an invoice to Moorland Holiday Lets £850 for two wingback chairs re-upholstered', { today: TODAY });
  assert.equal(r.matched, true);
  assert.equal(r.complete, true, JSON.stringify(r.missing));
  assert.equal(r.draft.customer, 'Moorland Holiday Lets');
  assert.equal(r.draft.netPounds, 850);
  assert.equal(r.draft.description, 'Two wingback chairs re-upholstered');
  assert.equal(r.draft.date, '2026-08-31');
});

test('"send an invoice for me" is an invoice request with everything missing, so the AI turn handles it', () => {
  const r = intent.parse('Send an invoice for me', { today: TODAY });
  assert.equal(r.matched, true);
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, ['the customer', 'the amount before VAT', 'what the invoice is for']);
});

test('ordinary finance questions are not invoice requests', () => {
  for (const q of ['what is the debtor book?', 'which invoices are overdue', 'raise the VAT question with Nigel']) {
    assert.equal(intent.parse(q, { today: TODAY }).matched, false, q);
  }
});

test('encode writes a human line plus one machine line, and decode reads back exactly what was approved', () => {
  const draft = { customer: 'Devon Hearth Cafe Group', netPounds: 1250.5, description: 'Six chairs, arm covers', date: '2026-08-31' };
  const summary = intent.encode(draft, { sourceRef: 'conversation:42' });
  const [human, machine] = summary.split('\n');
  assert.match(human, /Raise sales invoice to Devon Hearth Cafe Group for £1250\.50 before VAT/);
  assert.match(human, /nothing is posted until a person issues it/);
  assert.ok(machine.startsWith(intent.MARKER + '|'));
  const back = intent.decode(summary);
  assert.deepEqual(back, { customer: 'Devon Hearth Cafe Group', description: 'Six chairs, arm covers', netPounds: 1250.5, date: '2026-08-31', sourceRef: 'conversation:42' });
});

test('decode refuses a summary with no machine line, or a tampered one', () => {
  assert.equal(intent.decode('Just some text a person typed'), null);
  assert.equal(intent.decode(`${intent.MARKER}|customer=X|net=-5|description=Y|date=2026-08-31`), null);
  assert.equal(intent.decode(`${intent.MARKER}|customer=X|net=5|description=Y|date=soon`), null);
  assert.equal(intent.decode(`${intent.MARKER}|customer=|net=5|description=Y|date=2026-08-31`), null);
});

test('the module is pure and shares nothing with the real workspace', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'scott', 'finance', 'invoiceIntent.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /require\(/);
  assert.doesNotMatch(src, /process\.env|fetch\(/);
  assert.doesNotMatch(src, /workspace|zoho|arrington/i);
});

test('the chat route drafts under Nigel and the decide route needs invoice_create; no route posts without a decision', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'scott.js'), 'utf8');
  assert.match(routes, /intentType: 'invoice_raise'/);
  assert.match(routes, /proposingWorkerId: 'finance_accounts'/);
  assert.match(routes, /invoice_raise: 'invoice_create'/);
  // The ledger posting for a chat draft happens only inside the decide handler.
  const decideIdx = routes.indexOf("router.post('/api/scott/approvals/:id/decide'");
  const postIdx = routes.indexOf("invoiceIntent.decode(existing.summary)");
  assert.ok(decideIdx > 0 && postIdx > decideIdx, 'decode-and-post lives in the decide route');
  assert.doesNotMatch(routes.slice(0, decideIdx), /invoiceIntent\.decode/, 'nothing before the decide route posts a draft');
});
