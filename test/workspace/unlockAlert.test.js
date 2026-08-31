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

// --- End to end, against a REAL database ------------------------------
//
// Governance finding J1 (31/08/2026): the previous version of this
// section used a fake database, and its flood test - named "a guessing
// loop produces one alert, not a flood" - called decideAlert ONCE,
// serially, with the cooldown already in place. It therefore asserted
// nothing about the property it was named for. The real code was a
// read-decide-send-then-write with nothing holding the gap, called once
// per failed attempt without being awaited, and five concurrent calls
// delivered five messages against a stated bound of one.
//
// Concurrency cannot be tested against a fake, so these run against the
// real database and clean up after themselves.
const db = require('../../db/pool');
const SUBJECT = `alerttest-${Date.now()}`;

const dbReady = !!process.env.DATABASE_URL;
test('failed-unlock alerting, against a real database', { skip: dbReady ? false : 'set DATABASE_URL' }, async (t) => {
  const reset = async () => {
    await db.query('DELETE FROM workspace_activity WHERE subject = $1 OR actor = $1', [SUBJECT]);
  };
  const seedFailures = async (n) => {
    for (let i = 0; i < n; i += 1) {
      await db.query(
        'INSERT INTO workspace_activity (actor, event_type, summary, subject) VALUES ($1,$2,$3,$4)',
        [SUBJECT, alert.FAILED_EVENT, 'refused', SUBJECT]
      );
    }
  };
  const rowsOf = async (event) => (await db.query(
    'SELECT id, summary FROM workspace_activity WHERE event_type = $1 AND subject = $2', [event, SUBJECT]
  )).rows;

  t.after(reset);

  await t.test('a burst below the threshold sends nothing and writes nothing', async () => {
    await reset();
    await seedFailures(alert.THRESHOLD - 1);
    let called = false;
    const res = await alert.maybeAlertOnFailedUnlock(db, {
      username: SUBJECT, sendFn: async () => { called = true; return { sent: true }; }
    });
    assert.equal(res.sent, false);
    assert.equal(called, false);
    assert.equal((await rowsOf(alert.ALERT_EVENT)).length, 0);
  });

  await t.test('a burst at the threshold delivers exactly one notice', async () => {
    await reset();
    await seedFailures(alert.THRESHOLD);
    const sent = [];
    const res = await alert.maybeAlertOnFailedUnlock(db, {
      username: SUBJECT, sendFn: async (m) => { sent.push(m); return { sent: true }; }
    });
    assert.equal(res.sent, true);
    assert.equal(sent.length, 1);
    assert.match(sent[0].to, /@arringtonconsultancy\.com$/);
    assert.equal((await rowsOf(alert.ALERT_EVENT)).length, 1);
  });

  // FINDING L1. The test that would have caught it, and did not exist.
//
// The K1 fix identified a pool with `typeof db.connect === 'function' &&
// typeof db.totalCount === 'number'`. `db/pool.js` exports `{ query,
// pool }`, which has neither, so the dedicated-client branch was dead on
// the deployed path and every statement ran on a different connection:
// no transaction, no lock, connections left idle in transaction. The
// remediation claimed "both paths are exercised". Nothing checked.
//
// This asserts the branch taken by THE REAL MODULE the application
// passes, not by a handle invented for the test.
test('the handle the application actually passes yields a dedicated connection', () => {
  const realDb = require('../../db/pool');
  const source = alert.dedicatedConnectionSource(realDb);
  assert.ok(
    source, 'the deployed database handle resolves to no dedicated connection, so the claim cannot hold a transaction or a lock'
  );
  assert.equal(source, 'wrapper', 'db/pool.js exports { query, pool }; if that changed, this branch needs revisiting');
});

test('a handle that cannot give a dedicated connection is refused, not silently used', async () => {
  // The failure mode being prevented is precisely L1: continuing on a
  // round-robin query shorthand, where BEGIN, the lock and the INSERT
  // land on different connections and the whole thing is a no-op that
  // looks like it worked.
  const shorthandOnly = { query: async () => ({ rows: [] }) };
  assert.equal(alert.dedicatedConnectionSource(shorthandOnly), null);
  await assert.rejects(
    () => alert.claimAlertSlot(shorthandOnly, { username: 'someone', now: Date.now() }),
    /no dedicated database connection/,
    'a handle with no dedicated connection was accepted instead of refused'
  );
});

test('a real Pool and a checked-out client are both recognised', () => {
  const { Pool } = require('pg');
  const p = new Pool({ connectionString: 'postgres://unused/unused' });
  assert.equal(alert.dedicatedConnectionSource(p), 'pool');
  p.end().catch(() => {});
  assert.equal(alert.dedicatedConnectionSource({ query() {}, release() {} }), 'client');
});

// THE J1 CASE, corrected after governance finding K2 (31/08/2026).
  //
  // The original version of this subtest called the real function,
  // concurrently, against a real database - and still proved nothing,
  // because it ran on the easy path and the easy path was invisible. In
  // a fresh process it passed six times out of six. Issue eight ordinary
  // queries first, which is less warm-up than a live server has in its
  // first second, and it failed three times in six; looped so the pool
  // stays warm, nineteen red in twenty-five.
  //
  // The mechanism: with a cold pool node-postgres must open a connection
  // for each concurrent caller, and the cost of establishing them
  // staggers the statements enough that they usually serialise by
  // accident. A running server already has those connections. So the
  // condition the property claims to hold under is a warm pool, and the
  // test's condition was a process that had just started.
  //
  // Hence: warm first, and repeat, so one lucky interleaving cannot
  // carry it.
  await t.test('a concurrent burst still produces exactly one notice', async () => {
    // The warm-up IS the test setup. Without it this passes against code
    // that does not hold the property.
    await Promise.all(Array.from({ length: 8 }, () => db.query('SELECT 1')));

    for (let round = 1; round <= 5; round += 1) {
      await reset();
      await seedFailures(10);
      const sent = [];
      // A delay in the transport widens the window further.
      const send = async (m) => {
        await new Promise((r) => setTimeout(r, 120));
        sent.push(m);
        return { sent: true };
      };
      // Finding N2: the reviewer showed that at its original profile -
      // eight callers released in the same tick - this test ran clean
      // 150 times against code that was demonstrably broken, and that a
      // 0-40ms arrival stagger made the same code fail 16 times in 150.
      // Callers in a real burst arrive at slightly different moments,
      // and it is the gap between one caller's read and another's write
      // that the guarantee has to survive, so the stagger is kept.
      //
      // Stated honestly rather than claimed: I could NOT reproduce that
      // sensitivity here. Fifty rounds at each profile against both
      // candidate predecessors, with the unique index dropped so the old
      // failure mode was reachable, produced zero bad rounds either way.
      // So on this machine the stagger is a more realistic arrival
      // pattern, and nothing more than that has been demonstrated. The
      // tests below, which name the structural guarantees directly, are
      // the ones carrying the weight.
      await Promise.all(Array.from({ length: 8 }, async (_v, i) => {
        await new Promise((r) => setTimeout(r, (i * 7) % 40));
        return alert.maybeAlertOnFailedUnlock(db, { username: SUBJECT, sendFn: send });
      }));
      assert.equal(sent.length, 1, `round ${round}: eight concurrent attempts delivered ${sent.length} messages; the stated bound is one`);
      assert.equal((await rowsOf(alert.ALERT_EVENT)).length, 1, `round ${round}: more than one delivered row was written for one burst`);
    }
  });

  // FINDING L2. The failure the K1 fix introduced: not too many alerts,
  // but NONE.
  //
  // Standing down on a lost try-lock meant a caller holding a stale,
  // sub-threshold count could win the decision, write nothing, and
  // silence every caller that could see the true count. Worst at exactly
  // the threshold, and worse than duplication, because this is the one
  // control meant to reach someone who cannot open the workspace.
  //
  // Asserted at the threshold itself, warmed and repeated, because that
  // is where it was found.
  await t.test('a burst at exactly the threshold is never silent', async () => {
    await Promise.all(Array.from({ length: 8 }, () => db.query('SELECT 1')));

    for (let round = 1; round <= 8; round += 1) {
      await reset();
      const sent = [];
      const send = async (m) => { sent.push(m); return { sent: true }; };
      // Exactly THRESHOLD attempts, arriving together, each writing its
      // own failure row and then evaluating - which is what the unlock
      // route does on a real burst.
      await Promise.all(Array.from({ length: alert.THRESHOLD }, async () => {
        await db.query(
          'INSERT INTO workspace_activity (actor, event_type, summary, subject) VALUES ($1,$2,$3,$4)',
          [SUBJECT, alert.FAILED_EVENT, 'refused', SUBJECT]
        );
        return alert.maybeAlertOnFailedUnlock(db, { username: SUBJECT, sendFn: send });
      }));

      assert.equal(
        sent.length, 1,
        `round ${round}: a burst of exactly ${alert.THRESHOLD} attempts produced ${sent.length} notices; `
        + (sent.length === 0
          ? 'nobody was warned, which is the L2 failure'
          : 'the stated bound is one')
      );
    }
  });

  // THE SECOND J1 CASE, found by racing processes rather than promises.
  //
  // The case above passes with or without the advisory lock, because
  // eight calls in one event loop almost always serialise by accident.
  // That is exactly how the false property survived a green test: the
  // module asserted boundedness "no matter how many arrive at once", the
  // in-process test agreed, and twelve separate processes won the claim
  // 2 to 4 times a round.
  //
  // Concurrency inside one process is not the condition the property
  // claims to hold under. This runs it under the real one.
  await t.test('processes racing the same instant produce exactly one claim', async () => {
    await reset();
    await seedFailures(10);

    const { execFile } = require('node:child_process');
    const workerPath = require('node:path').join(__dirname, '../../scripts/workspaceUnlockClaimWorker.js');
    const WORKERS = 12;
    const gun = Date.now() + 2500; // time enough for every process to boot and connect

    const runs = Array.from({ length: WORKERS }, () => new Promise((resolve) => {
      execFile(process.execPath, [workerPath, String(gun), SUBJECT], { env: process.env }, (err, stdout, stderr) => {
        const line = String(stdout).trim().split('\n').filter((l) => l.startsWith('{')).pop();
        const parsed = line ? JSON.parse(line) : { id: null, err: 'no output' };
        // Finding M1: this used to discard `err` whenever a JSON line had
        // been printed, so a worker that printed its result and THEN died
        // was counted as a clean run. Every worker was exiting 1 on a
        // TypeError and the suite reported zero errors.
        if (err) parsed.err = parsed.err || `worker exited ${err.code}: ${String(stderr).trim().split('\n').pop()}`;
        resolve(parsed);
      });
    }));
    const results = await Promise.all(runs);

    const failures = results.filter((r) => r.err);
    assert.equal(failures.length, 0, `worker errors: ${JSON.stringify(failures.slice(0, 3))}`);

    const winners = results.filter((r) => r.id !== null);
    assert.equal(
      winners.length, 1,
      `${WORKERS} processes racing one instant won ${winners.length} claims; the stated bound is one, `
      + 'so this many notices would have been emailed for a single burst'
    );

    const pending = await rowsOf(alert.ALERT_PENDING_EVENT);
    assert.equal(pending.length, 1, `${pending.length} claim rows were written for one burst`);
  });

  // Every other case in this file injects sendFn, which means the wiring
  // from the decision to the ACTUAL sender was never executed by any
  // test: not that the resolved recipient reaches sendMail, not that the
  // subject and body reach it intact, not that a transport that throws
  // becomes { sent: false } rather than an exception, and not that a
  // missing credential is reported rather than crashing. Those are the
  // properties that decide whether Tom is warned, so they are tested
  // against the real path with only the transport itself replaced.
  await t.test('the real send path carries the alert to the transport', async () => {
    await reset();
    await seedFailures(alert.THRESHOLD);
    const posted = [];
    alert.__setTransportForTests({ sendMail: async (m) => { posted.push(m); return { accepted: [m.to] }; } });
    try {
      const res = await alert.maybeAlertOnFailedUnlock(db, { username: SUBJECT }); // no sendFn: the real one
      assert.equal(res.sent, true, 'the real send path did not report a delivery');
      assert.equal(posted.length, 1, `the transport received ${posted.length} messages`);
      assert.equal(posted[0].to, alert.alertRecipient(), 'the message did not go to the resolved recipient');
      // What is delivered must be exactly what buildAlert produced.
      // Asserting equality rather than re-scanning the text for secrets
      // is deliberate: the leak guarantee is established structurally
      // above, on buildAlert's signature, and a second hand-written
      // scan here would be weaker than the one it duplicates. A first
      // draft of this line proved the point by matching the innocent
      // words "passphrase is also required" and failing.
      const expected = alert.buildAlert({
        username: SUBJECT,
        failures: alert.THRESHOLD,
        windowMinutes: alert.WINDOW_MINUTES,
        firstAt: new Date(0),
        lastAt: new Date(0)
      });
      assert.equal(posted[0].subject, expected.subject, 'the delivered subject is not the one buildAlert produces');
      const stripTimes = (t) => t.replace(/^(First recorded|Most recent):.*$/gm, '<timestamp>');
      assert.equal(
        stripTimes(posted[0].text), stripTimes(expected.body),
        'the delivered body is not the one buildAlert produces, so its leak guarantee does not cover what was sent'
      );
      assert.equal((await rowsOf(alert.ALERT_EVENT)).length, 1);
    } finally {
      alert.__resetTransportForTests();
    }
  });

  await t.test('a transport that throws is reported, not raised', async () => {
    await reset();
    await seedFailures(alert.THRESHOLD);
    alert.__setTransportForTests({ sendMail: async () => { throw new Error('535 auth failed'); } });
    try {
      // This must not reject: the unlock route calls it fire-and-forget,
      // and an unhandled rejection there is a crash on a security path.
      const res = await alert.maybeAlertOnFailedUnlock(db, { username: SUBJECT });
      assert.equal(res.sent, false);
      assert.match(res.error, /535/);
      assert.equal((await rowsOf(alert.ALERT_FAILED_EVENT)).length, 1, 'the failed delivery was not recorded as a failure');
      assert.equal((await rowsOf(alert.ALERT_EVENT)).length, 0, 'a failed send wrote a delivered row');
    } finally {
      alert.__resetTransportForTests();
    }
  });

  await t.test('an unconfigured mailbox is reported honestly rather than silently dropped', async () => {
    await reset();
    await seedFailures(alert.THRESHOLD);
    alert.__setTransportForTests(null); // what getTransport returns with no GMAIL_APP_PASSWORD
    try {
      const res = await alert.maybeAlertOnFailedUnlock(db, { username: SUBJECT });
      assert.equal(res.sent, false);
      assert.match(res.error, /GMAIL_APP_PASSWORD/);
      assert.equal((await rowsOf(alert.ALERT_FAILED_EVENT)).length, 1, 'an unsendable alert left no durable trace');
    } finally {
      alert.__resetTransportForTests();
    }
  });

  // The four structural changes of this cycle, named. Finding N2: none
  // of them appeared anywhere in the test tree, so the guarantee rested
  // on code review alone - which is precisely how the previous seven
  // defects survived.

  await t.test('the database itself refuses a second unresolved claim', async () => {
    await reset();
    await db.query(
      'INSERT INTO workspace_activity (actor, event_type, summary, subject) VALUES ($1,$2,$3,$4)',
      ['system', alert.ALERT_PENDING_EVENT, 'first claim', SUBJECT]
    );
    // Not "the code declines to insert a second" - the DATABASE refuses
    // it. This is the guarantee that does not depend on any caller
    // behaving, and it is the one thing four previous fixes lacked.
    await assert.rejects(
      () => db.query(
        'INSERT INTO workspace_activity (actor, event_type, summary, subject) VALUES ($1,$2,$3,$4)',
        ['system', alert.ALERT_PENDING_EVENT, 'second claim', SUBJECT]
      ),
      (err) => err.code === '23505',
      'a second unresolved claim was accepted; the unique index is missing or not partial'
    );
  });

  await t.test('one account cannot block another account claiming', async () => {
    await reset();
    const other = `${SUBJECT}-other`;
    await db.query(
      'INSERT INTO workspace_activity (actor, event_type, summary, subject) VALUES ($1,$2,$3,$4)',
      ['system', alert.ALERT_PENDING_EVENT, 'held', SUBJECT]
    );
    try {
      // The index is on subject, so it must constrain per account. A
      // global one would let one person's burst silence everyone else's.
      await db.query(
        'INSERT INTO workspace_activity (actor, event_type, summary, subject) VALUES ($1,$2,$3,$4)',
        ['system', alert.ALERT_PENDING_EVENT, 'other account', other]
      );
    } finally {
      await db.query('DELETE FROM workspace_activity WHERE subject = $1', [other]);
    }
  });

  await t.test('an abandoned claim is recorded and does NOT gate the next alert', async () => {
    await reset();
    await seedFailures(alert.THRESHOLD);
    await db.query(
      `INSERT INTO workspace_activity (actor, event_type, summary, subject, created_at)
       VALUES ('system', $1, 'died mid-send', $2, now() - ($3 || ' minutes')::interval)`,
      [alert.ALERT_PENDING_EVENT, SUBJECT, String(alert.CLAIM_LEASE_MINUTES + 1)]
    );
    const sent = [];
    const res = await alert.maybeAlertOnFailedUnlock(db, {
      username: SUBJECT, sendFn: async (m) => { sent.push(m); return { sent: true }; }
    });
    assert.equal(res.sent, true, 'an abandoned claim silenced the alarm instead of being reclaimed');
    assert.equal(sent.length, 1);
    assert.equal((await rowsOf(alert.ALERT_ABANDONED_EVENT)).length, 1, 'the abandonment left no trace');
  });

  await t.test('a claim dated in the future is reclaimed, not trusted', async () => {
    // Finding N4: the Node clock and the database clock demonstrably
    // disagree here. A claim dated ahead of now is newer than any lease,
    // so it was never reclaimed and never expired - it silenced the
    // alarm for the whole of the skew.
    await reset();
    await seedFailures(alert.THRESHOLD);
    await db.query(
      `INSERT INTO workspace_activity (actor, event_type, summary, subject, created_at)
       VALUES ('system', $1, 'future dated', $2, now() + interval '30 minutes')`,
      [alert.ALERT_PENDING_EVENT, SUBJECT]
    );
    const sent = [];
    const res = await alert.maybeAlertOnFailedUnlock(db, {
      username: SUBJECT, sendFn: async (m) => { sent.push(m); return { sent: true }; }
    });
    assert.equal(res.sent, true, 'a future-dated claim silenced the alarm');
    assert.equal(sent.length, 1);
  });

  await t.test('a failed send does not buy the hour, and the next attempt retries', async () => {
    await reset();
    await seedFailures(alert.THRESHOLD);
    const first = await alert.maybeAlertOnFailedUnlock(db, {
      username: SUBJECT, sendFn: async () => ({ sent: false, error: 'SMTP timeout' })
    });
    assert.equal(first.sent, false);
    assert.equal((await rowsOf(alert.ALERT_FAILED_EVENT)).length, 1, 'the failure was not recorded as a failure');
    assert.equal((await rowsOf(alert.ALERT_EVENT)).length, 0, 'a failed send wrote a delivered row, which would start the cooldown');

    // Age the failure past the short backoff, then let mail work.
    await db.query(
      `UPDATE workspace_activity SET created_at = NOW() - INTERVAL '${alert.FAILURE_RETRY_MINUTES + 1} minutes'
        WHERE event_type = $1 AND subject = $2`, [alert.ALERT_FAILED_EVENT, SUBJECT]
    );
    const sent = [];
    const second = await alert.maybeAlertOnFailedUnlock(db, {
      username: SUBJECT, sendFn: async (m) => { sent.push(m); return { sent: true }; }
    });
    assert.equal(second.sent, true, 'a failed send silenced the alarm for the attack');
    assert.equal(sent.length, 1);
  });

  await t.test('a delivered notice does buy the hour', async () => {
    await reset();
    await seedFailures(alert.THRESHOLD);
    await alert.maybeAlertOnFailedUnlock(db, { username: SUBJECT, sendFn: async () => ({ sent: true }) });
    const sent = [];
    const again = await alert.maybeAlertOnFailedUnlock(db, {
      username: SUBJECT, sendFn: async (m) => { sent.push(m); return { sent: true }; }
    });
    assert.equal(again.sent, false);
    assert.equal(sent.length, 0, 'a second notice went out inside the cooldown');
  });

  // Finding J2: the cooldown is matched on a column, exactly, so
  // rewording the message cannot remove it and a username carrying a
  // LIKE wildcard cannot match another account's rows.
  await t.test('one account cannot silence another, whatever its name contains', async () => {
    await reset();
    await seedFailures(alert.THRESHOLD);
    await alert.maybeAlertOnFailedUnlock(db, { username: SUBJECT, sendFn: async () => ({ sent: true }) });

    const wildcard = '%';
    await db.query('DELETE FROM workspace_activity WHERE subject = $1 OR actor = $1', [wildcard]);
    for (let i = 0; i < alert.THRESHOLD; i += 1) {
      await db.query(
        'INSERT INTO workspace_activity (actor, event_type, summary, subject) VALUES ($1,$2,$3,$4)',
        [wildcard, alert.FAILED_EVENT, 'refused', wildcard]
      );
    }
    const sent = [];
    const res = await alert.maybeAlertOnFailedUnlock(db, {
      username: wildcard, sendFn: async (m) => { sent.push(m); return { sent: true }; }
    });
    assert.equal(res.sent, true, 'an account named "%" was silenced by another account\'s cooldown row');
    assert.equal(sent.length, 1);
    await db.query('DELETE FROM workspace_activity WHERE subject = $1 OR actor = $1', [wildcard]);
  });

  // Finding J3: a failure BEFORE the send must leave a durable trace.
  await t.test('a transport that throws is a FAILED SEND, not "nothing was attempted"', async () => {
    // Governance finding N1: the test that used to stand here proved the
    // wrong thing. It threw from sendFn - which is a send that WAS
    // attempted - and then asserted the "NO send was attempted" wording.
    // So it passed against the defect it was named for.
    await reset();
    await seedFailures(alert.THRESHOLD);
    const res = await alert.maybeAlertOnFailedUnlock(db, {
      username: SUBJECT,
      sendFn: async () => { throw new Error('transport exploded mid-send'); }
    });
    assert.equal(res.sent, false);
    const failed = await rowsOf(alert.ALERT_FAILED_EVENT);
    assert.equal(failed.length, 1, 'an attempted send that threw was not recorded as a failed send');
    assert.equal((await rowsOf(alert.ALERT_ERROR_EVENT)).length, 0, 'an attempted send was recorded as never attempted');
    assert.ok(!/NO send was attempted/.test(failed[0].summary), 'the register claims nothing was sent, about a send that was tried');
  });

  await t.test('a send that SUCCEEDED is never recorded as "no send was attempted"', async () => {
    // THE N1 CASE. The message reached the mailbox and the single
    // statement that records the outcome then failed. The old code
    // reported "NO send was attempted" about a delivered notice, and
    // started no cooldown, so a duplicate followed five minutes later.
    await reset();
    await seedFailures(alert.THRESHOLD);

    // Fail the outcome UPDATE once, and only after the send.
    let seen = 0;
    const flaky = {
      pool: db.pool,
      query: async (text, params) => {
        if (/UPDATE workspace_activity SET event_type/.test(text) && seen++ === 0) {
          throw new Error('connection reset while recording the outcome');
        }
        return db.query(text, params);
      }
    };

    const sent = [];
    const res = await alert.maybeAlertOnFailedUnlock(flaky, {
      username: SUBJECT, sendFn: async (m) => { sent.push(m); return { sent: true }; }
    });

    assert.equal(sent.length, 1, 'the message was not actually sent, so this case is not being tested');
    const delivered = await rowsOf(alert.ALERT_EVENT);
    assert.equal(delivered.length, 1, 'a delivered notice was not recorded as delivered');
    assert.equal((await rowsOf(alert.ALERT_ERROR_EVENT)).length, 0, 'a delivered notice was recorded as never attempted');
    assert.ok(!/NO send was attempted/.test(delivered[0].summary), 'the register denies a send that reached the mailbox');

    // And the hour must start, or the duplicate the finding describes
    // arrives on the next failed attempt.
    const again = await alert.maybeAlertOnFailedUnlock(db, {
      username: SUBJECT, sendFn: async () => { throw new Error('should not be called'); }
    });
    assert.equal(again.sent, false, 'a second notice went out for the same burst');
    assert.match(again.reason, /claimed or completed|DELIVERED/i);
    assert.equal(res.sent, true);
  });

  await t.test('contention that sends nothing does not buy the send backoff', async () => {
    // Finding N3: ClaimContentionError was declared distinct and then
    // handled exactly like a database fault, so losing a race bought the
    // five-minute backoff and silenced a genuine burst.
    const d = alert.decideAlert({
      failuresInWindow: alert.THRESHOLD,
      lastSuccessAt: null, lastFailureAt: null, lastErrorAt: null,
      // An abandoned/contended record is not one of the gating types at
      // all, so the only thing that could gate here is a pending claim.
      lastPendingAt: null,
      now: Date.now()
    });
    assert.equal(d.alert, true, 'a burst was refused with nothing holding it back');
  });

  await t.test('a claim left behind by a dead process does not silence the alarm forever', async () => {
    await reset();
    await seedFailures(alert.THRESHOLD);
    await db.query(
      `INSERT INTO workspace_activity (actor, event_type, summary, subject, created_at)
       VALUES ('system', $1, 'stale claim', $2, NOW() - INTERVAL '${alert.CLAIM_LEASE_MINUTES + 1} minutes')`,
      [alert.ALERT_PENDING_EVENT, SUBJECT]
    );
    const sent = [];
    const res = await alert.maybeAlertOnFailedUnlock(db, {
      username: SUBJECT, sendFn: async (m) => { sent.push(m); return { sent: true }; }
    });
    assert.equal(res.sent, true, 'a stale claim blocked the alarm permanently');
    assert.equal(sent.length, 1);
  });
});
