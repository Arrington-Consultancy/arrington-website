# Arrington AI Workspace v0.1: Independent Governance & Assurance Review (twelfth pass)

Date: 31 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, frozen head
`d745a554877bb53941c7924481a1ed83e501dddf`.
Baselines: the eleven previous reviews (F1-F10, G1-G9, H1-H7, J1-J4, K1-K5, L1-L5, M1-M5,
N1-N5, P1-P5, Q1-Q4, R1-R2 — **all AMBER**) and the builder's eleven responses, the most
recent being `review/workspace-v0.1-r-remediation-2026-08-31.md`.

```
$ git rev-parse HEAD
d745a554877bb53941c7924481a1ed83e501dddf
$ git status --porcelain
(empty)
$ sha256sum data/workspace-snapshot.enc
e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2
```

The tree stayed frozen and clean from the first command of this review to the last, and the
snapshot hash is byte-identical to the value the eighth, ninth, tenth and eleventh reviews
recorded. K5's remedy has now held seven passes running. Every experiment needing a code change
ran in a `git worktree` under `/tmp`, which has been removed; every write went to six throwaway
databases created from nothing and dropped at the end. This report is committed on a separate
branch and nothing else in the repository is touched.

## 1. The bounded question

Eleven consecutive reviews found the same class of defect: a security property asserted and not
held. The last two were each introduced by the fix for the one before. My predecessor's R1 was
the purest instance of that sub-pattern: the Q1 guard matched workspace paths with a
case-**sensitive** regular expression while Express routes case-**insensitively**, so
`/API/workspace/ask` reopened the entire anonymous OPTIONS enumeration oracle with the enable
flag off — and the test written for Q1 reported 10/10 green on the same server in the same
minute, because it listed the paths by hand in one spelling.

So: is the R cycle correct? Is R1's remedy the twelfth instance rather than the end of the
chain? And do the closures from F through R still hold under probes of my own construction?

Nothing more. This review does not authorise a merge, a deploy, an environment variable change,
a spend, or the connection of any external account, and it did none of those things.

## 2. VERDICT: PASS

**PASS, with two LOW findings and a short list of items that remain Tom's.**

This is the first green verdict in twelve passes and I did not arrive at it by fatigue. I went
looking for R1's successor specifically, in the place the last two HIGH findings came from — the
remedy for the previous finding — and in the place a case bug could hide next. What I found is
that **R1 is completely fixed, and fixed at the root rather than at the symptom**:

```
FLAG OFF, anonymous: 261/261 method x spelling combinations in which every real endpoint
                     is indistinguishable from a fabricated sibling
FLAG ON,  anonymous: 261/261
(22 paths x 9 methods x 29 spellings = 5,742 requests per flag state)
```

That sweep is deliberately much wider than the builder's own 220: nine methods including
`TRACE`, an unknown verb and lower-cased verbs; twenty-nine spellings including four unicode
case-folding candidates (`U+212A`, `U+017F`, `U+0130`, `U+0131`), their percent-encoded forms,
null bytes, doubled and leading slashes, `..` traversal, a 2 KB path prefix, backslashes, matrix
parameters and a trailing dot. Every real endpoint answers exactly as a fabricated sibling does,
in both flag states, over raw sockets so nothing was normalised by an HTTP client on the way out.

**I confirmed the one-character fix is load-bearing rather than incidental**, by reverting it in
a worktree and watching the oracle come straight back, and I confirmed the new test case has
teeth by running it against that reverted server:

```
reverted guard: OPTIONS /API/workspace/ask -> 200 Allow: POST   (oracle restored)
                not ok 3 - every method is refused the same way, not just GET and POST
frozen head:    OPTIONS /API/workspace/ask -> 404               (control: 404)
                ok 3 - every method is refused the same way, not just GET and POST
```

**And I checked the general class rather than the instance.** There are exactly four places in
this codebase that make a decision from a request path. One is `WORKSPACE_PATH`, now
case-insensitive. The other three (`req.path !== '/health'` in the canonical-host rewrite,
`GOOGLE_PREFILL_PATHS.has(req.path)`, and the `/workspace/unlock` exception inside the page
guard) are all case-sensitive and all fail **closed** under case variation: the odd-cased spelling
gets the stricter treatment, not the looser one. There is no second instance of R1 waiting.

**Everything else I attacked held.** All three gates under a full CMS-admin takeover of Tom's
account, with the positive control; passphrase rotation closing an open unlock while leaving the
login intact; the failed-unlock alarm end to end out of a real burst; the alarm's honesty across
six distinct outcome paths; the threshold window at both edges; 240 racing OS processes producing
exactly one notice every round; the seed migration on four database shapes twice each; erasure
requiring an exact confirmation and a written reason, with the payment record deliberately kept;
and the keyed tombstone refusing to be computed without `SESSION_SECRET`. Two independent
mutations show the committed tests are not decoration: sabotaging the contention rule fails 2
assertions, and removing the conditional-insert predicate fails 16.

**The two findings are both LOW, both in the gated-suite reporting aid, and neither is a security
control.** S1 is that the R2 remediation's *"Verified: both shapes caught"* is not true — one of
the two shapes my predecessor planted and named is caught by neither half of the restored pair,
and the restored source scan also fires on ordinary code. S2 is that the same file still carries,
in two places, the sentence R2 asked to be removed, now contradicting the code two functions
below it. Nothing is currently mis-reported: all five real gated suites are named correctly and I
confirmed the block against a real run.

