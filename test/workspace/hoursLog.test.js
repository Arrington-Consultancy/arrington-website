// The hours log connector, its arithmetic, and the invoice check
// (15/09/2026).
//
// Tom's instruction after an invoice went out at a stale figure: read the
// log, total it independently, apply the recorded rate, compare, and name
// the row that causes any difference.
//
// THE FIXTURE IS THE REAL RECORD'S SHAPE AND NUMBERS. Every date, every
// hours figure, the rate and the stated totals are exactly as they stand
// in "CURRENT - Arrington Consultancy Log Hours Worker", because a test
// that proves 27.57 hours and £551.33 against invented rows proves
// nothing about the sheet this connector actually reads. The WORK
// DESCRIPTIONS and the evidence notes are replaced with short neutral
// labels on purpose: they name client deliverables and say which entries
// are estimates rather than stopwatch time, and none of that belongs in
// a git repository. The arithmetic does not depend on them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// A throwaway key pair, generated per run. The client signs a real JWT
// assertion before it will call anything, so a placeholder string fails at
// the signing step and never exercises the paths under test. Nothing here
// is a credential: it exists for the length of this process.
const TEST_KEY = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
}).privateKey;

const hoursLog = require('../../lib/workspace/hours/hoursLog');
const invoiceCheck = require('../../lib/workspace/hours/invoiceCheck');
const sheetsClient = require('../../lib/workspace/drive/sheetsClient');
const register = require('../../lib/workspace/drive/register');
const service = require('../../lib/workspace/hours/service');
const { LANES, SOURCE_CLASSES } = require('../../lib/workspace/lanes');
const orchestrator = require('../../lib/workspace/orchestrator');

const SUMMARY = [
  ['WSA HOURS SUMMARY', 'WSA HOURS SUMMARY'],
  ['Total hours (decimal)', '27.57'],
  ['Total hours', '27h 34m'],
  ['Hourly rate', '£20.00'],
  ['Total value', '£551.33'],
  ['Updates automatically from the Hours Log tab.', '']
];

const HEADER = ['Date', 'Client / Project', 'Work completed', 'Start', 'Finish', 'Break (mins)', 'Hours', 'Billable?', 'Rate (£/hr)', 'Value (£)', 'Notes / evidence'];

// date, hours. Real values from the record.
const REAL_ROWS = [
  ['19/08/2026', 0.9], ['19/08/2026', 1.083333333], ['19/08/2026', 1], ['19/08/2026', 0.566666667],
  ['19/08/2026', 1.083333333], ['21/08/2026', 0.7833333333], ['21/08/2026', 0.3333333333],
  ['22/08/2026', 1.166666667], ['25/08/2026', 1.133333333], ['26/08/2026', 0.9166666667],
  ['27/08/2026', 0.5833333333], ['28/08/2026', 0.6666666667], ['30/08/2026', 4.75],
  ['31/08/2026', 3.75], ['01/09/2026', 1.833333333], ['03/09/2026', 0.5833333333],
  ['04/09/2026', 1.083333333], ['07/09/2026', 0.4666666667], ['09/09/2026', 0.8],
  ['11/09/2026', 2.5], ['11/09/2026', 0.95], ['09/09/2026', 0.6333333333]
];

function logRow([date, hours], { client = 'WSA', billable = 'Yes', work = 'WSA website and portal work' } = {}) {
  return [date, client, work, '', '', '0', String(hours), billable, '', '', ''];
}

function realGrid(extra = []) {
  return [...SUMMARY, [], HEADER, ...REAL_ROWS.map((r) => logRow(r)), ...extra];
}

const WSA = { customerName: 'Tim Hunt at World Student Advisors', customerEmail: 'tim.hunt@worldstudentadvisors.com' };

// --- 1. The total -------------------------------------------------------

