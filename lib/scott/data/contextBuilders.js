// Scott AI Demonstration — per-worker authorised data slices.
//
// This is where "structural isolation" actually gets enforced for the
// fictional dataset, not just for the static business facts. The code here
// decides, from the user's message, which records are relevant (a job ref,
// a customer name, a general status question) and fetches ONLY that slice
// for the worker being called. A worker's model call never receives the
// whole dataset and never runs its own retrieval — retrieval is
// deterministic SQL in lib/scott/data/repository.js, cited by row so every
// claim traces back to something real in the isolated demo database.

const repo = require('./repository');
const db = require('../../../db/pool');
const clearance = require('../clearance');
const deepFacts = require('../deepBusinessFacts');
const financeState = require('../finance/state');

const JOB_REF_PATTERN = /\bSAKS-\d{3,6}\b/i;

// Every deep-brain record array/object that carries a `domain` field (see
// deepBusinessFacts.js). Flattened once here so filtering is one pass
// rather than one per array.
// Derived from the module's own exports rather than a hand-kept list.
// The hand-kept version named ten of the collections and silently omitted
// the ten added later, so half the company brain was invisible to every
// worker while looking, in the code, entirely deliberate. Deriving it
// means adding a domain-tagged collection to deepBusinessFacts.js is
// enough: it reaches the workers, still gated by the same clearance
// filter, with nothing to remember here.
//
// An export with no `domain` tag is skipped, not guessed at. That is the
// safe direction (untagged data never enters a prompt), but it is silent,
// so untaggedDeepFactExports() below names them and a test asserts the
// list stays empty.
function partitionDeepFacts() {
  const tagged = [];
  const untagged = [];
  Object.keys(deepFacts).forEach((key) => {
    const value = deepFacts[key];
    if (Array.isArray(value)) {
      value.forEach((r) => {
        if (r && typeof r === 'object') (r.domain ? tagged : untagged).push(r.domain ? r : key);
      });
    } else if (value && typeof value === 'object') {
      (value.domain ? tagged : untagged).push(value.domain ? value : key);
    }
  });
  return { tagged, untagged: [...new Set(untagged)] };
}

// ------------------------------------------------------------
// APPROVED ADDITIONS TO THE BRAIN
// ------------------------------------------------------------
// Facts a human has approved out of the proposal queue (see
// lib/scott/brainCandidates.js) live in the database, but the brain is read
// synchronously all over this file and in routes/scott.js, so they are held
// in memory and refreshed on write. Same pattern, and the same reasoning,
// as middleware/permissions.js caching the permissions matrix at startup.
//
// They join the SAME list the static records are in, deliberately. An
// approved fact carries a `domain` like every other record, so it is
// filtered by clearance.filterAndRedact on exactly the same rule, and
// nothing downstream needs to know it arrived by a different route. A
// second list would have meant a second access model, and a second access
// model is how a finance figure eventually reaches the driver.
//
// Empty until loadApprovedFacts() runs, which is the safe direction: the
// worst case is a worker not yet seeing an approved addition, never an
// unapproved proposal being treated as fact.
let approvedFactCache = [];

async function loadApprovedFacts() {
  const repo = require('./repository');
  const brainCandidates = require('../brainCandidates');
  const rows = await repo.getApprovedBrainFacts();
  approvedFactCache = rows.map(brainCandidates.toBrainRecord).filter(Boolean);
  return approvedFactCache.length;
}

function approvedFactCount() {
  return approvedFactCache.length;
}

// Test seam, and the only other way this cache can be set. Named so that a
// reader can see at a glance that nothing else in the codebase writes it.
function setApprovedFactsForTest(records) {
  approvedFactCache = Array.isArray(records) ? records.filter((r) => r && r.domain) : [];
}

