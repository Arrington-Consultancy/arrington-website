# Arrington AI Workspace v0.1: Independent Governance & Assurance Review (seventh pass)

Date: 31 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, frozen head
`39812acc75d4d608be418f55ebd8d05c313b4280`.
Baselines: the six previous reviews (F1-F10, G1-G9, H1-H7, J1-J4, K1-K5, L1-L5, **all
AMBER**, the sixth raising severity to three HIGH) and the builder's six responses, the most
recent being `review/workspace-v0.1-l-remediation-2026-08-31.md`.

```
$ git rev-parse HEAD
39812acc75d4d608be418f55ebd8d05c313b4280
$ git status --porcelain
(empty)
```

**The tree stayed frozen and clean throughout.** I re-checked `rev-parse` and `status
--porcelain` on the reviewed checkout at the end of the review and both were unchanged, and
`data/workspace-snapshot.enc` still hashes to
`e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2`. K5's remedy has now held
twice running. Every experiment needing a code change was run in a `git worktree` under
`/tmp`, which has been removed; every write went to a throwaway database `ws_rev7`, created
from nothing and dropped at the end. This report is committed on a separate branch.

## 1. The bounded question

Is there a **seventh** instance of the pattern that produced six AMBER verdicts: a security
property asserted in a comment, a remediation or the project memory that does not hold in the
code? Specifically: does the third rewrite of the concurrency code in
`lib/workspace/unlockAlert.js` survive being attacked rather than read — the positive
connection identification, the read-inside-the-lock, the retry on lost contention, the absence
of leaked locks and transactions, the drift guard's four shapes, and the claim that no live
secret survives in the working environment? And do the earlier closures (F1, G1, H1, H2, H4,
J2, J3, K3, K5) still hold under probes of my own construction?

Nothing more. This review does not authorise a merge, a deploy, an environment variable change,
a spend, or the connection of any external account, and it did none of those things.

## 2. VERDICT: AMBER

**AMBER — but a materially different AMBER from the six before it, and Tom should read the
difference rather than the colour.**

For the first time in this chain:

- **No HIGH finding.**
- **No defect in production code.** Everything I found is in a test helper, in the honesty of
  a reason string, in an unrecorded edge, or in a drift guard.
- **The concurrency control now works, and I proved it rather than accepting it.** Across five
  independently written harnesses — in-process bursts, background-traffic bursts, staggered
  arrivals, twelve racing OS processes, and the real HTTP endpoint as the authenticated owner —
  **roughly 380 threshold-sized bursts produced exactly one notice every single time: zero
  silent, zero duplicated.** The same harnesses run against the previous head reproduce both of
  the sixth review's HIGH defects (23 silent rounds in 96 in-process; 3 silent rounds in 12 over
  HTTP), so the instruments are demonstrably sensitive.
- **L3 is genuinely closed, and I verified it by a method that needs none of the builder's
  account:** every 64-hex string anywhere in the session tree was tested by AES-GCM tag
  verification against the committed ciphertext. 205 candidates, **zero authenticate**. No token
  matching the shape of any of the three live values disclosed by the sixth review survives
  anywhere in the session tree, the scratchpad or the repository.

The AMBER stands on this: **the governing pattern did recur, a seventh time, in the commit
that fixed the sixth instance of it.** `scripts/workspaceUnlockClaimWorker.js` calls
`db.end()`, and `db/pool.js` exports `{ query, pool }` — no `end`. Every worker process in the
cross-process concurrency test, one of the two tests that pin the boundedness property, dies
with `TypeError: db.end is not a function` and exits 1, and the test cannot see it because it
discards `execFile`'s error whenever a JSON line was printed. It is the *identical wrong
assumption about `db/pool.js`'s shape* that finding L1 was raised for, made again eleven lines
away from the comment explaining L1. It has no production consequence, which is why it is
MEDIUM and not HIGH. It matters because it is direct evidence about the builder's
self-verification, which is the thing seven reviews have actually been testing.

Five findings: three MEDIUM, two LOW. **Nothing found meets this chain's own bar of "correct
before this candidate is treated as releasable."** On the published severity scale, the release
decision is not blocked by anything in this report.

## 3. Independence, and its limits

I am a separate session from the technical builder. I wrote none of the workspace code and
accepted no claim I could test myself. The four limits recorded by every previous pass stand
unchanged:

1. **I am a Claude agent, commissioned by the builder's own session, reviewing the builder's
   work.** Structural, uncured by my having found things, and unresolved after seven passes.
2. **No network access to Railway or to the live site.** Everything about production and staging
   variables, deployments and the paid live-AI runs is reported to me, not verified by me.
3. **No Google Drive access.** The controlled authorities and Tom's own instructions reach me
   only as transcribed by the party they constrain.
4. **No real browser.** I drove the application over HTTP and inspected status, headers, bodies,
   cookies and timing. I did not render a page.

The paid live-AI suites were **not run**: they spend money and I was instructed not to. They are
not evidence in this pass.

## 4. What I did, with observed results

Environment: local Postgres 16; a throwaway database `ws_rev7` seeded from nothing; servers on
ports 3017 (workspace armed), 3019 (`env` with no workspace variables at all, which is
production's configuration if this branch merges) and 3021/3022 (per-round restarts for the HTTP
burst work); a `git worktree` at `/tmp/rev7/wt` for anything needing a code change.

