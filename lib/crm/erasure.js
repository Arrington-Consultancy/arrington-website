// Contact erasure: removing a person's details, properly.
//
// Three things this must get right, none of which are the default:
//
// 1. IT MUST ACTUALLY REMOVE THE DATA. Hiding a contact from the screen
//    would leave the person's details in the lead rows the contact is
//    built from, and the next boot would rebuild the contact from them.
//    Erasure therefore deletes the source rows too, in one transaction.
//
// 2. IT MUST NOT PRETEND TO REMOVE WHAT IT KEEPS. A purchase is a
//    financial record with a statutory retention period; it is not
//    marketing data and it is not deleted here. The register and the
//    interface both say so plainly rather than leaving the impression
//    that everything went.
//
// 3. THE EVIDENCE MUST NOT DEFEAT THE ERASURE. The register stores a
//    one-way hash of the address and a redacted form, never the address
//    itself: enough to answer "did you action my request" when someone
//    quotes their own email, not enough to rebuild a contact list from.

const db = require('../../db/pool');
const { normaliseEmail } = require('./contacts');
const { hashEmail } = require('./emailHash');

// Tables holding this person's details that erasure removes entirely.
// Ordered so children go before parents.
const ERASE_FROM = [
  { table: 'crm_contact_events', label: 'Contact interactions', via: 'contact' },
  { table: 'crm_contacts', label: 'Contact record', column: 'email' },
  { table: 'leads', label: 'Enquiries and submissions', column: 'email' },
  { table: 'market_ready_submissions', label: 'Market Ready Test submissions', column: 'email' },
  { table: 'commercial_gaps_reviews', label: 'Commercial Gaps Reviews', column: 'email' },
  { table: 'product_guide_submissions', label: 'Product Guide submissions', column: 'email' }
];

// Kept deliberately, with the reason stated. Not a gap: a decision.
const RETAIN = [
  {
    table: 'purchases',
    column: 'email',
    label: 'Purchases',
    reason: 'A purchase is a financial record. It is kept for the statutory retention period and is not removed with contact details.'
  }
];

// Enough for a human to recognise their own address in the register,
// not enough to reconstruct it or to contact anyone from it.
function redactEmail(normalised) {
  const [user, domain] = normalised.split('@');
  const head = user.slice(0, 1);
  const dotIndex = domain.lastIndexOf('.');
  const tld = dotIndex === -1 ? '' : domain.slice(dotIndex);
  return `${head}${'*'.repeat(Math.max(user.length - 1, 1))}@${domain.slice(0, 1)}${'*'.repeat(Math.max(domain.length - tld.length - 1, 1))}${tld}`;
}

async function countRows(client, table, column, value) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE LOWER(TRIM(${column})) = $1`, [value]
  );
  return rows[0].n;
}

// What erasing this address would remove and what it would keep. Shown
// before anyone confirms, so the decision is made with the facts.
async function previewErasure(email) {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;
  const client = await db.pool.connect();
  try {
    const removed = {};
    for (const spec of ERASE_FROM) {
      if (spec.via === 'contact') {
        const { rows } = await client.query(
          `SELECT COUNT(*)::int AS n FROM crm_contact_events e
             JOIN crm_contacts c ON c.id = e.contact_id
            WHERE LOWER(TRIM(c.email)) = $1`, [normalised]
        );
        removed[spec.table] = { label: spec.label, count: rows[0].n };
      } else {
        removed[spec.table] = { label: spec.label, count: await countRows(client, spec.table, spec.column, normalised) };
      }
    }
    const retained = {};
    for (const spec of RETAIN) {
      retained[spec.table] = {
        label: spec.label,
        reason: spec.reason,
        count: await countRows(client, spec.table, spec.column, normalised)
      };
    }
    return { email: normalised, redacted: redactEmail(normalised), removed, retained };
  } finally {
    client.release();
  }
}

// Carry out the erasure. Requires the confirming human to have typed the
// address back exactly and to have given a reason: this is irreversible,
// so it must not be reachable by a stray click.
async function eraseContact({ email, confirmEmail, requestedBy, reason }) {
  const normalised = normaliseEmail(email);
  if (!normalised) return { ok: false, error: 'That is not a usable email address.' };
  if (normaliseEmail(confirmEmail) !== normalised) {
    return { ok: false, error: 'The typed address does not match this contact. Erasure is permanent, so it only proceeds on an exact match.' };
  }
  const statedReason = String(reason || '').trim();
  if (statedReason.length < 3) {
    return { ok: false, error: 'A reason is required, and is kept as the record of why this was done.' };
  }

  const preview = await previewErasure(normalised);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const removed = {};
    // Events first: they are children of the contact row.
    const evRes = await client.query(
      `DELETE FROM crm_contact_events
        WHERE contact_id IN (SELECT id FROM crm_contacts WHERE LOWER(TRIM(email)) = $1)`, [normalised]
    );
    removed.crm_contact_events = { label: 'Contact interactions', count: evRes.rowCount };
    for (const spec of ERASE_FROM) {
      if (spec.via === 'contact') continue;
      const res = await client.query(
        `DELETE FROM ${spec.table} WHERE LOWER(TRIM(${spec.column})) = $1`, [normalised]
      );
      removed[spec.table] = { label: spec.label, count: res.rowCount };
    }
    // The register is written inside the same transaction, so evidence
    // and effect cannot come apart.
    await client.query(
      `INSERT INTO crm_erasures (email_hash, email_redacted, requested_by, reason, removed, retained)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [hashEmail(normalised), redactEmail(normalised), requestedBy, statedReason.slice(0, 2000),
        JSON.stringify(removed), JSON.stringify(preview ? preview.retained : {})]
    );
    await client.query('COMMIT');
    return { ok: true, removed, retained: preview ? preview.retained : {}, redacted: redactEmail(normalised) };
  } catch (err) {
    await client.query('ROLLBACK');
    return { ok: false, error: err.message };
  } finally {
    client.release();
  }
}

async function listErasures(limit = 100) {
  const { rows } = await db.query(
    'SELECT * FROM crm_erasures ORDER BY id DESC LIMIT $1', [Math.min(limit, 500)]
  );
  return rows;
}

// Answers "was this address erased" without the register holding it.
async function wasErased(email) {
  const normalised = normaliseEmail(email);
  if (!normalised) return false;
  const { rows } = await db.query('SELECT 1 FROM crm_erasures WHERE email_hash = $1 LIMIT 1', [hashEmail(normalised)]);
  return rows.length > 0;
}

module.exports = {
  ERASE_FROM,
  RETAIN,
  hashEmail,
  redactEmail,
  previewErasure,
  eraseContact,
  listErasures,
  wasErased
};
