'use strict';

// Tidewell Cars office (/taxi-demo/office): the staff side of the taxi demo,
// built for showing operators what AI workers do in a taxi office (Tom,
// 16/10/2026: "I want a staff portal taxi related I can show Dan", then the
// same day: an email connector, customer emails as their own worker, the
// iCabbi API to book jobs in, and complaints as a worker of their own).
//
// Six AI workers (lib/taxiOffice/workers.js), all drafting, none sending:
//   - Bookings: reads booking emails, checks them against dispatch (plain
//     code decides), and books, corrects or cancels through the dispatch
//     connection. Drafts the reply.
//   - Checker (17/10/2026): a second AI that checks every booking against
//     the customer's own email. Nothing goes into dispatch until a person
//     signs it off with the checker's result in front of them.
//   - Customer emails: lost property, accounts, questions; looks up the
//     journey in dispatch where the answer is there.
//   - Complaints: pulls the job's record from dispatch and drafts the reply
//     from it; passes safety matters to Licensing.
//   - Licensing: the renewals register, drafts for the council's licensing
//     team, and what Complaints passes on. Never writes to the council.
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

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { hasScottAccess } = require('../lib/scott/access');
const { render404 } = require('../lib/render404');
const office = require('../lib/taxiOffice/office');
const data = require('../lib/taxiOffice/data');
const match = require('../lib/taxiOffice/match');
const ai = require('../lib/taxiOffice/ai');
const workers = require('../lib/taxiOffice/workers');
const mail = require('../lib/taxiOffice/mail');
const gmailConnect = require('../lib/taxiOffice/mail/gmailConnect');
const { FIRM } = require('../taxi-demo/lib/firm');

const BASE = '/taxi-demo/office';

// The office's stylesheet and script are served from /public, which browsers
// may keep for a day. Their addresses carry a version taken from their
// contents, so a change reaches every browser on its next page, not a day
// later (17/10/2026: the new worker icons drew full width for a visitor
// whose browser still held the stylesheet from before they existed).
function assetVersion(rel) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'public', rel))).digest('hex').slice(0, 10);
  } catch {
    return String(Date.now());
  }
}
const ASSET_V = { css: assetVersion('css/taxi-office.css'), js: assetVersion('js/taxi-office.js') };

// What the four counts on the Today page open (?show=...): the list each one
// counts, from the same definitions in lib/taxiOffice/office.js. Anything
// else in ?show= shows everything.
const FILTERS = {
  dispatch: { today: ['job on the board today', 'jobs on the board today'] },
  inbox: { todo: ['email to deal with', 'emails to deal with'] },
  complaints: { open: ['complaint waiting for a reply', 'complaints waiting for a reply'] },
  licensing: { due: ['licensing item due or passed on', 'licensing items due or passed on'] }
};

function filterFor(req, pageName, count) {
  const key = String(req.query.show || '');
  const labels = Object.hasOwn(FILTERS[pageName], key) ? FILTERS[pageName][key] : null;
  if (!labels) return null;
  return { key, count, label: count === 1 ? labels[0] : labels[1], none: labels[1], allHref: `${BASE}/${pageName}` };
}

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
    ASSET_V,
    filter: null,
    FIRM,
    today: s.today,
    todayLong: data.longDate(s.today),
    aiOn: ai.aiEnabled(),
    readingNow: office.readingNow(s),
    counts: office.summary(s),
    flash: takeFlash(s),
    user: req.session.user,
    STATUS: match.STATUS,
    VEHICLE_LABELS: match.VEHICLE_LABELS,
    WORKERS: workers.WORKERS,
    WORKER: workers.byId,
    conn: office.connections(),
    longDate: data.longDate,
    shortDate: data.shortDate,
    weekday: data.weekday,
    ...locals
  });
}

