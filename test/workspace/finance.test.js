// Read-only business banking, added 01/09/2026, reworked ANNA-first the
// same day on Tom's instruction: he does not use Xero, so it must never
// be required or nagged about. The two properties that matter most: no
// code path anywhere in this area can move money, and a credential (or
// an upload) is never presented as a successful retrieval unless it
// genuinely was one. Same shape as test/workspace/social.test.js, which
// proved the pattern first.
const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../../lib/workspace/finance/registry');
const actions = require('../../lib/workspace/finance/actions');
const financeRepo = require('../../lib/workspace/finance/repo');
const orchestrator = require('../../lib/workspace/orchestrator');
const tokenCrypto = require('../../lib/workspace/finance/tokenCrypto');
const accounting = require('../../lib/workspace/finance/accounting');
const csvParser = require('../../lib/workspace/finance/annaStatementCsv');
const recurring = require('../../lib/workspace/finance/recurring');

test('three providers exist: anna_statement_csv (primary), xero and zoho_invoice (both optional)', () => {
  assert.deepEqual(registry.PROVIDER_IDS, ['anna_statement_csv', 'xero', 'zoho_invoice']);
  assert.equal(registry.PRIMARY_PROVIDER_ID, 'anna_statement_csv');
  assert.equal(registry.PROVIDERS.anna_statement_csv.primary, true);
  assert.equal(registry.PROVIDERS.xero.primary, false);
  assert.equal(registry.PROVIDERS.zoho_invoice.primary, false);
});

test('Zoho Invoice is configured only when all three env vars are set, and contributes no balance or transactions', () => {
  assert.equal(registry.isConfigured('zoho_invoice', {}), false);
  assert.equal(registry.isConfigured('zoho_invoice', { ZOHO_INVOICE_CLIENT_ID: 'a', ZOHO_INVOICE_CLIENT_SECRET: 'b' }), false,
    'without the refresh token nothing can be read, so it is not configured');
  assert.equal(registry.isConfigured('zoho_invoice', { ZOHO_INVOICE_CLIENT_ID: 'a', ZOHO_INVOICE_CLIENT_SECRET: 'b', ZOHO_INVOICE_REFRESH_TOKEN: 'c' }), true);
  const s = registry.PROVIDERS.zoho_invoice.supports;
  assert.equal(s.balance, false);
  assert.equal(s.transactions, false);
  assert.equal(s.invoices, true);
});

test('the primary route needs no credential and is always configured', () => {
  assert.equal(registry.PROVIDERS.anna_statement_csv.credentialEnv.length, 0);
  assert.equal(registry.isConfigured('anna_statement_csv', {}), true);
  assert.equal(registry.isConfigured('anna_statement_csv', { anything: 'irrelevant' }), true);
});

test('no code path in either connector can initiate a payment, transfer, beneficiary or card action', () => {
  const forbidden = ['payment_initiation', 'transfer', 'beneficiary_creation', 'card_control', 'change_account_settings'];
  registry.PROVIDER_IDS.forEach((provider) => {
    forbidden.forEach((a) => {
      assert.equal(registry.connectorMayDo(provider, a), false, `${provider} must not be able to ${a}`);
      assert.throws(() => actions.assertReadOnlyAllowed(provider, a), actions.MoneyMovementError, `${provider}/${a} must throw, not just return false`);
    });
  });
});

test('read and analyse are permitted on both connectors, so the useful work is still possible', () => {
  registry.PROVIDER_IDS.forEach((provider) => {
    ['read', 'analyse'].forEach((a) => {
      assert.equal(registry.connectorMayDo(provider, a), true);
      assert.equal(actions.assertReadOnlyAllowed(provider, a), true);
    });
  });
});

test('there is no requestHumanAction or equivalent approval-queue path for money movement', () => {
  // Unlike social/actions.js, this module must have no function that
  // prepares a consequential action for later human execution: doing so
  // would mean the system knows how to construct a payment instruction.
  const surface = Object.keys(actions);
  assert.deepEqual(surface, ['MoneyMovementError', 'isMoneyMovement', 'assertReadOnlyAllowed']);
});

