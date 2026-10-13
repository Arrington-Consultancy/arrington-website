// Fix brief of 12/10/2026, item 1: SESSION_SECRET has one reader, and
// production refuses both a missing value and the development value, so no
// session, download link or Contact conversion token is ever signed with a
// key anybody can read in this public repository.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  getSessionSecret, sessionSecretProblem, describeSessionSecret, DEV_SESSION_SECRET
} = require('../lib/sessionSecret');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const REAL = 'a-real-secret-0123456789abcdef';

test('production refuses a missing, blank or development secret', () => {
  for (const prod of [{ RAILWAY_ENVIRONMENT: 'production' }, { NODE_ENV: 'production' }]) {
    for (const value of [undefined, '', '   ', DEV_SESSION_SECRET, ` ${DEV_SESSION_SECRET}\n`]) {
      const env = { ...prod };
      if (value !== undefined) env.SESSION_SECRET = value;
      assert.throws(() => getSessionSecret(env), /FATAL/, JSON.stringify(env));
      assert.ok(sessionSecretProblem(env));
    }
  }
});

test('a real secret is returned exactly as set, never trimmed', () => {
  const env = { RAILWAY_ENVIRONMENT: 'production', SESSION_SECRET: REAL + '\n' };
  assert.strictEqual(getSessionSecret(env), REAL + '\n');
  assert.strictEqual(sessionSecretProblem(env), null);
});

test('locally, a missing secret falls back to the development value', () => {
  assert.strictEqual(getSessionSecret({}), DEV_SESSION_SECRET);
  assert.strictEqual(getSessionSecret({ SESSION_SECRET: REAL }), REAL);
});

test('the boot description never contains the value', () => {
  const line = describeSessionSecret({ RAILWAY_ENVIRONMENT: 'production', SESSION_SECRET: REAL });
  assert.ok(!line.includes(REAL));
  assert.match(line, /set \(30 chars\), not the development value/);
  assert.match(describeSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: DEV_SESSION_SECRET }), /development value/);
});

test('the development value and the old fallback appear nowhere else', () => {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'test'].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) files.push(full);
    }
  })(root);
  for (const f of files) {
    const rel = path.relative(root, f);
    const src = fs.readFileSync(f, 'utf8');
    if (rel !== path.join('lib', 'sessionSecret.js')) {
      assert.ok(!src.includes(DEV_SESSION_SECRET), `${rel} carries its own development secret`);
    }
    assert.ok(!/process\.env\.SESSION_SECRET\s*\|\|/.test(src), `${rel} has its own SESSION_SECRET fallback`);
  }
  for (const f of ['server.js', 'routes/leads.js', 'lib/contactConversion.js']) {
    assert.match(read(f), /getSessionSecret/, `${f} must use the shared reader`);
  }
});

// The real thing: server.js itself, started as production with a bad secret,
// exits 1 with FATAL before it listens. The child gets an environment built
// here, never this shell's, so an exported secret cannot change the result.
function boot(extra) {
  const env = { RAILWAY_ENVIRONMENT: 'production', PORT: '0', ...extra };
  return spawnSync(process.execPath, ['server.js'], { cwd: root, env, encoding: 'utf8', timeout: 20000 });
}

test('server.js refuses to start in production without the real secret', () => {
  for (const extra of [{}, { SESSION_SECRET: DEV_SESSION_SECRET }]) {
    const r = boot(extra);
    assert.strictEqual(r.status, 1, JSON.stringify(extra) + '\n' + r.stdout + r.stderr);
    assert.match(r.stderr, /FATAL: SESSION_SECRET (is not set|is the development value)/);
    assert.ok(!/running on port/.test(r.stdout));
  }
});
