// Scott AI Demonstration — evolving fictional memory: Drive write-back /
// export shaping.
//
// "SCOTT EVOLVING FICTIONAL BUSINESS MEMORY - APPROVED DESIGN CHANGE - 31
// AUGUST 2026" requires "a controlled write-back/export route from the
// runtime memory ledger into the Scott Drive records so newly created
// fictional facts can be inspected, audited, reconciled and included in
// future controlled snapshots" and is explicit that the mirror "must not
// create circular AI evidence: a runtime-generated fact mirrored to Drive
// remains labelled as AI-created fictional memory and must never be
// misrepresented as independently sourced evidence."
//
// This module is the PURE shaping half of that: given fact rows (from
// factLedger), it builds the structured export payload and a
// human-readable Markdown document body, always carrying explicit
// provenance/status labelling, testable with no database and no live
// Drive access at all.
//
// The actual Drive write is a separate, deliberately manual step —
// scripts/exportScottMemoryLedger.js writes this to a local file exactly
// the way handover/regenerate-export.js already does for the real
// Arrington content snapshot in this same repo. Nothing in the running
// Express app calls the Google Drive API directly: there is no Drive
// service-account credential wired into this codebase, and inventing one
// to make a chat feature "auto-push" to Drive on every fact creation
// would be a materially bigger, uncredentialed, unrequested change. A
// human (or an agent explicitly asked to) places the exported file's
// content into the controlled Drive record — the same reconciliation
// step already used for every other Drive-mirrored record in this
// project.

const { PROVENANCE } = require('./factLedger');

function statusLabel(status) {
  return {
    runtime_generated: 'runtime generated, not yet mirrored to Drive',
    drive_mirrored: 'mirrored to Drive',
    superseded: 'superseded by a later fact',
    disputed: 'disputed, pending human review',
    retired: 'retired'
  }[status] || status;
}

// One export row per fact, with provenance restated explicitly on every
// row rather than left as an implicit property of "which table this came
// from" — the export outlives the table once it's a document in Drive.
function buildExportRows(facts) {
  return facts.map((f) => ({
    id: f.id,
    domain: f.domain,
    canonicalQuestion: f.canonicalQuestion,
    answer: f.answer,
    provenance: f.provenance || PROVENANCE,
    provenanceLabel: 'AI-created fictional memory (not independently sourced evidence)',
    status: f.status,
    statusLabel: statusLabel(f.status),
    createdByWorkerId: f.createdByWorkerId,
    askedByPersonaId: f.askedByPersonaId,
    version: f.version,
    supersedesId: f.supersedesId,
    createdAt: f.createdAt
  }));
}

// Human-readable Markdown body for the controlled Drive record. Every
// section header restates the provenance warning, deliberately
// repetitively — a reader skimming just one section of a long ledger
// should still see it, not just at the top of the document.
function buildExportMarkdown(facts, { generatedAt } = {}) {
  const rows = buildExportRows(facts);
  const when = generatedAt || new Date();
  const lines = [
    '# Scott evolving fictional business memory: runtime export',
    '',
    `Generated ${when.toISOString()}. Every row below is AI-created fictional memory established at runtime by a Scott specialist worker under the 31 August 2026 approved design change. None of it is independently sourced evidence, and it must never be treated or cited as though it were.`,
    ''
  ];
  if (!rows.length) {
    lines.push('No facts have been established yet.');
    return lines.join('\n');
  }
  const byDomain = {};
  rows.forEach((r) => {
    byDomain[r.domain] = byDomain[r.domain] || [];
    byDomain[r.domain].push(r);
  });
  Object.keys(byDomain).sort().forEach((domain) => {
    lines.push(`## ${domain}`, '');
    lines.push('_AI-created fictional memory, not independently sourced evidence._', '');
    byDomain[domain].forEach((r) => {
      lines.push(`- **${r.canonicalQuestion}** -> ${r.answer}`);
      lines.push(`  - status: ${r.statusLabel}; created by ${r.createdByWorkerId}; version ${r.version}${r.supersedesId ? `; supersedes fact ${r.supersedesId}` : ''}; ${new Date(r.createdAt).toISOString().slice(0, 10)}`);
    });
    lines.push('');
  });
  return lines.join('\n');
}

module.exports = { buildExportRows, buildExportMarkdown, statusLabel };
