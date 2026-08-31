// Deliberately authorise ONE future paid workspace live-AI pressure run.
//
// Arming is a two-step act, and the two steps cannot be collapsed:
//
//   1. Write the authorisation row for a named label.
//   2. Set RUN_WORKSPACE_LIVE_PRESSURE=<label> on the service and deploy.
//
// The runner refuses to launch unless BOTH the row and the variable
// exist, so no variable change alone can start a spend.
//
// There are two ways to do step 1, because a sandbox that can reach the
// database and a sandbox that cannot are both real situations here:
//
//   a. From a shell that can reach the database:
//        DATABASE_URL=... node scripts/armWorkspaceLivePressure.js <label> "<authorised by>"
//
//   b. From inside the container, when the database is only reachable
//      there: set ARM_WORKSPACE_LIVE_PRESSURE=<label> and
//      ARM_WORKSPACE_LIVE_PRESSURE_BY="<authorised by>" and deploy once.
//      The row is written at boot and NOTHING is launched.
//
// Route (b) is still two acts, because armAtBoot REFUSES to write while
// RUN_WORKSPACE_LIVE_PRESSURE is also set, and the runner REFUSES to
// launch while ARM_WORKSPACE_LIVE_PRESSURE is still set. The two
// variables are mutually exclusive by construction, so a single deploy
// can arm or run, never both.
const { AUTH_EVENT, MARKER_EVENT } = require('./workspaceLivePressureRunner');

function validLabel(label) {
  return !!label && label !== 'true' && label !== 'false' && !/\s/.test(label);
}

async function arm(db, label, authorisedBy) {
  if (!validLabel(label) || !authorisedBy) {
    throw new Error('A single-token label (not "true"/"false") and an authorising name are both required.');
  }
  const { rows: spent } = await db.query(
    'SELECT created_at FROM workspace_activity WHERE event_type = $1 AND summary LIKE $2 LIMIT 1',
    [MARKER_EVENT, `%[run ${label}]%`]
  );
  if (spent.length) {
    throw new Error(`Run "${label}" was already spent at ${new Date(spent[0].created_at).toISOString()}. Pick a fresh label.`);
  }
  await db.query(
    'INSERT INTO workspace_activity (actor, event_type, summary) VALUES ($1, $2, $3)',
    ['system', AUTH_EVENT, `Paid workspace live-AI pressure run authorised [run ${label}] by ${authorisedBy}. Valid for 24 hours; consumed by the one-shot runner.`]
  );
  return label;
}

// Route (b). Called at boot. Writes the row and launches nothing.
async function armAtBoot(db) {
  const label = process.env.ARM_WORKSPACE_LIVE_PRESSURE;
  if (!label || label === 'false') return;
  if (process.env.RUN_WORKSPACE_LIVE_PRESSURE) {
    console.error('Workspace pressure arming: REFUSED. ARM_WORKSPACE_LIVE_PRESSURE and RUN_WORKSPACE_LIVE_PRESSURE are both set, which would make arming and spending one act. Set one, deploy, remove it, then set the other.');
    return;
  }
  const by = process.env.ARM_WORKSPACE_LIVE_PRESSURE_BY;
  if (!by) {
    console.error('Workspace pressure arming: REFUSED. ARM_WORKSPACE_LIVE_PRESSURE_BY must name who authorised the spend.');
    return;
  }
  try {
    await arm(db, label, by);
    console.log(`Workspace pressure arming: run "${label}" authorised by ${by}, valid 24 hours. Nothing has been spent. Now REMOVE ARM_WORKSPACE_LIVE_PRESSURE, set RUN_WORKSPACE_LIVE_PRESSURE=${label}, and deploy.`);
  } catch (err) {
    console.error(`Workspace pressure arming: REFUSED. ${err.message}`);
  }
}

async function main() {
  const db = require('../db/pool');
  try {
    const label = await arm(db, process.argv[2], process.argv[3]);
    console.log(`Authorised run "${label}". Now set RUN_WORKSPACE_LIVE_PRESSURE=${label} on the service and deploy within 24 hours. Remove the variable after the run.`);
    process.exit(0);
  } catch (err) {
    console.error(`Refusing: ${err.message}`);
    console.error('Usage: DATABASE_URL=... node scripts/armWorkspaceLivePressure.js <label> "<authorised by>"');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { arm, armAtBoot, validLabel };