test('the finance module exposes no function that performs or prepares a money-moving action', () => {
  const surface = [...Object.keys(registry), ...Object.keys(actions), ...Object.keys(financeRepo)];
  const performing = surface.filter((k) => /^(pay|transfer|send|withdraw|debit|credit|create.*beneficiary|freeze|block.*card)/i.test(k));
  assert.deepEqual(performing, [], `these look like they move money: ${performing.join(', ')}`);
});

test('no scope declared by any connector grants more than reading', () => {
  // Zoho's scopes end in an explicit .READ / .CREATE / .UPDATE / .DELETE
  // verb, so for Zoho the verb is the test. Xero's are named by object,
  // where 'payments' and 'bank-feeds' are write-capable and must not appear.
  registry.PROVIDER_IDS.forEach((p) => {
    registry.PROVIDERS[p].readScopes.forEach((scope) => {
      if (/^ZohoInvoice\./.test(scope)) {
        assert.match(scope, /\.READ$/, `${p} declares ${scope}, which is not a read scope`);
        return;
      }
      assert.doesNotMatch(scope, /\.write\b|payments|bank-feeds/i,
        `${p} declares ${scope}, which grants more than reading`);
    });
  });
});

test('Zoho write scopes are CREATE only, flag-gated, and no other provider declares any write scope', () => {
  registry.PROVIDER_IDS.forEach((p) => {
    const ws = registry.PROVIDERS[p].writeScopes || [];
    if (p !== 'zoho_invoice') assert.deepEqual(ws, [], `${p} must declare no write scope`);
  });
  const z = registry.PROVIDERS.zoho_invoice;
  assert.deepEqual(z.writeScopes, ['ZohoInvoice.contacts.CREATE', 'ZohoInvoice.invoices.CREATE']);
  z.writeScopes.forEach((s) => assert.doesNotMatch(s, /UPDATE|DELETE|fullaccess/i));
  assert.equal(z.writesFlag, 'ENABLE_ZOHO_INVOICE_WRITES');
  // An invoice asks for money; it moves none. The never-built list is untouched.
  ['payment_initiation', 'transfer', 'beneficiary_creation', 'card_control', 'change_account_settings']
    .forEach((a) => assert.equal(registry.connectorMayDo('zoho_invoice', a), false));
});

test('Xero remains an unconfigured connector until both env vars are set; ANNA CSV is unaffected by env', () => {
  assert.equal(registry.isConfigured('xero', {}), false);
  assert.equal(registry.isConfigured('xero', { XERO_CLIENT_ID: 'abc' }), false, 'a partial credential is not a credential');
  assert.equal(registry.isConfigured('xero', { XERO_CLIENT_ID: 'abc', XERO_CLIENT_SECRET: 'def' }), true);
  assert.equal(registry.isConfigured('xero', { XERO_CLIENT_ID: 'abc', XERO_CLIENT_SECRET: '   ' }), false);
  assert.equal(registry.isConfigured('anna_statement_csv', {}), true);
});

test('a credential is never presented as a successful retrieval', () => {
  const now = new Date('2026-09-01T12:00:00Z');
  assert.equal(financeRepo.connectorFreshness(null, true, now).state, 'never_retrieved');
  assert.equal(financeRepo.connectorFreshness({ last_sync_outcome: 'never', last_sync_at: null }, true, now).state, 'never_retrieved');
  const failed = { last_sync_outcome: 'failed', last_sync_at: new Date(now - 3600000), stale_after_hours: 24 };
  assert.equal(financeRepo.connectorFreshness(failed, true, now).state, 'sync_failed');
  assert.equal(financeRepo.connectorFreshness(null, false, now).state, 'not_connected');
  const ok = { last_sync_outcome: 'ok', last_sync_at: new Date(now - 3600000), stale_after_hours: 24 };
  assert.equal(financeRepo.connectorFreshness(ok, true, now).state, 'fresh');
  const old = { last_sync_outcome: 'ok', last_sync_at: new Date(now - 48 * 3600000), stale_after_hours: 24 };
  assert.equal(financeRepo.connectorFreshness(old, true, now).state, 'stale');
});

test('formatPence renders pounds honestly, including unknown and negative', () => {
  assert.equal(financeRepo.formatPence(null), 'unknown');
  assert.equal(financeRepo.formatPence(undefined), 'unknown');
  assert.equal(financeRepo.formatPence(150000), '£1500.00');
  assert.equal(financeRepo.formatPence(-500), '-£5.00');
  assert.equal(financeRepo.formatPence(0), '£0.00');
});