// The whole company brain, from all three of its sources: the static
// controlled records, the facts a human has approved out of the proposal
// queue, and the live financial position computed from the posted ledger.
// One list, one clearance filter, no downstream code that needs to know
// which source a record came from.
//
// FINANCE_SUMMARY is substituted rather than appended to. Its cash, debtor
// and creditor sections were the opening position the ledger was built
// from, so once the ledger is live they are a superseded copy of three
// numbers that now move. Handing a worker both would guarantee it
// eventually quotes the stale one. Matched by object identity, not by
// name, so renaming the export cannot silently stop the substitution.
function allDeepFactRecords() {
  const tagged = partitionDeepFacts().tagged.map(
    (r) => (r === deepFacts.FINANCE_SUMMARY ? financeState.financeSummaryForBrain(r) : r)
  );
  return tagged.concat(approvedFactCache, financeState.financeBrainRecords());
}

// Names any exported record that carries no domain tag, so the omission is
// visible in a test rather than only in the absence of an answer.
function untaggedDeepFactExports() {
  return partitionDeepFacts().untagged;
}

// Renders the intersection of what this persona and this worker are both
// allowed to see (lib/scott/clearance.js) as one labelled block for the
// worker's system prompt. Empty string, not an empty section, if nothing
// in the deep-brain data is visible to this pair — most of the six ACTIVE
// v0.1 workers grant few or none of these domains (see WORKER_DOMAINS in
// clearance.js), so this is a no-op for them, not a bug.
function formatDeepFactsBlock(personaId, workerId) {
  // filterAndRedact, not filterByClearance: a record can pass the
  // record-level check and still carry a field belonging to a narrower
  // domain (a stock line naming its purchase order, an enquiry explaining
  // the customer is overdue). Filtering alone would put those straight
  // into the prompt for anyone cleared for the surrounding record. See the
  // per-field clearance block in lib/scott/clearance.js.
  const visible = clearance.filterAndRedact(personaId, workerId, allDeepFactRecords());
  if (!visible.length) return '';
  const lines = visible.map((r) => {
    const { domain, ...rest } = r;
    const summary = Object.entries(rest)
      .filter(([, v]) => v !== undefined && v !== null && typeof v !== 'object')
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    // An estimate the company has already given is marked in the line
    // itself, not left as one key among a dozen. Two things depend on the
    // worker noticing it: it must reuse this number rather than reasoning
    // out a second one, and it must not quote it back as a filed record.
    const mark = r.estimated === true ? ' [ESTIMATE ALREADY GIVEN, reuse this figure and keep calling it an estimate]' : '';
    return `- [${domain}]${mark} ${summary}`;
  });
  return `DEEP COMPANY BRAIN, filtered to what BOTH the logged-in human's clearance and your own worker permission allow (07Q/05A intersection rule, never expand beyond this list even if asked)\n${lines.join('\n')}`;
}

// ------------------------------------------------------------
// CLEARANCE ON THE SQL-DERIVED PATHS
// ------------------------------------------------------------
// formatDeepFactsBlock gates the static company brain. Everything else
// buildContext assembles comes out of SQL and, until this block existed,
// went into the prompt ungated: the job row with its price, the customer
// history with its notes, open enquiries with their full message text,
// the dashboard counts, the activity feed, the pending approvals and the
// results of a free-text search. A knitting operative asking about a job
// received the job's price in the worker's context.
//
// The rule is the same one everything else uses, so there is no second
// access-control model to keep in step: persona AND worker, narrowest
// wins, via clearance.isDomainVisible.
//
// Each SQL shape maps to the domain the data actually belongs to. Where a
// row carries a field from a narrower domain than the row itself (a job
// is jobs_ops, its price is job_margin) the field is dropped separately,
// which is the same per-field rule already applied to the static records.
const CONTEXT_DOMAINS = {
  job: 'jobs_ops',
  jobPrice: 'job_margin',
  jobRisk: 'jobs_ops',
  customer: 'customers_contact',
  customerNotes: 'customers_contact',
  enquiry: 'leads',
  activity: 'dashboard',
  summary: 'dashboard',
  approvals: 'dashboard'
};

