// Arrington AI Workspace: snapshot encryption.
//
// The workspace's seed content is an extract of REAL Arrington operating
// knowledge (strategy, opportunities, named commercial conversations).
// It must not sit in the repository as plaintext, so the committed file
// data/workspace-snapshot.enc is AES-256-GCM ciphertext. The key lives
// only in WORKSPACE_SNAPSHOT_KEY (a 64-char hex string, 32 bytes):
// set on the Railway service and in the operator's local shell, never
// committed, never logged, never printed by any code path in this repo.
// Without the key the app boots normally and the workspace simply has
// no seeded records, which the UI reports honestly as an ingest gap.

const crypto = require('node:crypto');

const MAGIC = 'AWSV1'; // file format marker, versioned

function keyFromEnv(value) {
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) return null;
  return Buffer.from(value, 'hex');
}

function encryptSnapshot(plaintextBuffer, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(MAGIC, 'ascii'), iv, tag, enc]);
}

function decryptSnapshot(fileBuffer, key) {
  const magic = fileBuffer.subarray(0, MAGIC.length).toString('ascii');
  if (magic !== MAGIC) throw new Error('not a workspace snapshot file');
  const iv = fileBuffer.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = fileBuffer.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const enc = fileBuffer.subarray(MAGIC.length + 28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

module.exports = { keyFromEnv, encryptSnapshot, decryptSnapshot, MAGIC };
