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
  assert.deepEqual(receptionist.NOTE_FIELDS, ['laneId', 'recordCount', 'gapRaised']);
  assert.throws(
    () => receptionist.handoffNote({ laneId: 'google_ads', recordCount: 1, record: 'a confidential value' }),
    /refusing unpermitted field/,
    'the receptionist accepted a field carrying record content'
  );
});

test('she cannot invent a colleague, including one inherited from Object', () => {
  // Governance finding T3: this test was named for exactly this and
  // missed it, because it only tried an id that was obviously fake. A
  // crafted id made her announce a colleague called "Object" and 500'd
  // the ask endpoint, since the lane map was a plain object literal and
  // inherited Object.prototype. Fixed at source in lanes.js; pinned
  // here with the ids that actually reach through a prototype.
  const ids = ['not-a-real-lane', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];
  for (const laneId of ids) {
    const note = receptionist.handoffNote({ laneId, recordCount: 2 });
    assert.ok(!/Object|Function|\[native code\]/.test(note), `"${laneId}" produced a colleague from the prototype chain: ${note}`);
    assert.ok(!note.includes(laneId), `"${laneId}" was echoed back as if it were a person`);
    assert.match(note, /could not tell who holds that|did not match one of the specialists/,
      `"${laneId}" did not fall back to the honest no-lane sentence: ${note}`);
  }
});

// THE PERMITTED OUTPUT SET.
//
// Governance finding W2. Her honesty was previously pinned by a denylist
// of eight verbs, and the reviewer got a mutation past it in one line:
// "I took that to X, and I checked the 3 records behind it myself before
// passing it on" - an explicit claim to have read records she cannot
// read, on a reachable branch, passing a suite named for exactly that
// property. A denylist can only forbid the phrasings somebody already
// thought of.
//
// Her output space is finite and small, so it is declared instead. Every
// reachable string must be a member of this set once lane names and
// counts are normalised. A new sentence therefore has to be added here
// deliberately and read by whoever adds it, in the same spirit as
// NOTE_FIELDS throwing on an undeclared field.
//
// Each of these was checked by hand against what actually happens:
// she routes, and she reports; she never answers, writes, reads or
// decides anything.
const PERMITTED_SHAPES = [
  'I took that to {LANE}, who answered from {N} record. The provenance is listed with the answer.',
  'I took that to {LANE}, who answered from {N} records. The provenance is listed with the answer.',
  'I took that to {LANE}. They answered from what they hold, with no record behind it. The gap has been written down rather than let pass.',
  'I took that to {LANE}. They answered, but the record behind it does not fully cover the question. The gap has been written down rather than let pass.',
  'I took that to {LANE}. They answered, but the {N} records behind it do not fully cover the question. The gap has been written down rather than let pass.',
  'That did not match one of the specialists, and there was no record on file to answer it from.',
  'That did not match one of the specialists, and there was no record on file to answer it from. The gap has been written down rather than let pass.',
  'That did not match one of the specialists, so it was answered from {N} record in the general context.',
  'That did not match one of the specialists, so it was answered from {N} record in the general context. The gap has been written down rather than let pass.',
  'That did not match one of the specialists, so it was answered from {N} records in the general context.',
  'That did not match one of the specialists, so it was answered from {N} records in the general context. The gap has been written down rather than let pass.',
  '{LANE} answered from what they hold. No specific record is behind it, so treat it as their reading rather than as evidence.'
];

const LANE_IDS = LANES.map((l) => l.id);
// Real lanes, plus the ids that reach the no-lane default: nothing,
// nonsense, and the prototype keys finding T3 was about.
const PROBE_LANE_IDS = [...LANE_IDS, null, undefined, '', 'not-a-lane', 'constructor', '__proto__', 'toString'];
const PROBE_COUNTS = [0, 1, 2, 7, 99];

function normalise(line) {
  let t = line;
  for (const l of LANES) t = t.split(l.name).join('{LANE}');
  return t.replace(/\b\d+ records\b/g, '{N} records').replace(/\b\d+ record\b/g, '{N} record');
}

function everyReachableNote() {
  const out = [];
  for (const laneId of PROBE_LANE_IDS) {
    for (const gapRaised of [true, false]) {
      for (const recordCount of PROBE_COUNTS) {
        out.push({ laneId, gapRaised, recordCount, note: receptionist.handoffNote({ laneId, recordCount, gapRaised }) });
      }
    }
  }
  return out;
}

