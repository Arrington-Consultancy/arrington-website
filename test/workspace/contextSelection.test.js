// Which permitted records reach the prompt when there are more of them
// than MAX_CONTEXT_RECORDS.
//
// Nothing here is about permission. Every record reaching this function
// has already passed human clearance, the lane's source classes and the
// lane's sensitivity ceiling. The only question is which of them fit,
// and the answer used to be "whichever ones sort first", because the
// selection was a blind slice over a list ordered by source_class
// ascending. That made the alphabet decide what the workspace answers
// from, which is not a decision anybody took.

const { test } = require('node:test');
const assert = require('node:assert');

const { selectContextRecords, MAX_CONTEXT_RECORDS } = require('../../lib/workspace/orchestrator');

// The shape of the real 29-record Arrington snapshot as at 03/09/2026,
// ordered the way repo.listRecords returns it: source_class ascending,
// then title. The counts are what make this a real measurement rather
// than a fixture chosen to pass.
const SNAPSHOT_COUNTS = {
  authority: 5, control_pack: 9, opportunity: 3, project: 2,
  strategy: 1, technical_state: 1, worker_register: 8
};

function buildSnapshot(counts = SNAPSHOT_COUNTS) {
  const records = [];
  for (const cls of Object.keys(counts).sort()) {
    for (let i = 1; i <= counts[cls]; i += 1) records.push({ source_class: cls, title: `${cls} ${i}` });
  }
  return records;
}

function tally(records) {
  const out = {};
  for (const r of records) out[r.source_class] = (out[r.source_class] || 0) + 1;
  return out;
}

test('a set that fits under the cap is returned untouched', () => {
  const records = buildSnapshot().slice(0, 10);
  assert.deepEqual(selectContextRecords(records, MAX_CONTEXT_RECORDS), records);
});

test('the cap is respected exactly', () => {
  const picked = selectContextRecords(buildSnapshot(), MAX_CONTEXT_RECORDS);
  assert.equal(picked.length, MAX_CONTEXT_RECORDS);
});

test('every class present is represented, so none is shut out by its initial letter', () => {
  const picked = selectContextRecords(buildSnapshot(), MAX_CONTEXT_RECORDS);
  const got = tally(picked);
  for (const cls of Object.keys(SNAPSHOT_COUNTS)) {
    assert.ok(got[cls] > 0, `${cls} reached the prompt not at all`);
  }
});

test('the alphabetically last class is no longer the only one paying', () => {
  // The measured defect: on this exact snapshot the blind slice took all
  // four missing records off the end of worker_register, purely because
  // "w" sorts last. The fair spread must leave it materially better off.
  const records = buildSnapshot();
  const blind = tally(records.slice(0, MAX_CONTEXT_RECORDS));
  const fair = tally(selectContextRecords(records, MAX_CONTEXT_RECORDS));
  assert.ok(fair.worker_register > blind.worker_register,
    `worker_register got ${fair.worker_register}, the blind slice gave it ${blind.worker_register}`);
});

test('a class that sorts last and is thin is not starved by a fat one', () => {
  // The sharper version of the same hazard: one class with far more
  // records than the cap, and one lone record sorting after it.
  const records = [];
  for (let i = 1; i <= 40; i += 1) records.push({ source_class: 'aaa_big', title: `big ${i}` });
  records.push({ source_class: 'zzz_small', title: 'the only one' });
  const picked = selectContextRecords(records, 10);
  assert.equal(picked.length, 10);
  assert.ok(picked.some((r) => r.source_class === 'zzz_small'),
    'the single record of the last-sorting class was dropped for the fortieth record of the first');
});

test('selection adds nothing: every record returned was passed in', () => {
  // The property that matters for permission. This function may narrow
  // what reaches the prompt and must never widen it.
  const records = buildSnapshot();
  const picked = selectContextRecords(records, MAX_CONTEXT_RECORDS);
  for (const r of picked) {
    assert.ok(records.includes(r), 'a record reached the prompt that was not permitted into this function');
  }
  assert.equal(new Set(picked).size, picked.length, 'a record was duplicated into the prompt');
});

test('the input is not mutated, so a caller can select twice and get the same answer', () => {
  const records = buildSnapshot();
  const before = records.slice();
  const first = selectContextRecords(records, MAX_CONTEXT_RECORDS);
  const second = selectContextRecords(records, MAX_CONTEXT_RECORDS);
  assert.deepEqual(records, before, 'selectContextRecords mutated the list it was given');
  assert.deepEqual(first, second, 'the same input produced two different prompts');
});

test('the returned records keep their original relative order', () => {
  // The prompt stays grouped by class and deterministic. Round-robin
  // picking would otherwise interleave the classes.
  const records = buildSnapshot();
  const picked = selectContextRecords(records, MAX_CONTEXT_RECORDS);
  const positions = picked.map((r) => records.indexOf(r));
  const sorted = positions.slice().sort((a, b) => a - b);
  assert.deepEqual(positions, sorted, 'the prompt order no longer follows the record order');
});
