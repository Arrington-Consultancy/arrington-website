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
const socialSync = require('../lib/workspace/social/sync');
const socialMutations = require('../lib/workspace/social/mutations');
const receptionist = require('../lib/workspace/receptionist');
const financeRepo = require('../lib/workspace/finance/repo');
const financeRegistry = require('../lib/workspace/finance/registry');
const financeAccounting = require('../lib/workspace/finance/accounting');
const financeRecurring = require('../lib/workspace/finance/recurring');
const financeAnnaCsv = require('../lib/workspace/finance/annaStatementCsv');
const financeSync = require('../lib/workspace/finance/sync');
const xeroClient = require('../lib/workspace/finance/xeroClient');
const zohoInvoiceClient = require('../lib/workspace/finance/zohoInvoiceClient');
const invoiceIntent = require('../lib/workspace/finance/invoiceIntent');
const pendingAction = require('../lib/workspace/finance/pendingAction');
const gmailClient = require('../lib/workspace/email/gmailClient');
const emailSummary = require('../lib/workspace/email/summary');
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

// --- Pending actions (approvals raised from Ask Ruth) ------------------
//
// An approval row is the record of an action waiting on a person. Until
// 07/09/2026 nothing ever read one back into the conversation, so a
// follow-up ("change it to £600", "leave it in drafts") was either
// misread as a brand new request or handed to the model with no idea
// an action existed. These helpers give a chat turn the pending action
// it is most likely about: the most recent open approval raised from
// THIS conversation, else the asker's most recent open invoice draft.

function parseApprovalPayload(row) {
  if (!row || !row.detail) return null;
  try {
    const p = JSON.parse(row.detail);
    return p && typeof p === 'object' && typeof p.kind === 'string' ? p : null;
  } catch (_) { return null; }
}

function invoiceModeLabel(mode) {
  return mode === 'create_and_send' ? 'create and send' : 'draft only';
}

function invoiceApprovalTitle(payload) {
  return `Zoho invoice (${invoiceModeLabel(payload.mode)}): ${invoiceIntent.describe(payload.draft)}`;
}

// The shape every chat reply and the approvals page work from. Built
// from the stored row only, never from the request.
function pendingFromRow(row) {
  const payload = parseApprovalPayload(row);
  if (!payload) return null;
  return {
    id: row.id,
    kind: payload.kind,
    status: row.status,
    title: row.title,
    sensitivity: row.sensitivity,
    requestedBy: row.requested_by,
    conversationId: Number.isInteger(payload.conversationId) ? payload.conversationId : null,
    mode: payload.kind === 'zoho_invoice_draft' ? (payload.mode === 'create_and_send' ? 'create_and_send' : 'draft_only') : null,
    draft: payload.draft || null,
    revisions: Array.isArray(payload.revisions) ? payload.revisions : [],
    payload
  };
}

async function findPendingAction({ username, clearanceId, conversationId = null }) {
  const open = await repo.listApprovals({ status: 'open' });
  const visible = open
    .filter((a) => clearanceCanSeeSensitivity(clearanceId, a.sensitivity))
    .map(pendingFromRow)
    .filter(Boolean);
  if (conversationId) {
    const inConversation = visible.find((p) => p.conversationId === conversationId);
    if (inConversation) return { ...inConversation, viaConversation: true };
  }
  const fallback = visible.find((p) => p.kind === 'zoho_invoice_draft' && p.requestedBy === username);
  return fallback ? { ...fallback, viaConversation: false } : null;
}

// What the chat page and the ask reply hand to the card. Nothing beyond
// the draft the person will approve.
function invoiceCardData(pending) {
  if (!pending || pending.kind !== 'zoho_invoice_draft') return null;
  return {
    approvalId: pending.id,
    status: pending.status,
    mode: pending.mode,
    summary: invoiceIntent.describe(pending.draft),
    draft: pending.draft
  };
}

