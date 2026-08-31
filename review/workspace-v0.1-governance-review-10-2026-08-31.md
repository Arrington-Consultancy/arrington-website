# Arrington AI Workspace v0.1: Independent Governance & Assurance Review (tenth pass)

Date: 31 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, frozen head
`09cd35e6c8bc99a9b0aeaf24a350975ed130c6ab`.
Baselines: the nine previous reviews (F1-F10, G1-G9, H1-H7, J1-J4, K1-K5, L1-L5, M1-M5,
N1-N5, P1-P5, **all AMBER**) and the builder's nine responses, the most recent being
`review/workspace-v0.1-p-remediation-2026-08-31.md`.

```
$ git rev-parse HEAD
09cd35e6c8bc99a9b0aeaf24a350975ed130c6ab
$ git status --porcelain
(empty)
$ sha256sum data/workspace-snapshot.enc
e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2
```

The tree stayed frozen and clean throughout, and the snapshot hash is byte-identical to the
value the eighth and ninth reviews recorded. K5's remedy has now held five passes running.
Every experiment needing a code change ran in a `git worktree` under `/tmp`; every write went
to throwaway databases created from nothing and dropped at the end. This report is committed on
a separate branch.

## 1. The bounded question

Nine consecutive reviews found the same class of defect: a security property asserted and not
held. The last five instances were each introduced by the fix for the one before (K1 → L1/L2 →
M2 → N1 → N3/P1). My predecessor's sharpest demonstration was that a whole 538-test suite
stayed green while the alarm recorded an undelivered notice as DELIVERED.

So: is the P-cycle correct? Are the closures from F through P still closed under probes of my
own construction? And — the question nine passes have answered by looking at the newest code —
is there anywhere the pattern has been hiding that nobody has looked at?

Nothing more. This review does not authorise a merge, a deploy, an environment variable change,
a spend, or the connection of any external account, and it did none of those things.

## 2. VERDICT: AMBER

**AMBER. One HIGH, three LOW. The HIGH is not in the P-cycle changes; it is in a place ten
passes have asserted and none has tested.**

**The P cycle itself is correct.** I attacked all four fixes rather than reading them, and
all four hold:

- **P1 is genuinely fixed.** Every one of the four outcome branches is reachable, and each
  records what actually happened. The ninth review's own mutation — making contention record
  itself as a DELIVERED notice — now turns the suite **red**, where it stayed green before. The
  replacement test is red against `1710179` and green here.
- **P2 is genuinely fixed, and the corrected profile is both sensitive and stable.** The
  committed profile now breaks a defective predecessor **6 times in 60**; the profile the
  builder had defended breaks it **0 in 60**. Against the frozen head I ran **860 threshold
  bursts** across three profiles and **12 consecutive runs of the real test file**: zero
  duplicated, zero silent, zero flakes.
- **P3's window is correct at both edges**, and the injected-clock cases behave as the code says.
- **P4's five claimed shapes are all genuinely caught.** Nine others are not — see Q3.
- **The concurrency guarantee holds under my own instruments**, including 180 racing OS
  processes across 15 rounds: exactly one winner and one alert row every round, zero worker
  errors, zero leaked advisory locks, zero connections left idle in transaction.
- **All three gates held under direct attack.** I seized `tom`'s CMS account as `nat` through
  the real API, confirmed both sessions genuinely authenticate, and got no further than a locked
  screen — with the control proving the gate opens for the right passphrase, and rotation
  closing an open session while leaving the login intact.
- **The seed migration is correct on all four database shapes, twice each.**

**What I found instead is Q1, and it is one anonymous `curl` away.** Express answers an
`OPTIONS` request from its own route table *before* any route middleware runs. So every
`/api/workspace/*` endpoint answers **200 with `Allow: POST`** to an unauthenticated request,
while a path that was never built answers 404 — **with `ENABLE_ARRINGTON_AI_WORKSPACE` unset,
which is production's configuration if this branch merges.** `routes/workspace.js` does not
exist on `main`, so merging *adds* this oracle to the live site. That falsifies the claim,
written into `CLAUDE.md` and repeated in every review's closing section, that with the flag off
the workspace is indistinguishable from a URL that was never built and that **merging is inert**.

It is the tenth instance of the governing pattern, and the reason it survived ten passes is the
same reason as the previous nine: the test written to establish the property does not exercise
the condition under which it fails. The builder's adversarial suite reported **9 of 9 green**
against the very server on which I enumerated the whole API surface, because it sends only GET
and POST.

**Nothing found opens the workspace, leaks a record, defeats a gate, or stops the alarm firing.**
Q1 is disclosure of existence and shape, not of content. But G1 — the same consequence through a
different header, also with the flag off — was rated HIGH on this chain's own bar, and the same
grade is owed here.

## 3. Independence, and its limits

I am a separate session from the technical builder. I wrote none of the workspace code and
accepted no claim I could test myself. The four limits recorded by every previous pass stand
unchanged, and after ten passes they are not going to resolve themselves:

1. **I am a Claude agent, commissioned by the builder's own session, reviewing the builder's
   work.** Structural, and uncured by my having found things.
2. **No network access to Railway or the live site.** Everything about production and staging
   variables, deployments and the paid live-AI runs is reported to me, not verified by me.
3. **No Google Drive access.** The controlled authorities and Tom's instructions reach me only
   as transcribed by the party they constrain.
4. **No real browser.** I drove the application over HTTP and inspected status, headers, bodies
   and cookies. I did not render a page.

The paid live-AI suites were **not run**: they spend money and I was instructed not to. They are
not evidence in this pass.

## 4. What I did, with observed results

