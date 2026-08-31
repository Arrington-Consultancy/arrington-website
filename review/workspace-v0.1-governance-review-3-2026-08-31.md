# Arrington AI Workspace v0.1: Independent Governance & Assurance Review (third pass)

Date: 31 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, frozen head
`be9e675f66806f973f63f8d3fbed4cedb80787fa`.
Baselines: `review/workspace-v0.1-governance-review-2026-08-30.md` (AMBER, F1-F10) and
`review/workspace-v0.1-governance-review-2026-08-31.md` (AMBER, G1-G9), with the builder's
two responses, `review/workspace-v0.1-amber-remediation-2026-08-31.md` and
`review/workspace-v0.1-g-remediation-2026-08-31.md`.

`git rev-parse HEAD` returned `be9e675f66806f973f63f8d3fbed4cedb80787fa` and
`git status --porcelain` returned nothing, at the start and at the end of this session. I
reviewed that commit and nothing else. I made no change to the branch.

## 1. The bounded question

Have the nine findings of the second review been closed to a standard that lets Tom Arrington
take a production decision on this candidate, and does the new code written since it introduce
anything worse than it fixed? Nothing more. This review does not authorise a merge, a deploy, an
environment variable change, a spend, or the connection of any external account, and it did none
of those things.

## 2. VERDICT: AMBER

**AMBER.** G1, the previous HIGH, is genuinely and comprehensively closed: I could not find any
workspace-specific signal on any denial path, in status, headers, body, cookies or timing, with
the flag on or off, anonymous or as a non-owner admin. F1 is still closed. But the one piece of
code written since the last review, the G6 failed-unlock security alert Tom personally instructed,
**fails in exactly the scenario it was built for, in two independent ways**, and I demonstrated
one of them live through the real endpoint during the real takeover replay.

That is the third consecutive review in which a security property was asserted and turned out not
to hold, and it is now in the newest code rather than the oldest.

Seven findings below: two HIGH, one MEDIUM, four LOW. Nothing found here is a leak of restricted
business data, an executed consequential action, or a self-granted authority. Nothing found here
grants access to anybody. Both HIGH findings are failures of a *detection* control, not of a
preventive one; the three gates hold.

## 3. Independence, and its limits

I am a separate session from the technical builder. I did not write any of the workspace code,
and I did not accept the builder's own PASS on any point I could test myself.

Four limits, stated rather than buried:

1. **I am a Claude agent, commissioned by the builder's own session, reviewing the builder's
   work.** That is a structural weakness in this arrangement and it is not cured by my having
   found things. The same limitation was recorded by both previous reviews and still applies.
2. **No network access to Railway or to the live site.** Everything in this candidate's documents
   about production variables, the staging service and the paid live-AI run is reported, not
   verified, and is listed in section 5.
3. **No Google Drive access.** The controlled authorities, the approved source map, the permission
   and access control map, and Tom's own instructions are available to me only as transcribed by
   the party they constrain.
4. **No real browser.** I drove the application over HTTP and inspected markup, headers and
   timing. I did not render a page.

## 4. What I verified, with observed results

Environment: local Postgres 16 (`ws_test`), the working tree unmodified at `be9e675`, three
`node server.js` instances: port 3016 and 3014 with `ENABLE_ARRINGTON_AI_WORKSPACE=true`,
`WORKSPACE_OWNER_USERNAME=tom`, `WORKSPACE_OWNER_USER_ID=2`,
`WORKSPACE_ACCESS_PASSPHRASE` (32 chars); port 3015 with **no workspace variables at all**, which
is production's configuration if this branch merges.

### 4.1 The regression suite

```
DATABASE_URL=... SESSION_SECRET=... npm test
# tests 516   # pass 514   # fail 0   # skipped 2   # duration_ms 155875
EXIT=0
```

Five entries carry a `# SKIP` directive while the summary counts two: Scott adversarial, Scott
paid AI, the Websites-and-AI two-pass seed, `test/workspace/adversarialApi.test.js`, and the
workspace paid AI. **The warning carried by both previous reviews stands unchanged: a bare
`npm test` does not exercise the workspace HTTP surface.**

### 4.2 The builder's adversarial suite, armed