test('the rows are totalled independently and come to the real figure', () => {
  const parsed = hoursLog.parseHoursLog(realGrid());
  assert.equal(parsed.ok, true, parsed.reason);
  assert.equal(parsed.entries.length, 22);
  assert.equal(parsed.unreadable.length, 0);
  assert.equal(parsed.rate, 20);

  const total = hoursLog.totalFor(parsed, 'WSA');
  assert.equal(total.count, 22);
  assert.equal(Math.round(total.hours * 100) / 100, 27.57);
  assert.equal(total.hoursText, '27h 34m');
  assert.equal(total.pence, 55133);
  assert.equal(total.valueText, '£551.33');
});

test("our arithmetic is cross-checked against the sheet's own stated total, and a disagreement is a finding", () => {
  const parsed = hoursLog.parseHoursLog(realGrid());
  const agree = hoursLog.crossCheck(parsed, hoursLog.totalFor(parsed, 'WSA'));
  assert.equal(agree.checked, true);
  assert.equal(agree.agrees, true, agree.note);

  // A sheet whose summary has gone stale against its own rows.
  const lying = realGrid().map((r) => (r[0] === 'Total value' ? ['Total value', '£533.00'] : r));
  const p2 = hoursLog.parseHoursLog(lying);
  const check = hoursLog.crossCheck(p2, hoursLog.totalFor(p2, 'WSA'));
  assert.equal(check.agrees, false);
  assert.match(check.note, /£533\.00/);
  assert.match(check.note, /£551\.33/);
});

// --- 2, 3, 4, 5. The comparison ----------------------------------------

test('an invoice that matches the hours exactly is reported as matching', () => {
  const parsed = hoursLog.parseHoursLog(realGrid());
  const r = invoiceCheck.checkInvoice({ parsed, customer: WSA, amount: 551.33 });
  assert.equal(r.applicable, true);
  assert.equal(r.status, 'match');
  assert.equal(r.differencePence, 0);
  assert.match(r.message, /which matches/);
});

test("an invoice BELOW the logged total names the row that accounts for it: Tom's actual £533", () => {
  const parsed = hoursLog.parseHoursLog(realGrid());
  const r = invoiceCheck.checkInvoice({ parsed, customer: WSA, amount: 533.00 });
  assert.equal(r.status, 'under');
  assert.equal(r.differencePence, 1833);
  // The sentence Tom specified, in substance: both figures, the
  // difference, and WHICH entry causes it.
  assert.match(r.message, /27h 34m/);
  assert.match(r.message, /£20\.00\/hour/);
  assert.match(r.message, /£551\.33/);
  assert.match(r.message, /£533\.00/);
  assert.match(r.message, /Difference: £18\.33/);
  assert.equal(r.attribution.kind, 'single');
  assert.equal(r.attribution.rows[0].date, '26/08/2026');
  assert.equal(r.attribution.rows[0].minutes, 55);
  assert.match(r.message, /the 26\/08\/2026 55 minute billable entry/);
  // And it refuses to pick a side.
  assert.match(r.message, /Nothing has been changed/);
  assert.match(r.message, /you can decide which is right/);
});

test('an invoice ABOVE the logged total is flagged just as clearly', () => {
  const parsed = hoursLog.parseHoursLog(realGrid());
  const r = invoiceCheck.checkInvoice({ parsed, customer: WSA, amount: 600 });
  assert.equal(r.status, 'over');
  assert.equal(r.differencePence, 55133 - 60000);
  assert.match(r.message, /£48\.67 above the logged total/);
  assert.match(r.message, /Difference: £48\.67/);
});

test('a difference matching no single entry is reported as unattributed rather than guessed at', () => {
  const parsed = hoursLog.parseHoursLog(realGrid());
  const r = invoiceCheck.checkInvoice({ parsed, customer: WSA, amount: 500.07 });
  assert.equal(r.status, 'under');
  assert.equal(r.attribution.kind, 'unattributed');
  assert.match(r.message, /No single entry or pair of entries accounts for the difference/);
});

