// Arrington AI Workspace: data access.
//
// This module is deliberately clearance-blind: it reads and writes rows
// and nothing else. Every caller (routes, search, the orchestrator's
// context builder) MUST apply the two permission legs before any row
// reaches a response or a prompt: filterRecordsForClearance from
// lib/workspace/clearance.js and, when a lane is involved,
// filterRecordsForLane from lib/workspace/lanes.js. Filtering happens
// BEFORE content is used, never as post-generation redaction. Tests pin
// the callers, not this file, for that property.

const db = require('../../db/pool');

// --- Records -----------------------------------------------------------

async function upsertRecord(r) {
  const { rows } = await db.query(
    `INSERT INTO workspace_records
       (record_key, source_class, authority_class, doc_status, sensitivity, title, source_ref, body, as_of, synced_at, stale_after_days, sync_outcome, meta, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
     ON CONFLICT (record_key) DO UPDATE SET
       source_class = EXCLUDED.source_class,
       authority_class = EXCLUDED.authority_class,
       doc_status = EXCLUDED.doc_status,
       sensitivity = EXCLUDED.sensitivity,
       title = EXCLUDED.title,
       source_ref = EXCLUDED.source_ref,
       body = EXCLUDED.body,
       as_of = EXCLUDED.as_of,
       synced_at = EXCLUDED.synced_at,
       stale_after_days = EXCLUDED.stale_after_days,
       sync_outcome = EXCLUDED.sync_outcome,
       meta = EXCLUDED.meta,
       updated_at = NOW()
     RETURNING id`,
    [
      r.record_key, r.source_class, r.authority_class || 'supporting',
      r.doc_status || 'current', r.sensitivity || 'standard', r.title,
      r.source_ref || '', r.body || '', r.as_of || null,
      r.synced_at || new Date(), r.stale_after_days || null,
      r.sync_outcome || 'ok', JSON.stringify(r.meta || {})
    ]
  );
  return rows[0].id;
}

