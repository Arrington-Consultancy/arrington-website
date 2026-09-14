# Scott AI Demonstration: autonomous evolution of the fictional company brain

Governance submission, 13 September 2026. Builder: the Claude Code session on Tom's instruction of 13 September 2026.

> **STATUS CORRECTION, 14 September 2026.** The line below originally read
> "built on branch `claude/new-session-hbgp04-scott-evolution`, not merged;
> production merge is Tom's gate." **That gate has since been passed: Tom
> approved the merge on 14 September 2026, and the change is merged,
> deployed and live on production.** Everything from here to the
> "Post-merge record" heading at the end of this document is the PRE-MERGE
> PROPOSAL, preserved unaltered as the record of what was put to Tom and
> what he approved. It is not a description of a pending decision and must
> not be read as one. The merge and deployment evidence, and the request
> for independent review, are appended at the end.
>
> **This document does not reopen the decision to make Scott autonomous.**
> That decision is Tom's, it is made, and the independent review requested
> below is a review of the implementation and its boundary as shipped, not
> a re-examination of whether the fictional company should evolve.

Status at the time of writing: built on branch `claude/new-session-hbgp04-scott-evolution`, not merged; production merge is Tom's gate.

## Tom's instruction (verbatim, 13 September 2026)

"Scott is supposed to be a playable fictional company that evolves on its own while remaining internally consistent. Having facts sit waiting for me to approve defeats that. Redesign this so Scott autonomously accepts plausible new fictional facts when they pass the consistency, plausibility and financial checks. If something conflicts with established Scott evidence, resolve it automatically where there is a safe deterministic answer, otherwise reject it rather than waiting indefinitely for me. The evolution briefing should be oversight, not an approval queue. Show me meaningful things Scott learned, material changes to the fictional company and anything the system rejected because it could not reconcile it. Only escalate to me if there is a genuine system-level problem that cannot safely be resolved automatically. The hard boundary remains: this autonomy applies only inside the fictional Scott demo. It must never alter real Arrington records, permissions or actions."

## What changes in authority

Before: a worker could propose a fact; code admitted it only when the checks found nothing at all; anything the checks flagged waited indefinitely for Tom. After: every proposal is settled by code at the moment it is made, into one of three terminal outcomes. A person's role moves from approval beforehand to oversight afterwards (the briefing, and retraction). This is a widening of what the fictional workers change without a person, and it is recorded as one.

## The rule (deterministic, pure, tested)

`lib/scott/brainCandidates.js` `settleCandidate`:

| Finding | Outcome | Rule |
|---|---|---|
| Nothing flagged | admit | clean |
| Identical restatement of a held fact | redundant (nothing added) | already_held |
| Contradicts a held record, an authored record or an earlier estimate | reject | earlier_fact_stands: the fact the company already holds wins, always |
| Second proposal racing for the same key | reject | earlier_fact_stands |
| Unknown clearance domain | reject | could not be access-controlled |
| Amount negative, or more than twice annual turnover, or size not checkable | reject | plausibility |
| Empty value, or no source named | reject | provenance |
| Estimate with no stated basis | reject | assertion, not an estimate |
| Unknown entity, register slip | admit, flags kept | cosmetic drift is the fiction growing |
| SCOTT_BRAIN_AUTOFILL not exactly `true` | reject | evolution off (kill switch, unchanged) |

There is no outcome that waits for a person and no automatic path that overwrites a held fact. Resolution of a conflict is always "the earlier fact stands"; the briefing shows the rejection and the reason, and a person can retract the earlier fact if it is the wrong one.

## Oversight

`/scott/gaps` (real site role admin/content only; invited viewers see none of it, unchanged) lists what the company learned, rejected and dropped, with settlement reasons, and offers Retract on any admitted fact (written reason required, per-row clearance, cache reloaded, `brain_fact_retracted` activity row).

The evolution briefing reports learned, material changes (new names), the cost sanity sum, rejected with reasons, retracted, and NEEDS YOU, which carries only system faults: a row stuck pending, `brain_settlement_error`, `brain_cache_reload_failed`. It sends nothing when nothing happened.

## The boundary, pinned by test

`test/scott/brainSettlementFirewall.test.js`: the settlement and briefing code references nothing under `lib/workspace`, `lib/crm`, the Arrington routes, Stripe, Zoho, Gmail, leads, purchases, users or permissions; the pure rule reads no database and only the kill switch; every settlement write targets a `scott_` table; the outcome set contains no "pending"; the escalation list contains only real fault events and never a rejection.

Nothing in this change touches `lib/scott/clearance.js`, persona domains, worker permissions, `page_access`, or any Arrington table. Scott's staff logins and Tom's own login are unchanged.

## Migration

`db/seed.js` settles any pending row at boot with the same rule and logs the outcome. On production the two rows listed as "waiting on you" on 11 September settle as rejected (one carries a negative amount; the other is re-assessed against the current brain and settles by the same rule). Idempotent thereafter.

## Rollback

