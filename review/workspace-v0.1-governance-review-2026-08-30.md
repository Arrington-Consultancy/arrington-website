# Arrington AI Workspace v0.1: Independent Governance & Assurance Review

Date: 30 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, head `faf49ae` (code identical to `451d47d`; `faf49ae` adds documentation to `CLAUDE.md` only, confirmed by `git diff --stat`).
Commissioned by: Tom Arrington, 30 August 2026.

## The bounded question

Is the Arrington AI Workspace v0.1 release candidate fit for Tom Arrington to take a production release decision on? Nothing more. This review does not authorise a merge, a deploy, an environment variable change, or the connection of any external account, and it did none of those things.

## VERDICT: AMBER

AMBER, not STOP. Nothing is live: the production service carries none of the workspace variables, so a merge is inert, and I verified that from Railway rather than from the code comment that claims it. No code path in the workspace or the CRM makes any outbound network call at all, so nothing can publish, send, delete or spend. Permission filtering is genuinely applied before the model prompt is built, not as redaction afterwards, and I proved that by capturing the actual model call arguments rather than reading the function. Contact erasure genuinely removes data across six tables, survives a rebuild, and declares what it keeps; I ran it end to end against a real database and then swept every text column in that database for the erased address.

AMBER, not PASS. Ten findings are below. Two of them, F1 and F2, bear directly on the claim the area rests on, which is that real human access is Tom alone and that the area's existence is itself protected. One of them, F3, is a governance decision that is not mine or the builder's to take.

Nothing here is a leak of restricted data, an executed consequential action, or a self-granted authority. The findings are gaps between what the code claims about itself and what it does.

## Independence, stated first

I am a separate session from the technical builder, with no part in writing the workspace code, and I did not accept the builder's PASS on any point I could test myself. Every result in the "verified" section below was produced in this session against the code in the repository, a Postgres 16 database I created for the purpose, and the running application.

Two limits on that independence, disclosed rather than buried:

1. I am a Claude session, not a human reviewer, and not the Patricia Moss governance worker.
2. I cannot read Google Drive from this environment. The controlled authorities that the workspace claims to mirror, being the Constitution, the Creation Standard, the Brain Index, the canonical worker register, the v0.1 permission and access control map, the approved source map, and Tom's social connector instruction of 30 August 2026, were not available to me. I could therefore check the implementation against itself and against the repository, but I could not check the register in `lib/workspace/lanes.js` against the register in Drive. Anything resting on those documents is marked below as accepted, not verified.

## What I verified in this session, with observed results

Environment: local Postgres 16, fresh database, `node db/seed.js` from empty, then `node server.js` with `ENABLE_ARRINGTON_AI_WORKSPACE=true`, plus Railway and GitHub read-only queries.

**Fresh-database boot.** The seed ran to completion on a database created from nothing, with no errors. This matters because the Scott v0.2 release crashed production on exactly this case, where every other environment already carried the schema. The workspace schema and the CRM schema both build clean from scratch.

**Regression suite.** `npm test` against a real database: 456 tests, 455 pass, 0 fail, 1 skipped, 53 suites, 155 seconds, reproduced identically on a second run.

The skip accounting is worth stating exactly, because the headline figure flatters the suite. Four top-level entries carry a `# SKIP` directive in the TAP output, all for want of environment: the Scott adversarial suite, the Scott live-AI paid suite, the Websites and AI two-pass seed test, and `test/workspace/adversarialApi.test.js`. The summary counts only one of the four as skipped and the other three among the 455 passes, because three are declared as `describe(..., { skip })` and only the workspace one as `test(..., { skip })`. So the single skipped test the summary reports is the workspace adversarial suite itself. Run alone, `test/scott/adversarialApi.test.js` reports 0 tests, 0 passes, contributing nothing to the total at all.

The consequence: a green `npm test` does not exercise the workspace surface. I armed that suite and ran it against the running server: 6 pass, 0 fail. I note that one of its five checks, the erasure confirmation check, returns early when there is no contact in the database, so it can pass without asserting anything; in my run I created contacts first, and I also tested erasure separately and by hand.

