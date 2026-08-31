# Sixteenth independent Governance & Assurance review

## Arrington AI Workspace v0.1 release candidate

**Lane:** ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
**Date:** 31 August 2026.
**Candidate:** branch `feature/arrington-ai-workspace-v0-1`, frozen head
`0f03a6af7d13cd057772ee993940b871b29860b7`.
**Under review:** the V cycle — `review/workspace-v0.1-v-remediation-2026-08-31.md`,
answering the fifteenth pass (`review/workspace-v0.1-governance-review-15-2026-08-31.md`,
AMBER, V1 MEDIUM plus four LOW).

### Tree state, at the start

```
$ git rev-parse HEAD
0f03a6af7d13cd057772ee993940b871b29860b7
$ git status --porcelain
$ git rev-parse --abbrev-ref HEAD
feature/arrington-ai-workspace-v0-1
$ sha256sum data/workspace-snapshot.enc
e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2  data/workspace-snapshot.enc
```

Working tree clean: `git status --porcelain` printed nothing.

### Tree state, at the end

```
$ git rev-parse HEAD
0f03a6af7d13cd057772ee993940b871b29860b7
$ git status --porcelain
$ sha256sum data/workspace-snapshot.enc
e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2  data/workspace-snapshot.enc
$ git worktree list
/home/user/arrington-website  0f03a6a [feature/arrington-ai-workspace-v0-1]
/tmp/wt-portal                fe95238 [feature/social-portal]
/tmp/wt-ruth                  203b15a [feature/workspace-receptionist]
/tmp/wt-selffound             b08c433 [fix/self-found-v-cycle]
/tmp/wt-social                e04c516 [feature/scott-social-nav]
```

The tree did not move under me and the brain snapshot is byte-identical.
Every experiment that needed a code change ran in
`git worktree add /tmp/gov16wt 0f03a6a`, which was restored and removed;
the four other worktrees listed above are not mine and predate this
review. Nothing in the candidate was edited (finding K5's standing
correction, respected). Every database I used was created from nothing
under a throwaway role `gov16` and dropped at the end, verified:

```
$ su postgres -c "psql -lqt" | grep -i gov16
throwaway databases dropped
```

---

## 1. The bounded question

**Is the V cycle correct, and is V's remedy the sixteenth instance of the
chain's recurring defect rather than the end of it?**

The recurring defect across fifteen passes is *a security or honesty
property asserted and not held*, and in the later passes each finding was
introduced by the fix for the previous one. The two most productive
places to look have been the remedy for the previous finding, and a test
named for a property that does not exercise it under the conditions the
property claims.

---

## 2. VERDICT: PASS

**Four findings, all LOW: W1, W2, W3, W4. No MEDIUM. No HIGH. No STOP.**

The answer to the bounded question is: **the V cycle is correct on every
path a person or an attacker can reach, and it is also the sixteenth
instance — twice — but only in comments and in the test tree, not in
anything the workspace says or does.**

All five V findings are genuinely fixed and I established each one
myself rather than reading the remediation:

- **V1** is fixed on every reachable path. I drove the real endpoint with
  the model stubbed three different ways, at zero records, at three and
  four records, with and without a gap, and checked each sentence against
  the line `views/workspace/chat.ejs` renders beside it. No reachable
  sentence claims a record that did not exist.
- **V2** is fixed. The gap is reported in the passive on every branch.
- **V3(a)(b)** are fixed and the probes are committed and have real
  power; the classifier is still defeatable (W3), which the file itself
  half-concedes.
- **V4** is fixed. `npm test` is green in both environments a developer
  plausibly has.
- **V5** is fixed. Six prototype keys through three functions in both
  argument positions, plus `describeOwnerBinding()`, all closed.
- The **T2/T3 renumbering** is internally consistent across every code
  comment, both remediations and `CLAUDE.md`, and the disclosure is
  handled correctly.

**Why PASS and not AMBER.** The twelfth pass — the only PASS in the chain
— carried two LOW findings and no MEDIUM. This pass carries four LOW and
no MEDIUM, and the four are: an untrue sentence about two unreachable
branches, a test whose verb denylist is one synonym short of the property
it names, a drift guard that five ordinary JavaScript idioms walk past,
and a set of classifier fixtures that the test runner executes. Not one
of them changes what an attacker can do, what a lane can read, or what
Ruth tells Tom. Against that, I re-established with my own instruments:
all three gates across 12,654 request comparisons and 1,200 timed
requests in both flag states, anonymously and as an authenticated
uncleared CMS admin, with no observable difference from a genuinely
missing path; the full CMS-admin takeover, stopping at the unlock screen,
with a positive control; the permission legs at two clearances against
canaries I seeded, with a positive control proving the sweep can see a
leak; the alert's concurrency bound over 115 threshold-sized bursts,
against a harness I first showed breaks a defective predecessor; the
Scott firewall at module-graph level in both directions; and the
workspace adversarial suite genuinely armed, 10 of 10, with zero skips.

**Why I am not withholding a PASS.** Three consecutive AMBERs since Ruth
arrived have each rested on a reachable untruth in her output. I hunted
that specifically — I enumerated her entire output space myself, 1,080
calls, and drove every reachable combination through the real endpoint —
and there is no longer one. Awarding AMBER on four documentation and
test-hygiene findings would be withholding a PASS out of fatigue, which
is as much a failure of this lane as awarding one out of fatigue.

**What a PASS from this lane is and is not.** It is a statement that the
candidate at head `0f03a6a` holds the security and honesty properties it
claims, as far as an independent lane with this sandbox's limits can
establish. It is **not** a production release decision, which is Tom's,
and it does not clear the items in section 9 that remain his. Section 8
states plainly what I could not test.

