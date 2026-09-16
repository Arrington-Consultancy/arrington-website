// Do the two receivables records actually REACH Ruth? (16/09/2026)
//
// This suite exists because writing a record and Ruth being able to read
// it are two different facts, and the first build of this capability
// proved that the hard way: it had a record builder nothing called, so
// every unit test passed while Ruth could not answer one of Tom's six
// questions.
//
// `test/workspace/receivables.test.js` closed half of that by asserting
// the records exist in the database. THIS suite closes the other half:
// that the real retrieval path, the same `buildLaneContext` the live
// `/api/workspace/ask` route calls, puts them in front of the model, and
// that the ordinary clearance rule still keeps them from anyone else.
//
// Nothing here calls a model or spends anything. It exercises the code
// between the database and the prompt, which is the part that was never
// exercised before.

const test = require('node:test');
const assert = require('node:assert/strict');

const orchestrator = require('../../lib/workspace/orchestrator');
const repo = require('../../lib/workspace/repo');
const { GENERAL_SOURCE_CLASSES, MAX_CONTEXT_RECORDS } = orchestrator;

const HAS_DB = !!process.env.DATABASE_URL;
const NEEDS_DB = { skip: HAS_DB ? false : 'set DATABASE_URL to a throwaway database to run this' };

const HOURS_KEY = 'hours.log';
const RECEIVABLES_KEY = 'receivables.summary';

// --- Free: the routing configuration these records depend on -----------

test('both record classes are in the general lane, and hours is in no worker lane', () => {
  // `receivables.summary` is `finance` and `hours.log` is `hours`. If
  // either class left this list, both records would be written on every
  // refresh and reach nobody, which is the silent version of the
  // original defect.
  assert.ok(GENERAL_SOURCE_CLASSES.includes('finance'), 'receivables.summary would be unreachable');
  assert.ok(GENERAL_SOURCE_CLASSES.includes('hours'), 'hours.log would be unreachable');

  const { LANES } = require('../../lib/workspace/lanes');
  const holders = LANES.filter((l) => l.sourceClasses.includes('hours')).map((l) => l.id);
  assert.deepEqual(holders, ['governance_assurance'], 'no worker lane may hold hours');
});

test('a thin source class cannot be starved out of the prompt by a fat one', () => {
  // The cap is real, and `hours` will always be the thinnest class in the
  // brain: one record against dozens of worker_register rows. Before the
  // round-robin selection this was a `slice()` over an alphabetically
  // ordered list, where "hours" sorting early was the only thing saving
  // it. Assert the property rather than trusting the alphabet.
  const fat = Array.from({ length: MAX_CONTEXT_RECORDS * 2 }, (_, i) => ({
    record_key: `worker.${i}`, source_class: 'worker_register', doc_status: 'current', title: 'w', body: 'b'
  }));
  const thin = [
    { record_key: HOURS_KEY, source_class: 'hours', doc_status: 'current', title: 'h', body: 'b' },
    { record_key: RECEIVABLES_KEY, source_class: 'finance', doc_status: 'current', title: 'r', body: 'b' }
  ];
  // Deliberately last in the list, which is the worst case for a slice.
  const picked = orchestrator.selectContextRecords([...fat, ...thin], MAX_CONTEXT_RECORDS);
  assert.equal(picked.length, MAX_CONTEXT_RECORDS);
  const keys = picked.map((r) => r.record_key);
  assert.ok(keys.includes(HOURS_KEY), 'the hours record survived the cap');
  assert.ok(keys.includes(RECEIVABLES_KEY), 'the receivables record survived the cap');
});

test('freshness reaches the prompt as a word, so a stale figure cannot read as current', () => {
  const day = 86400000;
  const fresh = { record_key: RECEIVABLES_KEY, source_class: 'finance', doc_status: 'current', title: 'R', body: 'OUTSTANDING: £350.00', source_ref: 'Zoho', synced_at: new Date(), stale_after_days: 1, sync_outcome: 'ok' };
  const stale = { ...fresh, synced_at: new Date(Date.now() - 5 * day) };
  const partial = { ...fresh, sync_outcome: 'partial' };

  assert.match(orchestrator.renderRecordForPrompt(fresh), /\/ fresh\]/);
  assert.match(orchestrator.renderRecordForPrompt(stale), /\/ stale\]/);
  // A partial record is one written with a source missing. It is not
  // "failed", so it renders by its age, and the BODY is what says which
  // half is missing. Both halves have to be true for the answer to be
  // honest, so both are asserted.
  assert.match(orchestrator.renderRecordForPrompt(partial), /\[finance \/ current \//);
  assert.equal(repo.recordFreshness(stale).state, 'stale');

  // A rendered word is only useful if a rule acts on it. This is the
  // standing instruction that turns the badge into an honest sentence,
  // asserted here so the two cannot be separated by accident.
  assert.match(orchestrator.GOVERNANCE_RULES, /Records marked stale[^\n]*never presented as current fact/);
});

// --- The real path, against a real database ----------------------------

