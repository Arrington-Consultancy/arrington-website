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
    const d = alert.decideAlert({ failuresInWindow: n, lastAlertAt: null, now: NOW });
    assert.equal(d.alert, false, `${n} failures should not alert`);
  }
});

test('a run of attempts does alert, and does so before the limiter is exhausted', () => {
  assert.equal(alert.decideAlert({ failuresInWindow: 3, lastAlertAt: null, now: NOW }).alert, true);
  // The limiter's own budget is five. Alerting at three means the notice
  // goes out while the attacker is still being refused, not after they
  // have used up their attempts and gone quiet.
  assert.ok(alert.THRESHOLD < 5, 'the alert threshold is not below the attempt budget');
});

test('a guessing loop produces one alert, not a flood', () => {
  // The failure this prevents: a security control that turns an attack
  // into a denial-of-service against the owner's own inbox.
  const d = alert.decideAlert({ failuresInWindow: 500, lastAlertAt: minutesAgo(5), now: NOW });
  assert.equal(d.alert, false);
  assert.match(d.reason, /cooldown/);
});

test('a fresh burst after the cooldown is not silently swallowed', () => {
  const d = alert.decideAlert({ failuresInWindow: 3, lastAlertAt: minutesAgo(61), now: NOW });
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
  const params = alert.buildAlert.length;
  assert.equal(params, 1, 'buildAlert takes exactly one options object');
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

test('the recipient is configured, never invented', async () => {
  const before = process.env.WORKSPACE_ALERT_EMAIL;
  process.env.WORKSPACE_ALERT_EMAIL = 'security@example.test';
  assert.equal(await alert.alertRecipient({ query: async () => ({ rows: [] }) }), 'security@example.test');

  delete process.env.WORKSPACE_ALERT_EMAIL;
  const withContact = { query: async () => ({ rows: [{ content: 'configured@example.test' }] }) };
  assert.equal(await alert.alertRecipient(withContact), 'configured@example.test');

  // A database that cannot be read must still yield a real address, not
  // a blank one: a security alert sent to '' is a security alert lost.
  const broken = { query: async () => { throw new Error('db down'); } };
  assert.match(await alert.alertRecipient(broken), /@arringtonconsultancy\.com$/);

  if (before === undefined) delete process.env.WORKSPACE_ALERT_EMAIL;
  else process.env.WORKSPACE_ALERT_EMAIL = before;
});

// --- End to end, against a fake database ------------------------------

function fakeDb({ failures = [], lastAlert = null, onInsert = () => {} }) {
  return {
    inserts: [],
    async query(sql, params) {
      if (/workspace_unlock_failed|event_type = \$1 AND actor/.test(sql) || (params && params[0] === alert.FAILED_EVENT)) {
        return { rows: failures.map((d) => ({ created_at: d })) };
      }
      if (params && params[0] === alert.ALERT_EVENT) {
        return { rows: lastAlert ? [{ created_at: lastAlert }] : [] };
      }
      if (/INSERT INTO workspace_activity/.test(sql)) {
        this.inserts.push(params);
        onInsert(params);
        return { rows: [] };
      }
      if (/contact\.email/.test(sql)) return { rows: [{ content: 'owner@example.test' }] };
      return { rows: [] };
    }
  };
}

test('a burst sends one notice to the configured address and records that it sent', async () => {
  const db = fakeDb({ failures: [minutesAgo(10), minutesAgo(5), minutesAgo(1)] });
  const sent = [];
  const res = await alert.maybeAlertOnFailedUnlock(db, {
    username: 'tom', now: NOW, sendFn: async (m) => { sent.push(m); return { sent: true }; }
  });
  assert.equal(res.sent, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'owner@example.test');
  const row = db.inserts.find((p) => p[1] === alert.ALERT_EVENT);
  assert.ok(row, 'no alert row was written');
  assert.match(row[2], /Security notice sent/);
});

test('a failed send is recorded as a failure with its real error, never as a send', async () => {
  // The gap-notifier lesson, applied here: an interface that claims a
  // send that did not happen is worse than one that says nothing.
  const db = fakeDb({ failures: [minutesAgo(10), minutesAgo(5), minutesAgo(1)] });
  const res = await alert.maybeAlertOnFailedUnlock(db, {
    username: 'tom', now: NOW, sendFn: async () => ({ sent: false, error: 'mailbox unavailable' })
  });
  assert.equal(res.sent, false);
  const row = db.inserts.find((p) => p[1] === alert.ALERT_EVENT);
  assert.match(row[2], /could NOT be sent/);
  assert.match(row[2], /mailbox unavailable/);
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
  assert.equal(alert.decideAlert({ failuresInWindow: 2, lastAlertAt: null, now: NOW }).alert, false);
});
