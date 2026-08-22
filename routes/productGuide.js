const crypto = require('crypto');
const express = require('express');
const sanitizeHtml = require('sanitize-html');
const nodemailer = require('nodemailer');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const db = require('../db/pool');
const themes = require('../db/themes');
const { getSiteShellData } = require('../lib/navShell');
const { verifyTurnstileToken, SITE_KEY: TURNSTILE_SITE_KEY } = require('../lib/turnstile');
const { QUESTIONS, validateAnswers, buildResult, computeRecommendation } = require('../lib/productGuide');
const { summarizeForTom } = require('../lib/productGuideAI');

const router = express.Router();

// ============================================================
// Arrington Product Guide
//
// Standalone tool, same architectural pattern as the Owner Check tools
// (own routes + own view, not part of the pages/CMS section system).
//
// Two things about this flow are structural requirements from the approved
// brief, not incidental design choices, so they are enforced here rather
// than left to the view:
//
// 1. THE RESULT IS NEVER GATED. POST /api/product-guide/submit returns the
//    full recommendation and takes no name or email at all — the parameter
//    simply does not exist on that route. Contact capture is a separate,
//    later, entirely optional call to POST /api/product-guide/contact. It
//    is not possible to accidentally reintroduce a contact gate without
//    changing the shape of the submit route itself.
//
// 2. THE RECOMMENDATION IS NOT WRITTEN BY AI. computeRecommendation() in
//    lib/productGuide.js is a pure, deterministic function; the AI layer
//    (lib/productGuideAI.js) only runs on the contact route, and only ever
//    produces a private summary for Tom. Nothing a model returns can change
//    which offer a visitor is shown.
//
// The Product Guide is also never a gatekeeper: every offer page, price and
// checkout route remains reachable without completing it. That is a
// property of not adding any guard elsewhere, so there is nothing to
// enforce here beyond not doing it.
// ============================================================

const NOTIFY_FROM = 'tom@arringtonconsultancy.com';
const SITE_ORIGIN = 'https://www.arringtonconsultancy.com';
const transporter = process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: NOTIFY_FROM, pass: process.env.GMAIL_APP_PASSWORD }
    })
  : null;

const plainText = (s, max) => sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim().slice(0, max || 100000);
const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 255;
const isValidToken = (s) => /^[a-f0-9]{48}$/.test(String(s || ''));

// Submitting the guide is free and costs nothing server-side (the
// recommendation is computed in plain code), so this limit exists purely as
// ordinary abuse protection on a public, anonymous endpoint — generous
// enough for a visitor to genuinely run the guide more than once for
// different scenarios.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many requests. Please try again later.' }
});

// Tighter than submit: this is the endpoint that creates a real lead, sends
// email, and is the only path that can trigger a paid AI call.
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many requests. Please try again later.' }
});

// ------------------------------------------------------------
// GET /product-guide — the guide itself. Registered directly (same pattern
// as the other standalone tools) so the form's CSRF token is generated here
// rather than relying on the global res.locals middleware.
// ------------------------------------------------------------
function mountPageRoute(app, generateCsrfToken) {
  app.get('/product-guide', async (req, res, next) => {
    try {
      const { rows: themeRows } = await db.query(
        "SELECT content FROM content WHERE section_key = 'site.theme'"
      );
      const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
      const theme = themes[activeTheme] || themes.dark;
      const { navPages, content, pageContact } = await getSiteShellData();

      res.render('product-guide', {
        theme,
        questions: QUESTIONS,
        csrfToken: generateCsrfToken(req, res),
        navPages,
        content,
        pageContact,
        turnstileSiteKey: TURNSTILE_SITE_KEY,
        ga4Id: process.env.GA4_MEASUREMENT_ID || ''
      });
    } catch (err) {
      next(err);
    }
  });
}

// ------------------------------------------------------------
// POST /api/product-guide/submit
//
// Takes answers only. Deliberately accepts no name, email or phone: the
// brief requires the recommendation to be delivered before any contact
// capture, and the cleanest way to guarantee that is for this route to have
// no way to receive contact details in the first place.
// ------------------------------------------------------------
router.post('/api/product-guide/submit', submitLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    if (plainText(body.website, 200)) {
      // Honeypot — pretend success without storing anything.
      return res.json({ ok: true, resultToken: crypto.randomBytes(24).toString('hex'), result: buildResult(sanitizeAnswers(body.answers)) });
    }

    const answers = sanitizeAnswers(body.answers);
    const check = validateAnswers(answers);
    if (!check.valid) {
      return res.status(400).json({ error: 'Please answer all the questions before continuing.', details: check.errors });
    }

    const result = buildResult(answers);
    const decision = computeRecommendation(answers);
    const resultToken = crypto.randomBytes(24).toString('hex');

    await db.query(
      `INSERT INTO product_guide_submissions
       (result_token, answers, recommendation_id, recommendation_reason, sensitive_topic)
       VALUES ($1, $2::jsonb, $3, $4, $5)`,
      [
        resultToken,
        JSON.stringify(answers),
        decision.recommendationId,
        decision.reason,
        decision.sensitiveTopic || ''
      ]
    );

    res.json({ ok: true, resultToken, result });
  } catch (err) {
    console.error('Product Guide submit error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or contact us at tom@arringtonconsultancy.com.' });
  }
});

// Only the answer fields the question set actually defines are kept, each
// stripped of HTML and length-capped, so nothing else a client sends can
// reach the routing engine or the database.
function sanitizeAnswers(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const q of QUESTIONS) {
    if (q.type === 'text') {
      out[q.id] = plainText(source[q.id], q.maxLength);
    } else {
      out[q.id] = plainText(source[q.id], 60);
    }
  }
  return out;
}

