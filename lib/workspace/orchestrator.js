// Arrington AI Workspace: orchestrator.
//
// Adapted from the Scott demonstration's proven orchestrator SHAPE
// (permission-filtered context built before the prompt, a strict JSON
// reply contract, transient-error retries, injectable client factory
// for tests) while reusing NONE of Scott's fictional content: no Scott
// facts, identities, prompts or sessions appear here. Per the approved
// Workspace control pack, the router below is faceless plumbing that
// selects a lane's context; it is not a persona and never speaks as a
// person.
//
// AMENDED 31/08/2026 (finding T1), on Tom's instruction "Make Ruth in
// Arrington as well." This used to end "and no tenth worker identity
// exists". A receptionist now presents this router's output and does
// have a name, so that clause was no longer true. What is unchanged:
// no tenth WORKER exists - she holds no source class, no ceiling and no
// clearance, reads no record, and cannot alter what this router
// returns. The register is still nine lanes. See
// lib/workspace/receptionist.js.
//
// Live AI is gated on its own flag (ENABLE_WORKSPACE_AI), separate from
// ENABLE_SCOTT_AI and ENABLE_LIVE_AI, so enabling one system can never
// silently enable another.

const { LANES, laneById, filterRecordsForLane } = require('./lanes');
const { filterRecordsForClearance } = require('./clearance');
const repo = require('./repo');

const MODEL = 'claude-sonnet-5';
const MAX_CONTEXT_RECORDS = 24;

function isWorkspaceAIEnabled() {
  return !!process.env.ANTHROPIC_API_KEY && process.env.ENABLE_WORKSPACE_AI === 'true';
}

// Boot-time status line. Reports the key's LENGTH only, never any part
// of its contents (the Railway trailing-newline incident is why).
function describeWorkspaceAIStatus() {
  const key = process.env.ANTHROPIC_API_KEY;
  const flag = process.env.ENABLE_WORKSPACE_AI;
  return [
    key ? `ANTHROPIC_API_KEY present (${String(key).length} chars)` : 'ANTHROPIC_API_KEY MISSING or empty',
    flag === 'true' ? "ENABLE_WORKSPACE_AI='true'" : `ENABLE_WORKSPACE_AI is ${flag === undefined ? 'unset' : JSON.stringify(flag)}, needs exactly 'true'`
  ].join('; ');
}

// Deterministic keyword routing. Order matters: first match wins, and a
// question that matches nothing gets the narrow general context rather
// than everything, because task necessity is a permission leg, not a
// nicety.
const ROUTING_RULES = [
  { laneId: 'google_ads', pattern: /\b(google ads|paid (ads|advertising|media)|ppc|adwords|campaign|cost per (lead|click)|conversion tracking)\b/i },
  { laneId: 'website_hosting', pattern: /\b(website|hosting|deploy|railway|github|domain|dns|cms|server|stripe|checkout|seo tag)\b/i },
  // The dead 'opportunit' stem that used to sit at the head of this
  // group is gone; the last rule in this list is what replaced it, and
  // carries the reasoning for why it is there rather than here.
  // Removing the stem changes no routing: the group's
  // trailing \b required a word boundary straight after the stem and the
  // next character is always a letter, so it could only ever have
  // matched the non-word "opportunit".
  { laneId: 'opportunity_builder', pattern: /\b(lead(s)?\b|prospect|pipeline|proposal|commercial conversation|ivybridge|icabbi)\b/i },
  { laneId: 'brain_keeper', pattern: /\b(drive|brain (index|structure|maintenance)|document status|superseded|archive|handoff standard)\b/i },
  { laneId: 'governance_assurance', pattern: /\b(governance|assurance|constitution|permission|clearance|audit|stop decision|compliance|rulebook)\b/i },
  { laneId: 'social_content_builder', pattern: /\b(linkedin|social (content|post|media)|story bank|published post)\b/i },
  { laneId: 'ai_recommendation_visibility', pattern: /\b(ai (visibility|recommendation)|cited by ai|chatgpt recommend|shortlist)\b/i },
  { laneId: 'ai_demonstration_builder', pattern: /\b(scott|demonstration|armchair|knitting|fictional)\b/i },
  { laneId: 'ai_workspace_builder', pattern: /\b(workspace|control pack|brain gap standard|acceptance plan|implementation brief)\b/i },

  // "opportunity" / "opportunities", deliberately LAST and deliberately
  // not in the opportunity rule above.
  //
  // The defect it fixes: that rule opened with a stem, 'opportunit',
  // meant to catch both spellings, but the group's trailing \b requires
  // a word boundary immediately after the stem and the next character is
  // always a letter. So the most obvious phrasing a person would use
  // reached no lane at all. The question fell to the general context,
  // which carries no opportunity source class, and Ruth answered from
  // the authority and register records with the opportunity material
  // never in front of her. (Not the same as her reporting an empty
  // brain: with the snapshot seeded the general context is non-empty, so
  // she answers from what she has and simply cannot see the pipeline.)
  //
  // Why last rather than repaired in place. Routing is first match wins,
  // and of the six rules after the third one, five are capped at
  // 'commercial': brain_keeper, social_content_builder,
  // ai_recommendation_visibility, ai_demonstration_builder and
  // ai_workspace_builder. (governance_assurance is the exception and is
  // also 'confidential'.) Putting the word in the third rule pre-empted
  // all of them, so "draft a LinkedIn post about the opportunities we
  // won" left social_content_builder for a confidential-ceiling lane and
  // its context grew from 2 records to 4. Human clearance still gated the
  // result, but task necessity is a permission leg in its own right and
  // that widened it. Placed here the word is what it actually is, a weak
  // signal: any question that names a specific lane's subject still goes
  // to that lane, and only a question about opportunities and nothing
  // else lands here.
  //
  // This avoids ADDING an instance of that pre-emption. It does not
  // eliminate the class, and it should not be read as doing so: the
  // sibling keywords left in the third rule still pre-empt the same
  // lanes, so "draft a LinkedIn post about the leads we won" does reach
  // this lane today. That is pre-existing behaviour, untouched here and
  // flagged for its own decision rather than changed inside a bounded
  // fix for one word.
  //
  // Known consequence, pinned by test and stated plainly because it is
  // a cost this change imposes, not one it merely reveals: a question
  // naming opportunities now leaves the general context, and 'finance'
  // is granted to only one lane, governance_assurance. So "where are the
  // opportunities to reduce our recurring costs?" used to reach the
  // general context and see the banking records, and now does not. The
  // repair is not to hand finance to this lane, which would be a
  // worker-permission change; it is either a finance routing rule or a
  // decision that finance belongs in more than one lane, and both are
  // Tom's to take.
  { laneId: 'opportunity_builder', pattern: /\bopportunit(?:y|ies)\b/i }
];

