# Seventeenth independent Governance & Assurance review

## Arrington AI Workspace v0.1 release candidate

**Lane:** ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
**Date:** 31 August 2026.
**Candidate:** branch `feature/arrington-ai-workspace-v0-1`, frozen head
`69b6e067c414a5271178b93282067ba8dc229fa1`.
**Under review:** the W cycle — `review/workspace-v0.1-w-remediation-2026-08-31.md`,
answering the sixteenth pass (`review/workspace-v0.1-governance-review-16-2026-08-31.md`,
**PASS**, four LOW findings W1-W4, against head `0f03a6a`).

### Tree state, at the start

```
$ git rev-parse HEAD
69b6e067c414a5271178b93282067ba8dc229fa1
$ git status --porcelain
$ git rev-parse --abbrev-ref HEAD
feature/arrington-ai-workspace-v0-1
$ sha256sum data/workspace-snapshot.enc
e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2  data/workspace-snapshot.enc
```

`git status --porcelain` printed nothing.

### Tree state, at the end

```
$ git rev-parse HEAD
69b6e067c414a5271178b93282067ba8dc229fa1
$ git status --porcelain
$ git rev-parse --abbrev-ref HEAD
feature/arrington-ai-workspace-v0-1
$ sha256sum data/workspace-snapshot.enc
e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2  data/workspace-snapshot.enc
$ git worktree list
/home/user/arrington-website  69b6e06 [feature/arrington-ai-workspace-v0-1]
/tmp/wt-portal                fe95238 [feature/social-portal]
/tmp/wt-ruth                  203b15a [feature/workspace-receptionist]
/tmp/wt-scottfix              1d34e32 [fix/scott-clearance-fail-closed]
/tmp/wt-selffound             b08c433 [fix/self-found-v-cycle]
/tmp/wt-social                e04c516 [feature/scott-social-nav]
```

**The candidate did not move under me and the brain snapshot is
byte-identical.** The five other worktrees are not mine and are not the
candidate; one of them (`/tmp/wt-scottfix`, `fix/scott-clearance-fail-closed`)
did not exist at the sixteenth pass, so the builder has been working
elsewhere during this review. That is fine and it is the right place for
it: finding K5's standing correction is that work during an open review
happens in a separate worktree, never in the reviewed checkout, and the
reviewed checkout stayed clean throughout.

Every experiment that needed a code change ran in
`git worktree add /tmp/gov17wt 69b6e06` (and, for the red/green checks, a
second at `0f03a6a`); both were restored and removed. **Nothing in the
candidate was edited.** Every database I used was created from nothing as
`gov17` and dropped at the end:

```
$ su postgres -c "psql -c 'DROP DATABASE IF EXISTS gov17;'"
DROP DATABASE
$ su postgres -c "psql -lqt" | grep -c gov17
0
```

One environment change I made and am disclosing rather than glossing:
this sandbox's local Postgres role `arrington` had no password, so TCP
`scram-sha-256` auth failed and no server could connect over
`DATABASE_URL`. I set one on the local role. That is a change to this
sandbox's local database, not to any deployment, not to any variable on
Railway, and not to the candidate. No secret value appears in this report.

---

## 1. The bounded question

**Are the W corrections sound, and is any of them the seventeenth
instance of this chain's recurring defect — a security or honesty
property asserted and not held, usually introduced by the fix for the
finding before it?**

The two most productive places to look have been the remedy for the
previous finding, and a test named for a property that does not exercise
it under the conditions the property claims. I looked in both.

---

## 2. VERDICT: PASS

**Four findings, all LOW: X1, X2, X3, X4. No MEDIUM. No HIGH. No STOP.**

The answer to the bounded question is: **all four W corrections are
genuinely made and I established each of them myself rather than reading
the remediation; and it is also the seventeenth instance, in the same
narrow register as the sixteenth — a completeness claim about a guard, a
completeness claim about a test, a factoring claim about the W3 fix that
the W3 fix does not quite hold, and one sentence in a carried document
that is false about the branch it now sits on. Not one of them changes
what an attacker can do, what a lane can read, or what Ruth tells Tom.**

Specifically:

- **W1 is fixed, and the stronger fix was the right one.** `answered` is
  gone from the module, from the single call site and from `NOTE_FIELDS`.
  I enumerated Ruth's output space independently — 5,152 calls over 23
  lane-id values, 23 record-count values and 7 gap values, zero throws —
  and every branch that remains is reachable, no remaining parameter is
  inert, and the field guard refuses `answered` (and every other
  own-key) loudly. The two hard-coded "there is nothing on file" strings
  are gone with it, so the module's rule 1, `CLAUDE.md` and the V
  remediation are now true of every branch.
- **W2 is fixed and the fix is materially stronger than the denylist.**
  The permitted set is exactly the production-reachable set — 12 shapes,
  0 undeclared, 0 dead — and it caught **11 of the 12 mutations** I put
  through it, including the reviewer's own M4 and five I wrote myself
  (an authorship claim in a verb the old denylist never had, a false
  sentence on the default path, an echo of a crafted lane id, a silent
  return, and a dropped gap sentence). The twelfth is X2.
- **W3 is fixed in the direction it was raised.** All five of the
  sixteenth reviewer's idioms are now flagged against the real
  classifier, and I produced no false positive against any real file or
  against five must-not-flag probes. The narrowed sentence is the more
  important half and it is honest: it now names the probes as the
  definition and records the durable fix as the next step. Seven further
  idioms of my own still walk past it, which the narrowed claim
  explicitly allows; one of the three rules is not factored the way the
  file says it is, which is X3.
- **W4 is fixed and it is pinned by a test that goes red.** `npm test`
  runs no fixture in all three environments the last two findings were
  about, and dropping a `.js` file back into the fixture directory makes
  the new guard fail and makes the runner execute it. The corrected
  suite figure reconciles exactly: 566 − 12 fixtures + 2 new receptionist
  tests + 1 new scan test = **557**, which is what I measured.