test('a difference several combinations could explain is called ambiguous, not pinned on one', () => {
  const parsed = hoursLog.parseHoursLog(realGrid());
  // £30.00 is 26/08 + 27/08 (55 + 35 min) AND 21/08 + 22/08 (20 + 70 min).
  // Naming either would be a confident wrong answer.
  const r = invoiceCheck.checkInvoice({ parsed, customer: WSA, amount: 551.33 - 30 });
  assert.equal(r.attribution.kind, 'ambiguous');
  assert.match(r.message, /More than one combination/);
  assert.match(r.message, /cannot be pinned on one/);
});

test('a difference made of exactly one pair names both rows', () => {
  // A small log where only one pair adds up, so the pair branch is real
  // rather than unreachable behind the ambiguity guard.
  const grid = [...SUMMARY, [], HEADER,
    logRow(['01/09/2026', 1]), logRow(['02/09/2026', 2]), logRow(['03/09/2026', 4])];
  const parsed = hoursLog.parseHoursLog(grid);
  assert.equal(hoursLog.totalFor(parsed, 'WSA').pence, 14000);
  const r = invoiceCheck.checkInvoice({ parsed, customer: WSA, amount: 80 });
  assert.equal(r.attribution.kind, 'pair');
  assert.deepEqual(r.attribution.rows.map((x) => x.date).sort(), ['01/09/2026', '02/09/2026']);
  assert.match(r.message, /01\/09\/2026 60 minute billable entry and the 02\/09\/2026 120 minute billable entry together/);
});

// --- 6. Non-billable ----------------------------------------------------

test('non-billable rows are excluded from the total and from attribution', () => {
  const extra = [logRow(['12/09/2026', 3], { billable: 'No' })];
  const parsed = hoursLog.parseHoursLog(realGrid(extra));
  assert.equal(parsed.entries.length, 23, 'the row is read');
  assert.equal(parsed.entries.filter((e) => !e.billable).length, 1, 'and marked not billable');

  const total = hoursLog.totalFor(parsed, 'WSA');
  assert.equal(total.count, 22, 'but it is not billed');
  assert.equal(total.pence, 55133);
  assert.equal(hoursLog.parseBillable('No'), false);
  assert.equal(hoursLog.parseBillable('yes'), true);
  // Unrecognised is NOT billable, and is surfaced rather than assumed.
  assert.equal(hoursLog.parseBillable('maybe'), null);
  const odd = hoursLog.parseHoursLog(realGrid([logRow(['12/09/2026', 3], { billable: 'maybe' })]));
  assert.equal(odd.entries.length, 22);
  assert.equal(odd.unreadable.length, 1);
  assert.match(odd.unreadable[0].reason, /billable column/);
  assert.equal(hoursLog.totalFor(odd, 'WSA').pence, 55133, 'an unreadable row never inflates the total');
});

test('a row with no usable hours is reported, never estimated from its start and finish times', () => {
  const broken = ['12/09/2026', 'WSA', 'Something', '09:00', '17:00', '0', '', 'Yes', '', '', ''];
  const parsed = hoursLog.parseHoursLog(realGrid([broken]));
  assert.equal(parsed.unreadable.length, 1);
  assert.match(parsed.unreadable[0].reason, /no usable hours/);
  assert.equal(hoursLog.totalFor(parsed, 'WSA').pence, 55133, 'the eight-hour gap is not invented');

  const r = invoiceCheck.checkInvoice({ parsed, customer: WSA, amount: 551.33 });
  assert.match(r.message, /could not be read/);
  assert.match(r.message, /No hours have been estimated/);
});

// --- Client matching ----------------------------------------------------

