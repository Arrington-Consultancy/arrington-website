// Arrington AI Workspace: social control area data access.
//
// Clearance-blind like lib/workspace/repo.js: callers apply the
// permission legs. What this file DOES own is the honesty rules that
// must not depend on a caller remembering them.

const db = require('../../../db/pool');
const { PLATFORM_IDS, PLATFORMS, isConfigured } = require('./registry');

// The connector state for all four platforms, always all four, so the
// control area is one view rather than a list of whatever happens to be
// connected. A platform with no row has never been configured, and says
// so, rather than being absent from the page.
async function accountStates(env = process.env, now = new Date()) {
  const { rows } = await db.query('SELECT * FROM workspace_social_accounts');
  const byPlatform = Object.fromEntries(rows.map((r) => [r.platform, r]));
  return PLATFORM_IDS.map((id) => {
    const platform = PLATFORMS[id];
    const row = byPlatform[id] || null;
    const configured = isConfigured(id, env);
    return {
      platform: id,
      name: platform.name,
      api: platform.api,
      setupNote: platform.setupNote,
      readScopes: platform.readScopes,
      supports: platform.supports,
      configured,
      status: configured ? (row ? row.status : 'configured') : 'not_configured',
      accountRef: row ? row.account_ref : '',
      displayName: row ? row.display_name : '',
      followers: row ? row.followers : null,
      followersChange: row ? row.followers_change : null,
      connectedAt: row ? row.connected_at : null,
      lastSyncAt: row ? row.last_sync_at : null,
      lastSyncOutcome: row ? row.last_sync_outcome : 'never',
      lastError: row ? row.last_error : '',
      freshness: connectorFreshness(row, configured, now)
    };
  });
}

// The rule this whole area exists to enforce: a credential is not a
// retrieval. A configured connector that has never returned data reads
// as "connected, never retrieved", NOT as fresh and not as empty. A
// failed last attempt outranks the timestamp of the last good one,
// because the data on screen is now of unknown currency.
function connectorFreshness(row, configured, now = new Date()) {
  if (!configured) return { state: 'not_connected', ageHours: null };
  if (!row || row.last_sync_outcome === 'never' || !row.last_sync_at) {
    return { state: 'never_retrieved', ageHours: null };
  }
  if (row.last_sync_outcome === 'failed') return { state: 'sync_failed', ageHours: null };
  const ageHours = Math.floor((now - new Date(row.last_sync_at)) / 3600000);
  if (row.last_sync_outcome === 'partial') return { state: 'partial', ageHours };
  if (ageHours > (row.stale_after_hours || 24)) return { state: 'stale', ageHours };
  return { state: 'fresh', ageHours };
}

async function upsertAccount(platform, fields) {
  const { rows } = await db.query(
    `INSERT INTO workspace_social_accounts
       (platform, status, account_ref, display_name, granted_scopes, connected_at, last_sync_at, last_sync_outcome, last_error, followers, followers_change, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
     ON CONFLICT (platform) DO UPDATE SET
       status = EXCLUDED.status,
       account_ref = EXCLUDED.account_ref,
       display_name = EXCLUDED.display_name,
       granted_scopes = EXCLUDED.granted_scopes,
       connected_at = COALESCE(workspace_social_accounts.connected_at, EXCLUDED.connected_at),
       last_sync_at = EXCLUDED.last_sync_at,
       last_sync_outcome = EXCLUDED.last_sync_outcome,
       last_error = EXCLUDED.last_error,
       followers = EXCLUDED.followers,
       followers_change = EXCLUDED.followers_change,
       updated_at = NOW()
     RETURNING *`,
    [
      platform, fields.status || 'configured', fields.accountRef || '', fields.displayName || '',
      (fields.grantedScopes || []).join(' '), fields.connectedAt || null,
      fields.lastSyncAt || null, fields.lastSyncOutcome || 'never', fields.lastError || '',
      fields.followers ?? null, fields.followersChange ?? null
    ]
  );
  return rows[0];
}

