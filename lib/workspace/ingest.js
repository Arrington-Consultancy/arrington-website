// Arrington AI Workspace: snapshot ingestion.
//
// Called from db/seed.js on boot. Behaviour is honest by construction:
//
// - No key set: nothing is ingested, nothing fails, and the workspace
//   reports the absence as an unseeded state rather than pretending.
// - Key set, snapshot decrypts and validates: records are upserted and
//   a workspace_sync_runs row records exactly what was written.
// - Anything goes wrong mid-ingest: the sync run is recorded as failed
//   (or partial) with the real error, and the boot CONTINUES. A brain
//   that cannot refresh must say so; it must not stop the website.
//
// The snapshot is versioned JSON: { version: 1, generated_at, records: [...] }.
// Each record must carry a valid source_class and sensitivity; an entry
// that does not validate is skipped and counted, because silently
// widening an unknown sensitivity to 'standard' would be a leak, and
// silently narrowing it would be an unrecorded data loss. Skips make the
// run 'partial' and are listed in the run detail.

const fs = require('node:fs');
const path = require('node:path');
const { keyFromEnv, decryptSnapshot } = require('./snapshotCrypto');
const { SOURCE_CLASSES, SENSITIVITY_ORDER } = require('./lanes');

const SNAPSHOT_PATH = path.join(__dirname, '..', '..', 'data', 'workspace-snapshot.enc');

function validateRecord(r) {
  if (!r || typeof r !== 'object') return 'not an object';
  if (!r.record_key || !/^[a-z0-9][a-z0-9._-]{2,119}$/.test(r.record_key)) return `bad record_key ${JSON.stringify(r.record_key)}`;
  if (!SOURCE_CLASSES[r.source_class]) return `unknown source_class ${JSON.stringify(r.source_class)}`;
  if (r.sensitivity && !SENSITIVITY_ORDER.includes(r.sensitivity)) return `unknown sensitivity ${JSON.stringify(r.sensitivity)}`;
  if (!r.title || typeof r.title !== 'string') return 'missing title';
  return null;
}

async function ingestWorkspaceSnapshot(repo, { snapshotPath = SNAPSHOT_PATH, env = process.env } = {}) {
  const key = keyFromEnv(env.WORKSPACE_SNAPSHOT_KEY);
  if (!key) {
    if (env.WORKSPACE_SNAPSHOT_KEY) {
      console.warn('Workspace ingest: WORKSPACE_SNAPSHOT_KEY is set but is not a 64-char hex string; ingest skipped. (The key value is never logged.)');
    }
    return { ran: false, reason: 'no key' };
  }
  if (!fs.existsSync(snapshotPath)) {
    console.warn('Workspace ingest: key present but no snapshot file at data/workspace-snapshot.enc; ingest skipped.');
    return { ran: false, reason: 'no snapshot file' };
  }

  const runId = await repo.startSyncRun();
  let written = 0;
  const skipped = [];
  try {
    const plaintext = decryptSnapshot(fs.readFileSync(snapshotPath), key);
    const snapshot = JSON.parse(plaintext.toString('utf8'));
    if (snapshot.version !== 1 || !Array.isArray(snapshot.records)) {
      throw new Error('snapshot is not a version 1 record set');
    }
    const syncedAt = new Date();
    for (const r of snapshot.records) {
      const problem = validateRecord(r);
      if (problem) { skipped.push(problem); continue; }
      await repo.upsertRecord({ ...r, synced_at: syncedAt, sync_outcome: 'ok' });
      written += 1;
    }
    const outcome = skipped.length ? 'partial' : 'ok';
    const detail = skipped.length
      ? `${skipped.length} record(s) skipped: ${skipped.slice(0, 10).join('; ')}`
      : `snapshot generated_at ${snapshot.generated_at || 'unknown'}`;
    await repo.finishSyncRun(runId, { outcome, recordsWritten: written, detail });
    console.log(`Workspace ingest: ${outcome}, ${written} record(s) written${skipped.length ? `, ${skipped.length} skipped` : ''}.`);
    return { ran: true, outcome, written, skipped: skipped.length };
  } catch (err) {
    await repo.finishSyncRun(runId, { outcome: 'failed', recordsWritten: written, detail: err.message });
    console.error(`Workspace ingest: FAILED after ${written} record(s): ${err.message}. Boot continues; the workspace will show the failed sync.`);
    return { ran: true, outcome: 'failed', written, error: err.message };
  }
}

module.exports = { ingestWorkspaceSnapshot, validateRecord, SNAPSHOT_PATH };
