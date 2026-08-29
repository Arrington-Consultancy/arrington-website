// Scott AI Demonstration — human data clearance model (v0.2).
//
// Transcribed from "07Q SCOTT'S IT, SYSTEMS, ACCESS & BACKUP" (the
// role-based clearance expansion section) and "05A SCOTT'S WORKER
// PERMISSION MAP V0.2 - PROPOSED EXPANSION" (the human clearance
// intersection control). Both are marked in Drive as approved design
// direction, not yet independently governance-cleared for release — see
// config.js's SNAPSHOT_LABEL and the note in workers.js about the three
// proposed v0.2 workers remaining dormant for the same reason. The
// CLEARANCE MODEL ITSELF is a website access-control feature, not an AI
// worker, so it is not blocked by that same gate — but it is built and
// tested to the standard the pending governance review will actually
// check it against.
//
// THE RULE (07Q / 05A, verbatim):
// Effective AI/portal context = logged-in human clearance
//                                AND selected worker's approved permission
//                                AND task necessity.
// The narrowest of the three wins. A higher clearance never expands a
// worker's own source permission. A broader worker permission never
// expands what a lower-clearance human may see. Ruth cannot route around
// either boundary — routing an intent is not the same as retrieving the
// restricted evidence behind it.
//
// IMPLEMENTATION SHAPE
// Every piece of "deep company brain" data in deepBusinessFacts.js is
// tagged with a DOMAIN code (e.g. 'finance_full', 'job_margin',
// 'director_position'). Two independent whitelists gate a domain:
//   - PERSONA_DOMAINS[personaId]: what this logged-in human may see at all.
//   - WORKER_DOMAINS[workerId]: what this worker is allowed to read.
// isDomainVisible() requires both. There is no path that grants a domain
// from only one side — this is what "narrowest wins" means in code, and
// it is asserted directly in clearance.test.js rather than left as prose.
//
// WHAT THIS IS NOT
// This does not gate the six ACTIVE v0.1 workers' existing, already-active
// permissions (Commercial/Operations/Customers & Marketing/Company Brain/
// Governance/Receptionist keep behaving exactly as before for the
// enquiry/job data they already used). It adds a second, additional gate
// in front of the new deep-brain domains only, so nothing about the
// already-tested v0.1 behaviour changes underneath this.

// ------------------------------------------------------------
// Personas (07Q "ROLE-BASED DATA CLEARANCE EXPANSION")
// ------------------------------------------------------------
// Not real website logins. These sit INSIDE the existing Scott access gate
// (lib/scott/access.js) as a "view the demo as" selector — an invited demo
// viewer, once past that real login, picks which fictional staff member's
// clearance to see the same underlying company through, exactly as 07Q's
// "DEMO PRESENTATION REQUIREMENT" describes: the same records, rendered
// differently by login. This was a deliberate implementation choice: 07Q
// also lists real fictional portal accounts (scott.mercer, tony.marsh, ...)
// with their own passwords, but standing up eight further authenticated
// accounts would duplicate an access-control surface the demo does not
// need a second copy of — the real security boundary (is this person
// invited to see the Scott demo at all) is already enforced by
// requireScottPageAccess. This layer demonstrates the CLEARANCE behaviour
// that sits behind that boundary, which is what 07Q/05A/31 are actually
// about.
const PERSONAS = {
  scott_mercer: { code: 'A', name: 'Scott Mercer', role: 'Owner / Director' },
  tony_marsh: { code: 'B', name: 'Tony Marsh', role: 'Senior Management (Workshop & Operations)' },
  chloe_reed: { code: 'C', name: 'Chloe Reed', role: 'Office / Customer Admin' },
  leah_morgan: { code: 'D', name: 'Leah Morgan', role: 'Knitting Team Lead' },
  ellie_park: { code: 'E', name: 'Ellie Park', role: 'Workshop / Skilled Operative' },
  ravi_singh: { code: 'E', name: 'Ravi Singh', role: 'Workshop / Field Operative' },
  jo_bell: { code: 'F', name: 'Jo Bell', role: 'Knitting Operative' },
  mike_evans: { code: 'G', name: 'Mike Evans', role: 'Driver / Field Logistics' }
};

const DEFAULT_PERSONA = 'scott_mercer';

function isValidPersona(id) {
  return Object.prototype.hasOwnProperty.call(PERSONAS, id);
}

