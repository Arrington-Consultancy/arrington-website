# Fifteenth independent Governance & Assurance review

## Arrington AI Workspace v0.1 release candidate

**Lane:** ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
**Date:** 31 August 2026.
**Candidate:** branch `feature/arrington-ai-workspace-v0-1`, frozen head
`6d6c4d11397ef8bafdfb414e787d739839eb9f51`.
**Under review:** the U cycle — `review/workspace-v0.1-u-remediation-2026-08-31.md`,
answering the fourteenth pass (`review/workspace-v0.1-governance-review-14-2026-08-31.md`,
AMBER, U1 MEDIUM plus four LOW).

### Tree state, at the start

```
$ git rev-parse HEAD
6d6c4d11397ef8bafdfb414e787d739839eb9f51
$ git status --porcelain
$ git branch --show-current
feature/arrington-ai-workspace-v0-1
$ sha256sum data/workspace-snapshot.enc
e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2  data/workspace-snapshot.enc
```

Working tree clean, no output from `git status --porcelain`.

### Tree state, at the end

```
$ git rev-parse HEAD
6d6c4d11397ef8bafdfb414e787d739839eb9f51
$ git status --porcelain
$ sha256sum data/workspace-snapshot.enc
e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2  data/workspace-snapshot.enc
```

The tree did not move under me and the brain snapshot is byte-identical.
Every experiment needing a code change was run in
`git worktree add /tmp/gov15wt 6d6c4d1`, which was restored to the frozen
head and removed. Nothing in the candidate was edited (finding K5's
standing correction, respected).

---

## 1. The bounded question

**Is the U cycle correct, and is U's remedy the fifteenth instance of the
chain's recurring defect rather than the end of it?**

The recurring defect across fourteen passes is *a security or honesty
property asserted and not held*, and in the last several passes each
finding was introduced by the fix for the one before it.

---

## 2. VERDICT: AMBER

**Five findings: one MEDIUM (V1), four LOW (V2-V5). No HIGH. No STOP.**

The answer to the bounded question is: **the U cycle is substantially
correct, and it is also the fifteenth instance.**

U1 and U5 are genuinely fixed and their tests genuinely have power — I
put the frozen head's `test/workspace/receptionist.test.js` onto
`eeb3a25` and watched three cases go red. U2 is fixed. U3 is fixed, and
I probed it in both directions.

But **the sentence written to correct U1 asserts something that did not
happen, on the same default path, in the same function, in the current
deployment state.** Ruth now tells the owner a question "was answered
from the general records" when there were no general records at all —
while the lane branch three lines below has a purpose-built honest
sentence for exactly that case which the no-lane branch does not use.
The remediation says "The no-lane turn now says what is true." It does
not, when the count is zero, and the count is zero in the state this
candidate is actually in.

That is not a leak and not a gate. It is standing rule J3 — no code path
may claim something that did not happen — broken in the component added
to be honest, by the commit that corrected the last instance of the same
thing. On the chain's own precedent (U1 was MEDIUM for these reasons) it
is MEDIUM.

**AMBER, not RED.** Nothing an attacker can do changed. I re-established
all three gates with positive controls in the same runs, the permission
legs with canaries I built myself, the alert's concurrency bound against
a harness I first proved could break a defective predecessor, and the
Scott firewall at module-graph level. All held.

**AMBER, not PASS.** The twelfth pass's PASS carried two LOW findings and
no MEDIUM. This carries a MEDIUM that is the direct successor of the
previous MEDIUM, plus a gated-suite scan defeated for the eighth
consecutive review by the very shape the previous finding named. I will
not award a PASS out of fatigue on the fifteenth pass.

---

## 3. Independence, and its limits

I am a separate lane from the builder and I ran my own instruments. I
state plainly what I inherited (section 7) and what I could not test
(section 8). I did not merge, deploy, enable, or arm any paid suite; I
changed no environment variable on any real deployment; I touched
Railway, Drive and production not at all. Every database I used was
created from nothing under a throwaway role and dropped at the end.

---

## 4. What I did, with observed results

### 4.1 Ruth's entire reachable output space, enumerated myself

I did not read the builder's sweep. I enumerated `handoffNote` over 17
lane-id values (including `constructor`, `__proto__`, `toString`,
`valueOf`, `hasOwnProperty`, an array, an object, `0`, `false`) × 2
answered × 2 gapRaised × 4 record counts = 272 calls.

```
$ node /tmp/gov15/ruth-enum.js
DISTINCT OUTPUTS: 17
```

Seventeen distinct strings, six distinct sentence shapes. No prototype
member ever produced a colleague; every crafted id fell through to the
no-lane branch. T2 holds at the receptionist.

Then I drove the **real endpoint** with the model stubbed by a `--require`
preload calling the module's own `__setClientFactoryForTests`, so the
candidate's source was untouched:

```
Q: "how much cash do we have"
   status=200 laneId=null laneName=null provenance=[] gap=null
   RUTH: That did not match one of the specialists, so it was answered from the general records rather than by one of the nine.

Q: "what should I do today"          -> same sentence
Q: "who owes us money"               -> same sentence
Q: "zzz qqq wibble"                  -> same sentence
Q: "anything"  forcedLane="constructor"   -> same sentence
Q: "anything"  forcedLane="__proto__"     -> same sentence
Q: "anything"  forcedLane="toString"      -> same sentence
Q: "anything"  forcedLane="not-a-real-lane" -> same sentence

Q: "tell me about the google ads campaign"
   status=200 laneId="google_ads" provenance=[] gap=null
   RUTH: ARRINGTON GOOGLE ADS answered from what they hold. No specific record is behind it, so treat it as their reading rather than as evidence.
```

