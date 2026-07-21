/**
 * Regenerate handover/live-content-export-<date>.sql from a running database.
 *
 * The committed export is a point-in-time snapshot. If Tom keeps editing the
 * live site through the CMS before cutover, re-run this against the SOURCE
 * database to capture the latest copy, then load the fresh file into the new DB.
 *
 * Usage:
 *   DATABASE_URL="postgres://...":  the SOURCE database (the one currently live)
 *   node handover/regenerate-export.js handover/live-content-export-YYYY-MM-DD.sql
 *
 * Get the SOURCE url from Railway:  railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL
 */
const { Client } = require('pg');
const fs = require('fs');

const URL = process.env.DATABASE_URL;
const OUT = process.argv[2];
if (!URL || !OUT) {
  console.error('Set DATABASE_URL and pass an output path. See header comment.');
  process.exit(1);
}

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const hex = (buf) => "decode('" + buf.toString('hex') + "', 'hex')";

(async () => {
  const c = new Client({ connectionString: URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  let out = `-- Arrington Consultancy — live content export
-- Restores the exact live website copy, pages, images and permissions.
-- Run AFTER the app has booted once (so db/seed.js has created the schema).
-- Idempotent: every row is an upsert, safe to re-run.
BEGIN;

`;
  const content = (await c.query('SELECT section_key, content FROM content ORDER BY section_key')).rows;
  out += `-- content (${content.length} rows)\n`;
  for (const r of content)
    out += `INSERT INTO content (section_key, content) VALUES (${q(r.section_key)}, ${q(r.content)}) ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content;\n`;

  const pcols = ['slug','title','sort_order','hidden','section_order','hidden_sections','deleted_sections',
                 'meta_title','meta_description','meta_keywords','og_title','og_description','og_image','canonical_url','noindex'];
  const pages = (await c.query(`SELECT ${pcols.join(',')} FROM pages ORDER BY sort_order`)).rows;
  out += `\n-- pages (${pages.length} rows)\n`;
  for (const r of pages) {
    const vals = pcols.map(k => {
      const v = r[k];
      if (k === 'sort_order') return String(v);
      if (k === 'hidden' || k === 'noindex') return v ? 'true' : 'false';
      if (['section_order','hidden_sections','deleted_sections'].includes(k)) return q(JSON.stringify(v)) + '::jsonb';
      return q(v);
    });
    const updates = pcols.filter(k => k !== 'slug').map(k => `${k} = EXCLUDED.${k}`).join(', ');
    out += `INSERT INTO pages (${pcols.join(',')}) VALUES (${vals.join(', ')}) ON CONFLICT (slug) DO UPDATE SET ${updates};\n`;
  }

  const images = (await c.query('SELECT image_key, data, mime_type FROM images ORDER BY image_key')).rows;
  out += `\n-- images (${images.length} rows)\n`;
  for (const r of images)
    out += `INSERT INTO images (image_key, data, mime_type) VALUES (${q(r.image_key)}, ${hex(r.data)}, ${q(r.mime_type)}) ON CONFLICT (image_key) DO UPDATE SET data = EXCLUDED.data, mime_type = EXCLUDED.mime_type;\n`;

  const perms = (await c.query('SELECT role, capability, enabled FROM role_permissions ORDER BY role, capability')).rows;
  out += `\n-- role_permissions (${perms.length} rows)\n`;
  for (const r of perms)
    out += `INSERT INTO role_permissions (role, capability, enabled) VALUES (${q(r.role)}, ${q(r.capability)}, ${r.enabled ? 'true':'false'}) ON CONFLICT (role, capability) DO UPDATE SET enabled = EXCLUDED.enabled;\n`;

  out += `\nCOMMIT;\n`;
  fs.writeFileSync(OUT, out);
  console.log(`Wrote ${OUT}: ${content.length} content, ${pages.length} pages, ${images.length} images, ${perms.length} perms.`);
  await c.end();
})();