### 4.1 The regression suite

```
DATABASE_URL=... SESSION_SECRET=... npm test
# tests 532   # suites 53   # pass 530   # fail 0   # skipped 2
$ grep -c "not ok" npmtest.txt
0
```

Matches the builder's figure exactly. The gated block printed:

```
#   GATED SUITES: 5 of 5 did NOT run in this invocation.
#   The pass/fail counts above do not cover them.
#   [SKIP] two-pass seed
#   [SKIP] Scott adversarial HTTP
#   [SKIP] Scott live-AI pressure (SPENDS MONEY)
#   [SKIP] workspace adversarial HTTP
#   [SKIP] workspace live-AI pressure (SPENDS MONEY)
#   A release decision needs the adversarial suites run by hand
```

Node reported "skipped 2" while five suites carried a `# SKIP` directive, which is precisely the
confusion the block exists to correct. It corrects it. Its drift guard is still weaker than
claimed; see M4 and M5.

### 4.2 The builder's adversarial suite, armed against a freshly restarted server

```
WORKSPACE_TEST_BASE_URL=http://localhost:3017 WORKSPACE_TEST_TOM_PASSWORD=...
WORKSPACE_TEST_OTHER_PASSWORD=... WORKSPACE_TEST_PASSPHRASE=...
node --test test/workspace/adversarialApi.test.js
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

Nine of nine, all executed, none NOT EXECUTABLE. **Both traps recorded by the last three
reviewers cost me runs again** and are worth restating for the next reader: the site login
limiter is 5 per 15 minutes per IP so the server must be restarted between runs, and a POST
without a real CSRF token is answered by the global CSRF middleware before the workspace guard
is reached — I lost twelve HTTP rounds to `403 EBADCSRFTOKEN` before noticing I was measuring
CSRF and not the alarm. A third trap, not previously recorded: **the login page carries its
token as a form field, not as the `csrf-token` meta tag**, and the session is regenerated at
login (finding G5), so the `_csrf` cookie must be re-read from an authenticated page afterwards.

### 4.3 L1: the connection is now genuinely dedicated, and the branch is asserted

```
$ node -e "d=require('./db/pool'); console.log(Object.keys(d), typeof d.end, typeof d.connect)"
[ 'query', 'pool' ] undefined undefined
```

`dedicatedConnectionSource(require('./db/pool'))` returns `'wrapper'`, so `acquire()` takes
`db.pool.connect()` — a real, single, checked-out connection. A handle that cannot yield one is
refused rather than silently degraded, and the refusal reaches the durable record (4.6, case C).
I confirmed the discriminator against a real `pg.Pool` (`'pool'`), a checked-out client
(`'client'`), a query-only shorthand (`null`, and `claimAlertSlot` throws), and the deployed
wrapper.

Measured lock hold, ten consecutive claims (acquire, `BEGIN`, `pg_try_advisory_xact_lock`, four
reads, the claim `INSERT`, `COMMIT`):

```
5.4, 2.4, 2.3, 1.9, 1.9, 1.8, 2.1, 1.9, 2.2, 3.1 ms
```

### 4.4 L2: I could not produce a silent burst, and I tried five ways

Every figure below is "notices delivered per burst", where the stated bound is exactly one.

```
in-process, 3 callers at the threshold, warm pool, no other traffic
  25 rounds: 1x25                                    SILENT 0/25   >1  0/25
in-process, 3 callers, with continuous unrelated traffic on the same pool
  25 rounds: 1x25                                    SILENT 0/25   >1  0/25
in-process, 8 callers, with continuous unrelated traffic
  20 rounds: 1x20                                    SILENT 0/20   >1  0/20
replicating the builder's own test conditions, 20 blocks of 8 rounds
  160 rounds                                         SILENT 0/160  >1  0/160
staggered arrivals straddling the 100ms retry boundary
  gaps 0/30/60/95/105/150/250/400 ms, 15 rounds each
  120 rounds                                         SILENT 0/120  >1  0/120
12 separate OS processes racing a shared instant, each writing its own failure row
   8 rounds: 1x8                                     SILENT 0/8    >1  0/8
 3 separate OS processes at exactly the threshold
  12 rounds: 1x12                                    SILENT 0/12   >1  0/12
END TO END over the real HTTP endpoint, authenticated as the owner,
3 parallel POST /api/workspace/unlock per round, server restarted every round
  12 rounds: exactly one alert dispatch each         SILENT 0/12   >1  0/12
```

The same harnesses against the previous head `4d8c327` reproduce the sixth review's defects, so
they are sensitive instruments and not merely agreeable ones:

```
in-process, builder's conditions, 12 blocks of 8 rounds, PRE-FIX code
  blocks that would fail the assertion: 11/12
  silent rounds 23/96, duplicate rounds 0/96
END TO END over HTTP, PRE-FIX code, 12 rounds
  rounds with no alert at all: 3/12   (rounds 5, 6 and 8 wrote no alert row)
  same harness on the candidate:      0/12
