// What did NOT run, said plainly.
//
// Governance concern, raised in all five reviews of the workspace
// candidate and never turned into a finding because nothing is broken:
// `npm test` reports "skipped 2" while five whole suites carry a SKIP
// directive, and the five include BOTH adversarial suites and BOTH
// live-AI suites. A reader of that summary reasonably concludes that
// almost everything ran. The important things had not.
//
// Node's counter is not wrong, it is counting something else: a suite
// gated at the `describe`/`test` level reports as one passing entry with
// a SKIP directive attached, and only some shapes land in the skipped
// tally. Rather than argue with the runner, this file states the truth
// separately, every run, where it cannot be missed.
//
// It also fails if a NEW gated suite appears without being listed here,
// so the honest summary cannot quietly fall behind the test tree - the
// same drift guard used elsewhere in this codebase for VALID_TEMPLATES
// and the permission maps.
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

test('the suites that can decline to run are all declared', () => {
  const declared = new Set(GATED.map((g) => path.join(TEST_ROOT, g.file)));
  const undeclared = [];

  // Governance findings L5, M4 and N5: three passes of adding patterns,
  // and each pass a reviewer found more shapes that walked past them -
  // `t.skip`, a hoisted const, a spread options object, an early return
  // with and without a comment. Matching the SHAPE of a gate is
  // whack-a-mole, and the guard was blind to the very forms this
  // repository's own suites use.
  //
  // So this no longer looks for how a gate is written. It looks for what
  // a gate must DO: read an environment variable. A suite cannot decline
  // to run based on configuration without reading configuration, however
  // it is spelled. Anything reading an env var outside the allowlist
  // below has to be declared.
  //
  // The allowlist is the variables a developer running the suite
  // normally has set, and which therefore do not make a suite
  // conditional in the sense that matters.
  const AMBIENT_ENV = new Set(['DATABASE_URL', 'SESSION_SECRET', 'NODE_ENV', 'CI', 'TZ']);

  for (const file of everyTestFile(TEST_ROOT)) {
    if (file === __filename) continue; // this file names the variables it looks for
    const src = fs.readFileSync(file, 'utf8');
    const referenced = new Set(
      (src.match(/process\.env\.([A-Z0-9_]+)/g) || []).map((m) => m.split('.').pop())
        .concat((src.match(/process\.env\[['"]([A-Z0-9_]+)['"]\]/g) || [])
          .map((m) => m.replace(/.*['"]([A-Z0-9_]+)['"].*/, '$1')))
        // Destructuring: const { FOO, BAR } = process.env
        .concat((src.match(/\{([^{}]*)\}\s*=\s*process\.env/g) || [])
          .flatMap((m) => (m.match(/[A-Z0-9_]{2,}/g) || [])))
    );
    // A file that ASSIGNS a variable is manipulating it as part of a
    // test (setting the owner binding, clearing a mailbox), not deciding
    // whether to run on it. Only a name that is read and never written
    // can gate the suite.
    const assigned = new Set(
      (src.match(/process\.env\.([A-Z0-9_]+)\s*=/g) || []).map((m) => m.replace(/process\.env\.([A-Z0-9_]+)\s*=/, '$1'))
        .concat((src.match(/delete\s+process\.env\.([A-Z0-9_]+)/g) || [])
          .map((m) => m.split('.').pop()))
        .concat((src.match(/process\.env\[['"]([A-Z0-9_]+)['"]\]\s*=/g) || [])
          .map((m) => m.replace(/.*['"]([A-Z0-9_]+)['"].*/, '$1')))
    );
    const gating = [...referenced].filter((name) => !AMBIENT_ENV.has(name) && !assigned.has(name));

    // The env check cannot see an UNCONDITIONAL skip, because such a
    // suite reads no configuration at all - it simply never runs. That
    // is arguably worse than a gated one, so the shape check stays
    // alongside the semantic one. They catch different things and
    // neither replaces the other.
    const hardSkips = (src.match(/\b(?:t|test|describe|it)\.skip\s*\(/g) || []);

    if ((gating.length || hardSkips.length) && !declared.has(file)) {
      const why = gating.length ? `reads ${gating.sort().join(', ')}` : 'skips unconditionally';
      undeclared.push(`${path.relative(TEST_ROOT, file)} (${why})`);
    }
  }

  assert.deepEqual(
    undeclared, [],
    `these suites can skip but are not declared in GATED, so a run that omits them would report nothing: ${undeclared.join(', ')}`
  );

  for (const g of GATED) {
    assert.ok(fs.existsSync(path.join(TEST_ROOT, g.file)), `declared gated suite ${g.file} no longer exists`);
  }
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
