// Deliberately authorise ONE future paid live-AI pressure run.
//
// Arming a paid run is a two-step act since 30/08/2026:
//
//   1. Run this script against the target environment's database:
//        DATABASE_URL=... node scripts/armScottLivePressure.js <label> "<authorised by>"
//   2. Set RUN_SCOTT_LIVE_PRESSURE=<label> on the service and deploy.
//
// The runner (scripts/scottLivePressureRunner.js) refuses to launch
// unless BOTH exist: the authorisation row this script writes and the
// matching variable. A variable change alone, by any session or deploy,
// can never start a spend. Authorisations expire after 24 hours, and a
// label that has already been spent can never launch again.
const db = require('../db/pool');
const { AUTH_EVENT, MARKER_EVENT } = require('./scottLivePressureRunner');

async function main() {
  const label = process.argv[2];
  const authorisedBy = process.argv[3];
  if (!label || !authorisedBy || label === 'true' || label === 'false' || /\s/.test(label)) {
    console.error('Usage: node scripts/armScottLivePressure.js <label> "<authorised by>"');
    console.error('The label must be a single token (e.g. postfix-20260901) and must not be "true" or "false".');
    process.exit(1);
  }
  const { rows: spent } = await db.query(
    'SELECT created_at FROM scott_activity WHERE event_type = $1 AND summary LIKE $2 LIMIT 1',
    [MARKER_EVENT, `%[run ${label}]%`]
  );
  if (spent.length) {
    console.error(`Refusing: run "${label}" was already spent at ${spent[0].created_at.toISOString()}. Pick a fresh label.`);
    process.exit(1);
  }
  await db.query(
    'INSERT INTO scott_activity (actor, event_type, summary) VALUES ($1, $2, $3)',
    ['system', AUTH_EVENT, `Paid live-AI pressure run authorised [run ${label}] by ${authorisedBy}. Valid for 24 hours; consumed by the one-shot runner.`]
  );
  console.log(`Authorised run "${label}" (by ${authorisedBy}). Now set RUN_SCOTT_LIVE_PRESSURE=${label} on the service and deploy within 24 hours. Remove the variable after the run.`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => { console.error('Arming failed:', err.message); process.exit(1); });
}
