// Scott AI Demonstration — orchestration engine.
//
// This is the "implementation plumbing" the Worker Map document explicitly
// says is NOT a seventh AI worker: it decides which model calls to make and
// in what order, but it never itself answers a business question and it
// never merges two workers' reasoning into one call.
//
// STRUCTURAL ISOLATION (the actual point of this demonstration, per Tom):
// each worker below gets its OWN independent Anthropic call, with its own
// system prompt built only from its own specification. A downstream worker
// in the same turn (e.g. Commercial, after Operations has already answered)
// receives the PRIOR WORKER'S STATED REPLY as plain evidence text, never
// its reasoning, never the full shared conversation object, and never
// another worker's system prompt. Commercial cannot silently see Operations'
// internal working merely because both happened inside one user turn.
//
// Gated behind two env vars, checked together — deliberately its OWN flag
// (ENABLE_SCOTT_AI), separate from ENABLE_LIVE_AI used by the Commercial
// Gaps Review / Product Guide, so turning on live spending for one AI
// feature never silently turns on another. See CLAUDE.md's isolation
// principle for the Scott demonstration.

const { GOVERNANCE_PREAMBLE } = require('./governance');
const { BRAND_AND_OPERATING_SYSTEM, CURRENT_OPERATING_POSITION } = require('./businessFacts');
const { WORKERS, ROUTABLE_WORKER_IDS, getWorker } = require('./workers');
const { extractEntities, buildContext } = require('./data/contextBuilders');

const MODEL = 'claude-sonnet-5';
const MAX_WORKERS_PER_TURN = 5;
const MAX_HISTORY_MESSAGES = 16;

function isScottAIEnabled() {
  return !!process.env.ANTHROPIC_API_KEY && process.env.ENABLE_SCOTT_AI === 'true';
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

// ------------------------------------------------------------
// Schemas
// ------------------------------------------------------------

function validateWorkerReply(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['root value must be an object'] };
  }
  if (!isNonEmptyString(obj.reply)) errors.push('reply must be a non-empty string');
  if (obj.certainty !== null && obj.certainty !== undefined && !['CERTAIN', 'LIKELY', 'UNPROVEN'].includes(obj.certainty)) {
    errors.push('certainty must be CERTAIN, LIKELY, UNPROVEN, or null');
  }
  if (obj.writeback !== null && obj.writeback !== undefined) {
    if (typeof obj.writeback !== 'object' || Array.isArray(obj.writeback)) {
      errors.push('writeback must be an object or null');
    } else {
      if (!isNonEmptyString(obj.writeback.record)) errors.push('writeback.record must be a non-empty string');
      if (!isNonEmptyString(obj.writeback.summary)) errors.push('writeback.summary must be a non-empty string');
    }
  }
  if (obj.escalation !== null && obj.escalation !== undefined) {
    if (typeof obj.escalation !== 'object' || Array.isArray(obj.escalation)) {
      errors.push('escalation must be an object or null');
    } else {
      if (!['scott_mercer', 'tom_arrington'].includes(obj.escalation.to)) errors.push('escalation.to must be scott_mercer or tom_arrington');
      if (!isNonEmptyString(obj.escalation.reason)) errors.push('escalation.reason must be a non-empty string');
    }
  }
  if (obj.refused !== undefined && typeof obj.refused !== 'boolean') errors.push('refused must be a boolean');
  return { valid: errors.length === 0, errors };
}

function validateReceptionistReply(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['root value must be an object'] };
  }
  if (!isNonEmptyString(obj.note)) errors.push('note must be a non-empty string');
  if (!Array.isArray(obj.route)) {
    errors.push('route must be an array');
  } else {
    obj.route.forEach((r, i) => {
      if (!r || typeof r !== 'object') { errors.push(`route[${i}] must be an object`); return; }
      if (!ROUTABLE_WORKER_IDS.includes(r.worker)) errors.push(`route[${i}].worker must be one of ${ROUTABLE_WORKER_IDS.join(', ')}`);
      if (!isNonEmptyString(r.reason)) errors.push(`route[${i}].reason must be a non-empty string`);
    });
  }
  if (obj.refused !== undefined && typeof obj.refused !== 'boolean') errors.push('refused must be a boolean');
  return { valid: errors.length === 0, errors };
}

