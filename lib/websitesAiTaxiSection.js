// Websites and AI page: a section for taxi and private hire firms (Tom,
// 16/10/2026: "Website page needs our new taxi page on there as well").
// /websites-and-ai is where the website and AI offer is explained, and the
// taxi pages are the clearest worked example of both, so the section points
// at /taxi-and-private-hire-operators/websites, which links on to the demo
// site and its staff portal.
//
// Copy follows the Brand OS (read 16/10/2026): "we" for Arrington, Tom's own
// story in the third person, no dashes, none of the avoided words, AI
// introduced as something that does work inside the firm's rules with a
// person deciding, never as the hook. Facts only from pages already live:
// nearly twenty years running Abacus and Falmouth Taxis (Evidence case
// study), bookings into the firm's own dispatch system where it has a booking
// API (the £999 page's own qualifier), and the office demo as built.
//
// The page is a CMS page whose seed chain is gated (lib/waiSeedMode.js), so
// this does not touch that chain: it adds one new intervention instance on a
// freshly allocated id, placed just before the page's closing call to action
// when the last section is an intervention, otherwise at the end. Nothing on
// the page is edited. Run once under a marker, stamped only when the page was
// found. A section with the same heading already on the page is adopted.
//
// The same trap as every code-route link: button_link holds a path the CMS
// dropdown does not list, so saving this section in the CMS repoints its
// button. The renderer accepts the path (views/index.ejs, _validSlug).
'use strict';

const MARKER = 'websites-and-ai.taxi_section_2026-10-16';
const SLUG = 'websites-and-ai';
const TARGET = 'taxi-and-private-hire-operators/websites';

const COPY = Object.freeze({
  label: 'Taxi and private hire',
  heading: 'Built for taxi and private hire firms',
  subtext: "<p>Tom ran Abacus and Falmouth Taxis for nearly twenty years, so we build taxi websites that take the booking with the price and pass it into your own dispatch system, where it has a booking API. We've also built a working example of the office behind it, where AI workers read the booking emails and complaints, check them against dispatch and draft the replies, and a person in the office decides what goes out.</p>",
  button_text: 'See the taxi websites',
  button_link: TARGET
});

const baseOf = (id) => {
  const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
  return m ? m[1] : null;
};

async function applyWebsitesAiTaxiSection(db) {
  const { rows: marker } = await db.query('SELECT 1 FROM content WHERE section_key = $1', [MARKER]);
  if (marker.length) return null;

  const { rows: pageRows } = await db.query('SELECT section_order FROM pages WHERE slug = $1', [SLUG]);
  if (!pageRows.length) return 'no Websites and AI page on this database; nothing to do';
  const order = Array.isArray(pageRows[0].section_order) ? pageRows[0].section_order : [];

  const stamp = () => db.query(
    'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
    [MARKER, new Date().toISOString()]
  );

  const { rows: same } = await db.query(
    "SELECT section_key FROM content WHERE (section_key LIKE '%.heading' AND content = $1 OR section_key LIKE '%.button_link' AND content = $2) AND split_part(section_key, '.', 1) = ANY($3::text[])",
    [COPY.heading, TARGET, order]
  );
  if (same.length) {
    await stamp();
    return `the page already carries a taxi section (${same[0].section_key.split('.')[0]}); left alone`;
  }

  const used = new Set();
  const { rows: allOrders } = await db.query('SELECT section_order FROM pages');
  for (const r of allOrders) if (Array.isArray(r.section_order)) r.section_order.forEach((s) => used.add(s));
  const { rows: prefixes } = await db.query("SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content");
  prefixes.forEach((r) => used.add(r.instance_id));
  let id = null;
  if (!used.has('intervention')) id = 'intervention';
  for (let n = 2; !id && n <= 99; n++) if (!used.has(`intervention__${n}`)) id = `intervention__${n}`;
  if (!id) return 'could not allocate an intervention instance id; left alone';

  for (const field of Object.keys(COPY)) {
    await db.query(
      'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
      [`${id}.${field}`, COPY[field]]
    );
  }
  const last = order.length ? order[order.length - 1] : null;
  const beforeClose = last && baseOf(last) === 'intervention';
  const next = beforeClose ? [...order.slice(0, -1), id, last] : [...order, id];
  const { rowCount } = await db.query(
    'UPDATE pages SET section_order = $1::jsonb WHERE slug = $2 AND section_order = $3::jsonb',
    [JSON.stringify(next), SLUG, JSON.stringify(order)]
  );
  if (!rowCount) return `the page order changed while this ran; ${id} rows written but not placed; the next boot checks again`;
  await stamp();
  return `section added as ${id} ${beforeClose ? `before the closing ${last}` : 'at the end'} -> /${TARGET}`;
}

module.exports = { MARKER, SLUG, TARGET, COPY, applyWebsitesAiTaxiSection };
