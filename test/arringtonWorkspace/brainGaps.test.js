const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const gaps = require('../../lib/arringtonWorkspace/brainGaps');

describe('Arrington AI Workspace Brain Gaps', () => {
  test('normalises a material missing-evidence gap without inventing owner data', () => {
    const gap = gaps.normaliseGap({
      subject: 'Drive source not available',
      reason: 'The controlled source cannot be fetched.',
      impact: 'The workspace must not answer as if the record is current.'
    });
    assert.equal(gap.gapType, 'missing');
    assert.equal(gap.responsibleHuman, 'Tom Arrington');
    assert.equal(gap.status, 'open');
  });

  test('rejects empty gap records', () => {
    assert.equal(gaps.normaliseGap({ subject: '', reason: '' }), null);
  });

  test('requires corrected source evidence before a gap can resolve', () => {
    assert.equal(gaps.canResolveGap({ sourceCorrected: false, resolutionEvidence: 'checked Drive' }), false);
    assert.equal(gaps.canResolveGap({ sourceCorrected: true, resolutionEvidence: '' }), false);
    assert.equal(gaps.canResolveGap({ sourceCorrected: true, resolutionEvidence: 'Drive document revision verified' }), true);
  });
});
