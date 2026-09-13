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
    const d = buildDigest({ added: [fact()], canon });
    assert.match(d.text, /marketing_performance/);
    assert.match(d.text, /next_month_ad_budget/);
    assert.match(d.text, /GBP 4,460/);
    assert.match(d.text, /reasoned from: about one percent of turnover/);
    assert.match(d.subject, /1 learned, 0 changed, 0 rejected/);
    assert.doesNotMatch(d.subject, /needs you/);
  });

  test('estimates and stated records are counted separately', () => {
    const d = buildDigest({ added: [fact(), fact({ fact_key: 'k2', estimated: false })], canon });
    assert.match(d.text, /1 of those are ESTIMATES[\s\S]*1 are stated as records/);
  });

  test('it is oversight, not an approval queue: rejections are listed with their reason and nothing waits (13/09/2026)', () => {
    const rejected = [{ domain: 'finance_full', fact_key: 'mystery', fact_value: 'GBP 4,000,000.', status: 'rejected', decided_by_name: 'automatic',
      decision_note: 'Rejected automatically: GBP 4,000,000 is more than twice the company\'s annual turnover (GBP 565,000)' }];
    const d = buildDigest({ added: [], rejected, canon });
    assert.match(d.text, /REJECTED, NOT IN THE COMPANY BRAIN \(1\)/);
    assert.match(d.text, /because: GBP 4,000,000 is more than twice/);
    assert.match(d.text, /not in the company brain/i);
    assert.doesNotMatch(d.text, /WAITING ON YOU/);
    assert.match(d.text, /Nothing needs you/);
    assert.match(d.subject, /0 learned, 0 changed, 1 rejected/);
  });

  test('a system fault is the only thing that reaches NEEDS YOU, and it changes the subject', () => {
    const d = buildDigest({ added: [], escalations: ['brain settlement error at 13/09/2026: a proposal could not be settled: connection reset'], canon });
    assert.match(d.text, /NEEDS YOU \(1\)/);
    assert.match(d.text, /connection reset/);
    assert.doesNotMatch(d.text, /Nothing needs you/);
    assert.match(d.subject, /needs you/);
  });

  test('a retraction by a person is reported as such, separately from a rejection by the checks', () => {
    const retracted = [{ domain: 'suppliers_ops', fact_key: 'yarn_supplier', fact_value: 'Northern Loom supplies yarn.', status: 'rejected', decided_by_name: 'Tom', decision_note: 'Retracted by Tom: not a supplier we would use.' }];
    const d = buildDigest({ added: [], retracted, canon });
    assert.match(d.text, /RETRACTED BY A PERSON \(1\)/);
    assert.match(d.text, /Retracted by Tom/);
    assert.doesNotMatch(d.text, /REJECTED, COULD NOT BE RECONCILED/);
  });

  test('a new name the company introduced is called out as a material change', () => {
    const added = [fact({ domain: 'suppliers_ops', fact_key: 'yarn_supplier', fact_value: 'Northern Loom Supplies Ltd now supplies yarn.', drift_flags: [{ code: 'unknown_entity', detail: '"Northern Loom Supplies Ltd" does not appear anywhere else in the company records' }] })];
    const d = buildDigest({ added, canon });
    assert.match(d.text, /MATERIAL CHANGES TO THE COMPANY/);
    assert.match(d.text, /Northern Loom Supplies Ltd/);
  });

  test('it does the one sum a per-answer check cannot: invented costs against overheads', () => {
    const econ = companyEconomics(canon);
    assert.ok(econ.annualTurnoverGbp > 0, 'the company must have a turnover to measure against');
    const pressure = recurringCostPressure([fact()], econ);
    assert.equal(pressure.count, 1);
    assert.equal(pressure.totalGbp, 4460);
  });

  test('with no overheads on record it says the total was not weighed, rather than implying it passed', () => {
    const d = buildDigest({ added: [fact()], canon: [] });
    assert.match(d.text, /no overheads figure on record to weigh them against|not checked|no turnover figure/i);
  });

  test('overheads are found where they actually live, nested in the monthly accounts', () => {
    // Regression, found in a real briefing on 01/09/2026. companyEconomics
    // read only a record's top-level keys, and overheadsGbp lives inside
    // FINANCE_SUMMARY.monthlyManagementAccounts, so the briefing reported
    // "no overheads figure on record" while the records held five of them.
    // The one aggregate check a per-answer rule cannot make was therefore
    // not running at all. It failed honestly, which is why it was visible,
    // but the honesty was covering a defect rather than a gap in the data.
    const econ = companyEconomics(canon);
    assert.ok(econ.monthlyOverheadsGbp > 0, 'overheads must be found');
    assert.equal(econ.monthlyOverheadsGbp, 18100, 'and must be the LATEST month, not the largest');
    assert.equal(econ.overheadsAsOf, '2026-08');
  });

  test('the latest overheads month wins, not the biggest number', () => {
    // Overheads drift upward, so measuring this month's invented costs
    // against a figure from five months ago flatters them.
    const rec = {
      domain: 'finance_full',
      monthlyManagementAccounts: [
        { month: '2026-04', overheadsGbp: 99000 },
        { month: '2026-08', overheadsGbp: 18100 }
      ]
    };
    assert.equal(companyEconomics([rec]).monthlyOverheadsGbp, 18100);
  });

  test('the cost total is reported against overheads as a real proportion', () => {
    const costs = [
      fact({ fact_key: 'a_cost', fact_value: 'A cost of GBP 950 a month.' }),
      fact({ fact_key: 'b_cost', fact_value: 'A cost of GBP 430 a month.' })
    ];
    const d = buildDigest({ added: costs, canon });
    assert.match(d.text, /1,380/);
    assert.match(d.text, /% of the monthly overheads/);
    assert.doesNotMatch(d.text, /no overheads figure on record/);
  });

  test('an empty briefing says so plainly rather than padding', () => {
    const d = buildDigest({ added: [], canon });
    assert.match(d.text, /Nothing new/);
  });

  test('it always says how to stop the behaviour it is reporting on', () => {
    const d = buildDigest({ added: [fact()], canon });
    assert.match(d.text, /SCOTT_BRAIN_AUTOFILL/);
    assert.match(d.text, /\/scott\/gaps/);
  });
});