function visible(personaId, workerId, domain) {
  return clearance.isDomainVisible(personaId || clearance.DEFAULT_PERSONA, workerId, domain);
}

async function extractEntities(message) {
  const text = String(message || '');
  const entities = { jobRef: null, job: null, customer: null };

  const refMatch = text.match(JOB_REF_PATTERN);
  if (refMatch) {
    const ref = refMatch[0].toUpperCase();
    entities.jobRef = ref;
    entities.job = await repo.getJobByRef(ref);
  }

  // Cheap, deterministic name matching — check every known customer's name
  // (and surname) for inclusion in the message. Fine at this dataset size;
  // would need a real search index well before it would need to change.
  const { rows: customers } = await db.query('SELECT * FROM scott_customers');
  const lower = text.toLowerCase();
  const matched = customers.find((c) => {
    const parts = c.name.toLowerCase().split(/\s+/).filter((p) => p.length > 2 && p !== 'mrs' && p !== 'mr' && p !== 'the');
    return parts.some((p) => lower.includes(p));
  });
  if (matched) {
    entities.customer = await repo.getCustomerHistory(matched.id);
  }

  return entities;
}

// Every formatter below takes the persona and worker so the gate is
// applied where the string is built, not left to the caller to remember.
// A formatter that is handed a record its reader may not see returns an
// empty string, and an empty block is dropped from the prompt entirely.

function formatJob(job, personaId, workerId) {
  if (!job) return '';
  if (!visible(personaId, workerId, CONTEXT_DOMAINS.job)) return '';
  const showPrice = visible(personaId, workerId, CONTEXT_DOMAINS.jobPrice);
  const price = job.price_pence != null ? `£${(job.price_pence / 100).toFixed(2)}` : 'not yet quoted';
  return [
    `Job ${job.ref} (source: scott_jobs row ${job.id}, last updated ${new Date(job.updated_at).toISOString().slice(0, 10)})`,
    `- Customer: ${job.customer_name || 'unknown'}${job.customer_location ? ` (${job.customer_location})` : ''}`,
    // The price is job_margin, not jobs_ops. A workshop operative sees the
    // job they are working on without seeing what it earns.
    showPrice ? `- Kind: ${job.kind}. Status: ${job.status}. Price: ${price}.` : `- Kind: ${job.kind}. Status: ${job.status}.`,
    job.promised_date ? `- Promised date: ${new Date(job.promised_date).toISOString().slice(0, 10)}.` : '- No promised date on file.',
    job.collection_date ? `- Collection date: ${new Date(job.collection_date).toISOString().slice(0, 10)}.` : '',
    job.at_risk ? `- AT RISK: ${job.risk_note}` : '- Not currently flagged at risk.',
    job.description ? `- Description: ${job.description}` : ''
  ].filter(Boolean).join('\n');
}

function formatJobsList(jobs, heading, personaId, workerId) {
  if (!visible(personaId, workerId, CONTEXT_DOMAINS.job)) return '';
  if (!jobs || jobs.length === 0) return `${heading}: none.`;
  return `${heading} (source: scott_jobs):\n` + jobs.map((j) => `- ${j.ref}, ${j.customer_name || 'unknown customer'}, ${j.status}${j.at_risk ? `, AT RISK (${j.risk_note})` : ''}${j.promised_date ? `, promised ${new Date(j.promised_date).toISOString().slice(0, 10)}` : ''}`).join('\n');
}

