const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const sanitizeHtml = require('sanitize-html');
const nodemailer = require('nodemailer');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const db = require('../db/pool');
const { verifyTurnstileToken, turnstileBlocks } = require('../lib/turnstile');
const { parseAttribution, describeAttribution } = require('../lib/leadAttribution');
const { parseHeardAbout, describeHeardAbout } = require('../lib/heardAbout');
const { issueToken, THANK_YOU_PATH } = require('../lib/contactConversion');
const { screenEnquiry } = require('../lib/leadScreening');

const router = express.Router();

const PDF_DIR = path.join(__dirname, '..', 'private', 'pdfs');
const TOKEN_SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Notification email on new leads, sent via Gmail SMTP using an app password
// (tom@arringtonconsultancy.com is Google Workspace, so no third-party email
// service or domain-verification is needed). GMAIL_APP_PASSWORD is optional —
// if unset (e.g. local dev), notifications are skipped with a console warning
// rather than breaking the actual lead submission.
const NOTIFY_FROM = 'tom@arringtonconsultancy.com';
const transporter = process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: NOTIFY_FROM, pass: process.env.GMAIL_APP_PASSWORD }
    })
  : null;

async function getNotifyEmail() {
  try {
    const { rows } = await db.query(`SELECT content FROM content WHERE section_key = 'contact.email'`);
    return (rows[0]?.content || '').trim() || NOTIFY_FROM;
  } catch (err) {
    return NOTIFY_FROM;
  }
}

// Fire-and-forget: never lets an email problem fail the lead submission
// itself, since the database row (visible in the admin panel) is always the
// source of truth. Errors are logged, not thrown.
async function notify({ subject, text, replyTo }) {
  if (!transporter) {
    console.warn('GMAIL_APP_PASSWORD not set — skipping lead notification email.');
    return;
  }
  try {
    const to = await getNotifyEmail();
    await transporter.sendMail({ from: NOTIFY_FROM, to, subject, text, replyTo });
  } catch (err) {
    console.error('Lead notification email failed:', err.message);
  }
}

// Where the visitor's details came from on this submission. Only one
// value is accepted, so a request cannot write arbitrary text into the
// record, and anything unrecognised reads as typed entry rather than as
// a claim we cannot support.
const signupSource = (body) => (body && body.prefillSource === 'google' ? 'google' : '');
// One line for Tom's notification, present only when it is true.
const sourceLine = (src) => (src === 'google' ? 'Signed up using Continue with Google.' : '');

const plainText = (s) => sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();
const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 255;
const isValidDocName = (s) => /^[a-z0-9][a-z0-9_-]*\.pdf$/i.test(s || '');

// Public-facing forms get their own stricter limiter (separate from the
// authenticated-write limiter in server.js) — 10 submissions per hour per IP
// is generous for a real visitor and stingy for a spam script.
const publicFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many requests. Please try again later.' }
});

// The signed download link gets a looser but still-bounded limiter — enough
// headroom for a slow connection retrying a large PDF, tight enough to make
// token brute-forcing impractical within the 15 minute expiry.
const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many requests. Please try again shortly.' }
});

function signToken(doc, expiry) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(`${doc}:${expiry}`).digest('hex');
}

function makeDownloadUrl(doc) {
  const expiry = Date.now() + TOKEN_TTL_MS;
  const sig = signToken(doc, expiry);
  const token = `${expiry}.${sig}`;
  return `/documents/download?doc=${encodeURIComponent(doc)}&token=${encodeURIComponent(token)}`;
}