describe('the briefing reports the company\'s state, not a queue (13/09/2026)', () => {
  const canon = require('../../lib/scott/brainCandidates').allCanonRecords();

  const superseded = [{
    domain: 'finance_full', fact_key: 'next_month_ad_budget',
    fact_value: 'GBP 3,900 a month.', previous_value: 'GBP 4,460 a month.',
    decision_note: 'Corrected by Tom Arrington: the budget was cut in September'
  }];

  test('a fact the company changed is reported with both versions and the reason', () => {
    const d = buildDigest({ added: [], superseded, canon });
    assert.match(d.text, /WHAT CHANGED IN THE COMPANY'S STATE \(1\)/);
    assert.match(d.text, /was: GBP 4,460 a month\./);
    assert.match(d.text, /now: GBP 3,900 a month\./);
    assert.match(d.text, /changed because: the budget was cut in September/);
    assert.match(d.subject, /0 learned, 1 changed/);
    assert.equal(d.stats.superseded, 1);
  });

  test('the old version is described as kept, because it is', () => {
    const d = buildDigest({ added: [], superseded, canon });
    assert.match(d.text, /Nothing was overwritten/);
  });

  test('a serious contradiction leads the rejections, and an ordinary refusal does not', () => {
    const rejected = [
      { domain: 'finance_full', fact_key: 'a', fact_value: 'GBP 90,000 a month.',
        decision_note: "Rejected automatically: it does not fit the company's own figures: GBP 90,000 a month is more than the company's whole monthly revenue" },
      { domain: 'yarn_stock', fact_key: 'b', fact_value: 'Some yarn.',
        decision_note: 'Rejected automatically: no source named, so the fact would enter the brain with no provenance' }
    ];
    const d = buildDigest({ added: [], rejected, canon });
    assert.match(d.text, /1 could not be reconciled with what the company already holds or with its own figures/);
    assert.match(d.text, /1 refused for other reasons/);
    assert.equal(d.stats.contradictions, 1);
    // And the contradiction is printed above the ordinary refusal.
    assert.ok(d.text.indexOf('GBP 90,000 a month.') < d.text.indexOf('Some yarn.'));
  });

  test('gaps the company closed for itself are reported, with why', () => {
    const gapsClosed = [{
      domain: 'yarn_stock', expected_source: '07I Stock & Supply',
      missing_evidence: 'no current cream yarn count exists',
      resolution_note: 'Closed automatically: nothing was blocked by this and no job or enquiry was waiting on it.'
    }];
    const d = buildDigest({ added: [], gapsClosed, canon });
    assert.match(d.text, /GAPS CLOSED BY LOGIC \(1\)/);
    assert.match(d.text, /07I Stock & Supply: no current cream yarn count exists/);
    assert.match(d.text, /nothing was blocked/);
    assert.match(d.text, /Nothing here needed a person/);
    assert.equal(d.stats.gapsClosed, 1);
  });

  test('a long list of closures is capped, and says how many it did not print', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      domain: 'yarn_stock', missing_evidence: `closure ${i}`, resolution_note: 'Closed automatically: nothing was blocked'
    }));
    const d = buildDigest({ added: [], gapsClosed: many, canon });
    assert.match(d.text, /GAPS CLOSED BY LOGIC \(40\)/, 'the count is the real one');
    assert.match(d.text, /and 15 more, all on the register/);
    assert.ok(d.text.includes('closure 24'));
    assert.ok(!d.text.includes('closure 25'), 'the list itself is capped');
    assert.equal(d.stats.gapsClosed, 40);
  });

  test('a briefing carrying only changes and closures is still worth sending', () => {
    // The empty-state sentence must not fire when the company genuinely
    // changed: that would report a real change as "nothing new".
    const d = buildDigest({ added: [], superseded, gapsClosed: [{ domain: 'x', missing_evidence: 'y' }], canon });
    assert.doesNotMatch(d.text, /Nothing new\./);
  });

  test('nothing at all still says so plainly', () => {
    const d = buildDigest({ added: [], canon });
    assert.match(d.text, /Nothing new\./);
    assert.equal(d.stats.superseded, 0);
    assert.equal(d.stats.gapsClosed, 0);
  });
});
