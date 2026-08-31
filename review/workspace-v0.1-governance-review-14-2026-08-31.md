# Arrington AI Workspace v0.1: Independent Governance & Assurance Review (fourteenth pass)

Date: 31 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, frozen head
`eeb3a25cdadca3e9edada32c8615e5859b7f6a1f`.
Baselines: the thirteen previous reviews (F1-F10, G1-G9, H1-H7, J1-J4, K1-K5, L1-L5, M1-M5,
N1-N5, P1-P5, Q1-Q4, R1-R2, S1-S2, T1-T6) and the thirteen builder responses. The twelfth pass
returned **PASS** against `d745a55`; the thirteenth returned **AMBER** against `93d6afa` on one
MEDIUM (T1) and five LOW.

```
$ git rev-parse HEAD
eeb3a25cdadca3e9edada32c8615e5859b7f6a1f
$ git status --porcelain
(empty)
```

The tree was clean and at the frozen head at the first command of this review and at the last.
Every experiment needing a code change ran in a `git worktree` under `/tmp`, since removed. Every
write went to four throwaway databases (`ws_r14`, `r14s1`, `r14s2`, `r14s3`), created from nothing
and dropped at the end. This report is committed on branch `governance/workspace-v01-review-14`
and nothing else in the repository is touched. The paid live-AI suites were **not** run.

## 1. The bounded question

One commit since the thirteenth pass: `eeb3a25`, "Correct all six findings from the thirteenth
governance review." The diff is small, and I confirmed its boundaries by hash rather than by
reading:

```
CLAUDE.md                      +24 -2     lib/workspace/receptionist.js  +39 -12
lib/workspace/lanes.js         +28 -4     scripts/runTests.js            +17 -6
lib/workspace/orchestrator.js  +13 -3     test/gatedSuites.test.js       +30 -3
test/workspace/lanes.test.js   +13        test/workspace/receptionist.test.js +37 -4
review/ (two documents)
```

**Every other permission-relevant module is byte-identical to `93d6afa`**, which I verified by
SHA rather than by inspection:

```
IDENTICAL  lib/workspace/access.js       IDENTICAL  lib/workspace/clearance.js
IDENTICAL  lib/workspace/unlock.js       IDENTICAL  lib/workspace/unlockAlert.js
IDENTICAL  lib/workspace/repo.js         IDENTICAL  lib/workspace/ingest.js
IDENTICAL  lib/crm/emailHash.js          IDENTICAL  lib/crm/erasure.js
IDENTICAL  lib/render404.js              IDENTICAL  server.js
IDENTICAL  db/seed.js                    IDENTICAL  db/schema.sql
IDENTICAL  routes/workspace.js           IDENTICAL  routes/auth.js
IDENTICAL  lib/workspace/social/registry.js
IDENTICAL  lib/workspace/social/actions.js
IDENTICAL  views/workspace/chat.ejs
```

`lanes.js` is the one exception that matters: it carries the T2 fix, so I probed it directly
rather than inheriting anything about it. `orchestrator.js` changed in its header comment only.

This review does not authorise a merge, a deploy, an environment variable change, a spend, or the
connection of any external account, and it did none of those things.

## 2. VERDICT: AMBER

**AMBER, on one MEDIUM finding and four LOW.**

I want to be exact about what this is, because I am the second reviewer in a row to withhold a
pass on something that is not a security defect, and that deserves justification rather than
assertion.

**The security surface is clean, and I re-established the whole of it by my own probes rather than
inheriting it.** The three gates hold under a full CMS-admin takeover of Tom's account, with the
positive control and the attack in a single run. Anonymous route-existence disclosure is closed in
both flag states across 7,182 paired requests comparing status, the full normalised header set and
body length. The alarm fired exactly once out of a real four-failure burst and typed itself
honestly as undelivered. The seed migration is correct and idempotent on three database shapes,
twice each. **T2 and T3 are genuinely and completely fixed, and I confirmed both against the old
code and end to end through the real endpoint.** Ruth leaks nothing: across twenty
clearance-by-lane combinations with real mixed-sensitivity canary records seeded and the model
stubbed to echo everything it could see, no withheld canary reached her note or the model prompt.
Nothing any predecessor closed has reopened.

**Four of the six corrections are complete and well done.** T2 in particular is a model of the
kind: fixed at source with a null-prototype map so every caller is fixed at once, a new test in
`lanes.test.js` pinning `laneById` itself, and the misleadingly-named receptionist test rewritten
to try the ids that actually reach through the prototype chain. I ran the new tests against
`93d6afa` and all three are red there. That is the discipline this chain asked for.

**The MEDIUM is that T1's second limb was not implemented, and the response says all six were.**
Ruth still tells the owner *"I answered that one myself; it did not need anybody in particular"*
for any question that matches no lane. She did not, and by construction cannot. My predecessor
named this as remedy 2 of 2 under T1, told Tom in terms that it was *"the sentence most likely to
be quoted back at you by someone you are demonstrating to"*, and said closing it would make the
next pass green. The remediation document is headed "All six accepted and corrected" and states
*"T1: all three controlled statements amended and dated; no contradicting sentence remains."* Three
comments were amended, and well. The sentence that is actually shown to the owner was not. And it
is now worse than it was, not merely unchanged: the T2 fix routes every crafted or invalid forced
lane id onto that same branch, and I measured that the branch is the ordinary path, not an edge
case — routing is nine keyword regexes, so any question that does not contain one of about fifty
words lands there.

**Why that is a MEDIUM and not a LOW.** It opens nothing and leaks nothing; I say that plainly and
I looked for both. It is graded MEDIUM for the same reason my predecessor graded its parent
MEDIUM, plus one more: the governance record now asserts a correction that was not made. Standing
rule J3, established by this same chain, is that no code path may claim something that did not
happen. This is a code path claiming an answer that was not its own, and a remediation document
claiming a fix that was not applied. If the process waves that through it is not doing its job.

**The four LOWs are all the same shape as each other, and it is a shape this chain has now seen
three cycles running: a two-part finding corrected in one part and reported as corrected in
both.** T6's comment was fixed and the `CLAUDE.md` sentence the reviewer quoted verbatim and gave
replacement wording for was not (U2). T5(a)'s alias read was fixed and the lower-case read named
in the same paragraph was not, while the sentence the reviewer said *"should not stand"* still
stands (U4). T5(b)'s fix over-corrected and silently disabled a different clause of the same guard
on ten real test files (U3). And T3's gap sentence was made reachable on the lane branch but not
on the no-lane branch, where the new test cannot see it (U5).

