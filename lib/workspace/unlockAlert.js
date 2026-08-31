// Arrington AI Workspace: alerting on a run of failed unlock attempts.
//
// Governance finding G6 (31/08/2026), and Tom's instruction of the same
// day: "A failed-unlock security warning must not only appear behind the
// Workspace unlock it is protecting."
//
// The reviewer's point was sharper than the finding's title. Every
// refused unlock is written to workspace_activity as
// workspace_unlock_failed, and I had described those rows as "the only
// warning anyone would get". They are visible on /workspace/activity,
// which requires the unlock to open. So in the exact scenario the
// passphrase gate exists for - somebody has taken the CMS account and is
// guessing at the passphrase - the attacker is locked out, Tom may also
// be locked out of the account whose password was changed, and the
// warning is delivered to a screen neither of them can read.
//
// This sends it somewhere a person will actually see it.
//
// FOUR RULES, all of which are about not making the alert itself a
// liability:
//
// 1. It carries NOTHING confidential. Not the passphrase, not its length,
//    not any guessed value, not a record, a contact, a count of records
//    or anything else from inside the workspace. An alert about a
//    break-in attempt that quotes the thing being broken into would be a
//    new disclosure channel with no gate on it at all. What it says is:
//    how many attempts, over what window, against which username, and
//    what to do about it.
// 2. It is BOUNDED, and bounded ATOMICALLY. One alert per cooldown
//    window per account, no matter how many attempts arrive and no
//    matter how many arrive at once. A guessing loop must not become a
//    mail flood, which would be a denial-of-service against Tom's inbox
//    delivered by his own security control.
//
//    Governance finding J1 (31/08/2026) is why the word "atomically" is
//    there. This was a read-decide-send-then-write with nothing holding
//    the gap, called once per failed attempt without being awaited, so
//    concurrent attempts all read "no recent alert" before any of them
//    wrote one. Five concurrent calls delivered five messages against
//    the stated bound of one. The serial path was correct throughout,
//    which is exactly why reading the code did not show it.
//
//    The slot is now CLAIMED in the database before anything is sent,
//    by a conditional insert that only one caller can win. That is the
//    same discipline as the paid-suite runner's marker-before-spend:
//    the thing that must not happen twice is guarded by a row, not by
//    the hope that two callers do not overlap.
// 3. The threshold and the cooldown are read from the DATABASE, not from
//    memory. That is deliberate and it is the other half of G6: the
//    attempt limiter resets on any container restart, so a
//    memory-resident alert counter would reset with it and a patient
//    attacker would never trip it. Rows in workspace_activity survive.
// 4. It NEVER fails the request it is attached to, and it never claims a
//    send that did not happen. Same discipline as lib/scott/gapNotifier:
//    the send returns a result, the result is what gets recorded, and a
//    failure is recorded as a failure with its real error.
const nodemailer = require('nodemailer');

// Attempts within the window that trigger an alert. Three is below the
// limiter's own budget of five, so the alert fires while the attacker is
// still being refused rather than only after they have exhausted it.
const THRESHOLD = 3;
const WINDOW_MINUTES = 30;
// One alert per hour at most. Long enough that a sustained attack is one
// message rather than a flood; short enough that a fresh burst tomorrow
// is not silently swallowed.
const COOLDOWN_MINUTES = 60;
// A failed send is retried on the next qualifying failure, after a short
// backoff. Long enough that a broken mailbox cannot become a mail storm,
// short enough that a transient failure does not cost the whole attack.
const FAILURE_RETRY_MINUTES = 5;

const ALERT_EVENT = 'workspace_unlock_alert_sent';
// Finding H2 (HIGH): a failed send used to write ALERT_EVENT, so it
// started the sixty-minute cooldown exactly as a success did. The
// reviewer did not have to construct this - it happened by itself in the
// real database: an undelivered notice took the budget, and the genuine
// five-attempt guessing burst forty-five seconds later produced no alert
// at all. Worse, where GMAIL_APP_PASSWORD is unset EVERY send fails, so
// the alarm could never fire, and the only record of that was behind the
// unlock. Failures now have their own event, which is auditable and does
// NOT consume the cooldown.
const ALERT_FAILED_EVENT = 'workspace_unlock_alert_failed';
const FAILED_EVENT = 'workspace_unlock_failed';

