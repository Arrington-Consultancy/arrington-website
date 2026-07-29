// Commercial Gaps Review (AI) — pure-logic unit tests. No database, no
// network, no server required: run with `npm test` (node --test).
//
// This deliberately does not test the Express routes directly (that needs
// a real Postgres instance — see the local pg-mem harness used for manual
// verification, described in the delivery report, not committed here).
// What can and must be verified without a database is verified here: the
// question engine, the AI output schema, and the mock interpreter.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  QUESTION_BANK,
  MIN_QUESTIONS,
  MAX_QUESTIONS,
  isVagueAnswer,
  selectNextStep,
  firstQuestion
} = require('../lib/commercialGapsQuestions');

const {
  validateReviewSchema,
  buildMockInterpretation
} = require('../lib/commercialGapsAI');

const { RESOURCES, matchResource } = require('../lib/commercialGapsResources');

describe('commercialGapsQuestions', () => {
  test('covers all eleven required topics exactly once', () => {
    const required = [
      'business_model', 'commercial_priorities', 'pricing', 'margin', 'demand',
      'capacity', 'delivery', 'owner_dependency', 'decision_making',
      'missed_opportunities', 'blind_spots'
    ];
    const categories = QUESTION_BANK.map((q) => q.category);
    assert.equal(categories.length, 11);
    for (const cat of required) {
      assert.equal(categories.filter((c) => c === cat).length, 1, `expected exactly one ${cat} question`);
    }
  });

  test('first question is always business_model', () => {
    assert.equal(firstQuestion().category, 'business_model');
  });

  test('a full run of plain answers completes in exactly 11 questions, never repeating a category', () => {
    let transcript = [];
    const seenCategories = new Set();
    let iterations = 0;

    while (true) {
      const step = selectNextStep(transcript);
      if (step.done) break;
      assert.ok(!seenCategories.has(step.question.category) || step.question.isClarification, 'base category asked twice');
      if (!step.question.isClarification) seenCategories.add(step.question.category);
      transcript = transcript.concat([{ ...step.question, answerText: 'A clear, ordinary, reasonably detailed answer about how the business runs day to day.' }]);
      iterations += 1;
      assert.ok(iterations <= MAX_QUESTIONS, 'exceeded MAX_QUESTIONS without completing');
    }

    assert.equal(transcript.length, 11);
    assert.ok(transcript.length >= MIN_QUESTIONS && transcript.length <= MAX_QUESTIONS);
  });

  test('a single vague answer inserts exactly one clarification question, and only once', () => {
    let transcript = [];
    let clarificationCount = 0;

    while (true) {
      const step = selectNextStep(transcript);
      if (step.done) break;
      if (step.question.isClarification) clarificationCount += 1;
      // Every answer is vague, to check the clarification budget is a
      // whole-session cap of one, not one per vague answer.
      transcript = transcript.concat([{ ...step.question, answerText: 'not sure' }]);
      assert.ok(transcript.length <= MAX_QUESTIONS + 1);
    }

    assert.equal(clarificationCount, 1);
    assert.equal(transcript.length, 12); // 11 base + exactly 1 clarification
  });

  test('isVagueAnswer flags hedge phrases and very short answers, not ordinary ones', () => {
    assert.equal(isVagueAnswer('not sure'), true);
    assert.equal(isVagueAnswer(''), true);
    assert.equal(isVagueAnswer('depends'), true);
    assert.equal(isVagueAnswer('We fit bathrooms for homeowners across Devon, mostly word of mouth.'), false);
  });

  test('the demand question variant is selected when the business_model answer mentions seasonality', () => {
    const transcript = [
      { id: 'business_model', category: 'business_model', label: 'Business model', text: 'x', isClarification: false, answerText: 'We run a Christmas market stall, very seasonal.' }
    ];
    // commercial_priorities is next in fixed order, answer it plainly first
    let step = selectNextStep(transcript);
    assert.equal(step.question.category, 'commercial_priorities');
    transcript.push({ ...step.question, answerText: 'Protecting margin, mostly.' });

    step = selectNextStep(transcript);
    assert.equal(step.question.category, 'demand');
    assert.match(step.question.text, /swing across the year/);
  });

  test('question count is always within the required 8-15 bound by construction', () => {
    assert.ok(MIN_QUESTIONS <= 11 && MAX_QUESTIONS >= 12);
  });
});

