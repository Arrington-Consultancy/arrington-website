// The lane permission leg, and the register discipline behind it.
//
// A lane is a scoped reading context named after a canonical worker. It
// is not a persona and not a tenth identity: the completion mandate says
// "Do not invent another orchestrator, control-room worker or
// super-worker", so the tests below pin the register's own shape as much
// as the filtering.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LANES, SOURCE_CLASSES, SENSITIVITY_ORDER,
  laneById, laneCanReadSourceClass, laneCanReadSensitivity, laneCanReadRecord, filterRecordsForLane
} = require('../../lib/workspace/lanes');

const CANONICAL_NAMES = [
  'ARRINGTON GOOGLE ADS',
  'ARRINGTON WEBSITE & HOSTING',
  'ARRINGTON OPPORTUNITY BUILDER',
  'ARRINGTON BRAIN KEEPER',
  'ARRINGTON GOVERNANCE & ASSURANCE',
  'ARRINGTON SOCIAL CONTENT BUILDER',
  'ARRINGTON AI RECOMMENDATION VISIBILITY',
  'ARRINGTON AI DEMONSTRATION BUILDER',
  'ARRINGTON AI WORKSPACE BUILDER'
];

test('the lanes are exactly the nine canonical workers, in register order, with no tenth identity', () => {
  assert.deepEqual(LANES.map((l) => l.name), CANONICAL_NAMES);
});

test('a lane id inherited from Object.prototype is not a lane', () => {
  // Governance finding T3: LANES_BY_ID was a plain object literal, so
  // laneById('constructor') returned the Object function. The
  // receptionist then named a colleague called "Object", and
  // routes/workspace.js accepted it as a VALID forced lane id before
  // 500ing - laneById is what that route uses to validate caller input.
  // Fixed by giving the map a null prototype, which fixes every caller
  // at once.
  for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf']) {
    assert.equal(laneById(id), null, `laneById("${id}") returned something from the prototype chain`);
  }
});

test('the two project workers are marked as such, so neither reads as permanent staff', () => {
  const project = LANES.filter((l) => l.kind === 'project').map((l) => l.name);
  assert.deepEqual(project, ['ARRINGTON AI DEMONSTRATION BUILDER', 'ARRINGTON AI WORKSPACE BUILDER']);
});

test('every lane declares only known source classes and a real sensitivity ceiling', () => {
  LANES.forEach((l) => {
    l.sourceClasses.forEach((c) => assert.ok(SOURCE_CLASSES[c], `${l.name} declares unknown source class ${c}`));
    assert.ok(SENSITIVITY_ORDER.includes(l.sensitivityCeiling), `${l.name} has a bad ceiling`);
    assert.ok(l.sourceClasses.length > 0, `${l.name} reads nothing at all`);
  });
});

test('only Governance and Assurance reads every source class: independent assurance must see what it audits', () => {
  const readsEverything = LANES.filter((l) => l.sourceClasses.length === Object.keys(SOURCE_CLASSES).length);
  assert.deepEqual(readsEverything.map((l) => l.id), ['governance_assurance'],
    'a second all-seeing lane is far more likely to be an accident than a decision');
});

test('confidential opportunity records reach only the lanes that own that work', () => {
  const opp = { source_class: 'opportunity', sensitivity: 'confidential' };
  assert.equal(laneCanReadRecord('opportunity_builder', opp), true);
  assert.equal(laneCanReadRecord('governance_assurance', opp), true);
  // Social content and Google Ads have no business with a named live deal.
  assert.equal(laneCanReadRecord('social_content_builder', opp), false);
  assert.equal(laneCanReadRecord('google_ads', opp), false);
  assert.equal(laneCanReadRecord('ai_demonstration_builder', opp), false,
    'the Scott demonstration lane must never reach a real commercial conversation');
});

test('a lane is capped by its ceiling even inside a source class it may read', () => {
  assert.equal(laneCanReadSourceClass('website_hosting', 'strategy'), true);
  assert.equal(laneCanReadSensitivity('website_hosting', 'commercial'), true);
  assert.equal(laneCanReadSensitivity('website_hosting', 'confidential'), false);
  assert.equal(laneCanReadRecord('website_hosting', { source_class: 'strategy', sensitivity: 'confidential' }), false);
});

test('an unknown lane and an unknown sensitivity both fail closed', () => {
  assert.equal(laneById('control_room'), null, 'there is no control room worker');
  assert.equal(laneCanReadSourceClass('control_room', 'authority'), false);
  assert.equal(laneCanReadSensitivity('google_ads', 'top_secret'), false);
  assert.deepEqual(filterRecordsForLane('control_room', [{ source_class: 'authority', sensitivity: 'standard' }]), []);
});

test('a record with no sensitivity is treated as standard rather than unrestricted', () => {
  assert.equal(laneCanReadRecord('social_content_builder', { source_class: 'authority' }), true);
});
