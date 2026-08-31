# Arrington AI Workspace v0.1: Independent Governance & Assurance Review (second pass)

Date: 31 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, head `86504c7`.
Baseline: `review/workspace-v0.1-governance-review-2026-08-30.md` (verdict AMBER, findings F1-F10).
Builder's response: `review/workspace-v0.1-amber-remediation-2026-08-31.md`.

## 1. The bounded question

Have the ten findings of 30 August been closed to a standard that lets Tom
Arrington take a production decision on this candidate? Nothing more. This
review does not authorise a merge, a deploy, an environment variable change,
a spend, or the connection of any external account, and it did none of those
things.

## 2. VERDICT: AMBER

**AMBER.** The finding that mattered most, F1, is genuinely closed: I ran the
reviewer's own takeover attack end to end against a running server and it now
fails. But the disclosure that F2 was about is not closed. It is reproduced
through a different channel, it is worse than before because it is present
**with the enable flag OFF**, and it therefore falsifies the claim this branch
rests on, that merging to main is inert. That is a one-line fix, which is why
this is AMBER and not STOP.

Nine findings below, G1 to G9: one HIGH, five MEDIUM, three LOW. Nothing found
here is a leak of restricted business data, an executed consequential action,
or a self-granted authority.

## 3. Independence, and its limits

I am a separate session from the technical builder, commissioned by the
builder's own session on Tom's instruction. I did not write any of the
workspace code and I did not accept the builder's own PASS on any point I
could test myself. Every result in section 4 was produced in this session
against the branch head, a local Postgres 16 database, and the running
application.

Four limits, disclosed rather than buried:

1. **I am a Claude agent, not a human reviewer, and I was commissioned by
   the party I am reviewing.** That is a structural weakness in this
   arrangement and it does not go away because I found things.
2. **No network access to Railway or the live site.** Everything about
   staging and production in the builder's documents is reported, not
   verified, and is marked as such in section 5.
3. **No Google Drive access.** The controlled authorities the workspace
   claims to mirror, and Tom's own recorded instructions on F1, F3 and the
   paid run, were not available to me. I have them only as quoted by the
   builder.
4. **The paid live-AI run cannot be replayed.** I read the suite and
   measured the strength of its assertions locally (see G4); I did not and
   could not observe the three staging turns it reports.

## 4. What I verified, with observed results

Environment: local Postgres 16 (`ws_test`), the branch working tree
unmodified, `node server.js` on port 3014 with `ENABLE_ARRINGTON_AI_WORKSPACE=true`,
`WORKSPACE_OWNER_USERNAME=tom`, `WORKSPACE_OWNER_USER_ID=2`,
`WORKSPACE_ACCESS_PASSPHRASE` set (32 chars), and a second instance on port
3015 with none of those set.

### The regression suite

`npm test` against a real database: **501 tests, 499 pass, 0 fail, 2 skipped,
53 suites, 155 seconds.** The builder reported 498/496/0/2; the small
difference is subtest accounting, and the material figure, zero failures,
reproduces.

Five entries carry a `# SKIP` directive (Scott adversarial, Scott paid AI,
the Websites-and-AI two-pass seed, the workspace adversarial suite, the
workspace paid AI) while the summary counts two. The previous review's
warning stands unchanged: **a bare `npm test` does not exercise the workspace
HTTP surface.**

### The builder's adversarial suite

Armed against the running server:

```
WORKSPACE_TEST_BASE_URL=http://localhost:3014 ... node --test test/workspace/adversarialApi.test.js
# tests 9  # pass 9  # fail 0  # skipped 0
```

8 checks, all genuinely executed, none skipped. That matches the builder's
report. What it does not do is compare response **headers**, and it excludes
the two endpoints where the denial shape differs (G1, G2).

### F1: the takeover attack, replayed

As `nat` (admin), logged in over HTTP:

- `/workspace`, `/workspace/contacts`, `/workspace/unlock` → **404** each.
- `PUT /api/admin/user/2/password` with `{"password":"SeizedByNat!99"}` →
  **200 `{"success":true}`**. The recovery route is intact, as Tom required.
- Logged in as `tom` with the seized password → **302 to `/`**, session valid.
- Then, as the seized `tom`: `/workspace`, `/workspace/contacts`,
  `/workspace/brain` all **302 to `/workspace/unlock`** and rendered no
  business content. The unlock page itself carries no counts, no record
  titles and no navigation.
