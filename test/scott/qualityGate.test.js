// The doc 31 quality release gate (doc 24 review, finding F2).
//
// Pure tests: the gate module does no I/O. The route-level enforcement is
// covered by test/scott/adversarialApi.test.js against a running server.
const test = require('node:test');
const assert = require('node:assert');

const { RELEASE_STATUSES, QUALITY_STAGES, checkReleaseGate, qualityRecordsForJob } = require('../../lib/scott/qualityGate');
const { JOB_STATUSES } = require('../../lib/scott/data/repository');
const { QUALITY_QUEUE } = require('../../lib/scott/deepBusinessFacts');

test('release and quality-stage vocabularies are real job statuses', () => {
  for (const s of RELEASE_STATUSES.concat(QUALITY_STAGES)) {
    assert.ok(JOB_STATUSES.includes(s), `${s} is missing from JOB_STATUSES`);
  }
});

test('a job with an open BLOCKING quality record cannot be released, and the refusal names the evidence', () => {
  for (const next of RELEASE_STATUSES) {
    const gate = checkReleaseGate('SAKS-1045', 'quality_check', next);
    assert.equal(gate.allowed, false, `SAKS-1045 -> ${next} must be refused`);
    assert.match(gate.reason, /QC-260828-02/);
    assert.match(gate.reason, /PASS/);
  }
});

test('a CRITICAL customer-return hold blocks release whatever the board status says', () => {
  const gate = checkReleaseGate('SAKS-1038', 'in_progress', 'delivered');
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /QC-260828-01/);
});

test('a job in quality check with no quality record at all cannot be released: a missing inspection is not a PASS', () => {
  const gate = checkReleaseGate('SAKS-9999', 'quality_check', 'ready_for_return');
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /missing inspection is not a PASS/);
  const rework = checkReleaseGate('SAKS-9999', 'rework', 'completed');
  assert.equal(rework.allowed, false);
});

test('non-release transitions are never the gate\'s business', () => {
  assert.equal(checkReleaseGate('SAKS-1045', 'quality_check', 'rework').allowed, true);
  assert.equal(checkReleaseGate('SAKS-1038', 'in_progress', 'on_hold').allowed, true);
});

test('an ordinary job with no quality record and no quality stage releases normally', () => {
  assert.equal(checkReleaseGate('SAKS-1041', 'in_progress', 'completed').allowed, true);
  assert.equal(qualityRecordsForJob('SAKS-1041').length, 0);
});

test('the gate has no bypass: no quality record in the dataset is currently PASS, so every linked job is blocked', () => {
  // If this ever fails because a PASS record was added, that is fine; the
  // assertion documents today's dataset so the blocked test cases above
  // stay honest about why they block.
  for (const q of QUALITY_QUEUE.filter((r) => r.jobRef)) {
    assert.notEqual(q.status, 'PASS');
    const gate = checkReleaseGate(q.jobRef, 'quality_check', 'delivered');
    assert.equal(gate.allowed, false, `${q.jobRef} should be release-blocked by ${q.ref}`);
  }
});
