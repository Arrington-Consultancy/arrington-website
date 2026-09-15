// Receivables: reconciling what Arrington has DONE against what Zoho says
// has been INVOICED, PAID and remains OUTSTANDING (15/09/2026).
//
// This suite exists because of a specific defect, and the shape of the
// defect is what most of it guards. The first build of this capability
// had a record BUILDER that nothing ever called. The source class existed,
// the parser existed, the tests were green, and Ruth could not answer a
// single one of Tom's questions, because no record was ever written.
//
// So the second half of this file is deliberately NOT a unit test. It
// runs the real refresh against a real database and then asserts the
// records EXIST by key and CONTAIN what each of Tom's six questions needs.
// A test that only exercises a builder would have passed against the
// broken version, which is the whole lesson.
//
// Tom's six questions, verbatim:
//   1. What am I currently owed?
//   2. What does WSA owe me for?
//   3. Have I invoiced all the WSA work I've logged?
//   4. What work have I done that hasn't been invoiced?
//   5. Which clients have outstanding money?
//   6. What evidence in Drive supports that figure?

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const hoursLog = require('../../lib/workspace/hours/hoursLog');
const reconcile = require('../../lib/workspace/hours/reconcile');

// --- Fixtures -----------------------------------------------------------

const HEADER = ['Date', 'Client / Project', 'Work completed', 'Start', 'Finish', 'Break (mins)', 'Hours', 'Billable?', 'Rate (£/hr)', 'Value (£)', 'Notes / evidence'];
const HEADER_REF = [...HEADER, 'Invoice ref'];
const SUMMARY = [['Hourly rate', '£20.00']];

function row(date, hours, { client = 'WSA', billable = 'Yes', work = 'Portal work', ref = null } = {}) {
  const base = [date, client, work, '', '', '0', String(hours), billable, '', '', ''];
  return ref === null ? base : [...base, ref];
}

// A log WITHOUT an invoice reference column: what the sheet looks like
// today. All that can be said about unbilled work is a totals comparison.
function totalsGrid() {
  return [...SUMMARY, [], HEADER, row('01/09/2026', 10), row('11/09/2026', 2.5)];
}

// A log WITH the Invoice ref column Tom is being asked to add.
function refGrid() {
  return [...SUMMARY, [], HEADER_REF,
    row('01/09/2026', 10, { ref: 'INV-000004' }),
    row('26/08/2026', 0.9166666667, { work: 'Library PDFs', ref: '' }),
    row('11/09/2026', 2.5, { work: 'Portal redevelopment', ref: '' }),
    row('12/09/2026', 1, { work: 'Goodwill fix', ref: 'n/a' })
  ];
}

const NOW = Date.parse('2026-09-15T20:00:00Z');

function inv(o) {
  return {
    invoice_number: 'INV-000004', customer_name: 'World Student Advisors',
    date: '2026-09-01', due_date: '2026-09-08', status: 'sent',
    total: 200, balance: 200, ...o
  };
}

// --- The Zoho side ------------------------------------------------------

test('Zoho is the system of record for money owed, and its own balance is trusted', () => {
  const s = reconcile.summariseInvoices([
    inv({ invoice_number: 'A', total: 200, balance: 200, status: 'sent' }),
    inv({ invoice_number: 'B', total: 100, balance: 40, status: 'partially_paid' }),
    inv({ invoice_number: 'C', total: 50, balance: 0, status: 'paid' })
  ], { now: NOW });
  const c = s.customers[0];
  assert.equal(c.invoicedPence, 35000);
  assert.equal(c.outstandingPence, 24000, 'the residue Zoho reports, not one derived here');
  assert.equal(c.paidPence, 11000, 'total minus the balance Zoho gave, so credit notes are accounted for');
  assert.equal(c.openCount, 2);
  assert.equal(s.totalOutstandingPence, 24000);
});

test('a draft is not money owed, and a void invoice is not money at all', () => {
  const s = reconcile.summariseInvoices([
    inv({ invoice_number: 'D', status: 'draft', total: 900, balance: 900 }),
    inv({ invoice_number: 'V', status: 'void', total: 500, balance: 500 }),
    inv({ invoice_number: 'S', status: 'sent', total: 100, balance: 100 })
  ], { now: NOW });
  assert.equal(s.totalOutstandingPence, 10000, 'only the sent one is owed');
  assert.equal(s.customers[0].invoicedPence, 10000, 'the draft is not invoiced and the void is gone');
  assert.equal(s.openCount, 1);
});

