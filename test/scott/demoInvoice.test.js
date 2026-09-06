// The one demonstration invoice: isolation and the blocked action, pinned.
//
// Tom's instruction (06/09/2026): a realistic DEMO invoice inside the Scott
// application only, never written to Arrington's Zoho, accounting records,
// a real customer, a real email address or a payment system, with SEND /
// ISSUE permanently disabled and labelled DEMO ONLY - NOT A REAL INVOICE.
// Every one of those clauses is asserted here against the real module,
// the real view and the real route file, not against a description.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const demo = require('../../lib/scott/finance/demoInvoice');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('the module is pure: it imports nothing and names no workspace, Zoho, mail, network or Arrington symbol', () => {
  // Code only: the header comment explains what the module must not do,
  // and naming the forbidden things there is the point of the comment.
  const src = read('lib/scott/finance/demoInvoice.js').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /require\(/, 'no imports at all');
  assert.doesNotMatch(src, /process\.env/, 'reads no configuration');
  assert.doesNotMatch(src, /fetch\(|nodemailer|smtp|https?:\/\//i, 'no network or mail path');
  assert.doesNotMatch(src, /workspace|zoho|arrington/i, 'no reference to the real business or its connectors');
  assert.doesNotMatch(src, /@[a-z0-9.-]+\.[a-z]{2,}/i, 'no email address anywhere in the record');
});

test('the invoice is complete and its arithmetic is right: lines, VAT at 20%, totals, balance, dates, status', () => {
  const inv = demo.build();
  assert.equal(inv.ref, 'SAKS-DEMO-0001');
  assert.equal(inv.status, 'demo');
  assert.equal(inv.demoLabel, 'DEMO ONLY - NOT A REAL INVOICE');
  assert.equal(inv.sendBlocked, true);
  assert.ok(inv.lines.length >= 2, 'more than one line item');
  const net = inv.lines.reduce((s, l) => s + l.quantity * l.unitNetPence, 0);
  assert.equal(inv.netPence, net);
  assert.equal(inv.vatPence, Math.round(net * 0.2));
  assert.equal(inv.grossPence, inv.netPence + inv.vatPence);
  assert.equal(inv.balanceDuePence, inv.grossPence);
  assert.equal(inv.vatRatePercent, 20);
  assert.ok(inv.dueDate > inv.issueDate, 'due after issue');
  assert.match(inv.company.tradingName, /Scott's Armchair/);
  assert.match(inv.company.legalName, /SCOTT'S ARMCHAIR & KNITTING SERVICE LTD/);
  assert.equal(inv.company.addressLines.at(-1), 'TQ12 4SA');
  assert.equal(inv.format(inv.grossPence), '£' + (inv.grossPence / 100).toFixed(2));
});

test('the record is frozen: nothing can mutate the demo invoice at runtime', () => {
  assert.equal(Object.isFrozen(demo.DEMO_INVOICE), true);
  assert.equal(Object.isFrozen(demo.DEMO_INVOICE.lines), true);
  assert.equal(Object.isFrozen(demo.DEMO_INVOICE.company), true);
  assert.throws(() => { 'use strict'; demo.DEMO_INVOICE.status = 'sent'; }, TypeError);
  const a = demo.build(); const b = demo.build();
  assert.deepEqual({ ...a, format: undefined }, { ...b, format: undefined }, 'identical on every build');
});

test('SEND / ISSUE is refused by construction: the send function throws for every input and no route can send it', () => {
  for (const arg of [undefined, null, {}, { force: true }, { to: 'anyone@example.com' }, 'SAKS-DEMO-0001']) {
    assert.throws(() => demo.sendDemoInvoice(arg), demo.DemoInvoiceSendRefused, JSON.stringify(arg));
  }
  const routes = read('routes/scott.js');
  assert.match(routes, /app\.get\('\/scott\/finance\/invoice\/demo'/, 'the document has a GET');
  assert.doesNotMatch(routes, /router\.(post|put|patch|delete)\([^\n]*invoice\/demo/, 'no write method for the demo invoice');
  assert.doesNotMatch(routes, /sendDemoInvoice/, 'the refusing function is not even wired to a route');
});

test('the rendered document carries the label, a disabled send control, no form, and no inline style', () => {
  const view = read('views/scott/finance-invoice-demo.ejs');
  assert.match(view, /invoice\.demoLabel/, 'the label is rendered from the module, not retyped');
  assert.match(view, /<button[\s\S]*?\bdisabled\b[\s\S]*?>Send \/ issue invoice<\/button>/, 'the send control is disabled in markup');
  assert.doesNotMatch(view, /<button(?![\s\S]*?\bdisabled\b)[\s\S]*?>Send/, 'no enabled send control exists');
  assert.doesNotMatch(view, /<form/i, 'nothing on the page submits anything');
  assert.doesNotMatch(view, /fetch\(|XMLHttpRequest/, 'no script reaches a server');
  assert.doesNotMatch(view, /style="/, 'strict CSP: no inline style attributes');
  assert.doesNotMatch(view, /—/, 'no em dashes');
  const sales = read('views/scott/finance.ejs');
  assert.match(sales, /\/scott\/finance\/invoice\/demo/, 'linked from the Sales ledger');
  assert.match(sales, /DEMO ONLY - NOT A REAL INVOICE/);
});

test('the demo invoice is not a ledger document: it never reaches scott_fin_documents or a journal', () => {
  const repoSrc = read('lib/scott/finance/repository.js');
  const seedSrc = read('lib/scott/finance/seedLedger.js');
  const dbSeed = read('db/seed.js');
  for (const [name, src] of [['repository', repoSrc], ['seedLedger', seedSrc], ['db/seed', dbSeed]]) {
    assert.doesNotMatch(src, /SAKS-DEMO|demoInvoice/, `${name} does not know the demo invoice`);
  }
});
