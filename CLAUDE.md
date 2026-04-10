# Arrington Business Consultancy Prototype

## What this is

Single-page website for Arrington Business Consultancy (Tom Arrington), with a CMS backend for content editing. Express.js + PostgreSQL, deployed to Railway.

## Live URLs

- **Current:** https://arrington-prototype-production.up.railway.app
- **V1 (preserved, no public link):** /v1.html (warm palette, "We" voice, Outward Mindset approach)

## Tech stack

- **Server:** Express.js with EJS templating
- **Database:** PostgreSQL (Railway addon) for content, sessions, and audit log
- **Auth:** bcrypt (cost 12) + express-session + connect-pg-simple
- **Security:** helmet, express-rate-limit, csrf-csrf, sanitize-html
- **Fonts:** Google Fonts (DM Sans, DM Serif Display)
- **No build step**

## Architecture

```
server.js              Express entry point
db/
  pool.js              PostgreSQL connection pool
  schema.sql           Table definitions
  defaults.js          Original content values (used by seed + reset)
  seed.js              Idempotent seed script (tables, users, content)
routes/
  auth.js              Login/logout (POST /login, POST /logout)
  content.js           Content API (GET/PUT /api/content)
  admin.js             Admin API (activity log, content reset)
middleware/
  auth.js              requireAuth, requireAdmin middleware
views/
  index.ejs            Main page template (content from DB)
  login.ejs            Login page
  partials/
    edit-modal.ejs      Content editing modal
    admin-menu.ejs      Admin panel overlay
public/
  css/admin.css         CMS UI styles
  js/admin.js           Client-side editing logic
```

## Users

| Username | Role | Capabilities |
|----------|------|-------------|
| nat | admin | Edit content, view all activity, reset content to defaults |
| tom | content | Edit content, view own activity |

Users are seeded on first run. No registration route exists.

## Content editing

- Each section has an edit button (visible on hover when logged in)
- Clicking opens a modal with all editable fields for that section
- Content sanitised on save (only `<strong>`, `<p>`, `<br>`, `<em>` allowed)
- The headshot image is not editable through the CMS

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
- **Environment variables:** DATABASE_URL (auto-set by addon), SESSION_SECRET
- **Start command:** `node db/seed.js && node server.js`
- **Deploy command:** `railway up` from project root
- **GitHub:** github.com/natparnell/arrington-prototype (private)

## Files not in CMS

- `index.html` — original static version (kept for reference)
- `v1.html` — V1 version (kept for reference)
- `headshot.png` — hero section photo (not editable via CMS)
