'use strict';

// Visits by a watched guest: when they came, what they did, how long they
// stayed. Tom, 19/10/2026, about Dan of A2B Transport: "I need an email the
// moment he logs on and it would be handy to know what he's done on the site
// and how long he's played around".
//
// Who is watched: the same list as the login alert
// (SCOTT_LOGIN_ALERT_USERNAMES, lib/scott/gapNotifier.js). Nobody else is
// recorded, Tom's own logins included.
//
// A visit opens on the first thing a watched guest does (a login, or a page
// in the Tidewell office or the Scott demonstration on a session that was
// already signed in) and closes when they sign out or have done nothing for
// QUIET_MINUTES. Tom gets one email when a visit opens (the login alert
// does it for a login; noteStart does it for a guest who was already signed
// in) and one summary when it closes. Pages that poll on their own
// (inbox/live.json, inbox/reading.json) are not activity and never keep a
// visit open.
//
// Kept in guest_visits so a deploy does not lose a visit in progress, and
// the summary is claimed by one process before it is sent, because a push
// here starts two or three deployments at once. Visits are deleted after
// KEEP_DAYS.

const QUIET_MINUTES = 20;
const MAX_EVENTS = 400;
const KEEP_DAYS = 90;
const SWEEP_MS = 2 * 60 * 1000;

function defaultDb() {
  return require('../db/pool');
}

function notifier() {
  return require('./scott/gapNotifier');
}

function isWatched(username) {
  return notifier().shouldAlertOnLogin(username);
}

const clip = (v, n) => {
  const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trim()}...` : t;
};

// "Paul Gregory <paul@example.com>" -> "Paul Gregory"; a bare address stays.
function nameOf(from) {
  const f = String(from || '').trim();
  const m = /^"?([^"<]+?)"?\s*<[^>]+>$/.exec(f);
  return m ? m[1].trim() : f;
}

// Record one thing a watched guest did. Opens a visit when none is open, in
// one transaction under a per-guest advisory lock, so two requests at the
// same moment cannot open two visits. Returns { opened, visitId }.
async function note({ username, kind, text, alerted = false, at = new Date() }, db = defaultDb()) {
  const who = String(username || '').trim().toLowerCase();
  if (!who) return { opened: false, visitId: null };
  const event = JSON.stringify([{ at: at.toISOString(), kind: String(kind || 'page'), text: clip(text, 600) }]);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('guest_visit:' || $1))", [who]);
    const open = await client.query(
      `SELECT id FROM guest_visits
        WHERE username = $1 AND ended_at IS NULL AND summary_claimed_at IS NULL
          AND last_seen_at > $2::timestamptz - ($3 || ' minutes')::interval
        ORDER BY id DESC LIMIT 1`,
      [who, at.toISOString(), QUIET_MINUTES]
    );
    let visitId;
    let opened = false;
    if (open.rows.length) {
      visitId = open.rows[0].id;
      await client.query(
        `UPDATE guest_visits
            SET last_seen_at = GREATEST(last_seen_at, $2::timestamptz),
                events = CASE WHEN jsonb_array_length(events) < $4 THEN events || $3::jsonb ELSE events END
          WHERE id = $1`,
        [visitId, at.toISOString(), event, MAX_EVENTS]
      );
    } else {
      const ins = await client.query(
        `INSERT INTO guest_visits (username, started_at, last_seen_at, events, start_alerted)
         VALUES ($1, $2, $2, $3::jsonb, $4) RETURNING id`,
        [who, at.toISOString(), event, alerted]
      );
      visitId = ins.rows[0].id;
      opened = true;
    }
    await client.query('COMMIT');
    return { opened, visitId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// A page or action by a guest who may already have been signed in. When it
// opens a visit (no login came first), Tom is told they are in.
async function noteActivity({ username, kind, text, place }, db = defaultDb(), send = sendStartNotice) {
  if (!isWatched(username)) return { recorded: false };
  const r = await note({ username, kind, text }, db);
  if (r.opened) {
    const sent = await send({ username, text, place, when: new Date() });
    if (sent && sent.sent) await db.query('UPDATE guest_visits SET start_alerted = TRUE WHERE id = $1', [r.visitId]);
    else if (sent) console.warn(`Guest visit start notice for ${username} not sent: ${sent.reason}`);
  }
  return { recorded: true, ...r };
}

// Signing out closes the visit now, so the summary goes straight away.
async function noteSignOut(username, db = defaultDb()) {
  if (!isWatched(username)) return null;
  const r = await note({ username, kind: 'logout', text: 'Signed out' }, db);
  await db.query('UPDATE guest_visits SET ended_at = last_seen_at WHERE id = $1 AND ended_at IS NULL', [r.visitId]);
  return r;
}

const ukTime = (d) => new Date(d).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const ukDay = (d) => new Date(d).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' });

function lengthOf(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'under a minute';
  if (mins === 1) return 'about a minute';
  if (mins < 60) return `about ${mins} minutes`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `about ${h} hour${h === 1 ? '' : 's'}${m ? ` ${m} minute${m === 1 ? '' : 's'}` : ''}`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The email Tom gets when a visit closes. Plain text, UK time, no dashes.
function summarise(visit) {
  const events = Array.isArray(visit.events) ? visit.events : [];
  const start = new Date(visit.started_at);
  const last = new Date(visit.last_seen_at);
  const who = visit.username;
  const count = (k) => events.filter((e) => e.kind === k).length;
  // An email opened again after acting on it is still one email.
  const opened = new Set(events.filter((e) => e.kind === 'open_email').map((e) => e.text)).size;
  const did = [
    opened && plural(opened, 'email opened', 'emails opened'),
    count('own_email') && plural(count('own_email'), 'email sent in to try the office', 'emails sent in to try the office'),
    count('signoff') && plural(count('signoff'), 'booking signed off into dispatch', 'bookings signed off into dispatch'),
    count('guide') && plural(count('guide'), 'note to guide the AI', 'notes to guide the AI'),
    count('mark_sent') && plural(count('mark_sent'), 'reply marked as sent', 'replies marked as sent')
  ].filter(Boolean);
  // Consecutive repeats of the same page read as one line with a count.
  const lines = [];
  for (const e of events) {
    const prev = lines[lines.length - 1];
    if (prev && prev.text === e.text && e.kind === 'page') { prev.n += 1; continue; }
    lines.push({ at: e.at, text: e.text, n: 1, kind: e.kind });
  }
  const ended = visit.ended_at && events.some((e) => e.kind === 'logout')
    ? `${who} signed out at the end.`
    : `Nothing has come from ${who} for ${QUIET_MINUTES} minutes since then, so the visit is counted as over. Time spent reading the last page is not included.`;
  const text = [
    `${who} was in from ${ukTime(start)} to ${ukTime(last)} on ${ukDay(start)} (UK time), ${lengthOf(last - start)} from the first page to the last.`,
    ended,
    '',
    did.length ? `In short: ${did.join(', ')}.` : 'In short: looked round without doing anything in the office.',
    '',
    `What ${who} did, in order:`,
    ...lines.map((l) => `${ukTime(l.at)}  ${l.text}${l.n > 1 ? ` (${l.n} times)` : ''}`),
    ...(events.length >= MAX_EVENTS ? ['', `Only the first ${MAX_EVENTS} things he did are listed.`] : []),
    '',
    `This is a notification only. Nothing has been sent to ${who}.`
  ].join('\n');
  return { subject: `${who}'s visit: ${lengthOf(last - start)}`, text };
}

