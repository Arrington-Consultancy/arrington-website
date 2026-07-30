// Commercial Gaps Review (AI) — the interpretation step, and only the
// interpretation step. Anthropic never runs the interview (see
// lib/commercialGapsQuestions.js for that); it only reads the finished
// transcript once and returns structured JSON describing what it found.
//
// Mode is controlled by two env vars, both required together, so the
// default everywhere (local dev, this feature branch, and production until
// Tom explicitly turns it on) is the deterministic mock:
//   ANTHROPIC_API_KEY   — already present in Railway production (added for
//                          an earlier, unrelated diagnostic — see the
//                          website audit). Presence alone is not enough.
//   ENABLE_LIVE_AI=true — the actual on switch. Must be set separately so a
//                          key merely existing in an environment can never
//                          silently turn on paid calls.
//
// Whatever mode produced the data, it is validated against the same schema
// before anything is stored, emailed or shown. Non-conforming output is
// rejected — the live path gets one retry with the validation errors fed
// back in, then falls back to the mock rather than ever showing a visitor
// (or Tom) a broken or half-formed result.

const RESOURCE_TYPES = ['useful_thinking', 'case_study', 'article', 'social_post'];

const REQUIRED_STRING_FIELDS = ['headline', 'primary_issue', 'secondary_issue', 'useful_observation', 'visitor_summary'];
const REQUIRED_STRING_ARRAYS_MIN1 = ['supporting_evidence', 'assumptions', 'uncertainties'];
const BRIEFING_STRING_FIELDS = ['company_overview', 'likely_commercial_issue', 'motivation_for_enquiry', 'strongest_opening_question', 'suggested_first_meeting_direction'];
const BRIEFING_ARRAYS_MIN1 = ['evidence', 'assumptions_to_test'];
const BRIEFING_ARRAYS_MIN0 = ['contradictions', 'emotional_signals'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringArray(v, minItems) {
  return Array.isArray(v) && v.length >= minItems && v.every((item) => isNonEmptyString(item));
}

// Validates the AI's output against the schema required by the brief.
// Never throws — returns { valid, errors } so callers can retry or fall
// back instead of crashing the visitor's request.
function validateReviewSchema(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['root value must be an object'] };
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isNonEmptyString(obj[field])) errors.push(`${field} must be a non-empty string`);
  }
  for (const field of REQUIRED_STRING_ARRAYS_MIN1) {
    if (!isStringArray(obj[field], 1)) errors.push(`${field} must be an array of at least one non-empty string`);
  }

  const rr = obj.recommended_resource;
  if (!rr || typeof rr !== 'object') {
    errors.push('recommended_resource must be an object');
  } else {
    if (!isNonEmptyString(rr.title)) errors.push('recommended_resource.title must be a non-empty string');
    if (!isNonEmptyString(rr.url)) errors.push('recommended_resource.url must be a non-empty string');
    if (!RESOURCE_TYPES.includes(rr.type)) errors.push(`recommended_resource.type must be one of ${RESOURCE_TYPES.join(', ')}`);
    if (!isNonEmptyString(rr.reason)) errors.push('recommended_resource.reason must be a non-empty string');
  }

  const tb = obj.tom_briefing;
  if (!tb || typeof tb !== 'object') {
    errors.push('tom_briefing must be an object');
  } else {
    for (const field of BRIEFING_STRING_FIELDS) {
      if (!isNonEmptyString(tb[field])) errors.push(`tom_briefing.${field} must be a non-empty string`);
    }
    for (const field of BRIEFING_ARRAYS_MIN1) {
      if (!isStringArray(tb[field], 1)) errors.push(`tom_briefing.${field} must be an array of at least one non-empty string`);
    }
    for (const field of BRIEFING_ARRAYS_MIN0) {
      if (!Array.isArray(tb[field]) || !tb[field].every((item) => isNonEmptyString(item))) {
        errors.push(`tom_briefing.${field} must be an array of strings (may be empty)`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ------------------------------------------------------------
// Mock interpreter — the default everywhere until staging keys are set.
// Fully deterministic: same transcript in, same structured result out.
// Ranks categories by a plain risk-signal count so the mock still points at
// a genuine-looking primary/secondary issue instead of always the same one.
// ------------------------------------------------------------
const { matchResource } = require('./commercialGapsResources');

const RISK_KEYWORDS = /\b(just me|only me|no one else|nobody else|not sure|no idea|guess|hope|never really|don'?t track|don'?t know|no process|no plan|manual|spreadsheet|chaotic|stressed|worry|worried|behind|drifting|always been|used to work|not really)\b/i;

function riskScore(answerText) {
  const text = String(answerText || '');
  let score = 0;
  if (RISK_KEYWORDS.test(text)) score += 2;
  if (text.trim().length < 25) score += 1;
  return score;
}

function buildMockInterpretation({ name, company, location, transcript }) {
  const entries = (Array.isArray(transcript) ? transcript : []).filter((e) => !e.isClarification);
  const scored = entries
    .map((e) => ({ category: e.category, label: e.label, answerText: e.answerText, score: riskScore(e.answerText) }))
    .sort((a, b) => b.score - a.score);

  const primary = scored[0] || { category: 'owner_dependency', label: 'Owner dependency', answerText: '' };
  const secondary = scored[1] || scored[0] || { category: 'margin', label: 'Margin', answerText: '' };

  const shortQuote = (text, max) => {
    const t = String(text || '').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };

  const companyLabel = company ? company : 'the business';
  const supporting_evidence = entries
    .filter((e) => e.answerText)
    .slice(0, 4)
    .map((e) => `${e.label}: "${shortQuote(e.answerText, 140)}"`);

  const resource = matchResource(primary.category);

  return {
    headline: `Where ${companyLabel} is most exposed right now: ${primary.label.toLowerCase()}`,
    primary_issue: `${primary.label} looks like the area under the most commercial pressure, based on how you described it: "${shortQuote(primary.answerText, 160)}"`,
    secondary_issue: `${secondary.label} is worth watching too. Your answer there ("${shortQuote(secondary.answerText, 120)}") suggests it is not yet a crisis, but it is not settled either.`,
    supporting_evidence: supporting_evidence.length ? supporting_evidence : [`Based on the answers given about ${companyLabel}, no single answer stood out as a red flag on its own — the pattern across several answers is what points to ${primary.label.toLowerCase()}.`],
    assumptions: [
      `This reading assumes your answers reflect how the business runs on a typical week, not an unusually good or bad one.`,
      `It assumes "${companyLabel}" is being described as it is today, not as you would like it to be.`
    ],
    uncertainties: [
      `A short set of written answers cannot fully separate a genuine structural issue from an unusually busy or unusually quiet period.`,
      `Numbers were not verified. Where you described margin, pricing or demand, this reflects your own sense of the position, not audited figures.`
    ],
    useful_observation: `Several of your answers point back to the same underlying pattern: ${primary.label.toLowerCase()} and ${secondary.label.toLowerCase()} appear connected, not separate problems.`,
    recommended_resource: resource,
    visitor_summary: `Thanks for the detail, ${name || 'there'}. Based on what you have described about ${companyLabel}${location ? ` in ${location}` : ''}, the area putting the most pressure on the business right now looks to be ${primary.label.toLowerCase()}. That is not a verdict and it is not the whole picture, it is a starting point for a proper conversation.`,
    tom_briefing: {
      company_overview: `${companyLabel}${location ? ` (${location})` : ''}. Self-described business model: "${shortQuote(entries.find((e) => e.category === 'business_model')?.answerText, 200) || 'not captured'}"`,
      likely_commercial_issue: `${primary.label} — flagged by risk-signal language in the visitor's own answer: "${shortQuote(primary.answerText, 200)}"`,
      evidence: supporting_evidence.length ? supporting_evidence : [`No single strongly-worded answer, but ${primary.label.toLowerCase()} scored highest across the pattern of answers overall.`],
      contradictions: [],
      emotional_signals: entries.some((e) => /stressed|worry|worried|exhausted|overwhelmed|frustrat/i.test(e.answerText || ''))
        ? [`Language suggesting personal strain appeared in at least one answer — worth approaching gently rather than leading with numbers.`]
        : [],
      motivation_for_enquiry: `Completed an unprompted, free-text commercial review rather than a quick multiple-choice quiz — suggests genuine curiosity or existing discomfort about ${primary.label.toLowerCase()}, not idle browsing.`,
      strongest_opening_question: `You mentioned "${shortQuote(primary.answerText, 100)}" when I asked about ${primary.label.toLowerCase()}. What would need to be true for that to stop being a problem?`,
      assumptions_to_test: [
        `Confirm whether ${primary.label.toLowerCase()} is a new pressure or a long-standing, tolerated one.`,
        `Confirm who else in the business, if anyone, would agree with this reading.`
      ],
      suggested_first_meeting_direction: `Open on ${primary.label.toLowerCase()}, using their own words back to them, then listen for whether ${secondary.label.toLowerCase()} comes up unprompted before raising it yourself.`
    }
  };
}

// ------------------------------------------------------------
// Live interpreter — only used when ANTHROPIC_API_KEY and
// ENABLE_LIVE_AI=true are both set. Uses @anthropic-ai/sdk.
// ------------------------------------------------------------
const SYSTEM_PROMPT = `You are the private analyst behind Arrington Consultancy's Commercial Gaps Review.

You are given a transcript of free-text answers an owner run business gave about their business model, commercial priorities, pricing, margin, demand, capacity, delivery, owner dependency, decision making, missed opportunities and commercial blind spots.

Your job is to interpret the evidence already collected. You do not ask questions, you do not run a conversation, and you do not produce an implementation plan, checklist, operating system or financial model. You surface the issue; Tom Arrington solves it in a real conversation.

The five visitor-facing fields (headline, primary_issue, secondary_issue, useful_observation, visitor_summary) must give the visitor real clarity about which issue is worth investigating and why it matters, demonstrating that you have genuinely understood their business. They must never include a recommendation, a next step, a suggested fix, or reasoning about how or in what order to address anything, not even in a single clause. If a sentence would tell the visitor what to do about what you found, it belongs in tom_briefing instead, never in a visitor-facing field.

Write in UK English, in Arrington Consultancy's voice: direct, plain, human, like a business owner, not a marketing agency or a chatbot. Never use em dashes. Never use the words solutions, synergy, leverage, empower, journey, holistic, tailored, bespoke or coach.

Respond with ONLY a single JSON object, no prose before or after it, no markdown code fence, matching exactly this shape:
{
  "headline": string,
  "primary_issue": string,
  "secondary_issue": string,
  "supporting_evidence": string[],
  "assumptions": string[],
  "uncertainties": string[],
  "useful_observation": string,
  "recommended_resource": { "title": string, "url": string, "type": "useful_thinking"|"case_study"|"article"|"social_post", "reason": string },
  "visitor_summary": string,
  "tom_briefing": {
    "company_overview": string,
    "likely_commercial_issue": string,
    "evidence": string[],
    "contradictions": string[],
    "emotional_signals": string[],
    "motivation_for_enquiry": string,
    "strongest_opening_question": string,
    "assumptions_to_test": string[],
    "suggested_first_meeting_direction": string
  }
}

visitor_summary is the only long-form text the visitor reads directly, alongside headline, primary_issue, secondary_issue and useful_observation. It should feel like it has genuinely understood their business, without solving it for them. tom_briefing is never shown to the visitor — write it as a private note to Tom.`;

function extractJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

async function callAnthropic({ name, company, location, transcript }, priorErrors) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPayload = {
    visitor: { name, company, location },
    transcript: (transcript || []).map((e) => ({
      category: e.category,
      question: e.text,
      isClarification: !!e.isClarification,
      answer: e.answerText
    })),
    recommended_resource_options: require('./commercialGapsResources').RESOURCES
  };

  let userContent = `Here is the transcript. Reply with the JSON object only.\n\n${JSON.stringify(userPayload, null, 2)}`;
  if (priorErrors && priorErrors.length) {
    userContent += `\n\nYour previous reply did not match the required schema. Fix these problems and reply again with the JSON object only, nothing else:\n- ${priorErrors.join('\n- ')}`;
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    // 2000 was too tight: the full schema (visitor fields plus the
    // multi-field tom_briefing object) got cut off mid-JSON on staging,
    // surfacing as "Unexpected end of JSON input". 4096 gives real headroom.
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }]
  });

  if (response.stop_reason === 'max_tokens') {
    console.error('Commercial Gaps Review: live AI response hit max_tokens and was truncated.');
  }

  const textBlock = (response.content || []).find((b) => b.type === 'text');
  return extractJson(textBlock && textBlock.text);
}