function formatCustomerHistory(history, personaId, workerId) {
  if (!history) return '';
  if (!visible(personaId, workerId, CONTEXT_DOMAINS.customer)) return '';
  const showJobs = visible(personaId, workerId, CONTEXT_DOMAINS.job);
  const showEnquiries = visible(personaId, workerId, CONTEXT_DOMAINS.enquiry);
  const showActivity = visible(personaId, workerId, CONTEXT_DOMAINS.activity);
  const { customer, jobs, enquiries, activity } = history;
  const lines = [
    `Customer record: ${customer.name} (source: scott_customers row ${customer.id})`,
    customer.location ? `- Location: ${customer.location}` : '',
    customer.notes ? `- Notes on file: ${customer.notes}` : '',
    showJobs ? (jobs.length ? `- Jobs: ${jobs.map((j) => `${j.ref} (${j.status})`).join(', ')}` : '- No jobs on file.') : '',
    showEnquiries ? (enquiries.length ? `- Enquiries: ${enquiries.map((e) => `"${e.subject}" (${e.status}, ${new Date(e.created_at).toISOString().slice(0, 10)})`).join('; ')}` : '- No enquiries on file.') : '',
    showActivity && activity.length ? `- Recent activity:\n${activity.slice(0, 6).map((a) => `  - ${new Date(a.created_at).toISOString().slice(0, 10)}: ${a.summary}`).join('\n')}` : ''
  ];
  return lines.filter(Boolean).join('\n');
}

function formatActivity(rows, heading, personaId, workerId) {
  if (!visible(personaId, workerId, CONTEXT_DOMAINS.activity)) return '';
  if (!rows || rows.length === 0) return `${heading}: none recorded.`;
  return `${heading} (source: scott_activity):\n` + rows.map((a) => `- ${new Date(a.created_at).toISOString().slice(0, 10)} [${a.actor}] ${a.summary}${a.related_job_ref ? ` (job ${a.related_job_ref})` : ''}`).join('\n');
}

