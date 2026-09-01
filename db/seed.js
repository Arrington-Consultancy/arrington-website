const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('./pool');
const defaults = require('./defaults');
const {
  FIRST_BATCH_PAGES,
  HELD_ARTICLE_INSTANCE_ID,
  LIBRARY_INSTANCE_ID,
  EDITORIAL_INDEX_MARKER_KEY,
  FIFTH_PUBLISHED_ARTICLE,
  SIXTH_PUBLISHED_ARTICLE,
  SEVENTH_PUBLISHED_ARTICLE,
  EIGHTH_PUBLISHED_ARTICLE,
  NINTH_PUBLISHED_ARTICLE,
  TENTH_PUBLISHED_ARTICLE,
  ELEVENTH_PUBLISHED_ARTICLE,
  TWELFTH_PUBLISHED_ARTICLE,
  THIRTEENTH_PUBLISHED_ARTICLE,
  buildUsefulThinkingPageOrder
} = require('../lib/usefulThinkingSeed');
const { ARTICLES: UT_ARTICLES } = require('../lib/usefulThinkingArticles');
const { generateUniqueShortReference } = require('../lib/shortReference');
const { resolveWaiSeedMode, waiSeedWrites: waiWritesAllowed } = require('../lib/waiSeedMode');
const { SCOTT_PAGE_SLUG } = require('../lib/scott/access');
const { seedScottData } = require('../lib/scott/data/seedData');

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

  // Migration: governance finding J2 (31/08/2026). The failed-unlock
  // alert's per-account cooldown was keyed by substring-matching the
  // account name inside the human-readable summary, so rewording the
  // message would have silently removed the cooldown and a username
  // containing a LIKE wildcard would have matched another account's
  // rows. The account a row is about now has its own column, matched
  // exactly. Existing rows default to empty, which is correct: they are
  // not about a particular account.
  await db.query(`
    ALTER TABLE workspace_activity ADD COLUMN IF NOT EXISTS subject VARCHAR(200) NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_workspace_activity_subject ON workspace_activity (event_type, subject, created_at DESC);
  `);

  // At most ONE unresolved alert claim per account, guaranteed by the
  // database rather than by sequencing.
  //
  // Governance history: the bound on this alert has been asserted and
  // broken four times (J1, K1, L1/L2, and a duplicate rate of about 5%
  // that survived even the advisory lock). Every previous fix guaranteed
  // it by arranging for callers not to overlap. This one makes the
  // overlap impossible to record: a second concurrent claim violates a
  // unique index and is refused by Postgres, whatever the callers do.
  //
  // Partial, so it constrains only unresolved claims: a claim row is
  // updated to the delivered, failed or error type once the send is
  // decided, at which point it leaves the index and the next burst can
  // claim again.
  //
  // Created here rather than in schema.sql, after the ALTER above, for
  // the reason recorded against finding J2: on an existing database
  // CREATE TABLE IF NOT EXISTS is skipped while index statements still
  // run, so an index naming a not-yet-added column fails the whole seed.
  // Retire any duplicate unresolved claims BEFORE building the index.
  //
  // This is not hypothetical: duplicate claims are exactly what the
  // defects this index exists to prevent (J1, K1) actually produced, so
  // a database that ran that code can hold them. CREATE UNIQUE INDEX
  // fails on them, and this seed runs as the start command - so without
  // this step the app would crashloop on boot on precisely the
  // deployments most likely to be affected. Same class as the Scott
  // release incident: a migration that is fine everywhere except the one
  // place it has to work.
  //
  // The newest claim per account is kept; older ones are marked
  // abandoned, which is what they are.
  await db.query(`
    UPDATE workspace_activity SET event_type = 'workspace_unlock_alert_abandoned',
           summary = 'Superseded duplicate claim, retired when the one-claim-per-account rule was introduced.'
     WHERE id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY subject ORDER BY created_at DESC, id DESC) AS rn
           FROM workspace_activity
          WHERE event_type = 'workspace_unlock_alert_pending'
       ) ranked WHERE rn > 1
     );
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_alert_pending
      ON workspace_activity (subject)
      WHERE event_type = 'workspace_unlock_alert_pending';
  `);
  console.log('Workspace activity subject column verified.');

  // Migration: Commercial Gaps Review failure-recovery columns, added
  // 01/08/2026. This is schema setup only (idempotent, one-off structural
  // change) — the actual retention/deletion of stale rows deliberately
  // does NOT live here or anywhere tied to a deploy; see the independent
  // scheduled sweep in server.js (pruneStaleCommercialGapsReviews), which
  // runs on the server's own clock so cleanup still happens on schedule
  // even across long stretches with no deploy at all.
  await db.query(`
    ALTER TABLE commercial_gaps_reviews ADD COLUMN IF NOT EXISTS short_reference VARCHAR(12) UNIQUE;
    ALTER TABLE commercial_gaps_reviews ADD COLUMN IF NOT EXISTS failure_reason TEXT NOT NULL DEFAULT '';
  `);
  await db.query(`
    DO $$ BEGIN
      ALTER TABLE commercial_gaps_reviews DROP CONSTRAINT IF EXISTS commercial_gaps_reviews_status_check;
      ALTER TABLE commercial_gaps_reviews ADD CONSTRAINT commercial_gaps_reviews_status_check
        CHECK (status IN ('in_progress', 'processing', 'completed', 'failed'));
    EXCEPTION WHEN others THEN NULL;
    END $$;
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_commercial_gaps_status_created ON commercial_gaps_reviews (status, created_at);`);

  // Migration: Where to Start purchases table columns, added 09/08/2026
  // during the corrections pass on the £500 credit design (see
  // routes/whereToStart.js). Nothing has deployed with the old shape yet,
  // but this follows the same idempotent ALTER pattern as every other
  // schema change in this file rather than assuming a fresh CREATE TABLE.
  await db.query(`
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS list_price_pence INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS credit_applied_pence INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS credit_applied_manually BOOLEAN NOT NULL DEFAULT false;
  `);
  console.log('Purchases table columns verified.');

  const { rows: needsReference } = await db.query(
    'SELECT id FROM commercial_gaps_reviews WHERE short_reference IS NULL'
  );
  for (const row of needsReference) {
    const ref = await generateUniqueShortReference('commercial_gaps_reviews', 'short_reference');
    await db.query('UPDATE commercial_gaps_reviews SET short_reference = $1 WHERE id = $2', [ref, row.id]);
  }
  console.log(`Commercial Gaps Review recovery columns verified${needsReference.length ? ` (backfilled ${needsReference.length} short reference(s))` : ''}.`);

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

  // Explicit, narrow escape hatch for a non-production deploy whose nat/tom
  // login was set up in a database this session has no record of (e.g. a
  // staging database seeded months ago, or a fresh demo service pointed at
  // an existing shared staging Postgres). Deliberately NOT something a
  // stray/copied env var could trigger by accident: requires this exact
  // variable, set to exactly 'true', plus both passwords below. Never set
  // this on production.
  //
  // UPDATEs password_hash on the existing row rather than deleting and
  // recreating it. A first attempt at this did DELETE, tested locally
  // before ever touching Railway, and failed on a real foreign key: nat/tom
  // are referenced from audit_log (every login/edit/backup/etc. writes a
  // row keyed on user id), so any account with real history cannot be
  // deleted without deleting that history too, which is not this flag's
  // job. UPDATE has no such constraint and preserves the account's id and
  // its audit trail, which is what you want for a password reset.
  if (process.env.RESET_USER_PASSWORDS === 'true') {
    const natPw = process.env.NAT_PASSWORD;
    const tomPw = process.env.TOM_PASSWORD;
    if (!natPw || !tomPw) {
      throw new Error('RESET_USER_PASSWORDS=true requires NAT_PASSWORD and TOM_PASSWORD to also be set.');
    }
    for (const [username, password] of [['nat', natPw], ['tom', tomPw]]) {
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const { rowCount } = await db.query(
        'UPDATE users SET password_hash = $1 WHERE username = $2',
        [hash, username]
      );
      console.log(`RESET_USER_PASSWORDS=true: ${username} password ${rowCount ? 'reset' : 'unchanged, no existing row to update'}.`);
    }
  }

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
            [`${docsId}.intro`, 'These are genuine examples of work produced during a commercial review. Names, organisations, locations and other identifying details have been removed or generalised, but the commercial findings and recommendations remain unchanged.'],
            [`${ctaId}.heading`, 'Every business is different'],
            [`${ctaId}.subtext`, 'The work follows the evidence, but the aim is always the same: clearer decisions, more control in the business and less day-to-day weight sitting with the owner.'],
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
          console.warn(`Evidence merge: no intervention instance found with button text "Book a 30 minute conversation", falling back to keeping ${keeperCta} as the shared closing CTA.`);
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

  // ==========================================================================
  // /websites-and-ai seed contract (15/08/2026)
  // ==========================================================================
  //
  // The four migrations below (page build 30/07, hero + WSA proof 03/08, copy
  // refinement 03/08, £999 conversion rebuild 03/08) together assemble this
  // page. They were written as a chain in which each layer overwrites the one
  // before it with `ON CONFLICT DO UPDATE`, and the last of them had no guard
  // at all. That was correct while the page was being built out, but it means
  // every boot re-asserted the seeded copy, section order, hidden/deleted
  // arrays and SEO fields, so any edit Tom made in the CMS was silently
  // reverted by the next deploy. Every other page in this file uses the safe
  // pattern instead: a run-once guard plus `ON CONFLICT DO NOTHING`, so the
  // database stays the source of truth once a page is live.
  //
  // This gate applies that same rule to the chain as a whole, without
  // rewriting the four migrations or changing a single instance ID. Exactly
  // one mode is chosen per seed run, before any of them execute:
  //
  //   'fresh'   the page row did not exist when this run started, so this is
  //             a new database or a disaster-recovery rebuild. The full chain
  //             runs exactly as it always has (each layer still overwrites the
  //             last, which is what produces the final approved page), then
  //             the marker is stamped.
  //
  //   'adopt'   the page exists but carries no marker: a database seeded
  //             before this gate existed, which is production today. Nothing
  //             is written. The marker is stamped so the run becomes 'skip'
  //             from then on. Live content is left exactly as it is.
  //
  //   'skip'    the marker already matches WAI_SEED_REVISION. No writes at
  //             all. This is the steady state on every normal deploy.
  //
  //   'replay'  the marker is present but different, i.e. someone has
  //             deliberately bumped WAI_SEED_REVISION. The chain runs and
  //             overwrites live content, then re-stamps. This is the only
  //             way seeded copy can ever overwrite a CMS edit again, and it
  //             requires an explicit code change to trigger.
  //
  // Bumping WAI_SEED_REVISION is therefore a destructive act on this page and
  // should only be done when the seed is deliberately being made the source of
  // truth again. Routine copy changes belong in the CMS.
  //
  // Covered by test/websites-and-ai-seed.test.js, which asserts each mode's
  // behaviour directly, and by the two-pass seed check in the same file.
  const WAI_SEED_REVISION = '2026-08-15-999-conversion-page';
  const WAI_REVISION_KEY = 'seed.websites_and_ai_revision';
  const waiSeedMode = await resolveWaiSeedMode(db, WAI_SEED_REVISION, WAI_REVISION_KEY);
  const waiSeedWrites = waiWritesAllowed(waiSeedMode);
  console.log(`Websites and AI seed mode: ${waiSeedMode}${waiSeedWrites ? '' : ' (no content writes)'}.`);

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
        const wsaId = allocate('casestudy2');
        const startId = allocate('biography');
        const whyId = allocate('filter');
        const areasId = allocate('biography');
        const examplesId = allocate('insights');
        const howId = allocate('fourcards');
        const wontId = allocate('filter');
        const closingId = allocate('intervention');
        const wwdLinkId = allocate('intervention');

        if (heroId && wsaId && startId && whyId && areasId && examplesId && howId && wontId && closingId && wwdLinkId) {
          const newHeroSubtext = 'If we built World Student Advisors for £999, imagine what we could build for your business.<br><br>'
            + "We'll build it around your business, not around a template.";
          const rows = [
            // SECTION 1 — hero (£999 offer headline)
            [`${heroId}.heading`, 'A business website built around how you work'],
            [`${heroId}.subtext`, newHeroSubtext],
            [`${heroId}.cta`, 'Tell us what you want to build'],
            [`${heroId}.whatsapp`, ''],

            // SECTION 2 — casestudy2 (World Student Advisors proof)
            [`${wsaId}.label`, 'OUR WORK'],
            [`${wsaId}.heading`, 'World Student Advisors'],
            [`${wsaId}.intro`, 'We built World Student Advisors for £999.'],
            [`${wsaId}.body`, "It includes Pipedrive CRM, Microsoft 365, Google Reviews, AI interview practice, AI visa interview preparation and responsive layouts across desktop and mobile.<br><br>Every part of it was built around how the business actually works."],
            [`${wsaId}.outcome`, "That's what £999 looks like."],
            [`${wsaId}.button_text`, 'View the World Student Advisors website'],
            [`${wsaId}.button_href`, 'https://www.worldstudentadvisors.com/'],

            // SECTION 3 — biography (start with the business, not the technology)
            [`${startId}.label`, 'THE BUSINESS FIRST'],
            [`${startId}.heading`, 'Start with the business, not the technology'],
            [`${startId}.col_1_p1`, 'Most businesses do not need a website judged in isolation. The useful question is what the website, AI or systems can help the business do.'],
            [`${startId}.col_1_p2`, "That might be enquiries that need more context before a conversation, repeated questions, or knowledge that still sits mostly with the owner."],
            [`${startId}.col_2_p1`, 'It might be follow-up spread across too many manual steps, administration that takes time from higher-value work, or decisions still waiting for the owner because the business has grown around them.'],
            [`${startId}.col_2_p2`, 'We look at what is actually happening in the business first. The technology comes after, and only where it earns its place.'],

            // SECTION 4 — filter (built around you)
            [`${whyId}.label`, 'WHY WE ARE DIFFERENT'],
            [`${whyId}.heading`, 'We start with the business, not the brief'],
            [`${whyId}.p1`, "Most websites start with a template. We start with the business. We listen carefully, understand what you're trying to achieve and build around that."],
            [`${whyId}.p2`, "We bring an outside perspective, explain the trade-offs and help shape the route that fits the business. The decisions stay with you. It's your business and your website."],
            [`${whyId}.button_text`, ''],
            [`${whyId}.button_link`, 'main'],

            // SECTION 5 — biography (two implementation areas)
            [`${areasId}.label`, 'TWO WAYS WE PUT IT INTO PRACTICE'],
            [`${areasId}.heading`, 'Two implementation areas'],
            [`${areasId}.col_1_p1`, '<strong>Commercial websites.</strong> More suitable enquiries, clearer positioning and stronger credibility.'],
            [`${areasId}.col_1_p2`, 'More useful conversations, the right information captured before a meeting even starts, and less time spent with people who were never a fit.'],
            [`${areasId}.col_2_p1`, "<strong>Practical AI.</strong> Internal knowledge that does not live only in the owner's head, consistent enquiry handling, and clearer business reviews."],
            [`${areasId}.col_2_p2`, 'Faster document analysis, stronger meeting preparation, more support for staff, and less reliance on the owner for every answer.'],

            // SECTION 6 — insights (real examples)
            [`${examplesId}.label`, 'REAL ARRINGTON EXAMPLES'],
            [`${examplesId}.heading`, 'Proof from our own work'],
            [`${examplesId}.subtext`, 'We do not ask a business to try something we have not tried ourselves.'],
            [`${examplesId}.card_1_tag`, 'OWNER CHECK'],
            [`${examplesId}.card_1_title`, 'Owner Check'],
            [`${examplesId}.card_1_body`, 'A practical self-diagnostic that shows an owner where their judgement, knowledge or oversight still carries the business day to day, with an actionable score rather than a vague opinion.'],
            [`${examplesId}.card_2_tag`, 'COMMERCIAL GAPS REVIEW'],
            [`${examplesId}.card_2_title`, 'Commercial Gaps Review'],
            [`${examplesId}.card_2_body`, 'An automated commercial review that gives an owner real clarity on where the pressure is, built so it costs nothing to run and never invents a fact about the business.'],
            [`${examplesId}.card_3_tag`, 'THIS WEBSITE'],
            [`${examplesId}.card_3_title`, 'The Arrington Consultancy website'],
            [`${examplesId}.card_3_body`, 'Built to generate serious enquiries from suitable owners, not to win design awards. Every page exists to move a real conversation forward.'],

            // SECTION 7 — fourcards (how the work happens)
            [`${howId}.label`, 'HOW THE WORK HAPPENS'],
            [`${howId}.heading`, 'Understand, design, build, refine'],
            [`${howId}.card_1_number`, '01'],
            [`${howId}.card_1_title`, 'Understand'],
            [`${howId}.card_1_body`, 'We look at what is actually happening in the business before anything is designed or built.'],
            [`${howId}.card_2_number`, '02'],
            [`${howId}.card_2_title`, 'Design'],
            [`${howId}.card_2_body`, 'We decide what is worth building, and whether a website, AI, a process change or a combination is the right answer.'],
            [`${howId}.card_3_number`, '03'],
            [`${howId}.card_3_title`, 'Build'],
            [`${howId}.card_3_body`, 'We build only what earns its place, in plain language the business can actually use.'],
            [`${howId}.card_4_number`, '04'],
            [`${howId}.card_4_title`, 'Refine'],
            [`${howId}.card_4_body`, 'We check what is working and refine where the evidence says it is worth refining. The business keeps control of it, not us.'],

            // SECTION 8 — filter (technology section)
            [`${wontId}.label`, 'WHAT WE WILL NOT DO'],
            [`${wontId}.heading`, 'Technology should earn its place'],
            [`${wontId}.p1`, "We recommend websites, AI and systems when they genuinely help the business. If they don't, we won't recommend them."],
            [`${wontId}.p2`, ''],
            [`${wontId}.button_text`, ''],
            [`${wontId}.button_link`, 'main'],

            // SECTION 9 — intervention (closing)
            [`${closingId}.heading`, 'Technology should make the business easier to run, not more complicated'],
            [`${closingId}.subtext`, 'If a website, practical AI or connected systems could help the business show its real standard and reduce repeated manual work, that is where the conversation should start.'],
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

          // Order: hero → WSA proof → biography → filter → biography → insights
          //        → fourcards → filter → intervention (closing)
          const pageOrder = [heroId, wsaId, startId, whyId, areasId, examplesId, howId, wontId, closingId];

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

          console.log(`Websites and AI page created (sort_order ${wwdSort + 1}, hero=${heroId}, wsa=${wsaId}), contextual link (${wwdLinkId}) appended to What We Do.`);
        } else {
          console.log('Websites and AI migration skipped: could not allocate instance IDs.');
        }
      } else {
        console.log('Websites and AI migration skipped: What We Do page does not exist yet.');
      }
    }
  }

  // Migration: replace hero copy with the £999 offer headline, add World
  // Student Advisors proof section, and remove the old separate offer section
  // (03/08/2026). Idempotent: each step is guarded by a check that the live
  // value already matches the target or the target state already exists.
  {
    const { rows: wsRows } = await db.query(
      "SELECT section_order FROM pages WHERE slug = 'websites-and-ai'"
    );
    // Gated by the seed contract above: this layer's own guard was an exact
    // match on the hero heading, which inverts the moment Tom edits that
    // heading in the CMS and would then overwrite his edit.
    if (waiSeedWrites && wsRows.length > 0) {
      const pageOrder = Array.isArray(wsRows[0].section_order) ? wsRows[0].section_order : [];
      const baseOf = (id) => {
        const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
        return m ? m[1] : null;
      };

      // Find the hero and (last) intervention instances on this page.
      const heroId = pageOrder.find((id) => baseOf(id) === 'hero');
      let closingId = null;
      for (let i = pageOrder.length - 1; i >= 0; i--) {
        if (baseOf(pageOrder[i]) === 'intervention') { closingId = pageOrder[i]; break; }
      }

      if (heroId) {
        const newHeroSubtext = 'Tell us what you want your website to do.<br><br>'
          + 'That might be a simple holding page. It might be a substantial coded build with Pipedrive CRM, Microsoft 365 email, Google Reviews, YouTube, AI tools or an AI assistant built into the site.<br><br>'
          + 'The price is £999.<br><br>'
          + 'We agree the website during a one-hour recorded conversation, build what was agreed and include one structured round of changes after the first complete version.<br><br>'
          + 'Further changes are charged at £300 per day, based on approximately six working hours.';

        // 1. Update hero content (skip if already up to date).
        const { rows: hRows } = await db.query(
          'SELECT content FROM content WHERE section_key = $1',
          [`${heroId}.heading`]
        );
        const existingHeading = (hRows[0] && hRows[0].content) || '';
        if (existingHeading !== 'A business website built around how you work') {
          await db.query(
            'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content',
            [`${heroId}.heading`, 'A business website built around how you work']
          );
          await db.query(
            'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content',
            [`${heroId}.subtext`, newHeroSubtext]
          );
          await db.query(
            'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content',
            [`${heroId}.cta`, 'Tell us what you want to build']
          );
          console.log(`Websites and AI: hero content updated (${heroId}).`);
        }

        // 2. Add WSA proof casestudy2 section if not already present.
        const wsaExists = pageOrder.some((id) => baseOf(id) === 'casestudy2');
        let wsaId = null;
        if (!wsaExists) {
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

          wsaId = allocate('casestudy2');
          if (wsaId) {
            const wsaRows = [
              [`${wsaId}.label`, 'OUR WORK'],
              [`${wsaId}.heading`, 'World Student Advisors'],
              [`${wsaId}.intro`, 'We built World Student Advisors for £999.'],
              [`${wsaId}.body`, "It's a fully coded HTML website with Pipedrive CRM, Microsoft 365 integration, Google Reviews, AI interview practice, AI visa interview preparation and responsive layouts across desktop, tablet and mobile.<br><br>Everything was built around how the business actually works."],
              [`${wsaId}.outcome`, 'That is the standard we expect £999 to deliver.'],
              [`${wsaId}.button_text`, 'View the World Student Advisors website'],
              [`${wsaId}.button_href`, 'https://www.worldstudentadvisors.com/']
            ];
            for (const [key, value] of wsaRows) {
              await db.query(
                'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
                [key, value]
              );
            }
            console.log(`Websites and AI: WSA proof section created (${wsaId}).`);
          }
        } else {
          // Already exists — find the instance ID so we can keep it in the order.
          wsaId = pageOrder.find((id) => baseOf(id) === 'casestudy2');
        }

        // 3. Find any offer section (biography with the old £999 headline) and
        //    remove it from section_order.
        const { rows: offerHeadingRows } = await db.query(
          "SELECT split_part(section_key, '.', 1) AS iid FROM content WHERE section_key LIKE '%.heading' AND content = $1",
          ['A genuinely bespoke website \u2014 from \u00a3999']
        );
        const offerIds = offerHeadingRows
          .map((r) => r.iid)
          .filter((iid) => pageOrder.includes(iid) && baseOf(iid) === 'biography');

        // 4. Compute the new section_order.
        //    hero → WSA proof → [rest, without offer sections]
        let newOrder = pageOrder.filter((id) => !offerIds.includes(id));
        if (wsaId && !newOrder.includes(wsaId)) {
          const heroIdx = newOrder.findIndex((id) => baseOf(id) === 'hero');
          const insertIdx = heroIdx >= 0 ? heroIdx + 1 : 0;
          newOrder.splice(insertIdx, 0, wsaId);
        }
        if (JSON.stringify(newOrder) !== JSON.stringify(pageOrder)) {
          await db.query(
            'UPDATE pages SET section_order = $1::jsonb WHERE slug = $2',
            [JSON.stringify(newOrder), 'websites-and-ai']
          );
          console.log(`Websites and AI: section_order updated.`);
        }

        // 5. Update closing CTA button text if still on the old value.
        if (closingId) {
          const { rows: ctaRows } = await db.query(
            'SELECT content FROM content WHERE section_key = $1',
            [`${closingId}.button_text`]
          );
          const ctaText = (ctaRows[0] && ctaRows[0].content) || '';
          if (ctaText === 'Book a 30 minute conversation') {
            await db.query(
              'UPDATE content SET content = $1 WHERE section_key = $2',
              ['Tell us what you want to build', `${closingId}.button_text`]
            );
          }
        }
      }
    }
  }

  // Migration: websites-and-ai copy refinement (03/08/2026). Updates the
  // hero subtext, WSA proof section, BUILT AROUND YOU filter, and TECHNOLOGY
  // filter to the new approved copy. Also seeds page-specific contact
  // overrides (wai.contact_heading / wai.contact_body) for the
  // websites-and-ai page only, leaving the global contact section untouched.
  // Idempotent: uses DO UPDATE SET so safe to run on both fresh and live DBs.
  {
    const { rows: waRows } = await db.query(
      "SELECT section_order FROM pages WHERE slug = 'websites-and-ai'"
    );
    // Gated by the seed contract above: same inverting hero-heading guard as
    // the previous layer.
    if (waiSeedWrites && waRows.length > 0) {
      const pageOrder = Array.isArray(waRows[0].section_order) ? waRows[0].section_order : [];
      const baseOf = (id) => {
        const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
        return m ? m[1] : null;
      };

      const heroId = pageOrder.find((id) => baseOf(id) === 'hero');
      const wsaId = pageOrder.find((id) => baseOf(id) === 'casestudy2');
      const filters = pageOrder.filter((id) => baseOf(id) === 'filter');
      const whyId = filters[0];  // first filter = BUILT AROUND YOU
      const wontId = filters[1]; // second filter = TECHNOLOGY SECTION

      const upsert = async (key, value) => {
        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content',
          [key, value]
        );
      };

      let hasFinalHeading = false;
      if (heroId) {
        const { rows: finalHeadingRows } = await db.query(
          'SELECT content FROM content WHERE section_key = $1',
          [`${heroId}.heading`]
        );
        hasFinalHeading = ((finalHeadingRows[0] && finalHeadingRows[0].content) || '') === 'A business website built around how you work';
      }

      if (!hasFinalHeading) {
        if (heroId) {
          await upsert(`${heroId}.subtext`,
            'If we built World Student Advisors for £999, imagine what we could build for your business.<br><br>'
            + "We'll build it around your business, not around a template."
          );
        }

        if (wsaId) {
          await upsert(`${wsaId}.intro`, 'We built World Student Advisors for £999.');
          await upsert(`${wsaId}.body`,
            'It includes Pipedrive CRM, Microsoft 365, Google Reviews, AI interview practice, AI visa interview preparation and responsive layouts across desktop and mobile.<br><br>'
            + 'Every part of it was built around how the business actually works.'
          );
          await upsert(`${wsaId}.outcome`, "That's what £999 looks like.");
          await upsert(`${wsaId}.button_text`, 'View the World Student Advisors website');
          await upsert(`${wsaId}.button_href`, 'https://www.worldstudentadvisors.com/');
        }

        if (whyId) {
          await upsert(`${whyId}.p1`, "Most websites start with a template. We start with the business. We listen carefully, understand what you're trying to achieve and build around that.");
          await upsert(`${whyId}.p2`, "We bring an outside perspective, explain the trade-offs and help shape the route that fits the business. The decisions stay with you. It's your business and your website.");
        }

        if (wontId) {
          await upsert(`${wontId}.heading`, 'Technology should earn its place');
          await upsert(`${wontId}.p1`, "We recommend websites, AI and systems when they genuinely help the business. If they don't, we won't recommend them.");
          await upsert(`${wontId}.p2`, '');
        }

        // Page-specific contact overrides for websites-and-ai only.
        // The global contact.heading / contact.body are left unchanged so all
        // other pages continue to use the shared contact section as before.
        await upsert('wai.contact_heading', 'Tell us what you want to build.');
        await upsert('wai.contact_body',
          "You don't need a specification.<br><br>"
          + "You don't need wireframes.<br><br>"
          + "You don't even need to know exactly what the finished website looks like.<br><br>"
          + "Tell us what you're trying to achieve.<br><br>"
          + "We'll tell you what we'd do and why."
        );

        console.log('Websites and AI: copy refinement migration applied.');
      }
    }
  }

  // Migration: rebuild Websites and AI as the approved £999 conversion page
  // (03/08/2026). Enforces the exact five body sections before the shared
  // footer, removes the older repetitive sections from the page order, and
  // seeds page-specific contact copy without touching the global contact
  // defaults used by the consultancy pages.
  {
    let { rows: waRows } = await db.query(
      "SELECT section_order FROM pages WHERE slug = 'websites-and-ai'"
    );
    const baseOf = (id) => {
      const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
      return m ? m[1] : null;
    };

    const collectUsedIds = async () => {
      const { rows: orderRows } = await db.query('SELECT section_order FROM pages');
      const used = new Set();
      for (const r of orderRows) {
        if (Array.isArray(r.section_order)) r.section_order.forEach((s) => used.add(s));
      }
      const { rows: prefixRows } = await db.query(
        "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content"
      );
      prefixRows.forEach((r) => used.add(r.instance_id));
      return used;
    };

    const makeAllocator = (used) => (tpl) => {
      if (!used.has(tpl)) { used.add(tpl); return tpl; }
      for (let n = 2; n <= 99; n++) {
        const id = `${tpl}__${n}`;
        if (!used.has(id)) { used.add(id); return id; }
      }
      return null;
    };

    const upsert = async (key, value) => {
      await db.query(
        'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content',
        [key, value]
      );
    };

    const seedImageIfMissing = async (key, file, mime) => {
      const filePath = path.join(__dirname, '..', file);
      if (!fs.existsSync(filePath)) return;
      await db.query(
        `INSERT INTO images (image_key, data, mime_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (image_key) DO NOTHING`,
        [key, fs.readFileSync(filePath), mime]
      );
    };

    // Gated by the seed contract above. This layer previously had no guard of
    // any kind: it re-asserted every content key, the section order, the
    // hidden/deleted arrays and the page's SEO fields on every single boot.
    if (waiSeedWrites && waRows.length === 0) {
      const used = await collectUsedIds();
      const allocate = makeAllocator(used);
      const seedOrder = [
        allocate('hero'),
        allocate('casestudy2'),
        allocate('filter'),
        allocate('fourcards'),
        allocate('filter')
      ].filter(Boolean);

      const { rows: wwdSortRows } = await db.query("SELECT sort_order FROM pages WHERE slug = 'what-we-do'");
      let waiSort = null;
      if (wwdSortRows.length > 0) {
        const wwdSort = wwdSortRows[0].sort_order;
        await db.query('UPDATE pages SET sort_order = sort_order + 1 WHERE sort_order > $1', [wwdSort]);
        waiSort = wwdSort + 1;
      } else {
        const { rows: maxRows } = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM pages');
        waiSort = Number(maxRows[0].max_sort || 0) + 1;
      }

      await db.query(
        `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav)
         VALUES ('websites-and-ai', 'Websites and AI', $1, $2::jsonb, '[]'::jsonb, '[]'::jsonb, false)`,
        [waiSort, JSON.stringify(seedOrder)]
      );
      waRows = [{ section_order: seedOrder }];
    }

    if (waiSeedWrites && waRows.length > 0) {
      const pageOrder = Array.isArray(waRows[0].section_order) ? waRows[0].section_order : [];
      const { rows: pageContentRows } = await db.query(
        `SELECT section_key, content
         FROM content
         WHERE split_part(section_key, '.', 1) = ANY($1::text[])`,
        [pageOrder]
      );
      const sectionFields = {};
      for (const r of pageContentRows) {
        const dot = r.section_key.indexOf('.');
        if (dot < 0) continue;
        const iid = r.section_key.slice(0, dot);
        const field = r.section_key.slice(dot + 1);
        if (!sectionFields[iid]) sectionFields[iid] = {};
        sectionFields[iid][field] = r.content || '';
      }

      const idsByBase = (base) => pageOrder.filter((id) => baseOf(id) === base);
      const findBy = (base, predicate, exclude = new Set()) => {
        const ids = idsByBase(base).filter((id) => !exclude.has(id));
        for (const id of ids) {
          if (predicate(sectionFields[id] || {}, id)) return id;
        }
        return ids[0] || null;
      };

      let heroId = idsByBase('hero')[0] || null;
      let wsaId = idsByBase('casestudy2')[0] || null;
      let includesId = findBy('filter', (f) =>
        (f.label || '').trim() === 'THE £999 BUILD' || (f.heading || '').trim() === 'What you get'
      );
      const usedFilterIds = new Set(includesId ? [includesId] : []);
      let whyId = findBy('filter', (f) =>
        (f.label || '').trim() === 'WHY ARRINGTON' || (f.heading || '').trim() === 'Built by someone who understands business',
        usedFilterIds
      );
      let processId = idsByBase('fourcards')[0] || null;

      if (!heroId || !wsaId || !includesId || !processId || !whyId) {
        const used = await collectUsedIds();
        const allocate = makeAllocator(used);
        if (!heroId) heroId = allocate('hero');
        if (!wsaId) wsaId = allocate('casestudy2');
        if (!includesId) includesId = allocate('filter');
        if (!processId) processId = allocate('fourcards');
        if (!whyId) whyId = allocate('filter');
      }

      const clearFilterExtras = async (id) => {
        if (!id) return;
        for (let n = 1; n <= 8; n++) await upsert(`${id}.item_${n}`, '');
        for (let n = 1; n <= 3; n++) {
          await upsert(`${id}.row_${n}_action`, '');
          await upsert(`${id}.row_${n}_client`, '');
        }
        await upsert(`${id}.intro`, '');
        await upsert(`${id}.closing`, '');
        await upsert(`${id}.button_text`, '');
        await upsert(`${id}.button_link`, 'main');
      };

      if (heroId) {
        await upsert(`${heroId}.label`, 'BUSINESS WEBSITES');
        await upsert(`${heroId}.heading`, 'A business website built around how you work');
        // Conversion polish (15/08/2026): "built around how your business
        // operates" was stated four times, three of them inside the first
        // phone screen (headline, this subtext, bullet 3) and again as the
        // first "What you get" line. The headline keeps it; the repeats are
        // dropped. The second sentence here carries a genuinely different
        // claim, so only the duplicated one goes.
        await upsert(`${heroId}.subtext`, 'If we built World Student Advisors for £999, imagine what we could build for your business.<br><br>Not dropped into a template.');
        // proof_text is deliberately empty: it and the CTA below both pointed
        // at the same WSA anchor, two links ~200px apart in the hero doing an
        // identical job. "See what £999 looks like" is the stronger of the
        // two because it ties the price to the evidence, so it is the one
        // kept. proof_href is left set and simply unused - the hero only
        // renders the link when proof_text is non-empty.
        await upsert(`${heroId}.proof_text`, '');
        await upsert(`${heroId}.proof_href`, wsaId ? `#${wsaId}` : '#conversation');
        await upsert(`${heroId}.bullet_1`, 'Fixed £999 price');
        await upsert(`${heroId}.bullet_2`, 'Mobile ready');
        await upsert(`${heroId}.bullet_3`, '');
        await upsert(`${heroId}.cta`, 'See what £999 looks like');
        await upsert(`${heroId}.cta_href`, wsaId ? `#${wsaId}` : '#conversation');
        await upsert(`${heroId}.secondary_text`, 'Tell us what you want to build');
        await upsert(`${heroId}.secondary_href`, '#conversation');
        await upsert(`${heroId}.cta_link`, '');
        await upsert(`${heroId}.whatsapp`, '');

        await seedImageIfMissing(`headshot__${heroId}`, 'hero-websites-and-ai.jpg', 'image/jpeg');
        await seedImageIfMissing(`headshot__${heroId}__webp`, 'hero-websites-and-ai.webp', 'image/webp');
      }

      if (wsaId) {
        await upsert(`${wsaId}.label`, 'BUILT FOR £999');
        await upsert(`${wsaId}.heading`, 'World Student Advisors');
        await upsert(`${wsaId}.intro`, 'World Student Advisors is a fully coded website we built for £999.');
        await upsert(`${wsaId}.body`, 'It includes Pipedrive CRM, Microsoft 365, Google Reviews, AI interview practice, AI visa interview preparation and responsive layouts across desktop and mobile.<br><br>Every part of it was built around how the organisation actually works.');
        await upsert(`${wsaId}.included_heading`, 'Included in the build');
        await upsert(`${wsaId}.item_1`, 'Pipedrive CRM integration');
        await upsert(`${wsaId}.item_2`, 'Microsoft 365 integration');
        await upsert(`${wsaId}.item_3`, 'Google Reviews');
        await upsert(`${wsaId}.item_4`, 'AI interview practice');
        await upsert(`${wsaId}.item_5`, 'AI visa interview preparation');
        await upsert(`${wsaId}.item_6`, 'Responsive desktop and mobile layouts');
        await upsert(`${wsaId}.item_7`, 'Enquiry and registration forms built around what the team actually needs');
        await upsert(`${wsaId}.item_8`, '');
        await upsert(`${wsaId}.stat_number`, '');
        await upsert(`${wsaId}.stat_label`, '');
        await upsert(`${wsaId}.outcome`, '');
        await upsert(`${wsaId}.button_text`, 'View the World Student Advisors website');
        await upsert(`${wsaId}.button_href`, 'https://www.worldstudentadvisors.com/');
        await seedImageIfMissing(`screenshot__${wsaId}__1`, 'public/img/wsa/wsa-homepage.jpg', 'image/jpeg');
        await seedImageIfMissing(`screenshot__${wsaId}__2`, 'public/img/wsa/wsa-study-options.jpg', 'image/jpeg');
        await seedImageIfMissing(`screenshot__${wsaId}__3`, 'public/img/wsa/wsa-contact.jpg', 'image/jpeg');
      }

      if (includesId) {
        await clearFilterExtras(includesId);
        await upsert(`${includesId}.label`, 'THE £999 BUILD');
        await upsert(`${includesId}.heading`, 'What you get');
        await upsert(`${includesId}.intro`, 'We agree what the website needs to do before we start.');
        await upsert(`${includesId}.p1`, '');
        await upsert(`${includesId}.p2`, '');
        // item_1 was the fourth statement of the "built around how your
        // business operates" idea, and the only line in this list that was a
        // positioning claim rather than a concrete deliverable. Dropped: the
        // remaining seven are all things the buyer actually receives. The
        // filter template skips empty items, so the list simply renders seven.
        await upsert(`${includesId}.item_1`, '');
        await upsert(`${includesId}.item_2`, 'Responsive desktop and mobile build');
        await upsert(`${includesId}.item_3`, 'The agreed pages, forms and functionality');
        await upsert(`${includesId}.item_4`, 'Basic technical and on-page SEO setup');
        await upsert(`${includesId}.item_5`, 'A one-hour recorded planning conversation');
        await upsert(`${includesId}.item_6`, 'One complete first version');
        await upsert(`${includesId}.item_7`, 'One structured round of changes');
        await upsert(`${includesId}.item_8`, 'CMS access where appropriate');
        await upsert(`${includesId}.closing`, 'The price is £999.<br><br>Further changes after the agreed build and included revision are charged at £300 per day, based on approximately six working hours.');
        // Mid-page CTA (15/08/2026). Between the hero and the enquiry form
        // there were roughly six phone screens with only one clickable thing
        // in them, and that one was the World Student Advisors link, which
        // leaves the site in a new tab. So a reader convinced by "What you
        // get" - the section that actually justifies the £999 - had nothing
        // to act on without scrolling three more screens. An empty
        // button_link resolves to #conversation (the page's own enquiry form)
        // and renders as the primary button style; see the filter template's
        // _fBtnHref / _fIsPrimaryCta handling in views/index.ejs.
        await upsert(`${includesId}.button_text`, 'Tell us what you want to build');
        await upsert(`${includesId}.button_link`, '');
      }

      if (processId) {
        await upsert(`${processId}.label`, 'HOW IT WORKS');
        await upsert(`${processId}.heading`, 'From conversation to live website');
        await upsert(`${processId}.evidence_intro`, '');
        await upsert(`${processId}.card_1_number`, '01');
        await upsert(`${processId}.card_1_title`, 'Tell us what you want to build');
        await upsert(`${processId}.card_1_body`, 'We use a recorded planning conversation to agree what the website needs to do.');
        await upsert(`${processId}.card_1_link`, '');
        await upsert(`${processId}.card_2_number`, '02');
        await upsert(`${processId}.card_2_title`, 'We build it');
        await upsert(`${processId}.card_2_body`, 'We build the complete first version around what was agreed.');
        await upsert(`${processId}.card_2_link`, '');
        await upsert(`${processId}.card_3_number`, '03');
        await upsert(`${processId}.card_3_title`, 'You review it');
        await upsert(`${processId}.card_3_body`, 'You get one structured round of changes before sign-off and launch.');
        await upsert(`${processId}.card_3_link`, '');
        await upsert(`${processId}.card_4_number`, '');
        await upsert(`${processId}.card_4_title`, '');
        await upsert(`${processId}.card_4_body`, '');
        await upsert(`${processId}.card_4_link`, '');
      }

      if (whyId) {
        await clearFilterExtras(whyId);
        await upsert(`${whyId}.label`, 'WHY ARRINGTON');
        await upsert(`${whyId}.heading`, 'Built by someone who understands business');
        await upsert(`${whyId}.p1`, 'This is not a design agency selling a favourite style.');
        await upsert(`${whyId}.p2`, 'Tom has built, operated and sold real businesses. The website is judged by whether it helps the business communicate clearly, handle enquiries in its own voice and win the right work.');
        await upsert(`${whyId}.closing`, 'The technology matters. Understanding the business matters more.');
      }

      await upsert('wai.header_cta_text', 'TELL US WHAT YOU WANT TO BUILD');
      // The eyebrow label and the heading were the same sentence stacked on
      // top of each other ("TELL US WHAT YOU WANT TO BUILD" directly above
      // "Tell us what you want to build."), which read as a rendering fault
      // rather than a design choice. The heading is the clearer of the two,
      // so the label is dropped. site-footer.ejs skips the label element
      // entirely when it is empty, so this leaves no stray gap.
      await upsert('wai.contact_label', '');
      await upsert('wai.contact_heading', 'Tell us what you want to build.');
      await upsert('wai.contact_body', 'You do not need a specification or wireframes.<br><br>Tell us what you are trying to achieve and we will tell you what we would do and why.');
      await upsert('wai.contact_message_placeholder', 'Tell us what you want the website to do');
      await upsert('wai.contact_submit_text', 'Send enquiry');

      const waiMetaTitle = 'A Business Website Built Around How You Work | Arrington Consultancy';
      const waiMetaDescription = 'A £999 business website built around the way your business actually operates. See the World Student Advisors site built for the same fixed price.';
      await db.query(
        `UPDATE pages
         SET meta_title = $1,
             meta_description = $2,
             og_title = $1,
             og_description = $2,
             canonical_url = $3
         WHERE slug = 'websites-and-ai'`,
        [waiMetaTitle, waiMetaDescription, 'https://www.arringtonconsultancy.com/websites-and-ai']
      );

      const desiredOrder = [heroId, wsaId, includesId, processId, whyId].filter(Boolean);
      const uniqueDesiredOrder = [...new Set(desiredOrder)];
      await db.query(
        `UPDATE pages
         SET section_order = $1::jsonb,
             hidden_sections = '[]'::jsonb,
             deleted_sections = '[]'::jsonb
         WHERE slug = $2`,
        [JSON.stringify(uniqueDesiredOrder), 'websites-and-ai']
      );

      console.log('Websites and AI: £999 conversion-page rebuild applied.');
    }
  }

  // Stamp the /websites-and-ai revision marker, closing the contract opened
  // above. Deliberately placed after all four migrations so a run that threw
  // part-way through never records itself as applied.
  //
  // Guarded on the page actually existing: if the chain was skipped because
  // What We Do was not there yet (a genuinely empty database on its very first
  // pass), the marker must not be written, or the page would never be built.
  //
  // Uses DO UPDATE rather than DO NOTHING because 'replay' has to move the
  // marker forward to the new revision, which is the whole point of that mode.
  if (waiSeedMode !== 'skip') {
    const { rows: waiPageRows } = await db.query(
      "SELECT 1 FROM pages WHERE slug = 'websites-and-ai'"
    );
    if (waiPageRows.length > 0) {
      await db.query(
        `INSERT INTO content (section_key, content) VALUES ($1, $2)
         ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content`,
        [WAI_REVISION_KEY, WAI_SEED_REVISION]
      );
      console.log(`Websites and AI: seed revision marked as ${WAI_SEED_REVISION} (mode: ${waiSeedMode}).`);
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
      'SELECT slug FROM pages WHERE slug = $1',
      [FIRST_BATCH_PAGES[0].slug]
    );
    const { rows: utRows } = await db.query("SELECT id FROM pages WHERE slug = 'useful-thinking'");
    if (existingArticle1.length === 0 && utRows.length > 0) {
      const [a1, a2, a3, a4] = FIRST_BATCH_PAGES.map((p) => p.instanceId);
      const libId = LIBRARY_INSTANCE_ID;
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

          // Article 2 — The Customer Who Messaged at 4am
          [`${a2}.label`, 'USEFUL THINKING'],
          [`${a2}.heading`, 'The Customer Who Messaged at 4am'],
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
          [`${HELD_ARTICLE_INSTANCE_ID}.label`, 'USEFUL THINKING'],
          [`${HELD_ARTICLE_INSTANCE_ID}.heading`, 'The Reverse Economy of Scale'],
          [`${HELD_ARTICLE_INSTANCE_ID}.index_summary`, "More turnover was supposed to make things easier. It didn't. Growth just meant Tom found out about problems later, and later meant more expensive. On why bigger only works if the structure underneath gets bigger too."],
          [`${HELD_ARTICLE_INSTANCE_ID}.body`, [
            '<p>The reverse economy of scale.</p>',
            "<p>As my business grew, I assumed more sales and more people would naturally make things easier. It didn't work like that.</p>",
            "<p>The further I got from the front line, the less I actually saw. Problems I'd have spotted immediately in the early days started slipping through the cracks instead. By the time some of them reached me, they'd already cost money, time, or trust.</p>",
            '<p>You can be busier, turning over more, employing more people, and still have less control than you had when the business was smaller. I know that because I lived it.</p>',
            "<p>I've heard the same thing from other owners since. One was frustrated that despite growing turnover, things felt harder than ever to manage, customer issues taking longer to surface, small mistakes turning expensive, constantly pulled into firefighting. It wasn't a new problem to me. It was mine, just wearing someone else's name.</p>",
            '<p>Growth does not remove pressure on the owner unless the structure underneath grows with it. Otherwise the business gets bigger, and the owner stays trapped in the middle of everything.</p>'
          ].join('')],
          [`${HELD_ARTICLE_INSTANCE_ID}.related_text`, NO_RELATED[0]],
          [`${HELD_ARTICLE_INSTANCE_ID}.related_link`, NO_RELATED[1]],

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
      for (const { instanceId, slug, title } of FIRST_BATCH_PAGES) {
        await db.query(
          `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav, meta_description)
           VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, false, $5)
           ON CONFLICT (slug) DO NOTHING`,
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
        // If a previous run already inserted the library instance before
        // failing elsewhere, strip any existing copy first so a rerun
        // re-inserts it once in the right place rather than duplicating it.
      const { rows: utPageRows } = await db.query("SELECT section_order FROM pages WHERE slug = 'useful-thinking'");
      const utOrder = Array.isArray(utPageRows[0]?.section_order) ? utPageRows[0].section_order : [];
      const newUtOrder = buildUsefulThinkingPageOrder(utOrder, libId);
      await db.query(
        'UPDATE pages SET section_order = $1::jsonb WHERE slug = $2',
        [JSON.stringify(newUtOrder), 'useful-thinking']
      );

      console.log(`Useful Thinking: 4 articles published (${a1}, ${a2}, ${a3}, ${a4}), 1 held (${HELD_ARTICLE_INSTANCE_ID}), library list (${libId}) added to /useful-thinking.`);
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
      // article__3.heading's long-to-short conversion lived here until
      // 09/08/2026 — removed because it was guarded to fire every time the
      // heading was long, which put it in a permanent tug-of-war with the
      // "restore the original title on article__3" migration below (added
      // after Tom's Drive reconciliation decision reversed this specific
      // shortening). The heading now stays long permanently; see that
      // later migration for the one-time revert of any already-shortened
      // production row.
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
      // Title left as null (09/08/2026) — was previously shortened to "You
      // Don't Get to Decide the Consequences" here, but that write had no
      // guard on the title's current value, so it silently re-shortened
      // the title on every single boot regardless of later edits. Tom's
      // Drive reconciliation decision restored the original long title
      // permanently (see the "restore the original title on article__3"
      // migration below) — this entry no longer touches title at all, only
      // meta_description, so the two migrations stop fighting each other.
      ['you-dont-get-to-decide-when-youve-made-things-right', null, 'One late airport transfer cost Tom a £120,000 account at 26, despite doing everything he thought would fix it. What happened next was not what he expected.'],
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
      'SELECT slug FROM pages WHERE slug = $1',
      [FIFTH_PUBLISHED_ARTICLE.slug]
    );
    if (existingArticle6.length === 0) {
      const a6 = FIFTH_PUBLISHED_ARTICLE.instanceId;
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
         VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, false, $5, $6)
         ON CONFLICT (slug) DO NOTHING`,
        [FIFTH_PUBLISHED_ARTICLE.slug, FIFTH_PUBLISHED_ARTICLE.title, maxSortRows6[0].max_sort + 1, JSON.stringify([a6]), indexSummary, 'https://www.arringtonconsultancy.com/img/useful-thinking/a-profitable-job-og.jpg']
      );

      console.log(`Useful Thinking: 5th article published (${a6}, ${FIFTH_PUBLISHED_ARTICLE.slug}).`);
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
      'SELECT slug FROM pages WHERE slug = $1',
      [SIXTH_PUBLISHED_ARTICLE.slug]
    );
    if (existingArticle7.length === 0) {
      const a7 = SIXTH_PUBLISHED_ARTICLE.instanceId;
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
         VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, false, $5)
         ON CONFLICT (slug) DO NOTHING`,
        [SIXTH_PUBLISHED_ARTICLE.slug, SIXTH_PUBLISHED_ARTICLE.title, maxSortRows7[0].max_sort + 1, JSON.stringify([a7]), indexSummary7]
      );

      console.log(`Useful Thinking: 6th article published (${a7}, ${SIXTH_PUBLISHED_ARTICLE.slug}).`);
    }
  }

  // Migration: seventh Useful Thinking article, "The Turning That Never
  // Came" — approved copy supplied directly by Tom. Reproduced verbatim
  // (paragraph breaks preserved exactly as given); the only change made
  // is normalising a handful of curly/smart apostrophes in the supplied
  // text to the plain straight apostrophes every other article already
  // uses, for typographic consistency — no wording, sentence, or
  // paragraph was altered. No cgrCategory / commercialGapsResources.js
  // entry: this piece is connected into the Owner Dependency Quiz
  // instead (see views/owner-dependency-quiz.ejs), not Commercial Gaps
  // Review. Idempotent: guarded on the page not existing yet.
  {
    const { rows: existingArticle8 } = await db.query(
      'SELECT slug FROM pages WHERE slug = $1',
      [SEVENTH_PUBLISHED_ARTICLE.slug]
    );
    if (existingArticle8.length === 0) {
      const a8 = SEVENTH_PUBLISHED_ARTICLE.instanceId;
      const bodyParagraphs8 = [
          'There have been plenty of difficult decisions in my twenty years in business, but the strange thing is that most of the really difficult ones were not difficult decisions at all. I already knew the answer. I just did not like it.',
          'Years ago, somebody who had worked with me for a long time did something that crossed a line. It was not ambiguous and there was no real grey area. I knew what had happened and I knew what I should do about it. There was history though. There were relationships involved. There was a family in the background. So I told myself there was a decision to be made.',
          "There wasn't.",
          "I knew straight away what the right decision was and I still did not make it. Looking back, that is the bit I regret. Not because of what it taught him. I judge myself on my actions, not somebody else's. I regret it because I ignored my own judgement when I already knew the answer.",
          'I think owners do this more often than we admit. We pretend something is still open for debate when really we are just hoping a better answer turns up.',
          'I used to think a lot about fairness in business. The older I got, the less convinced I became that fair really exists in any useful sense. Almost every decision is a balance. Spend the money or keep it. Reinvest or protect the cash. Recruit or cut costs. Back the customer or back the member of staff. Give someone another chance or protect the standard you have set for everyone else.',
          'There is no perfect point where all of those interests line up. Even if there was some mathematical way of aligning everyone perfectly, humans would find a way to ruin it. People are complicated and everybody in a business has their own pull, their own incentives and their own view of what matters most.',
          'That is why I became so obsessed with systems and rules.',
          'We used software that was designed for generic use and then had to be configured around the way our business actually worked. That underlying setup was something I always struggled to delegate. It was not because I needed control of every button or every process. I wanted control over the control.',
          'If I shaped the foundations properly, everything built on top had to follow them.',
          'The operator wanted one thing. The driver wanted another. The customer wanted something else. Management might want something completely different again. None of them were necessarily wrong, they were just looking at the business from where they stood. The owner is one of the few people forced to look across the whole thing.',
          'Systems gave me a way of holding that together.',
          'If fair is impossible, consistency becomes non-negotiable.',
          'That does not mean treating every situation as identical. Life does not work like that and business certainly does not. It means having a default position, a standard and a reason behind it. Good rules actually give you more room to make hard judgement calls because everyone knows where the starting point is.',
          'The problem comes when you stop applying your own standards because the consequence feels uncomfortable.',
          'That is what I did.',
          'The best way I can describe it is getting lost before satnav. You are driving down a country road and you know you have gone the wrong way. You should stop, turn around and go back, but somehow that feels worse than carrying on. So you keep driving because maybe there is another turning ahead. Maybe the road loops back around. Maybe something appears that gets you where you wanted to go without having to admit you went the wrong way in the first place.',
          'Then you go another mile.',
          'Then another.',
          'Now turning around feels even worse because of how far you have already gone.',
          'At some point you are not continuing because you believe it is the right road. You are continuing because you do not want to admit it is the wrong one.',
          'In business, that is how you end up driving off a cliff to prove you were not wrong.',
          'The dangerous bit is that sometimes the turning does appear.',
          'In twenty years of business there were occasions where I carried on longer than I should have and something unexpected happened that put everything back on track. A person changed. A customer came back. The numbers improved. An opportunity appeared that I could not have predicted.',
          'That is enough to teach you a terrible lesson.',
          'Maybe this one will fix itself as well.',
          'Sometimes it will.',
          'Waiting for it is still false economy.',
          'When I look back at the difficult decisions I delayed but eventually made anyway, the thought afterwards was always the same.',
          'I should have done that six months ago.',
          'Every time.',
          'That is the difference I understand better now. There is real uncertainty and there is simply not liking the answer.',
          'Real uncertainty deserves time. Get more information. Ask questions. Check your assumptions. Think properly.',
          'But sometimes you already know.',
          'That is where owners can waste months pretending they are still deciding when really they are waiting for the answer to change.',
          'I did exactly that.',
          'I lied to myself that there was a decision to be made.',
          "There wasn't.",
          'I was waiting for a turning to magically appear so I did not have to do what I already knew was right.',
          'Sometimes that turning appears.',
          "Don't build a business on sometimes.",
          'If I could go back and say one thing to the younger version of myself every time he was heading further down one of those roads, it would be simple.',
          "Your gut knows what to do. Don't hesitate when you know what's right."
        ].map((p) => `<p>${p}</p>`).join('');

      const indexSummary8 = 'Tom knew exactly what needed to happen with someone who had crossed a line, and put it off anyway. On the difference between a decision that is genuinely hard and one you just do not like the answer to.';

      const a8Rows = [
        [`${a8}.label`, 'USEFUL THINKING'],
        [`${a8}.heading`, 'The Turning That Never Came'],
        [`${a8}.index_summary`, indexSummary8],
        [`${a8}.body`, bodyParagraphs8],
        [`${a8}.related_text`, ''],
        [`${a8}.related_link`, ''],
        [`${a8}.image`, '']
      ];
      for (const [key, value] of a8Rows) {
        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [key, value]
        );
      }

      const { rows: maxSortRows8 } = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM pages');
      await db.query(
        `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav, meta_description)
         VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, false, $5)
         ON CONFLICT (slug) DO NOTHING`,
        [SEVENTH_PUBLISHED_ARTICLE.slug, SEVENTH_PUBLISHED_ARTICLE.title, maxSortRows8[0].max_sort + 1, JSON.stringify([a8]), indexSummary8]
      );

      console.log(`Useful Thinking: 7th article published (${a8}, ${SEVENTH_PUBLISHED_ARTICLE.slug}).`);
    }
  }

  // Migration: 8th published Useful Thinking article, "Serendipity Is Not
  // a System" (07/08/2026), supplied directly by Tom as a complete
  // approved piece. Reproduced verbatim below (paragraph breaks preserved
  // exactly as given); the only change made is normalising a handful of
  // curly/smart apostrophes in the supplied text to the plain straight
  // apostrophes every other article already uses, for typographic
  // consistency — no wording, sentence, or paragraph was altered. No
  // cgrCategory / commercialGapsResources.js entry: like "The Turning
  // That Never Came", this piece is connected into the Owner Dependency
  // Quiz instead (see views/owner-dependency-quiz.ejs), shown only when
  // the quiz's "Succession readiness" or "Cash control" category scores
  // red — deliberately kept diagnostically separate from "The Turning
  // That Never Came" (which stays mapped to "Decision dependency" only).
  // Idempotent: guarded on the page not existing yet.
  {
    const { rows: existingArticle9 } = await db.query(
      'SELECT slug FROM pages WHERE slug = $1',
      [EIGHTH_PUBLISHED_ARTICLE.slug]
    );
    if (existingArticle9.length === 0) {
      const a9 = EIGHTH_PUBLISHED_ARTICLE.instanceId;
      const bodyParagraphs9 = [
          'For years I knew roughly how much money in the business bank account was actually usable and how much was already spoken for. Rent had to be paid, VAT would become due, corporation tax would arrive eventually, wages had to go out and suppliers needed paying. None of it was particularly sophisticated. I made provisions, moved money into a savings account and carried the rest in my head.',
          'Only I knew exactly when things needed paying and what the genuine usable cash was.',
          "At the time I didn't see a problem with that. Why would anybody else need to know? I was the one paying it.",
          'The stupid thing is that I had already been taught exactly why.',
          'Years earlier my business partner dropped dead from a heart attack at 37. He had his responsibilities and I had mine. I knew what he did in the broadest sense, but there were parts of his side of the business that I knew almost nothing about apart from the fact that he dealt with them.',
          "Suddenly he wasn't there and I had to learn the 50% of the business I had trusted him to look after while dealing with everything else that came with losing him.",
          'You would think that would have taught me.',
          "It didn't.",
          'Years later, in 2017, I had a serious car accident and spent eight weeks in a coma. This time I was the one who disappeared.',
          'Only I had access to the bank. Only I really understood the cash position. Only I knew what needed paying, when it needed paying and what money had already been mentally allocated to something else.',
          'The business survived, but not because I had built something that could survive without me.',
          'The people around me saved it.',
          "Through personal connections with the bank, my manager was given access she wouldn't ordinarily have been allowed. Family and friends offered money. People pulled together and filled gaps they should never have had to fill.",
          "If we hadn't had that personal relationship with the bank, people might not have been paid.",
          "I owe a huge amount to the people who stepped in, particularly my manager. There is no way through my recovery that I could ever have separated what she did professionally from what she had done for me personally. She helped save the business when I couldn't.",
          'There is a lot of serendipity in having the right people around you at the exact moment you need them. There is also a danger in pretending serendipity is a system.',
          'We were lucky twice.',
          'The first time somebody else disappeared and I discovered how much of the business existed only inside his head. The second time I disappeared and everyone else discovered how much existed only inside mine.',
          'I should not have needed the lesson once, let alone twice.',
          "I don't think I believed I was immortal. It was probably something much more normal than that. Bad things happen to other people. Death and near death are things you witness, not things you genuinely imagine experiencing yourself.",
          "You deal with the day to day. Customers, staff, bills, problems, whatever needs doing next. You don't sit there thinking about what happens if you are suddenly not there tomorrow.",
          "Call it arrogance if you want. The ignorance of youth was probably part of it. I think the bigger mistake was that I didn't understand that protecting the business from me was part of my job.",
          'I thought I was one and the same as the business.',
          "I wasn't.",
          "A limited company is legally its own separate identity, which I obviously understood. What I didn't understand was that it meant more than the legal definition.",
          'The business had obligations beyond me.',
          'People relied on it for wages and families relied on those wages. Customers relied on it doing what it had promised. Suppliers expected to be paid. The business supported people whose lives continued whether I was there or not.',
          "Once you see it like that, making yourself indispensable doesn't look clever.",
          "The answer wasn't to make me irrelevant. The judgement and experience of the person who built the business had value. The answer was to make sure somebody else had the keys.",
          'For me that became a manager who knew enough, could access enough and had enough authority to keep things moving without me. If she had eventually left to do something else, I would have had to replace that role.',
          'She was personally irreplaceable to me.',
          "Her role couldn't be.",
          "I've always remembered the idea Richard Branson used about making sure you are the stupidest person around the boardroom table. I don't take it literally, but I understand the point. There will always be people with qualities you admire and abilities you don't have.",
          'You need enough judgement to recognise them and enough confidence to let them use those abilities.',
          'I got a third chance.',
          'I can take life insurance, make a will and make sure important information is kept somewhere secure and accessible to the right people. I can make sure nobody has to rely on a favour from a bank manager or somebody remembering what I might have done.',
          'The lesson for me is bigger than succession planning.',
          'I spent years thinking that because the business was mine, protecting myself and protecting the business were basically the same thing.',
          "They weren't.",
          'The business was bigger than me.'
        ].map((p) => `<p>${p}</p>`).join('');

      const indexSummary9 = "Tom's business partner died suddenly at 37, and years later Tom disappeared too, for eight weeks after a serious car accident. On discovering twice how much of a business survives only because of what is trapped inside one person's head.";

      const a9Rows = [
        [`${a9}.label`, 'USEFUL THINKING'],
        [`${a9}.heading`, 'Serendipity Is Not a System'],
        [`${a9}.index_summary`, indexSummary9],
        [`${a9}.body`, bodyParagraphs9],
        [`${a9}.related_text`, ''],
        [`${a9}.related_link`, ''],
        [`${a9}.image`, '']
      ];
      for (const [key, value] of a9Rows) {
        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [key, value]
        );
      }

      const { rows: maxSortRows9 } = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM pages');
      await db.query(
        `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav, meta_description)
         VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, false, $5)
         ON CONFLICT (slug) DO NOTHING`,
        [EIGHTH_PUBLISHED_ARTICLE.slug, EIGHTH_PUBLISHED_ARTICLE.title, maxSortRows9[0].max_sort + 1, JSON.stringify([a9]), indexSummary9]
      );

      console.log(`Useful Thinking: 8th article published (${a9}, ${EIGHTH_PUBLISHED_ARTICLE.slug}).`);
    }
  }

  // Migration: Useful Thinking index tidy-up (07/08/2026), per Tom's
  // request. The library had grown to 8 articles as a plain stacked list
  // and needed a short top introduction; rather than add a whole separate
  // section (with its own 6rem section padding) purely for two lines of
  // copy, the intro is folded directly into the existing library
  // section's own heading + a new one-line `.intro` paragraph, so the
  // page opens straight into "Useful Thinking" without a section of its
  // own competing for vertical space. Heading reuses the exact line from
  // the homepage's `insights.heading` ("That gut feeling is not
  // guesswork.") per Tom's explicit instruction. Guarded the same way as
  // the copy-refinement migration above: heading update only fires if the
  // value still matches the last-set copy-refinement text, so it's a
  // no-op if Tom has since edited it himself; the new `.intro` key uses
  // ON CONFLICT DO NOTHING so it never overwrites a value Tom has edited.
  {
    const { rows: utPageRows3 } = await db.query("SELECT section_order FROM pages WHERE slug = 'useful-thinking'");
    const utOrder3 = Array.isArray(utPageRows3[0]?.section_order) ? utPageRows3[0].section_order : [];
    const libInstanceId2 = utOrder3.find((iid) => /^utlibrary(__\d+)?$/.test(iid));
    if (libInstanceId2) {
      const { rowCount: introHeadingCount } = await db.query(
        'UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3',
        ['That gut feeling is not guesswork.', `${libInstanceId2}.heading`, "These aren't just stories. They're the thinking behind how you work."]
      );
      await db.query(
        'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
        [`${libInstanceId2}.intro`, 'Every idea below came from something that actually happened, not a theory.']
      );
      if (introHeadingCount > 0) console.log(`Useful Thinking: library intro updated (${libInstanceId2}).`);
    }
  }

  // Migration: 9th published Useful Thinking article, "Some People Are
  // Worth the Risk" (07/08/2026), supplied via "Arrington Website Worker
  // Handover 03" as a deliberate companion piece to "Serendipity Is Not a
  // System". Reproduced verbatim from that handover doc (paragraph breaks
  // preserved exactly, no wording changed). The manager is anonymised
  // throughout as "my manager"/"she"/"her" per Tom's explicit
  // confidentiality decision recorded in the handover doc - no name,
  // initials or other identifying detail was added. The equity detail
  // ("I gave her a percentage of the company") is kept in full, per the
  // same doc's explicit instruction not to trim or soften it. No
  // cgrCategory / commercialGapsResources.js entry: connected into the
  // Owner Dependency Quiz instead (see views/owner-dependency-quiz.ejs),
  // shown only when the quiz's "Delegation" category scores red, checked
  // after "The Turning That Never Came" and "Serendipity Is Not a
  // System" so only one recommendation ever shows. Idempotent: guarded
  // on the page not existing yet.
  {
    const { rows: existingArticle10 } = await db.query(
      'SELECT slug FROM pages WHERE slug = $1',
      [NINTH_PUBLISHED_ARTICLE.slug]
    );
    if (existingArticle10.length === 0) {
      const a10 = NINTH_PUBLISHED_ARTICLE.instanceId;
      const bodyParagraphs10 = [
          "After my accident my manager took on far more of the business than she ever had before. I was in a coma for eight weeks and when I eventually started the long road back there were things she had become responsible for that I couldn't simply take back, even if I'd wanted to. The biggest was people, and the truth is she was better at managing them than I was.",
          "She had an empathy I didn't have. She could listen to somebody, understand why they were upset, probably understand their argument better than I did, and still tell them no. I could get to exactly the same answer but somehow make the journey there considerably less pleasant.",
          "The staff listened to her and, more importantly, they knew her word carried weight. Not because Manager was written underneath her name, but because they knew if she had said it, I would back her. People occasionally tried to come around her and get a different answer from me and I'm not going to pretend that over all those years there wasn't an exception or two, but from memory she was very rarely circumnavigated. If I'd asked her to manage the staff and then changed her decisions every time somebody complained to me, she wasn't really managing them. I was.",
          "She had a light touch probably 99% of the time. Like all of us though, she had her trigger, and hers was being lied to. I'd been managing people for twenty years and heard excuses that would make you laugh, so perhaps I'd become numb to it. She hadn't. If she thought somebody was lying to her you got to see the other 1%, and I think that 1% was part of the reason the other 99% worked.",
          "I've struggled to find the right word for what she had. Fear is wrong. Respect somehow undervalues it and authority makes her sound like an organisational chart. Her words had weight. People knew she would listen, they knew she would be fair and they also knew there was a line. Empathy didn't make her soft. It meant that when she was firm, it meant something.",
          "There were plenty of times I would have handled something differently, but that was the point. If I'd wanted somebody to manage exactly like me I might as well have carried on doing it myself. Delegating something and then expecting your version of the decision, delivered in your way, isn't really delegation. Sometimes somebody will do something worse than you. Sometimes they'll do it better. Occasionally you'll find somebody who has something you simply don't have.",
          'She did.',
          "The obvious problem with allowing somebody to become that important is what happens if they leave. Every bit of sensible business advice tells you not to become too dependent on one person, and having experienced what happens when important knowledge disappears with somebody, I'm hardly going to argue against protecting yourself.",
          'But I think you can take that too far.',
          "If you spend all your time making sure nobody becomes too important, there's a danger nobody ever does.",
          "By then I'd seen a business absorb changes I would once have thought impossible. My business partner had dropped dead at 37 and years later I had nearly disappeared myself. Both times the business struggled, changed and eventually adapted. Maybe those experiences made me less frightened of what would happen if my manager ever left. Maybe the personal bond between us meant I simply never believed she would. Probably a bit of both.",
          'What I did know was what she brought to the business while she was there, and that was worth the risk of one day not having it.',
          "You can't completely protect a business from losing brilliant people. You can share knowledge, make sure other people have access, put systems around them and avoid allowing the whole thing to collapse because one person walks out of the door. But after that, I'd rather harness everything an exceptional person can give the business than deliberately limit them because I'm frightened they might leave.",
          'And if somebody becomes that valuable, give them a bloody good reason not to.',
          'Pay them properly. Trust them. Give them actual responsibility rather than responsibility that disappears the moment you disagree with them. Let them use the qualities you hired them for instead of slowly training those qualities out of them until they become another version of you.',
          'In her case I went further. I gave her a percentage of the company.',
          "It wasn't some clever retention strategy I'd read in a book. I trusted her completely, she had become fundamental to the business and it seemed right that if the business became more valuable because of what she brought to it, she should own some of that value.",
          "There is plenty written about making sure nobody in a business becomes indispensable and I understand why. I've lived the consequences of getting dependency badly wrong.",
          'But there is another side to it.',
          "Sometimes somebody becomes incredibly important because they're incredibly good, and trying to engineer that importance out of your business might protect you from losing something you never properly allowed yourself to have.",
          "Protect the business as best you can, but when you find somebody exceptional, don't spend all your energy making sure you don't need them.",
          'Make it worth their while to stay.'
        ].map((p) => `<p>${p}</p>`).join('');

      const indexSummary10 = "After Tom's accident, his manager took on more of the business than she ever had, and turned out to be better at managing people than he was. On when the answer to dependency risk is not less reliance, but more reward.";

      const a10Rows = [
        [`${a10}.label`, 'USEFUL THINKING'],
        [`${a10}.heading`, 'Some People Are Worth the Risk'],
        [`${a10}.index_summary`, indexSummary10],
        [`${a10}.body`, bodyParagraphs10],
        [`${a10}.related_text`, 'Serendipity Is Not a System'],
        [`${a10}.related_link`, '/useful-thinking/serendipity-is-not-a-system'],
        [`${a10}.image`, '']
      ];
      for (const [key, value] of a10Rows) {
        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [key, value]
        );
      }

      const { rows: maxSortRows10 } = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM pages');
      await db.query(
        `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav, meta_description)
         VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, false, $5)
         ON CONFLICT (slug) DO NOTHING`,
        [NINTH_PUBLISHED_ARTICLE.slug, NINTH_PUBLISHED_ARTICLE.title, maxSortRows10[0].max_sort + 1, JSON.stringify([a10]), indexSummary10]
      );

      // Complete the two-way companion link: Serendipity's related_text/
      // related_link were seeded empty (this article didn't exist yet).
      // Guarded on still being empty so it never overwrites a value Tom
      // has since edited himself via the CMS.
      const { rowCount: serendipityLinkCount } = await db.query(
        "UPDATE content SET content = 'Some People Are Worth the Risk' WHERE section_key = 'article__9.related_text' AND content = ''"
      );
      await db.query(
        "UPDATE content SET content = '/useful-thinking/some-people-are-worth-the-risk' WHERE section_key = 'article__9.related_link' AND content = ''"
      );

      console.log(`Useful Thinking: 9th article published (${a10}, ${NINTH_PUBLISHED_ARTICLE.slug})${serendipityLinkCount > 0 ? ', companion link to Serendipity added' : ''}.`);
    }
  }

  // Migration: rebuild /useful-thinking as an editorial index (08/08/2026).
  // Drops the pre-library philosophy/marketing sections and the shared
  // "Honest questions" assessment block that had accumulated on this page,
  // leaving only [library, one restrained commercial bridge]. Guarded by
  // a dedicated marker content key rather than a structural check, since
  // "has this page been restructured already" has no natural query and a
  // marker is the only way to guarantee this never re-clobbers whatever
  // Tom has since edited on the page himself via the CMS.
  {
    const { rows: markerRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1',
      [EDITORIAL_INDEX_MARKER_KEY]
    );
    if (markerRows.length === 0) {
      const { rows: utPageRows } = await db.query(
        "SELECT section_order FROM pages WHERE slug = 'useful-thinking'"
      );
      if (utPageRows.length > 0) {
        const utOrder = Array.isArray(utPageRows[0].section_order) ? utPageRows[0].section_order : [];
        const libId = utOrder.find((iid) => /^utlibrary(__\d+)?$/.test(iid)) || LIBRARY_INSTANCE_ID;

        const collectUsedIds = async () => {
          const { rows: orderRows } = await db.query('SELECT section_order FROM pages');
          const used = new Set();
          for (const r of orderRows) {
            if (Array.isArray(r.section_order)) r.section_order.forEach((s) => used.add(s));
          }
          const { rows: prefixRows } = await db.query(
            "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content"
          );
          prefixRows.forEach((r) => used.add(r.instance_id));
          return used;
        };
        const makeAllocator = (used) => (tpl) => {
          if (!used.has(tpl)) { used.add(tpl); return tpl; }
          for (let n = 2; n <= 99; n++) {
            const id = `${tpl}__${n}`;
            if (!used.has(id)) { used.add(id); return id; }
          }
          return null;
        };

        const used = await collectUsedIds();
        const allocate = makeAllocator(used);
        const bridgeId = allocate('intervention');

        await db.query(
          `INSERT INTO content (section_key, content) VALUES
             ($1, 'If any of this sounds familiar'),
             ($2, 'One straightforward question is usually enough to work out whether a commercial review would help.'),
             ($3, 'Take the Owner Dependency Quiz'),
             ($4, 'owner-dependency-quiz')
           ON CONFLICT (section_key) DO NOTHING`,
          [
            `${bridgeId}.heading`,
            `${bridgeId}.subtext`,
            `${bridgeId}.button_text`,
            `${bridgeId}.button_link`
          ]
        );

        await db.query(
          'UPDATE pages SET section_order = $1::jsonb WHERE slug = $2',
          [JSON.stringify([libId, bridgeId]), 'useful-thinking']
        );

        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [EDITORIAL_INDEX_MARKER_KEY, 'true']
        );

        console.log(`Useful Thinking: editorial index applied (library: ${libId}, bridge: ${bridgeId}).`);
      }
    }
  }

  // Migration: tenth Useful Thinking article, "The Connection Isn't the
  // Sale" (08/08/2026), supplied directly by Tom. Reproduced verbatim,
  // paragraph breaks preserved exactly, no wording changed — including
  // the closing line, which is Tom's own voice choice and has been left
  // as given rather than softened. No related-link: nothing else on the
  // site is a natural fit for a story about judging introductions and
  // business development. Connected into Commercial Gaps Review (see
  // lib/usefulThinkingArticles.js and lib/commercialGapsResources.js),
  // not the Owner Dependency Quiz — none of the quiz's categories
  // (Freedom from the business, Decision dependency, Visibility,
  // Delegation, Day-to-day management, Commercial understanding,
  // Succession readiness, Cash control) are a real match for this
  // article's subject. Idempotent: guarded on the page not existing yet.
  {
    const { rows: existingArticle11 } = await db.query(
      'SELECT slug FROM pages WHERE slug = $1',
      [TENTH_PUBLISHED_ARTICLE.slug]
    );
    if (existingArticle11.length === 0) {
      const a11 = TENTH_PUBLISHED_ARTICLE.instanceId;
      const bodyParagraphs11 = [
          "I've been promised some enormous accounts over the years. \"I know them.\" \"Leave it with me.\" \"I'll have a word.\" \"This one's definitely happening.\" Quite a few turned out to be bollocks, but not usually because anyone was lying. People mean well. They want to help and sometimes they genuinely believe they have more influence than they do. Someone they know becomes someone they know well, someone they know well becomes someone who will definitely listen to them, and before long I'm apparently getting a massive new account.",
          "I learnt not to dismiss any of it. I'd never say no or make someone feel stupid for offering to help because occasionally they really do know the right person, but I also learnt not to sit around waiting. If there was even a small opportunity to approach directly, I normally would, and then there was another judgement to make: do I use the name?",
          "Sometimes the answer is yes. \"Hi, I'm Tom from X. Steve Smith gave me your contact details because I wanted to speak to you about X. I'd really appreciate five minutes of your time.\" Simple. The connection has got me through the first door and now it's my job. But sometimes dropping the name would make you look like a fool.",
          "I have a good friend who's a director of a FTSE 100 company. I know him genuinely well and I also know that beyond an introduction I hold absolutely no influence. Why would I? If he introduces me to somebody that's valuable. If I then walk into that conversation behaving as though his position gives me some sort of borrowed importance, I've probably made myself look worse.",
          "I've been on the receiving end of it too. Someone approaches you through some three-times-removed connection and implies the person has influence over you. You see straight through it. I'd rather they were straight with me. \"Steve gave me your number. I'd like five minutes to talk to you about something.\" Fine. I'll listen. What I don't need is the little performance around how well everyone supposedly knows everyone.",
          "The best introductions I've had have often worked the other way around. I didn't know they were happening. The phone rang. \"Hi Tom. Steve gave me your number. He said you might be able to offer us a competitive rate for X.\" That's an introduction you want. Someone has said something good about you when you weren't there, they've put enough of their own credibility behind you for another business to pick up the phone, and there has been no promise, no posturing and no waiting around for somebody to work their magic.",
          "At that point the introducer has done their job. There is no onus on them to sell my business. It's all on me. I need to understand what the customer needs, explain what we can do, get the price right and give them a reason to use us. The introduction opened the door. I still have to walk through it.",
          "Over the years I became much more careful about the difference between knowing someone and influencing them. They aren't the same thing. I also became more careful about assuming there was a rule for any of this.",
          'Always go direct? No.',
          'Always use the introduction? No.',
          "Never let somebody else sell your business? No.",
          "Sometimes somebody else's influence is exactly what you need and the best thing you can do is shut up and let them use it. Sometimes all you want is a name and a number. Sometimes mentioning the person who introduced you makes the approach stronger and sometimes it makes you look like a dick.",
          "Each situation is different. Experience helps because you've seen enough versions of it before, but experience shouldn't make you lazy enough to stop looking at the one in front of you.",
          'Hard and fast rules can go fuck themselves.',
          'Judge every instance on its own merits.'
        ].map((p) => `<p>${p}</p>`).join('');

      const indexSummary11 = "Tom has been promised plenty of enormous accounts through connections over the years, most people meaning it sincerely even when nothing came of it. On knowing the difference between someone knowing you and someone actually being able to influence anything on your behalf.";

      const a11Rows = [
        [`${a11}.label`, 'USEFUL THINKING'],
        [`${a11}.heading`, TENTH_PUBLISHED_ARTICLE.title],
        [`${a11}.index_summary`, indexSummary11],
        [`${a11}.body`, bodyParagraphs11],
        [`${a11}.related_text`, ''],
        [`${a11}.related_link`, ''],
        [`${a11}.image`, '']
      ];
      for (const [key, value] of a11Rows) {
        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [key, value]
        );
      }

      const { rows: maxSortRows11 } = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM pages');
      await db.query(
        `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav, meta_description)
         VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, false, $5)
         ON CONFLICT (slug) DO NOTHING`,
        [TENTH_PUBLISHED_ARTICLE.slug, TENTH_PUBLISHED_ARTICLE.title, maxSortRows11[0].max_sort + 1, JSON.stringify([a11]), indexSummary11]
      );

      console.log(`Useful Thinking: 10th article published (${a11}, ${TENTH_PUBLISHED_ARTICLE.slug}).`);
    }
  }

  // Migration: pronoun consistency across Useful Thinking titles and
  // index summaries (08/08/2026, per Tom's review). Article bodies are
  // deliberately first-person ("I") throughout — that's the established
  // narrative voice and is untouched here. But titles and index summaries
  // sit together on the library index page and in page <title> tags,
  // where the convention is consistently third person ("Tom"); two
  // outliers had crept in: article__2's title used first-person "Me",
  // and the fifth article's index summary used first-person plural "We".
  // Each update is guarded on the exact current value, so this is
  // idempotent and never overwrites a value Tom has since edited himself
  // via the CMS.
  {
    const pronounFixes = [
      ['article__2.heading', 'The Customer Who Messaged Me at 4am', 'The Customer Who Messaged at 4am'],
      [
        `${FIFTH_PUBLISHED_ARTICLE.instanceId}.index_summary`,
        'We thought we had landed a licence to print money. Getting paid for it was another matter entirely.',
        'Tom thought he had landed a licence to print money. Getting paid for it was another matter entirely.'
      ]
    ];
    let pronounFixCount = 0;
    for (const [key, oldValue, newValue] of pronounFixes) {
      const { rowCount } = await db.query(
        'UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3',
        [newValue, key, oldValue]
      );
      pronounFixCount += rowCount;
    }

    const { rowCount: titleFixCount } = await db.query(
      "UPDATE pages SET title = 'The Customer Who Messaged at 4am' WHERE slug = 'the-customer-who-messaged-me-at-4am' AND title = 'The Customer Who Messaged Me at 4am'"
    );
    pronounFixCount += titleFixCount;

    if (pronounFixCount > 0) console.log(`Useful Thinking: applied ${pronounFixCount} pronoun-consistency fix(es).`);
  }

  // Migration: reduce "I"-opener repetition across four Useful Thinking
  // articles (08/08/2026), per Tom's review — reviewed and selected by
  // him from a set of suggested edits after "The Connection Isn't the
  // Sale" was flagged as clustering "I" at the start of four of its
  // first five paragraphs. Voice stays first person throughout (this is
  // a rhythm fix, not a point-of-view change) — deliberate repetition
  // elsewhere (the "Only I knew... Only I had access..." passage in
  // Serendipity, the "I got a third chance." beat, the closing lines of
  // The Turning That Never Came and The Connection Isn't the Sale) was
  // explicitly reviewed and left alone because it is doing rhetorical
  // work, not accidental. "A Profitable Job..." and "Every Rule Changes
  // Behaviour" (the two "we"-voice pieces) are deliberately not touched
  // here — that is a separate editorial decision, not part of this pass.
  // Uses targeted substring replacement (same approach as the Devon
  // voice-correction migration above) since `body` stores the whole
  // article as one concatenated HTML string, not one row per paragraph.
  // Each substitution is guarded on the OLD paragraph still being
  // present, so this is idempotent and never touches a row Tom has since
  // edited himself via the CMS.
  {
    const iRhythmFixes = [
      // Being Certain Isn't the Same as Being Right (article)
      [
        'article.body',
        "<p>I rang the office one day and couldn't get through. I tried again from a different number. Still nothing. I checked the CCTV while it was ringing and saw the member of staff just sitting there.</p>",
        "<p>One day I rang the office and couldn't get through. I tried again from a different number. Still nothing. While it was ringing, I checked the CCTV and saw the member of staff just sitting there.</p>"
      ],
      [
        'article.body',
        "<p>I confronted him. He denied it. I was so certain I'd seen it with my own eyes that I called him a liar.</p>",
        "<p>When I confronted him, he denied it. I was so certain I'd seen it with my own eyes that I called him a liar.</p>"
      ],
      [
        'article.body',
        "<p>I'd been wrong about the lie. He had broken a rule and concealed it, but I had accused him of something he hadn't done. Neither of us came out of it clean, but only one of us had been called a liar for something he hadn't done.</p>",
        "<p>The lie was the bit I'd been wrong about. He had broken a rule and concealed it, but I had accused him of something he hadn't done. Neither of us came out of it clean, but only one of us had been called a liar for something he hadn't done.</p>"
      ],
      // The Turning That Never Came (article__8)
      [
        'article__8.body',
        "<p>I knew straight away what the right decision was and I still did not make it. Looking back, that is the bit I regret. Not because of what it taught him. I judge myself on my actions, not somebody else's. I regret it because I ignored my own judgement when I already knew the answer.</p>",
        "<p>Straight away, I knew what the right decision was and still did not make it. Looking back, that is the bit I regret. Not because of what it taught him. I judge myself on my actions, not somebody else's. I regret it because I ignored my own judgement when I already knew the answer.</p>"
      ],
      [
        'article__8.body',
        '<p>I think owners do this more often than we admit. We pretend something is still open for debate when really we are just hoping a better answer turns up.</p>',
        '<p>Owners do this more often than I think we admit. We pretend something is still open for debate when really we are just hoping a better answer turns up.</p>'
      ],
      [
        'article__8.body',
        '<p>I used to think a lot about fairness in business. The older I got, the less convinced I became that fair really exists in any useful sense. Almost every decision is a balance. Spend the money or keep it. Reinvest or protect the cash. Recruit or cut costs. Back the customer or back the member of staff. Give someone another chance or protect the standard you have set for everyone else.</p>',
        '<p>Fairness in business was something I used to think about a lot. The older I got, the less convinced I became that fair really exists in any useful sense. Almost every decision is a balance. Spend the money or keep it. Reinvest or protect the cash. Recruit or cut costs. Back the customer or back the member of staff. Give someone another chance or protect the standard you have set for everyone else.</p>'
      ],
      // Serendipity Is Not a System (article__9)
      [
        'article__9.body',
        '<p>I can take life insurance, make a will and make sure important information is kept somewhere secure and accessible to the right people. I can make sure nobody has to rely on a favour from a bank manager or somebody remembering what I might have done.</p>',
        '<p>Now I can take life insurance, make a will and make sure important information is kept somewhere secure and accessible to the right people. Nobody has to rely on a favour from a bank manager or somebody remembering what I might have done.</p>'
      ],
      [
        'article__9.body',
        '<p>I spent years thinking that because the business was mine, protecting myself and protecting the business were basically the same thing.</p>',
        '<p>For years I thought that because the business was mine, protecting myself and protecting the business were basically the same thing.</p>'
      ],
      // The Connection Isn't the Sale (article__11)
      [
        'article__11.body',
        "<p>I learnt not to dismiss any of it. I'd never say no or make someone feel stupid for offering to help because occasionally they really do know the right person, but I also learnt not to sit around waiting. If there was even a small opportunity to approach directly, I normally would, and then there was another judgement to make: do I use the name?</p>",
        "<p>Over time I learnt not to dismiss any of it. I'd never say no or make someone feel stupid for offering to help because occasionally they really do know the right person, but I also learnt not to sit around waiting. If there was even a small opportunity to approach directly, I normally would, and then there was another judgement to make: do I use the name?</p>"
      ],
      [
        'article__11.body',
        "<p>I have a good friend who's a director of a FTSE 100 company. I know him genuinely well and I also know that beyond an introduction I hold absolutely no influence. Why would I? If he introduces me to somebody that's valuable. If I then walk into that conversation behaving as though his position gives me some sort of borrowed importance, I've probably made myself look worse.</p>",
        "<p>One of my good friends is a director of a FTSE 100 company. I know him genuinely well and I also know that beyond an introduction I hold absolutely no influence. Why would I? If he introduces me to somebody that's valuable. If I then walk into that conversation behaving as though his position gives me some sort of borrowed importance, I've probably made myself look worse.</p>"
      ],
      [
        'article__11.body',
        "<p>I've been on the receiving end of it too. Someone approaches you through some three-times-removed connection and implies the person has influence over you. You see straight through it. I'd rather they were straight with me. \"Steve gave me your number. I'd like five minutes to talk to you about something.\" Fine. I'll listen. What I don't need is the little performance around how well everyone supposedly knows everyone.</p>",
        "<p>The same thing happens from the other side too. I've been on the receiving end of it. Someone approaches you through some three-times-removed connection and implies the person has influence over you. You see straight through it. I'd rather they were straight with me. \"Steve gave me your number. I'd like five minutes to talk to you about something.\" Fine. I'll listen. What I don't need is the little performance around how well everyone supposedly knows everyone.</p>"
      ]
    ];
    let iRhythmFixCount = 0;
    for (const [key, oldParagraph, newParagraph] of iRhythmFixes) {
      const { rowCount } = await db.query(
        `UPDATE content SET content = REPLACE(content, $1, $2)
         WHERE section_key = $3 AND content LIKE '%' || $1 || '%'`,
        [oldParagraph, newParagraph, key]
      );
      iRhythmFixCount += rowCount;
    }
    if (iRhythmFixCount > 0) console.log(`Useful Thinking: applied ${iRhythmFixCount} "I"-rhythm fix(es) across 4 articles.`);
  }

  // Migration: Drive reconciliation pass (09/08/2026) — "Some People Are
  // Worth the Risk" was found to be Drive-newer than the live copy in 3
  // spots. The per-article Drive doc replaced 3 uses of the bare pronoun
  // "she" with the fuller "my manager" (matching the confidentiality/
  // anonymisation pattern used everywhere else in the piece), superseding
  // the version reproduced from Handover 03 when the article was first
  // published. Facts, structure and every other word are unchanged.
  // Guarded on the exact old paragraph still being present, so this is
  // idempotent and never touches a row Tom's since edited himself via the
  // CMS.
  {
    const someoneWorthRiskDriveSyncFixes = [
      [
        'article__10.body',
        "<p>The staff listened to her and, more importantly, they knew her word carried weight. Not because Manager was written underneath her name, but because they knew if she had said it, I would back her. People occasionally tried to come around her and get a different answer from me and I'm not going to pretend that over all those years there wasn't an exception or two, but from memory she was very rarely circumnavigated. If I'd asked her to manage the staff and then changed her decisions every time somebody complained to me, she wasn't really managing them. I was.</p>",
        "<p>The staff listened to her and, more importantly, they knew her word carried weight. Not because Manager was written underneath her name, but because they knew if my manager had said it, I would back her. People occasionally tried to come around her and get a different answer from me and I'm not going to pretend that over all those years there wasn't an exception or two, but from memory she was very rarely circumnavigated. If I'd asked her to manage the staff and then changed her decisions every time somebody complained to me, she wasn't really managing them. I was.</p>"
      ],
      [
        'article__10.body',
        '<p>She did.</p>',
        '<p>My manager did.</p>'
      ],
      [
        'article__10.body',
        "<p>In her case I went further. I gave her a percentage of the company.</p>",
        "<p>In my manager's case I went further. I gave her a percentage of the company.</p>"
      ]
    ];
    let driveSyncFixCount = 0;
    for (const [key, oldParagraph, newParagraph] of someoneWorthRiskDriveSyncFixes) {
      const { rowCount } = await db.query(
        `UPDATE content SET content = REPLACE(content, $1, $2)
         WHERE section_key = $3 AND content LIKE '%' || $1 || '%'`,
        [oldParagraph, newParagraph, key]
      );
      driveSyncFixCount += rowCount;
    }
    if (driveSyncFixCount > 0) console.log(`Useful Thinking: synced ${driveSyncFixCount} Drive-newer wording fix(es) on "Some People Are Worth the Risk".`);
  }

  // Migration: eleventh Useful Thinking article, "The Monument to Wasted
  // Money" (09/08/2026), found during a full Drive reconciliation and
  // inventory pass. Marked "Finished and saved as a standalone Useful
  // Thinking article" in the Arrington Useful Thinking Map, supplied
  // directly by Tom, not sourced from a handover doc. Reproduced verbatim,
  // paragraph breaks preserved exactly (this piece is written in
  // deliberately short, one-line paragraphs throughout — the same rhythm
  // already used in Serendipity Is Not a System and The Turning That
  // Never Came), no wording changed. No related-link: the Map gives no
  // companion-piece instruction for this article, unlike the explicit
  // two-way link rule that exists for Serendipity/Some People. Connected
  // into Commercial Gaps Review under "commercial_priorities" (see
  // lib/usefulThinkingArticles.js and lib/commercialGapsResources.js).
  // Idempotent: guarded on the page not existing yet.
  {
    const { rows: existingArticle12 } = await db.query(
      'SELECT slug FROM pages WHERE slug = $1',
      [ELEVENTH_PUBLISHED_ARTICLE.slug]
    );
    if (existingArticle12.length === 0) {
      const a12 = ELEVENTH_PUBLISHED_ARTICLE.instanceId;
      const bodyParagraphs12 = [
          'In the early days my business partner and I used to joke that one day we would build a shrine to the monument of wasted money.',
          'Every business has one. Ideas that looked good. Things bought because they might help. Small experiments that somehow became bigger experiments.',
          'Most of them are harmless enough.',
          'If something is cheap enough to test, test it. The right idea can become a very good one.',
          'One of ours looked like it was going to be brilliant.',
          'Advertising screens in taxis.',
          'We were doing around 9,000 jobs a week. Thousands of people were sitting in the back of our cars. Local businesses could advertise directly to them.',
          'It felt obvious.',
          'And commercially, it worked.',
          'Businesses wanted the space. Some were bidding against each other. Some wanted industry exclusivity.',
          'For a little while it felt like printing money.',
          'The problem was I had tested whether people wanted to buy it.',
          'What I had not tested was whether the business could actually carry it.',
          'That was the mistake.',
          "Worse, I had sold a year's worth of advertising before we had properly tried it in the real world.",
          'Then reality arrived.',
          'Drivers would not always turn the screens on.',
          'Customers did not always want adverts playing in the back of a taxi.',
          'The technology was nowhere near as good as it would be now.',
          'Advertisers were understandably unhappy if they had paid for something that was not being shown.',
          'Drivers were asking what they got out of it.',
          'Customers were leaving bad reviews because they did not want to be advertised to while paying us for a taxi.',
          'That last one mattered most.',
          'The advertisers were customers of the advertising idea.',
          'The passengers were customers of the actual business.',
          'I could refund an advertiser.',
          'Lose a taxi customer and I might never see them again.',
          'And for every customer angry enough to complain, my assumption was there were plenty more who disliked it and just never said anything.',
          'So I started trying to fix it.',
          'Limit the screens.',
          'Make drivers turn them on.',
          'Give passengers the option to switch them off.',
          'Put notices up.',
          'Change the way we ran it.',
          'All of those things were possible.',
          'None of them made the idea worth the effort.',
          'That is something I learnt a few times over the years.',
          'Just because something can be fixed does not mean it deserves fixing.',
          'If I wanted to mark my own homework, I could probably prove the advertising made money.',
          'There was revenue.',
          'There were advertisers.',
          'There were separate accounts opened.',
          'There were businesses we built relationships with.',
          'From a commercial point of view, showing my face to local businesses was not all bad.',
          'As a business owner, having a reason to speak to another local business that is not the obvious sales pitch can be useful.',
          'So I would not call the whole thing a disaster.',
          'But I would still mark the idea down as a loss.',
          'Because a balance sheet does not show everything.',
          'It does not show the time you spent managing something awkward.',
          'It does not show the effort required to keep staff doing something they do not believe in.',
          'It does not show customers quietly getting irritated.',
          'It does not show the damage done when a side project starts interfering with the thing people actually came to you for.',
          'That is where the economics changed.',
          'The advertising made some money.',
          'The business paid for it in other ways.',
          'If I was doing it again, I would have trialled it first.',
          'A couple of local businesses.',
          'A taxi or two.',
          'Free advertising.',
          'No promises.',
          'No year-long commitments.',
          'Then wait.',
          'What do the drivers think?',
          'What do the customers think?',
          'Does the technology work?',
          'Do advertisers actually get what they were promised?',
          'How much effort does it take to keep the whole thing running?',
          'Only then would I decide whether it deserved scaling.',
          'That is the bit I got wrong.',
          'I proved demand before I proved delivery.',
          'Those are not the same thing.',
          'A new revenue stream can look like growth.',
          'Sometimes it is.',
          'Sometimes it is just a distraction with a sales line attached to it.',
          'So now, if someone tells me they have found another way to make money alongside their main business, the first thing I want to know is not how much it could make.',
          'It is this:',
          'What impact will it have on your core business?',
          'And how distracted are you going to become from your bread and butter?'
        ].map((p) => `<p>${p}</p>`).join('');

      const indexSummary12 = 'Tom sold a year of advertising screens in taxis before he had properly tested whether the business could actually deliver it. On proving demand is not the same as proving you can deliver it.';

      const a12Rows = [
        [`${a12}.label`, 'USEFUL THINKING'],
        [`${a12}.heading`, ELEVENTH_PUBLISHED_ARTICLE.title],
        [`${a12}.index_summary`, indexSummary12],
        [`${a12}.body`, bodyParagraphs12],
        [`${a12}.related_text`, ''],
        [`${a12}.related_link`, ''],
        [`${a12}.image`, '']
      ];
      for (const [key, value] of a12Rows) {
        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [key, value]
        );
      }

      const { rows: maxSortRows12 } = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM pages');
      await db.query(
        `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav, meta_description)
         VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, false, $5)
         ON CONFLICT (slug) DO NOTHING`,
        [ELEVENTH_PUBLISHED_ARTICLE.slug, ELEVENTH_PUBLISHED_ARTICLE.title, maxSortRows12[0].max_sort + 1, JSON.stringify([a12]), indexSummary12]
      );

      console.log(`Useful Thinking: 11th article published (${a12}, ${ELEVENTH_PUBLISHED_ARTICLE.slug}).`);
    }
  }

  // Migration: restore the original title on article__3, "You Don't Get
  // to Decide When You've Made Things Right" (09/08/2026, per Tom's
  // decision during the Drive reconciliation pass). An earlier "copy
  // refinements" migration (see the migration above titled "Useful
  // Thinking copy refinements") had shortened this to "You Don't Get to
  // Decide the Consequences" per a prior direct instruction from Tom that
  // was never written back to Drive; Drive's own Handover 01 (marked
  // "FINAL WEBSITE-READY ARTICLE COPY") has always shown the original
  // longer title, so on reconciliation Tom confirmed the Drive title is
  // the one to keep. Slug and body are both untouched: the slug already
  // matches this longer title exactly, and there is no other approved
  // wording change for this article. meta_description is left as-is —
  // this migration only reverts the title/heading, which is the only
  // field the conflict was about. Guarded on the exact shortened value
  // still being present, so this is idempotent and never overwrites a
  // value Tom's since edited himself via the CMS.
  {
    const { rowCount: headingRevertCount } = await db.query(
      "UPDATE content SET content = 'You Don''t Get to Decide When You''ve Made Things Right' WHERE section_key = 'article__3.heading' AND content = 'You Don''t Get to Decide the Consequences'"
    );
    const { rowCount: titleRevertCount } = await db.query(
      "UPDATE pages SET title = 'You Don''t Get to Decide When You''ve Made Things Right' WHERE slug = 'you-dont-get-to-decide-when-youve-made-things-right' AND title = 'You Don''t Get to Decide the Consequences'"
    );
    const titleRevertTotal = headingRevertCount + titleRevertCount;
    if (titleRevertTotal > 0) console.log(`Useful Thinking: restored the original title on article__3 (${titleRevertTotal} row(s)).`);
  }

  // Migration: replace "The Monument to Wasted Money" body with Tom's own
  // rewrite (09/08/2026). Supplied directly by Tom as a full replacement
  // for the version implemented from the earlier Drive doc — drops the
  // "shrine to the monument of wasted money" framing and the one-line-
  // per-paragraph rhythm in favour of Tom's own natural paragraph lengths,
  // and corrects the job-volume figure (was "around 9,000 jobs a week...
  // Thousands of people"; now "around 3,000 jobs a week, which meant
  // roughly 10,000 people"). index_summary and heading are unchanged —
  // both still hold true against the new body. Guarded on the exact old
  // body still being present, so this is idempotent and never overwrites
  // a value Tom's since edited himself via the CMS.
  {
    const oldBodyParagraphs12 = [
        'In the early days my business partner and I used to joke that one day we would build a shrine to the monument of wasted money.',
        'Every business has one. Ideas that looked good. Things bought because they might help. Small experiments that somehow became bigger experiments.',
        'Most of them are harmless enough.',
        'If something is cheap enough to test, test it. The right idea can become a very good one.',
        'One of ours looked like it was going to be brilliant.',
        'Advertising screens in taxis.',
        'We were doing around 9,000 jobs a week. Thousands of people were sitting in the back of our cars. Local businesses could advertise directly to them.',
        'It felt obvious.',
        'And commercially, it worked.',
        'Businesses wanted the space. Some were bidding against each other. Some wanted industry exclusivity.',
        'For a little while it felt like printing money.',
        'The problem was I had tested whether people wanted to buy it.',
        'What I had not tested was whether the business could actually carry it.',
        'That was the mistake.',
        "Worse, I had sold a year's worth of advertising before we had properly tried it in the real world.",
        'Then reality arrived.',
        'Drivers would not always turn the screens on.',
        'Customers did not always want adverts playing in the back of a taxi.',
        'The technology was nowhere near as good as it would be now.',
        'Advertisers were understandably unhappy if they had paid for something that was not being shown.',
        'Drivers were asking what they got out of it.',
        'Customers were leaving bad reviews because they did not want to be advertised to while paying us for a taxi.',
        'That last one mattered most.',
        'The advertisers were customers of the advertising idea.',
        'The passengers were customers of the actual business.',
        'I could refund an advertiser.',
        'Lose a taxi customer and I might never see them again.',
        'And for every customer angry enough to complain, my assumption was there were plenty more who disliked it and just never said anything.',
        'So I started trying to fix it.',
        'Limit the screens.',
        'Make drivers turn them on.',
        'Give passengers the option to switch them off.',
        'Put notices up.',
        'Change the way we ran it.',
        'All of those things were possible.',
        'None of them made the idea worth the effort.',
        'That is something I learnt a few times over the years.',
        'Just because something can be fixed does not mean it deserves fixing.',
        'If I wanted to mark my own homework, I could probably prove the advertising made money.',
        'There was revenue.',
        'There were advertisers.',
        'There were separate accounts opened.',
        'There were businesses we built relationships with.',
        'From a commercial point of view, showing my face to local businesses was not all bad.',
        'As a business owner, having a reason to speak to another local business that is not the obvious sales pitch can be useful.',
        'So I would not call the whole thing a disaster.',
        'But I would still mark the idea down as a loss.',
        'Because a balance sheet does not show everything.',
        'It does not show the time you spent managing something awkward.',
        'It does not show the effort required to keep staff doing something they do not believe in.',
        'It does not show customers quietly getting irritated.',
        'It does not show the damage done when a side project starts interfering with the thing people actually came to you for.',
        'That is where the economics changed.',
        'The advertising made some money.',
        'The business paid for it in other ways.',
        'If I was doing it again, I would have trialled it first.',
        'A couple of local businesses.',
        'A taxi or two.',
        'Free advertising.',
        'No promises.',
        'No year-long commitments.',
        'Then wait.',
        'What do the drivers think?',
        'What do the customers think?',
        'Does the technology work?',
        'Do advertisers actually get what they were promised?',
        'How much effort does it take to keep the whole thing running?',
        'Only then would I decide whether it deserved scaling.',
        'That is the bit I got wrong.',
        'I proved demand before I proved delivery.',
        'Those are not the same thing.',
        'A new revenue stream can look like growth.',
        'Sometimes it is.',
        'Sometimes it is just a distraction with a sales line attached to it.',
        'So now, if someone tells me they have found another way to make money alongside their main business, the first thing I want to know is not how much it could make.',
        'It is this:',
        'What impact will it have on your core business?',
        'And how distracted are you going to become from your bread and butter?'
      ].map((p) => `<p>${p}</p>`).join('');

    const newBodyParagraphs12 = [
        'We were doing around 3,000 jobs a week, which meant roughly 10,000 people sitting in the back of our cars, so the idea seemed obvious: give local businesses the chance to advertise directly to them. And commercially, it worked. Businesses wanted the space, some were bidding against each other and a few even wanted exclusivity within their industry. For a little while, it genuinely felt like printing money.',
        "The problem was that I had tested whether people wanted to buy it, but I had not tested whether the business could actually carry it. Worse, I had already sold a year's worth of advertising before we had properly tried it in the real world.",
        'Then reality arrived. Drivers would not always turn the screens on, customers did not always want adverts playing in the back of a taxi and the technology was nowhere near as reliable as it would be now. Advertisers were understandably unhappy if they had paid for something that was not being shown, and the drivers, never exactly a selfless bunch, quite reasonably wanted to know what they were getting out of it.',
        'The final straw was customers leaving bad reviews because they did not want to be advertised to while they were already paying us for a taxi. That mattered more than anything else because the advertisers were customers of the advertising idea, whereas the passengers were customers of the actual business. I could refund an unhappy advertiser. Lose a taxi customer and I might never see them again, and for every one angry enough to complain I assumed there were plenty more who disliked it and simply said nothing.',
        'So I started trying to fix it. We limited the screens, tried to make sure drivers turned them on, gave passengers the option to switch them off and even put notices in the taxis explaining what was going on. All of those things were possible, but none of them made the idea worth the effort.',
        'That is something I learnt a few times over the years: just because something can be fixed does not mean it deserves fixing.',
        'If I wanted to mark my own homework, I could probably prove the advertising made money. There was revenue, there were advertisers and it opened doors with local businesses that I might not otherwise have spoken to. From a commercial point of view, that was not completely worthless. Having a reason to speak to another business owner without turning up with the obvious sales pitch can be useful, and in some ways it became a bit of a Trojan horse for the taxi business.',
        'So I would not call the whole thing a disaster, but I would still mark it down as a loss because a balance sheet does not show everything. It does not show the time spent managing something awkward, the effort required to keep staff doing something they do not really believe in, the customers quietly getting irritated or the damage caused when a side project starts interfering with the thing people actually came to you for.',
        'That is where the economics changed. The advertising made some money, but the business paid for it in other ways.',
        'If I was doing it again, I would have trialled it properly first. A couple of local businesses, one or two taxis, free advertising, no promises and definitely no year-long commitments. Then I would have waited to see what actually happened. What did the drivers think? How did customers react? Did the technology work? Were advertisers genuinely getting what they had been promised? And, perhaps most importantly, how much effort did the whole thing take to keep running?',
        'Only then would I have decided whether it deserved scaling.',
        'That is the bit I got wrong. I proved demand before I proved delivery, and those are not the same thing.',
        'A new revenue stream can look like growth. Sometimes it is. Sometimes it is just a distraction with a sales line attached to it.',
        'So now, if someone tells me they have found another way to make money alongside their main business, the first thing I want to know is not how much it could make. It is what impact it is going to have on the core business, and how distracted they are going to become from the thing that actually pays the bills.'
      ].map((p) => `<p>${p}</p>`).join('');

    const { rowCount: monumentRewriteCount } = await db.query(
      'UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3',
      [newBodyParagraphs12, 'article__12.body', oldBodyParagraphs12]
    );
    if (monumentRewriteCount > 0) console.log('Useful Thinking: replaced "The Monument to Wasted Money" body with Tom\'s rewrite.');
  }

  // Migration: twelfth Useful Thinking article, "You Build a Business One
  // Problem at a Time" (09/08/2026), supplied directly by Tom via the
  // current Google Drive document of the same name. Reproduced verbatim,
  // paragraph breaks preserved exactly as written in Drive, including "Some
  // will turn out to be bollocks" — approved natural wording, not sanitised.
  // The first Useful Thinking piece built around the sale/exit of one of
  // Tom's businesses; deliberately not connected into either the Commercial
  // Gaps Review or the Owner Dependency Quiz (see
  // lib/usefulThinkingArticles.js for why). No related-link: no companion-
  // piece instruction exists for this article. Idempotent: guarded on the
  // page not existing yet.
  {
    const { rows: existingArticle13 } = await db.query(
      'SELECT slug FROM pages WHERE slug = $1',
      [TWELFTH_PUBLISHED_ARTICLE.slug]
    );
    if (existingArticle13.length === 0) {
      const a13 = TWELFTH_PUBLISHED_ARTICLE.instanceId;
      const bodyParagraphs13 = [
          "When I sold my taxi businesses, the buyers understandably wanted to know everything. Some of the questions were obvious, others were about things I hadn't really thought about for years because to me they were simply part of how the business worked. One of them was driver deposits.",
          "We held £500 from each driver, but it hadn't started as some clever retention strategy. Years earlier a driver had an accident, caused damage to the car and then left with a rather self-righteous view that she shouldn't have to pay for it. I disagreed, but disagreeing didn't fix the car or pay the bill, so afterwards I changed the system. Drivers would build up a £500 deposit, normally at £10 or £20 a week, and if they caused damage they were responsible for the first £500. Anything beyond that would either be covered by the insurance or, quite often, I'd pay for it separately because I've always hated making unnecessary insurance claims.",
          "The policy then evolved because we had another problem. We could spend thousands putting a new car on for somebody, buy the uniform and equipment they'd asked for, get everything ready and then they could have a bad day and leave us high and dry. So the deposit became tied into giving us the required notice as well. Leave properly, return everything and you got your money back.",
          'It shifted a little bit of the balance of power back towards the business and, over time, it just became part of how we operated. The managers knew how it worked. The accountants knew how it worked. The drivers definitely knew how it worked and, as it turned out, so did our competitors.',
          "The people buying the company had tried to poach drivers from us before, so they already knew the deposit existed because it had been a barrier to them doing it. There was something quite satisfying about that. A policy we'd introduced because we'd been bitten a few times had quietly become strong enough that another taxi company had experienced its effect from the outside.",
          'Then I had to explain the whole thing to them as buyers.',
          'Where was the money? How much were we holding? Who did it actually belong to? When was it returned? What happened if somebody damaged a car? What happened if they left?',
          'I knew all the answers. So did the people around me. What surprised me was the value of the cash we were actually holding and, more than that, how different the whole system looked when I had to explain it from beginning to end rather than simply live inside it.',
          "That's when I started noticing something about quite a few parts of the business.",
          "We hadn't sat down one day and designed this magnificent operating system. Most of it had evolved because something had happened and we'd responded to it. Somebody caused damage and left us with the bill, so we changed something. Drivers left after we'd invested thousands in them, so we changed something else. Then somebody found a weakness in the new system, so that changed as well.",
          'You do that for twenty years and the fixes start joining together.',
          "When you're in the middle of it you don't necessarily notice what you're building because you're not thinking about the business as one complete thing. You're dealing with whatever is in front of you. Tuesday gives you a problem, you sort it out. Wednesday gives you another one and hopefully you don't make exactly the same mistake twice.",
          "Some of those decisions will be good. Some will turn out to be bollocks. Others start off solving one problem and end up becoming useful for reasons you hadn't even considered when you introduced them.",
          "The sale forced me to explain all of that to people who hadn't lived through the reasons behind it.",
          'And I was proud of what I saw.',
          "There were elements of how we operated that the new owners talked about taking into their wider business. I don't think I'd ever really considered that somebody buying the company might look at some of the systems we'd built and think, we'll have that.",
          "It was a nice moment because none of it had come from pretending we knew all the answers. It came from getting things wrong, getting caught out, watching what people actually did rather than what we hoped they'd do and changing the business accordingly.",
          "I think that's how a lot of good businesses are really built.",
          'Not in one magnificent strategic exercise.',
          'One problem at a time.',
          "The funny thing is that when you've been there for all of those problems, you remember the individual scars. You remember why a rule changed, why a process exists and probably the name of the person who made you introduce it in the first place.",
          "Someone coming from outside doesn't see any of that.",
          'They see the thing you ended up building.',
          'Selling the business was probably the first time in years that I was forced to do the same.'
        ].map((p) => `<p>${p}</p>`).join('');

      const indexSummary13 = "A £500 driver deposit started as a fix for one problem and quietly evolved into a system strong enough that competitors had felt its effect and buyers wanted to take pieces of it into their own business. On how selling forced Tom to see the whole shape of something he'd only ever lived inside one problem at a time.";

      const a13Rows = [
        [`${a13}.label`, 'USEFUL THINKING'],
        [`${a13}.heading`, TWELFTH_PUBLISHED_ARTICLE.title],
        [`${a13}.index_summary`, indexSummary13],
        [`${a13}.body`, bodyParagraphs13],
        [`${a13}.related_text`, ''],
        [`${a13}.related_link`, ''],
        [`${a13}.image`, '']
      ];
      for (const [key, value] of a13Rows) {
        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [key, value]
        );
      }

      const { rows: maxSortRows13 } = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM pages');
      await db.query(
        `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav, meta_description)
         VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, false, $5)
         ON CONFLICT (slug) DO NOTHING`,
        [TWELFTH_PUBLISHED_ARTICLE.slug, TWELFTH_PUBLISHED_ARTICLE.title, maxSortRows13[0].max_sort + 1, JSON.stringify([a13]), indexSummary13]
      );

      console.log(`Useful Thinking: 12th article published (${a13}, ${TWELFTH_PUBLISHED_ARTICLE.slug}).`);
    }
  }

  // Migration: thirteenth Useful Thinking article, "You Can Train, But You
  // Shouldn't Blame" (26/08/2026), supplied directly by Tom via the current
  // Google Drive document of the same name ("Useful Thinking - You Can
  // Train, But You Shouldn't Blame"). Reproduced verbatim from the
  // public-facing portion only — the Drive doc's "INTERNAL NOTES — NOT FOR
  // PUBLICATION" section (status line, buyer-language note, divider) is
  // explicitly excluded per Tom's own instruction; the public article
  // starts at "We used to make the dry joke...". Paragraph breaks preserved
  // exactly as written in Drive, including "blaming them afterwards is
  // bollocks" and the specific accident detail — both consciously approved
  // by Tom, not sanitised or anonymised further. Deliberately not connected
  // into either the Commercial Gaps Review or the Owner Dependency Quiz:
  // the Drive doc's internal notes name a buyer-language problem ("Why
  // does everyone still come to me for decisions?") that maps naturally to
  // the Commercial Gaps Review's decision_making category, but that
  // category is already claimed by "Being Certain Isn't the Same as Being
  // Right" (article, the first published piece) and reassigning it wasn't
  // part of this instruction — flagged for Tom rather than decided here.
  // Idempotent: guarded on the page not existing yet.
  {
    const { rows: existingArticle14 } = await db.query(
      'SELECT slug FROM pages WHERE slug = $1',
      [THIRTEENTH_PUBLISHED_ARTICLE.slug]
    );
    if (existingArticle14.length === 0) {
      const a14 = THIRTEENTH_PUBLISHED_ARTICLE.instanceId;
      const bodyParagraphs14 = [
          'We used to make the dry joke in the taxi office that we should ban ingenuity.',
          'It sounds ridiculous, but if you have ever run a business where people need to make decisions without you, you just might understand why.',
          'We had two accidents about two weeks apart that were almost identical. A drunk driver had ploughed into one of our cars in the early hours. Both were dealt with by different operators in the office. Both operators knew the procedure, but boy, what happened next could not have been more different.',
          'The first operator did everything you would want her to do, as she always did. She contacted the police, got the driver to take photographs and record what had happened, took the passengers’ details and apologised to them. Then she went further than the procedure required and sent another car to take the passengers home for free, while again contacting them to make sure they weren’t hurt.',
          'Textbook. To be honest, way better than textbook.',
          'Then, literally two weeks later, we had another accident. This time the operator forgot to tell the driver to take photographs. The police weren’t contacted, despite our driver suspecting the other driver had been drinking. The passengers were left to fend for themselves and walk home, which obviously, and rightly so, led to a one-star Google review.',
          'The results weren’t just different on the night. The first accident eventually resulted in the other driver being prosecuted and our insurance claim being settled as non-fault. Our driver even received loss of earnings for the night and the following week.',
          'The second went 50/50, and we picked up the negative Google review from the passengers as well. Because no photographs had been taken and the police hadn’t been contacted, we simply had less contemporaneous evidence available when liability was being worked out.',
          'That difference wasn’t just academic. When the insurance came up for renewal, the claims history cost me thousands of pounds.',
          'The obvious conclusion would be that we needed better procedures. But in reality, we didn’t. The procedure already existed. It was written down and had been briefed in the office. People knew what they were supposed to do.',
          'Afterwards I tightened things further and made every member of staff, including the operators, sign to confirm that they understood their responsibilities. Previously the operators hadn’t been included in that. It helped with accountability, but it didn’t solve the real problem.',
          'No procedure is foolproof, which takes me back to our joke about banning ingenuity. Maybe we only wanted to ban it when it was wrong.',
          'We ran a business 24 hours a day, 365 days a year. I did that for two decades. In that environment, exceptional situations are not particularly exceptional. Eventually something happens that isn’t quite covered by the rulebook and somebody has to make a judgement call.',
          'And a judgement call is just that. Some people are exceptionally good at them. Others aren’t.',
          'That creates an uncomfortable problem when two people have exactly the same job. You might trust one operator to make a decision outside the normal remit of their role because you know how they think under pressure. Another person might be loyal, hardworking and useful to the business in plenty of other ways, but you wouldn’t want them making the same call.',
          'Of course I treated them differently — the alternative was pretending a job title made their judgement identical.',
          'Businesses often try to solve that problem with more rules. Put another procedure in place, add another approval, make everybody ask a manager before doing something. Eventually you can create an enormous structure simply because admitting that you trust one person’s judgement more than another person’s feels wrong. But where is the line between management and hierarchy when two people are technically doing the same role?',
          'And in business and in life, you pull at one string to solve a problem and create another. Put too many controls around people and decisions start travelling back up the hierarchy until eventually everyone comes to the owner.',
          'I don’t think the answer is simply telling people to use their initiative either. That is easy advice to give when it isn’t your insurance renewal, customer or reputation sitting on the other side of somebody else’s decision.',
          'You can train people, and of course you should. If somebody makes a poor decision because you haven’t trained them properly, blaming them afterwards is bollocks. That’s a management failure. But you cannot train for every eventuality.',
          'You can teach procedures, talk through previous decisions and try to develop broader commercial judgement. What is much harder is pressure-testing somebody for a situation neither of you has encountered yet. Even the people I trusted most occasionally made bad calls. They were human. Personal life, emotion, tiredness or pressure can affect anybody, and somebody who has made fifty good decisions can still get number fifty-one wrong.',
          'That is the bit I think gets missed when people talk about owner dependency and delegation as though the answer is simply giving more decisions away. Owners often struggle to do that because they have paid, sometimes quite literally, for somebody else’s bad judgement before.',
          'But making every decision yourself isn’t the answer either. You cannot run a 24-hour business that way without eventually becoming the thing everything depends on.',
          'You can reduce that risk. You can’t write it out of the business.'
      ].map((p) => `<p>${p}</p>`).join('');

      const indexSummary14 = 'Two nearly identical accidents in the same taxi office, handled by two different people, with two very different outcomes. On why blaming someone for a bad decision is not the same as holding them properly accountable, and why training people well still cannot remove the need for judgement.';

      const a14Rows = [
        [`${a14}.label`, 'USEFUL THINKING'],
        [`${a14}.heading`, THIRTEENTH_PUBLISHED_ARTICLE.title],
        [`${a14}.index_summary`, indexSummary14],
        [`${a14}.body`, bodyParagraphs14],
        [`${a14}.related_text`, ''],
        [`${a14}.related_link`, ''],
        [`${a14}.image`, '']
      ];
      for (const [key, value] of a14Rows) {
        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [key, value]
        );
      }

      const { rows: maxSortRows14 } = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM pages');
      await db.query(
        `INSERT INTO pages (slug, title, sort_order, section_order, hidden_sections, deleted_sections, show_in_nav, meta_description)
         VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, false, $5)
         ON CONFLICT (slug) DO NOTHING`,
        [THIRTEENTH_PUBLISHED_ARTICLE.slug, THIRTEENTH_PUBLISHED_ARTICLE.title, maxSortRows14[0].max_sort + 1, JSON.stringify([a14]), indexSummary14]
      );

      console.log(`Useful Thinking: 13th article published (${a14}, ${THIRTEENTH_PUBLISHED_ARTICLE.slug}).`);
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

  // Migration: tighten SEO snippets flagged in the 17/08/2026 audit. The
  // visible page titles and article copy stay intact; this only updates search
  // metadata where it is blank, too long for a clean result, or still contains
  // retired offer language.
  {
    const seoFixes = [
      [
        'business-consultant-devon',
        'Business Consultant Devon & Cornwall | Arrington Consultancy',
        'Business consultant for owner run businesses across Devon and Cornwall. Outside perspective on commercial decisions, owner dependency and practical next steps.'
      ],
      [
        'you-dont-get-to-decide-when-youve-made-things-right',
        'When Making Things Right Still Costs the Account | Arrington',
        'A late airport transfer cost Tom a major account despite the apology and refund. A Useful Thinking article on responsibility and consequences.'
      ],
      [
        'the-tightrope-between-staff-loyalty-and-damage-control',
        'Staff Loyalty and Damage Control | Arrington Consultancy',
        'A Useful Thinking article on loyalty, tolerance and the commercial cost of leaving a persistent problem untouched for too long.'
      ],
      [
        'you-build-a-business-one-problem-at-a-time',
        'You Build a Business One Problem at a Time | Arrington',
        'A Useful Thinking article on how a buyer can reveal the commercial shape of a business the owner built one problem at a time.'
      ]
    ];
    let seoFixCount = 0;
    for (const [slug, metaTitle, metaDescription] of seoFixes) {
      const { rowCount } = await db.query(
        `UPDATE pages
         SET meta_title = CASE
               WHEN meta_title = '' OR char_length(meta_title) > 65 THEN $1
               ELSE meta_title
             END,
             meta_description = CASE
               WHEN meta_description = ''
                 OR char_length(meta_description) > 160
                 OR meta_description ILIKE '%proper commercial review%'
               THEN $2
               ELSE meta_description
             END
         WHERE slug = $3`,
        [metaTitle, metaDescription, slug]
      );
      seoFixCount += rowCount;
    }
    if (seoFixCount > 0) console.log(`SEO audit: checked/tightened metadata on ${seoFixCount} page row(s).`);
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

  // Seed images (idempotent: ON CONFLICT DO NOTHING) — this only ever
  // populates a MISSING row (fresh database, local dev, disaster recovery),
  // never touches a `headshot` row that already exists, so it can never
  // overwrite whatever is live on production.
  //
  // `headshot` (15/08/2026): `hero-homepage.jpg` — the approved coastal/
  // window homepage hero photo. Previously this key fell back to
  // `headshot.png`, an unrelated AI-generated portrait that had been
  // checked into the repo root as a byproduct of an earlier session's
  // throwaway Playwright diagnostic tooling (PR #58, "Fix hang in
  // full-review diagnostic") and never should have been usable as a hero
  // fallback. `hero-homepage.jpg` is the exact production `/img/headshot`
  // bytes (md5 ff3ce00eaaa3e6a000ebaf1383dfb58b, confirmed matching a
  // direct fetch of the live URL) — not recompressed, cropped or
  // regenerated. Known gap not yet fixed: there is still no `headshot__webp`
  // seed row, so a fresh database's `/img/headshot.webp` request 404s;
  // production has one because it was uploaded via the CMS. Needs the same
  // exact-bytes treatment before it's closed, not a re-encode assumed to be
  // equivalent.
  //
  // `headshot__hero__5` is the per-instance photo for the Websites and AI
  // page's hero (confirmed live as instance id hero__5 — see the migration
  // above). Tom's own photo, supplied after the page went live; before this
  // the hero fell back to the site's default `headshot` image, same as any
  // freshly-added hero. Re-compressed from the original ~2.9MB PNG to a
  // ~130KB JPEG (quality 85) — visually identical at hero-background size,
  // well under the CMS's 2MB upload cap.
  const images = [
    { key: 'logo', file: 'logo.png', mime: 'image/png' },
    { key: 'headshot', file: 'hero-homepage.jpg', mime: 'image/jpeg' },
    { key: 'headshot__webp', file: 'headshot.webp', mime: 'image/webp' },
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

  // Migration: swap known old logo assets for the transparent cropped stacked
  // Arrington Consultancy lockup. Only replaces exact known hashes, so a
  // later CMS upload is preserved.
  {
    const logoPath = path.join(__dirname, '..', 'logo.png');
    const { rows } = await db.query('SELECT data FROM images WHERE image_key = $1', ['logo']);
    if (rows.length > 0 && fs.existsSync(logoPath)) {
      const currentMd5 = crypto.createHash('md5').update(rows[0].data).digest('hex');
      const replaceableLogoMd5s = new Set([
        '1b59d855877e5ceeea549f0b74ef1761',
        '2d02b99128fe3d33a8d0d6305e266bbc',
        '4855292a9ee382f1d708e3f5f9745200',
        '73038371d01eda10ffb8fa842676b39d',
        'e36943a3209bc26b97467844ba427565'
      ]);
      if (replaceableLogoMd5s.has(currentMd5)) {
        await db.query(
          'UPDATE images SET data = $1, mime_type = $2 WHERE image_key = $3',
          [fs.readFileSync(logoPath), 'image/png', 'logo']
        );
        console.log('Swapped logo to the transparent cropped stacked gold lockup.');
      }
    }
  }

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

  // Migration: homepage hero — consolidate the two supporting text blocks
  // into a single line (15/08/2026). The live hero.subtext value was set
  // directly via the CMS (never tracked by a seed migration), so this is
  // guarded by a dedicated marker key rather than a known-old-value match —
  // applies regardless of the exact current text, fires once, and never
  // re-clobbers a future manual edit Tom makes via the CMS.
  {
    const HERO_SUBTEXT_MARKER = 'hero.subtext_single_line_2026-08-15';
    const { rows: heroMarkerRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1',
      [HERO_SUBTEXT_MARKER]
    );
    if (heroMarkerRows.length === 0) {
      await db.query(
        `INSERT INTO content (section_key, content) VALUES ('hero.subtext', $1)
         ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content`,
        ['Business consultant for established owner run businesses across Devon and Cornwall where too much still depends on the owner.']
      );
      await db.query(
        'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
        [HERO_SUBTEXT_MARKER, 'true']
      );
      console.log('Homepage hero: supporting copy consolidated into a single line.');
    }
  }

  // Migration: homepage hero — restrained credibility line beneath the CTA
  // (15/08/2026). All three facts independently checked against controlled
  // evidence before this was written: "Two decades..." matches the Master
  // CV and the live About Us copy (both say "two decades"/"nearly two
  // decades" of Abacus/TNFP ownership, not "20+"); "Oxford Saïd,
  // Distinction" matches the Master CV and the Brand Operating System's
  // proof principles; "5.0 on Google" matches the exact "5.0 from 5
  // reviews on Google" text already live on the homepage. New optional
  // hero.proof_line field, empty by default (see db/lorem.js), seeded only
  // for the base homepage hero instance. Marker-guarded so it fires once
  // and never re-clobbers a future manual edit via the CMS.
  {
    const HERO_PROOF_LINE_MARKER = 'hero.proof_line_2026-08-15';
    const { rows: proofLineMarkerRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1',
      [HERO_PROOF_LINE_MARKER]
    );
    if (proofLineMarkerRows.length === 0) {
      await db.query(
        `INSERT INTO content (section_key, content) VALUES ('hero.proof_line', $1)
         ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content`,
        ['Two decades building, buying and selling businesses · Oxford Saïd, Distinction · 5.0 on Google']
      );
      await db.query(
        'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
        [HERO_PROOF_LINE_MARKER, 'true']
      );
      console.log('Homepage hero: credibility line added beneath the CTA.');
    }
  }

  // Migration: homepage hero supporting copy — remove the final clause
  // only when production still has the exact approved previous sentence.
  // This protects any later CMS edit while keeping fresh installs aligned
  // through db/defaults.js.
  {
    const HERO_SUBTEXT_OLD = 'Business consultant for established owner run businesses across Devon and Cornwall where too much still depends on the owner.';
    const HERO_SUBTEXT_NEW = 'Business consultant for established owner run businesses across Devon and Cornwall.';
    const { rowCount } = await db.query(
      'UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3',
      [HERO_SUBTEXT_NEW, 'hero.subtext', HERO_SUBTEXT_OLD]
    );
    if (rowCount > 0) {
      console.log('Homepage hero: supporting copy tightened.');
    } else {
      console.log('Homepage hero: supporting copy unchanged; exact old value not present.');
    }
  }

  // Migration: About Us conversion and credibility pass (15/08/2026), from a
  // mobile review of the live page. Seven approved edits, all content only.
  //
  // This page's copy has only ever existed in the production database, never
  // in this file, so a one-time guarded migration is the only way to change it
  // in code. Same pattern as the homepage hero blocks above: a marker row makes
  // it run exactly once, and every individual edit additionally checks that the
  // stored value is still the one it expects, so an edit Tom makes in the CMS
  // between deploys is never clobbered. Nothing here re-asserts on later boots.
  //
  // What changed and why (mobile measurements at 390x844):
  //   1. The page had no call to action for 4.1 screens and nothing leading to
  //      a conversation for 4.9. A primary CTA now closes Tom's biography at
  //      roughly 1.4 screens.
  //   2. "The reason we are here" stored its paragraph breaks as literal
  //      newlines, which HTML collapses, so four sentences rendered as one
  //      run-on slab. Markup fixed, wording untouched. A malformed nested
  //      <strong> in the same value is cleaned up at the same time.
  //   3. The credentials block led with a university. The Brand Operating
  //      System is explicit that operator proof comes first and formal
  //      credentials support it, so the two blocks are swapped into that order:
  //      the left block now carries the operator record, the right block keeps
  //      the preserved "Learned in the real world" line and picks up the Oxford
  //      naming the left block gives up. Deliberately NOT a copy of the
  //      homepage proof strip, and no new element: this is the page's existing
  //      credentials section saying the same things in the right order.
  //   4. A reader four screens in wants proof, and the only link at that point
  //      went to the Devon landing page. The Devon link is untouched; a route
  //      to Evidence is added one section earlier. The intervention template
  //      renders a single button and content sanitisation allows no anchors
  //      (strong/p/br/em only), so an existing empty button field is the only
  //      way to add this without changing the page structure.
  //   5. The biography and "The reason we are here" both said Tom started the
  //      business to be the outside perspective he had wished for. The second
  //      is the better written of the two, so the clause is trimmed from the
  //      biography.
  //   8. The credentials sub-paragraph repeated the biography almost verbatim,
  //      and Hannah's paragraph used "actually" twice within three sentences.
  //
  // Item 6 (enlarging the founder photo on mobile) is a CSS change in
  // views/index.ejs, not content, so it is not part of this migration.
  // Item 7 (a photograph for Hannah) is closed: Hannah does not want her
  // photograph on the website. The monogram treatment stays. Do not revisit.
  {
    const ABOUT_US_MARKER = 'about-us.conversion_pass_2026-08-15';
    const { rows: aboutMarkerRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1',
      [ABOUT_US_MARKER]
    );
    const { rows: aboutPageRows } = await db.query(
      "SELECT section_order FROM pages WHERE slug = 'about-us'"
    );

    if (aboutMarkerRows.length === 0 && aboutPageRows.length > 0) {
      const order = Array.isArray(aboutPageRows[0].section_order) ? aboutPageRows[0].section_order : [];
      const baseOf = (id) => {
        const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
        return m ? m[1] : null;
      };

      const readKey = async (key) => {
        const { rows } = await db.query('SELECT content FROM content WHERE section_key = $1', [key]);
        return rows.length ? (rows[0].content || '') : null;
      };
      const applied = [];
      // Writes only when the stored value is still exactly what this migration
      // was written against, so a CMS edit made in the meantime always wins.
      const setIfUnchanged = async (key, expected, next, label) => {
        const current = await readKey(key);
        if (current === null || current !== expected) return false;
        await db.query('UPDATE content SET content = $1 WHERE section_key = $2', [next, key]);
        applied.push(label);
        return true;
      };

      // Resolve the instances by what they contain rather than by hardcoded
      // IDs: the biography is the intervention carrying the founder photo,
      // Hannah's is the one carrying a monogram, and "the reason we are here"
      // is matched on its heading.
      const interventions = order.filter((id) => baseOf(id) === 'intervention');
      let bioId = null;
      let hannahId = null;
      let reasonId = null;
      for (const id of interventions) {
        if (!bioId && (await readKey(`${id}.photo_key`))) { bioId = id; continue; }
        if (!hannahId && (await readKey(`${id}.monogram`))) { hannahId = id; continue; }
        const heading = (await readKey(`${id}.heading`)) || '';
        if (!reasonId && /The reason we are here/i.test(heading)) reasonId = id;
      }
      const credId = order.find((id) => baseOf(id) === 'credentials') || null;

      // --- Item 5: trim the duplicated "outside perspective" clause ---------
      if (bioId) {
        const bio = await readKey(`${bioId}.subtext`);
        const DUPLICATED_CLAUSE = ' to be the outside perspective he had wished for early on';
        if (bio && bio.includes(DUPLICATED_CLAUSE)) {
          await db.query(
            'UPDATE content SET content = $1 WHERE section_key = $2',
            [bio.replace(DUPLICATED_CLAUSE, ''), `${bioId}.subtext`]
          );
          applied.push('5 biography duplicate clause trimmed');
        }

        // --- Item 1: primary CTA closing the biography ----------------------
        const existingBtn = ((await readKey(`${bioId}.button_text`)) || '').trim();
        if (!existingBtn) {
          for (const [key, value] of [
            [`${bioId}.button_text`, 'Start a conversation'],
            // Empty slug resolves to #conversation (the global footer form) and
            // renders as the primary button style. See the intervention
            // template's _btnHref / _isPrimaryCta handling in views/index.ejs.
            [`${bioId}.button_link`, '']
          ]) {
            await db.query(
              `INSERT INTO content (section_key, content) VALUES ($1, $2)
               ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content`,
              [key, value]
            );
          }
          applied.push('1 biography CTA added');
        }
      }

      // --- Items 3 and 8: credentials block, operator proof first -----------
      if (credId) {
        await setIfUnchanged(
          `${credId}_stat.stat`,
          'Oxford Saïd',
          'Two decades',
          '3 credentials stat leads with the operator record'
        );
        await setIfUnchanged(
          `${credId}_stat.text`,
          'Executive Strategy Programme',
          'Running, growing and eventually selling an owner run business in the South West.',
          '3 credentials summary'
        );
        // The naming the left block gives up moves here, replacing a sentence
        // that repeated the biography almost word for word. The heading above
        // it ("Learned in the real world, then qualified in the classroom.")
        // is deliberately untouched.
        await setIfUnchanged(
          `${credId}_oxford.text`,
          'Tom studied strategy formally after twenty years of running and exiting his own business.',
          'Oxford Saïd Business School, Executive Strategy Programme.',
          '8 credentials sub-paragraph replaced with the Oxford naming'
        );
      }

      // --- Item 8: one of Hannah's two "actually"s -------------------------
      if (hannahId) {
        const hannah = await readKey(`${hannahId}.subtext`);
        const OLD_TAIL = 'Clear positioning, consistent messaging, and making sure the business comes across as it actually is.';
        const NEW_TAIL = 'Clear positioning, consistent messaging, and no gap between what the business says and what it does.';
        if (hannah && hannah.includes(OLD_TAIL)) {
          await db.query(
            'UPDATE content SET content = $1 WHERE section_key = $2',
            [hannah.replace(OLD_TAIL, NEW_TAIL), `${hannahId}.subtext`]
          );
          applied.push('8 Hannah closing line reworded');
        }
      }

      // --- Item 2: restore the lost paragraph breaks -----------------------
      // --- Item 4: contextual route to Evidence ----------------------------
      if (reasonId) {
        const reason = await readKey(`${reasonId}.subtext`);
        if (reason && reason.includes('\n')) {
          const repaired = reason
            .replace(/\r\n/g, '\n')
            .split(/\n{2,}/)
            .map((part) => part.trim())
            .filter(Boolean)
            .join('<br><br>')
            .replace(/\n/g, ' ')
            // Sanitised content allows <strong>, but this value had picked up a
            // stray unclosed pair inside the closing sentence.
            .replace(/<strong><\/strong>/g, '')
            .replace(/<strong>\s*<strong>/g, '<strong>')
            .replace(/<\/strong>\s*<\/strong>/g, '</strong>');
          await db.query(
            'UPDATE content SET content = $1 WHERE section_key = $2',
            [repaired, `${reasonId}.subtext`]
          );
          applied.push('2 paragraph breaks restored');
        }

        const existingBtn = ((await readKey(`${reasonId}.button_text`)) || '').trim();
        if (!existingBtn) {
          for (const [key, value] of [
            [`${reasonId}.button_text`, 'See what that looks like in practice'],
            [`${reasonId}.button_link`, 'evidence']
          ]) {
            await db.query(
              `INSERT INTO content (section_key, content) VALUES ($1, $2)
               ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content`,
              [key, value]
            );
          }
          applied.push('4 Evidence route added');
        }
      }

      await db.query(
        'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
        [ABOUT_US_MARKER, 'true']
      );
      console.log(`About Us conversion pass applied (${applied.length ? applied.join('; ') : 'no changes needed'}).`);
    }
  }

  // Migration: What We Do rebuilt around the real sequence (16/08/2026), on
  // Tom's approved copy. The page previously led with a four-card block
  // (01 Listening / 02 Operations / 03 Numbers / 04 Action Plan) that
  // described categories rather than what happens after an owner gets in
  // touch, and whose fourth card stated an outcome ("The business feels
  // clearer, lighter and easier to run") in the slot meant for the plan.
  //
  // The page now follows: conversation, understanding the business properly,
  // clear priorities, implementation if wanted, later check-in. The three
  // existing bridge sections (Evidence, Useful Thinking, Websites and AI) keep
  // their instances, their order and their copy.
  //
  // This page's copy only ever existed in the production database, so a
  // one-time guarded migration is the only way to change it in code. Same
  // pattern as the About Us pass above: a marker row makes it run exactly once,
  // and the rewrite of the existing "Six months on" section additionally checks
  // the stored value is still the one it was written against, so a CMS edit
  // made in between is never clobbered.
  //
  // The old fourcards content is deliberately left in the content table. The
  // instance is only dropped from this page's section_order, so it shows up in
  // the admin "Reuse existing" tab and can be reattached if Tom wants it back.
  {
    const WWD_MARKER = 'what-we-do.review_sequence_2026-08-16';
    const { rows: wwdMarkerRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1',
      [WWD_MARKER]
    );
    const { rows: wwdPageRows } = await db.query(
      "SELECT section_order FROM pages WHERE slug = 'what-we-do'"
    );

    if (wwdMarkerRows.length === 0 && wwdPageRows.length > 0) {
      const order = Array.isArray(wwdPageRows[0].section_order) ? wwdPageRows[0].section_order : [];
      const baseOf = (id) => {
        const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
        return m ? m[1] : null;
      };

      // Same collision-avoidance approach as the Websites and AI migration:
      // collect every instance ID in use across all pages plus every distinct
      // content-table prefix before picking new ones, rather than hardcoding.
      const used = new Set();
      const { rows: allOrders } = await db.query('SELECT section_order FROM pages');
      for (const r of allOrders) {
        if (Array.isArray(r.section_order)) r.section_order.forEach((s) => used.add(s));
      }
      const { rows: prefixes } = await db.query(
        "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content"
      );
      prefixes.forEach((r) => used.add(r.instance_id));
      const allocate = (tpl) => {
        if (!used.has(tpl)) { used.add(tpl); return tpl; }
        for (let n = 2; n <= 99; n++) {
          const id = `${tpl}__${n}`;
          if (!used.has(id)) { used.add(id); return id; }
        }
        return null;
      };

      const conversationId = allocate('intervention');
      const lookId = allocate('filter');
      const levelsId = allocate('biography');

      if (conversationId && lookId && levelsId) {
        const put = async (key, value) => {
          await db.query(
            'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
            [key, value]
          );
        };

        // 1. The conversation. This becomes the page's first section, so its
        //    heading is promoted to <h1> by the view's _h1Used logic, which
        //    puts the page's strongest line in the H1 for the first time: it
        //    was previously the small eyebrow label above a weaker heading.
        await put(`${conversationId}.heading`, 'A proper commercial review of how the business really works.');
        await put(`${conversationId}.subtext`,
          'It starts with a conversation.<br><br>'
          + 'That is the 30 Minute Conversation on this site. If it runs over a bit because the conversation is worth having, nobody is watching the clock.<br><br>'
          + 'You tell us what is going on, where the pressure is showing, what is frustrating you and what you are trying to get to. There is nothing to prepare and no need to have it worked out first. Most of what we need is already in your head.<br><br>'
          + 'Then we go and look at the business itself.');
        await put(`${conversationId}.button_text`, '');
        await put(`${conversationId}.button_link`, '');

        // 2. What we look at. filter is the only template that skips empty
        //    list slots, so it is the one that can carry this list honestly.
        await put(`${lookId}.label`, 'WHAT WE LOOK AT');
        await put(`${lookId}.heading`, 'Most owners are too close to see all of it.');
        // Both paragraphs go in p1. The filter template renders
        // intro -> p1 -> list -> p2 -> closing, so splitting these across p1
        // and p2 would drop the list in between them and leave "So we look at
        // it from more than one angle" sitting after the list it introduces.
        // p2 is guarded on being non-empty, so leaving it blank renders nothing.
        await put(`${lookId}.p1`,
          'That is not a criticism. You have lived inside the business every day for years. You stop noticing what you walk past, and the things that have changed slowly are often the hardest to spot.<br><br>'
          + 'So we look at it from more than one angle. The information is usually already inside the business, it just needs pulling together properly.');
        await put(`${lookId}.p2`, '');
        await put(`${lookId}.item_1`, 'What you see, and what your staff see');
        await put(`${lookId}.item_2`, 'How the business actually works day to day');
        await put(`${lookId}.item_3`, 'What the numbers say, including the bank statements and the accounts');
        await put(`${lookId}.item_4`, 'What has quietly become normal');
        await put(`${lookId}.item_5`, 'Where margin and time are going');
        await put(`${lookId}.item_6`, 'Opportunities the business is close to but not taking');
        await put(`${lookId}.item_7`, 'Who decides what, and who ends up carrying it');
        await put(`${lookId}.item_8`, 'Where the business still depends on you when it does not need to');
        await put(`${lookId}.closing`,
          'Often, the problems are not dramatic. They have simply become normal.<br><br>'
          + 'We are not hunting for faults. You have built something that works and most of it stays as it is. You get a clear view of what matters, what to change first and what to leave alone, then what to do next, in order.');
        await put(`${lookId}.intro`, '');
        await put(`${lookId}.button_text`, '');
        await put(`${lookId}.button_link`, 'main');
        for (let n = 1; n <= 3; n++) {
          await put(`${lookId}.row_${n}_action`, '');
          await put(`${lookId}.row_${n}_client`, '');
        }

        // 3. The two engagement levels. biography's two columns are the right
        //    shape for a genuine comparison; each column opens with a bold
        //    lead-in because the template has no per-column heading field.
        await put(`${levelsId}.label`, 'HOW FAR WE GO');
        await put(`${levelsId}.heading`, 'Two levels of involvement');
        await put(`${levelsId}.col_1_p1`, '<strong>Commercial Review, £500.</strong> We listen, go through the business and the evidence, and write it up: what we found, what we would do about it, and what to do first.');
        await put(`${levelsId}.col_1_p2`, 'It stands on its own. You get a clear written view of what we found, what we think matters and what we would do next. Plenty of owners take it from there and make the changes themselves.');
        await put(`${levelsId}.col_2_p1`, '<strong>Commercial Review and Implementation, £2,500 in total.</strong> The review with a lot more time behind it, and then we stay involved and help you put the plan into practice.');
        await put(`${levelsId}.col_2_p2`, 'That might be commercial reporting, systems, business structure, practical AI tools, website work, or working alongside your accountant where the advice needs to sit with them. No business needs all of it. If you have already paid £500 for the Commercial Review, that comes off the £2,500.');
        await put(`${levelsId}.photo_key`, '');
        await put(`${levelsId}.stat_number`, '');
        await put(`${levelsId}.stat_label`, '');

        // 4. Rewrite the existing "Six months on" section in place, keeping its
        //    instance and its Evidence button. Guarded on the stored heading so
        //    a CMS edit made in the meantime wins.
        let sixMonthsId = null;
        for (const id of order.filter((i) => baseOf(i) === 'intervention')) {
          const { rows: hRows } = await db.query(
            'SELECT content FROM content WHERE section_key = $1',
            [`${id}.heading`]
          );
          if (hRows.length > 0 && (hRows[0].content || '').trim() === 'Six months on.') {
            sixMonthsId = id;
            break;
          }
        }
        let sixMonthsRewritten = false;
        if (sixMonthsId) {
          const { rows: shRows } = await db.query(
            'SELECT content FROM content WHERE section_key = $1',
            [`${sixMonthsId}.subtext`]
          );
          if (shRows.length > 0) {
            await db.query(
              'UPDATE content SET content = $1 WHERE section_key = $2',
              [
                'Six months later we check in and see what actually changed.<br><br>'
                + 'Some of it will have stuck, some of it will have slipped, and the business will have moved on in places. Usually it is a straightforward conversation. Occasionally there is more worth doing.<br><br>'
                + 'The check-in comes with both the review and the implementation work. It is a phone call, not another stage to book. Six months is long enough to see what actually changed and whether the work was useful.',
                `${sixMonthsId}.subtext`
              ]
            );
            sixMonthsRewritten = true;
          }
        }

        // 5. New order: the three new sections first, then everything that was
        //    already there minus the fourcards block. Building it by filter
        //    rather than by literal list keeps the existing bridge sections in
        //    whatever order Tom has them in.
        const kept = order.filter((id) => baseOf(id) !== 'fourcards');
        const newOrder = [conversationId, lookId, levelsId, ...kept];
        await db.query(
          "UPDATE pages SET section_order = $1::jsonb WHERE slug = 'what-we-do'",
          [JSON.stringify(newOrder)]
        );

        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [WWD_MARKER, 'true']
        );
        console.log(`What We Do rebuilt (${conversationId}, ${lookId}, ${levelsId}; six-months rewritten: ${sixMonthsRewritten}; order: ${newOrder.join(' ')}).`);
      } else {
        console.log('What We Do rebuild skipped: could not allocate instance IDs.');
      }
    }
  }

  // Follow-up to the What We Do rebuild above (16/08/2026). That migration
  // matched the "Six months on" section on an exact string comparison of the
  // stored heading, which succeeded locally but returned no match on
  // production, so the three new sections shipped while this one kept its old
  // copy. The live heading renders as "Six months on." but the stored value
  // evidently differs from that exact string, most likely by markup or
  // whitespace, so this pass strips tags and normalises whitespace before
  // comparing rather than guessing which.
  //
  // Its own marker, because the first migration has already stamped and will
  // not re-run. Guarded twice over: the section is only rewritten if its
  // subtext still contains the old opening line, so a CMS edit always wins.
  {
    const WWD_SIX_MONTHS_MARKER = 'what-we-do.six_months_copy_2026-08-16';
    const { rows: markerRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1',
      [WWD_SIX_MONTHS_MARKER]
    );
    const { rows: pageRows } = await db.query(
      "SELECT section_order FROM pages WHERE slug = 'what-we-do'"
    );

    if (markerRows.length === 0 && pageRows.length > 0) {
      const order = Array.isArray(pageRows[0].section_order) ? pageRows[0].section_order : [];
      const plain = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      const NEW_SUBTEXT =
        'Six months later we check in and see what actually changed.<br><br>'
        + 'Some of it will have stuck, some of it will have slipped, and the business will have moved on in places. Usually it is a straightforward conversation. Occasionally there is more worth doing.<br><br>'
        + 'The check-in comes with both the review and the implementation work. It is a phone call, not another stage to book. Six months is long enough to see what actually changed and whether the work was useful.';

      let rewritten = null;
      for (const id of order) {
        if (!/^intervention(?:__\d+)?$/.test(id)) continue;
        const { rows: hRows } = await db.query(
          'SELECT content FROM content WHERE section_key = $1', [`${id}.heading`]
        );
        if (hRows.length === 0 || plain(hRows[0].content) !== 'six months on.') continue;

        const { rows: sRows } = await db.query(
          'SELECT content FROM content WHERE section_key = $1', [`${id}.subtext`]
        );
        if (sRows.length === 0) continue;
        if (!plain(sRows[0].content).includes('the work does not end when the review is finished')) continue;

        await db.query(
          'UPDATE content SET content = $1 WHERE section_key = $2',
          [NEW_SUBTEXT, `${id}.subtext`]
        );
        rewritten = id;
        break;
      }

      await db.query(
        'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
        [WWD_SIX_MONTHS_MARKER, 'true']
      );
      console.log(`What We Do six-months copy: ${rewritten ? 'rewritten (' + rewritten + ')' : 'no matching section found, left unchanged'}.`);
    }
  }

  // Migration: CTA on the What We Do "what we look at" section (16/08/2026).
  // The rebuilt page put its first call to action 4.1 screens down on mobile,
  // up from 2.4 before, because the three new sections carry none and the first
  // one is the Evidence link. This fills the button fields that section already
  // has, so no copy, layout or styling changes.
  //
  // The destination is the £500 Commercial Review at
  // /where-to-start/commercial-review. That is an Express route rather than a
  // `pages` row, so the button_link value carries a nested path; the filter
  // template's slug validator was widened to accept one nested segment in the
  // same change, otherwise the value fails validation and the href silently
  // falls back to #conversation.
  //
  // Renders as btn-outline, since _fIsPrimaryCta is only true for an empty slug
  // or the booking page, which matches the other mid-page CTAs.
  {
    const WWD_CTA_MARKER = 'what-we-do.look_section_cta_2026-08-16';
    const { rows: markerRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1', [WWD_CTA_MARKER]
    );
    const { rows: pageRows } = await db.query(
      "SELECT section_order FROM pages WHERE slug = 'what-we-do'"
    );

    if (markerRows.length === 0 && pageRows.length > 0) {
      const order = Array.isArray(pageRows[0].section_order) ? pageRows[0].section_order : [];
      const plain = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      let target = null;
      for (const id of order) {
        if (!/^filter(?:__\d+)?$/.test(id)) continue;
        const { rows } = await db.query(
          'SELECT content FROM content WHERE section_key = $1', [`${id}.heading`]
        );
        if (rows.length && plain(rows[0].content) === 'most owners are too close to see all of it.') { target = id; break; }
      }

      if (target) {
        // Only fills the fields if they are still empty, so a button Tom has
        // since set in the CMS is never overwritten.
        const isBlank = async (key) => {
          const { rows } = await db.query('SELECT content FROM content WHERE section_key = $1', [key]);
          return rows.length === 0 || !(rows[0].content || '').trim();
        };
        if (await isBlank(`${target}.button_text`)) {
          for (const [key, value] of [
            [`${target}.button_text`, 'See the Commercial Review'],
            [`${target}.button_link`, 'where-to-start/commercial-review']
          ]) {
            await db.query(
              `INSERT INTO content (section_key, content) VALUES ($1, $2)
               ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content`,
              [key, value]
            );
          }
          console.log(`What We Do: Commercial Review CTA added to ${target}.`);
        } else {
          console.log(`What We Do: ${target} already has a button, left unchanged.`);
        }
      } else {
        console.log('What We Do CTA skipped: target filter section not found.');
      }

      await db.query(
        'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
        [WWD_CTA_MARKER, 'true']
      );
    }
  }

  // Migration: What We Do presentation rebuild (16/08/2026), on Tom's approved
  // copy and structure. The previous pass fixed the sequence but left the page
  // reading as an essay: 44% of its mobile height was body text against 23% on
  // Websites and AI, it used only two background tones across six sections, and
  // the two prices sat in a two-column prose block where neither stood out.
  //
  // Final structure, chosen so the background alternates and the eye has
  // somewhere to stop:
  //   1 intervention  navy   short proposition
  //   2 fourcards     dark   four commercial questions, large gold numerals
  //   3 offerpair     mid    £500 / £2,500, purpose-built for this
  //   4 intervention  navy   six months, two lines
  //   5 insights      mid    Evidence, Useful Thinking, Websites and AI
  //
  // The filter and biography instances and the two bridge interventions are
  // dropped from the page order only. Their content stays in the content table
  // and shows up in the admin "Reuse existing" tab.
  {
    const WWD_PRESENTATION_MARKER = 'what-we-do.presentation_rebuild_2026-08-16';
    const { rows: mRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1', [WWD_PRESENTATION_MARKER]
    );
    const { rows: pRows } = await db.query(
      "SELECT section_order FROM pages WHERE slug = 'what-we-do'"
    );

    if (mRows.length === 0 && pRows.length > 0) {
      const order = Array.isArray(pRows[0].section_order) ? pRows[0].section_order : [];
      const baseOf = (id) => {
        const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(id || '');
        return m ? m[1] : null;
      };
      const plain = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

      const used = new Set();
      const { rows: allOrders } = await db.query('SELECT section_order FROM pages');
      for (const r of allOrders) {
        if (Array.isArray(r.section_order)) r.section_order.forEach((s) => used.add(s));
      }
      const { rows: prefixes } = await db.query(
        "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content"
      );
      prefixes.forEach((r) => used.add(r.instance_id));
      const allocate = (tpl) => {
        if (!used.has(tpl)) { used.add(tpl); return tpl; }
        for (let n = 2; n <= 99; n++) {
          const id = `${tpl}__${n}`;
          if (!used.has(id)) { used.add(id); return id; }
        }
        return null;
      };

      // Locate the two sections being kept and rewritten, by content rather
      // than by hardcoded instance ID.
      let openingId = null;
      let sixMonthsId = null;
      for (const id of order.filter((i) => baseOf(i) === 'intervention')) {
        const { rows } = await db.query(
          'SELECT content FROM content WHERE section_key = $1', [`${id}.heading`]
        );
        const h = plain(rows[0] && rows[0].content);
        if (!openingId && h === 'a proper commercial review of how the business really works.') openingId = id;
        if (!sixMonthsId && h === 'six months on.') sixMonthsId = id;
      }

      const questionsId = allocate('fourcards');
      const offersId = allocate('offerpair');
      const routesId = allocate('insights');

      if (!openingId || !sixMonthsId || !questionsId || !offersId || !routesId) {
        console.log('What We Do presentation rebuild skipped: could not resolve all sections.');
      } else {
        const set = async (key, value) => {
          await db.query(
            `INSERT INTO content (section_key, content) VALUES ($1, $2)
             ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content`,
            [key, value]
          );
        };
        const put = async (key, value) => {
          await db.query(
            'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
            [key, value]
          );
        };

        // 1. Opening. Heading unchanged; body cut to three short paragraphs.
        await set(`${openingId}.subtext`,
          'You know your business better than anyone. That is exactly why parts of it are hard to see from where you are standing.<br><br>'
          + 'We come in without the history. No assumptions about why something is done that way, and no habit of walking past it. What we bring is experience of running businesses, making commercial decisions and knowing where it is worth looking more closely.<br><br>'
          + 'Change one thing in a business and something else often moves. Understanding where that lands matters just as much as spotting the change in the first place.');
        await set(`${openingId}.button_text`, '');
        await set(`${openingId}.button_link`, '');

        // 2. The four commercial questions.
        await put(`${questionsId}.label`, 'THE REVIEW');
        await put(`${questionsId}.heading`, 'Four questions worth answering');
        await put(`${questionsId}.card_1_number`, '01');
        await put(`${questionsId}.card_1_title`, 'What are you too close to see?');
        await put(`${questionsId}.card_1_body`, 'Things that changed slowly, became familiar and stopped being questioned.');
        await put(`${questionsId}.card_2_number`, '02');
        await put(`${questionsId}.card_2_title`, 'Where is the business making and losing money?');
        await put(`${questionsId}.card_2_body`, 'The accounts are part of it. So is understanding what actually creates margin and where time and money are being absorbed.');
        await put(`${questionsId}.card_3_number`, '03');
        await put(`${questionsId}.card_3_title`, 'Where does everything still come back to you?');
        await put(`${questionsId}.card_3_body`, 'The decisions, knowledge and responsibilities that have gathered around the owner.');
        await put(`${questionsId}.card_4_number`, '04');
        await put(`${questionsId}.card_4_title`, 'Where is there more potential?');
        await put(`${questionsId}.card_4_body`, 'Opportunities, capacity or improvements that are difficult to see while you are running the business day to day.');
        for (let n = 1; n <= 4; n++) await put(`${questionsId}.card_${n}_link`, '');

        // 3. The two offers.
        await put(`${offersId}.label`, 'HOW FAR WE GO');
        await put(`${offersId}.heading`, 'Two ways to work with us');
        await put(`${offersId}.offer_1_price`, '£500');
        await put(`${offersId}.offer_1_name`, 'Commercial Review');
        await put(`${offersId}.offer_1_body`, 'We assess the business and give you our commercial view in a written report: what stood out, what we would prioritise and what we would do next.');
        await put(`${offersId}.offer_2_price`, '£2,500');
        await put(`${offersId}.offer_2_name`, 'Commercial Review and Implementation');
        await put(`${offersId}.offer_2_body`, 'The review, and then we stay involved to help put the agreed priorities into practice.');
        await put(`${offersId}.note`, 'The difference is scope and involvement. If you have already paid for the Commercial Review, that comes off the £2,500.');
        await put(`${offersId}.button_text`, 'See the Commercial Review');
        await put(`${offersId}.button_link`, 'where-to-start/commercial-review');

        // 4. Six months on, cut to two lines.
        await set(`${sixMonthsId}.subtext`,
          'Six months later, we come back to see what changed, what worked and what needs another look. The check-in is included with both options.');
        await set(`${sixMonthsId}.button_text`, '');
        await set(`${sixMonthsId}.button_link`, '');

        // 5. The three routes, collapsed from three near-identical sections
        //    into one scannable row. Evidence keeps first position, which is
        //    its extra prominence; no new treatment was invented for it.
        await put(`${routesId}.label`, 'WHERE TO GO NEXT');
        await put(`${routesId}.heading`, 'More on how we work');
        await put(`${routesId}.subtext`, '');
        await put(`${routesId}.card_1_tag`, 'EVIDENCE');
        await put(`${routesId}.card_1_title`, 'What we have done');
        await put(`${routesId}.card_1_body`, 'Real client work, redacted and published.');
        await put(`${routesId}.card_1_link`, 'evidence');
        await put(`${routesId}.card_2_tag`, 'USEFUL THINKING');
        await put(`${routesId}.card_2_title`, 'How we think');
        await put(`${routesId}.card_2_body`, 'Short pieces on judgement, growth and risk.');
        await put(`${routesId}.card_2_link`, 'useful-thinking');
        await put(`${routesId}.card_3_tag`, 'WEBSITES AND AI');
        await put(`${routesId}.card_3_title`, 'Building the practical things');
        await put(`${routesId}.card_3_body`, 'Once the commercial need is clear, we can build it.');
        await put(`${routesId}.card_3_link`, 'websites-and-ai');

        const newOrder = [openingId, questionsId, offersId, sixMonthsId, routesId];
        await db.query(
          "UPDATE pages SET section_order = $1::jsonb WHERE slug = 'what-we-do'",
          [JSON.stringify(newOrder)]
        );

        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [WWD_PRESENTATION_MARKER, 'true']
        );
        console.log(`What We Do presentation rebuild applied (${newOrder.join(' ')}).`);
      }
    }
  }

  // Migration: drop "proper" from the offer language, plus the approved What
  // We Do and global footer copy fixes (16/08/2026).
  //
  // "proper commercial review" was the Brand OS's designated offer language.
  // Tom has decided the offer should not lean on that word for credibility,
  // so it comes out of all nine places it appears. In every one of them the
  // sentence works with the single word deleted, so nothing is rewritten.
  //
  // Naming convention this settles: "Commercial Review" capitalised is the
  // named thing you buy (offer pages, the offerpair block); "commercial
  // review" lowercase describes the activity inside a sentence. The offer
  // pages already did the former, so this removes an inconsistency rather
  // than creating one. Ordinary uses of "properly" elsewhere are left alone:
  // they are plain English, not the offer name.
  //
  // Every edit is guarded on the stored value still containing the phrase it
  // expects, so a CMS edit made in the meantime always wins.
  {
    const PROPER_MARKER = 'site.offer_language_2026-08-16';
    const { rows: mRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1', [PROPER_MARKER]
    );

    if (mRows.length === 0) {
      const applied = [];
      // Replaces `find` with `next` in a stored value, only when `find` is
      // actually present. Never creates a key that does not exist.
      const swap = async (key, find, next, label) => {
        const { rows } = await db.query(
          'SELECT content FROM content WHERE section_key = $1', [key]
        );
        if (rows.length === 0) return false;
        const current = rows[0].content || '';
        if (!current.includes(find)) return false;
        await db.query(
          'UPDATE content SET content = $1 WHERE section_key = $2',
          [current.split(find).join(next), key]
        );
        applied.push(label);
        return true;
      };

      // 1. Every occurrence of the offer phrase, wherever it is stored. Done
      //    as a scan rather than a hardcoded key list so the Evidence, About
      //    Us, Useful Thinking and Business Consultant Devon instances are all
      //    caught without depending on their instance IDs.
      const { rows: properRows } = await db.query(
        "SELECT section_key FROM content WHERE content ILIKE '%proper commercial review%'"
      );
      let phraseCount = 0;
      for (const r of properRows) {
        if (await swap(r.section_key, 'proper commercial review', 'commercial review', r.section_key)) phraseCount++;
      }
      if (phraseCount) applied.push(`offer phrase removed from ${phraseCount} content rows`);

      // 2. Global footer: blank the label and drop the sentence that repeats
      //    the heading two lines below it. site-footer.ejs already renders
      //    nothing when the label is empty.
      const { rows: labelRows } = await db.query(
        "SELECT content FROM content WHERE section_key = 'contact.label'"
      );
      if (labelRows.length && (labelRows[0].content || '').trim()) {
        await db.query("UPDATE content SET content = '' WHERE section_key = 'contact.label'");
        applied.push('footer label cleared');
      }
      // Deliberately tolerant of whatever separates the duplicated sentence
      // from the next one (space, double space, <br>): remove the sentence
      // itself, then tidy the seam. An exact adjacent-sentence match would
      // fail silently if the stored value spaced it differently, and this
      // edit only gets one run.
      {
        const DUP = 'You tell us where the pressure is showing.';
        const { rows } = await db.query(
          "SELECT content FROM content WHERE section_key = 'contact.body'"
        );
        if (rows.length && (rows[0].content || '').includes(DUP)) {
          const cleaned = (rows[0].content || '')
            .split(DUP).join('')
            .replace(/\s{2,}/g, ' ')
            .replace(/(<br\s*\/?>)\s+/gi, '$1')
            .replace(/(<br\s*\/?>\s*)+\s*$/i, '')
            .trim();
          await db.query(
            "UPDATE content SET content = $1 WHERE section_key = 'contact.body'", [cleaned]
          );
          applied.push('footer duplicate sentence removed');
        } else {
          applied.push('footer duplicate sentence NOT FOUND');
        }
      }

      // 3. What We Do: the two question bodies that asserted a finding before
      //    the business has been looked at.
      const { rows: wwdRows } = await db.query(
        "SELECT section_order FROM pages WHERE slug = 'what-we-do'"
      );
      if (wwdRows.length) {
        const order = Array.isArray(wwdRows[0].section_order) ? wwdRows[0].section_order : [];
        const fourcardsId = order.find((id) => /^fourcards(?:__\d+)?$/.test(id));
        const offerpairId = order.find((id) => /^offerpair(?:__\d+)?$/.test(id));
        const plain = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

        if (fourcardsId) {
          await swap(`${fourcardsId}.card_2_body`,
            'where time and money are being absorbed',
            'where time and money go',
            'question 02 assumption removed');
          await swap(`${fourcardsId}.card_3_body`,
            'The decisions, knowledge and responsibilities that have gathered around the owner.',
            'Decisions, knowledge and responsibilities that tend to gather around the owner.',
            'question 03 assumption removed');
        }

        // 4. Six months on: the heading already carries the timeframe.
        for (const id of order.filter((i) => /^intervention(?:__\d+)?$/.test(i))) {
          const { rows } = await db.query(
            'SELECT content FROM content WHERE section_key = $1', [`${id}.heading`]
          );
          if (rows.length && plain(rows[0].content) === 'six months on.') {
            await swap(`${id}.subtext`,
              'Six months later, we come back to see',
              'We come back to see',
              'six months repetition removed');
            break;
          }
        }

        // 5. Both offers get their own route. The shared CTA is cleared so
        //    the £500 does not end up with two buttons to the £2,500's one.
        if (offerpairId) {
          for (const [key, value] of [
            [`${offerpairId}.offer_1_button_text`, 'See the Commercial Review'],
            [`${offerpairId}.offer_1_button_link`, 'where-to-start/commercial-review'],
            [`${offerpairId}.offer_2_button_text`, 'See review and implementation'],
            [`${offerpairId}.offer_2_button_link`, 'where-to-start/full-commercial-review'],
            [`${offerpairId}.button_text`, ''],
            [`${offerpairId}.button_link`, '']
          ]) {
            await db.query(
              `INSERT INTO content (section_key, content) VALUES ($1, $2)
               ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content`,
              [key, value]
            );
          }
          applied.push('per-offer routes added');
        }
      }

      await db.query(
        'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
        [PROPER_MARKER, 'true']
      );
      console.log(`Offer language + copy fixes applied (${applied.length ? applied.join('; ') : 'nothing matched'}).`);
    }
  }

  // Migration: What We Do visual pass (16/08/2026). Approved presentation
  // work only. No approved copy is rewritten: the opening paragraphs are
  // moved between fields verbatim, and every other string already on the page
  // is left exactly as it is.
  //
  //   - the opening intervention becomes a heromontage, so the page can carry
  //     the four real document previews already published on Evidence. Those
  //     are genuine redacted client deliverables; nothing is fabricated.
  //   - Evidence and Websites and AI cards gain real artwork. Useful Thinking
  //     is deliberately left without an image: only one of the twelve articles
  //     has artwork, and a card is better with no image than with a borrowed
  //     one. The field is optional and renders nothing when empty.
  {
    const WWD_VISUAL_MARKER = 'what-we-do.visual_pass_2026-08-16';
    const { rows: mRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1', [WWD_VISUAL_MARKER]
    );
    const { rows: pRows } = await db.query(
      "SELECT section_order FROM pages WHERE slug = 'what-we-do'"
    );

    if (mRows.length === 0 && pRows.length > 0) {
      const order = Array.isArray(pRows[0].section_order) ? pRows[0].section_order : [];
      const plain = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      const applied = [];

      const used = new Set();
      const { rows: allOrders } = await db.query('SELECT section_order FROM pages');
      for (const r of allOrders) {
        if (Array.isArray(r.section_order)) r.section_order.forEach((s) => used.add(s));
      }
      const { rows: prefixes } = await db.query(
        "SELECT DISTINCT split_part(section_key, '.', 1) AS instance_id FROM content"
      );
      prefixes.forEach((r) => used.add(r.instance_id));
      const allocate = (tpl) => {
        if (!used.has(tpl)) { used.add(tpl); return tpl; }
        for (let n = 2; n <= 99; n++) {
          const id = `${tpl}__${n}`;
          if (!used.has(id)) { used.add(id); return id; }
        }
        return null;
      };

      const put = async (key, value) => {
        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [key, value]
        );
      };

      // Find the opening intervention by its approved heading.
      let openingId = null;
      for (const id of order.filter((i) => /^intervention(?:__\d+)?$/.test(i))) {
        const { rows } = await db.query(
          'SELECT content FROM content WHERE section_key = $1', [`${id}.heading`]
        );
        if (rows.length && plain(rows[0].content) === 'a commercial review of how the business really works.') {
          openingId = id; break;
        }
      }

      const montageId = allocate('heromontage');

      if (openingId && montageId) {
        const { rows: hRows } = await db.query(
          'SELECT content FROM content WHERE section_key = $1', [`${openingId}.heading`]
        );
        const { rows: sRows } = await db.query(
          'SELECT content FROM content WHERE section_key = $1', [`${openingId}.subtext`]
        );
        const heading = (hRows[0] && hRows[0].content) || '';
        const subtext = (sRows[0] && sRows[0].content) || '';

        // Split the approved copy on its existing paragraph breaks. First
        // paragraph leads, the rest sits below the montage. Nothing rewritten.
        const paras = subtext.split(/<br\s*\/?>\s*<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean);
        const intro = paras.shift() || '';
        const body = paras.join('<br><br>');

        await put(`${montageId}.heading`, heading);
        await put(`${montageId}.intro`, intro);
        await put(`${montageId}.body`, body);
        await put(`${montageId}.image_1`, '/img/docs/half-time-team-talk.jpg');
        await put(`${montageId}.image_2`, '/img/docs/90-day-action-plan.jpg');
        await put(`${montageId}.image_3`, '/img/docs/the-mind-that-built-the-business.jpg');
        await put(`${montageId}.image_4`, '/img/docs/enactment-sheet.jpg');

        const newOrder = order.map((id) => (id === openingId ? montageId : id));
        await db.query(
          "UPDATE pages SET section_order = $1::jsonb WHERE slug = 'what-we-do'",
          [JSON.stringify(newOrder)]
        );
        applied.push(`opening became ${montageId}`);
      }

      // Card artwork, real assets only.
      const routesId = order.find((id) => /^insights(?:__\d+)?$/.test(id));
      if (routesId) {
        const setIf = async (key, value) => {
          const { rows } = await db.query('SELECT content FROM content WHERE section_key = $1', [key]);
          if (rows.length && (rows[0].content || '').trim()) return;
          await db.query(
            `INSERT INTO content (section_key, content) VALUES ($1, $2)
             ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content`,
            [key, value]
          );
        };
        await setIf(`${routesId}.card_1_image`, '/img/docs/half-time-team-talk.jpg');
        await setIf(`${routesId}.card_2_image`, '');
        await setIf(`${routesId}.card_3_image`, '/img/wsa/wsa-homepage.jpg');
        applied.push('card artwork added (Useful Thinking deliberately left without)');
      }

      await db.query(
        'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
        [WWD_VISUAL_MARKER, 'true']
      );
      console.log(`What We Do visual pass applied (${applied.length ? applied.join('; ') : 'nothing matched'}).`);
    }
  }

  // Migration: What We Do finishing pass (16/08/2026).
  //
  // The mobile opening stayed too tall after the montage pass; that is a CSS
  // fix in views/index.ejs, not stored content. The one content change here is
  // the Useful Thinking card: the live row now uses the genuine existing
  // article artwork already published for "A Profitable Job Is Not Necessarily
  // Good Business", specifically the landscape social/share image that fits the
  // insights card's 16:9 slot better than the portrait in-page header image.
  //
  // Guarded so a CMS edit always wins: only writes when the card still points
  // at /useful-thinking and its image field is blank.
  {
    const WWD_FINISHING_MARKER = 'what-we-do.finishing_pass_2026-08-16';
    const { rows: mRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1', [WWD_FINISHING_MARKER]
    );

    if (mRows.length === 0) {
      let shouldMark = false;
      const { rows: wwdRows } = await db.query(
        "SELECT section_order FROM pages WHERE slug = 'what-we-do'"
      );
      if (wwdRows.length) {
        const order = Array.isArray(wwdRows[0].section_order) ? wwdRows[0].section_order : [];
        const routesId = order.find((id) => /^insights(?:__\d+)?$/.test(id));
        if (routesId) {
          shouldMark = true;
          const imageKey = `${routesId}.card_2_image`;
          const linkKey = `${routesId}.card_2_link`;
          const { rows: imageRows } = await db.query(
            'SELECT content FROM content WHERE section_key = $1', [imageKey]
          );
          const { rows: linkRows } = await db.query(
            'SELECT content FROM content WHERE section_key = $1', [linkKey]
          );
          const currentImage = (imageRows[0] && imageRows[0].content) || '';
          const currentLink = (linkRows[0] && linkRows[0].content) || '';
          if (!currentImage.trim() && currentLink.trim() === 'useful-thinking') {
            await db.query(
              `INSERT INTO content (section_key, content) VALUES ($1, $2)
               ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content`,
              [imageKey, '/img/useful-thinking/a-profitable-job-og.jpg']
            );
            console.log('What We Do finishing pass applied (Useful Thinking card artwork added).');
          } else {
            console.log('What We Do finishing pass skipped content write (card already customised).');
          }
        }
      }
      if (shouldMark) {
        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [WWD_FINISHING_MARKER, 'true']
        );
      }
    }
  }

  // Migration: What We Do meta description (16/08/2026).
  //
  // The stored description still opened "A proper commercial review", which
  // is the wording the Brand Operating System has since dropped in favour of
  // plain "Commercial Review". Metadata only: no page copy, no template and
  // no other SEO field changes.
  //
  // og:description and twitter:description both render from seo.ogDescription
  // in server.js, which falls back to the meta description when the page's
  // og_description is blank. So this writes the one field and blanks
  // og_description if it is still carrying the old wording, which leaves all
  // three tags resolving from a single source.
  //
  // Guarded twice so a later CMS edit always wins: a run-once marker, and a
  // value check that only rewrites while the rejected phrase is still there.
  {
    const WWD_SEO_MARKER = 'what-we-do.seo_description_2026-08-16';
    const NEW_DESC = 'A commercial review for owner run businesses in Devon and Cornwall. '
      + 'An experienced outside view of what matters, what to prioritise and what to do next.';

    const { rows: markerRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1', [WWD_SEO_MARKER]
    );

    if (markerRows.length === 0) {
      const { rows: pageRows } = await db.query(
        "SELECT meta_description, og_description FROM pages WHERE slug = 'what-we-do'"
      );

      if (pageRows.length) {
        const stale = (v) => /proper\s+commercial\s+review/i.test((v || '').trim());
        const currentMeta = pageRows[0].meta_description;
        const currentOg = pageRows[0].og_description;

        if (stale(currentMeta)) {
          await db.query(
            "UPDATE pages SET meta_description = $1 WHERE slug = 'what-we-do'", [NEW_DESC]
          );
          console.log('What We Do meta description updated.');
        } else {
          console.log('What We Do meta description skipped (already edited).');
        }

        if (stale(currentOg)) {
          await db.query(
            "UPDATE pages SET og_description = '' WHERE slug = 'what-we-do'"
          );
          console.log('What We Do og_description cleared so it resolves from the meta description.');
        }

        await db.query(
          'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
          [WWD_SEO_MARKER, 'true']
        );
      }
    }
  }

  // Migration: What We Do review section reframed (16/08/2026).
  //
  // The section was "Four questions worth answering", numbered 01-04. The
  // copy was reasonably hedged but the numerals were not: a numbered set
  // reads as a sequence, so four things that happen to get looked at read as
  // a fixed four-step method. There is no fixed method, so the numbers go and
  // the cards are reframed as what gets listened to rather than what gets
  // answered. The fourth card is deliberately open-ended so the set cannot be
  // read as a complete list.
  //
  // Blanking card_N_number is what removes the numerals; views/index.ejs
  // skips the whole card header when a card has no number.
  //
  // Guarded twice so a CMS edit always wins: a run-once marker, and a check
  // that the heading is still the one being replaced.
  {
    const WWD_REVIEW_MARKER = 'what-we-do.review_no_checklist_2026-08-16';
    const OLD_HEADING = 'Four questions worth answering';

    const { rows: markerRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1', [WWD_REVIEW_MARKER]
    );

    if (markerRows.length === 0) {
      const { rows: pageRows } = await db.query(
        "SELECT section_order FROM pages WHERE slug = 'what-we-do'"
      );

      if (pageRows.length) {
        const order = Array.isArray(pageRows[0].section_order) ? pageRows[0].section_order : [];
        const fcId = order.find((id) => /^fourcards(?:__\d+)?$/.test(id));

        if (fcId) {
          const { rows: headingRows } = await db.query(
            'SELECT content FROM content WHERE section_key = $1', [`${fcId}.heading`]
          );
          const currentHeading = ((headingRows[0] && headingRows[0].content) || '')
            .replace(/<[^>]+>/g, '').trim();

          if (currentHeading === OLD_HEADING) {
            const values = {
              'heading': 'There is no checklist',
              'evidence_intro': 'What we look at depends on the business and what you want from it. '
                + 'Nobody sees everything in their own business. We don’t pretend we would either.'
                + '<br><br>What we bring is twenty years of experience, instinct and a fresh pair of eyes.',
              'card_1_number': '',
              'card_1_title': 'The owner',
              'card_1_body': 'What you want from the business matters. More profit, less pressure or '
                + 'more time can take us in completely different directions.',
              'card_2_number': '',
              'card_2_title': 'The people',
              'card_2_body': 'We listen to the people around the business. They see it from a '
                + 'different angle again.',
              'card_3_number': '',
              'card_3_title': 'The numbers',
              'card_3_body': 'Accounts, costs, margins, price and demand can all tell us something. '
                + 'What matters depends on what we find.',
              'card_4_number': '',
              'card_4_title': 'And everything else',
              'card_4_body': 'Customers, reviews, the website, the office, a comment in passing. '
                + 'We have seen enough situations to know when something deserves a closer look.'
            };

            for (const [suffix, value] of Object.entries(values)) {
              await db.query(
                `INSERT INTO content (section_key, content) VALUES ($1, $2)
                 ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content`,
                [`${fcId}.${suffix}`, value]
              );
            }
            console.log(`What We Do review section reframed (${fcId}).`);
          } else {
            console.log('What We Do review section skipped (already edited).');
          }

          await db.query(
            'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
            [WWD_REVIEW_MARKER, 'true']
          );
        }
      }
    }
  }

  // Migration: What We Do review intro, second paragraph (16/08/2026).
  //
  // "What we bring is twenty years of experience..." repeated the hero's
  // construction almost exactly, which opens "What we bring is experience of
  // running businesses...". Drops the three-word lead-in only. Copy change,
  // nothing else.
  //
  // Guarded twice, as before: a run-once marker, and a check that the old
  // lead-in is still there, so a CMS edit wins.
  {
    const WWD_INTRO_MARKER = 'what-we-do.review_intro_lead_2026-08-16';
    const OLD_LEAD = 'What we bring is twenty years of experience';
    const NEW_INTRO = 'What we look at depends on the business and what you want from it. '
      + 'Nobody sees everything in their own business. We don’t pretend we would either.'
      + '<br><br>Twenty years of experience, instinct and a fresh pair of eyes.';

    const { rows: markerRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1', [WWD_INTRO_MARKER]
    );

    if (markerRows.length === 0) {
      const { rows: pageRows } = await db.query(
        "SELECT section_order FROM pages WHERE slug = 'what-we-do'"
      );

      if (pageRows.length) {
        const order = Array.isArray(pageRows[0].section_order) ? pageRows[0].section_order : [];
        const fcId = order.find((id) => /^fourcards(?:__\d+)?$/.test(id));

        if (fcId) {
          const key = `${fcId}.evidence_intro`;
          const { rows: introRows } = await db.query(
            'SELECT content FROM content WHERE section_key = $1', [key]
          );
          const current = (introRows[0] && introRows[0].content) || '';

          if (current.includes(OLD_LEAD)) {
            await db.query(
              `INSERT INTO content (section_key, content) VALUES ($1, $2)
               ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content`,
              [key, NEW_INTRO]
            );
            console.log('What We Do review intro lead-in dropped.');
          } else {
            console.log('What We Do review intro skipped (already edited).');
          }

          await db.query(
            'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
            [WWD_INTRO_MARKER, 'true']
          );
        }
      }
    }
  }

  // Migration: What We Do review intro, drop trailing sentence (22/08/2026).
  //
  // Desktop QC: remove "Twenty years of experience, instinct and a fresh
  // pair of eyes." from the "There is no checklist" section. The sentence
  // simply drops; the paragraph closes on the sentence before it rather
  // than being reworded.
  //
  // Guarded twice, as before: a run-once marker, and a check that the
  // sentence being removed is still there, so a CMS edit wins.
  {
    const WWD_INTRO_TRIM_MARKER = 'what-we-do.review_intro_trim_2026-08-22';
    const OLD_INTRO = 'What we look at depends on the business and what you want from it. '
      + 'Nobody sees everything in their own business. We don’t pretend we would either.'
      + '<br><br>Twenty years of experience, instinct and a fresh pair of eyes.';
    const NEW_INTRO = 'What we look at depends on the business and what you want from it. '
      + 'Nobody sees everything in their own business. We don’t pretend we would either.';

    const { rows: markerRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1', [WWD_INTRO_TRIM_MARKER]
    );

    if (markerRows.length === 0) {
      const { rows: pageRows } = await db.query(
        "SELECT section_order FROM pages WHERE slug = 'what-we-do'"
      );

      if (pageRows.length) {
        const order = Array.isArray(pageRows[0].section_order) ? pageRows[0].section_order : [];
        const fcId = order.find((id) => /^fourcards(?:__\d+)?$/.test(id));

        if (fcId) {
          const key = `${fcId}.evidence_intro`;
          const { rowCount } = await db.query(
            `UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3`,
            [NEW_INTRO, key, OLD_INTRO]
          );
          console.log(`What We Do review intro trailing-sentence trim: ${rowCount} row(s) updated.`);

          await db.query(
            'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
            [WWD_INTRO_TRIM_MARKER, 'true']
          );
        }
      }
    }
  }

  // Migration: homepage hero heading copy tweak (18/08/2026). Tom's exact
  // wording change, scoped to hero.heading only. Guarded with an atomic
  // UPDATE ... WHERE content = <old value>, matched against the precise
  // stored value (including its <strong>/<br /> markup and embedded
  // newline — confirmed against handover/live-content-export-2026-07-21.sql
  // rather than assumed from the plain-text reading of it), not a
  // normalised/plain-text version — so a later CMS edit to this field is
  // never silently overwritten: if the current value doesn't match this
  // exact string, the UPDATE affects 0 rows and this is a no-op, same as
  // the image-hash-guarded swaps above.
  {
    const oldHeroHeading = '<strong>You’ve built something you’re proud of.</strong><br />\nSo why does it still feel like everything runs through you?';
    const newHeroHeading = '<strong>You’ve built something you’re proud of.</strong><br />\nWhy does everything still run through you?';
    const { rowCount } = await db.query(
      `UPDATE content SET content = $1 WHERE section_key = 'hero.heading' AND content = $2`,
      [newHeroHeading, oldHeroHeading]
    );
    console.log(`Homepage hero heading migration: ${rowCount} row(s) updated.`);
  }

  // Migration: homepage hero heading final wording (18/08/2026).
  //
  // Restores Tom's approved conversational "So" after the earlier scoped edit
  // removed it. Guarded against the exact current production value only, so a
  // later CMS edit wins and this never broadens into a fuzzy heading rewrite.
  {
    const oldHeroHeading = '<strong>You’ve built something you’re proud of.</strong><br />\nWhy does everything still run through you?';
    const newHeroHeading = '<strong>You’ve built something you’re proud of.</strong><br />\nSo why does everything still run through you?';
    const { rowCount } = await db.query(
      `UPDATE content SET content = $1 WHERE section_key = 'hero.heading' AND content = $2`,
      [newHeroHeading, oldHeroHeading]
    );
    console.log(`Homepage hero final wording migration: ${rowCount} row(s) updated.`);
  }

  // Migration: SEO metadata pass from the 18/08/2026 read-only assessment.
  //
  // Metadata only: no visible page copy, no offer architecture and no title
  // change to the homepage's Business Consultancy Devon & Cornwall positioning.
  // Each field changes only while it still contains the exact inspected live
  // value, so CMS edits made after this deployment are left alone.
  {
    const seoMetadataFixes = [
      {
        slug: 'main',
        oldMetaDescription: 'Business consultancy for owner run businesses across Devon and Cornwall. We help owners reduce dependency, improve visibility and build stronger businesses.',
        newMetaDescription: 'Business consultancy for established owner run businesses across Devon and Cornwall. Outside perspective on decisions, structure and what deserves attention next.'
      },
      {
        slug: 'websites-and-ai',
        oldMetaTitle: 'A Business Website Built Around How You Work | Arrington Consultancy',
        newMetaTitle: 'Website Build for Owner Run Businesses | Arrington Consultancy',
        oldMetaDescription: 'A £999 business website built around the way your business actually operates. See the World Student Advisors site built for the same fixed price.',
        newMetaDescription: 'A fixed £999 business website built around the way your business actually operates, with real World Student Advisors proof.'
      },
      {
        slug: 'evidence',
        oldMetaTitle: 'Evidence | Arrington Consultancy',
        newMetaTitle: 'Business Consultancy Case Studies | Arrington Consultancy',
        oldMetaDescription: 'Arrington Consultancy helps owner run businesses across Devon and Cornwall improve structure, control, margin and owner independence through a commercial review.',
        newMetaDescription: 'Real Arrington Consultancy evidence from owner run businesses: turnaround work, margin recovery and Google reviews from business owners.'
      },
      {
        slug: 'book-a-30-minute-conversation',
        oldMetaDescription: 'Book a straightforward 30 minute conversation with Arrington Consultancy to talk through what is happening in your business and whether a proper commercial review would help.',
        newMetaDescription: 'Book a straightforward 30 minute conversation with Arrington Consultancy to talk through what is happening in your business and whether we can help.'
      }
    ];

    let metadataRowsTouched = 0;
    for (const fix of seoMetadataFixes) {
      const params = [
        fix.slug,
        fix.oldMetaTitle || null,
        fix.newMetaTitle || null,
        fix.oldMetaDescription,
        fix.newMetaDescription
      ];
      const { rowCount } = await db.query(
        `UPDATE pages
         SET meta_title = CASE
               WHEN $2::text IS NOT NULL AND meta_title = $2 THEN $3
               ELSE meta_title
             END,
             meta_description = CASE
               WHEN meta_description = $4 THEN $5
               ELSE meta_description
             END,
             og_title = CASE
               WHEN $2::text IS NOT NULL AND og_title = $2 THEN $3
               ELSE og_title
             END,
             og_description = CASE
               WHEN og_description = $4 THEN $5
               ELSE og_description
             END
         WHERE slug = $1
           AND (
             ($2::text IS NOT NULL AND (meta_title = $2 OR og_title = $2))
             OR meta_description = $4
             OR og_description = $4
           )`,
        params
      );
      metadataRowsTouched += rowCount;
    }
    console.log(`SEO metadata pass: ${metadataRowsTouched} page row(s) updated.`);
  }

  // Migration: selective Useful Thinking related links.
  //
  // Uses the article template's existing single "Related" slot only, and only
  // fills empty slots. Existing article relationships and any CMS edits stay in
  // place. These are editorial links a human reader can follow naturally from
  // the story, not body rewrites or link-count padding.
  {
    const usefulThinkingRelatedLinks = [
      ['article__4', 'What We Do', '/what-we-do'],
      ['article__6', 'Evidence', '/evidence'],
      ['article__7', 'What We Do', '/what-we-do'],
      ['article__8', 'Owner Dependency Quiz', '/owner-dependency-quiz'],
      ['article__11', 'Commercial Gaps Review', '/commercial-gaps-review'],
      ['article__12', 'Market Ready Test', '/market-ready-test'],
      ['article__13', 'Market Ready Test', '/market-ready-test']
    ];

    let relatedRowsTouched = 0;
    for (const [instanceId, relatedText, relatedLink] of usefulThinkingRelatedLinks) {
      const { rowCount: textRows } = await db.query(
        'UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3',
        [relatedText, `${instanceId}.related_text`, '']
      );
      const { rowCount: linkRows } = await db.query(
        'UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3',
        [relatedLink, `${instanceId}.related_link`, '']
      );
      relatedRowsTouched += textRows + linkRows;
    }
    console.log(`Useful Thinking related links: ${relatedRowsTouched} content row(s) updated.`);
  }

  // Migration: Evidence page metadata explicit fallback (18/08/2026).
  //
  // The Evidence page was originally assembled from three older CMS pages and
  // can have blank meta fields in some databases, leaving the renderer to fall
  // back to a computed "Evidence | Arrington Consultancy" title and historical
  // description. This sets explicit metadata only for that page and only while
  // the fields are still blank or carrying the exact inspected old wording.
  {
    const oldEvidenceTitle = 'Evidence | Arrington Consultancy';
    const newEvidenceTitle = 'Business Consultancy Case Studies | Arrington Consultancy';
    const oldEvidenceDescription = 'Arrington Consultancy helps owner run businesses across Devon and Cornwall improve structure, control, margin and owner independence through a commercial review.';
    const newEvidenceDescription = 'Real Arrington Consultancy evidence from owner run businesses: turnaround work, margin recovery and Google reviews from business owners.';
    const { rowCount } = await db.query(
      `UPDATE pages
       SET meta_title = CASE
             WHEN meta_title = '' OR meta_title = $1 THEN $2
             ELSE meta_title
           END,
           meta_description = CASE
             WHEN meta_description = '' OR meta_description = $3 THEN $4
             ELSE meta_description
           END,
           og_title = CASE
             WHEN og_title = '' OR og_title = $1 THEN $2
             ELSE og_title
           END,
           og_description = CASE
             WHEN og_description = '' OR og_description = $3 THEN $4
             ELSE og_description
           END
       WHERE slug = 'evidence'
         AND (
           meta_title = '' OR meta_title = $1
           OR meta_description = '' OR meta_description = $3
           OR og_title = '' OR og_title = $1
           OR og_description = '' OR og_description = $3
         )`,
      [oldEvidenceTitle, newEvidenceTitle, oldEvidenceDescription, newEvidenceDescription]
    );
    console.log(`Evidence metadata explicit fallback: ${rowCount} row(s) updated.`);
  }

  // Migration: homepage hero credibility line — add "reviews" to the Google
  // rating fact (22/08/2026). Tom flagged that the bare "5.0 on Google" is
  // ambiguous next to the other two facts on this line (no stars, no word
  // telling the reader what 5.0 is out of), unlike the site's other real
  // Google-rating display further down the same page which reads "5.0 from
  // 5 reviews on Google". Scoped to this one field only, adding the single
  // word "reviews" — no stars/badges/icons added, keeping the "restrained,
  // no award-strip" brief from the 15/08/2026 migration that introduced this
  // line. Deliberately left as a static string, not wired to the live
  // Google Places fetch used elsewhere on the page — Tom confirmed no need
  // for that. Guarded with an atomic UPDATE ... WHERE content = <old value>,
  // matched against the exact string that migration inserted, so a later
  // CMS edit to this field is never silently overwritten: if the current
  // value doesn't match, this affects 0 rows and is a no-op.
  {
    const oldProofLine = 'Two decades building, buying and selling businesses · Oxford Saïd, Distinction · 5.0 on Google';
    const newProofLine = 'Two decades building, buying and selling businesses · Oxford Saïd, Distinction · 5.0 on Google reviews';
    const { rowCount } = await db.query(
      `UPDATE content SET content = $1 WHERE section_key = 'hero.proof_line' AND content = $2`,
      [newProofLine, oldProofLine]
    );
    console.log(`Homepage hero proof line migration: ${rowCount} row(s) updated.`);
  }

  // Migration: restore Useful Thinking to the main nav (22/08/2026). The
  // approved site refinement brief's Section 9 lists the principal nav
  // routes explicitly as "What We Do, Evidence, Useful Thinking, Owner
  // Check, Websites and AI, About Us, Product Guide" — naming Useful
  // Thinking plainly alongside the other top-level items, with no
  // qualification. It had been show_in_nav = false since the 30/07/2026
  // Evidence merge (discoverable only via contextual links). This flips it
  // back to true exactly once, marker-guarded so a later deliberate
  // decision to hide it again via the admin panel is never re-overwritten
  // by a future boot.
  {
    const UT_NAV_MARKER = 'nav.useful_thinking_restored_2026-08-22';
    const { rows: utNavMarkerRows } = await db.query(
      'SELECT 1 FROM content WHERE section_key = $1',
      [UT_NAV_MARKER]
    );
    if (utNavMarkerRows.length === 0) {
      const { rowCount } = await db.query(
        `UPDATE pages SET show_in_nav = true WHERE slug = 'useful-thinking' AND show_in_nav = false`
      );
      await db.query(
        'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
        [UT_NAV_MARKER, 'true']
      );
      console.log(`Useful Thinking nav restore: ${rowCount} page row(s) updated.`);
    }
  }

  // Migration: buyer-language standfirst test (23/08/2026). Tom approved a
  // narrow, controlled AI-recommendation-visibility test (see the AI
  // Recommendation Visibility worker handoff in Drive, "23 AUGUST 2026 —
  // APPROVED BUYER-LANGUAGE STANDFIRST TEST"): add one plain-English
  // standfirst line directly beneath the title of selected existing Useful
  // Thinking articles, restating the buyer's problem in natural language,
  // without touching the title, body, story or conclusion.
  //
  // A third approved article, "The Reverse Economy of Scale", is
  // deliberately NOT seeded here. It is still a held, unpublished instance
  // (article__5 — see lib/usefulThinkingArticles.js's explicit hold note),
  // with no page row and no live route, so there is nothing to add a
  // standfirst beneath yet. Seed it once Tom separately approves publishing
  // that article.
  //
  // New content keys only, so ON CONFLICT DO NOTHING is sufficient — no
  // exact-old-value guard needed (unlike an in-place text edit), and a
  // later CMS edit to either field is never overwritten by a future boot.
  {
    const standfirsts = [
      ['article__9.standfirst', 'When everything about how the business works is still in your head, the business still depends on you.'],
      ['article__2.standfirst', 'If customers and staff can reach you whenever they want, the business has not really learnt to operate without you.']
    ];
    for (const [key, value] of standfirsts) {
      await db.query(
        'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
        [key, value]
      );
    }
    console.log('Buyer-language standfirst test: 2 article standfirst(s) seeded (article__9, article__2).');
  }

  // Scott AI Demonstration — access-grant anchor + fictional dataset
  // (28/08/2026). See lib/scott/access.js for why this page row exists: it
  // is never rendered as a real page (the Scott routes are registered ahead
  // of the generic /:slug catch-all and never fall through to it), it only
  // exists so the site's EXISTING page_access table/admin UI can gate
  // invited demo viewers, exactly like every other restricted page. hidden,
  // not in nav, noindex and an empty section_order all reinforce that this
  // row is never meant to render — belt-and-braces alongside the routing
  // order, not a substitute for it.
  {
    const { rowCount } = await db.query(
      `INSERT INTO pages (slug, title, sort_order, hidden, show_in_nav, noindex, section_order)
       VALUES ($1, 'Scott AI Demonstration (private)', 9999, true, false, true, '[]'::jsonb)
       ON CONFLICT (slug) DO NOTHING`,
      [SCOTT_PAGE_SLUG]
    );
    if (rowCount > 0) console.log('Scott AI Demonstration: access-grant page row created.');
  }
  {
    const result = await seedScottData(db);
    console.log(result.seeded ? 'Scott AI Demonstration: fictional dataset seeded.' : 'Scott AI Demonstration: fictional dataset already present, skipped.');
  }

  // Scott AI Demonstration — grant Will's account access (01/09/2026).
  // Production evidence (Railway access logs, 00:52-00:53 UTC) showed a
  // real, valid login for 'will' hitting the "valid login, not invited"
  // branch of POST /scott/login, then GET /scott 404ing per
  // lib/scott/access.js's documented "logged in but not granted"
  // behaviour. Tom confirmed the account and asked for it to be granted
  // through the site's existing page_access mechanism — the same one the
  // admin panel's Page access control uses (routes/admin.js PUT
  // /page-access/:pageId) — so this performs the identical grant (one
  // additive page_access row, never a delete-and-reinsert of the whole
  // page's access list, so no other grantee is touched) and writes the
  // matching audit_log entry in the same shape that route writes.
  // Idempotent: the existing page_access row is itself the guard.
  {
    const { rows: pageRows } = await db.query('SELECT id, slug FROM pages WHERE slug = $1', [SCOTT_PAGE_SLUG]);
    const { rows: willRows } = await db.query(`SELECT id FROM users WHERE username = 'will'`);
    if (pageRows.length && willRows.length) {
      const pageId = pageRows[0].id;
      const willId = willRows[0].id;
      const { rows: existing } = await db.query(
        'SELECT 1 FROM page_access WHERE page_id = $1 AND user_id = $2',
        [pageId, willId]
      );
      if (existing.length === 0) {
        await db.query(
          'INSERT INTO page_access (page_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [pageId, willId]
        );
        const { rows: tomRows } = await db.query(`SELECT id FROM users WHERE username = 'tom'`);
        const actorId = tomRows.length ? tomRows[0].id : willId;
        await db.query(
          'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
          [actorId, 'page_access_update', pageRows[0].slug, `Page access granted to 'will' for "${pageRows[0].slug}", requested by Tom Arrington, applied via seed migration (01/09/2026).`]
        );
        console.log("Scott AI Demonstration: page access granted to 'will'.");
      } else {
        console.log("Scott AI Demonstration: 'will' already has page access, skipping.");
      }
    } else {
      console.log("Scott AI Demonstration: page-access grant for 'will' skipped (page or user not found yet).");
    }
  }

  // Scott AI Demonstration — lead capture columns (28/08/2026). Adds the
  // public lead-form intake path: customer_email on scott_enquiries, and
  // the 'superseded' writeback status (used by "Redraft" — the old draft is
  // superseded, not rejected, when a human asks the team to try again) plus
  // edited_by_human (set when a "Modify" edit is saved before approval).
  // No-op on a brand new database, since CREATE TABLE already includes
  // these — only matters for a database that had the Scott tables from
  // before this migration existed.
  {
    await db.query(`ALTER TABLE scott_enquiries ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255) NOT NULL DEFAULT ''`);
    await db.query(`ALTER TABLE scott_writebacks ADD COLUMN IF NOT EXISTS edited_by_human BOOLEAN NOT NULL DEFAULT false`);
    await db.query(`ALTER TABLE scott_writebacks DROP CONSTRAINT IF EXISTS scott_writebacks_status_check`);
    await db.query(`ALTER TABLE scott_writebacks ADD CONSTRAINT scott_writebacks_status_check CHECK (status IN ('auto_applied', 'pending_approval', 'approved', 'rejected', 'superseded'))`);
    await db.query(`ALTER TABLE scott_conversations ALTER COLUMN user_id DROP NOT NULL`);
    console.log('Scott AI Demonstration: lead capture columns verified.');
  }

  // Scott AI Demonstration: fictional portal staff accounts.
  //
  // Eight genuine logins, one per fictional staff member in 07Q's
  // clearance model, each bound server-side to their own clearance. These
  // are demonstration accounts inside an already-access-controlled private
  // area, not real site accounts, and they hold no real data.
  //
  // Password source, in order: SCOTT_DEMO_STAFF_PASSWORD if set, otherwise
  // a per-deploy random value that is printed ONCE to the deploy log so
  // whoever set the service up can retrieve it. There is deliberately no
  // hardcoded default: a fixed password committed to a public-ish repo
  // would be a real credential leak even for fictional accounts, and the
  // Master Rulebook's own IT record (07Q) says demo passwords "belong in a
  // secure implementation secret/user-management route and must not be
  // placed in Drive, source code, prompts or screenshots."
  {
    await db.query(`CREATE TABLE IF NOT EXISTS scott_portal_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(60) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      persona_id VARCHAR(40) NOT NULL,
      display_name VARCHAR(120) NOT NULL,
      job_title VARCHAR(160) NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scott_portal_users_username ON scott_portal_users (username)`);

    const staff = [
      { username: 'scott.mercer', personaId: 'scott_mercer', displayName: 'Scott Mercer', jobTitle: 'Owner / Director (Clearance A)' },
      { username: 'tony.marsh', personaId: 'tony_marsh', displayName: 'Tony Marsh', jobTitle: 'Workshop & Operations Manager (Clearance B)' },
      { username: 'chloe.reed', personaId: 'chloe_reed', displayName: 'Chloe Reed', jobTitle: 'Office / Customer Admin (Clearance C)' },
      { username: 'leah.morgan', personaId: 'leah_morgan', displayName: 'Leah Morgan', jobTitle: 'Knitting Team Lead (Clearance D)' },
      { username: 'ellie.park', personaId: 'ellie_park', displayName: 'Ellie Park', jobTitle: 'Workshop / Skilled Operative (Clearance E)' },
      { username: 'ravi.singh', personaId: 'ravi_singh', displayName: 'Ravi Singh', jobTitle: 'Workshop / Field Operative (Clearance E)' },
      { username: 'jo.bell', personaId: 'jo_bell', displayName: 'Jo Bell', jobTitle: 'Knitting Operative (Clearance F)' },
      { username: 'mike.evans', personaId: 'mike_evans', displayName: 'Mike Evans', jobTitle: 'Driver / Field Logistics (Clearance G)' }
    ];

    const { rows: existingStaff } = await db.query('SELECT username FROM scott_portal_users');
    if (existingStaff.length < staff.length) {
      const supplied = process.env.SCOTT_DEMO_STAFF_PASSWORD;
      const staffPassword = supplied || crypto.randomBytes(9).toString('base64url');
      const hash = await bcrypt.hash(staffPassword, BCRYPT_ROUNDS);
      for (const s of staff) {
        await db.query(
          `INSERT INTO scott_portal_users (username, password_hash, persona_id, display_name, job_title)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING`,
          [s.username, hash, s.personaId, s.displayName, s.jobTitle]
        );
      }
      if (supplied) {
        console.log(`Scott AI Demonstration: ${staff.length} fictional staff logins seeded (password from SCOTT_DEMO_STAFF_PASSWORD).`);
      } else {
        console.log(`Scott AI Demonstration: ${staff.length} fictional staff logins seeded. Shared demo password for all eight: ${staffPassword}`);
        console.log('Scott AI Demonstration: set SCOTT_DEMO_STAFF_PASSWORD to control this instead of a generated one.');
      }
    } else if (process.env.RESET_SCOTT_STAFF_PASSWORDS === 'true') {
      // Escape hatch for the case that actually happened on staging: the
      // eight rows were seeded by an earlier deploy with a random
      // password, so a later SCOTT_DEMO_STAFF_PASSWORD was ignored by the
      // insert path above and nobody could sign in as any of them. Same
      // shape as RESET_USER_PASSWORDS: an UPDATE in place, never a DELETE,
      // so no foreign key is involved and no row identity changes.
      //
      // Requires the exact string 'true' AND a password to set, so a
      // stray or copied variable cannot trigger it, and it refuses loudly
      // rather than silently doing nothing if the password is missing.
      const supplied = process.env.SCOTT_DEMO_STAFF_PASSWORD;
      if (!supplied) {
        console.warn('RESET_SCOTT_STAFF_PASSWORDS=true but SCOTT_DEMO_STAFF_PASSWORD is not set, so there is nothing to reset the passwords to. No change made.');
      } else {
        const hash = await bcrypt.hash(supplied, BCRYPT_ROUNDS);
        const { rowCount } = await db.query('UPDATE scott_portal_users SET password_hash = $1', [hash]);
        console.log(`RESET_SCOTT_STAFF_PASSWORDS=true: ${rowCount} fictional staff password(s) reset from SCOTT_DEMO_STAFF_PASSWORD.`);
        console.log('Scott AI Demonstration: remove RESET_SCOTT_STAFF_PASSWORDS once you have signed in successfully.');
      }
    } else {
      console.log('Scott AI Demonstration: fictional staff logins already present, skipping.');
    }
  }

  // Em dashes are banned in anything user-visible across this project, and
  // the ban applies to rows already sitting in a database, not only to the
  // source that writes new ones. One seeded activity summary carried one
  // before the source was corrected, and it kept rendering on the Activity
  // page afterwards because nothing rewrites an existing row.
  //
  // The rewrite is done in JS rather than in a SQL regex on purpose. The
  // first version passed the pattern through a JS template literal, where
  // \s silently degrades to a literal "s" and \u2014 is converted to the
  // dash itself before Postgres ever sees the string. It appeared to work
  // (the dash did go) while actually matching nothing it was meant to,
  // leaving "seeded ,  v0.1". Two layers of escaping in one line is not
  // worth the cleverness for a handful of rows.
  //
  // Idempotent: a no-op once clean, which is every boot after the first.
  {
    const { rows } = await db.query(
      `SELECT id, summary FROM scott_activity WHERE summary LIKE '%' || U&'\\2014' || '%' OR summary LIKE '%' || U&'\\2013' || '%'`
    );
    for (const row of rows) {
      const fixed = row.summary.replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ');
      await db.query('UPDATE scott_activity SET summary = $1 WHERE id = $2', [fixed, row.id]);
    }
    if (rows.length) console.log(`Scott AI Demonstration: rewrote ${rows.length} activity summary/summaries containing a banned dash.`);
  }

  // Conversation ownership and clearance columns. Idempotent
  // ALTER ... IF NOT EXISTS for databases seeded before these existed.
  {
    await db.query(`ALTER TABLE scott_conversations
      ADD COLUMN IF NOT EXISTS portal_user_id INTEGER REFERENCES scott_portal_users(id) ON DELETE CASCADE`);
    await db.query(`ALTER TABLE scott_conversations
      ADD COLUMN IF NOT EXISTS persona_id VARCHAR(40) NOT NULL DEFAULT 'scott_mercer'`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scott_conversations_portal_user
      ON scott_conversations (portal_user_id)`);
    await db.query(`ALTER TABLE scott_writebacks
      ADD COLUMN IF NOT EXISTS decided_by_portal_user_id INTEGER REFERENCES scott_portal_users(id)`);
    await db.query(`ALTER TABLE scott_writebacks
      ADD COLUMN IF NOT EXISTS decided_by_name VARCHAR(120) NOT NULL DEFAULT ''`);
    console.log('Scott AI Demonstration: conversation ownership and decision-identity columns verified.');
  }

  // Brain Gap register. Created here as well as in schema.sql so a
  // database seeded before this existed gets it on the next boot, same
  // pattern as every other Scott migration in this file.
  {
    await db.query(`CREATE TABLE IF NOT EXISTS scott_brain_gaps (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER,
      raised_by_worker_id VARCHAR(30) NOT NULL DEFAULT '',
      domain VARCHAR(60) NOT NULL DEFAULT '',
      gap_type VARCHAR(20) NOT NULL DEFAULT 'missing' CHECK (gap_type IN ('missing', 'stale', 'conflicting')),
      missing_evidence TEXT NOT NULL,
      why_it_matters TEXT NOT NULL,
      expected_source TEXT NOT NULL DEFAULT '',
      responsible_persona_id VARCHAR(40),
      responsible_name VARCHAR(120) NOT NULL DEFAULT '',
      work_can_continue BOOLEAN NOT NULL DEFAULT false,
      material BOOLEAN NOT NULL DEFAULT false,
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'notified', 'awaiting_source', 'resolved', 'dismissed')),
      notify_decision VARCHAR(40) NOT NULL DEFAULT 'not_material',
      email_status VARCHAR(20) NOT NULL DEFAULT 'not_required' CHECK (email_status IN ('not_required', 'pending', 'sent', 'failed')),
      email_to VARCHAR(255) NOT NULL DEFAULT '',
      email_attempts SMALLINT NOT NULL DEFAULT 0,
      email_error TEXT NOT NULL DEFAULT '',
      emailed_at TIMESTAMPTZ,
      related_job_id INTEGER REFERENCES scott_jobs(id) ON DELETE SET NULL,
      related_enquiry_id INTEGER REFERENCES scott_enquiries(id) ON DELETE SET NULL,
      resolved_by_user_id INTEGER REFERENCES users(id),
      resolved_by_portal_user_id INTEGER REFERENCES scott_portal_users(id),
      resolved_by_name VARCHAR(120) NOT NULL DEFAULT '',
      source_corrected BOOLEAN NOT NULL DEFAULT false,
      resolution_note TEXT NOT NULL DEFAULT '',
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scott_brain_gaps_status ON scott_brain_gaps (status, created_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scott_brain_gaps_responsible ON scott_brain_gaps (responsible_persona_id, status)`);
    // Where a fictional staff member's gap notification is delivered.
    // Left blank by default, which means the single demonstration inbox
    // in gapNotifier.js. Nothing invents an @scotts-armchairs address:
    // it would bounce, and a bouncing send makes the recorded delivery
    // result worthless.
    await db.query(`ALTER TABLE scott_portal_users
      ADD COLUMN IF NOT EXISTS notify_email VARCHAR(255) NOT NULL DEFAULT ''`);
    console.log('Scott AI Demonstration: Brain Gap register verified.');

    // Quality release gate (doc 24 review, finding F2). The mutable job
    // lifecycle gained quality_check / rework / ready_for_return, so the
    // status CHECK constraint must be rebuilt on databases created before
    // that change. Drop-and-re-add is idempotent in effect and cheap.
    await db.query('ALTER TABLE scott_jobs DROP CONSTRAINT IF EXISTS scott_jobs_status_check');
    await db.query(`ALTER TABLE scott_jobs ADD CONSTRAINT scott_jobs_status_check
      CHECK (status IN ('enquiry', 'quoted', 'scheduled', 'in_progress', 'awaiting_parts', 'quality_check', 'rework', 'ready_for_return', 'on_hold', 'completed', 'delivered'))`);

    // SAKS-1045 exists in the controlled dataset with an open BLOCKING
    // quality record (QC-260828-02), so seeding it onto the mutable board
    // in quality_check makes the release gate demonstrable: trying to mark
    // it delivered is refused, naming the missing evidence. Guarded on the
    // ref so it never fights later demo edits, and only added once the
    // base dataset exists (a fresh seed reaches here after seedScottData).
    const { rows: gateJob } = await db.query(`SELECT 1 FROM scott_jobs WHERE ref = 'SAKS-1045'`);
    const { rows: haveCustomers } = await db.query('SELECT COUNT(*)::int AS n FROM scott_customers');
    if (gateJob.length === 0 && haveCustomers[0].n > 0) {
      const { rows: existingCust } = await db.query(`SELECT id FROM scott_customers WHERE name = 'Elaine Rogers' LIMIT 1`);
      const custId = existingCust.length ? existingCust[0].id : (await db.query(
        `INSERT INTO scott_customers (name, kind, location, notes)
         VALUES ('Elaine Rogers', 'householder', 'Newton Abbot', 'Structural frame repair; adhesive cure completing, awaiting final QC sign-off.')
         RETURNING id`)).rows[0].id;
      await db.query(
        `INSERT INTO scott_jobs (ref, customer_id, kind, description, status, price_pence, promised_date, collection_date, at_risk, risk_note)
         VALUES ('SAKS-1045', $1, 'repair', 'Structural frame repair. Adhesive cure completes 30 August; independent stability sign-off (QC-260828-02) required before release.', 'quality_check', 38500, NULL, NULL, true, 'quality evidence outstanding (QC-260828-02), not a known failure')
         ON CONFLICT (ref) DO NOTHING`,
        [custId]);
      console.log('Scott AI Demonstration: quality-gated job SAKS-1045 seeded.');
    }
    console.log('Scott AI Demonstration: job lifecycle quality stages verified.');
  }

  // One-shot Brain Gap acceptance check, gated on
  // RUN_GAP_ACCEPTANCE_CHECK=true and its own already-ran marker. Proves
  // the real notification chain in this environment; see the script's
  // header for exactly what it does and does not claim.
  await require('../scripts/scottGapAcceptance').runGapAcceptanceCheck(db);

  // Arrington AI Workspace: ingest the encrypted snapshot into
  // workspace_records. A no-op when WORKSPACE_SNAPSHOT_KEY is unset, and
  // never fatal: an ingest failure records itself as a failed sync run
  // and the boot continues, because a brain that cannot refresh must say
  // so rather than take the website down.
  await require('../lib/workspace/ingest').ingestWorkspaceSnapshot(require('../lib/workspace/repo'));
  // Contacts (CRM): rebuild from the lead history. Idempotent, and it
  // populates from everything already captured rather than starting
  // empty on the day it was switched on. Never fatal: a contact index
  // that cannot rebuild must not stop the website booting.
  try {
    const crmResult = await require('../lib/crm/contacts').syncFromLeads();
    console.log(`Contacts: ${crmResult.contactsTouched} contact record(s) from ${crmResult.leadsScanned} lead row(s), ${crmResult.eventsAdded} new interaction(s).`);
  } catch (err) {
    console.error('Contacts sync failed (boot continues):', err.message);
  }

  console.log('Seed complete.');
}

seed()
  // process.exitCode may have been set by the acceptance check; a plain
  // exit(0) here would overwrite an honest failure with a green exit.
  .then(() => process.exit(process.exitCode || 0))
  .catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