**Why PASS and not AMBER.** The twelfth pass carried two LOW and no
MEDIUM; the sixteenth carried four LOW and no MEDIUM. This pass carries
four LOW and no MEDIUM, and the four are: a guard whose stated mechanism
misses inherited keys on an object no caller constructs; a test that
samples five record counts while its name says every reachable sentence;
a regex that hardcodes `process.env` in a file that says it does not; and
a sentence about document copies in a reviewer's carried erratum. Against
that I re-established with my own instruments: all three gates across
**15,300 request comparisons** and 1,680 timed requests, in both flag
states, anonymously and as an authenticated uncleared CMS admin, with a
positive control that does differ; the full CMS-admin takeover end to
end, stopping at the unlock screen; passphrase rotation invalidating an
open unlock while leaving the CMS login intact; the permission legs with
canaries I seeded, over the real endpoint with the prompt echoed back,
plus a 17-surface rendered sweep at a narrow clearance against a positive
control that shows the same sweep can see eight leaks; the alert's
concurrency bound over **125 threshold-sized bursts** and 10 rounds of 12
racing processes, against a control I first showed fails **29 rounds in
40**; the Scott firewall at module-graph level in both directions; and
both adversarial suites armed by hand, **workspace 10/10 and Scott
18/18, zero skips**.

**Why I am not withholding a PASS.** Every finding I have is in a
comment, a test's coverage, or an archived document. I hunted the thing
three consecutive AMBERs rested on — a reachable untruth in Ruth's output
— with an independent enumeration of her whole output space, a twelve-way
mutation set and the real endpoint under three model stubs, and there is
none. Awarding AMBER on that would be withholding a PASS out of fatigue,
which is as much a failure of this lane as awarding one out of it.

**What a PASS from this lane is and is not.** It is a statement that the
candidate at head `69b6e06` holds the security and honesty properties it
claims, as far as an independent lane with this sandbox's limits can
establish. It is **not** a production release decision, which is Tom's,
and it does not clear the items in section 9. Section 8 says plainly what
I could not test.

---

## 3. Independence, and its limits

I am a separate lane from the builder and I ran my own instruments. I did
not merge, deploy or enable anything; I armed no paid suite and spent no
money — every model interaction in this review used a stub installed from
a `--require` preload so the candidate's source was untouched; I changed
no variable on any real deployment; I touched Railway, Drive and
production not at all. No secret value appears here. The limitation to
disclose: I review a candidate built by another agent in the same
repository, and my evidence is what I ran in this sandbox, which cannot
reach the live site, Railway or Drive.

---

## 4. What I did, with observed results

### 4.1 Ruth's output space, enumerated independently

I did not read the builder's sweep or the sixteenth reviewer's. I called
`handoffNote` over 23 lane-id values (the nine real ids, ten prototype
keys, `not-a-lane`, `''`, `null`, `undefined`, `0`, `false`, `[]`, `{}`,
`['google_ads']`, `'GOOGLE_ADS'`, and three whitespace/case variants) ×
23 record-count values (integers, negatives, `NaN`, `±Infinity`, `null`,
`undefined`, strings, floats, booleans, objects) × 7 gap values:

```
$ node /tmp/gov17/ruth-enum.js
CALLS 5152 THREW 0 DISTINCT 180
SHAPES 20
```

Twenty normalised shapes, of which **eight exist only for non-integer
record counts** (`0.5`, `1.5`), which no caller can produce:
`recordCount` is `result.provenanceKeys.length`. Restricting to the
inputs production can actually pass — a real lane or `null`, a
non-negative integer, a boolean gap — gives exactly **twelve**, and they
are exactly the twelve `PERMITTED_SHAPES` declares:

```
$ node /tmp/gov17/ruth-declared.js
production-reachable shapes: 12
declared: 12 unique declared: 12
reachable but UNDECLARED: 0 []
declared but DEAD: 0 []
```

No prototype key produced a colleague. No call threw. **Every remaining
branch is reachable and no remaining parameter is inert**, which is the
first half of W1's question.

Then the **real endpoint**, with the model stubbed through the
orchestrator's own `__setClientFactoryForTests` from a preload. Zero
records first (the documented unseeded brain):

```
Q="how much cash do we have"              lane=null prov=[] gap=null
  RUTH: That did not match one of the specialists, and there was no record on file to answer it from.
Q="tell me about the google ads campaign" lane="google_ads" prov=[] gap=null
  RUTH: ARRINGTON GOOGLE ADS answered from what they hold. No specific record is behind it,
        so treat it as their reading rather than as evidence.
```

Then with six records seeded at three sensitivities across four source
classes:

```
Q="how much cash do we have"      prov=[3 keys]  RUTH: ...answered from 3 records in the general context.
Q="google ads campaign"           prov=[3 keys]  RUTH: I took that to ARRINGTON GOOGLE ADS, who answered from 3 records.
Q="control pack for the workspace" prov=[4 keys] RUTH: ...ARRINGTON AI WORKSPACE BUILDER, who answered from 4 records.
```

and with the gap stub:

```
Q="how much cash do we have"  gap=missing
  RUTH: That did not match one of the specialists, so it was answered from 3 records in the
        general context. The gap has been written down rather than let pass.
Q="google ads campaign"       gap=missing
  RUTH: I took that to ARRINGTON GOOGLE ADS. They answered, but the 3 records behind it do
        not fully cover the question. The gap has been written down rather than let pass.
```

and at exactly one record, which is the self-found grammar fix:

```
  RUTH: I took that to ARRINGTON GOOGLE ADS. They answered, but the record behind it does
        not fully cover the question. ...
  RUTH: That did not match one of the specialists, so it was answered from 1 record in the
        general context. ...
```

The count Ruth speaks equals the provenance list `views/workspace/chat.ejs`
prints beside it on every turn I produced, and `repo.createGap` is awaited
before the response is composed, so "has been written down" is true when
it is said. **W1's own premise checks out**: `parseReply` refuses a reply
whose `answer` is not a non-empty trimmed string, so `answered` was always
true and its branches were dead; deleting rather than patching them was
the right call.