function getPersona(id) {
  return PERSONAS[id] || PERSONAS[DEFAULT_PERSONA];
}

// ------------------------------------------------------------
// Domain whitelists — what each persona may see at all.
// ------------------------------------------------------------
// '*' for Scott Mercer only, per 07Q Clearance A: "all fictional
// operational, commercial, customer, supplier, finance, payroll, HR,
// quality, marketing, corporate, director/shareholder, DLA, tax, debt,
// asset, premises, IT, insurance, continuity and management records."
// Even '*' explicitly excludes CREDENTIAL domains (see CREDENTIAL_DOMAINS
// below) — full business clearance is not the same as system-secret
// access, stated explicitly in 07Q ("does not receive passwords, API
// keys, MFA recovery codes").
const PERSONA_DOMAINS = {
  scott_mercer: ['*'],

  // Clearance B — 07Q: broad operations/people/quality/stock visibility,
  // job-level cost/margin, department budgets, operational KPI trend, and
  // "management-level financial summaries needed for operational
  // decisions" — explicitly NOT Scott's salary/dividends/DLA, full bank
  // detail, corporation-tax planning, individual salary history, or
  // private HR/medical material.
  tony_marsh: [
    // yarn_stock added: 07I's stock feed is entirely material/yarn-specific
    // ("STANDARD LIVE STOCK SNAPSHOT" covers navy/mustard/forest-green/
    // cream yarn), and a senior operations manager overseeing overall
    // stock position needs that, not just a separate generic 'stock_ops'
    // bucket that turned out to have no records in it. Found by the
    // deepBusinessFacts integration test, not assumed correct on paper.
    'dashboard', 'jobs_ops', 'stock_ops', 'yarn_stock', 'suppliers_ops', 'po_status',
    'quality_ops', 'complaints_ops', 'staffing_capacity', 'leave_training',
    'overtime_totals', 'job_margin', 'dept_budget', 'kpi_trend',
    'debtor_risk_flag', 'finance_summary_ops', 'assets_ops'
  ],

  // Clearance C — 07Q: leads/customers/quotes/bookings/complaints/reviews,
  // routine invoice/payment status, trade terms, debtor flags for account
  // handling, stock availability for customer answers, staff availability
  // for booking. Explicitly NOT full accounts, bank, director info, DLA,
  // salaries, confidential HR, detailed supplier cost/margin.
  chloe_reed: [
    'leads', 'customers_contact', 'quotes', 'bookings',
    'complaints_workflow', 'review_status', 'invoice_status', 'trade_terms',
    'debtor_flag', 'stock_availability', 'staff_availability_booking'
  ],

  // Clearance D — 07Q: team schedules/work, stock allocations, supplier
  // ops status, quality checks, training/leave for supervised staff,
  // productivity, rework, limited job-cost. Explicitly NOT bank, owner
  // remuneration, DLA, company-wide tax, confidential HR investigations,
  // unrelated employees, unrelated customer credit history, company-wide
  // profit.
  leah_morgan: [
    'team_schedule', 'team_work', 'stock_allocations', 'suppliers_ops',
    'quality_ops', 'training_supervised', 'leave_supervised',
    'productivity', 'rework_evidence', 'limited_job_cost'
  ],

  // Clearance E — 07Q: own/team schedules, assigned jobs, job specs,
  // materials, stock quantities/locations, collection/site info, quality
  // checklists, authorised equipment, technical notes, relevant
  // customer/job facts. Explicitly NOT financials, margins, salaries, HR,
  // marketing, unrelated customer histories, director info, management
  // approvals.
  ellie_park: [
    'own_schedule', 'assigned_jobs', 'job_specs', 'materials', 'stock_qty',
    'collection_site_info', 'quality_checklists', 'equipment_authorised',
    'technical_notes', 'relevant_customer_job_facts'
  ],
  ravi_singh: [
    'own_schedule', 'assigned_jobs', 'job_specs', 'materials', 'stock_qty',
    'collection_site_info', 'quality_checklists', 'equipment_authorised',
    'technical_notes', 'relevant_customer_job_facts'
  ],

  // Clearance F — 07Q: assigned knitting orders, yarn stock, dye/batch,
  // authorised patterns, due dates, relevant customer size/colour
  // requirements, quality checks, own training. Explicitly NOT repair-side
  // confidential data, financials, margin, salaries, other staff HR, broad
  // customer history, management approvals.
  jo_bell: [
    'assigned_knitting', 'yarn_stock', 'dye_batch', 'authorised_patterns',
    'due_dates', 'quality_checklists', 'own_training'
  ],

  // Clearance G — 07Q: today's/forward routes, customer name/address/
  // contact for the route, job ref, booked window, handling notes,
  // condition-photo workflow, vehicle status, route alerts. Explicitly NOT
  // customer lifetime value, debtor history (unless the route task itself
  // requires it), accounts, margins, salaries, HR, unrelated complaints,
  // marketing, director data.
  mike_evans: [
    'todays_routes', 'route_customer_contact', 'job_ref_route',
    'booked_window', 'handling_notes', 'condition_photo_workflow',
    'vehicle_status', 'route_alerts'
  ]
};

