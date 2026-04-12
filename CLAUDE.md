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
  seed.js              Idempotent seed (tables, users, content, images, pages).
                       Skips user creation once nat/tom already exist, so
                       redeploys don't need NAT_PASSWORD/TOM_PASSWORD set.
                       Migrates existing site.* content keys into the pages table
                       on first run after the multi-page update.
routes/
  auth.js              POST /login (rate-limited), POST /logout
  content.js           GET/PUT content, PUT image, PUT section order,
                       PUT visibility, POST /section/:template (add/duplicate),
                       DELETE /section/:id. Holds VALID_TEMPLATES, the
                       baseTemplate / isValidInstance / contentPrefixes
                       helpers, and the instance ID allocator.
  admin.js             Activity log, reset, backup, restore, theme,
                       page CRUD (create, rename, hide, delete, reorder),
                       user CRUD (scoped by caller role), permissions
                       matrix API (GET/PUT), page access API (GET/PUT,
                       plus by-slug convenience route)
middleware/
  auth.js              requireAuth, requireAdmin (legacy convenience)
  permissions.js       Role-based capability engine. In-memory cache
                       loaded from role_permissions table at startup.
                       Exports: loadPermissions, hasCapability,
                       requireCapability (middleware factory),
                       getCapabilitiesForRole, getPermissionsMatrix,
                       refreshPermissions. Falls back to hardcoded
                       defaults if the table is empty or missing.
views/
  index.ejs            Main page. Big inline <style> and <script> blocks
                       carry nonce="<%= nonce %>" so they pass the strict
                       CSP. Sections rendered via a loop over sectionOrder
                       that yields _iid + _tpl for each instance. Inline
                       script also reassembles the obfuscated contact
                       email/phone before any other anchor handling.
  login.ejs            Login page, also nonced, follows active theme
  partials/
    edit-modal.ejs         Content editing modal
    add-section-modal.ejs  Template picker grid (11 cards with SVG thumbnails)
    admin-menu.ejs         Gear-icon panel with collapsible sections
                           (Appearance, Page, Content, Users, System)
                           and a slide-over detail view for sub-panels
                           (Users, Backups, Activity log, Permissions
                           matrix, Page access, CSP violations).
                           All buttons gated on the user's capabilities
                           object passed from renderPage.
public/
  css/admin.css        All CMS UI styles. Also holds helper classes
                       (cms-hidden, cms-inline-form, cms-btn-danger-solid,
                       cms-modal-loading, cms-log-empty, cms-backup-entry,
                       cms-backup-restore, etc.) that replaced the inline
                       style="" attributes we removed for strict CSP. Adds
                       hide/delete button styles, .cms-section-hidden dim
                       state, the wide template-picker modal grid, and
                       the cms-section-just-added flash keyframe.
  js/admin.js          Client-side editing, image upload, theme switch
                       (swatch backgrounds set via JS from data-swatch),
                       backup logic, section reorder, hide/delete/add
                       handlers, CSP violations reader. Implements the
                       detail view system (openDetail/closeDetail) and
                       collapsible section toggles for the admin panel.
                       Includes permissions matrix and page access UIs.
                       Sets history.scrollRestoration = 'manual' so
                       add-section reload-then-scroll isn't fought by
                       the browser.
  img/templates/       11 SVG wireframe thumbnails (one per template)
                       used by the add-section modal.
