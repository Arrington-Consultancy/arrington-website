// Scott AI Demonstration — deterministic data access.
//
// Every function here is plain SQL, not an AI call. This is the retrieval
// half of the "retrieval-augmented" pattern used for Company Brain &
// Records (and, more narrowly, for the other workers) in
// lib/scott/data/contextBuilders.js: the CODE decides what records are
// relevant and fetches them; the model is only ever asked to read and
// narrate a fixed slice of already-fetched data, never to "search" or
// "remember" on its own. That is what keeps a worker's claims traceable to
// an actual row instead of an invented one.

const db = require('../../../db/pool');

async function getDashboardSummary() {
  const [openJobs, atRiskJobs, newEnquiries, pendingApprovals, dueThisWeek] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS n FROM scott_jobs WHERE status NOT IN ('completed', 'delivered')"),
    db.query('SELECT COUNT(*)::int AS n FROM scott_jobs WHERE at_risk = true'),
    db.query("SELECT COUNT(*)::int AS n FROM scott_enquiries WHERE status = 'new'"),
    db.query("SELECT COUNT(*)::int AS n FROM scott_writebacks WHERE status = 'pending_approval'"),
    db.query("SELECT COUNT(*)::int AS n FROM scott_jobs WHERE promised_date IS NOT NULL AND promised_date <= (CURRENT_DATE + INTERVAL '7 days') AND status NOT IN ('completed', 'delivered')")
  ]);
  return {
    openJobs: openJobs.rows[0].n,
    atRiskJobs: atRiskJobs.rows[0].n,
    newEnquiries: newEnquiries.rows[0].n,
    pendingApprovals: pendingApprovals.rows[0].n,
    dueThisWeek: dueThisWeek.rows[0].n
  };
}