// The general (no-lane) context: core authority and register state, plus
// (added 01/09/2026) finance. Finance carries no lane of its own - see
// lanes.js - so a general question is the only routed path that can ever
// surface it, and it is still gated by the human clearance leg exactly
// like every other record: finance records are 'confidential', and only
// owner_admin (Tom) holds that sensitivity today.
const GENERAL_SOURCE_CLASSES = ['authority', 'strategy', 'worker_register', 'finance'];

function routeToLane(question) {
  for (const rule of ROUTING_RULES) {
    if (rule.pattern.test(question)) return rule.laneId;
  }
  return null;
}

// Context assembly. Filtering happens HERE, before any prompt exists:
// human clearance first, then the lane leg, then a necessity cap. The
// model never sees a record either leg denies, so there is nothing to
// redact after generation.
async function buildLaneContext({ clearanceId, laneId }) {
  const all = await repo.listRecords();
  const humanVisible = filterRecordsForClearance(clearanceId, all);
  const laneVisible = laneId
    ? filterRecordsForLane(laneId, humanVisible)
    : humanVisible.filter((r) => GENERAL_SOURCE_CLASSES.includes(r.source_class));
  const current = laneVisible.filter((r) => r.doc_status === 'current' || r.doc_status === 'unverified');
  return current.slice(0, MAX_CONTEXT_RECORDS);
}

function renderRecordForPrompt(r) {
  const freshness = repo.recordFreshness(r);
  return [
    `RECORD ${r.record_key} [${r.source_class} / ${r.doc_status} / ${freshness.state}]`,
    `Title: ${r.title}`,
    `Source: ${r.source_ref || 'unrecorded'}${r.as_of ? ` (as of ${new Date(r.as_of).toISOString().slice(0, 10)})` : ''}`,
    r.body ? `Content: ${r.body}` : 'Content: (none extracted)'
  ].join('\n');
}

const REPLY_CONTRACT = `Reply with a single JSON object and nothing else:
{
  "answer": "your reply, plain text, UK English",
  "gap": null or { "gap_type": "missing" | "stale" | "conflicting" | "provenance" | "source_failure", "description": "what evidence is missing, stale or contradictory, quoting the record key where one exists", "material": true or false },
  "escalation": null or "one sentence on what needs a human decision"
}`;

