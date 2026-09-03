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

// Governance finding F5 (30/08/2026): the original version of this test
// used a loose regex that let `instagram_manage_comments` through, and
// that scope grants replying to and deleting comments. The check is now
// the other way round: ANY scope whose name suggests management is a
// failure unless it appears in this list with a reason. Meta's insights
// scope is the one genuine exception, because Meta named its read-only
// Instagram metrics scope `manage` and offers no read-named equivalent.
const JUSTIFIED_MANAGE_SCOPES = {
  instagram_manage_insights: 'Meta naming quirk: read-only access to Instagram professional metrics. There is no instagram_read_insights. It confers no publish, reply or delete capability.'
};

test('no connector declares a write or publish scope: least privilege on the token itself', () => {
  registry.PLATFORM_IDS.forEach((p) => {
    registry.PLATFORMS[p].readScopes.forEach((scope) => {
      // `w_` is anchored to the start. LinkedIn's write scopes are
      // w_organization_social and friends, so the prefix is the signal.
      // Unanchored it matched any scope containing "w_" anywhere, which
      // on 03/09/2026 rejected pages_show_list for the "w_" inside
      // "show_list" - a read scope failing a write test on a substring
      // of an English word.
      assert.doesNotMatch(scope, /publish|write|^w_|\.write\b/,
        `${p} declares ${scope}, which grants more than reading`);
      if (/manage|modify|delete|comment/i.test(scope)) {
        assert.ok(JUSTIFIED_MANAGE_SCOPES[scope],
          `${p} declares ${scope}, which reads as more than reading and carries no recorded justification`);
      }
    });
  });
});

test('the write-scope pattern still catches a real write scope, and does not catch a read one', () => {
  // Pins the fix above in both directions. A pattern loosened to clear a
  // false positive is worth nothing unless it still rejects the thing it
  // was written for.
  const writeShaped = ['w_organization_social', 'w_member_social', 'pages_publish_content', 'user.write'];
  const readShaped = ['pages_show_list', 'pages_read_engagement', 'read_insights', 'tweet.read'];
  const pattern = /publish|write|^w_|\.write\b/;
  for (const scope of writeShaped) {
    assert.match(scope, pattern, `${scope} is a write scope and would now pass the check`);
  }
  for (const scope of readShaped) {
    assert.doesNotMatch(scope, pattern, `${scope} is a read scope and is being rejected`);
  }
});

test('mutation scopes are declared apart from read scopes, and Facebook is the only platform holding any', () => {
  // The structural point of the split: readScopes is what the
  // least-privilege test guards, and it must not quietly grow write
  // scopes. Holding a mutation scope is not permission to use it; see
  // lib/workspace/social/mutations.js for what actually gates that.
  for (const id of registry.PLATFORM_IDS) {
    const p = registry.PLATFORMS[id];
    assert.ok(Array.isArray(p.mutationScopes), `${id} does not declare mutationScopes, even as an empty list`);
    for (const scope of p.readScopes) {
      assert.ok(!p.mutationScopes.includes(scope), `${id} lists ${scope} as both a read and a mutation scope`);
    }
  }
  assert.deepEqual(registry.PLATFORMS.instagram.mutationScopes, [], 'Instagram is configured for reading only');
  assert.deepEqual(registry.PLATFORMS.linkedin.mutationScopes, []);
  assert.deepEqual(registry.PLATFORMS.x.mutationScopes, []);
  assert.deepEqual(
    registry.PLATFORMS.facebook.mutationScopes,
    ['pages_manage_posts', 'pages_manage_engagement', 'pages_manage_metadata'],
    'the Facebook mutation scopes should match the Meta app exactly, no more'
  );
});

test('every justified exception is actually in use, so the list cannot become a standing permission to add more', () => {
  const inUse = new Set(registry.PLATFORM_IDS.flatMap((p) => registry.PLATFORMS[p].readScopes));
  Object.keys(JUSTIFIED_MANAGE_SCOPES).forEach((scope) => {
    assert.ok(inUse.has(scope), `${scope} is justified here but no connector requests it; remove the entry`);
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

// ---------------------------------------------------------------
// The boot status line, added 03/09/2026.
//
// Every other workspace subsystem prints one at boot and this one did
// not, so after four Meta credentials were pasted into Railway there was
// no way to tell from the log whether the container could see them.
// ---------------------------------------------------------------

test('an unconfigured deployment says so for every platform', () => {
  const line = registry.describeSocialStatus({});
  for (const id of registry.PLATFORM_IDS) {
    assert.match(line, new RegExp(`${registry.PLATFORMS[id].name}: not connected`));
  }
});

test('a fully configured platform is reported present, and never claimed to work', () => {
  const line = registry.describeSocialStatus({
    INSTAGRAM_BUSINESS_ACCOUNT_ID: '17841400000000000',
    INSTAGRAM_ACCESS_TOKEN: 'EAAG' + 'x'.repeat(180)
  });
  assert.match(line, /Instagram: credentials present/);
  // The connector layer's own rule: a credential is never presented as a
  // retrieval. A token can be present, well formed and rejected by Meta,
  // so this line must stop short of claiming the connection works.
  assert.match(line, /not yet proven to work/);
  assert.doesNotMatch(line, /Instagram: connected\b/);
});

test('half a credential pair is called incomplete, not connected and not absent', () => {
  // The state most likely to be hit while pasting values in one at a
  // time, and the one where "not connected" would be actively
  // misleading about what is left to do.
  const line = registry.describeSocialStatus({ INSTAGRAM_ACCESS_TOKEN: 'EAAGxxx' });
  assert.match(line, /Instagram: INCOMPLETE, missing INSTAGRAM_BUSINESS_ACCOUNT_ID/);
});

test('an empty or whitespace value counts as absent, matching isConfigured', () => {
  // Placeholder variables are created empty so they can be pasted into.
  // If this line disagreed with isConfigured, the boot log and the page
  // would tell the operator different things.
  const env = { INSTAGRAM_ACCESS_TOKEN: '   ', INSTAGRAM_BUSINESS_ACCOUNT_ID: '' };
  assert.match(registry.describeSocialStatus(env), /Instagram: not connected/);
  assert.equal(registry.isConfigured('instagram', env), false);
});

test('no part of any credential value is printed', () => {
  // The reason this project reports lengths rather than prefixes: a
  // 13-character prefix of a long-prefixed key is several real secret
  // characters, logged on every boot.
  const secret = 'EAAGsuperSecretTokenValue12345';
  const id = '17841400000000000';
  const line = registry.describeSocialStatus({
    INSTAGRAM_ACCESS_TOKEN: secret,
    INSTAGRAM_BUSINESS_ACCOUNT_ID: id
  });
  assert.ok(!line.includes(secret), 'the whole token was printed');
  assert.ok(!line.includes(id), 'the whole account id was printed');
  for (let n = 4; n <= secret.length; n += 1) {
    assert.ok(!line.includes(secret.slice(0, n)), `a ${n}-character prefix of the token was printed`);
  }
  // And it does report the length, which is the thing that tells an
  // empty variable from a real one.
  assert.match(line, new RegExp(`INSTAGRAM_ACCESS_TOKEN ${secret.length} chars`));
});
