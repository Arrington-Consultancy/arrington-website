// Scott AI Demonstration — evolving fictional business memory ledger.
//
// Implements "SCOTT EVOLVING FICTIONAL BUSINESS MEMORY - APPROVED DESIGN
// CHANGE - 31 AUGUST 2026" (Drive file 1MbwTpyLj3QUT376uMCmdCDWrJHj-
// kaARIZEBNjNhP_I). Read that document before changing this file — this
// module is the "structured fictional-business fact ledger" it requires,
// not a cache and not free-form chat history.
//
// WHAT THIS DOES NOT DO: it does not decide the CONTENT of a new fact.
// That is the specialist worker's judgement, expressed through the model
// call in lib/scott/orchestrator.js (a worker's JSON reply may carry a
// `memoryFact` proposal). This module is the deterministic, testable
// layer around that: it decides whether creating a fact in the proposed
// domain is even ELIGIBLE (reasonableness boundary), retrieves existing
// facts before any generation is allowed to happen, and persists a new
// fact atomically so two simultaneous first questions cannot establish
// contradictory answers. All of that has to work, and be provable, with
// no live model call at all — the paid live-AI suite is a separate,
// explicitly authorised thing, same pattern as every other Scott/
// Workspace AI feature in this codebase.
//
// REASONABLENESS BOUNDARY: enforced in CODE, not left to the prompt.
// A worker's own system prompt (see governance.js) tells it the same
// rules, but this module re-checks independently before anything is
// persisted, because a model that ignores an instruction is a normal
// failure mode this codebase never trusts a prompt alone to prevent
// (see e.g. the Workspace receptionist's field allowlist, H7/X1). Two
// gates, both required:
//   1. the domain itself must be on the curated ALLOWED_MEMORY_DOMAINS
//      list — genuinely ordinary, low-consequence operating categories,
//      never finance/HR/legal/safety/compliance/customer-commitment
//      domains, which stay in the existing "raise a gap, do not invent"
//      path (lib/scott/brainGaps.js) exactly as before this feature;
//   2. the question itself must not match a reserved-topic pattern
//      (tax, bank/payroll, insurance, contracts, personal data,
//      inspections, external-platform activity claims, consequential
//      customer promises, predictive claims) even inside an eligible
//      domain — belt and braces, since a domain alone cannot rule out
//      a badly-classified question landing in it.
//
// CLEARANCE: a generated fact inherits its topic's own existing clearance
// domain (07Q/05A), so it is gated by isDomainVisible() exactly like
// every other piece of company brain data. Creating a fact never grants
// a new domain to anyone; it only ever adds a ROW gated by a domain that
// already exists and is already governed.

const db = require('../../../db/pool');
const clearance = require('../clearance');

// Deliberately small and named, not inferred from a wider domain list.
// Each maps to one of the Drive doc's own examples: "a normal marketing
// budget" -> marketing_performance, "a routine supplier preference" ->
// suppliers_ops, "an internal recurring practice" -> materials (the
// workshop/knitting operating detail domain). Extending this list later
// means adding a domain the clearance model ALREADY recognises — never a
// domain invented for this feature alone, which would be a second access
// control model to keep in step with the first.
const ALLOWED_MEMORY_DOMAINS = Object.freeze(['marketing_performance', 'suppliers_ops', 'materials']);

const PROVENANCE = 'ai_generated_fictional_memory';
const ACTIVE_STATUSES = ['runtime_generated', 'drive_mirrored'];