Set `SCOTT_BRAIN_AUTOFILL` to anything other than `true`: the fiction stops learning, proposals are recorded as rejected with that reason, the briefing stops. No code change needed. Reverting the branch restores the approval queue.

## Residual risk, stated

A fact that is plausible, sourced, correctly sized and non-conflicting can still be wrong for the business in a way no deterministic check can see. That is what the briefing and the retract action are for, and it is the trade Tom has chosen: a company that evolves and is read afterwards, rather than one that waits.

---

# Addendum: persistent company state (same day, Tom's follow-up instruction)

"The main requirement is persistence and repeatability. Scott should feel like a real company with a remembered state. If someone asks the same factual question tomorrow, the answer should be the same unless the underlying fictional company record has genuinely changed. Build this around a persistent Scott company state: accepted facts are stored and reused; new facts can evolve the company automatically if they pass consistency checks; conflicting facts are reconciled or rejected; changed facts supersede old ones with a clear history; financial and staffing figures must remain internally consistent; repeated questions should produce the same substantive answer; wording can vary, facts cannot. The evolution briefing should report what changed in Scott's company state and any serious contradictions the system rejected. It should not be a routine approval queue. Keep the hard separation from real Arrington data and actions. Bring me the proposed architecture before production merge. Also close all gaps that are waiting using logic."

## What changes in authority, beyond the settlement change above

Two things, and only the second is an expansion:

1. **A worker can no longer answer a settled question differently.** A reply proposing a fact for a key the company already answers differently has the held figure appended from the record before it is stored. This NARROWS what the demonstration can say, and it narrows it deterministically rather than by asking a model to behave.

2. **A person can now change a fact the company holds.** Previously a held fact could only be retracted, leaving a hole. `POST /api/scott/brain-candidates/:id/correct` writes a new version and marks the old one superseded, both readable. This is new human authority, not new worker authority: no automatic path reaches it, pinned by test.

Gap closure is not new authority in either direction. It writes only `scott_brain_gaps`, and it cannot assert the one thing a gap closure could dishonestly assert (see below).

## The consistency rules

`lib/scott/companyState.js`, pure. Every figure is derived from the fiction rather than stated, so the envelope grows with the company.

