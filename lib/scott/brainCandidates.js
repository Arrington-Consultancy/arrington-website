// Scott AI Demonstration — proposed brain facts (gap-driven authoring).
//
// WHY THIS EXISTS. lib/scott/brainGaps.js already notices when a worker
// cannot answer because the evidence is missing, and puts a named human on
// the hook for correcting the source. That loop ends there: the gap is
// recorded and nothing fills it, because the company brain is a static
// file (lib/scott/deepBusinessFacts.js) transcribed by hand. So the demo
// discovers its own holes and then depends entirely on one person editing
// 1,500 lines of JavaScript to close them. For a fictional company whose
// whole premise is that too much runs through the owner, that is a poor
// joke at the builder's expense.
//
// This module is the other half: a worker may PROPOSE the fact it believes
// is missing, and that proposal is assessed here before any human is asked
// to look at it.
//
// WHAT THIS IS NOT. It is not self-learning and must never become it. A
// proposal is inert. Nothing in this file, and no code path anywhere,
// admits a proposed fact into the brain: only a human decision does that
// (see decideCandidate in lib/scott/data/repository.js), and
// assessCandidate() cannot return "approved" at all — the verdicts are
// admissible, review and blocked, where "admissible" means only "no flags
// raised", never "let it in". A test asserts that.
//
// The reason is not caution for its own sake. Scott's single most
// demonstrable property is that nine people give consistently different
// but non-contradictory answers about one company. A model writing its own
// facts breaks that silently, in front of whoever is being shown the demo,
// and it breaks it by doing the exact thing the demo exists to prove it
// will not do. It would also be unfileable: every fact in the brain
// carries a clearance domain because a human decided which controlled
// document it came from, and a self-authored fact has no source, so it
// would either fail to file or file by guess. Filing by guess is how a
// finance figure reaches the driver.
//
// TWO CLASSES OF CHECK, and they answer different questions.
//
//   CONFLICT: does this contradict something the company already holds?
//   Answered against the canon, deterministically, by comparing values.
//   A conflict BLOCKS, because admitting it would make the fiction
//   internally inconsistent, which is the failure mode that costs most in
//   front of a prospect.
//
//   DRIFT: is this believable for THIS company? A fact can contradict
//   nothing and still be wrong: a £4m contract, a supplier nobody has
//   heard of, a sentence written in a register the rest of the brain never
//   uses. Drift sends a candidate to review rather than blocking it,
//   because plenty of legitimate new facts will look unfamiliar — that is
//   what makes them new.
//
// The envelope drift is measured against is DERIVED from the fiction
// rather than hardcoded (see deriveWorldProfile). Hardcoding the turnover
// band here would mean the checks silently describing a company that no
// longer exists the moment the brain grows, which is the same class of
// mistake as the hand-kept record list that partitionDeepFacts replaced.
//
// Pure: no database, no network, no clock. Everything here is a function
// of its arguments, so the rules can be exercised without a running
// instance, and the deployed path calls these same functions rather than a
// copy of them.

const clearance = require('./clearance');
const deepFacts = require('./deepBusinessFacts');

const CANDIDATE_STATUSES = ['pending', 'approved', 'rejected', 'superseded'];

// Deliberately no 'approved' member. A verdict describes what the checks
// found, never what should happen to the record.
const VERDICTS = ['admissible', 'review', 'blocked'];

// Drift flags that are serious enough to block rather than review.
// Only one qualifies: a domain the clearance model does not know cannot be
// filtered by it, so admitting the fact would put it outside every access
// control on the system rather than merely making it look odd.
const BLOCKING_DRIFT = ['unknown_domain'];

// Register rules taken from the same brand constraints the rest of this
// project is written to. Kept short on purpose: a long denylist produces
// false positives on ordinary English, and a check that cries wolf on
// legitimate facts is worse than no check, which this project has learned
// the expensive way more than once.
const BANNED_TOKENS = [
  'unlocking', 'empowering', 'seamless', 'transformative', 'synergy',
  'holistic', 'leverage', 'world class', 'best in class', 'game changing'
];

// Written as an escape rather than the character itself: this file is
// scanned by test/noEmDashes.test.js along with every other Scott prompt
// and UI string, and a literal one here fails that scan even though its
// purpose is to forbid them. Caught by that test on the first run, which
// is the test doing exactly its job.
const EM_DASH = '\u2014';

