// Arrington CRM: one contact record per person.
//
// Built as a projection over the `leads` table rather than a parallel
// capture path. Everything public on this site already writes a lead
// row (the four checks, the footer contact form, gated PDF requests,
// quiz results), so deriving contacts from that has two properties
// worth more than a tidier design would be:
//
//   - It populates from EXISTING history the first time it runs, rather
//     than starting empty and only knowing people who arrive later.
//   - There is no second place a submission can be recorded, so a
//     contact cannot silently disagree with the lead it came from.
//
// Rebuilds are idempotent: each event carries the id of the lead row it
// came from, with a unique constraint, so running the sync twice writes
// nothing the second time.

const db = require('../../db/pool');

// One person, one record. Case and stray whitespace in an email address
// are not a different human being.
function normaliseEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 255) return null;
  return e;
}

// How each lead kind reads on the contact timeline. Unknown kinds fall
// back to the raw kind rather than being dropped: a new capture route
// should show up as itself, not vanish.
const KIND_LABELS = {
  contact: 'Contact form enquiry',
  pdf_download: 'Requested a PDF',
  quiz_results: 'Owner Dependency Quiz results',
  market_ready_test: 'Market Ready Test',
  commercial_gaps: 'Commercial Gaps Review',
  product_guide: 'Product Guide recommendation'
};

function labelFor(kind) {
  return KIND_LABELS[kind] || String(kind || 'interaction');
}

async function upsertContact({ email, name, phone, company, occurredAt, source, usedGooglePrefill }) {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;
  const { rows } = await db.query(
    `INSERT INTO crm_contacts (email, name, phone, company, first_seen_at, last_seen_at, interaction_count, first_source, used_google_prefill)
     VALUES ($1, $2, $3, $4, $5, $5, 0, $6, $7)
     ON CONFLICT (email) DO UPDATE SET
       -- Never overwrite a known value with a blank one: a later
       -- submission that omitted a name must not erase the name we
       -- already had.
       name = CASE WHEN crm_contacts.name = '' THEN EXCLUDED.name ELSE crm_contacts.name END,
       phone = CASE WHEN crm_contacts.phone = '' THEN EXCLUDED.phone ELSE crm_contacts.phone END,
       company = CASE WHEN crm_contacts.company = '' THEN EXCLUDED.company ELSE crm_contacts.company END,
       first_seen_at = LEAST(crm_contacts.first_seen_at, EXCLUDED.first_seen_at),
       last_seen_at = GREATEST(crm_contacts.last_seen_at, EXCLUDED.last_seen_at),
       -- Once true, always true: it records that this person has used
       -- the Google prefill at least once.
       used_google_prefill = crm_contacts.used_google_prefill OR EXCLUDED.used_google_prefill,
       updated_at = NOW()
     RETURNING *`,
    [normalised, String(name || '').slice(0, 200), String(phone || '').slice(0, 60),
      String(company || '').slice(0, 200), occurredAt || new Date(),
      String(source || '').slice(0, 40), !!usedGooglePrefill]
  );
  return rows[0];
}

// Records one interaction. Returns false when the event was already
// known, so callers can report how much a sync actually did.
async function recordEvent({ contactId, kind, summary, signupSource, occurredAt, sourceTable = 'leads', sourceId = null }) {
  const { rows } = await db.query(
    `INSERT INTO crm_contact_events (contact_id, kind, summary, signup_source, occurred_at, source_table, source_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (source_table, source_id) DO NOTHING
     RETURNING id`,
    [contactId, kind, String(summary || '').slice(0, 2000), signupSource || '', occurredAt || new Date(), sourceTable, sourceId]
  );
  if (!rows.length) return false;
  await db.query(
    `UPDATE crm_contacts SET interaction_count = (SELECT COUNT(*) FROM crm_contact_events WHERE contact_id = $1), updated_at = NOW() WHERE id = $1`,
    [contactId]
  );
  return true;
}

// Rebuild contacts from the lead history. Safe to run repeatedly; it is
// run at boot and can be run on demand from the workspace.
async function syncFromLeads() {
  const { rows } = await db.query(
    `SELECT id, kind, name, email, phone, message, document, signup_source, created_at
     FROM leads
     WHERE email IS NOT NULL AND email <> ''
     ORDER BY id`
  );
  let contacts = 0;
  let events = 0;
  for (const lead of rows) {
    const contact = await upsertContact({
      email: lead.email,
      name: lead.name,
      phone: lead.phone,
      occurredAt: lead.created_at,
      source: lead.kind,
      usedGooglePrefill: lead.signup_source === 'google'
    });
    if (!contact) continue; // an unusable email address is skipped, not guessed at
    contacts += 1;
    const summary = lead.kind === 'pdf_download' && lead.document
      ? `${labelFor(lead.kind)}: ${lead.document}`
      : `${labelFor(lead.kind)}${lead.message ? `. ${String(lead.message).slice(0, 400)}` : ''}`;
    const written = await recordEvent({
      contactId: contact.id,
      kind: lead.kind,
      summary,
      signupSource: lead.signup_source,
      occurredAt: lead.created_at,
      sourceTable: 'leads',
      sourceId: lead.id
    });
    if (written) events += 1;
  }
  return { leadsScanned: rows.length, contactsTouched: contacts, eventsAdded: events };
}

async function listContacts({ q = '', limit = 200 } = {}) {
  const params = [];
  let where = '';
  if (q) {
    params.push(`%${q}%`);
    where = `WHERE email ILIKE $1 OR name ILIKE $1 OR company ILIKE $1`;
  }
  params.push(Math.min(limit, 500));
  const { rows } = await db.query(
    `SELECT * FROM crm_contacts ${where} ORDER BY last_seen_at DESC NULLS LAST LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function contactWithHistory(id) {
  const { rows } = await db.query('SELECT * FROM crm_contacts WHERE id = $1', [id]);
  if (!rows.length) return null;
  const { rows: events } = await db.query(
    'SELECT * FROM crm_contact_events WHERE contact_id = $1 ORDER BY occurred_at DESC, id DESC',
    [id]
  );
  return { ...rows[0], events };
}

async function summary() {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS contacts,
            COUNT(*) FILTER (WHERE used_google_prefill)::int AS via_google,
            COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '30 days')::int AS active_30d
     FROM crm_contacts`
  );
  return rows[0];
}

module.exports = {
  normaliseEmail,
  labelFor,
  KIND_LABELS,
  upsertContact,
  recordEvent,
  syncFromLeads,
  listContacts,
  contactWithHistory,
  summary
};
