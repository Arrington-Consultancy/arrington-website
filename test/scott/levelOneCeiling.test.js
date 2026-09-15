// Scott demonstration: the Level 1 ceiling is true of the PROMPT too.
//
// This test exists because the claim was false when it was first made, and
// nothing in the repository could see it.
//
// The progression caps which source classes reach a worker, and
// test/scott/progression.test.js proves that cap holds: at Level 1 the
// retrieved context carries leads and nothing else. Every one of those tests
// passed while the ceiling was untrue, because they all measure
// buildContext, and buildContext is not the only thing in the prompt.
//
// CURRENT_OPERATING_POSITION — weekly capacity, stock counts, lead times and
// the price list — is joined into every worker's and Ruth's SYSTEM PROMPT.
// It reaches them outside buildContext, and therefore outside both the
// clearance filter and the level cap. Asked at Level 1 what capacity was
// available, Ruth answered "this week we're at 10 of 12 repair slots
// booked". The context held nothing but leads. The figure came from the
// prompt.
//
// It was found by the live probe (scripts/scottLevelOneProbe.js) and not by
// any unit test, which is the honest reason that probe is worth its cost.
// These tests are the cheap version, so the same class of defect fails here
// first from now on.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const orchestrator = require('../../lib/scott/orchestrator');
const workers = require('../../lib/scott/workers');
const { CURRENT_OPERATING_POSITION, BRAND_AND_OPERATING_SYSTEM } = require('../../lib/scott/businessFacts');

// Verbatim from the operating snapshot. These are the values a Level 1
// worker must not be able to state, and they are taken from the record
// rather than retyped, so editing the record cannot quietly make this test
// measure something that is no longer there.
const FORBIDDEN_AT_LEVEL_1 = [
  '12 armchair repair jobs per week',
  '30 standard items per week',
  '14 calendar days',
  '£145',
  '£48',
  '£35',
  '18 balls',
  '0 balls'
];

function workerList() {
  return Object.values(workers.WORKERS || {}).filter((w) => w && w.id && w.id !== 'receptionist');
}

describe('the operating snapshot is withheld at Level 1', () => {
  test('the figures really are in the snapshot, so this test measures something', () => {
    // Positive control on the fixture itself. If the record is reworded,
    // the list above stops matching and every assertion below becomes
    // trivially true — which is exactly how a leak test rots quietly.
    FORBIDDEN_AT_LEVEL_1.forEach((v) => {
      assert.ok(CURRENT_OPERATING_POSITION.includes(v),
        `"${v}" is no longer in CURRENT_OPERATING_POSITION — update this test rather than deleting the case`);
    });
  });

  test("Ruth's prompt carries none of them at Level 1", () => {
    const p = orchestrator.buildReceptionistSystemPrompt(1);
    FORBIDDEN_AT_LEVEL_1.forEach((v) => {
      assert.ok(!p.includes(v), `Ruth can still read "${v}" at Level 1`);
    });
  });

  test('no worker prompt carries them at Level 1', () => {
    workerList().forEach((w) => {
      const p = orchestrator.buildWorkerSystemPrompt(w, 1);
      FORBIDDEN_AT_LEVEL_1.forEach((v) => {
        assert.ok(!p.includes(v), `${w.id} can still read "${v}" at Level 1`);
      });
    });
  });

  test('Level 1 says plainly that it cannot see them, rather than going quiet', () => {
    // A prompt that simply omits the snapshot invites the model to fill the
    // hole from what is typical for a business like this, which would be a
    // worse failure than the leak: an invented figure presented as fact.
    const p = orchestrator.buildReceptionistSystemPrompt(1);
    assert.match(p, /not available at this step/i);
    assert.match(p, /must not state or estimate/i);
    assert.match(p, /Do not reconstruct them/i);
  });

  test('ABOVE Level 1 the prompt is exactly what it always was', () => {
    // The progression only ever narrows. If this goes red, a level has
    // started changing something it has no business changing.
    [2, 3, 4, undefined].forEach((lv) => {
      const r = orchestrator.buildReceptionistSystemPrompt(lv);
      assert.ok(r.includes(CURRENT_OPERATING_POSITION),
        `the receptionist lost the operating snapshot at level ${lv}`);
      workerList().forEach((w) => {
        assert.ok(orchestrator.buildWorkerSystemPrompt(w, lv).includes(CURRENT_OPERATING_POSITION),
          `${w.id} lost the operating snapshot at level ${lv}`);
      });
    });
  });

  test('the permanent brand and commercial rules survive at every level', () => {
    // Rules and tone, not position. A worker stripped of these answers out
    // of character and outside its own guardrails, which is not what the
    // ceiling is for.
    [1, 2, 3, 4].forEach((lv) => {
      assert.ok(orchestrator.buildReceptionistSystemPrompt(lv).includes(BRAND_AND_OPERATING_SYSTEM),
        `the receptionist lost the brand rules at level ${lv}`);
      workerList().forEach((w) => {
        assert.ok(orchestrator.buildWorkerSystemPrompt(w, lv).includes(BRAND_AND_OPERATING_SYSTEM),
          `${w.id} lost the brand rules at level ${lv}`);
      });
    });
  });

  test('a junk level is treated as "not Level 1", never as an error', () => {
    // The cap fails closed everywhere else. Here the safe direction is the
    // opposite: an unrecognised level must not silently strip a worker's
    // operating snapshot in ordinary use.
    ['constructor', null, {}, 'one', 0].forEach((lv) => {
      assert.ok(orchestrator.buildReceptionistSystemPrompt(lv).includes(CURRENT_OPERATING_POSITION),
        `level ${JSON.stringify(lv)} stripped the snapshot`);
    });
  });
});
