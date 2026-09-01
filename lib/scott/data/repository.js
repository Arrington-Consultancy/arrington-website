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

// The doc 31 job lifecycle. quality_check, rework and ready_for_return
// were added by the doc 24 review (finding F2): transitions into the
// release states are gated on quality evidence in lib/scott/qualityGate.js,
// enforced by the status route, not here, so this list stays a plain
// vocabulary check.
const JOB_STATUSES = ['enquiry', 'quoted', 'scheduled', 'in_progress', 'awaiting_parts', 'quality_check', 'rework', 'ready_for_return', 'on_hold', 'completed', 'delivered'];
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

// ------------------------------------------------------------
// Brain Gaps (Needs Human Input)
// ------------------------------------------------------------

// Writes the plan produced by brainGaps.planGap verbatim. The repository
// deliberately does not re-decide anything: whether a gap is material,
// who owns it and whether it earns an email are decided once, in a pure
// function that can be tested without a database, and stored as evidence
// of what was decided rather than recomputed later against code that may
// have moved on.
async function createBrainGap(plan) {
  const { rows } = await db.query(
    `INSERT INTO scott_brain_gaps
       (conversation_id, raised_by_worker_id, domain, gap_type, missing_evidence,
        why_it_matters, expected_source, responsible_persona_id, responsible_name,
        work_can_continue, material, status, notify_decision, email_status,
        related_job_id, related_enquiry_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [plan.conversationId || null, plan.raisedByWorkerId || '', plan.domain || '',
     plan.gapType, plan.missingEvidence, plan.whyItMatters, plan.expectedSource || '',
     plan.responsiblePersonaId || null, plan.responsibleName || '',
     !!plan.workCanContinue, !!plan.material, plan.status || 'open',
     plan.notifyDecision, plan.emailStatus || 'not_required',
     plan.relatedJobId || null, plan.relatedEnquiryId || null]
  );
  return rows[0];
}

// Records what the send attempt actually did. Status moves to 'notified'
// only on a genuine success: a failed send leaves the gap 'open', because
// an open gap nobody has been told about is exactly the state that needs
// to stay visible.
async function recordGapDelivery(id, result) {
  const { rows } = await db.query(
    `UPDATE scott_brain_gaps
        SET email_status = $1::text,
            email_to = $2,
            email_attempts = $3,
            email_error = $4,
            -- $1 is cast explicitly in the CASE arms: without it Postgres
            -- deduces the parameter's type twice, once from the varchar
            -- column it is assigned to and once from a text comparison,
            -- and rejects the query with 42P08. Same class of thing as
            -- the 42P18 already documented above, and caught the same
            -- way: by running both branches against a real database.
            emailed_at = CASE WHEN $1::text = 'sent' THEN NOW() ELSE emailed_at END,
            status = CASE WHEN $1::text = 'sent' AND status = 'open' THEN 'notified' ELSE status END
      WHERE id = $5 RETURNING *`,
    [result.emailStatus, result.emailTo || '', result.attempts || 0,
     String(result.error || '').slice(0, 2000), id]
  );
  return rows[0] || null;
}

async function getBrainGapById(id) {
  const { rows } = await db.query('SELECT * FROM scott_brain_gaps WHERE id = $1', [id]);
  return rows[0] || null;
}

// Open gaps, newest first. Filtering by clearance is the CALLER'S job and
// is done with the same filterAndRedact used everywhere else: a gap
// description quotes the evidence that is missing, so an unfiltered list
// would be a way round every other control in the system.
async function getOpenBrainGaps({ materialOnly = false, limit = 50 } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM scott_brain_gaps
      WHERE status IN ('open', 'notified', 'awaiting_source')
        ${materialOnly ? 'AND material = true' : ''}
      ORDER BY material DESC, work_can_continue ASC, created_at DESC
      LIMIT $1`,
    [Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)]
  );
  return rows;
}

async function getBrainGaps({ limit = 100 } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM scott_brain_gaps ORDER BY created_at DESC LIMIT $1`,
    [Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300)]
  );
  return rows;
}

async function countOpenBrainGaps() {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM scott_brain_gaps WHERE status IN ('open','notified','awaiting_source') AND material = true`
  );
  return rows[0] ? rows[0].n : 0;
}

