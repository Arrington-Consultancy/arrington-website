# Arrington Business Consultancy Prototype

## What this is

Single-page website for Arrington Business Consultancy (Tom Arrington), with a CMS backend for content editing. Express.js + PostgreSQL, deployed to Railway, fronted by Railway's Fastly edge.

## Live URLs

- **Primary:** https://www.arringtonconsultancy.com
- **Apex:** https://arringtonconsultancy.com (A records point at Fastly anycast `151.101.2.15` / `151.101.66.15` — Wix doesn't support ANAME on Tom's plan, so this is the workaround)
- **Railway-generated:** https://arrington-prototype-production.up.railway.app (still live, handy for smoke-testing without DNS)
- **Login:** append `/login` to any of the above
- **V1 (preserved, no public link):** `/v1.html` (warm palette, "We" voice, Outward Mindset approach — served with a per-route relaxed CSP because it's a static page that predates the nonce setup)

## Tech stack

- **Server:** Express.js with EJS templating
- **Database:** PostgreSQL (Railway addon) for content, images, sessions, backups, and audit log
- **Auth:** bcrypt (cost 12) + express-session + connect-pg-simple
- **Security:** helmet (strict CSP with per-request nonces), HSTS, app-level HTTPS redirect, express-rate-limit (both login and authed writes), csrf-csrf (double-submit), cookie-parser, sanitize-html
- **Logging:** morgan (combined in prod, dev format locally, skips `/img/*`)
- **Fonts:** Google Fonts (DM Sans, DM Serif Display)
- **No build step**

## Architecture

```
server.js              Express entry point. HTTPS redirect, nonce middleware,
                       helmet + strict CSP, rate limits, CSRF, 404 + error
                       handlers, process-level exception handlers, /health
db/
  pool.js              PostgreSQL connection pool (DATABASE_URL)
  schema.sql           Table definitions (idempotent CREATE IF NOT EXISTS)
  defaults.js          Original content values (used by seed + reset)
  themes.js            5 colour themes (dark, oxford, light, slate, ember)
  seed.js              Idempotent seed (tables, users, content, images).
                       Skips user creation once nat/tom already exist, so
                       redeploys don't need NAT_PASSWORD/TOM_PASSWORD set
routes/
  auth.js              POST /login (rate-limited), POST /logout
  content.js           GET/PUT content, PUT image, PUT section order
                       (VALID_SECTIONS includes intervention)
  admin.js             Activity log, reset, backup, restore, theme
middleware/
  auth.js              requireAuth, requireAdmin
views/
  index.ejs            Main page. Big inline <style> and <script> blocks
                       carry nonce="<%= nonce %>" so they pass the strict
                       CSP. Sections rendered via a loop over sectionOrder.
  login.ejs            Login page, also nonced, follows active theme
  partials/
    edit-modal.ejs     Content editing modal
    admin-menu.ejs     Gear-icon panel (theme swatches, backups, log,
                       CSP violations panel for admins, logout)
public/
  css/admin.css        All CMS UI styles. Also holds helper classes
                       (cms-hidden, cms-inline-form, cms-btn-danger-solid,
                       cms-modal-loading, cms-log-empty, cms-backup-entry,
                       cms-backup-restore, etc.) that replaced the inline
                       style="" attributes we removed for strict CSP.
  js/admin.js          Client-side editing, image upload, theme switch
                       (swatch backgrounds set via JS from data-swatch),
                       backup logic, section reorder, CSP violations
                       reader
```

## Database tables

- **users** — seeded admin (`nat`) and content (`tom`) accounts
- **content** — key-value store for all editable text (**69 keys** after the Intervention section was added) + `site.theme` + `site.section_order`
- **images** — binary image storage (logo, headshot, oxford badge) for persistence across Railway redeploys
- **backups** — full snapshots of content + images (JSONB)
- **session** — express-session store (connect-pg-simple)
- **audit_log** — all user actions (login, logout, edits, theme changes, backups, restores, section reorders)

## Users

| Username | Role | Capabilities |
|----------|------|-------------|
| nat | admin | Edit content, change images, change theme, view all activity, backup, restore, reset to defaults, view CSP violations panel |
| tom | content | Edit content, change images, change theme, view own activity, backup |

Users are seeded on first run only — `db/seed.js` checks whether `nat` and `tom` already exist and skips creation if they do. First-time seed reads `NAT_PASSWORD` and `TOM_PASSWORD` from the environment; subsequent deploys don't need these env vars set. No registration route exists.

**Password rotation:** delete the user rows in the Railway Postgres console, set fresh `NAT_PASSWORD` / `TOM_PASSWORD` env vars on the service, redeploy once, then remove the env vars again.

## Content editing

- Each section has an edit button (pencil icon, top-right, visible on hover when logged in)
- Clicking opens a modal with all editable fields for that section
- Content sanitised on save via `sanitize-html` (only `<strong>`, `<p>`, `<br>`, `<em>` allowed)
- Credentials section split into two independently editable blocks (Oxford + statistic)

## Section reordering

- Logged-in users see up/down arrow buttons (▲ ▼) on hover, next to the edit pencil
- Clicking swaps the section with its neighbour in the DOM and saves the order via `PUT /api/content/order`
- Order stored as JSON array in the `site.section_order` content key
- Rendered server-side (EJS loop over `sectionOrder`) so all visitors see the saved layout
- **11 movable sections:** hero, credentials, biography, **intervention**, approach, insights, casestudy, casestudy2, assessment, filter, contact
- Server auto-inserts any newly-added default sections at their natural default-order position (not just appended to the end), so additions land in the right place on existing deployments without a DB update
- Nav and footer are fixed (not movable)
- Credentials two-column blocks move as one unit (single `<section>`)
- First non-hero section gets extra top padding (`20rem` desktop, `8rem` mobile) to clear the fixed nav
- Viewport scrolls to follow the moved section after each swap

## Case studies

Two case studies with distinct layouts:
- **Orca Marine** (`casestudy`) — timeline/phases layout (three labelled phases: mess, steady hand, result)
- **The Tristan Story** (`casestudy2`) — editorial layout (serif pull-quote intro, body narrative, highlighted outcome block with accent border)

Both are fully editable via the CMS and reorderable like all other sections.

## The Intervention section

Added between Biography and Approach. Simple centred block (heading + body paragraph), styled to mirror the `.filter` section. Two editable fields: `intervention.heading` and `intervention.subtext`. Both allow the standard sanitised HTML tags (`<strong>` used in the default copy).

## Image management

- Logo, headshot, and Oxford badge are stored as binary in PostgreSQL
- Served via `/img/:key` routes (no filesystem dependency, survives Railway redeploys)
- Image upload buttons appear on hover when logged in
- Aspect ratio validation: logo ~2:1 landscape, headshot 3:4 portrait, oxford ~4:3 landscape
- Maximum upload size: 2MB (enforced at the route level and surfaced as a 2MB error message)
- Images served with `Cache-Control: no-cache` so uploads appear immediately on reload

## Colour themes

5 themes available via swatches in the admin panel:
- **Dark** — dark greys, burnt orange accent (default)
- **Oxford Blue** — deep navy, gold accent
- **Light** — cream/white backgrounds, dark text
- **Slate** — blue-grey tones, teal accent
- **Ember** — warm browns, red-orange accent

Active theme stored in DB, applied via CSS variables. Affects main site and login page.

## Backups

- Both users can create content snapshots (all text + all images)
- View backups list shows date, user, and restore button
- Admin can restore from any backup (replaces all current content and images)

## Security posture (hardened 2026-04-11)

- **Strict CSP** with per-request nonces. Inline `<style>` and `<script>` blocks in `index.ejs` and `login.ejs` carry `nonce="<%= nonce %>"`. No `'unsafe-inline'` for scripts or styles. `v1.html` has a per-route CSP override that still allows `'unsafe-inline'` because it's a legacy static page.
- **HSTS** (`max-age=31536000; includeSubDomains; preload`) in production
- **App-level HTTPS redirect** via `x-forwarded-proto` check (belt-and-braces on top of Railway's TLS termination)
- **Rate limiting:** 5 login attempts per 15 min per IP, 60 authenticated write requests per minute per session on `/api/content` and `/api/admin`
- **CSRF:** `csrf-csrf` double-submit on all non-GET routes, token exposed via `<meta name="csrf-token">` for the client
- **Sessions:** `httpOnly`, `secure` (in prod), `sameSite: lax`, 8-hour maxAge, stored in Postgres via `connect-pg-simple`
- **SESSION_SECRET required in prod** — app refuses to boot with a FATAL error if missing
- **bcrypt cost 12**
- **Parameterised SQL** everywhere — no string concatenation
- **404 handler + central error middleware** — stack traces never leak in prod
- **Process-level handlers** for `unhandledRejection` and `uncaughtException`
- **`/health`** endpoint returns `{"ok":true}` for uptime checks
- **Admin-only CSP violations panel** — captures `securitypolicyviolation` events fired from page load onwards via a nonced inline script in `<head>` (registered only for admin role), surfaced in the admin menu. Use this to diagnose any CSP issue without opening browser devtools.

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
export SESSION_SECRET=dev-secret-local
# Only needed on a fresh DB (first-time seed), never on reboots after:
export NAT_PASSWORD=...
export TOM_PASSWORD=...
npm run dev
```

## Deployment

- **Platform:** Railway (project: arrington-prototype, plan upgraded from Hobby to support two custom domains)
- **Database:** Railway PostgreSQL addon (internal networking only)
- **Required env vars:** `DATABASE_URL` (auto-set by addon), `SESSION_SECRET`, `RAILWAY_ENVIRONMENT` (auto-set)
- **Bootstrap env vars (first boot only):** `NAT_PASSWORD`, `TOM_PASSWORD` — remove from Railway after the first successful deploy seeds the user rows
- **Production detection:** checks for `RAILWAY_ENVIRONMENT` or `NODE_ENV=production`
- **Trust proxy:** enabled (required for rate limiting, secure cookies, and HTTPS redirect behind Railway's reverse proxy)
- **Start command:** `node db/seed.js && node server.js` (seed is idempotent; skips user creation after first run)
- **Deploy:** `railway up` from project root, or push to `main` on GitHub for auto-deploy
- **GitHub:** `github.com/natparnell/arrington-prototype` (private)

## Custom domains

Both `www.arringtonconsultancy.com` and `arringtonconsultancy.com` are bound as custom domains on the `arrington-prototype` service in Railway. DNS lives at Wix. Because Wix doesn't offer ANAME on Tom's plan, the apex uses A records pointing at Fastly's anycast IPs (`151.101.2.15`, `151.101.66.15`) — Railway's edge runs on Fastly, and those IPs are the documented fallback when a registrar lacks ANAME.

DNS records currently in Wix:
- `www` CNAME → `s7k9w403.up.railway.app`
- `_railway-verify.www` TXT → `railway-verify=16d8…bfd49f7a`
- `@` A → `151.101.2.15`
- `@` A → `151.101.66.15`
- `_railway-verify` TXT → `railway-verify=df3f…c60c78547`
- MX, SPF, DKIM, Google site verification — left alone (Tom's email is Google Workspace)

If the apex ever needs to be re-added in Railway, Railway may generate a new internal CNAME target (e.g. `47owmwpk.up.railway.app`), but Tom's DNS doesn't need to change because the A records point at Fastly's edge, which routes by Host header regardless of the internal target name.

## Static files kept for reference

- `index.html` — original static V2 (pre-CMS)
- `v1.html` — original V1 (warm palette, "We" voice), served with a per-route relaxed CSP
- `headshot.png` — original hero photo (now served from DB)
- `logo.avif` — original logo (now served from DB)
- `oxford.png` — original Oxford badge (now served from DB)

## Related

- **Generic template** extracted from this project for Nat's brother Ben: `github.com/natparnell/single-page-cms-template` (public, marked as GitHub template repo, scrubbed of Tom-specific content, ships with a `HANDOVER.md` written for a Claude Code agent). Not a fork and has no upstream link to this repo. Nat has an untracked local copy at `~/west-cms-template/` used as the source for the public template.
