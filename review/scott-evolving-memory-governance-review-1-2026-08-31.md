# Scott Evolving Fictional Business Memory: Governance & Assurance Review 1

Date: 31 August 2026
Branch reviewed: `feature/scott-evolving-memory`, head `1be78ea` ("Add
Scott evolving fictional business memory (approved design, unreviewed)"),
one commit ahead of `main` at `d52e6f8`.
Protocol: "SCOTT EVOLVING FICTIONAL BUSINESS MEMORY - APPROVED DESIGN
CHANGE - 31 AUGUST 2026" (the controlling design document, treated as
authoritative per the task brief), read in full and checked against the
implementation line by line, in the style of this project's other
Scott/Workspace Governance & Assurance reviews (see
`review/scott-v0.2-*.md`).

## VERDICT: AMBER

One HIGH finding (M1), reachable and demonstrated, not merely
theoretical. AMBER, not STOP: nothing here reaches real Arrington data,
nothing merges to `main` (confirmed below), and the atomic-write and
Ruth-isolation guarantees the document requires do genuinely hold under
attack. AMBER, not PASS: M1 is a real gap against the controlling
document's own "narrowest wins" rule, plus three MEDIUM findings that
each weaken a claim this file or the code makes about itself.

## Independence

This review was conducted by a session with no role in writing the
candidate, reading only the branch, the controlling design document as
supplied, and this project's own house conventions. No code was changed;
this file is the only addition to the branch.

## Scope confirmed before reviewing the logic

- `git log feature/scott-evolving-memory --oneline -3` and `git diff main
  feature/scott-evolving-memory --stat`: exactly one commit ahead of
  `main`, touching `CLAUDE.md`, `db/schema.sql`, `db/seed.js`,
  `lib/scott/data/contextBuilders.js`, `lib/scott/governance.js`,
  `lib/scott/memory/driveExport.js`, `lib/scott/memory/factLedger.js`,
  `lib/scott/orchestrator.js`, `scripts/exportScottMemoryLedger.js`, and
  four new test files. Nothing in `lib/workspace`, `server.js`, `views/`,
  or `routes/` outside the Scott area is touched.
- `git branch --contains feature/scott-evolving-memory`: only itself.
  Not merged to `main`, not on any deploy branch. The branch is not on
  `origin` under any other name and carries no merge commit into `main`.
- `lib/scott/clearance.js` is **not** part of this diff. Every clearance
  primitive the new code calls (`workerCanReadDomain`, `isDomainVisible`,
  `personaCanSeeDomain`, `filterAndRedact`, `DEFAULT_PERSONA`) is
  pre-existing, unmodified code, read directly to confirm what each one
  actually checks rather than assumed from its name.

## Executed evidence (not the builder's comments)

- Full suite against a freshly created, freshly seeded local Postgres 16
  database (`node db/schema.sql` implicitly via `db/seed.js` on an empty
  database, then `node db/seed.js` a second time to confirm idempotency
  was not needed to be checked twice): **602 tests, 600 pass, 0 fail, 2
  skipped** (the two paid live-AI suites, correctly gated). This is the
  true count for all 54 `*.test.js` files in the repository, run in one
  process — the first pass I ran only picked up 50 files because a bash
  `test/**/*.test.js` glob without `globstar` does not recurse two levels
  deep and silently missed `test/scott/memory/*.test.js` entirely,
  reporting a false-clean 556/556. Worth recording for whoever runs this
  suite next: `test/**/*.test.js test/*.test.js` is not a safe "run
  everything" command in this shell; enumerate files with `find` instead.
- `test/scott/memory/*.test.js` alone: **46 tests, 46 pass, 0 fail.**
  CLAUDE.md's new section states "50 tests" for this path; the actual
  count, run twice, is 46. Recorded as finding M6.
- `noEmDashes.test.js` (scans every `.js` file under `lib/scott`,
  comments stripped, plus every view template and seeded database
  content): passed against the new files. Confirmed the governance.js
  prompt addition and the orchestrator.js prompt-string changes carry no
  em dash.
