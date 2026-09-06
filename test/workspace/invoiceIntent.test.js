// The deterministic reading of "send an invoice ..." in Ask Ruth.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const intent = require('../../lib/workspace/finance/invoiceIntent');
const TODAY = new Date('2026-09-06T09:00:00Z');

test("Tom's exact sentence parses completely, typo and all", () => {
  const r = intent.parse('send an invoice to tomarrington@outlook.com £500 for mini cemercial review as of today', { today: TODAY });
  assert.equal(r.matched, true);
  assert.equal(r.complete, true, JSON.stringify(r.missing));
  assert.equal(r.draft.customerEmail, 'tomarrington@outlook.com');
  assert.equal(r.draft.customerName, 'tomarrington');
  assert.equal(r.draft.amount, 500);
  assert.equal(r.draft.description, 'Mini cemercial review');
  assert.equal(r.draft.date, '2026-09-06');
  assert.equal(r.draft.dateSource, 'today');
  assert.match(intent.describe(r.draft), /£500\.00 to tomarrington <tomarrington@outlook\.com> for "Mini cemercial review", dated 2026-09-06/);
});

test('a name before the address is used as the customer; pence and other amount spellings are read', () => {
  const r = intent.parse('Raise an invoice to Acme Ltd acme@example.com for website build, 999.50 pounds, dated 2026-10-01', { today: TODAY });
  assert.equal(r.complete, true, JSON.stringify(r.missing));
  assert.equal(r.draft.customerName, 'Acme Ltd');
  assert.equal(r.draft.amount, 999.5);
  assert.equal(r.draft.description, 'Website build');
  assert.equal(r.draft.date, '2026-10-01');
});

test('a thousands separator is read as thousands, and a decimal comma as pence', () => {
  assert.equal(intent.parse('send an invoice to a@b.co £1,250 for x', { today: TODAY }).draft.amount, 1250);
  assert.equal(intent.parse('send an invoice to a@b.co £12,500.50 for x', { today: TODAY }).draft.amount, 12500.5);
  assert.equal(intent.parse('send an invoice to a@b.co £9,99 for x', { today: TODAY }).draft.amount, 9.99);
});

test('an ordinary question is not an invoice request', () => {
  for (const q of ['where are we losing money?', 'show me last month', 'what invoices are overdue?']) {
    assert.equal(intent.parse(q, { today: TODAY }).matched, false, q);
  }
});

test('missing pieces are named, and nothing is guessed', () => {
  const r1 = intent.parse('send an invoice to bob@example.com for a review', { today: TODAY });
  assert.equal(r1.matched, true); assert.equal(r1.complete, false);
  assert.deepEqual(r1.missing, ['the amount (for example £500)']);
  const r2 = intent.parse('send an invoice for £50', { today: TODAY });
  assert.equal(r2.complete, false);
  assert.ok(r2.missing.some((m) => /email/.test(m)));
  assert.ok(r2.missing.some((m) => /what it is for/.test(m)));
  const r3 = intent.parse('send an invoice to x@y.co £0 for nothing', { today: TODAY });
  assert.equal(r3.complete, false);
});

test('dates: today by default, tomorrow, ISO and UK forms', () => {
  assert.equal(intent.parse('send an invoice to a@b.co £1 for x', { today: TODAY }).draft.date, '2026-09-06');
  assert.equal(intent.parse('send an invoice to a@b.co £1 for x as of tomorrow', { today: TODAY }).draft.date, '2026-09-07');
  assert.equal(intent.parse('send an invoice to a@b.co £1 for x dated 2026-12-01', { today: TODAY }).draft.date, '2026-12-01');
  assert.equal(intent.parse('send an invoice to a@b.co £1 for x on 15/10/2026', { today: TODAY }).draft.date, '2026-10-15');
});

test('the module is pure and shares nothing with Scott', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'finance', 'invoiceIntent.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /require\(/);
  assert.doesNotMatch(src, /process\.env|fetch\(/);
  assert.doesNotMatch(src, /scott/i);
});
