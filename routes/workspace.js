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
const crypto = require('node:crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const repo = require('../lib/workspace/repo');
const { filterRecordsForClearance, clearanceCanSeeRecord, clearanceCanSeeSensitivity, clearanceCovers, CLEARANCES } = require('../lib/workspace/clearance');
const { LANES, SOURCE_CLASSES, laneById } = require('../lib/workspace/lanes');
const { requireWorkspacePageAccess, requireWorkspaceApiAccess, setNoindex, refuseUnroutedMethods } = require('../lib/workspace/access');
const { render404 } = require('../lib/render404');
const wsUnlock = require('../lib/workspace/unlock');
const unlockAlert = require('../lib/workspace/unlockAlert');
const db = require('../db/pool');
const { workspaceEnabled, workspaceClearance } = require('../lib/workspace/access');
const { askWorkspace, isWorkspaceAIEnabled, routeToLane } = require('../lib/workspace/orchestrator');
const socialRepo = require('../lib/workspace/social/repo');
const socialActions = require('../lib/workspace/social/actions');
const socialMemory = require('../lib/workspace/social/memory');
const receptionist = require('../lib/workspace/receptionist');
const financeRepo = require('../lib/workspace/finance/repo');
const financeRegistry = require('../lib/workspace/finance/registry');
const financeSync = require('../lib/workspace/finance/sync');
const xeroClient = require('../lib/workspace/finance/xeroClient');
const { encryptToken, tokenCryptoConfigured } = require('../lib/workspace/finance/tokenCrypto');
const crm = require('../lib/crm/contacts');
const erasure = require('../lib/crm/erasure');

const router = express.Router();

// FIRST, before any route is declared: Express answers OPTIONS from its
// route table before route middleware runs, so this has to sit ahead of
// everything or the area is enumerable anonymously (finding Q1).
router.use(refuseUnroutedMethods);

// The one level at which activity rows may be shown, used by BOTH
// surfaces that render them: the dashboard strip and /workspace/activity.
// Activity summaries quote gap descriptions, and a gap's sensitivity can
// be confidential, so this is the narrowest thing they can carry rather
// than the level of the page they sit on. Findings F6, G8 and H4 were
// all this same gap, corrected one surface at a time; a shared constant
// is what stops a fourth.
const ACTIVITY_SENSITIVITY = 'confidential';

// Governance finding F9 (30/08/2026): only /ask was limited, so the
// sync, erase, decide and resolve endpoints had none. The site's own
// authed-write limiter is mounted on /api/content and /api/admin only.
// The erasure endpoint is the one that matters most: an unlimited loop
// against a stolen session is worst there, and contacts/sync walks the
// whole lead table on every call.
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req.session && req.session.user ? `u:${req.session.user.id}` : ipKeyGenerator(req)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again shortly.' }
});

