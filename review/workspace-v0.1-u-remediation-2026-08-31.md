# Response to the fourteenth independent Governance & Assurance review

Against `review/workspace-v0.1-governance-review-14-2026-08-31.md`
(**AMBER**, U1 MEDIUM plus four LOW), reviewed at frozen head `eeb3a25`.

All five accepted and corrected.

## U1 (MEDIUM). Ruth claimed to have written answers she cannot write.

Accepted, and it is the sharpest finding in fourteen passes because it is
an honesty defect in the voice of the component added to be honest.

She said **"I answered that one myself"**. She holds no clearance and
reads no record, so she authors nothing. That is precisely the class of
untruth this chain has spent thirteen reviews removing from the alert:
a component describing something that did not happen.

**Two things I got wrong beyond the sentence itself.**

My T remediation said "All six accepted and corrected" and "no
contradicting sentence remains". T1 had two limbs - the controlled
statements, and Ruth's own output - and I corrected the first and
reported both. **That is the third cycle running in which a two-part
finding was fixed in one part and declared fixed in both.**

And the reviewer's new evidence makes it worse than an edge case:
routing is nine keyword regexes, so an **unrouted question is the
default path**, not a rarity. My own T2 fix then sent every invalid lane
id down that same path, so the reach of the false sentence grew in the
commit meant to correct things.

**Correction.** The no-lane turn now says what is true: no specialist
matched, and the workspace answered from its general records. She never
claims authorship anywhere.

**The test sweeps every combination**, not the one that was wrong: four
lane ids by two answered states by two gap states by three record
counts, asserting no note ever contains "I answered" or "I wrote". Red
against `eeb3a25`.

## U5 (LOW). The T3 fix did not reach the commonest turn.

Accepted, and it is the same shape as U1. The gap branch sat below the
no-lane early return, so `gapRaised` remained fully inert on the default
path - and the test I wrote for T3 used `laneId: 'google_ads'`, which
never reaches that return. A gap is now reported on both paths, and the
test asserts it on both.

## U2, U3, U4 (LOW). Accepted.

**U2**: `CLAUDE.md` still said Ruth is handed "three booleans". It is a
lane id, two booleans and a count, and the count is the one value she
interpolates. T6 was fixed in the module and missed in the memory file.

**U3**: my T5 fix over-corrected. `DB_ONLY_GATE` suppressed **all three**
clauses rather than the one it is about, so any file containing the
literal phrase "set DATABASE_URL" stopped being checked for registering
nothing or returning early - ten real files, silently. It now suppresses
only the environment-read clause.

**U4**: the same fix was half done. The name after `process.env` had to
be upper case, so a lower-case or mixed-case read slipped through, and a
computed bracket key was invisible - both ordinary JavaScript, and both
named in the paragraph that claimed to cover them. Fixed, with the
computed rule narrowed to a computed **read**: five real suites here set
or delete env keys by computed name as part of a test, and flagging
those would have made the check noise.

Seven probes, both directions: four shapes that must be flagged
(lower-case read, computed read, mixed-case alias, registers-nothing
despite the DATABASE_URL phrase) and three that must not (computed write
only, a plain suite, a genuine database-only gate).

## What the reviewer confirmed, which is worth recording

The security surface was re-established rather than inherited: the full
CMS-admin takeover stopping at the unlock screen with a positive control
in the same run; 3,591 paired anonymous raw-socket requests per flag
state, 3591/3591 identical; Ruth probed across twenty clearance-by-lane
combinations with five canaries and the model stubbed to echo everything
it could see, leaking nothing. T2 and T3 verified genuinely fixed, red
against `93d6afa`.

They also hunted the T2 prototype class across every dynamic lookup in
`lib/`, `routes/`, `middleware/`, `server.js` and `db/` and found **no
second reachable instance**. One latent fail-open is recorded as a
concern rather than a finding: `lib/scott/clearance.js`'s
`personaDomains` falls back to the owner persona for an unrecognised id.
It is unreachable today and live in production, so it is **not** touched
in this commit: it is outside this candidate, and changing production
Scott behaviour on the way to a workspace release is exactly the kind of
scope drift these reviews exist to catch. It is carried to Tom's list.

## Evidence

- Full suite: **548 tests, 546 pass, 0 fail**.
- U1 and U5: tests **red against `eeb3a25`**, green after.
- U3 and U4: seven probes, both directions, all correct.
- Adversarial by hand: workspace **10/10**, Scott **18/18**.

## What is NOT claimed

- The brain ran with **zero records**, so this covers the access surface
  and not content classification. J4's open half, and Tom's.
- No live alert email has ever been delivered, on fourteen passes.
- Railway, Drive and the paid AI suites remain unverifiable here.
- Nothing merged, deployed or enabled.
