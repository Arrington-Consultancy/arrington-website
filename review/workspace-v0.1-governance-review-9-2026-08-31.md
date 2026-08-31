# Arrington AI Workspace v0.1: Independent Governance & Assurance Review (ninth pass)

Date: 31 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, frozen head
`1710179726509ea89c38e0b50a4bbd04643e9494`.
Baselines: the eight previous reviews (F1-F10, G1-G9, H1-H7, J1-J4, K1-K5, L1-L5, M1-M5,
N1-N5, **all AMBER**) and the builder's eight responses, the most recent being
`review/workspace-v0.1-n-remediation-2026-08-31.md`.

```
$ git rev-parse HEAD
1710179726509ea89c38e0b50a4bbd04643e9494
$ git status --porcelain
(empty)
$ sha256sum data/workspace-snapshot.enc
e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2
```

**The tree stayed frozen and clean throughout**, and the snapshot hash is byte-identical to the
value the eighth review recorded. K5's remedy has now held four passes running. Every experiment
needing a code change ran in a `git worktree` under `/tmp`; every write went to throwaway
databases created from nothing and dropped at the end. This report is committed on a separate
branch.

## 1. The bounded question

Eight consecutive reviews found the same class of defect: a security property asserted and not
held. The last four instances were each introduced by the fix for the one before (J1 → K1 →
L1/L2 → M2 → N1). My predecessor established that the concurrency guarantee itself now holds, so
the remaining risk is concentrated in the newest code.

So: is there a **ninth** instance, and is it in the N-cycle changes? Do the earlier closures
(F1, G1, H1, H2, H4, J2, J3, K3, L1, L2, L3, M1, M2) still hold under probes of my own
construction? Does the seed migration work on every database shape it will meet?

Nothing more. This review does not authorise a merge, a deploy, an environment variable change,
a spend, or the connection of any external account, and it did none of those things.

## 2. VERDICT: AMBER

**AMBER, and the ninth instance is real: N3 was reported as corrected and is not corrected.**

I want to be exact about why this is not a manufactured ninth finding, because eight AMBERs
before me is a reason to be more careful, not less. The N remediation states: *"Contention is now
recorded as abandonment, which gates nothing."* `CLAUDE.md` records the whole cycle as *"All five
corrected."* Neither is true. The code that would do it is **unreachable**, the behaviour the
eighth review measured is **unchanged**, and the test written to establish the property passes
green against a deliberately sabotaged version of the same function. I did not infer any of that;
I ran it.

What moved, and it is substantial:

- **N1 is genuinely fixed, and I attacked it rather than reading it.** A notice that reaches the
  mailbox and whose outcome-recording then fails is now recorded as **delivered**, starts the
  hour, and produces no duplicate. I also probed the four shapes the brief asked about: a
  transport that throws, one returning a non-object, one returning `{sent:'yes'}`, one returning
  a genuine failure. None produces a register entry that contradicts what happened.
- **The concurrency guarantee holds under my own instruments, and my instruments are provably
  sensitive.** 220 threshold bursts at the frozen head across four profiles, plus 12 racing OS
  processes over 10 rounds: **zero duplicated, zero wrongly silent, zero worker errors.** The
  same harness breaks the previous head 23 times in 180 bursts.
- **All three gates held under direct attack.** I seized `tom`'s CMS account as `nat` through the
  real API, confirmed the seized session genuinely authenticates, and got no further than a
  locked screen. **153 of 153** workspace path/identity/Accept combinations were byte-identical
  to a genuinely missing page — headers, cookie names and body — flag on and off, anonymous and
  as an authenticated non-owner admin.
- **The passphrase gate works in both directions**, which is what makes "the attacker got
  nothing" mean anything, and **rotating the passphrase invalidates an open unlock immediately**
  — a claimed property no previous pass had tested, verified here across a real restart with the
  session still authenticated.
- **The seed migration is correct on all four database shapes, twice each.**
- **No live secret survives in this working environment**: 82 distinct 64-hex candidates across
  2,005 files plus the process environment, tested by AES-GCM tag verification. **Zero
  authenticate.**

Five findings: **two MEDIUM, three LOW, no HIGH.** Nothing found opens the workspace, leaks a
record, defeats a gate, or stops the alarm firing on a real burst under the deployed rate limiter.
**On this chain's published severity bar, nothing in this report blocks the release decision.**

## 3. Independence, and its limits

I am a separate session from the technical builder. I wrote none of the workspace code and
accepted no claim I could test myself. The four limits recorded by every previous pass stand
unchanged, and after nine passes they are not going to resolve themselves:

1. **I am a Claude agent, commissioned by the builder's own session, reviewing the builder's
   work.** Structural, and uncured by my having found things.
2. **No network access to Railway or the live site.** Everything about production and staging
   variables, deployments and the paid live-AI runs is reported to me, not verified by me.
3. **No Google Drive access.** The controlled authorities and Tom's instructions reach me only as
   transcribed by the party they constrain.
4. **No real browser.** I drove the application over HTTP and inspected status, headers, bodies,
   cookies and timing. I did not render a page.

The paid live-AI suites were **not run**: they spend money and I was instructed not to. They are
not evidence in this pass.

## 4. What I did, with observed results

