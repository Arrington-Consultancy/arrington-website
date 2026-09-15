// Scott demonstration: the eight specialists, presented as four groups.
//
// Tom's instruction (15/09/2026): "Nine workers is too much and starts
// feeling like an org chart again... The objective is not to demonstrate how
// many AI workers exist. It is to make Scott feel simple and understandable
// to a normal business owner."
//
// THIS FILE IS PRESENTATION ONLY, and that is the property worth guarding.
// It contains no domain, no clearance, no permission and no source class, and
// nothing in it is ever consulted to decide whether somebody may see
// something. Grouping two workers under one heading does NOT pool what they
// can read: Gareth Bell and Bob Fletcher appear together under "Winning work"
// and their WORKER_DOMAINS in clearance.js are untouched and still separate,
// so an answer from one of them is filtered exactly as it was before this
// file existed. test/scott/workerGroups.test.js asserts both halves of that:
// that the module names no domain, and that the permission model is byte-for-
// byte what it was.
//
// The grouping is by WHAT A BUSINESS OWNER WANTS, not by what the system is
// made of, which is why it does not follow the worker register's own shape.
// An owner asks "can it help me win work / get the work done / sort the money
// out / keep the records straight", and those four questions are the four
// groups. Ruth is not in any of them: she is the person you talk to, not a
// department, and putting her in a group would make her look like a fifth
// thing to choose between.

const GROUPS = [
  {
    id: 'winning_work',
    label: 'Winning work',
    blurb: 'Enquiries, quotes, customers, reviews',
    // Commercial prices it, Customers & Marketing talks to them. From the
    // owner's side that is one job: turning interest into paid work.
    workerIds: ['commercial', 'customers_marketing']
  },
  {
    id: 'doing_the_work',
    label: 'Getting it done',
    blurb: 'Jobs, capacity, materials, standards',
    // Operations schedules it, Quality Control decides whether it may go
    // out. Splitting those two on screen asks the owner to care about an
    // internal boundary that only matters inside the workshop.
    workerIds: ['operations', 'quality_control']
  },
  {
    id: 'the_money',
    label: 'The money',
    blurb: 'Invoices, cash, margins, what is owed',
    workerIds: ['finance_accounts']
  },
  {
    id: 'records_and_rules',
    label: 'Records and rules',
    blurb: 'What the company knows, who may do what, staff',
    // The three that answer "what is on file, and what are we allowed to
    // do about it". Governance sits here rather than alone because an
    // owner meets it as a rule about a record, never as a department.
    workerIds: ['company_brain', 'governance', 'people_hr']
  }
];

// Null-prototype, for the same reason the progression's level map is: a
// crafted worker id must not resolve a group through Object.prototype. Built
// from GROUPS rather than written out, so the two cannot disagree.
const GROUP_BY_WORKER = Object.create(null);
GROUPS.forEach((g) => {
  g.workerIds.forEach((wid) => { GROUP_BY_WORKER[wid] = g; });
});

// The group a worker is presented under, or null for one that is in no group
// (Ruth, and any worker added to the register without being placed here).
// Returning null rather than a default group is deliberate: a worker that
// quietly lands in a catch-all is a worker nobody notices is unplaced, and
// the test that counts placement would stop being able to see it.
function groupForWorker(workerId) {
  if (typeof workerId !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(GROUP_BY_WORKER, workerId)
    ? GROUP_BY_WORKER[workerId]
    : null;
}

// The label to show for a worker in a summary surface (the strip, the
// provenance panel). Falls back to the worker's own displayRole when it
// belongs to no group, so an unplaced worker still reads as something rather
// than as an empty cell.
function labelForWorker(workerId, fallback) {
  const g = groupForWorker(workerId);
  return g ? g.label : (fallback || 'Part of the business');
}

// The groups that have at least one ACTIVE worker behind them, with those
// workers attached. Takes the active worker list rather than importing the
// register, so this module stays free of everything except its own mapping
// and can be tested without the rest of the system.
//
// A group with no active worker is dropped entirely: the demonstration should
// never offer a heading that nothing is behind.
function activeGroups(activeWorkerIds) {
  const active = new Set(Array.isArray(activeWorkerIds) ? activeWorkerIds : []);
  return GROUPS
    .map((g) => ({ ...g, workerIds: g.workerIds.filter((id) => active.has(id)) }))
    .filter((g) => g.workerIds.length > 0);
}

module.exports = {
  GROUPS,
  groupForWorker,
  labelForWorker,
  activeGroups
};
