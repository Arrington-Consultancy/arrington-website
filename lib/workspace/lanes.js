// Arrington AI Workspace: routing lanes.
//
// A lane is NOT a worker and NOT a persona. The canonical Arrington
// worker register (START HERE. ARRINGTON CONSULTANCY BRAIN INDEX,
// "CANONICAL ARRINGTON WORKER NAMES - 29 AUGUST 2026") is the authority
// on worker identity; this module only mirrors that register so the
// workspace can route a question to the right specialist context and
// filter what that context is allowed to read. Per the completion
// mandate: "Do not invent another orchestrator, control-room worker or
// super-worker." The router that consumes these lanes is faceless
// plumbing: it never speaks as a person, and no lane is ever presented
// as a tenth worker.
//
// AMENDED 31/08/2026, on Tom's instruction "Make Ruth in Arrington as
// well." This sentence used to end "and never appears in output as a
// tenth identity", and finding T1 is that a named receptionist now does
// appear in output, so half of the statement was no longer true while
// the assurance case only ever argued the other half.
//
// What is still true, and is what the mandate protects: the ROUTER has
// no face, no name and no voice, and no lane speaks. What changed is
// that a receptionist presents the router's output
// (lib/workspace/receptionist.js). She holds no source class, no
// sensitivity ceiling and no clearance, reads no record, and cannot
// change what any lane returns - so she is a presentation layer, not a
// tenth worker. The access statement above is unchanged and still
// exact; only the output statement needed amending, and it is amended
// here rather than argued past.
//
// Effective context for any lane-routed request stays the intersection:
// authenticated human clearance AND lane permission AND task necessity.
// The narrowest wins. This module owns the lane leg: which source
// classes a lane may read at all, and the sensitivity ceiling it may
// read them at. Both are read-only facts about the published remits in
// each worker's approved specification/handoff; changing either is a
// worker-permission change and belongs to Tom plus the governed route,
// never to a code tidy.

const SENSITIVITY_ORDER = ['standard', 'commercial', 'confidential'];

// Source classes are the workspace's coarse read-permission unit. Every
// workspace_records row carries exactly one.
const SOURCE_CLASSES = {
  authority: 'Core authority stack: Constitution, Rulebook, Creation Standard, Brand Operating System, Brain Index',
  strategy: 'Live strategy: Current Operating Position and commercial position',
  worker_register: 'The canonical worker register and current handoff state',
  opportunity: 'Approved opportunities and live commercial conversations',
  technical_state: 'Verified website, GitHub and Railway state',
  project: 'Bounded project records: WSA, Pembroke, Scott demonstration pointers',
  control_pack: 'Workspace v0.1 controlled design and acceptance documents'
};

