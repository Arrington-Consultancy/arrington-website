const crypto = require('crypto');
const express = require('express');
const sanitizeHtml = require('sanitize-html');
const nodemailer = require('nodemailer');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const db = require('../db/pool');
const themes = require('../db/themes');
const { getSiteShellData } = require('../lib/navShell');
const { verifyTurnstileToken, SITE_KEY: TURNSTILE_SITE_KEY } = require('../lib/turnstile');

const router = express.Router();

// ============================================================
// UNPUBLISHED — Market Ready Test
// Standalone tool, not part of the pages/content CMS, same pattern as the
// Owner Dependency Quiz. Deliberately not linked from any nav, not in
// sitemap.xml, and noindex/nofollow on the page itself, per the build brief:
// this stays private (direct-URL-only) until Tom explicitly approves launch.
// Nothing here touches the live site's nav, pages table, other routes, or
// the existing Owner Dependency Quiz.
//
// Rebuilt 26/07/2026 to score deterministically in code instead of calling
// the Anthropic API. See CLAUDE.md for why: a public page that spends money
// on demand and can publish unreviewed "red flags" about a stranger's
// business under Tom's name was judged not worth it for a scored
// questionnaire. This version can never say anything nobody here wrote.
// ============================================================

const NOTIFY_FROM = 'tom@arringtonconsultancy.com';
// Emails only ever contain plain text, so a bare "/market-ready-test/result/…"
// path gets linkified by mail clients as a local file:// path instead of a
// web address — every result link sent by email must be absolute.
const SITE_ORIGIN = 'https://www.arringtonconsultancy.com';
const transporter = process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: NOTIFY_FROM, pass: process.env.GMAIL_APP_PASSWORD }
    })
  : null;

const plainText = (s, max) => sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim().slice(0, max || 100000);
const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 255;

// This tool used to hit a paid external API per submission and needed a
// tight limiter for that reason. Scoring is now free and instant, but the
// limiter stays as ordinary protection against automated abuse of a public
// form (same purpose as the site's other publicFormLimiter-style limits).
const assessmentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many requests. Please try again later.' }
});

const SALE_TIMEFRAME_OPTIONS = [
  'Yes, actively',
  'Possibly within the next two years',
  'Possibly later',
  'No, I want to understand how transferable the business is',
  'Prefer not to say'
];

