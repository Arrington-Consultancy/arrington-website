# Arrington AI Workspace v0.1: Independent Governance & Assurance Review (eighth pass)

Date: 31 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, frozen head
`62266730fdeaffefbb3f7f9ccd7f6b9b7d432eef`.
Baselines: the seven previous reviews (F1-F10, G1-G9, H1-H7, J1-J4, K1-K5, L1-L5, M1-M5,
**all AMBER**) and the builder's seven responses, the most recent being
`review/workspace-v0.1-m-remediation-2026-08-31.md`.

```
$ git rev-parse HEAD
62266730fdeaffefbb3f7f9ccd7f6b9b7d432eef
$ git status --porcelain
(empty)
```

**The tree stayed frozen and clean throughout.** I re-checked `rev-parse` and
`status --porcelain` on the reviewed checkout at the end and both were unchanged, and
`data/workspace-snapshot.enc` still hashes to
`e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2`. K5's remedy has now held
three passes running. Every experiment needing a code change ran in a `git worktree` under
`/tmp`; every write went to throwaway databases (`ws_rev8`, `ws_rev8_dirty`, `ws_rev8_legacy`)
created from nothing and dropped at the end. This report is committed on a separate branch.

## 1. The bounded question

The seventh review found no HIGH and no defect in production code, and the builder then, while
fixing M3, discovered a ~5% duplicate rate that neither of us had caught, and **rewrote this
module's concurrency handling for the fourth time in four cycles**. Each of the three previous
rewrites introduced a defect the next reviewer found.

So: is there an **eighth** instance of the governing pattern — a security property asserted in
a comment, a remediation or the project memory that does not hold in the code? Specifically:
does the fourth rewrite survive being attacked rather than read; do the two new event types
(`abandoned`, `error`) gate correctly; does the seed migration that retires pre-existing
duplicate claims work on every database shape it will meet, including the one where its absence
would crashloop the app on boot; and do the earlier closures (F1, G1, H1, H2, H4, J2, J3, K3,
L1, L2, L3) still hold under probes of my own construction?

Nothing more. This review does not authorise a merge, a deploy, an environment variable change,
a spend, or the connection of any external account, and it did none of those things.

## 2. VERDICT: AMBER

**AMBER — the narrowest of the eight, and Tom should read what moved rather than the colour.**

What I want to say first, because it is the finding that matters most and it is a positive one:

- **The concurrency guarantee now genuinely holds, and I proved it rather than accepting it.**
  Across nine independently written harness shapes — in-process bursts from 2 to 60 callers,
  staggered arrivals, sustained background pool traffic, boundary-straddling clocks, twelve and
  twenty racing OS processes, and the real HTTP endpoint as the authenticated owner —
  **roughly 1,500 threshold-or-above bursts produced exactly one notice every single time:
  zero duplicated, zero wrongly silent.** My instruments are demonstrably sensitive: the same
  harnesses reproduce the previous head's duplicate at **4% and 10.7%**, and reproduce M1's
  worker crash at 240 errors in 240 worker runs.
- **All three gates held under direct attack.** I seized `tom`'s CMS account as `nat` through
  the real API and got no further than a locked screen. With the flag on and off, anonymous and
  as an authenticated non-owner admin, **45 of 45 workspace paths were byte-identical to a
  genuinely missing page** in status, full header set, cookie names and normalised body.
- **L3 is closed and I verified it by a method needing none of the builder's account:** every
  64-hex string in the repository, the scratchpad, the session tree and the process environment
  — 78 distinct candidates across 2,014 files — tested by AES-GCM tag verification against the
  committed ciphertext, with a control blob proving the routine works. **Zero authenticate.**
- **The seed migration is correct on every database shape I could construct**, including a
  pre-J2 database with no `subject` column and three legacy claims, and one deliberately
  polluted with duplicate claims across three accounts. Fresh, dirty, legacy, and twice each.

The AMBER stands on two things, both narrow, neither touching the gates.

**First, the governing pattern did recur — in the commit that fixed the seventh instance of
it, and in the same function.** M2's whole point was that the alarm must never describe
something as having happened when it did not. The fix corrected one direction and opened the
other: a notice that **was** delivered to Tom's mailbox is recorded in the security register as
`NO send was attempted`, no cooldown is started, and a duplicate follows five minutes later. I
demonstrated it end to end. The test that pins M2's property does not establish it, because the
case it exercises is a `sendFn` that throws — a send that *was* attempted (N1).

