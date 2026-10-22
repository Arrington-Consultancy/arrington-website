// The Abacus and Falmouth Taxis story takes the VAT Intervention's place as
// the second proof on the home page (Tom's decision of 22/10/2026 on the
// homepage review: "The Abacus and Falmouth Taxis story replaces the VAT
// Intervention as the second proof on the home page. Full VAT case stays on
// Evidence.", approved words only).
//
// Approved words only, so nothing here is written: the heading is the first
// line of the Evidence page's Abacus heading ("Abacus and Falmouth Taxis"),
// the two paragraphs are the Cornwall landing page's Abacus section, which
// Tom approved on 11/10/2026 and which lib/cornwallExperienceSection.js holds
// (imported, not copied, so the two cannot drift apart), and the label and
// the "Read the full case study" link text are taken from the VAT instance
// being replaced. The link goes to the full Abacus case study on Evidence.
//
// The VAT Intervention is hidden, not deleted: it stays in the home page's
// section order, dimmed to a logged-in editor with the eye button to bring
// it back, the same treatment the "What we do" section got on 21/10/2026.
// Its content rows are untouched and the full case study stays on Evidence.
//
// Run once under a marker. The VAT instance is found by its live heading,
// never by an assumed id (production's home page ids differ from a local
// rebuild's). The new instance id is allocated against every page's section
// order and every content prefix, so an orphan's rows are never reused. The
// write to the page is guarded on the order and hidden list read, so a CMS
// change made while this runs wins and the next boot checks again.
'use strict';

const { COPY: CORNWALL } = require('./cornwallExperienceSection');

const MARKER = 'homepage.abacus_proof_2026-10-22';
const TEMPLATE = 'casestudy2';
const VAT_HEADING = 'the vat intervention';
const EVIDENCE_HEADING_FIRST_LINE = 'Abacus and Falmouth Taxis';
const EVIDENCE_LINK = '/evidence#biography__2';
// The live values on the VAT instance; used only if its rows are blank.
const FALLBACK_LABEL = 'Case study';
const FALLBACK_LINK_TEXT = 'Read the full case study';

const plain = (v) => String(v || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const unwrap = (p) => String(p || '').replace(/^\s*<p>/, '').replace(/<\/p>\s*$/, '').trim();
const baseOf = (id) => {
  const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
  return m ? m[1] : null;
};

// The rows the new instance carries, apart from label and link text (copied
// from the VAT instance at run time).
const ABACUS = Object.freeze({
  heading: EVIDENCE_HEADING_FIRST_LINE,
  intro: unwrap(CORNWALL.p1),
  body: unwrap(CORNWALL.p2),
  outcome: '',
  link_href: EVIDENCE_LINK
});

async function applyHomeAbacusProof(db) {
  const { rows: marker } = await db.query('SELECT 1 FROM content WHERE section_key = $1', [MARKER]);
  if (marker.length) return null;

  const { rows: home } = await db.query("SELECT section_order, hidden_sections FROM pages WHERE slug = 'main'");
  if (!home.length) return 'no home page on this database; nothing to do';
  const order = Array.isArray(home[0].section_order) ? home[0].section_order : [];
  const hidden = Array.isArray(home[0].hidden_sections) ? home[0].hidden_sections : [];

  const read = async (key) => {
    const { rows } = await db.query('SELECT content FROM content WHERE section_key = $1', [key]);
    return rows.length ? rows[0].content : null;
  };
  const stamp = () => db.query(
    'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
    [MARKER, new Date().toISOString()]
  );

  // Already there (added by hand in the CMS, say): adopt it, change nothing.
  for (const id of order) {
    if (plain(await read(`${id}.heading`)).toLowerCase() === EVIDENCE_HEADING_FIRST_LINE.toLowerCase()) {
      await stamp();
      return `the home page already carries the Abacus story (${id}); left alone`;
    }
  }

  let vatId = null;
  for (const id of order) {
    if (baseOf(id) !== TEMPLATE) continue;
    if (plain(await read(`${id}.heading`)).toLowerCase() === VAT_HEADING) { vatId = id; break; }
  }
  if (!vatId) {
    await stamp();
    return 'no VAT Intervention on the home page; nothing to do';
  }

  // Allocate against every page's sections and every content prefix.
  const used = new Set();
  const { rows: allOrders } = await db.query('SELECT section_order FROM pages');
  for (const r of allOrders) if (Array.isArray(r.section_order)) r.section_order.forEach((s) => used.add(s));
  const { rows: prefixes } = await db.query("SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content");
  prefixes.forEach((r) => used.add(r.instance_id));
  let id = null;
  for (let n = 2; !id && n <= 99; n++) if (!used.has(`${TEMPLATE}__${n}`)) id = `${TEMPLATE}__${n}`;
  if (!id) return `could not allocate a ${TEMPLATE} instance id; left alone`;

  const label = (await read(`${vatId}.label`)) || FALLBACK_LABEL;
  const linkText = (await read(`${vatId}.link_text`)) || FALLBACK_LINK_TEXT;
  const rows = { ...ABACUS, label, link_text: linkText };
  for (const field of Object.keys(rows)) {
    await db.query(
      'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
      [`${id}.${field}`, rows[field]]
    );
  }

  const at = order.indexOf(vatId);
  const nextOrder = [...order.slice(0, at), id, ...order.slice(at)];
  const nextHidden = hidden.includes(vatId) ? hidden : [...hidden, vatId];
  const { rowCount } = await db.query(
    "UPDATE pages SET section_order = $1::jsonb, hidden_sections = $2::jsonb WHERE slug = 'main' AND section_order = $3::jsonb AND hidden_sections = $4::jsonb",
    [JSON.stringify(nextOrder), JSON.stringify(nextHidden), JSON.stringify(order), JSON.stringify(hidden)]
  );
  if (!rowCount) return `the home page changed while this ran; ${id} rows written but not placed; the next boot checks again`;
  await stamp();
  return `Abacus story added as ${id} in place of ${vatId} (hidden, not deleted); order now [${nextOrder.join(', ')}]`;
}

module.exports = { MARKER, ABACUS, EVIDENCE_LINK, applyHomeAbacusProof };
