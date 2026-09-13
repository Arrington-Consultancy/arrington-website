// Scott AI Demonstration: the fictional company's remembered state.
//
// Tom's requirement (13/09/2026): "Scott should feel like a real company
// with a remembered state. If someone asks the same factual question
// tomorrow, the answer should be the same unless the underlying fictional
// company record has genuinely changed... financial and staffing figures
// must remain internally consistent... wording can vary, facts cannot."
//
// Where the state actually lives, so a reader does not have to infer it:
//
//   - the transcribed and authored records in deepBusinessFacts.js and
//     seedCompanyDepth.js (static, in code);
//   - every fact the company has learned and still holds:
//     scott_brain_candidates rows with status 'approved', loaded into
//     memory by contextBuilders.loadApprovedFacts and merged into the same
//     list the static records are in (allDeepFactRecords);
//   - the live ledger position, derived from postings (finance/state.js).
//
// A worker answering a question is handed that whole list, filtered by
// clearance, in its prompt. That is what makes a repeated question land
// on the same figure: the figure is in front of the model the second
// time, marked as held, and the prompt forbids contradicting it. The
// deterministic backstop for the case where the model does it anyway is
// applied where a turn is persisted (reply reconciliation), not here.
//
// This module answers the OTHER half of the requirement: whether a new
// fact is consistent with the figures the company already has. It derives
// the company's economics from the records rather than stating them, for
// the same reason the drift envelope in brainCandidates.js does: a
// hardcoded turnover describes a company that stops existing the moment
// the fiction grows. Pure: no database, no clock, no network.

const ECONOMIC_KEYS = /turnover|salesrunrate|sales_run_rate|runrate/i;

// Walks nested objects and arrays, not just a record's top-level keys.
// The overheads figure lives inside FINANCE_SUMMARY's
// monthlyManagementAccounts array, and a top-level-only walk once
// reported "no overheads figure on record" against a record holding five.
function walkNumbers(value, visit, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v) => walkNumbers(v, visit, depth + 1));
    return;
  }
  Object.keys(value).forEach((k) => {
    const v = value[k];
    if (typeof v === 'number' && Number.isFinite(v)) visit(k, v);
    else if (v && typeof v === 'object') walkNumbers(v, visit, depth + 1);
  });
}

// The figures everything else is measured against. The LATEST month is
// used for overheads and revenue rather than the largest: both drift
// upward, and measuring this month's invented costs against a number from
// five months ago flatters them.
function companyEconomics(canonRecords = []) {
  let annualTurnoverGbp = 0;
  let monthlyOverheadsGbp = 0;
  let monthlyRevenueGbp = 0;
  let overheadsAsOf = '';
  let headcount = 0;
  const staffNames = new Set();

  canonRecords.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    walkNumbers(r, (k, v) => {
      if (ECONOMIC_KEYS.test(k) && v > annualTurnoverGbp) annualTurnoverGbp = v;
    });
    if (r.domain === 'staffing_capacity' && typeof r.name === 'string' && r.name.trim()) {
      headcount += 1;
      staffNames.add(r.name.trim());
    }
  });

  canonRecords.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const months = Array.isArray(r.monthlyManagementAccounts) ? r.monthlyManagementAccounts : null;
    if (months) {
      months.forEach((m) => {
        if (m && typeof m.overheadsGbp === 'number' && String(m.month || '') >= overheadsAsOf) {
          monthlyOverheadsGbp = m.overheadsGbp;
          monthlyRevenueGbp = typeof m.revenueGbp === 'number' ? m.revenueGbp : monthlyRevenueGbp;
          overheadsAsOf = String(m.month || '');
        }
      });
    }
  });
  if (!monthlyOverheadsGbp) {
    canonRecords.forEach((r) => {
      if (!r || typeof r !== 'object') return;
      walkNumbers(r, (k, v) => {
        if (/overhead/i.test(k) && v > monthlyOverheadsGbp) monthlyOverheadsGbp = v;
      });
    });
  }

  return { annualTurnoverGbp, monthlyOverheadsGbp, monthlyRevenueGbp, overheadsAsOf, headcount, staffNames };
}