---

## 3. Independence, and its limits

I am a separate lane from the builder and I ran my own instruments. I did
not merge, deploy or enable anything; I armed no paid suite and spent no
money; I changed no environment variable on any real deployment; I
touched Railway, Drive and production not at all. No secret value appears
in this report. The limitation to disclose: I review a candidate built by
another agent in the same repository, and my evidence is what I ran in
this sandbox, which cannot reach the live site, Railway or Drive.

---

## 4. What I did, with observed results

### 4.1 Ruth's entire reachable output space, enumerated independently

I did not read the builder's sweep. I called `handoffNote` over 27 lane-id
values (the nine real ids plus `constructor`, `__proto__`, `toString`,
`valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`,
`toLocaleString`, `not-a-lane`, `''`, `null`, `undefined`, `0`, `false`,
`[]`, `{}`, `['google_ads']`, `'GOOGLE_ADS'`) × 2 answered × 2 gapRaised
× 10 record counts (`0, 1, 2, 7, -1, NaN, Infinity, null, undefined,
'3'`):

```
$ node /tmp/gov16/ruth-enum.js
CALLS 1080
DISTINCT 99
```

Ninety-nine distinct strings, which reduce to **six sentence shapes**
(the rest is the lane name and the count). No prototype member ever
produced a colleague; every crafted id fell to the no-lane branch; no
call threw. T3 holds at the receptionist, independently.

The six shapes, with the branch that produces each:

| # | branch | sentence |
|---|---|---|
| 1 | no lane, not answered | *I could not tell who holds that. Say a bit more and I will place it.* |
| 2 | no lane, answered, n=0 | *That did not match one of the specialists, and there was no record on file to answer it from.* |
| 3 | no lane, answered, n>0 | *That did not match one of the specialists, so it was answered from N records in the general context.* |
| 4 | lane, not answered | *I took that to X, and there is nothing on file that answers it.* |
| 5 | lane, answered, n=0 | *X answered from what they hold. No specific record is behind it, so treat it as their reading rather than as evidence.* |
| 6 | lane, answered, n>0 | *I took that to X, who answered from N records. The provenance is listed with the answer.* |

Shapes 1 and 4 are **unreachable** — see W1.

Then I drove the **real endpoint**, with the model stubbed through the
module's own `__setClientFactoryForTests` from a `--require` preload so
the candidate's source was untouched. Zero-record state (the documented
unseeded brain):

```
Q="how much cash do we have"                 lane=null   prov=[] gap=null
  RUTH: That did not match one of the specialists, and there was no record on file to answer it from.
Q="zzz qqq wibble"                           lane=null   prov=[] gap=null   -> same sentence
Q="anything" forcedLane="constructor"        lane=null   prov=[] gap=null   -> same sentence
Q="anything" forcedLane="__proto__"          lane=null   prov=[] gap=null   -> same sentence
Q="anything" forcedLane="toString"           lane=null   prov=[] gap=null   -> same sentence
Q="anything" forcedLane="not-a-real-lane"    lane=null   prov=[] gap=null   -> same sentence
Q="tell me about the google ads campaign"    lane="google_ads" prov=[] gap=null
  RUTH: ARRINGTON GOOGLE ADS answered from what they hold. No specific record is behind it,
        so treat it as their reading rather than as evidence.
```

**V1 is fixed.** The sentence the fifteenth review found — *"it was
answered from the general records"* on a turn with no records — is gone,
and the honest sentence that used to be unreachable is now the one that
runs.

Then with six records seeded at three sensitivities, and with a gap:

```
Q="zzz qqq wibble no records here"  prov=[3 keys] gap=missing
  RUTH:        That did not match one of the specialists, so it was answered from 3 records
               in the general context. The gap has been written down rather than let pass.
  AS RENDERED: ... · Records supplied: gov16.std.authority, gov16.comm.strategy,
               gov16.conf.strategy · Gap raised: missing

Q="tell me about the google ads campaign"  lane="google_ads" prov=[3 keys] gap=missing
  RUTH:        I took that to ARRINGTON GOOGLE ADS. They answered, but the 3 records behind it
               do not fully cover the question. The gap has been written down rather than let pass.
```

The count Ruth speaks equals the provenance list the interface prints
beside it, on every turn I produced. **V2 is fixed**: no reachable
sentence attributes the gap write to her, and `repo.createGap` is awaited
before the response is composed, so *"has been written down"* is true at
the moment it is said.

### 4.2 Do the new tests catch what they are named for? Mutation testing

I put five mutations into a worktree copy at the frozen head and ran the
candidate's own `test/workspace/receptionist.test.js` against each:

| mutation | result |
|---|---|
| M1 reintroduce V1 (unconditional general-records claim) | **RED** — `not ok 7 - she never claims a record when there was none, and says so when there was` |
| M2 reintroduce V2 (*I have written the gap down*) | **RED** — `not ok 6 - she never claims an act she did not perform` |
| M3 reintroduce U1 (*I answered that one myself*) | **RED** — `not ok 6` |
| M4 a NEW authorship claim: *and I checked the 3 records behind it myself* | **GREEN — not caught** |
| M5 an absence-of-records claim on a turn that had records | **GREEN — not caught** |

The three regressions the chain actually found are genuinely pinned. M4
and M5 are findings W2 and W1 respectively.

### 4.3 The three gates, re-established from nothing

A server was booted against a freshly created and seeded throwaway
database, first with `ENABLE_ARRINGTON_AI_WORKSPACE` unset:

```
Workspace access: ENABLE_ARRINGTON_AI_WORKSPACE is not 'true', so the workspace does not exist in this environment
```

