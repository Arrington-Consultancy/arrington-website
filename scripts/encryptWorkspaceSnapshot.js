// Build data/workspace-snapshot.enc from a plaintext snapshot JSON.
//
// Usage:
//   WORKSPACE_SNAPSHOT_KEY=<64-hex> node scripts/encryptWorkspaceSnapshot.js <plaintext.json>
//
// The plaintext file lives OUTSIDE the repository (a scratch directory
// or the operator's machine) and is never committed; only the ciphertext
// is. To mint a key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Set the same key on the Railway service so boot-time ingest can read
// the snapshot. The key is never printed by this script or any other.

const fs = require('node:fs');
const path = require('node:path');
const { keyFromEnv, encryptSnapshot } = require('../lib/workspace/snapshotCrypto');
const { validateRecord } = require('../lib/workspace/ingest');

function main() {
  const src = process.argv[2];
  if (!src || !fs.existsSync(src)) {
    console.error('Usage: WORKSPACE_SNAPSHOT_KEY=<64-hex> node scripts/encryptWorkspaceSnapshot.js <plaintext.json>');
    process.exit(1);
  }
  const key = keyFromEnv(process.env.WORKSPACE_SNAPSHOT_KEY);
  if (!key) {
    console.error('WORKSPACE_SNAPSHOT_KEY must be a 64-character hex string. (Its value is never printed.)');
    process.exit(1);
  }
  const plaintext = fs.readFileSync(src);
  const snapshot = JSON.parse(plaintext.toString('utf8'));
  if (snapshot.version !== 1 || !Array.isArray(snapshot.records)) {
    console.error('Refusing: the snapshot must be { version: 1, generated_at, records: [...] }.');
    process.exit(1);
  }
  const problems = snapshot.records.map(validateRecord).filter(Boolean);
  if (problems.length) {
    console.error(`Refusing: ${problems.length} invalid record(s):\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  const out = path.join(__dirname, '..', 'data', 'workspace-snapshot.enc');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encryptSnapshot(plaintext, key));
  console.log(`Encrypted ${snapshot.records.length} record(s) to ${out}. Commit the .enc file only; delete or keep the plaintext outside the repo.`);
}

if (require.main === module) main();