// ------------------------------------------------------------
// The ten questions. Each has exactly four options, ordered strongest (0)
// to weakest (3), each worth a fixed number of points. Points sum to 100
// across all ten questions and to the category max shown against each
// question. Nothing here is graded by a model — a chosen option always
// carries a fixed, pre-written score and pre-written text.
// ------------------------------------------------------------
const QUESTIONS = [
  {
    id: 1,
    category: 'transferability',
    label: 'Transferability',
    text: 'How much of the day-to-day running of the business depends on knowledge, relationships or judgement that exists only in your head?',
    options: [
      { text: 'Very little. Key knowledge, relationships and decisions are documented or shared with the team.', score: 20 },
      { text: 'Some. A new owner would need a proper handover period to pick it all up.', score: 12 },
      { text: 'A fair amount. Several important things genuinely only I know how to do.', score: 5 },
      { text: 'Most of it. I am the one holding the business together.', score: 0 }
    ],
    priority: {
      action: 'Start writing down what only you currently know',
      why_it_matters: 'If key knowledge, relationships or judgement calls exist only in your head, a new owner cannot pick up where you left off.',
      evidence_a_buyer_would_expect: 'Documented processes, contact lists and a clear handover plan.'
    }
  },
  {
    id: 2,
    category: 'commercial_resilience',
    label: 'Single point of failure',
    text: "If you had to name the single biggest point of failure in the business today, a person, supplier, customer or system, how exposed would you say you are?",
    options: [
      { text: 'Not very. No single point of failure would cause serious damage if it went wrong.', score: 10 },
      { text: 'Somewhat. It would hurt, but the business would recover.', score: 6 },
      { text: 'Significantly. It would cause real disruption for months.', score: 3 },
      { text: 'Severely. The business could be at real risk if it went wrong.', score: 0 }
    ],
    priority: {
      action: 'Reduce your biggest single point of failure',
      why_it_matters: 'A business that depends heavily on one person, supplier or system is a bigger risk to a buyer, and to you if it goes wrong before a sale.',
      evidence_a_buyer_would_expect: 'A credible plan to reduce or remove the exposure.'
    }
  },
  {
    id: 3,
    category: 'commercial_resilience',
    label: 'Customer and supplier concentration',
    text: 'If your largest customer or most important supplier walked away tomorrow, what would happen to the business?',
    options: [
      { text: 'Manageable. No single relationship represents a large share of the business.', score: 10 },
      { text: 'A noticeable hit, but the business would keep trading comfortably.', score: 6 },
      { text: 'A serious hit that would take real work to recover from.', score: 3 },
      { text: 'It would put the business in genuine difficulty.', score: 0 }
    ],
    priority: {
      action: 'Broaden concentrated customer or supplier relationships',
      why_it_matters: 'A buyer will discount value for revenue or supply that depends on one relationship.',
      evidence_a_buyer_would_expect: 'A customer or supplier spread that does not hinge on any single relationship.'
    }
  },
  {
    id: 4,
    category: 'financial_credibility',
    label: 'Financial and evidential credibility',
    text: "If a buyer's accountant went through your books and systems in detail, how confident are you that everything would hold up?",
    options: [
      { text: 'Very confident. The numbers and records are clean and well kept.', score: 15 },
      { text: 'Fairly confident, though there are a few things I would want to tidy up first.', score: 9 },
      { text: 'Uneasy. There are gaps or inconsistencies I have not dealt with.', score: 4 },
      { text: 'Not confident. I know there are things that would not stand up well.', score: 0 }
    ],
    priority: {
      action: 'Get your financial records and systems reviewed and tidied',
      why_it_matters: "A buyer's accountant will go through everything in detail. Problems found by them are worse than problems found and fixed by you first.",
      evidence_a_buyer_would_expect: 'Clean, consistent, well kept records with nothing left unexplained.'
    }
  },
  {
    id: 5,
    category: 'preparation_for_sale',
    label: 'Readiness for buyer review',
    text: 'How ready are your financial records, contracts and processes for a buyer to examine in detail?',
    options: [
      { text: 'Ready now. Everything is organised and could be shared with minimal work.', score: 8 },
      { text: 'Mostly ready, with a few things to gather or update.', score: 5 },
      { text: 'Not really ready. It would take real effort to pull everything together.', score: 2 },
      { text: 'Not ready at all. Much of it is not written down or organised anywhere.', score: 0 }
    ],
    priority: {
      action: 'Get your financial records, contracts and processes organised',
      why_it_matters: 'Due diligence moves faster, and looks more credible, when everything is already in order.',
      evidence_a_buyer_would_expect: 'Organised documentation a buyer could review with minimal delay.'
    }
  },
  {
    id: 6,
    category: 'preparation_for_sale',
    label: 'Deferred issues',
    text: 'Is there anything in the business you have known needed fixing for a long time but have not addressed?',
    options: [
      { text: 'No, or nothing significant.', score: 7 },
      { text: 'One thing, and I have a plan to deal with it.', score: 4 },
      { text: 'One or two things I keep putting off.', score: 2 },
      { text: 'Yes, several things, and none of them are close to being fixed.', score: 0 }
    ],
    priority: {
      action: 'Deal with the thing you have been putting off',
      why_it_matters: 'Long-standing known issues read as deferred maintenance to a buyer, not bad luck.',
      evidence_a_buyer_would_expect: 'Evidence the issue has been fixed, or a credible plan and timeline for fixing it.'
    }
  },
  {
    id: 7,
    category: 'buyer_confidence',
    label: 'Day-to-day standards',
    text: 'If a serious buyer spent a full day quietly observing the business without talking to anyone, what would they most likely conclude about how it is run?',
    options: [
      { text: 'That it is well run, professional and organised day to day.', score: 8 },
      { text: 'That it is run reasonably well, with some rough edges.', score: 5 },
      { text: 'That standards are inconsistent and it depends on who is around.', score: 2 },
      { text: 'That things are visibly under strain or below standard.', score: 0 }
    ],
    priority: {
      action: 'Tighten day-to-day standards so they hold up without you there',
      why_it_matters: 'A buyer, or their advisor, may visit unannounced or ask staff direct questions. Standards need to hold up without you present.',
      evidence_a_buyer_would_expect: 'Consistent standards regardless of who is or is not in the building.'
    }
  },
  {
    id: 8,
    category: 'buyer_confidence',
    label: 'Competitive exposure',
    text: 'If your closest competitor bought the business tomorrow, how long do you think it would take them to find a genuine weakness?',
    options: [
      { text: 'A long time. There is nothing obvious for them to exploit.', score: 7 },
      { text: 'A few months, once they got to know how things really work.', score: 4 },
      { text: 'Within a few weeks.', score: 2 },
      { text: 'Almost immediately.', score: 0 }
    ],
    priority: {
      action: 'Fix the weakness a competitor would find fastest',
      why_it_matters: "If you already know what it is, assume a buyer's due diligence will find it too.",
      evidence_a_buyer_would_expect: 'No obvious, quickly discoverable weakness in how the business operates.'
    }
  },
  {
    id: 9,
    category: 'owner_readiness',
    label: 'Sale timing and motivation',
    text: 'If someone offered you a strong price for the business today, how would you feel?',
    options: [
      { text: 'Relieved. I have been ready to sell for a while.', score: 8 },
      { text: 'Interested, but I would need time to think it through properly.', score: 5 },
      { text: 'Torn. Part of me would want to say yes and part of me would not.', score: 2 },
      { text: 'Uneasy. I am not sure I am ready to let go, even at a good price.', score: 0 }
    ],
    priority: {
      action: 'Get clear on your own timing and motivation before going further',
      why_it_matters: 'Hesitation or unclear motivation shows up in a sale process and can undermine a buyer\'s confidence.',
      evidence_a_buyer_would_expect: 'A clear, considered answer on why now and what happens next.'
    }
  },
  {
    id: 10,
    category: 'owner_readiness',
    label: 'Letting go after completion',
    text: 'Once a sale completes, how do you feel about the new owner running things differently?',
    options: [
      { text: 'Comfortable. Once it is sold, it is theirs to run as they see fit.', score: 7 },
      { text: 'Mostly comfortable, though I would hope they kept some things the same.', score: 4 },
      { text: 'Uncomfortable if they changed things I care about.', score: 2 },
      { text: 'I would find it very hard to watch someone else run it differently.', score: 0 }
    ],
    priority: {
      action: 'Think through what you will and will not be able to control after completion',
      why_it_matters: 'Buyers are wary of a seller who struggles to let go, especially where there is an earn out or handover period.',
      evidence_a_buyer_would_expect: 'A seller who is genuinely ready to hand over control on the agreed terms.'
    }
  }
];

