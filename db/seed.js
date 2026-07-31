const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('./pool');
const defaults = require('./defaults');

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
        const closingId = allocate('intervention');
        const wwdLinkId = allocate('intervention');

        if (heroId && startId && whyId && areasId && examplesId && howId && wontId && closingId && wwdLinkId) {
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

            // SECTION 8 — intervention (closing)
            [`${closingId}.heading`, 'Technology should make the business stronger, not more complicated'],
            [`${closingId}.subtext`, 'If a stronger website, better systems or practical AI could genuinely improve the way the business operates, that is where the conversation should start.'],
            [`${closingId}.button_text`, 'Book a 30 minute conversation'],
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

          const pageOrder = [heroId, startId, whyId, areasId, examplesId, howId, wontId, closingId];

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
