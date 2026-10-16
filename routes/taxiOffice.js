'use strict';

// Tidewell Cars office (/taxi-demo/office): the staff side of the taxi demo,
// built for showing operators what AI workers do in a taxi office (Tom,
// 16/10/2026: "I want a staff portal taxi related I can show Dan").
//
// Three AI workers, all drafting, none sending:
//   - Booking inbox: reads each booking email, checks it against the
//     dispatch board (plain code decides whether it matches), and drafts
//     the reply. Staff put dispatch right with one click and "send".
//   - Licensing: the renewals register, and drafts for the council's
//     licensing team. Never writes to the council itself.
//   - Social: drafts the week's posts for the owner to approve.
//
// Who can open it: the same people who can open the Scott demonstration
// (Tom's own logins, plus anyone granted Scott in Page access, such as Dan),
// through the site's ordinary staff login. One list to manage, and the AI
// behind it cannot be spent by the public. Anyone else gets the site's
// ordinary 404, like every other restricted page.
//
// Served by this app rather than the public demo's own server, because the
// demo deliberately has no sessions, no cookies and no database. server.js
// passes /taxi-demo/office through the demo's mount to here.

const { hasScottAccess } = require('../lib/scott/access');
const { render404 } = require('../lib/render404');
const office = require('../lib/taxiOffice/office');
const data = require('../lib/taxiOffice/data');
const match = require('../lib/taxiOffice/match');
const ai = require('../lib/taxiOffice/ai');
const { FIRM } = require('../taxi-demo/lib/firm');

const BASE = '/taxi-demo/office';

function noindex(req, res, next) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  // The staff side is never recorded by Clarity, same as the staff login.
  res.locals.noClarity = true;
  next();
}

