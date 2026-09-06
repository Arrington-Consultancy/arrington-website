// Arrington AI Workspace: one-shot ingest of a controlled ANNA statement
// CSV into the Company Brain's finance lane.
//
// Tom's instruction (06/09/2026): the fresh ANNA finance source is
// controlled in Drive; ingest THAT exact file, refresh the transaction
// dataset and finance.summary from it, keep its source id, provenance
// and freshness date, and confirm the live Brain record actually
// updated. Do not invent future commitments, and do not close the open
// standing-order / scheduled-payment Brain Gap, because a statement
// export does not contain that data.
//
// Why a boot-time runner rather than the Finance page's upload form: the
// page needs a browser session as Tom, and the point here is a recorded,
// checkable ingestion of a named controlled source, with the outcome
// written into the deploy log and the activity register rather than
// remembered. It uses the SAME parser and the SAME recordCsvImport the
// page uses, so the data lands exactly as an upload would.
//
// Armed by:
//   RUN_ANNA_CSV_INGEST      a run label; unset means this does nothing
//   ANNA_CSV_B64             the CSV, base64 (the file is real bank data
//                            and belongs in a Railway variable for one
//                            deploy, never in code, git, Drive chat or
//                            a log line)
//   ANNA_CSV_SOURCE_NAME     the controlled file's name
//   ANNA_CSV_SOURCE_ID       its Drive id
//   ANNA_CSV_SOURCE_DATE     the freshness date (the export's last row,
//                            or the file's controlled date)
// Preconditions, all optional, each refused loudly when it does not
// match what the file says, so a wrong file cannot land:
//   ANNA_CSV_EXPECT_ROWS, ANNA_CSV_EXPECT_FROM, ANNA_CSV_EXPECT_TO,
//   ANNA_CSV_EXPECT_BALANCE_PENCE
//
// Spent once per label: the marker is a workspace_activity row with
// event_type 'finance_anna_ingested' and subject 'anna-ingest:<label>',
// so leaving the variables set cannot re-import on every deploy. Remove
// them afterwards anyway; the CSV is not something to leave lying in an
// environment.
//
// No transaction row is ever printed. The log carries counts, the date
// range, the closing balance, the record's own header lines and the gap
// register's ids, which is what a person needs to confirm the ingest
// without the bank statement being copied into a log.

const MARKER_EVENT = 'finance_anna_ingested';
const PROVIDER = 'anna_statement_csv';
const ACTOR = 'system:anna-ingest';

function markerSubject(label) { return `anna-ingest:${label}`; }

// What the caller stated about the file, versus what the parser found.
// Returns a list of problems; empty means the file is the one described.
function checkExpectations(parsed, env) {
  const problems = [];
  const dates = parsed.transactions.map((t) => t.date).sort();
  const from = dates[0] || null;
  const to = dates[dates.length - 1] || null;
  if (env.ANNA_CSV_EXPECT_ROWS !== undefined && env.ANNA_CSV_EXPECT_ROWS !== '') {
    const want = Number(env.ANNA_CSV_EXPECT_ROWS);
    if (parsed.transactions.length !== want) problems.push(`expected ${want} transaction row(s), the file parsed to ${parsed.transactions.length}`);
  }
  if (env.ANNA_CSV_EXPECT_FROM && from !== env.ANNA_CSV_EXPECT_FROM) problems.push(`expected the earliest row to be ${env.ANNA_CSV_EXPECT_FROM}, it is ${from}`);
  if (env.ANNA_CSV_EXPECT_TO && to !== env.ANNA_CSV_EXPECT_TO) problems.push(`expected the latest row to be ${env.ANNA_CSV_EXPECT_TO}, it is ${to}`);
  if (env.ANNA_CSV_EXPECT_BALANCE_PENCE !== undefined && env.ANNA_CSV_EXPECT_BALANCE_PENCE !== '') {
    const want = Number(env.ANNA_CSV_EXPECT_BALANCE_PENCE);
    if (parsed.closingBalancePence !== want) problems.push(`expected a closing balance of ${want} pence on the latest row, the file gives ${parsed.closingBalancePence}`);
  }
  if (parsed.warnings.length) problems.push(`${parsed.warnings.length} parser warning(s): ${parsed.warnings.slice(0, 3).join(' ')}`);
  return { problems, from, to };
}

// Provenance in words, from the controlled-source variables. Never the
// data itself.
function buildProvenance(env, { from, to } = {}) {
  const parts = [];
  if (env.ANNA_CSV_SOURCE_NAME) parts.push(`Controlled source: ${env.ANNA_CSV_SOURCE_NAME}`);
  if (env.ANNA_CSV_SOURCE_ID) parts.push(`Drive id ${env.ANNA_CSV_SOURCE_ID}`);
  if (from && to) parts.push(`covering ${from} to ${to}`);
  if (env.ANNA_CSV_SOURCE_DATE) parts.push(`freshness date ${env.ANNA_CSV_SOURCE_DATE}`);
  if (env.RUN_ANNA_CSV_INGEST) parts.push(`ingest run ${env.RUN_ANNA_CSV_INGEST}`);
  return parts.join('; ');
}

// Which of the gaps open before the ingest are no longer open after it.
// The ingest must close none: the standing-order gap in particular stays
// open because the file cannot answer it.
function closedByIngest(before, after) {
  const stillOpen = new Set(after.map((g) => g.id));
  return before.filter((g) => !stillOpen.has(g.id)).map((g) => g.id);
}

function describeGap(g) {
  const text = String(g.description || '').replace(/\s+/g, ' ').slice(0, 70);
  return `#${g.id} ${g.gap_type}${g.material ? ' (material)' : ''}: ${text}${g.description && g.description.length > 70 ? '...' : ''}`;
}

