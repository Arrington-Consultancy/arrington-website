// Scott demonstration: ONE registry deciding where each capability first
// becomes available.
//
// Tom's instruction (15/09/2026): capability ownership must not stay
// independently encoded across the progression's capability booleans, the
// sidebar's conditionals, the finance tab list and the "available in My
// Business" explanation. Four copies of one fact is four chances for them
// to disagree, and the one that disagrees silently is the nav.
//
// THE TWO LEGS ARE SEPARATE AND ARE ALWAYS ANDed.
//
//   level  decides whether this WORKSPACE contains the tool at all.
//   domain decides whether this HUMAN may see or do it.
//
// They answer different questions and neither may stand in for the other.
// A level never grants anything: raising the level can only ever add a
// tool the signed-in person was already cleared for, and `requiresDomain`
// is checked against the real clearance model (lib/scott/clearance.js)
// exactly as it was before this file existed. `available()` below is the
// only place the two are combined, and it combines them with AND.
//
// Everything here is presentation and packaging. There is no record in
// this file, no figure, no persona and no fictional fact.
//
// FUTURE-PROOFING, stated plainly because it shaped the schema: the four
// states may one day be four products at four prices. Nothing here sets a
// price or assumes that will happen. What it does mean is that moving a
// capability between levels has to be a one-line edit to a table, not
// surgery, so the allocation can be judged from the real interface and
// changed cheaply. If invoicing reads better in My Team, that is a single
// number below.

const progression = require('./progression');

// ------------------------------------------------------------
// Nav groups, in the order the sidebar renders them
// ------------------------------------------------------------
//
// A group is a visual heading, nothing more. It carries no permission and
// is never consulted to decide whether anybody may see anything — the same
// rule workerGroups.js lives under, for the same reason: the moment a
// group resolves access, the narrower member silently inherits the wider
// one's reach.
const GROUPS = [
  { id: 'daily', label: '', collapsible: false },
  { id: 'business', label: 'My business', collapsible: false },
  { id: 'operations', label: 'Operations', collapsible: true },
  { id: 'company', label: 'Whole company', collapsible: true }
];