**Second, the evidence underneath the headline claim has a hole in it.** The regression test
that guards the boundedness property **cannot detect the defect this cycle fixed**. Run against
the defective previous head at the test's own profile, it is clean 150 times out of 150. Add a
0-40ms arrival stagger — one line — and the same code fails 16 times in 150. None of this
cycle's four structural changes (the partial unique index, the `23505` stand-down, the
`abandoned` type, the seed migration with the demonstrated crash-on-boot failure mode) is named
anywhere in the test tree (N2).

Five findings: **two MEDIUM, three LOW, no HIGH.** Nothing found opens the workspace, leaks a
record, defeats a gate, or stops the alarm firing on a real burst. **On this chain's published
severity bar, nothing in this report blocks the release decision.**

## 3. Independence, and its limits

I am a separate session from the technical builder. I wrote none of the workspace code and
accepted no claim I could test myself. The four limits recorded by every previous pass stand
unchanged:

1. **I am a Claude agent, commissioned by the builder's own session, reviewing the builder's
   work.** Structural, uncured by my having found things, and unresolved after eight passes.
2. **No network access to Railway or the live site.** Everything about production and staging
   variables, deployments and the paid live-AI runs is reported to me, not verified by me.
3. **No Google Drive access.** The controlled authorities and Tom's own instructions reach me
   only as transcribed by the party they constrain.
4. **No real browser.** I drove the application over HTTP and inspected status, headers, bodies,
   cookies and timing. I did not render a page.

The paid live-AI suites were **not run**: they spend money and I was instructed not to. They are
not evidence in this pass.

## 4. What I did, with observed results

Environment: local Postgres 16; throwaway databases `ws_rev8` (fresh), `ws_rev8_dirty`
(polluted with duplicate claims) and `ws_rev8_legacy` (rolled back to a pre-J2 shape); servers
on 3081 (workspace armed) and 3082 (no workspace variables at all, which is production's
configuration if this branch merges); `git worktree`s at `/tmp/rev8/wt` (frozen head) and
`/tmp/rev8/prev` (the previous head, as a sensitivity control).

### 4.1 The regression suite

```
$ env -u NAT_PASSWORD -u TOM_PASSWORD DATABASE_URL=... SESSION_SECRET=... npm test
# tests 532   # suites 53   # pass 530   # fail 0   # skipped 2
```

Matches the builder's figure exactly.

### 4.2 The builder's adversarial suite, against a freshly restarted server

```
  ok 1 - an anonymous visitor gets an ordinary 404, not a login redirect
  ok 2 - an anonymous workspace API call looks like a call to a route that does not exist
  ok 3 - a logged-in site admin who is not Tom sees nothing, and is told nothing
  ok 4 - Tom can authenticate, so every check below means something
  ok 5 - a logged-in cleared session reaches nothing until it presents the passphrase
  ok 6 - a wrong passphrase is refused, it is recorded, and the session stays locked
  ok 7 - the right passphrase opens it, and every page is noindex
  ok 8 - erasure refuses a mismatched confirmation even for Tom
# tests 9   # pass 9   # fail 0   # skipped 0
```

Nine of nine, all executed, nothing NOT EXECUTABLE. **Both traps recorded by the last four
reviewers cost me runs again**, and one of them cost me an hour: the site login limiter is 5 per
15 minutes per IP so the server must be restarted between runs; and the CSRF token must go in
the **`x-csrf-token`** header (`server.js:629`), not `CSRF-Token`, or the global middleware
answers 403 and you are silently testing CSRF. My first F1 replay reported "the takeover is
blocked" when in fact the takeover had never been attempted — the password reset was answered
`403 invalid csrf token`. **Any future reviewer whose attack reports a clean refusal should
check the sanity line first: does the seized session actually authenticate?**

A third trap worth adding: `routes/auth.js` regenerates the session at login (finding G5), which
invalidates the `_csrf` token issued before it. A GET must follow the login before any write.

### 4.3 Reproducing the builder's headline claim, then trying harder

The builder's claim is 100 consecutive bursts of 8, exactly one notice each. It reproduces:

```
$ node burst.js 100 8 120 8
{"ROUNDS":100,"BURST":8,"DELAY":120,"WARM":8,"tally":{"1":100},"dup":0,"silent":0,"errRows":0,"abandoned":0}
```

Then, varying every dimension the brief asked about:

| Shape | Rounds | Result |
|---|---|---|
| bursts of 2 (below threshold) | 40 | 40 correctly silent |
| bursts of 3, 4, 5, 6 | 160 | exactly one notice each |
| bursts of 10, 12, 16 (past pool max 10) | 75 | exactly one each |
| bursts of 30 and 60 | 30 | exactly one each |
| staggered arrivals, four timing profiles | 500 | exactly one each |
| staggered at the duplicate-provoking profile | 500 | exactly one each |
| boundary-straddling clocks (cooldown / lease / failed / error) | 30 | exactly one each |
| twelve and twenty racing OS processes | 30 | one winner, one claim row, 0 worker errors |
| the real HTTP endpoint, server restarted each round | 14 | exactly one each |
| heavy contention while no alert is due (60-400 callers) | 31 | 0 notices, correctly |

**Sensitivity control, which is what makes the above mean anything.** The identical harness
against the previous head `39812ac`:

```
$ TARGET_REPO=/tmp/rev8/prev node stagger-prev.js 150 8 60 10
{"noticesPerBurst":{"1":144,"2":6}}      <- 4% duplicates
$ TARGET_REPO=/tmp/rev8/prev node stagger-prev.js 150 8 40 30
{"noticesPerBurst":{"1":134,"2":16}}     <- 10.7% duplicates
$ TARGET_REPO=/tmp/rev8/prev node procs.js 12 20
{"winnersPerRound":{"1w/1p":20},"workerErrors":240}   <- M1 reproduced
```

and the same profiles against the frozen head:

```
$ node stagger.js 300 8 40 30
{"ROUNDS":300,"noticesPerBurst":{"1":300},"errorRows":0,"abandonedRows":0}
```

**The fix is real.** Note also that the previous-head runs happened against a database that
already carried `uq_workspace_alert_pending`, which isolates the correction to the `NOT EXISTS`
moving inside the INSERT: the index alone does not close it, because the losing caller inserts
after the winner has already *resolved* its claim and left the index.

### 4.4 The two new event types

`abandoned` correctly does **not** gate, and cannot be used to force repeated alerts. I planted
a stale claim, let the lease expire, and repeated five times:

```
cycle 1: sent=true
cycle 2: sent=false  a notice was DELIVERED 7 minute(s) ago; cooldown is 60
cycle 3: sent=false  a notice was DELIVERED 11 minute(s) ago; cooldown is 60
...
rows: ["workspace_unlock_alert_abandoned","workspace_unlock_alert_sent"]
TOTAL NOTICES: 1
```

The delivered notice's cooldown still governs, so repeated abandonment buys one alert, not a
flood. The only case that yields a fresh alert per lease is a claim that is *never* resolved —
which is the intended recovery from a dead process, and correct.

`error` gates for five minutes and is worded honestly at the point M2 was raised for. But see
N1 for the direction M2's fix opened, and N3 for a class of event that should not be reaching
this type at all.

### 4.5 The seed migration, on four database shapes

```
fresh, seeded twice                        -> exit 0, exit 0, index present
polluted: 3 duplicate claims for 'tom',
  2 for 'nat', 2 legacy rows subject=''    -> exit 0; newest kept per account,
                                              4 retired to 'abandoned', index built
same database, seeded again                -> exit 0 (idempotent)
pre-J2: no `subject` column, index absent,
  3 legacy claims                          -> exit 0; column added, 2 retired, index built
index already present + one live claim     -> exit 0, no change
```

The ordering reasoning holds and the retirement is genuinely load-bearing: without it the
`CREATE UNIQUE INDEX` fails and, because the seed is the start command, the app crashloops on
boot. I could not find any other statement in `db/seed.js` whose correctness now depends on this
block's position.

### 4.6 Earlier closures, re-probed

Each of these was checked by a probe of my own construction, not by reading the code. Results
are in section 7.

## 5. What I accepted as reported, and from whom

Everything about Railway (that the passphrase and the snapshot key live only there; that Tom
alone reaches it), everything about staging deployments, the paid live-AI runs, the Drive
authorities, Tom's instructions, and the provenance and classification of the thirty snapshot
records. All of it comes from the builder's session. None of it is verified by me, and after
eight passes none of it is verifiable from inside this project's tooling.

## 6. Findings

### N1. A notice that WAS delivered is recorded as "NO send was attempted", starts no cooldown, and is duplicated five minutes later. The test pinning M2's property exercises a send that was attempted. Severity: MEDIUM

