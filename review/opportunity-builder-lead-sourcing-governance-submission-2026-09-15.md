# Opportunity Builder: approved method for sourcing new leads

**Governance and Assurance submission. 15 September 2026.**
**Status: DRAFT FOR TOM'S APPROVAL. No code has been changed.**

---

## 1. What is being asked, and by whom

Tom's decision of 15 September 2026, taken while reading the open Brain gap on
`/workspace/gaps`:

> No record gives Opportunity Builder an approved list or method for sourcing
> brand new leads; Lead Finder is not an approved worker and new-lead discovery
> is recorded as human-led under Tom.
>
> Raised by `lane:opportunity_builder`, 08 September 2026, MISSING / MATERIAL / OPEN.

Offered four ways to settle it, Tom chose to change the position: the worker
should be able to source new leads, and the controlled record should be
rewritten to say so.

This is a worker permission change. It is presented here for the governed route
rather than self-approved, and nothing moves until Tom approves it.

## 2. The current controlled position, which this would supersede

**Arrington Opportunity Builder, Worker Handoff**, status LIVE WORKING HANDOFF,
last reviewed 11 September 2026. Three passages bear directly on it:

> "Lead Finder is archived; new lead discovery is human led under Tom."
> (Other Continuity Facts, item 3)

> "Tom confirmed on 11 September 2026 that identifying existing contacts who can
> introduce him to owners who need help is already in hand with him personally.
> No list is held in the brain; it is not this worker's task to build one unless
> Tom asks." (Warm Introductions)

> "Do not start new prospect research until those three are done and this
> handoff and the tracker reflect them." (Next Controlled Action)

The three are: sign off the Ivybridge valuation and confirm INV-0648 paid;
confirm INV-0646 paid before the Cornwall Handyman review on 21 September; and
obtain the next Pembroke Street Board date.

**The gap was therefore correct.** It is not reporting a missing record. It is
reporting the recorded position back, having hit the boundary that position
sets. That matters for how this is written up: the record is not being corrected
because it was wrong, it is being changed because Tom has changed his mind, and
the handoff should say so plainly rather than implying the old position was an
error.

## 3. Why the obvious version of this change would fail

Stated first because it shapes everything below.

`opportunity_builder` currently holds `sourceClasses: ['authority', 'strategy',
'worker_register', 'opportunity']`. There is no source class for prospects, no
source class for leads or enquiries, and no connector anywhere in the workspace
that can retrieve a business the brain does not already name.

Widening the remit on its own would produce a worker permitted to source leads
with nothing to source from. The predictable result is a model filling the gap
from training data: plausible local company names, plausible owners, no evidence
behind any of it. That is the failure this estate already treats seriously (the
Market Ready Test was rebuilt deterministic for it, and Scott's brain candidates
carry an `unsourced` check for it), and it has already happened once here. The
handoff records the outcome:

> "the eight Lead Finder candidates of 26 June 2026 that were never researched.
> Treat all of them as Lost / Paused."

So the permission change is only safe alongside a real source. The rest of this
submission is about that.

## 4. Proposed source: Companies House public API

**Primary: the Companies House public data API.** Official UK register, free,
no commercial licence needed, one free API key.

Why this one:

- **Every record carries a company number**, which is a verifiable external
  identifier. A candidate without one cannot be written, which is the guard in
  section 5 and is only possible because the source provides one.
- **It is authoritative rather than scraped.** The company either exists on the
  register or it does not.
- **It carries the signals Arrington actually filters on**: registered office
  (Devon and Cornwall), SIC code (trade), incorporation date, accounts type
  (which brackets company size), officer count, and whether accounts or the
  confirmation statement are overdue.
- **It is free**, so the cost of a wrong criteria set is wasted time rather than
  a bill.

What it does not give: trading status beyond filings, turnover for a small
company, contact details, or any signal of owner dependency. Those stay Tom's
judgement, and the worker must not infer them.