**The field guard refuses the removed field:**

```
["answered"]    -> THREW: receptionist: refusing unpermitted field(s) answered; ...
["Answered"]    -> THREW: ... Answered ...
["record"]      -> THREW: ... record ...
["constructor"] -> THREW: ... constructor ...
```

The one gap in that mechanism is X1.

**Crafted lane ids through the real endpoint**, since T3 is what made this
a live question:

```
"constructor" "__proto__" "toString" "valueOf" "hasOwnProperty" "isPrototypeOf"
"propertyIsEnumerable" "toLocaleString" "__defineGetter__" "not-a-lane" "GOOGLE_ADS"
"google_ads " " google_ads" ""
  -> all: status 200, lane null, and the honest no-lane sentence. No 500, no colleague.
```

### 4.2 Twelve mutations against the permitted-set test

Run in a worktree at the frozen head, against the candidate's own
`test/workspace/receptionist.test.js`:

| mutation | result |
|---|---|
| M4 — the sixteenth reviewer's own: *"and I checked the 3 records behind it myself"* | **RED** |
| reintroduce U1 — *"I answered that one myself"* | **RED** |
| reintroduce V1 — general-records claim on a zero-record turn | **RED** |
| reintroduce W1 — hard-coded "nothing on file" on a turn that had records | **RED** |
| reintroduce V2 — *"I have written the gap down"* | **RED** |
| NEW: *"I read what they hold"* (a verb the old denylist never had) | **RED** |
| NEW: *"I looked over it myself first"* appended to the DEFAULT path | **RED** |
| NEW: echo the raw crafted `laneId` back into the sentence | **RED** |
| NEW: return `''` (the "satisfied by saying nothing" direction) | **RED** |
| NEW: drop the gap sentence on the no-lane path | **RED** |
| NEW: regress the singular/plural agreement | **RED** |
| NEW: a dishonest sentence conditional on `n === 4` | **GREEN — not caught** |

Eleven of twelve. **The allowlist is a real improvement on the denylist**:
every phrase-level mutation on any probed input is caught, because
membership is exact string equality after normalisation. Two
count-conditional mutations I tried at `n === 3` and `3 ≤ n ≤ 6` were
caught, by the *other* tests in the file, which do probe 3. The single
escape is a branch on a count in `{4, 5, 6, 8..98, >99}`, which is X2.

I also checked the normalisation for hiding: `normalise` replaces lane
names and `\d+ record(s)` only, so a mutation that adds words, changes a
verb, or interpolates anything else produces a new shape and fails. It
hides nothing I could find.

### 4.3 The three gates, re-established from nothing

A server was booted against a freshly created and seeded throwaway
database, first with the flag unset:

```
Workspace access: ENABLE_ARRINGTON_AI_WORKSPACE is not 'true', so the workspace does not exist in this environment
```

Twenty-one real workspace paths (12 pages, 9 APIs), each through 8
spellings (plain, upper case, mixed case, trailing slash, doubled leading
slash, percent-encoded, query string, matrix parameter) × 10 methods
(GET, HEAD, POST, OPTIONS, TRACE, PATCH, PUT, DELETE, PROPFIND, SEARCH) ×
3 Accept values, each against a **shape- and length-matched** control path
(same segment count, same segment lengths, so a `Location` header cannot
differ by a byte for a reason that is not the workspace). Comparison is
status + the full normalised header set + a SHA-256 of the body, with
per-request nonces normalised inside both and the path text itself
neutralised.

```
=== FLAG OFF, anonymous ===              TOTAL 5040 MISMATCH 0
=== FLAG ON,  anonymous ===              TOTAL 5040 MISMATCH 0
=== FLAG ON,  authenticated CMS admin (nat), no clearance ===
                                         TOTAL 5040 MISMATCH 0
```

The admin session was confirmed live before the sweep (`Log out` present
on `/`). Then the POST-with-valid-CSRF sweep, which is the one the
sixteenth reviewer had to add because an anonymous POST without a token
never reaches the workspace guard:

```
=== FLAG ON  === anonymous csrf token present: true
                 POST-with-valid-CSRF sweep: TOTAL 90 MISMATCH 0
                 control sanity /api/leads -> 400 {"error":"Name and email are required."}
=== FLAG OFF === POST-with-valid-CSRF sweep: TOTAL 90 MISMATCH 0
                 control sanity /api/leads -> 400 {"error":"Name and email are required."}
```

**15,300 comparisons, zero differences**, with a positive control proving
the instrument can tell two endpoints apart.

**Timing**, 120 requests per path per state:

```
=== FLAG OFF ===                          === FLAG ON ===
/workspace          median 2.84ms         /workspace          median 3.25ms
/workspace/chat     median 3.13ms         /workspace/chat     median 2.93ms
/api/workspace/ask  median 2.77ms         /api/workspace/ask  median 2.67ms
/zqnotreal1         median 3.21ms         /zqnotreal1         median 3.51ms
/api/zqnotreal/zzz  median 2.54ms         /api/zqnotreal/zzz  median 2.77ms
```

No separation, and the flag state moves nothing.

### 4.4 The CMS-admin takeover, executed end to end

This is the attack finding F1 exists for. `nat` is a CMS admin; `tom` is
the cleared owner. I ran the whole of it.

```
1. nat (admin) login: 302 /
2. admin nat GET /workspace: 404 len 4282  x-robots: (none)
   control       /zqnotreal: 404 len 4282
   IDENTICAL LENGTH: true
   (bodies differ only by the per-request CSP nonce; normalised, identical at 4259 bytes.
    Headers differ only in etag — derived from that nonce — and set-cookie, both of which
    also differ between two requests to the SAME path, so neither carries information.)
3. admin resets tom password: 200 {"success":true}
4. login as tom with the attacker's password: 302 /
5. GET /workspace as seized tom: 302 /workspace/unlock
6. unlock screen: 200
   POST /api/workspace/ask              -> 404 len 4282
   POST /api/workspace/contacts/1/erase -> 404 len 4282
   POST /api/workspace/social/sync      -> 404 len 4282
   POST /api/workspace/lock             -> 200 len 11
   GET  /workspace/brain                -> 302 /workspace/unlock
   GET  /workspace/contacts             -> 302 /workspace/unlock
   GET  /workspace/activity             -> 302 /workspace/unlock
7. guesses "0" "1" "2" "password" "gov17" -> 401 {"error":"That passphrase is not correct."}
```

