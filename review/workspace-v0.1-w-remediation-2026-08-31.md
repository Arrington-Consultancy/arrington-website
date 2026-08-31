# Response to the sixteenth independent Governance & Assurance review

Against `review/workspace-v0.1-governance-review-16-2026-08-31.md`
(**PASS**, four LOW findings W1-W4), reviewed at frozen head `0f03a6a`.

**The verdict is theirs and it is a PASS.** The builder does not restate,
upgrade or trade on it: what follows is the answer to the four findings,
which changes the head and therefore needs a confirmatory pass of its
own.

All four accepted and corrected, each with a test watched red against
`0f03a6a`.

## W1 (LOW). An inert parameter, and two branches the rule did not reach.

Accepted, and the stronger of the two fixes offered was taken: the
`answered` parameter is **deleted**, not patched.

The reviewer established that it was always true. The single call site
passes `!!result.answer`, and `parseReply` refuses a reply whose answer
is not a non-empty trimmed string, so the route answers 503 before Ruth
is called; they demonstrated it end to end with a whitespace stub. Three
of her six sentence shapes were therefore dead, and two of the dead ones
carried a hard-coded "there is nothing on file that answers it" that
`n` never touched, contradicting the module's own rule 1 and the same
sentence in `CLAUDE.md` and in the V remediation.

**This is finding T2 recurring one parameter along, in the same
function, three cycles later** - a value passed on every turn that
changes nothing. Patching the two strings would have left the inert
parameter in place, and their reason for preferring deletion is the
right one: an inert parameter invites a future caller to pass something
whose branches nobody reasoned about. Because the field guard throws on
an undeclared field, a caller that passes `answered` again now fails
loudly instead of quietly reaching one of those branches.

The three controlled statements are corrected rather than left to be
read charitably: every record clause is derived from the count, and that
is now true of every branch rather than most of them.

## W2 (LOW). A denylist of verbs, one synonym from being useless.

Accepted. My V2 fix widened the auxiliary and left the verb list a
denylist of eight, and the reviewer walked a mutation straight past it:
*"I took that to X, and I checked the 3 records behind it myself before
passing it on"* - an explicit claim to have read records she cannot
read, on a reachable branch, green against a suite named for exactly
that property. Fifth instance of the K2/M1/N1/P1/V2 shape, and it was in
the fix for the fourth.

Their recommendation is taken in full. **The permitted output set is now
declared and the test asserts membership**, rather than forbidding verbs
somebody already thought of: every reachable string, with lane names and
counts normalised, must be one of twelve declared shapes. A new sentence
has to be added to that list deliberately and read by whoever adds it -
the same discipline as `NOTE_FIELDS` throwing on an undeclared field.

It is asserted in both directions: a declared shape that is no longer
produced also fails, because dead wording is how a sentence nobody has
read survives a rewrite. Their M4 mutation is red against it.

## W3 (LOW). Five more idioms, and a claim wider than the code.

Accepted, both halves.

The five misses were all ways of naming the same object: a destructure of
`env` off `process`, an inline `require('process').env`, a bracket key
`process['env']`, an alias built with `Object.assign`, and an alias read
with a bracket rather than a dot. **Rather than add five more patterns**,
which is the arms race nine cycles have shown to be unwinnable, the
environment expression is factored into one place and every rule is
expressed in terms of it, so four of the five collapse into rules that
already existed. All five are committed as probes.

**The more important half is the sentence.** The file claimed the scan
"must at least catch the shapes the runner is blind to". It is narrowed
to what the code does, because an overstated claim about a check is the
same defect class as an overstated claim about a gate, and this chain has
spent sixteen passes on that class. It now says plainly that it is a
backstop and not a proof, names the probes as its definition, and records
the durable fix the reviewer proposed - a positive obligation measured by
running the tree rather than reading it - as **the next step rather than
as done**. That is deliberately not built here: rewriting the test
harness on the way to a release is the scope drift these reviews exist to
catch.

Verified no false positive against the whole real tree, and the reviewer
independently confirmed with a stricter scan of their own that every
non-database gate in the tree is declared, so the gap is latent drift
risk rather than a present hole.

## W4 (LOW). Already found, already fixed, and it was mine.

Accepted, and it had been self-found and corrected in a prepared commit
before this review returned. I audited my own V-cycle work while the
sixteenth pass was running and found the same thing: Node's discovery
includes `**/test/**/*.{js,cjs,mjs}`, so all twelve fixtures were being
executed, contradicting the comment claiming they never were.

It is the sixteenth instance of this chain's defect class, authored by me,
in the commit that fixed the fifteenth, inside the fix for the check that
has been defeated every cycle. It reintroduced V4's own class - a suite
that can go red on an unrelated environment variable - two commits after
V4 closed.

The fixtures carry `.jsfixture` now, which no discovery glob matches, and
**the property is asserted by a test rather than by a comment**, because
a comment claiming the runner ignores a file is precisely what this chain
has learned not to trust. Watched red by dropping a `.js` file back into
the directory.

The suite figure is corrected with it: the 566 cited in the V remediation
included about twelve fixtures counted as coverage.

## Also in this commit

- The fifteenth reviewer's own erratum, carried onto the candidate
  byte-identical to their copy. It is their document and their
  correction; the builder disclosed the T2/T3 reversal and declined to
  edit a reviewed report.
- A grammatical agreement error found in the same self-audit: "the 1
  record behind it do not fully cover". Owner-facing copy in the one
  product whose value is that its wording can be relied on.

## A defect of mine found while committing this, disclosed

`git add -A` in a worktree committed the `node_modules` **symlink** I had
made there, in commit `5f24740`. `.gitignore` carried `node_modules/`
with a trailing slash, which matches a directory and not a symlink of the
same name, so nothing stopped it.

It is not cosmetic: checking that commit out replaced this repository's
real `node_modules` with a link pointing at itself, and every `require`
failed until `npm ci` restored it. Anyone cloning the branch would have
hit the same thing. The lockfile was untouched and `sanitize-html`
remains pinned at exactly 2.17.5, which `CLAUDE.md` flags as a production
crash-loop risk if it floats; that was checked rather than assumed.

Removed from the index, and `.gitignore` now refuses both forms with a
comment saying why the obvious rule did not.

## Evidence

- All four: a test **watched red against `0f03a6a`**, green after,
  including the reviewer's own M4 mutation and their five W3 idioms.
- Full suite **557 tests, 555 pass, 0 fail, 2 skipped**, and identical
  with `NAT_PASSWORD`, `TOM_PASSWORD` and `SOME_LIVE_FLAG` exported,
  which are the two environments findings V4 and W4 were about. No
  fixture appears in the run.
- Adversarial by hand against a running instance: workspace **10/10**,
  Scott **18/18**.
- Ruth's whole output space re-enumerated: 12 shapes, all declared.

## What is NOT claimed

- **This is not a PASS on this head.** The sixteenth verdict covers
  `0f03a6a`; these corrections change it, so a confirmatory pass is
  required and has been commissioned.
- The brain still runs with zero records here, so this covers the access
  surface and not content classification. Tom has ruled that confidential
  records must not be synthesised; it is recorded as untested, not as
  covered.
- No live alert email has ever been delivered, on sixteen passes. Tom has
  reserved that proof to the pre-release point.
- Railway, Drive and the paid AI suites remain unverifiable in this
  sandbox.
- Nothing merged, deployed or enabled.
