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
const HEAD_RULES = [
  { laneId: 'google_ads', pattern: /\b(google ads|paid (ads|advertising|media)|ppc|adwords|campaign|cost per (lead|click)|conversion tracking)\b/i },
  { laneId: 'website_hosting', pattern: /\b(website|hosting|deploy|railway|github|domain|dns|cms|server|stripe|checkout|seo tag)\b/i },
  // The 'opportunit' stem is removed. The group's trailing \b requires a
  // word boundary straight after it, and in "opportunity" and
  // "opportunities" the next character is a letter, so it could never
  // match either word: the spelling a person actually uses reached no
  // lane. It was not literally unmatchable, and an earlier version of
  // this comment overclaimed by saying so. It matched the bare non-word
  // "opportunit" and shapes like "opportunit-led", none of which anyone
  // types. Both real spellings are handled by the opportunity rule in the
  // tail below. Leaving the stem here invited someone to trust this rule,
  // delete the tail entry, and silently reinstate the original defect.
  { laneId: 'opportunity_builder', pattern: /\b(lead(s)?\b|prospect|pipeline|proposal|commercial conversation|ivybridge|icabbi)\b/i },
  { laneId: 'brain_keeper', pattern: /\b(drive|brain (index|structure|maintenance)|document status|superseded|archive|handoff standard)\b/i },
  { laneId: 'governance_assurance', pattern: /\b(governance|assurance|constitution|permission|clearance|audit|stop decision|compliance|rulebook)\b/i },
  { laneId: 'social_content_builder', pattern: /\b(linkedin|social (content|post|media)|story bank|published post)\b/i },
  { laneId: 'ai_recommendation_visibility', pattern: /\b(ai (visibility|recommendation)|cited by ai|chatgpt recommend|shortlist)\b/i },
  { laneId: 'ai_demonstration_builder', pattern: /\b(scott|demonstration|armchair|knitting|fictional)\b/i },
  { laneId: 'ai_workspace_builder', pattern: /\b(workspace|control pack|brain gap standard|acceptance plan|implementation brief)\b/i },

];

