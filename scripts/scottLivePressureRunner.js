// Scott AI Demonstration: one-shot runner for the PAID live-AI pressure
// suite (test/scott/liveAiPressure.test.js), for environments where the
// API key lives in the container rather than in the operator's shell.
//
// Spend control is the entire design of this file:
//
// - It runs only when RUN_SCOTT_LIVE_PRESSURE=true, a variable that is
//   set for one deploy and then removed.
// - Before spending anything it writes a marker row to scott_activity
//   and refuses to run again while that marker exists, because Railway
//   restarts containers on its own schedule: a flag alone would respend
//   on every restart until someone noticed. The marker is written BEFORE
//   the child starts, so even a crash mid-run fails closed on spend.
// - The child is the real `node --test` suite, unmodified, with
//   RUN_SCOTT_LIVE_AI=true added to its environment. Its TAP output is
//   streamed to stdout so the deployment log carries the actual
//   per-case results, not a summary someone wrote.
// - A hard 15 minute kill bounds a wedged child.
//
// It runs AFTER the server starts listening, detached from the request
// path, so the deploy goes healthy on time and a slow suite cannot fail
// the boot. Removing the marker (to deliberately re-run) is a manual
// SQL delete, on purpose.

const { spawn } = require('node:child_process');
const path = require('node:path');

const MARKER_EVENT = 'live_pressure_suite_run';
const AUTH_EVENT = 'live_pressure_authorised';
const AUTH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const KILL_AFTER_MS = 15 * 60 * 1000;

// The launch decision, pure so the guard can be tested without a database
// or any spend. A labelled run launches only when ALL of these hold:
//
//   1. the environment variable names a run label (not 'true'/'false');
//   2. that label has never been spent (no marker row);
//   3. a matching authorisation row exists in scott_activity, written
//      deliberately by scripts/armScottLivePressure.js within the last
//      24 hours.
//
// Requirement 3 was added on 30/08/2026 after two sessions operating the
// same staging service surprised each other: a fresh label plus a single
// variable change was enough to launch a paid run. Arming is now a
// two-step act (a database row AND the variable), so no variable change
// alone, by any session or deploy, can ever start a spend. The legacy
// 'true' spelling no longer launches anything; its run is spent history.
function decideLaunch({ armed, spentRows, authRows, aiEnabled, now }) {
  if (!armed || armed === 'false') return { launch: false, quiet: true };
  if (armed === 'true') {
    return { launch: false, reason: "the legacy 'true' spelling no longer launches anything; arm with scripts/armScottLivePressure.js and a fresh label" };
  }
  if (!aiEnabled) {
    return { launch: false, reason: 'live AI is not enabled in this environment, so the suite would skip rather than run' };
  }
  if (spentRows.length) {
    const r = spentRows[0];
    return { launch: false, reason: `run "${armed}" already spent (${new Date(r.created_at).toISOString()}: ${r.summary})` };
  }
  if (!authRows.length) {
    return { launch: false, reason: `run "${armed}" has no authorisation row; write one with scripts/armScottLivePressure.js before setting the variable` };
  }
  const freshAuth = authRows.find((r) => now - new Date(r.created_at).getTime() <= AUTH_MAX_AGE_MS);
  if (!freshAuth) {
    return { launch: false, reason: `run "${armed}" has an authorisation row but it is older than 24 hours; re-arm deliberately` };
  }
  return { launch: true, auth: freshAuth };
}

async function maybeRunLivePressureSuite(db) {
  const armed = process.env.RUN_SCOTT_LIVE_PRESSURE;
  if (!armed || armed === 'false') return;
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
      if (!decision.quiet) console.error(`Live pressure runner: NOT launching: ${decision.reason}. Remove RUN_SCOTT_LIVE_PRESSURE.`);
      return;
    }
    console.log(`Live pressure runner: run "${runLabel}" is authorised (${decision.auth.summary}).`);

    await db.query(
      'INSERT INTO scott_activity (actor, event_type, summary) VALUES ($1, $2, $3)',
      ['system', MARKER_EVENT, `Paid live-AI pressure suite launched [run ${runLabel}]. Marker written before spend so a container restart cannot pay twice.`]
    );
  } catch (err) {
    console.error('Live pressure runner: could not check the guard rows, so NOTHING was launched:', err.message);
    return;
  }

  console.log('Live pressure runner: starting test/scott/liveAiPressure.test.js. This spends real money on real model calls.');
  const child = spawn(process.execPath, ['--test', 'test/scott/liveAiPressure.test.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, RUN_SCOTT_LIVE_AI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const killer = setTimeout(() => {
    console.error('Live pressure runner: 15 minute limit reached, killing the suite. Whatever ran is in the log above; nothing further will be spent.');
    child.kill('SIGKILL');
  }, KILL_AFTER_MS);

  let sawExecution = false;
  child.stdout.on('data', (d) => {
    const text = String(d);
    // The suite's own after() prints how many live turns actually ran.
    // Without seeing that line, an exit 0 is a skip, not a pass.
    if (/LIVE AI: \d+ turn\(s\) executed/.test(text)) sawExecution = true;
    process.stdout.write(text.split('\n').map((l) => l && `PRESSURE| ${l}`).filter(Boolean).join('\n') + '\n');
  });
  child.stderr.on('data', (d) => process.stderr.write(String(d).split('\n').map((l) => l && `PRESSURE! ${l}`).filter(Boolean).join('\n') + '\n'));
  child.on('close', async (code) => {
    clearTimeout(killer);
    const verdict = code !== 0 ? `FAILED (exit ${code})`
      : sawExecution ? 'PASSED'
        : 'INCONCLUSIVE: exit 0 but no live turns were reported, which means the suite skipped instead of running';
    console.log(`Live pressure runner: suite finished, ${verdict}. Remove RUN_SCOTT_LIVE_PRESSURE now.`);
    try {
      await db.query(
        'INSERT INTO scott_activity (actor, event_type, summary) VALUES ($1, $2, $3)',
        ['system', `${MARKER_EVENT}_result`, `Paid live-AI pressure suite ${verdict} [run ${runLabel}]. Full per-case TAP output is in the deployment log for this boot.`]
      );
    } catch (err) {
      console.error('Live pressure runner: result row failed to write (the log above still holds the truth):', err.message);
    }
  });
}

module.exports = { maybeRunLivePressureSuite, decideLaunch, MARKER_EVENT, AUTH_EVENT, AUTH_MAX_AGE_MS };
