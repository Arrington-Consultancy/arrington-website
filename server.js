const express = require('express');
const path = require('path');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');
const db = require('./db/pool');
const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';

// Trust Railway's proxy (required for rate limiting and secure cookies behind reverse proxy)
app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security headers (relaxed CSP for inline styles/scripts from original site)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));

// Cookie parsing (required by csrf-csrf)
app.use(cookieParser());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/headshot.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'headshot.png'));
});
app.get('/logo.avif', (req, res) => {
  res.sendFile(path.join(__dirname, 'logo.avif'));
});

// Sessions
app.use(session({
  store: new PgSession({
    pool: db.pool,
    tableName: 'session',
    createTableIfMissing: false
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax'
  }
}));

// CSRF protection
const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  cookieName: '_csrf',
  cookieOptions: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax'
  },
  getTokenFromRequest: (req) => {
    return req.headers['x-csrf-token'] || req.body._csrf;
  }
});

// Apply CSRF to all non-GET routes
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return next();
  }
  doubleCsrfProtection(req, res, next);
});

// Make CSRF token available to all views
app.use((req, res, next) => {
  res.locals.csrfToken = generateToken(req, res);
  res.locals.user = req.session.user || null;
  next();
});

// Routes
app.use(authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/admin', adminRoutes);

// Serve v1.html as static
app.get('/v1.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'v1.html'));
});

// Main page
app.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT section_key, content FROM content');
    const content = {};
    rows.forEach(r => { content[r.section_key] = r.content; });
    res.render('index', { content });
  } catch (err) {
    console.error('Error loading content:', err);
    res.status(500).send('Server error');
  }
});

app.listen(PORT, () => {
  console.log(`Arrington CMS running on port ${PORT}`);
});
