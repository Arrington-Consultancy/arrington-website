const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { allWorkers, routeQuestion } = require('../../lib/arringtonWorkspace/workers');

describe('Arrington AI Workspace worker routing', () => {
  test('does not create a generic super-worker', () => {
    const ids = allWorkers().map((w) => w.id);
    assert.deepEqual(ids.sort(), [
      'ai_workspace_builder',
      'brain_keeper',
      'governance_assurance',
      'website_hosting'
    ].sort());
  });

  test('routes technical website questions to Website & Hosting', () => {
    assert.equal(routeQuestion('Which Railway deployment is live?').id, 'website_hosting');
  });

  test('routes source questions to the Brain Keeper lane', () => {
    assert.equal(routeQuestion('Is this Drive record stale?').id, 'brain_keeper');
  });

  test('routes approval questions to Governance & Assurance', () => {
    assert.equal(routeQuestion('Does this need a governance gate?').id, 'governance_assurance');
  });
});