// The bounded history handed to the model: the last few turns, each cut
// short, so a follow-up can be understood without the owner restating
// it. Context only; the records remain the only source of facts.
const HISTORY_TURNS = 6;
const HISTORY_CHARS = 600;
async function recentHistory(conversationId) {
  if (!conversationId) return [];
  const rows = await repo.listMessages(conversationId);
  return rows
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, HISTORY_CHARS) }));
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
    const importResult = typeof req.query.importResult === 'string' ? req.query.importResult.slice(0, 500) : '';
    const xeroRedirectUri = `${req.protocol}://${req.get('host')}/workspace/finance/xero/callback`;
    if (!permitted) {
      return res.render('workspace/finance', {
        ...viewer(req),
        counts: await navCounts(clearanceId),
        permitted: false,
        accounts: [], headlineBalance: null, transactions: [], syncRuns: [], connectError: '', importResult: '', xeroRedirectUri,
        tokenCryptoReady: false,
        moneyActionsNeverBuilt: financeRegistry.MONEY_ACTION_CLASS_NEVER_BUILT,
        period: null, summary: null, periodPresets: [], recurringGroups: [], trend: [],
        zoho: { configured: false, writesEnabled: false, invoices: [], payments: [], contacts: [], error: '', invoicesError: '', paymentsError: '', contactsError: '', readAt: null },
        csrfToken: generateCsrfToken(req, res)
      });
    }
    // Free, built-in accounting summary (01/09/2026): no third-party free
    // accounting software actually integrates with ANNA today (see
    // lib/workspace/finance/accounting.js header), so this is computed
    // entirely from transactions already synced/imported here - no new
    // credential, no new service. period comes from the query string,
    // validated server-side before it ever reaches the database.
    const period = financeAccounting.resolvePeriod({
      preset: typeof req.query.period === 'string' ? req.query.period : undefined,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined
    });
    const [accounts, transactions, syncRuns, periodTransactions, allTransactions] = await Promise.all([
      financeRepo.listAccountStates(),
      financeRepo.listTransactions({ limit: 100 }),
      financeRepo.recentSyncRuns(10),
      financeRepo.listTransactions({ limit: 5000, from: period.from, to: period.to }),
      // Recurring detection looks across the whole ledger, not just the
      // selected period: a monthly cost needs several months of history
      // to be recognised as a pattern regardless of which period is on
      // screen.
      financeRepo.listTransactions({ limit: 5000 })
    ]);
    // Zoho Invoice (read-only): fetched live when the three env vars are
    // set. A failed call is reported on the page, never thrown, so a Zoho
    // outage cannot take the rest of the Finance page down with it.
    // Invoices and payments are fetched independently: a scope or
    // permission problem on one endpoint must not hide the other's data.
    // `error` is the credential-level failure (no token at all);
    // `invoicesError` / `paymentsError` are per-endpoint.
    const zoho = {
      configured: financeRegistry.isConfigured('zoho_invoice'),
      writesEnabled: zohoInvoiceClient.writesEnabled(),
      invoices: [], payments: [], contacts: [], error: '', invoicesError: '', paymentsError: '', contactsError: '',
      // Freshness is simple and truthful here: there is no stored copy of
      // Zoho data, every page load reads Zoho live, so "as of" is now.
      readAt: null
    };
    if (zoho.configured) {
      const errText = (err) => String(err && err.message ? err.message : err).slice(0, 300);
      try {
        zoho.readAt = new Date();
        const token = await zohoInvoiceClient.getAccessToken();
        const [inv, pay, con] = await Promise.allSettled([
          zohoInvoiceClient.getInvoices(token),
          zohoInvoiceClient.getPayments(token),
          // The customer list feeds the create-invoice form, so it is
          // only fetched when that form can be shown.
          zoho.writesEnabled ? zohoInvoiceClient.getContacts(token) : Promise.resolve([])
        ]);
        if (inv.status === 'fulfilled') zoho.invoices = inv.value.slice(0, 100); else zoho.invoicesError = errText(inv.reason);
        if (pay.status === 'fulfilled') zoho.payments = pay.value.slice(0, 100); else zoho.paymentsError = errText(pay.reason);
        if (con.status === 'fulfilled') zoho.contacts = con.value.slice(0, 200); else zoho.contactsError = errText(con.reason);
        console.log(`Zoho Invoice read: invoices ${zoho.invoicesError ? 'FAILED: ' + zoho.invoicesError : zoho.invoices.length}; payments ${zoho.paymentsError ? 'FAILED: ' + zoho.paymentsError : zoho.payments.length}.`);
      } catch (err) {
        zoho.error = errText(err);
        console.error(`Zoho Invoice read FAILED: ${zoho.error}`);
      }
    }
    res.render('workspace/finance', {
      ...viewer(req),
      counts: await navCounts(clearanceId),
      permitted: true,
      accounts,
      headlineBalance: financeRepo.headlineAccountState(accounts),
      transactions,
      syncRuns,
      connectError,
      importResult,
      xeroRedirectUri,
      tokenCryptoReady: tokenCryptoConfigured(),
      moneyActionsNeverBuilt: financeRegistry.MONEY_ACTION_CLASS_NEVER_BUILT,
      period,
      summary: financeAccounting.summarise(periodTransactions),
      periodPresets: financeAccounting.PERIOD_PRESETS,
      recurringGroups: financeRecurring.detectRecurringGroups(allTransactions),
      trend: financeAccounting.monthlyTrend(allTransactions, 12),
      zoho,
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

  // Zoho Invoice OAuth: same pattern as Xero, except the callback renders
  // the refresh token once for Tom to copy into Railway rather than
  // storing it in the database. No DB upsert on this side.
  app.get('/workspace/finance/zoho/connect', requireWorkspacePageAccess, (req, res) => {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) return res.redirect('/workspace/finance');
    // Only the client id and secret are needed to START the consent flow;
    // the refresh token is what the flow produces, so requiring it here
    // would make the connector impossible to connect for the first time.
    const missing = ['ZOHO_INVOICE_CLIENT_ID', 'ZOHO_INVOICE_CLIENT_SECRET'].filter((k) => !(process.env[k] && String(process.env[k]).trim()));
    if (missing.length) return res.redirect('/workspace/finance?connectError=' + encodeURIComponent(`Cannot start the Zoho connection: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} empty in Railway. Fill it in, let Railway redeploy, then try again.`));
    const state = crypto.randomBytes(24).toString('hex');
    req.session.zohoOAuthState = state;
    res.redirect(zohoInvoiceClient.buildAuthorizeUrl(state));
  });

  app.get('/workspace/finance/zoho/callback', requireWorkspacePageAccess, async (req, res, next) => {
    try {
      if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) return res.redirect('/workspace/finance');
      const expectedState = req.session.zohoOAuthState;
      delete req.session.zohoOAuthState;
      if (req.query.error) {
        return res.redirect(`/workspace/finance?connectError=${encodeURIComponent(`Zoho declined the connection: ${req.query.error}`)}`);
      }
      if (!expectedState || req.query.state !== expectedState) {
        return res.redirect(`/workspace/finance?connectError=${encodeURIComponent('That connection attempt could not be verified (state mismatch). Start again from the Finance page.')}`);
      }
      if (typeof req.query.code !== 'string' || !req.query.code) {
        return res.redirect(`/workspace/finance?connectError=${encodeURIComponent('Zoho did not return an authorisation code.')}`);
      }
      const tokens = await zohoInvoiceClient.exchangeCodeForTokens(req.query.code);
      const nonce = res.locals.nonce || '';
      // Render the refresh token once. Tom copies it, sets
      // ZOHO_INVOICE_REFRESH_TOKEN in Railway, and redeploys.
      // This page is never cached and never logs the token value.
      res.setHeader('Cache-Control', 'no-store');
      res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Zoho Invoice connected</title>
<style nonce="${nonce}">body{font-family:system-ui,sans-serif;max-width:640px;margin:4rem auto;padding:0 1.5rem}
code{background:#f4f4f4;padding:.25rem .5rem;border-radius:4px;word-break:break-all;display:block;margin:1rem 0;font-size:.9rem}
.note{color:#555;font-size:.9rem;margin-top:2rem}</style></head>
<body><h1>Zoho Invoice connected</h1>
<p>Copy the refresh token below and set it as <strong>ZOHO_INVOICE_REFRESH_TOKEN</strong> in Railway, then redeploy. This token will not be shown again.</p>
<code>${tokens.refresh_token ? String(tokens.refresh_token).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '(no refresh_token in response: check the Zoho app settings)'}</code>
<p class="note">Once you have copied the token and set the Railway variable, close this page and redeploy. The Finance page will show Zoho Invoice data after the next deploy.</p>
<p><a href="/workspace/finance">Back to Finance</a></p></body></html>`);
    } catch (err) { next(err); }
  });

  // Email (07/09/2026, Tom's instruction). Tom's own Gmail inbox, read
  // live through the Gmail API on every load, the same way the Finance
  // page reads Zoho: nothing is stored by the page itself. Real
  // correspondence, so it sits at the confidential level. The only
  // writes are the two API routes below: a snapshot into the Company
  // Brain, and a human-written send, both behind their own checks.
  page('/workspace/email', async (req, res) => {
    const clearanceId = req.workspaceClearance;
    const permitted = clearanceCanSeeSensitivity(clearanceId, 'confidential');
    const connectError = typeof req.query.connectError === 'string' ? req.query.connectError.slice(0, 300) : '';
    const notice = typeof req.query.notice === 'string' ? req.query.notice.slice(0, 300) : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    const gmail = {
      configured: gmailClient.isConfigured(),
      sendEnabled: gmailClient.sendEnabled(),
      canStartConnect: ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'].every((k) => String(process.env[k] || '').trim()),
      vars: gmailClient.ENV_KEYS.map((k) => `${k} ${String(process.env[k] || '').trim() ? 'set' : 'not set'}`),
      profile: { emailAddress: '' }, counts: { unread: null, total: null }, messages: [], failed: 0, error: '', readAt: null
    };
    const errText = (err) => String(err && err.message ? err.message : err).slice(0, 300);
    if (permitted && gmail.configured) {
      gmail.readAt = new Date();
      try {
        const token = await gmailClient.getAccessToken();
        const [profile, counts, inbox] = await Promise.allSettled([
          gmailClient.getProfile(token),
          gmailClient.getInboxCounts(token),
          gmailClient.listInbox(token, { maxResults: 25, q })
        ]);
        if (profile.status === 'fulfilled') gmail.profile = profile.value;
        if (counts.status === 'fulfilled') gmail.counts = counts.value;
        if (inbox.status === 'fulfilled') { gmail.messages = inbox.value.messages; gmail.failed = inbox.value.failed; }
        else gmail.error = errText(inbox.reason);
        if (profile.status === 'rejected' && !gmail.error) gmail.error = errText(profile.reason);
      } catch (err) {
        gmail.error = errText(err);
      }
    }
    res.render('workspace/email', {
      ...viewer(req),
      counts: await navCounts(clearanceId),
      permitted, gmail, q, connectError, notice,
      redirectUri: gmailClient.CANONICAL_REDIRECT_URI,
      summaryCount: emailSummary.SUMMARY_MESSAGE_COUNT,
      csrfToken: generateCsrfToken(req, res)
    });
  });

  // One message in full (07/09/2026, Tom: "read full emails and reply").
  // Read live from Gmail on each view, never stored, never written to the
  // Brain. The id is validated to Gmail's own alphabet before it reaches
  // a URL. Confidential clearance, same as the inbox.
  page('/workspace/email/message/:id', async (req, res) => {
    const clearanceId = req.workspaceClearance;
    if (!clearanceCanSeeSensitivity(clearanceId, 'confidential')) return render404(req, res);
    const id = String(req.params.id || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return render404(req, res);
    if (!gmailClient.isConfigured()) return res.redirect('/workspace/email');
    const errText = (err) => String(err && err.message ? err.message : err).slice(0, 300);
    let message = null;
    let error = '';
    try {
      const token = await gmailClient.getAccessToken();
      message = await gmailClient.getMessageFull(token, id);
    } catch (err) {
      error = errText(err);
    }
    res.render('workspace/email-message', {
      ...viewer(req),
      counts: await navCounts(clearanceId),
      message, error, id,
      sendEnabled: gmailClient.sendEnabled(),
      csrfToken: generateCsrfToken(req, res)
    });
  });

  // Gmail OAuth: same shape as Zoho. The callback renders the refresh
  // token once for Tom to copy into Railway; nothing is stored here.
  app.get('/workspace/email/gmail/connect', requireWorkspacePageAccess, (req, res) => {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) return res.redirect('/workspace/email');
    const missing = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'].filter((k) => !(process.env[k] && String(process.env[k]).trim()));
    if (missing.length) return res.redirect('/workspace/email?connectError=' + encodeURIComponent(`Cannot start the Gmail connection: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} empty in Railway. Fill it in, let Railway redeploy, then try again.`));
    const state = crypto.randomBytes(24).toString('hex');
    req.session.gmailOAuthState = state;
    res.redirect(gmailClient.buildAuthorizeUrl(state));
  });

  app.get('/workspace/email/gmail/callback', requireWorkspacePageAccess, async (req, res, next) => {
    try {
      if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) return res.redirect('/workspace/email');
      const expectedState = req.session.gmailOAuthState;
      delete req.session.gmailOAuthState;
      if (req.query.error) {
        return res.redirect(`/workspace/email?connectError=${encodeURIComponent(`Google declined the connection: ${String(req.query.error).slice(0, 100)}`)}`);
      }
      if (!expectedState || req.query.state !== expectedState) {
        return res.redirect(`/workspace/email?connectError=${encodeURIComponent('That connection attempt could not be verified (state mismatch). Start again from the Email page, in an ordinary browser window.')}`);
      }
      if (typeof req.query.code !== 'string' || !req.query.code) {
        return res.redirect(`/workspace/email?connectError=${encodeURIComponent('Google did not return an authorisation code.')}`);
      }
      const tokens = await gmailClient.exchangeCodeForTokens(req.query.code);
      const nonce = res.locals.nonce || '';
      const esc = (v) => String(v).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Gmail connected</title>
<style nonce="${nonce}">body{font-family:system-ui,sans-serif;max-width:640px;margin:4rem auto;padding:0 1.5rem}
code{background:#f4f4f4;padding:.25rem .5rem;border-radius:4px;word-break:break-all;display:block;margin:1rem 0;font-size:.9rem}
.note{color:#555;font-size:.9rem;margin-top:2rem}</style></head>
<body><h1>Gmail connected</h1>
<p>Copy the refresh token below and set it as <strong>GMAIL_REFRESH_TOKEN</strong> in Railway. Railway redeploys on its own. This token will not be shown again, and it must not be pasted anywhere else.</p>
<code>${tokens.refresh_token ? esc(tokens.refresh_token) : '(no refresh_token in response: Google issues one only on a consent it showed; press Connect again and approve)'}</code>
<p class="note">Scopes granted: ${esc(tokens.scope || '(not reported)')}. Once the Railway variable is set, close this page. The Email page will show the inbox after the next deploy.</p>
<p><a href="/workspace/email">Back to Email</a></p></body></html>`);
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
      approvals: all
        .filter((a) => clearanceCanSeeSensitivity(clearanceId, a.sensitivity))
        .map((a) => ({ ...a, invoice: invoiceCardData(pendingFromRow(a)) })),
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
    // The action this conversation is waiting on, if any, so the card is
    // there on reload and not only on the turn that created it.
    const pending = clearanceCanSeeSensitivity(clearanceId, 'confidential')
      ? await findPendingAction({ username, clearanceId, conversationId: active ? active.id : null })
      : null;
    res.render('workspace/chat', {
      pendingInvoice: invoiceCardData(pending),
      pendingLine: pending ? pendingAction.describePending(pending) : '',
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

    // Helpers for the deterministic replies below: they store the turn
    // and answer without a model, and without Ruth (no lane read a
    // record, so there is no handoff note to write).
    const confidential = clearanceCanSeeSensitivity(clearanceId, 'confidential');
    async function replyDeterministic(answer, invoiceDraft) {
      if (!conversation) {
        conversation = await repo.createConversation({ ownerUsername: username, clearance: clearanceId, laneId: '', title: question.slice(0, 120) });
      }
      await repo.addMessage({ conversationId: conversation.id, role: 'user', content: question, laneId: '' });
      await repo.addMessage({ conversationId: conversation.id, role: 'assistant', content: answer, laneId: '', provenance: [] });
      return res.json({ ok: true, conversationId: conversation.id, laneId: null, laneName: null, answer, provenance: [], gap: null, escalation: null, receptionist: null, invoiceDraft: invoiceDraft || null });
    }
    async function reviseInvoiceApproval(pending, { changes = {}, mode = null, note }) {
      const payload = pending.payload;
      const draft = { ...payload.draft, ...changes };
      const nextMode = mode || payload.mode;
      payload.draft = draft;
      payload.mode = nextMode;
      payload.revisions = [...(payload.revisions || []), { at: new Date().toISOString(), by: username, note, typed: question.slice(0, 300) }];
      const row = await repo.updateOpenApproval(pending.id, { title: invoiceApprovalTitle(payload), detail: JSON.stringify(payload) });
      if (!row) return null;
      await repo.addActivity({ actor: username, eventType: 'zoho_invoice_amended', subject: `approval:${pending.id}`, summary: `Approval #${pending.id} revised from Ask Ruth: ${note}.` });
      return pendingFromRow(row);
    }

    // The action this conversation is waiting on, if any (07/09/2026).
    // A follow-up is interpreted against it BEFORE the invoice parser
    // runs, because "create it as a draft" and "don't send it" are
    // sentences about the pending draft, not new requests, and the
    // parser cannot tell the difference on its own. Deterministic, like
    // the parser: the model never changes a field or a mode.
    const pending = confidential
      ? await findPendingAction({ username, clearanceId, conversationId: conversation ? conversation.id : null })
      : null;
    if (pending) {
      const follow = pendingAction.resolve(question, pending);
      if (follow.matched) {
        const isInvoice = pending.kind === 'zoho_invoice_draft';
        if (follow.op === 'cancel') {
          const row = await repo.decideApproval(pending.id, { decision: 'declined', decidedBy: username, note: `Cancelled from Ask Ruth: "${question.slice(0, 200)}"` });
          if (!row) return replyDeterministic(`Approval #${pending.id} is no longer open, so there was nothing to cancel.`, null);
          await repo.addActivity({ actor: username, eventType: 'approval_decided', summary: `Approval #${pending.id} declined: ${row.title}` });
          return replyDeterministic(`Cancelled approval #${pending.id} (${pending.title}). Nothing was created or sent.`, isInvoice ? { approvalId: pending.id, status: 'declined' } : null);
        }
        if (follow.op === 'show') {
          const how = isInvoice
            ? ' To change it, say for example "change it to £600", "make it for website build", "leave it in drafts", "send it", or "cancel that". To carry it out, approve it on the card or in Decisions & approvals.'
            : ' To withdraw it, say "cancel that"; to decide it, use Decisions & approvals.';
          return replyDeterministic(pendingAction.describePending(pending) + how, invoiceCardData(pending));
        }
        if (!isInvoice) {
          return replyDeterministic(`${pendingAction.describePending(pending)} That action has no fields that can be changed from here; decide it in Decisions & approvals or say "cancel that".`, null);
        }
        if (follow.op === 'confirm') {
          return replyDeterministic(`Nothing is carried out from a typed sentence. ${pendingAction.describePending(pending)} Press "Approve, create and email" on the card or in Decisions & approvals to carry it out, or say "leave it in drafts" to change your mind.`, invoiceCardData(pending));
        }
        if (follow.op === 'set_mode') {
          if (follow.mode === pending.mode) {
            return replyDeterministic(`It is already set that way. ${pendingAction.describePending(pending)}`, invoiceCardData(pending));
          }
          const revised = await reviseInvoiceApproval(pending, { mode: follow.mode, note: `mode changed to ${invoiceModeLabel(follow.mode)}` });
          if (!revised) return replyDeterministic(`Approval #${pending.id} is no longer open, so it cannot be changed.`, null);
          const said = follow.mode === 'draft_only'
            ? 'Understood: it will be created as a draft in Zoho Invoice only and nothing will be emailed. "Draft" here means a Zoho Invoice draft, not an email draft.'
            : 'Understood: when approved it will be created in Zoho Invoice and emailed to the customer.';
          return replyDeterministic(`${said} ${pendingAction.describePending(revised)}`, invoiceCardData(revised));
        }
        if (follow.op === 'amend') {
          const c = follow.changes;
          if (c.customerEmail && !invoiceIntent.EMAIL_RE.test(c.customerEmail)) return replyDeterministic('That does not look like an email address, so nothing was changed.', invoiceCardData(pending));
          if (c.amount != null && !(c.amount > 0)) return replyDeterministic('The amount has to be more than zero, so nothing was changed.', invoiceCardData(pending));
          const parts = [];
          if (c.amount != null) parts.push(`amount to £${c.amount.toFixed(2)}`);
          if (c.customerEmail) parts.push(`customer to ${c.customerName || c.customerEmail} <${c.customerEmail}>`);
          else if (c.customerName) parts.push(`customer name to ${c.customerName}`);
          if (c.description) parts.push(`description to "${c.description}"`);
          if (c.date) parts.push(`date to ${c.date}`);
          if (follow.mode && follow.mode !== pending.mode) parts.push(`mode to ${invoiceModeLabel(follow.mode)}`);
          const revised = await reviseInvoiceApproval(pending, { changes: c, mode: follow.mode || null, note: parts.join(', ') });
          if (!revised) return replyDeterministic(`Approval #${pending.id} is no longer open, so it cannot be changed.`, null);
          return replyDeterministic(`Updated approval #${pending.id}: ${parts.join(', ')}. ${pendingAction.describePending(revised)}`, invoiceCardData(revised));
        }
      }
    }

    // "Send an invoice to <email> £<amount> for <job> as of today"
    // (06/09/2026). Read deterministically, never by the model: a draft
    // that will become a real Zoho invoice emailed to a real address is
    // built from the typed sentence and nothing else. The draft goes into
    // Decisions & approvals as a record; a separate route, gated on the
    // approval being granted by a named person and spent once, is the
    // only thing that creates and emails it. Since 07/09/2026 the sentence
    // also fixes the MODE: "send" or "email" means create and email,
    // anything else means a Zoho draft only, and the owner can change
    // either afterwards with a follow-up. Ruth is not involved: no lane
    // read a record, so no handoff note is written.
    const intent = confidential ? invoiceIntent.parse(question) : { matched: false };
    if (intent.matched) {
      const pendingNote = pending && pending.kind === 'zoho_invoice_draft' ? ` ${pendingAction.describePending(pending)}` : '';
      if (!intent.complete) {
        return replyDeterministic(`I can draft that invoice, but I need ${intent.missing.join(', and ')}. For example: "send an invoice to name@example.com £500 for commercial review as of today".${pendingNote}`, invoiceCardData(pending));
      }
      if (!financeRegistry.isConfigured('zoho_invoice') || !zohoInvoiceClient.writesEnabled()) {
        return replyDeterministic(`I read that as ${invoiceIntent.describe(intent.draft)}, but Zoho Invoice writes are switched off in this environment, so no draft was raised.`, null);
      }
      if (!conversation) {
        conversation = await repo.createConversation({ ownerUsername: username, clearance: clearanceId, laneId: '', title: question.slice(0, 120) });
      }
      const payload = { kind: 'zoho_invoice_draft', mode: intent.mode, draft: intent.draft, typed: question, conversationId: conversation.id, revisions: [] };
      const approval = await repo.createApproval({
        title: invoiceApprovalTitle(payload),
        detail: JSON.stringify(payload),
        actionClass: 2,
        sensitivity: 'confidential',
        requestedBy: username
      });
      const created = pendingFromRow(approval);
      const modeSentence = intent.mode === 'create_and_send'
        ? `approve it and it will be created in Zoho Invoice and emailed to ${intent.draft.customerEmail} from your Zoho account`
        : 'approve it and it will be created as a draft in Zoho Invoice only, with nothing emailed; say "send it" if you want it emailed on approval';
      await repo.addActivity({ actor: username, eventType: 'zoho_invoice_drafted', subject: `approval:${approval.id}`, summary: `Drafted a Zoho invoice from Ask Ruth: ${invoiceIntent.describe(intent.draft)} (approval #${approval.id}, ${invoiceModeLabel(intent.mode)}).` });
      return replyDeterministic(`Drafted: invoice ${invoiceIntent.describe(intent.draft)}. Nothing has been created or sent. It is waiting as approval #${approval.id} (${invoiceModeLabel(intent.mode)}): ${modeSentence}. You can say "change it to £600", "leave it in drafts" or "cancel that" before approving.`, invoiceCardData(created));
    }

    // Everything else goes to the model, which since 07/09/2026 is told
    // the recent turns of this conversation and the action it is waiting
    // on, so "what was that for again?" is answerable. It still performs
    // nothing: the deterministic paths above are the only ones that
    // touch an approval.
    const history = await recentHistory(conversation ? conversation.id : null);
    const pendingLine = pending ? pendingAction.describePending(pending) : null;
    const result = await askWorkspace({ clearanceId, question, laneId: forcedLaneId, history, pendingAction: pendingLine });
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
      }),
      invoiceDraft: invoiceCardData(pending)
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

// Switch an open Zoho invoice draft between "draft only" and "create and
// send" from the approvals page (07/09/2026). The fields of the draft are
// NOT editable here: the customer, amount and description come only from
// what the owner typed into Ask Ruth, read by the deterministic parser.
// Same revision-in-place as a chat follow-up, so one row stays one row.
router.post('/api/workspace/approvals/:id/invoice-mode', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) return res.status(404).json({ error: 'Not found' });
    const id = parseInt(req.params.id, 10);
    const mode = req.body.mode === 'create_and_send' ? 'create_and_send' : req.body.mode === 'draft_only' ? 'draft_only' : null;
    if (!Number.isInteger(id) || !mode) return res.status(400).json({ error: 'A mode of draft_only or create_and_send is required.' });
    const row = await repo.getApproval(id);
    const pending = pendingFromRow(row);
    if (!pending || pending.kind !== 'zoho_invoice_draft') return res.status(409).json({ error: 'That approval is not a Zoho invoice draft.' });
    if (pending.status !== 'open') return res.status(409).json({ error: 'This approval is not open. A decided approval stays decided.' });
    const username = req.session.user.username;
    const payload = pending.payload;
    payload.mode = mode;
    payload.revisions = [...(payload.revisions || []), { at: new Date().toISOString(), by: username, note: `mode changed to ${invoiceModeLabel(mode)}`, typed: '' }];
    const updated = await repo.updateOpenApproval(id, { title: invoiceApprovalTitle(payload), detail: JSON.stringify(payload) });
    if (!updated) return res.status(409).json({ error: 'This approval is not open. A decided approval stays decided.' });
    await repo.addActivity({ actor: username, eventType: 'zoho_invoice_amended', subject: `approval:${id}`, summary: `Approval #${id} revised from Decisions & approvals: mode changed to ${invoiceModeLabel(mode)}.` });
    res.json({ ok: true, approval: updated, invoice: invoiceCardData(pendingFromRow(updated)) });
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

// Primary route: import an ANNA statement. Tom exports a CSV himself
// from the ANNA app ("Get an account statement") and uploads it here.
// The body is plain JSON (CSV as a text field), not multipart: CSV is
// text, so this avoids adding a file-upload dependency for one format,
// matching the site's existing base64-JSON pattern for image uploads
// (server.js gives this route the same kind of size exemption).
// Never throws on a malformed file: a parse failure with zero usable
// rows is reported as a 400 with the reasons, so Tom can see exactly
// what went wrong rather than a stack trace.
router.post('/api/workspace/finance/anna/import', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) {
      return res.status(404).json({ error: 'Not found' });
    }
    const csv = typeof req.body.csv === 'string' ? req.body.csv : '';
    if (!csv.trim()) return res.status(400).json({ error: 'No CSV content was received.' });
    const parsed = financeAnnaCsv.parseStatementCsv(csv);
    if (parsed.transactions.length === 0) {
      return res.status(400).json({ error: 'Nothing could be read from that file.', warnings: parsed.warnings });
    }
    const result = await financeRepo.recordCsvImport('anna_statement_csv', {
      transactions: parsed.transactions,
      warnings: parsed.warnings,
      closingBalancePence: parsed.closingBalancePence,
      closingBalanceDate: parsed.closingBalanceDate,
      importedBy: req.session.user.username
    });
    await repo.addActivity({
      actor: req.session.user.username,
      eventType: 'finance_anna_imported',
      summary: `Imported an ANNA statement (${result.outcome}): ${result.detail}`
    });
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

// Manual "Sync now", Xero only (the ANNA route above is an import, not a
// sync - there is nothing to poll). No scheduled sync exists yet in v1;
// every retrieval today is either the automatic first sync after
// connecting Xero, or triggered here by Tom.
// Retrieve from the connected social platforms. Added 03/09/2026 with
// lib/workspace/social/sync.js: until then the social area had no code
// that could fetch anything, so a correctly configured connector stayed
// empty forever.
//
// This is a READ that writes only to our own tables. It cannot publish,
// reply, delete or spend: the client it calls has no function that
// would, and the token carries no scope that would allow it. Same
// clearance and rate limit as every other workspace write endpoint.
router.post('/api/workspace/social/sync', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'commercial')) {
      return res.status(404).json({ error: 'Not found' });
    }
    const results = await socialSync.syncAll();
    const summary = results
      .map((r) => `${r.platform}: ${r.outcome}${r.itemsWritten ? ` (${r.itemsWritten} item(s))` : ''}`)
      .join('; ');
    await repo.addActivity({
      actor: req.session.user.username,
      eventType: 'social_synced',
      summary: `Social retrieval attempted. ${summary}`
    });
    res.json({ ok: true, results });
  } catch (err) { next(err); }
});