async function runAnnaCsvIngest(db, {
  env = process.env,
  parser = require('../lib/workspace/finance/annaStatementCsv'),
  financeRepo = require('../lib/workspace/finance/repo'),
  workspaceRepo = require('../lib/workspace/repo'),
  log = console
} = {}) {
  const label = String(env.RUN_ANNA_CSV_INGEST || '').trim();
  if (!label) return { ran: false, reason: 'not armed' };

  const { rows: existing } = await db.query(
    'SELECT id, created_at, summary FROM workspace_activity WHERE event_type = $1 AND subject = $2 ORDER BY id DESC LIMIT 1',
    [MARKER_EVENT, markerSubject(label)]
  );
  if (existing.length) {
    log.log(`ANNA CSV ingest: run '${label}' already spent (activity ${existing[0].id} at ${new Date(existing[0].created_at).toISOString()}). Remove RUN_ANNA_CSV_INGEST and ANNA_CSV_B64.`);
    return { ran: false, reason: 'already spent', activityId: existing[0].id };
  }

  if (!env.ANNA_CSV_B64) {
    log.error(`ANNA CSV ingest: run '${label}' is armed but ANNA_CSV_B64 is not set; nothing ingested.`);
    return { ran: false, reason: 'no file' };
  }
  let csv;
  try {
    csv = Buffer.from(String(env.ANNA_CSV_B64).replace(/\s+/g, ''), 'base64').toString('utf8');
  } catch (err) {
    log.error(`ANNA CSV ingest: ANNA_CSV_B64 could not be decoded (${err.message}); nothing ingested.`);
    return { ran: false, reason: 'undecodable' };
  }
  const parsed = parser.parseStatementCsv(csv);
  const { problems, from, to } = checkExpectations(parsed, env);
  log.log(`ANNA CSV ingest: run '${label}' parsed ${parsed.transactions.length} transaction row(s), ${from || 'n/a'} to ${to || 'n/a'}, closing balance ${parsed.closingBalancePence === null ? 'none' : `${parsed.closingBalancePence} pence`} on ${parsed.closingBalanceDate || 'n/a'}, ${parsed.warnings.length} warning(s).`);
  if (parsed.transactions.length === 0) problems.push('no transaction rows could be read');
  if (problems.length) {
    log.error(`ANNA CSV ingest REFUSED, nothing written: ${problems.join('; ')}.`);
    return { ran: false, reason: 'expectations not met', problems };
  }

  const gapsBefore = await workspaceRepo.listGaps({ status: 'open' });
  const provenance = buildProvenance(env, { from, to });
  const result = await financeRepo.recordCsvImport(PROVIDER, {
    transactions: parsed.transactions,
    warnings: parsed.warnings,
    closingBalancePence: parsed.closingBalancePence,
    closingBalanceDate: parsed.closingBalanceDate,
    importedBy: ACTOR,
    source: provenance
  });
  log.log(`ANNA CSV ingest: import outcome '${result.outcome}', ${result.itemsWritten} row(s) written (${result.transactionsParsed} parsed; rows already held are counted as written by the upsert).`);

  // Confirm the live Brain record, by reading it back rather than
  // trusting the call returned.
  const record = await workspaceRepo.getRecordByKey(financeRepo.FINANCE_SUMMARY_RECORD_KEY);
  if (!record) {
    log.error('ANNA CSV ingest: finance.summary record NOT present after import; the Brain did not update.');
  } else {
    const headerLines = String(record.body || '').split('\n').slice(0, 3);
    const asOf = record.as_of ? new Date(record.as_of).toISOString().slice(0, 10) : 'null';
    log.log(`ANNA CSV ingest: Brain record '${record.record_key}' updated: as_of ${asOf}, synced_at ${record.synced_at ? new Date(record.synced_at).toISOString() : 'null'}, sync_outcome '${record.sync_outcome}', sensitivity '${record.sensitivity}'.`);
    headerLines.forEach((line) => log.log(`ANNA CSV ingest:   ${line}`));
  }

  const gapsAfter = await workspaceRepo.listGaps({ status: 'open' });
  const closed = closedByIngest(gapsBefore, gapsAfter);
  if (closed.length) {
    log.error(`ANNA CSV ingest: ${closed.length} gap(s) were open before and are not now: ${closed.join(', ')}. This ingest closes nothing by design; investigate.`);
  } else {
    log.log(`ANNA CSV ingest: ${gapsBefore.length} open gap(s) before, ${gapsAfter.length} after; none closed by the ingest.`);
  }
  gapsAfter.forEach((g) => log.log(`ANNA CSV ingest:   open ${describeGap(g)}`));

  await workspaceRepo.addActivity({
    actor: ACTOR,
    eventType: MARKER_EVENT,
    summary: `Ingested controlled ANNA statement: ${parsed.transactions.length} row(s), ${from} to ${to}, closing balance ${parsed.closingBalancePence} pence. ${provenance}`,
    subject: markerSubject(label)
  });
  log.log(`ANNA CSV ingest: run '${label}' complete and recorded. Remove RUN_ANNA_CSV_INGEST and ANNA_CSV_B64 from the environment.`);
  return { ran: true, transactions: parsed.transactions.length, from, to, closingBalancePence: parsed.closingBalancePence, recordUpdated: !!record, gapsClosed: closed };
}

module.exports = { runAnnaCsvIngest, checkExpectations, buildProvenance, closedByIngest, markerSubject, MARKER_EVENT, PROVIDER, ACTOR };
