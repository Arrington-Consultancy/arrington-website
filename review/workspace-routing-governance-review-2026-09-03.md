# Arrington AI Workspace: question routing, independent review record

**Date:** 3 September 2026.

**Change under review:** the opportunity-routing fix and the bounded
routing-quality cleanup that followed it, on branch
`claude/new-session-hbgp04`, against base `533dd5e` (current `main`).

**Scope approved by Tom:** fix the routing defect whereby ordinary
questions about opportunities fail to reach the existing Opportunity
Builder lane; then one bounded routing-quality cleanup covering the known
broken keyword cases and the finance-routing consequence. Explicitly
excluded: widening worker permissions, source classes, sensitivity
ceilings, human clearance rules, worker authority or Scott behaviour. The
stale `claude-3-5-sonnet-20241022` predeploy diagnostic is separate
technical housekeeping and is untouched.

---

## What independence this record does and does not claim

This is not the Drive-resident ARRINGTON GOVERNANCE & ASSURANCE worker,
and it does not award that worker's PASS. Nobody should read it as one.

What it is: five independent review passes, each run in a forked
execution with its own context, each of which inspected the candidate
without having built it, and each of which was given the opportunity to
attack the change rather than confirm it. The builder did not grade
itself: every finding below was raised by a reviewer, and every one was
either corrected or recorded with a reason.

The gap that remains is the one the governance chain exists to close: an
independent human-directed lane confirming the change against the
controlled authorities. That gate is still open and is Tom's to route.

---

## Governance criteria applied

Taken from the ARRINGTON AI GOVERNANCE & ASSURANCE handoff's own STOP
rule and risk annex.

| Criterion | Finding |
|---|---|
| AI changing its own authority, scope or permissions | None. No worker specification, permission map or clearance rule is touched by this change. |
| Consequential permission expansion without approval | None in the released candidate. One was attempted and caught: see A2 below. |
| A material change designed, implemented and solely validated by the same process | Avoided. Five independent passes; all four of the reviewers' behavioural findings were acted on. |
| Circular AI evidence used as proof | Avoided. Every behavioural claim is backed by a red-then-green test or a measured probe, not by assertion. |
| Cross-project contamination | None. Scott is unreachable from the routing path, measured in a child process; the Scott suite is 411 pass, 0 fail. |
| Website, repository, deployment or production write permissions | None granted. The change is two files, and it is not on `main`. |
| Unnecessary complexity | One structure added: a low-precedence tail. Justified below; it exists to avoid a permission widening, not for elegance. |

**No STOP condition identified.** No breach of the Constitution, the
human approval boundary, or the effective-context rule.

---

## The findings, and what happened to each

Reviewers raised fifteen findings across six passes. Six were
behavioural; the rest were statements that outran the code, which is the
defect class this chain has recorded repeatedly.

### A1. The first fix widened the task-necessity leg (behavioural, corrected)

The obvious repair was to fix the dead stem in place, in rule three. A
reviewer measured that this pre-empted five later lanes, all capped at
`commercial`, with a lane capped at `confidential`. "Draft a LinkedIn
post about the opportunities we won" left `social_content_builder` for
`opportunity_builder` and gained both confidential opportunity records.

Human clearance still gated the result, so no unauthorised human could
read them. But the control pack's rule is human clearance AND lane
permission AND task necessity, narrowest wins, and task necessity is a
permission leg in its own right. Widening it is a permission change.

**Corrected** by moving the word to a low-precedence tail, where it can
only claim a question no other lane wanted. This is the reason the tail
exists.

### A2. The same trap, one layer along (behavioural, corrected)

The cleanup then had to repair the same inflection defect in all nine
rules. Repairing the two confidential-ceiling lanes in place would have
reproduced A1 exactly, for new phrasings, so their plurals were put in
the tail.

At this stage the seven commercial-ceiling lanes were still fixed in
place, on the reasoning that a lane which cannot reach `confidential`
cannot leak by winning earlier. **That half was later reverted: see A5.**
In the released candidate every inflection repair is in the tail.

The cost is a real inconsistency: singular and plural now sit on
different precedence. That is the safe direction, and resolving it means
moving live behaviour, which is its own decision.

### A3. The money rule was ordered wrongly against its own comment (behavioural, corrected)

The no-lane money rule was placed above the tail lane rules while its
comment said it sat below. A reviewer showed "show me the audits of our
spending" reaching no lane, while the singular reached
`governance_assurance`.

**Corrected** by ordering the tail on a stated principle rather than by
habit: **do not route a money question into a lane that cannot see
finance.** `lanes.js` grants `finance` to `governance_assurance` alone,
so that lane sits above the money rule and the opportunity tail below it.

### A4. A trade that was half-documented (recorded, both halves now tested)

A question naming money AND opportunities keeps finance and loses the
opportunity records, because the general context has no `opportunity`
source class. Neither context dominates the other.

**Not fixed, and deliberately so.** The correct repair is a finance lane,
or finance granted to more than one lane. Both are worker-permission
changes reserved to Tom. Both halves of the trade are now pinned by test
so it cannot drift unnoticed.