// --- headlineAccountState (pure) ----------------------------------------

test('headlineAccountState picks the freshest real balance among active providers', () => {
  const older = { provider: 'xero', status: 'configured', lastSyncOutcome: 'ok', currentBalancePence: 1000, balanceAsOf: '2026-01-01' };
  const newer = { provider: 'anna_statement_csv', status: 'configured', lastSyncOutcome: 'ok', currentBalancePence: 2000, balanceAsOf: '2026-06-01' };
  assert.equal(financeRepo.headlineAccountState([older, newer]).provider, 'anna_statement_csv');
  assert.equal(financeRepo.headlineAccountState([newer, older]).provider, 'anna_statement_csv');
});

test('headlineAccountState returns null when nothing has ever synced or been imported', () => {
  const neverConfigured = { provider: 'xero', status: 'not_configured', lastSyncOutcome: 'never', currentBalancePence: null };
  const neverImported = { provider: 'anna_statement_csv', status: 'configured', lastSyncOutcome: 'never', currentBalancePence: null };
  assert.equal(financeRepo.headlineAccountState([neverConfigured, neverImported]), null);
});

test('headlineAccountState falls back to a configured provider with no balance yet, rather than null', () => {
  const active = { provider: 'anna_statement_csv', status: 'configured', lastSyncOutcome: 'partial', currentBalancePence: null };
  assert.equal(financeRepo.headlineAccountState([active]).provider, 'anna_statement_csv');
});

// --- Lane / clearance wiring ------------------------------------------

test("'finance' is a real source class, granted to NO lane by default (least privilege)", () => {
  const lanes = require('../../lib/workspace/lanes');
  assert.ok(lanes.SOURCE_CLASSES.finance, 'finance must be a declared source class');
  const grantedTo = lanes.LANES.filter((l) => l.sourceClasses.includes('finance')).map((l) => l.id);
  // Only governance_assurance reads every source class by its own remit
  // (independent assurance needs sight of everything it audits). No
  // other canonical worker's approved remit currently includes finance,
  // so no other lane may read it: widening that is a worker-permission
  // change and belongs to Tom plus the governed route, not a code tidy.
  assert.deepEqual(grantedTo, ['governance_assurance']);
});

test('finance records are confidential, the narrowest sensitivity, so only owner_admin can ever see them', () => {
  const { clearanceCanSeeSensitivity } = require('../../lib/workspace/clearance');
  assert.equal(clearanceCanSeeSensitivity('owner_admin', 'confidential'), true);
  assert.equal(clearanceCanSeeSensitivity('ws_restricted', 'confidential'), false);
});

test('buildLaneContext surfaces finance to a general question only when the clearance covers confidential', async () => {
  const repo = require('../../lib/workspace/repo');
  const orig = repo.listRecords;
  repo.listRecords = async () => [
    { record_key: 'finance.summary', source_class: 'finance', sensitivity: 'confidential', doc_status: 'current' },
    { record_key: 'authority.constitution', source_class: 'authority', sensitivity: 'standard', doc_status: 'current' }
  ];
  try {
    const owner = await orchestrator.buildLaneContext({ clearanceId: 'owner_admin', laneId: null });
    assert.ok(owner.some((r) => r.record_key === 'finance.summary'), 'owner_admin should see the finance record on a general question');

    const restricted = await orchestrator.buildLaneContext({ clearanceId: 'ws_restricted', laneId: null });
    assert.ok(!restricted.some((r) => r.record_key === 'finance.summary'), 'ws_restricted must never see a confidential finance record');

    // A lane other than governance_assurance must not see it either, even
    // for the owner: task necessity is a permission leg, not a nicety.
    const websiteLane = await orchestrator.buildLaneContext({ clearanceId: 'owner_admin', laneId: 'website_hosting' });
    assert.ok(!websiteLane.some((r) => r.record_key === 'finance.summary'), 'an unrelated lane must not surface finance data');

    const governanceLane = await orchestrator.buildLaneContext({ clearanceId: 'owner_admin', laneId: 'governance_assurance' });
    assert.ok(governanceLane.some((r) => r.record_key === 'finance.summary'), 'governance_assurance reads every source class by its own remit');
  } finally {
    repo.listRecords = orig;
  }
});

