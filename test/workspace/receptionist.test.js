// Ruth, and the four things she must not be.
//
// Tom asked for a receptionist in the Arrington workspace on 31/08/2026.
// The completion mandate forbids "another orchestrator, control-room
// worker or super-worker", so the whole question is whether a named
// front door reintroduces the thing that rule exists to prevent. These
// tests are the answer, and they are written to be checkable by someone
// who does not trust the comment at the top of the module.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const receptionist = require('../../lib/workspace/receptionist');
const { LANES, SOURCE_CLASSES, SENSITIVITY_ORDER } = require('../../lib/workspace/lanes');

test('she is not a tenth lane: the register is untouched', () => {
  assert.equal(LANES.length, 9, 'the lane register changed when the receptionist was added');
  assert.ok(!LANES.some((l) => /ruth|reception/i.test(l.name) || /ruth|reception/i.test(l.id)),
    'the receptionist appears in the lane register, which makes her a tenth worker');
});

test('she holds no source class, no ceiling and no clearance', () => {
  // The three things that would make her a reading context rather than a
  // doorway. If any of them appears on her, the permission model has
  // grown a fourth leg.
  const shape = JSON.stringify(receptionist.RUTH);
  for (const cls of Object.keys(SOURCE_CLASSES)) {
    assert.ok(!shape.includes(cls), `the receptionist declares source class ${cls}`);
  }
  for (const level of SENSITIVITY_ORDER) {
    assert.ok(!shape.includes(level), `the receptionist declares a sensitivity ceiling (${level})`);
  }
  assert.deepEqual(Object.keys(receptionist.RUTH).sort(), ['line', 'name', 'role'],
    'the receptionist grew a field beyond a name, a role and a line');
});

test('she can speak about the routing and never about the content', () => {
  // Structural, not textual: the fields are declared, and anything else
  // throws. The same discipline as the unlock alert after finding H7,
  // for the same reason - an open-ended input on a component that talks
  // to the owner is a disclosure channel with no gate on it.
  assert.deepEqual(receptionist.NOTE_FIELDS, ['laneId', 'answered', 'recordCount', 'gapRaised']);
  assert.throws(
    () => receptionist.handoffNote({ laneId: 'google_ads', answered: true, record: 'a confidential value' }),
    /refusing unpermitted field/,
    'the receptionist accepted a field carrying record content'
  );
});

test('she cannot invent a colleague', () => {
  const note = receptionist.handoffNote({ laneId: 'not-a-real-lane', answered: true, recordCount: 2 });
  assert.ok(!/not-a-real-lane/.test(note), 'an unknown lane id was echoed back as if it were a person');
  assert.match(note, /could not tell who holds that|myself/);
});

test('her directory exposes names, never what any lane can read', () => {
  for (const entry of receptionist.directory()) {
    assert.deepEqual(Object.keys(entry).sort(), ['id', 'kind', 'name'],
      'the receptionist directory carries more than an id, a name and a kind');
  }
});

test('nothing of Scott reaches her', () => {
  // "Reuse principles, not fictional content." Scott's demonstration has
  // a receptionist as well; none of it is imported here, in either
  // direction.
  const src = fs.readFileSync(path.join(__dirname, '../../lib/workspace/receptionist.js'), 'utf8');
  const requires = src.match(/require\((['"])([^'"]+)\1\)/g) || [];
  for (const r of requires) {
    assert.ok(!/scott/i.test(r), `the receptionist imports Scott code: ${r}`);
  }
  // And nothing of Scott's fictional world by name either.
  for (const token of ['Bailey', 'Mercer', 'Fletcher', 'Armchair', 'Knitting']) {
    assert.ok(!src.includes(token), `Scott's fictional content appears in the Arrington receptionist: ${token}`);
  }
});