- Concurrency, attacked twice, not just re-run once:
  - 25 concurrent `establishFact` calls inside one warm Node process
    (single connection pool, the shape that made the Workspace's J1
    "fix" look sound when it was not): exactly 1 row created, all 25
    callers agreed on the same canonical answer.
  - 12 genuinely separate OS processes (`node` invoked 12 times via
    shell backgrounding, each opening its own fresh, cold connection
    pool against the same database, the class of test that actually
    found the Workspace's K1 defect) racing to establish the same
    canonical question: **exactly 1 row created, all 12 processes
    returned the identical answer text and the identical fact id.**
    `ON CONFLICT (domain, canonical_key) WHERE status IN
    ('runtime_generated', 'drive_mirrored') DO NOTHING` matches the
    partial unique index's predicate exactly (column list and WHERE
    clause both verbatim-identical to the `CREATE UNIQUE INDEX`), so
    Postgres genuinely uses it as the conflict arbiter rather than
    silently falling through to an error or a duplicate. **This claim
    holds.** It is the one part of the document's required test list
    this session found no way to break.
- Reserved-topic regex denylist attacked directly with 8 rephrased
  probes chosen to name a reserved topic without using any of the
  literal words/phrases in `RESERVED_TOPIC_PATTERNS`: **8 of 8 evaded**
  (`matchedReservedTopic()` returned `null` for all eight). See M2.
- Read `lib/scott/orchestrator.js`'s `callWorker` line by line to confirm
  the refusal path is a genuine reply correction, not a field-null. It
  is: `data.reply` is overwritten to a fixed honest sentence and
  `data.certainty` is forced to `'UNPROVEN'` when `establishFact` refuses
  — confirmed by reading the code and by the existing
  `orchestratorMemory.integration.test.js` case, which additionally
  asserts the fabricated figure (`£150`) does not appear anywhere in
  `result.reply`. **This claim holds and is the feature's strongest
  property.**
- Read `lib/scott/orchestrator.js`'s receptionist path (`callReceptionist`,
  `validateReceptionistReply`, `OUTPUT_FORMAT_RECEPTIONIST`) to confirm
  Ruth's schema and prompt carry no `memoryFact` field and that
  `callReceptionist` never calls `memory.establishFact`. **Confirmed —
  Ruth structurally cannot create a fact.**

## The document's own required test list, checked item by item

| Required test | Implemented? | Actually proven by an assertion? |
|---|---|---|
| Sensible missing low-consequence fact created, answered, persisted | Yes | Yes (`factLedger.test.js`) |
| Same question again returns the same fact | Yes | Yes, at the ledger level. **Not** proven at the reply level — see M3 |
| Materially equivalent wording retrieves the same fact | Yes | Yes |
| Silly/unreasonable/unknown question refused | Yes | Yes, both the pure gate and end-to-end through `callWorker` |
| Existing controlled fact cannot be overwritten | Yes, structurally (no write path to `deepBusinessFacts.js`) | Yes for "cannot overwrite the file". **Not** the same as "cannot contradict it" — see M4 |
| Two simultaneous first questions cannot establish contradictory facts | Yes | Yes, and re-established independently above with real concurrent processes |
| Lower-clearance user cannot retrieve a restricted generated fact | Yes | Yes, for **retrieval only**. The **creation-and-immediate-reply** moment is untested and, per M1, unguarded |
| Specialist isolation through Ruth routing | Partially — tested as "worker cannot propose a domain it does not hold", not literally through Ruth's routing | Yes for what it tests |
| Drive/export provenance still labels AI-created memory | Yes | Yes, across all five lifecycle statuses |
| Public Arrington and the real Workspace unaffected | Yes | Yes — structural firewall test plus the diff-stat confirmation above |

## Findings

**M1 (HIGH). The creation-time reasonableness gate checks only the
WORKER's clearance for the domain, never the asking PERSONA's — the
opposite half of the "narrowest wins" rule this codebase enforces
everywhere else.**

`classifyReasonableness({ workerId, domain, canonicalQuestion })` in
`lib/scott/memory/factLedger.js` calls
`clearance.workerCanReadDomain(workerId, domain)` and nothing else
clearance-related. It has no `personaId` parameter at all.
`establishFact()` accepts `askedByPersonaId` but only ever writes it to
the row for record-keeping; it is never passed into the gate. In
`orchestrator.js`'s `callWorker`, `personaId` is fully available at the
call site (it is already used two lines above, to build the worker's
deep-brain context) and is simply not threaded through.