```

And the new tests are genuinely red against the code they were written for. I did not take the
builder's word for this; I replaced only `lib/workspace/unlockAlert.js` with the `4d8c327`
version in a worktree and ran the frozen head's test file against it:

```
# tests 26   # pass 21   # fail 5
  not ok - the handle the application actually passes yields a dedicated connection
  not ok - a handle that cannot give a dedicated connection is refused, not silently used
  not ok - a real Pool and a checked-out client are both recognised
  not ok - a burst at exactly the threshold is never silent
  not ok - failed-unlock alerting, against a real database
```

Pool and lock hygiene after every burst above, on a separate observing connection:

```
idle-in-transaction backends: 0     advisory locks held: 0
```

Under pool pressure the retry loop's per-attempt checkout behaves: with 7 of 10 and then 9 of 10
connections pinned by unrelated work, five concurrent callers still produced exactly one notice
(213ms and 16ms respectively). With all 10 pinned, the alert path fails honestly on the 5-second
connect timeout and records the failure — see M2 for the consequence of that record.

### 4.5 The decision rules, behaviourally, against the deployed path

```
  0 sent | 0 failures                              | 0 failure(s) in the window, threshold is 3
  0 sent | 2 failures (below threshold)            | 2 failure(s) in the window, threshold is 3
  1 sent | 3 failures (at threshold)               | SENT
  0 sent | 3 failures + DELIVERED 5 min ago        | a notice was DELIVERED 5 minute(s) ago; cooldown is 60
  1 sent | 3 failures + DELIVERED 61 min ago       | SENT
  0 sent | 3 failures + FAILED send 1 min ago      | the last notice FAILED to send 1 minute(s) ago
  1 sent | 3 failures + FAILED send 6 min ago (H2) | SENT
  0 sent | 3 failures + PENDING claim 1 min ago    | another attempt claimed the send; lease is 3
  1 sent | 3 failures + STALE claim 4 min ago      | SENT
  0 sent | 3 failures OUTSIDE the 30-min window    | 0 failure(s) in the window, threshold is 3
  1 sent | J2: an account literally named '%' holds a fresh DELIVERED row -> the other account still alerts
```

K3 holds structurally as well as behaviourally: `decideAlert` is called from exactly one place,
`claimAlertSlotLocked`, inside the lock; `THRESHOLD` appears only in its own declaration, that
function's default parameter, and the export list, so there is no second copy of the rule that
could disagree.

### 4.6 J3, and the error paths do not leak

Three shapes through the real entry point:

```
A. the first read inside the lock throws
   -> {"sent":false,"error":"database is down"}
      durable row: workspace_unlock_alert_failed | "could not be evaluated ... database is down"
B. the send throws AFTER the claim
   -> {"sent":false,"error":"send exploded"}
      durable row: workspace_unlock_alert_failed | "could not be completed ... send exploded"
      claim rows left PENDING: 0
C. a handle that cannot hold a transaction (the L1 refusal)
   -> {"sent":false,"error":"unlock alert: no dedicated database connection available..."}
      durable row: workspace_unlock_alert_failed

