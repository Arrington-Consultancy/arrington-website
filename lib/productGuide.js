// Arrington Product Guide — the controlled recommendation engine.
//
// This is deliberately NOT an AI diagnostic. Per the approved brief, the
// underlying recommendation logic must stay "controlled, deterministic
// enough to audit and testable" — the same reasoning that took the Market
// Ready Test off live AI scoring (see routes/marketReadyTest.js and
// CLAUDE.md): a public page that could recommend a price nobody here wrote,
// or that spends money on demand, is not worth it for a routing decision.
//
// computeRecommendation() is a pure function: same answers in, same
// recommendation out, nothing here calls a network or a database. AI (see
// lib/productGuideAI.js) is layered on top afterwards, purely to phrase
// free text back to the visitor and to write Tom's internal summary — it
// never influences which offer gets recommended.
//
// Recommendation ids match lib/whereToStartOffers.js OFFERS keys exactly,
// so the Product Guide result can pull price/name/path straight from the
// existing offer catalogue instead of duplicating it.

const { OFFERS } = require('./whereToStartOffers');

// ------------------------------------------------------------
// Questions. Six controlled-choice, two free-text (one required, one
// optional), inside the brief's approximate 6-8 range. Ids are the answer
// object's keys; a 'choice' question's options carry both the value stored
// in the answer and the label shown to the visitor.
// ------------------------------------------------------------
const QUESTIONS = [
  {
    id: 'whatChange',
    type: 'text',
    label: 'What do you most want to change?',
    prompt: 'In your own words, what is it you most want to change about the business right now?',
    placeholder: 'Write a sentence or two, as you would explain it to us directly.',
    required: true,
    maxLength: 1000
  },
  {
    id: 'sixMonths',
    type: 'text',
    label: 'Six months from now',
    prompt: 'If this went well, what would be different in around six months?',
    placeholder: 'What would look or feel different?',
    required: true,
    maxLength: 1000
  },
  {
    id: 'clarity',
    type: 'choice',
    label: 'How clear is the issue?',
    prompt: 'Does the issue feel clear, or is it hard to pin down?',
    options: [
      { value: 'clear', label: 'Clear and specific. I know what it is.' },
      { value: 'multiple', label: 'Several things going on, hard to know where to start.' },
      { value: 'unclear', label: "There's something wrong but I can't quite name it." }
    ],
    required: true
  },
  {
    id: 'priorArrington',
    type: 'choice',
    label: 'Worked with us before?',
    prompt: 'Have you worked with Arrington before?',
    options: [
      { value: 'none', label: 'No, this would be the first time.' },
      { value: 'previous', label: 'Yes, we have worked together before.' },
      { value: 'referred', label: "No, but I've been referred by someone who has." }
    ],
    required: true
  },
  {
    id: 'businessSize',
    type: 'choice',
    label: 'Business size',
    prompt: 'Roughly how big is the business?',
    options: [
      { value: 'solo', label: 'Just me' },
      { value: 'small', label: '2-10 people' },
      { value: 'medium', label: '11-50 people' },
      { value: 'large', label: '50+ people' }
    ],
    required: true
  },
  {
    id: 'succession',
    type: 'choice',
    label: 'Stepping back, sale or succession',
    prompt: 'Are you thinking about stepping back, selling, or succession at all?',
    options: [
      { value: 'none', label: 'Not at all, not on my mind.' },
      { value: 'longterm', label: 'Somewhere on the horizon, not urgent.' },
      { value: 'active_consider', label: "Actively considering it, within the next couple of years." },
      { value: 'active_progress', label: 'Yes, already in progress.' }
    ],
    required: true
  },
  {
    id: 'urgency',
    type: 'choice',
    label: 'How urgent does this feel?',
    prompt: 'How urgent does this feel to you?',
    options: [
      { value: 'low', label: 'Not urgent, thinking ahead.' },
      { value: 'medium', label: 'Fairly soon.' },
      { value: 'high', label: 'Urgent.' }
    ],
    required: true
  },
  {
    id: 'anythingElse',
    type: 'text',
    label: 'Anything else?',
    prompt: 'Anything important we have not asked about?',
    placeholder: 'Optional — anything you think matters that the questions above did not cover.',
    required: false,
    maxLength: 1000
  }
];

const CHOICE_QUESTION_IDS = QUESTIONS.filter((q) => q.type === 'choice').map((q) => q.id);
const TEXT_QUESTION_IDS = QUESTIONS.filter((q) => q.type === 'text').map((q) => q.id);

function questionById(id) {
  return QUESTIONS.find((q) => q.id === id) || null;
}