This means the code checks half of 07Q/05A's own rule ("effective
context = human clearance AND worker permission, narrowest wins") and
skips the other half, at exactly the moment a fresh answer is spoken
aloud to a specific logged-in human.

**Concretely reachable, not contrived.** `ALLOWED_MEMORY_DOMAINS` is
`['marketing_performance', 'suppliers_ops', 'materials']`.
`marketing_performance` is held, per `PERSONA_DOMAINS` in
`clearance.js`, by `scott_mercer` and `tony_marsh` only — the code
comment on `tony_marsh`'s entry says so in as many words: *"Deliberately
given to Tony and NOT to Chloe: 07Q Clearance C covers reviews and
customer handling... but not what the company pays to acquire a lead."*
But `WORKER_DOMAINS.customers_marketing` — Bob Fletcher, Chloe's own
primary specialist for exactly this kind of question — **does** include
`marketing_performance`. So: Chloe Reed, logged in as herself, asks Bob
Fletcher an entirely ordinary question ("what's our usual budget for a
boosted post") of the shape the document itself gives as the canonical
example of what this feature should allow. `classifyReasonableness`
checks only that `customers_marketing` holds `marketing_performance`
(true) — it never checks that `chloe_reed` holds it (false, and
deliberately so, per the comment quoted above). The fact is created, and
critically, the model's own `reply` text — the thing Chloe actually
reads — is untouched by any of this, because the reply is only ever
rewritten on a **refusal**. Chloe receives, in that turn, a
`marketing_performance` answer the codebase elsewhere goes out of its
way to withhold from her.

I did not have live model access in this environment to run this exact
prompt end to end (that needs the separately-gated paid suite), but
nothing about it depends on the model's behaviour: the gate itself,
exercised directly with `workerId: 'customers_marketing', domain:
'marketing_performance'`, returns `{ allowed: true }` regardless of who
is asking, which is the defect. No existing test exercises this
worker/domain/persona combination — every test in
`factLedger.test.js` and `orchestratorMemory.integration.test.js` that
supplies an `askedByPersonaId` pairs it with a persona who already holds
the domain (`tony_marsh`/`suppliers_ops`, `ellie_park`/`materials`,
`scott_mercer`/anything).

This directly contradicts the module's own header comment ("gated by
`isDomainVisible()` exactly like every other piece of company brain
data") and CLAUDE.md's new section ("Retrieval is clearance-gated by the
exact same `isDomainVisible()` call as every other piece of company
brain data"). Both statements are true of *retrieval* and false of
*creation*, and the CLAUDE.md sentence in particular reads as though it
covers the whole feature.

**Minimum correction:** thread `personaId` into `classifyReasonableness`
and `establishFact`, and require `clearance.isDomainVisible(personaId,
workerId, domain)` — not `workerCanReadDomain` alone — before a fact may
be created. Separately, decide (and record the decision) whether a
refusal on persona grounds should also correct `data.reply`, the same
way a domain/reserved-topic refusal already does — as written today it
would not, since the `!outcome.ok` branch is the only one that touches
`data.reply`, which is the right mechanism already; it only needs
`classifyReasonableness` to actually produce that outcome for this case.

**M2 (MEDIUM). The reserved-topic denylist is a keyword/phrase match,
and ordinary rephrasing evades every category it exists to catch — the
"belt and braces" is real for a worker that fabricates using the exact
phrasing in the list, and offers no defence at all against one that
does not.**

Ran `matchedReservedTopic()` directly against eight rephrased probes
covering four of the document's twelve reserved categories, chosen to
name the same reserved topic without matching any pattern in
`RESERVED_TOPIC_PATTERNS`:

```
EVADED :: what will our glue costs look like in the run up to spring        (predictive_future)
EVADED :: what will our timber supplier charge us in the autumn             (predictive_future)
EVADED :: what are the minimum order terms in our agreement with the timber merchant  (signed_contracts)
EVADED :: is there a written arrangement with our usual glue supplier about payment terms  (signed_contracts)
EVADED :: do we always knock a bit off the price for regulars               (consequential_customer_promise)
EVADED :: do we throw in free delivery for repeat customers                 (consequential_customer_promise)
EVADED :: what is our usual conversion rate from boosted posts              (external_platform_activity)
EVADED :: how many people usually see our posts each month                  (external_platform_activity)
```

8 of 8 evaded. `predictive_future` requires the literal substring "will
be" (not "will [anything] be"), or "next (year|quarter|month)" (not
"spring"/"autumn"/"the run up to"), or "forecast"/"predict"/"going to
(be|happen)". `signed_contracts` requires the literal word "signed"
immediately before "contract"/"agreement" — any ordinary phrasing of a
supplier-terms question that does not use the word "signed" walks
straight past it, and `suppliers_ops` is on the eligible-domain list.
`consequential_customer_promise` requires
"guarantee/promise(d)/refund/compensat(e/ion)/discount of/free of
charge" — an "unadvertised discretionary discount for regulars" or
"complimentary delivery for repeat custom" describes exactly the kind of
consequential customer commitment the document reserves, worded around
every listed term. `external_platform_activity` names four specific
nouns (followers/engagement rate/impressions/click-through) plus "actual
(platform) post/activity" — "conversion rate" and "how many people see
our posts" are the same category of fabricated analytics claim and match
none of them.