test('the oldest overdue invoice is named, with how far past its due date it is', () => {
  const s = reconcile.summariseInvoices([
    inv({ invoice_number: 'A', due_date: '2026-09-08' }),
    inv({ invoice_number: 'B', due_date: '2026-09-14' })
  ], { now: NOW });
  assert.equal(s.customers[0].oldestDaysOverdue, 7);
  assert.equal(s.customers[0].oldestDueDate, '2026-09-08');
});

// --- The unbilled side --------------------------------------------------

test('without an Invoice ref column the answer is a comparison of TOTALS, and says so', () => {
  const parsed = hoursLog.parseHoursLog(totalsGrid());
  const r = reconcile.reconcile({ parsed, invoices: [inv({ total: 200, balance: 200 })], now: NOW });
  assert.equal(r.rowLevel, false);
  const wsa = r.perClient.find((c) => c.client === 'WSA');
  assert.equal(wsa.mode, 'totals');
  assert.equal(wsa.loggedPence, 25000, '12.5 hours at £20');
  assert.equal(wsa.invoicedPence, 20000);
  assert.equal(wsa.unbilledPence, 5000);
  assert.deepEqual(wsa.unbilledRows, [], 'no row can be named, and none is guessed at');
  assert.match(wsa.caveat, /comparison of totals/);
  assert.match(wsa.caveat, /invoiced at a different figure/);

  const text = reconcile.describeReceivables(r, { zohoReadAt: 'T', hoursReadAt: 'T' });
  assert.match(text, /COMPARISON OF TOTALS/);
  assert.doesNotMatch(text, /not invoiced: /, 'it must not list rows it cannot identify');
});

test('with an Invoice ref column the unbilled rows are named individually', () => {
  const parsed = hoursLog.parseHoursLog(refGrid());
  assert.equal(parsed.hasInvoiceRefColumn, true);
  const r = reconcile.reconcile({ parsed, invoices: [inv({ total: 200, balance: 200 })], now: NOW });
  assert.equal(r.rowLevel, true);
  const wsa = r.perClient.find((c) => c.client === 'WSA');
  assert.equal(wsa.mode, 'row_level');
  assert.deepEqual(wsa.unbilledRows.map((x) => x.date), ['26/08/2026', '11/09/2026']);
  // 55 minutes + 150 minutes = 3.41666 hours at £20.
  assert.equal(wsa.unbilledPence, 6833);
  assert.equal(wsa.writtenOffRows.length, 1, 'the goodwill row is excluded, not counted as unbilled');
  assert.equal(wsa.writtenOffRows[0].date, '12/09/2026');

  const text = reconcile.describeReceivables(r, { zohoReadAt: 'T', hoursReadAt: 'T' });
  assert.match(text, /not invoiced: 26\/08\/2026, 55 minutes, Library PDFs/);
  assert.match(text, /not invoiced: 11\/09\/2026, 150 minutes, Portal redevelopment/);
  assert.match(text, /1 row\(s\) marked as deliberately not chargeable/);
  assert.doesNotMatch(text, /Goodwill fix/, 'a written-off row is not presented as work awaiting an invoice');
});

test('MORE invoiced than logged is not read out as negative unbilled work', () => {
  // The sentence "-£646.67 logged and not invoiced" means nothing. The
  // real meaning is that work was invoiced without being logged, which
  // is ordinary and is what the reader needs told.
  const parsed = hoursLog.parseHoursLog(totalsGrid());
  const r = reconcile.reconcile({ parsed, invoices: [inv({ total: 900, balance: 900 })], now: NOW });
  const wsa = r.perClient.find((c) => c.client === 'WSA');
  assert.ok(wsa.unbilledPence < 0);
  const text = reconcile.describeReceivables(r, { zohoReadAt: 'T', hoursReadAt: 'T' });
  assert.match(text, /£650\.00 MORE invoiced than the log accounts for/);
  assert.doesNotMatch(text, /-£/, 'no negative money figure is ever printed');
});

test('a customer with nothing invoiced and nothing outstanding is not listed at £0.00', () => {
  // A draft-only customer has an entry in the map and no position. Saying
  // "£0.00 outstanding across 0 invoice(s)" reads as a statement about a
  // customer who owes nothing, which is noise at best.
  const r = reconcile.reconcile({
    parsed: null,
    invoices: [inv({ customer_name: 'Ignore Me', status: 'draft', total: 5, balance: 5 }), inv({ total: 200, balance: 200 })],
    now: NOW
  });
  const text = reconcile.describeReceivables(r, { zohoReadAt: 'T' });
  assert.doesNotMatch(text, /Ignore Me/);
  assert.match(text, /World Student Advisors/);
});

