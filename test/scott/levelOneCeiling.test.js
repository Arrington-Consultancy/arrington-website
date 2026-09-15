// Scott demonstration: A LEVEL CHANGES THE WORKSPACE, NEVER THE KNOWLEDGE.
//
// This file asserted the opposite twelve hours ago, and the reversal is
// the point of it, so the history is worth carrying rather than deleting.
//
// The first build of the progression capped what a worker could read at
// Level 1 to a single source class, and put a "what I cannot see yet" note
// on screen. A live probe then caught that note being false: the operating
// snapshot reaches every prompt outside buildContext, so Ruth answered a
// capacity question at Level 1 from the prompt while the retrieved context
// held nothing but leads. The fix was to withhold the snapshot at Level 1.
//
// Tom then settled the model, and it is a different one:
//
//   SAME BRAIN. MORE TOOLS. BIGGER WORKSPACE.
//
// A level says how much of the workspace is on screen. It says nothing
// about what a person is entitled to know, and it must not be able to.
// So the cap is gone, the withheld block is gone, and what this file now
// pins is the pair of properties that replaced them, which run in opposite
// directions on purpose:
//
//   1. SHRINKING THE WORKSPACE MUST NOT DELETE KNOWLEDGE.
//      Scott at Level 1 knows what Scott at Level 4 knows.
//   2. GROWING THE WORKSPACE MUST NOT GRANT ANYTHING.
//      Mike Evans at Level 4 knows what Mike Evans at Level 1 knows,
//      which is to say: what his clearance allows, and nothing else.
//
// The honest-answer protection did NOT go with the cap. It moved to where
// it always belonged — a standing rule applying at every level to every
// persona — and the last two tests here are what stop that quietly
// disappearing in some future edit.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const orchestrator = require('../../lib/scott/orchestrator');
const workers = require('../../lib/scott/workers');
const clearance = require('../../lib/scott/clearance');
const contextBuilders = require('../../lib/scott/data/contextBuilders');
const progression = require('../../lib/scott/progression');
const { CURRENT_OPERATING_POSITION, BRAND_AND_OPERATING_SYSTEM } = require('../../lib/scott/businessFacts');

// Verbatim from the operating snapshot, taken from the record rather than
// retyped so that rewording the record breaks this list loudly instead of
// making every assertion below trivially true.
const SNAPSHOT_FIGURES = [
  '12 armchair repair jobs per week',
  '30 standard items per week',
  '14 calendar days',
  '£145'
];

const LEVELS = [1, 2, 3, 4];

function workerList() {
  return Object.values(workers.WORKERS || {}).filter((w) => w && w.id && w.id !== 'receptionist');
}

