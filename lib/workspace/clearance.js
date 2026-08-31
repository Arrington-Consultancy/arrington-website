// Arrington AI Workspace: human clearance.
//
// Approved access model (ARRINGTON AI WORKSPACE V0.1 - PERMISSION, HUMAN
// ACCESS & ACTION CONTROL MAP, Governance PASS 29/08/2026): Tom Arrington
// is the only real human user of first staging, as owner/admin. No second
// real user, staff/client role or shared account is approved. The
// synthetic restricted clearance below exists so adversarial tests can
// prove the enforcement machinery without activating another real user;
// no login maps to it and no route can select it from request input.
//
// Effective context for any surface stays the intersection rule from the
// control pack: authenticated human clearance AND lane permission AND
// task necessity. The narrowest wins. This module owns the human leg.

const CLEARANCES = {
  owner_admin: {
    label: 'Owner / Admin',
    sensitivities: ['standard', 'commercial', 'confidential']
  },
  // Synthetic, adversarial testing only. Deliberately narrower than any
  // real need so leak tests have a hard boundary to probe.
  ws_restricted: {
    label: 'Restricted (synthetic test clearance)',
    sensitivities: ['standard']
  }
};

// The only real mapping. Keyed on the CMS username of the authenticated
// session; anything absent from this map has NO workspace clearance at
// all, whatever its CMS role. Adding a name here is a human-access
// expansion reserved to Tom plus the governed route, never a code tidy.
//
// OPEN RISK, NOT ACCEPTED. Governance finding F1 (30/08/2026): the
// sentence above is true of this map and false of the access it
// controls. Clearance is keyed on a username string, and any CMS account
// holding `manage_users` at admin level can rewrite the password behind
// that username through `PUT /api/admin/user/:id/password` and then log
// in as it. The reviewer demonstrated this end to end on a running
// application. So a workspace that confers sight of the whole controlled
// brain and irreversible deletion of real customer records rests on a
// credential a second account can change, leaving one audit_log row.
//
// This is recorded here because the file previously implied the
// opposite. It is NOT recorded as accepted: only Tom can accept it, and
// he has three options, in increasing order of effort:
//   1. accept it in writing, on the basis that the only admin account is
//      an org owner who already has database access;
//   2. refuse a password change against any username in this map, which
//      also removes Tom's own admin-assisted recovery path;
//   3. bind clearance to the user id and require a second Railway
//      variable naming the expected username, so seizing access needs
//      infrastructure access as well as CMS access.
// Until one is chosen and recorded, treat workspace access as no
// stronger than CMS admin access.
const HUMAN_CLEARANCE = { tom: 'owner_admin' };

function clearanceForUser(user) {
  if (!user || !user.username) return null;
  return HUMAN_CLEARANCE[user.username] || null;
}

function clearanceCanSeeSensitivity(clearanceId, sensitivity) {
  const c = CLEARANCES[clearanceId];
  if (!c) return false;
  return c.sensitivities.includes(sensitivity);
}

// The record-level check every surface must route through: pages, API,
// search, snippets, counts, AI prompt context and history alike.
function clearanceCanSeeRecord(clearanceId, record) {
  if (!record) return false;
  return clearanceCanSeeSensitivity(clearanceId, record.sensitivity || 'standard');
}

function filterRecordsForClearance(clearanceId, records) {
  return (records || []).filter((r) => clearanceCanSeeRecord(clearanceId, r));
}

// Governance finding F7 (30/08/2026): a conversation stores the clearance
// it was ANSWERED at, and that value was written and never read. An
// answer is built from whatever the asker could see at the time, so
// history has to be gated on the clearance that produced it, not on the
// reader's clearance alone: if a person's clearance is later narrowed,
// their own old transcripts would otherwise still hand back the wider
// material. This asks the only safe question - does the reader still
// cover everything that answer was allowed to draw on - and an
// unrecognised stored value is not covered by anyone.
function clearanceCovers(readerClearanceId, storedClearanceId) {
  const reader = CLEARANCES[readerClearanceId];
  const stored = CLEARANCES[storedClearanceId];
  if (!reader || !stored) return false;
  return stored.sensitivities.every((s) => reader.sensitivities.includes(s));
}

module.exports = {
  CLEARANCES,
  HUMAN_CLEARANCE,
  clearanceForUser,
  clearanceCanSeeSensitivity,
  clearanceCanSeeRecord,
  filterRecordsForClearance,
  clearanceCovers
};
