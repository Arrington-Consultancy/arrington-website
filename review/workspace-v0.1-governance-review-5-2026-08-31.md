# Arrington AI Workspace v0.1: Independent Governance & Assurance Review (fifth pass)

Date: 31 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, frozen head
`4ba5ba0142f12a2d8390960fc33fe4d931f56d9c`.
Baselines: the four previous reviews (F1-F10, G1-G9, H1-H7, J1-J4, all AMBER) and the builder's
four responses, the most recent being `review/workspace-v0.1-j-remediation-2026-08-31.md`.

`git rev-parse HEAD` returned `4ba5ba0142f12a2d8390960fc33fe4d931f56d9c` at the start of this
session and again at the end. `git status --porcelain` was empty at the start. **It was not empty
throughout: `lib/workspace/unlockAlert.js` was modified in the working tree during this review, by
a party other than me. That is finding K5 and it is described in full below.** I preserved the
modification, restored the frozen file, and reviewed `4ba5ba0` and nothing else. I made no change
to the branch source, and this review is committed on a separate branch.

## 1. The bounded question

Have the four findings of the fourth review been closed, and — the specific question this pass was
commissioned to answer — **does a fifth instance exist of the pattern that produced the previous
four AMBER verdicts: a security property asserted in a comment or a document that does not hold in
the code? And was the working rule adopted in response to J1 actually applied, or merely written
down?** Nothing more. This review does not authorise a merge, a deploy, an environment variable
change, a spend, or the connection of any external account, and it did none of those things.

## 2. VERDICT: AMBER

**AMBER.** A fifth instance exists, in the same module, the same numbered rule, and the same
sentence as the fourth. `lib/workspace/unlockAlert.js` now states that the alert is bounded
"ATOMICALLY" and that its claim insert is one "that only one caller can win"; that is false at
Postgres's READ COMMITTED isolation, which is what this application runs, and I broke the bound in
18 of 20 rounds against the real function and twice in one burst through the real HTTP endpoint as
the seized owner account. **The working rule was written down and not applied**: the test named
for the property passes only because it runs first, on a cold connection pool. Eight ordinary
`SELECT 1`s beforehand — less warm-up than any live server has within its first second of traffic —
turn it from 6/6 green to 3/6 red.

**What did not happen is as important as what did. Every preventive gate held against everything I
could throw at it.** Nothing in this pass grants access, leaks a restricted record, executes a
consequential action or self-grants authority. F1, G1, H1 and H4 are closed under fresh
independent sweeps of my own construction, not by reading the builder's account of them. J2 and J3
are genuinely and completely closed, including the schema-ordering trap on both a fresh and a
pre-column database. The defect that remains is in a **detection** control, not a preventive one,
and its practical magnitude is small: about two extra emails per fifteen-minute limiter window.

Five findings: three MEDIUM, two LOW, no HIGH. The second consecutive pass with no HIGH finding.
The distance between this AMBER and a PASS is one lock, one test that warms a pool, one deleted
file, and the removal of three sentences that are not true.

## 3. Independence, and its limits

I am a separate session from the technical builder. I did not write any of the workspace code, and
I accepted no claim I could test myself. The four limits recorded by every previous pass stand,
and the first is still the one that most deserves Tom's attention:

1. **I am a Claude agent, commissioned by the builder's own session, reviewing the builder's work.**
   That is a structural weakness in this arrangement and it is not cured by my having found things.
   It is unresolved after five passes.
2. **No network access to Railway or to the live site.** Everything about production and staging
   variables, deployments and the paid live-AI runs is reported, not verified. Listed in section 5.
3. **No Google Drive access.** The controlled authorities, the approved source map and Tom's own
   instructions reach me only as transcribed by the party they constrain.
4. **No real browser.** I drove the application over HTTP and inspected status, headers, bodies,
   cookies and timing. I did not render a page.

A fifth limit is specific to this pass and is finding K5: **the candidate did not stay frozen while
I reviewed it.**

## 4. What I verified, with observed results

