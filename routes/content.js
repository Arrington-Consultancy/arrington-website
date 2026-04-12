const express = require('express');
const sanitizeHtml = require('sanitize-html');
const { requireAuth } = require('../middleware/auth');
const db = require('../db/pool');

const router = express.Router();

const sanitiseOptions = {
  allowedTags: ['strong', 'p', 'br', 'em'],
  allowedAttributes: {}
};

function sanitise(text) {
  return sanitizeHtml(text, sanitiseOptions).trim();
}

// List orphaned section instances — content exists in the DB but not on any page
router.get('/orphaned-sections', requireAuth, async (req, res) => {
  try {
    // Gather all instance IDs across all pages
    const { rows: pageRows } = await db.query('SELECT section_order FROM pages');
    const inUse = new Set();
    for (const p of pageRows) {
      const arr = Array.isArray(p.section_order) ? p.section_order : [];
      arr.forEach(s => inUse.add(s));
    }

    // Find all content keys that look like instance-scoped fields
    const { rows: contentRows } = await db.query(
      "SELECT section_key, content FROM content WHERE section_key NOT LIKE 'site.%'"
    );

    // Group content by instance ID prefix and find orphans
    const instanceContent = {};
    for (const row of contentRows) {
      // Extract instance ID: everything before the first `.`
      // But credentials uses `{iid}_oxford.field` and `{iid}_stat.field`
      const key = row.section_key;
      const dotIdx = key.indexOf('.');
      if (dotIdx === -1) continue;
      let prefix = key.slice(0, dotIdx);

      // For credentials sub-prefixes like `credentials__2_oxford`, derive the instance ID
      const oxfordMatch = prefix.match(/^(.+)_oxford$/);
      const statMatch = prefix.match(/^(.+)_stat$/);
      let instanceId = prefix;
      if (oxfordMatch) instanceId = oxfordMatch[1];
      else if (statMatch) instanceId = statMatch[1];

      // Only consider valid instance IDs
      if (!isValidInstance(instanceId)) continue;

      // Skip if this instance is on a page
      if (inUse.has(instanceId)) continue;

      if (!instanceContent[instanceId]) {
        instanceContent[instanceId] = { instanceId, template: baseTemplate(instanceId), fields: {} };
      }
      instanceContent[instanceId].fields[key] = row.content;
    }

    // Build a preview-friendly list
    const orphans = Object.values(instanceContent).map(o => {
      // Find a heading/title field for the preview
      const headingKey = Object.keys(o.fields).find(k =>
        k.endsWith('.heading') || k.endsWith('.title') || k.endsWith('.label')
      );
      const preview = headingKey
        ? o.fields[headingKey].replace(/<[^>]+>/g, '').slice(0, 80)
        : '';
      return { instanceId: o.instanceId, template: o.template, preview };
    });

    res.json({ orphans });
  } catch (err) {
    console.error('Orphaned sections error:', err);
    res.status(500).json({ error: 'Failed to load orphaned sections' });
  }
});

// Get all content for a section prefix
router.get('/:prefix', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT section_key, content FROM content WHERE section_key LIKE $1 ORDER BY section_key',
      [`${req.params.prefix}.%`]
    );
    const fields = {};
    rows.forEach(r => { fields[r.section_key] = r.content; });
    res.json({ fields });
  } catch (err) {
    console.error('Content fetch error:', err);
    res.status(500).json({ error: 'Failed to load content' });
  }
});

