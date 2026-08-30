// Arrington AI Workspace — routes.
//
// Same mountPageRoute pattern as Scott / Market Ready Test / Product
// Guide: GET page routes register directly on `app` ahead of the generic
// /:slug CMS catch-all, POST/API routes live on `router` behind the
// site's global CSRF middleware. Every route is gated by
// requireWorkspacePageAccess / requireWorkspaceApiAccess
// (lib/workspace/access.js): the site's one real auth system plus the
// workspace clearance map. Real access is Tom only; everyone else gets
// a 404 that does not admit the area exists.
//
// Permission discipline on every read surface: rows come raw from
// lib/workspace/repo.js and are filtered through
// filterRecordsForClearance BEFORE they are counted, searched, rendered
// or handed to the orchestrator. No count or empty-state on any page is
// computed before filtering.

const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const repo = require('../lib/workspace/repo');
const { filterRecordsForClearance, clearanceCanSeeRecord, clearanceCanSeeSensitivity, CLEARANCES } = require('../lib/workspace/clearance');
const { LANES, SOURCE_CLASSES, laneById } = require('../lib/workspace/lanes');
const { requireWorkspacePageAccess, requireWorkspaceApiAccess, workspaceNoindex } = require('../lib/workspace/access');
const { askWorkspace, isWorkspaceAIEnabled, routeToLane } = require('../lib/workspace/orchestrator');
const socialRepo = require('../lib/workspace/social/repo');
const socialActions = require('../lib/workspace/social/actions');

const router = express.Router();

const askLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => (req.session && req.session.user ? `u:${req.session.user.id}` : ipKeyGenerator(req)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again shortly.' }
});

function viewer(req) {
  return {
    username: req.session.user.username,
    clearance: req.workspaceClearance,
    clearanceLabel: CLEARANCES[req.workspaceClearance].label
  };
}

async function navCounts(clearanceId) {
  const [gaps, approvals] = await Promise.all([
    repo.listGaps({ status: 'open' }),
    repo.listApprovals({ status: 'open' })
  ]);
  // Counts are computed AFTER clearance filtering, so their size leaks
  // nothing about withheld rows.
  const visibleGaps = gaps.filter((g) => clearanceCanSeeSensitivity(clearanceId, g.sensitivity));
  const visibleApprovals = approvals.filter((a) => clearanceCanSeeSensitivity(clearanceId, a.sensitivity));
  return { openGaps: visibleGaps.length, openApprovals: visibleApprovals.length };
}

function withFreshness(records) {
  return records.map((r) => ({ ...r, freshness: repo.recordFreshness(r) }));
}