const CATEGORY_LABELS = {
  transferability: ['Transferability', 20],
  commercial_resilience: ['Commercial resilience', 20],
  financial_credibility: ['Financial and evidential credibility', 15],
  preparation_for_sale: ['Preparation for sale', 15],
  buyer_confidence: ['Buyer confidence', 15],
  owner_readiness: ['Owner readiness', 15]
};

function ratingForScore(score) {
  if (score >= 85) return 'Strongly new owner ready';
  if (score >= 70) return 'Largely ready, with clear work still required';
  if (score >= 55) return 'Some strong foundations, but material weaknesses remain';
  if (score >= 40) return 'Not yet ready for a confident handover';
  return 'Serious barriers to a successful transfer';
}

const OPENING_TEXT = {
  '85': 'Your answers point to a business that is well placed to be handed over to a new owner. That does not mean nothing needs attention: the sections below set out where a serious buyer would still look closely.',
  '70': 'Your answers point to a business that is largely ready for a new owner, with some clear areas still worth strengthening before you approach the market. The sections below set out what stood out and what a buyer would likely question.',
  '55': 'Your answers show real strengths alongside some material weaknesses. A buyer would likely be interested, but would want satisfactory answers on the areas flagged below before going further.',
  '40': 'Your answers suggest the business is not yet ready for a confident handover. That is common and fixable, but a buyer today would likely raise the concerns set out below before taking things further.',
  '0': 'Your answers point to serious barriers to a successful transfer as things stand. This is worth taking seriously rather than personally: the areas below are where a buyer would expect to see real change before making an offer.'
};

