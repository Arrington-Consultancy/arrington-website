# Response to the eighth independent Governance & Assurance review

Against `review/workspace-v0.1-governance-review-8-2026-08-31.md`
(**AMBER**, N1-N5, two MEDIUM and three LOW, **no HIGH**), reviewed at
frozen head `6226673`.

All five accepted and corrected.

The reviewer's headline is theirs, established with their own
instruments: the concurrency guarantee now holds across roughly **1,500
bursts** in nine harness shapes, zero duplicated and zero wrongly silent,
with the same harnesses breaking the previous head at 4% and 10.7% and
reproducing M1's worker crash 240 times out of 240. All three gates held,
including 45/45 workspace paths byte-identical to a genuine 404 and the
full F1 takeover stopping at the unlock screen.

## N1 (MEDIUM). The eighth instance, in the commit that fixed the seventh.

Accepted, and it is the one that matters. M2 corrected one direction of
the honesty rule and opened the other. Any failure **after** the send -
including the single statement that records the outcome - was reported as
`NO send was attempted`, about a message that had genuinely reached the
mailbox. It also started no cooldown, so a duplicate followed five
minutes later. The reviewer measured two messages for one burst.

**Correction.** Whether a send was attempted, and what it returned, is
recorded before the send and decides what is written afterwards. Three
cases, and only the first may ever say nothing was sent:

- nothing attempted → error, no cooldown;
- attempted and failed → failed send, short backoff;
- attempted and **succeeded** → delivered, and the hour starts, because
  a message that reached the mailbox is delivered whatever went wrong
  while recording it.

The same untruth was also being handed to the caller: the catch returned
`sent: false` for a delivered notice. It now returns what happened.

**The test was the finding.** The case pinning M2's property used a
`sendFn` that *throws* - a send that WAS attempted - and then asserted
the "nothing was attempted" wording, so it passed against the very defect
it was named for. It is replaced by two: a throwing transport must be
recorded as a **failed send**, and a **successful** send whose recording
then fails must be recorded as delivered, must not say `NO send was
attempted`, and must start the hour so the duplicate cannot follow. Both
are red against `6226673`.

## N3 (LOW). Contention bought the send backoff.

> **CORRECTION, added 31/08/2026 after governance finding P1.** The fix
> described below was **dead code and the defect stood.**
> `ClaimContentionError` is thrown inside `claimAlertSlot`, which is
> awaited before `claimId` is assigned, so a contended failure always
> reached the branch that hard-coded the error type and wrote its own
> sentence, ignoring the outcome computed above it. This was recorded as
> corrected here, in a code comment, and in `CLAUDE.md`. It was not. The
> test named for it called the pure helper with null inputs, which is
> why nothing caught it. See the P remediation.

Accepted. `ClaimContentionError` was declared distinct and then handled
identically to a database fault, so losing a race earned the five-minute
backoff and silenced a genuine burst - the opposite of the reasoning
applied to an abandoned claim eleven lines away. Contention is now
recorded as abandonment, which gates nothing.

## N4 (LOW). Two clocks, and a future-dated claim silenced the alarm.

> **CORRECTION, added 31/08/2026 after findings P3 and Q2.** "Every
> authoritative window" was untrue when written: the threshold window
> was still on the Node clock (P3), and even after that the phrasing was
> over-broad (Q2), because `decideAlert`'s comparisons are still in
> JavaScript. That is deliberate - they produce the reason string and
> keep the rule testable without a database - and where the two clocks
> disagree the SQL gate wins. The accurate statement is that the
> authoritative gate, the conditional INSERT, is entirely in SQL.

Accepted. Claim ages were computed from the Node clock against
timestamps written by the database clock. Those clocks demonstrably
disagree here - a claim seconds old has been observed reading a minute in
the future - and a future-dated claim is newer than any lease, so it was
never reclaimed and never expired.

**Correction, at the root rather than by clamping.** Every authoritative
window is now expressed in SQL against `now()`, so one clock decides. A
claim dated implausibly ahead is reclaimed rather than trusted, and
`decideAlert` ignores any timestamp more than a minute in the future,
because for an alarm the safe direction is to notify.

**A second defect found while fixing it:** the reclaim ran *after* the
state was read, so `decideAlert` still gated on the future-dated row and
never reached the takeover. The reclaim now happens first. The test for
this was red until that ordering changed.

## N5 (LOW). The drift guard, third pass, and a change of method.

Accepted, and the criticism is the same one M4 made. Three cycles of
adding patterns, and each cycle a reviewer found more shapes that walked
past them, including the hoisted-const form this repository's own suites
use.

**So it no longer matches how a gate is written.** A suite cannot decline
to run on configuration without *reading* configuration, so the guard now
looks for environment reads outside a small ambient allowlist, ignoring
names the file itself assigns (setting a variable is manipulating it, not
gating on it). The shape check is kept alongside for the one thing the
semantic check cannot see: an unconditional `t.skip`, which reads nothing
at all.

**Verified against seven shapes**, each planted and confirmed to turn the
guard red: hoisted const, `t.skip`, `describe.skip`, spread options,
early return with and without a comment, bracket access, and
destructuring.

## N2 (MEDIUM). The guard was blind to what it guards. Accepted, and partly not demonstrated.

Two halves.

**The structural changes are now named in the test tree.** None of the
four from the previous cycle appeared anywhere in it, so the guarantee
rested on code review alone, which is how seven previous defects
survived. Added: the **database itself** refuses a second unresolved
claim (asserting a `23505`, not that the code declines); one account's
claim cannot block another's; an abandoned claim is recorded and does
**not** gate; a future-dated claim is reclaimed.

**The arrival stagger is kept. I reported that I could not reproduce the
reviewer's measurement; that report was wrong (finding P2). Two
variables were off: the stagger has to be RANDOM rather than a fixed
ladder, and the send has to be SHORT. Corrected, 60 rounds against two
defective predecessors break 8 and 4 times, where the profile I defended
broke neither. The original text follows for the record.**

**The arrival stagger is kept, but I could not reproduce the reviewer's
measurement and am not claiming otherwise.** They showed the committed
profile running clean 150/150 against defective code, and 16 failures in
150 once a 0-40ms stagger was added. Fifty rounds at each profile against
**both** candidate predecessors, with the unique index dropped so the old
failure mode was reachable, produced zero bad rounds either way on this
machine. So the stagger is a more realistic arrival pattern and nothing
more than that has been demonstrated here. The comment in the test says
exactly this rather than restating the reviewer's figure as if it were
mine, and the structural tests above are the ones carrying the weight.

## Evidence

- Full suite: **538 tests, 536 pass, 0 fail, 2 skipped**.
- N1 and N4 tests: **red against `6226673`**, green after.
- Seed: fresh, duplicate-polluted, and index-present databases, each
  seeded twice, all clean with the index present.
- Adversarial by hand: workspace **9/9**, Scott **18/18**, nothing
  skipped.
- Drift guard: seven evasion shapes, all caught.

## What is NOT claimed

- Paid live-AI suites not run.
- No live delivery of the alert email has ever been observed.
- The stagger's added sensitivity is the reviewer's finding, not a
  measurement of mine.
- Nothing merged, deployed or enabled.
