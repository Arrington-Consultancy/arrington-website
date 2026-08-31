// Contact erasure.
//
// The test that matters most is the resurrection one: hiding a contact
// would leave the enquiry rows it is built from, and the next boot would
// rebuild the person from them. Erasure has to remove the source, and
// this suite proves the contact stays gone across a full rebuild.
const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db/pool');
const crm = require('../lib/crm/contacts');
const erasure = require('../lib/crm/erasure');

const NS = `erasetest-${Date.now()}`;
const addr = (n) => `${NS}-${n}@example.test`;

test.after(async () => {
  await db.query('DELETE FROM crm_contacts WHERE email LIKE $1', [`%${NS}%`]);
  await db.query('DELETE FROM leads WHERE email LIKE $1', [`%${NS}%`]);
  await db.query('DELETE FROM crm_erasures WHERE email_redacted LIKE $1', ['e%']);
});

async function seedPerson(email) {
  await db.query(
    `INSERT INTO leads (kind, name, email, message, signup_source) VALUES
       ('contact', 'Test Person', $1, 'First enquiry', 'google'),
       ('product_guide', 'Test Person', $1, 'Guide completed', '')`,
    [email]
  );
  await crm.syncFromLeads();
  const { rows } = await db.query('SELECT * FROM crm_contacts WHERE email = $1', [email]);
  return rows[0];
}

test('the redacted form is recognisable but not reconstructable', () => {
  const r = erasure.redactEmail('marcus@harbourjoinery.test');
  assert.match(r, /^m\*+@h\*+\.test$/);
  assert.ok(!r.includes('arcus'), 'the local part must not survive');
  assert.ok(!r.includes('harbourjoinery'), 'the domain must not survive');
});

test('the preview states what goes and what stays, before anything happens', async () => {
  const email = addr('preview');
  await seedPerson(email);
  const preview = await erasure.previewErasure(email);
  assert.equal(preview.removed.leads.count, 2);
  assert.equal(preview.removed.crm_contacts.count, 1);
  assert.equal(preview.removed.crm_contact_events.count, 2);
  // Purchases are named and kept, with the reason stated rather than
  // the data quietly left behind.
  assert.ok(preview.retained.purchases, 'retention must be declared, not silent');
  assert.match(preview.retained.purchases.reason, /financial record/i);
  // Nothing has been deleted by previewing.
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM leads WHERE email = $1', [email]);
  assert.equal(rows[0].n, 2);
});

test('erasure refuses without an exact typed address', async () => {
  const email = addr('confirm');
  await seedPerson(email);
  const wrong = await erasure.eraseContact({ email, confirmEmail: 'someone@else.test', requestedBy: 'tom', reason: 'requested' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /does not match/);
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM leads WHERE email = $1', [email]);
  assert.equal(rows[0].n, 2, 'a failed confirmation must delete nothing');
});

test('erasure refuses without a stated reason', async () => {
  const email = addr('reason');
  await seedPerson(email);
  const none = await erasure.eraseContact({ email, confirmEmail: email, requestedBy: 'tom', reason: '  ' });
  assert.equal(none.ok, false);
  assert.match(none.error, /reason is required/i);
});

test('erasure removes the person from the contact record AND the source rows', async () => {
  const email = addr('remove');
  await seedPerson(email);
  const result = await erasure.eraseContact({ email, confirmEmail: email.toUpperCase(), requestedBy: 'tom', reason: 'Erasure requested by the person' });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.removed.leads.count, 2);
  assert.equal(result.removed.crm_contacts.count, 1);
  for (const table of ['leads', 'crm_contacts']) {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE LOWER(TRIM(email)) = $1`, [email]);
    assert.equal(rows[0].n, 0, `${table} still holds the erased person`);
  }
});

test('the erased person does not come back on the next rebuild', async () => {
  const email = addr('resurrect');
  await seedPerson(email);
  await erasure.eraseContact({ email, confirmEmail: email, requestedBy: 'tom', reason: 'Erasure requested' });
  // The rebuild that runs on every boot.
  await crm.syncFromLeads();
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM crm_contacts WHERE email = $1', [email]);
  assert.equal(rows[0].n, 0, 'hiding rather than removing would resurrect the contact here');
});

test('the register evidences the erasure without storing the address', async () => {
  const email = addr('register');
  await seedPerson(email);
  await erasure.eraseContact({ email, confirmEmail: email, requestedBy: 'tom', reason: 'Erasure requested by email' });

  const { rows } = await db.query('SELECT * FROM crm_erasures WHERE email_hash = $1', [erasure.hashEmail(email)]);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.requested_by, 'tom');
  assert.match(row.reason, /Erasure requested/);
  // The whole register, as text, must not contain the address.
  const asText = JSON.stringify(row);
  assert.ok(!asText.includes(email), 'the register must not retain what was erased');
  assert.ok(!asText.includes(email.split('@')[0]), 'not even the local part');
  // But it can still answer the question the person will ask.
  assert.equal(await erasure.wasErased(email), true);
  assert.equal(await erasure.wasErased(addr('never-existed')), false);
});

// The race that this suite found when it first ran alongside the
// contacts suite: an erasure committing WHILE a rebuild is in flight.
// The rebuild is working from a snapshot taken before the erasure, so
// without a guard it writes the person straight back afterwards. Two
// defences are pinned here because each covers a different ordering.
test('a rebuild that overlaps an erasure does not resurrect the person', async () => {
  const email = addr('overlap');
  await seedPerson(email);

  // Start a rebuild, then erase while it is still running.
  const rebuilding = crm.syncFromLeads();
  const erased = await erasure.eraseContact({
    email, confirmEmail: email, requestedBy: 'tom', reason: 'Erasure requested mid-rebuild'
  });
  assert.equal(erased.ok, true, erased.error);
  await rebuilding;

  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM crm_contacts WHERE LOWER(TRIM(email)) = $1', [email]);
  assert.equal(rows[0].n, 0, 'an overlapping rebuild must not undo an erasure');
});

test('a NEW enquiry after an erasure is honoured rather than blocked forever', async () => {
  const email = addr('returning');
  await seedPerson(email);
  await erasure.eraseContact({ email, confirmEmail: email, requestedBy: 'tom', reason: 'Erasure requested' });

  // The same person comes back of their own accord, after the erasure.
  await db.query(
    `INSERT INTO leads (kind, name, email, message, created_at) VALUES ('contact', 'Test Person', $1, 'Getting back in touch', NOW() + INTERVAL '1 second')`,
    [email]
  );
  await crm.syncFromLeads();
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM crm_contacts WHERE LOWER(TRIM(email)) = $1', [email]);
  assert.equal(rows[0].n, 1, 'erasure removes history, it does not blacklist a person for life');
});