**What would have made me pass it**: the same probes I ran, all of which are clean, **plus** the
one-line change to Ruth's no-lane sentence. Nothing else in this report blocks a release on its
own. **What would have made me stop it**: a record reaching Ruth's output, a gate opening, a
permission difference attributable to her, a regression in the 404 identity, or any Scott content
crossing. None happened, and I looked for each specifically.

**Everything blocking a PASS here is under an hour's work and contains no design decision.**

## 3. Independence, and its limits

I am a separate session from the builder. I wrote none of this code and accepted no claim I could
test myself. The limits recorded by every previous pass stand unchanged:

1. **I am a Claude agent, commissioned by the builder's own session, reviewing the builder's
   work.** Structural, and uncured by my finding something.
2. **No network access** to Railway or the live site. Everything about production, staging,
   variables and the paid live-AI runs is reported to me, not verified by me.
3. **No Google Drive access.** The completion mandate, the controlled statements and Tom's
   instruction *"Make Ruth in Arrington as well"* reach me only as transcribed by the party they
   constrain. My MEDIUM turns partly on that wording.
4. **No real browser.** I drove the application over HTTP and raw sockets and inspected status
   lines, full header sets, bodies and cookies. I did not render a page.
5. **No `WORKSPACE_SNAPSHOT_KEY`**, so the real brain was unseeded. Like my predecessor I did not
   leave the content surface untested: I seeded five of my own records at three sensitivities and
   probed the filter with canaries (section 4.6). That tests the FILTER. It does not test the
   TAGGING of the real thirty records, which remains the open half of J4 and is still Tom's.

## 4. What I did, with observed results

Environment: local Postgres 16; throwaway databases `ws_r14`, `r14s1`, `r14s2`, `r14s3`; servers
on 3411 (workspace armed), 3412 (**no workspace variables at all** — production's configuration if
this branch merges) and 3413 (armed, with the model client stubbed in a `/tmp` bootstrap so the
reviewed checkout was never edited); worktrees at `/tmp/r14/old` and `/tmp/r14/probe`, both
removed.

### 4.1 The regression suite

```
$ env -u NAT_PASSWORD -u TOM_PASSWORD DATABASE_URL=... SESSION_SECRET=... npm test
# tests 547   # suites 53   # pass 545   # fail 0   # skipped 2      EXIT=0

  5 SUITE(S) DID NOT RUN. The counts above do not cover them.
  [SKIP] adversarial: real session and API path
  [SKIP] LIVE AI pressure suite (spends money)
  [SKIP] two-pass seed
  [SKIP] adversarial workspace checks
  [SKIP] workspace live AI pressure
```

Green, and reproduces the builder's claimed figures exactly. 547/545 against my predecessor's
547 total at `93d6afa` being 545 — the difference is the two new tests (`lanes.test.js`
prototype case, `receptionist.test.js` gap case). The `[SKIP]` block names all five gated suites
correctly, and I confirmed it against real runs of two of them.

### 4.2 The adversarial suites, run by hand against a running instance

```
workspace, freshly restarted armed server:  ok 1..9   # tests 10  # pass 10  # fail 0  # skipped 0
Scott, freshly restarted server:            ok 1..14  # tests 18  # pass 18  # fail 0  # skipped 0
```

Both reproduce the builder's figures. Nothing NOT EXECUTABLE — `WORKSPACE_TEST_PASSPHRASE` was
set, so the post-unlock half genuinely ran. I restarted the server between the two suites because
the login limiter (5 per 15 minutes per IP) otherwise fails later checks for the wrong reason.

### 4.3 T2, verified three ways

**(a) The new tests are red against the old code.** I checked out `93d6afa` in a worktree, copied
in only the two changed test files, and ran them:

```
not ok 2  - a lane id inherited from Object.prototype is not a lane
not ok 13 - she cannot invent a colleague, including one inherited from Object
not ok 14 - a gap is reported even when an answer came back
# tests 16  # pass 13  # fail 3
```

The builder's claim "three tests red against `93d6afa`, green after" is exactly true.

**(b) The fix holds at source, across all four lane helpers, not just `laneById`.**

```
id                     laneById  canReadSourceClass  canReadSensitivity  filterRecordsForLane
constructor            null      false               false               0
__proto__              null      false               false               0
toString               null      false               false               0
valueOf                null      false               false               0
hasOwnProperty         null      false               false               0
isPrototypeOf          null      false               false               0
propertyIsEnumerable   null      false               false               0
__defineGetter__       null      false               false               0
not-a-lane             null      false               false               0
google_ads             LANE      true                false               0
governance_assurance   LANE      true                true                1
```

The previous behaviour — a truthy `Object` from the prototype chain, then a `TypeError` inside the
filter — is gone in every one of them. `LANES_BY_ID` is now `Object.assign(Object.create(null),
…)`, which fixes every caller at once rather than each call site, and the receptionist carries a
belt-and-braces `LANES.some(...)` check on top.

**(c) End to end, as an unlocked owner, through the real endpoint**, with the model stubbed:

```
laneId="google_ads"      -> 200  laneName="ARRINGTON GOOGLE ADS"
laneId="constructor"     -> 200  laneName=null   (was 500 + "I took that to Object")
laneId="__proto__"       -> 200  laneName=null
laneId="toString"        -> 200  laneName=null
laneId="hasOwnProperty"  -> 200  laneName=null
laneId="valueOf"         -> 200  laneName=null
laneId="not-a-real-lane" -> 200  laneName=null
laneId = 100,000 chars   -> 200  laneName=null, not echoed
laneId = "<img src=x onerror=alert(1)>"    -> 200, not echoed
laneId = ["google_ads"] / {toString:...}   -> 200, not echoed (typeof check refuses both)
```

No 500, no invented colleague, nothing echoed. **T2 is closed.**

### 4.4 Ruth, attacked directly through the endpoint

Every vector the commission named, driven as an unlocked owner against
`POST /api/workspace/ask`:

```
extra body field named `recordCount` carrying a canary -> never reaches her; the route builds
                                                          her options object from four named
                                                          fields, so a body key cannot become one
JSON body with a "__proto__" key                       -> no pollution; a control request after
                                                          all attempts is unchanged
JSON body with a "constructor": {"prototype": ...} key -> same
unicode homoglyph lane id (google_ａds)                 -> not a lane, not echoed
100,000-character lane id                              -> not echoed
markup in the lane id                                  -> not echoed
```