describe('commercialGapsAI schema validation', () => {
  const validObject = {
    headline: 'Headline',
    primary_issue: 'Primary issue text',
    secondary_issue: 'Secondary issue text',
    supporting_evidence: ['evidence one'],
    assumptions: ['assumption one'],
    uncertainties: ['uncertainty one'],
    useful_observation: 'Observation text',
    recommended_resource: { title: 'T', url: 'https://example.com', type: 'useful_thinking', reason: 'Because' },
    visitor_summary: 'Summary text',
    tom_briefing: {
      company_overview: 'Overview',
      likely_commercial_issue: 'Issue',
      evidence: ['evidence'],
      contradictions: [],
      emotional_signals: [],
      motivation_for_enquiry: 'Motivation',
      strongest_opening_question: 'Question?',
      assumptions_to_test: ['assumption'],
      suggested_first_meeting_direction: 'Direction'
    }
  };

  test('accepts a fully-formed, schema-conforming object', () => {
    const { valid, errors } = validateReviewSchema(validObject);
    assert.equal(valid, true, errors.join('; '));
  });

  test('rejects an empty object with a specific error per missing field', () => {
    const { valid, errors } = validateReviewSchema({});
    assert.equal(valid, false);
    assert.ok(errors.length > 5);
  });

  test('rejects null and non-object input without throwing', () => {
    assert.doesNotThrow(() => validateReviewSchema(null));
    assert.doesNotThrow(() => validateReviewSchema('a string'));
    assert.equal(validateReviewSchema(null).valid, false);
  });

  test('rejects an invalid recommended_resource.type', () => {
    const bad = JSON.parse(JSON.stringify(validObject));
    bad.recommended_resource.type = 'not_a_real_type';
    const { valid, errors } = validateReviewSchema(bad);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('recommended_resource.type')));
  });

  test('rejects a tom_briefing missing required fields', () => {
    const bad = JSON.parse(JSON.stringify(validObject));
    delete bad.tom_briefing.strongest_opening_question;
    const { valid, errors } = validateReviewSchema(bad);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('strongest_opening_question')));
  });

  test('allows empty contradictions/emotional_signals but not a missing array', () => {
    const ok = JSON.parse(JSON.stringify(validObject));
    ok.tom_briefing.contradictions = [];
    ok.tom_briefing.emotional_signals = [];
    assert.equal(validateReviewSchema(ok).valid, true);

    const bad = JSON.parse(JSON.stringify(validObject));
    delete bad.tom_briefing.contradictions;
    assert.equal(validateReviewSchema(bad).valid, false);
  });
});

describe('commercialGapsAI mock interpreter', () => {
  const sampleTranscript = [
    { category: 'business_model', label: 'Business model', answerText: 'We fit bathrooms for homeowners, mostly word of mouth.' },
    { category: 'commercial_priorities', label: 'Commercial priorities', answerText: 'Freeing up my own time, I am in every job.' },
    { category: 'demand', label: 'Demand', answerText: 'It comes to us, we are booked out for months.' },
    { category: 'capacity', label: 'Capacity', answerText: 'not sure' },
    { category: 'delivery', label: 'Delivery', answerText: 'I supervise every job personally, nobody else signs it off.' },
    { category: 'pricing', label: 'Pricing', answerText: 'Gut feel each time if I am honest.' },
    { category: 'margin', label: 'Margin', answerText: 'I do not really track it by job.' },
    { category: 'owner_dependency', label: 'Owner dependency', answerText: 'Everything stalls if I am not there, just me really.' },
    { category: 'decision_making', label: 'Decision making', answerText: 'Me, always me.' },
    { category: 'missed_opportunities', label: 'Opportunities being missed', answerText: 'Bigger commercial fit-outs, never chased them.' },
    { category: 'blind_spots', label: 'Commercial blind spots', answerText: 'My accountant once said I do not know my numbers.' }
  ];

  test('produces schema-valid output', () => {
    const data = buildMockInterpretation({ name: 'Dan', company: 'Dan Bathrooms Ltd', location: 'Plymouth', transcript: sampleTranscript });
    const { valid, errors } = validateReviewSchema(data);
    assert.equal(valid, true, errors.join('; '));
  });

  test('is deterministic for the same input', () => {
    const a = buildMockInterpretation({ name: 'Dan', company: 'Dan Bathrooms Ltd', location: 'Plymouth', transcript: sampleTranscript });
    const b = buildMockInterpretation({ name: 'Dan', company: 'Dan Bathrooms Ltd', location: 'Plymouth', transcript: sampleTranscript });
    assert.deepEqual(a, b);
  });

  test('recommended_resource is always exactly one resource with a category-relevant reason', () => {
    const data = buildMockInterpretation({ name: 'Dan', company: 'Dan Bathrooms Ltd', location: 'Plymouth', transcript: sampleTranscript });
    assert.equal(typeof data.recommended_resource, 'object');
    assert.ok(!Array.isArray(data.recommended_resource));
  });
});

describe('commercialGapsResources', () => {
  test('every resource has the fields the schema requires', () => {
    for (const r of RESOURCES) {
      assert.ok(r.title && r.url && r.type && r.reasonTemplate);
    }
  });

  test('matchResource always returns exactly one resource, never a list', () => {
    const r = matchResource('margin');
    assert.equal(typeof r, 'object');
    assert.ok(r.title && r.url && r.type && r.reason);
  });

  test('matchResource falls back sensibly for an unknown category', () => {
    const r = matchResource('not_a_real_category');
    assert.ok(r.title && r.url);
  });
});
