'use strict';

// Tom, 19/10/2026, about Dan of A2B Transport: "I need an email the moment
// he logs on and it would be handy to know what he's done on the site and
// how long he's played around". A watched guest's visit is recorded
// (lib/guestVisits.js) and Tom gets an email when it starts and a summary
// when it ends. The database half needs DATABASE_URL (set DATABASE_URL to a
// throwaway database to run it); it creates only the guest_visits table.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const gv = require('../lib/guestVisits');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const T0 = new Date('2026-10-19T19:15:00Z');
const at = (mins) => new Date(T0.getTime() + mins * 60000).toISOString();

test('the summary says how long, what was done in order, and names the guest without a pronoun', () => {
  const visit = {
    username: 'dan', started_at: at(0), last_seen_at: at(27), ended_at: at(27),
    events: [
      { at: at(0), kind: 'login', text: 'Logged in, heading for the Tidewell taxi office' },
      { at: at(1), kind: 'page', text: 'Today' },
      { at: at(2), kind: 'page', text: 'Inbox' },
      { at: at(2), kind: 'page', text: 'Inbox' },
      { at: at(4), kind: 'open_email', text: 'Opened the email from Paul Gregory ("Airport run, account")' },
      { at: at(9), kind: 'signoff', text: 'Signed off and put the booking into dispatch: the email from Paul Gregory ("Airport run, account")' },
      { at: at(9), kind: 'open_email', text: 'Opened the email from Paul Gregory ("Airport run, account")' },
      { at: at(15), kind: 'guide', text: 'Guided the AI on the reply to the email from Ruth Daniels ("Late"): "Refund her fare"' },
      { at: at(27), kind: 'logout', text: 'Signed out' }
    ]
  };
  const { subject, text } = gv.summarise(visit);
  assert.equal(subject, "dan's visit: about 27 minutes");
  assert.match(text, /^dan was in from 20:15 to 20:42 on Monday 19 October \(UK time\), about 27 minutes from the first page to the last\./);
  assert.match(text, /dan signed out at the end\./);
  assert.match(text, /In short: 1 email opened, 1 booking signed off into dispatch, 1 note to guide the AI\./);
  assert.match(text, /20:17  Inbox \(2 times\)/);
  assert.match(text, /20:30  Guided the AI on the reply .*"Refund her fare"/);
  assert.doesNotMatch(text, /\b(he|him|his|she)\b/i, 'no assumed pronouns ("her" appears only in what was typed)');
  assert.doesNotMatch(text, /[–—]|--/);
});

test('a visit that simply went quiet says so, and one with nothing done says that too', () => {
  const { text } = gv.summarise({ username: 'dan', started_at: at(0), last_seen_at: at(0.2), ended_at: null, events: [{ at: at(0), kind: 'page', text: 'Today' }] });
  assert.match(text, /under a minute/);
  assert.match(text, /Nothing has come from dan for 20 minutes since then/);
  assert.match(text, /In short: looked round without doing anything in the office\./);
  assert.equal(gv.lengthOf(95 * 60000), 'about 1 hour 35 minutes');
  assert.equal(gv.nameOf('Paul Gregory <paul@estuaryjoinery.example.com>'), 'Paul Gregory');
  assert.equal(gv.nameOf('dan+abc@gmail.com'), 'dan+abc@gmail.com');
});

test('the "is in now" email says where, when, and that a summary follows', () => {
  const { subject, text } = gv.startNotice({ username: 'dan', text: 'Today', place: 'the Tidewell taxi office', when: T0 });
  assert.equal(subject, 'dan is in the Tidewell taxi office now');
  assert.match(text, /^dan opened the Tidewell taxi office at 19\/10\/2026, 20:15:00 \(UK time\), already signed in, so there was no login\./);
  assert.match(text, /First thing opened: Today\./);
  assert.match(text, /summary of the visit after dan signs out or has been quiet for 20 minutes/);
  assert.doesNotMatch(text, /[–—]|--/);
});

test('Dan is watched by default, nobody else new is, and the boot log says what is recorded', () => {
  const saved = process.env.SCOTT_LOGIN_ALERT_USERNAMES;
  delete process.env.SCOTT_LOGIN_ALERT_USERNAMES;
  try {
    assert.ok(gv.isWatched('dan') && gv.isWatched('Dan'));
    assert.ok(gv.isWatched('will') && gv.isWatched('marc'));
    assert.ok(!gv.isWatched('tom') && !gv.isWatched('nat'));
    assert.match(gv.describeGuestVisits(), /recorded for will, marc, dan; a summary is emailed after sign out or 20 minutes quiet; kept 90 days/);
  } finally {
    if (saved !== undefined) process.env.SCOTT_LOGIN_ALERT_USERNAMES = saved;
  }
});

