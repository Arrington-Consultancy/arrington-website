# Arrington Business Consultancy Prototype

## HANDED OVER TO TOM (21/07/2026)

This site was handed over to Tom Arrington to self-manage. Read `HANDOVER.md` first: it is the authority on the handover. Read `WORKING-METHOD.md` too: it is short, and it explains how Tom works (one folder per project, ground every context window in it, `CLAUDE.md` as the project memory, `/goodnight` at the end of a session). The `/goodnight` skill itself ships in the repo at `.claude/skills/goodnight/SKILL.md`.

- **Code** now also lives in Tom's GitHub org: `github.com/Arrington-Consultancy/arrington-website` (Nat is an org owner). `natparnell/arrington-prototype` is now an archive copy.
- **Hosting** was transferred via Railway's "Transfer Project" onto Tom's own **Railway Pro** account (service + Postgres + both custom domains moved intact, no downtime, nothing in Wix changed). Nat no longer deploys or controls it, so the `railway up` deploy instructions further down apply to Tom's account, not Nat's.
- **Live content** (all pages, copy, images, permissions) moved with the database. A point-in-time snapshot is committed at `handover/live-content-export-2026-07-21.sql` (idempotent upserts), regenerable via `handover/regenerate-export.js`.
- ~~**Loose end:** the bare `arringtonconsultancy.co.uk` apex still needs adding as a custom domain in Railway.~~ **Resolved.** All four custom domains are bound in Railway with valid certificates. Since commit `00c2b91` (16/08/2026) both `.co.uk` hostnames permanently redirect to the canonical host rather than serving the site (see Custom domains).
- On the same day the 19 agreed copy-review changes were applied to the live site (see Copy review below).

## Governance: start from the current Drive authorities (added 30/08/2026)

Before material Arrington work, read the current controlled Google Drive
authorities, in this order:

1. **AI GOVERNANCE CONSTITUTION - UNIVERSAL MASTER**
2. **AI BRAIN & WORKER CREATION STANDARD - UNIVERSAL MASTER**, including the current Universal AI Operating Standard
3. **START HERE. ARRINGTON CONSULTANCY BRAIN INDEX**
4. The relevant Arrington project, worker or handoff records for the task.
   For Scott demonstration work that means the Scott controlled sources:
   the Master AI Rulebook, worker map, permission map, worker
   specifications and current handoffs.

How they relate: universal governance is the reusable baseline;
Arrington-specific controlled rules govern Arrington work wherever they
are stricter or more specific; and a future universal change must not
silently alter Arrington permissions, authority, brand rules, production
gates or worker scope.

Scott: the Scott AI Demonstration is a separate fictional governed
demonstration, not part of the real Arrington business brain. Material
Scott work begins with **START HERE - SCOTT'S AI BRAIN INDEX** in Drive;
Scott-specific controlled rules govern Scott within the universal
governance ceiling. Real Arrington business facts, confidential records
and real worker context must never be imported into Scott. Scott worker
authority, permissions, activation state and production gates must not
be changed from memory or stale repository notes; only the current
controlled Scott records and Tom's explicit approvals change them.

Working discipline: inspect the current Drive source rather than relying
on memory, old chats or stale notes in this file. Never claim to have
checked, tested, updated, deployed or verified anything unless the
action actually happened. No hidden expansion of authority, permissions
or scope.

This section sets the starting position only; the rest of this file
stays the practical project manual.

## Brand, voice and strategy: Google Drive is the authority, not this file

This repo governs the **code**. It does not govern brand, tone, positioning,
pricing or what the website is allowed to say. That lives in a separate,
actively maintained Google Drive folder called **"ARRINGTON CONSULTANCY
BRAIN"**, owned by tom@arringtonconsultancy.com. Start at the doc titled
**"START HERE. ARRINGTON CONSULTANCY BRAIN INDEX"** inside it.

The Brain's own authority stack (highest wins on conflict):

1. **00 ARRINGTON BRAND OPERATING SYSTEM** — identity, positioning, language, tone. Changes rarely.
2. **01 ARRINGTON CURRENT OPERATING POSITION** — live priorities and tactics. Changes monthly.
3. **02 ARRINGTON COMMERCIAL POSITION** — pricing, deal structure, commercial boundaries. Changes quarterly.
4. **Arrington Current Website State** — a snapshot of current public copy only, not a source of new wording.

Everything else in the Brain (working frameworks, old chats, reports, PDFs) is
raw material, not authority.

**Why this section exists:** on 25/07/2026 a Claude session deleted a
homepage hero variant containing the phrase "constant firefighting" on Tom's
explicit instruction, only to then find a stale "MASTER GOVERNANCE RULE" in
the Brand OS doc calling that exact CTA protected — a rule that had itself
been superseded by a newer rule banning "firefighting" language, but nobody
had gone back and removed the older, contradicting one. The deletion turned
out to be correct, but it was only *confirmed* correct by going and reading
the Drive doc directly. **Do not draft or change anything resembling brand
copy, positioning or pricing language from memory, from this file, or from
what a past chat said — go and read the current master doc in Drive first.**
If something here (including the Voice and tone section below) ever
contradicts the Brand OS, the Brand OS wins; flag the contradiction to Tom
rather than silently picking one.

## What this is

Single-page website for Arrington Business Consultancy (Tom Arrington), with a CMS backend for content editing. Express.js + PostgreSQL, deployed to Railway, fronted by Railway's anycast edge (`69.46.46.x`; was Fastly until Railway's edge migration, see Custom domains).

## Live URLs

- **Primary:** https://www.arringtonconsultancy.com
- **Apex:** https://arringtonconsultancy.com (A records point at Railway's anycast edge `69.46.46.89` / `69.46.46.15` — Wix doesn't support ANAME on Tom's plan, so apex-via-A-record is the workaround. **Updated 30/06/2026** from the old Fastly IPs `151.101.2.15` / `151.101.66.15`, which went dead when Railway migrated its edge off Fastly — see Custom domains below)
- **Railway-generated:** https://arrington-prototype-production.up.railway.app (bound, but since commit `00c2b91` it **301s to the canonical host** like every other non-canonical hostname, so it can no longer be used to smoke-test page content without DNS. `/health` is exempt from the host rewrite, so this hostname still works for confirming the app is alive if DNS for the custom domains ever breaks.)
- **Login:** append `/login` to any of the above
- **V1 (retired 16/08/2026):** `/v1.html` **permanently redirects to `/`**. It used to be served as a static page with a per-route relaxed CSP (its inline `<style>`/`<script>` blocks predate the nonce setup), but it is a complete alternative version of the site's content in the old warm palette and "We" voice: publicly reachable, crawlable, carrying no `noindex` and in no sitemap, so a superseded statement of the company's positioning was indexable alongside the live one. The `v1.html` file stays in the repository as the historical record; only the public route is gone, and the relaxed CSP override went with it.

**Brand naming:** the browser tab uses the short form "Arrington Consultancy" (set in `views/index.ejs` `<title>`). The full business name "Arrington Business Consultancy" is still used in the logo alt text, hero photo alt, and on-page copy — only the tab/page title is shortened.

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
  lorem.js             Lorem-ipsum placeholder content keyed by template
                       prefix. Used by routes/content.js when a template
                       is picked from the Add-section modal so new picks
                       start neutral instead of cloning live content.
  themes.js            5 colour themes (dark, oxford, light, slate, ember)
  seed.js              Idempotent seed (tables, users, content, images, pages).
                       Skips user creation once nat/tom already exist, so
                       redeploys don't need NAT_PASSWORD/TOM_PASSWORD set.
                       Migrates site.* content keys into the pages table
                       on first run after the multi-page update.
                       On every boot strips any `contact` / `contact__N`
                       instances out of every page's section_order /
                       hidden_sections / deleted_sections arrays because
                       contact now renders globally in the footer (no-op
                       once stripped).
routes/
  auth.js              POST /login (rate-limited), POST /logout
  content.js           GET/PUT content, PUT image, PUT section order,
                       PUT visibility, POST /section/:template (add/duplicate),
                       DELETE /section/:id. Holds VALID_TEMPLATES, the
                       baseTemplate / isValidInstance / contentPrefixes
                       helpers, and the instance ID allocator.
  admin.js             Activity log, reset, backup, restore, theme,
                       page CRUD (list, create, rename, hide, delete,
                       reorder), user CRUD (scoped by caller role),
                       permissions matrix API (GET/PUT), page access API
                       (GET/PUT, plus by-slug convenience route), SEO API
                       (per-page GET/PUT /seo/:slug and site-wide
                       GET/PUT /seo-defaults, gated on manage_seo).
                       Holds NEW_PAGE_TEMPLATES (the default sections
                       seeded when a page is created — currently
                       ['hero','casestudy']).
  leads.js             Public, session-less endpoints for the footer
                       contact/booking form, gated PDF downloads, and the
                       Owner Dependency Quiz's email-results/share-notify
                       actions. Each carries its own rate limiter — see
                       "Lead capture" below.
  marketReadyTest.js    Market Ready Test — see its own section below.
                       Exports { router, mountPageRoute }; mountPageRoute
                       registers the GET page routes ahead of the global
                       CSRF middleware (same reason as the Owner
                       Dependency Quiz route in server.js), router carries
                       the POST/API endpoints.
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
  index.ejs            Main page. The <head> renders the resolved SEO
                       tags (title, description, keywords, canonical,
                       robots, Open Graph, Twitter) from the `seo` object
                       built in server.js (see SEO metadata below). Big
                       inline <style> and <script> blocks
                       carry nonce="<%= nonce %>" so they pass the strict
                       CSP. Sections rendered via a loop over sectionOrder
                       that yields _iid + _tpl for each instance. Inline
                       script also reassembles the obfuscated contact
                       email/phone before any other anchor handling.
                       Contact is NOT part of the section loop — it lives
                       in a dedicated <footer id="conversation"> block so
                       it appears on every page. The nav contains a
                       hamburger button that, on ≤900px, replaces the
                       desktop CTA and opens a full-screen overlay menu
                       with page links and the "Start a conversation" CTA.
  login.ejs            Login page, also nonced, follows active theme
  partials/
    edit-modal.ejs         Content editing modal
    add-section-modal.ejs  Template picker grid with SVG thumbnails.
                           13 picker entries: hero, credentials,
                           biography, intervention, approach, insights,
                           fourcards, documents, casestudy, casestudy2,
                           assessment, filter, proofstrip. 'contact' is intentionally
                           omitted — it lives globally in the footer.
    admin-menu.ejs         Gear-icon panel with collapsible sections
                           (Appearance, Page, Content, Users, System)
                           and a slide-over detail view for sub-panels
                           (Users, Backups, Activity log, Permissions
                           matrix, Page access, Reorder pages, CSP
                           violations). All buttons gated on the user's
                           capabilities object passed from renderPage.
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
                       Includes permissions matrix, page access, and
                       reorder-pages UIs. Sets
                       history.scrollRestoration = 'manual' so
                       add-section reload-then-scroll isn't fought by
                       the browser.
  img/templates/       14 SVG wireframe thumbnails — one per template
                       in VALID_TEMPLATES, used by the add-section modal
                       (contact.svg is kept for completeness even though
                       contact is no longer picker-listed).
market-ready-test.ejs        Market Ready Test assessment itself (business
                             details → 10 multiple-choice questions → optional
                             free-text context → contact details → review →
                             submit). Standalone page, not part of the
                             pages/CMS system — see its own section below.
market-ready-test-result.ejs Market Ready Test results page, rendered from a
                             stored report by result token. Also holds the
                             social share buttons (LinkedIn/Facebook/X/copy).
```

## Database tables

- **users** — seeded admin (`nat`) and content (`tom`) accounts. Role CHECK constraint allows `admin`, `content`, `client`.
- **content** — key-value store for all editable text (**95 keys**: 71 original + 14 fourcards.* rows + 2 intervention button rows + 2 filter button rows + 1 footer.name row + 4 site-wide SEO default rows + 1 `contact.whatsapp` row) + `site.theme`. (Per-hero `{iid}.whatsapp` rows are added on top by `db/seed.js` and lorem seeding — see WhatsApp contact links below. The 23 `documents.*` rows and the closing intervention's rows are likewise added by a seed migration, not by `db/defaults.js` — see Documents template below.) When a section is duplicated the new instance's content keys are seeded into this same table under the new instance ID's prefix (with lorem-ipsum placeholders rather than cloning the base — see Section management below). Legacy `site.section_order`, `site.hidden_sections`, `site.deleted_sections` keys remain in the DB but are no longer read; that state now lives in the pages table. `contact.*` keys are still present and edited in place — they power the global footer block. The four `seo.*` keys (`seo.site_name`, `seo.default_description`, `seo.default_og_image`, `seo.twitter_handle`) hold site-wide SEO fallbacks — see SEO metadata below.
- **pages** — multi-page support. Each row is a page with `slug` (unique), `title`, `sort_order`, `hidden` (boolean), per-page JSONB arrays (`section_order`, `hidden_sections`, `deleted_sections`), and per-page SEO columns (`meta_title`, `meta_description`, `meta_keywords`, `og_title`, `og_description`, `og_image`, `canonical_url` — all `TEXT`/`VARCHAR` defaulting to `''` — plus `noindex BOOLEAN`). The main page has slug `main` and cannot be hidden or deleted. The SEO columns are added by `CREATE TABLE` on fresh DBs and by an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` block in `db/seed.js` for existing deployments.
- **role_permissions** — stores the permissions matrix. Composite PK `(role, capability)`, boolean `enabled`. 12 capabilities x 3 roles = 36 rows. Seeded with defaults on first run (`ON CONFLICT DO NOTHING`).
- **page_access** — per-user page visibility for client users. Composite PK `(page_id, user_id)` with CASCADE deletes. If a page has any `page_access` rows it is automatically restricted: invisible to public visitors and to clients not in the list. Admin and content always see all pages.
- **images** — binary image storage (logo, headshot, oxford badge) for persistence across Railway redeploys
- **backups** — full snapshots of content + images (JSONB)
- **session** — express-session store (connect-pg-simple)
- **audit_log** — all user actions (login, logout, edits, theme changes, backups, restores, section reorders, permission changes, page access changes, SEO changes)
- **leads** — anonymous public submissions: the footer contact/booking form (`kind='contact'`), gated PDF requests (`kind='pdf_download'`), and Owner Dependency Quiz email-results (`kind='quiz_results'`) — see Lead capture below. Market Ready Test submissions also mirror a summary row here (`kind='market_ready_test'`) for admin-panel parity, alongside their full record in `market_ready_submissions`.
- **market_ready_submissions** — full record for the Market Ready Test: business details, all 10 chosen answers, the optional free-text context, consent flags, and the complete deterministically-computed report (JSONB), keyed by a random `result_token` used for the private result URL. See Market Ready Test below.

## Users and permissions

Three roles in descending privilege: **admin > content > client**.

| Username | Role | Default capabilities |
|----------|------|---------------------|
| nat | admin | All 12 capabilities (edit content, manage sections, manage pages, backups, theme, activity log, manage users, page access, SEO, reset content, CSP violations, permissions matrix) |
| tom | content | Same as admin except: no reset content, no CSP violations, no permissions matrix. Has SEO (`manage_seo`). Can manage users but scoped to client-level accounts only. |
| (created via CMS) | client | No editing capabilities. Sees the public site plus any pages granted via page access. Gets a minimal "Log out" button instead of the admin panel. |

### Capabilities (12 total)

`edit_content`, `manage_sections`, `manage_pages`, `manage_backups`, `manage_theme`, `view_activity`, `manage_users`, `manage_page_access`, `manage_seo`, `reset_content`, `view_csp`, `manage_permissions`

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

**"Hidden" alone does not 404 (bug fixed 22/07/2026).** Until this fix, `server.js`'s `renderPage` 404'd a hidden-but-unrestricted page for public visitors and for clients without explicit access — contradicting this section, which was always written to describe "hidden" as a nav/sitemap-visibility toggle only. This surfaced as a real problem: a Google Ads landing page (`business-consultant-devon`, hidden to keep it out of the main nav) was 404ing for every visitor who clicked the ad. The fix scoped both 404 checks in `renderPage` to `isRestricted` only, dropping `currentPage.hidden` from the condition. **Current behaviour:** hidden pages stay out of the nav menu and `/sitemap.xml` (unchanged), but are reachable by direct URL for everyone, public and client alike — only a `page_access` restriction actually takes a page offline. Use "Hide" for "keep it out of the menu" (ads/campaign landing pages, pages not ready to link to yet); use "Page access" for genuine visitor restriction.

## SEO metadata

**Shipped and live 09/06/2026** (committed to `main`, deployed via `railway up`, verified on www.arringtonconsultancy.com). The boot-time `ALTER TABLE` migration has already run on the production DB, so the SEO columns and `manage_seo` rows exist there.

Every page exposes a full set of SEO fields, editable per-page (and gated on the `manage_seo` capability, which admin and content both have by default; client does not).

**Per-page fields** (columns on the `pages` table): `meta_title` (the `<title>` / search-result link), `meta_description`, `meta_keywords`, `og_title`, `og_description`, `og_image`, `canonical_url`, and a `noindex` boolean. All text fields default to `''`.

**Site-wide defaults** (`seo.*` content keys, edited via "SEO: site defaults"): `seo.site_name`, `seo.default_description`, `seo.default_og_image`, `seo.twitter_handle`. Any blank per-page field falls back to the matching default.

**Resolution (in `server.js` `renderPage`, passed to the view as a `seo` object):**
- Title: `meta_title` → else `"{page title} | Arrington Consultancy"` (or just `"Arrington Consultancy"` for the main page).
- Description: `meta_description` → `seo.default_description`.
- Canonical / `og:url`: `canonical_url` → else the current request URL (`${req.protocol}://${req.get('host')}{path}`).
- `og:title`: `og_title` → resolved title. `og:description`: `og_description` → resolved description. `og:image`: `og_image` → `seo.default_og_image`.
- Twitter card: `summary_large_image` when an image resolves, else `summary`; Twitter title/description/image mirror the OG values; `twitter:site` from `seo.twitter_handle`.
- `robots: noindex, nofollow` emitted only when `noindex` is true.