// ------------------------------------------------------------
// POST /api/product-guide/contact
//
// Entirely optional, always after the result has already been shown. This
// is the only route that captures contact details, creates a lead, sends
// email, or runs the AI summary layer.
// ------------------------------------------------------------
router.post('/api/product-guide/contact', contactLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    if (plainText(body.website, 200)) {
      return res.json({ ok: true });
    }

    const token = plainText(body.token, 64);
    const name = plainText(body.name, 200);
    const email = plainText(body.email, 255);
    const wantsContact = body.wantsContact === true;

    if (!isValidToken(token)) {
      return res.status(400).json({ error: 'Invalid request.' });
    }
    if (!name) {
      return res.status(400).json({ error: 'Please give us your name.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const turnstileCheck = await verifyTurnstileToken(plainText(body.turnstileToken, 2000), req.ip);
    if (!turnstileCheck.success) {
      return res.status(400).json({ error: 'Verification failed. Please try again.' });
    }

    const { rows } = await db.query(
      'SELECT * FROM product_guide_submissions WHERE result_token = $1',
      [token]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Result not found.' });
    }
    const submission = rows[0];

    await db.query(
      `UPDATE product_guide_submissions
       SET name = $1, email = $2, contact_requested = $3, contacted_at = NOW()
       WHERE result_token = $4`,
      [name, email, wantsContact, token]
    );

    res.json({ ok: true });

    // Everything below happens after the visitor already has their answer.
    // Fire-and-forget, exactly like routes/leads.js: an email or AI problem
    // must never fail the visitor's request — the DB row is the record.
    finalizeContact(submission, { name, email, wantsContact, token })
      .catch((err) => console.error('Product Guide: finalizeContact failed:', err.message));
  } catch (err) {
    console.error('Product Guide contact error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or contact us at tom@arringtonconsultancy.com.' });
  }
});

async function finalizeContact(submission, { name, email, wantsContact, token }) {
  const answers = submission.answers && typeof submission.answers === 'object' ? submission.answers : {};

  const { mode, data } = await summarizeForTom({
    whatChange: answers.whatChange,
    sixMonths: answers.sixMonths,
    anythingElse: answers.anythingElse
  });

  await db.query(
    'UPDATE product_guide_submissions SET ai_summary = $1, ai_mode = $2 WHERE result_token = $3',
    [data.summary, mode, token]
  ).catch((err) => console.error('Product Guide: could not store AI summary:', err.message));

  const result = buildResult(answers);
  const recommendationLabel = result.recommendation
    ? `${result.recommendation.name}${result.recommendation.pricePence ? ` (£${(result.recommendation.pricePence / 100).toLocaleString('en-GB')})` : ' (£0)'}`
    : submission.recommendation_id;

  db.query(
    `INSERT INTO leads (kind, name, email, message)
     VALUES ('product_guide', $1, $2, $3)`,
    [name, email, `Product Guide completed. Recommended: ${recommendationLabel}. Contact requested: ${wantsContact ? 'Yes' : 'No'}.`]
  ).catch((err) => console.error('Product Guide lead insert failed:', err.message));

  if (!transporter) {
    console.warn('GMAIL_APP_PASSWORD not set — skipping Product Guide notification email.');
    return;
  }

  const answerLines = QUESTIONS.map((q) => {
    const value = answers[q.id];
    if (!value) return null;
    if (q.type === 'choice') {
      const option = q.options.find((o) => o.value === value);
      return `${q.label}: ${option ? option.label : value}`;
    }
    return `${q.label}: ${value}`;
  }).filter(Boolean);

  transporter.sendMail({
    from: NOTIFY_FROM,
    to: NOTIFY_FROM,
    replyTo: email,
    subject: `${wantsContact ? '[CONTACT REQUESTED] ' : ''}Product Guide — ${name} — ${recommendationLabel}`,
    text: [
      `Name: ${name}`,
      `Email: ${email}`,
      `Wants to be contacted: ${wantsContact ? 'Yes' : 'No'}`,
      '',
      `RECOMMENDED: ${recommendationLabel}`,
      `Routing reason (audit): ${submission.recommendation_reason}`,
      submission.sensitive_topic ? `Sensitive topic flagged: ${submission.sensitive_topic}` : null,
      `Response timing: ${result.whatHappensNext}`,
      '',
      `SUMMARY (${mode === 'live' ? 'AI-written' : 'their own words, no AI'})`,
      data.summary,
      '',
      'THEIR ANSWERS',
      ...answerLines
    ].filter(Boolean).join('\n')
  }).catch((err) => console.error('Product Guide notification email failed:', err.message));

  if (wantsContact) {
    transporter.sendMail({
      from: NOTIFY_FROM,
      to: email,
      subject: 'Your Arrington Product Guide recommendation',
      text: [
        `Thanks, ${name}.`,
        '',
        `Based on what you told us, we'd start here: ${recommendationLabel}.`,
        '',
        result.why,
        '',
        result.whatHappensNext,
        '',
        result.recommendation && result.recommendation.path ? `${SITE_ORIGIN}${result.recommendation.path}` : `${SITE_ORIGIN}/where-to-start`,
        '',
        'This is a starting point, not a fixed plan. If anything about it looks wrong, say so and we will tell you honestly.',
        '',
        'Arrington Consultancy',
        'Tom Arrington, Managing Director',
        'tom@arringtonconsultancy.com',
        '01752 477026',
        'www.arringtonconsultancy.com'
      ].join('\n')
    }).catch((err) => console.error('Product Guide visitor email failed:', err.message));
  }
}

module.exports = { router, mountPageRoute };
