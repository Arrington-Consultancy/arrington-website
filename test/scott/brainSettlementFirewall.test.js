// The boundary on Scott's autonomous evolution (13/09/2026).
//
// Tom's instruction: "this autonomy applies only inside the fictional
// Scott demo. It must never alter real Arrington records, permissions or
// actions." A comment saying so is not a control. These tests are the
// control: they read the settlement code's own source and assert that it
// has no path to anything outside the Scott tables, so a later edit that
// adds one fails here rather than in production.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const SETTLEMENT_FILES = [
  'lib/scott/brainCandidates.js',
  'lib/scott/companyState.js',
  'lib/scott/gapClosure.js',
  'lib/scott/evolutionDigest.js',
  'lib/scott/evolutionBriefing.js'
];

test('the settlement and briefing code never reaches the real Arrington side', () => {
  const forbidden = [
    /lib\/workspace/, /lib\/crm/, /\.\.\/workspace/, /\.\.\/crm/, /routes\//,
    /whereToStart/, /stripe/i, /zoho/i, /gmailClient/, /leads\b/, /purchases/,
    /page_access/, /role_permissions/, /\busers\b/
  ];
  SETTLEMENT_FILES.forEach((file) => {
    const text = read(file);
    forbidden.forEach((re) => {
      assert.ok(!re.test(text), `${file} matches ${re}: Scott's evolution must not touch the real business`);
    });
  });
});

test('the pure settlement rule reads no database and only one environment switch', () => {
  const text = read('lib/scott/brainCandidates.js');
  assert.ok(!/require\(['"]\.\.\/\.\.\/db/.test(text) && !/require\(['"]\.\/data\/repository/.test(text), 'brainCandidates.js must stay pure: no database handle');
  const envReads = [...text.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(envReads)], ['SCOTT_BRAIN_AUTOFILL'], 'the kill switch is the only configuration the rule reads');
});

test('every settlement write in the repository targets a scott_ table and nothing else', () => {
  const text = read('lib/scott/data/repository.js');
  const names = ['settleBrainCandidate', 'retractBrainCandidate', 'autofillBrainCandidate', 'createBrainCandidate', 'decideBrainCandidate',
    'supersedeBrainFact', 'closeBrainGapAutomatically'];
  names.forEach((name) => {
    const start = text.indexOf(`async function ${name}(`);
    assert.ok(start > 0, `${name} must exist`);
    const end = text.indexOf('\nasync function ', start + 10);
    const body = text.slice(start, end > 0 ? end : undefined);
    const tables = [...body.matchAll(/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+([a-z_]+)/gi)].map((m) => m[1]);
    // A thin delegate (autofillBrainCandidate hands off to settleBrainCandidate)
    // writes nothing itself; what it delegates to is checked in this loop.
    if (!tables.length) {
      assert.match(body, /return settleBrainCandidate\(/, `${name} neither writes a table nor delegates to the settlement write`);
      return;
    }
    tables.forEach((t) => assert.ok(t.startsWith('scott_'), `${name} writes ${t}, which is not a Scott table`));
  });
});

test('settlement has exactly three outcomes and none of them is pending', () => {
  const bc = require('../../lib/scott/brainCandidates');
  assert.deepEqual(bc.SETTLEMENT_OUTCOMES, ['admit', 'reject', 'redundant']);
  assert.ok(!bc.SETTLEMENT_OUTCOMES.includes('pending'));
  // And the repository maps each to a terminal status, never back to pending.
  const text = read('lib/scott/data/repository.js');
  assert.match(text, /admit: 'approved', reject: 'rejected', redundant: 'superseded'/);
});

test('the briefing escalates only named system faults, and every one is a real event the routes can emit', () => {
  const { ESCALATION_EVENTS } = require('../../lib/scott/evolutionBriefing');
  assert.deepEqual(ESCALATION_EVENTS, ['brain_settlement_error', 'brain_cache_reload_failed']);
  const routes = read('routes/scott.js');
  ESCALATION_EVENTS.forEach((e) => assert.ok(routes.includes(`'${e}'`), `${e} is never emitted by the routes, so it could never be escalated`));
  // A refusal is not a fault: the rejection event must not be in the list.
  assert.ok(!ESCALATION_EVENTS.includes('brain_fact_rejected_auto'));
});

test('the persistent-state modules are pure: no database, no clock they were not handed, no configuration', () => {
  // companyState and gapClosure decide what the company's remembered state
  // allows and what closes itself. Both are reachable only through code
  // that already holds its own gates, so the guarantee worth pinning is
  // that neither can reach round them to read or write anything.
  ['lib/scott/companyState.js', 'lib/scott/gapClosure.js'].forEach((file) => {
    const text = read(file);
    assert.ok(!/require\(/.test(text), `${file} must require nothing at all`);
    assert.ok(!/process\.env/.test(text), `${file} must read no configuration`);
    assert.ok(!/\bdb\.query\b/.test(text), `${file} must reach no database`);
  });
});

test('a fact the company holds is only ever replaced by a person, never by code', () => {
  const repo = read('lib/scott/data/repository.js');
  const start = repo.indexOf('async function supersedeBrainFact(');
  assert.ok(start > 0, 'the supersession write must exist');
  const body = repo.slice(start, repo.indexOf('\nasync function ', start + 10));
  // It takes a decider and names them on both rows. An automatic caller
  // would have nobody to name, which is the point: settlement's first-wins
  // rule has no path here.
  assert.match(body, /decider/, 'supersession must be attributed to a person');
  assert.ok(!/settleCandidate|isAutofillEnabled|SCOTT_BRAIN_AUTOFILL/.test(body),
    'the automatic settlement rule must have no way into the supersession write');

  // And nothing in the automatic path calls it.
  const autoCallers = ['lib/scott/brainCandidates.js', 'lib/scott/gapClosure.js', 'lib/scott/evolutionBriefing.js', 'db/seed.js'];
  autoCallers.forEach((file) => {
    assert.ok(!read(file).includes('supersedeBrainFact'),
      `${file} runs without a person, so it must not be able to replace a held fact`);
  });
});

test('an automatic gap closure can never claim a person corrected the source', () => {
  const repo = read('lib/scott/data/repository.js');
  const start = repo.indexOf('async function closeBrainGapAutomatically(');
  assert.ok(start > 0);
  const body = repo.slice(start, repo.indexOf('\nasync function ', start + 10));
  assert.match(body, /source_corrected = false/,
    'the automatic closure must write the source-corrected column as false, literally');
  assert.ok(!/source_corrected = \$/.test(body),
    'source_corrected must not be a parameter here: no caller may set it');
  assert.match(body, /resolved_by_name = 'automatic'/,
    "an automatic closure must be distinguishable from a person's");

  // The pure rule that decides it cannot express the claim either.
  const gc = require('../../lib/scott/gapClosure');
  const every = gc.CLOSURE_REASONS.length;
  assert.equal(every, 4, 'four reasons, and each is stated on the row');
  // The module's header explains why it never sets the column, which is
  // worth keeping, so what is forbidden is producing a VALUE for it: no
  // assignment and no object key, in any closure it returns.
  assert.ok(!/source_corrected\s*[:=]/.test(read('lib/scott/gapClosure.js')),
    'the decision must never produce a value for source_corrected');
  gc.CLOSURE_REASONS.forEach((reason) => {
    assert.ok(!JSON.stringify(gc.decideGapClosure(
      { id: 1, status: 'open', material: false, created_at: new Date(0).toISOString() },
      { candidates: [] }
    ) || {}).includes('sourceCorrected'), `a ${reason} closure must carry no such claim`);
  });
});