**Flag OFF, anonymous.** 21 real workspace paths (12 pages, 9 APIs), each
put through 9 spellings (plain, upper case, mixed case, trailing slash,
doubled leading slash, `/..`, percent-encoded, query string, matrix
parameter) × 10 methods (GET, HEAD, POST, OPTIONS, TRACE, PATCH, PUT,
DELETE, PROPFIND, SEARCH) × 3 Accept values, each compared against a
**shape-matched** control path of the same segment count. Comparison is
status + the full normalised header set + a SHA-256 of the body, with
per-request nonces normalised inside both.

```
$ PROBE_PORT=3116 node /tmp/gov16/gates2.js
TOTAL 5670 MISMATCH 0     (see note)
```

Note, stated because I got it wrong first: the raw run reported 6
mismatches, all on the `/..` variant, all of them a `Location:` header
differing by one byte because `workspace` is nine characters and my
control segment was ten. An equal-length control settles it:

```
/workspace/..  -> 301 len=162 loc=http://127.0.0.1:3116/
/zqnotreal/..  -> 301 len=162 loc=http://127.0.0.1:3116/
/wxrkspace/..  -> 301 len=162 loc=http://127.0.0.1:3116/
```

Identical. The `/..` redirect is generic Express behaviour for any
single-segment path, not a workspace oracle.

**Flag ON, anonymous** — 21 paths × 6 spellings × 9 methods × 3 Accepts:

```
=== ANONYMOUS, FLAG ON ===
TOTAL 3402 MISMATCH 0
```

**Flag ON, as an authenticated CMS admin who holds no clearance (`nat`)**:

```
=== AS UNCLEARED CMS ADMIN (nat), FLAG ON ===
TOTAL 3402 MISMATCH 0
```

**A gap in my own first sweeps, which I then closed.** For POST, all
three sweeps above were comparing the site's global CSRF refusal (403,
18 bytes) rather than the workspace guard, because an anonymous POST
without a token never reaches it. I re-ran POST with a **valid**
anonymous CSRF token:

```
anonymous csrf token present: true
/api/workspace/ask            validCSRF=404/4282 noCSRF=403/18 badCSRF=403/18
/api/workspace/unlock         validCSRF=404/4282 noCSRF=403/18 badCSRF=403/18
/api/workspace/lock           validCSRF=404/4282 noCSRF=403/18 badCSRF=403/18
/api/workspace/contacts/sync  validCSRF=404/4282 noCSRF=403/18 badCSRF=403/18
/api/zqnotreal/zzz            validCSRF=404/4282 noCSRF=403/18 badCSRF=403/18
/api/leads                    validCSRF=400/40   noCSRF=403/18 badCSRF=403/18
```

and then swept it properly, 9 APIs × 5 spellings × 2 Accepts, in both
flag states:

```
=== FLAG ON  === POST-with-valid-CSRF sweep: TOTAL 90 MISMATCH 0
=== FLAG OFF === POST-with-valid-CSRF sweep: TOTAL 90 MISMATCH 0
```

A real endpoint and a fabricated sibling are byte-identical. **12,654
comparisons in total, zero real differences.**

**Timing**, 120 requests per path per state:

```
=== FLAG OFF, anonymous ===            === FLAG ON, anonymous ===
/workspace          median 2.35ms      /workspace          median 2.62ms
/workspace/chat     median 2.39ms      /workspace/chat     median 2.37ms
/api/workspace/ask  median 1.00ms      /api/workspace/ask  median 0.95ms
/zqnotreal1         median 2.44ms      /zqnotreal1         median 2.56ms
/api/zqnotreal/zzz  median 0.88ms      /api/zqnotreal/zzz  median 0.96ms
```

No separation: a workspace path and a missing path are within noise of
each other, and the flag state moves nothing.

### 4.4 The CMS-admin takeover, executed end to end

This is the attack finding F1 exists for, and I ran the whole of it
rather than inheriting it. `nat` is a CMS admin; `tom` is the cleared
owner.

```
1. nat (admin) login: 302 /
2. admin nat GET /workspace: 404 len 4282 (no x-robots-tag)
   control /zqnotreal:      404 len 4282
   IDENTICAL LENGTH: true
3. admin resets tom password: 200 {"success":true}
4. login as tom with attacker password: 302 /
5. GET /workspace as seized tom: 302 /workspace/unlock
6. unlock screen: 200
   POST /api/workspace/ask            -> 404 len 4282
   POST /api/workspace/contacts/1/erase -> 404 len 4282
   POST /api/workspace/lock           -> 200 len 11
7. guess 0..3 -> 401 {"error":"That passphrase is not correct."}
8. real passphrase -> 429 {"error":"Too many attempts. Wait fifteen minutes."}
```

The attacker holds Tom's username and Tom's user id and reaches the
unlock screen and nothing else. Every API returns the site's own 404,
byte-for-byte the length of a genuinely missing page, including the
erasure endpoint. Step 8 is the unlock limiter refusing my own positive
control after five attempts, which is itself the limiter working; the
positive control was established separately in the same environment,
where the correct passphrase returned `200 {"ok":true}` and opened
`/workspace`. `POST /api/workspace/lock` answering 200 to a
cleared-but-locked session is correct and discloses nothing: it is
behind `requireWorkspaceIdentity`, so only somebody already looking at
the unlock screen can reach it, and all it does is forget a session fact.

**Passphrase rotation**, which I re-established rather than inherited:
same session cookie, one server with the original passphrase and one
with a rotated one, sharing the Postgres session store.

```
unlock on 3119: 200 {"ok":true}
GET /workspace on 3119 (same passphrase):    200
GET /workspace on 3123 (ROTATED passphrase): 302 /workspace/unlock
  still logged in to the CMS on 3123?        302 /   (yes)
```