after all three: idle-in-transaction backends 0   advisory locks held 0
```

A note for whoever repeats this: my first attempt at case A hung the whole pool, and the cause
was my probe, not the product. I monkey-patched a checked-out client's `query` with a
two-argument arrow, and node-postgres's `pool.query` calls `client.query(text, values,
callback)` — the dropped callback never fires and the next pooled query never settles. Pass
through all arguments and restore the original method on `release`.

### 4.7 G1 stayed closed, under a probe of my own construction

Comparing status, every response header except a named volatile set, the nonce-normalised body,
and Set-Cookie names against a control path that genuinely does not exist, over three `Accept`
values and fifteen page and API paths including `/workspace/`, `/WORKSPACE`, `/workspace/unlock`
and `/workspace/nonsense`:

```
ANONYMOUS, flag OFF (production's config on merge)    identical to control: 45/45
ANONYMOUS, flag ON                                     identical to control: 45/45
AUTHENTICATED as nat (site admin, NOT the owner)       identical to control: 45/45
   (nat is really authenticated: GET /api/admin/users -> 200)

X-Robots-Tag: /workspace (none) · /workspace/unlock (none) · /api/workspace/ask (none) · control (none)
methods HEAD/OPTIONS/PUT/DELETE/PATCH on /workspace vs control:
   404/404, 404/404, 500/500, 500/500, 500/500 — headersIdentical=true on every one
```

Worth recording so a future reviewer does not repeat my false start: the only header that ever
differs is the per-request `_csrf` cookie **value**, and the CSP carries a per-request nonce.
Both must be normalised or the probe reports 0/45 and means nothing. The header *set* is
byte-identical.

### 4.8 F1 stayed closed. The takeover, replayed

```
as nat (role admin):  /workspace, /workspace/unlock, /workspace/contacts, /workspace/activity
                                                          -> 404, 404, 404, 404
                      PUT /api/admin/user/2/password      -> 200 {"success":true}
as the SEIZED tom:    /workspace, /contacts, /brain, /activity
                                                          -> 302 /workspace/unlock, 39 bytes each
                      POST /api/workspace/ask             -> 404, mentions 'unlock': false
                      POST /api/workspace/contacts/1/erase-> 404, mentions 'unlock': false
                      wrong passphrase x5                 -> 401 (4,4,3,5,4 ms)
                      attempt 6                           -> 429 "Too many attempts."
                      the CORRECT passphrase, attempt 7   -> 429 (limiter, as it should)
```

The third gate holds and the legitimate recovery route is intact, as Tom required. I restored
`tom`'s password afterwards and confirmed the restore by logging in with it.

### 4.9 H1 stayed closed, with a write that actually landed

```
as tom (role content, holds edit_content)
  PUT /api/content {"fields":[{"key":"contact.email","content":"attacker@evil.example"}]} -> 200
  contact.email in the database afterwards: attacker@evil.example
  alertRecipient()        -> tom@arringtonconsultancy.com     <- NOT retargeted
  alertRecipient.length   -> 0                                <- takes no database handle
  WORKSPACE_ALERT_EMAIL='  security@example.test  ' -> "security@example.test" (trimmed)
  grep -E "FROM content|section_key" lib/workspace/unlockAlert.js -> (none)
```

I restored `contact.email` and verified the restore.

### 4.10 H3, H4 and J2

H3, both ways:

```
Workspace access: flag on | owner binding ok (username 'tom', expects user id 2) |
WORKSPACE_ACCESS_PASSPHRASE set, length 32 | failed-unlock alert CANNOT be sent:
GMAIL_APP_PASSWORD is unset. The alarm is inert in this environment. It would otherwise go to
tom@arringtonconsultancy.com | actual ids in this database: tom=2 | RESULT: the cleared owner can unlock

Workspace access: ENABLE_ARRINGTON_AI_WORKSPACE is not 'true', so the workspace does not exist
in this environment
```

H4: `ACTIVITY_SENSITIVITY` is declared once (`routes/workspace.js:45`) and read at exactly two
call sites (`:160`, `:307`); `repo.listActivity` has exactly those two callers. No third surface.

J2, including the schema-ordering trap, on a database made to predate the column:

```
DROP INDEX idx_workspace_activity_subject; ALTER TABLE workspace_activity DROP COLUMN subject;
  -> id, actor, event_type, summary, created_at
node db/seed.js -> "Workspace activity subject column verified." / "Seed complete." / EXIT=0
  -> subject character varying(200) not null ''
     "idx_workspace_activity_subject" btree (event_type, subject, created_at DESC)
```

### 4.11 L3: the secrets, checked without decrypting anything

The decisive test needs none of the builder's account and emits no secret. Every distinct 64-hex
string anywhere in the session tree and scratchpad was used as an AES-256-GCM key against the
committed ciphertext's own IV and tag; a key that is not the real one cannot forge the tag.

```
files scanned: 5834
distinct 64-hex candidates tested: 205
candidates that AUTHENTICATE data/workspace-snapshot.enc: 0
no file in the session tree holds the live snapshot key
```

Shape searches for the three live values whose first and last two characters the sixth review
disclosed, across `/root/.claude`, the scratchpad and the repository (1142 files, `.git` and
`node_modules` excluded):

```
SESSION_SECRET             (d3…97, 64 hex): 0
WORKSPACE_SNAPSHOT_KEY     (19…ca, 64 hex): 0
WORKSPACE_ACCESS_PASSPHRASE(lW…bj, 32 ch ): 0
```

The Railway `set-variables` payloads themselves are still in the transcript, but their values
now read `"<REDACTED-SECRET>"`; the only secret-shaped strings left in those payloads are the
sixth review's own already-redacted quotations (`d3<64 chars redacted>97` and the like). Every
other assignment my pattern sweep surfaced is a local throwaway (`devpass123`, `natTestPW123`,
`baseline-nat-pw`, `tomlocal123`, `correct-horse-battery`, `a-long-enough-test-passphrase`).
The repository is clean: `git grep` for a secret-by-name assignment returns only documentation
and test placeholders.

**L3 is closed on the evidence.** Rotation remains outstanding and is Tom's, not the builder's.

### 4.12 Scope

```
git diff --stat 4d8c327..39812ac
  CLAUDE.md                             |  56 ++
  lib/workspace/unlockAlert.js          | 183 ++++--
  review/…governance-review-6….md       | 715 +++
  review/…j-remediation….md             |  14 +
  review/…l-remediation….md             | 183 +++
  scripts/workspaceUnlockClaimWorker.js |   2 +-
  test/gatedSuites.test.js              |  24 +-
  test/workspace/unlockAlert.test.js    |  83 ++-
```

One production source file changed. **No undisclosed source change since the sixth review, and
nothing touching a live surface.** `CLAUDE.md`'s new section is accurate and states the L1
failure and its lesson plainly, without softening.

## 5. What I accepted as reported, and from whom

- **Everything about Railway**: that production carries no workspace variables, that the staging
  service exists, that any named deployment happened. From the builder.
- **The paid live-AI runs.** Not replayed; I spent nothing.
- **Tom's decisions** (F1 option 3, the F3/G3 approvals, the G6 alert instruction, the bounded
  paid-run authorisations) as quoted in the remediation documents. Seventh pass to record that an
  assurance lane reading an instruction transcribed by the party it constrains is a weak link.
- **The controlled Drive authorities**, the nine-lane register, and the provenance and
  classification of the thirty records in the encrypted snapshot. I did not read the snapshot:
  my only interaction with it was a GCM tag check whose output was a boolean.

## 6. Findings

Severity on the scale the previous reviews used. HIGH: correct before this candidate is treated
as releasable. MEDIUM: correct before v0.1 is treated as finished. LOW: record and schedule.
**There is no HIGH finding in this pass.**

### M1. The fix for L1 repeats L1's own mistake in the helper that backs the concurrency proof, and the test cannot see it. Severity: MEDIUM

**Claimed.** `review/workspace-v0.1-l-remediation-2026-08-31.md`: "The lesson I am recording,
because 'test the real function' was evidently not enough on its own: **assert the branch, not
just the outcome.**" `CLAUDE.md`: "`db/pool.js` exports `{ query, pool }`; the pool test was
`typeof db.connect === 'function' && typeof db.totalCount === 'number'`, which a plain object
fails." The cross-process test asserts `assert.equal(failures.length, 0, ...)` — that no worker
errored.

**What I did.** Ran `scripts/workspaceUnlockClaimWorker.js` directly; then reproduced the test's
own `execFile` handling verbatim over twelve workers and compared what the test sees against the
real exit codes; then swept every file in the repository that requires `db/pool` for a call to a
`pg.Pool`-only method on that handle.

**What actually happened.** The worker's last line is `await db.end().catch(() => {})`, and
`db/pool.js` exports no `end`:

```
$ node -e "d=require('./db/pool'); console.log(Object.keys(d), typeof d.end)"
[ 'query', 'pool' ] undefined

$ node scripts/workspaceUnlockClaimWorker.js <gun> probe
{"id":null,"err":null}
TypeError: db.end is not a function
    at scripts/workspaceUnlockClaimWorker.js:33:12
WORKER EXIT CODE = 1
```

`db.end()` throws synchronously, so `.catch` is never reached and the async IIFE rejects
unhandled. Reproducing the test's own resolution logic over twelve workers:

```
what the test sees  ->  worker errors: 0     (its assertion is: equal 0)
ACTUAL exit codes   ->  1,1,1,1,1,1,1,1,1,1,1,1
actual stderr       ->  TypeError: db.end is not a function
```

The test resolves `line ? JSON.parse(line) : { id: null, err: err ? err.message : 'no output' }`,
so `execFile`'s non-zero exit is **discarded whenever a JSON line was printed**. Twelve of twelve
workers crash on every run of the suite and the assertion that exists to notice worker trouble
reports zero. The repository-wide sweep found exactly one such call, so the rest of the codebase
is clean of the assumption:

```
--- ./scripts/workspaceUnlockClaimWorker.js (handle: db)
33:  await db.end().catch(() => {});
```

**Why it is MEDIUM and not HIGH.** It is a test helper. No production path calls `db.end`, no
control is weakened, and the claim assertion itself still runs and still returns a real result
before the crash — the boundedness evidence from that test stands. What is damaged is the
assurance around it, and the credibility of a remediation whose headline lesson is this exact
mistake. It is the seventh instance of the governing pattern and it is eleven lines below the
comment explaining the sixth.

**Remedy.** Use `db.pool.end()`, or add `end` to `db/pool.js`'s exports and use it. Separately,
and more importantly than the one-line fix: the test must fail on a non-zero worker exit code —
resolve `{ ...parsed, exitCode: err ? err.code : 0 }` and assert every exit code is 0, so a
worker that dies for any reason is visible. As written, the test's error check is decorative.

### M2. A failure that never attempted a send is recorded as a send failure, buys the send backoff, and is reported to the next caller as "the last notice FAILED to send". Severity: MEDIUM

**Claimed.** `lib/workspace/unlockAlert.js:60-63`, rule 4: "It NEVER fails the request it is
attached to, and **it never claims a send that did not happen**." And at `:165-168`, on the H2
correction: "the reason says plainly that nothing was delivered. The old wording said 'an alert
was already sent' when it had not been, which broke this module's own fourth rule in the one
place it was not looking."

**What I did.** Caused an *evaluation* failure on the real path (a handle with no dedicated
connection — the L1 refusal, which throws before any transport is touched), inspected what was
recorded, then immediately fired a genuine threshold burst on a healthy handle.

**What actually happened.**

```
1) evaluation failure, no send attempted:
   {"sent":false,"error":"unlock alert: no dedicated database connection available..."}
   recorded as: workspace_unlock_alert_failed
