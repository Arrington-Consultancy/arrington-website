# Response to the ninth independent Governance & Assurance review

Against `review/workspace-v0.1-governance-review-9-2026-08-31.md`
(**AMBER**, P1-P5, two MEDIUM and three LOW, **no HIGH**), reviewed at
frozen head `1710179`.

All five accepted and corrected.

## P1 (MEDIUM). The ninth instance, and the worst shape it has taken.

Accepted without qualification. The N3 fix was **dead code**, and it was
recorded as made in three separate places: the N remediation, a comment
in the module, and `CLAUDE.md`.

`ClaimContentionError` is thrown inside `claimAlertSlot`. That call is
awaited *before* `claimId` is assigned, so a contended failure always
arrives at the catch with `claimId === null` and always takes the `else`
branch. That branch hard-coded `ALERT_ERROR_EVENT` and wrote its own
sentence, ignoring the `outcomeEvent` and `outcomeSummary` computed
three lines above it. The `contended ? ALERT_ABANDONED_EVENT` branch had
no reachable caller at all.

So the original defect stood: 320ms of contention still bought five
minutes of guaranteed silence. And the N1 fix had added a second untruth
in exactly the direction N1 was raised to close, because the function
returned `recordedAs: 'workspace_unlock_alert_abandoned'` while the row
it wrote said `error`.

**The demonstration that should end any argument about test quality:**
the reviewer mutated the frozen head so that contention recorded itself
as a DELIVERED notice buying the full hour, and the entire 538-test
suite stayed green.

**Correction.** Both branches record the same computed outcome. There is
one outcome, so there is one place that decides it.

**And the test.** The case named for N3 called the pure `decideAlert`
helper with null inputs, which is the same failure as K2, M1 and N1: it
asserted something adjacent to the property. The replacement holds the
advisory lock from a second connection so the real function meets real
contention, then asserts the row says contention, that no gating type
was written, that `recordedAs` matches the row, and that the next
genuine burst still fires. **Red against `1710179`.**

## P2 (MEDIUM). My "I could not reproduce it" was wrong.

Accepted, and this one is mine twice over: I reported a null result as
if it settled the question, and the null result came from a harness I
had built badly.

Two variables were off. The stagger has to be **random** rather than a
deterministic ladder, because a fixed ladder puts every caller in the
same relative position every round, so the round either always races or
never does. And the send has to be **short**: a 120ms send lets the
winner finish and resolve its claim before the stragglers arrive, which
closes the very window the test exists to open. I kept the 120ms.

Measured, not asserted: 60 rounds against two defective predecessors with
the index dropped now break **8 times and 4 times**. The profile I had
defended broke **neither: 0 in 60 against both**. The reviewer was right
and the test now carries their profile.

## P3 (LOW). One window was still on the Node clock.

Accepted. "Every authoritative window is now expressed in SQL against
`now()`" was untrue of the threshold window, which decides whether a
burst counts at all. It is in SQL now, with the same future-dating guard
as the others.

## P4 (LOW). Four more evasion shapes, including the guard's own idiom.

Accepted, and the sting is fair: the guard's own file used
`const env = process.env`.

Chasing alias names is the only honest answer, but it has to be done by
what is **read** off the alias rather than by the alias existing. Two
real suites here spread `process.env` into a child process and snapshot
it for restore, and neither is a gate; flagging them would have been the
false-positive failure that gets a guard switched off. The guard now
captures alias and copy names and looks for uppercase reads on them, and
separately flags `process.env` handed to a function as a bare argument.

**Verified against five shapes**, each planted and watched go red:
`const env = process.env`, a renamed destructure, a spread copy that is
then read, `process.env` passed as an argument, and an unconditional
`t.skip`. No false positives on the real tree.

## P5 (LOW). The inaccuracies were in `CLAUDE.md` too.

Accepted. Both are corrected in place and marked as corrections, in the
eighth-review section where they were written, rather than quietly
rewritten. The N remediation carries the same two corrections.

## Evidence

- Full suite: **552 tests, 550 pass, 0 fail, 2 skipped**.
- P1's contention test and P2's corrected profile: **red against
  `1710179`**, green after.
- P2 measured: 8/60 and 4/60 against two defective predecessors, versus
  0/60 for the profile I had defended.
- Drift guard: five evasion shapes caught, no false positives.
- Adversarial by hand: workspace **9/9**, Scott **21/21**.

## What is NOT claimed

- Paid live-AI suites not run.
- No live delivery of the alert email has ever been observed.
- Nothing merged, deployed or enabled.