`provenance=[]` in every case: the brain in this environment holds zero
records, which is the documented unseeded state ("No key means no
ingest, reported honestly as an unseeded brain"), and the U remediation
itself records that its own run had "zero records". See finding **V1**.

### 4.2 U1 and U5, verified red against the previous head

```
$ cd /tmp/gov15wt && git checkout -q eeb3a25 && git rev-parse HEAD
eeb3a25cdadca3e9edada32c8615e5859b7f6a1f
$ git show 6d6c4d1:test/workspace/receptionist.test.js > test/workspace/receptionist.test.js
$ node --test test/workspace/receptionist.test.js
ok 1 - she is not a tenth lane: the register is untouched
ok 2 - she holds no source class, no ceiling and no clearance
ok 3 - she can speak about the routing and never about the content
not ok 4 - she cannot invent a colleague, including one inherited from Object
not ok 5 - a gap is reported even when an answer came back, on BOTH paths
not ok 6 - she never claims to have written an answer
ok 7 - her directory exposes names, never what any lane can read
ok 8 - nothing of Scott reaches her
# pass 5
# fail 3
```

The U1 and U5 tests do have power against the code they were written
for. The claim "red against `eeb3a25`" is true.

I also confirmed U5 through the endpoint: with the stub raising a gap,
the no-lane turn reports it (`gapRaised` is no longer inert on the
default path), and the lane turn still does.

### 4.3 Gate 1: is a workspace path distinguishable with the flag off?

A raw-socket comparator, no HTTP client library, comparing the **entire
response** — status line, every header, body — with only Date, nonces,
Set-Cookie and ETag normalised, and the requested path masked out on
both sides so a path echo cannot masquerade as a difference.

22 workspace paths (every real page route and every real API route,
taken from the source, not from a list I was handed) × 10 spellings
each (upper case, mixed case, `/API/`, trailing slash, query string,
doubled slashes, percent-encoded, `..` traversal, `/x/../` prefix) plus
7 control paths that genuinely do not exist, × 12 methods (GET, HEAD,
POST, OPTIONS, TRACE, PATCH, PUT, DELETE, PROPFIND, an invented `FOO`,
and lower-case `options`/`get`) × 5 Accept values.

```
$ PROBE_PORT=4317 node gate-off3.js
FLAG OFF | groups: 60; requests: 13620; groups where a workspace path differs from a control: 10
```

Ten of sixty groups split, and I chased every one. **They are all the
same thing and it is not a disclosure**: Express's own trailing-slash
normalisation answers `/<anything>/..` and `/<anything>//..` with a 301
whose Location echoes the requested path. Against a length-matched
nonexistent control the two responses are byte-identical apart from that
echo:

```
$ curl -sD- --path-as-is http://127.0.0.1:4317/workspace//..   -> 301, Content-Length: 163, Location: /workspace//../
$ curl -sD- --path-as-is http://127.0.0.1:4317/wxrkspace//..   -> 301, Content-Length: 163, Location: /wxrkspace//../
$ curl -sD- --path-as-is http://127.0.0.1:4317/workspace/..    -> 301, Content-Length: 162, Location: /workspace/../
$ curl -sD- --path-as-is http://127.0.0.1:4317/wxrkspace/..    -> 301, Content-Length: 162, Location: /wxrkspace/../
```

Identical header sets in identical order, identical lengths. Nothing
about whether the workspace exists is observable.

I ran the same comparator against the server with the flag **on**, still
anonymous, over 5,640 requests: 0 of 40 groups split.

**Timing.** 400 interleaved pairs per path against length-matched
controls:

```
WS  /workspace/brain       n=400 p10=0.87 median=1.74 p90=2.34 mean=1.58 ms
WS  /api/workspace/ask     n=400 p10=0.84 median=1.66 p90=2.16 mean=1.55
CTL /wxrkspace/brain       n=400 p10=0.83 median=1.64 p90=2.10 mean=1.47
CTL /api/wxrkspace/ask     n=400 p10=0.82 median=1.57 p90=2.08 mean=1.50
```

A consistent ~0.1 ms (≈6%) median excess on the workspace paths,
attributable to `refuseUnroutedMethods`'s regex and the extra route-table
entries. It is an order of magnitude inside the per-request spread, the
ordering is not consistent between the two pairs, and it would be
invisible over any network path. I could not build a usable oracle from
it, and I do not claim it is provably zero.

### 4.4 Gates 2 and 3: the full CMS-admin takeover, with a positive control

Run against a real server, real sessions, real CSRF tokens. The premise
is executed rather than assumed:

```
nat login -> {"status":302,"location":"/"}
PREMISE admin resets tom password -> 200 {"success":true}
ATTACKER login as tom -> {"status":302,"location":"/"}
  GET /workspace          -> HTTP/1.1 302 Found Location: /workspace/unlock
  GET /workspace/brain    -> HTTP/1.1 302 Found Location: /workspace/unlock
  GET /workspace/contacts -> HTTP/1.1 302 Found Location: /workspace/unlock
  GET /workspace/chat     -> HTTP/1.1 302 Found Location: /workspace/unlock
  unlock guess "password"                      -> 401 {"error":"That passphrase is not correct."}
  unlock guess "gov15"                         -> 401
  unlock guess "workspace"                     -> 401
  unlock guess "gov15-passphrase"              -> 401
  unlock guess "gov15-passphrase-abcdefghijk"  -> 401     <- one character short of the real value
  unlock guess ""                              -> 429 {"error":"Too many attempts. Wait fifteen minutes."}
  POST /api/workspace/ask                 -> 404  (site 404 page, not a JSON refusal)
  POST /api/workspace/contacts/1/erase    -> 404
```

The 29-character near-miss is refused identically to `"password"`: no
prefix and no length is observable. The APIs give the ordinary 404 with
no mention of unlocking; the erasure endpoint is behind that line.

**Positive control, on a fresh server so the limiter is not the reason:**

```
tom login -> {"status":302,"location":"/"}
POSITIVE CONTROL correct passphrase -> 200 {"ok":true}
  GET /workspace            -> 200 OK  xrobots=true
  GET /workspace/brain      -> 200 OK  xrobots=true
  GET /workspace/chat       -> 200 OK  xrobots=true
  GET /workspace/contacts   -> 200 OK  xrobots=true
  GET /workspace/gaps       -> 200 OK  xrobots=true
  GET /workspace/activity   -> 200 OK  xrobots=true
  GET /workspace/social     -> 200 OK  xrobots=true
  GET /workspace/workforce  -> 200 OK  xrobots=true
  GET /workspace/approvals  -> 200 OK  xrobots=true
```

So the gate stops the attacker and not the owner, established in the
same session, and `X-Robots-Tag` is on the success path only (G1).

**An uncleared logged-in admin** (`nat`, who holds every CMS capability)
gets the control response on all 15 workspace paths I tried:
`nat GET: 15 identical to control, 0 different`.

### 4.5 The alert's boundedness, with a harness I first proved could break it

Twelve separate OS processes, pool warmed before the start instant
(finding P2's lesson: a cold pool serialises the race by accident),
random jitter rather than a deterministic ladder, a 5 ms send, a
threshold-sized burst pre-seeded per round, against a throwaway database.

Against the frozen head:

```
$ ROUNDS=25 WORKERS=12 node conc/race.js
ROUNDS=25 WORKERS=12  exactly-one=25  duplicated=0  silent=0  worker-nonzero-exits=0
```

**The harness has power, and I established that rather than asserting
it.** In the worktree I removed the advisory lock and dropped the partial
unique index, reproducing the pre-M shape:

```
round 1: DUPLICATE delivered=2
round 4: DUPLICATE delivered=3
round 6: DUPLICATE delivered=3
round 7: DUPLICATE delivered=2
round 9: DUPLICATE delivered=3
ROUNDS=10 WORKERS=12  exactly-one=5  duplicated=5  silent=0
```

5 of 10 rounds broken. Worth recording separately: with the lock removed
but the index **kept**, 12 of 12 rounds were still exactly-one. The
partial unique index is carrying the guarantee independently of the
advisory lock, which is a genuine belt-and-braces rather than a
restatement — the two mechanisms fail independently.

The lock-free run also exercised the honesty path by accident. Every
worker returned:

```
{"sent":false,"error":"bind message supplies 2 parameters, but prepared statement \"\" requires 0",
 "recordedAs":"workspace_unlock_alert_error"}
```

A failure before any send was recorded as an *error*, not as a failed
send, with the real message, and `recordedAs` names the row actually
written. Findings J3, M2, N1 and Q4 hold under a failure I did not
design for.

### 4.6 The permission legs, with canaries I built

I seeded eight records of my own across all seven source classes and all
three sensitivities, plus one `superseded` row, into a throwaway
database, then called the real `buildLaneContext` — the function that
assembles the prompt — over 7 clearance values × 13 lane values.

```
  owner_admin      null                  authority.canary_std, strategy.canary_comm, worker_register.canary_std
  owner_admin      google_ads            + technical_state.canary_comm
  owner_admin      opportunity_builder   + opportunity.canary_conf
  owner_admin      governance_assurance  all seven
  owner_admin      constructor           (none)
  owner_admin      __proto__             (none)
  owner_admin      not-a-lane            (none)
  ws_restricted    null                  authority.canary_std, worker_register.canary_std
  ws_restricted    opportunity_builder   authority.canary_std, worker_register.canary_std
  ws_restricted    governance_assurance  authority.canary_std, project.canary_std, worker_register.canary_std
  ws_restricted    constructor           (none)

LEAKS (non-standard sensitivity reaching a narrower clearance): NONE
superseded record in the general context? false
```

The intersection is exactly as documented: the narrowest of the human
leg and the lane leg wins; `governance_assurance` is the only lane that
reads every source class; a crafted lane id yields zero records rather
than everything; a superseded record never reaches the prompt. Filtering
happens inside `buildLaneContext`, before any prompt string exists, so
there is nothing to redact afterwards. Counts on every page are computed
from the already-filtered array (`navCounts`, `classPage`, the brain
page) — I read all of them.

### 4.7 The adversarial suite, run by hand against a running instance

```
$ WORKSPACE_TEST_BASE_URL=... WORKSPACE_TEST_TOM_PASSWORD=... WORKSPACE_TEST_OTHER_PASSWORD=... \
  WORKSPACE_TEST_PASSPHRASE=... node --test test/workspace/adversarialApi.test.js
    ok 1 - an anonymous visitor gets an ordinary 404, not a login redirect
    ok 2 - an anonymous workspace API call looks like a call to a route that does not exist
    ok 3 - every method is refused the same way, not just GET and POST
    ok 4 - a logged-in site admin who is not Tom sees nothing, and is told nothing
    ok 5 - Tom can authenticate, so every check below means something
    ok 6 - a logged-in cleared session reaches nothing until it presents the passphrase
    ok 7 - a wrong passphrase is refused, it is recorded, and the session stays locked
    ok 8 - the right passphrase opens it, and every page is noindex
    ok 9 - erasure refuses a mismatched confirmation even for Tom
# pass 10
# fail 0
# skipped 0
```

10/10, reproducing the builder's claim. On my **first** run case 9
reported `# SKIP NOT EXECUTABLE: no contact exists in this environment`;
I seeded a lead, ran the contact sync, and re-ran to make it executable.
Recording that because "10/10" is only true on a database that has a
contact, and the suite is honest about it rather than passing hollow —
which is the right behaviour, but a reader of the remediation's "10/10"
would not know a contact was needed.

### 4.8 The regression suite

```
$ npm test
# tests 548
# pass 546
# fail 0
# skipped 2
EXIT=0
```

Matches the remediation exactly. `scripts/runTests.js` does preserve the
child's exit code: a run with a failure returned `EXIT=1`. See finding
**V4** for the condition under which that green is not reproducible.

### 4.9 The gated-suite scan, attacked

Seven shapes written into a throwaway `test/gov15probe/` inside the
worktree, then the scan run against them. Three caught, four not:

| shape | flagged? |
|---|---|
| `if (process.env.runLiveThing)` — lower-case direct read | **yes** (U4's fix) |
| `process.env[k]` — computed read | **yes** |
| `const env = process.env; env.runLiveThing` — alias, lower case | **yes** (T5's fix) |
| `const { RUN_LIVE_THING } = process.env` — upper-case destructure | **yes** |
| `const { runLiveThing } = process.env` — **lower-case destructure** | **no** |
| `const { runLiveAi } = process.env` — **mixed-case destructure** | **no** |
| `const P = process; P.env.X` | no |
| `Object.assign({}, process.env)` then read | no |
| a gate that is not an env read at all (file existence) | no |

The last three are arms-race shapes the check explicitly disclaims and I
do not count them against it. The two destructuring cases are different:
they are **the exact shape finding U4 named**, in the same expression,
half fixed. See **V3**.

I also probed U3 in both directions and it is genuinely fixed:

```
these suites can decline to run in a way the runner cannot report:
  gov15probe/dbphrase_noregister.test.js (registers no tests)
```

A file containing the literal phrase "set DATABASE_URL" is still checked
for registering nothing. A plain suite and a genuine database-only gate
were both correctly left alone.

### 4.10 The T2 prototype class, hunted again

I enumerated every dynamic bracket lookup in `lib/`, `routes/`,
`middleware/`, `server.js` and `db/`, then traced which of them can be
keyed by anything a request influences.

- `lanes.js` `LANES_BY_ID` — null prototype. Confirmed: crafted ids yield
  zero records and no colleague.
- `social/registry.js` `PLATFORMS[id]` — a plain object literal, and
  `connectorMayDo` would fall through `if (!p) return false` on a
  prototype key. **Not reachable**: `assertAutonomousAllowed` has no
  caller outside tests, `isConfigured` is only ever called with ids from
  `PLATFORM_IDS`, and `requestHumanAction` never indexes the table at
  all.
- `clearance.js` `HUMAN_CLEARANCE[user.username]` and
  `CLEARANCES[clearanceId]` — plain object literals whose `if (!x)`
  fail-closed check is defeated by any `Object.prototype` member. This is
  a live instance of the class. See **V5**; it is not attacker-reachable
  and I say so.

### 4.11 The Scott firewall, at module-graph level

Not a grep. I loaded each workspace module and walked `require.cache`
children transitively, in both directions:

```
workspace -> scott edges: NONE
scott -> workspace edges: NONE
```

`lib/workspace/**` and `routes/workspace.js` reach no Scott module; the
Scott entry points reach no workspace module. The only occurrences of the
word "Scott" in the workspace are a routing keyword and a lane remit,
both of which are Arrington's own description of its bounded
demonstration project, not imported fiction.

---

## 5. Findings

### V1. The sentence written to fix U1 asserts records that did not exist, on the default path, in the state this candidate is actually in. Severity: MEDIUM

**What is claimed.** `review/workspace-v0.1-u-remediation-2026-08-31.md`,
under U1: *"Correction. The no-lane turn now says what is true: no
specialist matched, and the workspace answered from its general
records."* And: *"She never claims authorship anywhere."* And in
`lib/workspace/receptionist.js:75`: *"What is true: no specialist
matched, and the workspace answered from its general context."*

**What is actually true.** `buildLaneContext` with no lane returns the
records of the three general source classes that survive the reader's
clearance and a `doc_status` filter. That can be, and in this candidate's
documented state always is, **zero**. When it is zero, nothing was
answered "from the general records", because there were none.

**Observed, through the real endpoint, at the frozen head**, with the
model stubbed and the brain in its shipped unseeded state
(`SELECT count(*) FROM workspace_records` → `0`):

```
Q: "how much cash do we have"
   laneId=null  provenance=[]  gap=null
   RUTH: That did not match one of the specialists, so it was answered from
         the general records rather than by one of the nine.
```

**The interface contradicts her in the same line.** The metadata strip in
`views/workspace/chat.ejs` is built as
`[receptionist, laneName, provenance-or-"No records were available", gap]`
joined by `·`. Reproducing that construction from the real API response:

```
UI META LINE AS RENDERED:
  That did not match one of the specialists, so it was answered from the general
  records rather than by one of the nine. · No records were available for this answer.
```

And with a gap raised:

```
  That did not match one of the specialists, so it was answered from the general
  records. They do not fully cover it, and I have written the gap down rather than
  let it pass. · No records were available for this answer. · Gap raised: missing
```

"They do not fully cover it" is said of a set that is empty.

**The honest sentence already exists, three lines below, and the no-lane
branch does not reach it.** All four `recordCount = 0, answered = true`
combinations, from one run:

```
lane=google_ads  gap=false -> ARRINGTON GOOGLE ADS answered from what they hold. No specific
                              record is behind it, so treat it as their reading rather than
                              as evidence.                                          <- HONEST
lane=google_ads  gap=true  -> I took that to ARRINGTON GOOGLE ADS. They answered, but the
                              records do not fully cover it, ...                    <- asserts records
lane=null        gap=false -> That did not match one of the specialists, so it was answered
                              from the general records ...                          <- asserts records
lane=null        gap=true  -> ... answered from the general records. They do not fully
                              cover it ...                                          <- asserts records
```

Three of the four zero-record turns assert an evidential basis that did
not exist. The one that does not is the one branch U1's fix did not
touch. The `if (!recordCount)` honesty branch is unreachable on the
no-lane path at all (it sits below the early return U1 added) and
unreachable on the lane path whenever a gap is raised (it sits below the
`gapRaised` branch U5 added).

**Why this is the fifteenth instance and not a new kind of problem.**

- It is on the **default** path. Routing is nine keyword regexes; the
  fourteenth pass measured that and the builder accepted it. "How much
  cash do we have", "what should I do today", "who owes us money" all
  land here, and so does every crafted or unknown forced lane id.
- It is in the **current deployment state**. `ENABLE_WORKSPACE_AI` is off
  in staging today, so nobody has seen it yet; the moment the AI flag is
  turned on without `WORKSPACE_SNAPSHOT_KEY`, this is the sentence every
  visitor to Ask Ruth receives, and the U remediation's own evidence
  section says "The brain ran with **zero records**".
- It was **introduced by the fix for the previous finding**, which is the
  pattern the last six passes have each recorded.
- **No test asserts the property.** `recordCount: 0` appears in the
  receptionist suite only inside the U1 authorship sweep, which asserts
  the absence of `/\bI (?:answered|wrote|...)\b/` and nothing about
  whether records are claimed. There is no case anywhere asserting that a
  sentence mentioning records is produced only when records existed.

**Why MEDIUM.** It opens nothing, leaks nothing and defeats no gate — I
checked all three. It is MEDIUM for the reasons U1 was: it is the
unclosed consequence of the previous pass's only MEDIUM, the response
asserts it is closed, and it breaks standing rule J3 in the one system
whose entire value to Tom is that what it tells him about evidence can be
relied on. The distinction matters here more than it did for U1: U1
misattributed authorship, which a reader might discount as a persona
convention; this **misstates the evidential basis of an answer**, which is
the single thing the workspace exists to be trusted about.

**Why not HIGH.** No confidentiality or access consequence, and the
interface's own provenance line tells the truth beside her, so a careful
reader is not actually deceived — only contradicted.

**What would close it.** Carry the zero-record honesty into both
branches, so that no sentence mentioning records is emitted when
`recordCount` is 0 — for example, on the no-lane path, "That did not
match one of the specialists, and there was no record on file to answer
it from", and on the gap path, drop "they do not fully cover it" in
favour of what actually happened. Then a test that sweeps the four
`recordCount = 0` combinations and asserts no output claims a record,
watched red against `6d6c4d1`. If instead the wording is being kept
deliberately, say so in the module beside the string and in `CLAUDE.md`,
and withdraw "the no-lane turn now says what is true".

---

### V2. "She never claims authorship anywhere" is false, and the test named for the property is written narrowly enough to miss it. Severity: LOW

**What is claimed.** The U remediation: *"She never claims authorship
anywhere."* The module's own comment: *"a sentence in which she claims
authorship of an answer is exactly the dishonesty this codebase has
spent thirteen reviews removing from everywhere else."*

**What she says.** Three of her six reachable sentence shapes:

```
[1] ... They do not fully cover it, and I have written the gap down rather than let it pass.
[4] I took that to X. They answered, but the records do not fully cover it, so I have
    written the gap down rather than let it pass.
[9] I took that to X, and the records do not answer it. I have written it down as a gap
    rather than guess.
```

Ruth holds no clearance, no database handle and no write path. The gap is
written by `repo.createGap` in `routes/workspace.js`, from a field the
model returned. She is handed a boolean.

**The substance is true and only the attribution is wrong**, and I want to
be fair about that: the gap genuinely is recorded before she speaks — I
confirmed the rows exist (`SELECT ... FROM workspace_gaps` returned the
canary gaps with `raised_by` `workspace_ai` and `lane:google_ads`). What
is false is "I". A reader might accept that as receptionist idiom. But
the chain already rejected that defence once: "I answered that one
myself" was also idiom, and U1 graded it MEDIUM.

**The test cannot see it.** `test/workspace/receptionist.test.js`, the
case named *"she never claims to have written an answer"*:

```js
const claims = /\bI (?:answered|wrote|worked (?:it|that) out)\b/i;
```

"I **have** written the gap down" does not match `\bI (?:...|wrote|...)`,
because the word after "I" is "have". The regex is narrow enough to
match the one string that was wrong and to pass over the three that
remain. That is the same defect the chain has recorded at K2, M1, N1 and
P1: a test that asserts something adjacent to the property and stays
green while the property is false.

**What would close it.** Either broaden the sentences so no first-person
act appears ("the gap was written down rather than let pass"), or record
in the module and in `CLAUDE.md` that first-person routing idiom is a
deliberate, bounded convention and withdraw the unqualified "she never
claims authorship anywhere". Whichever is chosen, widen the test's regex
so it would have caught these, and watch it red first.

---

### V3. U4's fix made one of three read-shapes case-insensitive and left the other two case-sensitive — in both directions. Severity: LOW

**What is claimed.** The U remediation: *"**U4**: the same fix was half
done. The name after `process.env` had to be upper case, so a lower-case
or mixed-case read slipped through, and a computed bracket key was
invisible. Both are ordinary JavaScript, and both are named in the
paragraph that claimed to cover them. Fixed... Seven probes, both
directions."*

**(a) False negative.** The `referenced` set in
`test/gatedSuites.test.js` is built from three sub-expressions. The first
was made case-insensitive (`process\.env\.([A-Za-z0-9_]+)`). The
destructuring one was not:

```js
.concat((src.match(/\{([^{}]*)\}\s*=\s*process\.env/g) || [])
  .flatMap((m) => (m.match(/[A-Z0-9_]{2,}/g) || [])))
```

`[A-Z0-9_]{2,}` requires two consecutive upper-case characters, so
`const { runLiveThing } = process.env` yields nothing. Observed, with the
upper-case form as a control in the same run:

```
these suites can decline to run in a way the runner cannot report:
  gov15probe/ucdestructure.test.js (reads RUN_LIVE_THING)
```

`lcdestructure.test.js` (`const { runLiveThing } = process.env`) and
`mixeddestructure.test.js` (`const { runLiveAi } = process.env`) were
**not** listed. Both register a costly test conditionally and both are
invisible to the runner as well, because a test that is never registered
emits nothing — which is the exact gap finding S1 opened and U4 claimed
to finish closing.

**(b) False positive, introduced by the same fix.** The suppressors that
stop a suite being flagged for *manipulating* an env key as part of a
test were left upper-case-only:

```js
(src.match(/process\.env\.([A-Z0-9_]+)\s*=/g) || [])
(src.match(/delete\s+process\.env\.([A-Z0-9_]+)/g) || [])
```

So a suite that sets and restores a lower-case key — the very pattern the
remediation says it deliberately protected for upper-case names ("five
real suites here set or delete env keys by computed name as part of a
test, and flagging those was a false positive that would have made this
check noise") — is now reported as an undeclared gated suite:

```
these suites can decline to run in a way the runner cannot report:
  gov15probe/lcassign.test.js (reads myFlag)
```

No suite in the tree uses a lower-case env name today, so this is latent.
It matters because a check that produces a false failure is a check that
gets loosened.

**(c) The seven probes are not in the tree.** I looked. There is no
fixture directory, no synthetic probe file, and no test that exercises
the scan's own behaviour; the "seven probes, both directions" were run by
hand and are not committed. The chain's own working rule, adopted after
J1, is that every asserted property must name the test that establishes
it. Nothing establishes U3 or U4.

**What would close it.** Make the destructure extraction and the
assign/delete suppressors case-insensitive together, and commit the
probes: a small fixture directory the scan is run against, asserting both
directions, watched red against `6d6c4d1` for the two destructure shapes
and for the lower-case assignment.

---

### V4. `npm test` is not green in the environment `CLAUDE.md` itself tells a developer to create. Severity: LOW

**What is claimed.** The U remediation: *"Full suite: **548 tests, 546
pass, 0 fail**."*

**That is true, conditionally.** I reproduced it exactly:

```
# tests 548
# pass 546
# fail 0
# skipped 2
EXIT=0
```

**But my first run failed**, and the reason is not the code:

```
not ok 4 - the flag alone, without both passwords, refuses rather than silently skipping
  error: 'Missing expected exception: a half-configured reset must fail loudly,
          not run with an undefined password'
not ok 43 - RESET_USER_PASSWORDS (db/seed.js)
# pass 545
# fail 1
EXIT=1
```

`test/resetUserPasswords.test.js` spawns the seed with
`{ ...process.env, RESET_USER_PASSWORDS: 'true', NAT_PASSWORD: 'only-one-set' }`
and asserts it throws because `TOM_PASSWORD` is absent. If `TOM_PASSWORD`
is exported in the caller's shell, the spread carries it through and the
seed correctly does not refuse — so the test fails.

`CLAUDE.md`'s own Development section instructs exactly that:

```
export NAT_PASSWORD=...
export TOM_PASSWORD=...
npm run dev
```

So a developer who followed the project manual to bring up a fresh
database, and then ran the suite in the same shell, gets a red suite for a
reason that has nothing to do with the change under test — and, worse, the
test's side effect is that both real account passwords are rewritten
along the way.

This is outside the workspace and pre-existing. I raise it because the
entire fifteen-pass evidence base rests on "npm test is green", and a
green that depends on an ambient variable the test does not control is a
weaker fact than it appears.

**What would close it.** Have the test build the child environment
explicitly, deleting `NAT_PASSWORD` and `TOM_PASSWORD` from the copy it
passes, rather than spreading the caller's shell.

---

### V5. Two residual T2-class lookups in `lib/workspace/clearance.js` do not fail closed on a prototype key. Not attacker-reachable. Severity: LOW

**What is claimed.** The U remediation, recording the fourteenth pass:
*"They also hunted the T2 prototype class across every dynamic lookup in
`lib/`, `routes/`, `middleware/`, `server.js` and `db/` and found **no
second reachable instance**."*

**What I found.** `HUMAN_CLEARANCE` and `CLEARANCES` are plain object
literals, and both are guarded by a truthiness check that an
`Object.prototype` member defeats:

```js
const clearance = HUMAN_CLEARANCE[user.username];
if (!clearance) return null;              // 'constructor' is truthy: not taken
...
const c = CLEARANCES[clearanceId];
if (!c) return false;                     // same
return c.sensitivities.includes(sensitivity);
```

Observed directly against the real functions:

```
THROWS constructor / google_ads: Cannot read properties of undefined (reading 'includes')
THROWS __proto__  / null:        Cannot read properties of undefined (reading 'includes')
```

**It is not reachable by an attacker, and I want that stated plainly
rather than dressed up.** `clearanceId` is only ever
`clearanceForUser(user)`; I grepped for any request-derived clearance and
there is none (`req.workspaceClearance` is assigned in exactly three
places, all from `clearanceForUser`). Reaching the throw needs
`WORKSPACE_OWNER_USERNAME` to be set to an `Object.prototype` name *and*
a CMS user of that name with the matching id — i.e. it needs the Railway
variable, which is the thing gate 3 exists because attackers cannot
reach. The outcome would then be a 500, not access.

There is one real, if small, consequence short of that:
`describeOwnerBinding()` uses the same lookup, so setting
`WORKSPACE_OWNER_USERNAME=toString` would print `owner binding ok` at boot
for a username that holds no clearance in code. A boot diagnostic that
reports a gate as configured when it is not is the class of thing G7 was.

**What would close it.** The one-line fix already applied in `lanes.js`:
build both maps with `Object.assign(Object.create(null), ...)`, and add a
case to `test/workspace/clearance.test.js` sweeping `constructor`,
`__proto__`, `toString`, `valueOf`, `hasOwnProperty` through
`clearanceForUser`, `clearanceCanSeeSensitivity` and `clearanceCovers`,
asserting each returns the closed answer rather than throwing. It should
be done for symmetry and because "no second reachable instance" is a
claim about reachability that will be re-tested by whoever next changes
this file — not because anything is open today.

---

## 6. What held, re-established rather than inherited

Everything in this list I ran myself, at the frozen head, on a database I
created from nothing.

- **Gate 1.** 13,620 anonymous requests, 22 real workspace paths × 10
  spellings × 12 methods × 5 Accept values against 7 controls: no
  observable difference in status, headers, body or length. The two
  apparent splits are generic Express path normalisation that a
  length-matched nonexistent path reproduces byte for byte.
- **Gate 1 with the flag on**, still anonymous: 5,640 requests, 0 of 40
  groups split.
- **Gate 2.** A logged-in site admin with every CMS capability gets the
  control response on all 15 workspace paths tried.
- **Gate 3.** The full CMS-admin takeover — password reset executed, not
  assumed — stops at the unlock screen; five guesses including a
  one-character near-miss all 401; every API 404s; the erasure endpoint
  is behind that line. Positive control in the same run: the correct
  passphrase opens all nine pages, each with `X-Robots-Tag`.
- **The alert's bound.** 25 rounds × 12 racing processes, exactly one
  notice every time, zero silent — with the harness first shown to break
  a lock-free, index-free predecessor 5 times in 10.
- **The permission legs.** My own eight canary records across seven
  source classes and three sensitivities: no non-standard sensitivity
  ever reached the narrower clearance, on any lane; crafted lane ids
  yield zero records; superseded records never reach the prompt;
  filtering precedes prompt construction and counts follow filtering on
  every page.
- **The Scott firewall**, at module-graph level, in both directions.
- **T2 at the receptionist and the router.** 272 direct calls plus eight
  crafted forced lane ids through the live endpoint: no colleague from
  the prototype chain, no echoed id, no 500.
- **The adversarial suite**, 10/10 by hand against a running instance.
- **The regression suite**, 548/546/0/2, exit 0.
- **U1, U5 red against `eeb3a25`**, using the frozen head's own test file
  on the previous head's module.
- **U3**, probed in both directions and genuinely fixed.
- **U2**, corrected in `CLAUDE.md`: it now says "a lane id, two booleans
  and a count".

## 7. What I inherited rather than re-established

- The twelfth pass's findings S1 and S2, and the earlier F, G, H, J, K, L,
  M, N, P, Q and R remediations, except where a probe of mine happened to
  cross them. I spot-checked J3/M2/N1/Q4 (through an accidental failure,
  section 4.5) and G1/G7/H1/H3 (through the boot line and the success-path
  header), and did not re-derive the rest from scratch.
- The claim that the nine lanes mirror the canonical Arrington worker
  register. That is a Drive fact and I have no access to Drive.
- The correctness of the deterministic content of `db/seed.js` outside the
  workspace tables.

## 8. What I could not test, stated plainly

- **Live AI.** The paid suites were not armed, by instruction and by my
  own judgement. Everything in section 4.1 used a stubbed model, so I
  established what the workspace *puts in front of* the model and what it
  says *around* the answer — not how a real model behaves inside it.
- **The real brain content.** I do not hold `WORKSPACE_SNAPSHOT_KEY`, so
  `data/workspace-snapshot.enc` was never decrypted (its hash is
  unchanged). My canaries test the **filter**; they do not test the
  **tagging**, i.e. whether genuinely confidential material in the real
  snapshot is marked confidential. That is J4's open half and it remains
  open. It is Tom's, not the builder's: closing it means adding genuine
  confidential records, not synthesising them.
- **Email delivery.** `GMAIL_APP_PASSWORD` is unset here and I did not set
  it. No alert has ever been delivered, on fifteen passes. The boot line
  says so honestly: *"failed-unlock alert CANNOT be sent:
  GMAIL_APP_PASSWORD is unset. The alarm is inert in this environment."*
- **Railway, staging and production.** Unreachable from this sandbox and
  out of scope. Everything above is a local server against a throwaway
  database.
- **The unlock attempt limiter's durability.** It remains in memory, so
  the five-per-fifteen-minutes budget still resets on a container
  restart. Known and recorded since G6; unchanged.
- **Concurrency at production scale.** Twelve processes on one machine is
  not a production burst. The property is structural (an advisory lock
  plus a partial unique index, and I showed the index alone carries it),
  which is the right kind of argument, but I measured only what I could
  measure.

## 9. What remains Tom's decision, not the builder's

1. **Whether Ruth speaks in the first person about acts the system
   performs.** V2 is a wording question with a governance edge. The
   builder should not settle it silently either way; the chain's rule is
   that a retained inconsistency must be recorded as a decision.
2. **J4's open half** (above): seeding enough genuine confidential
   material for the tagging, not merely the filter, to be tested.
3. **`lib/scott/clearance.js`'s `personaDomains` fail-open**, carried
   forward from the fourteenth pass. It is unreachable today, it is live
   in production, and changing production Scott behaviour on the way to a
   workspace release is exactly the scope drift these reviews exist to
   catch. I agree with leaving it alone and with keeping it on Tom's
   list.
4. **Whether AMBER on an honesty defect blocks the release.** V1 opens
   nothing. If Tom judges that a wrong sentence about evidence is
   tolerable in a staging-only, flag-gated, AI-disabled area while it is
   corrected, that is his call to make explicitly. It is not the
   builder's to make by declaring the finding closed.

## 10. Verdict, restated

**AMBER.** V1 MEDIUM, V2 LOW, V3 LOW, V4 LOW, V5 LOW.

The security surface is in good order and I re-established it rather than
inheriting it: three gates, permission legs, concurrency bound, Scott
firewall, all with controls. The U cycle fixed four of its five findings
properly and the two most important of them provably.

It is AMBER because the fix for the previous MEDIUM introduced the next
one, in the same function, on the same default path, in the same shape
the chain has now recorded fifteen times — and because the test written
to prevent exactly that was scoped to the string that was wrong rather
than to the property it is named for.

The builder does not award itself the upgrade. A sixteenth pass, or a
narrower confirmatory pass over V1 to V3 with the tests watched red
first, is what moves this to PASS.

---

## Author's erratum, added 31 August 2026, after the report was delivered

**This section is additive. No finding, no severity and no verdict
changes. The body above is left exactly as it was reviewed and
delivered, so it can still be compared byte for byte with the copy the
builder carried onto the candidate branch.**

**The error.** Throughout the body I refer to the crafted-lane-id /
`Object.prototype` defect as **T2**, and to the inert `gapRaised` defect
as **T3**. That is the wrong way round. The thirteenth review, which is
the source, numbers them:

```
### T2. `gapRaised` is passed to Ruth on every turn and provably changes nothing she says.
### T3. A crafted lane id makes Ruth name a colleague who does not exist, and 500s the ask endpoint.
```

So every "T2" in this report that means the prototype defect should read
**T3**, and the single reference to "T3" meaning the inert gap should read
**T2**. The affected passages are section 4.1 ("T2 holds at the
receptionist"), section 4.10 ("The T2 prototype class, hunted again", and
the quotation of the fourteenth pass), finding V5 (heading and body), and
section 6.

**Whose error it is.** Mine. The builder's T remediation reversed the two
numbers, the code comments follow the remediation, and I took the
labelling from them rather than from the thirteenth review. That is the
same failure I graded elsewhere in this report: inheriting an assertion
instead of checking it against its source. The builder found and
disclosed the reversal independently while assembling its completion
report, and correctly declined to edit a reviewed document; correcting it
is the author's job, so it is done here.

**What is unaffected.** Everything substantive. Every probe in this
report was run against the mechanics, not against a finding number: the
272 direct calls and eight crafted forced lane ids that establish the
prototype behaviour, the gap-on-both-paths checks that establish the
`gapRaised` behaviour, and the codebase-wide hunt in section 4.10. The
conclusions of V1 to V5, the evidence for them, and the AMBER verdict
stand exactly as written.

**Note on copies.** The candidate branch carries the as-delivered text
without this erratum, because a reviewed document is not the builder's to
edit and I did not push to their branch. This branch,
`governance/workspace-v01-review-15`, carries the as-delivered text plus
this note. The two differ by this section and nothing else.
