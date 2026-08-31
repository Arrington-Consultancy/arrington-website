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

// EVERY WAY OF NAMING THE ENVIRONMENT OBJECT, IN ONE PLACE.
//
// Governance finding W3: the previous version matched the literal text
// `process.env` and was walked past by five ordinary idioms - a
// destructure of `env` off `process`, an inline `require('process').env`,
// a bracket key `process['env']`, an alias built with `Object.assign`,
// and an alias read with a bracket rather than a dot. That was the ninth
// consecutive cycle in which this check was defeated.
//
// Chasing shapes one at a time is the arms race the reviewers have
// called unwinnable, so the pattern is factored: name the ENVIRONMENT
// EXPRESSION once, then express every rule in terms of it, and treat any
// identifier bound to one as an alias whose reads count. That collapses
// four of the five misses into the existing rules rather than adding
// four more rules.
//
// WHAT THIS CHECK IS, STATED HONESTLY. It is a backstop, not a proof. It
// reads source text, so a sufficiently indirect gate will always escape
// it. The durable version, named by the sixteenth reviewer, is a
// positive obligation measured by running the tree rather than reading
// it: every suite must either register a test under a bare
// DATABASE_URL-only environment or appear in GATED. That is deliberately
// NOT built here, because it is a rewrite of the test harness on the way
// to a release, which is the scope drift these reviews exist to catch.
// It is recorded as the next step rather than claimed as done.
const ENV_EXPR = String.raw`(?:(?:globalThis\s*\.\s*)?process\s*(?:\.\s*env\b|\[\s*['"]env['"]\s*\])|require\(\s*['"]process['"]\s*\)\s*\.\s*env\b)`;

