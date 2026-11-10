// POST /api/office-notice: the Abacus office (a separate service, its own
// database) tells Tom when a watched person signs in and what they did on
// their visit (Tom, 10 November 2026: "I want to know when he is in and what
// he does"). The office has no email account of its own, so it asks this
// site to send the notice through the transport the site already uses for
// Tom's guest alerts (lib/scott/gapNotifier.js sendNotice): same sender,
// same fixed recipient. Nobody can choose who it goes to.
//
// Only a request carrying OFFICE_NOTICE_KEY (32 characters or more, shared
// with the office through a Railway reference variable) is accepted;
// anything else gets a bare 404, so the route does not announce itself.
// Mounted ahead of the CSRF middleware in server.js: the caller is a
// server, not a browser, and the key is its proof.
const crypto = require('crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { sendNotice } = require('../lib/scott/gapNotifier');

const router = express.Router();

function noticeKey(env = process.env) {
  const k = String(env.OFFICE_NOTICE_KEY ?? '').trim();
  return k.length >= 32 ? k : '';
}

function describeOfficeNotices(env = process.env) {
  const raw = String(env.OFFICE_NOTICE_KEY ?? '').trim();
  if (!raw) return 'Office notices: off (OFFICE_NOTICE_KEY not set)';
  if (!noticeKey(env)) return `Office notices: off (OFFICE_NOTICE_KEY is ${raw.length} chars, needs 32 or more)`;
  return `Office notices: on (key ${raw.length} chars); the Abacus office can email Tom about visits`;
}

function sameKey(given, key) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// One line for a subject, plain text with line breaks for the body: no
// control characters, capped.
const oneLine = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const block = (s, n) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n);

const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 60, standardHeaders: false, legacyHeaders: false, handler: (req, res) => res.status(429).json({ ok: false }) });

router.post('/api/office-notice', limiter, express.json({ limit: '32kb' }), async (req, res) => {
  const key = noticeKey();
  if (!key || !sameKey(req.get('x-office-notice-key'), key)) return res.status(404).type('text/plain').send('Not found');
  const subject = oneLine(req.body && req.body.subject, 160);
  const text = block(req.body && req.body.text, 8000);
  if (!subject || !text) return res.status(400).json({ ok: false, reason: 'subject and text are needed' });
  const r = await sendNotice({ subject: `Abacus office: ${subject}`, text });
  res.status(r.sent ? 200 : 502).json({ ok: Boolean(r.sent), reason: r.sent ? undefined : r.reason });
});

module.exports = router;
module.exports.describeOfficeNotices = describeOfficeNotices;
module.exports.noticeKey = noticeKey;
