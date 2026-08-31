# Response to the thirteenth independent Governance & Assurance review

Against `review/workspace-v0.1-governance-review-13-2026-08-31.md`
(**AMBER**, T1 MEDIUM plus five LOW), reviewed at frozen head `93d6afa`.

All six accepted and corrected.

## T1 (MEDIUM). I answered half the rule and never quoted the other half.

Accepted, and this is the finding worth reading.

My case for Ruth was about **access**: she holds no source class, no
ceiling and no clearance, and reads no record. The reviewer confirmed
every part of that independently, including seeding six canary records
at three sensitivities and probing twenty clearance-by-lane combinations
with the model stubbed to echo everything it could see. No withheld
canary reached her.

But the controlled statements in `lanes.js`, `orchestrator.js` and
`CLAUDE.md` are about **output**, not access: the router "never speaks
as a person and never appears in output as a tenth identity". Ruth does
both. So the access argument, however true, never touched the sentence
it was supposed to answer, and my assurance case never quoted it.

**Correction: the statements are amended, not argued past.** All three
now say what is still exactly true - the router has no name and no
voice, and no lane speaks - and record that a receptionist presents its
output under a name, on Tom's instruction, holding no clearance. Each
amendment is marked as such and dated, so a reader sees the change
rather than a sentence that quietly became different.

The reviewer's concrete example is kept because it is the sharpest
statement of the point: for an unrouted question she says "I answered
that one myself" while `laneName` is null, so hers is the only name on
an answer she did not write and cannot write.

## T2 (LOW). A crafted lane id made her name a colleague called "Object".

Accepted, and it was worse than cosmetic. `LANES_BY_ID` was a plain
object literal, so `laneById('constructor')` returned the Object
function - and `routes/workspace.js` uses `laneById()` to **validate** a
caller-supplied forced lane id, so a crafted value passed validation
before 500ing the ask endpoint.

Fixed at source with a null-prototype map, which fixes every caller at
once, plus a second check in the receptionist.

**The test named "she cannot invent a colleague" did not catch this**,
because it only tried an obviously fake id. It now tries the ids that
actually reach through the prototype chain, and there is a new test in
`lanes.test.js` pinning `laneById` itself - which is where the defect
was, and where a receptionist-level guard would have masked it.

## T3 (LOW). `gapRaised` was passed every turn and changed nothing.

Accepted. It was only consulted on the `!answered` branch, and the
caller passes `answered: !!result.answer`, which is true whenever the
workspace replied. Both honest gap sentences were dead in practice.

A gap is the most useful thing she can report - the records did not
cover the question and somebody wrote that down instead of guessing - so
it is now said whether or not an answer came back.

**My first test for this was worthless and I caught it before shipping,
by the discipline this chain has taught rather than by luck.** It fed
hand-picked cases directly to the function, hit every branch including
the unreachable ones, and passed against the defective code. The
replacement pins the combination the route actually produces: an answer
came back AND a gap was raised. Red against `93d6afa`.

## T4, T5, T6 (LOW). Accepted.

**T4**: the S2 correction missed a second copy of the same false
sentence in `scripts/runTests.js`. Corrected there and in the
`gatedSuites` header.

**T5**: the rewritten scan fixed S1's two shapes and then let an alias
read (`const env = process.env`) walk past, while falsely reporting
`DATABASE_URL`-only suites because the suppression was dropped in the
rewrite. Both fixed, and verified in both directions: three shapes that
must be flagged, three ordinary constructs that must not.

**T6**: "it cannot leak one however it is called" was stronger than the
guard delivers. The wording now separates what is true of its inputs
from what actually holds the line, which is the field guard and the
tests.

## Evidence

- Full suite: **547 tests, 545 pass, 0 fail**.
- T1: all three controlled statements amended and dated; no
  contradicting sentence remains.
- T2 and T3: three tests **red against `93d6afa`**, green after.
- T5: six probes, both directions, all correct.
- Adversarial by hand: workspace **10/10**, Scott **18/18**.

## What is NOT claimed

- The reviewer's own scope note stands: the brain ran with **zero
  records**, so this covers the access surface and not content
  classification. That is J4's open half and it is Tom's.
- No live alert email has ever been delivered, on thirteen passes.
- Railway, Drive and the paid AI suites remain unverifiable from inside
  this tooling.
- Nothing merged, deployed or enabled.
