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

  // Governance finding L5 (31/08/2026): the first version of this looked
  // only for a literal `skip:`, and three ordinary ways of writing the
  // same thing walked straight past it - `t.skip(...)` and
  // `test.skip(...)`, a gate spread in from an options object, and a
  // suite that simply returns early when its environment is absent. A
  // drift guard that a normal refactor defeats is not a guard.
  const GATE_SHAPES = [
    /skip:\s*[^\n]*/g,                       // { skip: ... } in test options
    /\b(?:t|test|describe|it)\.skip\s*\(/g,   // t.skip(...) / test.skip(...)
    /\.\.\.[A-Za-z_$][\w$]*(?:Gate|Skip|Opts|Options)\b/g, // { ...maybeSkip }
    // Finding M4: this shape used to require a trailing comment saying
    // "not configured", so it matched the COMMENT and not the gate, and
    // the same early return written without one walked straight past.
    // It now matches the guard itself: a return conditioned on an
    // environment variable.
    /if\s*\([^)]*process\.env[^)]*\)\s*\{?\s*return\b/g
  ];

  for (const file of everyTestFile(TEST_ROOT)) {
    if (file === __filename) continue; // this file quotes the patterns it looks for
    const src = fs.readFileSync(file, 'utf8');
    const gates = GATE_SHAPES.flatMap((re) => src.match(re) || []);
    const realGates = gates.filter((g) => !DB_ONLY_GATE.test(g) && !/skip:\s*false/.test(g));
    // A DB-only gate is excluded by its message, which only the `skip:`
    // shape carries; for the other shapes, check the whole file for a
    // non-database gate before flagging it.
    const dbOnlyFile = /set DATABASE_URL/.test(src) && !/(?:BASE_URL|_PASSWORD|RUN_[A-Z_]+|WAI_SEED_TEST)/.test(src);
    if (realGates.length && !dbOnlyFile && !declared.has(file)) {
      undeclared.push(path.relative(TEST_ROOT, file));
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
