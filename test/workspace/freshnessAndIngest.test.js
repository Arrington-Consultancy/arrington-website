// Provenance, freshness and ingestion honesty.
//
// The control pack's rule is that the workspace must never present an
// extract as more current than it is. The two ways that goes wrong are a
// failed sync hiding behind the date of the last successful one, and a
// missing snapshot rendering as a legitimately empty brain. Both are
// pinned here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const repo = require('../../lib/workspace/repo');
const { ingestWorkspaceSnapshot, validateRecord } = require('../../lib/workspace/ingest');
const { encryptSnapshot, decryptSnapshot, keyFromEnv } = require('../../lib/workspace/snapshotCrypto');

const DAY = 86400000;

test('a record inside its threshold is fresh, and one past it is stale', () => {
  const now = new Date('2026-08-30T12:00:00Z');
  assert.equal(repo.recordFreshness({ synced_at: new Date(now - 3 * DAY), stale_after_days: 30, doc_status: 'current', sync_outcome: 'ok' }, now).state, 'fresh');
  const stale = repo.recordFreshness({ synced_at: new Date(now - 40 * DAY), stale_after_days: 30, doc_status: 'current', sync_outcome: 'ok' }, now);
  assert.equal(stale.state, 'stale');
  assert.equal(stale.ageDays, 40);
});

test('a failed sync outranks a fresh-looking date: the failure is never hidden behind it', () => {
  const now = new Date('2026-08-30T12:00:00Z');
  const row = { synced_at: new Date(now - 1 * DAY), stale_after_days: 30, doc_status: 'current', sync_outcome: 'failed' };
  assert.equal(repo.recordFreshness(row, now).state, 'sync_failed',
    'a record whose last refresh failed must not read as fresh');
});

test('a record that was never synced reads as unverified, not as fresh', () => {
  assert.equal(repo.recordFreshness({ doc_status: 'current', sync_outcome: 'ok' }).state, 'unverified');
  assert.equal(repo.recordFreshness(null).state, 'unverified');
});

test('the snapshot round-trips, and a wrong key cannot read it', () => {
  const key = keyFromEnv('a'.repeat(64));
  const other = keyFromEnv('b'.repeat(64));
  const payload = Buffer.from(JSON.stringify({ version: 1, records: [] }), 'utf8');
  const enc = encryptSnapshot(payload, key);
  assert.deepEqual(JSON.parse(decryptSnapshot(enc, key).toString('utf8')), { version: 1, records: [] });
  assert.throws(() => decryptSnapshot(enc, other), /unable to authenticate|bad decrypt|auth/i);
  assert.notEqual(enc.toString('utf8').indexOf('version'), 0, 'the committed file must not be readable plaintext');
});

test('a malformed key is rejected rather than coerced into something usable', () => {
  assert.equal(keyFromEnv(''), null);
  assert.equal(keyFromEnv('too-short'), null);
  assert.equal(keyFromEnv('z'.repeat(64)), null, 'non-hex is not a key');
});

test('record validation refuses an unknown source class or sensitivity rather than guessing', () => {
  assert.equal(validateRecord({ record_key: 'a.b', source_class: 'authority', title: 'T' }), null);
  assert.match(validateRecord({ record_key: 'a.b', source_class: 'invented', title: 'T' }), /unknown source_class/);
  assert.match(validateRecord({ record_key: 'a.b', source_class: 'authority', title: 'T', sensitivity: 'ultra' }), /unknown sensitivity/);
  assert.match(validateRecord({ record_key: 'BAD KEY', source_class: 'authority', title: 'T' }), /bad record_key/);
});

test('no key means no ingest, reported as such rather than as an empty brain', async () => {
  const calls = [];
  const fakeRepo = { startSyncRun: async () => { calls.push('start'); return 1; } };
  const res = await ingestWorkspaceSnapshot(fakeRepo, { env: {} });
  assert.deepEqual(res, { ran: false, reason: 'no key' });
  assert.deepEqual(calls, [], 'nothing is recorded as a sync run when no ingest was attempted');
});

test('a corrupt snapshot records a FAILED sync run and does not throw, so the site still boots', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-ingest-'));
  const file = path.join(dir, 'bad.enc');
  fs.writeFileSync(file, Buffer.from('this is not a snapshot at all'));
  const finished = [];
  const fakeRepo = {
    startSyncRun: async () => 7,
    finishSyncRun: async (id, info) => finished.push(info),
    upsertRecord: async () => { throw new Error('should not be reached'); }
  };
  const res = await ingestWorkspaceSnapshot(fakeRepo, {
    snapshotPath: file,
    env: { WORKSPACE_SNAPSHOT_KEY: 'a'.repeat(64) }
  });
  assert.equal(res.outcome, 'failed');
  assert.equal(finished.length, 1);
  assert.equal(finished[0].outcome, 'failed');
  assert.ok(finished[0].detail, 'the real error is recorded, not swallowed');
});

test('an invalid record is skipped and counted, making the run partial rather than silently lossy', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-ingest-'));
  const file = path.join(dir, 'mixed.enc');
  const key = keyFromEnv('a'.repeat(64));
  const snapshot = {
    version: 1,
    generated_at: '2026-08-30',
    records: [
      { record_key: 'good.one', source_class: 'authority', title: 'Good' },
      { record_key: 'bad.one', source_class: 'not_a_class', title: 'Bad' }
    ]
  };
  fs.writeFileSync(file, encryptSnapshot(Buffer.from(JSON.stringify(snapshot)), key));
  const written = [];
  const finished = [];
  const fakeRepo = {
    startSyncRun: async () => 9,
    finishSyncRun: async (id, info) => finished.push(info),
    upsertRecord: async (r) => written.push(r.record_key)
  };
  const res = await ingestWorkspaceSnapshot(fakeRepo, { snapshotPath: file, env: { WORKSPACE_SNAPSHOT_KEY: 'a'.repeat(64) } });
  assert.deepEqual(written, ['good.one']);
  assert.equal(res.outcome, 'partial');
  assert.match(finished[0].detail, /skipped/);
});
