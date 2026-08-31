#!/usr/bin/env node
// `npm test`, with an honest account of what did not run.
//
// Governance findings L5, M4, N5, P4 and Q3: five consecutive reviews
// found more ways to write a gate that the source-scanning guard did not
// recognise - `t.skip`, a hoisted const, a spread options object, an
// early return with and without a comment, a renamed destructure, an
// alias, `process.env` passed as an argument. Every round added
// patterns; every round a reviewer found more. Matching the SHAPE of a
// gate is an arms race against ordinary JavaScript, and it was losing.
//
// So this reads what the test runner actually did, rather than guessing
// from source: a skip appears in the TAP output as a `# SKIP` directive
// whatever the source looks like. The runner streams node --test through
// unchanged and preserves its exit code; all it adds is the summary at
// the end.
//
// It does NOT replace the source scan in test/gatedSuites.test.js, and
// saying it did was finding S2, repeated here after the first correction
// missed this copy (finding T4). Two shapes never reach this output at
// all - a suite that is never registered, and an early return from a
// test body, which the runner reports as PASSING. Both halves exist
// because neither is sufficient alone.
const { spawn } = require('node:child_process');

const args = process.argv.slice(2);
const child = spawn(process.execPath, ['--test', ...args], {
  env: process.env,
  stdio: ['inherit', 'pipe', 'inherit']
});

let buffered = '';
const skipped = [];

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  buffered += chunk.toString();
  let nl;
  while ((nl = buffered.indexOf('\n')) !== -1) {
    const line = buffered.slice(0, nl);
    buffered = buffered.slice(nl + 1);
    // TAP: "ok 12 - name # SKIP reason". Indentation varies with nesting.
    // The `#` of a real directive is UNESCAPED. TAP escapes a `#` that
    // appears inside a description as `\#`, so that one negative
    // lookbehind is the whole difference between a genuine skip and a
    // test whose name happens to discuss one - which the first version
    // of this reported as a suite that did not run (finding R2).
    const m = line.match(/^\s*(?:not )?ok\s+\d+\s*-\s*(.+?)\s*(?<!\\)#\s*SKIP\s*(.*)$/);
    if (m) skipped.push({ name: m[1], reason: m[2] || '(no reason given)' });
  }
});

child.on('close', (code) => {
  const rule = '  ' + '='.repeat(64);
  const lines = ['', rule];
  if (!skipped.length) {
    lines.push('  Every suite ran. Nothing was skipped.');
  } else {
    lines.push(`  ${skipped.length} SUITE(S) DID NOT RUN. The counts above do not cover them.`);
    lines.push('  ' + '-'.repeat(64));
    for (const s of skipped) {
      lines.push(`  [SKIP] ${s.name}`);
      lines.push(`         ${s.reason}`);
    }
    lines.push('  ' + '-'.repeat(64));
    lines.push('  A release decision needs the adversarial suites run by hand');
    lines.push('  against a running instance. A green npm test is not that.');
  }
  lines.push(rule, '');
  process.stdout.write(lines.join('\n'));
  process.exit(code === null ? 1 : code);
});