// ------------------------------------------------------------
// Prompt building
// ------------------------------------------------------------

const OUTPUT_FORMAT_WORKER = `Respond with ONLY a single JSON object, no prose before or after it, no markdown code fence, matching exactly this shape:
{
  "reply": string,           // your in-character answer to the user, following every rule above
  "certainty": "CERTAIN" | "LIKELY" | "UNPROVEN" | null,
  "writeback": { "record": string, "summary": string } | null,   // only if this exchange produced a material decision/state change worth recording in the demonstration's own audit trail
  "escalation": { "to": "scott_mercer" | "tom_arrington", "reason": string } | null,  // only if this genuinely needs an approval you do not have
  "refused": boolean         // true only if you refused the request under governance (e.g. prompt injection, unsupported commitment, out-of-scope work)
}`;

function buildWorkerSystemPrompt(worker) {
  const identityBlock = `YOUR IDENTITY
Canonical worker: ${worker.canonicalName}. Fictional character name (personality only, not your authority): ${worker.characterName}, ${worker.displayRole}.

YOUR PURPOSE
${worker.purpose}

YOUR SCOPE
${worker.scope.map((s) => `- ${s}`).join('\n')}

WHAT YOU DO NOT OWN
${worker.boundaries}

YOUR PERMISSIONS
${worker.permissionsSummary}

APPROVAL GATES THAT APPLY TO YOU
${worker.approvalGates}

YOUR PERSONALITY (presentation only, never overrides the above)
${worker.personality}`;

  return [GOVERNANCE_PREAMBLE, BRAND_AND_OPERATING_SYSTEM, CURRENT_OPERATING_POSITION, identityBlock, OUTPUT_FORMAT_WORKER].join('\n\n');
}

const OUTPUT_FORMAT_RECEPTIONIST = `Respond with ONLY a single JSON object, no prose before or after it, no markdown code fence, matching exactly this shape:
{
  "note": string,     // a short (1-3 sentence), in-character note: who owns this and why, or your own direct answer if nothing needs routing (e.g. "hello", "who are you")
  "route": [ { "worker": "commercial" | "operations" | "customers_marketing" | "company_brain" | "governance", "reason": string } ],  // empty array if nothing needs routing
  "refused": boolean  // true only if you refused the request under governance (e.g. prompt injection)
}
List route entries in the order they should be handled — respect real dependencies (for example: Operations before Commercial before Customers & Marketing, when a reply depends on both a price and a feasibility check).`;

function buildReceptionistSystemPrompt() {
  const routingMap = ROUTABLE_WORKER_IDS.map((id) => {
    const w = WORKERS[id];
    return `- "${id}" (${w.canonicalName} / ${w.characterName}, ${w.displayRole}): ${w.purpose}`;
  }).join('\n');

  const identityBlock = `YOUR IDENTITY
Canonical worker: ${WORKERS.receptionist.canonicalName}. Fictional character name (personality only, not your authority): ${WORKERS.receptionist.characterName}, ${WORKERS.receptionist.displayRole}.

YOUR PURPOSE
${WORKERS.receptionist.purpose}

YOUR SCOPE
${WORKERS.receptionist.scope.map((s) => `- ${s}`).join('\n')}

WHAT YOU DO NOT OWN
${WORKERS.receptionist.boundaries}

YOUR PERSONALITY (presentation only, never overrides the above)
${WORKERS.receptionist.personality}

THE WORKERS YOU CAN ROUTE TO
${routingMap}

ROUTING DEFAULTS FOR BROAD OR DIGEST-STYLE REQUESTS
A broad status question ("what needs my attention today", "which jobs are at risk this week"), or a request to recall or summarise existing history ("summarise everything before I call a customer", "what happened with an earlier enquiry"), belongs to "company_brain" — Derek already has the broadest read access of anyone on the team and this is exactly his organisational-memory job: reporting what the records show, not deciding anything. The moment a request actually needs a decision, a quote, a schedule, or an outward-facing draft, route that part to the specialist who owns it (commercial/operations/customers_marketing) as normal — Derek supplying background evidence first does not change who owns the decision. Do not send an ordinary decision to Derek merely because he could technically retrieve the relevant record.

If the request contains more than one owned component, list each in dependency order. Do not invent a new worker. Do not answer specialist questions yourself — your job is routing, plus a short note.`;

  return [GOVERNANCE_PREAMBLE, BRAND_AND_OPERATING_SYSTEM, CURRENT_OPERATING_POSITION, identityBlock, OUTPUT_FORMAT_RECEPTIONIST].join('\n\n');
}