// ------------------------------------------------------------
// The registry
// ------------------------------------------------------------
//
// Fields:
//   id               stable internal key. Never shown to a visitor.
//   label            visitorLabel: what the interface calls it.
//   level            firstAvailableLevel. 1-4, or null for never-in-nav.
//   surface          { kind, path, group } — 'nav' renders a link,
//                    'panel' is a region of a page the level gates,
//                    'action' is something you do rather than somewhere
//                    you go, 'hidden' is registered but never presented.
//   requiresDomain   clearance domain, or null when the surface does its
//                    own per-row filtering (which is most of them: a page
//                    that filters its contents is how this demo shows the
//                    clearance model working, so hiding the whole link
//                    would remove the demonstration).
//   intent           phrases that mean somebody is asking to do this. Used
//                    ONLY to work out which level to point at; never to
//                    decide access.
//   doing            the verb phrase used in the "not here yet" sentence.
const CAPABILITIES = [
  // ---------------- 1 · MY WORKSPACE ----------------
  {
    id: 'ask_ai',
    activeKey: 'dashboard',
    label: 'Ask AI',
    level: 1,
    surface: { kind: 'panel', path: '/scott', group: 'daily' },
    requiresDomain: null,
    intent: [],
    doing: 'answering questions'
  },
  {
    id: 'today',
    activeKey: 'dashboard',
    label: 'Today',
    level: 1,
    surface: { kind: 'nav', path: '/scott', group: 'daily' },
    requiresDomain: null,
    intent: [],
    doing: 'showing what needs you today'
  },
  {
    id: 'messages',
    activeKey: 'enquiries',
    label: 'Messages',
    level: 1,
    // The enquiries surface, under the name a solo owner would use for it.
    // Deliberately the same route and the same records: renaming a thing
    // for the visitor is presentation, building a second one would be a
    // second source of truth.
    surface: { kind: 'nav', path: '/scott/enquiries', group: 'daily' },
    requiresDomain: null,
    intent: ['open my messages', 'show me my messages'],
    doing: 'reading what has come in'
  },
  {
    id: 'tasks',
    activeKey: 'tasks',
    label: 'Tasks',
    level: 1,
    surface: { kind: 'nav', path: '/scott/tasks', group: 'daily' },
    requiresDomain: null,
    intent: ['add a task', 'remind me', 'put it on my list', 'tick off'],
    doing: 'keeping your task list'
  },

  // ---------------- 2 · MY BUSINESS ----------------
  {
    id: 'email',
    activeKey: 'email',
    label: 'Email',
    level: 2,
    surface: { kind: 'nav', path: '/scott/email', group: 'daily' },
    requiresDomain: null,
    intent: ['email them', 'email him', 'email her', 'email mrs', 'email mr', 'send an email', 'send them an email', 'reply to the email', 'check my inbox', 'write to them'],
    doing: 'sending and reading email'
  },
  {
    id: 'calendar',
    activeKey: 'calendar',
    label: 'Calendar',
    level: 2,
    surface: { kind: 'nav', path: '/scott/calendar', group: 'daily' },
    requiresDomain: null,
    intent: ['book them in', 'book it in', 'put it in the diary', 'put it in my calendar', 'schedule a', 'make an appointment', 'open my calendar'],
    doing: 'keeping the diary'
  },
  {
    id: 'jobs',
    activeKey: 'jobs',
    label: 'Jobs & Orders',
    level: 2,
    surface: { kind: 'nav', path: '/scott/jobs', group: 'business' },
    requiresDomain: null,
    intent: ['open the job board', 'show me the job board'],
    doing: 'working the job board'
  },
  {
    id: 'customers',
    activeKey: 'customers',
    label: 'Customers',
    level: 2,
    surface: { kind: 'nav', path: '/scott/customers', group: 'business' },
    requiresDomain: null,
    intent: ['add a customer', 'create a customer', 'open the customer record'],
    doing: 'keeping customer records'
  },
  {
    id: 'pipeline',
    activeKey: 'pipeline',
    label: 'Pipeline & Quotes',
    level: 2,
    surface: { kind: 'nav', path: '/scott/pipeline', group: 'business' },
    requiresDomain: null,
    intent: ['send a quote', 'raise a quote', 'quote them', 'quote him', 'quote her', 'price it up', 'open the pipeline'],
    doing: 'quoting work'
  },
  {
    id: 'invoicing',
    activeKey: 'finance',
    label: 'Sales & Invoices',
    level: 2,
    // The finance area already splits here, on its own domains, and has
    // done since 01/09/2026: the Sales tab needs invoice_status and every
    // other tab needs finance_full. The level boundary rides on structure
    // that already exists and has been reviewed, rather than a new one.
    surface: { kind: 'nav', path: '/scott/finance/sales', group: 'business' },
    requiresDomain: 'invoice_status',
    // Once the whole Banking & Accounting area arrives at Level 4, a
    // separate link to one of its tabs is clutter rather than a second
    // capability. The narrow link stands down; the capability does not
    // change and neither does the route.
    supersededBy: 'banking',
    intent: ['invoice', 'bill mrs', 'bill mr', 'bill them', 'charge them', 'charge her', 'charge him'],
    doing: 'raising invoices'
  },
  {
    id: 'brain_browse',
    activeKey: 'brain',
    label: 'Company Brain',
    level: 2,
    // ASKING the brain a question is ask_ai and is available at Level 1.
    // This is the browsable record set, which is a surface.
    surface: { kind: 'nav', path: '/scott/brain', group: 'business' },
    requiresDomain: null,
    intent: ['browse the records', 'open the company brain'],
    doing: 'browsing the company records'
  },
  {
    id: 'job_status',
    activeKey: 'jobs',
    label: 'Moving a job on',
    level: 2,
    surface: { kind: 'action', path: '/scott/jobs', group: 'business' },
    requiresDomain: 'jobs_ops',
    intent: ['mark it delivered', 'mark it as complete', 'mark the job', 'move the job to', 'set the job to'],
    doing: 'moving jobs through the workshop'
  },
  {
    id: 'business_snapshot',
    activeKey: 'dashboard',
    label: 'Business snapshot',
    level: 2,
    surface: { kind: 'panel', path: '/scott', group: 'business' },
    requiresDomain: null,
    intent: [],
    doing: 'showing the business at a glance'
  },

  // ---------------- 3 · MY TEAM ----------------
  {
    id: 'persona_switch',
    activeKey: 'dashboard',
    label: 'Viewing as',
    level: 3,
    surface: { kind: 'panel', path: '/scott', group: 'operations' },
    requiresDomain: null,
    intent: ['view as', 'switch to', 'log in as', 'see it as'],
    doing: 'seeing the business as someone else'
  },
  {
    id: 'team_view',
    activeKey: 'team',
    label: 'How this team works',
    level: 3,
    surface: { kind: 'nav', path: '/scott/team', group: 'operations' },
    requiresDomain: null,
    intent: ['open the team', 'show me the team'],
    doing: 'showing how the team is set up'
  },
  {
    id: 'people',
    activeKey: 'people',
    label: 'People',
    level: 3,
    surface: { kind: 'nav', path: '/scott/people', group: 'operations' },
    requiresDomain: null,
    intent: ['book the holiday', 'add a staff member', 'update the rota', 'open the staff record'],
    doing: 'keeping staff records'
  },
  {
    id: 'stock',
    activeKey: 'stock',
    label: 'Stock & Supply',
    level: 3,
    surface: { kind: 'nav', path: '/scott/stock', group: 'operations' },
    requiresDomain: null,
    intent: ['reorder', 'order more', 'add a supplier', 'update the stock', 'open the stock'],
    doing: 'tracking stock and suppliers'
  },
  {
    id: 'purchase_orders',
    activeKey: 'orders',
    label: 'Purchase Orders',
    level: 3,
    surface: { kind: 'nav', path: '/scott/orders', group: 'operations' },
    requiresDomain: null,
    intent: ['raise a purchase order', 'raise a po', 'place an order with'],
    doing: 'raising purchase orders'
  },
  {
    id: 'complaints',
    activeKey: 'complaints',
    label: 'Complaints',
    level: 3,
    surface: { kind: 'nav', path: '/scott/complaints', group: 'operations' },
    requiresDomain: null,
    intent: ['log a complaint', 'raise a complaint', 'open the complaint'],
    doing: 'handling complaints'
  },
  {
    id: 'quality',
    activeKey: 'quality',
    label: 'Quality Control',
    level: 3,
    surface: { kind: 'nav', path: '/scott/quality', group: 'operations' },
    requiresDomain: null,
    intent: ['sign it off', 'book a quality check', 'send it for rework', 'pass the inspection'],
    doing: 'running quality checks'
  },
  {
    id: 'assets',
    activeKey: 'assets',
    label: 'Assets & Maintenance',
    level: 3,
    surface: { kind: 'nav', path: '/scott/assets', group: 'operations' },
    requiresDomain: null,
    intent: ['book the van in', 'book the mot', 'log a defect', 'book a service'],
    doing: 'keeping the asset register'
  },
  {
    id: 'approvals',
    activeKey: 'approvals',
    label: 'Approvals',
    level: 3,
    // An approval is two people by definition: one asks, one decides. It
    // means nothing in a workspace with one person in it.
    surface: { kind: 'nav', path: '/scott/approvals', group: 'operations' },
    requiresDomain: null,
    intent: ['approve it', 'approve the', 'authorise the', 'send it for approval'],
    doing: 'approving work before it goes out'
  },
  {
    id: 'enquiry_assign',
    activeKey: 'enquiries',
    label: 'Assigning work',
    level: 3,
    surface: { kind: 'action', path: '/scott/enquiries', group: 'operations' },
    requiresDomain: 'leads',
    intent: ['assign it to', 'assign this to', 'pass it to', 'give it to', 'hand it to'],
    doing: 'passing work to someone'
  },

  // ---------------- 4 · MY WHOLE COMPANY ----------------
  {
    id: 'banking',
    activeKey: 'finance',
    label: 'Banking & Accounting',
    level: 4,
    surface: { kind: 'nav', path: '/scott/finance', group: 'company' },
    requiresDomain: null,
    intent: ['reconcile', 'file the vat', 'record a bill', 'pay the bill', 'post a journal', 'open the books'],
    doing: 'running the books'
  },
  {
    id: 'marketing',
    activeKey: 'marketing',
    label: 'Marketing & Reviews',
    level: 4,
    surface: { kind: 'nav', path: '/scott/marketing', group: 'company' },
    requiresDomain: null,
    intent: ['reply to the review', 'run a campaign', 'open marketing'],
    doing: 'running marketing'
  },
  {
    id: 'social',
    activeKey: 'social',
    label: 'Social Media',
    level: 4,
    surface: { kind: 'nav', path: '/scott/social', group: 'company' },
    requiresDomain: null,
    intent: ['post about', 'post it on facebook', 'post on instagram', 'schedule a post'],
    doing: 'running the social accounts'
  },
  {
    id: 'opportunities',
    activeKey: 'opportunities',
    label: 'Where the Money Goes',
    level: 4,
    surface: { kind: 'nav', path: '/scott/opportunities', group: 'company' },
    requiresDomain: null,
    intent: ['open where the money goes'],
    doing: 'finding where money leaks out'
  },
  {
    id: 'lead_finder',
    activeKey: 'leadfinder',
    label: 'Lead Finder',
    level: 4,
    surface: { kind: 'nav', path: '/scott/lead-finder', group: 'company' },
    requiresDomain: 'commercial_prospecting',
    intent: ['find me work', 'find me customers', 'find new customers', 'find us some leads'],
    doing: 'looking for work nobody asked it to find'
  },
  {
    id: 'gaps',
    activeKey: 'gaps',
    label: 'Needs Human Input',
    level: 4,
    surface: { kind: 'nav', path: '/scott/gaps', group: 'company' },
    requiresDomain: null,
    intent: ['open the gaps'],
    doing: 'tracking what the records are missing'
  },
  {
    id: 'activity',
    activeKey: 'activity',
    label: 'Activity & Audit',
    level: 4,
    surface: { kind: 'nav', path: '/scott/activity', group: 'company' },
    requiresDomain: null,
    intent: ['open the audit', 'show me the activity log'],
    doing: 'keeping the audit trail'
  },
  {
    id: 'premises',
    activeKey: 'premises',
    label: 'Premises & Facilities',
    level: 4,
    surface: { kind: 'nav', path: '/scott/premises', group: 'company' },
    requiresDomain: null,
    intent: ['open premises'],
    doing: 'keeping the premises records'
  },
  {
    id: 'virtual_staff',
    activeKey: 'dashboard',
    label: 'Virtual staff',
    level: 4,
    surface: { kind: 'panel', path: '/scott', group: 'company' },
    requiresDomain: null,
    intent: [],
    doing: 'running a whole virtual team'
  },
  {
    id: 'provenance',
    activeKey: 'dashboard',
    label: 'How this was handled',
    level: 4,
    surface: { kind: 'panel', path: '/scott', group: 'company' },
    requiresDomain: null,
    intent: ['show your working', 'show me how you handled that'],
    doing: 'showing how an answer was put together'
  },

  // ---------------- Never in the product interface ----------------
  //
  // level: null means no level reveals these. They are registered here so
  // the registry is the whole truth about what exists — a surface absent
  // from this file would be a surface nobody is deciding about — and a
  // test asserts every one of them stays out of the nav at every level.
  //
  // Not deleted, per Tom's instruction. Each remains reachable by typing
  // its path, and each keeps whatever guard it already had.
  {
    id: 'brain_candidates',
    activeKey: 'gaps',
    label: 'Proposed facts review',
    level: null,
    // Arrington's machinery, not Scott's fiction. Already gated on the
    // REAL site role rather than the persona, and that gate is what keeps
    // an invited viewer out; this entry only records that it exists and
    // that no level reveals it.
    //
    // `path` is null because this is not a route of its own: it is a
    // region INSIDE the gaps page. Giving it that page's path would have
    // been actively misleading — the page is a legitimate Level 4
    // destination, and only the review queue on it is hidden.
    surface: { kind: 'hidden', path: null, group: null },
    requiresDomain: null,
    intent: [],
    doing: null
  },
  {
    id: 'clearance_compare',
    activeKey: 'compare',
    label: 'Clearance comparison',
    level: null,
    surface: { kind: 'hidden', path: '/scott/compare', group: null },
    requiresDomain: null,
    intent: [],
    doing: null
  },
  {
    id: 'invoice_demo',
    activeKey: 'finance',
    label: 'Invoice demo',
    level: null,
    surface: { kind: 'hidden', path: '/scott/finance/invoice/demo', group: null },
    requiresDomain: null,
    intent: [],
    doing: null
  },
  {
    id: 'lead_capture',
    activeKey: 'lead',
    label: 'Lead capture',
    level: null,
    surface: { kind: 'hidden', path: '/scott/lead', group: null },
    requiresDomain: null,
    intent: [],
    doing: null
  }
];

