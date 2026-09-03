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
| Consequential permission expansion without approval | None in the released candidate. Three were attempted and caught by review: A1, A2 and A5. |
| A material change designed, implemented and solely validated by the same process | Avoided. Five independent passes; all four of the reviewers' behavioural findings were acted on. |
| Circular AI evidence used as proof | Avoided. Every behavioural claim is backed by a red-then-green test or a measured probe, not by assertion. |
| Cross-project contamination | None. Scott is unreachable from the routing path, measured in a child process; the Scott suite is 411 pass, 0 fail. |
| Website, repository, deployment or production write permissions | None granted. The change is two files, and it is not on `main`. |
| Unnecessary complexity | One structure added: a low-precedence tail. Justified below; it exists to avoid a permission widening, not for elegance. |

One qualification, stated because the criteria table would otherwise
overstate the verdict, and stated at its real width rather than only in
the finance shape four review rounds discussed.

`buildLaneContext` applies NO sensitivity ceiling on the no-lane path and
applies the lane's ceiling on every other. So routing a question into any
of the seven commercial-ceiling tail lanes silently drops every
CONFIDENTIAL record it would otherwise have seen, in any source class.
Finance keeps surfacing because it is granted to a single lane, but it is
not special: a confidential strategy record, in a class every lane reads,
behaves identically. Measured, pinned by test with a positive control,
and recorded here rather than left as a finance footnote.

No lane gained a permission and no human clearance changed. But task
necessity is a permission leg, and routing a question to a lane changes
what it may see, in both directions: wider in subject matter, narrower in
sensitivity.

**The governance plurals were dropped rather than shipped for the related
reason.** Repairing permissions, clearances, audits, rulebooks and stop
decisions into `governance_assurance` would have been the correct owner
of those words, but that lane reads all eight source classes and its
context overflows `MAX_CONTEXT_RECORDS`; `buildLaneContext` truncates with
a blind slice and `listRecords` orders by `source_class` ascending, so the
alphabetically-last classes are dropped. Measured on the real 29-record
snapshot, that lane reaches 28 records against a cap of 24, and "which
clearances exist?" lost `worker_register` entirely, which the general
context keeps. A widening that also truncates the answer is not a repair.
Those five words route exactly as they did at the base, and a test
asserts it. The lanes the tail does route into were measured for the same
hazard, because the distinction has to be a measurement rather than a
preference: the widest reach 23 against the cap of 24. Under it, but by
one record, and the tail now funnels more questions into them, so the
consequence of crossing it is wider than before. Record count is live
data and no unit test can assert it; what can be asserted is the thing
that would push a lane over, a lane gaining a source class, and a test
pins each tail lane's breadth so that widening fails rather than silently
consuming the headroom.

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

### A3. The money guard, and why it was removed rather than fixed again (behavioural, resolved)

A no-lane rule was added to keep money questions in the general context,
which besides `governance_assurance` is the only place `finance` can be
read. Four successive review rounds attacked it. The first found it
ordered above the rules it claimed to sit below. The next three each
found more money words it did not know: revenue, budget, income, price,
expenses, costing, then "how much are the campaigns?", "what did we pay
for", "spent", "fees", "cheapest".

**It was removed, not widened a fifth time.** Matching the shape of a
question by enumeration is an arms race this codebase has already
recorded as unwinnable elsewhere, and the rule was defending a property
that never held: on the base commit "what are our hosting costs?" already
reached `website_hosting`, which holds no finance class. Rules one to
nine have always been able to take a money question away from finance. A
guard covering only the tail implied a protection the router does not
have.

What replaced it is a statement of the real property, pinned by test:
**any question that routes to a lane loses finance unless that lane is
`governance_assurance`.** See A4 for the decision that follows.

### A4. The finance trade, and the decision it needs from Tom (recorded, tested, escalated)

`lanes.js` grants `finance` to `governance_assurance` alone, deliberately
and at least privilege. So the general no-lane context is the only other
route to the banking records, and every question that routes to any other
lane loses them.

This change does not create that trade, but it does ENLARGE it, and an
earlier draft understated that by calling it merely more visible. At the
base only head-keyword phrasings lost finance: "what are our hosting
costs?" did, "what do our servers cost?" did not. The tail plurals bring
the second kind in. Measured: "how much are the campaigns costing us?",
"what did we pay for the domains?" and "what do our servers cost?" all
reached the general context at the base and now route to a lane that
cannot see finance, so Tom gets a gap where he used to get a costed
answer. Each gains that lane's subject matter and loses the banking
record; neither context dominates the other.

**This is the one item that cannot be resolved inside the approved
scope,** and it is escalated rather than worked around. The repair is a
finance lane, or finance granted to more than one lane, and both are
worker-permission changes reserved to Tom. A test asserts finance still
reaches exactly one lane, so the moment either is taken, the notes that
depend on it fail rather than going stale.

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
the base for any question a person would produce, asserted by test. The
only edit to them is the deletion of the `opportunit` stem, which could
not match either real spelling.

