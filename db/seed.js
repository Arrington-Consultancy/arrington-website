const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('./pool');
const defaults = require('./defaults');
const { ARTICLES: UT_ARTICLES } = require('../lib/usefulThinkingArticles');

const BCRYPT_ROUNDS = 12;

async function seed() {
  console.log('Running database seed...');

  // Create tables
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(schema);
  console.log('Tables created/verified.');

  // Migration: add per-page SEO columns to an existing pages table. The
  // CREATE TABLE IF NOT EXISTS above only adds them on a fresh DB, so existing
  // deployments need these ALTERs. All idempotent (IF NOT EXISTS).
  await db.query(`
    ALTER TABLE pages ADD COLUMN IF NOT EXISTS meta_title       VARCHAR(255) NOT NULL DEFAULT '';
    ALTER TABLE pages ADD COLUMN IF NOT EXISTS meta_description TEXT         NOT NULL DEFAULT '';
    ALTER TABLE pages ADD COLUMN IF NOT EXISTS meta_keywords    TEXT         NOT NULL DEFAULT '';
    ALTER TABLE pages ADD COLUMN IF NOT EXISTS og_title         VARCHAR(255) NOT NULL DEFAULT '';
    ALTER TABLE pages ADD COLUMN IF NOT EXISTS og_description   TEXT         NOT NULL DEFAULT '';
    ALTER TABLE pages ADD COLUMN IF NOT EXISTS og_image         TEXT         NOT NULL DEFAULT '';
    ALTER TABLE pages ADD COLUMN IF NOT EXISTS canonical_url    TEXT         NOT NULL DEFAULT '';
    ALTER TABLE pages ADD COLUMN IF NOT EXISTS noindex          BOOLEAN      NOT NULL DEFAULT false;
  `);
  console.log('Page SEO columns verified.');

  // Migration: per-page navigation settings, added 22/07/2026. Defaults
  // preserve current behaviour exactly (show_in_nav true, nav_label empty
  // so the nav falls back to the page's existing title) — this migration
  // is inert on any page until someone explicitly changes a value.
  await db.query(`
    ALTER TABLE pages ADD COLUMN IF NOT EXISTS show_in_nav BOOLEAN      NOT NULL DEFAULT true;
    ALTER TABLE pages ADD COLUMN IF NOT EXISTS nav_label   VARCHAR(200) NOT NULL DEFAULT '';
  `);
  console.log('Page navigation columns verified.');

  // Migration: Market Ready Test's free-text context box, added 26/07/2026
  // with the deterministic-scoring rebuild. Existing rows default to empty.
  await db.query(`
    ALTER TABLE market_ready_submissions ADD COLUMN IF NOT EXISTS context TEXT NOT NULL DEFAULT '';
  `);
  console.log('Market Ready Test context column verified.');

  // Migrate users CHECK constraint to include 'client' role
  await db.query(`
    DO $$ BEGIN
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'content', 'client'));
    EXCEPTION WHEN others THEN NULL;
    END $$;
  `);

  // Seed default role permissions (idempotent: ON CONFLICT DO NOTHING)
  const DEFAULT_PERMISSIONS = {
    admin:   { edit_content: true, manage_sections: true, manage_pages: true, manage_backups: true, manage_theme: true, view_activity: true, manage_users: true, manage_page_access: true, manage_seo: true, reset_content: true, view_csp: true, manage_permissions: true },
    content: { edit_content: true, manage_sections: true, manage_pages: true, manage_backups: true, manage_theme: true, view_activity: true, manage_users: true, manage_page_access: true, manage_seo: true, reset_content: false, view_csp: false, manage_permissions: false },
    client:  { edit_content: false, manage_sections: false, manage_pages: false, manage_backups: false, manage_theme: false, view_activity: false, manage_users: false, manage_page_access: false, manage_seo: false, reset_content: false, view_csp: false, manage_permissions: false }
  };
  for (const [role, caps] of Object.entries(DEFAULT_PERMISSIONS)) {
    for (const [cap, enabled] of Object.entries(caps)) {
      await db.query(
        `INSERT INTO role_permissions (role, capability, enabled) VALUES ($1, $2, $3)
         ON CONFLICT (role, capability) DO NOTHING`,
        [role, cap, enabled]
      );
    }
  }
  console.log('Role permissions seeded.');

  // Seed users (idempotent: ON CONFLICT DO NOTHING)
  // Passwords must come from env vars — never commit credentials.
  // If the users already exist we skip this step entirely so redeploys
  // don't require NAT_PASSWORD / TOM_PASSWORD to be present.
  const { rows: existingUsers } = await db.query('SELECT username FROM users');
  const existingNames = new Set(existingUsers.map(r => r.username));
  const allSeeded = ['nat', 'tom'].every(u => existingNames.has(u));

  if (allSeeded) {
    console.log('Users already seeded, skipping.');
  } else {
    const natPassword = process.env.NAT_PASSWORD;
    const tomPassword = process.env.TOM_PASSWORD;
    if (!natPassword || !tomPassword) {
      throw new Error('NAT_PASSWORD and TOM_PASSWORD must be set the first time seeding runs.');
    }
    const users = [
      { username: 'nat', password: natPassword, role: 'admin' },
      { username: 'tom', password: tomPassword, role: 'content' }
    ];
    for (const user of users) {
      const hash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
      await db.query(
        `INSERT INTO users (username, password_hash, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (username) DO NOTHING`,
        [user.username, hash, user.role]
      );
    }
    console.log('Users seeded.');
  }

  // Seed content (idempotent: ON CONFLICT DO NOTHING)
  for (const [key, content] of Object.entries(defaults)) {
    await db.query(
      `INSERT INTO content (section_key, content)
       VALUES ($1, $2)
       ON CONFLICT (section_key) DO NOTHING`,
      [key, content]
    );
  }
  // Migrate old credentials keys to new split keys
  const migrations = [
    { from: 'credentials.block_1_title', to: 'credentials_oxford.title' },
    { from: 'credentials.block_1_text', to: 'credentials_oxford.text' },
    { from: 'credentials.block_2_stat', to: 'credentials_stat.stat' },
    { from: 'credentials.block_2_text', to: 'credentials_stat.text' }
  ];
  for (const { from, to } of migrations) {
    // Copy old value to new key if old exists and new doesn't
    await db.query(
      `INSERT INTO content (section_key, content)
       SELECT $1, content FROM content WHERE section_key = $2
       ON CONFLICT (section_key) DO NOTHING`,
      [to, from]
    );
  }
  // Clean up old keys
  await db.query(
    `DELETE FROM content WHERE section_key IN ($1, $2, $3, $4)`,
    ['credentials.block_1_title', 'credentials.block_1_text', 'credentials.block_2_stat', 'credentials.block_2_text']
  );

  console.log(`Content seeded (${Object.keys(defaults).length} keys).`);

  // Migrate main page into pages table (idempotent)
  const { rows: existingPages } = await db.query("SELECT slug FROM pages WHERE slug = 'main'");
  if (existingPages.length === 0) {
    // Read existing site.* keys from content table
    const { rows: siteRows } = await db.query(
      "SELECT section_key, content FROM content WHERE section_key IN ('site.section_order', 'site.hidden_sections', 'site.deleted_sections')"
    );
    const siteData = {};
    siteRows.forEach(r => { siteData[r.section_key] = r.content; });

    let sectionOrder = '[]';
    try { const p = JSON.parse(siteData['site.section_order'] || '[]'); if (Array.isArray(p)) sectionOrder = JSON.stringify(p); } catch (e) { /* ignore */ }
    let hiddenSections = '[]';
    try { const p = JSON.parse(siteData['site.hidden_sections'] || '[]'); if (Array.isArray(p)) hiddenSections = JSON.stringify(p); } catch (e) { /* ignore */ }
    let deletedSections = '[]';
    try { const p = JSON.parse(siteData['site.deleted_sections'] || '[]'); if (Array.isArray(p)) deletedSections = JSON.stringify(p); } catch (e) { /* ignore */ }

    await db.query(
      `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections)
       VALUES ('main', 'Home', 0, $1::jsonb, $2::jsonb, $3::jsonb)
       ON CONFLICT (slug) DO NOTHING`,
      [sectionOrder, hiddenSections, deletedSections]
    );
    console.log('Main page migrated to pages table.');
  } else {
    console.log('Pages table already has main page, skipping migration.');
  }

  // Migration: strip `contact` (and any `contact__N`) instances from every
  // page's section_order / hidden_sections / deleted_sections arrays. Contact
  // now renders in the global footer, so leaving it in a page's order results
  // in an empty page body (the view loop no longer renders the contact block).
  // Idempotent: only writes when something actually needed stripping.
  {
    const isContactId = (s) => typeof s === 'string' && /^contact(__\d+)?$/.test(s);
    const { rows: pagesToCheck } = await db.query(
      'SELECT slug, section_order, hidden_sections, deleted_sections FROM pages'
    );
    let stripped = 0;
    for (const p of pagesToCheck) {
      const so  = Array.isArray(p.section_order)    ? p.section_order    : [];
      const hs  = Array.isArray(p.hidden_sections)  ? p.hidden_sections  : [];
      const ds  = Array.isArray(p.deleted_sections) ? p.deleted_sections : [];
      const nextSo = so.filter(s => !isContactId(s));
      const nextHs = hs.filter(s => !isContactId(s));
      const nextDs = ds.filter(s => s !== 'contact');
      if (nextSo.length !== so.length || nextHs.length !== hs.length || nextDs.length !== ds.length) {
        await db.query(
          `UPDATE pages SET section_order = $1::jsonb, hidden_sections = $2::jsonb, deleted_sections = $3::jsonb
           WHERE slug = $4`,
          [JSON.stringify(nextSo), JSON.stringify(nextHs), JSON.stringify(nextDs), p.slug]
        );
        stripped++;
      }
    }
    if (stripped > 0) console.log(`Stripped contact instances from ${stripped} page(s).`);
  }

  // Migration: build the "What the work looks like" page. Tom created the page
  // in the CMS; this fills it with the documents section (four redacted client
  // PDFs, served from public/pdfs with page previews in public/img/docs) and a
  // closing call to action. Runs only while the page has no documents section,
  // so it will not fight later edits, reordering or deletion.
  {
    const WORK_SLUG = 'what-the-work-looks-like';
    const { rows: workPage } = await db.query(
      'SELECT slug, section_order FROM pages WHERE slug = $1', [WORK_SLUG]
    );
    if (workPage.length > 0) {
      const order = Array.isArray(workPage[0].section_order) ? workPage[0].section_order : [];
      const hasDocuments = order.some(s => /^documents(__\d+)?$/.test(s));
      if (!hasDocuments) {
        // Instance IDs are unique across every page, and reusing one whose
        // content rows still exist would silently inherit that old content.
        // Collect both sources before allocating.
        const { rows: orderRows } = await db.query('SELECT section_order FROM pages');
        const used = new Set();
        for (const r of orderRows) {
          if (Array.isArray(r.section_order)) r.section_order.forEach(s => used.add(s));
        }
        const { rows: prefixRows } = await db.query(
          "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content"
        );
        prefixRows.forEach(r => used.add(r.instance_id));

        const allocate = (tpl) => {
          if (!used.has(tpl)) { used.add(tpl); return tpl; }
          for (let n = 2; n <= 99; n++) {
            const id = `${tpl}__${n}`;
            if (!used.has(id)) { used.add(id); return id; }
          }
          return null;
        };

        const docsId = allocate('documents');
        const ctaId = allocate('intervention');
        if (docsId && ctaId) {
          const docs = [
            {
              title: 'Half-Time Team Talk',
              blurb: 'What became clear after spending time inside the business and following the evidence.',
              meta: 'PDF, 4 pages',
              file: '/pdfs/half-time-team-talk.pdf',
              image: '/img/docs/half-time-team-talk.jpg'
            },
            {
              title: 'The Mind That Built the Business Keeps Building the Next Stadium',
              blurb: 'A direct commercial review of the projects, systems and unfinished decisions absorbing time, money and attention.',
              meta: 'PDF, 15 pages',
              file: '/pdfs/the-mind-that-built-the-business.pdf',
              image: '/img/docs/the-mind-that-built-the-business.jpg'
            },
            {
              title: '90-Day Action Plan',
              blurb: 'The findings turned into practical actions, owners, deadlines and evidence of completion.',
              meta: 'PDF, 7 pages',
              file: '/pdfs/90-day-action-plan.pdf',
              image: '/img/docs/90-day-action-plan.jpg'
            },
            {
              title: 'Enactment Sheet',
              blurb: 'How the recommendations become operating rules that can actually be followed and checked.',
              meta: 'PDF, 2 pages',
              file: '/pdfs/enactment-sheet.pdf',
              image: '/img/docs/enactment-sheet.jpg'
            }
          ];

          const rows = [
            [`${docsId}.label`, 'Examples'],
            [`${docsId}.heading`, 'What the work looks like'],
            [`${docsId}.intro`, 'These are genuine examples of work produced during a proper commercial review. Names, organisations, locations and other identifying details have been removed or generalised, but the commercial findings and recommendations remain unchanged.'],
            [`${ctaId}.heading`, 'Every business is different'],
            [`${ctaId}.subtext`, 'The work follows the evidence, but the aim is always the same: clearer decisions, better control and a business that relies less heavily on the owner.'],
            [`${ctaId}.button_text`, 'Tell us what is going on'],
            // Empty slug means the button scrolls to the contact block in the footer.
            [`${ctaId}.button_link`, '']
          ];
          docs.forEach((d, i) => {
            const n = i + 1;
            rows.push([`${docsId}.doc_${n}_title`, d.title]);
            rows.push([`${docsId}.doc_${n}_blurb`, d.blurb]);
            rows.push([`${docsId}.doc_${n}_meta`, d.meta]);
            rows.push([`${docsId}.doc_${n}_file`, d.file]);
            rows.push([`${docsId}.doc_${n}_image`, d.image]);
          });

          for (const [key, value] of rows) {
            await db.query(
              `INSERT INTO content (section_key, content) VALUES ($1, $2)
               ON CONFLICT (section_key) DO NOTHING`,
              [key, value]
            );
          }

          const nextOrder = order.concat([docsId, ctaId]);
          await db.query(
            'UPDATE pages SET section_order = $1::jsonb WHERE slug = $2',
            [JSON.stringify(nextOrder), WORK_SLUG]
          );
          console.log(`Seeded documents section (${docsId}) on /${WORK_SLUG}.`);
        }
      }
    }
  }

  // Migration: ensure every existing intervention / filter instance has
  // button_text / button_link rows. Without this, edit modals on pre-existing
  // duplicates wouldn't expose the new button fields. Idempotent.
  for (const tpl of ['intervention', 'filter']) {
    const { rows: prefixRows } = await db.query(
      "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id " +
      "FROM content WHERE section_key ~ $1",
      [`^${tpl}(__[0-9]+)?\\.`]
    );
    for (const r of prefixRows) {
      const iid = r.instance_id;
      await db.query(
        "INSERT INTO content (section_key, content) VALUES ($1, '') ON CONFLICT (section_key) DO NOTHING",
        [`${iid}.button_text`]
      );
      await db.query(
        "INSERT INTO content (section_key, content) VALUES ($1, 'main') ON CONFLICT (section_key) DO NOTHING",
        [`${iid}.button_link`]
      );
    }
  }

  // Migration: add an optional card_N_link field to every insights instance,
  // same "type in a page slug" pattern as fourcards' card_N_link. The three
  // "real examples" cards on Websites and AI (Owner Check / Commercial Gaps
  // Review / this website) were plain text with no way to link anywhere —
  // Owner Check and Commercial Gaps Review now link to their own pages; the
  // "this website" card stays unlinked (visitor is already on it). Sets the
  // two real values FIRST, before the generic empty-string backfill below,
  // so ON CONFLICT DO NOTHING can't beat these inserts to the row — order
  // matters here, not just idempotency. Every other insights instance (e.g.
  // Useful Thinking) gets blank, editable link fields, left for a deliberate
  // future edit rather than guessed at.
  {
    const { rows: wsPage } = await db.query(
      "SELECT section_order FROM pages WHERE slug = 'websites-and-ai'"
    );
    if (wsPage.length > 0) {
      const order = Array.isArray(wsPage[0].section_order) ? wsPage[0].section_order : [];
      const wsInsightsId = order.find(iid => /^insights(__[0-9]+)?$/.test(iid));
      if (wsInsightsId) {
        await db.query(
          "INSERT INTO content (section_key, content) VALUES ($1, 'owner-check') ON CONFLICT (section_key) DO NOTHING",
          [`${wsInsightsId}.card_1_link`]
        );
        await db.query(
          "INSERT INTO content (section_key, content) VALUES ($1, 'commercial-gaps-review') ON CONFLICT (section_key) DO NOTHING",
          [`${wsInsightsId}.card_2_link`]
        );
      }
    }

    const { rows: insightsPrefixes } = await db.query(
      "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id " +
      "FROM content WHERE section_key ~ '^insights(__[0-9]+)?\\.'"
    );
    for (const r of insightsPrefixes) {
      for (const n of [1, 2, 3]) {
        await db.query(
          "INSERT INTO content (section_key, content) VALUES ($1, '') ON CONFLICT (section_key) DO NOTHING",
          [`${r.instance_id}.card_${n}_link`]
        );
      }
    }
  }

  // Migration: ensure every existing hero instance has an optional `whatsapp`
  // row so the edit modal exposes the field. The booking-page hero (hero__3)
  // is seeded with the live wa.me link; all other heroes start empty (button
  // hidden until filled). Idempotent (ON CONFLICT DO NOTHING preserves any
  // value Tom later sets, including clearing it).
  const HERO_WHATSAPP = 'https://wa.me/441752477026?text=Hi%20Tom%2C%20I%27d%20like%20to%20speak%20to%20you%20about%20Arrington%20Consultancy';
  const { rows: heroRows } = await db.query(
    "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id " +
    "FROM content WHERE section_key ~ $1",
    ['^hero(__[0-9]+)?\\.']
  );
  for (const r of heroRows) {
    const iid = r.instance_id;
    await db.query(
      "INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING",
      [`${iid}.whatsapp`, iid === 'hero__3' ? HERO_WHATSAPP : '']
    );
  }

  // Migration: merge What We Have Done, What the Work Looks Like and What
  // Business Owners Say into one new Evidence page (30/07/2026, Tom's
  // brief). Idempotent: only runs once, guarded on the 'evidence' page not
  // existing yet. Reads each source page's live section_order at migration
  // time rather than hardcoding instance IDs, since those vary by
  // deployment and this session's own inspection (see the merge report) was
  // explicitly read-only. Section instances are just reassigned to the new
  // page — same content rows, same instance IDs, nothing about their
  // content changes. The three source pages are then deleted; server.js
  // 301-redirects their old URLs to /evidence.
  {
    const { rows: existingEvidence } = await db.query("SELECT slug FROM pages WHERE slug = 'evidence'");
    if (existingEvidence.length === 0) {
      const EVIDENCE_SOURCE_SLUGS = ['what-we-have-done', 'what-the-work-looks-like', 'what-business-owners-say'];
      const { rows: sourcePages } = await db.query(
        'SELECT id, slug, section_order, hidden_sections FROM pages WHERE slug = ANY($1)',
        [EVIDENCE_SOURCE_SLUGS]
      );
      if (sourcePages.length === EVIDENCE_SOURCE_SLUGS.length) {
        const bySlug = {};
        sourcePages.forEach(p => { bySlug[p.slug] = p; });
        const orderOf = (slug) => Array.isArray(bySlug[slug].section_order) ? bySlug[slug].section_order : [];
        const hiddenOf = (slug) => Array.isArray(bySlug[slug].hidden_sections) ? bySlug[slug].hidden_sections : [];

        const baseOf = (id) => {
          const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
          return m ? m[1] : null;
        };

        // Find the single CTA that survives as Evidence's shared closing
        // block: the one whose button reads "Book a 30 minute
        // conversation" (Tom's chosen wording). Every other intervention
        // instance across the three source pages is dropped from the page
        // order — its content rows stay in the DB, same as any other
        // section removal in this CMS (see routes/content.js DELETE
        // /section/:id).
        const allIntervention = EVIDENCE_SOURCE_SLUGS
          .flatMap(slug => orderOf(slug))
          .filter(iid => baseOf(iid) === 'intervention');

        let keeperCta = null;
        for (const iid of allIntervention) {
          const { rows } = await db.query(
            'SELECT content FROM content WHERE section_key = $1',
            [`${iid}.button_text`]
          );
          const text = ((rows[0] && rows[0].content) || '').replace(/<[^>]+>/g, '').trim();
          if (text === 'Book a 30 minute conversation') { keeperCta = iid; break; }
        }
        if (!keeperCta && allIntervention.length > 0) {
          keeperCta = allIntervention[allIntervention.length - 1];
          console.warn(`Evidence merge: no intervention instance found with button text "Book a 30 minute conversation" — falling back to keeping ${keeperCta} as the shared closing CTA.`);
        }

        const withoutIntervention = (slug) => orderOf(slug).filter(iid => baseOf(iid) !== 'intervention');
        const evidenceOrder = [
          ...withoutIntervention('what-we-have-done'),
          ...withoutIntervention('what-the-work-looks-like'),
          ...withoutIntervention('what-business-owners-say'),
          ...(keeperCta ? [keeperCta] : [])
        ];
        const evidenceHidden = EVIDENCE_SOURCE_SLUGS
          .flatMap(slug => hiddenOf(slug))
          .filter(iid => evidenceOrder.includes(iid));

        // Position Evidence right after What We Do (Owner Check's synthetic
        // nav entry sits between them at render time — see server.js
        // navPages), shifting every later page's sort_order up by one to
        // make room. Falls back to appending at the very end if
        // 'what-we-do' is ever renamed or removed.
        const { rows: wwdRows } = await db.query("SELECT sort_order FROM pages WHERE slug = 'what-we-do'");
        let evidenceSortOrder;
        if (wwdRows.length > 0) {
          const wwdSort = wwdRows[0].sort_order;
          await db.query('UPDATE pages SET sort_order = sort_order + 1 WHERE sort_order > $1', [wwdSort]);
          evidenceSortOrder = wwdSort + 1;
        } else {
          const { rows: maxRows } = await db.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM pages');
          evidenceSortOrder = maxRows[0].next;
        }

        await db.query(
          `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections)
           VALUES ('evidence', 'Evidence', $1, $2::jsonb, $3::jsonb, '[]'::jsonb)`,
          [evidenceSortOrder, JSON.stringify(evidenceOrder), JSON.stringify(evidenceHidden)]
        );

        // Retire the three source pages now their sections have moved.
        // server.js 301-redirects their old URLs to /evidence.
        await db.query('DELETE FROM pages WHERE slug = ANY($1)', [EVIDENCE_SOURCE_SLUGS]);

        // Repoint any button_link / card_N_link content anywhere on the
        // site that referenced one of the three retired slugs, so visitors
        // land on the right part of Evidence directly rather than relying
        // on the redirect. Preserves any existing #fragment on card links
        // (those deep-link to a specific case study instance, which hasn't
        // moved). documents/googlereviews got a real id="" attribute added
        // alongside their existing data-section-id in this same change (see
        // views/index.ejs), so these anchors actually resolve.
        const EVIDENCE_ANCHORS = {
          'what-we-have-done': '',
          'what-the-work-looks-like': '#documents',
          'what-business-owners-say': '#googlereviews'
        };
        const { rows: linkRows } = await db.query(
          "SELECT section_key, content FROM content " +
          "WHERE section_key LIKE '%.button_link' OR section_key ~ '\\.card_[0-9]+_link$'"
        );
        for (const row of linkRows) {
          const value = (row.content || '').trim();
          const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)(#[a-z0-9_-]+)?$/.exec(value);
          if (!m) continue;
          const [, slug, fragment] = m;
          if (!Object.prototype.hasOwnProperty.call(EVIDENCE_ANCHORS, slug)) continue;
          const newValue = fragment ? `evidence${fragment}` : `evidence${EVIDENCE_ANCHORS[slug]}`;
          await db.query('UPDATE content SET content = $1 WHERE section_key = $2', [newValue, row.section_key]);
        }

        console.log(`Evidence page created (sort_order ${evidenceSortOrder}), ${evidenceOrder.length} section(s) merged, shared closing CTA: ${keeperCta || '(none found)'}. Source pages retired: ${EVIDENCE_SOURCE_SLUGS.join(', ')}.`);
      } else {
        console.log('Evidence merge skipped: not all three source pages exist yet.');
      }
    }
  }

  // Migration: build the new "Websites and AI" page (30/07/2026, Tom's
  // brief). A new service page combining commercial website development
  // with practical AI implementation, kept out of the main nav (it renders
  // as a subordinate link under What We Do instead — see views/index.ejs)
  // per the brief's explicit "do not make it a new top-level navigation
  // item" instruction. Idempotent: guarded on the page not existing yet.
  // Every section reuses an existing template (hero, biography, filter,
  // insights, fourcards, intervention) rather than inventing a new one, so
  // the page stays fully CMS-editable like everything else on the site.
  {
    const { rows: existingWebAi } = await db.query("SELECT slug FROM pages WHERE slug = 'websites-and-ai'");
    if (existingWebAi.length === 0) {
      const { rows: wwdRows } = await db.query("SELECT id, section_order FROM pages WHERE slug = 'what-we-do'");
      if (wwdRows.length > 0) {
        // Same collision-avoidance approach as the "what the work looks
        // like" migration above: collect every instance ID currently in use
        // anywhere (page section_order arrays plus distinct content-table
        // prefixes) before allocating new ones, rather than hardcoding IDs
        // that might already be taken on this particular deployment.
        const { rows: orderRows } = await db.query('SELECT section_order FROM pages');
        const used = new Set();
        for (const r of orderRows) {
          if (Array.isArray(r.section_order)) r.section_order.forEach(s => used.add(s));
        }
        const { rows: prefixRows } = await db.query(
          "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content"
        );
        prefixRows.forEach(r => used.add(r.instance_id));

        const allocate = (tpl) => {
          if (!used.has(tpl)) { used.add(tpl); return tpl; }
          for (let n = 2; n <= 99; n++) {
            const id = `${tpl}__${n}`;
            if (!used.has(id)) { used.add(id); return id; }
          }
          return null;
        };

        const heroId = allocate('hero');
        const startId = allocate('biography');
        const whyId = allocate('filter');
        const areasId = allocate('biography');
        const examplesId = allocate('insights');
        const howId = allocate('fourcards');
        const wontId = allocate('filter');
        const offerId = allocate('biography');
        const closingId = allocate('intervention');
        const wwdLinkId = allocate('intervention');

        if (heroId && startId && whyId && areasId && examplesId && howId && wontId && offerId && closingId && wwdLinkId) {
          const rows = [
            // SECTION 1 — hero
            [`${heroId}.heading`, 'Websites and AI that solve real business problems'],
            [`${heroId}.subtext`, "We don't build websites because someone wants a new website. We don't recommend AI because it's fashionable. We use both where they genuinely improve the commercial performance of the business."],
            [`${heroId}.cta`, 'Talk to us about what needs fixing'],
            [`${heroId}.whatsapp`, ''],

            // SECTION 2 — biography (start with the business, not the technology)
            [`${startId}.label`, 'COMMERCIAL PROBLEMS FIRST'],
            [`${startId}.heading`, 'Start with the business, not the technology'],
            [`${startId}.col_1_p1`, 'Most businesses do not have a website problem. They have business problems that a website or AI can sometimes solve.'],
            [`${startId}.col_1_p2`, "That might be poor quality enquiries, too many repetitive questions, or knowledge that only exists in the owner's head."],
            [`${startId}.col_2_p1`, 'It might be weak follow-up, manual administration that eats a day a week, or a business that cannot run properly without the owner in the room.'],
            [`${startId}.col_2_p2`, 'We look at what is actually happening in the business first. The technology comes after, and only where it earns its place.'],

            // SECTION 3 — filter (why we are different)
            [`${whyId}.label`, 'WHY WE ARE DIFFERENT'],
            [`${whyId}.heading`, 'We start with the business, not the brief'],
            [`${whyId}.p1`, 'Most agencies begin by asking what website the client wants.'],
            [`${whyId}.p2`, 'We begin by understanding what is getting in the way of the business. Only then do we decide whether a website, AI, a change in process, or a combination of the three is actually the right answer.'],
            [`${whyId}.button_text`, ''],
            [`${whyId}.button_link`, 'main'],

            // SECTION 4 — biography (two implementation areas)
            [`${areasId}.label`, 'TWO WAYS WE PUT IT INTO PRACTICE'],
            [`${areasId}.heading`, 'Two implementation areas'],
            [`${areasId}.col_1_p1`, '<strong>Commercial websites.</strong> Better enquiries, clearer positioning and stronger credibility.'],
            [`${areasId}.col_1_p2`, 'Higher quality conversations, useful information captured before a meeting even starts, and less time wasted on the wrong prospects.'],
            [`${areasId}.col_2_p1`, "<strong>Practical AI.</strong> Internal knowledge that does not live only in the owner's head, better enquiry handling, and sharper business reviews."],
            [`${areasId}.col_2_p2`, 'Faster document analysis, better meeting preparation, more support for staff, and less reliance on the owner for every answer.'],

            // SECTION 5 — insights (real examples)
            [`${examplesId}.label`, 'REAL ARRINGTON EXAMPLES'],
            [`${examplesId}.heading`, 'Proof from our own work'],
            [`${examplesId}.subtext`, 'We do not ask a business to try something we have not tried ourselves.'],
            [`${examplesId}.card_1_tag`, 'OWNER CHECK'],
            [`${examplesId}.card_1_title`, 'Owner Check'],
            [`${examplesId}.card_1_body`, 'A practical self-diagnostic that shows an owner where the business still depends too heavily on them, with an actionable score rather than a vague opinion.'],
            [`${examplesId}.card_2_tag`, 'COMMERCIAL GAPS REVIEW'],
            [`${examplesId}.card_2_title`, 'Commercial Gaps Review'],
            [`${examplesId}.card_2_body`, 'An automated commercial review that gives an owner real clarity on where the pressure is, built so it costs nothing to run and never invents a fact about the business.'],
            [`${examplesId}.card_3_tag`, 'THIS WEBSITE'],
            [`${examplesId}.card_3_title`, 'The Arrington Consultancy website'],
            [`${examplesId}.card_3_body`, 'Built to generate serious enquiries from suitable owners, not to win design awards. Every page exists to move a real conversation forward.'],

            // SECTION 6 — fourcards (how the work happens)
            [`${howId}.label`, 'HOW THE WORK HAPPENS'],
            [`${howId}.heading`, 'Understand, design, build, improve'],
            [`${howId}.card_1_number`, '01'],
            [`${howId}.card_1_title`, 'Understand'],
            [`${howId}.card_1_body`, 'We look at what is actually happening in the business before anything is designed or built.'],
            [`${howId}.card_2_number`, '02'],
            [`${howId}.card_2_title`, 'Design'],
            [`${howId}.card_2_body`, 'We decide what should change, and whether a website, AI, a process fix or a combination is the right answer.'],
            [`${howId}.card_3_number`, '03'],
            [`${howId}.card_3_title`, 'Build'],
            [`${howId}.card_3_body`, 'We build only what earns its place, in plain language the business can actually use.'],
            [`${howId}.card_4_number`, '04'],
            [`${howId}.card_4_title`, 'Improve'],
            [`${howId}.card_4_body`, 'We check what is working and change what is not. The business keeps control of it, not us.'],

            // SECTION 7 — filter (what we will not do)
            [`${wontId}.label`, 'WHAT WE WILL NOT DO'],
            [`${wontId}.heading`, 'We do not sell technology for its own sake'],
            [`${wontId}.p1`, 'We do not recommend AI unless it genuinely helps. We do not recommend rebuilding a website that already works. We do not sell technology for the sake of it. We only recommend changes that create commercial value.'],
            [`${wontId}.button_text`, ''],
            [`${wontId}.button_link`, 'main'],

            // SECTION 8 — biography (bespoke website offer)
            [`${offerId}.label`, 'BESPOKE WEBSITE OFFER'],
            [`${offerId}.heading`, 'A genuinely bespoke website — from £999'],
            [`${offerId}.col_1_p1`, 'This is a genuinely bespoke website. We build what the business actually wants, not what a template happens to allow.'],
            [`${offerId}.col_1_p2`, 'The lower price comes from modern technology and a leaner build process, not from lower quality. The result is still a finished website built around the business.'],
            [`${offerId}.col_2_p1`, '£999 covers a defined scope: up to five core pages, a mobile responsive build, basic SEO setup, a one-hour recorded discovery conversation at the start, and one structured round of changes before sign-off.'],
            [`${offerId}.col_2_p2`, 'It is a defined finished website, not unlimited revisions. If extra pages, extra functionality or integrations are needed, we quote those separately before the work is done.'],

            // SECTION 9 — intervention (closing)
            [`${closingId}.heading`, 'Technology should make the business stronger, not more complicated'],
            [`${closingId}.subtext`, 'If a stronger website, better systems or practical AI could genuinely improve the way the business operates, that is where the conversation should start.'],
            [`${closingId}.button_text`, 'Tell us what you want to build'],
            [`${closingId}.button_link`, 'book-a-30-minute-conversation'],

            // Contextual link appended to the existing What We Do page,
            // per the brief's explicit request — a new instance so nothing
            // already on that page is disturbed.
            [`${wwdLinkId}.heading`, 'Need the website or the systems to match?'],
            [`${wwdLinkId}.subtext`, 'We also build the websites and practical AI that make a stronger business easier to run. See how that works.'],
            [`${wwdLinkId}.button_text`, 'See Websites and AI'],
            [`${wwdLinkId}.button_link`, 'websites-and-ai']
          ];

          for (const [key, value] of rows) {
            await db.query(
              `INSERT INTO content (section_key, content) VALUES ($1, $2)
               ON CONFLICT (section_key) DO NOTHING`,
              [key, value]
            );
          }

          const pageOrder = [heroId, startId, whyId, areasId, examplesId, howId, wontId, offerId, closingId];

          // Position right after What We Do, shifting later pages' sort_order
          // up by one — same pattern as the Evidence merge above. show_in_nav
          // is false: this page is fully public and indexed, just reached via
          // the What We Do nav child link and contextual links rather than
          // sitting in the top-level nav bar itself.
          const wwdSort = (await db.query("SELECT sort_order FROM pages WHERE slug = 'what-we-do'")).rows[0].sort_order;
          await db.query('UPDATE pages SET sort_order = sort_order + 1 WHERE sort_order > $1', [wwdSort]);

          await db.query(
            `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav)
             VALUES ('websites-and-ai', 'Websites and AI', $1, $2::jsonb, '[]'::jsonb, '[]'::jsonb, false)`,
            [wwdSort + 1, JSON.stringify(pageOrder)]
          );

          const wwdOrder = Array.isArray(wwdRows[0].section_order) ? wwdRows[0].section_order : [];
          await db.query(
            'UPDATE pages SET section_order = $1::jsonb WHERE slug = $2',
            [JSON.stringify(wwdOrder.concat([wwdLinkId])), 'what-we-do']
          );

          console.log(`Websites and AI page created (sort_order ${wwdSort + 1}, hero=${heroId}), contextual link (${wwdLinkId}) appended to What We Do.`);
        } else {
          console.log('Websites and AI migration skipped: could not allocate instance IDs.');
        }
      } else {
        console.log('Websites and AI migration skipped: What We Do page does not exist yet.');
      }
    }
  }

  // Migration: add the bespoke website offer section to the existing
  // Websites and AI page and update the closing CTA button text. Idempotent:
  // if the offer section is already present, it is left alone; the button
  // text only changes when it is still on the old wording.
  {
    const { rows: wsRows } = await db.query(
      "SELECT section_order FROM pages WHERE slug = 'websites-and-ai'"
    );
    if (wsRows.length > 0) {
      const pageOrder = Array.isArray(wsRows[0].section_order) ? wsRows[0].section_order : [];
      const baseOf = (id) => {
        const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
        return m ? m[1] : null;
      };

      let closingId = null;
      for (let i = pageOrder.length - 1; i >= 0; i--) {
        if (baseOf(pageOrder[i]) === 'intervention') {
          closingId = pageOrder[i];
          break;
        }
      }

      if (closingId) {
        const { rows: headingRows } = await db.query(
          "SELECT split_part(section_key, '.', 1) AS instance_id FROM content WHERE section_key LIKE '%.heading' AND content = $1",
          ['A genuinely bespoke website — from £999']
        );
        const existingOfferId = headingRows
          .map((r) => r.instance_id)
          .find((iid) => pageOrder.includes(iid) && baseOf(iid) === 'biography');

        if (!existingOfferId) {
          const used = new Set();
          const { rows: orderRows } = await db.query('SELECT section_order FROM pages');
          for (const r of orderRows) {
            if (Array.isArray(r.section_order)) r.section_order.forEach((s) => used.add(s));
          }
          const { rows: prefixRows } = await db.query(
            "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content"
          );
          prefixRows.forEach((r) => used.add(r.instance_id));

          const allocate = (tpl) => {
            if (!used.has(tpl)) { used.add(tpl); return tpl; }
            for (let n = 2; n <= 99; n++) {
              const id = `${tpl}__${n}`;
              if (!used.has(id)) { used.add(id); return id; }
            }
            return null;
          };

          const offerId = allocate('biography');
          if (offerId) {
            const offerRows = [
              [`${offerId}.label`, 'BESPOKE WEBSITE OFFER'],
              [`${offerId}.heading`, 'A genuinely bespoke website — from £999'],
              [`${offerId}.col_1_p1`, 'This is a genuinely bespoke website. We build what the business actually wants, not what a template happens to allow.'],
              [`${offerId}.col_1_p2`, 'The lower price comes from modern technology and a leaner build process, not from lower quality. The result is still a finished website built around the business.'],
              [`${offerId}.col_2_p1`, '£999 covers a defined scope: up to five core pages, a mobile responsive build, basic SEO setup, a one-hour recorded discovery conversation at the start, and one structured round of changes before sign-off.'],
              [`${offerId}.col_2_p2`, 'It is a defined finished website, not unlimited revisions. If extra pages, extra functionality or integrations are needed, we quote those separately before the work is done.']
            ];
            for (const [key, value] of offerRows) {
              await db.query(
                'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
                [key, value]
              );
            }

            const closingIndex = pageOrder.indexOf(closingId);
            const nextOrder = closingIndex === -1
              ? pageOrder.concat([offerId])
              : pageOrder.slice(0, closingIndex).concat([offerId], pageOrder.slice(closingIndex));
            await db.query(
              'UPDATE pages SET section_order = $1::jsonb WHERE slug = $2',
              [JSON.stringify(nextOrder), 'websites-and-ai']
            );
          }
        }

        const { rows: ctaRows } = await db.query(
          'SELECT content FROM content WHERE section_key = $1',
          [`${closingId}.button_text`]
        );
        const ctaText = ((ctaRows[0] && ctaRows[0].content) || '').replace(/<[^>]+>/g, '').trim();
        if (ctaText === 'Book a 30 minute conversation') {
          await db.query(
            'UPDATE content SET content = $1 WHERE section_key = $2',
            ['Tell us what you want to build', `${closingId}.button_text`]
          );
        }
      }
    }
  }

  // Migration: Useful Thinking articles, first batch (01/08/2026, from
  // "Arrington Website Worker Handover 01"). Four pieces are published as
  // real pages (show_in_nav: false, same pattern as Websites and AI before
  // it was promoted — discovered via the library list on /useful-thinking,
  // the Commercial Gaps Review, and each other's related links, not the
  // primary nav). A fifth, "The Reverse Economy of Scale", is seeded as
  // content only under the reserved instance `article__5` with no page
  // row — per the handover's explicit hold instruction, it needs a Tom
  // voice-approval pass before it gets a route, a library entry or a CGR
  // link. Idempotent: guarded on the first article's page not existing yet.
  //
  // The handover's own general caveat is "UK English throughout, no em
  // dashes" (applies to all five pieces), but the delivered copy itself
  // contains a handful of em dashes (evidently a mechanical slip, not
  // something any per-article wording caveat marks as protected-verbatim).
  // Those have been converted to plain punctuation; every line explicitly
  // marked "must stay verbatim" in the handover is reproduced exactly as
  // given, unchanged.
  {
    const { rows: existingArticle1 } = await db.query(
      "SELECT slug FROM pages WHERE slug = 'being-certain-isnt-the-same-as-being-right'"
    );
    const { rows: utRows } = await db.query("SELECT id FROM pages WHERE slug = 'useful-thinking'");
    if (existingArticle1.length === 0 && utRows.length > 0) {
      const { rows: orderRows } = await db.query('SELECT section_order FROM pages');
      const used = new Set();
      for (const r of orderRows) {
        if (Array.isArray(r.section_order)) r.section_order.forEach((s) => used.add(s));
      }
      const { rows: prefixRows } = await db.query(
        "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content"
      );
      prefixRows.forEach((r) => used.add(r.instance_id));

      const allocate = (tpl) => {
        if (!used.has(tpl)) { used.add(tpl); return tpl; }
        for (let n = 2; n <= 99; n++) {
          const id = `${tpl}__${n}`;
          if (!used.has(id)) { used.add(id); return id; }
        }
        return null;
      };

      // Reserve article__5 for the held Reverse Economy of Scale piece
      // before allocating the four published ones, so `allocate` skips
      // straight past it.
      used.add('article__5');
      const a1 = allocate('article');
      const a2 = allocate('article');
      const a3 = allocate('article');
      const a4 = allocate('article');
      const libId = allocate('utlibrary');

      if (a1 && a2 && a3 && a4 && libId) {
        const ODQ_RELATED = ['Owner Dependency Quiz', '/owner-dependency-quiz'];
        const NO_RELATED = ['', ''];

        const articleRows = [
          // Article 1 — Being Certain Isn't the Same as Being Right
          [`${a1}.label`, 'USEFUL THINKING'],
          [`${a1}.heading`, "Being Certain Isn't the Same as Being Right"],
          [`${a1}.index_summary`, 'A staff member was ignoring the phone. Tom was sure of it, right up until the call logs proved him wrong. On the danger of acting on certainty instead of evidence.'],
          [`${a1}.body`, [
            "<p>I've been wrong millions of times.</p>",
            "<p>I've occasionally even been right, although that depends on whether you ask my wife.</p>",
            '<p>But only a handful of times in my life have I been so completely certain about something that I would have bet my life on it, only to be proved wrong. This is the business one.</p>',
            "<p>I rang the office one day and couldn't get through. I tried again from a different number. Still nothing. I checked the CCTV while it was ringing and saw the member of staff just sitting there.</p>",
            "<p>He'd previously told me he didn't use the loudspeaker, so I'd ruled that out. No handset in his hand meant one thing to me: he was ignoring the phone.</p>",
            "<p>I confronted him. He denied it. I was so certain I'd seen it with my own eyes that I called him a liar.</p>",
            "<p>He still denied it, so I checked the call logs. He'd been on another call at the exact moment mine came in, on loudspeaker, exactly what he'd told me he didn't do.</p>",
            "<p>I'd been wrong about the lie. He had broken a rule and concealed it, but I had accused him of something he hadn't done. Neither of us came out of it clean, but only one of us had been called a liar for something he hadn't done.</p>",
            '<p>I apologised straight away.</p>',
            "<p>It's one of the first things I tell new managers when they're considering disciplining a member of staff: never flat out call someone a liar.</p>",
            "<p>Being certain doesn't make you right. Listen, gather the evidence and leave room for the possibility that you're wrong.</p>",
            '<p>Sometimes even your own eyes give you the wrong answer.</p>'
          ].join('')],
          [`${a1}.related_text`, ODQ_RELATED[0]],
          [`${a1}.related_link`, ODQ_RELATED[1]],

          // Article 2 — The Customer Who Messaged Me at 4am
          [`${a2}.label`, 'USEFUL THINKING'],
          [`${a2}.heading`, 'The Customer Who Messaged Me at 4am'],
          [`${a2}.index_summary`, "A 4am complaint from someone Tom barely knew, and his wife's reaction the next morning, exposed the difference between being responsive and being permanently on call."],
          [`${a2}.body`, [
            '<p>I was sound asleep over the festive period when a customer I knew to maybe say hello to felt it was acceptable to message me at 4am ranting about a late taxi.</p>',
            '<p>My warped sense of what was normal meant I replied, then rang the office to sort it.</p>',
            '<p>The following morning my wife asked who had been messaging me at that hour. I explained. She looked at me and said: "How can anyone possibly think that\'s acceptable? What if I contacted the CEO of Marks and Spencer with a complaint?"</p>',
            '<p>My wife has an art of hyperbolising the extent of a breach of boundaries. She was also completely right.</p>',
            '<p>At the time we were handling around 10,000 customers a week and I had spent years making the business genuinely responsive, but somewhere along the way I had confused caring about customers with being personally available to them at any hour.</p>',
            '<p>Over twenty years the defining change was communication technology. The landline only ever got used for a genuine someone is on fire emergency. The mobile made contact feel somehow less intrusive to the person sending it, even when it wasn\'t.</p>',
            '<p>Once people know they can reach you directly, it is very difficult to walk that back. The same applied to staff. Genuine emergencies, yes. A gripe that could wait until Monday morning belonged in the right place at the right time, not landing on me whenever somebody felt like having it.</p>',
            '<p>It took a 4am message over Christmas and my wife\'s reaction the next morning to make me draw the line properly. We still smile about the Marks and Spencer line.</p>',
            '<p>She was right. I should have done it sooner.</p>'
          ].join('')],
          [`${a2}.related_text`, ODQ_RELATED[0]],
          [`${a2}.related_link`, ODQ_RELATED[1]],

          // Article 3 — You Don't Get to Decide When You've Made Things Right
          [`${a3}.label`, 'USEFUL THINKING'],
          [`${a3}.heading`, "You Don't Get to Decide When You've Made Things Right"],
          [`${a3}.index_summary`, 'Tom lost a £120,000 account at 26 after one late airport transfer, despite doing everything he thought a decent business owner should. On accepting consequences you don\'t get to set the terms of.'],
          [`${a3}.body`, [
            '<p>I lost a £120,000 a year account when I was 26 because of one drive to an airport.</p>',
            '<p>We had made provisions for bad traffic, but not quite enough. The passenger was late and, funnily enough, the plane did not wait. The fault was ours and ours only.</p>',
            '<p>I covered the cost to the company, apologised properly and spoke directly to the MD. At the time, I genuinely believed I had fixed it. I had taken responsibility, put my hand in my pocket and done everything I thought a decent business owner was supposed to do. I had read the book and everything.</p>',
            '<p>He accepted the apology. He accepted the compensation. Then he ended the relationship.</p>',
            '<p>At the time I felt betrayed. Looking back, he was not punishing me. He was protecting his customers, his business and the food he put on his family\'s table. I was irrelevant in that picture.</p>',
            '<p>Business is not a social club. You can be friendly, but you are often not friends.</p>',
            '<p>You can make the right moves afterwards. You can apologise, compensate and dance all the right dances. What you do not get to decide is what happens next. If you get it wrong in business, it is not your decision what the punishment should be. The offender is not the judge and jury.</p>',
            '<p>There were staff involved and internal mistakes that contributed to what happened. I could have pointed the finger and badly wanted to. I suspect some people were waiting for me to. Even at 26, I knew that was nonsense.</p>',
            '<p>If somebody on minimum wage can make a mistake that costs your business hundreds of thousands of pounds, that is not really a staff problem. That is a management problem and, in my case, a Tom problem.</p>',
            '<p>The real failure was not the late airport run. The real failure was allowing that much risk to sit in one place.</p>',
            '<p>Someone earning minimum wage deserves to be protected from errors that can make or break a business. After that, every account booking had to be confirmed by email and signed off. We built paper trails where there had not been any. Not because we wanted more administration, but because I had learned what a missing process could cost. An eye watering amount.</p>',
            '<p>A few years later, the same MD was let down by one of our competitors and gave us another chance. The original incident was never mentioned. It did not need to be. We both knew what had happened, and he knew it would never happen again.</p>',
            '<p>If I could speak to myself at 26, I would tell him it hurts now, and rightly so. But one day you will thank him for it.</p>'
          ].join('')],
          [`${a3}.related_text`, ODQ_RELATED[0]],
          [`${a3}.related_link`, ODQ_RELATED[1]],

          // Article 4 — The Tightrope Between Staff Loyalty and Damage Control
          [`${a4}.label`, 'USEFUL THINKING'],
          [`${a4}.heading`, 'The Tightrope Between Staff Loyalty and Damage Control'],
          [`${a4}.index_summary`, "A fifteen-year employee, 98% brilliant and impossible the rest of the time. On why you can train skills but you can't transplant someone's character."],
          [`${a4}.body`, [
            '<p>The tightrope between staff loyalty and damage control is brutal.</p>',
            '<p>I had someone who had been in the business for about 15 years. They turned up, they knew the place, and in plenty of ways they were loyal. The frustrating thing was that about 98% of the job was done well.</p>',
            '<p>That made it very easy to give them far more rope than I should have.</p>',
            '<p>The problem was the damage left in their wake. Customers were upset by their attitude. Other staff found them almost impossible to work with. Feedback never really landed, because they had no ability to see anything from anyone else\'s point of view. If something went wrong, it was always someone else\'s fault, or there was always a reason why they had done nothing wrong.</p>',
            '<p>The blame culture became contagious.</p>',
            '<p>For far too long, I absorbed it. Again and again I made excuses for them. I found myself trying to explain it away. I thought there must be a better way to manage it, a better conversation, different training, or some other way to get through to them.</p>',
            "<p>There probably wasn't.</p>",
            '<p>You can train skills. You can attempt to educate. You can set expectations. But you cannot transplant someone\'s character and personality. Trust me, I have tried.</p>',
            '<p>When it was finally dealt with properly, the business felt different almost straight away. The working environment was calmer. Customers were happier. Staff morale improved.</p>',
            '<p>That was the uncomfortable bit.</p>',
            '<p>In trying to be loyal to one person, I had weakened the business for everyone else. There are limits to loyalty in business. Unless that loyalty puts the greater good first, it can become massively damaging.</p>'
          ].join('')],
          [`${a4}.related_text`, NO_RELATED[0]],
          [`${a4}.related_link`, NO_RELATED[1]],

          // Article 5 (HELD) — The Reverse Economy of Scale. Content seeded
          // for CMS visibility/editing only; no page row, so no route, no
          // library entry and no CGR link exist yet. See hold instruction
          // above and lib/usefulThinkingArticles.js.
          [`article__5.label`, 'USEFUL THINKING'],
          [`article__5.heading`, 'The Reverse Economy of Scale'],
          [`article__5.index_summary`, "More turnover was supposed to make things easier. It didn't. Growth just meant Tom found out about problems later, and later meant more expensive. On why bigger only works if the structure underneath gets bigger too."],
          [`article__5.body`, [
            '<p>The reverse economy of scale.</p>',
            "<p>As my business grew, I assumed more sales and more people would naturally make things easier. It didn't work like that.</p>",
            "<p>The further I got from the front line, the less I actually saw. Problems I'd have spotted immediately in the early days started slipping through the cracks instead. By the time some of them reached me, they'd already cost money, time, or trust.</p>",
            '<p>You can be busier, turning over more, employing more people, and still have less control than you had when the business was smaller. I know that because I lived it.</p>',
            "<p>I've heard the same thing from other owners since. One was frustrated that despite growing turnover, things felt harder than ever to manage, customer issues taking longer to surface, small mistakes turning expensive, constantly pulled into firefighting. It wasn't a new problem to me. It was mine, just wearing someone else's name.</p>",
            '<p>Growth does not remove pressure on the owner unless the structure underneath grows with it. Otherwise the business gets bigger, and the owner stays trapped in the middle of everything.</p>'
          ].join('')],
          [`article__5.related_text`, NO_RELATED[0]],
          [`article__5.related_link`, NO_RELATED[1]],

          // Library list section on /useful-thinking
          [`${libId}.label`, 'USEFUL THINKING'],
          [`${libId}.heading`, 'Stories from twenty years of running businesses.']
        ];

        for (const [key, value] of articleRows) {
          await db.query(
            'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
            [key, value]
          );
        }

        const { rows: maxSortRows } = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM pages');
        let nextSort = maxSortRows[0].max_sort + 1;

        // Slugs come from the manifest (single source of truth for
        // routing); titles are the handover's "Final title" for each,
        // matching the .heading content value set above.
        const articleTitlesByInstance = {
          [a1]: "Being Certain Isn't the Same as Being Right",
          [a2]: 'The Customer Who Messaged Me at 4am',
          [a3]: "You Don't Get to Decide When You've Made Things Right",
          [a4]: 'The Tightrope Between Staff Loyalty and Damage Control'
        };
        // Scoped to exactly the four instance IDs this migration allocates
        // above (a1-a4), not the full current manifest — UT_ARTICLES has
        // since grown a 5th (and will grow further) entry with its own
        // dedicated migration block further down, and mapping over the
        // whole array here would look up a title this block never defined.
        const articlePages = UT_ARTICLES
          .filter((a) => [a1, a2, a3, a4].includes(a.instanceId))
          .map((a) => [a.instanceId, a.slug, articleTitlesByInstance[a.instanceId]]);
        for (const [instanceId, slug, title] of articlePages) {
          await db.query(
            `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav, meta_description)
             VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, false, $5)`,
            [slug, title, nextSort, JSON.stringify([instanceId]), (function () {
              const key = `${instanceId}.index_summary`;
              const found = articleRows.find((r) => r[0] === key);
              return found ? found[1] : '';
            })()]
          );
          nextSort += 1;
        }

        // Restructure the useful-thinking page: drop the now-redundant
        // approach__2 three-up (Cash Flow / Fixed Overheads / Owner
        // Dependency), which duplicated the insights block above it in
        // both format and theme, and insert the new library list in its
        // place, right before the closing assessment/quiz block. Content
        // rows for approach__2 are untouched and stay recoverable via the
        // existing "Reuse existing" add-section flow if ever wanted back.
        const { rows: utPageRows } = await db.query("SELECT section_order FROM pages WHERE slug = 'useful-thinking'");
        const utOrder = Array.isArray(utPageRows[0]?.section_order) ? utPageRows[0].section_order : [];
        const newUtOrder = [];
        for (const iid of utOrder) {
          if (iid === 'approach__2') continue;
          if (iid === 'assessment') newUtOrder.push(libId);
          newUtOrder.push(iid);
        }
        if (!newUtOrder.includes(libId)) newUtOrder.push(libId);
        await db.query(
          'UPDATE pages SET section_order = $1::jsonb WHERE slug = $2',
          [JSON.stringify(newUtOrder), 'useful-thinking']
        );

        console.log(`Useful Thinking: 4 articles published (${a1}, ${a2}, ${a3}, ${a4}), 1 held (article__5), library list (${libId}) added to /useful-thinking.`);
      } else {
        console.log('Useful Thinking articles migration skipped: could not allocate instance IDs.');
      }
    }
  }

  // Migration: Useful Thinking copy refinements, per Tom's review of the
  // deployed articles (01/08/2026). Three changes, all content-only:
  // (1) the £120k account title was the one Tom specifically flagged as
  // wrapping heavily on mobile (55 characters, longest of the four) — the
  // other three titles are left untouched, per his explicit "wouldn't
  // shorten every title" instruction; (2) the library section's heading
  // is replaced with the line Tom proposed directly; (3) all four index
  // summaries are rewritten to hold back the resolution a beat longer
  // (more curiosity, not clickbait — every fact stays accurate, nothing
  // is invented or exaggerated). Each update is guarded on the exact
  // current value, so this is idempotent and never overwrites a value
  // Tom has since edited himself via the CMS.
  {
    const utCopyFixes = [
      // [key, oldValue, newValue]
      ['article__3.heading', "You Don't Get to Decide When You've Made Things Right", "You Don't Get to Decide the Consequences"],
      ['article.index_summary', 'A staff member was ignoring the phone. Tom was sure of it, right up until the call logs proved him wrong. On the danger of acting on certainty instead of evidence.', 'A staff member was ignoring the phone. Tom was completely certain of it, certain enough to say so out loud. He was wrong.'],
      ['article__2.index_summary', "A 4am complaint from someone Tom barely knew, and his wife's reaction the next morning, exposed the difference between being responsive and being permanently on call.", 'A customer Tom barely knew messaged him at 4am over Christmas with a complaint. His wife had one question the next morning that changed how he ran the business.'],
      ['article__3.index_summary', "Tom lost a £120,000 account at 26 after one late airport transfer, despite doing everything he thought a decent business owner should. On accepting consequences you don't get to set the terms of.", 'One late airport transfer cost Tom a £120,000 account at 26, despite doing everything he thought would fix it. What happened next was not what he expected.'],
      ['article__4.index_summary', "A fifteen-year employee, 98% brilliant and impossible the rest of the time. On why you can train skills but you can't transplant someone's character.", 'A fifteen-year employee was 98% brilliant, and impossible the rest of the time. Tom spent years finding excuses for the other 2%.']
    ];
    let utCopyFixCount = 0;
    for (const [key, oldValue, newValue] of utCopyFixes) {
      const { rowCount } = await db.query(
        'UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3',
        [newValue, key, oldValue]
      );
      utCopyFixCount += rowCount;
    }

    // pages.title and meta_description mirror the same two changes so the
    // browser tab / search snippet stay consistent with the on-page copy.
    const utPageFixes = [
      ['being-certain-isnt-the-same-as-being-right', null, 'A staff member was ignoring the phone. Tom was completely certain of it, certain enough to say so out loud. He was wrong.'],
      ['the-customer-who-messaged-me-at-4am', null, 'A customer Tom barely knew messaged him at 4am over Christmas with a complaint. His wife had one question the next morning that changed how he ran the business.'],
      ['you-dont-get-to-decide-when-youve-made-things-right', "You Don't Get to Decide the Consequences", 'One late airport transfer cost Tom a £120,000 account at 26, despite doing everything he thought would fix it. What happened next was not what he expected.'],
      ['the-tightrope-between-staff-loyalty-and-damage-control', null, 'A fifteen-year employee was 98% brilliant, and impossible the rest of the time. Tom spent years finding excuses for the other 2%.']
    ];
    for (const [slug, newTitle, newMetaDescription] of utPageFixes) {
      if (newTitle) {
        await db.query('UPDATE pages SET title = $1 WHERE slug = $2', [newTitle, slug]);
      }
      await db.query('UPDATE pages SET meta_description = $1 WHERE slug = $2', [newMetaDescription, slug]);
    }

    // The library instance's ID is allocated dynamically (see the
    // migration above), so it's found here by matching the utlibrary
    // template on whichever page currently holds it, rather than assumed.
    const { rows: utPageRows2 } = await db.query("SELECT section_order FROM pages WHERE slug = 'useful-thinking'");
    const utOrder2 = Array.isArray(utPageRows2[0]?.section_order) ? utPageRows2[0].section_order : [];
    const libInstanceId = utOrder2.find((iid) => /^utlibrary(__\d+)?$/.test(iid));
    if (libInstanceId) {
      const { rowCount } = await db.query(
        'UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3',
        ["These aren't just stories. They're the thinking behind how you work.", `${libInstanceId}.heading`, 'Stories from twenty years of running businesses.']
      );
      utCopyFixCount += rowCount;
    }

    if (utCopyFixCount > 0) console.log(`Useful Thinking: applied ${utCopyFixCount} copy refinement(s) from Tom's review.`);
  }

  // Migration: fifth Useful Thinking article, "A Profitable Job Is Not
  // Necessarily Good Business" (01/08/2026), supplied directly by Tom
  // rather than via the handover — title kept as given; slug, summary,
  // subheading treatment and CGR category are all an editorial call made
  // here (see lib/usefulThinkingArticles.js), not preserved instructions.
  // Subheadings within the body are rendered as bold-only paragraphs
  // (<strong> lead-in), the same pattern already used elsewhere for
  // sub-labels within long-form content — sanitize-html only allows
  // strong/p/br/em, so there is no <h2> available for real subheadings.
  // Adds the new optional article.image field (see views/index.ejs and
  // routes/content.js's VALID_TEMPLATES 'article' handling) as a header
  // image on the page itself, plus a page-level og_image for social
  // sharing. Both are bespoke branded graphics Tom supplied directly
  // (not stock/generic AI scenes), landscape one used for og_image since
  // that ratio suits social cards, portrait one used as the in-page
  // header. The Drive "Arrington Useful Thinking Bank" doc's per-article
  // image-decision note has been updated to match this call.
  // Idempotent: guarded on the page not existing yet.
  {
    const { rows: existingArticle6 } = await db.query(
      "SELECT slug FROM pages WHERE slug = 'a-profitable-job-is-not-necessarily-good-business'"
    );
    if (existingArticle6.length === 0) {
      const { rows: orderRows6 } = await db.query('SELECT section_order FROM pages');
      const used6 = new Set();
      for (const r of orderRows6) {
        if (Array.isArray(r.section_order)) r.section_order.forEach((s) => used6.add(s));
      }
      const { rows: prefixRows6 } = await db.query(
        "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content"
      );
      prefixRows6.forEach((r) => used6.add(r.instance_id));
      const allocate6 = (tpl) => {
        if (!used6.has(tpl)) return tpl;
        for (let n = 2; n <= 99; n++) {
          const id = `${tpl}__${n}`;
          if (!used6.has(id)) return id;
        }
        return null;
      };
      const a6 = allocate6('article');

      if (a6) {
        const bodyParagraphs = [
          'We thought we had landed a licence to print money.',
          'A shipping company operating from Falmouth Docks needed its Romanian crew transported to and from Luton Airport for shift changes.',
          'Sometimes we would have one vehicle going up and another coming back. Other times it could be four going up and three returning. Long-distance fares, passengers travelling in both directions and very little empty mileage.',
          'On paper, it was brilliant work.',
          'The journeys themselves were profitable. Getting paid for them was another matter.',
          'We paid the drivers and bought the fuel immediately, but could then wait up to ten months for the invoices to be settled. At times, the company owed us tens of thousands of pounds.',
          "In the earlier years of the business, when cash was tighter, that meant using our money to finance somebody else's operation while waiting nearly a year to receive the benefit of the work.",
          'The profit was real, but it was not available to us.',
          '<strong>Profit and cash are not the same thing</strong>',
          'It is easy to look at a job, subtract its obvious costs and conclude that it is worth having.',
          'But that calculation misses a crucial question:',
          'When will the money actually arrive?',
          "A customer might agree to a good price. The work might use spare capacity efficiently. The figures might show a healthy margin. None of that pays this week's wages or puts fuel in the vehicles.",
          'If those costs leave your account today and the customer pays ten months later, you are extending credit whether you intended to or not.',
          "The more successful the contract appears, the more dangerous that can become. Every additional job increases the reported revenue, but it also increases the amount of your own cash tied up in the customer's business.",
          'Eventually, winning more work can make your immediate position worse.',
          '<strong>Understanding why you have not been paid</strong>',
          'The people we dealt with at the shipping company were not deliberately withholding our money. The company was waiting to be paid itself and the cash simply was not there.',
          'That made the delay understandable. It did not remove the risk.',
          'We were also owed money for similar periods by FTSE 250 companies, but those situations needed a different response. With the larger companies, the money generally existed. The delay was more likely to be an oversight, a failed internal process or an invoice sitting in the wrong place.',
          'I continued accepting their work, but made it clear that we were a smaller operator being forced to carry the cost of their failure to pay. If necessary, I would take legal action.',
          'That always resulted in payment. The debt was not disputed and the company had no reason to incur legal costs defending it.',
          'The shipping company was different. Threatening legal action would not have made money suddenly appear. It could, however, have damaged the relationship with the people we worked with every day.',
          'Eventually, the outstanding balance became too large for us to keep accepting more work. I spoke honestly with the CEO about the pressure it was putting on our business and followed that conversation up in writing.',
          'We had to apply pressure, knowing that doing so carried some risk to a valuable commercial relationship. But there came a point when protecting our own business had to take priority.',
          'The balance was always paid and the relationship survived.',
          '<strong>Payment terms only take you so far</strong>',
          "You can put all the belt and braces you like into your payment terms. They give you rights, but they do not put money into a customer's bank account.",
          'What protected us was knowing the people involved, understanding why payment had been delayed and being willing to have an honest conversation when the exposure became uncomfortable.',
          'That does not mean relationships should replace proper credit control. A good relationship is not a reason to allow an unpaid balance to grow indefinitely.',
          'It means the response should reflect the real cause of the problem.',
          'If a large company has the money but its payment process has failed, formal pressure may be effective.',
          'If a smaller customer genuinely does not have the cash, another threatening email may achieve nothing. The important decision may be whether to continue accepting work and increasing the amount at risk.',
          'In both cases, leaving the problem untouched is still a decision. You are choosing to extend more credit every time you complete another job without being paid for the earlier ones.',
          'The job was profitable. The exposure was the problem.',
          'We did eventually receive the money, so this is not a story about a bad debt.',
          'It is a story about work that looked exceptional until we considered what the business had to carry in order to deliver it.',
          'The price was good. The vehicle use was efficient. The journeys made money. But for months at a time, we were paying the operating costs and carrying the risk while somebody else had the benefit.',
          'That changed what the work was worth to us.',
          'A profitable job is not necessarily good business if you have to finance the customer for nearly a year.'
        ].map((p) => `<p>${p}</p>`).join('');

        const indexSummary = 'We thought we had landed a licence to print money. Getting paid for it was another matter entirely.';

        const a6Rows = [
          [`${a6}.label`, 'USEFUL THINKING'],
          [`${a6}.heading`, 'A Profitable Job Is Not Necessarily Good Business'],
          [`${a6}.index_summary`, indexSummary],
          [`${a6}.body`, bodyParagraphs],
          [`${a6}.related_text`, ''],
          [`${a6}.related_link`, ''],
          [`${a6}.image`, '/img/useful-thinking/a-profitable-job-hero.jpg']
        ];
        for (const [key, value] of a6Rows) {
          await db.query(
            'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
            [key, value]
          );
        }

        const { rows: maxSortRows6 } = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM pages');
        await db.query(
          `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav, meta_description, og_image)
           VALUES ('a-profitable-job-is-not-necessarily-good-business', 'A Profitable Job Is Not Necessarily Good Business', $1, $2::jsonb, '[]'::jsonb, '[]'::jsonb, false, $3, $4)`,
          [maxSortRows6[0].max_sort + 1, JSON.stringify([a6]), indexSummary, 'https://www.arringtonconsultancy.com/img/useful-thinking/a-profitable-job-og.jpg']
        );

        console.log(`Useful Thinking: 5th article published (${a6}, a-profitable-job-is-not-necessarily-good-business).`);
      } else {
        console.log('Useful Thinking 5th article migration skipped: could not allocate an instance ID.');
      }
    }
  }

  // Migration: sixth Useful Thinking article, "Every Rule Changes
  // Behaviour" (01/08/2026), from "Arrington Website Worker Handover 02"
  // — supplied directly by Tom this session, pressure-tested and
  // finalized with his sign-off. Per the handover's own hold note, two
  // edits were made under Tom's delegated authority before this copy was
  // called final: a hypothetical, non-lived analogy (a supermarket
  // checkout worker on commission) was removed since every other piece
  // in the library is a real, dated incident, and the section
  // subheadings were flattened into continuous prose to match the format
  // every other Ready piece uses (unlike the Profitable Job article,
  // this one has no bold subheadings at all). Idempotent: guarded on the
  // page not existing yet.
  {
    const { rows: existingArticle7 } = await db.query(
      "SELECT slug FROM pages WHERE slug = 'every-rule-changes-behaviour'"
    );
    if (existingArticle7.length === 0) {
      const { rows: orderRows7 } = await db.query('SELECT section_order FROM pages');
      const used7 = new Set();
      for (const r of orderRows7) {
        if (Array.isArray(r.section_order)) r.section_order.forEach((s) => used7.add(s));
      }
      const { rows: prefixRows7 } = await db.query(
        "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content"
      );
      prefixRows7.forEach((r) => used7.add(r.instance_id));
      const allocate7 = (tpl) => {
        if (!used7.has(tpl)) return tpl;
        for (let n = 2; n <= 99; n++) {
          const id = `${tpl}__${n}`;
          if (!used7.has(id)) return id;
        }
        return null;
      };
      const a7 = allocate7('article');

      if (a7) {
        const bodyParagraphs7 = [
          'When we took over the taxi company, out of town work operated on a simple first in, first out basis.',
          'It appeared fair. The earlier a driver started, the higher they moved up the list and the better their chance of receiving a valuable long distance journey.',
          'The drivers soon responded exactly as the system encouraged them to.',
          'More began arriving early, including drivers we did not actually need at that time of day. They completed a few good jobs, reached the end of their shift and went home while much of the day remained.',
          'The system distributed the work fairly between individual drivers. It did not put enough cars on the road when the business and its customers needed them.',
          'We introduced a minimum eight hour shift to stop drivers arriving early, completing a couple of profitable jobs and disappearing.',
          'That changed the behaviour, but not in the way we needed.',
          'Some drivers began starting outrageously early. They still completed the required eight hours, but could then finish before the evening demand arrived.',
          'By 5pm, during the gap between the daytime and evening drivers, we could barely have any cars available.',
          'The rule was being followed. The outcome was still wrong.',
          'We then predetermined which drivers would be the first and second cars. That guaranteed the essential early coverage. Everyone else could decide when to start, provided they completed the minimum shift.',
          'When the evening shortage continued, access to the out of town list became dependent on drivers being available by a particular time.',
          'It was presented as an incentive, although in truth it was probably a stick disguised as a carrot. Drivers who were not available when the business needed them would miss the opportunity to receive the more desirable work.',
          'It helped, but it never completely solved the problem.',
          "The same thing happens with any rule or incentive that affects somebody's earnings. People naturally adjust their behaviour around it. That does not make them dishonest or difficult. It means the system is producing the behaviour it rewards.",
          'The mistake is assuming that because a rule sounds sensible, the combined result will also be sensible. A system can treat each person fairly while producing a poor result for the business.',
          'The obvious response to every new problem is another rule. That eventually creates a different kind of damage.',
          'Too little structure allowed drivers to maximise their immediate earnings while leaving the business short of cars later in the day. Too much structure would have damaged morale, removed useful independence and made good drivers feel they were being micromanaged.',
          'That mattered commercially. Driver retention was already difficult. Making the working environment unnecessarily restrictive would only have made it harder.',
          'The business needed enough control to protect customer coverage, but enough freedom for drivers to govern themselves. Finding that balance was not a one off decision. Each adjustment changed behaviour and had to be watched. Covid and the staffing shortages that followed made it harder again.',
          'Across nearly 20 years, we only had enough drivers for brief periods. Demand almost always exceeded supply, even during recessions. That was both the joy and the stress of owning a busy business. There was always work available. The difficulty was having enough capacity in the right place at the right time. No single rule could remove that underlying pressure.',
          'Good management was not about discovering a perfect system and leaving it alone. It meant watching what people actually did, understanding why they did it and deciding whether the next change would improve the overall result or simply move the problem somewhere else.',
          'Every rule changes behaviour.',
          'Sometimes the behaviour it creates becomes the next problem the business has to solve.'
        ].map((p) => `<p>${p}</p>`).join('');

        const indexSummary7 = "Four attempts to fix a taxi rota, and four new problems created in the process. On why there's no perfect rule, only a balance worth re-watching.";

        const a7Rows = [
          [`${a7}.label`, 'USEFUL THINKING'],
          [`${a7}.heading`, 'Every Rule Changes Behaviour'],
          [`${a7}.index_summary`, indexSummary7],
          [`${a7}.body`, bodyParagraphs7],
          [`${a7}.related_text`, ''],
          [`${a7}.related_link`, ''],
          [`${a7}.image`, '']
        ];
        for (const [key, value] of a7Rows) {
          await db.query(
            'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
            [key, value]
          );
        }

        const { rows: maxSortRows7 } = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM pages');
        await db.query(
          `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav, meta_description)
           VALUES ('every-rule-changes-behaviour', 'Every Rule Changes Behaviour', $1, $2::jsonb, '[]'::jsonb, '[]'::jsonb, false, $3)`,
          [maxSortRows7[0].max_sort + 1, JSON.stringify([a7]), indexSummary7]
        );

        console.log(`Useful Thinking: 6th article published (${a7}, every-rule-changes-behaviour).`);
      } else {
        console.log('Useful Thinking 6th article migration skipped: could not allocate an instance ID.');
      }
    }
  }

  // Migration: correct voice and remove the banned fire metaphor on the
  // hidden Business Consultant Devon Google Ads landing page (01/08/2026,
  // per Tom's review follow-up). The page's `casestudy` (base instance)
  // phase bodies were written in first person ("I was brought into...")
  // and left "constant firefighting" in place after both were fixed
  // elsewhere on the site (About Us already tells the same kind of story
  // in third person; the homepage hero dropped "firefighting" back on
  // 21/07/2026). Uses targeted substring replacement rather than a
  // whole-value match — the live rows carry embedded newlines around the
  // <br /><br /> breaks that a full-string compare would need to guess
  // exactly, where REPLACE() just leaves that formatting untouched. Each
  // substitution is guarded on the OLD phrase still being present, so this
  // is a true no-op once applied and never touches a row Tom has since
  // edited by hand.
  {
    const devonPhaseFixes = [
      ['casestudy.phase_1_body', 'I was brought into an <strong>insolvent Devon business</strong>', 'Tom was brought into an <strong>insolvent Devon business</strong>'],
      ['casestudy.phase_2_body', 'I rebuilt the structure, restored financial control and stabilised the business.', 'Tom rebuilt the structure, restored financial control and stabilised the business.'],
      ['casestudy.phase_2_body', 'without depending on constant firefighting.', 'without depending on constant intervention.'],
      ['casestudy.phase_3_body', 'Separately, I built, grew and sold my own business in a <strong>seven-figure exit.</strong>', 'Separately, Tom built, grew and sold his own business in a <strong>seven-figure exit.</strong>']
    ];
    let devonFixCount = 0;
    for (const [key, oldPhrase, newPhrase] of devonPhaseFixes) {
      const { rowCount } = await db.query(
        `UPDATE content SET content = REPLACE(content, $1, $2)
         WHERE section_key = $3 AND content LIKE '%' || $1 || '%'`,
        [oldPhrase, newPhrase, key]
      );
      devonFixCount += rowCount;
    }
    if (devonFixCount > 0) console.log(`Business Consultant Devon: corrected voice / removed fire metaphor on ${devonFixCount} row(s).`);
  }

  // Migration: set a site-wide default Open Graph image (01/08/2026, per
  // Tom's review follow-up — every page was rendering with no og:image at
  // all, so shared links had no preview anywhere). Uses the existing logo
  // image (served at /img/logo, already uploaded via the CMS) rather than
  // the headshot: the logo's 2:1 aspect is close to the ~1.91:1 ratio
  // social platforms crop to, while the headshot's 3:4 portrait would be
  // cropped awkwardly. Stored as a full absolute URL, not root-relative —
  // views/index.ejs renders seo.ogImage as-is with no origin prefixing, and
  // the Open Graph spec requires og:image to be absolute for crawlers to
  // fetch it. Only sets it while the field is still the shipped-blank
  // default, so it never overwrites a value Tom sets himself via the SEO:
  // site defaults panel.
  {
    const { rowCount: ogImageSet } = await db.query(
      "UPDATE content SET content = $1 WHERE section_key = 'seo.default_og_image' AND content = ''",
      ['https://www.arringtonconsultancy.com/img/logo']
    );
    if (ogImageSet > 0) console.log('Set site-wide default Open Graph image (seo.default_og_image).');
  }

  // Keep only the 3 most recent backups. Idempotent: no-op when there are ≤3.
  const { rowCount: prunedBackups } = await db.query(
    `DELETE FROM backups
     WHERE id NOT IN (
       SELECT id FROM backups ORDER BY created_at DESC LIMIT 3
     )`
  );
  if (prunedBackups > 0) console.log(`Pruned ${prunedBackups} old backup(s); keeping the 3 most recent.`);

  // Seed images (idempotent: ON CONFLICT DO NOTHING)
  // `headshot__hero__5` is the per-instance photo for the Websites and AI
  // page's hero (confirmed live as instance id hero__5 — see the migration
  // above). Tom's own photo, supplied after the page went live; before this
  // the hero fell back to the site's default `headshot` image, same as any
  // freshly-added hero. Re-compressed from the original ~2.9MB PNG to a
  // ~130KB JPEG (quality 85) — visually identical at hero-background size,
  // well under the CMS's 2MB upload cap.
  const images = [
    { key: 'logo', file: 'logo.avif', mime: 'image/avif' },
    { key: 'headshot', file: 'headshot.png', mime: 'image/png' },
    { key: 'oxford', file: 'oxford.png', mime: 'image/png' },
    { key: 'headshot__hero__5', file: 'hero-websites-and-ai.jpg', mime: 'image/jpeg' },
    // The <picture> element's <source> always requests `<key>__webp` and,
    // unlike the <img> fallback, a failed source fetch has no defined
    // fallback in the picture-element spec — without this row, WebP-
    // preferring browsers (Safari, Chrome, most of the rest) would silently
    // fall back to `headshot__webp` (the old default portrait) instead of
    // this photo. Same source image as headshot__hero__5, WebP-encoded.
    { key: 'headshot__hero__5__webp', file: 'hero-websites-and-ai.webp', mime: 'image/webp' }
  ];

  for (const img of images) {
    const filePath = path.join(__dirname, '..', img.file);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      await db.query(
        `INSERT INTO images (image_key, data, mime_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (image_key) DO NOTHING`,
        [img.key, data, img.mime]
      );
    }
  }
  console.log('Images seeded.');

  // Migration: swap the Websites and AI hero photo for Tom's preferred
  // version (30/07/2026 - the first upload was replaced same-day with a
  // photo he liked better). Only replaces the stored image if it still
  // matches the exact bytes of the photo it's replacing, so a later manual
  // re-upload via the CMS admin UI is never silently overwritten by this
  // migration running again on a future boot.
  {
    const photoSwaps = [
      { key: 'headshot__hero__5', oldMd5: 'a18db38f68cf92ee335ecd645a9456d0', file: 'hero-websites-and-ai.jpg', mime: 'image/jpeg' },
      { key: 'headshot__hero__5__webp', oldMd5: '068d0a2e6de052234c2b9c028dddc6d1', file: 'hero-websites-and-ai.webp', mime: 'image/webp' }
    ];
    for (const s of photoSwaps) {
      const { rows } = await db.query('SELECT data FROM images WHERE image_key = $1', [s.key]);
      if (rows.length === 0) continue;
      const currentMd5 = crypto.createHash('md5').update(rows[0].data).digest('hex');
      if (currentMd5 === s.oldMd5) {
        const filePath = path.join(__dirname, '..', s.file);
        const data = fs.readFileSync(filePath);
        await db.query('UPDATE images SET data = $1, mime_type = $2 WHERE image_key = $3', [data, s.mime, s.key]);
        console.log(`Swapped ${s.key} to Tom's preferred photo.`);
      }
    }
  }

  console.log('Seed complete.');
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
