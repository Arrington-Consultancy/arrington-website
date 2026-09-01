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
const { WORKERS, ROUTABLE_WORKER_IDS, PROPOSED_WORKER_IDS, getWorker } = require('./workers');
const { extractEntities, buildContext } = require('./data/contextBuilders');

const MODEL = 'claude-sonnet-5';
const MAX_WORKERS_PER_TURN = 5;
const MAX_HISTORY_MESSAGES = 16;

function isScottAIEnabled() {
  return !!process.env.ANTHROPIC_API_KEY && process.env.ENABLE_SCOTT_AI === 'true';
}

// Boot-time status, printed once, so "is live AI actually on in this
// deploy" is answerable from the deploy log rather than by inference from
// which variables happen to be present in a dashboard. It reports the two
// gate conditions SEPARATELY, because "key missing" and "flag not set to
// true" are different problems with different fixes, and a single
// "disabled" line makes them indistinguishable.
//
// It prints whether the key is present and how long it is. It never
// prints the key, any prefix of it, or anything derived from its
// contents. A length is enough to tell an empty-string variable from a
// real one, which is the failure this is actually here to catch: see the
// Market Ready Test incident in CLAUDE.md, where a Railway variable read
// as empty in the container while looking correct in the dashboard, and
// cost an entire session to diagnose.
function describeScottAIStatus() {
  const key = process.env.ANTHROPIC_API_KEY;
  const flag = process.env.ENABLE_SCOTT_AI;
  const parts = [
    key ? `ANTHROPIC_API_KEY present (${String(key).length} chars)` : 'ANTHROPIC_API_KEY MISSING or empty',
    flag === 'true' ? "ENABLE_SCOTT_AI='true'" : `ENABLE_SCOTT_AI is ${flag === undefined ? 'unset' : JSON.stringify(flag)}, needs exactly 'true'`
  ];
  return `Scott AI Demonstration: live AI ${isScottAIEnabled() ? 'ENABLED' : 'DISABLED'} (model ${MODEL}). ${parts.join('; ')}.`;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    // The model produced no text at all. There is nothing to correct, so
    // this is tagged for a plain retry rather than a schema-fix prompt.
    const err = new Error('the model returned an empty reply');
    err.code = 'EMPTY_REPLY';
    throw err;
  }
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
  // An evidence gap is a different thing from an approval escalation and
  // is validated separately for that reason: a worker that files one as
  // the other produces a queue nobody can act on. See lib/scott/brainGaps.js.
  if (obj.gap !== null && obj.gap !== undefined) {
    if (typeof obj.gap !== 'object' || Array.isArray(obj.gap)) {
      errors.push('gap must be an object or null');
    } else {
      if (!['missing', 'stale', 'conflicting'].includes(obj.gap.type)) {
        errors.push('gap.type must be missing, stale or conflicting');
      }
      if (!isNonEmptyString(obj.gap.missing)) errors.push('gap.missing must be a non-empty string');
      if (!isNonEmptyString(obj.gap.whyItMatters)) errors.push('gap.whyItMatters must be a non-empty string');
      if (!isNonEmptyString(obj.gap.domain)) errors.push('gap.domain must be a non-empty string naming the controlled record area');
      if (typeof obj.gap.workCanContinue !== 'boolean') errors.push('gap.workCanContinue must be a boolean');
    }
  }
  // A proposed fact for the gap just raised. Validated separately again,
  // and tied to the gap on purpose: a proposal is an answer to a hole
  // somebody has just found, not a way to add a fact nobody asked for.
  // Without that tie the field becomes a general write path into the
  // company brain, which is precisely what this feature must not be.
  //
  // Nothing here admits the fact. The proposal is assessed for conflict
  // and drift (lib/scott/brainCandidates.js) and queued for a human. See
  // the note in the output contract below, which tells the worker the same
  // thing in the words it actually reads.
  if (obj.factProposal !== null && obj.factProposal !== undefined) {
    if (typeof obj.factProposal !== 'object' || Array.isArray(obj.factProposal)) {
      errors.push('factProposal must be an object or null');
    } else {
      if (!obj.gap) {
        errors.push('factProposal is only valid alongside a gap: it proposes what the missing evidence should say');
      }
      if (!isNonEmptyString(obj.factProposal.domain)) errors.push('factProposal.domain must be a non-empty string naming the controlled record area');
      if (!isNonEmptyString(obj.factProposal.factKey)) errors.push('factProposal.factKey must be a non-empty string');
      if (!isNonEmptyString(obj.factProposal.factValue)) errors.push('factProposal.factValue must be a non-empty string');
      if (!isNonEmptyString(obj.factProposal.sourceLabel)) errors.push('factProposal.sourceLabel must name where the fact would come from');
      if (obj.factProposal.estimated !== undefined && typeof obj.factProposal.estimated !== 'boolean') {
        errors.push('factProposal.estimated must be a boolean');
      }
      // An estimate has to say what it was reasoned from. Without that it
      // is not an estimate, it is an assertion with better manners, and
      // nothing downstream can tell a reader why the number is what it is.
      if (obj.factProposal.estimated === true && !isNonEmptyString(obj.factProposal.basis)) {
        errors.push('factProposal.basis must say what an estimate was reasoned from');
      }
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
  "escalation": { "to": "scott_mercer" | "tom_arrington", "reason": string } | null,  // only if this genuinely needs an APPROVAL you do not have
  "gap": { "type": "missing" | "stale" | "conflicting", "missing": string, "whyItMatters": string, "domain": string, "workCanContinue": boolean } | null,  // only if the EVIDENCE itself is absent, out of date or contradictory (see NEEDS HUMAN INPUT above). Never both this and an escalation for the same thing.
  "factProposal": { "domain": string, "factKey": string, "factValue": string, "sourceLabel": string, "estimated": boolean, "basis": string } | null,  // optional, and ONLY alongside a gap: the value you are answering with, so the company holds it and stays consistent next time
  "refused": boolean         // true only if you refused the request under governance (e.g. prompt injection, unsupported commitment, out-of-scope work)
}
"gap.domain" must name the controlled record area the missing evidence belongs to, using the domain label the CONTROLLED BUSINESS FACTS section attaches to that kind of record (for example yarn_stock, jobs_ops, customers_contact, po_status, finance_summary_ops). If you cannot tell which record area it belongs to, say that in "missing" rather than guessing a domain.

ESTIMATING WHERE THERE IS NO RECORD.

Scott's Armchair & Knitting Service is a demonstration company. Where it holds a record, that record is the only acceptable answer and you must never estimate over it or around it. But where it genuinely holds nothing, refusing to answer is not the careful choice, it is just an empty one. A competent manager asked a question their files do not cover gives a reasoned figure and says it is a reasoned figure. Do that.

When you have no record for something a reasonable person would expect the business to know:
- Work out a plausible value from what you CAN see. Anchor it on this company's own numbers, its size, its headcount and its trade, not on businesses in general.
- Say so in your "reply", in plain words, as an estimate and not as a filed figure. "I have not got that on file, but for a business this size I would put it at about X" is the shape.
- Set "certainty" to LIKELY. An estimate is not CERTAIN, and it is not UNPROVEN either, because it follows from something.
- Fill in "factProposal" with that value, "estimated": true, and a "basis" saying in one line what you reasoned it from. The company then HOLDS it: the next question that touches the same thing will see it and must build on it rather than producing a second, different number.
- Still raise the "gap" as well. The estimate answers the visitor; the gap records that the real evidence is missing and somebody should file it.

Rules that do not bend:
- Never estimate a figure a record already answers. Check first.
- Never contradict an estimate the company already holds. If one is in your context, it is now the company's number and you use it.
- Never invent a named person. The people are who they are.
- Anything about an individual's health, discipline, pay or family circumstances is handled as the ordinary sensitive record it is, at the clearance it belongs to, and you do not embroider it.
- If you genuinely cannot reason a value from anything you can see, leave "factProposal" null and say you do not know. A guess with no basis is worse than an admitted hole.`;

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
List route entries in the order they should be handled. Respect real dependencies (for example: Operations before Commercial before Customers & Marketing, when a reply depends on both a price and a feasibility check).`;

function buildReceptionistSystemPrompt() {
  const routingMap = ROUTABLE_WORKER_IDS.map((id) => {
    const w = WORKERS[id];
    return `- "${id}" (${w.canonicalName} / ${w.characterName}, ${w.displayRole}): ${w.purpose}`;
  }).join('\n');

  // Ruth is told about the dormant three by name so she can explain their
  // real status instead of improvising. Without this she has no idea they
  // exist, and a finance or HR question either gets silently absorbed by a
  // worker who does not own it or is answered as though the company keeps
  // no such records. Both are dishonest in different directions, and the
  // brief asks specifically for the true answer.
  //
  // Derived from PROPOSED_WORKER_IDS rather than written out, so
  // activating one of them (setting active: true in workers.js) removes it
  // from this block and adds it to the routing map in the same edit, with
  // nothing here left describing it as dormant.
  const proposedBlock = PROPOSED_WORKER_IDS.map((id) => {
    const w = WORKERS[id];
    return `- ${w.canonicalName} (${w.characterName}, ${w.displayRole}). Their remit, once activated: ${w.purpose}`;
  }).join('\n');

  // Since the 30/08/2026 activation of all three v0.2 workers this list is
  // empty and the whole section drops out of Ruth's prompt. It stays
  // derived rather than deleted so that deactivating a worker (flipping
  // active back to false in workers.js) restores the honest explanation in
  // the same edit, with the count worded from the list itself.
  const proposedSection = PROPOSED_WORKER_IDS.length === 0 ? '' : `

SPECIALISTS THAT EXIST BUT ARE NOT ACTIVE
${PROPOSED_WORKER_IDS.length === 1 ? 'One further specialist is' : `${PROPOSED_WORKER_IDS.length === 2 ? 'Two' : 'Three'} further specialists are`} fully specified and built, and NOT active, so you cannot route to them and they cannot answer:
${proposedBlock}
They are held back because Tom Arrington has not activated them. That is the real reason and you may say it plainly.

When a request belongs to one of these specialists, do not pretend the area is unowned, do not quietly hand it to a worker who does not own it, and do not imply the company holds no such records. Say which specialist owns it, that they are built but not switched on yet, and what can honestly be done in the meantime: Derek can report what the records already show, and a person can decide. Route the reportable part to "company_brain" where there is one, and leave the decision with the human. Never state or imply that an inactive specialist has reviewed, checked or approved anything.`;

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
A broad status question ("what needs my attention today", "which jobs are at risk this week"), or a request to recall or summarise existing history ("summarise everything before I call a customer", "what happened with an earlier enquiry"), belongs to "company_brain". Derek already has the broadest read access of anyone on the team and this is exactly his organisational-memory job: reporting what the records show, not deciding anything. The moment a request actually needs a decision, a quote, a schedule, or an outward-facing draft, route that part to the specialist who owns it (commercial/operations/customers_marketing) as normal. Derek supplying background evidence first does not change who owns the decision. Do not send an ordinary decision to Derek merely because he could technically retrieve the relevant record.${proposedSection}

If the request contains more than one owned component, list each in dependency order. Do not invent a new worker. Do not answer specialist questions yourself. Your job is routing, plus a short note.`;

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
  return `POSITIONS ALREADY GIVEN BY COLLEAGUES EARLIER IN THIS SAME REQUEST (their stated position only, and you were not shown their internal reasoning, and neither were they shown yours)\n${lines.join('\n')}`;
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
  // A reply cut off at the token ceiling is not a badly written reply: it
  // is a correct reply we did not leave room for, and its JSON is
  // truncated mid-object, which surfaces as "Unexpected end of JSON
  // input". Detecting it from stop_reason rather than from the parse
  // error means the retry can do the one thing that actually helps
  // (raise the ceiling) instead of asking the model to fix a schema it
  // never got to finish. This is the failure that was reaching visitors
  // as a "technical problem" bubble on the demonstration, from the
  // longest-answering worker, Company Brain.
  if (response && response.stop_reason === 'max_tokens') {
    const err = new Error(`the reply was cut off at the ${maxTokens} token ceiling`);
    err.code = 'TRUNCATED_REPLY';
    throw err;
  }
  return extractJson(textBlock && textBlock.text);
}

// A failure where the model never produced a usable reply at all: rate
// limit, overloaded, timeout, network drop. These deserve a plain retry
// with a pause, not a schema-correction prompt (there is no reply to
// correct), and they are exactly what a visitor hits when something else
// (a test suite, a deploy) is contending for the same API at that moment.
function isTransientApiError(err) {
  const status = err && (err.status || err.statusCode);
  if (status === 429 || (typeof status === 'number' && status >= 500)) return true;
  return /overloaded|rate.?limit|timed?.?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up|network/i.test(String((err && err.message) || ''));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The token ceiling never rises above this, so a runaway reply cannot
// turn one visitor's question into an unbounded spend.
const MAX_TOKEN_CEILING = 4096;

async function callWithRetry(systemPrompt, buildUserContent, validate, maxTokens) {
  let firstErrors = null;
  let lastTransient = null;
  // Raised, not reset, when a reply comes back truncated: the next
  // attempt gets more room AND is told to be brief, so the same question
  // does not fail the same way three times.
  let ceiling = maxTokens;
  let brevityNote = '';

  // Up to three attempts, short backoff between them, for calls that die
  // before the model replies. A single blip must not become a
  // customer-visible "technical problem" bubble on the shop front; three
  // failures over several seconds means the API is genuinely unavailable.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const first = await callAnthropic(systemPrompt, `${buildUserContent()}${brevityNote}`, ceiling);
      const check = validate(first);
      if (check.valid) return { ok: true, data: first };
      firstErrors = check.errors;
      break;
    } catch (err) {
      console.error(`Scott model call failed (attempt ${attempt} of 3): ${err.message}`);
      // A reply that was cut off, or that never arrived at all, is
      // retried plainly with more room rather than treated as a schema
      // failure: there is no malformed reply to correct, only one we did
      // not leave space for.
      if (err.code === 'TRUNCATED_REPLY' || err.code === 'EMPTY_REPLY') {
        lastTransient = err;
        ceiling = Math.min(ceiling * 2, MAX_TOKEN_CEILING);
        brevityNote = '\n\nKeep the reply short and complete: two or three sentences of plain text in the JSON, and close the JSON object properly. A cut-off reply is worse than a brief one.';
        if (attempt < 3) await sleep(500 * attempt);
        continue;
      }
      if (!isTransientApiError(err)) {
        firstErrors = [`Reply could not be parsed as JSON: ${err.message}`];
        break;
      }
      lastTransient = err;
      if (attempt < 3) await sleep(1500 * attempt);
    }
  }
  if (firstErrors === null) {
    return { ok: false, errors: [`Model unavailable after 3 attempts: ${lastTransient && lastTransient.message}`] };
  }

  // A reply arrived but failed the schema (or was not JSON): one
  // corrective retry, telling the model exactly what to fix. Unchanged.
  try {
    const retryContent = `${buildUserContent()}${brevityNote}\n\nYour previous reply did not match the required schema. Fix these problems and reply again with the JSON object only, nothing else:\n- ${firstErrors.join('\n- ')}`;
    const retry = await callAnthropic(systemPrompt, retryContent, ceiling);
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
      note: "Ruth here, I've had a technical problem working out who should pick this up. Please try again in a moment.",
      route: [],
      refused: false,
      technicalFailure: true,
      errors: result.errors
    };
  }
  const route = result.data.route.slice(0, MAX_WORKERS_PER_TURN);
  return { ...result.data, route, technicalFailure: false };
}

async function callWorker(workerId, { userMessage, history, priorWorkerNotes, routeReason, entities, personaId }) {
  const worker = getWorker(workerId);
  const systemPrompt = buildWorkerSystemPrompt(worker);
  const historyBlock = formatHistoryForPrompt(history);
  const priorNotesBlock = formatPriorWorkerNotes(priorWorkerNotes);
  // Deterministic, code-fetched data slice for this worker only — see
  // lib/scott/data/contextBuilders.js. Built once per call from `entities`
  // (already extracted once for the whole turn in runTurn), so this is the
  // one place a worker's model call actually sees the isolated fictional
  // dataset, always scoped to what its own role is meant to see. personaId
  // additionally gates the deep-brain data (07Q/05A clearance intersection,
  // lib/scott/clearance.js) — a second, independent filter on top of this
  // worker's own permission, not a replacement for it.
  const dataContextBlock = await buildContext(workerId, { message: userMessage, entities: entities || {}, personaId });
  const buildUserContent = () => [
    historyBlock,
    priorNotesBlock,
    dataContextBlock,
    routeReason ? `WHY THIS WAS ROUTED TO YOU\n${routeReason}` : '',
    `THE USER'S MESSAGE\n${userMessage}`,
    'Reply with the JSON object only.'
  ].filter(Boolean).join('\n\n');

  // 1024 was the binding constraint behind the visitor-facing "technical
  // problem" bubbles of 30/08/2026: the longest-answering workers (the
  // Company Brain in particular) routinely need more than that to finish
  // a JSON object, and a reply cut off mid-object cannot be parsed at
  // all. Raised deliberately rather than left to the retry escalation,
  // so the common case succeeds on the FIRST attempt.
  const result = await callWithRetry(systemPrompt, buildUserContent, validateWorkerReply, 2048);
  if (!result.ok) {
    return {
      workerId,
      worker,
      reply: `${worker.characterName} hit a technical problem answering this and could not give a reliable reply. Please try again in a moment.`,
      certainty: null,
      writeback: null,
      escalation: null,
      gap: null,
      factProposal: null,
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
async function runTurn({ userMessage, history, personaId }) {
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
        entities,
        personaId
      });
      workerReplies.push(result);
    }
  }

  return { receptionist, workerReplies, entities };
}

module.exports = {
  isScottAIEnabled,
  describeScottAIStatus,
  MODEL,
  buildWorkerSystemPrompt,
  buildReceptionistSystemPrompt,
  validateWorkerReply,
  validateReceptionistReply,
  extractJson,
  isTransientApiError,
  callReceptionist,
  callWorker,
  runTurn,
  __setClientFactoryForTests,
  __resetClientFactoryForTests
};
