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
const clearance = require('../lib/scott/clearance');
const deepFacts = require('../lib/scott/deepBusinessFacts');
const contextBuilders = require('../lib/scott/data/contextBuilders');
const brainGaps = require('../lib/scott/brainGaps');
const { sendGapNotification } = require('../lib/scott/gapNotifier');

const router = express.Router();

// Absolute, because it goes into an email. Overridable so a staging
// deployment links a reader back to staging rather than to production.
const SITE_ORIGIN = process.env.SCOTT_PORTAL_ORIGIN || 'https://www.arringtonconsultancy.com';

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

// One uniform shape for "who is looking at this page", covering both
// identity kinds: a real site account (Tom/nat, possibly impersonating a
// fictional clearance) and a fictional staff login from
// scott_portal_users.
//
// realUserId is the load-bearing field. It is a users(id) foreign key and
// MUST be null for a fictional staff session, because those accounts
// deliberately have no users row. Passing a scott_portal_users id into
// scott_conversations.user_id / scott_writebacks.decided_by_user_id would
// either violate the FK or, worse, silently attribute a fictional staff
// action to whichever real user happened to share that integer id.
function viewer(req) {
  const portal = clearance.getPortalUser(req);
  if (portal) {
    return {
      kind: 'portal',
      username: portal.username,
      displayName: portal.displayName,
      jobTitle: portal.jobTitle,
      realUserId: null,
      // The fictional staff member's OWN id, in scott_portal_users.
      // realUserId stays null because it is a users(id) foreign key they
      // genuinely have no row in, but a null is not an identity: every
      // portal user used to look identical to every other one and to the
      // public lead form. Ownership is this field.
      portalUserId: portal.id,
      personaId: portal.personaId,
      canImpersonate: false
    };
  }
  const u = req.session.user;
  return {
    kind: 'site',
    username: u ? u.username : 'unknown',
    displayName: u ? u.username : 'unknown',
    jobTitle: '',
    realUserId: u ? u.id : null,
    portalUserId: null,
    personaId: clearance.getEffectivePersonaId(req),
    canImpersonate: clearance.canImpersonate(req)
  };
}

// Everything a view needs to render the sidebar identity block, the
// clearance banner and (for Tom only) the demonstration-mode control.
function viewerViewModel(req) {
  const v = viewer(req);
  const personaId = clearance.getEffectivePersonaId(req);
  return {
    user: v,
    personaId,
    persona: clearance.getPersona(personaId),
    personas: clearance.PERSONAS,
    canImpersonate: v.canImpersonate,
    isImpersonating: clearance.isImpersonating(req),
    canSee: (domain) => clearance.personaCanSeeDomain(personaId, domain),
    // Per-field gate. A view must read any field that carries a fact from
    // another domain through this rather than off the record directly:
    // `field(rec, 'poRef')` returns undefined when this viewer is not
    // cleared for what that field actually contains. workerId is null
    // because a portal page is a human reading a screen, with no worker
    // mediating the read.
    field: (record, name) => clearance.fieldValue(personaId, null, record, name),
    deniedNote: clearance.clearanceDeniedNote,
    dataPages: NAV_PAGES
  };
}

// Server-side action authority. Every mutating Scott endpoint goes
// through this, because until now they went through nothing: they were
// gated only on "is this person invited to the demo", and the difference
// between a knitting operative and the owner was that one of them had the
// button on screen. Hiding a control is not access control.
//
// The domain each action requires lives in clearance.js, derived from the
// rule that acting on a record requires the clearance to see it.
// Who decided a writeback. decided_by_user_id is a users(id) foreign
// key that a fictional staff member has no row in, so their decision used
// to be recorded as NULL, indistinguishable from a decision nobody made.
// Both identities are now recorded explicitly.
function decidedByIdentity(req) {
  const v = viewer(req);
  return { realUserId: v.realUserId, portalUserId: v.portalUserId, displayName: v.displayName };
}

function requireAction(action) {
  return (req, res, next) => {
    const personaId = clearance.getEffectivePersonaId(req);
    if (!clearance.personaCanAct(personaId, action)) {
      return res.status(403).json({ error: clearance.actionDeniedNote(action) });
    }
    next();
  };
}

function noindexHeader(req, res, next) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}

