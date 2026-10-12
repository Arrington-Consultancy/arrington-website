// Cornwall landing page: a short section on Tom's own Cornwall business,
// directly beneath the page's opening hero (11/10/2026, Tom-approved
// direction, "Cornwall Landing Page Improvement" brief). Abacus and Falmouth
// Taxis was Tom's business in Falmouth, so it is the one piece of evidence
// that is local to this page's audience.
//
// The copy is the brief's proposed wording, used as written once each claim
// was checked against Tom's own records in Drive: he ran the business from
// 2006 to April 2025 (more than 18 years), it started as a small local
// operator, weekly bookings ran in the thousands, it had drivers, office staff
// and dispatch systems, and he sold it. One change only: "Abacus & Falmouth
// Taxis" is written "Abacus and Falmouth Taxis", the company's own name and
// the spelling used everywhere else on the site. No money figure, sale price
// or headcount is stated, and Abacus is never presented as a client.
//
// 12/10/2026, Tom ("limit use of real over use"): the live page read "real"
// four times in its first two screens (hero, this heading, the proof block's
// "Real commercial experience" label and its "real consequences" heading).
// Two are taken out by deletion only, no new words: "real" from this
// heading, and the proof block's label on this page. applyCornwallRealTrim
// moves an existing database; COPY carries the trimmed heading for a fresh one.
//
// The page is a CMS page, so the section is a new `filter` instance (heading
// and two paragraphs, no button, the same block the home page uses straight
// after its hero) on a freshly allocated id, inserted after the first hero.
// Nothing already on the page is edited. Run once, under a marker; the
// marker is stamped only when the page was found, so a database without the
// Cornwall page is not marked as done.
'use strict';

const MARKER = 'site.cornwall_experience_section_2026-10-11';
const SLUG = 'business-consultant-cornwall';

const COPY = Object.freeze({
  label: '',
  heading: 'Built on business experience in Cornwall',
  p1: '<p>Before starting Arrington Consultancy, Tom spent more than 18 years building and running Abacus and Falmouth Taxis. What began as a relatively small operation grew into a business handling thousands of bookings each week, with drivers, office staff, vehicles and systems to manage.</p>',
  p2: '<p>He eventually sold the business. That experience shapes how Arrington Consultancy works today: understanding where the pressure sits, getting better control of the numbers and making the business less dependent on its owner.</p>',
  button_text: '',
  button_link: ''
});

const baseOf = (id) => {
  const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
  return m ? m[1] : null;
};

async function applyCornwallExperienceSection(db) {
  const { rows: marker } = await db.query('SELECT 1 FROM content WHERE section_key = $1', [MARKER]);
  if (marker.length) return null;

  const { rows: pageRows } = await db.query('SELECT section_order FROM pages WHERE slug = $1', [SLUG]);
  if (!pageRows.length) return 'no Cornwall page on this database; nothing to do';
  const order = Array.isArray(pageRows[0].section_order) ? pageRows[0].section_order : [];

  const stamp = () => db.query(
    'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
    [MARKER, new Date().toISOString()]
  );

  // Already there (added by hand in the CMS, say): adopt it, change nothing.
  const { rows: same } = await db.query(
    "SELECT section_key FROM content WHERE section_key LIKE '%.heading' AND content = $1 AND split_part(section_key, '.', 1) = ANY($2::text[])",
    [COPY.heading, order]
  );
  if (same.length) {
    await stamp();
    return `the page already carries this section (${same[0].section_key.split('.')[0]}); left alone`;
  }

  const heroAt = order.findIndex((id) => baseOf(id) === 'hero');
  if (heroAt === -1) {
    await stamp();
    return 'the page has no hero to place the section under; left alone';
  }

  // Allocate against every page's sections and every content prefix, so an
  // orphaned instance's rows are never reused.
  const used = new Set();
  const { rows: allOrders } = await db.query('SELECT section_order FROM pages');
  for (const r of allOrders) if (Array.isArray(r.section_order)) r.section_order.forEach((s) => used.add(s));
  const { rows: prefixes } = await db.query("SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content");
  prefixes.forEach((r) => used.add(r.instance_id));
  let id = null;
  if (!used.has('filter')) id = 'filter';
  for (let n = 2; !id && n <= 99; n++) if (!used.has(`filter__${n}`)) id = `filter__${n}`;
  if (!id) return 'could not allocate a filter instance id; left alone';

  for (const field of Object.keys(COPY)) {
    await db.query(
      'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
      [`${id}.${field}`, COPY[field]]
    );
  }
  const next = [...order.slice(0, heroAt + 1), id, ...order.slice(heroAt + 1)];
  // Only if the order is still what was read, so a concurrent CMS change wins.
  const { rowCount } = await db.query(
    'UPDATE pages SET section_order = $1::jsonb WHERE slug = $2 AND section_order = $3::jsonb',
    [JSON.stringify(next), SLUG, JSON.stringify(order)]
  );
  if (!rowCount) return `the page order changed while this ran; ${id} rows written but not placed here; the next boot checks again`;
  await stamp();
  return `section added as ${id} after ${order[heroAt]}; order now [${next.join(', ')}]`;
}

