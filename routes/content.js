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
    return res.status(400).json({ error: 'Image too large (max 4MB)' });
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
