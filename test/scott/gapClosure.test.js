// Scott AI Demonstration — closing an evidence gap by logic.
//
// The property that matters most is not that gaps close, it is that each
// one closes for a stated reason and that a gap which is still live stays
// open. So every rule is exercised in both directions, and the last suite
// asserts the two things this module must never do: claim a person
// corrected a source, and touch a gap somebody has already closed.

const { describe, test } = require('node:test');
const assert = require('node:assert');

const gc = require('../../lib/scott/gapClosure');

const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-09-13T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();

function gap(over = {}) {
  return {
    id: 1,
    status: 'open',
    material: true,
    domain: 'yarn_stock',
    missing_evidence: 'no current cream yarn count exists',
    created_at: daysAgo(1),
    ...over
  };
}

function candidate(over = {}) {
  return {
    id: 10,
    gap_id: 1,
    domain: 'yarn_stock',
    fact_key: 'cream_yarn_on_hand',
    fact_value: '24 balls due 2 September, none on hand.',
    status: 'approved',
    decision_note: 'Admitted automatically: nothing it contradicts',
    ...over
  };
}

const decide = (g, candidates = []) => gc.decideGapClosure(g, { candidates, now: NOW });

describe('a gap the company has answered for itself', () => {
  test('an admitted fact closes it as resolved, naming the fact', () => {
    const d = decide(gap(), [candidate()]);
    assert.equal(d.status, 'resolved');
    assert.equal(d.reason, 'filled');
    assert.match(d.note, /yarn_stock\/cream_yarn_on_hand/);
  });

  test('the note says plainly that no person edited the source', () => {
    const d = decide(gap(), [candidate()]);
    assert.match(d.note, /has not been edited by a person/i);
  });

  test('a fact admitted for a DIFFERENT gap does not close this one', () => {
    const d = decide(gap(), [candidate({ gap_id: 99 })]);
    assert.equal(d, null, 'a fresh material gap with no fill of its own stays open');
  });
});

describe('a gap that was never a gap', () => {
  test('a proposal dropped as already held closes it as dismissed', () => {
    const d = decide(gap(), [candidate({ status: 'superseded', decision_note: 'Not added, already held: the company already holds this exact fact' })]);
    assert.equal(d.status, 'dismissed');
    assert.equal(d.reason, 'already_held');
  });

  test('a rejection naming what the company already holds closes it the same way', () => {
    const d = decide(gap(), [candidate({
      status: 'rejected',
      decision_note: 'Rejected automatically: it disagrees with what the company already holds and the earlier fact stands'
    })]);
    assert.equal(d.reason, 'already_held');
  });

  test('a rejection for a different reason does NOT read as already held', () => {
    const d = decide(gap(), [candidate({
      status: 'rejected',
      decision_note: 'Rejected automatically: no source named, so the fact would enter the brain with no provenance'
    })]);
    // The evidence really is missing, so a fresh gap stays open until it
    // goes stale rather than being cleared on the strength of a refusal.
    assert.equal(d, null);
  });
});

describe('a gap that blocks nothing', () => {
  test('closes immediately, because the register is for live blockers', () => {
    const d = decide(gap({ material: false }));
    assert.equal(d.status, 'dismissed');
    assert.equal(d.reason, 'not_material');
  });

  test('a material one on the same day stays open', () => {
    assert.equal(decide(gap({ material: true, created_at: daysAgo(0) })), null);
  });
});

describe('a gap that went unfilled', () => {
  test('closes once the window has passed', () => {
    const d = decide(gap({ created_at: daysAgo(gc.STALE_DAYS + 1) }));
    assert.equal(d.status, 'dismissed');
    assert.equal(d.reason, 'stale');
    assert.match(d.note, /raises a fresh gap/i, 'the note must say the hole is not being hidden');
  });

  test('stays open one day inside the window', () => {
    assert.equal(decide(gap({ created_at: daysAgo(gc.STALE_DAYS - 1) })), null);
  });

  test('a stale gap whose fill was refused says which refusal', () => {
    const d = decide(gap({ created_at: daysAgo(gc.STALE_DAYS + 2) }), [candidate({
      status: 'rejected',
      decision_note: 'Rejected automatically: negative amount GBP -2,000'
    })]);
    assert.equal(d.reason, 'stale');
    assert.match(d.note, /negative amount/);
  });

  test('a created_at the row does not carry is treated as new, not as stale', () => {
    // Failing open is the safe direction: a gap closed because a timestamp
    // was unreadable would be a gap closed for no reason at all.
    assert.equal(decide(gap({ created_at: null })), null);
  });
});

describe('what it never does', () => {
  test('no closure ever claims a source was corrected', () => {
    const every = [
      decide(gap(), [candidate()]),
      decide(gap(), [candidate({ status: 'superseded', decision_note: 'Not added, already held: x' })]),
      decide(gap({ material: false })),
      decide(gap({ created_at: daysAgo(30) }))
    ];
    every.forEach((d) => {
      assert.ok(d, 'all four reasons must produce a closure');
      assert.ok(!('sourceCorrected' in d), 'the decision must not carry a source-corrected claim at all');
      assert.doesNotMatch(d.note, /corrected the (source|record)/i);
    });
    assert.deepEqual(every.map((d) => d.reason), gc.CLOSURE_REASONS,
      'every declared reason is reachable, and in this order');
  });

  test('a gap a person has already closed is left alone', () => {
    ['resolved', 'dismissed'].forEach((status) => {
      assert.equal(decide(gap({ status }), [candidate()]), null, `${status} must not be re-closed`);
    });
  });

  test('it decides nothing about a row that is not a gap', () => {
    assert.equal(decide(null), null);
    assert.equal(decide(undefined), null);
    assert.equal(decide({}), null);
  });
});

describe('the whole register in one pass', () => {
  const gaps = [
    gap({ id: 1 }),
    gap({ id: 2, material: false }),
    gap({ id: 3, created_at: daysAgo(30) }),
    gap({ id: 4, created_at: daysAgo(0) })
  ];
  const plan = gc.planClosures(gaps, { candidates: [candidate({ gap_id: 1 })], now: NOW });

  test('only the gaps that qualify appear, each with its gap id', () => {
    assert.deepEqual(plan.map((p) => p.gapId), [1, 2, 3]);
    assert.deepEqual(plan.map((p) => p.reason), ['filled', 'not_material', 'stale']);
  });

  test('the sentence counts what the plan actually holds', () => {
    const said = gc.describeClosures(plan);
    assert.match(said, /^3 gaps closed/);
    assert.match(said, /answered by something the company learned/);
    assert.match(said, /timed out/);
  });

  test('an empty plan says so rather than counting nothing', () => {
    assert.equal(gc.describeClosures([]), 'No gaps closed.');
  });
});