This matters specifically because the code's own comment on this check
says it exists "independently of whether the model followed its own
instructions" — true for a worker that types the reserved word, false
for one that does not, and the four categories above have zero code-level
backstop for a reasonably-competent paraphrase. The domain allowlist (3
domains) and the worker-permission check still apply regardless, so this
is not a full bypass of the feature's guardrails — but for a question
that already lands in an eligible domain a worker holds, the reserved-
topic half of the gate currently protects only against a fabrication
that happens to use one of a fixed list of words.

**Minimum correction:** either narrow the claim in the code comment and
CLAUDE.md to what the regex demonstrably catches (literal-phrase
matches, not the topic itself), or strengthen the check — a second,
narrower keyword net per category, or routing genuinely reserved-adjacent
domains further away from the three eligible ones, would each reduce the
surface without redesigning the feature.

**M3 (MEDIUM). "Must not generate a different answer merely because the
model is called again" is enforced for what gets STORED, not for what
gets SAID.**

When `establishFact` returns `{ ok: true, created: false, fact: existing
}` — the same-question-again path, and the concurrent-first-write-loser
path — `callWorker` records `wasNewlyCreated: false` and, only in the
race-loser case, an informational `canonicalAnswer`/`conflictResolved`
pair. In neither case does it touch `data.reply`. The model's own reply
text for THIS turn is whatever it generated, which the prompt instructs
it to make identical to the previously-shown canonical fact, but nothing
in code checks or corrects that. A model that ignores the instruction
("use it exactly as given... do not restate it differently") and
restates a stored fact with a varied or drifted answer will have that
variant answer shown to the human, even though the ledger itself
correctly keeps the original canonical text and never overwrites it.

The document's requirement 3 reads: "Before answering the same or
materially equivalent question later, the system must retrieve the
persisted fact **and use it**." The retrieval half is proven
(`findRelevantFacts`, shown to the model as context). The "use it"
half — what the human actually reads matching what was actually
retrieved — is prompt-only, the exact pattern this codebase's own
Workspace receptionist findings (H7, X1) treat as insufficient on its
own for a property this specific document calls out by name.

**Minimum correction:** when `established: true, wasNewlyCreated: false`,
either overwrite `data.reply` to be built from the canonical
`fact.answer` (mirroring how the refusal path already rewrites the
reply), or add a test proving the property holds today through a real
model call in the paid suite, since no code-level guarantee currently
exists for it.

**M4 (LOW, wording precision). "An existing controlled fact cannot be
overwritten by generated memory" is true only in the narrow, structural
sense; the document's actual requirement is broader.**

