const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const sanitizeHtml = require('sanitize-html');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const db = require('../db/pool');

const router = express.Router();

const PDF_DIR = path.join(__dirname, '..', 'private', 'pdfs');
const TOKEN_SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
  } catch (err) {
    console.error('Document request error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
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