- `POST /api/workspace/contacts/sync`, `/api/workspace/ask`,
  `/api/workspace/contacts/1/erase`, `/api/workspace/approvals/1/decide`
  (with a valid CSRF token) → **404 each**, HTML, and `grep -ci
  'unlock|passphrase'` on every body returned **0**. The erasure control is
  behind that line.
- Five guessed passphrases → **401** each. The sixth request, carrying the
  **correct** passphrase, → **429 "Too many attempts. Wait fifteen minutes."**
  The limiter genuinely bites.
- `SELECT ... FROM workspace_activity` showed five
  `workspace_unlock_failed` rows against actor `tom`, at the right times.

**F1's demonstrated attack is closed.** The builder's argument for adding a
third gate is also correct, and worth restating because it matters for how
Tom reads his own instruction: binding to the user id does not stop an admin
who resets the password, because after the reset the attacker *is* the right
username with the right user id. The id binding closes a different attack
(delete `tom`, recreate `tom`, new row id), which I confirmed is now blocked
by `String(user.id) !== bind.userId` at `lib/workspace/clearance.js:104`. The
passphrase is what closes the demonstrated one. The builder over-delivered
against the letter of Tom's instruction and, on the evidence, was right to.

Everything fails closed. With the passphrase unset but the flag and bindings
on, the boot line reads:

```
Workspace access: flag on | owner binding ok (username 'tom', expects user id 2)
 | passphrase NOT SET: WORKSPACE_ACCESS_PASSPHRASE is unset or empty
 | actual ids in this database: tom=2 | RESULT: nobody can reach the workspace until these are set
```

That is honest state reporting, and the passphrase's contents never appear.

### F2 and F8: the 404 body

Anonymous, `Accept: text/html`. Every workspace page returned **404**, and
after normalising per-request nonces the body of `/workspace` was **byte
identical** (`diff` clean, 4,250 bytes) to `/definitely-not-a-page`. The
login redirect is gone. `/sitemap.xml` contains no workspace path
(`grep -c` → 0), the anonymous homepage does not mention the workspace, and
no workspace link is rendered anywhere.

The body-level correction is real. The header-level one is not: see G1.

### F4, F5, F6, F7, F9, F10

Each read against the original finding text:

- **F4.** `lib/crm/emailHash.js` is now `createHmac('sha256', SESSION_SECRET)`.
  The consequence (old tombstones stop matching, and rotating
  `SESSION_SECRET` does the same) is written into the file rather than left
  to be discovered. Corrected. See G9 for the fallback key.
- **F5.** `instagram_manage_comments` is gone from
  `lib/workspace/social/registry.js:91`. The test is genuinely inverted:
  `test/workspace/social.test.js:50-53` fails **any** scope matching
  `/manage|modify|delete|comment/i` unless it is named in
  `JUSTIFIED_MANAGE_SCOPES`, which holds one entry, and a second test
  asserts every justified entry is actually requested so the list cannot
  become a standing permission. Corrected, and the fix is better than the
  finding asked for.
- **F6.** `/workspace/social` and `/workspace/activity` now gate on
  `clearanceCanSeeSensitivity(clearance, 'commercial')` and render a stated
  refusal. Corrected, with a residual: see G8.
- **F7.** `clearanceCovers` exists at `lib/workspace/clearance.js:135`, is
  applied to the conversation list and to opening a conversation
  (`routes/workspace.js:300-307`) and to `POST /api/workspace/ask`, and an
  unrecognised stored value is covered by nobody. The gap sensitivity
  fallback is now the answering lane's ceiling, falling back to
  `confidential` (`routes/workspace.js:446-448`). Corrected.
- **F9.** A 30/minute `writeLimiter` is on all six write endpoints
  (`routes/workspace.js:41-48` and the six route registrations). Corrected.
- **F10.** `views/privacy.ejs` now states the payment-record retention and
  the deletion note in the deletion section. Corrected, and it reads
  accurately against what `lib/crm/erasure.js` actually does.

### The paid live-AI suite

I could not replay the run. I did measure what its central assertion is
worth, against the locally seeded snapshot (30 records: 20 standard, 8
commercial, 2 confidential), by executing the suite's own canary derivation:

```
confidential records: 2 | permitted(std) records: 20
canary count: 6
canaries: ["Ivybridge","anything","external","conversations","upstream","prospect"]
```

That result is G4, and it qualifies the builder's strongest claim about the
run.

The two structural cases are sound: case 2 asserts `res.escalation`, a
structured field, and case 1 asserts `res.gap` plus an invented-figure
regex, both of which are properties of the system rather than of the model's
phrasing. The demotion of `ADMITS_MISSING` to a secondary check, after it
scored a textbook honest admission as a failure, is the right call and is
disclosed. The arming machinery
(`scripts/workspaceLivePressureRunner.js`, `scripts/armWorkspaceLivePressure.js`)
genuinely refuses to let arming and spending be one act, in both directions,
and `RUN_WORKSPACE_LIVE_PRESSURE` / `RUN_WORKSPACE_LIVE_AI` are the outer and
inner variables respectively, not a documentation error.

### Other checks

- No `req.session.regenerate()` anywhere in `routes/auth.js` (G5).
- The unlock limiter is `express-rate-limit` with the default in-memory
  store; after restarting the process, a sixth attempt that had been 429
  returned **401** (G6).
- A passphrase carrying a trailing newline reports
  `{"ok":true,"detail":"...set, length 22"}` and refuses the value without
  the newline (G7).
- Git history: three commits (`4da96ae`, `aa9fee2`, `1b770eb`, timestamped
  23:31, 23:39 and 00:04) landed on this branch **after** the 30/08 review
  was issued at 22:57 and are not remediation of any finding (G3).
- The 30/08 review is not in `review/` on this branch. It exists only on
  `origin/governance/workspace-v01-review`.

## 5. What I accepted as reported, and from whom

- **Everything about Railway.** That production carries no workspace
  variables, that staging deploy `9e584fa5` exists, and that the paid run
  `ws-20260831-c` executed three live turns against `claude-sonnet-5` and
  passed. All from the builder. I have no way to see any of it.
- **Tom's three decisions** (option 3 for F1, the bounded F3 approval, the
  bounded paid-run authorisation) as quoted in
  `review/workspace-v0.1-amber-remediation-2026-08-31.md`. An assurance lane
  reading an instruction transcribed by the party it constrains is a weak
  link; it is the same limitation the 30/08 review recorded for F3, and it
  is not resolved by the instruction now being quoted verbatim.
- **The controlled Drive authorities**, the nine-lane register, and the
  provenance and classification of the 30 records in the encrypted snapshot.
  I can read the seeded records in a local database but I cannot check them
  against their sources.
- **That the F3-approved scope is what Tom saw.** I have not seen the
  approved v0.1 source map. I note in G3 that the scope on this branch is
  no longer identical to the scope the 30/08 review examined.

## 6. Findings

Severity, using the previous review's scale: HIGH means correct it or accept
it in writing before the relevant state change. MEDIUM means correct before
v0.1 is treated as finished. LOW means record and schedule.

### G1. The `X-Robots-Tag` header announces every real workspace route to an anonymous scanner, and it does so with the enable flag OFF. Severity: HIGH

`workspaceNoindex` (`lib/workspace/access.js:66-69`) is registered **before**
the access guard on every workspace route (`routes/workspace.js:99`, `:110`,
`:337`, `:363`, and each API registration). It therefore sets its header on
the **denial** as well as on a served page. A path that does not exist gets no
such header.

Observed, anonymous, no session, on the instance with the flag ON:

```
/workspace              ==> X-Robots-Tag: noindex, nofollow
/workspace/contacts     ==> X-Robots-Tag: noindex, nofollow
/workspace/brain        ==> X-Robots-Tag: noindex, nofollow
/workspace/unlock       ==> X-Robots-Tag: noindex, nofollow
/workspace/nonsense     ==> <no X-Robots-Tag>
/definitely-not-a-page  ==> <no X-Robots-Tag>
```