// --- Token encryption (Xero only; the primary route has no token) -------

test('a token round-trips through encryption and cannot be read without the key', () => {
  const key = require('node:crypto').randomBytes(32).toString('hex');
  const plaintext = 'a-fake-refresh-token-value';
  const enc = tokenCrypto.encryptToken(plaintext, tokenCrypto.keyFromEnv(key));
  assert.notEqual(enc, plaintext);
  assert.equal(tokenCrypto.decryptToken(enc, tokenCrypto.keyFromEnv(key)), plaintext);
  const otherKey = require('node:crypto').randomBytes(32).toString('hex');
  assert.throws(() => tokenCrypto.decryptToken(enc, tokenCrypto.keyFromEnv(otherKey)));
});

test('encryption refuses to run without a configured key, rather than falling back to plaintext', () => {
  assert.throws(() => tokenCrypto.encryptToken('x', null), /WORKSPACE_FINANCE_TOKEN_KEY/);
});

test('a malformed key is treated as absent, not coerced', () => {
  assert.equal(tokenCrypto.keyFromEnv('not-64-hex-chars'), null);
  assert.equal(tokenCrypto.keyFromEnv(''), null);
  assert.equal(tokenCrypto.keyFromEnv(undefined), null);
});

// --- ANNA statement CSV parser (01/09/2026) ------------------------------
//
// This is the primary route now, so it is held to the same "never
// invent, never crash on bad input" discipline as everything else here.

test('parses a signed-amount CSV with a balance column, in date order regardless of input order', () => {
  const csv = [
    'Date,Description,Amount,Reference,Category,Balance',
    '03/07/2026,Google Ads,-120.00,AUG,Marketing,1880.00',
    '01/07/2026,World Student Advisors,1500.00,INV-100,Sales,2000.00'
  ].join('\n');
  const r = csvParser.parseStatementCsv(csv);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.transactions.length, 2);
  assert.equal(r.transactions[0].date, '2026-07-01');
  assert.equal(r.transactions[0].direction, 'in');
  assert.equal(r.transactions[0].amountPence, 150000);
  assert.equal(r.transactions[1].direction, 'out');
  assert.equal(r.transactions[1].amountPence, 12000);
  assert.equal(r.closingBalancePence, 188000);
  assert.equal(r.closingBalanceDate, '2026-07-03');
});

test('parses split Money In / Money Out columns', () => {
  const csv = [
    'Date,Description,Money in,Money out,Reference',
    '2026-07-01,Client payment,250.50,,INV-1',
    '2026-07-02,Software bill,,19.99,SUB'
  ].join('\n');
  const r = csvParser.parseStatementCsv(csv);
  assert.equal(r.transactions.length, 2);
  assert.equal(r.transactions[0].direction, 'in');
  assert.equal(r.transactions[0].amountPence, 25050);
  assert.equal(r.transactions[1].direction, 'out');
  assert.equal(r.transactions[1].amountPence, 1999);
});

test('quoted fields with embedded commas and escaped quotes parse correctly', () => {
  const csv = 'Date,Description,Amount\n01/07/2026,"Smith, Jones and ""Co""",-10.50';
  const r = csvParser.parseStatementCsv(csv);
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].payee, 'Smith, Jones and "Co"');
  assert.equal(r.transactions[0].amountPence, 1050);
});

test('an empty file produces no transactions and an honest warning, never a crash', () => {
  const r = csvParser.parseStatementCsv('');
  assert.deepEqual(r.transactions, []);
  assert.match(r.warnings[0], /empty/i);
});

test('a header with no recognisable date column is refused with a specific warning', () => {
  const r = csvParser.parseStatementCsv('Foo,Bar\n1,2');
  assert.deepEqual(r.transactions, []);
  assert.match(r.warnings[0], /date column/i);
});

test('a header with no recognisable amount column is refused with a specific warning', () => {
  const r = csvParser.parseStatementCsv('Date,Description\n01/07/2026,test');
  assert.deepEqual(r.transactions, []);
  assert.match(r.warnings[0], /amount column/i);
});

test('a row with an unparseable date or amount is skipped with a warning, not the whole file', () => {
  const csv = [
    'Date,Description,Amount',
    'not-a-date,Bad row,10.00',
    '01/07/2026,Good row,20.00',
    '02/07/2026,Bad amount,not-a-number'
  ].join('\n');
  const r = csvParser.parseStatementCsv(csv);
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].payee, 'Good row');
  assert.equal(r.warnings.length, 2);
});

