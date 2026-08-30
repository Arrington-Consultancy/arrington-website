// One-way hash of a normalised email address, shared by the contact
// store and the erasure register so neither has to require the other.
// Used as a tombstone key: it identifies a person for the purpose of
// "was this erased" without any store having to keep the address.
const crypto = require('node:crypto');

function hashEmail(normalisedEmail) {
  return crypto.createHash('sha256').update(String(normalisedEmail)).digest('hex');
}

module.exports = { hashEmail };