const CLOSING_TEXT = {
  '85': 'A high score is a good starting point, not a finish line. The specific areas above are still worth reviewing properly before you go to market.',
  '70': 'Most of the groundwork is there. Closing the gaps above before you approach a buyer will make the process faster and less exposed.',
  '55': "The areas above are where the sale process would likely slow down or stall. Addressing them now, on your own timeline, is easier than addressing them under a buyer's questioning.",
  '40': 'None of this is unusual for an owner run business that has not yet been prepared for a sale. The areas above are where to start.',
  '0': 'This is a useful early warning, not a verdict. The areas above are where a proper commercial review would begin.'
};

function bandKeyForScore(score) {
  if (score >= 85) return '85';
  if (score >= 70) return '70';
  if (score >= 55) return '55';
  if (score >= 40) return '40';
  return '0';
}

// Social share images — one per band, generated ahead of time and stored in
// public/img/market-ready-test/. Keyed by the same band key as OPENING_TEXT
// and CLOSING_TEXT above, so it stays in lockstep with them automatically.
const SHARE_IMAGE = {
  '85': { tag: 'New owner ready', image: 'share-ready.jpg' },
  '70': { tag: 'Largely ready', image: 'share-largely-ready.jpg' },
  '55': { tag: 'Mixed readiness', image: 'share-mixed.jpg' },
  '40': { tag: 'Not yet ready', image: 'share-not-yet-ready.jpg' },
  '0': { tag: 'Serious barriers', image: 'share-serious-barriers.jpg' }
};
function shareMetaForScore(score) {
  return SHARE_IMAGE[bandKeyForScore(score)];
}

// Builds the full report object from validated option indices (0-3 per
// question, chosen strongest-to-weakest) plus the one optional free-text
// context box. Every string in the output is either a fixed constant above
// or the respondent's own selected option text — nothing is generated or
// inferred, so this can never say anything nobody here wrote and can never
// fail the way an external API call could.
function buildReport(optionIndices) {
  const category_scores = {
    transferability: 0, commercial_resilience: 0, financial_credibility: 0,
    preparation_for_sale: 0, buyer_confidence: 0, owner_readiness: 0
  };
  const categoryAnswerText = {
    transferability: [], commercial_resilience: [], financial_credibility: [],
    preparation_for_sale: [], buyer_confidence: [], owner_readiness: []
  };
  const strengths = [];
  const concerns = [];
  const red_flags = [];
  const priorities = [];

  QUESTIONS.forEach((q, i) => {
    const optIndex = optionIndices[i];
    const chosen = q.options[optIndex];
    category_scores[q.category] += chosen.score;
    categoryAnswerText[q.category].push(chosen.text);

    if (optIndex === 0) {
      strengths.push({ title: q.label, explanation: chosen.text });
    } else if (optIndex === 3) {
      red_flags.push({ title: q.label, explanation: chosen.text });
      priorities.push(q.priority);
    } else {
      concerns.push({ title: q.label, explanation: chosen.text });
      priorities.push(q.priority);
    }
  });

  const overall_score = Object.values(category_scores).reduce((a, b) => a + b, 0);
  const rating = ratingForScore(overall_score);
  const band = bandKeyForScore(overall_score);

  const category_explanations = {};
  for (const key of Object.keys(CATEGORY_LABELS)) {
    category_explanations[key] = categoryAnswerText[key].join(' ');
  }

  return {
    overall_score,
    rating,
    category_scores,
    category_explanations,
    opening_assessment: OPENING_TEXT[band],
    closing_statement: CLOSING_TEXT[band],
    strengths,
    concerns,
    red_flags,
    contradictions: [],
    buyer_questions: [],
    priorities: priorities.slice(0, 3),
    needs_checking: []
  };
}

