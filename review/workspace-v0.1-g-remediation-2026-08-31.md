# Arrington AI Workspace v0.1: response to the second governance review

**Date:** 31 August 2026
**Responds to:** `review/workspace-v0.1-governance-review-2026-08-31.md` (verdict AMBER, nine findings G1-G9)
**Written by:** the technical builder. Not an assurance verdict. **AMBER stands.** The builder does not upgrade its own verdict, and one finding is reserved to Tom.

---

## Summary

| Finding | Severity | State |
|---|---|---|
| G1. `X-Robots-Tag` announces every workspace route, with the flag OFF | HIGH | **Corrected.** Verified with the flag off, which was the worst part. |
| G2. Unlock/lock answer JSON where a missing endpoint answers HTML | MEDIUM | **Corrected**, and both endpoints added to the adversarial suite. |
| G3. Three post-review commits added un-reviewed scope, incl. a live AI chat surface on the public Scott demo | MEDIUM | **OPEN, reserved to Tom.** Not something a builder can close. |
| G4. The leak probe rests on one distinctive token; the guard tests a copy of the filter | MEDIUM | **Corrected.** |
| G5. Session fixation: login never regenerates the session id | MEDIUM | **Corrected**, site-wide. |
| G6. The unlock attempt budget resets on any process restart | LOW | **Partly corrected**: see below. The detection half is the real point. |
| G7. A trailing newline in the passphrase locks Tom out while the boot line says it is fine | MEDIUM | **Corrected.** |
| G8. `/workspace/activity` gated one level wider than the material it quotes | LOW | **Corrected.** |
| G9. `emailHash` falls back to a hard-coded key when `SESSION_SECRET` is unset | LOW | **Corrected.** |

---

## G1. Corrected, and it was a real one

The reviewer is right, the finding is mine, and the claim it falsified was
mine too. `workspaceNoindex` was registered **before** the access guard on
every workspace route, so it stamped `X-Robots-Tag: noindex, nofollow` on
the denial as well as on a served page. A path that does not exist gets no
such header. An anonymous scanner could therefore still separate a real
workspace route from a missing one and enumerate the page list, without a
session.

I reproduced it before changing anything, on an instance with **no
workspace variables set at all**, which is production's configuration if
this branch merges:

```
/workspace          -> X-Robots-Tag: noindex, nofollow
/workspace/contacts -> X-Robots-Tag: noindex, nofollow
/workspace/brain    -> X-Robots-Tag: noindex, nofollow
/workspace/gaps     -> X-Robots-Tag: noindex, nofollow
/workspace/nonsense -> <no X-Robots-Tag>
/definitely-not-a-page -> <no X-Robots-Tag>
```

So the sentence in `lib/workspace/access.js` and in `CLAUDE.md` that
"merging is inert" was false. On merge the public site would have begun
announcing the area's existence and its exact page names to anyone who
asked. That is the second time the same property has been asserted and
found untrue, which is the pattern the reviewer names, and it is worth
recording rather than quietly fixing.

**The fix.** `workspaceNoindex` is gone as a middleware. It is now
`setNoindex(res)`, a plain function called only on the success path after
the access decision, and it is deliberately not exported as middleware any
more so it cannot be reintroduced ahead of a guard by someone copying an
existing route registration. All eleven registrations were stripped.

Verified after the change, flag off:

```
/workspace          -> 404  x-robots-tag headers: 0
/workspace/contacts -> 404  x-robots-tag headers: 0
/workspace/brain    -> 404  x-robots-tag headers: 0
/workspace/gaps     -> 404  x-robots-tag headers: 0
/workspace/unlock   -> 404  x-robots-tag headers: 0
/workspace/nonsense -> 404  x-robots-tag headers: 0
/definitely-not-a-page -> 404  x-robots-tag headers: 0
```

And flag on, anonymous: no `X-Robots-Tag` on any denial. The header still
arrives on every page a cleared, unlocked session is served, which the
adversarial suite asserts.

**The test gap that let it through is closed too.** The suite compared
status and nonce-normalised body and nothing else. It now compares the
full response header set against the control path, excluding only headers
that legitimately vary per response (date, content-length, set-cookie,
rate-limit counters). The CSP header is compared rather than excluded,
with its per-request nonce normalised the same way the body's is, because
excluding it would blind the check to a genuine CSP difference.
`/workspace/unlock` is added to the probed page list.

## G2. Corrected

`requireWorkspaceIdentity` hand-wrote a JSON 404 where a genuinely missing
endpoint answers with the site's HTML 404, so the two were distinguishable
by shape even with matching status. It now goes through `render404` like
every other denial, which negotiates HTML or JSON from the Accept header
exactly as the real handler does. Both `/api/workspace/unlock` and
`/api/workspace/lock` are added to the adversarial suite's probe list; the
suite correctly excludes them from the locked-session refusal check, since
they are the way out of being locked and refusing them would make the
workspace unopenable.