test('every reachable sentence is one she is permitted to say', () => {
  const permitted = new Set(PERMITTED_SHAPES);
  const seen = new Set();
  for (const { laneId, gapRaised, recordCount, note } of everyReachableNote()) {
    const shape = normalise(note);
    seen.add(shape);
    assert.ok(permitted.has(shape),
      `undeclared sentence on lane=${String(laneId)} gap=${gapRaised} records=${recordCount}:\n  "${note}"\n  normalised: "${shape}"\n  If this is a deliberate new sentence, read it against what actually happens and add it to PERMITTED_SHAPES.`);
  }
  // The other direction: a shape declared here but no longer produced is
  // dead wording, and dead wording is how a sentence nobody has read
  // survives a rewrite.
  const unreachable = PERMITTED_SHAPES.filter((sh) => !seen.has(sh));
  assert.deepEqual(unreachable, [], `declared but unreachable: ${unreachable.join(' | ')}`);
});

test('the receptionist takes no inert parameter', () => {
  // Finding W1. `answered` was passed on every turn and was always true,
  // because parseReply refuses an empty answer and the route answers 503
  // before Ruth is called. Three of her shapes were dead, and two of the
  // dead ones carried a hard-coded record clause that contradicted the
  // module's own rule 1. That is finding T2 recurring one parameter
  // along, in the same function, three cycles later, so the parameter is
  // gone rather than patched.
  assert.deepEqual(receptionist.NOTE_FIELDS, ['laneId', 'recordCount', 'gapRaised']);
  assert.throws(
    () => receptionist.handoffNote({ laneId: 'google_ads', recordCount: 1, answered: true }),
    /refusing unpermitted field/,
    'a caller can still pass the inert parameter, which is how a branch nobody reasoned about gets reached'
  );
});

test('she never claims a record when there was none, and says so when there was', () => {
  // Finding V1, and W1 which closed the last two branches it did not
  // reach. Every record clause is derived from the count now.
  //
  // Swept in BOTH directions, because a rule that only forbids can be
  // satisfied by saying nothing at all.
  const claimsRecords = /(?:from\s+(?:the\s+)?(?:\d+\s+)?(?:general\s+)?records?\b)|(?:\b\d+\s+records?\b)/i;
  for (const laneId of PROBE_LANE_IDS) {
    for (const gapRaised of [true, false]) {
      const where = `lane=${String(laneId)} gap=${gapRaised}`;
      const none = receptionist.handoffNote({ laneId, recordCount: 0, gapRaised });
      assert.ok(!claimsRecords.test(none), `she claims records that did not exist on ${where}: "${none}"`);
      const some = receptionist.handoffNote({ laneId, recordCount: 3, gapRaised });
      assert.ok(claimsRecords.test(some),
        `three records were behind this answer and she does not say so on ${where}: "${some}"`);
    }
  }
});

test('a singular count reads as a singular sentence', () => {
  // Self-found while enumerating her output space after the V cycle:
  // "the 1 record behind it DO not fully cover the question" was on a
  // real path. Not a correctness defect, and tested anyway, because this
  // is owner-facing copy in the one product whose value is that its
  // wording can be relied on.
  const disagreement = /\b1 records\b|\bthe 1 record[^.]*\bdo not\b|\b[2-9]\d* records?[^.]*\bdoes not\b/i;
  for (const { laneId, gapRaised, recordCount, note } of everyReachableNote()) {
    assert.ok(!disagreement.test(note),
      `count and verb disagree on lane=${String(laneId)} gap=${gapRaised} records=${recordCount}: "${note}"`);
  }
});

test('a gap is reported on every path, including the default one', () => {
  // Findings T2 and U5. The gap sentence was first unreachable, then
  // reachable only on the lane branch, and the test written for it used a
  // lane id that never reaches the no-lane return.
  for (const laneId of ['google_ads', null, 'not-a-lane']) {
    for (const recordCount of [0, 3]) {
      const withGap = receptionist.handoffNote({ laneId, recordCount, gapRaised: true });
      const withoutGap = receptionist.handoffNote({ laneId, recordCount, gapRaised: false });
      assert.match(withGap, /gap has been written down/i,
        `no gap reported on lane=${String(laneId)} records=${recordCount}`);
      assert.ok(!/gap has been written down/i.test(withoutGap),
        `a gap is reported when none was raised on lane=${String(laneId)} records=${recordCount}`);
    }
  }
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
