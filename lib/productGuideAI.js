// Arrington Product Guide — the optional AI layer.
//
// This file exists to do exactly one thing: turn the visitor's own free-text
// answers into a short, readable gloss for Tom's internal briefing email,
// once (and only once) a visitor asks to be contacted. It never runs before
// that point, and it never influences the recommendation itself — that
// decision is made entirely by lib/productGuide.js's computeRecommendation()
// before this file is ever called.
//
// Deliberately lazy: the deterministic result shown to every visitor costs
// nothing and needs no network call (see lib/productGuide.js buildResult()).
// This file only runs for visitors who have already opted into contact,
// which bounds any real API cost to genuine leads, not every anonymous
// visitor who tries the guide — the same reasoning that took the Market
// Ready Test off live-AI scoring (see CLAUDE.md) applied one step earlier
// in this funnel, before it became a problem here.
//
// Same two-env-var gate as lib/commercialGapsAI.js: ANTHROPIC_API_KEY and
// ENABLE_LIVE_AI=true must both be set, so a key merely existing in an
// environment can never silently turn on paid calls. Default everywhere is
// the deterministic fallback below, which simply hands Tom the visitor's own
// words — never a worse outcome than the AI path, just a plainer one.

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// Validates the AI's output. Only one field is asked for, so this is much
// smaller than lib/commercialGapsAI.js's schema, but the discipline is the
// same: never let a malformed or missing reply reach Tom's email unchecked.
function validateSummarySchema(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['root value must be an object'] };
  }
  if (!isNonEmptyString(obj.summary)) {
    return { valid: false, errors: ['summary must be a non-empty string'] };
  }
  return { valid: true, errors: [] };
}

// ------------------------------------------------------------
// Deterministic fallback — the default everywhere until Tom explicitly
// turns live mode on. Simply hands Tom the visitor's own free text, clearly
// labelled, rather than inventing any interpretation of it.
// ------------------------------------------------------------
function buildFallbackSummary({ whatChange, sixMonths, anythingElse }) {
  const parts = [
    `What they want to change: ${whatChange || 'not given'}`,
    `Where they want to be in six months: ${sixMonths || 'not given'}`
  ];
  if (anythingElse) parts.push(`Anything else they added: ${anythingElse}`);
  return { summary: parts.join('\n') };
}

// ------------------------------------------------------------
// Live interpreter — only used when ANTHROPIC_API_KEY and
// ENABLE_LIVE_AI=true are both set. Uses @anthropic-ai/sdk, already a
// project dependency for the Commercial Gaps Review.
// ------------------------------------------------------------
const SYSTEM_PROMPT = `You write a short private briefing note for Tom Arrington, based on a few free-text answers someone gave in the Arrington Product Guide, a tool that recommends which Arrington service to start with.

You are not deciding anything and not writing anything the visitor will see. A separate, fixed piece of logic already chose the recommendation; you are only summarising what they said in their own words, for Tom to read before he gets in touch.

Write two or three plain sentences, UK English, direct and factual, like a colleague passing on a note. Never invent a fact that is not in the answers. Never suggest a course of action, a fix, or a next step. Never mention or recommend any external professional (accountant, solicitor, insolvency practitioner, HR adviser, financial adviser). Never use em dashes or the words solutions, synergy, leverage, empower, journey, holistic, tailored, bespoke or coach.

Respond with ONLY a single JSON object, no prose before or after it, no markdown code fence, matching exactly this shape:
{ "summary": string }`;

function extractJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

async function callAnthropic({ whatChange, sixMonths, anythingElse }, priorErrors) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let userContent = `Here are the visitor's free-text answers. Reply with the JSON object only.\n\n${JSON.stringify({ whatChange, sixMonths, anythingElse }, null, 2)}`;
  if (priorErrors && priorErrors.length) {
    userContent += `\n\nYour previous reply did not match the required schema. Fix these problems and reply again with the JSON object only, nothing else:\n- ${priorErrors.join('\n- ')}`;
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }]
  });

  const textBlock = (response.content || []).find((b) => b.type === 'text');
  return extractJson(textBlock && textBlock.text);
}

async function summarizeForTom({ whatChange, sixMonths, anythingElse }) {
  const liveEnabled = !!process.env.ANTHROPIC_API_KEY && process.env.ENABLE_LIVE_AI === 'true';

  if (liveEnabled) {
    let firstErrors;
    try {
      const first = await callAnthropic({ whatChange, sixMonths, anythingElse });
      const firstCheck = validateSummarySchema(first);
      if (firstCheck.valid) return { mode: 'live', data: first };
      firstErrors = firstCheck.errors;
    } catch (err) {
      firstErrors = [`Reply could not be parsed as JSON: ${err.message}`];
    }

    console.error('Product Guide: live AI summary not usable, retrying once.', firstErrors);
    try {
      const retry = await callAnthropic({ whatChange, sixMonths, anythingElse }, firstErrors);
      const retryCheck = validateSummarySchema(retry);
      if (retryCheck.valid) return { mode: 'live', data: retry };
      console.error('Product Guide: live AI summary failed validation twice, falling back.', retryCheck.errors);
    } catch (err) {
      console.error('Product Guide: live AI summary call failed on retry, falling back.', err.message);
    }
  }

  return { mode: 'mock', data: buildFallbackSummary({ whatChange, sixMonths, anythingElse }) };
}

module.exports = {
  validateSummarySchema,
  buildFallbackSummary,
  summarizeForTom
};