```
WORKSPACE_TEST_BASE_URL=http://localhost:3014 WORKSPACE_TEST_TOM_PASSWORD=... \
WORKSPACE_TEST_OTHER_PASSWORD=... WORKSPACE_TEST_PASSPHRASE=... \
node --test test/workspace/adversarialApi.test.js
# tests 9   # pass 9   # fail 0   # skipped 0
```

8 checks, all genuinely executed. The header comparison G1 asked for is really there
(`test/workspace/adversarialApi.test.js:134-152`), it normalises the per-request nonce inside the
CSP header value rather than excluding the header, and `/workspace/unlock`,
`/api/workspace/unlock` and `/api/workspace/lock` have all been added to the probe lists.

### 4.3 G1: exhaustive denial-signal comparison. Closed.

I compared **status, every response header except a named volatile set, the nonce-normalised body,
and Set-Cookie** against a control path that genuinely does not exist, over three `Accept` values
(`text/html`, `application/json`, `*/*`), for all ten real workspace pages plus four path variants
(`/workspace/`, `/WORKSPACE`, `/workspace/contacts?x=1`, `/workspace/nonsense`) and all nine
workspace API endpoints, in three identities.

**Anonymous, flag OFF (port 3015) and flag ON (port 3016), pages and APIs, all three Accept
values: every single probe was `OK` — identical status, identical headers, identical body.**
Sample, flag off:

```
/workspace              404  bytes=4282  xrobots=0
/workspace/contacts     404  bytes=4282  xrobots=0
/workspace/unlock       404  bytes=4282  xrobots=0
/workspace/nonsense     404  bytes=4282  xrobots=0
/definitely-not-a-page  404  bytes=4282  xrobots=0
```

**As `nat` (admin, not the owner), flag ON:** all ten pages and all nine APIs `OK` against the
control, both Accept values, `hdrdiff=-` on every row.

Other channels I checked and found clean:

- **Methods.** `HEAD`, `OPTIONS`, `PUT`, `DELETE`, `PATCH` against `/workspace`,
  `/workspace/contacts` and the control returned identical statuses (404/404/500/500/500) with no
  workspace-specific header. The 500 on non-GET is the site's pre-existing CSRF-error behaviour
  and is the same on the control path.
- **Cookies.** Only `_csrf` is set, identically, on workspace denials and on the control.
- **Timing.** 25 requests per path, median/min/max. Flag off: `/workspace` 7.4ms,
  `/workspace/nonsense` 8.1ms, `/definitely-not-a-page` 8.1ms. Flag on: 13.9 / 13.0 / 13.7ms. No
  separation. This is a real property rather than luck: both denials now go through the same
  `lib/render404.js`, which makes the same three database queries.
- **`/sitemap.xml`** contains no workspace path (`grep -c` → 0); `/robots.txt` does not mention it.
- **No shared view or partial** references the workspace (`grep -rn workspace views/partials/
  views/index.ejs` → nothing).
- **The flag-off case is pinned by a unit test**, not only by my probing:
  `test/workspace/access.test.js:206-224` asserts no denial carries a workspace header for an
  uncleared user, an anonymous visitor, or with `ENABLE_ARRINGTON_AI_WORKSPACE` deleted.

I could not find a third channel. On the evidence I have, **merging this branch is now inert.**

### 4.4 F1: the takeover, replayed again. Still closed.

As `nat` (role admin) against the running server:

```
/workspace, /workspace/contacts, /workspace/unlock   -> 404 each
PUT /api/admin/user/2/password {"password":"SeizedByNat!99"} -> 200 {"success":true}
```

The recovery route is intact, as Tom required. Then as the seized `tom`:

```
/workspace, /workspace/contacts, /workspace/brain, /workspace/activity
   -> 302 /workspace/unlock, 46 bytes, no business content
POST /api/workspace/ask | contacts/sync | contacts/1/erase | approvals/1/decide
   -> 404 each, mentions-unlock=False
attempt 1..5 wrong passphrase -> 401 (17, 7, 6, 5, 6 ms)
attempt 6, 7                  -> 429 "Too many attempts. Wait fifteen minutes."
the CORRECT passphrase, while limited -> 429
```

The erasure control is behind that line. I restored the local `tom` password afterwards.