2) genuine burst straight after, healthy handle, 3 failures in the window:
   notices sent = 0
   reason: "the last notice FAILED to send 0 minute(s) ago; retrying after 5 minutes"
```

Two distinct harms. The alarm is suppressed for five minutes by something that never attempted
a mail, so the mail-storm backoff is being spent on a class of failure that cannot cause a mail
storm — and the same is true of the pool-exhaustion case in 4.4, where a connect timeout under
load writes the same row. And the reason string asserts a send attempt that did not happen,
which is rule 4's exact prohibition and the exact defect the H2 remediation says it corrected in
the neighbouring branch. The durable summary row is honest ("could not be evaluated"); it is
`decideAlert`'s reading of it that is not, because `ALERT_FAILED_EVENT` conflates "the transport
failed" with "the evaluation failed".

**Remedy.** Give an evaluation failure its own event type (say `workspace_unlock_alert_error`),
record it durably as now, and have `decideAlert` ignore it for backoff purposes or apply a much
shorter one — a database hiccup should not cost the alarm five minutes. If the two are to stay
one event, the reason must be built from the recorded summary rather than asserting a send, in
exactly the way H2's own correction describes.

### M3. Exhausting the retry budget is silent, writes nothing durable, and returns a reason that was never observed. Severity: MEDIUM

**Claimed.** `unlockAlert.js:29-33`: "It is BOUNDED, and bounded ATOMICALLY. One alert per
cooldown window per account, no matter how many attempts arrive and no matter how many arrive at
once." `:340-355`: "a caller that loses the lock retries a few times: the holder releases at
COMMIT, before the send, so contention lasts milliseconds." Finding J3's principle, which the
module adopts: the register must distinguish "never triggered" from "triggered and could not be
evaluated".

**What I did.** Held the alert's advisory lock from an unrelated session for a controlled
period, then fired a threshold-sized burst; measured the real claim duration for comparison.

**What actually happened.** The retry budget is four attempts, three sleeps of 100ms, and a
caller that exhausts it returns without writing anything:

```
lock held elsewhere for  200ms -> 3 callers, elapsed 318ms, notices sent = 1   (alert row written)
lock held elsewhere for  600ms -> 3 callers, elapsed 315ms, notices sent = 0   (alert rows: 0)
lock held elsewhere for 2000ms -> 3 callers, elapsed 312ms, notices sent = 0   (alert rows: 0)

  each caller returned: "another attempt is already deciding or sending for this account"