// Carry out an action on Meta that a person has already approved.
//
// Added 03/09/2026 on Tom's instruction that the workspace be
// technically capable of the configured Meta permissions without
// holding autonomous authority to use them. Every gate is in
// lib/workspace/social/mutations.js and none of them is here, so this
// route cannot be the place someone accidentally relaxes one: it hands
// over an approval id and the module decides.
//
// It takes an approval id and nothing that could stand in for one. No
// AI path reaches it, ENABLE_SOCIAL_MUTATIONS is off by default, the
// approval is re-read from the database, an approval decided by
// 'workspace_ai' is refused, and each approval is spent once.
router.post('/api/workspace/social/mutate', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'commercial')) {
      return res.status(404).json({ error: 'Not found' });
    }
    const { approvalId, operation } = req.body || {};
    const ops = {
      publish_post: () => socialMutations.publishPagePost({ approvalId, message: req.body.message, link: req.body.link }),
      reply_comment: () => socialMutations.replyToComment({ approvalId, commentId: req.body.commentId, message: req.body.message }),
      hide_comment: () => socialMutations.hideComment({ approvalId, commentId: req.body.commentId, hidden: req.body.hidden !== false }),
      update_metadata: () => socialMutations.updatePageMetadata({ approvalId, fields: req.body.fields || {} })
    };
    if (!Object.prototype.hasOwnProperty.call(ops, String(operation))) {
      return res.status(400).json({ error: `unknown operation. One of: ${Object.keys(ops).join(', ')}` });
    }
    const result = await ops[String(operation)]();
    res.json({ ok: true, ...result });
  } catch (err) {
    // A refusal is the expected answer here, not a server fault, and
    // the operator needs to read why.
    if (err && (err.name === 'MutationRefused' || err.name === 'MetaApiError')) {
      return res.status(400).json({ error: err.message, kind: err.kind || 'refused' });
    }
    next(err);
  }
});

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

