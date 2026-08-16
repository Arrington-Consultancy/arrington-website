const express = require('express');
const bcrypt = require('bcrypt');
const { requireAuth } = require('../middleware/auth');
const { requireCapability, getPermissionsMatrix, refreshPermissions, ALL_CAPABILITIES, ALL_ROLES } = require('../middleware/permissions');
const db = require('../db/pool');
const defaults = require('../db/defaults');
const themes = require('../db/themes');

const BCRYPT_ROUNDS = 12;

const router = express.Router();

// Reserved slugs that cannot be used as page slugs
const RESERVED_SLUGS = ['login', 'logout', 'health', 'api', 'img', 'js', 'css', 'public', 'main'];

// Valid section templates (matches routes/content.js and server.js)
const VALID_TEMPLATES = ['hero','credentials','biography','intervention','approach','insights','fourcards','documents','casestudy','casestudy2','assessment','filter','proofstrip','offerpair','heromontage','contact','googlereviews','article','utlibrary'];

// Default sections for a new page. 'contact' omitted — it now renders
// globally in the footer, so including it here would either duplicate
// the footer or render as an empty section body.
const NEW_PAGE_TEMPLATES = ['hero', 'casestudy'];

// Generate a URL slug from a title
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Content key prefixes owned by a given instance (mirrors routes/content.js)
function contentPrefixes(instanceId, template) {
  if (template === 'credentials') {
    return [`${instanceId}_oxford`, `${instanceId}_stat`];
  }
  return [instanceId];
}

function sourcePrefixes(template) {
  if (template === 'credentials') return ['credentials_oxford', 'credentials_stat'];
  return [template];
}

// Activity log
router.get('/log', requireCapability('view_activity'), async (req, res) => {
  try {
    let query, params;

    query = `SELECT a.action, a.section_key, a.detail, a.created_at,
                    u.username
             FROM audit_log a
             LEFT JOIN users u ON a.user_id = u.id
             ORDER BY a.created_at DESC
             LIMIT 50`;
    params = [];

    const { rows } = await db.query(query, params);
    res.json({ log: rows });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Failed to load activity log' });
  }
});

// Leads & booking requests (footer form + gated PDF downloads)
router.get('/leads', requireCapability('view_activity'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, kind, name, email, phone, message, preferred_time, document, created_at
       FROM leads ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ leads: rows });
  } catch (err) {
    console.error('Leads list error:', err);
    res.status(500).json({ error: 'Failed to load leads' });
  }
});

// Commercial Gaps Review (AI) — unpublished, feature-branch tool (see
// routes/commercialGapsReview.js). Every completed review is already
// emailed to Tom in full, including the private briefing; these two
// endpoints exist so the same detail is also reachable from the admin
// panel without digging through email. Same capability gate as the leads
// list above — this is not a separate, looser permission tier.
router.get('/commercial-gaps-reviews', requireCapability('view_activity'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT result_token, status, name, email, company, location,
              consent_save_email, consent_contact, ai_mode, created_at, completed_at
       FROM commercial_gaps_reviews ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ reviews: rows });
  } catch (err) {
    console.error('Commercial Gaps Review list error:', err);
    res.status(500).json({ error: 'Failed to load Commercial Gaps Reviews' });
  }
});

// Full detail for one review, including the transcript and — unlike the
// visitor-facing result page — the private tom_briefing object.
router.get('/commercial-gaps-reviews/:token', requireCapability('view_activity'), async (req, res) => {
  try {
    const token = String(req.params.token || '');
    if (!/^[a-f0-9]{48}$/.test(token)) {
      return res.status(400).json({ error: 'Invalid token' });
    }
    const { rows } = await db.query(
      'SELECT * FROM commercial_gaps_reviews WHERE result_token = $1',
      [token]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }
    res.json({ review: rows[0] });
  } catch (err) {
    console.error('Commercial Gaps Review detail error:', err);
    res.status(500).json({ error: 'Failed to load review' });
  }
});