function mountPageRoute(app, generateCsrfToken) {
  const page = (path, handler) => {
    app.get(path, workspaceNoindex, requireWorkspacePageAccess, async (req, res, next) => {
      try { await handler(req, res); } catch (err) { next(err); }
    });
  };

  page('/workspace', async (req, res) => {
    const clearanceId = req.workspaceClearance;
    const [allRecords, gaps, approvals, syncRun, activity] = await Promise.all([
      repo.listRecords(),
      repo.listGaps({ status: 'open' }),
      repo.listApprovals({ status: 'open' }),
      repo.latestSyncRun(),
      repo.listActivity(8)
    ]);
    const records = withFreshness(filterRecordsForClearance(clearanceId, allRecords));
    const attention = [];
    records.filter((r) => r.freshness.state === 'stale').forEach((r) => attention.push({ kind: 'stale', text: `${r.title} is stale (last synced ${r.freshness.ageDays} days ago).` }));
    records.filter((r) => r.freshness.state === 'sync_failed').forEach((r) => attention.push({ kind: 'sync_failed', text: `${r.title}: the last sync FAILED; the content shown may be out of date.` }));
    const visibleGaps = gaps.filter((g) => clearanceCanSeeSensitivity(clearanceId, g.sensitivity));
    visibleGaps.filter((g) => g.material).forEach((g) => attention.push({ kind: 'gap', text: `Material brain gap: ${g.description.slice(0, 160)}` }));
    res.render('workspace/today', {
      ...viewer(req),
      counts: await navCounts(clearanceId),
      recordCount: records.length,
      attention,
      openGaps: visibleGaps,
      openApprovals: approvals.filter((a) => clearanceCanSeeSensitivity(clearanceId, a.sensitivity)),
      syncRun,
      activity,
      aiEnabled: isWorkspaceAIEnabled(),
      csrfToken: generateCsrfToken(req, res)
    });
  });

  page('/workspace/brain', async (req, res) => {
    const clearanceId = req.workspaceClearance;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    const raw = q ? await repo.searchRecords(q) : await repo.listRecords();
    const records = withFreshness(filterRecordsForClearance(clearanceId, raw));
    res.render('workspace/brain', {
      ...viewer(req),
      counts: await navCounts(clearanceId),
      records,
      q,
      sourceClasses: SOURCE_CLASSES,
      csrfToken: generateCsrfToken(req, res)
    });
  });

  const classPage = (path, sourceClass, view, title) => page(path, async (req, res) => {
    const clearanceId = req.workspaceClearance;
    const raw = await repo.listRecords({ sourceClass });
    const records = withFreshness(filterRecordsForClearance(clearanceId, raw));
    res.render(view, {
      ...viewer(req),
      counts: await navCounts(clearanceId),
      records,
      pageTitle: title,
      csrfToken: generateCsrfToken(req, res)
    });
  });
  classPage('/workspace/opportunities', 'opportunity', 'workspace/records', 'Opportunities & pipeline');
  classPage('/workspace/projects', 'project', 'workspace/records', 'Clients & projects');

  // The consolidated social control area: four platforms, one page. It
  // renders every platform whether or not it is configured, because
  // "not connected" is information the owner needs, and an unconfigured
  // connector showing an empty timeline would read as "no activity".
  page('/workspace/social', async (req, res) => {
    const [accounts, posts, outstanding] = await Promise.all([
      socialRepo.accountStates(),
      socialRepo.listPosts({ limit: 40 }),
      socialRepo.listEngagement({ needsReply: true, limit: 40 })
    ]);
    res.render('workspace/social', {
      ...viewer(req),
      counts: await navCounts(req.workspaceClearance),
      accounts,
      posts,
      outstanding,
      csrfToken: generateCsrfToken(req, res)
    });
  });

  page('/workspace/workforce', async (req, res) => {
    res.render('workspace/workforce', {
      ...viewer(req),
      counts: await navCounts(req.workspaceClearance),
      lanes: LANES,
      csrfToken: generateCsrfToken(req, res)
    });
  });

  page('/workspace/approvals', async (req, res) => {
    const clearanceId = req.workspaceClearance;
    const all = await repo.listApprovals();
    res.render('workspace/approvals', {
      ...viewer(req),
      counts: await navCounts(clearanceId),
      approvals: all.filter((a) => clearanceCanSeeSensitivity(clearanceId, a.sensitivity)),
      csrfToken: generateCsrfToken(req, res)
    });
  });

  page('/workspace/gaps', async (req, res) => {
    const clearanceId = req.workspaceClearance;
    const all = await repo.listGaps();
    res.render('workspace/gaps', {
      ...viewer(req),
      counts: await navCounts(clearanceId),
      gaps: all.filter((g) => clearanceCanSeeSensitivity(clearanceId, g.sensitivity)),
      csrfToken: generateCsrfToken(req, res)
    });
  });

  page('/workspace/activity', async (req, res) => {
    res.render('workspace/activity', {
      ...viewer(req),
      counts: await navCounts(req.workspaceClearance),
      activity: await repo.listActivity(200),
      csrfToken: generateCsrfToken(req, res)
    });
  });

  page('/workspace/chat', async (req, res) => {
    const username = req.session.user.username;
    const conversations = await repo.listConversationsFor(username);
    let active = null;
    let messages = [];
    const requested = parseInt(req.query.c, 10);
    if (Number.isInteger(requested)) {
      active = await repo.getConversationFor(requested, username);
      if (active) messages = await repo.listMessages(active.id);
    }
    res.render('workspace/chat', {
      ...viewer(req),
      counts: await navCounts(req.workspaceClearance),
      conversations,
      active,
      messages,
      lanes: LANES,
      aiEnabled: isWorkspaceAIEnabled(),
      csrfToken: generateCsrfToken(req, res)
    });
  });
}

// --- APIs (behind global CSRF) -----------------------------------------

router.post('/api/workspace/ask', workspaceNoindex, requireWorkspaceApiAccess, askLimiter, async (req, res, next) => {
  try {
    const username = req.session.user.username;
    const clearanceId = req.workspaceClearance;
    const question = typeof req.body.question === 'string' ? req.body.question.trim().slice(0, 4000) : '';
    if (!question) return res.status(400).json({ error: 'A question is required.' });
    const forcedLaneId = typeof req.body.laneId === 'string' && laneById(req.body.laneId) ? req.body.laneId : null;

    let conversation = null;
    const requested = parseInt(req.body.conversationId, 10);
    if (Number.isInteger(requested)) {
      conversation = await repo.getConversationFor(requested, username);
      if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
    }

    const result = await askWorkspace({ clearanceId, question, laneId: forcedLaneId });
    if (!result.ok) {
      return res.status(503).json({ error: result.errors.join(' ') });
    }

    if (!conversation) {
      conversation = await repo.createConversation({
        ownerUsername: username,
        clearance: clearanceId,
        laneId: result.laneId || '',
        title: question.slice(0, 120)
      });
    }
    await repo.addMessage({ conversationId: conversation.id, role: 'user', content: question, laneId: result.laneId || '' });
    await repo.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: result.answer,
      laneId: result.laneId || '',
      provenance: result.provenanceKeys
    });

    if (result.gap) {
      const record = result.gap.description && await recordForGap(result.gap);
      await repo.createGap({
        gapType: result.gap.gap_type,
        description: result.gap.description.slice(0, 2000),
        recordKey: record ? record.record_key : '',
        sensitivity: record ? record.sensitivity : 'commercial',
        material: !!result.gap.material,
        raisedBy: result.laneId ? `lane:${result.laneId}` : 'workspace_ai'
      });
      await repo.addActivity({ actor: 'workspace_ai', eventType: 'gap_raised', summary: `Gap raised (${result.gap.gap_type}) from a ${result.laneId || 'general'} answer.` });
    }
    await repo.addActivity({ actor: username, eventType: 'workspace_ask', summary: `Asked the workspace (lane: ${result.laneId || 'general'}, ${result.provenanceKeys.length} record(s) supplied).` });

    res.json({
      ok: true,
      conversationId: conversation.id,
      laneId: result.laneId,
      laneName: result.laneId ? laneById(result.laneId).name : null,
      answer: result.answer,
      provenance: result.provenanceKeys,
      gap: result.gap,
      escalation: result.escalation
    });
  } catch (err) { next(err); }
});

