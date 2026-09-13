// Scott AI Demonstration: closing an evidence gap by logic.
//
// Tom's instruction (13/09/2026): "close all gaps that are waiting using
// logic." The companion to automatic settlement: a fictional company that
// evolves on its own cannot keep a register of things waiting for its
// owner, and a Brain Gap that nobody will ever close is exactly that.
//
// WHY CLOSING ONE LOSES NOTHING, which is the whole justification. The gap
// loop is demand-driven: a gap exists because a worker hit a hole while
// answering, and the same hole raises a fresh gap the next time a worker
// hits it, wherever a turn is persisted. So a gap is a record of a moment,
// not a task list. Closing a stale one does not make the hole
// invisible; it makes the register show what is actually live.
//
// FOUR REASONS, and a gap closes only for one of them. Each is written onto
// the row, so the register says why rather than showing a status somebody
// has to interpret.
//
//   filled        a fact the company learned now answers it
//   already_held  the company already held the answer, so it was never a gap
//   not_material  nothing was blocked and no customer commitment sits
//                 downstream, so there is nothing for the register to watch
//   stale         it blocked something, nobody filed the evidence, and the
//                 window has passed; it will be raised again on demand
//
// WHAT THIS NEVER DOES. It never sets source_corrected. That column is one
// person's explicit statement that they went and corrected a controlled
// record, and no code can make that true. An automatic closure is recorded
// with 'automatic' as the closer and a note saying the source itself was
// not edited, so a human resolution and a logical one stay different facts
// on the register. It also never touches a gap a person has already closed.
//
// Pure: no database, no network, no clock beyond the `now` it is handed, so
// every rule can be exercised without a running instance and the deployed
// path calls these same functions rather than a copy.

const OPEN_STATUSES = ['open', 'notified', 'awaiting_source'];

// How long a material gap stays on the register with nothing filed. Seven
// days is a working week: long enough that a gap raised on a Friday is
// still there on the following Thursday, short enough that the register
// reads as live rather than as an archive.
const STALE_DAYS = 7;

const CLOSURE_REASONS = ['filled', 'already_held', 'not_material', 'stale'];

function isOpen(gap) {
  return !!gap && OPEN_STATUSES.includes(gap.status);
}

function ageInDays(gap, now) {
  const created = gap && gap.created_at ? new Date(gap.created_at).getTime() : NaN;
  if (!Number.isFinite(created)) return 0;
  return (new Date(now).getTime() - created) / (24 * 3600 * 1000);
}

// One gap, against the proposals that were made for it. `candidates` is
// every scott_brain_candidates row whose gap_id is this gap; the caller
// passes them in rather than this module reading them, because this module
// does no I/O.
//
// Returns null to leave the gap alone, or { status, reason, note } to close
// it. 'resolved' means the question it blocked can now be answered;
// 'dismissed' means it was not a gap, or is no longer one worth holding.
function decideGapClosure(gap, { candidates = [], now = new Date() } = {}) {
  if (!isOpen(gap)) return null;

  const mine = candidates.filter((c) => c && Number(c.gap_id) === Number(gap.id));
  const admitted = mine.find((c) => c.status === 'approved');
  if (admitted) {
    return {
      status: 'resolved',
      reason: 'filled',
      note: `Closed automatically: the company now holds ${admitted.domain}/${admitted.fact_key}, so the question this gap blocked has an answer on file. The controlled source itself has not been edited by a person.`
    };
  }

  // A proposal dropped as an identical restatement, or rejected because the
  // company already holds the fact, both say the same thing: the evidence
  // was there all along and the worker did not find it.
  const alreadyHeld = mine.find((c) => c.status === 'superseded'
    || (c.status === 'rejected' && /already holds/i.test(String(c.decision_note || ''))));
  if (alreadyHeld) {
    return {
      status: 'dismissed',
      reason: 'already_held',
      note: `Closed automatically: the company already holds ${alreadyHeld.domain}/${alreadyHeld.fact_key}, so this was not a gap. Nothing was added and nothing was changed.`
    };
  }

  if (!gap.material) {
    return {
      status: 'dismissed',
      reason: 'not_material',
      note: 'Closed automatically: nothing was blocked by this and no job or enquiry was waiting on it. It stays on the register as a record of the moment it was raised, and will be raised again if it ever blocks anything.'
    };
  }

  const age = ageInDays(gap, now);
  if (age >= STALE_DAYS) {
    const rejected = mine.find((c) => c.status === 'rejected');
    const because = rejected
      ? ` A fill was proposed and refused by the checks: ${reasonOf(rejected)}`
      : ' No fill was proposed for it.';
    return {
      status: 'dismissed',
      reason: 'stale',
      note: `Closed automatically after ${STALE_DAYS} days with the evidence still not filed.${because} The hole is not hidden by this: the next worker who needs the same record raises a fresh gap for it.`
    };
  }

  return null;
}

function reasonOf(row) {
  return String(row.decision_note || '')
    .replace(/^(Rejected automatically|Admitted automatically|Not added, already held|Retracted by [^:]*):\s*/i, '')
    .trim() || 'no reason recorded';
}

// The whole register in one pass. Returns one entry per gap that should
// close, in the order given, so a caller can write them and report a count
// without deciding anything itself.
function planClosures(gaps = [], { candidates = [], now = new Date() } = {}) {
  const out = [];
  gaps.forEach((g) => {
    const decision = decideGapClosure(g, { candidates, now });
    if (decision) out.push({ gapId: g.id, ...decision });
  });
  return out;
}

// One sentence for the briefing, from the plan rather than from the rows,
// so it cannot describe a closure that did not happen.
function describeClosures(plan = []) {
  if (!plan.length) return 'No gaps closed.';
  const counts = CLOSURE_REASONS.map((r) => [r, plan.filter((p) => p.reason === r).length])
    .filter(([, n]) => n > 0);
  const words = {
    filled: 'answered by something the company learned',
    already_held: 'were never gaps, the answer was already on file',
    not_material: 'blocked nothing',
    stale: 'went unfilled and timed out'
  };
  return `${plan.length} gap${plan.length === 1 ? '' : 's'} closed: ${counts.map(([r, n]) => `${n} ${words[r]}`).join('; ')}.`;
}

module.exports = {
  OPEN_STATUSES,
  STALE_DAYS,
  CLOSURE_REASONS,
  isOpen,
  ageInDays,
  decideGapClosure,
  planClosures,
  describeClosures
};