// Bag-of-words stopword list for canonicalisation. This is a heuristic
// normaliser, not semantic understanding — documented as such rather than
// oversold, the same honesty convention this codebase uses for the H6
// canary-word heuristic and the factLedger's own equivalent-wording test.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'doing', 'have', 'has', 'had', 'having',
  'what', 'whats', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
  'we', 'us', 'our', 'ours', 'you', 'your', 'yours', 'i', 'me', 'my', 'it', 'its',
  'this', 'that', 'these', 'those', 'there', 'here',
  'for', 'of', 'on', 'in', 'to', 'at', 'by', 'with', 'from', 'as', 'about',
  'and', 'or', 'but', 'if', 'so', 'than', 'then',
  'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must',
  'usual', 'usually', 'normal', 'normally', 'typical', 'typically', 'generally',
  'currently', 'now', 'please', 'quick', 'one', 's', 't', 're', 've', 'll', 'd',
  'know', 'tell', 'get', 'got'
]);

// Tokenise, lowercase, strip punctuation, drop stopwords and single
// characters. Exported separately from canonicalizeQuestion so tests can
// assert on the token set directly, not just the joined key string.
function significantTokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// The canonical key: significant tokens, deduplicated, sorted, joined.
// Word order and filler words do not change the key, so "what's our usual
// glue supplier" and "the glue supplier we usually use" both reduce to
// "glue-supplier". Returns '' when fewer than two significant tokens
// survive — used as one signal (not the only one) that a question is too
// vague to be worth establishing as a company fact at all.
function canonicalizeQuestion(text) {
  const tokens = [...new Set(significantTokens(text))].sort();
  return tokens.join('-');
}

// Reserved-topic denylist. Matches inside an otherwise-eligible domain
// too — a domain allowlist alone cannot rule out a badly-classified
// question landing in it, so this is independent, not a fallback.
// Hardened 31/08/2026 against governance review 1's finding M2: all
// eight of the reviewer's rephrased probes evaded the original patterns
// (see review/scott-evolving-memory-governance-review-1-2026-08-31.md).
// This is still a keyword/phrase heuristic layered ON TOP of the domain
// allowlist and worker/persona permission checks above, not a semantic
// classifier — a sufficiently creative rephrasing can still evade it.
// Stated plainly rather than oversold: this net is wider than before and
// demonstrably catches the eight specific probes that broke it, not a
// guarantee against every future rephrasing.
const RESERVED_TOPIC_PATTERNS = [
  { label: 'legal_regulatory', pattern: /\b(legal|solicitor|litigation|liabilit(y|ies)|licen[cs]e|licensing|regulat(ion|or|ory))\b/i },
  { label: 'tax_filings', pattern: /\b(tax|hmrc|vat return|corporation tax|self.?assessment)\b/i },
  { label: 'bank_financial_commitment', pattern: /\b(bank|balance|overdraft|loan|mortgage|dividend|\bdla\b|payroll|salary|wage|financial commitment)\b/i },
  { label: 'employment_hr', pattern: /\b(payroll|salary|wage|employment contract|disciplinary|grievance|sick(ness)? record|maternity|paternity|dismiss(al|ed)?)\b/i },
  { label: 'health_safety_inspection', pattern: /\b(inspection|inspector|environmental health|fire (safety )?certificate|health and safety (audit|inspection))\b/i },
  { label: 'insurance', pattern: /\b(insur(e|ance|ed)|policy excess|indemnit(y|ies)|public liability cover)\b/i },
  // Widened from "signed (a|the) contract/agreement" to any mention of a
  // contract/agreement/arrangement at all: an unsigned or undated one is
  // still a commercial commitment the document reserves, and the reviewer's
  // probes named "agreement" and "arrangement" without ever using "signed".
  { label: 'signed_contracts', pattern: /\b(contract|agreement|arrangement)\b|\bnda\b|non.?disclosure/i },
  { label: 'personal_data', pattern: /\b(personal data|home address|date of birth|national insurance number|medical (record|condition)|passport number)\b/i },
  // Widened with the specific fabricated-analytics shapes the reviewer
  // found (a conversion rate, "how many people see our posts") on top of
  // the original named metrics.
  { label: 'external_platform_activity', pattern: /\b(followers|engagement rate|impressions|click.?through|conversion rate|reach|(see|saw|views? of) our posts|posts? (each|per) (month|week)|actual (facebook|instagram|linkedin|x) (post|activity))\b/i },
  { label: 'quality_inspection_result', pattern: /\b(passed inspection|failed inspection|quality (sign.?off|audit) result)\b/i },
  // Widened with the discretionary-discount/free-extra phrasings the
  // reviewer found (no "discount"/"guarantee"/"refund" literal present).
  { label: 'consequential_customer_promise', pattern: /\b(guarantee|promise(d)?|refund|compensat(e|ion)|discount( of)?|free of charge|knock (a bit |some )?off|money off|throw in|on the house|complimentary|for regulars|repeat customers)\b/i },
  // Widened from "will be" to "will" followed by any verb (the reviewer's
  // probes used "will ... look like" / "will ... charge"), plus seasonal
  // future references that carry no "will" at all.
  { label: 'predictive_future', pattern: /\bwill\s+\w+|\bnext (year|quarter|month|season|spring|summer|autumn|winter)\b|\bin the run.?up to (spring|summer|autumn|winter)\b|\bforecast|\bpredict(ion)?|\bgoing to (be|happen)\b/i }
];

