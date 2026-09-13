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
