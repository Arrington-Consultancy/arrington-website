const db = require('../../db/pool');

function staleExpression(alias = 's') {
  return `((${alias}.last_synced_at + (${alias}.stale_after_days || ' days')::interval) < NOW())`;
}

async function getDashboard() {
  const [sources, gaps, activity] = await Promise.all([
    db.query(`SELECT *, ${staleExpression('s')} AS is_stale
              FROM arrington_workspace_sources s
              ORDER BY authority_class, title`),
    db.query(`SELECT * FROM arrington_workspace_brain_gaps
              WHERE status IN ('open', 'waiting_for_source')
              ORDER BY created_at DESC
              LIMIT 20`),
    db.query(`SELECT * FROM arrington_workspace_activity
              ORDER BY created_at DESC
              LIMIT 20`)
  ]);
  return {
    sources: sources.rows,
    gaps: gaps.rows,
    activity: activity.rows,
    summary: {
      sources: sources.rows.length,
      staleSources: sources.rows.filter((s) => s.is_stale).length,
      openGaps: gaps.rows.length
    }
  };
}

async function searchSources(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const { rows } = await db.query(
    `SELECT source_key, title, source_system, authority_class, status, sensitivity,
            summary, source_url, last_synced_at, ${staleExpression('s')} AS is_stale
     FROM arrington_workspace_sources s
     WHERE sensitivity <> 'secret'
       AND (title ILIKE $1 OR summary ILIKE $1 OR source_system ILIKE $1)
     ORDER BY
       CASE authority_class
         WHEN 'governing-authority' THEN 1
         WHEN 'implementation-brief' THEN 2
         ELSE 3
       END,
       title
     LIMIT 10`,
    [`%${q}%`]
  );
  return rows;
}

async function getSources() {
  const { rows } = await db.query(
    `SELECT *, ${staleExpression('s')} AS is_stale
     FROM arrington_workspace_sources s
     ORDER BY authority_class, title`
  );
  return rows;
}

async function getGaps() {
  const { rows } = await db.query(
    `SELECT g.*, s.title AS source_title
     FROM arrington_workspace_brain_gaps g
     LEFT JOIN arrington_workspace_sources s ON s.source_key = g.source_key
     ORDER BY
       CASE g.status WHEN 'open' THEN 1 WHEN 'waiting_for_source' THEN 2 ELSE 3 END,
       g.created_at DESC`
  );
  return rows;
}

async function getActivity() {
  const { rows } = await db.query(
    `SELECT * FROM arrington_workspace_activity ORDER BY created_at DESC LIMIT 100`
  );
  return rows;
}

async function recordActivity({ actor = 'system', eventType, summary, sourceKey = null }) {
  await db.query(
    `INSERT INTO arrington_workspace_activity (actor, event_type, summary, source_key)
     VALUES ($1, $2, $3, $4)`,
    [actor, eventType, summary, sourceKey]
  );
}

module.exports = {
  getActivity,
  getDashboard,
  getGaps,
  getSources,
  recordActivity,
  searchSources
};