// Never visible to any persona, including Scott Mercer's '*'. 07Q: "Full
// clearance does not reveal passwords, API keys or recovery codes."
const CREDENTIAL_DOMAINS = new Set(['credentials', 'api_keys', 'mfa_recovery_codes', 'passwords']);

function personaDomains(personaId) {
  const persona = isValidPersona(personaId) ? personaId : DEFAULT_PERSONA;
  return PERSONA_DOMAINS[persona] || [];
}

function personaCanSeeDomain(personaId, domain) {
  if (CREDENTIAL_DOMAINS.has(domain)) return false;
  const domains = personaDomains(personaId);
  return domains.includes('*') || domains.includes(domain);
}

// ------------------------------------------------------------
// Worker domain permissions (05A V0.2 proposed expansion + existing v0.1
// worker specs). What each worker is allowed to READ, independent of who
// is asking. A worker's own permission never expands regardless of the
// asking human's clearance.
// ------------------------------------------------------------
const WORKER_DOMAINS = {
  // Existing active v0.1 workers, extended only where 05A explicitly
  // extends them (e.g. Commercial may read Finance cost/margin context;
  // Operations may read People capacity/stock/complaints evidence). Their
  // EXISTING v0.1 behaviour (businessFacts.js) is untouched by this file.
  // 05A's own text grants Commercial "07A Finance where cost/margin
  // context is necessary" but does not explicitly list debtor/account
  // status. debtor_flag is added here as a documented interpretation, not
  // a silent invention: 05A separately confirms Commercial owns quote/
  // discount decisions, and a credit-worthiness check is a precondition
  // for exactly that decision (07Q's own access-test-case 3 — "is this
  // customer safe to book again" — is a booking/commercial judgement, not
  // a Finance-ledger read). Flagging this as a gap the pending independent
  // Governance & Assurance review should confirm or correct, per doc 24's
  // review question 6 (whether the intersection rule is "consistently
  // defined across 07Q, 05A and 31") — it is not fully consistent here,
  // and this is the specific inconsistency.
  commercial: ['job_margin', 'finance_summary_ops', 'quotes', 'trade_terms', 'debtor_flag'],
  // job_margin / finance_summary_ops added here for the same documented
  // reason: 07Q's own access-test-case 4 frames "why did workshop margin
  // fall" as an operational question answered with "permitted operational
  // finance", and Tony's persona (senior management) already carries
  // job_margin/finance_summary_ops in PERSONA_DOMAINS above for exactly
  // this operational-KPI use. 05A's literal Operations text does not list
  // Finance explicitly; this is the same kind of interpretation gap noted
  // on Commercial/Customers & Marketing above, for the same independent
  // review to confirm.
  operations: [
    'job_margin', 'finance_summary_ops',
    'jobs_ops', 'stock_ops', 'stock_allocations', 'stock_qty', 'suppliers_ops',
    'po_status', 'quality_ops', 'quality_checklists', 'complaints_ops',
    'staffing_capacity', 'leave_training', 'leave_supervised',
    'assigned_jobs', 'job_specs', 'materials', 'collection_site_info',
    'own_schedule', 'team_schedule', 'team_work', 'todays_routes',
    'route_customer_contact', 'job_ref_route', 'booked_window',
    'handling_notes', 'condition_photo_workflow', 'vehicle_status',
    'route_alerts', 'assets_ops', 'assigned_knitting', 'yarn_stock',
    'dye_batch', 'authorised_patterns', 'due_dates'
  ],
  // debtor_flag added for the same reason as Commercial above: Chloe's own
  // front-line worker for a booking decision is Customers & Marketing
  // (07Q access-test-case 3 is specifically her asking whether to book a
  // customer again), and that decision needs the account-status flag, not
  // the underlying ledger.
  customers_marketing: [
    'leads', 'customers_contact', 'quotes', 'bookings',
    'complaints_workflow', 'review_status', 'relevant_customer_job_facts',
    'debtor_flag'
  ],
  company_brain: ['*'], // may READ broadly for record-control (05A), still gated by persona clearance below
  governance: ['*'], // may read all authorities/permission records for audit (05A), still gated by persona clearance below
  receptionist: [], // routes only; must not itself retrieve restricted evidence (05A)

  // Proposed, dormant v0.2 workers (see workers.js ACTIVE_WORKER_IDS).
  // Their domain permissions are recorded now so the code is complete and
  // ready, exactly as the brief requires, but ROUTABLE_WORKER_IDS in
  // workers.js never includes them, so Ruth cannot route a live user turn
  // to them regardless of what this map says.
  finance_accounts: [
    'finance_full', 'director_position', 'trade_terms', 'debtor_flag',
    'job_margin', 'affordability', 'staffing_capacity'
  ],
  people_hr: [
    'hr_full', 'staffing_capacity', 'leave_training', 'training_supervised',
    'finance_summary_ops'
  ],
  quality_control: [
    'quality_full', 'jobs_ops', 'complaints_ops', 'training_supervised',
    'stock_ops', 'suppliers_ops'
  ]
};

