// The site's 404 renderer, extracted so that any area which needs to
// deny the existence of a path produces exactly the same response as a
// genuinely missing one.
//
// Governance finding F8 (30/08/2026): the workspace rendered its own
// 404 with an empty navigation list and a hardcoded theme, which made a
// workspace path measurably distinguishable from a path that does not
// exist. A denial that looks different from the real thing is not a
// denial. Both callers now share this.
const db = require('../db/pool');
const themes = require('../db/themes');

async function render404(req, res) {
  if (!req.accepts('html')) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const { rows: allAccessRows } = await db.query('SELECT DISTINCT page_id FROM page_access');
    const restrictedPageIds = new Set(allAccessRows.map((r) => r.page_id));
    const { rows: pageRows } = await db.query(
      'SELECT id, slug, title, nav_label, hidden, show_in_nav FROM pages ORDER BY sort_order, created_at'
    );
    const pages = pageRows.filter((p) => !p.hidden && !restrictedPageIds.has(p.id) && p.show_in_nav);
    const { rows: themeRows } = await db.query(
      "SELECT content FROM content WHERE section_key = 'site.theme'"
    );
    const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
    const theme = themes[activeTheme] || themes.dark;
    res.status(404).render('404', { pages, theme });
  } catch (err) {
    // Deliberate change of behaviour on extraction: the old inline
    // version sent bare text here. It now renders the same view with an
    // empty navigation, so that when the database is unreachable a
    // workspace denial and a genuine 404 are still the same response.
    // A fallback that differs is a fallback that leaks.
    console.error('404 handler failed:', err.message);
    res.status(404).render('404', { pages: [], theme: themes.dark });
  }
}

module.exports = { render404 };
