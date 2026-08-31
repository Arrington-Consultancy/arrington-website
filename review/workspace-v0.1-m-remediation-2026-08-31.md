# Response to the seventh independent Governance & Assurance review

Against `review/workspace-v0.1-governance-review-7-2026-08-31.md`
(**AMBER**, M1-M5, three MEDIUM and two LOW, **no HIGH, no defect in
production code**), reviewed at frozen head `39812ac`.

All five accepted and corrected. The verdict is not mine to change.

This pass verified the concurrency work independently rather than
reading it — five separately written harnesses, roughly 380
threshold-sized bursts, zero silent and zero duplicated, with the same
harnesses reproducing both previous HIGH defects against the older head.
That is the strongest evidence this candidate has had, and it is the
reviewer's, not mine.

## M1 (MEDIUM). The worker called `db.end()`, which `db/pool.js` does not have.

Accepted without qualification. It is the **same wrong assumption about
the same module as L1, written eleven lines below the comment explaining
L1**. Every one of the twelve workers exited 1 on a `TypeError`, and the
test's own error assertion reported zero because it discarded
`execFile`'s exit code whenever a JSON line had already been printed.

**Correction.** The worker asks the module what it offers
(`db.end` / `db.pool.end` / neither) instead of assuming, and the test
now folds a non-zero exit into the worker's error even when output was
produced. The stated reason for L1's fix — identify positively, do not
assume a shape — evidently needed applying to the surrounding code and
not only to the function under review.

## M2 (MEDIUM). An evaluation failure was reported as a failed send.

Accepted. A failure before any send — a database error, or the H7 field
guard firing — was recorded as `ALERT_FAILED_EVENT`, bought the
five-minute send backoff, and made the register say *"the last notice
FAILED to send"* about an attempt that never reached a mailbox. That is
the precise prohibition in this module's own rule 4.

**Correction.** A distinct `workspace_unlock_alert_error` type, its own
branch in `decideAlert` with wording that says no send was attempted,
and durable summaries that say the same. Tested end to end: the row, its
summary, and the reason handed to the next caller must all say that
nothing was sent, and the failed-send type must be absent.

## M3 (MEDIUM). Retry exhaustion was silent and returned a constant.

Accepted: `lastReason` was a `let` that was never reassigned, so
exhausting every retry was indistinguishable from losing one round, and
nothing durable was written.

**Correction, after one wrong turn worth recording.** My first attempt
threw on exhaustion. That was an overcorrection: with twelve racing
processes it fired routinely, because a fixed 100ms retry keeps callers
that started together in lockstep so they collide every round — and it
would have written error rows and suppressed real alerts for five
minutes during ordinary contention. Caught by running it, not by reading
it.

What landed instead: **jitter** on the retry (0.5x-1.5x), so a burst
de-synchronises; and on exhaustion a check of whether another caller
actually claimed the burst. If one did, standing down is correct and
silent. Only contention that leaves the burst **unhandled** raises, and
that path is recorded durably.

## M4 and M5 (LOW). Both accepted and corrected.

M4: the drift guard's fourth shape matched a *trailing comment* rather
than a gate. It now matches the guard itself — a `return` conditioned on
an environment variable. Verified against five shapes including the two
that previously evaded: all five caught, each confirmed by planting a
file and watching the guard go red.

M5: `WORKSPACE_TEST_PASSPHRASE` was missing from the `armed` map, so a
run without it printed `[RAN ]` over a suite whose post-unlock half had
asserted nothing. Reporting a half-run suite as run is the same
dishonesty rule 4 forbids elsewhere.

---

## What the M3 investigation turned up, which is larger than any of M1-M5

Chasing M3 I re-measured the concurrency bound myself and found a
**duplicate rate of about 5%** — two notices from one burst, 3 rounds in
60 — that the reviewer's harnesses had not hit and that the advisory
lock did not prevent.

Instrumenting the real decision path rather than reasoning about it
showed why, and it is not a lock failure. `decideAlert` reads the state,
and the INSERT that acts on that decision is a **later moment**. A caller
can read an empty table, be descheduled, and insert after another caller
has claimed, sent and *resolved* its row — at which point the claim slot
is free again and nothing rejects the late write. Neither caller does
anything wrong; the decision is simply older than the write it
authorises.

Two changes close it, and both make the guarantee structural rather than
sequential — which is the thing every previous fix in this module failed
to do:

1. **The guard travels with the write.** The `NOT EXISTS` predicate is
   back inside the INSERT, so the check and the write share one
   snapshot. This is deliberately the shape that was wrong before K1, and
   it is sound now for the reason it was not sound then: the advisory
   lock means no other transaction sits between them.
2. **A partial unique index**, `uq_workspace_alert_pending` on `subject`
   where the row is an unresolved claim. A second concurrent claim is
   refused by Postgres whatever the callers do; the `23505` is caught and
   treated as standing down.

A claim abandoned by a dead process is retired to a distinct
`workspace_unlock_alert_abandoned` type — recorded, per J3, but
deliberately not one of the types that gates a later attempt, since
nothing was tried and the whole point of the lease is that the alarm
recovers.

**Measured after the change: 100 consecutive bursts of 8 concurrent
callers, exactly one notice every time, zero duplicates, zero silent,
zero backends left idle in transaction and zero advisory locks held.**

### And a production-crash bug the index nearly introduced

`CREATE UNIQUE INDEX` fails if duplicates already exist — and duplicate
claims are exactly what J1 and K1 produced, so a database that ran that
code can hold them. The seed is the start command, so the app would have
crashlooped on boot on precisely the deployments most likely to be
affected. Same class as the Scott release incident: a migration that is
fine everywhere except the one place it has to work.

The seed now retires superseded duplicates before building the index.
**Verified three ways:** a fresh database seeded twice; a database
deliberately polluted with duplicate claims, which now migrates cleanly
and is idempotent on re-run; and the index confirmed present in both.

## Evidence

- Full suite: **532 tests, 530 pass, 0 fail, 2 skipped**.
- Alert suite: three consecutive clean runs, 26 assertions each.
- 100 concurrent bursts: exactly one notice each; nothing stranded.
- Adversarial suites by hand: workspace **9/9**, Scott **18/18**, nothing
  skipped.
- Seed: fresh twice, and recovery from pre-existing duplicates.
- Drift guard: five evasion shapes, all caught.

## What is NOT claimed

- Paid live-AI suites not run.
- No live delivery of the alert email has ever been observed.
- Nothing merged, deployed or enabled.
