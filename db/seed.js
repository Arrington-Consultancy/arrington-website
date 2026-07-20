const fs = require('fs');
const path = require('path');
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

  // Keep only the 3 most recent backups. Idempotent: no-op when there are ≤3.
  const { rowCount: prunedBackups } = await db.query(
    `DELETE FROM backups
     WHERE id NOT IN (
       SELECT id FROM backups ORDER BY created_at DESC LIMIT 3
     )`
  );
  if (prunedBackups > 0) console.log(`Pruned ${prunedBackups} old backup(s); keeping the 3 most recent.`);

  // Seed images (idempotent: ON CONFLICT DO NOTHING)
  const images = [
    { key: 'logo', file: 'logo.avif', mime: 'image/avif' },
    { key: 'headshot', file: 'headshot.png', mime: 'image/png' },
    { key: 'oxford', file: 'oxford.png', mime: 'image/png' }
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

  console.log('Seed complete.');
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
