// Arrington AI Workspace: finance OAuth token encryption.
//
// Xero access and refresh tokens are bearer credentials over real
// banking data, so they are never stored in plaintext. Same discipline
// as lib/workspace/snapshotCrypto.js (AES-256-GCM, random IV per
// encryption) but keyed on its own secret, WORKSPACE_FINANCE_TOKEN_KEY
// (64-char hex, 32 bytes), deliberately separate from
// WORKSPACE_SNAPSHOT_KEY: the two protect different things with
// different blast radii, and rotating one must never touch the other.
// Without the key, nothing can be encrypted or decrypted and the
// connector reports itself unconfigured rather than falling back to
// plaintext.

const crypto = require('node:crypto');

function keyFromEnv(value = process.env.WORKSPACE_FINANCE_TOKEN_KEY) {
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) return null;
  return Buffer.from(value, 'hex');
}

// iv (12 bytes) + tag (16 bytes) + ciphertext, base64-encoded so it fits
// a TEXT column cleanly.
function encryptToken(plaintext, key = keyFromEnv()) {
  if (!key) throw new Error('WORKSPACE_FINANCE_TOKEN_KEY is not set or malformed; cannot encrypt a finance token.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptToken(encoded, key = keyFromEnv()) {
  if (!key) throw new Error('WORKSPACE_FINANCE_TOKEN_KEY is not set or malformed; cannot decrypt a finance token.');
  if (!encoded) return '';
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function tokenCryptoConfigured() {
  return !!keyFromEnv();
}

module.exports = { keyFromEnv, encryptToken, decryptToken, tokenCryptoConfigured };
