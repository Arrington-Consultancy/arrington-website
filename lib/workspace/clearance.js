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

// The only real mapping, by username. This is the FIRST of three legs,
// not the whole answer: see clearanceForUser below.
const HUMAN_CLEARANCE = { tom: 'owner_admin' };

// --- Governance finding F1: the owner binding -------------------------
//
// Tom's decision of 31/08/2026 was option 3: bind clearance to the
// actual user id AND require a separate Railway variable naming the
// expected cleared username, so that seizing the workspace needs
// infrastructure access and not merely CMS admin access, while the
// legitimate account-recovery route stays open.
//
// The attack this answers, demonstrated end to end by the reviewer: an
// admin CMS account calls PUT /api/admin/user/:id/password against Tom's
// row and logs in as him. Two things follow from that, and they need
// different answers, which is why this is two variables and not one:
//
//   * The attacker now IS the username `tom`, with Tom's user id. A
//     username check does not stop them, and neither does an id check.
//     What stops them is WORKSPACE_ACCESS_PASSPHRASE in lib/workspace/
//     unlock.js: a second factor that lives in Railway, which CMS admin
//     does not reach. That is the leg that actually closes F1.
//   * A different attack is to delete the `tom` row and create a new
//     account also called `tom`. The new row has a new id, so the
//     username would still match while the person behind it had changed.
//     WORKSPACE_OWNER_USER_ID closes that one, and it is why binding to
//     the id is worth doing even though it does not close the first.
//
// WORKSPACE_OWNER_USERNAME is not a secret and is not treated as one. It
// is a deployment-time statement of who the cleared human is, so that
// editing HUMAN_CLEARANCE in code cannot by itself grant anybody access:
// a code change and an infrastructure change are now both required.
//
// All of it fails CLOSED. An unset variable, a mismatch, or a session
// user with no id yields no clearance at all.
function ownerBinding() {
  return {
    username: String(process.env.WORKSPACE_OWNER_USERNAME || '').trim(),
    userId: String(process.env.WORKSPACE_OWNER_USER_ID || '').trim()
  };
}

// Reports the binding's state for the boot line and the workspace's own
// diagnostics. Deliberately never returns or logs the passphrase, and
// the id is not a secret so it is safe to print: an operator needs to
// see which id is expected in order to set it correctly.
function describeOwnerBinding() {
  const b = ownerBinding();
  const problems = [];
  if (!b.username) problems.push('WORKSPACE_OWNER_USERNAME is unset');
  else if (!HUMAN_CLEARANCE[b.username]) problems.push(`WORKSPACE_OWNER_USERNAME='${b.username}' holds no clearance in code`);
  if (!b.userId) problems.push('WORKSPACE_OWNER_USER_ID is unset');
  else if (!/^\d+$/.test(b.userId)) problems.push('WORKSPACE_OWNER_USER_ID is not a positive integer');
  return { ...b, ok: problems.length === 0, problems };
}

// The human leg. Three conditions, all required, all failing closed.
// This answers WHO, not WHETHER THEY HAVE UNLOCKED: the passphrase leg
// is a session fact and lives in lib/workspace/unlock.js, so that this
// function stays pure and testable.
function clearanceForUser(user) {
  if (!user || !user.username) return null;
  const clearance = HUMAN_CLEARANCE[user.username];
  if (!clearance) return null;

  const bind = ownerBinding();
  // No binding configured means no workspace, even for a username the
  // code clears. An environment that forgot to set these is not one that
  // should quietly fall back to the old username-only rule.
  if (!bind.username || !bind.userId) return null;
  if (bind.username !== user.username) return null;
  // The session's user id must be the exact row the deployment names.
  // Compared as strings on purpose: the variable is text and the column
  // is an integer, and a loose == between them is how a '0' or an empty
  // string starts matching things it should not.
  if (user.id === undefined || user.id === null) return null;
  if (String(user.id) !== bind.userId) return null;

  return clearance;
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
  ownerBinding,
  describeOwnerBinding,
  clearanceForUser,
  clearanceCanSeeSensitivity,
  clearanceCanSeeRecord,
  filterRecordsForClearance,
  clearanceCovers
};