Rotating the passphrase invalidates an open unlock immediately and leaves
the CMS login intact.

### 4.5 The permission legs, with canaries I built

I seeded six records into a throwaway database at three sensitivities
across four source classes, each carrying a distinctive canary token, and
replaced the model with a stub that **echoes the entire prompt back**, so
anything the model could see appears in the response.

As the owner (`owner_admin`), over the real endpoint:

```
Q="how much cash do we have"                    lane=null
  prov=[std.authority, comm.strategy, conf.strategy]
  canaries the MODEL saw: ALPHA(std/authority), BRAVO(comm/strategy), CHARLIE(conf/strategy)
Q="tell me about the google ads campaign"       lane="google_ads"   (ceiling: commercial)
  prov=[std.authority, comm.strategy, comm.technical]
  canaries the MODEL saw: ALPHA, BRAVO, ECHO(comm/technical)      <- CHARLIE withheld by the ceiling
Q="what is in the control pack for the workspace" lane="ai_workspace_builder"
  canaries: ALPHA, BRAVO, ECHO, FOXTROT(std/control_pack)         <- CHARLIE, DELTA withheld
Q="tell me about an opportunity in the pipeline"  lane="opportunity_builder"
  canaries: ALPHA, BRAVO, CHARLIE, DELTA(conf/opportunity)
```

The lane leg bites exactly where the published remit says it should: the
Google Ads lane never sees the confidential record or the control pack,
the workspace-builder lane never sees the opportunity, and the general
context never sees either. Filtering happens **before** the prompt exists
— the withheld records are absent from the echoed prompt, not redacted
out of an answer.

Across every clearance × lane combination, at the function that builds
the prompt:

```
$ node /tmp/gov16/legs.js
combinations: 60 leaks to non-owner clearances: 0

ws_restricted sample:
  null              ["gov16.std.authority"]
  google_ads        ["gov16.std.authority"]
  website_hosting   ["gov16.std.authority","gov16.std.control"]
unrecognised clearance sample:
  constructor null              []
  constructor google_ads        []
```

An unrecognised clearance — including a prototype key — yields nothing at
all, not the owner view.

**And on the rendered surfaces**, which is the check that found the
per-field leak in Scott. There is no login for the synthetic narrow
clearance, so I ran a worktree copy with `HUMAN_CLEARANCE` mapping `tom`
to `ws_restricted`, swept every workspace page and the ask API for the
commercial and confidential canaries, their record titles and their
record keys, and then ran **the identical sweep against an unpatched
worktree at owner_admin as a positive control**:

```
=== NARROW CLEARANCE ===                    === POSITIVE CONTROL (owner_admin) ===
/workspace              clean               /workspace              clean
/workspace/brain        clean               /workspace/brain        LEAK -> BRAVO, CHARLIE, DELTA, ECHO,
/workspace/brain?q=gov16 clean                                              4 titles, 4 record keys
/workspace/brain?q=CANARY clean             /workspace/brain?q=gov16  LEAK -> (same)
/workspace/opportunities clean              /workspace/opportunities  LEAK -> DELTA, title, key
/workspace/projects     clean               ...
/workspace/social       clean
/workspace/contacts     clean
/workspace/workforce    clean
/workspace/approvals    clean
/workspace/gaps         clean
/workspace/activity     clean
/workspace/chat         clean
ASK x4: prov=["gov16.std.authority"] only   ASK x4: prov includes conf + comm records
PAGES/APIS CHECKED: 17  LEAKS: 0            PAGES/APIS CHECKED: 17  LEAKS: 4
```

The sweep can see a leak; at the narrow clearance there is none, on 17
surfaces, and the narrow reader's prompt context is one standard record
and nothing else.

**Counts after filtering** is visible in the same runs: Ruth says "3
records" / "4 records" and the interface lists exactly those keys, and at
the narrow clearance she says one — the size of the withheld set is never
exposed.

**Conversation history (finding F7)**, again with a positive control.
Conversation 12 was answered at `owner_admin` and its provenance names a
confidential record:

```
=== NARROW CLEARANCE ===                        === POSITIVE CONTROL owner_admin ===
conversation 12: listed=false confidential=false  conversation 12: listed=true confidential=true
conversation 20: listed=true  confidential=false  conversation 20: listed=true  confidential=false
conversations listed: 4                           conversations listed: 23
```

Narrowing the reader's clearance narrows their own transcript with it.

### 4.6 The alert's boundedness, with a control that breaks

I wrote my own harness and applied finding K2's lesson first: the pool is
**warmed** before the burst, because a cold pool serialises by accident
and makes a broken guarantee look sound.

Frozen head, three profiles, 115 threshold-sized bursts in total:

```
{"ROUNDS":25,"CALLERS":12,"SHORT":false,"ok":25,"dup":0,"silent":0}
{"ROUNDS":30,"CALLERS":16,"SHORT":true, "ok":30,"dup":0,"silent":0}
{"ROUNDS":60,"CALLERS":16,"SHORT":true, "ok":60,"dup":0,"silent":0}
```

The same harness against a worktree copy with the advisory lock disabled
— the pre-K1 shape — 90 bursts:

```
{"ROUNDS":30,"CALLERS":16,"SHORT":true,"ok":29,"dup":1,"silent":0}
  {"round":5,"kind":"DUP","sends":2,"byType":{"workspace_unlock_alert_sent":2}}
{"ROUNDS":60,"CALLERS":16,"SHORT":true,"ok":59,"dup":1,"silent":0}
  {"round":58,"kind":"DUP","sends":2,"byType":{"workspace_unlock_alert_sent":2}}
```

Two duplicate notices in 90 bursts against the defective predecessor,
zero in 115 against the candidate. The property is established by an
instrument first shown able to break it.

