// Arrington AI Workspace: performing an approved external action on Meta.
//
// Built 03/09/2026 on Tom's instruction: the system should be
// "technically capable of the Meta permissions we have configured
// without granting autonomous authority to use them", and "any external
// mutation must remain behind explicit human approval".
//
// WHAT CHANGED, stated plainly, because it inverts something eighteen
// governance reviews built the opposite of. Before today the approval
// queue held records that EXECUTED NOTHING: a person approved a row and
// then did the action themselves on the platform. This module can now
// carry the action out. That is a real expansion of what the workspace
// can do and it is recorded as such rather than slipped in.
//
// WHAT DID NOT CHANGE:
//
//   - No autonomous path reaches this file. Every function requires an
//     approval row id, and it re-reads that row from the database
//     rather than trusting anything the caller says about it. A model
//     cannot approve; the actor 'workspace_ai' is refused explicitly.
//   - actions.js still throws for consequential actions, so the
//     refusal-by-construction rule for autonomous callers is intact and
//     its tests are unchanged.
//   - ENABLE_SOCIAL_MUTATIONS is off by default, so merging this is
//     inert, the same pattern the workspace flag itself uses.
//   - Read scopes are untouched. The write scopes live in their own
//     registry field so the existing test guarding readScopes still
//     guards exactly what it guarded.
//
// Every execution is audited, and an approval can be spent only once.

const meta = require('./metaClient');
const workspaceRepo = require('../repo');
const db = require('../../../db/pool');
const { PLATFORMS } = require('./registry');

class MutationRefused extends Error {
  constructor(message) {
    super(message);
    this.name = 'MutationRefused';
  }
}

function mutationsEnabled(env = process.env) {
  return env.ENABLE_SOCIAL_MUTATIONS === 'true';
}

// The approval is fetched, never accepted from the caller. A caller that
// hands over an id gets whatever the database says about it, which is
// the only version that counts.
async function loadGrantedApproval(approvalId) {
  const id = Number(approvalId);
  if (!Number.isInteger(id) || id <= 0) throw new MutationRefused('a valid approval id is required');
  const { rows } = await db.query('SELECT * FROM workspace_approvals WHERE id = $1', [id]);
  const row = rows[0];
  if (!row) throw new MutationRefused(`approval ${id} does not exist`);
  if (row.status !== 'approved') {
    throw new MutationRefused(`approval ${id} is "${row.status}", so nothing may be done on the platform`);
  }
  if (!row.decided_by || !String(row.decided_by).trim()) {
    throw new MutationRefused(`approval ${id} records no one as having granted it`);
  }
  if (String(row.decided_by).trim() === 'workspace_ai') {
    throw new MutationRefused(`approval ${id} was not granted by a person`);
  }
  return row;
}

// An approval is spent once. Without this, one approved row would be a
// standing licence to repeat an action, which is not what approving it
// meant.
async function assertUnspent(approvalId) {
  const { rows } = await db.query(
    `SELECT 1 FROM workspace_activity WHERE event_type = 'social_mutation_executed' AND subject = $1 LIMIT 1`,
    [`approval:${approvalId}`]
  );
  if (rows.length) throw new MutationRefused(`approval ${approvalId} has already been carried out`);
}

function credentials(platform, env) {
  return PLATFORMS[platform].credentialEnv.map((n) => String(env[n] || '').trim());
}

// The one path to Meta for anything that changes. Everything below goes
// through it, so the gate cannot be bypassed by adding another function.
async function execute({ approvalId, platform, endpoint, path, body, describe, env = process.env }) {
  if (!mutationsEnabled(env)) {
    throw new MutationRefused('social mutations are not enabled in this environment');
  }
  const approval = await loadGrantedApproval(approvalId);
  await assertUnspent(approvalId);
  const [, token] = credentials(platform, env);
  if (!token) throw new MutationRefused(`${platform} has no credentials configured`);

  let result;
  try {
    result = await meta.graphPost(endpoint, path, {
      token,
      body,
      env,
      approval: { approvalId: approval.id, status: approval.status, approvedBy: approval.decided_by }
    });
  } catch (err) {
    const detail = meta.redactSecrets(err.message, [token]);
    await workspaceRepo.addActivity({
      actor: approval.decided_by,
      eventType: 'social_mutation_failed',
      subject: `approval:${approvalId}`,
      summary: `${describe} FAILED on ${platform}: ${detail}`.slice(0, 500)
    });
    throw err;
  }

  await workspaceRepo.addActivity({
    actor: approval.decided_by,
    eventType: 'social_mutation_executed',
    subject: `approval:${approvalId}`,
    summary: `${describe} carried out on ${platform}, approved by ${approval.decided_by}.`.slice(0, 500)
  });
  return { ok: true, approvalId: approval.id, approvedBy: approval.decided_by, result };
}

// ---- The four operations the configured permissions allow -----------

// pages_manage_posts
async function publishPagePost({ approvalId, message, link = '', env = process.env }) {
  const [pageId] = credentials('facebook', env);
  if (!String(message || '').trim()) throw new MutationRefused('a post with no message will not be published');
  return execute({
    approvalId,
    platform: 'facebook',
    endpoint: 'page_publish_post',
    path: `${pageId}/feed`,
    body: link ? { message, link } : { message },
    describe: `Publish a Page post (${String(message).slice(0, 60)}...)`,
    env
  });
}

// pages_manage_engagement
async function replyToComment({ approvalId, commentId, message, env = process.env }) {
  const id = String(commentId || '').trim();
  if (!/^[0-9_]{3,64}$/.test(id)) throw new MutationRefused('comment id is not in the expected form');
  if (!String(message || '').trim()) throw new MutationRefused('an empty reply will not be posted');
  return execute({
    approvalId,
    platform: 'facebook',
    endpoint: 'page_reply_comment',
    path: `${id}/comments`,
    body: { message },
    describe: `Reply to comment ${id}`,
    env
  });
}

// pages_manage_engagement. Hiding is reversible and does not delete
// anyone's words, which is why it is here and deletion is not.
async function hideComment({ approvalId, commentId, hidden = true, env = process.env }) {
  const id = String(commentId || '').trim();
  if (!/^[0-9_]{3,64}$/.test(id)) throw new MutationRefused('comment id is not in the expected form');
  return execute({
    approvalId,
    platform: 'facebook',
    endpoint: 'page_hide_comment',
    path: id,
    body: { is_hidden: hidden ? 'true' : 'false' },
    describe: `${hidden ? 'Hide' : 'Unhide'} comment ${id}`,
    env
  });
}

// pages_manage_metadata
async function updatePageMetadata({ approvalId, fields = {}, env = process.env }) {
  const [pageId] = credentials('facebook', env);
  const allowed = ['about', 'website', 'phone'];
  const body = {};
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) body[k] = v;
  }
  if (!Object.keys(body).length) {
    throw new MutationRefused(`no changeable metadata field was supplied (allowed: ${allowed.join(', ')})`);
  }
  return execute({
    approvalId,
    platform: 'facebook',
    endpoint: 'page_update_metadata',
    path: pageId,
    body,
    describe: `Update Page metadata (${Object.keys(body).join(', ')})`,
    env
  });
}

module.exports = {
  MutationRefused,
  mutationsEnabled,
  loadGrantedApproval,
  publishPagePost,
  replyToComment,
  hideComment,
  updatePageMetadata
};
