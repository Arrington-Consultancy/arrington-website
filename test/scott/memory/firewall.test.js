// Evolving fictional business memory must never be able to overwrite
// existing controlled evidence, and must not touch anything outside the
// Scott demonstration (the real Arrington Workspace, the public site).
//
// The doc's own required test list includes "an existing controlled fact
// cannot be overwritten by generated memory" and "public Arrington and
// the real Arrington Workspace are unaffected". Both are proven
// STRUCTURALLY here, the same style as test/scott/socialFirewall.test.js:
// deepBusinessFacts.js is a static, required-once JS module the ledger
// has no write path to at all, and the new files import nothing from
// lib/workspace or the public site's own routes.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const NEW_FILES = [
  '../../../lib/scott/memory/factLedger.js',
  '../../../lib/scott/memory/driveExport.js'
];

describe('evolving fictional memory: firewall from controlled evidence and from Arrington/Workspace', () => {
  test('factLedger.js never requires deepBusinessFacts.js, so it has no path to overwrite controlled evidence', () => {
    // Matches only an actual require() call, not the module's own
    // explanatory comments about why it deliberately does not do this.
    const source = fs.readFileSync(path.join(__dirname, '../../../lib/scott/memory/factLedger.js'), 'utf8');
    assert.doesNotMatch(source, /require\([^)]*deepBusinessFacts/, 'the fact ledger must not import the static controlled-evidence module at all');
  });

  test('deepBusinessFacts.js itself carries no write function of any kind for the memory feature to call', () => {
    // A belt-and-braces structural check from the other side: even if
    // something tried to reach in, the module exports no setter/writer.
    const deepFacts = require('../../../lib/scott/deepBusinessFacts');
    const suspiciousExports = Object.keys(deepFacts).filter((k) => /^(set|write|update|mutate)/i.test(k));
    assert.deepEqual(suspiciousExports, [], 'deepBusinessFacts.js must export data only, never a mutator');
  });

  test('formatDeepFactsBlock (controlled evidence) is rendered into the worker context before formatMemoryFactsBlock (runtime memory), so a worker sees controlled evidence first', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../lib/scott/data/contextBuilders.js'), 'utf8');
    const deepIdx = source.indexOf('formatDeepFactsBlock(persona, workerId)');
    const memIdx = source.indexOf('formatMemoryFactsBlock(persona, workerId, message)');
    assert.ok(deepIdx > -1 && memIdx > -1);
    assert.ok(deepIdx < memIdx, 'controlled evidence must be pushed into context before runtime memory, matching the answering rule\'s order');
  });

  for (const rel of NEW_FILES) {
    test(`${path.basename(rel)} does not import anything from the real Arrington Workspace`, () => {
      const source = fs.readFileSync(path.join(__dirname, rel), 'utf8');
      assert.doesNotMatch(source, /lib\/workspace/, `${rel} must not reach into lib/workspace`);
    });

    test(`${path.basename(rel)} does not touch any non-Scott database table`, () => {
      const source = fs.readFileSync(path.join(__dirname, rel), 'utf8');
      // Scan only inside backtick SQL template literals (actual queries),
      // never comments/prose, which is where "the update", "from a" etc.
      // as ordinary English produced false positives here.
      const sqlText = [...source.matchAll(/`([^`]*)`/gs)].map((m) => m[1]).join('\n');
      const tableRefs = [...sqlText.matchAll(/\b(?:FROM|INTO|UPDATE)\s+(\w+)/gi)].map((m) => m[1]);
      const nonScott = tableRefs.filter((t) => !t.startsWith('scott_'));
      assert.deepEqual(nonScott, [], `${rel} must only ever read/write scott_* tables, found: ${nonScott.join(', ')}`);
    });
  }

  test('the new schema.sql table only foreign-keys to itself, never into a workspace or public-site table', () => {
    const schema = fs.readFileSync(path.join(__dirname, '../../../db/schema.sql'), 'utf8');
    const start = schema.indexOf('CREATE TABLE IF NOT EXISTS scott_memory_facts');
    const end = schema.indexOf(');', start);
    const block = schema.slice(start, end);
    const refs = [...block.matchAll(/REFERENCES\s+(\w+)/gi)].map((m) => m[1]);
    assert.ok(refs.length > 0, 'expected at least the self-referencing supersedes_id foreign key');
    refs.forEach((r) => assert.equal(r, 'scott_memory_facts', `unexpected foreign key target: ${r}`));
  });

  test('ALLOWED_MEMORY_DOMAINS is a small curated allowlist, never the finance/HR/legal/safety/compliance/customer-commitment domains the doc explicitly reserves', () => {
    const { ALLOWED_MEMORY_DOMAINS } = require('../../../lib/scott/memory/factLedger');
    const forbidden = ['finance_full', 'finance_summary_ops', 'director_position', 'hr_full', 'debtor_flag', 'trade_terms', 'safety_baseline', 'safety_incidents', 'compliance_privacy', 'customer_terms'];
    forbidden.forEach((d) => assert.ok(!ALLOWED_MEMORY_DOMAINS.includes(d), `${d} must never be eligible for generated memory`));
  });
});
