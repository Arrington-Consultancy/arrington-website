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
// Each persona corresponds to a GENUINE authenticated fictional staff
// account in the scott_portal_users table (seeded by db/seed.js), not a
// view-as preference. A staff member logs in with their own password and
// their clearance is bound to their row server-side; they cannot change
// it and cannot impersonate anyone. See the EFFECTIVE PERSONA RESOLUTION
// block further down for the three identity cases and why an anonymous or
// unrecognised session fails closed to the narrowest persona rather than
// the owner view.
//
// A first implementation of this used a free dropdown any viewer could
// change. That was wrong on 07Q's own terms ("individual accounts only,
// no shared staff login", and "attempting to bypass a restriction through
// Company Brain, search, another worker or prompt wording does not change
// clearance") and was replaced on 29/08/2026.
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
    'debtor_risk_flag', 'finance_summary_ops', 'assets_ops',
    // vehicle_status added 29/08/2026, same class of gap as yarn_stock
    // above and found the same way, by looking at the rendered page. 07L
    // makes the van an Operations decision in its own words: "if van
    // downtime exceeds one working day, Operations must review booked
    // collection/return promises and compare short-term hire cost with
    // rescheduling impact". Tony is also a named authorised driver. He
    // was being shown the hire contingency and the rule requiring him to
    // act on it, while the van's actual status was hidden from him.
    'vehicle_status',
    // 07C/07D/07G added 29/08/2026: a workshop/operations manager needs
    // the pipeline he is being asked to schedule, the complaints that
    // reach his workshop, and the customer/trade context behind a job.
    'leads', 'quotes', 'customers_contact', 'complaints_workflow', 'trade_terms',
    // 07E added 29/08/2026. Deliberately given to Tony and NOT to Chloe:
    // 07Q Clearance C covers reviews and customer handling, which is
    // 'review_status', but not what the company pays to acquire a lead.
    // She drafts a reply to a bad review without being shown the cost
    // per qualified lead or the campaign spend behind it.
    'marketing_performance', 'safety_baseline',
    // Found by replaying 21B's 140 clearance cases against the build
    // rather than by reading the permission map. Both were ALLOW in the
    // source document and DENY here:
    //   AC-058 "what failed on SAKS-1038, what rework is needed, and
    //   what is the cost impact" is ALLOW for senior management. He held
    //   quality_ops but the quality queue itself is quality_full, so the
    //   operations manager could not see the queue he is responsible for.
    //   AC-065 "show today's customer addresses and handling notes for
    //   Mike's route" is ALLOW as operational route management. He was
    //   managing a route whose customer details were hidden from him.
    'quality_full', 'route_customer_contact',
    // 07K: the incident log names individuals, so it is narrower than the
    // safety rules themselves, which everyone sees.
    'safety_incidents',
    // 07R: the working picture of the building. Tony opens and closes it.
    'premises_ops', 'premises_access',
    // 07J: Operations makes the date promises these terms constrain.
    'customer_terms',
    // 07O: Operations runs the disruption response.
    'continuity',
    // 07P: the consent register behind any marketing suggestion.
    'marketing_consent'
  ],

  // Clearance C — 07Q: leads/customers/quotes/bookings/complaints/reviews,
  // routine invoice/payment status, trade terms, debtor flags for account
  // handling, stock availability for customer answers, staff availability
  // for booking. Explicitly NOT full accounts, bank, director info, DLA,
  // salaries, confidential HR, detailed supplier cost/margin.
  chloe_reed: [
    'leads', 'customers_contact', 'quotes', 'bookings',
    'complaints_workflow', 'review_status', 'invoice_status', 'trade_terms',
    'debtor_flag', 'stock_availability', 'staff_availability_booking',
    // 07J: her daily reference when a customer asks what they owe,
    // whether they can cancel, or whether a fault is still covered.
    'customer_terms',
    // 21B AC-066: "show today's customer addresses, phone numbers and
    // handling notes for Mike's route" is ALLOW for booking and
    // collection administration. She books the collections and could not
    // see the details of the ones she had booked.
    'route_customer_contact',
    // 07O: she does the customer communication during a disruption.
    'continuity',
    // 07P: she records customer permissions in the first place.
    'marketing_consent',
    // 07K privacy and retention: Chloe handles customer records daily and
    // answers correction and deletion requests, so this is hers.
    'compliance_privacy',
    // 07R: Chloe runs the monthly welfare-consumables check and is a
    // keyholder, so both the building picture and the key register.
    'premises_ops', 'premises_access', 'safety_baseline'
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
    'productivity', 'rework_evidence', 'limited_job_cost', 'safety_baseline',
    // 21B AC-053: "how much cream and navy yarn is free, what is inbound,
    // and which knitting work is exposed" is ALLOW for the knitting team
    // lead, covering knitting stock, allocation and supplier operational
    // status. She held stock_allocations but not yarn_stock, so the
    // person running knitting could not see the yarn. Same shape as the
    // gap found for Jo earlier in this build, one role along.
    'yarn_stock'
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
    'technical_notes', 'relevant_customer_job_facts', 'safety_baseline'
  ],
  ravi_singh: [
    'own_schedule', 'assigned_jobs', 'job_specs', 'materials', 'stock_qty',
    'collection_site_info', 'quality_checklists', 'equipment_authorised',
    'technical_notes', 'relevant_customer_job_facts', 'safety_baseline'
  ],

  // Clearance F — 07Q: assigned knitting orders, yarn stock, dye/batch,
  // authorised patterns, due dates, relevant customer size/colour
  // requirements, quality checks, own training. Explicitly NOT repair-side
  // confidential data, financials, margin, salaries, other staff HR, broad
  // customer history, management approvals.
  jo_bell: [
    'assigned_knitting', 'yarn_stock', 'dye_batch', 'authorised_patterns',
    'due_dates', 'quality_checklists', 'own_training', 'safety_baseline'
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
    'vehicle_status', 'route_alerts', 'safety_baseline'
  ]
};

