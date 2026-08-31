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
  // Governance findings L5, M4, N5, P4, Q3, R2 and S2: the source scan
  // below was defeated in five consecutive reviews, each time by an
  // ordinary way of writing a gate it did not recognise, so
  // scripts/runTests.js was added to read the SKIP directives the runner
  // actually emits.
  //
  // That did NOT replace the scan, and this comment claimed twice that
  // it had (finding S2), while the code two functions below said
  // otherwise. Two shapes never reach the runner's output at all: a
  // suite that is never registered, and an early return from a test
  // body, which the runner reports as PASSING. So both halves exist and
  // neither is sufficient alone.
  //
  // This particular test is the third thing, which neither check can do:
  // naming what ARMS each suite, so a person knows how to run it.
  for (const g of GATED) {
    assert.ok(fs.existsSync(path.join(TEST_ROOT, g.file)), `declared gated suite ${g.file} no longer exists`);
    assert.ok(g.arms && g.arms.length > 4, `${g.file} does not say what arms it`);
  }
});

test('a gated suite cannot appear without being declared', () => {
  // The backstop for what the runtime check structurally cannot see.
  // Not an attempt to enumerate every way of writing a gate - five
  // reviews proved that unwinnable - but it must at least catch the
  // shapes the runner is blind to, and finding S1 showed it did not.
  const declared = new Set(GATED.map((g) => path.join(TEST_ROOT, g.file)));
  const undeclared = [];

  // Variables a developer running the suite normally has set, which
  // therefore do not make a suite conditional in the sense that matters.
  const AMBIENT_ENV = new Set(['DATABASE_URL', 'SESSION_SECRET', 'NODE_ENV', 'CI', 'TZ']);

  for (const file of everyTestFile(TEST_ROOT)) {
    if (file === __filename) continue; // this file quotes the patterns it looks for
    const src = fs.readFileSync(file, 'utf8');

    // 1. Reading configuration at all.
    //
    // Finding S1: `if (process.env.X) { test(...) }` was caught by
    // NEITHER half. The runner cannot see it, because a test that is
    // never registered emits nothing; and the check below for "registers
    // nothing" passed it, because the source text does contain `test(`.
    // A suite cannot decide whether to register on configuration without
    // READING configuration, so this is the check that catches it.
    const referenced = new Set(
      (src.match(/process\.env\.([A-Z0-9_]+)/g) || []).map((m) => m.split('.').pop())
        .concat((src.match(/process\.env\[['"]([A-Z0-9_]+)['"]\]/g) || [])
          .map((m) => m.replace(/.*['"]([A-Z0-9_]+)['"].*/, '$1')))
        .concat((src.match(/\{([^{}]*)\}\s*=\s*process\.env/g) || [])
          .flatMap((m) => (m.match(/[A-Z0-9_]{2,}/g) || [])))
    );
    // A name the file ASSIGNS is being manipulated as part of a test
    // (setting the owner binding, clearing a mailbox), not gated on.
    const assigned = new Set(
      (src.match(/process\.env\.([A-Z0-9_]+)\s*=/g) || [])
        .map((m) => m.replace(/process\.env\.([A-Z0-9_]+)\s*=/, '$1'))
        .concat((src.match(/delete\s+process\.env\.([A-Z0-9_]+)/g) || []).map((m) => m.split('.').pop()))
    );
    const readsConfiguration = [...referenced].filter((n) => !AMBIENT_ENV.has(n) && !assigned.has(n));

    // 2. A file that registers nothing at all.
    const registersSomething = /\b(?:test|describe|it)\s*\(/.test(src);

    // 3. An early return guarded on configuration, which the runner
    //    reports as a PASSING test rather than a skipped one.
    //
    // Finding S1 again: this used to accept any capitalised identifier,
    // so ordinary code like `if (res.STATUS_CODE) return` was reported as
    // a gated suite. It names process.env now, because that is what a
    // configuration gate actually reads.
    const returnsEarlyOnEnv = /if\s*\([^)]*process\.env[^)]*\)\s*\{?\s*return\b/.test(src);

    const why = readsConfiguration.length ? `reads ${readsConfiguration.sort().join(', ')}`
      : (!registersSomething ? 'registers no tests'
        : (returnsEarlyOnEnv ? 'returns early on configuration' : null));

    if (why && !declared.has(file)) undeclared.push(`${path.relative(TEST_ROOT, file)} (${why})`);
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