### 4.5 G5: session fixation. Genuinely fixed.

`routes/auth.js:98-119` calls `req.session.regenerate()` **before** assigning `req.session.user`,
which is the right order. Demonstrated: a client carrying a planted `connect.sid` of
`s%3AFAKESID1234...` logged in and came back holding `s%3AqcpdIEtSrXyTGNWoV9S5krz8oJ...`, and its
subsequent authenticated request returned 200. A second run planted a *valid* session id taken
from a live `nat` session; after the victim logged in, a third client presenting that same id
received `401 {"error":"Not authenticated"}` on `/api/admin/users` and `404` on `/workspace`, so
the old session is destroyed rather than merely re-pointed. CSRF is unaffected, because
`csrf-csrf` is a double-submit over the separate `_csrf` cookie; every authenticated POST in my
runs worked. `nextPath` is captured before the regenerate, so the redirect is unaffected.

### 4.6 G2, G7, G8, G9

- **G2.** `requireWorkspaceIdentity` (`routes/workspace.js:347-355`) now calls `render404`.
  Verified: `/api/workspace/unlock` and `/api/workspace/lock` are byte-identical to the control in
  all three Accept modes, anonymously and as `nat`. Corrected.
- **G7.** `configuredPassphrase` (`lib/workspace/unlock.js:52-57`) trims once and returns the
  trimmed value; `describeUnlockConfig` reports the trimmed length and names any surrounding
  whitespace. Corrected.
- **G8.** `/workspace/activity` now gates on `confidential` (`routes/workspace.js:293`).
  Corrected **on that route only** — see H4.
- **G9.** `lib/crm/emailHash.js:34-43` throws rather than falling back. I traced the consequence:
  `lib/crm/contacts.js:128` calls `hashEmail` for **every** lead row with a usable address, not
  only when a tombstone exists, so with `SESSION_SECRET` unset the whole CRM rebuild throws. It is
  not fatal — `db/seed.js:4995-5000` catches it and logs `Contacts sync failed (boot continues)` —
  and production cannot boot without `SESSION_SECRET`, so no environment that matters breaks. It
  does mean a developer running without the variable silently gets no contact index and a 500 from
  `/api/workspace/contacts/sync`. Acceptable; worth knowing.

### 4.7 G3: the scope on the branch matches what Tom named. Nothing else crept in.

`git diff --stat 86504c7..be9e675` touches 14 files: `CLAUDE.md`, the four review documents,
`lib/crm/emailHash.js`, `lib/workspace/access.js`, `lib/workspace/unlock.js`,
`lib/workspace/unlockAlert.js` (new), `routes/auth.js`, `routes/workspace.js`, and four test
files. There is no undisclosed source change since the second review.

Against `origin/main` (`45bb922`, the merge base), the changes that touch a **live** surface are:

| Change | Tom's approval |
|---|---|
| `views/scott/social.ejs` (new, 171 lines, includes the chat widget at line 32) | G3 item 1 |
| `lib/scott/social/fictionalSocial.js`, `socialMemory.js`, +13 lines of 07E re-exports | G3 item 2 |
| `lib/workspace/social/memory.js` (real Arrington material) | G3 item 3 |
| `routes/scott.js` +6: `aiEnabled` and `workersById` passed to every Scott data page | mechanism for item 1 |
| `lib/scott/workers.js` +11: the two Bob Fletcher scope lines and the narrowed boundary | F3, approved 31/08 |
| `lib/scott/access.js`: Scott's 404 now goes through `lib/render404.js` | F8 remediation |
| `routes/auth.js`: `safeNextPath` and `session.regenerate()` | F2 / G5 remediation |
| `views/privacy.ejs` +1, `views/login.ejs` +1 | F10 remediation |

I checked the one thing that would have exceeded the approval: `routes/scott.js` now passes
`aiEnabled` to every data page, but only `views/scott/social.ejs` includes the chat widget
partial. On `origin/main` the widget appears on `dashboard`, `enquiry` and `job`; on this branch,
those three plus `social`. **Merging adds exactly one new live AI chat surface, the one Tom
named.** The third flagged commit, `1b770eb`, touches only `lib/workspace/social/memory.js` and
`views/workspace/social.ejs`, both flag-gated, and changes nothing live.