The attacker holds Tom's username and Tom's user id, reaches the unlock
screen, and gets nothing else — including the erasure endpoint, which
answers the site's own 404 byte for byte. `POST /api/workspace/lock`
answering 200 discloses nothing: it is behind `requireWorkspaceIdentity`,
so only somebody already looking at the unlock screen can reach it, and
all it does is forget a session fact.

**Positive control**, established separately in the same environment: the
correct passphrase returns `200 {"ok":true}` and `/workspace` then returns
200.

**Passphrase rotation**, re-established rather than inherited: one session
cookie, two servers sharing the Postgres session store, one with the
original passphrase and one rotated.

```
unlock on 3182 with ITS passphrase:                        200 {"ok":true}
GET /workspace on 3182 (same passphrase):                  200
GET /workspace on 3181 (DIFFERENT passphrase, same session): 302 /workspace/unlock
  still logged in to the CMS on 3181?                      200 (yes)
```

Rotation closes an open unlock immediately and leaves the CMS login intact.

### 4.5 The permission legs, with canaries I built

Six records seeded at three sensitivities across four source classes,
each carrying a distinctive token, and the model replaced with a stub
that **echoes the whole prompt back**, so anything the model could see
appears in the response. Over the real endpoint, as the owner:

```
Q="how much cash do we have"               lane=null
  prov: std.authority, comm.strategy, conf.strategy
  MODEL SAW: ALPHA(std/authority) BRAVO(comm/strategy) CHARLIE(conf/strategy)
  WITHHELD : DELTA, ECHO, FOXTROT
Q="tell me about the google ads campaign"  lane=google_ads      (ceiling: commercial)
  MODEL SAW: ALPHA BRAVO ECHO(comm/technical)   WITHHELD: CHARLIE DELTA FOXTROT
Q="what is in the control pack..."         lane=ai_workspace_builder
  MODEL SAW: ALPHA BRAVO ECHO FOXTROT(std/control_pack)  WITHHELD: CHARLIE DELTA
Q="tell me about an opportunity..."        lane=opportunity_builder
  MODEL SAW: ALPHA BRAVO CHARLIE DELTA(conf/opportunity) WITHHELD: ECHO FOXTROT
Q="website hosting state"                  lane=website_hosting
  MODEL SAW: ALPHA BRAVO ECHO FOXTROT                    WITHHELD: CHARLIE DELTA
```

The lane leg bites exactly where the published remits say it should, and
**filtering happens before the prompt exists** — the withheld records are
absent from the echoed prompt, not redacted out of an answer. Ruth's count
equals the provenance list on every one of these turns.

**On the rendered surfaces**, which is the check that found the per-field
leak in Scott. `ws_restricted` has no login, so this needed a worktree
patch mapping `tom` to it; I then ran the identical sweep at the owner
clearance as a positive control.

```
=== NARROW CLEARANCE (ws_restricted) ===   === POSITIVE CONTROL (owner_admin) ===
/workspace               clean             /workspace               clean
/workspace/brain         clean             /workspace/brain         LEAK -> 4 canaries, 4 titles, 4 keys
/workspace/brain?q=gov17 clean             /workspace/brain?q=gov17 LEAK -> (same)
/workspace/brain?q=XRAY  clean             /workspace/brain?q=XRAY  LEAK -> (same)
/workspace/opportunities clean             /workspace/opportunities LEAK -> DELTA, title, key
/workspace/projects      clean             ...
/workspace/social        clean
/workspace/contacts      clean
/workspace/workforce     clean
/workspace/approvals     clean
/workspace/gaps          clean
/workspace/activity      clean
/workspace/chat          clean
ASK x4: prov=[std.authority] (+the         ASK x4: prov includes the commercial
        standard control pack, which               and confidential records
        this clearance is entitled to)
SURFACES CHECKED: 17  LEAKS: 0             SURFACES CHECKED: 17  LEAKS: 8
```

Stated rather than glossed: my first run of this sweep reported four
"leaks" at the narrow clearance. They were all the same **standard**
record, which `ws_restricted` is entitled to see — a defect in my needle
list, not in the workspace. Corrected to commercial and confidential
needles only, the narrow clearance is clean on 17 surfaces while the same
sweep sees eight leaks at the owner clearance.

**Counts after filtering** is visible in the same runs: at the narrow
clearance Ruth says "1 record" and "2 records"; at the owner clearance,
"3" and "4". The size of the withheld set is never exposed.

### 4.6 The alert's boundedness, with a control that breaks hard

I wrote my own harness and applied K2's lesson first: the pool is
**warmed** before each burst, the send is **short**, and the arrival
stagger is **random**, because a cold pool, a long send or a
deterministic ladder each make a broken guarantee look sound.

Frozen head:

```
{"ROUNDS":25,"CALLERS":16,"ok":25,"dup":0,"silent":0}
{"ROUNDS":60,"CALLERS":20,"ok":60,"dup":0,"silent":0}
```

The control. Both of this module's mechanisms had to be removed to see
the defect, and doing so is what makes the harness credible:

```
lock disabled (worktree) + partial unique index dropped   -> ok 11, dup 29, silent 0  (of 40)
      rounds observed at 2, 3 and 4 duplicate notices each
CANDIDATE code + partial unique index dropped             -> ok 40, dup 0,  silent 0
CANDIDATE code + both mechanisms present                  -> ok 85, dup 0,  silent 0
```

