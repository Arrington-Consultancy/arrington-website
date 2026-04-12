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
