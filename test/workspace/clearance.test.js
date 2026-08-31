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
  filterRecordsForClearance,
  clearanceCovers,
  describeOwnerBinding
} = require('../../lib/workspace/clearance');

test('exactly one real human is mapped, and it is Tom', () => {
  assert.deepEqual(Object.keys(HUMAN_CLEARANCE), ['tom']);
  assert.equal(HUMAN_CLEARANCE.tom, 'owner_admin');
});

// Governance finding F1, Tom's decision of 31/08/2026: clearanceForUser
// now needs the deployment binding as well as the map, so these cases
// set it. Without that they would pass because NOTHING resolves in an
// unconfigured environment, which proves nothing about who is excluded.
const BIND_KEYS = ['WORKSPACE_OWNER_USERNAME', 'WORKSPACE_OWNER_USER_ID'];
const BIND_ORIGINAL = Object.fromEntries(BIND_KEYS.map((k) => [k, process.env[k]]));
test.beforeEach(() => {
  process.env.WORKSPACE_OWNER_USERNAME = 'tom';
  process.env.WORKSPACE_OWNER_USER_ID = '7';
});
test.after(() => {
  BIND_KEYS.forEach((k) => {
    if (BIND_ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = BIND_ORIGINAL[k];
  });
});

test('the cleared owner does resolve, so the exclusions below mean something', () => {
  assert.equal(clearanceForUser({ id: 7, username: 'tom', role: 'content' }), 'owner_admin');
});

test('nobody else resolves to a clearance, whatever their CMS role', () => {
  assert.equal(clearanceForUser({ id: 2, username: 'nat', role: 'admin' }), null);
  assert.equal(clearanceForUser({ id: 3, username: 'client1', role: 'client' }), null);
  assert.equal(clearanceForUser(null), null);
  assert.equal(clearanceForUser({}), null);
});

test('the user id must match the deployment, so a recreated account inherits nothing', () => {
  assert.equal(clearanceForUser({ id: 8, username: 'tom', role: 'content' }), null);
  assert.equal(clearanceForUser({ username: 'tom', role: 'content' }), null, 'a session with no id was cleared');
  assert.equal(clearanceForUser({ id: '', username: 'tom', role: 'content' }), null);
  assert.equal(clearanceForUser({ id: 0, username: 'tom', role: 'content' }), null);
});

test('an absent deployment binding clears nobody', () => {
  delete process.env.WORKSPACE_OWNER_USERNAME;
  assert.equal(clearanceForUser({ id: 7, username: 'tom', role: 'content' }), null);
  process.env.WORKSPACE_OWNER_USERNAME = 'tom';
  delete process.env.WORKSPACE_OWNER_USER_ID;
  assert.equal(clearanceForUser({ id: 7, username: 'tom', role: 'content' }), null);
});

test('the binding cannot grant clearance to a username the code does not clear', () => {
  process.env.WORKSPACE_OWNER_USERNAME = 'nat';
  process.env.WORKSPACE_OWNER_USER_ID = '2';
  assert.equal(clearanceForUser({ id: 2, username: 'nat', role: 'admin' }), null,
    'Railway alone granted clearance; it is meant to require a code change too');
});

test('the boot diagnostic names what is missing rather than just failing', () => {
  delete process.env.WORKSPACE_OWNER_USERNAME;
  delete process.env.WORKSPACE_OWNER_USER_ID;
  const d = describeOwnerBinding();
  assert.equal(d.ok, false);
  assert.equal(d.problems.length, 2);
  process.env.WORKSPACE_OWNER_USERNAME = 'tom';
  process.env.WORKSPACE_OWNER_USER_ID = 'not-a-number';
  assert.match(describeOwnerBinding().problems.join(' '), /positive integer/);
  process.env.WORKSPACE_OWNER_USER_ID = '7';
  assert.equal(describeOwnerBinding().ok, true);
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

// Governance finding F7 (30/08/2026): workspace_conversations.clearance
// was written on every conversation and read by nothing. These pin the
// helper that now gates history on it, because the failure it prevents
// is silent: a person whose clearance is narrowed keeps reading their own
// old transcripts, which were composed from material they can no longer
// be shown.
test('a reader must still cover the clearance an answer was composed at', () => {
  assert.equal(clearanceCovers('owner_admin', 'owner_admin'), true);
  assert.equal(clearanceCovers('owner_admin', 'ws_restricted'), true,
    'a wider clearance can read back a narrower conversation');
  assert.equal(clearanceCovers('ws_restricted', 'owner_admin'), false,
    'a narrowed clearance can still read a conversation composed at the wider one');
});

test('an unrecognised stored clearance is covered by nobody', () => {
  // A renamed or removed clearance must close the history, not open it.
  assert.equal(clearanceCovers('owner_admin', 'clearance_that_no_longer_exists'), false);
  assert.equal(clearanceCovers('owner_admin', null), false);
  assert.equal(clearanceCovers('owner_admin', ''), false);
  assert.equal(clearanceCovers(null, 'owner_admin'), false);
});

test('covering is about the sensitivities, not the label, so a renamed clearance of equal reach still covers', () => {
  const a = CLEARANCES.owner_admin.sensitivities;
  const b = CLEARANCES.ws_restricted.sensitivities;
  assert.ok(b.every((s) => a.includes(s)));
  assert.ok(!a.every((s) => b.includes(s)));
});

test('a prototype key is refused, not answered from Object.prototype', () => {
  // Finding V5, and finding T3 one file along. CLEARANCES and
  // HUMAN_CLEARANCE are keyed by values that come from configuration
  // (WORKSPACE_OWNER_USERNAME, and the clearance id derived from it), and
  // a plain object literal answers `constructor` and friends from the
  // prototype chain. The truthiness guards then pass, because a function
  // is truthy, and the next line throws rather than refusing.
  //
  // Nothing reaches this today and the fifteenth reviewer said so
  // plainly. It is fixed for symmetry with lanes.js, and because
  // describeOwnerBinding shares the lookup: a WORKSPACE_OWNER_USERNAME of
  // `toString` would otherwise print the binding as ok for a username
  // holding no clearance in code, which is the class finding G7 was.
  for (const key of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
    assert.equal(clearanceForUser({ username: key, id: 1 }), null,
      `${key} resolved to a clearance through the prototype chain`);
    assert.equal(clearanceCanSeeSensitivity(key, 'standard'), false,
      `${key} was answered as a clearance rather than refused`);
    assert.equal(clearanceCanSeeSensitivity(key, 'confidential'), false);
    assert.equal(clearanceCovers(key, 'owner_admin'), false);
    assert.equal(clearanceCovers('owner_admin', key), false,
      `${key} was covered as a stored clearance`);
  }
});
