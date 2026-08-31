# Response to the eleventh independent Governance & Assurance review

Against `review/workspace-v0.1-governance-review-11-2026-08-31.md`
(**AMBER**, R1 HIGH and R2 LOW), reviewed at frozen head `ebac5f6`.

Both accepted and corrected.

## R1 (HIGH). The Q1 fix was case-sensitive. Express's routing is not.

Accepted, and it is one character.

`server.js` never sets `case sensitive routing`, so Express's default
applies and `/API/workspace/ask` reaches the same handler as
`/api/workspace/ask`. My guard's regex matched lower case only, so a
single capital letter walked past it and Express's automatic OPTIONS
responder answered from the route table exactly as before Q1 was raised.
All nine real endpoints enumerated, including `contacts/1/erase`, `ask`
and `unlock`; all six fabricated siblings still correctly 404'd. In both
flag states, on a server with no workspace variables set at all.

**The rule this leaves behind:** a guard that decides on a path must
match paths the same way the router does, or it is guarding a different
application from the one that is running.

**And the test I wrote for Q1 reported 10/10 green on the same server,
in the same minute, as that enumeration.** It swept four methods, which
was the right lesson from Q1, and then listed the paths **by hand in one
spelling**. The paths are now generated: every real and fabricated path
is expanded into the case variants the router treats as the same route,
and the case is red against `ebac5f6` with the exact bypass
(*"OPTIONS /API/WORKSPACE/ASK returned 200 where a non-existent path
returns 404"*).

**Measured after the fix**, anonymous, both flag states: **220 of 220**
combinations of five methods across eleven paths in four spellings are
byte-identical to a genuinely missing path.

I also went past the reviewer's four variants, since a one-character
bug in a path matcher is a reason to doubt every other spelling: trailing
slash, doubled slashes, `..` traversal, percent-encoded characters and an
unknown verb. All refused identically. Non-workspace routes are
unaffected: `/health`, `/`, `/scott/login`, static files and
`/robots.txt` all still answer 200.

## R2 (LOW). Replacing the source scan with the runner lost coverage.

Accepted, and the reviewer is right that I overcorrected. Q3 was written
as though the runtime check *replaced* the source scan. It does not:
two ordinary shapes never reach the runner's output at all - a suite
that registers nothing, and an early return from inside a test body,
which the runner reports as a **passing** test rather than a skipped
one. Both had been caught by the scan I deleted.

Both halves are back, and the file now says why neither replaces the
other. The source scan is deliberately narrow: it is not another attempt
to enumerate every way of writing a gate, which five reviews proved
unwinnable, but the backstop for exactly what the runtime check
structurally cannot see. **Verified: both shapes caught.**

> **CORRECTION, added 31/08/2026 after finding S1.** That sentence was
> wrong. One of the two shapes - `if (process.env.X) { test(...) }` - was
> caught by NEITHER half: the runner emits nothing for a test that is
> never registered, and the scan's "registers nothing" check passed it
> because the source text does contain `test(`. The scan also
> false-positived on ordinary code such as `if (res.STATUS_CODE) return`.
> Both are fixed, and this time each shape was planted and watched, in
> both directions, rather than asserted.

Also corrected: the file header still advertised the deleted check, and
the runner reported a test whose *name* contains `# SKIP` as a suite
that did not run. TAP escapes a `#` inside a description as `\#`, so a
negative lookbehind for the backslash is the whole difference between a
directive and a test discussing one. Verified both ways: the genuine
skip is listed, the test with the phrase in its name is not.

Checked while I was there, because the reviewer raised it: the runner
preserves `node --test`'s exit code (1 on a failing suite, 0 clean) and
streams its output through unchanged.

## Evidence

- Full suite: **539 tests, 537 pass, 0 fail**, plus the runner's block
  naming every skipped suite.
- R1: **220/220** byte-identical, both flag states; the generalised
  adversarial case red against `ebac5f6`, green after.
- R2: both runner-invisible shapes caught by the scan; the `# SKIP`
  false positive gone; exit code preserved.
- Adversarial by hand: workspace **10/10**, Scott **18/18**, nothing
  skipped.
- Non-workspace routes unaffected.

## What is NOT claimed

- Paid live-AI suites not run.
- No live delivery of the alert email has ever been observed.
- Nothing merged, deployed or enabled.