async function listPosts({ platform = null, kind = null, limit = 60 } = {}) {
  const params = [];
  const clauses = [];
  if (platform) { params.push(platform); clauses.push(`platform = $${params.length}`); }
  if (kind) { params.push(kind); clauses.push(`kind = $${params.length}`); }
  params.push(Math.min(limit, 200));
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT * FROM workspace_social_posts ${where} ORDER BY posted_at DESC NULLS LAST, id DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function listEngagement({ needsReply = null, limit = 60 } = {}) {
  const params = [];
  let where = '';
  if (needsReply === true) where = 'WHERE needs_reply = true AND replied_at IS NULL';
  params.push(Math.min(limit, 200));
  const { rows } = await db.query(
    `SELECT * FROM workspace_social_engagement ${where} ORDER BY occurred_at DESC NULLS LAST, id DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

// Recording that a HUMAN replied on the platform. There is deliberately
// no function here that sends a reply: the workspace cannot, so it must
// not appear able to.
async function recordHumanReply(id, username) {
  const { rows } = await db.query(
    `UPDATE workspace_social_engagement SET replied_at = NOW(), replied_by = $2
     WHERE id = $1 AND replied_at IS NULL RETURNING *`,
    [id, username]
  );
  return rows[0] || null;
}

// Upserting retrieved items. Keyed on (platform, external_id) so a
// re-sync of an overlapping window updates rather than duplicates,
// which is what makes "Sync now" safe to press twice.
async function upsertPost(platform, post) {
  const { rows } = await db.query(
    `INSERT INTO workspace_social_posts
       (platform, external_id, kind, body, permalink, posted_at, impressions, engagements, comments_count, retrieved_at)
     VALUES ($1,$2,'published',$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (platform, external_id) DO UPDATE SET
       body = EXCLUDED.body,
       permalink = EXCLUDED.permalink,
       posted_at = EXCLUDED.posted_at,
       -- A metric that came back null this time does not erase one that
       -- was retrieved before: a missing field is unknown, not zero.
       impressions = COALESCE(EXCLUDED.impressions, workspace_social_posts.impressions),
       engagements = COALESCE(EXCLUDED.engagements, workspace_social_posts.engagements),
       comments_count = COALESCE(EXCLUDED.comments_count, workspace_social_posts.comments_count),
       retrieved_at = NOW()
     RETURNING id`,
    [platform, post.externalId, post.body || '', post.permalink || '', post.postedAt || null,
      post.impressions ?? null, post.engagements ?? null, post.commentsCount ?? null]
  );
  return rows[0];
}

// needs_reply is set on insert only. A human marking something replied
// must not be undone by the next sync re-reading the same comment.
async function upsertEngagement(platform, item) {
  const { rows } = await db.query(
    `INSERT INTO workspace_social_engagement
       (platform, external_id, kind, author, body, permalink, occurred_at, needs_reply)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true)
     ON CONFLICT (platform, external_id) DO UPDATE SET
       body = EXCLUDED.body,
       permalink = EXCLUDED.permalink,
       occurred_at = EXCLUDED.occurred_at
     RETURNING id`,
    [platform, item.externalId, item.kind || 'comment', item.author || '',
      item.body || '', item.permalink || '', item.occurredAt || null]
  );
  return rows[0];
}

async function startSyncRun(platform) {
  const { rows } = await db.query('INSERT INTO workspace_social_sync_runs (platform) VALUES ($1) RETURNING id', [platform]);
  return rows[0].id;
}

async function finishSyncRun(id, { outcome, itemsWritten = 0, detail = '' }) {
  await db.query(
    'UPDATE workspace_social_sync_runs SET finished_at = NOW(), outcome = $2, items_written = $3, detail = $4 WHERE id = $1',
    [id, outcome, itemsWritten, detail]
  );
}

async function recentSyncRuns(limit = 20) {
  const { rows } = await db.query('SELECT * FROM workspace_social_sync_runs ORDER BY id DESC LIMIT $1', [Math.min(limit, 100)]);
  return rows;
}

module.exports = {
  accountStates,
  connectorFreshness,
  upsertAccount,
  listPosts,
  listEngagement,
  recordHumanReply,
  upsertPost,
  upsertEngagement,
  startSyncRun,
  finishSyncRun,
  recentSyncRuns
};
