// Ruth. The first thing you meet in the workspace.
//
// Tom's instruction, 31/08/2026: "Make Ruth in Arrington as well."
//
// WHAT SHE IS, AND WHY THAT IS NOT A TENTH IDENTITY
//
// The completion mandate says "Do not invent another orchestrator,
// control-room worker or super-worker", and test/workspace/lanes.test.js
// pins the register at exactly nine lanes. Ruth does not touch either,
// because a lane is a scoped READING CONTEXT - a set of source classes
// and a sensitivity ceiling - and Ruth has neither.
//
// She holds no source classes, no sensitivity ceiling and no clearance.
// She cannot read a record, widen a lane's answer, or see anything a
// lane declined to show. The permission model is unchanged and still
// has exactly three legs: the human's clearance AND the lane's
// permission AND task necessity. Ruth adds no fourth leg and no bypass.
// What she adds is a person at the front of a system that otherwise
// answers like a form.
//
// The mandate's concern was a super-worker with god access. A receptionist
// who can read nothing is the opposite of that, and this file is written
// so an assurance reader can confirm it in one screen.
//
// SHE IS ARRINGTON'S, NOT SCOTT'S
//
// Scott's demonstration has a receptionist too, and the same standing
// rule applies in both directions: "Reuse principles, not fictional
// content." Nothing here is imported from lib/scott/**. The principle -
// one named person who takes the question and routes it - is reused; the
// fictional identity, prompt and business facts behind Scott's are not,
// and a test asserts this module reaches no Scott code.

const { laneById, LANES } = require('./lanes');

const RUTH = Object.freeze({
  name: 'Ruth',
  role: 'Receptionist',
  // Deliberately modest. She is the way in, not the expert.
  line: 'Your first point of contact. Tell me what you need and I will take it to whoever holds it.'
});

// The only facts she is allowed to speak about a turn.
//
// Same structural discipline as the unlock alert (finding H7): the
// permitted keys are declared and anything else THROWS, so she cannot
// quietly grow a parameter that carries record content. A receptionist
// with an open-ended input is a new disclosure channel with no gate on
// it, which is exactly what the workspace exists to avoid.
const NOTE_FIELDS = Object.freeze(['laneId', 'answered', 'recordCount', 'gapRaised']);

function assertOnlyPermitted(opts) {
  const extra = Object.keys(opts || {}).filter((k) => !NOTE_FIELDS.includes(k));
  if (extra.length) {
    throw new Error(`receptionist: refusing unpermitted field(s) ${extra.join(', ')}; she may speak about the routing, never about the content`);
  }
}

function greeting() {
  return `${RUTH.name}. ${RUTH.line}`;
}

// What she says about where a question went. Takes a lane ID and three
// facts about the turn, and returns words. It is given no records, so it
// cannot leak one however it is called.
function handoffNote(opts = {}) {
  assertOnlyPermitted(opts);
  const { laneId, answered, recordCount, gapRaised } = opts;
  const lane = laneId ? laneById(laneId) : null;

  if (!lane) {
    return answered
      ? 'I answered that one myself; it did not need anybody in particular.'
      : 'I could not tell who holds that. Say a bit more and I will place it.';
  }

  const who = lane.name;
  if (!answered) {
    return gapRaised
      ? `I took that to ${who}, and the records do not answer it. I have written it down as a gap rather than guess.`
      : `I took that to ${who}, and there is nothing on file that answers it.`;
  }

  if (recordCount === 0) {
    return `${who} answered from what they hold. No specific record is behind it, so treat it as their reading rather than as evidence.`;
  }
  return `I took that to ${who}, who answered from ${recordCount} record${recordCount === 1 ? '' : 's'}. The provenance is listed with the answer.`;
}

// Who she can route to, for the interface to show. Names and ids only:
// no source classes, no ceilings, nothing about what any lane holds.
function directory() {
  return LANES.map((l) => ({ id: l.id, name: l.name, kind: l.kind }));
}

module.exports = { RUTH, NOTE_FIELDS, greeting, handoffNote, directory };