That is a sharper result than the previous pass obtained, and it settles
something the sixteenth review could only infer: with the index dropped,
**the advisory lock alone holds the guarantee** across 40 bursts, and with
the lock removed as well the same harness breaks it 29 times in 40. Two
independent mechanisms, each sufficient, both present. The index was
recreated immediately afterwards and the database dropped at the end.

Twelve separate processes racing a shared start instant, using the
candidate's own `scripts/workspaceUnlockClaimWorker.js`:

```
ROOT=/home/user/arrington-website ROUNDS=10 N=12 ok=10 dup=0 silent=0
```

Exactly one winner every round, zero silent.

### 4.7 W3: the classifier, attacked in both directions

Ten probes reproducing the sixteenth reviewer's set, plus ten idioms of
my own, plus five must-not-flag probes, all against the real
`test/helpers/gatedSuiteScan.js`:

```
FLAGGED A destructure-process-then-env      FLAGGED I early return on env
FLAGGED B require-process-inline            FLAGGED N8  t.skip on env
FLAGGED C bracket-env-alias                 FLAGGED N10 template computed read
FLAGGED D Object.assign alias
FLAGGED E alias read via bracket            MISSED N1 optional chaining process?.env?.X
FLAGGED F globalThis.process.env            MISSED N2 nested destructure { env: { X } } = process
FLAGGED G destructure with rename           MISSED N3 let e; e = process.env
FLAGGED H registers nothing                 MISSED N4 const cfg = () => process.env
                                            MISSED N5 Reflect.get(process.env, 'X')
MISSED (correctly) P1 plain suite           MISSED N6 require('node:process').env
MISSED (correctly) P2 db-only gate          MISSED N7 const { env = {} } = process
MISSED (correctly) P3 computed WRITE        MISSED N9 Object.fromEntries(Object.entries(process.env))
MISSED (correctly) P4 env spread into child
MISSED (correctly) P5 snapshot for restore
```

**All five of W3's idioms are closed and no false positive appeared.**
Seven of my ten new idioms escape — which the file's narrowed sentence
explicitly allows, and that narrowing is the half of W3 that mattered.
Two of the seven (`node:process`, optional chaining) are ordinary rather
than contrived, and nothing in the tree uses either:

```
$ grep -rln "node:process|process?\.env|require('process')" test/ lib/ routes/ scripts/
test/helpers/gatedSuiteScan.js
test/fixtures/gatedSuiteProbes/must-flag-require-process.jsfixture
```

I also wrote my own deliberately over-broad scan of all 50 `*.test.js`
files, matching any env-shaped read of any upper-case name:

```
UNDECLARED candidates: 1
   gatedSuites.test.js gates=[WAI_SEED_TEST_DATABASE_URL, SCOTT_TEST_BASE_URL, ...] registers=true
```

The single hit is the declaration table itself naming the variables — a
false positive of my scan. **Every non-database gate in the tree is
declared.** The gap is latent drift risk, not a present hole.

### 4.8 W4: no fixture runs, in every environment the findings were about

```
DATABASE_URL, SESSION_SECRET, NAT_PASSWORD, TOM_PASSWORD
  # tests 557  # suites 53  # pass 555  # fail 0  # skipped 2   exit=0
  mentions of gatedSuiteProbes/jsfixture in the whole TAP stream: 0

  ... plus SOME_LIVE_FLAG=1 and RUN_LIVE_THING=1 exported
  # tests 557  # suites 53  # pass 555  # fail 0  # skipped 2
  mentions of gatedSuiteProbes/jsfixture: 0

  no DATABASE_URL at all
  the "SUITE(S) DID NOT RUN" block lists 13 real suites and NO fixture
```

The V4-class regression W4 reintroduced is gone: the flag that used to
turn one fixture red now changes nothing.

**The property is pinned by a test, and I watched it work in both
directions.** Dropping one `.js` file into the fixture directory:

```
$ node --test test/gatedSuiteScan.test.js
not ok 1 - no fixture carries an extension the test runner would execute
# fail 1
$ node --test | grep -c "GOV17 CANARY FIXTURE EXECUTED"
2
```

So the runner genuinely does execute a `.js` file there, and the guard
genuinely goes red when one appears.

**The corrected suite figure reconciles exactly**, which matters because
the previous number was cited as evidence in a remediation:

```
566 (at 0f03a6a)
 -12  fixtures no longer discovered  (12 .js files existed there; each contributed one test)
  +2  receptionist.test.js 9 -> 11 tests
  +1  gatedSuiteScan.test.js 3 -> 4 tests
= 557   <- measured
```

### 4.9 Every new test watched red against `0f03a6a`

The remediation claims "a test watched red against `0f03a6a`" for each
finding. I checked it by copying only the new test files into a worktree
at that head:

```
=== test/workspace/receptionist.test.js (new) against OLD code ===
not ok 3 - she can speak about the routing and never about the content
not ok 5 - every reachable sentence is one she is permitted to say
not ok 6 - the receptionist takes no inert parameter
not ok 7 - she never claims a record when there was none, and says so when there was
not ok 9 - a gap is reported on every path, including the default one
# pass 6  # fail 5

=== test/gatedSuiteScan.test.js (new) against OLD tree ===
not ok 1 - no fixture carries an extension the test runner would execute
not ok 2 - the probe fixtures are present and cover both directions
# pass 2  # fail 2
```

The claim holds for W1, W2 and W4. Recorded because it is the one place
the claim is thinner than it looks: the self-found grammar test
(`a singular count reads as a singular sentence`) passes against
`0f03a6a` — not because the grammar was right there, but because the
`!answered` early returns stopped its own probes reaching the plural
sentence. It is not one of W1-W4, and it does have real power against the
defect it names (my M_gram mutation is red against it), so this is a note
rather than a finding.

### 4.10 Both adversarial suites, armed by hand