const TAIL_RULES = [
  // ---- LOW-PRECEDENCE TAIL ----
  //
  // Everything above routes exactly as it did before this change for any
  // question a person would produce, and a test asserts it. The only edit
  // up there is the deletion of the 'opportunit' stem, which could never
  // match either real spelling. It was not unmatchable in the absolute:
  // "opportunit" and "opportunit-led" did reach the lane before and reach
  // no lane now. See the rule-three comment for the full statement; an
  // earlier version of this line said "provably dead", which the same
  // commit corrected thirty lines above and left wrong here. Every
  // inflection repair lives down here instead, and that uniformity is the
  // point rather than tidiness.
  //
  // The defect being repaired is systemic: every rule above is written
  // /\b(a|b|c)\b/i, so the trailing word boundary sits immediately after
  // whichever alternative matched, so an inflected form can only match
  // where the rule spells the inflection out itself. Rule three's
  // 'lead(s)?\b' does, and a test relies on it, so the claim is NOT that
  // no head rule handles a plural: it is that no head rule handles one it
  // did not write down. Trusting the blanket version would invite moving
  // 'leads' into the tail, which would change live precedence.
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
  // above wanted, so it can take nothing from any lane. Not every missed
  // inflection is repaired: "brain indexes" and "chatgpt recommends" are
  // inflections of head keywords that still reach no lane, and the five
  // governance words below are deliberately left alone. The claim is that
  // what IS repaired lives here, not that the class is exhausted.
  //
  // What it CAN do is move a question from the general no-lane context
  // into a lane, which for a wider lane widens the task-necessity leg.
  //
  // NO GOVERNANCE PLURALS HERE, AND THAT IS DELIBERATE. An earlier
  // version repaired permissions, clearances, audits, rulebooks and stop
  // decisions into governance_assurance, the correct owner of those
  // words. Two things were wrong with it. It widened task necessity from
  // a four-class general context to a lane reading all eight. And,
  // measured rather than reasoned, it made the answer WORSE: that lane's
  // context overflows MAX_CONTEXT_RECORDS, buildLaneContext truncates
  // with a blind slice, and listRecords orders by source_class ASCENDING,
  // so it is the alphabetically-LAST classes the slice drops. With a full
  // snapshot, "which clearances exist?" lost worker_register entirely,
  // which the general context keeps.
  //
  // Measured for the lanes the tail DOES route into, because the same
  // argument applies to them and the distinction has to be a measurement
  // rather than a preference: against the current 29-record snapshot
  // governance_assurance reaches 28 against a cap of 24 and overflows,
  // while the widest tail lanes, website_hosting and ai_workspace_builder,
  // reach 23 and do not. That is why one was declined and the others were
  // not.
  //
  // One record of headroom is thin, and the tail now funnels more
  // questions into those two lanes, so the consequence of crossing it is
  // wider than before. Record COUNT is live data and no unit test can
  // assert it, but the thing that would push a lane over is a lane
  // gaining a source class, and that IS assertable: a test pins each tail
  // lane's breadth, so widening one fails and this note gets re-read.
  // MAX_CONTEXT_RECORDS is exported for that test. Repairing an inflection is not worth a truncated
  // answer plus a widening, so those five words are left reaching the
  // general context exactly as they did before this change, and are
  // recorded as remaining vocabulary work rather than shipped. The
  // singular forms keep their existing precedence in the rules above,
  // untouched. Singular and plural therefore sit on different precedence,
  // which is a real inconsistency and is the safe direction: resolving it
  // means moving live behaviour, which is its own decision.
  //
  // ORDER WITHIN THE TAIL is by sensitivity ceiling first, then by lane
  // breadth, narrowest first. A tail rule can only ever claim a question
  // no rule above wanted, so the ordering decides nothing except which
  // lane answers a question naming two tail subjects, and there the
  // narrower lane should win: task necessity is a permission leg, so a
  // wider lane winning by accident would widen it for no reason.
  //
  // Ceiling outranks breadth, and that is not a tie-break detail. Ordered
  // by breadth alone, opportunity_builder (four source classes,
  // confidential) preceded website_hosting and ai_workspace_builder (five
  // classes, commercial), so "which proposals relate to our websites?"
  // reached the confidential lane and the prompt gained a confidential
  // opportunity record it did not need. Fewer classes is not narrower if
  // one of them is confidential.
  //
  // Two earlier versions of this comment were wrong about the code below
  // it: one ordered the group by register order while claiming narrowest
  // first, the other by breadth while claiming least privilege. A test
  // now DERIVES the expected order from lanes.js rather than restating
  // it, so the two cannot drift again.

  { laneId: 'social_content_builder', pattern: /\b(social posts|story banks|published posts)\b/i },
  { laneId: 'ai_demonstration_builder', pattern: /\b(demonstrations|armchairs)\b/i },
  { laneId: 'ai_recommendation_visibility', pattern: /\b(shortlists|ai recommendations)\b/i },
  { laneId: 'brain_keeper', pattern: /\b(archives|handoff standards|document statuses)\b/i },
  { laneId: 'google_ads', pattern: /\bcampaigns\b/i },
  { laneId: 'ai_workspace_builder', pattern: /\b(workspaces|control packs|brain gap standards|acceptance plans|implementation briefs)\b/i },
  { laneId: 'website_hosting', pattern: /\b(websites|deploys|domains|servers|checkouts|seo tags)\b/i },
  // 'pipelines' is deliberately NOT repaired here, though its singular is
  // a head keyword. The word is ambiguous: "how are our deployment
  // pipelines?" and "what about our CI pipelines?" reached no lane at the
  // base and would reach opportunity_builder through this rule, so an
  // infrastructure question would gain two confidential opportunity
  // records and lose technical_state. That is the one direction the
  // ceiling ordering above cannot guard, because the general context has
  // no ceiling at all and anything below it does. A commercial-pipeline
  // question still routes through the singular in head rule three.
  { laneId: 'opportunity_builder', pattern: /\b(opportunit(?:y|ies)|prospects|proposals|commercial conversations)\b/i }
];

// The table the router walks. Head and tail are separate arrays rather
// than one array plus an index, so the boundary is structural: adding a
// head rule cannot silently mark it as a tail rule and drop it from the
// checks that only apply to one half.
const ROUTING_RULES = [...HEAD_RULES, ...TAIL_RULES];