// Reset all content to defaults (admin only)
router.post('/reset', requireCapability('reset_content'), async (req, res) => {
  try {
    for (const [key, content] of Object.entries(defaults)) {
      await db.query(
        'UPDATE content SET content = $1, updated_at = NOW(), updated_by = $2 WHERE section_key = $3',
        [content, req.session.user.id, key]
      );
    }

    // Audit log
    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [req.session.user.id, 'content_reset', `All content reset to defaults by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Content reset error:', err);
    res.status(500).json({ error: 'Failed to reset content' });
  }
});

// Create backup
router.post('/backup', requireCapability('manage_backups'), async (req, res) => {
  try {
    // Snapshot all content
    const { rows: contentRows } = await db.query('SELECT section_key, content FROM content');
    const contentSnapshot = {};
    contentRows.forEach(r => { contentSnapshot[r.section_key] = r.content; });

    // Snapshot all images (store as base64)
    const { rows: imageRows } = await db.query('SELECT image_key, data, mime_type FROM images');
    const imagesSnapshot = {};
    imageRows.forEach(r => {
      imagesSnapshot[r.image_key] = {
        data: r.data.toString('base64'),
        mimeType: r.mime_type
      };
    });

    // Snapshot all pages (including per-page SEO fields)
    const { rows: pageRows } = await db.query('SELECT slug, title, sort_order, hidden, section_order, hidden_sections, deleted_sections, meta_title, meta_description, meta_keywords, og_title, og_description, og_image, canonical_url, noindex FROM pages ORDER BY sort_order');
    const pagesSnapshot = pageRows;

    const label = req.body.label || new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    // Store pages inside content_snapshot under a reserved key
    const fullSnapshot = { ...contentSnapshot, '__pages__': pagesSnapshot };

    await db.query(
      `INSERT INTO backups (label, content_snapshot, images_snapshot, created_by)
       VALUES ($1, $2, $3, $4)`,
      [label, JSON.stringify(fullSnapshot), JSON.stringify(imagesSnapshot), req.session.user.id]
    );

    // Keep only the 3 most recent backups; drop anything older.
    const { rowCount: prunedCount } = await db.query(
      `DELETE FROM backups
       WHERE id NOT IN (
         SELECT id FROM backups ORDER BY created_at DESC LIMIT 3
       )`
    );

    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [req.session.user.id, 'backup_created', `Backup "${label}" created by ${req.session.user.username}${prunedCount ? ` (pruned ${prunedCount} older)` : ''}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// List backups
router.get('/backups', requireCapability('manage_backups'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT b.id, b.label, b.created_at, u.username
       FROM backups b
       LEFT JOIN users u ON b.created_by = u.id
       ORDER BY b.created_at DESC
       LIMIT 20`
    );
    res.json({ backups: rows });
  } catch (err) {
    console.error('List backups error:', err);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// Restore backup
router.post('/backup/:id/restore', requireCapability('manage_backups'), async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT content_snapshot, images_snapshot, label FROM backups WHERE id = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    const { content_snapshot, images_snapshot, label } = rows[0];

    // Separate pages snapshot from content (stored under reserved key)
    const pagesSnapshot = content_snapshot['__pages__'] || null;
    const contentOnly = { ...content_snapshot };
    delete contentOnly['__pages__'];

    // Restore content
    for (const [key, content] of Object.entries(contentOnly)) {
      await db.query(
        'UPDATE content SET content = $1, updated_at = NOW(), updated_by = $2 WHERE section_key = $3',
        [content, req.session.user.id, key]
      );
    }

    // Restore images
    for (const [key, img] of Object.entries(images_snapshot)) {
      const buffer = Buffer.from(img.data, 'base64');
      await db.query(
        'UPDATE images SET data = $1, mime_type = $2, updated_at = NOW(), updated_by = $3 WHERE image_key = $4',
        [buffer, img.mimeType, req.session.user.id, key]
      );
    }

    // Restore pages if the backup includes them
    if (Array.isArray(pagesSnapshot) && pagesSnapshot.length > 0) {
      // Remove all non-main pages, then upsert from snapshot
      await db.query("DELETE FROM pages WHERE slug != 'main'");
      for (const p of pagesSnapshot) {
        await db.query(
          `INSERT INTO pages (slug, title, sort_order, hidden, section_order, hidden_sections, deleted_sections,
             meta_title, meta_description, meta_keywords, og_title, og_description, og_image, canonical_url, noindex, updated_by)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (slug) DO UPDATE SET
             title = EXCLUDED.title,
             sort_order = EXCLUDED.sort_order,
             hidden = EXCLUDED.hidden,
             section_order = EXCLUDED.section_order,
             hidden_sections = EXCLUDED.hidden_sections,
             deleted_sections = EXCLUDED.deleted_sections,
             meta_title = EXCLUDED.meta_title,
             meta_description = EXCLUDED.meta_description,
             meta_keywords = EXCLUDED.meta_keywords,
             og_title = EXCLUDED.og_title,
             og_description = EXCLUDED.og_description,
             og_image = EXCLUDED.og_image,
             canonical_url = EXCLUDED.canonical_url,
             noindex = EXCLUDED.noindex,
             updated_at = NOW(),
             updated_by = EXCLUDED.updated_by`,
          [p.slug, p.title, p.sort_order, p.hidden || false,
           JSON.stringify(p.section_order || []),
           JSON.stringify(p.hidden_sections || []),
           JSON.stringify(p.deleted_sections || []),
           p.meta_title || '', p.meta_description || '', p.meta_keywords || '',
           p.og_title || '', p.og_description || '', p.og_image || '',
           p.canonical_url || '', p.noindex || false,
           req.session.user.id]
        );
      }
    }

    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [req.session.user.id, 'backup_restored', `Backup "${label}" restored by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

// Set theme
router.put('/theme', requireCapability('manage_theme'), async (req, res) => {
  const { theme } = req.body;

  if (!theme || !themes[theme]) {
    return res.status(400).json({ error: 'Invalid theme' });
  }

  try {
    await db.query(
      `UPDATE content SET content = $1, updated_at = NOW(), updated_by = $2
       WHERE section_key = 'site.theme'`,
      [theme, req.session.user.id]
    );

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'theme_change', 'site.theme', `Theme changed to "${themes[theme].label}" by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Theme change error:', err);
    res.status(500).json({ error: 'Failed to change theme' });
  }
});

// --- Page management (both users) ---

// List all pages (used by the reorder-pages UI)
router.get('/pages', requireCapability('manage_pages'), async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, slug, title, sort_order, hidden, show_in_nav, nav_label FROM pages ORDER BY sort_order, created_at'
    );
    res.json({ pages: rows });
  } catch (err) {
    console.error('Pages list error:', err);
    res.status(500).json({ error: 'Failed to list pages' });
  }
});

// Create a new page
router.post('/page', requireCapability('manage_pages'), async (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Page title required' });
  }

  const slug = slugify(title.trim());
  if (!slug || slug.length < 2) {
    return res.status(400).json({ error: 'Title too short for a valid URL slug' });
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return res.status(400).json({ error: `"${slug}" is a reserved name. Choose a different title.` });
  }

  try {
    // Check for slug collision
    const { rows: existing } = await db.query('SELECT id FROM pages WHERE slug = $1', [slug]);
    if (existing.length > 0) {
      return res.status(409).json({ error: `A page with the URL "/${slug}" already exists` });
    }

    // Get next sort_order
    const { rows: maxRows } = await db.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM pages');
    const sortOrder = maxRows[0].next;

    // Gather all instance IDs across all pages for global uniqueness
    const { rows: allPageRows } = await db.query('SELECT section_order FROM pages');
    const globalInUse = new Set();
    for (const p of allPageRows) {
      const arr = Array.isArray(p.section_order) ? p.section_order : [];
      arr.forEach(s => globalInUse.add(s));
    }

    // Allocate instances for the new page's default sections
    const pageOrder = [];
    for (const template of NEW_PAGE_TEMPLATES) {
      let instanceId;
      if (!globalInUse.has(template)) {
        instanceId = template;
      } else {
        instanceId = null;
        for (let n = 2; n <= 99; n++) {
          const candidate = `${template}__${n}`;
          if (!globalInUse.has(candidate)) { instanceId = candidate; break; }
        }
        if (!instanceId) continue; // skip if exhausted
      }
      globalInUse.add(instanceId);
      pageOrder.push(instanceId);

      // Seed content for suffixed instances by copying from base template
      if (instanceId !== template) {
        const sources = sourcePrefixes(template);
        const targets = contentPrefixes(instanceId, template);
        for (let i = 0; i < sources.length; i++) {
          const src = sources[i];
          const dst = targets[i];
          const { rows } = await db.query(
            'SELECT section_key, content FROM content WHERE section_key LIKE $1',
            [`${src}.%`]
          );
          for (const row of rows) {
            const suffix = row.section_key.slice(src.length);
            const newKey = `${dst}${suffix}`;
            await db.query(
              `INSERT INTO content (section_key, content, updated_by)
               VALUES ($1, $2, $3)
               ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
              [newKey, row.content, req.session.user.id]
            );
          }
        }
      }
    }

    // Create the page
    await db.query(
      `INSERT INTO pages (slug, title, sort_order, section_order, updated_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [slug, title.trim(), sortOrder, JSON.stringify(pageOrder), req.session.user.id]
    );

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'page_create', slug, `Page "${title.trim()}" created by ${req.session.user.username}`]
    );

    res.json({ success: true, slug });
  } catch (err) {
    console.error('Page create error:', err);
    res.status(500).json({ error: 'Failed to create page' });
  }
});

// Update a page (title, hidden)
router.put('/page/:slug', requireCapability('manage_pages'), async (req, res) => {
  const { slug } = req.params;
  const { title, hidden, show_in_nav, nav_label } = req.body;

  try {
    const { rows } = await db.query('SELECT * FROM pages WHERE slug = $1', [slug]);
    if (rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    // Cannot hide the main page, and it must always stay in the main nav
    if (slug === 'main' && hidden === true) {
      return res.status(400).json({ error: 'Cannot hide the home page' });
    }
    if (slug === 'main' && show_in_nav === false) {
      return res.status(400).json({ error: 'The home page must stay in the main navigation' });
    }

    const updates = [];
    const params = [];
    let idx = 1;
    const detailParts = [];

    if (title !== undefined && typeof title === 'string' && title.trim().length > 0) {
      updates.push(`title = $${idx}`);
      params.push(title.trim());
      idx++;
      detailParts.push(`renamed to "${title.trim()}"`);
    }
    if (hidden !== undefined && typeof hidden === 'boolean') {
      updates.push(`hidden = $${idx}`);
      params.push(hidden);
      idx++;
      detailParts.push(hidden ? 'hidden' : 'shown');
    }
    if (show_in_nav !== undefined && typeof show_in_nav === 'boolean') {
      updates.push(`show_in_nav = $${idx}`);
      params.push(show_in_nav);
      idx++;
      detailParts.push(show_in_nav ? 'shown in main nav' : 'removed from main nav');
    }
    if (nav_label !== undefined && typeof nav_label === 'string') {
      const trimmed = nav_label.trim().slice(0, 200);
      updates.push(`nav_label = $${idx}`);
      params.push(trimmed);
      idx++;
      detailParts.push(trimmed ? `nav label set to "${trimmed}"` : 'nav label cleared');
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    updates.push(`updated_at = NOW()`);
    updates.push(`updated_by = $${idx}`);
    params.push(req.session.user.id);
    idx++;
    params.push(slug);

    await db.query(
      `UPDATE pages SET ${updates.join(', ')} WHERE slug = $${idx}`,
      params
    );

    const detail = detailParts.join(', ') || 'updated';
    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'page_update', slug, `Page "${slug}" ${detail} by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Page update error:', err);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

// Delete a page
router.delete('/page/:slug', requireCapability('manage_pages'), async (req, res) => {
  const { slug } = req.params;

  if (slug === 'main') {
    return res.status(400).json({ error: 'Cannot delete the home page' });
  }

  try {
    const { rowCount } = await db.query('DELETE FROM pages WHERE slug = $1', [slug]);
    if (rowCount === 0) return res.status(404).json({ error: 'Page not found' });

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'page_delete', slug, `Page "${slug}" deleted by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Page delete error:', err);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// Reorder pages
router.put('/page-order', requireCapability('manage_pages'), async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'Invalid order array' });
  }

  try {
    for (let i = 0; i < order.length; i++) {
      await db.query(
        'UPDATE pages SET sort_order = $1, updated_at = NOW(), updated_by = $2 WHERE slug = $3',
        [i, req.session.user.id, order[i]]
      );
    }

    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [req.session.user.id, 'page_reorder', `Pages reordered by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Page reorder error:', err);
    res.status(500).json({ error: 'Failed to reorder pages' });
  }
});

// --- SEO: per-page metadata + site-wide defaults ---

// The per-page SEO fields that live as columns on the pages table.
const SEO_FIELDS = ['meta_title', 'meta_description', 'meta_keywords', 'og_title', 'og_description', 'og_image', 'canonical_url'];
// The site-wide default content keys (fallbacks for blank per-page fields).
const SEO_DEFAULT_KEYS = ['seo.site_name', 'seo.default_description', 'seo.default_og_image', 'seo.twitter_handle'];
// SEO fields that hold URLs — restricted to http(s) or root-relative so a
// stored value can never carry a javascript:/data: scheme into a rendered
// href/content attribute (defence-in-depth on top of EJS escaping).
const SEO_URL_FIELDS = new Set(['og_image', 'canonical_url']);

function isSafeSeoUrl(value) {
  if (value === '') return true;            // blank clears the field
  if (value.startsWith('/')) return true;   // root-relative
  return /^https?:\/\/\S+$/i.test(value);   // absolute http(s)
}

// Get site-wide SEO defaults
router.get('/seo-defaults', requireCapability('manage_seo'), async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT section_key, content FROM content WHERE section_key = ANY($1)', [SEO_DEFAULT_KEYS]
    );
    const defaults = {};
    rows.forEach(r => { defaults[r.section_key] = r.content; });
    for (const k of SEO_DEFAULT_KEYS) if (!(k in defaults)) defaults[k] = '';
    res.json({ defaults });
  } catch (err) {
    console.error('Get SEO defaults error:', err);
    res.status(500).json({ error: 'Failed to load SEO defaults' });
  }
});

// Update site-wide SEO defaults
router.put('/seo-defaults', requireCapability('manage_seo'), async (req, res) => {
  const incoming = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    for (const key of SEO_DEFAULT_KEYS) {
      if (incoming[key] === undefined) continue;
      const value = typeof incoming[key] === 'string' ? incoming[key].trim() : '';
      if (key === 'seo.default_og_image' && !isSafeSeoUrl(value)) {
        return res.status(400).json({ error: 'Default social image URL must start with https:// or /' });
      }
      await db.query(
        `INSERT INTO content (section_key, content, updated_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (section_key) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [key, value, req.session.user.id]
      );
    }
    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [req.session.user.id, 'seo_defaults_update', `Site SEO defaults updated by ${req.session.user.username}`]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Update SEO defaults error:', err);
    res.status(500).json({ error: 'Failed to save SEO defaults' });
  }
});

// Get a page's SEO fields (plus the site defaults so the form can show what
// each blank field falls back to)
router.get('/seo/:slug', requireCapability('manage_seo'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT slug, title, meta_title, meta_description, meta_keywords,
              og_title, og_description, og_image, canonical_url, noindex
       FROM pages WHERE slug = $1`, [req.params.slug]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    const { rows: defRows } = await db.query(
      'SELECT section_key, content FROM content WHERE section_key = ANY($1)', [SEO_DEFAULT_KEYS]
    );
    const defaults = {};
    defRows.forEach(r => { defaults[r.section_key] = r.content; });
    for (const k of SEO_DEFAULT_KEYS) if (!(k in defaults)) defaults[k] = '';

    res.json({ page: rows[0], defaults });
  } catch (err) {
    console.error('Get page SEO error:', err);
    res.status(500).json({ error: 'Failed to load page SEO' });
  }
});

// Update a page's SEO fields
router.put('/seo/:slug', requireCapability('manage_seo'), async (req, res) => {
  const { slug } = req.params;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    const { rows } = await db.query('SELECT id FROM pages WHERE slug = $1', [slug]);
    if (rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    const updates = [];
    const params = [];
    let idx = 1;

    for (const field of SEO_FIELDS) {
      if (body[field] === undefined) continue;
      let value = typeof body[field] === 'string' ? body[field].trim() : '';
      // URL fields must be http(s) or root-relative.
      if (SEO_URL_FIELDS.has(field) && !isSafeSeoUrl(value)) {
        return res.status(400).json({ error: `${field === 'og_image' ? 'Social image URL' : 'Canonical URL'} must start with https:// or /` });
      }
      // Length guards mirror the column definitions (VARCHAR(255) for the
      // two *_title columns; the rest are TEXT).
      if ((field === 'meta_title' || field === 'og_title') && value.length > 255) {
        value = value.slice(0, 255);
      }
      updates.push(`${field} = $${idx}`);
      params.push(value);
      idx++;
    }
    if (body.noindex !== undefined) {
      updates.push(`noindex = $${idx}`);
      params.push(body.noindex === true || body.noindex === 'true');
      idx++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    updates.push(`updated_at = NOW()`);
    updates.push(`updated_by = $${idx}`);
    params.push(req.session.user.id);
    idx++;
    params.push(slug);

    await db.query(`UPDATE pages SET ${updates.join(', ')} WHERE slug = $${idx}`, params);

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'seo_update', slug, `SEO updated for page "${slug}" by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Update page SEO error:', err);
    res.status(500).json({ error: 'Failed to save page SEO' });
  }
});

// --- User management (scoped by role) ---

// List users — content users only see client users
router.get('/users', requireCapability('manage_users'), async (req, res) => {
  try {
    const isAdmin = req.session.user.role === 'admin';
    const query = isAdmin
      ? 'SELECT id, username, role, created_at FROM users ORDER BY created_at'
      : "SELECT id, username, role, created_at FROM users WHERE role = 'client' ORDER BY created_at";
    const { rows } = await db.query(query);
    res.json({ users: rows, callerRole: req.session.user.role });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Add a new user — content users can only create client users
router.post('/user', requireCapability('manage_users'), async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!role || !['admin', 'content', 'client'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  // Content users can only create client users
  if (req.session.user.role !== 'admin' && role !== 'client') {
    return res.status(403).json({ error: 'You can only create client users' });
  }

  const cleanUsername = username.trim().toLowerCase();

  try {
    const { rows: existing } = await db.query(
      'SELECT id FROM users WHERE username = $1', [cleanUsername]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: `User "${cleanUsername}" already exists` });
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
      [cleanUsername, hash, role]
    );

    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [req.session.user.id, 'user_create', `User "${cleanUsername}" (${role}) created by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Change a user's password — content users can only change client passwords
router.put('/user/:id/password', requireCapability('manage_users'), async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { password } = req.body;

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const { rows } = await db.query('SELECT username, role FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    if (req.session.user.role !== 'admin' && rows[0].role !== 'client') {
      return res.status(403).json({ error: 'You can only manage client users' });
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hash, userId]
    );

    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [req.session.user.id, 'user_password_change', `Password changed for "${rows[0].username}" by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Delete a user — content users can only delete client users
router.delete('/user/:id', requireCapability('manage_users'), async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  // Cannot delete yourself
  if (userId === req.session.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    const { rows } = await db.query('SELECT username, role FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    if (req.session.user.role !== 'admin' && rows[0].role !== 'client') {
      return res.status(403).json({ error: 'You can only manage client users' });
    }

    // Clear FK references before deleting
    await db.query('UPDATE content SET updated_by = NULL WHERE updated_by = $1', [userId]);
    await db.query('UPDATE images SET updated_by = NULL WHERE updated_by = $1', [userId]);
    await db.query('UPDATE pages SET updated_by = NULL WHERE updated_by = $1', [userId]);
    await db.query('UPDATE backups SET created_by = NULL WHERE created_by = $1', [userId]);
    await db.query('DELETE FROM session WHERE sess::text LIKE $1', [`%"id":${userId}%`]);

    await db.query('DELETE FROM users WHERE id = $1', [userId]);

    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [req.session.user.id, 'user_delete', `User "${rows[0].username}" deleted by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// --- Permissions matrix (admin only) ---

router.get('/permissions', requireCapability('manage_permissions'), (req, res) => {
  res.json({ matrix: getPermissionsMatrix(), capabilities: ALL_CAPABILITIES, roles: ALL_ROLES });
});

router.put('/permissions', requireCapability('manage_permissions'), async (req, res) => {
  const { matrix } = req.body;
  if (!matrix || typeof matrix !== 'object') {
    return res.status(400).json({ error: 'Invalid permissions data' });
  }

  try {
    for (const role of ALL_ROLES) {
      if (!matrix[role]) continue;
      for (const cap of ALL_CAPABILITIES) {
        if (matrix[role][cap] === undefined) continue;
        // manage_permissions is locked to admin only
        if (cap === 'manage_permissions' && role !== 'admin') continue;
        // admin always keeps manage_permissions
        if (cap === 'manage_permissions' && role === 'admin') continue;

        await db.query(
          `INSERT INTO role_permissions (role, capability, enabled) VALUES ($1, $2, $3)
           ON CONFLICT (role, capability) DO UPDATE SET enabled = EXCLUDED.enabled`,
          [role, cap, !!matrix[role][cap]]
        );
      }
    }

    await refreshPermissions();

    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [req.session.user.id, 'permissions_update', `Permissions updated by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Permissions update error:', err);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// --- Page access (for client users) ---

router.get('/page-access/by-slug/:slug', requireCapability('manage_page_access'), async (req, res) => {
  try {
    const { rows: pageRows } = await db.query('SELECT id FROM pages WHERE slug = $1', [req.params.slug]);
    if (pageRows.length === 0) return res.status(404).json({ error: 'Page not found' });
    const pageId = pageRows[0].id;

    const { rows: clients } = await db.query(
      "SELECT id, username FROM users WHERE role = 'client' ORDER BY username"
    );
    const { rows: access } = await db.query(
      'SELECT user_id FROM page_access WHERE page_id = $1',
      [pageId]
    );
    const accessSet = new Set(access.map(r => r.user_id));
    const result = clients.map(c => ({
      id: c.id,
      username: c.username,
      hasAccess: accessSet.has(c.id)
    }));
    res.json({ clients: result, pageId });
  } catch (err) {
    console.error('Page access fetch error:', err);
    res.status(500).json({ error: 'Failed to load page access' });
  }
});

router.get('/page-access/:pageId', requireCapability('manage_page_access'), async (req, res) => {
  const pageId = parseInt(req.params.pageId, 10);
  try {
    const { rows: clients } = await db.query(
      "SELECT id, username FROM users WHERE role = 'client' ORDER BY username"
    );
    const { rows: access } = await db.query(
      'SELECT user_id FROM page_access WHERE page_id = $1',
      [pageId]
    );
    const accessSet = new Set(access.map(r => r.user_id));
    const result = clients.map(c => ({
      id: c.id,
      username: c.username,
      hasAccess: accessSet.has(c.id)
    }));
    res.json({ clients: result, pageId });
  } catch (err) {
    console.error('Page access fetch error:', err);
    res.status(500).json({ error: 'Failed to load page access' });
  }
});

router.put('/page-access/:pageId', requireCapability('manage_page_access'), async (req, res) => {
  const pageId = parseInt(req.params.pageId, 10);
  const { userIds } = req.body;

  if (!Array.isArray(userIds)) {
    return res.status(400).json({ error: 'Invalid user IDs' });
  }

  try {
    // Verify page exists
    const { rows: pageRows } = await db.query('SELECT slug FROM pages WHERE id = $1', [pageId]);
    if (pageRows.length === 0) return res.status(404).json({ error: 'Page not found' });

    // Replace all access for this page
    await db.query('DELETE FROM page_access WHERE page_id = $1', [pageId]);
    for (const uid of userIds) {
      await db.query(
        'INSERT INTO page_access (page_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [pageId, uid]
      );
    }

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'page_access_update', pageRows[0].slug, `Page access updated for "${pageRows[0].slug}" by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Page access update error:', err);
    res.status(500).json({ error: 'Failed to update page access' });
  }
});

// Where to Start — Stripe-backed purchases (see routes/whereToStart.js and
// db/schema.sql's purchases table). List is read-only, same capability gate
// as the leads list above. The £500 credit is normally matched
// automatically by email at checkout time, but email match is a
// convenience, not the sole authority — if a customer paid the Commercial
// Review under one email and the Full Commercial Review under another, the
// automatic match never fires, so this gives Tom a manual override rather
// than requiring a customer-account system to solve an edge case. Gated on
// manage_backups (not view_activity) because it's a write action touching
// financial bookkeeping, not just a read.
router.get('/purchases', requireCapability('view_activity'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, offer_id, email, list_price_pence, amount_pence, credit_applied_pence,
              credit_applied_manually, currency, status, stripe_session_id,
              credited_toward_id, created_at
       FROM purchases ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ purchases: rows });
  } catch (err) {
    console.error('Purchases list error:', err);
    res.status(500).json({ error: 'Failed to load purchases' });
  }
});

// Diagnostic log of every /api/stripe/webhook POST (see db/schema.sql's
// webhook_log table and routes/whereToStart.js's logWebhookAttempt). Built
// 13/08/2026 specifically so a webhook delivery problem can be diagnosed
// from inside the app — no Stripe Dashboard or MCP tool access required.
router.get('/webhook-log', requireCapability('view_activity'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, provider, outcome, event_type, stripe_event_id, detail, created_at
       FROM webhook_log ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ entries: rows });
  } catch (err) {
    console.error('Webhook log list error:', err);
    res.status(500).json({ error: 'Failed to load webhook log' });
  }
});

// Records that an earlier paid Commercial Review (sourcePurchaseId) credits
// a later paid Full Commercial Review (targetPurchaseId), when the
// automatic email match at checkout time didn't catch it (different
// emails, etc). This is a bookkeeping correction only — it does NOT trigger
// a Stripe refund. Both purchases already have real, completed Stripe
// charges at whatever amount was actually paid; reconciling the money (if
// Tom decides the customer is owed £500 back) is a deliberate, separate
// action taken directly in the Stripe Dashboard, not something this
// endpoint automates, since an automatic refund is exactly the kind of
// irreversible financial action that needs a human decision each time.
router.put('/purchases/:id/apply-credit', requireCapability('manage_backups'), async (req, res) => {
  const sourceId = parseInt(req.params.id, 10);
  const targetId = parseInt(req.body?.targetPurchaseId, 10);

  if (!Number.isInteger(sourceId) || !Number.isInteger(targetId)) {
    return res.status(400).json({ error: 'A valid targetPurchaseId is required.' });
  }
  if (sourceId === targetId) {
    return res.status(400).json({ error: 'Source and target purchase cannot be the same.' });
  }

  try {
    const { rows: sourceRows } = await db.query(
      `SELECT id, offer_id, status, credited_toward_id FROM purchases WHERE id = $1`,
      [sourceId]
    );
    const source = sourceRows[0];
    if (!source) return res.status(404).json({ error: 'Source purchase not found.' });
    if (source.offer_id !== 'commercial_review' || source.status !== 'paid') {
      return res.status(400).json({ error: 'Source purchase must be a paid Commercial Review.' });
    }
    if (source.credited_toward_id) {
      return res.status(400).json({ error: 'This Commercial Review credit has already been applied elsewhere.' });
    }

    const { rows: targetRows } = await db.query(
      `SELECT id, offer_id, status FROM purchases WHERE id = $1`,
      [targetId]
    );
    const target = targetRows[0];
    if (!target) return res.status(404).json({ error: 'Target purchase not found.' });
    if (target.offer_id !== 'full_commercial_review' || target.status !== 'paid') {
      return res.status(400).json({ error: 'Target purchase must be a paid Full Commercial Review.' });
    }

    await db.query(
      `UPDATE purchases SET credited_toward_id = $1 WHERE id = $2`,
      [targetId, sourceId]
    );
    await db.query(
      `UPDATE purchases SET credit_applied_manually = true WHERE id = $1`,
      [targetId]
    );

    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [
        req.session.user.id,
        'purchase_credit_applied_manually',
        `Commercial Review purchase #${sourceId} manually marked as crediting Full Commercial Review purchase #${targetId} by ${req.session.user.username}`
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Manual credit apply error:', err);
    res.status(500).json({ error: 'Failed to apply credit.' });
  }
});

module.exports = router;
