// Weekly database backup to Google Drive: backup/backup.sh.
//
// Two halves. The source half always runs and pins the shape of the
// script and its Dockerfile: it fails closed, leaves the session rows
// out, never echoes a secret, and the container runs the script rather
// than a database server. The HTTP half runs the REAL script, with real
// pg_dump, against a seeded database and a mock of the two Google
// endpoints it uses (the token endpoint and the Drive v3 API), and
// asserts what landed in "Drive": one complete gzipped dump named by
// date, the stored size read back, the two oldest backups beyond the
// keep count deleted, and a file the script did not create left alone.
// It is gated on BACKUP_TEST_DATABASE_URL because it needs pg_dump and a
// database to dump; this sandbox cannot reach Google, which is why the
// mock exists at all.
//
// What this does NOT prove: that Google accepts the requests. The shapes
// follow the Drive v3 documentation (resumable upload, files.list with a
// q filter, files.delete) and the first real run on Railway is where
// that gets confirmed, by its deploy log.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'backup', 'backup.sh');
const DOCKERFILE = path.join(ROOT, 'backup', 'Dockerfile');
const SRC = fs.readFileSync(SCRIPT, 'utf8');
const DOCKER = fs.readFileSync(DOCKERFILE, 'utf8');

test('the script fails closed and never prints a secret', () => {
  assert.match(SRC, /^set -euo pipefail$/m, 'set -euo pipefail, so a failed pg_dump or curl fails the run');
  assert.match(SRC, /--exclude-table-data=session/, 'session rows are live login cookies and are left out');
  assert.match(SRC, /PostgreSQL database dump complete/, 'a dump that does not end with pg_dump\'s completion line is a failure');
  assert.match(SRC, /BACKUP_MIN_BYTES/, 'a trivially small dump is a failure, not a backup');
  // No log or error line may interpolate the database URL or a token.
  for (const line of SRC.split('\n')) {
    // The one printf that handles the token writes it to the header file,
    // never to a stream anyone reads; every other printf/echo/log/fail line
    // ends up in the deploy log and must be clean.
    if (/^\s*(log|fail|printf|echo)\b/.test(line) && !/> "\$HDR"$/.test(line)) {
      assert.doesNotMatch(line, /\$DB_URL|\$\{DATABASE_URL|\$ACCESS_TOKEN|\$REFRESH_TOKEN|\$CLIENT_SECRET|\$TOKEN_JSON/, `a log line must not carry a secret: ${line.trim()}`);
    }
  }
  // The bearer token travels in a header file, never in a process argument.
  assert.match(SRC, /-H @"\$HDR"/, 'the Authorization header is read from a file');
  assert.doesNotMatch(SRC, /Authorization: Bearer \$ACCESS_TOKEN"\s*"?\s*\$API/, 'the token must not be passed inline to curl');
  // Pruning touches only files this script named.
  assert.match(SRC, /\^\$PREFIX-\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\\\\\.sql\\\\\.gz\$/, 'only date-named backups are ever deleted');
});

test('the Dockerfile runs the script and not a database server', () => {
  assert.match(DOCKER, /^FROM postgres:18-alpine$/m, 'pg_dump must be at least the server\'s major version (production runs postgres-ssl:18)');
  assert.match(DOCKER, /^ENTRYPOINT \[\]$/m, 'the postgres image\'s entrypoint would start a server; it must be cleared');
  assert.match(DOCKER, /^CMD \["bash", "\/usr\/local\/bin\/backup\.sh"\]$/m);
  assert.match(DOCKER, /apk add --no-cache[^\n]*\bcurl\b/, 'curl is needed for the upload');
  assert.match(DOCKER, /apk add --no-cache[^\n]*\bjq\b/, 'jq is needed to read Google\'s replies');
});

// ---------------------------------------------------------------------------
// The HTTP half: the real script against a mock of Google.

const DB = process.env.BACKUP_TEST_DATABASE_URL;

function mockGoogle({ refreshToken, driveDisabled = false }) {
  // In-memory Drive: folders and files, each {id, name, mimeType, parents, createdTime, bytes}.
  const store = new Map();
  let next = 1;
  const newId = (p) => `${p}${String(next++).padStart(4, '0')}`;
  const sessions = new Map();
  const calls = [];
  const ACCESS = 'mock-access-token-xyz';

  const readBody = (req) => new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
  const json = (res, code, obj, headers = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(obj));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const body = await readBody(req);
    calls.push({ method: req.method, path: url.pathname, auth: req.headers.authorization || '' });

    if (req.method === 'POST' && url.pathname === '/token') {
      const p = new URLSearchParams(body.toString());
      if (p.get('grant_type') !== 'refresh_token' || p.get('refresh_token') !== refreshToken || !p.get('client_id') || !p.get('client_secret')) {
        return json(res, 400, { error: 'invalid_grant', error_description: 'Bad Request' });
      }
      return json(res, 200, { access_token: ACCESS, expires_in: 3599, token_type: 'Bearer' });
    }
    if (req.headers.authorization !== `Bearer ${ACCESS}`) return json(res, 401, { error: { code: 401, message: 'Invalid Credentials' } });
    // What Google answers when the Drive API is switched off in the Cloud
    // project the OAuth client belongs to (the first live run, 19/10/2026).
    if (driveDisabled) {
      return json(res, 403, { error: { code: 403, message: 'Google Drive API has not been used in project 123456 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=123456 then retry.', status: 'PERMISSION_DENIED' } });
    }

    if (req.method === 'GET' && url.pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') || '';
      let files = [...store.values()].filter((f) => !f.trashed);
      const nameEq = /name = '([^']+)'/.exec(q);
      if (nameEq) files = files.filter((f) => f.name === nameEq[1]);
      if (/mimeType = 'application\/vnd\.google-apps\.folder'/.test(q)) files = files.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
      const parent = /'([^']+)' in parents/.exec(q);
      if (parent) files = files.filter((f) => (f.parents || []).includes(parent[1]));
      const contains = /name contains '([^']+)'/.exec(q);
      if (contains) files = files.filter((f) => f.name.includes(contains[1]));
      if ((url.searchParams.get('orderBy') || '') === 'createdTime desc') files.sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1));
      return json(res, 200, { files: files.map(({ id, name, createdTime }) => ({ id, name, createdTime })) });
    }
    if (req.method === 'POST' && url.pathname === '/drive/v3/files') {
      const meta = JSON.parse(body.toString());
      const id = newId('folder');
      store.set(id, { id, ...meta, createdTime: new Date().toISOString() });
      return json(res, 200, { id });
    }
    if (req.method === 'POST' && url.pathname === '/upload/drive/v3/files') {
      if (url.searchParams.get('uploadType') !== 'resumable') return json(res, 400, { error: 'expected resumable' });
      const meta = JSON.parse(body.toString());
      const sid = newId('sess');
      sessions.set(sid, { meta, declared: Number(req.headers['x-upload-content-length']) });
      res.writeHead(200, { Location: `http://127.0.0.1:${server.address().port}/upload/session/${sid}` });
      return res.end();
    }
    if (req.method === 'PUT' && url.pathname.startsWith('/upload/session/')) {
      const s = sessions.get(url.pathname.split('/').pop());
      if (!s) return json(res, 404, { error: 'no such session' });
      const id = newId('file');
      store.set(id, { id, name: s.meta.name, parents: s.meta.parents, mimeType: 'application/gzip', bytes: body, createdTime: new Date().toISOString() });
      return json(res, 200, { id, name: s.meta.name, size: String(body.length) });
    }
    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (one && req.method === 'GET') {
      const f = store.get(one[1]);
      if (!f) return json(res, 404, { error: 'not found' });
      return json(res, 200, { id: f.id, name: f.name, size: f.bytes ? String(f.bytes.length) : undefined });
    }
    if (one && req.method === 'DELETE') {
      if (!store.has(one[1])) return json(res, 404, { error: 'not found' });
      store.delete(one[1]);
      res.writeHead(204);
      return res.end();
    }
    return json(res, 404, { error: `unhandled ${req.method} ${url.pathname}` });
  });

  return {
    store, calls, newId,
    listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port))),
    close: () => new Promise((r) => server.close(r))
  };
}

