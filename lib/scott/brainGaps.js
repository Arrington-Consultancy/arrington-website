// Scott AI Demonstration: the Brain Gap loop.
//
// An AI worker that cannot answer reliably has three genuinely different
// situations in front of it, and the demonstration was only modelling one
// of them:
//
//   1. It has the evidence and the answer, but the DECISION needs someone
//      else's authority. That is an approval escalation. It already has a
//      workflow (scott_writebacks, the approvals queue, approve / modify
//      and agree / redraft). Nothing here touches it.
//
//   2. The EVIDENCE itself is missing, out of date, or says two different
//      things in two places. No amount of approval fixes that. Somebody
//      has to go and correct a controlled record. That is a Brain Gap,
//      and it is what this module is for.
//
//   3. Neither: the answer is derivable from what it already has, or the
//      question is trivial. Then it should just answer.
//
// Collapsing 2 into 1 is how an "escalation" queue fills up with things
// nobody can approve because the underlying number is wrong. Collapsing 2
// into 3 is worse: it is how a model fills a gap by inference to clear
// the queue, which is the single behaviour this whole mechanism exists to
// prevent.
//
// This module is pure. It decides what a gap IS, who owns it, and whether
// it earns an email. It sends nothing and touches no database: the send
// lives in gapNotifier.js and the record lives in the repository, so the
// decision can be tested without a mailbox or a Postgres.

const clearance = require('./clearance');
const { RECORD_OWNERSHIP } = require('./deepBusinessFacts');

const GAP_TYPES = ['missing', 'stale', 'conflicting'];
const GAP_STATUSES = ['open', 'notified', 'awaiting_source', 'resolved', 'dismissed'];
const EMAIL_STATUSES = ['not_required', 'pending', 'sent', 'failed'];

// Why a gap did or did not earn an email. Recorded on the row so the
// decision is auditable after the fact rather than re-derived from
// whatever the code happens to do today.
const NOTIFY_DECISIONS = {
  ROUTED: 'routed',
  NOT_MATERIAL: 'not_material',
  APPROVAL_HAS_ITS_OWN_WORKFLOW: 'approval_workflow',
  DETERMINISTIC: 'resolvable_without_human',
  NO_OWNER: 'no_responsible_owner',
  OWNER_IS_THE_ASKER: 'owner_is_the_asker'
};

// ------------------------------------------------------------
// Ownership
// ------------------------------------------------------------

const OWNERSHIP_BY_DOMAIN = RECORD_OWNERSHIP.reduce((acc, r) => {
  acc[r.domain] = r;
  return acc;
}, {});

// The responsible human for a domain, as a persona id. Never a worker id:
// an AI worker is not a person and cannot be asked to go and correct a
// controlled record. Returns null when the register genuinely does not
// name an owner, which is a real answer ("nobody owns this yet") and is
// recorded as such rather than guessed at.
function responsibleFor(domain) {
  const row = OWNERSHIP_BY_DOMAIN[domain];
  if (!row) return null;
  const personaId = row.owner;
  if (!clearance.PERSONAS[personaId]) return null;
  // Defence in depth against a future edit to the register: routing a gap
  // to someone who cannot read the domain it concerns produces an email
  // they can do nothing with, and the body quotes the evidence.
  if (!clearance.personaCanSeeDomain(personaId, domain)) return null;
  return {
    personaId,
    name: clearance.PERSONAS[personaId].name,
    role: clearance.PERSONAS[personaId].role,
    source: row.source,
    decisionOwnerId: row.decisionOwner && clearance.PERSONAS[row.decisionOwner] ? row.decisionOwner : null,
    decisionOwnerName: row.decisionOwner && clearance.PERSONAS[row.decisionOwner]
      ? clearance.PERSONAS[row.decisionOwner].name
      : null
  };
}

// ------------------------------------------------------------
// Normalising what a worker raised
// ------------------------------------------------------------

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 2000);