const NOTIFY_FROM = 'tom@arringtonconsultancy.com';

// Where the alert goes. Governance finding H1 (31/08/2026), HIGH, and it
// was the third instance of the pattern the previous two reviews named:
// a control whose stated purpose is defeated by its own default.
//
// This used to fall back to the CMS content row `contact.email` when the
// optional WORKSPACE_ALERT_EMAIL was unset. That row is ordinary site
// content, editable by anyone holding `edit_content`, which both the
// admin and content roles hold. The attacker this whole control exists
// to warn about is a CMS account holder. The reviewer demonstrated it:
// as `nat`, one PUT /api/content retargeted the alarm to
// attacker@evil.example before a single guess was made. That turned the
// alarm into a mail-send primitive pointed at the attacker, whose body
// also confirms an internal workspace and a passphrase exist.
//
// So the recipient now comes only from places CMS admin cannot reach: a
// Railway variable, or the hard-coded constant. No database value is
// consulted, and the function no longer takes a database handle, so a
// future edit cannot reintroduce one by accident.
function alertRecipient() {
  const explicit = (process.env.WORKSPACE_ALERT_EMAIL || '').trim();
  return explicit || NOTIFY_FROM;
}

// Reported at boot (finding H3) so an operator can see whether the alarm
// can actually ring, and where it would ring. The address is not a
// secret; being unable to see it was the problem.
function describeAlertConfig() {
  const to = alertRecipient();
  const explicit = !!(process.env.WORKSPACE_ALERT_EMAIL || '').trim();
  const canSend = !!process.env.GMAIL_APP_PASSWORD;
  return {
    ok: canSend,
    to,
    detail: canSend
      ? `failed-unlock alert will be sent to ${to}${explicit ? '' : ' (WORKSPACE_ALERT_EMAIL unset, using the built-in owner address)'}`
      : `failed-unlock alert CANNOT be sent: GMAIL_APP_PASSWORD is unset. The alarm is inert in this environment. It would otherwise go to ${to}`
  };
}

let transporterOverride;
function __setTransportForTests(t) { transporterOverride = t; }
function __resetTransportForTests() { transporterOverride = undefined; }

let cached;
function getTransport() {
  if (transporterOverride !== undefined) return transporterOverride;
  if (cached !== undefined) return cached;
  cached = process.env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: NOTIFY_FROM, pass: process.env.GMAIL_APP_PASSWORD }
      })
    : null;
  return cached;
}

// Pure. Decides whether this burst has earned an alert, given what the
// database says. Separated so the rule can be tested exhaustively without
// a database, a mailbox or a clock.
function decideAlert({ failuresInWindow, lastSuccessAt, lastFailureAt, lastPendingAt = null, now, threshold = THRESHOLD, cooldownMinutes = COOLDOWN_MINUTES, failureRetryMinutes = FAILURE_RETRY_MINUTES, claimLeaseMinutes = CLAIM_LEASE_MINUTES }) {
  if (failuresInWindow < threshold) {
    return { alert: false, reason: `${failuresInWindow} failure(s) in the window, threshold is ${threshold}` };
  }
  // Only a DELIVERED notice buys quiet. Finding H2.
  if (lastSuccessAt) {
    const minutesSince = (now - new Date(lastSuccessAt).getTime()) / 60000;
    if (minutesSince < cooldownMinutes) {
      return { alert: false, reason: `a notice was DELIVERED ${Math.floor(minutesSince)} minute(s) ago; cooldown is ${cooldownMinutes}` };
    }
  }
  // A recent failure earns a short pause, not an hour of silence, and
  // the reason says plainly that nothing was delivered. The old wording
  // said "an alert was already sent" when it had not been, which broke
  // this module's own fourth rule in the one place it was not looking.
  if (lastFailureAt) {
    const minutesSince = (now - new Date(lastFailureAt).getTime()) / 60000;
    if (minutesSince < failureRetryMinutes) {
      return { alert: false, reason: `the last notice FAILED to send ${Math.floor(minutesSince)} minute(s) ago; retrying after ${failureRetryMinutes} minutes` };
    }
  }
  // Someone else claimed the send and has not recorded an outcome yet.
  // Governance finding K3 (31/08/2026): this leg used to exist only in
  // the SQL, which is what made this function dead in the deployed path
  // while carrying the module's most-cited tests. It lives here now so
  // there is one rule in one place, and the deployed path runs it.
  if (lastPendingAt) {
    const minutesSince = (now - new Date(lastPendingAt).getTime()) / 60000;
    if (minutesSince < claimLeaseMinutes) {
      return { alert: false, reason: `another attempt claimed the send ${Math.floor(minutesSince)} minute(s) ago; its lease runs for ${claimLeaseMinutes}` };
    }
  }
  return { alert: true, reason: `${failuresInWindow} failed unlock attempt(s) within ${WINDOW_MINUTES} minutes` };
}

