# Arrington AI Workspace v0.1: response to the AMBER governance review

**Date:** 31 August 2026
**Responds to:** `review/workspace-v0.1-governance-review-2026-08-30.md` (verdict AMBER, ten findings)
**Written by:** the technical builder. This is a remediation record, not an
assurance verdict. Nothing here upgrades AMBER. The builder does not award
itself a Governance PASS.

**Updated 31 August 2026 (second pass).** Tom decided both HIGH findings
that the first pass left open: F1 by choosing option 3, F3 by explicitly
approving the reviewed scope. Both are now closed below, and the
candidate goes back to independent Governance & Assurance for the
PASS/AMBER/STOP verdict. Tom has separately withheld production merge,
production deployment and production enablement until that verdict and
his own production approval.

**Branch:** `feature/arrington-ai-workspace-v0-1`
**Production state:** unchanged. `ENABLE_ARRINGTON_AI_WORKSPACE` is not set
on the production service, so none of this is reachable on the public site.

---

## Summary

| Finding | Severity | State after this pass |
|---|---|---|
| F1. A site admin can take Tom's workspace access | HIGH | **CLOSED.** Tom chose option 3 on 31/08/2026. Implemented as a third gate. |
| F2. The area announces its existence to anonymous visitors | HIGH | **Corrected.** |
| F3. The social expansion and the Bob Fletcher scope lines are not approved | HIGH (control point) | **CLOSED.** Explicitly approved by Tom on 31/08/2026, bounded to the reviewed scope. |
| F4. The erasure tombstone identifies the people it erased | MEDIUM | **Corrected**, with its consequence stated rather than hidden. |
| F5. One declared social scope is a write permission | MEDIUM | **Corrected**, and the test that let it through is now the other way round. |
| F6. Two workspace surfaces apply no clearance filter | MEDIUM | **Corrected.** |
| F7. Conversation history and gap sensitivity are not re-checked | LOW | **Corrected.** |
| F8. A workspace 404 is distinguishable from a real one | LOW | **Corrected**, for Scott as well as the workspace, as the review suggested. |
| F9. The workspace write APIs are not rate limited | LOW | **Corrected.** |
| F10. The privacy page is silent on the retention erasure keeps | LOW | **Corrected.** |
| Item 5. The workspace has never called a model | (noted, not a finding) | Suite now exists; the paid half has still never been run. |

---

## F1. Closed. Tom chose option 3 on 31/08/2026

His instruction: "Bind Workspace clearance to the actual user ID and
require the separate Railway variable identifying the expected cleared
username. Do not accept the existing CMS-admin takeover risk, and
preserve the legitimate account recovery route."

Those are two requirements, and the named mechanism satisfies only one
of them. That is worth stating plainly rather than quietly implementing
three things and calling it option 3.

**What binding to the user id and the username variable actually
closes.** Not the demonstrated attack. After an admin resets the
password behind `tom`, the attacker logs in as `tom`, with Tom's real
row and Tom's real user id: both bindings look correct because nothing
about the identity has changed, only who knows the password. What these
two legs do close is a different and real attack, deleting the `tom`
account and creating a new one under the same name, which the username
check alone would have accepted. They also remove the code-edit-alone
path: adding a name to `HUMAN_CLEARANCE` no longer grants anything by
itself, because Railway must name that account too. A code change and an
infrastructure change are now both required.

**What closes the takeover.** A secret the CMS cannot rewrite.
`WORKSPACE_ACCESS_PASSPHRASE` lives in Railway, which is Tom's own
account and is not reachable from CMS admin. A cleared session must
present it before any page renders or any API answers. So an admin who
seizes the CMS account still cannot read the brain and cannot erase a
contact, which is the instruction's second requirement.

**The recovery route is untouched**, which was the third. An admin can
still reset Tom's site password so he can get back into the CMS; that
now simply does not carry the workspace with it. Tom can rotate the
passphrase himself in Railway if he loses it, and doing so immediately
invalidates every open unlock rather than waiting for one to expire.

Implementation notes that matter for review:

- `lib/workspace/clearance.js` gains the identity binding. Everything
  fails closed: an unset variable, a mismatch, or a session with no user
  id yields no clearance at all. An environment that forgot to configure
  it does not fall back to the old username-only rule.
