// The database half of Tom's three offer decision (21/10/2026, "DECISION AND
// PLAN - Simplify to three offers", Drive 1_63u0CLmytc0Iz8GOjkeJGDB9WP4-g_qBQbVUYAVW6g).
// The code half is lib/mainNav.js (the menu and the home page offer boxes).
//
// 1. The menu is the three offers, About and Contact. CMS pages reach the
//    menu through their own Show in nav setting, so every page with it on,
//    other than the home page and About Us, has it turned off: What We Do,
//    Evidence and the 30 Minute Conversation page on the live site. Nothing
//    else about those pages changes; they stay public, indexed and in the
//    sitemap, and Tom can turn any of them back on in Reorder & navigation.
// 2. The home page's "What we do" section (the base `filter` instance, the
//    one whose label reads "What we do") is hidden from the public, because
//    the offer boxes now sit where it led. Hidden, not deleted: it shows
//    dimmed to a logged-in editor, and the eye button brings it back.
//
// Run once under a marker. Each write is guarded on what it read, and the
// result says what moved, so a deploy log shows the live outcome.
'use strict';

const MARKER = 'site.three_offers_2026-10-21';
const KEEP_IN_NAV = ['main', 'about-us'];
const HOME_SECTION = 'filter';

const plain = (v) => String(v || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

async function applyThreeOffersSite(db) {
  const { rows: marker } = await db.query('SELECT 1 FROM content WHERE section_key = $1', [MARKER]);
  if (marker.length) return null;

  const notes = [];

  const { rows: moved } = await db.query(
    'UPDATE pages SET show_in_nav = false WHERE show_in_nav = true AND NOT (slug = ANY($1::text[])) RETURNING slug',
    [KEEP_IN_NAV]
  );
  notes.push(moved.length
    ? `out of the menu: ${moved.map((r) => r.slug).sort().join(', ')}`
    : 'no CMS page besides About Us was in the menu');

  const { rows: home } = await db.query("SELECT section_order, hidden_sections FROM pages WHERE slug = 'main'");
  if (!home.length) {
    notes.push('no home page on this database');
  } else {
    const order = Array.isArray(home[0].section_order) ? home[0].section_order : [];
    const hidden = Array.isArray(home[0].hidden_sections) ? home[0].hidden_sections : [];
    const { rows: label } = await db.query('SELECT content FROM content WHERE section_key = $1', [`${HOME_SECTION}.label`]);
    if (!order.includes(HOME_SECTION)) {
      notes.push('the home page has no What we do section; nothing hidden');
    } else if (hidden.includes(HOME_SECTION)) {
      notes.push('What we do was already hidden');
    } else if (!label.length || plain(label[0].content) !== 'what we do') {
      notes.push(`the home page filter section is labelled "${label.length ? plain(label[0].content) : ''}", not What we do; left alone`);
    } else {
      const { rowCount } = await db.query(
        "UPDATE pages SET hidden_sections = $1::jsonb WHERE slug = 'main' AND hidden_sections = $2::jsonb",
        [JSON.stringify([...hidden, HOME_SECTION]), JSON.stringify(hidden)]
      );
      notes.push(rowCount ? 'home page What we do section hidden' : 'the home page changed while this ran; What we do not hidden, the next boot checks again');
      if (!rowCount) return notes.join('; ');
    }
  }

  await db.query(
    'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
    [MARKER, new Date().toISOString()]
  );
  return notes.join('; ');
}

module.exports = { MARKER, KEEP_IN_NAV, applyThreeOffersSite };
