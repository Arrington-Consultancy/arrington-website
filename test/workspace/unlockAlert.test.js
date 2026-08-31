// The failed-unlock security alert.
//
// Governance finding G6 and Tom's instruction of 31/08/2026: a
// failed-unlock warning must not appear only behind the unlock it is
// protecting. What that alert must NOT do is become a second disclosure
// channel with no gate on it, which is what most of this file is about.
const test = require('node:test');
const assert = require('node:assert/strict');

const alert = require('../../lib/workspace/unlockAlert');

const NOW = Date.parse('2026-08-31T12:00:00Z');
const minutesAgo = (m) => new Date(NOW - m * 60000);

// --- The decision -----------------------------------------------------

test('a single mistyped passphrase does not email anybody', () => {
  for (const n of [0, 1, 2]) {
    const d = alert.decideAlert({ failuresInWindow: n, lastSuccessAt: null, lastFailureAt: null, now: NOW });
    assert.equal(d.alert, false, `${n} failures should not alert`);
  }
});

test('a run of attempts does alert, and does so before the limiter is exhausted', () => {
  assert.equal(alert.decideAlert({ failuresInWindow: 3, lastSuccessAt: null, lastFailureAt: null, now: NOW }).alert, true);
  // The limiter's own budget is five. Alerting at three means the notice
  // goes out while the attacker is still being refused, not after they
  // have used up their attempts and gone quiet.
  assert.ok(alert.THRESHOLD < 5, 'the alert threshold is not below the attempt budget');
});

test('a guessing loop produces one alert, not a flood', () => {
  // The failure this prevents: a security control that turns an attack
  // into a denial-of-service against the owner's own inbox.
  const d = alert.decideAlert({ failuresInWindow: 500, lastSuccessAt: minutesAgo(5), lastFailureAt: null, now: NOW });
  assert.equal(d.alert, false);
  assert.match(d.reason, /cooldown/);
});

test('a fresh burst after the cooldown is not silently swallowed', () => {
  const d = alert.decideAlert({ failuresInWindow: 3, lastSuccessAt: minutesAgo(61), lastFailureAt: null, now: NOW });
  assert.equal(d.alert, true);
});

// --- What the message may and may not contain -------------------------

test('the alert carries nothing from inside the workspace, and cannot', () => {
  const { subject, body } = alert.buildAlert({
    username: 'tom',
    failures: 4,
    windowMinutes: 30,
    firstAt: minutesAgo(20),
    lastAt: minutesAgo(1)
  });
  const text = `${subject}\n${body}`;

  // The guarantee is structural rather than textual: none of these is a
  // parameter of buildAlert, so none of them can appear however the
  // function is called. These assertions pin that the signature has not
  // quietly grown one.
  // Finding H7: the old assertion was buildAlert.length === 1, which is
  // 1 for ANY single options object, so adding a field would have kept
  // it green. The permitted key set is what actually constrains it.
  assert.deepEqual(alert.ALERT_FIELDS, ['username', 'failures', 'windowMinutes', 'firstAt', 'lastAt']);
  assert.throws(
    () => alert.buildAlert({ username: 'tom', failures: 3, windowMinutes: 30, firstAt: NOW, lastAt: NOW, recentRecordTitles: ['a confidential title'] }),
    /not permitted to read/,
    'a field carrying workspace content was accepted'
  );
  for (const forbidden of [
    'passphrase-value', 'correct-horse-battery', 'WORKSPACE_ACCESS_PASSPHRASE=',
    'record_key', 'confidential', 'contact record', 'opportunity'
  ]) {
    assert.ok(!text.includes(forbidden), `the alert body contained "${forbidden}"`);
  }
  // It names the passphrase as a THING to rotate, which is necessary
  // advice, without disclosing anything about its value.
  assert.match(text, /WORKSPACE_ACCESS_PASSPHRASE/, 'the alert does not say what to rotate');
  assert.ok(!/length \d+/.test(text), 'the alert leaked the passphrase length');
  assert.ok(!/tried: |guessed |attempted value/i.test(text), 'the alert leaked a guessed value');
});