// Create a customer (optional), create a draft invoice, and optionally
// email it to the customer, all in Zoho Invoice. Added 06/09/2026 on
// Tom's instruction: "create a customer, invoice the amount and the job
// and send it to them, without leaving the workspace".
//
// This is the first write into a financial system from the workspace,
// so the gates are deliberate and all of them are enforced in
// lib/workspace/finance/zohoInvoiceClient.js rather than only here:
// ENABLE_ZOHO_INVOICE_WRITES must be 'true' (every write throws
// otherwise, before any network call), the token must carry the CREATE
// scopes (a read-only token is refused by Zoho), and the only caller is
// this route, which a logged-in, unlocked, confidential-cleared human
// reaches through the form. No AI path reaches it. Sending is a
// separate flag in the body, confirmed in the browser, because the
// draft stays private to Zoho and the email is what reaches a customer.
// An invoice asks for money; nothing here moves any.
// The one function that creates (and optionally emails) a Zoho invoice.
// Both human paths go through it: the Finance page form, and the
// approved-draft route below. It assumes the caller has already applied
// the gates (workspace access, confidential clearance, writes flag,
// configured connector); it applies the validation and the record-keeping.
async function createAndSendZohoInvoice({ actor, customerId = '', customerEmail = '', customerName = '', description, amount, dueDate = '', notes = '', send = false }) {
  const token = await zohoInvoiceClient.getAccessToken();
  customerId = String(customerId || '').trim();
  customerEmail = String(customerEmail || '').trim();
  customerName = String(customerName || '').trim();
  let createdCustomer = false;
  if (!customerId) {
    // Reuse a customer Zoho already holds for this email, so a retry
    // after a failed invoice (or a name typed twice) does not create a
    // second contact for the same person.
    const wanted = customerEmail.toLowerCase();
    let existing = null;
    if (wanted) {
      try {
        existing = (await zohoInvoiceClient.getContacts(token)).find((c) => String(c.email || '').toLowerCase() === wanted) || null;
      } catch (_) { existing = null; }
    }
    if (existing) {
      customerId = existing.contact_id;
      customerName = existing.contact_name || customerName;
    } else {
      const contact = await zohoInvoiceClient.createContact(token, { name: customerName, email: customerEmail });
      customerId = contact.contact_id;
      customerName = contact.contact_name || customerName;
      createdCustomer = true;
      await repo.addActivity({ actor, eventType: 'zoho_customer_created', summary: `Created Zoho Invoice customer "${customerName}".` });
    }
  }

  const invoice = await zohoInvoiceClient.createInvoice(token, { customerId, description, amountPounds: amount, dueDate, notes });
  await repo.addActivity({
    actor,
    eventType: 'zoho_invoice_created',
    summary: `Created Zoho invoice ${invoice.invoice_number} for ${invoice.customer_name || customerName}, ${invoice.currency_symbol || '£'}${invoice.total} (draft).`
  });

  let sent = false;
  let sendError = '';
  if (send === true) {
    const to = customerEmail || invoice.email || (invoice.contact_persons_details || []).map((p) => p.email).find(Boolean) || '';
    try {
      await zohoInvoiceClient.emailInvoice(token, invoice.invoice_id, to);
      sent = true;
      await repo.addActivity({ actor, eventType: 'zoho_invoice_emailed', summary: `Emailed Zoho invoice ${invoice.invoice_number} to the customer.` });
    } catch (err) {
      sendError = String(err && err.message ? err.message : err).slice(0, 300);
      await repo.addActivity({ actor, eventType: 'zoho_invoice_email_failed', summary: `Zoho invoice ${invoice.invoice_number} was created but could not be emailed: ${sendError}` });
    }
  }
  return { invoiceNumber: invoice.invoice_number, invoiceId: invoice.invoice_id, total: invoice.total, createdCustomer, sent, sendError };
}

