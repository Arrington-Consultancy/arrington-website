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

async function decideWriteback(id, decision, decidedByUserId) {
  const status = decision === 'approve' ? 'approved' : 'rejected';
  const { rows } = await db.query(
    `UPDATE scott_writebacks SET status = $1, decided_by_user_id = $2, decided_at = NOW() WHERE id = $3 AND status = 'pending_approval' RETURNING *`,
    [status, decidedByUserId, id]
  );
  const writeback = rows[0];
  if (!writeback) return null;
  if (status === 'approved') {
    await addActivity({
      actor: writeback.proposing_worker_id,
      eventType: 'writeback_approved',
      summary: writeback.summary,
      relatedJobId: writeback.related_job_id,
      relatedEnquiryId: writeback.related_enquiry_id,
      conversationId: writeback.conversation_id
    });
  }
  return writeback;
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

module.exports = {
  getDashboardSummary,
  getJobs,
  getJobByRef,
  getJobById,
  getEnquiries,
  getEnquiryById,
  findCustomersByNameFragment,
  getCustomerHistory,
  getRecentActivity,
  getPendingApprovals,
  getWritebackById,
  searchAll,
  addActivity,
  createWriteback,
  decideWriteback,
  assignEnquiryIfNew
};