// NO MONEY GUARD. Four review rounds tried to keep money questions in
// the general context, which is the only place besides
// governance_assurance that 'finance' can be read (lanes.js holds it at
// least privilege). Each round widened a keyword list and the next
// round found more words: revenue, budget, income, price, expenses,
// costing, then "how much are the campaigns?", "what did we pay for
// the domains?", "spent", "fees", "cheapest". Matching the shape of a
// question by enumeration is an arms race this codebase has already
// recorded as unwinnable elsewhere.
//
// The rule was also defending a property that never held. On the base
// commit, "what are our hosting costs?" and "how much does Railway
// cost us?" already reached website_hosting, which holds no finance
// class. Rules one to nine have always been able to take a money
// question away from finance. A guard that only covered the tail
// implied a protection the router does not have.
//
// So the honest position, stated once and tested rather than defended
// by vocabulary, and BROADER than finance: the no-lane general context
// applies no sensitivity ceiling, while the seven commercial-ceiling tail
// lanes do. Routing a question into one of them therefore drops every
// CONFIDENTIAL record it would otherwise have seen, in any class, not
// only the banking ones. Finance is the case that keeps surfacing because
// it is granted to a single lane, but a confidential strategy record
// behaves the same way. That is a property of the ceiling model, not of
// this change, and the
// genuinely correct repair is a finance lane or finance granted to more
// than one lane. Both are worker-permission changes and belong to Tom.
// What this change adds is more questions that route at all, and that
// ENLARGES the trade rather than merely revealing it. Stated precisely,
// because an earlier version of this paragraph understated it: at the
// base only head-keyword phrasings lost finance, so "what are our
// hosting costs?" did and "what do our servers cost?" did not. The tail
// plurals bring the second kind in. Measured: "how much do our domains
// cost?", "what do our servers cost?" and "how much are the campaigns
// costing us?" all reached the general context at the base and now
// route to a lane that cannot see finance, so Tom gets a gap where he
// used to get a costed answer. Pinned by test as the accepted cost.

// The system line used when no lane matched. Named so the guard can
// assert on the STRING rather than on one line of this file, which a
// reformat or an appended sentence would slip past. It deliberately
// names no source class: telling a reader there are "finance records you
// are cleared for" is an existence signal for a category they may not be
// cleared for, and it would duplicate GENERAL_SOURCE_CLASSES as prose
// that can drift.
const NO_LANE_INSTRUCTION = 'This question matched no specialist lane. Answer only from the records supplied below.';

// The general (no-lane) context: core authority and register state, plus
// (added 01/09/2026) finance. Finance carries no lane of its own except
// governance_assurance - see lanes.js - so a general question is the only
// other routed path that can surface it, and it is still gated by the
// human clearance leg exactly like every other record: finance records
// are 'confidential', and only owner_admin (Tom) holds that sensitivity
// today. Frozen because it is exported for tests and a caller pushing a
// class onto it would widen the no-lane context process-wide.
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
    lane ? `This question was routed to the ${lane.name} lane. Its remit: ${lane.remit} Answer within that remit.` : NO_LANE_INSTRUCTION,
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
  // Exported for tests only: a frozen, read-only description of the rule
  // table. Strings and a lane id, never the live rules, so a caller
  // cannot mutate routing process-wide. The routing tests pin the head
  // rules against their exact patterns, because a test that only re-runs
  // a handful of probes stays green when a keyword is added.
  __routingTableForTests: Object.freeze(ROUTING_RULES.map((r, i) => Object.freeze({
    laneId: r.laneId, source: r.pattern.source, flags: r.pattern.flags,
    // Which half of the table this rule is in, derived from the arrays
    // themselves rather than an index a maintainer keeps in step: a test
    // that assumed the boundary would classify a newly added head rule as
    // the first tail rule and quietly stop checking it.
    tail: i >= HEAD_RULES.length
  }))),
  // Exported for tests only: the routing tests assert that the general
  // context genuinely carries finance, because an assertion about
  // routing alone was shown to pass while the property it was named for
  // was false. ROUTING_RULES is deliberately NOT exported: nothing reads
  // it, and handing out the live table by reference would let any caller
  // mutate routing process-wide.
  GENERAL_SOURCE_CLASSES,
  MAX_CONTEXT_RECORDS,
  NO_LANE_INSTRUCTION,
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