The document's own words: "Existing controlled Scott facts always win. A
generated memory fact must never silently overwrite, **contradict or
weaken** an existing authority." The firewall test
(`test/scott/memory/firewall.test.js`) proves `factLedger.js` has no
`require()` of `deepBusinessFacts.js` and that module exports no writer —
genuinely true, and a good structural guarantee. But "contradict" is a
content property, not a write-path property, and there is no code check
anywhere that a proposed `memoryFact`'s domain+topic does not already
have a controlled answer sitting in `deepBusinessFacts.js` under the same
domain. The only thing standing between a worker and contradicting
controlled evidence is the prompt instruction to check the
`DEEP COMPANY BRAIN` block (correctly shown first, per the firewall
test's ordering assertion) before proposing a new fact. That ordering
test is a real and useful guarantee; it is not the same guarantee as "a
generated fact cannot contradict controlled evidence," and the two
should not be conflated when this feature is next described.

**M5 (LOW). `findRelevantFacts` defaults an unset persona to the OWNER,
not to nothing — a fail-open default in a codebase that otherwise
insists on fail-closed.**

`findRelevantFacts(personaId, workerId, message, limit)` filters with
`clearance.isDomainVisible(personaId || clearance.DEFAULT_PERSONA,
workerId, row.domain)`. `clearance.DEFAULT_PERSONA` is `'scott_mercer'`,
the one persona holding `'*'` (every domain). Every current caller
(`contextBuilders.js`'s `buildContext`) already resolves `personaId`
before this function is ever reached, so this fallback is not reachable
today — but it is the wrong direction for a fallback to fail in. The
Workspace's own established convention for this exact shape
(`filterByClearance` with a null `workerId`) is documented and tested to
return nothing, specifically because `workerCanReadDomain(null, ...)` is
false for every domain — fail closed. This function does the opposite:
an empty/undefined persona sees everything. Cheap to fix (default to a
persona that holds nothing, or return `[]` outright when `personaId` is
falsy) and worth fixing before any future caller relies on this
function directly.

**M6 (LOW, documentation precision). CLAUDE.md's new section states "50
tests" for `test/scott/memory/*.test.js`; the real count, run twice on a
fresh database, is 46.** Not a security finding, but this project's own
history (the fifteenth, seventeenth and eighteenth Workspace reviews in
particular) treats an exact number in a governance-adjacent document as
a claim that must be checked, not estimated, so it is recorded rather
than waved through.

## What held under attack, stated plainly

The document's single hardest requirement — "if two simultaneous
requests try to establish the same fact, the system must resolve to one
canonical stored value" — is genuinely met, including against 12
separate OS processes with cold connection pools, the specific shape of
test that has previously found this exact class of defect elsewhere in
this codebase. The refusal path is genuinely code-level: a rejected
`memoryFact` really does rewrite the spoken reply, not just null a
side-channel field, and this is the feature's best-built property.
Ruth cannot create a fact under any input this session could construct
by reading the code: her schema, her prompt and her call path all lack
the mechanism entirely, not merely the intent. Nothing in the diff
touches `lib/workspace`, `server.js`, any view, or any non-`scott_*`
table, confirmed both by the diff stat and by a source-level scan; the
full pre-existing suite (554 tests outside this feature) is unaffected,
and the em-dash house rule holds against the new prompt text.

## What happens next

1. M1 should be corrected — pass `personaId` through and gate on
   `isDomainVisible`, not `workerCanReadDomain` alone — before this
   feature is treated as governed/live authority, per the document's own
   gate ("BOUNDED GOVERNANCE RECHECK REQUIRED BEFORE THIS NEW MEMORY
   BEHAVIOUR IS TREATED AS LIVE AUTHORITY").
2. M2 and M3 are real gaps worth closing in the same pass, though neither
   is a full bypass on its own; M2 in particular should not be described
   as protecting a category it demonstrably does not.
3. M4, M5 and M6 are cheap corrections, none blocking.
4. This candidate has not been through the paid live-AI suite for this
   feature specifically (correctly gated off in this session — no
   `RUN_SCOTT_LIVE_AI`/`ANTHROPIC_API_KEY` was available here). Once M1
   is fixed, a live run exercising exactly the Chloe/Bob-Fletcher/
   marketing-budget scenario above would be the right confirmatory check,
   the same pattern this project used after every other Scott/Workspace
   AI-behaviour change.
5. A confirmatory review, on the corrected head, should re-attack M1
   specifically (a live or scripted call with a persona/worker pair where
   only the worker holds the proposed domain) rather than accept a code
   read of the fix.