// Email: snapshot the inbox into the Company Brain. A human presses the
// button; the record is bounded (see lib/workspace/email/summary.js) and
// always confidential.
router.post('/api/workspace/email/gmail/sync', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!gmailClient.isConfigured()) return res.status(400).json({ error: 'Gmail is not connected.' });
    const token = await gmailClient.getAccessToken();
    const [profile, counts, inbox] = await Promise.all([
      gmailClient.getProfile(token),
      gmailClient.getInboxCounts(token),
      gmailClient.listInbox(token, { maxResults: emailSummary.SUMMARY_MESSAGE_COUNT })
    ]);
    const now = new Date();
    const record = await emailSummary.syncEmailSummaryRecord(repo, { profile, counts, messages: inbox.messages, now });
    await repo.addActivity({
      actor: req.session.user.username,
      eventType: 'email_brain_synced',
      summary: `Updated the Company Brain from Gmail: ${record.meta.messages} message header(s), ${record.meta.unread === null ? 'unread count unavailable' : `${record.meta.unread} unread`}.`
    });
    res.json({ ok: true, messages: record.meta.messages, unread: record.meta.unread, syncedAt: now.toISOString() });
  } catch (err) {
    if (err && /^Gmail API |^Google token |GMAIL_REFRESH_TOKEN/.test(String(err.message))) return res.status(502).json({ error: String(err.message).slice(0, 300) });
    next(err);
  }
});

