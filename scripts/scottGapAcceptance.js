// Scott AI Demonstration: one-shot Brain Gap acceptance check.
//
// Proves the notification chain end to end THROUGH THE REAL APPLICATION,
// in whatever environment it runs: the real planGap decision, a real row
// in scott_brain_gaps, a REAL SMTP send over the authorised Gmail path,
// and the delivery result recorded honestly on the row. Nothing is
// mocked and nothing is asserted that did not happen: if the send fails,
// the check reports the failure loudly and the row says nobody was
// emailed. It deliberately does NOT fail the process: the start command
// chains seed into the server, and a mail hiccup must not stop the whole
// application booting. The pass/fail verdict lives in the log line and
// on the row itself, which is where the honest record belongs anyway.
//
// It deliberately does NOT involve a model call. The AI half of the loop
// (a worker deciding to raise a gap) is covered by the scripted-model
// integration tests and, when the spend is authorised, by the live
// pressure suite. What this check exists to prove is the half that only
// a real environment can prove: that the configured mailbox genuinely
// accepts the message and that the register records the truth about it.
//
// Runs only when RUN_GAP_ACCEPTANCE_CHECK=true, and at most once per
// database (guarded on its own marker), so leaving the variable set
// cannot generate a drip of emails on every deploy. The gap row is left
// OPEN on /scott/gaps on purpose: seeing it in the register, with the
// recorded delivery sentence, and closing it through the UI is the
// second half of the demonstration.

const MARKER = 'ACCEPTANCE CHECK 2026-08-29:';

async function runGapAcceptanceCheck(db) {
  if (process.env.RUN_GAP_ACCEPTANCE_CHECK !== 'true') return;

  const { rows: existing } = await db.query(
    'SELECT id, email_status, email_to, email_attempts FROM scott_brain_gaps WHERE missing_evidence LIKE $1',
    [`${MARKER}%`]
  );
  if (existing.length) {
    console.log(`Gap acceptance check: already ran (gap ${existing[0].id}, email_status '${existing[0].email_status}', ${existing[0].email_attempts} attempt(s) to ${existing[0].email_to}). Remove RUN_GAP_ACCEPTANCE_CHECK.`);
    return;
  }

  const brainGaps = require('../lib/scott/brainGaps');
  const repo = require('../lib/scott/data/repository');
  const { sendGapNotification } = require('../lib/scott/gapNotifier');

  // The same shape a worker would raise: the yarn contradiction, owned by
  // Leah Morgan with the hire-style decision sitting with Tony Marsh.
  // The text says plainly what it is, because this email reaches a real
  // inbox and must not read as a real business event.
  const plan = brainGaps.planGap({
    type: 'conflicting',
    missing: `${MARKER} the cream yarn on-hand count and the purchase order disagree. This is a deliberate end-to-end check of the Brain Gap notification chain, not a real record fault.`,
    whyItMatters: 'Proving that a routed gap genuinely reaches the responsible person by email, and that the register records exactly what happened.',
    domain: 'yarn_stock',
    workCanContinue: false
  }, { askerPersonaId: 'chloe_reed', raisedByWorkerId: 'operations' });

  if (!plan || !plan.shouldEmail) {
    console.error('Gap acceptance check FAILED: the plan did not route to an email, which contradicts the tested engine.');
    return;
  }

  let record = await repo.createBrainGap({ ...plan, conversationId: null });
  console.log(`Gap acceptance check: created gap ${record.id}, responsible ${record.responsible_name}, status '${record.status}', email_status '${record.email_status}'.`);

  const portalUrl = `${process.env.SCOTT_PORTAL_ORIGIN || 'https://www.arringtonconsultancy.com'}/scott/gaps`;
  const result = await sendGapNotification(plan, { portalUrl });
  record = (await repo.recordGapDelivery(record.id, result)) || record;

  console.log(`Gap acceptance check: send result '${result.emailStatus}' after ${result.attempts} attempt(s) to ${result.emailTo}${result.error ? `; error: ${result.error}` : ''}.`);
  console.log(`Gap acceptance check: recorded on gap ${record.id}: status '${record.status}', email_status '${record.email_status}', emailed_at ${record.emailed_at ? record.emailed_at.toISOString() : 'null'}.`);
  console.log(`Gap acceptance check: the register will say: "${brainGaps.describeNotification(record)}"`);

  if (record.email_status !== 'sent') {
    console.error('Gap acceptance check FAILED: the send did not succeed and the register says so honestly. Nothing claimed a delivery that did not happen.');
    return;
  }
  console.log('Gap acceptance check PASSED: a real email was accepted by the mail server and the row records it. The gap is left open on /scott/gaps for a human to close through the UI.');
}

module.exports = { runGapAcceptanceCheck, MARKER };
