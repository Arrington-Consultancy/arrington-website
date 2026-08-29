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

// v0.2-partial: the six ACTIVE v0.1 workers, governance and business facts
// below are unchanged from the v0.1 transcription. What's new in this pass
// is lib/scott/clearance.js (the 07Q/05A human-clearance model) and
// lib/scott/deepBusinessFacts.js (a prioritised subset of the deep 07-series
// company data), plus three PROPOSED, DORMANT v0.2 workers in workers.js
// (finance_accounts/people_hr/quality_control — see PROPOSED_WORKER_IDS).
// "Partial" is the accurate word, not "v0.2": several 07-series domains
// (07C/D/E/G/H/J/K/L/M/O/P/R/T) were read into the session that produced
// this pass but not yet transcribed into deepBusinessFacts.js — see that
// file's own header for the exact list. The three proposed workers stay
// dormant because doc 24 SCOTT V0.2 INDEPENDENT GOVERNANCE & ASSURANCE
// REVIEW REQUEST carried the status "FORMALLY PREPARED FOR INDEPENDENT
// REVIEW - NO VERDICT RECORDED" as of this transcription date.
const SNAPSHOT_VERSION = 'v0.2-partial';
const SNAPSHOT_DATE = '2026-08-29';
const SNAPSHOT_LABEL = `Scott AI Demonstration snapshot ${SNAPSHOT_VERSION}, transcribed from Drive on ${SNAPSHOT_DATE}`;

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
  "20 SCOTT'S PRESSURE TEST SUITE V0.1",
  // v0.2-partial additions (29/08/2026):
  "23 SCOTT V0.2 FULL COMPLETION BRIEF - NEXT WORKER & CLAUDE",
  "24 SCOTT V0.2 INDEPENDENT GOVERNANCE & ASSURANCE REVIEW REQUEST (status: NO VERDICT RECORDED)",
  "05A SCOTT'S WORKER PERMISSION MAP V0.2 - PROPOSED EXPANSION",
  "18 SCOTT'S FINANCE & ACCOUNTS - PROPOSED WORKER SPECIFICATION",
  "19 SCOTT'S PEOPLE & HR - PROPOSED WORKER SPECIFICATION",
  "22 SCOTT'S QUALITY CONTROL - PROPOSED WORKER SPECIFICATION",
  "07A SCOTT'S FINANCE & ACCOUNTS",
  "07B SCOTT'S PEOPLE & HR",
  "07F SCOTT'S OPERATIONS, WORKFLOW, SUPPLIERS & STOCK",
  "07I SCOTT'S STOCK & SUPPLY LIVE FEED",
  "07N SCOTT'S QUALITY CONTROL, REWORK & DEFECTS",
  "07Q SCOTT'S IT, SYSTEMS, ACCESS & BACKUP (role-based clearance expansion)",
  "07S SCOTT'S CORPORATE, DIRECTOR & BUSINESS HISTORY",
  "07U SCOTT'S PURCHASE ORDERS, GOODS RECEIPT & SUPPLIER INVOICE LEDGER",
  "07V SCOTT'S JOB EXECUTION, WIP & COST LEDGER"
];

module.exports = {
  SNAPSHOT_VERSION,
  SNAPSHOT_DATE,
  SNAPSHOT_LABEL,
  SOURCE_DOCUMENTS
};