// ------------------------------------------------------------
// WORLD PROFILE
// ------------------------------------------------------------
// Everything drift is measured against, computed from the brain itself.
//
// Money: anchored on what the company TRADES, not on the largest money
// figure in the records. The first version of this took the maximum of
// anything money-shaped and produced a ceiling of GBP 10,000,000, which is
// the employers' liability cover limit — an insurance policy maximum, not
// a figure this business could ever turn over. Against that ceiling a
// proposed GBP 4,000,000 contract passed as unremarkable. The anchor is
// therefore annual turnover and sales run rate only, and a single figure
// is allowed to reach a multiple of it before anyone is asked to look.
//
// The multiple is deliberately generous. Drift only sends a fact to
// review, so the cost of flagging a legitimate large figure is that a
// human reads one sentence, while the cost of flagging ordinary figures
// would be a queue nobody trusts.
//
// Entities: every name the fiction already contains. A proposal naming
// somebody outside that set is inventing a person or a company, which is
// the most common way a generated fact goes wrong and the hardest to spot
// by reading, because an invented supplier reads exactly like a real one.
const TRADING_KEY = /turnover|salesrunrate|sales_run_rate|runrate/i;
const SCALE_TOLERANCE = 2;

function deriveWorldProfile(records = allCanonRecords()) {
  const names = new Set();
  let annualTradingGbp = 0;

  records.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    Object.keys(r).forEach((k) => {
      const v = r[k];
      if (typeof v === 'string' && /name|supplier|customer|lender|owner/i.test(k)) {
        names.add(v.trim());
      }
      if (typeof v === 'number' && Number.isFinite(v) && TRADING_KEY.test(k) && v > annualTradingGbp) {
        annualTradingGbp = v;
      }
    });
  });

  // Persona display names are part of the world even when a persona holds
  // no record of their own.
  Object.keys(clearance.PERSONAS || {}).forEach((id) => {
    const p = clearance.PERSONAS[id];
    if (p && p.name) names.add(String(p.name).trim());
  });

  return {
    knownEntities: names,
    annualTradingGbp,
    moneyCeilingGbp: annualTradingGbp * SCALE_TOLERANCE,
    // Reported rather than assumed. With no trading figure in the records
    // there is no envelope to measure against, so the scale check does not
    // run at all, and a caller showing this to a human can say the figure
    // was not checked instead of implying it passed. Silence and a pass
    // look identical otherwise, which is the failure this project keeps
    // finding in its own review history.
    scaleCheckable: annualTradingGbp > 0,
    knownDomains: new Set(Object.keys(clearance.DOMAIN_LABELS || {}))
  };
}

// The canon a candidate is checked against: the static brain plus any
// facts a human has already approved. Approved facts are passed in by the
// caller (they live in the database) rather than read here, because this
// module does no I/O.
function allCanonRecords(approvedFacts = []) {
  const statics = [];
  Object.keys(deepFacts).forEach((key) => {
    const value = deepFacts[key];
    if (Array.isArray(value)) {
      value.forEach((r) => { if (r && typeof r === 'object' && r.domain) statics.push(r); });
    } else if (value && typeof value === 'object' && value.domain) {
      statics.push(value);
    }
  });
  return statics.concat(approvedFacts.filter((r) => r && typeof r === 'object'));
}

// ------------------------------------------------------------
// NORMALISATION
// ------------------------------------------------------------
// Turns whatever the model returned into the fixed shape the rest of this
// module and the database expect. Anything missing becomes an empty string
// rather than undefined, so a malformed proposal fails the checks below on
// its content instead of throwing somewhere further down.
function normaliseCandidate(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    domain: str(c.domain),
    factKey: str(c.factKey || c.fact_key).toLowerCase().replace(/\s+/g, '_'),
    factValue: str(c.factValue || c.fact_value),
    sourceLabel: str(c.sourceLabel || c.source_label),
    proposedByWorkerId: str(c.proposedByWorkerId || c.proposed_by_worker_id),
    gapId: Number.isInteger(c.gapId) ? c.gapId : (Number.isInteger(c.gap_id) ? c.gap_id : null),
    estimated: c.estimated === true,
    basis: str(c.basis)
  };
}