async function interpretCommercialGaps({ name, company, location, transcript }) {
  const liveEnabled = !!process.env.ANTHROPIC_API_KEY && process.env.ENABLE_LIVE_AI === 'true';

  if (liveEnabled) {
    // A malformed or truncated reply (JSON.parse throwing) gets exactly the
    // same one retry as a well-formed-but-schema-invalid reply — both are
    // "the model didn't follow the required shape", so both feed the
    // problem back and get one more attempt before falling back to mock.
    let firstErrors;
    try {
      const first = await callAnthropic({ name, company, location, transcript });
      const firstCheck = validateReviewSchema(first);
      if (firstCheck.valid) return { mode: 'live', data: first };
      firstErrors = firstCheck.errors;
    } catch (err) {
      firstErrors = [`Reply could not be parsed as JSON: ${err.message}`];
    }

    console.error('Commercial Gaps Review: live AI output not usable, retrying once.', firstErrors);
    try {
      const retry = await callAnthropic({ name, company, location, transcript }, firstErrors);
      const retryCheck = validateReviewSchema(retry);
      if (retryCheck.valid) return { mode: 'live', data: retry };
      console.error('Commercial Gaps Review: live AI output failed validation twice, falling back to mock.', retryCheck.errors);
    } catch (err) {
      console.error('Commercial Gaps Review: live AI call failed on retry, falling back to mock.', err.message);
    }
  }

  const mockData = buildMockInterpretation({ name, company, location, transcript });
  const mockCheck = validateReviewSchema(mockData);
  if (!mockCheck.valid) {
    // Should be unreachable — the mock is fully deterministic — but this
    // must never let an invalid object reach the database or a visitor.
    throw new Error(`Commercial Gaps Review: mock interpretation failed its own schema: ${mockCheck.errors.join('; ')}`);
  }
  return { mode: 'mock', data: mockData };
}

module.exports = {
  RESOURCE_TYPES,
  validateReviewSchema,
  buildMockInterpretation,
  interpretCommercialGaps
};