function matchedReservedTopic(text) {
  const found = RESERVED_TOPIC_PATTERNS.find((r) => r.pattern.test(String(text || '')));
  return found ? found.label : null;
}

// The single reasonableness gate. Returns { allowed, canonicalKey } or
// { allowed: false, reason }. Never throws — an unreasonable question is
// an ordinary outcome, not an error.
//
// Governance review 1 (31/08/2026), finding M1 (HIGH): this used to check
// only the WORKER's domain permission, never the asking PERSONA's — the
// opposite half of 07Q/05A's own "narrowest wins" rule enforced everywhere
// else in this codebase. Concretely: marketing_performance is deliberately
// withheld from Chloe Reed (see the comment on her PERSONA_DOMAINS entry
// in clearance.js) but customers_marketing — her own specialist — holds
// it, so she could ask Bob Fletcher an ordinary marketing-budget question
// and be shown a fabricated marketing_performance answer in that same
// reply. Fixed by requiring isDomainVisible(personaId, workerId, domain)
// — both legs, not one — before a fact may be created.
function classifyReasonableness({ workerId, personaId, domain, canonicalQuestion }) {
  if (!ALLOWED_MEMORY_DOMAINS.includes(domain)) {
    return { allowed: false, reason: 'domain_not_eligible' };
  }
  if (!clearance.workerCanReadDomain(workerId, domain)) {
    // Defence in depth: the relevant specialist owns the judgement (per
    // the Drive doc), so a worker proposing a fact in a domain it is not
    // even permitted to READ is refused structurally, not just by the
    // routing map steering questions elsewhere in the ordinary case.
    return { allowed: false, reason: 'worker_not_authorised_for_domain' };
  }
  // The other half of narrowest-wins: the worker may hold this domain for
  // other questions, but the specific human asking right now may not. A
  // missing personaId fails CLOSED here (no default to the owner persona)
  // — unlike contextBuilders.js's read-path default, this is a brand new
  // capability with no pre-existing caller to stay compatible with, so
  // there is no reason to inherit that fallback's fail-open direction.
  // (clearance.personaCanSeeDomain itself still falls back to the owner
  // for a garbage-but-non-empty persona id — that is a separate,
  // pre-existing, documented gap in clearance.js, not touched here.)
  if (!personaId || !clearance.personaCanSeeDomain(personaId, domain)) {
    return { allowed: false, reason: 'persona_not_authorised_for_domain' };
  }
  const reserved = matchedReservedTopic(canonicalQuestion);
  if (reserved) {
    return { allowed: false, reason: `reserved_topic:${reserved}` };
  }
  const key = canonicalizeQuestion(canonicalQuestion);
  if (key.split('-').filter(Boolean).length < 2) {
    return { allowed: false, reason: 'too_vague' };
  }
  return { allowed: true, canonicalKey: key };
}

