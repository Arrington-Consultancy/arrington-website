// The probes that establish the gated-suite source scan.
//
// Governance finding V3(c): the U remediation claimed "seven probes, both
// directions" for U3 and U4. They were run by hand and never committed,
// so nothing in the tree established either, on a check that has now been
// defeated in seven consecutive reviews. These are those probes, made
// permanent and run against the real classifier rather than a copy of it.
//
// The fixtures are plain .js, not .test.js, so the runner never executes
// them and the scan's own walk never collects them: they are source to be
// classified, not suites to be run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifySource } = require('./helpers/gatedSuiteScan');

const PROBES = path.join(__dirname, 'fixtures', 'gatedSuiteProbes');

function probeFiles() {
  return fs.readdirSync(PROBES).filter((f) => f.endsWith('.js')).sort();
}

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
