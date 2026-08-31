# Arrington AI Workspace v0.1: response to the AMBER governance review

**Date:** 31 August 2026
**Responds to:** `review/workspace-v0.1-governance-review-2026-08-30.md` (verdict AMBER, ten findings)
**Written by:** the technical builder. This is a remediation record, not an
assurance verdict. Nothing here upgrades AMBER. The builder does not award
itself a Governance PASS, and two of the three HIGH findings are reserved
to Tom Arrington by the review's own terms and remain open below.

**Branch:** `feature/arrington-ai-workspace-v0-1`
**Production state:** unchanged. `ENABLE_ARRINGTON_AI_WORKSPACE` is not set
on the production service, so none of this is reachable on the public site.

---

## Summary

| Finding | Severity | State after this pass |
|---|---|---|
| F1. A site admin can take Tom's workspace access | HIGH | **OPEN, reserved to Tom.** Recorded in `clearance.js` as an open, explicitly *un*accepted risk, with the three options. No code change to the access model. |
| F2. The area announces its existence to anonymous visitors | HIGH | **Corrected.** |
| F3. The social expansion and the Bob Fletcher scope lines are not approved | HIGH (control point) | **OPEN, reserved to Tom.** No change made; it is his decision to record or to lift the work out of this candidate. |
| F4. The erasure tombstone identifies the people it erased | MEDIUM | **Corrected**, with its consequence stated rather than hidden. |
| F5. One declared social scope is a write permission | MEDIUM | **Corrected**, and the test that let it through is now the other way round. |
| F6. Two workspace surfaces apply no clearance filter | MEDIUM | **Corrected.** |
| F7. Conversation history and gap sensitivity are not re-checked | LOW | **Corrected.** |
| F8. A workspace 404 is distinguishable from a real one | LOW | **Corrected**, for Scott as well as the workspace, as the review suggested. |
| F9. The workspace write APIs are not rate limited | LOW | **Corrected.** |
| F10. The privacy page is silent on the retention erasure keeps | LOW | **Corrected.** |
| Item 5. The workspace has never called a model | (noted, not a finding) | Suite now exists; the paid half has still never been run. |

---

## F1. Open, and deliberately not accepted

The review demonstrated end to end that an admin CMS account can rewrite
the password behind the username `tom` and then hold the workspace,
including sight of the whole controlled brain and the irreversible
erasure control.

`lib/workspace/clearance.js` previously implied the opposite. It now
records the risk in full, and records that it is **not accepted**, because
only Tom can accept it. The three options the review set out are written
into the file so a later reader cannot mistake silence for a decision:

1. accept it in writing, on the basis that the only admin account belongs
   to an org owner who already has database access;
2. refuse a password change against any username holding workspace
   clearance, which also removes Tom's own admin-assisted recovery path;
3. bind clearance to the user id and require a second Railway variable
   naming the expected username, so seizing access needs infrastructure
   access as well as CMS access.

No option was implemented. Option 2 in particular changes how Tom would
recover his own account, which is his call and not a defect fix.

## F2. Corrected

`lib/workspace/access.js` no longer redirects an anonymous page request to
`/login?next=...` and no longer answers 401 on the APIs. Both anonymous
and logged-in-but-uncleared requests now get the same 404 the site gives
for a path that never existed.

The unit test that *required* the login redirect has been rewritten: that
assertion was what made the leak look like intended behaviour. The
adversarial suite's `assert.ok([302, 404].includes(res.status))` is gone
too, replaced by a comparison against a control request to a genuinely
non-existent path: same status, same body after normalising per-request
nonces. The API case does the same against a non-existent endpoint, and
additionally asserts the denial never says "log in".

## F3. Open, and not something a builder can close

Unchanged and unresolved. The social control area, and the two scope lines
added to Bob Fletcher's specification in `lib/scott/workers.js`, are an
expansion of the approved v0.1 source map. Tom instructed the expansion;
an assurance lane cannot approve it on the strength of the builder's
description of the instruction. Either Tom records the approval of both as
explicit decisions, or he asks for them to be lifted out of this candidate
and brought as their own change. Nothing has been done here to make that
decision easier to skip.

## F4. Corrected, with its cost stated

`lib/crm/emailHash.js` is now an HMAC-SHA256 keyed on `SESSION_SECRET`
rather than a bare SHA-256. The rebuild-time tombstone check is unchanged
in behaviour, because both sides compute the same value; the register
stops being a membership oracle for anyone with database access.

Two consequences are written into the file rather than left to be
discovered:

- every tombstone written under the old function stops matching. Those
  rows keep their evidential value, and the resurrection risk is
  theoretical only because erasure also deletes the source rows, so there
  is nothing left for a rebuild to rebuild from;
- rotating `SESSION_SECRET` has the same effect as changing the function.

The register rows that exist today are test rows plus the reviewer's one.
No real person's erasure has ever been recorded, which is why this was
worth doing now.

## F5. Corrected