async function listRecords({ sourceClass = null, docStatus = null } = {}) {
  const clauses = [];
  const params = [];
  if (sourceClass) { params.push(sourceClass); clauses.push(`source_class = $${params.length}`); }
  if (docStatus) { params.push(docStatus); clauses.push(`doc_status = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT * FROM workspace_records ${where} ORDER BY source_class, title`, params
  );
  return rows;
}

async function getRecordByKey(recordKey) {
  const { rows } = await db.query('SELECT * FROM workspace_records WHERE record_key = $1', [recordKey]);
  return rows[0] || null;
}

// Plain text search over title and body. Returns raw rows; the caller
// filters for clearance BEFORE computing any count it shows, so result
// sizes leak nothing.
async function searchRecords(term) {
  const { rows } = await db.query(
    `SELECT * FROM workspace_records
     WHERE title ILIKE $1 OR body ILIKE $1
     ORDER BY source_class, title LIMIT 200`,
    [`%${term}%`]
  );
  return rows;
}

// Freshness is computed, not stored, so the display can never disagree
// with the row. A failed last sync outranks a fresh-looking date: the
// date belongs to the last SUCCESSFUL extraction, and hiding the failure
// behind it would be a false freshness claim.
function recordFreshness(record, now = new Date()) {
  if (!record) return { state: 'unverified', ageDays: null };
  if (record.sync_outcome === 'failed') return { state: 'sync_failed', ageDays: null };
  if (record.doc_status === 'unverified') return { state: 'unverified', ageDays: null };
  if (!record.synced_at) return { state: 'unverified', ageDays: null };
  const ageDays = Math.floor((now - new Date(record.synced_at)) / 86400000);
  if (record.stale_after_days != null && ageDays > record.stale_after_days) {
    return { state: 'stale', ageDays };
  }
  return { state: 'fresh', ageDays };
}

// --- Conversations -----------------------------------------------------

async function createConversation({ ownerUsername, clearance, laneId = '', title = '' }) {
  const { rows } = await db.query(
    `INSERT INTO workspace_conversations (owner_username, clearance, lane_id, title)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [ownerUsername, clearance, laneId, title]
  );
  return rows[0];
}

async function listConversationsFor(ownerUsername) {
  const { rows } = await db.query(
    `SELECT * FROM workspace_conversations WHERE owner_username = $1 ORDER BY updated_at DESC LIMIT 100`,
    [ownerUsername]
  );
  return rows;
}

// Ownership is enforced in the query itself, so a route cannot forget:
// asking for someone else's conversation returns null, indistinguishable
// from a conversation that does not exist.
async function getConversationFor(id, ownerUsername) {
  const { rows } = await db.query(
    `SELECT * FROM workspace_conversations WHERE id = $1 AND owner_username = $2`,
    [id, ownerUsername]
  );
  return rows[0] || null;
}

async function addMessage({ conversationId, role, content, laneId = '', provenance = [] }) {
  const { rows } = await db.query(
    `INSERT INTO workspace_messages (conversation_id, role, content, lane_id, provenance)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [conversationId, role, content, laneId, JSON.stringify(provenance)]
  );
  await db.query('UPDATE workspace_conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
  return rows[0];
}

async function listMessages(conversationId) {
  const { rows } = await db.query(
    `SELECT * FROM workspace_messages WHERE conversation_id = $1 ORDER BY id`,
    [conversationId]
  );
  return rows;
}

// --- Gaps --------------------------------------------------------------

async function createGap({ gapType, description, recordKey = '', sensitivity = 'standard', material = false, raisedBy }) {
  const { rows } = await db.query(
    `INSERT INTO workspace_gaps (gap_type, description, record_key, sensitivity, material, raised_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [gapType, description, recordKey, sensitivity, material, raisedBy]
  );
  return rows[0];
}

async function listGaps({ status = null } = {}) {
  const params = [];
  let where = '';
  if (status) { params.push(status); where = 'WHERE status = $1'; }
  const { rows } = await db.query(
    `SELECT * FROM workspace_gaps ${where} ORDER BY material DESC, created_at DESC LIMIT 200`, params
  );
  return rows;
}

// Closing a gap requires a human and a written statement. A gap that is
// already closed stays closed: the second close returns null and the
// route turns that into a 409, because silently re-closing is how a
// register stops meaning anything.
async function resolveGap(id, { resolvedBy, sourceCorrected, note }) {
  const status = sourceCorrected ? 'resolved' : 'dismissed';
  const { rows } = await db.query(
    `UPDATE workspace_gaps
     SET status = $2, resolved_by = $3, source_corrected = $4, resolution_note = $5, resolved_at = NOW()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [id, status, resolvedBy, !!sourceCorrected, note]
  );
  return rows[0] || null;
}

// --- Approvals ---------------------------------------------------------

async function createApproval({ title, detail = '', actionClass = 3, sensitivity = 'commercial', requestedBy }) {
  const { rows } = await db.query(
    `INSERT INTO workspace_approvals (title, detail, action_class, sensitivity, requested_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [title, detail, actionClass, sensitivity, requestedBy]
  );
  return rows[0];
}

async function listApprovals({ status = null } = {}) {
  const params = [];
  let where = '';
  if (status) { params.push(status); where = 'WHERE status = $1'; }
  const { rows } = await db.query(
    `SELECT * FROM workspace_approvals ${where} ORDER BY created_at DESC LIMIT 200`, params
  );
  return rows;
}

async function decideApproval(id, { decision, decidedBy, note = '' }) {
  const status = decision === 'approved' ? 'approved' : 'declined';
  const { rows } = await db.query(
    `UPDATE workspace_approvals
     SET status = $2, decided_by = $3, decision_note = $4, decided_at = NOW()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [id, status, decidedBy, note]
  );
  return rows[0] || null;
}

// --- Activity ----------------------------------------------------------

// `subject` names the account a row is ABOUT, where that differs from
// the actor who caused it: a system-generated security notice concerning
// Tom's account has actor 'system' and subject 'tom'. Finding J2: it is
// a column so a cooldown can be matched exactly, rather than by looking
// for a name inside a sentence.
async function addActivity({ actor, eventType, summary, subject = '' }) {
  await db.query(
    'INSERT INTO workspace_activity (actor, event_type, summary, subject) VALUES ($1,$2,$3,$4)',
    [actor, eventType, summary, subject]
  );
}

async function listActivity(limit = 100) {
  const { rows } = await db.query(
    'SELECT * FROM workspace_activity ORDER BY id DESC LIMIT $1', [Math.min(limit, 500)]
  );
  return rows;
}

// --- Sync runs ---------------------------------------------------------

async function startSyncRun() {
  const { rows } = await db.query('INSERT INTO workspace_sync_runs DEFAULT VALUES RETURNING id');
  return rows[0].id;
}

async function finishSyncRun(id, { outcome, recordsWritten, detail = '' }) {
  await db.query(
    `UPDATE workspace_sync_runs SET finished_at = NOW(), outcome = $2, records_written = $3, detail = $4 WHERE id = $1`,
    [id, outcome, recordsWritten, detail]
  );
}

async function latestSyncRun() {
  const { rows } = await db.query('SELECT * FROM workspace_sync_runs ORDER BY id DESC LIMIT 1');
  return rows[0] || null;
}

module.exports = {
  upsertRecord,
  listRecords,
  getRecordByKey,
  searchRecords,
  recordFreshness,
  createConversation,
  listConversationsFor,
  getConversationFor,
  addMessage,
  listMessages,
  createGap,
  listGaps,
  resolveGap,
  createApproval,
  listApprovals,
  decideApproval,
  addActivity,
  listActivity,
  startSyncRun,
  finishSyncRun,
  latestSyncRun
};