### 4.8 G4: the leak probe's skip is honest, and weak

`deriveCanaries` and `discriminatingCanaries` are now one shared derivation
(`test/workspace/liveAiPressure.test.js:143-173`) used by both the free guard and the paid case,
which was the substantive half of the finding. The paid case prints the canary set and
`return tt.skip('NOT EXECUTABLE as a leak probe: ...')` when nothing distinctive survives
(`:314-317`). That is honest reporting, not a way to stop failing: it reports less rather than
claiming more, and the builder wrote the consequence into `CLAUDE.md` ("the `ws-20260831-c` run
proved less on its third case than its `ok` implied"). It is also the weakest form of the remedy
the second review asked for — see H6.

### 4.9 The G6 alert: what holds

`lib/workspace/unlockAlert.js` is new code. Three of its four stated properties hold, and I
verified them:

- **It carries nothing from inside.** I captured the message with a transport injected. It names
  the username, the count, the window and two timestamps, tells the reader to change the account
  password and rotate `WORKSPACE_ACCESS_PASSPHRASE`, and nothing else. `contains the passphrase:
  false`. `contains a "length N" pattern: false`. No record, contact, count or workspace content.
- **The count comes from the database.** `maybeAlertOnFailedUnlock` queries
  `workspace_activity` rather than a memory counter, so a container restart does not reset it.
  Confirmed by reading and by the module test at `:173-184`.
- **It cannot fail the request it is attached to.** It is called without `await`
  (`routes/workspace.js:381-383`), with a `.catch`, and it swallows its own errors. The measured
  latency of the attempt that fired the alert (attempt 3, 6ms) was indistinguishable from the
  attempts either side (7ms, 5ms).

The fourth property, boundedness, is where it fails. See H1 and H2.

## 5. What I accepted as reported, and from whom

- **Everything about Railway.** That production carries no workspace variables, that the staging
  service exists, that deploy `9e584fa5` happened. From the builder. I have no way to see any of
  it, and in particular I cannot see whether `GMAIL_APP_PASSWORD` or `WORKSPACE_ALERT_EMAIL` is
  set on the workspace staging service, which H1 and H3 turn on.
- **The paid live-AI run `ws-20260831-c`**: three live turns, three cases `ok`. From the builder.
  Not replayable here.
- **Tom's four decisions** (F1 option 3, the F3 approval, the G3 Option B approval naming three
  changes, the G6 alert instruction, and the bounded paid-run authorisation) as quoted in the two
  remediation documents. An assurance lane reading an instruction transcribed by the party it
  constrains is a weak link. Both previous reviews recorded it; it is still not resolved.
- **The controlled Drive authorities**, the nine-lane register, and the provenance and
  classification of the 30 records in the encrypted snapshot.

## 6. Findings

Severity, on the scale the previous two reviews used. HIGH: correct it or accept it in writing
before the relevant state change. MEDIUM: correct before v0.1 is treated as finished. LOW: record
and schedule.

### H1. The failed-unlock security alert is delivered to an address the attacker it warns about can rewrite. Severity: HIGH

`lib/workspace/unlockAlert.js:64-75`:

```js
async function alertRecipient(db) {
  const explicit = (process.env.WORKSPACE_ALERT_EMAIL || '').trim();
  if (explicit) return explicit;
  const { rows } = await db.query("SELECT content FROM content WHERE section_key = 'contact.email'");
  ...
}
```

`WORKSPACE_ALERT_EMAIL` is optional and is not in `CLAUDE.md`'s required-variables list, so the
default deployment falls through to `content['contact.email']` — an ordinary CMS content row,
editable by anyone holding `edit_content`, which both the `admin` and `content` roles hold by
default.

The threat model this whole control exists for is a CMS account holder guessing at the passphrase.
That person can retarget the alarm at themselves before they start. Demonstrated end to end
against the running application:

```
login nat (role admin)                                      -> 302
PUT /api/content {"fields":[{"key":"contact.email",
                            "content":"attacker@evil.example"}]}   -> 200 {"success":true}
SELECT content FROM content WHERE section_key='contact.email' -> attacker@evil.example
alertRecipient(db)                                          -> attacker@evil.example
```