// ------------------------------------------------------------
// NUMBERS
// ------------------------------------------------------------
// Pulls money-shaped figures out of free text. Deliberately narrow: it
// reads GBP/£ amounts and bare thousands-separated numbers, and ignores
// years, percentages and reference numbers, because the cost of a false
// positive here is a legitimate fact being held up.
// The sign is read from either side of the symbol, because both "-£2,000"
// and "£-2,000" occur in written figures. Without that the negative check
// below was unreachable, which a test asserting nothing in particular
// managed to hide.
function extractMoneyFigures(text) {
  if (typeof text !== 'string' || !text) return [];
  const out = [];
  const re = /(-)?\s*(?:£|\bGBP\s*)\s*(-)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(String(m[3]).replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    out.push(m[1] || m[2] ? -n : n);
  }
  return out;
}

// ------------------------------------------------------------
// CONFLICT
// ------------------------------------------------------------
// Does this contradict what the company already holds?
//
// Three shapes, all decided by comparing values rather than by asking a
// model whether two sentences disagree:
//
//   duplicate_key       the same domain already holds this fact key with a
//                       different value
//   pending_duplicate   another proposal is already queued for it, so
//                       approving both would produce exactly the
//                       contradiction this file exists to prevent
//   figure_contradiction the proposal asserts a money figure for a key the
//                       canon already answers with a different one
function checkConflicts(candidate, { canon = [], pending = [] } = {}) {
  const flags = [];
  const c = normaliseCandidate(candidate);
  if (!c.factKey) return flags;

  const sameKey = canon.filter((r) => r
    && r.domain === c.domain
    && String(r.factKey || '').toLowerCase() === c.factKey);

  sameKey.forEach((r) => {
    const existing = String(r.factValue == null ? '' : r.factValue).trim();
    if (existing && existing !== c.factValue) {
      flags.push({
        code: 'duplicate_key',
        detail: `${c.domain}/${c.factKey} is already recorded as "${truncate(existing)}"`
      });
    }
  });

  pending.forEach((p) => {
    const other = normaliseCandidate(p);
    if (other.domain === c.domain && other.factKey === c.factKey && other.factValue !== c.factValue) {
      flags.push({
        code: 'pending_duplicate',
        detail: `another proposal for ${c.domain}/${c.factKey} is already waiting for a decision`
      });
    }
  });

  // A figure asserted for a key the canon already answers numerically.
  const proposed = extractMoneyFigures(c.factValue);
  if (proposed.length) {
    sameKey.forEach((r) => {
      const held = extractMoneyFigures(String(r.factValue == null ? '' : r.factValue));
      const clash = held.some((h) => !proposed.includes(h));
      if (held.length && clash) {
        flags.push({
          code: 'figure_contradiction',
          detail: `${c.domain}/${c.factKey} already holds ${held.map(fmtGbp).join(', ')}`
        });
      }
    });
  }

  return flags;
}

// ------------------------------------------------------------
// DRIFT
// ------------------------------------------------------------
// Is this believable for this company, regardless of whether anything
// contradicts it?
function checkDrift(candidate, profile = deriveWorldProfile()) {
  const flags = [];
  const c = normaliseCandidate(candidate);

  if (!c.domain || !profile.knownDomains.has(c.domain)) {
    flags.push({
      code: 'unknown_domain',
      detail: c.domain
        ? `"${c.domain}" is not a clearance domain, so the fact could not be access-controlled`
        : 'no clearance domain given, so the fact could not be access-controlled'
    });
  }

  if (!c.factValue) {
    flags.push({ code: 'empty_value', detail: 'the proposal states no fact' });
  }

  if (!c.sourceLabel) {
    flags.push({
      code: 'unsourced',
      detail: 'no source named, so the fact would enter the brain with no provenance'
    });
  }

  const figures = extractMoneyFigures(c.factValue);
  if (figures.length && !profile.scaleCheckable) {
    // Said out loud rather than passed over. A figure that was never
    // measured against anything must not reach a reviewer looking the same
    // as one that was measured and cleared.
    flags.push({
      code: 'scale_unchecked',
      detail: 'the records hold no turnover figure, so the size of this amount was not checked against anything'
    });
  }
  figures.forEach((n) => {
    if (n < 0) {
      flags.push({ code: 'scale_implausible', detail: `negative amount ${fmtGbp(n)}` });
    } else if (profile.scaleCheckable && n > profile.moneyCeilingGbp) {
      flags.push({
        code: 'scale_implausible',
        detail: `${fmtGbp(n)} is more than twice the company's annual turnover (${fmtGbp(profile.annualTradingGbp)})`
      });
    }
  });

  namedEntities(c.factValue).forEach((name) => {
    if (!profile.knownEntities.has(name)) {
      flags.push({
        code: 'unknown_entity',
        detail: `"${name}" does not appear anywhere else in the company records`
      });
    }
  });

  const lower = c.factValue.toLowerCase();
  BANNED_TOKENS.forEach((t) => {
    if (lower.includes(t)) {
      flags.push({ code: 'register', detail: `"${t}" is not language this company's records use` });
    }
  });
  if (c.factValue.includes(EM_DASH)) {
    flags.push({ code: 'register', detail: 'em dash, which the house style does not use' });
  }

  return flags;
}

