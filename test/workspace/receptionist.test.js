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
  // Governance finding T3: this test was named for exactly this and
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
    assert.match(note, /could not tell who holds that|did not match one of the specialists/,
      `"${laneId}" did not fall back to the honest no-lane sentence: ${note}`);
  }
});

test('a gap is reported even when an answer came back, on BOTH paths', () => {
  // Finding T2, and finding U5 which is the half T2's test could not
  // see. The gap branch sat below the no-lane early return, so
  // gapRaised was still fully inert on the commonest turn of all - and
  // the test pinned it with laneId: 'google_ads', which never reaches
  // that return.
  //
  // Routing is nine keyword regexes, so "no lane matched" is the DEFAULT
  // path. Any property of hers has to be asserted on it, not only on the
  // routed one.
  for (const laneId of ['google_ads', null]) {
    const withGap = receptionist.handoffNote({ laneId, answered: true, recordCount: 2, gapRaised: true });
    const withoutGap = receptionist.handoffNote({ laneId, answered: true, recordCount: 2, gapRaised: false });
    assert.match(withGap, /gap/i, `lane=${laneId}: a gap raised alongside an answer is never mentioned`);
    assert.notEqual(withGap, withoutGap, `lane=${laneId}: gapRaised makes no difference to what she says`);
  }
});

test('she never claims an act she did not perform', () => {
  // Findings U1 and V2. She holds no clearance, no database handle and
  // no write path, so she cannot author an answer and cannot write a
  // gap: repo.createGap does that, from a field the model returned.
  // A sentence claiming otherwise is the same class of untruth this
  // codebase spent thirteen reviews removing from the alert.
  //
  // V2 is the regex, not the module. The previous version of this
  // pattern was `\bI (?:answered|wrote|...)`, which matched the one
  // string U1 had removed and walked straight past "I have written the
  // gap down" on three other reachable sentences, because the word after
  // "I" is "have". That is the K2/M1/N1/P1 shape again: a test asserting
  // something adjacent to the property, staying green while the property
  // is false. It now covers the auxiliary and the perfect forms.
  //
  // "I took that to X" is deliberately NOT forbidden. Routing is the one
  // thing she actually does.
  const claims = /\bI(?:'ve|’ve| have| had| already)?\s+(?:answered|wrote|written|recorded|logged|noted|raised|worked (?:it|that) out)\b/i;
  for (const laneId of ['google_ads', null, 'constructor', 'not-a-lane']) {
    for (const answered of [true, false]) {
      for (const gapRaised of [true, false]) {
        for (const recordCount of [0, 1, 5]) {
          const note = receptionist.handoffNote({ laneId, answered, recordCount, gapRaised });
          assert.ok(!claims.test(note),
            `she claims an act she did not perform on lane=${laneId} answered=${answered} gap=${gapRaised} records=${recordCount}: "${note}"`);
        }
      }
    }
  }
});

test('she never claims a record when there was none, and says so when there was', () => {
  // Finding V1, and it is the sharpest of the fifteen because it is the
  // one thing the workspace exists to be trusted about: what an answer
  // is actually based on.
  //
  // U1's fix said "it was answered from the general records" on the
  // no-lane path unconditionally. With an unseeded brain, which is this
  // candidate's real state, there were no general records, and the
  // interface printed "No records were available for this answer" on the
  // same rendered line. Three of the four zero-record turns asserted a
  // basis that did not exist, because the one honest branch sat below
  // two early returns.
  //
  // Swept in BOTH directions, because a rule that only forbids can be
  // satisfied by saying nothing at all.
  // Deliberately narrow: it matches an ASSERTION of a basis ("from the
  // general records", "3 records"), not any use of the word. "with no
  // record behind it" is the honest zero-record sentence and must pass.
  const claimsRecords = /(?:from\s+(?:the\s+)?(?:\d+\s+)?(?:general\s+)?records?\b)|(?:\b\d+\s+records?\b)/i;
  for (const laneId of ['google_ads', null, 'constructor', 'not-a-lane']) {
    for (const answered of [true, false]) {
      for (const gapRaised of [true, false]) {
        const where = `lane=${laneId} answered=${answered} gap=${gapRaised}`;

        const none = receptionist.handoffNote({ laneId, answered, recordCount: 0, gapRaised });
        assert.ok(!claimsRecords.test(none),
          `she claims records that did not exist on ${where}: "${none}"`);

        // The other direction. Only turns that actually answered from a
        // lane or the general context can name a count, so the positive
        // assertion is scoped to those.
        if (answered) {
          const some = receptionist.handoffNote({ laneId, answered, recordCount: 3, gapRaised });
          assert.ok(claimsRecords.test(some),
            `three records were behind this answer and she does not say so on ${where}: "${some}"`);
        }
      }
    }
  }
});

test('a singular count reads as a singular sentence', () => {
  // Self-found while enumerating her whole reachable output space after
  // the V cycle: "the 1 record behind it DO not fully cover the question"
  // was on a real path (a lane answered, a gap was raised, exactly one
  // record supplied).
  //
  // Not a correctness or honesty defect, and it is tested anyway, because
  // this is owner-facing copy in the one product whose value is that its
  // wording can be relied on. Swept rather than pinned to the one
  // sentence that was wrong, which is the habit these fifteen passes
  // taught.
  const disagreement = /\b1 records\b|\bthe 1 record[^.]*\bdo not\b|\b[2-9]\d* records?[^.]*\bdoes not\b/i;
  for (const laneId of ['google_ads', null, 'constructor', 'not-a-lane']) {
    for (const answered of [true, false]) {
      for (const gapRaised of [true, false]) {
        for (const recordCount of [0, 1, 2, 5]) {
          const note = receptionist.handoffNote({ laneId, answered, recordCount, gapRaised });
          assert.ok(!disagreement.test(note),
            `count and verb disagree on lane=${laneId} answered=${answered} gap=${gapRaised} records=${recordCount}: "${note}"`);
        }
      }
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
