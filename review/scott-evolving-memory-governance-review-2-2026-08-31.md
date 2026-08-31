# Scott Evolving Fictional Business Memory: Governance & Assurance Review 2

Date: 31 August 2026
Branch reviewed: `feature/scott-evolving-memory`, head `12456c4`
("Remediate governance review 1 findings (M1 HIGH, M2/M3 MEDIUM, M4/M5/M6
LOW)"), one commit ahead of the first review's reviewed head `d650e21`.
Protocol: confirmatory pass, commissioned per review 1's own "what happens
next" item 5 — "a confirmatory review, on the corrected head, should
re-attack M1 specifically ... rather than accept a code read of the fix."
Review 1 (`review/scott-evolving-memory-governance-review-1-2026-08-31.md`)
was read in full before writing a line of this file, and is treated as
authoritative on what M1-M6 originally were; this file does not restate
them except where re-attacking them.

## VERDICT: PASS, two new LOW findings (N1, N2)

No HIGH and no MEDIUM. All three substantive findings from review 1 (M1
HIGH, M2 and M3 MEDIUM) are independently re-verified as genuinely fixed,
by running code against a real database and a fake Anthropic client, not
by reading the diff and trusting the commit message. M4 and M6 are
confirmed as the wording-only corrections they claim to be. M5 is fixed
exactly as claimed **for the pure function in isolation**, but re-attacking
it against the one real call path that has a genuinely unset persona found
that the fix's own stated effect ("an unset persona now sees nothing")
does not hold there, for a reason the fix's own comment does not
anticipate (N2). A second new finding (N1) is a false-positive side effect
of the M2 widening. Both are LOW: neither is a "narrowest wins" violation
against an actual logged-in human (the shape every HIGH finding in this
project's history has been), and both fail in the safe direction (more
refusal, or visibility no wider than what the rest of this exact code path
already grants everywhere else). Consistent with this project's own
convention for a confirmatory pass that finds only LOW issues (see the
Workspace's sixteenth, seventeenth and eighteenth reviews), this is a PASS,
not an AMBER held open for cosmetic points.

## Independence

Conducted by a session with no role in writing the candidate or its
remediation, reading only the branch, review 1's file, and this project's
own house conventions (CLAUDE.md's many "governance review" sections,
read for severity/verdict style before writing this one). No code was
changed; this file is the only addition made to the branch by this
review.

## Scope confirmed — against the merge-base, not `main`'s current tip

`main` has moved on since review 1 (it is now at `22e0b96`, an unrelated
error-handling fix). A naive `git diff main feature/scott-evolving-memory`
therefore shows `server.js` and `test/errorHandlerMessage.test.js` as
"different" — that is `main` having advanced past the fork point, not the
feature branch reaching outside its area. Redone against the actual
merge-base (`d52e6f8`, confirmed via `git merge-base main
feature/scott-evolving-memory`):

```
git diff d52e6f8 feature/scott-evolving-memory --stat
```

14 files: `CLAUDE.md`, `db/schema.sql`, `db/seed.js`,
`lib/scott/data/contextBuilders.js`, `lib/scott/governance.js`,
`lib/scott/memory/driveExport.js`, `lib/scott/memory/factLedger.js`,
`lib/scott/orchestrator.js`, the review 1 file,
`scripts/exportScottMemoryLedger.js`, and four test files. Nothing in
`lib/workspace`, `server.js`, `views/`, or `routes/` outside the Scott
area — matching review 1's own confirmation, now re-confirmed against the
current state of `main` rather than trusting that review 1's confirmation
still applies. `db/schema.sql`'s only new table is `scott_memory_facts`
(read in full); no other table is touched.

`git branch --contains feature/scott-evolving-memory` lists only itself.
Not merged to `main`, not on any deploy branch.

The remediation commit itself (`d650e21`..`12456c4`) touches exactly five
files: `CLAUDE.md`, `lib/scott/memory/factLedger.js`,
`lib/scott/orchestrator.js`, and two test files. `lib/scott/clearance.js`
is untouched by either commit in this feature — every clearance primitive
called (`personaCanSeeDomain`, `workerCanReadDomain`, `isDomainVisible`,
`DEFAULT_PERSONA`, `isValidPersona`) was read directly in `clearance.js`
to confirm what it actually does, not assumed from review 1's or the
remediation's description of it.

## Executed evidence

- `test/scott/memory/*.test.js` alone: **60 tests, 60 pass, 0 fail** — the
  count CLAUDE.md now claims, confirmed by actually running it, not by
  trusting the file header.
- Full suite, `node --test` (Node's own recursive directory scan, which
  reaches `test/scott/memory/*.test.js` correctly — the exact class of
  bug review 1 found in a non-globstar `test/**/*.test.js` shell glob):
  **618 tests, 616 pass, 0 fail, 2 skipped**, run against a freshly
  seeded local Postgres 16 database (`node db/seed.js` run first; the
  `scott_memory_facts` table and its partial unique index were created
  correctly). This matches the number implied by review 1's own 602-total
  count minus the pre-fix 46 memory tests plus the post-fix 60
  (602 − 46 + 60 = 616), so the two counts corroborate each other
  independently rather than one simply being asserted. No unexpected
  skips — the two skipped suites are the paid live-AI suites, correctly
  gated, matching every other Scott/Workspace cycle in this file.
- Five standalone scripts (not the builder's own tests — separate files,
  written by this review, calling `classifyReasonableness`,
  `findRelevantFacts`, `matchedReservedTopic`, `buildContext` and
  `callWorker` directly against the real database and a fake Anthropic
  client) are described inline below as each finding is re-attacked.

## M1 (HIGH) re-attack: all four worker/persona combinations, across all three eligible domains, plus edge cases the builder's own tests don't cover

Review 1's exact scenario, reproduced with my own script rather than the
builder's test file: `classifyReasonableness({ workerId:
'customers_marketing', personaId: 'chloe_reed', domain:
'marketing_performance', ... })` → `{ allowed: false, reason:
'persona_not_authorised_for_domain' }`. Confirmed.

Then widened beyond what either the reviewer's or the builder's own tests
exercise — all four combinations of (worker holds domain / worker does
not) × (persona holds domain / persona does not), independently for
**all three** `ALLOWED_MEMORY_DOMAINS`, not only `marketing_performance`:

| Domain | Worker | Persona | Worker holds? | Persona holds? | Result |
|---|---|---|---|---|---|
| marketing_performance | customers_marketing | chloe_reed | yes | **no** | refused (persona) |
| marketing_performance | customers_marketing | tony_marsh | yes | yes | **allowed** |
| marketing_performance | operations | tony_marsh | **no** | yes | refused (worker) |
| marketing_performance | operations | chloe_reed | no | no | refused (worker) |
| marketing_performance | commercial | chloe_reed | yes | **no** | refused (persona) — second worker holding the domain, same result |
| materials | operations | mike_evans | yes | **no** | refused (persona) |
| materials | operations | ellie_park | yes | yes | **allowed** |
| suppliers_ops | operations | chloe_reed | yes | **no** | refused (persona) |
| suppliers_ops | operations | tony_marsh | yes | yes | **allowed** |

All nine results are exactly as the "narrowest wins" rule requires. The
positive cases (worker-yes/persona-yes) confirm the fix does not
overcorrect — a real concern the task brief for this review raised
explicitly, and one review 1's own tests only checked for
`marketing_performance`.

**Missing-persona fail-closed, all three falsy spellings:**
`classifyReasonableness` with `personaId` of `''`, `null` and `undefined`
each independently produced `{ allowed: false, reason:
'persona_not_authorised_for_domain' }`. The builder's own regression test
only exercises the case of `personaId` omitted from the call entirely
(equivalent to `undefined`); this review additionally confirmed `''` and
explicit `null` both refuse identically, because the guard is `if
(!personaId || ...)`, which is falsy-safe by construction rather than by
having enumerated every falsy value.

**End to end through `callWorker`, with a fake Anthropic client scripted
to misbehave exactly as review 1 worried a real model might:** Chloe
Reed asks Bob Fletcher (`customers_marketing`) an ordinary marketing
question; the fake model ignores every instruction and proposes a
`marketing_performance` fact with a fabricated figure (`£275 a month`)
anyway. Result: `memoryFact.established === false`,
`refusedReason === 'persona_not_authorised_for_domain'`, the spoken reply
does not contain `275` anywhere, and no row was written to
`scott_memory_facts` (checked directly against the table, not inferred
from the return value). The same worker/domain pair asked by Tony Marsh
(who holds the domain) in a second call succeeds normally — established,
newly created, the model's genuine answer spoken. This is the exact
scenario review 1 named and asked to be re-attacked rather than
code-read; it is now proven false to two independent probes (mine and
the builder's own), not one.

**A path this review checked that neither review 1 nor the builder's
tests exercise: a garbage-but-truthy `personaId`.** `''`, `null` and
`undefined` are all refused by the explicit `!personaId` check. A string
that is not one of the eight real persona ids (e.g. `'not_a_real_persona'`)
is **not** caught by that check, and falls through to
`clearance.personaCanSeeDomain`, which (via `clearance.js`'s own
pre-existing `personaDomains()`) treats any unrecognised id as the
default owner persona (`scott_mercer`, `'*'`) — so
`classifyReasonableness` with a garbage persona id **allows** fact
creation. This is not a new defect in this diff: it is `clearance.js`'s
own pre-existing behaviour, `clearance.js` is not part of either commit
in this feature, and the M1 fix's own code comment already discloses it
explicitly ("clearance.personaCanSeeDomain itself still falls back to the
owner for a garbage-but-non-empty persona id — that is a separate,
pre-existing, documented gap in clearance.js, not touched here"). Traced
to confirm it is genuinely unreachable in production: every real caller
of `establishFact` sources `personaId` from
`clearance.getEffectivePersonaId(req)`, which only ever returns one of
the eight real persona ids, `'mike_evans'` (its own fail-closed default)
or is coerced to `''` before reaching the gate — never an arbitrary
string — and the one endpoint that accepts a persona id from a request
body (`POST /api/scott/impersonate`) validates it with
`clearance.isValidPersona()` before it can ever reach a session, so a
garbage value is rejected there and never propagates. Recorded here as
confirmation, not as a finding: the disclosure is accurate and the path
is dead.

**M1 verdict: genuinely and thoroughly fixed.** This is the review's
central question and it holds up under materially more pressure than
either review 1 or the builder's own tests applied.

## M2 (MEDIUM) re-attack: the exact 8 probes, five new rephrasings of my own, and a false-positive sweep

**All 8 of review 1's original evading probes are now caught.** Ran
`matchedReservedTopic()` directly against all eight verbatim strings from
review 1's file; every one now returns a non-null match
(`predictive_future` ×2, `signed_contracts` ×2,
`consequential_customer_promise` ×2, `external_platform_activity` ×2).
Confirms the remediation closed exactly the gap it was built to close.

**New rephrasings of my own, in the same four widened categories, mostly
still evade:**

```
EVADED :: what is the deal we have worked out with the timber yard        (signed_contracts, no listed word)
EVADED :: do we sometimes let loyal customers off a bit of the bill       (consequential_customer_promise, no listed word)
EVADED :: what percentage of people who see a post actually message us   (external_platform_activity, no listed word)
EVADED :: how much does our glue cost tend to creep up by each year      (predictive_future, no listed word)
CAUGHT  :: what do we usually charge next season for the same job        (predictive_future — "next season" is on the widened list)
```

This is not a new defect: it is exactly the residual limitation review 1
and the remediation's own code comment already state plainly — "a
sufficiently creative rephrasing can still evade it" and "not a semantic
guarantee against every future rephrasing." The remediation closed the
eight specific gaps demonstrated; it was never going to close the
category of gap (a fixed keyword list matched against unbounded English).
Confirming this independently matters because it is the difference
between "the fix is honest about its own limits" (true, checked here) and
"the fix quietly oversold what it closed" (not true — the wording in both
the code comment and CLAUDE.md is precise about this).

**Other reserved categories the M2 fix did not touch** (tax, inspections,
insurance, personal data, quality results) evade equally easily under
rephrasing, as expected — these were never part of M2's claim and remain
exactly as heuristic as they always were.

**False-positive sweep on ordinary eligible-domain questions:** eight
ordinary low-consequence questions across all three domains (yarn colour,
usual button supplier, glue brand, boosted-post cadence, a typical week,
usual wool order quantity, courier reliability, delivery timing) — **zero**
false positives. The widened patterns did not become noisy on plainly
ordinary phrasing.

**N1 (LOW, new): the widened `signed_contracts` pattern over-refuses some
ordinary, non-contract uses of "contract"/"agreement"/"arrangement".**
The pre-fix pattern required the literal phrase "signed
contract"/"signed agreement". The fix (correctly, per its own stated
reasoning) widened it to match the bare words `contract`, `agreement` or
`arrangement` anywhere, since the reviewer's probes named a genuine
supplier commitment without ever using "signed". That widening also now
catches ordinary sentences that use the same words in an unrelated,
low-consequence sense:

```
MATCHED (arguably wrongly) :: is our contract cleaner coming this week
MATCHED (arguably wrongly) :: what arrangement do we have for who opens up on Mondays
MATCHED (arguably wrongly) :: is there an informal arrangement about who covers holidays
MATCHED (arguably wrongly) :: do we have a rough agreement about how orders get split between the two of you
```

None of these are about an actual supplier/customer contract — they are
staff-rota and workflow questions of exactly the "genuinely ordinary,
low-consequence operating fact" shape the feature exists to allow, and
under the current pattern they are refused as a reserved topic instead.
This fails in the safe direction (the visitor gets "not held" rather than
a fabrication), so it is not a security finding, and it is a
narrower/different problem than M2 (which was about false negatives,
matching nothing). It is worth recording because it is precisely the
failure mode the task brief for this review asked to be checked for — "a
heuristic that got wide enough to refuse everything" — and because a
future widening pass aimed only at closing more false negatives could
make this worse without anyone measuring it. **Not blocking**: it reduces
the feature's usefulness on a narrow slice of phrasing, it does not
create a fabrication or a clearance leak, and the ordinary-question sweep
above shows it is not yet common. Worth a future pass narrowing the
pattern to a commercial-commitment sense (e.g. requiring a supplier/
customer/company-object nearby) rather than a bare word match, but that
is a refinement, not a defect to gate a release on.

## M3 (MEDIUM) re-attack: drift correction, proven end to end, and the code path checked for gaps

Built an independent `callWorker` scenario with a fake client scripted to
drift: Tony Marsh establishes a `suppliers_ops` fact ("Newton Abbot
Timber and Finishes"); a second call for the same canonical question
(this time from Scott Mercer, who also holds the domain — a positive
case the builder's own test does not use, since their M3 test reuses the
same persona for both calls) is scripted to reply with a different
supplier name ("Devon Timber Supplies") and to propose that drifted text
as the `memoryFact.answer`. Result: `wasNewlyCreated === false`, and the
**returned `reply` field equals the original canonical stored answer
exactly**, character for character — the drifted text does not appear
anywhere in the result. The stored row is unchanged (still the original
answer, still exactly one row).

**Checked for the specific gap named in the task brief — a code path
where `data.memoryFact` is truthy but the correction is silently
skipped.** Read `callWorker`'s post-model block in full: it is a single
`if (data.memoryFact) { const outcome = await establishFact(...); if
(outcome.ok) { if (!outcome.created) { <correct reply> } ... } else {
<refuse and correct reply> } }`. Every branch of `outcome.ok` is
exhaustively handled (`true`/`false`), and within the true branch every
value of `outcome.created` is exhaustively handled (`true`/`false`).
There is no field-name mismatch after the refactor (`outcome.fact.answer`
is read consistently in both the correction and the `memoryFact` spread
that follows it) and no branch that leaves `data.memoryFact` truthy
without either persisting-and-leaving-the-genuine-reply or
correcting-the-reply. The only way `data.memoryFact` could reach a
caller uncorrected is if `establishFact` itself throws before returning —
an availability failure (the whole turn fails with a technical-problem
reply, the same as any other DB error on this codebase), not a
content-correctness gap, and not new to this diff.

**M3 verdict: genuinely fixed, and the fix is structurally exhaustive,**
not merely correct for the one case tested.

## M4 and M6: confirmed wording-only

`git diff d650e21 12456c4 -- lib/scott/memory/factLedger.js
lib/scott/orchestrator.js` was read in full (reproduced above under M1-M3);
M4's correction is a comment/CLAUDE.md-only change (no code diff touches
the firewall test's assertions or `factLedger.js`'s actual behaviour
around `deepBusinessFacts.js`), and M6's correction is the CLAUDE.md test
count only. Neither introduces or removes any runtime behaviour. The new
count (60) was independently confirmed by running the suite, not by
reading the claim (see Executed evidence above).

## M5 (LOW) re-attack: the pure function is fixed; the one real call path that could exercise it is not what the fix's own claim describes

**The pure-function fix is real and correctly tested.** Called
`findRelevantFacts` directly with `''`, `null` and `undefined` — all
three return `[]`. The builder's own test only checks `''` and
`undefined`; this review additionally confirmed explicit `null`.

**Re-attacking it the way this review's brief asked (checking whether
the property is exercised by the real call path, not only by a direct
call) found that it is not, and for a reason worth stating precisely.**
There is exactly one production caller of `findRelevantFacts`:
`formatMemoryFactsBlock(persona, workerId, message)` in
`lib/scott/data/contextBuilders.js`, called from `buildContext`. Reading
`buildContext` (untouched by either commit in this feature, so this is
pre-existing, documented code) shows:

```js
// Defaults to Scott Mercer (full clearance) when no persona is threaded
// through — preserves exact v0.1 behaviour for any caller that predates
// this parameter (the public lead form's fire-and-forget draft, and
// existing tests) ...
const persona = personaId || clearance.DEFAULT_PERSONA;
...
blocks.push(await formatMemoryFactsBlock(persona, workerId, message));
```

`buildContext` resolves a falsy `personaId` to the owner persona **before**
`formatMemoryFactsBlock`/`findRelevantFacts` is ever called. So the one
real scenario with a genuinely unset persona — the anonymous public lead
enquiry's fire-and-forget AI draft
(`routes/scott.js`, `runScottTurnAndPersist({ conversation,
conversationId: conversation.id, userMessage: message })`, called with no
`personaId` key at all) — never actually reaches `findRelevantFacts` with
a falsy value. It reaches it with `'scott_mercer'`, a valid, truthy,
full-clearance persona id, supplied by a completely separate, pre-existing
fallback one level up the call stack.

**Verified this concretely rather than reasoning about it from the code
alone.** Established a `marketing_performance` fact as Tony Marsh, then
called `buildContext('customers_marketing', { message, entities: {},
personaId: undefined })` — exactly the anonymous lead-draft shape. The
fact **is** surfaced in the `PREVIOUSLY ESTABLISHED FICTIONAL COMPANY
MEMORY` block handed to the worker's prompt, answer text and all. A
control call with `personaId: 'chloe_reed'` (a real persona who is
explicitly denied the domain) correctly does **not** surface it —
confirming the gap is specific to the unset-persona case, not a general
leak in `findRelevantFacts` itself.

**This means M5's own stated effect — "an unset persona now sees
nothing" — is not true of the one real scenario that has an unset
persona.** In practice, that scenario gets the owner's full view into
existing memory facts (still intersected with the routed worker's own
domain permission — `customers_marketing` still has to hold the domain
for anything to show at all), not "nothing." The remediation's comment
attributes the fix's unreachability to `clearance.getEffectivePersonaId`
never returning falsy, which is true but is not the reason this
particular call site never sees a falsy value — that call site never
uses `getEffectivePersonaId` at all, and the actual reason is
`buildContext`'s own separate default. A test asserting the pure
function's property in isolation cannot, by itself, establish that the
property holds for the real integration point — the same class of gap
this project's Workspace history has repeatedly needed a confirmatory
review to catch (see e.g. Workspace L1: "the mechanism added to make the
property true had never once run" and the working rule adopted from
it — "assert the BRANCH, not just the outcome").

**Bounded, and confirmed to be bounded, before calling this LOW rather
than MEDIUM or HIGH.** Re-ran the identical anonymous-persona scenario
through `callWorker` (fake client, memoryFact **creation** this time, not
retrieval): the fabricated figure is refused, nothing is persisted, and
the spoken reply does not contain it — M1's creation-time gate uses the
raw `personaId` parameter of `callWorker` (converted to `''` before the
gate, never routed through `buildContext`'s default), so it is entirely
unaffected by this gap. This gap is retrieval-only, applies only to the
one anonymous no-login context, mirrors — rather than departs from — the
exact same pre-existing, deliberate, documented fallback every other
piece of deep-brain context data already gets on this identical path
(the comment says so explicitly: "preserves exact v0.1 behaviour"), and
the AI-drafted reply this context feeds into still requires a human's
approval before anything reaches an actual customer, per this codebase's
existing structural governance rule for that exact worker/route. Nobody
with a real, narrower clearance is being shown something their clearance
denies — the scenario has no logged-in human being under- or over-served,
only an internal drafting mechanism whose output is already gated
downstream. Recording this as **N2 (LOW)**.

## New findings

**N1 (LOW).** The M2 widening of the `signed_contracts` pattern to match
bare `contract`/`agreement`/`arrangement` closes the reviewer's eight
probes but also refuses some ordinary, non-contract, low-consequence
questions that happen to use those words in a staff-rota/workflow sense
(see examples above). Fails safe (over-refusal, not fabrication or
leakage); worth a future narrowing pass, not blocking.

**N2 (LOW).** M5's fix is correct and tested for the pure
`findRelevantFacts` function in isolation, but the one real call path
that has a genuinely unset `personaId` (the anonymous public lead-enquiry
auto-draft) never reaches it with a falsy value, because
`buildContext`'s own separate, pre-existing `personaId ||
clearance.DEFAULT_PERSONA` fallback resolves it to the owner one level
higher in the call stack. In practice, that scenario retrieves existing
memory facts at owner-level visibility (bounded by the routed worker's
own domain permission), not "nothing," contradicting the fix's own
stated claim for the scenario that most naturally motivates it.
Creation-time (M1) is unaffected and independently confirmed to still
refuse correctly in this exact scenario. Not a new departure from
existing behaviour elsewhere in this codebase, and not reachable by any
logged-in human with narrower clearance being shown something denied to
them; the downstream human-approval gate on this worker's drafts still
applies. Worth a future fix — either have `formatMemoryFactsBlock`/
`findRelevantFacts` treat `clearance.DEFAULT_PERSONA` no differently from
any other persona for the "originally unset" case (i.e. accept the
current behaviour and correct the claim rather than the code), or thread
the pre-default `personaId` through to `findRelevantFacts` so it can make
its own fail-closed decision independently of `buildContext`'s fallback.
Either is a small, well-scoped change; recorded rather than fixed here,
per this review's remit.

## What held under attack, stated plainly

The atomic first-write-wins guarantee is untouched by this remediation
(neither `db/schema.sql` nor `createFactAtomic` appear in the
`d650e21`..`12456c4` diff), so review 1's 12-separate-process evidence for
it still applies without needing to be redone in full. A lighter
in-process sanity check (25 concurrent `establishFact` calls for the same
question) was re-run here regardless: exactly one row, one canonical
answer, one fact id, agreed by all 25 callers. The reserved-topic gate,
the domain allowlist, and the newly-added persona leg all continued to
refuse correctly under every combination and edge case this review threw
at them beyond what either review 1 or the builder's own tests checked.
Ruth's structural inability to propose a `memoryFact` is unaffected by
this diff (her schema and prompt are untouched by the remediation
commit). Nothing in the diff touches `lib/workspace`, `server.js`, any
view, or any non-`scott_*` table, reconfirmed against the actual
merge-base rather than `main`'s current (moved) tip.

## What happens next

1. No blocking action required before this feature is treated as
   governed/live authority on the strength of this review — M1, M2 and
   M3 are genuinely fixed and independently re-verified; M4 and M6 are
   accurate; M5 is fixed for the pure function and the practical gap it
   leaves (N2) is low-severity and bounded, not a live vulnerability.
2. N1 and N2 are both cheap, well-scoped corrections for a later ordinary
   commit, not a reason to withhold the PASS — consistent with this
   project's own precedent (the Workspace's eighteenth review reached the
   same conclusion for its own Y1/Y2).
3. If a future session widens `RESERVED_TOPIC_PATTERNS` further to close
   more of M2's residual gap, re-run the false-positive sweep in this
   file (or a larger one) at the same time — N1 is exactly the failure
   mode that kind of change would make worse without anyone measuring it.
4. This candidate has still not been through the paid live-AI suite for
   this feature (correctly gated off in this session, same as review 1) —
   unchanged advice from review 1's own item 4.