function workerDomains(workerId) {
  return WORKER_DOMAINS[workerId] || [];
}

function workerCanReadDomain(workerId, domain) {
  if (CREDENTIAL_DOMAINS.has(domain)) return false;
  const domains = workerDomains(workerId);
  return domains.includes('*') || domains.includes(domain);
}

// ------------------------------------------------------------
// THE INTERSECTION — the actual rule, as one function.
// ------------------------------------------------------------
// Returns true only if BOTH the logged-in persona and the selected worker
// are independently allowed to see this domain. Task-necessity (the third
// leg of the rule) is applied by the caller: this function answers "is it
// even possible", the caller still decides whether the specific field is
// needed for the specific question rather than dumping every permitted
// domain into every answer.
function isDomainVisible(personaId, workerId, domain) {
  return personaCanSeeDomain(personaId, domain) && workerCanReadDomain(workerId, domain);
}

// Filters a list of {domain, ...} records down to what this persona+worker
// pair may see. Used by dashboard cards, search results and AI context
// assembly alike, so the same rule enforces all three surfaces from one
// place rather than three separately-maintained checks.
function filterByClearance(personaId, workerId, records) {
  return records.filter((r) => isDomainVisible(personaId, workerId, r.domain));
}

// The required response shape (07Q/31) when a question crosses a clearance
// boundary: state that more exists without revealing it, never pretend the
// company holds nothing. Callers use this exact wording so the behaviour
// is consistent and testable rather than left to each call site to phrase
// itself.
function clearanceDeniedNote(domain) {
  return `That information exists in the company's records but is outside your current clearance to view. Ask an appropriately cleared colleague or Scott Mercer if you need it.`;
}

// ------------------------------------------------------------
// EFFECTIVE PERSONA RESOLUTION — server-side, bound to the authenticated
// identity. This is the security boundary, so read it carefully.
// ------------------------------------------------------------
// Corrected 29/08/2026. The first implementation used a free "view as"
// dropdown any viewer could change, which meant a fictional staff
// member's clearance was a client-driven preference rather than a
// property of who they actually are. 07Q is explicit that this is wrong:
// "individual accounts only, no shared staff login" and "attempting to
// bypass a restriction through Company Brain, search, another worker or
// prompt wording does not change clearance". A selector anyone can move
// is exactly such a bypass.
//
// Three identity cases, resolved in this fixed order:
//
//   1. A logged-in FICTIONAL STAFF account (req.session.scottPortalUser,
//      authenticated against scott_portal_users). Their persona is
//      whatever their row says. They cannot change it and cannot
//      impersonate. This is the ordinary demonstration path.
//
//   2. A real site ADMIN/CONTENT user (Tom, nat) who has explicitly
//      entered demonstration mode. Only these roles may impersonate, and
//      only via setImpersonatedPersona() below which re-checks the role
//      itself rather than trusting the caller to have checked.
//
//   3. A real site admin/content user with no impersonation set: the
//      owner view (Scott Mercer, full clearance), matching the fact that
//      an invited demo viewer with real site access is looking at the
//      whole fictional company.
//
// Anything else (no session, an unrecognised shape) falls to the most
// restrictive real persona rather than the default owner view.
const PORTAL_USER_SESSION_KEY = 'scottPortalUser';
const IMPERSONATION_SESSION_KEY = 'scottImpersonatedPersonaId';

