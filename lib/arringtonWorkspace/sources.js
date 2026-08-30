const ARRINGTON_WORKSPACE_PAGE_SLUG = 'arrington-ai-workspace';

const nowIso = '2026-08-30T19:15:00.000Z';

const ARRINGTON_WORKSPACE_SEED_SOURCES = [
  {
    key: 'brain-index',
    title: 'START HERE. ARRINGTON CONSULTANCY BRAIN INDEX',
    sourceSystem: 'Google Drive',
    sourceId: '1UAboD9R_vACb4_ls-6xC9mZp4sw7JYf8wA2Wr1VSvhM',
    sourceUrl: 'https://docs.google.com/document/d/1UAboD9R_vACb4_ls-6xC9mZp4sw7JYf8wA2Wr1VSvhM/edit',
    authorityClass: 'governing-authority',
    status: 'current',
    sensitivity: 'internal',
    summary: 'Live index for Arrington company knowledge. It sets the reading order, source priority and current authority hierarchy.',
    sourceModifiedAt: null,
    lastSyncStatus: 'verified_manual',
    staleAfterDays: 2,
    metadata: { inspectedAt: nowIso, route: 'first-source-set' }
  },
  {
    key: 'current-operating-position',
    title: '01 ARRINGTON CURRENT OPERATING POSITION',
    sourceSystem: 'Google Drive',
    sourceId: '',
    sourceUrl: '',
    authorityClass: 'current-business-position',
    status: 'current',
    sensitivity: 'internal',
    summary: 'States that the main constraint is trusted conversations and live commercial opportunities, not more public-site polishing.',
    sourceModifiedAt: null,
    lastSyncStatus: 'verified_manual',
    staleAfterDays: 2,
    metadata: { inspectedAt: nowIso, priority: 'commercial-attention' }
  },
  {
    key: 'tech-implementation-brief',
    title: 'ARRINGTON AI WORKSPACE V0.1 - TECHNICAL IMPLEMENTATION BRIEF',
    sourceSystem: 'Google Drive',
    sourceId: '1odx3bzDBT85A7U7uPg0d0q1fOEnrX6IBFcV6M3Bxg4g',
    sourceUrl: 'https://docs.google.com/document/d/1odx3bzDBT85A7U7uPg0d0q1fOEnrX6IBFcV6M3Bxg4g/edit',
    authorityClass: 'implementation-brief',
    status: 'current',
    sensitivity: 'internal',
    summary: 'Approved staging brief for the private Arrington AI Workspace v0.1, including scope, stop conditions and validation gates.',
    sourceModifiedAt: null,
    lastSyncStatus: 'verified_manual',
    staleAfterDays: 2,
    metadata: { inspectedAt: nowIso, governanceVerdict: 'PASS recorded 2026-08-29' }
  },
  {
    key: 'workspace-builder-handoff',
    title: 'ARRINGTON AI WORKSPACE BUILDER - WORKER HANDOFF',
    sourceSystem: 'Google Drive',
    sourceId: '',
    sourceUrl: '',
    authorityClass: 'worker-handoff',
    status: 'current',
    sensitivity: 'internal',
    summary: 'Records the workspace build status, first staging source boundaries, Tom-only first real access and handoff state.',
    sourceModifiedAt: null,
    lastSyncStatus: 'verified_manual',
    staleAfterDays: 2,
    metadata: { inspectedAt: nowIso, firstHumanAccess: 'Tom Arrington only' }
  },
  {
    key: 'website-hosting-handoff',
    title: 'Arrington Website & Hosting - Worker Handoff Log',
    sourceSystem: 'Google Drive',
    sourceId: '',
    sourceUrl: '',
    authorityClass: 'technical-handoff',
    status: 'current',
    sensitivity: 'internal',
    summary: 'Records that Arrington website implementation is Express, Postgres and Railway, and that broad redesign is not the current priority.',
    sourceModifiedAt: null,
    lastSyncStatus: 'verified_manual',
    staleAfterDays: 2,
    metadata: { inspectedAt: nowIso, implementationOwner: 'Arrington Website & Hosting' }
  },
  {
    key: 'github-main-state',
    title: 'GitHub current main state',
    sourceSystem: 'GitHub',
    sourceId: 'a2e79cd02ccc49d77a3e56c99c20496ebde60a4e',
    sourceUrl: 'https://github.com/Arrington-Consultancy/arrington-website/commit/a2e79cd02ccc49d77a3e56c99c20496ebde60a4e',
    authorityClass: 'runtime-evidence',
    status: 'current',
    sensitivity: 'internal',
    summary: 'Current main inspected before workspace implementation. Latest known message: Scott v0.2 independent closure decision: PASS (#138).',
    sourceModifiedAt: '2026-08-30T18:45:30.000Z',
    lastSyncStatus: 'verified_manual',
    staleAfterDays: 1,
    metadata: { inspectedAt: nowIso, branch: 'main' }
  },
  {
    key: 'railway-arrington-workspace-placeholder',
    title: 'Railway Arrington AI Workspace staging placeholder',
    sourceSystem: 'Railway',
    sourceId: 'ecaadb7b-2f73-4127-8c28-f57d5bc0e7ca',
    sourceUrl: 'https://railway.com/project/55465ed5-4c24-41cd-a2cb-ee837f586477',
    authorityClass: 'runtime-evidence',
    status: 'current',
    sensitivity: 'internal',
    summary: 'The staging service exists but currently runs a placeholder command and is not yet connected to the workspace source branch.',
    sourceModifiedAt: null,
    lastSyncStatus: 'verified_manual',
    staleAfterDays: 1,
    metadata: {
      inspectedAt: nowIso,
      environment: 'staging',
      service: 'arrington-ai-workspace',
      serviceId: 'ecaadb7b-2f73-4127-8c28-f57d5bc0e7ca'
    }
  }
];

const ARRINGTON_WORKSPACE_SEED_GAPS = [
  {
    key: 'workspace-staging-source-not-connected',
    type: 'missing',
    subject: 'Arrington AI Workspace staging service is still a placeholder',
    sourceKey: 'railway-arrington-workspace-placeholder',
    sensitivity: 'internal',
    reason: 'Railway has a dedicated staging service, but it is not yet connected to this implementation branch.',
    impact: 'The workspace cannot be reviewed in a real staging URL until the service is connected and redeployed.',
    responsibleHuman: 'Tom Arrington'
  },
  {
    key: 'workspace-live-drive-sync-not-implemented',
    type: 'missing',
    subject: 'Live Drive synchronisation is not implemented in v0.1 code yet',
    sourceKey: 'tech-implementation-brief',
    sensitivity: 'internal',
    reason: 'This implementation unit seeds verified source records from inspected evidence but does not yet run a provider-backed Drive sync inside the app.',
    impact: 'The workspace must show freshness limits honestly and cannot call seeded records live-synchronised.',
    responsibleHuman: 'Tom Arrington'
  }
];

module.exports = {
  ARRINGTON_WORKSPACE_PAGE_SLUG,
  ARRINGTON_WORKSPACE_SEED_SOURCES,
  ARRINGTON_WORKSPACE_SEED_GAPS
};