// ------------------------------------------------------------
// CONSISTENCY
// ------------------------------------------------------------
// Is a proposed fact consistent with the figures the company already has?
// Every check here REJECTS at settlement (see REJECTING_DRIFT in
// brainCandidates.js), because each one describes a company that cannot
// exist: a single monthly cost bigger than the month's whole revenue, an
// annual figure bigger than the year's turnover, a percentage above a
// hundred, a headcount that disagrees with the staff register, or a
// staffing fact about somebody who is not on it.
//
// The bounds are deliberately the loose ones. Monthly costs are measured
// against monthly REVENUE, not overheads, because the September payroll
// (GBP 19,200) is larger than the overhead line (GBP 18,100) and is a real
// figure the company holds; a check that rejected it would reject the
// truth. The aggregate question (do all the invented costs together still
// fit inside the overheads) is a judgement, and it stays in the briefing
// for a person to read rather than becoming a rule here.

const MONTHLY_KEY = /monthly|per_month|a_month|month/i;
const ANNUAL_KEY = /annual|per_year|a_year|yearly|per_annum/i;
const COST_KEY = /cost|spend|budget|fee|subscription|premium|rent|bill|payroll|wage|salary|overhead|price/i;
const HEADCOUNT_KEY = /headcount|head_count|staff_count|number_of_staff|team_size|employee_count|employees|staff_total|total_staff/i;
const STAFFING_DOMAINS = ['staffing_capacity', 'hr_full'];
const MONTHLY_TEXT = /\b(a|per|each|every)\s+month\b|\bmonthly\b/i;
const ANNUAL_TEXT = /\b(a|per|each|every)\s+(year|annum)\b|\bannual(ly)?\b|\byearly\b/i;

function moneyIn(text) {
  if (typeof text !== 'string' || !text) return [];
  const out = [];
  const re = /(-)?\s*(?:£|\bGBP\s*)\s*(-)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(String(m[3]).replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(m[1] || m[2] ? -n : n);
  }
  return out;
}

function percentagesIn(text) {
  if (typeof text !== 'string' || !text) return [];
  const out = [];
  // The word boundary belongs to the spelled-out forms only. Anchoring it
  // after the symbol as well means "140%." never matches, because a full
  // stop is no more of a word character than the percent sign is, and that
  // is how most figures are actually written in a sentence.
  const re = /(-?[0-9]+(?:\.[0-9]+)?)\s*(?:%|per\s*cent\b|percent\b)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// A bare count in a headcount-shaped fact: "12 staff", "we employ 9
// people", "headcount is 8". Money and percentages are excluded first so
// "GBP 12,000" cannot read as twelve people.
function countsIn(text) {
  if (typeof text !== 'string' || !text) return [];
  const stripped = text
    .replace(/(-)?\s*(?:£|\bGBP\s*)\s*(-)?[0-9][0-9,]*(?:\.[0-9]{1,2})?/gi, ' ')
    .replace(/[0-9]+(?:\.[0-9]+)?\s*(?:%|per\s*cent|percent)/gi, ' ')
    .replace(/\b(19|20)[0-9]{2}\b/g, ' ');
  const out = [];
  const re = /\b([0-9]{1,3})\b/g;
  let m;
  while ((m = re.exec(stripped)) !== null) out.push(Number(m[1]));
  return out;
}

const gbp = (n) => `GBP ${Number(n).toLocaleString('en-GB')}`;

// Person names in a staffing fact: two capitalised words in a row. The
// same heuristic namedEntities uses in brainCandidates.js, applied here
// only inside the staffing domains, where an unknown name is not "a
// supplier nobody has heard of" (cosmetic) but an invented employee.
function personNamesIn(text) {
  if (typeof text !== 'string' || !text) return [];
  const out = new Set();
  const re = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g;
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1]);
  return [...out];
}

