// Drive write-back/export shaping — proves the doc's explicit "no
// circular AI evidence" requirement: a runtime-generated fact mirrored to
// Drive must remain labelled as AI-created fictional memory, whatever its
// lifecycle status, and never look like independently sourced evidence.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildExportRows, buildExportMarkdown } = require('../../../lib/scott/memory/driveExport');

function fact(overrides = {}) {
  return {
    id: 1,
    domain: 'suppliers_ops',
    canonicalQuestion: 'what is our usual glue supplier',
    answer: 'Titebond III.',
    provenance: 'ai_generated_fictional_memory',
    status: 'runtime_generated',
    createdByWorkerId: 'operations',
    askedByPersonaId: 'tony_marsh',
    version: 1,
    supersedesId: null,
    createdAt: new Date('2026-08-31T12:00:00Z'),
    ...overrides
  };
}

describe('driveExport provenance labelling', () => {
  for (const status of ['runtime_generated', 'drive_mirrored', 'superseded', 'disputed', 'retired']) {
    test(`a fact in status "${status}" is still exported with the AI-created label, never as independent evidence`, () => {
      const rows = buildExportRows([fact({ status })]);
      assert.equal(rows[0].provenance, 'ai_generated_fictional_memory');
      assert.match(rows[0].provenanceLabel, /AI-created fictional memory/);
      assert.match(rows[0].provenanceLabel, /not independently sourced evidence/);
    });

    test(`the Markdown export for status "${status}" carries the same warning inline, not only once at the top`, () => {
      const md = buildExportMarkdown([fact({ status })]);
      const occurrences = (md.match(/AI-created fictional memory/g) || []).length;
      assert.ok(occurrences >= 2, 'expected the provenance warning near the top AND repeated per domain section');
    });
  }

  test('an empty ledger exports honestly rather than fabricating placeholder content', () => {
    const md = buildExportMarkdown([]);
    assert.match(md, /No facts have been established yet/);
  });

  test('export rows never invent a provenance value even if the stored row is missing one', () => {
    const rows = buildExportRows([fact({ provenance: undefined })]);
    assert.equal(rows[0].provenance, 'ai_generated_fictional_memory');
  });
});