### A5. The in-place plural repair defeated the money rule and pre-empted lanes (behavioural, corrected)

The cleanup first repaired the seven commercial-ceiling lanes in place,
reasoning that a lane which cannot reach `confidential` cannot leak by
winning a question earlier. That reasoning was wrong twice over, and a
reviewer measured both:

1. It defeated the money rule. "What do our servers cost?" moved from the
   general context to `website_hosting`, which holds no finance class, so
   the banking record stopped reaching the prompt for a cost question.
   The money rule is only sound as a tail-only device if the rules above
   it genuinely do not change, and the comment asserting they were
   untouched was false of that very diff.
2. It pre-empted later lanes anyway. "Draft a LinkedIn post about our
   campaigns" left `social_content_builder` for `google_ads`, which reads
   more source classes. Task necessity is a permission leg whatever the
   ceiling, so widening it at `commercial` is still widening it.

**Corrected** by making the treatment uniform: every inflection repair
now lives in the tail, and rules one to nine route exactly as they did at
the base, asserted by test. The only edit to them is the deletion of one
provably dead alternative that could never match. This is the third time in this change that a
plausible local repair turned out to widen the task-necessity leg, and
the pattern is worth keeping: in a first-match-wins router, moving a word
earlier is a permission decision, not a formatting one.

### A6. A live, mutable export (behavioural, corrected)

`GENERAL_SOURCE_CLASSES` was exported unfrozen. A reviewer pushed
`'opportunity'` onto it and the confidential opportunity record appeared
in the no-lane context process-wide. That is the exact hazard the
adjacent comment cites as the reason `ROUTING_RULES` is withheld.
Frozen, with a test.

### A7 to A15. Statements that outran the code (all corrected)

Seven findings were claims in comments or test names that were not true
of the code beneath them, including a test named "no other lane changed
where it routes" that passed while that was false; a claim that
`opportunity_builder` was the only confidential lane, when
`governance_assurance` is too; a claim that finance was granted to no
lane; an unreachable regex alternative; an export nothing read, handing
out the live routing table by reference; a reference to an identifier
that existed nowhere; and a system-prompt line telling the model to
answer "from the core authority records only" on the very path now
deliberately used to carry finance.

All corrected. The last of these mattered most: money questions are now
routed to that path on purpose, so the prompt was instructing the model
to ignore the records the change exists to preserve.

---

## Evidence

- **Red-then-green, against two heads.** Six of the eighteen routing
  tests were watched failing against the base orchestrator at `533dd5e`
  and passing after. Three of them were additionally watched failing
  against the intermediate head that carried the A5 and A6 regressions,
  which is the stronger control: they catch the specific defect they were
  written for, not merely the absence of the whole feature. A test that
  has not been seen red is not evidence.
- **Two structural tests, not example-based.** Example-based checks in
  this very file passed while the property they were named for was false,
  twice. One test now asserts that no tail rule can take a question from
  a lane that already wins it, over every combination of seven earlier
  subjects and six tail subjects. The other pins that `finance` reaches
  exactly one lane, so a future "fix" that hands it to another fails.
- **Context, not lane ids.** The clearance and finance tests assert the
  records that actually reach the prompt. The clearance case carries a
  positive control, per this project's rule that a test asserting only
  absence passes against a system showing nobody anything.
- **Scott.** Unreachable from the routing path, measured in a child
  process that requires the orchestrator and nothing else. Reading the
  test process's own `require.cache` was rejected as proving nothing
  under per-file isolation and failing spuriously under a shared one.
- **Rules one to nine unchanged in behaviour, proved rather than
  asserted.** A behavioural test pins that every subject reaching a lane
  before still reaches the same lane. The one textual edit is the
  deletion of the dead `opportunit` stem, which could never match and
  whose presence invited someone to trust that rule, delete the tail
  entry, and silently reinstate the original defect.
- **Suites.** Workspace 202 tests, 200 pass, 0 fail, 2 skipped (the two
  gated suites). Scott 411 pass, 0 fail, 0 skipped. Guards
  (`noEmDashes`, `gatedSuites`, `gatedSuiteScan`) 11 pass, 0 fail.

One caution worth recording: a mid-session Postgres outage produced 20
workspace and 56 Scott failures that had nothing to do with the change.
They were diagnosed as infrastructure and the suites re-run clean. A
failing suite is not evidence of a defect until its cause is established.

---

## What is not covered

- **No live model call.** The generation half of Ruth's behaviour is
  unverified here. This sandbox cannot reach the live domain, and a real
  call is Tom's spend.
- **No production verification.** The change is not on `main`.
- **The remaining vocabulary gaps.** "deployment" still reaches no lane,
  because it is a new keyword rather than an inflection, and adding
  vocabulary widens which questions route. Left for a separate decision.

---

## Verdict

**No STOP condition. No permission, clearance, authority or Scott change.
All four behavioural findings corrected and pinned; the one trade that
cannot be resolved inside this scope is recorded with both halves under
test and routed to Tom.**

The production merge remains the human gate and is not taken here.
