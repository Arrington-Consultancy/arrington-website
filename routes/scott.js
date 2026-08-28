// Scott AI Demonstration — routes.
//
// Same mountPageRoute pattern as Market Ready Test / Commercial Gaps
// Review / Product Guide / Where to Start: GET page routes are registered
// directly on `app` (ahead of the generic `/:slug` CMS catch-all in
// server.js), so this whole area is reachable and CSRF-token-bearing
// before the main site's page-render pipeline ever sees it. POST/API
// routes live on `router`, mounted normally, so they sit behind the site's
// global CSRF middleware like every other authenticated write.
//
// Every route here (except GET/POST /scott/login itself) is gated by
// requireScottPageAccess / requireScottApiAccess (lib/scott/access.js),
// which reuses the existing page_access table — no second permission
// system. Login is the SAME session/bcrypt/Postgres auth the rest of the
// site uses; this file does not create a second auth system, it only adds
// a Scott-branded view over the same check (see loginWithScottBranding
// below), then redirects into /scott the same way the main login redirects
// into /.

const express = require('express');
const bcrypt = require('bcrypt');
const { rateLimit } = require('express-rate-limit');
const db = require('../db/pool');
const repo = require('../lib/scott/data/repository');
const { WORKERS, WORKER_IDS, getWorker } = require('../lib/scott/workers');
const { OPERATING_SNAPSHOT_CARDS } = require('../lib/scott/businessFacts');
const { SNAPSHOT_LABEL } = require('../lib/scott/config');
const { requireScottPageAccess, requireScottApiAccess, hasScottAccess } = require('../lib/scott/access');
const { runTurn, isScottAIEnabled } = require('../lib/scott/orchestrator');

const router = express.Router();

// Small, JSON-safe projection of WORKERS used by the client-side chat
// widget (views/scott/partials/chat-widget.ejs) — only the fields the
// browser actually needs to render an avatar/name/role, never scope,
// permissions or personality text (those stay server-side, inside the
// system prompts the browser never sees).
const WORKERS_BY_ID_JSON = {};
WORKER_IDS.forEach((id) => {
  WORKERS_BY_ID_JSON[id] = {
    characterName: WORKERS[id].characterName,
    displayRole: WORKERS[id].displayRole,
    accent: WORKERS[id].accent,
    initials: WORKERS[id].initials
  };
});

function noindexHeader(req, res, next) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}

// Same 5-per-15-minutes shape as the main site's login limiter
// (routes/auth.js), applied separately here so a brute-force attempt
// against Scott's login can't also exhaust the main site's login budget,
// or vice versa.
const scottLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false
});

// Invited-only, low-volume by design — this is generous enough for a real
// demo session, not for scripted abuse.
const scottChatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  keyGenerator: (req) => `u:${req.session?.user?.id || 'anon'}`,
  message: { error: 'Too many messages this hour. Please try again later.' }
});

const DUMMY_HASH = bcrypt.hashSync('scott-timing-equaliser-not-a-real-password', 12);

function safeNextPath(next) {
  // Only ever allow a same-origin path back into /scott/*, never an
  // external redirect target — the same discipline as any open-redirect
  // guard, applied here because `next` comes straight from a query string.
  if (typeof next === 'string' && /^\/scott(\/|$)/.test(next)) return next;
  return '/scott';
}