const TRIM_MARKER = 'site.cornwall_real_trim_2026-10-12';
const OLD_HEADING = 'Built on real business experience in Cornwall';
const OLD_LABEL_TEXT = 'Real commercial experience';
const stripTags = (h) => String(h || '').replace(/<[^>]+>/g, '').trim();

// Deletion only, guarded on the exact value read: a CMS edit since wins and
// its live value is logged rather than guessed at. Only the Cornwall page's
// own instances are touched; every other page is never read for a write.
async function applyCornwallRealTrim(db) {
  const { rows: marker } = await db.query('SELECT 1 FROM content WHERE section_key = $1', [TRIM_MARKER]);
  if (marker.length) return null;
  const { rows: pageRows } = await db.query('SELECT section_order FROM pages WHERE slug = $1', [SLUG]);
  if (!pageRows.length) return 'no Cornwall page on this database; nothing to do';
  const order = Array.isArray(pageRows[0].section_order) ? pageRows[0].section_order : [];
  const read = async (key) => {
    const { rows } = await db.query('SELECT content FROM content WHERE section_key = $1', [key]);
    return rows.length ? rows[0].content : null;
  };
  const notes = [];

  let headingNote = 'section heading not found on the page; left alone';
  for (const id of order.filter((x) => baseOf(x) === 'filter')) {
    const live = await read(`${id}.heading`);
    if (live === OLD_HEADING) {
      const { rowCount } = await db.query(
        'UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3',
        [COPY.heading, `${id}.heading`, OLD_HEADING]
      );
      headingNote = rowCount ? `${id}: heading now "${COPY.heading}"` : `${id}: heading changed while this ran; left alone`;
      break;
    }
    if (live === COPY.heading) { headingNote = `${id}: heading already trimmed`; break; }
  }
  notes.push(headingNote);

  const caseId = order.find((id) => baseOf(id) === 'casestudy');
  if (!caseId) {
    notes.push('no proof block on the page; label left alone');
  } else {
    const live = await read(`${caseId}.label`);
    if (live === null || stripTags(live) === '') {
      notes.push(`${caseId}: label already empty`);
    } else if (stripTags(live) === OLD_LABEL_TEXT) {
      const { rowCount } = await db.query(
        "UPDATE content SET content = '' WHERE section_key = $1 AND content = $2",
        [`${caseId}.label`, live]
      );
      notes.push(rowCount ? `${caseId}: "${OLD_LABEL_TEXT}" label removed` : `${caseId}: label changed while this ran; left alone`);
    } else {
      notes.push(`${caseId}: label left alone, live value ${JSON.stringify(live)}`);
    }
  }

  await db.query(
    'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
    [TRIM_MARKER, new Date().toISOString()]
  );
  return notes.join('; ');
}

module.exports = { MARKER, SLUG, COPY, applyCornwallExperienceSection, TRIM_MARKER, OLD_HEADING, applyCornwallRealTrim };
