// Product Guide routing tests. Run with `npm test` (node --test).
//
// computeRecommendation() is pure and deterministic, so every scenario in
// the approved brief's "test the routing against at least 20 realistic
// scenarios" section (Section 26) is exercised directly here, plus the
// three hard invariants the brief calls out by name: urgency never
// increases recommended spend, unclear/sensitive cases can route to the
// £0 conversation, and no external adviser is ever directly recommended.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  QUESTIONS,
  validateAnswers,
  computeRecommendation,
  whyText,
  buildResult
} = require('../lib/productGuide');

// A baseline, fully-valid answer set every scenario overrides from.
function baseAnswers(overrides) {
  return Object.assign({
    whatChange: 'We want to grow revenue without me being stretched so thin every week.',
    sixMonths: 'Feeling a bit more in control of my week.',
    clarity: 'clear',
    priorArrington: 'none',
    businessSize: 'small',
    succession: 'none',
    urgency: 'medium',
    anythingElse: ''
  }, overrides);
}

describe('Product Guide — question set', () => {
  test('has 6-8 questions, a mix of choice and free text', () => {
    assert.ok(QUESTIONS.length >= 6 && QUESTIONS.length <= 8, `expected 6-8 questions, got ${QUESTIONS.length}`);
    const types = new Set(QUESTIONS.map((q) => q.type));
    assert.ok(types.has('choice') && types.has('text'));
  });

  test('exactly one optional question (the final free-text box)', () => {
    const optional = QUESTIONS.filter((q) => !q.required);
    assert.equal(optional.length, 1);
    assert.equal(optional[0].id, 'anythingElse');
  });

  test('business size options match the brief exactly', () => {
    const sizeQ = QUESTIONS.find((q) => q.id === 'businessSize');
    assert.deepEqual(sizeQ.options.map((o) => o.label), ['Just me', '2-10 people', '11-50 people', '50+ people']);
  });
});

describe('Product Guide — validateAnswers', () => {
  test('accepts a fully valid answer set', () => {
    const { valid } = validateAnswers(baseAnswers());
    assert.equal(valid, true);
  });

  test('rejects a choice value that is not a real option (tampered request)', () => {
    const { valid, errors } = validateAnswers(baseAnswers({ clarity: 'definitely_a_500_sale' }));
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.startsWith('clarity')));
  });

  test('rejects a missing required free-text field', () => {
    const { valid, errors } = validateAnswers(baseAnswers({ whatChange: '' }));
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('whatChange')));
  });

  test('accepts an empty optional free-text field', () => {
    const { valid } = validateAnswers(baseAnswers({ anythingElse: '' }));
    assert.equal(valid, true);
  });
});