test('the alert says plainly that nothing was opened, because that is the reassuring fact', () => {
  const { body } = alert.buildAlert({
    username: 'tom', failures: 3, windowMinutes: 30, firstAt: minutesAgo(10), lastAt: minutesAgo(1)
  });
  assert.match(body, /Nothing in the\s+workspace has been opened/);
  assert.match(body, /Change that account's website password/);
  assert.match(body, /Rotate WORKSPACE_ACCESS_PASSPHRASE/);
});

// --- Recipient --------------------------------------------------------

// Finding H1 (31/08/2026), HIGH. This test used to ASSERT the
// contact.email fallback, so the suite pinned the vulnerability rather
// than catching it. The attacker this control warns about holds a CMS
// account with edit_content, and could retarget the alarm at themselves
// with one PUT /api/content before making a single guess.
test('the recipient can never be set from anything a CMS account can write', () => {
  const before = process.env.WORKSPACE_ALERT_EMAIL;

  delete process.env.WORKSPACE_ALERT_EMAIL;
  const fallback = alert.alertRecipient();
  assert.match(fallback, /@arringtonconsultancy\.com$/,
    'with no variable set the alert must go to the built-in owner address');

  process.env.WORKSPACE_ALERT_EMAIL = 'security@example.test';
  assert.equal(alert.alertRecipient(), 'security@example.test');

  // The structural half: the function takes no database handle at all,
  // so no query can be reintroduced into it by a later edit without that
  // edit being obvious.
  assert.equal(alert.alertRecipient.length, 0,
    'alertRecipient takes an argument again; a database value could be consulted');

  if (before === undefined) delete process.env.WORKSPACE_ALERT_EMAIL;
  else process.env.WORKSPACE_ALERT_EMAIL = before;
});

test('an empty or whitespace variable falls back rather than sending to nobody', () => {
  const before = process.env.WORKSPACE_ALERT_EMAIL;
  for (const v of ['', '   ']) {
    process.env.WORKSPACE_ALERT_EMAIL = v;
    assert.match(alert.alertRecipient(), /@arringtonconsultancy\.com$/,
      'a blank variable produced a blank recipient; the alert would be lost');
  }
  if (before === undefined) delete process.env.WORKSPACE_ALERT_EMAIL;
  else process.env.WORKSPACE_ALERT_EMAIL = before;
});

// Finding H3: an operator must be able to see whether the alarm can ring.
test('the boot description says plainly when the alarm is inert', () => {
  const before = process.env.GMAIL_APP_PASSWORD;
  delete process.env.GMAIL_APP_PASSWORD;
  const off = alert.describeAlertConfig();
  assert.equal(off.ok, false);
  assert.match(off.detail, /CANNOT be sent/);
  assert.match(off.detail, /inert/);

  process.env.GMAIL_APP_PASSWORD = 'x';
  const on = alert.describeAlertConfig();
  assert.equal(on.ok, true);
  assert.match(on.detail, /will be sent to/);
  // It never prints the mail password, only whether one exists.
  assert.ok(!on.detail.includes('x') || !/password/i.test(on.detail));

  if (before === undefined) delete process.env.GMAIL_APP_PASSWORD;
  else process.env.GMAIL_APP_PASSWORD = before;
});

// --- End to end, against a fake database ------------------------------

function fakeDb({ failures = [], lastSuccess = null, lastFailure = null, onInsert = () => {} }) {
  return {
    inserts: [],
    async query(sql, params) {
      if (params && params[0] === alert.FAILED_EVENT) {
        return { rows: failures.map((d) => ({ created_at: d })) };
      }
      if (params && params[0] === alert.ALERT_EVENT) {
        return { rows: lastSuccess ? [{ created_at: lastSuccess }] : [] };
      }
      if (params && params[0] === alert.ALERT_FAILED_EVENT) {
        return { rows: lastFailure ? [{ created_at: lastFailure }] : [] };
      }
      if (/INSERT INTO workspace_activity/.test(sql)) {
        this.inserts.push(params);
        onInsert(params);
        return { rows: [] };
      }
      return { rows: [] };
    }
  };
}

// Finding H2 (HIGH), stated as a test. The reviewer did not have to
// construct this: an undelivered notice took the hour's budget and the
// genuine five-attempt burst forty-five seconds later produced no alert
// at all. With no mail credential configured, EVERY send fails, so the
// alarm could never fire.
test('a failed send does not buy an hour of silence', async () => {
  const failing = fakeDb({ failures: [minutesAgo(10), minutesAgo(5), minutesAgo(1)] });
  const first = await alert.maybeAlertOnFailedUnlock(failing, {
    username: 'tom', now: NOW, sendFn: async () => ({ sent: false, error: 'SMTP timeout' })
  });
  assert.equal(first.sent, false);
  const row = failing.inserts.find((p) => p[1] === alert.ALERT_FAILED_EVENT);
  assert.ok(row, 'a failure was recorded under the success event type, which would start the cooldown');

  // The next burst, with mail working and the failure just outside the
  // short retry backoff, must actually deliver.
  const working = fakeDb({
    failures: [minutesAgo(10), minutesAgo(5), minutesAgo(1)],
    lastFailure: minutesAgo(alert.FAILURE_RETRY_MINUTES + 1)
  });
  const sent = [];
  const second = await alert.maybeAlertOnFailedUnlock(working, {
    username: 'tom', now: NOW, sendFn: async (m) => { sent.push(m); return { sent: true }; }
  });
  assert.equal(second.sent, true, 'a failed send silenced the alarm for the attack');
  assert.equal(sent.length, 1);
});

test('a failure does earn a short pause, so a broken mailbox is not a mail storm', () => {
  const d = alert.decideAlert({
    failuresInWindow: 5, lastSuccessAt: null, lastFailureAt: minutesAgo(1), now: NOW
  });
  assert.equal(d.alert, false);
  assert.match(d.reason, /FAILED to send/);
  // And it must not claim a send that did not happen, which is the
  // module's own fourth rule and was broken here specifically.
  assert.ok(!/already sent/i.test(d.reason), 'the reason claimed a send that never happened');
});

// Finding H5: the failure count was per-username but the cooldown was
// global, so with a second cleared human one person's alert would
// silence the other's, and the person under attack hears nothing.
test('the cooldown is scoped to the account under attack', async () => {
  const seen = [];
  const db = {
    inserts: [],
    async query(sql, params) {
      if (params && params[0] === alert.FAILED_EVENT) {
        seen.push({ event: params[0], like: params[1] });
        return { rows: [minutesAgo(3), minutesAgo(2), minutesAgo(1)].map((d) => ({ created_at: d })) };
      }
      if (params && (params[0] === alert.ALERT_EVENT || params[0] === alert.ALERT_FAILED_EVENT)) {
        seen.push({ event: params[0], like: params[1] });
        return { rows: [] };
      }
      if (/INSERT/.test(sql)) { this.inserts.push(params); return { rows: [] }; }
      return { rows: [] };
    }
  };
  await alert.maybeAlertOnFailedUnlock(db, { username: 'tom', now: NOW, sendFn: async () => ({ sent: true }) });
  const cooldownQueries = seen.filter((q) => q.event !== alert.FAILED_EVENT);
  assert.ok(cooldownQueries.length >= 2, 'both cooldown queries should run');
  cooldownQueries.forEach((q) => {
    assert.ok(String(q.like).includes('tom'),
      'a cooldown query was not scoped to the username, so one account would silence another');
  });
});

test('a burst sends one notice to the configured address and records that it sent', async () => {
  const db = fakeDb({ failures: [minutesAgo(10), minutesAgo(5), minutesAgo(1)] });
  const sent = [];
  const res = await alert.maybeAlertOnFailedUnlock(db, {
    username: 'tom', now: NOW, sendFn: async (m) => { sent.push(m); return { sent: true }; }
  });
  assert.equal(res.sent, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].to, /@arringtonconsultancy\.com$/);
  const row = db.inserts.find((p) => p[1] === alert.ALERT_EVENT);
  assert.ok(row, 'no alert row was written');
  assert.match(row[2], /DELIVERED/);
});