Environment: local Postgres 16; throwaway databases `ws_rev9`, `ws_rev9_mut`, `ws_rev9_prev` and
`ws_s1`-`ws_s4`, all created from nothing and dropped at the end; servers on 3091 (workspace
armed) and 3092 (no workspace variables at all, which is production's configuration if this
branch merges); `git worktree`s at `/tmp/rev9/wt` (frozen head), `/tmp/rev9/mut` (a mutation
copy) and `/tmp/rev9/prev` (`39812ac`, as a sensitivity control).

### 4.1 The regression suite

```
$ env -u NAT_PASSWORD -u TOM_PASSWORD DATABASE_URL=... SESSION_SECRET=... npm test
# tests 538   # suites 53   # pass 536   # fail 0   # skipped 2
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

Nine of nine, all executed, nothing NOT EXECUTABLE.

**Both documented traps cost me runs again, and I add a third and a fourth**, because between
them they wasted more of this pass than any code did:

- The site login limiter is 5 per 15 minutes per IP; restart the server between runs.
- A workspace API POST needs the token in the **`x-csrf-token`** header, or CSRF answers first.
- **`pkill -f "start-server.sh"` does not kill the server.** The wrapper scripts `exec` node, so
  the wrapper's name is gone from the process table and the pkill matches nothing. My first
  passphrase-rotation "control" was run against a server that had never restarted. Kill by PID,
  and check `ps -eo pid,lstart` to confirm the process you are talking to is the one you started.
- **The unlock endpoint is `POST /api/workspace/unlock`, not `POST /workspace/unlock`.** My first
  F1 replay reported seven refused passphrase guesses; all seven had 404'd against a route that
  does not exist, and the database recorded **zero** attempts. The eighth review warned that an
  attack reporting a clean refusal should be checked for whether the attack happened at all. It
  happened to me one command later. The sanity line is: **does the database show the failures your
  attack was supposed to cause?**

### 4.3 The gates, attacked

Full CMS-admin takeover (F1), each step confirmed rather than assumed:

```
1. nat logs in: 302
   SANITY: nat is genuinely authenticated (/api/admin/pages): 200
2. nat resets tom's password: 200 {"success":true}
3. attacker logs in AS TOM: 302
   SANITY: the seized tom session authenticates: 200
4. GET /workspace          -> 302 -> /workspace/unlock
   GET /workspace/brain    -> 302 -> /workspace/unlock
   GET /workspace/contacts -> 302 -> /workspace/unlock
   GET /workspace/activity -> 302 -> /workspace/unlock
5. POST /api/workspace/ask   -> 404  no mention of unlocking
   POST /api/workspace/erase -> 404  no mention of unlocking
6. guess "password"   -> unlock 401 {"error":"That passphrase is not correct."}
   ... 5 real guesses refused, then the limiter: 429 "Too many attempts."
WORKSPACE OPENED BY THE ATTACKER: no
```

And the control, without which the above proves only that the gate is broken shut:

```
correct passphrase -> 200 {"ok":true}
AFTER unlock:  /workspace -> 200 | X-Robots-Tag: noindex, nofollow
```

Those five refused guesses also gave me a live end-to-end run of the alarm, unplanned and better
than any harness:

```
 180 | workspace_unlock_failed       | tom    | tom | A workspace unlock attempt was refused...
 181 | workspace_unlock_failed       | tom    | tom | ...
 182 | workspace_unlock_failed       | tom    | tom | ...
 183 | workspace_unlock_alert_failed | system | tom | Security notice FAILED to send after 3
                                                      failed unlock attempt(s) against "tom":
                                                      email is not configured...
 184 | workspace_unlock_failed       | tom    | tom | ...
 185 | workspace_unlock_failed       | tom    | tom | ...