// Same 5-per-15-minutes shape as the main site's login limiter
// (routes/auth.js), applied separately here so a brute-force attempt
// against Scott's login can't also exhaust the main site's login budget,
// or vice versa.
// Keyed by IP AND username rather than IP alone. The thing worth
// rate-limiting is guessing at one account's password, and that is still
// capped at five tries per quarter hour. Keying on IP alone additionally
// punished something legitimate and specific to this demonstration:
// several people signing in as different fictional staff from one office
// network, which is exactly how the clearance model gets shown. The sixth
// person through the door was being locked out by the first five, for no
// security gain.
//
// Deliberately separate from the main site's login limiter in
// routes/auth.js, which is unchanged: a brute-force attempt against Scott
// must not exhaust the real site's budget, or vice versa.
const scottLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const username = String((req.body && req.body.username) || '').toLowerCase().slice(0, 64);
    return `${ipKeyGenerator(req)}|${username}`;
  },
  message: 'Too many login attempts for that account. Please try again in 15 minutes.',
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
// The identity a conversation is owned by and conducted at. Exactly one
// of realUserId / portalUserId is set; personaId is the clearance, and is
// what stops a lower-clearance reader inheriting a higher-clearance
// thread.
function conversationIdentity(req) {
  const v = viewer(req);
  return {
    realUserId: v.realUserId,
    portalUserId: v.portalUserId,
    personaId: clearance.getEffectivePersonaId(req)
  };
}

