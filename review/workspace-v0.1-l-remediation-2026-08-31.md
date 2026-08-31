# Response to the sixth independent Governance & Assurance review

Against `review/workspace-v0.1-governance-review-6-2026-08-31.md`
(**AMBER**, L1-L5, **three HIGH**), reviewed at frozen head `4d8c327`.

All five accepted. All five corrected. The verdict is not mine to change.

**This pass raised the severity for the first time in the chain**, and it
should have. Two of the three HIGH findings are defects I introduced in
the previous cycle while correcting the cycle before that, and the third
is a secret exposure I reported as closed twice and had not closed.

## The pattern, sixth instance, and what is different about this one

Five reviews found a property asserted and not held. This one found the
same thing again — but L1 is worse than its predecessors, because the
*mechanism I added to make the property true had never once executed.*

`db/pool.js` exports `{ query, pool }`. My pool test was
`typeof db.connect === 'function' && typeof db.totalCount === 'number'`.
A plain object has neither. So for the handle that the application, both
concurrency tests and the worker script all pass, the test was false, the
dedicated-client branch was dead, and BEGIN, the advisory lock, the
INSERT and COMMIT each went out through the pool's round-robin shorthand
**on a different connection**. There was no transaction. The lock was
released the moment its own implicit transaction ended. Connections were
left stranded idle in transaction, one still holding the lock.

The reviewer instrumented it: **65 calls across the suite, 65 not-pool,
0 pool.** My remediation had said "both paths are exercised". Neither
was.

It passed every test I ran because on an idle pool node-postgres hands
the just-released connection straight back to the same caller, so the
statements happened to land together. That is the cold-pool artefact of
K2 wearing a different hat: **I fixed the test's easy path and then
wrote new code whose correctness depended on a different easy path.**

The lesson I am recording, because "test the real function" was evidently
not enough on its own: **assert the branch, not just the outcome.** A
test that only checks the result cannot tell a working mechanism from a
mechanism that never ran and got lucky. There is now a test that asserts
which connection branch the *deployed handle* resolves to, and it fails
against the previous head.

---

## L1 (HIGH). The advisory lock never ran on the deployed path. Accepted.

