// Scott demonstration: the four-state progression (15/09/2026).
//
// The progression is a presentation layer laid over an access-control
// model that eighteen independent governance passes have attacked. The
// risk it introduces is not that a level shows too little. It is that a
// level is quietly treated as permission — that somewhere, "this level
// shows Lead Finder" comes to mean "this viewer may see Lead Finder",
// and the demonstration acquires a second access model whose whole
// purpose is to be easier to satisfy than the first one.
//
// So the tests that matter here are the ones that would go red if the
// level ever widened anything, and the one that would go red if Level 1's
// stated ceiling stopped being true.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const progression = require('../../lib/scott/progression');
const clearance = require('../../lib/scott/clearance');
const contextBuilders = require('../../lib/scott/data/contextBuilders');
const leadFinder = require('../../lib/scott/leadFinder');
const registry = require('../../lib/scott/capabilityRegistry');

const ALL_LEVELS = [1, 2, 3, 4];

describe('the level register', () => {
  test('four levels, numbered 1 to 4, each with a label and a sub-label', () => {
    assert.equal(progression.LEVELS.length, 4);
    assert.deepEqual(progression.LEVELS.map((l) => l.id), ALL_LEVELS);
    progression.LEVELS.forEach((l) => {
      assert.ok(l.key && typeof l.key === 'string', `${l.id} has no key`);
      assert.ok(l.label && l.label.length > 2, `${l.id} has no label`);
      // The rail shows all four sub-labels at once, on Tom's instruction:
      // the question it has to answer without being clicked is "what do
      // the other three do". A blank one is a step that cannot answer it.
      assert.ok(l.sub && l.sub.length > 4, `${l.id} has no sub-label`);
    });
  });

  test('the keys are unique, so a key cannot resolve to two states', () => {
    const keys = progression.LEVELS.map((l) => l.key);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('normaliseLevel fails closed', () => {
  test('accepts the four real levels as numbers, strings and keys', () => {
    ALL_LEVELS.forEach((n) => {
      assert.equal(progression.normaliseLevel(n), n);
      assert.equal(progression.normaliseLevel(String(n)), n);
    });
    progression.LEVELS.forEach((l) => {
      assert.equal(progression.normaliseLevel(l.key), l.id);
    });
  });

  test('anything else lands at Level 1, the narrowest state', () => {
    const junk = [
      undefined, null, '', '   ', 0, 5, -1, 99, 2.5, NaN, Infinity,
      true, false, {}, [], [3], () => 3, Symbol.iterator,
      '2; DROP TABLE', '../4', '0x04', '4e0', ' 4 4 '
    ];
    junk.forEach((v) => {
      let got;
      try { got = progression.normaliseLevel(v); } catch (e) { assert.fail(`threw on ${String(v)}: ${e.message}`); }
      assert.equal(got, 1, `${String(v)} should fail closed to 1, got ${got}`);
    });
  });

  test('a prototype-borne key is not a level', () => {
    // The shape of workspace governance finding T3 and of Scott's own
    // personaCanAct defect: a plain object literal resolves these through
    // Object.prototype, so a crafted value finds a truthy "level" that no
    // branch below ever reasoned about.
    ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'prototype']
      .forEach((k) => assert.equal(progression.normaliseLevel(k), 1, `${k} resolved to a level`));
  });

  test('normaliseLevel is idempotent', () => {
    [...ALL_LEVELS, 'nonsense', undefined].forEach((v) => {
      const once = progression.normaliseLevel(v);
      assert.equal(progression.normaliseLevel(once), once);
    });
  });
});

describe('the workspace grows, and never shrinks, as you move right', () => {
  // Rewritten 15/09/2026. These flags now come from the capability
  // registry rather than from hand-written `level >= n` comparisons, so
  // they are questions about one table instead of about four numbers
  // scattered across the codebase.
  const FLAGS = ['showBusinessContext', 'showRecordsNav', 'showPersonaSwitch', 'showTeamStrip', 'showProvenance', 'showLeadFinder'];
  const owner = () => (domain) => clearance.personaCanSeeDomain('scott_mercer', domain);

  test('every flag, once true, stays true at every higher level', () => {
    FLAGS.forEach((flag) => {
      let seenTrue = false;
      ALL_LEVELS.forEach((n) => {
        const on = registry.viewCapabilities(n, owner())[flag];
        if (on) seenTrue = true;
        else assert.equal(seenTrue, false, `${flag} turned back off at level ${n}`);
      });
    });
  });

  test('Level 1 is the calm one: none of the flags, and no worker names in the chat', () => {
    const c = registry.viewCapabilities(1, owner());
    FLAGS.forEach((f) => assert.equal(c[f], false, `Level 1 should not show ${f}`));
    assert.equal(c.chatDetail, 'plain');
  });

  test('Level 4 shows all of them', () => {
    const c = registry.viewCapabilities(4, owner());
    FLAGS.forEach((f) => assert.equal(c[f], true, `Level 4 should show ${f}`));
    assert.equal(c.chatDetail, 'team');
  });

  test('each level adds real surfaces the one below it did not have', () => {
    // Measured on the NAV rather than only on the flags, because the nav
    // is what a visitor actually experiences as the workspace growing.
    for (let n = 2; n <= 4; n += 1) {
      const count = (lv) => registry.navFor(lv, owner()).reduce((t, g) => t + g.items.length, 0);
      assert.ok(count(n) > count(n - 1),
        `level ${n} adds no navigable surface over level ${n - 1}`);
    }
  });

  test('a junk level gets the Level 1 workspace, not an exception and not Level 4', () => {
    ['constructor', undefined, 9].forEach((v) => {
      assert.deepEqual(
        registry.navFor(v, owner()),
        registry.navFor(1, owner()),
        `level ${JSON.stringify(v)} did not fail closed to the smallest workspace`
      );
    });
  });
});

describe('THE LEVEL NEVER WIDENS ACCESS', () => {
  // Still the single most important property in this file, and since
  // 15/09/2026 it is true by construction rather than by vigilance: no
  // level declares a domain at all, so there is no list that could drift
  // out of step with clearance.

  test('no level grants a capability the clearance model refuses', () => {
    // The two legs, measured together through the real function. A
    // capability requiring a domain must be refused at EVERY level to
    // someone without that domain, including the highest.
    const gated = registry.CAPABILITIES.filter((c) => c.requiresDomain && c.level !== null);
    assert.ok(gated.length > 0, 'expected at least one domain-gated capability to measure');

    Object.keys(clearance.PERSONAS).forEach((personaId) => {
      const canSee = (d) => clearance.personaCanSeeDomain(personaId, d);
      gated.forEach((c) => {
        if (canSee(c.requiresDomain)) return;
        ALL_LEVELS.forEach((n) => {
          assert.equal(registry.available(c.id, n, canSee), false,
            `${personaId} gained ${c.id} at level ${n} despite lacking ${c.requiresDomain}`);
        });
      });
    });
  });

  test('a level cannot turn a domain a persona lacks into one it has', () => {
    // Measured through the real context builder. The context no longer
    // takes a level at all, so what this really pins is that it has not
    // quietly grown one back: every persona reads exactly one thing,
    // whatever the interface is showing.
    Object.keys(clearance.PERSONAS).forEach((personaId) => {
      const block = contextBuilders.formatDeepFactsBlock(personaId, null);
      ALL_LEVELS.forEach(() => {
        assert.equal(contextBuilders.formatDeepFactsBlock(personaId, null), block,
          `${personaId}'s context is not stable`);
      });
    });
  });

  test('the narrowest persona reads less than the owner, or clearance has stopped working', () => {
    // A positive control on the test above. Without it, "everyone reads
    // the same thing at every level" would pass against a system showing
    // everybody everything.
    const count = (p) => contextBuilders.formatDeepFactsBlock(p, null).split('\n').filter((l) => l.startsWith('- [')).length;
    assert.ok(count('mike_evans') < count('scott_mercer'),
      'the driver and the owner read the same brain, so clearance is not filtering');
  });
});

describe('THE LEVEL NEVER NARROWS KNOWLEDGE EITHER', () => {
  // The other direction, added 15/09/2026 when Tom settled the model as
  // SAME BRAIN, MORE TOOLS, BIGGER WORKSPACE. Shrinking the workspace
  // must not delete authorised knowledge.

  test('there is no ceiling left to declare', () => {
    ALL_LEVELS.forEach((n) => assert.equal(progression.ceilingNote(n), null));
  });

  test('the owner reads exactly as much at Level 1 as at Level 4', () => {
    // This assertion was inverted before today. It used to require Level 1
    // to be a small fraction of Level 4.
    const block = contextBuilders.formatDeepFactsBlock('scott_mercer', null);
    const count = block.split('\n').filter((l) => l.startsWith('- [')).length;
    assert.ok(count > 50, 'expected a substantial brain, or this measures nothing');
  });

  test('what a level withholds is a TOOL, and it says so in those terms', () => {
    // The replacement for the ceiling. A question is answered; an action
    // the workspace has no application for is signposted.
    const canSee = () => true;
    assert.equal(registry.detectUnavailable('What does Mrs Jones owe us?', 1, canSee), null,
      'a question must never be diverted by a level');
    const action = registry.detectUnavailable('Invoice Mrs Jones for £160.', 1, canSee);
    assert.ok(action, 'an action needing an absent application should be signposted');
    assert.equal(action.level, 2);
    assert.match(action.message, /My Business/);
  });
});

describe('Lead Finder', () => {
  test('every opportunity carries all six evidence fields', () => {
    assert.ok(leadFinder.OPPORTUNITIES.length > 0);
    leadFinder.OPPORTUNITIES.forEach((o) => {
      leadFinder.REQUIRED_EVIDENCE_FIELDS.forEach((f) => {
        const v = o[f];
        const present = Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim().length > 3);
        assert.ok(present, `${o.ref} has no ${f}`);
      });
    });
  });

  test('every opportunity is tagged with the prospecting domain', () => {
    leadFinder.OPPORTUNITIES.forEach((o) => assert.equal(o.domain, leadFinder.DOMAIN));
  });

  test('only the owner persona can see them, through the ordinary filter', () => {
    const owner = clearance.filterAndRedact('scott_mercer', null, leadFinder.OPPORTUNITIES);
    assert.equal(owner.length, leadFinder.OPPORTUNITIES.length);

    Object.keys(clearance.PERSONAS)
      .filter((id) => id !== 'scott_mercer')
      .forEach((id) => {
        assert.equal(clearance.personaCanSeeDomain(id, leadFinder.DOMAIN), false, `${id} holds the prospecting domain`);
        assert.equal(clearance.filterAndRedact(id, null, leadFinder.OPPORTUNITIES).length, 0, `${id} can read prospecting records`);
      });
  });

  test('a candidate is never presented as a customer', () => {
    // The commercial line the demonstration must not cross: these are
    // businesses nobody has spoken to.
    const text = JSON.stringify(leadFinder.OPPORTUNITIES).toLowerCase();
    ['has agreed', 'has ordered', 'confirmed the order', 'is a customer', 'signed'].forEach((phrase) => {
      assert.ok(!text.includes(phrase), `a candidate claims a relationship: "${phrase}"`);
    });
  });

  test('inference is labelled as inference on the inferred one', () => {
    const hidden = leadFinder.OPPORTUNITIES.find((o) => o.kind === 'hidden');
    assert.ok(hidden, 'expected at least one inferred candidate');
    assert.match(hidden.confidence, /inference|nobody has said|not been/i,
      'an inferred candidate must say in words that it is inferred');
  });

  test('the headline count is never smaller than what is written up', () => {
    const s = leadFinder.summary();
    assert.ok(s.total >= s.shown, `headline ${s.total} is below the ${s.shown} shown`);
    assert.equal(s.obvious + s.hidden, s.shown);
    assert.match(s.note, new RegExp(`${s.shown}\\D+${s.total}`), 'the note must state both counts');
  });
});
