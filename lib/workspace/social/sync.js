// Arrington AI Workspace: social retrieval.
//
// Added 03/09/2026 alongside metaClient.js. Modelled on
// lib/workspace/finance/sync.js, which had the same job and already
// solved the same honesty problem: a connector must record what it
// actually managed to do, and an interface must never present a
// credential as a retrieval.
//
// The rules this file exists to keep:
//
//  1. Every attempt is recorded, including the ones that fail. A sync
//     run row is opened before the first request and closed on every
//     path, so "nothing happened" and "something failed silently" can
//     never look the same.
//  2. A partial retrieval is reported as partial, not as success. The
//     profile can arrive while the posts call fails; saying 'ok' there
//     would date-stamp data that was never refreshed.
//  3. A failure outranks the previous success. That rule lives in
//     repo.connectorFreshness and this file feeds it honestly rather
//     than leaving last_sync_outcome on 'ok' after a failed attempt.
//  4. No secret reaches the database. Errors pass through
//     metaClient.redactSecrets before being stored, because last_error
//     is rendered on the page.
//  5. Nothing is written to any platform. This module calls read
//     functions only; there are no others to call.

const meta = require('./metaClient');
const repo = require('./repo');
const { isConfigured, PLATFORMS } = require('./registry');

const POST_LIMIT = 25;
// Comments are fetched for the most recent posts only. A page with
// years of history would otherwise make one "Sync now" into hundreds of
// requests, and the outstanding-replies list is about what is live.
const COMMENT_POSTS = 5;

function credentials(platform, env) {
  const names = PLATFORMS[platform].credentialEnv;
  return names.map((n) => String(env[n] || '').trim());
}

// Runs one platform's retrieval. Never throws: the outcome is the
// return value, because a caller that has to catch in order to record
// an outcome eventually forgets to.
async function syncPlatform(platform, env = process.env) {
  if (!PLATFORMS[platform]) {
    return { platform, outcome: 'failed', itemsWritten: 0, detail: 'unknown platform' };
  }
  if (!isConfigured(platform, env)) {
    // Not an error and not recorded as a failed attempt: nothing was
    // attempted. A missing credential is a normal state for this area.
    return { platform, outcome: 'skipped', itemsWritten: 0, detail: 'no credentials configured' };
  }

  const runId = await repo.startSyncRun(platform);
  const problems = [];
  let itemsWritten = 0;
  let profile = null;

  try {
    profile = platform === 'facebook'
      ? await meta.fetchPageProfile({ pageId: credentials(platform, env)[0], token: credentials(platform, env)[1] })
      : await meta.fetchInstagramProfile({ accountId: credentials(platform, env)[0], token: credentials(platform, env)[1] });
  } catch (err) {
    // The profile call is the one that proves the credential works, so
    // its failure ends the run: continuing would produce a page that
    // looks half-connected for a token that is simply invalid.
    const detail = meta.redactSecrets(err.message, credentials(platform, env));
    await repo.upsertAccount(platform, {
      status: 'error',
      lastSyncAt: new Date(),
      lastSyncOutcome: 'failed',
      lastError: detail.slice(0, 500)
    });
    await repo.finishSyncRun(runId, { outcome: 'failed', itemsWritten: 0, detail: detail.slice(0, 500) });
    return { platform, outcome: 'failed', itemsWritten: 0, detail };
  }

  let posts = [];
  try {
    const [id, token] = credentials(platform, env);
    posts = platform === 'facebook'
      ? await meta.fetchPagePosts({ pageId: id, token, limit: POST_LIMIT })
      : await meta.fetchInstagramMedia({ accountId: id, token, limit: POST_LIMIT });
    for (const post of posts) {
      await repo.upsertPost(platform, post);
      itemsWritten += 1;
    }
  } catch (err) {
    problems.push(`posts: ${meta.redactSecrets(err.message, credentials(platform, env))}`);
  }

  // Account-level insights. Requested after the posts so a metrics
  // failure never costs us the content: read_insights can be present on
  // the app and still refused for a particular Page or metric, and that
  // is a partial retrieval, not a failed one.
  let insights = null;
  try {
    const [id, token] = credentials(platform, env);
    insights = platform === 'facebook'
      ? await meta.fetchPageInsights({ pageId: id, token })
      : await meta.fetchInstagramInsights({ accountId: id, token });
  } catch (err) {
    problems.push(`insights: ${meta.redactSecrets(err.message, credentials(platform, env))}`);
  }

  // Page metadata, Facebook only. Reading it is pages_read_engagement;
  // changing it is a mutation and does not happen here.
  let metadata = null;
  if (platform === 'facebook') {
    try {
      const [id, token] = credentials(platform, env);
      metadata = await meta.fetchPageMetadata({ pageId: id, token });
    } catch (err) {
      problems.push(`metadata: ${meta.redactSecrets(err.message, credentials(platform, env))}`);
    }
  }

  // Facebook comments only. Instagram's are not fetched because the
  // only scope that exposes them also confers moderation, which this
  // connector refuses to hold (governance finding F5). That is a
  // deliberate gap, not an oversight, and it is not reported as a
  // problem with the sync.
  if (platform === 'facebook') {
    const [, token] = credentials(platform, env);
    for (const post of posts.slice(0, COMMENT_POSTS)) {
      try {
        const comments = await meta.fetchPostComments({ postId: post.externalId, token, limit: 25 });
        for (const c of comments) {
          await repo.upsertEngagement(platform, c);
          itemsWritten += 1;
        }
      } catch (err) {
        problems.push(`comments on ${post.externalId}: ${meta.redactSecrets(err.message, credentials(platform, env))}`);
      }
    }
  }

  const outcome = problems.length ? 'partial' : 'ok';
  const insightSummary = insights && Object.keys(insights).length
    ? ` Insights: ${Object.entries(insights).map(([k, v]) => `${k}=${v}`).join(', ')}.`
    : '';
  const detail = problems.length
    ? `${itemsWritten} item(s) retrieved; ${problems.length} problem(s): ${problems.join(' | ')}`
    : `${itemsWritten} item(s) retrieved.${insightSummary}`;

  await repo.upsertAccount(platform, {
    status: 'configured',
    accountRef: profile.accountRef,
    displayName: profile.displayName,
    grantedScopes: PLATFORMS[platform].readScopes,
    connectedAt: new Date(),
    lastSyncAt: new Date(),
    lastSyncOutcome: outcome,
    lastError: problems.length ? detail.slice(0, 500) : '',
    followers: profile.followers
  });
  await repo.finishSyncRun(runId, { outcome, itemsWritten, detail: detail.slice(0, 500) });
  return { platform, outcome, itemsWritten, detail, insights, metadata };
}

// Every configured platform, in order, one result each. Unconfigured
// platforms come back 'skipped' rather than being omitted, so the
// caller can say what happened to all four.
async function syncAll(env = process.env) {
  const results = [];
  for (const platform of ['facebook', 'instagram']) {
    results.push(await syncPlatform(platform, env));
  }
  return results;
}

module.exports = { syncPlatform, syncAll, POST_LIMIT, COMMENT_POSTS };