Environment: local Postgres 16; a purpose-built throwaway database `ws_rev5` created from nothing
for this review and dropped at the end; the working tree at `4ba5ba0`; a server on port 3014 with
`ENABLE_ARRINGTON_AI_WORKSPACE=true`, `WORKSPACE_OWNER_USERNAME=tom`, `WORKSPACE_OWNER_USER_ID=2`
and a 32-character `WORKSPACE_ACCESS_PASSPHRASE`; and a second server on port 3015 with **no
workspace variables at all**, which is production's configuration if this branch merges.

### 4.1 The regression suite

```
DATABASE_URL=... SESSION_SECRET=... npm test
# tests 522   # pass 520   # fail 0   # skipped 2   # duration_ms 156430
EXIT=0
```

**The warning carried by all four previous reviews stands unchanged: a bare `npm test` does not
exercise the workspace HTTP surface**, and — new this pass — it does not establish the J1 property
either, for the reason set out in K2.

### 4.2 The builder's adversarial suite, armed

```
WORKSPACE_TEST_BASE_URL=http://localhost:3014 ... node --test test/workspace/adversarialApi.test.js
# tests 9   # pass 8   # fail 0   # skipped 1
```

Eight checks genuinely executed, including the whole post-unlock half. The ninth declares itself
`# SKIP NOT EXECUTABLE: no contact exists in this environment` rather than passing, which is the
right behaviour.

Two traps recorded by the previous reviewer both recurred and both cost me a run: the site login
limiter (5 per 15 minutes per IP) trips if the suite is run twice against one server, and a stale
server process from an earlier probe kept serving on the port after what I thought was a restart.
Both produce failures that have nothing to do with the workspace. **Restart the server, and check
that it actually restarted, between runs.**

### 4.3 J1 is NOT closed. The claim insert is not atomic, and I broke the bound three ways

`lib/workspace/unlockAlert.js:238-241` states:

> Wins the right to send, or returns null. The INSERT ... SELECT ... WHERE NOT EXISTS is evaluated
> by the database, so two concurrent callers cannot both succeed: one inserts, the other's NOT
> EXISTS is false by the time it runs.

At READ COMMITTED — Postgres's default and what this application runs — a statement's subquery
reads a snapshot taken when the statement began. An `INSERT` from another transaction that has not
yet committed is invisible to it. Both callers evaluate `NOT EXISTS` as true and both insert.
Nothing rejects the second: `workspace_activity` has no unique constraint that could, and the
condition is a moving time window, which no constraint can express anyway.

**First, at the SQL level**, running the module's own claim statement in two genuinely concurrent
transactions:

```
session A won the claim: true
session B won the claim: true
claim rows now in the table: 2   (the stated bound is 1)
transaction isolation: read committed
```

**Second, through the real function against the real database**, 20 rounds of 10 concurrent calls
with a 120 ms transport — faster than any SMTP handshake, so this understates the overlap:

```
rounds=20 concurrency=10 transportDelay=120ms
rounds that delivered MORE THAN ONE message: 18/20
worst single round: 5 messages (stated bound: 1)
extra messages beyond the bound, total: 34
```

A 40-round run reached a worst case of **9 messages in one round**.

**Third, end to end through the real HTTP endpoint**, as the seized `tom` account, with three
earlier failures already recorded and the unlock limiter's whole five-attempt budget dispatched in
one tick by a scripted client:

```
unlock responses: 401,401,401,401,401
workspace_unlock_alert_failed | 2      <- two dispatches from one burst; the stated bound is one
```

Five attempts fired as five separately-spawned `curl` processes produced only one dispatch: the
process-spawn stagger usually saves it. A scripted attacker does not have that stagger, and neither
does a real guessing loop.

Everything else the module claims is true, and I checked each one behaviourally against the live
path rather than against the pure helper:

```
0 / 1 / 2 failures                        -> sent=0     (threshold)
3 failures                                -> sent=1
500 failures, delivered 5 min ago         -> sent=0     (cooldown)
3 failures, delivered 61 min ago          -> sent=1     (fresh burst not swallowed)
3 failures, FAILED 6 min ago              -> sent=1     (H2: a failure does not buy the hour)
3 failures, FAILED 1 min ago              -> sent=0     (short backoff)
stale claim older than the 3-minute lease -> sent=1     (a dead process cannot silence it forever)
fresh claim inside the lease              -> sent=0
```

