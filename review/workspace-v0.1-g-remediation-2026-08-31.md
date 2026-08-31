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
| G3. Three post-review commits added un-reviewed scope, incl. a live AI chat surface on the public Scott demo | MEDIUM | **CLOSED.** Tom chose Option B on 31/08/2026 and named all three changes. |
| G4. The leak probe rests on one distinctive token; the guard tests a copy of the filter | MEDIUM | **Corrected.** |
| G5. Session fixation: login never regenerates the session id | MEDIUM | **Corrected**, site-wide. |
| G6. The unlock attempt budget resets on any process restart | LOW | **Closed on the half that matters.** Tom instructed the alert be built; it is. The limiter store is unchanged and stated. |
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

## G3. Closed. Tom chose Option B on 31/08/2026

I verified the reviewer's claim rather than taking it on trust.
`views/scott/social.ejs` **does not exist on main at all**; the whole page
is new on this branch, and line 32 includes the chat widget partial.
`routes/scott.js` now passes `aiEnabled` and `workersById` to every Scott
data page. Scott is live on the public site with `ENABLE_SCOTT_AI=true`,
so merging this branch adds a live AI chat surface to a released public
demonstration.

Tom's decision, verbatim:

> "I explicitly approve the following three items as part of this release
> candidate: 1. The new Scott social page, including its live AI chat
> widget on the public Scott demonstration. 2. The new Scott fictional
> social records. 3. The new Arrington social memory source containing
> real Arrington material. This approval is limited to those three named
> changes. It does not widen worker permissions, Scott clearance,
> autonomous actions or any of the previously excluded Social action
> classes."

The three commits are `4da96ae`, `aa9fee2` and `1b770eb`. Nothing was
changed in response: the scope now approved is the scope on the branch.

The bound is the standing obligation. Worker permissions, Scott clearance
and the six refused Social action classes are untouched by these commits
and must stay untouched by anything that follows: widening
`ACTION_CLASS_HUMAN`'s complement, adding a write scope, granting a
persona a new domain or introducing a credential write path would each
exceed this approval rather than extend it.

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

## G6. The alert is built. The limiter store is not, and that is stated

Tom's instruction, verbatim:

> "A failed-unlock security warning must not only appear behind the
> Workspace unlock it is protecting. Add a bounded security alert to the
> configured owner/admin email when the failed-unlock threshold is
> triggered. Do not expose the passphrase, guessed values or confidential
> Workspace content in that alert."

`lib/workspace/unlockAlert.js` does that. Four properties, each of which
is about not letting the alert become a liability of its own:

1. **It carries nothing from inside.** No passphrase, no length, no
   guessed value, no record, contact or count. The guarantee is
   structural rather than textual: none of those is a parameter of
   `buildAlert`, so none can appear however it is called, and a test
   pins the signature so it cannot quietly grow one. The message names
   `WORKSPACE_ACCESS_PASSPHRASE` as the thing to rotate, which is
   necessary advice and discloses nothing about its value.
2. **It is bounded.** One notice per hour however many attempts arrive.
   A security control that turns a guessing loop into a mail flood is a
   denial-of-service against the owner delivered by his own alarm.
3. **The count comes from the database, not from memory.** This is the
   other half of the finding. The attempt limiter resets on any
   container restart, so a memory-resident counter would reset with it
   and a patient attacker restarting between bursts would never trip it.
   `workspace_activity` rows outlive the process.
4. **It cannot fail the request it is attached to, and cannot claim a
   send that did not happen.** It is not awaited, so a mail problem
   changes neither the answer nor its timing (a timing difference here
   would itself be a signal). The send returns a result, the result is
   what gets written, and a failure is written as a failure with its
   real error. Same discipline as `lib/scott/gapNotifier`.

Verified end to end against a running server and a real database. Four
wrong passphrases through the real endpoint produced:

```
tom    | workspace_unlock_failed     | ...refused: the passphrase did not match.
tom    | workspace_unlock_failed     | ...refused: the passphrase did not match.
tom    | workspace_unlock_failed     | ...refused: the passphrase did not match.
system | workspace_unlock_alert_sent | Security notice could NOT be sent after 3 failed
                                     | unlock attempt(s) against "tom": email is not
                                     | configured in this environment...
tom    | workspace_unlock_failed     | ...refused: the passphrase did not match.
```

The alert fired on the third attempt, before the limiter's budget of five
was exhausted, and the fourth produced no second alert. Note what the
recorded row says: locally there is no `GMAIL_APP_PASSWORD`, and it
recorded a failure with the real reason rather than a send.

With a transport injected, the message it actually produces was captured
and checked: it went to the configured address, and

```
contains the passphrase: false
contains a guessed value: false
```

**Recipient**: `WORKSPACE_ALERT_EMAIL` if set, so a security alert can be
routed somewhere other than the address printed on the public website;
otherwise the site's own `contact.email`; otherwise the hard default. A
database that cannot be read still yields a real address, because an
alert sent to an empty string is an alert lost.

**Not done, and stated rather than implied**: the attempt limiter still
uses the in-memory store, so the five-per-fifteen-minutes budget still
resets on a restart. Moving it to Postgres is a change to shared site
infrastructure and is not in this candidate. The real bound on guessing
remains the passphrase's own entropy; what has changed is that a person
now hears about it.

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
- The three commits G3 identifies are untouched, and now explicitly
  approved rather than pending.
- The unlock limiter store is unchanged and still in-memory.