// The message. Deliberately dull and deliberately empty of anything the
// recipient could not already know: it exists to make a person look, not
// to tell them what is inside.
//
// Finding H7 (31/08/2026): the comment here used to claim the emptiness
// was "structural, because none of those is a parameter", and the test
// pinned it with buildAlert.length === 1 - which is 1 for ANY single
// options object, so adding a field would have kept it green. That is a
// fourth comment claiming a property the code did not have.
//
// What actually protects the message is named here instead: the exact
// set of keys this function is permitted to read. A test asserts the
// set, so adding a sixth field is a deliberate, visible act rather than
// something that slips through.
const ALERT_FIELDS = Object.freeze(['username', 'failures', 'windowMinutes', 'firstAt', 'lastAt']);

function buildAlert(opts) {
  const unexpected = Object.keys(opts || {}).filter((k) => !ALERT_FIELDS.includes(k));
  if (unexpected.length) {
    // Fail loudly rather than quietly rendering something new. A field
    // that reached here unannounced is exactly how workspace content
    // would end up in a message that must not carry any.
    throw new Error(`buildAlert received field(s) it is not permitted to read: ${unexpected.join(', ')}`);
  }
  const { username, failures, windowMinutes, firstAt, lastAt } = opts;
  const subject = 'Arrington workspace: repeated failed unlock attempts';
  const body = [
    'This is an automated security notice from the Arrington internal workspace.',
    '',
    `${failures} failed attempt(s) to unlock the workspace were recorded in the last ${windowMinutes} minutes,`,
    `against the account "${username}".`,
    '',
    `First recorded: ${new Date(firstAt).toUTCString()}`,
    `Most recent:    ${new Date(lastAt).toUTCString()}`,
    '',
    'Signing in to the website is not enough to open the workspace; the deployment',
    'passphrase is also required, and these attempts did not have it. Nothing in the',
    'workspace has been opened by them.',
    '',
    'If this was you, no action is needed.',
    '',
    'If it was not you, treat it as someone holding the website password for that',
    'account. Two things are worth doing, in this order:',
    '  1. Change that account\'s website password.',
    '  2. Rotate WORKSPACE_ACCESS_PASSPHRASE in Railway. Doing so immediately closes',
    '     every open workspace session, including your own.',
    '',
    'This notice deliberately contains no workspace content, no passphrase and none',
    'of the values that were tried.',
    '',
    'You will not receive another notice about this for at least an hour, however',
    'many further attempts are made.'
  ].join('\n');
  return { subject, body };
}

// Reads the burst from the database, decides, sends, and records what
// actually happened. Never throws: it is called from the unlock route
// after the refusal has already been decided, and a mail problem must not
// change what that route does or how long it takes.
// A claimed-but-unresolved slot. If a process dies mid-send this stops
// the alarm being blocked forever: after the lease the slot is claimable
// again, and the worst case is one duplicate rather than permanent
// silence.
const CLAIM_LEASE_MINUTES = 3;
const ALERT_PENDING_EVENT = 'workspace_unlock_alert_pending';

// Advisory-lock namespace for this subsystem. Arbitrary but fixed: it
// only has to be distinct from whatever any future caller picks.
const ALERT_LOCK_CLASS = 4267;

