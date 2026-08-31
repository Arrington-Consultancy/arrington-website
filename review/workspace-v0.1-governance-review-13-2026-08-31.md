# Arrington AI Workspace v0.1: Independent Governance & Assurance Review (thirteenth pass)

Date: 31 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, frozen head
`93d6afad94dfb5ef848ac704771f3f1820265f19`.
Baselines: the twelve previous reviews (F1-F10, G1-G9, H1-H7, J1-J4, K1-K5, L1-L5, M1-M5,
N1-N5, P1-P5, Q1-Q4, R1-R2, S1-S2) and the builder's responses. The twelfth pass
(`review/workspace-v0.1-governance-review-12-2026-08-31.md`) returned **PASS** against head
`d745a55`, the first green verdict in twelve.

```
$ git rev-parse HEAD
93d6afad94dfb5ef848ac704771f3f1820265f19
$ git status --porcelain
(empty)
```

The tree was clean and at the frozen head at the first command of this review and at the last.
Every experiment needing a code change ran in a `git worktree` under `/tmp`, since removed. Every
write went to four throwaway databases (`ws_r13`, `r13s1`, `r13s2`, `r13s3`), created from nothing
and dropped at the end. This report is committed on branch `governance/workspace-v01-review-13`
and nothing else in the repository is touched.

## 1. The bounded question

This is a confirmatory pass over three changes made since the twelfth review's PASS, plus enough
re-verification to be sure nothing else moved:

1. **S1/S2 corrected** (`26684d3`) — the gated-suite source scan was rewritten.
2. **Ruth, a receptionist, was added to the workspace** (`lib/workspace/receptionist.js`, carried
   onto the candidate at `93d6afa`) on Tom's explicit instruction: *"Make Ruth in Arrington as
   well."*
3. The chat screen, the nav label and `CLAUDE.md` changed with her.

The diff since `d745a55` is small and I confirmed its boundaries by hash rather than by reading:

```
CLAUDE.md                                +28 -2      lib/workspace/receptionist.js   NEW (96)
routes/workspace.js                      +12 -1      test/workspace/receptionist.test.js NEW (77)
test/gatedSuites.test.js                 +62 -29     views/workspace/chat.ejs        +15 -2
views/workspace/partials/styles.ejs      +12         views/workspace/partials/shell-top.ejs +1 -1
views/workspace/today.ejs                +1 -1       review/ (two documents)
```

**Every permission-relevant module is byte-identical across the three commits**, which I verified
by SHA rather than by inspection:

```
IDENTICAL  lib/workspace/lanes.js        IDENTICAL  lib/workspace/clearance.js
IDENTICAL  lib/workspace/access.js       IDENTICAL  lib/workspace/unlock.js
IDENTICAL  lib/workspace/unlockAlert.js  IDENTICAL  lib/workspace/orchestrator.js
IDENTICAL  lib/workspace/repo.js         IDENTICAL  lib/crm/emailHash.js
IDENTICAL  lib/crm/erasure.js            IDENTICAL  lib/render404.js
IDENTICAL  server.js                     IDENTICAL  db/seed.js
IDENTICAL  db/schema.sql                 IDENTICAL  scripts/runTests.js
```

Nothing more. This review does not authorise a merge, a deploy, an environment variable change, a
spend, or the connection of any external account, and it did none of those things. The paid
live-AI suites were **not** run.

## 2. VERDICT: AMBER

**AMBER, on one MEDIUM finding and five LOW.**

I want to be exact about what this AMBER is and is not, because my predecessor passed this
candidate and I am not reversing him.

**The security surface is clean, and I re-established it by my own probes, not by reading.** The
three gates hold under a full CMS-admin takeover of Tom's account. Anonymous route-existence
disclosure is closed in both flag states across 3,780 paired requests. The alarm fired exactly
once out of a real five-guess burst and typed itself honestly as undelivered. The seed migration
is correct and idempotent on three database shapes. Ruth leaks nothing: across twenty
clearance-by-lane combinations with real mixed-sensitivity records seeded, **no withheld canary
reached her note or the model prompt**, and the permission matrix is byte-identical with and
without her. Nothing my predecessor closed has reopened.

**The MEDIUM is not a security finding. It is a governance-record finding, and it is about the
one question I was asked to judge for myself.** The builder's case that Ruth does not breach the
completion mandate rests on the lane register: a lane is a scoped reading context, Ruth has no
source classes, no ceiling and no clearance, the register is still nine, a test proves it. **All
of that is true and I verified all of it.** But it answers only half of the controlled statement.
The other half is still in the reviewed code, unamended, in three places including `CLAUDE.md`
twenty lines below Ruth's own section:

> `lib/workspace/lanes.js:10-12` — *"The router that consumes these lanes is faceless plumbing;
> it never speaks as a person and never appears in output as a tenth identity."*

Ruth is the router speaking as a person and appearing in output as a named identity. That
sentence is about **output**, not about access, so no amount of "she can read nothing" reaches it.
Tom instructed Ruth, so she is not mine to veto and I do not propose removing her. What I will not
do is record that the mandate is satisfied when the repository contains three unamended sentences
saying the opposite, and an assurance case that never quotes them. That reconciliation is a
governed act and it belongs to Tom, not to the builder and not to me.

The second limb makes it concrete rather than semantic: for a question that matches no lane, Ruth
says **"I answered that one myself; it did not need anybody in particular"** — and the response
sets `laneName: null`, so hers is the *only* name the owner sees attached to that answer. She did
not answer it and by construction cannot. That is a named component claiming work it did not do,
in a project whose own standing rule (finding J3) is that no code path may claim something that
did not happen.

**Why that is a MEDIUM and not a LOW.** It changes nothing an attacker can do, and I say so
plainly. But it is an unreconciled contradiction with a standing control statement, in the newest
code, argued past rather than addressed — and it is the exact class of defect twelve reviews were
commissioned to catch. Grading it LOW would be treating "no security consequence" as the only
axis, when the thing this process exists to protect is the reliability of what the record says.