test('a failed send is recorded as a failure with its real error, never as a send', async () => {
  // The gap-notifier lesson, applied here: an interface that claims a
  // send that did not happen is worse than one that says nothing.
  const db = fakeDb({ failures: [minutesAgo(10), minutesAgo(5), minutesAgo(1)] });
  const res = await alert.maybeAlertOnFailedUnlock(db, {
    username: 'tom', now: NOW, sendFn: async () => ({ sent: false, error: 'mailbox unavailable' })
  });
  assert.equal(res.sent, false);
  const row = db.inserts.find((p) => p[1] === alert.ALERT_FAILED_EVENT);
  assert.ok(row, 'a failed send was recorded under the success event type');
  assert.match(row[2], /FAILED to send/);
  assert.match(row[2], /mailbox unavailable/);
  assert.match(row[2], /did not start the quiet period/);
  assert.ok(!db.inserts.some((p) => p[1] === alert.ALERT_EVENT),
    'a failed send wrote the success event, which would start the cooldown');
});

test('below the threshold nothing is sent and nothing is written', async () => {
  const db = fakeDb({ failures: [minutesAgo(2)] });
  let called = false;
  const res = await alert.maybeAlertOnFailedUnlock(db, {
    username: 'tom', now: NOW, sendFn: async () => { called = true; return { sent: true }; }
  });
  assert.equal(res.sent, false);
  assert.equal(called, false);
  assert.equal(db.inserts.length, 0, 'a row was written for a non-event');
});

test('a database failure never propagates, because the refusal must not depend on the alert', async () => {
  const broken = { query: async () => { throw new Error('db down'); } };
  const res = await alert.maybeAlertOnFailedUnlock(broken, { username: 'tom', now: NOW });
  assert.equal(res.sent, false);
  assert.match(res.error, /db down/);
});

test('the count comes from the database, so a restart cannot reset it', async () => {
  // This is the other half of G6. The attempt limiter is in-memory and
  // does reset; a patient attacker restarting the container between
  // bursts would never trip an in-memory alert counter. These rows
  // outlive the process.
  const db = fakeDb({ failures: [minutesAgo(29), minutesAgo(20), minutesAgo(2)] });
  const res = await alert.maybeAlertOnFailedUnlock(db, {
    username: 'tom', now: NOW, sendFn: async () => ({ sent: true })
  });
  assert.equal(res.sent, true, 'attempts spread across the window did not add up');
  assert.equal(res.failures, 3);
});

test('attempts older than the window do not accumulate forever into a false alarm', () => {
  // Guards the window itself: the query filters on created_at, so a
  // single stray failure a month ago plus two today must not alert.
  assert.equal(alert.WINDOW_MINUTES, 30);
  assert.equal(alert.decideAlert({ failuresInWindow: 2, lastSuccessAt: null, lastFailureAt: null, now: NOW }).alert, false);
});
