# Arrington AI Workspace v0.1 — eighteenth independent Governance & Assurance review

**Lane:** ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent
assurance lane. I am not the builder, and the builder does not award
itself this verdict.

**Date:** 31 August 2026.

**Candidate:** branch `feature/arrington-ai-workspace-v0-1`, frozen head
`bdc3d0d0afedfe93c572935066b88b6307433b21`.

**This report:** `review/workspace-v0.1-governance-review-18-2026-08-31.md`,
committed on `governance/workspace-v01-review-18`. Nothing else in the
tree is touched by me.

---

## VERDICT: PASS

**Two findings, both LOW, both documentary. No HIGH, no MEDIUM, no
behavioural defect.**

| Finding | Severity | One line |
|---|---|---|
| **Y1** | LOW | The X2 property test's name asserts a property over all counts; it establishes it over 2 to 60. A dishonest sentence conditional on a count outside that range passes the whole suite. The conclusion that "every reachable sentence" is earned is true, but it rests on `MAX_CONTEXT_RECORDS = 24` in another module, which neither the test nor the remediation mentions and nothing asserts. |
| **Y2** | LOW | The dated builder's note added for X4 states that the two copies of the fifteenth review "no longer differ at all". At the head that carries the note, they differ by the note — twenty lines. A stale absolute claim inside the note written to correct a stale absolute claim. |

**Neither finding is a security defect and neither is the eighteenth
instance of the chain's recurring pattern in its dangerous form.** The
recurring defect has been *a security or honesty property asserted and not
held*. Y1 is a test name that overstates its own coverage, on a function
whose reachable domain is nonetheless fully covered. Y2 is one sentence
in a footnote about a footnote. I say plainly below what I think that
means for a release decision.

**Everything substantive I probed holds**, and I re-established it rather
than inheriting it: all three access gates, the CMS-admin takeover
stopping at the unlock screen with a positive control in the same run,
the alert's boundedness under real cross-process concurrency against a
real database with a negative control proving my instrument works, and
the three permission legs swept with canaries I constructed, again with a
positive control.

---

## Frozen head and clean tree

**At the start:**

```
$ git rev-parse HEAD
bdc3d0d0afedfe93c572935066b88b6307433b21
$ git status --porcelain
$ git branch --show-current
feature/arrington-ai-workspace-v0-1
$ sha256sum data/workspace-snapshot.enc
e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2  data/workspace-snapshot.enc
```

**At the end, before writing this file:**

```
$ git rev-parse HEAD
bdc3d0d0afedfe93c572935066b88b6307433b21
$ git status --porcelain
(empty)
$ sha256sum data/workspace-snapshot.enc
e376dfa56809988ef4acca48b49a28a80dd64b99986d5994d980d2029cd1ceb2  data/workspace-snapshot.enc
```

The tree did not move under me and the snapshot ciphertext is
byte-identical. Every experiment ran in two throwaway worktrees,
`git worktree add /tmp/gov18 bdc3d0d` and `git worktree add /tmp/gov18old
69b6e06` (finding K5), both of which I confirmed clean after each
mutation and removed at the end. Every mutation I made was restored and
`git status --porcelain` checked empty before the next one.

Database: a PostgreSQL 16 database `gov18db`, created from nothing for
this review and dropped at the end. No secret value appears in this
report. Nothing was merged, deployed or enabled; no paid suite was armed;
Railway, Drive and production were not touched.

---

## The bounded question

This is a confirmatory pass over the X cycle: are the four corrections
sound, and is any of them the eighteenth instance of the chain's
recurring defect? The diff `69b6e06..bdc3d0d` is one commit,
`bdc3d0d Correct the seventeenth review's four findings (X1-X4)`, touching
nine files: `CLAUDE.md`, `lib/workspace/receptionist.js`,
`test/helpers/gatedSuiteScan.js`, `test/workspace/receptionist.test.js`,
two new probe fixtures, the fifteenth review, the seventeenth review as
delivered, and the X remediation.

I also re-established the three gates, the alert's boundedness, the
permission legs, and the X remediation's own measurement claims.

---

## X1 — the field guard. Sound. Both halves hold.

`assertOnlyPermitted` now iterates with `for...in` and the three declared
fields are read through `Object.hasOwn`. I probed both halves and the
substantive property, at the real head and against `69b6e06` as a control.