// Null-prototype, same reason as progression.js and clearance.js: a plain
// object literal resolves 'constructor' and 'toString' through
// Object.prototype, so a crafted id would find a truthy capability that no
// branch below reasoned about.
const BY_ID = Object.assign(Object.create(null), ...CAPABILITIES.map((c) => ({ [c.id]: c })));

function get(id) {
  if (typeof id !== 'string') return null;
  return Object.hasOwn(BY_ID, id) ? BY_ID[id] : null;
}

// The level at which a capability first appears, or null when no level
// ever reveals it.
function firstAvailableLevel(id) {
  const cap = get(id);
  return cap ? cap.level : null;
}

// THE ONE PLACE THE TWO LEGS MEET, and they meet with AND.
//
// `canSee` is the caller's clearance predicate — in practice
// clearance.personaCanSeeDomain bound to the effective persona, which is
// the same function every page and the context builder already use. It is
// passed in rather than imported so this module stays pure and so no
// future edit here can quietly become a second clearance model.
function available(id, level, canSee) {
  const cap = get(id);
  if (!cap) return false;
  if (cap.level === null) return false;
  if (progression.normaliseLevel(level) < cap.level) return false;
  if (cap.requiresDomain) {
    return typeof canSee === 'function' ? !!canSee(cap.requiresDomain) : false;
  }
  return true;
}