async function loadChatBootstrap(identity, { jobId, enquiryId } = {}) {
  const conversation = await repo.getLatestConversation(identity, { jobId, enquiryId });
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

// Company Brain view model: what this reader can see of the whole record
// set, and what is being kept from them.
//
// Both halves are counted from the SAME filtered pass, so the visible
// counts are counts of visible records and nothing on the page is derived
// from a number the reader is not entitled to. The withheld list names
// the AREA only, never a count and never an example: "there are complaints
// you cannot read" is a fair thing to tell someone, "there are eleven of
// them" starts leaking the shape of what is hidden, which 07Q's
// no-bypass rule is about as much as the content itself.
function buildBrainViewModel(personaId) {
  const all = contextBuilders.allDeepFactRecords();
  const visible = clearance.filterAndRedact(personaId, null, all);

  const visibleCounts = new Map();
  visible.forEach((r) => visibleCounts.set(r.domain, (visibleCounts.get(r.domain) || 0) + 1));

  // An example drawn from a record this reader can already see, so the
  // preview line cannot itself become the leak.
  const exampleFor = (domain) => {
    const rec = visible.find((r) => r.domain === domain);
    if (!rec) return '';
    return String(rec.ref || rec.name || rec.sku || rec.person || rec.role || Object.values(rec)[1] || '').slice(0, 90);
  };

  const allDomains = [...new Set(all.map((r) => r.domain))];
  return {
    visibleCount: visible.length,
    visibleDomains: [...visibleCounts.keys()]
      .map((d) => ({ domain: d, label: clearance.domainLabel(d), count: visibleCounts.get(d), example: exampleFor(d) }))
      .sort((a, b) => b.count - a.count),
    withheldDomains: allDomains
      .filter((d) => !visibleCounts.has(d))
      .map((d) => ({ domain: d, label: clearance.domainLabel(d) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  };
}

// The portal's plain data screens (07A/07E/07G/07I/07K/07N/07S and the
// rest): each reads the deep company record and renders it, with the view
// gating every block on the viewer's own clearance. No AI call happens on
// any of them, which is why they gate by persona alone — see the comment
// above the registration loop below.
//
// `nav` is the sidebar's active-link key and must match the `active` value
// the view passes to partials/sidebar; the sidebar link list is built from
// this same table so a page can never be routed but unreachable, or
// listed in the nav but 404.
const DATA_PAGES = [
  { path: '/scott/pipeline', view: 'scott/pipeline', nav: 'pipeline', label: 'Pipeline & Quotes' },
  { path: '/scott/customers', view: 'scott/customers', nav: 'customers', label: 'Customers' },
  { path: '/scott/complaints', view: 'scott/complaints', nav: 'complaints', label: 'Complaints' },
  { path: '/scott/stock', view: 'scott/stock', nav: 'stock', label: 'Stock & Supply' },
  { path: '/scott/orders', view: 'scott/orders', nav: 'orders', label: 'Purchase Orders' },
  { path: '/scott/people', view: 'scott/people', nav: 'people', label: 'People' },
  { path: '/scott/finance', view: 'scott/finance', nav: 'finance', label: 'Finance' },
  { path: '/scott/quality', view: 'scott/quality', nav: 'quality', label: 'Quality Control' },
  { path: '/scott/marketing', view: 'scott/marketing', nav: 'marketing', label: 'Marketing & Reviews' },
  { path: '/scott/assets', view: 'scott/assets', nav: 'assets', label: 'Assets & Maintenance' },
  { path: '/scott/premises', view: 'scott/premises', nav: 'premises', label: 'Premises & Facilities' },
  { path: '/scott/opportunities', view: 'scott/opportunities', nav: 'opportunities', label: 'Where the Money Goes' },
  { path: '/scott/brain', view: 'scott/brain', nav: 'brain', label: 'Company Brain' }
];

// Needs Human Input has its own route rather than a DATA_PAGES entry
// because it reads live rows and filters them by clearance, which the
// generic deep-facts page renderer does not do.

// What the sidebar lists. Activity has its own route (it takes a filter
// and needs counts), so it is not in DATA_PAGES, but it still has to
// appear in the nav: keeping one list for "registered generically" and a
// separate one for "linked in the nav" is what stops a page being
// reachable but invisible, or listed and 404.
const NAV_PAGES = [
  ...DATA_PAGES,
  { path: '/scott/gaps', nav: 'gaps', label: 'Needs Human Input' },
  { path: '/scott/activity', nav: 'activity', label: 'Activity & Audit' }
];

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
      const [summary, activity, approvals, openGaps, chatBootstrap] = await Promise.all([
        repo.getDashboardSummary(),
        repo.getRecentActivity(10),
        repo.getPendingApprovals(),
        repo.getOpenBrainGaps({ materialOnly: true, limit: 20 }),
        loadChatBootstrap(conversationIdentity(req))
      ]);
      // Same clearance filter as everything else on this page. A gap is
      // surfaced to the person who can actually do something about it,
      // which for most gaps is a smaller group than "everyone logged in".
      const personaId = clearance.getEffectivePersonaId(req);
      const visibleGaps = clearance.filterAndRedact(personaId, null, openGaps);
      res.render('scott/dashboard', {
        ...viewerViewModel(req),
        facts: deepFacts,
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
        openGaps: visibleGaps,
        myGaps: visibleGaps.filter((g) => g.responsible_persona_id === personaId),
        describeNotification: brainGaps.describeNotification,
        snapshotCards: OPERATING_SNAPSHOT_CARDS,
        snapshotLabel: SNAPSHOT_LABEL,
        aiEnabled: isScottAIEnabled(),
        workersById: WORKERS_BY_ID_JSON,
        navCounts: { newEnquiries: summary.newEnquiries, pendingApprovals: summary.pendingApprovals, openGaps: visibleGaps.length },
        initialConversationId: chatBootstrap.initialConversationId,
        initialMessages: chatBootstrap.initialMessages,
        csrfToken: generateCsrfToken(req, res)
      });
    } catch (err) {
      next(err);
    }
  });

  // The gap register. Filtered by exactly the same clearance rule as the
  // records the gaps are about: a gap description quotes the evidence
  // that is missing, so an unfiltered list here would be a way round
  // every other control in the system. That is why the rows go through
  // filterAndRedact rather than being handed straight to the view.
  app.get('/scott/gaps', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const personaId = clearance.getEffectivePersonaId(req);
      const [rows, navCounts] = await Promise.all([
        repo.getBrainGaps({ limit: 100 }),
        repo.getDashboardSummary()
      ]);
      const visible = clearance.filterAndRedact(personaId, null, rows);
      res.render('scott/gaps', {
        ...viewerViewModel(req),
        gaps: visible,
        describeNotification: brainGaps.describeNotification,
        // Their own queue, so the page answers "what is waiting on me"
        // before it answers "what is open in the company".
        mine: visible.filter((g) => g.responsible_persona_id === personaId
          && ['open', 'notified', 'awaiting_source'].includes(g.status)),
        navCounts,
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
      res.render('scott/jobs', { ...viewerViewModel(req), jobs, status, navCounts, csrfToken: generateCsrfToken(req, res) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/scott/jobs/:ref', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const job = await repo.getJobByRef(String(req.params.ref || '').toUpperCase());
      if (!job) return res.status(404).render('scott/not-found', { ...viewerViewModel(req), kind: 'job', navCounts: {}, csrfToken: generateCsrfToken(req, res) });
      const activity = (await repo.getRecentActivity(200)).filter((a) => a.related_job_id === job.id);
      const navCounts = await repo.getDashboardSummary();
      const chatBootstrap = await loadChatBootstrap(conversationIdentity(req), { jobId: job.id });
      res.render('scott/job', {
        ...viewerViewModel(req), job, activity, navCounts,
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
      res.render('scott/enquiries', { ...viewerViewModel(req), enquiries, status, workers: WORKERS, navCounts, csrfToken: generateCsrfToken(req, res) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/scott/enquiries/:id', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const enquiry = Number.isInteger(id) ? await repo.getEnquiryById(id) : null;
      if (!enquiry) return res.status(404).render('scott/not-found', { ...viewerViewModel(req), kind: 'enquiry', navCounts: {}, csrfToken: generateCsrfToken(req, res) });
      const navCounts = await repo.getDashboardSummary();
      const chatBootstrap = await loadChatBootstrap(conversationIdentity(req), { enquiryId: enquiry.id });
      res.render('scott/enquiry', {
        ...viewerViewModel(req), enquiry, workers: WORKERS, navCounts,
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
      res.render('scott/approvals', { ...viewerViewModel(req), approvals, workers: WORKERS, workersById: WORKERS_BY_ID_JSON, navCounts, csrfToken: generateCsrfToken(req, res) });
    } catch (err) {
      next(err);
    }
  });

  // Finance and Quality Control are plain data pages (07A/07N), not AI
  // conversations — read the block comment above clearance.js's
  // getSessionPersonaId for why persona clearance gates a raw portal view
  // by PERSONA alone (personaCanSeeDomain), with no worker permission in
  // the intersection: there is no worker mediating "a human looked at a
  // page". Worker permission only enters when an AI call assembles context
  // (isDomainVisible), which these two routes do not do.
  // One registration for all of them rather than eight near-identical
  // handlers: every one of these pages is the same shape (read the deep
  // company record, hand it to a view, let the view's own canSee() calls
  // decide what appears). Registering them from a list means a new data
  // page cannot accidentally ship without noindexHeader or the access
  // guard, which is the failure worth designing against here.
  DATA_PAGES.forEach(({ path, view }) => {
    app.get(path, noindexHeader, requireScottPageAccess, async (req, res, next) => {
      try {
        const navCounts = await repo.getDashboardSummary();
        res.render(view, {
          ...viewerViewModel(req),
          navCounts,
          facts: deepFacts,
          brain: buildBrainViewModel(clearance.getEffectivePersonaId(req)),
          csrfToken: generateCsrfToken(req, res)
        });
      } catch (err) {
        next(err);
      }
    });
  });

  // Activity and audit. Its own route rather than a DATA_PAGES entry
  // because it takes a filter and its totals are counted in SQL over the
  // whole table, not over the page being displayed.
  app.get('/scott/activity', noindexHeader, requireScottPageAccess, async (req, res, next) => {
    try {
      const by = ['worker', 'human'].includes(req.query.by) ? req.query.by : null;
      const [navCounts, activity, activityStats] = await Promise.all([
        repo.getDashboardSummary(),
        repo.getActivityFeed({ by, workerIds: WORKER_IDS, limit: 200 }),
        repo.getActivityStats(WORKER_IDS)
      ]);
      res.render('scott/activity', {
        ...viewerViewModel(req),
        navCounts,
        activity,
        activityStats,
        filter: by,
        workersById: WORKERS_BY_ID_JSON,
        csrfToken: generateCsrfToken(req, res)
      });
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
    const uname = String(username).toLowerCase().trim();

    // Fictional staff accounts first (scott_portal_users). These are the
    // demonstration logins: authenticating here binds this session to that
    // person's clearance server-side, and they cannot change it or
    // impersonate anyone (see lib/scott/clearance.js). Checked before the
    // real users table because the two namespaces are disjoint (dotted
    // fictional names vs real site usernames) and a fictional login must
    // never fall through into real site auth.
    const { rows: staffRows } = await db.query(
      'SELECT id, username, password_hash, persona_id, display_name, job_title, active FROM scott_portal_users WHERE username = $1',
      [uname]
    );
    if (staffRows.length > 0) {
      const staff = staffRows[0];
      const staffValid = await bcrypt.compare(password, staff.password_hash);
      if (!staffValid || !staff.active) {
        return res.render('scott/login', { error: 'Invalid credentials.', nextPath });
      }
      // Deliberately does NOT set req.session.user: a fictional staff
      // member is not a real site user and must never acquire real site
      // capability. requireScottPageAccess treats a portal-user session as
      // its own valid identity (see lib/scott/access.js).
      clearance.setPortalUser(req, {
        id: staff.id,
        username: staff.username,
        personaId: staff.persona_id,
        displayName: staff.display_name,
        jobTitle: staff.job_title
      });
      return res.redirect(nextPath);
    }

    const { rows } = await db.query(
      'SELECT id, username, password_hash, role FROM users WHERE username = $1',
      [uname]
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
async function runScottTurnAndPersist({ conversation, conversationId, userMessage, personaId }) {
  const history = await repo.getMessages(conversationId);
  await repo.addMessage({ conversationId, sender: 'user', content: userMessage });

  const turn = await runTurn({ userMessage, history, personaId });

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

  // Evidence gaps, handled entirely separately from approvals above. A
  // worker raising one has NOT been given any say in who hears about it:
  // planGap decides materiality and ownership from controlled records,
  // the send reports its own real result, and both are stored. The reply
  // text the worker wrote is never the source of the "X has been emailed"
  // sentence (see brainGaps.describeNotification and the prompt rule
  // forbidding a worker from claiming it).
  const gapRecords = [];
  for (const wr of turn.workerReplies) {
    if (!wr.gap || wr.technicalFailure) continue;
    const plan = brainGaps.planGap(wr.gap, {
      escalation: wr.escalation,
      askerPersonaId: personaId || null,
      raisedByWorkerId: wr.workerId,
      relatedJobId: conversation.related_job_id || null,
      relatedEnquiryId: conversation.related_enquiry_id || null
    });
    if (!plan) continue;

    let record = await repo.createBrainGap({ ...plan, conversationId });
    if (plan.shouldEmail) {
      // Awaited on purpose, unlike the fire-and-forget lead notifications
      // elsewhere in the codebase. The user is about to be told what
      // happened, and "we have not finished trying yet" is not an answer
      // that can be turned into an honest sentence.
      const result = await sendGapNotification(plan, {
        portalUrl: `${SITE_ORIGIN}/scott/gaps`,
        recipientEmail: await lookupNotifyEmail(plan.responsiblePersonaId)
      });
      record = (await repo.recordGapDelivery(record.id, result)) || record;
    }
    await repo.addActivity({
      actor: wr.workerId,
      eventType: 'brain_gap_raised',
      summary: `Needs human input (${record.gap_type}) in ${record.expected_source || record.domain}: ${record.missing_evidence}`,
      relatedJobId: record.related_job_id,
      relatedEnquiryId: record.related_enquiry_id,
      conversationId
    });
    gapRecords.push(record);
  }
  turn.gapRecords = gapRecords;

  return turn;
}

// A fictional staff member's notification address. They have no real
// mailbox, so this is a per-persona override on top of a single real
// demonstration inbox rather than an invented address that would bounce
// and make the recorded delivery result meaningless.
async function lookupNotifyEmail(personaId) {
  if (!personaId) return null;
  try {
    const { rows } = await db.query(
      'SELECT notify_email FROM scott_portal_users WHERE persona_id = $1 AND notify_email <> $2 LIMIT 1',
      [personaId, '']
    );
    return rows[0] ? rows[0].notify_email : null;
  } catch (err) {
    // A missing column on an un-migrated database must not stop the gap
    // being raised, only stop it being individually addressed.
    console.error('Scott gap notify address lookup failed:', err.message);
    return null;
  }
}

function serializeGapRecord(g) {
  return {
    id: g.id,
    gapType: g.gap_type,
    domain: g.domain,
    missingEvidence: g.missing_evidence,
    whyItMatters: g.why_it_matters,
    expectedSource: g.expected_source,
    responsibleName: g.responsible_name,
    workCanContinue: g.work_can_continue,
    material: g.material,
    status: g.status,
    emailStatus: g.email_status,
    emailAttempts: g.email_attempts,
    // The one sentence the interface is allowed to say about
    // notification, built from the recorded result rather than from the
    // intention to send.
    notification: brainGaps.describeNotification(g)
  };
}

function serializeTurn(conversationId, turn) {
  return {
    conversationId,
    receptionist: { note: turn.receptionist.note, technicalFailure: turn.receptionist.technicalFailure },
    gaps: (turn.gapRecords || []).map(serializeGapRecord),
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
      gap: wr.gap || null,
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
          // No logged-in human at all: a public lead form submission. Owned by
          // neither identity, and conducted at the default clearance so the
          // draft it produces is not readable as though a person held it.
          const conversation = await repo.createConversation(
            { realUserId: null, portalUserId: null, personaId: clearance.DEFAULT_PERSONA },
            `Lead: ${name}`, { enquiryId: enquiry.id });
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
      conversation = await repo.getConversation(conversationId, conversationIdentity(req));
      if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
    } else {
      // A message sent from a job or enquiry detail page carries that
      // record's id so the new conversation is scoped to it (see
      // loadChatBootstrap in mountPageRoute, which looks a scoped
      // conversation back up on the next page load).
      const relatedJobId = Number.isInteger(parseInt(req.body?.relatedJobId, 10)) ? parseInt(req.body.relatedJobId, 10) : null;
      const relatedEnquiryId = Number.isInteger(parseInt(req.body?.relatedEnquiryId, 10)) ? parseInt(req.body.relatedEnquiryId, 10) : null;
      conversation = await repo.createConversation(conversationIdentity(req), message.slice(0, 80), { jobId: relatedJobId, enquiryId: relatedEnquiryId });
      conversationId = conversation.id;
    }

    const turn = await runScottTurnAndPersist({ conversation, conversationId, userMessage: message, personaId: clearance.getSessionPersonaId(req) });
    res.json(serializeTurn(conversationId, turn));
  } catch (err) {
    console.error('Scott chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.get('/api/scott/conversations/:id/messages', noindexHeader, requireScottApiAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const conversation = Number.isInteger(id) ? await repo.getConversation(id, conversationIdentity(req)) : null;
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

    // The required clearance depends on what the writeback is about, so
    // it is checked here rather than in middleware: a customer reply
    // draft needs lead clearance, anything else is a management decision.
    const existing = await repo.getWritebackById(id);
    if (!existing || existing.status !== 'pending_approval') return res.status(404).json({ error: 'Not found or already decided.' });
    const action = existing.intent_type === 'customer_reply_draft' ? 'writeback_customer_reply' : 'writeback_other';
    if (!clearance.personaCanAct(clearance.getEffectivePersonaId(req), action)) {
      return res.status(403).json({ error: clearance.actionDeniedNote(action) });
    }

    const decider = decidedByIdentity(req);
    const writeback = await repo.decideWriteback(id, decision, decider, editedText);
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
    // A redraft supersedes a pending decision and spends a model call, so
    // it needs the same authority as deciding one.
    if (!clearance.personaCanAct(clearance.getEffectivePersonaId(req), 'writeback_customer_reply')) {
      return res.status(403).json({ error: clearance.actionDeniedNote('writeback_customer_reply') });
    }

    const superseded = await repo.supersedeWriteback(id, decidedByIdentity(req));
    if (!superseded) return res.status(404).json({ error: 'Not found or already decided.' });

    const conversation = await repo.getConversation(existing.conversation_id, conversationIdentity(req));
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const turn = await runScottTurnAndPersist({
      conversation,
      conversationId: existing.conversation_id,
      userMessage: '(Internal note from the team: the previous draft reply needs another attempt — please draft a fresh reply to the customer\'s original message.)',
      personaId: clearance.getSessionPersonaId(req)
    });
    res.json(serializeTurn(existing.conversation_id, turn));
  } catch (err) {
    console.error('Scott redraft error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// Fictional staff logout. Separate from the site's /logout because a
// portal-user session is not a site session: destroying the whole session
// here would also log out a real site user who happens to share the
// browser, and /logout would leave the portal identity behind.
router.post('/scott/logout', noindexHeader, (req, res) => {
  clearance.clearPortalUser(req);
  clearance.setImpersonatedPersona(req, null);
  res.redirect('/scott/login');
});

// Tom-only demonstration mode. Lets a real site admin/content user
// experience the portal exactly as a given fictional staff member sees it,
// including their restricted AI context.
//
// This is NOT the old "view as" selector: setImpersonatedPersona()
// re-checks the caller's real site role itself and short-circuits for any
// session that is a fictional staff login, so a logged-in Jo Bell posting
// straight to this endpoint cannot acquire Scott Mercer's clearance. The
// 403 below is the ordinary refusal; the security guarantee is in
// clearance.js, not in this route remembering to check.
router.post('/api/scott/impersonate', noindexHeader, requireScottApiAccess, async (req, res) => {
  const requested = req.body && req.body.personaId;
  const ok = clearance.setImpersonatedPersona(req, requested === undefined ? null : requested);
  if (!ok) {
    return res.status(403).json({ error: 'Not permitted. Demonstration mode is available to the demonstration owner only.' });
  }
  res.json({ ok: true, personaId: clearance.getEffectivePersonaId(req), impersonating: clearance.isImpersonating(req) });
});

// Search is a retrieval path, so the clearance rule applies to it exactly
// as it applies to a page or an AI answer. 07Q is explicit that
// "attempting to bypass a restriction through Company Brain, search,
// another worker or prompt wording does not change clearance", and an
// unfiltered search is the easiest of those four to actually do: type a
// customer name and read the result.
//
// Three things are gated here, not one:
//   1. Whole categories a persona cannot see are absent, not empty-listed.
//   2. Restricted fields are stripped from the rows that DO come back
//      (a job is jobs_ops, but its price is job_margin).
//   3. Counts and totals are computed AFTER filtering, so the size of the
//      result set cannot be used to infer what was removed. This is the
//      "no leaks via snippets, counts or derived calcs" requirement, and
//      it is why the response carries no unfiltered total anywhere.
const SEARCH_CATEGORY_DOMAINS = { jobs: 'jobs_ops', enquiries: 'leads', customers: 'customers_contact' };
// Fields on an otherwise-visible row that belong to a narrower domain.
const SEARCH_FIELD_DOMAINS = {
  jobs: { price_pence: 'job_margin', risk_note: 'jobs_ops' },
  enquiries: { message: 'leads' },
  customers: { notes: 'customers_contact' }
};

function stripRestrictedFields(personaId, category, row) {
  const map = SEARCH_FIELD_DOMAINS[category] || {};
  const out = {};
  Object.keys(row).forEach((k) => {
    const needed = map[k];
    if (needed && !clearance.personaCanSeeDomain(personaId, needed)) return;
    out[k] = row[k];
  });
  return out;
}

// The deep company brain, searched under the same rule. Without this the
// Company Brain is only as deep as the four demo tables; with it, a
// cleared reader can find the real record and an uncleared one gets
// nothing at all rather than a redacted hint that it exists.
function searchDeepBrain(personaId, q) {
  const needle = q.toLowerCase();
  return clearance
    .filterAndRedact(personaId, null, contextBuilders.allDeepFactRecords())
    .map((record) => {
      const label = record.ref || record.name || record.sku || record.item || record.person || '';
      const hit = Object.entries(record).find(([k, v]) =>
        k !== 'domain' && typeof v === 'string' && v.toLowerCase().includes(needle));
      // Match on the label too, so searching a reference number finds it
      // even when no prose field mentions it.
      if (!hit && !String(label).toLowerCase().includes(needle)) return null;
      return {
        domain: record.domain,
        label: String(label) || record.domain,
        // The snippet is built from a field this reader is already cleared
        // for, because redaction ran first. A snippet taken before
        // redaction would quote the restricted text back verbatim, which
        // is the classic version of this leak.
        snippet: hit ? String(hit[1]).slice(0, 160) : ''
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

router.get('/api/scott/search', noindexHeader, requireScottApiAccess, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const personaId = clearance.getEffectivePersonaId(req);
    const raw = await repo.searchAll(q);

    const results = {};
    Object.keys(SEARCH_CATEGORY_DOMAINS).forEach((category) => {
      if (!clearance.personaCanSeeDomain(personaId, SEARCH_CATEGORY_DOMAINS[category])) {
        results[category] = [];
        return;
      }
      results[category] = (raw[category] || []).map((row) => stripRestrictedFields(personaId, category, row));
    });
    results.brain = q.length >= 2 ? searchDeepBrain(personaId, q) : [];

    res.json(results);
  } catch (err) {
    console.error('Scott search error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// Direct human action — an explicit "Assign to..." control on the enquiry
// detail page. workerId '' (unassign) is allowed; anything else must be a
// real routable worker id. Never triggered by an AI reply's JSON.
router.post('/api/scott/enquiries/:id/assign', noindexHeader, requireScottApiAccess, requireAction('enquiry_assign'), async (req, res) => {
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
        ? `${viewer(req).displayName} assigned this enquiry to ${WORKERS[workerId].characterName}.`
        : `${viewer(req).displayName} unassigned this enquiry.`,
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
router.post('/api/scott/jobs/:ref/status', noindexHeader, requireScottApiAccess, requireAction('job_status'), async (req, res) => {
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
      summary: `${viewer(req).displayName} changed ${ref}'s status from ${job.status.replace('_', ' ')} to ${status.replace('_', ' ')}.`,
      relatedJobId: job.id
    });
    res.json({ ok: true, job: updated });
  } catch (err) {
    console.error('Scott job status update error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ------------------------------------------------------------
// Brain Gaps: closing one
// ------------------------------------------------------------
//
// The only way a gap is ever closed. There is deliberately no AI path to
// this route and no automatic ageing-out: a gap that nobody corrected is
// a gap that is still open, however old and however inconvenient in a
// queue. Closing requires a logged-in human, clearance for the gap's own
// domain, and an explicit statement of what they did to the source.
//
// sourceCorrected is the difference between the two honest closes.
// True means the controlled record has actually been put right or
// confirmed, and the Company Brain may now use it. False records a
// dismissal, which says the gap was not real or no longer matters and
// leaves the source untouched. Presenting the second as the first is
// exactly the "clear the queue" behaviour the whole mechanism exists to
// prevent, so they are different statuses with different words on the
// register rather than one "closed" flag.
router.post('/api/scott/gaps/:id/resolve', noindexHeader, requireScottApiAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid gap id.' });
    const gap = await repo.getBrainGapById(id);
    if (!gap) return res.status(404).json({ error: 'Gap not found.' });

    const personaId = clearance.getEffectivePersonaId(req);
    if (!clearance.personaCanResolveGap(personaId, gap)) {
      return res.status(403).json({ error: clearance.actionDeniedNote('gap_resolve') });
    }

    const sourceCorrected = req.body?.sourceCorrected === true || req.body?.sourceCorrected === 'true';
    const note = sanitizeHtml(String(req.body?.note || ''), { allowedTags: [], allowedAttributes: {} }).trim();
    // A close with no explanation is not a record of anything. Requiring
    // the note on both paths is deliberate: "corrected it" and "this was
    // not real" both need to say what happened, or the register degrades
    // into a list of things somebody clicked.
    if (note.length < 10) {
      return res.status(400).json({ error: 'Say what you corrected or confirmed in the source, or why this is not a real gap. At least a sentence.' });
    }

    const v = viewer(req);
    const updated = await repo.resolveBrainGap(id, {
      sourceCorrected,
      note,
      resolver: { realUserId: v.realUserId, portalUserId: v.portalUserId, displayName: v.displayName }
    });
    // Null means the row was no longer open. Reporting that honestly
    // rather than as a success stops a second click reading as a second,
    // different close.
    if (!updated) return res.status(409).json({ error: 'That gap has already been closed.' });

    await repo.addActivity({
      actor: 'user',
      eventType: sourceCorrected ? 'brain_gap_resolved' : 'brain_gap_dismissed',
      summary: sourceCorrected
        ? `${v.displayName} corrected or confirmed ${updated.expected_source || updated.domain} and closed the gap: ${note}`
        : `${v.displayName} dismissed a gap in ${updated.expected_source || updated.domain} without changing the source: ${note}`,
      relatedJobId: updated.related_job_id,
      relatedEnquiryId: updated.related_enquiry_id
    });
    res.json({ ok: true, gap: serializeGapRecord(updated) });
  } catch (err) {
    console.error('Scott gap resolve error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = { router, mountPageRoute, runScottTurnAndPersist };