test('office actions read as plain sentences, with what was typed', () => {
  const { activityFor, BASE } = require('../routes/taxiOffice');
  const office = require('../lib/taxiOffice/office');
  const sid = `gv-${Date.now()}`;
  const s = office.stateFor(sid);
  const req = (method, route, params = {}, body = {}, query = {}) => ({ method, route: { path: BASE + route }, params, body, query, path: BASE + route });
  assert.deepEqual(activityFor(req('GET', '/'), s), { kind: 'page', text: 'Today' });
  assert.equal(activityFor(req('GET', '/inbox', {}, {}, { show: 'todo' }), s).text, 'Inbox (filtered)');
  assert.equal(activityFor(req('GET', '/inbox/:id', { id: 'gregory' }), s).text, 'Opened the email from Paul Gregory ("Airport run, account")');
  assert.equal(activityFor(req('POST', '/inbox/:id/fix', { id: 'gregory' }, { signoff: 'yes' }), s).kind, 'signoff');
  assert.match(activityFor(req('POST', '/inbox/:id/fix', { id: 'gregory' }, {}), s).text, /without ticking the sign-off/);
  assert.match(activityFor(req('POST', '/inbox/:id/guide', { id: 'daniels' }, { guidance: 'It was Dave. Refund her fare.' }), s).text, /Ruth Daniels.*"It was Dave\. Refund her fare\."/);
  assert.match(activityFor(req('POST', '/inbox/new', {}, { subject: 'Taxi Friday', body: 'Two of us to the airport' }), s).text, /"Taxi Friday: Two of us to the airport"/);
  assert.equal(activityFor(req('GET', '/licensing/fleet.csv'), s).text, 'Downloaded the fleet spreadsheet');
  assert.equal(activityFor(req('GET', '/connect/gmail'), s), null, "the connection pages (Tom's own) are not activity");
  office.reset(sid);
});

