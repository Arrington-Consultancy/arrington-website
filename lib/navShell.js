const db = require('../db/pool');
const { buildNavPages } = require('./mainNav');

function baseTemplate(instanceId) {
  if (typeof instanceId !== 'string') return null;
  const match = /^([a-z0-9]+)(?:__(\d+))?$/.exec(instanceId);
  return match ? match[1] : null;
}

// Builds the same navPages list and header/footer contact data that
// server.js's renderPage() computes for every CMS page, so the four
// standalone assessment tool routes (Owner Check, Owner Dependency Quiz,
// Commercial Gaps Review, Market Ready Test) and their result/recovery
// pages can render with the identical shared header/nav/footer instead of
// their own separate mini-header. Public-visitor view only (no canEdit/
// page_access branching) — these tool pages have no authenticated editing
// mode of their own, so they always render the same chrome a logged-out
// visitor sees on the main site.
async function getSiteShellData() {
  const { rows: allAccessRows } = await db.query('SELECT DISTINCT page_id FROM page_access');
  const restrictedPageIds = new Set(allAccessRows.map((r) => r.page_id));
  const { rows: allPagesRows } = await db.query(
    'SELECT id, slug, title, hidden, sort_order, show_in_nav, nav_label FROM pages ORDER BY sort_order, created_at'
  );
  const publicPages = allPagesRows.filter((p) => !p.hidden && !restrictedPageIds.has(p.id) && p.show_in_nav);

  // The same menu as renderPage() in server.js: lib/mainNav.js.
  const navPages = buildNavPages(publicPages);

  const { rows: contentRows } = await db.query(
    `SELECT section_key, content FROM content WHERE section_key IN
     ('contact.email', 'contact.phone', 'contact.whatsapp', 'contact.label', 'contact.heading', 'contact.body', 'footer.name')`
  );
  const content = {};
  contentRows.forEach((r) => { content[r.section_key] = r.content; });

  const plainText = (v) => String(v || '').replace(/<[^>]+>/g, '').trim();
  const pageContact = {
    headerCtaText: plainText(content['contact.label']) || 'Start a conversation',
    label: content['contact.label'],
    heading: content['contact.heading'],
    body: content['contact.body'],
    messagePlaceholder: 'Tell us what you are trying to build or change',
    submitText: 'Ask Tom to get in touch'
  };

  const { rows: websitesAndAiRows } = await db.query(
    "SELECT section_order FROM pages WHERE slug = 'websites-and-ai'"
  );
  const websitesAndAiOrder = Array.isArray(websitesAndAiRows[0]?.section_order)
    ? websitesAndAiRows[0].section_order
    : [];
  const wsaProofSection = websitesAndAiOrder.find((instanceId) => baseTemplate(instanceId) === 'casestudy2');
  const websiteBuildProofHref = wsaProofSection
    ? `/websites-and-ai#${wsaProofSection}`
    : '/websites-and-ai';

  return { navPages, content, pageContact, websiteBuildProofHref };
}

module.exports = { getSiteShellData };