**The five LOWs**: `gapRaised` is passed to Ruth and provably changes nothing; a crafted lane id
makes her invent a colleague called "Object" and 500s the ask endpoint, defeating the test named
*"she cannot invent a colleague"*; S2 is only half-corrected and the surviving sentence now sits
in two files; the rewritten gated-suite scan fixes S1's two shapes but is walked past by an alias
read and has acquired a fresh false positive on the one gate shape it says it excludes; and the
receptionist module's *"it cannot leak one however it is called"* is stronger than its guard.

**What would have made me pass it**: the same six tests my predecessor named, all of which I ran
and all of which are clean, **plus** either an amended control statement or an assurance case that
addressed the sentence it omits. **What would have made me stop it**: a record reaching Ruth's
output, a gate opening, a permission difference attributable to her, or any Scott content
crossing. None of those happened, and I looked for each specifically.

## 3. Independence, and its limits

I am a separate session from the builder. I wrote none of this code and accepted no claim I could
test myself. The limits recorded by every previous pass stand:

1. **I am a Claude agent, commissioned by the builder's own session, reviewing the builder's
   work.** Structural, and uncured by my finding something.
2. **No network access** to Railway or the live site. Everything about production, staging,
   variables and the paid live-AI runs is reported to me, not verified by me.
3. **No Google Drive access.** The completion mandate, the controlled statements and Tom's
   instruction *"Make Ruth in Arrington as well"* reach me only as transcribed by the party they
   constrain. **This matters more than usual this pass**: my MEDIUM turns on the wording of a
   controlled statement I can only read as quoted in the code.
4. **No real browser.** I drove the application over HTTP and raw sockets and inspected status
   lines, full header sets, bodies and cookies. I did not render a page.
5. **No `WORKSPACE_SNAPSHOT_KEY`**, so the real brain was unseeded. **Unlike my predecessor I did
   not leave the content surface untested**: I seeded six of my own records at three sensitivities
   across five source classes and probed the filter with canaries (section 4.4). That tests the
   FILTER. It does not test the TAGGING of the real thirty records, which remains the open half of
   J4 and is still Tom's.

## 4. What I did, with observed results

Environment: local Postgres 16; throwaway databases `ws_r13`, `r13s1`, `r13s2`, `r13s3`; servers
on 3401 (workspace armed) and 3402 (**no workspace variables at all** — production's configuration
if this branch merges); a worktree at `/tmp/r13/wt`, removed.

### 4.1 The regression suite

```
$ env -u NAT_PASSWORD -u TOM_PASSWORD DATABASE_URL=... SESSION_SECRET=... npm test
# tests 545   # suites 53   # pass 543   # fail 0   # skipped 2      EXIT=0

  5 SUITE(S) DID NOT RUN. The counts above do not cover them.
  [SKIP] adversarial: real session and API path
  [SKIP] LIVE AI pressure suite (spends money)
  [SKIP] two-pass seed
  [SKIP] adversarial workspace checks
  [SKIP] workspace live AI pressure
```

Green. 545/543 against my predecessor's 539/537 — the difference is exactly the six new
receptionist tests. The `[SKIP]` block names all five gated suites correctly, and I confirmed it
against real runs of two of them.

### 4.2 The adversarial suites, run by hand against a running instance

```
workspace, freshly restarted armed server:  ok 1..9   # tests 10  # pass 10  # fail 0  # skipped 0
Scott, same server:                         ok 1..14  # tests 18  # pass 18  # fail 0  # skipped 0
```

Both reproduce the builder's and my predecessor's figures. Nothing NOT EXECUTABLE.

### 4.3 Ruth: can she read anything, and does she change anything?

**Her whole import graph is one line.** `lib/workspace/receptionist.js` requires
`./lanes` and nothing else — no `repo`, no `db`, no `clearance`, no filesystem, no network. She is
handed no database handle by any caller. She cannot read a record because she has no way to reach
one.

**The lane register is untouched.**

```
LANES.length = 9
any lane named or ided ruth/reception? false
RUTH object keys: line,name,role
RUTH declares sourceClasses / sensitivityCeiling / clearance / domains? []   (none of them)
directory() entry keys: ["id","kind","name"]      (no source classes, no ceilings)
```

**She changes no permission behaviour, which I measured rather than inferred.** I printed the full
visibility matrix — every clearance against every lane plus the no-lane context, followed by ten
routing decisions — from the pre-Ruth checkout (`d745a55`) and from the frozen head, against the
same database, and diffed them:

```
diff pre-Ruth vs with-Ruth:  NO DIFFERENCE - identical across 32 matrix lines
```

### 4.4 The leak probe, with real mixed-sensitivity records

My predecessor tested the access surface against an empty brain. I seeded six records carrying
distinct canaries — two `standard`, two `commercial`, two `confidential`, spread across five
source classes — then stubbed the model to **echo every canary it could see and raise a gap**, so
a leak through Ruth would be maximally likely. I then built her note exactly as
`routes/workspace.js` builds it and searched it, and the prompt, for canaries from records the
caller was not shown:

```
clearance      lane                    records shown                     Ruth's note
owner_admin    (no lane)               R-STD-AUTH,R-COMM-STRAT           no withheld canary
owner_admin    google_ads              +R-STD-TECH                       no withheld canary
owner_admin    governance_assurance    all six                           no withheld canary
ws_restricted  (no lane)               R-STD-AUTH                        no withheld canary
ws_restricted  google_ads              R-STD-AUTH,R-STD-TECH             no withheld canary
ws_restricted  opportunity_builder     R-STD-AUTH                        no withheld canary

RESULT: no withheld canary reached Ruth or the PROMPT in any case
```

Two things worth stating from that table. First, the filtering happens before the prompt exists:
no withheld canary was in the model input either, so there is nothing to redact afterwards.
Second, `recordCount` — the only number Ruth speaks — is the **post-filter** count, identical to
the `provenance` list the interface already prints beside it, so it discloses nothing the reader
was not already given.

I also fetched the chat page as an unlocked owner and searched it: **zero canaries**, and Ruth's
card renders only her name, role, one line, and "She routes to 9 specialists."