**Secondary, optional: Google Places.** `GOOGLE_PLACES_API_KEY` is already set
on the production service, though today it reads exactly one hardcoded Place ID
(Arrington's own Google reviews, `lib/googleReviews.js`). Places Text Search
would corroborate that a registered company is actually trading locally, and
returns a Place ID, which is a second verifiable identifier. It is billed per
request, so it is proposed as a second step on a shortlist rather than a sweep.

**Noted in passing:** `GOOGLE_MAPS_API_KEY` is set on the production service and
is read by nothing in the repository. Unrelated to this submission, but worth
Tom knowing it is there.

## 5. The guards, which are the substance of this submission

Six, all structural rather than conventional.

1. **A candidate cannot exist without provenance.** Every row carries the
   source, the external identifier (company number, or Place ID) and the
   retrieval timestamp. A write missing any of them is refused, not logged and
   allowed through. Same shape as the finance provenance column.

2. **The model never names a company.** Candidates come from the API response
   only, and a deterministic filter selects against recorded criteria. The model
   may explain or summarise a candidate that was retrieved; it may not produce
   one. This is the Market Ready Test architecture, and it is the single most
   important line here.

3. **Criteria are recorded, not chosen.** The filter reads its area, trade,
   size and age criteria from the handoff, so changing who gets researched is a
   change to a controlled document, not a prompt.

4. **A candidate is not a lead.** The handoff already says "Do not treat ... a
   researched candidate as a lead". Candidates land in their own state and never
   enter the Arrington Lead Tracker automatically. Promotion is Tom's, by hand.

5. **No outreach capability of any kind.** The worker gets no path that can
   contact a prospect: not the Gmail send route, not a draft, not a template.
   "Do not send generic outreach or repeat an approach without new evidence"
   is unchanged and is enforced by there being no mechanism.

6. **Inert until switched on.** Gated on its own flag, unset by default, so
   merging changes nothing. The established pattern here
   (`ENABLE_ARRINGTON_AI_WORKSPACE`, `ENABLE_SOCIAL_MUTATIONS`,
   `ENABLE_ZOHO_INVOICE_WRITES`). Rollback is unsetting one variable.

## 6. The permission change, precisely

Three edits, and no others:

- **New source class** `prospect` in `lib/workspace/lanes.js`: "Candidate
  businesses retrieved from approved public registers, with source, external
  identifier and retrieval date. Not leads."
- **Granted to `opportunity_builder` only.** Not added to
  `GENERAL_SOURCE_CLASSES`, so it does not widen what any other lane or any
  general question can reach. `governance_assurance` reads it as it reads
  everything.
- **Remit line amended** from "takes ownership once a target is approved or a
  reply becomes live" to include identifying candidate businesses from approved
  public sources against recorded criteria, for Tom's decision.

Nothing else in the lane register changes. No other lane gains a source class.
No sensitivity ceiling moves.

## 7. What does NOT change

- **Warm introductions stay Tom's personally**, exactly as the 11 September
  record says. This submission covers cold candidate identification from public
  registers, nothing else.
- **No approach, no outreach, no contact**, by the worker or through it.
- **The Lead Tracker stays the single tracker**, and stays human-written.
- **Closed leads stay closed.** The five taxi operators, the eight software
  providers, BodyMe and the eight Lead Finder candidates are Lost or Paused and
  must not be re-researched. The filter must exclude anything already on the
  tracker in any state, or the first run will hand Tom back the list he closed
  four days ago.
- **The commercial boundaries are untouched**: not a broker, not a valuation
  service, not an exit adviser.

## 8. Sequencing, which is Tom's to decide

His own next controlled action says not to start new prospect research until
Ivybridge, Cornwall Handyman and Pembroke are closed out. Two of those have
dates inside the next week.

**Recommended:** build it, and leave the flag off until those three are closed.
That honours both the decision and the discipline, and costs nothing, because
an unset flag makes the whole thing inert. It also means the first real run
happens when Tom has time to read what comes back, rather than during the week
he is delivering paid work.

This is a recommendation, not a condition. If Tom wants it live on merge, that
is his call and the submission is not blocked on it.

## 9. What Tom needs to do

1. **Approve or amend this submission.**
2. **Approve the handoff replacement text** in the appendix, and paste it into
   the live Worker Handoff. The document's own rule applies: rewrite the
   affected section rather than adding a block above stale text.
3. **Create a Companies House API key** (free, at
   `developer.company-information.service.gov.uk`) and set it in Railway. Never
   in code, git, Drive or chat.
4. **Decide the criteria**: area, trades, company size and age, and any
   exclusions. These go into the handoff, and the filter reads them from there.
5. **Decide the sequencing** in section 8.

Then, and not before, the code changes in section 6 are built, tested and put up
for merge.

## 10. Rollback

Unset the flag. The lane loses the source class at the next boot and the
workspace returns to the 11 September position with no deploy and no code
change. Candidate rows already retrieved stay in the database with their
provenance intact, because deleting evidence of what was retrieved would be the
wrong default.

---

## Appendix: proposed replacement text for the Worker Handoff

Plain text, in the document's own register, for Tom to paste. Three sections
are replaced and one is added.

### REPLACES "OTHER CONTINUITY FACTS", item 3, final sentence

Current final sentence:

> Lead Finder is archived; new lead discovery is human led under Tom.

Proposed:

> Lead Finder remains archived and its eight candidates of 26 June 2026 stay
> closed. On 15 September 2026 Tom changed the position on new lead discovery:
> see APPROVED SOURCING METHOD below. The earlier position was not wrong when it
> was written; it has been superseded.

### REPLACES "WARM INTRODUCTIONS"

Proposed:

> Identifying existing contacts who can introduce Tom to owners who need help
> remains Tom's personally, confirmed 11 September 2026 and unchanged on 15
> September. No list of introducers is held in the brain and it is not this
> worker's task to build one. The sourcing method approved on 15 September
> covers cold candidate identification from public registers only, and does not
> extend to warm introductions.

### ADDS a new section, "APPROVED SOURCING METHOD" (15 September 2026)

Proposed:

> Approved on 15 September 2026 by Tom, superseding the human-led-only position
> of 11 September.
>
> 1. The approved source is the Companies House public data API. Google Places
>    may be used as a second step to corroborate that a registered company is
>    trading locally. No other source is approved, and no source may be added
>    without Tom's decision recorded here.
> 2. A candidate is only a candidate if it carries its source, its external
>    identifier (company number, or Place ID) and the date it was retrieved. A
>    business without those must not be recorded, named or presented.
> 3. The worker does not name businesses. Candidates come from the source, and a
>    fixed filter selects against the criteria below. The worker may explain a
>    candidate it retrieved; it must never produce one.
> 4. CRITERIA (Tom to complete before the first run): area; trades; company size
>    and age; exclusions.
> 5. Anything already on the Arrington Lead Tracker in any state, including Lost
>    and Paused, is excluded. The closed rows of 11 September 2026 are not to be
>    re-researched.
> 6. A candidate is not a lead. Candidates are presented to Tom and he decides
>    what reaches the tracker. Nothing is written to the tracker automatically.
> 7. There is no outreach of any kind. The worker holds no path that can contact
>    a prospect, and none is to be added without a separate decision.

### REPLACES "NEXT CONTROLLED ACTION", final sentence

Current final sentence:

> Do not start new prospect research until those three are done and this handoff
> and the tracker reflect them.

Proposed, if Tom accepts the recommended sequencing in section 8:

> New prospect research is approved in principle from 15 September 2026 but does
> not begin until those three are done and this handoff and the tracker reflect
> them. The capability is built and switched off until then.

Proposed, if Tom wants it live immediately:

> New prospect research is approved from 15 September 2026 and may run alongside
> those three. The three remain the first call on Tom's own time.