// A gap is MATERIAL when the missing evidence actually changes what the
// business would do or say. Two signals decide it, and both come from
// the worker's own structured answer rather than from prose:
//
//   - work cannot continue without it, or
//   - it is attached to a live job or enquiry, meaning a real customer
//     commitment is downstream of it.
//
// Everything else is recorded but not routed. A gap that changes nothing
// is still worth keeping (it is how you notice a record rotting) but it
// is not worth interrupting a person over, and the brief is explicit that
// email is not for trivial gaps.
function isMaterial(gap) {
  if (!gap) return false;
  if (gap.workCanContinue === false) return true;
  return !!(gap.relatedJobId || gap.relatedEnquiryId);
}

// A worker raising something that is really an approval request has
// mislabelled it. Approvals have their own queue, and emailing about them
// would put the same item in two places with two different resolution
// paths. Detected structurally (an escalation was raised on the same
// reply) and, as a backstop, on the language of the request itself.
const APPROVAL_LANGUAGE = /\b(approve|approval|authorise|authorize|sign[- ]off|permission to|give the go[- ]ahead)\b/i;

function looksLikeApprovalRequest(gap, escalation) {
  if (escalation) return true;
  return APPROVAL_LANGUAGE.test(`${gap.missingEvidence} ${gap.whyItMatters}`);
}

function normaliseGap(raw, extra = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const missingEvidence = str(raw.missing || raw.missingEvidence, 1500);
  const whyItMatters = str(raw.whyItMatters, 1500);
  const expectedSource = str(raw.expectedSource || raw.source, 300);
  if (!missingEvidence || !whyItMatters) return null;
  const gapType = GAP_TYPES.includes(raw.type) ? raw.type : 'missing';
  return {
    gapType,
    missingEvidence,
    whyItMatters,
    expectedSource,
    // A worker asserting "work can continue" is taken at face value only
    // in the safe direction: absent or malformed means it blocks, because
    // the failure that matters is a blocking gap being filed as harmless.
    workCanContinue: raw.workCanContinue === true,
    domain: str(raw.domain, 60) || extra.domain || null,
    relatedJobId: extra.relatedJobId || null,
    relatedEnquiryId: extra.relatedEnquiryId || null,
    raisedByWorkerId: extra.raisedByWorkerId || null
  };
}

// ------------------------------------------------------------
// The routing decision
// ------------------------------------------------------------

// Returns the complete decision for one raised gap: what it is, who owns
// it, whether it is routed to a person by email, and why. The caller
// records this verbatim; it does not get to re-decide.
function planGap(raw, { escalation = null, askerPersonaId = null, ...extra } = {}) {
  const gap = normaliseGap(raw, extra);
  if (!gap) return null;

  const material = isMaterial(gap);
  const owner = gap.domain ? responsibleFor(gap.domain) : null;

  let notifyDecision;
  if (looksLikeApprovalRequest(gap, escalation)) {
    notifyDecision = NOTIFY_DECISIONS.APPROVAL_HAS_ITS_OWN_WORKFLOW;
  } else if (!material) {
    notifyDecision = NOTIFY_DECISIONS.NOT_MATERIAL;
  } else if (!owner) {
    notifyDecision = NOTIFY_DECISIONS.NO_OWNER;
  } else if (owner.personaId === askerPersonaId) {
    // The person already looking at it is the person who owns it. An
    // email telling them what they are currently reading on screen is
    // noise, and the gap is still recorded and still open.
    notifyDecision = NOTIFY_DECISIONS.OWNER_IS_THE_ASKER;
  } else {
    notifyDecision = NOTIFY_DECISIONS.ROUTED;
  }

  const shouldEmail = notifyDecision === NOTIFY_DECISIONS.ROUTED;

  return {
    ...gap,
    material,
    responsiblePersonaId: owner ? owner.personaId : null,
    responsibleName: owner ? owner.name : '',
    decisionOwnerName: owner ? owner.decisionOwnerName : null,
    // The register's own name for the controlled source wins over the
    // worker's description of it, because the register is controlled data
    // and the worker's phrasing is not.
    expectedSource: (owner && owner.source) || gap.expectedSource || '',
    notifyDecision,
    shouldEmail,
    status: 'open',
    emailStatus: shouldEmail ? 'pending' : 'not_required'
  };
}

// ------------------------------------------------------------
// The email itself
// ------------------------------------------------------------