test('every office page and action is tracked; the polling routes are not', () => {
  const src = read('routes/taxiOffice.js');
  assert.match(src, /const page = \(path, handler\) => app\.get\(BASE \+ path, noindex, requireOfficeAccess, track, settle, VIEW\(handler\)\);/);
  assert.match(src, /const post = \(path, handler\) => app\.post\(BASE \+ path, noindex, requireOfficeAccess, track, VIEW\(handler\)\);/);
  assert.match(src, /app\.get\(BASE \+ '\/licensing\/fleet\.csv', noindex, requireOfficeAccess, track,/);
  assert.match(src, /app\.get\(BASE \+ '\/inbox\/live\.json', noindex, requireOfficeAccess, VIEW/);
  assert.match(src, /app\.get\(BASE \+ '\/inbox\/reading\.json', noindex, requireOfficeAccess, \(req/);
  const auth = read('routes/auth.js');
  assert.match(auth, /guestVisits\.note\(\{ username: user\.username, kind: 'login'/);
  assert.match(auth, /guestVisits\.noteSignOut\(username\)\s*\.then\(\(\) => guestVisits\.sweep\(\)\)/);
  assert.match(read('server.js'), /guestVisits\.startSweeping\(\);/);
  // The privacy page says it, with the same keeping period as the code.
  const privacy = read('views/privacy.ejs');
  assert.match(privacy, /<h2 id="demonstration-logins">If we give you a demonstration login<\/h2>/);
  // No period on the page (privacyIntroductions.test.js guards that); the
  // deletion it promises is the sweep's KEEP_DAYS.
  assert.match(privacy, /These records are deleted automatically, and if you would like yours deleted now, tell us and we will\./);
  assert.match(read('lib/guestVisits.js'), /DELETE FROM guest_visits WHERE started_at < NOW\(\)/);
});

// ---- Against a real database ------------------------------------------------

const DB_URL = process.env.DATABASE_URL;

async function withDb(fn) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB_URL });
  const db = { pool, query: (t, p) => pool.query(t, p) };
  const ddl = read('db/schema.sql').match(/CREATE TABLE IF NOT EXISTS guest_visits[\s\S]*?;\nCREATE INDEX IF NOT EXISTS idx_guest_visits_open[^;]*;/)[0];
  await db.query(ddl);
  await db.query("DELETE FROM guest_visits WHERE username LIKE 'gvtest%'");
  try { return await fn(db); } finally {
    await db.query("DELETE FROM guest_visits WHERE username LIKE 'gvtest%'");
    await pool.end();
  }
}

test('one visit per spell of activity, even when requests arrive together', { skip: DB_URL ? false : 'set DATABASE_URL to a throwaway database' }, async () => {
  await withDb(async (db) => {
    const u = `gvtest${Date.now()}`;
    // A cold pool opens its connections one by one, which serialises the
    // race by accident and hides a missing lock (CLAUDE.md, finding K2).
    // Warm it first, then race several times.
    await Promise.all(Array.from({ length: 8 }, () => db.query('SELECT 1')));
    for (let round = 0; round < 5; round += 1) {
      const who = `${u}r${round}`;
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => gv.note({ username: who, kind: 'page', text: `Page ${i}`, at: new Date(at(1)) }, db)));
      assert.equal(results.filter((r) => r.opened).length, 1, `round ${round}: exactly one request opens the visit`);
    }
    await Promise.all(Array.from({ length: 8 }, (_, i) => gv.note({ username: u, kind: 'page', text: `Page ${i}`, at: new Date(at(1)) }, db)));
    const later = await gv.note({ username: u, kind: 'page', text: 'Later', at: new Date(at(15)) }, db);
    assert.equal(later.opened, false, '14 minutes later is the same visit');
    const next = await gv.note({ username: u, kind: 'page', text: 'Next day', at: new Date(at(60)) }, db);
    assert.equal(next.opened, true, 'after 20 quiet minutes it is a new visit');
    const { rows } = await db.query('SELECT jsonb_array_length(events) AS n FROM guest_visits WHERE username = $1 ORDER BY id', [u]);
    assert.deepEqual(rows.map((r) => Number(r.n)), [9, 1]);
  });
});

test('the summary goes once, after the quiet period or a sign out, however many sweeps race', { skip: DB_URL ? false : 'set DATABASE_URL to a throwaway database' }, async () => {
  await withDb(async (db) => {
    const u = `gvtest${Date.now()}b`;
    await gv.note({ username: u, kind: 'login', text: 'Logged in', alerted: true, at: new Date(at(0)) }, db);
    await gv.note({ username: u, kind: 'page', text: 'Today', at: new Date(at(3)) }, db);
    const sent = [];
    const send = async (m) => { sent.push(m); return { sent: true }; };
    // Not yet: only 10 minutes after the last thing.
    await gv.sweep(db, { now: new Date(at(13)), send });
    assert.equal(sent.filter((m) => m.subject.startsWith(u)).length, 0);
    // Quiet for 20 minutes: three racing sweeps send one summary.
    await Promise.all([1, 2, 3].map(() => gv.sweep(db, { now: new Date(at(24)), send })));
    const mine = sent.filter((m) => m.subject.startsWith(u));
    assert.equal(mine.length, 1);
    assert.match(mine[0].text, /from 20:15 to 20:18/);
    const { rows } = await db.query('SELECT summary_sent_at, ended_at FROM guest_visits WHERE username = $1', [u]);
    assert.ok(rows[0].summary_sent_at && rows[0].ended_at);
    // A sign out closes the visit at once.
    const w = `${u}c`;
    await gv.note({ username: w, kind: 'page', text: 'Today', at: new Date() }, db);
    await db.query("UPDATE guest_visits SET ended_at = last_seen_at WHERE username = $1", [w]);
    await gv.sweep(db, { send });
    assert.equal(sent.filter((m) => m.subject.startsWith(w)).length, 1);
  });
});

test('a guest already signed in gets an "is in now" email on the first page, and not after a login', { skip: DB_URL ? false : 'set DATABASE_URL to a throwaway database' }, async () => {
  await withDb(async (db) => {
    const saved = process.env.SCOTT_LOGIN_ALERT_USERNAMES;
    const u = `gvtest${Date.now()}d`;
    process.env.SCOTT_LOGIN_ALERT_USERNAMES = `${u},${u}x`;
    try {
      const notices = [];
      const send = async (m) => { notices.push(m); return { sent: true }; };
      await gv.noteActivity({ username: u, kind: 'page', text: 'Today', place: 'the Tidewell taxi office' }, db, send);
      await gv.noteActivity({ username: u, kind: 'page', text: 'Inbox', place: 'the Tidewell taxi office' }, db, send);
      assert.equal(notices.length, 1, 'one email when the visit starts, none for the next page');
      const { rows } = await db.query('SELECT start_alerted FROM guest_visits WHERE username = $1', [u]);
      assert.equal(rows[0].start_alerted, true);
      await gv.note({ username: `${u}x`, kind: 'login', text: 'Logged in', alerted: true }, db);
      await gv.noteActivity({ username: `${u}x`, kind: 'page', text: 'Today', place: 'the Tidewell taxi office' }, db, send);
      assert.equal(notices.length, 1, 'the login alert already told Tom');
    } finally {
      if (saved === undefined) delete process.env.SCOTT_LOGIN_ALERT_USERNAMES; else process.env.SCOTT_LOGIN_ALERT_USERNAMES = saved;
    }
  });
});