**Both gates fail closed.** With `ENABLE_ARRINGTON_AI_WORKSPACE` unset, every workspace page returned 404 to Tom's own authenticated session and to an anonymous visitor, and both APIs returned 404 to Tom. Only the exact string `true` enables it. With the flag on, a logged-in site admin who is not Tom (`nat`, role admin) received 404 on all eleven pages and 404 on all six APIs, with no workspace content and no counts in any denial body. Anonymous POSTs with a valid CSRF token returned 401. Tom reached all eleven pages, every one carrying both the `X-Robots-Tag: noindex, nofollow` header and the meta tag. `/sitemap.xml` contains no workspace path and no view links to one.

**Production is not carrying the workspace.** Railway, production environment, service `arrington-prototype`: the variable list contains no `ENABLE_ARRINGTON_AI_WORKSPACE`, no `WORKSPACE_SNAPSHOT_KEY` and no `ENABLE_WORKSPACE_AI`. There is a separate service `arrington-ai-workspace`, staging environment only, at `arrington-ai-workspace-staging.up.railway.app`, which does carry the enable flag and the snapshot key, and whose latest deployment (`bcd4f095`, SUCCESS, from branch head `faf49ae`) logged `Workspace ingest: ok, 30 record(s) written` and `Workspace AI: ANTHROPIC_API_KEY MISSING or empty`. Its boot log also reports `Contacts: 0 contact record(s) from 0 lead row(s)`, while the production service's own boot log reports 20 contacts from 20 lead rows. Those two numbers cannot come from the same database, which is the best evidence available to me that the staging workspace is not pointed at live customer data. I could not read `DATABASE_URL` to confirm the host directly, because Railway returns variable names only to this client.

**The intersection rule is applied before the prompt exists.** I seeded six records, one per source class, at three sensitivities, injected a fake model client and captured the exact arguments of the model call. Observed: at `owner_admin` with no lane, only the authority and strategy records reached the prompt, so task necessity is a real leg and not decoration; routed to the opportunity lane, the confidential opportunity record was included; routed to the social content lane, it was not; at the synthetic `ws_restricted` clearance, forcing the widest lane (`governance_assurance`) still yielded standard records only, so the lane leg cannot widen past the human leg; at an unknown clearance, nothing at all reached the prompt. No withheld record appeared anywhere in the captured payload. This is filtering before generation, as claimed.

**No tenth identity.** `lib/workspace/lanes.js` holds exactly nine lanes, in register order, and the system prompt I captured opens "You are the Arrington AI Workspace answering a question for its authenticated owner". There is no orchestrator persona, no control-room worker, and no name attached to the router. The AI workforce page presents the nine as reading contexts, marks the two project workers as such, and states that the register in Drive is the authority.

**No consequential action is possible.** There is no `fetch`, no HTTP client, and no network call of any kind anywhere in `lib/workspace/**`, `lib/crm/**` or `routes/workspace.js`; the only `fetch` calls in the workspace are same-origin calls from the browser views. No connector declares a publishing scope. Live: requesting `publish` on LinkedIn and `advertising_spend` on Facebook each returned an approval record at action class 4 with the note "Nothing has been sent or published", and requesting an ordinary `read` capability through the same route was refused as not needing a human decision. The approvals page shows both as records that execute nothing. A decided approval cannot be decided twice (409), a gap cannot be closed without a written statement (400), and the social area's only mutation is recording that a person replied.

**Erasure removes rather than hides.** Against a real database I created a person with two lead rows, a Market Ready Test submission, a Commercial Gaps Review, a Product Guide submission and a purchase. The preview named exactly what would go and what would stay, including the purchase and its reason, before anything was confirmed. Erasure refused a mismatched address, a missing reason and a three-character reason, and refused without CSRF. On confirmation it removed 8 rows across 6 tables in one transaction. I then swept every text, varchar and jsonb column in the entire database for the address: the only remaining occurrence was `purchases.email`, which is the declared retention. The activity line and the register both carry the redacted form only. I then replayed a pre-erasure lead row and re-ran the rebuild: the address was skipped and the contact was not resurrected.

