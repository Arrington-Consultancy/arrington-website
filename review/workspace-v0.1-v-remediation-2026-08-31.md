# Response to the fifteenth independent Governance & Assurance review

Against `review/workspace-v0.1-governance-review-15-2026-08-31.md`
(**AMBER**, V1 MEDIUM plus four LOW), reviewed at frozen head `6d6c4d1`.

All five accepted and corrected. **AMBER stands**: the builder does not
upgrade its own verdict.

## V1 (MEDIUM). She claimed records that did not exist, on the default path, in the state this candidate is actually in.

Accepted without qualification. It is the sharpest of the fifteen, and
the reviewer's reason for saying so is the right one: U1 misattributed
an *act*, which a reader might discount as receptionist idiom. This
misstated **what an answer rests on**, which is the single thing the
workspace exists to be trusted about.

My U1 fix wrote *"it was answered from the general records"* into a
string, unconditionally. With an unseeded brain the general context is
empty, and an unseeded brain is not a corner case here: it is this
candidate's documented state, it is what the U remediation's own
evidence section records, and it is what every visitor to Ask Ruth would
meet the moment the AI flag is turned on without `WORKSPACE_SNAPSHOT_KEY`.
The interface contradicted her on the same rendered line: *"...answered
from the general records... · No records were available for this answer."*

Three of the four zero-record turns claimed a basis that did not exist.
The one honest sentence was already in the file and could not be reached:
it sits below the early return U1 added and below the gap branch U5
added.

**The correction is structural rather than another string.** The record
clause is now derived from the count on every branch, so there is no path
on which a sentence can mention records without records having existed.

> **CORRECTION, added 31/08/2026 after governance finding W1.** "On every
> branch" was untrue of two of them. The `lane && !answered` pair carried
> a hard-coded "there is nothing on file that answers it" that the count
> never touched, so with records supplied it asserted their absence.
> Unreachable, because `answered` was always true, which is the other
> half of W1: an inert parameter, finding T2 recurring one parameter
> along. The parameter is deleted in
> `workspace-v0.1-w-remediation-2026-08-31.md` and the sentence is true
> now.
Zero-record turns say what happened instead: *"there was no record on
file to answer it from"*, and on a lane, *"they answered from what they
hold, with no record behind it"*.

**The test sweeps both directions**, which matters because a rule that
only forbids can be satisfied by saying nothing at all: for every lane id
by answered state by gap state, a zero-record turn must claim no record,
and a three-record turn must say so. Watched red against `6d6c4d1`.

## V2 (LOW). "She never claims authorship anywhere" was false, and my test was written narrowly enough to miss it.

Accepted. Three reachable sentences said *"I have written the gap down"*.
She holds no clearance, no database handle and no write path; the gap is
written by `repo.createGap` from a field the model returned. The
substance was true and the attribution was not, which is exactly the
defence the chain already rejected at U1.

The regex I wrote for U1 was `\bI (?:answered|wrote|worked (?:it|that)
out)\b`. It matched the one string U1 had removed and walked past the
three that remained, because the word after "I" is "have". Fourth
instance of the K2/M1/N1/P1 shape: a test asserting something adjacent to
the property, staying green while the property is false.

The gap is now reported in the passive, because the passive is what
happened. *"I took that to X"* is deliberately kept: routing is the one
thing she actually does. The pattern now covers the auxiliary and perfect
forms and was watched red against `6d6c4d1`.

## V3 (LOW). Half a fix in each direction, and the probes were never committed.

Accepted, all three parts.

**(a)** U4 made one of three read-shapes case-insensitive.
`const { runLiveThing } = process.env` still yielded nothing, because the
destructure extraction required two consecutive upper-case characters.
**(b)** The assign and delete suppressors were left upper-case only, so a
suite setting and restoring a lower-case key was reported as an
undeclared gate. A check that produces a false failure is a check that
gets loosened, so this half mattered as much as the other.

