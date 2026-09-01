// Read-only business banking (ANNA Money via Xero), added 01/09/2026.
//
// Tom's ANNA MONEY BANKING INTEGRATION DECISION is the source of every
// assertion here. The two that matter most: no code path anywhere in
// this area can move money, and a credential is never presented as a
// successful retrieval. Same shape as test/workspace/social.test.js,
// which proved the pattern first.
const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../../lib/workspace/finance/registry');
const actions = require('../../lib/workspace/finance/actions');
const financeRepo = require('../../lib/workspace/finance/repo');
const orchestrator = require('../../lib/workspace/orchestrator');
const tokenCrypto = require('../../lib/workspace/finance/tokenCrypto');
const accounting = require('../../lib/workspace/finance/accounting');

test('exactly one provider exists: xero, the proven accounting-feed route', () => {
  assert.deepEqual(registry.PROVIDER_IDS, ['xero']);
});

test('no code path in this connector can initiate a payment, transfer, beneficiary or card action', () => {
  const forbidden = ['payment_initiation', 'transfer', 'beneficiary_creation', 'card_control', 'change_account_settings'];
  forbidden.forEach((a) => {
    assert.equal(registry.connectorMayDo('xero', a), false, `xero must not be able to ${a}`);
    assert.throws(() => actions.assertReadOnlyAllowed('xero', a), actions.MoneyMovementError, `${a} must throw, not just return false`);
  });
});

test('read and analyse are permitted, so the useful work is still possible', () => {
  ['read', 'analyse'].forEach((a) => {
    assert.equal(registry.connectorMayDo('xero', a), true);
    assert.equal(actions.assertReadOnlyAllowed('xero', a), true);
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

test('no scope declared by the connector grants more than reading', () => {
  registry.PROVIDER_IDS.forEach((p) => {
    registry.PROVIDERS[p].readScopes.forEach((scope) => {
      assert.doesNotMatch(scope, /\.write\b|payments|bank-feeds/i,
        `${p} declares ${scope}, which grants more than reading`);
    });
  });
});

test('an unconfigured connector is not configured, whatever else is in the environment', () => {
  assert.equal(registry.isConfigured('xero', {}), false);
  assert.equal(registry.isConfigured('xero', { XERO_CLIENT_ID: 'abc' }), false, 'a partial credential is not a credential');
  assert.equal(registry.isConfigured('xero', { XERO_CLIENT_ID: 'abc', XERO_CLIENT_SECRET: 'def' }), true);
  assert.equal(registry.isConfigured('xero', { XERO_CLIENT_ID: 'abc', XERO_CLIENT_SECRET: '   ' }), false);
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

test('a general (no-lane) question can draw on finance, still gated by clearance alone', () => {
  assert.ok(orchestrator.LANES); // sanity the module loaded
  const general = require('../../lib/workspace/orchestrator');
  // GENERAL_SOURCE_CLASSES is not exported directly; assert indirectly
  // via buildLaneContext behaviour instead of reaching into internals.
  assert.equal(typeof general.buildLaneContext, 'function');
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
    { record_key: 'finance.xero_summary', source_class: 'finance', sensitivity: 'confidential', doc_status: 'current' },
    { record_key: 'authority.constitution', source_class: 'authority', sensitivity: 'standard', doc_status: 'current' }
  ];
  try {
    const owner = await orchestrator.buildLaneContext({ clearanceId: 'owner_admin', laneId: null });
    assert.ok(owner.some((r) => r.record_key === 'finance.xero_summary'), 'owner_admin should see the finance record on a general question');

    const restricted = await orchestrator.buildLaneContext({ clearanceId: 'ws_restricted', laneId: null });
    assert.ok(!restricted.some((r) => r.record_key === 'finance.xero_summary'), 'ws_restricted must never see a confidential finance record');

    // A lane other than governance_assurance must not see it either, even
    // for the owner: task necessity is a permission leg, not a nicety.
    const websiteLane = await orchestrator.buildLaneContext({ clearanceId: 'owner_admin', laneId: 'website_hosting' });
    assert.ok(!websiteLane.some((r) => r.record_key === 'finance.xero_summary'), 'an unrelated lane must not surface finance data');

    const governanceLane = await orchestrator.buildLaneContext({ clearanceId: 'owner_admin', laneId: 'governance_assurance' });
    assert.ok(governanceLane.some((r) => r.record_key === 'finance.xero_summary'), 'governance_assurance reads every source class by its own remit');
  } finally {
    repo.listRecords = orig;
  }
});

// --- Token encryption ---------------------------------------------------

test('a token round-trips through encryption and cannot be read without the key', () => {
  const key = require('node:crypto').randomBytes(32).toString('hex');
  const plaintext = 'a-fake-refresh-token-value';
  const enc = tokenCrypto.encryptToken(plaintext, tokenCrypto.keyFromEnv(key));
  assert.notEqual(enc, plaintext);
  assert.equal(tokenCrypto.decryptToken(enc, tokenCrypto.keyFromEnv(key)), plaintext);
  // A different key cannot decrypt it.
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

// --- Built-in accounting summary (01/09/2026) ---------------------------
//
// Tom asked for free accounting software built in. ANNA's own live
// integrations are Xero and Sage only (FreeAgent/Clearbooks are on
// ANNA's roadmap, not live), so there is nothing free to connect to;
// this is a read-only summary computed from transactions already
// synced, not a bookkeeping system, and these tests hold it to that.

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
  // January: 'last_month' must resolve to the previous December, not
  // month -1 = -1.
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

  // Reversed order, malformed dates, and SQL/script-shaped input must all
  // fall back rather than reach the database unvalidated.
  assert.equal(accounting.resolvePeriod({ preset: 'custom', from: '2026-02-01', to: '2026-01-01' }).preset, 'this_month');
  assert.equal(accounting.resolvePeriod({ preset: 'custom', from: 'not-a-date', to: '2026-01-31' }).preset, 'this_month');
  assert.equal(accounting.resolvePeriod({ preset: 'custom', from: "2026-01-01'; DROP TABLE workspace_finance_transactions;--", to: '2026-01-31' }).preset, 'this_month');
});