// Real site roles permitted to impersonate a fictional staff clearance.
// Deliberately NOT 'client': a client-role site account invited to view
// the demo is an ordinary viewer, not a demonstrator.
const IMPERSONATION_ROLES = ['admin', 'content'];

function canImpersonate(req) {
  const role = req.session && req.session.user && req.session.user.role;
  return IMPERSONATION_ROLES.includes(role);
}

function getPortalUser(req) {
  const u = req.session && req.session[PORTAL_USER_SESSION_KEY];
  if (!u || !isValidPersona(u.personaId)) return null;
  return u;
}

// The one function every gate must use. Never read a persona id straight
// out of the session anywhere else.
function getEffectivePersonaId(req) {
  const portalUser = getPortalUser(req);
  if (portalUser) return portalUser.personaId; // case 1: bound, unchangeable

  if (canImpersonate(req)) {
    const impersonated = req.session[IMPERSONATION_SESSION_KEY];
    if (isValidPersona(impersonated)) return impersonated; // case 2
    return DEFAULT_PERSONA; // case 3: owner view
  }

  // No fictional login and not an impersonation-capable site role.
  // Fail closed to the narrowest real persona rather than the owner.
  return 'mike_evans';
}

// True when the current view is an admin impersonating someone. Used only
// to render the "you are viewing as X" banner; never to widen access.
function isImpersonating(req) {
  return !getPortalUser(req) && canImpersonate(req) && isValidPersona(req.session[IMPERSONATION_SESSION_KEY]);
}

// Tom-only. Returns false (session untouched) if the caller is not an
// impersonation-capable real site role, or the persona id is invalid.
// A logged-in FICTIONAL user can never reach a true return here, even if
// they somehow post to the endpoint: getPortalUser(req) short-circuits
// first, so their own account can never gain a second identity.
function setImpersonatedPersona(req, id) {
  if (getPortalUser(req)) return false; // fictional staff may never impersonate
  if (!canImpersonate(req)) return false;
  if (id === null || id === '') {
    delete req.session[IMPERSONATION_SESSION_KEY];
    return true;
  }
  if (!isValidPersona(id)) return false;
  req.session[IMPERSONATION_SESSION_KEY] = id;
  return true;
}

function setPortalUser(req, { id, username, personaId, displayName, jobTitle }) {
  if (!isValidPersona(personaId)) return false;
  req.session[PORTAL_USER_SESSION_KEY] = { id, username, personaId, displayName, jobTitle };
  // Entering a fictional staff session clears any impersonation left over
  // from an earlier admin view in the same browser session.
  delete req.session[IMPERSONATION_SESSION_KEY];
  return true;
}

function clearPortalUser(req) {
  delete req.session[PORTAL_USER_SESSION_KEY];
}

// Kept as a thin alias so existing callers (and tests written against the
// earlier shape) keep working, but now resolving through the identity
// rules above rather than a settable preference.
function getSessionPersonaId(req) {
  return getEffectivePersonaId(req);
}

module.exports = {
  PERSONAS,
  DEFAULT_PERSONA,
  PERSONA_DOMAINS,
  WORKER_DOMAINS,
  CREDENTIAL_DOMAINS,
  isValidPersona,
  getPersona,
  personaDomains,
  personaCanSeeDomain,
  workerDomains,
  workerCanReadDomain,
  isDomainVisible,
  filterByClearance,
  clearanceDeniedNote,
  getSessionPersonaId,
  getEffectivePersonaId,
  getPortalUser,
  setPortalUser,
  clearPortalUser,
  canImpersonate,
  isImpersonating,
  setImpersonatedPersona,
  IMPERSONATION_ROLES
};