test('the invoice customer is matched to the log client, and refuses to guess', () => {
  assert.equal(invoiceCheck.clientMatches('WSA', WSA), true, 'initials of the customer name');
  assert.equal(invoiceCheck.clientMatches('WSA', { customerName: 'Someone', customerEmail: 'a@wsa.com' }), true, 'the email domain label');
  // Deliberately NOT matched: the code is the initials of the words in
  // "worldstudentadvisors" but nothing can split that run of letters
  // without guessing, and guessing here attaches the wrong hours.
  assert.equal(invoiceCheck.clientMatches('WSA', { customerName: 'Someone', customerEmail: 'a@worldstudentadvisors.com' }), false, 'a domain we cannot split is not matched on a hunch');
  assert.equal(invoiceCheck.clientMatches('abc', { customerName: 'Someone', customerEmail: 'a@fabcorp.com' }), false, 'a coincidental substring is not a client');
  assert.equal(invoiceCheck.clientMatches('Pembroke', { customerName: 'Pembroke Ltd', customerEmail: 'x@pembroke.co.uk' }), true);
  assert.equal(invoiceCheck.clientMatches('WSA', { customerName: 'Orca Marine', customerEmail: 'a@orca.example' }), false);

  // An invoice for a client the log does not cover is silent, not a warning.
  const parsed = hoursLog.parseHoursLog(realGrid());
  const other = invoiceCheck.checkInvoice({ parsed, customer: { customerName: 'Orca Marine', customerEmail: 'a@orca.example' }, amount: 100 });
  assert.equal(other.applicable, false);
  assert.equal(other.status, 'no_client');
  assert.equal(other.message, '');

  // Two log clients that both match resolve to nothing rather than one.
  const ambiguous = hoursLog.parseHoursLog(realGrid([logRow(['12/09/2026', 1], { client: 'World Student Advisors' })]));
  assert.equal(invoiceCheck.resolveClient(ambiguous, WSA), null, 'ambiguity refuses');
});

// --- 7, 8, 10. The connector's gates and failures -----------------------

test('7. with the flag off the connector is inert and makes no network call', async () => {
  const prev = process.env.ENABLE_WORKSPACE_DRIVE_RECORDS;
  delete process.env.ENABLE_WORKSPACE_DRIVE_RECORDS;
  let called = 0;
  sheetsClient.__setFetchForTests(async () => { called += 1; throw new Error('must not be called'); });
  try {
    assert.equal(sheetsClient.isEnabled(), false);
    await assert.rejects(() => sheetsClient.readRecord('hours_log'), (e) => e.kind === 'disabled');
    assert.equal(called, 0, 'nothing reached the network');
    // And the invoice path says nothing at all rather than half-checking.
    assert.equal(await service.invoiceFinding({ draft: { customerName: 'WSA', amount: 533 } }), null);
    assert.match(sheetsClient.describeStatus(), /flag OFF/);
    assert.match(sheetsClient.describeStatus(), /no Drive record will be read/);
  } finally {
    if (prev === undefined) delete process.env.ENABLE_WORKSPACE_DRIVE_RECORDS; else process.env.ENABLE_WORKSPACE_DRIVE_RECORDS = prev;
    sheetsClient.__resetFetchForTests();
  }
});

test('7b. with the flag on but no credential it is still inert, and says which gate is open', async () => {
  const saved = { ...process.env };
  process.env.ENABLE_WORKSPACE_DRIVE_RECORDS = 'true';
  delete process.env.DRIVE_RECORDS_SERVICE_ACCOUNT_JSON;
  delete process.env.DRIVE_RECORDS_CLIENT_EMAIL;
  delete process.env.DRIVE_RECORDS_PRIVATE_KEY;
  let called = 0;
  sheetsClient.__setFetchForTests(async () => { called += 1; throw new Error('must not be called'); });
  try {
    assert.equal(sheetsClient.isConfigured(), false);
    await assert.rejects(() => sheetsClient.readRecord('hours_log'), (e) => e.kind === 'not_configured');
    assert.equal(called, 0);
    const line = sheetsClient.describeStatus();
    assert.match(line, /flag on/);
    assert.match(line, /no service account credential set/);
    assert.match(line, /no Drive record will be read/);
  } finally {
    process.env = saved;
    sheetsClient.__resetFetchForTests();
  }
});