// Closing a gap. Only ever called from a human-session route: there is no
// AI path to it, deliberately, and sourceCorrected is that human's
// explicit statement that the underlying controlled record has been put
// right. Without it the close is recorded as a dismissal instead, so
// "this turned out not to matter" and "the source is now correct" stay
// different answers on the register.
//
// The status guard in the WHERE clause means a second click cannot
// re-close a gap under a different name, and the returned null tells the
// route that honestly rather than reporting a success it did not perform.
async function resolveBrainGap(id, { sourceCorrected, note, resolver }) {
  const { realUserId = null, portalUserId = null, displayName = '' } = resolver || {};
  const status = sourceCorrected ? 'resolved' : 'dismissed';
  const { rows } = await db.query(
    `UPDATE scott_brain_gaps
        SET status = $1, source_corrected = $2, resolution_note = $3,
            resolved_by_user_id = $4, resolved_by_portal_user_id = $5,
            resolved_by_name = $6, resolved_at = NOW()
      WHERE id = $7 AND status IN ('open','notified','awaiting_source')
      RETURNING *`,
    [status, !!sourceCorrected, String(note || '').slice(0, 2000),
     realUserId, portalUserId, String(displayName).slice(0, 120), id]
  );
  return rows[0] || null;
}

// ------------------------------------------------------------
// Proposed brain facts (gap-driven authoring)
// ------------------------------------------------------------

// Writes an assessed proposal verbatim, on the same principle as
// createBrainGap above: the conflict and drift checks are decided once, in
// a pure function that can be tested without a database, and stored as
// evidence of what was found rather than recomputed later against code
// that has since moved on.
//
// The row lands as 'pending' whatever the verdict says, INCLUDING an
// 'admissible' one. Nothing here can write 'approved', so there is no
// path from a model's proposal into the brain that does not pass through
// a person.
async function createBrainCandidate(assessment, meta = {}) {
  const c = assessment.candidate;
  const { rows } = await db.query(
    `INSERT INTO scott_brain_candidates
       (gap_id, conversation_id, domain, fact_key, fact_value, source_label,
        proposed_by_worker_id, verdict, drift_flags, conflict_flags, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'pending') RETURNING *`,
    [c.gapId || meta.gapId || null, meta.conversationId || null,
     c.domain, c.factKey, c.factValue, c.sourceLabel,
     c.proposedByWorkerId || meta.workerId || '', assessment.verdict,
     JSON.stringify(assessment.driftFlags || []),
     JSON.stringify(assessment.conflictFlags || [])]
  );
  return rows[0];
}

// Everything still waiting on a person. Blocked proposals are included on
// purpose: a blocked one is the most interesting row in the queue, because
// it means the demonstration caught a contradiction, and hiding it would
// make the checks invisible exactly where they did their job.
async function getPendingBrainCandidates({ limit = 100 } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM scott_brain_candidates
      WHERE status = 'pending'
      ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getBrainCandidateById(id) {
  const { rows } = await db.query('SELECT * FROM scott_brain_candidates WHERE id = $1', [id]);
  return rows[0] || null;
}

// The approved facts, and only the approved ones. This is the single read
// that feeds the company brain, so the WHERE clause here is the whole
// guarantee that an unapproved proposal never reaches a worker's context.
async function getApprovedBrainFacts({ limit = 500 } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM scott_brain_candidates
      WHERE status = 'approved'
      ORDER BY decided_at ASC LIMIT $1`,
    [limit]
  );
  return rows;
}

// Approve or reject, always with a written reason and always attributed.
//
// The status guard in the WHERE clause means a second click cannot decide
// an already-decided proposal, and a null return tells the route that
// honestly instead of reporting a success it did not perform. Same shape
// as resolveBrainGap, for the same reason.
//
// A blocked proposal can still be approved by a human who has looked at
// the conflict and decided the new fact supersedes the old one. That is a
// deliberate choice rather than an oversight: the checks exist to make a
// person look, not to overrule one. What they cannot do is approve it
// without looking, because there is no path here that runs unattended.
async function decideBrainCandidate(id, { approved, note, decider } = {}) {
  const { realUserId = null, personaId = '', displayName = '' } = decider || {};
  const status = approved ? 'approved' : 'rejected';
  const { rows } = await db.query(
    `UPDATE scott_brain_candidates
        SET status = $1, decision_note = $2, decided_by_user_id = $3,
            decided_by_name = $4, decided_by_persona_id = $5, decided_at = NOW()
      WHERE id = $6 AND status = 'pending'
      RETURNING *`,
    [status, String(note || '').slice(0, 2000), realUserId,
     String(displayName).slice(0, 120), String(personaId).slice(0, 40), id]
  );
  return rows[0] || null;
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
  setJobStatus,
  createBrainGap,
  recordGapDelivery,
  getBrainGapById,
  getOpenBrainGaps,
  getBrainGaps,
  countOpenBrainGaps,
  resolveBrainGap,
  createBrainCandidate,
  getPendingBrainCandidates,
  getBrainCandidateById,
  getApprovedBrainFacts,
  decideBrainCandidate
};