describe('Product Guide — routing scenarios (brief Section 26)', () => {
  test('1. cold visitor with vague owner pressure -> £0 conversation', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'Not sure, just feels like a lot.',
      clarity: 'unclear'
    }));
    assert.equal(r.recommendationId, 'conversation');
    assert.equal(r.reason, 'insufficient_information');
  });

  test('2. clear website-only requirement -> Website Build', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'Our website is years out of date and does not represent the business any more.',
      sixMonths: 'A modern website that actually helps us win work.',
      clarity: 'clear'
    }));
    assert.equal(r.recommendationId, 'website_build');
    assert.equal(r.reason, 'website_only');
  });

  test('3. website issue plus wider unclear commercial problem -> Commercial Review, website flagged as a later route', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'The website feels outdated, but honestly the whole operation and pricing feels a bit unclear too.',
      clarity: 'multiple'
    }));
    assert.equal(r.recommendationId, 'commercial_review');
    assert.equal(r.reason, 'website_plus_broad_commercial');
    assert.ok(r.laterRouteIds.includes('website_build'));
  });

  test('4. returning Arrington client with a broad commercial issue -> Commercial Review and Implementation', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'We need to sort out our margin and pricing structure properly this time.',
      priorArrington: 'previous'
    }));
    assert.equal(r.recommendationId, 'full_commercial_review');
  });

  test('5. referred client already familiar with Arrington, clear requirement -> bumped recommendation', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'We were referred by a previous client and want help fixing our margin and operations.',
      clarity: 'clear',
      priorArrington: 'referred'
    }));
    assert.equal(r.recommendationId, 'full_commercial_review');
  });

  test('6. obvious £500 Commercial Review fit (no engagement signals) -> Commercial Review', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'Margin has been getting thinner and I am not sure which part of the business is actually the problem.'
    }));
    assert.equal(r.recommendationId, 'commercial_review');
    assert.equal(r.signalCount, 0);
  });

  test('7. obvious broader implementation fit -> Commercial Review and Implementation', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'Our team and processes need real help implementing changes we already know we need across margin and operations.',
      businessSize: 'large'
    }));
    assert.equal(r.recommendationId, 'full_commercial_review');
  });

  test('8. combined review + website fit -> Commercial Review and Website Build', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'We need our margin and operations properly implemented AND our website rebuilt, and we have worked with Arrington before.',
      priorArrington: 'previous',
      businessSize: 'large'
    }));
    assert.equal(r.recommendationId, 'full_review_website_build');
  });

  test('9. uncertain answers -> £0 conversation', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'Hard to say really.',
      clarity: 'unclear'
    }));
    assert.equal(r.recommendationId, 'conversation');
  });

  test('10. contradictory answers (claims clarity, gives no detail) -> £0 conversation', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'Fine.',
      clarity: 'clear'
    }));
    assert.equal(r.recommendationId, 'conversation');
    assert.equal(r.reason, 'insufficient_information');
  });

  test('11. sensitive legal wording -> £0 conversation, never a paid product', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'A supplier is threatening legal action and we may end up in litigation over a contract dispute.'
    }));
    assert.equal(r.recommendationId, 'conversation');
    assert.equal(r.sensitiveTopic, 'legal');
  });

  test('12. tax wording -> £0 conversation', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'We have an HMRC tax investigation ongoing and it is worrying me.'
    }));
    assert.equal(r.recommendationId, 'conversation');
    assert.equal(r.sensitiveTopic, 'tax');
  });

  test('13. insolvency wording -> £0 conversation', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'Cash is so tight I think we might be heading toward insolvency within a couple of months.'
    }));
    assert.equal(r.recommendationId, 'conversation');
    assert.equal(r.sensitiveTopic, 'insolvency');
  });

  test('14. HR/employment wording -> £0 conversation', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'We are dealing with a difficult grievance and possibly an employment tribunal with a member of staff.'
    }));
    assert.equal(r.recommendationId, 'conversation');
    assert.equal(r.sensitiveTopic, 'hr_employment');
  });

  test('15. solo business does not by itself change the recommendation', () => {
    const r = computeRecommendation(baseAnswers({ businessSize: 'solo' }));
    assert.equal(r.recommendationId, 'commercial_review');
  });

  test('16. 2-10 person business does not by itself change the recommendation', () => {
    const r = computeRecommendation(baseAnswers({ businessSize: 'small' }));
    assert.equal(r.recommendationId, 'commercial_review');
  });

  test('17. 11-50 person business does not by itself change the recommendation', () => {
    const r = computeRecommendation(baseAnswers({ businessSize: 'medium' }));
    assert.equal(r.recommendationId, 'commercial_review');
  });

  test('18. 50+ business contributes an engagement signal but is not decisive alone', () => {
    const r = computeRecommendation(baseAnswers({ businessSize: 'large' }));
    assert.equal(r.recommendationId, 'full_commercial_review');
    assert.equal(r.signalCount, 1);
  });

  test('19. owner considering stepping back (long-term) does not distort the recommendation', () => {
    const r = computeRecommendation(baseAnswers({ succession: 'longterm' }));
    assert.equal(r.recommendationId, 'commercial_review');
  });

  test('20. owner actively in a sale/succession process does not by itself distort the recommendation', () => {
    const r = computeRecommendation(baseAnswers({ succession: 'active_progress' }));
    assert.equal(r.recommendationId, 'commercial_review');
  });

  test('21. urgent, low-scope (website-only) problem stays Website Build, not bumped', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'Our website is broken and out of date and we need it rebuilt.',
      urgency: 'high'
    }));
    assert.equal(r.recommendationId, 'website_build');
  });

  test('22. urgent but unclear problem stays £0 conversation, not bumped to a paid product', () => {
    const r = computeRecommendation(baseAnswers({
      whatChange: 'Everything feels urgent and out of control.',
      clarity: 'unclear',
      urgency: 'high'
    }));
    assert.equal(r.recommendationId, 'conversation');
  });
});

