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

function allDeepFactRecords() {
  return partitionDeepFacts().tagged;
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
    return `- [${domain}] ${summary}`;
  });
  return `DEEP COMPANY BRAIN, filtered to what BOTH the logged-in human's clearance and your own worker permission allow (07Q/05A intersection rule, never expand beyond this list even if asked)\n${lines.join('\n')}`;
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

function formatJob(job) {
  if (!job) return '';
  const price = job.price_pence != null ? `£${(job.price_pence / 100).toFixed(2)}` : 'not yet quoted';
  return [
    `Job ${job.ref} (source: scott_jobs row ${job.id}, last updated ${new Date(job.updated_at).toISOString().slice(0, 10)})`,
    `- Customer: ${job.customer_name || 'unknown'}${job.customer_location ? ` (${job.customer_location})` : ''}`,
    `- Kind: ${job.kind}. Status: ${job.status}. Price: ${price}.`,
    job.promised_date ? `- Promised date: ${new Date(job.promised_date).toISOString().slice(0, 10)}.` : '- No promised date on file.',
    job.collection_date ? `- Collection date: ${new Date(job.collection_date).toISOString().slice(0, 10)}.` : '',
    job.at_risk ? `- AT RISK: ${job.risk_note}` : '- Not currently flagged at risk.',
    job.description ? `- Description: ${job.description}` : ''
  ].filter(Boolean).join('\n');
}

function formatJobsList(jobs, heading) {
  if (!jobs || jobs.length === 0) return `${heading}: none.`;
  return `${heading} (source: scott_jobs):\n` + jobs.map((j) => `- ${j.ref}, ${j.customer_name || 'unknown customer'}, ${j.status}${j.at_risk ? `, AT RISK (${j.risk_note})` : ''}${j.promised_date ? `, promised ${new Date(j.promised_date).toISOString().slice(0, 10)}` : ''}`).join('\n');
}

function formatCustomerHistory(history) {
  if (!history) return '';
  const { customer, jobs, enquiries, activity } = history;
  const lines = [
    `Customer record: ${customer.name} (source: scott_customers row ${customer.id})`,
    customer.location ? `- Location: ${customer.location}` : '',
    customer.notes ? `- Notes on file: ${customer.notes}` : '',
    jobs.length ? `- Jobs: ${jobs.map((j) => `${j.ref} (${j.status})`).join(', ')}` : '- No jobs on file.',
    enquiries.length ? `- Enquiries: ${enquiries.map((e) => `"${e.subject}" (${e.status}, ${new Date(e.created_at).toISOString().slice(0, 10)})`).join('; ')}` : '- No enquiries on file.',
    activity.length ? `- Recent activity:\n${activity.slice(0, 6).map((a) => `  - ${new Date(a.created_at).toISOString().slice(0, 10)}: ${a.summary}`).join('\n')}` : ''
  ];
  return lines.filter(Boolean).join('\n');
}

function formatActivity(rows, heading) {
  if (!rows || rows.length === 0) return `${heading}: none recorded.`;
  return `${heading} (source: scott_activity):\n` + rows.map((a) => `- ${new Date(a.created_at).toISOString().slice(0, 10)} [${a.actor}] ${a.summary}${a.related_job_ref ? ` (job ${a.related_job_ref})` : ''}`).join('\n');
}