// Email: send one plain-text message from Tom's own Gmail account. Gated
// in the client (ENABLE_GMAIL_SEND, checked before any network call and
// again here), human-initiated only, confirmed in the browser, recorded
// in the Activity log. No AI path reaches this route.
router.post('/api/workspace/email/gmail/send', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!gmailClient.sendEnabled()) return res.status(400).json({ error: `Sending email is switched off (${gmailClient.SEND_FLAG} is not 'true').` });
    if (!gmailClient.isConfigured()) return res.status(400).json({ error: 'Gmail is not connected.' });
    const to = String((req.body && req.body.to) || '').trim().slice(0, 200);
    const subject = String((req.body && req.body.subject) || '').trim().slice(0, 200);
    const text = String((req.body && req.body.text) || '').slice(0, 20000);
    const token = await gmailClient.getAccessToken();
    const profile = await gmailClient.getProfile(token);
    if (!profile.emailAddress) return res.status(502).json({ error: 'Gmail did not report the sending address; nothing was sent.' });
    const result = await gmailClient.sendMessage(token, { from: profile.emailAddress, to, subject, text });
    await repo.addActivity({
      actor: req.session.user.username,
      eventType: 'email_sent',
      subject: `gmail:${result.id}`,
      summary: `Sent an email from ${profile.emailAddress} to ${to}: "${subject.slice(0, 120)}".`
    });
    res.json({ ok: true, id: result.id, threadId: result.threadId, to });
  } catch (err) {
    if (err && err.name === 'GmailSendDisabledError') return res.status(400).json({ error: err.message });
    if (err && /^(A |The |Gmail API |Google token )|GMAIL_REFRESH_TOKEN/.test(String(err.message))) return res.status(400).json({ error: String(err.message).slice(0, 300) });
    next(err);
  }
});