// Candidate person/organisation names: two or more capitalised words in a
// row, plus the Ltd/Limited suffix case. A heuristic, and stated as one:
// it will miss a single-word invented name and will occasionally offer a
// capitalised phrase that is not a name at all. It sends things to review
// rather than blocking them, which is the right direction for a check that
// is right most of the time rather than always.
function namedEntities(text) {
  if (typeof text !== 'string' || !text) return [];
  const out = new Set();
  const re = /\b([A-Z][a-z]+(?:\s+(?:&\s+)?[A-Z][a-z]+)+(?:\s+(?:Ltd|Limited|LLP|plc))?)\b/g;
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1].trim());
  return [...out];
}

// ------------------------------------------------------------
// VERDICT
// ------------------------------------------------------------
// Combines both classes of check into one answer. Note again what the
// answer is NOT: "admissible" means the checks found nothing, and a human
// still has to approve it. There is no value this function can return that
// puts a fact into the brain.
function assessCandidate(candidate, { canon = [], pending = [], profile } = {}) {
  const c = normaliseCandidate(candidate);
  const world = profile || deriveWorldProfile(canon.length ? canon : undefined);
  const conflictFlags = checkConflicts(c, { canon, pending });
  const driftFlags = checkDrift(c, world);

  const blockedByDrift = driftFlags.some((f) => BLOCKING_DRIFT.includes(f.code));
  let verdict = 'admissible';
  if (conflictFlags.length || blockedByDrift) verdict = 'blocked';
  else if (driftFlags.length) verdict = 'review';

  return {
    candidate: c,
    verdict,
    conflictFlags,
    driftFlags,
    // One sentence a human can read without opening the flag arrays. Built
    // from the flags rather than written per branch, so it cannot describe
    // a check that did not run.
    summary: describeAssessment(verdict, conflictFlags, driftFlags)
  };
}

function describeAssessment(verdict, conflictFlags, driftFlags) {
  if (verdict === 'blocked' && conflictFlags.length) {
    return `Blocked: ${conflictFlags.map((f) => f.detail).join('; ')}.`;
  }
  if (verdict === 'blocked') {
    return `Blocked: ${driftFlags.filter((f) => BLOCKING_DRIFT.includes(f.code)).map((f) => f.detail).join('; ')}.`;
  }
  if (verdict === 'review') {
    return `Needs a look: ${driftFlags.map((f) => f.detail).join('; ')}.`;
  }
  return 'No conflicts or drift found. Still needs a person to approve it before it enters the brain.';
}