**What is claimed.** `lib/workspace/unlockAlert.js` rule 4, and finding M2's remediation:
"never describe something as having happened when it did not". M2 introduced
`ALERT_ERROR_EVENT` for "a failure BEFORE any send was attempted - a database error, or the H7
field guard firing", with the summary wording `... and NO send was attempted`. The M
remediation says it was "Tested end to end: the row, its summary, and the reason handed to the
next caller must all say that nothing was sent."

**What I did.** The `catch` in `maybeAlertOnFailedUnlock` is entered from **both sides** of the
`await send(...)` call, and its `claimId !== null` branch cannot tell which. I injected a
failure into the single statement that runs immediately *after* a successful send — the UPDATE
that turns the claim row into its outcome — leaving every other statement working, which models
a dropped connection or a database restart in that instant. That is a documented Railway
failure mode for this project (the 15/07/2026 incident).

```
$ node postsend.js
MESSAGES ACTUALLY DELIVERED: 1
function returned: {"sent":false,"error":"connection terminated unexpectedly"}
what the register now says:
   [workspace_unlock_alert_error] Security notice could not be completed for "rev8-post-1820"
   and NO send was attempted: connection terminated unexpectedly
--- five minutes later, the next failed unlock arrives ---
second evaluation: {"sent":true}
TOTAL MESSAGES DELIVERED FOR ONE BURST: 2
```

**What happened.** A message genuinely reached the mailbox. The security register states, in
capitals, that no send was attempted. Because no `workspace_unlock_alert_sent` row exists, the
60-minute cooldown never starts; the 5-minute error backoff applies instead, and a second
notice for the same burst goes out. So the register's answer to "did the alarm ever reach
anybody" is wrong **in the negative** — the same direction of error as H2, where an undelivered
notice ate the budget.

**And the test does not establish the property.** The case that pins M2 is:

```js
sendFn: async () => { throw new Error('transport exploded'); }
...
assert.match(errored[0].summary, /NO send was attempted/, ...)
```

A `sendFn` that throws when called **has been called**. The comment above it says "the
transport threw before anything was sent", which is not what the fixture does. So the test
asserts the "NO send was attempted" wording for a case where a send *was* attempted, and would
pass unchanged against the defect above. I confirmed the same branch is taken for a throwing
transport:

```
3 send throws -> "transport exploded" recorded: ["error"]
```

This is the builder's own post-J1 rule — *the test must exercise the real function under the
conditions the property claims to hold* — not met by the test written to satisfy it.

**Remedy.** Do not infer "was anything sent?" from `claimId`. Track it:

```js
let sendAttempted = false;
...
sendAttempted = true;
const result = await send({ to, subject, body });
```