```

That reason is a module-level constant (`unlockAlert.js:375`) that is **never reassigned**, so it
is returned whatever the actual cause was; in the runs above nobody was deciding or sending. And
unlike every other way this control can fail, exhaustion leaves no row: nothing on
`/workspace/activity`, nothing anywhere, so the register cannot distinguish it from a burst that
never reached the threshold.

**Reachability, stated honestly rather than dramatised.** The claim transaction measured
1.8-5.4ms across ten runs, against a 300ms budget — a margin of roughly 60 to 150 times. I could
not produce exhaustion from concurrency alone in any of the ~380 bursts in 4.4, including twelve
racing processes. It needs the lock to be unavailable for an order of magnitude longer than the
work it protects, which means a severely degraded database. So this is not the L2 defect
returning; it is the one remaining path by which this alarm can be silent, and it is the one path
that leaves no trace.

**Remedy.** Record exhaustion durably, as J3 required for its sibling case, with a reason built
from what was observed (attempts made, lock never acquired) rather than from a constant. Assign
`lastReason` from the loop, or delete it and construct the message at the return. Optionally
raise the budget or make the last attempt a bounded blocking wait (`SET LOCAL lock_timeout` plus
`pg_advisory_xact_lock`), which converts silence into a recorded timeout.

### M4. The gated-suite drift guard keys on a comment, not on behaviour, and three ordinary shapes walk past it. Severity: LOW

**Claimed.** `review/workspace-v0.1-l-remediation-2026-08-31.md`: "Now four shapes: `skip:` in
options, `t.skip(...)`/`test.skip(...)`, a gate spread in from an options object, and an early
return on a missing environment variable. **Verified against all three of the reviewer's evasion
shapes: each is caught**, tested by planting a file of that shape and confirming the guard goes
red." The sixth review's remedy was explicit: "Detect a gate by *behaviour* rather than by text."

**What I did.** Planted three plausibly-written gated suites in a worktree and ran the guard;
then planted the builder's own two shapes as a control.

**What actually happened.**

```
evasive A  if (!process.env.PROBE_A_BASE_URL || !process.env.PROBE_A_PASSWORD) return;
evasive B  const armed = !!(...); if (armed) { test('live pressure suite that SPENDS MONEY', ...) }
evasive C  const run = process.env.RUN_PROBE_C ? test : () => {}; run('paid suite', ...)
  -> ok 1 - the suites that can decline to run are all declared      # fail 0   ALL THREE INVISIBLE

control  if (!process.env.PROBE_D_BASE_URL) return; // not configured
  -> not ok 1 - ... tmpprobe/builderShape.test.js                    CAUGHT
control  test('a costly thing', (t) => { if (!process.env.PROBE_E) { t.skip('needs PROBE_E'); ... } })
  -> not ok 1 - ... tmpprobe/skipShape.test.js                       CAUGHT
