# Response to the seventeenth independent Governance & Assurance review

Against `review/workspace-v0.1-governance-review-17-2026-08-31.md`
(**PASS**, four LOW findings X1-X4), reviewed at frozen head `69b6e06`.

**Two PASS verdicts in a row, both the reviewers' and neither the
builder's.** The seventeenth covers `69b6e06`. These corrections change
the head, so an eighteenth confirmatory pass follows rather than the
verdict being carried onto code it did not see.

All four accepted and corrected, each with a test watched red against
`69b6e06`.

## The reviewer's summary of the register is the honest one

> Four times the seventeenth instance, all in the same register the
> sixteenth pass named: the code has stopped being wrong and the
> sentences about it have not quite caught up.

That is worth quoting rather than paraphrasing, because it is the
distinction that matters for a release decision. Across seventeen passes
the access controls have held under every independent probe. What keeps
producing findings is the gap between what a comment or a test claims and
what it does.

## X1 (LOW). The field guard was own-keys-only, so its stated mechanism did not hold.

Accepted. `assertOnlyPermitted` filtered `Object.keys(opts)`, which is own
enumerable keys only, while the destructure on the next line read
straight through the prototype chain. A prototype-borne `recordCount`
therefore made Ruth state a count the interface contradicted, with no
throw, which is the V1/W1 class of untruth arriving through the guard
that exists to prevent it.

**Both halves are closed, because either alone leaves the other open.**
The guard now iterates with `for...in`, so an undeclared inherited key
throws; and the three declared fields are read through `Object.hasOwn`,
so a prototype-borne value for a *declared* name cannot be read either.

The reviewer was precise about what this was not, and it is repeated
rather than glossed: it is not a disclosure. The function reads only the
declared names, so a prototype-borne `record` was never spoken, and the
substantive property - she cannot speak record content - was held
structurally by the destructure throughout. It is the guard's own stated
mechanism that was not held. Not reachable either: the single caller
builds an object literal from three computed values.

Fixed anyway, for the reason given at W1 for deleting the inert
parameter rather than patching its strings: a mechanism weaker than its
comment invites a future caller nobody reasoned about.

## X2 (LOW). "Every reachable sentence" was a sample of five counts.

Accepted. The record count is an unbounded non-negative integer, so the
sweep was a sample and the test's name overstated it. The reviewer got a
sentence conditional on a count of four past it: an explicit claim to
have verified records she cannot read.

**The fix is the property, not a bigger sample**, which is the option the
reviewer preferred and the right one: the test now asserts that the
normalised output depends on the count only through `{none, one, more
than one}`, by checking every count from 2 to 60 yields one shape. With
that established, sampling is sufficient rather than merely wider, and
the name is true. The probe list is widened as well, and the three
classes are asserted to be genuinely distinct, or the property could be
satisfied by a function that ignored the count entirely.

Their mutation is red against it.

## X3 (LOW). One of the three rules was not factored, and it missed W3's own probe.

Accepted. `returnsEarlyOnEnv` still matched the literal text
`process.env` while the file said every rule was expressed in terms of
the factored environment expression. It therefore missed
`require('process')`, which is **probe B of W3's own five**, and the miss
became observable exactly where the name-reading rule stands down - on an
ambient name like `CI` - so two spellings of one gate classified
differently. That is the "half a fix in each direction" shape the file's
own U4 comment warns against, one clause along.

The clause is built from the shared expression now, and the alias set is
computed once by `envAliases` and used by both rules, so this cannot
recur by one clause knowing about an alias the other does not. Both
missed spellings are committed as probes and were watched red against
`69b6e06`.

## X4 (LOW). A carried erratum that describes a file it no longer matches.

Accepted, and the reviewer's diagnosis of it is right: the judgement was
correct and the mechanism was wrong. Declining to edit a reviewed
document is what K5's discipline implies, and the right answer was
already in use twice in the same commit - a dated `> CORRECTION` block on
my own V remediation, and a dated note at the head of the T remediation.

A dated builder's note is appended below the erratum, saying plainly that
the paragraph above was true when written, that the carry happened in
`7a85d59`, and that the two copies no longer differ. **Nothing of the
reviewer's text is altered**, and the as-delivered body can still be
compared byte for byte.

## Recorded, not fixed: a pre-existing condition outside this candidate

Running `npm test` with **no** `DATABASE_URL` gives 21 failures, in the
CRM and erasure suites, which need a database without gating on one.
Measured identically at `69b6e06`, so it is not introduced by this cycle;
it is pre-existing and outside the workspace. It is left alone
deliberately: fixing it means changing suites this candidate does not
touch, on the way to a release, which is the scope drift these reviews
exist to catch. It is the same class the W3 "positive obligation" note
describes and belongs with that work.

## Evidence

- All four: a test **watched red against `69b6e06`**, green after,
  including the reviewer's own count-conditional mutation and both of
  their missed early-return spellings.
- Full suite **558 tests, 556 pass, 0 fail, 2 skipped**, and identical
  with `NAT_PASSWORD`, `TOM_PASSWORD`, `SOME_LIVE_FLAG` and `CI`
  exported. No fixture is executed in any environment, including with no
  `DATABASE_URL`.
- Adversarial by hand against a running instance: workspace **10/10**,
  Scott **18/18**.
- The prototype probes run directly: an undeclared inherited key throws,
  an inherited value for a declared name is not read, and an own value
  still wins.

## What is NOT claimed

- **This is not a PASS on this head.** The seventeenth verdict covers
  `69b6e06`.
- The brain runs with zero records here, so this covers the access
  surface and not content classification. Tom has ruled that confidential
  records must not be synthesised; it is recorded as untested.
- No live alert email has ever been delivered, on seventeen passes. Tom
  has reserved that proof to the pre-release point.
- Railway, Drive and the paid AI suites remain unverifiable here.
- Nothing merged, deployed or enabled.
