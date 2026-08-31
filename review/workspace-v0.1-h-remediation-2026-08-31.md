# Arrington AI Workspace v0.1: response to the third governance review

**Date:** 31 August 2026
**Responds to:** `review/workspace-v0.1-governance-review-3-2026-08-31.md` (verdict AMBER, seven findings H1-H7)
**Written by:** the technical builder. Not an assurance verdict. **AMBER stands.** The builder does not upgrade its own verdict.

---

## The thing worth saying first

Both previous reviews named the same pattern: a security property asserted
in a comment or a document, and untrue in the code. This review found it a
**third** time, in the newest code — the very alert written in response to
the second review. Both of this review's HIGH findings are that pattern.

That is not a coincidence and it is worth naming precisely. The alert was
written to defend against an attacker holding a CMS account, and then
given a default recipient that same account could rewrite (H1), and a
cooldown that a failed send consumed so the alarm could never ring where
mail was unconfigured (H2). Neither needed a clever attack to expose. The
reviewer did not even have to construct H2: it happened by itself in the
real database during the F1 replay.

The lesson I am taking, and writing here so the next pass can hold me to
it: **when a control names an attacker, every input that control depends
on must be checked against what that attacker can write.** I checked the
message body for leaks and did not check the address it was sent to.

## Summary

| Finding | Severity | State |
|---|---|---|
| H1. The alert goes to an address the attacker it warns about can rewrite | HIGH | **Corrected**, verified against the reviewer's own reproduction. |
| H2. A failed send consumes the cooldown, silencing the alarm | HIGH | **Corrected**, verified against the reviewer's own reproduction. |
| H3. The alert's deployment dependencies are unreported and undocumented | MEDIUM | **Corrected.** |
| H4. G8 was corrected on one of the two surfaces F6 named | LOW | **Corrected**, with a test that pins both. |
| H5. Failure count is per-username; cooldown was global | LOW | **Corrected.** |
| H6. The distinctive-canary rule was weak and the minimum was one | LOW | **Corrected in part**; the snapshot half is genuinely blocked, see below. |
| H7. `buildAlert`'s "structural" guarantee was a convention plus a string test | LOW | **Corrected.** |

## H1. Corrected

`alertRecipient` fell through to the CMS content row `contact.email` when
the optional `WORKSPACE_ALERT_EMAIL` was unset. That row is ordinary site
content, editable by anyone holding `edit_content`, which both the admin
and content roles hold by default. The attacker this control exists to
warn about holds exactly such an account. The reviewer demonstrated the
retarget end to end with one `PUT /api/content`.

The recipient now comes only from places CMS admin cannot reach: the
Railway variable, or the hard-coded owner constant. No database value is
consulted at all, and **the function no longer takes a database handle**,
so a query cannot be reintroduced into it without that edit being
obvious. A test asserts the arity as well as the behaviour.

The test that previously *pinned* the vulnerable fallback now forbids it.

Verified by replaying the reviewer's own demonstration against the real
database:

```
contact.email is now: attacker@evil.example
alertRecipient()    : tom@arringtonconsultancy.com
RETARGETED?         : NO - H1 CLOSED
```

## H2. Corrected

A failed send wrote the same `workspace_unlock_alert_sent` row a success
did, so it started the sixty-minute cooldown. Where `GMAIL_APP_PASSWORD`
is unset every send fails, so the alarm could never fire, and the only
record of that was behind the unlock — precisely the failure G6 was
raised to fix.

Failures now have their own event type, `workspace_unlock_alert_failed`.
Only a **delivered** notice buys quiet. A failure earns a short five
minute backoff instead, so a broken mailbox cannot become a mail storm
but also cannot silence the alarm for an attack. `decideAlert`'s reason
is worded from the recorded state: it says "a notice was DELIVERED" or
"the last notice FAILED to send", never "an alert was already sent" when
none was — which was this module breaking its own fourth rule in the one
place it was not looking.

Verified against the reviewer's reproduction:

```
scenario 1 (send FAILS): {"sent":false,"error":"SMTP timeout"}
scenario 2 (mail WORKS): {"sent":true}
messages delivered     : 1
SILENCED?              : NO - H2 CLOSED

recorded:
  workspace_unlock_alert_failed | Security notice FAILED to send after 3 failed...
  workspace_unlock_alert_sent   | Security notice DELIVERED after 3 failed...
```

## H3. Corrected

The boot line reported the three access gates and said nothing about the
fourth thing the workspace now depends on — whether its alarm can ring.
An operator could configure everything correctly, read a line saying the
gates were fine, and be running with a security control that could never
fire.

It now reports that too, on the same honest pattern, and observed on a
real boot:

```
Workspace access: flag on | owner binding ok (username 'tom', expects user id 2)
 | WORKSPACE_ACCESS_PASSPHRASE set, length 32
 | failed-unlock alert CANNOT be sent: GMAIL_APP_PASSWORD is unset. The alarm is
   inert in this environment. It would otherwise go to tom@arringtonconsultancy.com
 | actual ids in this database: tom=2 | RESULT: the cleared owner can unlock
```

Both `GMAIL_APP_PASSWORD`'s workspace role and `WORKSPACE_ALERT_EMAIL`
are now in the deployment variable list in `CLAUDE.md`, with the H1
reasoning attached to the latter so nobody reinstates the CMS fallback
as a convenience.

## H4. Corrected

F6 named two surfaces rendering `repo.listActivity` rows; G8 corrected
one, and my remediation said "it now gates on confidential" without
qualification. The dashboard strip still gated at `commercial`.

Both now read a single `ACTIVITY_SENSITIVITY` constant. A test asserts
the constant's value, that exactly two call sites use it, and that
neither has gone back to a literal. Three findings (F6, G8, H4) were the
same gap corrected one surface at a time; the shared constant is what
stops a fourth.

## H5. Corrected

The failure count was scoped by actor and the cooldown was not, so with a
second cleared human one person's alert would suppress the other's for an
hour — and the person under attack is the one who would hear nothing.
Both cooldown queries are now scoped by username. A test asserts every
cooldown query carries the account name.

## H6. Corrected in part, and the blocked half is named

Two problems. The rule accepted any leading capital minus a 23-word stop
list, so "Sometimes" and "Therefore" counted as evidence; and the minimum
was one distinctive token.

Corrected: the minimum is now three. A leading capital alone no longer
qualifies — a token needs a digit, an internal capital, or to be a
capitalised word that passes both a morphological test and a common-word
list of several hundred entries rather than 23.

**Stated rather than glossed:** this sandbox has no system wordlist
(`/usr/share/dict/words` is absent), so a true dictionary test is not
available and this remains a heuristic. Three things reduce what rests on
it: strong signals never depend on it, the minimum is three, and the case
skips as NOT EXECUTABLE rather than passing when the bar is not met.

**Not done, and genuinely blocked:** the reviewer also asked for more
than two confidential records seeded before the next paid run. The
records come from the encrypted brain snapshot, and re-seeding needs
`WORKSPACE_SNAPSHOT_KEY`, which this session does not hold. It is
recorded as outstanding rather than worked around. Until it is done, an
`ok` on that case should not be read as strong evidence of the clearance
boundary, and the skip message now says so in those words.

## H7. Corrected

The comment claimed the alert's emptiness was structural "because none of
those is a parameter", and the test pinned it with
`buildAlert.length === 1` — which is 1 for any single options object, so
adding a field would have kept it green. A fourth comment claiming a
property the code did not have.

`buildAlert` now declares `ALERT_FIELDS`, the exact key set it is
permitted to read, and **throws** on anything else rather than quietly
rendering it. The test asserts the key set and that a field carrying
workspace content is refused:

```
buildAlert received field(s) it is not permitted to read: recentRecordTitles
```

## What was NOT changed

- No production merge, deploy or enablement.
- No scope, permission, worker authority or live-system behaviour widened.
  Every change here narrows: a recipient that cannot be redirected, a
  cooldown that cannot be consumed by a failure, a gate moved one level
  tighter, a canary bar raised.
- The unlock attempt limiter is still in-memory, as recorded against G6.
- The brain snapshot is unchanged (see H6).
