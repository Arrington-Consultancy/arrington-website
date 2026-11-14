// The World Student Advisors case study on Evidence.
//
// The figures and the period are Tom's own, in chat on 14/11/2026: "I've
// taken him getting one cold lead a month to 30 to 40 a day. He's revenue has
// increased 159%", "June till now, everything I have done for the including
// commercial review", then "30 a day is better. Revenue is estimated to rise
// by 250% but timings of payments meant the moment I can only claim 159%".
// So the page says around 30 a day and 159%. The 250% is an estimate and is
// NOT published: the Brand OS case study standard does not allow an expected
// outcome to be stated as one that has happened. What was built comes from
// the master CV v2 (8 September 2026) and the WSA Website Worker Handover (17
// August 2026). What the Commercial Review found is not stated, because no
// record says. Draft and sources: Drive, "WEBSITE AND HOSTING PROPOSAL -
// World Student Advisors case study, 14 November 2026".
//
// Run once under a marker. The new instance id is allocated against every
// page's section order and every content prefix, the label continues the
// Evidence page's own numbered series, and the section goes directly after
// the last case study there. The page write is guarded on the order read, so
// a CMS change made while this runs wins and the next boot checks again. The
// marker row holds the allocated id: that is how the Commercial Review and
// Website Build pages find the section without matching on wording Tom may
// later edit in the CMS.
'use strict';

const MARKER = 'evidence.wsa_case_study_2026-11-14';
const TEMPLATE = 'casestudy2';

const COPY = Object.freeze({
  heading: 'From one cold enquiry a month to around 30 a day',
  intro: 'World Student Advisors places students with schools and universities worldwide. In June 2026 it was getting about one enquiry a month from someone it did not already know.',
  body: 'The work included a Commercial Review, and then the building. We rebuilt the website around the enquiry and connected it to the CRM, so every enquiry arrives with where it came from. The advertising is now judged on enquiries received, not on clicks. We also built a staff workspace, with AI tools in it to support the team who deal with those enquiries.',
  outcome: 'Since June 2026, cold enquiries have gone from about one a month to around 30 a day, and <strong>revenue is up 159%</strong>.<br /><br />Published with the agreement of World Student Advisors.',
  button_text: 'View the World Student Advisors website',
  button_href: 'https://www.worldstudentadvisors.com/'
});

// The line the Commercial Review page adds under the live result.
const REVIEW_LINE = 'The work included a Commercial Review.';

const plain = (v) => String(v || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// The result sentence as it stands on Evidence now: the outcome row up to its
// first line break, tags removed. Read live so a figure Tom changes in the
// CMS changes everywhere it is quoted.
function resultSentence(outcome) {
  const first = String(outcome || '').split(/<br\s*\/?>/i)[0];
  return plain(first).replace(/\s+([.,])/g, '$1');
}

async function applyWsaCaseStudy(db) {
  const { rows: marker } = await db.query('SELECT 1 FROM content WHERE section_key = $1', [MARKER]);
  if (marker.length) return null;

  const { rows: pages } = await db.query('SELECT slug, section_order FROM pages');
  const evidence = pages.find((p) => p.slug === 'evidence');
  // No Evidence page (a fresh database): wait, without stamping.
  if (!evidence || !Array.isArray(evidence.section_order)) return 'no evidence page on this database; nothing to do';
  const order = evidence.section_order;

  const read = async (key) => {
    const { rows } = await db.query('SELECT content FROM content WHERE section_key = $1', [key]);
    return rows.length ? rows[0].content : null;
  };
  const stamp = (id) => db.query(
    'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
    [MARKER, id]
  );

  // Already there (added by hand in the CMS, say): adopt it, change nothing.
  for (const id of order) {
    if (plain(await read(`${id}.heading`)).toLowerCase() === COPY.heading.toLowerCase()) {
      await stamp(id);
      return `Evidence already carries the case study (${id}); left alone`;
    }
  }

  const used = new Set();
  for (const p of pages) if (Array.isArray(p.section_order)) p.section_order.forEach((s) => used.add(s));
  const { rows: prefixes } = await db.query("SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content");
  prefixes.forEach((r) => used.add(r.instance_id));
  let id = null;
  for (let n = 2; !id && n <= 99; n++) if (!used.has(`${TEMPLATE}__${n}`)) id = `${TEMPLATE}__${n}`;
  if (!id) return `could not allocate a ${TEMPLATE} instance id; left alone`;

  // Continue the page's own numbered series; a plain label if it is gone.
  let highest = 0;
  for (const s of order) {
    const m = /evidence:\s*(\d+)/i.exec(plain(await read(`${s}.label`)));
    if (m) highest = Math.max(highest, parseInt(m[1], 10));
  }
  const label = highest > 0
    ? `<strong>EVIDENCE: ${String(highest + 1).padStart(2, '0')}</strong>`
    : '<strong>Case study</strong>';

  const rows = { label, ...COPY };
  for (const field of Object.keys(rows)) {
    await db.query(
      'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
      [`${id}.${field}`, rows[field]]
    );
  }

  let lastCase = -1;
  order.forEach((s, i) => { if (/^casestudy2?(?:__\d+)?$/.test(s)) lastCase = i; });
  const at = lastCase === -1 ? order.length : lastCase + 1;
  const next = [...order.slice(0, at), id, ...order.slice(at)];
  const { rowCount } = await db.query(
    "UPDATE pages SET section_order = $1::jsonb WHERE slug = 'evidence' AND section_order = $2::jsonb",
    [JSON.stringify(next), JSON.stringify(order)]
  );
  if (!rowCount) return `the Evidence page changed while this ran; ${id} rows written but not placed; the next boot checks again`;
  await stamp(id);
  return `case study added to Evidence as ${id} (${plain(label)}) at position ${at}`;
}

// For the pages that quote it: where the case study is and what its result
// line says now. Null when it is not on Evidence, is hidden there, or has no
// result, so a page never quotes a case study a visitor cannot open.
async function readWsaCaseStudy(db) {
  const { rows: marker } = await db.query('SELECT content FROM content WHERE section_key = $1', [MARKER]);
  const id = marker.length ? String(marker[0].content || '').trim() : '';
  if (!/^casestudy2(?:__\d+)?$/.test(id)) return null;
  const { rows: page } = await db.query("SELECT section_order, hidden_sections FROM pages WHERE slug = 'evidence'");
  if (!page.length) return null;
  const order = Array.isArray(page[0].section_order) ? page[0].section_order : [];
  const hidden = Array.isArray(page[0].hidden_sections) ? page[0].hidden_sections : [];
  if (!order.includes(id) || hidden.includes(id)) return null;
  const { rows: outcome } = await db.query('SELECT content FROM content WHERE section_key = $1', [`${id}.outcome`]);
  const result = resultSentence(outcome.length ? outcome[0].content : '');
  if (!result) return null;
  return { href: `/evidence#${id}`, result };
}

module.exports = { MARKER, COPY, REVIEW_LINE, resultSentence, applyWsaCaseStudy, readWsaCaseStudy };