**What this did NOT correct, stated because an earlier draft of this
record implied otherwise and contradicted A4.** Moving the repairs to the
tail fixed the pre-emption of later lanes. It did not, and could not,
stop a repaired question from losing finance: "what do our servers cost?"
still moves from the general context to `website_hosting`. That is the
A4 trade, accepted and escalated, not a defect left unfixed here. The
two sections describe different halves of the same measurement and must
be read together. This is the third time in this change that a
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
lane; a regex alternative that could not match either real spelling; an
export nothing read, handing out the live routing table by reference; a
reference to an identifier that existed nowhere; and a system-prompt line telling the model to
answer "from the core authority records only" on the very path now
deliberately used to carry finance.

All corrected. The last of these mattered most: money questions are now
routed to that path on purpose, so the prompt was instructing the model
to ignore the records the change exists to preserve.

---

## Evidence

- **Red-then-green, and mutation-tested.** Of the twenty-four routing tests,
  six were watched failing against the base orchestrator at `533dd5e` and
  passing after. Others were watched failing against the intermediate
  heads that carried the regressions they were written for, which is the
  stronger control: they catch the specific defect, not merely the absence
  of the whole feature.
  The four structural guards were additionally MUTATION-TESTED against
  the exact attacks reviewers used to defeat their predecessors: hoisting
  a tail rule to the top of the table (now fails four tests), adding a
  keyword to a head rule (fails one), rewriting a head rule with the `g`
  flag, which makes `pattern.test()` stateful and routing
  non-deterministic (fails four), and ordering the tail by breadth while
  ignoring the sensitivity ceiling (fails one). A test that has not been
  seen red is not evidence, and a guard that has not been attacked is not
  a guard.
- **Four structural tests, and a guard on the guards.** Example-based
  checks in this very file passed while the property they were named for
  was false, three times. The current set is derived from the real rule
  table rather than hand-listed: one test asserts the probe lists cover
  every rule in the table, so no rule can escape the others; one asserts
  no tail rule can take a question from a lane that already wins it,
  across every head subject by every tail subject; one derives the tail's
  narrowest-first ordering from `lanes.js` rather than restating it; and
  one pins the nine head rules to their exact patterns, because a test
  that only re-runs probes stays green when a keyword is added. Both
  mutations a reviewer used to defeat the previous versions, hoisting a
  tail rule to the top and adding a keyword to a head rule, were run
  against the new set and both are caught.
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
- **Suites.** Measured with `DATABASE_URL` set: workspace 208 tests, 206
  pass, 0 fail, 2 skipped (the two gated suites); Scott 411 pass, 0 fail;
  guards 11 pass, 0 fail. Without a database the workspace suite reports
  fewer tests and one more skip, because three suites gate on it, and the
  repository's 21 pre-existing CRM and erasure failures appear; those are
  identical on `main` and this branch adds none. Scott 411 pass, 0 fail, 0 skipped. Guards
  (`noEmDashes`, `gatedSuites`, `gatedSuiteScan`) 11 pass, 0 fail.

One caution worth recording: a mid-session Postgres outage produced 20
workspace and 56 Scott failures that had nothing to do with the change.
They were diagnosed as infrastructure and the suites re-run clean. A
failing suite is not evidence of a defect until its cause is established.

---

## Recorded for separate work, outside this scope

- **`LANES` is exported live and unfrozen** from `orchestrator.js`, and
  `LANES_BY_ID` shares the same objects, so a caller could push a source
  class onto a lane and widen the lane permission leg process-wide. This
  predates the change (the export is present at `533dd5e`) and is not
  routing, so it was not altered here. It is the same hazard that
  `GENERAL_SOURCE_CLASSES` was frozen against in this change, and it is
  worth its own bounded fix.
- **Five governance words and three head-keyword inflections** remain
  unrepaired: permissions, clearances, audits, rulebooks, stop decisions
  (deliberately, for the truncation reason above), plus "brain indexes",
  "chatgpt recommends" and "deployment".
- **`MAX_CONTEXT_RECORDS` truncates with a blind slice**, dropping the
  alphabetically-last source classes first because `listRecords` orders
  by `source_class` ascending. That is what made the governance repair
  counter-productive, and it will affect any future decision to route
  more questions at a wide lane.

## What is not covered

- **No live model call.** The generation half of Ruth's behaviour is
  unverified here. This sandbox cannot reach the live domain, and a real
  call is Tom's spend.
- **No production verification.** The change is not on `main`.
- **The remaining vocabulary gaps, now named rather than gestured at.**
  Five governance words (permissions, clearances, audits, rulebooks, stop
  decisions) are deliberately unrepaired, for the truncation reason
  above. Two inflections of head keywords still reach no lane, "brain
  indexes" and "chatgpt recommends", and were not repaired because the
  claim being made is that what IS repaired lives in the tail, not that
  the class is exhausted. "deployment" reaches no lane because it is new
  vocabulary rather than an inflection, and adding vocabulary widens which
  questions route. All left for a separate decision.

---

## Verdict

**No STOP condition. No lane permission, human clearance, worker
authority or Scott change. Every behavioural finding across six review
passes was corrected and pinned by a test watched red beforehand.**

**Two items are recorded rather than fixed, and both are Tom's:** the
finance trade in A4, which needs a finance lane or a wider grant; and the
task-necessity widening noted above, where a question naming a
confidential lane's subject now reaches that lane instead of the general
context.

The production merge remains the human gate and is not taken here.