**Honesty of state.** On an unseeded environment the dashboard says "No sync run has ever been recorded. The brain is unseeded", the Company Brain says "No records. The brain has not been seeded in this environment yet", and the AI panel says "Workspace AI is not enabled in this environment". The social area lists all four platforms as "not connected", says "No credential in this environment. Nothing is retrieved and nothing is shown", and states that with no connector configured "every figure on this page would be invented". None of these render as an empty but healthy state.

**Secrets.** No credential, key or plaintext snapshot is committed. `data/workspace-snapshot.enc` is the only file ever added under `data/` in the branch history, it carries the AES-GCM format marker and no readable structure, and `.gitignore` refuses `data/*.json`. No code path prints a key's contents; the boot line reports presence and length only. Across all tracked files, not only JavaScript, the sole 64-character hex runs outside the lockfile and the test fixtures are hex-encoded image data in the handover SQL export.

**Cross-contamination.** `lib/workspace/**` requires nothing from `lib/scott/**` and the reverse holds. The Scott social module reads no environment variable at all.

**Other checks.** Workspace views contain no unescaped EJS output and build the DOM with `textContent` only; inline style and script blocks carry the CSP nonce and the strict site CSP applies unchanged; the new `safeNextPath` in `routes/auth.js` was extracted and exercised directly, and returns `/` for `//evil.example`, `https://evil.example`, `/\evil.example`, `javascript:alert(1)`, a CRLF header-injection attempt and an empty value, so the login redirect is not an open redirect; the activity log has no update or delete path anywhere in the codebase; navigation counts are computed after clearance filtering. There is no open pull request for this branch.

## What I accepted as reported, and from whom

- **The controlled Drive authorities.** The nine lane names, remits, source classes and sensitivity ceilings, the "no new worker" mandate, the approved v0.1 source map, the permission and access control map, and Tom's social connector instruction of 30 August 2026 are all accepted from the builder's account in code comments and `CLAUDE.md`. I verified the register's internal consistency and its tests, not its fidelity to Drive.
- **That the brain snapshot contains what it claims.** Thirty records were ingested on staging. Without `WORKSPACE_SNAPSHOT_KEY` I cannot read them, so I cannot confirm their classification, provenance or sensitivity tagging is correct. The validation code refuses an unknown source class or sensitivity rather than coercing it, which is the right shape, but the contents are unreviewed.
- **"Tom confirmed staging works on 30/08/2026"** (`CLAUDE.md`). Not verifiable by me.
- **Live AI behaviour.** `ENABLE_WORKSPACE_AI` is set nowhere, so the workspace has never called a model in any environment. Everything I proved about prompt construction used an injected client. Nothing is known about how the model behaves under pressure in this system, because that has never been run.
- **Browser behaviour.** I inspected CSP headers, nonces and markup, and drove the application over HTTP. I did not drive a real browser.

## Findings

Severity: HIGH means it should be corrected or explicitly accepted by Tom in writing before the enable flag is set anywhere reachable from the internet that holds real data. MEDIUM means it should be corrected before v0.1 is treated as finished. LOW means it should be recorded and scheduled.

### F1. A site admin can take Tom's workspace access in two requests. Severity: HIGH

`lib/workspace/clearance.js` binds clearance to the username string `tom`, and its comment states that adding a name "is a human-access expansion reserved to Tom plus the governed route, never a code tidy". That is true of the map. It is not true of the access.

`routes/admin.js` exposes `PUT /api/admin/user/:id/password`, gated on `manage_users`, which for an admin-role account may target any user including Tom. Verified end to end on the running application: as `nat` (admin, denied the workspace with 404 on every page), I set Tom's password, logged in as `tom`, reached `/workspace` at 200, and read `/workspace/contacts` including customer email addresses. The same session would have had the permanent erasure control. The only trace is one `audit_log` row.

Why it matters: the workspace confers powers the CMS admin role does not otherwise carry, being sight of the entire controlled brain and irreversible deletion of real customer records, and it does so on the strength of a credential another account can rewrite at will. The human-access expansion the clearance map reserves to Tom can in practice be performed by any admin account, without a code change and without the governed route.