function requireOfficeAccess(req, res, next) {
  const user = req.session && req.session.user;
  if (!user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl.split('?')[0] || BASE)}`);
  hasScottAccess(user)
    .then((ok) => (ok ? next() : render404(req, res)))
    .catch(next);
}

function stateOf(req) {
  return office.stateFor(req.session.id);
}

function flash(s, message, tone = 'ok') {
  s.flash = { message, tone };
}

function takeFlash(s) {
  const f = s.flash || null;
  s.flash = null;
  return f;
}

function render(req, res, view, locals) {
  const s = stateOf(req);
  res.render(`taxi-office/${view}`, {
    BASE,
    FIRM,
    today: s.today,
    todayLong: data.longDate(s.today),
    aiOn: ai.aiEnabled(),
    counts: office.summary(s),
    flash: takeFlash(s),
    user: req.session.user,
    STATUS: match.STATUS,
    VEHICLE_LABELS: match.VEHICLE_LABELS,
    longDate: data.longDate,
    shortDate: data.shortDate,
    weekday: data.weekday,
    ...locals
  });
}

const VIEW = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function mountPageRoute(app) {
  const page = (path, handler) => app.get(BASE + path, noindex, requireOfficeAccess, VIEW(handler));
  const post = (path, handler) => app.post(BASE + path, noindex, requireOfficeAccess, VIEW(handler));

  page('/', (req, res) => {
    const s = stateOf(req);
    const emails = office.inbox(s).map((e) => ({ email: e, status: office.readingStatus(s, e) }));
    const reg = office.register(s).filter((i) => i.urgency.level !== 'ok');
    const todayJobs = s.board.filter((j) => j.date === s.today).sort((a, b) => a.time.localeCompare(b.time));
    render(req, res, 'today', { section: 'today', emails, reg, todayJobs, changes: s.changes.slice(0, 5), social: s.social, approved: s.approved });
  });

  page('/inbox', (req, res) => {
    const s = stateOf(req);
    const emails = office.inbox(s).map((e) => ({ email: e, status: office.readingStatus(s, e), reading: s.readings[e.id] || null, sent: Boolean(s.sent[e.id]) }));
    render(req, res, 'inbox', { section: 'inbox', emails, limit: office.LIMITS.custom });
  });

  post('/inbox/check-all', async (req, res) => {
    const s = stateOf(req);
    const n = await office.readAll(s);
    flash(s, n ? `Read ${n} email${n === 1 ? '' : 's'} and checked them against dispatch.` : 'Every email has already been read.');
    res.redirect(303, BASE + '/inbox');
  });

  post('/inbox/new', async (req, res) => {
    const s = stateOf(req);
    const email = office.addCustomEmail(s, { from: req.body.from, subject: req.body.subject, body: req.body.body });
    if (!email) {
      flash(s, 'Write the email before sending it in.', 'warn');
      return res.redirect(303, BASE + '/inbox#write');
    }
    await office.readEmail(s, email);
    res.redirect(303, `${BASE}/inbox/${email.id}`);
  });

  page('/inbox/:id', (req, res) => {
    const s = stateOf(req);
    const email = office.findEmail(s, req.params.id);
    if (!email) return render404(req, res);
    const reading = s.readings[email.id] || null;
    const cmp = reading && reading.data ? match.compare(reading.data, s.board) : null;
    const status = office.readingStatus(s, email);
    const regItem = email.routeTo === 'licensing' ? office.register(s).find((i) => i.council === email.id) : null;
    render(req, res, 'email', { section: 'inbox', email, reading, cmp, status, sent: s.sent[email.id] || null, regItem });
  });

  post('/inbox/:id/read', async (req, res) => {
    const s = stateOf(req);
    const email = office.findEmail(s, req.params.id);
    if (!email) return render404(req, res);
    await office.readEmail(s, email, { force: req.body.again === '1' });
    res.redirect(303, `${BASE}/inbox/${email.id}`);
  });

  post('/inbox/:id/fix', (req, res) => {
    const s = stateOf(req);
    const email = office.findEmail(s, req.params.id);
    if (!email) return render404(req, res);
    const r = office.fixLeg(s, email, Number.parseInt(req.body.leg, 10));
    flash(s, r.message, r.ok ? 'ok' : 'warn');
    res.redirect(303, `${BASE}/inbox/${email.id}`);
  });

  post('/inbox/:id/send', (req, res) => {
    const s = stateOf(req);
    const email = office.findEmail(s, req.params.id);
    if (!email) return render404(req, res);
    const r = office.markSent(s, email, req.body.reply);
    flash(s, r.message, r.ok ? 'ok' : 'warn');
    res.redirect(303, `${BASE}/inbox/${email.id}`);
  });

  page('/dispatch', (req, res) => {
    const s = stateOf(req);
    const jobs = s.board.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const days = [];
    for (const j of jobs) {
      let d = days.find((x) => x.date === j.date);
      if (!d) { d = { date: j.date, jobs: [] }; days.push(d); }
      d.jobs.push(j);
    }
    render(req, res, 'dispatch', { section: 'dispatch', days, changes: s.changes });
  });

  page('/licensing', (req, res) => {
    const s = stateOf(req);
    const items = office.register(s);
    const councilEmails = office.inbox(s).filter((e) => e.routeTo === 'licensing');
    render(req, res, 'licensing', { section: 'licensing', items, drafts: s.licensing, councilEmails });
  });

  post('/licensing/:id/draft', async (req, res) => {
    const s = stateOf(req);
    const r = await office.draftLicensing(s, req.params.id, { force: req.body.again === '1' });
    if (!r) return render404(req, res);
    res.redirect(303, `${BASE}/licensing#item-${req.params.id}`);
  });

  page('/social', (req, res) => {
    const s = stateOf(req);
    render(req, res, 'social', { section: 'social', facts: data.socialFacts(s.today), social: s.social, approved: s.approved, images: data.SOCIAL_IMAGES });
  });

  post('/social/draft', async (req, res) => {
    const s = stateOf(req);
    await office.draftSocial(s);
    res.redirect(303, BASE + '/social');
  });

  post('/social/:i/approve', (req, res) => {
    const s = stateOf(req);
    const i = Number.parseInt(req.params.i, 10);
    if (s.social && s.social.posts[i]) {
      s.approved[i] = true;
      flash(s, 'Approved. In this demo nothing is posted anywhere.');
    }
    res.redirect(303, BASE + '/social');
  });

  post('/reset', (req, res) => {
    office.reset(req.session.id);
    res.redirect(303, BASE + '/');
  });
}

module.exports = { mountPageRoute, BASE };