// Email: reply to one message, in its thread. The original is re-read
// from Gmail by id so the recipient, subject and threading headers come
// from the message itself, never from the request body. Same gates as a
// fresh send: flag, confidential clearance, a person pressing the button.
router.post('/api/workspace/email/gmail/reply', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!gmailClient.sendEnabled()) return res.status(400).json({ error: `Sending email is switched off (${gmailClient.SEND_FLAG} is not 'true').` });
    if (!gmailClient.isConfigured()) return res.status(400).json({ error: 'Gmail is not connected.' });
    const messageId = String((req.body && req.body.messageId) || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(messageId)) return res.status(400).json({ error: 'A message id is required.' });
    const text = String((req.body && req.body.text) || '').slice(0, 20000);
    if (!text.trim()) return res.status(400).json({ error: 'The reply is empty.' });
    const token = await gmailClient.getAccessToken();
    const [profile, original] = await Promise.all([gmailClient.getProfile(token), gmailClient.getMessageFull(token, messageId)]);
    if (!profile.emailAddress) return res.status(502).json({ error: 'Gmail did not report the sending address; nothing was sent.' });
    if (!original.replyAddress) return res.status(400).json({ error: 'That message has no sender address to reply to.' });
    const subject = /^re:/i.test(original.subject || '') ? original.subject : `Re: ${original.subject || '(no subject)'}`;
    const quoted = original.bodyText
      ? `\n\nOn ${original.date ? original.date.toUTCString() : 'an earlier date'}, ${original.from} wrote:\n${original.bodyText.split('\n').map((l) => `> ${l}`).join('\n')}`
      : '';
    const result = await gmailClient.sendMessage(token, {
      from: profile.emailAddress,
      to: original.replyAddress,
      subject,
      text: `${text}${quoted}`,
      inReplyTo: original.messageId,
      references: original.references,
      threadId: original.threadId
    });
    await repo.addActivity({
      actor: req.session.user.username,
      eventType: 'email_replied',
      subject: `gmail:${result.id}`,
      summary: `Replied from ${profile.emailAddress} to ${original.replyAddress} in thread "${String(original.subject || '').slice(0, 120)}".`
    });
    res.json({ ok: true, id: result.id, threadId: result.threadId, to: original.replyAddress, subject });
  } catch (err) {
    if (err && err.name === 'GmailSendDisabledError') return res.status(400).json({ error: err.message });
    if (err && /^(A |The |Gmail API |Google token )|GMAIL_REFRESH_TOKEN/.test(String(err.message))) return res.status(400).json({ error: String(err.message).slice(0, 300) });
    next(err);
  }
});