// ------------------------------------------------------------
// GET /market-ready-test — the assessment page itself. Registered ahead of
// the app-wide CSRF-token middleware (same pattern as the Owner Dependency
// Quiz), so the token needed by the submit form is generated here directly.
// ------------------------------------------------------------
// Request-review limiter — a visitor clicks this at most once or twice per
// result, but keep it bounded like every other public-facing action.
const requestReviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many requests. Please try again later.' }
});

// Share/copy clicks are anonymous, low-friction actions and can happen
// several times in one visit (someone might try more than one platform) —
// same pattern and limits as the Owner Dependency Quiz's share-notify.
const shareNotifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many requests.' }
});

const VALID_SHARE_PLATFORMS = ['linkedin', 'facebook', 'x', 'copy_text', 'copy_link'];

// What the client needs to render the questions — text and options only,
// never the scores, so the rubric stays server-side (same principle as the
// old version never shipping its scoring "purpose" text to the browser).
const CLIENT_QUESTIONS = QUESTIONS.map(q => ({
  id: q.id,
  text: q.text,
  options: q.options.map(o => o.text)
}));

function mountPageRoute(app, generateCsrfToken) {
  app.get('/market-ready-test', async (req, res, next) => {
    try {
      const { rows: themeRows } = await db.query(
        "SELECT content FROM content WHERE section_key = 'site.theme'"
      );
      const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
      const theme = themes[activeTheme] || themes.dark;
      const { navPages, content, pageContact } = await getSiteShellData();

      res.render('market-ready-test', {
        theme,
        csrfToken: generateCsrfToken(req, res),
        questions: CLIENT_QUESTIONS,
        saleTimeframeOptions: SALE_TIMEFRAME_OPTIONS,
        navPages,
        content,
        pageContact,
        turnstileSiteKey: TURNSTILE_SITE_KEY
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/market-ready-test/result/:token', async (req, res, next) => {
    try {
      const token = String(req.params.token || '');
      if (!/^[a-f0-9]{48}$/.test(token)) {
        return res.status(404).send('Result not found.');
      }
      const { rows } = await db.query(
        'SELECT * FROM market_ready_submissions WHERE result_token = $1',
        [token]
      );
      if (rows.length === 0) {
        return res.status(404).send('Result not found.');
      }
      const submission = rows[0];
      if (submission.status !== 'completed' || !submission.report) {
        return res.status(404).send('This result is not ready yet.');
      }

      const { rows: themeRows } = await db.query(
        "SELECT content FROM content WHERE section_key = 'site.theme'"
      );
      const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
      const theme = themes[activeTheme] || themes.dark;
      const shareMeta = shareMetaForScore(submission.report.overall_score);
      const { navPages, content, pageContact } = await getSiteShellData();

      res.render('market-ready-test-result', {
        theme,
        csrfToken: generateCsrfToken(req, res),
        firstName: submission.first_name,
        resultToken: token,
        report: submission.report,
        shareTag: shareMeta.tag,
        shareImageUrl: `${SITE_ORIGIN}/img/market-ready-test/${shareMeta.image}`,
        resultUrl: `${SITE_ORIGIN}/market-ready-test/result/${token}`,
        navPages,
        content,
        pageContact
      });
    } catch (err) {
      next(err);
    }
  });
}

function formatAnswersForEmail(answers) {
  return answers.map((a, i) => `Q${i + 1}. ${QUESTIONS[i].text}\n${a.answerText}`).join('\n\n');
}

// ------------------------------------------------------------
// POST /api/market-ready-test/submit
// ------------------------------------------------------------
router.post('/api/market-ready-test/submit', assessmentLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    if (plainText(body.website, 200)) {
      // Honeypot — pretend success without storing anything.
      return res.json({ ok: true, resultUrl: '/market-ready-test' });
    }

    const firstName = plainText(body.firstName, 200);
    const lastName = plainText(body.lastName, 200);
    const businessName = plainText(body.businessName, 255);
    const email = plainText(body.email, 255);
    const phone = plainText(body.phone, 50);
    const location = plainText(body.location, 255);
    const industry = plainText(body.industry, 255);
    const employeeCount = plainText(body.employeeCount, 100);
    const turnoverBand = plainText(body.turnoverBand, 100);
    const saleTimeframe = plainText(body.saleTimeframe, 100);
    const context = plainText(body.context, 2000);
    const consentTomReview = body.consentTomReview === true;
    const consentMarketing = body.consentMarketing === true;

    if (!firstName || !businessName) {
      return res.status(400).json({ error: 'Name and business name are required.' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (saleTimeframe && !SALE_TIMEFRAME_OPTIONS.includes(saleTimeframe)) {
      return res.status(400).json({ error: 'Invalid sale timeframe.' });
    }

    const rawAnswers = Array.isArray(body.answers) ? body.answers : [];
    if (rawAnswers.length !== QUESTIONS.length) {
      return res.status(400).json({ error: 'All ten questions are required.' });
    }
    const optionIndices = rawAnswers.map(a => parseInt(a, 10));
    for (let i = 0; i < optionIndices.length; i++) {
      if (!Number.isInteger(optionIndices[i]) || optionIndices[i] < 0 || optionIndices[i] > 3) {
        return res.status(400).json({ error: `Please choose an answer for question ${i + 1}.` });
      }
    }

    // Human verification — this is the test's one and only submission
    // endpoint (synchronous: scores, stores and notifies in one request),
    // so it is the single point that gates all three. A missing or invalid
    // token stops here, before anything is scored, stored or sent.
    const turnstileCheck = await verifyTurnstileToken(plainText(body.turnstileToken, 2000), req.ip);
    if (!turnstileCheck.success) {
      return res.status(400).json({ error: 'Verification failed. Please try again.' });
    }

    const report = buildReport(optionIndices);
    const answersForStorage = optionIndices.map((optIndex, i) => ({
      q: QUESTIONS[i].id,
      questionText: QUESTIONS[i].text,
      answerText: QUESTIONS[i].options[optIndex].text
    }));

    const resultToken = crypto.randomBytes(24).toString('hex');
    await db.query(
      `INSERT INTO market_ready_submissions
       (result_token, status, first_name, last_name, business_name, email, phone, location, industry, employee_count, turnover_band, sale_timeframe, answers, context, consent_tom_review, consent_marketing, report)
       VALUES ($1, 'completed', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [resultToken, firstName, lastName, businessName, email, phone, location, industry, employeeCount, turnoverBand, saleTimeframe, JSON.stringify(answersForStorage), context, consentTomReview, consentMarketing, JSON.stringify(report)]
    );

    const resultPath = `/market-ready-test/result/${resultToken}`;
    const resultUrl = `${SITE_ORIGIN}${resultPath}`;
    res.json({ ok: true, resultUrl: resultPath });

    // Fire-and-forget: also record as a lead (parity with every other lead
    // type) so it surfaces in the existing admin "Leads & bookings" panel,
    // in addition to the full record in market_ready_submissions.
    db.query(
      `INSERT INTO leads (kind, name, email, phone, message)
       VALUES ('market_ready_test', $1, $2, $3, $4)`,
      [`${firstName} ${lastName}`.trim(), email, phone, `${businessName} — New Owner Ready Score ${report.overall_score}/100 (${report.rating})${consentTomReview ? ' — requested Tom\'s review' : ''}`]
    ).catch(err => console.error('Market Ready Test lead insert failed:', err.message));

    // Owner notification — full detail, always sent regardless of consent
    // (this is the business's own record of a completed assessment, not a
    // marketing send to the visitor).
    if (transporter) {
      const subjectFlag = consentTomReview ? '[REQUESTED REVIEW] ' : '';
      transporter.sendMail({
        from: NOTIFY_FROM,
        to: NOTIFY_FROM,
        ...(email ? { replyTo: email } : {}),
        subject: `${subjectFlag}Market Ready Test — ${businessName} — ${report.overall_score}/100`,
        text: [
          `Name: ${`${firstName} ${lastName}`.trim() || 'Not provided'}`,
          `Business: ${businessName}`,
          `Email: ${email || 'Not provided'}`,
          `Phone: ${phone || 'Not provided'}`,
          location && `Location: ${location}`,
          industry && `Industry: ${industry}`,
          employeeCount && `People working in the business: ${employeeCount}`,
          turnoverBand && `Turnover band: ${turnoverBand}`,
          saleTimeframe && `Considering a sale: ${saleTimeframe}`,
          `Requested Tom's review: ${consentTomReview ? 'Yes' : 'No'}`,
          `Opted into occasional emails: ${consentMarketing ? 'Yes' : 'No'}`,
          `Submitted: ${new Date().toISOString()}`,
          `Result link: ${resultUrl}`,
          '',
          `New Owner Ready Score: ${report.overall_score}/100 (${report.rating})`,
          '',
          'CATEGORY SCORES',
          `Transferability: ${report.category_scores.transferability}/20`,
          `Commercial resilience: ${report.category_scores.commercial_resilience}/20`,
          `Financial and evidential credibility: ${report.category_scores.financial_credibility}/15`,
          `Preparation for sale: ${report.category_scores.preparation_for_sale}/15`,
          `Buyer confidence: ${report.category_scores.buyer_confidence}/15`,
          `Owner readiness: ${report.category_scores.owner_readiness}/15`,
          '',
          report.red_flags.length ? `RED FLAGS\n${report.red_flags.map(r => `- ${r.title}: ${r.explanation}`).join('\n')}` : 'RED FLAGS\nNone identified.',
          '',
          context ? `ADDITIONAL CONTEXT FROM RESPONDENT\n${context}\n` : '',
          'FULL ANSWERS',
          formatAnswersForEmail(answersForStorage),
          '',
          context ? 'A free-text box was provided above — if this lead is worth a personal follow-up, consider pasting these answers and the context into Claude yourself to draft a bespoke note before you get in touch.' : ''
        ].filter(Boolean).join('\n')
      }).catch(err => console.error('Market Ready Test owner notification failed:', err.message));

      // Visitor's own copy of their result — only if they gave an email
      // address (now optional at intake, so there's sometimes nothing to
      // send this to). The result itself is always shown on-screen either
      // way via resultUrl.
      if (email) {
        transporter.sendMail({
          from: NOTIFY_FROM,
          to: email,
          subject: 'Your New Owner Ready Score',
          text: [
            `Thanks, ${firstName} — here is a copy of your Market Ready Test result.`,
            '',
            `New Owner Ready Score: ${report.overall_score}/100 (${report.rating})`,
            '',
            report.opening_assessment,
            '',
            `View your full result online: ${resultUrl}`,
            '',
            'Arrington Consultancy',
            'Tom Arrington, Managing Director',
            'tom@arringtonconsultancy.com',
            '01752 477026',
            'www.arringtonconsultancy.com'
          ].join('\n')
        }).catch(err => console.error('Market Ready Test visitor email failed:', err.message));
      }
    } else {
      console.warn('GMAIL_APP_PASSWORD not set — skipping Market Ready Test emails.');
    }
  } catch (err) {
    console.error('Market Ready Test submit error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or contact us at tom@arringtonconsultancy.com.' });
  }
});