test('8. when the sheet cannot be read the workspace says so and produces no figure', async () => {
  const saved = { ...process.env };
  process.env.ENABLE_WORKSPACE_DRIVE_RECORDS = 'true';
  process.env.DRIVE_RECORDS_CLIENT_EMAIL = 'probe@example.iam.gserviceaccount.com';
  process.env.DRIVE_RECORDS_PRIVATE_KEY = TEST_KEY;
  sheetsClient.__clearCacheForTests();
  sheetsClient.__clearTokenCacheForTests();
  sheetsClient.__setFetchForTests(async () => { throw new Error('ECONNREFUSED'); });
  try {
    const finding = await service.invoiceFinding({ draft: { customerName: 'WSA', customerEmail: 'x@worldstudentadvisors.com', amount: 533 } });
    assert.ok(finding, 'a read failure is reported, never silent');
    assert.equal(finding.status, 'unreadable');
    assert.match(finding.message, /could not be read/);
    assert.match(finding.message, /have not checked it/);
    assert.match(finding.message, /Nothing has been estimated/);
    assert.doesNotMatch(finding.message, /£\d/, 'no figure is stated when nothing was read');
  } finally {
    process.env = saved;
    sheetsClient.__resetFetchForTests();
    sheetsClient.__clearCacheForTests();
    sheetsClient.__clearTokenCacheForTests();
  }
});

test('8b. Google failures are classified, so waiting is only suggested where waiting helps', () => {
  assert.equal(sheetsClient.classify(401, '').kind, 'auth_failed');
  assert.equal(sheetsClient.classify(401, '').retryable, false);
  assert.equal(sheetsClient.classify(403, 'caller does not have permission').kind, 'permission_denied');
  assert.match(sheetsClient.classify(403, 'caller does not have permission').message, /shared with it/);
  assert.equal(sheetsClient.classify(403, 'rateLimitExceeded').kind, 'rate_limited');
  assert.equal(sheetsClient.classify(403, 'rateLimitExceeded').retryable, true);
  assert.equal(sheetsClient.classify(404, '').kind, 'not_found');
  assert.equal(sheetsClient.classify(429, '').retryable, true);
  assert.equal(sheetsClient.classify(503, '').kind, 'unreachable');
});

test('10. a figure from an earlier read is ALWAYS labelled as not current', async () => {
  const saved = { ...process.env };
  process.env.ENABLE_WORKSPACE_DRIVE_RECORDS = 'true';
  process.env.DRIVE_RECORDS_CLIENT_EMAIL = 'probe@example.iam.gserviceaccount.com';
  process.env.DRIVE_RECORDS_PRIVATE_KEY = TEST_KEY;
  sheetsClient.__clearCacheForTests();
  sheetsClient.__clearTokenCacheForTests();

  const grid = realGrid();
  let mode = 'ok';
  sheetsClient.__setFetchForTests(async (url) => {
    if (mode === 'fail') throw new Error('ECONNREFUSED');
    if (String(url).includes('oauth2')) return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 't', expires_in: 3600 }) };
    if (String(url).includes('values:batchGet')) return { ok: true, status: 200, text: async () => JSON.stringify({ valueRanges: [{ values: grid }] }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ properties: { title: 'Hours' }, sheets: [{ properties: { title: 'Hours Log' } }] }) };
  });
  try {
    const fresh = await service.loadHours();
    assert.equal(fresh.ok, true);
    assert.equal(fresh.stale, false);
    assert.equal(fresh.message, '', 'a fresh read carries no warning');

    mode = 'fail';
    const stale = await service.loadHours({ now: Date.parse(fresh.readAt) + 3600000 });
    assert.equal(stale.ok, true, 'the earlier read is still usable');
    assert.equal(stale.stale, true);
    assert.match(stale.message, /^NOT CURRENT/);
    assert.match(stale.message, /could not be read just now/);
    assert.match(stale.message, /1 hour ago/);
    assert.match(stale.message, /may be out of date/);

    const finding = await service.invoiceFinding({ draft: { customerName: 'World Student Advisors', customerEmail: 'tim.hunt@worldstudentadvisors.com', amount: 533 }, now: Date.parse(fresh.readAt) + 3600000 });
    assert.equal(finding.stale, true);
    assert.match(finding.message, /^NOT CURRENT/, 'the label leads the sentence, it is not a footnote');
    assert.match(finding.message, /£18\.33/, 'and the check still runs');
  } finally {
    process.env = saved;
    sheetsClient.__resetFetchForTests();
    sheetsClient.__clearCacheForTests();
    sheetsClient.__clearTokenCacheForTests();
  }
});