### 4.5 Ruth, attacked directly

Every vector the commission named, against `handoffNote`:

```
extra field carrying a secret              -> THROWS  "refusing unpermitted field(s) answer"
extra field with a unicode-lookalike key   -> THROWS  "refusing unpermitted field(s) laneİd"
extra field named like a permitted one     -> THROWS  "refusing unpermitted field(s) recordCounts"
symbol key / non-enumerable own property   -> not read; ordinary note returned
laneId is the secret                       -> not echoed ("I answered that one myself...")
laneId 100,000 characters                  -> not echoed
laneId containing markup                   -> not echoed
null / string / array / Object.create(null)-> THROWS or refuses
a getter that throws                       -> propagates, nothing rendered
CRAFTED LANE ID from Object.prototype      -> see T3
recordCount set to a string / toString bomb-> INTERPOLATED VERBATIM         see T6
Object.prototype polluted, empty opts      -> guard bypassed, value rendered see T6
```

The field guard does its job for the thing it was built for: a new key carrying content is refused
loudly. The two that get through are documented as T3 and T6, and neither is reachable from the
application today — I looked for a prototype-pollution sink in the request path and found none,
and the only caller passes `provenanceKeys.length`, always a number.

### 4.6 Scott, both directions

```
lib/scott/**  requiring workspace : none        lib/workspace/** requiring scott : none
routes/workspace.js requiring scott: none       views/workspace/** mentioning scott: none
```

The only occurrences of "Scott" in `receptionist.js` are five comment lines explaining the
separation. Prose overlap between Arrington's Ruth and Scott's Ruth Bailey, words over four
characters: **one word, "receptionist"**. No fictional content crosses.

**One thing does cross, and it is Tom's own instruction, so I record it rather than fault it.**
Scott's fictional receptionist is *Ruth Bailey*; the real workspace's is *Ruth*. The firewall test
asserts the module contains none of `Bailey`, `Mercer`, `Fletcher`, `Armchair`, `Knitting` — a
list that necessarily excludes the one token that does cross. Under "reuse principles, not
fictional content", a shared first name is defensible as principle rather than content, and Tom
chose it. It is worth him knowing that the demonstration he shows prospective clients and the real
internal system he runs his business on now have a receptionist of the same name, because that is
a presentational decision with consequences he may not have priced.

### 4.7 R1 / Q1 / G1 / F2: anonymous route-existence disclosure

Raw sockets, comparing every real workspace route against a fabricated sibling **under the
identical transform**, on status, the full normalised header set (G1) and body length:

```
FLAG OFF, anonymous: 3780/3780 indistinguishable from a fabricated sibling
FLAG ON,  anonymous: 3780/3780
(20 real routes x 9 methods x 21 spellings, each paired with a control)
```

Methods `GET HEAD POST OPTIONS PUT PATCH DELETE TRACE FROB`; spellings including full upper case,
`/API/`, `/WorkSpace/`, `ſ` for `s`, percent-encoded first characters, trailing dot, `%20`,
matrix parameters, `/./`, `/x/..` traversal, doubled and leading slashes.

*(My first attempt reported 16 differences. They were an artefact of my own control: the
fabricated path did not contain the characters the transform rewrote, so real and control were not
receiving the same transform. Corrected to a prefix-preserving control, the sweep is clean. I
record the false start because a reviewer who reports only the clean run is asking to be trusted.)*

R1's headline, on the server with no workspace variables set at all:

```
OPTIONS /api/workspace/ask -> 404   /API/workspace/ask -> 404   /API/WORKSPACE/ASK -> 404
        /Api/Workspace/Ask -> 404   /api/WorkSpace/ask -> 404   /totally/missing   -> 404
```

Non-workspace routes are unaffected, so the guard is not over-broad:

```
/ 200|OPTIONS 404    /login 200|OPTIONS 200   /api/leads 404|OPTIONS 200   /scott/login 200|OPTIONS 200
/health 200|OPTIONS 404   /robots.txt 200|OPTIONS 404   /sitemap.xml 200|OPTIONS 404
```

**Ruth's edit did not disturb the guard ordering.** `setNoindex` is still called only on the
success path inside `requireWorkspacePageAccess`; the `receptionist` value is a view local added
inside the already-guarded handler. I checked the registration rather than assuming it.

**Ruth does not appear on any public surface.** `/`, `/sitemap.xml`, `/robots.txt` and two CMS
pages, on both servers: zero occurrences of `ruth`, `reception`, `workspace` or any canary.

### 4.8 F1: the three gates, under a full CMS-admin takeover

```
1. nat logs in: 302                SANITY nat authenticated (/api/admin/pages): 200
2. nat resets tom's password (PUT /api/admin/user/2/password): 200 {"success":true}
3. attacker logs in AS TOM: 302    SANITY seized session authenticates: 200
4. /workspace /workspace/chat /workspace/brain /workspace/contacts /workspace/activity
                                   -> 302 -> /workspace/unlock  (all five)
5. POST ask / contacts/sync / contacts/1/erase
                                   -> 404, len 4282, "unlock" never mentioned
6. "password" "letmein" "arrington" "workspace" -> 401 each; "tom", "sixth" -> 429
WORKSPACE OPENED BY THE ATTACKER: no (status 302)
```

**Positive control**, without which the above proves only that the gate is broken shut: earlier in
the session, as Tom with the correct passphrase, `POST /api/workspace/unlock -> 200 {"ok":true}`
and `/workspace/chat -> 200` with `X-Robots-Tag: noindex, nofollow`. I record honestly that the
control and the attack were run in separate scripts: by the end of the attack I had spent the
unlock limiter's budget, and the retry inside the same run returned 429 rather than 200.

### 4.9 The alarm, out of that real burst

Straight from the database afterwards:

```
173 workspace_unlock_failed        tom     tom   passphrase did not match
172 workspace_unlock_alert_failed  system  tom   Security notice FAILED to send after 3 failed
                                                 unlock attempt(s) against "tom": email is not
                                                 configured in this environment
171 workspace_unlock_failed        tom     tom
170 workspace_unlock_failed        tom     tom
169 workspace_unlock_failed        tom     tom
```