## G3. OPEN. Reserved to Tom

I have verified the reviewer's claim rather than taking it on trust.
`views/scott/social.ejs` **does not exist on main at all**; the whole page
is new on this branch, and line 32 includes the chat widget partial.
`routes/scott.js` now passes `aiEnabled` and `workersById` to every Scott
data page. Scott is live on the public site with `ENABLE_SCOTT_AI=true`.

So merging this branch adds a live AI chat surface to a released public
demonstration, arriving inside a release candidate for an unrelated,
flag-gated internal area. That is a change to a live system.

Tom's F3 approval reads "already presented to Governance ... bounded to
that reviewed scope". These three commits landed **after** the 30/08
review was issued, so by the wording of his own approval they fall
outside it. I am not treating them as covered, and I have not lifted them
out either, because he asked for the Bob Fletcher social page on both
systems and removing it unilaterally would discard work he requested.

His two options are the reviewer's: lift the three commits out and bring
them as their own change with their own review, or record an explicit
decision naming the Scott chat widget on live, the new Scott social
records and the new Arrington social memory source individually.

## G4. Corrected

Two separate weaknesses, both real.

The free half guarded a **re-implementation** of the canary filter rather
than the filter, so the two could drift apart silently while the guard
kept passing. There is now one `deriveCanaries()` used by both halves.

And `canaries.length > 0` could not tell a strong canary set from a
worthless one. The reviewer executed the real derivation against the
seeded snapshot and got six canaries of which one was distinctive. The
case now computes how many are *discriminating* (a proper noun or a token
carrying a digit, excluding an explicit list of ordinary English), prints
the set, and **skips as NOT EXECUTABLE** when none is distinctive rather
than reporting a clean pass that rests on ordinary vocabulary.

Note that this means the paid run of `ws-20260831-c` proved less on its
third case than its `ok` implied. The provenance assertion it also carries
(no confidential record key reached the prompt) is the part that held.

## G5. Corrected, site-wide

`routes/auth.js` now calls `req.session.regenerate()` on successful login
before assigning `req.session.user`. The session id an anonymous visitor
arrives with is no longer the id they hold afterwards, so a planted
`connect.sid` is worth nothing once a real login happens, and any
workspace unlock riding on the old session is discarded with it.

The reviewer is right that this is a pre-existing site-wide weakness
rather than one this branch introduced, and right about why it mattered
more here: a fixated session used to get CMS content and would now get the
controlled brain and the erasure control.

Verified by re-running the adversarial suite end to end after the change:
login, unlock, page access and erasure refusal all still work.

## G6. Partly corrected, and the honest half stated

The attempt budget is still `express-rate-limit`'s in-memory store, so a
container restart returns it to five. Moving it to Postgres is a change to
shared site infrastructure that I am not making inside this candidate.

The reviewer's sharper half is the part that matters and I am recording it
rather than answering it: the `workspace_unlock_failed` rows are only
visible on `/workspace/activity`, which requires the unlock to view. In
the exact scenario this gate exists for, the attacker is locked out and
Tom may also be locked out of the CMS account whose password was changed.
Nothing is emailed. My own sentence, "it is the only warning anyone would
get", was accurate and the warning is delivered to a screen nobody in that
scenario can open.

Notifying on a burst of failed unlocks through the existing Gmail path is
the right fix. It is new outbound behaviour on a candidate under review,
so it is proposed rather than built.

## G7. Corrected

`configuredPassphrase` tested `v.trim()` and returned the **untrimmed**
value, so a trailing newline on the Railway variable made the passphrase
unusable while the boot line reported it correctly set. This repository
has a documented history with exactly that failure mode.

It now trims once, so every caller sees the same value, and
`describeUnlockConfig` reports the trimmed length and says explicitly when
the stored value carries surrounding whitespace. Verified against the
reviewer's own case:

```
WORKSPACE_ACCESS_PASSPHRASE = 'correct-horse-battery\n'
describeUnlockConfig: ok, "length 21 (stored value carries 1 character(s)
                            of surrounding whitespace, which are ignored)"
matches without the newline: true
matches with the newline   : false
```

## G8. Corrected

`/workspace/activity` gated on `commercial` while its own comment claimed
it was gated "at the same level as the narrowest thing it can quote", and
a gap's sensitivity can be `confidential`. It now gates on `confidential`.
The comment asserting a property the code did not have is the same pattern
as F1, F2 and G1, which is why it is worth more than a one-word change.

## G9. Corrected

`hashEmail` fell back to a hard-coded key when `SESSION_SECRET` was unset,
which reinstated the F4 membership oracle in development, CI and any
throwaway database where erasure is exercised. It now throws with an
explanation rather than degrading quietly.

## What was NOT changed

- No production merge, no production deploy, no production enablement.
- The three commits G3 identifies are untouched, pending Tom's decision.
- The unlock limiter store and the failed-unlock notification are
  proposed, not built.
