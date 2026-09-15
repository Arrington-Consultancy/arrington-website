// Scott demonstration: the four-state progression.
//
// Tom's design (15/09/2026). One interface, four progressively expanded
// states, rather than four products:
//
//   1 MY WORKSPACE      a small, calm AI workspace
//   2 MY BUSINESS       plus the everyday business applications
//   3 MY TEAM           plus staff, operations and approvals
//   4 MY WHOLE COMPANY  plus the full operating environment
//
// SAME BRAIN. MORE TOOLS. BIGGER WORKSPACE.
//
// The progression exists because showing the whole Scott environment at
// once was visually too large to understand. It reveals a bigger WORKSPACE
// as you move right. It does not reveal a cleverer AI, and since
// 15/09/2026 it does not gate knowledge at all — see the note further down
// where the old Level 1 source-class cap used to be.
//
// TWO PROPERTIES MATTER MORE THAN ANYTHING ELSE IN THIS FILE, and both
// are asserted by test rather than left to care:
//
//   A. A LEVEL NEVER WIDENS ACCESS. Level 4 grants exactly what 07Q/05A
//      already grant and not one record more, so "Mike Evans at Level 4"
//      sees precisely what "Mike Evans" sees today. True by construction:
//      no level declares a domain, so there is no list here that could
//      drift out of step with clearance.
//
//   B. A LEVEL NEVER NARROWS KNOWLEDGE EITHER. "Scott at Level 1" knows
//      everything "Scott at Level 4" knows. What Level 1 lacks is
//      applications, not facts.
//
// Which tool belongs to which level is NOT decided here. It is decided in
// exactly one place, lib/scott/capabilityRegistry.js, so the allocation
// can be judged from the real interface and moved with a one-line edit.
// This file owns the four states themselves and nothing else.

// ------------------------------------------------------------
// The levels
// ------------------------------------------------------------

const LEVELS = [
  {
    id: 1,
    key: 'workspace',
    label: 'My Workspace',
    sub: 'A small, calm place to ask',
    // What the visitor is shown at this point, in the words the rail uses.
    blurb: 'The whole assistant, with nothing else on screen yet.'
  },
  {
    id: 2,
    key: 'business',
    label: 'My Business',
    sub: 'Email, diary and the everyday records',
    blurb: 'The same assistant, now with the applications a business actually runs on.'
  },
  {
    id: 3,
    key: 'team',
    label: 'My Team',
    sub: 'Somewhere more than one person works',
    blurb: 'Staff, operations and approvals. Who is asking changes the answer.'
  },
  {
    id: 4,
    key: 'company',
    label: 'My Whole Company',
    sub: 'The complete operating environment',
    blurb: 'The books, the marketing, the audit trail, and work nobody had time to look for.'
  }
];

const MIN_LEVEL = 1;
const MAX_LEVEL = 4;
const DEFAULT_LEVEL = 1;

// Null-prototype on purpose. A plain object literal resolves 'constructor'
// and 'toString' through Object.prototype, so a crafted level key would
// have found a truthy "level" that no branch below reasoned about. That is
// the exact shape of workspace governance finding T3 and Scott's own
// personaCanAct defect; it is cheaper to not have it than to test for it.
const LEVELS_BY_KEY = Object.assign(Object.create(null), ...LEVELS.map((l) => ({ [l.key]: l })));
const LEVELS_BY_ID = Object.assign(Object.create(null), ...LEVELS.map((l) => ({ [String(l.id)]: l })));

// Fails CLOSED, to the narrowest state, on anything it does not recognise:
// a missing value, a string, a float, a crafted prototype key, an object.
// The narrowest state is the safe default here because a level only ever
// takes things away.
function normaliseLevel(value) {
  if (typeof value === 'number' && Number.isInteger(value) && Object.prototype.hasOwnProperty.call(LEVELS_BY_ID, String(value))) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (Object.prototype.hasOwnProperty.call(LEVELS_BY_ID, trimmed)) return LEVELS_BY_ID[trimmed].id;
    if (Object.prototype.hasOwnProperty.call(LEVELS_BY_KEY, trimmed)) return LEVELS_BY_KEY[trimmed].id;
  }
  return DEFAULT_LEVEL;
}

function isValidLevel(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_LEVEL && value <= MAX_LEVEL;
}

function getLevel(id) {
  return LEVELS_BY_ID[String(normaliseLevel(id))];
}

// WHAT EACH STATE PUTS ON SCREEN IS NOT DECIDED HERE.
//
// It used to be, as a handful of `level >= n` booleans. That was the
// second of four places encoding the same fact (the others being the
// sidebar's conditionals, the finance tab list and the "not available
// yet" explanation), and four copies of one fact is four chances for them
// to disagree. Tom's instruction of 15/09/2026 collapsed them into one
// table: lib/scott/capabilityRegistry.js.
//
// Call capabilityRegistry.viewCapabilities(level, canSee) for the flags a
// view needs. It cannot be re-exported from here, because the registry
// requires this module for the level model and a cycle would be worse
// than the extra import at each call site.

// ------------------------------------------------------------
// There is NO knowledge cap. Deliberately, and this reverses an earlier
// design in this same file.
// ------------------------------------------------------------
//
// Level 1 used to cap the source classes a worker could read to ['leads'],
// and the interface said so in a "what I cannot see yet" note. Tom settled
// the model on 15/09/2026 and it is not that:
//
//   SAME BRAIN. MORE TOOLS. BIGGER WORKSPACE.
//
// The level sizes the WORKSPACE — which applications, integrations and
// working surfaces are attached to the AI. It has nothing to say about
// what a person may know. That question has one answer and it lives in
// lib/scott/clearance.js, where it always did.
//
// Two consequences, both asserted by test, and they run in opposite
// directions on purpose:
//
//   - Scott at Level 1 knows everything Scott at Level 4 knows. Shrinking
//     the workspace must not delete authorised knowledge.
//   - Mike Evans at Level 4 knows exactly what Mike Evans at Level 1
//     knows. Growing the workspace must not grant anything.
//
// The honest-answer protection that used to hang off the Level 1 cap did
// not go with it. It moved to where it belonged: the standing rule in
// GOVERNANCE_PREAMBLE that a worker must not state a figure it cannot
// derive from something it can actually see. That now applies at every
// level to every persona, which is stronger than what it replaced.
//
// WHAT IS NOT AVAILABLE AT A LEVEL IS A TOOL, NOT A FACT, and that is
// decided in lib/scott/capabilityRegistry.js. "What does Mrs Jones owe
// us?" is answered at Level 1. "Invoice Mrs Jones for £160" is understood
// at Level 1 and pointed at My Business, because invoicing is an
// application and this workspace does not have it yet.
//
// ceilingNote is kept as an exported function returning null so that any
// caller still asking gets "nothing to declare" rather than a crash, and
// so the removal is visible here rather than only as an absence.
function ceilingNote() {
  return null;
}

module.exports = {
  LEVELS,
  MIN_LEVEL,
  MAX_LEVEL,
  DEFAULT_LEVEL,
  normaliseLevel,
  isValidLevel,
  getLevel,
  ceilingNote
};
