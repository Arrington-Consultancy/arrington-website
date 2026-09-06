// The controlled ANNA statement ingest (06/09/2026): the parser picks
// the balance on the LATEST row when a day carries several, the runner
// refuses a file that does not match what was stated about it, writes
// through the same import the Finance page uses, reads the Brain record
// back, and closes no gap.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const csvParser = require('../../lib/workspace/finance/annaStatementCsv');
const ingest = require('../../scripts/ingestAnnaCsv');

const HEADER = 'date,type,description,reference,amount,balance,name,card';
// Two rows on the latest day. Newest first, as ANNA exports: the top row
// is the later transaction and carries the closing balance.
const NEWEST_FIRST = [
  HEADER,
  '05/09/2026,Card,Coffee,,-37.56,590.43,Cafe,1234',
  '05/09/2026,Transfer,Rent,,-100.00,627.99,Landlord,',
  '13/04/2026,Transfer,Opening,,727.99,727.99,Bank,'
].join('\n');
const OLDEST_FIRST = [
  HEADER,
  '13/04/2026,Transfer,Opening,,727.99,727.99,Bank,',
  '05/09/2026,Transfer,Rent,,-100.00,627.99,Landlord,',
  '05/09/2026,Card,Coffee,,-37.56,590.43,Cafe,1234'
].join('\n');

test('closing balance is the latest ROW on the latest day, whichever way the file is printed', () => {
  const a = csvParser.parseStatementCsv(NEWEST_FIRST);
  assert.equal(a.transactions.length, 3);
  assert.equal(a.closingBalanceDate, '2026-09-05');
  assert.equal(a.closingBalancePence, 59043, 'newest-first: the first printed row of the latest day');
  const b = csvParser.parseStatementCsv(OLDEST_FIRST);
  assert.equal(b.closingBalancePence, 59043, 'oldest-first: the last printed row of the latest day');
  assert.equal(b.closingBalanceDate, '2026-09-05');
});

test('a single-day file has no date direction, so the running balances decide', () => {
  const newest = [HEADER, '05/09/2026,Card,Coffee,,-37.56,590.43,Cafe,', '05/09/2026,Transfer,Rent,,-100.00,627.99,Landlord,'].join('\n');
  const oldest = [HEADER, '05/09/2026,Transfer,Rent,,-100.00,627.99,Landlord,', '05/09/2026,Card,Coffee,,-37.56,590.43,Cafe,'].join('\n');
  assert.equal(csvParser.parseStatementCsv(newest).closingBalancePence, 59043);
  assert.equal(csvParser.parseStatementCsv(oldest).closingBalancePence, 59043);
});

test('when the balances fit neither reading, the last printed row is kept (the previous behaviour)', () => {
  const ambiguous = [HEADER, '05/09/2026,Card,A,,-1.00,100.00,X,', '05/09/2026,Card,B,,-1.00,300.00,Y,'].join('\n');
  assert.equal(csvParser.parseStatementCsv(ambiguous).closingBalancePence, 30000);
});

test('a file with no balance column still reports no closing balance', () => {
  const r = csvParser.parseStatementCsv(['Date,Description,Amount', '05/09/2026,A,-1.00'].join('\n'));
  assert.equal(r.closingBalancePence, null);
});

test('expectations are checked against what the parser found, not what the caller hoped', () => {
  const parsed = csvParser.parseStatementCsv(NEWEST_FIRST);
  const ok = ingest.checkExpectations(parsed, { ANNA_CSV_EXPECT_ROWS: '3', ANNA_CSV_EXPECT_FROM: '2026-04-13', ANNA_CSV_EXPECT_TO: '2026-09-05', ANNA_CSV_EXPECT_BALANCE_PENCE: '59043' });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.from, '2026-04-13');
  assert.equal(ok.to, '2026-09-05');
  const bad = ingest.checkExpectations(parsed, { ANNA_CSV_EXPECT_ROWS: '69', ANNA_CSV_EXPECT_BALANCE_PENCE: '62799', ANNA_CSV_EXPECT_TO: '2026-09-04' });
  assert.equal(bad.problems.length, 3);
  assert.match(bad.problems[0], /expected 69 transaction row\(s\), the file parsed to 3/);
  assert.match(bad.problems[2], /expected a closing balance of 62799 pence/);
  assert.deepEqual(ingest.checkExpectations(parsed, {}).problems, [], 'no expectations means no problems');
});