Threshold at three (below the limiter's five); **exactly one** alert row for the burst; the
undelivered notice correctly typed `alert_failed` rather than `alert_sent` (H2); `subject`
populated exactly and `actor='system'` on the alert row (J2); the reason states plainly that
nothing was sent (J3, M2, N1). The boot line declared the alarm inert before any of this, naming
`GMAIL_APP_PASSWORD` (H3).

### 4.10 The seed migration, three shapes, twice each

```
SHAPE 1 fresh                          pass1 exit=0  pending=0 abandoned=0 idx=1 uniq=1 subject=1
                                       pass2 exit=0  pending=0 abandoned=0 idx=1 uniq=1 subject=1
SHAPE 2 polluted: 3 'tom', 2 'nat',    before: pending=7 abandoned=0 uniq=0
        2 legacy subject=''            pass1 exit=0  pending=3 abandoned=4 uniq=1
                                       pass2 exit=0  pending=3 abandoned=4 uniq=1
                                       survivors: tom=1, nat=1, ''=1
SHAPE 3 pre-J2: no subject column,     before: subject column present? 0
        no index, 3 legacy claims      pass1 exit=0  pending=1 abandoned=2 idx=1 uniq=1 subject=1
                                       pass2 exit=0  pending=1 abandoned=2 idx=1 uniq=1 subject=1
```

Correct and idempotent on all three, reproducing my predecessor's figures. This matters because
the seed is the start command: a failed `CREATE UNIQUE INDEX` crashloops the app on boot, which is
the Scott release incident's exact failure mode.

*(My first two attempts here also failed, and both were my error: I polluted with the wrong event
type name, and then failed to drop the unique index before polluting. The migration was right both
times. Recorded for the same reason as 4.7.)*

### 4.11 S1/S2: the rewritten gated-suite scan, probed in both directions

I planted seven files in a worktree and ran both halves against them.

```
probe shape                                            source scan     runner half
a. if (process.env.X) { test(...) }        (S1 #1)     CAUGHT          blind
b. early return on process.env in a body    (S1 #2)    CAUGHT          blind
c. a file registering nothing at all                   CAUGHT          blind
d. const env = process.env; if (env.X) {test(...)}     NOT CAUGHT      blind      <- T5
e. if (res.STATUS_CODE) return  (S1 false positive)    correctly clean  n/a
f. an ordinary plain suite                             correctly clean  n/a
g. if (!process.env.DATABASE_URL) return t.skip(...)   FALSE POSITIVE   n/a       <- T5
```

**S1's substance is genuinely fixed.** Both shapes my predecessor planted and named are now
caught, and the `res.STATUS_CODE` false positive is gone. On the real tree the scan is green
(3/3), and no real suite uses any of the invisible shapes.

The alias file is the shape that escapes both halves, and I confirmed the runner half is blind to
it rather than assuming:

```
$ node scripts/runTests.js test/probe13/d_alias.test.js
# tests 1  # pass 1  # skipped 0
  Every suite ran. Nothing was skipped.          <- over a file that registered no test at all
```

**In fairness to the builder I checked whether my predecessor's recommended remedy was even
available.** It asked for the "registers nothing" question to be put to the runner as
`# tests 0` for the file. Node reports each file as its own subtest (`ok 3 -
test/probe13/d_alias.test.js`) and counts it in `# tests`, so a never-registering file is
indistinguishable in the aggregate TAP stream. The recommendation is not directly implementable,
the builder's source-side alternative was a reasonable choice, and I do not fault the choice. T5
is about the gap between the clause's stated principle and its regex, not about the strategy.

### 4.12 The rest, re-established by probe

```
H1  alertRecipient.length = 0; body references no db/query/contact.email  -> cannot be retargeted
H4  ACTIVITY_SENSITIVITY: one constant (routes/workspace.js:51), two call sites (170, 317)
H7  buildAlert throws naming the offending keys on an unpermitted field
K3  decideAlert: exactly one call site in the deployed module
L1  dedicatedConnectionSource(db/pool) = 'wrapper'; a shorthand-only handle returns null
G5  routes/auth.js:117 calls req.session.regenerate() at login
F4/G9 hashEmail THROWS without SESSION_SECRET; digest is key-dependent
      keyalpha123 -> 5ec2fea2b00db22f      keybravo456 -> 91bc00c3aea106eb
```

## 5. Findings

### T1. Ruth speaks as a person in the router's output, and claims answers she did not write, while three unamended control statements in the reviewed code say the router does neither. Severity: MEDIUM

**What is claimed.** `CLAUDE.md`, in the section added with her: *"She is not a tenth identity, and
the distinction is the whole point. A lane is a scoped READING CONTEXT ... Ruth has neither, plus
no clearance of her own ... The lane register is untouched at nine, and a test asserts she never
appears in it."* The module header makes the same argument.

**What I did.** Verified the claim (it is true: section 4.3), then went looking for the parts of
the controlled statement the claim does not address.

**What happened.** Three statements in the reviewed tree contradict the shipped behaviour, none
amended by the Ruth commits (`git diff d745a55..93d6afa -- lib/workspace/lanes.js
lib/workspace/orchestrator.js` is empty):

- `lib/workspace/lanes.js:10-12` — *"The router that consumes these lanes is faceless plumbing; it
  never speaks as a person and **never appears in output as a tenth identity**."*
- `lib/workspace/orchestrator.js:8-10` — *"the router below is faceless plumbing ... it is not a
  persona, **never speaks as a person**, and no tenth worker identity exists."*
- `CLAUDE.md:1038-1040`, **twenty lines below Ruth's own new section** — *"The router is faceless
  plumbing, never a tenth identity, per the completion mandate."*

`POST /api/workspace/ask` now returns a `receptionist` string written in the first person, and the
chat screen pushes it to the top of the answer block, above the lane name. The router speaks as a
person and appears in output as a named identity. Both sentences are about **output**, so the
builder's answer — which is entirely about **access** — does not reach them, and never quotes
them.

**Second limb, and it is the concrete one.** For a question matching no lane, the reply is:

```
laneId=null, answered=true  ->  "I answered that one myself; it did not need anybody in particular."
```

and the same response carries `laneName: null`, so the interface renders Ruth's claim and no other
attribution. She did not answer it: the model answered from the general authority context, and by
construction she reads nothing and generates nothing. A named component claiming work it did not
do is the thing finding J3 established a rule against — *"[name] has been emailed" is authored in
exactly one place, from the stored status ... there is no code path that can claim a send that did
not happen*. This is a code path that claims an answer that was not hers.

**Why MEDIUM and not LOW.** It opens nothing, leaks nothing and defeats no gate; I say that
plainly. It is graded MEDIUM because it is an unreconciled contradiction with a standing control
statement in the newest code, because the assurance case presented for it answers a different
question from the one the statement asks, and because the whole point of thirteen passes is that
the record must be reliable. It is also the fastest finding in this series to close.

**Why it is not a STOP and not mine to veto.** Tom instructed Ruth in terms. A receptionist who
can read nothing is not the super-worker the mandate was written against, and I confirmed that at
every level I can reach. This is a bookkeeping failure around an owner-approved change, not an
unauthorised expansion.

**Remedy.** Two things, both small, and the first is Tom's not the builder's.
1. Amend the controlled statement through the governed route so it says what is now true: the
   router remains faceless plumbing with no clearance and no reading context, **and** a named
   receptionist presents its routing to the owner. Then bring the three in-repo sentences into
   line with it. Do not silently edit the comments and leave the Drive statement behind.
2. Change *"I answered that one myself"* to something true of a no-lane turn — it did not go to a
   specialist, and Ruth did not write it. Something in the shape of *"That one did not need a
   specialist, so it was answered from the core records."*

### T2. `gapRaised` is passed to Ruth on every turn and provably changes nothing she says. Severity: LOW

**What is claimed.** `CLAUDE.md`: *"She is handed a lane id and three booleans."* `NOTE_FIELDS` is
pinned by a test as `['laneId','answered','recordCount','gapRaised']`, and the module's branch on
`gapRaised` reads *"I have written it down as a gap rather than guess."*

**What I did.** Enumerated every branch, then held everything else constant and flipped
`gapRaised`.

**What happened.** Identical output in all three reachable states:

```
lane, answered, 3 records   gap=false / gap=true  -> identical: true
lane, answered, 0 records   gap=false / gap=true  -> identical: true
no lane, answered           gap=false / gap=true  -> identical: true
```

Both branches that consult `gapRaised` require `answered === false`. The only caller passes
`answered: !!result.answer`, and `parseReply` rejects any model reply whose `answer` is missing or
blank (`if (typeof parsed.answer !== 'string' || !parsed.answer.trim()) return { error: 'missing
answer' }`), after which the route returns 503 before Ruth is called. **`answered` is therefore
always true, and three of her six sentences are unreachable** — including both of the honest ones:
*"there is nothing on file that answers it"* and *"I have written it down as a gap rather than
guess."*

**Materiality, stated so this is not read as bigger than it is.** The owner is still told about
the gap: the chat script pushes `'Gap raised: ' + data.gap.gap_type` as a separate line. Nothing
is hidden. What is wrong is that a declared, test-pinned contract field does nothing, and a reader
of the module — or of `CLAUDE.md` — will believe Ruth mentions gaps when she never can.

**Remedy.** Either make the reachable branches use it (a gap is worth a clause in her note, and
that is evidently what it was written for), or drop `gapRaised` from `NOTE_FIELDS` and the call
site and delete the unreachable branches. Not both halves half-done.

### T3. A crafted lane id makes Ruth name a colleague who does not exist, and 500s the ask endpoint. The test named *"she cannot invent a colleague"* does not catch it. Severity: LOW

**What is claimed.** `test/workspace/receptionist.test.js`: `test('she cannot invent a colleague')`,
asserting an unknown lane id is not echoed back as if it were a person. It tries exactly one
value, `'not-a-real-lane'`.

**What I did.** `LANES_BY_ID` is built with `Object.fromEntries`, so it carries `Object.prototype`,
and `laneById` is `LANES_BY_ID[id] || null` — an unguarded lookup. I tried prototype keys.

```
laneById('constructor')    -> the Object function,  .name = "Object"
laneById('toString')       -> function,             .name = "toString"
laneById('__proto__')      -> Object.prototype,      .name = undefined
laneById('not-a-real-lane')-> null                                     <- the only value tested

handoffNote({laneId:'constructor', answered:true, recordCount:2})
  -> "I took that to Object, who answered from 2 records. The provenance is listed with the answer."
handoffNote({laneId:'__proto__',  answered:true, recordCount:2})
  -> "I took that to undefined, who answered from 2 records. ..."
```

`routes/workspace.js:429` admits such a value: `typeof req.body.laneId === 'string' &&
laneById(req.body.laneId)` is satisfied by `'constructor'`. Driven through the real endpoint as an
unlocked owner:

```
ask laneId="google_ads"   -> 503  (model unavailable: the stubbed key, i.e. the route was reached)
ask laneId="constructor"  -> 500  Cannot read properties of undefined (reading 'includes')
ask laneId="toString"     -> 500  ...
ask laneId="__proto__"    -> 500  ...
ask laneId="not-a-lane"   -> 503  (correctly ignored, falls through to keyword routing)
```

**It fails closed, and I checked that rather than assuming it.** The permission legs do not widen:
`laneCanReadSourceClass` throws (`Object.sourceClasses` is undefined), `laneCanReadSensitivity`
returns `false`, and `filterRecordsForLane` throws before any record is selected. **No record is
disclosed and no lane is widened.** The raw error text in the body is a development-mode artefact;
`server.js:1121` returns `'Internal server error'` when production is detected.

**So what is actually wrong**: an unhandled `TypeError` on an authenticated endpoint driven by
request input, and a test that asserts a property its single probe value cannot establish. Where
the caller happens to have no visible records the filter never runs, no throw occurs, and Ruth
would name "Object" to the owner as the colleague who answered.

**Reachability, stated honestly.** Only a fully-cleared, unlocked owner can reach this, and that
person can already see everything. It is a robustness and honesty defect, not a disclosure one.

**Remedy.** `return Object.hasOwn(LANES_BY_ID, id) ? LANES_BY_ID[id] : null;` — which also closes
the same unguarded-lookup class my predecessor flagged on `HUMAN_CLEARANCE[username]`. Then add
`'constructor'` and `'__proto__'` to the *"she cannot invent a colleague"* case, so the test
establishes the property it is named for.

### T4. S2 is half-corrected. The sentence my predecessor asked to be deleted survives in the file's header, and a third instance sits in `scripts/runTests.js`. Severity: LOW

**What is claimed.** Commit `26684d3`, *"Correct both findings from the twelfth governance
review."* The rewritten inner comment says: *"this comment claimed twice that it had (finding
S2)"* — so both instances were known.

**What I did.** Read the file at the frozen head and grepped the tree.

**What happened.** The second instance (inside `test('every declared gated suite still exists')`)
was properly rewritten. The first was not touched — the diff for this file begins at line 48, and
the header is lines 1-19:

```js
// The runtime half is scripts/runTests.js, which `npm test` runs: it
// reads the `# SKIP` directives the test runner actually emits, so a
// skip is observed rather than inferred and there is no source shape to
// evade.
//
// The source half is below. Governance finding R2: replacing the source
// scan with the runner LOST coverage, because two ordinary shapes never
// reach the runner's output at all ...
```

Those two paragraphs are four lines apart and cannot both be true. S1 established that the runner
**is** evaded by two ordinary source shapes; I re-established it in section 4.11.

And a third instance, in a file S2 did not name, saying the same false thing about the same check:

```js
// scripts/runTests.js:12-14
// So this stops guessing from source and reads what the test runner
// actually did. A skip appears in the TAP output as a `# SKIP` directive
// whatever the source looks like, so there is no shape to evade.
```

**Why it is a finding rather than a nit.** This is the file whose entire purpose is to stop a
reader believing a check exists when it does not, and it is the third consecutive cycle in which
its own documentation asserts a guarantee it does not have. A future session reading the header
will stop there.

**Remedy.** Delete the clause in both files. While there, `DB_ONLY_GATE` (line 40) is now
completely unreferenced — see T5, where its removal caused a regression.

### T5. The rewritten scan is walked past by an alias read, and has acquired a fresh false positive on the one gate shape the file says it deliberately excludes. Severity: LOW

**What is claimed.** The new comment: *"Not an attempt to enumerate every way of writing a gate -
five reviews proved that unwinnable - **but it must at least catch the shapes the runner is blind
to**, and finding S1 showed it did not."* And the R remediation's correction block: *"Both are
fixed, and this time each shape was planted and watched, **in both directions**, rather than
asserted."*

**What I did.** Planted seven files and ran both halves (section 4.11).

**(a) An alias read escapes both halves.** The scan's first clause is described as *"Reading
configuration at all ... A suite cannot decide whether to register on configuration without
READING configuration, so this is the check that catches it."* The principle is correct; the
implementation is `/process\.env\.([A-Z0-9_]+)/g` plus a bracket form and a destructure form. It
does not recognise the alias:

```js
const test = require('node:test');
const env = process.env;
if (env.SOME_GATE_R13) { test('gated body via alias', () => {}); }
```

```
source scan: not listed
runner half: "# tests 1  # pass 1  # skipped 0 / Every suite ran. Nothing was skipped."
```

This is S1's shape 1 with one line changed, it reaches neither half, and **the alias is a shape
this codebase has already met** — `scripts/runTests.js:8` lists *"a renamed destructure, an
alias"* among the gates that defeated the old scan. A lower-case env name
(`process.env.someGate`) escapes the same way.

**(b) A `DATABASE_URL`-only gate is now falsely reported.** The file states at lines 38-40:
*"Suites gated only on DATABASE_URL are deliberately NOT listed."* `AMBIENT_ENV` implements that
for the first clause. The third clause no longer honours it, because the S1 fix dropped
`&& !DB_ONLY_GATE.test(src)` and left `DB_ONLY_GATE` as dead code:

```js
test('db gated', (t) => { if (!process.env.DATABASE_URL) return t.skip('set DATABASE_URL'); });
-> reported as "probe13/g_dburl.test.js (returns early on configuration)"
```

That is the exact class S1 complained about — the scan failing a suite that is not the problem —
reintroduced by S1's own fix, and it is masked today only because the sole real file written that
way (`test/scott/adversarialApi.test.js`) happens to be a declared gated suite. Adding any
undeclared database-gated suite in that ordinary form turns `npm test` red.

**Materiality.** Not a security control, and nothing is mis-reported today: I scanned the tree and
all five gated suites are named correctly. This is graded LOW for the same reason the same guard
has been graded LOW in seven consecutive reviews.

**Remedy.** For (b), restore the `DB_ONLY_GATE` suppression on the third clause or delete the
identifier and put `DATABASE_URL` handling in one place. For (a), do not start another arms race:
either widen clause 1 to `process\.env` anywhere in the file (blunt, but the file is a backstop and
a false positive here costs one line in `GATED`), or state in the comment that the scan recognises
literal `process.env.NAME` reads only, so the next reader knows its edge. What should not stand is
the current sentence, which claims a bar the code does not meet.

### T6. *"It is given no records, so it cannot leak one however it is called"* is stronger than the guard delivers. Severity: LOW

**What is claimed.** `lib/workspace/receptionist.js`, above `handoffNote`: *"Takes a lane ID and
three facts about the turn, and returns words. It is given no records, so it cannot leak one
**however it is called**."* And `CLAUDE.md`: *"She is handed a lane id and **three booleans**,
never a record or an answer, so she cannot repeat what a lane withheld."*

**What I did.** Took *"however it is called"* literally.

**What happened.** Two ways, neither reachable today:

```
handoffNote({laneId:'google_ads', answered:true, recordCount:'ZEBRAFISH-CONFIDENTIAL-4412'})
  -> "I took that to ARRINGTON GOOGLE ADS, who answered from ZEBRAFISH-CONFIDENTIAL-4412 records..."
handoffNote({laneId:'google_ads', answered:true, recordCount:{toString:()=>SECRET}})   -> same

Object.prototype.laneId='google_ads'; Object.prototype.recordCount=SECRET;
handoffNote({})   ->  guard sees no keys (Object.keys is own-only), destructuring reads the chain
                  ->  the secret is rendered
```

The guard checks key **names**, not value types, and `recordCount` is interpolated verbatim.
`assertOnlyPermitted` uses `Object.keys` while the function body destructures, so anything on the
prototype chain bypasses the guard entirely.

**Reachability and fairness to the builder, both stated.** The only caller passes
`result.provenanceKeys.length`, always a number, so limb one is not reachable. I searched the
request path for a prototype-pollution sink — recursive merge, `Object.assign` over `req.body`,
spread of untrusted input — and found none, so limb two is not reachable either. **And the guard
is a faithful copy of `buildAlert`'s**, the H7 remedy, which has the identical `Object.keys` shape
and the same unchecked interpolation; this is an inherited property of an accepted pattern, not a
regression Ruth introduced.

**Why it is still a finding.** The adopted working rule from J1 is that *every asserted security
property must name the test that establishes it, and that test must exercise the real function
under the conditions the property claims to hold.* The property here is "however it is called";
the test exercises one extra plain key. And `CLAUDE.md`'s "three booleans" is simply wrong —
`recordCount` is a number, and it is the one value she interpolates.

**Remedy.** Coerce at the boundary (`Number.isInteger(recordCount) ? recordCount : 0`), read own
properties only, and correct "three booleans" to "two booleans and a count". Consider the same at
`buildAlert`, since the two are meant to be the same discipline.

## 6. What I re-verified, and what I inherited

Re-run by my own probes at the frozen head:

| Finding | How | Result |
|---|---|---|
| F1 | full CMS-admin takeover of `tom`, both sanity checks, 6 guesses, positive control | stops at the unlock screen; workspace not opened |
| F2 / G1 / Q1 / R1 | 3,780 paired anonymous raw-socket requests per flag state, status + full header set + body length | 3780/3780 both states |
| F8 | body length on every denial | 4,282 bytes, identical to the site's genuine 404 |
| F4 / G9 | `hashEmail` with no key and under two keys | throws; digest key-dependent |
| G5 | `routes/auth.js` | `req.session.regenerate()` at login |
| H1 | `alertRecipient` arity and body | 0 parameters; no db reference |
| H2 / J3 / M2 / N1 | real five-guess burst, then the activity table | one alert, typed `alert_failed`, says nothing was sent |
| H3 | boot lines, flag on and off | each gate reported separately; alarm declared inert |
| H4 | grep plus call sites | one constant, two call sites, one test |
| H7 | `buildAlert` with an unpermitted key | throws naming it |
| J1 / L2 / M1 | one alert row for the burst | bounded |
| J2 | the burst's rows | `subject` exact, `actor='system'` |
| K3 | call-site count | exactly one |
| K5 | `rev-parse` / `status` at first and last command | clean at the frozen head throughout |
| L1 | deployed handle | `dedicatedConnectionSource(db/pool) = 'wrapper'`; shorthand returns null |
| Seed migration | three shapes, twice each | exit 0 every time, idempotent, index built |
| Adversarial suites | by hand against a running instance | workspace 10/10, Scott 18/18, nothing skipped |
| Sitemap / robots / nav | both flag states | zero workspace or Ruth references |
| S1 | seven planted probes, both directions | two shapes fixed, false positive fixed; see T5 |

Inherited from review 12 without re-running, because the code is byte-identical across the three
commits (verified by SHA, section 1) and the finding has no interaction with Ruth or the scan:
**P1** and **P2** (the two committed-test mutations), **P3/N4** (threshold window edges), **Q2**
(which clock), **Q4** (`recordedAs` under forced contention), **L2/M1/J1's 240-process concurrency
run**, **F5** (social scopes), **F10** (privacy text), and the erasure end-to-end walk. I re-ran
the alarm's real-burst behaviour and the seed migration rather than inheriting them, because those
are the two paths a release actually executes on boot.

## 7. Concerns I could not turn into findings

- **`npm test` still does not pin R1's fix.** The case-insensitivity of `WORKSPACE_PATH` is
  asserted only in the gated adversarial suite. My predecessor asked for a three-line unit test
  calling the exported `refuseUnroutedMethods` with `{path:'/API/workspace/ask', method:'OPTIONS'}`;
  it was not added. Removing the `i` again leaves a bare `npm test` fully green. Disclosed on
  every run, so not a finding — but this property has now cost two HIGH findings and three cycles,
  and it is three lines.
- **The adversarial sweep still lists paths by hand.** Asked for by two reviewers; still hand-listed,
  and still short of `/api/workspace/social/engagement/:id/replied`. I probed all twenty routes
  myself and every one is clean, and the guard is a prefix regex so a new route is covered
  automatically. Same sentence, thirteen reviews.
- **`workspace` is still not a reserved CMS slug.** Reproduced by my predecessor; unchanged, and a
  pre-existing pattern shared by `/scott`, `/product-guide`, `/market-ready-test` and
  `/where-to-start`. Adding the four prefixes to `RESERVED_SLUGS` closes the class.
- **The workspace router's guard assumes a mount path of `/`**, and the `case sensitive routing`
  dependency is still written down nowhere in `server.js`. Both asked for; neither done.
- **A non-GET with a bad CSRF token returns 500, not 403**, so `PUT`/`PATCH`/`DELETE`/`TRACE` never
  reach `refuseUnroutedMethods`. Identical on the control path, so nothing leaks. Raised by three
  predecessors, unchanged.
- **Scott and the public APIs remain anonymously enumerable by `OPTIONS`** (`/api/scott/search`,
  `/api/leads`, `/api/product-guide/submit` all answer `200 Allow: POST`). Pre-existing and live in
  production. Somebody should decide this deliberately rather than inherit it from a framework
  default.
- **A legacy database keeps one permanently unresolved claim** with `subject = ''`, which the
  runtime reclaim can never match. Reproduced again in shapes 2 and 3. Inert; a `WHERE subject <>
  ''` would tidy it.
- **The in-memory unlock attempt budget still resets on restart**, and a duplicate is still
  possible if a send outlives the three-minute lease. Both documented and deliberate. I relied on
  the first myself across several restarts; a patient attacker can too.
- **No live alert email has ever been delivered**, on thirteen passes. The last hop of this control
  remains untested by anyone.
- **The two Ruths share a first name.** Section 4.6. Tom chose it; I record it because it is a
  presentational decision about the boundary between the demonstration and the real business
  system, and the firewall test's token list necessarily cannot cover it.
- **Three worktrees from earlier builder sessions are still attached** (`/tmp/wt-portal`,
  `/tmp/wt-ruth`, `/tmp/wt-social`) and six databases from earlier sessions are still on the local
  server. Not mine; I touched none of them. Worth pruning before a release cut.
- **Who holds Railway.** F1's closure, H1's remedy and the whole third gate rest on Railway being
  reachable only by Tom. Thirteen passes, no reviewer has seen it.

## 8. What remains for Tom Arrington

1. **The workspace is secure, and Ruth did not change that.** I attacked the three gates with your
   own admin account, swept 7,560 anonymous requests across two flag states, seeded real
   confidential records and tried to get them out through her, and diffed the entire permission
   matrix with and without her. She reads nothing, changes nothing, and leaks nothing. Your
   builder's technical claim about her is true and I verified every part of it.
2. **But the paperwork around her is wrong, and that is my one MEDIUM.** Your code says in three
   places, one of them twenty lines below Ruth's own entry in `CLAUDE.md`, that the router *"never
   speaks as a person and never appears in output as a tenth identity."* Ruth does both. That is
   not a security problem and it is not a reason to remove her — you asked for her. It is a reason
   to update the controlled statement through your governed route, so the repository stops
   containing two sentences that cannot both be true. Ten minutes of your time, and it is the kind
   of drift that thirteen reviews exist to catch.
3. **One line of hers is simply untrue and I would change it before you show anyone.** When a
   question does not match a specialist, she says *"I answered that one myself."* She did not and
   cannot. Of everything in this report, that is the sentence most likely to be quoted back at you
   by someone you are demonstrating to.
4. **Three small things in her code.** A field called `gapRaised` is passed to her on every turn
   and does nothing (T2); a crafted lane id makes her name a colleague called "Object" and returns
   a 500 (T3); and the comment saying she cannot leak a record *"however it is called"* is not
   quite true, though nothing in your application can call her that way (T6). None is urgent. All
   three are a few lines.
5. **The test-reporting helper still is not right, for the third cycle.** Your builder fixed the
   two shapes your last reviewer planted — I confirmed that, and it is real progress. But the
   sentence your last reviewer asked to be deleted is still in the file header and in a second
   file (T4), one ordinary way of writing a gate still walks past both checks (T5a), and the fix
   introduced a fresh false alarm on database-gated suites (T5b). Nothing is being mis-reported to
   you today. Fix it because a future session will read that header and stop there.
6. **Do the secret rotation.** Still yours and still outstanding: `WORKSPACE_ACCESS_PASSPHRASE`,
   `WORKSPACE_SNAPSHOT_KEY`, then `SESSION_SECRET` (which invalidates every CRM erasure tombstone,
   by design) and the account passwords.
7. **Two things this review does not cover.** First, **the tagging of your real thirty snapshot
   records**: I seeded my own records and proved the filter works on them, which is more than the
   last pass could do, but only you can confirm that genuinely confidential material in the real
   snapshot is *marked* confidential. That is the open half of J4 and it stays yours. Second, **the
   alert email has still never been delivered to anybody**; set `GMAIL_APP_PASSWORD` and make it
   ring once, deliberately, before you rely on it.
8. **Why AMBER after a PASS, so you can check my reasoning.** I am not reversing my predecessor. He
   reviewed `d745a55`; Ruth did not exist then. Everything he passed, I re-tested and it still
   holds. The AMBER is on new work, and it rests on a single MEDIUM that has no security
   consequence at all — I could have graded it LOW and passed the candidate, and I want you to see
   that I considered it. I did not, because the finding is precisely that a controlled statement
   and the shipped behaviour disagree and the assurance case argued around it rather than through
   it. If this process ever waves that through, it is not doing the one job it has. Close item 2
   and item 3 and I would expect the next pass to be green.
9. **What still cannot be verified from inside this project's tooling**, after thirteen passes: the
   Drive authorities, the completion mandate's exact wording, your own instructions except as
   quoted by the builder, the provenance of the thirty snapshot records, and everything about
   Railway. My MEDIUM in particular turns on a controlled statement I can only read as transcribed
   in the code by the party it constrains. If you want that certified it needs a reviewer with
   Drive and Railway access and, on the evidence of thirteen passes, one not commissioned by the
   session whose work is being reviewed.

---

Nothing in this review was merged, deployed, connected, spent or enabled. The paid live-AI suites
were not run. My writes were confined to four throwaway databases — `ws_r13`, `r13s1`, `r13s2`,
`r13s3` — created from nothing and dropped at the end; within `ws_r13` I reset the local `tom`
password through the application's own API as part of the F1 attack, inserted six synthetic
workspace records carrying canaries, and created `workspace_activity` rows through real failed
unlock attempts, before dropping the database entirely. Every experiment needing a code change ran
in a `git worktree` under `/tmp`, since removed. The reviewed checkout was never edited, the head
never moved, and the working tree was clean at the first command and at the last.