Environment: local Postgres 16; throwaway databases `ws_r10`, `ws_r10_mut`, `ws_r10_mut2`,
`ws_r10_p9`, `ws_r10_prev`, `ws_r10_prev2` and `ws_s1`-`ws_s4`, all created from nothing and
dropped at the end; servers on 3101 (workspace armed), 3102 (no workspace variables at all) and
3103 (a prototype of Q1's remedy); `git worktree`s at `/tmp/rev10/wt` (frozen head),
`/tmp/rev10/mut` (mutation copy), `/tmp/rev10/prev9` (`1710179`), `/tmp/rev10/39812ac` and
`/tmp/rev10/6226673` (sensitivity controls).

### 4.1 The regression suite

```
$ env -u NAT_PASSWORD -u TOM_PASSWORD DATABASE_URL=... SESSION_SECRET=... npm test
# tests 538   # suites 53   # pass 536   # fail 0   # skipped 2      (run 1)
# tests 538   # suites 53   # pass 536   # fail 0   # skipped 2      (run 2)
```

Green and stable. It does **not** match the P remediation's stated `552 tests, 550 pass, 2
skipped` — see section 8.

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

Nine of nine, all executed, nothing NOT EXECUTABLE. **Read section 6, Q1, before taking comfort
from it:** those nine passed on the same server, in the same minute, on which an anonymous
request enumerated the whole workspace API.

**A fifth trap, to add to the four my predecessors documented.** The site's `POST /login`
requires the `_csrf` hidden field from the login page. My first F1 replay reported a clean
refusal at every step — because the login itself had 403'd and no session ever existed. This is
the eighth review's rule applied to me for the second pass running: **when an attack reports a
clean refusal, first prove the attack happened.** I proved it by asserting `200` on
`/api/admin/pages` for each session before using it, and by checking the database showed the
failures the attack was supposed to cause.

### 4.3 The gates, attacked

Full CMS-admin takeover (F1), each step confirmed rather than assumed:

```
1. nat logs in: 302 /
   SANITY nat authenticated (/api/admin/pages): 200
2. nat resets tom's password (PUT /api/admin/user/2/password): 200 {"success":true}
3. attacker logs in AS TOM: 302 /
   SANITY seized tom session authenticates: 200
4. GET /workspace          -> 302 -> /workspace/unlock
   GET /workspace/brain    -> 302 -> /workspace/unlock
   GET /workspace/contacts -> 302 -> /workspace/unlock
   GET /workspace/activity -> 302 -> /workspace/unlock
5. POST /api/workspace/ask            -> 404, "unlock" not mentioned, len 4282
   POST /api/workspace/contacts/1/erase -> 404, "unlock" not mentioned, len 4282
6. "password"  -> 401 {"error":"That passphrase is not correct."}
   "letmein"   -> 401     "arrington" -> 401     "workspace" -> 401     "tom" -> 401
   "sixth"     -> 429 {"error":"Too many attempts. Wait fifteen minutes."}
WORKSPACE OPENED BY THE ATTACKER: no (status 302)
```

And the control, without which the above proves only that the gate is broken shut:

```
CORRECT passphrase -> 200 {"ok":true}
AFTER unlock:  /workspace          -> 200 | X-Robots-Tag: noindex, nofollow
               /workspace/brain    -> 200 | X-Robots-Tag: noindex, nofollow
               /workspace/activity -> 200 | X-Robots-Tag: noindex, nofollow
erase with a mismatched confirmation, as Tom -> 404 (refused)
```

Those five refused guesses gave me an unplanned live end-to-end run of the alarm, straight out
of the real database:

```
 9980 | workspace_unlock_failed       | tom    | tom | A workspace unlock attempt was refused...
 9979 | workspace_unlock_failed       | tom    | tom | ...
 9978 | workspace_unlock_alert_failed | system | tom | Security notice FAILED to send after 3
                                                       failed unlock attempt(s) against "tom":
                                                       email is not configured...
 9977 | workspace_unlock_failed       | tom    | tom | ...
 9976 | workspace_unlock_failed       | tom    | tom | ...
 9975 | workspace_unlock_failed       | tom    | tom | ...
```

Threshold reached at three, exactly one alert row for five attempts, the undelivered notice
correctly typed `alert_failed` rather than `alert_sent` (H2), `subject` populated exactly (J2),
attempts four and five correctly inside the five-minute backoff.

### 4.4 Passphrase rotation invalidates an open unlock

```
baseline, unlocked session: /workspace -> 200
[server restarted with WORKSPACE_ACCESS_PASSPHRASE rotated; new PID confirmed by ps -o lstart]
session still logged in as tom?  /api/admin/pages -> 200   <- the login survived
previously-unlocked session:     /workspace       -> 302 -> /workspace/unlock
```

The unlock is invalidated while the login is not. Confirmed independently, as the ninth pass
found.

### 4.5 Denials versus a genuinely missing page (F2 / G1), across SEVEN methods

20 workspace paths against a control path that was never built, comparing status, the **full
header set** and the body, with the per-request nonce, the `_csrf`/`connect.sid` cookie values
and the etag normalised, across three `Accept` values and seven HTTP methods — 420 comparisons.

```
FLAG ON,  anonymous : 396/420 identical to a genuinely missing page
FLAG OFF, anonymous : 396/420 identical to a genuinely missing page
```

**The 24 failures are all the same thing and all the same method.** Every one is
`OPTIONS` against one of the eight `/api/workspace/*` routes, across the three `Accept` values.
That is finding Q1. GET, HEAD, POST, PUT, PATCH and DELETE are clean on every path, flag on and
off; the page routes are clean under OPTIONS too.

With the prototype remedy in section 6 applied: **420/420**.

### 4.6 Concurrency: sensitivity, then stability

**Sensitivity** — the committed profile (8 callers, random 0-40ms stagger, 5ms send) against
`39812ac` with the unique index dropped, so the old failure mode is reachable:

```
{"REPO":"39812ac","ROUNDS":60,"BURST":8,"STAGGER":40,"SENDMS":5,"MODE":"random",
 "tally":{"1":54,"2":6},"dup":6}                       <- 6 duplicates in 60
```

**The profile the builder had defended, against the same defective code:**

```
{"REPO":"39812ac","ROUNDS":60,"MODE":"ladder","SENDMS":120,"tally":{"1":60},"dup":0}
                                                        <- clean 60/60 against broken code
```

So P2's substance reproduces: the deterministic ladder plus the long send sees nothing, and the
random stagger plus the short send sees the defect. (The builder's *second* figure does not —
see section 8.)

**Stability against correct code** — the frozen head, 860 bursts:

```
10 x {"ROUNDS":60,"BURST":8, "STAGGER":40,"SENDMS":5,"tally":{"1":60},"dup":0,"silent":0}
 3 x {"ROUNDS":60,"BURST":12,"STAGGER":40,"SENDMS":5,"tally":{"1":60},"dup":0,"silent":0}
 2 x {"ROUNDS":40,"BURST":20,"STAGGER":20,"SENDMS":1,"tally":{"1":40},"dup":0,"silent":0}
```

and the real committed test file, run end to end twelve times:

```
# pass 32 # fail 0   (x12)
```

**The randomised profile introduces no flake risk.** That was the live question about P2 and it
is answered: 860 bursts and 12 full runs, not one bad round.

**Racing OS processes** — 180 processes across 15 rounds, released at a shared instant:

```
round 1..10 : winners=1  alertRows=1
round 1..5  : winners=1  realErrors=0  alertRows=1  (12 processes each)
after every harness: advisory_locks = 0   idle_in_transaction = 0
```

### 4.7 P1, branch by branch, against the real function

I drove `maybeAlertOnFailedUnlock` into each of the five states the catch block can reach and
compared what was returned with what was written.

```
CONTENTION (advisory lock held by another connection)
  returned : {"sent":false,"recordedAs":"workspace_unlock_alert_abandoned", ...}
  row      : [workspace_unlock_alert_abandoned] '... stood down under contention ...'
  consistent? YES
PRE-SEND FAILURE (a handle that cannot hold a transaction)
  returned : {"sent":false,"recordedAs":"workspace_unlock_alert_error", ...}
  row      : [workspace_unlock_alert_error] '... and NO send was attempted ...'   consistent? YES
SEND THROWS (claim taken)
  returned : {"sent":false,"recordedAs":"workspace_unlock_alert_failed", ...}
  row      : [workspace_unlock_alert_failed] '... FAILED to send ...'             consistent? YES
SEND OK, OUTCOME UPDATE FAILS  (finding N1)
  returned : {"sent":true,"recordedAs":"workspace_unlock_alert_sent", ...}
  row      : [workspace_unlock_alert_sent] '... DELIVERED ..., but recording the outcome failed'
                                                                                 consistent? YES
CONTENTION *AND* THE RECORDING INSERT ALSO FAILS
  returned : {"sent":false,"recordedAs":"workspace_unlock_alert_abandoned", ...}
  rows     : []                                                        consistent? *** NO ***
```

Four of five are right, both `ALERT_ERROR_EVENT` and `ALERT_FAILED_EVENT` remain reachable, and
no combination records a delivered notice as abandoned or contention as delivered. The fifth is
finding Q4.

**The mutation test that mattered.** I reapplied the ninth review's mutation at the frozen head —
contention recording itself as a DELIVERED notice — and ran the file:

```
    not ok 21 - contention is recorded as contention, and buys no backoff
# pass 30  # fail 2
```

It goes red. And the new test against the pre-P module:

```
$ cd /tmp/rev10/prev9   # 1710179, with the frozen head's test file
    not ok 21 - contention is recorded as contention, and buys no backoff
# pass 30  # fail 2
```

Red against `1710179` exactly as the builder claims. **This test now has teeth. It is the first
time in this chain that a test named for a property has been independently watched to fail on
both the defect it names and a deliberate sabotage of it.**

### 4.8 P3: the threshold window at its edges

```
3 failures aged 29 min   (inside the window)     sent=true   msgs=1
3 failures aged 31 min   (outside)               sent=false  0 failure(s) in the window
2 @ 29 min + 2 @ 31 min  (only 2 count)          sent=false  2 failure(s) in the window
3 @ 29.9 min             (just inside)           sent=true   msgs=1
5 failures dated 5 min in the FUTURE             sent=false  0 failure(s) in the window
```

No burst is missed or double-counted at the edge. The last line is a new exclusion introduced by
the P3 fix; see section 8 for why I record it as a concern and not a finding.

### 4.9 The seed migration, on four database shapes, twice each

```
SHAPE 1 fresh                        pass1 exit=0 index=1              pass2 exit=0 index=1
SHAPE 2 polluted: 3 'tom', 2 'nat',  before: pending=7 abandoned=0 index=0
        2 legacy subject=''          pass1 exit=0 pending=3 abandoned=4 index=1
                                     pass2 exit=0 pending=3 abandoned=4 index=1
SHAPE 3 index present + live claim   pass1 exit=0 pending=1 abandoned=0 index=1
                                     pass2 exit=0 pending=1 abandoned=0 index=1
SHAPE 4 pre-J2: no subject column,   before: subject column present? 0
        no index, 3 legacy claims    pass1 exit=0 pending=1 abandoned=2 index=1 subjectcol=1
                                     pass2 exit=0 pending=1 abandoned=2 index=1 subjectcol=1
```

Correct in every case, and idempotent. The newest claim per account survives, the rest are
retired, and the unique index builds — which is load-bearing, because the seed is the start
command and a failed `CREATE UNIQUE INDEX` crashloops the app on boot.

## 5. What I accepted as reported, and from whom

Everything about Railway (that the passphrase and the snapshot key live only there; that Tom
alone reaches it), everything about staging deployments, the paid live-AI runs, the Drive
authorities, Tom's instructions, and the provenance and classification of the thirty snapshot
records. All of it comes from the builder's session. None of it is verified by me, and after ten
passes none of it is verifiable from inside this project's tooling.

## 6. Findings

### Q1. An anonymous `OPTIONS` request enumerates the workspace's private API route table, with the enable flag OFF, so merging this branch is not inert. Severity: HIGH

**What is claimed.** `CLAUDE.md`: *"Anyone else, INCLUDING a site admin, gets a 404 rather than a
403, because the area's existence is itself operating information."* And, of finding G1: *"It is
now `setNoindex(res)`, called only on the success path... on merge, the public site would have
started announcing the area"* — the defect being closed there. The ninth review's closing section
to Tom: *"With the flag off, the workspace is byte-for-byte indistinguishable from a URL that was
never built — headers and cookies included, across three identities and seven methods — so
**merging remains inert**."* The builder's adversarial suite carries the same claim in its own
comment against G1.

**What I did.** Sent `OPTIONS` to every `/api/workspace/*` path and to fabricated siblings, on
the server started with **no workspace environment variables at all** — production's
configuration if this branch merges.

```
$ # server on :3102, ENABLE_ARRINGTON_AI_WORKSPACE unset, anonymous, no cookies
OPTIONS /api/workspace/unlock                       200 Allow: POST
OPTIONS /api/workspace/lock                         200 Allow: POST
OPTIONS /api/workspace/ask                          200 Allow: POST
OPTIONS /api/workspace/approvals/1/decide           200 Allow: POST
OPTIONS /api/workspace/gaps/1/resolve               200 Allow: POST
OPTIONS /api/workspace/social/engagement/1/replied  200 Allow: POST
OPTIONS /api/workspace/social/request-action        200 Allow: POST
OPTIONS /api/workspace/contacts/sync                200 Allow: POST
OPTIONS /api/workspace/contacts/1/erase             200 Allow: POST

OPTIONS /api/workspace/unlokc                       404
OPTIONS /api/workspace/asky                         404
OPTIONS /api/workspace/records                      404
OPTIONS /api/workspace/brain                        404
OPTIONS /api/workspace/contacts/1/delete            404
OPTIONS /api/workspace/erase                        404
OPTIONS /zzz-never-built-rev10                      404
```

**What happened.** A clean, complete, anonymous oracle over the workspace's private API surface:
nine real endpoints identified, six fabricated ones correctly rejected. It is available with the
flag off, with no credentials, in one request per path.

**Why it happens.** Express's router answers `OPTIONS` from its own route table. In
`Router.prototype.handle`, when the method is `OPTIONS` the router wraps its `done` callback so
that, once its stack is exhausted without a response, it replies `200` with an `Allow` header
listing the methods registered for that path. That happens **before any route's middleware
runs**, so `requireWorkspaceApiAccess` — and `workspaceEnabled()` inside it — never execute.
`server.js` mounts `app.use(workspace.router)` unconditionally, by design, because the enable
flag is supposed to make the mounted code inert.

The page routes are unaffected: they are registered on `app` rather than on the sub-router, so
they fall through to the site's own 404 handler, which is why `OPTIONS /workspace` returns 404
and matches the control. Only the sub-router leaks.

**Why this is not merely Express being Express.** `OPTIONS /api/leads` and `OPTIONS
/api/admin/pages` also answer 200 on this app, and that is harmless: nobody has claimed those
endpoints are secret. The workspace's *entire* design premise, stated in `CLAUDE.md` and
defended across ten reviews, is that its existence is operating information and that every
denial must be indistinguishable from a missing route. That premise is what fails.

**Why this is not pre-existing.** `routes/workspace.js` does not exist on `main`:

```
$ git cat-file -e main:routes/workspace.js && echo YES || echo "NO - not on main"
NO - not on main
```

So merging this branch **adds** the oracle to the live site. "Merging is inert" is false as
written.

**Why the tests did not see it.** `test/workspace/adversarialApi.test.js` compares status, body
and the full header fingerprint against a control — but sends `GET` for pages and `POST` for
APIs, and nothing else. `grep -n "OPTIONS" test/workspace/adversarialApi.test.js` returns
nothing. The suite reported **9 of 9 green** on the same server, in the same minute, on which the
enumeration above succeeded. That is the tenth instance of this chain's governing pattern in its
purest form: the property is asserted, the test is named for it, and the test does not exercise
the condition under which the property fails.

**Why HIGH.** I want the reasoning checkable rather than asserted.

- It is *the same consequence* as G1, which this chain rated HIGH: an anonymous scanner
  separating a real workspace route from a missing one, with the enable flag off, falsifying
  "merging is inert". G1 leaked the page list through one header; this leaks the API list
  through a status code, and the API list is the more informative half — it names a contact
  **erasure** endpoint, an **ask** endpoint and an **unlock** endpoint.
- It requires no credentials, no timing, no repetition: one request per path.
- It is present in the configuration the site would actually run in after a merge.

**Why not STOP.** It discloses existence and shape, not content. It does not open the workspace,
does not return a record, does not weaken any of the three gates, and does not give a
per-record oracle (`/api/workspace/contacts/1/erase` and `/api/workspace/contacts/99999/erase`
answer identically, because the route pattern is what is being matched). Every other method on
every path is byte-identical to a genuine 404.

**Remedy.** Terminate `OPTIONS` on the workspace path prefix through the same denial as every
other method, ahead of the routes, so the router's automatic responder is never reached. I
prototyped it in a worktree and measured it:

```js
// routes/workspace.js, immediately after `const router = express.Router();`
router.use((req, res, next) => {
  if (req.method !== 'OPTIONS') return next();
  return render404(req, res);
});
```

```
$ node probes/denial.js 3103 "PROTOTYPE REMEDY, flag OFF, anonymous"
PROTOTYPE REMEDY, flag OFF, anonymous: 420/420 identical to a genuinely missing page

OPTIONS /api/workspace/ask   -> 404      (was 200 Allow: POST)
OPTIONS /api/leads           -> 200 Allow: POST   (unchanged)
POST    /api/workspace/ask   -> unchanged
GET     /workspace           -> 404      (unchanged)
```

**Two cautions on that prototype, because the remedy must not become the eleventh instance.**
First, `router.use` with no path matches *every* request that reaches the router, so as written
it would also swallow `OPTIONS` for any route mounted **after** `app.use(workspace.router)` in
`server.js`. Nothing is affected today (I checked `/`, `/login`, `/v1.html` and `/sitemap.xml`
against the unpatched server and they are unchanged), but the terminator should be scoped to the
`/api/workspace` prefix rather than left open. Second, and more important: **extend the
adversarial suite's two anonymous checks to sweep every HTTP method against the control**, and
watch the new assertion fail at this frozen head before trusting it. The header comparison
already there is the right shape; it is the method list that was one item short.

---

### Q2. P5 was reported corrected. One of the two inaccuracies it named is still standing, in both places it named. Severity: LOW

**What is claimed.** The P remediation, P5: *"Accepted. **Both** are corrected in place and
marked as corrections, in the eighth-review section where they were written... **The N
remediation carries the same two corrections.**"* And the P remediation's own heading: *"All five
accepted and corrected."*

The ninth review's P5 named exactly two sentences: *"All five corrected"*, and *"Every
authoritative window is now expressed in SQL against `now()`, so one clock decides."*

**What I did.** Read both files at the frozen head, then enumerated every window and comparison
in the module by which clock evaluates it.

```
$ grep -n "one clock\|authoritative window" CLAUDE.md review/workspace-v0.1-n-remediation-*.md
CLAUDE.md:1247:  ... Every authoritative window is now expressed in SQL
CLAUDE.md:1248:  against `now()`, so one clock decides. ...
review/workspace-v0.1-n-remediation-2026-08-31.md:75:  ... so one clock decides. ...
```

```
=== evaluated by the DATABASE clock (SQL now()) ===
500-501  the failure-threshold window            <- moved here by P3, correctly
525-526  the reclaim
585-589  the INSERT guard

=== evaluated by the NODE clock (JS Date arithmetic against DB timestamps) ===
458      the `handled` check in claimAlertSlot
161,165-168  notInTheFuture, x4
175      cooldown          (is a delivered notice recent?)
185      failure backoff   (did a send just fail?)
193      error backoff     (was an attempt just abandoned?)
204      claim lease       (is another attempt in flight?)
```

**What happened.** The builder corrected the N3 sentence (P1's inaccuracy) and added a correction
for P2's stagger claim — and left P3's, which is the one P5 quoted, standing untouched in both
`CLAUDE.md` and the N remediation. Six comparisons remain on the Node clock, including the four
in `decideAlert` that decide whether an alert fires at all. "One clock decides" is not true.

**Why this is small, and why it is still worth writing down.** Behaviourally the residual is now
benign in both directions, and I checked rather than assumed: with the database clock *behind*,
the count is read on the database clock (P3's fix) and the Node-clock comparisons make recorded
events look *older*, which makes the alarm fire sooner — the safe direction for an alarm. With
the database clock *ahead* by more than a minute, `notInTheFuture` discards the gating
timestamps, `decideAlert` says fire, and the SQL INSERT guard — on the database clock — still
refuses a duplicate. **The deafness scenario P3 was raised for is genuinely gone.** So this is
not a live defect; it is a sentence in the project memory that a future session will read and
believe, which is precisely what P5 existed to prevent.

**Remedy.** Either finish the job — express the `handled` check in SQL and derive `decideAlert`'s
ages from a database-supplied `now` — or, cheaper and equally honest, correct the two sentences
to say what is actually true: *the windows that decide whether a burst counts, whether a claim is
stale, and whether a claim may be written are all on the database clock; `decideAlert`'s age
comparisons are on the Node clock, and the residual skew is safe in both directions because X.*
Do not leave "one clock decides" standing.

---

### Q3. The gated-suite drift guard, fifth pass: nine more evasion shapes, including two the ninth review named and one that reads off the guard's own idiom. Severity: LOW

**What is claimed.** The P remediation: *"The guard now captures alias and copy names and looks
for uppercase reads on them, and separately flags `process.env` handed to a function as a bare
argument. **Verified against five shapes**, each planted and watched go red."*

**What I did.** Planted a gated suite at `test/planted.test.js`, one shape at a time, and ran
`test/gatedSuites.test.js` against each. First the builder's five, to be fair to the claim:

```
CAUGHT : const env = process.env; env.X
CAUGHT : const { X: g } = process.env
CAUGHT : const c = { ...process.env }; c.X
CAUGHT : pick(process.env)
CAUGHT : test.skip('p', ...)
```

**All five hold.** Then nine others:

```
CAUGHT     : control: process.env.MY_SECRET_GATE
*** MISSED : const env = process.env;  env['MY_SECRET_GATE']        (bracket read off the alias)
*** MISSED : const a = process.env; const b = a; b.MY_SECRET_GATE   (alias of an alias)
*** MISSED : const { ...rest } = process.env; rest.MY_SECRET_GATE   (rest-destructure)
*** MISSED : process.env?.MY_SECRET_GATE                            (optional chaining)
*** MISSED : require('node:process').env.MY_SECRET_GATE
*** MISSED : const env = process.env; const { MY_SECRET_GATE } = env
*** MISSED : process.env['MY_SECRET' + '_GATE']                     (computed key)
*** MISSED : 'MY_SECRET_GATE' in process.env
*** MISSED : a name that is read AND assigned elsewhere in the file  (the `assigned` exemption)
```

**What happened.** The method did not change. It moved from pattern-matching the gate to
pattern-matching the read, and there are more ways to spell a read than there are patterns.
Two of the shapes here are the ninth review's own C (`rest`-destructure) and D (computed key),
recorded as accepted and not closed; the builder's "spread copy" fix covers
`const c = {...process.env}` but not `const {...rest} = process.env`, which is a different
construct. One shape reads off an alias with brackets, which is the guard's own file's idiom
(`const env = process.env` at line 143) reached one character differently. `DB_ONLY_GATE` at line
40 is still declared and never used, as the ninth pass noted.

**Materiality, stated plainly so this is not read as bigger than it is.** This is not a security
control. It is an honesty control on what `npm test` reports, and it works today because no suite
in the tree uses an aliasing form. Nothing is currently mis-reported: the five gated suites are
declared, and the `[SKIP]` block printed at the end of every run is accurate. The risk is a
*future* gated suite written in one of these forms, silently absent from the report a release
decision reads.

**Remedy — and this is the fifth pass, so the recommendation is to change method rather than add
a tenth pattern.** Invert the obligation, as the ninth review proposed: require **every** file
under `test/` to appear in exactly one of two declared lists, `GATED` or `UNGATED`, and fail on
any file in neither. That is decidable, cannot be defeated by rewriting a read, survives
refactoring, and turns a new gated suite into a one-line classification. Keep the
unconditional-`t.skip` shape check beside it. Delete `DB_ONLY_GATE`. Then verify it the way M4
asked: plant the counter-examples and watch it go red.

If Tom would rather not spend more on this, the honest alternative is to say so in `CLAUDE.md`
and stop describing the guard as verified — the one thing that should not continue is a fifth
round of "verified against N shapes" for a guard that is defeated by a bracket.

---

### Q4. `recordedAs` can still name a row that was never written. P1's remedy had three parts; two were implemented and the third was neither implemented nor declined. Severity: LOW

**What is claimed.** The P remediation: *"P1 (MEDIUM)... Accepted without qualification."* The
ninth review's remedy for P1 was explicitly in three parts, the second being: *"Make `recordedAs`
the value actually written, not the value computed. Assign it after the `UPDATE`/`INSERT`
succeeds, so a caller can never be told about a row that does not exist."*

**What I did.** Drove the function into contention while also breaking the statement that records
the outcome — the case where the inner `catch` at line 728 fires.

```
CONTENTION + THE RECORDING INSERT ALSO FAILS
  console  : "could not record the failure either: INJECTED: the recording insert failed"
  returned : {"sent":false,"recordedAs":"workspace_unlock_alert_abandoned", ...}
  rows written: []
  recordedAs consistent with a real row? *** NO ***
```

**What happened.** `recordedAs: outcomeEvent` is returned from the computed value, outside the
`try` that does the writing, so a caller is told about a row that does not exist. It is the same
shape as the untruth P1 itself corrected, one failure deeper.

**Why LOW and not higher, said plainly.** `recordedAs` has **no production consumer**:

```
$ grep -rn "recordedAs" --include=*.js . | grep -v node_modules | grep -v ^./review/
./test/workspace/unlockAlert.test.js:719
./lib/workspace/unlockAlert.js:738
```

One test reads it, and the only caller — `routes/workspace.js:395` — discards the result. It
takes two consecutive database failures to reach, the console fallback is by design, and the
ninth review recorded a strictly worse sibling of this (register says `pending` while the caller
is told `sent: true`) as a *concern* rather than a finding. I raise it as a finding only because
it was a named, accepted remedy that was neither done nor declined, in a module whose headline
rule is never to describe something as having happened when it did not.

**Remedy.** Two lines: initialise `let recorded = null;` before the inner `try`, set it after the
`UPDATE`/`INSERT` returns, and return `recordedAs: recorded`. Then either extend the contention
test to assert it under a broken recording statement, or say in the remediation that the double
fault is accepted and why. Either is fine; silence is not.

---

## 7. What I re-verified as still closed

| Finding | How I checked it | Result |
|---|---|---|
| F1 (CMS-admin takeover) | seized `tom` via a real `PUT /api/admin/user/2/password` as `nat`; asserted BOTH sessions genuinely authenticate before using them; attacked every page and API; guessed the passphrase at the real endpoint until the limiter tripped; then ran the positive control | stops at the unlock screen; pages 302 there; APIs 404 with no mention of unlocking; **workspace not opened**; the correct passphrase does open it |
| F2 / G1 (denial indistinguishable) | 20 paths x 3 Accept values x 7 methods vs a control path, comparing status, full header set (nonce/cookie/etag-normalised) and body; flag on and off | **396/420** — clean on GET, HEAD, POST, PUT, PATCH, DELETE and on every page path; the 24 failures are all OPTIONS on API routes, which is **Q1** |
| H1 (alert recipient) | set the CMS row `contact.email` to `attacker@evil.example` in the database, then called `alertRecipient()` and `describeAlertConfig()` | not retargeted; returns the constant; takes **0** parameters; the function body contains no `db`, `query` or `content` reference |
| H2 (delivered vs failed) | an unplanned live burst of five refused guesses through the real HTTP endpoint | one alert row for five attempts, typed `alert_failed` because nothing was delivered; attempts 4 and 5 correctly inside the backoff |
| H3 (boot honesty) | boot lines, flag on and off | each gate reported separately, real user ids printed, alarm correctly declared inert (`GMAIL_APP_PASSWORD` unset); with the flag off, one line saying the area does not exist |
| H4 (one activity level) | grep across the tree, then its call sites | one constant (`routes/workspace.js:45`), exactly two call sites (160, 307), one test pinning it; no third surface |
| J2 (subject column, exact match) | the live burst above | `subject` populated exactly on both the failure rows and the alert row; `actor='system'`, `subject='tom'` |
| J3 (pre-send failure recorded) | a handle that cannot hold a transaction, driven through the real entry point; then a lock/transaction sweep after every harness | recorded durably as `alert_error` with honest wording and a matching `recordedAs`; **0 advisory locks, 0 idle-in-transaction** |
| K3 (`decideAlert` live) | call-site count in the deployed module | exactly one call site, inside `claimAlertSlotLocked` |
| K5 (freeze) | `rev-parse` / `status` at start and end; snapshot hash | clean at the frozen head throughout; hash identical to the eighth and ninth reviews' |
| L1 (dedicated connection) | the branch the deployed handle takes | `dedicatedConnectionSource(db/pool)` = `'wrapper'`; a shorthand-only handle is refused and throws |
| L2 (silence) | 860 bursts at the frozen head across three profiles, plus 180 racing processes over 15 rounds, against a control that reproduces the old defect 6 times in 60 | **0 silent, 0 duplicated, 0 worker errors** |
| L3 (secrets) | snapshot hash; `.gitignore` guard; `data/` contents; environment | hash unchanged; `data/*.json` ignored; only the ciphertext present; no snapshot key in this environment; the file was never decrypted |
| M1 (worker close) | 180 worker processes across 15 rounds, counting real errors rather than the literal string `"err"` | 0 worker errors, one winner and one alert row per round |
| M2 / N1 (honest outcome) | five injected failure shapes through the real entry point | an attempt that never reached a send says so; one that reached a send and succeeded is recorded **delivered** and starts the hour; one that reached a send and failed earns the short backoff |
| N4 (future-dated claim) | planted a claim 30 minutes ahead, ran a threshold burst | reclaimed as `abandoned`, not trusted; the alarm fires; rows `[abandoned, sent]` |
| P1 (contention) | four live branches plus the ninth review's DELIVERED mutation, and the new test against `1710179` | contention records as `abandoned`, gates nothing, `recordedAs` matches the row, the next genuine burst fires; **the mutation now turns the suite red** |
| P2 (test sensitivity) | 60 rounds of the committed profile against `39812ac` with the index dropped, and 60 of the old profile against the same code | new profile **6 duplicates in 60**; old profile **0 in 60**; and 860 rounds + 12 full test-file runs at the frozen head with **no flake** |
| P3 (threshold window) | five window-edge cases plus injected clocks | correct at both edges; no burst missed or double-counted |
| P4 (drift guard) | the builder's five claimed shapes, planted one at a time | **all five genuinely caught** (nine others are not — Q3) |
| Unlock rotation | unlocked a session, restarted with a rotated passphrase (new PID confirmed), re-used the same cookie | login survives (200), unlock does not (302 to `/workspace/unlock`) |
| Seed migration | four database shapes, twice each, shelling out to the real `node db/seed.js` | exit 0 every time; newest claim per account kept, the rest retired; index built |

## 8. Concerns I could not turn into findings

- **The P remediation's headline test figure does not reproduce.** It states *"Full suite: 552
  tests, 550 pass, 0 fail, 2 skipped."* At the frozen head, twice, with the documented
  invocation, I get **538 / 536 / 0 / 2**. Identical skip count, 14 tests fewer. I cannot rule
  out an environment difference on the builder's side, and nothing is broken either way — the
  suite is green. I record it because this chain's specific failure mode is a stated figure that
  nobody re-derives, and 538 is what the ninth review recorded at the previous head too.
- **P2's second measurement does not reproduce either.** The builder reports *"60 rounds against
  two defective predecessors break **8 times and 4 times**."* I reproduce the first
  (6/60 against `39812ac`, same order of magnitude) but not the second: `6226673` with the index
  dropped ran **0 duplicates in 240 rounds** across four runs. At a claimed rate of 4-in-60 that
  outcome has probability about 5e-8, so it is not variance — either their second control was a
  different commit, or the measurement was of something else. **P2's substance stands regardless**
  (the profile change is what matters, and it demonstrably works), so this is a note about
  evidence discipline, not about the fix.
- **The P3 fix introduced a new silencing condition, in the same family as the one it removed.**
  The rewritten window adds `AND created_at <= now() + interval '1 minute'`, which the old
  Node-clock version did not have. Five failure rows dated five minutes ahead now produce *"0
  failure(s) in the window"* — I measured that. It is unreachable from the application's own
  writes (`created_at DEFAULT NOW()` on the same database, so a row can never be ahead of that
  database's `now()`), and the only trigger I can construct is a backwards step of the Postgres
  host clock. I did not observe it and cannot induce it, so it is a concern; but for an alarm the
  safe direction is to notify, and this clause chose the opposite.
- **The `now` parameter is now honoured by three of its five consumers.** After P3 an injected
  `now` drives `decideAlert` and the `handled` check but not the failure window, the reclaim or
  the INSERT guard. I verified no committed test injects a fabricated `now` into
  `maybeAlertOnFailedUnlock`, so nothing is currently wrong — but a future test that does will
  silently measure a mixed clock. I hit it myself and had to rewrite a probe.
- **A double database failure can still leave the register saying `pending` while the caller is
  told `sent: true`.** Raised by the ninth review, unchanged. Related to Q4 but distinct.
- **A duplicate is still possible if a send outlives the three-minute claim lease.** Documented
  and deliberate. The accepted case, not the eliminated one.
- **A legacy database keeps one permanently unresolved claim.** Seed shapes 2 and 4 both end with
  a surviving `pending` row whose `subject` is `''`; the runtime reclaim matches
  `subject = $2` with a real username, so nothing will ever retire it. Raised by the eighth and
  ninth reviews, unchanged. A `WHERE subject <> ''` on the retirement would tidy it.
- **`decideAlert`'s default parameter still references `CLAIM_LEASE_MINUTES`, declared 99 lines
  later.** Unchanged for a fifth pass. Safe only because defaults evaluate at call time.
- **The `handled` list in `claimAlertSlot` still omits `ALERT_ERROR_EVENT` and
  `ALERT_ABANDONED_EVENT`**, so a loser that exhausts after a winner errored adds a second row.
  Noise rather than harm.
- **A non-GET request with a missing or bad CSRF token returns 500 rather than 403**, on
  workspace paths and on the control alike. Pre-existing and not a disclosure, but it cost me a
  probe, and it is what a workspace API POST answers before any workspace code runs.
- **No live alert email has ever been delivered.** The builder says so plainly, which is right.
  The last hop of this control remains untested by anyone, on ten passes.
- **The in-memory unlock attempt budget still resets on any restart** (G6, disclosed and
  unchanged). I relied on it myself across several restarts; a patient attacker can too.
- **Leftover state on this machine from earlier passes.** Databases `ws_test`, `ws_final`,
  `ws_fresh`, `ws_fresh2` and two unrelated `git worktree`s under `/tmp` (`wt-portal`,
  `wt-social`) are not mine and I left them. Worth a sweep by whoever owns the sandbox.
- **Who holds Railway.** F1's closure, H1's remedy and the whole third gate rest on Railway being
  reachable only by Tom. Ten passes, no reviewer has seen it.
- **Ten passes, ten instances, and where the eleventh will be.** The rules proposed by my
  predecessors are good and, applied, would have caught most of these: *a fix whose whole content
  is a new branch must be executed once with the input that reaches that branch*; *every asserted
  security property must name the test that establishes it, and that test must exercise the real
  function under the conditions the property claims to hold*. Q1 obeys neither rule's letter and
  breaks their spirit, because the property it violates was never anybody's *fix* — it was the
  premise. So the rule I would add is about premises rather than fixes: **when a property is
  stated as a universal — "every method", "any request", "byte-identical" — the test must
  enumerate the universe, not a sample of it.** The adversarial suite tested two methods and the
  claim said seven. Ten passes read that claim and none counted.

## 9. What remains for Tom Arrington

1. **The gates hold, and after ten independent attempts that sentence has as much weight as this
   process can give it.** Nobody has opened this area or leaked a record from it. Holding your
   CMS admin account and resetting your password still gets an attacker to a locked screen and no
   further, and I proved both halves: the attack stops, and the correct passphrase opens it.
   Rotating the passphrase closes an open session immediately while leaving the login intact.
2. **The failed-unlock alarm is, as far as ten passes can establish, correct.** The P cycle's
   fixes are real, and this is the first pass in which a test named for a property has been
   independently watched to fail on both the original defect and a deliberate sabotage. 860
   threshold bursts and 180 racing processes produced exactly one notice every time, with no
   flake, while the same instrument breaks the previous version. That chapter is closed.
3. **What is not closed is Q1, and it is worth understanding what it is and is not.** It does not
   open the workspace and it does not leak a record. What it does is tell an anonymous stranger
   that your site has a private workspace, and name nine of its endpoints — including a contact
   *erasure* endpoint — with the feature switched off. The claim in your project memory that
   merging this branch is inert is not true as written, and it was not true at any point in the
   last ten reviews. **The fix is a few lines; I wrote and measured it. The more important half of
   the fix is the test**, because the reason this survived ten passes is that the suite asserting
   "indistinguishable from a route that does not exist" only ever sent two of the seven methods.
4. **Q2, Q3 and Q4 are tidy-ups and should ride along.** None of them changes what an attacker can
   do. Q2 is a sentence in `CLAUDE.md` that a future session will believe; Q4 is a two-line
   honesty fix in the alarm; Q3 is the fifth pass of a guard that is not a security control and
   which I would either rebuild once, properly, or stop describing as verified.
5. **Do the secret rotation.** Still yours and still outstanding: `WORKSPACE_ACCESS_PASSPHRASE`,
   `WORKSPACE_SNAPSHOT_KEY`, then `SESSION_SECRET` (which invalidates every CRM erasure
   tombstone, by design) and the account passwords.
6. **Why this is AMBER and not PASS, said plainly, because you should be able to check my
   reasoning.** I did not withhold a PASS out of deference to nine predecessors. I went looking
   hard for reasons to award one, and almost everything I attacked held — the gates, the alarm,
   the concurrency guarantee, the seed migration, and all four of the P-cycle corrections. I
   withheld it for one reason and it is a fact rather than a judgement: with the feature switched
   off, an unauthenticated request enumerates the workspace's API, and the document you are meant
   to trust says that cannot happen. It is one `curl`, it takes one line to fix, and it is graded
   HIGH only because this chain already graded the identical consequence HIGH when it appeared in
   a header instead of a status code.
7. **Why this is not STOP.** Nothing found gives anyone access, content, or a way past a gate. If
   Q1 is fixed and its test extended to every method, I see no reason this candidate should not
   reach a green verdict on the next pass — and I would say that to a reviewer who asked me,
   which is not something the previous nine reports could say.
8. **What still cannot be verified from inside this project's tooling** after ten passes: the
   Drive authorities, the provenance and classification of the thirty snapshot records, your own
   instructions except as quoted by the builder, and everything about Railway. Ten independent
   passes have not moved any of those an inch, and an eleventh will not either. If you want them
   certified it needs a reviewer with Drive and Railway access and, on the evidence of ten
   passes, one not commissioned by the session whose work is being reviewed.

---

Nothing in this review was merged, deployed, connected, spent or enabled. The paid live-AI suites
were not run. My writes were confined to eleven throwaway databases — `ws_r10`, `ws_r10_mut`,
`ws_r10_mut2`, `ws_r10_p9`, `ws_r10_prev`, `ws_r10_prev2`, `ws_s1`, `ws_s2`, `ws_s3`, `ws_s4` and
their clones — created from nothing and dropped at the end; within `ws_r10` I reset the local
`tom` password through the application's own API, briefly poisoned and then restored the CMS
`contact.email` row, and created `workspace_activity` rows for my probes, before dropping the
database entirely. Every experiment needing a code change was done in `git worktree`s under
`/tmp`, which have been removed, and both the P1 mutation and the Q1 remedy prototype existed
only inside them. All three servers I started have been stopped.
`data/workspace-snapshot.enc` is unchanged and was never decrypted. The reviewed branch is left
at `09cd35e6c8bc99a9b0aeaf24a350975ed130c6ab` with a clean tree.