// --- 9. Lane access -----------------------------------------------------

test('9. no worker lane can read the hours source', () => {
  assert.ok(SOURCE_CLASSES.hours, 'the source class exists');
  const holders = LANES.filter((l) => l.sourceClasses.includes('hours')).map((l) => l.id);
  assert.deepEqual(holders, ['governance_assurance'], 'only the all-source assurance lane holds it');
  // And that one holds it only because it takes every class, not because
  // anybody named this one.
  const ga = LANES.find((l) => l.id === 'governance_assurance');
  assert.deepEqual([...ga.sourceClasses].sort(), Object.keys(SOURCE_CLASSES).sort());
  // Tom's own general questions reach it; that is the only other path.
  assert.ok(orchestrator.GENERAL_SOURCE_CLASSES.includes('hours'));
  // The register stays frozen, so nothing can push a class onto it at runtime.
  assert.ok(Object.isFrozen(orchestrator.GENERAL_SOURCE_CLASSES));
});

test('9b. the record is confidential, so the human clearance leg gates it too', () => {
  const parsed = hoursLog.parseHoursLog(realGrid());
  const record = service.buildHoursRecord(parsed, {
    readAt: '2026-09-15T18:24:00.000Z',
    title: 'CURRENT - Arrington Consultancy Log Hours Worker',
    fileId: '11YzoTkTlUaYf2XB8mAzp_LMSAs45bXxzBsVN25dEB1A'
  });
  assert.equal(record.record_key, service.HOURS_RECORD_KEY);
  assert.equal(record.source_class, 'hours');
  assert.equal(record.sensitivity, 'confidential');
  assert.match(record.body, /27h 34m/);
  assert.match(record.body, /£551\.33/);
  assert.match(record.source_ref, /11YzoTkTlUaYf2XB8mAzp_LMSAs45bXxzBsVN25dEB1A/);
  // It carries its own age, so a figure can never be quoted as current
  // without the freshness machinery having a say.
  assert.equal(record.stale_after_days, 1);
  assert.equal(new Date(record.synced_at).toISOString(), '2026-09-15T18:24:00.000Z');
});

// --- The authorised-record register -------------------------------------

test('the register is a code-declared allowlist, and today it holds exactly one record', () => {
  assert.equal(register.list().length, 1, 'deliberately narrow: Tom asked for this one record only');
  const rec = register.byId('hours_log');
  assert.equal(rec.fileId, '11YzoTkTlUaYf2XB8mAzp_LMSAs45bXxzBsVN25dEB1A');
  assert.equal(rec.title, 'CURRENT - Arrington Consultancy Log Hours Worker');
  assert.equal(rec.sourceClass, 'hours');
  assert.equal(rec.sensitivity, 'confidential');
  // The scope set is DERIVED from the kinds in use, so registering a
  // Google Doc later cannot ride in on a scope requested for sheets.
  assert.deepEqual(register.requiredScopes(), ['spreadsheets.readonly']);
});

