// The probes that establish the gated-suite source scan.
//
// Governance finding V3(c): the U remediation claimed "seven probes, both
// directions" for U3 and U4. They were run by hand and never committed,
// so nothing in the tree established either, on a check that has now been
// defeated in seven consecutive reviews. These are those probes, made
// permanent and run against the real classifier rather than a copy of it.
//
// THE FIXTURES CARRY A NON-EXECUTABLE EXTENSION, AND THAT IS DELIBERATE.
//
// This comment previously said they were "plain .js, not .test.js, so the
// runner never executes them". Half of that was true and half was not,
// which makes it the sixteenth instance of the thing this whole chain has
// been about, written into the commit that fixed the fifteenth.
//
// Node's default discovery is not only `*.test.js`. It includes
// `**/test/**/*.{js,cjs,mjs}`: EVERY .js file under a directory named
// `test`, whatever the file is called. So all twelve fixtures were being
// executed by `npm test`. It was easy to miss because the TAP shows a
// file that registers nothing under its own path and a file that
// registers something under that test's NAME, so a first look at the
// directory name finds only part of the set and reads like a partial
// rule.
//
// Three things followed, none of them security: about thirteen of the
// suite's reported tests were fixtures rather than coverage, on a number
// cited as evidence in a remediation; and the early-return fixture throws
// when its flag is set, so a fixture could turn the real suite red on an
// unrelated environment variable, which is finding V4's own class.
//
// The extension is now `.jsfixture`, which no discovery glob matches, and
// the property is asserted by a TEST below rather than by this paragraph.
// A comment claiming the runner ignores a file is exactly the kind of
// statement this chain has learned not to trust.
//
// The other half was true and stays true: the scan's own walk collects
// `*.test.js` only, so the classifier never classifies its own probes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifySource } = require('./helpers/gatedSuiteScan');

const PROBES = path.join(__dirname, 'fixtures', 'gatedSuiteProbes');

const FIXTURE_EXT = '.jsfixture';

function probeFiles() {
  return fs.readdirSync(PROBES).filter((f) => f.endsWith(FIXTURE_EXT)).sort();
}

test('no fixture carries an extension the test runner would execute', () => {
  // The property the false comment above used to assert. Node runs every
  // .js, .cjs and .mjs file under a directory named `test`, so a fixture
  // given one of those extensions silently becomes a suite: it inflates
  // the counts a release decision reads, and it can fail the run on an
  // environment variable that has nothing to do with the code.
  const executable = fs.readdirSync(PROBES)
    .filter((f) => /\.(?:js|cjs|mjs)$/.test(f));
  assert.deepEqual(executable, [],
    `these fixtures would be executed as test suites by node --test: ${executable.join(', ')}`);
});

test('the probe fixtures are present and cover both directions', () => {
  const files = probeFiles();
  assert.ok(files.some((f) => f.startsWith('must-flag-')), 'no must-flag fixtures');
  assert.ok(files.some((f) => f.startsWith('must-pass-')), 'no must-pass fixtures');
  assert.ok(files.length >= 10, `only ${files.length} probes; this check has been evaded seven times`);
});

test('every shape that can decline to run is flagged', () => {
  const missed = [];
  for (const f of probeFiles().filter((n) => n.startsWith('must-flag-'))) {
    const why = classifySource(fs.readFileSync(path.join(PROBES, f), 'utf8'));
    if (!why) missed.push(f);
  }
  assert.deepEqual(missed, [],
    `these gate shapes walk past the scan, and the runner cannot see them either: ${missed.join(', ')}`);
});

test('ordinary suites are not flagged, because a check that cries wolf gets loosened', () => {
  const falsePositives = [];
  for (const f of probeFiles().filter((n) => n.startsWith('must-pass-'))) {
    const why = classifySource(fs.readFileSync(path.join(PROBES, f), 'utf8'));
    if (why) falsePositives.push(`${f} (${why})`);
  }
  assert.deepEqual(falsePositives, [],
    `these ordinary suites are reported as undeclared gates: ${falsePositives.join(', ')}`);
});