// Never visible to any persona, including Scott Mercer's '*'. 07Q: "Full
// clearance does not reveal passwords, API keys or recovery codes."
// safety_baseline is granted to EVERY persona, deliberately, and is the
// one domain in this model that works that way. 07K says a staff member
// who believes there is an immediate serious safety risk must stop and
// escalate, which is not a rule you can follow if your clearance hides it
// from you. A knitting operative and the owner see identical safety
// rules. Everything else in the company is need-to-know; this is not.
//
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
  commercial: ['job_margin', 'finance_summary_ops', 'quotes', 'trade_terms', 'debtor_flag', 'leads', 'customers_contact', 'marketing_performance'],
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
    // safety_baseline: Operations owns the workshop process and is the
    // worker a safety question actually reaches. Granted deliberately.
    'safety_baseline',
    'job_margin', 'finance_summary_ops',
    'jobs_ops', 'stock_ops', 'stock_allocations', 'stock_qty', 'suppliers_ops',
    'po_status', 'quality_ops', 'quality_checklists', 'complaints_ops',
    'staffing_capacity', 'leave_training', 'leave_supervised',
    'assigned_jobs', 'job_specs', 'materials', 'collection_site_info',
    'own_schedule', 'team_schedule', 'team_work', 'todays_routes',
    'route_customer_contact', 'job_ref_route', 'booked_window',
    'handling_notes', 'condition_photo_workflow', 'vehicle_status',
    'route_alerts', 'assets_ops', 'assigned_knitting', 'yarn_stock',
    'dye_batch', 'authorised_patterns', 'due_dates',
    'leads', 'complaints_workflow', 'customers_contact'
  ],
  // debtor_flag added for the same reason as Commercial above: Chloe's own
  // front-line worker for a booking decision is Customers & Marketing
  // (07Q access-test-case 3 is specifically her asking whether to book a
  // customer again), and that decision needs the account-status flag, not
  // the underlying ledger.
  customers_marketing: [
    'marketing_performance',
    // 07P: this worker proposes the content, so it must be able to check
    // the permission before suggesting an asset. Without this it would
    // recommend a prohibited image in perfectly good faith.
    'marketing_consent',
    'leads', 'customers_contact', 'quotes', 'bookings',
    'complaints_workflow', 'review_status', 'relevant_customer_job_facts',
    'debtor_flag', 'trade_terms'
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
  quality_control: ['safety_baseline', 
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

// ------------------------------------------------------------
// PER-FIELD CLEARANCE
// ------------------------------------------------------------
// A record carries one `domain`, but a single field on it can carry a fact
// that belongs to a different, narrower one. A pipeline enquiry is `leads`
// data, yet its detail line may explain that the customer is 36 days
// overdue, which is `debtor_flag`. A yarn stock line is `yarn_stock`, yet
// naming the purchase order it is arriving on is `po_status`. Filtering
// whole records by their single tag lets those through, because the record
// really is a leads record and the reader really can see leads.
//
// Both cases were found by an automated canary sweep over the rendered
// portal on 29/08/2026, not by reading the views: a record-level tag looks
// completely correct right up until you check the prose inside it.
//
// So a record may additionally declare `fieldDomains`, mapping a field
// name to the domain that field actually belongs to. A field is shown only
// when the reader can see the record's domain AND the field's own domain.
// Narrowest wins, exactly as the intersection rule requires.
//
// `workerId` may be null for a raw portal view, where no worker mediates
// the read (see the note above getSessionPersonaId); pass a worker when
// assembling AI context so its permissions apply too.
function canSeeField(personaId, workerId, record, field) {
  if (!record) return false;
  const gate = workerId
    ? (d) => isDomainVisible(personaId, workerId, d)
    : (d) => personaCanSeeDomain(personaId, d);
  if (record.domain && !gate(record.domain)) return false;
  const fieldDomain = record.fieldDomains && record.fieldDomains[field];
  if (fieldDomain && !gate(fieldDomain)) return false;
  return true;
}

// Convenience for render paths: the field's value, or undefined when the
// reader is not cleared for it. Views test the result rather than reaching
// into the record directly, so a template cannot print a restricted field
// by forgetting a guard.
function fieldValue(personaId, workerId, record, field) {
  return canSeeField(personaId, workerId, record, field) ? record[field] : undefined;
}

// Strips every field a reader may not see from a record before it is
// handed to anything that serialises it wholesale (AI context, search
// snippets, JSON APIs). Without this, a record that passed the
// record-level filter would still carry its restricted fields into the
// payload, which is the same leak one level further out.
function redactRecord(personaId, workerId, record) {
  if (!record || !record.fieldDomains) return record;
  const out = {};
  Object.keys(record).forEach((k) => {
    if (k === 'fieldDomains') return;
    if (canSeeField(personaId, workerId, record, k)) out[k] = record[k];
  });
  return out;
}

// filterByClearance plus redaction: the form every serialising caller
// should use.
// A null workerId means "a human is reading this directly": a portal page
// or the Company Brain search, with no worker mediating the read. That is
// the persona's clearance alone, matching canSeeField above.
// filterByClearance is NOT used here, because it routes through
// isDomainVisible and workerCanReadDomain(null, ...) is false for every
// domain, so a null worker would silently return nothing at all rather
// than the reader's own permitted set.
function filterAndRedact(personaId, workerId, records) {
  const visible = workerId
    ? filterByClearance(personaId, workerId, records)
    : records.filter((r) => personaCanSeeDomain(personaId, r.domain));
  return visible.map((r) => redactRecord(personaId, workerId, r));
}

// The required response shape (07Q/31) when a question crosses a clearance
// boundary: state that more exists without revealing it, never pretend the
// company holds nothing. Callers use this exact wording so the behaviour
// is consistent and testable rather than left to each call site to phrase
// itself.
// Human-readable names for the domains that actually carry deep-brain
// records, used by the Company Brain page. Deliberately covers only those
// domains rather than every domain a persona can hold: the page is a map
// of the record set, and listing sixty abstract permission names that
// correspond to no stored record would be noise, not transparency.
//
// A domain missing from here still gates data correctly; it just has no
// friendly name, so the raw domain is shown. The Company Brain test
// asserts this map stays complete for every domain in the dataset.
const DOMAIN_LABELS = {
  jobs_ops: 'Jobs and work in progress',
  job_margin: 'Job margin and contribution',
  complaints_workflow: 'Complaints, remedies and root causes',
  customers_contact: 'Customer records and history',
  trade_terms: 'Trade account terms and credit limits',
  debtor_flag: 'Overdue accounts and credit risk',
  leads: 'Enquiries and pipeline',
  quotes: 'Quotes issued and declined',
  staffing_capacity: 'Team, training and capacity',
  hr_full: 'HR cases and individual staff matters',
  po_status: 'Purchase orders',
  suppliers_ops: 'Suppliers and terms',
  yarn_stock: 'Yarn stock',
  stock_ops: 'Stock position and allocation',
  quality_full: 'Quality queue, defects and rework',
  quality_ops: 'Quality checks in the workshop',
  finance_full: 'Full financial position',
  finance_summary_ops: 'Operational cost summary',
  director_position: 'Director, ownership and corporate position',
  kpi_trend: 'Trends and performance measures',
  safety_baseline: 'Safety rules and incident procedure',
  premises_ops: 'Premises, facilities and utilities',
  customer_terms: 'Payment terms, warranty and customer commitments',
  continuity: 'Business continuity and disruption plan',
  marketing_consent: 'Marketing assets and customer permissions',
  premises_access: 'Keys and building access',
  safety_incidents: 'Recorded safety incidents',
  compliance_privacy: 'Privacy, retention and data requests',
  marketing_performance: 'Marketing, advertising and channel performance',
  review_status: 'Google reviews and reputation',
  dept_budget: 'Departmental budgets'
};

function domainLabel(domain) {
  return DOMAIN_LABELS[domain] || domain;
}

function clearanceDeniedNote(domain) {
  return `That information exists in the company's records but is outside your current clearance to view. Ask an appropriately cleared colleague or Scott Mercer if you need it.`;
}

// ------------------------------------------------------------
// ACTION AUTHORITY (server-side, for every mutating endpoint)
// ------------------------------------------------------------
// Every Scott write endpoint was gated only by requireScottApiAccess,
// which asks one question: is this person invited to the demonstration at
// all. Nothing asked whether THIS person may perform THIS action, so a
// knitting operative could approve a customer-facing reply, reassign an
// enquiry or change a job's status by posting directly to the API. The
// controls were only ever absent from her screen.
//
// The rule here is deliberately derived rather than invented: THE RIGHT
// TO ACT ON A RECORD REQUIRES THE CLEARANCE TO SEE IT. That needs no new
// authority table to drift out of step with 07Q, and it produces
// defensible answers: changing a job's status needs jobs_ops, assigning
// an enquiry needs leads, deciding a customer reply needs the clearance
// to read what the reply is about.
//
// Where a source document names an owner-only threshold (07J: goodwill
// above GBP 75 or a refund above 20 per cent needs Scott Mercer), that is
// a separate, narrower check at the call site, not a widening of this.
const ACTION_DOMAINS = {
  // Changing the state of a job.
  job_status: 'jobs_ops',
  // Routing an enquiry to a worker.
  enquiry_assign: 'leads',
  // Deciding, editing or redrafting a proposed writeback. A customer
  // reply draft is about a lead or a complaint; anything else is a
  // management decision.
  writeback_customer_reply: 'leads',
  writeback_other: 'dashboard',
  // Drafting a social post and sending it to the approval queue. Scoped
  // to review_status, the drafting domain, rather than to
  // marketing_performance, which is the spend and results side: the
  // person who writes the copy is not necessarily the person who may see
  // what the campaign cost. Composing still executes nothing - it
  // produces a record for a human to approve, which is the only
  // authorised route for anything resembling publishing.
  social_post: 'review_status'
};

// Resolving a Brain Gap is authorised against the gap's OWN domain rather
// than a fixed one, because a gap can be about anything: the person
// closing "the cream yarn count is wrong" needs yarn clearance, and the
// person closing "the August margin contradicts the ledger" needs the
// finance one. Same derived rule as everywhere else, acting on a record
// requires the clearance to see it, just applied per row.
//
// It takes the record rather than a bare domain so a caller cannot
// accidentally pass the string it wishes were true; the row it is about
// to update is the only thing that decides.
function personaCanResolveGap(personaId, gapRow) {
  if (!gapRow) return false;
  const domain = gapRow.domain || gapRow.gapDomain;
  // A gap whose domain was never resolved is owned by nobody, so only
  // full clearance can close it. Failing open here would make an
  // unclassified gap the easiest thing in the system to clear.
  if (!domain) return personaCanSeeDomain(personaId, 'finance_full');
  return personaCanSeeDomain(personaId, domain);
}

// True when this persona may perform the named action.
function personaCanAct(personaId, action) {
  const domain = ACTION_DOMAINS[action];
  if (!domain) return false;
  return personaCanSeeDomain(personaId, domain);
}

// The wording a refused action returns. Deliberately says the action is
// outside the person's authority rather than that the record does not
// exist: hiding the existence of a job from someone who works on it would
// be a different and worse lie.
function actionDeniedNote(action) {
  return 'That action is outside your current clearance. Ask an appropriately cleared colleague or Scott Mercer.';
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
  ACTION_DOMAINS,
  personaCanAct,
  personaCanResolveGap,
  actionDeniedNote,
  workerDomains,
  workerCanReadDomain,
  isDomainVisible,
  filterByClearance,
  canSeeField,
  fieldValue,
  redactRecord,
  filterAndRedact,
  clearanceDeniedNote,
  DOMAIN_LABELS,
  domainLabel,
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
