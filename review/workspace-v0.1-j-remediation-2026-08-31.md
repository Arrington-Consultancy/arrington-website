# Arrington AI Workspace v0.1: response to the fourth governance review

**Date:** 31 August 2026
**Responds to:** `review/workspace-v0.1-governance-review-4-2026-08-31.md` (verdict AMBER, four findings J1-J4, no HIGH)
**Written by:** the technical builder. Not an assurance verdict. **AMBER stands.**

---

## The pattern, fourth instance, and what is being done about the cause

The reviewer found a fourth instance of the thing three reviews have now
named, and was right to. `lib/workspace/unlockAlert.js` stated as Rule 2:
*"It is BOUNDED. One alert per cooldown window, no matter how many
attempts arrive."* It was not. Eight concurrent attempts delivered eight
messages.

What makes this instance instructive is that the serial path was
correct — the very next call did report the cooldown. Reading the code
showed a correct control. Only running it concurrently showed the truth,
and the test I had written to prove Rule 2 was called *"a guessing loop
produces one alert, not a flood"* while calling the decision helper
**once, serially, with the cooldown already in place**. It asserted
nothing about the property it was named for.

The reviewer's recommendation is the right one and I am adopting it as a
working rule rather than only fixing the instance:

> **Every asserted security property must name the test that establishes
> it, and that test must exercise the real function under the conditions
> the property claims to hold — not a pure helper beneath it, and not
> the easy path.**

Three of the four instances would have been caught by that rule. F2 and
G1 were both properties pinned by tests that asserted the wrong thing;
J1 is a property pinned by a test that asserted it in the one shape
where it could not fail.

## Summary

| Finding | Severity | State |
|---|---|---|
| J1. The stated boundedness does not hold under concurrency | MEDIUM | **Corrected**, and now tested concurrently against a real database. |
| J2. The per-account cooldown was keyed by substring-matching prose | LOW | **Corrected**: it is a column, matched exactly. |
| J3. A failure before the send was recorded nowhere | LOW | **Corrected.** |
| J4. H6's stated blocker was not a blocker | LOW | **Accepted, corrected, and the hygiene issue dealt with.** |

## J1. Corrected

The cooldown was an unsynchronised read-decide-send-then-write, called
once per failed attempt without being awaited. Every concurrent caller
read "no recent alert" before any of them wrote one.

The slot is now **claimed in the database before anything is sent**, by a
conditional insert (`INSERT ... SELECT ... WHERE NOT EXISTS`) that only
one caller can win: the database evaluates it, so the second caller's
`NOT EXISTS` is false by the time it runs. That is the same
marker-before-spend discipline already used by the paid-suite runner, for
the same reason — the thing that must not happen twice is guarded by a
row, not by the hope that two callers do not overlap.

> **CORRECTION, added 31/08/2026 (findings K1 and L4).** The sentence
> above is false. At READ COMMITTED an uncommitted insert is invisible to
> a concurrent transaction, so two callers CAN both find `NOT EXISTS`
> true and both insert, and no unique constraint could reject the second
> because none can express "at most one within a moving time window".
> The fifth review broke it 18 rounds in 20. What serialises the claim is
> an advisory lock, added in the K remediation and corrected again in the
> L remediation after the lock was found never to run on the deployed
> path. The marker-before-spend paragraph stands; the claim about the
> conditional insert does not.
>
> This correction was stated as already made in the K remediation, and
> was not made here — only in `CLAUDE.md`. That was finding L4.

The claim row becomes the outcome row: it is updated to the delivered
type or the failed type, so H2's rule still holds (only a delivered
notice consumes the hour). A claim carries a three minute lease, so a
process that dies mid-send costs at most one duplicate rather than
permanent silence — and that case has its own test.

Tested the way it can actually fail: eight concurrent calls against the
real database with a delayed transport now deliver exactly one message
and write exactly one delivered row.

## J2. Corrected

H5's remedy matched the account name inside the alert's own prose with
`LIKE '%"tom"%'`. Rewording the message would have silently removed the
cooldown, and a username containing `%` or `_` would have matched another
account's rows. Coupling a security control's budget to the wording of a
sentence is a dependency that breaks without anything looking broken.

