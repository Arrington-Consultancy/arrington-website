# Arrington AI Workspace v0.1: Independent Governance & Assurance Review (eleventh pass)

Date: 31 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, frozen head
`ebac5f6775e68237c4391ab8ff78ce93d47559bf`.
Baselines: the ten previous reviews (F1-F10, G1-G9, H1-H7, J1-J4, K1-K5, L1-L5, M1-M5,
N1-N5, P1-P5, Q1-Q4, **all AMBER**) and the builder's ten responses, the most recent being
`review/workspace-v0.1-q-remediation-2026-08-31.md`.

```
$ git rev-parse HEAD
ebac5f6775e68237c4391ab8ff78ce93d47559bf
$ git status --porcelain
(empty)
$ sha256sum data/workspace-snapshot.enc
e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2
```

The tree stayed frozen and clean throughout, and the snapshot hash is byte-identical to the
value the eighth, ninth and tenth reviews recorded. K5's remedy has now held six passes running.
Every experiment needing a code change ran in a `git worktree` under `/tmp`; every write went to
throwaway databases created from nothing and dropped at the end. This report is committed on a
separate branch.

## 1. The bounded question

Ten consecutive reviews found the same class of defect: a security property asserted and not
held. My predecessor's Q1 was the purest instance yet — an anonymous `OPTIONS` request
enumerating the whole workspace API **with the enable flag off**, surviving ten passes because
every probe anyone had written sent GET or POST.

So: is the Q cycle correct? Are the closures from F through Q still closed under probes of my
own construction? And is the Q1 remedy itself sound, or is it the eleventh instance?

Nothing more. This review does not authorise a merge, a deploy, an environment variable change,
a spend, or the connection of any external account, and it did none of those things.

## 2. VERDICT: AMBER

**AMBER. One HIGH, one LOW.**

**The HIGH is that Q1 is not fixed.** `refuseUnroutedMethods` matches the workspace path with a
**case-sensitive** regular expression, while Express's router — with this app's settings — matches
routes **case-insensitively**. One capital letter walks straight past the guard and the entire Q1
oracle is back, unchanged:

```
$ # server with NO workspace environment variables at all, anonymous, no cookies
OPTIONS /api/workspace/ask   -> 404                 <- the guard, working
OPTIONS /API/workspace/ask   -> 200  Allow: POST    <- the guard, bypassed
OPTIONS /API/workspace/notreal -> 404               <- and it still discriminates
```

All nine real endpoints are identified and all six fabricated siblings correctly rejected,
exactly as in my predecessor's table, anonymously, in the configuration production would run in
after a merge. The claim in `CLAUDE.md` line 958 and in `lib/workspace/access.js`'s own header
that **"merging is inert"** remains false as written, for the eleventh review running.

**Q2 and Q4 are genuinely fixed.** I drove Q4's double-fault into the real function and got
`recordedAs: null` against zero written rows; Q2's wording is now precise in all three places,
and I checked the substance behind it rather than the sentence — the authoritative conditional
INSERT does gate all four windows in SQL.

**Q3 is corrected in method but overclaims, and it lost coverage the version it replaced had.**
That is finding R2 and it is LOW.

**Everything else I attacked held.** All three gates under a full CMS-admin takeover, with the
positive control; passphrase rotation; the failed-unlock alarm end to end out of a real burst;
the concurrency guarantee across 120 racing OS processes; the seed migration on four database
shapes twice each; and the P-cycle fixes, including watching the ninth review's mutation turn the
suite red. **Nothing found opens the workspace, leaks a record, defeats a gate, or stops the
alarm firing.** R1 is disclosure of existence and shape, not of content — but it is the same
consequence this chain graded HIGH as G1 and again as Q1, so it gets the same grade.

## 3. Independence, and its limits

I am a separate session from the technical builder. I wrote none of the workspace code and
accepted no claim I could test myself. The four limits recorded by every previous pass stand
unchanged:

1. **I am a Claude agent, commissioned by the builder's own session, reviewing the builder's
   work.** Structural, and uncured by my having found something.
2. **No network access to Railway or the live site.** Everything about production and staging
   variables, deployments and the paid live-AI runs is reported to me, not verified by me.
3. **No Google Drive access.** The controlled authorities and Tom's instructions reach me only as
   transcribed by the party they constrain.
4. **No real browser.** I drove the application over HTTP and inspected status, headers, bodies
   and cookies. I did not render a page.

The paid live-AI suites were **not run**: they spend money and I was instructed not to. They are
not evidence in this pass. The Scott adversarial suite was not run either.

## 4. What I did, with observed results

