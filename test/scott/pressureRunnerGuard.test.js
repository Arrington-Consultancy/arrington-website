// The two-step arming guard on the paid pressure runner
// (scripts/scottLivePressureRunner.js), added 30/08/2026 after two
// sessions operating the same staging service surprised each other: a
// fresh label plus one variable change was enough to launch a paid run.
//
// These tests exercise the pure launch decision, so the guarantee is
// pinned without a database and without spending anything.
const test = require('node:test');
const assert = require('node:assert/strict');

const { decideLaunch, AUTH_MAX_AGE_MS } = require('../../scripts/scottLivePressureRunner');

const NOW = Date.now();
const freshAuth = { id: 1, created_at: new Date(NOW - 60_000), summary: 'Paid live-AI pressure run authorised [run x] by Tom via session' };
const staleAuth = { id: 2, created_at: new Date(NOW - AUTH_MAX_AGE_MS - 60_000), summary: 'old authorisation [run x]' };
const spent = { id: 3, created_at: new Date(NOW - 3_600_000), summary: 'Paid live-AI pressure suite launched [run x].' };

test('unset or false never launches, quietly', () => {
  assert.deepEqual(decideLaunch({ armed: undefined, spentRows: [], authRows: [freshAuth], aiEnabled: true, now: NOW }), { launch: false, quiet: true });
  assert.deepEqual(decideLaunch({ armed: 'false', spentRows: [], authRows: [freshAuth], aiEnabled: true, now: NOW }), { launch: false, quiet: true });
});

test("the legacy 'true' spelling no longer launches anything", () => {
  const d = decideLaunch({ armed: 'true', spentRows: [], authRows: [freshAuth], aiEnabled: true, now: NOW });
  assert.equal(d.launch, false);
  assert.match(d.reason, /legacy/);
});

test('a label with no authorisation row never launches: a variable change alone cannot spend', () => {
  const d = decideLaunch({ armed: 'x', spentRows: [], authRows: [], aiEnabled: true, now: NOW });
  assert.equal(d.launch, false);
  assert.match(d.reason, /no authorisation row/);
});

test('a spent label never launches again, even when freshly authorised', () => {
  const d = decideLaunch({ armed: 'x', spentRows: [spent], authRows: [freshAuth], aiEnabled: true, now: NOW });
  assert.equal(d.launch, false);
  assert.match(d.reason, /already spent/);
});

test('a stale authorisation (over 24 hours) never launches', () => {
  const d = decideLaunch({ armed: 'x', spentRows: [], authRows: [staleAuth], aiEnabled: true, now: NOW });
  assert.equal(d.launch, false);
  assert.match(d.reason, /older than 24 hours/);
});

test('disabled live AI never launches, so the one-shot is not wasted on a misconfigured boot', () => {
  const d = decideLaunch({ armed: 'x', spentRows: [], authRows: [freshAuth], aiEnabled: false, now: NOW });
  assert.equal(d.launch, false);
  assert.match(d.reason, /not enabled/);
});

test('an unspent label with a fresh authorisation and live AI enabled launches, and names its authorisation', () => {
  const d = decideLaunch({ armed: 'x', spentRows: [], authRows: [staleAuth, freshAuth], aiEnabled: true, now: NOW });
  assert.equal(d.launch, true);
  assert.equal(d.auth.id, freshAuth.id, 'the fresh authorisation must be the one consumed');
});