function rowToFact(row) {
  if (!row) return null;
  return {
    id: row.id,
    domain: row.domain,
    canonicalKey: row.canonical_key,
    canonicalQuestion: row.canonical_question,
    answer: row.answer_text,
    createdByWorkerId: row.created_by_worker_id,
    askedByPersonaId: row.asked_by_persona_id,
    provenance: row.provenance,
    reasonablenessClass: row.reasonableness_class,
    status: row.status,
    relatedSourceRefs: row.related_source_refs,
    supersedesId: row.supersedes_id,
    version: row.version,
    createdAt: row.created_at
  };
}

// Existing controlled evidence always wins (answering rule step 1) — this
// module never touches deepBusinessFacts.js or the SQL-derived context;
// callers (contextBuilders.js) check that FIRST and only fall through to
// this ledger when the controlled evidence has nothing to say. This
// function only ever reads/writes the runtime memory layer.
async function findActiveFact(domain, canonicalKey) {
  const { rows } = await db.query(
    `SELECT * FROM scott_memory_facts
     WHERE domain = $1 AND canonical_key = $2 AND status = ANY($3::text[])
     ORDER BY created_at DESC LIMIT 1`,
    [domain, canonicalKey, ACTIVE_STATUSES]
  );
  return rowToFact(rows[0]);
}

// Clearance-gated relevance search used to build the "previously
// established" context block BEFORE any generation is allowed to happen
// (answering rule step 2). Domain is not known yet at this point (the
// worker has not spoken), so this matches on token overlap with the
// message across every active fact, then drops anything the asking
// persona/worker pair could not otherwise see — the same isDomainVisible
// gate as every other piece of company brain data, so creating a fact
// never grants a new domain to anyone reading it back later.
async function findRelevantFacts(personaId, workerId, message, limit = 6) {
  // Governance review 1 (31/08/2026), finding M5: this used to default a
  // missing personaId to clearance.DEFAULT_PERSONA (the owner, '*') —
  // fail OPEN, the wrong direction for a codebase that otherwise insists
  // on fail-closed (see the Workspace's own filterByClearance/null-
  // workerId convention). Unreachable today (every real caller already
  // resolves a genuine personaId — see clearance.getEffectivePersonaId,
  // which never returns falsy), but a function this security-relevant
  // should not depend on every future caller remembering to. No default:
  // an unset persona now sees nothing.
  if (!personaId) return [];
  const queryTokens = new Set(significantTokens(message));
  if (queryTokens.size === 0) return [];
  const { rows } = await db.query(
    `SELECT * FROM scott_memory_facts WHERE status = ANY($1::text[]) ORDER BY created_at DESC LIMIT 200`,
    [ACTIVE_STATUSES]
  );
  const scored = rows
    .filter((row) => clearance.isDomainVisible(personaId, workerId, row.domain))
    .map((row) => {
      const factTokens = new Set(String(row.canonical_key || '').split('-').filter(Boolean));
      const overlap = [...factTokens].filter((t) => queryTokens.has(t)).length;
      return { row, overlap };
    })
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, limit).map((s) => rowToFact(s.row));
}

// Atomic "insert or get the canonical row" — the actual first-write-wins
// mechanism. Relies entirely on uq_scott_memory_facts_active (schema.sql
// / db/seed.js); this function contains no read-then-decide window of its
// own for the conflict case, which is the property the alert-claim saga
// (CLAUDE.md, K1/L1/L2) proved matters under real concurrency.
async function createFactAtomic({ domain, canonicalKey, canonicalQuestion, answerText, workerId, askedByPersonaId }) {
  const inserted = await db.query(
    `INSERT INTO scott_memory_facts
       (domain, canonical_key, canonical_question, answer_text, created_by_worker_id, asked_by_persona_id, provenance)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (domain, canonical_key) WHERE status IN ('runtime_generated', 'drive_mirrored') DO NOTHING
     RETURNING *`,
    [domain, canonicalKey, canonicalQuestion, answerText, workerId, askedByPersonaId || '', PROVENANCE]
  );
  if (inserted.rows.length > 0) {
    return { created: true, fact: rowToFact(inserted.rows[0]) };
  }
  // Lost the race (or the fact already existed from an earlier turn): the
  // canonical row is whichever one actually landed first. Re-select
  // rather than assume our own answerText — that is the whole point.
  const existing = await findActiveFact(domain, canonicalKey);
  return { created: false, fact: existing };
}

