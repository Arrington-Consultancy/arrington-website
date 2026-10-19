const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../db/pool');
const themes = require('../db/themes');
const { shouldAlertOnLogin, sendLoginNotification } = require('../lib/scott/gapNotifier');
const guestVisits = require('../lib/guestVisits');

const router = express.Router();

// A throwaway bcrypt hash (cost 12) computed once at startup. When a login is
// attempted for a username that does not exist we still run a compare against
// this, so the response time is the same whether or not the user exists. This
// removes the timing side-channel that would otherwise allow username
// enumeration. The plaintext is irrelevant and never matches a real password.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 12);

// Record a failed login attempt in the audit log. user_id may be null (unknown
// username). The attempted username is stored (trimmed/capped) for visibility;
// the password is never logged.
async function logFailedLogin(userId, attemptedUsername) {
  try {
    const uname = String(attemptedUsername || '').slice(0, 100);
    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [userId, 'login_failed', `Failed login for "${uname}"`]
    );
  } catch (e) {
    // Non-critical: never let audit logging block the login response.
  }
}

// Rate limit login attempts: 5 per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false
});

// Where a watched guest was heading, in words for the login alert.
function placeFor(nextPath) {
  if (/^\/taxi-demo\/office(\/|$)/.test(nextPath)) return 'the Tidewell taxi office';
  if (/^\/scott(\/|$)/.test(nextPath)) return 'the Scott demonstration (through the site login)';
  return 'the website';
}

function safeNextPath(next) {
  if (typeof next === 'string' && /^\/[a-z0-9][a-z0-9/-]*(?:\?[a-z0-9=&._%-]+)?$/i.test(next)) {
    return next;
  }
  return '/';
}

// The staff login page is never recorded by Microsoft Clarity (fix brief of
// 12/10/2026, item 4): views/partials/clarity-tag.ejs renders nothing when
// noClarity is set. Set here rather than in the view so the Google tag
// include stays exactly as test/googleTag.test.js pins it.
router.use('/login', (req, res, next) => {
  res.locals.noClarity = true;
  next();
});

router.get('/login', async (req, res) => {
  if (req.session.user) {
    return res.redirect(safeNextPath(req.query.next));
  }
  let theme = themes.dark;
  try {
    const { rows } = await db.query("SELECT content FROM content WHERE section_key = 'site.theme'");
    if (rows.length > 0 && themes[rows[0].content]) {
      theme = themes[rows[0].content];
    }
  } catch (e) { /* use default */ }
  res.render('login', { error: null, theme, nextPath: safeNextPath(req.query.next) });
});

async function getActiveTheme() {
  try {
    const { rows } = await db.query("SELECT content FROM content WHERE section_key = 'site.theme'");
    if (rows.length > 0 && themes[rows[0].content]) return themes[rows[0].content];
  } catch (e) { /* fallback */ }
  return themes.dark;
}

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const theme = await getActiveTheme();
  const nextPath = safeNextPath(req.body.next);

  if (!username || !password) {
    return res.render('login', { error: 'Username and password required.', theme, nextPath });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, username, password_hash, role FROM users WHERE username = $1',
      [username.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      // Run a dummy compare so timing does not reveal whether the username
      // exists, then record the failed attempt.
      await bcrypt.compare(password, DUMMY_HASH);
      await logFailedLogin(null, username);
      return res.render('login', { error: 'Invalid credentials.', theme, nextPath });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      await logFailedLogin(user.id, username);
      return res.render('login', { error: 'Invalid credentials.', theme, nextPath });
    }

    // Governance finding G5 (31/08/2026): the session id an anonymous
    // visitor arrives with used to be the session id they held after
    // logging in, which is textbook session fixation. Anyone who could
    // plant a connect.sid value in a browser and then wait for the real
    // user to log in inherited that authenticated session.
    //
    // This is a site-wide weakness that predates the workspace. What the
    // workspace did was make it load-bearing: a fixated session used to
    // get CMS content, and would now get the controlled brain and the
    // irreversible erasure control, because the workspace unlock is a
    // session fact and rides on this cookie.
    //
    // Regenerating issues a new id and discards anything the old session
    // carried, including any workspace unlock, so a fixated cookie is
    // worth nothing the moment a real login happens. The flash data this
    // route needs is re-set below, after the swap.
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

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

    // Tells Tom when a watched guest (SCOTT_LOGIN_ALERT_USERNAMES, see
    // lib/scott/gapNotifier.js) signs in here, which is how a guest reaches
    // the Tidewell taxi office. Not awaited and cannot throw: a mail
    // problem must never slow down or break a login. Tom's own logins are
    // not on the list and send nothing.
    if (shouldAlertOnLogin(user.username)) {
      sendLoginNotification({ username: user.username, place: placeFor(nextPath) })
        .then((r) => { if (!r.sent) console.warn(`Login alert for ${user.username} not sent: ${r.reason}`); })
        .catch((err) => console.error('Login alert failed:', err.message));
      // The login opens their visit, so the first page does not send a
      // second "is in now" email (lib/guestVisits.js).
      guestVisits.note({ username: user.username, kind: 'login', text: `Logged in, heading for ${placeFor(nextPath)}`, alerted: true })
        .catch((err) => console.error('Guest visit note failed:', err.message));
    }

    res.redirect(nextPath);
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: 'Something went wrong. Please try again.', theme, nextPath });
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

    // A watched guest signing out closes their visit, and the summary goes
    // to Tom now rather than after the quiet period (lib/guestVisits.js).
    if (username && guestVisits.isWatched(username)) {
      guestVisits.noteSignOut(username)
        .then(() => guestVisits.sweep())
        .catch((e) => console.error('Guest visit sign out failed:', e.message));
    }

    // A form may name where to land afterwards (the Tidewell office sends
    // its visitors back to the demo's staff portal page). safeNextPath only
    // lets a path on this site through; anything else lands on the home page.
    res.redirect(safeNextPath(req.body && req.body.next));
  });
});

module.exports = router;
module.exports.placeFor = placeFor;
