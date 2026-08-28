// Scott AI Demonstration — snapshot/version identity.
//
// Everything under lib/scott/ is a static, dated copy of controlled records
// that live in the "SCOTT'S ARMCHAIR & KNITTING SERVICE - AI DEMONSTRATION
// BRAIN" Google Drive folder (owner: tom@arringtonconsultancy.com). That
// Drive folder is the real source of truth; this directory is a versioned
// snapshot transcribed from it on the date below, not a live sync.
//
// Per Tom's explicit instruction, this snapshot must never be silently
// treated as current. If the six worker personalities, business facts or
// governance rules are revised in Drive after this date, this snapshot is
// stale until someone deliberately re-transcribes it and bumps the version
// below — the same discipline the site already applies to
// lib/waiSeedMode.js's WAI_SEED_REVISION for the Websites and AI page.

const SNAPSHOT_VERSION = 'v0.1';
const SNAPSHOT_DATE = '2026-08-28';
const SNAPSHOT_LABEL = `Scott AI Demonstration snapshot ${SNAPSHOT_VERSION} — transcribed from Drive on ${SNAPSHOT_DATE}`;

// Source documents this snapshot was transcribed from (Drive file titles,
// for traceability — not fetched at runtime).
const SOURCE_DOCUMENTS = [
  "AI GOVERNANCE CONSTITUTION - UNIVERSAL MASTER",
  "00 SCOTT'S MASTER AI RULEBOOK",
  "01 SCOTT'S BRAND & OPERATING SYSTEM",
  "02 SCOTT'S CURRENT OPERATING POSITION",
  "04 SCOTT'S SOURCE OF TRUTH & RISK ANNEX",
  "05 SCOTT'S WORKER PERMISSION MAP",
  "10 SCOTT'S WORKER MAP V0.1",
  "11 SCOTT'S GOVERNANCE & ASSURANCE - WORKER SPECIFICATION",
  "12 SCOTT'S COMMERCIAL - WORKER SPECIFICATION",
  "13 SCOTT'S OPERATIONS - WORKER SPECIFICATION",
  "14 SCOTT'S CUSTOMERS & MARKETING - WORKER SPECIFICATION",
  "15 SCOTT'S COMPANY BRAIN & RECORDS - WORKER SPECIFICATION",
  "16 SCOTT'S ACTIVATION & HANDOFF PLAN V0.1",
  "17 SCOTT'S RECEPTIONIST - WORKER SPECIFICATION",
  "20 SCOTT'S PRESSURE TEST SUITE V0.1"
];

module.exports = {
  SNAPSHOT_VERSION,
  SNAPSHOT_DATE,
  SNAPSHOT_LABEL,
  SOURCE_DOCUMENTS
};
