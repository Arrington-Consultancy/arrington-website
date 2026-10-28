// The home page's three-tile proof strip comes off (Tom, 28/10/2026, "Yes fix
// all of the above" on the critical sweep of the three offer release).
//
// The strip sits inside the "Built from running real businesses for over 20
// years." block, directly under the Abacus and Falmouth Taxis case study that
// took the VAT Intervention's place on 22/10/2026. Its first tile reads
// "Built and exited: Abacus and Falmouth Taxis" and its second "Turned
// around: Devon marine firm", so the page said Abacus three times in a row
// and restated both case studies above it. Before 22/10 it restated one.
//
// The tiles are CMS rows on that filter instance (`row_N_action` and
// `row_N_client`), and the template falls back to the instance's `p2` when
// the rows are blank. On production `p2` holds the same three lines as text
// (the July 2026 form of the strip), so clearing the rows alone would print
// them again as a paragraph. Both are cleared, each guarded on the value
// read, so anything Tom has edited since is left exactly as it is and the
// boot log says what was found. The block keeps its heading, its paragraph
// and its "Read what we have done" button, which still leads to Evidence,
// where all three pieces of proof live in full.
//
// Run once under a marker. The instance is found by its live heading, never
// by an assumed id.
'use strict';

const MARKER = 'homepage.proof_strip_2026-10-28';
const HEADING = 'Built from running real businesses for over 20 years.';
const ROWS = [
  ['Built and exited', 'Abacus and Falmouth Taxis'],
  ['Turned around', 'Devon marine firm'],
  ['Improved margin', 'South West aesthetic clinics']
];
const P2_OPENS = 'Built and exited: Abacus and Falmouth Taxis';

const plain = (v) => String(v || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const baseOf = (id) => {
  const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
  return m ? m[1] : null;
};

async function applyHomeProofStrip(db) {
  const { rows: marker } = await db.query('SELECT 1 FROM content WHERE section_key = $1', [MARKER]);
  if (marker.length) return null;

  const { rows: home } = await db.query("SELECT section_order FROM pages WHERE slug = 'main'");
  if (!home.length) return 'no home page on this database; nothing to do';
  const order = Array.isArray(home[0].section_order) ? home[0].section_order : [];

  const read = async (key) => {
    const { rows } = await db.query('SELECT content FROM content WHERE section_key = $1', [key]);
    return rows.length ? rows[0].content : null;
  };
  const stamp = () => db.query(
    'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
    [MARKER, new Date().toISOString()]
  );

  let id = null;
  for (const iid of order) {
    if (baseOf(iid) !== 'filter') continue;
    if (plain(await read(`${iid}.heading`)).toLowerCase() === HEADING.toLowerCase()) { id = iid; break; }
  }
  if (!id) {
    await stamp();
    return `no "${HEADING}" block on the home page; nothing to do`;
  }

  // Read everything first, then decide. A value that is not the one the
  // strip was built with is Tom's and stays.
  const live = {};
  for (let n = 1; n <= 3; n++) {
    live[`${id}.row_${n}_action`] = await read(`${id}.row_${n}_action`);
    live[`${id}.row_${n}_client`] = await read(`${id}.row_${n}_client`);
  }
  live[`${id}.p2`] = await read(`${id}.p2`);

  const unexpected = [];
  ROWS.forEach(([action, client], i) => {
    const n = i + 1;
    const a = live[`${id}.row_${n}_action`];
    const c = live[`${id}.row_${n}_client`];
    if (plain(a) && plain(a) !== action) unexpected.push(`row_${n}_action "${plain(a)}"`);
    if (plain(c) && plain(c) !== client) unexpected.push(`row_${n}_client "${plain(c)}"`);
  });
  const p2 = plain(live[`${id}.p2`]);
  if (p2 && !p2.startsWith(P2_OPENS)) unexpected.push(`p2 "${p2.slice(0, 80)}"`);
  if (unexpected.length) {
    await stamp();
    return `${id}: left alone, a value is not the strip's own: ${unexpected.join('; ')}`;
  }

  const toClear = Object.keys(live).filter((k) => plain(live[k]));
  if (!toClear.length) {
    await stamp();
    return `${id}: the strip and its fallback line were already clear`;
  }

  let cleared = 0;
  for (const key of toClear) {
    const { rowCount } = await db.query(
      'UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3',
      ['', key, live[key]]
    );
    if (!rowCount) return `${id}: ${key} changed while this ran; ${cleared} value(s) cleared so far, the next boot checks again`;
    cleared += 1;
  }
  await stamp();
  return `${id}: ${cleared} value(s) cleared (the three tiles and the fallback line); the block now reads heading, paragraph and button`;
}

module.exports = { MARKER, HEADING, ROWS, P2_OPENS, applyHomeProofStrip };
