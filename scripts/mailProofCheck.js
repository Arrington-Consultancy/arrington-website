// One-shot production proof that outbound mail actually works.
//
// Written because "the variable has been updated" and "the send function
// was called" are both a long way short of "Gmail accepted this message",
// and only the third one is worth telling somebody. It runs inside the
// real container, against the real credential, through the SAME transports
// the website and the Scott demonstration use, and it prints what the mail
// server actually said.
//
// It also reports what the leads table holds, because notifications were
// failing silently and the commercially important question is not whether
// mail works now but what arrived while it did not.
//
// Armed by MAIL_PROOF_CHECK=<label>. Marker-guarded on that label in
// audit_log, so a redeploy cannot re-run the same check and a deliberate
// re-run just needs a new label. Never throws: this is called at boot and
// a diagnostic must not be able to stop the app starting.
//
// PRIVACY. The leads summary prints kinds, dates and document names. It
// does NOT print names, email addresses, phone numbers or message bodies:
// those are real people's details and a deploy log is the wrong place for
// them. The admin panel already shows the full record to an authorised
// human, which is where that belongs.

const nodemailer = require('nodemailer');

const MARKER_ACTION = 'mail_proof_check';
const NOTIFY_FROM = 'tom@arringtonconsultancy.com';

function recipient() {
  return process.env.SCOTT_DEMO_NOTIFY_EMAIL || NOTIFY_FROM;
}

// Built exactly as routes/leads.js builds its own, so this proves the path
// the website's lead notifications actually take rather than a lookalike.
function leadsStyleTransport() {
  if (!process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: NOTIFY_FROM, pass: process.env.GMAIL_APP_PASSWORD }
  });
}

// What the server said, not what we hoped. nodemailer returns the raw SMTP
// response plus the recipients it accepted and rejected; all three are
// reported, because an accepted transaction with an empty accepted list is
// a delivery that will not happen.
function describeSendResult(info) {
  if (!info) return 'no result object returned';
  const accepted = Array.isArray(info.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info.rejected) ? info.rejected : [];
  return [
    `smtp response: ${String(info.response || 'none').trim()}`,
    `accepted: ${accepted.length ? accepted.join(', ') : 'NONE'}`,
    rejected.length ? `REJECTED: ${rejected.join(', ')}` : 'rejected: none',
    info.messageId ? `messageId: ${info.messageId}` : 'messageId: none'
  ].join(' | ');
}

async function proveTransport(label, transport, to) {
  if (!transport) return `${label}: NOT CONFIGURED (GMAIL_APP_PASSWORD is not set), nothing attempted`;
  const lines = [];
  // verify() performs a real login against Gmail. This is the step that
  // was failing with 535-5.7.8, so it is checked separately from the send:
  // "authenticated" and "delivered" are different facts.
  try {
    await transport.verify();
    lines.push(`${label}: AUTHENTICATED to Gmail`);
  } catch (err) {
    return `${label}: AUTHENTICATION FAILED, ${err.message}`;
  }
  try {
    const info = await transport.sendMail({
      from: NOTIFY_FROM,
      to,
      subject: `Mail path proof (${label})`,
      text: [
        `This is an automated check that outbound mail works from the running production app.`,
        `Path under test: ${label}.`,
        `Sent at ${new Date().toISOString()}.`,
        '',
        'If you have this, that path is genuinely delivering. No action needed.'
      ].join('\n')
    });
    lines.push(`${label}: SENT, ${describeSendResult(info)}`);
  } catch (err) {
    lines.push(`${label}: SEND FAILED after authenticating, ${err.message}`);
  }
  return lines.join('\n  ');
}

// What was stored while nobody was being told about it. Counts, kinds and
// dates only.
async function summariseLeads(db) {
  const out = [];
  try {
    const { rows: totals } = await db.query(
      `SELECT kind, COUNT(*)::int AS n, MIN(created_at) AS earliest, MAX(created_at) AS latest
         FROM leads GROUP BY kind ORDER BY kind`
    );
    if (!totals.length) {
      out.push('leads table: empty, nothing was missed');
    } else {
      totals.forEach((r) => {
        out.push(`leads[${r.kind}]: ${r.n} row(s), ${new Date(r.earliest).toISOString()} to ${new Date(r.latest).toISOString()}`);
      });
    }
    // The recent ones individually, since those are the ones that could
    // still be actionable. Document name included (not personal), contact
    // details deliberately not.
    const { rows: recent } = await db.query(
      `SELECT id, kind, document, created_at FROM leads
        WHERE created_at > NOW() - INTERVAL '60 days'
        ORDER BY created_at DESC LIMIT 40`
    );
    out.push(`leads in the last 60 days: ${recent.length}`);
    recent.forEach((r) => {
      out.push(`  #${r.id} ${r.kind}${r.document ? ` (${r.document})` : ''} ${new Date(r.created_at).toISOString()}`);
    });
  } catch (err) {
    out.push(`leads summary FAILED: ${err.message}`);
  }
  return out.join('\n');
}

async function runMailProofCheck(db) {
  const label = process.env.MAIL_PROOF_CHECK;
  if (!label) return;
  try {
    const { rows: already } = await db.query(
      `SELECT 1 FROM audit_log WHERE action = $1 AND detail = $2 LIMIT 1`,
      [MARKER_ACTION, label]
    );
    if (already.length) {
      console.log(`Mail proof check: label "${label}" has already run, skipping.`);
      return;
    }

    const to = recipient();
    console.log(`Mail proof check [${label}]: starting, sending to ${to}`);

    // Both paths, because they are separate transport objects that happen
    // to read the same variable. gapNotifier carries the Scott login alert
    // and the evolution briefing; the leads-style one is what the website's
    // contact form, gated PDF requests and quiz results use.
    const gapNotifier = require('../lib/scott/gapNotifier');
    const scottTransport = gapNotifier.__transportForProof
      ? gapNotifier.__transportForProof()
      : null;

    const results = [];
    results.push(await proveTransport('scott notifications (gapNotifier)', scottTransport, to));
    results.push(await proveTransport('website leads (routes/leads.js shape)', leadsStyleTransport(), to));
    console.log(`Mail proof check [${label}] RESULTS:\n  ${results.join('\n  ')}`);

    const leads = await summariseLeads(db);
    console.log(`Mail proof check [${label}] LEADS HELD:\n${leads}`);

    await db.query(
      `INSERT INTO audit_log (user_id, action, detail) VALUES (NULL, $1, $2)`,
      [MARKER_ACTION, label]
    );
  } catch (err) {
    // Reported, never fatal. A diagnostic that can stop the app booting is
    // worse than the problem it diagnoses.
    console.error(`Mail proof check [${label}] could not complete: ${err.message}`);
  }
}

module.exports = { runMailProofCheck, describeSendResult };