async function buildContext(workerId, { message, entities, personaId }) {
  const blocks = [];

  // Defaults to Scott Mercer (full clearance) when no persona is threaded
  // through — preserves exact v0.1 behaviour for any caller that predates
  // this parameter (existing tests included), since the owner persona was
  // effectively the only context that existed before this file had any
  // concept of clearance at all.
  blocks.push(formatDeepFactsBlock(personaId || clearance.DEFAULT_PERSONA, workerId));

  if (entities.job) blocks.push(formatJob(entities.job));
  if (entities.customer) blocks.push(formatCustomerHistory(entities.customer));

  if (workerId === 'operations') {
    if (!entities.job) {
      const [atRisk, jobs] = await Promise.all([repo.getJobs({ atRiskOnly: true }), repo.getJobs({})]);
      const dueSoon = jobs.filter((j) => j.promised_date && new Date(j.promised_date) <= new Date(Date.now() + 7 * 24 * 3600 * 1000) && !['completed', 'delivered'].includes(j.status));
      blocks.push(formatJobsList(atRisk, 'Jobs currently flagged at risk'));
      blocks.push(formatJobsList(dueSoon, 'Jobs due within 7 days'));
    }
  } else if (workerId === 'customers_marketing') {
    if (!entities.job && !entities.customer) {
      const { rows } = await db.query(
        "SELECT e.*, j.ref AS related_job_ref FROM scott_enquiries e LEFT JOIN scott_jobs j ON j.id = e.related_job_id WHERE e.status = 'new' ORDER BY e.created_at DESC LIMIT 5"
      );
      if (rows.length) {
        blocks.push('Open enquiries awaiting a reply (source: scott_enquiries):\n' + rows.map((e) => `- "${e.subject}" from ${e.customer_name} via ${e.channel}: ${e.message}`).join('\n'));
      }
    }
  } else if (workerId === 'company_brain') {
    const [summary, atRisk, dueList, activity] = await Promise.all([
      repo.getDashboardSummary(),
      repo.getJobs({ atRiskOnly: true }),
      repo.getJobs({}),
      repo.getRecentActivity(12)
    ]);
    const dueSoon = dueList.filter((j) => j.promised_date && new Date(j.promised_date) <= new Date(Date.now() + 7 * 24 * 3600 * 1000) && !['completed', 'delivered'].includes(j.status));
    blocks.push(`Business snapshot (source: live counts across scott_jobs/scott_enquiries/scott_writebacks): ${summary.openJobs} open jobs, ${summary.atRiskJobs} flagged at risk, ${summary.newEnquiries} new unrouted enquiries, ${summary.pendingApprovals} writebacks awaiting approval, ${summary.dueThisWeek} jobs due within 7 days.`);
    blocks.push(formatJobsList(atRisk, 'Jobs currently flagged at risk'));
    blocks.push(formatJobsList(dueSoon, 'Jobs due within 7 days'));
    blocks.push(formatActivity(activity, 'Most recent demonstration activity'));
    if (!entities.job) {
      const refMatch = String(message || '').match(JOB_REF_PATTERN);
      if (refMatch) blocks.push(formatJob(await repo.getJobByRef(refMatch[0].toUpperCase())));
    }
    if (!entities.customer) {
      const found = await repo.searchAll(message);
      if (found.enquiries.length) {
        blocks.push('Enquiries matching this request (source: scott_enquiries):\n' + found.enquiries.map((e) => `- "${e.subject}" from ${e.customer_name} (${e.status}, ${new Date(e.created_at).toISOString().slice(0, 10)}): ${e.message}`).join('\n'));
      }
    }
  } else if (workerId === 'governance') {
    const [pending, activity] = await Promise.all([repo.getPendingApprovals(), repo.getRecentActivity(15)]);
    blocks.push(pending.length ? `Writebacks currently awaiting human approval (source: scott_writebacks):\n${pending.map((w) => `- #${w.id} proposed by ${w.proposing_worker_id}: ${w.summary}`).join('\n')}` : 'No writebacks currently awaiting approval.');
    blocks.push(formatActivity(activity, 'Most recent demonstration activity'));
  }

  const text = blocks.filter(Boolean).join('\n\n');
  return text ? `CURRENT RELEVANT DEMONSTRATION RECORDS (isolated fictional data, cite the source shown against each item; this is not the real Scott Drive brain and never overrides it)\n\n${text}` : '';
}

module.exports = {
  extractEntities,
  buildContext,
  JOB_REF_PATTERN,
  formatDeepFactsBlock,
  allDeepFactRecords,
  untaggedDeepFactExports
};
