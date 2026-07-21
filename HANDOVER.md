# Handover: Arrington Consultancy website

**Written for Tom Arrington and his Claude, 21 July 2026.**

This note hands the website over from Nat (who built and hosted it) to Tom, who is now taking on management using his own **Railway Pro** account and **Claude Pro**. Read this first. `CLAUDE.md` in the repo root is the deep technical reference; this note is the authority for the handover itself.

There are no em dashes and UK spelling throughout, because that is the house style for this site. Please keep it.

---

## 1. What this is, in one paragraph

The Arrington Consultancy website is a small **Express.js + PostgreSQL** application. It is not a static site. All the words and images you see on the pages are stored as rows in a Postgres database and rendered by the server, and there is a built in editing system (a CMS): when Tom is logged in, every section has a pencil icon and he can edit the copy live, add pages, reorder sections, change images, and so on. There is no build step. To run it you need Node.js and a Postgres database.

- **Live site:** https://www.arringtonconsultancy.com (and the apex, plus the `.co.uk`)
- **Login:** add `/login` to any URL. Tom's account username is `tom`.
- **Code:** https://github.com/Arrington-Consultancy/arrington-website (this repo, in Tom's org)
- **Full technical reference:** `CLAUDE.md` in this repo (long, but complete)

---

## 2. Where it runs *today* vs where it is *going*

Right now (21 July 2026) the site still runs on **Nat's Railway account**: one Node service plus a Railway Postgres database that holds all of Tom's live content. The custom domains are attached to that service. Nothing is broken. The job of this handover is to move hosting and billing onto **Tom's Railway Pro account** so Tom owns the whole thing.

There are two ways to do that. **Option A is strongly recommended** because it does not touch the domain/DNS setup at all, and DNS was the painful part last time.

---

## 3. The one big decision: how to move hosting

### Option A (recommended): transfer the existing Railway project to Tom

Railway can transfer a whole project (the Node service + the Postgres database + the attached custom domains) from one account to another **without changing any DNS**. The database and all its data move with it, the domain certificates stay valid, and nothing in Wix needs touching.

Steps (Nat and Tom do this together, ~10 minutes):

1. Tom makes sure his Railway **Pro** workspace exists and he is logged in.
2. Nat opens the `arrington-prototype` project in Railway → **Settings → Transfer project** → transfers it to Tom's workspace (or to a team Tom owns). Railway will ask Tom to accept.
3. Tom accepts the transfer in his Railway dashboard.
4. Billing is now on Tom's Pro account. The service keeps running throughout; there is no redeploy and no downtime.
5. Tom connects **this GitHub repo** (`Arrington-Consultancy/arrington-website`) to the service for future deploys (see section 6), or keeps deploying with the Railway CLI.
6. Optional: Nat is added as a member of the project so he can still help if asked.

After Option A you can **ignore the whole of section 5 (DNS)**, because the domains never moved. Skip to section 6.

> Nat: if Railway's UI has changed and there is no direct "Transfer project" button between two personal accounts, the fallback is to create a Team, transfer the project into it, and add Tom as an owner of that Team. Same outcome.

### Option B (fallback): stand up a fresh copy on Tom's Railway

Use this only if the transfer cannot be done. It means rebuilding the service from this repo and re-pointing the domains, which does involve Wix (section 5). The live content is preserved by loading the data export in this repo.

Full steps are in section 4.

---

## 4. Option B in detail: fresh standup on Tom's Railway

Do this only if Option A is not possible. Tom's Claude can drive most of it.

### 4.1 Create the project and database

1. In Tom's Railway dashboard: **New Project → Deploy from GitHub repo →** pick `Arrington-Consultancy/arrington-website`. (Tom will need to install the Railway GitHub app on the org and grant access to this repo.)
2. Add a **PostgreSQL** database to the same project (**New → Database → PostgreSQL**). Railway sets `DATABASE_URL` automatically and the app reads it.
3. In the Node service **Settings**, set the **Start Command** to:
   ```
   node db/seed.js && node server.js
   ```
   (The seed is idempotent. It creates the tables and default content on first boot, and after that it skips anything that already exists.)

### 4.2 Environment variables

Set these on the **Node service** (Variables tab):

| Variable | Value | Notes |
|---|---|---|
| `SESSION_SECRET` | a long random string | **Required.** The app refuses to boot in production without it. Generate one with `openssl rand -hex 32`. |
| `NAT_PASSWORD` | *(first boot only)* | Optional. Only needed if you want the legacy `nat` admin seeded. You can skip it. |
| `TOM_PASSWORD` | Tom's chosen admin password | **First boot only.** Seeds the `tom` login. Remove it from Railway after the first successful deploy. |
| `DATABASE_URL` | *(auto)* | Set by the Postgres plugin. Do not edit. |
| `RESEND_API_KEY` | *(leave unset)* | Only for the parked contact form. Ignore for now. |

`RAILWAY_ENVIRONMENT` is set by Railway automatically and is how the app knows it is in production (HTTPS redirect, secure cookies, HSTS).

### 4.3 First deploy and load the live content

