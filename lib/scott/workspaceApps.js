// Scott demonstration: the everyday applications — Messages, Tasks, Email
// and Calendar.
//
// Tom's instruction (15/09/2026): these may be built, they should be
// credible and beautiful rather than clones of Gmail or Outlook, and they
// must REUSE the fictional company that already exists rather than
// inventing a second disconnected world to populate a screen.
//
// So nothing here holds a customer, a job, a date or a person of its own.
// Every thread, every diary entry and every task is derived from rows the
// demonstration already has: scott_enquiries, scott_jobs, scott_customers.
// Open Mrs Tolley's email thread and it is the same enquiry that is on the
// Messages list and the same job that is on the board, because it IS that
// enquiry and that job. A screen that agreed with nothing else would be
// scenery, and scenery is the opposite of what this demonstration is for.
//
// CLEARANCE IS NOT WEAKENED BY BEING SOMEWHERE NEW. These are new views of
// records that already have domains, so the same clearance rule applies:
// email threads and messages are `leads`, diary entries are `jobs_ops`,
// and a customer's own details are `customers_contact`. Every function
// below takes a `canSee` predicate — in practice clearance.personaCanSeeDomain
// bound to the effective persona — and returns nothing rather than
// everything when it is not satisfied. A person who cannot see enquiries
// has an empty inbox, not somebody else's.
//
// Everything in this module is PURE apart from the four `load*` functions,
// which read through lib/scott/data/repository.js like the rest of the
// demonstration.

const repo = require('./data/repository');
const db = require('../../db/pool');

const DOMAINS = Object.freeze({
  messages: 'leads',
  email: 'leads',
  calendar: 'jobs_ops',
  customer: 'customers_contact',
  price: 'job_margin'
});