// Update content fields
router.put('/', requireAuth, async (req, res) => {
  const { fields } = req.body;

  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    return res.status(400).json({ error: 'No fields provided' });
  }

  try {
    for (const { key, content } of fields) {
      if (!key || typeof content !== 'string') continue;

      const clean = sanitise(content);
      await db.query(
        `UPDATE content SET content = $1, updated_at = NOW(), updated_by = $2
         WHERE section_key = $3`,
        [clean, req.session.user.id, key]
      );

      // Audit log
      await db.query(
        'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
        [req.session.user.id, 'content_update', key, `Updated by ${req.session.user.username}`]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Content update error:', err);
    res.status(500).json({ error: 'Failed to save content' });
  }
});

// Section model: each section on the page is an "instance" of a "template".
// Instance IDs have the form `{template}` for the first/base instance, or
// `{template}__N` (double underscore + integer ≥ 2) for additional copies.
// Content keys are stored per instance: `{instanceId}.field` for most sections.
// Credentials is a special case with two content sub-prefixes:
//   `{instanceId}_oxford.*` and `{instanceId}_stat.*`.
const VALID_TEMPLATES = ['hero','credentials','biography','intervention','approach','insights','casestudy','casestudy2','assessment','filter','contact'];
const MAX_INSTANCE_SUFFIX = 99;

function baseTemplate(instanceId) {
  if (typeof instanceId !== 'string') return null;
  const m = /^([a-z0-9]+)(?:__(\d+))?$/.exec(instanceId);
  if (!m) return null;
  const base = m[1];
  return VALID_TEMPLATES.includes(base) ? base : null;
}

function isValidInstance(instanceId) {
  return baseTemplate(instanceId) !== null;
}

// Content key prefixes owned by a given instance. Most templates use the
// instance ID itself; credentials owns two sub-prefixes.
function contentPrefixes(instanceId) {
  const base = baseTemplate(instanceId);
  if (base === 'credentials') {
    return [`${instanceId}_oxford`, `${instanceId}_stat`];
  }
  return [instanceId];
}

// Source content prefixes to copy from when seeding a new instance of a
// template. Uses the base template's existing keys so duplicates start out
// matching the current page.
function sourcePrefixes(template) {
  if (template === 'credentials') return ['credentials_oxford', 'credentials_stat'];
  return [template];
}

router.put('/order', requireAuth, async (req, res) => {
  const { order, pageSlug } = req.body;

  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'Invalid order array' });
  }
  if (!pageSlug || typeof pageSlug !== 'string') {
    return res.status(400).json({ error: 'Missing pageSlug' });
  }

  const orderSet = new Set(order);
  if (orderSet.size !== order.length || order.some(s => !isValidInstance(s))) {
    return res.status(400).json({ error: 'Order must contain valid instance IDs without duplicates' });
  }

  try {
    const { rowCount } = await db.query(
      `UPDATE pages SET section_order = $1::jsonb, updated_at = NOW(), updated_by = $2
       WHERE slug = $3`,
      [JSON.stringify(order), req.session.user.id, pageSlug]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Page not found' });

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'section_reorder', pageSlug, `Reordered on "${pageSlug}" by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Section order update error:', err);
    res.status(500).json({ error: 'Failed to save section order' });
  }
});

// Toggle section visibility (hide/show)
router.put('/visibility', requireAuth, async (req, res) => {
  const { sectionId, hidden, pageSlug } = req.body;

  if (!isValidInstance(sectionId) || typeof hidden !== 'boolean') {
    return res.status(400).json({ error: 'Invalid section or state' });
  }
  if (!pageSlug || typeof pageSlug !== 'string') {
    return res.status(400).json({ error: 'Missing pageSlug' });
  }

  try {
    const { rows: pageRows } = await db.query(
      'SELECT hidden_sections FROM pages WHERE slug = $1', [pageSlug]
    );
    if (pageRows.length === 0) return res.status(404).json({ error: 'Page not found' });

    let list = pageRows[0].hidden_sections || [];
    if (!Array.isArray(list)) list = [];

    const set = new Set(list.filter(s => isValidInstance(s)));
    if (hidden) set.add(sectionId); else set.delete(sectionId);
    const next = Array.from(set);

    await db.query(
      `UPDATE pages SET hidden_sections = $1::jsonb, updated_at = NOW(), updated_by = $2
       WHERE slug = $3`,
      [JSON.stringify(next), req.session.user.id, pageSlug]
    );

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, hidden ? 'section_hide' : 'section_show', sectionId, `${hidden ? 'Hidden' : 'Shown'} on "${pageSlug}" by ${req.session.user.username}`]
    );

    res.json({ success: true, hidden: next });
  } catch (err) {
    console.error('Visibility update error:', err);
    res.status(500).json({ error: 'Failed to update visibility' });
  }
});

// Helpers for loading/saving page-level JSON arrays from the pages table
async function loadPageArray(slug, column) {
  const { rows } = await db.query(
    `SELECT ${column} FROM pages WHERE slug = $1`, [slug]
  );
  const val = rows[0]?.[column];
  return Array.isArray(val) ? val : [];
}

async function savePageArrays(slug, updates, userId) {
  const sets = [];
  const params = [];
  let idx = 1;
  for (const [col, val] of Object.entries(updates)) {
    sets.push(`${col} = $${idx}::jsonb`);
    params.push(JSON.stringify(val));
    idx++;
  }
  sets.push(`updated_at = NOW()`);
  sets.push(`updated_by = $${idx}`);
  params.push(userId);
  idx++;
  params.push(slug);
  await db.query(
    `UPDATE pages SET ${sets.join(', ')} WHERE slug = $${idx}`,
    params
  );
}

// Delete a section instance. If deleting a BASE instance (no __N suffix),
// also record it in deleted_sections so the auto-merge doesn't resurrect it
// on next boot. Suffixed instances just drop out of the order.
router.delete('/section/:id', requireAuth, async (req, res) => {
  const sectionId = req.params.id;
  const pageSlug = req.body.pageSlug || req.query.pageSlug;

  if (!isValidInstance(sectionId)) {
    return res.status(400).json({ error: 'Invalid section' });
  }
  if (!pageSlug || typeof pageSlug !== 'string') {
    return res.status(400).json({ error: 'Missing pageSlug' });
  }

  try {
    let order = (await loadPageArray(pageSlug, 'section_order')).filter(s => isValidInstance(s) && s !== sectionId);
    let hidden = (await loadPageArray(pageSlug, 'hidden_sections')).filter(s => isValidInstance(s) && s !== sectionId);

    let deleted = (await loadPageArray(pageSlug, 'deleted_sections')).filter(s => VALID_TEMPLATES.includes(s));
    const base = baseTemplate(sectionId);
    if (sectionId === base) {
      if (!deleted.includes(base)) deleted.push(base);
    }

    await savePageArrays(pageSlug, {
      section_order: order,
      hidden_sections: hidden,
      deleted_sections: deleted
    }, req.session.user.id);

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'section_delete', sectionId, `Deleted from "${pageSlug}" by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Section delete error:', err);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// Add a new instance of a template. If the base instance ID is unused on the
// target page (and not in use on any other page), reuse it — that way
// re-adding a previously-deleted section restores its existing content from
// the DB. Otherwise allocate the smallest unused `{template}__N` suffix and
// seed it by copying the base template's current content.
router.post('/section/:template', requireAuth, async (req, res) => {
  const template = req.params.template;
  const pageSlug = req.body.pageSlug;

  if (!VALID_TEMPLATES.includes(template)) {
    return res.status(400).json({ error: 'Invalid template' });
  }
  if (!pageSlug || typeof pageSlug !== 'string') {
    return res.status(400).json({ error: 'Missing pageSlug' });
  }

  try {
    // Gather all instance IDs across ALL pages for global uniqueness
    const { rows: allPageRows } = await db.query('SELECT slug, section_order FROM pages');
    const globalInUse = new Set();
    let pageOrder = [];
    for (const p of allPageRows) {
      const arr = Array.isArray(p.section_order) ? p.section_order : [];
      arr.filter(isValidInstance).forEach(s => globalInUse.add(s));
      if (p.slug === pageSlug) pageOrder = arr.filter(isValidInstance);
    }

    let instanceId;
    if (!globalInUse.has(template)) {
      instanceId = template;
    } else {
      instanceId = null;
      for (let n = 2; n <= MAX_INSTANCE_SUFFIX; n++) {
        const candidate = `${template}__${n}`;
        if (!globalInUse.has(candidate)) { instanceId = candidate; break; }
      }
      if (!instanceId) {
        return res.status(400).json({ error: 'Too many copies of that template' });
      }
    }

    // Seed content for the new instance by copying from base prefixes, but
    // only when the instance is a suffixed duplicate. When reusing the base
    // instance ID, content already lives under those keys.
    if (instanceId !== template) {
      const sources = sourcePrefixes(template);
      const targets = contentPrefixes(instanceId);
      for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        const dst = targets[i];
        const { rows } = await db.query(
          `SELECT section_key, content FROM content WHERE section_key LIKE $1`,
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

    // Append instance to this page's order
    pageOrder.push(instanceId);
    await db.query(
      `UPDATE pages SET section_order = $1::jsonb, updated_at = NOW(), updated_by = $2
       WHERE slug = $3`,
      [JSON.stringify(pageOrder), req.session.user.id, pageSlug]
    );

    // Remove from deleted_sections if we just reused a base ID
    if (instanceId === template) {
      let deleted = (await loadPageArray(pageSlug, 'deleted_sections')).filter(s => VALID_TEMPLATES.includes(s));
      if (deleted.includes(template)) {
        deleted = deleted.filter(s => s !== template);
        await db.query(
          `UPDATE pages SET deleted_sections = $1::jsonb, updated_at = NOW(), updated_by = $2
           WHERE slug = $3`,
          [JSON.stringify(deleted), req.session.user.id, pageSlug]
        );
      }
    }

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'section_add', instanceId, `Added to "${pageSlug}" by ${req.session.user.username}`]
    );

    res.json({ success: true, instanceId });
  } catch (err) {
    console.error('Section add error:', err);
    res.status(500).json({ error: 'Failed to add section' });
  }
});

// Permanently delete an orphaned section's content from the database
router.delete('/orphaned-section/:id', requireAuth, async (req, res) => {
  const instanceId = req.params.id;

  if (!isValidInstance(instanceId)) {
    return res.status(400).json({ error: 'Invalid instance ID' });
  }

  try {
    // Verify it's truly orphaned — not on any page
    const { rows: pageRows } = await db.query('SELECT section_order FROM pages');
    for (const p of pageRows) {
      const arr = Array.isArray(p.section_order) ? p.section_order : [];
      if (arr.includes(instanceId)) {
        return res.status(400).json({ error: 'That section is still on a page' });
      }
    }

    // Delete all content rows for this instance
    const prefixes = contentPrefixes(instanceId);
    let deleted = 0;
    for (const pfx of prefixes) {
      const { rowCount } = await db.query(
        'DELETE FROM content WHERE section_key LIKE $1',
        [`${pfx}.%`]
      );
      deleted += rowCount;
    }

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'section_purge', instanceId, `Permanently deleted ${deleted} content rows for "${instanceId}" by ${req.session.user.username}`]
    );

    res.json({ success: true, deleted });
  } catch (err) {
    console.error('Orphan delete error:', err);
    res.status(500).json({ error: 'Failed to delete section content' });
  }
});