test('a client code the log cannot match to a Zoho customer refuses rather than guessing', () => {
  const parsed = hoursLog.parseHoursLog([...SUMMARY, [], HEADER, row('01/09/2026', 1, { client: 'ORCA' })]);
  const r = reconcile.reconcile({ parsed, invoices: [inv({ total: 200, balance: 200 })], now: NOW });
  const orca = r.perClient.find((c) => c.client === 'ORCA');
  assert.equal(orca.matchedCustomer, null);
  assert.equal(orca.unbilledPence, null, 'no difference is worked out against a customer we did not match');
  const text = reconcile.describeReceivables(r, { zohoReadAt: 'T', hoursReadAt: 'T' });
  assert.match(text, /no matching Zoho customer/);
  assert.match(text, /the difference cannot be worked out/);
  // And the Zoho customer is reported separately rather than dropped.
  assert.match(text, /Owing money but not present in the hours log/);
  assert.match(text, /World Student Advisors/);
});

test('with the hours log unreadable, Zoho still answers and the unbilled side says it is unavailable', () => {
  const r = reconcile.reconcile({ parsed: null, invoices: [inv({ total: 200, balance: 200 })], now: NOW });
  assert.equal(r.hoursAvailable, false);
  const text = reconcile.describeReceivables(r, { zohoReadAt: 'T', hoursError: 'the file is not shared' });
  assert.match(text, /OUTSTANDING.*£200\.00/s, 'the money question is still answered');
  assert.match(text, /WORK DONE BUT NOT INVOICED: unavailable/);
  assert.match(text, /the file is not shared/);
  assert.match(text, /No figure has been estimated/);
  assert.doesNotMatch(text, /£0\.00 logged/, 'a missing source is never reported as zero');
});

test('with ZOHO unreadable the outstanding figure is withheld, not printed as £0.00', () => {
  // The mirror of the case above, and it was MISSING until the route was
  // run for real: with Zoho unread, summariseInvoices([]) honestly returns
  // zero and the record printed "OUTSTANDING: £0.00 across 0 open
  // invoice(s)", which states that nothing is owed when nothing is KNOWN.
  // A caveat above a figure does not undo the figure.
  const r = reconcile.reconcile({ parsed: null, invoices: [], now: NOW });
  const text = reconcile.describeReceivables(r, { zohoAvailable: false, zohoError: 'the token was refused' });
  assert.match(text, /OUTSTANDING: unavailable/);
  assert.match(text, /the token was refused/);
  assert.match(text, /no figure has been worked out/);
  assert.doesNotMatch(text, /£0\.00/, 'no zero is stated for a source that was not read');
  assert.doesNotMatch(text, /0 open invoice\(s\)/);
  assert.doesNotMatch(text, /Read from Zoho at/, 'it must not claim a read time for a read that failed');
  // And the positive control, so this is not satisfied by saying nothing.
  const ok = reconcile.describeReceivables(
    reconcile.reconcile({ parsed: null, invoices: [inv({ total: 200, balance: 200 })], now: NOW }),
    { zohoAvailable: true, zohoReadAt: 'T' }
  );
  assert.match(ok, /OUTSTANDING.*£200\.00 across 1 open invoice\(s\)/s);
});

test('a failure reason is interpolated once, not wrapped in its own sentence', () => {
  // "could not be read (The hours log could not be read (...))" is what
  // happens when the whole sentence is passed where a reason is expected.
  // It is cosmetic and it reads as carelessness in the one place the
  // system is asking to be believed.
  const r = reconcile.reconcile({ parsed: null, invoices: [], now: NOW });
  const text = reconcile.describeReceivables(r, { zohoAvailable: false, zohoError: 'the token was refused', hoursError: 'the file is not shared' });
  assert.equal((text.match(/could not be read/g) || []).length, 2, 'once per source, never nested');
  assert.doesNotMatch(text, /\(\s*[A-Z][^()]*could not be read/, 'a reason is a clause, not a sentence');
});

test('the reconciler is pure: no network, no environment, no clock of its own', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'hours', 'reconcile.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /process\.env|fetch\(|require\(['"]\.\.\/repo/);
  assert.doesNotMatch(src, /Date\.now\(\)(?!\s*\})/, 'the only clock is the injected `now` default');
  assert.doesNotMatch(src, /scott/i);
});

// --- The end to end: the records are actually written -------------------

// This half needs a database. It is the half that would have caught the
// original defect, so it names what is missing rather than passing
// quietly: a silent skip here is exactly how "the builder is fine" was
// mistaken for "the capability works".
const HAS_DB = !!process.env.DATABASE_URL;