**Why that is not an AMBER.** The exposure is a *future* gated suite written in one particular
form being absent from a report a release decision reads. It does not open the workspace, leak a
record, defeat a gate, silence the alarm, or change anything an attacker can do. This same guard
has been graded LOW in six consecutive reviews and has never been the reason for a verdict; every
previous AMBER was carried by a MEDIUM or a HIGH sitting beside it. There is none here. Grading
the candidate AMBER for a test-tooling defect, because eleven predecessors said AMBER for other
reasons, would be the mirror image of the error I was warned against.

**What would have made me withhold it**, so the reasoning is checkable: any anonymous request
distinguishing a real workspace route from a missing one in any spelling or method; any path that
reached a workspace handler without passing the guard; any of the three gates opening under the
takeover; a burst producing two notices or none; a seed shape that crashlooped; or a claim in the
R remediation about the *security* surface that I could not reproduce. I tested all six and found
none of them.

## 3. Independence, and its limits

I am a separate session from the technical builder. I wrote none of the workspace code and
accepted no claim I could test myself. The four limits recorded by every previous pass stand
unchanged, and a PASS does not retire them:

1. **I am a Claude agent, commissioned by the builder's own session, reviewing the builder's
   work.** Structural, and uncured by my having found something or by my awarding a PASS.
2. **No network access to Railway or the live site.** Everything about production and staging
   variables, deployments and the paid live-AI runs is reported to me, not verified by me.
3. **No Google Drive access.** The controlled authorities and Tom's instructions reach me only as
   transcribed by the party they constrain.
4. **No real browser.** I drove the application over HTTP and over raw sockets, and inspected
   status lines, full header sets, bodies and cookies. I did not render a page.

A fifth limit is specific to this pass and worth stating plainly: **this environment holds no
`WORKSPACE_SNAPSHOT_KEY`, so the brain was unseeded throughout** (`repo.listRecords()` returned
0 records). I therefore tested the *access* surface exhaustively and did **not** test the
content-filtering surface against real confidential records. That is the open half of finding J4,
it remains Tom's, and my PASS does not cover it.

The paid live-AI suites were **not run**: they spend money and I was instructed not to. They are
not evidence in this pass.

## 4. What I did, with observed results

