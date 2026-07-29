const crypto = require('crypto');
const express = require('express');
const sanitizeHtml = require('sanitize-html');
const nodemailer = require('nodemailer');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const db = require('../db/pool');
const themes = require('../db/themes');
const { selectNextStep, firstQuestion, MIN_QUESTIONS, MAX_QUESTIONS } = require('../lib/commercialGapsQuestions');
const { interpretCommercialGaps } = require('../lib/commercialGapsAI');

const router = express.Router();

// ============================================================
// UNPUBLISHED — Commercial Gaps Review (AI)
// Third Owner Check tool, built on a feature branch per Tom's brief
// (29/07/2026): a lead-gated, dynamically-ordered free-text interview,
// interpreted once at the end by Anthropic into structured JSON — never a
// live chatbot. Same "stays private until Tom approves launch" pattern as
// the Market Ready Test: not linked from any nav, noindex/nofollow, direct-
// URL-only, absent from sitemap.xml and disallowed in robots.txt. Does not
// touch the Owner Dependency Quiz, the Market Ready Test, or the Owner
// Check hub page.
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

// Starting a review creates a lead immediately, so this stays tight —
// enough for a genuine visitor to start more than one review (different
// businesses, a retry after a typo) without opening the door to bulk
// fake-lead creation.
const startLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many requests. Please try again later.' }
});

// A genuine visitor sends 11-12 answer requests in one sitting. Generous
// enough for that plus a few retries, tight enough to bound abuse of a
// public, unauthenticated endpoint.
const answerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many requests. Please try again later.' }
});

