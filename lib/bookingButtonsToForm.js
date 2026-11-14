// Section buttons that led to the separate 30 Minute Conversation page now
// open the enquiry form on the page the visitor is already reading
// (14/11/2026, Tom: "make the improvements you think are right", after an
// outside review of the site).
//
// The same move Tom has already made three times: both Ready to Sell buttons
// (11/10/2026), the Commercial Review button and the menu's Contact link
// (21/10/2026). A button that says "talk to us" and then loads another page,
// whose own form is several screens down, costs a step for nothing: every
// page carries the form in its footer. The 30 Minute Conversation page itself
// is untouched and stays live at its address.
//
// What is changed: the `button_link` of an intervention or filter section
// that is on a page (in its section_order), on any page but the booking page,
// and only while the value is exactly the booking page's slug. An empty link
// already means "the form on this page" in both templates, and keeps the gold
// button. Nothing else in the section is read or written, so a button Tom has
// pointed somewhere else stays where he pointed it.
//
// Run once under a marker; the boot log names every button moved.
'use strict';

const MARKER = 'site.booking_buttons_to_form_2026-11-14';
const BOOKING_SLUG = 'book-a-30-minute-conversation';
const TEMPLATES = new Set(['intervention', 'filter']);

const baseOf = (id) => {
  const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
  return m ? m[1] : null;
};

async function applyBookingButtonsToForm(db) {
  const { rows: marker } = await db.query('SELECT 1 FROM content WHERE section_key = $1', [MARKER]);
  if (marker.length) return null;

  const { rows: pages } = await db.query('SELECT slug, section_order FROM pages WHERE slug <> $1 ORDER BY sort_order, slug', [BOOKING_SLUG]);
  const moved = [];
  for (const page of pages) {
    const order = Array.isArray(page.section_order) ? page.section_order : [];
    for (const iid of order) {
      if (!TEMPLATES.has(baseOf(iid))) continue;
      const { rowCount } = await db.query(
        'UPDATE content SET content = $1 WHERE section_key = $2 AND btrim(content) = $3',
        ['', `${iid}.button_link`, BOOKING_SLUG]
      );
      if (rowCount) moved.push(`${page.slug}: ${iid}`);
    }
  }

  await db.query(
    'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
    [MARKER, new Date().toISOString()]
  );
  return moved.length
    ? `${moved.length} button(s) now open the form on their own page (${moved.join('; ')})`
    : 'no section button pointed at the 30 Minute Conversation page; nothing to do';
}

module.exports = { MARKER, BOOKING_SLUG, applyBookingButtonsToForm };