`instagram_manage_comments` is gone. It conferred comment moderation,
including replying and deleting, which is exactly the power the registry's
own rule says a token must not carry when the code refuses to use it.
Instagram comments are consequently not read, and the page says so in
plain words rather than showing an empty comment list.

The test that was supposed to catch this used a loose regex
(`/publish|write|manage_posts|w_/`) that would not have caught it either.
It is now inverted: **any** scope whose name suggests management,
modification, deletion or comments fails unless it appears in a named
justification list. One entry is in that list,
`instagram_manage_insights`, because Meta named its read-only Instagram
metrics scope `manage` and ships no read-named equivalent. A second test
asserts every justified entry is actually requested by a connector, so the
list cannot quietly become a standing permission to add more.

## F6. Corrected

`/workspace/social` and `/workspace/activity` now gate on
`clearanceCanSeeSensitivity(clearance, 'commercial')` and render the
page's own refusal, matching the pattern Contacts already used. An
uncleared reader sees a stated refusal, not an empty page implying there
is nothing there. The dashboard's activity strip is filtered on the same
test.

## F7. Corrected

`workspace_conversations.clearance` is now read. `clearanceCovers(reader,
stored)` asks the only safe question: does the reader still cover
everything that answer was allowed to draw on? `/workspace/chat` filters
the conversation list with it and refuses to open a conversation that
fails it; `POST /api/workspace/ask` applies the same test before
continuing a thread, and answers 404 rather than a refusal, so the
narrowed transcript reads as absent. An unrecognised stored value is
covered by nobody.

The gap sensitivity default changed from `commercial` to the answering
lane's own `sensitivityCeiling`, falling back to `confidential` when the
lane is unknown. That is the most the gap could possibly have drawn on. A
mid value chosen for convenience is exactly how a gap describing
confidential evidence gets filed one level too wide.

## F8. Corrected, in both areas

The site's 404 renderer is extracted to `lib/render404.js`, and both
`lib/workspace/access.js` and `lib/scott/access.js` now call it. A denial
therefore produces the real navigation list and the active theme, byte for
byte what a genuinely missing page produces. The adversarial suite asserts
that equality directly rather than trusting it.

Scott's anonymous redirect to `/scott/login` was deliberately left alone:
that is an invited demonstration with its own login page that guests are
pointed at, and the review's F8 was about the 404 body, not that journey.

## F9. Corrected

A 30-per-minute limiter now covers all six workspace write endpoints
(`approvals/:id/decide`, `gaps/:id/resolve`, `social/engagement/:id/replied`,
`social/request-action`, `contacts/sync`, `contacts/:id/erase`), not just
`/api/workspace/ask`.

## F10. Corrected

`views/privacy.ejs` now states, in the deletion section, that a payment
record is kept when the rest is deleted and why, and that a short note of
the deletion itself is kept holding a shortened form of the address rather
than the address. The internal register already said this honestly; the
person whose data it is could not read it.

## Review item 5: the workspace has still never called a model

`test/workspace/liveAiPressure.test.js` now exists, built on the same
two-half pattern as Scott's. The paid half is armed only by
`RUN_WORKSPACE_LIVE_AI=<run label>` on top of `ANTHROPIC_API_KEY`,
`ENABLE_WORKSPACE_AI=true` and `DATABASE_URL`, so a deployment with live
AI switched on can never make `npm test` spend money. It tests the two
claims only a live run can test: that a question the records do not answer
produces an admission and a gap rather than an invention, and that an
instruction to act is escalated rather than claimed as done. A third case
probes clearance with canaries derived from the confidential records **at
run time**, never written into the file, since committing the values that
must not leak in order to test that they do not leak would be the leak.

The free half always runs and exists to keep the paid half sound while it
sits idle: it proves each honesty check catches the dishonest sentence and
clears the honest one, that the probe clearance is genuinely narrower than
the owner's, that a canary cannot be a sensitivity label mistaken for a
value, and that the arming logic does not arm on `''` or `'false'`.

**The paid half has not been run.** `ENABLE_WORKSPACE_AI` is off
everywhere, and running it is a spend decision that is Tom's, not the
builder's. Until it runs, treat "the workspace does not fill a gap by
inference" as designed and unit-tested, not as demonstrated.

## Review item 7: the "455 pass" figure

Recorded, and it stands: the adversarial suite skips silently in a bare
`npm test`, so a full-suite pass does not cover the workspace surface. It
must be run by hand against a running instance before each release
decision, with `WORKSPACE_TEST_BASE_URL`, `WORKSPACE_TEST_TOM_PASSWORD`
and `WORKSPACE_TEST_OTHER_PASSWORD` set. The same is true of
`test/scott/adversarialApi.test.js`.

## What was NOT changed

- No production merge, no production deploy, no flag set on production.
- No external account connected; nothing published, replied to or spent.
- No new worker, no lane added, no permission widened, no second human
  granted clearance.
- No change to Scott's clearance model, worker roster or activation state.
- F1 and F3 left open for Tom.