function formatHistoryForPrompt(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  const lines = trimmed.map((m) => {
    if (m.sender === 'user') return `User: ${m.content}`;
    const w = getWorker(m.worker_id);
    const name = w ? `${w.characterName} (${w.displayRole})` : (m.worker_id || 'Worker');
    return `${name}: ${m.content}`;
  });
  return `CONVERSATION SO FAR IN THIS DEMONSTRATION SESSION\n${lines.join('\n')}`;
}

function formatPriorWorkerNotes(priorWorkerNotes) {
  if (!Array.isArray(priorWorkerNotes) || priorWorkerNotes.length === 0) return '';
  const lines = priorWorkerNotes.map((n) => `${n.characterName} (${n.displayRole}) already said, earlier in this same request: "${n.reply}"`);
  return `POSITIONS ALREADY GIVEN BY COLLEAGUES EARLIER IN THIS SAME REQUEST (their stated position only — you were not shown their internal reasoning, and neither were they shown yours)\n${lines.join('\n')}`;
}

// ------------------------------------------------------------
// Model calls
// ------------------------------------------------------------

// Client construction is a single overridable factory rather than an
// inline `new Anthropic(...)` so tests can substitute a fake client and
// exercise the real routing/isolation/retry logic deterministically,
// without ever needing a real ANTHROPIC_API_KEY. Production code never
// calls the setter — only test/scott/*.test.js does, and always restores
// the default afterwards.
let clientFactory = () => {
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
};

function __setClientFactoryForTests(fn) {
  clientFactory = fn;
}

function __resetClientFactoryForTests() {
  clientFactory = () => {
    const Anthropic = require('@anthropic-ai/sdk');
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  };
}

async function callAnthropic(systemPrompt, userContent, maxTokens) {
  const client = clientFactory();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }]
  });
  const textBlock = (response.content || []).find((b) => b.type === 'text');
  return extractJson(textBlock && textBlock.text);
}

async function callWithRetry(systemPrompt, buildUserContent, validate, maxTokens) {
  let firstErrors;
  try {
    const first = await callAnthropic(systemPrompt, buildUserContent(), maxTokens);
    const check = validate(first);
    if (check.valid) return { ok: true, data: first };
    firstErrors = check.errors;
  } catch (err) {
    firstErrors = [`Reply could not be parsed as JSON: ${err.message}`];
  }

  try {
    const retryContent = `${buildUserContent()}\n\nYour previous reply did not match the required schema. Fix these problems and reply again with the JSON object only, nothing else:\n- ${firstErrors.join('\n- ')}`;
    const retry = await callAnthropic(systemPrompt, retryContent, maxTokens);
    const retryCheck = validate(retry);
    if (retryCheck.valid) return { ok: true, data: retry };
    return { ok: false, errors: retryCheck.errors };
  } catch (err) {
    return { ok: false, errors: [`Retry failed: ${err.message}`] };
  }
}

