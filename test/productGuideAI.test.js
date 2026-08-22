// Pure-logic tests for the Product Guide's optional AI summary layer. The
// live Anthropic path needs network access this sandbox does not have (same
// limitation noted in test/whereToStartOffers.test.js), so these tests cover
// the schema validator and the deterministic fallback — the two paths that
// run in every environment without live AI configured, which is the default
// everywhere until Tom explicitly sets ENABLE_LIVE_AI=true.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validateSummarySchema, buildFallbackSummary, summarizeForTom } = require('../lib/productGuideAI');

describe('Product Guide AI — schema validation', () => {
  test('accepts a well-formed summary object', () => {
    const { valid } = validateSummarySchema({ summary: 'They want to grow revenue without being stretched thin.' });
    assert.equal(valid, true);
  });

  test('rejects a missing summary field', () => {
    const { valid, errors } = validateSummarySchema({});
    assert.equal(valid, false);
    assert.ok(errors.length > 0);
  });

  test('rejects an empty summary string', () => {
    const { valid } = validateSummarySchema({ summary: '   ' });
    assert.equal(valid, false);
  });

  test('rejects a non-object (e.g. an array or a bare string)', () => {
    assert.equal(validateSummarySchema(['not an object']).valid, false);
    assert.equal(validateSummarySchema('just a string').valid, false);
    assert.equal(validateSummarySchema(null).valid, false);
  });
});

describe('Product Guide AI — deterministic fallback', () => {
  test('hands Tom the visitor\'s own words, clearly labelled', () => {
    const result = buildFallbackSummary({
      whatChange: 'Grow revenue without me being stretched thin.',
      sixMonths: 'A clearer pricing structure.',
      anythingElse: ''
    });
    assert.match(result.summary, /Grow revenue without me being stretched thin\./);
    assert.match(result.summary, /A clearer pricing structure\./);
  });

  test('includes the optional final free-text answer only when given', () => {
    const withExtra = buildFallbackSummary({ whatChange: 'x', sixMonths: 'y', anythingElse: 'Also worth knowing: staff turnover.' });
    const withoutExtra = buildFallbackSummary({ whatChange: 'x', sixMonths: 'y', anythingElse: '' });
    assert.match(withExtra.summary, /staff turnover/);
    assert.doesNotMatch(withoutExtra.summary, /Anything else/);
  });

  test('the fallback always passes its own schema validator', () => {
    const result = buildFallbackSummary({ whatChange: 'x', sixMonths: 'y', anythingElse: 'z' });
    assert.equal(validateSummarySchema(result).valid, true);
  });
});

describe('Product Guide AI — summarizeForTom mode selection', () => {
  test('defaults to mock mode when ANTHROPIC_API_KEY / ENABLE_LIVE_AI are unset (this sandbox\'s state)', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    const originalFlag = process.env.ENABLE_LIVE_AI;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ENABLE_LIVE_AI;
    try {
      const { mode, data } = await summarizeForTom({ whatChange: 'Grow revenue.', sixMonths: 'Less firefighting.', anythingElse: '' });
      assert.equal(mode, 'mock');
      assert.equal(validateSummarySchema(data).valid, true);
    } finally {
      if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
      if (originalFlag !== undefined) process.env.ENABLE_LIVE_AI = originalFlag;
    }
  });

  test('stays in mock mode when ENABLE_LIVE_AI is not exactly "true", even with a key present', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    const originalFlag = process.env.ENABLE_LIVE_AI;
    process.env.ANTHROPIC_API_KEY = 'sk-test-not-a-real-key';
    process.env.ENABLE_LIVE_AI = 'false';
    try {
      const { mode } = await summarizeForTom({ whatChange: 'x', sixMonths: 'y', anythingElse: '' });
      assert.equal(mode, 'mock');
    } finally {
      if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey; else delete process.env.ANTHROPIC_API_KEY;
      if (originalFlag !== undefined) process.env.ENABLE_LIVE_AI = originalFlag; else delete process.env.ENABLE_LIVE_AI;
    }
  });
});