// POST /api/market-ready-test/request-review — lets a visitor ask for Tom's
// review from the result page itself, for the case where they didn't tick
// that consent box at submission time but changed their mind after seeing
// their score. Idempotent: re-clicking an already-requested result is a
// harmless no-op rather than a duplicate notification.
router.post('/api/market-ready-test/request-review', requestReviewLimiter, async (req, res) => {
  try {
    const token = plainText((req.body || {}).token, 64);
    if (!/^[a-f0-9]{48}$/.test(token)) {
      return res.status(400).json({ error: 'Invalid request.' });
    }

    const { rows } = await db.query(
      'SELECT * FROM market_ready_submissions WHERE result_token = $1',
      [token]
    );
    if (rows.length === 0 || rows[0].status !== 'completed' || !rows[0].report) {
      return res.status(404).json({ error: 'Result not found.' });
    }
    const submission = rows[0];

    if (submission.consent_tom_review) {
      return res.json({ ok: true });
    }

    await db.query(
      `UPDATE market_ready_submissions SET consent_tom_review = true WHERE result_token = $1`,
      [token]
    );

    res.json({ ok: true });

    if (transporter) {
      const resultUrl = `${SITE_ORIGIN}/market-ready-test/result/${token}`;
      const report = submission.report;
      const answers = Array.isArray(submission.answers) ? submission.answers : [];
      transporter.sendMail({
        from: NOTIFY_FROM,
        to: NOTIFY_FROM,
        ...(submission.email ? { replyTo: submission.email } : {}),
        subject: `[REQUESTED REVIEW] Market Ready Test — ${submission.business_name} — ${report.overall_score}/100`,
        text: [
          `${submission.first_name} ${submission.last_name}`.trim() + ` has asked you to review their Market Ready Test result after seeing it.`,
          '',
          `Business: ${submission.business_name}`,
          `Email: ${submission.email || 'Not provided'}`,
          `Phone: ${submission.phone || 'Not provided'}`,
          `Result link: ${resultUrl}`,
          '',
          `New Owner Ready Score: ${report.overall_score}/100 (${report.rating})`,
          '',
          submission.context ? `ADDITIONAL CONTEXT FROM RESPONDENT\n${submission.context}\n` : '',
          'FULL ANSWERS',
          formatAnswersForEmail(answers)
        ].filter(Boolean).join('\n')
      }).catch(err => console.error('Market Ready Test request-review email failed:', err.message));
    }
  } catch (err) {
    console.error('Market Ready Test request-review error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or email tom@arringtonconsultancy.com directly.' });
  }
});