// ------------------------------------------------------------
// Validation — every choice answer must be one of its question's real
// option values, so a tampered client request can never smuggle in an
// answer combination the questions themselves do not offer.
// ------------------------------------------------------------
function validateAnswers(answers) {
  const errors = [];
  if (!answers || typeof answers !== 'object') {
    return { valid: false, errors: ['answers must be an object'] };
  }

  for (const q of QUESTIONS) {
    const value = answers[q.id];
    if (q.type === 'choice') {
      const allowed = q.options.map((o) => o.value);
      if (!allowed.includes(value)) {
        errors.push(`${q.id} must be one of: ${allowed.join(', ')}`);
      }
    } else if (q.type === 'text') {
      const text = typeof value === 'string' ? value : '';
      if (q.required && text.trim().length === 0) {
        errors.push(`${q.id} is required`);
      }
      if (text.length > q.maxLength) {
        errors.push(`${q.id} exceeds ${q.maxLength} characters`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ------------------------------------------------------------
// Deterministic signal detection from free text. Plain keyword matching,
// nothing inferred by a model — every match here is auditable by reading
// the regular expression that produced it.
// ------------------------------------------------------------
const SENSITIVE_LEGAL = /\b(solicitor|lawsuit|being sued|suing|litigation|legal action|contract dispute|breach of contract|court case|going to court)\b/i;
const SENSITIVE_TAX = /\b(hmrc|tax investigation|vat investigation|tax bill|tax return|self assessment|tax avoidance|tax evasion)\b/i;
const SENSITIVE_INSOLVENCY = /\b(insolven\w*|liquidat\w*|cannot pay|can't pay|winding up|cva|administration|bankrupt\w*|going under|can't pay (my |our )?(debts|staff|suppliers))\b/i;
const SENSITIVE_HR = /\b(unfair dismissal|employment tribunal|grievance|disciplinary|redundanc\w*|discrimination claim|sacked|firing (someone|an employee|a member of staff)|hr complaint|harassment claim)\b/i;

const WEBSITE_SIGNAL = /\b(website|web ?site|online (presence|shop|store)|e-?commerce|new site|rebuild(ing)? (my |our |the )?site|web design|website build)\b/i;
const BROADER_COMMERCIAL_SIGNAL = /\b(margin|pricing|profit|cash ?flow|staff|team|operations?|processes?|growth|strategy|sales|customers?|supplier|costs?|structure|systems?)\b/i;
const BROAD_ENGAGEMENT_SIGNAL = /\b(help (us |me )?(actually )?(implement|fix|sort|rebuild)|ongoing (help|support)|hands-?on|fully supported|ready to invest properly|need (this |it )?(properly )?(sorted|fixed))\b/i;

function combinedFreeText(answers) {
  return TEXT_QUESTION_IDS
    .map((id) => (typeof answers[id] === 'string' ? answers[id] : ''))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function detectSensitiveTopic(text) {
  if (SENSITIVE_LEGAL.test(text)) return 'legal';
  if (SENSITIVE_TAX.test(text)) return 'tax';
  if (SENSITIVE_INSOLVENCY.test(text)) return 'insolvency';
  if (SENSITIVE_HR.test(text)) return 'hr_employment';
  return null;
}

// ------------------------------------------------------------
// The core routing decision. Deliberately does not read answers.urgency at
// all — urgency affects response-time messaging only (see
// responseTimeMessage below), never the recommendation itself. That is
// enforced by construction here, not just by convention: this function's
// branches never reference answers.urgency.
// ------------------------------------------------------------
function computeRecommendation(answers) {
  const text = combinedFreeText(answers);
  const whatChangeLength = String(answers.whatChange || '').trim().length;

  const sensitiveTopic = detectSensitiveTopic(text);
  if (sensitiveTopic) {
    return {
      recommendationId: 'conversation',
      reason: 'sensitive_topic',
      sensitiveTopic,
      laterRouteIds: [],
      websiteHit: false,
      broaderHit: false,
      signalCount: 0
    };
  }

  // Not enough to responsibly recommend paid work. Two distinct cases:
  // - The visitor explicitly said "there's something wrong but I can't
  //   name it" — that self-reported uncertainty is itself the signal, so
  //   the bar for enough free-text detail to override it is high.
  // - The visitor picked "clear and specific" (or "several things, hard
  //   to prioritise") but gave next to no detail — the contradictory- or
  //   uncertain-answers case, caught by a low bar that only fires on
  //   genuinely thin answers.
  const insufficientInfo =
    whatChangeLength < 10 ||
    (answers.clarity === 'unclear' && whatChangeLength < 80);

  if (insufficientInfo) {
    return {
      recommendationId: 'conversation',
      reason: 'insufficient_information',
      sensitiveTopic: null,
      laterRouteIds: ['commercial_review'],
      websiteHit: false,
      broaderHit: false,
      signalCount: 0
    };
  }

  const websiteHit = WEBSITE_SIGNAL.test(text);
  const broaderHit = BROADER_COMMERCIAL_SIGNAL.test(text);

  let signalCount = 0;
  if (answers.priorArrington === 'previous') signalCount += 1;
  if (answers.priorArrington === 'referred' && answers.clarity === 'clear') signalCount += 1;
  if (answers.businessSize === 'large') signalCount += 1;
  if (BROAD_ENGAGEMENT_SIGNAL.test(text)) signalCount += 1;

  // Base tier: the lowest sensible next step given what was actually said,
  // before any broader-engagement signals are applied.
  let base;
  let reason;
  if (answers.clarity === 'clear' && websiteHit && !broaderHit) {
    base = 'website_build';
    reason = 'website_only';
  } else if (websiteHit && broaderHit) {
    base = 'commercial_review';
    reason = 'website_plus_broad_commercial';
  } else {
    base = 'commercial_review';
    reason = 'broad_commercial';
  }

  let recommendationId = base;
  let laterRouteIds = [];

  if (base === 'website_build') {
    laterRouteIds = ['commercial_review'];
    if (signalCount >= 1) {
      recommendationId = 'full_review_website_build';
      reason = 'website_only_with_engagement_signal';
      laterRouteIds = [];
    }
  } else {
    // base === 'commercial_review'
    laterRouteIds = websiteHit
      ? ['full_commercial_review', 'website_build']
      : ['full_commercial_review'];

    if (signalCount >= 2 && websiteHit) {
      recommendationId = 'full_review_website_build';
      reason = `${reason}_with_engagement_signal`;
      laterRouteIds = [];
    } else if (signalCount >= 1) {
      recommendationId = 'full_commercial_review';
      reason = `${reason}_with_engagement_signal`;
      laterRouteIds = websiteHit ? ['website_build'] : [];
    }
  }

  return {
    recommendationId,
    reason,
    sensitiveTopic: null,
    laterRouteIds,
    websiteHit,
    broaderHit,
    signalCount
  };
}

// ------------------------------------------------------------
// Response-time messaging — the only place urgency is used. Never touches
// recommendationId.
// ------------------------------------------------------------
function responseTimeMessage(urgency) {
  if (urgency === 'high') {
    return "Given how urgent this feels, we'll aim to come back to you within one business day.";
  }
  if (urgency === 'medium') {
    return "We'll aim to come back to you within a couple of business days.";
  }
  return "There's no rush on our end — we'll come back to you at a sensible pace.";
}

// ------------------------------------------------------------
// Deterministic explanation copy. No AI required for the core result —
// see lib/productGuideAI.js for the optional, purely additive phrasing
// layer used only once a visitor asks to be contacted.
// ------------------------------------------------------------
const WHY_TEXT = {
  sensitive_topic: 'This touches on something worth talking through directly rather than guessing at from a form. Arrington is the right first port of call here; if outside expertise is genuinely needed alongside our own work, Tom will say so directly once he understands the situation properly.',
  insufficient_information: "There isn't quite enough here yet to responsibly point you at a priced piece of work. A short conversation is the fastest, lowest-commitment way to work out what's actually going on.",
  website_only: 'What you have described is specifically about the website, and it sounds clear enough to move straight to a fixed-price build.',
  website_only_with_engagement_signal: 'What you have described is specifically about the website, but given what you have told us, it is worth starting with a proper look at the wider commercial picture alongside the build, so the site is built around what the business actually needs.',
  broad_commercial: "What you have described is a commercial question first, not a technical one. A Commercial Review is the lowest-commitment way to get a clear, written read on it before committing to anything bigger.",
  broad_commercial_with_engagement_signal: 'Given what you have told us, this looks like more than a single review can settle on its own, so it is worth starting with review and implementation support together.',
  website_plus_broad_commercial: 'There is a website question in here, but it sits inside a wider commercial picture that is not fully clear yet. A Commercial Review is the sensible starting point, and the review itself will make clear whether the website should be part of what follows.',
  website_plus_broad_commercial_with_engagement_signal: 'There is a website question tangled up with a wider commercial picture here, and given what you have told us, it is worth tackling both together from the start.'
};

function whyText(reason) {
  return WHY_TEXT[reason] || WHY_TEXT.broad_commercial;
}

// ------------------------------------------------------------
// buildResult() — the single entry point routes/productGuide.js calls.
// Combines the deterministic decision with offer data pulled from the
// existing Where to Start catalogue and returns everything a view needs
// to render "WE'D START HERE / WHAT HAPPENS NEXT / POSSIBLE LATER ROUTES"
// without the view needing to know any of the routing logic itself.
// ------------------------------------------------------------
function offerSummary(offerId) {
  const offer = OFFERS[offerId];
  if (!offer) return null;
  return {
    id: offer.id,
    name: offer.name,
    pricePence: offer.pricePence,
    path: offer.path || (offer.id === 'conversation' ? '/where-to-start#conversation-offer' : '/where-to-start')
  };
}

function buildResult(answers) {
  const decision = computeRecommendation(answers);
  return {
    recommendation: offerSummary(decision.recommendationId),
    reason: decision.reason,
    sensitiveTopic: decision.sensitiveTopic,
    why: whyText(decision.reason),
    whatHappensNext: responseTimeMessage(answers.urgency),
    laterRoutes: decision.laterRouteIds.map(offerSummary).filter(Boolean),
    signals: {
      websiteHit: decision.websiteHit,
      broaderHit: decision.broaderHit,
      signalCount: decision.signalCount
    }
  };
}

module.exports = {
  QUESTIONS,
  CHOICE_QUESTION_IDS,
  TEXT_QUESTION_IDS,
  questionById,
  validateAnswers,
  computeRecommendation,
  responseTimeMessage,
  whyText,
  buildResult
};