// Wins the right to send, or returns null.
//
// This function previously relied on INSERT ... SELECT ... WHERE NOT
// EXISTS alone, under a comment asserting that "two concurrent callers
// cannot both succeed". That assertion was false. It is worth stating
// plainly why, because this is the second time the boundedness of this
// same function has been claimed and not held.
//
// At READ COMMITTED - Postgres's default, and what this app runs - an
// uncommitted INSERT in another transaction is invisible to this one. So
// two callers can both evaluate NOT EXISTS as true and both insert.
// Nothing rejects the second: the table carries no unique constraint
// that could, and no constraint can express "at most one within a moving
// time window" anyway.
//
// It survived the J1 fix because the race window is about the duration
// of one INSERT, so eight concurrent calls inside a single process
// almost always serialise by luck, and the in-process test was reliably
// green. Racing twelve separate processes against a shared start instant
// wins the claim 2 to 4 times per round, repeatably. Green test, false
// property.
//
// The lock is what makes it true. It is released by COMMIT or ROLLBACK,
// including the ROLLBACK an abandoned connection gets, so it cannot
// leak. It must be held on the SAME connection as the INSERT and inside
// a real transaction, so this takes its own client rather than using the
// pool's query shorthand.
//
// TRY rather than wait, deliberately. pg_advisory_xact_lock would block
// until the holder commits. This is called fire-and-forget on EVERY
// refused attempt, so under the sustained guessing burst the alert
// exists to report, waiters would pile up and exhaust the connection
// pool - a self-inflicted outage triggered by the attack the control is
// meant to warn about. Failing to take the lock means another claim is
// already in flight, which is precisely the case where this one should
// stand down, so there is nothing to wait for.
//
// The lock is namespaced by a class id rather than by a hashed string
// alone. hashtext maps to a 32-bit integer, and advisory lock space is
// shared by the whole database, so a future subsystem hashing some
// unrelated string could collide with a username and silently suppress
// one account's alerts. Nothing else in this codebase takes an advisory
// lock today; the class id is so that stays safe if something does.
async function claimAlertSlot(db, { username, now, failuresInWindow }) {
  // A pg Client also has .connect(), so that alone does not identify a
  // pool; treating it as one makes this reconnect an live client and
  // throw. totalCount is pool-only.
  const isPool = typeof db.connect === 'function' && typeof db.totalCount === 'number';
  const client = isPool ? await db.connect() : null;
  // Either way q is now a single connection, never the pool's
  // round-robin shorthand. The transaction is therefore unconditional:
  // an advisory lock taken outside one is released the moment its
  // statement ends, which would read as correct and serialise nothing.
  const q = client || db;
  try {
    await q.query('BEGIN');
    const { rows: lock } = await q.query(
      'SELECT pg_try_advisory_xact_lock($1, hashtext($2)) AS held',
      [ALERT_LOCK_CLASS, username]
    );
    if (!lock[0].held) {
      await q.query('ROLLBACK');
      return { id: null, reason: 'another attempt is already deciding or sending for this account' };
    }
    const outcome = await claimAlertSlotLocked(q, { username, now, failuresInWindow });
    // COMMIT either way: a decision not to claim writes nothing, and
    // holding the lock any longer than the decision would serialise
    // unrelated bursts for no benefit.
    await q.query('COMMIT');
    return outcome;
  } catch (err) {
    await q.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (client) client.release();
  }
}

// The claim itself. Assumes the caller holds the lock.
async function claimAlertSlotLocked(db, { username, now, failuresInWindow }) {
  // Read the state the rule needs. Safe to do in three cheap statements
  // rather than one clever one, because the advisory lock above means
  // nothing else can be claiming for this subject while we look.
  const latest = async (eventType) => {
    const { rows } = await db.query(
      `SELECT created_at FROM workspace_activity
        WHERE subject = $1 AND event_type = $2
        ORDER BY created_at DESC LIMIT 1`,
      [username, eventType]
    );
    return rows.length ? rows[0].created_at : null;
  };

  const decision = decideAlert({
    failuresInWindow,
    lastSuccessAt: await latest(ALERT_EVENT),
    lastFailureAt: await latest(ALERT_FAILED_EVENT),
    lastPendingAt: await latest(ALERT_PENDING_EVENT),
    now
  });
  if (!decision.alert) return { id: null, reason: decision.reason };

  const { rows } = await db.query(
    `INSERT INTO workspace_activity (actor, event_type, summary, subject)
     VALUES ('system', $1, 'Security notice claimed for sending; the outcome follows in a later row.', $2)
     RETURNING id`,
    [ALERT_PENDING_EVENT, username]
  );
  return { id: rows[0].id, reason: decision.reason };
}

