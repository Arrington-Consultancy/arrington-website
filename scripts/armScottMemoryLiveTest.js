// Deliberately authorise ONE future paid run of the evolving fictional
// memory live-AI pressure suite (test/scott/memory/liveMemoryPressure.test.js).
//
// Same two-step shape as scripts/armWorkspaceLivePressure.js and
// scripts/armScottLivePressure.js, and DELIBERATELY a separate file with
// its own flags, its own marker event and its own authorisation event.
// Sharing any of those with the existing Scott pressure suite or the
// workspace suite would mean a run authorised for one could spend on
// another.
//
//   1. Write the authorisation row for a named label.
//   2. Set RUN_SCOTT_MEMORY_PRESSURE=<label> on the service and deploy.
//
// scripts/scottMemoryLiveTestRunner.js refuses to launch unless BOTH the
// row and the variable exist, so no variable change alone can spend.
//
// Two ways to do step 1, same reasoning as the workspace script: a shell
// that can reach the target database, and a sandbox that cannot and has
// to arm through the container instead.
//
//   a. DATABASE_URL=... node scripts/armScottMemoryLiveTest.js <label> "<authorised by>"
//   b. Set ARM_SCOTT_MEMORY_PRESSURE=<label> and
//      ARM_SCOTT_MEMORY_PRESSURE_BY="<authorised by>" and deploy once.
//      The row is written at boot and nothing is launched.
//
// Route (b) is still two acts: armAtBoot refuses to write while
// RUN_SCOTT_MEMORY_PRESSURE is also set, and the runner refuses to
// launch while ARM_SCOTT_MEMORY_PRESSURE is still set. The two variables
// are mutually exclusive by construction.
const { AUTH_EVENT, MARKER_EVENT } = require('./scottMemoryLiveTestRunner');

function validLabel(label) {
  return !!label && label !== 'true' && label !== 'false' && !/\s/.test(label);
}

async function arm(db, label, authorisedBy) {
  if (!validLabel(label) || !authorisedBy) {
    throw new Error('A single-token label (not "true"/"false") and an authorising name are both required.');
  }
  const { rows: spent } = await db.query(
    'SELECT created_at FROM scott_activity WHERE event_type = $1 AND summary LIKE $2 LIMIT 1',
    [MARKER_EVENT, `%[run ${label}]%`]
  );
  if (spent.length) {
    throw new Error(`Run "${label}" was already spent at ${new Date(spent[0].created_at).toISOString()}. Pick a fresh label.`);
  }
  await db.query(
    'INSERT INTO scott_activity (actor, event_type, summary) VALUES ($1, $2, $3)',
    ['system', AUTH_EVENT, `Paid Scott evolving-memory live-AI pressure run authorised [run ${label}] by ${authorisedBy}. Valid for 24 hours; consumed by the one-shot runner.`]
  );
  return label;
}

// Route (b). Called at boot. Writes the row and launches nothing.
async function armAtBoot(db) {
  const label = process.env.ARM_SCOTT_MEMORY_PRESSURE;
  if (!label || label === 'false') return;
  if (process.env.RUN_SCOTT_MEMORY_PRESSURE) {
    console.error('Scott memory pressure arming: REFUSED. ARM_SCOTT_MEMORY_PRESSURE and RUN_SCOTT_MEMORY_PRESSURE are both set, which would make arming and spending one act. Set one, deploy, remove it, then set the other.');
    return;
  }
  const by = process.env.ARM_SCOTT_MEMORY_PRESSURE_BY;
  if (!by) {
    console.error('Scott memory pressure arming: REFUSED. ARM_SCOTT_MEMORY_PRESSURE_BY must name who authorised the spend.');
    return;
  }
  try {
    await arm(db, label, by);
    console.log(`Scott memory pressure arming: run "${label}" authorised by ${by}, valid 24 hours. Nothing has been spent. Now REMOVE ARM_SCOTT_MEMORY_PRESSURE, set RUN_SCOTT_MEMORY_PRESSURE=${label}, and deploy.`);
  } catch (err) {
    console.error(`Scott memory pressure arming: REFUSED. ${err.message}`);
  }
}

async function main() {
  const db = require('../db/pool');
  try {
    const label = await arm(db, process.argv[2], process.argv[3]);
    console.log(`Authorised run "${label}". Now set RUN_SCOTT_MEMORY_PRESSURE=${label} on the service and deploy within 24 hours. Remove the variable after the run.`);
    process.exit(0);
  } catch (err) {
    console.error(`Refusing: ${err.message}`);
    console.error('Usage: DATABASE_URL=... node scripts/armScottMemoryLiveTest.js <label> "<authorised by>"');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { arm, armAtBoot, validLabel };
