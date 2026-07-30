// One-off, read-only inspection script — NOT part of the app's runtime.
//
// Purpose: answer "what is actually live on What We Have Done, What the
// Work Looks Like, and What Business Owners Say" before merging them into
// a new Evidence page, including whether testimonials are now driven by
// the live Google Reviews feed rather than static content. This sandbox has
// no network path to Railway or the live site, so this runs inside a
// GitHub Action (which does have that path via the Railway CLI/token) and
// prints everything to the job's own log. Read-only: no INSERT/UPDATE/
// DELETE anywhere in this file. Safe to delete once the Evidence merge is
// designed and built.
//
// Usage (inside a GitHub Action step, via `railway run`):
//   railway run --service <service> --environment production -- node scripts/inspect-evidence-pages.js

const db = require('../db/pool');

const VALID_TEMPLATES = ['hero','credentials','biography','intervention','approach','insights','fourcards','documents','casestudy','casestudy2','assessment','filter','proofstrip','contact','googlereviews'];
const baseOf = (id) => {
  const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
  return m && VALID_TEMPLATES.includes(m[1]) ? m[1] : null;
};

const TARGET_SLUGS = ['what-we-have-done', 'what-the-work-looks-like', 'what-business-owners-say'];

async function main() {
  const { rows: pages } = await db.query(
    `SELECT id, slug, title, nav_label, show_in_nav, hidden, noindex, sort_order,
            section_order, hidden_sections, deleted_sections,
            meta_title, meta_description, canonical_url
     FROM pages WHERE slug = ANY($1) ORDER BY sort_order`,
    [TARGET_SLUGS]
  );

  console.log('=== PAGES FOUND ===');
  console.log(JSON.stringify(pages.map(p => ({
    slug: p.slug, title: p.title, nav_label: p.nav_label, show_in_nav: p.show_in_nav,
    hidden: p.hidden, noindex: p.noindex, sort_order: p.sort_order,
    section_order: p.section_order, hidden_sections: p.hidden_sections,
    deleted_sections: p.deleted_sections, meta_title: p.meta_title,
    meta_description: p.meta_description, canonical_url: p.canonical_url
  })), null, 2));

  const missing = TARGET_SLUGS.filter(s => !pages.some(p => p.slug === s));
  if (missing.length) {
    console.log('=== SLUGS NOT FOUND (may be renamed) ===');
    console.log(JSON.stringify(missing));
    const { rows: allSlugs } = await db.query('SELECT slug, title FROM pages ORDER BY sort_order');
    console.log('=== ALL LIVE PAGE SLUGS (for cross-reference) ===');
    console.log(JSON.stringify(allSlugs, null, 2));
  }

  for (const page of pages) {
    const order = Array.isArray(page.section_order) ? page.section_order : [];
    console.log(`\n=== SECTIONS ON "${page.slug}" ===`);
    console.log(JSON.stringify(order.map(iid => ({ instance: iid, template: baseOf(iid) })), null, 2));

    const hasGoogleReviews = order.some(iid => baseOf(iid) === 'googlereviews');
    console.log(`--- Contains a googlereviews instance: ${hasGoogleReviews} ---`);

    for (const iid of order) {
      const tpl = baseOf(iid);
      if (!tpl) { console.log(`  (skipping unrecognised instance id: ${iid})`); continue; }
      const prefixes = tpl === 'credentials' ? [`${iid}_oxford`, `${iid}_stat`] : [iid];
      for (const prefix of prefixes) {
        const { rows: contentRows } = await db.query(
          `SELECT section_key, content, updated_at FROM content WHERE section_key LIKE $1 ORDER BY section_key`,
          [`${prefix}.%`]
        );
        console.log(`\n--- content for "${prefix}" (template: ${tpl}) ---`);
        console.log(JSON.stringify(contentRows, null, 2));
      }
    }
  }

  console.log('\n=== DONE ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Inspection script failed:', err);
  process.exit(1);
});