const VIEW = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function mountPageRoute(app) {
  // Every page starts the workers reading the inbox if they have not yet,
  // and waits a moment for them (office.settleReading).
  // (Not the mailbox connection pages, which have nothing to do with it.)
  const settle = (req, res, next) => (req.path.startsWith(BASE + '/connect/') ? next() : office.settleReading(stateOf(req)).then(() => next(), next));
  const page = (path, handler) => app.get(BASE + path, noindex, requireOfficeAccess, settle, VIEW(handler));
  const post = (path, handler) => app.post(BASE + path, noindex, requireOfficeAccess, VIEW(handler));

  const rows = (s) => office.inbox(s).map((e) => ({ email: e, status: office.readingStatus(s, e), worker: office.workerOf(s, e), reading: s.readings[e.id] || null, sent: Boolean(s.sent[e.id]), check: office.checkState(s, e) }));

  page('/', async (req, res) => {
    const s = stateOf(req);
    await Promise.all([office.refreshMailbox(s), office.refreshLive()]);
    const emails = rows(s);
    const reg = office.register(s).filter((i) => i.urgency.level !== 'ok');
    const todayJobs = s.board.filter((j) => j.date === s.today).sort((a, b) => a.time.localeCompare(b.time));
    render(req, res, 'today', { section: 'today', emails, reg, todayJobs, complaints: office.complaintsLog(s), passed: office.passedToLicensing(s), changes: s.changes.slice(0, 5), social: s.social, approved: s.approved });
  });

  page('/inbox', async (req, res) => {
    const s = stateOf(req);
    const [box] = await Promise.all([office.refreshMailbox(s), office.refreshLive()]);
    if (!box.ok) flash(s, `The mailbox could not be read just now: ${box.message}`, 'warn');
    // An email to the visitor's live address arrives already read.
    await office.readNewLive(s);
    const live = office.liveFor(s);
    let emails = rows(s);
    const filter = filterFor(req, 'inbox', office.emailsToDealWith(s).length);
    if (filter) {
      const ids = new Set(office.emailsToDealWith(s).map((e) => e.id));
      emails = emails.filter((r) => ids.has(r.email.id));
    }
    render(req, res, 'inbox', { section: 'inbox', emails, filter, limit: office.LIMITS.custom, live, liveCount: live ? office.liveEmails(s).length : 0 });
  });

  // How many emails have reached this visitor's live address. The inbox page
  // asks every few seconds while it waits, and reloads when one arrives.
  app.get(BASE + '/inbox/live.json', noindex, requireOfficeAccess, VIEW(async (req, res) => {
    const s = stateOf(req);
    const r = await office.refreshLive();
    res.json({ live: Boolean(office.liveFor(s)), ok: r.ok, count: office.liveEmails(s).length });
  }));

  // Whether the workers are still reading. A page opened while they read
  // asks every few seconds and reloads when they have finished.
  app.get(BASE + '/inbox/reading.json', noindex, requireOfficeAccess, (req, res) => {
    const s = stateOf(req);
    res.json({ reading: office.readingNow(s), unread: office.unreadDemo(s).length });
  });

  post('/inbox/check-all', async (req, res) => {
    const s = stateOf(req);
    const job = office.startReading(s);
    const n = job ? await job : 0;
    flash(s, n ? `Read ${n} email${n === 1 ? '' : 's'} and passed each one to its worker.` : 'Every email has already been read.');
    res.redirect(303, BASE + (req.body.back === 'today' ? '/' : '/inbox'));
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
    const worker = office.workerOf(s, email);
    const regItem = worker === 'licensing' ? office.register(s).find((i) => i.council === email.id) : null;
    const pastJobs = worker === 'customer' ? office.pastJobsFor(s, email) : [];
    render(req, res, 'email', { section: 'inbox', email, reading, cmp, status, worker, sent: s.sent[email.id] || null, regItem, pastJobs, complaint: s.complaints[email.id] || null, guided: s.guided[email.id] || null, replyText: office.replyFor(s, email), guideMax: office.MAX_GUIDANCE, check: s.checks[email.id] || null, checkState: office.checkState(s, email) });
  });

  post('/inbox/:id/read', async (req, res) => {
    const s = stateOf(req);
    const email = office.findEmail(s, req.params.id);
    if (!email) return render404(req, res);
    await office.readEmail(s, email, { force: req.body.again === '1' });
    res.redirect(303, `${BASE}/inbox/${email.id}`);
  });

  post('/inbox/:id/fix', async (req, res) => {
    const s = stateOf(req);
    const email = office.findEmail(s, req.params.id);
    if (!email) return render404(req, res);
    // Signed off by whoever is signed in: the tick is theirs, and the board
    // records who gave it.
    const r = await office.fixLeg(s, email, Number.parseInt(req.body.leg, 10), { signedOff: req.body.signoff === 'yes', by: req.session.user && req.session.user.username });
    flash(s, r.message, r.ok ? 'ok' : 'warn');
    res.redirect(303, `${BASE}/inbox/${email.id}${r.ok ? '' : '#check'}`);
  });

  // The checker: take its corrections into the booking, or ask it again.
  post('/inbox/:id/apply-check', async (req, res) => {
    const s = stateOf(req);
    const email = office.findEmail(s, req.params.id);
    if (!email) return render404(req, res);
    const r = await office.applyCheck(s, email);
    flash(s, r.message, r.ok ? 'ok' : 'warn');
    res.redirect(303, `${BASE}/inbox/${email.id}#check`);
  });

  post('/inbox/:id/recheck', async (req, res) => {
    const s = stateOf(req);
    const email = office.findEmail(s, req.params.id);
    if (!email) return render404(req, res);
    await office.checkBooking(s, email, { force: true });
    res.redirect(303, `${BASE}/inbox/${email.id}#check`);
  });

  post('/inbox/:id/send', async (req, res) => {
    const s = stateOf(req);
    const email = office.findEmail(s, req.params.id);
    if (!email) return render404(req, res);
    const r = await office.markSent(s, email, req.body.reply);
    flash(s, r.message, r.ok ? 'ok' : 'warn');
    res.redirect(303, req.body.back === 'complaints' ? `${BASE}/complaints#c-${email.id}` : `${BASE}/inbox/${email.id}`);
  });

  // Staff steering a draft reply: the AI redrafts it to say what they want.
  // The draft as edited on screen goes with it, so a hand edit is kept.
  const backTo = (req, email, anchor) => (req.body.back === 'complaints' ? `${BASE}/complaints#c-${email.id}` : `${BASE}/inbox/${email.id}${anchor || ''}`);

  post('/inbox/:id/guide', async (req, res) => {
    const s = stateOf(req);
    const email = office.findEmail(s, req.params.id);
    if (!email) return render404(req, res);
    const r = await office.guideReply(s, email, { guidance: req.body.guidance, draft: req.body.reply });
    flash(s, r.message, r.ok ? 'ok' : 'warn');
    res.redirect(303, backTo(req, email, '#draft'));
  });

  post('/inbox/:id/unguide', (req, res) => {
    const s = stateOf(req);
    const email = office.findEmail(s, req.params.id);
    if (!email) return render404(req, res);
    office.unguideReply(s, email);
    flash(s, "Back to the worker's first draft.");
    res.redirect(303, backTo(req, email, '#draft'));
  });

  page('/complaints', (req, res) => {
    const s = stateOf(req);
    const all = office.complaintsLog(s);
    const filter = filterFor(req, 'complaints', office.openComplaints(s).length);
    const log = filter ? office.openComplaints(s) : all;
    render(req, res, 'complaints', { section: 'complaints', log, logged: all.length, filter, unread: office.inbox(s).filter((e) => !(s.readings[e.id] && s.readings[e.id].data)).length, guided: s.guided, guideMax: office.MAX_GUIDANCE });
  });

  post('/complaints/:id/draft', async (req, res) => {
    const s = stateOf(req);
    const email = office.findEmail(s, req.params.id);
    if (!email) return render404(req, res);
    await office.handleComplaint(s, email, { force: req.body.again === '1' });
    res.redirect(303, `${BASE}/complaints#c-${email.id}`);
  });

  page('/dispatch', (req, res) => {
    const s = stateOf(req);
    const filter = filterFor(req, 'dispatch', office.jobsToday(s).length);
    const jobs = (filter ? office.jobsToday(s) : s.board.slice()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const days = [];
    for (const j of jobs) {
      let d = days.find((x) => x.date === j.date);
      if (!d) { d = { date: j.date, jobs: [] }; days.push(d); }
      d.jobs.push(j);
    }
    render(req, res, 'dispatch', { section: 'dispatch', days, filter, changes: s.changes });
  });

  page('/licensing', (req, res) => {
    const s = stateOf(req);
    const passed = office.passedToLicensing(s);
    const due = office.licensingDueItems(s);
    const filter = filterFor(req, 'licensing', due.length + passed.length);
    const items = filter ? due : office.register(s);
    // Filtered, a council email shows only beside a register item on screen.
    const councilEmails = office.inbox(s).filter((e) => e.routeTo === 'licensing' || office.workerOf(s, e) === 'licensing')
      .filter((e) => !filter || items.some((i) => i.council === e.id));
    render(req, res, 'licensing', { section: 'licensing', items, filter, drafts: s.licensing, licGuided: s.licGuided, councilEmails, passed, guideMax: office.MAX_GUIDANCE });
  });

  post('/licensing/:id/draft', async (req, res) => {
    const s = stateOf(req);
    const r = await office.draftLicensing(s, req.params.id, { force: req.body.again === '1' });
    if (!r) return render404(req, res);
    res.redirect(303, `${BASE}/licensing#item-${req.params.id}`);
  });

  post('/licensing/:id/guide', async (req, res) => {
    const s = stateOf(req);
    const r = await office.guideLicensing(s, req.params.id, { guidance: req.body.guidance });
    if (!r) return render404(req, res);
    flash(s, r.message, r.ok ? 'ok' : 'warn');
    res.redirect(303, `${BASE}/licensing#item-${req.params.id}`);
  });

  post('/licensing/:id/unguide', (req, res) => {
    const s = stateOf(req);
    office.unguideLicensing(s, req.params.id);
    flash(s, "Back to the worker's first draft.");
    res.redirect(303, `${BASE}/licensing#item-${req.params.id}`);
  });

  page('/social', (req, res) => {
    const s = stateOf(req);
    render(req, res, 'social', { section: 'social', facts: data.socialFacts(s.today), social: s.social, approved: s.approved, images: data.SOCIAL_IMAGES, guideMax: office.MAX_GUIDANCE });
  });

  post('/social/draft', async (req, res) => {
    const s = stateOf(req);
    await office.draftSocial(s, { steer: req.body.steer });
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

  // Connecting the live address: Tom only (the site's admin and content
  // logins), never an invited viewer. See lib/taxiOffice/mail/gmailConnect.js.
  const canConnect = (req) => ['admin', 'content'].includes(req.session.user && req.session.user.role);
  const callbackUrl = (req) => `${req.protocol}://${req.get('host')}${BASE}/connect/gmail/callback`;

  page('/connect/gmail', (req, res) => {
    if (!canConnect(req)) return render404(req, res);
    const address = mail.demoAddress();
    const missing = gmailConnect.missing();
    if (!address || missing.length) {
      return render(req, res, 'connect', { section: 'inbox', result: null, address, missing, redirectUri: callbackUrl(req) });
    }
    const state = crypto.randomBytes(24).toString('hex');
    req.session.taxiOfficeGmailState = state;
    res.redirect(gmailConnect.authorizeUrl({ redirectUri: callbackUrl(req), state, loginHint: address }));
  });

  page('/connect/gmail/callback', async (req, res) => {
    if (!canConnect(req)) return render404(req, res);
    const expected = req.session.taxiOfficeGmailState;
    delete req.session.taxiOfficeGmailState;
    const address = mail.demoAddress();
    const show = (result) => render(req, res, 'connect', { section: 'inbox', result, address, missing: gmailConnect.missing(), redirectUri: callbackUrl(req) });
    if (req.query.error) return show({ ok: false, message: `Google did not connect it: ${String(req.query.error).slice(0, 100)}.` });
    if (!expected || req.query.state !== expected) return show({ ok: false, message: 'That could not be checked as the connection you started. Start again from this page, in an ordinary browser window.' });
    if (typeof req.query.code !== 'string' || !req.query.code || !address) return show({ ok: false, message: 'Google did not send back what it should. Start again.' });
    const result = await gmailConnect.finish({ code: req.query.code, redirectUri: callbackUrl(req), expected: address });
    if (result.ok) console.log(`Taxi office: a Gmail token was issued for the live address ${result.account}; Tom copies it into Railway.`);
    else console.warn(`Taxi office: Gmail connection refused: ${result.message}`);
    show(result);
  });

  post('/reset', (req, res) => {
    office.reset(req.session.id);
    res.redirect(303, BASE + '/');
  });
}

module.exports = { mountPageRoute, BASE };
