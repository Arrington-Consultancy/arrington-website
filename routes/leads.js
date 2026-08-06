const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const sanitizeHtml = require('sanitize-html');
const nodemailer = require('nodemailer');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const db = require('../db/pool');
const { verifyTurnstileToken } = require('../lib/turnstile');

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

// Share/copy clicks are anonymous, low-friction and can happen several times
// in a single session (someone might click all three platforms plus both
// copy buttons while deciding). Kept on its own limiter, separate from
// publicFormLimiter, so a curious visitor clicking around can't burn the
// budget meant for genuine leads (contact form, PDF requests, email-results).
const shareNotifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many requests.' }
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

    await db.query(
      `INSERT INTO leads (kind, name, email, phone, message, preferred_time)
       VALUES ('contact', $1, $2, $3, $4, $5)`,
      [name, email, phone, message, preferredTime]
    );

    res.json({ ok: true });

    notify({
      subject: `New website enquiry from ${name}`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        phone && `Phone: ${phone}`,
        preferredTime && `Preferred time: ${preferredTime}`,
        message && `Message:\n${message}`
      ].filter(Boolean).join('\n\n'),
      replyTo: email
    });
  } catch (err) {
    console.error('Lead submission error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or email us directly.' });
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

    await db.query(
      `INSERT INTO leads (kind, email, document) VALUES ('pdf_download', $1, $2)`,
      [email, doc]
    );

    res.json({ ok: true, url: makeDownloadUrl(doc) });

    notify({
      subject: `PDF download request: ${doc}`,
      text: `Email: ${email}\nDocument: ${doc}`,
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

// POST /api/quiz/complete-notify — fires exactly once, the moment a visitor
// finishes the Owner Dependency Quiz (before they've been offered the
// separate, optional "email me my results" choice below). This is the
// quiz's one and only owner-notification trigger, and it does not depend on
// the visitor supplying any contact details — the quiz never asks for a
// name or email until after a result exists, so this always reports them as
// not provided. /api/quiz/email-results below deliberately no longer emails
// Tom itself (see its own comment), so a visitor who both finishes the quiz
// and requests a copy of their result still only ever generates the one
// owner notification from this route, not two.
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

    await db.query(
      `INSERT INTO leads (kind, name, email, message) VALUES ('quiz_results', '', '', $1)`,
      [resultsText]
    );

    res.json({ ok: true });

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
      `INSERT INTO leads (kind, email, message) VALUES ('quiz_results', $1, $2)`,
      [email, resultsText]
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

const VALID_SHARE_PLATFORMS = ['linkedin', 'facebook', 'x', 'copy_text', 'copy_link'];
const SHARE_PLATFORM_LABELS = {
  linkedin: 'Share on LinkedIn',
  facebook: 'Share on Facebook',
  x: 'Share on X',
  copy_text: 'Copy result text',
  copy_link: 'Copy quiz link'
};

// POST /api/quiz/share-notify — fire-and-forget owner heads-up when a
// visitor clicks a share/copy action on the results page. Sharing stays
// anonymous by design (no email collected), so this never touches the leads
// table — there's no visitor identity to record, just a live notification
// so the owner knows the tool is being shared.
router.post('/api/quiz/share-notify', shareNotifyLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const platform = plainText(body.platform).slice(0, 30);
    const band = plainText(body.band).slice(0, 60);
    const score = Number(body.score);

    if (!VALID_SHARE_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'Invalid data.' });
    }
    if (!Number.isInteger(score) || score < 0 || score > 16) {
      return res.status(400).json({ error: 'Invalid data.' });
    }
    if (!VALID_BANDS.includes(band)) {
      return res.status(400).json({ error: 'Invalid data.' });
    }

    res.json({ ok: true });

    notify({
      subject: `Owner Dependency Quiz — ${SHARE_PLATFORM_LABELS[platform]}`,
      text: `Someone clicked "${SHARE_PLATFORM_LABELS[platform]}" on the Owner Dependency Quiz.\n\nScore: ${score}/16 (${band})`
    });
  } catch (err) {
    console.error('Share-notify error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

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
