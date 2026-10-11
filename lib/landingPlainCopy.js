'use strict';

// Plainer lines on the four city landing pages (Devon, Cornwall, Exeter,
// Plymouth). Tom approved these on 11/10/2026, including the optional fourth
// change (Website & Hosting proposal "More Google Ads visitors to the contact
// form", 11 October 2026). Brief from the Google Ads worker: the paid landing
// pages read harder than the homepage, so the hardest live lines are made
// plainer. Measured on the live Devon page: reading age about 11.3 before,
// about 10.3 after (homepage about 9.7).
//
// Every `from` is the value production holds after the voice sweep of
// 07/10/2026 (lib/voiceSweepCopy.js), which wrote these rows and confirmed
// them on production (all groups written, none stood down). col_2_p1 was not
// touched by the sweep and is the July wording, carried onto the city pages
// when they were copied from Devon.
//
// THE GUARD is the voice sweep's own planGroup: a page's group is written
// only if every row still holds its `from` (or already holds its `to`). A
// row edited in the CMS since makes that page stand down and its live value
// is logged, so a CMS edit is never overwritten. Run once, under a marker.

const { LANDING, planGroup } = require('./voiceSweepCopy');

const LANDING_PLAIN_MARKER = 'site.landing_plain_copy_2026-10-11';

const BR = '<br /><br />\n\n';
const OLD_STEP_3 = 'You leave with a clear understanding of the opportunities, the priorities and whether working together makes commercial sense.';
const NEW_STEP_3 = "You'll know what matters most and whether it makes sense to work together.";

function landingGroup(l) {
  return {
    name: `landing page ${l.page}`,
    page: l.page,
    rows: [
      // 1. The step 3 lead. The old line was also a group of three.
      { key: `${l.ap}.step_3_body`,
        from: `${OLD_STEP_3}${BR}No obligation.`,
        to: `${NEW_STEP_3}${BR}No obligation.` },
      // 2. Removed: it repeated steps 01 and 02 directly above it. An empty
      //    paragraph renders nothing (views/index.ejs, biography template).
      { key: `${l.bio}.col_1_p2`,
        from: 'Most relationships begin with a straightforward 30 minute conversation before deciding whether a commercial review is the right next step.',
        to: '' },
      // 3. Meeting in person or by video.
      { key: `${l.bio}.col_2_p1`,
        from: 'Some clients prefer to meet in person. Others work with us remotely. The approach stays the same: understand the business properly before recommending any changes.',
        to: 'We can meet in person or work by video call. Either way, we understand the business before we suggest any changes.' },
      // 4. The aim (optional change, approved by Tom).
      { key: `${l.bio}.col_2_p2`,
        from: 'The aim is better commercial decisions and a business that relies less on the owner being involved in everything.',
        to: 'The aim is better decisions and a business that needs less from you.' }
    ]
  };
}

const GROUPS = LANDING.map(landingGroup);

async function applyLandingPlainCopy(db) {
  const { rows: marker } = await db.query('SELECT 1 FROM content WHERE section_key = $1', [LANDING_PLAIN_MARKER]);
  if (marker.length) return null;
  const keys = GROUPS.flatMap((g) => g.rows.map((r) => r.key));
  const { rows } = await db.query('SELECT section_key, content FROM content WHERE section_key = ANY($1)', [keys]);
  const current = Object.create(null);
  for (const r of rows) current[r.section_key] = r.content;
  const report = [];
  let found = 0;
  for (const g of GROUPS) {
    const plan = planGroup(g, current);
    if (plan.action === 'write') {
      for (const r of plan.writes) {
        await db.query('UPDATE content SET content = $1, updated_at = NOW() WHERE section_key = $2 AND content = $3', [r.to, r.key, r.from]);
      }
    }
    if (plan.action !== 'stand_down') found++;
    report.push({ name: g.name, action: plan.action, written: plan.writes.length, mismatched: plan.mismatched });
  }
  // Stamped only when at least one page was recognised, so a fresh or local
  // database that carries none of production's rows is not marked as done.
  if (!found) {
    return [{ name: 'all landing pages', action: 'not applicable, none of the production rows exist on this database', written: 0, mismatched: [] }];
  }
  await db.query('INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING', [LANDING_PLAIN_MARKER, 'true']);
  return report;
}

module.exports = { LANDING_PLAIN_MARKER, GROUPS, OLD_STEP_3, NEW_STEP_3, applyLandingPlainCopy };