test('provenance names the controlled source, its Drive id, the range and the freshness date, never the data', () => {
  const p = ingest.buildProvenance({
    ANNA_CSV_SOURCE_NAME: 'ARRINGTON ANNA TRANSACTIONS - 13 APRIL TO 5 SEPTEMBER 2026.csv',
    ANNA_CSV_SOURCE_ID: '1jj2SibObcIBxXqY8wO3ytIFrKxbqIsXU',
    ANNA_CSV_SOURCE_DATE: '2026-09-05',
    RUN_ANNA_CSV_INGEST: 'anna-20260906',
    ANNA_CSV_B64: 'ZGF0YQ=='
  }, { from: '2026-04-13', to: '2026-09-05' });
  assert.equal(p, 'Controlled source: ARRINGTON ANNA TRANSACTIONS - 13 APRIL TO 5 SEPTEMBER 2026.csv; Drive id 1jj2SibObcIBxXqY8wO3ytIFrKxbqIsXU; covering 2026-04-13 to 2026-09-05; freshness date 2026-09-05; ingest run anna-20260906');
  assert.doesNotMatch(p, /ZGF0YQ/);
});

test('closedByIngest names exactly the gaps that were open before and are not open after', () => {
  const before = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(ingest.closedByIngest(before, [{ id: 1 }, { id: 3 }]), [2]);
  assert.deepEqual(ingest.closedByIngest(before, before), []);
  assert.deepEqual(ingest.closedByIngest(before, [...before, { id: 9 }]), [], 'a new gap is not a closed one');
});

// A fake of everything the runner touches, recording what it wrote.
function harness({ spent = false, gapsBefore = [{ id: 7, gap_type: 'missing', material: true, description: 'Standing orders, scheduled payments and future direct debits are not on file.' }], record = true } = {}) {
  const writes = { imports: [], activity: [], recordReads: 0 };
  const logs = { log: [], error: [] };
  const db = {
    async query(sql, params) {
      assert.match(sql, /workspace_activity/);
      assert.equal(params[0], ingest.MARKER_EVENT);
      return { rows: spent ? [{ id: 41, created_at: new Date('2026-09-06T10:00:00Z'), summary: 'x' }] : [] };
    }
  };
  const financeRepo = {
    FINANCE_SUMMARY_RECORD_KEY: 'finance.summary',
    async recordCsvImport(provider, args) { writes.imports.push({ provider, args }); return { outcome: 'ok', itemsWritten: args.transactions.length, transactionsParsed: args.transactions.length, warnings: [], detail: '' }; }
  };
  const workspaceRepo = {
    async listGaps() { return gapsBefore; },
    async getRecordByKey(key) { writes.recordReads += 1; assert.equal(key, 'finance.summary'); return record ? { record_key: key, body: 'Source(s): ANNA (ok).\nBalance: £590.43 as of 2026-09-05.\nSource provenance: x\nfourth', as_of: new Date('2026-09-05T00:00:00Z'), synced_at: new Date(), sync_outcome: 'ok', sensitivity: 'confidential' } : null; },
    async addActivity(row) { writes.activity.push(row); }
  };
  const log = { log: (m) => logs.log.push(m), error: (m) => logs.error.push(m) };
  return { db, financeRepo, workspaceRepo, log, writes, logs };
}

const ARMED = {
  RUN_ANNA_CSV_INGEST: 'anna-test',
  ANNA_CSV_B64: Buffer.from(NEWEST_FIRST).toString('base64'),
  ANNA_CSV_SOURCE_NAME: 'TEST.csv',
  ANNA_CSV_SOURCE_ID: 'drive-id',
  ANNA_CSV_SOURCE_DATE: '2026-09-05',
  ANNA_CSV_EXPECT_ROWS: '3',
  ANNA_CSV_EXPECT_BALANCE_PENCE: '59043'
};

test('unarmed, the runner does nothing and touches nothing', async () => {
  const h = harness();
  const r = await ingest.runAnnaCsvIngest(h.db, { env: {}, parser: csvParser, ...h });
  assert.equal(r.ran, false);
  assert.equal(h.writes.imports.length, 0);
  assert.equal(h.writes.activity.length, 0);
});

test('a spent label refuses to run again, so leaving the variables set cannot re-import on every deploy', async () => {
  const h = harness({ spent: true });
  const r = await ingest.runAnnaCsvIngest(h.db, { env: ARMED, parser: csvParser, ...h });
  assert.equal(r.ran, false);
  assert.equal(r.reason, 'already spent');
  assert.equal(h.writes.imports.length, 0);
  assert.match(h.logs.log[0], /already spent/);
});