// POST /api/leads — the footer "tell us what is going on" / booking-request form.
// Honeypot field ('website') is left blank by real visitors; a filled-in value
// means a bot, so we pretend success without touching the database.
router.post('/api/leads', publicFormLimiter, async (req, res) => {
  // Only the form's own script can submit an enquiry: it posts JSON. A
  // form-encoded post is refused and stores nothing (30/09/2026). From
  // 27/09 to 30/09 the form carried method="post" as a fallback for a
  // visitor whose script never ran, and that is exactly the route the
  // contact-form spam tools took: they call form.submit(), which skips the
  // script, so three sales pitches were stored, emailed and sent to
  // /thank-you with a conversion token. Before 27/09 the same tools sent a
  // GET to the page and achieved nothing, which is the behaviour restored.
  if (!req.is('application/json')) {
    return res.status(400).type('text/plain')
      .send('This form needs JavaScript. Please go back and use the email address or phone number on the page instead.');
  }
  try {
    const body = req.body || {};
    if (plainText(body.website)) {
      return res.json({ ok: true });
    }

    const name = plainText(body.name).slice(0, 200);
    const email = plainText(body.email).slice(0, 255);
    const phone = plainText(body.phone).slice(0, 50);
    const message = plainText(body.message).slice(0, 2000);
    const preferredTime = plainText(body.preferred_time).slice(0, 255);

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // Cloudflare Turnstile (added 01/10/2026). The widget injects a hidden
    // cf-turnstile-response field into the form, so the token arrives in the
    // JSON body without the submit script having to handle it. We block only
    // when a supplied token is actively rejected (bot or replay); a missing
    // token or an unverifiable one passes, so a genuine visitor whose widget
    // could not load still gets through to the honeypot and pitch screening
    // below. See lib/turnstile.js turnstileBlocks for the full reasoning.
    const turnstile = await verifyTurnstileToken(plainText(body['cf-turnstile-response']).slice(0, 2000), req.ip);
    if (turnstileBlocks(turnstile)) {
      return res.status(400).json({ error: 'That did not pass our spam check. Please reload the page and try again, or email us directly using the address below.' });
    }

    // A sales pitch is still stored and still emailed (marked), so a real
    // enquiry that reads like one is never lost. What it does NOT get is the
    // conversion token: the visitor sees the same thank-you page, but the
    // Ads conversion never fires. See lib/leadScreening.js.
    const screening = screenEnquiry({ name, preferredTime, message });
    const screenedReason = screening.suspect ? `sales_pitch: ${screening.reasons.join(', ')}` : '';

    const attribution = parseAttribution(body.attribution);
    // Optional, so an unanswered question is '' and never blocks the
    // submission. The option id is allowlisted and the free text is kept
    // only alongside Other; see lib/heardAbout.js.
    const { heardAbout, heardAboutOther } = parseHeardAbout(body);
    await db.query(
      `INSERT INTO leads (kind, name, email, phone, message, preferred_time, signup_source, attribution, heard_about, heard_about_other, screened_reason)
       VALUES ('contact', $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
      [name, email, phone, message, preferredTime, signupSource(req.body), JSON.stringify(attribution), heardAbout, heardAboutOther, screenedReason]
    );

    // Issued only here, after the row is stored, and only for an enquiry
    // that was not screened as a pitch, so /thank-you fires the Ads
    // conversion for a real enquiry and nothing else. The honeypot answer
    // above carries no token either. See lib/contactConversion.js.
    const thankYou = screening.suspect ? THANK_YOU_PATH : `${THANK_YOU_PATH}?c=${issueToken()}`;
    res.json({ ok: true, thankYou });

    const heardAboutLine = describeHeardAbout(heardAbout, heardAboutOther);
    notify({
      subject: screening.suspect
        ? `Filtered as a sales pitch: ${name}`
        : `New website enquiry from ${name}`,
      text: [
        screening.suspect && `This looks like a sales pitch, so it was NOT counted as a Google Ads conversion. It is stored in the admin Leads panel. If it is a genuine enquiry, just reply as normal. (Signals: ${screening.reasons.join(', ')})`,
        `Name: ${name}`,
        `Email: ${email}`,
        phone && `Phone: ${phone}`,
        preferredTime && `Preferred time: ${preferredTime}`,
        // What the visitor SAYS, kept beside what the browser observed
        // below it. They can legitimately differ.
        heardAboutLine && `How they heard about us: ${heardAboutLine}`,
        sourceLine(signupSource(req.body)),
        ...describeAttribution(attribution),
        message && `Message:\n${message}`
      ].filter(Boolean).join('\n\n'),
      replyTo: email
    });
  } catch (err) {
    console.error('Lead submission error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong. Please try again or email us directly.' });
  }
});

// POST /api/documents/request — email-gate for the case-study PDFs. Records
// the request as a lead, then hands back a short-lived signed download link
// rather than the file itself, so the link can't be bookmarked/shared.
router.post('/api/documents/request', publicFormLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    if (plainText(body.website)) {
      return res.json({ ok: true });
    }

    const email = plainText(body.email).slice(0, 255);
    const doc = plainText(body.doc).slice(0, 100);

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!isValidDocName(doc) || !fs.existsSync(path.join(PDF_DIR, doc))) {
      return res.status(400).json({ error: 'Unknown document.' });
    }

    const attribution = parseAttribution(body.attribution);
    await db.query(
      `INSERT INTO leads (kind, email, document, signup_source, attribution) VALUES ('pdf_download', $1, $2, $3, $4::jsonb)`,
      [email, doc, signupSource(req.body), JSON.stringify(attribution)]
    );

    res.json({ ok: true, url: makeDownloadUrl(doc) });

    notify({
      subject: `PDF download request: ${doc}`,
      text: [`Email: ${email}`, `Document: ${doc}`, sourceLine(signupSource(req.body)), ...describeAttribution(attribution)].filter(Boolean).join('\n'),
      replyTo: email
    });
  } catch (err) {
    console.error('Document request error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

const VALID_BANDS = ['Low dependency', 'Emerging dependency', 'Significant dependency', 'High dependency'];
const QUIZ_URL = 'https://www.arringtonconsultancy.com/owner-dependency-quiz';

async function getContactDetails() {
  try {
    const { rows } = await db.query(
      `SELECT section_key, content FROM content WHERE section_key IN ('contact.email', 'contact.phone')`
    );
    const map = {};
    rows.forEach((r) => { map[r.section_key] = (r.content || '').trim(); });
    return map;
  } catch (err) {
    return {};
  }
}

// The completion id the browser sends with /api/quiz/complete-notify. It is
// minted client-side when the verification screen is shown, so one quiz
// completion has exactly one id however many requests it produces. Any
// other shape (absent, wrong length, non-hex) is treated as "no id" and a
// server-derived key is used instead, so a page cached from before the id
// existed still gets one notification rather than none or many.
const COMPLETION_ID_RE = /^[a-f0-9]{32}$/;
function completionKey(body, req, resultsText) {
  const supplied = String((body && body.completionId) || '').toLowerCase();
  if (COMPLETION_ID_RE.test(supplied)) return supplied;
  // Fallback for a stale page: the same visitor sending the same result in
  // the same hour is one completion. Not a privacy record (the ip is hashed
  // with the text, never stored), and never reached by the current page.
  const hour = Math.floor(Date.now() / (60 * 60 * 1000));
  return 'derived-' + crypto.createHash('sha256').update(`${req.ip}|${hour}|${resultsText}`).digest('hex').slice(0, 48);
}

// Claims the completion. Returns true if THIS request owns it, false if an
// earlier request already did. The primary key on quiz_completions is the
// whole mechanism: two requests racing for the same id cannot both insert,
// whatever order they arrive in, so the decision is the database's and not
// the browser's.
async function claimQuizCompletion(key, score, band) {
  const { rows } = await db.query(
    `INSERT INTO quiz_completions (completion_id, score, band) VALUES ($1, $2, $3)
     ON CONFLICT (completion_id) DO NOTHING RETURNING completion_id`,
    [key, score, band]
  );
  return rows.length === 1;
}

// POST /api/quiz/complete-notify — the Owner Dependency Quiz's one and only
// owner-notification trigger. Called by the browser the moment a visitor
// finishes the quiz (before the separate, optional "email me my results"
// choice below). It does not depend on the visitor supplying any contact
// details — the quiz never asks for a name or email until after a result
// exists, so this always reports them as not provided.
//
// ONE EMAIL PER COMPLETION, decided here and not in the browser (Tom,
// 03/10/2026, after a single test journey flooded his inbox). Until that
// date the browser called this route from the Turnstile callback, and the
// callback fires every time the widget issues a token, including its own
// background refresh of an expired one a few minutes later, so one
// completion could produce several valid requests, each passing
// verification with a fresh token and each sending an email. Now every
// request carries a completion id; the first request to claim the id in
// quiz_completions writes the lead and sends the email, and every later
// request for the same id (a refreshed token, a repeated fetch, a retry) is
// answered ok with nothing stored and nothing sent. Turnstile stays as the
// second layer: an exact replay of a spent token is refused by Cloudflare
// before the claim is even attempted, and a failed verification never
// consumes the id, so a genuine retry after a verification hiccup still
// gets its one notification.
//
// /api/quiz/email-results below deliberately does not email Tom (see its
// own comment), and share/copy clicks no longer reach the server at all, so
// a visitor who finishes the quiz, requests a copy and shares it three times
// generates exactly one owner notification.
router.post('/api/quiz/complete-notify', publicFormLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    if (plainText(body.website)) {
      return res.json({ ok: true });
    }

    const band = plainText(body.band).slice(0, 60);
    const resultsText = plainText(body.resultsText).slice(0, 3000);
    const score = Number(body.score);

    if (!Number.isInteger(score) || score < 0 || score > 16) {
      return res.status(400).json({ error: 'Invalid result data.' });
    }
    if (!VALID_BANDS.includes(band)) {
      return res.status(400).json({ error: 'Invalid result data.' });
    }
    if (!resultsText) {
      return res.status(400).json({ error: 'Invalid result data.' });
    }

    // Human verification — this is the quiz's one and only completion
    // trigger (see the comment above), so it is also the one point that
    // gates the owner notification. A missing or invalid token blocks the
    // lead insert and the notification outright; nothing else about the
    // quiz (scoring, the results screen itself) depends on this check.
    const turnstileCheck = await verifyTurnstileToken(plainText(body.turnstileToken).slice(0, 2000), req.ip);
    if (!turnstileCheck.success) {
      return res.status(400).json({ error: 'Verification failed. Please try again.' });
    }

    // Server-authoritative de-duplication (see the route comment). Claimed
    // only after verification so a failed attempt cannot burn the id.
    const key = completionKey(body, req, resultsText);
    const claimed = await claimQuizCompletion(key, score, band);
    if (!claimed) {
      // Logged (id and score only, never the text) so a duplicate on
      // production is visible in the deploy log without a mailbox.
      console.log(`Quiz completion ${key.slice(0, 12)}: duplicate request ignored, no notification sent`);
      return res.json({ ok: true, duplicate: true });
    }

    await db.query(
      `INSERT INTO leads (kind, name, email, message) VALUES ('quiz_results', '', '', $1)`,
      [resultsText]
    );

    res.json({ ok: true });

    console.log(`Quiz completion ${key.slice(0, 12)}: ${score}/16, one notification sent`);
    notify({
      subject: `Owner Dependency Quiz completed — ${score}/16 (${band})`,
      text: [
        'Name: Not provided',
        'Email: Not provided',
        'Phone: Not provided',
        '',
        'Assessment: Owner Dependency Quiz',
        'Page: /owner-dependency-quiz',
        `Completed: ${new Date().toISOString()}`,
        `Score: ${score}/16 (${band})`,
        '',
        resultsText
      ].join('\n')
    });
  } catch (err) {
    console.error('Quiz complete-notify error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /api/quiz/email-results — optional, visitor-initiated: emails the
// requester their own Owner Dependency Quiz result. Fully separate from
// showing the result itself (which never requires an email) and not tied to
// social sharing. Still reuses the leads table with kind='quiz_results' so
// the request itself is visible in the admin panel, but deliberately does
// NOT notify Tom any more (see /api/quiz/complete-notify above) — the owner
// notification for this completion has already gone out the moment the
// result was shown, so notifying again here would be a duplicate for the
// same completed assessment. This route's only remaining job is the visitor
// transactional email: a one-off copy sent to their own address, no mailing
// list, no consent wording, since it only fulfils their own request.
router.post('/api/quiz/email-results', publicFormLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    if (plainText(body.website)) {
      return res.json({ ok: true });
    }

    const email = plainText(body.email).slice(0, 255);
    const band = plainText(body.band).slice(0, 60);
    const resultsText = plainText(body.resultsText).slice(0, 3000);
    const score = Number(body.score);

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!Number.isInteger(score) || score < 0 || score > 16) {
      return res.status(400).json({ error: 'Invalid result data.' });
    }
    if (!VALID_BANDS.includes(band)) {
      return res.status(400).json({ error: 'Invalid result data.' });
    }
    if (!resultsText) {
      return res.status(400).json({ error: 'Invalid result data.' });
    }

    await db.query(
      `INSERT INTO leads (kind, email, message, signup_source, attribution) VALUES ('quiz_results', $1, $2, $3, $4::jsonb)`,
      [email, resultsText, signupSource(req.body), JSON.stringify(parseAttribution(body.attribution))]
    );

    res.json({ ok: true });

    if (transporter) {
      const contact = await getContactDetails();
      const contactLines = [
        contact['contact.email'] && `Email: ${contact['contact.email']}`,
        contact['contact.phone'] && `Phone: ${contact['contact.phone']}`
      ].filter(Boolean).join('\n');

      transporter.sendMail({
        from: NOTIFY_FROM,
        to: email,
        subject: 'Your Owner Dependency Quiz result',
        text: [
          'Thanks for completing the Owner Dependency Quiz. Here is a copy of your result.',
          resultsText,
          `Retake or share the quiz: ${QUIZ_URL}`,
          contactLines && `Arrington Consultancy\n${contactLines}`
        ].filter(Boolean).join('\n\n')
      }).catch((err) => console.error('Quiz result visitor email failed:', err.message));
    }
  } catch (err) {
    console.error('Quiz email-results error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// There is deliberately no /api/quiz/share-notify any more (03/10/2026).
// Until then every Share on LinkedIn, Share on Facebook, Share on X, Copy
// result text and Copy quiz link click emailed Tom, by design, so one
// visitor trying the buttons produced a string of separate emails about
// the same result. Share and copy clicks are engagement, not completions:
// they stay recorded as the GA4 event dependency_quiz_share (with the
// platform) in views/owner-dependency-quiz.ejs, and generate no email.

// GET /documents/download — serves a gated PDF only with a valid, unexpired
// signed token from the request above. The files live outside public/ so
// this route is the only way to reach them.
router.get('/documents/download', downloadLimiter, (req, res) => {
  const doc = String(req.query.doc || '');
  const token = String(req.query.token || '');
  const dotIdx = token.indexOf('.');

  if (!isValidDocName(doc) || dotIdx <= 0) {
    return res.status(403).send('Link invalid or expired.');
  }

  const expiry = parseInt(token.slice(0, dotIdx), 10);
  const sig = token.slice(dotIdx + 1);
  if (!Number.isFinite(expiry) || Date.now() > expiry) {
    return res.status(403).send('Link invalid or expired.');
  }

  const expected = signToken(doc, expiry);
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return res.status(403).send('Link invalid or expired.');
  }

  const filePath = path.join(PDF_DIR, doc);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Not found.');
  }

  res.setHeader('Content-Disposition', `attachment; filename="${doc}"`);
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filePath);
});

module.exports = router;