**Against `69b6e06`, the defect the seventeenth reviewer found is real and
reproduces:**

```
OLD prototype-borne recordCount: "I took that to ARRINGTON GOOGLE ADS, who
  answered from 42 records. The provenance is listed with the answer."
OLD prototype undeclared key:    "I took that to ARRINGTON GOOGLE ADS, who
  answered from 1 record. The provenance is listed with the answer."   <- no throw
```

**At `bdc3d0d`, thirteen probes:**

| Probe | Result |
|---|---|
| A prototype-borne undeclared `record` | **THREW** `refusing unpermitted field(s) record` |
| B prototype-borne declared `recordCount: 42`, no own value | **not read** — "no record on file" |
| C own `recordCount: 1` over prototype `42` | own value wins |
| D own **non-enumerable** undeclared `record` | no throw; **not read, not spoken** |
| E symbol-keyed undeclared field | no throw; **not read, not spoken** |
| F prototype **getter** for `recordCount` | **getter never invoked**; value not read |
| G `Object.create(null)` carrying the three fields | correct |
| H class instance, `recordCount` accessor on the prototype | **not read** |
| I string `opts` | throws on `0, 1` |
| J number `opts` | no fields, no-lane sentence |
| K `null` `opts` | TypeError, identical to the pre-fix destructure |
| L array `opts` | throws on `0` |
| M Proxy whose `ownKeys` hides nothing but whose `get` returns `12345` for `recordCount` | value read — but `recordCount` is a **declared** field |

**The stated mechanism now holds where it matters, and the substantive
property holds absolutely.** The function reads exactly three literal
names, own-only. The only values that can reach the output are a lane
*name* taken from `LANES` after `LANES.some((l) => l.id === laneId)`, a
number gated through `Number.isFinite(...) && ... > 0`, and fixed
strings. There is no path for record content, however the object is
constructed — I could not build one with a prototype, a getter, a
non-enumerable property, a symbol, a null prototype, a class, or a Proxy.

**One residual, recorded and deliberately NOT raised as a finding.** The
guard's key set (`for...in`: enumerable, own and inherited) and the
reader's key set (`Object.hasOwn`: own, enumerable or not) are not
supersets of one another. Probes D and E show the consequence: an own
non-enumerable or symbol-keyed undeclared field is not classified and
does not throw. `CLAUDE.md`'s summary sentence, "anything else THROWS",
is therefore not literally true of those two shapes.

I am not raising it, for three reasons, and I want the reasoning on the
record so a later pass can disagree with it deliberately rather than
by accident:

1. **It is not a disclosure and cannot become one.** The set of keys that
   are *read* is three string literals. There is no key that is read,
   undeclared, and unclassified. X1's original defect was different in
   kind: there a key genuinely *was* read through a path the guard could
   not see, and the count in Ruth's sentence genuinely changed.
2. **It is unchanged by this fix.** `Object.keys` missed own
   non-enumerable and symbol keys too. This is pre-existing and strictly
   narrower than what X1 closed.
3. **The code comment is precise.** It says `for...in` "sees inherited
   enumerable keys", not "sees everything". The over-broad sentence is in
   `CLAUDE.md`'s one-line summary, and reaching for it would be reaching.

**X1: sound.**

---

## X2 — the count property. Sound in substance. Y1 is the register.

### What holds

The reviewer's own mutation is dead, and the property genuinely covers
the whole reachable domain. A battery of thirteen mutations, each applied
to `lib/workspace/receptionist.js` in the worktree, the suite run, the
file restored:

| Mutation | Reachable? | Suite |
|---|---|---|
| dishonest sentence at `n === 4` (the seventeenth reviewer's own) | yes | **caught** |
| dishonest at `n === 13` (not in `PROBE_COUNTS`) | yes | **caught** |
| dishonest at `n === 24` (the cap boundary) | yes | **caught** |
| dishonest at `n > 60` | no | **caught** |
| lane-conditional dishonest verb on `governance_assurance` | yes | **caught** |
| gap-conditional dishonest verb | yes | **caught** |
| `gapWritten` rewritten to "I have written the gap down" | yes | **caught** |
| "I checked the records myself" unconditionally | yes | **caught** |
| `laneId` echoed when `laneId.length > 60` | no (all nine ids are short) | passed |
| a branch on a non-integer count | no (`provenanceKeys.length`) | passed |
| dishonest at `n === 61` | **no** | **passed** |
| dishonest at `n === 137` | **no** | **passed** |

Against `69b6e06` the `n === 4` mutation passed 11/11. It is now caught.
Every mutation I could reach through the real caller is caught. **The
test named "every reachable sentence is one she is permitted to say" is
earned** — because the reachable count domain is `0..24`:

```
lib/workspace/orchestrator.js:30   const MAX_CONTEXT_RECORDS = 24;
lib/workspace/orchestrator.js:84   return current.slice(0, MAX_CONTEXT_RECORDS);
lib/workspace/orchestrator.js:174  const provenanceKeys = records.map((r) => r.record_key);
routes/workspace.js:504            recordCount: result.provenanceKeys.length,
```

`grep -rn handoffNote` outside `test/` returns exactly one caller,
`routes/workspace.js:502`, building an object literal from three computed
values. So `recordCount` is a non-negative integer bounded by 24;
`0` and `1` are asserted for membership directly, and `2..24` sit inside
the `2..60` shape-constancy sweep whose anchor, `2`, is itself asserted
permitted. That is a sound transitive argument, and it is the reason I am
grading Y1 LOW rather than MEDIUM.

### Y1 (LOW) — the property test's name asserts more than it establishes, and the reason it is nonetheless sufficient is stated nowhere

**The test is named** `the output depends on the count only through none,
one, and more than one`. That is an unqualified statement about a domain
the same commit's comment correctly describes as unbounded: *"The count is
an unbounded non-negative integer, so no sample is an enumeration."*

**It is established over `2..60`.** Reproduced:

```
$ python3 - <<'PY'     # insert one branch at n === 137
...  if (n === 137) return `I took that to ${who}, and I checked the ${records}
                            behind it myself before passing it on.`;
PY
$ node --test test/workspace/receptionist.test.js
# tests 12
# pass 12
# fail 0

$ node -e "…handoffNote({laneId:'google_ads', recordCount:137})"
I took that to ARRINGTON GOOGLE ADS, and I checked the 137 records behind it
myself before passing it on.
```

An explicit claim to have read records she cannot read, on a branch the
suite is named for excluding, passing 12/12. Identically at `n === 61`,
one past the sweep.

**The X remediation's stated argument is the part that does not hold:**

> the test now asserts that the normalised output depends on the count
> only through `{none, one, more than one}`, by checking every count from
> 2 to 60 yields one shape. **With that established, sampling is
> sufficient** rather than merely wider, and the name is true.

Sweeping a bounded subrange does not establish a property over an
unbounded domain — as the mutation above demonstrates. The conclusion is
nevertheless correct, but for a reason the remediation does not give and
the test does not encode:

```
$ grep -rn "MAX_CONTEXT_RECORDS" test/
  (no test references MAX_CONTEXT_RECORDS)
$ grep -c "MAX_CONTEXT_RECORDS\|provenanceKeys" review/workspace-v0.1-x-remediation-2026-08-31.md
0
```

**Why this is a finding and not pedantry.** The coverage rests on
`24 ≤ 60`, a relationship between two modules that nothing asserts, no
comment mentions, and no reader of either file would know to preserve.
Raise `MAX_CONTEXT_RECORDS` above 60 — a one-token edit in a file about
prompt size, with no visible connection to Ruth — and the test's name
silently stops being true, with no test going red. That is the same shape
as X2 itself: a name that outruns its coverage, differing only in that
today the gap is unreachable.

**Severity LOW.** No reachable dishonest sentence exists. Nothing in
production behaves incorrectly. This is coverage bookkeeping, not a
control failure.

**What would close it.** Either of these, and the second is smaller:

- Import `MAX_CONTEXT_RECORDS` into `test/workspace/receptionist.test.js`
  and assert `MAX_CONTEXT_RECORDS <= 60` (or derive the sweep's upper
  bound from it), so the cross-module fact that makes the sample
  sufficient is pinned by the test that depends on it; **or**
- Say it. One sentence in the test comment naming the cap, and a
  corrected sentence in the remediation, so the argument on the record is
  the argument that actually works.

---

## X3 — the early-return rule. Sound, no false positives, and the shared-alias claim holds.

**The "watched red against `69b6e06`" claim is true.** Both new fixtures,
run through the real classifier at both heads:

```
OLD(69b6e06) must-flag-early-return-require-ambient => null
OLD(69b6e06) must-flag-early-return-alias-ambient   => null
NEW(bdc3d0d) must-flag-early-return-require-ambient => "returns early on configuration"
NEW(bdc3d0d) must-flag-early-return-alias-ambient   => "returns early on configuration"
```

**Fifteen probes of my own, both directions.** Each is an early return on
an *ambient* name, because that is precisely where the name-reading rule
stands down and the early-return rule is all that is left — the condition
under which X3's miss became observable:

| Spelling of the gate | `69b6e06` | `bdc3d0d` |
|---|---|---|
| `require('process').env.CI` | missed | **flagged** |
| `const e = process.env; e.CI` | missed | **flagged** |
| `const e = process['env']; e.CI` | missed | **flagged** |
| `const e = process.env; e['CI']` | missed | **flagged** |
| `const {env: my} = process; my.CI` | missed | **flagged** |
| `Object.assign({}, process.env)` alias | missed | **flagged** |
| `{...process.env}` alias | missed | **flagged** |
| `globalThis.process.env.CI` | flagged | flagged |
| `const {CI} = process.env; if (!CI)` | flagged | flagged |
| non-ambient name, any shape | flagged | flagged |
| ordinary suite, no environment read | not flagged | **not flagged** |
| a suite that *sets* an env key as part of a test | not flagged | **not flagged** |
| an unrelated local variable merely named `env` | not flagged | **not flagged** |

Seven shapes closed, none regressed, **zero false positives** — the
direction the file's own U4 comment warns is the dangerous one, because a
check that cries wolf gets loosened.

**No regression on the real tree.** I ran both classifiers over all 50
real `*.test.js` suites in the candidate. Identical output: the same six
suites flagged, with the same name lists. The X3 change cannot have
started flagging a real suite.

**The specific X3 claim is structurally true.** `envAliases(src)` is a
single function and both rules call it; `aliasAlternation` is derived from
it, and returns `(?!)` rather than an empty alternation when there are no
aliases, which is the correct handling. The two rules cannot know about
different aliases because there is only one alias set.

**Two shapes still escape, and they are declared rather than claimed
away:** an environment read wrapped in a call inside the `if`
(`if (String(process.env.CI)) return`), and a statement before the
`return`. Both only matter for ambient names. I am not raising these,
because the file states the limitation prominently and accurately in its
own header:

> **WHAT THIS CHECK IS, STATED HONESTLY.** It is a backstop, not a proof.
> It reads source text, so a sufficiently indirect gate will always
> escape it.

That is the correct disposition, and it names the durable replacement (a
positive obligation measured by running the tree) as the next step rather
than claiming it as done. A reviewer finding an escape in a check that
declares itself escapable is not finding a defect.

**X3: sound.**

---

## X4 — the erratum. The reviewer's text is unaltered. Y2 is one sentence in the note.

### What holds

**Nothing of the fifteenth reviewer's text is altered, and I verified it
byte for byte rather than by reading the diff.**

```
$ git diff governance/workspace-v01-review-15:review/…-15-….md \
           7a85d59:review/…-15-….md
(no output — byte identical when the erratum was carried)

$ git show governance/workspace-v01-review-15:review/…-15-….md | head -1001 | sha256sum
5ffa26c58246ab2b18fa26954168e31965180d6919ce0afe10069ef28d561660  -
$ git show bdc3d0d:review/…-15-….md | head -1001 | sha256sum
5ffa26c58246ab2b18fa26954168e31965180d6919ce0afe10069ef28d561660  -
```

The as-delivered body — the reviewer's report and their own erratum — is
identical on the reviewer's branch and on the candidate. The whole change
is an append. The claim about commit `7a85d59` carrying the erratum
byte-identically is also true, verified above. The mechanism chosen (a
dated builder's note below, rather than editing a reviewed document) is
the right one and is consistent with K5.

### Y2 (LOW) — the note contains an absolute claim the note itself falsifies

The appended note says:

> The erratum was carried onto the candidate branch on 31/08/2026, in
> commit `7a85d59`, **so both copies now carry it and they no longer
> differ at all.**

At the head that carries this note, they do differ, by this note:

```
$ git diff --stat governance/workspace-v01-review-15:review/…-15-….md \
                  bdc3d0d:review/…-15-….md
 …workspace-v0.1-governance-review-15-2026-08-31.md | 20 ++++++++++++++++++++
 1 file changed, 20 insertions(+)
```

The sentence was true of `7a85d59` and stopped being true in the commit
that wrote it. The following sentence — "the diff adds the erratum at the
end and changes nothing above it" — is true of `7a85d59`'s diff and not
of `bdc3d0d`'s, which adds the note, not the erratum.

**This is X4's own shape, one iteration along:** a note written because a
carried paragraph described a file it no longer matched now contains a
paragraph that describes a file it no longer matches. I am reporting it
because the review brief asked me directly whether the note is accurate,
and the honest answer is "accurate on everything that matters, and this
one clause is not".

**Severity LOW, and I will say plainly it is at the floor.** It is
self-referential documentation about documentation. Nobody is misled about
anything the candidate does. A reader who follows the note's own
invitation to compare byte for byte gets the right answer.

**What would close it.** Scope the clause to the moment it describes —
"they differed by nothing until this note was appended" — or drop the
absolute and keep the sentence that already does the work ("the
as-delivered body can still be compared byte for byte").

---

## What I re-established rather than inherited

### The three gates, with the flag OFF

A raw-socket probe comparing the **full normalised response** — status
line, every header, and body, with `Date`, per-request nonces, `Set-Cookie`
and CSRF tokens normalised — against genuinely missing control paths.
Eight methods (`GET POST OPTIONS PUT DELETE HEAD PATCH TRACE`) against 28
workspace paths, including the shapes that produced findings Q1 and R1:
case variants (`/WORKSPACE`, `/Workspace`, `/API/workspace/ask`), a
trailing slash, a doubled slash, `..` traversal, and percent-encoding.

```
control GET: 1 distinct signature(s)   … (one signature per method, as it must be)
224/224 workspace probes byte-identical to a genuinely missing path
```

**No timing oracle either.** 1,680 timed requests against length-matched
controls, flag off:

```
workspace pages        {"n":480,"med":"2.51","p90":"3.16"}
control pages          {"n":480,"med":"2.46","p90":"3.18"}
workspace api (POST)   {"n":360,"med":"1.13","p90":"1.42"}
control api (POST)     {"n":360,"med":"1.05","p90":"1.30"}
```

The boot line with the flag off says what it should and nothing more:
`Workspace access: ENABLE_ARRINGTON_AI_WORKSPACE is not 'true', so the
workspace does not exist in this environment`.

### The CMS-admin takeover, with a positive control in the same run

The full attack, not a proxy for it. Flag on, owner bound to `tom`
(user id 2), passphrase set:

1. `nat` (a real site admin, not the bound owner) — every workspace page
   and every API returns the ordinary 404, 4,282 bytes, the same page a
   missing route returns.
2. `nat` resets `tom`'s password through the CMS:
   `PUT /api/admin/user/2/password` → `200 {"success":true}`.
3. The attacker logs in as `tom` with the password they just chose →
   `302`, a real authenticated session holding the right **username** and
   the right **user id**.
4. That session reaches: `/workspace` → `302 → /workspace/unlock`.
   `POST /api/workspace/ask` → **404**, byte-length identical to the
   404 page. `POST /api/workspace/contacts/1/erase` → **404**.
5. Five passphrase guesses → `401 {"error":"That passphrase is not
   correct."}` each; the sixth → `429`.

The register in `workspace_activity` afterwards:

```
 1 | tom    | workspace_unlock_failed        | tom | … refused: the passphrase did not match.
 2 | tom    | workspace_unlock_failed        | tom | …
 3 | tom    | workspace_unlock_failed        | tom | …
 4 | system | workspace_unlock_alert_failed  | tom | Security notice FAILED to send after 3 …
 5 | tom    | workspace_unlock_failed        | tom | …
 6 | tom    | workspace_unlock_failed        | tom | …
```

Every property the H, J, M and N cycles fought for, visible in six rows:
the alert fires on the **third** failure, below the limiter's budget of
five; the `subject` column scopes it to the account under attack (J2); a
send that never reached a mailbox is recorded as
`workspace_unlock_alert_failed` and **not** as a delivered notice (H2,
M2, N1); and it therefore did not buy the hour of silence.

**The positive control, which is what makes the above mean anything.**
With the limiter reset, the same attacker-set password plus the *real*
passphrase:

```
POSITIVE CONTROL unlock with real passphrase -> 200 {"ok":true}
  GET /workspace          -> 200 (10796 bytes)
  GET /workspace/brain    -> 200 (8632 bytes)
  GET /workspace/chat     -> 200 (12966 bytes)
  GET /workspace/gaps     -> 200 (9636 bytes)
  GET /workspace/contacts -> 200 (11917 bytes)
```

So the takeover is stopped by the passphrase and by nothing else, exactly
as `lib/workspace/unlock.js` claims. Gates 1 and 2 do not close it —
after the reset the attacker satisfies both — and the file says so.

**Passphrase rotation invalidates an open unlock immediately, and leaves
the login intact.** Restarted with a different
`WORKSPACE_ACCESS_PASSPHRASE`, the already-unlocked session:

```
GET /workspace       -> 302 loc=…/workspace/unlock
GET /workspace/brain -> 302 loc=…/workspace/unlock
GET /                -> 200  YES still logged in to the CMS
```

### The alert's boundedness, under real concurrency, with a negative control

The stated property is that a burst produces exactly one notice: never
two, and — equally a failure — never zero. I wrote my own harness rather
than reading the existing one: **N separate operating-system processes**
racing a shared wall-clock instant, each with its connection already
established before the gun (the K2 lesson: a cold pool serialises the
statements by accident and turns a false property green).

```
20 rounds x 12 processes.  duplicated=0  silent=0  workerErrors=0
rows written: [{"workspace_unlock_alert_pending":"20"},{"workspace_unlock_failed":"100"}]
```

240 racing attempts, exactly one claim per burst, 20 pending rows for 20
rounds.

**Defence in depth, measured separately.** With the partial unique index
`uq_workspace_alert_pending` dropped, so the advisory lock is alone:

```
12 rounds x 12 processes.  duplicated=0  silent=0  workerErrors=0
```

**The negative control, which is the part that makes the two results
above worth reading.** Index dropped *and* the advisory lock neutered
(`pg_try_advisory_xact_lock` replaced with a `true` returning the same
parameters):

```
round 10: 2 WINNERS (duplicate alerts)
12 rounds x 12 processes.  duplicated=7  silent=0  workerErrors=0
```

**7 of 12 rounds break.** My instrument detects the defect it is looking
for. Both mechanisms were restored and the index recreated; the worktree
was verified clean afterwards.

### The permission legs, with canaries I constructed

The brain is unseeded here (no `WORKSPACE_SNAPSHOT_KEY`), so I seeded my
own: 21 records, one for every (source class × sensitivity) pair, each
body carrying a distinctive canary token.

**Filtering, against an independently computed expected set** — I
recomputed what each combination should see from `LANES` and
`SENSITIVITY_ORDER` directly, rather than trusting the functions under
test:

```
91 clearance x lane combinations checked against an independently computed
expected set; violations=0
```

The sweep included `owner_admin`, `ws_restricted`, an unrecognised
clearance, `null`, `undefined`, and the prototype keys `__proto__` and
`constructor`, crossed with all nine lanes plus `null`, a nonsense lane
and both prototype keys.

**Narrowest wins, in both directions:**

```
owner_admin (sees confidential) on google_ads (ceiling commercial)
  -> confidential records visible: 0
ws_restricted (standard only) on governance_assurance (ceiling confidential)
  -> above-standard records visible: 0
```

Neither leg substitutes for the other: the widest human on a narrow lane
is bounded by the lane, and the narrowest human on the widest lane is
bounded by the clearance.

**Filtering happens BEFORE the prompt is built, not as redaction
afterwards.** I stubbed the model client to capture the exact system and
user content it was handed, and swept 20 (clearance × lane) cases,
asserting in both directions — no withheld canary in the prompt, and no
provenance key claimed that never reached the prompt:

```
20 (clearance x lane) prompt-construction cases; prompt/provenance violations=0
ws_restricted on the widest lane: above-standard canaries reaching the prompt = 0;
                                  records supplied = 7
POSITIVE CONTROL owner_admin on the same lane:
                                  confidential canaries reaching the prompt = 7
```

The positive control matters: without it, "zero canaries reached the
prompt" is equally consistent with a probe that never worked. **Counts
are computed after filtering** — `provenanceKeys.length` is the length of
the already-filtered set, and the two directions above confirm the
provenance list and the prompt contents are the same set.

I removed all 21 canary records afterwards (`DELETE 21`).

---

## The X remediation's own measurement claims

Every number in it that I could check, I checked.

| Claim | Verified |
|---|---|
| "a test watched red against `69b6e06`, green after" — X1 | **yes**: prototype `recordCount` read as 42 at the old head, not read at the new one; undeclared prototype key silent at the old head, throws at the new one |
| — X2 | **yes**: the `n === 4` mutation passes 11/11 at `69b6e06`, is caught at `bdc3d0d` |
| — X3 | **yes**: both fixtures classify `null` at `69b6e06`, `"returns early on configuration"` at `bdc3d0d` |
| "Full suite 558 tests, 556 pass, 0 fail, 2 skipped" | **yes**, exactly: `# tests 558 / # pass 556 / # fail 0 / # skipped 2` |
| "the 21 no-`DATABASE_URL` failures are pre-existing, measured identically at `69b6e06`" | **yes**: 21 failures at both heads, and the failing test names are the **same list** — `crmContacts`, `crmErasure`, and two Scott orchestrator suites. **None is a workspace suite.** They fail loudly rather than skipping silently, which is the outcome the gated-suite scan exists to produce |
| "Adversarial by hand: workspace 10/10" | **yes**: `# tests 10 / # pass 10 / # fail 0 / # skipped 0` against a running instance, including the two cases that report NOT EXECUTABLE without `WORKSPACE_TEST_PASSPHRASE` |
| "Scott 18/18" | **yes**: `# tests 18 / # pass 18 / # fail 0` |
| "the prototype probes run directly" | **yes**, and eleven more of my own |

**A trap worth recording for the next session, because it cost me a
false negative.** My first adversarial run reported `not ok 8 - the right
passphrase opens it`, `401 !== 200`. That was not a defect: a previous
server process with a *rotated* passphrase was still bound to the port
alongside the new one. Killing every `node server.js` and starting one
cleanly gave 10/10. If a future reviewer sees a lone case 8 failure,
check `for pid in $(pgrep -f 'node server'); do tr '\0' '\n' <
/proc/$pid/environ | grep WORKSPACE_ACCESS_PASSPHRASE; done` before
concluding anything.

**`CLAUDE.md`'s new 61 lines are accurate.** Every figure it attributes to
the seventeenth reviewer appears in that reviewer's report at the cited
strength: 5,152 calls and 20 normalised shapes (lines 107, 203, 904);
15,300 request comparisons and 1,680 timed requests (lines 145, 914, 918);
the advisory lock alone holding across 40 bursts while a lock-free
predecessor breaks 29 times in 40 (lines 525-526, 1041). The X1-X4
summaries match what the code now does.

---

## What I could not test, and why

- **Content classification.** The brain runs with zero real records here,
  because `WORKSPACE_SNAPSHOT_KEY` is not in this environment and I did
  not seek it. My canaries test the **filter**; only genuine records test
  the **tagging** — that material which is actually confidential is
  actually marked confidential. That remains open and is Tom's, exactly as
  the J4/K4 disposition says: closing it means Tom adding real
  confidential records, not a builder or a reviewer synthesising them.
- **A live alert email has still never been delivered.** Eighteen passes,
  and `GMAIL_APP_PASSWORD` is unset here by design. What I *can* confirm
  is that the boot line says so in plain words rather than leaving an
  operator to discover it during an attack, and that the undelivered
  notice is recorded as a failure and does not buy the quiet hour.
- **Railway, Drive, the live domain, and the paid AI suites.** Out of
  scope by instruction and unreachable from this sandbox. `ENABLE_WORKSPACE_AI`
  and `ANTHROPIC_API_KEY` were unset throughout except where I stubbed the
  client factory in-process, which spends nothing.
- **The two remaining source-scan escapes** (a call wrapper inside the
  `if`, a statement before the `return`) are real and I have recorded
  them, but they are inside the limitation the file itself declares, so I
  have not treated them as findings.

---

## Reserved to Tom, carried forward

None of these is new. They are here so the release decision has them in
one place.

1. **Rotate before production**, in this order:
   `WORKSPACE_ACCESS_PASSPHRASE` and `WORKSPACE_SNAPSHOT_KEY` (findings
   L3, K4), then `SESSION_SECRET` and the account passwords. The
   repository was clean throughout and is clean now; the exposure was in
   agent session material. Note that rotating `SESSION_SECRET` invalidates
   every existing erasure tombstone (F4), which is safe only because
   erasure also deletes the source rows.
2. **Confidential *tagging* is untested** (above). Adding genuine
   confidential records is Tom's act, not the builder's.
3. **The G3 approval stays bounded** to the three named changes: the
   Scott social page including its live chat widget, the Scott fictional
   social records, and the Arrington social memory source. Widening the
   refused action set, adding a write scope, granting a persona a new
   domain, or introducing a credential write path would each exceed it.
4. **`lib/scott/clearance.js`'s `personaDomains` fail-open** — an
   unrecognised persona id falls back to the owner persona. I confirmed it
   is still there, unchanged, at lines 254-257. It is unreachable today
   and it is **live in production**, and it is correctly *not* being fixed
   on the way to a workspace release. It belongs to a separate,
   deliberate change.
5. **The unlock attempt limiter is still in memory**, so its
   five-per-fifteen-minutes budget resets on a container restart. The
   durable half — the failure count the alert reads — is in
   `workspace_activity` and does not reset. Unchanged since G6 and worth
   knowing.

---

## Is the remaining register at an irreducible floor, and is this fit for a production decision?

Tom asked for a judgement, so here it is without hedging.

**Yes, I think the register has reached its floor, and yes, I consider the
candidate fit for a production release decision.**

Three passes in a row have now returned PASS. Across eighteen independent
reviews the pattern of findings has changed shape completely, and the
change is the thing worth reading:

- Reviews 1 to 11 found **HIGH** findings, and several were live security
  defects: an enumeration oracle answering anonymous requests with the
  flag off, an alarm that could never ring, an alarm retargetable by the
  very account it existed to warn about, a concurrency guarantee that had
  never held, a mechanism whose dedicated-connection branch had never once
  executed.
- Reviews 12 and 14 to 18 have found **no HIGH and no MEDIUM**. Every
  finding in the last four cycles — W, X, and now Y — has been a sentence
  that outruns its code: a test name, a comment, a remediation's argument,
  a footnote about a footnote.

My own two findings are honestly in that class. Y1 is a test whose name
claims a property over an unbounded domain while establishing it over a
bounded one, on a function whose reachable domain that bound fully covers.
Y2 is one clause in a note about a note. Neither changes what the software
does. I could not construct a reachable dishonest sentence, a reachable
disclosure, a distinguishable workspace path with the flag off, a
duplicated or silenced alert, a leaked canary, or a takeover that gets
past the passphrase — and I tried each of those directly, with a positive
control each time so that the negative results carry weight.

**What I would say to Tom in one paragraph.** The access controls are the
strongest part of this system and they have now been attacked
independently eighteen times without giving way. The failure mode this
chain has been left with is not the software being wrong; it is the
software's own documentation being slightly ahead of it, which is a
maintenance risk rather than a security one, and it is a risk that
*shrinks* once the code stops changing daily. Continuing to hunt it has
reached diminishing returns: the last three cycles have collectively cost
more review effort than the defects they surfaced could ever have cost
Tom. Y1 is worth closing because it protects a real property cheaply — two
lines in a test. Y2 is worth a one-word edit if someone is passing.
Neither should gate a release.

**The two things I would not release without**, and both are Tom's rather
than the builder's: the secret rotation at item 1 above, which is
unambiguous and cheap; and a first real delivery of the failed-unlock
alert email in the production environment, since an alarm that has never
once rung in eighteen passes is the one control here whose end-to-end
behaviour nobody has observed. Neither is a code change. Both are
pre-flight checks on the day.

---

## Verdict, restated

**PASS.** Findings **Y1 (LOW)** and **Y2 (LOW)**, both documentary, both
at what I judge to be the irreducible floor of this register. No HIGH, no
MEDIUM, no behavioural defect, and no eighteenth instance of the chain's
recurring security or honesty defect.

The four X corrections are sound. X1 closes its stated mechanism and the
substantive property holds absolutely. X2 covers the whole reachable
domain, and Y1 is about the argument for why, not the coverage itself.
X3 closes seven spellings with no false positives and its shared-alias
claim is structurally true. X4 leaves the reviewer's text byte-identical,
and Y2 is one clause inside the note it added.

*ARRINGTON GOVERNANCE & ASSURANCE, 31 August 2026.*