// Asynchronous on purpose: the mock Google server lives in this same
// process, and a spawnSync would block the event loop so the server could
// never answer the script. The first version of this test hung on exactly
// that.
function runScript(env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [SCRIPT], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME || '/tmp', ...env }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
}

test('the real script against a mock Drive: one complete dump up, two oldest down, the stranger left alone',
  { skip: !DB && 'set BACKUP_TEST_DATABASE_URL to a seeded database (the suite only reads it)' },
  async () => {
    const google = mockGoogle({ refreshToken: 'rt-secret-123' });
    const port = await google.listen();
    try {
      // The folder already exists with thirteen earlier backups and one
      // file Tom dropped in by hand. KEEP=12: after today's upload there
      // are fourteen backups, so the two oldest go and the stranger stays.
      const folderId = google.newId('folder');
      google.store.set(folderId, { id: folderId, name: 'Arrington website database backups', mimeType: 'application/vnd.google-apps.folder', createdTime: '2026-07-01T00:00:00.000Z' });
      const old = [];
      for (let i = 13; i >= 1; i -= 1) {
        const d = new Date(Date.UTC(2026, 9, 14) - i * 7 * 86400000).toISOString();
        const id = google.newId('file');
        const name = `arrington-website-db-${d.slice(0, 10)}.sql.gz`;
        google.store.set(id, { id, name, parents: [folderId], mimeType: 'application/gzip', bytes: Buffer.from('old'), createdTime: d });
        old.push({ id, name, createdTime: d });
      }
      const strangerId = google.newId('file');
      google.store.set(strangerId, { id: strangerId, name: 'arrington-website-db-notes-from-tom.txt', parents: [folderId], mimeType: 'text/plain', bytes: Buffer.from('keep me'), createdTime: '2025-01-01T00:00:00.000Z' });

      const r = await runScript({
        DATABASE_URL: `${DB}\n`, // Railway's trailing-newline failure mode, deliberately
        GOOGLE_DRIVE_CLIENT_ID: 'cid', GOOGLE_DRIVE_CLIENT_SECRET: 'csecret-abc',
        GOOGLE_DRIVE_REFRESH_TOKEN: 'rt-secret-123',
        GOOGLE_OAUTH_TOKEN_URL: `http://127.0.0.1:${port}/token`,
        GOOGLE_DRIVE_API_BASE: `http://127.0.0.1:${port}`,
        BACKUP_KEEP: '12'
      });
      assert.equal(r.status, 0, `script failed:\n${r.stdout}\n${r.stderr}`);
      const out = r.stdout + r.stderr;
      for (const secret of ['rt-secret-123', 'csecret-abc', 'mock-access-token-xyz', new URL(DB).password]) {
        if (secret) assert.ok(!out.includes(secret), `output leaks a secret: ${out}`);
      }

      const today = new Date().toISOString().slice(0, 10);
      const uploaded = [...google.store.values()].filter((f) => f.name === `arrington-website-db-${today}.sql.gz`);
      assert.equal(uploaded.length, 1, 'exactly one dump uploaded, named by date');
      assert.deepEqual(uploaded[0].parents, [folderId], 'uploaded into the existing folder, not a new one');
      const sql = zlib.gunzipSync(uploaded[0].bytes).toString('utf8');
      assert.match(sql, /CREATE TABLE public\.content /, 'the dump defines the content table');
      assert.match(sql, /CREATE TABLE public\.leads /, 'the dump defines the leads table');
      assert.match(sql, /PostgreSQL database dump complete/, 'the dump is complete');
      assert.match(sql, /CREATE TABLE public\.session /, 'the session table\'s shape is kept');
      assert.doesNotMatch(sql, /COPY public\.session \([^)]*\) FROM stdin;\n[^\\]/, 'the session table carries no rows');
      assert.match(out, /uploaded arrington-website-db-\d{4}-\d{2}-\d{2}\.sql\.gz \(\d+ bytes\)/);
      assert.match(out, /kept the newest 12, deleted 2 older backup\(s\)/);

      const remaining = [...google.store.values()].filter((f) => f.parents && f.parents.includes(folderId));
      const remainingBackups = remaining.filter((f) => /^arrington-website-db-\d{4}-\d{2}-\d{2}\.sql\.gz$/.test(f.name));
      assert.equal(remainingBackups.length, 12, 'twelve backups remain');
      assert.ok(!google.store.has(old[0].id) && !google.store.has(old[1].id), 'the two oldest were deleted');
      assert.ok(google.store.has(old[2].id), 'the eleventh-oldest survives');
      assert.ok(google.store.has(strangerId), 'a file the script did not name is never deleted');
      assert.equal([...google.store.values()].filter((f) => f.mimeType === 'application/vnd.google-apps.folder').length, 1, 'no second folder created');
    } finally {
      await google.close();
    }
  });