1. Deploy. Watch the logs for `listening on http://localhost:8080` (the app listens on `8080`).
2. At this point the site is up but shows the **default seed copy**, not Tom's real live copy. Load the real content:
   - Get the new database's connection string: Railway → Postgres service → **Variables** → copy `DATABASE_PUBLIC_URL`.
   - From a machine with `psql` installed, run the export in this repo:
     ```bash
     psql "postgresql://...DATABASE_PUBLIC_URL..." -f handover/live-content-export-2026-07-21.sql
     ```
   - This is an idempotent upsert file: it restores all 9 pages, every section's copy, the logo/headshot/Oxford images, and the permissions, overwriting the seed defaults with Tom's real live copy. Safe to re-run.
3. Reload the site. It should now look exactly like the live site.

> **Staleness warning:** the committed export is a snapshot from **21 July 2026**. If Tom edited the live site through the CMS after that date, the snapshot is behind. To capture the latest before cutover, ask Nat to re-run `handover/regenerate-export.js` against the current live database (it needs the old DB's `DATABASE_URL`), and load the fresh file instead. Once you are running on Tom's own database, this stops mattering because edits go straight to the new DB.

### 4.4 Point the domains at the new service

This is where Wix comes in. See section 5. In short: for each domain, **add it as a custom domain in Tom's new Railway service**, then update the matching records in Wix so they point at Tom's service instead of Nat's.

---

## 5. Custom domains and Wix DNS (the painful part)

**If you did Option A (transfer), skip this entire section.** The domains moved with the project and already work.

Read this only for Option B, or if a domain ever needs re-pointing.

### 5.1 The setup, and why it is fiddly

Tom's domains are registered at **Wix**, and Wix holds the DNS. There are two domains, each with an apex (bare) form and a `www` form:

- `arringtonconsultancy.com` and `www.arringtonconsultancy.com`
- `arringtonconsultancy.co.uk` and `www.arringtonconsultancy.co.uk`

The awkward bit: Railway wants you to point a domain at it with a **CNAME**, but the DNS standard does not allow a CNAME on an apex (bare) domain, and **Wix does not offer "CNAME flattening" or "ANAME"** on Tom's plan. So the apex has to use **A records** pointing at Railway's edge IP addresses instead. This is an unofficial workaround, and it is exactly the thing that broke once before (when Railway changed its edge IPs). It works, but it is not elegant.

The `www` forms are normal CNAMEs and are easy.

### 5.2 What is in Wix right now (for reference)

For each domain, Wix currently holds:

- `www` **CNAME** → a Railway target like `s7k9w403.up.railway.app` (each domain has its own unique target slug)
- `_railway-verify.www` **TXT** → `railway-verify=...` (an ownership challenge; unique per domain)
- `@` **A** → `69.46.46.89`
- `@` **A** → `69.46.46.15`  (two A records at the apex, both Railway edge IPs)
- `_railway-verify` **TXT** → `railway-verify=...` (apex ownership challenge)
- MX, SPF, DKIM, Google verification records for Tom's Google Workspace email. **Leave all email records alone.**

### 5.3 Moving a domain to Tom's new Railway service (Option B)

Do this one domain at a time. The apex A records usually do **not** need to change (Railway's edge IPs are shared across all Railway projects and route by the domain name), but the `www` CNAME target and both verification TXT values **do** change because they are unique to the new service.

For each domain:

1. In **Tom's new Railway service** → Settings → Networking → **+ Custom Domain**. Add the apex (`arringtonconsultancy.com`) with target port **8080**. Then add the `www` form (`www.arringtonconsultancy.com`) the same way. Railway shows, per domain, a **CNAME target** and a **`_railway-verify` TXT value**. Copy them.
2. In **Nat's old Railway service**, remove those same custom domains (so two projects are not claiming the same host). Coordinate the timing so the gap is short.
3. In **Wix DNS**, for that domain:
   - Update the `www` **CNAME** to the new target slug Railway just showed.
   - Update `_railway-verify.www` **TXT** to the new www challenge value.
   - Update `_railway-verify` **TXT** to the new apex challenge value.
   - Leave the two `@` **A** records as they are, **unless** Railway shows different edge IPs, in which case set them to what Railway shows.
4. Wait a few minutes. Railway provisions the SSL certificate automatically once it sees the records. `www` usually goes green a few minutes before the apex.
5. Verify from a terminal: `curl -sI https://www.arringtonconsultancy.com` should return `200`. Railway's dashboard sometimes says "waiting for DNS" even when it works, so trust `curl` over the dashboard.

**Wix gotchas that have bitten before:**
- Enter DNS names **relative**, not full. In Wix, the name for the apex challenge is `_railway-verify`, and for www it is `_railway-verify.www`. Do not paste the full `_railway-verify.arringtonconsultancy.com` or it ends up doubled.
- Each domain's `railway-verify=...` token is unique. Do not reuse the apex token on www or vice versa.
- Wix does **not** allow MX records on subdomains, only at the apex. This does not matter for the website, only for the parked contact form (see `CLAUDE.md`).

### 5.4 The proper long term fix: move DNS to Cloudflare

The apex A record hack is the root of the fragility. The durable fix, used by Nat's other sites, is to move the domain's DNS to **Cloudflare** (free plan), which supports CNAME flattening at the apex. Then every record including the apex is a CNAME that follows Railway automatically, and Railway edge changes never break anything again. It also unblocks the parked contact form email.

This is optional and not required to run the site. If Tom wants it done, the full step by step (including the Wix support ticket needed to change nameservers, and the exact Cloudflare records) is in `CLAUDE.md` under "DNS migration to Cloudflare". It is a good future task for Tom's Claude but is not urgent.

---

## 6. Everyday operations

### Editing the website copy
Tom does not need Claude or the code for normal edits. Go to the live site, add `/login`, sign in as `tom`, and every section shows editing controls on hover: a pencil to edit text, an eye to hide, arrows to reorder, a cross to delete, and image upload buttons. There is a gear icon (top right) with the admin panel: add/rename/reorder pages, manage backups, change the colour theme, edit SEO, and manage users. Changes are live immediately; there is no deploy needed for content edits, because the copy lives in the database.

### Deploying code changes
Only needed when the *code* changes (not content).
- If you connected the GitHub repo in Railway, pushing to `main` triggers a deploy. Confirm the deploy actually went out in the Railway dashboard.
- Or deploy from the command line: `railway up` from the project folder (after `railway link` to Tom's project).

### Backups
The admin panel has a Backups section (content + images snapshots, keeps the 3 most recent). For a full database backup, use Railway's own Postgres backup features on Tom's plan. **Recommended:** set up an uptime monitor (e.g. UptimeRobot, free) pointed at `https://www.arringtonconsultancy.com/health` at a 5 minute interval. That endpoint checks the database and returns 503 if the DB is down, so you get told within minutes if the site goes dark. This was a real incident once (see `CLAUDE.md`).

---

## 7. Local development (for Tom's Claude)

To run and test changes safely before deploying:

```bash
git clone https://github.com/Arrington-Consultancy/arrington-website.git
cd arrington-website
npm install

# needs a local Postgres, or point at a throwaway Railway DB
export DATABASE_URL="postgres://user:pass@localhost:5432/arrington"
export SESSION_SECRET="dev-secret-local"
export TOM_PASSWORD="choose-a-local-password"   # first run only, seeds the tom login
npm run dev
```

Then open the printed URL (the app listens on `8080` by default). Log in at `/login` with `tom` and the password you set. To make a local copy look like the real site, load `handover/live-content-export-2026-07-21.sql` into your local database with `psql`.

**Never deploy or push to the live site until Tom has reviewed the change.** Content edits go straight to the live database, so treat the CMS with the same care as a deploy.

---

## 8. What is in this repo

- `server.js` — the Express app (security, routing, page rendering, `/health`, sitemap).
- `db/` — database pool, schema, the idempotent seed, default content, colour themes.
- `routes/`, `middleware/` — auth, content API, admin API, the role/permission engine.
- `views/` — the EJS templates (`index.ejs` is the whole public page; `partials/` holds the CMS modals).
- `public/` — CSS, client JS, images, and the four downloadable PDFs under `public/pdfs/`.
- `CLAUDE.md` — **the full technical reference.** Architecture, database tables, every template, the security posture, the domain history, the parked contact form, everything. Long but authoritative.
- `handover/` — this migration's artefacts:
  - `live-content-export-2026-07-21.sql` — restores the exact live copy into a fresh DB (Option B).
  - `regenerate-export.js` — re-generates that export from a live DB if it goes stale.
- `review/` — a copy review Nat wrote for Tom (advisory), not served by the site.

---

## 9. Recent change worth knowing (21 July 2026)

Just before this handover, Nat applied the copy changes from Tom's agreed copy review (the "agreed website changes" document). Nineteen lines across the home page, About Us, What We Do, What We Have Done and Useful Thinking were updated: a new hero heading and call to action, plainer assessment questions with the branded test names removed, and several tightened lines. These were made directly to the live database, so they are already live and are captured in the `live-content-export-2026-07-21.sql` snapshot. The changes that referred to the four PDFs were deliberately **not** made, because the brief was website copy only. Nothing further is outstanding from that review except the diffuse "read it aloud" tidy-up, which is Tom's call.

---

## 10. If something goes wrong

- **Site down / spinning:** check `https://www.arringtonconsultancy.com/health`. `{"ok":true}` means the app and DB are fine; `503` means the database is unreachable (usually a Railway Postgres restart; redeploying the Postgres service fixes it).
- **A domain shows a certificate error:** the domain is added in Railway but not yet verified, or the Wix records are wrong. Re-check section 5.3.
- **`PERMISSION_DENIED` style errors:** not applicable here (that is a Firebase pattern from Nat's other projects); this app uses Postgres.
- **Anything about the code you do not understand:** read `CLAUDE.md`. It is genuinely comprehensive.
- **Stuck:** Nat is happy to be asked.

Welcome aboard, Tom.