Every name pattern in the scan is now built from one shared
case-insensitive class. Verified against the whole real test tree: no new
false positives.

**(c) is the part worth more than the fix.** The "seven probes, both
directions" were run by hand and thrown away, so nothing in the tree
established U3 or U4 — on the one check that has been defeated in every
single cycle since L5. The scan is now `test/helpers/gatedSuiteScan.js`,
exercised by `test/gatedSuiteScan.test.js` against twelve committed
fixtures in `test/fixtures/gatedSuiteProbes/`, eight that must be flagged
and four that must not. The real check in `test/gatedSuites.test.js`
calls the same function, so the probes test the deployed classifier
rather than a copy of it. Both directions watched red against the
pre-V3 scan.

## V4 (LOW). `npm test` was not green in the environment `CLAUDE.md` tells a developer to create.

Accepted, and the reviewer is right that it matters more than a tidy-up:
fifteen passes of evidence rest on "npm test is green", and a green that
depends on an ambient variable the test does not control is a weaker fact
than it looks.

`test/resetUserPasswords.test.js` spread the caller's shell into the
child, and asserts the seed refuses when only one of the two passwords is
present. `CLAUDE.md`'s Development section tells a developer to export
both. The child environment is now built explicitly, with both password
variables and the reset flag deleted from the copy.

Reproduced red on `6d6c4d1` with both exported, green after.

## V5 (LOW). Two residual prototype-chain lookups, not attacker-reachable.

Accepted, and I am keeping the reviewer's own framing rather than
inflating it: `clearanceId` is only ever `clearanceForUser(user)`, no
request-derived value reaches either map, and the outcome of the throw
would be a 500 rather than access. The real consequence short of that is
the one they named: `describeOwnerBinding()` shares the lookup, so a
`WORKSPACE_OWNER_USERNAME` of `toString` would print the binding as ok
for a username holding no clearance in code — a boot diagnostic reporting
a gate as configured when it is not, which is the class finding G7 was.

Both maps are now null-prototype, the same one-line fix applied in
`lanes.js` at T3. Six prototype keys are swept through `clearanceForUser`,
`clearanceCanSeeSensitivity` and `clearanceCovers` in both argument
positions. Red against `6d6c4d1`.

## Also in this commit: a citation error I found myself, disclosed rather than tidied

The thirteenth review numbers **T2** as the inert `gapRaised` and **T3**
as the crafted lane id. My T remediation reversed them, and the
fourteenth and fifteenth reviewers both followed my labelling. Nothing
about the code was ever wrong — both defects were found, fixed and
independently verified red against `93d6afa` — but two reviews now cite a
numbering that contradicts its own source.

Found while assembling the completion report, during the freeze for the
fifteenth review, so it was deliberately not corrected in the reviewed
tree. Every code comment and both remediations now follow the thirteenth
review, with a dated note at the head of the T remediation explaining the
reversal. Reviews 14 and 15 are left exactly as their authors wrote them:
a reviewed document is not the builder's to edit.

## Evidence

- Every one of the five: a test **watched red against `6d6c4d1`**, green
  after. V1 and V2 in the receptionist suite, V3 in both directions
  against the pre-V3 classifier, V4 reproduced with the passwords
  exported, V5 in the clearance suite.
- Full suite, and with `NAT_PASSWORD`/`TOM_PASSWORD` exported as well.
- Adversarial suites by hand against a running instance.

## What is NOT claimed

- The brain still runs with zero records here, so this covers the access
  surface and not content classification. J4's open half, and Tom's.
- No live alert email has ever been delivered, on fifteen passes.
- Railway, Drive and the paid AI suites remain unverifiable in this
  sandbox.
- `lib/scott/clearance.js`'s `personaDomains` fail-open is still not
  touched: it is live production Scott code, outside this candidate, and
  carried to Tom's list.
- Nothing merged, deployed or enabled.