function zohoWriteError(err, res, next) {
  if (err && err.name === 'ZohoWritesDisabledError') return res.status(400).json({ error: err.message });
  if (err && /^(A |The |Zoho Invoice API )/.test(String(err.message))) return res.status(400).json({ error: String(err.message).slice(0, 300) });
  return next(err);
}

// Carry out a Zoho invoice draft that a person has approved in Decisions
// & approvals (the drafts come from Ask Ruth, see /api/workspace/ask).
// Same discipline as the social mutations gate: the approval is re-read
// from the database rather than believed from the caller, it must have
// been decided by a named person (never 'workspace_ai'), and it is spent
// once, guarded by an activity row keyed on the approval id. The draft
// that is executed is the one stored on the approval row, which is what
// the person read, not whatever arrives in the request body.
router.post('/api/workspace/finance/zoho/invoice/execute', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!zohoInvoiceClient.writesEnabled()) {
      return res.status(400).json({ error: `Creating invoices is switched off (${zohoInvoiceClient.WRITES_FLAG} is not 'true').` });
    }
    if (!financeRegistry.isConfigured('zoho_invoice')) return res.status(400).json({ error: 'Zoho Invoice is not connected.' });
    const approvalId = parseInt(req.body && req.body.approvalId, 10);
    if (!Number.isInteger(approvalId)) return res.status(400).json({ error: 'An approval id is required.' });
    const approval = await repo.getApproval(approvalId);
    if (!approval) return res.status(404).json({ error: 'Approval not found.' });
    if (approval.status !== 'approved') return res.status(409).json({ error: `Approval #${approvalId} is ${approval.status}, not approved. Nothing was sent.` });
    if (!approval.decided_by || approval.decided_by === 'workspace_ai') return res.status(403).json({ error: 'That approval was not decided by a named person. Nothing was sent.' });
    let payload = null;
    try { payload = JSON.parse(approval.detail || ''); } catch (_) { payload = null; }
    if (!payload || payload.kind !== 'zoho_invoice_draft' || !payload.draft) return res.status(409).json({ error: 'That approval is not a Zoho invoice draft.' });
    const spent = await db.query(
      `SELECT 1 FROM workspace_activity WHERE event_type = 'zoho_invoice_executed' AND subject = $1 LIMIT 1`,
      [`approval:${approvalId}`]
    );
    if (spent.rows.length) return res.status(409).json({ error: `Approval #${approvalId} has already been carried out. Nothing was sent again.` });

    const actor = req.session.user.username;
    const d = payload.draft;
    // The MODE is read from the stored row, like the draft: "draft only"
    // creates the invoice in Zoho and emails nothing, "create and send"
    // creates and emails it. Until 07/09/2026 this line always sent,
    // so there was no way to review an invoice in Zoho before it went
    // out, whatever the owner had typed.
    const mode = payload.mode === 'create_and_send' ? 'create_and_send' : 'draft_only';
    const result = await createAndSendZohoInvoice({
      actor, customerEmail: d.customerEmail, customerName: d.customerName, description: d.description, amount: d.amount, send: mode === 'create_and_send'
    });
    const outcome = mode === 'create_and_send'
      ? (result.sent ? ' and emailed to the customer' : ', email FAILED: ' + result.sendError)
      : ' as a draft in Zoho Invoice (draft only, nothing emailed)';
    await repo.addActivity({
      actor, eventType: 'zoho_invoice_executed', subject: `approval:${approvalId}`,
      summary: `Carried out approval #${approvalId} (decided by ${approval.decided_by}, ${invoiceModeLabel(mode)}): Zoho invoice ${result.invoiceNumber} created${outcome}.`
    });
    res.json({ ok: true, approvalId, mode, ...result });
  } catch (err) { zohoWriteError(err, res, next); }
});

router.post('/api/workspace/finance/zoho/invoice', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!zohoInvoiceClient.writesEnabled()) {
      return res.status(400).json({ error: `Creating invoices is switched off (${zohoInvoiceClient.WRITES_FLAG} is not 'true').` });
    }
    if (!financeRegistry.isConfigured('zoho_invoice')) {
      return res.status(400).json({ error: 'Zoho Invoice is not connected.' });
    }
    const body = req.body || {};
    const result = await createAndSendZohoInvoice({
      actor: req.session.user.username,
      customerId: body.customerId, customerEmail: body.customerEmail, customerName: body.customerName,
      description: body.description, amount: body.amount, dueDate: body.dueDate, notes: body.notes,
      send: body.send === true
    });
    res.json({ ok: true, ...result });
  } catch (err) { zohoWriteError(err, res, next); }
});

// Disconnecting forgets the credential; the synced transaction history
// is kept as a factual record of what already happened. There is no
// route anywhere in this area that could move money, so there is
// nothing else disconnecting needs to protect against. provider is
// validated against the real provider list rather than trusted as-is;
// in practice only 'xero' has anything to disconnect (an ANNA import has
// no credential), but the route stays generic rather than hardcoding it.
router.post('/api/workspace/finance/disconnect', requireWorkspaceApiAccess, writeLimiter, async (req, res, next) => {
  try {
    if (!clearanceCanSeeSensitivity(req.workspaceClearance, 'confidential')) {
      return res.status(404).json({ error: 'Not found' });
    }
    const provider = financeRegistry.PROVIDER_IDS.includes(req.body.provider) ? req.body.provider : 'xero';
    await financeRepo.disconnectAccount(provider, req.session.user.username);
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
