const express = require('express');
const bcrypt = require('bcrypt');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../db/pool');
const defaults = require('../db/defaults');
const themes = require('../db/themes');

const BCRYPT_ROUNDS = 12;

const router = express.Router();

// Reserved slugs that cannot be used as page slugs
const RESERVED_SLUGS = ['login', 'logout', 'health', 'api', 'img', 'js', 'css', 'public', 'main'];

// Valid section templates (matches routes/content.js and server.js)
const VALID_TEMPLATES = ['hero','credentials','biography','intervention','approach','insights','casestudy','casestudy2','assessment','filter','contact'];

// Default sections for a new page
const NEW_PAGE_TEMPLATES = ['hero', 'casestudy', 'contact'];

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
router.get('/log', requireAuth, async (req, res) => {
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

    // Snapshot all pages
    const { rows: pageRows } = await db.query('SELECT slug, title, sort_order, hidden, section_order, hidden_sections, deleted_sections FROM pages ORDER BY sort_order');
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

// Restore backup
router.post('/backup/:id/restore', requireAuth, async (req, res) => {
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
          `INSERT INTO pages (slug, title, sort_order, hidden, section_order, hidden_sections, deleted_sections, updated_by)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
           ON CONFLICT (slug) DO UPDATE SET
             title = EXCLUDED.title,
             sort_order = EXCLUDED.sort_order,
             hidden = EXCLUDED.hidden,
             section_order = EXCLUDED.section_order,
             hidden_sections = EXCLUDED.hidden_sections,
             deleted_sections = EXCLUDED.deleted_sections,
             updated_at = NOW(),
             updated_by = EXCLUDED.updated_by`,
          [p.slug, p.title, p.sort_order, p.hidden || false,
           JSON.stringify(p.section_order || []),
           JSON.stringify(p.hidden_sections || []),
           JSON.stringify(p.deleted_sections || []),
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

// --- Page management (both users) ---

// Create a new page
router.post('/page', requireAuth, async (req, res) => {
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
router.put('/page/:slug', requireAuth, async (req, res) => {
  const { slug } = req.params;
  const { title, hidden } = req.body;

  try {
    const { rows } = await db.query('SELECT * FROM pages WHERE slug = $1', [slug]);
    if (rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    // Cannot hide the main page
    if (slug === 'main' && hidden === true) {
      return res.status(400).json({ error: 'Cannot hide the home page' });
    }

    const updates = [];
    const params = [];
    let idx = 1;

    if (title !== undefined && typeof title === 'string' && title.trim().length > 0) {
      updates.push(`title = $${idx}`);
      params.push(title.trim());
      idx++;
    }
    if (hidden !== undefined && typeof hidden === 'boolean') {
      updates.push(`hidden = $${idx}`);
      params.push(hidden);
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

    await db.query(
      `UPDATE pages SET ${updates.join(', ')} WHERE slug = $${idx}`,
      params
    );

    const detail = title !== undefined ? `Renamed to "${title.trim()}"` : (hidden ? 'Hidden' : 'Shown');
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
router.delete('/page/:slug', requireAuth, async (req, res) => {
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
router.put('/page-order', requireAuth, async (req, res) => {
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

// --- User management (admin only) ---

// List all users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, username, role, created_at FROM users ORDER BY created_at'
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Add a new user
router.post('/user', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!role || !['admin', 'content'].includes(role)) {
    return res.status(400).json({ error: 'Role must be "admin" or "content"' });
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

// Change a user's password
router.put('/user/:id/password', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { password } = req.body;

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const { rows } = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

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

// Delete a user
router.delete('/user/:id', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  // Cannot delete yourself
  if (userId === req.session.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    const { rows } = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

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

module.exports = router;
