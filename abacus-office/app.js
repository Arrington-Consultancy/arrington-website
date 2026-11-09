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
const { Office, canApprove, canReassign, canSee, scopeFor, needsManager, atLeast, label, brandName } = require('./lib/cases');
const ai = require('./lib/ai');
const alerts = require('./lib/alerts');
const { createDispatch } = require('./lib/dispatch');
const { longDate } = require('./lib/demoInbox');

const ROOT = path.join(__dirname, '..');
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

function assetVersion(rel) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'public', rel))).digest('hex').slice(0, 10); } catch { return 'dev'; }
}

function createApp({ pool, mailbox, firm, dispatch, sessionSecret = process.env.SESSION_SECRET, production = process.env.NODE_ENV === 'production', aiOn = ai.aiEnabled, now = () => new Date(), alertsEnv = process.env, baseUrl = String(process.env.ABACUS_OFFICE_PUBLIC_URL || '').replace(/\/$/, '') }) {
  if (!sessionSecret || sessionSecret.length < 16) throw new Error('SESSION_SECRET must be set (16 characters or more)');
  const store = new Store(pool);
  if (!dispatch) dispatch = createDispatch({ store, prefix: String(firm.short || 'AB').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'AB' });
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
    res.locals.todayLong = longDate(office.today());
    res.locals.flash = null;
    res.locals.label = label;
    res.locals.atLeast = atLeast;
    res.locals.canApprove = canApprove;
    res.locals.canReassign = canReassign;
    res.locals.needsManager = needsManager;
    res.locals.brandName = (id) => brandName(firm, id);
    res.locals.manyBrands = (firm.brands || []).length > 1;
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
      if (req.session.flash) { res.locals.flash = req.session.flash; delete req.session.flash; }
      res.locals.counts = req.user ? await store.counts(scopeFor(req.user)) : null;
      next();
    } catch (e) { next(e); }
  });

  const flash = (req, tone, message) => { req.session.flash = { tone, message }; };
  // Same race for every redirect after a change: save the session first.
  app.use((req, res, next) => {
    const redirect = res.redirect.bind(res);
    res.redirect = (...args) => (req.session ? req.session.save(() => redirect(...args)) : redirect(...args));
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
  app.post('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });

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
  async function settle() {
    if (syncing || Date.now() - lastSync < 2 * 60 * 1000) return;
    syncing = true;
    try { await office.sync(); await office.readAllUnread(); lastSync = Date.now(); } catch (e) { console.error('Abacus office: sync failed', e.message); } finally { syncing = false; }
  }
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
    res.json({ stamp: await store.liveStamp(scopeFor(req.user)), checkedAt: lastSync, syncing: syncing });
  }));

  app.get('/', wrap(async (req, res) => {
    const scope = scopeFor(req.user);
    const [overdue, passedUp, mine, open, recent, stamp] = await Promise.all([
      store.listCases({ escalated: true, brand: scope, limit: 20 }),
      store.listCases({ passedUp: true, brand: scope, limit: 20 }),
      store.listCases({ ownerId: req.user.id, open: true, brand: scope, limit: 20 }),
      store.listCases({ open: true, brand: scope, limit: 50 }),
      store.recentEvents(12),
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
    const scope = scopeFor(req.user);
    const filter = { open: { open: true }, new: { status: 'new' }, mine: { ownerId: req.user.id, open: true }, waiting: { status: 'waiting' }, done: { status: 'done' }, all: {} }[show] || { open: true };
    const cases = await store.listCases({ ...filter, brand: scope, limit: 200 });
    res.render('inbox', { title: 'Inbox', section: 'inbox', cases, show, liveStamp: await store.liveStamp(scope), lastSync });
  }));
  app.post('/inbox/sync', wrap(async (req, res) => {
    lastSync = 0;
    const created = await office.sync();
    const read = await office.readAllUnread();
    lastSync = Date.now();
    flash(req, 'ok', `${created.length} new ${created.length === 1 ? 'email' : 'emails'} from ${mailbox.label}${read ? `, ${read} read` : ''}. The inbox also checks itself every couple of minutes.`);
    res.redirect('/inbox');
  }));

  app.get('/complaints', wrap(async (req, res) => {
    const scope = scopeFor(req.user);
    const cases = (await store.listCases({ kind: 'complaints', brand: scope, limit: 200 })).filter((c) => req.query.show === 'all' || c.status !== 'done');
    const order = { safety: 0, serious: 1, minor: 2, none: 3 };
    cases.sort((a, b) => (order[a.seriousness] - order[b.seriousness]) || (new Date(a.received_at) - new Date(b.received_at)));
    res.render('complaints', { title: 'Complaints', section: 'complaints', cases, showAll: req.query.show === 'all', liveStamp: await store.liveStamp(scope), lastSync, nudgeHours: await store.complaintNudgeHours() });
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
    res.render('case', { title: kase.subject || 'Email', section: 'inbox', kase, events, users: users.filter((u) => u.active && (!u.brand || u.brand === (kase.brand || ''))), booking: office.bookingFrom(kase), holdingText: kase.kind === 'complaints' ? office.holdingText(kase) : '' });
  }));
  const act = (p, fn) => app.post(`/case/:id/${p}`, loadCase, wrap(async (req, res) => { await fn(req, res); if (!res.headersSent) res.redirect(`/case/${req.kase.id}`); }));
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
    flash(req, 'ok', mailbox.demo ? 'Holding reply approved. With a real mailbox connected it would now be a draft in it, ready to send.' : `Holding reply saved as a draft in ${mailbox.label}. Open the mailbox to send it.`);
  });
  act('book', async (req) => {
    const { ref } = await office.book(req.kase, req.user, req.body, req.body.signed_off === 'yes');
    flash(req, 'ok', `Booked into ${dispatch.label} as ${ref}.`);
  });
  act('approve', async (req) => {
    if (req.body.draft !== undefined && String(req.body.draft) !== String(req.kase.draft)) await office.saveDraft(req.kase, req.user, req.body.draft);
    const fresh = await store.caseById(req.kase.id);
    await office.approve(fresh, req.user);
    flash(req, 'ok', mailbox.demo ? 'Approved. With a real mailbox connected this would now be a draft in it, ready to send.' : `Approved and saved as a draft in ${mailbox.label}. Open the mailbox to send it.`);
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
    res.render('activity', { title: 'Activity', section: 'activity', events: await store.recentEvents(200) });
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
    res.render('settings', { title: 'Settings', section: 'settings', hours: await store.escalationHours(), nudgeHours: await store.complaintNudgeHours(), prices: await store.fixedPrices(scopeFor(req.user)), brands: firm.brands || [], alertStatus: alerts.describeAlertStatus(alertsEnv), mailStatus: require('./lib/mailbox').describeMailStatus(), aiStatus: ai.describeAiStatus(), dispatchStatus: require('./lib/dispatch').describeDispatchStatus() });
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
  app.post('/settings/prices/:id/delete', requireRole('manager'), wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = (await store.fixedPrices(scopeFor(req.user))).find((p) => p.id === id);
    if (row) { await store.deleteFixedPrice(id); await store.addEvent(null, { actor: req.user, kind: 'price_removed', detail: `Fixed price removed: ${row.from_place} to ${row.to_place}, ${row.vehicle}` }); }
    flash(req, 'ok', row ? 'Price removed.' : 'That price was already gone.');
    res.redirect('/settings');
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
