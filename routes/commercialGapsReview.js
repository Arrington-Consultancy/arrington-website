const crypto = require('crypto');
const express = require('express');
const sanitizeHtml = require('sanitize-html');
const nodemailer = require('nodemailer');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const db = require('../db/pool');
const themes = require('../db/themes');
const { selectNextStep, firstQuestion, MIN_QUESTIONS, MAX_QUESTIONS } = require('../lib/commercialGapsQuestions');
const { interpretCommercialGaps } = require('../lib/commercialGapsAI');
const { generateUniqueShortReference } = require('../lib/shortReference');
const { getSiteShellData } = require('../lib/navShell');

const router = express.Router();

// ============================================================
// PUBLISHED 30/07/2026 — Commercial Gaps Review (AI)
// Third Owner Check tool, built on a feature branch per Tom's brief
// (29/07/2026): a lead-gated, dynamically-ordered free-text interview,
// interpreted once at the end by Anthropic into structured JSON — never a
// live chatbot. Now linked from the Owner Check hub page as the third
// check, indexed, and listed in sitemap.xml. The per-visitor result page
// (commercial-gaps-review-result.ejs) stays noindex/nofollow regardless —
// that's one visitor's private answers, not the public tool page. Does not
// touch the Owner Dependency Quiz or the Market Ready Test, which remains
// unpublished on its own separate timeline.
//
// REBUILT 01/08/2026 — asynchronous submission + failure recovery. Live AI
// stays on (that decision is deliberate, not a stopgap — the plan is for
// the governed conclusion-bank architecture to later replace what the AI
// is asked to generate, not to retreat from AI mode itself). What changed
// is that a live call can genuinely take long enough to exceed a proxy or
// mobile-browser timeout, so the final answer submission no longer holds
// the connection open waiting for interpretCommercialGaps to finish: it
// marks the row 'processing' and responds immediately, then interprets and
// finalizes in the background. The result page polls until it's ready. If
// interpretation ever fails outright (interpretCommercialGaps is designed
// to fall back to the mock rather than throw, but a DB error during the
// async finalize step is still possible), the row is marked 'failed' with
// a reason, Tom always gets a recovery email regardless of the visitor's
// consent choice, and the visitor sees a plain on-screen message with a
// short reference rather than a dead end.
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
      const { navPages, content, pageContact } = await getSiteShellData();

      res.render('commercial-gaps-review', {
        theme,
        csrfToken: generateCsrfToken(req, res),
        navPages,
        content,
        pageContact
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

      const { rows: themeRows } = await db.query(
        "SELECT content FROM content WHERE section_key = 'site.theme'"
      );
      const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
      const theme = themes[activeTheme] || themes.dark;
      const { navPages, content, pageContact } = await getSiteShellData();

      // Three real states, one view (commercial-gaps-review-result.ejs
      // branches on `state`): still working (in_progress shouldn't
      // normally reach this route since the visitor is still mid-question,
      // but processing certainly will), genuinely failed, or done. The
      // waiting state polls /api/commercial-gaps-review/status/:token
      // until it changes.
      if (review.status === 'processing' || review.status === 'in_progress') {
        return res.render('commercial-gaps-review-result', {
          theme,
          state: 'waiting',
          token,
          csrfToken: generateCsrfToken(req, res),
          navPages,
          content,
          pageContact
        });
      }

      if (review.status === 'failed') {
        return res.render('commercial-gaps-review-result', {
          theme,
          state: 'failed',
          shortReference: review.short_reference,
          csrfToken: generateCsrfToken(req, res),
          navPages,
          content,
          pageContact
        });
      }

      if (review.status !== 'completed' || !review.ai_response) {
        return res.status(404).send('This result is not ready yet.');
      }

      // Only the fields the brief says the visitor may see — tom_briefing
      // is deliberately never passed to this view.
      const r = review.ai_response;
      res.render('commercial-gaps-review-result', {
        theme,
        state: 'completed',
        name: review.name,
        company: review.company,
        headline: r.headline,
        primaryIssue: r.primary_issue,
        secondaryIssue: r.secondary_issue,
        usefulObservation: r.useful_observation,
        visitorSummary: r.visitor_summary,
        recommendedResource: r.recommended_resource,
        csrfToken: generateCsrfToken(req, res),
        navPages,
        content,
        pageContact
      });
    } catch (err) {
      next(err);
    }
  });

  // Lightweight poll target for the waiting screen — status only, never
  // the answers or the result itself, so it stays cheap to call every few
  // seconds without leaking anything the full result route wouldn't.
  app.get('/api/commercial-gaps-review/status/:token', async (req, res) => {
    try {
      const token = String(req.params.token || '');
      if (!isValidToken(token)) {
        return res.status(404).json({ error: 'Not found.' });
      }
      const { rows } = await db.query(
        'SELECT status FROM commercial_gaps_reviews WHERE result_token = $1',
        [token]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Not found.' });
      }
      res.json({ status: rows[0].status });
    } catch (err) {
      console.error('Commercial Gaps Review status poll error:', err);
      res.status(500).json({ error: 'Something went wrong.' });
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

    if (!name || !company || !location) {
      return res.status(400).json({ error: 'Name, company and location are all required.' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const resultToken = crypto.randomBytes(24).toString('hex');
    const shortReference = await generateUniqueShortReference('commercial_gaps_reviews', 'short_reference');
    await db.query(
      `INSERT INTO commercial_gaps_reviews
       (result_token, short_reference, status, name, email, company, location, consent_save_email, consent_contact, transcript)
       VALUES ($1, $2, 'in_progress', $3, $4, $5, $6, $7, $8, '[]'::jsonb)`,
      [resultToken, shortReference, name, email, company, location, consentSaveEmail, consentContact]
    );

    const question = firstQuestion();
    res.json({ ok: true, reviewToken: resultToken, question });

    // Lead exists the instant the intake form is submitted, before a single
    // question is answered — matches the brief ("Immediately create the
    // lead") and gives parity with every other lead type in the admin panel.
    // This is a DB record only, not an email: starting a review must never
    // trigger an owner notification (only a completed submission does — see
    // finalizeReview below), so an abandoned review still shows up for Tom
    // in the admin panel without ever landing in his inbox.
    db.query(
      `INSERT INTO leads (kind, name, email, message)
       VALUES ('commercial_gaps', $1, $2, $3)`,
      [name, email, `${company}${location ? ` (${location})` : ''} — Commercial Gaps Review started. Contact permission: ${consentContact ? 'Yes' : 'No'}.`]
    ).catch((err) => console.error('Commercial Gaps Review lead insert failed:', err.message));
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

  // Tom's private briefing — always sent, regardless of consent and
  // regardless of whether the visitor gave an email at all, same principle
  // as every other tool here: this is the business's own record of a
  // completed assessment, not a marketing send to the visitor.
  const tb = data.tom_briefing;
  transporter.sendMail({
    from: NOTIFY_FROM,
    to: NOTIFY_FROM,
    ...(review.email ? { replyTo: review.email } : {}),
    subject: `${review.consent_contact ? '[CONTACT OK] ' : ''}Commercial Gaps Review — ${review.company} — ${data.primary_issue.split('.')[0]}`,
    text: [
      `Name: ${review.name || 'Not provided'}`,
      `Company: ${review.company}`,
      `Location: ${review.location}`,
      `Email: ${review.email || 'Not provided'}`,
      'Phone: Not provided',
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

  // Visitor's own copy — only if they ticked the save/email consent box AND
  // actually gave an email address (the field is optional, so a visitor can
  // tick the box with nothing to send it to — nothing to do in that case).
  // The result is always shown on-screen regardless; this box only governs
  // whether a copy is saved and sent to their inbox.
  if (review.consent_save_email && review.email) {
    transporter.sendMail({
      from: NOTIFY_FROM,
      to: review.email,
      subject: 'Your Commercial Gaps Review',
      text: [
        `Thanks, ${review.name}. Here is your personalised Commercial Gaps Review for ${review.company}.`,
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

// Always sent to Tom, regardless of the visitor's own consent choice — the
// visitor's email preference only ever controls whether THEY get a copy,
// never whether Tom is notified. There is no equivalent failure email to
// the visitor: their only communication on this path is the on-screen
// message pointing them at Tom directly, carrying the same reference.
async function sendFailureRecoveryEmail(review, failureReason) {
  if (!transporter) {
    console.warn('GMAIL_APP_PASSWORD not set — skipping Commercial Gaps Review failure-recovery email.');
    return;
  }
  const transcript = Array.isArray(review.transcript) ? review.transcript : [];

  transporter.sendMail({
    from: NOTIFY_FROM,
    to: NOTIFY_FROM,
    ...(review.email ? { replyTo: review.email } : {}),
    subject: `[NEEDS RECOVERY] Commercial Gaps Review — ${review.company} — ${review.short_reference}`,
    text: [
      'A Commercial Gaps Review could not be generated and needs manual recovery.',
      '',
      `Reference: ${review.short_reference}`,
      `Name: ${review.name || 'Not provided'}`,
      `Company: ${review.company}`,
      `Location: ${review.location}`,
      `Email: ${review.email || 'Not provided'}`,
      'Phone: Not provided',
      `Consented to save/email a copy: ${review.consent_save_email ? 'Yes' : 'No'}`,
      `Consented to being contacted: ${review.consent_contact ? 'Yes' : 'No'}`,
      `Failure reason: ${failureReason}`,
      '',
      'FULL TRANSCRIPT (what they actually said)',
      formatTranscriptForEmail(transcript)
    ].join('\n')
  }).catch((err) => console.error('Commercial Gaps Review failure-recovery email failed:', err.message));
}

// Runs after the visitor has already been told "done" — see the /answer
// route below. Never lets an error escape: interpretCommercialGaps is
// designed to fall back to the mock rather than throw, but a DB error
// while finalizing is still possible, and either way this function's own
// job is to make sure the row and the visitor-facing state always end up
// consistent (completed or explicitly failed, never stuck).
async function finalizeReview(review, token) {
  try {
    const { mode, data } = await interpretCommercialGaps({
      name: review.name,
      company: review.company,
      location: review.location,
      transcript: review.transcript
    });

    await db.query(
      `UPDATE commercial_gaps_reviews
       SET ai_response = $1::jsonb, ai_mode = $2, status = 'completed', completed_at = NOW()
       WHERE result_token = $3`,
      [JSON.stringify(data), mode, token]
    );

    sendCompletionEmails(review, data, mode).catch((err) => console.error('Commercial Gaps Review completion email dispatch failed:', err.message));

    db.query(
      `INSERT INTO leads (kind, name, email, message)
       VALUES ('commercial_gaps', $1, $2, $3)`,
      [review.name, review.email, `${review.company} — Commercial Gaps Review completed. Primary issue: ${data.primary_issue.split('.')[0]}. Contact permission: ${review.consent_contact ? 'Yes' : 'No'}.`]
    ).catch((err) => console.error('Commercial Gaps Review completion lead insert failed:', err.message));
  } catch (err) {
    const failureReason = String((err && err.message) || err).slice(0, 2000);
    console.error('Commercial Gaps Review: result generation failed, marking as failed.', failureReason);

    await db.query(
      `UPDATE commercial_gaps_reviews SET status = 'failed', failure_reason = $1 WHERE result_token = $2`,
      [failureReason, token]
    ).catch((dbErr) => console.error('Commercial Gaps Review: could not even record the failure.', dbErr.message));

    sendFailureRecoveryEmail(review, failureReason).catch((err2) => console.error('Commercial Gaps Review failure-recovery email dispatch failed:', err2.message));

    db.query(
      `INSERT INTO leads (kind, name, email, message)
       VALUES ('commercial_gaps', $1, $2, $3)`,
      [review.name, review.email, `${review.company} — Commercial Gaps Review FAILED, needs manual recovery. Reference: ${review.short_reference}.`]
    ).catch((leadErr) => console.error('Commercial Gaps Review failure lead insert failed:', leadErr.message));
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

    // Final answer — mark processing and respond immediately. A live AI
    // call (plus its one retry on a bad reply) can genuinely take long
    // enough to exceed a proxy or mobile-browser timeout, so the request
    // is never held open waiting for interpretCommercialGaps to finish.
    // The actual interpretation happens in finalizeReview, in the
    // background, after the response has already gone out.
    await db.query(
      `UPDATE commercial_gaps_reviews SET transcript = $1::jsonb, status = 'processing' WHERE result_token = $2`,
      [JSON.stringify(newTranscript), token]
    );

    const resultPath = `/commercial-gaps-review/result/${token}`;
    res.json({ ok: true, done: true, resultUrl: resultPath });

    finalizeReview({ ...review, transcript: newTranscript }, token)
      .catch((err) => console.error('Commercial Gaps Review: finalizeReview itself threw (should be unreachable, it handles its own failures):', err.message));
  } catch (err) {
    console.error('Commercial Gaps Review answer error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or contact us at tom@arringtonconsultancy.com.' });
  }
});

module.exports = { router, mountPageRoute };
