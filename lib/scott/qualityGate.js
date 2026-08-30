// Quality release gate (doc 31 RELEASE GATE; 16A Quality Control addendum;
// doc 24 review finding F2).
//
// A job must not move into a release state (ready for return, completed,
// delivered) while quality evidence says otherwise. Two rules, and
// deliberately no bypass parameter:
//
//  1. A job with a linked quality record that is not PASS is never
//     releasable, whatever its board status. The record is the evidence,
//     and owner or customer-date pressure does not clear it (doc 22's
//     Quality Hold rule).
//  2. A job sitting in quality_check or rework needs a recorded PASS to
//     move to a release state. A missing inspection is not a PASS.
//
// Quality records live in the controlled dataset and are read-only through
// the portal, so nothing can be edited into compliance from here; the fix
// for a blocked job is the real-world one: record the inspection result.
const { QUALITY_QUEUE } = require('./deepBusinessFacts');

const RELEASE_STATUSES = ['ready_for_return', 'completed', 'delivered'];
const QUALITY_STAGES = ['quality_check', 'rework'];

function qualityRecordsForJob(jobRef) {
  return QUALITY_QUEUE.filter((q) => q.jobRef === jobRef);
}

// Returns { allowed: true } or { allowed: false, reason, records }.
// `reason` names the exact record, its status and what evidence is
// missing, because doc 31 requires the refusal to say exactly that
// rather than presenting a generic "not allowed".
function checkReleaseGate(jobRef, currentStatus, nextStatus) {
  if (!RELEASE_STATUSES.includes(nextStatus)) return { allowed: true };

  const records = qualityRecordsForJob(jobRef);
  const open = records.filter((q) => q.status !== 'PASS');
  if (open.length > 0) {
    const q = open[0];
    const action = q.action ? ` ${q.action}.` : '';
    return {
      allowed: false,
      reason: `Release blocked by quality record ${q.ref} (${q.status}, ${q.severity}): ${q.detail}.${action} A recorded PASS is required before this job can be released.`,
      records: open
    };
  }

  if (QUALITY_STAGES.includes(currentStatus) && !records.some((q) => q.status === 'PASS')) {
    return {
      allowed: false,
      reason: `This job is in ${currentStatus.replace(/_/g, ' ')} and has no recorded quality PASS. A missing inspection is not a PASS; record the check result first.`,
      records: []
    };
  }

  return { allowed: true };
}

module.exports = { RELEASE_STATUSES, QUALITY_STAGES, qualityRecordsForJob, checkReleaseGate };
