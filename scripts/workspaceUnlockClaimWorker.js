// One process, one claim attempt, released at a shared wall-clock instant.
//
// It lives in scripts/ rather than beside its test because node --test
// collects every file under test/, and a helper that expects arguments
// fails as a test when run with none.
//
// This exists as a separate file because the defect it guards against
// CANNOT be reproduced inside a single process: eight concurrent calls in
// one event loop serialise by luck often enough to be reliably green
// while the property is false. Twelve processes racing a shared start
// time reproduce it every round.
//
// Usage: node unlockClaimWorker.js <startAtEpochMs> <subject>
// Prints one JSON line: { id, err } - id non-null means this process won
// the right to send.
const path = require('path');
const alert = require(path.join(__dirname, '../lib/workspace/unlockAlert'));
const db = require(path.join(__dirname, '../db/pool'));

(async () => {
  const startAt = Number(process.argv[2]);
  const subject = process.argv[3];
  let id = null;
  let err = null;
  try {
    await db.query('SELECT 1'); // establish the connection before the gun
    while (Date.now() < startAt) { /* spin to the shared instant */ }
    id = (await alert.claimAlertSlot(db, { username: subject, now: Date.now(), failuresInWindow: 10 })).id;
  } catch (e) {
    err = e.message;
  }
  process.stdout.write(`${JSON.stringify({ id, err })}\n`);
  await db.end().catch(() => {});
})();