**One negative result, reported rather than buried.** Twelve separate
processes racing a shared start instant, using the candidate's own
`scripts/workspaceUnlockClaimWorker.js`, produced 12 clean rounds against
the frozen head **and 12 clean rounds against the lock-disabled control**:

```
ROOT=/home/user/arrington-website ROUNDS=12 ok=12 dup=0 silent=0
ROOT=/tmp/gov16wt                 ROUNDS=12 ok=12 dup=0 silent=0
```

That is not a failed control, it is a second mechanism doing its job: the
partial unique index `uq_workspace_alert_pending` refuses a second
unresolved claim regardless of the lock, so at the claim step alone the
duplicate cannot form. The lock is what closes the *later* window — a
decision older than the write it authorises, after a pending row has
been resolved and the slot freed — which is what my in-process harness
exercises and what produced the two duplicates above. Worth recording:
the guarantee here is held by two independent mechanisms, and a probe
that only races `claimAlertSlot` will not see the one the lock provides.

```
uq_workspace_alert_pending | CREATE UNIQUE INDEX ... ON workspace_activity (subject)
                             WHERE event_type = 'workspace_unlock_alert_pending'
```

### 4.7 The prototype class (V5), swept independently

```
$ node /tmp/gov16/proto.js
PROTOTYPE SWEEP: bad = 0
LANE SWEEP: bad = 0
```

Ten prototype keys (`constructor`, `__proto__`, `toString`, `valueOf`,
`hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`,
`toLocaleString`, `__defineGetter__`, `__lookupGetter__`) through
`clearanceForUser`, `clearanceCanSeeSensitivity` in both argument
positions, `clearanceCovers` in both, `clearanceCanSeeRecord`,
`filterRecordsForClearance` and `laneById` — nothing truthy anywhere. And
`describeOwnerBinding()` with each of those as `WORKSPACE_OWNER_USERNAME`
reports the binding as **not** ok, which is the specific consequence V5
named.

I then re-ran the hunt the fourteenth review reported as clean and the
fifteenth found two survivors in. My scan finds every prototype-bearing
map declaration in `lib/`, `routes/`, `middleware/`, `db/` and
`server.js` and every non-numeric dynamic index on it: 92 sites. Of
those, the only workspace-relevant ones are
`lib/workspace/social/registry.js`'s `PLATFORMS[id]`, and I chased the
reachability by hand: `isConfigured` is only ever called with ids from
`PLATFORM_IDS`; `connectorMayDo` is only called from
`assertAutonomousAllowed`, which **has no caller anywhere in the
repository**; and `POST /api/workspace/social/request-action`, the one
route that takes a `platform` from the request body, passes it only into
a template string and never into a map lookup. No request-derived value
reaches a prototype-bearing map in the workspace. The remaining sites are
keyed by database column names, hardcoded object keys, page slugs or role
names constrained by a `CHECK` constraint.

### 4.8 The Scott firewall, at module-graph level

```
modules reachable from receptionist.js:
  lib/workspace/receptionist.js
  lib/workspace/lanes.js
SCOTT MODULES REACHED: 0
WORKSPACE MODULES REACHED FROM lib/scott/*: 0
```

Transitive, not a regex over the file's own `require` calls — which is
what the candidate's own test does, and is weaker.

### 4.9 `npm test`, in both plausible developer environments

The environment `CLAUDE.md`'s Development section tells a developer to
create (`DATABASE_URL`, `SESSION_SECRET`, `NAT_PASSWORD`, `TOM_PASSWORD`):

```
# tests 566   # suites 53   # pass 564   # fail 0   # skipped 2
```

The same with the workspace variables also exported — a developer who has
been working on this feature — on a separately created and seeded
database:

```
# tests 566   # pass 564   # fail 0   # skipped 2
```

**V4 is fixed.** Both runs print both honesty reports, and they agree: the
runner's own `5 SUITE(S) DID NOT RUN` read from the emitted `# SKIP`
directives, and `gatedSuites.test.js`'s `GATED SUITES: 5 of 5 did NOT
run` with what arms each.

### 4.10 The workspace adversarial suite, genuinely armed

Run by hand against a running instance with all five variables set,
including `WORKSPACE_TEST_PASSPHRASE` so the post-unlock half actually
asserts:

```
ok 8 - the right passphrase opens it, and every page is noindex
ok 9 - erasure refuses a mismatched confirmation even for Tom
1..9
ok 1 - adversarial workspace checks
# tests 10   # pass 10   # fail 0   # skipped 0
```

Zero skipped. This is the run the release note asks for and it is green.

### 4.11 Social write refusal, by construction

```
ACTION_CLASS_HUMAN: ["publish","delete","reply_publicly","send_message",
                     "change_account_settings","advertising_spend"]
