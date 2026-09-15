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

describe('capabilities are monotone: a higher level never shows less', () => {
  const FLAGS = ['showBusinessContext', 'showRecordsNav', 'showPersonaSwitch', 'showTeamStrip', 'showProvenance', 'showLeadFinder'];

  test('every flag, once true, stays true at every higher level', () => {
    FLAGS.forEach((flag) => {
      let seenTrue = false;
      ALL_LEVELS.forEach((n) => {
        const on = progression.capabilities(n)[flag];
        if (on) seenTrue = true;
        else assert.equal(seenTrue, false, `${flag} turned back off at level ${n}`);
      });
    });
  });

  test('Level 1 shows none of them, which is the whole point of Level 1', () => {
    const c = progression.capabilities(1);
    FLAGS.forEach((f) => assert.equal(c[f], false, `Level 1 should not show ${f}`));
    assert.equal(c.chatDetail, 'plain');
  });

  test('Level 4 shows all of them', () => {
    const c = progression.capabilities(4);
    FLAGS.forEach((f) => assert.equal(c[f], true, `Level 4 should show ${f}`));
    assert.equal(c.chatDetail, 'team');
  });

  test('each level unlocks something the one below it did not', () => {
    for (let n = 2; n <= 4; n += 1) {
      const lower = progression.capabilities(n - 1);
      const higher = progression.capabilities(n);
      const gained = FLAGS.filter((f) => higher[f] && !lower[f]);
      assert.ok(gained.length > 0, `level ${n} adds nothing over level ${n - 1}`);
    }
  });

  test('a junk level gets Level 1 capabilities, not an exception and not Level 4', () => {
    ['constructor', undefined, 9].forEach((v) => {
      assert.deepEqual(progression.capabilities(v), progression.capabilities(1));
    });
  });
});

describe('THE LEVEL NEVER WIDENS ACCESS', () => {
  // The single most important property in this file. A level is a
  // narrowing lens over clearance, never a second grant.

  test('above Level 1 there is no cap at all, so the level cannot add a source class', () => {
    [2, 3, 4].forEach((n) => {
      assert.equal(progression.contextDomainCap(n), null, `level ${n} declares a cap, which could drift from clearance`);
    });
  });

  test('the Level 1 cap is a strict subset of what every higher level allows', () => {
    const cap = progression.contextDomainCap(1);
    assert.ok(Array.isArray(cap) && cap.length > 0);
    cap.forEach((d) => {
      [2, 3, 4].forEach((n) => {
        assert.equal(progression.levelAllowsDomain(n, d), true, `${d} allowed at 1 but not at ${n}`);
      });
    });
  });

  test('every domain in the record set is allowed at Level 4 and gated only by clearance', () => {
    const domains = new Set(contextBuilders.allDeepFactRecords().map((r) => r && r.domain).filter(Boolean));
    assert.ok(domains.size > 5, 'expected a real record set to measure against');
    domains.forEach((d) => {
      assert.equal(progression.levelAllowsDomain(4, d), true, `${d} is blocked at Level 4 by the level rather than by clearance`);
    });
  });

  test('the level cannot turn a domain a persona lacks into one it has', () => {
    // Measured through the real context builder, for every persona, at
    // every level: a record visible at some level must be visible to that
    // persona at Level 4, which is clearance alone.
    Object.keys(clearance.PERSONAS).forEach((personaId) => {
      const atFour = contextBuilders.formatDeepFactsBlock(personaId, null, 4);
      ALL_LEVELS.forEach((n) => {
        const atN = contextBuilders.formatDeepFactsBlock(personaId, null, n);
        atN.split('\n').filter((l) => l.startsWith('- [')).forEach((line) => {
          assert.ok(atFour.includes(line), `${personaId} sees a line at level ${n} that clearance alone does not give them:\n${line}`);
        });
      });
    });
  });
});

describe("LEVEL 1's CEILING IS TRUE", () => {
  // The ceiling sentence is worthless, and worse than worthless, if the
  // system behind it can in fact read those things and is merely
  // declining to mention them.

  test('the ceiling is declared at Level 1 and nowhere else', () => {
    const c = progression.ceilingNote(1);
    assert.ok(c && c.heading && c.body);
    [2, 3, 4].forEach((n) => assert.equal(progression.ceilingNote(n), null));
  });

  test('the things it says it cannot see, it genuinely cannot read', () => {
    // Named in the ceiling's own words: the job behind the message, what
    // it was quoted at, and whether the workshop has room.
    ['jobs_ops', 'job_margin', 'staffing_capacity', 'customers_contact', 'finance_full', 'quotes']
      .forEach((d) => {
        assert.equal(progression.levelAllowsDomain(1, d), false, `Level 1 claims it cannot see ${d} and can`);
      });
  });

  test('it CAN read the message that came in, or the ceiling is a different lie', () => {
    assert.equal(progression.levelAllowsDomain(1, 'leads'), true);
  });

  test('the owner reads dramatically less at Level 1 than at Level 4', () => {
    const one = contextBuilders.formatDeepFactsBlock('scott_mercer', null, 1);
    const four = contextBuilders.formatDeepFactsBlock('scott_mercer', null, 4);
    const count = (s) => s.split('\n').filter((l) => l.startsWith('- [')).length;
    assert.ok(count(four) > count(one) * 5,
      `Level 1 should be a fraction of Level 4, got ${count(one)} against ${count(four)}`);
  });

  test('an unsupplied level narrows nothing, so every pre-existing caller is unchanged', () => {
    // The public lead form's fire-and-forget draft and the existing tests
    // all call these without a level. If "no level" ever came to mean
    // Level 1, those paths would silently lose the whole company brain.
    const nolevel = contextBuilders.formatDeepFactsBlock('scott_mercer', null);
    const four = contextBuilders.formatDeepFactsBlock('scott_mercer', null, 4);
    assert.equal(nolevel, four);
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