```
=== workspace, against a running instance, all five variables set ===
ok 1 - an anonymous visitor gets an ordinary 404, not a login redirect
ok 2 - an anonymous workspace API call looks like a call to a route that does not exist
ok 3 - every method is refused the same way, not just GET and POST
ok 4 - a logged-in site admin who is not Tom sees nothing, and is told nothing
ok 5 - Tom can authenticate, so every check below means something
ok 6 - a logged-in cleared session reaches nothing until it presents the passphrase
ok 7 - a wrong passphrase is refused, it is recorded, and the session stays locked
ok 8 - the right passphrase opens it, and every page is noindex
ok 9 - erasure refuses a mismatched confirmation even for Tom
# tests 10  # pass 10  # fail 0  # skipped 0

=== Scott ===
# tests 18  # pass 18  # fail 0  # skipped 0
```

Both of the remediation's adversarial claims are confirmed, with zero
skips, so no check reported NOT EXECUTABLE.

### 4.11 The Scott firewall, at module-graph level

Transitive, not a regex over one file's own `require` calls:

```
ENTRY lib/workspace/receptionist.js   modules reached: 2   SCOTT MODULES REACHED: 0
ENTRY lib/workspace/orchestrator.js   modules reached: 5   SCOTT MODULES REACHED: 0
ENTRY lib/workspace/access.js         modules reached: 6   SCOTT MODULES REACHED: 0
WORKSPACE MODULES REACHED FROM lib/scott/*: 0
```

### 4.12 The disclosed `node_modules` symlink

```
$ git ls-tree -r HEAD --name-only | grep -c '^node_modules'
0
$ ls -ld node_modules
drwxr-xr-x 127 root root 4096 ... node_modules      (a real directory)
$ git check-ignore -v node_modules
.gitignore:23:node_modules	node_modules
```

Gone from the index, present as a real directory, and `.gitignore` now
refuses both the directory and the bare forms. The builder's disclosure
of this is accurate.

---

## 5. Findings

### X1. The receptionist's field guard is own-keys-only, so "anything else THROWS" is not held, and one declared field can be smuggled past it to make her state a count the interface contradicts. Severity: LOW

**What is claimed.** `lib/workspace/receptionist.js`:

> Same structural discipline as the unlock alert (finding H7): the
> permitted keys are declared and anything else THROWS, so she cannot
> quietly grow a parameter that carries record content.

and, of the deleted parameter:

> Because the guard below throws on an undeclared field, a caller that
> starts passing `answered` again fails loudly instead of silently
> reaching a branch nobody has thought about.

**What is true.** `assertOnlyPermitted` filters `Object.keys(opts)`,
which is own enumerable keys only. A field carried on the object's
prototype is invisible to it, and the destructure on the next line reads
through the prototype chain:

```
$ node -e "const r=require('./lib/workspace/receptionist');
           const o = Object.create({recordCount: 999, answered:false, record:'SECRET'});
           o.laneId='google_ads';
           console.log('own keys:', Object.keys(o)); console.log('note:', r.handoffNote(o));"
own keys: [ 'laneId' ]
note: I took that to ARRINGTON GOOGLE ADS, who answered from 999 records. The provenance is listed with the answer.
```

No throw. Ruth states a record count of 999 on a turn with one record,
which is precisely the V1/W1 class of untruth — a sentence about records
that disagrees with the `Records supplied:` line the interface renders
beside it.

**What is NOT true, and I want to be precise about it.** This is not a
disclosure. The function reads only the three declared names, so a
prototype-carried `record: 'SECRET'` is never spoken; I checked. And the
deleted `answered` is inert whichever way it arrives, because no branch
consults it any more. The *substantive* safety property — she cannot
speak record content — is held structurally by the destructure, not by
the guard. It is the guard's own stated mechanism that is not held.

**Reachability: none today.** `handoffNote` has exactly one caller,
`routes/workspace.js:502`, which builds an object literal from three
computed values; no request-derived value constructs that object. This is
the same posture as finding V5, where a prototype gap in a map that
"nothing reaches today" was fixed anyway because a diagnostic shared the
lookup — and the argument for fixing it is the same one the builder gave
for deleting `answered` rather than patching it: a mechanism that is
weaker than its comment invites a future caller nobody reasoned about.

**What would close it.** Classify inherited enumerable keys too
(`for (const k in opts)`), or read the three fields with `Object.hasOwn`
so a prototype-carried value cannot be read either, and pin it with a
probe. Alternatively narrow the comment to what the guard does — but
given H7's history in this module, tightening the guard is the smaller
change.

### X2. *"Every reachable sentence"* is established by sampling five record counts, and a dishonest sentence conditional on a sixth passes. Severity: LOW

**What is claimed.** The test is named `every reachable sentence is one
she is permitted to say`, and `lib/workspace/receptionist.js` says
`test/workspace/receptionist.test.js` "enumerates her whole output space
and asserts every string is a member of a declared set of shapes". The W
remediation says "Ruth's whole output space re-enumerated: 12 shapes, all
declared."

**What is true.** `everyReachableNote()` sweeps 17 lane ids × 2 gap
states × `PROBE_COUNTS = [0, 1, 2, 7, 99]`. The record count is an
unbounded non-negative integer, so this is a sample, not an enumeration.
A branch conditional on a count outside the file's collective coverage of
`{0, 1, 2, 3, 7, 99}` is undeclared and unpinned:

```
mutation: if (n === 4) return `I took that to ${...}, and I verified all 4 records myself.`
result:   M_count4 :: GREEN (NOT CAUGHT)
```

That sentence is an explicit claim to have verified records she cannot
read, on a reachable input, passing a suite named for exactly that
property.

**This is much narrower than W2 was**, and I want that on the record
rather than dressing it up. W2's denylist admitted *any* new verb on
*any* branch, and the sixteenth reviewer got past it in one line of
ordinary rewording. The allowlist admits only a count-conditional branch,
which nobody would plausibly write, and I confirmed that the two
plausible count-conditional shapes I could think of (`n === 3`, and
`3 ≤ n ≤ 6`) are both caught by the file's other tests. It is a defect in
what the test *establishes*, not a present defect: the twelve declared
shapes are exactly the twelve production-reachable ones, which I verified
independently.

