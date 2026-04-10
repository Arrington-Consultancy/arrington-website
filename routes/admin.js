const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../db/pool');
const defaults = require('../db/defaults');

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

module.exports = router;