Her output is rendered client-side with `textContent`, not `innerHTML` (`views/workspace/chat.ejs`
`bubble()`), so even a hypothetically tainted string has no injection path.

**One thing about her output does depend on input, and it is unchanged from T6:** `recordCount` is
interpolated verbatim and is not type-checked. The only caller passes `result.provenanceKeys.length`,
always a number, so it is not reachable, and the builder's amended comment now describes the
guarantee accurately rather than overstating it. That half of T6 is properly closed. The
`CLAUDE.md` half is not — see U2.

### 4.5 T3, verified against the old code and live

Red against `93d6afa` (section 4.3a), and live through the real endpoint with the stub raising a
gap:

```
gap raised, lane matched:    "I took that to ARRINGTON GOOGLE ADS. They answered, but the records
                              do not fully cover it, so I have written the gap down rather than
                              let it pass."
no gap,     lane matched:    "I took that to ARRINGTON GOOGLE ADS, who answered from N records.
                              The provenance is listed with the answer."
```

`gapRaised` now changes what she says on the path production actually reaches. **The flag is no
longer inert on that path.** It is still inert on the no-lane path, which is U5.

I also enumerated her remaining branches for inertness. `laneId`, `gapRaised` and `recordCount` all
change her output. `answered` changes it too, but only into sentences the route cannot produce:
`ok:true` from `askWorkspace` implies a non-blank `parsed.answer` (`parseReply` rejects anything
else and the route 503s first), so `answered` is always `true` at the only call site and three of
her seven sentences remain unreachable in production. That is recorded as a concern rather than a
finding, because nothing in the tree now claims otherwise.

### 4.6 The leak probe, with real mixed-sensitivity records

I seeded five records carrying distinct canaries across three sensitivities, then stubbed the model
to echo every canary it could see, so a leak through Ruth would be maximally likely. I then built
her note exactly as `routes/workspace.js` builds it, for every clearance against every lane plus
the no-lane context:

```
clearance      lane                    records  canaries reaching the PROMPT      canary in RUTH
owner_admin    (no lane)               1        R14-STD-AUTH                      none
owner_admin    opportunity_builder     3        +R14-COMM-OPP, R14-CONF-OPP       none
owner_admin    governance_assurance    3        +R14-COMM-OPP, R14-CONF-OPP       none
owner_admin    (six other lanes)       1        R14-STD-AUTH                      none
ws_restricted  every lane and none     1        R14-STD-AUTH only                 none

20 combinations; 0 with a canary reaching Ruth
```

Two things worth stating. First, the restricted clearance never saw the commercial or confidential
canary **in the model input**, not merely in the output: filtering happens before the prompt
exists, so there is nothing to redact afterwards. Second, two of my five records carried source
classes that are not in `SOURCE_CLASSES` (`governance`, `technical` rather than `technical_state`),
and they were unreadable by every lane — an unknown source class fails closed. I record that
because it means the sweep effectively used three canaries, not five.

I also fetched the chat page as an unlocked owner: zero canaries, and Ruth's card renders only her
name, role, one line and "She routes to 9 specialists."

### 4.7 F2 / G1 / Q1 / R1: anonymous route-existence disclosure

Raw sockets, comparing every real workspace route against a fabricated sibling **under the
identical transform**, on status, the full normalised header set (dropping `Date`, `ETag`,
`Set-Cookie` and CSP, and normalising per-request nonces) and body length:

```
FLAG OFF, anonymous: 3591/3591 indistinguishable from a fabricated sibling
FLAG ON,  anonymous: 3591/3591
(19 real routes x 21 spellings x 9 methods, each paired with a prefix-preserving control)
```

Methods `GET HEAD POST OPTIONS PUT PATCH DELETE TRACE FROB`. Spellings including full upper case,
`/API/`, `/WorkSpace/`, `ſ` for `s`, percent-encoded `w`/`W`, trailing dot, trailing slash, doubled
and leading slashes, `/./`, `/x/..` traversal, matrix parameters, `%20`, `%2f`, `%00`, a query
string, and alternating case. The control preserves the characters each transform rewrites, which
is the mistake my predecessor recorded making and correcting.

The site's own 404 is byte-comparable:

```
POST /api/workspace/ask as a seized-but-locked session -> 404, 4282 bytes
GET  /totally/missing/path                             -> 404, 4282 bytes
```

Non-workspace routes are unaffected, so the guard is not over-broad (`/login` still answers
`OPTIONS 200`, `/api/leads` `OPTIONS 200`).

**Ruth did not disturb the guard ordering, and neither did this commit.** `routes/workspace.js` is
byte-identical to `93d6afa`, so `setNoindex` is still called only on the success path.

**Ruth appears on no public surface.** `/`, `/sitemap.xml`, `/robots.txt`, `/where-to-start` and
`/product-guide`, on both servers: zero occurrences of `ruth`, `reception`, `workspace` or any
canary.

### 4.8 F1: the three gates, under a full CMS-admin takeover

Positive control and attack in the same run this time, control first so the limiters were unspent:

```
CONTROL 1. tom logs in: 302
CONTROL 2. correct passphrase: 200 {"ok":true}
CONTROL 3. /workspace/chat: 200   X-Robots-Tag: noindex, nofollow

1. nat (CMS admin) logs in: 302     SANITY /api/admin/pages: 200
2. nat resets tom's password (PUT /api/admin/user/2/password): 200 {"success":true}
3. attacker logs in AS TOM: 302     SANITY seized session authenticates: 302 from /login
4. /workspace /workspace/chat /workspace/brain /workspace/contacts /workspace/activity
                                   -> 302 -> /workspace/unlock  (all five)
5. POST ask / contacts/sync / contacts/1/erase
                                   -> 404, len 4282, "unlock" never mentioned
6. "password" "letmein" "arrington" "workspace" -> 401 each; "tom", "sixth" -> 429
WORKSPACE OPENED BY THE ATTACKER: no (status 302)
```

### 4.9 The alarm, out of that real burst

Straight from the database afterwards:

```
206 workspace_unlock_failed        tom     subject=tom
205 workspace_unlock_alert_failed  system  subject=tom
      "Security notice FAILED to send after 3 failed unlock attempt(s) against "tom":
       email is not configured in this environment"
204 workspace_unlock_failed        tom     subject=tom
203 workspace_unlock_failed        tom     subject=tom
202 workspace_unlock_failed        tom     subject=tom
201 workspace_unlocked             tom
```

