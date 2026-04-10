const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../db/pool');

const router = express.Router();

// Rate limit login attempts: 5 per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false
});

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login', { error: 'Username and password required.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, username, password_hash, role FROM users WHERE username = $1',
      [username.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.render('login', { error: 'Invalid credentials.' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.render('login', { error: 'Invalid credentials.' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    // Log the login
    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [user.id, 'login', `${user.username} logged in`]
    );

    res.redirect('/');
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: 'Something went wrong. Please try again.' });
  }
});

router.post('/logout', (req, res) => {
  const userId = req.session.user?.id;
  const username = req.session.user?.username;

  req.session.destroy(async (err) => {
    if (err) console.error('Logout error:', err);

    // Log the logout
    if (userId) {
      try {
        await db.query(
          'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
          [userId, 'logout', `${username} logged out`]
        );
      } catch (e) {
        // Non-critical, don't block logout
      }
    }

    res.redirect('/');
  });
});

module.exports = router;
