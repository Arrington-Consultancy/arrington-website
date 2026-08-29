# Scott AI Demonstration v0.2, Governance & Assurance release review

Prepared 29/08/2026 on branch `feature/scott-ai-demonstration` at the
commit this file lands in. Written for the final release decision, which
is Tom's. This document recommends; it does not release. Nothing in it
has been merged to `main` and nothing has touched the public site.

## What is being released

A self-contained demonstration of a governed multi-worker AI system
running a fictional company, at `/scott/*` on the existing site, behind
the existing `page_access` restriction, deployed only to the `scott-demo`
service in the `staging` environment. Live AI runs on `claude-sonnet-5`
under Tom's own key.

## The control claims, and the evidence for each

Every claim below is backed by something that executed, with the run
recorded in this branch's history or the staging deployment logs. None
rests on reading the code and finding it plausible.

**1. A person sees only what their clearance permits, on every surface.**
The 07Q intersection (human clearance AND worker permission AND task
necessity, narrowest wins) is enforced on rendered pages, search, the
Company Brain, every SQL-derived path into an AI prompt, and the Brain
Gap register. Evidence: 362/362 automated tests; a canary sweep of
11,368 denied-value checks across all 8 logins and 14 portal pages using
strings drawn from the dataset itself, zero leaks, with positive hits
proving permitted content still renders; 21B's 140-case bank replayed
against the implementation.

**2. Stored AI output cannot leak across clearances.** Conversations
record their owner and the clearance they were conducted under, and are
only replayed to a matching reader. Evidence: the adversarial suite logs
in over real HTTP as a Clearance F operative, plants bait conversations
owned by other logins, walks conversation ids and six other surfaces,
and finds nothing; the same suite was shown to FAIL against the code as
it stood before the fix.

**3. Acting on a record requires the clearance to see it, server-side.**
Job status, enquiry assignment, writeback decide/redraft and gap
resolution are all enforced at the API, not the UI, deriving authority
from the record's own domain. Unknown actions and unclassified records
fail closed. Evidence: 17/17 adversarial API attacks, including positive
controls proving the refusals are about authority rather than blanket
denial.

**4. An evidence gap is not an approval, and no gap is filled by
inference.** Workers carry a separate `gap` contract; routing,
materiality and ownership are decided in plain code from the controlled
ownership register (every owner a human persona holding the domain they
own, both enforced by tests); closure requires a logged-in human with
clearance for that gap's own domain and a written statement, with
resolve and dismiss kept distinct. Evidence: 31 engine tests, 9
lifecycle tests against the real database, 5 through a real turn with a
scripted model.

**5. Notification claims are honest.** "[name] has been emailed" is
authored in exactly one place, from the stored delivery result, never
from intention or from model prose. Evidence: the staging acceptance
check of 29/08/2026 ran inside the real container and delivered a real
email over the authorised Gmail path (gap 1, sent on attempt 1,
`emailed_at 2026-08-29T16:07:38.566Z`); a scripted-model test makes the
model claim a send while the send fails and asserts the interface
contradicts it; the check's own dry run caught and fixed the register
claiming "failed after a retry" when nothing had been attempted.

**6. The live model, under attack, discloses no restricted value and
claims no authority it lacks.** The paid pressure suite ran genuinely on
staging on 29/08/2026 (16:27 to 16:33 UTC, 11 live turns against
`claude-sonnet-5`, launched by the marker-guarded one-shot runner):
17 pass, 0 fail. That covers 21B's five routing/prompt-wording bypasses
(no restricted value in any output surface, receptionist note included),
its three action-authority cases (no action claimed as performed), and
the three gap-loop probes: no contact claimed by the model, the
contradictory record answered with a raised gap and admitted doubt
rather than a confident guess, and no worker offering to correct a
controlled record itself. The full TAP output is in the deployment log
for deploy `2cc557d3` on `scott-demo`/staging.

## Spend controls

The public demo spends Tom's money per chat turn; that is inherent to a
live demonstration and bounded by the existing chat rate limiter. The
expensive test suite is armed only by `RUN_SCOTT_LIVE_AI=true` (never by
`npm test`), and its in-container runner is additionally one-shot per
database via a marker written before any spend, so container restarts
cannot pay twice. Both staging flags used for the acceptance runs have
been removed again.

## Known limits, stated so the release decision is made with them

- The pressure suite is a sample of 11 turns on one day, not a proof
  about all model behaviour. The controls that matter (clearance,
  authority, notification honesty) do not depend on the model behaving;
  the suite tests the layer that does.
- Email delivery is proven to SMTP acceptance by Google; inbox placement
  was confirmed by the message arriving at the demo inbox.
- `SCOTT_DEMO_SKIP_LOGIN=true` remains set on staging (auto-signs in as
  tom). It is refused on any deploy whose canonical host is the public
  site, but it should be removed before any audience beyond Tom gets the
  staging URL.
- `RESET_SCOTT_STAFF_PASSWORDS=true` also remains set on staging and
  resets the fictional staff passwords on every deploy; harmless, but it
  should come off once sign-in is confirmed.
- Doc 24's independent governance review of the three dormant workers
  still records no verdict, so Nigel Preece, Sheila Kemp and Nina Holt
  stay dormant in this release.

## Recommendation

Release-ready from an assurance standpoint, within the limits above. The
two staging variables are worth removing at handover. The decision to
merge, and when, remains Tom's; nothing will be merged on the strength
of this document.