I restored the row afterwards. Two consequences: Tom receives no warning about the attack on his
own workspace, and the alert becomes a low-rate mail-send primitive from
`tom@arringtonconsultancy.com` to an attacker-chosen address, whose body also confirms that an
internal workspace and a deployment passphrase exist — the operating information the rest of the
design goes to some length to protect.

`lib/workspace/unlockAlert.js:1-17` states the control's purpose as sending the warning
"somewhere a person will actually see it" in the scenario where "somebody has taken the CMS
account". In the default configuration it sends it to an address that same account controls. That
is the third instance of the pattern both previous reviews named.

The builder anticipated the neighbouring problem — the comment at `:59-63` says the explicit
variable exists "so a security alert can be routed somewhere other than the address printed on the
public website" — but treated the CMS value as a safe fallback rather than as attacker-writable.
`test/workspace/unlockAlert.test.js:87-99` asserts the `contact.email` fallback is honoured, so
the suite pins the behaviour rather than catching it.

**Remedy:** require `WORKSPACE_ALERT_EMAIL`. If it is unset, do not fall back to a CMS-writable
value: either refuse to arm the alert and say so at boot (see H3), or send to the hard-coded
`NOTIFY_FROM` constant only. If a fallback to `contact.email` is kept for convenience, send to
both addresses, never to that one alone.

### H2. A failed send consumes the sixty-minute cooldown, so one mail failure silences the alarm for the whole attack. Severity: HIGH

`decideAlert` (`:97-108`) reads `lastAlertAt` from the most recent
`workspace_unlock_alert_sent` row, and `maybeAlertOnFailedUnlock` (`:190-195`) writes that row
**whether the send succeeded or failed**. A failure therefore starts the cooldown exactly as a
success does, and no retry is attempted for an hour.

This did not need constructing. It happened by itself during my F1 replay, in the real database,
through the real HTTP endpoint:

```
id | actor  | event_type                  | created_at
57 | tom    | workspace_unlock_failed     | 05:24:43
58 | system | workspace_unlock_alert_sent | 05:24:43  "could NOT be sent ... email is not configured"
60 | tom    | workspace_unlock_failed     | 05:25:28
61 | tom    | workspace_unlock_failed     | 05:25:28
62 | tom    | workspace_unlock_failed     | 05:25:28
63 | tom    | workspace_unlock_failed     | 05:25:28
64 | tom    | workspace_unlock_failed     | 05:25:28
```

Rows 60-64 are the genuine five-attempt guessing burst as the seized `tom`. **No alert was
generated for it at all**, because a notice that was never delivered, forty-five seconds earlier,
had taken the budget. Reproduced deliberately at module level with a working transport injected
for the second burst:

```
SCENARIO 1: send FAILS   -> {"sent":false,"error":"SMTP timeout","failures":3}
SCENARIO 2: mail WORKS   -> {"sent":false,"quiet":true,
                             "reason":"an alert was already sent 0 minute(s) ago; cooldown is 60"}
messages actually delivered: 0
```

Note the reason string: "an alert was already sent". It was not. The module's fourth stated rule
is that it "never claims a send that did not happen"; the activity row obeys that rule and the
cooldown logic does not.

This is not only a transient-failure problem. Where `GMAIL_APP_PASSWORD` is unset — it is optional
throughout this codebase, and I cannot see whether it is set on the workspace staging service —
**every** send fails, every failure writes a cooldown row, and the alarm can never fire. The
control is then inert, and the only record of that is a row on `/workspace/activity`, which needs
the unlock to read: precisely the failure G6 was raised to fix.

**Remedy:** start the cooldown only on a successful send. Record the failure as its own event type
so it is still auditable, and allow a retry on the next qualifying failure (a short backoff of a
few minutes is enough to prevent a mail storm). Word `decideAlert`'s reason from the recorded
state rather than assuming it.

### H3. The alert has deployment dependencies that nothing reports and nothing documents. Severity: MEDIUM

The boot line reports the three access gates one by one and is genuinely good at it:

```
Workspace access: flag on | owner binding ok (username 'tom', expects user id 2)
 | WORKSPACE_ACCESS_PASSPHRASE set, length 32 | actual ids in this database: tom=2
 | RESULT: the cleared owner can unlock
```