**Correction.** Connection acquisition is now positively identified by
`dedicatedConnectionSource(db)`, which returns `'pool'` (a real `pg.Pool`),
`'wrapper'` (this codebase's `db/pool.js`, via `db.pool.connect()`),
`'client'` (an already checked-out `PoolClient`, identified by `release`)
or `null`.

**`null` throws rather than continuing.** Running on a handle that cannot
hold a transaction is precisely the defect; carrying on regardless is how
it stayed invisible. `maybeAlertOnFailedUnlock`'s outer catch records the
throw durably (finding J3), so a misconfigured handle surfaces as a
recorded alarm failure instead of an alarm that quietly stopped being
atomic.

**Tests, all red against `4d8c327`:**
- the deployed handle (`require('db/pool')`) resolves to a dedicated
  connection, and specifically to `'wrapper'`;
- a query-only shorthand is *refused*, not silently used;
- a real `Pool` and a checked-out client are both recognised.

**Measured after the fix:** 3 rounds of 10 concurrent callers on a warmed
pool produced exactly one notice each, with **0 backends idle in
transaction and 0 advisory locks still held** afterwards.

## L2 (HIGH). The fix could produce NO alert at all. Accepted.

This is the one that genuinely alarms me, because it is a worse failure
than the one it replaced. `failuresInWindow` was read *outside* the lock.
A caller holding a stale, sub-threshold count could win the lock, decide
no alert was due, write nothing — and every concurrent caller that could
see the true count had already been refused by the try-lock and never
retried. The burst was then silent. Worst at exactly the threshold of
three, which is the most likely real burst.

Bounded duplicates traded for unbounded silence, in the single control
designed to reach a person who cannot open the workspace.

**Correction, two parts:**
1. **The burst is read inside the lock.** Whoever decides now looks at
   committed state, not at a number gathered before the lock existed.
2. **A caller that loses the lock retries** (4 attempts, 100ms apart)
   rather than standing down. The holder releases at COMMIT, *before* the
   send, so contention lasts milliseconds. A retry either finds the
   pending row the winner wrote and correctly stands down, or finds
   nothing claimed and decides on the current count. Bounded, so no
   pile-up: the reason try-lock was chosen over a blocking lock survives.

**Reproduced end to end, which last cycle I could not do.** Ten
threshold-sized bursts through the real HTTP endpoint as the
authenticated owner, server restarted and pool warmed each round:

| | silent rounds | one notice |
|---|---|---|
| previous head `4d8c327` | **5 of 10** | 5 |
| corrected | **0 of 10** | **10 of 10** |

The harness is demonstrably sensitive — it detects the defect — which is
exactly the property last cycle's HTTP attempt lacked and which I flagged
then as a limit rather than counting as evidence. A unit test asserts the
same at the threshold, warmed and repeated over eight rounds; against the
previous head it reports "a burst of exactly 3 attempts produced 0
notices; nobody was warned".

## L3 (HIGH). K4 was not closed, and was worse than reported. Accepted.

The main session transcript still held a Railway `set-variables` payload
carrying `SESSION_SECRET`, `WORKSPACE_SNAPSHOT_KEY`,
**`WORKSPACE_ACCESS_PASSPHRASE`** and three account passwords. The
passphrase is gate 3 — the mechanism that closes F1. The reviewer
confirmed the snapshot key was the live one by GCM tag verification
against the committed ciphertext, without decrypting anything.

**Why my K4 sweep missed it, stated plainly rather than excused:** I
swept for the five values I happened to have in front of me, taken from
one file. `WORKSPACE_ACCESS_PASSPHRASE` was not among them, and I never
asked what *other* secrets existed. I searched for the values I knew
instead of for the shape of a secret.

**Correction.** The scrub is now driven by pattern, not by a list I
assembled: every `"NAME": "value"` assignment for the eight sensitive
variable names is located across the whole session tree (the transcript
and every agent output file), the distinct live values are collected, and
each is then replaced *wherever it appears*, including where it sits
nowhere near its own name. **Verified by re-scan: 0 remaining live secret
assignments.** The repository was and remains clean; the one git hit for
`WORKSPACE_ACCESS_PASSPHRASE=` is a canary string in a test asserting the
alert body never contains it.

**Rotation is now more urgent than it was under K4 and it is Tom's:**
`WORKSPACE_ACCESS_PASSPHRASE` and `WORKSPACE_SNAPSHOT_KEY` first, then
`SESSION_SECRET` (which invalidates every CRM erasure tombstone, by
design) and the account passwords.

## L4 (MEDIUM). The disproven claim survived in two of three places. Accepted.

My K remediation said the false "conditional insert only one caller can
win" had been corrected. Only `CLAUDE.md` was. It survived in the
module's own rule 2 and in the J remediation — the two places a reader
of the code or of the assurance record would actually meet it.

Both are now corrected in place and marked as corrections. Rule 2 no
longer states the guarantee at all: it says what the claim row is *for*,
and points at `claimAlertSlot`, where the property is stated next to the
lock that provides it. A guarantee asserted far from its mechanism is
how this went wrong twice.

## L5 (LOW). The drift guard was trivially evadable. Accepted.

It matched a literal `skip:` only. Now four shapes: `skip:` in options,
`t.skip(...)`/`test.skip(...)`, a gate spread in from an options object,
and an early return on a missing environment variable. **Verified against
all three of the reviewer's evasion shapes: each is caught**, tested by
planting a file of that shape and confirming the guard goes red.

---

## Evidence

- Full suite: **532 tests, 530 pass, 0 fail, 2 skipped**, plus the gated
  block naming the five suites that did not run.
- L1 and L2 unit tests: **red against `4d8c327`** (5 failures), green
  after.
- HTTP end-to-end at the threshold: 5/10 silent before, **0/10 after**.
- Concurrency, warmed pool, 10 callers: exactly one notice per round; **0
  idle-in-transaction backends, 0 advisory locks held**.
- Secret scrub: 8 distinct live values, 2 files rewritten, **0 survivors**
  on re-scan.

## What is NOT claimed

- The paid live-AI suites were not run this cycle.
- No live delivery of the alert email has ever been observed. The
  transport is proven separately and the wiring is tested with only the
  transport replaced, but nobody has watched this alert arrive.
- Nothing is merged, deployed or enabled.