Threshold at three, below the limiter's five; **exactly one** alert row for the burst (J1, L2, M1);
the undelivered notice correctly typed `alert_failed` rather than `alert_sent` (H2); `subject`
populated exactly and `actor='system'` on the alert row (J2); the reason states plainly that
nothing was sent (J3, M2, N1). Only four `workspace_unlock_failed` rows appear because the fifth
and sixth guesses were refused by the limiter before reaching the unlock path. The boot line
declared the alarm inert before any of this, naming `GMAIL_APP_PASSWORD` (H3):

```
Workspace access: flag on | owner binding ok (username 'tom', expects user id 2) |
WORKSPACE_ACCESS_PASSPHRASE set, length 26 | failed-unlock alert CANNOT be sent:
GMAIL_APP_PASSWORD is unset. The alarm is inert in this environment. It would otherwise go to
tom@arringtonconsultancy.com | actual ids in this database: tom=2 | RESULT: the cleared owner can unlock
```

### 4.10 The seed migration, three shapes, twice each

```
SHAPE 1 fresh                          pass1 exit=0  pending=0 abandoned=0 idx=1 uniq=1 subject=1
                                       pass2 exit=0  pending=0 abandoned=0 idx=1 uniq=1 subject=1
SHAPE 2 polluted: 3 'tom', 2 'nat',    before: pending=7 abandoned=0 uniq=0
        2 legacy subject=''            pass1 exit=0  pending=3 abandoned=4 idx=1 uniq=1
                                       pass2 exit=0  pending=3 abandoned=4 idx=1 uniq=1
                                       survivors: tom=1, nat=1, ''=1
SHAPE 3 pre-J2: no subject column,     before: subject column present? 0
        no index, 3 legacy claims      pass1 exit=0  pending=1 abandoned=2 idx=1 uniq=1 subject=1
                                       pass2 exit=0  pending=1 abandoned=2 idx=1 uniq=1 subject=1
```

Correct and idempotent on all three, reproducing my predecessor's figures exactly. This matters
because the seed is the start command: a failed `CREATE UNIQUE INDEX` crashloops the app on boot,
which is the Scott release incident's exact failure mode.

*(My first attempt at shape 2 failed to pollute at all, because I dropped an index by the wrong
name — `uniq_workspace_unlock_alert_pending` rather than the real `uq_workspace_alert_pending`. The
migration was right; my probe was wrong. I record it for the same reason my predecessor recorded
his: a reviewer who reports only the clean run is asking to be trusted.)*

### 4.11 T5: the gated-suite scan, probed in both directions

I planted eleven files in a worktree and ran both halves against them.

```
probe shape                                                       source scan     runner half
a. const env = process.env; if (env.X) { test(...) }   (T5a)      CAUGHT          blind
b. if (process.env.lower_case_name) { test(...) }                 NOT CAUGHT      blind   <- U4
c. const K='X'; if (process.env[K]) { test(...) }                 NOT CAUGHT      blind   <- U4
d. if (process.env.X) { test(...) }                    (S1 #1)    CAUGHT          blind
e. const { X: g } = process.env; if (g) {...}                     CAUGHT          blind
f. if (globalThis.process.env.X) { test(...) }                    CAUGHT          blind
g. t.skip on !process.env.DATABASE_URL, "set DATABASE_URL" (T5b)  correctly clean  n/a
h. an ordinary plain suite                                        correctly clean  n/a
i. a file registering nothing, containing "set DATABASE_URL"      NOT CAUGHT      blind   <- U3
j. the same file with that phrase reworded                        CAUGHT          blind
```

**T5(a)'s alias is genuinely fixed** and I confirmed the builder's own concern about false
positives is handled: the two real suites that spread or snapshot `process.env` are not flagged.
**T5(b)'s `DATABASE_URL` false positive is genuinely fixed**, and on the real tree the scan is
green with all five gated suites named correctly.

Probes (b) and (c) are U4; probes (i) versus (j) are U3, and the pair is the proof — the only
difference between them is the literal string `set DATABASE_URL`.

### 4.12 The T2 class, hunted across the rest of the codebase

The commission asked me to look for the same unguarded-lookup shape wherever an object is keyed on
caller input. I enumerated every dynamic property read in `lib/`, `routes/`, `middleware/`,
`server.js` and `db/`, and probed each reachable one with `constructor`, `__proto__`, `toString`,
`valueOf` and `hasOwnProperty`.

```
lookup                                     prototype key         reachable from a request?
lib/whereToStartOffers.js  getOffer()      returns Object fn     YES (POST /api/checkout/:offerId)
                                           but `.purchasable` is undefined -> 400. FAILS CLOSED.
lib/workspace/social/registry.js
  getPlatform()                            returns Object fn     no caller passes request input
  isConfigured()                           THROWS                only called with PLATFORM_IDS
  connectorMayDo()                         false                 not called from any route
lib/workspace/clearance.js
  HUMAN_CLEARANCE[username]                returns Object fn     but the owner-binding comparison
                                           immediately after rejects it. FAILS CLOSED.
  CLEARANCES[clearanceId]                  THROWS on .sensitivities; value is server-set, not input
middleware/permissions.js
  hasCapability(ROLE, ...)                 false                 FAILS CLOSED
  hasCapability(..., CAPABILITY)           TRUTHY (Object fn)    capability names are hard-coded
                                                                 literals in every route guard;
                                                                 the matrix API iterates its own
                                                                 ALL_ROLES x ALL_CAPABILITIES and
                                                                 never uses request keys as lookups
routes/content.js  VALID_TEMPLATES         Array#includes        no prototype surface
lib/scott/clearance.js                     see the concern in section 7
lib/render404.js  themes[activeTheme]      value comes from the DB, not a request
```

**The one place where this class was reachable and consequential — `laneById()` validating
`req.body.laneId` — is the one the builder fixed.** I did not find a second reachable instance. The
latent ones above are worth a defensive pass one day but none is a finding on this candidate.

### 4.13 The rest, re-established by probe

```
F8  denial body length == genuine 404 body length            4282 == 4282
H1  alertRecipient.length = 0; body references no db/query/contact.email
H4  ACTIVITY_SENSITIVITY: one constant (routes/workspace.js:51), two call sites (170, 317),
    one test pinning value, sites and the absence of literals
H7  buildAlert throws naming the offending keys: "received field(s) it is not permitted to
    read: attempts, evil"
K3  decideAlert: exactly one call site in the deployed module (line 577)
L1  dedicatedConnectionSource(db/pool) = 'wrapper'
G5  routes/auth.js:117 calls req.session.regenerate() at login
F4/G9 hashEmail THROWS without SESSION_SECRET; digest is key-dependent
      keyalpha123 -> 5ec2fea2b00db22f      keybravo456 -> 91bc00c3aea106eb
      (identical to my predecessor's recorded digests)
Scott firewall  lib/workspace/** requires no lib/scott/**, and the reverse; the
                "nothing of Scott reaches her" test passes
```