// The identifiers bound to the environment object in this source. Shared
// by the name-reading rule and the early-return rule, so that finding X3
// cannot recur by one clause knowing about an alias the other does not.
function envAliases(src) {
  const aliasPatterns = [
    // const e = process.env  /  const e = require('process').env
    new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${ENV_EXPR}\\s*[;\\n]`, 'g'),
    // const e = { ...process.env }
    new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*\\{\\s*\\.\\.\\.\\s*${ENV_EXPR}[^}]*\\}`, 'g'),
    // const e = Object.assign({}, process.env)
    new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*Object\\.assign\\([^)]*${ENV_EXPR}[^)]*\\)`, 'g'),
    // const { env } = process  /  const { env: e } = process
    /(?:const|let|var)\s*\{\s*env\s*(?::\s*([A-Za-z_$][\w$]*))?\s*\}\s*=\s*(?:globalThis\s*\.\s*)?process\b/g
  ];
  const aliases = new Set();
  for (const re of aliasPatterns) {
    let m;
    while ((m = re.exec(src)) !== null) {
      // The bare `const { env } = process` form binds the name `env`.
      aliases.add(m[1] || 'env');
    }
  }
  return aliases;
}

// The alias names as a regex alternation, or a pattern that matches
// nothing when there are none. Never empty, because an empty alternation
// matches everywhere.
function aliasAlternation(src) {
  const names = [...envAliases(src)].map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return names.length ? `(?:${names.join('|')})\\s*[.[]` : '(?!)';
}

function referencedEnvNames(src) {
  const referenced = new Set();
  const add = (n) => { if (n) referenced.add(n); };

  // 1. A direct read by dot or by string key: process.env.FOO,
  //    process.env['FOO'], require('process').env.FOO, and so on.
  for (const m of src.match(new RegExp(`${ENV_EXPR}\\s*\\.\\s*(${NAME}+)`, 'g')) || []) {
    add(m.split('.').pop().trim());
  }
  for (const m of src.match(new RegExp(`${ENV_EXPR}\\s*\\[\\s*['"](${NAME}+)['"]\\s*\\]`, 'g')) || []) {
    add(m.replace(new RegExp(`.*['"](${NAME}+)['"].*`), '$1'));
  }

  // 2. A computed READ: the name cannot be resolved statically, so it is
  //    treated as reading something unknown. Deliberately not a computed
  //    WRITE - five real suites here set or delete env keys by computed
  //    name as part of a test, and flagging those is a false positive
  //    that would make the check noise.
  const computed = (src.match(new RegExp(`${ENV_EXPR}\\s*\\[[^\\]]+\\]\\s*(=[^=]|$)?`, 'gm')) || [])
    .filter((m) => !/\]\s*=[^=]/.test(m))
    .filter((m) => !/\[\s*['"][A-Za-z0-9_]+['"]\s*\]/.test(m))
    .filter((m) => !new RegExp(`delete\\s+${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(src));
  if (computed.length) add('<computed>');

  // 3. Destructuring straight off the environment.
  for (const m of src.match(new RegExp(`\\{([^{}]*)\\}\\s*=\\s*${ENV_EXPR}`, 'g')) || []) {
    for (const name of m.match(new RegExp(`${NAME}{2,}`, 'g')) || []) add(name);
  }

  // 4. ALIASES. Finding T5 covered `const env = process.env`; W3 added
  //    four more ways to hold the same object. Track what is read OFF an
  //    alias, not the alias itself, because two real suites here spread
  //    the environment into a child process or snapshot it for restore
  //    and neither is a gate. The alias set is computed by envAliases so
  //    the early-return rule below shares it (finding X3).
  for (const alias of envAliases(src)) {
    for (const r of src.match(new RegExp(`\\b${alias}\\s*\\.\\s*(${NAME}{2,})`, 'g')) || []) {
      add(r.split('.').pop().trim());
    }
    for (const r of src.match(new RegExp(`\\b${alias}\\s*\\[\\s*['"](${NAME}{2,})['"]\\s*\\]`, 'g')) || []) {
      add(r.replace(new RegExp(`.*['"](${NAME}{2,})['"].*`), '$1'));
    }
  }

  return referenced;
}

// A name the file ASSIGNS or DELETES is being manipulated as part of a
// test (setting the owner binding, clearing a mailbox), not gated on.
function assignedEnvNames(src) {
  const assigned = new Set();
  for (const m of src.match(new RegExp(`${ENV_EXPR}\\s*\\.\\s*(${NAME}+)\\s*=`, 'g')) || []) {
    assigned.add(m.replace(/\s*=$/, '').split('.').pop().trim());
  }
  for (const m of src.match(new RegExp(`delete\\s+${ENV_EXPR}\\s*\\.\\s*(${NAME}+)`, 'g')) || []) {
    assigned.add(m.split('.').pop().trim());
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
  //
  // Governance finding X3: this clause alone was NOT expressed in terms
  // of ENV_EXPR while the file said every rule was. It matched the
  // literal text `process.env`, which is the exact shape W3 found
  // insufficient, and it missed W3's own probe B, `require('process')`.
  // It was caught overall only because the name-reading rule saw the
  // name - so the miss became observable precisely where that rule
  // deliberately stands down, on an ambient name like CI or NODE_ENV,
  // and two spellings of one gate then classified differently. That is
  // the "half a fix in each direction" shape this file's U4 comment
  // warns against, one clause along.
  const earlyReturn = new RegExp(`if\\s*\\([^)]*(?:${ENV_EXPR}|${aliasAlternation(src)})[^)]*\\)\\s*\\{?\\s*return\\b`);
  const returnsEarlyOnEnv = earlyReturn.test(src);

  if (!registersSomething) return 'registers no tests';
  if (!dbOnlyEnvGate && readsConfiguration.length) return `reads ${readsConfiguration.sort().join(', ')}`;
  if (!dbOnlyEnvGate && returnsEarlyOnEnv) return 'returns early on configuration';
  return null;
}

module.exports = { classifySource, AMBIENT_ENV, DB_ONLY_GATE };
