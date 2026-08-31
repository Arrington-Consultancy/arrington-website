// What did NOT run, said plainly, by two checks that catch different
// things.
//
// The runtime half is scripts/runTests.js, which `npm test` runs: it
// reads the `# SKIP` directives the test runner actually emits, so a
// skip is observed rather than inferred and there is no source shape to
// evade.
//
// The source half is below. Governance finding R2: replacing the source
// scan with the runner LOST coverage, because two ordinary shapes never
// reach the runner's output at all - a suite that is never registered,
// and an early return from inside a test body. Both were caught by the
// scan. So both halves stay; neither replaces the other.
//
// Between them they answer the concern five consecutive reviews raised
// and none turned into a finding: `npm test` reported "skipped 2" while
// five whole suites carried a SKIP directive, including both adversarial
// suites and both live-AI suites, so a reader of that summary reasonably
// concluded almost everything had run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEST_ROOT = __dirname;

// Every suite that can decline to run, and what arms it. Keep the
// `arms` text as the thing a person would actually have to do.
const GATED = [
  { file: 'waiSeedMode.test.js', name: 'two-pass seed', arms: 'WAI_SEED_TEST_DATABASE_URL' },
  { file: 'scott/adversarialApi.test.js', name: 'Scott adversarial HTTP', arms: 'SCOTT_TEST_BASE_URL + SCOTT_DEMO_STAFF_PASSWORD, against a running server' },
  { file: 'scott/liveAiPressure.test.js', name: 'Scott live-AI pressure (SPENDS MONEY)', arms: 'RUN_SCOTT_LIVE_AI=true + ANTHROPIC_API_KEY + ENABLE_SCOTT_AI=true' },
  { file: 'workspace/adversarialApi.test.js', name: 'workspace adversarial HTTP', arms: 'WORKSPACE_TEST_BASE_URL + WORKSPACE_TEST_TOM_PASSWORD + WORKSPACE_TEST_PASSPHRASE, against a running server' },
  { file: 'workspace/liveAiPressure.test.js', name: 'workspace live-AI pressure (SPENDS MONEY)', arms: 'RUN_WORKSPACE_LIVE_AI=<run label> + ANTHROPIC_API_KEY + ENABLE_WORKSPACE_AI=true' }
];

// Suites gated only on DATABASE_URL are deliberately NOT listed: a
// developer without a database knows it, and they are not the suites
// whose absence has been mistaken for coverage.
const DB_ONLY_GATE = /set DATABASE_URL/;

function everyTestFile(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return everyTestFile(full);
    return e.name.endsWith('.test.js') ? [full] : [];
  });
}

test('every declared gated suite still exists', () => {
  // Governance findings L5, M4, N5, P4 and Q3: the source-scanning drift
  // guard that used to live here was defeated in five consecutive
  // reviews, each time by an ordinary way of writing a gate it did not
  // recognise. Matching the shape of a gate is an arms race against
  // JavaScript, and it was losing.
  //
  // It has been replaced by scripts/runTests.js, which reads the SKIP
  // directives the test runner actually emits. A skip appears there
  // whatever the source looks like, so there is no shape to evade, and
  // `npm test` now prints what did not run on every invocation.
  //
  // What is left here is the part that check cannot do: naming what
  // ARMS each suite, so a person knows how to run it.
  for (const g of GATED) {
    assert.ok(fs.existsSync(path.join(TEST_ROOT, g.file)), `declared gated suite ${g.file} no longer exists`);
    assert.ok(g.arms && g.arms.length > 4, `${g.file} does not say what arms it`);
  }
});

test('a gated suite cannot appear without being declared', () => {
  // The shapes below are the ones the runner cannot see. This is not an
  // attempt to enumerate every way of writing a gate - five reviews
  // proved that unwinnable - it is the narrow backstop for what the
  // runtime check structurally misses.
  const declared = new Set(GATED.map((g) => path.join(TEST_ROOT, g.file)));
  const undeclared = [];

  for (const file of everyTestFile(TEST_ROOT)) {
    if (file === __filename) continue; // this file quotes the patterns it looks for
    const src = fs.readFileSync(file, 'utf8');

    // A suite that registers nothing: no test() or describe() call at all.
    const registersSomething = /\b(?:test|describe|it)\s*\(/.test(src);

    // An early return from a test body, guarded on configuration. The
    // runner reports such a test as PASSING, not skipped, which is the
    // worse of the two failures this backstop exists for.
    const returnsEarlyOnEnv = /if\s*\([^)]*(?:process\.env|[A-Z][A-Z0-9_]{3,})[^)]*\)\s*\{?\s*return\b/.test(src)
      && !DB_ONLY_GATE.test(src);

    if ((!registersSomething || returnsEarlyOnEnv) && !declared.has(file)) {
      undeclared.push(`${path.relative(TEST_ROOT, file)} (${!registersSomething ? 'registers no tests' : 'returns early on configuration'})`);
    }
  }

  assert.deepEqual(undeclared, [],
    `these suites can decline to run in a way the runner cannot report: ${undeclared.join(', ')}`);
});

test('what did not run in this invocation is reported', () => {
  const env = process.env;
  const armed = {
    'waiSeedMode.test.js': !!env.WAI_SEED_TEST_DATABASE_URL,
    'scott/adversarialApi.test.js': !!(env.SCOTT_TEST_BASE_URL && env.SCOTT_DEMO_STAFF_PASSWORD),
    'scott/liveAiPressure.test.js': !!(env.RUN_SCOTT_LIVE_AI && env.ANTHROPIC_API_KEY && env.ENABLE_SCOTT_AI === 'true'),
    // Finding M5: WORKSPACE_TEST_PASSPHRASE was missing here, so a run
    // without it printed [RAN ] over a suite whose post-unlock half had
    // asserted nothing. Reporting a suite as run when half of it stood
    // down is the same dishonesty the alert's rule 4 forbids.
    'workspace/adversarialApi.test.js': !!(env.WORKSPACE_TEST_BASE_URL && env.WORKSPACE_TEST_TOM_PASSWORD && env.WORKSPACE_TEST_PASSPHRASE),
    'workspace/liveAiPressure.test.js': !!(env.RUN_WORKSPACE_LIVE_AI && env.ANTHROPIC_API_KEY && env.ENABLE_WORKSPACE_AI === 'true')
  };

  const notRun = GATED.filter((g) => !armed[g.file]);
  const lines = [
    '',
    '  ============================================================',
    `  GATED SUITES: ${notRun.length} of ${GATED.length} did NOT run in this invocation.`,
    '  The pass/fail counts above do not cover them.',
    '  ------------------------------------------------------------'
  ];
  for (const g of GATED) {
    lines.push(`  [${armed[g.file] ? 'RAN ' : 'SKIP'}] ${g.name}`);
    if (!armed[g.file]) lines.push(`         arm with: ${g.arms}`);
  }
  lines.push('  ------------------------------------------------------------');
  lines.push('  A release decision needs the adversarial suites run by hand');
  lines.push('  against a running instance. A green npm test is not that.');
  lines.push('  ============================================================');
  lines.push('');
  console.log(lines.join('\n'));

  // Reporting is the whole job here; this must never fail a normal run.
  assert.ok(true);
});
