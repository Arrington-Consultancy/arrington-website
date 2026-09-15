// Scott demonstration: run the HTTP suites against the DEPLOYED build, from
// inside the container that is serving it.
//
// Why this exists rather than somebody running the suites from a laptop:
// the build sandbox has no outbound route to railway.app or to the staging
// hostname, so a claim that "the adversarial suite passes against staging"
// could not be made honestly from outside. Running a local instance of the
// same commit tests the same CODE, but it is not the same DEPLOYMENT — it
// misses everything the environment contributes, which on this service
// includes the real CANONICAL_HOST, the real session secret, the real
// database and the skip-login bypass. Those are exactly the things an
// access test should not be assuming.
//
// So the suites run here, in the container, against 127.0.0.1 on the port
// the app is actually listening on, and stream their real TAP output into
// the deployment log. Nobody has to trust a summary.
//
// SPEND: none. Both suites are free. This deliberately does NOT run the paid
// live-AI pressure suite, which has its own runner, its own two-step arming
// and its own marker (scripts/scottLivePressureRunner.js). The live Level 1
// ceiling probe, which DOES spend, is separate for the same reason
// (scripts/scottLevelOneProbe.js).
//
// Guards, in the shape this repo already uses:
//   - runs only when SCOTT_STAGING_CHECK names a run label;
//   - refuses on the live public site, whatever the label says;
//   - each label runs at most once, marked in scott_activity before the
//     child starts, because Railway restarts containers on its own and a
//     flag alone would re-run on every restart until someone noticed;
//   - a hard 10 minute kill bounds a wedged child;
//   - it never fails the boot: it is launched after the server is
//     listening and every error is caught and logged.

const { spawn } = require('node:child_process');
const path = require('node:path');

const MARKER_EVENT = 'staging_check_run';
const KILL_AFTER_MS = 10 * 60 * 1000;

const SUITES = [
  'test/scott/adversarialApi.test.js',
  'test/scott/progressionApi.test.js'
];