// Governance finding F1, Tom's decision of 31/08/2026. Deliberately far
// tighter than any other limiter here: this is the one secret standing
// between a seized CMS account and the whole controlled brain, so a
// guessing loop must die quickly. Keyed on the session where there is
// one, since the attacker this defends against is authenticated.
const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => (req.session && req.session.user ? `u:${req.session.user.id}` : ipKeyGenerator(req)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Wait fifteen minutes.' }
});

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
  // The page routes are registered on the app rather than on the router,
  // so they need the same guard ahead of them (finding Q1).
  app.use(refuseUnroutedMethods);

  const page = (path, handler) => {
    app.get(path, requireWorkspacePageAccess, async (req, res, next) => {
      try { await handler(req, res); } catch (err) { next(err); }
    });
  };

  // The unlock screen. requireWorkspacePageAccess lets this ONE path
  // through while locked; every other workspace path redirects here, and
  // every workspace API refuses outright. It renders nothing about the
  // business: no counts, no record titles, no navigation, because a
  // locked session must learn nothing from the screen that asks it to
  // unlock.
  app.get('/workspace/unlock', requireWorkspacePageAccess, (req, res) => {
    if (wsUnlock.isUnlocked(req)) return res.redirect('/workspace');
    res.render('workspace/unlock', {
      nonce: res.locals.nonce,
      csrfToken: generateCsrfToken(req, res),
      configured: wsUnlock.describeUnlockConfig().ok,
      error: null
    });
  });

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
      // Finding H4 (31/08/2026): F6 named TWO surfaces that render
      // repo.listActivity rows, and G8 corrected only one. This is the
      // other. Both must gate at the same level or the pair disagrees,
      // which is harder to spot than one surface being wrong. The shared
      // constant is asserted by a test.
      activity: clearanceCanSeeSensitivity(clearanceId, ACTIVITY_SENSITIVITY) ? activity : [],
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
    // Governance finding F6 (30/08/2026): this page applied no clearance
    // test at all. It leaks nothing today because owner_admin is the only
    // clearance a request can hold, but the module's own rule covers every
    // surface, and this is where a second clearance would fail silently.
    const clearanceId = req.workspaceClearance;
    const permitted = clearanceCanSeeSensitivity(clearanceId, 'commercial');
    if (!permitted) {
      return res.render('workspace/social', {
        ...viewer(req),
        counts: await navCounts(clearanceId),
        permitted: false,
        accounts: [], posts: [], outstanding: [], memory: null,
        aiEnabled: isWorkspaceAIEnabled(),
        csrfToken: generateCsrfToken(req, res)
      });
    }
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
      permitted: true,
      memory: socialMemory,
      aiEnabled: isWorkspaceAIEnabled(),
      csrfToken: generateCsrfToken(req, res)
    });
  });

  // Business banking (read-only). Sits at the confidential sensitivity
  // level, the narrowest tier the workspace has: today that means Tom's
  // owner_admin clearance only, and it is the reason no other clearance
  // can reach this page even though the route itself has no separate
  // permission system. Rendered whether or not Xero is connected, same
  // reasoning as social: "not connected" is information Tom needs, not
  // an absence to hide.
  page('/workspace/finance', async (req, res) => {
    const clearanceId = req.workspaceClearance;
    const permitted = clearanceCanSeeSensitivity(clearanceId, 'confidential');
    const connectError = typeof req.query.connectError === 'string' ? req.query.connectError.slice(0, 300) : '';
    const xeroRedirectUri = `${req.protocol}://${req.get('host')}/workspace/finance/xero/callback`;
    if (!permitted) {
      return res.render('workspace/finance', {
        ...viewer(req),
        counts: await navCounts(clearanceId),
        permitted: false,
        account: null, transactions: [], syncRuns: [], connectError: '', xeroRedirectUri,
        xeroConfigured: false, tokenCryptoReady: false,
        moneyActionsNeverBuilt: financeRegistry.MONEY_ACTION_CLASS_NEVER_BUILT,
        csrfToken: generateCsrfToken(req, res)
      });
    }
    const [account, transactions, syncRuns] = await Promise.all([
      financeRepo.accountState(),
      financeRepo.listTransactions({ limit: 100 }),
      financeRepo.recentSyncRuns(10)
    ]);
    res.render('workspace/finance', {
      ...viewer(req),
      counts: await navCounts(clearanceId),
      permitted: true,
      account,
      transactions,
      syncRuns,
      connectError,
      xeroRedirectUri,
      xeroConfigured: financeRegistry.isConfigured('xero'),
      tokenCryptoReady: tokenCryptoConfigured(),
      moneyActionsNeverBuilt: financeRegistry.MONEY_ACTION_CLASS_NEVER_BUILT,
      formatPence: financeRepo.formatPence,
      csrfToken: generateCsrfToken(req, res)
    });
  });

  // Xero OAuth: the browser leaves the site and comes back, so this is a
  // page-level GET/redirect pair, not a JSON API. Both steps still sit
  // behind requireWorkspacePageAccess: Tom only, unlocked session only.
  // A CSRF-style `state` value guards against a callback that did not
  // originate from a connect this session actually started.
  app.get('/workspace/finance/xero/connect', requireWorkspacePageAccess, (req, res) => {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) return res.redirect('/workspace/finance');
    if (!financeRegistry.isConfigured('xero')) return res.redirect('/workspace/finance');
    const state = crypto.randomBytes(24).toString('hex');
    req.session.xeroOAuthState = state;
    const redirectUri = `${req.protocol}://${req.get('host')}/workspace/finance/xero/callback`;
    res.redirect(xeroClient.buildAuthorizeUrl({ redirectUri, state }));
  });

  app.get('/workspace/finance/xero/callback', requireWorkspacePageAccess, async (req, res, next) => {
    try {
      if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) return res.redirect('/workspace/finance');
      const expectedState = req.session.xeroOAuthState;
      delete req.session.xeroOAuthState;
      if (req.query.error) {
        return res.redirect(`/workspace/finance?connectError=${encodeURIComponent(`Xero declined the connection: ${req.query.error}`)}`);
      }
      if (!expectedState || req.query.state !== expectedState) {
        return res.redirect(`/workspace/finance?connectError=${encodeURIComponent('That connection attempt could not be verified (state mismatch). Start again from the Finance page.')}`);
      }
      if (typeof req.query.code !== 'string' || !req.query.code) {
        return res.redirect(`/workspace/finance?connectError=${encodeURIComponent('Xero did not return an authorisation code.')}`);
      }
      const redirectUri = `${req.protocol}://${req.get('host')}/workspace/finance/xero/callback`;
      const tokens = await xeroClient.exchangeCodeForTokens(req.query.code, redirectUri);
      const connections = await xeroClient.getConnections(tokens.access_token);
      if (!connections.length) {
        return res.redirect(`/workspace/finance?connectError=${encodeURIComponent('Xero returned no connected organisation. Check that a Xero organisation was selected on the consent screen.')}`);
      }
      const org = connections[0]; // Single-organisation v1: the decision doc names one ANNA account.
      await financeRepo.upsertAccount('xero', {
        status: 'configured',
        tenantId: org.tenantId,
        tenantName: org.tenantName || '',
        refreshTokenEnc: encryptToken(tokens.refresh_token),
        accessTokenEnc: encryptToken(tokens.access_token),
        accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 1800) * 1000),
        connectedAt: new Date(),
        connectedBy: req.session.user.username,
        lastSyncOutcome: 'never'
      });
      await repo.addActivity({
        actor: req.session.user.username,
        eventType: 'finance_connected',
        summary: `Connected the Xero finance connector to organisation "${org.tenantName || org.tenantId}".`
      });
      // First sync happens immediately so the page has real data rather
      // than a bare "connected, never retrieved" state on first landing.
      const result = await financeSync.syncFinance({ triggeredBy: req.session.user.username });
      await repo.addActivity({
        actor: req.session.user.username,
        eventType: 'finance_synced',
        summary: `Finance sync (${result.outcome}): ${result.detail}`
      });
      res.redirect('/workspace/finance');
    } catch (err) { next(err); }
  });

  // Contacts. Real people's details, so the area sits at the commercial
  // sensitivity level: a clearance that cannot see commercial records
  // gets the page's own refusal, not an empty list that would imply
  // there is nothing here.
  page('/workspace/contacts', async (req, res) => {
    const clearanceId = req.workspaceClearance;
    const permitted = clearanceCanSeeSensitivity(clearanceId, 'commercial');
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const [contacts, stats] = permitted
      ? await Promise.all([crm.listContacts({ q }), crm.summary()])
      : [[], { contacts: 0, via_google: 0, active_30d: 0 }];
    let detail = null;
    const id = parseInt(req.query.id, 10);
    if (permitted && Number.isInteger(id)) detail = await crm.contactWithHistory(id);
    // What erasing this person would remove, and what it would keep,
    // shown before anyone confirms rather than after.
    const erasurePreview = detail ? await erasure.previewErasure(detail.email) : null;
    const erasures = permitted ? await erasure.listErasures(25) : [];
    res.render('workspace/contacts', {
      ...viewer(req),
      counts: await navCounts(clearanceId),
      permitted, contacts, stats, detail, q, erasurePreview, erasures,
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
    // Governance finding F6: activity summaries quote gap descriptions,
    // record titles and approval titles, so the log is a derived view of
    // material the other pages filter.
    //
    // Finding G8 (31/08/2026) corrected the level. The comment used to
    // claim this was "gated at the same level as the narrowest thing it
    // can quote" while gating on 'commercial', and a gap's sensitivity
    // can be 'confidential' (gapFallbackSensitivity now deliberately
    // defaults it there). A clearance holding standard and commercial
    // would have passed the gate and received confidential quotations.
    // No such clearance exists today; the comment asserting a property
    // the code did not have is the same pattern as F1 and F2, which is
    // why it is worth a line rather than a shrug.
    const clearanceId = req.workspaceClearance;
    const permitted = clearanceCanSeeSensitivity(clearanceId, ACTIVITY_SENSITIVITY);
    res.render('workspace/activity', {
      ...viewer(req),
      counts: await navCounts(clearanceId),
      permitted,
      activity: permitted ? await repo.listActivity(200) : [],
      csrfToken: generateCsrfToken(req, res)
    });
  });

  page('/workspace/chat', async (req, res) => {
    const username = req.session.user.username;
    const clearanceId = req.workspaceClearance;
    // Governance finding F7 (30/08/2026): an answer carries whatever the
    // asker was cleared for at the time. Owning the conversation is not
    // enough to read it back; the reader's clearance today has to still
    // cover the clearance the answer was built at. Narrowing someone's
    // clearance therefore narrows their own history with it, rather than
    // leaving a transcript as a way round the change.
    const conversations = (await repo.listConversationsFor(username))
      .filter((c) => clearanceCovers(clearanceId, c.clearance));
    let active = null;
    let messages = [];
    const requested = parseInt(req.query.c, 10);
    if (Number.isInteger(requested)) {
      active = await repo.getConversationFor(requested, username);
      if (active && !clearanceCovers(clearanceId, active.clearance)) active = null;
      if (active) messages = await repo.listMessages(active.id);
    }
    res.render('workspace/chat', {
      receptionist,
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

// Its own guard, not requireWorkspaceApiAccess: that one refuses a
// locked session, which would make unlocking impossible. This checks the
// flag and the identity binding only, so the passphrase is the single
// thing being tested here.
// Governance finding G2 (31/08/2026): these two hand-wrote a JSON 404
// where a genuinely missing endpoint answers with the site's HTML 404,
// so the two were distinguishable by shape even though the status
// matched. They now go through the same renderer as everything else,
// which negotiates HTML or JSON from the Accept header exactly as the
// real 404 handler does.
function requireWorkspaceIdentity(req, res, next) {
  if (!workspaceEnabled()) return render404(req, res);
  const clearance = workspaceClearance(req);
  if (!clearance) return render404(req, res);
  setNoindex(res);
  req.workspaceClearance = clearance;
  return next();
}

router.post('/api/workspace/unlock', requireWorkspaceIdentity, unlockLimiter, async (req, res, next) => {
  try {
    const username = req.session.user.username;
    if (!wsUnlock.configuredPassphrase()) {
      // Said plainly rather than reported as a wrong passphrase, because
      // an operator staring at a rejection needs to know the difference
      // between "you typed it wrong" and "nobody has set one".
      await repo.addActivity({ actor: username, eventType: 'workspace_unlock_unconfigured', summary: 'Unlock attempted while WORKSPACE_ACCESS_PASSPHRASE is unset or too short.' });
      return res.status(503).json({ error: 'No workspace passphrase is configured in this environment, so the workspace cannot be opened.' });
    }
    const supplied = typeof req.body.passphrase === 'string' ? req.body.passphrase : '';
    if (!wsUnlock.passphraseMatches(supplied)) {
      // Recorded every time. A run of these against a username is the
      // signature of exactly the attack this gate exists for, and it is
      // the only warning anyone would get.
      await repo.addActivity({ actor: username, eventType: 'workspace_unlock_failed', subject: username, summary: 'A workspace unlock attempt was refused: the passphrase did not match.' });
      // Governance finding G6 and Tom's instruction of 31/08/2026: the
      // warning must not live only behind the gate it protects. This
      // reads the burst from the database (so a container restart cannot
      // reset the count the way it resets the limiter), and emails the
      // configured owner address once per cooldown window. It carries no
      // passphrase, no guessed value and nothing from inside the
      // workspace. Deliberately not awaited: a mail problem must not
      // change what this route answers or how long it takes to answer,
      // since a timing difference here would itself be a signal.
      unlockAlert.maybeAlertOnFailedUnlock(db, { username })
        .catch((err) => console.error('Workspace unlock alert failed:', err.message));
      return res.status(401).json({ error: 'That passphrase is not correct.' });
    }
    wsUnlock.recordUnlock(req);
    await repo.addActivity({ actor: username, eventType: 'workspace_unlocked', summary: 'The workspace was unlocked with the deployment passphrase.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Locking again is always allowed and never fails: it only forgets a
// session fact.
router.post('/api/workspace/lock', requireWorkspaceIdentity, (req, res) => {
  wsUnlock.clearUnlock(req);
  res.json({ ok: true });
});

router.post('/api/workspace/ask', requireWorkspaceApiAccess, askLimiter, async (req, res, next) => {
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
      // Same rule as the page: a conversation answered at a clearance the
      // asker no longer covers is not theirs to continue, and reads as
      // absent rather than as refused.
      if (conversation && !clearanceCovers(clearanceId, conversation.clearance)) conversation = null;
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
        // Governance finding F7 (30/08/2026): where no record key could be
        // identified, the gap's own sensitivity is unknown, and a gap
        // description quotes the evidence that is missing. Fall back to
        // the answering lane's ceiling, which is the most the gap could
        // possibly have drawn on, and to the narrowest level of all when
        // even the lane is unknown. Never to a mid value chosen for
        // convenience.
        sensitivity: record ? record.sensitivity : gapFallbackSensitivity(result.laneId),
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
      escalation: result.escalation,
      // Ruth's line about where the question went. Built from the
      // routing facts only - she is handed no record and no answer text,
      // so she cannot repeat anything a lane decided not to show.
      // `answered` used to be passed here as !!result.answer. Governance
      // finding W1: it was always true, because parseReply refuses a
      // reply whose answer is not a non-empty trimmed string and this
      // route answers 503 before reaching this line. It is gone, and the
      // field guard in the receptionist throws if anyone passes it again.
      receptionist: receptionist.handoffNote({
        laneId: result.laneId || null,
        recordCount: result.provenanceKeys.length,
        gapRaised: !!result.gap
      })
    });
  } catch (err) { next(err); }
});

// A gap quoted a record: carry that record's sensitivity onto the gap so
// the register filters it exactly like the evidence it quotes.
function gapFallbackSensitivity(laneId) {
  const lane = laneId ? laneById(laneId) : null;
  return (lane && lane.sensitivityCeiling) || 'confidential';
}

async function recordForGap(gap) {
  // Record keys are dotted (e.g. authority.constitution), so require a
  // dot: plain English words in the description never look like keys.
  const m = String(gap.description).match(/\b([a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)+)\b/);
  if (!m) return null;
  return repo.getRecordByKey(m[1]);
}

router.post('/api/workspace/approvals/:id/decide', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
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

router.post('/api/workspace/gaps/:id/resolve', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
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
router.post('/api/workspace/social/engagement/:id/replied', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad id.' });
    const row = await socialRepo.recordHumanReply(id, req.session.user.username);
    if (!row) return res.status(409).json({ error: 'That item is not outstanding. A recorded reply stays recorded.' });
    await repo.addActivity({ actor: req.session.user.username, eventType: 'social_reply_recorded', summary: `Recorded a human reply on ${row.platform} to ${row.author}.` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/api/workspace/social/request-action', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
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

// Manual "Sync now". No scheduled sync exists yet in v1 (that is a later,
// separately-approved step); every retrieval today is either the
// automatic first sync after connecting, or triggered here by Tom.
router.post('/api/workspace/finance/sync', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) {
      return res.status(404).json({ error: 'Not found' });
    }
    const result = await financeSync.syncFinance({ triggeredBy: req.session.user.username });
    await repo.addActivity({
      actor: req.session.user.username,
      eventType: 'finance_synced',
      summary: `Finance sync (${result.outcome}): ${result.detail}`
    });
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

// Disconnecting forgets the credential; the synced transaction history
// is kept as a factual record of what already happened. There is no
// route anywhere in this area that could move money, so there is
// nothing else disconnecting needs to protect against.
router.post('/api/workspace/finance/disconnect', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) {
      return res.status(404).json({ error: 'Not found' });
    }
    await financeRepo.disconnectAccount('xero', req.session.user.username);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/api/workspace/contacts/sync', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'commercial')) {
      return res.status(404).json({ error: 'Not found' });
    }
    const result = await crm.syncFromLeads();
    await repo.addActivity({
      actor: req.session.user.username,
      eventType: 'contacts_synced',
      summary: `Contacts rebuilt from ${result.leadsScanned} lead row(s); ${result.eventsAdded} new interaction(s).`
    });
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

// Erasing a contact. Permanent, so it is gated four ways: workspace
// access, commercial clearance, the confirming human typing the address
// back exactly, and a written reason. There is no bulk version and no
// query parameter that widens it beyond one person.
router.post('/api/workspace/contacts/:id/erase', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'commercial')) {
      return res.status(404).json({ error: 'Not found' });
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad contact id.' });
    const contact = await crm.contactWithHistory(id);
    if (!contact) return res.status(404).json({ error: 'That contact no longer exists.' });

    const result = await erasure.eraseContact({
      email: contact.email,
      confirmEmail: req.body && req.body.confirmEmail,
      requestedBy: req.session.user.username,
      reason: req.body && req.body.reason
    });
    if (!result.ok) return res.status(400).json({ error: result.error });

    // The audit line carries the redacted address, never the address
    // itself: an audit trail that reprinted what was just erased would
    // undo the erasure it is evidencing.
    const removedTotal = Object.values(result.removed).reduce((n, r) => n + r.count, 0);
    await repo.addActivity({
      actor: req.session.user.username,
      eventType: 'contact_erased',
      summary: `Erased contact ${result.redacted}: ${removedTotal} record(s) removed across ${Object.keys(result.removed).length} table(s). Reason: ${String(req.body.reason).slice(0, 300)}`
    });
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

module.exports = { router, mountPageRoute };