const GOVERNANCE_RULES = `You are the Arrington AI Workspace answering a question for its authenticated owner. Rules that are not negotiable:
- Use ONLY the records supplied below. If they do not answer the question, say so and report a gap; never fill a gap by inference or general knowledge.
- Records marked stale, unverified or sync_failed must be described that way, never presented as current fact.
- You perform no actions. Never claim anything has been sent, deployed, changed, contacted or scheduled. If the question asks for an action, describe it in "escalation" for a human decision.
- The live website and the named source documents are the sources of truth; a record here is an extract, and you say which record your answer rests on by its record key.
- UK English. No em dashes. Direct and plain; no cliches.`;

// --- Model client (injectable for tests) -------------------------------

let clientFactory = () => {
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
};

function __setClientFactoryForTests(fn) { clientFactory = fn; }
function __resetClientFactoryForTests() {
  clientFactory = () => {
    const Anthropic = require('@anthropic-ai/sdk');
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  };
}

function isTransientApiError(err) {
  if (!err) return false;
  const status = err.status || err.statusCode;
  if (status === 429 || (status >= 500 && status <= 599)) return true;
  return /overloaded|rate.?limit|timed?.?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up|network/i.test(String(err.message || err));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callModel(system, userContent) {
  const client = clientFactory();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: userContent }]
  });
  return (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

function parseReply(raw) {
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) return { error: 'no JSON object in reply' };
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch (e) { return { error: `invalid JSON: ${e.message}` }; }
  if (typeof parsed.answer !== 'string' || !parsed.answer.trim()) return { error: 'missing answer' };
  if (parsed.gap !== null && parsed.gap !== undefined) {
    const g = parsed.gap;
    if (typeof g !== 'object' || !['missing', 'stale', 'conflicting', 'provenance', 'source_failure'].includes(g.gap_type) || typeof g.description !== 'string') {
      return { error: 'malformed gap' };
    }
  }
  if (parsed.escalation !== null && parsed.escalation !== undefined && typeof parsed.escalation !== 'string') {
    return { error: 'malformed escalation' };
  }
  return { parsed };
}

// Ask the workspace a question. The caller has already authenticated the
// human and resolved their clearance; nothing here trusts request input
// for either. Returns { ok, laneId, provenanceKeys, answer, gap,
// escalation } or { ok: false, errors }.
async function askWorkspace({ clearanceId, question, laneId: forcedLaneId = null }) {
  if (!isWorkspaceAIEnabled()) {
    return { ok: false, errors: ['Workspace AI is not enabled in this environment.'] };
  }
  const laneId = forcedLaneId && laneById(forcedLaneId) ? forcedLaneId : routeToLane(question);
  const records = await buildLaneContext({ clearanceId, laneId });
  const provenanceKeys = records.map((r) => r.record_key);
  const lane = laneId ? laneById(laneId) : null;

  const system = [
    GOVERNANCE_RULES,
    lane ? `This question was routed to the ${lane.name} lane. Its remit: ${lane.remit} Answer within that remit.` : 'This question matched no specialist lane; answer from the core authority records only.',
    REPLY_CONTRACT
  ].join('\n\n');
  const userContent = [
    `Question from the workspace owner:\n${question}`,
    records.length
      ? `Records you may use (the only facts available to you):\n\n${records.map(renderRecordForPrompt).join('\n\n')}`
      : 'No records are available to you for this question. Say so and report the gap.'
  ].join('\n\n');

  let raw = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      raw = await callModel(system, userContent);
      break;
    } catch (err) {
      lastErr = err;
      if (!isTransientApiError(err) || attempt === 3) break;
      console.error(`Workspace model call failed (attempt ${attempt} of 3): ${err.message}`);
      await sleep(1500 * attempt);
    }
  }
  if (raw === null) {
    return { ok: false, errors: [`Model unavailable: ${lastErr ? lastErr.message : 'unknown error'}`] };
  }

  let { parsed, error } = parseReply(raw);
  if (error) {
    // One corrective retry for a contract failure, then give up honestly.
    try {
      raw = await callModel(system, `${userContent}\n\nYour previous reply broke the required JSON contract (${error}). Reply again with ONLY the JSON object.`);
      ({ parsed, error } = parseReply(raw));
    } catch (err) {
      return { ok: false, errors: [`Model unavailable on corrective retry: ${err.message}`] };
    }
    if (error) return { ok: false, errors: [`Model reply broke the contract twice: ${error}`] };
  }

  return {
    ok: true,
    laneId: laneId || null,
    provenanceKeys,
    answer: parsed.answer,
    gap: parsed.gap || null,
    escalation: parsed.escalation || null
  };
}

module.exports = {
  MODEL,
  LANES,
  isWorkspaceAIEnabled,
  describeWorkspaceAIStatus,
  routeToLane,
  buildLaneContext,
  askWorkspace,
  isTransientApiError,
  parseReply,
  __setClientFactoryForTests,
  __resetClientFactoryForTests
};