and have the catch choose its event type and wording from `sendAttempted`. A failure *after* the
send left is not an evaluation error: record it as a distinct outcome ("a notice was sent and
its result could not be recorded"), and — because the message did go — let it start the
**cooldown**, not the 5-minute retry, or a duplicate is guaranteed. Then change the M2 test's
fixture to one that fails before `send` is entered (a database error on the claim read), and add
a second case that fails *after* a successful send and asserts the record does **not** say "NO
send was attempted".

---

### N2. The regression test that guards the boundedness property cannot detect the defect this cycle fixed, and none of the four structural changes is named by any test. Severity: MEDIUM

**What is claimed.** The M remediation: "Measured after the change: 100 consecutive bursts of 8
concurrent callers, exactly one notice every time". The module's rule 2: bounded "no matter how
many arrive at once". `test/workspace/unlockAlert.test.js` carries three concurrency subtests
presented as the guard on that property.

**What I did.** Ran the committed subtest's exact conditions — 8 callers via `Promise.all`, no
stagger, 120ms send, warm pool — against the **defective previous head**, 150 rounds. Then added
the one ingredient it lacks.

```
$ TARGET_REPO=/tmp/rev8/prev node stagger-prev.js 150 8 0 120     # the committed profile
{"noticesPerBurst":{"1":150}}                                     # clean, 150/150
$ TARGET_REPO=/tmp/rev8/prev node stagger-prev.js 150 8 40 30     # + 0-40ms arrival stagger
{"noticesPerBurst":{"1":134,"2":16}}                              # 16 duplicates, 10.7%
```

**What happened.** The committed test is blind to the defect it now guards against, at any
number of rounds. The mechanism explains why: the duplicate needs a caller whose *decision* is
older than its *write*, which requires arrivals separated by a few milliseconds. `Promise.all`
launches them together, so they either serialise or collide inside the lock — never the shape
that breaks. The builder found this defect by hand-instrumenting the decision path, fixed it
correctly, and added no test that would catch its return.

Compounding it, `grep` across the whole test tree returns nothing for
`ALERT_ABANDONED_EVENT`, `alert_abandoned`, `ClaimContention`, `uq_workspace_alert_pending`,
`23505`, or the seed's `Superseded duplicate claim` migration. **All four of this cycle's
structural changes are untested**, including the migration whose absence crashloops the app on
boot on an affected database — which the builder correctly identified as "same class as the
Scott release incident" and then verified only by hand.

Given that this module has regressed in four consecutive cycles and every regression was
introduced by a fix, an untested guarantee is the specific mechanism by which that keeps
happening.

**Remedy.** Three small ones:

1. Add a jittered arrival to the concurrent subtest — `await sleep(Math.random()*40)` before
   each caller, and a shorter send delay — and confirm it goes **red** against `39812ac` before
   trusting it. That is the counter-example discipline the seventh review asked for.
2. Add a unit case for the `abandoned` type (a stale claim is retired, not deleted, and does not
   gate) and one for the `23505` stand-down (insert a pending row out of band, assert the second
   claim stands down rather than throwing).
3. Give the seed migration a gated test in the shape `test/waiSeedMode.test.js` already
   establishes: pollute a throwaway database with duplicate claims, shell out to the real
   `node db/seed.js`, assert exit 0 and the index present. The machinery exists.

---

### N3. Exhausted claim contention is recorded as an evaluation error and buys the five-minute send backoff, silencing a genuine burst. `ClaimContentionError` is declared as a distinct class and then handled identically to a database failure. Severity: LOW

**What is claimed.** The M remediation, on its own first attempt at M3: "That was an
overcorrection... it would have written error rows and suppressed real alerts for five minutes
during ordinary contention. Caught by running it, not by reading it." The landed fix adds jitter
and a `handled` check to reduce how often exhaustion is reached — but keeps the mechanism.
Eleven lines away, the same commit reasons correctly about the `abandoned` type: *"deliberately
NOT one of the types that gates a later attempt: nothing was tried, so nothing has earned a
backoff"*. Exhaustion is the same case: nothing was tried.

**What I did.** Held the subject's advisory lock from a separate psql session so every attempt
loses, then released it and let a genuine five-attempt burst evaluate.

```
external session holds the subject lock
attempt-1 result: {"sent":false,"error":"could not obtain the claim after 4 attempts ..."}
rows after: [{"event_type":"workspace_unlock_alert_error","summary":"... NO send was attempted: ..."}]
lock released; the alarm is now free to work
attempt-2 result: {"sent":false,"quiet":true,
  "reason":"the last attempt could not be evaluated 0 minute(s) ago and NO send was attempted;
            retrying after 5 minutes"}
NOTICES DELIVERED: 0
```

**What happened.** 0.3 seconds of obstruction buys five minutes of guaranteed silence, after
the obstruction has cleared, with five failed unlock attempts sitting unreported. I also reached
the same path without any external actor, from callers alone, at 400 concurrent callers with
background pool load — one exhaustion, one error row, one 5-minute suppression.

**Why this is LOW and not MEDIUM.** The deployed rate limiter is 5 per 15 minutes **per user
id** (`routes/workspace.js:67-74`), so a real burst is at most 5 concurrent, and I could not
produce a single exhaustion at 60 concurrent. I also checked the obvious alternative trigger and
it is benign: under connection-pool starvation the *recording* fails too, so no suppressing row
is written and the alarm recovers the moment the pool does (verified — 1 notice, not 0).

It is still worth correcting, because the code already knows this is a different class of event
and then throws that knowledge away. `ClaimContentionError` is thrown at line 449 and appears
nowhere else in the repository — no `instanceof`, no export. It is a distinct type handled as an
undifferentiated failure.

**Remedy.** Catch `ClaimContentionError` by name in `maybeAlertOnFailedUnlock` and record it
under its own type — `workspace_unlock_alert_contended` — which, exactly like `abandoned`, is
written durably (J3) but is **not** one of the types `decideAlert` gates on. Nothing was tried,
so nothing has earned a backoff. Add `ALERT_ERROR_EVENT` and the new type to the `handled` list
in `claimAlertSlot` while you are there, so a loser does not pile a second error row on top of
the winner's.

---

### N4. A claim row dated ahead of the application clock is accepted at a negative age and silences the alarm for the whole skew; the retirement sweep cannot clear it either. Severity: LOW

**What is claimed.** The seventh review raised the two-clocks dependency as a concern it could
not turn into a finding. This cycle made it slightly worse: the same comparison now also drives
the `abandoned` retirement (`created_at < now - lease`), and a partial unique index means an
unretired claim occupies a slot.

**What I did.** Planted one claim row 20 minutes in the future, as a database clock running
ahead of the application clock would produce, and evaluated a six-attempt burst at four
moments.

```
+0min:  sent=false  another attempt claimed the send -20 minute(s) ago; its lease runs for 3
+5min:  sent=false  another attempt claimed the send -15 minute(s) ago; its lease runs for 3
+21min: sent=false  another attempt claimed the send 1 minute(s) ago; its lease runs for 3
+25min: sent=true
```

**What happened.** 23 minutes of silence from a 20-minute skew, and the module reports a
**negative age** in its own reason string without treating it as impossible. The retirement
sweep cannot fire either, because the row is not older than `now - lease`. It does self-heal
once real time passes the skew, so the silence is bounded, not permanent.

**I could not demonstrate the trigger occurring** — I have no way to skew Railway's database
clock, and the `-1 minute(s)` values the seventh review observed are a `Math.floor` artifact of
a sub-second difference, not real skew. I raise it as a finding rather than a concern only
because the consequence is silence, this chain's stated worse failure, and the remedy is one
line.

**Remedy.** In `decideAlert`, clamp: a computed age below zero is a clock disagreement, not a
fresh event. Treat it as expired, and record it once as its own activity row so a skewed
deployment is visible rather than quietly deaf. The same clamp covers the delivered, failed,
error and pending legs.

---

### N5. The gated-suite drift guard is evaded by four ordinary gate shapes, including the one this repository's own suites use to read their environment. The remediation's "all five caught" is again verified against the pattern's own sample. Severity: LOW

**What is claimed.** The M remediation on M4: "It now matches the guard itself: a `return`
conditioned on an environment variable. Verified against five shapes including the two that
previously evaded: all five caught, each confirmed by planting a file and watching the guard go
red."

**What I did.** Planted five gated suite files in a worktree, one at a time, and ran
`test/gatedSuites.test.js` against each.

```
CAUGHT    : A: bare early return on process.env (M4's stated shape)
*** MISSED: B: hoisted const, then test the const
*** MISSED: C: destructured from process.env
*** MISSED: D: guard clause with a helper function
*** MISSED: E: logical short-circuit into a `ready` const
```

**What happened.** Four of five walk past. The new pattern,
`/if\s*\([^)]*process\.env[^)]*\)\s*\{?\s*return\b/`, requires `process.env` to appear **inside
the `if` parentheses**. Shape B — hoist the variable into a `const`, then test the `const` — is
how `test/workspace/adversarialApi.test.js:14-21` and `test/scott/adversarialApi.test.js:33-34`
both read their own environment. The guard works today only because all five declared suites
happen to use the `skip:` shape, which a different pattern catches.

This is M4's criticism repeated verbatim one cycle later: the claim "all five caught" was
established against shapes the pattern was written from.

**Remedy.** Stop matching gate *syntax*; match the *data*. Every one of the four missed shapes
names its arming variable. Add a shape that looks for the variable names rather than the control
flow — e.g. flag any test file mentioning `process.env` together with a token matching
`/(?:_BASE_URL|_PASSWORD|_PASSPHRASE|^RUN_|WAI_SEED_TEST)/` and not declared in `GATED`. That
catches B through E, is refactor-proof, and cannot be defeated by rewriting an `if`. Then verify
it the way M4 asked: plant the counter-examples and watch it go red, not the examples and watch
it go green.

## 7. What I re-verified as still closed

| Finding | How I checked it | Result |
|---|---|---|
| F1 (CMS-admin takeover) | seized `tom` via a real `PUT /api/admin/user/2/password` as `nat`, confirmed the seized session authenticates (`/api/admin/pages` 200), then attacked every surface | stops at the unlock screen; every data page 302s there; APIs 404 with no mention of unlocking; 7 passphrase guesses reach nothing |
| F2 / G1 (denial indistinguishable) | 15 paths x 3 Accept values vs a control path, comparing status, full header set (nonce-normalised), cookie names and normalised body; flag on and off; anonymous and as an authenticated non-owner admin; 7 HTTP methods | **45/45 identical in all three identities**; no header differs; method sweep clean |
| H1 (alert recipient) | poisoned the CMS row `contact.email` to `attacker@evil.example` directly in the database, then called `alertRecipient()` | not retargeted; returns the constant; honours only `WORKSPACE_ALERT_EMAIL`; takes 0 parameters; source contains no content lookup |
| H2 (delivered vs failed) | behavioural, through the real path | failed send gated at +2min, free at +6min; delivered gated at +59min, free at +61min with fresh failures |
| H3 (boot honesty) | boot lines, flag on and off | each gate reported separately, real user ids printed, alarm correctly declared inert (`GMAIL_APP_PASSWORD` unset) |
| H4 (one activity level) | grep for `ACTIVITY_SENSITIVITY` across the tree, then its call sites | one constant (`routes/workspace.js:45`), exactly two call sites (160, 307), one test; no third surface |
| J2 (subject column, exact match) | an account literally named `rev8-j2-%` alerting alongside a victim account | wildcard account alerted; **the victim still alerted**; no cross-silencing |
| J3 (pre-send failure recorded) | three failure shapes through the real entry point, then a lock/transaction sweep | all durable; **0 advisory locks held, 0 backends idle in transaction** after every harness |
| K3 (`decideAlert` live) | call-site count in the deployed module | exactly one call site, inside `claimAlertSlotLocked`; no second copy of the rule |
| L1 (dedicated connection) | the branch the deployed handle takes | `dedicatedConnectionSource(require('db/pool'))` = `'wrapper'`; a shorthand handle is refused and throws |
| L2 (silence) | nine harness shapes, ~1,500 threshold-or-above bursts, plus the pre-fix control | 0 silent, 0 duplicated; control reproduces the defect at 4% and 10.7% |
| L3 (secrets) | AES-GCM tag verification over 78 distinct 64-hex candidates from 2,014 files plus the process environment, with a control blob proving the routine works | **0 authenticate**; no plaintext snapshot anywhere; `.gitignore` guard present; snapshot hash unchanged |
| M1 (worker close) | ran the worker standalone; reverted the fix in a worktree and re-ran the suite | exit 0 clean; reverted, the test goes red with `worker exited 1: ...` — the fix is genuinely load-bearing |
| M5 (`armed` map) | ran `gatedSuites` with and without `WORKSPACE_TEST_PASSPHRASE` | `5 of 5 did NOT run` vs `4 of 5`, `[RAN ]` only when the passphrase is present |
| K5 (freeze) | `rev-parse` / `status` at start and end; snapshot hash | clean at the frozen head throughout |

## 8. Concerns I could not turn into findings

- **A duplicate is still possible if a send outlives the three-minute claim lease.** Documented
  and deliberate. I observed it directly while probing N1 (two messages for one burst), and it
  behaved exactly as documented. Worth knowing it is the accepted case, not the eliminated one.
- **A legacy database keeps one permanently unresolved claim.** On the pre-J2 database, the
  migration retires all but the newest claim per `subject`, and the survivor has `subject = ''`.
  No caller ever uses an empty username, so nothing will ever retire it: the register shows an
  unresolved claim forever, in a register whose stated purpose is distinguishing "never
  triggered" from "triggered and never finished". Harmless in practice — production has never
  run this code — but a `WHERE subject <> ''` on the retirement would tidy it.
- **`decideAlert`'s default parameter still references `CLAIM_LEASE_MINUTES`, declared 99 lines
  later.** Unchanged for a third pass. Safe only because defaults evaluate at call time.
- **The `handled` list omits `ALERT_ERROR_EVENT` and `ALERT_ABANDONED_EVENT`**, so a loser that
  exhausts after a winner errored will add a second error row. Noise rather than harm, and
  folded into N3's remedy.
- **`ClaimContentionError` is thrown but never caught by name.** Dead as a type. Also N3.
- **No live alert email has ever been delivered.** The builder says so plainly, which is right.
  The last hop of this control remains untested by anyone. My N1 probe is the closest anyone has
  come, and it exercises everything except the mailbox.
- **The in-memory unlock attempt budget still resets on any restart** (G6, disclosed and
  unchanged). I relied on it for 14 HTTP rounds; a patient attacker can rely on it too.
- **A non-GET request with a bad CSRF token returns 500 rather than 403** on workspace paths and
  on the control alike. Pre-existing, not a disclosure.
- **Who holds Railway.** F1's closure, H1's remedy and the whole third gate rest on Railway being
  reachable only by Tom. Eight passes, no reviewer has seen it.
- **Eight passes, eight instances — and the curve has turned properly.** F to K fell, L rose to
  three HIGH, M had none in production code, and N has one, in a narrow failure window, that
  costs an inaccurate register entry and a duplicate email rather than access or disclosure. The
  rules adopted after J1 and L1 both worked again this cycle where they were applied. What they
  did not cover is the two places I found: a `catch` block that infers a fact it cannot know,
  and a test whose *conditions* — not whose function — are the wrong ones. If a ninth rule is
  wanted it is this: **when a fix turns one event type into two, write down which side of the
  boundary every code path is on, and check that each path can actually tell.** That single
  question finds N1 and N3 together.

## 9. What remains for Tom Arrington

1. **The gates hold, and after eight independent attempts that sentence has earned real weight.**
   Nobody has opened this area or leaked a record from it. Holding your CMS admin account and
   resetting your password still gets an attacker to a locked screen and no further. With the
   flag off, the workspace is byte-for-byte indistinguishable from a URL that was never built,
   headers and cookies included, so **merging remains inert**. I re-established that myself, in
   three identities, rather than accepting it.
2. **The failed-unlock alarm is now a control that works, and this is the first pass that can
   say so on evidence rather than on a fix.** Roughly 1,500 threshold bursts across nine harness
   shapes, including twenty racing processes and the real HTTP endpoint, produced exactly one
   notice every time — while the same harnesses break the previous head at 4% and 10.7%. The
   concurrency chapter of this project should be considered closed.
3. **What is not closed is the alarm's honesty and its test cover**, and those are the two
   MEDIUMs. N1 means that in a narrow window a warning that reached you is recorded as never
   sent, and is repeated five minutes later. N2 means the test guarding the property just fixed
   cannot see the defect just fixed. Both are hours of work, not days, and both have a concrete
   remedy written above.
4. **Do the secret rotation.** It is still yours and still outstanding: `WORKSPACE_ACCESS_PASSPHRASE`,
   `WORKSPACE_SNAPSHOT_KEY`, then `SESSION_SECRET` (which invalidates every CRM erasure
   tombstone, by design) and the account passwords. I verified independently that no live
   snapshot key survives in this working environment — 78 candidates, cryptographic tag
   verification, none authenticate — but a value a builder session once held in cleartext is not
   a secret a control should rest on.
5. **On the published severity bar, nothing in this report blocks your release decision.** There
   is no HIGH, nothing that opens the workspace, nothing that leaks, and nothing that stops the
   alarm firing on a real burst. If you want a green verdict first, N1 and N2 are the two to
   clear; N3, N4 and N5 are tidy-ups.
6. **Why this is AMBER and not PASS, said plainly, because you should be able to check my
   reasoning.** I did not withhold a PASS out of deference to seven predecessors. I withheld it
   for one reason: there is a defect in production code, introduced by the previous cycle's fix,
   in the module's own headline honesty rule — and the test written to establish that rule does
   not establish it. That is the same pattern for the eighth time, and the right response to it
   is to fix the two MEDIUMs and re-verify, not to grade around it. Everything else I attacked
   held, and held convincingly.
7. **What still cannot be verified from inside this project's tooling** after eight passes: the
   Drive authorities, the provenance and classification of the thirty snapshot records, your own
   instructions except as quoted by the builder, and everything about Railway. If you want those
   certified it needs a reviewer with Drive access and, on the evidence of eight passes, one not
   commissioned by the session whose work is being reviewed.

---

Nothing in this review was merged, deployed, connected, spent or enabled. The paid live-AI
suites were not run. My writes were confined to three throwaway databases — `ws_rev8`,
`ws_rev8_dirty` and `ws_rev8_legacy` — created from nothing and dropped at the end; within
`ws_rev8` I changed the local `tom` password, the CMS `contact.email` row and the
`workspace_activity` rows my probes created, restored the content row, and then dropped the
database entirely. Every experiment needing a code change was done in `git worktree`s under
`/tmp`, which have been removed. `data/workspace-snapshot.enc` is unchanged and was never
decrypted: my only interaction with it was a GCM tag check whose output was a boolean. The
reviewed branch is left at `62266730fdeaffefbb3f7f9ccd7f6b9b7d432eef` with a clean tree.