// A gap quoted a record: carry that record's sensitivity onto the gap so
// the register filters it exactly like the evidence it quotes.
async function recordForGap(gap) {
  // Record keys are dotted (e.g. authority.constitution), so require a
  // dot: plain English words in the description never look like keys.
  const m = String(gap.description).match(/\b([a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)+)\b/);
  if (!m) return null;
  return repo.getRecordByKey(m[1]);
}

router.post('/api/workspace/approvals/:id/decide', workspaceNoindex, requireWorkspaceApiAccess, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const decision = req.body.decision === 'approved' ? 'approved' : req.body.decision === 'declined' ? 'declined' : null;
    if (!Number.isInteger(id) || !decision) return res.status(400).json({ error: 'A decision of approved or declined is required.' });
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 2000) : '';
    const row = await repo.decideApproval(id, { decision, decidedBy: req.session.user.username, note });
    if (!row) return res.status(409).json({ error: 'This approval is not open. A decided approval stays decided.' });
    await repo.addActivity({ actor: req.session.user.username, eventType: 'approval_decided', summary: `Approval #${id} ${decision}: ${row.title}` });
    res.json({ ok: true, approval: row });
  } catch (err) { next(err); }
});

router.post('/api/workspace/gaps/:id/resolve', workspaceNoindex, requireWorkspaceApiAccess, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 2000) : '';
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad gap id.' });
    if (!note) return res.status(400).json({ error: 'A written statement of what was done is required.' });
    const sourceCorrected = req.body.sourceCorrected === true || req.body.sourceCorrected === 'true';
    const row = await repo.resolveGap(id, { resolvedBy: req.session.user.username, sourceCorrected, note });
    if (!row) return res.status(409).json({ error: 'This gap is not open. A closed gap stays closed.' });
    await repo.addActivity({
      actor: req.session.user.username,
      eventType: sourceCorrected ? 'gap_resolved' : 'gap_dismissed',
      summary: `Gap #${id} ${sourceCorrected ? 'resolved (source corrected)' : 'dismissed'}.`
    });
    res.json({ ok: true, gap: row });
  } catch (err) { next(err); }
});

// Recording that a PERSON replied on the platform. There is no route
// here that sends a reply, publishes, deletes or spends: those are
// consequential external actions, and lib/workspace/social/actions.js
// refuses them by construction. The most this API can do with one is
// put it in the human approval queue as a record.
router.post('/api/workspace/social/engagement/:id/replied', workspaceNoindex, requireWorkspaceApiAccess, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad id.' });
    const row = await socialRepo.recordHumanReply(id, req.session.user.username);
    if (!row) return res.status(409).json({ error: 'That item is not outstanding. A recorded reply stays recorded.' });
    await repo.addActivity({ actor: req.session.user.username, eventType: 'social_reply_recorded', summary: `Recorded a human reply on ${row.platform} to ${row.author}.` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/api/workspace/social/request-action', workspaceNoindex, requireWorkspaceApiAccess, async (req, res, next) => {
  try {
    const { platform, action, summary, detail } = req.body || {};
    if (!platform || !action || !summary) return res.status(400).json({ error: 'platform, action and summary are required.' });
    if (!socialActions.isConsequential(action)) {
      return res.status(400).json({ error: 'That is an ordinary connector capability and does not need a human decision.' });
    }
    const approval = await socialActions.requestHumanAction({
      platform, action,
      summary: String(summary).slice(0, 200),
      detail: String(detail || '').slice(0, 2000),
      requestedBy: req.session.user.username
    });
    res.json({ ok: true, approvalId: approval.id, note: 'Queued as a record for a human decision. Nothing has been sent or published.' });
  } catch (err) { next(err); }
});

module.exports = { router, mountPageRoute };
