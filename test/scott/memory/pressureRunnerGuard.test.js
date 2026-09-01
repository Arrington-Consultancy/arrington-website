// The two-step arming guard on the evolving-memory paid pressure runner
// (scripts/scottMemoryLiveTestRunner.js / scripts/armScottMemoryLiveTest.js),
// same shape as test/scott/pressureRunnerGuard.test.js and
// test/workspace/livePressureRunner.test.js.
//
// Free, always runs, and pins the guarantee without a database and
// without spending anything: a variable change alone, by any session or
// deploy, must never be able to start a spend.
const test = require('node:test');
const assert = require('node:assert/strict');

const runner = require('../../../scripts/scottMemoryLiveTestRunner');
const arm = require('../../../scripts/armScottMemoryLiveTest');

const now = Date.now();
const authRow = (ageMs = 0) => ({ id: 1, created_at: new Date(now - ageMs), summary: 'authorised by Tom Arrington' });
const base = { spentRows: [], authRows: [authRow()], aiEnabled: true, now };

test('an unset or false flag launches nothing, and says nothing', () => {
  assert.deepEqual(runner.decideLaunch({ ...base, armed: undefined }), { launch: false, quiet: true });
  assert.deepEqual(runner.decideLaunch({ ...base, armed: '' }), { launch: false, quiet: true });
  assert.deepEqual(runner.decideLaunch({ ...base, armed: 'false' }), { launch: false, quiet: true });
});

test("'true' is not a run label, so the flag alone can never spend", () => {
  const d = runner.decideLaunch({ ...base, armed: 'true' });
  assert.equal(d.launch, false);
  assert.match(d.reason, /not a run label/);
});

test('a label with no authorisation row does not launch', () => {
  const d = runner.decideLaunch({ ...base, armed: 'mem-20260901-a', authRows: [] });
  assert.equal(d.launch, false);
  assert.match(d.reason, /no authorisation row/);
});

test('an authorisation older than a day does not launch', () => {
  const d = runner.decideLaunch({ ...base, armed: 'mem-20260901-a', authRows: [authRow(25 * 60 * 60 * 1000)] });
  assert.equal(d.launch, false);
  assert.match(d.reason, /older than 24 hours/);
});

test('a label that has already been spent can never launch again', () => {
  const d = runner.decideLaunch({
    ...base,
    armed: 'mem-20260901-a',
    spentRows: [{ created_at: new Date(now), summary: 'launched [run mem-20260901-a]' }]
  });
  assert.equal(d.launch, false);
  assert.match(d.reason, /already spent/);
});

test('a suite that would skip is not worth launching, and says so rather than reporting a pass', () => {
  const d = runner.decideLaunch({ ...base, armed: 'mem-20260901-a', aiEnabled: false });
  assert.equal(d.launch, false);
  assert.match(d.reason, /would skip rather than run/);
});

test('a fresh label with a fresh authorisation and AI enabled launches exactly once', () => {
  const d = runner.decideLaunch({ ...base, armed: 'mem-20260901-a' });
  assert.equal(d.launch, true);
});

test('the memory runner cannot spend on behalf of either existing Scott/workspace pressure runner', () => {
  const scott = require('../../../scripts/scottLivePressureRunner');
  const workspace = require('../../../scripts/workspaceLivePressureRunner');
  assert.notEqual(runner.MARKER_EVENT, scott.MARKER_EVENT);
  assert.notEqual(runner.MARKER_EVENT, workspace.MARKER_EVENT);
  assert.notEqual(runner.AUTH_EVENT, scott.AUTH_EVENT);
  assert.notEqual(runner.AUTH_EVENT, workspace.AUTH_EVENT);
  assert.match(runner.MARKER_EVENT, /^scott_memory_/);
});

test('a label must be a single token, so a run is always named and never blank', () => {
  assert.equal(arm.validLabel('mem-20260901-a'), true);
  assert.equal(arm.validLabel('true'), false);
  assert.equal(arm.validLabel('false'), false);
  assert.equal(arm.validLabel(''), false);
  assert.equal(arm.validLabel(undefined), false);
  assert.equal(arm.validLabel('two words'), false);
});

// The in-container arming route exists because a sandbox that cannot
// reach the staging database still has to be able to arm a run. It must
// not collapse the two steps into one deploy.
test('arming refuses to happen in the same deploy that would spend', async () => {
  const before = { arm: process.env.ARM_SCOTT_MEMORY_PRESSURE, run: process.env.RUN_SCOTT_MEMORY_PRESSURE, by: process.env.ARM_SCOTT_MEMORY_PRESSURE_BY };
  process.env.ARM_SCOTT_MEMORY_PRESSURE = 'mem-20260901-a';
  process.env.RUN_SCOTT_MEMORY_PRESSURE = 'mem-20260901-a';
  process.env.ARM_SCOTT_MEMORY_PRESSURE_BY = 'Tom Arrington';
  let queried = false;
  const fakeDb = { query: async () => { queried = true; return { rows: [] }; } };
  await arm.armAtBoot(fakeDb);
  assert.equal(queried, false, 'an authorisation row was written in the same deploy that would spend');

  // And the runner refuses the mirror image, so neither order works.
  await runner.maybeRunMemoryLiveTest({ query: async () => { queried = true; return { rows: [] }; } });
  assert.equal(queried, false, 'the runner launched while the arming variable was still set');

  for (const [k, v] of [['ARM_SCOTT_MEMORY_PRESSURE', before.arm], ['RUN_SCOTT_MEMORY_PRESSURE', before.run], ['ARM_SCOTT_MEMORY_PRESSURE_BY', before.by]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

test('arming refuses without a named authoriser, so a spend always has someone behind it', async () => {
  const before = { arm: process.env.ARM_SCOTT_MEMORY_PRESSURE, by: process.env.ARM_SCOTT_MEMORY_PRESSURE_BY };
  process.env.ARM_SCOTT_MEMORY_PRESSURE = 'mem-20260901-b';
  delete process.env.ARM_SCOTT_MEMORY_PRESSURE_BY;
  let queried = false;
  await arm.armAtBoot({ query: async () => { queried = true; return { rows: [] }; } });
  assert.equal(queried, false);
  if (before.arm === undefined) delete process.env.ARM_SCOTT_MEMORY_PRESSURE; else process.env.ARM_SCOTT_MEMORY_PRESSURE = before.arm;
  if (before.by !== undefined) process.env.ARM_SCOTT_MEMORY_PRESSURE_BY = before.by;
});