// POST /api/market-ready-test/share-notify — fire-and-forget owner heads-up
// when a visitor shares or copies their result. Sharing itself stays
// anonymous (no separate identity captured here), same pattern as the Owner
// Dependency Quiz's share-notify — the only difference is this one confirms
// the token is real first, so the notification can include which business.
router.post('/api/market-ready-test/share-notify', shareNotifyLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const token = plainText(body.token, 64);
    const platform = plainText(body.platform, 30);

    if (!VALID_SHARE_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'Invalid data.' });
    }
    if (!/^[a-f0-9]{48}$/.test(token)) {
      return res.status(400).json({ error: 'Invalid data.' });
    }

    res.json({ ok: true });

    if (transporter) {
      const { rows } = await db.query(
        'SELECT business_name, report FROM market_ready_submissions WHERE result_token = $1 AND status = $2',
        [token, 'completed']
      );
      if (rows.length === 0) return;
      const submission = rows[0];
      transporter.sendMail({
        from: NOTIFY_FROM,
        to: NOTIFY_FROM,
        subject: `Market Ready Test — shared (${platform})`,
        text: `${submission.business_name || 'Someone'}'s Market Ready Test result was shared via ${platform}.\n\nScore: ${submission.report?.overall_score}/100 (${submission.report?.rating})\nResult link: ${SITE_ORIGIN}/market-ready-test/result/${token}`
      }).catch(err => console.error('Market Ready Test share-notify email failed:', err.message));
    }
  } catch (err) {
    console.error('Market Ready Test share-notify error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = { router, mountPageRoute };