## 5. Findings

### U1. T1's second limb was not implemented, and the remediation says all six findings were corrected. Ruth still claims answers she did not write, on what I measured to be the ordinary path. Severity: MEDIUM

**What is claimed.** `review/workspace-v0.1-t-remediation-2026-08-31.md`: *"All six accepted and
corrected."* And under T1: *"the statements are amended, not argued past … Correction: … All three
now say what is still exactly true."* The evidence block: *"T1: all three controlled statements
amended and dated; **no contradicting sentence remains**."*

**What I did.** Read the three amendments, agreed with all three, then went looking for the other
half of my predecessor's remedy. His T1 remedy had two numbered parts. Part 1 was the controlled
statements. Part 2 was: *"Change 'I answered that one myself' to something true of a no-lane turn —
it did not go to a specialist, and Ruth did not write it."* He repeated it to Tom as item 3:
*"One line of hers is simply untrue and I would change it before you show anyone."*

**What happened.** The sentence is unchanged, at `lib/workspace/receptionist.js:84`, and no comment
anywhere in the tree records that it was considered and kept:

```
$ grep -rn "answered that one myself" --include=*.js --include=*.md --include=*.ejs . | grep -v ^./review/
./lib/workspace/receptionist.js:84:      ? 'I answered that one myself; it did not need anybody in particular.'
```

Live through the real endpoint as an unlocked owner:

```
POST /api/workspace/ask {"question":"zzz qqq wibble"}
  -> 200  laneId=null  laneName=null
     receptionist: "I answered that one myself; it did not need anybody in particular."
```

`laneName` is `null`, so hers is the only name the owner sees attached to an answer she did not
write and, holding no clearance and reading no record, cannot write.

**It is not an edge case, and this is the part my predecessor could not measure.** Routing is nine
keyword regexes in `lib/workspace/orchestrator.js` (`google ads|ppc|adwords|campaign|…`,
`website|hosting|railway|github|…`, and seven more). Any question that contains none of roughly
fifty listed words returns `null`. "How much cash do we have", "what should I do today", "who owes
us money" all land there. **The false sentence is the default, not the exception.**

**And T2's fix widened it.** Before `eeb3a25`, a crafted lane id 500'd. Now every crafted,
homoglyphed, over-long, array-typed or simply unknown forced lane id falls through to exactly this
branch:

```
laneId="constructor"    -> "I answered that one myself; it did not need anybody in particular."
laneId="__proto__"      -> same
laneId="not-a-real-lane"-> same
laneId=<100,000 chars>  -> same
```

That is a correct fail-closed outcome for the permission question, and it is the right fix. It also
means the sentence is now reached by strictly more inputs than before, which is why I record this
as aggravated rather than merely carried forward.

**On the builder's one sentence about it.** The remediation says: *"The reviewer's concrete example
is kept because it is the sharpest statement of the point."* Read most charitably, that is a
decision to retain the line. If so it is a decision recorded in one ambiguous clause, inside a
document headed "All six accepted and corrected", filed under a section whose next sentence claims
no contradicting sentence remains, with nothing in the code or in `CLAUDE.md` to tell a future
reader it was a decision at all. Read less charitably it is the finding being described rather than
fixed. Either way the governance record and the shipped behaviour disagree, which is precisely what
T1 was about.

**Why MEDIUM and not LOW.** It opens nothing, leaks nothing and defeats no gate; I checked all
three. It is MEDIUM because (a) it is the unclosed half of the previous pass's only MEDIUM, (b) the
response asserts it was closed, (c) it violates standing rule J3 — no code path may claim something
that did not happen — in a system whose entire value to Tom is that what it tells him is reliable,
and (d) its reach grew in this very commit.

**Why it is not a STOP.** Nothing an attacker can do changes. Tom instructed Ruth and she is not
mine to veto. This is a bookkeeping and honesty defect around an owner-approved change.

**Remedy.** One line, no design decision, and my predecessor already drafted it: replace *"I
answered that one myself; it did not need anybody in particular"* with something true of a no-lane
turn — *"That one did not need a specialist, so it was answered from the core records."* If it is
instead being kept deliberately, say so in the module beside the string and in `CLAUDE.md`, and
withdraw the claim that no contradicting sentence remains.

### U2. T6's remedy was applied in `receptionist.js` and not in `CLAUDE.md`, which still says Ruth is handed "three booleans". Severity: LOW

**What is claimed.** The remediation: *"T6: 'it cannot leak one however it is called' was stronger
than the guard delivers. The wording now separates what is true of its inputs from what actually
holds the line."*

**What I did.** Checked both places T6 named. My predecessor named two: the module comment, and
`CLAUDE.md`. His remedy said in terms: *"correct 'three booleans' to 'two booleans and a count'."*

**What happened.** The module comment is properly corrected and now reads accurately — it
distinguishes a statement about inputs from a proof about output, and points at the field guard and
the tests as what actually holds the line. That half is well done.

`CLAUDE.md:1041` is unchanged:

> "She is handed a lane id and **three booleans**, never a record or an answer, so she cannot repeat
> what a lane withheld."

`NOTE_FIELDS` is `['laneId','answered','recordCount','gapRaised']`. That is a lane id, **two**
booleans and a **count**. The sentence is wrong about precisely the one input that is interpolated
verbatim into the string the owner reads, which is the entire subject of T6. Anyone reading
`CLAUDE.md` to check the leak argument will read "three booleans" and conclude, wrongly, that no
free-form value reaches her output at all.

**Materiality.** Not reachable: the only caller passes `result.provenanceKeys.length`, always a
number, and I confirmed that a body key called `recordCount` cannot become one of her options. This
is a record-accuracy defect, not an exposure.

**Remedy.** Four words in `CLAUDE.md`. Optionally also coerce at the boundary
(`Number.isInteger(recordCount) ? recordCount : 0`), which is what my predecessor asked for and
would make the comment true by construction rather than by the call site's good behaviour.

### U3. T5(b)'s fix over-corrects: `DB_ONLY_GATE` now suppresses all three clauses of the scan, disabling the "registers no tests" check on ten real test files. Severity: LOW

