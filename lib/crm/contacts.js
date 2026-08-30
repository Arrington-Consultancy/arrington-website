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
const { hashEmail } = require('./emailHash');

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
  let rows;
  try {
    ({ rows } = await db.query(
    `INSERT INTO crm_contact_events (contact_id, kind, summary, signup_source, occurred_at, source_table, source_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (source_table, source_id) DO NOTHING
     RETURNING id`,
      [contactId, kind, String(summary || '').slice(0, 2000), signupSource || '', occurredAt || new Date(), sourceTable, sourceId]
    ));
  } catch (err) {
    // 23503: the contact row went between the upsert above and this
    // insert, which happens when an erasure is running at the same time
    // as a rebuild. The right answer is to drop the event, not to
    // recreate the person somebody has just asked us to remove.
    if (err.code === '23503') return false;
    throw err;
  }
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
  // Tombstones: addresses that have been erased, with the moment of
  // erasure. A rebuild must not resurrect somebody who has asked to be
  // removed, and that is a live risk rather than a theoretical one: a
  // sync already in flight has read the lead rows BEFORE the erasure
  // deletes them, so without this it would write the contact straight
  // back afterwards.
  //
  // Scoped by time on purpose. Erasure removes the history up to that
  // point; if the same person makes a NEW enquiry afterwards, that is a
  // fresh contact of their own making and is honoured normally.
  const { rows: tombstones } = await db.query('SELECT email_hash, MAX(erased_at) AS erased_at FROM crm_erasures GROUP BY email_hash');
  const erasedAt = new Map(tombstones.map((t) => [t.email_hash, new Date(t.erased_at)]));

  const { rows } = await db.query(
    `SELECT id, kind, name, email, phone, message, document, signup_source, created_at
     FROM leads
     WHERE email IS NOT NULL AND email <> ''
     ORDER BY id`
  );
  let contacts = 0;
  let events = 0;
  let skippedErased = 0;
  for (const lead of rows) {
    const normalised = normaliseEmail(lead.email);
    if (normalised) {
      const tombstone = erasedAt.get(hashEmail(normalised));
      if (tombstone && new Date(lead.created_at) <= tombstone) { skippedErased += 1; continue; }
    }
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
  // Closing sweep, on a FRESH read of the register.
  //
  // The tombstone check above uses the register as it was when this sync
  // started. If an erasure commits WHILE a sync is running, that sync is
  // working from a snapshot taken before it and can write the person
  // back. Re-reading the register at the end and removing anything it
  // has just recreated closes that window, and costs one query on a run
  // where nothing was erased.
  const { rows: fresh } = await db.query('SELECT email_hash, MAX(erased_at) AS erased_at FROM crm_erasures GROUP BY email_hash');
  let sweptErased = 0;
  if (fresh.length) {
    const freshMap = new Map(fresh.map((t) => [t.email_hash, new Date(t.erased_at)]));
    const { rows: current } = await db.query('SELECT id, email, first_seen_at FROM crm_contacts');
    for (const c of current) {
      const normalised = normaliseEmail(c.email);
      if (!normalised) continue;
      const tombstone = freshMap.get(hashEmail(normalised));
      // Only sweep a record whose history predates the erasure. A
      // genuinely new enquiry made after it is theirs to make.
      if (tombstone && (!c.first_seen_at || new Date(c.first_seen_at) <= tombstone)) {
        await db.query('DELETE FROM crm_contacts WHERE id = $1', [c.id]);
        sweptErased += 1;
      }
    }
  }

  return { leadsScanned: rows.length, contactsTouched: contacts, eventsAdded: events, skippedErased, sweptErased };
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