test('re-parsing the same row twice produces the same external id, so a re-upload dedupes', () => {
  const csv = 'Date,Description,Amount,Reference\n01/07/2026,Railway,-49.99,hosting';
  const a = csvParser.parseStatementCsv(csv).transactions[0].externalId;
  const b = csvParser.parseStatementCsv(csv).transactions[0].externalId;
  assert.equal(a, b);
  // A different reference is a different transaction and must not collide.
  const c = csvParser.parseStatementCsv('Date,Description,Amount,Reference\n01/07/2026,Railway,-49.99,other-ref').transactions[0].externalId;
  assert.notEqual(a, c);
});

test('YYYY-MM-DD and DD/MM/YYYY dates both parse to the same ISO form', () => {
  assert.equal(csvParser.parseDate('2026-07-01'), '2026-07-01');
  assert.equal(csvParser.parseDate('1/7/2026'), '2026-07-01');
  assert.equal(csvParser.parseDate('01/07/2026'), '2026-07-01');
  assert.equal(csvParser.parseDate('not a date'), null);
});

test('amounts with currency symbols and thousands separators parse correctly', () => {
  assert.equal(csvParser.parseAmountToPence('£1,234.56'), 123456);
  assert.equal(csvParser.parseAmountToPence('-1,234.56'), -123456);
  assert.equal(csvParser.parseAmountToPence(''), null);
  assert.equal(csvParser.parseAmountToPence('not a number'), null);
});

// --- Estimated recurring costs (01/09/2026) ------------------------------

test('a payee repeating monthly at a consistent amount, at least 3 times, is detected as recurring', () => {
  const txns = [
    { external_id: '1', date: '2026-06-05', amount_pence: 4999, direction: 'out', payee: 'Railway' },
    { external_id: '2', date: '2026-07-05', amount_pence: 4999, direction: 'out', payee: 'Railway' },
    { external_id: '3', date: '2026-08-05', amount_pence: 4999, direction: 'out', payee: 'Railway' }
  ];
  const groups = recurring.detectRecurringGroups(txns);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].payee, 'railway');
  assert.equal(groups[0].cadence, 'monthly');
  assert.equal(groups[0].occurrences, 3);
  assert.equal(groups[0].estimatedNextDate, '2026-09-04');
});

test('two occurrences are not enough to call something recurring', () => {
  const txns = [
    { external_id: '1', date: '2026-06-05', amount_pence: 4999, direction: 'out', payee: 'Railway' },
    { external_id: '2', date: '2026-07-05', amount_pence: 4999, direction: 'out', payee: 'Railway' }
  ];
  assert.deepEqual(recurring.detectRecurringGroups(txns), []);
});

test('a wildly inconsistent amount is not called recurring even at a monthly cadence', () => {
  const txns = [
    { external_id: '1', date: '2026-06-05', amount_pence: 1000, direction: 'out', payee: 'Variable Co' },
    { external_id: '2', date: '2026-07-05', amount_pence: 9000, direction: 'out', payee: 'Variable Co' },
    { external_id: '3', date: '2026-08-05', amount_pence: 2000, direction: 'out', payee: 'Variable Co' }
  ];
  assert.deepEqual(recurring.detectRecurringGroups(txns), []);
});

test('irregular gaps (not weekly, monthly, quarterly or annual) are not called recurring', () => {
  const txns = [
    { external_id: '1', date: '2026-01-01', amount_pence: 5000, direction: 'out', payee: 'Occasional Co' },
    { external_id: '2', date: '2026-01-15', amount_pence: 5000, direction: 'out', payee: 'Occasional Co' },
    { external_id: '3', date: '2026-06-01', amount_pence: 5000, direction: 'out', payee: 'Occasional Co' }
  ];
  assert.deepEqual(recurring.detectRecurringGroups(txns), []);
});

test('incoming transactions are never marked recurring (only outgoing costs are considered)', () => {
  const txns = [
    { external_id: '1', date: '2026-06-05', amount_pence: 5000, direction: 'in', payee: 'Regular Client' },
    { external_id: '2', date: '2026-07-05', amount_pence: 5000, direction: 'in', payee: 'Regular Client' },
    { external_id: '3', date: '2026-08-05', amount_pence: 5000, direction: 'in', payee: 'Regular Client' }
  ];
  assert.deepEqual(recurring.detectRecurringGroups(txns), []);
});