This may be an acceptable risk, because the only admin is Nat, who is an org owner and already has database access. It is not acceptable as an undocumented one, given the file says the opposite. Options, in increasing order of effort: record it as an accepted risk in the control pack and in `clearance.js`; or refuse a password change against a username holding workspace clearance; or bind clearance to the user id and require the enable flag plus a second variable naming the expected username, so seizing access needs Railway access as well as CMS access.

### F2. The area announces its own existence to anonymous visitors. Severity: HIGH

`lib/workspace/access.js` states that a denial is a 404 rather than a 403 "because the workspace's existence is itself operating information". For a logged-in user that holds. For an anonymous one it does not: `requireWorkspacePageAccess` redirects to `/login?next=...` when there is no session.

Observed with the flag on: `/workspace`, `/workspace/contacts`, `/workspace/brain` and `/workspace/social` each returned 302 to `/login?next=%2Fworkspace...`, while `/workspace/nonsense` and any non-existent site path returned 404. An unauthenticated scanner can therefore confirm the area exists and enumerate its page names by the response code alone, and the redirect target echoes the path back. The APIs behave the same way, returning 401 "Not signed in" rather than 404, which likewise confirms each endpoint exists.

The API contrast is observed, not inferred: with a valid CSRF token and no session, `/api/workspace/ask` and `/api/workspace/contacts/sync` returned 401 JSON, while `/api/definitely-not-an-endpoint` and `/api/workspace/not-a-real-route` returned the site's 404 HTML page.

`test/workspace/adversarialApi.test.js` asserts `[302, 404].includes(res.status)` for the anonymous case, so the suite encodes this behaviour as acceptable rather than catching it.

With the flag off there is no leak at all, which is why this is a finding about the staging service and about any future enable, not about the current production site.

Fix: 404 the anonymous page request as well, and have the API return 404 rather than 401 when the flag is on. The convenience of a login redirect is worth very little to a single user who can navigate to `/login` himself, and it is the whole of the disclosure.

### F3. The social control area is an acknowledged expansion of the approved source map, and it is not approved. Severity: HIGH as a control point, not as a defect

`CLAUDE.md` states plainly, and to the builder's credit, that "the approved v0.1 source map explicitly excluded social, email, banking, Ads, Calendar, accounting, analytics and CRM systems", that Tom's instruction of 30 August 2026 expands it, and that the expansion "is being routed to Governance and Assurance as a controlled change rather than treated as self-approved".

I cannot close that item. I have not seen the approved source map or Tom's instruction, so I cannot certify that the built area matches what he asked for, and an assurance lane cannot approve a scope expansion on the strength of a description of the instruction written by the party that built it. What I can report is that the implementation is the safe shape for such an expansion: staging only, credential-gated, read-only by construction, refusing all six consequential actions in one place, and honest about being connected to nothing.

Two related observations of scope. First, this branch is not confined to the workspace: it adds a fictional social dataset to the Scott demonstration and wires it into the 07E exports, and it edits a controlled worker specification by adding two scope lines to Bob Fletcher and extending his boundary text (`lib/scott/workers.js`). The added boundary wording is a narrowing and the scope lines are argued to be a restatement of an existing marketing remit, which I find plausible on reading, but a worker specification edit is a controlled change and it is arriving inside a workspace release candidate. Second, the CRM contacts projection is already on main and live; only erasure and the workspace screens over it are new here.

For Tom: record the approval of the social expansion, and of the Bob Fletcher scope lines, as explicit decisions before v0.1 is signed off, or ask for both to be removed from this candidate and brought as their own change.

### F4. The erasure register's tombstone identifies the people it erased. Severity: MEDIUM

`lib/crm/emailHash.js` is an unsalted SHA-256 of the normalised address. `db/schema.sql` and `lib/crm/erasure.js` both claim the register holds "enough to answer 'did you action my request' when someone quotes their own email, and not enough to rebuild a contact list from".

The first half is true. The second is weaker than stated: an unsalted hash of an email address is a membership test, not an anonymisation. Demonstrated in this session against the real register row written by my erasure test, where hashing a candidate address reproduced the stored `email_hash` exactly and identified the erased person from a three-candidate list. Anyone who can read `crm_erasures`, which is anyone with database access, can confirm whether any address they can guess or already hold was erased. The stored `email_redacted` value compounds it by preserving the local-part length, the domain length, the first character of each and the exact TLD.