test('a file that is not registered is refused before a request is built', async () => {
  assert.equal(register.isRegistered('some-other-file-id'), false);
  assert.throws(() => register.assertRegistered('some-other-file-id'), /not in the authorised Drive record register/);
  // And the refusal does not echo the id back: an error string travels,
  // and which file somebody tried to read is itself information.
  try { register.assertRegistered('secret-file-id'); } catch (e) {
    assert.doesNotMatch(e.message, /secret-file-id/);
  }
  // An unregistered record id never reaches the network either.
  let called = 0;
  sheetsClient.__setFetchForTests(async () => { called += 1; throw new Error('must not be called'); });
  try {
    await assert.rejects(() => sheetsClient.readRecord('brain_index'), (e) => e.kind === 'not_registered');
    assert.equal(called, 0);
  } finally {
    sheetsClient.__resetFetchForTests();
  }
});

test('the override can move a registered record but cannot widen what is readable', async () => {
  const saved = { ...process.env };
  process.env.ENABLE_WORKSPACE_DRIVE_RECORDS = 'true';
  process.env.DRIVE_RECORDS_CLIENT_EMAIL = 'probe@example.iam.gserviceaccount.com';
  process.env.DRIVE_RECORDS_PRIVATE_KEY = TEST_KEY;
  process.env.DRIVE_RECORD_HOURS_LOG_FILE_ID = 'a-file-nobody-registered';
  sheetsClient.__clearTokenCacheForTests();
  let called = 0;
  sheetsClient.__setFetchForTests(async () => { called += 1; throw new Error('must not be called'); });
  try {
    await assert.rejects(() => sheetsClient.readRecord('hours_log'), /not in the authorised Drive record register/);
    assert.equal(called, 0, 'a mis-set variable cannot widen what is readable by one character');
  } finally {
    process.env = saved;
    sheetsClient.__resetFetchForTests();
    sheetsClient.__clearTokenCacheForTests();
  }
});

test('the connector has no discovery: it cannot find a file it was not told about', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'drive', 'sheetsClient.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  // No listing, no search, no folder traversal anywhere in the module.
  assert.doesNotMatch(client, /drive\/v3\/files|files\.list|files\?q=|\/drive\/v2\//);
  assert.doesNotMatch(client, /\bsearch\b/i);
  // And the only API host it names is the Sheets one.
  assert.doesNotMatch(client, /www\.googleapis\.com\/drive/);
});

// --- 11. The check advises and never acts -------------------------------

