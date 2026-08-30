const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const access = require('../../lib/arringtonWorkspace/access');

describe('Arrington AI Workspace access', () => {
  const original = process.env.ENABLE_ARRINGTON_AI_WORKSPACE;

  beforeEach(() => {
    process.env.ENABLE_ARRINGTON_AI_WORKSPACE = 'true';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.ENABLE_ARRINGTON_AI_WORKSPACE;
    else process.env.ENABLE_ARRINGTON_AI_WORKSPACE = original;
  });

  test('Tom is the only approved real user in the first staging release', () => {
    assert.equal(access.hasWorkspaceAccess({ username: 'tom', role: 'content' }), true);
    assert.equal(access.hasWorkspaceAccess({ username: 'tom', role: 'admin' }), true);
    assert.equal(access.hasWorkspaceAccess({ username: 'nat', role: 'admin' }), false);
    assert.equal(access.hasWorkspaceAccess({ username: 'client', role: 'client' }), false);
  });

  test('workspace fails closed when the enable flag is absent', () => {
    delete process.env.ENABLE_ARRINGTON_AI_WORKSPACE;
    assert.equal(access.hasWorkspaceAccess({ username: 'tom', role: 'content' }), false);
  });
});