// ------------------------------------------------------------
// GET /commercial-gaps-review — intake page. Registered directly (same
// pattern as the Owner Dependency Quiz and Market Ready Test) so the token
// needed by the intake form is generated here rather than relied on from
// the global res.locals middleware.
// ------------------------------------------------------------
function mountPageRoute(app, generateCsrfToken) {
  app.get('/commercial-gaps-review', async (req, res, next) => {
    try {
      const { rows: themeRows } = await db.query(
        "SELECT content FROM content WHERE section_key = 'site.theme'"
      );
      const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
      const theme = themes[activeTheme] || themes.dark;

      res.render('commercial-gaps-review', {
        theme,
        csrfToken: generateCsrfToken(req, res)
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/commercial-gaps-review/result/:token', async (req, res, next) => {
    try {
      const token = String(req.params.token || '');
      if (!isValidToken(token)) {
        return res.status(404).send('Result not found.');
      }
      const { rows } = await db.query(
        'SELECT * FROM commercial_gaps_reviews WHERE result_token = $1',
        [token]
      );
      if (rows.length === 0) {
        return res.status(404).send('Result not found.');
      }
      const review = rows[0];
      if (review.status !== 'completed' || !review.ai_response) {
        return res.status(404).send('This result is not ready yet.');
      }

      const { rows: themeRows } = await db.query(
        "SELECT content FROM content WHERE section_key = 'site.theme'"
      );
      const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
      const theme = themes[activeTheme] || themes.dark;

      // Only the fields the brief says the visitor may see — tom_briefing
      // is deliberately never passed to this view.
      const r = review.ai_response;
      res.render('commercial-gaps-review-result', {
        theme,
        name: review.name,
        company: review.company,
        headline: r.headline,
        primaryIssue: r.primary_issue,
        secondaryIssue: r.secondary_issue,
        usefulObservation: r.useful_observation,
        visitorSummary: r.visitor_summary,
        recommendedResource: r.recommended_resource
      });
    } catch (err) {
      next(err);
    }
  });
}

// ------------------------------------------------------------
// POST /api/commercial-gaps-review/start
// ------------------------------------------------------------
router.post('/api/commercial-gaps-review/start', startLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    if (plainText(body.website, 200)) {
      // Honeypot — pretend success without creating anything.
      return res.json({ ok: true, reviewToken: crypto.randomBytes(24).toString('hex'), question: firstQuestion() });
    }

    const name = plainText(body.name, 200);
    const email = plainText(body.email, 255);
    const company = plainText(body.company, 255);
    const location = plainText(body.location, 255);
    const consentSaveEmail = body.consentSaveEmail === true;
    const consentContact = body.consentContact === true;

    if (!name || !email || !company || !location) {
      return res.status(400).json({ error: 'Name, email, company and location are all required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const resultToken = crypto.randomBytes(24).toString('hex');
    await db.query(
      `INSERT INTO commercial_gaps_reviews
       (result_token, status, name, email, company, location, consent_save_email, consent_contact, transcript)
       VALUES ($1, 'in_progress', $2, $3, $4, $5, $6, $7, '[]'::jsonb)`,
      [resultToken, name, email, company, location, consentSaveEmail, consentContact]
    );

    const question = firstQuestion();
    res.json({ ok: true, reviewToken: resultToken, question });

    // Lead exists the instant the intake form is submitted, before a single
    // question is answered — matches the brief ("Immediately create the
    // lead") and gives parity with every other lead type in the admin panel.
    db.query(
      `INSERT INTO leads (kind, name, email, message)
       VALUES ('commercial_gaps_review', $1, $2, $3)`,
      [name, email, `${company}${location ? ` (${location})` : ''} — Commercial Gaps Review started. Contact permission: ${consentContact ? 'Yes' : 'No'}.`]
    ).catch((err) => console.error('Commercial Gaps Review lead insert failed:', err.message));

    if (transporter) {
      transporter.sendMail({
        from: NOTIFY_FROM,
        to: NOTIFY_FROM,
        replyTo: email,
        subject: `Commercial Gaps Review started — ${company}`,
        text: [
          `${name} has started a Commercial Gaps Review.`,
          '',
          `Company: ${company}`,
          `Location: ${location}`,
          `Email: ${email}`,
          `Consented to save/email the review: ${consentSaveEmail ? 'Yes' : 'No'}`,
          `Consented to being contacted: ${consentContact ? 'Yes' : 'No'}`,
          '',
          `You'll get the full private briefing by email once they finish (or if they abandon it partway, this is your only record).`
        ].join('\n')
      }).catch((err) => console.error('Commercial Gaps Review start-notification email failed:', err.message));
    }
  } catch (err) {
    console.error('Commercial Gaps Review start error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or contact us at tom@arringtonconsultancy.com.' });
  }
});

function formatTranscriptForEmail(transcript) {
  return transcript.map((e, i) => `Q${i + 1}. ${e.text}\n${e.answerText}`).join('\n\n');
}

async function sendCompletionEmails(review, data, mode) {
  if (!transporter) {
    console.warn('GMAIL_APP_PASSWORD not set — skipping Commercial Gaps Review completion emails.');
    return;
  }
  const resultUrl = `${SITE_ORIGIN}/commercial-gaps-review/result/${review.result_token}`;
  const transcript = Array.isArray(review.transcript) ? review.transcript : [];

  // Tom's private briefing — always sent, regardless of consent, same
  // principle as every other tool here: this is the business's own record
  // of a completed assessment, not a marketing send to the visitor.
  const tb = data.tom_briefing;
  transporter.sendMail({
    from: NOTIFY_FROM,
    to: NOTIFY_FROM,
    replyTo: review.email,
    subject: `${review.consent_contact ? '[CONTACT OK] ' : ''}Commercial Gaps Review — ${review.company} — ${data.primary_issue.split('.')[0]}`,
    text: [
      `Name: ${review.name}`,
      `Company: ${review.company}`,
      `Location: ${review.location}`,
      `Email: ${review.email}`,
      `Consented to save/email the review: ${review.consent_save_email ? 'Yes' : 'No'}`,
      `Consented to being contacted: ${review.consent_contact ? 'Yes' : 'No'}`,
      `AI mode: ${mode}`,
      `Result link: ${resultUrl}`,
      '',
      'PRIVATE BRIEFING (never shown to the visitor)',
      `Company overview: ${tb.company_overview}`,
      `Likely commercial issue: ${tb.likely_commercial_issue}`,
      `Evidence:\n${tb.evidence.map((e) => `- ${e}`).join('\n')}`,
      tb.contradictions.length ? `Contradictions:\n${tb.contradictions.map((e) => `- ${e}`).join('\n')}` : 'Contradictions: none flagged.',
      tb.emotional_signals.length ? `Emotional signals:\n${tb.emotional_signals.map((e) => `- ${e}`).join('\n')}` : 'Emotional signals: none flagged.',
      `Likely motivation for enquiry: ${tb.motivation_for_enquiry}`,
      `Strongest opening question: ${tb.strongest_opening_question}`,
      `Assumptions to test:\n${tb.assumptions_to_test.map((e) => `- ${e}`).join('\n')}`,
      `Suggested direction for the first meeting: ${tb.suggested_first_meeting_direction}`,
      '',
      'FULL TRANSCRIPT',
      formatTranscriptForEmail(transcript)
    ].filter(Boolean).join('\n')
  }).catch((err) => console.error('Commercial Gaps Review Tom briefing email failed:', err.message));

  // Visitor's own copy — only if they ticked the save/email consent box.
  // The result is always shown on-screen regardless; this box only governs
  // whether a copy is saved and sent to their inbox.
  if (review.consent_save_email) {
    transporter.sendMail({
      from: NOTIFY_FROM,
      to: review.email,
      subject: 'Your Commercial Gaps Review',
      text: [
        `Thanks, ${review.name} — here is your personalised Commercial Gaps Review for ${review.company}.`,
        '',
        data.headline,
        '',
        data.visitor_summary,
        '',
        `Primary issue: ${data.primary_issue}`,
        `Also worth watching: ${data.secondary_issue}`,
        '',
        data.useful_observation,
        '',
        `Worth reading: ${data.recommended_resource.title}`,
        data.recommended_resource.reason,
        data.recommended_resource.url,
        '',
        `View this online: ${resultUrl}`,
        '',
        'This is a starting point for a conversation, not a finished answer. If you would like to talk it through:',
        '',
        'Arrington Consultancy',
        'Tom Arrington, Managing Director',
        'tom@arringtonconsultancy.com',
        '01752 477026',
        'www.arringtonconsultancy.com'
      ].join('\n')
    }).catch((err) => console.error('Commercial Gaps Review visitor email failed:', err.message));
  }
}

// ------------------------------------------------------------
// POST /api/commercial-gaps-review/answer
//
// The client only ever sends the answer text and the review token. Which
// question is "current" is always re-derived server-side from the stored
// transcript via selectNextStep — the client cannot claim to be answering
// a different question than the one actually pending.
// ------------------------------------------------------------
router.post('/api/commercial-gaps-review/answer', answerLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const token = plainText(body.token, 64);
    const answerText = plainText(body.answerText, 2000);

    if (!isValidToken(token)) {
      return res.status(400).json({ error: 'Invalid request.' });
    }
    if (!answerText) {
      return res.status(400).json({ error: 'An answer is required.' });
    }

    const { rows } = await db.query(
      'SELECT * FROM commercial_gaps_reviews WHERE result_token = $1',
      [token]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Review not found.' });
    }
    const review = rows[0];
    if (review.status !== 'in_progress') {
      return res.status(400).json({ error: 'This review is already complete.' });
    }

    const transcript = Array.isArray(review.transcript) ? review.transcript : [];
    const pending = selectNextStep(transcript);
    if (pending.done) {
      return res.status(400).json({ error: 'This review is already complete.' });
    }

    const newTranscript = transcript.concat([{ ...pending.question, answerText }]);
    // Defensive cap — the fixed 11-or-12-question design never reaches
    // this, but the brief's hard maximum is enforced here regardless.
    const forceDone = newTranscript.length >= MAX_QUESTIONS;
    const next = forceDone ? { done: true } : selectNextStep(newTranscript);

    if (!next.done) {
      await db.query(
        'UPDATE commercial_gaps_reviews SET transcript = $1::jsonb WHERE result_token = $2',
        [JSON.stringify(newTranscript), token]
      );
      return res.json({
        ok: true,
        done: false,
        question: next.question,
        progress: { answered: newTranscript.length, min: MIN_QUESTIONS, max: MAX_QUESTIONS }
      });
    }

    // Final answer — interpret, validate (handled inside), persist, notify.
    const { mode, data } = await interpretCommercialGaps({
      name: review.name,
      company: review.company,
      location: review.location,
      transcript: newTranscript
    });

    await db.query(
      `UPDATE commercial_gaps_reviews
       SET transcript = $1::jsonb, ai_response = $2::jsonb, ai_mode = $3, status = 'completed', completed_at = NOW()
       WHERE result_token = $4`,
      [JSON.stringify(newTranscript), JSON.stringify(data), mode, token]
    );

    const resultPath = `/commercial-gaps-review/result/${token}`;
    res.json({ ok: true, done: true, resultUrl: resultPath });

    review.transcript = newTranscript;
    sendCompletionEmails(review, data, mode).catch((err) => console.error('Commercial Gaps Review completion email dispatch failed:', err.message));

    db.query(
      `INSERT INTO leads (kind, name, email, message)
       VALUES ('commercial_gaps_review', $1, $2, $3)`,
      [review.name, review.email, `${review.company} — Commercial Gaps Review completed. Primary issue: ${data.primary_issue.split('.')[0]}. Contact permission: ${review.consent_contact ? 'Yes' : 'No'}.`]
    ).catch((err) => console.error('Commercial Gaps Review completion lead insert failed:', err.message));
  } catch (err) {
    console.error('Commercial Gaps Review answer error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or contact us at tom@arringtonconsultancy.com.' });
  }
});

module.exports = { router, mountPageRoute };
