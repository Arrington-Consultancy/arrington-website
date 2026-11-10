'use strict';

// The Abacus office: a standalone staff workspace for a taxi firm's inbox
// (Tom's decision of 9 November 2026: Dan's office runs as its own Railway
// service on Tom's account, with its own database, never inside the
// Arrington site). The AI reads and drafts; staff edit, guide and approve;
// an approved reply is saved as a draft in the firm's mailbox for a person
// to send. Nothing is sent, booked or posted by the AI.
//
// createApp() builds the Express app so a test can start it on a port of
// its own with a stubbed model; server.js is the production entry point.

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const morgan = require('morgan');
const fs = require('fs');

const { Store, ROLES } = require('./lib/store');
const { Office, canApprove, canReassign, canSee, scopeFor, caseScope, seesCouncil, needsManager, atLeast, label, brandName } = require('./lib/cases');
const ai = require('./lib/ai');
const visits = require('./lib/visits');
const { CHANNELS, isLogged } = require('./lib/channels');
const notify = require('./lib/notify');
const alerts = require('./lib/alerts');
const { createDispatch } = require('./lib/dispatch');
const { longDate } = require('./lib/demoInbox');
const mailboxLib = require('./lib/mailbox');
const secretBox = require('./lib/secretBox');
const gmailConnect = require('../lib/taxiOffice/mail/gmailConnect');

const ROOT = path.join(__dirname, '..');
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

function assetVersion(rel) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'public', rel))).digest('hex').slice(0, 10); } catch { return 'dev'; }
}