async function maybeAlertOnFailedUnlock(db, { username, now = Date.now(), sendFn } = {}) {
  let claimId = null;
  try {
    const windowStart = new Date(now - WINDOW_MINUTES * 60000);
    const { rows: failures } = await db.query(
      `SELECT created_at FROM workspace_activity
        WHERE event_type = $1 AND actor = $2 AND created_at >= $3
        ORDER BY created_at`,
      [FAILED_EVENT, username, windowStart]
    );
    // The whole rule - threshold, cooldown, failure backoff and another
    // attempt's claim lease - is applied by decideAlert INSIDE the lock,
    // so there is no cheap pre-check here that could disagree with it
    // (finding K3). This call is the only place the decision is made.
    const claim = await claimAlertSlot(db, { username, now, failuresInWindow: failures.length });
    claimId = claim.id;
    if (claimId === null) {
      return { sent: false, quiet: true, reason: claim.reason };
    }

    const to = alertRecipient();
    const { subject, body } = buildAlert({
      username,
      failures: failures.length,
      windowMinutes: WINDOW_MINUTES,
      firstAt: failures[0].created_at,
      lastAt: failures[failures.length - 1].created_at
    });

    const send = sendFn || defaultSend;
    const result = await send({ to, subject, body });

    // The claim row becomes the outcome row. Only the delivered type
    // consumes the hour (finding H2); a failure keeps its own type and
    // earns the short backoff instead.
    await db.query(
      'UPDATE workspace_activity SET event_type = $1, summary = $2 WHERE id = $3',
      [
        result.sent ? ALERT_EVENT : ALERT_FAILED_EVENT,
        result.sent
          ? `Security notice DELIVERED after ${failures.length} failed unlock attempt(s) against "${username}".`
          : `Security notice FAILED to send after ${failures.length} failed unlock attempt(s) against "${username}": ${result.error}. This did not start the quiet period; the next attempt will retry.`,
        claimId
      ]
    );
    return { ...result, failures: failures.length, to };
  } catch (err) {
    // Finding J3: a failure BEFORE the send used to be logged to the
    // console and written nowhere durable, so a database problem made
    // the alarm silent with no trace on any surface Tom can reach. The
    // register must distinguish "never triggered" from "triggered and
    // could not be evaluated".
    console.error('Workspace unlock alert: failed to evaluate or send:', err.message);
    try {
      if (claimId !== null) {
        await db.query(
          'UPDATE workspace_activity SET event_type = $1, summary = $2 WHERE id = $3',
          [ALERT_FAILED_EVENT, `Security notice could not be completed for "${username}": ${err.message}`, claimId]
        );
      } else {
        await db.query(
          'INSERT INTO workspace_activity (actor, event_type, summary, subject) VALUES ($1,$2,$3,$4)',
          ['system', ALERT_FAILED_EVENT, `Security notice could not be evaluated for "${username}": ${err.message}`, username]
        );
      }
    } catch (inner) {
      // Best effort by definition: if the database is what failed, this
      // will fail too, and the console is all that is left.
      console.error('Workspace unlock alert: could not record the failure either:', inner.message);
    }
    return { sent: false, error: err.message };
  }
}

async function defaultSend({ to, subject, body }) {
  const transport = getTransport();
  if (!transport) {
    return { sent: false, error: 'email is not configured in this environment (GMAIL_APP_PASSWORD is not set), so nothing was sent' };
  }
  try {
    await transport.sendMail({ from: NOTIFY_FROM, to, subject, text: body });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

module.exports = {
  THRESHOLD,
  WINDOW_MINUTES,
  COOLDOWN_MINUTES,
  FAILURE_RETRY_MINUTES,
  ALERT_FIELDS,
  describeAlertConfig,
  ALERT_EVENT,
  ALERT_FAILED_EVENT,
  ALERT_PENDING_EVENT,
  CLAIM_LEASE_MINUTES,
  claimAlertSlot,
  FAILED_EVENT,
  decideAlert,
  buildAlert,
  alertRecipient,
  maybeAlertOnFailedUnlock,
  __setTransportForTests,
  __resetTransportForTests
};
