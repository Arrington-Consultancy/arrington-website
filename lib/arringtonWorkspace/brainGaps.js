const GAP_TYPES = ['missing', 'stale', 'conflicting', 'insufficient_provenance', 'source_failure'];
const GAP_STATUSES = ['open', 'waiting_for_source', 'resolved', 'dismissed'];

function normaliseGap(input = {}) {
  const gapType = GAP_TYPES.includes(input.gapType) ? input.gapType : 'missing';
  const subject = String(input.subject || '').trim().slice(0, 500);
  const reason = String(input.reason || '').trim().slice(0, 1500);
  const impact = String(input.impact || '').trim().slice(0, 1500);
  if (!subject || !reason) return null;
  return {
    gapKey: String(input.gapKey || subject.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-|-$/g, '').slice(0, 160),
    gapType,
    subject,
    sourceKey: input.sourceKey || null,
    sensitivity: ['public', 'internal', 'restricted', 'secret'].includes(input.sensitivity) ? input.sensitivity : 'internal',
    reason,
    impact,
    responsibleHuman: String(input.responsibleHuman || 'Tom Arrington').trim().slice(0, 120),
    status: GAP_STATUSES.includes(input.status) ? input.status : 'open'
  };
}

function canResolveGap({ sourceCorrected, resolutionEvidence }) {
  return sourceCorrected === true && String(resolutionEvidence || '').trim().length >= 12;
}

module.exports = {
  GAP_TYPES,
  GAP_STATUSES,
  normaliseGap,
  canResolveGap
};