// The nine canonical workers, register order. kind distinguishes the
// continuing operational specialists from the two project workers the
// register itself marks for retirement review once their build and
// handover duties complete ("WORKER PERMANENCE AND FULL COMPLETION
// CONTROL - 30 AUGUST 2026").
const LANES = [
  {
    id: 'google_ads',
    name: 'ARRINGTON GOOGLE ADS',
    kind: 'operational',
    remit: 'Google Ads campaign structure, settings, landing-page standards, conversion setup and account change control, under the Paid Advertising and Google Ads operating manuals.',
    sourceClasses: ['authority', 'strategy', 'worker_register', 'technical_state'],
    sensitivityCeiling: 'commercial'
  },
  {
    id: 'website_hosting',
    name: 'ARRINGTON WEBSITE & HOSTING',
    kind: 'operational',
    remit: 'Website, hosting and deployment state; owns technical implementation through the approved technical builder.',
    sourceClasses: ['authority', 'strategy', 'worker_register', 'technical_state', 'control_pack'],
    sensitivityCeiling: 'commercial'
  },
  {
    id: 'opportunity_builder',
    name: 'ARRINGTON OPPORTUNITY BUILDER',
    kind: 'operational',
    remit: 'Approved opportunities and live commercial conversations; takes ownership once a target is approved or a reply becomes live.',
    sourceClasses: ['authority', 'strategy', 'worker_register', 'opportunity'],
    sensitivityCeiling: 'confidential'
  },
  {
    id: 'brain_keeper',
    name: 'ARRINGTON BRAIN KEEPER',
    kind: 'operational',
    remit: 'Drive structure and Brain maintenance: statuses, supersession, index accuracy.',
    sourceClasses: ['authority', 'strategy', 'worker_register', 'control_pack'],
    sensitivityCeiling: 'commercial'
  },
  {
    id: 'governance_assurance',
    name: 'ARRINGTON GOVERNANCE & ASSURANCE',
    kind: 'operational',
    remit: 'Independent governance gatekeeping, watchtower scans, full governance reviews, STOP decisions and simplification audits. Independent assurance needs sight of everything it audits, which is why this is the one lane that reads every source class.',
    sourceClasses: Object.keys(SOURCE_CLASSES),
    sensitivityCeiling: 'confidential'
  },
  {
    id: 'social_content_builder',
    name: 'ARRINGTON SOCIAL CONTENT BUILDER',
    kind: 'operational',
    remit: 'LinkedIn-first organic social content under the Social Content Operating Manual and Story Bank.',
    sourceClasses: ['authority', 'strategy', 'worker_register'],
    sensitivityCeiling: 'commercial'
  },
  {
    id: 'ai_recommendation_visibility',
    name: 'ARRINGTON AI RECOMMENDATION VISIBILITY',
    kind: 'operational',
    remit: 'Whether suitable owner-run businesses can find, cite, shortlist and receive recommendations for Arrington through AI systems: benchmark, diagnosis, evidence, routing requirements and retesting. Does not own website/code implementation, general SEO, social, paid media or sales outreach.',
    sourceClasses: ['authority', 'strategy', 'worker_register', 'technical_state'],
    sensitivityCeiling: 'commercial'
  },
  {
    id: 'ai_demonstration_builder',
    name: 'ARRINGTON AI DEMONSTRATION BUILDER',
    kind: 'project',
    remit: 'The bounded Scott demonstration project: fictional brain architecture and pressure testing. Does not own production website development, deployment or changes to Arrington real AI governance.',
    sourceClasses: ['authority', 'strategy', 'worker_register', 'project'],
    sensitivityCeiling: 'commercial'
  },
  {
    id: 'ai_workspace_builder',
    name: 'ARRINGTON AI WORKSPACE BUILDER',
    kind: 'project',
    remit: 'The controlled design of this workspace: source/freshness architecture, access, Company Brain behaviour, Brain Gaps, approvals and acceptance.',
    sourceClasses: ['authority', 'strategy', 'worker_register', 'control_pack', 'technical_state'],
    sensitivityCeiling: 'commercial'
  }
];

// Null-prototype, deliberately. Governance finding T2 (31/08/2026):
// a plain object literal inherits Object.prototype, so laneById('constructor')
// returned the Object function - which the receptionist then named as a
// colleague ("I took that to Object"), and which the ask endpoint
// accepted as a VALID forced lane id before 500ing. Fixed here rather
// than at each call site, because every caller inherited it.
const LANES_BY_ID = Object.assign(Object.create(null), Object.fromEntries(LANES.map((l) => [l.id, l])));

function laneById(id) {
  return LANES_BY_ID[id] || null;
}

function laneCanReadSourceClass(laneId, sourceClass) {
  const lane = LANES_BY_ID[laneId];
  if (!lane) return false;
  return lane.sourceClasses.includes(sourceClass);
}

function laneCanReadSensitivity(laneId, sensitivity) {
  const lane = LANES_BY_ID[laneId];
  if (!lane) return false;
  const ceiling = SENSITIVITY_ORDER.indexOf(lane.sensitivityCeiling);
  const level = SENSITIVITY_ORDER.indexOf(sensitivity);
  if (level === -1) return false; // an unknown sensitivity fails closed
  return level <= ceiling;
}

// The lane leg of the intersection rule, record-level. The human leg
// (lib/workspace/clearance.js) is applied separately by every caller;
// neither leg may substitute for the other.
function laneCanReadRecord(laneId, record) {
  if (!record) return false;
  return laneCanReadSourceClass(laneId, record.source_class)
    && laneCanReadSensitivity(laneId, record.sensitivity || 'standard');
}

function filterRecordsForLane(laneId, records) {
  return (records || []).filter((r) => laneCanReadRecord(laneId, r));
}

module.exports = {
  SENSITIVITY_ORDER,
  SOURCE_CLASSES,
  LANES,
  laneById,
  laneCanReadSourceClass,
  laneCanReadSensitivity,
  laneCanReadRecord,
  filterRecordsForLane
};