**So the only property that fails is atomicity — the one the module added the word "atomically"
for, and the one the fix was written to establish.** I could not make a stale claim block the
alarm permanently, and I tried: a claim is resolved to sent-or-failed immediately after the send,
and an unresolved one expires in three minutes.

### 4.4 J2 is closed, including the schema-ordering trap, on both kinds of database

No `LIKE`-on-summary path survives anywhere in `lib/workspace/**` or `routes/workspace.js`. The
cooldown is matched on `subject` with `=`. The migration:

```
fresh database created from nothing:  node db/seed.js  -> EXIT=0, "Workspace activity subject column verified."
same database, seeded a second time:  node db/seed.js  -> EXIT=0, idempotent
```

And the case that actually matters, which is the one that crashed production during the Scott v0.2
release — a database that already carries history and predates the column. I dropped the column and
the index to reproduce a genuine pre-J2 production schema, then seeded:

```
before: id, actor, event_type, summary, created_at        (no subject, no subject index)
seed    -> EXIT=0
after:  ... subject character varying(200) not null ''
        "idx_workspace_activity_subject" btree (event_type, subject, created_at DESC)
```

The index is created in `db/seed.js` after the `ALTER`, not in `schema.sql` beside the table, with
a comment in both files saying why. **Correct, and correctly explained.**

### 4.5 J3 is closed, in all three shapes including the honest worst case

```
A. the SELECT throws, recording still works -> {"sent":false,"error":"database is down"}
   durable rows written: 1  workspace_unlock_alert_failed
B. the database is entirely down            -> {"sent":false,"error":"database is down"}
   console only, which is exactly what the module says happens
C. a throw AFTER the claim is won           -> {"sent":false,"error":"send exploded"}
   the claim row resolved to workspace_unlock_alert_failed, not left pending
```

Case C matters and is not obvious: a pre-send failure after the claim must resolve the claim row,
or the alarm would be silenced for the lease. It does.

### 4.6 G1 stayed closed. I could not find a workspace-specific signal anywhere

I wrote my own probe rather than trusting the builder's. It compares **status, every response
header except a named volatile set, the nonce-normalised body, and the Set-Cookie names and
attributes** against a control path that genuinely does not exist, across three `Accept` values,
for eighteen page and API paths including `/workspace/`, `/WORKSPACE`, `/workspace/unlock` and
`/workspace/nonsense`.

```
== ANONYMOUS, flag OFF (port 3015, production's config on merge) ==
54/54 identical to control
== ANONYMOUS, flag ON (port 3014) ==
54/54 identical to control
== NAT (site admin, authenticated, NOT the owner), flag ON ==
nat authenticated (GET /api/admin/users): 200
54/54 identical to control
```

Other channels, all three identities:

```
methods   HEAD/OPTIONS/PUT/DELETE/PATCH: workspace and control identical (404/404/500/500/500),
          headersIdentical=true on every one
robots    X-Robots-Tag on /workspace: (none)   on /workspace/unlock: (none)   on the control: (none)
cookies   only _csrf, issued identically on workspace denials and on the control
timing    flag off: /workspace 4.2ms  /workspace/nonsense 3.7ms  control 4.0ms  (median of 21)
          flag on:  /workspace 4.1ms  /workspace/nonsense 3.8ms  control 3.9ms
          as nat:   /workspace 4.4ms  /workspace/nonsense 4.6ms  control 4.9ms
```

One methodological note for whoever runs this next: my first pass reported **0/54** because I
compared whole `Set-Cookie` values, and the `_csrf` token is random per response. That is a probe
artefact, not a signal — the cookie is issued identically on the workspace path and the control.
A reviewer who did not chase it down would have reported a leak that is not there.

`setNoindex` is a plain function called only after the access decision and is deliberately not
exported as middleware. **On this evidence merging remains inert.**

### 4.7 F1 stayed closed. The takeover, replayed

As `nat` (role admin), against the running server:

```
/workspace, /workspace/unlock, /workspace/contacts        -> 404 (identical to control)
PUT /api/admin/user/2/password {"password":"SeizedByNat!99"} -> 200 {"success":true}
```

The legitimate recovery route is intact, as Tom required. Then as the seized `tom`:

```
login as seized tom                                -> 302 /
/workspace, /contacts, /brain, /activity           -> 302 /workspace/unlock, 39 bytes, no content
POST /api/workspace/ask                            -> 404, mentions 'unlock': 0
POST /api/workspace/contacts/1/erase               -> 404, mentions 'unlock': 0
wrong passphrase x5                                -> 401 (24, 16, 13, 13, 13 ms)
attempt 6                                          -> 429 "Too many attempts. Wait fifteen minutes."
```

**The third gate holds.** Holding the CMS admin account and resetting the owner's password gets an
attacker to the unlock screen and no further. I restored `tom`'s password afterwards and confirmed
the restore.

### 4.8 H1 stayed closed, at the class level

Replaying the third reviewer's demonstration against the real database and the running app:

```
PUT /api/content {"fields":[{"key":"contact.email","content":"attacker@evil.example"}]} -> 200
contact.email in DB : attacker@evil.example
alertRecipient()    : tom@arringtonconsultancy.com      <- NOT retargeted
alertRecipient parameter count: 0                       <- takes no database handle
with WORKSPACE_ALERT_EMAIL = '  security@example.test  ' -> "security@example.test"  (trimmed)
```

And the class rather than the instance:

```
grep "FROM content\|section_key" lib/workspace/ routes/workspace.js lib/crm/   -> no output
every process.env read in lib/workspace/**:
  ANTHROPIC_API_KEY, ENABLE_ARRINGTON_AI_WORKSPACE, ENABLE_WORKSPACE_AI, GMAIL_APP_PASSWORD,
  WORKSPACE_ACCESS_PASSPHRASE, WORKSPACE_ALERT_EMAIL, WORKSPACE_OWNER_USERNAME, WORKSPACE_OWNER_USER_ID
```

Every one is an infrastructure variable. No CMS-writable value reaches a workspace security
decision. I restored `contact.email` and verified the restore.

### 4.9 H4 stayed closed

`ACTIVITY_SENSITIVITY = 'confidential'` is declared once at `routes/workspace.js:45` and read at
exactly two call sites (`:160`, `:307`). `repo.listActivity` has exactly those two callers. The
only other view mentioning activity is `views/workspace/partials/shell-top.ejs`, and it is a nav
link, not a render of rows. **Both surfaces are at one level, and there is no third.**

### 4.10 J4: the snapshot is untouched and the probe cleans up; the hygiene half is not closed

```
data/workspace-snapshot.enc  md5 c3c74734d74657e60f7be6fcc880c8a4
git log -1 -- data/workspace-snapshot.enc  -> 6e6aaf4 (the original commit; not touched since)
git diff HEAD -- data/  -> empty        data/ contains only workspace-snapshot.enc
```

The clearance probe seeds `probe.clearance_canary` and deletes it in a `finally`, with a direct
query rather than a new delete on the production repo — the right trade, and the reasoning is
written down. No synthetic record can be left behind by a failing assertion. The one residual case
is a process killed between the upsert and the `try`, which is a window of microseconds and not
worth a finding.

The hygiene half of J4 is **not** closed. See K4.

### 4.11 Scope

`git diff --stat 80eff45..4ba5ba0` touches ten files. The source files are exactly five:
`db/schema.sql`, `db/seed.js`, `lib/workspace/repo.js`, `lib/workspace/unlockAlert.js` and
`routes/workspace.js`. **There is no undisclosed source change since the fourth review, and nothing
touching a live surface.**

## 5. What I accepted as reported, and from whom

- **Everything about Railway.** That production carries no workspace variables, that the staging
  service exists, that any named deployment happened. From the builder. I still cannot see whether
  `GMAIL_APP_PASSWORD` or `WORKSPACE_ALERT_EMAIL` is set on whichever service would run the
  workspace, which is what H1, H3 and the whole practical weight of K1 turn on.
- **The paid live-AI run `ws-20260831-c`.** From the builder. Not replayable here, and I spent
  nothing.
- **Tom's decisions** (F1 option 3, the F3 approval, the G3 approval, the G6 alert instruction, the
  bounded paid-run authorisations) as quoted in the remediation documents. An assurance lane reading
  an instruction transcribed by the party it constrains is a weak link. This is the fifth review to
  record it.