// ------------------------------------------------------------
// AUTOFILL
// ------------------------------------------------------------
// Whether an assessed proposal may enter the brain WITHOUT a human, so the
// fictional company answers a question it has no record for and then stays
// consistent with what it said.
//
// This is a deliberate reversal of the original design, and worth stating
// plainly rather than quietly changing. The first version queued every
// proposal for approval on the argument that a model writing its own facts
// is making things up. That argument was borrowed from real-business
// systems and does not survive contact with what Scott actually is: every
// one of the 338 records in deepBusinessFacts.js was invented too, just by
// a person in a document rather than by a model at runtime. There is no
// difference in kind between those, only in coherence. And a demonstration
// that answers "I have no record of that" to most of what a visitor asks
// reads as an empty system, not an honest one.
//
// What DOES survive from the original argument is narrower and is enforced
// here rather than by a person:
//
//   - A guess must never contradict a record or an earlier guess, or the
//     company visibly tells two stories. Any conflict flag stops autofill.
//   - A guess must carry a real clearance domain, or an invented HR fact
//     is readable by the driver. unknown_domain stops autofill.
//   - A guess must be the right size for this company. scale_implausible
//     stops it, and so does scale_unchecked, because "we could not judge"
//     is not the same as "it is fine".
//   - An estimate must say what it is reasoned from, or it is not an
//     estimate, it is an assertion with better manners.
//
// Cosmetic drift does NOT stop autofill. A supplier nobody has heard of is
// exactly what inventing a supplier looks like, and a register slip is a
// tone problem, not a coherence one. Both stay recorded on the row.
//
// Off unless SCOTT_BRAIN_AUTOFILL is exactly 'true', so it can be turned
// off in one variable without a deploy if it ever misbehaves in front of
// somebody.
const AUTOFILL_BLOCKING_DRIFT = ['unknown_domain', 'scale_implausible', 'scale_unchecked'];

function isAutofillEnabled() {
  return process.env.SCOTT_BRAIN_AUTOFILL === 'true';
}

function autofillDecision(assessment, { enabled = isAutofillEnabled(), estimated = false, basis = '' } = {}) {
  if (!enabled) {
    return { autofill: false, reason: 'autofill is off in this environment, so it waits for a person' };
  }
  if (!assessment || !Array.isArray(assessment.conflictFlags)) {
    return { autofill: false, reason: 'the proposal was not assessed' };
  }
  if (assessment.conflictFlags.length) {
    return {
      autofill: false,
      reason: `it disagrees with something already on record: ${assessment.conflictFlags.map((f) => f.detail).join('; ')}`
    };
  }
  const blocking = (assessment.driftFlags || []).filter((f) => AUTOFILL_BLOCKING_DRIFT.includes(f.code));
  if (blocking.length) {
    return { autofill: false, reason: blocking.map((f) => f.detail).join('; ') };
  }
  if (estimated && !String(basis || '').trim()) {
    return { autofill: false, reason: 'an estimate with no stated basis is an assertion, not an estimate' };
  }
  return { autofill: true, reason: 'nothing it contradicts, a real clearance domain and a believable size' };
}

// Shape an approved candidate takes when it joins the brain. Same shape as
// a static record (a `domain` plus flat fields) so it flows through
// clearance.filterAndRedact and formatDeepFactsBlock with nothing added to
// either — approved facts are access-controlled by the existing rule, not
// by a second one written for them.
function toBrainRecord(row) {
  if (!row) return null;
  const estimated = row.estimated === true;
  const rec = {
    domain: row.domain,
    factKey: row.fact_key || row.factKey,
    factValue: row.fact_value || row.factValue,
    source: row.source_label || row.sourceLabel || 'approved addition',
    approvedBy: row.decided_by_name || row.decidedByName || ''
  };
  // An estimate reaches the workers labelled as one, with what it was
  // reasoned from. Two things depend on this and both matter: a later
  // answer can build on the same number rather than producing a second
  // one, and the worker can say it is an estimate instead of quoting it
  // back as though somebody had filed it.
  if (estimated) {
    rec.estimated = true;
    rec.basis = row.basis || row.basisText || '';
  }
  return rec;
}

function fmtGbp(n) {
  return `GBP ${Number(n).toLocaleString('en-GB')}`;
}

function truncate(s, n = 80) {
  const t = String(s);
  return t.length > n ? `${t.slice(0, n - 1)}...` : t;
}

module.exports = {
  CANDIDATE_STATUSES,
  VERDICTS,
  BLOCKING_DRIFT,
  AUTOFILL_BLOCKING_DRIFT,
  BANNED_TOKENS,
  isAutofillEnabled,
  autofillDecision,
  deriveWorldProfile,
  allCanonRecords,
  normaliseCandidate,
  extractMoneyFigures,
  namedEntities,
  checkConflicts,
  checkDrift,
  assessCandidate,
  describeAssessment,
  toBrainRecord
};