It says nothing about the fourth thing the workspace now depends on. `GMAIL_APP_PASSWORD` and
`WORKSPACE_ALERT_EMAIL` do not appear in it, are not checked at boot, and
`WORKSPACE_ALERT_EMAIL` appears nowhere in `CLAUDE.md` except inside the G6 narrative — not in
the deployment section's variable list. An operator can therefore set the workspace up
correctly, read a boot line saying the gates are fine, and be running with a security alarm that
cannot ring, with no indication anywhere he can reach.

This matters more because of H2: with mail unconfigured, the failure is not merely silent, it is
self-perpetuating.

**Remedy:** extend the boot line with a fourth clause reporting whether the alert can be
delivered and to which address (the address is not a secret), on the same honest pattern as
`describeUnlockConfig`. Add both variables to the deployment section of `CLAUDE.md`.

### H4. G8 was corrected on one of the two surfaces the parent finding named. Severity: LOW

G8 was that `/workspace/activity` gated on `commercial` while the rows it renders can quote
`confidential` gap descriptions. It is fixed at `routes/workspace.js:293`. But F6, which G8
narrowed, named two surfaces: "`/workspace/activity` renders `repo.listActivity(200)` unfiltered,
**and the dashboard renders the last 8 the same way**". The dashboard still reads:

```js
// routes/workspace.js:146
activity: clearanceCanSeeSensitivity(clearanceId, 'commercial') ? activity : [],
```

Same `repo.listActivity` rows, same quoted material, one level wider. Demonstrated against the
real function, for a clearance holding `['standard','commercial']`:

```
/workspace/activity  gate is confidential -> false  (refused: correct)
/workspace dashboard gate is commercial   -> true   (served: same rows, one level too wide)
```

No such clearance exists today (`owner_admin` holds all three, `ws_restricted` holds only
`standard`), so this leaks nothing and is latent exactly as G8 was. It is worth recording because
the remediation document says "It now gates on `confidential`" without qualification, and because
two sibling surfaces now disagree about the level, which is harder to spot than one surface being
wrong.

**Remedy:** change `routes/workspace.js:146` to `'confidential'`, and add a test asserting the two
gates are the same constant.

### H5. The alert's failure count is per-username; its cooldown is global. Severity: LOW

`maybeAlertOnFailedUnlock` counts failures `WHERE event_type = $1 AND actor = $2`
(`:156-161`) but reads the last alert `WHERE event_type = $1` with no actor filter
(`:162-166`). With one cleared username this is invisible. The moment `HUMAN_CLEARANCE` holds a
second name, one person's alert suppresses the other's for an hour, and the person under attack is
the one who hears nothing. This is the same latency class as F6, G8 and H4: correct today, wrong
by construction the first time the assumption behind it changes.

**Remedy:** scope the cooldown query by `actor` as well, or key it on the username in the summary.

### H6. The distinctive-canary rule accepts a sentence-initial ordinary word, and the minimum is one. Severity: LOW

`discriminatingCanaries` (`test/workspace/liveAiPressure.test.js:170-173`) accepts a token that
carries a digit, an internal capital, or a **leading** capital, minus a 23-word stop list. A
capitalised ordinary word that is not on that list — "Sometimes", "Understanding", "Therefore",
and most nouns at the start of a sentence — counts as discriminating. The threshold is
`discriminating.length === 0`, i.e. a single distinctive token is enough to run the probe as
though it proved something. Against the snapshot in this environment that single token is
`Ivybridge`, out of two confidential records.

The second review asked for "a minimum count of distinctive canaries" and for "more than two
confidential records before the next paid run". The first was implemented as a minimum of one;
the second was not done. The skip is honest, and I want to be clear that it is an improvement
rather than a dodge, but the probe is still thin and a future `ok` on this case should not be
read as evidence of the clearance boundary.

**Remedy:** require at least three discriminating canaries, exclude any token whose lowercase form
appears in a common-word list rather than a hand-written stop list of 23, and seed more than two
confidential records before the next spend.

### H7. `buildAlert`'s "structural" guarantee is a convention plus a string test. Severity: LOW