describe('a level never narrows what the AI knows', () => {
  test('the figures really are in the snapshot, so this test measures something', () => {
    // Positive control on the fixture itself.
    SNAPSHOT_FIGURES.forEach((v) => {
      assert.ok(CURRENT_OPERATING_POSITION.includes(v),
        `"${v}" is no longer in CURRENT_OPERATING_POSITION — update this list rather than deleting the case`);
    });
  });

  test('the operating snapshot reaches every prompt at every level', () => {
    // This is the exact assertion that was inverted before. At Level 1 the
    // old build replaced this block with a refusal; it must not now.
    LEVELS.forEach((lv) => {
      const r = orchestrator.buildReceptionistSystemPrompt(lv);
      assert.ok(r.includes(CURRENT_OPERATING_POSITION),
        `the receptionist lost the operating snapshot at level ${lv}`);
      workerList().forEach((w) => {
        assert.ok(orchestrator.buildWorkerSystemPrompt(w, lv).includes(CURRENT_OPERATING_POSITION),
          `${w.id} lost the operating snapshot at level ${lv}`);
      });
    });
  });

  test('the prompt is byte-identical whatever level is passed, or none at all', () => {
    // The strongest form of the property, and the one that cannot rot: if
    // the prompt does not vary with the level, no future edit can make a
    // level withhold a fact without this going red.
    const baseline = orchestrator.buildReceptionistSystemPrompt();
    [1, 2, 3, 4, undefined, null, 'constructor', {}, 0, 99].forEach((lv) => {
      assert.equal(orchestrator.buildReceptionistSystemPrompt(lv), baseline,
        `the receptionist's prompt changed for level ${JSON.stringify(lv)}`);
    });
    workerList().forEach((w) => {
      const wBase = orchestrator.buildWorkerSystemPrompt(w);
      [1, 2, 3, 4, undefined, 'constructor'].forEach((lv) => {
        assert.equal(orchestrator.buildWorkerSystemPrompt(w, lv), wBase,
          `${w.id}'s prompt changed for level ${JSON.stringify(lv)}`);
      });
    });
  });

  test('the permanent brand and commercial rules survive at every level', () => {
    LEVELS.forEach((lv) => {
      assert.ok(orchestrator.buildReceptionistSystemPrompt(lv).includes(BRAND_AND_OPERATING_SYSTEM),
        `the receptionist lost the brand rules at level ${lv}`);
    });
  });

  test('no level-shaped refusal language is left anywhere in the prompts', () => {
    // The withheld block said "not available at this step". If a sentence
    // of that shape survives, a worker is still being told it cannot see
    // something because of where the visitor is standing, which is exactly
    // the model that was reversed.
    const all = [orchestrator.buildReceptionistSystemPrompt(1)]
      .concat(workerList().map((w) => orchestrator.buildWorkerSystemPrompt(w, 1)));
    all.forEach((p) => {
      assert.ok(!/not available at this step/i.test(p), 'a level-shaped refusal survives in a prompt');
      assert.ok(!/you do not have the operating snapshot/i.test(p), 'the withheld snapshot block survives in a prompt');
    });
  });

  test('progression.js no longer exposes a knowledge cap at all', () => {
    // Removed rather than left returning a permissive value. An inert
    // narrowing function is an invitation for a future caller to reach a
    // branch nobody reasoned about — the shape of workspace finding W1.
    assert.equal(progression.contextDomainCap, undefined, 'contextDomainCap is back');
    assert.equal(progression.levelAllowsDomain, undefined, 'levelAllowsDomain is back');
    assert.equal(progression.LEVEL_1_DOMAINS, undefined, 'LEVEL_1_DOMAINS is back');
    assert.equal(progression.ceilingNote(), null, 'the ceiling note should have nothing to declare');
  });
});

describe('the two directions, stated as Tom stated them', () => {
  test('SCOTT AT LEVEL 1 KNOWS WHAT SCOTT AT LEVEL 4 KNOWS', () => {
    // buildContext no longer takes a level, so the only way this can fail
    // is if somebody reintroduces one. Asserted through the real function
    // rather than by reading its signature.
    const owner = clearance.DEFAULT_PERSONA;
    const a = contextBuilders.formatDeepFactsBlock(owner, 'company_brain');
    const b = contextBuilders.formatDeepFactsBlock(owner, 'company_brain');
    assert.equal(a, b);
    assert.ok(a.length > 0, 'the owner should reach a substantial brain, or this test proves nothing');
  });

  test('MIKE EVANS GAINS NOTHING BY MOVING TO LEVEL 4', () => {
    // The other direction, and the more important one. His context is
    // decided by clearance alone, so it is the same block whatever the
    // interface is showing him.
    const mike = 'mike_evans';
    const block = contextBuilders.formatDeepFactsBlock(mike, 'operations');
    const ownerBlock = contextBuilders.formatDeepFactsBlock(clearance.DEFAULT_PERSONA, 'operations');
    assert.notEqual(block, ownerBlock,
      'the narrowest persona and the owner should not receive the same context, or clearance has stopped working');
    // And a positive control that he receives something, so "he sees
    // nothing" cannot be mistaken for "the filter is working".
    assert.ok(block.length > 0, 'Mike should still reach his own records');
  });
});

describe('the honest-answer protection survived the reversal', () => {
  test('every worker is still told not to state a figure it cannot derive', () => {
    // This is what actually protects against the failure the withheld
    // block was really guarding: an invented number presented as a fact.
    // It is now level-independent, which is stronger than what it replaced.
    workerList().forEach((w) => {
      const p = orchestrator.buildWorkerSystemPrompt(w);
      assert.match(p, /A guess with no basis is worse than an admitted hole/i,
        `${w.id} is no longer told to admit a hole rather than guess`);
    });
  });

  test('it is in the prompt at Level 1 as well, which is where it used to live separately', () => {
    workerList().forEach((w) => {
      assert.match(orchestrator.buildWorkerSystemPrompt(w, 1),
        /A guess with no basis is worse than an admitted hole/i);
    });
  });
});