function mountPageRoute(app, generateCsrfToken) {
  app.get('/scott/login', noindexHeader, async (req, res, next) => {
    try {
      if (req.session.user) {
        const allowed = await hasScottAccess(req.session.user);
        if (allowed) return res.redirect(safeNextPath(req.query.next));
      }
      res.render('scott/login', {
        error: null,
        csrfToken: generateCsrfToken(req, res),
        nextPath: safeNextPath(req.query.next)
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/scott', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const [summary, activity, approvals] = await Promise.all([
        repo.getDashboardSummary(),
        repo.getRecentActivity(10),
        repo.getPendingApprovals()
      ]);
      res.render('scott/dashboard', {
        user: req.session.user,
        workers: WORKER_IDS.map((id) => WORKERS[id]),
        summary,
        activity,
        approvals,
        snapshotCards: OPERATING_SNAPSHOT_CARDS,
        snapshotLabel: SNAPSHOT_LABEL,
        aiEnabled: isScottAIEnabled(),
        workersById: WORKERS_BY_ID_JSON,
        navCounts: { newEnquiries: summary.newEnquiries, pendingApprovals: summary.pendingApprovals },
        csrfToken: generateCsrfToken(req, res)
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/scott/jobs', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const status = ['enquiry', 'quoted', 'scheduled', 'in_progress', 'awaiting_parts', 'on_hold', 'completed', 'delivered'].includes(req.query.status) ? req.query.status : null;
      const jobs = await repo.getJobs({ status, atRiskOnly: req.query.at_risk === '1' });
      const navCounts = await repo.getDashboardSummary();
      res.render('scott/jobs', { user: req.session.user, jobs, status, navCounts, csrfToken: generateCsrfToken(req, res) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/scott/jobs/:ref', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const job = await repo.getJobByRef(String(req.params.ref || '').toUpperCase());
      if (!job) return res.status(404).render('scott/not-found', { user: req.session.user, kind: 'job' });
      const activity = (await repo.getRecentActivity(200)).filter((a) => a.related_job_id === job.id);
      const navCounts = await repo.getDashboardSummary();
      res.render('scott/job', { user: req.session.user, job, activity, navCounts, workersById: WORKERS_BY_ID_JSON, aiEnabled: isScottAIEnabled(), csrfToken: generateCsrfToken(req, res) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/scott/enquiries', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const status = ['new', 'routed', 'responded', 'closed'].includes(req.query.status) ? req.query.status : null;
      const enquiries = await repo.getEnquiries({ status });
      const navCounts = await repo.getDashboardSummary();
      res.render('scott/enquiries', { user: req.session.user, enquiries, status, workers: WORKERS, navCounts, csrfToken: generateCsrfToken(req, res) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/scott/enquiries/:id', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const enquiry = Number.isInteger(id) ? await repo.getEnquiryById(id) : null;
      if (!enquiry) return res.status(404).render('scott/not-found', { user: req.session.user, kind: 'enquiry' });
      const navCounts = await repo.getDashboardSummary();
      res.render('scott/enquiry', { user: req.session.user, enquiry, workers: WORKERS, navCounts, workersById: WORKERS_BY_ID_JSON, aiEnabled: isScottAIEnabled(), csrfToken: generateCsrfToken(req, res) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/scott/approvals', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const approvals = await repo.getPendingApprovals();
      const navCounts = await repo.getDashboardSummary();
      res.render('scott/approvals', { user: req.session.user, approvals, workers: WORKERS, navCounts, csrfToken: generateCsrfToken(req, res) });
    } catch (err) {
      next(err);
    }
  });
}

// ------------------------------------------------------------
// POST / API routes (behind the site's global CSRF middleware)
// ------------------------------------------------------------

router.post('/scott/login', noindexHeader, scottLoginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const nextPath = safeNextPath(req.body.next);

  if (!username || !password) {
    return res.render('scott/login', { error: 'Username and password required.', nextPath });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, username, password_hash, role FROM users WHERE username = $1',
      [String(username).toLowerCase().trim()]
    );

    if (rows.length === 0) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.render('scott/login', { error: 'Invalid credentials.', nextPath });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.render('scott/login', { error: 'Invalid credentials.', nextPath });
    }

    req.session.user = { id: user.id, username: user.username, role: user.role };

    const allowed = await hasScottAccess(req.session.user);
    if (!allowed) {
      return res.render('scott/login', {
        error: "That's a valid login, but this account has not been invited to the Scott demonstration. Ask Tom to grant access via Page access.",
        nextPath
      });
    }

    await db.query(
      'INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [user.id, 'login', `${user.username} logged in to the Scott AI Demonstration`]
    );

    res.redirect(nextPath);
  } catch (err) {
    console.error('Scott login error:', err);
    res.render('scott/login', { error: 'Something went wrong. Please try again.', nextPath });
  }
});

router.post('/api/scott/messages', noindexHeader, requireScottApiAccess, scottChatLimiter, async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim().slice(0, 4000);
    if (!message) return res.status(400).json({ error: 'Message required.' });
    if (!isScottAIEnabled()) {
      return res.status(503).json({ error: 'Live AI is not enabled in this environment yet. Ask Tom to set ANTHROPIC_API_KEY and ENABLE_SCOTT_AI.' });
    }

    let conversationId = parseInt(req.body?.conversationId, 10);
    let conversation;
    if (Number.isInteger(conversationId)) {
      conversation = await repo.getConversation(conversationId, req.session.user.id);
      if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
    } else {
      conversation = await repo.createConversation(req.session.user.id, message.slice(0, 80));
      conversationId = conversation.id;
    }

    const history = await repo.getMessages(conversationId);
    await repo.addMessage({ conversationId, sender: 'user', content: message });

    const turn = await runTurn({ userMessage: message, history });

    if (turn.receptionist.note) {
      await repo.addMessage({ conversationId, sender: 'worker', workerId: 'receptionist', content: turn.receptionist.note, technicalFailure: turn.receptionist.technicalFailure });
    }

    for (const wr of turn.workerReplies) {
      await repo.addMessage({
        conversationId,
        sender: 'worker',
        workerId: wr.workerId,
        content: wr.reply,
        certainty: wr.certainty,
        technicalFailure: wr.technicalFailure
      });

      // A worker's own honest escalation flag decides whether its proposed
      // writeback needs a human decision before it counts as part of the
      // demonstration's own record, or can be appended immediately. Either
      // way this only ever appends a note to scott_writebacks/scott_activity
      // — never a direct mutation of a job/enquiry's structured columns
      // (see the schema header comment in db/schema.sql for why), and never
      // anything resembling a write to the real Scott Drive brain.
      if (wr.writeback) {
        await repo.createWriteback({
          conversationId,
          proposingWorkerId: wr.workerId,
          intentType: wr.writeback.record,
          summary: wr.writeback.summary,
          requiresApproval: !!wr.escalation
        });
      }
    }

    res.json({
      conversationId,
      receptionist: { note: turn.receptionist.note, technicalFailure: turn.receptionist.technicalFailure },
      workerReplies: turn.workerReplies.map((wr) => ({
        workerId: wr.workerId,
        characterName: wr.worker.characterName,
        displayRole: wr.worker.displayRole,
        accent: wr.worker.accent,
        initials: wr.worker.initials,
        reply: wr.reply,
        certainty: wr.certainty,
        escalation: wr.escalation,
        writeback: wr.writeback,
        technicalFailure: wr.technicalFailure
      }))
    });
  } catch (err) {
    console.error('Scott chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.get('/api/scott/conversations/:id/messages', noindexHeader, requireScottApiAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const conversation = Number.isInteger(id) ? await repo.getConversation(id, req.session.user.id) : null;
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
    const messages = await repo.getMessages(id);
    res.json({ messages: messages.map((m) => ({ ...m, worker: m.worker_id ? { characterName: getWorker(m.worker_id)?.characterName, displayRole: getWorker(m.worker_id)?.displayRole, accent: getWorker(m.worker_id)?.accent, initials: getWorker(m.worker_id)?.initials } : null })) });
  } catch (err) {
    console.error('Scott messages fetch error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/api/scott/approvals/:id/decide', noindexHeader, requireScottApiAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const decision = req.body?.decision === 'approve' ? 'approve' : (req.body?.decision === 'reject' ? 'reject' : null);
    if (!Number.isInteger(id) || !decision) return res.status(400).json({ error: 'Invalid request.' });
    const writeback = await repo.decideWriteback(id, decision, req.session.user.id);
    if (!writeback) return res.status(404).json({ error: 'Not found or already decided.' });
    res.json({ ok: true, writeback });
  } catch (err) {
    console.error('Scott approval decide error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.get('/api/scott/search', noindexHeader, requireScottApiAccess, async (req, res) => {
  try {
    const results = await repo.searchAll(String(req.query.q || ''));
    res.json(results);
  } catch (err) {
    console.error('Scott search error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = { router, mountPageRoute };
