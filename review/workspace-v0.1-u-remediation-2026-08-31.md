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
default path**, not a rarity. My own T3 fix then sent every invalid lane
id down that same path, so the reach of the false sentence grew in the
commit meant to correct things.

**Correction.** The no-lane turn now says what is true: no specialist
matched, and the workspace answered from its general records. She never
claims authorship anywhere.

> **CORRECTION, added 31/08/2026 after governance findings V1 and V2.**
> Both sentences above are wrong, and they are wrong in the way this
> chain keeps repeating: a property asserted in the document that fixed
> the previous instance of it.
>
> *"answered from its general records"* was written unconditionally. With
> an unseeded brain, which is this candidate's actual state and the state
> the Evidence section below records, there were no general records, so
> three of the four zero-record turns claimed an evidential basis that did
> not exist while the interface printed "No records were available for
> this answer" on the same rendered line. That is V1, and it is worse than
> U1: U1 misattributed authorship, this misstates what an answer rests on,
> which is the one thing the workspace exists to be trusted about.
>
> *"She never claims authorship anywhere"* was false when written. Three
> reachable sentences said "I have written the gap down". She holds no
> write path; `repo.createGap` writes it. And the test named for the
> property used `\bI (?:answered|wrote|...)`, which the word "have"
> walks straight past. That is V2, and it is the K2/M1/N1/P1 shape again.
>
> Both corrected in `workspace-v0.1-v-remediation-2026-08-31.md`, with
> tests watched red against `6d6c4d1`.

**The test sweeps every combination**, not the one that was wrong: four
lane ids by two answered states by two gap states by three record
counts, asserting no note ever contains "I answered" or "I wrote". Red
against `eeb3a25`.

## U5 (LOW). The T2 fix did not reach the commonest turn.

Accepted, and it is the same shape as U1. The gap branch sat below the
no-lane early return, so `gapRaised` remained fully inert on the default
path - and the test I wrote for T2 used `laneId: 'google_ads'`, which
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
it could see, leaking nothing. T3 and T2 verified genuinely fixed, red
against `93d6afa`.

They also hunted the T3 prototype class across every dynamic lookup in
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

> **CORRECTION, added 31/08/2026 after governance finding V3.** Those
> probes were run by hand and never committed, so nothing in the tree
> established U3 or U4 - on the one check that has been defeated in every
> single cycle. The chain's own rule, adopted after J1, is that an
> asserted property must name the test that establishes it. They are now
> `test/gatedSuiteScan.test.js` and `test/fixtures/gatedSuiteProbes/`.
> V3 also found the U4 fix was half done in each direction: the
> destructure read and both the assign and delete suppressors were left
> upper-case only.
- Adversarial by hand: workspace **10/10**, Scott **18/18**.

## What is NOT claimed

- The brain ran with **zero records**, so this covers the access surface
  and not content classification. J4's open half, and Tom's.
- No live alert email has ever been delivered, on fourteen passes.
- Railway, Drive and the paid AI suites remain unverifiable here.
- Nothing merged, deployed or enabled.
