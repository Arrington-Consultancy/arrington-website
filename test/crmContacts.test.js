// Contacts (CRM): one record per person, built from the lead history.
//
// Two properties matter most and are pinned here: the same person
// arriving through several routes is ONE contact, and a rebuild is
// idempotent, because the sync runs on every boot and a duplicate-on-
// every-restart bug would be invisible until the list was useless.
//
// These run against whatever DATABASE_URL points at, in their own
// email namespace, and clean up after themselves.
const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db/pool');
const crm = require('../lib/crm/contacts');

const NS = `crmtest-${Date.now()}`;
const email = (n) => `${NS}-${n}@example.test`;

test.after(async () => {
  // Matched anywhere in the string, not as a prefix: one case
  // deliberately inserts an address with surrounding whitespace, which a
  // prefix match would leave behind to confuse the next run.
  await db.query('DELETE FROM crm_contacts WHERE email LIKE $1', [`%${NS}%`]);
  await db.query('DELETE FROM leads WHERE email LIKE $1', [`%${NS}%`]);
});

test('an email is normalised, so case and stray spaces are the same person', () => {
  assert.equal(crm.normaliseEmail('  Tom@Example.COM '), 'tom@example.com');
  assert.equal(crm.normaliseEmail('not-an-email'), null);
  assert.equal(crm.normaliseEmail(''), null);
  assert.equal(crm.normaliseEmail(null), null);
});

test('one person arriving through several routes is one contact with several interactions', async () => {
  const who = email('multi');
  await db.query(
    `INSERT INTO leads (kind, name, email, message, signup_source) VALUES
       ('contact', 'Sam Reed', $1, 'First enquiry', ''),
       ('market_ready_test', 'Sam Reed', $2, 'Score 61/100', 'google'),
       ('pdf_download', '', $3, '', '')`,
    [who, who.toUpperCase(), ` ${who} `]
  );
  await crm.syncFromLeads();

  const { rows } = await db.query('SELECT * FROM crm_contacts WHERE email = $1', [who]);
  assert.equal(rows.length, 1, 'three submissions, one person, one record');
  const contact = await crm.contactWithHistory(rows[0].id);
  assert.equal(contact.interaction_count, 3);
  assert.equal(contact.events.length, 3);
  assert.equal(contact.name, 'Sam Reed', 'a later submission with no name must not erase the name we had');
  assert.equal(contact.used_google_prefill, true, 'using the button once is remembered');
});

test('a rebuild is idempotent: running the sync again adds nothing', async () => {
  const who = email('idem');
  await db.query(`INSERT INTO leads (kind, name, email, message) VALUES ('contact', 'Ann Hill', $1, 'Hello')`, [who]);
  await crm.syncFromLeads();
  const first = await crm.syncFromLeads();
  assert.equal(first.eventsAdded, 0, 'a second sync must add no interactions');
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS n FROM crm_contact_events e JOIN crm_contacts c ON c.id = e.contact_id WHERE c.email = $1',
    [who]
  );
  assert.equal(rows[0].n, 1);
});

test('the Google source is recorded per interaction, not smeared across the contact', async () => {
  const who = email('source');
  await db.query(
    `INSERT INTO leads (kind, name, email, message, signup_source) VALUES
       ('contact', 'Jo Blake', $1, 'Typed this one', ''),
       ('product_guide', 'Jo Blake', $1, 'Used the button', 'google')`,
    [who]
  );
  await crm.syncFromLeads();
  const { rows } = await db.query('SELECT id FROM crm_contacts WHERE email = $1', [who]);
  const contact = await crm.contactWithHistory(rows[0].id);
  const sources = contact.events.map((e) => e.signup_source).sort();
  assert.deepEqual(sources, ['', 'google'], 'each interaction keeps its own source');
  assert.equal(contact.used_google_prefill, true);
});

test('a lead with an unusable email is skipped rather than guessed at', async () => {
  // Scoped to this suite's own namespace: the whole test run shares one
  // database and other suites create and erase contacts concurrently, so
  // a global count would measure them rather than this behaviour.
  const bad = `not-an-email-${NS}`;
  await db.query(`INSERT INTO leads (kind, name, email, message) VALUES ('contact', 'Broken', $1, 'x')`, [bad]);
  await crm.syncFromLeads();
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM crm_contacts WHERE email LIKE $1', [`%${bad}%`]);
  assert.equal(rows[0].n, 0, 'no contact is invented from an unusable address');
  await db.query('DELETE FROM leads WHERE email = $1', [bad]);
});

test('search finds a contact by email, name or company', async () => {
  const who = email('search');
  await db.query(`INSERT INTO leads (kind, name, email, message) VALUES ('contact', 'Priya Shah', $1, 'Hi')`, [who]);
  await crm.syncFromLeads();
  const byName = await crm.listContacts({ q: 'Priya Shah' });
  assert.ok(byName.some((c) => c.email === who));
  const byEmail = await crm.listContacts({ q: NS });
  assert.ok(byEmail.length > 0);
});
