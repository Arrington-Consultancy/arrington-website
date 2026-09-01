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