// Reuse an orphaned section instance — add an existing instance ID to a page
router.post('/section-reuse', requireAuth, async (req, res) => {
  const { instanceId, pageSlug } = req.body;

  if (!instanceId || !isValidInstance(instanceId)) {
    return res.status(400).json({ error: 'Invalid instance ID' });
  }
  if (!pageSlug || typeof pageSlug !== 'string') {
    return res.status(400).json({ error: 'Missing pageSlug' });
  }

  try {
    // Check the instance isn't already on any page
    const { rows: allPageRows } = await db.query('SELECT slug, section_order FROM pages');
    for (const p of allPageRows) {
      const arr = Array.isArray(p.section_order) ? p.section_order : [];
      if (arr.includes(instanceId)) {
        return res.status(400).json({ error: 'That section is already on a page' });
      }
    }

    // Verify content actually exists for this instance
    const prefixes = contentPrefixes(instanceId);
    let hasContent = false;
    for (const pfx of prefixes) {
      const { rows } = await db.query(
        'SELECT 1 FROM content WHERE section_key LIKE $1 LIMIT 1',
        [`${pfx}.%`]
      );
      if (rows.length > 0) { hasContent = true; break; }
    }
    if (!hasContent) {
      return res.status(404).json({ error: 'No content found for that section' });
    }

    // Append to the page's section order
    const pageOrder = (await loadPageArray(pageSlug, 'section_order')).filter(isValidInstance);
    pageOrder.push(instanceId);
    await db.query(
      `UPDATE pages SET section_order = $1::jsonb, updated_at = NOW(), updated_by = $2
       WHERE slug = $3`,
      [JSON.stringify(pageOrder), req.session.user.id, pageSlug]
    );

    // Remove from deleted_sections if it's a base instance
    const base = baseTemplate(instanceId);
    if (instanceId === base) {
      let deleted = (await loadPageArray(pageSlug, 'deleted_sections')).filter(s => VALID_TEMPLATES.includes(s));
      if (deleted.includes(base)) {
        deleted = deleted.filter(s => s !== base);
        await db.query(
          `UPDATE pages SET deleted_sections = $1::jsonb, updated_at = NOW(), updated_by = $2
           WHERE slug = $3`,
          [JSON.stringify(deleted), req.session.user.id, pageSlug]
        );
      }
    }

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'section_reuse', instanceId, `Reused on "${pageSlug}" by ${req.session.user.username}`]
    );

    res.json({ success: true, instanceId });
  } catch (err) {
    console.error('Section reuse error:', err);
    res.status(500).json({ error: 'Failed to reuse section' });
  }
});

// Upload image
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

router.put('/image/:key', requireAuth, async (req, res) => {
  const { key } = req.params;
  const { data, mimeType } = req.body;

  if (!data || !mimeType) {
    return res.status(400).json({ error: 'Missing image data or type' });
  }

  if (!ALLOWED_MIME.includes(mimeType)) {
    return res.status(400).json({ error: 'Unsupported image format' });
  }

  const buffer = Buffer.from(data, 'base64');

  if (buffer.length > MAX_SIZE) {
    return res.status(400).json({ error: 'Image too large (max 2MB)' });
  }

  try {
    await db.query(
      `UPDATE images SET data = $1, mime_type = $2, updated_at = NOW(), updated_by = $3
       WHERE image_key = $4`,
      [buffer, mimeType, req.session.user.id, key]
    );

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'image_update', key, `Image "${key}" updated by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Image upload error:', err);
    res.status(500).json({ error: 'Failed to save image' });
  }
});

module.exports = router;