`lib/workspace/unlockAlert.js:113-116` and the remediation document both say the alert's emptiness
is "structural rather than textual ... none of those is a parameter of `buildAlert`, so none can
appear however it is called", and `test/workspace/unlockAlert.test.js:61-62` pins it with
`assert.equal(alert.buildAlert.length, 1)`.

`buildAlert` takes a single options object, so `.length` is 1 for any signature. Adding
`recentRecordTitles` to that object would keep the test green. What actually protects the message
is the forbidden-string loop two lines below, which is textual, and the fact that the one caller
passes five fields. That is reasonable protection; it is just not the guarantee the comment
claims, and this candidate has now been through three reviews in which a comment claimed a
property the code did not have.

**Remedy:** either assert the exact permitted key set of the options object, or reword the comment
to say what the protection really is.

## 7. Concerns I could not turn into findings

- **The workspace now makes outbound network calls.** The 30 August review verified, and recorded,
  that "there is no `fetch`, no HTTP client, and no network call of any kind anywhere in
  `lib/workspace/**`". `lib/workspace/unlockAlert.js` requires `nodemailer` and opens an SMTP
  connection. That is an approved, instructed change and not a defect, but the property no longer
  holds and the control pack should stop relying on it. It is also what makes H1 more than a
  paperwork point.
- **`workspace` is not a reserved page slug.** `RESERVED_SLUGS` in `routes/admin.js:14` is
  `['login','logout','health','api','img','js','css','public','main']`. A CMS page created with
  the slug `workspace` would be shadowed by the workspace route and 404 for everyone. The same is
  already true of `scott`, `privacy` and `product-guide` on main today, so this is a pre-existing
  class rather than something this branch introduces, and the information an admin gains from it
  is negligible.
- **A non-GET request to any path returns 500, not 403, when CSRF fails.** Uniform across
  workspace paths and the control, so it is not a disclosure. It is untidy and pre-existing.
- **Who holds Railway.** The whole of F1's closure, and now H1's remedy, rests on Railway being
  reachable only by Tom. I cannot see Railway. That is a fact about credential hygiene, not about
  code, and it has now been carried unverified through three reviews.

## 8. What remains for Tom Arrington

1. **H1 and H2 are the decision.** The alarm you asked for on 31 August can be pointed at the
   attacker by the attacker (H1), and can be silenced for an hour by a single mail failure (H2) —
   permanently, if mail is not configured at all. Both are cheap to fix. Until they are, treat the
   failed-unlock alert as not yet working, and do not count it as the out-of-band warning when you
   decide whether to enable the flag anywhere holding real data.
2. **Set `WORKSPACE_ALERT_EMAIL` regardless**, to an address that is not the one on the website and
   not editable from the CMS, and confirm `GMAIL_APP_PASSWORD` is set on whichever service runs the
   workspace. Neither is documented as required today (H3).
3. **G1 is closed and I could not reopen it.** I looked hard, in every channel I could think of,
   with the flag both on and off. On this evidence the claim that merging is inert is now true.
   That was the one finding whose blast radius was the live public site.
4. **G3 is closed and the branch matches your decision.** Exactly one new live AI chat surface is
   added, on the Scott social page, which is item 1 of the three you named. Nothing else has crept
   in since the second review.
5. **The paid run still does not prove the clearance boundary** (H6), and the second review's
   request to seed more than two confidential records before the next spend was not done. Its value
   remains the two honesty properties, which is what the 30 August review actually asked for.
6. **What still cannot be verified from inside this project's tooling:** the Drive authorities, the
   contents of the encrypted snapshot, your own instructions except as quoted by the builder, and
   everything about Railway. Three reviews have now carried that gap. If you want the lane register
   and the thirty records certified against their sources, that needs a reviewer with Drive access
   and the snapshot key, and no amount of further code review substitutes for it.
7. **Run the adversarial suite by hand before the release decision, and again after H1-H4 are
   fixed.** A green `npm test` still does not cover the workspace HTTP surface: five suites carry a
   `# SKIP` directive and the workspace one is among them.

Nothing in this review was merged, deployed, connected, spent or enabled. The only writes I made
were to a local throwaway database: workspace activity rows from the unlock probes, one CMS
`contact.email` edit which I reverted and verified reverted, and the local `tom` password which I
reset to its documented test value.