test('11. the checking flow cannot alter or send an invoice', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'hours', 'invoiceCheck.js'), 'utf8');
  const code = src.replace(/^\s*\/\/.*$/gm, '');
  // No write path of any kind exists in the module.
  assert.doesNotMatch(code, /repo\.|updateOpenApproval|createApproval|decideApproval|reviseInvoice/);
  assert.doesNotMatch(code, /fetch\(|sendMessage|sendInvoice|require\(['"].*zoho/i);
  const svc = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'hours', 'service.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  // The service DOES write now, and that was the whole correction: the
  // first build had a record builder nothing called. So the property is
  // no longer "it writes nothing", which would be satisfied by a
  // capability that does not work. It is narrower and stronger:
  //   - the ONLY thing it writes is a Company Brain record;
  //   - it touches no approval row, so it cannot alter an invoice draft;
  //   - it reaches no Zoho WRITE function, so it cannot create, email or
  //     amend an invoice, whatever ENABLE_ZOHO_INVOICE_WRITES says.
  const repoCalls = [...svc.matchAll(/repo\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(repoCalls)].sort(), ['upsertRecord'], 'the only repo call is the controlled record write');
  assert.doesNotMatch(svc, /updateOpenApproval|createApproval|decideApproval|reviseInvoice/);
  const zohoCalls = [...svc.matchAll(/zohoClient\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(zohoCalls)].sort(), ['getAccessToken', 'getInvoices'], 'read functions only');
  for (const write of ['createInvoice', 'createContact', 'emailInvoice']) {
    assert.doesNotMatch(svc, new RegExp(write), `${write} must be unreachable from here`);
  }
  // It may reach finance (Zoho is the system of record for money owed),
  // but nothing else: no email, no social, no CRM, and never Scott.
  assert.doesNotMatch(svc, /require\(['"][^'"]*(email|social|crm|scott)/i);
  // And the Sheets side stays read-only: no write method exists at all.
  const clientSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'drive', 'sheetsClient.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(clientSrc, /values:append|values:update|batchUpdate|method:\s*['"](POST|PUT|PATCH|DELETE)['"]\s*\}[^}]*sheets\.googleapis/);

  // The inputs it is handed come back untouched.
  const parsed = hoursLog.parseHoursLog(realGrid());
  const draft = Object.freeze({ customerName: 'Tim Hunt at World Student Advisors', customerEmail: 'tim.hunt@worldstudentadvisors.com', amount: 533, description: 'Retainer' });
  Object.freeze(parsed.entries);
  parsed.entries.forEach(Object.freeze);
  const before = JSON.stringify(draft);
  const r = invoiceCheck.checkInvoice({ parsed, customer: draft, amount: draft.amount });
  assert.equal(r.status, 'under');
  assert.equal(JSON.stringify(draft), before, 'the draft is not mutated');
});

test('11b. the route appends the finding to the reply and writes nothing', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'workspace.js'), 'utf8');
  const start = routes.indexOf('async function replyDeterministic');
  const body = routes.slice(start, routes.indexOf('async function reviseInvoiceApproval'));
  assert.match(body, /hoursService\.invoiceFinding/);
  // The only thing done with the finding is string concatenation.
  assert.doesNotMatch(body, /createApproval|updateOpenApproval|decideApproval|zohoInvoiceClient/);
  // A connector fault must never break the invoice flow.
  assert.match(body, /catch \(err\)/);
  assert.match(body, /has NOT been checked/);
});

test('the modules stay pure and reach nothing they should not', () => {
  for (const f of ['hoursLog.js', 'invoiceCheck.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'hours', f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /process\.env|fetch\(/, f);
    assert.doesNotMatch(src, /scott/i, f);
  }
  // The client never puts a credential into a URL or an error message.
  const client = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'workspace', 'drive', 'sheetsClient.js'), 'utf8');
  assert.doesNotMatch(client, /\$\{[^}]*private_key[^}]*\}/);
  // The key may be interpolated ONLY as its length.
  assert.doesNotMatch(client, /\$\{\s*cred\.key\s*\}/);
  assert.doesNotMatch(client, /\$\{[^}]*cred\.key(?!\.length)[^}]*\}/);
  assert.match(client, /cred\.key\.length/, 'the key is reported by length only');
  // Read-only scope, and exactly one.
  assert.equal(sheetsClient.SCOPE, 'https://www.googleapis.com/auth/spreadsheets.readonly');
  assert.doesNotMatch(client, /auth\/drive(?!\.)|auth\/drive\.readonly|auth\/spreadsheets(?!\.readonly)/);
});

test('every credential read is trimmed, the Railway trailing-newline trap', () => {
  const saved = { ...process.env };
  try {
    process.env.ENABLE_WORKSPACE_DRIVE_RECORDS = 'true\n';
    assert.equal(sheetsClient.isEnabled(), true, 'a newline on the flag must not silently disable the connector');
    process.env.DRIVE_RECORDS_CLIENT_EMAIL = ' probe@example.iam.gserviceaccount.com \n';
    process.env.DRIVE_RECORDS_PRIVATE_KEY = TEST_KEY;
    assert.equal(sheetsClient.credential().email, 'probe@example.iam.gserviceaccount.com');
  } finally {
    process.env = saved;
  }
});