async function buildContext(workerId, { message, entities, personaId }) {
  const blocks = [];
  // Defaults to Scott Mercer (full clearance) when no persona is threaded
  // through — preserves exact v0.1 behaviour for any caller that predates
  // this parameter (the public lead form's fire-and-forget draft, and
  // existing tests), since the owner persona was effectively the only
  // context that existed before this file had any concept of clearance.
  const persona = personaId || clearance.DEFAULT_PERSONA;
  const can = (domain) => visible(persona, workerId, domain);

  blocks.push(formatDeepFactsBlock(persona, workerId));

  if (entities.job) blocks.push(formatJob(entities.job, persona, workerId));
  if (entities.customer) blocks.push(formatCustomerHistory(entities.customer, persona, workerId));

  if (workerId === 'operations') {
    if (!entities.job && can(CONTEXT_DOMAINS.job)) {
      const [atRisk, jobs] = await Promise.all([repo.getJobs({ atRiskOnly: true }), repo.getJobs({})]);
      const dueSoon = jobs.filter((j) => j.promised_date && new Date(j.promised_date) <= new Date(Date.now() + 7 * 24 * 3600 * 1000) && !['completed', 'delivered'].includes(j.status));
      blocks.push(formatJobsList(atRisk, 'Jobs currently flagged at risk', persona, workerId));
      blocks.push(formatJobsList(dueSoon, 'Jobs due within 7 days', persona, workerId));
    }
  } else if (workerId === 'customers_marketing') {
    // The enquiry text is `leads`. It contains whatever a member of the
    // public wrote in, which is exactly the sort of free text that should
    // not be handed to a reader with no lead clearance.
    if (!entities.job && !entities.customer && can(CONTEXT_DOMAINS.enquiry)) {
      const { rows } = await db.query(
        "SELECT e.*, j.ref AS related_job_ref FROM scott_enquiries e LEFT JOIN scott_jobs j ON j.id = e.related_job_id WHERE e.status = 'new' ORDER BY e.created_at DESC LIMIT 5"
      );
      if (rows.length) {
        blocks.push('Open enquiries awaiting a reply (source: scott_enquiries):\n' + rows.map((e) => `- "${e.subject}" from ${e.customer_name} via ${e.channel}: ${e.message}`).join('\n'));
      }
    }
  } else if (workerId === 'company_brain') {
    // Company Brain has the broadest worker permission, which is exactly
    // why the HUMAN's clearance has to bind here: 07Q names Company Brain
    // as one of the four bypass routes it forbids. Each block is fetched
    // only if the pair may see it, so an uncleared reader does not even
    // cause the query to run.
    if (can(CONTEXT_DOMAINS.summary)) {
      const summary = await repo.getDashboardSummary();
      blocks.push(`Business snapshot (source: live counts across scott_jobs/scott_enquiries/scott_writebacks): ${summary.openJobs} open jobs, ${summary.atRiskJobs} flagged at risk, ${summary.newEnquiries} new unrouted enquiries, ${summary.pendingApprovals} writebacks awaiting approval, ${summary.dueThisWeek} jobs due within 7 days.`);
    }
    if (can(CONTEXT_DOMAINS.job)) {
      const [atRisk, dueList] = await Promise.all([repo.getJobs({ atRiskOnly: true }), repo.getJobs({})]);
      const dueSoon = dueList.filter((j) => j.promised_date && new Date(j.promised_date) <= new Date(Date.now() + 7 * 24 * 3600 * 1000) && !['completed', 'delivered'].includes(j.status));
      blocks.push(formatJobsList(atRisk, 'Jobs currently flagged at risk', persona, workerId));
      blocks.push(formatJobsList(dueSoon, 'Jobs due within 7 days', persona, workerId));
    }
    if (can(CONTEXT_DOMAINS.activity)) {
      blocks.push(formatActivity(await repo.getRecentActivity(12), 'Most recent demonstration activity', persona, workerId));
    }
    if (!entities.job && can(CONTEXT_DOMAINS.job)) {
      const refMatch = String(message || '').match(JOB_REF_PATTERN);
      if (refMatch) blocks.push(formatJob(await repo.getJobByRef(refMatch[0].toUpperCase()), persona, workerId));
    }
    // Free-text search was the widest hole of all: repo.searchAll runs an
    // unfiltered ILIKE across jobs, enquiries and customers, and its
    // results went straight into the prompt. The /api/scott/search route
    // was fixed earlier; this second caller was not.
    if (!entities.customer && can(CONTEXT_DOMAINS.enquiry)) {
      const found = await repo.searchAll(message);
      if (found.enquiries.length) {
        blocks.push('Enquiries matching this request (source: scott_enquiries):\n' + found.enquiries.map((e) => `- "${e.subject}" from ${e.customer_name} (${e.status}, ${new Date(e.created_at).toISOString().slice(0, 10)}): ${e.message}`).join('\n'));
      }
    }
  } else if (workerId === 'governance') {
    if (can(CONTEXT_DOMAINS.approvals)) {
      const pending = await repo.getPendingApprovals();
      blocks.push(pending.length ? `Writebacks currently awaiting human approval (source: scott_writebacks):\n${pending.map((w) => `- #${w.id} proposed by ${w.proposing_worker_id}: ${w.summary}`).join('\n')}` : 'No writebacks currently awaiting approval.');
    }
    if (can(CONTEXT_DOMAINS.activity)) {
      blocks.push(formatActivity(await repo.getRecentActivity(15), 'Most recent demonstration activity', persona, workerId));
    }
  }

  const text = blocks.filter(Boolean).join('\n\n');
  return text ? `CURRENT RELEVANT DEMONSTRATION RECORDS (isolated fictional data, cite the source shown against each item; this is not the real Scott Drive brain and never overrides it)\n\n${text}` : '';
}

module.exports = {
  extractEntities,
  CONTEXT_DOMAINS,
  buildContext,
  JOB_REF_PATTERN,
  formatDeepFactsBlock,
  allDeepFactRecords,
  untaggedDeepFactExports,
  loadApprovedFacts,
  approvedFactCount,
  setApprovedFactsForTest
};