test('after a refresh, both records are in the context the general lane hands the model', NEEDS_DB, async () => {
  const service = require('../../lib/workspace/hours/service');
  const financeRegistry = require('../../lib/workspace/finance/registry');
  const zohoClient = require('../../lib/workspace/finance/zohoInvoiceClient');
  const sheetsClient = require('../../lib/workspace/drive/sheetsClient');
  const db = require('../../db/pool');

  const realConfigured = financeRegistry.isConfigured;
  const realToken = zohoClient.getAccessToken;
  const realInvoices = zohoClient.getInvoices;
  const saved = { ...process.env };
  const NOW = Date.parse('2026-09-16T09:00:00Z');

  try {
    await db.query("DELETE FROM workspace_records WHERE record_key IN ($1,$2)", [HOURS_KEY, RECEIVABLES_KEY]);

    // The hours log is read through the real client with a stubbed
    // transport, carrying the Invoice ref column so the row-level mode is
    // the one under test.
    process.env.ENABLE_WORKSPACE_DRIVE_RECORDS = 'true';
    process.env.DRIVE_RECORDS_SERVICE_ACCOUNT_JSON = '';
    process.env.DRIVE_RECORDS_CLIENT_EMAIL = 'probe@example.iam.gserviceaccount.com';
    process.env.DRIVE_RECORDS_PRIVATE_KEY = require('crypto').generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    }).privateKey;
    const grid = [
      ['Hourly rate', '£20.00'], [],
      ['Date', 'Client / Project', 'Work completed', 'Start', 'Finish', 'Break (mins)', 'Hours', 'Billable?', 'Rate (£/hr)', 'Value (£)', 'Notes / evidence', 'Invoice ref'],
      ['01/09/2026', 'WSA', 'Portal work', '', '', '0', '10', 'Yes', '', '', '', 'INV-000004'],
      ['11/09/2026', 'WSA', 'Portal redevelopment', '', '', '0', '2.5', 'Yes', '', '', '', '']
    ];
    sheetsClient.__clearCacheForTests();
    sheetsClient.__clearTokenCacheForTests();
    sheetsClient.__setFetchForTests(async (url) => {
      const u = String(url);
      if (u.includes('oauth2')) return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 't', expires_in: 3600 }) };
      if (u.includes('values:batchGet')) return { ok: true, status: 200, text: async () => JSON.stringify({ valueRanges: [{ values: grid }] }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ properties: { title: 'CURRENT - Arrington Consultancy Log Hours Worker' }, sheets: [{ properties: { title: 'Hours Log' } }] }) };
    });
    financeRegistry.isConfigured = (id) => (id === 'zoho_invoice' ? true : realConfigured(id));
    zohoClient.getAccessToken = async () => 'token';
    zohoClient.getInvoices = async () => [{
      invoice_number: 'INV-000004', customer_name: 'World Student Advisors',
      date: '2026-09-01', due_date: '2026-09-08', status: 'sent', total: 200, balance: 200
    }];

    const result = await service.refreshRecords({ now: NOW });
    assert.deepEqual(result.written.sort(), [HOURS_KEY, RECEIVABLES_KEY]);
    assert.equal(result.rowLevel, true, 'the Invoice ref column put it in row-level mode');

    // THE ASSERTION THIS SUITE EXISTS FOR. The same call the live ask
    // route makes, for Tom's own clearance with no lane, which is the
    // path a question like "what am I owed?" actually takes.
    const context = await orchestrator.buildLaneContext({ clearanceId: 'owner_admin', laneId: null });
    const keys = context.map((r) => r.record_key);
    assert.ok(keys.includes(RECEIVABLES_KEY), 'receivables.summary reaches the model');
    assert.ok(keys.includes(HOURS_KEY), 'hours.log reaches the model');

    // And what it carries is the answer, not just the key.
    const prompt = context.map(orchestrator.renderRecordForPrompt).join('\n\n');
    assert.match(prompt, /OUTSTANDING.*£200\.00/s, '1. what am I currently owed');
    assert.match(prompt, /World Student Advisors: £200\.00 outstanding/, '2. what does WSA owe me for');
    assert.match(prompt, /£50\.00 logged and not invoiced/, '3. have I invoiced everything I logged');
    assert.match(prompt, /not invoiced: 11\/09\/2026, 150 minutes, Portal redevelopment/, '4. what work is not invoiced');
    assert.match(prompt, /CURRENT - Arrington Consultancy Log Hours Worker/, '6. what evidence in Drive supports it');
    assert.match(prompt, /Google Sheet 11Yzo/, '6. named down to the file');
    // Each record announces its own freshness, so the model cannot quote
    // a figure as current without being told whether it is.
    assert.match(prompt, new RegExp(`RECORD ${RECEIVABLES_KEY} \\[finance / current / fresh\\]`));
    assert.match(prompt, new RegExp(`RECORD ${HOURS_KEY} \\[hours / current / fresh\\]`));

    // THE NEGATIVE CONTROL, and it is the point of the whole permission
    // argument: a narrower clearance gets neither record and neither
    // figure. Without this the test above would pass just as well on a
    // system that shows everything to everyone.
    const narrow = await orchestrator.buildLaneContext({ clearanceId: 'ws_restricted', laneId: null });
    const narrowKeys = narrow.map((r) => r.record_key);
    assert.ok(!narrowKeys.includes(RECEIVABLES_KEY), 'a narrow clearance gets no receivables record');
    assert.ok(!narrowKeys.includes(HOURS_KEY), 'a narrow clearance gets no hours record');
    const narrowPrompt = narrow.map(orchestrator.renderRecordForPrompt).join('\n\n');
    assert.doesNotMatch(narrowPrompt, /£200\.00/, 'and not the figure by another route');
    assert.doesNotMatch(narrowPrompt, /£20\.00\/hour|Hourly rate on the record/, 'nor the charging rate');

    // A WORKER LANE gets neither either, which is the separate leg: the
    // clearance could be right and the lane wrong.
    const lane = await orchestrator.buildLaneContext({ clearanceId: 'owner_admin', laneId: 'opportunity_builder' });
    const laneKeys = lane.map((r) => r.record_key);
    assert.ok(!laneKeys.includes(HOURS_KEY), 'no worker lane reaches the hours log');
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