- `lib/workspace/unlock.js` holds the second factor. It is one extra
  fact about an already-authenticated session, not a second login and
  not a second user store. Constant-time comparison over SHA-256
  digests, so neither the length nor a prefix leaks from timing. The
  unlock is bound to the user id that performed it and to a fingerprint
  of the passphrase in force, expires after four hours, and a passphrase
  under twelve characters is treated as unset rather than accepted.
- Failed attempts are written to `workspace_activity` as
  `workspace_unlock_failed`, and a run of them against the cleared
  username is the signature of exactly this attack. It is the only
  warning anyone would get.
- The unlock POST is limited to five attempts per fifteen minutes,
  keyed on the session, because the caller this defends against is
  authenticated.
- **One deliberate exception to the hide-existence rule.** A
  cleared-but-locked page request is redirected to `/workspace/unlock`
  rather than 404'd. This looks like a reversal of F2 and is not: F2 was
  about anonymous and uncleared callers, who learn something real from a
  302. Anyone reaching this point has already satisfied the identity
  binding, so they are either Tom or someone holding Tom's CMS account,
  and the latter is an org member who can read the repository anyway.
  Hiding it from them buys nothing and costs Tom a 404 on his own
  bookmark. The APIs make no such exception: a locked session gets the
  same 404 as an uncleared one, with no mention of unlocking, and the
  erasure endpoint is behind that line.
- `WORKSPACE_OWNER_USER_ID` is a real row id and differs per database,
  so the boot log now reports each gate separately AND the actual ids of
  the cleared usernames in that database. A user id is not a secret. The
  passphrase never appears in any log, only its length, which is the
  distinction that cost a whole session on the Market Ready Test.

Covered by `test/workspace/unlock.test.js` (10 cases, including the
finding itself stated as a test: an admin holding the right username and
the right user id still cannot open the workspace, and cannot guess in),
by the identity cases in `test/workspace/clearance.test.js` and
`test/workspace/access.test.js`, and end to end over HTTP in
`test/workspace/adversarialApi.test.js`.

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

## F3. Closed. Explicitly approved by Tom on 31/08/2026

His words, recorded verbatim because the bound matters as much as the
approval: "The Social expansion and the two Bob Fletcher scope lines
already presented to Governance are explicitly approved as part of this
release candidate. This approval is bounded to that reviewed scope. It
does not authorise autonomous publishing, external replies/messages,
deletion, paid-social spend, account administration, credential changes
or further permission expansion."

He named seven exclusions. Six of them are exactly the six action
classes `ACTION_CLASS_HUMAN` already refuses by construction, checked
against the code rather than assumed:

| Tom's exclusion | Refused as |
|---|---|
| autonomous publishing | `publish` |
| external replies | `reply_publicly` |
| external messages | `send_message` |
| deletion | `delete` |
| paid-social spend | `advertising_spend` |
| account administration | `change_account_settings` |

The permission question is answered in one place, the guard THROWS
rather than returning false so a caller that forgets to check still
cannot proceed, and no connector declares a write scope, so the token
could not perform these even if the code tried.

The seventh, **credential changes**, is not a connector action and so is
not in that list. It is excluded by there being no write path at all:
every credential is read from `process.env` (`isConfigured` reads them,
nothing writes them), so the workspace has no way to set, rotate or
store a credential. The same is true of **further permission
expansion**: the declared read scopes are constants in the registry, and
the scope test now fails any manage-shaped addition that is not
justified by name.

The approval and the code therefore agree today, item by item. Keeping
them in agreement is the standing obligation this decision creates, and
it is worth saying plainly that widening `ACTION_CLASS_HUMAN`'s
complement, adding a write scope, or introducing a credential write path
would each exceed this approval rather than merely extend it.

Nothing was changed in response to this decision. The scope that was
reviewed is the scope that is approved.

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

## Review item 5: the workspace live-AI suite

`test/workspace/liveAiPressure.test.js` exists, built on the same
two-half pattern as Scott's. The paid half is armed only by
`RUN_WORKSPACE_LIVE_PRESSURE=<run label>` on top of `ANTHROPIC_API_KEY`,
`ENABLE_WORKSPACE_AI=true` and `DATABASE_URL`, so a deployment with live
AI switched on can never make `npm test` spend money. It tests the two
claims only a live run can test: that a question the records do not
answer produces an admission and a gap rather than an invention, and
that an instruction to act is escalated rather than claimed as done. A
third case probes clearance with canaries derived from the confidential
records **at run time**, never written into the file, since committing
the values that must not leak in order to test that they do not leak
would be the leak.