```

Threshold reached at three, exactly one alert row for five attempts, the undelivered notice
correctly typed `alert_failed` rather than `alert_sent` (H2), `subject` populated exactly (J2),
and attempts four and five correctly inside the five-minute backoff.

### 4.4 Denials versus a genuinely missing page (F2 / G1)

17 workspace paths against a control path that was never built, comparing status, the **full
header set** and the body, with the per-request nonce, the `_csrf`/`connect.sid` cookie values
and the etag normalised (the etag is a hash over a body that carries the nonce):

```
FLAG ON,  anonymous                  [Accept: text/html]      : 17/17 identical
FLAG ON,  anonymous                  [Accept: application/json]: 17/17 identical
FLAG ON,  anonymous                  [Accept: */*]            : 17/17 identical
FLAG ON,  admin nat (not the owner)  [three Accept values]    : 17/17, 17/17, 17/17
FLAG OFF, anonymous                  [three Accept values]    : 17/17, 17/17, 17/17
method HEAD/POST/PUT/PATCH/DELETE/OPTIONS: control and workspace identical in every case
```

**153 of 153.** I checked the one asymmetry by hand: the differences before normalisation were
only the nonce, the CSRF cookie value and the etag, and the bodies were the same length to the
byte (4282). `X-Robots-Tag` appears only on the success path, which is G1's remedy holding.

### 4.5 Passphrase rotation invalidates an open unlock

Not previously tested by anyone. Sessions live in Postgres, so they survive a restart, which is
exactly why this needed testing rather than assuming.

```
baseline, unlocked session: /workspace -> 200
[server restarted with WORKSPACE_ACCESS_PASSPHRASE rotated]
session still logged in as tom?  /api/admin/pages -> 200      <- the session survived
previously-unlocked session:     /workspace       -> 302 -> /workspace/unlock
```

The unlock is invalidated while the login is not, which is the stated behaviour.

### 4.6 Concurrency, with a demonstrably sensitive instrument

Frozen head, four profiles, 60 rounds each (40 for the largest):

```
{"REPO":"wt","ROUNDS":60,"BURST":8, "STAGGER":40,"SENDMS":120,"MODE":"committed","tally":{"1":60},"dup":0,"silent":0}
{"REPO":"wt","ROUNDS":60,"BURST":8, "STAGGER":40,"SENDMS":30, "MODE":"random",   "tally":{"1":60},"dup":0,"silent":0}
{"REPO":"wt","ROUNDS":60,"BURST":8, "STAGGER":60,"SENDMS":10, "MODE":"random",   "tally":{"1":60},"dup":0,"silent":0}
{"REPO":"wt","ROUNDS":60,"BURST":12,"STAGGER":40,"SENDMS":30, "MODE":"random",   "tally":{"1":60},"dup":0,"silent":0}
{"REPO":"wt","ROUNDS":40,"BURST":20,"STAGGER":40,"SENDMS":30, "MODE":"random",   "tally":{"1":40},"dup":0,"silent":0}
```

Twelve racing OS processes, ten rounds:

```
{"rounds":10,"procsPerRound":12,"winnersPerRound":{"1":10},"alertRowsPerRound":{"1":10},"workerErrors":0}
```

**Sensitivity control** — the same harness against the defective previous head `39812ac`, with
the unique index dropped so the old failure mode is reachable:

```
{"REPO":"prev","BURST":8, "STAGGER":40,"SENDMS":120,"MODE":"committed","tally":{"1":60},        "dup":0}
{"REPO":"prev","BURST":8, "STAGGER":40,"SENDMS":30, "MODE":"random",   "tally":{"1":52,"2":8},  "dup":8}
{"REPO":"prev","BURST":8, "STAGGER":60,"SENDMS":10, "MODE":"random",   "tally":{"1":57,"2":3},  "dup":3}
{"REPO":"prev","BURST":12,"STAGGER":40,"SENDMS":30, "MODE":"random",   "tally":{"1":48,"2":12}, "dup":12}
```

**The fix is real, and 23 duplicates in 180 bursts prove my instrument can see the defect.** See
N2/P2 for what the first line of that table means for the committed test.

### 4.7 The seed migration, on four database shapes, twice each

```
SHAPE 1 fresh                                   pass1 exit=0 index=1   pass2 exit=0 index=1
SHAPE 2 polluted: 3 claims 'tom', 2 'nat',      before: pending=7 abandoned=0 index=0
        2 legacy subject=''                     pass1 exit=0 pending=3 abandoned=4 index=1
                                                pass2 exit=0 pending=3 abandoned=4 index=1
SHAPE 3 index present + one live claim          pass1 exit=0 pending=1 abandoned=0 index=1
                                                pass2 exit=0 pending=1 abandoned=0 index=1
SHAPE 4 pre-J2: no `subject` column, no index,  subject column present? 0
        3 legacy claims                         pass1 exit=0 pending=1 abandoned=2 index=1
                                                pass2 exit=0 pending=1 abandoned=2 index=1
```

Correct in every case: the newest claim per account survives, the rest are retired, and the
unique index builds. The ordering reasoning holds, and the retirement is genuinely load-bearing —
without it `CREATE UNIQUE INDEX` fails and, because the seed is the start command, the app
crashloops on boot.

## 5. What I accepted as reported, and from whom

Everything about Railway (that the passphrase and the snapshot key live only there; that Tom
alone reaches it), everything about staging deployments, the paid live-AI runs, the Drive
authorities, Tom's instructions, and the provenance and classification of the thirty snapshot
records. All of it comes from the builder's session. None of it is verified by me, and after nine
passes none of it is verifiable from inside this project's tooling.

## 6. Findings

### P1. N3 was reported as corrected and is not. The correction is unreachable dead code, contention still buys the five-minute backoff, the function now tells its caller one thing while the register says another, and the test named for it passes against a deliberately sabotaged function. Severity: MEDIUM

**What is claimed.** `review/workspace-v0.1-n-remediation-2026-08-31.md`: *"N3 (LOW). Contention
bought the send backoff. Accepted. ... **Contention is now recorded as abandonment, which gates
nothing.**"* `CLAUDE.md`: *"All five corrected."* And in the code, `lib/workspace/unlockAlert.js`
lines 681-687: *"Contention is recorded, for the same reason abandonment is, and gates nothing."*

**What I did.** Held the subject's advisory lock from a separate `pg` client so all four claim
attempts lose, then released it and let a genuine five-attempt burst evaluate.

```
failed attempts in window: 5 (threshold is 3)
external session holds the subject lock: true
contended call returned:
  {"sent":false,"error":"could not obtain the claim after 4 attempts ...",
   "recordedAs":"workspace_unlock_alert_abandoned"}
lock released; the alarm is now free to work
rows written by the contended call:
   [workspace_unlock_alert_error] Security notice could not be evaluated for "rev9-n3-subject"
   and NO send was attempted: could not obtain the claim after 4 attempts ...
next genuine attempt returned:
  {"sent":false,"quiet":true,
   "reason":"the last attempt could not be evaluated 0 minute(s) ago and NO send was attempted;
             retrying after 5 minutes"}
MESSAGES DELIVERED: 0
```

Then quantified with real time, by ageing the recorded row rather than simulating a clock:

```
obstruction lasted 320 ms, then cleared
immediately after:  sent=false  the last attempt could not be evaluated 0 minute(s) ago ...
record aged 4min:   sent=false  the last attempt could not be evaluated 4 minute(s) ago ...
record aged 6min:   sent=true
```

**What happened.** Three separate defects, all in one place.

**(a) The correction is dead code.** `ClaimContentionError` is thrown at line 464, inside
`claimAlertSlot`, which is awaited at line 621 *before* `claimId = claim.id` executes. So
`contended === true` **necessarily implies `claimId === null`** — and the `claimId !== null`
branch is the only place `outcomeEvent`/`outcomeSummary` are used. Contention always falls to the
`else` branch, which hard-codes `ALERT_ERROR_EVENT` and the `NO send was attempted` wording:

```js
      } else {
        await db.query(
          'INSERT INTO workspace_activity (actor, event_type, summary, subject) VALUES ($1,$2,$3,$4)',
          ['system', ALERT_ERROR_EVENT, `Security notice could not be evaluated for "${username}"
            and NO send was attempted: ${err.message}`, username]
        );
      }
```

`grep` confirms the class is thrown in exactly one place and caught by name in exactly one place;
the branch that would record abandonment has no reachable caller.

**(b) The behaviour the eighth review measured is unchanged.** 320ms of obstruction still buys
five minutes of guaranteed silence, after the obstruction has cleared, with five failed unlock
attempts sitting unreported. That is verbatim what N3 described.

**(c) A new untruth, introduced by the N1 fix, in the direction N1 was raised to close.** The
function now returns `recordedAs: "workspace_unlock_alert_abandoned"` while the row it wrote says
`workspace_unlock_alert_error`. The `recordedAs` field did not exist before this cycle; it was
added so the caller would be told what happened, and for this path it reports a row that was
never written. The brief for this pass asked, of N1, *"Does the caller's returned value ever still
contradict the register?"* For contention, yes — and it is the fix for N1 that made it possible.

**And the test does not establish the property.** The case pinning N3 is, in full:

```js
  await t.test('contention that sends nothing does not buy the send backoff', async () => {
    const d = alert.decideAlert({
      failuresInWindow: alert.THRESHOLD,
      lastSuccessAt: null, lastFailureAt: null, lastErrorAt: null,
      lastPendingAt: null,
      now: Date.now()
    });
    assert.equal(d.alert, true, 'a burst was refused with nothing holding it back');
  });
```

It calls the **pure helper** with every input null and asserts that a burst with nothing recorded
produces an alert. It never constructs contention, never calls `maybeAlertOnFailedUnlock`, and
never inspects an event type. To prove it asserts nothing rather than merely arguing it, I
mutated the frozen head so that contention records itself as a **DELIVERED notice** — maximally
dishonest, and it buys the full sixty-minute silence:

```
-  ['system', ALERT_ERROR_EVENT, `Security notice could not be evaluated ...`, username]
+  ['system', ALERT_EVENT,       `MUTATION: pretending a notice was DELIVERED ...`, username]
```

```
$ node --test test/workspace/unlockAlert.test.js
    ok 21 - contention that sends nothing does not buy the send backoff
# tests 32   # pass 32   # fail 0

$ npm test                       # the whole tree, against the same mutation
# tests 538  # pass 536  # fail 0  # skipped 2
```

**The entire 538-test suite is green while the alarm records a security notice as delivered that
was never sent.** This is the builder's own post-J1 rule — *the test must exercise the REAL
function under the conditions the property claims to hold, not a pure helper beneath it* — stated
in `CLAUDE.md` and not met by the test written to satisfy it, for the second cycle running.

**Why MEDIUM and not HIGH.** The operational reach is small and I want that said plainly. The
unlock limiter is 5 per 15 minutes per user id, so a real burst is at most five concurrent; the
eighth review could not produce an exhaustion at 60 concurrent, and I could not either. The
advisory lock is namespaced (`ALERT_LOCK_CLASS = 4267`) and nothing else in the codebase takes an
advisory lock, so no unrelated subsystem can collide with it. An attacker cannot induce contention
without database access, at which point they have already won. So this costs an inaccurate
register entry and up to five minutes of silence in a rare state — not access and not disclosure.

**Why MEDIUM and not LOW.** A remediation and the project memory both record a correction that
does not exist, in a module whose headline rule is *never describe something as having happened
when it did not*. That is the ninth instance of the governing pattern, and the next session reads
`CLAUDE.md` before it reads the code.

**Remedy.** Three parts, all small:

1. Raise the contention outcome where it can be seen. Either set `claimId` from a contention
   marker before rethrowing, or — simpler and less fragile — handle `ClaimContentionError` in the
   `else` branch too, so both branches choose their event type from the same `outcomeEvent`
   expression rather than one of them hard-coding a constant.
2. Make `recordedAs` the value actually written, not the value computed. Assign it after the
   `UPDATE`/`INSERT` succeeds, so a caller can never be told about a row that does not exist.
3. Replace the test with one that constructs real contention against the real function — take the
   advisory lock from a second client, call `maybeAlertOnFailedUnlock`, assert the row's
   `event_type` is not a gating type, and assert the immediately following genuine burst **does**
   alert. Confirm it goes red at this frozen head before trusting it.

---

### P2. The committed concurrency test is provably blind to the defect it guards, and the builder's "I could not reproduce it" is wrong — the sensitivity reproduces here, and the two variables that matter are identifiable. Severity: MEDIUM

**What is claimed.** `test/workspace/unlockAlert.test.js`, in the committed comment: *"Stated
honestly rather than claimed: I could NOT reproduce that sensitivity here. Fifty rounds at each
profile against both candidate predecessors, with the unique index dropped so the old failure mode
was reachable, produced zero bad rounds either way."* Repeated in `CLAUDE.md`.

The builder deserves credit for saying that rather than restating my predecessor's figure as their
own. But the claim is testable, the brief asked me to test it rather than accept it, and it does
not survive.

**What I did.** Built one harness replicating the committed subtest's profile exactly, pointed it
at either head, and varied only the stagger *shape* and the send delay. Against `39812ac` with the
unique index dropped:

```
committed profile: stagger = (i*7)%40 deterministic, send = 120ms
  -> {"tally":{"1":60},"dup":0}                    clean 60/60 against demonstrably broken code

random stagger 0-40ms, send = 30ms
  -> {"tally":{"1":52,"2":8},"dup":8}              8 duplicates in 60   (13%)
random stagger 0-60ms, send = 10ms
  -> {"tally":{"1":57,"2":3},"dup":3}              3 duplicates in 60   (5%)
random stagger 0-40ms, send = 30ms, 12 callers
  -> {"tally":{"1":48,"2":12},"dup":12}            12 duplicates in 60  (20%)
```

**What happened.** The committed test is blind — clean 60 out of 60 against code that duplicates
one burst in five under a neighbouring profile. And the sensitivity *does* reproduce on this
machine, which means the builder's inability to reproduce it was a property of their probe, not of
the hardware. Two variables account for it, and the committed test gets both wrong:

- **The stagger must be random, not `(i*7)%40`.** A deterministic ramp puts every caller in a
  fixed, evenly-spaced order and reproduces the same interleaving each round. The duplicate needs
  one caller's decision to be older than another's write, which is a probabilistic overlap.
- **The send delay must be short.** At 120ms the winner's send dominates the timeline and the
  losers have all long since stood down. At 10-30ms the read-decide-write windows overlap.

The builder kept the 120ms delay and made the stagger deterministic, which is precisely the
combination that sees nothing. So the comment now in the tree tells a future maintainer that the
profile does not matter, when the measurement above says the profile is the whole thing.

Compounding it, none of the earlier structural gaps is fully closed either: the new subtests do
name the unique index (`23505`), the per-account scope, the `abandoned` type and the future-dated
claim — that is a real improvement and I credit it. But `grep` across the test tree still returns
nothing for `ClaimContentionError`, and nothing for the seed's `Superseded duplicate claim`
migration, whose absence crashloops the app on boot on exactly the databases most likely to be
affected. I verified that migration by hand on four database shapes; no test does.

**Remedy.** Concrete, and with the numbers to check it against:

1. Change the stagger to `await sleep(Math.random() * 40)` and the send delay to ~30ms. Then run
   the subtest against `39812ac` with `uq_workspace_alert_pending` dropped and **confirm it goes
   red** — expect roughly 8 failures in 60 rounds at 8 callers, 12 in 60 at 12 callers. Do not
   trust it until it has failed.
2. Correct the comment (and the `CLAUDE.md` paragraph) to say what the profile change is for,
   rather than that it could not be reproduced.
3. Give the seed migration the gated test that `test/waiSeedMode.test.js` already provides a shape
   for: pollute a throwaway database with duplicate claims, shell out to the real `node db/seed.js`,
   assert exit 0 and the index present.

---

### P3. N4's stated root fix is not at the root: the threshold window — the first and most authoritative gate — still computes from the Node clock, and a database clock behind it silences the alarm completely. Severity: LOW

**What is claimed.** The N remediation: *"**Correction, at the root rather than by clamping.**
Every authoritative window is now expressed in SQL against `now()`, so one clock decides."*
Repeated verbatim in `CLAUDE.md`.

**What I did.** Enumerated every window in the module and which clock evaluates it.

```
=== windows computed from the NODE clock (JS Date arithmetic) ===
458:            new Date(now - CLAIM_LEASE_MINUTES * 60000)        <- the `handled` check
497:    [FAILED_EVENT, username, new Date(now - WINDOW_MINUTES * 60000)]   <- THE THRESHOLD WINDOW

=== windows computed from the DATABASE clock (SQL now()) ===
519-520, 579-583                                                   <- reclaim + the INSERT guard

=== decideAlert's comparisons: Node `now` against DB timestamps ===
175, 185, 193, 204
```

Then measured the two clocks, and modelled a database clock running behind Node's by more than
`WINDOW_MINUTES`:

```
Node clock       : 2026-08-31T11:02:16.926Z
Database now()   : 2026-08-31T11:02:16.937Z
disagreement     : 11 ms

five refused attempts, written by a database clock 35 min behind Node's:
  result: {"sent":false,"reason":"0 failure(s) in the window, threshold is 3"}
  MESSAGES DELIVERED: 0   <- the alarm is deaf

control, clocks agreeing: sent=true  MESSAGES DELIVERED: 1
```

**What happened.** Two of the module's windows moved into SQL and three did not, including the one
that decides whether an alert is due at all. A database clock behind the application clock by more
than thirty minutes puts every refused attempt outside the window Node computes, the count reads
zero, and the alarm never fires — permanently and silently, which is this chain's stated worse
failure. `notInTheFuture` does not help: it clamps the alert-state timestamps in the *other*
direction, and does not touch the failure count.

**Stated rather than glossed: I did not observe this happening.** I cannot skew the database
clock; the 11ms disagreement above is ordinary round-trip latency, not skew. This is a modelled
consequence, exactly as N4 itself was. I raise it as a finding rather than a concern only because
the remediation and the project memory both assert that the root has been fixed and it has not,
and because the remedy is two lines.

I did answer the brief's other three questions about N4 in the negative, and they are worth
recording as clean:

- **The reclaim does not race.** It runs inside the advisory lock, and a live claim's `created_at`
  is written by the same database clock its predicate compares against, so it cannot be more than
  a minute in the future. A live sender's claim is only reclaimable once the send outlives the
  three-minute lease, which is the documented and accepted case.
- **Moving the reclaim ahead of the state reads is correct**, and I could not construct an ordering
  where it retires a claim out from under a sender that had not already exceeded its lease.
- **`notInTheFuture` opens no hole for a past-dated row.** A past-dated timestamp makes the alarm
  fire *sooner*, which is the safe direction; a past-dated pending claim is retired by the reclaim
  before the reads, so it does not deadlock the slot.

**Remedy.** Express the remaining two windows in SQL as well —
`created_at >= now() - ($3 || ' minutes')::interval` for the failure count and the `handled`
check — and derive `decideAlert`'s ages from a database-supplied `now` rather than `Date.now()`,
so the sentence in the remediation becomes true. Then correct the claim in `CLAUDE.md` either way.

---

### P4. The gated-suite drift guard, fourth pass: four more evasion shapes, all missed, including the one this guard's own file uses to read its environment. Severity: LOW

**What is claimed.** The N remediation: *"So it no longer matches how a gate is written. ... the
guard now looks for environment reads outside a small ambient allowlist ... **Verified against
seven shapes**, each planted and confirmed to turn the guard red."*

**What I did.** Planted five gated suite files, one at a time, and ran `test/gatedSuites.test.js`
against each.

```
CAUGHT    : control A: hoisted const (the shape the builder says is caught)
*** MISSED: B: alias process.env to a local, then read off the alias
*** MISSED: C: destructure with rest, read off the rest object
*** MISSED: D: read via a computed/concatenated key
*** MISSED: E: Object.assign / getter indirection
```

Shape B is:

```js
const env = process.env;
test('planted', { skip: !env.MY_SECRET_GATE }, () => {});
```

which is the idiom `test/gatedSuites.test.js` itself uses at line 120 (`const env = process.env;`)
and which only escapes its own guard because the file exempts itself.

**What happened.** The method did not change as much as the remediation says. It moved from
pattern-matching the *gate* to pattern-matching the *read*, and a read is just as easy to spell
differently. The seven shapes verified are the seven the pattern was written from — which is M4's
criticism, repeated by N5, and now true for a fourth cycle. This is not a security control; it is
an honesty control on what `npm test` reports, and it works today only because no suite in the
tree happens to use an aliasing form.

I also note `DB_ONLY_GATE` at line 40 is now declared and never used — a leftover from the
previous pattern-based version.

**Remedy.** Stop trying to detect gates and invert the obligation. Require **every** file under
`test/` to appear in exactly one of two declared lists, `GATED` or `UNGATED`, and fail on any file
in neither. That is decidable, refactor-proof, cannot be defeated by rewriting a read, and turns a
new gated suite into a deliberate one-line classification rather than a race between an author and
a regex. Keep the unconditional-`t.skip` shape check alongside it. Then verify it the way M4 asked:
plant the counter-examples and watch it go red.

---

### P5. Both surviving inaccuracies are also written into `CLAUDE.md`, which is the first thing the next session reads. Severity: LOW

**What is claimed.** `CLAUDE.md`, in the section added by this cycle: *"All five corrected"*; and
*"Every authoritative window is now expressed in SQL against `now()`, so one clock decides."*

**What I did.** Compared the memory file's assertions with what I measured (P1 and P3 above).

**What happened.** Neither is true. This matters more here than it would in most projects, because
this repository's own working rules require a session to ground itself in `CLAUDE.md` before
material work, and because the specific failure this chain keeps producing is a maintainer
trusting a written assertion instead of the code. A future session reading *"All five corrected"*
has no reason to look at the contention path, and one reading *"one clock decides"* has no reason
to check the threshold window.

I have deliberately kept this separate from P1 and P3 rather than folding it in, because the code
fix and the memory fix are different acts and the second is the one most likely to be forgotten.

**Remedy.** When P1 and P3 are corrected, correct the two sentences with them. If either is
deferred rather than fixed, say so in `CLAUDE.md` in the same words the finding uses, rather than
leaving the claim standing.

## 7. What I re-verified as still closed

| Finding | How I checked it | Result |
|---|---|---|
| F1 (CMS-admin takeover) | seized `tom` via a real `PUT /api/admin/user/2/password` as `nat`; confirmed BOTH sessions genuinely authenticate; attacked every page and API; guessed the passphrase at the real endpoint until the limiter tripped | stops at the unlock screen; data pages 302 there; APIs 404 with no mention of unlocking; **workspace not opened**; control proves the gate opens for the right passphrase |
| F2 / G1 (denial indistinguishable) | 17 paths x 3 Accept values vs a control path, comparing status, full header set (nonce/cookie/etag-normalised) and body; flag on and off; anonymous and as authenticated non-owner admin; 6 further HTTP methods | **153/153 identical**; bodies the same length to the byte; no header differs; method sweep clean |
| Unlock rotation (untested before) | unlocked a session, restarted with a rotated passphrase, re-used the same cookie | login survives (200 on `/api/admin/pages`), unlock does not (302 to `/workspace/unlock`) |
| H1 (alert recipient) | poisoned the CMS row `contact.email` to `attacker@evil.example` in the database, then called `alertRecipient()` | not retargeted; returns the constant; takes **0** parameters; source contains no content/query/db reference |
| H2 (delivered vs failed) | behavioural, through the real path, ageing the recorded row | failed send gated at +2min, fires at +6min; delivered gated at +2/+6/+59min, fires at +61min |
| H3 (boot honesty) | boot lines, flag on and off | each gate reported separately, real user ids printed, alarm correctly declared inert (`GMAIL_APP_PASSWORD` unset) |
| H4 (one activity level) | grep across the tree, then its call sites | one constant (`routes/workspace.js:45`), exactly two call sites (160, 307), one test; no third surface |
| J2 (subject column, exact match) | an account literally named `rev9-j2-%` alerting alongside a victim account | both alerted, one delivered row each; **no cross-silencing** |
| J3 (pre-send failure recorded) | two genuine pre-send failures (connection unobtainable; a handle that cannot hold a transaction), then a lock/transaction sweep | both durably recorded with honest wording and a matching `recordedAs`; **0 advisory locks, 0 idle-in-transaction** after every harness |
| K3 (`decideAlert` live) | call-site count in the deployed module | exactly one call site, inside `claimAlertSlotLocked` |
| L1 (dedicated connection) | the branch the deployed handle takes, plus a refusal probe | `dedicatedConnectionSource(db/pool)` = `'wrapper'`; a shorthand-only handle is refused and throws |
| L2 (silence) | five profiles at the frozen head (220 bursts) plus 12 racing processes x 10 rounds, against a control that reproduces the old defect 23 times in 180 | **0 silent, 0 duplicated, 0 worker errors** |
| L3 (secrets) | AES-GCM tag verification over 82 distinct 64-hex candidates from 2,005 files plus the process environment, with a control blob proving the routine returns true when it should | **0 authenticate**; no plaintext snapshot anywhere; `.gitignore` guard present; snapshot hash unchanged from the eighth review |
| M1 (worker close) | 120 worker processes across 10 rounds | 0 worker errors, one winner and one alert row per round |
| M2 (nothing-attempted honesty) | three failure shapes through the real entry point | an attempt that never reached a send says so; **an attempt that did reach one no longer says so** (that is N1, and it is fixed) |
| N1 (delivered recorded as delivered) | injected a failure into the single statement after a successful send; then into that statement AND the catch's own recovery | single failure: recorded **delivered**, hour starts, **1** message for the burst; four sendFn return shapes all recorded honestly |
| N4 (future-dated claim) | planted a claim 30 minutes ahead, ran a threshold burst | reclaimed, not trusted; the alarm fires (the ordering fix is genuine — see P3 for what it did not cover) |
| K5 (freeze) | `rev-parse` / `status` at start and end; snapshot hash | clean at the frozen head throughout; hash identical to the eighth review's |

## 8. Concerns I could not turn into findings

- **A double database failure leaves the register saying `pending` while the caller is told
  `sent: true`.** I broke the outcome `UPDATE` *and* the catch's own recovery `UPDATE`: one
  message was delivered, the function correctly returned `sent: true`, and the register kept the
  claim row. It does not lie — it says "claimed, the outcome follows" and is later retired as
  abandoned — but the delivery is never recorded, and after the lease a duplicate becomes
  possible. Two consecutive failures of the same statement is a thin scenario, and the console
  fallback is by design, so I leave it here rather than in section 6.
- **A duplicate is still possible if a send outlives the three-minute claim lease.** Documented and
  deliberate. Worth knowing it is the accepted case, not the eliminated one.
- **A legacy database keeps one permanently unresolved claim.** Shape 4 above ends with one
  surviving `pending` row whose `subject` is `''`. The runtime reclaim matches `subject = $2` with
  a real username, so nothing will ever retire it. Raised by the eighth review, unchanged; a
  `WHERE subject <> ''` on the retirement would tidy it.
- **`maybeAlertOnFailedUnlock`'s `now` parameter is now only half-honoured.** After N4, an injected
  `now` drives the failure window and `decideAlert` but not the reclaim or the authoritative INSERT
  guard. No committed test injects a fabricated `now` into this function, so nothing is currently
  wrong — but a future test that does will silently be measuring a mixed clock. I hit this myself
  and had to rewrite a probe.
- **`decideAlert`'s default parameter still references `CLAIM_LEASE_MINUTES`, declared 99 lines
  later.** Unchanged for a fourth pass. Safe only because defaults evaluate at call time.
- **The `handled` list in `claimAlertSlot` still omits `ALERT_ERROR_EVENT` and
  `ALERT_ABANDONED_EVENT`**, so a loser that exhausts after a winner errored adds a second row.
  Noise rather than harm; folded into P1's remedy.
- **A non-GET request with a bad CSRF token returns 500 rather than 403**, on workspace paths and
  on the control alike. Pre-existing, and not a disclosure — but it cost me a probe, because a
  workspace API call with a missing token returns 500 and looks like a workspace answer when it is
  not one.
- **No live alert email has ever been delivered.** The builder says so plainly, which is right. The
  last hop of this control remains untested by anyone, on nine passes.
- **The in-memory unlock attempt budget still resets on any restart** (G6, disclosed and unchanged).
  I relied on it myself across several server restarts; a patient attacker can rely on it too.
- **Four throwaway databases from earlier reviews are still on this machine** (`ws_test`,
  `ws_final`, `ws_fresh`, `ws_fresh2`), as are two unrelated `git worktree`s under `/tmp`. Not
  mine, so I left them; worth a sweep by whoever owns the sandbox.
- **Who holds Railway.** F1's closure, H1's remedy and the whole third gate rest on Railway being
  reachable only by Tom. Nine passes, no reviewer has seen it.
- **Nine passes, nine instances — and a ninth rule, if one is wanted.** The eighth review proposed:
  *when a fix turns one event type into two, write down which side of the boundary every code path
  is on, and check that each path can actually tell.* That rule, applied, finds P1 immediately —
  and P1 exists because the rule was written and not run. So the rule I would add is narrower and
  more mechanical: **a fix whose whole content is a new branch must be executed, once, with the
  input that reaches that branch.** P1's branch has never run. Neither had the branch behind J1,
  L1 or M2. That single habit would have caught four of the nine.

## 9. What remains for Tom Arrington

1. **The gates hold, and after nine independent attempts that sentence has earned as much weight
   as this process can give it.** Nobody has opened this area or leaked a record from it. Holding
   your CMS admin account and resetting your password still gets an attacker to a locked screen and
   no further. With the flag off, the workspace is byte-for-byte indistinguishable from a URL that
   was never built — headers and cookies included, across three identities and seven methods — so
   **merging remains inert**. I re-established that myself rather than accepting it, and I added one
   check nobody had done: rotating the passphrase does close an open session immediately.
2. **The failed-unlock alarm's concurrency chapter is closed, and my own instruments say so.** 220
   threshold bursts and 120 racing worker processes at the frozen head produced exactly one notice
   every time, while the same harness breaks the previous version 23 times in 180 bursts. You can
   stop worrying about that particular thing.
3. **What is not closed is a fix that was reported as made and was not.** P1 is the ninth instance
   of this project's governing pattern, and it is the most instructive one yet, because the code
   that would have fixed it is sitting right there and simply cannot be reached. The behaviour is
   unchanged, the register is wrong about it, and the test that carries its name passes green while
   the alarm claims to have delivered a notice it never sent. P2 is the same shape one level up: the
   test guarding the headline property cannot see the defect it guards, and this time I can hand the
   builder the exact numbers to fix it against. **Both are hours of work, not days.**
4. **Do not read "two MEDIUM, no HIGH" as "nearly there" without also reading P5.** The two
   inaccuracies are written into `CLAUDE.md`, which is what the next session will trust. Whatever
   you decide about the code, the memory file should not keep saying five findings were corrected
   when four were.
5. **Do the secret rotation.** Still yours and still outstanding: `WORKSPACE_ACCESS_PASSPHRASE`,
   `WORKSPACE_SNAPSHOT_KEY`, then `SESSION_SECRET` (which invalidates every CRM erasure tombstone,
   by design) and the account passwords. I verified independently that no live snapshot key survives
   in this working environment — 82 candidates, cryptographic tag verification, none authenticate —
   but a value a builder session once held in cleartext is not a secret a control should rest on.
6. **On the published severity bar, nothing in this report blocks your release decision.** There is
   no HIGH, nothing that opens the workspace, nothing that leaks, and nothing that stops the alarm
   firing on a real burst under your deployed rate limiter. If you want a green verdict first, P1
   and P2 are the two to clear; P3, P4 and P5 are tidy-ups that should ride along with them.
7. **Why this is AMBER and not PASS, said plainly, because you should be able to check my
   reasoning.** I did not withhold a PASS out of deference to eight predecessors, and I went looking
   for reasons to award one — everything I attacked in sections 4.3 to 4.7 held, and much of it held
   impressively. I withheld it for one reason, and it is a fact rather than a judgement: a finding
   was recorded as corrected, the correction is unreachable, and I reproduced the original defect at
   the frozen head. A verdict that graded around that would be telling you the thing this whole
   chain exists to stop being told.
8. **What still cannot be verified from inside this project's tooling** after nine passes: the Drive
   authorities, the provenance and classification of the thirty snapshot records, your own
   instructions except as quoted by the builder, and everything about Railway. Nine independent
   passes have not moved any of those an inch, and a tenth will not either. If you want them
   certified it needs a reviewer with Drive and Railway access and, on the evidence of nine passes,
   one not commissioned by the session whose work is being reviewed.

---

Nothing in this review was merged, deployed, connected, spent or enabled. The paid live-AI suites
were not run. My writes were confined to seven throwaway databases — `ws_rev9`, `ws_rev9_mut`,
`ws_rev9_prev`, `ws_s1`, `ws_s2`, `ws_s3` and `ws_s4` — created from nothing and dropped at the
end; within `ws_rev9` I changed the local `tom` password, briefly poisoned and then restored the
CMS `contact.email` row, and created `workspace_activity` rows for my probes, before dropping the
database entirely. Every experiment needing a code change was done in `git worktree`s under `/tmp`,
which have been removed, and the mutation described in P1 existed only inside one of them. Both
servers I started have been stopped. `data/workspace-snapshot.enc` is unchanged and was never
decrypted: my only interaction with it was a GCM tag check whose output was a boolean. The reviewed
branch is left at `1710179726509ea89c38e0b50a4bbd04643e9494` with a clean tree.