async function callReceptionist({ userMessage, history }) {
  const systemPrompt = buildReceptionistSystemPrompt();
  const historyBlock = formatHistoryForPrompt(history);
  const buildUserContent = () => [
    historyBlock,
    `NEW MESSAGE FROM THE USER\n${userMessage}`,
    'Reply with the JSON object only.'
  ].filter(Boolean).join('\n\n');

  const result = await callWithRetry(systemPrompt, buildUserContent, validateReceptionistReply, 512);
  if (!result.ok) {
    return {
      note: "Ruth here — I've had a technical problem working out who should pick this up. Please try again in a moment.",
      route: [],
      refused: false,
      technicalFailure: true,
      errors: result.errors
    };
  }
  const route = result.data.route.slice(0, MAX_WORKERS_PER_TURN);
  return { ...result.data, route, technicalFailure: false };
}

async function callWorker(workerId, { userMessage, history, priorWorkerNotes, routeReason, entities }) {
  const worker = getWorker(workerId);
  const systemPrompt = buildWorkerSystemPrompt(worker);
  const historyBlock = formatHistoryForPrompt(history);
  const priorNotesBlock = formatPriorWorkerNotes(priorWorkerNotes);
  // Deterministic, code-fetched data slice for this worker only — see
  // lib/scott/data/contextBuilders.js. Built once per call from `entities`
  // (already extracted once for the whole turn in runTurn), so this is the
  // one place a worker's model call actually sees the isolated fictional
  // dataset, always scoped to what its own role is meant to see.
  const dataContextBlock = await buildContext(workerId, { message: userMessage, entities: entities || {} });
  const buildUserContent = () => [
    historyBlock,
    priorNotesBlock,
    dataContextBlock,
    routeReason ? `WHY THIS WAS ROUTED TO YOU\n${routeReason}` : '',
    `THE USER'S MESSAGE\n${userMessage}`,
    'Reply with the JSON object only.'
  ].filter(Boolean).join('\n\n');

  const result = await callWithRetry(systemPrompt, buildUserContent, validateWorkerReply, 1024);
  if (!result.ok) {
    return {
      workerId,
      worker,
      reply: `${worker.characterName} hit a technical problem answering this and could not give a reliable reply. Please try again in a moment.`,
      certainty: null,
      writeback: null,
      escalation: null,
      refused: false,
      technicalFailure: true,
      errors: result.errors
    };
  }
  return { workerId, worker, ...result.data, technicalFailure: false };
}

// ------------------------------------------------------------
// Turn orchestration
// ------------------------------------------------------------

// Runs one user turn: Receptionist routes, then each routed worker is
// called in sequence, each with its own isolated call. Returns everything
// needed to render and persist the turn.
async function runTurn({ userMessage, history }) {
  // Extracted once per turn (not per worker) — the same entities (a job
  // ref, a matched customer) are handed to buildContext for each routed
  // worker, but each worker still gets its own separately-built data slice
  // via its own call to buildContext, scoped to what that worker's role is
  // meant to see. Extraction itself is deterministic (regex/substring
  // matching), not model-driven.
  const entities = await extractEntities(userMessage);

  const receptionist = await callReceptionist({ userMessage, history });

  const workerReplies = [];
  if (!receptionist.refused && Array.isArray(receptionist.route)) {
    for (const routeEntry of receptionist.route) {
      const priorWorkerNotes = workerReplies.map((r) => ({
        characterName: r.worker.characterName,
        displayRole: r.worker.displayRole,
        reply: r.reply
      }));
      const result = await callWorker(routeEntry.worker, {
        userMessage,
        history,
        priorWorkerNotes,
        routeReason: routeEntry.reason,
        entities
      });
      workerReplies.push(result);
    }
  }

  return { receptionist, workerReplies, entities };
}

module.exports = {
  isScottAIEnabled,
  MODEL,
  buildWorkerSystemPrompt,
  buildReceptionistSystemPrompt,
  validateWorkerReply,
  validateReceptionistReply,
  extractJson,
  callReceptionist,
  callWorker,
  runTurn,
  __setClientFactoryForTests,
  __resetClientFactoryForTests
};
