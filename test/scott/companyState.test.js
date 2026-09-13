// Scott AI Demonstration — the company's remembered state.
//
// Two properties are asserted directly rather than inferred, the same pair
// the candidate checks are held to:
//
//   1. Every consistency rule is exercised in BOTH directions. A rule that
//      only ever rejects is satisfied by a function that rejects
//      everything, and a fiction that cannot learn anything is not evolving.
//      So each figure that must be refused is paired with a real figure
//      from the company's own records that must NOT be.
//   2. The economics are DERIVED from the fiction. The tests read them from
//      the brain rather than restating them, so growing the company cannot
//      leave the checks measuring against a business that no longer exists.

const { describe, test } = require('node:test');
const assert = require('node:assert');

const cs = require('../../lib/scott/companyState');
const bc = require('../../lib/scott/brainCandidates');

const CANON = bc.allCanonRecords();
const ECON = cs.companyEconomics(CANON);

const candidate = (over = {}) => ({
  domain: 'finance_full',
  factKey: 'monthly_software_cost',
  factValue: 'Software costs GBP 240 a month.',
  ...over
});

const codes = (flags) => flags.map((f) => f.code);

describe('the economics are read from the fiction, not stated here', () => {
  test('turnover, the latest month and the staff register all come from the records', () => {
    assert.ok(ECON.annualTurnoverGbp > 0, 'a turnover figure must be derivable from the brain');
    assert.ok(ECON.monthlyRevenueGbp > 0, 'the latest month of management accounts must be found');
    assert.ok(ECON.monthlyOverheadsGbp > 0, 'overheads live nested in the monthly accounts and must be found');
    assert.ok(ECON.headcount >= 5, 'the staff register must be counted');
    assert.equal(ECON.headcount, ECON.staffNames.size, 'every counted employee is a named one');
  });

  test('the latest month wins, not the biggest', () => {
    const e = cs.companyEconomics([{
      domain: 'finance_full',
      monthlyManagementAccounts: [
        { month: '2026-01', revenueGbp: 90000, overheadsGbp: 40000 },
        { month: '2026-05', revenueGbp: 20000, overheadsGbp: 10000 }
      ]
    }]);
    assert.equal(e.monthlyRevenueGbp, 20000);
    assert.equal(e.monthlyOverheadsGbp, 10000);
    assert.equal(e.overheadsAsOf, '2026-05');
  });

  test('with nothing on record the figures are zero rather than guessed', () => {
    const e = cs.companyEconomics([]);
    assert.equal(e.annualTurnoverGbp, 0);
    assert.equal(e.monthlyRevenueGbp, 0);
    assert.equal(e.headcount, 0);
  });
});

describe('money that could not be true of this company', () => {
  test('a monthly cost larger than the whole month of revenue is refused', () => {
    const flags = cs.checkConsistency(
      candidate({ factValue: `Software costs GBP ${ECON.monthlyRevenueGbp + 5000} a month.` }), ECON);
    assert.ok(codes(flags).includes('monthly_exceeds_revenue'));
  });

  test('the company\'s own September payroll is NOT refused, though it beats the overhead line', () => {
    // GBP 19,200 against overheads of GBP 18,100: a real figure from 07A.
    // A check measuring monthly costs against overheads would reject the
    // truth, which is why it measures against revenue.
    assert.ok(ECON.monthlyOverheadsGbp < 19200, 'this case only means something while payroll beats overheads');
    const flags = cs.checkConsistency(
      candidate({ factKey: 'monthly_payroll_cost', factValue: 'The monthly payroll is GBP 19,200.' }), ECON);
    assert.deepEqual(codes(flags), []);
  });

  test('a cost named only in the sentence is still weighed, whatever the key says', () => {
    // The regression that was found by correcting a fact over HTTP rather
    // than by reading the rule: a cost filed under a key with no cost word
    // in it was measured against nothing at all.
    const flags = cs.checkConsistency({
      domain: 'yarn_stock',
      factKey: 'cream_reorder_qty',
      factValue: `Cream yarn costs GBP ${ECON.monthlyRevenueGbp + 100000} a month.`
    }, ECON);
    assert.ok(codes(flags).includes('monthly_exceeds_revenue'));
  });

  test('and an ordinary cost named only in the sentence still passes', () => {
    const flags = cs.checkConsistency({
      domain: 'yarn_stock', factKey: 'cream_reorder_qty', factValue: 'Cream yarn costs GBP 210 a month.'
    }, ECON);
    assert.deepEqual(codes(flags), []);
  });

  test('an ordinary monthly subscription passes', () => {
    assert.deepEqual(codes(cs.checkConsistency(candidate(), ECON)), []);
  });

  test('an annual figure larger than the whole year of turnover is refused', () => {
    const flags = cs.checkConsistency(candidate({
      factKey: 'annual_insurance_cost',
      factValue: `Insurance costs GBP ${ECON.annualTurnoverGbp + 10000} a year.`
    }), ECON);
    assert.ok(codes(flags).includes('annual_exceeds_turnover'));
  });

  test('a believable annual cost passes', () => {
    const flags = cs.checkConsistency(candidate({
      factKey: 'annual_insurance_cost', factValue: 'Insurance costs GBP 3,850 a year.'
    }), ECON);
    assert.deepEqual(codes(flags), []);
  });

  test('a monthly figure is not judged against the annual ceiling, or the reverse', () => {
    // The word "a year" is what makes the annual rule apply. Without it a
    // large one-off figure is measured against the month only when the key
    // or the text says monthly, which is the narrow behaviour intended.
    const oneOff = cs.checkConsistency(candidate({
      factKey: 'van_replacement_cost', factValue: 'A replacement van is GBP 28,000.'
    }), ECON);
    assert.deepEqual(codes(oneOff), []);
  });
});