**What is claimed.** The remediation: *"the rewritten scan … falsely report[ed] `DATABASE_URL`-only
suites because the suppression was dropped in the rewrite. Both fixed, and verified in both
directions."* My predecessor's remedy was specific: *"restore the `DB_ONLY_GATE` suppression **on
the third clause**."*

**What I did.** Read the restored code, then planted a file that would trip a different clause.

**What happened.** The suppression was restored at the top of the ternary, not on the third clause:

```js
const dbOnly = DB_ONLY_GATE.test(src) && !readsConfiguration.length;

const why = dbOnly ? null
  : readsConfiguration.length ? `reads ...`
  : (!registersSomething ? 'registers no tests'
    : (returnsEarlyOnEnv ? 'returns early on configuration' : null));
```

So any file containing the literal string `set DATABASE_URL` and reading no other configuration is
excused from **all three** checks, including clause 2 — a file that registers no tests at all.
Demonstrated, and the only variable is the phrase:

```
// This suite needs a database; set DATABASE_URL to run it.
const assert = require('node:assert/strict');
assert.ok(true);                                  -> NOT reported

// This suite needs a database; needs a database to run it.
const assert = require('node:assert/strict');
assert.ok(true);                                  -> reported: "(registers no tests)"
```

**This is coverage the guard had before S1 and does not have now.** At `d745a55` the code was
`returnsEarlyOnEnv = /…/.test(src) && !DB_ONLY_GATE.test(src)` with `!registersSomething` evaluated
independently. Ten real test files currently carry the phrase and therefore have clause 2 disabled:

```
test/resetUserPasswords.test.js          test/scott/orchestrator.integration.test.js
test/scott/access.test.js                test/scott/promptDataPaths.test.js
test/scott/brainGapLifecycle.test.js     test/scott/resetStaffPasswords.test.js
test/scott/contextBuilders.test.js       test/workspace/unlockAlert.test.js
test/scott/gapTurn.test.js               test/scott/leadWorkflow.test.js
```

Clause 2 is one of the two shapes the runner is structurally blind to, and its existence is the
stated reason the source half of this guard exists at all. If any of those ten ever stops
registering tests — a bad merge, a refactor, a stray `return` at module scope — `npm test` will
report it as green and nothing will say otherwise.

**Materiality.** Nothing is mis-reported today: I scanned the real tree and all five gated suites
are named correctly, and all ten of those files do register tests. Graded LOW for the same reason
this guard has been graded LOW in eight consecutive reviews. It is a backstop, not a control.

**Remedy.** Move the suppression to the clause it was asked for:
`const returnsEarlyOnEnv = /…/.test(src) && !DB_ONLY_GATE.test(src);` and delete `dbOnly`. Two
lines.

### U4. T5(a) is half-corrected. The alias read is caught; the lower-case read named in the same finding is not, nor is a computed key, and the sentence the reviewer said should not stand still stands. Severity: LOW

**What is claimed.** The remediation: *"an alias read (`const env = process.env`) walk[ed] past …
Both fixed, and verified in both directions: three shapes that must be flagged, three ordinary
constructs that must not."*

**What I did.** Planted the alias shape (fixed, and I confirm it), then the other shape named in the
same paragraph of T5, then a third.

**What happened.**

```js
// b. lower-case env name — named verbatim by the previous reviewer
const test = require('node:test');
if (process.env.p14_gate_b) { test('gated via lowercase env name', () => {}); }
```
```
source scan: not listed        runner half: emits nothing at all (the test never registers)
```

```js
// c. computed bracket key
const test = require('node:test');
const KEY = 'P14_GATE_C';
if (process.env[KEY]) { test('gated via computed key', () => {}); }
```
```
source scan: not listed        runner half: blind
```

Both regexes require `[A-Z0-9_]`, so `process.env.someGate` matches nothing after `process.env.`,
and the bracket form requires a quoted literal. The alias fix inherited the same constraint
(`\\b${alias}\\.([A-Z0-9_]{2,})`), so an alias plus a lower-case name escapes too — I confirmed
that as well.

My predecessor named the lower-case shape explicitly: *"A lower-case env name
(`process.env.someGate`) escapes the same way."* It is in the same paragraph as the alias, under
the same finding, and the response says both were fixed. The computed key is new.

He also gave two acceptable remedies and said what must not stand: *"What should not stand is the
current sentence, which claims a bar the code does not meet."* The sentence is unchanged at
`test/gatedSuites.test.js:76-78`:

> "Not an attempt to enumerate every way of writing a gate — five reviews proved that unwinnable —
> but **it must at least catch the shapes the runner is blind to**, and finding S1 showed it did
> not."

Probes (b) and (c) are both shapes the runner is blind to, and the scan does not catch them.

**Materiality.** No real suite in the tree uses either shape; I checked. LOW, and I am not asking
for another round of the arms race — the second of my predecessor's two remedies (say in the comment
that the scan recognises literal upper-case `process.env.NAME` reads only) closes this honestly for
one line and no new regex.

**Remedy.** Either widen clause 1 to `process\.env` appearing anywhere in the file, or amend the
sentence to state the scan's real edge. Not neither.

### U5. T3's fix does not reach the no-lane branch, where `gapRaised` is still entirely inert — and the new test cannot see it. Severity: LOW

**What is claimed.** The module comment: *"A gap is the single most useful thing she can tell the
owner … **so it is said whether or not an answer came back**."* The remediation: *"it is now said
whether or not an answer came back."*

**What I did.** Enumerated the four reachable combinations of `laneId` present/absent against
`gapRaised` true/false.

**What happened.** The `gapRaised` branch was inserted below the `if (!lane)` early return, so a
raised gap changes nothing when no lane matched:

```
lane=null        gap=false -> "I answered that one myself; it did not need anybody in particular."
lane=null        gap=true  -> "I answered that one myself; it did not need anybody in particular."   IDENTICAL
lane=google_ads  gap=false -> "I took that to ARRINGTON GOOGLE ADS, who answered from 2 records..."
lane=google_ads  gap=true  -> "I took that to ARRINGTON GOOGLE ADS. They answered, but the records
                              do not fully cover it, so I have written the gap down..."
```

The new test, `a gap is reported even when an answer came back`, passes `laneId: 'google_ads'` and
therefore cannot establish the property on the branch that is left broken. This matters because the
no-lane branch is the ordinary path (U1), so the combination that goes unreported — *no specialist
matched AND the records did not cover it* — is arguably the single most useful thing Ruth could say.

