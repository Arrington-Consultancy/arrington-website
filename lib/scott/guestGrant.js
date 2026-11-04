'use strict';

// Grants a guest viewer account page_access on the Scott synthetic page, which
// is what lets a 'client' login reach /scott and the Tidewell taxi office
// (/taxi-demo/office, gated by hasScottAccess in lib/scott/access.js).
//
// The normal route is Tom ticking the account in the Page access panel. This
// exists for the case Dan hit on 12/10/2026 and Will on 01/09/2026: the account
// is created in Manage Users, the guest's login then hits the "valid login,
// not invited" wall, and testing the login in Tom's own browser signs Tom out,
// so the panel is out of reach. One additive page_access row, one audit_log
// entry attributed to Tom, no password touched, ever.
//
// Runs until it has granted: the marker is stamped only once the grant is in
// place, so a deploy before Tom has created the account does nothing and the
// next one picks it up. Once stamped it never runs again, so if Tom later
// removes the access in Page access, a redeploy does not put it back.
const { SCOTT_PAGE_SLUG } = require('./access');

async function grantScottGuestAccess(db, { username, marker, requestedOn }) {
  const name = String(username || '').trim().toLowerCase();
  if (!name || !marker) throw new Error('grantScottGuestAccess needs a username and a marker');
  const { rows: stamped } = await db.query('SELECT 1 FROM content WHERE section_key = $1', [marker]);
  if (stamped.length) return { outcome: 'done_before', message: `page-access grant for '${name}' already applied (marker present).` };

  const { rows: pageRows } = await db.query('SELECT id, slug FROM pages WHERE slug = $1', [SCOTT_PAGE_SLUG]);
  const { rows: userRows } = await db.query('SELECT id FROM users WHERE username = $1', [name]);
  if (!pageRows.length || !userRows.length) {
    return {
      outcome: 'waiting',
      message: `page-access grant for '${name}' skipped (${userRows.length ? 'Scott page row' : 'no such user yet; create the account in Manage Users and it is granted on the next deploy'}).`
    };
  }
  const pageId = pageRows[0].id;
  const userId = userRows[0].id;
  const { rows: inserted } = await db.query(
    'INSERT INTO page_access (page_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING page_id',
    [pageId, userId]
  );
  if (inserted.length) {
    const { rows: tomRows } = await db.query(`SELECT id FROM users WHERE username = 'tom'`);
    const actorId = tomRows.length ? tomRows[0].id : userId;
    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [actorId, 'page_access_update', pageRows[0].slug,
        `Page access granted to '${name}' for "${pageRows[0].slug}", requested by Tom Arrington, applied via seed migration (${requestedOn}).`]
    );
  }
  await db.query(
    'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
    [marker, new Date().toISOString()]
  );
  return inserted.length
    ? { outcome: 'granted', message: `page access granted to '${name}'.` }
    : { outcome: 'already_had', message: `'${name}' already had page access; marker stamped.` };
}

module.exports = { grantScottGuestAccess };