describe('percentages', () => {
  test('over a hundred is refused, in either spelling', () => {
    assert.ok(codes(cs.checkConsistency(candidate({ factValue: 'Margin is 140%.' }), ECON)).includes('percentage_impossible'));
    assert.ok(codes(cs.checkConsistency(candidate({ factValue: 'Margin is 140 per cent.' }), ECON)).includes('percentage_impossible'));
  });

  test('a real margin from the records passes', () => {
    assert.deepEqual(codes(cs.checkConsistency(candidate({ factValue: 'The gross margin target is 50%.' }), ECON)), []);
  });
});

describe('staffing', () => {
  test('a headcount that disagrees with the staff register is refused', () => {
    const flags = cs.checkConsistency({
      domain: 'staffing_capacity', factKey: 'headcount', factValue: `The company employs ${ECON.headcount + 6} people.`
    }, ECON);
    assert.ok(codes(flags).includes('headcount_mismatch'));
  });

  test('the register\'s own number passes, with or without the owner counted', () => {
    [ECON.headcount, ECON.headcount + 1].forEach((n) => {
      const flags = cs.checkConsistency({
        domain: 'staffing_capacity', factKey: 'headcount', factValue: `The company employs ${n} people.`
      }, ECON);
      assert.deepEqual(codes(flags), [], `${n} should be accepted`);
    });
  });

  test('a staffing fact about somebody who does not work here is refused', () => {
    const flags = cs.checkConsistency({
      domain: 'staffing_capacity', factKey: 'holiday_remaining', factValue: 'Brian Dawson has 4 days left.'
    }, ECON);
    assert.ok(codes(flags).includes('staffing_unknown_person'));
  });

  test('the real staff are not flagged', () => {
    [...ECON.staffNames].forEach((name) => {
      const flags = cs.checkConsistency({
        domain: 'staffing_capacity', factKey: 'holiday_remaining', factValue: `${name} has 4 days left.`
      }, ECON);
      assert.deepEqual(codes(flags), [], `${name} is on the register and must not be flagged`);
    });
  });

  test('the owner is known even though he is not an employee row', () => {
    const flags = cs.checkConsistency({
      domain: 'staffing_capacity', factKey: 'cover', factValue: 'Scott Mercer covers the Thursday route.'
    }, ECON);
    assert.deepEqual(codes(flags), []);
  });

  test('an invented person outside the staffing domains is not this check\'s business', () => {
    // A supplier or a customer nobody has heard of is drift, handled in
    // brainCandidates and deliberately not fatal. Only an invented EMPLOYEE
    // contradicts a controlled record.
    const flags = cs.checkConsistency({
      domain: 'finance_full', factKey: 'supplier', factValue: 'Brian Dawson supplies the foam.'
    }, ECON);
    assert.deepEqual(codes(flags), []);
  });
});

describe('money is not mistaken for a count, and a year is not mistaken for anything', () => {
  test('a money figure in a headcount fact does not read as people', () => {
    const flags = cs.checkConsistency({
      domain: 'staffing_capacity', factKey: 'headcount_cost',
      factValue: `The ${ECON.headcount} staff cost GBP 19,200 a month.`
    }, ECON);
    assert.ok(!codes(flags).includes('headcount_mismatch'), 'GBP 19,200 must not read as a headcount');
  });

  test('a year in a headcount fact does not read as people', () => {
    const flags = cs.checkConsistency({
      domain: 'staffing_capacity', factKey: 'headcount',
      factValue: `In 2026 the company employs ${ECON.headcount} people.`
    }, ECON);
    assert.deepEqual(codes(flags), []);
  });
});

describe('a repeated question lands on the fact the company already holds', () => {
  const held = {
    domain: 'finance_full',
    factKey: 'september_turnover_forecast',
    factValue: 'Forecast revenue for September 2026 is GBP 44,000.',
    estimated: true,
    basis: 'the five months of management accounts on file'
  };

  test('the held fact is found by domain and key', () => {
    const found = cs.heldFactFor({ domain: 'finance_full', factKey: 'september_turnover_forecast' }, [held]);
    assert.equal(found, held);
  });

  test('a different key, or a different domain, is not a match', () => {
    assert.equal(cs.heldFactFor({ domain: 'finance_full', factKey: 'october_turnover_forecast' }, [held]), null);
    assert.equal(cs.heldFactFor({ domain: 'yarn_stock', factKey: 'september_turnover_forecast' }, [held]), null);
  });

  test('the earliest match wins, the same direction settlement resolves in', () => {
    const later = { ...held, factValue: 'Something else entirely.' };
    assert.equal(cs.heldFactFor({ domain: 'finance_full', factKey: 'september_turnover_forecast' }, [held, later]), held);
  });

  test('the correction quotes the record and says it is an estimate when it is', () => {
    const note = cs.correctionNote(held);
    assert.match(note, /GBP 44,000/);
    assert.match(note, /estimate/i);
    assert.match(note, /management accounts/);
  });

  test('a filed record is not described as an estimate', () => {
    const note = cs.correctionNote({ ...held, estimated: false, basis: '' });
    assert.match(note, /GBP 44,000/);
    assert.doesNotMatch(note, /estimate/i);
  });

  test('nothing held produces no sentence at all, rather than an empty claim', () => {
    assert.equal(cs.correctionNote(null), '');
    assert.equal(cs.correctionNote({ factValue: '   ' }), '');
  });
});
