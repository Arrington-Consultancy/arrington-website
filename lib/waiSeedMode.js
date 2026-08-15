// Decides whether db/seed.js is allowed to write /websites-and-ai content on
// this run. Lives in its own module purely so it can be unit tested: db/seed.js
// executes its whole seed on require, so nothing inside it can be imported.
//
// See the long "/websites-and-ai seed contract" comment in db/seed.js for what
// each mode means and why the gate exists. In short:
//
//   fresh   page absent          -> run the full migration chain, then stamp
//   adopt   page present, no marker -> write nothing, stamp only
//   skip    marker matches          -> write nothing at all
//   replay  marker differs          -> deliberate re-assert, then re-stamp
//
// `db` is any object with a promise-returning `query(sql, params)`, so the
// tests can pass a stub instead of a live pool.

/**
 * @param {{query: Function}} db
 * @param {string} revision   current WAI_SEED_REVISION
 * @param {string} markerKey  content.section_key holding the applied revision
 * @returns {Promise<'fresh'|'adopt'|'skip'|'replay'>}
 */
async function resolveWaiSeedMode(db, revision, markerKey) {
  const { rows: pageRows } = await db.query(
    "SELECT 1 FROM pages WHERE slug = 'websites-and-ai'"
  );
  if (pageRows.length === 0) return 'fresh';

  const { rows: markerRows } = await db.query(
    'SELECT content FROM content WHERE section_key = $1',
    [markerKey]
  );
  if (markerRows.length === 0) return 'adopt';

  const applied = (markerRows[0].content || '').trim();
  return applied === revision ? 'skip' : 'replay';
}

/** The two modes in which the migration chain is permitted to write. */
function waiSeedWrites(mode) {
  return mode === 'fresh' || mode === 'replay';
}

module.exports = { resolveWaiSeedMode, waiSeedWrites };