Environment: local Postgres 16; throwaway databases `ws_r12`, `ws_r12c`, `r12s1`-`r12s4`, all
created from nothing and dropped at the end; servers on 3301 (workspace armed), 3302 (**no
workspace environment variables at all** — production's configuration if this branch merges) and
3303 (the frozen head with R1's fix deliberately reverted); a `git worktree` at `/tmp/r12/wt`,
removed.

### 4.1 The regression suite

```
$ env -u NAT_PASSWORD -u TOM_PASSWORD DATABASE_URL=... SESSION_SECRET=... npm test
# tests 539   # suites 53   # pass 537   # fail 0   # skipped 2
EXIT=0

  5 SUITE(S) DID NOT RUN. The counts above do not cover them.
  [SKIP] adversarial: real session and API path
  [SKIP] LIVE AI pressure suite (spends money)
  [SKIP] two-pass seed
  [SKIP] adversarial workspace checks
  [SKIP] workspace live AI pressure
```

Green, and **it reproduces the builder's stated figure exactly** (539 / 537 / 0 / 2). The
runner's `[SKIP]` block is accurate: all five gated suites are named with what arms them.

### 4.2 R1, attacked at the root

The guard, at `lib/workspace/access.js:184`:

```js
const WORKSPACE_PATH = /^\/(workspace|api\/workspace)(\/|$)/i;
```

I first established *why* the `i` is the right fix rather than a lucky one. `server.js` never sets
`case sensitive routing`, and this app runs Express 5.2.1 on `router` 2.2.0 and `path-to-regexp`
8.4.2, whose compiled route regex is built as `new RegExp(pattern, sensitive ? "" : "i")` —
**flag `i` and no `u`**. The guard uses the same two flags, so the two matchers now agree
character for character, including on the unicode question: in non-unicode mode JavaScript's
case folding deliberately does *not* map `ſ` to `s` or `U+212A` to `k`, and neither matcher does.
Where they might have disagreed is exactly where a mismatch would have mattered, and they do not.
The router also matches against `parseurl(req).pathname`, which is the same raw, undecoded string
Express's `req.path` getter returns — so there is no decode step between the guard and the router
either.

Then I measured it, over raw sockets, comparing each real endpoint against fabricated siblings
under the identical transform (so a difference can only come from the path, never from the shape
of the probe):

```
FLAG OFF, anonymous: 261/261      FLAG ON, anonymous: 261/261
22 paths x 9 methods x 29 spellings = 5,742 requests per flag state
```

Nine methods: `OPTIONS GET HEAD POST PUT PATCH DELETE TRACE FROB`. Twenty-nine spellings:
canonical, fully upper, `/API/`, `/WorkSpace/`, alternating case, trailing `/`, trailing `//`,
leading `//`, `U+212A` for `k`, `U+017F` for `s`, and each of those percent-encoded, `%41`/`%61`
for `a`, fullwidth `a`, trailing dot, `%20`, `%00`, `%09`, `%0d`, `/./` inserted, backslashes,
`/x/..` traversal, a query string, a matrix parameter, a 2 KB prefix plus `..`, an encoded first
character, and a doubled slash mid-path.

The headline, on the server with **no workspace variables set at all**:

```
/api/workspace/ask       OPTIONS -> 404      /API/workspace/ask     OPTIONS -> 404
/API/WORKSPACE/ASK       OPTIONS -> 404      /api/WorkSpace/ask     OPTIONS -> 404
/Api/Workspace/Ask       OPTIONS -> 404      /API/workspace/notreal OPTIONS -> 404
```

Non-workspace routes are unaffected, which I checked rather than assumed:

```
/                200 | OPTIONS 404        /scott/login     200 | OPTIONS 200 Allow: POST
/health          200 | OPTIONS 404        /workspace-audit 404 | OPTIONS 404
/login           200 | OPTIONS 200        /product-guide   200 | OPTIONS 404
/api/leads       404 | OPTIONS 200        /robots.txt      200 | OPTIONS 404
```

The trailing `(\/|$)` still means a public slug beginning with `workspace` is untouched.

**Method-dimension probe**, workspace path against the control, raw:

```
get /api/workspace/ask       400 | control 400      SEARCH   500 | control 500
Get /api/workspace/ask       400 | control 400      PROPFIND 500 | control 500
options /api/workspace/ask   400 | control 400      CONNECT  (no response) | control same
OPTIONS /api/workspace/ask   404 | control 404      OPTIONS * 500 | control 500
GET / HEAD / POST            404 | control 404
```

Identical throughout. (The 500s are the site's pre-existing CSRF-error behaviour on non-GET
without a token, on the control path too — the standing concern the tenth and eleventh reviews
recorded, not a disclosure.)

**Is the fix load-bearing?** I reverted the single character in a worktree, ran a server on it,
and the oracle returned intact:

```
reverted:  OPTIONS /API/workspace/ask -> 200 Allow: POST
           OPTIONS /API/workspace/notreal -> 404          (still discriminates)
```

**Does the new test see it?** The generalised adversarial case, run against that reverted server:

```
not ok 3 - every method is refused the same way, not just GET and POST
# pass 8  # fail 2
```

Red at the pre-fix code, green at the frozen head. That is the thing my predecessor asked to be
shown, and it is now true.

**Is there a second instance of the class?** Four places in this codebase decide from a request
path, and I enumerated them exhaustively:

| Location | Comparison | Under case variation |
|---|---|---|
| `lib/workspace/access.js:188` | `WORKSPACE_PATH.test(req.path)` | case-insensitive; agrees with the router |
| `lib/workspace/access.js:114` | `req.path === '/workspace/unlock'` | fails **closed** — an odd-cased unlock URL redirects to the canonical one |
| `server.js:127` | `req.path !== '/health'` | fails **closed** — `/HEALTH` is host-rewritten, i.e. treated more strictly |
| `server.js:245` | `GOOGLE_PREFILL_PATHS.has(req.path)` | fails **closed** — an odd-cased prefill page keeps the stricter COOP |

`lib/scott/access.js` makes no path comparison at all; its guards are per-route. There is exactly
one path-shaped regex in the whole application and it now carries the flag.

### 4.3 Denial equivalence for an authenticated non-Tom admin, over the COMPLETE route set

The committed suite hand-lists eight of the nine API endpoints and two page paths that do not
exist. I enumerated all nineteen real routes from `routes/workspace.js` itself and drove them as
a logged-in site admin who is not Tom:

```
control GET 404/4282   control POST 404/4282
ALL 19 workspace routes as a non-Tom ADMIN: every one identical to a genuinely missing path
```

That includes `/api/workspace/social/engagement/1/replied`, which the committed suite omits.

### 4.4 The gates, attacked (F1)

Full CMS-admin takeover, each step confirmed rather than assumed:

```
1. nat logs in: 302        SANITY nat authenticated (/api/admin/pages): 200
2. nat resets tom's password (PUT /api/admin/user/2/password): 200 {"success":true}
3. attacker logs in AS TOM: 302   SANITY seized session authenticates: 200
4. /workspace /workspace/brain /workspace/contacts /workspace/activity /workspace/chat
                                     -> 302 -> /workspace/unlock  (all five)
5. POST ask / contacts/1/erase / contacts/sync
                                     -> 404, len 4282, "unlock" never mentioned
6. "password" "letmein" "arrington" "workspace" "tom" -> 401 each
   "sixth" -> 429 {"error":"Too many attempts. Wait fifteen minutes."}
WORKSPACE OPENED BY THE ATTACKER: no (status 302)
```

And the positive control, without which the above proves only that the gate is broken shut:

```
CORRECT passphrase -> 200 {"ok":true}
/workspace /workspace/brain /workspace/activity /workspace/contacts /workspace/chat
                    -> 200, X-Robots-Tag: noindex, nofollow  (all five)
erase with a mismatched confirmation, as Tom -> refused
```

**The unlock screen itself leaks nothing.** As a cleared-but-locked session I fetched it and
searched for content: no counts, no record titles, no bare numbers, and **no workspace nav links
at all**. The four content-shaped words that appear (`gap`, `record`, `sync`, `stale`) are all
CSS class names inside the shared stylesheet, which I checked in context rather than by keyword.

### 4.5 No 429 oracle, and the limiter never answers ahead of the identity gate

Nine anonymous POSTs to `/api/workspace/unlock` carrying a real CSRF token, each paired with the
same request to a control path, in both flag states:

```
FLAG OFF: 1..9  unlock=404 len=4282   control=404 len=4282   identical=true
FLAG ON:  1..9  unlock=404 len=4282   control=404 len=4282   identical=true
```

### 4.6 The alarm, driven through every reachable outcome

Out of the real HTTP burst in 4.4, straight from the database:

```
175 workspace_unlock_failed        tom    tom   passphrase did not match
174 workspace_unlock_failed        tom    tom
173 workspace_unlock_failed        tom    tom
172 workspace_unlock_failed        tom    tom
171 workspace_unlock_alert_failed  system tom   Security notice FAILED to send after 3 failed
                                                unlock attempt(s) against "tom": ...
170 workspace_unlock_failed        tom    tom
```

Threshold at three, exactly one alert row for the burst, the undelivered notice correctly typed
`alert_failed` rather than `alert_sent` (H2), `subject` populated exactly and `actor='system'` on
the alert row (J2), later attempts correctly inside the backoff.

Then the outcome matrix, through the real entry point:

```
A  transport succeeds        -> sent=true,  row workspace_unlock_alert_sent   "DELIVERED"
A2 immediately again         -> quiet: "a notice was DELIVERED 0 minute(s) ago; cooldown is 60"
B  transport throws          -> sent=false, row workspace_unlock_alert_failed "FAILED to send"
B2 immediately again         -> quiet: "the last notice FAILED to send 0 min ago; retry after 5"
C  no transport configured   -> row workspace_unlock_alert_failed, reason names the missing
                                GMAIL_APP_PASSWORD and says nothing was sent
D  genuine PRE-send fault    -> row workspace_unlock_alert_error, "and NO send was attempted",
   (no dedicated connection)    next caller told "could not be evaluated ... NO send attempted"
E  contention + the outcome  -> {"sent":false,"recordedAs":null}, zero rows written
   write also made to throw     (Q4: recordedAs never names a row that does not exist)
```

Only a delivered notice buys the hour; a failure buys five minutes; a pre-send fault is typed
distinctly and buys no send backoff. That is M2, N1, H2, J3 and Q4 all holding at once.

### 4.7 The threshold window at its edges (P3, N4)

```
3 failures aged 29 min   (inside)     sent=true   alertRows=1
3 failures aged 31 min   (outside)    sent=false  "0 failure(s) in the window, threshold is 3"
2 @ 29 min + 2 @ 31 min               sent=false  "2 failure(s) in the window"
3 @ 29.9 min             (just in)    sent=true   alertRows=1
2 @ 29 min               (below)      sent=false  "2 failure(s) in the window"
5 failures dated 5 min in the FUTURE  sent=false  "0 failure(s) in the window"
```

Correct at both edges. The last line is the exclusion my two predecessors recorded as a concern;
it behaves as they described and I record it the same way, in section 7.

### 4.8 Concurrency: 240 racing OS processes

Independent OS processes, all released at a shared instant, against a burst already over
threshold, against the real database through the real function:

```
10 rounds x 12 processes: alertRows=1 every round
 4 rounds x 30 processes: alertRows=1 every round
SUMMARY rounds=14 duplicated=0 silent=0 workerErrors=0
advisory_locks=0  idle_in_txn=0  after every round
```

### 4.9 Do the committed tests have teeth? Two mutations

```
mutation 1: contention recorded as a DELIVERED notice (the ninth review's own mutation)
  not ok 21 - contention is recorded as contention, and buys no backoff
  # pass 30  # fail 2

mutation 2: the conditional INSERT's WHERE NOT EXISTS predicate removed (the K1/Q2 guard)
  not ok 2  - a burst at the threshold delivers exactly one notice
  not ok 6  - a concurrent burst still produces exactly one notice
  not ok 8  - processes racing the same instant produce exactly one claim
  ... 16 failures in total
  # pass 16  # fail 16
```

P2's concern — a concurrency test provably blind to the defect it guards — is answered.

### 4.10 The seed migration, on four database shapes, twice each

```
SHAPE 1 fresh                        pass1 exit=0  pending=0 abandoned=0 index=1 subject=1
                                     pass2 exit=0  pending=0 abandoned=0 index=1 subject=1
SHAPE 2 polluted: 3 'tom', 2 'nat',  before: pending=7 abandoned=0 index=0
        2 legacy subject=''          pass1 exit=0  pending=3 abandoned=4 index=1
                                     pass2 exit=0  pending=3 abandoned=4 index=1
                                     survivors: tom=1, nat=1, ''=1
SHAPE 3 index present + live claim   pass1 exit=0  pending=1 abandoned=0 index=1
                                     pass2 exit=0  pending=1 abandoned=0 index=1
SHAPE 4 pre-J2: no subject column,   before: subject column present? 0
        no index, 3 legacy claims    pass1 exit=0  pending=1 abandoned=2 index=1 subject=1
                                     pass2 exit=0  pending=1 abandoned=2 index=1 subject=1
```

Correct and idempotent in every case. This matters more than it looks: the seed is the start
command, so a failed `CREATE UNIQUE INDEX` crashloops the app on boot — the Scott release
incident's exact failure mode.

### 4.11 The adversarial suites, run by hand

```
workspace, against a freshly restarted armed server:
  ok 1..9 (all nine)      # tests 10  # pass 10  # fail 0  # skipped 0
Scott, against the same server:
  ok 1..14 (incl. 5 nested brain-gap cases)  # tests 18  # pass 18  # fail 0  # skipped 0
```

Both reproduce the builder's stated figures. Nothing NOT EXECUTABLE.

### 4.12 Erasure, end to end, as an unlocked Tom

```
erase, WRONG confirmation    -> 400 "The typed address does not match this contact..."
erase, right email, NO reason -> 400 "A reason is required, and is kept as the record of why..."
erase, correct                -> 200 removed: leads 1, crm_contacts 1, crm_contact_events 1,
                                     market_ready 0, product_guide 0, commercial_gaps 0
                                retained: purchases 0, "A purchase is a financial record..."
register row: email_hash = de08ef05...  email_redacted = p***********@e******.test
raw address present anywhere in the register: 0
leads rows left for that address: 0
```

`lib/crm/emailHash.js` **throws** rather than falling back when `SESSION_SECRET` is unset, and the
digest changes with the key — F4 and G9 both holding. The privacy page states the payment-record
retention and the shortened-address note in the visitor-facing text (F10).

## 5. Findings

### S1. The R2 remediation says *"Verified: both shapes caught."* One of the two shapes is caught by neither half, and the restored scan fires on ordinary code. Severity: LOW

**What is claimed.** `review/workspace-v0.1-r-remediation-2026-08-31.md`: *"two ordinary shapes
never reach the runner's output at all — a suite that registers nothing, and an early return from
inside a test body ... Both had been caught by the scan I deleted. Both halves are back ...
**Verified: both shapes caught.**"* `CLAUDE.md` says the same: *"Both halves are back, with the
source scan narrowed to exactly what the runtime check cannot see."*

**What I did.** Planted my predecessor's two probe files verbatim, in a worktree, and ran both
halves against them.

```js
// probe12/c.test.js  — my predecessor's shape 1, "a suite that registers nothing"
if (process.env.SOME_GATE_R12) { test('gated body', () => {}); }

// probe12/d.test.js  — shape 2, the early return
test('gated by early return', () => { if (!process.env.SOME_GATE_R12) return; ... });
```

**What happened.** Shape 2 is caught. Shape 1 is caught by neither half.

```
$ node --test test/gatedSuites.test.js
not ok 2 - a gated suite cannot appear without being declared
    these suites can decline to run in a way the runner cannot report:
      probe12/d.test.js (returns early on configuration)          <- shape 2 caught
                                                                  <- shape 1 NOT listed

$ node scripts/runTests.js test/probe12/c.test.js
# tests 1  # pass 1  # skipped 0
  Every suite ran. Nothing was skipped.                            <- shape 1 invisible here too
EXIT=0
```

The reason is a mismatch between what the shape is and what the scan tests for. The scan asks
whether the **source text** contains a `test(`/`describe(`/`it(` call:

```js
const registersSomething = /\b(?:test|describe|it)\s*\(/.test(src);
```

A suite that registers nothing *at runtime* because its registration sits inside
`if (process.env.X) { ... }` still contains that call in its source, so it passes. The only file
the check can catch is one with no `test(` call anywhere in it, which is not a shape anybody
writes. The shape my predecessor actually planted, named and demonstrated walks past it.

**There is also a false positive in the other direction**, which the remediation does not mention.
The early-return heuristic keys on any `if` whose condition contains a four-character-or-longer
SCREAMING_CASE token, followed by a `return`. That is ordinary JavaScript:

```js
// probe12/fp.test.js — an ordinary helper, nothing to do with gating
function statusOf(res) { if (res.STATUS_CODE) return res.STATUS_CODE; return 0; }
test('ordinary test that always runs', () => { ... });

not ok 2 - a gated suite cannot appear without being declared
    these suites can decline to run in a way the runner cannot report:
      probe12/fp.test.js (returns early on configuration)
```

So the restored backstop can both miss a genuinely gated suite and fail a suite that is not gated.

**What is genuinely fixed, and I checked all of it.** The runner's TAP handling is correct now.
Nested subtests are captured at two levels of indentation; a test whose *name* contains `# SKIP`
is no longer reported as a skipped suite (the negative lookbehind for TAP's `\#` escape does the
work); a genuine skip whose name contains a `#` is still captured; a `todo` is not mistaken for a
skip; and a test that `console.log`s a fabricated TAP line cannot inject a phantom suite, because
Node emits such output as a `#`-prefixed comment. Exit codes pass through (1 on failure, 0 clean),
and a file that throws on load surfaces as a failure rather than silence. I verified each of these.

**Materiality, stated plainly so this is not read as bigger than it is.** This is not a security
control. Nothing is currently mis-reported: I scanned the whole test tree and **no real suite uses
the invisible shape**, all five gated suites use `t.skip`-shaped gates, all five appear in the
block, and I confirmed the block against a real run. The exposure is a future gated suite written
in that one form being absent from a report a release decision reads.

**Remedy.** Two lines, and neither is another round of the arms race. First, make the
"registers nothing" check answer the question it is named for by asking the **runner**, not the
source: the file was executed and emitted no test at all. `node --test` reports that as
`# tests 0` for the file, which is decidable and unspoofable, and it belongs in
`scripts/runTests.js` beside the SKIP parsing rather than in a regex over source text. Second,
either narrow the early-return heuristic to conditions that name `process.env` (dropping the bare
SCREAMING_CASE alternative, which is what produces the false positive) or accept it and say so.
Then delete the sentence *"Verified: both shapes caught"* from the remediation and the matching
claim from `CLAUDE.md`, and replace them with what is true.

### S2. The same file still carries, in two places, the sentence R2 asked to be removed, and it now contradicts the code two functions below it. Severity: LOW

**What is claimed.** The R remediation: *"Also corrected: the file header still advertised the
deleted check."*

**What I did.** Read `test/gatedSuites.test.js` at the frozen head.

**What happened.** The header was rewritten, but the claim survives twice. At lines 4-7, in the
new header:

> *"The runtime half is scripts/runTests.js ... so a skip is observed rather than inferred and
> **there is no source shape to evade**."*

That is the exact assertion R2 disproved, and the very next paragraph of the same comment
contradicts it: *"replacing the source scan with the runner LOST coverage, because two ordinary
shapes never reach the runner's output at all."* Both sentences cannot be true, and the second is.

And at lines 62-73, inside `test('every declared gated suite still exists')`, the old block is
untouched:

> *"It has been replaced by scripts/runTests.js ... A skip appears there whatever the source looks
> like, so **there is no shape to evade** ... **What is left here is the part that check cannot
> do: naming what ARMS each suite**."*

All three clauses are false at this head. The scan was not replaced — it is restored twenty lines
below. There is a shape to evade, which is S1. And what is left in this file is not only the
`arms` text; it is a second test that did not exist when that comment was written.

**Why it is a finding rather than a nit.** This is the file whose whole purpose is to stop a
reader believing a check exists when it does not, and it is the second consecutive cycle in which
its documentation asserts a guarantee it does not have. A future session reading the first test's
comment will conclude the source scan was deleted and will not look for it.

**Remedy.** Delete the two stale claims. Then, while there, the two dead identifiers the ninth,
tenth and eleventh reviews all named — `everyTestFile()` was dead and is now live again, but
`DB_ONLY_GATE` is used only by the heuristic S1 recommends narrowing — should be either used
deliberately or removed.

## 6. What I re-verified as still closed

| Finding | How I checked it | Result |
|---|---|---|
| F1 (CMS-admin takeover) | seized `tom` via a real `PUT /api/admin/user/2/password` as `nat`; asserted BOTH sessions genuinely authenticate first; attacked all 19 routes; guessed the passphrase at the real endpoint until the limiter tripped; then ran the positive control | stops at the unlock screen; pages 302 there; APIs 404 with no mention of unlocking; **workspace not opened**; the correct passphrase does open it |
| F2 / G1 / Q1 / **R1** | 22 paths x 9 methods x 29 spellings vs fabricated siblings under the identical transform, over raw sockets, flag on and off | **261/261 both states** (5,742 requests each); fix confirmed load-bearing by reverting it; new test case red at the pre-fix code |
| R1, the general class | enumerated every path-based decision in the codebase | four sites; three fail closed under case variation; the fourth is the guard and now matches the router's own semantics (both `i`, neither `u`) |
| F5 (social scopes) | read the registry | no publishing/write scope declared; consequential actions throw by construction; the one manage-named scope is Meta's read-only metrics scope, justified in place |
| F8 (denial renderer) | body length on every denial | 4,282 bytes, identical to the site's genuine 404, on every route and both flag states |
| F10 / F4 / G9 (privacy, tombstone) | read the visitor-facing text; called `hashEmail` with and without `SESSION_SECRET`, and under two different keys | payment retention and the shortened-address note both stated; the function throws without the secret and the digest is key-dependent |
| H1 (alert recipient) | set the CMS row `contact.email` to `attacker@evil.example` in the database, then called `alertRecipient()` | not retargeted; takes **0** parameters; body references no `db`/`query`/`content` |
| H2 / M2 / N1 / J3 (honest outcome) | six outcome paths driven through the real function, plus a live five-guess burst over HTTP | delivered buys the hour; a failed send buys five minutes; a pre-send fault is typed `alert_error` and says NO send was attempted; nothing records a delivery that did not happen |
| H3 (boot honesty) | boot lines, flag on and off | each gate reported separately, real user ids printed, alarm correctly declared inert (`GMAIL_APP_PASSWORD` unset); with the flag off, one line saying the area does not exist |
| H4 (one activity level) | grep across the tree, then its call sites | one constant (`routes/workspace.js:50`), exactly two call sites (169, 316), one test pinning it, no literals |
| H7 (buildAlert field guard) | called it with an unpermitted key, and with the permitted five | throws naming the offending keys; accepts the declared set |
| J2 (subject column, exact match) | the live burst | `subject` populated exactly on the failure rows and the alert row; `actor='system'` on the alert |
| K3 (`decideAlert` live) | call-site count in the deployed module | exactly one call site, inside `claimAlertSlotLocked` |
| K5 (freeze) | `rev-parse` / `status` at start and end; snapshot hash | clean at the frozen head throughout; hash identical to the eighth through eleventh reviews' |
| L1 (dedicated connection) | the branch the deployed handle takes | `dedicatedConnectionSource(db/pool)` = `'wrapper'`; a shorthand-only handle returns `null` and the claim refuses, recording an `alert_error` |
| L2 / M1 / J1 (boundedness) | 240 racing OS processes across 14 rounds | **0 silent, 0 duplicated, 0 worker errors**; 0 advisory locks and 0 idle-in-transaction after every round |
| P1 (contention) | reapplied the ninth review's DELIVERED mutation at the frozen head | 2 failures including `contention is recorded as contention` |
| P2 (test blindness) | removed the conditional INSERT's predicate | **16 failures**, including all four one-notice assertions |
| P3 / N4 (threshold window) | six window-edge cases through the real entry point | correct at both edges; no burst missed or double-counted |
| Q2 (which clock) | read the four windows, then confirmed the behaviour | all authoritative comparisons are SQL against `now()`; the future-dating exclusion behaves as documented |
| Q4 (`recordedAs`) | contention forced by an externally-held advisory lock **and** the recording statement made to throw | `recordedAs: null` against zero rows written |
| G5 (session fixation) | `req.session.regenerate()` at login; observed cookie behaviour | regenerate is called, and no session cookie is issued before authentication, so there is nothing to fixate |
| Unlock properties | rotation with a reused cookie; the locked unlock screen's content | rotation closes the unlock (302) and leaves the login intact (200); the screen renders no counts, no titles, no numbers and no workspace nav |
| Limiter ordering | 9 anonymous CSRF-bearing POSTs to `/api/workspace/unlock` vs a control, both flag states | identical 404s throughout; no 429 oracle |
| Seed migration | four database shapes, twice each, shelling out to the real `node db/seed.js` | exit 0 every time; newest claim per account kept, the rest retired; index built |
| Sitemap / robots / nav | fetched all three, flag on and off | zero workspace references anywhere |
| Adversarial suites | run by hand against a running instance | workspace 10/10, Scott 18/18, nothing skipped |

## 7. Concerns I could not turn into findings

- **`npm test` alone does not pin R1's fix.** The case-insensitivity of `WORKSPACE_PATH` is
  asserted in exactly one place — `test/workspace/adversarialApi.test.js` — which skips without a
  running server. Removing the `i` again leaves a bare `npm test` fully green. This is disclosed
  (the runner prints it on every run, and `CLAUDE.md` says a green `npm test` is not a release
  decision), so it is not a finding. But the cheap fix is worth taking: `refuseUnroutedMethods` is
  exported, so an ungated unit test can call it with `{ path: '/API/workspace/ask', method:
  'OPTIONS' }` and assert it refuses. Three lines, no server, and the property stops depending on
  somebody remembering to run the gated suite.
- **The adversarial sweep still lists paths by hand.** My predecessor asked for it to be derived
  from the router's own stack; the builder generated the *spellings* and kept hand-listing the
  *paths*. The list is currently short by one real endpoint
  (`/api/workspace/social/engagement/:id/replied`) and carries two page paths that do not exist
  (`/workspace/today`, and `opportunities`/`projects` in the page list). I probed all nineteen
  real routes myself and every one is clean, so nothing is wrong today — and the guard is a path
  **prefix** regex, so a route added later is covered by it automatically, which is why this is a
  concern rather than a finding. It is still the same sentence twelve reviews have written.
- **`workspace` is not a reserved CMS slug.** `RESERVED_SLUGS` in `routes/admin.js` does not
  contain it, so a page can be created at slug `workspace`; with the enable flag **off** it is
  listed in `/sitemap.xml`, linked twice from the site nav, and returns **404**, because
  `mountPageRoute` registers `/workspace` unconditionally ahead of the CMS `/:slug` catch-all. I
  reproduced this. It is a small dent in "merging is inert" — but it is a **pre-existing pattern,
  not something this branch introduces**: `/scott`, `/product-guide`, `/market-ready-test` and
  `/where-to-start` all shadow a CMS slug of the same name today on `main`. Adding the four
  standalone prefixes to `RESERVED_SLUGS` would close the whole class.
- **The workspace router's guard assumes a mount path of `/`.** `req.path` inside a mounted router
  is the path with the mount prefix stripped, so `app.use('/x', workspace.router)` would silently
  hand `refuseUnroutedMethods` a different string from the one it is written against. It is
  mounted at `/` today and there is no reason to change that; the fragility is worth a sentence
  beside the guard, alongside the `case sensitive routing` dependency my predecessor asked to be
  written down and which is still written down nowhere in `server.js`.
- **The failure count keys on `actor` while every other window keys on `subject`.** One write site
  sets both to the same username, so they cannot diverge today, and the partial index built for
  J2 covers `(event_type, subject, ...)` rather than the column the count actually filters on. A
  latent inconsistency and a missed index, not a defect.
- **`HUMAN_CLEARANCE[username]` is an unguarded object lookup**, so a username of `constructor` or
  `toString` returns a truthy value from `Object.prototype`. It fails closed regardless, because
  `WORKSPACE_OWNER_USERNAME` must equal the username and the user id must match the row. Worth an
  `Object.hasOwn` for the same reason the rest of this module is written the way it is.
- **A non-GET request with a missing or bad CSRF token returns 500 rather than 403**, on workspace
  paths and on the control alike, so `PUT`/`DELETE`/`PATCH`/`TRACE` never actually reach
  `refuseUnroutedMethods`. Nothing leaks, because the outcome is identical on both, but the guard
  is not doing the work for those methods that its name implies, and a change to CSRF error
  handling would move that boundary without anyone opening this file. Pre-existing, raised by the
  tenth and eleventh reviews, unchanged.
- **The Scott and public APIs remain anonymously enumerable by `OPTIONS`** (`/api/scott/search`,
  `/api/leads`, `/api/product-guide/submit` all answer `200 Allow: POST`). Pre-existing on `main`
  and live in production; not a finding against this candidate, since Scott's existence is not
  claimed to be protected. Now that R1's remedy exists, someone should decide deliberately whether
  those route lists are meant to be public rather than inheriting the answer from a framework
  default.
- **The future-dating clause in the threshold window** still means five failure rows dated ahead
  produce *"0 failure(s) in the window"*. I reproduced it. It remains unreachable from the
  application's own writes, and I record it exactly as my two predecessors did.
- **A legacy database keeps one permanently unresolved claim.** Shapes 2 and 4 both end with a
  surviving `pending` row whose `subject` is `''`; the runtime reclaim matches `subject = $2` with
  a real username, so nothing will ever retire it. Raised by the eighth through eleventh reviews,
  unchanged, inert. A `WHERE subject <> ''` on the retirement would tidy it.
- **A duplicate is still possible if a send outlives the three-minute claim lease**, and **the
  in-memory unlock attempt budget still resets on any restart.** Both documented and deliberate. I
  relied on the second myself across several server restarts; a patient attacker can too.
- **`npm test` now always emits raw TAP**, because the runner pipes the child's stdout and Node
  selects its reporter from whether stdout is a TTY. Nothing is lost, but the `spec` output a
  developer used to get interactively is gone. A `--test-reporter` pass-through would restore it.
- **No live alert email has ever been delivered**, on twelve passes. The builder says so plainly,
  which is right, and the last hop of this control remains untested by anyone.
- **Three worktrees from earlier builder sessions are still attached to this repository**
  (`/tmp/wt-portal`, `/tmp/wt-ruth`, `/tmp/wt-social`, on three other branches). They are not mine
  and I did not touch them; they do not affect the frozen head. Worth pruning before a release cut
  so the checkout the decision is made on has nothing else hanging off it.
- **Who holds Railway.** F1's closure, H1's remedy and the whole third gate rest on Railway being
  reachable only by Tom. Twelve passes, no reviewer has seen it.

## 8. What remains for Tom Arrington

1. **The gates hold, and after twelve independent attempts that sentence carries as much weight as
   this process can give it.** Nobody has opened this area or taken a record out of it. Holding
   your CMS admin account and resetting your password still gets an attacker to a locked screen
   and no further; I proved both halves, including the positive control, and rotating the
   passphrase closes an open session immediately while leaving the login intact.
2. **R1 is fixed, and fixed properly.** Your last reviewer found that one capital letter walked
   past the guard. The fix is one character, and I did not take it on trust: I measured 5,742
   anonymous requests per flag state across nine methods and twenty-nine spellings, including
   unicode case-folding tricks and their encoded forms, and every real endpoint is
   indistinguishable from one that does not exist. I then reverted the character and watched the
   oracle come back, and watched the new test go red on it. I also checked every other place in
   your codebase that decides from a URL path: there are four, and the other three already fail
   safe. **The line in your project memory saying that merging this branch is inert is now true of
   the thing that finding was about.**
3. **The alarm and the concurrency work are finished.** 240 racing processes produced exactly one
   notice every time; the seed migration is right on four database shapes and idempotent on all
   of them; and when I deliberately sabotaged the code, your tests failed — 2 assertions for one
   sabotage and 16 for the other. That is the difference between a test suite and a decoration,
   and it is worth knowing you now have the first.
4. **Both findings are small, and both are in the same place: the thing that tells you which tests
   did not run.** Your builder said it had restored a check that catches two blind spots. It
   catches one of them, misses the other, and fires on some ordinary code that is not a blind spot
   at all — and the file still contains, twice, the sentence your last reviewer asked to be
   deleted. Nothing is being mis-reported to you today; I checked every suite in the tree. Fix it
   because a future session will read that comment and believe it, not because anything is at risk.
5. **One cheap thing I would ask for beyond the findings.** The fix in point 2 is currently pinned
   only by a test that does not run unless somebody starts a server and sets four environment
   variables. Removing the character again would leave `npm test` completely green. Three lines of
   ordinary unit test would close that, and given that this exact property has now cost you two
   HIGH findings and two review cycles, it is worth the three lines.
6. **Do the secret rotation.** Still yours and still outstanding:
   `WORKSPACE_ACCESS_PASSPHRASE`, `WORKSPACE_SNAPSHOT_KEY`, then `SESSION_SECRET` (which
   invalidates every CRM erasure tombstone, by design) and the account passwords.
7. **Two things this PASS does not cover, and you should not read it as covering.** First, **the
   brain's content filtering against real confidential records**: this environment holds no
   snapshot key, so the workspace ran with zero records and I tested the access surface, not the
   classification. That is the open half of finding J4 and closing it means you adding genuine
   confidential records, not the builder writing synthetic ones. Second, **the alert email has
   never actually been delivered to anybody**, on twelve passes; set `GMAIL_APP_PASSWORD` on the
   deployment and make it ring once, deliberately, before you rely on it.
8. **Why this is PASS and not a twelfth AMBER, so you can check my reasoning.** I did not award it
   out of fatigue and I looked hard for a reason not to. Everything with a security consequence
   that eleven reviews raised is closed, and I re-established each one by my own probe rather than
   by reading the remediation. The two things I found are in a test-reporting helper: they change
   nothing an attacker can do, they mis-report nothing today, and the same helper has been graded
   LOW in six consecutive reviews without ever being the reason for a verdict. Withholding a PASS
   for them, because eleven predecessors withheld one for MEDIUMs and HIGHs that no longer exist,
   would be grading the history rather than the candidate.
9. **What still cannot be verified from inside this project's tooling** after twelve passes: the
   Drive authorities, the provenance and classification of the thirty snapshot records, your own
   instructions except as quoted by the builder, and everything about Railway. Twelve independent
   passes have not moved any of those an inch, and a PASS from me does not certify them. If you
   want them certified it needs a reviewer with Drive and Railway access and, on the evidence of
   twelve passes, one not commissioned by the session whose work is being reviewed.

---

Nothing in this review was merged, deployed, connected, spent or enabled. The paid live-AI suites
were not run. My writes were confined to six throwaway databases — `ws_r12`, `ws_r12c`, `r12s1`,
`r12s2`, `r12s3`, `r12s4` — created from nothing and dropped at the end; within `ws_r12` I reset
the local `tom` password through the application's own API, briefly poisoned and then restored the
CMS `contact.email` row, created and then erased a probe contact, and created `workspace_activity`
rows for my probes, before dropping the database entirely. Every experiment needing a code change
ran in a `git worktree` under `/tmp`, which has been removed. The reviewed checkout was never
edited, the head never moved, and the working tree was clean at the first command and at the last.
