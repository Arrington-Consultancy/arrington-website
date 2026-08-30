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

module.exports = {
  CLEARANCES,
  HUMAN_CLEARANCE,
  clearanceForUser,
  clearanceCanSeeSensitivity,
  clearanceCanSeeRecord,
  filterRecordsForClearance
};