AUTONOMOUS:         ["read","analyse","draft"]
facebook  scopes: ["pages_read_engagement","pages_read_user_content","read_insights"]
instagram scopes: ["instagram_basic","instagram_manage_insights"]   (the one justified exception)
linkedin  scopes: ["r_organization_social","r_organization_admin"]
x         scopes: ["tweet.read","users.read"]
violations: 0
```

Every consequential action is false for every platform and
`assertAutonomousAllowed` throws for every one of the 24 combinations.
No credential is present in the environment; `instagram_manage_comments`
is still absent (finding F5).

---

## 5. Findings

### W1. *"The record clause is derived from the count on every branch"* is untrue on two branches, and those two branches are unreachable because `answered` is an inert parameter. Severity: LOW

**What is claimed.** `lib/workspace/receptionist.js` states as rule 1 that
"the record clause is now derived from `n` on every branch rather than
written into a string." `CLAUDE.md` states "The record clause is now
derived from the count on every branch, so no path can mention records
without records having existed." The V remediation states "The record
clause is now derived from the count on every branch, so there is no path
on which a sentence can mention records without records having existed."

**What is true.** Two branches carry a hard-coded record clause that `n`
does not touch:

```
if (!answered) {
  return `I took that to ${who}, and there is nothing on file that answers it.`;
}
```

and its gap-raised twin. With `recordCount: 7` those sentences assert that
nothing is on file while seven records were supplied. Demonstrated from
my enumeration:

```
{"lid":"\"google_ads\"","answered":false,"gapRaised":false,"rc":"0"}
I took that to ARRINGTON GOOGLE ADS, and there is nothing on file that answers it.
```

— the same string is returned for `rc` of 1, 2 and 7.

**Why it cannot be reached.** `answered` comes from
`answered: !!result.answer` at the single call site, and
`parseReply` in `lib/workspace/orchestrator.js` rejects a reply whose
`answer` is not a non-empty trimmed string:

```js
if (typeof parsed.answer !== 'string' || !parsed.answer.trim()) return { error: 'missing answer' };
```

A reply that fails twice returns `{ ok: false }` and the route answers
503 before Ruth is called. Verified end to end with a stub returning a
whitespace answer:

```
ask status 503
ask body {"error":"Model reply broke the contract twice: missing answer"}
```

So `answered` is **always true in production**, three of Ruth's six
sentence shapes are dead, and the parameter changes nothing — which is
finding T2 (`gapRaised` passed every turn and changing nothing) recurring
one parameter along, in the same function, three cycles later.

**Why the test cannot see it.** `test/workspace/receptionist.test.js`'s
V1 case sweeps `answered ∈ {true, false}` but scopes its positive
direction with `if (answered)`, so it never pairs `answered: false` with
a non-zero count — the only combination in which the untruth appears.
Mutation M5 in section 4.2 confirms it: a sentence asserting an absence
of records on a turn that had records passes the suite.

**What would close it.** Either derive the clause on those branches too
(`n ? 'the N records behind it do not answer it' : 'there is nothing on
file that answers it'`), or delete the `answered` parameter and the three
dead shapes with it and correct the three controlled statements — which
is the stronger fix, because an inert parameter invites a future caller
to pass something the branches were never reasoned about. Either way the
sentence in `CLAUDE.md`, in the module and in the V remediation must be
made true or narrowed to what holds.

### W2. *"She never claims an act she did not perform"* is asserted by a denylist of eight verbs, and a fifth instance is one synonym away. Severity: LOW

**What is claimed.** The test named `she never claims an act she did not
perform` is presented in the V remediation as the correction of V2, whose
whole content was that the previous regex "was written narrowly enough to
miss it."

**What is true.** The regex is now

```js
/\bI(?:'ve|’ve| have| had| already)?\s+(?:answered|wrote|written|recorded|logged|noted|raised|worked (?:it|that) out)\b/i
```

which widened the *auxiliary* and left the *verb list* a denylist of
eight. It does not cover `checked`, `read`, `reviewed`, `looked`, `found`,
`summarised`, `decided`, `chose`, `compiled`, `verified` or any other
ordinary way of claiming an act. Demonstrated by mutation M4:

```
M4 NEW authorship claim not in the denylist (I checked / I read)
   -> GREEN (test did NOT catch it)
```

The mutated sentence was *"I took that to X, and I checked the 3 records
behind it myself before passing it on."* — an explicit claim to have read
records she cannot read, on a reachable branch, passing a suite named for
exactly that property.

**This is not a present defect.** No reachable sentence today claims an
act she did not perform; I enumerated all 99 outputs and checked them by
hand. It is a defect in what the test *establishes*, which is the shape
the chain has recorded at K2, M1, N1, P1 and V2 and which V2's own
remediation names.

**What would close it.** The output space is finite and small — six
sentence shapes. Pin the permitted set rather than forbidding a list of
verbs: assert that every reachable output is a member of an explicitly
declared set of sentence templates, so a new sentence has to be added
deliberately and reviewed, in the same spirit as `NOTE_FIELDS` throwing
on an undeclared field.

### W3. The extracted classifier is still walked past by five ordinary JavaScript idioms, in the direction the file says it must at least cover. Severity: LOW

`test/gatedSuites.test.js` says the source scan "must at least catch the
shapes the runner is blind to" — a suite that never registers, and an
early return. I wrote ten probes against the real
`test/helpers/gatedSuiteScan.js`:

```
MISSED   A destructure-process-then-env   -> null      const { env } = process;  if (env.RUN_LIVE_THING)
MISSED   B require-process-inline         -> null      if (require('process').env.RUN_LIVE_THING)
MISSED   C bracket-env-alias              -> null      const e = process['env'];  if (e.RUN_LIVE_THING)
MISSED   D alias via Object.assign        -> null      const e = Object.assign({}, process.env);
MISSED   G alias read via bracket         -> null      const E = process.env;  if (E['RUN_LIVE_THING'])
FLAGGED  E globalThis                     -> reads RUN_LIVE_THING
FLAGGED  F alias with wide spacing        -> reads RUN_LIVE_THING
FLAGGED  H skip directive on env          -> reads RUN_LIVE_THING
FLAGGED  I early return two-line          -> returns early on configuration
FLAGGED  J destructure with rename        -> reads RUN_LIVE_THING, armed, env, process
```

All five misses register nothing when the gate is absent, so the runner
half cannot see them either. That is the ninth consecutive cycle in which
this check is defeated.

**Nothing in the real tree exploits it.** I wrote my own stricter,
independent scan over every `*.test.js` in the tree and cross-checked the
declared list:

```
UNDECLARED resetUserPasswords.test.js       gates=[] registers=true early=false skipDirective=true
UNDECLARED scott/access.test.js             gates=[] ...
UNDECLARED workspace/unlockAlert.test.js    gates=[] ...
   (eight more, all gates=[] — DATABASE_URL only, the deliberate exclusion)
DECLARED  scott/adversarialApi.test.js      gates=[SCOTT_TEST_BASE_URL,SCOTT_DEMO_STAFF_PASSWORD]
DECLARED  scott/liveAiPressure.test.js      gates=[ANTHROPIC_API_KEY]
DECLARED  waiSeedMode.test.js               gates=[WAI_SEED_TEST_DATABASE_URL]
DECLARED  workspace/adversarialApi.test.js  gates=[WORKSPACE_TEST_BASE_URL, ... , WORKSPACE_TEST_PASSPHRASE]
DECLARED  workspace/liveAiPressure.test.js  gates=[RUN_WORKSPACE_LIVE_AI]
```

Every suite that gates on anything beyond a database is declared. So this
is latent drift risk, not a present hole. **False positives:** I could not
produce one against any real file, so V3(b) holds.

**What would close it.** The nine cycles of evidence say pattern-matching
the shape of a gate is unwinnable. The winnable version is to stop
inferring: give the scan a positive obligation instead — every
`*.test.js` must either register at least one test that runs under a bare
`DATABASE_URL`-only environment, or be in `GATED` — measured by running
the tree twice and diffing what registered, rather than by reading
source. Failing that, the file's sentence should be narrowed from "must
at least catch the shapes the runner is blind to" to a list of the shapes
it does catch, so the claim matches the code.

### W4. *"The runner never executes them"* is false, and the run cited as evidence proves it. Severity: LOW

**What is claimed.** `test/gatedSuiteScan.test.js`:

> The fixtures are plain .js, not .test.js, so the runner never executes
> them and the scan's own walk never collects them: they are source to be
> classified, not suites to be run.

**What is true.** Node's default test-file discovery includes
`**/test/**/*.js`, so `npm test` — which is `node --test` with no paths —
executes all twelve fixtures and the helper. From the frozen head's own
green run:

```
# Subtest: test/fixtures/gatedSuiteProbes/must-flag-alias-read.js
ok 5 - test/fixtures/gatedSuiteProbes/must-flag-alias-read.js
...
# Subtest: a suite the runner calls PASSING because it returned early
ok 23 - a suite the runner calls PASSING because it returned early
# Subtest: test/helpers/gatedSuiteScan.js
ok 20 - test/helpers/gatedSuiteScan.js
```

The second half of the sentence is true — `everyTestFile` collects only
`*.test.js` — but the first half is exactly wrong, and the evidence run
the remediation cites contains the refutation.

**Two consequences, both small and both real.**

*It makes `npm test` sensitive to an ambient variable, which is the
finding V4 was.* `must-flag-early-return.js` throws when `SOME_LIVE_FLAG`
is set. Isolated on one database, same everything, flag the only
difference:

```
without SOME_LIVE_FLAG: # tests 566  # pass 551  # fail 13
with    SOME_LIVE_FLAG: # tests 566  # pass 550  # fail 14
  not ok 23 - a suite the runner calls PASSING because it returned early
  error: 'never reached'
```

(The 13 shared failures are that database's rewritten account passwords
from an earlier run of mine, not the candidate. The isolated difference
is exactly one test, and it is the fixture.) The V3 commit therefore
reintroduced, in the test tree, the class of defect the V4 commit removed
from it, on the same day.

*It pollutes the report built specifically to stop a reader being misled
about coverage.* With no `DATABASE_URL`, a fixture appears in the honest
"what did not run" block as though it were a gated suite:

```
$ env -u DATABASE_URL node scripts/runTests.js test/fixtures/gatedSuiteProbes/must-pass-database-only-gate.js
  1 SUITE(S) DID NOT RUN. The counts above do not cover them.
  ----------------------------------------------------------------
  [SKIP] nothing to do without a database
         (no reason given)
```

**What would close it.** Move the fixtures out of `test/` (for example to
`fixtures/gatedSuiteProbes/`, with `gatedSuiteScan.test.js` reading them
by path), or give the runner an explicit exclusion. Then correct the
sentence. The twelve fixture entries also inflate the headline count, so
the corrected tree will report fewer tests, which is the honest number.

---

## 6. What I re-established myself

- Ruth's entire output space, 1,080 calls, 99 strings, 6 shapes, enumerated
  without reading the builder's sweep, then driven through the real
  endpoint under three different model stubs.
- The V1, V2 and U1 regressions genuinely going red under mutation, and
  two mutations the suite misses.
- All three gates: 12,654 request comparisons across 21 real paths, nine
  spellings, ten methods, three Accept values, both flag states,
  anonymous and as an authenticated uncleared CMS admin, against
  shape-matched controls, comparing status, the full header set and the
  body; plus 1,200 timed requests.
- The CMS-admin takeover end to end, with a positive control.
- Passphrase rotation invalidating an open unlock while leaving the CMS
  login intact.
- The permission legs: 60 clearance × lane combinations at the prompt
  builder, canary-echoing prompts over the real endpoint, and a
  17-surface rendered sweep at the narrow clearance with a positive
  control at the owner clearance showing the same sweep can see a leak.
- Counts computed after filtering, and filtering before prompt
  construction, both observed rather than read.
- Conversation history gated on the clearance it was answered at, with a
  positive control.
- The alert's bound over 115 bursts with a warmed pool, against a harness
  first shown to break a lock-free predecessor twice in 90 bursts; plus
  12 rounds of 12 racing processes, and the second mechanism (the partial
  unique index) identified.
