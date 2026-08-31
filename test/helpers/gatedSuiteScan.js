// The source half of the gated-suite check, extracted so the probes that
// establish it can exercise the REAL function rather than a copy.
//
// Governance finding V3(c): the "seven probes, both directions" claimed
// in the U remediation were run by hand and never committed, so nothing
// in the tree established U3 or U4. The chain's own working rule, adopted
// after J1, is that every asserted property must name the test that
// establishes it. test/gatedSuiteScan.test.js is that test, and it runs
// against the fixtures in test/fixtures/gatedSuiteProbes/.
//
// Why a source scan exists at all: scripts/runTests.js reads the SKIP
// directives the runner emits, which is stronger evidence where it
// applies, but two ordinary shapes never reach the runner's output - a
// suite that never registers, and an early return from a test body,
// which the runner reports as PASSING. Finding R2 was the attempt to
// replace this with the runner alone.

// Variables a developer running the suite normally has set, which
// therefore do not make a suite conditional in the sense that matters.
const AMBIENT_ENV = new Set(['DATABASE_URL', 'SESSION_SECRET', 'NODE_ENV', 'CI', 'TZ']);

// Suites gated only on DATABASE_URL are deliberately not treated as
// undeclared gates: a developer without a database knows it, and they
// are not the suites whose absence has been mistaken for coverage.
const DB_ONLY_GATE = /set DATABASE_URL/;

// EVERY name pattern below is case-INSENSITIVE, and finding V3 is why.
// U4 made the first of the three read-shapes case-insensitive and left
// the destructure shape and both suppressors requiring upper case, so
// `const { runLiveThing } = process.env` was invisible in one direction
// while a suite setting a lower-case key was falsely flagged in the
// other. Half a fix in each direction is worse than neither, because the
// false positive is what gets a check loosened.
const NAME = '[A-Za-z0-9_]';

function referencedEnvNames(src) {
  const referenced = new Set();

  // 1. process.env.FOO
  for (const m of src.match(new RegExp(`process\\.env\\.(${NAME}+)`, 'g')) || []) {
    referenced.add(m.split('.').pop());
  }

  // 2. process.env['FOO']
  for (const m of src.match(new RegExp(`process\\.env\\[['"](${NAME}+)['"]\\]`, 'g')) || []) {
    referenced.add(m.replace(new RegExp(`.*['"](${NAME}+)['"].*`), '$1'));
  }

  // 3. A computed READ: process.env[whatever], where the name cannot be
  //    resolved statically. Deliberately not a computed WRITE - five real
  //    suites here set or delete env keys by computed name as part of a
  //    test, and flagging those is a false positive that would make this
  //    check noise.
  const computed = (src.match(/process\.env\[[^\]]+\]\s*(=[^=]|$)?/gm) || [])
    .filter((m) => !/\]\s*=[^=]/.test(m))
    .filter((m) => !new RegExp(`delete\\s+${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(src));
  if (computed.length) referenced.add('<computed>');

  // 4. Destructuring: const { FOO } = process.env
  for (const m of src.match(/\{([^{}]*)\}\s*=\s*process\.env/g) || []) {
    for (const name of m.match(new RegExp(`${NAME}{2,}`, 'g')) || []) referenced.add(name);
  }

  // 5. Finding T5: an alias walks past all of the above. Track what is
  //    read OFF the alias, not the alias itself, because two real suites
  //    spread process.env into a child process or snapshot it for restore
  //    and neither is a gate.
  const aliases = [
    ...(src.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*process\.env\s*[;\n]/g) || []),
    ...(src.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{\s*\.\.\.\s*process\.env[^}]*\}/g) || [])
  ].map((m) => m.replace(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)[\s\S]*$/, '$1'));
  for (const alias of aliases) {
    for (const r of src.match(new RegExp(`\\b${alias}\\.(${NAME}{2,})`, 'g')) || []) {
      referenced.add(r.split('.').pop());
    }
  }

  return referenced;
}

// A name the file ASSIGNS or DELETES is being manipulated as part of a
// test (setting the owner binding, clearing a mailbox), not gated on.
function assignedEnvNames(src) {
  const assigned = new Set();
  for (const m of src.match(new RegExp(`process\\.env\\.(${NAME}+)\\s*=`, 'g')) || []) {
    assigned.add(m.replace(new RegExp(`process\\.env\\.(${NAME}+)\\s*=`), '$1'));
  }
  for (const m of src.match(new RegExp(`delete\\s+process\\.env\\.(${NAME}+)`, 'g')) || []) {
    assigned.add(m.split('.').pop());
  }
  return assigned;
}

// Returns a reason string if this source can decline to run in a way the
// runner cannot report, or null if it cannot.
function classifySource(src) {
  const referenced = referencedEnvNames(src);
  const assigned = assignedEnvNames(src);
  const readsConfiguration = [...referenced].filter((n) => !AMBIENT_ENV.has(n) && !assigned.has(n));

  // Finding U3: this suppression used to apply to ALL THREE clauses, so
  // any file containing the literal phrase "set DATABASE_URL" stopped
  // being checked for registering nothing or returning early, silently,
  // on ten real files. It suppresses only the clause it is about.
  const dbOnlyEnvGate = DB_ONLY_GATE.test(src) && !readsConfiguration.length;

  // A file that registers nothing at all. Finding S1: the runner cannot
  // see this, because a test that is never registered emits nothing.
  const registersSomething = /\b(?:test|describe|it)\s*\(/.test(src);

  // An early return guarded on configuration, which the runner reports as
  // a PASSING test rather than a skipped one.
  const returnsEarlyOnEnv = /if\s*\([^)]*process\.env[^)]*\)\s*\{?\s*return\b/.test(src);

  if (!registersSomething) return 'registers no tests';
  if (!dbOnlyEnvGate && readsConfiguration.length) return `reads ${readsConfiguration.sort().join(', ')}`;
  if (!dbOnlyEnvGate && returnsEarlyOnEnv) return 'returns early on configuration';
  return null;
}

module.exports = { classifySource, AMBIENT_ENV, DB_ONLY_GATE };
