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
const sanitizeHtml = require('sanitize-html');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const db = require('../db/pool');
const repo = require('../lib/scott/data/repository');
const { WORKERS, WORKER_IDS, ACTIVE_WORKER_IDS, ROUTABLE_WORKER_IDS, PROPOSED_WORKER_IDS, getWorker } = require('../lib/scott/workers');
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

// Public, unauthenticated form — same shape as the real site's
// publicFormLimiter (routes/leads.js): generous for a real visitor,
// stingy for a spam script. Separate limiter from everything else here
// since this is the one Scott route reachable with no invitation at all.
const scottLeadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many requests. Please try again later.' }
});

const plainText = (s, max) => sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim().slice(0, max || 4000);
const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 255;

// Gives a returning visitor continuity: the most recent conversation for
// this exact context (general dashboard chat, or scoped to one job/
// enquiry) is loaded and handed to the chat widget instead of starting a
// blank thread on every reload.
async function loadChatBootstrap(userId, { jobId, enquiryId } = {}) {
  const conversation = await repo.getLatestConversation(userId, { jobId, enquiryId });
  if (!conversation) return { initialConversationId: null, initialMessages: [] };
  const rawMessages = await repo.getMessages(conversation.id);
  const initialMessages = rawMessages.map((m) => {
    if (m.sender === 'user') return { sender: 'user', content: m.content };
    const w = getWorker(m.worker_id);
    return {
      sender: 'worker',
      workerId: m.worker_id,
      characterName: w ? w.characterName : (m.worker_id || 'Worker'),
      displayRole: w ? w.displayRole : '',
      accent: w ? w.accent : '#5c6b62',
      initials: w ? w.initials : '?',
      content: m.content,
      certainty: m.certainty,
      technicalFailure: m.technical_failure
    };
  });
  return { initialConversationId: conversation.id, initialMessages };
}

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
      let error = null;
      if (req.session.user) {
        const allowed = await hasScottAccess(req.session.user);
        if (allowed) return res.redirect(safeNextPath(req.query.next));
        // Logged in (to the main site) but not invited to this demo — say
        // so plainly rather than silently re-showing a blank login form,
        // which would otherwise look like the previous submission was
        // simply ignored.
        error = `You're signed in as ${req.session.user.username}, but that account has not been invited to the Scott demonstration. Ask Tom to grant access via Page access, or sign in as a different account below.`;
      }
      res.render('scott/login', {
        error,
        csrfToken: generateCsrfToken(req, res),
        nextPath: safeNextPath(req.query.next)
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/scott', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const [summary, activity, approvals, chatBootstrap] = await Promise.all([
        repo.getDashboardSummary(),
        repo.getRecentActivity(10),
        repo.getPendingApprovals(),
        loadChatBootstrap(req.session.user.id)
      ]);
      res.render('scott/dashboard', {
        user: req.session.user,
        // Active team only — never includes the three proposed v0.2
        // workers (finance_accounts/people_hr/quality_control). Doc 24's
        // independent governance review has no verdict recorded, so
        // "Only active worker personas are presented as active staff"
        // means exactly this list, not WORKER_IDS.
        workers: ACTIVE_WORKER_IDS.map((id) => WORKERS[id]),
        proposedWorkers: PROPOSED_WORKER_IDS.map((id) => WORKERS[id]),
        summary,
        activity,
        approvals,
        snapshotCards: OPERATING_SNAPSHOT_CARDS,
        snapshotLabel: SNAPSHOT_LABEL,
        aiEnabled: isScottAIEnabled(),
        workersById: WORKERS_BY_ID_JSON,
        navCounts: { newEnquiries: summary.newEnquiries, pendingApprovals: summary.pendingApprovals },
        initialConversationId: chatBootstrap.initialConversationId,
        initialMessages: chatBootstrap.initialMessages,
        csrfToken: generateCsrfToken(req, res)
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/scott/jobs', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const status = repo.JOB_STATUSES.includes(req.query.status) ? req.query.status : null;
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
      const chatBootstrap = await loadChatBootstrap(req.session.user.id, { jobId: job.id });
      res.render('scott/job', {
        user: req.session.user, job, activity, navCounts,
        workersById: WORKERS_BY_ID_JSON, workers: WORKERS, jobStatuses: repo.JOB_STATUSES,
        aiEnabled: isScottAIEnabled(),
        initialConversationId: chatBootstrap.initialConversationId,
        initialMessages: chatBootstrap.initialMessages,
        csrfToken: generateCsrfToken(req, res)
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/scott/enquiries', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const status = repo.ENQUIRY_STATUSES.includes(req.query.status) ? req.query.status : null;
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
      const chatBootstrap = await loadChatBootstrap(req.session.user.id, { enquiryId: enquiry.id });
      res.render('scott/enquiry', {
        user: req.session.user, enquiry, workers: WORKERS, navCounts,
        workersById: WORKERS_BY_ID_JSON, aiEnabled: isScottAIEnabled(),
        initialConversationId: chatBootstrap.initialConversationId,
        initialMessages: chatBootstrap.initialMessages,
        csrfToken: generateCsrfToken(req, res)
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/scott/approvals', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const approvals = await repo.getPendingApprovals();
      // "Review quote" support: for a customer-facing draft, pull in every
      // other worker's reply from the same conversation (e.g. Commercial's
      // actual price statement) so the reviewer sees what the draft is
      // based on, not just the drafted wording in isolation.
      for (const a of approvals) {
        a.context = a.intent_type === 'customer_reply_draft'
          ? (await repo.getConversationContextForWriteback(a)).filter((m) => m.worker_id !== a.proposing_worker_id)
          : [];
      }
      const navCounts = await repo.getDashboardSummary();
      res.render('scott/approvals', { user: req.session.user, approvals, workers: WORKERS, workersById: WORKERS_BY_ID_JSON, navCounts, csrfToken: generateCsrfToken(req, res) });
    } catch (err) {
      next(err);
    }
  });

  // Public — no requireScottPageAccess. A prospective (fictional) customer
  // filling this in has no invitation and no account; this is the one
  // Scott route deliberately reachable by anyone with the link, same
  // reasoning as the real site's own public lead form (routes/leads.js).
  app.get('/scott/lead', noindexHeader, (req, res) => {
    res.render('scott/lead', { csrfToken: generateCsrfToken(req, res), sent: false, error: null });
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

// Shared by the live chat endpoint below and the lead-intake auto-draft /
// redraft flows: runs one turn, persists every message, and applies the
// writeback/governance rules consistently regardless of what triggered it.
//
// GOVERNANCE ENFORCEMENT (structural, not merely prompted): whenever
// Customers & Marketing is routed on an enquiry-scoped conversation and
// doesn't refuse, its ENTIRE reply is treated as a customer-facing draft
// requiring human approval — always, regardless of whether the model
// remembered to set its own optional `writeback`/`escalation` fields. The
// Master Rulebook already requires Tom's real approval for any external
// send from this worker; this makes that a server-side gate rather than
// something resting on the model's own self-reporting, exactly the
// "structural, not merely prompted" isolation this whole build is for.
async function runScottTurnAndPersist({ conversation, conversationId, userMessage }) {
  const history = await repo.getMessages(conversationId);
  await repo.addMessage({ conversationId, sender: 'user', content: userMessage });

  const turn = await runTurn({ userMessage, history });

  if (turn.receptionist.note) {
    await repo.addMessage({ conversationId, sender: 'worker', workerId: 'receptionist', content: turn.receptionist.note, technicalFailure: turn.receptionist.technicalFailure });
  }

  // Deterministic bookkeeping, not an AI-driven write: if this
  // conversation is scoped to an enquiry that's still sitting in 'new',
  // Ruth having genuinely routed it to a worker this turn is exactly the
  // "Ruth routes it" moment from the workflow brief — reflect that on the
  // enquiry record itself so the enquiries list shows real state.
  if (conversation.related_enquiry_id && turn.workerReplies.length > 0) {
    await repo.assignEnquiryIfNew(conversation.related_enquiry_id, turn.workerReplies[0].workerId);
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

    // Prefer the conversation's own scope (started from a job/enquiry
    // detail page or a lead); fall back to whatever job this turn's
    // entity extraction matched, so an approved writeback actually shows
    // up in that record's own activity feed, not only the approvals queue.
    const relatedJobId = conversation.related_job_id || (turn.entities && turn.entities.job ? turn.entities.job.id : null);
    const relatedEnquiryId = conversation.related_enquiry_id || null;
    const isCustomerFacingDraft = wr.workerId === 'customers_marketing' && relatedEnquiryId && !wr.refused && !wr.technicalFailure;

    if (isCustomerFacingDraft) {
      await repo.createWriteback({
        conversationId,
        proposingWorkerId: wr.workerId,
        intentType: 'customer_reply_draft',
        summary: wr.reply,
        relatedJobId,
        relatedEnquiryId,
        requiresApproval: true
      });
    } else if (wr.writeback) {
      // A worker's own honest escalation flag decides whether this
      // (non-customer-facing) proposed change needs a human decision
      // before it counts as part of the demonstration's own record, or
      // can be appended immediately. Either way this only ever appends a
      // note to scott_writebacks/scott_activity — never a direct mutation
      // of a job/enquiry's structured columns (see the schema header
      // comment in db/schema.sql for why), and never anything resembling
      // a write to the real Scott Drive brain.
      await repo.createWriteback({
        conversationId,
        proposingWorkerId: wr.workerId,
        intentType: wr.writeback.record,
        summary: wr.writeback.summary,
        relatedJobId,
        relatedEnquiryId,
        requiresApproval: !!wr.escalation
      });
    }
  }

  return turn;
}

function serializeTurn(conversationId, turn) {
  return {
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
  };
}

// Public — no requireScottApiAccess, same reasoning as GET /scott/lead
// above. Honeypot field ('website') left blank by real visitors; a
// filled-in value means a bot, so this pretends success without writing
// anything, same pattern as the real site's POST /api/leads.
router.post('/api/scott/lead', noindexHeader, scottLeadLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    if (plainText(body.website)) {
      return res.json({ ok: true });
    }

    const name = plainText(body.name, 200);
    const email = plainText(body.email, 255);
    const message = plainText(body.message, 2000);

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email and message are all required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const enquiry = await repo.createLeadEnquiry({ name, email, message });
    await repo.addActivity({
      actor: 'system',
      eventType: 'lead_received',
      summary: `New enquiry received via the website form from ${name}.`,
      relatedEnquiryId: enquiry.id
    });

    // Respond immediately — a real visitor should never sit waiting on a
    // multi-worker AI turn just to get a "thanks, we'll be in touch".
    // Drafting continues after the response, same fire-and-forget shape
    // as the real site's own lead-notification emails (routes/leads.js).
    res.json({ ok: true });

    if (isScottAIEnabled()) {
      (async () => {
        try {
          const conversation = await repo.createConversation(null, `Lead: ${name}`, { enquiryId: enquiry.id });
          await runScottTurnAndPersist({ conversation, conversationId: conversation.id, userMessage: message });
        } catch (err) {
          console.error('Scott lead auto-draft failed:', err.message);
        }
      })();
    }
  } catch (err) {
    console.error('Scott lead submission error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
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
      // A message sent from a job or enquiry detail page carries that
      // record's id so the new conversation is scoped to it (see
      // loadChatBootstrap in mountPageRoute, which looks a scoped
      // conversation back up on the next page load).
      const relatedJobId = Number.isInteger(parseInt(req.body?.relatedJobId, 10)) ? parseInt(req.body.relatedJobId, 10) : null;
      const relatedEnquiryId = Number.isInteger(parseInt(req.body?.relatedEnquiryId, 10)) ? parseInt(req.body.relatedEnquiryId, 10) : null;
      conversation = await repo.createConversation(req.session.user.id, message.slice(0, 80), { jobId: relatedJobId, enquiryId: relatedEnquiryId });
      conversationId = conversation.id;
    }

    const turn = await runScottTurnAndPersist({ conversation, conversationId, userMessage: message });
    res.json(serializeTurn(conversationId, turn));
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

// decision: 'approve' (Agree, or Modify & Agree when `text` is given) or
// 'reject'. `text`, when present on an approve, is the human-edited
// version of the draft — this is the "Modify" action: a human editing an
// AI's proposed wording before agreeing to it, never the AI editing its
// own output.
router.post('/api/scott/approvals/:id/decide', noindexHeader, requireScottApiAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const decision = req.body?.decision === 'approve' ? 'approve' : (req.body?.decision === 'reject' ? 'reject' : null);
    const editedText = typeof req.body?.text === 'string' ? plainText(req.body.text, 4000) : null;
    if (!Number.isInteger(id) || !decision) return res.status(400).json({ error: 'Invalid request.' });
    const writeback = await repo.decideWriteback(id, decision, req.session.user.id, editedText);
    if (!writeback) return res.status(404).json({ error: 'Not found or already decided.' });
    res.json({ ok: true, writeback });
  } catch (err) {
    console.error('Scott approval decide error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// "Redraft": supersede the current pending draft (not reject — the human
// isn't saying no, just asking the team to try again) and run a fresh AI
// turn on the same enquiry-scoped conversation, asking explicitly for a
// different attempt so the model doesn't just repeat itself.
router.post('/api/scott/approvals/:id/redraft', noindexHeader, requireScottApiAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid request.' });
    if (!isScottAIEnabled()) return res.status(503).json({ error: 'Live AI is not enabled in this environment yet.' });

    const existing = await repo.getWritebackById(id);
    if (!existing || existing.status !== 'pending_approval') return res.status(404).json({ error: 'Not found or already decided.' });
    if (existing.intent_type !== 'customer_reply_draft' || !existing.conversation_id) {
      return res.status(400).json({ error: 'Only a customer reply draft can be redrafted.' });
    }

    const superseded = await repo.supersedeWriteback(id, req.session.user.id);
    if (!superseded) return res.status(404).json({ error: 'Not found or already decided.' });

    const conversation = await repo.getConversation(existing.conversation_id, req.session.user.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const turn = await runScottTurnAndPersist({
      conversation,
      conversationId: existing.conversation_id,
      userMessage: '(Internal note from the team: the previous draft reply needs another attempt — please draft a fresh reply to the customer\'s original message.)'
    });
    res.json(serializeTurn(existing.conversation_id, turn));
  } catch (err) {
    console.error('Scott redraft error:', err);
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

// Direct human action — an explicit "Assign to..." control on the enquiry
// detail page. workerId '' (unassign) is allowed; anything else must be a
// real routable worker id. Never triggered by an AI reply's JSON.
router.post('/api/scott/enquiries/:id/assign', noindexHeader, requireScottApiAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const workerId = req.body?.workerId ? String(req.body.workerId) : null;
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid request.' });
    if (workerId && !ROUTABLE_WORKER_IDS.includes(workerId)) return res.status(400).json({ error: 'Unknown worker.' });
    const enquiry = await repo.setEnquiryAssignment(id, workerId, workerId ? 'routed' : 'new');
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found.' });
    await repo.addActivity({
      actor: 'user',
      eventType: 'enquiry_assigned',
      summary: workerId
        ? `${req.session.user.username} assigned this enquiry to ${WORKERS[workerId].characterName}.`
        : `${req.session.user.username} unassigned this enquiry.`,
      relatedEnquiryId: id
    });
    res.json({ ok: true, enquiry });
  } catch (err) {
    console.error('Scott enquiry assign error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// Direct human action — an explicit "Update status" control on the job
// detail page. Never triggered by an AI reply's JSON (see the schema
// header comment in db/schema.sql for why structured-column writes stay
// code-driven only).
router.post('/api/scott/jobs/:ref/status', noindexHeader, requireScottApiAccess, async (req, res) => {
  try {
    const ref = String(req.params.ref || '').toUpperCase();
    const status = String(req.body?.status || '');
    if (!repo.JOB_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const job = await repo.getJobByRef(ref);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    const updated = await repo.setJobStatus(job.id, status);
    await repo.addActivity({
      actor: 'user',
      eventType: 'job_status_changed',
      summary: `${req.session.user.username} changed ${ref}'s status from ${job.status.replace('_', ' ')} to ${status.replace('_', ' ')}.`,
      relatedJobId: job.id
    });
    res.json({ ok: true, job: updated });
  } catch (err) {
    console.error('Scott job status update error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = { router, mountPageRoute, runScottTurnAndPersist };