// ------------------------------------------------------------
// Dates
// ------------------------------------------------------------
//
// One helper, so every surface agrees on what "today" is. Taken as a
// parameter everywhere rather than read from the clock inside a formatter,
// which is what makes these testable without freezing time globally.

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Monday-first. A workshop's week does not start on Sunday.
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDay(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function relativeDay(date, now) {
  const a = new Date(isoDay(date));
  const b = new Date(isoDay(now));
  const days = Math.round((a - b) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days < 7) return a.toLocaleDateString('en-GB', { weekday: 'long' });
  return a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ------------------------------------------------------------
// EMAIL
// ------------------------------------------------------------
//
// A thread per enquiry. The customer's own message is the first mail in
// it; anything the company recorded against that enquiry afterwards
// (a routing note, a reply that was approved and sent) becomes the
// following mails, in order. So the mailbox is a reading of the activity
// trail rather than a parallel store, and it cannot drift from it.
//
// THERE IS NO SEND. Scott's connectors refuse external actions by
// construction (lib/scott/banking.js and the social layer both do the
// same thing for the same reason), and an email that actually left the
// building would be the demonstration performing a real-world act on a
// fictional company's behalf. Composing produces a draft that sits in the
// thread marked as a draft, which is also the honest demonstration: the
// approval queue is where a draft becomes a sent thing.

function addressFor(name, email) {
  if (email) return email;
  const slug = String(name || 'customer').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
  return `${slug || 'customer'}@example.invalid`;
}

// Turns one enquiry plus its activity rows into a thread. Pure.
function buildThread(enquiry, activityRows, now) {
  const mails = [{
    id: `e${enquiry.id}-0`,
    direction: 'in',
    from: enquiry.customer_name || 'Customer',
    address: addressFor(enquiry.customer_name, enquiry.customer_email),
    at: enquiry.created_at,
    when: relativeDay(enquiry.created_at, now),
    body: enquiry.message || ''
  }];

  (activityRows || [])
    .filter((a) => a.related_enquiry_id === enquiry.id)
    .forEach((a, i) => {
      mails.push({
        id: `e${enquiry.id}-${i + 1}`,
        direction: 'note',
        from: a.actor === 'system' ? 'Workspace' : a.actor,
        address: null,
        at: a.created_at,
        when: relativeDay(a.created_at, now),
        body: a.summary
      });
    });

  const last = mails[mails.length - 1];
  return {
    id: enquiry.id,
    subject: enquiry.subject || '(no subject)',
    correspondent: enquiry.customer_name || 'Customer',
    address: addressFor(enquiry.customer_name, enquiry.customer_email),
    channel: enquiry.channel,
    unread: enquiry.status === 'new',
    awaitingReply: enquiry.status === 'new' || enquiry.status === 'routed',
    at: last.at,
    when: last.when,
    preview: String(mails[0].body).slice(0, 140),
    mails
  };
}

async function loadMailbox({ canSee, now = new Date() } = {}) {
  if (typeof canSee !== 'function' || !canSee(DOMAINS.email)) {
    return { threads: [], withheld: true };
  }
  const [enquiries, activity] = await Promise.all([
    repo.getEnquiries({}),
    repo.getRecentActivity(200)
  ]);
  const threads = enquiries
    .map((e) => buildThread(e, activity, now))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  return { threads, withheld: false };
}

// ------------------------------------------------------------
// CALENDAR
// ------------------------------------------------------------
//
// Built from dates the jobs already carry: `promised_date` is when the
// customer was told it would be ready, `collection_date` is when it is
// going back. Two entry kinds, one row each, no invented appointments.
//
// The price is a separate domain from the job (job_margin, not jobs_ops),
// exactly as it is on the job card and in the worker's context, so a
// person who may see the diary does not learn what the work earns by
// looking at it sideways.

function buildEntries(jobs, { canSee, from, to }) {
  const showPrice = canSee(DOMAINS.price);
  const entries = [];
  (jobs || []).forEach((j) => {
    const add = (dateValue, kind, label) => {
      if (!dateValue) return;
      const day = isoDay(dateValue);
      if (day < isoDay(from) || day > isoDay(to)) return;
      entries.push({
        day,
        kind,
        label,
        ref: j.ref,
        customer: j.customer_name || 'Unknown customer',
        status: j.status,
        atRisk: !!j.at_risk,
        riskNote: j.at_risk ? j.risk_note : '',
        price: showPrice && j.price_pence != null ? `£${(j.price_pence / 100).toFixed(2)}` : null
      });
    };
    add(j.promised_date, 'promised', 'Promised ready');
    add(j.collection_date, 'collection', 'Back to customer');
  });
  return entries.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// The week as seven day buckets, always seven, so an empty Wednesday
// renders as an empty Wednesday rather than silently closing the gap and
// making the week look busier than it is.
function buildWeek(entries, weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const day = isoDay(date);
    return {
      day,
      name: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      number: date.getDate(),
      month: date.toLocaleDateString('en-GB', { month: 'short' }),
      entries: entries.filter((e) => e.day === day)
    };
  });
}

// OPENING ON A WEEK THAT HAS SOMETHING IN IT.
//
// The company's jobs carry fixed dates written into the seed, so "this
// week" is empty whenever the demonstration is run outside the few weeks
// they fall in — which is most of the time, and got worse every day after
// the seed was written. A diary whose first impression is seven empty
// boxes teaches a visitor that the feature does not work.
//
// The honest fix is to open where the work is rather than to move the
// work. Nothing here changes a date: it picks the starting WEEK, says so
// on the page, and the arrows still step week by week from there. An
// explicit ?w= always wins, so a visitor who has navigated is never
// yanked somewhere else.
function nearestBusyOffset(entries, now) {
  if (!entries.length) return 0;
  const thisWeek = startOfWeek(now);
  const offsets = entries.map((e) => Math.round((startOfWeek(new Date(e.day)) - thisWeek) / (7 * 86400000)));
  if (offsets.includes(0)) return 0;
  // Nearest in either direction; a tie goes forwards, because what is
  // coming matters more to a workshop than what has gone.
  return offsets.sort((a, b) => (Math.abs(a) - Math.abs(b)) || (b - a))[0];
}

async function loadCalendar({ canSee, now = new Date(), weekOffset = 0, explicitWeek = false } = {}) {
  if (typeof canSee !== 'function' || !canSee(DOMAINS.calendar)) {
    return { week: [], withheld: true, weekStart: null, weekOffset: 0 };
  }
  const jobs = await repo.getJobs({});
  let offset = Number.isInteger(weekOffset) ? Math.max(-8, Math.min(8, weekOffset)) : 0;
  let shifted = false;

  if (!explicitWeek && offset === 0) {
    // Measured over a wide window rather than the current week alone, so
    // the jump is to real work rather than to an arbitrary neighbour.
    const wide = buildEntries(jobs, { canSee, from: addDays(now, -120), to: addDays(now, 120) });
    const found = nearestBusyOffset(wide, now);
    if (found !== 0) { offset = Math.max(-8, Math.min(8, found)); shifted = true; }
  }

  const weekStart = addDays(startOfWeek(now), offset * 7);
  const weekEnd = addDays(weekStart, 6);
  const entries = buildEntries(jobs, { canSee, from: weekStart, to: weekEnd });
  return {
    week: buildWeek(entries, weekStart),
    weekStart: isoDay(weekStart),
    weekEnd: isoDay(weekEnd),
    weekOffset: offset,
    // True when the diary opened somewhere other than this week because
    // this week was empty. The page says so rather than quietly showing a
    // different week than the visitor expects.
    shifted,
    isThisWeek: offset === 0,
    todayKey: isoDay(now),
    withheld: false
  };
}

// ------------------------------------------------------------
// TASKS
// ------------------------------------------------------------
//
// The one surface here that stores anything of its own, because a task
// list you cannot tick is a picture of a task list. `scott_tasks` holds
// what a person has added or completed; it holds no customer, no figure
// and no clearance-bearing detail, only a line of text and a flag.
//
// It is SEEDED from work the company already has outstanding — enquiries
// nobody has answered, jobs sitting at a decision point — so a new
// database opens on a real list rather than an empty one, and every seeded
// line traces to a row somebody can go and look at.

async function ensureTaskTable() {
  // Created here rather than in db/schema.sql on purpose. This surface is
  // on an unmerged branch, and the release-ordering incident of 29/08/2026
  // (a column referencing a table created later in the file, invisible on
  // every database that already had history and fatal on the one that did
  // not) is a good enough reason to keep a new table out of the shared
  // schema until the feature is actually going somewhere. No foreign key,
  // for the same reason.
  await db.query(`
    CREATE TABLE IF NOT EXISTS scott_tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(300) NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      source VARCHAR(40) NOT NULL DEFAULT 'manual',
      source_ref VARCHAR(40) NOT NULL DEFAULT '',
      done BOOLEAN NOT NULL DEFAULT false,
      created_by VARCHAR(80) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      done_at TIMESTAMPTZ
    )`);
}

// Derives the opening list. Idempotent on `source_ref`, so running it
// again after somebody has ticked something does not resurrect it.
async function seedTasksFromWork() {
  await ensureTaskTable();
  const { rows: existing } = await db.query('SELECT source_ref FROM scott_tasks WHERE source_ref <> $1', ['']);
  const have = new Set(existing.map((r) => r.source_ref));

  const [enquiries, jobs] = await Promise.all([repo.getEnquiries({}), repo.getJobs({})]);
  const wanted = [];

  enquiries.filter((e) => e.status === 'new').forEach((e) => {
    wanted.push({
      ref: `enquiry:${e.id}`,
      title: `Reply to ${e.customer_name || 'the enquiry'}`,
      detail: e.subject || '',
      source: 'enquiry'
    });
  });

  jobs.filter((j) => j.at_risk).forEach((j) => {
    wanted.push({
      ref: `job:${j.ref}`,
      title: `Sort out ${j.ref}`,
      detail: j.risk_note || 'Flagged at risk.',
      source: 'job'
    });
  });

  const fresh = wanted.filter((w) => !have.has(w.ref));
  for (const w of fresh) {
    await db.query(
      'INSERT INTO scott_tasks (title, detail, source, source_ref, created_by) VALUES ($1, $2, $3, $4, $5)',
      [w.title, w.detail, w.source, w.ref, 'workspace']
    );
  }
  return fresh.length;
}

async function loadTasks() {
  await ensureTaskTable();
  const { rows } = await db.query(
    'SELECT id, title, detail, source, source_ref, done, created_by, created_at, done_at FROM scott_tasks ORDER BY done ASC, created_at DESC LIMIT 100'
  );
  return {
    open: rows.filter((r) => !r.done),
    done: rows.filter((r) => r.done).slice(0, 12)
  };
}

async function addTask({ title, detail, createdBy }) {
  await ensureTaskTable();
  const clean = String(title || '').trim().slice(0, 300);
  if (!clean) return null;
  const { rows } = await db.query(
    'INSERT INTO scott_tasks (title, detail, source, created_by) VALUES ($1, $2, $3, $4) RETURNING id, title, done',
    [clean, String(detail || '').trim().slice(0, 2000), 'manual', String(createdBy || '').slice(0, 80)]
  );
  return rows[0];
}

async function setTaskDone(id, done) {
  await ensureTaskTable();
  const { rows } = await db.query(
    'UPDATE scott_tasks SET done = $2, done_at = CASE WHEN $2 THEN NOW() ELSE NULL END WHERE id = $1 RETURNING id, title, done',
    [id, !!done]
  );
  return rows[0] || null;
}

// ------------------------------------------------------------
// MESSAGES
// ------------------------------------------------------------
//
// Not a new store and not a new page: Messages is the enquiries surface
// under the name a sole owner would actually use for it. What this adds is
// the calm summary the Level 1 workspace opens on.

async function loadMessageSummary({ canSee, now = new Date() } = {}) {
  if (typeof canSee !== 'function' || !canSee(DOMAINS.messages)) {
    return { total: 0, unanswered: 0, latest: [], withheld: true };
  }
  const enquiries = await repo.getEnquiries({});
  return {
    total: enquiries.length,
    unanswered: enquiries.filter((e) => e.status === 'new').length,
    latest: enquiries.slice(0, 5).map((e) => ({
      id: e.id,
      from: e.customer_name || 'Customer',
      subject: e.subject || '(no subject)',
      channel: e.channel,
      isNew: e.status === 'new',
      when: relativeDay(e.created_at, now)
    })),
    withheld: false
  };
}

module.exports = {
  DOMAINS,
  // dates
  startOfWeek,
  addDays,
  isoDay,
  relativeDay,
  // email
  addressFor,
  buildThread,
  loadMailbox,
  // calendar
  buildEntries,
  buildWeek,
  loadCalendar,
  // tasks
  ensureTaskTable,
  seedTasksFromWork,
  loadTasks,
  addTask,
  setTaskDone,
  // messages
  loadMessageSummary
};
