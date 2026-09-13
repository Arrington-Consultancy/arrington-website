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
// WHAT THIS IS, since 13/09/2026 (Tom's instruction, replacing the
// approval-queue design and the "not self-learning" rule that preceded it):
// Scott is a playable fictional company that evolves on its own while
// staying internally consistent. A proposal is assessed here and then
// SETTLED immediately by settleCandidate(): admitted, rejected with a
// stated reason, or dropped as an identical restatement. Nothing waits for
// a person. The verdict vocabulary (admissible, review, blocked) still
// describes what the checks FOUND; settlement is a separate function so
// the two questions stay separate and separately testable.
//
// The reasons the earlier design queued everything do survive, as rules
// applied by code rather than by a person: a guess must never contradict
// a record or an earlier guess (the earlier one stands, deterministically),
// it must carry a real clearance domain, it must be a believable size for
// this company, and an estimate must say what it rests on. A person's role
// is oversight afterwards, through the evolution briefing and the retract
// action on /scott/gaps, never approval beforehand.
//
// HARD BOUNDARY. This applies to the fictional Scott company only. This
// module is pure and reaches no database; the repository functions that
// act on its outcomes write only scott_brain_candidates and
// scott_activity. test/scott/brainSettlementFirewall.test.js pins that.
//
// TWO CLASSES OF CHECK, and they answer different questions.
//
//   CONFLICT: does this contradict something the company already holds?
//   Answered against the canon, deterministically, by comparing values.
//   A conflict BLOCKS, because admitting it would make the fiction
//   internally inconsistent, which is the failure mode that costs most in
//   front of a prospect. Settlement resolves it deterministically: the
//   fact the company already holds stands, the new one is rejected.
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
const companyState = require('./companyState');

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
function checkConflicts(candidate, { canon = [], pending = [], economics = null } = {}) {
  const flags = [];
  const c = normaliseCandidate(candidate);
  if (!c.factKey) return flags;

  // Internal consistency against the company's own figures (13/09/2026).
  // A cost bigger than the month's revenue, an annual figure bigger than
  // the year's turnover, a percentage over a hundred, a headcount that
  // disagrees with the staff register, or a member of staff who is not on
  // it: each describes a company that cannot exist, so each contradicts
  // what the company holds just as surely as a clashing figure does. They
  // live here rather than in drift because drift only asks whether a fact
  // LOOKS unfamiliar, and these are arithmetic.
  flags.push(...companyState.checkConsistency(c, economics || companyState.companyEconomics(canon)));

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
function assessCandidate(candidate, { canon = [], pending = [], profile, economics } = {}) {
  const c = normaliseCandidate(candidate);
  const records = canon.length ? canon : allCanonRecords();
  const world = profile || deriveWorldProfile(canon.length ? canon : undefined);
  const money = economics || companyState.companyEconomics(records);
  const conflictFlags = checkConflicts(c, { canon, pending, economics: money });
  const driftFlags = checkDrift(c, world);

  const blockedByDrift = driftFlags.some((f) => BLOCKING_DRIFT.includes(f.code));
  let verdict = 'admissible';
  if (conflictFlags.length || blockedByDrift) verdict = 'blocked';
  else if (driftFlags.length) verdict = 'review';

  // An identical restatement of something already held is not a conflict
  // and not new either. Settlement drops it rather than filing a second
  // copy, so the brain never holds the same fact twice under one key.
  const restatesRecord = canon.some((r) => r
    && r.domain === c.domain
    && String(r.factKey || '').toLowerCase() === c.factKey
    && String(r.factValue == null ? '' : r.factValue).trim() === c.factValue
    && c.factValue !== '');

  return {
    candidate: c,
    verdict,
    restatesRecord,
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
  return 'No conflicts or drift found.';
}

// ------------------------------------------------------------
// SETTLEMENT
// ------------------------------------------------------------
// What happens to an assessed proposal, decided by code at the moment it
// is made. Three outcomes and no fourth:
//
//   admit      it enters the company brain now, and the next question that
//              touches the same thing sees the same answer
//   reject     it does not enter, and the reason is recorded on the row
//   redundant  it restates something already held identically, so there
//              is nothing to add and nothing to record beyond the row
//
// "Pending" is not an outcome. That is the whole change of 13/09/2026: a
// fictional company that evolves on its own cannot have facts sitting in a
// queue waiting for its owner, and a briefing that lists them is an
// approval queue by another name.
//
// Deterministic conflict resolution: the fact the company ALREADY holds
// stands, whether it is a transcribed record, an authored record or an
// earlier estimate. "An estimate the company gives becomes the company's
// number" (governance.js), so the earlier number wins and the later one is
// rejected with a reason naming what it disagreed with. There is no case
// in which a later worker proposal is allowed to overwrite an earlier
// fact automatically: that would be the one way to make the fiction tell
// two stories, and it is exactly what a person's retraction is for.
//
// Drift that rejects: unknown_domain (could not be access-controlled),
// scale_implausible and scale_unchecked (wrong size, or size that could
// not be judged), empty_value and unsourced (nothing to hold, or nothing
// to say where it came from). Drift that does not: unknown_entity and
// register. A supplier nobody has heard of is what inventing a supplier
// looks like, and a register slip is a tone problem, not a coherence one.
// Both stay recorded on the row and both appear in the briefing.
//
// The kill switch stays: off unless SCOTT_BRAIN_AUTOFILL is exactly
// 'true'. With it off, proposals are REJECTED with that reason rather than
// parked, so switching it off freezes the fiction without building a
// backlog nobody will ever clear.
const REJECTING_DRIFT = ['unknown_domain', 'scale_implausible', 'scale_unchecked', 'empty_value', 'unsourced'];
// Conflict codes raised by companyState.checkConsistency rather than by a
// value clash. Listed here so settlement can say which of the two happened.
const CONSISTENCY_CODES = ['monthly_exceeds_revenue', 'annual_exceeds_turnover', 'percentage_impossible', 'headcount_mismatch', 'staffing_unknown_person'];
const SETTLEMENT_OUTCOMES = ['admit', 'reject', 'redundant'];

function isAutofillEnabled() {
  return process.env.SCOTT_BRAIN_AUTOFILL === 'true';
}

function settleCandidate(assessment, { enabled = isAutofillEnabled(), estimated = false, basis = '' } = {}) {
  if (!assessment || !Array.isArray(assessment.conflictFlags)) {
    return { outcome: 'reject', rule: 'unassessed', reason: 'the proposal was not assessed' };
  }
  if (!enabled) {
    return { outcome: 'reject', rule: 'evolution_off', reason: 'the company is not learning at the moment (SCOTT_BRAIN_AUTOFILL is off), so nothing new is kept' };
  }
  if (assessment.restatesRecord === true) {
    return { outcome: 'redundant', rule: 'already_held', reason: 'the company already holds this exact fact, so there is nothing to add' };
  }
  const inconsistent = assessment.conflictFlags.filter((f) => CONSISTENCY_CODES.includes(f.code));
  if (inconsistent.length) {
    // Reported separately from a clashing figure because the cause is
    // different and so is what a reader should do about it: nothing in the
    // company disagrees with this fact, it simply could not be true of a
    // business with these books.
    return {
      outcome: 'reject',
      rule: 'inconsistent_with_the_books',
      reason: `it does not fit the company's own figures: ${inconsistent.map((f) => f.detail).join('; ')}`
    };
  }
  if (assessment.conflictFlags.length) {
    return {
      outcome: 'reject',
      rule: 'earlier_fact_stands',
      reason: `it disagrees with what the company already holds and the earlier fact stands: ${assessment.conflictFlags.map((f) => f.detail).join('; ')}`
    };
  }
  const rejecting = (assessment.driftFlags || []).filter((f) => REJECTING_DRIFT.includes(f.code));
  if (rejecting.length) {
    return { outcome: 'reject', rule: rejecting[0].code, reason: rejecting.map((f) => f.detail).join('; ') };
  }
  if (estimated && !String(basis || '').trim()) {
    return { outcome: 'reject', rule: 'estimate_without_basis', reason: 'an estimate with no stated basis is an assertion, not an estimate' };
  }
  return { outcome: 'admit', rule: 'clean', reason: 'nothing it contradicts, a real clearance domain and a believable size' };
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
  REJECTING_DRIFT,
  CONSISTENCY_CODES,
  SETTLEMENT_OUTCOMES,
  BANNED_TOKENS,
  isAutofillEnabled,
  settleCandidate,
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