function checkConsistency(candidate, economics) {
  const flags = [];
  const c = candidate || {};
  const key = String(c.factKey || c.fact_key || '');
  const value = String(c.factValue || c.fact_value || '');
  const domain = String(c.domain || '');
  const e = economics || {};

  const figures = moneyIn(value).filter((n) => n > 0);
  const isMonthly = MONTHLY_KEY.test(key) || MONTHLY_TEXT.test(value);
  const isAnnual = ANNUAL_KEY.test(key) || ANNUAL_TEXT.test(value);
  // The KEY alone is not enough to tell a cost from anything else, and
  // reading it alone was a real hole: "Cream yarn costs GBP 900,000 a
  // month" filed under a key called reorder_qty was checked against
  // nothing and accepted. Found by exercising a correction over HTTP
  // rather than by reading the rule, which is why the sentence is read
  // here as well as the key, exactly as the monthly and annual signals
  // already were.
  const isCost = COST_KEY.test(key) || COST_KEY.test(value);

  if (figures.length && isCost && isMonthly && !isAnnual && e.monthlyRevenueGbp > 0) {
    figures.forEach((n) => {
      if (n > e.monthlyRevenueGbp) {
        flags.push({
          code: 'monthly_exceeds_revenue',
          detail: `${gbp(n)} a month is more than the company's whole monthly revenue (${gbp(e.monthlyRevenueGbp)} in ${e.overheadsAsOf || 'the latest month'})`
        });
      }
    });
  }

  if (figures.length && isCost && isAnnual && e.annualTurnoverGbp > 0) {
    figures.forEach((n) => {
      if (n > e.annualTurnoverGbp) {
        flags.push({
          code: 'annual_exceeds_turnover',
          detail: `${gbp(n)} a year is more than the company's whole annual turnover (${gbp(e.annualTurnoverGbp)})`
        });
      }
    });
  }

  percentagesIn(value).forEach((p) => {
    if (p > 100 || p < 0) {
      flags.push({ code: 'percentage_impossible', detail: `${p}% is not a percentage the company can hold` });
    }
  });

  if (HEADCOUNT_KEY.test(key) && e.headcount > 0) {
    const counts = countsIn(value);
    // The register lists employees; the owner may or may not be counted
    // in a "how many people" answer, so both are accepted. Anything else
    // disagrees with the staff register, which is a controlled record.
    const acceptable = new Set([e.headcount, e.headcount + 1]);
    counts.forEach((n) => {
      if (!acceptable.has(n)) {
        flags.push({
          code: 'headcount_mismatch',
          detail: `a headcount of ${n} disagrees with the staff register, which names ${e.headcount} employees (${e.headcount + 1} with the owner)`
        });
      }
    });
  }

  if (STAFFING_DOMAINS.includes(domain) && e.staffNames && e.staffNames.size) {
    const known = new Set([...e.staffNames, 'Scott Mercer']);
    personNamesIn(value).forEach((name) => {
      if (!known.has(name)) {
        flags.push({
          code: 'staffing_unknown_person',
          detail: `"${name}" is not on the staff register, and the company does not invent people`
        });
      }
    });
  }

  return flags;
}

// ------------------------------------------------------------
// REPEATABILITY
// ------------------------------------------------------------
// "If someone asks the same factual question tomorrow, the answer should be
// the same unless the underlying fictional company record has genuinely
// changed... wording can vary, facts cannot."
//
// The first line of defence is the prompt: every fact the company holds is
// in the worker's context, an estimate is marked as one, and the worker is
// told to reuse it rather than reason out a second. That is necessary and
// it is not sufficient, because it depends on a model following an
// instruction.
//
// This is the deterministic backstop, and it works on the one case that can
// be detected exactly. When a worker proposes a fact for a key the company
// already answers with a different value, the model has demonstrably
// produced a second answer to a question already settled. The proposal is
// rejected (settlement's first-wins rule), and the reply the visitor reads
// carries the held figure appended from the RECORD, not from the model. So
// the wording of the second answer can differ and the fact cannot.

function heldFactFor(candidate, canon = []) {
  const c = candidate || {};
  const domain = String(c.domain || '');
  const key = String(c.factKey || c.fact_key || '').toLowerCase();
  if (!domain || !key) return null;
  const matches = canon.filter((r) => r
    && r.domain === domain
    && String(r.factKey || '').toLowerCase() === key
    && String(r.factValue == null ? '' : r.factValue).trim());
  // The earliest match wins, the same direction settlement resolves in.
  return matches.length ? matches[0] : null;
}

// The sentence appended to a worker's reply when it tried to answer again.
// Built entirely from the stored record: nothing here is generated, and it
// says plainly that the figure is the company's own rather than presenting
// it as something the worker said.
function correctionNote(held) {
  if (!held) return '';
  const value = String(held.factValue == null ? '' : held.factValue).trim();
  if (!value) return '';
  const estimate = held.estimated === true;
  const basis = String(held.basis || '').trim();
  const lead = estimate
    ? 'The company already holds an estimate for this, and that estimate stands:'
    : 'The company already holds this on file:';
  const tail = estimate && basis ? ` It was reasoned from: ${basis}.` : '';
  return `${lead} ${value}${tail}`;
}

module.exports = {
  companyEconomics,
  checkConsistency,
  heldFactFor,
  correctionNote,
  moneyIn,
  percentagesIn,
  countsIn,
  personNamesIn,
  walkNumbers
};