test('the refresh writes both Company Brain records, and they answer all six of Tom\'s questions', { skip: HAS_DB ? false : 'set DATABASE_URL to a throwaway database to run the end-to-end half' }, async () => {
  const service = require('../../lib/workspace/hours/service');
  const repo = require('../../lib/workspace/repo');
  const sheetsClient = require('../../lib/workspace/drive/sheetsClient');
  const financeRegistry = require('../../lib/workspace/finance/registry');
  const zohoClient = require('../../lib/workspace/finance/zohoInvoiceClient');
  const db = require('../../db/pool');

  const saved = { ...process.env };
  const grid = refGrid();
  // Stub the two sources at their own boundaries: the Sheets HTTP client
  // and the Zoho client's two read functions. Everything between them and
  // the database is the real code path the route runs.
  const realToken = zohoClient.getAccessToken;
  const realInvoices = zohoClient.getInvoices;
  const realConfigured = financeRegistry.isConfigured;
  try {
    process.env.ENABLE_WORKSPACE_DRIVE_RECORDS = 'true';
    process.env.DRIVE_RECORDS_SERVICE_ACCOUNT_JSON = '';
    process.env.DRIVE_RECORDS_CLIENT_EMAIL = 'probe@example.iam.gserviceaccount.com';
    process.env.DRIVE_RECORDS_PRIVATE_KEY = require('crypto').generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    }).privateKey;
    sheetsClient.__clearCacheForTests();
    sheetsClient.__clearTokenCacheForTests();
    sheetsClient.__setFetchForTests(async (url) => {
      const u = String(url);
      if (u.includes('oauth2')) return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 't', expires_in: 3600 }) };
      if (u.includes('values:batchGet')) return { ok: true, status: 200, text: async () => JSON.stringify({ valueRanges: [{ values: grid }] }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ properties: { title: 'CURRENT - Arrington Consultancy Log Hours Worker' }, sheets: [{ properties: { title: 'Hours Log' } }] }) };
    });
    financeRegistry.isConfigured = (id) => (id === 'zoho_invoice' ? true : realConfigured(id));
    zohoClient.getAccessToken = async () => 'zoho-token';
    zohoClient.getInvoices = async () => [
      inv({ invoice_number: 'INV-000004', total: 200, balance: 200, status: 'sent' }),
      inv({ invoice_number: 'INV-000003', customer_name: 'Orca Marine', total: 400, balance: 150, status: 'partially_paid', due_date: '2026-08-20' })
    ];

    // CLEAR BOTH ROWS FIRST, and this line is load-bearing. Without it a
    // row left by an EARLIER run satisfies "the record exists", so the
    // test passes against a refresh that writes nothing - which is the
    // exact defect this suite was written to catch. Found by planting
    // that defect and watching this test stay green.
    await db.query("DELETE FROM workspace_records WHERE record_key IN ('hours.log','receivables.summary')");
    assert.equal(await repo.getRecordByKey(service.HOURS_RECORD_KEY), null, 'starting from nothing');

    const result = await service.refreshRecords({ now: NOW });

    // FIRST: the records exist. Read back from the database by key, not
    // from the value the function returned, because the original defect
    // was precisely a builder whose output went nowhere.
    assert.deepEqual(result.written.sort(), ['hours.log', 'receivables.summary']);
    const hoursRow = await repo.getRecordByKey(service.HOURS_RECORD_KEY);
    const recvRow = await repo.getRecordByKey(service.RECEIVABLES_RECORD_KEY);
    assert.ok(hoursRow, 'hours.log is in workspace_records');
    assert.ok(recvRow, 'receivables.summary is in workspace_records');
    // And they were written by THIS refresh, not left by a previous one.
    assert.equal(new Date(hoursRow.synced_at).getTime(), NOW);
    assert.equal(new Date(recvRow.synced_at).getTime(), NOW);

    // Both are confidential, so the human clearance leg gates them.
    assert.equal(hoursRow.sensitivity, 'confidential');
    assert.equal(recvRow.sensitivity, 'confidential');
    assert.equal(hoursRow.source_class, 'hours');
    assert.equal(recvRow.source_class, 'finance', 'what a customer owes is a finance fact whoever asks');

    const body = recvRow.body;

    // 1. What am I currently owed?
    assert.match(body, /OUTSTANDING.*£350\.00 across 2 open invoice\(s\)/s);

    // 2. What does WSA owe me for?
    assert.match(body, /World Student Advisors: £200\.00 outstanding/);
    assert.match(body, /INV-000004 dated 2026-09-01, due 2026-09-08/);

    // 3. Have I invoiced all the WSA work I've logged?
    assert.match(body, /£68\.33 logged and not invoiced/);

    // 4. What work have I done that hasn't been invoiced?
    assert.match(body, /not invoiced: 26\/08\/2026, 55 minutes, Library PDFs/);
    assert.match(body, /not invoiced: 11\/09\/2026, 150 minutes, Portal redevelopment/);

    // 5. Which clients have outstanding money?
    assert.match(body, /Orca Marine: £150\.00 outstanding/);
    assert.match(body, /oldest 26 day\(s\) past its due date of 2026-08-20/);

    // 6. What evidence in Drive supports that figure? Both sources named,
    // with their read times, in the body AND in source_ref.
    assert.match(body, /CURRENT - Arrington Consultancy Log Hours Worker/);
    assert.match(body, /Google Sheet 11YzoTkTlUaYf2XB8mAzp_LMSAs45bXxzBsVN25dEB1A/);
    assert.match(body, /Read from Zoho at 2026-09-15T20:00:00\.000Z/);
    assert.match(recvRow.source_ref, /Zoho Invoice read/);
    assert.match(recvRow.source_ref, /Google Sheet 11Yzo/);

    // Freshness is real, not decorative: the record carries its own age
    // and the machinery every other record uses can call it stale.
    assert.equal(repo.recordFreshness(recvRow, new Date(NOW)).state, 'fresh');
    assert.equal(repo.recordFreshness(recvRow, new Date(NOW + 3 * 86400000)).state, 'stale');
    assert.equal(recvRow.sync_outcome, 'ok');

    // And the hours record is the underlying evidence, not a duplicate.
    assert.match(hoursRow.body, /Hourly rate on the record: £20\.00/);
    assert.match(hoursRow.body, /carries an invoice reference per row/);

    // NOW BREAK ONE SOURCE, which is the case this whole design exists
    // for: the record must still be written, and must say the unbilled
    // side is unavailable rather than reporting zero.
    sheetsClient.__clearCacheForTests();
    sheetsClient.__setFetchForTests(async () => { throw new Error('ECONNREFUSED'); });
    const degraded = await service.refreshRecords({ now: NOW + 60000 });
    assert.equal(degraded.ok, false);
    assert.deepEqual(degraded.written, ['receivables.summary'], 'no hours record is written from nothing');
    const after = await repo.getRecordByKey(service.RECEIVABLES_RECORD_KEY);
    assert.match(after.body, /£350\.00/, 'Zoho still answers');
    assert.match(after.body, /WORK DONE BUT NOT INVOICED: unavailable/);
    assert.match(after.body, /No figure has been estimated/);
    assert.match(after.body, /ECONNREFUSED/, 'and it names why, so a person can act on it');
    assert.equal(after.sync_outcome, 'partial', 'the record is honest about its own completeness');
    assert.doesNotMatch(after.body, /could not be read \(The hours log/, 'the reason is interpolated once');

    // AND THE OTHER WAY: Zoho down, hours log fine. The record must not
    // state £0.00 outstanding, which would say nothing is owed when
    // nothing is known.
    sheetsClient.__setFetchForTests(async (url) => {
      const u = String(url);
      if (u.includes('oauth2')) return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 't', expires_in: 3600 }) };
      if (u.includes('values:batchGet')) return { ok: true, status: 200, text: async () => JSON.stringify({ valueRanges: [{ values: grid }] }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ properties: { title: 'CURRENT - Arrington Consultancy Log Hours Worker' }, sheets: [{ properties: { title: 'Hours Log' } }] }) };
    });
    zohoClient.getInvoices = async () => { throw new Error('the token was refused'); };
    await service.refreshRecords({ now: NOW + 120000 });
    const zohoDown = await repo.getRecordByKey(service.RECEIVABLES_RECORD_KEY);
    assert.match(zohoDown.body, /OUTSTANDING: unavailable/);
    assert.match(zohoDown.body, /the token was refused/);
    assert.equal((zohoDown.body.match(/OUTSTANDING/g) || []).length, 1, 'said once, not as a warning and again as the line itself');
    assert.doesNotMatch(zohoDown.body, /£0\.00/, 'no zero is stated for a source that was not read');
    assert.match(zohoDown.body, /WORK DONE BUT NOT INVOICED, from CURRENT - Arrington/, 'the hours side still answers');
    assert.equal(zohoDown.sync_outcome, 'partial');
  } finally {
    process.env = saved;
    sheetsClient.__resetFetchForTests();
    sheetsClient.__clearCacheForTests();
    sheetsClient.__clearTokenCacheForTests();
    financeRegistry.isConfigured = realConfigured;
    zohoClient.getAccessToken = realToken;
    zohoClient.getInvoices = realInvoices;
    await db.pool.end();
  }
});
