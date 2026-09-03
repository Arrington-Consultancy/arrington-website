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
  // The dead 'opportunit' stem is removed. It could never match: the
  // group's trailing \b requires a word boundary straight after it and
  // the next character is always a letter. Both spellings are handled by
  // the last rule in the table. Leaving it here invited someone to trust
  // this rule, delete the tail entry, and silently reinstate the original
  // defect. Removing it changes no routing, which a test asserts.
  { laneId: 'opportunity_builder', pattern: /\b(lead(s)?\b|prospect|pipeline|proposal|commercial conversation|ivybridge|icabbi)\b/i },
  { laneId: 'brain_keeper', pattern: /\b(drive|brain (index|structure|maintenance)|document status|superseded|archive|handoff standard)\b/i },
  { laneId: 'governance_assurance', pattern: /\b(governance|assurance|constitution|permission|clearance|audit|stop decision|compliance|rulebook)\b/i },
  { laneId: 'social_content_builder', pattern: /\b(linkedin|social (content|post|media)|story bank|published post)\b/i },
  { laneId: 'ai_recommendation_visibility', pattern: /\b(ai (visibility|recommendation)|cited by ai|chatgpt recommend|shortlist)\b/i },
  { laneId: 'ai_demonstration_builder', pattern: /\b(scott|demonstration|armchair|knitting|fictional)\b/i },
  { laneId: 'ai_workspace_builder', pattern: /\b(workspace|control pack|brain gap standard|acceptance plan|implementation brief)\b/i },

  // ---- LOW-PRECEDENCE TAIL ----
  //
  // Everything above routes exactly as it did before this change, and a
  // test asserts it. The only edit up there is the deletion of one
  // provably dead alternative, which could never match anything. Every
  // inflection repair lives down here instead, and that uniformity is the
  // point rather than tidiness.
  //
  // The defect being repaired is systemic: every rule above is written
  // /\b(a|b|c)\b/i, so the trailing word boundary sits immediately after
  // whichever alternative matched and no inflected form can ever match.
  // "opportunities", "campaigns", "domains", "prospects", "permissions"
  // and a dozen more reached no lane at all.
  //
  // An earlier attempt repaired the seven commercial-ceiling lanes in
  // place, on the reasoning that a lane which cannot reach 'confidential'
  // cannot leak by winning a question earlier. That reasoning was wrong
  // twice over, and both ways were measured:
  //
  //   1. It defeated the money rule below. "What do our servers cost?"
  //      moved from the general context to website_hosting, which holds
  //      no finance class, so the banking record stopped reaching the
  //      prompt for a cost question. The money rule is only sound as a
  //      tail-only device if the rules above it genuinely do not change.
  //   2. It pre-empted later lanes anyway. "Draft a LinkedIn post about
  //      our campaigns" left social_content_builder for google_ads, which
  //      reads more source classes. Task necessity is a permission leg
  //      whatever the ceiling, so widening it at 'commercial' is still
  //      widening it.
  //
  // Down here an inflection can only ever claim a question that no rule
  // above wanted, so it can take nothing from any lane and cannot capture
  // a money question ahead of the rule that protects finance. The
  // singular forms keep their existing precedence in the rules above,
  // untouched. Singular and plural therefore sit on different precedence,
  // which is a real inconsistency and is the safe direction: resolving it
  // means moving live behaviour, which is its own decision.
  //
  // ORDER WITHIN THE TAIL is deliberate, not incidental:
  //   governance first, because it is the ONLY lane granted 'finance'
  //     (lanes.js), so a money question landing there loses nothing, and
  //     "show me the audits of our spending" belongs in it;
  //   then the money rule, which protects every lane below it;
  //   then the commercial-ceiling lanes in their original order;
  //   then opportunity last, because it carries a confidential ceiling
  //     and should claim a question only when nothing else will.
  { laneId: 'governance_assurance', pattern: /\b(permissions|clearances|audits|rulebooks|stop decisions)\b/i },

  // A money question keeps the general context, and therefore keeps
  // finance. Expressed as a rule with no lane, which routeToLane already
  // returns as "no lane" without needing a special case.
  //
  // The principle, stated once so the ordering around it is not
  // arbitrary: DO NOT ROUTE A MONEY QUESTION INTO A LANE THAT CANNOT SEE
  // FINANCE.
  //
  // The trade this imposes, both halves stated and both tested: a
  // question naming money AND a tail subject keeps finance and loses that
  // lane's records. Neither context dominates the other. The genuinely
  // correct repair is a finance lane, or finance granted to more than one
  // lane, and both are worker-permission changes reserved to Tom.
  //
  // It widens nothing: the general context is still filtered by the human
  // clearance leg and finance records are 'confidential'.
  { laneId: null, pattern: /\b(cash ?flow|bank(ing|s)?|balances?|transactions?|invoices?|payments?|overheads?|costs?|costing|spend(ing)?|turnover|profits?|margins?|revenues?|budgets?|incomes?|prices?|pricing|expenses|expenditure|vat|payroll|p ?and ?l|profit and loss)\b/i },

  { laneId: 'google_ads', pattern: /\bcampaigns\b/i },
  { laneId: 'website_hosting', pattern: /\b(websites|deploys|domains|servers|checkouts|seo tags)\b/i },
  { laneId: 'brain_keeper', pattern: /\b(archives|handoff standards|document statuses)\b/i },
  { laneId: 'social_content_builder', pattern: /\b(social posts|story banks|published posts)\b/i },
  { laneId: 'ai_recommendation_visibility', pattern: /\b(shortlists|ai recommendations)\b/i },
  { laneId: 'ai_demonstration_builder', pattern: /\b(demonstrations|armchairs)\b/i },
  { laneId: 'ai_workspace_builder', pattern: /\b(workspaces|control packs|brain gap standards|acceptance plans|implementation briefs)\b/i },
  { laneId: 'opportunity_builder', pattern: /\b(opportunit(?:y|ies)|prospects|pipelines|proposals|commercial conversations)\b/i }
];

// The general (no-lane) context: core authority and register state, plus
// (added 01/09/2026) finance. Finance carries no lane of its own - see
// lanes.js - so a general question is the only routed path that can ever
// surface it, and it is still gated by the human clearance leg exactly
// like every other record: finance records are 'confidential', and only
// owner_admin (Tom) holds that sensitivity today.
const GENERAL_SOURCE_CLASSES = Object.freeze(['authority', 'strategy', 'worker_register', 'finance']);

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
    lane ? `This question was routed to the ${lane.name} lane. Its remit: ${lane.remit} Answer within that remit.` : 'This question matched no specialist lane. Answer only from the records supplied below, which are the core authority, strategy and worker-register state plus any finance records the reader is cleared for.',
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
  // Exported for tests only: the routing tests assert that the general
  // context genuinely carries finance, because an assertion about
  // routing alone was shown to pass while the property it was named for
  // was false. ROUTING_RULES is deliberately NOT exported: nothing reads
  // it, and handing out the live table by reference would let any caller
  // mutate routing process-wide.
  GENERAL_SOURCE_CLASSES,
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