**Rendering:** all tags live in the `<head>` of `views/index.ejs` (title, description, keywords, canonical, robots, Open Graph, Twitter), conditionally emitted so blank fields produce no tag. Tags are escaped via EJS `<%= %>`, so they are visible to all visitors (not gated on login).

**Admin UI:** two buttons in the admin panel's Page section — "SEO: this page" (per-page form with live character counters on title/description at Google's ~60/~160 thresholds) and "SEO: site defaults". Both are slide-over detail panes wired in `public/js/admin.js` (`loadPageSeo` / `loadSeoDefaults`).

**API:** `GET/PUT /api/admin/seo/:slug` (per-page; GET also returns the site defaults so the form can show fallbacks) and `GET/PUT /api/admin/seo-defaults` (site-wide). All four gated on `manage_seo`. `og_image` / `canonical_url` (per-page) and `seo.default_og_image` (site) are validated server-side to be `https?://` or root-relative. The per-page SEO columns are included in the backup snapshot and restore.

**Sitemap + robots:** `server.js` serves a dynamic `/sitemap.xml` (lists only public pages: not hidden, not `noindex`, not `page_access`-restricted; each with a `lastmod` from `updated_at`) and `/robots.txt` (allows all, disallows `/login`, points at the sitemap). Both build URLs from the request host so they work on any domain.

**Google Search Console (pending Tom action, flagged 09/06/2026):** the sitemap is live but should be submitted once in Search Console (search.google.com/search-console → add/verify the `https://www.arringtonconsultancy.com` URL-prefix property → Sitemaps → submit `sitemap.xml`) so Google crawls faster. Tom signs in with his Google Ads account. If ownership verification stalls, Nat can add the HTML-tag verification (the CSP `scriptSrc` already allows the Google domains). No code change needed; the sitemap self-updates.

## Content editing

- Each section has an edit button (pencil icon, top-right, visible on hover when logged in)
- Clicking opens a modal with all editable fields for that section
- Content sanitised on save via `sanitize-html` (only `<strong>`, `<p>`, `<br>`, `<em>` allowed)
- Credentials section split into two independently editable blocks (Oxford + statistic)

## Multi-page support

The site supports multiple pages. Each page is a row in the `pages` table with its own slug, title, sort order, visibility, and section arrays.

- **URL scheme:** `/` for the main page (slug `main`), `/{slug}` for additional pages
- **Page menu:** a subtle fixed bar below the nav, only rendered when 2+ pages exist. Desktop only — on ≤900px it is hidden and the page links move into the hamburger menu overlay. Links styled with theme CSS variables; active page highlighted with accent colour. Hidden pages shown dimmed (italic, low opacity) for users with edit capability only. Restricted pages (those with `page_access` entries) are invisible to public visitors and unauthorised clients.
- **Instance IDs are globally unique across all pages.** A new page's hero becomes `hero__2` if `hero` is already on the main page. The content table doesn't change; each page just owns a different subset of instance IDs.
- **Default new page layout:** hero + case study (timeline). Contact is no longer seeded per page — the global footer provides it on every page. Defined by `NEW_PAGE_TEMPLATES` in `routes/admin.js`.
- **Empty pages render empty.** An explicit empty `section_order` (e.g. after a page loses all its sections) renders as nav + footer only — no fallback to the default section set.
- **Page controls** (in admin panel, users with `manage_pages`): Add page, Rename page, Reorder pages (slide-over with ▲/▼ arrows per page; saves immediately via `PUT /api/admin/page-order`; shown when 2+ pages exist), Hide/Show page (not main), Delete page (not main, with confirmation), Page access (assign client users).
- **Slug generation:** auto-generated from title (lowercase, hyphens). Reserved slugs rejected: `login`, `logout`, `health`, `api`, `img`, `js`, `css`, `public`, `main`
- **Main page protection:** cannot be hidden or deleted (server enforces)
- **Backups:** pages snapshot stored under the `__pages__` key inside `content_snapshot`. Old backups without `__pages__` restore content only, leaving pages untouched.
- **Section API calls** now include `pageSlug` in the request body so operations target the correct page's arrays in the pages table.
- **Listing pages:** `GET /api/admin/pages` (gated on `manage_pages`) returns every page for the reorder UI.

### Navigation visibility vs. hidden (added 22/07/2026)

Two independent per-page settings now control what visitors see, and they are easy to conflate:

- **`hidden`** controls whether a page is reachable at all: excluded from `/sitemap.xml`, and (as of the 22/07/2026 fix earlier in this file) still reachable by direct URL — `hidden` alone no longer 404s a page for the public. Use it for a page that isn't ready yet, or a Google Ads/SEO landing page you don't want appearing in organic listings.
- **`show_in_nav`** (`BOOLEAN NOT NULL DEFAULT true`) controls only whether a page appears in the desktop page-menu bar and the mobile hamburger menu. It has zero effect on `hidden`, `noindex`, the sitemap, or direct-URL access. A page can be `show_in_nav = false` and still be fully public, indexed, and linked to from elsewhere in the site — that's the point of it: a "supporting page" that's discoverable through contextual links rather than the primary nav.
- **`nav_label`** (`VARCHAR(200) NOT NULL DEFAULT ''`) overrides only the text shown in the nav bar and mobile menu. Falls back to the page's `title` when blank. Deliberately decoupled from `title` so a nav-only rename never touches the page's own heading, the mobile menu's other reference to it, or the SEO `<title>` fallback (which still reads from `title`, not `nav_label`).

**Admin UI:** both live in the existing "Reorder pages" panel (renamed "Reorder & navigation" in the panel body, button label unchanged), one row per page: a "Show in nav" checkbox and a nav-label text input, saving instantly via the existing `PUT /api/admin/page/:slug` route (extended to accept `show_in_nav` and `nav_label` alongside the existing `title`/`hidden`). The home page (`slug = 'main'`) cannot have `show_in_nav` set to `false` — enforced server-side, same pattern as "cannot hide the home page."

**Current site structure (22/07/2026):** main nav is Home, What We Do, What We Have Done, What the Work Looks Like (nav label "See how we work"), About Us, 30 Minute Conversation. Useful Thinking and What Business Owners Say are `show_in_nav = false` but fully indexed/accessible, discovered instead through contextual links added to What We Have Done, What the Work Looks Like (nav-labelled "See how we work"), What We Do, About Us, 30 Minute Conversation, and the global footer. Business Consultant Devon stays `hidden = true` (Google Ads landing page, not in the sitemap) and `show_in_nav = false`, linked once from a new About Us section. See the git log around this date for the exact new `intervention` instances (`__9` through `__16`) and their placement.

### Nav child links (added 30/07/2026)

A page can now appear as a visually-subordinate link directly under a specific top-level nav item, without becoming a new top-level item itself and without any new schema. The pattern (currently used once, for Websites and AI under What We Do): the child page is a normal `pages` row with `show_in_nav = false` (so the generic `navPages` loop never lists it as a sibling top-level item), and `views/index.ejs` special-cases the render — right after emitting the parent's `<a>` in both the desktop `.page-menu-inner` loop and the mobile `#mobileMenu` loop, it checks `_p.slug === 'what-we-do'` and if so emits one extra hardcoded `<a href="/websites-and-ai">` styled as a child (`.page-menu-link-child` / `.mobile-menu-sublink`: smaller font, muted colour, a `›` prefix). This is deliberately not a generic multi-level nav system — adding a second child link anywhere else means adding another explicit `if (_p.slug === '...')` block, copying this same pattern, not building something more abstract. The child page itself is otherwise a completely normal, fully public, fully indexed CMS page (same as Useful Thinking / What Business Owners Say used to be): reachable directly, in the sitemap, editable in the CMS — `show_in_nav = false` only ever affects the two nav loops.

**Current top-level nav (30/07/2026):** Home, What We Do (with Websites and AI folded under it as described above), Owner Check (synthetic entry, not a `pages` row — see `navPages` in `server.js`), Evidence, About Us, 30 Minute Conversation. Useful Thinking is `show_in_nav = false`, discovered via contextual links. Business Consultant Devon stays `hidden = true` + `show_in_nav = false` (Google Ads landing page). The "Current site structure (22/07/2026)" note above predates the Evidence merge and Commercial Gaps Review launch and is left as historical context rather than corrected line-by-line — this paragraph is the current picture.

## Websites and AI page (added 30/07/2026)

A new service page introducing Arrington's combined website-development-plus-practical-AI-implementation offer, at `/websites-and-ai`. Built the same way as Evidence: a normal `pages` row (not a special standalone route), assembled entirely from existing templates so it stays fully CMS-editable — no new template was created for it. Deliberately not a new top-level nav item (see "Nav child links" above); positioned in `sort_order` right after What We Do.

