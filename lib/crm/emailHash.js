// Tombstone identifier for an erased address.
//
// Governance finding F4 (30/08/2026): this was an unsalted SHA-256, and
// the register claimed it held "not enough to rebuild a contact list
// from". That claim was false. An unsalted hash of an email address is a
// membership test: anyone who can read crm_erasures, which is anyone
// with database access, could confirm whether any address they could
// guess or already held had been erased, and the review demonstrated
// exactly that against a real register row.
//
// It is now an HMAC keyed on the server secret. The rebuild-time
// tombstone check works exactly as before, because both sides compute
// the same value, while the register becomes unusable to anyone without
// the key. Under UK GDPR a bare hash of an email is still personal data;
// this is the difference between saying that and being it.
//
// CONSEQUENCE, deliberately not hidden: changing the function
// invalidates every tombstone written under the old one. Those rows keep
// their evidential value (who erased what, when, and why) but will no
// longer match a recomputed hash, so a person erased before this change
// could be recreated by a rebuild if their old lead rows somehow
// returned. That is acceptable only because erasure also deletes the
// source rows, so there is nothing left to rebuild them from.
const crypto = require('node:crypto');

function hashEmail(normalisedEmail) {
  const key = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
  return crypto.createHmac('sha256', key).update(String(normalisedEmail)).digest('hex');
}

module.exports = { hashEmail };
