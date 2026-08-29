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

// Activity for the audit page. `by` narrows to AI-authored or
// person-authored events; anything else returns both. The actor list is
// passed in rather than hardcoded here so this stays a data function and
// the definition of "a worker" keeps living in workers.js.
async function getActivityFeed({ limit, by, workerIds } = {}) {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const ids = Array.isArray(workerIds) ? workerIds : [];
  let where = '';
  const params = [];
  if (by === 'worker' && ids.length) {
    params.push(ids);
    where = `WHERE a.actor = ANY($${params.length})`;
  } else if (by === 'human') {
    params.push(ids);
    where = `WHERE NOT (a.actor = ANY($${params.length}))`;
  }
  params.push(cap);
  const { rows } = await db.query(
    `SELECT a.*, j.ref AS related_job_ref, e.subject AS related_enquiry_subject
     FROM scott_activity a
     LEFT JOIN scott_jobs j ON j.id = a.related_job_id
     LEFT JOIN scott_enquiries e ON e.id = a.related_enquiry_id
     ${where}
     ORDER BY a.created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

// Counted in SQL rather than from the (capped) feed above, so the totals
// on the audit page describe the whole record and not just the page of it
// currently being shown.
async function getActivityStats(workerIds) {
  const ids = Array.isArray(workerIds) ? workerIds : [];
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE actor = ANY($1))::int AS by_workers,
            COUNT(*) FILTER (WHERE NOT (actor = ANY($1)))::int AS by_people
     FROM scott_activity`,
    [ids]
  );
  const r = rows[0] || {};
  return { total: r.total || 0, byWorkers: r.by_workers || 0, byPeople: r.by_people || 0 };
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
// `decider` is { realUserId, portalUserId, displayName }: exactly one id
// is set, and the name is stored alongside so the audit line reads as a
// person even for a fictional staff member with no users row.
async function decideWriteback(id, decision, decider, editedText) {
  const { realUserId = null, portalUserId = null, displayName = '' } = decider || {};
  const status = decision === 'approve' ? 'approved' : 'rejected';
  const hasEdit = status === 'approved' && typeof editedText === 'string' && editedText.trim().length > 0;
  // Each branch sends ONLY the parameters its own SQL references. The
  // no-edit branch previously carried a $4 that its query never mentions,
  // which is the same Postgres 42P18 ("could not determine data type of
  // parameter") failure already documented against getLatestConversation
  // in this file. Caught here before it shipped, by counting placeholders
  // against arguments rather than trusting the shape.
  const { rows } = await db.query(
    hasEdit
      ? `UPDATE scott_writebacks SET status = $1, decided_by_user_id = $2, decided_by_portal_user_id = $4, decided_by_name = $5, decided_at = NOW(), summary = $6, edited_by_human = true WHERE id = $3 AND status = 'pending_approval' RETURNING *`
      : `UPDATE scott_writebacks SET status = $1, decided_by_user_id = $2, decided_by_portal_user_id = $4, decided_by_name = $5, decided_at = NOW() WHERE id = $3 AND status = 'pending_approval' RETURNING *`,
    hasEdit
      ? [status, realUserId, id, portalUserId, String(displayName).slice(0, 120), editedText.trim().slice(0, 4000)]
      : [status, realUserId, id, portalUserId, String(displayName).slice(0, 120)]
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
async function supersedeWriteback(id, decider) {
  const { realUserId = null, portalUserId = null, displayName = '' } = decider || {};
  const { rows } = await db.query(
    `UPDATE scott_writebacks SET status = 'superseded', decided_by_user_id = $1, decided_by_portal_user_id = $3, decided_by_name = $4, decided_at = NOW() WHERE id = $2 AND status = 'pending_approval' RETURNING *`,
    [realUserId, id, portalUserId, String(displayName).slice(0, 120)]
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
// Ownership and clearance are both recorded at creation. A conversation
// with neither identity is only ever created by the public lead form,
// which runs with no logged-in human at all.
async function createConversation({ realUserId = null, portalUserId = null, personaId = null }, title, { jobId, enquiryId } = {}) {
  const { rows } = await db.query(
    `INSERT INTO scott_conversations (user_id, portal_user_id, persona_id, title, related_job_id, related_enquiry_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [realUserId || null, portalUserId || null, personaId || 'scott_mercer',
     title || 'New conversation', jobId || null, enquiryId || null]
  );
  return rows[0];
}

// Finds the most recent conversation matching a given context.
//
// A job- or enquiry-scoped conversation is still a shared team record
// rather than one person's private chat, which is the useful behaviour:
// anyone picking that job up continues the same thread. But "shared" was
// implemented as "shared with everyone", and the thread contains AI
// replies generated from evidence at the original asker's clearance. It
// is now shared WITHIN A CLEARANCE: a Clearance B conversation about a
// job is picked up by the next Clearance B reader and is invisible to
// Clearance F, who would otherwise inherit answers built from records
// they cannot see.
//
// An unscoped conversation stays genuinely personal and is matched on the
// owning identity, which is now explicit for fictional staff rather than
// a null.
async function getLatestConversation({ realUserId = null, portalUserId = null, personaId = null }, { jobId, enquiryId } = {}) {
  const scoped = !!(jobId || enquiryId);
  // Historic note worth keeping: the unscoped query used to be sent with
  // three params against SQL referencing only $3. Postgres cannot infer a
  // type for a parameter that appears nowhere in the query text, so it
  // failed with 42P18 on every ordinary dashboard visit. Each branch
  // still sends only the parameters its own SQL uses.
  const { rows } = await db.query(
    scoped
      ? `SELECT * FROM scott_conversations
          WHERE related_job_id IS NOT DISTINCT FROM $1
            AND related_enquiry_id IS NOT DISTINCT FROM $2
            AND persona_id = $3
          ORDER BY updated_at DESC LIMIT 1`
      : `SELECT * FROM scott_conversations
          WHERE ((user_id IS NOT NULL AND user_id = $1) OR (portal_user_id IS NOT NULL AND portal_user_id = $2))
            AND persona_id = $3
            AND related_job_id IS NULL AND related_enquiry_id IS NULL
          ORDER BY updated_at DESC LIMIT 1`,
    scoped ? [jobId || null, enquiryId || null, personaId] : [realUserId, portalUserId, personaId]
  );
  return rows[0] || null;
}

// Same shared-record reasoning as getLatestConversation: a job/enquiry-
// scoped conversation is viewable by any authenticated staff member; a
// general one is scoped to its owning user.
// Conversation ownership.
//
// The previous WHERE clause was:
//   WHERE id = $1 AND (related_job_id IS NOT NULL
//                      OR related_enquiry_id IS NOT NULL
//                      OR user_id = $2)
// which meant ANY conversation scoped to a job or an enquiry was readable
// by anyone who could guess its id, because the two IS NOT NULL branches
// short-circuit the ownership test entirely. Worse, a fictional staff
// member has no users row, so user_id = $2 never matched for them and the
// job/enquiry-scoped conversations were the ONLY ones they could reach:
// precisely the shared ones. A knitting operative could read a
// conversation the owner had held about a job, including every AI reply
// generated from evidence at the owner's clearance.
//
// Ownership is now explicit and is never bypassed by scoping. `viewer`
// carries exactly one of realUserId or portalUserId, and a conversation
// belongs to whichever identity created it.
//
// The clearance check is separate and additional: a conversation records
// the persona it was conducted under, and replaying it to a reader with a
// narrower clearance would hand them AI output derived from evidence they
// cannot see. `personaId` is required, and a conversation held at a
// clearance the reader does not match is not theirs to read.
async function getConversation(id, { realUserId = null, portalUserId = null, personaId = null } = {}) {
  const { rows } = await db.query('SELECT * FROM scott_conversations WHERE id = $1', [id]);
  const conversation = rows[0];
  if (!conversation) return null;

  const ownedByRealUser = realUserId != null && conversation.user_id === realUserId;
  const ownedByPortalUser = portalUserId != null && conversation.portal_user_id === portalUserId;
  if (!ownedByRealUser && !ownedByPortalUser) return null;

  // Defence in depth. Ownership alone should already prevent this, but a
  // conversation whose recorded clearance differs from the reader's
  // current one must not be replayed: an impersonating owner who has
  // switched persona mid-session is the realistic way that happens.
  if (personaId && conversation.persona_id && conversation.persona_id !== personaId) return null;

  return conversation;
}

async function listConversations({ realUserId = null, portalUserId = null, personaId = null } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM scott_conversations
      WHERE ((user_id IS NOT NULL AND user_id = $1) OR (portal_user_id IS NOT NULL AND portal_user_id = $2))
        AND ($3::varchar IS NULL OR persona_id = $3)
      ORDER BY updated_at DESC LIMIT 20`,
    [realUserId, portalUserId, personaId]
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
  getActivityFeed,
  getActivityStats,
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