| Finding | What it means |
|---|---|
| `monthly_exceeds_revenue` | a monthly cost bigger than the latest month's whole revenue |
| `annual_exceeds_turnover` | an annual cost bigger than the year's whole turnover |
| `percentage_impossible` | a percentage above 100 or below 0 |
| `headcount_mismatch` | a headcount that disagrees with the staff register (the register's own number, or that plus the owner, are both accepted) |
| `staffing_unknown_person` | a staffing fact about somebody who is not on the staff register |

All five reject at settlement, reported as `inconsistent_with_the_books` rather than as a clash with a held fact, because the cause and the remedy differ. Monthly costs are measured against monthly REVENUE rather than overheads deliberately: the company's own September payroll exceeds its overhead line, and a check that refused a real figure would be worse than no check.

## What an automatic gap closure cannot say

`source_corrected` is written as the literal `false` and is not a parameter of the write. That column is one person's statement that they went and corrected a controlled record. The closure is attributed to `automatic` and the register renders it as "Closed by the company itself", so a human resolution and a logical one are never the same row. Pinned by three assertions in the boundary suite, including that the pure decision cannot even produce a value for the field.

## Supersession

`supersedes_id` / `superseded_by_id` on `scott_brain_candidates`, self-referencing. One transaction: a new approved row pointing back, the old row moved to `superseded` pointing forward. The brain reads `status = 'approved'` only, so it holds exactly one version at every moment and never both. Nothing is deleted, so "what did the company used to think, who changed it, and why" is answerable from the register.

## The boundary, pinned by test

`test/scott/brainSettlementFirewall.test.js` now covers `companyState.js` and `gapClosure.js` under the same forbidden-reference rule, asserts both require nothing at all and read no configuration and no database, asserts the two new repository writes target `scott_` tables only, and asserts that no automatic caller (`brainCandidates`, `gapClosure`, `evolutionBriefing`, `db/seed.js`) can reach the supersession write.

## Rollback

Unchanged and unextended: `SCOTT_BRAIN_AUTOFILL` set to anything other than `true` stops the company learning. Reply reconciliation, gap closure and supersession are not gated on it, deliberately: the first two only ever make the demonstration say less, and the third is a person's action. Reverting the branch removes all three.

## Residual risk, stated

Reconciliation catches the case that can be detected exactly: a worker proposing a fact for a key already held. A worker that contradicts a held figure in prose WITHOUT proposing it as a fact is still only prevented by the prompt. Closing that would mean scanning free text for figures and guessing which record they belong to, which is the class of check this project has repeatedly found does more harm than good. It is recorded here rather than claimed as covered.


---

# Post-merge record and request for independent review (14 September 2026)

Appended after the fact. Nothing above this line has been altered except
the dated status correction at the head, which says so in its own words.

## Decision

Tom approved the merge on 14 September 2026, in writing, as part of a
combined instruction covering several items. His words on this one:

> "I want Scott's Armchair to become its own believable, persistent
> fictional company, not a static demo waiting for me to approve every new
> fact. Scott should remember what has happened, evolve its own company
> state, reuse established facts consistently, reject contradictions, keep
> a history when facts genuinely change and remain internally believable
> over time. This autonomy is intentional. It must remain strictly inside
> Scott and must never alter or contaminate real Arrington business data."

He confirmed the closure on the same day: "Do not reopen the decision to
make Scott autonomous."

## What shipped

| | |
|---|---|
| Pull request | #165, "Scott evolves on its own, and remembers" |
| Merge commit on `main` | `a0095005463c429f40d5edb449c9253178af8790` |
| Merged after | #164 (`2f5bfbe`), which #165 contained; the dependency order was forced, not chosen |
| Production deployment that ran the migration | `37c9b423-c9af-47d9-ac04-e582b49bb8ae` |
| Serving deployment at the time of writing | `61f872f4-2d5f-4283-ba1a-6c2ecc5a3a5e`, SUCCESS |
| Kill switch state on production | `SCOTT_BRAIN_AUTOFILL='true'` — the autonomy is live |

## Evidence that the behaviour is real, not merely deployed

Quoted verbatim from the production start-up log of deployment
`37c9b423`. These are the three claims worth evidencing, and each is
evidenced by the system reporting its own work rather than by inspection
of the code:

- `Scott AI Demonstration: 2 pending proposed fact(s) settled at boot: 1 admitted, 1 rejected, 0 already held.`
  Those are the two rows this submission predicted would settle (see
  "Migration" above). They resolved without a person, which is the whole
  point of the change.
- `Scott AI Demonstration: 17 open gap(s) read, 17 closed by logic. 17 gaps closed: 3 answered by something the company learned; 14 blocked nothing.`
  Each closure carries its own reason on the row; none asserts that a
  source was corrected, which is the one thing an automatic closure must
  never claim.
- `Scott brain: 18 approved additions loaded. Estimate autofill ARMED (SCOTT_BRAIN_AUTOFILL='true').`
  Seventeen before the release, eighteen after: the one admitted fact.
- `Scott AI Demonstration: proposed-fact estimate and supersession columns verified.` and
  `Scott evolution briefing: scheduled, every 24h, checked hourly against the database clock.`

**A note on reading that log.** `37c9b423` is marked REMOVED, because a
second deployment superseded it as a deployment. Its database writes still
happened, and every deployment since correctly logs nothing because the
migration found its work already done. A reader checking only the serving
deployment's log would see silence and could reasonably conclude the
migration never ran. It did.

## Verification carried out before the merge

- Merged tree on a genuinely fresh database: seed exit 0, then the full
  suite at **1,098 tests, 1,095 passing, 0 failing**, 3 skipped, plus the
  seven separately-gated suites that need a running instance or paid AI
  and are named on every run. The four suites specific to this change
  (`brainSettlementFirewall`, `companyState`, `brainRepeatability`,
  `gapClosure`) ran **61 of 61**.
- **The boundary was checked independently of the change's own test**,
  because a test written by the same author as the code it guards is weak
  evidence of exactly the property most worth proving here. Every SQL
  statement in the new and changed modules was enumerated by hand: every
  table read or written is `scott_`-prefixed. None of `companyState.js`,
  `gapClosure.js`, `evolutionDigest.js` or `evolutionBriefing.js` requires
  anything outside `lib/scott`. The single apparent hit on the word
  `content` is a column on `scott_messages`, not the Arrington `content`
  table.
- Error rate across the release window: the only server error sits inside
  the sixty seconds of the deployment changeover, with nothing after it.

**Stated rather than glossed:** a passing test suite is not a release gate
on its own, and is not offered as one. The adversarial suites were not run
for this release; neither this change nor #164 touches the workspace
access gates those suites cover. And this build environment cannot reach
the live site, so every production claim above rests on Railway's
deployment and start-up logs, never on a page being loaded.

## What is being asked of Governance & Assurance

An independent review of the implementation **as shipped**, not of the
decision. Specifically:

1. Whether the boundary holds under independent attack: that no automatic
   path inside the fictional demonstration can read, write or influence
   any real Arrington record, permission or action, in either direction.
2. Whether the settlement rule is genuinely terminal and genuinely
   deterministic: no outcome that waits for a person, no automatic path
   that overwrites a held fact, no reachable branch that admits something
   the rules say it rejects.
3. Whether the honesty properties hold: that an automatic gap closure
   cannot claim a person corrected a source, and that a supersession
   cannot be reached by any caller other than a person.
4. Whether the residual risk recorded above ("a fact that is plausible,
   sourced, correctly sized and non-conflicting can still be wrong for the
   business") is bounded acceptably by the briefing and the retract
   action, given the demonstration's commercial purpose.

The builder does not award itself a verdict, and none is claimed here.
The rollback, unchanged, is a single Railway variable: `SCOTT_BRAIN_AUTOFILL`
set to anything other than `true` stops the company learning, with no code
change and no deployment.