Under UK GDPR a hashed identifier of this kind is still personal data, so the register does not achieve what it says it achieves, and the claim is the problem as much as the mechanism.

Fix: HMAC the normalised address with a server-side secret (`SESSION_SECRET` or a dedicated key), which keeps the rebuild-time tombstone check working exactly as now while making the register unusable to anyone without the key. Note that changing the function invalidates existing tombstones, so it needs a deliberate migration, and there are already erasure rows in test databases.

### F5. One declared social scope is a write permission. Severity: MEDIUM, and cheapest to fix now

`lib/workspace/social/registry.js` states as a structural rule that "no connector declares a publishing scope, because publishing is not authorised, and an unused write scope on a live token is exactly the thing that turns a mistake into a public post". The Instagram connector then declares `instagram_manage_comments`, which is a Meta permission conferring comment moderation, including replying to and deleting comments. `read_insights`, `pages_read_engagement`, `pages_read_user_content`, `r_organization_social`, `r_organization_admin`, `tweet.read` and `users.read` are all genuinely read-only.

I checked this against public documentation rather than asserting it from memory, and the check narrowed the finding rather than widening it. `instagram_manage_comments` does carry comment moderation: reply, delete, hide and unhide. The Facebook scopes are genuinely read-only, because deleting a Page comment additionally requires `pages_manage_engagement`, which this registry does not declare. So the finding is one scope, not several. Meta's own developer site is blocked by this environment's egress proxy, so this rests on secondary sources and should be confirmed against `developers.facebook.com/docs/permissions` when the app is created.

Nothing is connected, so nothing is exposed today. The code would still refuse to use the capability. But the whole argument of the rule is that the token should not carry a power the code refuses, and this one would. This is the moment to fix it, because the scope list is what Tom will request when he creates the Meta app, and a granted permission is harder to withdraw than an unrequested one.

Fix: drop the scope and accept that Instagram comment reading may be limited, or keep it and change the rule's wording to state the exception and why it was accepted. Either is defensible. Silence is not.

### F6. Two workspace surfaces apply no clearance filter at all. Severity: MEDIUM

`routes/workspace.js` filters records, gaps and approvals by sensitivity, and computes counts after filtering. Two pages do neither:

- `/workspace/social` renders `accountStates`, `listPosts` and `listEngagement` with no clearance test anywhere in the handler.
- `/workspace/activity` renders `repo.listActivity(200)` unfiltered, and the dashboard renders the last 8 the same way. Activity summaries quote gap descriptions, record titles and approval titles, so the log is a derived view of material the other pages do filter.

Today this leaks nothing, because `owner_admin` is the only clearance any request can hold. It matters because the module's own comment says the rule covers "pages, API, search, snippets, counts, AI prompt context and history alike", and because the moment a second clearance is ever added, these two pages are where it will fail, quietly.

### F7. Conversation history and gap sensitivity are not re-checked against clearance. Severity: LOW today

`workspace_conversations.clearance` is written by `createConversation` and never read back by anything: I grepped every read path. `/workspace/chat` loads messages by conversation ownership alone, so an answer composed under a wide clearance stays fully readable if that user's clearance is later narrowed. Separately, `recordForGap` in `routes/workspace.js` derives a gap's sensitivity only when the model happens to quote a dotted record key in its description, and otherwise defaults to `commercial`, so a gap describing confidential evidence in prose is filed one level too wide.

Both are latent rather than live, for the same reason as F6. Both would be caught by making the stored clearance mean something: compare it to the reader's current clearance before rendering history.

### F8. A workspace 404 is distinguishable from a real one. Severity: LOW

`notFoundPage` in `lib/workspace/access.js` renders the 404 view with `pages: []` and a hardcoded dark theme, while the site's own `render404` in `server.js` passes the real navigation list and the active theme. Observed as `nat`: the workspace 404 body was 4,244 bytes against 4,282 for a genuine 404, differing exactly by the missing navigation links. On production, with around ten pages in the nav, the difference is larger. Any logged-in user can tell a workspace path from a non-existent one. This pattern is inherited from `lib/scott/access.js`, so a fix should probably cover both.

