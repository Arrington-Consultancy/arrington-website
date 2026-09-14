# Scott AI Demonstration: autonomous evolution of the fictional company brain

Governance submission, 13 September 2026. Builder: the Claude Code session on Tom's instruction of 13 September 2026. Status: built on branch `claude/new-session-hbgp04-scott-evolution`, not merged; production merge is Tom's gate.

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