- **The controlled Drive authorities**, the nine-lane register, and the provenance and
  classification of the thirty records in the encrypted snapshot. I deliberately did not decrypt the
  snapshot; see K4.

## 6. Findings

Severity on the scale the previous reviews used. MEDIUM: correct before v0.1 is treated as
finished. LOW: record and schedule.

### K1. The alert's boundedness still does not hold. The claim insert is not atomic, and the code, the remediation and the project memory all now say it is. Severity: MEDIUM

This is the fifth instance of the pattern, in the same module and the same numbered rule as J1,
H2 and H1. `unlockAlert.js:29-33` now says the alert is bounded "ATOMICALLY ... no matter how many
arrive at once", and `:238-241` says "two concurrent callers cannot both succeed". Neither is true,
for the reason set out in 4.3: at READ COMMITTED an uncommitted insert is invisible to a concurrent
statement's subquery, and there is no unique constraint to reject the loser.

The evidence is in 4.3: two winners from two concurrent transactions at the SQL level, 18 of 20
rounds breaking the bound through the real function (worst round nine messages), and two dispatches
from one five-attempt burst through the real HTTP endpoint as the seized owner.

**The claim has now propagated into three places**, which is what raises this above a code defect:
the module comment, `review/workspace-v0.1-j-remediation-2026-08-31.md` ("a conditional insert ...
that only one caller can win"), and `CLAUDE.md`, which is the project memory that governs every
future session and which additionally asserts "Tested concurrently against a real database". A
future session reading `CLAUDE.md` will believe this is settled.

I am deliberately not inflating the operational impact, which is small and unchanged from J1: it is
not an access defect, not a disclosure, and the unlock limiter caps a single account at five
attempts per fifteen minutes, so the realistic yield is a couple of extra emails rather than a
flood. Two things make it a MEDIUM. First, the sustained channel is Gmail SMTP, which has its own
abuse limits, and the failure mode of tripping them is the alarm going silent — H2 arriving through
a different door. Second, and decisively for this candidate: **this is a fix that was designed,
implemented, tested, reviewed, documented in a remediation and written into project memory, and it
does not work.** That is a different and more serious thing than the original defect.

**Remedy.** The correct fix is a lock, not a conditional insert. `pg_advisory_xact_lock` on a hash
of the subject, taken on the same connection as the insert and inside a real transaction, blocks
rather than failing, is keyed per account so one burst never delays another's, and is released by
`COMMIT` or `ROLLBACK` including a rollback caused by the connection dying. A partial unique index
would also work but cannot express a moving time window. Whichever is chosen, the sentence claiming
atomicity must not be re-committed until the test in K2 is green under a warm pool.

**Worth knowing, and it is why I am confident about the remedy:** during this review a version of
`unlockAlert.js` implementing exactly that advisory lock appeared in the working tree (see K5). I
tested the preserved copy against the same harness that breaks the candidate, without putting it in
the repository:

```
in-flight version, 20 rounds x 10 concurrent: rounds breaking the bound = 0/20, worst round = 1
frozen candidate,  20 rounds x 10 concurrent: rounds breaking the bound = 18/20, worst round = 5
```

**It is not part of the candidate, I did not review it, and its own new comment concedes that the
claim now in the frozen code was false.**

### K2. The working rule was written down and not applied. The test that pins J1 passes only because it runs first, on a cold connection pool. Severity: MEDIUM

This is the finding that answers the question this pass was commissioned to ask, and I regard it as
more important than K1.

The rule adopted from the fourth review is: *every asserted security property must name the test
that establishes it, and that test must exercise the real function under the conditions the
property claims to hold — not a pure helper beneath it, and not the easy path.*
`test/workspace/unlockAlert.test.js:213` is the test written to satisfy it, and it does the first
two things: it calls the real `maybeAlertOnFailedUnlock`, concurrently, against a real database.
It fails the third. It runs on the easy path, and the easy path is invisible.

Run in a fresh process, once, as the test file does:

```
COLD pool: messages delivered = 1  -> assertion "=== 1" PASSES     (x6, six for six)
```

Add one line of setup before it — `await Promise.all(Array.from({length:8}, () => db.query('SELECT 1')))`,
which is less warm-up than any live server has within its first second of traffic — and nothing
else changes:

```
WARM pool: messages delivered = 3  -> FAILS
WARM pool: messages delivered = 6  -> FAILS
WARM pool: messages delivered = 1  -> PASSES
WARM pool: messages delivered = 1  -> PASSES
WARM pool: messages delivered = 1  -> PASSES
WARM pool: messages delivered = 3  -> FAILS
```

The mechanism: with a cold pool, `node-postgres` must open seven new connections for the eight
concurrent callers, and the variable cost of establishing them staggers the claim statements enough
that they usually serialise. A running server has those connections already. Loop the same shape
inside one process, so the pool stays warm from the second round on, and it fails 19 times in 25:

```
the builder's exact J1 subtest, run 25 times: 6 green, 19 red
messages delivered per run: 1,3,1,3,2,6,2,1,2,2,3,1,1,3,2,2,4,2,2,3,3,2,2,1,4
```

**The condition the property claims to hold under is a running server. The test's condition is a
process that has just started.** It is the same shape as G1's test asserting the leak it was meant
to catch and H7's `.length === 1`: a test whose title names the property and whose body meets it in
the one arrangement where it cannot fail.

**Remedy.** Warm the pool explicitly before the concurrent assertion and say in a comment why —
that a cold pool is not the condition the claim is about. Better still, race separate processes
against a shared start instant, which removes the single-event-loop artefact entirely. Repeat the
round several times within the test rather than once, so a lucky interleaving cannot carry it.
Until that test is red against the current code, it is not evidence of anything.

### K3. `decideAlert` is dead in the deployed path, and it carries the module's most-cited tests. Severity: LOW

`maybeAlertOnFailedUnlock` no longer calls `decideAlert`; nor does `claimAlertSlot`. Verified:

```
callers of decideAlert outside its own definition: test/workspace/unlockAlert.test.js only (4 tests)
maybeAlertOnFailedUnlock references decideAlert: false
claimAlertSlot references decideAlert: false
```

The live rule moved into the SQL of `claimAlertSlot` when J1 was answered, and `decideAlert` was
left behind with its comment still in the present tense — *"Decides whether this burst has earned
an alert"* — and with four unit tests, including two named for the module's own Rules 2 and 3.
Those four tests now assert the behaviour of a function that production never calls, which is
precisely the "pure helper beneath it" the working rule bans.

**There is no live defect here and I checked rather than assumed**: I re-ran all four rules against
the live path (4.3) and the SQL honours every one of them, including H2's distinction between a
delivered and a failed notice. Both copies read the same constants, so the thresholds cannot drift.
What can drift is the logic, and only the dead copy is exhaustively tested. It is recorded for the
same reason F6, G8, H4 and J2 were: a rule expressed in two places where only one is exercised
breaks later without anything looking broken.

**Remedy.** Either delete `decideAlert` and its four tests, moving their cases onto the live path
(they run there in a few milliseconds — I did it in one script), or keep it and say plainly in its
comment that it is a specification the SQL is expected to match, with a test that asserts the two
agree.

### K4. The snapshot key was reported deleted and is still in the working directory, next to `SESSION_SECRET` and the account passwords. Severity: MEDIUM

The J remediation states, in bold: *"**The hygiene issue is closed.** The plaintext snapshot extract
and the key were sitting together in the agent scratchpad. Both have been securely deleted."*

The plaintext snapshot extract is gone; I looked and it is not there. **The key is not.** It is in
this project's agent scratchpad in a Railway variables dump:

```
file:    <scratchpad>/staging-vars.json
key:     WORKSPACE_SNAPSHOT_KEY present: True, type str, len 64, matches ^[0-9a-f]{64}$: True
         (which is exactly what lib/workspace/snapshotCrypto.js keyFromEnv accepts)
alongside: NAT_PASSWORD, TOM_PASSWORD, SCOTT_DEMO_STAFF_PASSWORD, SESSION_SECRET
```

**I deliberately did not decrypt the snapshot**, so I am not repeating the fourth reviewer's
demonstration; I did not need to, because the fourth review already established that the key in
this directory decrypts the committed file, and the file's name, format and provenance are
sufficient to identify it.

Two points, and they should not be conflated.

The first is about the assurance record, and it is the same family as K1: a remediation stated a
correction as complete and it was not. The reviewer who reads only the remediation would record
J4 as closed. This is the second consecutive pass in which a claim in a governance document about
the snapshot key did not survive being checked — the fourth review found the "blocked" reason to
be false, and this one finds the "deleted" claim to be false.

The second is about handling, and it is worse than the fourth review's version of it because of the
company the key is keeping. `SESSION_SECRET` in that same file keys the CRM erasure register's HMAC
(finding F4) and signs the gated-PDF download tokens; `TOM_PASSWORD` and `NAT_PASSWORD` are CMS
account passwords. **The repository is clean and I confirmed it** — `git status` empty, `data/`
holding only the ciphertext, `.gitignore` refusing the plaintext, nothing in the tree holding a key.
The working environment is not. I cannot establish how that directory is retained or who else can
read it, so this stays a hygiene finding rather than an exposure.

**Remedy.** Delete `staging-vars.json` and anything else in that directory holding a live secret,
and verify it rather than reporting it. Rotate `WORKSPACE_SNAPSHOT_KEY`, and consider rotating the
rest, if that directory has ever been shared or backed up. Then correct the sentence in the J
remediation. The unfinished half of H6 — more than two genuinely confidential records in the
controlled snapshot, which no synthetic record can substitute for — remains open and is Tom's, as
the builder correctly says.

### K5. The candidate did not stay frozen. `lib/workspace/unlockAlert.js` was modified in the working tree during this review. Severity: LOW (procedural, but it bears on the whole chain)

I was commissioned to review a frozen head and instructed to say so if the tree was dirty. It was
clean at the start. Partway through — between my reading of the module and my starting the
application — `lib/workspace/unlockAlert.js` was modified on disk by a party other than me. I made
no edit to any tracked file at any point.

The change was substantial: 45 added lines replacing `claimAlertSlot` with a
`pg_advisory_xact_lock` implementation, and a rewritten comment that **independently concedes the
claim under review is false** — *"That assertion was false, and it is worth stating plainly why,
because it is the second time this same claim has been made about this same function."* It also
records, independently of me, that the in-process test is green while the property does not hold.

I did three things. I preserved the modified file and its diff outside the repository so nothing is
lost. I restored the frozen file (`git checkout --`) and re-confirmed `git status --porcelain`
empty, `HEAD` at `4ba5ba0` and the file's checksum before continuing. And I restarted the
application so that everything reported in section 4 ran against the frozen code — I re-ran the
concurrency hammer afterwards, on a verified-frozen file, and it still broke the bound in 18 of 20
rounds, so no result above is contaminated.

**Why this is a finding and not a footnote.** An assurance lane cannot certify a moving target, and
a verdict is only meaningful against an artefact that is what it was when the verdict was reached.
More practically: the builder's session was still working on the candidate it had asked to have
reviewed, on the specific defect under review, without the reviewer being told. Had I not checked
`git status` again, I would have run half my probes against one artefact and half against another
and reported a single verdict over both.

**Remedy.** For any future pass, freeze means freeze: no work on the branch's working tree while a
review is open, or the review is commissioned against a checkout the reviewer controls. The
preserved copy of the in-flight change is outside the repository and Tom should have the builder
land it as its own commit, with the K2 test, rather than lose it.

## 7. Concerns I could not turn into findings

- **A bare `npm test` still does not cover the workspace HTTP surface.** Five suites carry a
  `# SKIP` directive while the summary counts two, and the workspace adversarial suite is among the
  five. Fifth review to say so.
- **`test/workspace/access.test.js:239` asserts *exactly two* call sites use `ACTIVITY_SENSITIVITY`.**
  It correctly catches a surface reverting to a literal, but it fails if a legitimate third surface
  is added, which will read as a broken test rather than the deliberate decision it should prompt.
  Fails in the safe direction.
- **The workspace makes outbound SMTP calls.** The 30 August review recorded that `lib/workspace/**`
  had no network path of any kind. That property was deliberately traded away for the alert and is
  not coming back; the control pack should stop citing it. Second review to say so.
- **Who holds Railway.** F1's closure, H1's remedy and the whole of the third gate rest on Railway
  being reachable only by Tom. No reviewer has seen Railway in five passes. That is a fact about
  credential hygiene, not code, and no further code review will resolve it.
- **A non-GET request with a bad CSRF token returns 500 rather than 403**, uniformly on workspace
  paths and on the control. Pre-existing, not a disclosure, and it makes probes harder to write
  rather than easier.
- **The in-memory unlock attempt budget** still resets on any restart (G6, unchanged and disclosed),
  and `workspace_unlock_failed` rows are still only visible on a screen that needs the unlock to
  open. The email alert exists to cover exactly that, which is why K1 matters more than its message
  count suggests.

## 8. What remains for Tom Arrington

1. **The candidate is materially sound and the important gates hold.** I attacked F1, G1, H1 and H4
   with probes of my own construction rather than reading the builder's account, and every one held.
   Holding your CMS admin account and resetting your password gets an attacker to a locked screen
   and no further. Nothing in five passes has ever let anybody in or leaked a restricted record.
2. **K1 and K2 are one decision and it is a small one.** The alarm sends two or three emails per
   burst instead of one. Nobody gets in and nothing is disclosed. What is not small is that this
   fix was designed, tested, reviewed, written into a remediation and written into `CLAUDE.md` as
   settled, and does not work — and that the test written to prove it passes only because it runs
   first. If you would rather ship than fix, the minimum is to delete the three sentences claiming
   atomicity, in the module, the remediation and `CLAUDE.md`, so that no future session builds on a
   claim that is not true. The actual fix is known, small, and demonstrably works; it appeared in
   the working tree during this review and I measured it at 0 failures in 20 rounds.
3. **This is the fifth consecutive pass in which a stated security property did not hold, and the
   first in which the rule adopted to prevent that was itself the thing that failed.** The severity
   has fallen every time — a public enumeration channel, a retargetable alarm, a mail bound, now a
   mail bound that was declared fixed. The rate has not. My predecessor's rule is right and I would
   keep it, with one addition learned from K2: **name the condition the property is claimed to hold
   under, and make the test establish that condition explicitly rather than inheriting it.** A test
   that is silently the easy path is worse than no test, because it is counted as evidence.
4. **Delete the secrets in the working directory (K4) and verify it.** `WORKSPACE_SNAPSHOT_KEY`,
   `SESSION_SECRET`, `TOM_PASSWORD`, `NAT_PASSWORD` and `SCOTT_DEMO_STAFF_PASSWORD` are sitting in
   one JSON file in this project's scratchpad, after a remediation reported the key deleted. This is
   worth acting on independent of the release.
5. **Set `WORKSPACE_ALERT_EMAIL` and `GMAIL_APP_PASSWORD`** on whichever service runs the workspace
   before relying on the alarm at all. The boot line reports honestly whether it can ring, and I saw
   it correctly report itself inert. No reviewer has been able to see your Railway variables in five
   passes.
6. **Freeze means freeze (K5).** The branch was edited under me, on the defect under review. Ask for
   the in-flight advisory-lock change to be landed as its own commit with a warm-pool test, rather
   than lost.
7. **Run the adversarial suite by hand before the release decision**, on a freshly restarted server,
   once. It passes 8/8 with one honest NOT EXECUTABLE. A green `npm test` does not include it.
8. **What still cannot be verified from inside this project's tooling** after five passes: the Drive
   authorities, the provenance and classification of the thirty records, your own instructions
   except as quoted by the builder, and everything about Railway. If you want those certified it
   needs a reviewer with Drive access and the snapshot key — and, on the evidence of K5 and the
   independence limit recorded by all five passes, ideally one not commissioned by the session whose
   work is being reviewed.

Nothing in this review was merged, deployed, connected, spent or enabled. My writes were confined to
a throwaway database `ws_rev5`, created from nothing for this review and dropped at the end, plus
two changes on that database which I reverted and verified reverted: the CMS `contact.email` row,
and the local `tom` password, restored to its documented test value. `data/workspace-snapshot.enc`
is byte-identical to its committed state. The branch is left at `4ba5ba0` with a clean tree.
