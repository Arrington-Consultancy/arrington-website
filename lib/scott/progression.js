// Scott demonstration: the four-state progression.
//
// Tom's design (15/09/2026). One interface, four progressively expanded
// states, rather than four products:
//
//   1 MY WORKSPACE     the Ask box and nothing else
//   2 MY WHOLE COMPANY the business records behind the answer
//   3 MY TEAM          who is asking, and what that changes
//   4 MY BUSINESS      coordination, provenance and Lead Finder
//
// TWO PROPERTIES MATTER MORE THAN ANYTHING ELSE IN THIS FILE, and both
// are asserted by test rather than left to care:
//
//   A. A LEVEL NEVER WIDENS ACCESS. It is a narrowing lens laid over the
//      existing clearance model, never a second one. Level 4 grants
//      exactly what 07Q/05A already grant and not one record more, so
//      "Mike Evans at Level 4" sees precisely what "Mike Evans" sees
//      today. Anything else would make the progression an access-control
//      bypass wearing a nav control's clothes.
//
//   B. LEVEL 1's CEILING IS TRUE. The first state tells the visitor what
//      it cannot see. That sentence is worthless, and worse than
//      worthless, if the system behind it can in fact see those things
//      and is merely declining to mention them. So Level 1 really does
//      cap the source classes the workers may read, and the ceiling
//      sentence is generated FROM that cap rather than written beside it.
//
// Everything else here is presentation.

// ------------------------------------------------------------
// The levels
// ------------------------------------------------------------

const LEVELS = [
  {
    id: 1,
    key: 'workspace',
    label: 'My workspace',
    sub: 'One question, one answer',
    // What the visitor is shown at this point, in the words the rail uses.
    blurb: 'Ask a question and get an answer. Nothing else on screen.'
  },
  {
    id: 2,
    key: 'company',
    label: 'My whole company',
    sub: 'The records behind the answer',
    blurb: 'The same question, now answered from the business itself.'
  },
  {
    id: 3,
    key: 'team',
    label: 'My team',
    sub: 'Who is asking changes the answer',
    blurb: 'Switch between people and watch what each one can see.'
  },
  {
    id: 4,
    key: 'business',
    label: 'My business',
    sub: 'Coordination, evidence, opportunities',
    blurb: 'Several parts of the business answering together, and work nobody had time to look for.'
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

// ------------------------------------------------------------
// What each state puts on screen
// ------------------------------------------------------------
//
// Presentation only. Not one of these flags can reveal a record: every
// surface they control is separately clearance-gated where it renders,
// and a flag being true only means "this level is willing to show it if
// clearance allows". The two gates are ANDed, never ORed, and
// test/scott/progression.test.js pins that reading.

function capabilities(levelValue) {
  const level = normaliseLevel(levelValue);
  return {
    level,
    // Level 2 up: the pulse numbers, the attention list, the business
    // snapshot, the company records in the sidebar.
    showBusinessContext: level >= 2,
    showRecordsNav: level >= 2,
    // Level 3 up: the Viewing as control. Below it the visitor is simply
    // themselves, which is also why dropping below 3 returns an
    // impersonating viewer to their own identity (see routes/scott.js).
    showPersonaSwitch: level >= 3,
    showTeamStrip: level >= 3,
    // Level 4 only: how an answer was put together, and the opportunity
    // work. Both additionally require clearance.
    showProvenance: level === MAX_LEVEL,
    showLeadFinder: level === MAX_LEVEL,
    // The chat's own detail setting. 'plain' renders one answer with no
    // worker identity chrome; 'team' is the existing sequential reveal
    // with each specialist named. Nothing is invented in either: 'plain'
    // shows the same replies without attributing them to a named
    // character, because a visitor at Level 1 has not been introduced to
    // the team and naming them there is noise, not honesty.
    chatDetail: level >= 3 ? 'team' : 'plain'
  };
}

// ------------------------------------------------------------
// The Level 1 cap, which is what makes the ceiling true
// ------------------------------------------------------------
//
// At Level 1 the demonstration is "something arrived in my workspace and
// I asked about it". The only company record class in scope is the
// incoming enquiry itself. Not the job it refers to, not the price, not
// workshop capacity, not the customer's account.
//
// Above Level 1 there is NO cap at all: null means "whatever clearance
// allows", which is the pre-existing behaviour, byte for byte. That is
// what keeps property A true by construction rather than by vigilance —
// there is no set of domains for level 4 that could accidentally contain
// something clearance does not.
const LEVEL_1_DOMAINS = Object.freeze(['leads']);

function contextDomainCap(levelValue) {
  return normaliseLevel(levelValue) === 1 ? LEVEL_1_DOMAINS : null;
}

// True when this level permits reading this source class at all. Called
// alongside, never instead of, the clearance check.
function levelAllowsDomain(levelValue, domain) {
  const cap = contextDomainCap(levelValue);
  if (cap === null) return true;
  return cap.includes(domain);
}

// The honest ceiling sentence, derived from the cap rather than written
// next to it. If LEVEL_1_DOMAINS ever changes, this changes with it.
// Returns null above Level 1, where there is nothing to declare: the
// answer is bounded by clearance and the interface says so elsewhere.
function ceilingNote(levelValue) {
  if (normaliseLevel(levelValue) !== 1) return null;
  return {
    heading: 'What I cannot see yet',
    body: 'At this point I can read the message that came in and nothing else. '
      + 'Not the job behind it, not what it was quoted at, not whether the workshop has room. '
      + 'Those are the next step.'
  };
}

module.exports = {
  LEVELS,
  MIN_LEVEL,
  MAX_LEVEL,
  DEFAULT_LEVEL,
  LEVEL_1_DOMAINS,
  normaliseLevel,
  isValidLevel,
  getLevel,
  capabilities,
  contextDomainCap,
  levelAllowsDomain,
  ceilingNote
};
