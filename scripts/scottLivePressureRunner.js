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
const KILL_AFTER_MS = 15 * 60 * 1000;

async function maybeRunLivePressureSuite(db) {
  const armed = process.env.RUN_SCOTT_LIVE_PRESSURE;
  if (!armed || armed === 'false') return;

  // The variable's value names the run. 'true' is the original 29/08/2026
  // run's legacy spelling; any other value is a distinct one-shot label
  // (e.g. 'activation-20260830'), so a deliberate re-run after a roster
  // change arms with a fresh label instead of manual SQL against the old
  // marker row. Each label still spends at most once, same guarantee.
  const runLabel = armed === 'true' ? 'v1' : armed;

  // If live AI is not genuinely enabled here, the suite would SKIP and
  // exit 0, and exit 0 must never be reported as a pass for a run that
  // never happened. Refuse before touching the marker, so the one-shot
  // is not spent on a misconfigured boot.
  if (!require('../lib/scott/orchestrator').isScottAIEnabled()) {
    console.error('Live pressure runner: live AI is not enabled in this environment, so the suite would skip rather than run. NOTHING was launched and the one-shot marker was not spent.');
    return;
  }

  try {
    // The 'v1' legacy label matches any marker row (the original run's
    // marker carries no label); a named label matches only its own rows.
    const { rows } = await db.query(
      runLabel === 'v1'
        ? 'SELECT id, created_at, summary FROM scott_activity WHERE event_type = $1 ORDER BY id DESC LIMIT 1'
        : 'SELECT id, created_at, summary FROM scott_activity WHERE event_type = $1 AND summary LIKE $2 ORDER BY id DESC LIMIT 1',
      runLabel === 'v1' ? [MARKER_EVENT] : [MARKER_EVENT, `%[run ${runLabel}]%`]
    );
    if (rows.length) {
      console.log(`Live pressure runner: run "${runLabel}" already spent (${rows[0].created_at.toISOString()}: ${rows[0].summary}). Remove RUN_SCOTT_LIVE_PRESSURE; a deliberate re-run means arming with a fresh label.`);
      return;
    }

    await db.query(
      'INSERT INTO scott_activity (actor, event_type, summary) VALUES ($1, $2, $3)',
      ['system', MARKER_EVENT, `Paid live-AI pressure suite launched [run ${runLabel}]. Marker written before spend so a container restart cannot pay twice.`]
    );
  } catch (err) {
    console.error('Live pressure runner: could not check or write the spend marker, so NOTHING was launched:', err.message);
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

module.exports = { maybeRunLivePressureSuite, MARKER_EVENT };
