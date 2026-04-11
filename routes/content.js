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
  const { order } = req.body;

  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'Invalid order array' });
  }

  const orderSet = new Set(order);
  if (orderSet.size !== order.length || order.some(s => !isValidInstance(s))) {
    return res.status(400).json({ error: 'Order must contain valid instance IDs without duplicates' });
  }

  try {
    await db.query(
      `UPDATE content SET content = $1, updated_at = NOW(), updated_by = $2
       WHERE section_key = 'site.section_order'`,
      [JSON.stringify(order), req.session.user.id]
    );

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'section_reorder', 'site.section_order', `Reordered by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Section order update error:', err);
    res.status(500).json({ error: 'Failed to save section order' });
  }
});

// Toggle section visibility (hide/show)
router.put('/visibility', requireAuth, async (req, res) => {
  const { sectionId, hidden } = req.body;

  if (!isValidInstance(sectionId) || typeof hidden !== 'boolean') {
    return res.status(400).json({ error: 'Invalid section or state' });
  }

  try {
    const { rows } = await db.query(
      `SELECT content FROM content WHERE section_key = 'site.hidden_sections'`
    );
    let list = [];
    try { list = JSON.parse(rows[0]?.content || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];

    const set = new Set(list.filter(s => isValidInstance(s)));
    if (hidden) set.add(sectionId); else set.delete(sectionId);
    const next = Array.from(set);

    await db.query(
      `UPDATE content SET content = $1, updated_at = NOW(), updated_by = $2
       WHERE section_key = 'site.hidden_sections'`,
      [JSON.stringify(next), req.session.user.id]
    );

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, hidden ? 'section_hide' : 'section_show', sectionId, `${hidden ? 'Hidden' : 'Shown'} by ${req.session.user.username}`]
    );

    res.json({ success: true, hidden: next });
  } catch (err) {
    console.error('Visibility update error:', err);
    res.status(500).json({ error: 'Failed to update visibility' });
  }
});

// Helpers for loading/saving the three site-level JSON arrays
async function loadJsonArray(key) {
  const { rows } = await db.query(
    `SELECT content FROM content WHERE section_key = $1`, [key]
  );
  try {
    const parsed = JSON.parse(rows[0]?.content || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

async function saveJsonArray(key, value, userId) {
  await db.query(
    `UPDATE content SET content = $1, updated_at = NOW(), updated_by = $2
     WHERE section_key = $3`,
    [JSON.stringify(value), userId, key]
  );
}

// Delete a section instance. If deleting a BASE instance (no __N suffix),
// also record it in deleted_sections so the auto-merge doesn't resurrect it
// on next boot. Suffixed instances just drop out of the order.
router.delete('/section/:id', requireAuth, async (req, res) => {
  const sectionId = req.params.id;

  if (!isValidInstance(sectionId)) {
    return res.status(400).json({ error: 'Invalid section' });
  }

  try {
    let order = (await loadJsonArray('site.section_order')).filter(s => isValidInstance(s) && s !== sectionId);
    let hidden = (await loadJsonArray('site.hidden_sections')).filter(s => isValidInstance(s) && s !== sectionId);

    let deleted = (await loadJsonArray('site.deleted_sections')).filter(s => VALID_TEMPLATES.includes(s));
    const base = baseTemplate(sectionId);
    if (sectionId === base) {
      // Only base instances go into deleted_sections (affects auto-merge).
      if (!deleted.includes(base)) deleted.push(base);
    }

    await saveJsonArray('site.section_order', order, req.session.user.id);
    await saveJsonArray('site.hidden_sections', hidden, req.session.user.id);
    await saveJsonArray('site.deleted_sections', deleted, req.session.user.id);

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'section_delete', sectionId, `Deleted by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Section delete error:', err);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// Add a new instance of a template. If the base instance ID is unused (i.e.
// the section was never created or has been deleted), reuse it — that way
// re-adding a previously-deleted section restores its existing content from
// the DB. Otherwise allocate the smallest unused `{template}__N` suffix and
// seed it by copying the base template's current content.
router.post('/section/:template', requireAuth, async (req, res) => {
  const template = req.params.template;

  if (!VALID_TEMPLATES.includes(template)) {
    return res.status(400).json({ error: 'Invalid template' });
  }

  try {
    let order = (await loadJsonArray('site.section_order')).filter(isValidInstance);
    const inUse = new Set(order);

    let instanceId;
    if (!inUse.has(template)) {
      instanceId = template;
    } else {
      instanceId = null;
      for (let n = 2; n <= MAX_INSTANCE_SUFFIX; n++) {
        const candidate = `${template}__${n}`;
        if (!inUse.has(candidate)) { instanceId = candidate; break; }
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
          const suffix = row.section_key.slice(src.length); // starts with `.`
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

    // Append instance to order
    order.push(instanceId);
    await saveJsonArray('site.section_order', order, req.session.user.id);

    // Remove from deleted_sections if we just reused a base ID
    if (instanceId === template) {
      let deleted = (await loadJsonArray('site.deleted_sections')).filter(s => VALID_TEMPLATES.includes(s));
      if (deleted.includes(template)) {
        deleted = deleted.filter(s => s !== template);
        await saveJsonArray('site.deleted_sections', deleted, req.session.user.id);
      }
    }

    await db.query(
      'INSERT INTO audit_log (user_id, action, section_key, detail) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, 'section_add', instanceId, `Added by ${req.session.user.username}`]
    );

    res.json({ success: true, instanceId });
  } catch (err) {
    console.error('Section add error:', err);
    res.status(500).json({ error: 'Failed to add section' });
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
