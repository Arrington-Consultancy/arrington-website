# Response to the tenth independent Governance & Assurance review

Against `review/workspace-v0.1-governance-review-10-2026-08-31.md`
(**AMBER**, Q1 HIGH plus Q2-Q4 LOW), reviewed at frozen head `09cd35e`.

All four accepted and corrected.

The reviewer attacked all four P-cycle fixes rather than reading them and
found all four hold, including turning the ninth review's DELIVERED
mutation red. The HIGH is somewhere nobody had looked.

## Q1 (HIGH). Anonymous OPTIONS enumerated the workspace API, with the flag OFF.

Accepted. Express answers `OPTIONS` from its own route table **before any
route middleware runs**, so every real `/api/workspace/*` endpoint
returned `200 Allow: POST` to an unauthenticated request while a
fabricated sibling returned 404 - on a server with no workspace
variables set at all. That is the endpoint list and the shape of the
area, handed to anyone who asks.

`routes/workspace.js` is not on main, so **merging would have added the
oracle to the live site**, and this file's own claim that merging is
inert was false as written. It is the same consequence as G1, which this
chain graded HIGH, reached through a method rather than a header.

**Why it survived ten passes, and this is the part worth keeping:** the
adversarial suite reported 9/9 green on the same server in the same
minute. Every probe anyone had written, mine included, sent GET or POST.
The methods nobody uses are exactly the ones no route handles, and
therefore the ones the framework answers on your behalf.

**Correction.** `refuseUnroutedMethods` in `lib/workspace/access.js`,
registered as the first thing on the router and the first thing in
`mountPageRoute`, because Express decides before route middleware and
the page routes live on the app rather than the router. It is written
about the METHOD rather than about OPTIONS: anything outside the set the
app actually serves is refused through the same renderer as a missing
page.

**Measured, both flag states, anonymous:** 65 of 65 combinations of
method (OPTIONS, PUT, DELETE, PATCH, TRACE) across nine real workspace
paths and four fabricated ones are now **byte-identical to a genuinely
missing path**, headers and body included.

**The test that would have caught it** now exists in the adversarial
suite, sweeping four methods across real and fabricated paths against a
control. It is **red against `09cd35e`**: *"OPTIONS /api/workspace/ask
returned 200 where a non-existent path returns 404."*

## Q2 (LOW). The "one clock decides" sentence was still wrong.

Accepted. P5 reported it corrected; it was not, and eight comparisons in
`decideAlert` remain in JavaScript.

They stay there deliberately, and the wording now says so rather than
overclaiming. The **authoritative** gate is the conditional INSERT,
entirely in SQL against `now()`, and nothing can be written past it.
`decideAlert` is pure so the rule can be tested without a database, and
it produces the reason string; where the clocks disagree the SQL wins,
and the only consequence is a reason that may be a minute out. The
future-dating guard is what stops skew becoming silence.

Corrected in `CLAUDE.md`, in the N remediation, and beside the code.

## Q3 (LOW). The drift guard, fifth pass. Method changed rather than patched again.

Accepted. Five consecutive reviews found more shapes: `t.skip`, a
hoisted const, a spread options object, an early return with and without
a comment, a renamed destructure, an alias, `process.env` passed as an
argument. Each round I added patterns; each round a reviewer found more.
Matching the shape of a gate is an arms race against ordinary JavaScript
and it was losing.

**So it no longer reads source.** `npm test` now runs
`scripts/runTests.js`, which streams `node --test` through unchanged,
preserves its exit code, and reads the `# SKIP` directives the runner
itself emits. A skip appears there whatever the source looks like, so
there is no shape left to evade.

Verified: planting a suite that skips via an aliased env read AND one
that skips unconditionally, both appear in the summary without any
pattern being taught to anything. The five real gated suites are listed
by name and reason on every run.

What remains in `test/gatedSuites.test.js` is the part the runner cannot
do: naming what ARMS each suite, so a person knows how to run it.

## Q4 (LOW). `recordedAs` could name a row that was never written.

Accepted, and it is N1's class one layer out: the field named the row
this code *intended* to write, whether or not the write succeeded. When
the database is what failed, that is a claim about a row that does not
exist. It now reports `null` when nothing was recorded.

## Evidence

- Full suite: **538 tests, 536 pass, 0 fail**, plus the runner's honest
  block naming all five skipped suites.
- Q1: **65/65 byte-identical** to a missing path, flag on and off; the
  new adversarial case red against `09cd35e`, green after.
- Adversarial by hand: workspace **10/10** (nothing skipped), Scott
  **18/18**.
- Seed: fresh and duplicate-polluted, twice each, clean.

## What is NOT claimed

- Paid live-AI suites not run.
- No live delivery of the alert email has ever been observed.
- The reviewer could not reproduce my second P2 figure (4/60 against
  `6226673`); they measured 6/60 against `39812ac` and 0 in 240 against
  the other. Their measurement stands over mine.
- Nothing merged, deployed or enabled.