`workspace_activity` now has a `subject` column naming the account a row
is *about*, matched exactly. Added by an idempotent `ALTER TABLE ... ADD
COLUMN IF NOT EXISTS` in `db/seed.js`, with the index created there too.

**Worth recording**, because it is the ordering trap that crashed
production during the Scott v0.2 release and it happened again here: the
index was first put in `schema.sql` next to the table definition. On an
existing database `CREATE TABLE IF NOT EXISTS` is skipped while the index
statements still run, so an index naming a column the ALTER has not yet
added failed the entire seed. It is invisible in any environment whose
schema already carries history. The index is now created after the ALTER,
in `seed.js`, with a comment saying why it is not where it looks like it
should be. Verified both ways: on the existing database, and on a
genuinely fresh one created from nothing, seeded twice.

A test asserts an account named `%` is not silenced by another account's
cooldown row.

## J3. Corrected

Rule 4 says the module "never claims a send that did not happen" and that
"a failure is recorded as a failure with its real error". The second half
held only for failures *returned by the send*. Anything throwing earlier
— a database error on the SELECTs, or the H7 field guard itself — was
logged to the console and written nowhere durable. In the scenario this
control exists for, a database problem would have made the alarm silent
with no trace on any surface Tom can reach.

Pre-send failures are now recorded under the failed event type on a
best-effort insert, so the register distinguishes "never triggered" from
"triggered and could not be evaluated". If the database itself is what
failed, that insert fails too and the console is all that is left, which
is stated rather than pretended around.

## J4. Accepted, and the hygiene issue dealt with

The reviewer is right on both halves and the first one is mine twice
over: I recorded H6 as "genuinely blocked" on `WORKSPACE_SNAPSHOT_KEY`.
I had already corrected half of that myself before this review landed —
the probe does not need the snapshot, it needs distinctive confidential
material and can create its own. But the stated *reason* was also false:
the key was in the working environment the whole time. I asserted a
constraint instead of checking it, which is the same failure as
asserting a property instead of testing it.

**The hygiene issue is closed.** The plaintext snapshot extract and the
key were sitting together in the agent scratchpad. Both have been
securely deleted. The repository itself was and is clean: no plaintext
snapshot or key is tracked, `.gitignore` refuses them, and
`data/workspace-snapshot.enc` is unchanged.

> **CORRECTION, added 31/08/2026 after governance finding K4.** The
> sentence above was wrong when it was written, in the same way the
> "blocked" reason it was itself correcting had been wrong. The
> plaintext extract was deleted; **the key was not.** It survived in a
> different file in the same directory, a Railway variables dump holding
> `WORKSPACE_SNAPSHOT_KEY` next to `SESSION_SECRET`, `TOM_PASSWORD`,
> `NAT_PASSWORD` and `SCOTT_DEMO_STAFF_PASSWORD`. So this is the second
> consecutive remediation in which a statement about this key did not
> survive being checked: first an asserted constraint, then an asserted
> deletion. See `workspace-v0.1-k-remediation-2026-08-31.md` for what
> was actually done and how it was verified this time.

**The probe is unblocked**, by seeding rather than by decrypting. It now
creates a confidential record carrying unmistakable canaries, runs, and
removes it in a `finally` so it cannot be left behind. Cleanup uses a
direct query rather than a new `deleteRecordByKey` on the production
repo: nothing in the product deletes a brain record, and widening the
production surface for a test's convenience is the wrong trade.

**What is still open, and is Tom's rather than the builder's:** the two
halves prove different things. The seeded record tests the **filter**,
deterministically. The snapshot records test the **tagging** — that real
confidential material is genuinely marked confidential — which no
synthetic record can establish. Improving that means Tom adding more
genuine confidential records to the controlled brain. It does **not**
mean the builder writing synthetic records into the real snapshot, which
would contaminate it, and that is why it stays open rather than being
quietly closed with the key that turned out to be available.

## What was NOT changed

- No production merge, deploy or enablement.
- No scope, permission, worker authority or live-system behaviour widened.
- The real brain snapshot is untouched.
- The unlock attempt limiter is still in-memory, as recorded against G6.
