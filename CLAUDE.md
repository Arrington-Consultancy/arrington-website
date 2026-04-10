# Arrington Business Consultancy Prototype

## What this is

Single-page website for Arrington Business Consultancy (Tom Arrington), with a CMS backend for content editing. Express.js + PostgreSQL, deployed to Railway.

## Live URLs

- **Current:** https://arrington-prototype-production.up.railway.app
- **Login:** https://arrington-prototype-production.up.railway.app/login
- **V1 (preserved, no public link):** /v1.html (warm palette, "We" voice, Outward Mindset approach)

## Tech stack

- **Server:** Express.js with EJS templating
- **Database:** PostgreSQL (Railway addon) for content, images, sessions, backups, and audit log
- **Auth:** bcrypt (cost 12) + express-session + connect-pg-simple
- **Security:** helmet, express-rate-limit, csrf-csrf, cookie-parser, sanitize-html
- **Fonts:** Google Fonts (DM Sans, DM Serif Display)
- **No build step**

## Architecture

```
server.js              Express entry point (trust proxy enabled for Railway)
db/
  pool.js              PostgreSQL connection pool (DATABASE_URL)
  schema.sql           Table definitions (users, session, content, images, backups, audit_log)
  defaults.js          Original content values (used by seed + reset)
  themes.js            5 colour themes (dark, oxford, light, slate, ember)
  seed.js              Idempotent seed script (tables, users, content, images)
routes/
  auth.js              Login/logout (POST /login, POST /logout)
  content.js           Content API (GET/PUT /api/content, PUT /api/content/image/:key)
  admin.js             Admin API (activity log, content reset, theme, backups, restore)
middleware/
  auth.js              requireAuth, requireAdmin middleware
views/
  index.ejs            Main page template (content + theme from DB)
  login.ejs            Login page (follows active theme)
  partials/
    edit-modal.ejs      Content editing modal
    admin-menu.ejs      Admin panel overlay (theme swatches, backups, log, logout)
public/
  css/admin.css         CMS UI styles (edit buttons, modal, admin panel, theme selector)
  js/admin.js           Client-side editing, image upload, theme switching, backup logic
```

## Database tables

- **users** -- seeded admin (nat) and content (tom) accounts
- **content** -- key-value store for all editable text (~61 keys) + site.theme
- **images** -- binary image storage (logo, headshot, oxford badge) for persistence across deploys
- **backups** -- full snapshots of content + images (JSONB)
- **session** -- express-session store (connect-pg-simple)
- **audit_log** -- all user actions (login, logout, edits, theme changes, backups, restores)

## Users

| Username | Role | Capabilities |
|----------|------|-------------|
| nat | admin | Edit content, change images, change theme, view all activity, backup, restore, reset to defaults |
| tom | content | Edit content, change images, change theme, view own activity, backup |

Users are seeded on first run. No registration route exists.

## Content editing

- Each section has an edit button (pencil icon, top-right, visible on hover when logged in)
- Clicking opens a modal with all editable fields for that section
- Content sanitised on save (only `<strong>`, `<p>`, `<br>`, `<em>` allowed)
- Credentials section split into two independently editable blocks (Oxford + statistic)

## Image management

- Logo, headshot, and Oxford badge are stored as binary in PostgreSQL
- Served via `/img/:key` routes (no filesystem dependency, survives Railway redeploys)
- Image upload buttons appear on hover when logged in
- Aspect ratio validation: logo ~2:1 landscape, headshot 3:4 portrait, oxford ~4:3 landscape
- Maximum upload size: 2MB
- Images served with `no-cache` so uploads appear immediately on reload

## Colour themes

5 themes available via swatches in the admin panel:
- **Dark** -- dark greys, burnt orange accent (default)
- **Oxford Blue** -- deep navy, gold accent
- **Light** -- cream/white backgrounds, dark text
- **Slate** -- blue-grey tones, teal accent
- **Ember** -- warm browns, red-orange accent

Active theme stored in DB, applied via CSS variables. Affects main site and login page.

## Backups

- Both users can create content snapshots (all text + all images)
- View backups list shows date, user, and restore button
- Admin can restore from any backup (replaces all current content and images)

## Voice and tone

- **First person** ("I", not "We") throughout
- **British English** only (programme, organise, colour)
- UK business language: VAT, the books, fixed overheads, cash flow, gross margin
- Direct, dry, blunt. No AI cliches (unlocking, empowering, seamless, transformative, journey, potential, synergy)
- No em dashes

## Contact details

- tom@arringtonconsultancy.com
- info@arringtonconsultancy.com (available but not currently on site)
- 01752 477026 (Plymouth number, redirects to mobile)

## Development

```bash
# Requires PostgreSQL running locally or DATABASE_URL set
export DATABASE_URL=postgres://user:pass@localhost:5432/arrington
export SESSION_SECRET=dev-secret
npm run dev
```

## Deployment

- **Platform:** Railway (project: arrington-prototype)
- **Database:** Railway PostgreSQL addon (internal networking only)
- **Environment variables:** DATABASE_URL (auto-set by addon), SESSION_SECRET, RAILWAY_ENVIRONMENT (auto-set)
- **Production detection:** checks for RAILWAY_ENVIRONMENT or NODE_ENV=production
- **Trust proxy:** enabled (required for rate limiting and secure cookies behind Railway's reverse proxy)
- **Start command:** `node db/seed.js && node server.js`
- **Deploy:** `railway up` from project root, or push to GitHub for auto-deploy
- **GitHub:** github.com/natparnell/arrington-prototype (private)

## Static files kept for reference

- `index.html` -- original static V2 (pre-CMS)
- `v1.html` -- original V1 (warm palette, "We" voice)
- `headshot.png` -- original hero photo (now served from DB)
- `logo.avif` -- original logo (now served from DB)
- `oxford.png` -- original Oxford badge (now served from DB)