// Says three things and stops: what is missing or contradictory, why that
// matters, and which controlled source to correct or confirm. It never
// asks for a decision (that is the approvals queue) and never proposes
// what the answer probably is, because a suggested value is exactly how a
// gap gets closed by inference with a human's name on it.
function buildGapEmail(plan, { recipientLabel, portalUrl } = {}) {
  const subjectArea = plan.expectedSource || plan.domain || 'a controlled record';
  const typeWord = plan.gapType === 'conflicting'
    ? 'Conflicting information'
    : plan.gapType === 'stale'
      ? 'Out of date information'
      : 'Missing information';

  const lines = [
    `${plan.responsibleName},`,
    '',
    `${typeWord} in ${subjectArea} is holding up an answer, and you are down as the person who owns that record.`,
    '',
    'WHAT IS MISSING OR CONFLICTING',
    plan.missingEvidence,
    '',
    'WHY IT MATTERS',
    plan.whyItMatters,
    '',
    'WHAT WOULD CLOSE THIS',
    `Correct or confirm ${subjectArea}. Once the source itself is right, the gap can be marked resolved and the Company Brain will use the corrected information.`,
    plan.decisionOwnerName && plan.decisionOwnerName !== plan.responsibleName
      ? `If a decision follows from it, that one sits with ${plan.decisionOwnerName}.`
      : null,
    plan.workCanContinue
      ? 'Work is continuing in the meantime, so this is not urgent, but the answer stays unproven until the record is right.'
      : 'Work on this is stopped until the record is right.',
    '',
    portalUrl ? `Open gaps: ${portalUrl}` : null,
    '',
    'Nothing has been assumed or filled in on your behalf.',
    '',
    recipientLabel || null
  ].filter((l) => l !== null);

  return {
    subject: `${typeWord}: ${subjectArea}`,
    text: lines.join('\n')
  };
}

// What the interface is allowed to say about the notification. The rule
// from the brief is that "[name] has been emailed" may only appear after
// a send genuinely succeeded, so the sentence is built from the recorded
// delivery result and never from the intention to send.
function describeNotification(record) {
  if (!record) return '';
  const name = record.responsible_name || record.responsibleName || 'the record owner';
  const status = record.email_status || record.emailStatus;
  const decision = record.notify_decision || record.notifyDecision;
  if (status === 'sent') return `${name} has been emailed.`;
  if (status === 'failed') {
    const err = record.email_error || record.emailError || 'no reason recorded';
    const attempts = record.email_attempts != null ? record.email_attempts
      : (record.attempts != null ? record.attempts : null);
    // Say only what the recorded attempts support. "Failed after a retry"
    // when nothing was ever attempted is a claim of effort that did not
    // happen, which is the same class of dishonesty this whole sentence
    // exists to prevent, one notch down. Found by the acceptance check's
    // own dry run against an unconfigured mailbox.
    const how = attempts === 0 ? 'Nothing was sent'
      : attempts === 1 ? 'The send failed'
        : 'The send failed after a retry';
    return `${name} has NOT been emailed. ${how}: ${err}. The gap is recorded and still open.`;
  }
  if (status === 'pending') return `${name} has not been emailed yet. The gap is recorded and still open.`;
  if (decision === NOTIFY_DECISIONS.APPROVAL_HAS_ITS_OWN_WORKFLOW) {
    return 'Nobody was emailed: this is an approval, and approvals go through the approvals queue.';
  }
  if (decision === NOTIFY_DECISIONS.NOT_MATERIAL) {
    return 'Nobody was emailed: this does not currently block any work or customer commitment. It is recorded.';
  }
  if (decision === NOTIFY_DECISIONS.NO_OWNER) {
    return 'Nobody was emailed: no owner is recorded for that source. The gap is recorded and needs an owner assigning.';
  }
  if (decision === NOTIFY_DECISIONS.OWNER_IS_THE_ASKER) {
    return 'Nobody was emailed: you own that record yourself. The gap is recorded.';
  }
  return 'The gap is recorded.';
}

module.exports = {
  GAP_TYPES,
  GAP_STATUSES,
  EMAIL_STATUSES,
  NOTIFY_DECISIONS,
  OWNERSHIP_BY_DOMAIN,
  responsibleFor,
  isMaterial,
  looksLikeApprovalRequest,
  normaliseGap,
  planGap,
  buildGapEmail,
  describeNotification
};