// Everything the nav should show at this level, for this person, grouped.
// Groups with nothing in them are dropped, so a level never renders an
// empty heading.
function navFor(level, canSee) {
  const lv = progression.normaliseLevel(level);
  return GROUPS.map((g) => ({
    ...g,
    items: CAPABILITIES.filter((c) =>
      c.surface.kind === 'nav'
      && c.surface.group === g.id
      && available(c.id, lv, canSee)
      // A capability whose wider replacement is already on screen stands
      // down rather than sitting beside it. Nothing is revoked: the route
      // and the clearance rule are untouched, only the duplicate link goes.
      && !(c.supersededBy && available(c.supersededBy, lv, canSee)))
      .map((c) => ({ id: c.id, label: c.label, path: c.surface.path, activeKey: c.activeKey || c.id }))
  })).filter((g) => g.items.length > 0);
}

// Convenience for the views: a flat object of `{ capabilityId: boolean }`
// so a template asks `caps.can.calendar` rather than repeating the two-leg
// test and getting it subtly wrong somewhere.
function capabilityFlags(level, canSee) {
  const out = Object.create(null);
  CAPABILITIES.forEach((c) => { out[c.id] = available(c.id, level, canSee); });
  return out;
}

// THE ONE THING EVERY VIEW ASKS FOR.
//
// The named flags below used to live in progression.js as a handful of
// `level >= n` comparisons written by hand. They are derived from the
// registry now, so moving a capability between levels moves its surface
// with it and there is no second number to remember. The names are kept
// so the templates did not all have to change in the same commit as the
// allocation; each is now a question about a registry entry rather than
// about a magic number.
function viewCapabilities(level, canSee) {
  const lv = progression.normaliseLevel(level);
  const can = capabilityFlags(lv, canSee);
  return {
    level: lv,
    // Every capability by id, for anything the named flags do not cover.
    can,
    nav: navFor(lv, canSee),
    // Named flags, all derived.
    showBusinessContext: can.business_snapshot,
    showRecordsNav: navFor(lv, canSee).some((g) => g.id !== 'daily'),
    showPersonaSwitch: can.persona_switch,
    // Tied to team_view, NOT to virtual_staff, and that was a real defect
    // rather than a preference. At Level 3 the chat starts naming the
    // specialists (chatDetail below), so the strip introducing them has to
    // arrive in the same step. With it on virtual_staff the visitor met
    // names in the answers one whole level before anything on screen said
    // who those people were.
    showTeamStrip: can.team_view,
    showProvenance: can.provenance,
    showLeadFinder: can.lead_finder,
    // The chat's own detail setting. 'plain' renders one answer with no
    // worker identity chrome; 'team' is the sequential reveal with each
    // specialist named. Nothing is invented in either: 'plain' shows the
    // same replies without attributing them to a named character, because
    // a visitor who has not been introduced to the team reads those names
    // as noise rather than as honesty. Tied to the team capability so the
    // introduction and the naming arrive together.
    chatDetail: can.team_view ? 'team' : 'plain'
  };
}