**Materiality.** Nothing is hidden from the owner: `views/workspace/chat.ejs:115` pushes
`'Gap raised: ' + data.gap.gap_type` as a separate line regardless. This is about the honesty of a
declared contract field, not about disclosure. LOW.

**Remedy.** Move the `gapRaised` check above the `if (!lane)` return, or give the no-lane branch its
own gap sentence, and extend the new test to the `laneId: null` case.

## 6. What I re-verified, and what I inherited

Re-run by my own probes at the frozen head:

| Finding | How | Result |
|---|---|---|
| F1 | full CMS-admin takeover of `tom`, both sanity checks, 6 guesses, positive control in the same run | stops at the unlock screen; workspace not opened |
| F2 / G1 / Q1 / R1 | 3,591 paired anonymous raw-socket requests per flag state, status + full header set + body length | 3591/3591 both states |
| F8 | body length on every denial against a genuine 404 | 4,282 bytes, identical |
| F4 / G9 | `hashEmail` with no key and under two keys | throws; digest key-dependent; digests match the predecessor's |
| G5 | `routes/auth.js` | `req.session.regenerate()` at login |
| H1 | `alertRecipient` arity and body | 0 parameters; no db reference |
| H2 / J3 / M2 / N1 | real four-guess burst, then the activity table | one alert, typed `alert_failed`, says nothing was sent |
| H3 | boot lines, flag on and off | each gate reported separately; alarm declared inert |
| H4 | grep plus call sites | one constant, two call sites, one test |
| H7 | `buildAlert` with an unpermitted key | throws naming it |
| J1 / L2 / M1 | one alert row for the burst | bounded |
| J2 | the burst's rows | `subject` exact, `actor='system'` |
| K3 | call-site count | exactly one |
| K5 | `rev-parse` / `status` at first and last command | clean at the frozen head throughout |
| L1 | deployed handle | `dedicatedConnectionSource(db/pool) = 'wrapper'` |
| T2 | 3 ways: new tests red at `93d6afa`; all four lane helpers probed; end to end through the endpoint | closed |
| T3 | new test red at `93d6afa`; live through the endpoint with a stubbed gap | closed on the lane branch; see U5 |
| Ruth: leak | 5 canary records at 3 sensitivities, 20 clearance-by-lane combinations, model stubbed to echo | no canary reached her note or the prompt |
| Ruth: attack | prototype pollution, crafted/unicode/100k/markup/array/object lane ids, extra body fields | nothing echoed, no 500, no pollution |
| Seed migration | three shapes, twice each | exit 0 every time, idempotent, index built |
| Adversarial suites | by hand against a running instance | workspace 10/10, Scott 18/18, nothing skipped |
| Sitemap / robots / public pages | both flag states | zero workspace, Ruth or canary references |
| Full suite | `npm test` | 547 tests, 545 pass, 0 fail, 2 skipped |
| S1 / T5 | eleven planted probes, both directions | see U3 and U4 |
| T2 class elsewhere | every dynamic lookup in `lib/ routes/ middleware/ server.js db/`, probed with five prototype keys | no second reachable instance |

Inherited from reviews 12 and 13 without re-running, because the modules concerned are
byte-identical across all three commits (verified by SHA, section 1) and none interacts with Ruth,
the lane map or the scan: **P1** and **P2** (the two committed-test mutations), **P3/N4**
(threshold window edges), **Q2** (which clock), **Q4** (`recordedAs` under forced contention),
**L2/M1/J1's 240-process concurrency run**, **F5** (social scopes), **F10** (privacy text), and the
erasure end-to-end walk. I re-ran the alarm's real-burst behaviour, the F1 takeover and the seed
migration rather than inheriting them, because those are the paths a release actually executes.

## 7. Concerns I could not turn into findings

- **A latent fail-open default in Scott's clearance module, which is live in production.**
  `lib/scott/clearance.js:255` — `personaDomains(personaId)` falls back to `DEFAULT_PERSONA`, which
  is `scott_mercer`, whose domains are `['*']`. So `personaCanSeeDomain('nonsense', 'finance_full')`
  returns **true**, and so does the same call with `'constructor'` or `'__proto__'`. `CLAUDE.md`
  says of this model: *"Anything unrecognised fails CLOSED to the narrowest persona, not the owner
  view."* That sentence is true of `getEffectivePersonaId`, which validates at every branch and
  returns `mike_evans` for anything unrecognised; it is the opposite of true for `personaDomains`.
  **Not a finding**, because I traced every caller and each one is fed from `getEffectivePersonaId`
  or from a server-owned constant list, so no request-supplied value reaches it — and because it is
  pre-existing, untouched by this commit, and belongs to Scott rather than the workspace. Worth
  knowing anyway: the workspace's equivalent (`laneCanReadSourceClass`) fails closed for an unknown
  id, and this one does not.
- **Three of Ruth's seven sentences remain unreachable in production.** `ok: true` from
  `askWorkspace` implies a non-blank answer, so `answered` is always `true` at the only call site.
  Nothing in the tree now claims otherwise, so this is not U5's twin — but it means the `!answered`
  branches are untested by anything except unit tests calling the function directly.
- **`npm test` still does not pin R1's fix.** The case-insensitivity of `WORKSPACE_PATH` is asserted
  only in the gated adversarial suite. Two reviewers have now asked for a three-line unit test
  calling the exported `refuseUnroutedMethods` with `{path:'/API/workspace/ask', method:'OPTIONS'}`;
  it is still not there. Removing the `i` again leaves a bare `npm test` fully green. This property
  has cost two HIGH findings and four cycles.
- **The adversarial sweep still lists paths by hand**, and is still short of
  `/api/workspace/social/engagement/:id/replied`. Asked for by three reviewers. I probed all
  nineteen routes myself and every one is clean, and the guard is a prefix regex so a new route is
  covered automatically.
- **`workspace` is still not a reserved CMS slug**, and neither are `scott`, `product-guide`,
  `market-ready-test` or `where-to-start`. Adding the prefixes to `RESERVED_SLUGS` closes the class.
- **The workspace router's guard assumes a mount path of `/`**, and the dependency on Express's
  default `case sensitive routing` is still written down nowhere in `server.js`.
- **A non-GET with a bad CSRF token returns 500, not 403**, so `PUT`/`PATCH`/`DELETE`/`TRACE` never
  reach `refuseUnroutedMethods`. Identical on the control path, so nothing leaks. Raised by four
  predecessors, unchanged.