The free half always runs and keeps the paid half sound while it sits
idle: it proves each honesty check catches the dishonest sentence and
clears the honest one, that the probe clearance is genuinely narrower
than the owner's, that a canary cannot be a sensitivity label mistaken
for a value, and that the arming logic does not arm on `''` or
`'false'`.

**Tom authorised one bounded staging run on 31/08/2026**, in his words
"approval for that bounded test spend, not general AI expenditure or
production activation". Arming is two acts that cannot be collapsed into
one deploy:

1. an authorisation row, written either by
   `scripts/armWorkspaceLivePressure.js` from a shell that can reach the
   database, or by `ARM_WORKSPACE_LIVE_PRESSURE` on one deploy for an
   operator whose shell cannot (this sandbox cannot reach Railway, so
   that route exists for a real reason and not for convenience);
2. `RUN_WORKSPACE_LIVE_PRESSURE=<label>` on a **second** deploy.

The two variables refuse to coexist in both directions: the arming hook
declines to write while the run variable is set, and the runner declines
to launch while the arming variable is set. A label that has been spent
can never launch again, the marker is written before the child starts so
a container restart cannot pay twice, and an exit 0 without a
`LIVE AI: N turn(s) executed` line is reported as INCONCLUSIVE rather
than as a pass. `test/workspace/livePressureRunner.test.js` pins all of
that, free, and asserts that the workspace and Scott runners use
different marker and authorisation events so a run authorised for one
can never spend on the other.

## Review item 7: the "455 pass" figure

Recorded, and it stands: the adversarial suite skips silently in a bare
`npm test`, so a full-suite pass does not cover the workspace surface. It
must be run by hand against a running instance before each release
decision, with `WORKSPACE_TEST_BASE_URL`, `WORKSPACE_TEST_TOM_PASSWORD`
and `WORKSPACE_TEST_OTHER_PASSWORD` set. The same is true of
`test/scott/adversarialApi.test.js`.

## Evidence from this pass

**Regression suite** against a real database: 498 tests, 496 pass, 0
fail, 2 skipped. The two skips are the paid AI suites for Scott and for
the workspace. (An earlier run in this session reported 71 failures; the
local Postgres had died mid-run. It is recorded here rather than
quietly re-run, because a suite result is only worth anything if the
failures are explained.)

**Adversarial suite** against a running server with all three gates on:
8 checks, 0 fail, 0 skipped. Every check was genuinely exercised,
including the erasure refusal, which the reviewer noted could previously
pass having asserted nothing.

**The reviewer's own F1 attack, replayed end to end** against the
running application, as `nat` (admin, 404 on every workspace page):
reset Tom's password through the real `PUT /api/admin/user/:id/password`
(200), logged in as `tom` successfully, and then:

- every workspace page redirected to `/workspace/unlock` and rendered
  nothing;
- `/api/workspace/contacts/sync` and `/api/workspace/contacts/1/erase`
  both answered 404, with no mention of unlocking or of a passphrase;
- five guessed passphrases were all refused, and the session was still
  locked afterwards;
- all five refusals were recorded in `workspace_activity` as
  `workspace_unlock_failed` against the actor `tom`, which is the
  warning this attack would now generate.

**Two test defects were corrected rather than worked around**, both
found by the checks failing for the wrong reason:

- the locked-session API assertions were getting 403 from the site's
  global CSRF middleware before the workspace guard was ever reached, so
  they were testing CSRF rather than the unlock gate. They now send a
  real token, and assert that they could obtain one.
- the suite logged in as Tom once per block, which was five attempts in
  a run and tripped the site's own login limiter on the fifth. Every
  later assertion then failed for a reason unrelated to the workspace.
  There is now one shared session, and the blocks are ordered so the
  locked checks run before the successful unlock.

## What was NOT changed

- No production merge, no production deploy, no flag set on production.
  Tom has withheld all three until the independent verdict and his own
  production approval.
- No external account connected; nothing published, replied to or spent
  on social.
- No new worker, no lane added, no permission widened, no second human
  granted clearance. The F1 work NARROWS access: it adds a gate, and
  grants nobody anything.
- No change to Scott's clearance model, worker roster or activation
  state.
- No change to the social connector's refusal set, which is what Tom's
  F3 approval is bounded by.