async function getJobs({ status, atRiskOnly } = {}) {
  const clauses = [];
  const params = [];
  if (status) { params.push(status); clauses.push(`j.status = $${params.length}`); }
  if (atRiskOnly) clauses.push('j.at_risk = true');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT j.*, c.name AS customer_name FROM scott_jobs j LEFT JOIN scott_customers c ON c.id = j.customer_id ${where} ORDER BY j.at_risk DESC, j.promised_date NULLS LAST, j.created_at DESC`,
    params
  );
  return rows;
}

async function getJobByRef(ref) {
  const { rows } = await db.query(
    `SELECT j.*, c.name AS customer_name, c.location AS customer_location, c.notes AS customer_notes
     FROM scott_jobs j LEFT JOIN scott_customers c ON c.id = j.customer_id WHERE j.ref = $1`,
    [ref]
  );
  return rows[0] || null;
}

async function getJobById(id) {
  const { rows } = await db.query(
    `SELECT j.*, c.name AS customer_name, c.location AS customer_location, c.notes AS customer_notes
     FROM scott_jobs j LEFT JOIN scott_customers c ON c.id = j.customer_id WHERE j.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function getEnquiries({ status } = {}) {
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE e.status = $1`; }
  const { rows } = await db.query(
    `SELECT e.*, j.ref AS related_job_ref FROM scott_enquiries e LEFT JOIN scott_jobs j ON j.id = e.related_job_id ${where} ORDER BY e.created_at DESC`,
    params
  );
  return rows;
}

// Public lead intake — a prospective (fictional) customer submitting the
// public /scott/lead form. Never touches scott_customers (no verified
// identity yet, unlike the seeded named customers) — just an enquiry row,
// same as the seeded "Dave Kowalski" walk-in enquiry with no customer_id.
async function createLeadEnquiry({ name, email, message }) {
  const { rows } = await db.query(
    `INSERT INTO scott_enquiries (customer_name, customer_email, channel, subject, message, status)
     VALUES ($1, $2, 'website', $3, $4, 'new') RETURNING *`,
    [name.slice(0, 200), email.slice(0, 255), message.slice(0, 120), message]
  );
  return rows[0];
}

async function getEnquiryById(id) {
  const { rows } = await db.query(
    `SELECT e.*, j.ref AS related_job_ref FROM scott_enquiries e LEFT JOIN scott_jobs j ON j.id = e.related_job_id WHERE e.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function findCustomersByNameFragment(fragment) {
  if (!fragment || fragment.trim().length < 3) return [];
  const { rows } = await db.query(
    `SELECT * FROM scott_customers WHERE name ILIKE $1 ORDER BY name LIMIT 5`,
    [`%${fragment.trim()}%`]
  );
  return rows;
}

async function getCustomerHistory(customerId) {
  const [customerRes, jobsRes, enquiriesRes, activityRes] = await Promise.all([
    db.query('SELECT * FROM scott_customers WHERE id = $1', [customerId]),
    db.query('SELECT * FROM scott_jobs WHERE customer_id = $1 ORDER BY created_at DESC', [customerId]),
    db.query('SELECT * FROM scott_enquiries WHERE customer_id = $1 ORDER BY created_at DESC', [customerId]),
    db.query(
      `SELECT a.* FROM scott_activity a
       WHERE a.related_job_id IN (SELECT id FROM scott_jobs WHERE customer_id = $1)
          OR a.related_enquiry_id IN (SELECT id FROM scott_enquiries WHERE customer_id = $1)
       ORDER BY a.created_at DESC LIMIT 20`,
      [customerId]
    )
  ]);
  if (customerRes.rows.length === 0) return null;
  return {
    customer: customerRes.rows[0],
    jobs: jobsRes.rows,
    enquiries: enquiriesRes.rows,
    activity: activityRes.rows
  };
}

async function getRecentActivity(limit) {
  const { rows } = await db.query(
    `SELECT a.*, j.ref AS related_job_ref, e.subject AS related_enquiry_subject
     FROM scott_activity a
     LEFT JOIN scott_jobs j ON j.id = a.related_job_id
     LEFT JOIN scott_enquiries e ON e.id = a.related_enquiry_id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit || 12]
  );
  return rows;
}

async function getPendingApprovals() {
  const { rows } = await db.query(
    `SELECT w.*, j.ref AS related_job_ref, e.subject AS related_enquiry_subject
     FROM scott_writebacks w
     LEFT JOIN scott_jobs j ON j.id = w.related_job_id
     LEFT JOIN scott_enquiries e ON e.id = w.related_enquiry_id
     WHERE w.status = 'pending_approval' ORDER BY w.created_at ASC`
  );
  return rows;
}

async function getWritebackById(id) {
  const { rows } = await db.query('SELECT * FROM scott_writebacks WHERE id = $1', [id]);
  return rows[0] || null;
}

async function searchAll(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return { jobs: [], enquiries: [], customers: [] };
  const like = `%${q}%`;
  const [jobs, enquiries, customers] = await Promise.all([
    db.query(
      `SELECT j.*, c.name AS customer_name FROM scott_jobs j LEFT JOIN scott_customers c ON c.id = j.customer_id
       WHERE j.ref ILIKE $1 OR j.description ILIKE $1 OR c.name ILIKE $1 LIMIT 10`,
      [like]
    ),
    db.query(`SELECT * FROM scott_enquiries WHERE subject ILIKE $1 OR message ILIKE $1 OR customer_name ILIKE $1 LIMIT 10`, [like]),
    db.query(`SELECT * FROM scott_customers WHERE name ILIKE $1 LIMIT 10`, [like])
  ]);
  return { jobs: jobs.rows, enquiries: enquiries.rows, customers: customers.rows };
}

async function addActivity({ actor, eventType, summary, relatedJobId, relatedEnquiryId, conversationId }) {
  const { rows } = await db.query(
    `INSERT INTO scott_activity (actor, event_type, summary, related_job_id, related_enquiry_id, conversation_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [actor, eventType, summary, relatedJobId || null, relatedEnquiryId || null, conversationId || null]
  );
  return rows[0];
}

// Records a worker's proposed material change as an append-only writeback.
// Never mutates a structured column on scott_jobs/scott_enquiries — see the
// schema header comment for why. If it needs no further approval, it is
// marked auto_applied immediately and a matching activity row is written in
// the same call so the hub's "recent activity" reflects it right away.
async function createWriteback({ conversationId, messageId, proposingWorkerId, intentType, summary, relatedJobId, relatedEnquiryId, requiresApproval }) {
  const status = requiresApproval ? 'pending_approval' : 'auto_applied';
  const { rows } = await db.query(
    `INSERT INTO scott_writebacks (conversation_id, message_id, proposing_worker_id, intent_type, summary, related_job_id, related_enquiry_id, requires_approval, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [conversationId || null, messageId || null, proposingWorkerId, intentType, summary, relatedJobId || null, relatedEnquiryId || null, !!requiresApproval, status]
  );
  const writeback = rows[0];
  if (!requiresApproval) {
    await addActivity({
      actor: proposingWorkerId,
      eventType: 'writeback',
      summary,
      relatedJobId,
      relatedEnquiryId,
      conversationId
    });
  }
  return writeback;
}

// `editedText`, when given, overwrites the writeback's summary before
// marking it approved — this is the "Modify" action: a human edits an AI
// draft before agreeing to it, not the AI editing its own output.
async function decideWriteback(id, decision, decidedByUserId, editedText) {
  const status = decision === 'approve' ? 'approved' : 'rejected';
  const hasEdit = status === 'approved' && typeof editedText === 'string' && editedText.trim().length > 0;
  const { rows } = await db.query(
    hasEdit
      ? `UPDATE scott_writebacks SET status = $1, decided_by_user_id = $2, decided_at = NOW(), summary = $4, edited_by_human = true WHERE id = $3 AND status = 'pending_approval' RETURNING *`
      : `UPDATE scott_writebacks SET status = $1, decided_by_user_id = $2, decided_at = NOW() WHERE id = $3 AND status = 'pending_approval' RETURNING *`,
    hasEdit ? [status, decidedByUserId, id, editedText.trim().slice(0, 4000)] : [status, decidedByUserId, id]
  );
  const writeback = rows[0];
  if (!writeback) return null;
  if (status === 'approved') {
    await addActivity({
      actor: writeback.proposing_worker_id,
      eventType: 'writeback_approved',
      summary: writeback.edited_by_human ? `${writeback.summary} (edited before approval)` : writeback.summary,
      relatedJobId: writeback.related_job_id,
      relatedEnquiryId: writeback.related_enquiry_id,
      conversationId: writeback.conversation_id
    });
  }
  return writeback;
}

// "Redraft": the current pending draft is marked superseded (not rejected
// — the human isn't saying no to it, just asking the team to try again),
// leaving the caller to trigger a fresh AI turn and create a new writeback.
async function supersedeWriteback(id, decidedByUserId) {
  const { rows } = await db.query(
    `UPDATE scott_writebacks SET status = 'superseded', decided_by_user_id = $1, decided_at = NOW() WHERE id = $2 AND status = 'pending_approval' RETURNING *`,
    [decidedByUserId, id]
  );
  return rows[0] || null;
}

// Supporting context for the "review quote" step: every worker message
// from the same conversation as this writeback, so a human reviewing a
// drafted customer reply can see what Commercial/Operations actually said
// before agreeing to what Customers & Marketing wants to send — never
// just the drafted wording in isolation.
async function getConversationContextForWriteback(writeback) {
  if (!writeback.conversation_id) return [];
  const { rows } = await db.query(
    `SELECT * FROM scott_messages WHERE conversation_id = $1 AND sender = 'worker' ORDER BY created_at ASC`,
    [writeback.conversation_id]
  );
  return rows;
}

// Deterministic, code-driven — never something an AI worker's JSON reply
// triggers directly. Called by the route handler right after Ruth's
// routing decision comes back, so the enquiry list reflects real routing.
async function assignEnquiryIfNew(enquiryId, workerId) {
  if (!enquiryId) return;
  const { rows } = await db.query('SELECT status FROM scott_enquiries WHERE id = $1', [enquiryId]);
  if (rows.length === 0 || rows[0].status !== 'new') return;
  await db.query(
    `UPDATE scott_enquiries SET status = 'routed', assigned_worker_id = $1, updated_at = NOW() WHERE id = $2`,
    [workerId, enquiryId]
  );
}

const JOB_STATUSES = ['enquiry', 'quoted', 'scheduled', 'in_progress', 'awaiting_parts', 'on_hold', 'completed', 'delivered'];
const ENQUIRY_STATUSES = ['new', 'routed', 'responded', 'closed'];

// Direct human UI actions (an explicit "Assign to..." dropdown / "Update
// status" control on the enquiry/job detail page), never something an AI
// worker's JSON reply triggers on its own — see the schema header comment
// in db/schema.sql for why structured-column writes stay code-driven only.
async function setEnquiryAssignment(enquiryId, workerId, status) {
  const nextStatus = status && ENQUIRY_STATUSES.includes(status) ? status : 'routed';
  const { rows } = await db.query(
    `UPDATE scott_enquiries SET assigned_worker_id = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
    [workerId || null, nextStatus, enquiryId]
  );
  return rows[0] || null;
}

async function setJobStatus(jobId, status) {
  if (!JOB_STATUSES.includes(status)) return null;
  const { rows } = await db.query(
    `UPDATE scott_jobs SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, jobId]
  );
  return rows[0] || null;
}

// userId may be null — a conversation auto-started from a public lead
// submission has no logged-in staff member behind it (see the schema
// comment on scott_conversations.user_id).
async function createConversation(userId, title, { jobId, enquiryId } = {}) {
  const { rows } = await db.query(
    'INSERT INTO scott_conversations (user_id, title, related_job_id, related_enquiry_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId || null, title || 'New conversation', jobId || null, enquiryId || null]
  );
  return rows[0];
}

// Finds the most recent conversation matching a given context. A job- or
// enquiry-scoped conversation is a shared team record (any staff member
// can pick it up, regardless of who — or what, for a lead-triggered one —
// started it); only the general (unscoped) dashboard chat is genuinely
// personal and filtered to the current user.
async function getLatestConversation(userId, { jobId, enquiryId } = {}) {
  const scoped = !!(jobId || enquiryId);
  // The unscoped query used to be sent with 3 params ([null, null, userId])
  // against SQL that only ever references $3, leaving $1/$2 unused in the
  // query text. Postgres cannot infer a type for a parameter that appears
  // nowhere in the query, so this always failed with 42P18 ("could not
  // determine data type of parameter $1") the moment a real user hit the
  // dashboard with no job/enquiry context — i.e. every ordinary visit to
  // /scott. Found while testing the SCOTT_DEMO_SKIP_LOGIN bypass, but it
  // reproduces identically through the real login, unrelated to that flag.
  // Fixed by only sending the parameter each branch's SQL actually uses.
  const { rows } = await db.query(
    scoped
      ? `SELECT * FROM scott_conversations WHERE related_job_id IS NOT DISTINCT FROM $1 AND related_enquiry_id IS NOT DISTINCT FROM $2 ORDER BY updated_at DESC LIMIT 1`
      : `SELECT * FROM scott_conversations WHERE user_id = $1 AND related_job_id IS NULL AND related_enquiry_id IS NULL ORDER BY updated_at DESC LIMIT 1`,
    scoped ? [jobId || null, enquiryId || null] : [userId]
  );
  return rows[0] || null;
}

// Same shared-record reasoning as getLatestConversation: a job/enquiry-
// scoped conversation is viewable by any authenticated staff member; a
// general one is scoped to its owning user.
async function getConversation(id, userId) {
  const { rows } = await db.query(
    `SELECT * FROM scott_conversations WHERE id = $1 AND (related_job_id IS NOT NULL OR related_enquiry_id IS NOT NULL OR user_id = $2)`,
    [id, userId]
  );
  return rows[0] || null;
}

async function listConversations(userId) {
  const { rows } = await db.query(
    'SELECT * FROM scott_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20',
    [userId]
  );
  return rows;
}

async function getMessages(conversationId) {
  const { rows } = await db.query(
    'SELECT * FROM scott_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );
  return rows;
}

async function addMessage({ conversationId, sender, workerId, content, certainty, technicalFailure }) {
  const { rows } = await db.query(
    `INSERT INTO scott_messages (conversation_id, sender, worker_id, content, certainty, technical_failure)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [conversationId, sender, workerId || null, content, certainty || null, !!technicalFailure]
  );
  await db.query('UPDATE scott_conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
  return rows[0];
}

module.exports = {
  JOB_STATUSES,
  ENQUIRY_STATUSES,
  getDashboardSummary,
  createConversation,
  getLatestConversation,
  getConversation,
  listConversations,
  getMessages,
  addMessage,
  getJobs,
  getJobByRef,
  getJobById,
  getEnquiries,
  getEnquiryById,
  createLeadEnquiry,
  findCustomersByNameFragment,
  getCustomerHistory,
  getRecentActivity,
  getPendingApprovals,
  getWritebackById,
  getConversationContextForWriteback,
  searchAll,
  addActivity,
  createWriteback,
  decideWriteback,
  supersedeWriteback,
  assignEnquiryIfNew,
  setEnquiryAssignment,
  setJobStatus
};