function createApp({ pool, mailbox, firm, dispatch, sessionSecret = process.env.SESSION_SECRET, production = process.env.NODE_ENV === 'production', aiOn = ai.aiEnabled, now = () => new Date(), alertsEnv = process.env, mailEnv = process.env, dispatchEnv = process.env, fetchImpl = globalThis.fetch, baseUrl = String(process.env.ABACUS_OFFICE_PUBLIC_URL || '').replace(/\/$/, '') }) {
  if (!sessionSecret || sessionSecret.length < 16) throw new Error('SESSION_SECRET must be set (16 characters or more)');
  const store = new Store(pool);
  if (!dispatch) dispatch = createDispatch({ store, env: dispatchEnv, fetch: fetchImpl, prefix: String(firm.short || 'AB').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'AB' });
  const office = new Office({ store, mailbox, firm, dispatch, aiOn, now });
  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');
  app.locals.store = store;
  app.locals.office = office;

  if (production) {
    app.use((req, res, next) => {
      if (req.get('x-forwarded-proto') === 'http' && req.path !== '/health') return res.redirect(301, `https://${req.get('host')}${req.url}`);
      next();
    });
  }
  app.get('/health', async (req, res) => {
    try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false, error: 'database unavailable' }); }
  });

  app.use(morgan(production ? 'combined' : 'dev', { skip: (req) => req.path === '/health' }));
  app.use((req, res, next) => { res.locals.nonce = crypto.randomBytes(16).toString('base64'); next(); });
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"]
      }
    },
    hsts: production ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false
  }));
  app.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    // What every page needs, set before anything that can fail, so an
    // error page renders whatever went wrong.
    res.locals.user = null;
    res.locals.firm = firm;
    res.locals.csrfToken = '';
    res.locals.ASSET_V = { css: assetVersion('office.css'), js: assetVersion('office.js') };
    res.locals.aiOn = aiOn();
    res.locals.mailboxLabel = mailbox.label;
    res.locals.mailboxDemo = Boolean(mailbox.demo);
    res.locals.mailboxNone = Boolean(mailbox.none);
    res.locals.todayLong = longDate(office.today());
    res.locals.flash = null;
    res.locals.label = label;
    res.locals.atLeast = atLeast;
    res.locals.canApprove = canApprove;
    res.locals.canReassign = canReassign;
    res.locals.needsManager = needsManager;
    res.locals.brandName = (id) => brandName(firm, id);
    res.locals.brandLogo = (id) => ((firm.brands || []).find((b) => b.id === id) || {}).logo || '';
    res.locals.barLogo = firm.logo;
    res.locals.manyBrands = (firm.brands || []).length > 1;
    res.locals.channels = CHANNELS;
    res.locals.dispatchLabel = dispatch.label;
    res.locals.dispatchLive = Boolean(dispatch.live);
    res.locals.counts = null;
    res.locals.section = '';
    next();
  });
  app.use('/office.css', express.static(path.join(__dirname, 'public', 'office.css'), { maxAge: '1d' }));
  app.use('/office.js', express.static(path.join(__dirname, 'public', 'office.js'), { maxAge: '1d' }));
  app.use('/assets/fonts', express.static(path.join(ROOT, 'taxi-demo', 'public', 'fonts'), { maxAge: '30d' }));
  app.use('/brand', express.static(path.join(__dirname, 'public', 'brand'), { maxAge: '7d' }));
  app.use('/assets', (req, res) => res.status(404).type('text/plain').send('Not found'));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(cookieParser());
  app.use(session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: sessionSecret,
    name: 'abacus.sid',
    resave: false,
    // The CSRF token is tied to the session id, so the sign-in page's
    // session has to exist before the form is posted.
    saveUninitialized: true,
    cookie: { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 10 * 60 * 60 * 1000 }
  }));
  const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => sessionSecret,
    getSessionIdentifier: (req) => req.session.id,
    cookieName: production ? '__Host-abacus.csrf' : 'abacus.csrf',
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: production, path: '/' },
    getCsrfTokenFromRequest: (req) => (req.body && req.body._csrf) || req.get('x-csrf-token')
  });
  app.use(doubleCsrfProtection);

  // The signed-in user on every request, from the session.
  app.use(async (req, res, next) => {
    try {
      req.user = req.session.userId ? await store.userById(req.session.userId) : null;
      if (req.user && !req.user.active) { req.user = null; req.session.userId = null; }
      res.locals.user = req.user;
      res.locals.csrfToken = generateCsrfToken(req, res);
      // An operator of one company sees that company's logo in the bar;
      // managers, owners and anyone covering every company see the group's.
      if (req.user && scopeFor(req.user)) res.locals.barLogo = ((firm.brands || []).find((b) => b.id === req.user.brand) || {}).logo || firm.logo;
      if (req.session.flash) { res.locals.flash = req.session.flash; delete req.session.flash; }
      res.locals.counts = req.user ? await store.counts(caseScope(req.user)) : null;
      next();
    } catch (e) { next(e); }
  });

  // Who has been in: every page opened and button pressed by a signed-in
  // person goes on their visit (lib/visits.js). Never awaited, never able
  // to break a page; a visit closed as idle is written to the log.
  const logVisits = (rows) => notify.closed(rows);
  app.use((req, res, next) => {
    if (req.user && !visits.isBackground(req) && req.path !== '/login' && req.path !== '/logout') {
      store.touchVisit(req.user, visits.describe(req.method, req.path, req.query)).then(logVisits).catch((e) => console.error('Abacus office: visit not recorded', e.message));
    }
    next();
  });

  const flash = (req, tone, message) => { req.session.flash = { tone, message }; };
  // Same race for every redirect after a change: save the session first.
  app.use((req, res, next) => {
    const redirect = res.redirect.bind(res);
    // redirected marks a redirect already on its way, so an action that
    // redirects itself is not followed by a second one while the save runs.
    res.redirect = (...args) => { res.locals.redirected = true; return req.session ? req.session.save(() => redirect(...args)) : redirect(...args); };
    next();
  });
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false });

  app.get('/login', (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('login', { title: 'Sign in', section: 'login', error: null, next: safeNext(req.query.next) });
  });
  app.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const username = String(req.body.username || '').trim();
      const password = String(req.body.password || '');
      const user = await store.userByName(username);
      const ok = user && user.active ? await bcrypt.compare(password, user.password_hash) : (await bcrypt.compare(password, DUMMY_HASH), false);
      if (!ok) return res.status(401).render('login', { title: 'Sign in', section: 'login', error: 'That username and password do not match.', next: safeNext(req.body.next) });
      // The visit opens before the redirect, so the first page after it
      // lands on this visit rather than racing it.
      console.log(`Abacus office: ${user.username} signed in`);
      notify.signedIn(user).catch(() => {});
      await store.touchVisit(user, 'signed in', { fresh: true }).then(logVisits).catch((e) => console.error('Abacus office: visit not recorded', e.message));
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = user.id;
        store.touchLogin(user.id).catch(() => {});
        // Save before redirecting. express-session writes a redirect's
        // headers before its save finishes, and a fast browser then asks
        // for the next page before the login exists in the store.
        req.session.save((err2) => {
          if (err2) return next(err2);
          res.redirect(user.must_change_password ? '/account' : safeNext(req.body.next));
        });
      });
    } catch (e) { next(e); }
  });
  app.post('/logout', async (req, res) => {
    if (req.user) await store.endVisit(req.user, 'signed out').then(logVisits).catch((e) => console.error('Abacus office: visit not recorded', e.message));
    req.session.destroy(() => res.redirect('/login'));
  });

  const requireUser = (req, res, next) => {
    if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    if (req.user.must_change_password && req.path !== '/account' && req.path !== '/account/password') return res.redirect('/account');
    next();
  };
  const requireRole = (role) => (req, res, next) => (atLeast(req.user, role) ? next() : res.status(404).render('missing', { title: 'Not found' }));
  const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((e) => {
    if (e.code === 'REFUSED') { flash(req, 'warn', e.message); return res.redirect(req.get('referer') || '/'); }
    next(e);
  });
  app.use(requireUser);

  // Every page first makes sure the inbox has been pulled and read once
  // this hour, so a person arriving sees today's emails without a button.
  let lastSync = 0;
  let syncing = false;
  let mailError = '';
  async function settle() {
    if (syncing || Date.now() - lastSync < 2 * 60 * 1000) return;
    syncing = true;
    try { await office.sync(); mailError = ''; await office.readAllUnread(); lastSync = Date.now(); } catch (e) {
      // Shown to staff on the inbox, so a mailbox that stops answering is
      // seen rather than looking like a quiet day.
      mailError = e.code === 'MAILBOX_REFUSED' ? `The mailbox was not read: ${e.message}.` : `The mailbox could not be read just now (${String(e.message).slice(0, 160)}). The office tries again every couple of minutes.`;
      console.error('Abacus office: sync failed', e.message);
    } finally { syncing = false; }
  }
  app.use((req, res, next) => { res.locals.mailError = mailError; next(); });
  app.use(wrap(async (req, res, next) => { await settle(); next(); }));
  // The same pull on a timer, so an open page sees a new email within a
  // couple of minutes whether or not anyone touches it.
  const poll = setInterval(() => { settle().catch(() => {}); }, 2 * 60 * 1000);
  if (poll.unref) poll.unref();
  app.locals.settle = settle;

  // "Anything changed?" for the list pages, which ask every few seconds
  // while open and reload themselves when the answer is yes (Tom,
  // 9 November 2026: an auto refresh as well as the button). The stamp is
  // the case count plus the latest change, scoped to what this user sees.
  app.get('/live.json', wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ stamp: await store.liveStamp(caseScope(req.user)), checkedAt: lastSync, syncing: syncing });
  }));

  app.get('/', wrap(async (req, res) => {
    const scope = caseScope(req.user);
    const [overdue, passedUp, mine, open, recent, stamp] = await Promise.all([
      store.listCases({ escalated: true, brand: scope, limit: 20 }),
      store.listCases({ passedUp: true, brand: scope, limit: 20 }),
      store.listCases({ ownerId: req.user.id, open: true, brand: scope, limit: 20 }),
      store.listCases({ open: true, brand: scope, limit: 50 }),
      store.recentEvents(12, scope),
      store.liveStamp(scope)
    ]);
    const showPassedUp = atLeast(req.user, 'manager') ? passedUp : [];
    const passedUpIds = new Set(showPassedUp.map((c) => c.id));
    const overdueShown = overdue.filter((c) => !passedUpIds.has(c.id));
    const overdueIds = new Set(overdue.map((c) => c.id));
    const unassigned = open.filter((c) => !c.owner_id && c.status === 'new' && c.kind !== 'other' && !overdueIds.has(c.id));
    const hours = await store.escalationHours();
    const nudgeHours = await store.complaintNudgeHours();
    res.render('today', { title: 'Today', section: 'today', overdue: overdueShown, passedUp: showPassedUp, mine, unassigned, recent, hours, nudgeHours, liveStamp: stamp, lastSync });
  }));

  app.get('/inbox', wrap(async (req, res) => {
    const show = String(req.query.show || 'open');
    const scope = caseScope(req.user);
    const filter = { open: { open: true }, new: { status: 'new' }, mine: { ownerId: req.user.id, open: true }, waiting: { status: 'waiting' }, done: { status: 'done' }, all: {} }[show] || { open: true };
    const cases = await store.listCases({ ...filter, brand: scope, limit: 200 });
    res.render('inbox', { title: 'Inbox', section: 'inbox', cases, show, liveStamp: await store.liveStamp(scope), lastSync });
  }));
  app.post('/inbox/sync', wrap(async (req, res) => {
    lastSync = 0;
    let created;
    try { created = await office.sync(); mailError = ''; } catch (e) {
      mailError = e.code === 'MAILBOX_REFUSED' ? `The mailbox was not read: ${e.message}.` : `The mailbox could not be read just now (${String(e.message).slice(0, 160)}).`;
      flash(req, 'warn', mailError);
      return res.redirect('/inbox');
    }
    const read = await office.readAllUnread();
    lastSync = Date.now();
    flash(req, 'ok', `${created.length} new ${created.length === 1 ? 'email' : 'emails'} from ${mailbox.label}${read ? `, ${read} read` : ''}. The inbox also checks itself every couple of minutes.`);
    res.redirect('/inbox');
  }));

  app.get('/complaints', wrap(async (req, res) => {
    const scope = caseScope(req.user);
    const cases = (await store.listCases({ kind: 'complaints', brand: scope, limit: 200 })).filter((c) => req.query.show === 'all' || c.status !== 'done');
    const order = { safety: 0, serious: 1, minor: 2, none: 3 };
    cases.sort((a, b) => (order[a.seriousness] - order[b.seriousness]) || (new Date(a.received_at) - new Date(b.received_at)));
    res.render('complaints', { title: 'Complaints', section: 'complaints', cases, showAll: req.query.show === 'all', liveStamp: await store.liveStamp(scope), lastSync, nudgeHours: await store.complaintNudgeHours(), channels: CHANNELS, ownBrand: scopeFor(req.user) || '', todayYmd: office.today() });
  }));
  // A complaint that came in another way: a Google review, a Facebook
  // comment, a phone call (Tom, 10 November 2026). Staff type or paste it
  // in, choose the channel, and the AI drafts the reply that suits it.
  app.post('/complaints/log', wrap(async (req, res) => {
    const own = scopeFor(req.user);
    const brand = own || ((firm.brands || []).some((x) => x.id === String(req.body.brand || '')) ? String(req.body.brand) : (firm.mailboxBrand || ''));
    try {
      const kase = await office.logComplaint(req.user, { channel: String(req.body.channel || ''), name: req.body.name, contact: req.body.contact, date: String(req.body.date || ''), text: req.body.text, brand });
      if (!kase.reading) flash(req, 'warn', kase.reading_note || 'Logged. Write the reply below.');
      return res.redirect(`/case/${kase.id}`);
    } catch (e) {
      if (e.code !== 'REFUSED') throw e;
      flash(req, 'warn', e.message);
      return res.redirect('/complaints#log-a-complaint');
    }
  }));

  // The council worker: managers and owners only, like the council emails
  // themselves. Soonest deadline first, then oldest.
  app.get('/council', requireRole('manager'), wrap(async (req, res) => {
    const scope = caseScope(req.user);
    const showAll = req.query.show === 'all';
    const cases = (await store.listCases({ kind: 'licensing', brand: scope, limit: 200 })).filter((c) => showAll || c.status !== 'done');
    const due = (c) => (c.council && c.council.deadline) || '9999-12-31';
    cases.sort((a, b) => due(a).localeCompare(due(b)) || (new Date(a.received_at) - new Date(b.received_at)));
    const drafts = await store.compositions({ council: true });
    res.render('council', { title: 'Council', section: 'council', cases, showAll, liveStamp: await store.liveStamp(scope), lastSync, drafts, councilKinds: require('./lib/compose').COUNCIL_KINDS, mailboxCanHold: mailboxCanHold() });
  }));

  const loadCase = wrap(async (req, res, next) => {
    const id = Number(req.params.id);
    const kase = Number.isInteger(id) ? await store.caseById(id) : null;
    if (!kase || !canSee(req.user, kase)) return res.status(404).render('missing', { title: 'Not found' });
    req.kase = kase;
    next();
  });
  app.get('/case/:id', loadCase, wrap(async (req, res) => {
    const kase = req.kase.reading || req.kase.reading_source !== 'none' ? req.kase : await office.read(req.kase, { actor: req.user });
    const [events, users] = await Promise.all([store.eventsFor(kase.id), store.users()]);
    res.render('case', { title: kase.subject || 'Email', section: kase.kind === 'complaints' ? 'complaints' : (kase.kind === 'licensing' ? 'council' : 'inbox'), kase, events, users: users.filter((u) => u.active && (atLeast(u, 'manager') || !u.brand || u.brand === (kase.brand || ''))), booking: office.bookingFrom(kase), dispatchRow: kase.dispatch_ref ? (await store.dispatchBookingsForCase(kase.id)).filter((b) => b.ref === kase.dispatch_ref).pop() || null : null, statusWords: require('./lib/icabbi').statusWords, holdingText: kase.kind === 'complaints' ? office.holdingText(kase) : '' });
  }));
  const act = (p, fn) => app.post(`/case/:id/${p}`, loadCase, wrap(async (req, res) => { await fn(req, res); if (!res.headersSent && !res.locals.redirected) res.redirect(`/case/${req.kase.id}`); }));
  // Managers and owners put an email under the right company, when one
  // mailbox serves more than one.
  act('company', async (req) => {
    if (!atLeast(req.user, 'manager')) { flash(req, 'warn', 'A manager or the owner moves an email to another company.'); return; }
    const to = String(req.body.brand || '');
    const target = (firm.brands || []).find((b) => b.id === to);
    if (!target) { flash(req, 'warn', 'That company is not set up on this office.'); return; }
    if ((req.kase.brand || '') === to) return;
    await store.updateCase(req.kase.id, { brand: to });
    await store.addEvent(req.kase.id, { actor: req.user, kind: 'company', detail: `Moved to ${target.name}` });
    flash(req, 'ok', `Moved to ${target.name}.`);
  });
  act('read', async (req) => { await office.read(req.kase, { actor: req.user, force: true }); flash(req, 'ok', 'Read again.'); });
  act('take', async (req) => { await office.take(req.kase, req.user); });
  act('assign', async (req) => {
    const to = req.body.owner ? await store.userById(Number(req.body.owner)) : null;
    await office.assign(req.kase, req.user, to);
  });
  act('status', async (req) => { await office.setStatus(req.kase, req.user, String(req.body.status)); });
  act('draft', async (req) => { await office.saveDraft(req.kase, req.user, req.body.draft); flash(req, 'ok', 'Draft saved. It is not approved until you approve it.'); });
  act('note', async (req) => { await office.note(req.kase, req.user, req.body.note); });
  act('guide', async (req) => {
    if (req.body.draft !== undefined && String(req.body.draft) !== String(req.kase.draft)) await office.saveDraft(req.kase, req.user, req.body.draft);
    const fresh = await store.caseById(req.kase.id);
    const r = await office.guide(fresh, req.user, req.body.guidance);
    flash(req, r.rewritten ? 'ok' : 'warn', r.rewritten ? (r.heldBack ? `Rewritten. Held back: ${r.heldBack}` : 'Rewritten to what you said.') : 'Your note is recorded. The AI is off, so edit the draft by hand.');
  });
  act('pass-up', async (req) => {
    const fresh = await office.passUp(req.kase, req.user, req.body.reason);
    alerts.sendNudge({ cases: [fresh], hours: 0, baseUrl, firmName: firm.name, by: req.user.display_name || req.user.username }, alertsEnv).then((r) => { if (r.sent) store.markPassedUpNotified([fresh.id]); }).catch((e) => console.error('Abacus office: pass-up email failed', e.message));
    flash(req, 'ok', 'Passed up to a manager. Only a manager can approve the reply now. You can send the holding reply below.');
  });
  act('holding', async (req) => {
    await office.sendHolding(req.kase, req.user);
    flash(req, 'ok', (mailbox.demo || mailbox.none) ? 'Holding reply approved. With a real mailbox connected it would now be a draft in it, ready to send.' : `Holding reply saved as a draft in ${mailbox.label}. Open the mailbox to send it.`);
  });
  act('book', async (req) => {
    try {
      const { ref, statusWords } = await office.book(req.kase, req.user, req.body, req.body.signed_off === 'yes');
      flash(req, 'ok', `Booked into ${dispatch.label} as ${ref}${statusWords ? `, ${statusWords}` : ''}.`);
    } catch (e) {
      if (!e.checkedOnly) throw e;
      flash(req, 'ok', e.message);
    }
  });
  act('cancel-booking', async (req) => {
    const r = await office.cancelBooking(req.kase, req.user, req.body.signed_off === 'yes', req.body.reason);
    flash(req, 'ok', `${req.kase.dispatch_ref} ${r.statusWords || 'cancelled'}`);
  });
  // Ask iCabbi for this case's booking status now, rather than waiting for
  // the next round of checks.
  act('dispatch-status', async (req) => {
    if (!req.kase.dispatch_ref || !dispatch.live) return;
    const st = await dispatch.status(req.kase.dispatch_ref);
    if (st) {
      const detail = [st.driver && `driver ${st.driver}`, st.vehicle && `car ${st.vehicle}`].filter(Boolean).join(', ');
      await store.setDispatchStatus(req.kase.dispatch_ref, { dispatchStatus: st.status, detail });
      flash(req, 'ok', `iCabbi says ${req.kase.dispatch_ref} is ${st.words}${detail ? ` (${detail})` : ''}.`);
    }
  });
  act('approve', async (req) => {
    if (req.body.draft !== undefined && String(req.body.draft) !== String(req.kase.draft)) await office.saveDraft(req.kase, req.user, req.body.draft);
    const fresh = await store.caseById(req.kase.id);
    const done = await office.approve(fresh, req.user);
    if (done && done.copyOut) { flash(req, 'ok', `Approved. ${done.send}`); return; }
    flash(req, 'ok', (mailbox.demo || mailbox.none) ? 'Approved. With a real mailbox connected this would now be a draft in it, ready to send.' : `Approved and saved as a draft in ${mailbox.label}. Open the mailbox to send it.`);
  });

  app.get('/account', wrap(async (req, res) => res.render('account', { title: 'Your account', section: 'account', error: null })));
  app.post('/account/password', wrap(async (req, res) => {
    const { current, password, again } = req.body;
    const ok = await bcrypt.compare(String(current || ''), req.user.password_hash);
    if (!ok) return res.status(400).render('account', { title: 'Your account', section: 'account', error: 'Your current password is not right.' });
    if (String(password) !== String(again)) return res.status(400).render('account', { title: 'Your account', section: 'account', error: 'The two new passwords do not match.' });
    try { await store.setPassword(req.user.id, String(password), false); } catch (e) { return res.status(400).render('account', { title: 'Your account', section: 'account', error: e.message }); }
    flash(req, 'ok', 'Password changed.');
    res.redirect('/');
  }));

  app.get('/activity', requireRole('manager'), wrap(async (req, res) => {
    res.render('activity', { title: 'Activity', section: 'activity', events: await store.recentEvents(200), visits: await store.recentVisits(40), visitMinutes: visits.minutes, ukTime: visits.ukTime });
  }));

  app.get('/users', requireRole('owner'), wrap(async (req, res) => {
    res.render('users', { title: 'Users', section: 'users', users: await store.users(), roles: ROLES, brands: firm.brands || [], error: null });
  }));
  app.post('/users', requireRole('owner'), wrap(async (req, res) => {
    try {
      const brand = (firm.brands || []).some((b) => b.id === String(req.body.brand || '')) ? String(req.body.brand) : '';
      await store.createUser({ username: req.body.username, displayName: req.body.display_name, password: req.body.password, role: req.body.role, brand, mustChange: true });
      await store.addEvent(null, { actor: req.user, kind: 'user_created', detail: `${String(req.body.username).trim().toLowerCase()} added as ${req.body.role}${brand ? ` for ${brandName(firm, brand)}` : ' for every brand'}` });
      flash(req, 'ok', `${String(req.body.username).trim()} added. They will be asked to choose their own password when they first sign in.`);
      res.redirect('/users');
    } catch (e) {
      res.status(400).render('users', { title: 'Users', section: 'users', users: await store.users(), roles: ROLES, brands: firm.brands || [], error: e.code === '23505' ? 'That username is taken.' : e.message });
    }
  }));
  app.post('/users/:id', requireRole('owner'), wrap(async (req, res) => {
    const target = await store.userById(Number(req.params.id));
    if (!target) return res.status(404).render('missing', { title: 'Not found' });
    const action = String(req.body.action || '');
    if (target.id === req.user.id && (action === 'deactivate' || action === 'role')) { flash(req, 'warn', 'You cannot change your own account here.'); return res.redirect('/users'); }
    if (action === 'deactivate') { await store.setUserActive(target.id, false); await store.addEvent(null, { actor: req.user, kind: 'user_deactivated', detail: target.username }); }
    else if (action === 'activate') { await store.setUserActive(target.id, true); await store.addEvent(null, { actor: req.user, kind: 'user_activated', detail: target.username }); }
    else if (action === 'role' && ROLES.includes(req.body.role)) { await store.setUserRole(target.id, req.body.role); await store.addEvent(null, { actor: req.user, kind: 'user_role', detail: `${target.username} is now ${req.body.role}` }); }
    else if (action === 'brand') {
      const brand = (firm.brands || []).some((b) => b.id === String(req.body.brand || '')) ? String(req.body.brand) : '';
      await store.setUserBrand(target.id, brand);
      await store.addEvent(null, { actor: req.user, kind: 'user_brand', detail: `${target.username} now sees ${brand ? brandName(firm, brand) : 'every brand'}` });
    }
    else if (action === 'reset') {
      try { await store.setPassword(target.id, String(req.body.password || ''), true); await store.addEvent(null, { actor: req.user, kind: 'user_password_reset', detail: target.username }); flash(req, 'ok', `${target.username} has a temporary password and will choose a new one at sign in.`); }
      catch (e) { flash(req, 'warn', e.message); }
    }
    res.redirect('/users');
  }));

  app.get('/settings', requireRole('manager'), wrap(async (req, res) => {
    res.render('settings', { baseUrl: baseUrl || `${req.protocol}://${req.get('host')}`, title: 'Settings', section: 'settings', hours: await store.escalationHours(), nudgeHours: await store.complaintNudgeHours(), prices: await store.fixedPrices(scopeFor(req.user)), brands: firm.brands || [], alertStatus: alerts.describeAlertStatus(alertsEnv), mailStatus: mailboxLib.describeMailStatus(mailEnv, mailbox), mailConnect: connectState(), aiStatus: ai.describeAiStatus(), dispatchStatus: require('./lib/dispatch').describeDispatchStatus() });
  }));
  app.post('/settings', requireRole('owner'), wrap(async (req, res) => {
    const n = Number(req.body.escalation_hours);
    const k = Number(req.body.complaint_nudge_hours);
    if (!Number.isFinite(n) || n < 1 || n > 168 || !Number.isFinite(k) || k < 1 || k > 168) { flash(req, 'warn', 'Each time is between 1 and 168 hours.'); return res.redirect('/settings'); }
    await store.setSetting('escalation_hours', String(Math.round(n)));
    await store.setSetting('complaint_nudge_hours', String(Math.round(k)));
    await store.addEvent(null, { actor: req.user, kind: 'setting', detail: `Escalation time set to ${Math.round(n)} hours; complaint nudge set to ${Math.round(k)} hours` });
    flash(req, 'ok', 'Saved.');
    res.redirect('/settings');
  }));
  // Fixed prices: a manager or the owner types them in; the AI quotes only
  // from this list, and a brand's staff see only their brand's.
  app.post('/settings/prices', requireRole('manager'), wrap(async (req, res) => {
    const pounds = String(req.body.price || '').replace(/[£,\s]/g, '');
    const pence = /^\d+(\.\d{1,2})?$/.test(pounds) ? Math.round(Number(pounds) * 100) : NaN;
    const brand = (firm.brands || []).some((b) => b.id === String(req.body.brand || '')) ? String(req.body.brand) : (scopeFor(req.user) || firm.mailboxBrand || '');
    if (scopeFor(req.user) && brand !== scopeFor(req.user)) { flash(req, 'warn', 'You can only set prices for your own brand.'); return res.redirect('/settings'); }
    try {
      const row = await store.addFixedPrice({ brand, fromPlace: req.body.from_place, toPlace: req.body.to_place, vehicle: req.body.vehicle, pricePence: pence, notes: req.body.notes, actor: req.user });
      await store.addEvent(null, { actor: req.user, kind: 'price_added', detail: `Fixed price: ${row.from_place} to ${row.to_place}, ${row.vehicle}, £${(row.price_pence / 100).toFixed(2)}` });
      flash(req, 'ok', 'Price added. The AI will quote it from now on.');
    } catch (e) { flash(req, 'warn', e.message); }
    res.redirect('/settings');
  }));
  // The firm's own iCabbi vehicle types, read live, so Arrington can set
  // ABACUS_OFFICE_ICABBI_VEHICLE_TYPES from the real keys.
  app.get('/settings/icabbi-vehicles', requireRole('manager'), wrap(async (req, res) => {
    if (!dispatch.live || !dispatch.client) { flash(req, 'warn', 'iCabbi is not the dispatch connection on this office yet.'); return res.redirect('/settings'); }
    let types = []; let error = '';
    try { types = await dispatch.client.vehicleTypes(); } catch (e) { error = e.message; }
    res.render('icabbi-vehicles', { title: 'iCabbi vehicle types', section: 'settings', types, error, mapped: dispatch.client.settings.vehicleTypes });
  }));
  app.post('/settings/prices/:id/delete', requireRole('manager'), wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = (await store.fixedPrices(scopeFor(req.user))).find((p) => p.id === id);
    if (row) { await store.deleteFixedPrice(id); await store.addEvent(null, { actor: req.user, kind: 'price_removed', detail: `Fixed price removed: ${row.from_place} to ${row.to_place}, ${row.vehicle}` }); }
    flash(req, 'ok', row ? 'Price removed.' : 'That price was already gone.');
    res.redirect('/settings');
  }));

  // ---- The Write worker (Tom, 10 November 2026: "an Ai worker who can
  // draft emails with prompts as well. staff need to be able to draft with
  // outreach, all while using my voice rules"). Staff say what the email is
  // for, the AI drafts it in Tom's voice rules (lib/compose.js), staff edit
  // or guide it, and approving saves it as a draft in the company's mailbox
  // for a person to send. Nothing is sent from the office.
  const compose = require('./lib/compose');
  const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
  const staffName = (u) => u.display_name || u.username;
  const companyOf = (brand) => brandName(firm, brand);
  // A draft is its writer's, and every draft is open to managers and the
  // owner, who see every company.
  // A draft to the council is for managers and owners only, whoever wrote it.
  const mayOpenDraft = (user, c) => Boolean(c) && c.status !== 'discarded' && (!compose.isCouncilKind(c.kind) || seesCouncil(user)) && (c.created_by === user.id || atLeast(user, 'manager'));
  const loadDraft = wrap(async (req, res, next) => {
    const c = await store.compositionById(Number(req.params.id));
    if (!mayOpenDraft(req.user, c)) return res.status(404).render('missing', { title: 'Not found' });
    req.draft = c;
    next();
  });
  const mailboxCanHold = () => !mailbox.demo && !mailbox.none && typeof mailbox.saveNewDraft === 'function' && mailbox.configured();

  app.get('/write', wrap(async (req, res) => {
    const drafts = await store.compositions(atLeast(req.user, 'manager') ? { council: false } : { userId: req.user.id, council: false });
    res.render('write', { title: 'Write', section: 'write', drafts, kinds: compose.KINDS, relationships: compose.RELATIONSHIPS, ownBrand: scopeFor(req.user) || '', mailboxCanHold: mailboxCanHold() });
  }));
  app.post('/write', wrap(async (req, res) => {
    const b = req.body;
    const kind = compose.isKind(b.kind) ? b.kind : 'new';
    const council = compose.isCouncilKind(kind);
    // An operator never writes to the council, and never learns this route
    // takes it: the same 404 as any page that is not theirs.
    if (council && !seesCouncil(req.user)) return res.status(404).render('missing', { title: 'Not found' });
    const back = council ? '/council#write-to-council' : '/write';
    const relationship = council ? 'formal' : (Object.prototype.hasOwnProperty.call(compose.RELATIONSHIPS, b.relationship) ? b.relationship : 'new');
    const prompt = String(b.prompt || '').trim().slice(0, 2000);
    const toAddress = String(b.to_address || '').trim().slice(0, 200);
    const toName = String(b.to_name || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const quoted = kind === 'reply' || kind === 'council_reply' ? String(b.quoted || '').trim().slice(0, 6000) : '';
    const own = scopeFor(req.user);
    const brand = own || ((firm.brands || []).some((x) => x.id === String(b.brand || '')) ? String(b.brand) : firm.mailboxBrand);
    if (prompt.length < 5) { flash(req, 'warn', 'Say what the email is for, in a sentence or two.'); return res.redirect(back); }
    if (toAddress && !EMAIL_RE.test(toAddress)) { flash(req, 'warn', 'That email address does not look right. Leave it blank if you do not have it yet.'); return res.redirect(back); }
    if ((kind === 'reply' || kind === 'council_reply') && !quoted) { flash(req, 'warn', kind === 'council_reply' ? "Paste the council's email, so the draft answers it." : 'Paste the email you are replying to, so the draft answers it.'); return res.redirect(back); }
    const row = { brand, kind, relationship, to_name: toName, to_address: toAddress, prompt, quoted, company_name: companyOf(brand) };
    let drafted = null; let note = '';
    if (aiOn()) {
      try { drafted = await compose.draft(row, office.today(), { ...firm, fixedPrices: await store.fixedPrices(brand || undefined).catch(() => []) }, { staffName: staffName(req.user) }); } catch (e) {
        console.error('Abacus office: Write worker failed', e.message);
        note = 'The AI could not draft it just now, so it is here to write by hand. Try Guide the AI in a minute.';
      }
    } else note = 'The AI is switched off, so write it here by hand.';
    const blank = `${council ? `Dear ${toName || 'Licensing Team'},` : 'Hello,'}\n\n\n\n${compose.signoff(relationship, staffName(req.user), companyOf(brand))}`;
    const c = await store.insertComposition({ ...row, subject: drafted ? drafted.subject : '', body: drafted ? drafted.body : blank, held_back: drafted ? drafted.heldBack : '', source: drafted ? 'ai' : 'none', actor: req.user });
    await store.addEvent(null, { actor: req.user, kind: 'write_drafted', detail: `${compose.ALL_KINDS[kind]} drafted for ${companyOf(brand)}${toName || toAddress ? ` to ${toName || toAddress}` : ''}` });
    if (note) flash(req, 'warn', note);
    res.redirect(`/write/${c.id}`);
  }));
  app.get('/write/:id', loadDraft, wrap(async (req, res) => {
    res.render('writing', { title: req.draft.subject || 'Draft', section: compose.isCouncilKind(req.draft.kind) ? 'council' : 'write', council: compose.isCouncilKind(req.draft.kind), c: req.draft, kinds: compose.ALL_KINDS, relationships: compose.RELATIONSHIPS, mailboxCanHold: mailboxCanHold(), companyName: companyOf(req.draft.brand) });
  }));
  const writeAct = (p, fn) => app.post(`/write/:id/${p}`, loadDraft, wrap(async (req, res) => { await fn(req, res); if (!res.headersSent && !res.locals.redirected) res.redirect(`/write/${req.draft.id}`); }));
  // Saving an edit takes an approved draft back to a draft, so what is in
  // the mailbox is always what someone approved.
  const takeEdits = (req) => {
    const f = {};
    if (req.body.subject !== undefined) f.subject = String(req.body.subject).replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
    if (req.body.body !== undefined) f.body = String(req.body.body).slice(0, 8000);
    if (req.body.to_address !== undefined) {
      const a = String(req.body.to_address).trim().slice(0, 200);
      if (a && !EMAIL_RE.test(a)) { const e = new Error('That email address does not look right.'); e.code = 'REFUSED'; throw e; }
      f.to_address = a;
    }
    const changed = Object.keys(f).some((k) => String(f[k]) !== String(req.draft[k]));
    if (changed && req.draft.status === 'approved') { f.status = 'draft'; f.approved_at = null; f.approved_by_name = ''; }
    return changed ? f : {};
  };
  writeAct('save', async (req) => {
    const f = takeEdits(req);
    await store.updateComposition(req.draft.id, f);
    flash(req, 'ok', Object.keys(f).length ? 'Saved.' : 'Nothing had changed.');
  });
  writeAct('guide', async (req) => {
    const f = takeEdits(req);
    const text = String(req.body.guidance || '').trim().slice(0, 1200);
    if (!text) { await store.updateComposition(req.draft.id, f); flash(req, 'warn', 'Say what you want changed.'); return; }
    if (!aiOn()) { await store.updateComposition(req.draft.id, f); flash(req, 'warn', 'The AI is switched off, so change the draft by hand.'); return; }
    const notes = [...(req.draft.guidance || []), text].slice(-6);
    const current = { ...req.draft, ...f, company_name: companyOf(req.draft.brand) };
    let out;
    try { out = await compose.redraft(current, office.today(), { ...firm, fixedPrices: await store.fixedPrices(req.draft.brand || undefined).catch(() => []) }, { staffName: req.draft.created_by_name || staffName(req.user), notes }); } catch (e) {
      await store.updateComposition(req.draft.id, f);
      flash(req, 'warn', 'The AI could not redraft it just now. Your edits are saved; try again in a minute.');
      return;
    }
    await store.updateComposition(req.draft.id, { ...f, subject: out.subject, body: out.body, held_back: out.heldBack, guidance: notes, source: 'ai', status: 'draft', approved_at: null, approved_by_name: '' });
    flash(req, 'ok', 'Redrafted.');
  });
  writeAct('approve', async (req) => {
    const f = takeEdits(req);
    if (Object.keys(f).length) await store.updateComposition(req.draft.id, f);
    const c = { ...req.draft, ...f };
    if (!String(c.subject || '').trim() || String(c.body || '').trim().length < 10) { flash(req, 'warn', 'It needs a subject and a message before it is approved.'); return; }
    let draftId = '';
    if (mailboxCanHold()) {
      if (!EMAIL_RE.test(c.to_address || '')) { flash(req, 'warn', 'Add the email address it is going to, so it can wait in the mailbox for you to send.'); return; }
      const r = await mailbox.saveNewDraft(c.to_address, c.subject, c.body);
      draftId = String((r && r.draftId) || '');
    }
    await store.updateComposition(req.draft.id, { status: 'approved', approved_at: now(), approved_by_name: staffName(req.user), mailbox_draft_id: draftId });
    await store.addEvent(null, { actor: req.user, kind: 'write_approved', detail: `${compose.ALL_KINDS[c.kind]} approved for ${companyOf(c.brand)}${c.to_address ? ` to ${c.to_address}` : ''}${draftId ? `, saved as a draft in ${mailbox.label}` : ''}` });
    flash(req, 'ok', mailboxCanHold() ? `Approved and saved as a draft in ${mailbox.label}. Open the mailbox to send it.` : 'Approved. No mailbox is connected yet, so copy it into your email and send it from there.');
  });
  writeAct('discard', async (req, res) => {
    await store.updateComposition(req.draft.id, { status: 'discarded' });
    await store.addEvent(null, { actor: req.user, kind: 'write_discarded', detail: `${compose.ALL_KINDS[req.draft.kind]} for ${companyOf(req.draft.brand)} discarded` });
    flash(req, 'ok', 'Discarded.');
    res.redirect(compose.isCouncilKind(req.draft.kind) ? '/council' : '/write');
  });

  // ---- Connecting the firm's own mailbox (Tom, 10 November 2026: "We
  // need the email api as well"). The owner presses Connect in Settings,
  // signs in to Google as the firm's mailbox, and the token comes straight
  // back here, sealed into the database. It is never shown, so nobody has
  // to copy it into a chat, an email or a variable. Google's answer is
  // checked: a token for any other address is cancelled on the spot.
  // Connecting needs the driver set to gmail, which is Tom's to do in
  // Railway once the data processing agreement is signed.
  const callbackUrl = (req) => `${baseUrl || `${req.protocol}://${req.get('host')}`}/settings/mailbox/callback`;
  const effEnv = () => (mailbox.effectiveEnv ? mailbox.effectiveEnv() : mailboxLib.driverEnv(mailEnv));
  function connectState() {
    const env = effEnv();
    const blockers = [];
    if (mailboxLib.driverName(mailEnv) !== 'gmail') blockers.push('ABACUS_OFFICE_MAIL_DRIVER is not gmail (set it only once the data processing agreement is signed)');
    if (!mailboxLib.expectedAddress(mailEnv)) blockers.push('ABACUS_OFFICE_MAILBOX_ADDRESS, the bookings mailbox\'s own address');
    gmailConnect.missing(env).forEach((v) => blockers.push(`the Google client ${/SECRET/.test(v) ? 'secret' : 'ID'} (in the form above)`));
    if (!secretBox.available(mailEnv)) blockers.push(`ABACUS_OFFICE_TOKEN_KEY (${secretBox.MIN_KEY} characters or more), which seals the token`);
    const stored = mailbox.stored ? mailbox.stored() : { connected: false };
    return { ready: blockers.length === 0, blockers, stored, driverGmail: mailboxLib.driverName(mailEnv) === 'gmail', keyReady: secretBox.available(mailEnv), clientInRailway: Boolean(String(mailboxLib.driverEnv(mailEnv).TAXI_OFFICE_GMAIL_CLIENT_SECRET || '').trim()), address: mailboxLib.expectedAddress(mailEnv), redirectUri: '/settings/mailbox/callback', envToken: Boolean(String(env.TAXI_OFFICE_GMAIL_REFRESH_TOKEN || '').trim()) };
  }
  app.get('/settings/mailbox/connect', requireRole('owner'), wrap(async (req, res) => {
    const c = connectState();
    if (!c.ready) { flash(req, 'warn', `The mailbox cannot be connected yet. Still needed: ${c.blockers.join('; ')}.`); return res.redirect('/settings#mailbox'); }
    const state = crypto.randomBytes(24).toString('hex');
    req.session.mailboxConnectState = state;
    res.redirect(gmailConnect.authorizeUrl({ env: effEnv(), redirectUri: callbackUrl(req), state, loginHint: c.address }));
  }));
  app.get('/settings/mailbox/callback', requireRole('owner'), wrap(async (req, res) => {
    const expected = req.session.mailboxConnectState;
    delete req.session.mailboxConnectState;
    const c = connectState();
    const back = (tone, message) => { flash(req, tone, message); res.redirect('/settings#mailbox'); };
    if (!c.ready) return back('warn', `The mailbox cannot be connected yet. Still needed: ${c.blockers.join('; ')}.`);
    if (req.query.error) return back('warn', `Google did not connect it: ${String(req.query.error).slice(0, 100)}.`);
    if (!expected || req.query.state !== expected) return back('warn', 'That could not be checked as the connection you started. Start again from Settings, in an ordinary browser window.');
    if (typeof req.query.code !== 'string' || !req.query.code) return back('warn', 'Google did not send back what it should. Start again.');
    const result = await gmailConnect.finish({ env: effEnv(), code: req.query.code, redirectUri: callbackUrl(req), expected: c.address, fetch: fetchImpl, mailboxName: 'the bookings mailbox' });
    if (!result.ok) {
      console.warn(`Abacus office: mailbox connection refused: ${result.message}`);
      await store.addEvent(null, { actor: req.user, kind: 'mailbox_refused', detail: `Mailbox connection refused${result.account ? ` (${result.account})` : ''}` });
      return back('warn', result.message);
    }
    await store.setSetting(mailboxLib.STORED.token, secretBox.seal(result.refreshToken, mailEnv));
    await store.setSetting(mailboxLib.STORED.account, result.account);
    await store.setSetting(mailboxLib.STORED.by, req.user.display_name || req.user.username);
    await store.setSetting(mailboxLib.STORED.at, new Date().toISOString());
    await store.addEvent(null, { actor: req.user, kind: 'mailbox_connected', detail: `Mailbox ${result.account} connected` });
    console.log(`Abacus office: mailbox ${result.account} connected from Settings by ${req.user.username}; token sealed in the database`);
    if (mailbox.reload) await mailbox.reload();
    lastSync = 0;
    back('ok', `${result.account} is connected. The inbox fills from it within a couple of minutes, and replies are saved there as drafts. Nothing is sent from the office.`);
  }));
  app.post('/settings/mailbox/client', requireRole('owner'), wrap(async (req, res) => {
    const id = String(req.body.client_id || '').trim();
    const secret = String(req.body.client_secret || '').trim();
    if (!secretBox.available(mailEnv)) { flash(req, 'warn', 'The server is not ready to keep a secret yet (ABACUS_OFFICE_TOKEN_KEY). Nothing was saved.'); return res.redirect('/settings#mailbox'); }
    if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) { flash(req, 'warn', 'That does not look like a Google client ID. It ends .apps.googleusercontent.com. Nothing was saved.'); return res.redirect('/settings#mailbox'); }
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(secret)) { flash(req, 'warn', 'That does not look like a Google client secret. Copy it again from Google Cloud. Nothing was saved.'); return res.redirect('/settings#mailbox'); }
    await store.setSetting(mailboxLib.CLIENT.id, id);
    await store.setSetting(mailboxLib.CLIENT.secret, secretBox.seal(secret, mailEnv));
    await store.addEvent(null, { actor: req.user, kind: 'mailbox_client_saved', detail: 'Google client details saved for the mailbox connection' });
    if (mailbox.reload) await mailbox.reload();
    flash(req, 'ok', 'Saved. The secret is sealed and is not shown again. Now press Connect the mailbox.');
    res.redirect('/settings#mailbox');
  }));
  app.post('/settings/mailbox/disconnect', requireRole('owner'), wrap(async (req, res) => {
    const sealed = await store.setting(mailboxLib.STORED.token);
    const token = sealed ? secretBox.open(sealed, mailEnv) : null;
    if (token) {
      // Cancel it at Google too, so the old token is useless wherever it is.
      try { await fetchImpl('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() }); } catch { /* best effort */ }
    }
    for (const k of Object.values(mailboxLib.STORED)) await store.setSetting(k, '');
    await store.addEvent(null, { actor: req.user, kind: 'mailbox_disconnected', detail: 'Mailbox disconnected' });
    if (mailbox.reload) await mailbox.reload();
    flash(req, 'ok', 'The mailbox is disconnected and its token cancelled at Google. Nothing more is read from it.');
    res.redirect('/settings#mailbox');
  }));

  app.use((req, res) => res.status(404).render('missing', { title: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.code === 'EBADCSRFTOKEN') return res.status(403).render('missing', { title: 'Expired', message: 'This page had expired. Go back and try again.' });
    console.error('Abacus office error:', err);
    res.status(500).render('missing', { title: 'Something went wrong', message: 'Something went wrong on our side. Try again in a moment.' });
  });

  return { app, store, office };
}

function safeNext(n) {
  const s = String(n || '');
  return /^\/(?!\/)[A-Za-z0-9/_\-?=&.%]*$/.test(s) ? s : '/';
}

module.exports = { createApp, safeNext };