test('a refused refresh token fails the run with a readable reason and no secret',
  { skip: !DB && 'set BACKUP_TEST_DATABASE_URL to a seeded database (the suite only reads it)' },
  async () => {
    const google = mockGoogle({ refreshToken: 'rt-secret-123' });
    const port = await google.listen();
    try {
      const r = await runScript({
        DATABASE_URL: DB,
        GOOGLE_DRIVE_CLIENT_ID: 'cid', GOOGLE_DRIVE_CLIENT_SECRET: 'csecret-abc',
        GOOGLE_DRIVE_REFRESH_TOKEN: 'rt-WRONG',
        GOOGLE_OAUTH_TOKEN_URL: `http://127.0.0.1:${port}/token`,
        GOOGLE_DRIVE_API_BASE: `http://127.0.0.1:${port}`
      });
      assert.notEqual(r.status, 0, 'must fail');
      assert.match(r.stderr, /Google would not issue an access token \(invalid_grant/);
      assert.match(r.stderr, /set a fresh GOOGLE_DRIVE_REFRESH_TOKEN/);
      assert.ok(!r.stderr.includes('rt-WRONG') && !r.stderr.includes('csecret-abc'));
      assert.equal(google.store.size, 0, 'nothing was created in Drive');
    } finally {
      await google.close();
    }
  });

test('a refusal from Drive is reported with Google\'s own reason',
  { skip: !DB && 'set BACKUP_TEST_DATABASE_URL to a seeded database (the suite only reads it)' },
  async () => {
    const google = mockGoogle({ refreshToken: 'rt-secret-123', driveDisabled: true });
    const port = await google.listen();
    try {
      const r = await runScript({
        DATABASE_URL: DB,
        GOOGLE_DRIVE_CLIENT_ID: 'cid', GOOGLE_DRIVE_CLIENT_SECRET: 'csecret-abc',
        GOOGLE_DRIVE_REFRESH_TOKEN: 'rt-secret-123',
        GOOGLE_OAUTH_TOKEN_URL: `http://127.0.0.1:${port}/token`,
        GOOGLE_DRIVE_API_BASE: `http://127.0.0.1:${port}`
      });
      assert.notEqual(r.status, 0, 'must fail');
      assert.match(r.stderr, /Drive refused the folder search \(Google Drive API has not been used in project 123456/);
      assert.match(r.stderr, /drive\.googleapis\.com\/overview\?project=123456/);
      for (const secret of ['rt-secret-123', 'csecret-abc', 'mock-access-token-xyz']) assert.ok(!(r.stdout + r.stderr).includes(secret));
    } finally {
      await google.close();
    }
  });

test('a missing variable is named, and a dump that is too small is refused',
  { skip: !DB && 'set BACKUP_TEST_DATABASE_URL to a seeded database (the suite only reads it)' },
  async () => {
    const missing = await runScript({ DATABASE_URL: DB, GOOGLE_DRIVE_CLIENT_ID: 'cid', GOOGLE_DRIVE_CLIENT_SECRET: 's' });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /GOOGLE_DRIVE_REFRESH_TOKEN is not set/);

    const google = mockGoogle({ refreshToken: 'rt' });
    const port = await google.listen();
    try {
      const r = await runScript({
        DATABASE_URL: DB,
        GOOGLE_DRIVE_CLIENT_ID: 'cid', GOOGLE_DRIVE_CLIENT_SECRET: 's', GOOGLE_DRIVE_REFRESH_TOKEN: 'rt',
        GOOGLE_OAUTH_TOKEN_URL: `http://127.0.0.1:${port}/token`,
        GOOGLE_DRIVE_API_BASE: `http://127.0.0.1:${port}`,
        BACKUP_MIN_BYTES: '999999999'
      });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /below BACKUP_MIN_BYTES=999999999/);
      assert.equal([...google.store.values()].filter((f) => f.mimeType === 'application/gzip').length, 0, 'nothing uploaded');
    } finally {
      await google.close();
    }
  });