### F9. The workspace write APIs are not rate limited. Severity: LOW

Only `/api/workspace/ask` carries a limiter. The site's `authedWriteLimiter` is mounted on `/api/content` and `/api/admin` only, so `contacts/sync`, `contacts/:id/erase`, `approvals/:id/decide` and `gaps/:id/resolve` have no limit. `contacts/sync` in particular walks the whole lead table on every call. Low, given one user, but the erasure endpoint is the one place where an unlimited loop against a stolen session would be worst.

### F10. The privacy page does not mention the retention that erasure deliberately keeps. Severity: LOW

`views/privacy.ejs` describes the contact record accurately and offers access, correction and deletion. It does not say that a purchase record is kept when the rest is deleted. The internal register states that decision honestly, with its reason, on every erasure. The person whose data it is cannot read that register. One sentence on the privacy page would make the two consistent.

## What remains for Tom Arrington

1. **Decide F1 and F2 before the flag is enabled anywhere internet-facing that holds real data.** Either correct them or record them as accepted risks. My recommendation is to correct F2, which is a small change, and to record F1 as an accepted risk with a note in `clearance.js`, unless you want the workspace to be genuinely independent of the CMS admin account.
2. **Record your approval of the social expansion, and of the Bob Fletcher scope lines, as explicit decisions** (F3), or ask for them to be lifted out of this candidate. I have not approved them and cannot.
3. **Decide on F4 before real people's erasure requests are recorded in it.** The register currently holds ten test rows and one from my verification; the cost of changing the hash rises with every genuine entry.
4. **Fix F5 before you create the Meta app**, since it changes what you request from Meta.
5. **Note what has never been run:** the workspace has never called a model, in any environment. Before `ENABLE_WORKSPACE_AI` is set, the equivalent of Scott's live pressure suite should exist for the workspace, and should test the two claims that only a live run can test, namely that the model does not fill a gap by inference and does not claim an action it cannot perform.
6. **Note what I could not check:** everything resting on the Drive authorities, and the contents of the encrypted brain snapshot. If you want the register in `lib/workspace/lanes.js` certified against the canonical register, and the thirty seeded records certified against their sources, that needs a reviewer with Drive access and the snapshot key, and it is a real gap in this review rather than a formality.
7. **Do not treat the "455 pass" figure as covering the workspace surface.** It does not, on its own: the adversarial suite skips silently in a bare `npm test`. Either arm it in CI against a running instance, or record that it must be run by hand before each release decision.

Nothing in this review was merged, deployed, connected or changed. The only writes I made were to a local throwaway database.

## Amendment, same day: quality-control pass on this review

This document was re-checked against its own evidence after issue, on Tom's instruction. Every claim that had been asserted from reading rather than from an observed result was either executed or softened. Four things changed and one finding survived a challenge:

1. **Corrected, and it was wrong.** The first issue said "the single skip is the Scott live-AI paid suite". It is not. Four suites carry a SKIP directive, the summary counts only one of them, and the one it counts is the workspace adversarial suite itself. The corrected paragraph is above. The error mattered in the direction that flatters the candidate, which is the direction an assurance document must not err in, and it was found by re-running the suite and reading the TAP rather than by rereading the sentence.
2. **F2 strengthened from inference to observation.** The claim that the APIs also disclose their own existence was reasoning about response codes; it is now an observed contrast between a real workspace endpoint (401) and a non-existent one (404).
3. **F5 narrowed after checking.** My instinct on review was that the Facebook scopes carried a delete capability too. They do not. The finding is one Instagram scope, and it is now sourced.
4. **Two assertions executed.** `safeNextPath` was run against six hostile inputs rather than reasoned about from its regular expression, and the committed-secret sweep was widened from JavaScript files to every tracked file.

Nothing in the verdict changes. AMBER stands, the ten findings stand unaltered in substance, and F1 and F2 remain the two that gate an enable decision.