Environment: local Postgres 16; throwaway databases `ws_r11`, `ws_s1`, `ws_s2`, `ws_s3`, `ws_s4`,
all created from nothing and dropped at the end; servers on 3201 (workspace armed), 3202 (no
workspace variables at all) and 3203 (a prototype of R1's remedy); `git worktree`s at
`/tmp/rev11/wt` (frozen head, used for the mutation and the remedy prototype) and `/tmp/rev11/prev`
(`09cd35e`, used as a control for R2).

### 4.1 The regression suite

```
$ env -u NAT_PASSWORD -u TOM_PASSWORD DATABASE_URL=... SESSION_SECRET=... npm test
# tests 538   # suites 53   # pass 536   # fail 0   # skipped 2
EXIT=0

  ================================================================
  5 SUITE(S) DID NOT RUN. The counts above do not cover them.
  ----------------------------------------------------------------
  [SKIP] adversarial: real session and API path
  [SKIP] LIVE AI pressure suite (spends money)
  [SKIP] two-pass seed
  [SKIP] adversarial workspace checks
  [SKIP] workspace live AI pressure
  ----------------------------------------------------------------
```

Green. **This reproduces the builder's stated figure exactly** (538 / 536 / 0 / 2), which the
tenth review could not reconcile with the ninth remediation's claimed 552. The Q3 runner's
`[SKIP]` block is accurate: all five gated suites are named, and the block is strictly more
honest than Node's own `# skipped 2`.

### 4.2 The builder's adversarial suite, against a freshly restarted armed server

```
    ok 1 - an anonymous visitor gets an ordinary 404, not a login redirect
    ok 2 - an anonymous workspace API call looks like a call to a route that does not exist
    ok 3 - every method is refused the same way, not just GET and POST
    ok 4 - a logged-in site admin who is not Tom sees nothing, and is told nothing
    ok 5 - Tom can authenticate, so every check below means something
    ok 6 - a logged-in cleared session reaches nothing until it presents the passphrase
    ok 7 - a wrong passphrase is refused, it is recorded, and the session stays locked
    ok 8 - the right passphrase opens it, and every page is noindex
    ok 9 - erasure refuses a mismatched confirmation even for Tom
# tests 10   # pass 10   # fail 0   # skipped 0
```

Ten of ten, all executed, nothing NOT EXECUTABLE — **including the new case 3, written for Q1**.
Then, on the same server, in the same minute:

```
$ date -u +"%H:%M:%SZ"
12:22:50Z
OPTIONS /API/workspace/ask              -> HTTP/1.1 200 OK
OPTIONS /API/workspace/contacts/1/erase -> HTTP/1.1 200 OK
OPTIONS /API/workspace/unlock           -> HTTP/1.1 200 OK
OPTIONS /API/workspace/notreal          -> HTTP/1.1 404 Not Found
```

That is finding R1, and the sentence my predecessor wrote about Q1 applies to it verbatim one
cycle later: the suite reported green on the very server on which an anonymous request enumerated
the whole workspace API.

### 4.3 Denials versus a genuinely missing page (F2 / G1 / Q1), 420 comparisons

14 workspace paths, each in every distinct spelling of itself (canonical, `/API/`,
`/api/WORKSPACE/`, mixed case, fully upper - five for the nine API paths, three for the five page
paths, which have no `/api/` segment to vary), against a control path that was never built,
comparing status, the **full header set** and the body, with the per-request nonce, cookies and
etag normalised, across seven HTTP methods. That is (9 x 5 + 5 x 3) x 7 = 420 comparisons.

```
FLAG ON,  anonymous : 384/420 identical to a genuinely missing page
FLAG OFF, anonymous : 384/420 identical to a genuinely missing page
```

**The 36 failures are all the same thing.** Every one is `OPTIONS` against one of the nine
`/api/workspace/*` routes in one of its four **case-varied** spellings — 9 x 4 = 36. The canonical
lowercase spelling is clean, which is what the builder measured; every page path is clean in every
spelling and every method; GET, HEAD, POST, PUT, PATCH and DELETE are clean everywhere.

With the one-character remedy in section 6 applied: **420/420, both flag states.**

### 4.4 The gates, attacked

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
6. "password" -> 401  "letmein" -> 401  "arrington" -> 401  "workspace" -> 401  "tom" -> 401
   "sixth"    -> 429 {"error":"Too many attempts. Wait fifteen minutes."}
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

Those five refused guesses gave an unplanned live end-to-end run of the alarm, straight out of the
real database:

```
 182 | workspace_unlock_failed       | tom    | tom | A workspace unlock attempt was refused...
 181 | workspace_unlock_failed       | tom    | tom | ...
 180 | workspace_unlock_alert_failed | system | tom | Security notice FAILED to send after 3
                                                      failed unlock attempt(s) against "tom"...
 179 | workspace_unlock_failed       | tom    | tom | ...
 178 | workspace_unlock_failed       | tom    | tom | ...
 177 | workspace_unlock_failed       | tom    | tom | ...
```

Threshold reached at three, exactly one alert row for five attempts, the undelivered notice
correctly typed `alert_failed` rather than `alert_sent` (H2), `subject` and `actor` populated
exactly (J2), attempts four and five correctly inside the five-minute backoff.

### 4.5 Passphrase rotation invalidates an open unlock

```
baseline, unlocked session: /workspace -> 200
[server restarted with WORKSPACE_ACCESS_PASSPHRASE rotated; old pid 881, new pid 941]
session still logged in as tom?  /api/admin/pages -> 200   <- the login survived
previously-unlocked session:     /workspace       -> 302 -> /workspace/unlock
```

### 4.6 Concurrency: 120 racing OS processes

Twelve independent OS processes per round, all released at a shared instant, across ten rounds,
against a burst already over threshold:

```
round 1..10: alertRows=1
SUMMARY rounds=10 burst=12 duplicated=0 silent=0 workerErrors=0
advisory_locks=0  idle_in_txn=0
```

Exactly one alert row every round, zero worker errors, zero leaked advisory locks, zero
connections left idle in transaction. The committed test file ran clean three times consecutively
(`# pass 32 # fail 0` each), so P2's randomised profile still shows no flake.

### 4.7 P1 still has teeth

I reapplied the ninth review's mutation at the frozen head — contention recording itself as a
DELIVERED notice — and ran the file:

```
    not ok 21 - contention is recorded as contention, and buys no backoff
# pass 30  # fail 2
```

### 4.8 Q4, driven into the double fault

Contention forced by holding the advisory lock from a separate connection for the whole call,
**and** the outcome-recording statement made to throw:

```
console  : "could not record the failure either: INJECTED: the recording insert failed"
returned : {"sent":false,"recordedAs":null, ...}
rows written: []
recordedAs consistent with a real row? YES
```

Fixed. `recordedAs` has no production consumer (`routes/workspace.js` discards the result), so
`null` breaks nothing; one test reads it and it asserts the abandonment case, which still returns
a real event name.

### 4.9 P3: the threshold window at its edges

```
3 failures aged 29 min   (inside)    sent=true  alertRows=1
3 failures aged 31 min   (outside)   sent=false 0 failure(s) in the window
2 @ 29 min + 2 @ 31 min  (2 count)   sent=false 2 failure(s) in the window
3 @ 29.9 min             (just in)   sent=true  alertRows=1
5 failures dated 5 min in the FUTURE  sent=false 0 failure(s) in the window
```

Correct at both edges. The last line is the exclusion my predecessor recorded as a concern; it
behaves as they described and I record it the same way, in section 8.

### 4.10 The seed migration, on four database shapes, twice each

```
SHAPE 1 fresh                        pass1 exit=0  0 pending, 0 abandoned, index=1
                                     pass2 exit=0  0 pending, 0 abandoned, index=1
SHAPE 2 polluted: 3 'tom', 2 'nat',  before: 7 pending, 0 abandoned, index=0
        2 legacy subject=''          pass1 exit=0  3 pending, 4 abandoned, index=1
                                     pass2 exit=0  3 pending, 4 abandoned, index=1
                                     survivors: tom=1, nat=1, ''=1
SHAPE 3 index present + live claim   pass1 exit=0  1 pending, 0 abandoned, index=1
                                     pass2 exit=0  1 pending, 0 abandoned, index=1
SHAPE 4 pre-J2: no subject column,   before: subject column present? 0
        no index, 3 legacy claims    pass1 exit=0  1 pending, 2 abandoned, index=1, subjectcol=1
                                     pass2 exit=0  1 pending, 2 abandoned, index=1, subjectcol=1
```

Correct in every case, and idempotent. The newest claim per account survives, the rest are
retired, and the unique index builds — which is load-bearing, because the seed is the start
command and a failed `CREATE UNIQUE INDEX` crashloops the app on boot.

## 5. What I accepted as reported, and from whom

Everything about Railway (that the passphrase and the snapshot key live only there; that Tom alone
reaches it), everything about staging deployments, the paid live-AI runs, the Drive authorities,
Tom's instructions, and the provenance and classification of the thirty snapshot records. All of
it comes from the builder's session. None of it is verified by me, and after eleven passes none of
it is verifiable from inside this project's tooling.

## 6. Findings

### R1. Q1's guard is case-sensitive and Express's routing is not, so one capital letter restores the full anonymous enumeration oracle, with the enable flag OFF. Severity: HIGH

**What is claimed.** The Q remediation: *"`refuseUnroutedMethods` ... registered as the first thing
on the router and the first thing in `mountPageRoute` ... **Measured, both flag states, anonymous:
65 of 65** combinations of method (OPTIONS, PUT, DELETE, PATCH, TRACE) across nine real workspace
paths and four fabricated ones are now **byte-identical to a genuinely missing path**, headers and
body included."* `CLAUDE.md` repeats the 65/65 figure and restores, at line 958, the claim this
whole finding class is about: *"That is why the code can sit on main harmlessly: **merging is
inert**, and switching it on is a separate deliberate act."* `lib/workspace/access.js`'s own header
says the same.

**What I did.** Read the guard, noticed the mismatch between the two matchers, and tested it.

```js
// lib/workspace/access.js:172
const WORKSPACE_PATH = /^\/(workspace|api\/workspace)(\/|$)/;     // case-SENSITIVE
```

`server.js` never sets `case sensitive routing`, so Express's default applies: **route matching is
case-insensitive.** The router therefore matches `/API/workspace/ask` to the route
`/api/workspace/ask`, while `WORKSPACE_PATH.test('/API/workspace/ask')` is `false`, so
`refuseUnroutedMethods` calls `next()` and Express's automatic OPTIONS responder answers from the
route table exactly as it did before Q1 was raised.

**What happened.** On a server started with **no workspace environment variables at all** —
production's configuration if this branch merges — anonymously, with no cookies:

```
OPTIONS /API/workspace/unlock                          -> 200  Allow: POST
OPTIONS /API/workspace/lock                            -> 200  Allow: POST
OPTIONS /API/workspace/ask                             -> 200  Allow: POST
OPTIONS /API/workspace/approvals/1/decide              -> 200  Allow: POST
OPTIONS /API/workspace/gaps/1/resolve                  -> 200  Allow: POST
OPTIONS /API/workspace/social/engagement/1/replied     -> 200  Allow: POST
OPTIONS /API/workspace/social/request-action           -> 200  Allow: POST
OPTIONS /API/workspace/contacts/sync                   -> 200  Allow: POST
OPTIONS /API/workspace/contacts/1/erase                -> 200  Allow: POST

OPTIONS /API/workspace/unlokc                          -> 404
OPTIONS /API/workspace/asky                            -> 404
OPTIONS /API/workspace/records                         -> 404
OPTIONS /API/workspace/brain                           -> 404
OPTIONS /API/workspace/erase                           -> 404
OPTIONS /API/workspace/contacts/1/delete               -> 404
OPTIONS /API/NOTREAL/ask                               -> 404
```

That is Q1's table, reproduced line for line. Nine real endpoints identified — including the
contact **erasure** endpoint, the **ask** endpoint and the **unlock** endpoint — and six fabricated
siblings correctly rejected. It works in both flag states, in four different spellings
(`/API/...`, `/api/WORKSPACE/...`, `/api/Workspace/...`, fully upper), and it needs no
credentials, no timing and no repetition.

Every other spelling-shaped evasion I tried is correctly refused, which is worth recording because
it isolates the defect precisely to case:

```
OPTIONS /api/workspace/ask/            -> 404      OPTIONS /x/../api/workspace/ask -> 404
OPTIONS //api/workspace/ask            -> 404      OPTIONS /%61pi/workspace/ask    -> 404
OPTIONS /api//workspace/ask            -> 404      OPTIONS /api/%77orkspace/ask    -> 404
OPTIONS /api/workspace//ask            -> 404      OPTIONS /api/workspace/%61sk    -> 404
```

`X-HTTP-Method-Override` is inert (no `method-override` middleware is installed). `PUT`, `DELETE`,
`PATCH` and `TRACE` return 500 from the site's CSRF middleware **on the workspace paths and on the
control alike**, so they disclose nothing — that is the pre-existing concern my predecessor
recorded, not a second leak.

**Why the tests did not see it.** The new case in the adversarial suite sweeps four methods, which
was the right correction, but iterates `APIS.map(([path]) => path)` — the canonical lowercase
spellings only. It reported **10 of 10 green** on the same server, in the same minute, on which the
enumeration above succeeded. This is the eleventh instance of the governing pattern and the
second consecutive one introduced by the fix for its predecessor: my predecessor's closing rule was
*"when a property is stated as a universal — 'every method', 'any request', 'byte-identical' — the
test must enumerate the universe, not a sample of it."* The builder enumerated the **method**
universe and then sampled the **path-spelling** universe, in a framework that treats two spellings
as one path.

**Why HIGH.** It is not merely the same class as Q1; it is the same defect, in the same
configuration, with the same consequence and the same reach. This chain graded that HIGH twice
(G1, Q1). Grading it lower now, because the remedy is smaller, would be grading the fix rather than
the exposure.

**Why not STOP.** As with Q1: it discloses existence and shape, not content. It does not open the
workspace, return a record, weaken any of the three gates, or give a per-record oracle
(`/API/workspace/contacts/1/erase` and `/API/workspace/contacts/99999/erase` answer identically).
The gates all held under direct attack in section 4.4.

**Remedy.** One character on line 172:

```js
const WORKSPACE_PATH = /^\/(workspace|api\/workspace)(\/|$)/i;
```

Prototyped in a worktree and measured:

```
$ node probes/denial.js 3203 "PROTOTYPE (case-insensitive regex), FLAG OFF, anonymous"
PROTOTYPE (case-insensitive regex), FLAG OFF, anonymous: 420/420 identical to a genuinely missing path

GET /             -> 200   OPTIONS -> 404      (unchanged)
GET /health       -> 200   OPTIONS -> 404      (unchanged)
GET /login        -> 200   OPTIONS -> 200      (unchanged)
GET /api/leads    -> 404   OPTIONS -> 200      (unchanged)
GET /sitemap.xml  -> 200   OPTIONS -> 404      (unchanged)
```

No non-workspace route changes behaviour, and the trailing `(\/|$)` means a public slug such as
`/workspace-audit` is still untouched.

**The more important half of the remedy is the test, and it must not be another sample.** Make the
adversarial case iterate spellings as well as methods — at minimum the canonical path, an
upper-cased path segment and a fully upper-cased path — and **watch the new assertion fail at this
frozen head before trusting it.** Better still, stop hand-listing the paths: derive them from the
router's own stack so a route added later cannot be omitted from the sweep by nobody remembering
to add it.

**A general point worth carrying past this finding.** The guard's correctness depends on a
framework default that is written down nowhere in this codebase. If `case sensitive routing` is
ever enabled, or Express changes its default, the `/i` becomes harmless; if some future guard is
written the same way, it will be wrong again. Either set `app.set('case sensitive routing', true)`
explicitly and pin it with a test, or state the dependency beside the regex. I checked the other
three places in this codebase that make a security-relevant decision from `req.path` —
`GOOGLE_PREFILL_PATHS` (server.js:245) and the `/health` exemption from the canonical-host rewrite
(server.js:127), plus the `/workspace/unlock` exception at access.js:114 — and **all three fail
closed** under case variation, so this is the only one that fails open. That is worth knowing
rather than assuming.

---

### R2. Q3 says "there is no shape left to evade". Two shapes evade it, both of them caught by the guard it replaced, and the file's own header still describes a check that has been deleted. Severity: LOW

**What is claimed.** The Q remediation: *"So it no longer reads source ... A skip appears there
whatever the source looks like, **so there is no shape left to evade**."* `CLAUDE.md` repeats it
word for word. And `test/gatedSuites.test.js`'s own header, at the frozen head, still says: *"**It
also fails if a NEW gated suite appears without being listed here**, so the honest summary cannot
quietly fall behind the test tree."*

**What I did.** First, granted the claim its strongest form: the runner is a real improvement, it
preserves the exit code, and its `[SKIP]` block is more honest than Node's counter. I verified all
three.

```
$ node scripts/runTests.js probe/a.test.js probe/b.test.js     # one pass, one deliberate failure
EXIT=1        # tests 2  # pass 1  # fail 1
$ node scripts/runTests.js probe/f.test.js                     # a file that throws on load
EXIT=1        # fail 1                                          <- surfaces as a failure, not silence
```

Then I planted the two shapes that produce no `# SKIP` directive at all, one at a time:

```
probe/c.test.js:  if (process.env.SOME_GATE_R11) { test('gated body', () => {}); }
    EXIT=0  # tests 1  # pass 1  # skipped 0
    "Every suite ran. Nothing was skipped."                     <- *** MISSED

probe/d.test.js:  test('gated by early return', () => { if (!process.env.SOME_GATE_R11) return; ... });
    EXIT=0  # tests 1  # pass 1  # skipped 0
    "Every suite ran. Nothing was skipped."                     <- *** MISSED, and reported as a PASS
```

Neither emits a directive, because in neither case does the runner ever skip anything: one never
registers a test, and the other registers a test that genuinely passes by doing nothing. **Both are
ordinary ways to gate a suite, and both were caught by the version this replaced.** Same two files,
against `09cd35e`:

```
$ cd /tmp/rev11/prev && node --test test/gatedSuites.test.js
not ok 1 - the suites that can decline to run are all declared
    these suites can skip but are not declared in GATED, so a run that omits them would report
    nothing: probe/c.test.js (reads SOME_GATE_R11), probe/d.test.js (reads SOME_GATE_R11)
```

Against the frozen head the same two files produce `ok 1 - every declared gated suite still exists`.

There is also a false positive in the other direction. A test whose **name** contains `# SKIP` is
reported as a suite that did not run, with its name mangled, because Node escapes `#` as `\#` in
TAP and the runner's regex consumes the backslash into the name:

```
probe/e.test.js:  test('a name containing # SKIP not really', () => {});
    EXIT=0  # pass 1  # skipped 0
    1 SUITE(S) DID NOT RUN.   [SKIP] a name containing \
                                     not really
```

Contrived, and I record it only because this is an honesty control: it can now say a suite did not
run when it did, as well as the reverse.

**Materiality, stated plainly so this is not read as bigger than it is.** This is not a security
control, and nothing is currently mis-reported: all five real gated suites use `t.skip`-shaped
gates, all five appear in the block, and I confirmed the block against a real run. The exposure is
a **future** gated suite written in one of these two forms, absent from the report a release
decision reads — which is exactly the risk the deleted check existed to cover, and the reason five
reviews kept pushing on it.

**Why it is a finding rather than a concern.** The new method is better than the old one and I
would keep it. But it was presented as strictly superior — *"no shape left to evade"* — while
quietly dropping coverage the old one had, and the file it lives in still advertises the deleted
guarantee. That is the pattern this chain exists to catch, in a low-stakes place.

**Remedy.** Keep the runner; it is the right instrument for what it measures. Then either restore
the source-side check *for the narrow question it is actually good at* — not "is this a gate", which
was the losing arms race, but "does every file under `test/` appear in exactly one of `GATED` or
`UNGATED`", which is decidable, unspoofable and turns a new gated suite into a one-line
classification — or delete the header sentence and `CLAUDE.md`'s "no shape left to evade" and say
what is true: *the runner reports every suite that emits a SKIP directive; a suite that declines by
never registering a test, or by returning early from a test body, is not visible to it.* Either is
fine; the current combination of a deleted check and a comment that still promises it is not. While
there, remove the now-dead `everyTestFile()` and `DB_ONLY_GATE` (unused since `09cd35e`, noted by
the ninth and tenth reviews), and anchor the runner's regex on `\s#\s*SKIP` after an unescaped `#`
so a test name cannot masquerade as a directive.

## 7. What I re-verified as still closed

| Finding | How I checked it | Result |
|---|---|---|
| F1 (CMS-admin takeover) | seized `tom` via a real `PUT /api/admin/user/2/password` as `nat`; asserted BOTH sessions genuinely authenticate before using them; attacked every page and API; guessed the passphrase at the real endpoint until the limiter tripped; then ran the positive control | stops at the unlock screen; pages 302 there; APIs 404 with no mention of unlocking; **workspace not opened**; the correct passphrase does open it |
| F2 / G1 (denial indistinguishable) | 14 paths in every distinct spelling x 7 methods (420) vs a control path, comparing status, full header set (nonce/cookie/etag-normalised) and body; flag on and off | **384/420** — clean on GET, HEAD, POST, PUT, PATCH, DELETE and on every page path in every spelling; the 36 failures are all OPTIONS on case-varied API paths, which is **R1** |
| H1 (alert recipient) | set the CMS row `contact.email` to `attacker@evil.example` in the database, then called `alertRecipient()` | not retargeted (`tom@arringtonconsultancy.com`); takes **0** parameters; body contains no `db`/`query`/`content` reference |
| H2 (delivered vs failed) | an unplanned live burst of five refused guesses through the real HTTP endpoint | one alert row for five attempts, typed `alert_failed` because nothing was delivered; attempts 4 and 5 correctly inside the backoff |
| H3 (boot honesty) | boot lines, flag on and off | each gate reported separately, real user ids printed, alarm correctly declared inert (`GMAIL_APP_PASSWORD` unset); with the flag off, one line saying the area does not exist |
| H4 (one activity level) | grep across the tree, then its call sites | one constant (`routes/workspace.js:50`), exactly two call sites (169, 316), one test pinning it |
| H7 (buildAlert field guard) | called it with an unpermitted key | throws: *"buildAlert received field(s) it is not permitted to read: extra"* |
| J2 (subject column, exact match) | the live burst above | `subject` populated exactly on the failure rows and the alert row; `actor='system'`, `subject='tom'` |
| K3 (`decideAlert` live) | call-site count in the deployed module | exactly one call site (line 577), inside `claimAlertSlotLocked` |
| K5 (freeze) | `rev-parse` / `status` at start and end; snapshot hash | clean at the frozen head throughout; hash identical to the eighth, ninth and tenth reviews' |
| L1 (dedicated connection) | the branch the deployed handle takes | `dedicatedConnectionSource(db/pool)` = `'wrapper'`; a shorthand-only handle returns `null` and the claim refuses |
| L2 / M1 (silence, worker close) | 120 racing OS processes across 10 rounds, plus 3 consecutive runs of the committed file | **0 silent, 0 duplicated, 0 worker errors**; 0 advisory locks and 0 idle-in-transaction after every round; `# pass 32 # fail 0` x3 |
| N1 / M2 (honest outcome) | the double-fault probe plus the live burst | a send that failed is recorded as failed and earns the short backoff; nothing records a delivered notice it did not deliver |
| P1 (contention) | reapplied the ninth review's DELIVERED mutation at the frozen head | `not ok 21 - contention is recorded as contention, and buys no backoff`; **the test has teeth** |
| P3 (threshold window) | five window-edge cases against seeded rows through the real entry point | correct at both edges; no burst missed or double-counted |
| Q2 (which clock) | read all three corrected locations, then checked the substance: which comparisons are SQL and which are JS, and what the conditional INSERT actually gates | wording is now accurate; the authoritative INSERT gates all four windows (`alert`, `failed`, `error`, `pending`) in SQL against `now()` |
| Q4 (`recordedAs`) | contention forced by an externally-held advisory lock **and** the recording statement made to throw | `recordedAs: null` against zero rows written; no production consumer |
| Unlock rotation | unlocked a session, restarted with a rotated passphrase (old pid 881, new pid 941), re-used the same cookie | login survives (200), unlock does not (302 to `/workspace/unlock`) |
| Seed migration | four database shapes, twice each, shelling out to the real `node db/seed.js` | exit 0 every time; newest claim per account kept, the rest retired; index built |
| Limiter ordering | 9 anonymous POSTs to `/api/workspace/unlock` with the flag off, against a control path | `404` x9 on both; the unlock limiter never answers ahead of the identity gate, so there is no 429 oracle |
| Sitemap / robots | fetched both, flag on and off | zero workspace references in either |

## 8. Concerns I could not turn into findings

- **The Scott API is enumerable by anonymous `OPTIONS` in exactly the same way** (`OPTIONS
  /api/scott/search` -> `200 Allow: POST`; `/api/scott/nonexistent` -> 404), as are `/api/leads`
  and `/api/product-guide/submit`. This is **pre-existing on `main` and live in production**, and
  it is not a finding against this candidate: Scott's existence is not claimed to be protected
  information the way the workspace's is, and `/scott` already redirects anonymous visitors to its
  own login by design. I record it because if R1's remedy is applied, someone should decide
  deliberately whether Scott's route list is meant to be public rather than inheriting the answer
  from a framework default.
- **The guard's correctness rests on an unstated framework default.** `case sensitive routing` is
  not set anywhere in `server.js`; the `/i` remedy is correct only because the default is
  case-insensitive. Nothing pins that.
- **`refuseUnroutedMethods` never runs for `PUT`/`DELETE`/`PATCH`/`TRACE`** on workspace paths,
  because the site's CSRF middleware answers 500 first. The outcome is currently indistinguishable
  from the control, so nothing leaks, but the guard is not doing the work for those methods that
  its name and comments imply, and a future change to CSRF error handling would move that
  boundary without anyone looking at this file.
- **A non-GET request with a missing or bad CSRF token returns 500 rather than 403**, on workspace
  paths and on the control alike. Pre-existing, not a disclosure, raised by the tenth review and
  unchanged.
- **The future-dating clause in the threshold window** (`AND created_at <= now() + interval '1
  minute'`) still means five failure rows dated ahead produce *"0 failure(s) in the window"*. I
  reproduced it. It remains unreachable from the application's own writes, and I record it exactly
  as my predecessor did.
- **A duplicate is still possible if a send outlives the three-minute claim lease.** Documented and
  deliberate.
- **A legacy database keeps one permanently unresolved claim.** Shapes 2 and 4 both end with a
  surviving `pending` row whose `subject` is `''`; the runtime reclaim matches `subject = $2` with a
  real username, so nothing will retire it. Raised by the eighth, ninth and tenth reviews,
  unchanged. A `WHERE subject <> ''` on the retirement would tidy it.
- **The `handled` list in `claimAlertSlot` still omits `ALERT_ERROR_EVENT` and
  `ALERT_ABANDONED_EVENT`**, and `decideAlert`'s default parameter still references
  `CLAIM_LEASE_MINUTES` declared 99 lines later. Both unchanged for a sixth pass; both benign.
- **`npm test` now always emits raw TAP**, because the runner pipes the child's stdout and Node
  selects its reporter from whether stdout is a TTY. Nothing is lost — the exit code and every line
  come through — but the human-readable `spec` output a developer used to get interactively is
  gone. Worth a `--test-reporter=spec` pass-through if anyone misses it.
- **No live alert email has ever been delivered.** The builder says so plainly, which is right. The
  last hop of this control remains untested by anyone, on eleven passes.
- **The in-memory unlock attempt budget still resets on any restart** (G6, disclosed and
  unchanged). I relied on it myself across several restarts; a patient attacker can too.
- **Who holds Railway.** F1's closure, H1's remedy and the whole third gate rest on Railway being
  reachable only by Tom. Eleven passes, no reviewer has seen it.

## 9. What remains for Tom Arrington

1. **The gates hold, and after eleven independent attempts that sentence carries as much weight as
   this process can give it.** Nobody has opened this area or taken a record out of it. Holding your
   CMS admin account and resetting your password still gets an attacker to a locked screen and no
   further; I proved both halves, and rotating the passphrase closes an open session immediately
   while leaving the login intact.
2. **The alarm and the concurrency work are done.** The P and Q cycles' fixes are real. 120 racing
   processes produced exactly one notice every time, the seed migration is right on four database
   shapes, and the test named for the contention property fails when I sabotage it. I attacked all
   four Q fixes; **two are completely correct (Q2, Q4), one is right in method but overstated
   (Q3), and one is incomplete (Q1).**
3. **What is not closed is R1, and it is the same thing your last reviewer found.** The fix for it
   was correct in design and one character short in execution: the guard spells the path in
   lowercase and your web framework does not care about case, so `/API/workspace/ask` walks past it
   and hands an anonymous stranger the list of your workspace's endpoints — including the contact
   *erasure* endpoint — **with the feature switched off**. The line in your project memory saying
   that merging this branch is inert is still not true. The code fix is one character; I wrote it
   and measured it at 420 of 420.
4. **The test is again the more important half, and this is now the point I would press hardest.**
   Your builder's new test does sweep every method, which was the right lesson from last time. It
   then lists the paths by hand, in one spelling. Ask for the sweep to be derived from the router's
   own route table and to cover spelling as well as method, and ask to be shown it failing at this
   frozen head before it is trusted. Eleven passes have now produced eleven variants of one
   sentence: *the test exercised a sample of the thing the claim said was universal.*
5. **R2 is a tidy-up and should ride along.** It changes nothing an attacker can do. It matters only
   because a file in your repository currently promises a check that has been deleted, and a future
   session will believe it.
6. **Do the secret rotation.** Still yours and still outstanding: `WORKSPACE_ACCESS_PASSPHRASE`,
   `WORKSPACE_SNAPSHOT_KEY`, then `SESSION_SECRET` (which invalidates every CRM erasure tombstone,
   by design) and the account passwords.
7. **Why this is AMBER and not PASS, so you can check my reasoning.** I did not withhold a PASS out
   of deference to ten predecessors, and I went looking hard for a reason to award one. Almost
   everything I attacked held. I withheld it for one reason, and it is a fact rather than a
   judgement: with the feature switched off, an anonymous `curl` differing from your builder's own
   test by a single capital letter enumerates the workspace API, and the document you are meant to
   trust says that cannot happen. Grading that lower than Q1 would be grading the size of the
   remedy instead of the size of the exposure.
8. **Why this is not STOP, and what I would say about the next pass.** Nothing found gives anyone
   access, content, or a way past a gate. R1 is one character plus a better test. My predecessor
   wrote that they saw no reason this candidate should not reach a green verdict on the next pass;
   I would say the same, with one qualification they could not have known to add — **the last two
   HIGH findings were both introduced by the fix for the one before**, so the next pass should
   spend its first hour on the R1 remedy itself and on nothing else. If the guard becomes
   case-insensitive, the sweep becomes router-derived, and it is watched failing here first, I do
   not currently see what is left.
9. **What still cannot be verified from inside this project's tooling** after eleven passes: the
   Drive authorities, the provenance and classification of the thirty snapshot records, your own
   instructions except as quoted by the builder, and everything about Railway. Eleven independent
   passes have not moved any of those an inch. If you want them certified it needs a reviewer with
   Drive and Railway access and, on the evidence of eleven passes, one not commissioned by the
   session whose work is being reviewed.

---

Nothing in this review was merged, deployed, connected, spent or enabled. The paid live-AI suites
were not run, and neither was the Scott adversarial suite. My writes were confined to five
throwaway databases — `ws_r11`, `ws_s1`, `ws_s2`, `ws_s3`, `ws_s4` — created from nothing and
dropped at the end; within `ws_r11` I reset the local `tom` password through the application's own
API, briefly poisoned and then restored the CMS `contact.email` row, and created
`workspace_activity` rows for my probes, before dropping the database entirely. Every experiment
needing a code change was done in `git worktree`s under `/tmp`, which have been removed; both the
P1 mutation and the R1 remedy prototype existed only inside them. All three servers I started have
been stopped. `data/workspace-snapshot.enc` is unchanged and was never decrypted. The reviewed
branch is left on `feature/arrington-ai-workspace-v0-1` at `ebac5f6`, clean.