// ------------------------------------------------------------
// "I understand, but that tool is not in this workspace yet"
// ------------------------------------------------------------
//
// Deterministic, pure, and deliberately NOT the model's job. The model
// answers the question; this decides whether the workspace contains the
// tool. Keeping the decision in code is what stops the interface claiming
// a capability exists because a sentence sounded confident.
//
// Returns null unless ALL of these hold:
//   - the sentence matches a capability's intent
//   - that capability is above the current level
//   - the person would actually be allowed it at that level
//
// That last condition matters more than it looks. Pointing Mike Evans at
// My Whole Company for "find me new customers" would be selling him a
// level that will still refuse him, because Lead Finder needs a clearance
// he does not hold. Where the level would not help, this stays silent and
// the ordinary refusal stands.
// A QUESTION IS NEVER DIVERTED. This is the guard that makes Tom's own
// worked pair behave correctly, and it is load-bearing:
//
//   "What does Mrs Jones owe us?"   -> knowledge. Answer it at any level.
//   "Invoice Mrs Jones for £160."   -> an action. Needs the application.
//
// Both sentences contain the same customer and the same money. The only
// thing separating them is that one asks and one instructs, so that is
// what is tested. A sentence opening with one of these words is seeking
// information, and under "same brain, more tools" information is never
// what a level withholds — diverting it would reintroduce the knowledge
// ceiling through the side door, one sentence at a time.
//
// "Can you invoice Mrs Jones?" is deliberately NOT caught by this: "can"
// is not in the list, because it opens a request rather than a question
// about the business. The intent phrases below are action-shaped for the
// same reason, so this guard is the second line rather than the only one.
const KNOWLEDGE_OPENERS = /^\s*(what|what's|whats|which|who|whose|whom|when|where|why|how)\b/i;

function detectUnavailable(text, level, canSee) {
  if (typeof text !== 'string' || !text.trim()) return null;
  if (KNOWLEDGE_OPENERS.test(text)) return null;
  const haystack = text.toLowerCase();
  const lv = progression.normaliseLevel(level);

  const hit = CAPABILITIES.find((c) =>
    c.level !== null
    && c.level > lv
    && c.intent.some((phrase) => haystack.includes(phrase))
    && available(c.id, c.level, canSee));

  if (!hit) return null;

  const target = progression.getLevel(hit.level);
  return {
    capability: hit.id,
    label: hit.label,
    level: hit.level,
    levelLabel: target.label,
    doing: hit.doing,
    // The visitor-facing sentence. No worker name, no capability id, no
    // domain, no routing language — Tom's instruction, and it is the right
    // one: "the invoicing lane is at level 2" is a sentence about our
    // implementation, not about their business.
    message: `I can do that in ${target.label}, where ${hit.doing} is available.`,
    cta: `Open ${target.label}`
  };
}

module.exports = {
  CAPABILITIES,
  GROUPS,
  get,
  firstAvailableLevel,
  available,
  navFor,
  capabilityFlags,
  viewCapabilities,
  detectUnavailable
};