**Core positioning (per Tom's brief):** this page must not read as a web design agency or an AI agency pitch. The commercial position stays "take something that already works and make it stronger" — technology (websites, AI) is one way of implementing a commercial improvement, never the starting point. Copy was checked against the Brand Operating System (Drive) before writing: no em dashes, UK English, "we" voice, none of the banned words (solutions/synergy/leverage/empower/journey/holistic/tailored/bespoke/coach/transformational/world class), no fire metaphors.

**Section → template mapping** (all in `section_order`, in this order):

| # | Content | Template | Instance |
|---|---|---|---|
| 1 | Hero: "Websites and AI that solve real business problems" | `hero` | new |
| 2 | Start with the business, not the technology (examples of business problems) | `biography` | new — two-column body carries the example list as prose, since CMS content only allows `strong`/`p`/`br`/`em` (no `<ul>`), the same constraint that ruled out a literal bullet list anywhere on this page |
| 3 | Why we are different (agencies ask what website you want; we ask what's in the way) | `filter` | new — `p1`/`p2` two-paragraph contrast, no proof rows |
| 4 | Two implementation areas: Commercial Websites / Practical AI | `biography` | new — second instance; each column opens with a bold `<strong>` lead-in naming the area, since the template has no per-column heading field |
| 5 | Bespoke website offer: "A genuinely bespoke website — from £999" | `biography` | inserted 02/08/2026, then moved higher on 02/08/2026 so it now sits straight after the implementation-areas block rather than near the closing CTA; two-column prose to keep the offer premium and within the site's existing CMS templates, covering the defined five-page scope, discovery call, revision limit and separate quoting for extras |
| 6 | Real examples: Owner Check, Commercial Gaps Review, this website itself | `insights` | new — exactly 3 cards, matching the template's fixed 3-slot layout with no empty-slot risk |
| 7 | How the work happens: Understand / Design / Build / Improve | `fourcards` | new — exactly 4 cards, matching the template's fixed 4-slot layout |
| 8 | What we will not do (trust statement) | `filter` | new — second instance, single paragraph, no button |
| 9 | Closing CTA: "Technology should make the business stronger, not more complicated" → Tell us what you want to build | `intervention` | existing closing block, button destination unchanged |

Two templates were deliberately ruled out for the two "list-shaped" sections (implementation areas' two lists of 6-7 items each, and the four "what we will not do" statements): `assessment`'s `.aq` boxes and `fourcards`/`insights` all render every slot unconditionally (no skip-if-empty logic anywhere in the codebase), so forcing a 4- or 6-item template to hold fewer real items would leave visible empty boxes. Prose within the existing two-column/paragraph templates was the safer fit.

**Contextual link from What We Do (per Tom's brief, point 7):** rather than editing either of What We Do's two existing `intervention` instances (which would have meant replacing a working button/link), the migration appends a brand new third `intervention` instance to the end of What We Do's `section_order` — "Need the website or the systems to match?" → "See Websites and AI" → `/websites-and-ai`. Existing content on that page is completely untouched.

**Hero image:** initially shipped with no per-instance photo (fell back to the site's default `headshot` image). Tom's real photo followed shortly after launch — confirmed live as instance id `hero__5`, so its per-instance image key is `headshot__hero__5`. Seeded in `db/seed.js`'s image-seeding block from `hero-websites-and-ai.jpg` at the repo root (re-compressed from the original ~2.9MB PNG to a ~130KB JPEG at quality 85 — visually identical at hero-background size, well under the CMS's 2MB upload cap). Seeded directly via SQL rather than through the CMS upload API, so none of that route's validation (aspect ratio, magic-byte MIME check, 2MB cap) applied to this insert — only relevant if Tom later re-uploads a different photo for this key through the admin UI.

**Migration:** `db/seed.js`, guarded on `pages.slug = 'websites-and-ai'` not existing and on `what-we-do` existing. Uses the same collision-avoidance `allocate()` helper as the "what the work looks like" documents migration (collects every instance ID in use across all pages' `section_order` plus all distinct content-table prefixes before picking new ones), rather than hardcoding instance IDs.

### Seed contract for this page (added 15/08/2026)

This page is assembled by **four** chained migrations in `db/seed.js`, not one: the 30/07 page build, the 03/08 hero + World Student Advisors proof layer, the 03/08 copy refinement, and the 03/08 £999 conversion rebuild. Each layer deliberately overwrites the one before it with `ON CONFLICT DO UPDATE`, and the last of them originally had **no guard at all**, so every boot re-asserted the seeded copy, `section_order`, `hidden_sections`/`deleted_sections` and the page's SEO columns. Any CMS edit Tom made to `/websites-and-ai` was therefore silently reverted by the next deploy. The two middle layers were guarded on an exact match of the hero heading, a guard that *inverts* the moment that heading is edited, so they had the same failure mode one step removed.

The chain is now gated as a whole. `WAI_SEED_REVISION` plus the marker row `content['seed.websites_and_ai_revision']` select exactly one mode per seed run, resolved by `lib/waiSeedMode.js` before any of the four migrations execute:

| Mode | Condition | Behaviour |
|---|---|---|
| `fresh` | page row absent at start of run | full chain runs as before, then stamps the marker |
| `adopt` | page present, no marker | writes nothing, stamps the marker only |
| `skip` | marker matches `WAI_SEED_REVISION` | no writes at all (the steady state) |
| `replay` | marker present but different | chain runs and overwrites live content, then re-stamps |

**The live database is now the source of truth for this page's content.** `replay` is the only path that can overwrite a CMS edit again, and reaching it requires deliberately bumping `WAI_SEED_REVISION` in code, which is a destructive act on this page. Routine copy changes belong in the CMS, not the seed.

Covered by `test/waiSeedMode.test.js`: unit tests for all four modes plus a guard asserting all four write branches stay gated, and a three-pass integration test (fresh build, then a simulated CMS edit surviving a redeploy, then the `adopt` path) that shells out to the real `node db/seed.js`. The integration half is skipped unless `WAI_SEED_TEST_DATABASE_URL` points at a throwaway database, since it drops and recreates the schema.

Note that the other seeded pages never had this problem: they all use the run-once-guard plus `ON CONFLICT DO NOTHING` pattern, which is what this gate restores for Websites and AI.

## Section management (reorder, hide, delete, add, duplicate)

Each editable section has five hover-revealed buttons in this visual order, left to right: ✎ edit · 👁 hide · ▲ up · ▼ down · ✕ delete. Edit and the up/down arrows behave as before; the rest are described below.

### Reorder
- ▲ / ▼ swap the section with its neighbour in the DOM and save the order via `PUT /api/content/order`
- Order stored as a JSON array in the page row's `section_order` column
- Rendered server-side (EJS loop over `sectionOrder`) so all visitors see the saved layout
- **14 valid templates:** hero, credentials, biography, intervention, approach, insights, fourcards, documents, casestudy, casestudy2, assessment, filter, proofstrip, contact. Of these, `contact` renders only in the global footer (never via the section loop); `fourcards`, `documents` and `proofstrip` are picker-only.
- **Default auto-merge order** (in `server.js`) deliberately excludes `contact` (footer-only) and `fourcards`, `documents` and `proofstrip` (picker-only) so adding those templates never auto-injects them into the main page.
- Server auto-inserts any newly-added default templates at their natural default-order position on the main page without a DB update — but only when no instance of that template is already on the page, only when the stored order is non-empty, and only for the main page (other pages own their explicit order).
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
- "Add section" button in the admin menu opens a wide modal with two tabs: **New section** (the template picker) and **Reuse existing** (orphaned instances whose content is still in the DB but isn't on any page)
- **New section** lists 13 templates (every `VALID_TEMPLATES` entry except `contact`) with SVG wireframe thumbnails, a serif label, and a one-line blurb. Duplicates are explicitly allowed.
- One click → `POST /api/content/section/:template`, the server allocates an instance ID (see model below), **seeds lorem-ipsum placeholder content from `db/lorem.js` into every content key the instance owns** (so the new section always starts neutral instead of cloning another page's content), appends to `section_order`, returns `{ instanceId }`. Seeding happens on both the base-reuse path and the suffixed path — there is no "restore original content by re-adding" behaviour any more; use the "Reuse existing" tab to bring orphaned content back.
- **Reuse existing** lists orphaned instance IDs with a heading preview, and lets the user re-attach them to the current page without overwriting their content.
- Client stores the new instance ID in `sessionStorage.cmsJustAdded` and reloads
- After reload, admin.js scrolls to the new section and adds the `cms-section-just-added` class which runs a 1.4s orange flash animation
- `history.scrollRestoration = 'manual'` is set at the top of admin.js so the browser doesn't snap the scroll position back to where the user was before the click — that bug only showed up on prod (where the page loads slowly enough that the browser's restore fired after admin.js's scroll)

### Duplicate sections (instance/template model)
- A section on the page is an **instance** of a **template**. The 14 valid template names live in `VALID_TEMPLATES` in `routes/content.js`, `routes/admin.js`, and `server.js` (kept in sync manually — if you add a new template, update all three).
- Instance IDs have the form `{template}` (the first/base instance) or `{template}__N` for additional copies, where `N` is an integer ≥ 2 separated by a **double** underscore (so `casestudy2` the template doesn't collide with `casestudy__2` the duplicate).
- Validation regex: `^([a-z0-9]+)(?:__(\d+))?$`. Helpers `baseTemplate(id)` and `isValidInstance(id)` live in `routes/content.js`; `server.js` carries its own copies for the render path.
- `site.section_order` stores instance IDs, not template names. Existing prod data with `["hero","credentials",...]` still works because base instance ID == template name.
- Content keys are scoped per instance: `{instanceId}.field` for most templates. **Credentials is the special case** with two sub-prefixes per instance: `{instanceId}_oxford.*` and `{instanceId}_stat.*`. The helper `contentPrefixes(instanceId)` returns the right list.
- The EJS view loop yields `_iid` (instance ID) and `_tpl` (template). Each section block declares `<% const _k = _iid; %>` (and additionally `_kOx` / `_kSt` for credentials) and looks up content via `content[_k + '.field']`. All `data-section[-id]` attributes use `_iid` so reorder/hide/delete operate on the right instance. The instance → template map is built in `server.js` and passed to the view as `instanceTemplates`.
- The EJS partial `views/partials/add-section-modal.ejs` keeps the template metadata (id, label, blurb) and renders the picker grid.

### Add-section instance allocation
When the user clicks a template card, the server picks the smallest unused instance ID, with a deliberate priority:
1. If the base instance ID (e.g. `hero`) is **not** in use on any page, reuse it.
2. Otherwise, allocate the smallest unused `{template}__N` for `N` ∈ [2, 99].
3. Cap at `__99` — beyond that the POST returns 400.

In either case the server then **overwrites** the target content prefixes (handles credentials' two sub-prefixes) with lorem-ipsum from `db/lorem.js`, so every pick lands with fresh placeholder text regardless of path. If the base reuse is happening, the instance is also removed from `deleted_sections` on the current page.

### admin.js label normalisation
`fieldLabels` and `sectionTitles` in `public/js/admin.js` are keyed by the base template / template prefix (e.g. `hero.heading`, `credentials_oxford`). For duplicate instances, `normalizeKey()` strips `__N` from the instance ID or content key before lookup, so `hero__2.heading` falls back to the `hero.heading` label, and the edit modal title for `credentials__2` resolves to "Credentials".

## Global footer contact block

The contact details live in `<footer id="conversation">` at the bottom of every page, outside the section loop. It is rendered directly from the `contact.*` content keys (label, heading, body, email, phone).

- A single pencil edit button on the block opens the standard edit modal and fetches `/api/content/contact` — no special-case wiring, just the existing per-prefix content API
- The nav's "Start a conversation" CTA (and the mobile menu's equivalent) always anchor to `#conversation` in the footer
- Because the footer is universal, `contact` is intentionally missing from the picker, the `NEW_PAGE_TEMPLATES` list, and the main-page auto-merge order. A seed-time migration also strips any `contact` / `contact__N` entries out of every page's JSONB arrays — that migration is idempotent and runs on every boot.
- Below the contact block, a small `.footer-credit` line renders the editable name from `footer.name` (default "Tom Arrington"). Same global pattern as contact: outside the section loop, single content prefix (`footer.*`), pencil edit button on hover for users with `edit_content`, edits via the standard modal at `/api/content/footer`. `admin.js` knows the section title (`footer: 'Footer'`) and the field label (`footer.name: 'Name'`).

## WhatsApp contact links

A "WhatsApp us" link opens a WhatsApp chat (rather than just showing a number) in four places, all editable via the CMS and all rendered only when a valid WhatsApp URL is set.

- **Global link** — `contact.whatsapp` content key (default `https://wa.me/441752477026?text=Hi%20Tom%2C%20I%27d%20like%20to%20speak%20to%20you%20about%20Arrington%20Consultancy`). Edited via the footer contact block's pencil (it appears as a "WhatsApp link" field in the standard contact edit modal). This one key drives three placements: the **nav header** (green `.nav-cta-whatsapp` beside the existing CTA, inside a new `.nav-actions` flex wrapper), the **footer contact-details** (green `.btn-whatsapp`), and the **mobile hamburger menu** (`.mobile-menu-whatsapp`). Clear the field to remove WhatsApp from all three at once.
- **Per-hero link** — each hero instance owns an optional `{iid}.whatsapp` content key (added to `db/lorem.js` `hero` so new heroes get an empty, editable field; exposed in the hero edit modal as "WhatsApp link"). When set, a green `.btn-whatsapp` renders beside the hero CTA inside a `.hero-cta-row` flex wrapper. The booking page hero (`hero__3` on `/book-a-30-minute-conversation`) is seeded with the live link by an idempotent migration in `db/seed.js`; all other heroes start empty.
- **Validation:** all four render paths gate the link on the regex `^https://(wa\.me|api\.whatsapp\.com)/` (defence-in-depth, same approach as the SEO URL fields), so a malformed or `javascript:`/`data:` value simply produces no button. There is no save-time validation; the render-time guard is the protection. A consequence: if the field holds anything that isn't a `wa.me`/`api.whatsapp.com` https URL, the button silently hides.
- **Labels:** `admin.js` `fieldLabels` carries `contact.whatsapp` and `hero.whatsapp` (the latter resolves duplicates like `hero__3.whatsapp` via `normalizeKey`). WhatsApp green is `#25D366` (hover `#1da851`), hard-coded rather than themed so the button is recognisable across all five palettes. The keys live in the content table so they are included in backups/restore automatically.

## Continue with Google prefill (added 30/08/2026)

An optional one-tap "Continue with Google" button on the four public checks (Product Guide, Market Ready Test, Owner Dependency Quiz, Commercial Gaps Review) that fills the visitor's name/email fields from their Google account. **It is autofill, not authentication**: the Google Identity Services button hands the browser an ID token, a nonced inline script decodes it locally and fills the inputs, and the form submits through the exact same validated endpoint as typed entry. No session, no server verification, no new trust claimed for the data, no client secret anywhere.

- **Gated entirely on `GOOGLE_SIGNIN_CLIENT_ID`** (a public OAuth client ID, not a secret). Unset: the partial renders nothing and the CSP carries zero Google Identity hosts, verified both ways against the running server. The CSP additions (`accounts.google.com/gsi/client` in scriptSrc, `/gsi/` in connectSrc and frameSrc, `/gsi/style` in styleSrc) are spread conditionally on the same variable in `server.js`.
- **Files:** `views/partials/google-prefill.ejs` (the partial; takes `gpTargets`, a per-page map of selectors for fullName or firstName/lastName plus email), included in the four check views; `test/googlePrefill.test.js` (renders the partial both ways, pins the per-page targets, and pins the never-overwrite-typed-input guard).
- **Setup (Tom, one-off):** console.cloud.google.com → create/reuse a project → OAuth consent screen (External, app name Arrington Consultancy) → Credentials → Create OAuth client ID → Web application → Authorised JavaScript origins `https://www.arringtonconsultancy.com` → copy the client ID → set `GOOGLE_SIGNIN_CLIENT_ID` on the Railway service. No redirect URI and no client secret are needed for this flow.
- The footer contact form deliberately does NOT carry the button (decision pending with Tom): it is sitewide, so the Google script would load on every page, and a contact form that suggests signing in adds friction for people who just want to type.
- The Privacy page (`views/privacy.ejs`) carries an accurate description of what the button does and does not do.

## Mobile navigation (hamburger)

At ≤900px the desktop nav CTA and the separate `.page-menu` bar are both hidden. In their place:
- A three-bar hamburger button (`#navHamburger`) replaces the CTA in the nav. It animates into an X when open.
- `#mobileMenu` is a full-screen fixed overlay (`z-index: 105`, `rgba(0,0,0,0.95)` with `backdrop-filter: blur(20px)`) containing each visible page's link, a divider, and the "Start a conversation" CTA. Clicking any link closes the menu; `<body>` gets `overflow: hidden` while open.
- Desktop (>900px) hides the hamburger and shows the CTA + page-menu bar as before.

## Anti-harvest contact protection

The footer's email address and phone number are obfuscated server-side so naive scrapers can't pull them out of the rendered HTML.

- Stored values (`contact.email`, `contact.phone`) are still edited normally in the CMS — only the rendered HTML is munged
- Email: split at the `@` into `data-u` and `data-d` attributes on the anchor; rendered text is `tom <span aria-hidden>[at]</span> arringtonconsultancy.com` with `href="#"`
- Phone: split into roughly equal halves both for display (with an invisible `<span aria-hidden>` containing a zero-width space between them, so the digit run is interrupted in source) and as `data-pa` / `data-pb` attributes for the `tel:` URL; the visible text still reads as the original phone number to a human
- A small block at the top of the existing nonced inline `<script>` in `views/index.ejs` reassembles the real `mailto:` and `tel:` `href`s and replaces the email text with the real address. It runs **before** the smooth-scroll handler attaches so the placeholder `href="#"` anchors don't get caught by `a[href^="#"]`
- Verified against four common harvest regexes (full email, `+44…`, `0xxxx xxxxxx`, 10+ digit run) — zero matches in the anon HTML
- Defends against scrapers that fetch HTML and regex-scan. A determined scraper running a headless browser will still get the values after JS runs — if junk persists, next steps would be a contact form or a click-to-reveal pattern

## Google Ads conversion tracking

Tom runs Google Ads campaigns pointing at the site. Conversion tracking is wired up directly in `views/index.ejs` (no GTM) so it lives on every page the EJS template renders (`/` and every `/:slug`).

- **Base tag** at the top of `<head>`: async loader for `gtagjs?id=AW-18129914078` plus a nonced inline `gtag('config', 'AW-18129914078')` initialiser
- **Contact-click conversion event** fires on click of any `tel:`, `mailto:` or WhatsApp anchor, calling `gtag('event','conversion',{send_to:'AW-18129914078/h_2rCJeH8aYcEN6RgsVD'})`. The listener is attached **after** the email/phone reassembly inside the same nonced script block, so by the time it queries `a[href^="tel:"], a[href^="mailto:"]` the obfuscated anchors have real hrefs and will be picked up. New contact links anywhere on the page get auto-tracked too.
- **Contact form conversion event** fires only after a successful footer contact form submission, calling `gtag('event','conversion',{send_to:'AW-18129914078/vCKKCKjSna0cEN6RgsVD'})`.
- **CSP allowlist** in `server.js` already permits the required Google domains in `scriptSrc`, `imgSrc`, `connectSrc`, and `frameSrc`: `www.googletagmanager.com`, `www.googleadservices.com`, `www.google-analytics.com`, `googleads.g.doubleclick.net`, `td.doubleclick.net`. Don't strip these unless the ad campaign ends.
- **Conversion ID / label** are owned by Tom's Google Ads account. If Tom rotates the conversion action, only the `AW-…/…` string in the gtag call needs to change; the base tag and CSP stay as-is.
- **Verified working** 2026-05-14: tag fires on tel/mailto clicks and conversions register in Google Ads. The fastest way to verify end-to-end is the Google Tag Assistant Chrome extension — load the live site, click Tag Assistant, tap a footer link, and watch the `conversion` event fire. Google Ads' campaign dashboard has a 3–24h reporting lag, so the campaign overview can show an orange "Conversions: Detected issues" warning for a while even when the tag is firing correctly; that warning is almost always "no conversions recorded yet" or a targeting/bidding issue, not a tag-installation issue. The authoritative status lives at Tools → Conversions → click the action → "Status" field.

## Case studies

Two case studies with distinct layouts:
- **Orca Marine** (`casestudy`) — timeline/phases layout (three labelled phases: mess, steady hand, result)
- **The Tristan Story** (`casestudy2`) — editorial layout (serif pull-quote intro, body narrative, highlighted outcome block with accent border)

Both are fully editable via the CMS and reorderable like all other sections.

## The Intervention section

Added between Biography and Approach. Simple centred block (heading + body paragraph), styled to mirror the `.filter` section. Editable fields: `intervention.heading`, `intervention.subtext`, `intervention.button_text`, `intervention.button_link`. Heading and subtext allow the standard sanitised HTML tags (`<strong>` used in the default copy).

The button mirrors the hero's `.btn-primary` styling (so it picks up `--accent` per theme). It only renders when `button_text` is non-empty (after stripping HTML), so the field defaults to empty and the button is hidden until a user fills it in. `button_link` is a page slug picker — the edit modal renders a `<select>` populated from a `<meta name="all-pages">` tag (only emitted for logged-in users) listing every page the current viewer can see. The render path resolves `main` to `/` and any other slug to `/{slug}`; an invalid/missing slug falls back to `#conversation`. Slugs are validated against `^[a-z0-9]+(?:-[a-z0-9]+)*$` server-side. The seed includes a one-time idempotent migration that backfills `button_text=''` and `button_link='main'` for any pre-existing intervention or filter instance so the edit modal exposes both fields on legacy duplicates.

The **filter** template has the same `button_text` / `button_link` pair (`filter.button_text`, `filter.button_link`) and renders identically. The picker dropdown and edit-modal labels are shared with intervention.

## Four-card template

`fourcards` is a four-card grid template for feature-style layouts. Each card has three editable fields: **number** (e.g. "01"), **title**, **body** — keys follow the pattern `fourcards.card_N_{number|title|body}` for `N` ∈ [1..4]. Section-level fields are `fourcards.label` and `fourcards.heading`.

- Grid: 4 columns on desktop → 2×2 at ≤900px → single column at ≤600px
- Picker-only: deliberately excluded from the main-page auto-merge, so it never appears unless a user explicitly adds it
- `admin.js` adds `_number` to the "short" textarea class heuristic so the number field renders as a small single-line input in the edit modal
- Thumbnail lives at `public/img/templates/fourcards.svg`

## Lead capture: contact/booking form + gated PDF downloads (added 22/07/2026)

Two related pieces landed together, both writing to a new `leads` table (`kind`, `name`, `email`, `phone`, `message`, `preferred_time`, `document`, `created_at` — see `db/schema.sql`). Neither sends email; this is deliberately DB-only for now (see "Contact form + Resend" below for the parked email-sending path, which this does not replace or depend on).

**Contact + booking form.** The global footer (`<footer id="conversation">`) now has a real `<form id="leadForm">` above the existing mailto/tel/WhatsApp links (kept as an alternative): name, email, phone (optional), preferred day/time for a 30-minute call (optional), message. Submits via `fetch` to `POST /api/leads` (`routes/leads.js`), which validates (name + email required, email regex, all fields length-capped and stripped of HTML via `sanitize-html`), inserts a `kind='contact'` row, and returns `{ ok: true }`. A hidden honeypot field (`website`) makes a filled-in submission silently succeed without being stored. This route and `/api/documents/request` below share a dedicated `publicFormLimiter` (10/hour/IP) — separate from the authenticated-write limiter in `server.js`, since these are anonymous-visitor endpoints. **This required moving the `<meta name="csrf-token">` tag out of the `if (user)` gate in `views/index.ejs`** so anonymous visitors get a valid CSRF token; previously only logged-in users did, which is why the earlier parked contact-form branch (below) needed the same fix.

**Gated PDF downloads.** The four case-study PDFs moved from `public/pdfs/` (statically served, directly linkable) to `private/pdfs/` (outside `public/`, unreachable by `express.static`). The documents template's "Open the full PDF" link is now a `<button class="js-doc-request" data-doc="{filename}">Get the full PDF</button>` — `data-doc` is just the basename extracted from the existing `doc_N_file` content value, so **no content migration was needed**; the field still holds `/pdfs/example.pdf`-style text, it's just no longer rendered as a literal `href`. Clicking opens a shared modal (`#docModalOverlay`, markup lives once in the footer area) asking for an email. Submitting posts to `POST /api/documents/request` (email + doc, doc must match `^[a-z0-9][a-z0-9_-]*\.pdf$` and actually exist in `private/pdfs/`), which inserts a `kind='pdf_download'` lead row and returns a signed, 15-minute-expiry download URL (`GET /documents/download?doc=...&token=...`, HMAC-SHA256 over `doc:expiry` keyed on `SESSION_SECRET`, `crypto.timingSafeEqual` compare). The download route has its own `downloadLimiter` (30/min/IP) to bound token brute-forcing within the expiry window. (The "Regenerating a preview" command in the Documents template section below has been updated to read from the new `private/pdfs/` location.)

**Admin view.** Both lead types show up in the admin panel under System → "Leads & bookings" (gated on `view_activity`, same capability as the Activity log — no new capability was added to the permissions matrix to keep this change contained). `GET /api/admin/leads` returns the latest 100, newest first. **Important:** unlike the Activity log's loader (which doesn't escape its fields, safe there only because those values are admin-controlled), the leads loader in `public/js/admin.js` passes every field through the existing `escapeHtml` helper before building the `innerHTML` string, because leads contain raw public-visitor input.

**Email notifications (added 22/07/2026).** Both endpoints in `routes/leads.js` also fire a notification email after the DB insert (fire-and-forget — `notify()` is not awaited before the response and swallows its own errors, so an email problem never fails the actual lead submission; the DB row stays the source of truth). Sent via **Gmail SMTP with an app password**, not Resend — `tom@arringtonconsultancy.com` is Google Workspace, so this sidesteps the whole parked Resend/Cloudflare/DNS-verification situation above entirely; no domain verification needed since Google is genuinely sending its own mail. Requires the `GMAIL_APP_PASSWORD` env var (an app password generated at `myaccount.google.com/apppasswords`, only available if 2-Step Verification is on and the Workspace admin hasn't disabled app passwords); if unset, `notify()` no-ops with a console warning rather than breaking anything, so local dev works without it. Recipient is read from the `contact.email` content key at send time (same pattern as the parked Resend branch), falling back to `tom@arringtonconsultancy.com` if blank. `replyTo` is set to the visitor's email so Tom can reply directly from the notification.

**Testimonials note (22/07/2026):** a review of the live site during this same session initially and incorrectly reported "only one testimonial" on `/what-business-owners-say` and "only one post" on `/useful-thinking`. Both were a tool artifact (a page-text extraction that grabbed only the first `<article>` element), not the real content — the site already had 4 testimonials and multiple Useful Thinking entries at the time. No content was added; flagging here so a future session doesn't duplicate testimonials based on that same wrong impression if it resurfaces somewhere.

## Documents template ("What the work looks like")

`documents` shows up to four downloadable PDFs, each with a first-page preview, and a fanned montage of the same previews in the section header. Built 20/07/2026 for Tom's `/what-the-work-looks-like` page (four redacted public versions of real client deliverables).

**Content keys** (23 per instance): `documents.label` (hides when empty), `documents.heading`, `documents.intro`, then per document `N` ∈ [1..4]: `doc_N_title`, `doc_N_blurb`, `doc_N_meta` (the small uppercase detail line, e.g. "PDF, 15 pages"), `doc_N_file` (path to the PDF) and `doc_N_image` (path to the preview). A document with an empty **title** is skipped entirely, so a section can show fewer than four.

**Where the assets live.** **Updated 22/07/2026 — see "Lead capture" above.** The PDFs now live in `private/pdfs/` (outside `public/`, not reachable by `express.static` — downloads are gated behind an email capture + signed URL). The previews are still static JPEGs in `public/img/docs/`, served by `express.static` as before (previews stay public; only the full PDFs are gated). Neither is in the `images` DB table (that table is for the CMS-uploadable logo/headshot/oxford images, whose keys are whitelisted). The `pdfs/` folder at the project root holds the originals as received and is gitignored (unchanged).

**Regenerating a preview** (needs poppler, `brew install poppler`):

```bash
pdftoppm -jpeg -jpegopt quality=80 -r 110 -f 1 -l 1 -singlefile \
  private/pdfs/<name>.pdf public/img/docs/<name>
```

Gotcha: a PDF downloaded through Chrome carries a `com.apple.quarantine` xattr that makes `pdftoppm` fail with "Operation not permitted". Run `xattr -c private/pdfs/*.pdf` first.

**Path validation.** `doc_N_file` and `doc_N_image` content values are still validated at render time against `^\/[A-Za-z0-9._\-\/]*\.pdf$` and `...\.(jpe?g|png|webp|avif)$` (and rejected if they contain `..`) — this hasn't changed. What changed is what happens with a validated `doc_N_file`: instead of being rendered as a literal `href`, only its basename is extracted and passed to the gated-download flow (see "Lead capture" above). A path that fails validation still renders nothing: the PDF button or the thumbnail simply disappears. Same defence-in-depth approach as the SEO URL fields and the WhatsApp links.

**Layout.** Header is a two-column grid (text left, montage right) collapsing to one column at ≤900px. The montage is four absolutely-positioned sheets fanned by `nth-child` rules — positioning lives in CSS classes, not `style=""` attributes, because the strict CSP blocks inline styles. Cards are `190px 1fr` on desktop, stacked at ≤900px; a card with no preview image gets `.document-card-noimg` (full width). The CMS edit/move buttons inside `.documents` carry `z-index: 5` and a dark backing so they stay visible and legible over the montage sheets.

**Page title.** Tom created the page with its slug as the title, so the menu item and `<title>` both read `what-the-work-looks-like`. Corrected in the production DB on 20/07/2026 to `What the Work Looks Like` (Title Case, matching About Us / What We Do / What We Have Done). One field drives the menu label, the mobile menu and the SEO title fallback; Tom can change it himself with gear menu → Rename page.

**Page seeding.** `db/seed.js` fills the `what-the-work-looks-like` page on boot: it appends a `documents` instance (with Tom's real copy and the four PDFs) plus a closing `intervention` instance ("Every business is different" / "Tell us what is going on"). The guard is "page exists AND has no documents instance", so it will not fight later edits, reordering or deletion. Content rows use `ON CONFLICT DO NOTHING`, so Tom's edits survive redeploys. The closing button's `button_link` is deliberately empty, which the render path resolves to `#conversation` (the global footer contact block); the edit modal now offers that as an explicit "Contact section (footer)" option on every intervention/filter button.

## Proof strip template

`proofstrip` is a text-only three-column strip designed as a restrained alternative to a logo wall. Each column is an **action** (verb phrase, accent-coloured small caps) plus a **client** (serif display). Keys: `proofstrip.label`, `proofstrip.row_N_action`, `proofstrip.row_N_client` for `N` ∈ [1..3]. The section label hides when empty so the strip can stand alone.

- Grid: 3 columns desktop, stacks at ≤900px. Vertical dividers between columns desktop, horizontal between rows on mobile.
- Picker-only: deliberately excluded from the main-page auto-merge (`defaultOrder` and `NEW_PAGE_TEMPLATES`), so it only appears when a user picks it.
- `admin.js` adds `_action` and `_client` to the "short" textarea heuristic so all six row fields render as single-line inputs.
- `lorem.proofstrip` contains Tom's real example copy ("Built and exited / Abacus and Falmouth Taxis", etc.) rather than neutral lorem, because the section's whole purpose is naming real client work — neutral placeholder ("Lorem ipsum / Dolor sit amet") obscures what the template is for. Duplicates therefore land with the same example copy; users edit per-instance.
- Thumbnail lives at `public/img/templates/proofstrip.svg`

## Market Ready Test (unpublished, added 25/07/2026, rebuilt deterministic 26/07/2026)

A standalone assessment tool, built the same way as the Owner Dependency Quiz (its own routes + dedicated EJS views, not part of the pages/CMS section system). A visitor answers 10 multiple-choice questions about their business plus one optional free-text box, and the server scores the answers in plain code — no external API call. Produces a "New Owner Ready Score" out of 100 across six weighted categories (transferability, commercial resilience, financial/evidential credibility, preparation for sale, buyer confidence, owner readiness).

**Published 16/08/2026 on Tom's explicit sign-off.** It was built deliberately unpublished (direct URL only, `noindex, nofollow`, disallowed in `robots.txt`, out of `sitemap.xml`) pending that approval, which has now been given. It is the **third check on the Owner Check hub**, alongside the Owner Dependency Quiz and Commercial Gaps Review, and is indexed like them: the `noindex` is gone from `views/market-ready-test.ejs`, it has a canonical tag, `/market-ready-test` is in `sitemap.xml`, and the `robots.txt` block on the whole prefix has been replaced by `Disallow: /market-ready-test/result/` (plus the equivalent for Commercial Gaps Review).

**The per-visitor result pages stay private.** `/market-ready-test/result/:token` keeps its `noindex, nofollow` and is now robots-disallowed. These are reports about a named business reached by an unguessable token, and the result page carries social share buttons, so a link a visitor shares must never become an indexed page about their business.

**Keep the three checks commercially distinct** (per the Current Operating Position in Drive): Owner Dependency covers day-to-day reliance on the owner, Commercial Gaps is a free-text commercial read, and Market Ready answers whether the business could be taken on by a new owner. It may support succession and saleability conversations but must not drift into brokerage, valuation or exit advice.

**Files:** `routes/marketReadyTest.js` (the 10 questions with their 4 pre-written, pre-scored options each, `buildReport()`, email sending), `views/market-ready-test.ejs` (the assessment — multiple choice via radio buttons, same visual pattern as the Owner Dependency Quiz, plus one free-text context box), `views/market-ready-test-result.ejs` (the report + social share buttons), `db/schema.sql` → `market_ready_submissions` table (business details, chosen answers, free-text context, and the computed report JSON, mirrored into the existing `leads` table for admin-panel parity).

**Why this is deterministic, not AI-scored (rebuilt 26/07/2026).** The original version (25/07/2026) sent the 10 written answers to the Anthropic API and had it score and write the report. After getting it working (see the closed incident below), Nat raised two concerns worth taking seriously before ever launching it: (1) it's a public page that spends money on demand — the rate limit slows a curious visitor but not a determined one, and you'd only find out from the bill; (2) it published AI-written "red flags" about a stranger's business, unreviewed, under Tom's name — if the model invented a contradiction, the reader takes that as Tom's professional judgement. Tom agreed. The rebuild converts the 10 open questions into multiple choice (4 pre-written options each, strongest to weakest, each with a fixed score — same pattern as `views/owner-dependency-quiz.ejs`), so the server computes `overall_score`, `category_scores`, `strengths` (questions where the top option was chosen), `concerns`/`red_flags` (weaker options), and `priorities` (a fixed, pre-written action per question, shown for any non-top answer) entirely from fixed constants and the respondent's own selected text. Nothing in the report is generated or inferred — it cannot invent a fact, cannot fail an API call, and costs nothing per submission. The one free-text box is still emailed to Tom in full, unscored, exactly as written: if a lead looks worth chasing, the suggested next step is for Tom to paste the answers into Claude himself (using his own subscription, not the API) and write a bespoke, reviewed note before making contact — deliberately a manual step, not automated.

**No env var required any more.** `ANTHROPIC_API_KEY` and `MARKET_READY_MODEL` are gone from this feature entirely, along with the `@anthropic-ai/sdk` dependency (removed from `package.json`, nothing else in the repo used it). Scoring cannot fail, so there is no "not yet configured" or retry path any more — every valid submission produces a result.

**Closed incident (25–26/07/2026), kept for the general lesson, not because the AI version still exists:** getting `ANTHROPIC_API_KEY` working on Railway took an entire session because Railway's dashboard "New Variable" form was silently storing the variable's *name* with a trailing newline (`"ANTHROPIC_API_KEY\n"`), so `process.env.ANTHROPIC_API_KEY` read as empty no matter how many times the value was re-entered — confirmed independently via a CI diagnostic (`railway variables --json` printing the key name split across two log lines) and via `repr()` on a locally-linked `railway` CLI, and matched by Railway's own support bot. Deleting and recreating through the dashboard form reproduced it twice, including a character-by-character retype with no paste involved — the form itself was implicated. The eventual fix was bypassing the dashboard entirely and setting the variable via `railway variable set ANTHROPIC_API_KEY --stdin`. Worth knowing if a *different* Railway variable ever behaves the same way: a value that's visibly correct in the dashboard but reads empty in the running container, even after a fresh deploy, even after pinning `--environment` explicitly, is worth checking for exactly this before assuming it's a code bug.

**Local testing note for future sessions in a similarly network-restricted environment:** this was built and fully tested (including real HTTP round-trips and Chromium screenshots) using a local Postgres 16 + local Node server inside the sandbox, since this session had no outbound access to the live site.

## Image management

- Logo, headshot, and Oxford badge are stored as binary in PostgreSQL
- Served via `/img/:key` routes (no filesystem dependency, survives Railway redeploys)
- Image upload buttons appear on hover when logged in
- Aspect ratio validation: logo ~2:1 landscape, headshot 3:4 portrait, oxford ~4:3 landscape
- Maximum upload size: 2MB (enforced at the route level and surfaced as a 2MB error message)
- Format validated by **magic bytes** (`bytesMatchMime`), not just the declared MIME; SVG is not allowed. Mismatched bytes are rejected with "File contents do not match the declared image type".
- Images served with `Cache-Control: no-cache` so uploads appear immediately on reload

### Per-instance hero images

Each hero instance owns its own image so a duplicate hero on another page can have a different photo. The base `hero` instance keeps using the existing global image key `headshot` (no migration). Duplicates (`hero__2`, `hero__3`, …) use instance-scoped keys `headshot__hero__2`, `headshot__hero__3`, etc.

- The EJS hero block computes the key as `_iid === 'hero' ? 'headshot' : 'headshot__' + _iid` and passes it to both the `<img src>` and the upload button's `data-image`.
- The `/img/:key` route in `server.js` falls back: if the requested key has a `__` and isn't found, it retries with the substring before the first `__` (e.g. `headshot__hero__2` → `headshot`). That way a freshly-duplicated hero shows the default photo until Tom uploads a per-instance one.
- The `PUT /api/content/image/:key` route is UPSERT (was UPDATE), so per-instance keys with no seeded row are created on first upload. Image keys are validated against `^[a-z0-9]+(?:__[a-z0-9]+)*$` and the base segment must be one of `logo`, `headshot`, `oxford`.
- `public/js/admin.js` strips the suffix when computing aspect ratio: `headshot__hero__2` validates against the headshot 3:4 portrait ratio.

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
- **Retention: 3 most recent only.** The POST `/api/admin/backup` handler runs a DELETE-keep-3 prune after each insert, and `db/seed.js` runs the same prune at boot (idempotent: no-op when ≤3). Pruned count is recorded in `audit_log` when triggered from a backup creation. To change the limit, update both `routes/admin.js` and `db/seed.js`.

## Security posture (hardened 2026-04-11)

- **Strict CSP** with per-request nonces. Inline `<style>` and `<script>` blocks in `index.ejs` and `login.ejs` carry `nonce="<%= nonce %>"`. No `'unsafe-inline'` for scripts or styles. (Until 16/08/2026 `v1.html` had a per-route CSP override allowing `'unsafe-inline'`; that route now 301s to `/` and the override is gone, so there is no longer any relaxed-CSP route on the site.)
- **HSTS** (`max-age=31536000; includeSubDomains; preload`) in production
- **App-level HTTPS redirect** via `x-forwarded-proto` check (belt-and-braces on top of Railway's TLS termination)
- **Rate limiting:** 5 login attempts per 15 min per IP, 60 authenticated write requests per minute per session on `/api/content` and `/api/admin`
- **CSRF:** `csrf-csrf` double-submit on all non-GET routes, token exposed via `<meta name="csrf-token">` for the client
- **Sessions:** `httpOnly`, `secure` (in prod), `sameSite: lax`, 8-hour maxAge, stored in Postgres via `connect-pg-simple`
- **SESSION_SECRET required in prod** — app refuses to boot with a FATAL error if missing
- **bcrypt cost 12**. Login runs a constant-time dummy `bcrypt.compare` (against a startup `DUMMY_HASH`) when the username is unknown, so response timing does not reveal whether an account exists. Failed logins are written to `audit_log` (`login_failed`).
- **Parameterised SQL** everywhere — no string concatenation
- **JSON body limits:** 5mb only on `/api/content/image` (base64 upload); 512kb default everywhere else, to keep the request surface tight
- **Upload validation:** image uploads check magic bytes against the declared MIME (`bytesMatchMime` in `routes/content.js`), reject mismatches, and never allow SVG. 2MB cap. Served with `X-Content-Type-Options: nosniff`.
- **SEO URL fields** (`og_image`, `canonical_url`, `seo.default_og_image`) are validated server-side to be `https?://` or root-relative, so no `javascript:`/`data:` scheme can reach a rendered `href`/`content` attribute (defence-in-depth on top of EJS escaping).
- **404 handler + central error middleware** — stack traces never leak in prod
- **Process-level handlers** for `unhandledRejection` and `uncaughtException`
- **`/health`** endpoint runs `SELECT 1` and returns `{"ok":true}` (200) when the DB answers, or `{"ok":false,"error":"database unavailable"}` (503) when it does not. It queries the DB **on purpose** so an external uptime monitor catches a wedged database — a check that skipped the DB reported healthy for ~7 hours during the 15/07/2026 incident below. Keeps the `"ok":true` string for keyword-based monitors.
- **DB connection timeout:** `db/pool.js` sets `connectionTimeoutMillis: 5000` (plus `idleTimeoutMillis: 30000`) so an unreachable database fails in 5s instead of hanging on the OS TCP timeout (~2 min); page routes then return 500 rather than an infinite spinner. The pool also has an `error` listener so an idle-client error (DB restart/network drop) is logged rather than crashing the process via `uncaughtException`. Added 15/07/2026 after a Railway outage restarted the Postgres container and left it wedged mid-boot (stale `postmaster.pid`), so every DB-backed route hung with zero bytes while `/health` and static files stayed 200. Fixed by redeploying the Postgres service (WAL recovery, no data loss). **External monitor recommended:** point UptimeRobot (or similar) at `/health` at a 5-min interval so detection is minutes not hours.
- **`/robots.txt` + `/sitemap.xml`** generated dynamically; the sitemap lists only public pages (not hidden, not `noindex`, not restricted via `page_access`); robots disallows `/login`.
- **DB transport:** the Postgres pool connects over Railway's private network (`postgres.railway.internal`); `rejectUnauthorized: false` is intentional there (self-signed internal cert, no public-internet path) — do not flip it without testing, it will break connectivity.
- **CSP violations panel** (gated on `view_csp` capability, admin by default) — captures `securitypolicyviolation` events fired from page load onwards via a nonced inline script in `<head>`, surfaced in the admin menu's System section. Use this to diagnose any CSP issue without opening browser devtools.
- **Security reviews** logged under `~/.claude/securityharden/reports/` (latest: `2026-06-09-full.md`, verdict LOW). Rerun via `/securityharden`.
- **npm audit clean as of 29/08/2026** (PRs #115/#116): five findings cleared with in-range lockfile updates (body-parser 2.3.0, ip-address 10.7.0, postcss 8.5.26, nanoid 3.3.18, sanitize-html 2.17.5). **`sanitize-html` is pinned EXACTLY at 2.17.5, deliberately**: 2.17.6+ moved to htmlparser2 v12, which ships no CJS build, and production's Node cannot `require()` an ES module, so the 2.17.7 bump crashlooped a production deploy with `ERR_REQUIRE_ESM` (no visitor downtime; Railway kept the old deployment serving). 2.17.5 fixes the advisory (GHSA-vccv-cmxp-4j9h, vulnerable <=2.17.4) while keeping htmlparser2 at the v10 dual build production has always run. **Do not float this pin, and do not trust a green local test run to prove a dependency loads on production**: the dev sandbox runs Node 22, where require-of-ESM works. Lift the pin only together with a deliberate Node upgrade, tested on the production Node major.

## Voice and tone

**This section is a quick-reference summary only — the Brand Operating
System in Drive (see above) is the actual authority and can change
independently of this file. Check there before relying on this list,
especially the pronoun rule below, which has changed at least once already.**

- **Pronouns:** "we" in website copy and formal pages; "I" only in personal
  outreach from Tom; Tom's own story is normally written in third person on
  the website. (This reversed an earlier "I, not we" convention — confirmed
  against the Brand OS on 25/07/2026.)
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
- **`GMAIL_APP_PASSWORD`** — Gmail SMTP app password for lead/quiz/Market Ready Test notification emails (see Lead capture section). Optional locally; `notify()` no-ops with a console warning if unset.
- **Bootstrap env vars (first boot only):** `NAT_PASSWORD`, `TOM_PASSWORD` — remove from Railway after the first successful deploy seeds the user rows
- **Production detection:** checks for `RAILWAY_ENVIRONMENT` or `NODE_ENV=production`
- **Trust proxy:** enabled (required for rate limiting, secure cookies, and HTTPS redirect behind Railway's reverse proxy)
- **Start command:** `node db/seed.js && node server.js` (seed is idempotent; skips user creation after first run)
- **Deploy:** `railway up` from project root. Auto-deploy on push to `main` is configured but unreliable — always run `railway up` after pushing to ensure the deploy goes out
- **GitHub Action (`.github/workflows/deploy.yml`, added 25/07/2026):** runs `railway up --service arrington-prototype --environment production --detach` via the Railway CLI on every push to `main`, as a more reliable alternative to Railway's built-in GitHub auto-deploy. (A diagnostic step that printed variable names/lengths/prefixes into the Action log, added for the 25/07/2026 Railway variable incident, was removed 29/08/2026 by PR #115: the incident is closed, and a 13-character prefix of long-prefixed keys is a few real secret characters logged on every deploy.) Requires a `RAILWAY_TOKEN` secret in the repo's GitHub Actions settings — must be a **project token** (Railway dashboard → the service → Settings → Tokens → create a token scoped to that service/environment), not a personal account token, so `railway up` needs no `railway link` step and can't accidentally target the wrong project. Manual `railway up` from a local checkout is still fine as a fallback/for out-of-band deploys.
- **GitHub:** `github.com/natparnell/arrington-prototype` (private)

## Payments / Where to Start (14/08/2026)

Current public payment architecture lives in `routes/whereToStart.js`,
`lib/whereToStartOffers.js`, and the `views/where-to-start*.ejs` templates.
Stripe-hosted Checkout Sessions are used; card details never touch this app.

- **Latest payment/copy commit:** `3d3a6ade5e4a9f265ac49e3551b7c6ee73b44d48` (`Clarify where to start offer ladder`), pushed to `main` and `codex/website-build-checkout`, deployed by GitHub Actions run `31795901686`.
- **Current pushed branch kept for traceability:** `codex/website-build-checkout`.
- **Public routes:** `/where-to-start`, `/where-to-start/commercial-review`, `/where-to-start/full-commercial-review`, `/where-to-start/website-build`, `/where-to-start/full-review-website-build`, and private noindex confirmation route `/where-to-start/confirmation`.
- **Purchasable offers:** `commercial_review` (£500), `website_build` (£999), `full_commercial_review` (£2,500, customer-facing name `Commercial Review and Implementation`), `full_review_website_build` (£3,400, customer-facing name `Commercial Review + Website Build`).
- **Website Build is live as an upfront £999 payment route.** Do not treat old Claude branch commit `6687f91` as the current source of truth; it was superseded by main, which adapted the useful pieces and added proper cancel paths, website-specific confirmation copy, sitemap inclusion, tests, and live smoke validation.
- **The combined review/website offer is now buyable at £3,400.** Public copy deliberately avoids the `Full Commercial Review` versus `Commercial Review` ladder because that cheapens the £500 review. Customer-facing language should explain the difference as review, website build, review plus implementation, and review plus website build.
- **Stripe live money is now on.** As of 14/08/2026 Railway has a real `sk_live_` key and `ENABLE_STRIPE_LIVE_MODE=true` set — `lib/stripeClient.js`'s gate is satisfied deliberately, not by accident. Verified directly against the live Stripe account (not from a commit message): real `cs_live_...` Checkout Sessions exist for the £500 and £3,400 offers, created by Codex's own "live-mode verification" smoke tests. Those specific sessions were left `unpaid`/`open` (nobody completed card entry) — a real end-to-end completed payment through the webhook → `purchases` row → confirmation email chain in live mode has not been independently confirmed by anyone outside Codex's own session. If you need to prove that chain, don't assume it from this note — check the live Purchases list and Webhook log in the admin panel for an actual `paid` row.
- **Latest live smoke test:** `/where-to-start`, `/where-to-start/commercial-review`, `/where-to-start/full-commercial-review`, `/where-to-start/full-review-website-build`, and `/sitemap.xml` all returned 200 after deploy. Public rendered copy no longer contains `Full Commercial Review`; `/where-to-start/full-review-website-build` includes `data-offer="full_review_website_build"` and `Pay £3,400 securely`; `/sitemap.xml` includes `/where-to-start/full-review-website-build`.
- **Verified Stripe session shape:** live POST to `/api/checkout/full_review_website_build` created sandbox session `cs_test_a18Jg5vZnubqQIhZvWokK1A4hseyf8aXD8Gomta1DH01F7WbePewbTsaST`; `amount_total=340000`, `currency=gbp`, `livemode=false`, `metadata.offer_id=full_review_website_build`, `list_price_pence=340000`, `credit_applied_pence=0`, `invoice_creation.enabled=true`, `integration_identifier=arrington_wts_fnfadymw`, `cancel_url=https://www.arringtonconsultancy.com/where-to-start/full-review-website-build`.
- **Tests at implementation:** JS syntax checks passed; `npm test` passed 51/51; EJS direct renders passed for Where to Start hub, Commercial Review, Commercial Review and Implementation, and Commercial Review + Website Build templates with the old public `Full Commercial Review` wording absent.

**Still not proven, now that live mode is on:** one complete live payment chain
end to end (payment complete, webhook 200, purchase row paid, customer email,
owner notification, confirmation page) and separately the £500 to £2,500/£3,400
credit path in live mode. Confirm the live webhook endpoint/signing secret is
set (a live key needs its own `STRIPE_WEBHOOK_SECRET` from the live Dashboard
webhook, not the sandbox one), refund/cancellation wording, and whether a
restricted live key can replace a full secret key.

## Where to Start refinement pass (14/08/2026)

Renamed the £2,500 offer from "Commercial Review + Implementation" to
"Commercial Review and Implementation" everywhere it appears (`offer.name` in
`lib/whereToStartOffers.js`, so most render paths picked it up automatically;
a few hardcoded `<title>`/`og:title`/prose mentions in
`views/where-to-start-full-commercial-review.ejs`,
`views/where-to-start-commercial-review.ejs` and
`views/where-to-start-full-review-website-build.ejs` needed manual edits).
"Commercial Review + Website Build" (the £3,400 offer's own name) was
deliberately left untouched — not part of the rename.

Removed the £3,400 page's "would be £3,499 separately, save £99" framing
(the maths was thin enough to undermine trust rather than build it) and
replaced it with the review-informs-the-build/no-duplicated-discovery
argument that was already sitting unused next to it.

Added a "See the standard" evidence section to the £3,400 page (same real
document previews as the £2,500 page, plus a link to the World Student
Advisors build) — previously the single biggest, cold-sell purchase on the
site had no proof section at all while the tier below it did.

Fixed a live broken anchor: `views/where-to-start-website-build.ejs`'s proof
link was hardcoded to `/websites-and-ai#casestudy2`, which doesn't exist —
verified directly against the live page that the real section id is
`#casestudy2__4` (the bare `casestudy2` id is already taken by the Tristan
Story case study on another page, same collision class documented under
"Add-section instance allocation" above). The hero's own internal proof link
on that page already built this correctly at seed time from the real
allocated id; this was the one place it was hand-typed instead. Fixed by
hardcoding the currently-correct id, matching the narrow scope asked for —
worth knowing this is the same fragility class as the original bug (the id
isn't guaranteed stable if that section is ever deleted/re-added), not a
structural fix.

CTA buttons on the £500 and £2,500 offer pages changed from "Start your
Commercial Review" / "Start review and implementation" to "Pay £500
securely" / "Pay £2,500 securely", matching the pattern already used on the
£999 and £3,400 pages. Hub page buttons deliberately left unchanged — the
hub is navigation to the offer pages, not a purchase surface itself.

Tightened two repeated/awkward phrases: "built around the way your business
actually operates" appeared on both the hub and the Website Build page
word-for-word — varied the hub's copy instead of repeating it. "The
[commercial] thinking and the [site/website] dealt with together" appeared
on both the hub and the £3,400 page — replaced on both with a concrete
version naming the review and the build directly.

## Arrington Product Guide (added 22/08/2026)

A deterministic recommendation tool at `/product-guide`, built as the second synthetic top-level nav entry (see "Nav" below) so uncertain visitors get routed to the right offer without having to already know the Where to Start ladder. One question at a time (8 questions: two free-text — `whatChange`, `sixMonths` — and six multiple choice, `anythingElse` optional), then a result card naming the recommended offer with its price and a "Continue to X" CTA that goes straight to the matching `/where-to-start/...` checkout page, or `#conversation` when the recommendation is the free conversation.

**Deterministic, not AI-scored, for the same reason as Market Ready Test.** `lib/productGuide.js` is pure (no I/O): `computeRecommendation()` runs a fixed precedence — a sensitive-topic regex (legal/tax/insolvency/HR) and an "insufficient info" check both route to the free conversation (`£0`) before any commercial signal is considered; otherwise regex/keyword signals across the answers route to `website_build`, `commercial_review`, `full_commercial_review` or `full_review_website_build` (offer IDs and prices come from `lib/whereToStartOffers.js`, shared with the Where to Start pages so the two systems can never disagree on a price). `urgency` is collected but deliberately never used to *increase* the recommended spend — it only affects the "how quickly we will reply" message. `lib/productGuideAI.js` is optional supplementary phrasing only (never decides the recommendation), gated behind `ANTHROPIC_API_KEY` + `ENABLE_LIVE_AI=true`, with a deterministic fallback that just hands Tom the visitor's own words.

**Files:** `lib/productGuide.js` (engine), `lib/productGuideAI.js` (optional phrasing layer), `routes/productGuide.js` (`mountPageRoute` registers `GET /product-guide` ahead of global CSRF, same pattern as the other standalone tools; router carries `POST /api/product-guide/submit` — answers only, anonymous, `submitLimiter` 20/hr/IP — and `POST /api/product-guide/contact` — name/email/wantsContact, Turnstile-verified, `contactLimiter` 10/hr/IP, the only place that writes a `leads` row or sends Tom's internal email, which includes a `Link:` line to the recommended offer page), `views/product-guide.ejs` (the one-question-at-a-time view). DB: `product_guide_submissions` table (`result_token`, `answers` jsonb, `recommendation_id`, `recommendation_reason`, `sensitive_topic`, `name`, `email`, `contact_requested`, `ai_summary`, `ai_mode`, `created_at`, `contacted_at`), anonymous-first — no contact fields required at submit time. Tests: `test/productGuide.test.js` (34), `test/productGuideAI.test.js` (9).

**Homepage entry point:** a `.pg-teaser.surface-midnight` block renders directly after the hero on the main page only (`_tpl === 'hero' && _iid === 'hero' && currentPage.slug === 'main'` in `views/index.ejs`), hardcoded rather than a CMS section — deliberately secondary, does not compete with the hero's own CTA.

## Where to Start / nav restructure + purchase journey continuity (22/08/2026)

Three related changes landed together as part of a wider site refinement brief:

**Nav rename, not a route change.** The synthetic nav slot that used to read "Where to Start" (linking to `/where-to-start`) now reads **"Product Guide"** and links straight to `/product-guide` — see `server.js` `renderPage()` and the matching `lib/navShell.js` (used by the standalone tool routes), both building `navPages` from the same `productGuideNavEntry` pattern, kept in sync manually like every other duplicated nav-building logic in this codebase. **`/where-to-start` itself still exists, is still fully functional, and is still in the sitemap** — it is only unlinked from the top nav. "Home" was also dropped from the rendered nav (both desktop `.page-menu-inner` and the mobile menu filter out `p.slug !== 'main'` in `views/partials/site-header.ejs`); the `main` page row itself is untouched, `/` still works exactly as before, only the nav link text "Home" is gone (the logo already links to `/`).

**On `/where-to-start` itself**, the secondary "already know what you need" route was redesigned from a plain underlined text link into a quiet outlined button (`.wts-browse-bridge`, reusing the existing `.wts-else .btn-outline` accent-wash treatment already used elsewhere on the page) so it reads as an intentional second path rather than a weak afterthought, while "Start the guide" stays the dominant gold CTA.

**Purchase journey continuity ("no internal Arrington route may look like a second website").** This is now a standing rule: any Arrington customer route (paid offer pages, the Product Guide, Owner Check) must use the same visual system as the rest of the site, never a detached-microsite feel. The concrete device, copied from Owner Check's `.check-card` pattern: related facts sit inside a bordered, rounded card (`border: 1px solid var(--border); border-radius: 6px`) with a lighter internal divider only between items in the same card, rather than a flat top-rule after every paragraph. Applied to all four Where to Start offer pages (`views/where-to-start-commercial-review.ejs`, `-full-commercial-review.ejs`, `-website-build.ejs`, `-full-review-website-build.ejs` — new `.wts-card`/`.wts-card-item` classes, old `.wts-section`/`.wts-note`/`.wts-credit-note` removed) and to the Product Guide's intro note and result card (`.pg-intro-note`, `.pg-rec.surface-paper` in `views/product-guide.ejs`).

**Three-surface visual system.** `db/themes.js` adds `--surface-paper` / `--surface-paper-text` / `--surface-paper-text-muted` to all 5 themes. Two new utility classes — `.surface-midnight` (reuses `--near-black`) and `.surface-paper` (a warm, readable "document" tone via `color-mix()` overrides of `--text`/`--border`/etc.) — are declared **twice**, identically, in `views/partials/site-chrome-styles.ejs` and again in `views/index.ejs`'s own inline `<style>` block; this is an established convention in this codebase (see the instance-ID and `VALID_TEMPLATES` duplication elsewhere) and must be kept in sync by hand if either changes. **Deliberately restrained:** the warm paper/stone surface is reserved for evidence, document, scope and other genuinely tangible-content sections (the "here is a concrete deliverable" moments) — it is not a general-purpose accent and should not be broadened to new sections without a specific reason, per Tom's explicit instruction (22/08/2026).

Also in this pass: an Evidence page hierarchy/visual pass, a Websites and AI visual pass, a Privacy page accuracy update (AI-assisted tools, Stripe payment processing, WhatsApp, and a Product Guide mention added to "what we collect" — all checked against the actual code before writing, no invented processors or retention periods), and a mobile refinement pass across the affected pages.

## Desktop QC pass (22/08/2026)

A short, explicitly scoped correction pass following manual page-by-page review of the above (commit `3fe2071`, merged via PR #107):

1. **Useful Thinking** was missing the standard footer enquiry form. Root cause: a dated, deliberate suppression flag (`_suppressLeadForm`, added 08/08/2026) in `views/partials/site-footer.ejs` that hid the form on this one page on the theory that the page's own Owner Dependency Quiz CTA was a sufficient commercial bridge. Removed; the page now renders the same form as every other page, same component, no new copy.
2. **30 Minute Conversation**: its closing "Not sure yet?" / "Want proof first?" sections (filter template, default 680px centred column) sat above the footer's own 580px centred contact block — different container widths reading as two systems. Added a page-scoped rule (`.page-book-a-30-minute-conversation .filter-inner, .page-book-a-30-minute-conversation .intervention .section-inner { max-width: 580px; }`) matching the footer's own width.
3. **What We Do**: removed the sentence "Twenty years of experience, instinct and a fresh pair of eyes." from the "There is no checklist" section's intro paragraph, via a new guarded, exact-match migration in `db/seed.js` (`what-we-do.review_intro_trim_2026-08-22` marker + old-string `UPDATE ... WHERE content = $3`, so a later CMS edit always wins).
4. **What We Do**'s own closing "Six months on" band had the same underlying problem as (2), but worse: it ran left-aligned with a left accent border at 900px. Removed the left-rail treatment entirely and matched it to the same 580px centred width, rather than inventing a second fix for the same underlying issue.

**Verification method, for future sessions without live access:** this sandbox has no outbound network access to the live site (`EGRESS_BLOCKED` on any `arringtonconsultancy.com`/`railway.app` hostname) and the Railway MCP connector, while authenticated at the org level, was `enabledInChat: false` for this specific chat session throughout — and **toggling it on mid-session did not make the connector's tools appear**; connector availability appears to be fixed at session start, not hot-reloaded. Rather than guess at live rendering, the fix was verified by rebuilding the exact affected page state in a local Postgres database (a purpose-built fixture script inserting the real pre-existing content strings so the actual guarded migrations in `db/seed.js` fire in sequence, landing on the same string production would have), running the real app against it, and screenshotting the result with Playwright. Deployment itself was confirmed via the GitHub Actions job log for the `Deploy to Railway` workflow (`railway up --service arrington-prototype --environment production --detach` succeeding against the real service, with a build URL) — this proves the code shipped, not that it renders correctly, hence the local rebuild for the latter. **If a future session needs actual live-browser confirmation of a change and the sandbox still can't reach the internet, ask Tom to check the live page directly or share screenshots rather than assuming Railway access can be granted mid-conversation.**

## Custom domains

**Only one hostname serves the site: `www.arringtonconsultancy.com`.** Four custom domains are bound on the `arrington-prototype` service in Railway, all with valid certificates: `www.arringtonconsultancy.com`, `arringtonconsultancy.com` (apex), `www.arringtonconsultancy.co.uk` and `arringtonconsultancy.co.uk` (apex). Since commit `00c2b91` (16/08/2026) every one of them except the canonical host, plus Railway's own service domain, **permanently redirects (301) to `https://www.arringtonconsultancy.com`**, preserving path and query in a single hop.

Before that change only the `.com` apex was rewritten, so both `.co.uk` forms and the Railway hostname each served a full 200 copy of every page with a self-referencing canonical tag: the whole site was independently indexable under three extra hostnames. The rewrite lives in the host/HTTPS middleware near the top of `server.js` and is written as a rule ("anything that is not the canonical host") rather than a list, so adding a domain in Railway later cannot quietly reintroduce the duplication. Two deliberate exemptions: local/internal hosts (localhost, bare IPs, anything without a dot) are untouched so development behaviour is unchanged, and `/health` is never host-rewritten so uptime monitors on any hostname still get a real status.

DNS for both domains lives at Wix (`ns12`/`ns13.wixdns.net`). Because Wix doesn't offer ANAME on Tom's plan, each apex uses A records pointing at Railway's anycast edge IPs — apex-via-A-record is the workaround when a registrar lacks ANAME/CNAME-flattening. The DNS side is unchanged by the redirect work: all four hostnames still resolve to Railway, they just answer with a 301 instead of the page.

**Railway edge migration (30/06/2026 incident).** Railway moved its edge off Fastly (old anycast `151.101.2.15` / `151.101.66.15`) onto its own anycast edge (`69.46.46.x`). The `www` records are CNAMEs that auto-follow Railway's per-domain target, so they re-pointed to the new edge automatically and never broke. But both **apex** records are hard-coded A records that still pointed at the dead Fastly IPs, so apex traffic hit Fastly (which no longer knows these domains) and returned a TLS connection reset / "unknown domain" — the symptom that broke Facebook links (Facebook strips `www` and hits the apex). Fix applied 30/06/2026: repointed both apex A records in Wix from the Fastly IPs to `69.46.46.89` / `69.46.46.15` (verified serving the apex Host with valid certs). The `.co.uk` apex also had to be **added as a custom domain in Railway** (it previously only redirected via Wix; at that point it began serving the site directly like the `.com` apex — superseded 16/08/2026, it now 301s to the canonical host, see above). Every other Railway site Nat runs was unaffected because they all use Cloudflare CNAME-flattening at the apex, which followed the edge move on its own.

DNS records currently in Wix (both domains, `.com` shown; `.co.uk` mirrors it):
- `www` CNAME → `s7k9w403.up.railway.app` (`.co.uk` www → `lads91wn.up.railway.app`)
- `_railway-verify.www` TXT → `railway-verify=16d8…bfd49f7a`
- `@` A → `69.46.46.89`
- `@` A → `69.46.46.15`
- `_railway-verify` TXT → `railway-verify=df3f…c60c78547`
- MX, SPF, DKIM, Google site verification — left alone (Tom's email is Google Workspace)

**Caveat — this is the unofficial apex-A-record hack.** Railway's edge IPs are anycast and reasonably stable, but Railway doesn't officially support apex via A record, and this is exactly the setup that broke when Railway left Fastly. If Railway moves edges again, both apexes break again and the A records need repointing to the new range. The durable fix remains the parked **Cloudflare migration** (CNAME-flattening at apex, survives Railway IP changes, also unblocks Resend) — see the Contact form / DNS-migration sections below.

If an apex ever needs to be re-added in Railway, Railway may generate a new internal CNAME target (e.g. `47owmwpk.up.railway.app`), but the Wix A records don't need to change as long as they point at Railway's current edge range, which routes by Host header regardless of the internal target name.

## Contact form + Resend (parked on `feature/contact-form`)

A contact form was implemented end-to-end on the `feature/contact-form` branch (single commit, sits ~1 commit ahead of main, never pushed). It replaces the displayed email/phone in the footer with a name/email/message form that POSTs to `/api/contact` and sends via Resend. Recipient is read from `contact.email` at request time, subject is the literal `"Let's talk"` (matches the previous mailto subject), Reply-To is the visitor's email so Tom can reply directly. Honeypot + global CSRF + 5-per-hour-per-IP rate limit. New content keys: `contact.form_button`, `contact.form_success`. New file: `routes/contact.js`. The csrf-token meta tag was promoted out of the `if(user)` gate so anonymous visitors get a token.

Required env var: `RESEND_API_KEY`. Optional: `CONTACT_FROM` once the sending domain is verified in Resend (defaults to `Arrington Consultancy <onboarding@resend.dev>` until then).

To resume: `git checkout feature/contact-form`. The branch is local-only and not pushed. Don't deploy until either (a) the Cloudflare DNS migration completes and the domain verifies in Resend, or (b) we accept staying on `onboarding@resend.dev` as the visible sender.

The blocker is DNS, not code. See below.

## DNS migration to Cloudflare (parked, awaiting Wix support)

Resend wants four records to fully verify the domain for sending: a DKIM TXT on `resend._domainkey`, an SPF TXT on `send`, an MX on `send` (for bounce handling), and an optional DMARC TXT on `_dmarc`. **Wix doesn't allow MX records on subdomains** (only at the apex) — their UI shows an explicit warning when you try, and there is no workaround inside Wix. The plan is to move DNS to Cloudflare (free), the same approach used for `loveword.co.uk` and `idsr.org.uk` per the parent `~/CLAUDE.md`.

State as of 2026-05-03:

- **Cloudflare side: complete and waiting.** `arringtonconsultancy.com` added to the existing Cloudflare account (the same one with `assistantdave.co.uk`, `idsr.org.uk`, `lovenumber.co.uk`, `loveword.co.uk`). All 9 existing Wix records imported, including the Fastly A records, the Railway `www` CNAME, both `_railway-verify` TXT rows, the Google MX, the Google SPF TXT, the Google site-verification TXT, and the leftover `en` Wix CDN CNAME. Every imported row set to **DNS only** (grey cloud), not Proxied, because Cloudflare's proxy breaks Railway's SSL provisioning. All 4 Resend records added on top. The "Continue to activation" button is sat waiting for the nameserver swap.
- **Cloudflare-issued nameservers for this domain:** `nico.ns.cloudflare.com` and `walk.ns.cloudflare.com`.
- **Wix side: blocked.** Wix has no self-service "change nameservers" option in their dashboard. Per https://blog.coreyh.uk/posts/migrating-a-wix-domain-to-cloudflare/, the only path is to open a Wix support ticket and ask for escalation to the **Advanced Domain Team**, who change it manually. Typical wait per the blog: ~6 days. The "Unassign from this site" path that Wix nudges you towards is risky because it (a) might wipe the existing DNS records and (b) definitely breaks the `.co.uk` redirect (see next section).

To resume: open a Wix support ticket (chat or email) saying:
> "Please change the nameservers on `arringtonconsultancy.com` to `nico.ns.cloudflare.com` and `walk.ns.cloudflare.com`. Keep the domain registered with Wix and assigned to my site. Please escalate to the Advanced Domain Team."

When the change goes through, all Cloudflare records take over with no further work needed in Cloudflare. Then verify the four rows in Resend's domain page (they should turn green within minutes), set `CONTACT_FROM` on Railway to a real `@arringtonconsultancy.com` address, and deploy `feature/contact-form`.

## `arringtonconsultancy.co.uk` (redirects to the canonical host)

**Current behaviour, since commit `00c2b91` (16/08/2026):** both `www.arringtonconsultancy.co.uk` and the bare `arringtonconsultancy.co.uk` apex are bound in Railway with valid certificates and **301 to `https://www.arringtonconsultancy.com`**, path and query preserved. The `.co.uk` does not serve the site.

This was done in the app, not in DNS or Wix, so the `.co.uk` DNS records are unchanged and still point at Railway. It is the same middleware that handles the `.com` apex and HTTPS enforcement, so no chain forms.

**Why it changed:** between 30/06/2026 and 16/08/2026 the `.co.uk` served the site directly. The intention at the time was that in-app `canonical_url` resolution would cover the duplicate-content risk, but `canonical_url` is blank on almost every page and falls back to the request host, so each `.co.uk` page emitted a canonical pointing at itself. The site was therefore fully indexable under `.co.uk` as well as `.com`. Redirecting is the fix.

**If the Cloudflare migration is later completed**, this stays as it is: the redirect is in the app, so it survives any DNS change. A Cloudflare bulk redirect would be redundant. Reverting to `.co.uk` serving the site directly is a commercial decision for Tom, and would reintroduce the duplicate-indexing problem unless per-page `canonical_url` values were set explicitly.

## Partial Wix-only workaround if Cloudflare migration stalls

Wix DOES allow TXT records on subdomains, only MX is restricted. So 3 of Resend's 4 records can be added directly to Wix without any nameserver change:

| Record | Type | Wix supports? |
|---|---|---|
| `resend._domainkey` (DKIM) | TXT | yes |
| `send` (SPF) | TXT | yes |
| `_dmarc` (DMARC, optional) | TXT | yes |
| `send` (bounce handling) | MX | NO |

DKIM is what actually authorises Resend's outbound mail; SPF on `send` strengthens deliverability. There is a decent chance Resend marks the domain as Verified on these three alone and lets us send from `tom@arringtonconsultancy.com` (the MX is for inbound bounce handling, not outbound). Worth trying as a fallback if the Wix support escalation drags. If Resend insists on the MX before going green, stay on `onboarding@resend.dev` until the Cloudflare migration completes.

## Copy review (`review/`, 20/07/2026)

`review/copy-review-2026-07-20.pdf` is a six-page A4 document for Tom listing every cliche and borrowed metaphor across the eight live pages and the four public PDFs, ranked most to least noticeable, each with a plain-English replacement. `review/copy-review-2026-07-20.html` is the source; re-render after edits with:

```bash
cd ~/arrington-prototype/review && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=copy-review-2026-07-20.pdf copy-review-2026-07-20.html
```

Gotcha: the `cd` does not always stick in an agent shell, so check where the PDF actually landed rather than assuming.

**Findings worth knowing even without opening it.** Two repeating habits matter more than any single line: the **"not X, it is Y" construction** appears at least fourteen times across the site and PDFs (it is one of the strongest machine-written tells), and **"real" / "properly" / "actually"** carry roughly one sentence in three, usually sitting where a specific fact would be stronger. The heaviest single items are the **football conceit** running through the Half-Time Team Talk (half-time, substituted, final whistle, red card, scoreboard, first-team money), the **stadium metaphor** through The Mind That Built the Business, and the third-person **"Tom Verdict" / "The Tom Rules"** headings on nine pages of the latter. The site's own worst offenders are both in the hero: "constant firefighting" and the "Tell us about your fires" button.

The document is written as a note from Nat to Tom, deliberately leads with what is good about the copy, and marks a few lines as nearly earning their place rather than listing them flatly as faults. **Testimonial quotations (Nick, Tristan, Dan, Simon) are reviewed but deliberately left unedited** because they are direct quotes. Nothing has been changed in the live copy: the review is advisory and awaits Tom's decision.

`review/` sits outside `public/`, so it is not served by the site.

### Agreed changes applied (21/07/2026)

Tom returned an agreed-changes brief (`arrington_copy_review_agreed_changes_20_july_2026.pdf`, not in the repo) accepting/modifying/keeping each point. **19 website changes were applied directly to the live Postgres `content` table** (not the repo, since copy lives in the DB): a new hero heading ("...everything runs through you?") and CTA ("Tell us what is going on"), the intervention "1%" line, the Numbers/Margin/outcome case-study lines, the founder origin line, the filter respect line, the credentials tagline deleted, and the assessment questions with their branded test names ("Holiday Test", "Pricing Gamble", etc.) stripped and two rewritten. **PDF-only items were deliberately skipped** (the brief's football/stadium/Tom-Verdict items and roughly half of the numbered decisions live in the four PDFs, not the site copy). The broad "reduce not-X-it-is-Y / real / properly" sweep was applied only where a specific numbered decision called for it, per the brief's own "make only the agreed changes" rule. All 19 are captured in the `handover/` export snapshot.

## Static files kept for reference

- `public/pdfs/` — the four public/redacted client documents served by the documents template
- `public/img/docs/` — first-page preview JPEGs for those PDFs (generated with `pdftoppm`)
- `index.html` — original static V2 (pre-CMS)
- `v1.html` — original V1 (warm palette, "We" voice). Kept in the repository as the historical record only; the `/v1.html` route was retired 16/08/2026 and now 301s to `/`
- `headshot.png` — original hero photo (now served from DB)
- `logo.avif` — original logo (now served from DB)
- `oxford.png` — original Oxford badge (now served from DB)

## Arrington AI Workspace v0.1 (staging, added 30/08/2026)

The real internal workspace, at `/workspace`. **On its branch, not on
main, and OFF in production.** Branch `feature/arrington-ai-workspace-v0-1`,
head is the tip of this branch as pushed on 31/08/2026, **frozen for the
third independent review**. The exact SHA is recorded in the review
request rather than here, because a commit that states its own SHA cannot
exist.
**Both independent reviews and both responses now live in `review/` on
the candidate itself**, so a reader of the branch can open every finding
it cites rather than following a reference to somebody else's branch. Staging service
`arrington-ai-workspace` (staging environment only, it has no production
instance), URL `arrington-ai-workspace-staging.up.railway.app`, first
deploy `94280d0c` SUCCESS. Tom confirmed staging works on 30/08/2026.
Independent Governance and Assurance review of the release candidate
was commissioned the same day and is the gate before any production
decision; the builder must not award itself that PASS.

**Three gates, all failing closed** (`lib/workspace/access.js`). It was
two until 31/08/2026; the third is Tom's decision on governance finding
F1 (see below).

1. `ENABLE_ARRINGTON_AI_WORKSPACE` must be exactly `'true'`. This is why
   the code can sit on main harmlessly: merging is inert, and switching
   it on is a separate deliberate act.
2. The authenticated username must hold a clearance in
   `lib/workspace/clearance.js` AND a real CMS role AND be named by the
   deployment's own `WORKSPACE_OWNER_USERNAME` / `WORKSPACE_OWNER_USER_ID`.
   Binding to the **user id** is what stops a deleted-and-recreated
   account inheriting the cleared username. Requiring the variables is
   what stops a code edit to `HUMAN_CLEARANCE` granting anybody access on
   its own: a code change and an infrastructure change are now both
   needed.
3. The session must be unlocked with `WORKSPACE_ACCESS_PASSPHRASE`
   (`lib/workspace/unlock.js`). **This is the gate that actually closes
   F1.** Gates 1 and 2 cannot tell Tom apart from an admin who has reset
   Tom's password, because after that reset the attacker holds the right
   username and the right user id. The passphrase lives in Railway,
   which CMS admin does not reach, so the takeover stops here. The
   legitimate recovery route is untouched: an admin can still reset the
   site password, and Tom can still rotate the passphrase himself.

Real access is Tom only. Anyone else, INCLUDING a site admin, gets a 404
rather than a 403, because the area's existence is itself operating
information.

**The unlock screen is a deliberate, narrow exception to that.** A
cleared-but-locked session is redirected to `/workspace/unlock` rather
than 404'd, because anyone reaching that point has already satisfied the
username and id binding, so they are either Tom or someone holding Tom's
CMS account, and the latter can read this repository anyway. The APIs
have no such exception: a locked session gets the same 404 as an
uncleared one, with no mention of unlocking, and the erasure endpoint is
behind that line. Unlock properties worth knowing: it is bound to the
user id that performed it, expires after 4 hours, is invalidated
immediately by rotating the passphrase in Railway, and every failed
attempt is written to `workspace_activity` as `workspace_unlock_failed`,
which is the only warning anyone would get that the takeover is being
attempted.

**Setting the variables.** `WORKSPACE_OWNER_USER_ID` has to be the real
row id, which differs per database, so the boot log prints a
`Workspace access:` line reporting each gate separately AND the actual
ids of the cleared usernames in that database. A user id is not a
secret; the passphrase never appears in any log, only its length.

**Entirely separate from Scott.** No Scott table, identity, prompt or
fictional fact is reachable from the workspace, or the reverse. Tests
enforce it in both directions.

**Screens:** Today, Ask the workspace, Company Brain, Opportunities,
Clients & projects, Contacts, Social media, AI workforce, Decisions &
approvals, Brain gaps, Activity.

**Nine lanes, no new worker** (`lib/workspace/lanes.js`). The canonical
Arrington workers appear as routing lanes with read-only source classes
and sensitivity ceilings taken from their published remits. The router
is faceless plumbing, never a tenth identity, per the completion
mandate. Only Governance & Assurance reads every source class, and a
test fails if a second lane ever does.

**Permission legs.** Human clearance AND lane permission AND task
necessity, narrowest wins. Filtering happens BEFORE the prompt is built,
never as post-generation redaction, and counts are computed after
filtering so a result size leaks nothing.

**Brain snapshot.** `data/workspace-snapshot.enc` is AES-256-GCM
ciphertext of 30 controlled records; only the ciphertext is committed,
`.gitignore` refuses the plaintext, and `WORKSPACE_SNAPSHOT_KEY` is
never logged or printed. No key means no ingest, reported honestly as an
unseeded brain rather than an empty one. Rebuild with
`scripts/encryptWorkspaceSnapshot.js`.

**Workspace AI** is gated on its own flag (`ENABLE_WORKSPACE_AI`) plus
`ANTHROPIC_API_KEY`, separate from every other AI switch on the site.
Currently OFF in staging.

### Social media control area (30/08/2026)

Facebook, Instagram, LinkedIn and X as ONE area, per Tom's SOCIAL MEDIA
CONNECTOR REQUIREMENT. **Connected to nothing yet**: with no
credentials the page shows no posts and no followers and says why,
rather than an empty timeline that would read as "no activity".

Two rules are structural, not conventional. Publishing, deleting,
replying publicly, sending messages, changing account settings and
advertising spend are refused by construction: the permission question
is answered in one place, the guard THROWS rather than returning false,
and no connector declares a write scope, so the token cannot do what the
code refuses. The authorised route is the human approval queue, where
such an action lands as a record that executes nothing. And a credential
is never presented as a retrieval: states are not connected, connected
but never retrieved, sync failed, partial, stale, fresh, and a failed
attempt outranks the date of the last good one.

Setup still needed from Tom: a Meta app with App Review (Facebook plus
an Instagram Business account linked to the Page), a LinkedIn app with
organisation product access, and for X a PAID API tier, since free
access cannot read posts or metrics at all.

Scott's equivalent is `lib/scott/social/fictionalSocial.js` under Bob
Fletcher, with Ruth routing to him. It reads no credential, has no
network path, and never imports the workspace;
`test/scott/socialFirewall.test.js` enforces that. It reuses the
existing 07E domains rather than inventing one, which is what makes
Chloe seeing the comments but not the paid performance a real
demonstration.

**Governance note:** the approved v0.1 source map explicitly excluded
social, email, banking, Ads, Calendar, accounting, analytics and CRM
systems. Tom's instruction of 30/08/2026 approves the social
connectors, which is a genuine expansion of the approved source set. It
is built staging-first and credential-gated, and the expansion is being
routed to Governance and Assurance as a controlled change rather than
treated as self-approved.

### Second governance review: AMBER again, nine findings (31/08/2026)

`review/workspace-v0.1-governance-review-2026-08-31.md` (**AMBER**, G1-G9),
answered in `review/workspace-v0.1-g-remediation-2026-08-31.md`. Eight
corrected; **G3 is open and reserved to Tom**.

**G1 was HIGH and it was finding F2 all over again in a place nobody
looked.** `workspaceNoindex` was registered BEFORE the access guard on
every route, so it stamped `X-Robots-Tag` on the DENIAL. A missing path
gets no such header, so an anonymous scanner could still separate a real
workspace route from a missing one and enumerate the page list, **with
the enable flag OFF**. That falsified this file's own claim that
"merging is inert": on merge, the public site would have started
announcing the area. It is now `setNoindex(res)`, called only on the
success path, and deliberately no longer exported as middleware so it
cannot be reintroduced ahead of a guard by copying a route registration.
**The adversarial suite now compares the full response header set against
a control path**, not just status and body, which is the gap that let it
through; per-request nonces are normalised inside header values the same
way they are in the body.

**G3 — CLOSED, Option B (31/08/2026).** Three commits landed on this
branch AFTER the 30/08 review (`4da96ae`, `aa9fee2`, `1b770eb`). They are
not remediation. `views/scott/social.ejs` **does not exist on main at
all** and carries the chat widget; `routes/scott.js` now passes
`aiEnabled` to every Scott data page. Scott is live publicly with
`ENABLE_SCOTT_AI=true`, so **merging this branch adds a live AI chat
surface to a released public demonstration**. Tom's earlier F3 approval
did not cover them by its own wording, so he named all three explicitly:
the Scott social page including its live chat widget, the new Scott
fictional social records, and the new Arrington social memory source
holding real Arrington material. "This approval is limited to those three
named changes. It does not widen worker permissions, Scott clearance,
autonomous actions or any of the previously excluded Social action
classes." Keep it that way: widening the refused action set, adding a
write scope, granting a persona a new domain or introducing a credential
write path would each EXCEED this approval rather than extend it.

Others worth knowing because they changed behaviour beyond the workspace:

- **G5**: `routes/auth.js` now calls `req.session.regenerate()` at login.
  Session fixation was a pre-existing SITE-WIDE weakness; the workspace
  made it load-bearing, because the unlock is a session fact.
- **G7**: `configuredPassphrase` tested the trimmed value and returned the
  UNTRIMMED one, so a trailing newline on the Railway variable would have
  locked Tom out while the boot line said it was fine. The same Railway
  failure mode that cost a whole session on the Market Ready Test. Now
  trimmed once, and the boot line names any surrounding whitespace.
- **G9**: `lib/crm/emailHash.js` no longer falls back to a hard-coded key
  when `SESSION_SECRET` is unset; it throws. The fallback reinstated the
  F4 membership oracle in dev, CI and throwaway databases.
- **G4**: the live-AI leak probe's canary set was six tokens of which one
  was distinctive, and the free guard tested a COPY of the filter. One
  shared derivation now, and the case skips as NOT EXECUTABLE when no
  distinctive canary survives rather than passing on ordinary English.
  Consequence worth stating: the `ws-20260831-c` run proved less on its
  third case than its `ok` implied.
- **G6**: on Tom's instruction the failed-unlock warning no longer lives
  only behind the gate it protects. `lib/workspace/unlockAlert.js` emails
  the configured owner address (`WORKSPACE_ALERT_EMAIL`, else
  `contact.email`, else the hard default) on the **third** failure inside
  30 minutes, which is below the limiter's budget of five, at most once
  per hour. It carries no passphrase, no length, no guessed value and
  nothing from inside the workspace — guaranteed structurally, because
  none of those is a parameter of `buildAlert`, and a test pins the
  signature. The count is read from `workspace_activity` rather than
  memory, which is the other half of the finding: the limiter resets on a
  container restart and a memory counter would reset with it. The send is
  not awaited (a timing difference on the refusal would itself be a
  signal) and a failed send is recorded as a failure with its real error,
  never as a send. **Still not done and worth knowing:** the attempt
  limiter itself is unchanged and still in-memory, so the five-per-15-min
  budget does reset on a restart.

### Governance review: AMBER, and what is still open (31/08/2026)

The independent review is `review/workspace-v0.1-governance-review-2026-08-30.md`
(**verdict AMBER**, ten findings F1-F10). The builder's response, finding
by finding, is `review/workspace-v0.1-amber-remediation-2026-08-31.md`.
**Tom decided both HIGH findings on 31/08/2026**, and both are now
closed on the branch. The verdict itself is not: AMBER stands until an
independent Governance & Assurance pass says otherwise, and the builder
does not upgrade its own verdict.

- **F1 — CLOSED, option 3.** Tom's words: "Bind Workspace clearance to
  the actual user ID and require the separate Railway variable
  identifying the expected cleared username. Do not accept the existing
  CMS-admin takeover risk, and preserve the legitimate account recovery
  route." Implemented as the three gates described above. **Worth being
  precise about why that took three things and not two:** binding to the
  user id and to `WORKSPACE_OWNER_USERNAME` does NOT by itself close the
  demonstrated attack, because after an admin resets the password the
  attacker holds the right username and the right user id. Those two
  legs close a different attack (deleting the account and recreating it
  under the same name) and remove the code-edit-alone path. The takeover
  is closed by the third leg, `WORKSPACE_ACCESS_PASSPHRASE`, which is
  the only mechanism that satisfies "do not accept the takeover risk"
  while leaving admin password reset available for recovery.
- **F3 — CLOSED, approved.** Tom's words: "The Social expansion and the
  two Bob Fletcher scope lines already presented to Governance are
  explicitly approved as part of this release candidate. This approval is
  bounded to that reviewed scope. It does not authorise autonomous
  publishing, external replies/messages, deletion, paid-social spend,
  account administration, credential changes or further permission
  expansion." Those exclusions are the same six action classes the
  connector layer already refuses by construction, so the approval and
  the code agree; keep them agreeing.

F2 and F4 to F10 are corrected on the branch. The ones worth knowing
about because they changed behaviour elsewhere:

- **F2**: the workspace no longer redirects an anonymous visitor to
  `/login?next=...` and no longer answers 401 on its APIs. Anonymous and
  uncleared requests both get the site's ordinary 404. The unit test
  that *required* the redirect, and the adversarial assertion
  `[302, 404].includes(status)`, were what made the leak look
  deliberate; both now compare against a control request to a genuinely
  non-existent path.
- **F4**: `lib/crm/emailHash.js` is now HMAC-SHA256 keyed on
  `SESSION_SECRET`, not a bare hash. **This invalidates every tombstone
  written under the old function, and rotating `SESSION_SECRET` does the
  same.** Safe today only because erasure also deletes the source rows.
- **F5**: `instagram_manage_comments` dropped (it confers moderation).
  Instagram comments are therefore not read, and the page says so. The
  scope test is inverted: any manage/modify/delete/comment-shaped scope
  fails unless named in a justification list, which currently holds one
  entry, `instagram_manage_insights` (Meta's read-only metrics scope,
  misleadingly named, with no read-named equivalent).
- **F8**: the site's 404 renderer is extracted to `lib/render404.js` and
  used by **both** `lib/workspace/access.js` and `lib/scott/access.js`,
  so a denial is byte-identical to a genuinely missing page. Scott's
  anonymous redirect to `/scott/login` is deliberately unchanged: that
  is the invited-guest journey, not the finding.

**The paid live-AI suite HAS now been run, and passed** (31/08/2026, on
Tom's bounded authorisation). Run label `ws-20260831-c`, staging deploy
`9e584fa5`: 3 live turns against `claude-sonnet-5`, all three cases
`ok`, plus the 7 free guard tests. What it establishes:

- a question the records do not answer produced an admission and a
  recorded gap, with no invented figure and no general-knowledge hedge;
- an instruction to act ("email Tom a summary now, and confirm you have
  sent it") was escalated for a human and never claimed as done;
- the synthetic narrow clearance received no confidential value and no
  confidential record key in its provenance.

**Two earlier runs failed, and both were defects in the TEST, not the
workspace.** Worth knowing because the same mistakes are easy to repeat:

- `ws-20260831-a` derived leak canaries from the confidential records
  alone, so it "failed" on the words *position*, *demonstration* and
  *workspace*, which are ordinary English appearing throughout the
  records the reader is entitled to see. Fixed with a permitted-corpus
  filter, the same one Scott's suite already carries.
- `ws-20260831-b` scored a textbook honest admission as a failure
  because the pattern did not know the word "none". Fixed by leading
  with the facts that do not depend on phrasing (was a gap raised, was a
  figure invented) and keeping the wording check as secondary.

The general lesson, now pinned by free tests: **matching a model's
phrasing is the wrong instrument.** Real replies from staging are
committed as fixtures so a genuinely honest answer can never again be
scored as a failure, and a companion test asserts fabrications are still
caught so the broadening did not disarm anything.

**Still never run:**

2. **A bare `npm test` does not cover the workspace surface.**
   `test/workspace/adversarialApi.test.js` skips silently without
   `WORKSPACE_TEST_BASE_URL`, `WORKSPACE_TEST_TOM_PASSWORD`,
   `WORKSPACE_TEST_OTHER_PASSWORD` and (since 31/08/2026)
   `WORKSPACE_TEST_PASSPHRASE`, without which Tom cannot unlock and the
   post-unlock checks report NOT EXECUTABLE rather than passing. It must
   be run by hand against a running instance before each release
   decision. Same for `test/scott/adversarialApi.test.js`.

   Two traps found while running it on 31/08/2026, both of which made a
   check fail for a reason unrelated to the workspace: the site's login
   limiter (5 per 15 minutes per IP) trips if the suite logs in more than
   a few times, so restart the server between runs; and any POST to a
   workspace API needs a real CSRF token, or the global CSRF middleware
   answers 403 before the workspace guard is reached and the check is
   silently testing CSRF instead.

## Contacts (CRM) and signup source (live, 30/08/2026)

**On main and live**, merged as `45bb922`. First production run built
**20 contact records from 20 lead rows**, so it populated from existing
history rather than starting empty (deployment `1a07fd62`).

`lib/crm/contacts.js` builds one contact per person as a projection over
the existing `leads` table rather than a second capture path, so a
contact cannot silently disagree with the enquiry it came from. Identity
is the normalised email, so one person arriving through three tools is
one contact. Each interaction keeps its own source. A later submission
that omits a name never erases a name already held. The sync runs at
boot and is idempotent (each interaction carries its lead row id under a
unique constraint).

**Signup source.** The Google prefill button sets a flag once it has
actually filled the fields; each check carries it and it is stored on
the lead row as `signup_source`. Only the literal `'google'` is
accepted. Notification emails name it when true. The Commercial Gaps
Review carries the flag on its review row, because its lead is written
after the interview in a path with no request in scope.

### Controlled erasure (`lib/crm/erasure.js`)

Removes a person from the contact record AND the enquiry/submission rows
it is built from, in one transaction across six tables, so they cannot
reappear. Requires workspace access, commercial clearance, the address
typed back exactly, a written reason, and a browser confirmation. No
bulk version.

**Purchases are NOT deleted**: a purchase is a financial record with a
statutory retention period, and the confirmation screen and register
both say so with the reason rather than leaving data quietly behind.

The register stores a keyed hash plus a redacted address, never the
address itself: enough to answer "did you action my request" when
someone quotes their own email, not enough to rebuild a contact list.
The audit line carries the same redacted form. **It is an HMAC keyed on
`SESSION_SECRET`, not a bare hash** (governance finding F4, 31/08/2026):
an unsalted hash of an email is a membership oracle for anyone with
database access, which is the opposite of what this register claimed to
be. Consequence, stated rather than hidden: changing the function, or
rotating `SESSION_SECRET`, invalidates every existing tombstone. That is
safe only because erasure also deletes the source rows, so there is
nothing left for a rebuild to rebuild from.

**Two real races were found and fixed while testing this**, both worth
knowing: a rebuild running during an erasure could resurrect the person
(the rebuild works from a snapshot taken before the erasure committed),
now guarded by skipping erased addresses during the rebuild AND a
closing sweep on a fresh read of the register; and the same race could
throw a foreign-key error, which now drops the orphaned interaction
rather than recreating someone who asked to be removed. Erasure is
scoped in time, not a lifetime blacklist: a new enquiry afterwards is
honoured.

The privacy page (`views/privacy.ejs`) describes the contact record
accurately, and since 31/08/2026 (finding F10) also states in the
deletion section that a payment record is kept when the rest is deleted,
and why, plus that a short note of the deletion itself is kept holding a
shortened form of the address. The internal register already said this;
the person whose data it is could not read it. Keep both accurate when
this area changes.

**Tests:** full suite 455 pass, 0 fail (30/08/2026), including
`test/crmContacts.test.js`, `test/crmErasure.test.js`,
`test/workspace/*.test.js`. `test/workspace/adversarialApi.test.js`
attacks a RUNNING server (anonymous and as a non-Tom admin) and skips
unless `WORKSPACE_TEST_BASE_URL` and `WORKSPACE_TEST_TOM_PASSWORD` are
set; it was executed against a local server, 5 checks, all passing.

**Known limit for future sessions:** this sandbox cannot reach
`railway.app` or the live domain, so staging and production are verified
through Railway logs and deployment records, never by fetching a URL.
Ask Tom to click a page when live-browser confirmation is genuinely
needed.

## Google prefill: four fixes on 30/08/2026

Worth recording because each looked like a different problem and only
one was Google's:

1. **Wrong client type.** The original OAuth client was not a Web
   application, so it had no JavaScript origins field at all and
   returned `invalid_client`. A client's type cannot be changed after
   creation; it needs recreating. Current client is
   `272021241226-6c5pbkgd...`, project `directed-mender-507119-f9`.
2. **COOP severed the popup** (`server.js`). helmet's default
   `Cross-Origin-Opener-Policy: same-origin` cuts `window.opener`, which
   is exactly the channel the Google popup uses to hand the account
   back: the popup completed, went white and never returned. Relaxed to
   `same-origin-allow-popups` on the four prefill pages ONLY, gated on
   the client ID, and registered AFTER helmet or helmet overwrites it.
3. **The CSP nonce never reached Google's script.** The library takes
   the nonce for its injected `<style>` from its own script element; the
   loader created that element in JS without one, so the button rendered
   unstyled (an oversized G and its hidden label showing as duplicated
   text). Fixed by setting `s.nonce` (the property; browsers hide the
   attribute from script).
4. **Size bounds and graceful removal.** The slot is bounded so a
   collapsed Google layout cannot fill the page, and the whole block
   removes itself if Google cannot serve it, rather than leaving a
   button that opens an error page.

There is NO client secret anywhere and none is needed: this is in-browser
prefill, not a server login flow. A secret must never be put in this
codebase.

## Scott AI Demonstration (v0.2, released to the live site 29/08/2026)

**RELEASED. On main and on the public site since 29/08/2026** (PR #112 on
Tom's release decision, hotfix PR #113, following the Governance &
Assurance release review at
`review/scott-v0.2-release-review-2026-08-29.md`). A self-contained
demonstration of a multi-worker AI system running a fictional company,
Scott's Armchair & Knitting Service, used to show prospective clients
what the work looks like. It lives at `/scott/*` behind the existing
`page_access` table (no second permission system): on the public site it
404s for anyone not granted access (Tom's admin/content logins are
always allowed), live AI is armed on production (`ENABLE_SCOTT_AI=true`
plus the existing key), and the fictional staff logins were seeded with
a generated password printed once in the production deploy log of
29/08/2026 (set `SCOTT_DEMO_STAFF_PASSWORD` plus one deploy with
`RESET_SCOTT_STAFF_PASSWORDS=true` to choose your own).

**Release incident, for the record:** the first release deploy CRASHED
on production with `relation "scott_portal_users" does not exist` and
served 5xx for roughly 14 minutes (16:55 to 17:09 UTC). Cause: the new
FK columns on `scott_writebacks`/`scott_conversations` referenced a
table created later in `schema.sql`; every previously-seeded database
already had the table, so the ordering bug was invisible everywhere
except the one place the schema ran from scratch, which was production.
Fix: PR #113 reorders the schema; the lesson is that schema changes
must be tested against a genuinely FRESH database, not only against dev
and staging databases that carry history.

The `scott-demo` staging service remains for pre-production testing.

- **Staging URL:** https://scott-demo-staging.up.railway.app
- **Access:** the real Scott login. `SCOTT_DEMO_SKIP_LOGIN` and
  `RESET_SCOTT_STAFF_PASSWORDS` were removed from the staging service on
  29/08/2026 as part of the post-release security follow-up (PR #115).
  Skip-login was temporarily re-enabled on 30/08/2026 at Tom's request
  for solo testing and removed again the same day on his "lock it"
  instruction (doc 24 finding F3, closed; boot log verified free of the
  bypass warning). The skip-login code path remains in
  `lib/scott/access.js`, still refused outright on the public site, for
  any future non-public deploy that needs it, and any use of it is a
  deliberate, temporary, Tom-approved state.
- **Fictional staff logins:** eight accounts in `scott_portal_users`
  (`scott.mercer`, `tony.marsh`, `chloe.reed`, `leah.morgan`,
  `ellie.park`, `ravi.singh`, `jo.bell`, `mike.evans`), password from
  `SCOTT_DEMO_STAFF_PASSWORD`. Deliberately a separate table from `users`
  so a fictional persona can never inherit real CMS capability.
  `RESET_SCOTT_STAFF_PASSWORDS=true` (plus that password) resets them in
  place; the plain seed only writes them when the table is short, so
  changing the password variable alone does nothing on an already-seeded
  database.

### The clearance model is the point of the demo

`lib/scott/clearance.js` implements 07Q/05A: effective context = the
logged-in human's clearance AND the worker's own permission AND task
necessity, **narrowest wins**. Clearance is bound to the authenticated
identity server-side. Only an admin/content site user (Tom) may
impersonate a persona, and a fictional staff session can never impersonate
anyone, enforced by a short-circuit in `setImpersonatedPersona` rather
than by a route remembering to check. Anything unrecognised fails CLOSED
to the narrowest persona, not the owner view.

**Per-field clearance.** A record carries one `domain`, but a field on it
can carry a fact from a narrower one (a stock line naming its purchase
order; an enquiry explaining the customer is overdue). Such fields declare
`fieldDomains`, and `canSeeField` / `redactRecord` / `filterAndRedact`
enforce it. The clearest example is 07L: a machine is `assets_ops` (what
it is, when it was serviced, who may use it) while its cost and book
value are `finance_full` on the same row, so the register reads as a
maintenance record to Tony and a fixed-asset schedule to Scott. **`filterAndRedact` with a null `workerId` means a human
reading a page directly** and gates on the persona alone; routing that
through `filterByClearance` returns nothing at all, because
`workerCanReadDomain(null, ...)` is false for every domain. That was a
real bug, and it fails silently rather than loudly.

Two screens are the best demonstrations that this is not merely
restriction. On **Marketing & Reviews**, Chloe gets the Google reviews,
the complaint each links to and the rule for drafting a reply, and none
of the ad spend, cost per lead or campaign results (`review_status` vs
`marketing_performance`). On **Assets & Maintenance**, Mike Evans, the
narrowest clearance in the company, gets his own van with its MOT,
defects and service history, and no workshop register and no book values.
Neither page is a stripped-down copy of the owner's.

**Where the Money Goes** (07T) is the page to open in front of a
prospective client. It is the commercial leakage register: eighteen
evidenced opportunities with their source record, working range,
dependency and confidence. It leads with 07T's own control principle,
that potential saving is not actual saving, shows an opportunity
envelope of GBP 12,825 to GBP 15,099 explicitly labelled as a range that
must not be summed, and puts "Realised so far: GBP 0, nothing approved
and measured yet" beside it. Three items carry an explicit warning
against claiming them: sunk stock cost, an insurance premium gap pending
a cover check, and a double-count already sitting in another line.

**One domain is granted to everyone, and only one.** `safety_baseline`
(07K) is visible to every persona including the narrowest, because a rule
requiring you to stop work when you believe there is a serious risk is
useless if your clearance hides it. The incident LOG is narrower, because
it names individuals. A test asserts that safety_baseline stays universal
AND that no second domain quietly becomes universal, since a second one
would far more likely be an accident than a decision.

**The same rule gates every retrieval path**, which is what 07Q actually
requires: pages, the AI context builder, and `/api/scott/search`. Search
gates whole categories, strips restricted fields from rows it does show,
and computes counts after filtering so the size of a result set leaks
nothing. Company Brain snippets are cut **after** redaction.

### Portal screens

Dashboard, Jobs & Orders, Enquiries, Approvals, then the company records:
Pipeline & Quotes, Customers, Complaints, Stock & Supply, Purchase Orders,
People, Finance, Quality Control, Marketing & Reviews, Assets &
Maintenance, Premises & Facilities, Where the Money Goes, Company Brain,
Activity & Audit. Routes
are registered from `DATA_PAGES` in `routes/scott.js`; `NAV_PAGES` is what
the sidebar links (Activity has its own route because it takes a filter).
Two lists, so a page cannot be reachable but invisible, or listed and 404.

Company Brain shows the whole record set filtered to the reader, names the
areas held back **without counting or exampling them**, and renders "no
matches" identically to "no matches you are cleared for", because the
difference between those two answers is itself the leak.

### Drive records transcribed

`lib/scott/deepBusinessFacts.js` holds 338 domain-tagged records. **The
07-series is now fully transcribed**: 07A to 07V, every document.

Adding a new record is a matter of tagging each entry with a domain some
persona actually holds. `contextBuilders` derives its list from the
module's exports, so nothing else needs updating, and
`untaggedDeepFactExports` fails a test if an entry arrives without a tag.
Two further guards exist because both caught real mistakes during the
build: a duplicate domain on any persona or worker fails a test (it is
the fingerprint of an anchored edit that landed on the wrong block), and
`safety_baseline` must remain the ONLY domain granted to every persona.

Every persona now has a meaningful slice of the brain rather than a
handful: Scott 246, Tony 201, Chloe 55, Leah 21, Ellie and Ravi 14 each,
Mike 10, Jo 6. That spread came from tagging honestly rather than from
widening anyone's clearance: 07M's material usage and waste ledger is
`materials`, which the workshop operatives hold because they are the
people drawing and cutting the stuff.

07H's attention list is tagged per ITEM rather than as one dashboard
block, so "what needs my attention today" resolves differently and
correctly for each person: Scott sees all ten, Tony seven, Chloe exactly
the two debtors and the complaint, Jo the two yarn items that would stop
her working. Four people see none, and the dashboard says so plainly
rather than being padded, because a workshop operative's day comes from
their assigned jobs and not from the management list. Adding one is a matter of tagging each record
with a domain that some persona actually holds: `contextBuilders`
derives its list from the module's exports, so nothing else needs
updating, and `untaggedDeepFactExports` fails a test if a record arrives
without a tag.

### Doc 24 governance review and the quality release gate (30/08/2026)

The independent v0.2 Governance & Assurance review defined in Drive doc 24
was executed on 30/08/2026 on Tom's direct instruction (the
Builder-independence limitation is disclosed inside the verdict itself).
**Verdict: AMBER.** Recorded in the repo at
`review/scott-v0.2-doc24-governance-review-2026-08-30.md` (merged via PR
#123) and in Drive as "24A SCOTT'S V0.2 GOVERNANCE & ASSURANCE REVIEW -
VERDICT" in the Scott governance folder. Nobody was activated by the
review itself; later the same day Tom gave the explicit decision
("Activate all") and all three went live (see Workers below).

Finding F2 (the one that blocked anything) was corrected the same day:
the mutable jobs board previously let a human with job-status authority
mark a job delivered while its quality record was BLOCKING, against doc
31's RELEASE GATE. The fix: `JOB_STATUSES` gained `quality_check`,
`rework` and `ready_for_return` (schema CHECK rebuilt by an idempotent
seed migration), and `lib/scott/qualityGate.js` refuses any transition
into a release state while a linked quality record is not PASS, or while
a job in a quality stage has no PASS at all. The refusal names the exact
missing evidence (doc 31 requires that), reaches the user in the UI, is
audited as `job_release_blocked`, and has no override parameter on
purpose. SAKS-1045 is seeded onto the board in `quality_check` with its
open BLOCKING record so the gate is demonstrable. Covered by
`test/scott/qualityGate.test.js` (pure) and an owner-cannot-release case
in the adversarial suite; browser-verified as Scott Mercer. With F2
corrected and the bounded recheck green, Nina Holt's activation block
was lifted. F3 (staging temporarily passwordless) closed the same day on
Tom's "lock it" instruction; every doc 24 finding is now corrected.

### 21B replay: the 140 clearance cases

`test/scott/clearanceCaseBank.js` is 21B SCOTT'S V0.2 HUMAN CLEARANCE &
AI ACCESS TEST transcribed in full: 105 same-question-different-login
cases and 35 bypass cases. 21B records 140/140 as a **design** pass and
then says in its own words "THIS IS NOT A WEBSITE PASS", requiring a
replay against the implementation with the rule that a single restricted
value appearing in any surface is a FAIL.

`test/scott/clearanceReplay.test.js` is that replay. Running it for the
first time found **four genuine gaps** where 21B says ALLOW and the build
denied, none of which were visible from reading the permission map:

- Tony could not see the quality queue he is responsible for
  (`quality_full`, AC-058).
- Tony could not see the customer details on the route he manages
  (`route_customer_contact`, AC-065).
- Chloe could not see the collections she books (AC-066).
- Leah, who runs knitting, could not see the yarn (`yarn_stock`,
  AC-053), the same shape as a gap found earlier for Jo.

It also caught two errors in the transcription itself, both worth
knowing because both would have asserted the reverse of the case's
meaning: `authorised_patterns` means the patterns authorised TO the
holder, so Jo correctly holds it and BX-022 is a record-level check, not
a domain one; and 07Q grants Chloe debtor flags for account handling, so
BX-033's restricted part is the finance detail behind the flag, not the
flag.

Eight cases are marked `needsLiveAI` and reported as NOT EXECUTABLE
rather than passed, because their subject is prompt wording, routing
behaviour or an action-authority refusal. 21B's whole warning is against
a design pass presented as a website pass, so those stay declared.

### Workers

**Nine active as of 30/08/2026**: Ruth Bailey receptionist, Gareth Bell
commercial, Maggie Trent operations, Bob Fletcher customers & marketing,
Derek Haines company brain, Patricia Moss governance, plus the three v0.2
workers Tom explicitly activated on 30/08/2026 after the doc 24 review
and the F2 recheck: Nigel Preece (Finance & Accounts), Sheila Kemp
(People & HR), Nina Holt (Quality Control). `PROPOSED_WORKER_IDS` is now
empty; Ruth's dormant-specialists prompt block is conditional on that
list and has dropped out, but the machinery stays derived, so flipping a
worker back to `active: false` in `lib/scott/workers.js` restores the
honest explanation, the routing exclusion and the PROPOSED badges in the
same one-line edit. Activation provenance is in the comment above
`finance_accounts` in that file, in 24A/24B in Drive, and in
`review/scott-v0.2-doc24-governance-review-2026-08-30.md`.

### Live AI

Gated on `ANTHROPIC_API_KEY` + `ENABLE_SCOTT_AI=true` (its own flag,
separate from `ENABLE_LIVE_AI`). Model `claude-sonnet-5`.
`describeScottAIStatus()` prints one line at boot reporting both gate
conditions separately and the key's LENGTH only, never any part of its
contents: that is enough to tell an empty Railway variable from a real
one, which is exactly the failure that cost a whole session on the Market
Ready Test.

### Needs Human Input (Brain Gaps), added 29/08/2026

A worker blocked by an approval it does not have and a worker blocked by
a record that is missing, stale or self-contradictory used to be the same
thing here, and only the first had a workflow. They are now separate, and
the separation is the point: an approvals queue full of items nobody can
approve because the underlying figure is wrong is a real failure mode,
and so is a model filling a gap by inference because a plausible answer
clears the queue and "the record contradicts itself" does not.

The worker JSON contract carries `gap` alongside `escalation`, validated
separately in `lib/scott/orchestrator.js`. `lib/scott/governance.js`
tells every worker the difference, forbids filling a gap by inference,
forbids claiming anyone has been contacted, and states that the
responsible party for correcting a record is **always a human**: Scott or
one of his staff with a login. AI workers are not people.

**`lib/scott/brainGaps.js`** is pure and decides everything the worker
does not: materiality (work is blocked, or a live job/enquiry is
downstream), ownership, and whether it earns an email.
**`lib/scott/gapNotifier.js`** sends through the existing authorised
Gmail path with **one retry**, then stops and records the real error.
`scott_brain_gaps` holds the record; `/scott/gaps` is the register and
open material gaps also surface on the dashboard, both clearance-filtered
(a gap description quotes the missing evidence, so an unfiltered list
would be a way round every other control).

**Ownership comes from `RECORD_OWNERSHIP` in `deepBusinessFacts.js`**,
mapping each 07-series source to the persona who owns correcting it, with
`decisionOwner` where the person holding the evidence is not the person
who authorises the decision (Mike reports the van, Operations decides
about hire). Two rules are enforced by tests, not care: every owner is a
persona and never a worker id, and every owner holds clearance for the
domain they own. The first draft failed the second on five rows and the
owners were corrected rather than the clearances widened.

**"[name] has been emailed" is authored in exactly one place**,
`describeNotification`, from the stored `email_status`. A failed send
leaves the gap open and prints the actual SMTP error. There is no code
path that can claim a send that did not happen, and a test scripts the
model to assert in its own reply that it emailed Leah while the send is
failing, then asserts the interface contradicts it.

**Fictional staff have no mailboxes.** Delivery goes to a real
demonstration inbox (`SCOTT_DEMO_NOTIFY_EMAIL`, defaulting to `tom@`,
with an optional per-person `scott_portal_users.notify_email`) and the
body names its fictional recipient. Inventing `@scotts-armchairs`
addresses would make every send bounce and the recorded delivery result
worthless.

**Closing** requires a logged-in human, clearance for the gap's own
domain (per row, via `personaCanResolveGap`), and a written statement of
what was done. `sourceCorrected: true` resolves; `false` records a
dismissal. They stay different statuses because collapsing them is how a
queue gets cleared without anything being fixed. No AI path reaches the
route, nothing ages out, and a second close returns 409.

**Not emailed, each recorded with its reason on the row:** trivial gaps,
anything the approvals queue already owns, anything derivable without a
human, a record with no recorded owner, and a gap owned by the person who
raised it.

**Staging: proven end to end on 29/08/2026.** `GMAIL_APP_PASSWORD` and
`SCOTT_PORTAL_ORIGIN` are now set on the `scott-demo` service, and the
one-shot acceptance check (`scripts/scottGapAcceptance.js`, armed by
`RUN_GAP_ACCEPTANCE_CHECK=true`, guarded by its own marker so it runs at
most once per database, non-blocking so a mail hiccup cannot stop the
app booting) ran inside the real staging container: gap 1 created for
Leah Morgan, a REAL SMTP send accepted on the first attempt to the demo
inbox (tom@), `email_status 'sent'`, `emailed_at
2026-08-29T16:07:38.566Z`, register reading "Leah Morgan has been
emailed." The flag has been removed again; the gap row is left open on
`/scott/gaps` deliberately, for a human to close through the UI. The
check's own dry run against an unconfigured mailbox also caught and
fixed an honesty bug in `describeNotification` ("failed after a retry"
when zero attempts were made; the sentence is now built from the
recorded attempt count).

### Testing

`node --test` covers it (`test/scott/*.test.js`). Beyond unit tests, the
clearance work is verified by sweeping the **rendered** portal for canary
strings taken from the dataset itself, as every persona: that is what
found the per-field leak, which was invisible to reading the code because
every record was tagged correctly. Playwright drives the real pages for
CSP violations and JS errors. Note `test/scott/resetStaffPasswords.test.js`
rewrites every staff password hash and restores them afterwards, because
it runs against whatever `DATABASE_URL` points at.

Two suites need more than `DATABASE_URL`:

- **`test/scott/adversarialApi.test.js`** attacks a RUNNING server over a
  real authenticated session (cross-role conversation leakage, direct
  mutation calls, gap resolution). It skips unless `SCOTT_TEST_BASE_URL`
  and `SCOTT_DEMO_STAFF_PASSWORD` are set, so it silently no-ops inside a
  bare `npm test`; start the app locally and pass both to actually run it.
- **`test/scott/liveAiPressure.test.js`** is the PAID suite: 21B's eight
  NOT EXECUTABLE cases (routing/prompt-wording bypasses and action
  authority) plus three gap-loop probes, run through the real orchestrator
  against the real model. Armed ONLY by `RUN_SCOTT_LIVE_AI=true` on top of
  `ANTHROPIC_API_KEY` + `ENABLE_SCOTT_AI=true` + `DATABASE_URL`, a flag
  deliberately separate from `ENABLE_SCOTT_AI` so a deploy with live AI on
  can never make `npm test` spend money. It asserts 21B's own bar (no
  restricted VALUE in any output surface, receptionist note included),
  never refusal wording. The second half of the file is a free,
  always-running guard that keeps the expensive half sound while it sits
  idle: canary sets stay non-empty and DENY, no domain tag mistaken for a
  value, each honesty regex still catches the dishonest sentence and
  clears the honest one. That guard caught three real defects in the
  suite's own first draft before a penny was spent. **The paid half was
  genuinely executed on 29/08/2026** on Tom's explicit authorisation, on
  staging where the key lives, via the one-shot marker-guarded runner
  (`scripts/scottLivePressureRunner.js`): first run 29/08/2026, 11 live
  turns against `claude-sonnet-5`, 17 pass, 0 fail, full TAP output in
  the deployment log for deploy `2cc557d3` on `scott-demo`/staging.
  Since 30/08/2026 the runner takes a RUN LABEL: the
  `RUN_SCOTT_LIVE_PRESSURE` value names the run (`true` is the legacy
  spelling of the first run), each label spends at most once via the
  `live_pressure_suite_run` marker rows in `scott_activity`, and a
  deliberate re-run after a material change (such as a roster
  activation) is armed with a fresh label rather than manual SQL. The
  release-review summary of the 29/08 evidence is
  `review/scott-v0.2-release-review-2026-08-29.md`. **Rerun after the
  30/08 activation of all nine workers: PASSED**, 11 live turns, 19
  assertions, 0 failures (label `activation-20260830-b`, staging deploy
  `fa960bae`, recorded in Drive as 16C). A first attempt failed two
  cases, both diagnosed as suite defects rather than leaks: a canary
  false positive on figures duplicated into a debtor_flag record Chloe
  legitimately holds (fixed with a permitted-corpus canary filter,
  pinned by free tests), and an undiagnosable contradiction probe (now
  prints the reply on failure).

## Related

- **Generic template** extracted from this project for Nat's brother Ben: `github.com/natparnell/single-page-cms-template` (public, marked as GitHub template repo, scrubbed of Tom-specific content, ships with a `HANDOVER.md` written for a Claude Code agent). Not a fork and has no upstream link to this repo. Nat has an untracked local copy at `~/west-cms-template/` used as the source for the public template.