test('armed without a file, nothing is written and the log says so', async () => {
  const h = harness();
  const r = await ingest.runAnnaCsvIngest(h.db, { env: { RUN_ANNA_CSV_INGEST: 'x' }, parser: csvParser, ...h });
  assert.equal(r.reason, 'no file');
  assert.equal(h.writes.imports.length, 0);
});

test('a file that does not match the stated expectations is refused before anything is written', async () => {
  const h = harness();
  const r = await ingest.runAnnaCsvIngest(h.db, { env: { ...ARMED, ANNA_CSV_EXPECT_ROWS: '69' }, parser: csvParser, ...h });
  assert.equal(r.ran, false);
  assert.equal(r.reason, 'expectations not met');
  assert.equal(h.writes.imports.length, 0);
  assert.equal(h.writes.activity.length, 0);
  assert.match(h.logs.error[0], /REFUSED, nothing written/);
});

test('a matching file is imported through recordCsvImport with provenance, the Brain record is read back, no gap is closed, and the run is marked spent', async () => {
  const h = harness();
  const r = await ingest.runAnnaCsvIngest(h.db, { env: ARMED, parser: csvParser, ...h });
  assert.equal(r.ran, true);
  assert.equal(r.transactions, 3);
  assert.equal(r.closingBalancePence, 59043);
  assert.equal(r.recordUpdated, true);
  assert.deepEqual(r.gapsClosed, []);
  assert.equal(h.writes.imports.length, 1);
  const imp = h.writes.imports[0];
  assert.equal(imp.provider, 'anna_statement_csv');
  assert.equal(imp.args.importedBy, ingest.ACTOR);
  assert.equal(imp.args.closingBalancePence, 59043);
  assert.match(imp.args.source, /Controlled source: TEST\.csv; Drive id drive-id; covering 2026-04-13 to 2026-09-05; freshness date 2026-09-05/);
  assert.equal(h.writes.recordReads, 1);
  assert.equal(h.writes.activity.length, 1);
  assert.equal(h.writes.activity[0].eventType, ingest.MARKER_EVENT);
  assert.equal(h.writes.activity[0].subject, ingest.markerSubject('anna-test'));
  assert.ok(h.logs.log.some((m) => /open #7 missing \(material\): Standing orders/.test(m)), 'the open gap is listed by id after the ingest');
  assert.ok(h.logs.log.some((m) => /none closed by the ingest/.test(m)));
  assert.equal(h.logs.error.length, 0);
  // No transaction row reaches the log.
  const all = h.logs.log.join('\n');
  assert.doesNotMatch(all, /Coffee|Landlord|Cafe|1234/);
});

test('an absent Brain record after import is reported as a failure to update, not glossed', async () => {
  const h = harness({ record: false });
  const r = await ingest.runAnnaCsvIngest(h.db, { env: ARMED, parser: csvParser, ...h });
  assert.equal(r.recordUpdated, false);
  assert.ok(h.logs.error.some((m) => /NOT present after import/.test(m)));
});

test('the seed wires the runner after the workspace snapshot ingest, non-fatally', () => {
  const seed = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'seed.js'), 'utf8');
  const snapshotIdx = seed.indexOf("ingestWorkspaceSnapshot(require('../lib/workspace/repo'))");
  const runnerIdx = seed.indexOf("require('../scripts/ingestAnnaCsv').runAnnaCsvIngest(db)");
  assert.ok(snapshotIdx > 0 && runnerIdx > snapshotIdx);
  assert.match(seed.slice(runnerIdx - 20, runnerIdx + 200), /try \{[\s\S]*catch \(err\)/);
  assert.match(seed, /ADD COLUMN IF NOT EXISTS source_provenance/);
});

test('recordCsvImport passes provenance onto the account row and the summary record names it, plus the no-future-commitments sentence', () => {
  const repo = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'finance', 'repo.js'), 'utf8');
  assert.match(repo, /sourceProvenance: String\(source \|\| ''\)\.trim\(\) \|\| `Manual upload by/);
  assert.match(repo, /Source provenance: \$\{headline\.sourceProvenance\}/);
  assert.match(repo, /does not list standing orders, scheduled payments or future direct debits/);
  assert.match(repo, /source_provenance = CASE WHEN EXCLUDED\.source_provenance = ''/);
});