**What would close it.** Either probe a contiguous range
(`PROBE_COUNTS = [0, 1, 2, ..., 12, 99, 1000]`), or — better, because it
is a property rather than a bigger sample — assert that the normalised
output depends on `n` only through `{0, 1, ≥2}`, by checking that every
`n` from 2 to 50 yields the same shape. Then narrow the test's own name,
or leave it, because it would then be true.

### X3. The W3 fix says every rule is expressed in terms of the factored environment expression. One of the three is not, and it misses two of the shapes W3 was about. Severity: LOW

**What is claimed.** `test/helpers/gatedSuiteScan.js`:

> Chasing shapes one at a time is the arms race the reviewers have called
> unwinnable, so the pattern is factored: name the ENVIRONMENT EXPRESSION
> once, then express every rule in terms of it

and `review/workspace-v0.1-w-remediation-2026-08-31.md`:

> the environment expression is factored into one place and every rule is
> expressed in terms of it, so four of the five collapse into rules that
> already existed

**What is true.** Two of the three rules are expressed in terms of
`ENV_EXPR`. The third is not:

```js
const returnsEarlyOnEnv = /if\s*\([^)]*process\.env[^)]*\)\s*\{?\s*return\b/.test(src);
```

It matches the literal text `process.env`, which is the exact shape W3
found insufficient. Measured against the real classifier:

```
FLAGGED literal early return on an ambient name
MISSED  alias early return on an ambient name
FLAGGED bracket early return on ambient
FLAGGED globalThis early return on ambient
MISSED  require('process') early return on ambient
```

`require('process').env` is **probe B of W3's own five**, and it is
missed by this clause. It is caught overall only because the second rule
sees the name — so the miss becomes observable exactly when the name is
ambient (`CI`, `NODE_ENV`, …), where the second rule deliberately stands
down and the third is the only thing left. Two spellings of the same gate
then classify differently, which is the "half a fix in each direction"
shape this file's own U4 comment warns against.

**Consequence: none in the tree today.** No real suite gates on an
ambient name, and my independent scan (section 4.7) found every
non-database gate declared.

**What would close it.** Substitute `ENV_EXPR` into that regex, which I
verified is sufficient for two of the three cases:

```
FLAGGED literal
FLAGGED require(process)
FLAGGED bracket
```

and add the alias set for the third; then the sentence in the file and in
the remediation becomes true as written. Failing that, say that two of
the three rules are factored and the third is not.

### X4. The fifteenth reviewer's erratum, carried onto the candidate byte-identical, now contains a sentence that is false about the file a reader of this branch is holding. Severity: LOW

**What is claimed.** `review/workspace-v0.1-governance-review-15-2026-08-31.md`,
in the erratum added by commit `7a85d59`:

> **Note on copies.** The candidate branch carries the as-delivered text
> without this erratum, because a reviewed document is not the builder's
> to edit and I did not push to their branch. This branch,
> `governance/workspace-v01-review-15`, carries the as-delivered text plus
> this note. The two differ by this section and nothing else.

**What is true.** The candidate branch now carries the erratum. A reader
who opens that file at head `69b6e06` is told, by the file itself, that
the copy they are reading does not contain what they are reading. The two
copies no longer differ at all.

**The builder's judgement was right and the mechanism was wrong.**
Declining to edit a reviewed document is correct and is exactly what
finding K5's discipline implies. But it had the right answer available
and used it elsewhere in the same commit: it added a clearly marked,
dated `> CORRECTION` block to its own V remediation rather than rewriting
the text, and the T remediation carries a dated note at its head for the
same reason. The reviewer's prose stays untouched either way.

I verified the rest of the carry is clean: the diff against `0f03a6a`
adds 49 lines at the end of that file and changes nothing above them, so
the as-delivered body can still be compared byte for byte.

**What would close it.** A one-line dated builder's note immediately
below the erratum on this branch — "carried onto the candidate on
31/08/2026; the sentence above about copies predates that" — or the
equivalent at the head of the file. Not an edit to the reviewer's words.

---

## 6. What I re-established myself

- Ruth's output space: 5,152 calls, 180 distinct strings, 20 normalised
  shapes, of which exactly 12 are production-reachable and exactly those
  12 are declared — enumerated without reading anyone else's sweep, then
  driven through the real endpoint under three model stubs at zero, one,
  three, four and six records, with and without a gap.
- Twelve mutations against the permitted-set test, eleven red, five of
  them written by me for this pass.
- W1's premise: `parseReply` refuses an empty answer, so `answered` was
  always true; every remaining branch reachable; no remaining parameter
  inert; the field guard refusing every own-key form of the removed field.
- All three gates: 15,300 request comparisons across 21 real paths, eight
  spellings, ten methods, three Accept values, both flag states,
  anonymous and as an authenticated uncleared CMS admin, against shape-
  and length-matched controls on status, full headers and body hash, with
  a positive control that does differ; plus 1,680 timed requests.
- The CMS-admin takeover end to end, and the exact reason the two 404
  bodies are not byte-identical (a per-request nonce that also differs
  between two requests to the same path).
- Passphrase rotation invalidating an open unlock while leaving the CMS
  login intact.
- The permission legs with my own canaries: filtering before prompt
  construction observed in an echoed prompt, lane ceilings and source
  classes biting as published, counts computed after filtering, and a
  17-surface rendered sweep at a narrow clearance against a positive
  control showing eight leaks.
- The alert's bound over 125 bursts and 10 rounds of 12 racing processes,
  against a control I first showed fails 29 rounds in 40 — and the
  finding that the advisory lock alone is sufficient, established by
  dropping the unique index and re-running.
- W3's five idioms closed, seven new ones open, no false positives, and
  an independent over-broad scan confirming every non-database gate is
  declared.
- W4 closed in three environments, pinned by a test I watched go red, and
  the corrected suite count reconciled to the unit.
