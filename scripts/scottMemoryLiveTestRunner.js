// One-shot runner for the PAID live-AI pressure suite proving the
// evolving fictional business memory feature
// (test/scott/memory/liveMemoryPressure.test.js), approved by Tom
// Arrington (31/08/2026) to run before any merge of
// feature/scott-evolving-memory to main.
//
// Same shape and the same spend controls as
// scripts/scottLivePressureRunner.js and
// scripts/workspaceLivePressureRunner.js, and DELIBERATELY a separate
// file with its own flag, its own marker event and its own
// authorisation event, so a run authorised for this feature can never
// spend on the existing Scott pressure suite or the workspace one.
//
// Spend control, in order:
//
// - Runs only when RUN_SCOTT_MEMORY_PRESSURE names a run label. 'true'
//   and 'false' launch nothing; a label is required so each run is
//   named and spent exactly once.
// - Refuses a label that already has a marker row in scott_activity, so
//   a container restart cannot respend.
// - Requires a matching authorisation row written deliberately by
//   scripts/armScottMemoryLiveTest.js within the last 24 hours.
// - Refuses to launch while ARM_SCOTT_MEMORY_PRESSURE is still set (the
//   mirror image of the arming script's own refusal), so arming and
//   spending can never be the same deploy.
// - Hard 15 minute kill on a wedged child.
//
// Runs after the server is listening, detached from the request path.
const { spawn } = require('node:child_process');
const path = require('node:path');

const MARKER_EVENT = 'scott_memory_pressure_run';
const AUTH_EVENT = 'scott_memory_pressure_authorised';
const AUTH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const KILL_AFTER_MS = 15 * 60 * 1000;

// Pure, so the guard is testable without a database and without spend.
function decideLaunch({ armed, spentRows, authRows, aiEnabled, now }) {
  if (!armed || armed === 'false') return { launch: false, quiet: true };
  if (armed === 'true') {
    return { launch: false, reason: "'true' is not a run label; arm with scripts/armScottMemoryLiveTest.js and a named label" };
  }
  if (!aiEnabled) {
    return { launch: false, reason: 'Scott live AI is not enabled in this environment, so the suite would skip rather than run' };
  }
  if (spentRows.length) {
    const r = spentRows[0];
    return { launch: false, reason: `run "${armed}" already spent (${new Date(r.created_at).toISOString()}: ${r.summary})` };
  }
  if (!authRows.length) {
    return { launch: false, reason: `run "${armed}" has no authorisation row; write one with scripts/armScottMemoryLiveTest.js before setting the variable` };
  }
  const freshAuth = authRows.find((r) => now - new Date(r.created_at).getTime() <= AUTH_MAX_AGE_MS);
  if (!freshAuth) {
    return { launch: false, reason: `run "${armed}" has an authorisation row but it is older than 24 hours; re-arm deliberately` };
  }
  return { launch: true, auth: freshAuth };
}

async function maybeRunMemoryLiveTest(db) {
  const armed = process.env.RUN_SCOTT_MEMORY_PRESSURE;
  if (!armed || armed === 'false') return;
  // Mirror image of armScottMemoryLiveTest.js's own refusal: if both
  // variables are present, one deploy could arm and spend, which is the
  // exact thing the two-step control exists to prevent.
  if (process.env.ARM_SCOTT_MEMORY_PRESSURE) {
    console.error('Scott memory pressure runner: NOT launching: ARM_SCOTT_MEMORY_PRESSURE is still set, so arming and spending would be one act. Remove it and redeploy.');
    return;
  }
  const runLabel = armed;

  try {
    const { rows: spentRows } = await db.query(
      'SELECT id, created_at, summary FROM scott_activity WHERE event_type = $1 AND summary LIKE $2 ORDER BY id DESC LIMIT 1',
      [MARKER_EVENT, `%[run ${runLabel}]%`]
    );
    const { rows: authRows } = await db.query(
      'SELECT id, created_at, summary FROM scott_activity WHERE event_type = $1 AND summary LIKE $2 ORDER BY id DESC LIMIT 5',
      [AUTH_EVENT, `%[run ${runLabel}]%`]
    );
    const decision = decideLaunch({
      armed,
      spentRows,
      authRows,
      aiEnabled: require('../lib/scott/orchestrator').isScottAIEnabled(),
      now: Date.now()
    });
    if (!decision.launch) {
      if (!decision.quiet) console.error(`Scott memory pressure runner: NOT launching: ${decision.reason}. Remove RUN_SCOTT_MEMORY_PRESSURE.`);
      return;
    }
    console.log(`Scott memory pressure runner: run "${runLabel}" is authorised (${decision.auth.summary}).`);
    await db.query(
      'INSERT INTO scott_activity (actor, event_type, summary) VALUES ($1, $2, $3)',
      ['system', MARKER_EVENT, `Paid Scott evolving-memory live-AI pressure suite launched [run ${runLabel}]. Marker written before spend so a container restart cannot pay twice.`]
    );
  } catch (err) {
    console.error('Scott memory pressure runner: could not check the guard rows, so NOTHING was launched:', err.message);
    return;
  }

  console.log('Scott memory pressure runner: starting test/scott/memory/liveMemoryPressure.test.js. This spends real money on real model calls.');
  const child = spawn(process.execPath, ['--test', 'test/scott/memory/liveMemoryPressure.test.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, RUN_SCOTT_MEMORY_LIVE_TEST: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const killer = setTimeout(() => {
    console.error('Scott memory pressure runner: 15 minute limit reached, killing the suite. Whatever ran is in the log above; nothing further will be spent.');
    child.kill('SIGKILL');
  }, KILL_AFTER_MS);

  let sawExecution = false;
  child.stdout.on('data', (d) => {
    const text = String(d);
    // Without this line an exit 0 is a skip, not a pass, and reporting
    // it as a pass would be the exact dishonesty the suite tests for.
    if (/EVOLVING MEMORY LIVE AI: \d+ turn\(s\) executed/.test(text)) sawExecution = true;
    process.stdout.write(text.split('\n').map((l) => l && `MEMPRESSURE| ${l}`).filter(Boolean).join('\n') + '\n');
  });
  child.stderr.on('data', (d) => process.stderr.write(String(d).split('\n').map((l) => l && `MEMPRESSURE! ${l}`).filter(Boolean).join('\n') + '\n'));
  child.on('close', async (code) => {
    clearTimeout(killer);
    const verdict = code !== 0 ? `FAILED (exit ${code})`
      : sawExecution ? 'PASSED'
        : 'INCONCLUSIVE: exit 0 but no live turns were reported, which means the suite skipped instead of running';
    console.log(`Scott memory pressure runner: suite finished, ${verdict}. Remove RUN_SCOTT_MEMORY_PRESSURE now.`);
    try {
      await db.query(
        'INSERT INTO scott_activity (actor, event_type, summary) VALUES ($1, $2, $3)',
        ['system', `${MARKER_EVENT}_result`, `Paid Scott evolving-memory live-AI pressure suite ${verdict} [run ${runLabel}]. Full per-case TAP output is in the deployment log for this boot.`]
      );
    } catch (err) {
      console.error('Scott memory pressure runner: result row failed to write (the log above still holds the truth):', err.message);
    }
  });
}

module.exports = { maybeRunMemoryLiveTest, decideLaunch, MARKER_EVENT, AUTH_EVENT, AUTH_MAX_AGE_MS };