// WHICH BASE URL TO TEST AGAINST, and why this is not a detail.
//
// The first armed run failed with "could not reach /scott (status 301)".
// server.js forces HTTPS on every request that does not carry
// x-forwarded-proto: https, which Railway's edge adds and a loopback
// request does not. So http://127.0.0.1:PORT is redirected before any
// route runs.
//
// The right fix is not to suppress that redirect. It is to test the way a
// real visitor arrives: through the service's own public hostname, edge
// included. That is a strictly better test than loopback — it exercises
// the host rewrite, the canonical-host rule and TLS termination, which are
// three of the things this deployment actually contributes.
//
// Loopback stays as a fallback for the case where the container has no
// outbound route to its own edge, and there the x-forwarded-proto header
// is added deliberately to emulate what the edge would have sent. The log
// says which one was used, because a run through loopback proves slightly
// less than a run through the edge and nobody should have to guess which
// happened.
async function resolveBase(port) {
  const publicDomain = (process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  if (publicDomain) {
    const url = `https://${publicDomain}`;
    try {
      const res = await fetch(url + '/health', { redirect: 'manual' });
      if (res.status === 200) return { base: url, via: 'the public hostname, through the edge', headers: {} };
    } catch (e) { /* fall through to loopback */ }
  }
  return {
    base: `http://127.0.0.1:${port}`,
    via: 'loopback (the edge was not reachable from inside the container)',
    headers: { 'x-forwarded-proto': 'https' }
  };
}

// Pure, so the whole decision is testable without a database or a deploy.
function decideLaunch({ armed, spentRows, isPublicSite, hasStaffPassword }) {
  if (!armed || armed === 'false') return { launch: false, quiet: true };
  if (armed === 'true') {
    return { launch: false, reason: "SCOTT_STAGING_CHECK must name a run label, not 'true', so a re-run is a deliberate act" };
  }
  if (isPublicSite) {
    // The suites log in, switch persona and probe refusals. None of that
    // belongs on the public site, and the refusal is here rather than in
    // the caller so no future caller can forget it.
    return { launch: false, reason: 'refusing to run on the live public site' };
  }
  if (!hasStaffPassword) {
    return { launch: false, reason: 'SCOTT_DEMO_STAFF_PASSWORD is not set, so the adversarial suite would skip rather than run' };
  }
  if (spentRows && spentRows.length) {
    const r = spentRows[0];
    return { launch: false, reason: `run "${armed}" already done (${new Date(r.created_at).toISOString()})` };
  }
  return { launch: true, label: armed };
}

async function maybeRunStagingChecks(db, opts = {}) {
  const armed = (process.env.SCOTT_STAGING_CHECK || '').trim();
  const port = opts.port || process.env.PORT || 8080;
  const LIVE_PUBLIC_HOST = 'www.arringtonconsultancy.com';
  const isPublicSite = (process.env.CANONICAL_HOST || LIVE_PUBLIC_HOST).trim().toLowerCase() === LIVE_PUBLIC_HOST;

  let spentRows = [];
  try {
    if (armed && armed !== 'true' && armed !== 'false') {
      const { rows } = await db.query(
        "SELECT created_at, summary FROM scott_activity WHERE event_type = $1 AND summary LIKE $2 ORDER BY created_at DESC LIMIT 1",
        [MARKER_EVENT, `${armed} %`]
      );
      spentRows = rows;
    }
  } catch (err) {
    console.error('Scott staging check: could not read the marker, refusing to run:', err.message);
    return;
  }

  const decision = decideLaunch({
    armed,
    spentRows,
    isPublicSite,
    hasStaffPassword: !!(process.env.SCOTT_DEMO_STAFF_PASSWORD || '').trim()
  });

  if (!decision.launch) {
    if (!decision.quiet) console.log(`Scott staging check: not running (${decision.reason}).`);
    return;
  }

  // Marked BEFORE the child starts, so a crash mid-run fails closed rather
  // than re-running on the next restart.
  try {
    await db.query(
      "INSERT INTO scott_activity (actor, event_type, summary) VALUES ('system', $1, $2)",
      [MARKER_EVENT, `${decision.label} started ${new Date().toISOString()}`]
    );
  } catch (err) {
    console.error('Scott staging check: could not write the marker, refusing to run:', err.message);
    return;
  }

  const resolved = await resolveBase(port);
  const base = resolved.base;
  console.log(`Scott staging check "${decision.label}": running ${SUITES.length} HTTP suite(s) against the deployed build via ${resolved.via} (${base})`);
  if (base.startsWith('http://127.')) {
    console.log('Scott staging check: on loopback, so the edge header is emulated by scripts/forwardedProtoPreload.js. A run through the public hostname would prove slightly more.');
  }

  // The preload adds the edge's x-forwarded-proto header when, and only
  // when, we are on loopback. Over the public hostname the real edge adds
  // it and the preload stays inert.
  const preload = path.join(__dirname, 'forwardedProtoPreload.js');
  const child = spawn(process.execPath, ['--require', preload, '--test', ...SUITES], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      // The adversarial suite's own names, and the progression suite's.
      SCOTT_TEST_FORWARDED_PROTO: resolved.headers['x-forwarded-proto'] || '',
      SCOTT_TEST_BASE_URL: base,
      SCOTT_PROGRESSION_BASE_URL: base,
      SCOTT_PROGRESSION_TOM_PASSWORD: process.env.TOM_PASSWORD || '',
      // Belt and braces: the child must never launch a paid suite.
      RUN_SCOTT_LIVE_AI: '',
      RUN_SCOTT_LIVE_PRESSURE: '',
      SCOTT_STAGING_CHECK: ''
    },
    stdio: ['ignore', 'inherit', 'inherit']
  });

  // Resolves when the child exits, so a caller can wait. That matters:
  // the Level 1 probe and these suites hit the same server from the same
  // container, so they share an IP with the authed-write rate limiter. Run
  // together, the suites' POSTs exhausted the window and the probe's own
  // "set Level 1" call was refused — it reported "server reported null"
  // and asked nothing, which looked like a probe defect and was contention.
  return await new Promise((resolve) => {
    const kill = setTimeout(() => {
      console.error('Scott staging check: suite exceeded 10 minutes, killing it.');
      child.kill('SIGKILL');
    }, KILL_AFTER_MS);

    child.on('exit', (code) => {
      clearTimeout(kill);
      console.log(`Scott staging check "${decision.label}": finished with exit code ${code}. ${code === 0 ? 'ALL PASSED.' : 'THERE ARE FAILURES ABOVE.'}`);
      db.query(
        "INSERT INTO scott_activity (actor, event_type, summary) VALUES ('system', $1, $2)",
        [MARKER_EVENT, `${decision.label} finished exit=${code}`]
      ).catch(() => {});
      resolve();
    });

    child.on('error', (err) => {
      clearTimeout(kill);
      console.error('Scott staging check: could not start the suite:', err.message);
      resolve();
    });
  });
}

module.exports = { maybeRunStagingChecks, decideLaunch, MARKER_EVENT, SUITES };
