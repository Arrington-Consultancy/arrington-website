// Arrington AI Workspace: one-shot runner for the PAID live-AI pressure
// suite (test/workspace/liveAiPressure.test.js).
//
// Same shape and the same spend controls as
// scripts/scottLivePressureRunner.js, and DELIBERATELY a separate file
// with its own flag, its own marker event and its own authorisation
// event. Sharing either with Scott would mean a run authorised for one
// system could spend on the other, and the two are meant to be
// impossible to confuse.
//
// Spend control, in order:
//
// - Runs only when RUN_WORKSPACE_LIVE_PRESSURE names a run label. The
//   spellings 'true' and 'false' launch nothing; a label is required so
//   each run is named and spent exactly once.
// - Refuses a label that already has a marker row in workspace_activity.
//   Railway restarts containers on its own schedule, so a flag alone
//   would respend on every restart until somebody noticed. The marker is
//   written BEFORE the child starts, so a crash mid-run fails closed.
// - Requires a matching authorisation row written deliberately by
//   scripts/armWorkspaceLivePressure.js within the last 24 hours. Arming
//   is therefore two acts (a database row AND a variable), so no
//   variable change alone, by any session or deploy, can start a spend.
// - Hard 15 minute kill on a wedged child.
//
// Runs after the server is listening, detached from the request path.
const { spawn } = require('node:child_process');
const path = require('node:path');

const MARKER_EVENT = 'workspace_live_pressure_run';
const AUTH_EVENT = 'workspace_live_pressure_authorised';
const AUTH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const KILL_AFTER_MS = 15 * 60 * 1000;

// Pure, so the guard is testable without a database and without spend.
function decideLaunch({ armed, spentRows, authRows, aiEnabled, now }) {
  if (!armed || armed === 'false') return { launch: false, quiet: true };
  if (armed === 'true') {
    return { launch: false, reason: "'true' is not a run label; arm with scripts/armWorkspaceLivePressure.js and a named label" };
  }
  if (!aiEnabled) {
    return { launch: false, reason: 'workspace AI is not enabled in this environment, so the suite would skip rather than run' };
  }
  if (spentRows.length) {
    const r = spentRows[0];
    return { launch: false, reason: `run "${armed}" already spent (${new Date(r.created_at).toISOString()}: ${r.summary})` };
  }
  if (!authRows.length) {
    return { launch: false, reason: `run "${armed}" has no authorisation row; write one with scripts/armWorkspaceLivePressure.js before setting the variable` };
  }
  const freshAuth = authRows.find((r) => now - new Date(r.created_at).getTime() <= AUTH_MAX_AGE_MS);
  if (!freshAuth) {
    return { launch: false, reason: `run "${armed}" has an authorisation row but it is older than 24 hours; re-arm deliberately` };
  }
  return { launch: true, auth: freshAuth };
}

async function maybeRunWorkspacePressureSuite(db) {
  const armed = process.env.RUN_WORKSPACE_LIVE_PRESSURE;
  if (!armed || armed === 'false') return;
  // The other half of the mutual exclusion in
  // scripts/armWorkspaceLivePressure.js. If both variables are present,
  // one deploy could arm and spend, which is the thing the two-step
  // control exists to prevent.
  if (process.env.ARM_WORKSPACE_LIVE_PRESSURE) {
    console.error('Workspace pressure runner: NOT launching: ARM_WORKSPACE_LIVE_PRESSURE is still set, so arming and spending would be one act. Remove it and redeploy.');
    return;
  }
  const runLabel = armed;

  try {
    const { rows: spentRows } = await db.query(
      'SELECT id, created_at, summary FROM workspace_activity WHERE event_type = $1 AND summary LIKE $2 ORDER BY id DESC LIMIT 1',
      [MARKER_EVENT, `%[run ${runLabel}]%`]
    );
    const { rows: authRows } = await db.query(
      'SELECT id, created_at, summary FROM workspace_activity WHERE event_type = $1 AND summary LIKE $2 ORDER BY id DESC LIMIT 5',
      [AUTH_EVENT, `%[run ${runLabel}]%`]
    );
    const decision = decideLaunch({
      armed,
      spentRows,
      authRows,
      aiEnabled: require('../lib/workspace/orchestrator').isWorkspaceAIEnabled(),
      now: Date.now()
    });
    if (!decision.launch) {
      if (!decision.quiet) console.error(`Workspace pressure runner: NOT launching: ${decision.reason}. Remove RUN_WORKSPACE_LIVE_PRESSURE.`);
      return;
    }
    console.log(`Workspace pressure runner: run "${runLabel}" is authorised (${decision.auth.summary}).`);
    await db.query(
      'INSERT INTO workspace_activity (actor, event_type, summary) VALUES ($1, $2, $3)',
      ['system', MARKER_EVENT, `Paid workspace live-AI pressure suite launched [run ${runLabel}]. Marker written before spend so a container restart cannot pay twice.`]
    );
  } catch (err) {
    console.error('Workspace pressure runner: could not check the guard rows, so NOTHING was launched:', err.message);
    return;
  }

  console.log('Workspace pressure runner: starting test/workspace/liveAiPressure.test.js. This spends real money on real model calls.');
  const child = spawn(process.execPath, ['--test', 'test/workspace/liveAiPressure.test.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, RUN_WORKSPACE_LIVE_AI: runLabel },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const killer = setTimeout(() => {
    console.error('Workspace pressure runner: 15 minute limit reached, killing the suite. Whatever ran is in the log above; nothing further will be spent.');
    child.kill('SIGKILL');
  }, KILL_AFTER_MS);

  let sawExecution = false;
  child.stdout.on('data', (d) => {
    const text = String(d);
    // Without this line an exit 0 is a skip, not a pass, and reporting
    // it as a pass would be the exact dishonesty the suite tests for.
    if (/LIVE AI: \d+ turn\(s\) executed/.test(text)) sawExecution = true;
    process.stdout.write(text.split('\n').map((l) => l && `WSPRESSURE| ${l}`).filter(Boolean).join('\n') + '\n');
  });
  child.stderr.on('data', (d) => process.stderr.write(String(d).split('\n').map((l) => l && `WSPRESSURE! ${l}`).filter(Boolean).join('\n') + '\n'));
  child.on('close', async (code) => {
    clearTimeout(killer);
    const verdict = code !== 0 ? `FAILED (exit ${code})`
      : sawExecution ? 'PASSED'
        : 'INCONCLUSIVE: exit 0 but no live turns were reported, which means the suite skipped instead of running';
    console.log(`Workspace pressure runner: suite finished, ${verdict}. Remove RUN_WORKSPACE_LIVE_PRESSURE now.`);
    try {
      await db.query(
        'INSERT INTO workspace_activity (actor, event_type, summary) VALUES ($1, $2, $3)',
        ['system', `${MARKER_EVENT}_result`, `Paid workspace live-AI pressure suite ${verdict} [run ${runLabel}]. Full per-case TAP output is in the deployment log for this boot.`]
      );
    } catch (err) {
      console.error('Workspace pressure runner: result row failed to write (the log above still holds the truth):', err.message);
    }
  });
}

module.exports = { maybeRunWorkspacePressureSuite, decideLaunch, MARKER_EVENT, AUTH_EVENT, AUTH_MAX_AGE_MS };
