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

test('she cannot invent a colleague, including one inherited from Object', () => {
  // Governance finding T2: this test was named for exactly this and
  // missed it, because it only tried an id that was obviously fake. A
  // crafted id made her announce a colleague called "Object" and 500'd
  // the ask endpoint, since the lane map was a plain object literal and
  // inherited Object.prototype. Fixed at source in lanes.js; pinned
  // here with the ids that actually reach through a prototype.
  const ids = ['not-a-real-lane', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];
  for (const laneId of ids) {
    const note = receptionist.handoffNote({ laneId, answered: true, recordCount: 2 });
    assert.ok(!/Object|Function|\[native code\]/.test(note), `"${laneId}" produced a colleague from the prototype chain: ${note}`);
    assert.ok(!note.includes(laneId), `"${laneId}" was echoed back as if it were a person`);
    assert.match(note, /could not tell who holds that|myself/);
  }
});

test('a gap is reported even when an answer came back', () => {
  // Finding T3, tested the way it actually fails. The caller passes
  // `answered: !!result.answer`, which is true whenever the workspace
  // replied at all, so `answered: false` is not a case production
  // reaches. gapRaised was only consulted on the !answered branch, which
  // made both honest gap sentences dead in practice while a
  // hand-written case list still hit them.
  //
  // So this pins the combination the route really produces: an answer
  // came back AND a gap was raised. A gap is the most useful thing she
  // can tell the owner - the records did not cover it and somebody wrote
  // that down instead of guessing - and it must not be swallowed by the
  // answer.
  const withGap = receptionist.handoffNote({ laneId: 'google_ads', answered: true, recordCount: 2, gapRaised: true });
  const withoutGap = receptionist.handoffNote({ laneId: 'google_ads', answered: true, recordCount: 2, gapRaised: false });
  assert.match(withGap, /gap/i, 'a gap raised alongside an answer is never mentioned, so the flag changes nothing');
  assert.notEqual(withGap, withoutGap, 'gapRaised makes no difference to what she says');
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