// Regression test for a real bug found in end-to-end testing: the
// per-transaction is_recurring flag (computed at import time from the
// CSV parser's camelCase shape) was correct, but the Finance page's
// separate "Estimated recurring costs" card recomputed groups from raw
// Postgres rows (snake_case txn_date, a Date object, not a `date`
// string field) and silently found nothing, because the date lookup
// only ever read `t.date`. This pins both shapes working identically.
test('detectRecurringGroups works on raw database row shape (txn_date as a Date object), not just the parser shape', () => {
  const dbRows = [
    { external_id: 'a', txn_date: new Date('2026-03-05T00:00:00.000Z'), amount_pence: 4999, direction: 'out', payee: 'Railway' },
    { external_id: 'b', txn_date: new Date('2026-04-05T00:00:00.000Z'), amount_pence: 4999, direction: 'out', payee: 'Railway' },
    { external_id: 'c', txn_date: new Date('2026-05-05T00:00:00.000Z'), amount_pence: 4999, direction: 'out', payee: 'Railway' }
  ];
  const groups = recurring.detectRecurringGroups(dbRows);
  assert.equal(groups.length, 1, 'must detect the pattern from raw DB-shaped rows, not just parser-shaped ones');
  assert.equal(groups[0].payee, 'railway');
  assert.equal(groups[0].occurrences, 3);
});

test('annotateRecurring marks every transaction in a detected group and never mutates the input', () => {
  const txns = [
    { externalId: '1', date: '2026-06-05', amountPence: 4999, direction: 'out', payee: 'Railway' },
    { externalId: '2', date: '2026-07-05', amountPence: 4999, direction: 'out', payee: 'Railway' },
    { externalId: '3', date: '2026-08-05', amountPence: 4999, direction: 'out', payee: 'Railway' },
    { externalId: '4', date: '2026-07-10', amountPence: 500, direction: 'out', payee: 'One Off' }
  ];
  const copy = JSON.parse(JSON.stringify(txns));
  const annotated = recurring.annotateRecurring(txns);
  assert.deepEqual(txns, copy, 'input must not be mutated');
  assert.equal(annotated.filter((t) => t.isRecurring).length, 3);
  assert.equal(annotated.find((t) => t.payee === 'One Off').isRecurring, false);
  annotated.filter((t) => t.isRecurring).forEach((t) => assert.equal(t.recurringEstimated, true, 'every recurring flag here must be marked as an estimate'));
});

// --- Built-in accounting summary (01/09/2026) ---------------------------

test('summarise totals income, expenses and net correctly across mixed transactions', () => {
  const txns = [
    { direction: 'in', amount_pence: 150000, category: 'Sales' },
    { direction: 'in', amount_pence: 5000, category: 'Sales' },
    { direction: 'out', amount_pence: 20000, category: 'Software' },
    { direction: 'out', amount_pence: 3000, category: '' }
  ];
  const s = accounting.summarise(txns);
  assert.equal(s.incomePence, 155000);
  assert.equal(s.expensesPence, 23000);
  assert.equal(s.netPence, 132000);
  assert.equal(s.count, 4);
});

test('an empty or missing category becomes "(uncategorised)", never dropped or blank', () => {
  const s = accounting.summarise([{ direction: 'out', amount_pence: 500, category: '' }, { direction: 'out', amount_pence: 500, category: '   ' }]);
  assert.equal(s.categories.length, 1);
  assert.equal(s.categories[0].category, '(uncategorised)');
  assert.equal(s.categories[0].count, 2);
});

test('categories are broken out separately with their own income/expense/net', () => {
  const s = accounting.summarise([
    { direction: 'in', amount_pence: 10000, category: 'Sales' },
    { direction: 'out', amount_pence: 4000, category: 'Sales' },
    { direction: 'out', amount_pence: 2000, category: 'Software' }
  ]);
  const byName = Object.fromEntries(s.categories.map((c) => [c.category, c]));
  assert.equal(byName.Sales.incomePence, 10000);
  assert.equal(byName.Sales.expensesPence, 4000);
  assert.equal(byName.Sales.netPence, 6000);
  assert.equal(byName.Software.expensesPence, 2000);
});