```

## Database tables

- **users** — seeded admin (`nat`) and content (`tom`) accounts. Role CHECK constraint allows `admin`, `content`, `client`.
- **content** — key-value store for all editable text (**71 keys** baseline) + `site.theme`. When a section is duplicated the new instance's content keys are seeded into this same table under the new instance ID's prefix. (The legacy `site.section_order`, `site.hidden_sections`, `site.deleted_sections` keys remain in the DB but are no longer read; that state now lives in the pages table.)
- **pages** — multi-page support. Each row is a page with `slug` (unique), `title`, `sort_order`, `hidden` (boolean), and per-page JSONB arrays: `section_order`, `hidden_sections`, `deleted_sections`. The main page has slug `main` and cannot be hidden or deleted.
- **role_permissions** — stores the permissions matrix. Composite PK `(role, capability)`, boolean `enabled`. 11 capabilities x 3 roles = 33 rows. Seeded with defaults on first run (`ON CONFLICT DO NOTHING`).
- **page_access** — per-user page visibility for client users. Composite PK `(page_id, user_id)` with CASCADE deletes. If a page has any `page_access` rows it is automatically restricted: invisible to public visitors and to clients not in the list. Admin and content always see all pages.
- **images** — binary image storage (logo, headshot, oxford badge) for persistence across Railway redeploys
- **backups** — full snapshots of content + images (JSONB)
- **session** — express-session store (connect-pg-simple)
- **audit_log** — all user actions (login, logout, edits, theme changes, backups, restores, section reorders, permission changes, page access changes)

## Users and permissions

Three roles in descending privilege: **admin > content > client**.

| Username | Role | Default capabilities |
|----------|------|---------------------|
| nat | admin | All 11 capabilities (edit content, manage sections, manage pages, backups, theme, activity log, manage users, page access, reset content, CSP violations, permissions matrix) |
| tom | content | Same as admin except: no reset content, no CSP violations, no permissions matrix. Can manage users but scoped to client-level accounts only. |
| (created via CMS) | client | No editing capabilities. Sees the public site plus any pages granted via page access. Gets a minimal "Log out" button instead of the admin panel. |

### Capabilities (11 total)

`edit_content`, `manage_sections`, `manage_pages`, `manage_backups`, `manage_theme`, `view_activity`, `manage_users`, `manage_page_access`, `reset_content`, `view_csp`, `manage_permissions`

Stored in the `role_permissions` table. Admin can reconfigure via the Permissions panel (except `manage_permissions` which is locked to admin). The permissions engine (`middleware/permissions.js`) caches the matrix in memory and falls back to hardcoded defaults if the table is empty.

### Route guards

All API routes use `requireCapability('capability_name')` instead of the old `requireAuth`/`requireAdmin`. The `manage_users` capability has scoped behaviour: content users can only see/create/edit/delete client users. Admin can manage all levels.

### User seeding

Users are seeded on first run only — `db/seed.js` checks whether `nat` and `tom` already exist and skips creation if they do. First-time seed reads `NAT_PASSWORD` and `TOM_PASSWORD` from the environment; subsequent deploys don't need these env vars set. No registration route exists. Additional users (including client accounts) are created via the Manage Users panel.

**Password rotation:** delete the user rows in the Railway Postgres console, set fresh `NAT_PASSWORD` / `TOM_PASSWORD` env vars on the service, redeploy once, then remove the env vars again.

## Page access

Pages can be restricted to specific client users. When a page has any `page_access` entries:
- **Public visitors** cannot see or visit it (404)
- **Clients without access** cannot see or visit it (404)
- **Clients with access** see it in the nav and can visit it
- **Admin and content users** always see all pages

Page access is managed via the "Page access" button in the admin panel's Page section. It shows a checklist of all client users; ticking a user grants them access to the current page. The API uses `GET/PUT /api/admin/page-access/:pageId` (plus a `by-slug` convenience route for the client JS).

A page does not need to be hidden to be restricted. Any page with at least one `page_access` row is automatically invisible to the public and to unauthorised clients.

## Content editing

- Each section has an edit button (pencil icon, top-right, visible on hover when logged in)
- Clicking opens a modal with all editable fields for that section
- Content sanitised on save via `sanitize-html` (only `<strong>`, `<p>`, `<br>`, `<em>` allowed)
- Credentials section split into two independently editable blocks (Oxford + statistic)

## Multi-page support

The site supports multiple pages. Each page is a row in the `pages` table with its own slug, title, sort order, visibility, and section arrays.

- **URL scheme:** `/` for the main page (slug `main`), `/{slug}` for additional pages
- **Page menu:** a subtle fixed bar below the nav, only rendered when 2+ pages exist. Links styled with theme CSS variables; active page highlighted with accent colour. Hidden pages shown dimmed (italic, low opacity) for users with edit capability only. Restricted pages (those with `page_access` entries) are invisible to public visitors and unauthorised clients.
- **Instance IDs are globally unique across all pages.** A new page's hero becomes `hero__2` if `hero` is already on the main page. The content table doesn't change; each page just owns a different subset of instance IDs.
- **Default new page layout:** hero + case study (timeline) + contact
- **Page controls** (in admin panel, users with `manage_pages`): Add page, Rename page, Hide/Show page (not main), Delete page (not main, with confirmation), Page access (assign client users)
- **Slug generation:** auto-generated from title (lowercase, hyphens). Reserved slugs rejected: `login`, `logout`, `health`, `api`, `img`, `js`, `css`, `public`, `main`
- **Main page protection:** cannot be hidden or deleted (server enforces)
- **Backups:** pages snapshot stored under the `__pages__` key inside `content_snapshot`. Old backups without `__pages__` restore content only, leaving pages untouched.
- **Section API calls** now include `pageSlug` in the request body so operations target the correct page's arrays in the pages table.

## Section management (reorder, hide, delete, add, duplicate)

Each editable section has five hover-revealed buttons in this visual order, left to right: ✎ edit · 👁 hide · ▲ up · ▼ down · ✕ delete. Edit and the up/down arrows behave as before; the rest are described below.

### Reorder
- ▲ / ▼ swap the section with its neighbour in the DOM and save the order via `PUT /api/content/order`
- Order stored as a JSON array in the `site.section_order` content key
- Rendered server-side (EJS loop over `sectionOrder`) so all visitors see the saved layout
- **11 base templates:** hero, credentials, biography, intervention, approach, insights, casestudy, casestudy2, assessment, filter, contact
- Server auto-inserts any newly-added default templates at their natural default-order position on existing deployments without a DB update — but only when no instance of that template is already on the page
- Nav and footer are fixed (not movable)
- Credentials two-column blocks move as one unit (single `<section>`)
- First non-hero section gets extra top padding (`20rem` desktop, `8rem` mobile) to clear the fixed nav
- Viewport scrolls to follow the moved section after each swap
- `updateMoveButtons` only toggles the up/down buttons — the hide/delete buttons stay live at the page ends

### Hide / show (eye)
- Toggling the eye writes the instance ID into the `site.hidden_sections` JSON array via `PUT /api/content/visibility`
- Public visitors never see hidden sections (filtered out of `sectionOrder` server-side before render)
- Logged-in users still see them, dimmed to 0.35 opacity with a "Hidden from public" badge in the top-left, so they can unhide
- The eye button has a `cms-hide-btn-on` state when the section is currently hidden

### Delete (cross)
- Confirms with `window.confirm`, then `DELETE /api/content/section/:id`
- Removes the instance from `site.section_order`
- If the deleted instance is a **base** instance (no `__N` suffix), it is also added to `site.deleted_sections` so the auto-merge-new-defaults logic doesn't resurrect it on the next boot. Suffixed duplicate instances just disappear from the order
- Content rows stay in the DB — they can be brought back via "Reset to defaults" in the admin panel, or by re-adding the same template (which restores the base instance ID's existing content)

### Add section (template picker)
- "Add section" button in the admin menu opens a wide modal showing all 11 templates with SVG wireframe thumbnails (in `public/img/templates/`), a serif label, and a one-line blurb
- All 11 templates are always selectable — duplicates are explicitly allowed
- One click → `POST /api/content/section/:template`, the server allocates an instance ID (see model below), seeds content for it, appends to `section_order`, returns `{ instanceId }`
- Client stores the new instance ID in `sessionStorage.cmsJustAdded` and reloads
- After reload, admin.js scrolls to the new section and adds the `cms-section-just-added` class which runs a 1.4s orange flash animation
- `history.scrollRestoration = 'manual'` is set at the top of admin.js so the browser doesn't snap the scroll position back to where the user was before the click — that bug only showed up on prod (where the page loads slowly enough that the browser's restore fired after admin.js's scroll)

### Duplicate sections (instance/template model)
- A section on the page is an **instance** of a **template**. The 11 base template names live in `VALID_TEMPLATES` in both `routes/content.js` and `server.js`.
- Instance IDs have the form `{template}` (the first/base instance) or `{template}__N` for additional copies, where `N` is an integer ≥ 2 separated by a **double** underscore (so `casestudy2` the template doesn't collide with `casestudy__2` the duplicate).
- Validation regex: `^([a-z0-9]+)(?:__(\d+))?$`. Helpers `baseTemplate(id)` and `isValidInstance(id)` live in `routes/content.js`; `server.js` carries its own copies for the render path.
- `site.section_order` stores instance IDs, not template names. Existing prod data with `["hero","credentials",...]` still works because base instance ID == template name.
- Content keys are scoped per instance: `{instanceId}.field` for most templates. **Credentials is the special case** with two sub-prefixes per instance: `{instanceId}_oxford.*` and `{instanceId}_stat.*`. The helper `contentPrefixes(instanceId)` returns the right list.
- The EJS view loop yields `_iid` (instance ID) and `_tpl` (template). Each section block declares `<% const _k = _iid; %>` (and additionally `_kOx` / `_kSt` for credentials) and looks up content via `content[_k + '.field']`. All `data-section[-id]` attributes use `_iid` so reorder/hide/delete operate on the right instance. The instance → template map is built in `server.js` and passed to the view as `instanceTemplates`.
- The EJS partial `views/partials/add-section-modal.ejs` keeps the template metadata (id, label, blurb) and renders the picker grid.

### Add-section instance allocation
When the user clicks a template card, the server picks the smallest unused instance ID, with a deliberate priority:
1. If the base instance ID (e.g. `hero`) is **not** in `section_order`, reuse it. This means re-adding a previously-deleted section restores the original content from the DB. If the base ID was in `deleted_sections`, it is also removed from there.
2. Otherwise, allocate the smallest unused `{template}__N` for `N` ∈ [2, 99], copy the base template's current content rows into the new instance's prefixes (handles credentials' two sub-prefixes), and append it to the order.
3. Cap at `__99` — beyond that the POST returns 400.

### admin.js label normalisation
`fieldLabels` and `sectionTitles` in `public/js/admin.js` are keyed by the base template / template prefix (e.g. `hero.heading`, `credentials_oxford`). For duplicate instances, `normalizeKey()` strips `__N` from the instance ID or content key before lookup, so `hero__2.heading` falls back to the `hero.heading` label, and the edit modal title for `credentials__2` resolves to "Credentials".

## Anti-harvest contact protection

The Contact section's email address and phone number are obfuscated server-side so naive scrapers can't pull them out of the rendered HTML.

- Stored values (`contact.email`, `contact.phone`) are still edited normally in the CMS — only the rendered HTML is munged
- Email: split at the `@` into `data-u` and `data-d` attributes on the anchor; rendered text is `tom <span aria-hidden>[at]</span> arringtonconsultancy.com` with `href="#"`
- Phone: split into roughly equal halves both for display (with an invisible `<span aria-hidden>` containing a zero-width space between them, so the digit run is interrupted in source) and as `data-pa` / `data-pb` attributes for the `tel:` URL; the visible text still reads as the original phone number to a human
- A small block at the top of the existing nonced inline `<script>` in `views/index.ejs` reassembles the real `mailto:` and `tel:` `href`s and replaces the email text with the real address. It runs **before** the smooth-scroll handler attaches so the placeholder `href="#"` anchors don't get caught by `a[href^="#"]`
- Verified against four common harvest regexes (full email, `+44…`, `0xxxx xxxxxx`, 10+ digit run) — zero matches in the anon HTML
- Defends against scrapers that fetch HTML and regex-scan. A determined scraper running a headless browser will still get the values after JS runs — if junk persists, next steps would be a contact form or a click-to-reveal pattern

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

- Users with `manage_backups` capability (admin and content by default) can create content snapshots (all text + all images)
- View backups list shows date, user, and restore button
- Any user with the capability can restore from any backup (replaces all current content and images)

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
- **CSP violations panel** (gated on `view_csp` capability, admin by default) — captures `securitypolicyviolation` events fired from page load onwards via a nonced inline script in `<head>`, surfaced in the admin menu's System section. Use this to diagnose any CSP issue without opening browser devtools.

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
- **Deploy:** `railway up` from project root. Auto-deploy on push to `main` is configured but unreliable — always run `railway up` after pushing to ensure the deploy goes out
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
