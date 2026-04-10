const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../db/pool');
const defaults = require('../db/defaults');
const themes = require('../db/themes');

const router = express.Router();

// Activity log
router.get('/log', requireAuth, async (req, res) => {
  try {
    let query, params;

    if (req.session.user.role === 'admin') {
      // Admin sees all activity
      query = `SELECT a.action, a.section_key, a.detail, a.created_at,
                      u.username
               FROM audit_log a
               LEFT JOIN users u ON a.user_id = u.id
               ORDER BY a.created_at DESC
               LIMIT 50`;
      params = [];
    } else {
      // Content users see only their own activity
      query = `SELECT a.action, a.section_key, a.detail, a.created_at,
                      u.username
               FROM audit_log a
               LEFT JOIN users u ON a.user_id = u.id
               WHERE a.user_id = $1
               ORDER BY a.created_at DESC
               LIMIT 50`;
      params = [req.session.user.id];
    }

    const { rows } = await db.query(query, params);
    res.json({ log: rows });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Failed to load activity log' });
  }
});

// Reset all content to defaults (admin only)
router.post('/reset', requireAdmin, async (req, res) => {
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
router.post('/backup', requireAuth, async (req, res) => {
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

    const label = req.body.label || new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    await db.query(
      `INSERT INTO backups (label, content_snapshot, images_snapshot, created_by)
       VALUES ($1, $2, $3, $4)`,
      [label, JSON.stringify(contentSnapshot), JSON.stringify(imagesSnapshot), req.session.user.id]
    );

    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [req.session.user.id, 'backup_created', `Backup "${label}" created by ${req.session.user.username}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// List backups
router.get('/backups', requireAuth, async (req, res) => {
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

// Restore backup (admin only)
router.post('/backup/:id/restore', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT content_snapshot, images_snapshot, label FROM backups WHERE id = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    const { content_snapshot, images_snapshot, label } = rows[0];

    // Restore content
    for (const [key, content] of Object.entries(content_snapshot)) {
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
router.put('/theme', requireAuth, async (req, res) => {
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

module.exports = router;