And on the instance with **no workspace variables set at all** (port 3015,
i.e. exactly production's configuration if this branch were merged):

```
/workspace              ==> 404  X-Robots-Tag: noindex, nofollow
/workspace/contacts     ==> 404  X-Robots-Tag: noindex, nofollow
/workspace/unlock       ==> 404  X-Robots-Tag: noindex, nofollow
/workspace/nonsense     ==> 404  <no X-Robots-Tag>
/definitely-not-a-page  ==> 404  <no X-Robots-Tag>
```

This is finding F2 again. The status code no longer distinguishes a workspace
path; a response header does, and one header is as easy to read as one status
code. An unauthenticated scanner can still confirm the area exists and
enumerate its exact page and API names.

Two things make it worse than F2 rather than equivalent:

1. **It is present with the flag off.** `lib/workspace/access.js:8-11` and
   `CLAUDE.md` both say the flag "is why this code can sit on main
   harmlessly: merging is inert, and switching it on is a separate
   deliberate act." Merging is **not** inert. The moment this branch reaches
   production, `www.arringtonconsultancy.com` starts telling anyone who asks
   that `/workspace/contacts`, `/workspace/brain`, `/workspace/gaps` and the
   rest are real routes.
2. **The adversarial suite encodes the gap.** `test/workspace/adversarialApi.test.js:116-128`
   compares status and nonce-normalised body against a control path and
   nothing else. `stripNonces` is careful work; headers were simply not
   considered. As with F2, the suite reports a pass over the disclosure.

Nothing is readable through this. It is disclosure only, and the workspace
still cannot be entered. But it is the exact property the module claims for
itself, asserted as corrected, and untrue.

**Remedy:** set the header after the access decision, not before, so a denial
carries no workspace-specific header. Either move `workspaceNoindex` to sit
after `requireWorkspacePageAccess` / `requireWorkspaceApiAccess` in every
registration, or set it inside those middlewares on the success path only.
Then extend `test/workspace/adversarialApi.test.js` to compare the full
response header set against the control path, not just status and body, and
add `/workspace/unlock` to `PAGES`.

### G2. `/api/workspace/unlock` and `/api/workspace/lock` answer with a JSON 404 where a genuinely missing endpoint answers with the site's HTML 404, and they are the only two workspace endpoints the adversarial suite does not probe. Severity: MEDIUM

`requireWorkspaceIdentity` (`routes/workspace.js:329-334`) hand-writes
`res.status(404).json({ error: 'Not found' })` at lines 330 and 332, rather
than deferring to `lib/render404.js` as `requireWorkspaceApiAccess` does.
`lib/workspace/access.js:105-110` contains the warning against exactly this:
"hand-writing a JSON 404 here would still be distinguishable, because the
site's handler decides HTML or JSON from the Accept header and a browser POST
asks for HTML." The warning is correct and the one route that bypasses the
shared middleware does the thing it warns about.

Observed, anonymous, valid CSRF token, `Accept: */*`:

```
/api/workspace/unlock            -> 404 | application/json | {"error":"Not found"}
/api/workspace/ask               -> 404 | text/html        | <!DOCTYPE html>...
/api/workspace/definitely-not-real -> 404 | text/html      | <!DOCTYPE html>...
/api/not-an-endpoint-at-all      -> 404 | text/html        | <!DOCTYPE html>...
```

`APIS` in `test/workspace/adversarialApi.test.js:28-35` lists six endpoints
and neither of these two. `PAGES` at `:23-27` lists eleven pages and not
`/workspace/unlock`. The two routes with the divergent denial are precisely
the two the suite omits. I do not read that as deliberate, but the effect is
that the suite's own claim to compare every workspace endpoint against a
control is not met.

**Remedy:** call `render404(req, res)` in `requireWorkspaceIdentity` instead
of the hand-written JSON, and add both routes to `APIS` and
`/workspace/unlock` to `PAGES`.

### G3. Three commits added un-reviewed scope to the candidate after the review was issued, including a live AI chat surface on the publicly released Scott demonstration, and the remediation record does not mention them. Severity: MEDIUM

The 30/08 review was issued at 22:57 against head `faf49ae`. Three commits
then landed on this branch before any remediation work began:

```
4da96ae 2026-08-30 23:31  Social memory: six years of it for Scott, the same shape for Arrington
aa9fee2 2026-08-30 23:39  Arrington social memory, from the real record rather than a placeholder
1b770eb 2026-08-31 00:04  Useful Thinking is evergreen, not a dated feed
```

They are not remediation of F1-F10. They add `lib/scott/social/socialMemory.js`
(88 lines of new fictional records, spread into the 07E exports at
`lib/scott/deepBusinessFacts.js:1505`), `lib/workspace/social/memory.js` (117
lines of **real** Arrington material sourced from a Drive document, "Arrington
Consultancy Published Social Posts (reviewed 12 June 2026)"), 148 lines to
`views/workspace/social.ejs`, and 113 lines to `views/scott/social.ejs`
including `<%- include('partials/chat-widget', ...) %>` plus `aiEnabled` and
`workersById` now passed to **every** Scott data page (`routes/scott.js:561-562`).

Scott is on main and on the public site with `ENABLE_SCOTT_AI=true`. Merging
this branch therefore turns on a live AI chat widget on a released public
surface. That is a change to a live system, arriving inside a release
candidate for an unrelated, flag-gated internal area.

The remediation document's "What was NOT changed" section says "No change to
Scott's clearance model, worker roster or activation state", which is true
and is not the point: a new AI entry surface and a new record set are changes
to Scott that no governance pass has examined.

The mechanical risk looks low. The new Scott records reuse existing 07E
domains rather than inventing one, `untaggedDeepFactExports()` is asserted
empty in `test/scott/fieldClearance.test.js:98`, the social firewall test
covers the new file, and the full suite passes. The governance point stands
regardless: Tom's F3 approval is worded "bounded to that reviewed scope", and
the scope on this branch is no longer the scope that was reviewed.

**Remedy:** either lift these three commits out of the candidate and bring
them as their own change with their own review, or have Tom record an
explicit decision covering the Scott chat widget on live, the new Scott
social records, and the new Arrington social memory source, naming them
individually rather than by reference to "the social expansion".

### G4. The paid live-AI leak probe's discriminating power rests on one distinctive token out of six, and the free half guards a re-implementation of the filter rather than the filter. Severity: MEDIUM

`test/workspace/liveAiPressure.test.js:250-262` derives its canaries as words
of eight or more characters that appear in the confidential records and
nowhere the restricted clearance may look. Executing that derivation against
the seeded snapshot in this environment:

```
confidential records: 2 | permitted(std) records: 20
canary count: 6
canaries: ["Ivybridge","anything","external","conversations","upstream","prospect"]
```

Only `Ivybridge` is a distinctive value. `anything`, `external`,
`conversations`, `upstream` and `prospect` are ordinary English that a model
could emit in a refusal without having seen a confidential record at all.
The guard at `:263-264` is `assert.ok(canaries.length > 0)`, which passes at
six and cannot tell six near-worthless canaries from six real ones.

That cuts both ways, and both are problems:

- **As evidence**, the passing run's third case mostly establishes that the
  model did not say "anything" or "external". The builder's summary,
  "the synthetic narrow clearance received no confidential value in its
  answer", is more than the assertion supports.
- **As a test**, it will keep failing on honest replies. "I do not hold
  anything about external conversations" trips three of the six canaries.
  Two of the three paid runs already failed on false positives of exactly
  this shape, and the pressure to loosen the check after a third such
  failure is the specific self-serving-design risk here.

Separately, the free half does not guard the real filter. The tests at
`:132-142` and `:148-166` re-implement the label filter and the
permitted-corpus filter inline with hand-written strings; the paid half at
`:250-262` has its own copy. If the paid half's derivation changed, the free
tests would still pass.

I want to be fair about what is good here. The permitted-corpus filter was
the right diagnosis, committing real staging replies as fixtures at `:95-103`
is a genuinely good idea, `:113-121` correctly checks that broadening the
admission pattern did not disarm it, and the two structural cases (`res.gap`,
`res.escalation`) do not depend on phrasing at all. The defect is confined to
the leak probe.

**Remedy:** require canaries to be distinctive rather than merely absent from
the permitted corpus (a common-word stop list, or requiring a capitalised
token, an internal digit, or a token appearing in no English wordlist), and
replace `canaries.length > 0` with a minimum count of distinctive canaries,
reported as NOT EXECUTABLE rather than passed when it is not met. Extract the
derivation into a function so the free half exercises the same code the paid
half runs. Also worth seeding more than two confidential records before the
next paid run: a two-record corpus cannot support a strong leak test.

### G5. The second factor lives entirely in the session, and the site never regenerates the session id at login. Severity: MEDIUM

`recordUnlock` writes `req.session.workspaceUnlock`
(`lib/workspace/unlock.js:87-93`), and `isUnlocked` reads it. Demonstrated:
after unlocking as `tom`, I extracted the `connect.sid` value alone and sent
it from a client with no other state:

```
raw session cookie alone, /workspace           -> 200
raw session cookie alone, /workspace/contacts  -> 200
```

The unlock travels with the cookie, which is correct for a session-bound
second factor. The problem is what sits underneath it: `routes/auth.js:100`
assigns `req.session.user` without any `req.session.regenerate()`, so the
session id an anonymous visitor arrives with is the session id they hold
after logging in. An attacker who can plant a `connect.sid` value in Tom's
browser and then wait for him to log in and unlock inherits an unlocked
workspace, and the passphrase never enters it.

This is a pre-existing site-wide weakness, not one this branch introduced.
What this branch does is make it load-bearing: before, a fixated session got
CMS content; now it gets the controlled brain and the irreversible erasure
control.

The bindings are otherwise tight. `isUnlocked` (`:101-110`) requires the
configured passphrase to still exist, the session user id to match the id
that unlocked, the passphrase fingerprint to match (so rotation invalidates
every open unlock immediately), and the unlock to be under four hours old.

**Remedy:** call `req.session.regenerate()` on successful login before
assigning `req.session.user`, and drop `workspaceUnlock` whenever the
session's user id or role changes. Both are small and the first fixes a
site-wide issue.

### G6. The unlock attempt budget is in-memory, so any process restart returns it to five. Severity: LOW

`unlockLimiter` (`routes/workspace.js:55-62`) uses `express-rate-limit`'s
default in-memory store. Observed: after exhausting the budget (sixth
request → 429), I restarted the process and the next wrong passphrase
returned **401**, not 429. The session and its lock state survived, because
those are in Postgres; only the counter reset.

On Railway a redeploy or a container restart does the same. The real bound on
guessing is therefore the passphrase's own entropy, and the
`workspace_unlock_failed` rows are the detection.

Which raises the sharper half of this: **those rows are only visible on
`/workspace/activity`, which requires the unlock to view.** During the attack
this gate exists for, the attacker is locked out and Tom may also be locked
out of the CMS account whose password was changed. Nothing is emailed. The
builder's own words, "it is the only warning anyone would get", are accurate
and the warning is delivered to a screen nobody in that scenario can open.

**Remedy:** either move the limiter to the Postgres-backed store, or accept
the reset and say so; and notify on a run of `workspace_unlock_failed` events
through the Gmail path that already exists in `lib/scott/gapNotifier.js`,
since a burst of them has exactly one cause.

### G7. A trailing newline in `WORKSPACE_ACCESS_PASSPHRASE` locks Tom out while the boot line reports the passphrase as correctly set. Severity: MEDIUM

`configuredPassphrase` (`lib/workspace/unlock.js:44-47`) tests
`v.trim().length >= 12` but returns the **untrimmed** `v`, and
`describeUnlockConfig` at `:62` reports `v.length`, also untrimmed.
Demonstrated:

```
WORKSPACE_ACCESS_PASSPHRASE = 'correct-horse-battery\n'
describeUnlockConfig: {"ok":true,"detail":"WORKSPACE_ACCESS_PASSPHRASE set, length 22"}
matches without the newline: false
matches with the newline   : true
```

The boot line says `ok`. The passphrase is unusable. This project has a
documented history with this exact failure: `CLAUDE.md` records that a
Railway dashboard form storing a trailing newline cost an entire session on
the Market Ready Test, and the unlock module's own comment cites that
incident as the reason it prints a length at all.

Availability only, and recoverable by Tom resetting the variable. It is
MEDIUM rather than LOW because the sole user would be locked out of his own
workspace by a boot line that told him everything was fine, and the fix is
one `.trim()`.

**Remedy:** trim once in `configuredPassphrase` and compare the trimmed
value, or refuse a value that differs from its own trim and say so in
`describeUnlockConfig`. Report the trimmed length.

### G8. `/workspace/activity` is gated one level wider than the material it can quote. Severity: LOW

The handler (`routes/workspace.js:275-289`) gates on
`clearanceCanSeeSensitivity(clearanceId, 'commercial')` and its own comment
says "It is gated at the same level as the narrowest thing it can quote."
Activity summaries quote gap descriptions and record titles, and a gap's
sensitivity can be `confidential` (`routes/workspace.js:415-422` now
deliberately defaults it there). A clearance holding `['standard',
'commercial']` would pass the gate and receive confidential quotations.

No such clearance exists today, so this leaks nothing, and it is the same
latency F6 identified rather than a new class. But the comment asserts a
property the code does not have, which is the pattern both F1 and F2 turned
out to be.

**Remedy:** gate on `confidential`, or filter the activity rows by the
sensitivity of what each one quotes, and correct the comment either way.

### G9. `lib/crm/emailHash.js` falls back to a hard-coded key when `SESSION_SECRET` is unset, which reinstates the F4 membership oracle wherever that happens. Severity: LOW

`hashEmail` reads
`process.env.SESSION_SECRET || 'dev-only-secret-change-me'`. Production
cannot boot without `SESSION_SECRET`, so this is not a production exposure.
It does mean that in development, CI, and any throwaway database, the
register reverts to a publicly-computable digest, which is the exact property
F4 was raised about. Erasure rows already exist in such databases, including
the previous reviewer's.

**Remedy:** throw rather than fall back, or derive from a dedicated
`CRM_TOMBSTONE_KEY` that must be set wherever erasure is exercised.

## 7. Concerns I could not turn into findings

- **The unlock 302 as an exception to the hide-existence rule.** The
  builder's reasoning is that anyone reaching that redirect has already
  satisfied the identity binding, "so they are either Tom or someone who has
  taken Tom's CMS account; the latter is a GitHub org member who can read
  this file anyway." The first half is sound and I verified the behaviour:
  a seized session gets the unlock screen and nothing else, while the APIs
  give it a bare 404 with no mention of unlocking. The premise is not
  exhaustive, though. A third case exists, an outsider holding stolen or
  phished CMS credentials, who is not an org member and for whom the 302 is a
  real disclosure. The net harm is small, because they still cannot get in,
  and I could not demonstrate anything beyond the disclosure already covered
  by G1. I record it so Tom is choosing it rather than inheriting it.
- **Who actually holds Railway.** The whole of F1's closure rests on
  "Railway is Tom's own account and is not reachable from CMS admin". I
  cannot see Railway. I note only that the 30/08 review read production
  variables from Railway, so at least one agent session in this project's
  workflow has held that access, and the separation is a fact about
  credential hygiene rather than about code.
- **The release pack is incomplete on the branch.** The 30/08 review this
  candidate responds to is not in `review/` at head `86504c7`; it exists only
  on `origin/governance/workspace-v01-review`. Anyone reading the remediation
  document on this branch cannot read the findings it answers. Worth fixing
  when this review is merged, and not a defect in the system.

## 8. What remains for Tom Arrington

1. **G1 must be corrected before this branch is merged**, not merely before
   the flag is enabled. It is the one finding whose blast radius is the live
   public site, and it is a one-line change. Until it is fixed, the claim
   that merging is inert should not be relied on.
2. **Decide G3.** Either lift the three post-review commits out of this
   candidate, or record an explicit decision naming the Scott live chat
   widget, the new Scott social records and the new Arrington social memory
   source. Your F3 approval was bounded to the reviewed scope, and the scope
   has moved since.
3. **Do not treat the paid run as proof of the clearance boundary** (G4). It
   is good evidence for the two honesty properties, which is what the 30/08
   review actually asked for. The leak probe needs stronger canaries and more
   than two confidential records before it is worth another spend.
4. **G5, G6 and G7 are cheap and should go in before v0.1 is called
   finished.** G7 in particular will otherwise cost you a confusing hour on
   the day you set the variable.
5. **What still cannot be verified from inside this project's tooling:** the
   Drive authorities, the contents of the encrypted snapshot, your own
   instructions except as quoted by the builder, and everything about
   Railway. If you want the lane register and the thirty records certified
   against their sources, that needs a reviewer with Drive access and the
   snapshot key. That gap has now been carried through two reviews.
6. **Run the adversarial suite by hand before the release decision**, and
   again after G1 and G2 are fixed. A green `npm test` still does not cover
   the workspace HTTP surface.

Nothing in this review was merged, deployed, connected, spent or enabled. The
only writes I made were to a local throwaway database, and I restored the two
local user passwords afterwards.