function startNotice({ username, text, place, when = new Date() }) {
  const stamp = when.toLocaleString('en-GB', { timeZone: 'Europe/London' });
  return {
    subject: `${username} is in ${place || 'the demonstration'} now`,
    text: [
      `${username} opened ${place || 'the demonstration'} at ${stamp} (UK time), already signed in, so there was no login.`,
      `First thing opened: ${text}.`,
      '',
      `You will get a summary of the visit after ${username} signs out or has been quiet for ${QUIET_MINUTES} minutes.`
    ].join('\n')
  };
}

function sendStartNotice(args) {
  return notifier().sendNotice(startNotice(args));
}

// Closes every visit that is over and sends its summary, once. Claimed in
// the database first, so racing deployments cannot send two. A failed send
// is recorded on the row and not retried, rather than risk a stream of
// copies; the visit is still in the table.
async function sweep(db = defaultDb(), { now = new Date(), send = (m) => notifier().sendNotice(m) } = {}) {
  const due = await db.query(
    `UPDATE guest_visits
        SET summary_claimed_at = $1::timestamptz, ended_at = COALESCE(ended_at, last_seen_at)
      WHERE summary_claimed_at IS NULL
        AND (ended_at IS NOT NULL OR last_seen_at <= $1::timestamptz - ($2 || ' minutes')::interval)
      RETURNING *`,
    [now.toISOString(), QUIET_MINUTES]
  );
  const results = [];
  for (const visit of due.rows) {
    const msg = summarise(visit);
    let r;
    try { r = await send(msg); } catch (err) { r = { sent: false, reason: err.message }; }
    if (r && r.sent) await db.query('UPDATE guest_visits SET summary_sent_at = NOW() WHERE id = $1', [visit.id]);
    else await db.query('UPDATE guest_visits SET summary_error = $2 WHERE id = $1', [visit.id, clip(r && r.reason, 300)]);
    console.log(`Guest visit ${visit.id} (${visit.username}): ${msg.subject}; summary ${r && r.sent ? 'emailed' : `NOT emailed (${r && r.reason})`}`);
    results.push({ id: visit.id, sent: Boolean(r && r.sent) });
  }
  await db.query(`DELETE FROM guest_visits WHERE started_at < NOW() - ($1 || ' days')::interval`, [KEEP_DAYS]);
  return results;
}

function startSweeping(db = defaultDb()) {
  const run = () => sweep(db).catch((err) => console.error('Guest visit sweep failed:', err.message));
  setTimeout(run, 30 * 1000).unref();
  setInterval(run, SWEEP_MS).unref();
}

function describeGuestVisits() {
  const names = notifier().loginAlertUsernames();
  if (!names.length) return 'Guest visits: none watched (SCOTT_LOGIN_ALERT_USERNAMES is empty)';
  return `Guest visits: recorded for ${names.join(', ')}; a summary is emailed after sign out or ${QUIET_MINUTES} minutes quiet; kept ${KEEP_DAYS} days`;
}

module.exports = {
  QUIET_MINUTES, MAX_EVENTS, KEEP_DAYS,
  isWatched, nameOf, clip, note, noteActivity, noteSignOut, summarise, lengthOf, sweep, startSweeping, describeGuestVisits, sendStartNotice, startNotice
};