describe('Product Guide — hard invariants', () => {
  test('urgency NEVER changes the recommendation, across every scenario shape', () => {
    const shapes = [
      baseAnswers({ whatChange: 'Not sure, just feels like a lot.', clarity: 'unclear' }),
      baseAnswers({ whatChange: 'Our website is out of date and needs rebuilding.' }),
      baseAnswers({ whatChange: 'Margin and pricing need proper attention.', priorArrington: 'previous' }),
      baseAnswers({ whatChange: 'We need margin and website work done together.', priorArrington: 'previous', businessSize: 'large' })
    ];
    for (const shape of shapes) {
      const ids = ['low', 'medium', 'high'].map((urgency) => computeRecommendation(Object.assign({}, shape, { urgency })).recommendationId);
      assert.equal(new Set(ids).size, 1, `recommendation changed across urgency levels for: ${JSON.stringify(shape.whatChange)} -> ${ids.join(', ')}`);
    }
  });

  test('unclear/sensitive/contradictory cases can all route to the £0 conversation', () => {
    const unclear = computeRecommendation(baseAnswers({ whatChange: 'Hard to say.', clarity: 'unclear' }));
    const sensitive = computeRecommendation(baseAnswers({ whatChange: 'We are facing a possible tribunal over a redundancy dispute.' }));
    const contradictory = computeRecommendation(baseAnswers({ whatChange: 'Yep.', clarity: 'clear' }));
    assert.equal(unclear.recommendationId, 'conversation');
    assert.equal(sensitive.recommendationId, 'conversation');
    assert.equal(contradictory.recommendationId, 'conversation');
  });

  test('no explanation text ever recommends an external professional', () => {
    const bannedTerms = /\b(accountant|solicitor|insolvency practitioner|financial advis[eo]r|hr advis[eo]r|lawyer)\b/i;
    for (const reason of ['sensitive_topic', 'insufficient_information', 'website_only', 'website_only_with_engagement_signal', 'broad_commercial', 'broad_commercial_with_engagement_signal', 'website_plus_broad_commercial', 'website_plus_broad_commercial_with_engagement_signal']) {
      assert.doesNotMatch(whyText(reason), bannedTerms, `whyText('${reason}') must never name an external professional`);
    }
  });

  test('one immediate recommendation is always dominant; later routes are always a separate, secondary list', () => {
    const r = buildResult(baseAnswers({
      whatChange: 'We need margin and website work done together.',
      priorArrington: 'previous'
    }));
    assert.ok(r.recommendation);
    assert.ok(Array.isArray(r.laterRoutes));
    assert.ok(!r.laterRoutes.some((route) => route.id === r.recommendation.id), 'the dominant recommendation must never also appear in its own later-routes list');
  });

  test('every recommendation id resolves to a real, currently-purchasable-or-free offer', () => {
    const scenarios = [
      baseAnswers({ whatChange: 'Not sure.', clarity: 'unclear' }),
      baseAnswers({ whatChange: 'Website needs rebuilding.' }),
      baseAnswers({ whatChange: 'Margin needs work.' }),
      baseAnswers({ whatChange: 'Margin needs implementing properly.', priorArrington: 'previous' }),
      baseAnswers({ whatChange: 'Margin and website both need proper work.', priorArrington: 'previous', businessSize: 'large' })
    ];
    for (const s of scenarios) {
      const r = buildResult(s);
      assert.ok(r.recommendation.name, `recommendation for ${JSON.stringify(s.whatChange)} did not resolve to a real offer`);
      assert.ok(typeof r.recommendation.pricePence === 'number');
    }
  });
});