- Every new test watched red against `0f03a6a`.
- Both adversarial suites armed by hand, 10/10 and 18/18, zero skips.
- The Scott firewall at module-graph level in both directions.
- The `node_modules` symlink gone from the index and refused by
  `.gitignore` in both forms.

## 7. What I inherited rather than re-established

- The correctness of the sixteen prior cycles' fixes outside the areas
  above. I re-tested F1, F2, F7, F8, G1, G5, G7, H1, H3, J1, K1, L2, M7,
  N4, Q1, R1, T2, T3, U1, U5 and V1-V5 directly or as a side effect of
  the sweeps; I did not re-derive the others.
- That the boot line's report of the alarm being inert without
  `GMAIL_APP_PASSWORD` matches what a real send would do. I read the code
  and the boot output; I sent no mail.
- The social layer's refusal set, the twelfth review's findings, and
  everything the previous sixteen passes established about the Scott
  demonstration beyond the firewall check and the adversarial suite.

## 8. What I could not test, stated plainly

- **No live alert email has ever been delivered**, on seventeen passes.
  `GMAIL_APP_PASSWORD` is unset here and I did not set it. The boot line
  says so honestly, which is finding H3 working, but the end-to-end mail
  path is unproven.
- **The paid live-AI suites were not armed** and no money was spent.
  Every model interaction here used a stub.
- **Railway, Drive and the live domain are unreachable from this
  sandbox.** Staging and production behaviour is verified here by nobody.
- **The brain runs with zero real records here.** My canaries test the
  filter; they cannot test the *tagging* — whether genuinely confidential
  Arrington material is marked confidential in the real snapshot. That is
  J4's open half and it is still open.
- **There is one real human clearance.** `ws_restricted` has no login, so
  the narrow-clearance rendered sweep required a worktree patch. It is a
  faithful test of the machinery, not of a real second user.
- I reviewed `views/workspace/*` only for the lines rendered beside
  Ruth's and for escaping, not for visual correctness.

## 9. What remains Tom's, not the builder's, and not mine

1. **The production release decision itself.** A PASS from this lane says
   the candidate holds its claimed properties; it does not enable
   anything. Merging is inert (`ENABLE_ARRINGTON_AI_WORKSPACE` unset), and
   I re-established that with 5,130 flag-off probes.
2. **Rotating the secrets named in findings K4 and L3 before production**
   — `WORKSPACE_ACCESS_PASSPHRASE`, `WORKSPACE_SNAPSHOT_KEY`,
   `SESSION_SECRET` and the account passwords. That instruction stands
   from the sixth review and nothing in this pass discharges it.
3. **J4's open half: seeding enough genuine confidential records** that
   the tagging, not merely the filter, can be tested.
4. **`lib/scott/clearance.js`'s `personaDomains` fail-open**, still live
   in production Scott and still outside this candidate. Correct to leave
   it here; it needs its own change. I note the builder now has a
   worktree named `fix/scott-clearance-fail-closed`, which is the right
   place for it and not part of this candidate.
5. **Setting `WORKSPACE_ALERT_EMAIL` and `GMAIL_APP_PASSWORD` on the
   deployment**, or accepting knowingly that the failed-unlock alarm is
   inert. The boot line will say which.
6. **Running the adversarial suites by hand against the actual
   deployment** before the release decision. I ran both green against a
   local instance; that is evidence about the code, not the deployment.

## 10. Observations that are not findings

- **A dead alternation in a test regex.** `she cannot invent a colleague`
  still asserts `/could not tell who holds that|did not match one of the
  specialists/`. The first alternative is the sentence W1 deleted, so half
  that regex can never match. Harmless — the permitted-set test would
  catch a regression to it — but it is the same "dead wording" the
  permitted-set test's second direction exists to prevent, in the same
  file.
- **The workspace adversarial suite's skip reason does not name
  `WORKSPACE_TEST_PASSPHRASE`**, while `gatedSuites.test.js`'s `arms`
  field does. A reader arming it from the skip message alone gets a run
  whose post-unlock half reports NOT EXECUTABLE.
- **`POST /api/workspace/social/request-action` still does not validate
  `platform`** against `PLATFORM_IDS`; an arbitrary string lands in an
  approval title. Not a leak and not an execution path — the approval
  record executes nothing — but an approval can name a platform that does
  not exist. Carried forward from the sixteenth pass, unchanged.
- **`DB_ONLY_GATE` suppresses two of the three clauses, not one.** The
  file says it "suppresses only the clause it is about". `registersSomething`
  is checked first and unconditionally, which is the substance of U3;
  `returnsEarlyOnEnv` is still suppressed by the phrase, but only when
  there is no non-ambient read, which is the same narrow corner as X3.
  Below the bar on its own.
- **Ruth's line is still not persisted.** Reloading a conversation renders
  `Records supplied: …` with no receptionist note. Consistent and not
  misleading, just uneven. Carried forward.

---

## 11. Closing

The W cycle is correct. All four findings are genuinely fixed, and the
three that carry weight — Ruth's honesty pinned by a declared set rather
than a list of verbs somebody thought of, a classifier whose claim has
been narrowed to what its code does, and a test tree that no longer runs
its own fixtures — I established myself rather than reading them. The
strongest single result in this pass is not a finding at all: the alert's
concurrency guarantee now survives having one of its two mechanisms
removed, against a harness that breaks the two-mechanism-free predecessor
29 times in 40.

It is also the seventeenth instance, four times over, and the register is
the same one the sixteenth pass described: **the code has stopped being
wrong and the sentences about the code have not quite caught up.** A
guard whose stated mechanism is wider than its implementation; a test
whose name says "every" and whose body says "five"; a factoring claim
that holds for two rules out of three; and a document that describes a
copy of itself that no longer exists. Every one of them is a comment, a
sample size, or an archive. None reaches Tom, and none reaches an
attacker.

**VERDICT: PASS**, with four LOW findings (X1, X2, X3, X4), the six items
in section 9 reserved to Tom, and the limits in section 8 stated rather
than glossed.
