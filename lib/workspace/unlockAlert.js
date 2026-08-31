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
// 2. It is BOUNDED. One alert per cooldown window, no matter how many
//    attempts arrive. A guessing loop must not become a mail flood, which
//    would be a denial-of-service against Tom's inbox delivered by his
//    own security control.
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

const ALERT_EVENT = 'workspace_unlock_alert_sent';
const FAILED_EVENT = 'workspace_unlock_failed';

const NOTIFY_FROM = 'tom@arringtonconsultancy.com';

// The configured owner/admin address. An explicit variable first, so a
// security alert can be routed somewhere other than the address printed
// on the public website; then the site's own contact address; then the
// hard default. Never a fictional or derived address: a bounced security
// alert is worse than none, because it looks sent.
async function alertRecipient(db) {
  const explicit = (process.env.WORKSPACE_ALERT_EMAIL || '').trim();
  if (explicit) return explicit;
  try {
    const { rows } = await db.query("SELECT content FROM content WHERE section_key = 'contact.email'");
    const configured = (rows[0] && rows[0].content || '').trim();
    if (configured) return configured;
  } catch (err) {
    console.error('Workspace unlock alert: could not read the configured contact address:', err.message);
  }
  return NOTIFY_FROM;
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
function decideAlert({ failuresInWindow, lastAlertAt, now, threshold = THRESHOLD, cooldownMinutes = COOLDOWN_MINUTES }) {
  if (failuresInWindow < threshold) {
    return { alert: false, reason: `${failuresInWindow} failure(s) in the window, threshold is ${threshold}` };
  }
  if (lastAlertAt) {
    const minutesSince = (now - new Date(lastAlertAt).getTime()) / 60000;
    if (minutesSince < cooldownMinutes) {
      return { alert: false, reason: `an alert was already sent ${Math.floor(minutesSince)} minute(s) ago; cooldown is ${cooldownMinutes}` };
    }
  }
  return { alert: true, reason: `${failuresInWindow} failed unlock attempt(s) within ${WINDOW_MINUTES} minutes` };
}

// The message. Deliberately dull and deliberately empty of anything the
// recipient could not already know: it exists to make a person look, not
// to tell them what is inside.
//
// A test asserts that no passphrase, guessed value or workspace content
// can reach this text, and the way that is guaranteed is that none of
// those things is a parameter.
function buildAlert({ username, failures, windowMinutes, firstAt, lastAt }) {
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
async function maybeAlertOnFailedUnlock(db, { username, now = Date.now(), sendFn } = {}) {
  try {
    const windowStart = new Date(now - WINDOW_MINUTES * 60000);
    const { rows: failures } = await db.query(
      `SELECT created_at FROM workspace_activity
        WHERE event_type = $1 AND actor = $2 AND created_at >= $3
        ORDER BY created_at`,
      [FAILED_EVENT, username, windowStart]
    );
    const { rows: alerts } = await db.query(
      `SELECT created_at FROM workspace_activity
        WHERE event_type = $1 ORDER BY created_at DESC LIMIT 1`,
      [ALERT_EVENT]
    );

    const decision = decideAlert({
      failuresInWindow: failures.length,
      lastAlertAt: alerts.length ? alerts[0].created_at : null,
      now
    });
    if (!decision.alert) return { sent: false, quiet: true, reason: decision.reason };

    const to = await alertRecipient(db);
    const { subject, body } = buildAlert({
      username,
      failures: failures.length,
      windowMinutes: WINDOW_MINUTES,
      firstAt: failures[0].created_at,
      lastAt: failures[failures.length - 1].created_at
    });

    const send = sendFn || defaultSend;
    const result = await send({ to, subject, body });

    // Recorded either way, and the row says which. A row claiming a send
    // that failed would be the same dishonesty the gap notifier was
    // built to prevent.
    await db.query(
      'INSERT INTO workspace_activity (actor, event_type, summary) VALUES ($1, $2, $3)',
      ['system', ALERT_EVENT, result.sent
        ? `Security notice sent to the configured address after ${failures.length} failed unlock attempt(s) against "${username}".`
        : `Security notice could NOT be sent after ${failures.length} failed unlock attempt(s) against "${username}": ${result.error}`]
    );
    return { ...result, failures: failures.length, to };
  } catch (err) {
    // The alert failing must never take the refusal down with it.
    console.error('Workspace unlock alert: failed to evaluate or send:', err.message);
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
  ALERT_EVENT,
  FAILED_EVENT,
  decideAlert,
  buildAlert,
  alertRecipient,
  maybeAlertOnFailedUnlock,
  __setTransportForTests,
  __resetTransportForTests
};
