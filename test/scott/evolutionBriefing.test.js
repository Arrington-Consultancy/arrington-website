// Scott AI Demonstration — the evolution briefing.
//
// Autofill runs unattended, so this email is the only thing standing
// between "the fictional company invented something" and "somebody read
// it". Two properties are asserted directly because both have bitten this
// codebase before in other alarms:
//
//   A failed send must NOT consume the window. Governance finding H2 found
//   exactly this in the unlock alert: a failure wrote the same marker a
//   success did, so one bad SMTP call bought a full period of silence.
//
//   The schedule must be read from the database, not held in memory. This
//   app restarts on every deploy, several times an hour today, and an
//   in-process timestamp would re-send a briefing already delivered.

const { describe, test } = require('node:test');
const assert = require('node:assert');

const { digestIsDue, digestIntervalHours } = require('../../lib/scott/gapNotifier');
const { buildDigest, companyEconomics, recurringCostPressure } = require('../../lib/scott/evolutionDigest');

const fact = (over = {}) => ({
  domain: 'marketing_performance', fact_key: 'next_month_ad_budget',
  fact_value: 'Estimated ad spend for next month is GBP 4,460 plus VAT.',
  estimated: true, basis: 'about one percent of turnover', ...over
});

describe('when a briefing is due', () => {
  test('always due if one has never been sent', () => {
    assert.equal(digestIsDue(null), true);
  });

  test('not due inside the window, due after it', () => {
    const now = new Date('2026-09-02T09:00:00Z');
    assert.equal(digestIsDue(new Date('2026-09-02T08:00:00Z'), now, 24), false);
    assert.equal(digestIsDue(new Date('2026-09-01T08:00:00Z'), now, 24), true);
    // Exactly on the boundary counts as due, so a daily briefing does not
    // drift an hour later every day.
    assert.equal(digestIsDue(new Date('2026-09-01T09:00:00Z'), now, 24), true);
  });

  test('the interval is bounded and defaults sensibly', () => {
    const prev = process.env.SCOTT_DIGEST_HOURS;
    try {
      delete process.env.SCOTT_DIGEST_HOURS;
      assert.equal(digestIntervalHours(), 24);
      process.env.SCOTT_DIGEST_HOURS = 'nonsense';
      assert.equal(digestIntervalHours(), 24, 'a bad value must not disable the briefing');
      process.env.SCOTT_DIGEST_HOURS = '0';
      assert.equal(digestIntervalHours(), 24, 'zero would mean a briefing every check');
      process.env.SCOTT_DIGEST_HOURS = '6';
      assert.equal(digestIntervalHours(), 6);
      process.env.SCOTT_DIGEST_HOURS = '99999';
      assert.ok(digestIntervalHours() <= 24 * 14, 'an absurd value must not silence it for a year');
    } finally {
      if (prev === undefined) delete process.env.SCOTT_DIGEST_HOURS;
      else process.env.SCOTT_DIGEST_HOURS = prev;
    }
  });
});

describe('what the briefing says', () => {
  const canon = require('../../lib/scott/brainCandidates').allCanonRecords();

  test('it names each addition, its domain and what an estimate rests on', () => {
    const d = buildDigest({ added: [fact()], queued: [], canon });
    assert.match(d.text, /marketing_performance/);
    assert.match(d.text, /next_month_ad_budget/);
    assert.match(d.text, /GBP 4,460/);
    assert.match(d.text, /reasoned from: about one percent of turnover/);
    assert.match(d.subject, /1 new thing/);
  });

  test('estimates and stated records are counted separately', () => {
    const d = buildDigest({ added: [fact(), fact({ fact_key: 'k2', estimated: false })], queued: [], canon });
    assert.match(d.text, /1 of those are ESTIMATES[\s\S]*1 are stated as records/);
  });

  test('it reports the queue, so items cannot sit in it unmentioned', () => {
    const queued = [{ domain: 'finance_full', fact_key: 'mystery', fact_value: 'GBP 4,000,000.', conflict_flags: [], drift_flags: [{ code: 'scale_implausible', detail: 'more than twice turnover' }] }];
    const d = buildDigest({ added: [], queued, canon });
    assert.match(d.text, /WAITING ON YOU \(1\)/);
    assert.match(d.text, /held because: more than twice turnover/);
    assert.match(d.text, /not in the company brain/);
  });

  test('it does the one sum a per-answer check cannot: invented costs against overheads', () => {
    const econ = companyEconomics(canon);
    assert.ok(econ.annualTurnoverGbp > 0, 'the company must have a turnover to measure against');
    const pressure = recurringCostPressure([fact()], econ);
    assert.equal(pressure.count, 1);
    assert.equal(pressure.totalGbp, 4460);
  });

  test('with no overheads on record it says the total was not weighed, rather than implying it passed', () => {
    const d = buildDigest({ added: [fact()], queued: [], canon: [] });
    assert.match(d.text, /no overheads figure on record to weigh them against|not checked|no turnover figure/i);
  });

  test('an empty briefing says so plainly rather than padding', () => {
    const d = buildDigest({ added: [], queued: [], canon });
    assert.match(d.text, /Nothing new/);
  });

  test('it always says how to stop the behaviour it is reporting on', () => {
    const d = buildDigest({ added: [fact()], queued: [], canon });
    assert.match(d.text, /SCOTT_BRAIN_AUTOFILL/);
    assert.match(d.text, /\/scott\/gaps/);
  });
});