```

The fourth shape's pattern is
`/\breturn\b[^\n;]{0,40};?\s*\/\/\s*(?:not |un)?(?:configured|armed|available)/gi` — it requires a
**trailing comment containing one of three words**. The builder's planted example carried that
comment; the identical construct without it is invisible. So the guard was verified against a
sample that its own pattern was written from, and it detects documentation rather than gating.
Conditional registration and an aliased test function are not covered at all.

**Remedy.** As the sixth review said: detect the gate by behaviour. Run each test file in a
subprocess with an empty gate environment and assert it either reports a skip or registers no
tests; or have each gated suite export its own condition and read it here. A text pattern will
always be one refactor behind.

### M5. The `armed` map still contradicts the `arms` text beside it, which the sixth review named and the remediation did not answer. Severity: LOW

**Claimed.** `test/gatedSuites.test.js:33` declares the workspace adversarial suite is armed by
"`WORKSPACE_TEST_BASE_URL + WORKSPACE_TEST_TOM_PASSWORD + WORKSPACE_TEST_PASSPHRASE`, against a
running server". The sixth review's remedy: "And derive `armed` from the suites rather than
restating it."

**What I did.** Ran the reporter with the base URL and Tom's password set and the passphrase
absent.

**What actually happened.**

```
#   GATED SUITES: 4 of 5 did NOT run in this invocation.
#   [RAN ] workspace adversarial HTTP
```

`armed` at `:97` is `!!(env.WORKSPACE_TEST_BASE_URL && env.WORKSPACE_TEST_TOM_PASSWORD)` — the
passphrase is not in it. Three sub-checks of that suite skip as `NOT EXECUTABLE: set
WORKSPACE_TEST_PASSPHRASE; without it Tom cannot unlock` (`adversarialApi.test.js:277, 297` and
the erasure case), including every check behind the unlock. So the one block whose purpose is to
stop a reader over-reading the coverage can itself report `[RAN ]` over a run in which the
post-unlock half asserted nothing. The `arms` text was corrected in the L cycle; the code beside
it was not, which is a hand-maintained second copy of a condition asserted against nothing — the
same shape as finding K3.

**Remedy.** Derive `armed` from each suite rather than restating it, or at minimum add the
passphrase to the condition and add a test that the two disagree-able copies agree.

## 7. What I re-verified as still closed

| Finding | How I checked it | Result |
|---|---|---|
| F1 (CMS-admin takeover) | seized `tom` via `PUT /api/admin/user/2/password` as `nat`, then attacked every surface | stops at the unlock screen; APIs 404 with no mention of unlocking; limiter at attempt 6 |
| F2 / G1 (denial indistinguishable) | 15 paths x 3 Accepts vs a control path, status + full header set + nonce-normalised body + cookie names, flag on and off, anonymous and as an authenticated non-owner admin | 45/45 identical in all three identities; no `X-Robots-Tag` on any denial; 5 HTTP methods identical |
| H1 (alert recipient) | real `PUT /api/content` that changed the row, then `alertRecipient()` | not retargeted; takes no db handle; env value trimmed; no content read in the module |
| H2 (delivered vs failed) | behavioural, against the live path | a failed send earns 5 minutes, a delivered one earns the hour (but see M2 for what else earns the 5) |
| H3 (boot honesty) | boot lines, flag on and off | reports each gate separately, prints the real user ids, says the alarm is inert here |
| H4 (one activity level) | the constant, its call sites, `listActivity`'s callers | one constant, exactly two surfaces, no third |
| J2 (subject column, exact match) | fresh DB, and a DB with the column and index dropped | migration idempotent and correct; `'%'` cannot silence another account |
| J3 (pre-send failure recorded) | three shapes through the real entry point | all three durable; no claim left pending; no lock or transaction leaked |
| K3 (`decideAlert` live) | read the deployed path; ran all four rules against it | live, one copy, no pre-check that could disagree |
| K5 (freeze) | `rev-parse` / `status` at start and end; snapshot hash | clean at the frozen head throughout |
| L1 (dedicated connection) | the deployed handle's branch; a real Pool; a client; a shorthand | resolves `'wrapper'`, takes a real dedicated connection, refuses and throws on a shorthand |
| L2 (silence) | five harnesses, ~380 bursts, plus the pre-fix control | 0 silent, 0 duplicated; control reproduces both defects |
| L3 (secrets) | GCM tag verification over 205 candidates; shape searches over 1142 files | 0 live keys; 0 tokens of any disclosed shape; repository clean |
| L4 (the disproven sentence) | read all three places | module rule 2 and the J remediation both corrected in place and marked as corrections |

## 8. Concerns I could not turn into findings

- **The L2 regression test is probabilistic, and I watched it pass against the code it was
  written to catch.** Replicating its conditions, 11 of 12 blocks would have gone red against
  `4d8c327` — but one did not, and my first full run of the file against the pre-fix module
  scored that subtest `ok`. Roughly 8% of runs. That is a sensitive test, not a reliable one; a
  future cycle that leans on a single green run of it should know the number.
- **The decision mixes two clocks.** `now` is the application's `Date.now()`; `created_at` is the
  database's `now()`. My probes routinely printed "a notice was DELIVERED **-1** minute(s) ago",
  which is harmless here but is the visible edge of a real dependency on the two clocks agreeing.
  A database clock behind the application's by more than 30 minutes would empty the window and
  disable the alarm silently.
- **`decideAlert`'s default parameter references `CLAIM_LEASE_MINUTES`, declared 99 lines later.**
  Unchanged from the sixth review. Safe only because defaults evaluate at call time and nothing
  calls it during module load; it would throw a `ReferenceError` if anything ever did.
- **A duplicate is still possible if a send outlives the three-minute claim lease.** Documented
  and deliberate ("the worst case is one duplicate rather than permanent silence"), and I did not
  attempt to provoke it. Worth knowing it is the accepted, not the eliminated, case.
- **No live alert email has ever been delivered.** The builder says so plainly, which is right.
  `GMAIL_APP_PASSWORD` unset makes the alarm inert and the boot line says so honestly, but the
  last hop of this control remains untested by anyone.
- **The sixth review, now committed to the repository, discloses the first two and last two
  characters and the exact length of three live secrets.** I judged this immaterial to brute
  force (four known characters of a 32-character random string) and so not a finding, but it is
  the reason my shape searches were possible, and it is a habit worth not forming.
- **The in-memory unlock attempt budget still resets on any restart** (G6, disclosed and
  unchanged). I relied on that to run 12 HTTP rounds; a patient attacker can rely on it too.
- **A non-GET request with a bad CSRF token returns 500 rather than 403**, uniformly on workspace
  paths and on the control. Pre-existing, not a disclosure.
- **Who holds Railway.** F1's closure, H1's remedy and the whole of the third gate rest on
  Railway being reachable only by Tom. Seven passes, no reviewer has seen it.
- **Seven passes, seven instances — but the curve has turned.** F to K fell, L rose sharply to
  three HIGH, and M has none and nothing in production code. The two rules adopted after J1 and
  L1 ("exercise the real function", "assert the branch") were both applied this cycle and both
  worked: the new tests are genuinely red against the previous head, and the branch the deployed
  handle takes is now pinned. What neither rule covered is a line of cleanup code in a helper, in
  the same commit, making the same wrong assumption. The next rule, if one is wanted, is narrower
  than the last two: **when a finding is "this handle does not have that method", grep the
  repository for every other call on that handle before closing it.** That single command would
  have found M1, and it takes seconds.

## 9. What remains for Tom Arrington

1. **The gates hold, and after seven independent attempts that sentence has earned some weight.**
   Nobody has opened this area or leaked a record from it. Holding your CMS admin account and
   resetting your password still gets an attacker to a locked screen and no further. With the
   flag off, the workspace is byte-for-byte indistinguishable from a URL that was never built,
   headers included, so **merging remains inert**.
2. **The failed-unlock alarm can now be treated as a control that exists.** That is a change from
   the last review, and I did not take it on trust: ~380 threshold bursts across five harnesses,
   including twelve racing processes and the real HTTP endpoint, produced exactly one notice every
   time, while the same harnesses reproduce both of the previous defects against the previous
   head. The three remaining ways it can be quiet are narrow, and each has a small concrete
   remedy in M2 and M3. Note that it has still never actually delivered a message to a human
   mailbox, because `GMAIL_APP_PASSWORD` is unset here; the boot line says so plainly.
3. **L3 is closed and I verified it independently.** The live snapshot key is provably gone from
   this working environment — 205 candidate keys tested by cryptographic tag verification, none
   authenticate. **Rotation is still yours and still worth doing today**, in this order:
   `WORKSPACE_ACCESS_PASSPHRASE`, `WORKSPACE_SNAPSHOT_KEY`, then `SESSION_SECRET` (which
   invalidates every CRM erasure tombstone, by design) and the account passwords. A value a
   builder session held in cleartext is not a secret a control should rest on, whatever the state
   of the transcript now.
4. **The process change asked for by the sixth review worked, and is worth making permanent.**
   Its request was that a remediation quote the command and its output for any claim of
   verification. This one largely does, and where it does I could reproduce the result. The one
   claim it made without that discipline — "each is caught", of the drift guard — is the one that
   turned out to be verified against a sample its own pattern was written from (M4). Keep asking
   for the transcript, and ask specifically that the *counter-example* be shown failing, not just
   the example passing.
5. **Nothing in this report blocks a release decision on this chain's own severity bar.** There
   is no HIGH finding and no defect in code that runs in production. The three MEDIUMs are
   "correct before v0.1 is called finished": a crashing test helper whose crash the test cannot
   see, an alarm backoff spent on the wrong class of failure, and an unrecorded edge in the
   claim's retry. If you want them cleared first, they are hours of work, not days.
6. **What still cannot be verified from inside this project's tooling** after seven passes: the
   Drive authorities, the provenance and classification of the thirty snapshot records, your own
   instructions except as quoted by the builder, and everything about Railway. If you want those
   certified it needs a reviewer with Drive access and, on the evidence of seven passes, one not
   commissioned by the session whose work is being reviewed.

---

Nothing in this review was merged, deployed, connected, spent or enabled. My writes were confined
to a throwaway database `ws_rev7`, created from nothing and dropped at the end; within it I
changed the local `tom` password, the CMS `contact.email` row and the `workspace_activity` rows
my probes created, restored each, and then dropped the database entirely. Every experiment
needing a code change was done in a `git worktree` under `/tmp`, which has been removed.
`data/workspace-snapshot.enc` is unchanged and was never decrypted: my only interaction with it
was a GCM tag check whose output was a boolean. The reviewed branch is left at
`39812acc75d4d608be418f55ebd8d05c313b4280` with a clean tree.