// The single entry point orchestrator.js calls when a worker's reply
// proposes a new memoryFact. Runs the full answering rule (existing
// memory check, then reasonableness, then atomic persist) so there is
// exactly one place this sequence can be gotten wrong, not one copy per
// caller.
async function establishFact({ workerId, domain, canonicalQuestion, answerText, askedByPersonaId }) {
  const gate = classifyReasonableness({ workerId, personaId: askedByPersonaId, domain, canonicalQuestion });
  if (!gate.allowed) {
    return { ok: false, reason: gate.reason };
  }
  const existing = await findActiveFact(domain, gate.canonicalKey);
  if (existing) {
    // Model variation is never a valid reason to change a stored fact
    // (CONSISTENCY AND CHANGE) — a worker re-proposing the same question
    // is handed the existing canonical answer, not a fresh one.
    return { ok: true, created: false, fact: existing };
  }
  const result = await createFactAtomic({
    domain,
    canonicalKey: gate.canonicalKey,
    canonicalQuestion,
    answerText,
    workerId,
    askedByPersonaId
  });
  return { ok: true, created: result.created, fact: result.fact };
}

// Legitimate later change (CONSISTENCY AND CHANGE): a fictional business
// event, not model variation, is the only valid reason to call this. The
// old row is retained as history (status superseded), never deleted —
// existing controlled evidence precedence and audit provenance both
// depend on the chain staying intact.
async function supersedeFact(oldFactId, { answerText, workerId, askedByPersonaId, reasonForChange }) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: oldRows } = await client.query('SELECT * FROM scott_memory_facts WHERE id = $1 FOR UPDATE', [oldFactId]);
    if (oldRows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_found' };
    }
    const old = oldRows[0];
    await client.query(`UPDATE scott_memory_facts SET status = 'superseded' WHERE id = $1`, [old.id]);
    const { rows: newRows } = await client.query(
      `INSERT INTO scott_memory_facts
         (domain, canonical_key, canonical_question, answer_text, created_by_worker_id, asked_by_persona_id, provenance, supersedes_id, version, related_source_refs)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [old.domain, old.canonical_key, old.canonical_question, answerText, workerId, askedByPersonaId || '', PROVENANCE, old.id, old.version + 1,
        JSON.stringify([{ reason: reasonForChange || '', supersedes: old.id }])]
    );
    await client.query('COMMIT');
    return { ok: true, fact: rowToFact(newRows[0]) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Called once an export has actually been placed into the controlled
// Drive record (a human/agent action, not automatic — see
// scripts/exportScottMemoryLedger.js). Moves status from
// 'runtime_generated' to 'drive_mirrored' without touching provenance,
// answer text or anything else: mirroring a fact to Drive changes where
// it has been reconciled, never what it says or where it came from.
async function markFactsMirrored(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
  const { rowCount } = await db.query(
    `UPDATE scott_memory_facts SET status = 'drive_mirrored' WHERE id = ANY($1::int[]) AND status = 'runtime_generated'`,
    [ids]
  );
  return { updated: rowCount };
}

module.exports = {
  ALLOWED_MEMORY_DOMAINS,
  PROVENANCE,
  ACTIVE_STATUSES,
  significantTokens,
  canonicalizeQuestion,
  RESERVED_TOPIC_PATTERNS,
  matchedReservedTopic,
  classifyReasonableness,
  findActiveFact,
  findRelevantFacts,
  createFactAtomic,
  establishFact,
  supersedeFact,
  markFactsMirrored
};