test('summarise never mutates its input', () => {
  const txns = [{ direction: 'in', amount_pence: 100, category: 'Sales' }];
  const copy = JSON.parse(JSON.stringify(txns));
  accounting.summarise(txns);
  assert.deepEqual(txns, copy);
});

test('summarise of an empty list is all zero, not an error', () => {
  const s = accounting.summarise([]);
  assert.deepEqual(s, { incomePence: 0, expensesPence: 0, netPence: 0, count: 0, categories: [] });
});

test('periodRange presets are internally consistent (from <= to) across a year boundary', () => {
  const jan = new Date('2026-01-15T00:00:00Z');
  ['this_month', 'last_month', 'last_3_months', 'last_12_months'].forEach((preset) => {
    const r = accounting.periodRange(preset, jan);
    assert.ok(r.from <= r.to, `${preset}: from (${r.from}) must not be after to (${r.to})`);
  });
  assert.equal(accounting.periodRange('last_month', jan).from.slice(0, 7), '2025-12');
});

test('all_time has no bound on either side', () => {
  const r = accounting.periodRange('all_time');
  assert.equal(r.from, null);
  assert.equal(r.to, null);
});

test('resolvePeriod falls back to a safe default on an unrecognised or missing preset', () => {
  assert.equal(accounting.resolvePeriod({}).preset, 'this_month');
  assert.equal(accounting.resolvePeriod({ preset: 'not_a_real_preset' }).preset, 'this_month');
  assert.equal(accounting.resolvePeriod({ preset: 'last_12_months' }).preset, 'last_12_months');
});

test('resolvePeriod accepts a valid custom range only when both dates are well formed and ordered', () => {
  const ok = accounting.resolvePeriod({ preset: 'custom', from: '2026-01-01', to: '2026-01-31' });
  assert.equal(ok.preset, 'custom');
  assert.equal(ok.from, '2026-01-01');
  assert.equal(ok.to, '2026-01-31');

  assert.equal(accounting.resolvePeriod({ preset: 'custom', from: '2026-02-01', to: '2026-01-01' }).preset, 'this_month');
  assert.equal(accounting.resolvePeriod({ preset: 'custom', from: 'not-a-date', to: '2026-01-31' }).preset, 'this_month');
  assert.equal(accounting.resolvePeriod({ preset: 'custom', from: "2026-01-01'; DROP TABLE workspace_finance_transactions;--", to: '2026-01-31' }).preset, 'this_month');
});

test('monthlyTrend returns one bucket per month, oldest first, even for months with no data', () => {
  const now = new Date('2026-03-15T00:00:00Z');
  const txns = [{ txn_date: '2026-03-01', amount_pence: 1000, direction: 'in' }];
  const trend = accounting.monthlyTrend(txns, 3, now);
  assert.deepEqual(trend.map((m) => m.month), ['2026-01', '2026-02', '2026-03']);
  assert.equal(trend[0].count, 0);
  assert.equal(trend[2].incomePence, 1000);
});

test('monthlyTrend ignores transactions outside the requested window', () => {
  const now = new Date('2026-03-15T00:00:00Z');
  const txns = [{ txn_date: '2025-01-01', amount_pence: 999999, direction: 'in' }];
  const trend = accounting.monthlyTrend(txns, 3, now);
  assert.equal(trend.reduce((sum, m) => sum + m.count, 0), 0);
});

// Regression test for a real bug found in end-to-end testing (the same
// class as the recurring-groups one above): a raw Postgres row's
// txn_date is a Date object, and String(dateObject).slice(0,7) gives
// "Thu Mar" rather than "2026-03", so every real transaction silently
// matched no bucket and the whole cashflow card read as empty.
test('monthlyTrend works on raw database row shape (txn_date as a Date object), not just a string', () => {
  const now = new Date('2026-03-15T00:00:00Z');
  const txns = [{ txn_date: new Date('2026-03-05T00:00:00.000Z'), amount_pence: 1000, direction: 'in' }];
  const trend = accounting.monthlyTrend(txns, 3, now);
  assert.equal(trend[trend.length - 1].incomePence, 1000, 'must bucket a real Date object correctly, not just an ISO string');
});