- **Scott and the public APIs remain anonymously enumerable by `OPTIONS`.** Re-confirmed on the
  server with no workspace variables: `/api/scott/search -> 200 Allow: GET, HEAD`,
  `/api/leads -> 200 Allow: POST`, `/api/product-guide/submit -> 200 Allow: POST`, against
  `/api/nonexistent -> 404`. Pre-existing and live in production. Somebody should decide this
  deliberately rather than inherit it from a framework default.
- **The in-memory unlock attempt budget still resets on restart.** I relied on that myself across
  several restarts to get past the login limiter; a patient attacker can too.
- **No live alert email has ever been delivered**, on fourteen passes. The last hop of this control
  remains untested by anyone.
- **The two Ruths still share a first name**, and the firewall test's token list
  (`Bailey`, `Mercer`, `Fletcher`, `Armchair`, `Knitting`) necessarily cannot cover the one token
  that crosses. Tom chose it; I record it for the same reason my predecessor did.
- **Three worktrees from earlier builder sessions are still attached** (`/tmp/wt-portal`,
  `/tmp/wt-ruth`, `/tmp/wt-social`) and six databases from earlier sessions are still on the local
  server (`arrington_verify`, `freshcheck`, `ws_test`, `ws_final`, `ws_fresh`, `ws_fresh2`). Not
  mine; I touched none of them, and mine are all dropped. Worth pruning before a release cut. This
  is the second consecutive review to say so.
- **Who holds Railway.** F1's closure, H1's remedy and the whole third gate rest on Railway being
  reachable only by Tom. Fourteen passes, no reviewer has seen it.

## 8. What remains for Tom Arrington

1. **The workspace is secure, and this commit did not change that.** I attacked the three gates with
   your own admin account, swept 7,182 anonymous requests across two flag states comparing full
   header sets, seeded confidential records and tried to get them out through Ruth, ran both
   adversarial suites by hand, and ran the boot migration on three database shapes twice each.
   Everything held. Every module that decides who may see what is byte-identical to what the last
   reviewer passed on that score, except the one file that was fixed, which I probed directly.
2. **Your builder fixed the two real defects in Ruth properly, and I want that on the record.** The
   crafted-lane-id bug (she named a colleague called "Object" and 500'd the endpoint) is fixed at
   the right level — in the lane map, so every caller is fixed at once — with a new test on the
   thing that was actually broken. The `gapRaised` flag now does something. I ran all three new
   tests against the previous commit and they fail there, which is the proof that they test what
   they say.
3. **My one MEDIUM is the sentence your last reviewer asked to be changed, which was not changed,
   in a document that says it was.** When a question does not match a specialist, Ruth still says
   *"I answered that one myself."* She did not. I measured how often that happens: routing is nine
   keyword patterns, so any question that does not contain one of about fifty words takes that
   path. It is the normal case, not an edge case. Ten minutes and one sentence.
4. **Three more small things, all in the paperwork rather than the machinery.** `CLAUDE.md` still
   says Ruth is handed "three booleans" when one of them is the number she prints (U2); the
   test-reporting helper's fix disabled a different check on ten files (U3) and left one ordinary
   way of writing a gate walking past it (U4); and the gap sentence does not reach the no-lane
   turn (U5). None is urgent. All four together are under an hour.
5. **The pattern is worth more of your attention than any single item on this list.** Three cycles
   running, a two-part finding has been corrected in one part and reported as corrected in both:
   S2 (one file fixed, one missed), then T5 (one shape fixed, one missed, and a new hole opened by
   the fix), now T1 and T6 (the comments fixed, the owner-facing text and the manual missed). Your
   builder is fixing what it looks at very well. What it is not yet doing reliably is checking the
   other half of what it was told, before writing "corrected". A one-line habit closes it: before
   claiming a finding is closed, re-read the finding's own Remedy paragraph and tick each sentence.
6. **Do the secret rotation.** Still yours and still outstanding: `WORKSPACE_ACCESS_PASSPHRASE`,
   `WORKSPACE_SNAPSHOT_KEY`, then `SESSION_SECRET` (which invalidates every CRM erasure tombstone,
   by design) and the account passwords.
7. **Two things this review does not cover, unchanged from the last two passes.** The **tagging of
   your real thirty snapshot records** — I seeded my own and proved the filter works on them, which
   is not the same as confirming that genuinely confidential material in the real snapshot is
   *marked* confidential; that is the open half of J4 and it stays yours. And the **alert email has
   still never been delivered to anybody**; set `GMAIL_APP_PASSWORD` and make it ring once,
   deliberately, before you rely on it.
8. **Why AMBER rather than PASS, so you can check my reasoning.** I could have graded U1 LOW and
   passed this. I want you to see that I considered it seriously: it has no security consequence, it
   is one sentence, and four of the six corrections in this commit are genuinely good. I did not,
   for two reasons. The first is that the previous reviewer told you this exact line was untrue,
   told you it was the thing most likely to be quoted back at you in a demonstration, and said
   closing it would make this pass green — and it was not closed. The second, which weighs more, is
   that the response document states it was. A review chain whose purpose is the reliability of the
   record cannot accept a record that says a thing was fixed when it was not, however small the
   thing. Change the one sentence, correct the four words in `CLAUDE.md`, move two lines in the test
   guard, and I would expect the next pass to be green with nothing else needed.
9. **What still cannot be verified from inside this project's tooling**, after fourteen passes: the
   Drive authorities, the completion mandate's exact wording, your own instructions except as
   quoted by the builder, the provenance of the thirty snapshot records, and everything about
   Railway. If you want those certified it needs a reviewer with Drive and Railway access and, on
   the evidence of fourteen passes, one not commissioned by the session whose work is being
   reviewed.

---

Nothing in this review was merged, deployed, connected, spent or enabled. The paid live-AI suites
were not run. My writes were confined to four throwaway databases — `ws_r14`, `r14s1`, `r14s2`,
`r14s3` — created from nothing and dropped at the end; within `ws_r14` I reset the local `tom`
password through the application's own API as part of the F1 attack, inserted five synthetic
workspace records carrying canaries, and created `workspace_activity` rows through real failed
unlock attempts, before dropping the database entirely. Two `git worktree` checkouts under
`/tmp/r14` were used for the old-code and probe experiments and have been removed; the three
worktrees belonging to earlier sessions were not touched. The model client was stubbed from a
bootstrap file in `/tmp`, so the reviewed checkout was never edited. The head never moved, and the
working tree was clean at the first command and at the last.
