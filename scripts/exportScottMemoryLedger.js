/**
 * Export the Scott evolving fictional memory ledger to a local Markdown
 * file, for a human (or an agent asked to) to place into the controlled
 * Scott Drive record — the same manual reconciliation step already used
 * for handover/regenerate-export.js's real Arrington content snapshot.
 *
 * This is the "controlled write-back/export route" required by "SCOTT
 * EVOLVING FICTIONAL BUSINESS MEMORY - APPROVED DESIGN CHANGE - 31 AUGUST
 * 2026". It reads the runtime ledger and writes a labelled, human-
 * readable export; it does not call the Google Drive API itself — there
 * is no Drive service-account credential in this codebase, and this
 * script does not invent one. See lib/scott/memory/driveExport.js for why.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node scripts/exportScottMemoryLedger.js [output-path]
 *
 * Default output: handover/scott-memory-ledger-export-<YYYY-MM-DD>.md
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { buildExportMarkdown } = require('../lib/scott/memory/driveExport');

const URL = process.env.DATABASE_URL;
if (!URL) {
  console.error('Set DATABASE_URL to the database whose memory ledger you want to export.');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const OUT = process.argv[2] || path.join(__dirname, '..', 'handover', `scott-memory-ledger-export-${today}.md`);

(async () => {
  const c = new Client({ connectionString: URL, ssl: URL.includes('localhost') ? false : { rejectUnauthorized: false } });
  await c.connect();
  const { rows } = await c.query('SELECT * FROM scott_memory_facts ORDER BY domain, created_at');
  const facts = rows.map((row) => ({
    id: row.id,
    domain: row.domain,
    canonicalQuestion: row.canonical_question,
    answer: row.answer_text,
    provenance: row.provenance,
    status: row.status,
    createdByWorkerId: row.created_by_worker_id,
    askedByPersonaId: row.asked_by_persona_id,
    version: row.version,
    supersedesId: row.supersedes_id,
    createdAt: row.created_at
  }));
  const markdown = buildExportMarkdown(facts);
  fs.writeFileSync(OUT, markdown);
  console.log(`Wrote ${facts.length} fact(s) to ${OUT}`);
  await c.end();
})().catch((err) => {
  console.error('Export failed:', err.message);
  process.exit(1);
});