- The prototype class swept across 92 dynamic-lookup sites and traced to
  reachability by hand.
- The Scott firewall at module-graph level in both directions.
- `npm test` green in two plausible developer environments.
- The workspace adversarial suite armed and green, 10 of 10, zero skips.
- The social layer's refusal set, 24 platform × action combinations.
- The T2/T3 renumbering, checked citation by citation against the
  thirteenth review.

## 7. What I inherited rather than re-established

- The correctness of the fourteen prior findings' fixes outside the areas
  above. I re-tested F1, F2, F7, F8, G1, G5, G6, G7, H1, H2, H3, H5, J1,
  K1, L2, N4, Q1, R1, T2, T3, U1, U5 and V1–V5 either directly or as a
  side effect of the sweeps; I did not re-derive the others.
- That the boot line's report of the alert being inert without
  `GMAIL_APP_PASSWORD` matches what a real send would do — I read the
  code and the boot output, I sent no mail.
- Everything the previous fifteen reviews established about the Scott
  demonstration beyond the firewall check.

## 8. What I could not test, stated plainly

- **No live alert email has ever been delivered**, on sixteen passes.
  `GMAIL_APP_PASSWORD` is unset here and I did not set it. The boot line
  says so honestly, which is finding H3 working, but the end-to-end mail
  path is unproven.
- **The paid live-AI suites were not armed** and no money was spent. Every
  model interaction in this review used a stub.
- **Railway, Drive and the live domain are unreachable from this
  sandbox.** Staging and production behaviour is not verified here by
  anyone.
- **The brain runs with zero real records here.** My canaries test the
  filter; they cannot test the *tagging* — whether genuinely confidential
  Arrington material is marked confidential in the real snapshot. That is
  J4's open half and it is still open.
- **There is one real human clearance.** `ws_restricted` has no login, so
  the rendered-surface sweep at a narrow clearance required a worktree
  patch. It is a faithful test of the machinery, not of a real second
  user, because no real second user is approved.
- **The Scott adversarial suite was not run.** Scott is live production
  and outside this candidate's bounded question; I checked only the
  firewall.
- I did not review `views/workspace/*` for visual correctness, only for
  escaping and for the lines rendered beside Ruth's.

## 9. What remains Tom's, not the builder's, and not mine

1. **The production release decision itself.** A PASS from this lane says
   the candidate holds its claimed properties; it does not enable
   anything. Merging is inert (`ENABLE_ARRINGTON_AI_WORKSPACE` unset),
   and I re-established that with 5,670 flag-off probes.
2. **Rotating the secrets named in findings K4 and L3 before production**
   — `WORKSPACE_ACCESS_PASSPHRASE`, `WORKSPACE_SNAPSHOT_KEY`,
   `SESSION_SECRET` and the account passwords. That instruction stands
   from the sixth review and nothing in this pass discharges it.
3. **J4's open half: seeding enough genuine confidential records** that
   the tagging, not merely the filter, can be tested. Only Tom can supply
   real confidential material; the builder writing synthetic records into
   the real snapshot would defeat the purpose.
4. **`lib/scott/clearance.js`'s `personaDomains` fail-open**, still
   untouched, still live in production Scott, still outside this
   candidate. Correct to leave it here; it needs its own change.
5. **Setting `WORKSPACE_ALERT_EMAIL` and `GMAIL_APP_PASSWORD` on the
   deployment**, or accepting knowingly that the failed-unlock alarm is
   inert. The boot line will say which.
6. **Running the adversarial suites by hand against the actual deployment
   before the release decision**, as the suite's own report insists. I ran
   the workspace one green against a local instance; that is evidence
   about the code, not about the deployment.

## 10. Observations that are not findings

- **Grammar.** At one record Ruth says *"the 1 record behind it do not
  fully cover the question"*. Cosmetic, in the owner's own interface.
- **Ruth's line is not persisted.** Reloading a conversation renders the
  stored messages with `Records supplied: …` but no receptionist note, so
  she disappears from history. Consistent and not misleading, just uneven.
- **`answered` and the three dead shapes** are covered by W1; if the
  parameter is removed, three of the nine picker-visible sentence forms
  go with it and the module gets shorter.
- **The T2/T3 disclosure is handled correctly.** Reviews 14 and 15 still
  carry the reversed labelling and were rightly left alone; the code,
  both remediations and `CLAUDE.md` now follow the thirteenth review, and
  the T remediation carries a dated note at its head. A reader of reviews
  14 or 15 should read that note first.
- **`POST /api/workspace/social/request-action` does not validate
  `platform`** against `PLATFORM_IDS`; an arbitrary string lands in an
  approval title. Not a leak and not an execution path — the approval
  record executes nothing — but an approval can name a platform that does
  not exist.

---

## 11. Closing

The V cycle is correct. Every one of the five findings is genuinely
fixed, and the three that matter most — the receptionist's honesty about
what an answer rests on, the null-prototype maps, and a green `npm test`
that does not depend on the caller's shell — I established myself rather
than reading them.

It is also the sixteenth instance, twice over: a sentence in
`CLAUDE.md`, in the module and in the remediation that is not true of two
branches, and a sentence in the new test file that the builder's own
evidence run refutes. Both are LOW because both live in comments and in
the test tree; neither reaches Tom, and neither reaches an attacker. The
pattern is worth naming for the seventeenth time anyway, because it is
now the only pattern this chain still finds: the code has stopped being
wrong and the sentences about the code have not quite caught up.

**VERDICT: PASS**, with four LOW findings (W1, W2, W3, W4), the six items
in section 9 reserved to Tom, and the limits in section 8 stated rather
than glossed.
