// The social control area: four platforms, one page, and a hard line
// between what the workspace may do and what only a person may do.
//
// Tom's SOCIAL MEDIA CONNECTOR REQUIREMENT (30/08/2026) is the source
// of every assertion here. The two that matter most: consequential
// external actions are never performed by this system, and a credential
// is never presented as a successful retrieval.
const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../../lib/workspace/social/registry');
const actions = require('../../lib/workspace/social/actions');
const socialRepo = require('../../lib/workspace/social/repo');

test('all four platforms are present as one control area', () => {
  assert.deepEqual(registry.PLATFORM_IDS, ['facebook', 'instagram', 'linkedin', 'x']);
});

test('no connector may publish, delete, reply publicly, change settings or spend', () => {
  const forbidden = ['publish', 'delete', 'reply_publicly', 'send_message', 'change_account_settings', 'advertising_spend'];
  registry.PLATFORM_IDS.forEach((p) => {
    forbidden.forEach((a) => {
      assert.equal(registry.connectorMayDo(p, a), false, `${p} must not be able to ${a}`);
    });
  });
});

test('read, analyse and draft are permitted, so the useful work is still possible', () => {
  registry.PLATFORM_IDS.forEach((p) => {
    ['read', 'analyse', 'draft'].forEach((a) => assert.equal(registry.connectorMayDo(p, a), true));
  });
});

test('no connector declares a write or publish scope: least privilege on the token itself', () => {
  registry.PLATFORM_IDS.forEach((p) => {
    registry.PLATFORMS[p].readScopes.forEach((scope) => {
      assert.doesNotMatch(scope, /publish|write|manage_posts|w_/,
        `${p} declares ${scope}, which grants more than reading`);
    });
  });
});

test('a consequential action throws rather than returning false, so a forgotten check still cannot proceed', () => {
  assert.throws(() => actions.assertAutonomousAllowed('linkedin', 'publish'), actions.ConsequentialActionError);
  assert.throws(() => actions.assertAutonomousAllowed('x', 'advertising_spend'), /consequential external action/);
  assert.equal(actions.assertAutonomousAllowed('facebook', 'draft'), true);
});

test('the social module exposes no function that performs an external action', () => {
  const surface = [...Object.keys(registry), ...Object.keys(actions), ...Object.keys(socialRepo)];
  const performing = surface.filter((k) => /^(publish|post|send|delete|reply|spend|boost)/i.test(k));
  assert.deepEqual(performing, [], `these look like they perform external actions: ${performing.join(', ')}`);
  // The only reply-shaped function records that a HUMAN replied.
  assert.equal(typeof socialRepo.recordHumanReply, 'function');
});

test('an unconfigured platform is not configured, whatever else is in the environment', () => {
  assert.equal(registry.isConfigured('facebook', {}), false);
  assert.equal(registry.isConfigured('facebook', { FACEBOOK_PAGE_ID: '123' }), false, 'a partial credential is not a credential');
  assert.equal(registry.isConfigured('facebook', { FACEBOOK_PAGE_ID: '123', FACEBOOK_PAGE_ACCESS_TOKEN: 'tok' }), true);
  assert.equal(registry.isConfigured('facebook', { FACEBOOK_PAGE_ID: '123', FACEBOOK_PAGE_ACCESS_TOKEN: '   ' }), false);
});

test('a credential is never presented as a successful retrieval', () => {
  const now = new Date('2026-08-30T12:00:00Z');
  // Configured, token present, but nothing has ever come back.
  assert.equal(socialRepo.connectorFreshness(null, true, now).state, 'never_retrieved');
  assert.equal(socialRepo.connectorFreshness({ last_sync_outcome: 'never', last_sync_at: null }, true, now).state, 'never_retrieved');
  // A failed attempt outranks the date of the last good one.
  const failed = { last_sync_outcome: 'failed', last_sync_at: new Date(now - 3600000), stale_after_hours: 24 };
  assert.equal(socialRepo.connectorFreshness(failed, true, now).state, 'sync_failed');
  // Not configured at all is its own state, never "fresh" and never "stale".
  assert.equal(socialRepo.connectorFreshness(null, false, now).state, 'not_connected');
  // Only a genuine recent success is fresh.
  const ok = { last_sync_outcome: 'ok', last_sync_at: new Date(now - 3600000), stale_after_hours: 24 };
  assert.equal(socialRepo.connectorFreshness(ok, true, now).state, 'fresh');
  const old = { last_sync_outcome: 'ok', last_sync_at: new Date(now - 48 * 3600000), stale_after_hours: 24 };
  assert.equal(socialRepo.connectorFreshness(old, true, now).state, 'stale');
});

test('platform capability is declared, so the page never claims "no messages" for an API that has none', () => {
  assert.deepEqual(registry.platformsSupporting('messages'), ['facebook']);
  assert.deepEqual(registry.platformsSupporting('posts'), ['facebook', 'instagram', 'linkedin', 'x']);
});

test('queuing a consequential action records it and executes nothing', async () => {
  const created = [];
  const activity = [];
  const repo = require('../../lib/workspace/repo');
  const origCreate = repo.createApproval;
  const origActivity = repo.addActivity;
  repo.createApproval = async (a) => { created.push(a); return { id: 42, ...a }; };
  repo.addActivity = async (a) => { activity.push(a); };
  try {
    const approval = await actions.requestHumanAction({
      platform: 'linkedin', action: 'publish', summary: 'the draft about margin', requestedBy: 'tom'
    });
    assert.equal(approval.id, 42);
    assert.equal(created[0].actionClass, 4, 'class 4 and above are not executed by the workspace');
    assert.match(created[0].detail, /performed by a person/);
    assert.equal(activity[0].eventType, 'social_action_queued');
  } finally {
    repo.createApproval = origCreate;
    repo.addActivity = origActivity;
  }
});
