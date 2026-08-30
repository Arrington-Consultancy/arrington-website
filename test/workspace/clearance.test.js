// The human permission leg of the Arrington AI Workspace.
//
// Two properties matter more than the rest and are pinned deliberately:
// real human access is Tom alone (adding a name is a governed
// human-access expansion, not a code tidy), and an unknown or absent
// clearance sees nothing rather than defaulting to the widest view.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CLEARANCES,
  HUMAN_CLEARANCE,
  clearanceForUser,
  clearanceCanSeeSensitivity,
  clearanceCanSeeRecord,
  filterRecordsForClearance
} = require('../../lib/workspace/clearance');

test('exactly one real human is mapped, and it is Tom', () => {
  assert.deepEqual(Object.keys(HUMAN_CLEARANCE), ['tom']);
  assert.equal(HUMAN_CLEARANCE.tom, 'owner_admin');
});

test('nobody else resolves to a clearance, whatever their CMS role', () => {
  assert.equal(clearanceForUser({ username: 'nat', role: 'admin' }), null);
  assert.equal(clearanceForUser({ username: 'client1', role: 'client' }), null);
  assert.equal(clearanceForUser(null), null);
  assert.equal(clearanceForUser({}), null);
});

test('the synthetic test clearance is narrower than the owner and is not a login', () => {
  assert.deepEqual(CLEARANCES.ws_restricted.sensitivities, ['standard']);
  assert.ok(!Object.values(HUMAN_CLEARANCE).includes('ws_restricted'));
});

test('an unknown clearance sees nothing: the default is closed, not open', () => {
  assert.equal(clearanceCanSeeSensitivity('made_up', 'standard'), false);
  assert.equal(clearanceCanSeeRecord(undefined, { sensitivity: 'standard' }), false);
  assert.deepEqual(filterRecordsForClearance('made_up', [{ sensitivity: 'standard' }]), []);
});

test('a record with no sensitivity is treated as standard, never as unrestricted', () => {
  assert.equal(clearanceCanSeeRecord('ws_restricted', { title: 'x' }), true);
  assert.equal(clearanceCanSeeRecord('ws_restricted', { title: 'x', sensitivity: 'commercial' }), false);
});

test('the restricted clearance never reaches commercial or confidential rows', () => {
  const rows = [
    { record_key: 'a', sensitivity: 'standard' },
    { record_key: 'b', sensitivity: 'commercial' },
    { record_key: 'c', sensitivity: 'confidential' }
  ];
  assert.deepEqual(filterRecordsForClearance('ws_restricted', rows).map((r) => r.record_key), ['a']);
  assert.deepEqual(filterRecordsForClearance('owner_admin', rows).map((r) => r.record_key), ['a', 'b', 'c']);
});
