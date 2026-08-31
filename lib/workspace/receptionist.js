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
// facts about the turn, and returns words.
//
// It is given no record and no answer text, so there is nothing of a
// lane's content in scope for it to repeat. That is a statement about
// its INPUTS and not a proof about its output, which is the distinction
// finding T6 drew against the earlier wording "cannot leak one however
// it is called". What actually holds the line is the field guard above,
// which throws on anything outside the declared set, and the tests that
// exercise it.
function handoffNote(opts = {}) {
  assertOnlyPermitted(opts);
  const { laneId, answered, recordCount, gapRaised } = opts;
  // laneById is null-prototype since finding T3, so a crafted id like
  // "constructor" can no longer return the Object function for her to
  // name as a colleague. Belt and braces: only a value that is actually
  // one of the lanes is allowed to be spoken.
  const lane = laneId && LANES.some((l) => l.id === laneId) ? laneById(laneId) : null;
  const n = Number.isFinite(recordCount) && recordCount > 0 ? recordCount : 0;
  const records = `${n} record${n === 1 ? '' : 's'}`;
  // Agreement, because "the 1 record behind it do not fully cover" was on
  // a reachable path: a lane answered, a gap was raised, and exactly one
  // record was supplied. Not a correctness defect, but this is
  // owner-facing copy in the one product whose value is that its wording
  // can be relied on, and the brand rules govern it.
  const recordsBehind = n === 1
    ? 'the record behind it does not'
    : `the ${records} behind it do not`;

  // TWO RULES GOVERN EVERY SENTENCE BELOW, and both are findings.
  //
  // 1. NO SENTENCE MENTIONS RECORDS UNLESS THERE WERE RECORDS
  //    (finding V1). U1's fix wrote "it was answered from the general
  //    records" on the no-lane path unconditionally. With an unseeded
  //    brain - which is this candidate's actual state, and the state
  //    every zero-record turn is in - there were no general records, and
  //    the interface said so on the same rendered line while she claimed
  //    them. Three of the four zero-record turns asserted an evidential
  //    basis that did not exist, because the one honest branch sat below
  //    two early returns and could not be reached.
  //
  //    This is the thing the workspace exists to be trusted about, so
  //    the record clause is now derived from `n` on every branch rather
  //    than written into a string.
  //
  // 2. SHE NEVER CLAIMS AN ACT SHE DID NOT PERFORM (findings U1, V2).
  //    She routes: "I took that to X" is true, and it is the whole of
  //    what she does. She does not answer, and she does not write the
  //    gap down - repo.createGap does, from a field the model returned -
  //    so "I have written the gap down" was the same untruth as "I
  //    answered that one myself" one step along. The gap is now reported
  //    in the passive, because the passive is what happened.
  const gapWritten = 'The gap has been written down rather than let pass.';

  if (!lane) {
    if (!answered) {
      return 'I could not tell who holds that. Say a bit more and I will place it.';
    }
    // The no-lane turn is the DEFAULT path, not an edge case: routing is
    // nine keyword regexes, and since finding T3 every invalid or
    // crafted lane id arrives here too.
    const basis = n
      ? `so it was answered from ${records} in the general context.`
      : 'and there was no record on file to answer it from.';
    const opening = `That did not match one of the specialists, ${basis}`;
    return gapRaised ? `${opening} ${gapWritten}` : opening;
  }

  const who = lane.name;

  // Finding T2: `gapRaised` was passed on every turn and changed
  // nothing, because it was only consulted on the `!answered` branch and
  // the caller passes `answered: !!result.answer`, which is true
  // whenever the workspace replied at all. A gap is the single most
  // useful thing she can tell the owner - it means the records did not
  // cover the question and somebody wrote that down instead of guessing
  // - so it is said whether or not an answer came back.
  if (gapRaised) {
    if (!answered) {
      return `I took that to ${who}, and there is nothing on file that answers it. ${gapWritten}`;
    }
    return n
      ? `I took that to ${who}. They answered, but ${recordsBehind} fully cover the question. ${gapWritten}`
      : `I took that to ${who}. They answered from what they hold, with no record behind it. ${gapWritten}`;
  }

  if (!answered) {
    return `I took that to ${who}, and there is nothing on file that answers it.`;
  }

  if (!n) {
    return `${who} answered from what they hold. No specific record is behind it, so treat it as their reading rather than as evidence.`;
  }
  return `I took that to ${who}, who answered from ${records}. The provenance is listed with the answer.`;
}

// Who she can route to, for the interface to show. Names and ids only:
// no source classes, no ceilings, nothing about what any lane holds.
function directory() {
  return LANES.map((l) => ({ id: l.id, name: l.name, kind: l.kind }));
}

module.exports = { RUTH, NOTE_FIELDS, greeting, handoffNote, directory };
